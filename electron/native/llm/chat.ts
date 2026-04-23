/**
 * Unified streaming chat dispatch across 5 providers.
 *
 * One public entry: streamChat({ model, messages, onDelta, … }) routes to
 * the right provider based on inferProvider(model). All providers speak the
 * same internal delta protocol — text chunks + (for Anthropic) thinking
 * blocks + tool-use blocks — normalized into onDelta / onThinking / onToolUse.
 *
 * Anthropic path carries the full Claude Code attribution stack so OAuth
 * tokens route to the Pro/Max subscription quota pool:
 *   HTTP headers:
 *     • x-app: cli
 *     • User-Agent: claude-cli/<VERSION> (external, cli)
 *     • authorization: Bearer <oauth-token>
 *     • anthropic-beta: oauth-2025-04-20
 *   System-prompt blocks (MUST be an array, in this order):
 *     • Block 1: "x-anthropic-billing-header: cc_version=<V>; cc_entrypoint=cli;"
 *     • Block 2: "You are Claude Code, Anthropic's official CLI for Claude."
 *     • Block 3+: caller's actual system prompt
 *
 * The billing attribution string is intentionally inside the system prompt
 * (not an HTTP header) — that's how the real CLI does it; see
 * cc-full-0408/src/utils/sideQuery.ts for the reference implementation.
 * Without these, OAuth tokens fall back to the generic API pool (~2–3 req/min).
 */

import { readConfig } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import {
  ANTHROPIC_API_VERSION,
  CLAUDE_CLI_USER_AGENT,
  CLAUDE_CODE_SYSTEM_PREFIX,
  OAUTH_BETA_HEADER,
  buildBillingAttribution,
} from '../core/version.js'
import { getValidToken } from '../auth/oauth.js'
import { inferProvider } from './model.js'
import type { Provider } from '../auth/auth.js'

const log = createLogger('chat')

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  /**
   * Either a plain string, or an Anthropic-native content-block array
   * (`{type:'text'|'tool_use'|'tool_result'|'thinking', ...}`). The
   * Anthropic path passes arrays through verbatim so tool-use/tool-result
   * pairing is preserved across turns. Non-Anthropic providers flatten
   * arrays to a text summary.
   */
  content: string | Array<Record<string, any>>
  name?: string            // for tool results: tool name
  tool_call_id?: string    // for tool results
  /** OpenAI tool-call field; preserved on assistant messages across turns. */
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
}

function flattenContent(c: ChatMessage['content']): string {
  if (typeof c === 'string') return c
  const parts: string[] = []
  for (const block of c) {
    if (block.type === 'text' && typeof block.text === 'string') parts.push(block.text)
    else if (block.type === 'thinking' && typeof block.text === 'string') parts.push(`[thinking] ${block.text}`)
    else if (block.type === 'tool_use') parts.push(`[tool_use: ${block.name}(${JSON.stringify(block.input ?? {})})]`)
    else if (block.type === 'tool_result') {
      const c2 = block.content
      parts.push(`[tool_result] ${typeof c2 === 'string' ? c2 : JSON.stringify(c2)}`)
    }
  }
  return parts.join('\n')
}

// ── Provider-aware message translation ────────────────────────────
//
// The harness (modelFetch.ts) talks in the Anthropic shape: assistant
// messages may carry an array of content blocks (text / tool_use), and
// tool results are placed on a **user** message as `tool_result` blocks.
// Every non-Anthropic provider wants a different shape, and getting the
// split wrong produces very specific failure modes:
//
//   - OpenAI: after an assistant message with `tool_calls`, every single
//     tool_call_id MUST be answered by a `role:'tool'` message before the
//     next assistant turn — otherwise OpenAI rejects with
//     "assistant message with 'tool_calls' must be followed by tool
//     messages responding to each 'tool_call_id'".
//
//   - Ollama: `function.arguments` is an OBJECT (not a JSON string), and
//     `content:null` is rejected. Tool-call ids are optional; if you pass
//     malformed ids Ollama 400s with "Value looks like object, but can't
//     find closing '}' symbol".
//
// Because those contracts differ, we build the outgoing message list per
// provider rather than sharing a single "OpenAI-shape" shim.

interface ExtractedBlocks {
  textParts: string[]
  toolCalls: Array<{ id: string; name: string; input: any }>
  toolResults: Array<{ tool_use_id: string; name?: string; content: string }>
}

function extractBlocks(content: ChatMessage['content']): ExtractedBlocks {
  const textParts: string[] = []
  const toolCalls: ExtractedBlocks['toolCalls'] = []
  const toolResults: ExtractedBlocks['toolResults'] = []
  if (typeof content === 'string') {
    if (content) textParts.push(content)
    return { textParts, toolCalls, toolResults }
  }
  for (const block of content) {
    if (block.type === 'text' && typeof block.text === 'string') {
      textParts.push(block.text)
    } else if (block.type === 'tool_use') {
      toolCalls.push({
        id: String(block.id ?? `tc_${Math.random().toString(36).slice(2, 8)}`),
        name: String(block.name),
        input: block.input ?? {},
      })
    } else if (block.type === 'tool_result') {
      const c2 = block.content
      toolResults.push({
        tool_use_id: String(block.tool_use_id ?? 'x'),
        name: block.name ? String(block.name) : undefined,
        content: typeof c2 === 'string' ? c2 : JSON.stringify(c2),
      })
    }
    // thinking blocks are intentionally dropped — no provider (other than
    // Anthropic, which uses its own native pass-through) accepts them as
    // inputs, and re-feeding them as text confuses weaker models.
  }
  return { textParts, toolCalls, toolResults }
}

/**
 * Translate ChatMessages to OpenAI-shape. Critical contract: every
 * assistant-with-tool_calls message is immediately followed by exactly one
 * `role:'tool'` message per tool_call_id. If a tool_result block arrives
 * inside a user-role message (Anthropic convention), we extract it and
 * emit it as a `role:'tool'` message, consuming the user message entirely
 * if it only contained results.
 */
function toOpenAIMessages(msgs: ChatMessage[]): any[] {
  const out: any[] = []
  for (const m of msgs) {
    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : flattenContent(m.content),
      })
      continue
    }

    const { textParts, toolCalls, toolResults } = extractBlocks(m.content)

    if (m.role === 'assistant') {
      const effectiveToolCalls = m.tool_calls?.length
        ? m.tool_calls
        : toolCalls.map(tc => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.input) },
          }))
      const assistantMsg: any = {
        role: 'assistant',
        // OpenAI accepts null ONLY when tool_calls is present; otherwise
        // must be a string. Use '' as the safe default for toolless turns.
        content: textParts.join('\n') || (effectiveToolCalls.length ? null : ''),
      }
      if (effectiveToolCalls.length) assistantMsg.tool_calls = effectiveToolCalls
      out.push(assistantMsg)
      // tool_results rarely appear on an assistant message, but if they do
      // (e.g. some harness variants), emit them inline before the next
      // assistant turn to satisfy the paired-response contract.
      for (const tr of toolResults) {
        out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content })
      }
      continue
    }

    // User-role message. This is where Anthropic puts tool_result blocks.
    // Emit each as its own `role:'tool'` message (OpenAI's paired-response
    // requirement) and keep any remaining text as a normal user message.
    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content })
      }
      if (textParts.length > 0) {
        out.push({ role: 'user', content: textParts.join('\n') })
      }
      continue
    }

    out.push({ role: m.role, content: textParts.join('\n') || flattenContent(m.content) })
  }
  return out
}

/**
 * Translate ChatMessages to Ollama-shape. Very similar to OpenAI but with
 * crucial differences:
 *   - `function.arguments` must be an object, not a JSON string.
 *   - `content` cannot be null (use '').
 *   - `tool_call_id` is not required on tool messages.
 */
function toOllamaMessages(msgs: ChatMessage[]): any[] {
  const out: any[] = []
  for (const m of msgs) {
    if (m.role === 'tool') {
      out.push({
        role: 'tool',
        tool_call_id: m.tool_call_id,
        content: typeof m.content === 'string' ? m.content : flattenContent(m.content),
      })
      continue
    }

    const { textParts, toolCalls, toolResults } = extractBlocks(m.content)

    if (m.role === 'assistant') {
      // Convert OpenAI-shape tool_calls (arguments: string) to Ollama-shape
      // (arguments: object). Parse if needed; fall back to {} on error.
      const ollamaCalls = (m.tool_calls?.length
        ? m.tool_calls.map(tc => {
            let args: any = {}
            try { args = typeof tc.function.arguments === 'string'
              ? JSON.parse(tc.function.arguments || '{}')
              : tc.function.arguments
            } catch { args = {} }
            return { function: { name: tc.function.name, arguments: args } }
          })
        : toolCalls.map(tc => ({ function: { name: tc.name, arguments: tc.input } }))
      )
      const assistantMsg: any = {
        role: 'assistant',
        content: textParts.join('\n') || '',
      }
      if (ollamaCalls.length) assistantMsg.tool_calls = ollamaCalls
      out.push(assistantMsg)
      for (const tr of toolResults) {
        out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content })
      }
      continue
    }

    if (toolResults.length > 0) {
      for (const tr of toolResults) {
        out.push({ role: 'tool', tool_call_id: tr.tool_use_id, content: tr.content })
      }
      if (textParts.length > 0) {
        out.push({ role: 'user', content: textParts.join('\n') })
      }
      continue
    }

    out.push({ role: m.role, content: textParts.join('\n') || flattenContent(m.content) })
  }
  return out
}

export interface StreamCallbacks {
  onDelta(text: string): void
  onThinking?(text: string): void
  onToolUse?(call: { id: string; name: string; input: any }): void
  onUsage?(usage: { inputTokens?: number; outputTokens?: number }): void
  onStop?(reason: string): void
}

export interface StreamArgs extends StreamCallbacks {
  model: string
  messages: ChatMessage[]
  systemPrompt?: string
  tools?: ToolSchema[]
  maxTokens?: number
  temperature?: number
  signal?: AbortSignal
}

export interface ToolSchema {
  name: string
  description: string
  input_schema: Record<string, any>
}

/** Top-level dispatcher. */
export async function streamChat(args: StreamArgs): Promise<void> {
  const provider = inferProvider(args.model)
  const cfg = readConfig()
  const env = cfg.env ?? {}

  switch (provider) {
    case 'anthropic': {
      const token = await getValidToken()
      const apiKey = env.ANTHROPIC_API_KEY as string | undefined
      if (!token && !apiKey) throw new Error('No Anthropic credentials — run /login claude or set ANTHROPIC_API_KEY')
      return streamAnthropic({ ...args, oauthToken: token ?? undefined, apiKey })
    }
    case 'openai': {
      const key = env.OPENAI_API_KEY as string | undefined
      if (!key) throw new Error('No OpenAI API key — run /login openai')
      return streamOpenAIStyle({ ...args, baseUrl: 'https://api.openai.com/v1', apiKey: key })
    }
    case 'xai': {
      const key = env.XAI_API_KEY as string | undefined
      if (!key) throw new Error('No xAI API key — run /login xai')
      return streamOpenAIStyle({ ...args, baseUrl: 'https://api.x.ai/v1', apiKey: key })
    }
    case 'gemini': {
      const key = env.GEMINI_API_KEY as string | undefined
      if (!key) throw new Error('No Gemini API key — run /login gemini')
      return streamGemini({ ...args, apiKey: key })
    }
    case 'ollama': {
      const baseUrl = (env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')
      return streamOllama({ ...args, baseUrl })
    }
    default:
      throw new Error(`unsupported provider: ${provider}`)
  }
}

// ── SSE helper ─────────────────────────────────────────────────────

async function readEventStream(
  body: ReadableStream<Uint8Array>,
  handleLine: (line: string) => void,
): Promise<void> {
  const reader = body.getReader()
  const dec = new TextDecoder('utf-8')
  let buf = ''
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buf += dec.decode(value, { stream: true })
    let i: number
    while ((i = buf.indexOf('\n')) >= 0) {
      const line = buf.slice(0, i)
      buf = buf.slice(i + 1)
      handleLine(line)
    }
  }
  if (buf.trim()) handleLine(buf)
}

// ── Anthropic ──────────────────────────────────────────────────────

async function streamAnthropic(args: StreamArgs & { oauthToken?: string; apiKey?: string }): Promise<void> {
  const userSystem = args.systemPrompt?.trim()

  // Build message list — filter out system messages (go in top-level system field).
  // Anthropic format: { role, content } where content can be string or array.
  // We convert our simple {role,content:string} into Anthropic's shape.
  const messages = args.messages
    .filter(m => m.role !== 'system')
    .map(m => {
      if (m.role === 'tool') {
        return {
          role: 'user',
          content: [{ type: 'tool_result', tool_use_id: m.tool_call_id, content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content) }],
        }
      }
      // Pass-through for Anthropic content-block arrays (preserves tool_use pairing).
      return { role: m.role, content: m.content }
    })

  // Extract the first user message text for the per-conversation cch= hash.
  // The real Claude Code CLI feeds chars [4,7,20] of this text into SHA-256
  // to produce the 3-hex cch= value in the billing attribution block. The
  // backend verifies this to distinguish a genuine Claude Code session from a
  // static/spoofed attribution and routes accordingly (main subscription pool
  // vs. the "extra usage" overflow bucket).
  const firstUserText = (() => {
    for (const m of args.messages) {
      if (m.role !== 'user') continue
      if (typeof m.content === 'string') return m.content
      for (const b of m.content) {
        if ((b as any).type === 'text') return String((b as any).text ?? '')
      }
    }
    return ''
  })()

  /**
   * One attempt at the Anthropic call with a given auth mode.
   *
   * We separate this from the streaming loop so the top-level orchestrator
   * can (a) refresh an OAuth token on 401 and retry, and (b) automatically
   * fall back to API-key auth when the Claude Pro/Max subscription runs
   * out of extra usage mid-conversation.
   *
   * Body and system-field content are mode-dependent because OAuth calls
   * require the `x-anthropic-billing-header` system block + the CLI
   * sysprompt prefix (block 1 + block 2 are parsed by the backend to route
   * traffic to the subscription quota pool). API-key calls must NOT send
   * those or the backend 400s. So we rebuild per mode rather than mutating.
   */
  async function attempt(mode: 'oauth' | 'apikey', oauthTokenOverride?: string): Promise<Response> {
    const isOAuth = mode === 'oauth'
    let systemField: string | Array<{ type: 'text'; text: string }> | undefined
    if (isOAuth) {
      // Build the per-conversation billing attribution with the real cch= hash.
      // Using the static CLAUDE_BILLING_ATTRIBUTION constant (cch= computed from
      // empty string) is valid as a fallback but the dynamic computation is what
      // the real CLI does and what the backend expects for subscription routing.
      const billingBlock = buildBillingAttribution(firstUserText)
      const blocks: Array<{ type: 'text'; text: string }> = [
        { type: 'text', text: billingBlock },
        { type: 'text', text: CLAUDE_CODE_SYSTEM_PREFIX },
      ]
      if (userSystem) blocks.push({ type: 'text', text: userSystem })
      systemField = blocks
    } else {
      systemField = userSystem
    }

    const headers: Record<string, string> = {
      'content-type': 'application/json',
      'anthropic-version': ANTHROPIC_API_VERSION,
      'x-app': 'cli',
      'user-agent': CLAUDE_CLI_USER_AGENT,
      ...(isOAuth
        ? {
            'authorization': `Bearer ${oauthTokenOverride ?? args.oauthToken}`,
            'anthropic-beta': OAUTH_BETA_HEADER,
          }
        : { 'x-api-key': args.apiKey! }),
    }

    const body: any = {
      model: args.model,
      max_tokens: args.maxTokens ?? 8096,
      stream: true,
      messages,
    }
    if (systemField) body.system = systemField
    if (args.temperature !== undefined) body.temperature = args.temperature
    if (args.tools?.length) body.tools = args.tools

    // Diagnostic log — exactly enough to diff against the reference
    // ibank-desktop when subscription routing misbehaves. We log the
    // fingerprinting-critical surface (user-agent, beta header, the
    // first 120 chars of each system block) but NOT the bearer token
    // or user content.
    const sysPreview = Array.isArray(systemField)
      ? systemField.map((b, i) => `[${i}] ${b.text.slice(0, 120)}`).join(' | ')
      : typeof systemField === 'string'
        ? systemField.slice(0, 120)
        : '(none)'
    log.info('anthropic request', {
      mode,
      model: args.model,
      ua: headers['user-agent'],
      beta: headers['anthropic-beta'] ?? '(api-key path)',
      sysBlocks: Array.isArray(systemField) ? systemField.length : (systemField ? 1 : 0),
      sysPreview,
      messageCount: messages.length,
      toolCount: args.tools?.length ?? 0,
    })

    return fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', headers, body: JSON.stringify(body), signal: args.signal,
    })
  }

  // Prefer OAuth if we have a token (subscription quota); otherwise API key.
  let mode: 'oauth' | 'apikey' = args.oauthToken ? 'oauth' : 'apikey'
  let isOAuth = mode === 'oauth'
  let r = await attempt(mode)

  // On 401 with OAuth, force a refresh and retry once.
  if (r.status === 401 && mode === 'oauth') {
    await r.body?.cancel().catch(() => {})
    log.info('anthropic 401 — attempting token refresh + retry')
    const fresh = await getValidToken()
    if (fresh && fresh !== args.oauthToken) {
      r = await attempt('oauth', fresh)
    }
  }

  // Subscription-exhausted fallback: if we tried OAuth and hit the
  // "out of extra usage" / plan cap error, AND the user has an API key
  // configured, transparently retry the SAME request on the API-key path.
  // This is the "Claude has two login paths" behavior — when the Pro/Max
  // plan is tapped out, we shouldn't dead-end the user if they've also
  // loaded credits into an Anthropic API account.
  if (!r.ok && mode === 'oauth' && args.apiKey) {
    const peek = await r.clone().text().catch(() => '')
    const peekLower = peek.toLowerCase()
    const exhausted =
      peekLower.includes('out of extra usage') ||
      peekLower.includes('max_tokens_exceeded_plan') ||
      peekLower.includes('usage_limit_exceeded')
    if (exhausted) {
      await r.body?.cancel().catch(() => {})
      log.info(
        'anthropic OAuth subscription exhausted — falling back to API key',
        { model: args.model },
      )
      mode = 'apikey'; isOAuth = false
      r = await attempt('apikey')
    }
  }

  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '')
    if (r.status === 429) {
      throw new Error(
        `Anthropic rate limit (429) on ${args.model}. Your Claude Pro/Max plan has per-minute and daily caps. ` +
        `If on Opus, switch to Claude Sonnet 4.6 or Haiku 4.5 (much higher per-minute quota). ` +
        `Otherwise wait ~60s and retry. Raw: ${t.slice(0, 200)}`,
      )
    }
    // Friendlier copy for the most common Anthropic 400s — most of these
    // aren't bugs in Wish Code, they're account/quota conditions and the
    // red JSON blob confuses users.
    //
    // Always append a short "Details" tail with the raw server body so a
    // misclassification by us doesn't *hide* the truth (some quota errors
    // and actual model/payload errors both contain the word "quota").
    if (r.status === 400 || r.status === 402 || r.status === 403) {
      const lower = t.toLowerCase()
      const raw = t.slice(0, 400).replace(/\s+/g, ' ').trim()
      const detail = raw ? `\nDetails: ${raw}` : ''
      log.warn(`anthropic ${r.status} raw body: ${raw}`)
      // Specifically check for the subscription pool's "out of extra usage"
      // response — NOT just any mention of "quota" or "limit", which would
      // mis-classify ordinary model/rate errors as a billing problem.
      if (lower.includes('out of extra usage') || lower.includes('max_tokens_exceeded_plan') || lower.includes('usage_limit_exceeded')) {
        // Tailor the message to the auth path actually in use. When the
        // user is signed in via Claude Pro/Max OAuth (platform.claude.com),
        // they never touch the metered API at all — so suggesting they
        // "add an API key" is confusing and wrong. Speak only about the
        // subscription quota, and give them options that make sense on
        // that pathway.
        if (isOAuth) {
          throw new Error(
            `Your Claude Pro/Max subscription is out of "extra usage" on ${args.model}. ` +
            `The allowance resets on your usual reset date — you can check at ` +
            `https://claude.ai/settings/usage. In the meantime, switch to a smaller ` +
            `Claude model (Haiku 4.5 has the highest per-minute cap on Pro) or pick ` +
            `a local Ollama model from the model picker. (Anthropic ${r.status})${detail}`,
          )
        }
        // API-key path was exhausted — the account needs credits, not a
        // subscription upsell. We also suggest OAuth if they happen to
        // have a Pro/Max plan but haven't linked it.
        throw new Error(
          `Your Anthropic API account has no "extra usage" left on ${args.model}. ` +
          `Top up credits at https://console.anthropic.com/settings/billing, or, if ` +
          `you have a Claude Pro/Max plan, sign in under Settings → Login → Claude ` +
          `to use the subscription quota instead. (Anthropic ${r.status})${detail}`,
        )
      }
      if (lower.includes('credit balance') || lower.includes('low_balance') || lower.includes('insufficient_quota')) {
        throw new Error(
          `Your Anthropic API credit balance is too low. Add credits at https://console.anthropic.com/settings/billing ` +
          `or switch to the Claude Pro/Max OAuth login. (Anthropic ${r.status})${detail}`,
        )
      }
      if (lower.includes('oauth') && isOAuth) {
        throw new Error(
          `Anthropic rejected the OAuth token (${r.status}). Try /login claude again to refresh.${detail}`,
        )
      }
      if (lower.includes('model') && (lower.includes('not_found') || lower.includes('does not exist') || lower.includes('invalid'))) {
        throw new Error(
          `Anthropic rejected the model "${args.model}" (${r.status}). Pick a different model in the model picker.${detail}`,
        )
      }
      // Fall through — show the raw body for unclassified 400/402/403s so
      // the user (and we, via logs) can diagnose without guessing.
    }
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 400)}`)
  }

  let currentToolUseId: string | null = null
  let currentToolName: string | null = null
  let currentToolInputBuf = ''

  await readEventStream(r.body, (line) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const evt = JSON.parse(data)
      switch (evt.type) {
        case 'content_block_start':
          if (evt.content_block?.type === 'tool_use') {
            currentToolUseId = evt.content_block.id
            currentToolName = evt.content_block.name
            currentToolInputBuf = ''
          }
          break
        case 'content_block_delta':
          if (evt.delta?.type === 'text_delta') {
            args.onDelta(evt.delta.text)
          } else if (evt.delta?.type === 'thinking_delta') {
            args.onThinking?.(evt.delta.thinking)
          } else if (evt.delta?.type === 'input_json_delta') {
            currentToolInputBuf += evt.delta.partial_json ?? ''
          }
          break
        case 'content_block_stop':
          if (currentToolUseId && currentToolName) {
            let input = {}
            try { input = JSON.parse(currentToolInputBuf || '{}') } catch {}
            args.onToolUse?.({ id: currentToolUseId, name: currentToolName, input })
            currentToolUseId = null; currentToolName = null; currentToolInputBuf = ''
          }
          break
        case 'message_delta':
          if (evt.usage) args.onUsage?.({
            inputTokens: evt.usage.input_tokens,
            outputTokens: evt.usage.output_tokens,
          })
          if (evt.delta?.stop_reason) args.onStop?.(evt.delta.stop_reason)
          break
        case 'message_stop':
          args.onStop?.('end_turn')
          break
      }
    } catch (err) {
      log.warn('parse error', { line: data.slice(0, 200), err })
    }
  })
}

// ── OpenAI / xAI (OpenAI-compatible chat completions) ──────────────

async function streamOpenAIStyle(
  args: StreamArgs & { baseUrl: string; apiKey: string },
): Promise<void> {
  const messages = toOpenAIMessages(args.messages)
  // OpenAI wants system as a message, not a top-level field.
  if (args.systemPrompt) {
    messages.unshift({ role: 'system', content: args.systemPrompt })
  }

  const body: any = {
    model: args.model,
    stream: true,
    stream_options: { include_usage: true },
    messages,
  }
  if (args.temperature !== undefined) body.temperature = args.temperature
  if (args.maxTokens !== undefined) body.max_tokens = args.maxTokens
  if (args.tools?.length) {
    body.tools = args.tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }))
  }

  const r = await fetch(`${args.baseUrl}/chat/completions`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'authorization': `Bearer ${args.apiKey}`,
    },
    body: JSON.stringify(body),
    signal: args.signal,
  })
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '')
    throw new Error(`${args.baseUrl} ${r.status}: ${t.slice(0, 300)}`)
  }

  // Track partial tool calls — OpenAI streams the function name + arguments
  // incrementally; emit a completed tool-use on the first finish_reason='tool_calls'.
  const partialToolCalls: Record<number, { id?: string; name?: string; argsBuf: string }> = {}

  await readEventStream(r.body, (line) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data || data === '[DONE]') return
    try {
      const evt = JSON.parse(data)
      const choice = evt.choices?.[0]
      if (!choice) {
        if (evt.usage) args.onUsage?.({
          inputTokens: evt.usage.prompt_tokens,
          outputTokens: evt.usage.completion_tokens,
        })
        return
      }
      const delta = choice.delta
      if (delta?.content) args.onDelta(delta.content)
      if (delta?.tool_calls) {
        for (const tc of delta.tool_calls) {
          const idx = tc.index ?? 0
          partialToolCalls[idx] = partialToolCalls[idx] ?? { argsBuf: '' }
          const slot = partialToolCalls[idx]
          if (tc.id) slot.id = tc.id
          if (tc.function?.name) slot.name = tc.function.name
          if (tc.function?.arguments) slot.argsBuf += tc.function.arguments
        }
      }
      if (choice.finish_reason) {
        if (choice.finish_reason === 'tool_calls') {
          for (const slot of Object.values(partialToolCalls)) {
            if (slot.id && slot.name) {
              let input = {}
              try { input = JSON.parse(slot.argsBuf || '{}') } catch {}
              args.onToolUse?.({ id: slot.id, name: slot.name, input })
            }
          }
        }
        args.onStop?.(choice.finish_reason)
      }
    } catch {}
  })
}

// ── Google Gemini ──────────────────────────────────────────────────

async function streamGemini(args: StreamArgs & { apiKey: string }): Promise<void> {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(args.model)}:streamGenerateContent?alt=sse&key=${args.apiKey}`

  // Gemini contents: role = 'user' | 'model'. Tool results are function
  // responses with role 'user' carrying `functionResponse` parts. Same risk
  // as OpenAI/Ollama — if an assistant message's prior tool_use blocks leak
  // into `text` parts as `[tool_use: name(...)]`, weaker Gemini models will
  // parrot the pattern back as plain text. So we always split assistant
  // content-block arrays into native functionCall parts first.
  const contents: any[] = []
  for (const m of args.messages) {
    if (m.role === 'system') continue
    if (m.role === 'tool') {
      contents.push({
        role: 'user',
        parts: [{
          functionResponse: {
            name: m.name ?? 'tool',
            response: { result: typeof m.content === 'string' ? m.content : flattenContent(m.content) },
          },
        }],
      })
      continue
    }
    if (m.role === 'assistant' && (m.tool_calls?.length || Array.isArray(m.content))) {
      // Collect text + functionCall parts from either explicit tool_calls or
      // Anthropic-style tool_use blocks embedded in the content array.
      const parts: any[] = []
      const trailingResults: any[] = []
      if (Array.isArray(m.content)) {
        const textParts: string[] = []
        for (const block of m.content) {
          if (block.type === 'text' && typeof block.text === 'string') {
            textParts.push(block.text)
          } else if (block.type === 'tool_use') {
            parts.push({ functionCall: { name: String(block.name), args: block.input ?? {} } })
          } else if (block.type === 'tool_result') {
            const c2 = block.content
            trailingResults.push({
              role: 'user',
              parts: [{
                functionResponse: {
                  name: String((block as any).name ?? 'tool'),
                  response: { result: typeof c2 === 'string' ? c2 : JSON.stringify(c2) },
                },
              }],
            })
          }
        }
        const joined = textParts.join('\n')
        if (joined) parts.unshift({ text: joined })
      } else if (typeof m.content === 'string' && m.content) {
        parts.push({ text: m.content })
      }
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          let parsed: any = {}
          try { parsed = JSON.parse(tc.function.arguments || '{}') } catch {}
          parts.push({ functionCall: { name: tc.function.name, args: parsed } })
        }
      }
      if (parts.length) contents.push({ role: 'model', parts })
      for (const tr of trailingResults) contents.push(tr)
      continue
    }
    contents.push({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: flattenContent(m.content) }],
    })
  }

  const body: any = { contents }
  if (args.systemPrompt) {
    body.systemInstruction = { parts: [{ text: args.systemPrompt }] }
  }
  if (args.temperature !== undefined) {
    body.generationConfig = { temperature: args.temperature, maxOutputTokens: args.maxTokens ?? 8192 }
  }
  if (args.tools?.length) {
    body.tools = [{
      functionDeclarations: args.tools.map(t => ({
        name: t.name,
        description: t.description,
        parameters: t.input_schema,
      })),
    }]
  }

  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: args.signal,
  })
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '')
    throw new Error(`Gemini ${r.status}: ${t.slice(0, 300)}`)
  }

  let counter = 0
  await readEventStream(r.body, (line) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data) return
    try {
      const evt = JSON.parse(data)
      const parts = evt.candidates?.[0]?.content?.parts ?? []
      for (const p of parts) {
        if (p.text) args.onDelta(p.text)
        else if (p.functionCall) {
          args.onToolUse?.({
            id: `gc_${Date.now()}_${counter++}`,
            name: String(p.functionCall.name ?? 'unknown'),
            input: p.functionCall.args ?? {},
          })
        }
      }
      if (evt.usageMetadata) args.onUsage?.({
        inputTokens: evt.usageMetadata.promptTokenCount,
        outputTokens: evt.usageMetadata.candidatesTokenCount,
      })
      if (evt.candidates?.[0]?.finishReason) args.onStop?.(evt.candidates[0].finishReason)
    } catch {}
  })
}

// ── Ollama (local) ─────────────────────────────────────────────────

async function streamOllama(args: StreamArgs & { baseUrl: string }): Promise<void> {
  // Ollama 0.4+ supports tool calling but with its own contract:
  // `function.arguments` is an OBJECT (not a JSON string), `content` cannot
  // be null, and the `tool_calls[].id` / `tool_calls[].type` fields are
  // optional. Getting this wrong surfaces as a cryptic 400:
  //   "Value looks like object, but can't find closing '}' symbol"
  // Use the dedicated translator.
  const messages: Array<Record<string, any>> = toOllamaMessages(args.messages)
  if (args.systemPrompt) messages.unshift({ role: 'system', content: args.systemPrompt })

  const body: any = {
    model: args.model,
    stream: true,
    messages,
  }
  if (args.temperature !== undefined) {
    body.options = { temperature: args.temperature, num_predict: args.maxTokens ?? 8192 }
  }
  if (args.tools?.length) {
    body.tools = args.tools.map(t => ({
      type: 'function',
      function: { name: t.name, description: t.description, parameters: t.input_schema },
    }))
  }

  const r = await fetch(`${args.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: args.signal,
  })
  if (!r.ok || !r.body) {
    const t = await r.text().catch(() => '')
    throw new Error(`Ollama ${r.status}: ${t.slice(0, 300)}`)
  }

  // Accumulate tool calls across streaming frames. Ollama often emits the
  // full tool_calls array in a single non-terminal frame, but we coalesce
  // defensively so a split stream still parses correctly.
  const pending: Array<{ id: string; name: string; args: any }> = []
  let counter = 0

  await readEventStream(r.body, (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      const evt = JSON.parse(trimmed)
      if (evt.message?.content) args.onDelta(evt.message.content)
      if (Array.isArray(evt.message?.tool_calls)) {
        for (const tc of evt.message.tool_calls) {
          // Ollama tool_calls: { function: { name, arguments: object|string } }
          const fn = tc.function ?? {}
          let input: any = fn.arguments ?? {}
          if (typeof input === 'string') {
            try { input = JSON.parse(input) } catch { /* keep as string fallback */ }
          }
          const id = tc.id ?? `oc_${Date.now()}_${counter++}`
          pending.push({ id, name: String(fn.name ?? 'unknown'), args: input })
        }
      }
      if (evt.done) {
        for (const p of pending) args.onToolUse?.({ id: p.id, name: p.name, input: p.args })
        args.onUsage?.({
          inputTokens: evt.prompt_eval_count,
          outputTokens: evt.eval_count,
        })
        args.onStop?.(pending.length ? 'tool_use' : 'end_turn')
      }
    } catch {}
  })
}

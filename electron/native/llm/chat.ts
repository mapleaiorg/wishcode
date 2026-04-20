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
  CLAUDE_BILLING_ATTRIBUTION,
  CLAUDE_CLI_USER_AGENT,
  CLAUDE_CODE_SYSTEM_PREFIX,
  OAUTH_BETA_HEADER,
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
  const isOAuth = !!args.oauthToken
  const userSystem = args.systemPrompt?.trim()

  /**
   * Assemble the system prompt.
   *
   * On OAuth we MUST build an ARRAY of text blocks in this exact order:
   *   1. billing-attribution block  ("x-anthropic-billing-header: cc_version=...")
   *   2. CLI sysprompt prefix       ("You are Claude Code, Anthropic's…")
   *   3. caller's system prompt     (optional)
   *
   * The backend parses block 1 to route traffic to the Pro/Max subscription
   * quota pool. If it's joined with block 2 into a single string, the parser
   * rejects it and you fall back to the generic API pool (~2–3 req/min, 429s).
   *
   * On API-key auth, a plain string is fine.
   */
  let systemField: string | Array<{ type: 'text'; text: string }> | undefined
  if (isOAuth) {
    const blocks: Array<{ type: 'text'; text: string }> = [
      { type: 'text', text: CLAUDE_BILLING_ATTRIBUTION },
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
          'authorization': `Bearer ${args.oauthToken}`,
          'anthropic-beta': OAUTH_BETA_HEADER,
        }
      : { 'x-api-key': args.apiKey! }),
  }

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

  const body: any = {
    model: args.model,
    max_tokens: args.maxTokens ?? 8096,
    stream: true,
    messages,
  }
  if (systemField) body.system = systemField
  if (args.temperature !== undefined) body.temperature = args.temperature
  if (args.tools?.length) body.tools = args.tools

  const doFetch = (hdr: Record<string, string>, bod: any) => fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST', headers: hdr, body: JSON.stringify(bod), signal: args.signal,
  })

  let r = await doFetch(headers, body)

  // On 401 with OAuth, force a refresh and retry once.
  if (r.status === 401 && isOAuth) {
    await r.body?.cancel().catch(() => {})
    log.info('anthropic 401 — attempting token refresh + retry')
    const fresh = await getValidToken()
    if (fresh && fresh !== args.oauthToken) {
      headers['authorization'] = `Bearer ${fresh}`
      r = await doFetch(headers, body)
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
    throw new Error(`Anthropic ${r.status}: ${t.slice(0, 300)}`)
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
  const messages = args.messages.map(m => {
    const textContent = flattenContent(m.content)
    if (m.role === 'tool') {
      return { role: 'tool' as const, tool_call_id: m.tool_call_id, content: textContent }
    }
    const out: any = { role: m.role, content: textContent }
    if (m.role === 'assistant' && m.tool_calls?.length) out.tool_calls = m.tool_calls
    return out
  })
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
  const contents = args.messages
    .filter(m => m.role !== 'system' && m.role !== 'tool')
    .map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: flattenContent(m.content) }] }))
  const body: any = { contents }
  if (args.systemPrompt) {
    body.systemInstruction = { parts: [{ text: args.systemPrompt }] }
  }
  if (args.temperature !== undefined) {
    body.generationConfig = { temperature: args.temperature, maxOutputTokens: args.maxTokens ?? 8192 }
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

  await readEventStream(r.body, (line) => {
    if (!line.startsWith('data:')) return
    const data = line.slice(5).trim()
    if (!data) return
    try {
      const evt = JSON.parse(data)
      const parts = evt.candidates?.[0]?.content?.parts ?? []
      for (const p of parts) if (p.text) args.onDelta(p.text)
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
  const messages = args.messages
    .filter(m => m.role !== 'tool')
    .map(m => ({ role: m.role, content: flattenContent(m.content) }))
  if (args.systemPrompt) messages.unshift({ role: 'system', content: args.systemPrompt })

  const body: any = {
    model: args.model,
    stream: true,
    messages,
  }
  if (args.temperature !== undefined) {
    body.options = { temperature: args.temperature, num_predict: args.maxTokens ?? 8192 }
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

  // Ollama streams newline-delimited JSON (not SSE).
  await readEventStream(r.body, (line) => {
    const trimmed = line.trim()
    if (!trimmed) return
    try {
      const evt = JSON.parse(trimmed)
      if (evt.message?.content) args.onDelta(evt.message.content)
      if (evt.done) {
        args.onUsage?.({
          inputTokens: evt.prompt_eval_count,
          outputTokens: evt.eval_count,
        })
        args.onStop?.('end_turn')
      }
    } catch {}
  })
}

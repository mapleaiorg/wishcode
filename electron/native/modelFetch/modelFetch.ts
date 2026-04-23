/**
 * ModelFetch — the LLM turn-loop central brain (formerly QueryEngine).
 *
 * One `fetchModel()` call is driven per user turn. It:
 *   1. Assembles the system prompt (CC prefix + skills block + memory block
 *      + plan mode + financial-buddy persona + user prefs).
 *   2. Streams the completion via `streamChat` (llm/chat.ts callback API).
 *   3. On tool_use, dispatches the registered tool handler, appends the
 *      tool_result as a next-turn message, and loops back to (2).
 *   4. On final text, persists the assistant turn to the transcript and
 *      emits `chat.done`.
 *   5. Compacts the transcript when token estimate exceeds COMPACT_AT_TOKENS.
 *
 * Streaming progress is fan-out to the renderer via `emit('chat.*')`.
 */

import { createLogger } from '../core/logger.js'
import { emit } from '../core/events.js'
import { readConfig } from '../core/config.js'
import { WISH_VERSION, CLAUDE_CODE_SYSTEM_PREFIX } from '../core/version.js'
import {
  appendMessage,
  appendEvent,
  readTranscript,
  compactTranscript,
  type ContentBlock,
  type TranscriptEvent,
} from '../session/transcript.js'
import { buildMemoryBlock } from '../memory/memdir.js'
import { loadSkills, matchSkills, buildSkillsBlock, type Skill } from '../skills/registry.js'
import { blackboardSystemBlock } from '../blackboard/blackboard.js'
import { personaSystemBlock } from '../personas/registry.js'
import { wikiSystemBlock } from '../wiki/wiki.js'
import { streamChat, type ChatMessage, type ToolSchema as ChatToolSchema } from '../llm/chat.js'
import { currentModel } from '../llm/model.js'
import {
  adaptToolsForModel,
  capabilityPromptAddendum,
  getCapability,
} from '../llm/capability.js'
import {
  anthropicTools,
  toolByName,
  type Permission,
} from '../tools/registry.js'
import { runHooks } from '../hooks/runner.js'
// financial buddies removed in WishCode — replaced by generic coding persona

const log = createLogger('modelFetch')

const MAX_TOOL_ITERATIONS = 20
const COMPACT_AT_TOKENS = 140_000
const COMPACT_KEEP_RECENT = 12
const ANTHROPIC_LEAN_TOOL_ALLOWLIST = new Set([
  'fs_glob',
  'fs_read',
  'fs_grep',
  'fs_edit',
  'fs_write',
  'shell_bash',
  'web_fetch',
  'web_search',
  'todo_write',
  'ask_user_question',
  'wiki_read',
  'memory_recall',
])

// ---------------------------------------------------------------------------

export interface FetchOptions {
  sessionId: string
  requestId: string
  userText: string
  permission?: Permission
  /** Optional persona id (coder/architect/reviewer/sre/security/researcher/scribe). */
  persona?: string
  abort?: AbortSignal
}

export interface FetchResult {
  stopReason: 'end_turn' | 'tool_error' | 'max_iterations' | 'aborted' | 'error'
  turns: number
  lastTextLength: number
  error?: string
}

// ---------------------------------------------------------------------------

/**
 * Fetch one user-turn worth of assistant output from the current model,
 * running the tool-use loop to completion.
 *
 * Back-compat alias `run` is exported below so existing callers keep working.
 */
export async function fetchModel(opts: FetchOptions): Promise<FetchResult> {
  const { sessionId, requestId, userText, abort } = opts
  const permission = opts.permission ?? 'auto'

  // UserPromptSubmit hook — can block the turn or inject extra context.
  const userHook = await runHooks('UserPromptSubmit', 'user_prompt', { sessionId, userText }).catch((e) => {
    log.warn('UserPromptSubmit hook error', { err: (e as Error).message })
    return {} as Awaited<ReturnType<typeof runHooks>>
  })
  if (userHook.blocked) {
    emit('chat.error', { requestId, error: userHook.reason ?? 'blocked by hook' })
    return { stopReason: 'error', turns: 0, lastTextLength: 0, error: userHook.reason }
  }

  // Detect mid-session model switch — compare against the most recent
  // assistant turn's model. If different, write a transcript marker so the
  // history is unambiguous and inject a system-note the new model sees on
  // its very first turn (prior tool_use blocks may reference tools/formats
  // the new provider can't replay, so we flag the handoff explicitly).
  const priorEvents = await readTranscript(sessionId)
  const model = currentModel()
  let modelSwitchNote: string | undefined
  for (let i = priorEvents.length - 1; i >= 0; i--) {
    const ev = priorEvents[i]
    if (ev.kind !== 'message' || ev.role !== 'assistant') continue
    const prevModel = (ev as any).model as string | undefined
    const prevProvider = (ev as any).provider as string | undefined
    if (prevModel && (prevModel !== model.model || prevProvider !== model.provider)) {
      await appendEvent(sessionId, {
        kind: 'marker',
        label: 'model.changed',
        data: {
          from: { model: prevModel, provider: prevProvider },
          to:   { model: model.model, provider: model.provider },
        },
      } as any)
      modelSwitchNote =
        `[Model switched mid-session] Prior turns ran on ` +
        `${prevProvider}/${prevModel}; you are now ${model.provider}/${model.model}. ` +
        `Treat earlier tool_use blocks as historical context only. ` +
        `If prior context doesn't apply cleanly to your capabilities, say so briefly ` +
        `and ask the user whether to start fresh.`
      log.info('model switch detected', {
        sessionId,
        from: `${prevProvider}/${prevModel}`,
        to: `${model.provider}/${model.model}`,
      })
    }
    break
  }

  await appendMessage(sessionId, 'user', [{ type: 'text', text: userText }])

  const allSkills = await loadSkills()
  const matchedSkills = matchSkills(userText, allSkills)
  log.info('turn start', {
    sessionId,
    matched: matchedSkills.map((s) => s.name),
    userLen: userText.length,
  })

  // Resolve the model's capability tier up front — it gates both tool
  // selection (below) and a small system-prompt addendum (weaker models
  // need firmer anti-parrot reminders; frontier models don't).
  const capability = getCapability(model.provider, model.model)
  log.info('capability resolved', {
    model: model.model,
    tier: capability.tier,
    family: capability.family,
    paramsB: capability.paramsB,
  })

  let systemPrompt = await buildSystemPrompt(matchedSkills, userText, opts.persona, sessionId)
  const capAddendum = capabilityPromptAddendum(capability, `${model.provider}/${model.model}`)
  if (capAddendum) systemPrompt += capAddendum
  if (userHook.systemMessage) {
    systemPrompt += '\n\n## Hook-injected context\n' + userHook.systemMessage
  }
  if (modelSwitchNote) {
    systemPrompt += '\n\n## Session continuity\n' + modelSwitchNote
  }

  // Per-model tool set. Tiny models get `undefined` (skip sending any
  // tools array at all so the model doesn't attempt the protocol it
  // cannot follow). Small/medium get a filtered + schema-pruned subset.
  // Large gets the full registry.
  const toolsForThisModel = (() => {
    const adapted = adaptToolsForModel(anthropicTools(), capability)
    if (capability.tier === 'tiny' || adapted.length === 0) return undefined
    return adapted
  })()
  log.info('tools for model', {
    tier: capability.tier,
    count: toolsForThisModel?.length ?? 0,
  })

  const authCfg = readConfig()
  const oauthOnlyAnthropic =
    model.provider === 'anthropic' &&
    !!authCfg.claudeAiOauth &&
    !(authCfg.env ?? {}).ANTHROPIC_API_KEY
  const preferLeanAnthropic =
    oauthOnlyAnthropic &&
    (systemPrompt.length > 2400 || (toolsForThisModel?.length ?? 0) > 12)
  const initialSystemPrompt = preferLeanAnthropic
    ? buildLeanSystemPrompt(matchedSkills, opts.persona)
    : systemPrompt
  const initialToolsForThisModel = preferLeanAnthropic
    ? buildLeanAnthropicTools(toolsForThisModel)
    : toolsForThisModel
  if (preferLeanAnthropic) {
    log.info('using lean anthropic request path', {
      model: model.model,
      promptChars: initialSystemPrompt.length,
      toolCount: initialToolsForThisModel?.length ?? 0,
    })
  }

  let events = await readTranscript(sessionId)
  if (estimateTokens(events) > COMPACT_AT_TOKENS) {
    emit('query.status', { requestId, phase: 'compacting' })
    const res = await compactTranscript(sessionId, { keepRecent: COMPACT_KEEP_RECENT })
    log.info('compacted', res)
    events = await readTranscript(sessionId)
  }
  const messages: ChatMessage[] = transcriptToChatMessages(events)

  emit('query.status', { requestId, phase: 'thinking', model: model.model })

  let turns = 0
  let lastTextLength = 0

  while (true) {
    if (abort?.aborted) {
      emit('chat.error', { requestId, error: 'aborted' })
      return { stopReason: 'aborted', turns, lastTextLength }
    }
    if (turns >= MAX_TOOL_ITERATIONS) {
      emit('chat.error', { requestId, error: 'max tool iterations reached' })
      return { stopReason: 'max_iterations', turns, lastTextLength }
    }
    turns++

    let streamedText = ''
    let streamedThinking = ''
    const toolUses: Array<{ id: string; name: string; input: any }> = []
    let turnUsage: { inputTokens?: number; outputTokens?: number } | undefined
    let turnStopReason: string | undefined

    const runStreamAttempt = async (
      prompt: string,
      tools: ChatToolSchema[] | undefined,
      mode: 'default' | 'lean',
    ): Promise<void> => {
      streamedText = ''
      streamedThinking = ''
      toolUses.length = 0
      turnUsage = undefined
      turnStopReason = undefined
      if (mode === 'lean') {
        log.info('starting anthropic turn in lean mode', {
          sessionId,
          requestId,
          model: model.model,
          promptChars: prompt.length,
          toolCount: tools?.length ?? 0,
        })
      }
      await streamChat({
        model: model.model,
        messages,
        systemPrompt: prompt,
        // Per-model tool set. chat.ts translates the Anthropic-shaped
        // schema into OpenAI/Gemini/Ollama formats. `toolsForThisModel`
        // is undefined for tiny models (they're sent no tools at all) and
        // a filtered + schema-pruned subset for small/medium. See
        // llm/capability.ts for the tier rules.
        tools,
        signal: abort,
        onDelta(text) {
          streamedText += text
          emit('chat.delta', { requestId, text })
        },
        onThinking(text) {
          streamedThinking += text
          emit('chat.thinking', { requestId, text })
        },
        onToolUse(call) {
          toolUses.push(call)
          emit('chat.toolUse', { requestId, phase: 'start', id: call.id, name: call.name, input: call.input })
        },
        onUsage(u) { turnUsage = u },
        onStop(reason) { turnStopReason = reason },
      })
    }

    try {
      await runStreamAttempt(initialSystemPrompt, initialToolsForThisModel, preferLeanAnthropic ? 'lean' : 'default')
    } catch (err) {
      const msg = (err as Error).message
      const shouldLeanRetry =
        !preferLeanAnthropic &&
        model.provider === 'anthropic' &&
        isAnthropicExtraUsageError(msg) &&
        (systemPrompt.length > 2400 || (toolsForThisModel?.length ?? 0) > 12)
      if (shouldLeanRetry) {
        const leanSystemPrompt = buildLeanSystemPrompt(matchedSkills, opts.persona)
        const leanTools = buildLeanAnthropicTools(toolsForThisModel)
        try {
          await runStreamAttempt(leanSystemPrompt, leanTools, 'lean')
        } catch (leanErr) {
          const leanMsg = (leanErr as Error).message
          log.error('lean anthropic retry failed', { err: leanMsg })
          emit('chat.error', { requestId, error: leanMsg })
          return { stopReason: 'error', turns, lastTextLength, error: leanMsg }
        }
      } else {
        log.error('stream failed', { err: msg })
        emit('chat.error', { requestId, error: msg })
        return { stopReason: 'error', turns, lastTextLength, error: msg }
      }
    }

    // Rescue: weaker models (gpt-4o-mini, small Ollama, etc.) occasionally
    // ignore the tools schema and emit a tool call as literal text. Parse
    // the most common wire shapes out of `streamedText`, promote them to
    // real tool_uses, and strip them from the text so the user doesn't see
    // the raw syntax. Only runs when the provider produced zero native
    // tool_uses — if even one native call came through, we trust the
    // stream as-is.
    if (toolUses.length === 0 && streamedText) {
      const { cleanedText, rescued } = extractInlineToolCalls(streamedText)
      if (rescued.length > 0) {
        log.info(`rescued ${rescued.length} inline tool call(s) from text output`)
        streamedText = cleanedText
        for (const r of rescued) toolUses.push(r)
      }
    }

    const assistantBlocks: ContentBlock[] = []
    if (streamedThinking) assistantBlocks.push({ type: 'thinking', text: streamedThinking })
    if (streamedText) assistantBlocks.push({ type: 'text', text: streamedText })
    for (const u of toolUses) {
      assistantBlocks.push({ type: 'tool_use', id: u.id, name: u.name, input: u.input })
    }

    await appendMessage(sessionId, 'assistant', assistantBlocks, {
      model: model.model,
      provider: model.provider,
      usage: turnUsage,
      stopReason: turnStopReason,
    })

    messages.push({
      role: 'assistant',
      content: assistantBlocks as Array<Record<string, any>>,
    })

    if (toolUses.length === 0) {
      lastTextLength = streamedText.length
      // Stop hook — fire-and-forget; output is logged but not injected, since the turn is over.
      runHooks('Stop', 'end_turn', {
        sessionId,
        requestId,
        text: streamedText,
        usage: turnUsage,
      }).catch((e) => log.warn('Stop hook error', { err: (e as Error).message }))
      emit('chat.done', {
        requestId,
        usage: turnUsage,
        stopReason: turnStopReason ?? 'end_turn',
      })
      return { stopReason: 'end_turn', turns, lastTextLength }
    }

    const resultBlocks: ContentBlock[] = []
    for (const use of toolUses) {
      const dispatched = await dispatchTool(use, { sessionId, requestId, permission, signal: abort })
      const serialized = typeof dispatched.content === 'string'
        ? dispatched.content
        : JSON.stringify(dispatched.content)
      resultBlocks.push({
        type: 'tool_result',
        tool_use_id: use.id,
        content: serialized,
        is_error: dispatched.isError,
      })
      emit('chat.toolResult', { requestId, name: use.name, result: dispatched.content })
    }

    await appendMessage(sessionId, 'user', resultBlocks)
    messages.push({
      role: 'user',
      content: resultBlocks as Array<Record<string, any>>,
    })
  }
}

/** Back-compat alias — keep the old name resolvable. */
export const run = fetchModel

// ---------------------------------------------------------------------------

async function dispatchTool(
  use: { id: string; name: string; input: any },
  ctx: { sessionId: string; requestId: string; permission: Permission; signal?: AbortSignal },
): Promise<{ content: unknown; isError: boolean }> {
  const tool = toolByName(use.name)
  if (!tool) return { content: `unknown tool: ${use.name}`, isError: true }

  // PreToolUse hook — can block the call outright.
  const pre = await runHooks('PreToolUse', use.name, {
    tool: use.name, input: use.input, sessionId: ctx.sessionId,
  }).catch((e) => {
    log.warn('PreToolUse hook error', { err: (e as Error).message })
    return {} as Awaited<ReturnType<typeof runHooks>>
  })
  if (pre.blocked) {
    return {
      content: `Blocked by hook: ${pre.reason ?? use.name + ' rejected'}`,
      isError: true,
    }
  }

  let content: unknown
  let isError = false
  try {
    content = await tool.handler(use.input, {
      sessionId: ctx.sessionId,
      requestId: ctx.requestId,
      permission: ctx.permission,
      signal: ctx.signal,
    })
  } catch (err) {
    const msg = (err as Error).message
    log.warn('tool failed', { tool: use.name, err: msg })
    content = `Error running ${use.name}: ${msg}`
    isError = true
  }

  // PostToolUse hook — stdout gets appended to the tool_result so the model sees it.
  const post = await runHooks('PostToolUse', use.name, {
    tool: use.name, input: use.input, output: content, isError, sessionId: ctx.sessionId,
  }).catch((e) => {
    log.warn('PostToolUse hook error', { err: (e as Error).message })
    return {} as Awaited<ReturnType<typeof runHooks>>
  })
  if (post.systemMessage) {
    const suffix = `\n\n[hook] ${post.systemMessage}`
    content = typeof content === 'string' ? content + suffix : { ...(content as any), _hook: post.systemMessage }
  }
  return { content, isError }
}

// ---------------------------------------------------------------------------

async function buildSystemPrompt(
  matchedSkills: Skill[],
  userText: string,
  personaId?: string,
  sessionId?: string,
): Promise<string> {
  const cfg = readConfig()
  const parts: string[] = []

  parts.push(
    '## Identity\n' +
      'You are Wish Code, a desktop AI coding agent. Do not present yourself as Claude Code ' +
      'or by the backend model name unless the user explicitly asks which model is active.',
  )

  parts.push(
    '\n## About Wish Code\n' +
      `You are running inside Wish Code Desktop ${WISH_VERSION}. You can inspect files, edit code, ` +
      'run shell commands, use MCP integrations, keep long-term memory, read a project wiki, share ' +
      'structured session notes via a blackboard, and hand work to specialist sub-agents.\n\n' +
      '**Grounding rules**\n' +
      '- Read before you describe. Do not claim facts about files, folders, dependencies, or command output until a tool has shown them this turn.\n' +
      '- For unfamiliar projects, inspect broadly first (`fs_glob`, `fs_read`, `fs_grep`, or `shell_bash`) and avoid language-specific assumptions.\n' +
      '- Use the native tool-calling channel only. Never print tool-call syntax as prose.\n' +
      '- If a path, command, or search result is missing, say so plainly instead of inventing details.\n' +
      '- Before editing, read the target file. Before risky shell commands, confirm with the user.\n\n' +
      '**Output formatting rules**\n' +
      '- Use rich markdown when it improves clarity: tables for comparisons, fenced code blocks for commands or code, and links for file references.\n' +
      '- Prefer concise, structured answers. No filler; no "great question".\n' +
      '- When referencing specific functions or code, include file_path:line_number.',
  )

  if (cfg.planMode) {
    parts.push(
      '\n## Plan mode is active\n' +
        'Before executing any irreversible action (file writes, shell commands), ' +
        'present the full plan and ask for confirmation. Read-only tools may run immediately.',
    )
  }

  const personaBlock = personaSystemBlock(personaId)
  if (personaBlock) parts.push('\n' + personaBlock)

  if (matchedSkills.length > 0) {
    parts.push('\n' + buildSkillsBlock(matchedSkills))
  }

  const memBlock = await buildMemoryBlock(userText, 5)
  if (memBlock) parts.push('\n' + memBlock)

  // Project wiki — Karpathy-style durable project memory (WISH.md).
  const wikiBlock = wikiSystemBlock()
  if (wikiBlock) parts.push('\n' + wikiBlock)

  // Session blackboard — cross-agent working memory for this session.
  if (sessionId) {
    const bbBlock = blackboardSystemBlock(sessionId)
    if (bbBlock) parts.push('\n' + bbBlock)
  }

  const userPrefs = cfg.systemPromptAppend
  if (typeof userPrefs === 'string' && userPrefs.trim()) {
    parts.push('\n## User preferences\n' + userPrefs.trim())
  }

  return parts.join('\n')
}

function buildLeanSystemPrompt(
  matchedSkills: Skill[],
  personaId?: string,
): string {
  const cfg = readConfig()
  const parts: string[] = []

  parts.push(
    '## Identity\n' +
      'You are Wish Code, a desktop AI coding agent. Do not refer to yourself as Claude Code ' +
      'unless the user explicitly asks which backend is active.',
  )

  parts.push(
    '\n## Lean Claude mode\n' +
      `You are running inside Wish Code Desktop ${WISH_VERSION}. Claude OAuth is sensitive to oversized ` +
      'agent prompts, so stay compact and rely on the native tool schemas instead of re-explaining them.\n' +
      '- Use tools before making claims about the workspace.\n' +
      '- Prefer core coding tools first: file read/glob/grep, edit/write, shell, web fetch/search.\n' +
      '- Never print tool-call syntax as plain text.\n' +
      '- Keep replies concise and grounded in observed output.',
  )

  const personaBlock = personaSystemBlock(personaId)
  if (personaBlock) parts.push('\n' + personaBlock)

  if (matchedSkills.length > 0) {
    const skillHints = matchedSkills
      .map((skill) => `- ${skill.title}: ${skill.description}`)
      .join('\n')
    if (skillHints) parts.push('\n## Matched skills\n' + skillHints)
  }

  const userPrefs = cfg.systemPromptAppend
  if (typeof userPrefs === 'string' && userPrefs.trim()) {
    parts.push('\n## User preferences\n' + userPrefs.trim())
  }

  return parts.join('\n')
}

function buildLeanAnthropicTools(
  tools: ChatToolSchema[] | undefined,
): ChatToolSchema[] | undefined {
  if (!tools?.length) return tools
  const lean = tools.filter((tool) => ANTHROPIC_LEAN_TOOL_ALLOWLIST.has(tool.name))
  return lean.length > 0 ? lean : undefined
}

function isAnthropicExtraUsageError(message: string): boolean {
  const lower = message.toLowerCase()
  return (
    lower.includes('out of "extra usage"') ||
    lower.includes('out of extra usage') ||
    lower.includes('usage allowance') ||
    lower.includes('claude pro/max subscription')
  )
}

// ---------------------------------------------------------------------------

function transcriptToChatMessages(events: TranscriptEvent[]): ChatMessage[] {
  const out: ChatMessage[] = []
  for (const e of events) {
    if (e.kind === 'summary') {
      out.push({
        role: 'system',
        content: `[Context summary of ${e.replacesRange.count} earlier turns]\n${e.summary}`,
      })
      continue
    }
    if (e.kind !== 'message') continue
    const onlyText = e.content.every((b) => b.type === 'text')
    if (onlyText) {
      out.push({
        role: e.role === 'tool' ? 'tool' : e.role,
        content: e.content.map((b) => (b as any).text).join(''),
      })
    } else {
      out.push({
        role: e.role === 'tool' ? 'tool' : e.role,
        content: e.content as unknown as Array<Record<string, any>>,
      })
    }
  }
  return out
}

function estimateTokens(events: TranscriptEvent[]): number {
  let chars = 0
  for (const e of events) {
    if (e.kind === 'summary') chars += e.summary.length
    else if (e.kind === 'message') {
      for (const b of e.content) {
        if (b.type === 'text' || b.type === 'thinking') chars += b.text.length
        else if (b.type === 'tool_use') chars += JSON.stringify(b.input).length + b.name.length
        else if (b.type === 'tool_result')
          chars += typeof b.content === 'string' ? b.content.length : JSON.stringify(b.content).length
      }
    }
  }
  return Math.ceil(chars / 4)
}

/**
 * Parse tool-call text forms that weaker models emit instead of using the
 * native function-calling API, and promote them to real tool_use objects.
 *
 * Supported shapes (conservative — we only match high-signal patterns so
 * we don't turn ordinary prose containing brackets into tool calls):
 *
 *   [tool_use: name({...JSON...})]
 *   <tool_call>{"name":"...","arguments":{...}}</tool_call>
 *   <function_call name="...">{...}</function_call>
 *   ```tool_code
 *   name({...JSON...})
 *   ``` (Gemma / Gemini CLI style)
 *   <｜tool▁calls▁begin｜>{"name":"...","arguments":{...}}<｜tool▁calls▁end｜>
 *     (DeepSeek R1 / V3 full-width pipe markers)
 *   <|tool_call_start|>{...}<|tool_call_end|>  (Hermes-3 / Nous variants)
 *
 * Returns the text with all matched invocations stripped, and the rescued
 * tool uses with fresh synthetic ids.
 */
function extractInlineToolCalls(text: string): {
  cleanedText: string
  rescued: Array<{ id: string; name: string; input: any }>
} {
  const rescued: Array<{ id: string; name: string; input: any }> = []
  let cleaned = text
  let counter = 0
  const mkId = () => `rescued_${Date.now()}_${counter++}`

  // 1) [tool_use: name({...})] — the exact shape flattenContent used to emit
  cleaned = cleaned.replace(
    /\[tool_use:\s*([a-zA-Z0-9_]+)\s*\(\s*(\{[\s\S]*?\})\s*\)\s*\]/g,
    (_m, name: string, json: string) => {
      try { rescued.push({ id: mkId(), name, input: JSON.parse(json) }); return '' }
      catch { return _m }
    },
  )
  // 2) <tool_call>{"name":"x","arguments":{...}}</tool_call>  (Qwen/Hermes)
  cleaned = cleaned.replace(
    /<tool_call>\s*(\{[\s\S]*?\})\s*<\/tool_call>/g,
    (_m, json: string) => {
      try {
        const obj = JSON.parse(json)
        const name = obj.name ?? obj.tool ?? obj.function?.name
        const args = obj.arguments ?? obj.args ?? obj.parameters ?? obj.function?.arguments ?? {}
        const input = typeof args === 'string' ? JSON.parse(args) : args
        if (name) { rescued.push({ id: mkId(), name: String(name), input }); return '' }
      } catch { /* fall through */ }
      return _m
    },
  )
  // 3) <function_call name="x">{...}</function_call>
  cleaned = cleaned.replace(
    /<function_call\s+name=["']([a-zA-Z0-9_]+)["']\s*>\s*(\{[\s\S]*?\})\s*<\/function_call>/g,
    (_m, name: string, json: string) => {
      try { rescued.push({ id: mkId(), name, input: JSON.parse(json) }); return '' }
      catch { return _m }
    },
  )
  // 4) ```tool_code\nname({...})\n```  (Gemma / Gemini CLI fenced)
  cleaned = cleaned.replace(
    /```(?:tool_code|python)\s*\n\s*([a-zA-Z0-9_]+)\s*\(\s*(\{[\s\S]*?\})\s*\)\s*\n?```/g,
    (_m, name: string, json: string) => {
      try { rescued.push({ id: mkId(), name, input: JSON.parse(json) }); return '' }
      catch { return _m }
    },
  )
  // 5) DeepSeek R1/V3: full-width-pipe sentinels around a JSON object with
  //    `name` + `arguments`. The sentinel glyphs are actual Unicode chars
  //    U+FF5C / U+2581, not ASCII pipes, so a naive `<|...|>` regex misses them.
  cleaned = cleaned.replace(
    /[\u2581\uFF5C<]\s*tool[_▁]calls?[_▁]begin\s*[\u2581\uFF5C>][\s\S]*?(\{[\s\S]*?\})[\s\S]*?[\u2581\uFF5C<]\s*tool[_▁]calls?[_▁]end\s*[\u2581\uFF5C>]/g,
    (_m, json: string) => {
      try {
        const obj = JSON.parse(json)
        const name = obj.name ?? obj.tool ?? obj.function?.name
        const args = obj.arguments ?? obj.args ?? obj.parameters ?? obj.function?.arguments ?? {}
        const input = typeof args === 'string' ? JSON.parse(args) : args
        if (name) { rescued.push({ id: mkId(), name: String(name), input }); return '' }
      } catch { /* fall through */ }
      return _m
    },
  )
  // 6) Hermes-3 / Nous variant: ASCII `<|tool_call_start|>…<|tool_call_end|>`
  cleaned = cleaned.replace(
    /<\|tool_call_start\|>\s*(\{[\s\S]*?\})\s*<\|tool_call_end\|>/g,
    (_m, json: string) => {
      try {
        const obj = JSON.parse(json)
        const name = obj.name ?? obj.tool ?? obj.function?.name
        const args = obj.arguments ?? obj.args ?? obj.parameters ?? obj.function?.arguments ?? {}
        const input = typeof args === 'string' ? JSON.parse(args) : args
        if (name) { rescued.push({ id: mkId(), name: String(name), input }); return '' }
      } catch { /* fall through */ }
      return _m
    },
  )

  // Tidy double newlines left by stripped fences.
  cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim()
  return { cleanedText: cleaned, rescued }
}

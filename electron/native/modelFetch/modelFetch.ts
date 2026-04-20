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
import {
  CLAUDE_CODE_SYSTEM_PREFIX,
  IBANK_VERSION,
} from '../core/version.js'
import {
  appendMessage,
  readTranscript,
  compactTranscript,
  type ContentBlock,
  type TranscriptEvent,
} from '../session/transcript.js'
import { buildMemoryBlock } from '../memory/memdir.js'
import { loadSkills, matchSkills, buildSkillsBlock, type Skill } from '../skills/registry.js'
import { streamChat, type ChatMessage } from '../llm/chat.js'
import { currentModel } from '../llm/model.js'
import {
  anthropicTools,
  toolByName,
  type Permission,
} from '../tools/registry.js'
import { activeFinancialBuddyPersona } from '../financialBuddies/registry.js'

const log = createLogger('modelFetch')

const MAX_TOOL_ITERATIONS = 20
const COMPACT_AT_TOKENS = 140_000
const COMPACT_KEEP_RECENT = 12

// ---------------------------------------------------------------------------

export interface FetchOptions {
  sessionId: string
  requestId: string
  userText: string
  permission?: Permission
  /** Optional persona id (financial-buddy slug) — overrides the session default. */
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

  await appendMessage(sessionId, 'user', [{ type: 'text', text: userText }])

  const allSkills = await loadSkills()
  const matchedSkills = matchSkills(userText, allSkills)
  log.info('turn start', {
    sessionId,
    matched: matchedSkills.map((s) => s.name),
    userLen: userText.length,
  })

  const systemPrompt = await buildSystemPrompt(matchedSkills, userText, opts.persona)

  let events = await readTranscript(sessionId)
  if (estimateTokens(events) > COMPACT_AT_TOKENS) {
    emit('query.status', { requestId, phase: 'compacting' })
    const res = await compactTranscript(sessionId, { keepRecent: COMPACT_KEEP_RECENT })
    log.info('compacted', res)
    events = await readTranscript(sessionId)
  }
  const messages: ChatMessage[] = transcriptToChatMessages(events)

  const model = currentModel()
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

    try {
      await streamChat({
        model: model.model,
        messages,
        systemPrompt,
        tools: model.provider === 'anthropic' ? anthropicTools() : undefined,
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
    } catch (err) {
      const msg = (err as Error).message
      log.error('stream failed', { err: msg })
      emit('chat.error', { requestId, error: msg })
      return { stopReason: 'error', turns, lastTextLength, error: msg }
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
  try {
    const out = await tool.handler(use.input, {
      sessionId: ctx.sessionId,
      requestId: ctx.requestId,
      permission: ctx.permission,
      signal: ctx.signal,
    })
    return { content: out, isError: false }
  } catch (err) {
    const msg = (err as Error).message
    log.warn('tool failed', { tool: use.name, err: msg })
    return { content: `Error running ${use.name}: ${msg}`, isError: true }
  }
}

// ---------------------------------------------------------------------------

async function buildSystemPrompt(
  matchedSkills: Skill[],
  userText: string,
  personaId?: string,
): Promise<string> {
  const cfg = readConfig()
  const parts: string[] = []

  parts.push(CLAUDE_CODE_SYSTEM_PREFIX)

  parts.push(
    '\n## About iBank\n' +
      `You are running inside iBank Desktop ${IBANK_VERSION}, a native crypto & financial ` +
      'companion app. You have a multi-chain non-custodial wallet (with NFT holdings), market-data ' +
      'tools, long-term memory, a harness engine for backtests & scenario simulations, a swarm ' +
      'of CryptoBuddies + FinancialBuddies, and the ability to recall skills.\n\n' +
      '**Output formatting rules**\n' +
      '- Use rich markdown whenever it improves clarity: tables for comparisons, fenced ' +
      '  code blocks for JSON/commands/code, bold for key numbers, inline links.\n' +
      '- Prefer concise, structured answers. No filler; no "great question".\n' +
      '- Never print mnemonics, private keys, or passphrases. Direct the user to the ' +
      '  Wallet panel for any reveal/unlock flow.',
  )

  if (cfg.planMode) {
    parts.push(
      '\n## Plan mode is active\n' +
        'Before executing any irreversible action (wallet sends, file writes, swaps), ' +
        'present the full plan and ask for confirmation. Read-only tools may run immediately.',
    )
  }

  // Financial-Buddy persona — either the caller-specified id or the session default.
  const persona = activeFinancialBuddyPersona(personaId)
  if (persona) {
    parts.push('\n## Active persona: ' + persona.title + '\n' + persona.systemPrompt)
  }

  if (matchedSkills.length > 0) {
    parts.push('\n' + buildSkillsBlock(matchedSkills))
  }

  const memBlock = await buildMemoryBlock(userText, 5)
  if (memBlock) parts.push('\n' + memBlock)

  const userPrefs = cfg.systemPromptAppend
  if (typeof userPrefs === 'string' && userPrefs.trim()) {
    parts.push('\n## User preferences\n' + userPrefs.trim())
  }

  return parts.join('\n')
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

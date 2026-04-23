/**
 * Append-only conversation transcript persisted as JSONL.
 *
 * One file per session at ~/.wishcode/sessions/<yyyy-mm>/<session-id>.jsonl
 *
 * Each line is a TranscriptEvent. Readers re-materialize the conversation
 * by streaming the file. Compaction rewrites the file: it drops the oldest
 * user/assistant turn pairs and prepends a single `summary` event that
 * replaces them in LLM context.
 */

import * as fs from 'fs'
import * as path from 'path'
import { paths } from '../core/config.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('transcript')

// ---------------------------------------------------------------------------

export type Role = 'user' | 'assistant' | 'system' | 'tool'

export interface ContentBlockText { type: 'text'; text: string }
export interface ContentBlockThinking { type: 'thinking'; text: string }
export interface ContentBlockToolUse {
  type: 'tool_use'
  id: string
  name: string
  input: unknown
}
export interface ContentBlockToolResult {
  type: 'tool_result'
  tool_use_id: string
  content: string | unknown
  is_error?: boolean
}
export type ContentBlock =
  | ContentBlockText
  | ContentBlockThinking
  | ContentBlockToolUse
  | ContentBlockToolResult

export interface TranscriptMessage {
  kind: 'message'
  id: string
  ts: number
  role: Role
  content: ContentBlock[]
  model?: string
  provider?: string
  usage?: { inputTokens?: number; outputTokens?: number; cacheReadTokens?: number }
  stopReason?: string
}

export interface TranscriptSummary {
  kind: 'summary'
  id: string
  ts: number
  summary: string
  replacesRange: { fromTs: number; toTs: number; count: number }
}

export interface TranscriptMarker {
  kind: 'marker'
  id: string
  ts: number
  label: string                // e.g. "/clear", "/compact"
  data?: unknown
}

export type TranscriptEvent = TranscriptMessage | TranscriptSummary | TranscriptMarker

// ---------------------------------------------------------------------------

function fileFor(sessionId: string, ts: number = Date.now()): string {
  const d = new Date(ts)
  const yyyy = d.getUTCFullYear()
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0')
  const dir = path.join(paths().sessionsDir, `${yyyy}-${mm}`)
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  return path.join(dir, `${sessionId}.jsonl`)
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

// ---------------------------------------------------------------------------

export async function appendEvent(
  sessionId: string,
  ev: Omit<TranscriptEvent, 'id' | 'ts'> & { ts?: number; id?: string },
): Promise<TranscriptEvent> {
  const ts = ev.ts ?? Date.now()
  const id = ev.id ?? newId(ev.kind)
  const complete = { ...ev, id, ts } as TranscriptEvent
  const file = fileFor(sessionId, ts)
  await fs.promises.appendFile(file, JSON.stringify(complete) + '\n', { mode: 0o600 })
  return complete
}

export async function appendMessage(
  sessionId: string,
  role: Role,
  content: ContentBlock[],
  extra: Partial<Omit<TranscriptMessage, 'kind' | 'id' | 'ts' | 'role' | 'content'>> = {},
): Promise<TranscriptMessage> {
  const ev = { kind: 'message' as const, role, content, ...extra }
  return (await appendEvent(sessionId, ev as any)) as TranscriptMessage
}

// ---------------------------------------------------------------------------

export async function readTranscript(sessionId: string): Promise<TranscriptEvent[]> {
  const dir = paths().sessionsDir
  if (!fs.existsSync(dir)) return []
  // Walk all monthly dirs to find matching session file (sessions can span
  // month boundaries in principle — transcripts stay in whichever file they
  // were first written to, so we collect all matches).
  const out: TranscriptEvent[] = []
  for (const month of await fs.promises.readdir(dir)) {
    const p = path.join(dir, month, `${sessionId}.jsonl`)
    if (!fs.existsSync(p)) continue
    const text = await fs.promises.readFile(p, 'utf8')
    for (const line of text.split('\n')) {
      if (!line) continue
      try { out.push(JSON.parse(line)) } catch (e) {
        log.warn('corrupt transcript line', { sessionId, line: line.slice(0, 120) })
      }
    }
  }
  out.sort((a, b) => a.ts - b.ts)
  return out
}

export async function clearTranscript(sessionId: string): Promise<void> {
  const dir = paths().sessionsDir
  if (!fs.existsSync(dir)) return
  for (const month of await fs.promises.readdir(dir)) {
    const p = path.join(dir, month, `${sessionId}.jsonl`)
    if (fs.existsSync(p)) await fs.promises.unlink(p)
  }
  log.info('transcript cleared', { sessionId })
}

// ---------------------------------------------------------------------------
// Compaction

export interface CompactResult {
  droppedTurns: number
  summaryChars: number
}

/**
 * Summarize older turns, keeping the most recent `keepRecent` messages intact.
 * The summary is written as a TranscriptSummary event at the start of the
 * transcript; the underlying file is rewritten.
 */
export async function compactTranscript(
  sessionId: string,
  opts: { keepRecent?: number; summarize?: (events: TranscriptEvent[]) => Promise<string> } = {},
): Promise<CompactResult> {
  const keepRecent = opts.keepRecent ?? 10
  const events = await readTranscript(sessionId)
  if (events.length <= keepRecent) return { droppedTurns: 0, summaryChars: 0 }

  const toSummarize = events.slice(0, events.length - keepRecent)
  const keep = events.slice(events.length - keepRecent)

  const summary = opts.summarize
    ? await opts.summarize(toSummarize)
    : defaultSummarize(toSummarize)

  const summaryEvent: TranscriptSummary = {
    kind: 'summary',
    id: newId('summary'),
    ts: toSummarize[0].ts,
    summary,
    replacesRange: {
      fromTs: toSummarize[0].ts,
      toTs: toSummarize[toSummarize.length - 1].ts,
      count: toSummarize.length,
    },
  }

  // Rewrite the file.
  const file = fileFor(sessionId, toSummarize[0].ts)
  await fs.promises.writeFile(
    file,
    [summaryEvent, ...keep].map((e) => JSON.stringify(e)).join('\n') + '\n',
    { mode: 0o600 },
  )

  // Remove any other month files for this session — they're stale.
  const dir = paths().sessionsDir
  for (const month of await fs.promises.readdir(dir)) {
    const p = path.join(dir, month, `${sessionId}.jsonl`)
    if (p !== file && fs.existsSync(p)) await fs.promises.unlink(p)
  }

  return { droppedTurns: toSummarize.length, summaryChars: summary.length }
}

function defaultSummarize(events: TranscriptEvent[]): string {
  // Heuristic: concatenate role-tagged text snippets, then truncate.
  const parts: string[] = []
  for (const e of events) {
    if (e.kind !== 'message') continue
    const text = e.content
      .map((b) =>
        b.type === 'text' ? b.text :
        b.type === 'tool_use' ? `[tool: ${b.name}]` :
        b.type === 'tool_result' ? `[tool result]` : '',
      )
      .filter(Boolean)
      .join(' ')
    if (text) parts.push(`${e.role}: ${text}`)
  }
  const joined = parts.join('\n')
  // Keep first 200 chars + last 800 chars joined with an ellipsis, 1kB total.
  if (joined.length <= 1000) return joined
  return joined.slice(0, 200) + '\n…\n' + joined.slice(-800)
}

// ---------------------------------------------------------------------------

export async function exportTranscript(
  sessionId: string,
  format: 'markdown' | 'json',
): Promise<string> {
  const events = await readTranscript(sessionId)
  const outDir = path.join(paths().sessionsDir, 'exports')
  fs.mkdirSync(outDir, { recursive: true, mode: 0o700 })
  const p = path.join(outDir, `${sessionId}.${format === 'markdown' ? 'md' : 'json'}`)
  if (format === 'json') {
    await fs.promises.writeFile(p, JSON.stringify(events, null, 2), { mode: 0o600 })
  } else {
    const lines: string[] = [`# WishCode transcript — ${sessionId}`, '']
    for (const e of events) {
      if (e.kind === 'summary') {
        lines.push(`> **Summary of ${e.replacesRange.count} earlier turns**\n> \n> ${e.summary.replace(/\n/g, '\n> ')}\n`)
        continue
      }
      if (e.kind === 'marker') {
        lines.push(`---\n\n**${e.label}** — <sub>${new Date(e.ts).toISOString()}</sub>\n`)
        continue
      }
      lines.push(`### ${e.role} — <sub>${new Date(e.ts).toISOString()}</sub>`)
      for (const block of e.content) {
        if (block.type === 'text') lines.push(block.text)
        else if (block.type === 'thinking') lines.push(`<details><summary>thinking</summary>\n\n${block.text}\n\n</details>`)
        else if (block.type === 'tool_use') lines.push(`**tool_use** \`${block.name}\`\n\n\`\`\`json\n${JSON.stringify(block.input, null, 2)}\n\`\`\``)
        else if (block.type === 'tool_result') lines.push(`**tool_result**\n\n\`\`\`\n${typeof block.content === 'string' ? block.content : JSON.stringify(block.content, null, 2)}\n\`\`\``)
      }
      lines.push('')
    }
    await fs.promises.writeFile(p, lines.join('\n'), { mode: 0o600 })
  }
  return p
}

// ---------------------------------------------------------------------------

/** Convert transcript → LLM message array (dropping markers, collapsing summary). */
export function transcriptToLlmMessages(events: TranscriptEvent[]): Array<{
  role: Role
  content: ContentBlock[]
}> {
  const msgs: Array<{ role: Role; content: ContentBlock[] }> = []
  for (const e of events) {
    if (e.kind === 'summary') {
      msgs.push({
        role: 'system',
        content: [{ type: 'text', text: `[Context summary of ${e.replacesRange.count} earlier turns]\n${e.summary}` }],
      })
      continue
    }
    if (e.kind !== 'message') continue
    msgs.push({ role: e.role, content: e.content })
  }
  return msgs
}

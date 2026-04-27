/**
 * Mem-1 — Context assembly engine.
 *
 * Builds a coherent prompt-context window from a `MemoryStore` (Mem-0)
 * given a query, scope, and budget. The engine is deterministic given
 * the same inputs — Mem-2 adapters call into it from the chat / code /
 * agent surfaces, and the agent runtime (A-2) can inject the result
 * as a system-prompt prefix or as separate tool calls.
 *
 * Scoring is simple-but-honest:
 *   1. Per-scope priority weight (personal/team > workspace > session
 *      > task > agent), so a personal "always rejecting flaky tests"
 *      memory beats a stale session note.
 *   2. Pinned bonus.
 *   3. Substring-match bonus + token-overlap bonus against the query
 *      (BM25-light — Mem-1.1 will swap in the real BM25 once the
 *      indexer crate exposes a JS surface).
 *   4. Recency tiebreak (newer wins).
 *
 * Budget is char-based at this layer (≈ 4 chars / token). Mem-1.1 will
 * thread a tokenizer through.
 */

import type {
  MemoryEntry,
  MemoryQuery,
  MemoryScope,
  MemoryStore,
} from './types.js'
import { MEMORY_SCOPES } from './types.js'

const SCOPE_PRIORITY: Record<MemoryScope, number> = {
  personal: 1.0,
  team: 0.9,
  workspace: 0.7,
  session: 0.5,
  task: 0.4,
  agent: 0.3,
}

export interface AssembleRequest {
  /** Free-text query the assembler scores against. Empty = no query
   *  scoring; assembler still ranks by scope + recency. */
  query?: string
  /** Scope filter. Default: all six. */
  scopes?: MemoryScope[]
  /** Bindings filter (sessionId / workspaceId / etc.). */
  bindings?: MemoryQuery['bindings']
  /** Tag filter. */
  tags?: string[]
  /** Char budget for the assembled body. Default 8000 (~2k tokens). */
  budgetChars?: number
  /** Max number of entries to include. Default 32. */
  maxEntries?: number
  /** Include only pinned. */
  pinnedOnly?: boolean
}

export interface AssembledEntry {
  entry: MemoryEntry
  score: number
  /** Reason this entry made it in — surfaces in /context UI. */
  reasons: string[]
}

export interface AssembledContext {
  /** Selected entries, highest-score first. */
  entries: AssembledEntry[]
  /** Concatenated body, header-prefixed per entry, capped at budget. */
  body: string
  /** Total entries the store returned before budgeting. */
  candidateCount: number
  /** Char count of `body`. */
  charCount: number
  /** Sum of scope priorities of accepted entries — diagnostic. */
  scopeMix: Record<MemoryScope, number>
}

const STOP_WORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'when', 'where', 'how',
  'is', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has',
  'had', 'do', 'does', 'did', 'to', 'of', 'in', 'on', 'for', 'with',
  'this', 'that', 'these', 'those', 'it', 'its', 'as', 'at', 'by',
])

function tokens(s: string): string[] {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOP_WORDS.has(t))
}

function scoreEntry(e: MemoryEntry, qTokens: Set<string>, query: string): {
  score: number
  reasons: string[]
} {
  const reasons: string[] = []
  let score = 0

  // Scope priority.
  const sp = SCOPE_PRIORITY[e.scope]
  score += sp
  reasons.push(`scope:${e.scope}=${sp.toFixed(2)}`)

  // Pinned bonus.
  if (e.pinned) {
    score += 0.5
    reasons.push('pinned+0.5')
  }

  // Substring match.
  if (query.length > 0) {
    const lc = e.body.toLowerCase()
    if (lc.includes(query.toLowerCase())) {
      score += 0.6
      reasons.push('substring+0.6')
    }
  }

  // Token overlap (BM25-light).
  if (qTokens.size > 0) {
    const bodyTokens = new Set(tokens(e.body))
    let overlap = 0
    for (const t of qTokens) if (bodyTokens.has(t)) overlap++
    if (overlap > 0) {
      const bonus = Math.min(0.8, overlap * 0.1)
      score += bonus
      reasons.push(`overlap=${overlap}(+${bonus.toFixed(2)})`)
    }
  }

  return { score, reasons }
}

function recencyMs(e: MemoryEntry): number {
  return new Date(e.updatedAt).getTime()
}

/** Standalone: score + rank candidates without doing the budget pass. */
export function rankCandidates(
  candidates: MemoryEntry[],
  query: string,
): AssembledEntry[] {
  const qTokens = new Set(tokens(query))
  const ranked = candidates.map(entry => {
    const { score, reasons } = scoreEntry(entry, qTokens, query)
    return { entry, score, reasons }
  })
  ranked.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return recencyMs(b.entry) - recencyMs(a.entry)
  })
  return ranked
}

/** Render a single entry into its prompt-prefix form. */
export function renderEntry(e: MemoryEntry): string {
  const tags = e.tags.length > 0 ? ` [${e.tags.join(',')}]` : ''
  return `### memory:${e.scope}${e.pinned ? ' (pinned)' : ''}${tags}\n${e.body}\n`
}

/** Main entry point. */
export async function assembleContext(
  store: MemoryStore,
  req: AssembleRequest = {},
): Promise<AssembledContext> {
  const scopes = req.scopes ?? [...MEMORY_SCOPES]
  const candidates = await store.list({
    scopes,
    tags: req.tags,
    bindings: req.bindings,
    pinnedOnly: req.pinnedOnly,
    limit: 500,
  })
  const ranked = rankCandidates(candidates, req.query ?? '')
  const budget = req.budgetChars ?? 8000
  const maxEntries = req.maxEntries ?? 32

  const out: AssembledEntry[] = []
  const scopeMix = Object.fromEntries(
    MEMORY_SCOPES.map(s => [s, 0]),
  ) as Record<MemoryScope, number>
  let body = ''
  let charCount = 0

  for (const r of ranked) {
    if (out.length >= maxEntries) break
    const rendered = renderEntry(r.entry)
    if (charCount + rendered.length > budget && out.length > 0) break
    out.push(r)
    body += rendered
    charCount += rendered.length
    scopeMix[r.entry.scope] += 1
  }

  return {
    entries: out,
    body,
    candidateCount: candidates.length,
    charCount,
    scopeMix,
  }
}

/**
 * Long-term memory: markdown files in ~/.ibank/memory/.
 *
 * Each memory is a separate .md file with YAML-lite frontmatter:
 *   ---
 *   id: mem-<ts>-<rand>
 *   tags: [crypto, tax, 2026]
 *   created: 2026-04-16T...
 *   pinned: false
 *   ---
 *   <body markdown>
 *
 * Retrieval: BM25 over title+body+tags with logarithmic recency boost.
 * No embeddings in Phase 1 — zero-dep, fast, good-enough for <10k memories.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { paths, ensureAllDirs } from '../core/config.js'

export interface MemoryEntry {
  id: string
  tags: string[]
  created: number   // unix ms
  pinned: boolean
  title: string     // first markdown heading or first 60 chars
  body: string      // full body after frontmatter
  file: string      // absolute path
}

// ── File format ────────────────────────────────────────────────────

function parseMemory(file: string): MemoryEntry | null {
  let text: string
  try { text = fs.readFileSync(file, 'utf8') }
  catch { return null }
  const m = text.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/)
  let front: Record<string, any> = {}
  let body = text
  if (m) {
    body = m[2].trim()
    for (const line of m[1].split('\n')) {
      const kv = line.match(/^(\w+):\s*(.*)$/)
      if (!kv) continue
      const [, k, v] = kv
      if (v.startsWith('[') && v.endsWith(']')) {
        front[k] = v.slice(1, -1).split(',').map(s => s.trim()).filter(Boolean)
      } else if (v === 'true' || v === 'false') {
        front[k] = v === 'true'
      } else {
        front[k] = v.replace(/^"(.*)"$/, '$1')
      }
    }
  }
  const titleMatch = body.match(/^#\s+(.+)$/m)
  const title = titleMatch ? titleMatch[1].trim() : (body.slice(0, 60).trim() || '(untitled)')
  const created = front.created
    ? Date.parse(front.created) || fs.statSync(file).mtimeMs
    : fs.statSync(file).mtimeMs
  return {
    id: front.id || path.basename(file, '.md'),
    tags: Array.isArray(front.tags) ? front.tags : [],
    created,
    pinned: !!front.pinned,
    title,
    body,
    file,
  }
}

function serializeMemory(m: Pick<MemoryEntry, 'id' | 'tags' | 'created' | 'pinned' | 'body'>): string {
  const tagsStr = `[${m.tags.join(', ')}]`
  return `---
id: ${m.id}
tags: ${tagsStr}
created: ${new Date(m.created).toISOString()}
pinned: ${m.pinned}
---
${m.body}
`
}

function memoryFilePath(id: string): string {
  return path.join(paths().memoryDir, `${id}.md`)
}

// ── CRUD ───────────────────────────────────────────────────────────

export function addMemory(body: string, opts: { tags?: string[]; pinned?: boolean } = {}): MemoryEntry {
  ensureAllDirs()
  const id = `mem-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`
  const entry = {
    id,
    tags: opts.tags ?? [],
    created: Date.now(),
    pinned: !!opts.pinned,
    body: body.trim(),
  }
  const file = memoryFilePath(id)
  fs.writeFileSync(file, serializeMemory(entry), { mode: 0o600 })
  const titleMatch = body.match(/^#\s+(.+)$/m)
  return {
    ...entry,
    title: titleMatch ? titleMatch[1].trim() : body.slice(0, 60),
    file,
  }
}

export function listMemories(): MemoryEntry[] {
  ensureAllDirs()
  const dir = paths().memoryDir
  try {
    return fs.readdirSync(dir)
      .filter(f => f.endsWith('.md'))
      .map(f => parseMemory(path.join(dir, f)))
      .filter((m): m is MemoryEntry => !!m)
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
        return b.created - a.created
      })
  } catch {
    return []
  }
}

export function getMemory(id: string): MemoryEntry | null {
  return parseMemory(memoryFilePath(id))
}

export function updateMemory(id: string, patch: Partial<Pick<MemoryEntry, 'body' | 'tags' | 'pinned'>>): MemoryEntry | null {
  const existing = getMemory(id)
  if (!existing) return null
  const next = { ...existing, ...patch }
  fs.writeFileSync(existing.file, serializeMemory(next), { mode: 0o600 })
  return { ...next, title: extractTitle(next.body) }
}

export function removeMemory(id: string): boolean {
  const file = memoryFilePath(id)
  if (!fs.existsSync(file)) return false
  fs.unlinkSync(file)
  return true
}

function extractTitle(body: string): string {
  const t = body.match(/^#\s+(.+)$/m)
  return t ? t[1].trim() : body.slice(0, 60)
}

// ── BM25 retrieval ─────────────────────────────────────────────────

// Minimal, zero-dep BM25 over title+body+tags.
// Tuned so recent memories get a modest boost (1 + log1p(dayage) damping).

const K1 = 1.5
const B  = 0.75

function tokenize(s: string): string[] {
  return s.toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 2 && t.length < 40)
}

export function findRelevant(query: string, limit: number = 5): MemoryEntry[] {
  const q = tokenize(query)
  if (q.length === 0) return []
  const all = listMemories()
  if (all.length === 0) return []

  // Build per-doc token stats.
  const docTokens = all.map(m => tokenize(`${m.title} ${m.tags.join(' ')} ${m.body}`))
  const avgDocLen = docTokens.reduce((a, b) => a + b.length, 0) / docTokens.length

  // Query-term IDF
  const N = all.length
  const df: Record<string, number> = {}
  for (const term of new Set(q)) {
    df[term] = docTokens.reduce((n, toks) => n + (toks.includes(term) ? 1 : 0), 0)
  }
  const idf: Record<string, number> = {}
  for (const term of new Set(q)) {
    idf[term] = Math.log(1 + (N - df[term] + 0.5) / (df[term] + 0.5))
  }

  // Score each doc.
  const now = Date.now()
  const scored = all.map((m, i) => {
    const toks = docTokens[i]
    const tf: Record<string, number> = {}
    for (const t of toks) tf[t] = (tf[t] ?? 0) + 1
    let score = 0
    for (const term of new Set(q)) {
      const f = tf[term] ?? 0
      if (f === 0) continue
      const num = f * (K1 + 1)
      const den = f + K1 * (1 - B + B * (toks.length / avgDocLen))
      score += idf[term] * (num / den)
    }
    // Recency boost: memories <7d old get up to +20%, decaying.
    const ageDays = (now - m.created) / 86_400_000
    const recency = 1 + 0.2 / (1 + Math.log1p(ageDays))
    score *= recency
    // Pinned memories always weighed higher.
    if (m.pinned) score *= 1.5
    return { m, score }
  })
  return scored
    .filter(x => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(x => x.m)
}

/**
 * Build a "Relevant memories" block to inject into the system prompt before
 * each user turn. Returns empty string if no relevant memories.
 */
export function buildMemoryBlock(userMessage: string, limit: number = 5): string {
  const hits = findRelevant(userMessage, limit)
  if (hits.length === 0) return ''
  const lines: string[] = ['## Relevant memories', '']
  for (const m of hits) {
    lines.push(`### ${m.title} ${m.tags.length ? `[${m.tags.join(', ')}]` : ''}`)
    lines.push(m.body.slice(0, 800))
    lines.push('')
  }
  return lines.join('\n')
}

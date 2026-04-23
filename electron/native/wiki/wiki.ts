/**
 * Project Wiki — Karpathy-style LLM wiki memory.
 *
 * A single curated markdown file at the workspace root that the agent
 * reads on every turn AND writes to when it learns something durable
 * about the project. Unlike:
 *   - memdir    : atomic facts, BM25-retrieved, cross-session
 *   - blackboard: session-scoped JSON, cleared between sessions
 *   - wiki      : PROJECT-scoped, markdown, *curated by the agent itself*
 *
 * The wiki lives at `<workspaceRoot>/WISH.md` (or `CLAUDE.md` if present
 * from a prior Claude Code install — we reuse it so teams can share one
 * file). It is read verbatim into the system prompt each turn. The agent
 * is instructed to keep it tight: architecture notes, file map, commands
 * that actually work here, known-bad paths, user preferences expressed
 * over time. Never logs, never full transcripts — it's a wiki, not a
 * diary.
 *
 * Updates go through `wiki_update` which either:
 *   - mode='append' : tacks a section onto the end
 *   - mode='replace': overwrites the whole file (for refactors)
 *   - mode='edit'   : exact-string replacement inside the file
 *
 * The file is plain markdown on disk — the user can edit it with any
 * editor, and the agent picks up their edits on the next turn.
 */

import * as fs from 'fs'
import * as path from 'path'
import { workspaceRoot } from '../core/config.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('wiki')

// Candidates tried in order. We prefer WISH.md (our canonical name) but
// fall back to CLAUDE.md so an existing Claude Code project's wiki just
// works without a rename dance.
const WIKI_CANDIDATES = ['WISH.md', 'CLAUDE.md', 'AGENTS.md']

// Hard cap — if the wiki grows past this, the agent should compact it.
const MAX_WIKI_BYTES = 64 * 1024

export interface WikiInfo {
  path: string
  exists: boolean
  bytes: number
  content: string
}

export function wikiPath(): string {
  const root = workspaceRoot()
  for (const c of WIKI_CANDIDATES) {
    const p = path.join(root, c)
    try { if (fs.existsSync(p)) return p } catch {}
  }
  // Default to the canonical name if none exist yet.
  return path.join(root, WIKI_CANDIDATES[0])
}

export function readWiki(): WikiInfo {
  const p = wikiPath()
  try {
    if (!fs.existsSync(p)) return { path: p, exists: false, bytes: 0, content: '' }
    const content = fs.readFileSync(p, 'utf8')
    return { path: p, exists: true, bytes: Buffer.byteLength(content), content }
  } catch (err) {
    log.warn('wiki read failed', { path: p, err: (err as Error).message })
    return { path: p, exists: false, bytes: 0, content: '' }
  }
}

function writeWiki(content: string): WikiInfo {
  const p = wikiPath()
  const bytes = Buffer.byteLength(content)
  if (bytes > MAX_WIKI_BYTES) {
    throw new Error(
      `Wiki would exceed ${MAX_WIKI_BYTES} bytes (${bytes}). ` +
      `Use wiki_update mode='replace' with a compacted version, or trim old sections first.`,
    )
  }
  fs.writeFileSync(p, content, { encoding: 'utf8' })
  return { path: p, exists: true, bytes, content }
}

export function wikiAppend(section: string): WikiInfo {
  const cur = readWiki()
  const sep = cur.content.endsWith('\n') || !cur.content ? '' : '\n'
  const prefix = cur.content ? `${cur.content}${sep}\n` : ''
  const body = section.endsWith('\n') ? section : `${section}\n`
  return writeWiki(prefix + body)
}

export function wikiReplace(content: string): WikiInfo {
  const body = content.endsWith('\n') ? content : `${content}\n`
  return writeWiki(body)
}

export function wikiEdit(oldString: string, newString: string): WikiInfo {
  const cur = readWiki()
  if (!cur.exists) throw new Error(`Wiki does not exist at ${cur.path}; create it first with append or replace.`)
  const idx = cur.content.indexOf(oldString)
  if (idx === -1) throw new Error(`wiki_edit: old_string not found (${oldString.slice(0, 80)}…)`)
  const next = cur.content.slice(0, idx) + newString + cur.content.slice(idx + oldString.length)
  return writeWiki(next)
}

/**
 * Markdown block to inject into the system prompt.  Returns empty string
 * when there is no wiki, so callers can concat cleanly.
 *
 * Format is identical to how the real Claude Code CLI surfaces CLAUDE.md —
 * a fenced block with a banner and the raw file contents, followed by a
 * brief note reminding the agent it is WRITABLE.
 */
export function wikiSystemBlock(): string {
  const info = readWiki()
  if (!info.exists || !info.content.trim()) return ''
  // Soft cap for system prompt — huge wikis get truncated with a pointer.
  const body = info.content.length > 16_000
    ? info.content.slice(0, 16_000) +
      `\n\n…[wiki truncated at 16 KB — full file at ${info.path}]\n`
    : info.content
  return (
    `## Project wiki (${path.basename(info.path)})\n` +
    `This is the curated project knowledge base at \`${info.path}\`. ` +
    `Treat it as ground truth for architecture, conventions, and commands that work here. ` +
    `When you discover a fact that will matter on a later turn — a file map, a working ` +
    `command, a pitfall, a user preference — call \`wiki_update\` to record it. Keep entries ` +
    `terse (3–5 lines). Compact old sections when they go stale.\n\n` +
    '```markdown\n' + body + '\n```'
  )
}

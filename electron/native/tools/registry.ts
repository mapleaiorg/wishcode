/**
 * LLM-callable tool registry (Phase 0 stub).
 *
 * The full coding-agent tool set (FileRead, FileWrite, FileEdit, Glob, Grep,
 * Bash, Agent, Task, LSP, MCP, Monitor, EnterPlanMode, ScheduleCron, …)
 * is ported from wish-v0.3.0 in Phase 1. This stub only exposes the tools
 * that don't touch the filesystem or shell: memory + web_search +
 * session_summarize.
 *
 * Every tool is gated by a permission ("auto" | "ask" | "plan" | "bypass")
 * which the engine checks before dispatching.
 */

export type Permission = 'auto' | 'ask' | 'plan' | 'bypass'

/** Minimal JSON-schema shape we use for tool inputs (no external dep). */
export interface ToolSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [k: string]: unknown
}
type JSONSchema7 = ToolSchema

export interface ToolContext {
  sessionId: string
  requestId: string
  permission: Permission
  approve?: (question: string, data?: unknown) => Promise<boolean>
  signal?: AbortSignal
}

export type ToolCategory =
  | 'memory' | 'web' | 'fs' | 'shell' | 'session' | 'tasks'
  | 'agent' | 'mcp' | 'lsp' | 'skills' | 'misc'

export interface ToolDef<I = unknown, O = unknown> {
  name: string
  title: string
  description: string
  inputSchema: JSONSchema7
  permission: Permission
  handler: (input: I, ctx: ToolContext) => Promise<O>
  dangerous?: boolean
  category: ToolCategory
}

const registry = new Map<string, ToolDef>()

export function registerTool<I, O>(def: ToolDef<I, O>): void {
  registry.set(def.name, def as unknown as ToolDef)
}

export function unregisterTool(name: string): void {
  registry.delete(name)
}

export function toolsList(): ToolDef[] {
  return [...registry.values()]
}

/**
 * Common tool-name variants that small or non-Claude models tend to
 * hallucinate. Each maps to our canonical name so the dispatch layer
 * resolves them instead of returning "unknown tool" and confusing the
 * model. Keys are lowercased; lookup is case-insensitive.
 */
const TOOL_ALIASES: Record<string, string> = {
  // fs_read variants
  read_file: 'fs_read',
  readfile: 'fs_read',
  read: 'fs_read',
  'file.read': 'fs_read',
  'file_read': 'fs_read',
  cat: 'fs_read',
  open_file: 'fs_read',
  view_file: 'fs_read',
  // fs_write
  write_file: 'fs_write',
  writefile: 'fs_write',
  create_file: 'fs_write',
  'file.write': 'fs_write',
  'file_write': 'fs_write',
  // fs_edit
  edit_file: 'fs_edit',
  'file.edit': 'fs_edit',
  'file_edit': 'fs_edit',
  str_replace: 'fs_edit',
  replace: 'fs_edit',
  // fs_glob
  list_files: 'fs_glob',
  list_dir: 'fs_glob',
  ls: 'fs_glob',
  glob: 'fs_glob',
  find: 'fs_glob',
  find_files: 'fs_glob',
  // fs_grep
  grep: 'fs_grep',
  search: 'fs_grep',
  search_code: 'fs_grep',
  ripgrep: 'fs_grep',
  rg: 'fs_grep',
  // shell
  bash: 'shell_bash',
  shell: 'shell_bash',
  run: 'shell_bash',
  execute: 'shell_bash',
  run_command: 'shell_bash',
  exec: 'shell_bash',
  // web
  search_web: 'web_search',
  google: 'web_search',
  fetch: 'web_fetch',
  fetch_url: 'web_fetch',
  http_get: 'web_fetch',
  // agent
  spawn_agent: 'agent_task',
  launch_agent: 'agent_task',
  task: 'agent_task',
  subtask: 'agent_task',
  // memory / wiki / board
  remember: 'memory_add',
  recall: 'memory_recall',
  note: 'memory_add',
  notebook_write: 'wiki_update',
  update_wiki: 'wiki_update',
  read_wiki: 'wiki_read',
  board_set: 'bb_put',
  board_get: 'bb_get',
}

export function toolByName(name: string): ToolDef | undefined {
  if (!name) return undefined
  const direct = registry.get(name)
  if (direct) return direct
  const aliased = TOOL_ALIASES[name.toLowerCase()]
  if (aliased) return registry.get(aliased)
  return undefined
}

/** Shape Anthropic's tools API expects. */
export function anthropicTools(): Array<{
  name: string
  description: string
  input_schema: JSONSchema7
}> {
  return toolsList().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }))
}

/** Shape OpenAI's tools API expects. */
export function openaiTools(): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: JSONSchema7 }
}> {
  return toolsList().map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }))
}

// ---------------------------------------------------------------------------
// Built-ins

// Side-effect imports — each module self-registers its tool on load.
import './fs-read.js'
import './fs-write.js'
import './fs-edit.js'
import './fs-glob.js'
import './fs-grep.js'
import './shell-bash.js'
import './agent-task.js'
import './agent-chain.js'
import './ask-user.js'
import './web-fetch.js'
import './todo-write.js'
import './plan-mode.js'
import './task-tools.js'
import './mcp-tools.js'
import './cron-tools.js'

import * as memdir from '../memory/memdir.js'
import * as bb from '../blackboard/blackboard.js'
import * as wiki from '../wiki/wiki.js'

registerTool({
  name: 'memory_add',
  title: 'Save memory',
  description: 'Save a fact or preference into long-term memory.',
  category: 'memory',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Content to remember.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
      pinned: { type: 'boolean', description: 'Pin to always surface.' },
    },
    required: ['text'],
  },
  async handler(input: any) {
    const entry = await memdir.addMemory(String(input.text), {
      tags: Array.isArray(input.tags) ? input.tags : [],
      pinned: !!input.pinned,
    })
    return { id: entry.id }
  },
})

registerTool({
  name: 'memory_recall',
  title: 'Recall memories',
  description: 'Retrieve memories relevant to a query using BM25.',
  category: 'memory',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
    },
    required: ['query'],
  },
  async handler(input: any) {
    const hits = await memdir.findRelevant(String(input.query), Number(input.limit ?? 5))
    return { hits: hits.map((m) => ({ id: m.id, body: m.body, tags: m.tags ?? [] })) }
  },
})

registerTool({
  name: 'memory_list',
  title: 'List memories',
  description: 'List recent memories.',
  category: 'memory',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  },
  async handler(input: any) {
    const list = await memdir.listMemories()
    return list.slice(0, Number(input.limit ?? 20))
  },
})

registerTool({
  name: 'web_search',
  title: 'Web search',
  description: 'Quick web search for breaking news or reference data.',
  category: 'web',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
    },
    required: ['query'],
  },
  async handler(input: any) {
    const q = encodeURIComponent(String(input.query))
    const limit = Number(input.limit ?? 5)
    const r = await fetch(`https://duckduckgo.com/html/?q=${q}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (WishCode-Desktop)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) throw new Error(`web_search ${r.status}`)
    const html = await r.text()
    const results: Array<{ title: string; url: string; snippet: string }> = []
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]+)<\/a>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      results.push({
        title: decode(m[2]),
        url: decode(m[1]),
        snippet: decode(m[3]),
      })
      if (results.length >= limit) break
    }
    return { results }
  },
})

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

// ── Blackboard: KAIROS-style shared working memory ──────────────────
// Scope: one session. Persistence: ~/.wishcode/blackboards/<sessionId>.json.
// Use from main agent AND sub-agents to hand structured facts between
// stages without rebuilding context from the transcript.

registerTool({
  name: 'bb_put',
  title: 'Blackboard write',
  description:
    'Write a structured value to the session blackboard under a dotted key. ' +
    'Use for facts that later turns or sub-agents will need (architecture ' +
    'decisions, discovered file paths, API contracts). Value is any JSON.',
  category: 'session',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string', description: 'Dotted key, e.g. "arch.bundler".' },
      value: { description: 'Any JSON value.' },
      writer: { type: 'string', description: 'Optional writer id (tool / persona).' },
      note: { type: 'string', description: 'One-line provenance.' },
    },
    required: ['key', 'value'],
  },
  async handler(input: any, ctx: ToolContext) {
    const entry = bb.bbPut(ctx.sessionId, String(input.key), input.value, {
      writer: input.writer ? String(input.writer) : undefined,
      note: input.note ? String(input.note) : undefined,
    })
    return { ok: true, key: input.key, ts: entry.ts }
  },
})

registerTool({
  name: 'bb_get',
  title: 'Blackboard read',
  description:
    'Read a key from the session blackboard, or the full map if no key ' +
    'is given. Returns null for missing keys.',
  category: 'session',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { key: { type: 'string' } },
  },
  async handler(input: any, ctx: ToolContext) {
    const value = bb.bbGet(ctx.sessionId, input?.key ? String(input.key) : undefined)
    return { value }
  },
})

registerTool({
  name: 'bb_delete',
  title: 'Blackboard delete',
  description: 'Remove one key from the session blackboard.',
  category: 'session',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { key: { type: 'string' } },
    required: ['key'],
  },
  async handler(input: any, ctx: ToolContext) {
    const removed = bb.bbDelete(ctx.sessionId, String(input.key))
    return { removed }
  },
})

registerTool({
  name: 'bb_list',
  title: 'Blackboard list',
  description: 'List every entry on the session blackboard with timestamps and writers.',
  category: 'session',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler(_: any, ctx: ToolContext) {
    return { entries: bb.bbList(ctx.sessionId) }
  },
})

registerTool({
  name: 'bb_clear',
  title: 'Blackboard clear',
  description: 'Drop all entries from the session blackboard (irreversible).',
  category: 'session',
  permission: 'ask',
  inputSchema: { type: 'object', properties: {} },
  async handler(_: any, ctx: ToolContext) {
    return { cleared: bb.bbClear(ctx.sessionId) }
  },
})

// ── Project wiki: Karpathy-style durable project memory ─────────────
// Lives at <workspaceRoot>/WISH.md (falls back to CLAUDE.md / AGENTS.md
// if present). Read verbatim into the system prompt every turn. Agent
// should update it whenever it learns something durable about the project.

registerTool({
  name: 'wiki_read',
  title: 'Read the project wiki',
  description:
    'Read the current contents of the project wiki (WISH.md / CLAUDE.md at workspace root). ' +
    'The wiki is already injected into every system prompt, so you usually do not need this — ' +
    'use it only if you want to reason about a specific section mid-turn.',
  category: 'memory',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    const info = wiki.readWiki()
    return { path: info.path, exists: info.exists, bytes: info.bytes, content: info.content }
  },
})

registerTool({
  name: 'wiki_update',
  title: 'Update the project wiki',
  description:
    'Record a durable project-level fact in the wiki at workspace root. Use when you discover ' +
    'architecture notes, a file map, commands that work here, a user preference, a known pitfall — ' +
    'anything a future turn will want to know without re-exploring. ' +
    'Modes: "append" (tack a section onto the end), "replace" (overwrite the whole file, for ' +
    'refactors), "edit" (exact-string replacement). Keep entries terse (3–5 lines).',
  category: 'memory',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      mode: { type: 'string', enum: ['append', 'replace', 'edit'], description: 'How to apply the update.' },
      content: { type: 'string', description: 'For append/replace: the markdown to write.' },
      old_string: { type: 'string', description: 'For edit: the exact text to find.' },
      new_string: { type: 'string', description: 'For edit: the replacement text.' },
    },
    required: ['mode'],
  },
  async handler(input: any) {
    const mode = String(input.mode)
    let info
    switch (mode) {
      case 'append':
        if (!input.content) throw new Error('wiki_update append: `content` is required')
        info = wiki.wikiAppend(String(input.content))
        break
      case 'replace':
        if (!input.content) throw new Error('wiki_update replace: `content` is required')
        info = wiki.wikiReplace(String(input.content))
        break
      case 'edit':
        if (!input.old_string || !input.new_string) {
          throw new Error('wiki_update edit: `old_string` and `new_string` are required')
        }
        info = wiki.wikiEdit(String(input.old_string), String(input.new_string))
        break
      default:
        throw new Error(`wiki_update: unknown mode '${mode}'`)
    }
    return { path: info.path, bytes: info.bytes, ok: true }
  },
})

registerTool({
  name: 'session_summarize',
  title: 'Summarize conversation',
  description: 'Return a compact summary of the current session so far.',
  category: 'session',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler(_: any, ctx: ToolContext) {
    const { readTranscript } = await import('../session/transcript.js')
    const events = await readTranscript(ctx.sessionId)
    return { turns: events.length }
  },
})

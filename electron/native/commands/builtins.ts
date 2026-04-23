/**
 * Core slash commands shipped with WishCode.
 *
 * Each is a CommandDef with a handler that returns CommandResult. Handlers
 * pull live state from the other native subsystems rather than caching.
 */

import { WISH_VERSION } from '../core/version'
import { readConfig, writeConfig, paths, workspaceRoot, setWorkspaceRoot } from '../core/config'
import { authStatus } from '../auth/auth'
import { modelList, modelSet, currentModel } from '../llm/model'
import {
  addMemory,
  listMemories,
  removeMemory,
  findRelevant,
} from '../memory/memdir'
import type { CommandDef } from './registry'

export type BuiltinCommand = CommandDef

// ---------------------------------------------------------------------------
// helpers

function table(rows: string[][]): string {
  if (rows.length === 0) return ''
  const widths = rows[0].map((_, i) =>
    Math.max(...rows.map((r) => (r[i] ?? '').length)),
  )
  return rows
    .map((r) => r.map((c, i) => (c ?? '').padEnd(widths[i])).join('  '))
    .join('\n')
}

function pad(s: string, w: number): string {
  return s.length >= w ? s : s + ' '.repeat(w - s.length)
}

// ---------------------------------------------------------------------------

const cmdHelp: BuiltinCommand = {
  name: 'help',
  aliases: ['?'],
  summary: 'list available commands',
  category: 'core',
  async handler() {
    // Defer requiring the registry to avoid circularity at import time.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { allCommands } = require('./registry') as typeof import('./registry')
    const rows = allCommands().map((c) => [
      `/${c.name}`,
      c.summary,
      `(${c.category})`,
    ])
    return {
      kind: 'display-md',
      markdown:
        '### Commands\n\n```\n' +
        rows
          .map((r) => `${pad(r[0], 14)} ${pad(r[1], 48)} ${r[2]}`)
          .join('\n') +
        '\n```',
    }
  },
}

const cmdVersion: BuiltinCommand = {
  name: 'version',
  summary: 'show the WishCode version',
  category: 'core',
  async handler() {
    return { kind: 'display', text: `WishCode ${WISH_VERSION}` }
  },
}

const cmdStatus: BuiltinCommand = {
  name: 'status',
  summary: 'auth / model overview',
  category: 'core',
  async handler() {
    const [auth, model] = await Promise.all([
      authStatus(),
      Promise.resolve(currentModel()),
    ])
    const lines = [
      `**Version** ${WISH_VERSION}`,
      `**Model**   ${model.provider}/${model.model}`,
      `**Auth**    ${
        Object.entries(auth.providers)
          .filter(([, p]: any) => p?.configured)
          .map(([name]) => name)
          .join(', ') || 'none'
      }`,
    ]
    return { kind: 'display-md', markdown: lines.join('\n\n') }
  },
}

const cmdLogin: BuiltinCommand = {
  name: 'login',
  usage: '/login <anthropic|openai|xai|gemini|ollama|hermon> [key]',
  summary: 'authenticate a provider',
  category: 'core',
  async handler({ argv }) {
    if (argv.length === 0) {
      return {
        kind: 'display',
        text: 'Usage: /login <provider> [apiKey]\nOr use the Settings panel for Claude OAuth.',
      }
    }
    const provider = argv[0]
    const rest = argv.slice(1).join(' ')
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { authLogin } = require('../auth/auth') as typeof import('../auth/auth')
    const creds: Record<string, unknown> =
      provider === 'ollama' ? { baseUrl: rest || undefined }
      : provider === 'hermon' ? { email: rest }
      : { apiKey: rest }
    try {
      const res = await authLogin(provider as Parameters<typeof authLogin>[0], creds)
      return {
        kind: 'display',
        text: res?.ok
          ? `Authenticated with ${provider}.`
          : `Login did not complete.`,
      }
    } catch (e) {
      return { kind: 'error', message: (e as Error).message }
    }
  },
}

const cmdLogout: BuiltinCommand = {
  name: 'logout',
  usage: '/logout <provider>',
  summary: 'clear credentials for a provider',
  category: 'core',
  async handler({ argv }) {
    if (argv.length === 0) return { kind: 'error', message: 'Usage: /logout <provider>' }
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { authLogout } = require('../auth/auth') as typeof import('../auth/auth')
    await authLogout(argv[0] as Parameters<typeof authLogout>[0])
    return { kind: 'display', text: `Cleared credentials for ${argv[0]}.` }
  },
}

const cmdModel: BuiltinCommand = {
  name: 'model',
  usage: '/model list | /model set <provider>/<name>',
  summary: 'list or switch the active model',
  category: 'model',
  async handler({ argv }) {
    if (argv[0] === 'list' || argv.length === 0) {
      const res = await modelList() as any
      const list = Array.isArray(res) ? res : res?.available ?? []
      const md = list
        .map(
          (m: any) =>
            `- **${m.provider ?? m.providerId ?? ''}/${m.model ?? m.name ?? ''}**${m.recommended ? '  ★' : ''}${
              m.warning ? `  _${m.warning}_` : ''
            }`,
        )
        .join('\n')
      return { kind: 'display-md', markdown: '### Models\n\n' + md }
    }
    if (argv[0] === 'set' && argv[1]) {
      const [provider, ...rest] = argv[1].split('/')
      const model = rest.join('/')
      if (!model) return { kind: 'error', message: 'format: provider/model' }
      await modelSet(model, provider as any)
      return { kind: 'display', text: `Active model: ${provider}/${model}` }
    }
    return { kind: 'error', message: 'Usage: /model list | /model set provider/model' }
  },
}

const cmdClear: BuiltinCommand = {
  name: 'clear',
  summary: 'clear the active conversation (keeps memories)',
  category: 'session',
  async handler({ sessionId }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { clearTranscript } = require('../session/transcript') as typeof import('../session/transcript')
    await clearTranscript(sessionId)
    return { kind: 'display', text: 'Conversation cleared.' }
  },
}

const cmdCompact: BuiltinCommand = {
  name: 'compact',
  summary: 'summarise older turns to free context',
  category: 'session',
  async handler({ sessionId }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { compactTranscript } = require('../session/transcript') as typeof import('../session/transcript')
    const { droppedTurns, summaryChars } = await compactTranscript(sessionId)
    return {
      kind: 'display',
      text: `Compacted ${droppedTurns} turns into a ${summaryChars}-char summary.`,
    }
  },
}

const cmdExport: BuiltinCommand = {
  name: 'export',
  usage: '/export [markdown|json]',
  summary: 'export the current conversation',
  category: 'session',
  async handler({ sessionId, argv }) {
    const fmt = (argv[0] ?? 'markdown') as 'markdown' | 'json'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { exportTranscript } = require('../session/transcript') as typeof import('../session/transcript')
    const p = await exportTranscript(sessionId, fmt)
    return { kind: 'display', text: `Exported to ${p}` }
  },
}

const cmdMemoryAdd: BuiltinCommand = {
  name: 'memory',
  usage: '/memory add <text> | /memory list | /memory remove <id> | /memory recall <query>',
  summary: 'manage long-term memory',
  category: 'memory',
  async handler({ argv }) {
    const sub = argv[0] ?? 'list'
    if (sub === 'add') {
      const text = argv.slice(1).join(' ').trim()
      if (!text) return { kind: 'error', message: 'Usage: /memory add <text>' }
      const entry = await addMemory(text)
      return { kind: 'display', text: `Memory saved (${entry.id}).` }
    }
    if (sub === 'list') {
      const items = await listMemories()
      if (items.length === 0) return { kind: 'display', text: 'No memories yet.' }
      const md = items
        .slice(0, 20)
        .map(
          (m) =>
            `- **${m.id}** ${m.pinned ? '📌 ' : ''}${m.body.slice(0, 100)}${
              m.body.length > 100 ? '…' : ''
            }`,
        )
        .join('\n')
      return { kind: 'display-md', markdown: '### Memories\n\n' + md }
    }
    if (sub === 'remove') {
      const id = argv[1]
      if (!id) return { kind: 'error', message: 'Usage: /memory remove <id>' }
      const ok = await removeMemory(id)
      return { kind: 'display', text: ok ? `Removed ${id}.` : `No memory with id ${id}.` }
    }
    if (sub === 'recall') {
      const q = argv.slice(1).join(' ').trim()
      if (!q) return { kind: 'error', message: 'Usage: /memory recall <query>' }
      const hits = await findRelevant(q, 5)
      if (hits.length === 0) return { kind: 'display', text: 'No relevant memories.' }
      return {
        kind: 'display-md',
        markdown:
          '### Relevant memories\n\n' +
          hits.map((m) => `- ${m.body}`).join('\n'),
      }
    }
    return { kind: 'error', message: 'Usage: /memory add|list|remove|recall' }
  },
}

const cmdConfig: BuiltinCommand = {
  name: 'config',
  usage: '/config get <key> | /config set <key> <value>',
  summary: 'view or edit the WishCode config',
  category: 'developer',
  async handler({ argv }) {
    const cfg = await readConfig()
    if (argv[0] === 'get') {
      const key = argv[1]
      if (!key) return { kind: 'display-md', markdown: '```json\n' + JSON.stringify(cfg, null, 2) + '\n```' }
      const v = key.split('.').reduce<unknown>((a, k) => (a && typeof a === 'object' ? (a as Record<string, unknown>)[k] : undefined), cfg)
      return { kind: 'display-md', markdown: '```\n' + JSON.stringify(v, null, 2) + '\n```' }
    }
    if (argv[0] === 'set') {
      const key = argv[1]
      const rawVal = argv.slice(2).join(' ')
      if (!key || rawVal === '') return { kind: 'error', message: 'Usage: /config set <key> <value>' }
      let value: unknown = rawVal
      try {
        value = JSON.parse(rawVal)
      } catch {
        // leave as string
      }
      await writeConfig((draft) => {
        const parts = key.split('.')
        let node: Record<string, unknown> = draft as Record<string, unknown>
        for (let i = 0; i < parts.length - 1; i++) {
          const p = parts[i]
          if (typeof node[p] !== 'object' || node[p] === null) node[p] = {}
          node = node[p] as Record<string, unknown>
        }
        node[parts[parts.length - 1]] = value
      })
      return { kind: 'display', text: `Set ${key}.` }
    }
    return { kind: 'error', message: 'Usage: /config get <key> | /config set <key> <value>' }
  },
}

const cmdPlan: BuiltinCommand = {
  name: 'plan',
  summary: 'toggle plan mode (LLM proposes before executing)',
  category: 'core',
  async handler() {
    const cfg = await readConfig()
    const now = !(cfg.planMode ?? false)
    await writeConfig((d) => {
      d.planMode = now
    })
    return { kind: 'display', text: `Plan mode ${now ? 'enabled' : 'disabled'}.` }
  },
}

const cmdPaths: BuiltinCommand = {
  name: 'paths',
  summary: 'show important WishCode paths on disk',
  category: 'developer',
  async handler() {
    const p = paths()
    const rows = Object.entries(p).map(([k, v]) => `- **${k}**  \`${v}\``)
    return { kind: 'display-md', markdown: '### Paths\n\n' + rows.join('\n') }
  },
}

const cmdSkills: BuiltinCommand = {
  name: 'skills',
  usage: '/skills list | /skills reload',
  summary: 'list or reload skill files',
  category: 'developer',
  async handler({ argv }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { loadSkills, invalidateSkillsCache } = require('../skills/registry') as typeof import('../skills/registry')
    if (argv[0] === 'reload') {
      invalidateSkillsCache()
      const s = await loadSkills()
      return { kind: 'display', text: `Reloaded ${s.length} skills.` }
    }
    const skills = await loadSkills()
    const md = skills
      .map(
        (s) =>
          `- **${s.name}** _(${s.source})_ — ${s.description}`,
      )
      .join('\n')
    return { kind: 'display-md', markdown: '### Skills\n\n' + md }
  },
}

const cmdQuit: BuiltinCommand = {
  name: 'quit',
  aliases: ['exit'],
  summary: 'request the app to quit',
  category: 'core',
  async handler() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { emit } = require('../core/events') as typeof import('../core/events')
    emit('app.quit', undefined)
    return { kind: 'display', text: 'Goodbye.' }
  },
}

// ── Coding commands (prompt transforms) ────────────────────────────
//
// These rewrite the user's message into a focused prompt, then let the
// turn-loop run normally. Plain commands (no args) emit a best-effort
// default brief; commands with args forward them verbatim.

const cmdReview: BuiltinCommand = {
  name: 'review',
  usage: '/review [path or diff summary]',
  summary: 'code review of the current change or a specific path',
  category: 'coding',
  async handler({ argv }) {
    const scope = argv.join(' ').trim()
    const prompt = scope
      ? `Please review ${scope} for bugs, unclear naming, missing edge cases, and security issues. ` +
        'Read the relevant files with fs_read and flag concrete problems with file_path:line references. ' +
        'End with a prioritized fix list.'
      : 'Review the most recently-changed files in the workspace (use fs_glob to find them). ' +
        'Flag bugs, unclear naming, missing edge cases, security issues. Use file_path:line references. ' +
        'End with a prioritized fix list.'
    return { kind: 'prompt', prompt, tag: 'review' }
  },
}

const cmdTest: BuiltinCommand = {
  name: 'test',
  usage: '/test [scope]',
  summary: 'run the project test suite and summarize failures',
  category: 'coding',
  async handler({ argv }) {
    const scope = argv.join(' ').trim()
    const prompt = scope
      ? `Run the tests for ${scope}. Use shell_bash to detect the project's test runner ` +
        '(npm test / pnpm test / pytest / cargo test / go test) and invoke it scoped to this target. ' +
        'Summarize failures with file_path:line references and propose fixes.'
      : 'Run the full project test suite. Use shell_bash to detect the runner ' +
        '(npm test / pnpm test / pytest / cargo test / go test) and invoke it. ' +
        'Summarize failures with file_path:line references and propose fixes.'
    return { kind: 'prompt', prompt, tag: 'test' }
  },
}

const cmdRefactor: BuiltinCommand = {
  name: 'refactor',
  usage: '/refactor <description>',
  summary: 'plan and apply a refactor',
  category: 'coding',
  async handler({ argv }) {
    const desc = argv.join(' ').trim()
    if (!desc) return { kind: 'error', message: 'Usage: /refactor <describe the refactor>' }
    const prompt =
      `Plan and then apply this refactor: ${desc}\n\n` +
      '1. Use fs_glob/fs_grep to map every usage site.\n' +
      '2. Present a short numbered plan.\n' +
      '3. Execute edits via fs_edit (keep changes minimal and type-safe).\n' +
      '4. Run the typechecker/tests to verify.'
    return { kind: 'prompt', prompt, tag: 'refactor' }
  },
}

const cmdInit: BuiltinCommand = {
  name: 'init',
  summary: 'create a CLAUDE.md for this workspace',
  category: 'coding',
  async handler() {
    const prompt =
      'Analyze this workspace and create a CLAUDE.md at the workspace root. Use fs_glob to find ' +
      'package.json/pyproject.toml/Cargo.toml/go.mod, read the top-level README and source tree, and ' +
      'produce a concise file covering: (1) project purpose, (2) how to run/build/test, (3) code layout, ' +
      '(4) coding conventions worth knowing. Write it via fs_write. Keep it under 200 lines.'
    return { kind: 'prompt', prompt, tag: 'init' }
  },
}

// ── Inspection commands (terminal displays) ────────────────────────

const cmdTodos: BuiltinCommand = {
  name: 'todos',
  summary: 'show the current session todo list',
  category: 'tasks',
  async handler({ sessionId }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getTodos } = require('../tools/todo-write') as typeof import('../tools/todo-write')
    const items = getTodos(sessionId)
    if (items.length === 0) return { kind: 'display', text: 'No todos for this session.' }
    const icon = (s: string) => s === 'completed' ? '✓' : s === 'in_progress' ? '▶' : '·'
    const md = items.map((t) => {
      const label = t.status === 'in_progress' ? t.activeForm : t.content
      return `${icon(t.status)} ${label}`
    }).join('\n')
    return { kind: 'display-md', markdown: '### Todos\n\n```\n' + md + '\n```' }
  },
}

const cmdTasks: BuiltinCommand = {
  name: 'tasks',
  summary: 'list background tasks',
  category: 'tasks',
  async handler() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { listTasks } = require('../tasks/manager') as typeof import('../tasks/manager')
    const all = listTasks()
    if (all.length === 0) return { kind: 'display', text: 'No background tasks.' }
    const rows = all.slice(0, 30).map((t) => {
      const when = new Date(t.createdAt).toLocaleString()
      return `- **${t.id}** · _${t.status}_ · ${when} — ${t.title}`
    })
    return { kind: 'display-md', markdown: '### Background tasks\n\n' + rows.join('\n') }
  },
}

const cmdMcp: BuiltinCommand = {
  name: 'mcp',
  usage: '/mcp list | /mcp reload',
  summary: 'list MCP servers or reconnect them',
  category: 'mcp',
  async handler({ argv }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { listServers, shutdownAll } = require('../mcp/manager') as typeof import('../mcp/manager')
    if (argv[0] === 'reload') {
      shutdownAll()
      const servers = await listServers()
      return { kind: 'display', text: `Reconnected ${servers.length} MCP server(s).` }
    }
    const servers = await listServers()
    if (servers.length === 0) {
      const file = require('path').join(paths().configDir, 'mcp.json')
      return {
        kind: 'display-md',
        markdown: `No MCP servers configured. Create **${file}** with a \`{ "servers": { ... } }\` block.`,
      }
    }
    const rows = servers.map((s) => {
      const info = s.serverInfo?.name ? ` · ${s.serverInfo.name} v${s.serverInfo.version ?? '?'}` : ''
      const err = s.error ? ` — _${s.error}_` : ''
      return `- **${s.id}** · _${s.status}_ · ${s.tools.length} tools · ${s.resources.length} resources${info}${err}`
    })
    return { kind: 'display-md', markdown: '### MCP servers\n\n' + rows.join('\n') }
  },
}

const cmdWorkspace: BuiltinCommand = {
  name: 'workspace',
  aliases: ['cwd'],
  usage: '/workspace [path]',
  summary: 'show or change the workspace root',
  category: 'developer',
  async handler({ argv }) {
    if (argv.length === 0) {
      return { kind: 'display', text: `Workspace: ${workspaceRoot()}` }
    }
    const abs = argv.join(' ').trim()
    try {
      setWorkspaceRoot(abs)
      return { kind: 'display', text: `Workspace set to ${workspaceRoot()}` }
    } catch (e) {
      return { kind: 'error', message: (e as Error).message }
    }
  },
}

const cmdCron: BuiltinCommand = {
  name: 'cron',
  usage: '/cron list | /cron run <id> | /cron delete <id> | /cron toggle <id>',
  summary: 'inspect or control scheduled prompts',
  category: 'tasks',
  async handler({ argv }) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sched = require('../cron/scheduler') as typeof import('../cron/scheduler')
    const sub = argv[0] ?? 'list'
    if (sub === 'list') {
      const all = sched.listSchedules()
      if (all.length === 0) return { kind: 'display', text: 'No schedules.' }
      const rows = all.map((s) => {
        const last = s.lastRunAt ? new Date(s.lastRunAt).toLocaleString() : 'never'
        const flag = s.disabled ? ' (disabled)' : ''
        return `- **${s.id}** · \`${s.expression}\` · last: ${last}${flag} — ${s.name}`
      })
      return { kind: 'display-md', markdown: '### Schedules\n\n' + rows.join('\n') }
    }
    const id = argv[1]
    if (!id) return { kind: 'error', message: `Usage: /cron ${sub} <id>` }
    if (sub === 'run') {
      const entry = sched.getSchedule(id)
      if (!entry) return { kind: 'error', message: `no such schedule: ${id}` }
      const taskId = sched.fireSchedule(entry)
      return { kind: 'display', text: taskId ? `Fired ${id} → task ${taskId}` : `Schedule is disabled.` }
    }
    if (sub === 'delete') {
      const ok = sched.deleteSchedule(id)
      return { kind: 'display', text: ok ? `Deleted ${id}.` : `No schedule with id ${id}.` }
    }
    if (sub === 'toggle') {
      const cur = sched.getSchedule(id)
      if (!cur) return { kind: 'error', message: `no such schedule: ${id}` }
      const next = sched.updateSchedule(id, { disabled: !cur.disabled })!
      return { kind: 'display', text: `${id} is now ${next.disabled ? 'disabled' : 'enabled'}.` }
    }
    return { kind: 'error', message: 'Usage: /cron list | /cron run <id> | /cron delete <id> | /cron toggle <id>' }
  },
}

const cmdHooks: BuiltinCommand = {
  name: 'hooks',
  summary: 'show the path to hooks.json',
  category: 'developer',
  async handler() {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const p = require('path') as typeof import('path')
    const file = p.join(paths().configDir, 'hooks.json')
    return {
      kind: 'display-md',
      markdown:
        '### Hooks\n\nEdit **' + file + '**. Schema:\n\n' +
        '```json\n' +
        JSON.stringify({
          PreToolUse: [{ matcher: 'shell_bash|fs_write', hooks: [{ type: 'command', command: 'echo blocked >&2; exit 2' }] }],
          PostToolUse: [{ matcher: '*', hooks: [{ type: 'command', command: 'cat >> ~/.wishcode/audit.log' }] }],
          UserPromptSubmit: [{ hooks: [{ type: 'command', command: 'echo note injected' }] }],
          Stop: [{ hooks: [{ type: 'command', command: 'osascript -e "display notification \\"done\\""' }] }],
        }, null, 2) +
        '\n```',
    }
  },
}

const cmdAgent: BuiltinCommand = {
  name: 'agent',
  usage: '/agent <task>',
  summary: 'spawn a sub-agent to handle a self-contained task',
  category: 'coding',
  async handler({ argv }) {
    const task = argv.join(' ').trim()
    if (!task) return { kind: 'error', message: 'Usage: /agent <self-contained task>' }
    const prompt =
      `Use the \`agent_task\` tool to run this in an isolated sub-session so my main context stays clean:\n\n${task}`
    return { kind: 'prompt', prompt, tag: 'agent' }
  },
}

export const BUILTINS: BuiltinCommand[] = [
  cmdHelp,
  cmdVersion,
  cmdStatus,
  cmdLogin,
  cmdLogout,
  cmdModel,
  cmdClear,
  cmdCompact,
  cmdExport,
  cmdMemoryAdd,
  cmdConfig,
  cmdPlan,
  cmdPaths,
  cmdSkills,
  cmdQuit,
  // Coding
  cmdReview,
  cmdTest,
  cmdRefactor,
  cmdInit,
  cmdAgent,
  // Inspection
  cmdTodos,
  cmdTasks,
  cmdMcp,
  cmdWorkspace,
  cmdCron,
  cmdHooks,
]

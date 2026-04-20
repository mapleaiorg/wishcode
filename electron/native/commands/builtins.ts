/**
 * 16 core slash commands shipped with iBank.
 *
 * Each is a CommandDef with a handler that returns CommandResult. Handlers
 * pull live state from the other native subsystems rather than caching.
 */

import { IBANK_VERSION } from '../core/version'
import { readConfig, writeConfig, paths } from '../core/config'
import { authStatus } from '../auth/auth'
import { modelList, modelSet, currentModel } from '../llm/model'
import {
  addMemory,
  listMemories,
  removeMemory,
  findRelevant,
} from '../memory/memdir'
import { walletStatus, walletAccounts, walletBalancesAll } from '../wallet/status'
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
  summary: 'show the iBank version',
  category: 'core',
  async handler() {
    return { kind: 'display', text: `iBank ${IBANK_VERSION}` }
  },
}

const cmdStatus: BuiltinCommand = {
  name: 'status',
  summary: 'auth / model / wallet overview',
  category: 'core',
  async handler() {
    const [auth, model, wallet] = await Promise.all([
      authStatus(),
      Promise.resolve(currentModel()),
      walletStatus(),
    ])
    const lines = [
      `**Version** ${IBANK_VERSION}`,
      `**Model**   ${model.provider}/${model.model}`,
      `**Auth**    ${
        Object.entries(auth.providers)
          .filter(([, p]: any) => p?.configured)
          .map(([name]) => name)
          .join(', ') || 'none'
      }`,
      `**Wallet**  ${
        wallet.exists
          ? wallet.unlocked
            ? 'unlocked'
            : 'locked'
          : 'not created'
      }`,
    ]
    return { kind: 'display-md', markdown: lines.join('\n\n') }
  },
}

const cmdLogin: BuiltinCommand = {
  name: 'login',
  usage: '/login <anthropic|openai|xai|gemini|ollama|openibank> [key]',
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
      : provider === 'openibank' ? { email: rest }
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

const cmdWallet: BuiltinCommand = {
  name: 'wallet',
  usage: '/wallet status | /wallet accounts | /wallet balances | /wallet lock | /wallet unlock',
  summary: 'wallet operations',
  category: 'wallet',
  async handler({ argv }) {
    const sub = argv[0] ?? 'status'
    if (sub === 'status') {
      const s = await walletStatus()
      return {
        kind: 'display',
        text: s.exists
          ? s.unlocked
            ? `Wallet: unlocked (auto-lock in ${Math.round(s.idleMsRemaining / 1000)}s)`
            : 'Wallet: locked'
          : 'Wallet: not created. Use the Wallet panel to create or import.',
      }
    }
    if (sub === 'accounts') {
      const accounts = await walletAccounts()
      if (accounts.length === 0) return { kind: 'display', text: 'Wallet is locked.' }
      const md = accounts
        .map((a) => `- **${a.chain}**  \`${a.address}\``)
        .join('\n')
      return { kind: 'display-md', markdown: '### Accounts\n\n' + md }
    }
    if (sub === 'balances') {
      const bals = await walletBalancesAll()
      if (bals.length === 0) return { kind: 'display', text: 'Wallet is locked.' }
      const md = bals
        .map(
          (b) =>
            `- **${b.chain}**  ${b.formatted} ${b.symbol}${
              b.usdValue != null ? ` (~$${b.usdValue.toFixed(2)})` : ''
            }`,
        )
        .join('\n')
      return { kind: 'display-md', markdown: '### Balances\n\n' + md }
    }
    if (sub === 'lock') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { lock } = require('../wallet/keystore') as typeof import('../wallet/keystore')
      lock()
      return { kind: 'display', text: 'Wallet locked.' }
    }
    if (sub === 'unlock') {
      return {
        kind: 'display',
        text: 'Open the Wallet panel and enter your passphrase there (chat never receives passphrases).',
      }
    }
    return { kind: 'error', message: 'Usage: /wallet status|accounts|balances|lock|unlock' }
  },
}

const cmdTrade: BuiltinCommand = {
  name: 'trade',
  usage: '/trade price <symbol> | /trade top',
  summary: 'market data lookups',
  category: 'trading',
  async handler({ argv }) {
    const sub = argv[0] ?? 'top'
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const trading = require('../trading/market') as typeof import('../trading/market')
    if (sub === 'price') {
      const sym = argv[1]
      if (!sym) return { kind: 'error', message: 'Usage: /trade price <symbol>' }
      const q = await trading.price(sym)
      if (!q) return { kind: 'display', text: `No quote for ${sym}.` }
      const sign = q.change24hPct >= 0 ? '+' : ''
      return {
        kind: 'display-md',
        markdown: `**${q.symbol}** — $${q.priceUsd.toFixed(q.priceUsd < 1 ? 4 : 2)} (${sign}${q.change24hPct.toFixed(2)}% 24h)`,
      }
    }
    if (sub === 'top') {
      const top = await trading.topTickers(10)
      const md = top
        .map(
          (t, i) =>
            `${i + 1}. **${t.symbol}** $${t.priceUsd.toFixed(2)} (${
              t.change24hPct >= 0 ? '+' : ''
            }${t.change24hPct.toFixed(2)}%)`,
        )
        .join('\n')
      return { kind: 'display-md', markdown: '### Top markets\n\n' + md }
    }
    return { kind: 'error', message: 'Usage: /trade price <sym> | /trade top' }
  },
}

const cmdConfig: BuiltinCommand = {
  name: 'config',
  usage: '/config get <key> | /config set <key> <value>',
  summary: 'view or edit the iBank config',
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
  summary: 'show important iBank paths on disk',
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
  cmdWallet,
  cmdTrade,
  cmdConfig,
  cmdPlan,
  cmdPaths,
  cmdSkills,
  cmdQuit,
]

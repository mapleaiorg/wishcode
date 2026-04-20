/**
 * iBank Desktop — Electron Main Process (native v0.3.1)
 *
 * The CLI-spawn bridge (v0.2.5) has been removed.  Every feature that
 * previously went over JSON-RPC to the CLI now runs in-process under
 * `./native/`:
 *
 *   - chat streaming (anthropic / openai / xai / gemini / ollama)
 *   - OAuth 2.0 + PKCE for Claude Pro/Max
 *   - HD wallet keystore (BIP-39 / BIP-32 / SLIP-0010)
 *   - multi-chain balances & market data
 *   - BM25 long-term memory
 *   - markdown skills (built-in + user)
 *   - slash commands
 *   - QueryEngine turn-loop with tool use + context compaction
 *   - background task manager + swarm
 *
 * The main process wires up:
 *   1. A single BrowserWindow with sandbox + contextIsolation enabled.
 *   2. IPC handlers (`ibank.*` channels) that call into native modules.
 *   3. A fan-out subscription on the native event bus → webContents.send()
 *      so every renderer gets streaming updates.
 */

import { app, BrowserWindow, ipcMain, shell, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

import * as Native from './native/index.js'
import { onAny } from './native/core/events.js'
import { createLogger } from './native/core/logger.js'
import { IBANK_VERSION } from './native/core/version.js'

const log = createLogger('main')

app.setName('OpeniBank')
app.setAboutPanelOptions({
  applicationName: 'OpeniBank',
  applicationVersion: IBANK_VERSION,
  copyright: '© 2026 OpeniBank Research Team',
})

let mainWindow: BrowserWindow | null = null

// ── Window -------------------------------------------------------------------

function createWindow(): void {
  const iconPath = path.join(__dirname, '..', 'build', 'icon.png')
  const icon = fs.existsSync(iconPath) ? nativeImage.createFromPath(iconPath) : undefined
  if (process.platform === 'darwin' && icon && !icon.isEmpty()) {
    app.dock.setIcon(icon)
  }

  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    show: false,
    backgroundColor: '#0b0d12',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 16, y: 16 },
    icon,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false,
      devTools: true,
    },
  })

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    // External links always open in the OS browser, never a new BrowserWindow.
    if (/^https?:\/\//.test(url)) shell.openExternal(url)
    return { action: 'deny' }
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    mainWindow.loadURL(devUrl)
    mainWindow.webContents.openDevTools({ mode: 'detach' })
  } else {
    mainWindow.loadFile(path.join(__dirname, '..', 'dist', 'index.html'))
  }

  mainWindow.on('closed', () => { mainWindow = null })
}

// ── Event bus fan-out → renderer --------------------------------------------

function installEventFanout(): void {
  onAny((channel, payload) => {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) win.webContents.send(`ibank:event:${channel}`, payload)
    }
  })
}

// ── IPC ---------------------------------------------------------------------

type Handler = (...args: any[]) => any | Promise<any>

/** Register a call/response channel. Errors are surfaced as `{ error }`. */
function handle(channel: string, handler: Handler): void {
  ipcMain.handle(channel, async (_evt, ...args) => {
    try {
      const out = await handler(...args)
      return { ok: true, value: out }
    } catch (err) {
      log.warn('ipc error', { channel, err: (err as Error).message })
      return { ok: false, error: (err as Error).message }
    }
  })
}

function installIpcHandlers(): void {
  // ── App
  handle('ibank:app:version', () => ({ version: IBANK_VERSION }))
  handle('ibank:app:paths', () => Native.Config.paths())
  handle('ibank:app:quit', () => { app.quit() })
  handle('ibank:app:openExternal', (url: string) => shell.openExternal(url))
  handle('ibank:app:logs', (limit?: number) => Native.Logger.recentLogs(limit ?? 200))

  // ── Config
  handle('ibank:config:get', (key?: string) => {
    const cfg = Native.Config.readConfig()
    if (!key) return cfg
    return Native.Config.getConfigPath(cfg, key)
  })
  handle('ibank:config:set', (key: string, value: unknown) => {
    Native.Config.mergeConfigPath(key, value as Record<string, any>)
    return true
  })

  // ── Auth
  handle('ibank:auth:status', () => Native.Auth.authStatus())
  handle('ibank:auth:login', (provider: string, creds?: Record<string, any>) =>
    Native.Auth.authLogin(provider as any, creds ?? {}),
  )
  handle('ibank:auth:logout', (provider: string) =>
    Native.Auth.authLogout(provider as any),
  )
  handle('ibank:auth:oauthStart', () => Native.Auth.oauthStart())
  handle('ibank:auth:oauthSubmitCode', (code: string) => Native.Auth.oauthSubmitCode(code))
  handle('ibank:auth:oauthCancel', () => Native.Auth.oauthCancel())

  // ── Model
  handle('ibank:model:list', () => Native.Model.modelList())
  handle('ibank:model:set', (provider: string, name: string) => Native.Model.modelSet(name, provider as any))
  handle('ibank:model:current', () => Native.Model.currentModel())

  // ── Memory
  handle('ibank:memory:add', (input: { body: string; tags?: string[]; pinned?: boolean }) =>
    Native.Memory.addMemory(input.body, { tags: input.tags, pinned: input.pinned }),
  )
  handle('ibank:memory:list', () => Native.Memory.listMemories())
  handle('ibank:memory:remove', (id: string) => Native.Memory.removeMemory(id))
  handle('ibank:memory:update', (id: string, patch: any) => Native.Memory.updateMemory(id, patch))
  handle('ibank:memory:recall', (query: string, limit?: number) => Native.Memory.findRelevant(query, limit ?? 5))

  // ── Wallet
  handle('ibank:wallet:status', () => Native.WalletStatus.walletStatus())
  handle('ibank:wallet:accounts', () => Native.WalletStatus.walletAccounts())
  handle('ibank:wallet:balances', async () => {
    const accounts = await Native.WalletStatus.walletAccounts()
    const symbols = Array.from(new Set(accounts.map((a) => a.symbol)))
    const prices = await Native.Trading.prices(symbols)
    const usd: Record<string, number> = {}
    for (const [s, q] of Object.entries(prices)) usd[s] = q.priceUsd
    return Native.WalletStatus.walletBalancesAll(usd)
  })
  handle('ibank:wallet:create', (passphrase: string, mnemonic?: string) =>
    Native.Keystore.createKeystore({ passphrase, mnemonic }),
  )
  handle('ibank:wallet:unlock', (passphrase: string) => Native.Keystore.unlock(passphrase))
  handle('ibank:wallet:lock', () => Native.Keystore.lock())
  handle('ibank:wallet:revealMnemonic', (passphrase: string) =>
    Native.Keystore.revealMnemonic(passphrase),
  )
  handle('ibank:wallet:remove', (passphrase: string) => Native.Keystore.removeKeystore(passphrase))
  handle('ibank:wallet:policy:get', () => Native.Policy.getPolicy())
  handle('ibank:wallet:policy:set', (patch: any) => Native.Policy.setPolicy(patch))
  handle('ibank:wallet:history', async (chain: string, address: string) =>
    Native.TxHistory.historyFor(chain as any, address),
  )
  handle('ibank:wallet:send:preview', (chain: string, to: string, amount: string) =>
    Native.Send.previewSend(chain as any, to, amount),
  )
  handle('ibank:wallet:send:broadcast', (opts: { chain: string; to: string; amount: string; passphrase?: string }) =>
    Native.Send.sendNative({ ...opts, chain: opts.chain as any }),
  )

  // ── Trading
  handle('ibank:trading:price', (sym: string) => Native.Trading.price(sym))
  handle('ibank:trading:prices', (syms: string[]) => Native.Trading.prices(syms))
  handle('ibank:trading:top', (limit?: number) => Native.Trading.topTickers(limit ?? 25))
  handle('ibank:trading:ohlcv', (sym: string, interval?: any, limit?: number) =>
    Native.Trading.ohlcv(sym, interval, limit),
  )
  handle('ibank:trading:ticker:start', (symbols: string[], intervalMs?: number) =>
    Native.Trading.startTicker(symbols, intervalMs),
  )
  handle('ibank:trading:ticker:stop', () => Native.Trading.stopTicker())
  handle('ibank:trading:source:get', () => Native.Trading.currentSource())
  handle('ibank:trading:source:list', () => Native.Trading.listSources())
  handle('ibank:trading:source:set', (source: string) => Native.Trading.setMarketSource(source as any))

  // ── Skills
  handle('ibank:skills:list', () => Native.Skills.loadSkills())
  handle('ibank:skills:reload', () => {
    Native.Skills.invalidateSkillsCache()
    return Native.Skills.loadSkills()
  })
  handle('ibank:skills:install', (name: string, markdown: string) =>
    Native.Skills.installSkill(name, markdown),
  )
  handle('ibank:skills:uninstall', (name: string) => Native.Skills.uninstallSkill(name))

  // ── Commands (slash)
  handle('ibank:commands:list', () => Native.Commands.allCommands().map((c) => ({
    name: c.name, summary: c.summary, category: c.category, usage: c.usage, aliases: c.aliases ?? [],
  })))
  handle('ibank:commands:run', (sessionId: string, input: string) =>
    Native.Commands.runSlash(sessionId, input),
  )

  // ── Chat / Query
  const abortByRequest = new Map<string, AbortController>()
  handle('ibank:chat:send', async (sessionId: string, requestId: string, text: string, permission?: string) => {
    const ctl = new AbortController()
    abortByRequest.set(requestId, ctl)
    try {
      const res = await Native.Query.run({
        sessionId,
        requestId,
        userText: text,
        permission: (permission as any) ?? 'auto',
        abort: ctl.signal,
      })
      return res
    } finally {
      abortByRequest.delete(requestId)
    }
  })
  handle('ibank:chat:abort', (requestId: string) => {
    const ctl = abortByRequest.get(requestId)
    if (ctl) ctl.abort()
    return !!ctl
  })

  // ── Session / Transcript
  handle('ibank:session:read', (sessionId: string) => Native.Session.readTranscript(sessionId))
  handle('ibank:session:clear', (sessionId: string) => Native.Session.clearTranscript(sessionId))
  handle('ibank:session:compact', (sessionId: string, keepRecent?: number) =>
    Native.Session.compactTranscript(sessionId, { keepRecent }),
  )
  handle('ibank:session:export', (sessionId: string, fmt: 'markdown' | 'json') =>
    Native.Session.exportTranscript(sessionId, fmt),
  )

  // ── Tasks
  handle('ibank:tasks:list', () => Native.Tasks.listTasks())
  handle('ibank:tasks:cancel', (id: string) => Native.Tasks.cancelTask(id))
  handle('ibank:tasks:remove', (id: string) => Native.Tasks.removeTask(id))
  handle('ibank:tasks:clearCompleted', () => Native.Tasks.clearCompleted())

  // ── Swarm
  handle('ibank:swarm:run', (brief: string) => Native.Swarm.runSwarm(brief))

  // ── Buddy
  handle('ibank:buddy:get', () => Native.Buddy.getBuddyView())
  handle('ibank:buddy:dismiss', (id: string) => Native.Buddy.dismissNotification(id))

  // ── NFT
  handle('ibank:nft:list', (chain?: any, owner?: string) =>
    Native.Nft.listNfts({ chain, owner }),
  )
  handle('ibank:nft:refresh', (chain: any, owner: string, fromBlock?: number) =>
    Native.Nft.refreshNfts(chain, owner, { fromBlock }),
  )
  handle('ibank:nft:metadata', (key: string) => Native.Nft.refreshMetadata(key))
  handle('ibank:nft:buildTransfer', (key: string, to: string, amount?: string) => {
    const a = Native.Nft.getNft(key)
    if (!a) throw new Error('unknown NFT key: ' + key)
    return Native.Nft.buildTransferTx(a, to, { amount })
  })
  handle('ibank:nft:clear', () => { Native.Nft.clearNftIndex(); return true })

  // ── CryptoBuddies
  handle('ibank:cryptoBuddies:list', (owner?: string, listed?: boolean) =>
    Native.CryptoBuddies.listBuddies({ owner, listed }),
  )
  handle('ibank:cryptoBuddies:get', (id: string) => Native.CryptoBuddies.getBuddy(id))
  handle('ibank:cryptoBuddies:mint', (opts?: any) => Native.CryptoBuddies.mint(opts ?? {}))
  handle('ibank:cryptoBuddies:breed', (a: string, b: string, opts?: any) =>
    Native.CryptoBuddies.breed(a, b, opts ?? {}),
  )
  handle('ibank:cryptoBuddies:transfer', (id: string, to: string) =>
    Native.CryptoBuddies.transfer(id, to),
  )
  handle('ibank:cryptoBuddies:trade', (a: string, b: string, priceUsd?: number) =>
    Native.CryptoBuddies.trade(a, b, priceUsd),
  )
  handle('ibank:cryptoBuddies:list_for_sale', (id: string, priceUsd: number) =>
    Native.CryptoBuddies.listForSale(id, priceUsd),
  )
  handle('ibank:cryptoBuddies:unlist', (id: string) => Native.CryptoBuddies.unlist(id))
  handle('ibank:cryptoBuddies:retire', (id: string, reason?: string) =>
    Native.CryptoBuddies.retire(id, reason),
  )
  handle('ibank:cryptoBuddies:ensureGenesis', () =>
    Native.CryptoBuddies.ensureGenesisBuddies(),
  )
  handle('ibank:cryptoBuddies:ledger', (limit?: number) =>
    Native.CryptoBuddies.readLedger(limit ?? 200),
  )

  // ── FinancialBuddies
  handle('ibank:financialBuddies:list', () => Native.FinancialBuddies.listPersonas())
  handle('ibank:financialBuddies:get', (id: string) => Native.FinancialBuddies.getPersona(id))
  handle('ibank:financialBuddies:active', () => Native.FinancialBuddies.activePersonaId())
  handle('ibank:financialBuddies:setActive', (id: string) =>
    Native.FinancialBuddies.setActivePersona(id),
  )
  handle('ibank:financialBuddies:override', (id: string, patch: any) =>
    Native.FinancialBuddies.overridePersona(id, patch ?? {}),
  )
  handle('ibank:financialBuddies:reset', () => {
    Native.FinancialBuddies.resetFinancialBuddies(); return true
  })

  // ── Harness
  handle('ibank:harness:backtest', (args: any) => {
    const p = args.params ?? {}
    const S = Native.Harness.STRATEGIES
    const strat =
      args.strategy === 'smaCross'       ? S.smaCross(p.fast, p.slow) :
      args.strategy === 'momentum'       ? S.momentum(p.lookback, p.threshold) :
      args.strategy === 'meanReversion'  ? S.meanReversion(p.lookback, p.zScore) :
                                           S.buyAndHold()
    return Native.Harness.runBacktest({
      symbol: args.symbol, strategy: strat,
      interval: args.interval ?? '1d', limit: args.limit ?? 365,
    })
  })
  handle('ibank:harness:monteCarlo', (args: any) => Native.Harness.runMonteCarlo(args))
  handle('ibank:harness:stress', (args: any) => Native.Harness.runStress(args))
  handle('ibank:harness:yield', (args: any) => Native.Harness.runYield(args))
  handle('ibank:harness:policy', (args: any) => Native.Harness.runPolicyCheck(args))
  handle('ibank:harness:listRuns', (limit?: number) => Native.Harness.listRuns(limit ?? 50))
  handle('ibank:harness:readRun', (runId: string) => Native.Harness.readRun(runId))
  handle('ibank:harness:scenarios', () => Native.Harness.PRESET_SCENARIOS)
}

// ── Lifecycle ---------------------------------------------------------------

app.whenReady().then(() => {
  Native.Config.ensureAllDirs()
  installEventFanout()
  installIpcHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('web-contents-created', (_, contents) => {
  contents.on('will-navigate', (e, url) => {
    if (!url.startsWith('http://localhost') && !url.startsWith('file://')) {
      e.preventDefault()
      shell.openExternal(url)
    }
  })
})

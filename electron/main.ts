/**
 * Wish Code — Electron Main Process
 *
 * In-process AI coding agent runtime (no child CLI):
 *   - chat streaming (anthropic / openai / xai / gemini / ollama / hermon)
 *   - OAuth 2.0 + PKCE for Claude Pro/Max
 *   - QueryEngine turn-loop with tool use + context compaction
 *   - BM25 long-term memory
 *   - markdown skills (built-in + user)
 *   - slash commands
 *   - background task manager + swarm
 *
 * The main process wires up:
 *   1. A single BrowserWindow with sandbox + contextIsolation enabled.
 *   2. IPC handlers (`wish:*` channels) that call into native modules.
 *   3. A fan-out subscription on the native event bus → webContents.send()
 *      so every renderer gets streaming updates.
 */

import { app, BrowserWindow, ipcMain, shell, nativeImage } from 'electron'
import * as path from 'path'
import * as fs from 'fs'

import * as Native from './native/index.js'
import { onAny } from './native/core/events.js'
import { createLogger } from './native/core/logger.js'
import { WISH_VERSION } from './native/core/version.js'

const log = createLogger('main')

app.setName('Wish Code')
app.setAboutPanelOptions({
  applicationName: 'Wish Code',
  applicationVersion: WISH_VERSION,
  copyright: '© 2026 Wish Code',
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
      if (!win.isDestroyed()) win.webContents.send(`wish:event:${channel}`, payload)
    }
  })
}

// ── IPC ---------------------------------------------------------------------

type Handler = (...args: any[]) => any | Promise<any>

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
  handle('wish:app:version', () => ({ version: WISH_VERSION }))
  handle('wish:app:paths', () => Native.Config.paths())
  handle('wish:app:quit', () => { app.quit() })
  handle('wish:app:openExternal', (url: string) => shell.openExternal(url))
  handle('wish:app:logs', (limit?: number) => Native.Logger.recentLogs(limit ?? 200))

  // ── Config
  handle('wish:config:get', (key?: string) => {
    const cfg = Native.Config.readConfig()
    if (!key) return cfg
    return Native.Config.getConfigPath(cfg, key)
  })
  handle('wish:config:set', (key: string, value: unknown) => {
    Native.Config.mergeConfigPath(key, value as Record<string, any>)
    return true
  })

  // ── Auth
  handle('wish:auth:status', () => Native.Auth.authStatus())
  handle('wish:auth:login', (provider: string, creds?: Record<string, any>) =>
    Native.Auth.authLogin(provider as any, creds ?? {}),
  )
  handle('wish:auth:logout', (provider: string) =>
    Native.Auth.authLogout(provider as any),
  )
  handle('wish:auth:oauthStart', () => Native.Auth.oauthStart())
  handle('wish:auth:oauthSubmitCode', (code: string) => Native.Auth.oauthSubmitCode(code))
  handle('wish:auth:oauthCancel', () => Native.Auth.oauthCancel())

  // ── Model
  handle('wish:model:list', () => Native.Model.modelList())
  handle('wish:model:set', (provider: string, name: string) => Native.Model.modelSet(name, provider as any))
  handle('wish:model:current', () => Native.Model.currentModel())

  // ── Memory
  handle('wish:memory:add', (input: { body: string; tags?: string[]; pinned?: boolean }) =>
    Native.Memory.addMemory(input.body, { tags: input.tags, pinned: input.pinned }),
  )
  handle('wish:memory:list', () => Native.Memory.listMemories())
  handle('wish:memory:remove', (id: string) => Native.Memory.removeMemory(id))
  handle('wish:memory:update', (id: string, patch: any) => Native.Memory.updateMemory(id, patch))
  handle('wish:memory:recall', (query: string, limit?: number) => Native.Memory.findRelevant(query, limit ?? 5))

  // ── Skills
  handle('wish:skills:list', () => Native.Skills.loadSkills())
  handle('wish:skills:reload', () => {
    Native.Skills.invalidateSkillsCache()
    return Native.Skills.loadSkills()
  })
  handle('wish:skills:install', (name: string, markdown: string) =>
    Native.Skills.installSkill(name, markdown),
  )
  handle('wish:skills:uninstall', (name: string) => Native.Skills.uninstallSkill(name))

  // ── Commands (slash)
  handle('wish:commands:list', () => Native.Commands.allCommands().map((c) => ({
    name: c.name, summary: c.summary, category: c.category, usage: c.usage, aliases: c.aliases ?? [],
  })))
  handle('wish:commands:run', (sessionId: string, input: string) =>
    Native.Commands.runSlash(sessionId, input),
  )

  // ── Chat / Query
  const abortByRequest = new Map<string, AbortController>()
  handle('wish:chat:send', async (sessionId: string, requestId: string, text: string, permission?: string) => {
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
  handle('wish:chat:abort', (requestId: string) => {
    const ctl = abortByRequest.get(requestId)
    if (ctl) ctl.abort()
    return !!ctl
  })

  // ── Session / Transcript
  handle('wish:session:read', (sessionId: string) => Native.Session.readTranscript(sessionId))
  handle('wish:session:clear', (sessionId: string) => Native.Session.clearTranscript(sessionId))
  handle('wish:session:compact', (sessionId: string, keepRecent?: number) =>
    Native.Session.compactTranscript(sessionId, { keepRecent }),
  )
  handle('wish:session:export', (sessionId: string, fmt: 'markdown' | 'json') =>
    Native.Session.exportTranscript(sessionId, fmt),
  )

  // ── Tasks
  handle('wish:tasks:list', () => Native.Tasks.listTasks())
  handle('wish:tasks:cancel', (id: string) => Native.Tasks.cancelTask(id))
  handle('wish:tasks:remove', (id: string) => Native.Tasks.removeTask(id))
  handle('wish:tasks:clearCompleted', () => Native.Tasks.clearCompleted())

  // ── Swarm
  handle('wish:swarm:run', (brief: string) => Native.Swarm.runSwarm(brief))

  // ── Buddy (coding assistant hints)
  handle('wish:buddy:get', () => Native.Buddy.getBuddyView())
  handle('wish:buddy:dismiss', (id: string) => Native.Buddy.dismissNotification(id))

  // ── Tools (metadata for the palette; execution stays in the turn-loop)
  handle('wish:tools:list', () => Native.Tools.toolsList().map((t) => ({
    name: t.name,
    title: t.title,
    description: t.description,
    category: t.category,
    permission: t.permission,
    dangerous: !!t.dangerous,
    inputSchema: t.inputSchema,
  })))

  // ── ask_user_question round-trip — the tool emits tool.askUser on the bus;
  // the renderer shows a modal and posts the answer back here.
  handle('wish:askUser:answer', async (requestId: string, answer: { choice: string; text?: string }) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { resolveAsk } = require('./native/tools/ask-user.js') as typeof import('./native/tools/ask-user.js')
    return resolveAsk(requestId, answer)
  })

  // ── Workspace root
  handle('wish:workspace:get', () => Native.Config.workspaceRoot())
  handle('wish:workspace:set', (dir: string) => {
    Native.Config.setWorkspaceRoot(dir)
    return Native.Config.workspaceRoot()
  })

  // ── Todos (session-scoped)
  handle('wish:todos:get', (sessionId: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getTodos } = require('./native/tools/todo-write.js') as typeof import('./native/tools/todo-write.js')
    return getTodos(sessionId)
  })

  // ── MCP
  handle('wish:mcp:servers', () => Native.Mcp.listServers())
  handle('wish:mcp:tools', () => Native.Mcp.listAllTools())
  handle('wish:mcp:resources', () => Native.Mcp.listAllResources())
  handle('wish:mcp:callTool', (server: string, tool: string, args?: any) =>
    Native.Mcp.callMcpTool(server, tool, args ?? {}),
  )
  handle('wish:mcp:readResource', (server: string, uri: string) =>
    Native.Mcp.readMcpResource(server, uri),
  )
  handle('wish:mcp:shutdown', () => { Native.Mcp.shutdownAll() })

  // ── Cron
  handle('wish:cron:list', () => Native.Cron.listSchedules())
  handle('wish:cron:create', (input: { name: string; expression: string; prompt: string }) =>
    Native.Cron.createSchedule(input),
  )
  handle('wish:cron:update', (id: string, patch: any) => Native.Cron.updateSchedule(id, patch))
  handle('wish:cron:delete', (id: string) => Native.Cron.deleteSchedule(id))
  handle('wish:cron:runNow', (id: string) => {
    const entry = Native.Cron.getSchedule(id)
    if (!entry) throw new Error(`no such schedule: ${id}`)
    const taskId = Native.Cron.fireSchedule(entry)
    return { taskId }
  })

  // ── Hooks config (read/write the raw JSON — run-time dispatch is in native/hooks)
  handle('wish:hooks:read', () => {
    const file = path.join(Native.Config.paths().configDir, 'hooks.json')
    if (!fs.existsSync(file)) return { file, content: '' }
    return { file, content: fs.readFileSync(file, 'utf8') }
  })
  handle('wish:hooks:write', (content: string) => {
    const file = path.join(Native.Config.paths().configDir, 'hooks.json')
    // Validate JSON before writing so the runner never reads garbage.
    try { JSON.parse(content) } catch (e) { throw new Error('invalid JSON: ' + (e as Error).message) }
    const tmp = file + '.tmp'
    fs.writeFileSync(tmp, content, { mode: 0o600 })
    fs.renameSync(tmp, file)
    return { file }
  })
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

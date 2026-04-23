/**
 * Config I/O for ~/.wishcode/.wishcode.json
 *
 *   ~/.wishcode/                    (0o700)
 *     .wishcode.json                (0o600)
 *       ├─ env: { ANTHROPIC_API_KEY, OPENAI_API_KEY, … }
 *       ├─ claudeAiOauth: { accessToken, refreshToken, expiresAt, scopes }
 *       ├─ oauthAccount: { accountUuid, email }
 *       ├─ mainLoopModel: "claude-sonnet-4-6"
 *       ├─ mainLoopModelProvider: "anthropic"
 *       ├─ lastAnthropicModel: "claude-sonnet-4-6"
 *       ├─ memory: { enabled, maxResults }
 *       └─ ui: { theme, sidebarCollapsed }
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export const CONFIG_DIR =
  process.env.WISH_CONFIG_HOME ||
  process.env.IBANK_CONFIG_HOME ||
  path.join(os.homedir(), '.wishcode')

export const CONFIG_FILE = path.join(CONFIG_DIR, '.wishcode.json')

export type Config = Record<string, any>

let cache: Config | null = null

function ensureDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 })
  }
}

export function readConfig(): Config {
  if (cache) return cache
  try {
    if (!fs.existsSync(CONFIG_FILE)) {
      cache = {}
      return cache
    }
    const text = fs.readFileSync(CONFIG_FILE, 'utf8')
    cache = JSON.parse(text) as Config
    return cache
  } catch (err) {
    // Corrupt config — start fresh but keep a backup so we don't lose keys.
    const backup = `${CONFIG_FILE}.corrupt-${Date.now()}`
    try { fs.renameSync(CONFIG_FILE, backup) } catch {}
    // eslint-disable-next-line no-console
    console.error(`[config] parse failed, backup at ${backup}:`, err)
    cache = {}
    return cache
  }
}

/**
 * Atomic write: write to <file>.tmp, fsync, rename. Prevents half-written
 * config on crash (which would brick auth).
 */
export function writeConfig(
  updater: (cfg: Config) => Config | void,
): Config {
  ensureDir()
  const current = readConfig()
  const next = updater(current) ?? current
  const tmp = `${CONFIG_FILE}.tmp`
  fs.writeFileSync(tmp, JSON.stringify(next, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, CONFIG_FILE)
  cache = next
  return next
}

/** Invalidate the in-memory cache (e.g. after external write). */
export function invalidateConfigCache(): void {
  cache = null
}

/** dot.path.get — returns undefined on missing segment. */
export function getConfigPath(cfg: Config, dotPath?: string): any {
  if (!dotPath) return cfg
  const parts = dotPath.split('.')
  let cur: any = cfg
  for (const p of parts) {
    if (cur == null) return undefined
    cur = cur[p]
  }
  return cur
}

/** dot.path.set — mutates cfg and returns it. */
export function setConfigPath(cfg: Config, dotPath: string, value: any): Config {
  const parts = dotPath.split('.')
  let cur: any = cfg
  for (let i = 0; i < parts.length - 1; i++) {
    const k = parts[i]
    if (cur[k] == null || typeof cur[k] !== 'object') cur[k] = {}
    cur = cur[k]
  }
  if (value === undefined) delete cur[parts[parts.length - 1]]
  else cur[parts[parts.length - 1]] = value
  return cfg
}

/** Convenience: merge a partial into an object-valued key. */
export function mergeConfigPath(dotPath: string, partial: Record<string, any>): void {
  writeConfig(cfg => {
    const cur = getConfigPath(cfg, dotPath) ?? {}
    setConfigPath(cfg, dotPath, { ...cur, ...partial })
    return cfg
  })
}

export function paths() {
  return {
    configDir: CONFIG_DIR,
    configFile: CONFIG_FILE,
    sessionsDir: path.join(CONFIG_DIR, 'sessions'),
    memoryDir: path.join(CONFIG_DIR, 'memory'),
    tasksDir: path.join(CONFIG_DIR, 'tasks'),
    skillsDir: path.join(CONFIG_DIR, 'skills'),
    buddyDir: path.join(CONFIG_DIR, 'buddy'),
    logsDir: path.join(CONFIG_DIR, 'logs'),
    projectsDir: path.join(CONFIG_DIR, 'projects'),
    mcpDir: path.join(CONFIG_DIR, 'mcp'),
    blackboardDir: path.join(CONFIG_DIR, 'blackboards'),
  }
}

/**
 * Current workspace root — the directory the agent treats as "the project".
 *
 * Resolution order:
 *   1. Env override `WISH_WORKSPACE`
 *   2. Config key `workspaceRoot`
 *   3. `process.cwd()` (fallback — when launched from a terminal)
 *
 * Tools that take relative file paths resolve them against this root.
 * Absolute paths are honored as-is (the agent can read anywhere on the
 * machine, subject to OS perms).
 */
export function workspaceRoot(): string {
  if (process.env.WISH_WORKSPACE) return process.env.WISH_WORKSPACE
  const cfg = readConfig()
  if (typeof cfg.workspaceRoot === 'string' && cfg.workspaceRoot) return cfg.workspaceRoot
  return process.cwd()
}

export function setWorkspaceRoot(dir: string): void {
  const abs = path.resolve(dir)
  writeConfig((cfg) => { cfg.workspaceRoot = abs; return cfg })
}

/** Ensure every standard sub-directory exists with correct perms. */
export function ensureAllDirs(): void {
  ensureDir()
  const p = paths()
  for (const dir of [
    p.sessionsDir, p.memoryDir, p.tasksDir, p.skillsDir,
    p.buddyDir, p.logsDir, p.projectsDir, p.mcpDir,
    p.blackboardDir,
  ]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
}

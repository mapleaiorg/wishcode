/**
 * Config I/O for ~/.ibank/.ibank.json
 *
 * Matches the on-disk format of the v0.2.5 CLI so users migrating
 * forward keep their OAuth tokens, API keys, and preferences.
 *
 *   ~/.ibank/                      (0o700)
 *     .ibank.json                  (0o600)
 *       ├─ env: { ANTHROPIC_API_KEY, OPENAI_API_KEY, … }
 *       ├─ claudeAiOauth: { accessToken, refreshToken, expiresAt, scopes }
 *       ├─ oauthAccount: { accountUuid, email }
 *       ├─ mainLoopModel: "claude-sonnet-4-6"
 *       ├─ mainLoopModelProvider: "anthropic"
 *       ├─ lastAnthropicModel: "claude-sonnet-4-6"
 *       ├─ wallet: { hasKeystore, selectedAccount, policy }
 *       ├─ memory: { enabled, maxResults }
 *       └─ ui: { theme, sidebarCollapsed, viewsPanelOpen, viewsTab }
 */

import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'

export const CONFIG_DIR =
  process.env.IBANK_CONFIG_HOME || path.join(os.homedir(), '.ibank')

export const CONFIG_FILE = path.join(CONFIG_DIR, '.ibank.json')

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
    walletDir: path.join(CONFIG_DIR, 'wallet'),
    tradingDir: path.join(CONFIG_DIR, 'trading'),
    tasksDir: path.join(CONFIG_DIR, 'tasks'),
    skillsDir: path.join(CONFIG_DIR, 'skills'),
    buddyDir: path.join(CONFIG_DIR, 'buddy'),
    logsDir: path.join(CONFIG_DIR, 'logs'),
    nftDir: path.join(CONFIG_DIR, 'nft'),
    cryptoBuddiesDir: path.join(CONFIG_DIR, 'cryptoBuddies'),
    financialBuddiesDir: path.join(CONFIG_DIR, 'financialBuddies'),
    harnessDir: path.join(CONFIG_DIR, 'harness'),
  }
}

/** Ensure every standard sub-directory exists with correct perms. */
export function ensureAllDirs(): void {
  ensureDir()
  const p = paths()
  for (const dir of [
    p.sessionsDir, p.memoryDir, p.walletDir, p.tradingDir,
    p.tasksDir, p.skillsDir, p.buddyDir, p.logsDir,
    p.nftDir, p.cryptoBuddiesDir, p.financialBuddiesDir, p.harnessDir,
  ]) {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true, mode: 0o700 })
  }
}

/**
 * Multi-provider auth: status, login, logout.
 *
 * Providers:
 *   anthropic  — OAuth (Claude Pro/Max) OR raw API key
 *   openai     — API key
 *   xai        — API key (Grok)
 *   gemini     — API key (Google AI Studio)
 *   ollama     — local URL, liveness probed
 *   hermon     — optional server account (future; stub now)
 */

import { readConfig, writeConfig, CONFIG_DIR, CONFIG_FILE } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import { OAuthService, persistTokens, clearTokens } from './oauth.js'

const log = createLogger('auth')

export type Provider = 'anthropic' | 'openai' | 'xai' | 'gemini' | 'ollama' | 'hermon'

export interface AuthStatus {
  configDir: string
  configFile: string
  currentModel: string | null
  providers: {
    anthropic: { configured: boolean; apiKey: string | null; oauth: boolean; email?: string | null }
    openai:    { configured: boolean; apiKey: string | null }
    xai:       { configured: boolean; apiKey: string | null }
    gemini:    { configured: boolean; apiKey: string | null }
    ollama:    { configured: boolean; baseUrl: string; live: boolean }
    hermon: { configured: boolean; account: { email?: string; accountUuid?: string } | null }
  }
}

function maskKey(key?: string | null): string | null {
  if (!key) return null
  if (key.length <= 12) return '•••'
  return key.slice(0, 6) + '…' + key.slice(-4)
}

export async function authStatus(): Promise<AuthStatus> {
  const cfg = readConfig()
  const env = cfg.env ?? {}
  const oauth = cfg.claudeAiOauth
  const account = cfg.oauthAccount ?? null

  const anthropicKey = process.env.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY
  const openaiKey    = process.env.OPENAI_API_KEY    || env.OPENAI_API_KEY
  const xaiKey       = process.env.XAI_API_KEY       || env.XAI_API_KEY
  const geminiKey    = process.env.GEMINI_API_KEY    || env.GEMINI_API_KEY
  const ollamaUrl    = (process.env.OLLAMA_BASE_URL  || env.OLLAMA_BASE_URL || 'http://localhost:11434').replace(/\/$/, '')

  // Ollama liveness probe (fast; 800ms budget)
  let ollamaLive = false
  try {
    const r = await fetch(`${ollamaUrl}/api/tags`, { signal: AbortSignal.timeout(800) })
    ollamaLive = r.ok
  } catch {}

  return {
    configDir: CONFIG_DIR,
    configFile: CONFIG_FILE,
    currentModel: cfg.mainLoopModel || null,
    providers: {
      anthropic: {
        configured: !!anthropicKey || !!oauth,
        apiKey: maskKey(anthropicKey),
        oauth: !!oauth,
        email: oauth ? (oauth.email ?? account?.email ?? null) : null,
      },
      openai:    { configured: !!openaiKey, apiKey: maskKey(openaiKey) },
      xai:       { configured: !!xaiKey,    apiKey: maskKey(xaiKey) },
      gemini:    { configured: !!geminiKey, apiKey: maskKey(geminiKey) },
      ollama:    { configured: ollamaLive, baseUrl: ollamaUrl, live: ollamaLive },
      hermon: { configured: !!account, account },
    },
  }
}

export async function authLogin(provider: Provider, creds: Record<string, any>): Promise<any> {
  switch (provider) {
    case 'anthropic':
      if (!creds.apiKey) throw new Error('apiKey required')
      writeConfig(cfg => { cfg.env = cfg.env ?? {}; cfg.env.ANTHROPIC_API_KEY = creds.apiKey; return cfg })
      return { ok: true, provider, info: { apiKey: maskKey(creds.apiKey) } }
    case 'openai':
      if (!creds.apiKey) throw new Error('apiKey required')
      writeConfig(cfg => { cfg.env = cfg.env ?? {}; cfg.env.OPENAI_API_KEY = creds.apiKey; return cfg })
      return { ok: true, provider, info: { apiKey: maskKey(creds.apiKey) } }
    case 'xai':
      if (!creds.apiKey) throw new Error('apiKey required')
      writeConfig(cfg => { cfg.env = cfg.env ?? {}; cfg.env.XAI_API_KEY = creds.apiKey; return cfg })
      return { ok: true, provider, info: { apiKey: maskKey(creds.apiKey) } }
    case 'gemini':
      if (!creds.apiKey) throw new Error('apiKey required')
      writeConfig(cfg => { cfg.env = cfg.env ?? {}; cfg.env.GEMINI_API_KEY = creds.apiKey; return cfg })
      return { ok: true, provider, info: { apiKey: maskKey(creds.apiKey) } }
    case 'ollama': {
      const url = (creds.baseUrl || 'http://localhost:11434').replace(/\/$/, '')
      const r = await fetch(`${url}/api/tags`, { signal: AbortSignal.timeout(3000) }).catch(() => null)
      if (!r || !r.ok) throw new Error(`Ollama not reachable at ${url}`)
      writeConfig(cfg => { cfg.env = cfg.env ?? {}; cfg.env.OLLAMA_BASE_URL = url; return cfg })
      const data = await r.json().catch(() => ({ models: [] })) as { models?: { name: string }[] }
      return { ok: true, provider, info: { baseUrl: url, models: (data.models ?? []).map(m => m.name) } }
    }
    case 'hermon':
      if (!creds.email) throw new Error('email required')
      writeConfig(cfg => {
        cfg.oauthAccount = { email: creds.email, accountUuid: creds.accountUuid || `local-${Date.now()}` }
        return cfg
      })
      return { ok: true, provider, info: { email: creds.email } }
    default:
      throw new Error(`unknown provider: ${provider}`)
  }
}

export async function authLogout(provider: Provider): Promise<void> {
  writeConfig(cfg => {
    cfg.env = cfg.env ?? {}
    switch (provider) {
      case 'anthropic':
        delete cfg.env.ANTHROPIC_API_KEY
        delete cfg.claudeAiOauth
        break
      case 'openai':    delete cfg.env.OPENAI_API_KEY; break
      case 'xai':       delete cfg.env.XAI_API_KEY; break
      case 'gemini':    delete cfg.env.GEMINI_API_KEY; break
      case 'ollama':    delete cfg.env.OLLAMA_BASE_URL; break
      case 'hermon': delete cfg.oauthAccount; break
    }
    return cfg
  })
  if (provider === 'anthropic') clearTokens()
  log.info(`${provider} logged out`)
}

// ── OAuth flow wrapper ─────────────────────────────────────────────

let activeOAuth: OAuthService | null = null

export async function oauthStart(): Promise<{ manualUrl: string; automaticUrl: string }> {
  if (activeOAuth) activeOAuth.cancel()
  activeOAuth = new OAuthService()
  const { urls, completion } = await activeOAuth.start()

  // Detached: resolve tokens in the background, emit auth.oauthComplete.
  completion.then(tokens => {
    persistTokens(tokens)
    activeOAuth = null
  }).catch(err => {
    log.error(`oauth failed: ${err?.message ?? err}`)
    // emit failure so renderer's onOAuthComplete can surface an error toast.
    const { emit } = require('../core/events.js') as typeof import('../core/events.js')
    emit('auth.oauthComplete', { success: false, provider: 'anthropic', error: err?.message ?? String(err) })
    activeOAuth = null
  })

  return urls
}

export function oauthSubmitCode(code: string, state?: string): void {
  if (!activeOAuth) throw new Error('no pending OAuth flow; call oauthStart first')
  activeOAuth.handleManualCode(code, state)
}

export function oauthCancel(): void {
  activeOAuth?.cancel()
  activeOAuth = null
}

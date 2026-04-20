/**
 * Claude (Anthropic) OAuth 2.0 + PKCE flow, fully native.
 *
 * Replaces the CLI's services/oauth/{client,index,crypto,auth-code-listener}.ts.
 *
 * Flow:
 *   1. OAuthService spawns a loopback HTTP server on a random high port.
 *   2. Builds two authorize URLs:
 *        • automatic  → redirect_uri = http://localhost:<port>/callback
 *        • manual     → redirect_uri = https://platform.claude.com/oauth/code/callback
 *      Caller gets both URLs; typically the renderer opens `automatic` in
 *      the system browser and shows `manual` as a "Paste code" fallback.
 *   3. User authorizes → browser redirects to localhost (automatic) or to
 *      the Anthropic success page (manual). Manual flow requires the user
 *      to paste the short code into the renderer, which calls handleCode().
 *   4. exchangeCodeForTokens() POSTs to TOKEN_URL with PKCE verifier,
 *      state, and authorization_code grant.
 *   5. Tokens persisted to config under `claudeAiOauth`.
 *
 * Refresh: getValidToken() transparently refreshes when expiry < 5min.
 *
 * Token scope required for /v1/messages: `user:inference`.
 */

import { createHash, randomBytes } from 'crypto'
import { createServer, IncomingMessage, Server, ServerResponse } from 'http'
import type { AddressInfo } from 'net'
import { writeConfig, readConfig } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import { emit } from '../core/events.js'

const log = createLogger('oauth')

// ── OAuth constants (prod) ─────────────────────────────────────────
// All URLs + CLIENT_ID mirror the CLI's constants/oauth.ts so tokens
// we produce here are accepted by the same Anthropic backend pool.

const CLIENT_ID = '9d1c250a-e61b-44d9-88ed-5944d1962f5e'
const AUTHORIZE_URL = 'https://claude.com/cai/oauth/authorize'
const TOKEN_URL = 'https://platform.claude.com/v1/oauth/token'
const MANUAL_REDIRECT = 'https://platform.claude.com/oauth/code/callback'
const SUCCESS_URL = 'https://platform.claude.com/oauth/code/success?app=claude-code'

const SCOPES = [
  'user:profile',
  'user:inference',
  'user:sessions:claude_code',
  'user:mcp_servers',
  'user:file_upload',
] as const

const REFRESH_BUFFER_MS = 5 * 60 * 1000

// ── PKCE helpers ───────────────────────────────────────────────────

function base64url(buf: Buffer): string {
  return buf.toString('base64')
    .replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '')
}

function generateVerifier(): string { return base64url(randomBytes(32)) }
function generateChallenge(v: string): string {
  return base64url(createHash('sha256').update(v).digest())
}
function generateState(): string { return base64url(randomBytes(32)) }

// ── Loopback server ────────────────────────────────────────────────

class CallbackListener {
  private server: Server
  private port = 0
  private pendingRes: ServerResponse | null = null
  private resolver: ((code: string) => void) | null = null
  private rejecter: ((err: Error) => void) | null = null
  private expectedState: string | null = null

  constructor() { this.server = createServer() }

  start(): Promise<number> {
    return new Promise((resolve, reject) => {
      this.server.once('error', err => reject(new Error(`listener: ${err.message}`)))
      this.server.listen(0, 'localhost', () => {
        this.port = (this.server.address() as AddressInfo).port
        resolve(this.port)
      })
    })
  }

  getPort(): number { return this.port }
  hasPendingResponse(): boolean { return this.pendingRes !== null }

  waitFor(state: string, onReady: () => Promise<void>): Promise<string> {
    return new Promise((resolve, reject) => {
      this.resolver = resolve
      this.rejecter = reject
      this.expectedState = state
      this.server.on('request', (req, res) => this.handle(req, res))
      this.server.on('error', err => { this.close(); reject(err) })
      void onReady()
    })
  }

  private handle(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '', `http://${req.headers.host || 'localhost'}`)
    if (url.pathname !== '/callback') {
      res.writeHead(404); res.end(); return
    }
    const code = url.searchParams.get('code') ?? undefined
    const state = url.searchParams.get('state') ?? undefined
    if (!code) {
      res.writeHead(400); res.end('Authorization code not found')
      this.rejecter?.(new Error('no code'))
      return
    }
    if (state !== this.expectedState) {
      res.writeHead(400); res.end('Invalid state parameter')
      this.rejecter?.(new Error('invalid state (CSRF)'))
      return
    }
    // Hold the response open — we'll redirect after successful exchange.
    this.pendingRes = res
    this.resolver?.(code)
  }

  redirectSuccess(): void {
    if (!this.pendingRes) return
    this.pendingRes.writeHead(302, { Location: SUCCESS_URL })
    this.pendingRes.end()
    this.pendingRes = null
  }

  close(): void {
    if (this.pendingRes && !this.pendingRes.writableEnded) {
      try {
        this.pendingRes.writeHead(302, { Location: SUCCESS_URL })
        this.pendingRes.end()
      } catch {}
      this.pendingRes = null
    }
    try { this.server.removeAllListeners(); this.server.close() } catch {}
  }
}

// ── URL builders ───────────────────────────────────────────────────

function buildAuthUrl(opts: {
  codeChallenge: string
  state: string
  port: number
  isManual: boolean
}): string {
  const u = new URL(AUTHORIZE_URL)
  u.searchParams.set('code', 'true')
  u.searchParams.set('client_id', CLIENT_ID)
  u.searchParams.set('response_type', 'code')
  u.searchParams.set(
    'redirect_uri',
    opts.isManual ? MANUAL_REDIRECT : `http://localhost:${opts.port}/callback`,
  )
  u.searchParams.set('scope', SCOPES.join(' '))
  u.searchParams.set('code_challenge', opts.codeChallenge)
  u.searchParams.set('code_challenge_method', 'S256')
  u.searchParams.set('state', opts.state)
  return u.toString()
}

// ── Token exchange ─────────────────────────────────────────────────

interface TokenResponse {
  access_token: string
  refresh_token: string
  expires_in: number
  scope?: string
  account?: { uuid: string; email_address: string }
  organization?: { uuid: string }
}

async function exchangeCodeForTokens(args: {
  code: string
  state: string
  verifier: string
  port: number
  isManual: boolean
}): Promise<TokenResponse> {
  const body: Record<string, string> = {
    grant_type: 'authorization_code',
    code: args.code,
    redirect_uri: args.isManual
      ? MANUAL_REDIRECT
      : `http://localhost:${args.port}/callback`,
    client_id: CLIENT_ID,
    code_verifier: args.verifier,
    state: args.state,
  }
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok) {
    const t = await r.text().catch(() => '')
    throw new Error(`token exchange failed (${r.status}): ${t.slice(0, 200)}`)
  }
  return r.json() as Promise<TokenResponse>
}

async function refreshTokens(refreshToken: string): Promise<TokenResponse> {
  const body = {
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
    client_id: CLIENT_ID,
    scope: SCOPES.join(' '),
  }
  const r = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  if (!r.ok) throw new Error(`refresh failed (${r.status})`)
  return r.json() as Promise<TokenResponse>
}

// ── Public OAuthService ────────────────────────────────────────────

export interface OAuthStartResult {
  manualUrl: string
  automaticUrl: string
}

export class OAuthService {
  private verifier = generateVerifier()
  private state = generateState()
  private listener: CallbackListener | null = null
  private port = 0
  private manualCodeResolver: ((code: string) => void) | null = null
  private flowPromise: Promise<TokenResponse> | null = null

  /**
   * Open the flow. Returns both URLs synchronously so the caller can show
   * the manual fallback immediately while opening the automatic URL in the
   * browser. The returned Promise resolves when tokens land.
   */
  async start(): Promise<{ urls: OAuthStartResult; completion: Promise<TokenResponse> }> {
    this.listener = new CallbackListener()
    this.port = await this.listener.start()
    const codeChallenge = generateChallenge(this.verifier)

    const manualUrl = buildAuthUrl({
      codeChallenge, state: this.state, port: this.port, isManual: true,
    })
    const automaticUrl = buildAuthUrl({
      codeChallenge, state: this.state, port: this.port, isManual: false,
    })

    const codePromise = new Promise<string>((resolve, reject) => {
      this.manualCodeResolver = resolve
      // Automatic flow (loopback) — resolves as soon as browser hits /callback.
      this.listener!.waitFor(this.state, async () => {}).then(resolve).catch(reject)
    })

    this.flowPromise = (async () => {
      const code = await codePromise
      const isAutomatic = this.listener!.hasPendingResponse()
      log.info(`code received (${isAutomatic ? 'automatic' : 'manual'})`)
      try {
        const tokens = await exchangeCodeForTokens({
          code, state: this.state, verifier: this.verifier,
          port: this.port, isManual: !isAutomatic,
        })
        if (isAutomatic) this.listener!.redirectSuccess()
        return tokens
      } finally {
        this.listener?.close()
        this.listener = null
        this.manualCodeResolver = null
      }
    })()

    return { urls: { manualUrl, automaticUrl }, completion: this.flowPromise }
  }

  /** Called when the user pastes the manual code. */
  handleManualCode(code: string, state?: string): void {
    if (state && state !== this.state) {
      log.warn('manual code state mismatch — accepting anyway (claude.com does not echo state on manual callback)')
    }
    if (!this.manualCodeResolver) throw new Error('no pending manual code')
    this.manualCodeResolver(code)
  }

  cancel(): void {
    this.listener?.close()
    this.listener = null
    this.manualCodeResolver = null
  }
}

// ── Token persistence ──────────────────────────────────────────────

export interface StoredOAuth {
  accessToken: string
  refreshToken: string
  expiresAt: number
  scopes: string[]
  accountUuid?: string
  email?: string
}

export function persistTokens(t: TokenResponse): StoredOAuth {
  const scopes = (t.scope ?? SCOPES.join(' ')).split(' ').filter(Boolean)
  const stored: StoredOAuth = {
    accessToken: t.access_token,
    refreshToken: t.refresh_token,
    expiresAt: Date.now() + t.expires_in * 1000,
    scopes,
    accountUuid: t.account?.uuid,
    email: t.account?.email_address,
  }
  writeConfig(cfg => {
    cfg.claudeAiOauth = stored
    if (t.account) {
      cfg.oauthAccount = {
        accountUuid: t.account.uuid,
        email: t.account.email_address,
      }
    }
    return cfg
  })
  emit('auth.oauthComplete', {
    success: true,
    provider: 'anthropic',
    email: stored.email,
    accountUuid: stored.accountUuid,
  })
  return stored
}

/** Return a valid Anthropic OAuth token, refreshing if near expiry. */
export async function getValidToken(): Promise<string | null> {
  const cfg = readConfig()
  const oauth = cfg.claudeAiOauth as StoredOAuth | undefined
  if (!oauth?.accessToken) return null
  if (!oauth.scopes?.includes('user:inference')) {
    log.warn('stored token lacks user:inference scope')
    return null
  }
  const nearExpiry = oauth.expiresAt && (oauth.expiresAt - Date.now()) < REFRESH_BUFFER_MS
  if (!nearExpiry) return oauth.accessToken
  if (!oauth.refreshToken) {
    log.warn('token expired, no refresh token')
    return oauth.accessToken
  }
  try {
    log.info('refreshing OAuth token')
    const fresh = await refreshTokens(oauth.refreshToken)
    const stored = persistTokens(fresh)
    // persistTokens overwrites accountUuid only if fresh.account is present;
    // preserve previous value if the refresh response omits it.
    if (!fresh.account && oauth.accountUuid) {
      writeConfig(cfg => {
        cfg.claudeAiOauth.accountUuid = oauth.accountUuid
        cfg.claudeAiOauth.email = oauth.email
        return cfg
      })
    }
    return stored.accessToken
  } catch (err: any) {
    log.error(`token refresh failed: ${err?.message ?? err}`)
    return oauth.accessToken // fall back to stale — caller will see 401 if truly dead
  }
}

export function clearTokens(): void {
  writeConfig(cfg => {
    delete cfg.claudeAiOauth
    delete cfg.oauthAccount
    return cfg
  })
}

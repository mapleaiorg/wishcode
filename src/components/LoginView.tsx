/**
 * LoginView — provider-by-provider sign-in panel.
 *
 * Sections, top-to-bottom:
 *   1. Ollama (local)      — status probe only, no key
 *   2. Anthropic (Claude)  — OAuth (Pro/Max subscription) OR API key
 *   3. OpenAI              — API key
 *   4. xAI Grok            — API key
 *   5. Google Gemini       — API key
 *   6. Hermon              — API key (optional backend)
 *
 * Every row has real buttons wired to window.wish.auth.{login,logout,oauth*}.
 * There are no stubs — an empty API-key field simply disables the save
 * button; Ollama is treated as "live" when the /api/tags probe returns ok.
 */

import React, { useCallback, useEffect, useState } from 'react'
import {
  CheckCircle2, CircleSlash, LogIn, LogOut, ExternalLink, Copy, RefreshCw, X,
} from 'lucide-react'
import type { AuthStatusResponse, Provider } from '../types'

interface Props {
  onClose(): void
  /** called whenever the auth set changes (key saved, logout, oauth finished) */
  onChanged?: () => void
}

type ApiProv = Exclude<Provider, 'ollama'>

const CLOUD_PROVIDERS: Array<{ id: ApiProv; label: string; signupUrl?: string; keyPlaceholder: string }> = [
  { id: 'openai',    label: 'OpenAI',          signupUrl: 'https://platform.openai.com/api-keys',       keyPlaceholder: 'sk-...' },
  { id: 'xai',       label: 'xAI Grok',        signupUrl: 'https://console.x.ai',                        keyPlaceholder: 'xai-...' },
  { id: 'gemini',    label: 'Google Gemini',   signupUrl: 'https://aistudio.google.com/apikey',          keyPlaceholder: 'AIza...' },
  { id: 'hermon',    label: 'Hermon',          signupUrl: 'https://hermon.ai',                           keyPlaceholder: 'hm-...' },
]

export function LoginView({ onClose, onChanged }: Props) {
  const [status, setStatus] = useState<AuthStatusResponse | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [keyDrafts, setKeyDrafts] = useState<Record<string, string>>({})
  const [oauth, setOauth] = useState<{ manualUrl: string; automaticUrl: string } | null>(null)
  const [oauthCode, setOauthCode] = useState('')
  const [anthropicKey, setAnthropicKey] = useState('')

  const refresh = useCallback(async () => {
    try { setStatus(await window.wish.auth.status()) }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  // pick up oauth-complete events from main
  useEffect(() => {
    return window.wish?.auth.onOAuthComplete(() => {
      setOauth(null); setOauthCode('')
      void refresh()
      onChanged?.()
    })
  }, [refresh, onChanged])

  const saveKey = async (provider: ApiProv, key: string) => {
    if (!key.trim()) return
    setBusy(provider); setErr(null)
    try {
      await window.wish.auth.login(provider, { apiKey: key.trim() })
      setKeyDrafts((d) => ({ ...d, [provider]: '' }))
      await refresh()
      onChanged?.()
    } catch (e: any) { setErr(`${provider}: ${e?.message ?? String(e)}`) }
    finally { setBusy(null) }
  }

  const logout = async (provider: Provider) => {
    setBusy(provider); setErr(null)
    try {
      await window.wish.auth.logout(provider)
      await refresh()
      onChanged?.()
    } catch (e: any) { setErr(`${provider}: ${e?.message ?? String(e)}`) }
    finally { setBusy(null) }
  }

  const startOauth = async () => {
    setBusy('anthropic-oauth'); setErr(null)
    try {
      const o = await window.wish.auth.oauthStart()
      setOauth(o)
      await window.wish.app.openExternal(o.automaticUrl ?? o.manualUrl)
    } catch (e: any) { setErr(`anthropic oauth: ${e?.message ?? String(e)}`) }
    finally { setBusy(null) }
  }

  const submitOauthCode = async () => {
    if (!oauthCode.trim()) return
    setBusy('anthropic-oauth'); setErr(null)
    try {
      await window.wish.auth.oauthSubmitCode(oauthCode.trim())
      setOauth(null); setOauthCode('')
      await refresh()
      onChanged?.()
    } catch (e: any) { setErr(`anthropic oauth: ${e?.message ?? String(e)}`) }
    finally { setBusy(null) }
  }

  const cancelOauth = async () => {
    try { await window.wish.auth.oauthCancel() } catch {}
    setOauth(null); setOauthCode('')
  }

  const copyUrl = async (url: string) => {
    try { await navigator.clipboard.writeText(url) } catch {}
  }

  if (!status) {
    return (
      <div className="wsh-panel">
        <header className="wsh-panel-head">
          <h2>Login / Remote Models</h2>
          <div className="wsh-panel-head-actions">
            <button className="wsh-btn" onClick={onClose}><X size={12} /> Close</button>
          </div>
        </header>
        <p>Loading…</p>
      </div>
    )
  }

  const p = status.providers

  return (
    <div className="wsh-panel">
      <header className="wsh-panel-head">
        <h2>Login / Remote Models</h2>
        <div className="wsh-panel-head-actions">
          <button className="wsh-btn" onClick={() => void refresh()} title="Refresh">
            <RefreshCw size={12} /> Refresh
          </button>
          <button className="wsh-btn" onClick={onClose}><X size={12} /> Close</button>
        </div>
      </header>

      <p style={{ color: 'var(--text-dim)', maxWidth: 640 }}>
        Wish Code runs local-first. If you have Ollama installed, you can chat without any cloud key.
        For richer models, sign in to one or more providers below — keys are saved encrypted in
        your config dir and never leave your machine.
      </p>

      {err && <div className="wsh-helper warn">{err}</div>}

      {/* ── Ollama ── */}
      <section className="wsh-card" style={{ padding: 14 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ flex: 1 }}>🦙 Ollama (local, recommended)</strong>
          {p.ollama.live
            ? <span className="pill" style={{ color: 'var(--ok)' }}><CheckCircle2 size={11} /> live</span>
            : <span className="pill" style={{ color: 'var(--text-mute)' }}><CircleSlash size={11} /> offline</span>}
        </header>
        <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '8px 0' }}>
          Probed at <code>{p.ollama.baseUrl}</code>. Install from
          {' '}<a href="#" onClick={(e) => { e.preventDefault(); window.wish.app.openExternal('https://ollama.com/download') }}>ollama.com/download</a>
          {' '}then run <code>ollama pull llama3.2</code>. The model picker will list whatever is installed.
        </p>
      </section>

      {/* ── Anthropic ── */}
      <section className="wsh-card" style={{ padding: 14 }}>
        <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <strong style={{ flex: 1 }}>Anthropic · Claude</strong>
          {p.anthropic.configured
            ? <span className="pill" style={{ color: 'var(--ok)' }}>
                <CheckCircle2 size={11} /> {p.anthropic.oauth ? `OAuth · ${p.anthropic.email ?? 'signed in'}` : 'API key'}
              </span>
            : <span className="pill" style={{ color: 'var(--text-mute)' }}><CircleSlash size={11} /> not configured</span>}
          {p.anthropic.configured && (
            <button className="wsh-btn" onClick={() => void logout('anthropic')} disabled={busy === 'anthropic'}>
              <LogOut size={12} /> Sign out
            </button>
          )}
        </header>

        {!oauth && !p.anthropic.configured && (
          <>
            <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: '8px 0 10px' }}>
              <strong>Pro / Max subscribers</strong>: authorize with your Claude account to use your subscription quota.
              <br />
              <strong>Developers</strong>: paste an API key from <a href="#" onClick={(e) => { e.preventDefault(); window.wish.app.openExternal('https://console.anthropic.com/settings/keys') }}>console.anthropic.com</a>.
            </p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <button className="wsh-btn primary" onClick={startOauth} disabled={busy === 'anthropic-oauth'}>
                <ExternalLink size={12} /> Authorize via platform.claude.com
              </button>
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
              <input
                className="wsh-input" type="password" placeholder="sk-ant-..."
                value={anthropicKey} onChange={(e) => setAnthropicKey(e.target.value)}
                style={{ flex: 1 }}
              />
              <button
                className="wsh-btn"
                onClick={() => void saveKey('anthropic', anthropicKey).then(() => setAnthropicKey(''))}
                disabled={!anthropicKey.trim() || busy === 'anthropic'}
              >
                <LogIn size={12} /> Save key
              </button>
            </div>
          </>
        )}

        {oauth && (
          <div style={{ marginTop: 10 }}>
            <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>
              A browser tab should have opened for <code>platform.claude.com</code>. After you approve,
              you'll be redirected to a page that shows a one-time code — paste it here:
            </p>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 8 }}>
              <input
                className="wsh-input" placeholder="Paste callback code…" autoFocus
                value={oauthCode} onChange={(e) => setOauthCode(e.target.value)}
                style={{ flex: 1 }}
              />
              <button className="wsh-btn primary" disabled={!oauthCode.trim() || busy === 'anthropic-oauth'} onClick={() => void submitOauthCode()}>
                Submit
              </button>
              <button className="wsh-btn" onClick={() => void cancelOauth()}>Cancel</button>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10, fontSize: 11, color: 'var(--text-mute)' }}>
              <span>Didn't open?</span>
              <button className="wsh-btn" onClick={() => window.wish.app.openExternal(oauth.automaticUrl)}>
                <ExternalLink size={11} /> Open in browser
              </button>
              <button className="wsh-btn" onClick={() => void copyUrl(oauth.manualUrl)}>
                <Copy size={11} /> Copy URL
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ── Remaining API-key providers ── */}
      {CLOUD_PROVIDERS.map((prov) => {
        const info = (p as any)[prov.id] as { configured: boolean; apiKey?: string | null } | undefined
        const draft = keyDrafts[prov.id] ?? ''
        return (
          <section key={prov.id} className="wsh-card" style={{ padding: 14 }}>
            <header style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <strong style={{ flex: 1 }}>{prov.label}</strong>
              {info?.configured
                ? <span className="pill" style={{ color: 'var(--ok)' }}>
                    <CheckCircle2 size={11} /> {info.apiKey ?? 'configured'}
                  </span>
                : <span className="pill" style={{ color: 'var(--text-mute)' }}><CircleSlash size={11} /> not configured</span>}
              {info?.configured && (
                <button className="wsh-btn" onClick={() => void logout(prov.id)} disabled={busy === prov.id}>
                  <LogOut size={12} /> Sign out
                </button>
              )}
            </header>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, alignItems: 'center' }}>
              <input
                className="wsh-input" type="password" placeholder={prov.keyPlaceholder}
                value={draft}
                onChange={(e) => setKeyDrafts((d) => ({ ...d, [prov.id]: e.target.value }))}
                style={{ flex: 1 }}
              />
              <button
                className="wsh-btn primary"
                onClick={() => void saveKey(prov.id, draft)}
                disabled={!draft.trim() || busy === prov.id}
              >
                <LogIn size={12} /> Save
              </button>
              {prov.signupUrl && (
                <button className="wsh-btn" onClick={() => window.wish.app.openExternal(prov.signupUrl!)}>
                  <ExternalLink size={11} /> Get key
                </button>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

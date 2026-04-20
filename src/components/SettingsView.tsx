/**
 * SettingsView — model selection, wallet policy, app diagnostics.
 *
 * Auth / API keys live in the dedicated LoginView. This view covers the
 * remaining three concerns so each surface does one job well.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { X, RefreshCw, Sun, Moon, Monitor } from 'lucide-react'
import type { CurrentModel, ModelEntry } from '../types'
import type { ResolvedTheme, ThemeChoice } from '../hooks/useTheme'

interface Props {
  onClose(): void
  onOpenLogin(): void
  onModelChanged?(next: CurrentModel): void
  themeChoice: ThemeChoice
  resolvedTheme: ResolvedTheme
  onThemeChange(next: ThemeChoice): void
}

type Tab = 'model' | 'appearance' | 'market' | 'policy' | 'app'

const THEME_OPTIONS: Array<{ id: ThemeChoice; label: string; icon: React.ReactNode; note: string }> = [
  { id: 'light',  label: 'Light',  icon: <Sun size={13} />,     note: 'Bright workspace with softer borders.' },
  { id: 'dark',   label: 'Dark',   icon: <Moon size={13} />,    note: 'Low-glare workspace for focused chats.' },
  { id: 'system', label: 'System', icon: <Monitor size={13} />, note: 'Automatically follows macOS appearance.' },
]

export function SettingsView({
  onClose,
  onOpenLogin,
  onModelChanged,
  themeChoice,
  resolvedTheme,
  onThemeChange,
}: Props) {
  const [tab, setTab] = useState<Tab>('model')
  const [models, setModels] = useState<ModelEntry[]>([])
  const [current, setCurrent] = useState<CurrentModel | null>(null)
  const [policy, setPolicy] = useState<any>(null)
  const [paths, setPaths] = useState<Record<string, string>>({})
  const [version, setVersion] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)
  const [marketSource, setMarketSourceState] = useState<string>('binance')
  const [marketSources, setMarketSources] = useState<Array<{ id: string; label: string; note: string }>>([])

  const refresh = useCallback(async () => {
    setErr(null)
    try {
      const res: any = await window.ibank.model.list()
      const list: ModelEntry[] = Array.isArray(res) ? res : (res?.available ?? [])
      setModels(list)
      setCurrent(await window.ibank.model.current() as CurrentModel)
      setPolicy(await window.ibank.wallet.policyGet())
      setPaths(await window.ibank.app.paths())
      setVersion((await window.ibank.app.version()).version)
      try {
        setMarketSources(await window.ibank.trading.sourceList())
        setMarketSourceState(await window.ibank.trading.sourceGet())
      } catch {}
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const pickModel = async (provider: string, name: string) => {
    try {
      await window.ibank.model.set(provider, name)
      const cur = await window.ibank.model.current() as CurrentModel
      setCurrent(cur)
      onModelChanged?.(cur)
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  const savePolicy = async (patch: any) => {
    try { setPolicy(await window.ibank.wallet.policySet(patch)) }
    catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  return (
    <div className="ibn-panel">
      <header className="ibn-panel-head">
        <h2>Settings</h2>
        <div className="ibn-panel-head-actions">
          <button className="ibn-btn" onClick={() => void refresh()}><RefreshCw size={12} /> Refresh</button>
          <button className="ibn-btn" onClick={onClose}><X size={12} /> Close</button>
        </div>
      </header>

      <nav className="ibn-tabs">
        {(['model', 'appearance', 'market', 'policy', 'app'] as Tab[]).map((t) => (
          <button key={t} className={`ibn-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'model' && 'Models'}
            {t === 'appearance' && 'Appearance'}
            {t === 'market' && 'Market data'}
            {t === 'policy' && 'Wallet policy'}
            {t === 'app' && 'About'}
          </button>
        ))}
      </nav>

      {err && <div className="ibn-helper warn">{err}</div>}

      {tab === 'model' && (
        <section className="ibn-card" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>
            Active: <code>{current ? `${current.provider}/${current.model}` : '—'}</code>
          </h3>
          {models.length === 0 ? (
            <div className="ibn-helper info">
              No models yet. <button className="ibn-btn" onClick={onOpenLogin}>Open Login</button> to add a provider,
              or install Ollama for a local model.
            </div>
          ) : (
            <table className="ibn-table">
              <thead><tr><th>Provider</th><th>Model</th><th>Label</th><th></th></tr></thead>
              <tbody>
                {models.map((m) => {
                  const selected = current && m.provider === current.provider && m.model === current.model
                  return (
                    <tr key={`${m.provider}:${m.model}`}>
                      <td>{m.provider}</td>
                      <td><code>{m.model}</code></td>
                      <td style={{ fontSize: 11, color: 'var(--text-mute)' }}>
                        {m.label ?? ''}
                        {m.rateNote && <> · {m.rateNote}</>}
                        {m.warning && <span style={{ color: 'var(--warn)' }}> · {m.warning}</span>}
                      </td>
                      <td>
                        <button
                          className={`ibn-btn ${selected ? '' : 'primary'}`}
                          disabled={!!selected}
                          onClick={() => void pickModel(m.provider, m.model)}
                        >
                          {selected ? 'Active' : 'Use'}
                        </button>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          )}
        </section>
      )}

      {tab === 'appearance' && (
        <section className="ibn-card ibn-appearance-card">
          <div className="ibn-appearance-header">
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>Theme</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>
                Choose a light or dark surface, or let OpeniBank follow your system setting.
              </p>
            </div>
            <div className="ibn-theme-toggle" role="tablist" aria-label="Theme">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`ibn-theme-toggle-btn ${themeChoice === option.id ? 'active' : ''}`}
                  onClick={() => onThemeChange(option.id)}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={`ibn-theme-preview-window ${resolvedTheme}`}>
            <div className="ibn-theme-preview-titlebar">
              <span />
              <span />
              <span />
              <div className="ibn-theme-preview-label">
                {themeChoice === 'system' ? `System · ${resolvedTheme}` : themeChoice}
              </div>
            </div>
            <div className="ibn-theme-preview-body">
              <div className="ibn-theme-preview-sidebar">
                <div className="ibn-theme-preview-pill wide" />
                <div className="ibn-theme-preview-pill active" />
                <div className="ibn-theme-preview-pill" />
                <div className="ibn-theme-preview-pill" />
              </div>
              <div className="ibn-theme-preview-content">
                <div className="ibn-theme-preview-card hero" />
                <div className="ibn-theme-preview-row">
                  <div className="ibn-theme-preview-card" />
                  <div className="ibn-theme-preview-card" />
                </div>
                <div className="ibn-theme-preview-input" />
              </div>
            </div>
          </div>

          <div className="ibn-theme-option-list">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`ibn-theme-option ${themeChoice === option.id ? 'active' : ''}`}
                onClick={() => onThemeChange(option.id)}
              >
                <div className="ibn-theme-option-head">
                  <span className="ibn-theme-option-label">
                    {option.icon}
                    <span>{option.label}</span>
                  </span>
                  {themeChoice === option.id && <span className="pill">Selected</span>}
                </div>
                <span>{option.note}</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {tab === 'market' && (
        <section className="ibn-card" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Crypto market data source</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            Controls where quotes, 24h change, and top-ticker lists come from. Binance (live)
            is the default — no API key, deepest USDT book. Switch to Binance Testnet to exercise
            flows against testnet prices, or CoinGecko for broader coin coverage.
          </p>
          {marketSources.map((s) => {
            const active = s.id === marketSource
            return (
              <div key={s.id} className="ibn-prov-row">
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600 }}>{s.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-mute)' }}>{s.note}</div>
                </div>
                <button
                  className={`ibn-btn ${active ? '' : 'primary'}`}
                  disabled={active}
                  onClick={async () => {
                    try {
                      const next = await window.ibank.trading.sourceSet(s.id)
                      setMarketSourceState(next)
                    } catch (e: any) { setErr(e?.message ?? String(e)) }
                  }}
                >
                  {active ? 'Active' : 'Use'}
                </button>
              </div>
            )
          })}
        </section>
      )}

      {tab === 'policy' && policy && (
        <section className="ibn-card" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>Wallet spending policy</h3>
          <p style={{ color: 'var(--text-dim)', fontSize: 12 }}>
            These limits are enforced at the harness layer before any signed transaction is broadcast.
            Leave blank to disable a rule.
          </p>
          <PolicyField label="Max per transaction (USD)"    value={policy.maxPerTxUsd}           onSave={(v) => void savePolicy({ maxPerTxUsd: v })} />
          <PolicyField label="Daily cap (USD)"              value={policy.dailyCapUsd}           onSave={(v) => void savePolicy({ dailyCapUsd: v })} />
          <PolicyField label="Require confirm above (USD)"  value={policy.requireConfirmAboveUsd} onSave={(v) => void savePolicy({ requireConfirmAboveUsd: v })} />
          <ListField label="Allow-list counterparties"      value={policy.allowList ?? []}        onSave={(v) => void savePolicy({ allowList: v })} />
          <ListField label="Block-list counterparties"      value={policy.blockList ?? []}        onSave={(v) => void savePolicy({ blockList: v })} />
        </section>
      )}

      {tab === 'app' && (
        <section className="ibn-card" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>App info</h3>
          <dl style={{ fontSize: 12 }}>
            <dt style={{ color: 'var(--text-mute)' }}>Version</dt><dd>{version}</dd>
            {Object.entries(paths).map(([k, v]) => (
              <React.Fragment key={k}>
                <dt style={{ color: 'var(--text-mute)', marginTop: 6 }}>{k}</dt>
                <dd style={{ fontFamily: 'ui-monospace, monospace', wordBreak: 'break-all' }}>{v}</dd>
              </React.Fragment>
            ))}
          </dl>
        </section>
      )}
    </div>
  )
}

function PolicyField({ label, value, onSave }: { label: string; value: number | undefined; onSave(v: number | undefined): void }) {
  const [draft, setDraft] = useState(String(value ?? ''))
  useEffect(() => { setDraft(String(value ?? '')) }, [value])
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
      <label style={{ fontSize: 12, flex: 1 }}>{label}</label>
      <input className="ibn-input" value={draft} onChange={(e) => setDraft(e.target.value)} style={{ width: 160 }} />
      <button className="ibn-btn" onClick={() => onSave(draft === '' ? undefined : Number(draft))}>Save</button>
    </div>
  )
}

function ListField({ label, value, onSave }: { label: string; value: string[]; onSave(v: string[]): void }) {
  const [draft, setDraft] = useState(value.join(', '))
  useEffect(() => { setDraft(value.join(', ')) }, [value])
  return (
    <div style={{ marginBottom: 8 }}>
      <label style={{ fontSize: 12 }}>{label}</label>
      <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
        <input
          className="ibn-input" value={draft} onChange={(e) => setDraft(e.target.value)}
          placeholder="comma-separated addresses" style={{ flex: 1 }}
        />
        <button className="ibn-btn" onClick={() => onSave(draft.split(',').map((s) => s.trim()).filter(Boolean))}>
          Save
        </button>
      </div>
    </div>
  )
}

/**
 * SettingsView — model selection, appearance, app diagnostics.
 *
 * Auth / API keys live in the dedicated LoginView.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { X, RefreshCw, Sun, Moon, Monitor } from 'lucide-react'
import type { CurrentModel, ModelEntry } from '../types'
import type { ResolvedTheme, ThemeChoice } from '../hooks/useTheme'
import { WorkspacePicker } from './WorkspacePicker'
import { ToolsPalette } from './ToolsPalette'
import { McpPanel } from './McpPanel'
import { CronPanel } from './CronPanel'
import { HooksEditor } from './HooksEditor'
import { SkillsPanel } from './SkillsPanel'
import { MemoryPanel } from './MemoryPanel'
import { TasksPanel } from './TasksPanel'
import { LogsPanel } from './LogsPanel'

interface Props {
  onClose(): void
  onOpenLogin(): void
  onModelChanged?(next: CurrentModel): void
  themeChoice: ThemeChoice
  resolvedTheme: ResolvedTheme
  onThemeChange(next: ThemeChoice): void
}

type Tab =
  | 'model' | 'workspace' | 'tools' | 'skills' | 'memory'
  | 'tasks' | 'mcp' | 'schedules' | 'hooks' | 'logs'
  | 'appearance' | 'app'

const THEME_OPTIONS: Array<{ id: ThemeChoice; label: string; icon: React.ReactNode; note: string }> = [
  { id: 'light',  label: 'Light',  icon: <Sun size={13} />,     note: 'Bright workspace with softer borders.' },
  { id: 'dark',   label: 'Dark',   icon: <Moon size={13} />,    note: 'Low-glare workspace for focused chats.' },
  { id: 'system', label: 'System', icon: <Monitor size={13} />, note: 'Automatically follows your OS appearance.' },
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
  const [paths, setPaths] = useState<Record<string, string>>({})
  const [version, setVersion] = useState<string>('')
  const [err, setErr] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    setErr(null)
    try {
      const res: any = await window.wish.model.list()
      const list: ModelEntry[] = Array.isArray(res) ? res : (res?.available ?? [])
      setModels(list)
      setCurrent(await window.wish.model.current() as CurrentModel)
      setPaths(await window.wish.app.paths())
      setVersion((await window.wish.app.version()).version)
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const pickModel = async (provider: string, name: string) => {
    try {
      await window.wish.model.set(provider, name)
      const cur = await window.wish.model.current() as CurrentModel
      setCurrent(cur)
      onModelChanged?.(cur)
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }

  return (
    <div className="wsh-panel">
      <header className="wsh-panel-head">
        <h2>Settings</h2>
        <div className="wsh-panel-head-actions">
          <button className="wsh-btn" onClick={() => void refresh()}><RefreshCw size={12} /> Refresh</button>
          <button className="wsh-btn" onClick={onClose}><X size={12} /> Close</button>
        </div>
      </header>

      <nav className="wsh-tabs">
        {([
          'model', 'workspace', 'tools', 'skills', 'memory',
          'tasks', 'mcp', 'schedules', 'hooks', 'logs',
          'appearance', 'app',
        ] as Tab[]).map((t) => (
          <button key={t} className={`wsh-tab ${tab === t ? 'active' : ''}`} onClick={() => setTab(t)}>
            {t === 'model' && 'Models'}
            {t === 'workspace' && 'Workspace'}
            {t === 'tools' && 'Tools'}
            {t === 'skills' && 'Skills'}
            {t === 'memory' && 'Memory'}
            {t === 'tasks' && 'Tasks'}
            {t === 'mcp' && 'MCP'}
            {t === 'schedules' && 'Schedules'}
            {t === 'hooks' && 'Hooks'}
            {t === 'logs' && 'Logs'}
            {t === 'appearance' && 'Appearance'}
            {t === 'app' && 'About'}
          </button>
        ))}
      </nav>

      {err && <div className="wsh-helper warn">{err}</div>}

      {tab === 'model' && (
        <section className="wsh-card" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0 }}>
            Active: <code>{current ? `${current.provider}/${current.model}` : '—'}</code>
          </h3>
          {models.length === 0 ? (
            <div className="wsh-helper info">
              No models yet. <button className="wsh-btn" onClick={onOpenLogin}>Open Login</button> to add a provider,
              or install Ollama for a local model.
            </div>
          ) : (
            <table className="wsh-table">
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
                          className={`wsh-btn ${selected ? '' : 'primary'}`}
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

      {tab === 'workspace' && <WorkspacePicker />}
      {tab === 'tools' && <ToolsPalette />}
      {tab === 'skills' && <SkillsPanel />}
      {tab === 'memory' && <MemoryPanel />}
      {tab === 'tasks' && <TasksPanel />}
      {tab === 'mcp' && <McpPanel />}
      {tab === 'schedules' && <CronPanel />}
      {tab === 'hooks' && <HooksEditor />}
      {tab === 'logs' && <LogsPanel />}

      {tab === 'appearance' && (
        <section className="wsh-card wsh-appearance-card">
          <div className="wsh-appearance-header">
            <div>
              <h3 style={{ marginTop: 0, marginBottom: 4 }}>Theme</h3>
              <p style={{ color: 'var(--text-dim)', fontSize: 12, margin: 0 }}>
                Choose a light or dark surface, or let Wish Code follow your system setting.
              </p>
            </div>
            <div className="wsh-theme-toggle" role="tablist" aria-label="Theme">
              {THEME_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  className={`wsh-theme-toggle-btn ${themeChoice === option.id ? 'active' : ''}`}
                  onClick={() => onThemeChange(option.id)}
                >
                  {option.icon}
                  <span>{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className={`wsh-theme-preview-window ${resolvedTheme}`}>
            <div className="wsh-theme-preview-titlebar">
              <span />
              <span />
              <span />
              <div className="wsh-theme-preview-label">
                {themeChoice === 'system' ? `System · ${resolvedTheme}` : themeChoice}
              </div>
            </div>
            <div className="wsh-theme-preview-body">
              <div className="wsh-theme-preview-sidebar">
                <div className="wsh-theme-preview-pill wide" />
                <div className="wsh-theme-preview-pill active" />
                <div className="wsh-theme-preview-pill" />
                <div className="wsh-theme-preview-pill" />
              </div>
              <div className="wsh-theme-preview-content">
                <div className="wsh-theme-preview-card hero" />
                <div className="wsh-theme-preview-row">
                  <div className="wsh-theme-preview-card" />
                  <div className="wsh-theme-preview-card" />
                </div>
                <div className="wsh-theme-preview-input" />
              </div>
            </div>
          </div>

          <div className="wsh-theme-option-list">
            {THEME_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`wsh-theme-option ${themeChoice === option.id ? 'active' : ''}`}
                onClick={() => onThemeChange(option.id)}
              >
                <div className="wsh-theme-option-head">
                  <span className="wsh-theme-option-label">
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

      {tab === 'app' && (
        <section className="wsh-card" style={{ padding: 14 }}>
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

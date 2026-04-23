/**
 * McpPanel — list MCP servers, browse their tools/resources.
 *
 * MCP servers are configured in `~/.wishcode/mcp.json`; we don't edit that
 * file from the UI (yet) — this is a read-only dashboard plus a manual
 * "reload" (which actually just re-runs list queries) and a shutdown
 * button for clearing persistent child processes.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { RefreshCw, Power, Server, Wrench, FileText, ChevronDown, ChevronRight } from 'lucide-react'

interface ServerInfo {
  id: string
  status: 'connecting' | 'ready' | 'error' | 'closed'
  error?: string
  tools: any[]
  resources: any[]
  serverInfo?: { name?: string; version?: string }
  protocolVersion?: string
}

interface ToolEntry { server: string; tool: string; description?: string; inputSchema?: any }
interface ResourceEntry { server: string; uri: string; name?: string; mimeType?: string }

export function McpPanel() {
  const [servers, setServers] = useState<ServerInfo[]>([])
  const [tools, setTools] = useState<ToolEntry[]>([])
  const [resources, setResources] = useState<ResourceEntry[]>([])
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})

  const refresh = useCallback(async () => {
    setErr(null)
    setLoading(true)
    try {
      const [s, t, r] = await Promise.all([
        window.wish.mcp.servers(),
        window.wish.mcp.tools(),
        window.wish.mcp.resources(),
      ])
      setServers(s as ServerInfo[])
      setTools(t as ToolEntry[])
      setResources(r as ResourceEntry[])
    } catch (e: any) {
      setErr(e?.message ?? String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { void refresh() }, [refresh])

  const shutdown = useCallback(async () => {
    try {
      await window.wish.mcp.shutdown()
      await refresh()
    } catch (e: any) { setErr(e?.message ?? String(e)) }
  }, [refresh])

  return (
    <section className="wsh-card" style={{ padding: 14 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
        <Server size={14} style={{ color: 'var(--brand)' }} />
        <h3 style={{ margin: 0 }}>MCP servers</h3>
        <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
          <button className="wsh-btn" onClick={() => void refresh()} disabled={loading}>
            <RefreshCw size={12} className={loading ? 'wsh-spin' : ''} /> Refresh
          </button>
          <button className="wsh-btn" onClick={() => void shutdown()} title="Shutdown all">
            <Power size={12} /> Shutdown
          </button>
        </span>
      </div>

      {err && <div className="wsh-helper warn">{err}</div>}

      <p style={{ fontSize: 12, color: 'var(--text-mute)', margin: '0 0 10px 0' }}>
        Configure servers in <code>~/.wishcode/mcp.json</code>. Each entry has{' '}
        <code>{'{ command, args?, env?, cwd?, disabled? }'}</code>.
      </p>

      {servers.length === 0 && !loading && (
        <div className="wsh-helper info" style={{ fontSize: 12 }}>
          No MCP servers configured.
        </div>
      )}

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {servers.map((s) => {
          const open = !!expanded[s.id]
          const serverTools = tools.filter((t) => t.server === s.id)
          const serverResources = resources.filter((r) => r.server === s.id)
          return (
            <div
              key={s.id}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-sm)',
                background: 'var(--surface)',
              }}
            >
              <button
                onClick={() => setExpanded((e) => ({ ...e, [s.id]: !open }))}
                style={{
                  width: '100%', display: 'flex', alignItems: 'center', gap: 8,
                  padding: '10px 12px', background: 'transparent', border: 0,
                  color: 'var(--text)', cursor: 'pointer', textAlign: 'left',
                }}
              >
                {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                <strong>{s.id}</strong>
                <StatusBadge status={s.status} />
                <span style={{
                  marginLeft: 'auto', display: 'flex', gap: 10,
                  color: 'var(--text-mute)', fontSize: 11,
                }}>
                  <span><Wrench size={10} /> {serverTools.length}</span>
                  <span><FileText size={10} /> {serverResources.length}</span>
                </span>
              </button>

              {open && (
                <div style={{ padding: '0 12px 12px 12px', fontSize: 12 }}>
                  {s.error && <div className="wsh-helper warn">{s.error}</div>}
                  {s.serverInfo && (
                    <div style={{ color: 'var(--text-mute)', marginBottom: 6 }}>
                      <code>{s.serverInfo.name ?? '?'}</code>
                      {s.serverInfo.version && <> · v{s.serverInfo.version}</>}
                      {s.protocolVersion && <> · MCP {s.protocolVersion}</>}
                    </div>
                  )}

                  {serverTools.length > 0 && (
                    <>
                      <div style={{ color: 'var(--text-mute)', marginTop: 6, marginBottom: 4 }}>Tools</div>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {serverTools.map((t) => (
                          <li key={t.tool} style={{ padding: '3px 0', display: 'flex', gap: 8 }}>
                            <code style={{ color: 'var(--brand)' }}>{t.tool}</code>
                            {t.description && (
                              <span style={{ color: 'var(--text-dim)' }}>{t.description}</span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}

                  {serverResources.length > 0 && (
                    <>
                      <div style={{ color: 'var(--text-mute)', marginTop: 10, marginBottom: 4 }}>Resources</div>
                      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                        {serverResources.map((r) => (
                          <li key={r.uri} style={{ padding: '3px 0', display: 'flex', gap: 8 }}>
                            <code style={{ color: 'var(--brand)' }}>{r.uri}</code>
                            {r.name && <span style={{ color: 'var(--text-dim)' }}>{r.name}</span>}
                            {r.mimeType && (
                              <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
                                {r.mimeType}
                              </span>
                            )}
                          </li>
                        ))}
                      </ul>
                    </>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}

function StatusBadge({ status }: { status: ServerInfo['status'] }) {
  const color = status === 'ready' ? 'var(--brand)'
    : status === 'connecting' ? 'var(--warn, #d28a2c)'
    : status === 'error' ? 'var(--err, #c84242)'
    : 'var(--text-mute)'
  return (
    <span style={{
      fontSize: 10, letterSpacing: 0.4, textTransform: 'uppercase',
      color, border: `1px solid ${color}`, padding: '1px 6px', borderRadius: 8,
    }}>
      {status}
    </span>
  )
}

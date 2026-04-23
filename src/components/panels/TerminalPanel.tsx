/**
 * TerminalPanel — stub host for an embedded shell session.
 *
 * First iteration: runs `shell_bash` commands through the same backend
 * tool the agent uses, so the user has a persistent dev console that
 * can see the agent's recent commands. Full xterm.js integration is a
 * follow-up; this lets the panel be useful immediately.
 */

import React, { useCallback, useEffect, useRef, useState } from 'react'
import { Play, Ban } from 'lucide-react'

interface Entry {
  kind: 'in' | 'out' | 'err'
  text: string
  ts: number
}

export function TerminalPanel() {
  const [history, setHistory] = useState<Entry[]>([])
  const [input, setInput] = useState('')
  const [running, setRunning] = useState(false)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [history])

  const run = useCallback(async () => {
    const cmd = input.trim()
    if (!cmd || running) return
    setInput('')
    setRunning(true)
    setHistory((h) => [...h, { kind: 'in', text: cmd, ts: Date.now() }])
    try {
      const res: any = await (window.wish as any)?.shell?.bash?.({ command: cmd, timeoutMs: 60_000 })
      const out = String(res?.stdout ?? '')
      const err = String(res?.stderr ?? '')
      if (out) setHistory((h) => [...h, { kind: 'out', text: out, ts: Date.now() }])
      if (err) setHistory((h) => [...h, { kind: 'err', text: err, ts: Date.now() }])
      if (!out && !err) setHistory((h) => [...h, { kind: 'out', text: `[exit ${res?.exitCode ?? 0}]`, ts: Date.now() }])
    } catch (e: any) {
      setHistory((h) => [...h, { kind: 'err', text: e?.message ?? String(e), ts: Date.now() }])
    } finally {
      setRunning(false)
    }
  }, [input, running])

  return (
    <div className="wsh-panel-terminal">
      <div className="wsh-panel-term-log" ref={scrollRef}>
        {history.length === 0 && (
          <div className="wsh-panel-empty-sub">
            Persistent shell. Commands you run here share the same working
            directory as the agent's <code>shell_bash</code> tool.
          </div>
        )}
        {history.map((e, i) => (
          <pre key={i} className={`wsh-panel-term-line ${e.kind}`}>
            {e.kind === 'in' ? `$ ${e.text}` : e.text}
          </pre>
        ))}
      </div>
      <form
        className="wsh-panel-term-input"
        onSubmit={(e) => { e.preventDefault(); void run() }}
      >
        <span className="wsh-panel-term-prompt">$</span>
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Run a command…"
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
        />
        <button type="submit" className="wsh-btn primary" disabled={running || !input.trim()}>
          {running ? <Ban size={12} /> : <Play size={12} />}
          <span style={{ marginLeft: 4 }}>{running ? 'Running…' : 'Run'}</span>
        </button>
      </form>
    </div>
  )
}

/**
 * TasksPanel — surfaces long-running background tasks the agent spawned
 * via `task_create`. Lets the user peek at status + stdout tail without
 * going back to the chat.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { LayoutGrid, RefreshCw, CircleDot, CircleCheck, CircleX, Square } from 'lucide-react'

interface TaskSummary {
  id: string
  title: string
  status: 'pending' | 'running' | 'succeeded' | 'failed' | 'stopped'
  startedAt?: number
  finishedAt?: number
  lastLine?: string
}

export function TasksPanel() {
  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res: any = await (window.wish as any)?.tasks?.list?.()
      setTasks(Array.isArray(res) ? res : [])
    } catch {
      setTasks([])
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void refresh()
    const i = setInterval(() => void refresh(), 4000)
    return () => clearInterval(i)
  }, [refresh])

  return (
    <div className="wsh-panel-tasks">
      <div className="wsh-panel-sub-head sticky">
        <span>Background tasks</span>
        <button className="wsh-icon-btn" title="Refresh" onClick={() => void refresh()}>
          <RefreshCw size={12} />
        </button>
      </div>
      {!loading && tasks.length === 0 && (
        <div className="wsh-panel-empty">
          <LayoutGrid size={22} />
          <div className="wsh-panel-empty-title">No background tasks</div>
          <div className="wsh-panel-empty-sub">
            Ask the agent to "run this in the background" or use the
            <code> task_create </code> tool. Running jobs appear here with
            live status.
          </div>
        </div>
      )}
      <ul className="wsh-panel-list">
        {tasks.map((t) => (
          <li key={t.id}>
            <div className="wsh-panel-task">
              <StatusIcon s={t.status} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="wsh-panel-row-label">{t.title}</div>
                {t.lastLine && <code className="wsh-panel-row-path">{t.lastLine}</code>}
              </div>
              {t.status === 'running' && (
                <button
                  className="wsh-btn"
                  title="Stop task"
                  onClick={() => void (window.wish as any)?.tasks?.cancel?.(t.id)}
                >
                  <Square size={11} /> Stop
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

function StatusIcon({ s }: { s: TaskSummary['status'] }) {
  switch (s) {
    case 'succeeded': return <CircleCheck size={14} style={{ color: 'var(--ok)' }} />
    case 'failed':    return <CircleX size={14} style={{ color: 'var(--err)' }} />
    case 'running':   return <CircleDot size={14} style={{ color: 'var(--brand)' }} className="wsh-spin-slow" />
    case 'stopped':   return <Square size={14} style={{ color: 'var(--text-mute)' }} />
    default:          return <CircleDot size={14} style={{ color: 'var(--text-mute)' }} />
  }
}

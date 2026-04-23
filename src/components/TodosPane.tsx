/**
 * TodosPane — live session-scoped todo list surfaced from `todo_write`.
 *
 * The agent calls the `todo_write` tool to maintain a structured checklist;
 * the handler emits `tasks.update` with payload shape
 *   { sessionId, todos: TodoItem[] }
 * The task manager also emits `tasks.update` but with a different shape
 *   { id, task }
 * We discriminate on the payload fields and only react to the todo variant.
 *
 * Collapsed by default when non-empty; users click to expand. Auto-hidden
 * when empty so it never steals space from the transcript.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Circle, LoaderCircle, ListChecks, ChevronDown, ChevronRight } from 'lucide-react'

type TodoStatus = 'pending' | 'in_progress' | 'completed'
interface TodoItem {
  content: string
  activeForm: string
  status: TodoStatus
}

interface Props {
  sessionId: string
}

export function TodosPane({ sessionId }: Props) {
  const [todos, setTodos] = useState<TodoItem[]>([])
  const [open, setOpen] = useState(true)

  const refresh = useCallback(async () => {
    try {
      const list = await window.wish?.todos.get(sessionId)
      setTodos((list as TodoItem[]) ?? [])
    } catch {
      setTodos([])
    }
  }, [sessionId])

  // Initial pull when the session changes.
  useEffect(() => { void refresh() }, [refresh])

  // Subscribe to tasks.update. The task manager and todo_write share this
  // channel — filter by sessionId + presence of `todos` to avoid reacting
  // to background-task progress payloads.
  useEffect(() => {
    const unsub = window.wish?.tasks.onUpdate((p: any) => {
      if (p && p.sessionId === sessionId && Array.isArray(p.todos)) {
        setTodos(p.todos as TodoItem[])
      }
    })
    return () => { unsub?.() }
  }, [sessionId])

  if (todos.length === 0) return null

  const done = todos.filter((t) => t.status === 'completed').length
  const running = todos.find((t) => t.status === 'in_progress')
  const label = running ? running.activeForm : `${done} of ${todos.length} complete`

  return (
    <div className="wsh-todos-pane" style={{
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-sm)',
      background: 'var(--bg-elev-1)',
      margin: '10px 0',
      fontSize: 12,
    }}>
      <button
        className="wsh-todos-head"
        onClick={() => setOpen((v) => !v)}
        style={{
          width: '100%',
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 10px',
          background: 'transparent',
          border: 0,
          color: 'var(--text)',
          cursor: 'pointer',
          textAlign: 'left',
        }}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <ListChecks size={13} style={{ color: 'var(--brand)' }} />
        <span style={{ fontWeight: 600 }}>Plan</span>
        <span style={{ color: 'var(--text-mute)', marginLeft: 4 }}>{label}</span>
        <span style={{
          marginLeft: 'auto',
          fontVariantNumeric: 'tabular-nums',
          color: 'var(--text-mute)',
        }}>
          {done}/{todos.length}
        </span>
      </button>

      {open && (
        <ul style={{ listStyle: 'none', margin: 0, padding: '4px 10px 10px 10px' }}>
          {todos.map((t, i) => (
            <li
              key={i}
              style={{
                display: 'flex', alignItems: 'flex-start', gap: 8,
                padding: '4px 0',
                color: t.status === 'completed' ? 'var(--text-mute)' : 'var(--text)',
                textDecoration: t.status === 'completed' ? 'line-through' : 'none',
              }}
            >
              <span style={{ marginTop: 2, flexShrink: 0 }}>
                {t.status === 'completed' && (
                  <CheckCircle2 size={13} style={{ color: 'var(--ok, var(--brand))' }} />
                )}
                {t.status === 'in_progress' && (
                  <LoaderCircle size={13} className="wsh-spin" style={{ color: 'var(--brand)' }} />
                )}
                {t.status === 'pending' && (
                  <Circle size={13} style={{ color: 'var(--text-mute)' }} />
                )}
              </span>
              <span style={{ lineHeight: 1.45 }}>
                {t.status === 'in_progress' ? t.activeForm : t.content}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

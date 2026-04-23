/**
 * PlanPanel — shows the current plan-mode plan (if any) and the
 * session's todo list. Gives the user a standalone surface to review /
 * approve a proposed plan without scrolling the chat back.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { ListChecks, CheckCircle2, Circle, Loader2 } from 'lucide-react'

interface TodoItem {
  content: string
  status: 'pending' | 'in_progress' | 'completed'
}

interface PlanState {
  planMode: boolean
  plan?: string
  todos: TodoItem[]
}

export function PlanPanel() {
  const [state, setState] = useState<PlanState>({ planMode: false, todos: [] })

  const refresh = useCallback(async () => {
    try {
      const res: any = await (window.wish as any)?.plan?.get?.()
      setState({
        planMode: !!res?.planMode,
        plan: res?.plan ?? undefined,
        todos: Array.isArray(res?.todos) ? res.todos : [],
      })
    } catch {
      setState({ planMode: false, todos: [] })
    }
  }, [])

  useEffect(() => {
    void refresh()
    const i = setInterval(() => void refresh(), 3000)
    return () => clearInterval(i)
  }, [refresh])

  return (
    <div className="wsh-panel-plan">
      <div className="wsh-panel-sub-head sticky">
        <span>
          <ListChecks size={12} /> Plan{' '}
          {state.planMode && <em style={{ color: 'var(--brand)', fontStyle: 'normal' }}>· plan mode on</em>}
        </span>
      </div>
      {state.plan ? (
        <pre className="wsh-panel-pre md">{state.plan}</pre>
      ) : (
        <div className="wsh-panel-empty-sub" style={{ padding: '6px 14px' }}>
          No active plan. The agent writes its plan here when you ask it to
          propose a strategy before editing code.
        </div>
      )}

      <div className="wsh-panel-sub-head">Todos</div>
      {state.todos.length === 0 && (
        <div className="wsh-panel-empty-sub" style={{ padding: '6px 14px' }}>
          Session todo list is empty.
        </div>
      )}
      <ul className="wsh-panel-list">
        {state.todos.map((t, i) => (
          <li key={i}>
            <div className="wsh-panel-todo">
              {t.status === 'completed'   ? <CheckCircle2 size={14} style={{ color: 'var(--ok)' }} />
               : t.status === 'in_progress' ? <Loader2 size={14} className="wsh-spin-slow" style={{ color: 'var(--brand)' }} />
               :                              <Circle size={14} style={{ color: 'var(--text-mute)' }} />}
              <span className={`wsh-panel-todo-text ${t.status}`}>{t.content}</span>
            </div>
          </li>
        ))}
      </ul>
    </div>
  )
}

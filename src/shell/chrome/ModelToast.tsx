/**
 * ModelToast — bottom-right toast that announces a model switch.
 *
 * Extracted from `src/App.tsx`. The toast auto-dismisses after 6 seconds; the
 * caller wires that timer because it owns the toast lifecycle. Pure
 * presentational component.
 */

import React from 'react'

export interface ModelToastView {
  from: string
  to: string
  ts: number
}

interface Props {
  toast: ModelToastView | null
  onDismiss(): void
  onNewChat(): void
}

export const ModelToast: React.FC<Props> = ({ toast, onDismiss, onNewChat }) => {
  if (!toast) return null
  return (
    <div className="wsh-toast" role="status" aria-live="polite">
      <strong>Model switched</strong>
      <span>
        <code>{toast.from}</code> → <code>{toast.to}</code>
      </span>
      <span className="wsh-toast-hint">
        The active chat keeps its history. Start a new conversation if you want a clean slate.
      </span>
      <div className="wsh-toast-actions">
        <button className="wsh-btn" onClick={onDismiss}>Dismiss</button>
        <button className="wsh-btn primary" onClick={onNewChat}>
          New chat
        </button>
      </div>
    </div>
  )
}

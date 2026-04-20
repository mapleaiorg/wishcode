/**
 * DisclaimerBanner — persistent non-advice notice.
 *
 * Rendered above every AI-powered or money-moving surface (Chat, Tokens,
 * Swap, Exports). Dismissible per-surface for the current session via a
 * sessionStorage key, but re-appears on next launch so the user is always
 * reminded at the start of a session.
 */

import React, { useEffect, useState } from 'react'
import { ShieldAlert, X } from 'lucide-react'

interface Props {
  surface: string          // e.g. 'chat' | 'tokens' | 'swap' | 'exports'
  text: string
  tone?: 'info' | 'warn'
}

export function DisclaimerBanner({ surface, text, tone = 'info' }: Props) {
  const key = `ibn.v1.disclaimer.dismissed.${surface}`
  const [dismissed, setDismissed] = useState<boolean>(false)

  useEffect(() => {
    try { setDismissed(sessionStorage.getItem(key) === '1') } catch {}
  }, [key])

  if (dismissed) return null
  return (
    <div className={`ibn-disclaimer tone-${tone}`} role="note" aria-label="disclosure">
      <ShieldAlert size={14} />
      <span>{text}</span>
      <button
        className="ibn-disclaimer-close"
        onClick={() => {
          try { sessionStorage.setItem(key, '1') } catch {}
          setDismissed(true)
        }}
        aria-label="Dismiss"
        title="Dismiss for this session"
      >
        <X size={12} />
      </button>
    </div>
  )
}

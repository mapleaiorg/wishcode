/**
 * AskUserModel — renderer-side UI for the `ask_user_question` tool.
 *
 * Subscribes to `window.wish.askUser.onQuestion` at app boot. When the
 * agent invokes the tool main.ts emits `tool.askUser` with a payload
 *   { requestId, sessionId, question, options, allowFreeText }
 * and the tool's handler awaits a matching `askUser.answer(requestId, …)`
 * before returning.
 *
 * UX
 *   - Multiple queued questions are serviced FIFO — we show them one at a
 *     time. New questions enqueue; closing answers and shifts to the next.
 *   - Each option is a button; if `allowFreeText` is true we render a
 *     textarea and a Submit button that sends `{ choice: 'other', text }`.
 *   - Escape does NOT dismiss (agent is still waiting). We offer an
 *     explicit "Skip" action mapped to `{ choice: '__skip__' }` so the
 *     tool can bail gracefully.
 */

import React, { useCallback, useEffect, useState } from 'react'
import { HelpCircle, MessageSquareText, CornerDownLeft, SkipForward } from 'lucide-react'

interface AskUserPayload {
  requestId: string
  sessionId: string
  question: string
  options: string[]
  allowFreeText: boolean
}

export function AskUserModel() {
  const [queue, setQueue] = useState<AskUserPayload[]>([])
  const [freeText, setFreeText] = useState('')
  const [busy, setBusy] = useState(false)

  // Subscribe once at mount.
  useEffect(() => {
    const unsub = window.wish?.askUser.onQuestion((p) => {
      setQueue((prev) => [...prev, p])
    })
    return () => { unsub?.() }
  }, [])

  const current = queue[0] ?? null

  // Reset the free-text draft when the current question changes.
  useEffect(() => {
    setFreeText('')
  }, [current?.requestId])

  const answer = useCallback(
    async (choice: string, text?: string) => {
      if (!current || busy) return
      setBusy(true)
      try {
        await window.wish.askUser.answer(current.requestId, { choice, text })
      } catch {
        // The handler may have already timed out — still drop the question.
      } finally {
        setBusy(false)
        setQueue((prev) => prev.slice(1))
      }
    },
    [current, busy],
  )

  if (!current) return null

  const submitFree = () => {
    const t = freeText.trim()
    if (!t) return
    void answer('other', t)
  }

  return (
    <div className="wsh-modal-back" role="dialog" aria-modal="true" aria-label="Agent question">
      <div className="wsh-modal" style={{ width: 'min(560px, 94vw)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <HelpCircle size={14} style={{ color: 'var(--brand)' }} />
          <span style={{ fontSize: 11, color: 'var(--text-mute)', letterSpacing: 0.3 }}>
            The agent is asking
          </span>
          {queue.length > 1 && (
            <span
              style={{
                marginLeft: 'auto', fontSize: 11, color: 'var(--text-mute)',
                border: '1px solid var(--border)', padding: '1px 6px', borderRadius: 10,
              }}
              title="More questions are queued"
            >
              +{queue.length - 1} more
            </span>
          )}
        </div>
        <h2 style={{ marginTop: 0, marginBottom: 14, lineHeight: 1.35 }}>{current.question}</h2>

        {current.options.length > 0 && (
          <div className="wsh-ask-options" style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {current.options.map((opt, i) => (
              <button
                key={`${i}:${opt}`}
                className="wsh-btn"
                disabled={busy}
                onClick={() => void answer(opt)}
                style={{
                  justifyContent: 'flex-start',
                  padding: '10px 12px',
                  textAlign: 'left',
                  fontSize: 13,
                  width: '100%',
                }}
              >
                <span
                  style={{
                    display: 'inline-block', minWidth: 18,
                    color: 'var(--text-mute)', fontVariantNumeric: 'tabular-nums',
                  }}
                >
                  {i + 1}.
                </span>
                <span>{opt}</span>
              </button>
            ))}
          </div>
        )}

        {current.allowFreeText && (
          <>
            <label style={{ marginTop: 14 }}>
              <MessageSquareText size={11} style={{ verticalAlign: '-1px', marginRight: 4 }} />
              Or type your own answer
            </label>
            <textarea
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                  e.preventDefault(); submitFree()
                }
              }}
              placeholder="Free-form answer… (⌘↩ to submit)"
              rows={3}
              autoFocus
              style={{ resize: 'vertical' }}
            />
          </>
        )}

        <div className="actions" style={{ alignItems: 'center' }}>
          <button
            className="wsh-btn"
            onClick={() => void answer('__skip__')}
            disabled={busy}
            title="Skip this question"
            style={{ marginRight: 'auto' }}
          >
            <SkipForward size={12} /> Skip
          </button>
          {current.allowFreeText && (
            <button
              className="primary"
              onClick={submitFree}
              disabled={busy || !freeText.trim()}
            >
              <CornerDownLeft size={12} /> Send answer
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

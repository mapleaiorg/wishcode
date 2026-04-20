/**
 * TutorTab — AI educational chat.
 *
 * Reuses the existing `window.ibank.chat.*` surface with a scoped
 * sessionId (`edu-tutor`) so educator chats never pollute the main
 * chat view, and vice-versa.
 *
 * Compliance:
 *   - Every first-user-turn of a session is prefixed with an
 *     EDUCATOR framing prompt instructing the model to be educational
 *     only, never advisory.
 *   - A persistent NON_ADVICE_LONG disclaimer sits above the transcript.
 *   - No buttons wire to trading, portfolio, or wallet actions.
 */

import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Send, GraduationCap, Loader2, Info } from 'lucide-react'
import type { TutorTurn } from '../types'

const SESSION_ID = 'edu-tutor'
const STORAGE_KEY = 'ibn.v1.edu.tutor.turns'

const EDUCATOR_SYSTEM_PROMPT = `
You are Sage, the OpeniBank Educator tutor. You are strictly educational.
Your job is to:
- explain blockchain, wallets, self-custody, transactions, and scams in
  simple, analogy-rich language
- never recommend a specific token, allocation, yield, or timing
- never simulate portfolio advice, tax advice, or legal advice
- if asked "what should I buy", redirect to risk-awareness and
  decision-frameworks, not picks
- cite simple mental models over jargon; keep answers concise (<=120 words)
- when safety is involved, name the concrete rule (e.g. "never share your
  seed phrase")
`.trim()

const NON_ADVICE_LONG = `OpeniBank Educator is provided for educational
purposes only. Nothing here is investment, legal, or tax advice. Crypto
is volatile; you can lose your entire balance. You are responsible for
your own keys and decisions.`

export function TutorTab() {
  const [turns, setTurns] = useState<TutorTurn[]>(() => loadTurns())
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [currentDraft, setCurrentDraft] = useState<string>('')
  const reqRef = useRef<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    saveTurns(turns)
  }, [turns])

  useEffect(() => {
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [turns, currentDraft])

  useEffect(() => {
    const ibank = (window as any).ibank
    if (!ibank?.chat) return
    const unsubs: Array<() => void> = []
    unsubs.push(
      ibank.chat.onDelta((p: { requestId: string; text: string }) => {
        if (p.requestId !== reqRef.current) return
        setCurrentDraft((prev) => prev + p.text)
      }),
    )
    unsubs.push(
      ibank.chat.onDone((p: { requestId: string }) => {
        if (p.requestId !== reqRef.current) return
        setTurns((prev) => [
          ...prev,
          {
            id: `t-${Date.now()}-a`,
            role: 'tutor',
            text: currentDraftRef.current || '(no response)',
            ts: Date.now(),
          },
        ])
        setCurrentDraft('')
        setBusy(false)
        reqRef.current = null
      }),
    )
    unsubs.push(
      ibank.chat.onError((p: { requestId: string; error: string }) => {
        if (p.requestId !== reqRef.current) return
        setTurns((prev) => [
          ...prev,
          {
            id: `t-${Date.now()}-err`,
            role: 'tutor',
            text: `I hit an error: ${p.error}. Try rephrasing, or ask a concept-level question.`,
            ts: Date.now(),
          },
        ])
        setCurrentDraft('')
        setBusy(false)
        reqRef.current = null
      }),
    )
    return () => unsubs.forEach((u) => { try { u() } catch { /* ignore */ } })
  }, [])

  // Mirror currentDraft into a ref so the onDone closure can read the
  // final value without re-subscribing for every keystroke.
  const currentDraftRef = useRef('')
  useEffect(() => {
    currentDraftRef.current = currentDraft
  }, [currentDraft])

  const firstUserTurn = useMemo(() => !turns.some((t) => t.role === 'student'), [turns])

  const send = async () => {
    const trimmed = input.trim()
    if (!trimmed || busy) return
    const ibank = (window as any).ibank
    if (!ibank?.chat) {
      setTurns((prev) => [
        ...prev,
        {
          id: `t-${Date.now()}-u`,
          role: 'student',
          text: trimmed,
          ts: Date.now(),
        },
        {
          id: `t-${Date.now()}-noop`,
          role: 'tutor',
          text: 'Chat backend not available in this window.',
          ts: Date.now(),
        },
      ])
      setInput('')
      return
    }

    const requestText = firstUserTurn
      ? `${EDUCATOR_SYSTEM_PROMPT}\n\n---\n\nStudent: ${trimmed}`
      : trimmed

    const requestId = `edu-${Date.now()}`
    reqRef.current = requestId
    setCurrentDraft('')
    setBusy(true)
    setTurns((prev) => [
      ...prev,
      { id: `t-${Date.now()}-u`, role: 'student', text: trimmed, ts: Date.now() },
    ])
    setInput('')
    try {
      await ibank.chat.send(SESSION_ID, requestId, requestText)
    } catch (err) {
      setBusy(false)
      reqRef.current = null
      setTurns((prev) => [
        ...prev,
        {
          id: `t-${Date.now()}-err`,
          role: 'tutor',
          text: `Could not reach the tutor: ${String(err)}`,
          ts: Date.now(),
        },
      ])
    }
  }

  const clear = () => {
    setTurns([])
    setCurrentDraft('')
  }

  return (
    <div className="edu-tab edu-tutor-tab">
      <header className="edu-tab-header">
        <h2>
          <GraduationCap size={18} /> Tutor (Sage)
        </h2>
        <p className="edu-tutor-disclaimer">
          <Info size={14} /> {NON_ADVICE_LONG}
        </p>
      </header>

      <div className="edu-tutor-scroll" ref={scrollRef}>
        {turns.length === 0 && (
          <div className="edu-tutor-empty">
            Ask anything about wallets, addresses, gas, scams, seed phrases,
            approvals, or how a transaction actually works. I won&rsquo;t recommend
            tokens or trades — that&rsquo;s not what I do.
          </div>
        )}
        {turns.map((t) => (
          <div key={t.id} className={`edu-tutor-turn edu-tutor-${t.role}`}>
            <div className="edu-tutor-role">{t.role === 'tutor' ? 'Sage' : 'You'}</div>
            <div className="edu-tutor-text">{t.text}</div>
          </div>
        ))}
        {busy && (
          <div className="edu-tutor-turn edu-tutor-tutor pending">
            <div className="edu-tutor-role">Sage</div>
            <div className="edu-tutor-text">
              {currentDraft || <span className="edu-tutor-thinking"><Loader2 size={12} className="spin" /> thinking…</span>}
            </div>
          </div>
        )}
      </div>

      <div className="edu-tutor-compose">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask Sage a concept question…"
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              void send()
            }
          }}
          rows={2}
        />
        <div className="edu-tutor-compose-actions">
          <button className="edu-tutor-clear" onClick={clear} disabled={busy}>
            Clear
          </button>
          <button className="edu-tutor-send" onClick={send} disabled={busy || !input.trim()}>
            <Send size={14} /> Ask
          </button>
        </div>
      </div>
    </div>
  )
}

function loadTurns(): TutorTurn[] {
  try {
    if (typeof window === 'undefined') return []
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    return JSON.parse(raw) as TutorTurn[]
  } catch {
    return []
  }
}

function saveTurns(turns: TutorTurn[]): void {
  try {
    if (typeof window === 'undefined') return
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(turns.slice(-100)))
  } catch {
    /* ignore */
  }
}

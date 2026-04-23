/**
 * ChatView — transcript + pill composer.
 *
 * Streams assistant output via window.wish.chat events. Supports slash
 * commands (dispatched through window.wish.commands.run) that either
 * render inline or are forwarded to the LLM.
 *
 * Per-message affordances:
 *   - User messages → Edit & resend (truncates the conversation at that
 *     point and re-submits). Double-click also enters edit mode.
 *   - Assistant messages → Copy button (via MessageRenderer).
 *
 * Inline search filters the transcript in place (highlights the matching
 * message background; composes with the ⌘K global conversation search).
 */

import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { ArrowUp, Square, Pencil, Check, X, Search, Copy, Loader2 } from 'lucide-react'
import type { CommandInfo, ContentBlock, Conversation, Message } from '../types'
import { MessageRenderer } from './MessageRenderer'
import { LogoWish3D } from './LogoWish3D'
import { TodosPane } from './TodosPane'

interface Props {
  conversation: Conversation
  onUpdate(partial: Partial<Conversation>): void
  /** Functional update for messages — critical for streaming so we don't
   *  drop deltas that arrive synchronously between React commits. */
  onMutateMessages(fn: (prev: Message[]) => Message[]): void
}

const COMPOSER_MIN_H = 24     // single line — grows as the user types
const COMPOSER_MAX_H = 220

const STARTER_PROMPTS: string[] = [
  'Explain the architecture of this repo and find the main entry point.',
  'Find every TODO/FIXME and summarize what\'s left to do.',
  'Add a failing test for the auth flow, then make it pass.',
  'Refactor the largest file in src/ into smaller, focused modules.',
]

export function ChatView({ conversation, onUpdate, onMutateMessages }: Props) {
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashIdx, setSlashIdx] = useState(0)
  const [searchQ, setSearchQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  // Live-status footer state. `pendingStartedAt` drives the elapsed clock.
  // `streamedChars` is a running total of delta lengths — we convert it to an
  // approximate token count (~4 chars per token) for the bottom-bar readout,
  // since real usage.output_tokens only arrives at onDone.
  const [pendingStartedAt, setPendingStartedAt] = useState<number | null>(null)
  const [streamedChars, setStreamedChars] = useState(0)
  const [activityPhase, setActivityPhase] = useState<string | null>(null)
  const [nowTick, setNowTick] = useState(Date.now())
  const transcriptRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  // Load the built-in command catalog once — used for the slash menu.
  useEffect(() => {
    void window.wish?.commands.list()
      .then((cs) => setCommands(cs ?? []))
      .catch(() => setCommands([]))
  }, [])

  // Auto-grow the textarea as the user types (capped at COMPOSER_MAX_H).
  useLayoutEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    const next = Math.max(COMPOSER_MIN_H, Math.min(COMPOSER_MAX_H, el.scrollHeight))
    el.style.height = `${next}px`
    el.style.overflowY = el.scrollHeight > COMPOSER_MAX_H ? 'auto' : 'hidden'
  }, [input])

  useLayoutEffect(() => {
    const el = composerRef.current
    if (!el) return
    const sync = () => {
      document.documentElement.style.setProperty(
        '--wsh-bottom-bar-h',
        `${Math.ceil(el.getBoundingClientRect().height)}px`,
      )
    }
    sync()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(sync)
    observer.observe(el)
    return () => observer.disconnect()
  }, [])

  // Slash-menu filter
  const slashMatches = useMemo(() => {
    if (!input.startsWith('/')) return []
    const token = input.slice(1).split(/\s/)[0].toLowerCase()
    if (!token) return commands.slice(0, 10)
    return commands
      .filter((c) => c.name.toLowerCase().startsWith(token) || c.aliases.some((a) => a.toLowerCase().startsWith(token)))
      .slice(0, 10)
  }, [input, commands])

  useEffect(() => {
    const shouldOpen = input.startsWith('/') && !/\s/.test(input) && slashMatches.length > 0
    setSlashOpen(shouldOpen)
    setSlashIdx(0)
  }, [input, slashMatches.length])

  const scrollToBottom = useCallback(() => {
    const el = transcriptRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [])

  useEffect(() => {
    requestAnimationFrame(scrollToBottom)
  }, [conversation.id, conversation.messages.length, scrollToBottom])

  // Stream handlers. Critical: use functional updates (onMutateMessages)
  // not snapshot-based ones, because many deltas may arrive between React
  // commits — reading `conversation.messages` from the closure would
  // overwrite earlier appends with the same stale base snapshot.
  useEffect(() => {
    if (!window.wish) return
    const u1 = window.wish.chat.onDelta((p) => {
      if (p.requestId !== pending) return
      onMutateMessages((prev) => appendDeltaToLast(prev, p.text))
      setStreamedChars((n) => n + (p.text?.length ?? 0))
      setActivityPhase('thinking')
      requestAnimationFrame(scrollToBottom)
    })
    const u2 = window.wish.chat.onThinking((p) => {
      if (p.requestId !== pending) return
      onMutateMessages((prev) => appendThinkingToLast(prev, p.text))
      setActivityPhase('reasoning')
    })
    const u3 = window.wish.chat.onToolUse((p) => {
      if (p.requestId !== pending || p.phase !== 'end') return
      onMutateMessages((prev) => appendBlockToLast(prev, {
        type: 'tool_use', id: p.id, name: p.name, input: p.input,
      }))
      setActivityPhase(`running ${p.name}`)
    })
    const u4 = window.wish.chat.onToolResult((p) => {
      if (!pending) return
      onMutateMessages((prev) => appendBlockToLast(prev, {
        type: 'tool_result', tool_use_id: p.id ?? 'x', content: p.result,
      }))
      setActivityPhase('thinking')
    })
    const u5 = window.wish.chat.onDone((p) => {
      if (p.requestId !== pending) return
      setPending(null)
      setPendingStartedAt(null)
      setActivityPhase(null)
      // If the backend reported real usage numbers, prefer them over the
      // char-based estimate so the final readout matches the model's bill.
      const out = p.usage?.output_tokens ?? p.usage?.completion_tokens
      if (typeof out === 'number' && out > 0) setStreamedChars(out * 4)
      onMutateMessages((prev) => markLastDone(prev))
    })
    const u6 = window.wish.chat.onError((p) => {
      if (p.requestId !== pending) return
      setPending(null)
      setPendingStartedAt(null)
      setActivityPhase(null)
      onMutateMessages((prev) => markLastError(prev, p.error))
    })
    const u7 = window.wish.chat.onStatus?.((p: any) => {
      if (p?.requestId && p.requestId !== pending) return
      if (p?.phase) setActivityPhase(String(p.phase))
    })
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); u5?.(); u6?.(); u7?.() }
  }, [pending, onMutateMessages, scrollToBottom])

  // Drive the elapsed-time readout. Only ticking while pending keeps idle
  // tabs from doing work and keeps React from re-rendering the transcript.
  useEffect(() => {
    if (!pending) return
    const id = window.setInterval(() => setNowTick(Date.now()), 500)
    return () => window.clearInterval(id)
  }, [pending])

  const runLlmTurnWithHistory = useCallback(
    async (priorMessages: Message[], text: string) => {
      const requestId = `req_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
      const userMsg: Message = { id: `u_${Date.now()}`, role: 'user', ts: Date.now(), content: [{ type: 'text', text }] }
      const assistantMsg: Message = {
        id: `a_${Date.now()}`, role: 'assistant', ts: Date.now(), content: [], streaming: true,
      }
      onUpdate({
        messages: [...priorMessages, userMsg, assistantMsg],
        title: conversation.title === 'New conversation' ? text.slice(0, 48) : conversation.title,
      })
      setPending(requestId)
      setPendingStartedAt(Date.now())
      setStreamedChars(0)
      setActivityPhase('dispatching')
      await window.wish?.chat.send(conversation.id, requestId, text, 'auto').catch(() => {})
    },
    [conversation.id, conversation.title, onUpdate],
  )

  const runLlmTurn = useCallback(
    (text: string) => runLlmTurnWithHistory(conversation.messages, text),
    [conversation.messages, runLlmTurnWithHistory],
  )

  // Edit + resend: truncate all messages at-and-after the edited user message,
  // then dispatch a fresh LLM turn with the new text.
  const editAndResend = useCallback(
    async (messageId: string, newText: string) => {
      if (pending) return
      const idx = conversation.messages.findIndex(m => m.id === messageId)
      if (idx < 0) return
      const trimmed = conversation.messages.slice(0, idx)
      await runLlmTurnWithHistory(trimmed, newText.trim())
    },
    [conversation.messages, pending, runLlmTurnWithHistory],
  )

  const onSubmit = useCallback(async () => {
    const text = input.trim()
    if (!text || pending) return
    setInput('')
    if (text.startsWith('/')) {
      const res: any = await window.wish?.commands.run(conversation.id, text).catch((e: Error) => ({ kind: 'error', message: e.message }))
      if (res?.kind === 'prompt') {
        await runLlmTurn(res.prompt)
      } else {
        const cmdMsg: Message = {
          id: `cmd_${Date.now()}`, role: 'system', ts: Date.now(), content: [
            { type: 'text', text: res?.markdown ?? res?.text ?? res?.message ?? 'done' },
          ],
        }
        onUpdate({ messages: [...conversation.messages, cmdMsg] })
      }
      return
    }
    await runLlmTurn(text)
  }, [input, pending, conversation, onUpdate, runLlmTurn])

  const stop = useCallback(async () => {
    if (!pending) return
    await window.wish?.chat.abort(pending).catch(() => {})
    setPending(null)
    setPendingStartedAt(null)
    setActivityPhase(null)
  }, [pending])

  // Filter the visible transcript by search query.
  const visibleMessages = useMemo(() => {
    const q = searchQ.trim().toLowerCase()
    if (!q) return conversation.messages
    return conversation.messages.filter((m) => {
      for (const b of m.content) {
        const t = (b as any).text
        if (typeof t === 'string' && t.toLowerCase().includes(q)) return true
      }
      return false
    })
  }, [conversation.messages, searchQ])

  const isEmpty = conversation.messages.length === 0

  return (
    <div className="wsh-chat">
      <div className="wsh-chat-searchbar">
        {searchOpen ? (
          <div className="wsh-topbar-search">
            <Search size={12} />
            <input
              autoFocus
              placeholder="Filter messages in this chat…"
              value={searchQ}
              onChange={(e) => setSearchQ(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') { setSearchOpen(false); setSearchQ('') }
              }}
            />
            <button className="wsh-icon-btn" onClick={() => { setSearchOpen(false); setSearchQ('') }} title="Close">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button className="wsh-icon-btn" onClick={() => setSearchOpen(true)} title="Filter this chat">
            <Search size={12} />
          </button>
        )}
        {searchQ && (
          <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
            {visibleMessages.length} of {conversation.messages.length} matching
          </span>
        )}
      </div>

      <div className="wsh-transcript" ref={transcriptRef}>
        {isEmpty && (
          <div className="wsh-empty">
            <div className="wsh-empty-wishmark">
              <LogoWish3D height={120} />
            </div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--brand)' }}>Wish Code</span>
              <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 15 }}>
                — your on-desk AI coding agent
              </span>
            </h1>
            <p>
              I can read and edit files, run shell commands, search the web, spin up sub-agents,
              and invoke skills. Try one of these:
            </p>
            <div className="wsh-starters">
              {STARTER_PROMPTS.map((p) => (
                <button key={p} className="wsh-starter" onClick={() => setInput(p)}>
                  {p}
                </button>
              ))}
            </div>
          </div>
        )}
        {visibleMessages.map((m) => (
          <MessageRow
            key={m.id}
            message={m}
            disabled={!!pending}
            onEditResend={editAndResend}
          />
        ))}
      </div>

      <div className="wsh-todos-wrap" style={{ padding: '0 var(--wsh-chat-pad, 20px)' }}>
        <TodosPane sessionId={conversation.id} />
      </div>

      {pending && pendingStartedAt && (
        <LiveStatus
          startedAt={pendingStartedAt}
          now={nowTick}
          phase={activityPhase}
          streamedChars={streamedChars}
          onStop={stop}
        />
      )}

      <div className="wsh-composer" ref={composerRef}>
        {slashOpen && (
          <div className="wsh-slash-menu" role="listbox">
            {slashMatches.map((c, i) => (
              <div
                key={c.name}
                className={`wsh-slash-item ${i === slashIdx ? 'active' : ''}`}
                onMouseDown={(e) => {
                  e.preventDefault()
                  setInput(`/${c.name} `)
                  requestAnimationFrame(() => textareaRef.current?.focus())
                }}
                onMouseEnter={() => setSlashIdx(i)}
              >
                <span className="name">/{c.name}</span>
                <span className="desc">{c.summary}</span>
                {c.aliases.length > 0 && (
                  <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
                    {c.aliases.map((a) => `/${a}`).join(' ')}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}

        <div className="wsh-pill">
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (slashOpen && slashMatches.length > 0) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault(); setSlashIdx((i) => (i + 1) % slashMatches.length); return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault(); setSlashIdx((i) => (i - 1 + slashMatches.length) % slashMatches.length); return
                }
                if (e.key === 'Tab' || (e.key === 'Enter' && !e.shiftKey)) {
                  e.preventDefault()
                  setInput(`/${slashMatches[slashIdx].name} `); setSlashOpen(false); return
                }
                if (e.key === 'Escape') { e.preventDefault(); setSlashOpen(false); return }
              }
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault(); void onSubmit()
              }
            }}
            placeholder={pending ? 'Streaming…' : 'Ask Wish Code anything, or type / for commands'}
            rows={1}
            style={{ minHeight: COMPOSER_MIN_H, maxHeight: COMPOSER_MAX_H }}
          />
          {pending ? (
            <button className="send" onClick={stop} title="Stop"><Square size={14} /></button>
          ) : (
            <button className="send" onClick={() => void onSubmit()} disabled={!input.trim()} title="Send">
              <ArrowUp size={14} />
            </button>
          )}
        </div>
        <div className="wsh-composer-row">
          <span className="wsh-chip" onClick={() => setInput((v) => v + '/plan ')}>Plan</span>
          <span className="wsh-chip" onClick={() => setInput((v) => v + '/review ')}>Review</span>
          <span className="wsh-chip" onClick={() => setInput((v) => v + '/test ')}>Test</span>
          <span className="spacer" />
          <span style={{ color: 'var(--text-mute)' }}>↩ send · shift+↩ newline · / for commands</span>
        </div>
      </div>
    </div>
  )
}

// ── Per-message row with edit/resend for user messages ────────────────

function MessageRow({ message, disabled, onEditResend }: {
  message: Message
  disabled: boolean
  onEditResend: (id: string, newText: string) => void
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const isUser = message.role === 'user'

  const startEdit = () => {
    if (disabled) return
    const current = message.content.filter(b => b.type === 'text').map(b => (b as any).text).join('\n\n')
    setDraft(current)
    setEditing(true)
  }
  const commit = () => {
    if (!draft.trim()) return
    setEditing(false)
    onEditResend(message.id, draft)
  }
  const cancel = () => { setEditing(false); setDraft('') }

  return (
    <div
      className={`wsh-msg ${message.role}`}
      onDoubleClick={isUser && !editing ? startEdit : undefined}
    >
      <div className="wsh-msg-avatar">{avatarFor(message)}</div>
      <div className="wsh-msg-body">
        <div className="wsh-msg-role">
          {message.role}
          {message.provider && ` · ${message.provider}/${message.model}`}
        </div>
        {message.error ? (
          <ErrorBlock text={message.error} />
        ) : editing ? (
          <div className="wsh-msg-edit">
            <textarea
              autoFocus
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); commit() }
                if (e.key === 'Escape') { e.preventDefault(); cancel() }
              }}
              rows={Math.min(10, Math.max(2, draft.split('\n').length))}
            />
            <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
              <button className="wsh-btn primary" onClick={commit} disabled={!draft.trim() || disabled}>
                <Check size={12} /> Resend
              </button>
              <button className="wsh-btn" onClick={cancel}>
                <X size={12} /> Cancel
              </button>
              <span style={{ fontSize: 11, color: 'var(--text-mute)', alignSelf: 'center' }}>
                ⌘↩ to resend · Esc to cancel
              </span>
            </div>
          </div>
        ) : (
          <MessageRenderer message={message} />
        )}
        {isUser && !editing && !message.error && (
          <div className="wsh-msg-actions">
            <button className="wsh-msg-action" onClick={startEdit} disabled={disabled} title="Edit and resend">
              <Pencil size={11} />
              <span>Edit</span>
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

/**
 * Selectable + copyable error block. The global `user-select: none` rule in
 * global.css forbids text selection on UI chrome; we re-enable it here so the
 * user can select/copy a raw error message. Also ships a Copy button.
 */
function ErrorBlock({ text }: { text: string }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* ignore */ }
  }
  return (
    <div className="wsh-msg-error">
      <div className="wsh-msg-error-body">{text}</div>
      <div className="wsh-msg-actions">
        <button className="wsh-msg-action" onClick={onCopy} title="Copy error">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  )
}

function avatarFor(m: Message): string {
  if (m.role === 'user') return 'U'
  if (m.role === 'assistant') return 'W'
  if (m.role === 'system') return '•'
  return 'T'
}

function lastAssistantIndex(messages: Message[]): number {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') return i
  }
  return -1
}

function appendDeltaToLast(messages: Message[], delta: string): Message[] {
  const i = lastAssistantIndex(messages)
  if (i < 0) return messages
  const m = messages[i]
  const content = [...m.content]
  const last = content[content.length - 1]
  if (last && last.type === 'text') {
    content[content.length - 1] = { type: 'text', text: last.text + delta }
  } else {
    content.push({ type: 'text', text: delta })
  }
  const next = [...messages]
  next[i] = { ...m, content, streaming: true }
  return next
}

function appendThinkingToLast(messages: Message[], delta: string): Message[] {
  const i = lastAssistantIndex(messages)
  if (i < 0) return messages
  const m = messages[i]
  const content = [...m.content]
  const last = content[content.length - 1]
  if (last && last.type === 'thinking') {
    content[content.length - 1] = { type: 'thinking', text: last.text + delta }
  } else {
    content.push({ type: 'thinking', text: delta })
  }
  const next = [...messages]
  next[i] = { ...m, content, streaming: true }
  return next
}

function appendBlockToLast(messages: Message[], block: ContentBlock): Message[] {
  const i = lastAssistantIndex(messages)
  if (i < 0) return messages
  const m = messages[i]
  const next = [...messages]
  next[i] = { ...m, content: [...m.content, block], streaming: true }
  return next
}

function markLastDone(messages: Message[]): Message[] {
  const i = lastAssistantIndex(messages)
  if (i < 0) return messages
  const next = [...messages]
  next[i] = { ...messages[i], streaming: false }
  return next
}

// ── Live-status footer ────────────────────────────────────────────
//
// Renders a thin bar ABOVE the composer while a turn is pending, to match
// Claude Code's "⟳ Thinking · 8m 24s · ↓ 8.4k tokens" affordance. We have
// no real-time output_tokens from the provider, so we estimate from the
// streamed char count (chars/4), then correct on onDone if usage arrived.

function LiveStatus({
  startedAt, now, phase, streamedChars, onStop,
}: {
  startedAt: number
  now: number
  phase: string | null
  streamedChars: number
  onStop: () => void
}) {
  const elapsedMs = Math.max(0, now - startedAt)
  const tokens = Math.round(streamedChars / 4)
  return (
    <div className="wsh-live-status" role="status" aria-live="polite">
      <Loader2 size={13} className="wsh-live-spin" />
      <span className="wsh-live-phase">{prettyPhase(phase)}</span>
      <span className="wsh-live-sep">·</span>
      <span className="wsh-live-time" title="Elapsed">{formatElapsed(elapsedMs)}</span>
      {tokens > 0 && (
        <>
          <span className="wsh-live-sep">·</span>
          <span className="wsh-live-tokens" title="Approximate output tokens">
            ↓ {formatTokens(tokens)} tokens
          </span>
        </>
      )}
      <span className="spacer" />
      <button className="wsh-live-stop" onClick={onStop} title="Interrupt (Esc)">
        <Square size={11} /> Stop
      </button>
    </div>
  )
}

function prettyPhase(p: string | null): string {
  if (!p) return 'Thinking'
  const map: Record<string, string> = {
    dispatching: 'Dispatching',
    thinking: 'Thinking',
    reasoning: 'Reasoning',
    compacting: 'Compacting context',
    'swarm-fanout': 'Consulting specialists',
    'swarm-synthesize': 'Synthesizing',
  }
  if (map[p]) return map[p]
  // "running fs_read" → "Running fs_read"
  return p.charAt(0).toUpperCase() + p.slice(1)
}

function formatElapsed(ms: number): string {
  const s = Math.floor(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const rem = s % 60
  if (m < 60) return `${m}m ${rem.toString().padStart(2, '0')}s`
  const h = Math.floor(m / 60)
  const mm = m % 60
  return `${h}h ${mm}m`
}

function formatTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 10_000) return `${(n / 1000).toFixed(1)}k`
  return `${Math.round(n / 1000)}k`
}

function markLastError(messages: Message[], err: string): Message[] {
  const i = lastAssistantIndex(messages)
  if (i < 0) return messages
  const next = [...messages]
  next[i] = { ...messages[i], streaming: false, error: err }
  return next
}

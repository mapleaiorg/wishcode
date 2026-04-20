/**
 * ChatView — transcript + pill composer.
 *
 * Streams assistant output via window.ibank.chat events. Supports slash
 * commands (dispatched through window.ibank.commands.run) that either
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
import { ArrowUp, Square, Pencil, Check, X, Search, Copy } from 'lucide-react'
import type { CommandInfo, ContentBlock, Conversation, Message } from '../types'
import { MessageRenderer } from './MessageRenderer'
import { Logo } from './Logo'

interface Props {
  conversation: Conversation
  onUpdate(partial: Partial<Conversation>): void
}

const COMPOSER_MIN_H = 24     // single line — grows as the user types
const COMPOSER_MAX_H = 220

const STARTER_PROMPTS: string[] = [
  'What is happening with BTC and ETH this week?',
  'Analyze my wallet — any risk I should know about?',
  'Suggest a DeFi yield strategy for stable USDC at moderate risk.',
  'Summarize macro + crypto news for today.',
]

export function ChatView({ conversation, onUpdate }: Props) {
  const [input, setInput] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [commands, setCommands] = useState<CommandInfo[]>([])
  const [slashOpen, setSlashOpen] = useState(false)
  const [slashIdx, setSlashIdx] = useState(0)
  const [searchQ, setSearchQ] = useState('')
  const [searchOpen, setSearchOpen] = useState(false)
  const transcriptRef = useRef<HTMLDivElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const composerRef = useRef<HTMLDivElement>(null)

  // Load the built-in command catalog once — used for the slash menu.
  useEffect(() => {
    void window.ibank?.commands.list()
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
        '--ibn-bottom-bar-h',
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

  useEffect(() => {
    const u1 = window.ibank?.chat.onDelta((p) => {
      if (p.requestId !== pending) return
      onUpdate({ messages: appendDeltaToLast(conversation.messages, p.text) })
      requestAnimationFrame(scrollToBottom)
    })
    const u2 = window.ibank?.chat.onThinking((p) => {
      if (p.requestId !== pending) return
      onUpdate({ messages: appendThinkingToLast(conversation.messages, p.text) })
    })
    const u3 = window.ibank?.chat.onToolUse((p) => {
      if (p.requestId !== pending || p.phase !== 'end') return
      onUpdate({
        messages: appendBlockToLast(conversation.messages, {
          type: 'tool_use', id: p.id, name: p.name, input: p.input,
        }),
      })
    })
    const u4 = window.ibank?.chat.onToolResult((p) => {
      if (!pending) return
      onUpdate({
        messages: appendBlockToLast(conversation.messages, {
          type: 'tool_result', tool_use_id: p.id ?? 'x', content: p.result,
        }),
      })
    })
    const u5 = window.ibank?.chat.onDone((p) => {
      if (p.requestId !== pending) return
      setPending(null)
      onUpdate({ messages: markLastDone(conversation.messages) })
    })
    const u6 = window.ibank?.chat.onError((p) => {
      if (p.requestId !== pending) return
      setPending(null)
      onUpdate({ messages: markLastError(conversation.messages, p.error) })
    })
    return () => { u1?.(); u2?.(); u3?.(); u4?.(); u5?.(); u6?.() }
  }, [pending, conversation.messages, onUpdate, scrollToBottom])

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
      await window.ibank?.chat.send(conversation.id, requestId, text, 'auto').catch(() => {})
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
      const res: any = await window.ibank?.commands.run(conversation.id, text).catch((e: Error) => ({ kind: 'error', message: e.message }))
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
    await window.ibank?.chat.abort(pending).catch(() => {})
    setPending(null)
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
    <div className="ibn-chat">
      <div className="ibn-chat-searchbar">
        {searchOpen ? (
          <div className="ibn-topbar-search">
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
            <button className="ibn-icon-btn" onClick={() => { setSearchOpen(false); setSearchQ('') }} title="Close">
              <X size={12} />
            </button>
          </div>
        ) : (
          <button className="ibn-icon-btn" onClick={() => setSearchOpen(true)} title="Filter this chat">
            <Search size={12} />
          </button>
        )}
        {searchQ && (
          <span style={{ color: 'var(--text-mute)', fontSize: 11 }}>
            {visibleMessages.length} of {conversation.messages.length} matching
          </span>
        )}
      </div>

      <div className="ibn-transcript" ref={transcriptRef}>
        {isEmpty && (
          <div className="ibn-empty">
            <div className="ibn-empty-logo">
              <Logo size={112} />
            </div>
            <h1 style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span style={{ color: 'var(--brand)' }}>iBank</span>
              <span style={{ color: 'var(--text-dim)', fontWeight: 400, fontSize: 15 }}>
                — your OpeniBank on-desk assistant
              </span>
            </h1>
            <p>
              I can analyze markets, manage memory, run DeFi research, query your wallet, and
              orchestrate skills. Try one of these:
            </p>
            <div className="ibn-starters">
              {STARTER_PROMPTS.map((p) => (
                <button key={p} className="ibn-starter" onClick={() => setInput(p)}>
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

      <div className="ibn-composer" ref={composerRef}>
        {slashOpen && (
          <div className="ibn-slash-menu" role="listbox">
            {slashMatches.map((c, i) => (
              <div
                key={c.name}
                className={`ibn-slash-item ${i === slashIdx ? 'active' : ''}`}
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

        <div className="ibn-pill">
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
            placeholder={pending ? 'Streaming…' : 'Ask iBank anything, or type / for commands'}
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
        <div className="ibn-composer-row">
          <span className="ibn-chip" onClick={() => setInput((v) => v + '/plan ')}>Plan</span>
          <span className="ibn-chip" onClick={() => setInput((v) => v + '/trade top ')}>Top markets</span>
          <span className="ibn-chip" onClick={() => setInput((v) => v + '/wallet balances ')}>Balances</span>
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
      className={`ibn-msg ${message.role}`}
      onDoubleClick={isUser && !editing ? startEdit : undefined}
    >
      <div className="ibn-msg-avatar">{avatarFor(message)}</div>
      <div className="ibn-msg-body">
        <div className="ibn-msg-role">
          {message.role}
          {message.provider && ` · ${message.provider}/${message.model}`}
        </div>
        {message.error ? (
          <ErrorBlock text={message.error} />
        ) : editing ? (
          <div className="ibn-msg-edit">
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
              <button className="ibn-btn primary" onClick={commit} disabled={!draft.trim() || disabled}>
                <Check size={12} /> Resend
              </button>
              <button className="ibn-btn" onClick={cancel}>
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
          <div className="ibn-msg-actions">
            <button className="ibn-msg-action" onClick={startEdit} disabled={disabled} title="Edit and resend">
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
    <div className="ibn-msg-error">
      <div className="ibn-msg-error-body">{text}</div>
      <div className="ibn-msg-actions">
        <button className="ibn-msg-action" onClick={onCopy} title="Copy error">
          {copied ? <Check size={12} /> : <Copy size={12} />}
          <span>{copied ? 'Copied' : 'Copy'}</span>
        </button>
      </div>
    </div>
  )
}

function avatarFor(m: Message): string {
  if (m.role === 'user') return 'U'
  if (m.role === 'assistant') return 'iB'
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

function markLastError(messages: Message[], err: string): Message[] {
  const i = lastAssistantIndex(messages)
  if (i < 0) return messages
  const next = [...messages]
  next[i] = { ...messages[i], streaming: false, error: err }
  return next
}

/**
 * Renders a Message's content-blocks with rich formatting.
 *
 * Plain-text blocks → markdown via react-markdown (+ gfm tables, task lists,
 * code highlighting via shiki-per-language lazy chunks).
 * thinking blocks → dimmed italic callout.
 * tool_use blocks → expandable card showing tool name + JSON input.
 * tool_result blocks → expandable card with monospace content.
 */

import React, { useMemo, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import type { ContentBlock, Message } from '../types'
import { ChevronRight, Wrench, Hash, Copy, Check } from 'lucide-react'

interface Props {
  message: Message
}

export function MessageRenderer({ message }: Props) {
  return (
    <div className="ibn-md">
      {message.content.map((block, i) => (
        <BlockView key={i} block={block} streaming={message.streaming} />
      ))}
      {message.streaming && message.content.length === 0 && <Caret />}
      {!message.streaming && message.role === 'assistant' && hasText(message.content) && (
        <MessageActions message={message} />
      )}
    </div>
  )
}

function hasText(blocks: ContentBlock[]): boolean {
  return blocks.some(b => b.type === 'text' && !!(b as any).text)
}

function collectText(blocks: ContentBlock[]): string {
  return blocks
    .filter(b => b.type === 'text')
    .map(b => (b as any).text as string)
    .join('\n\n')
}

function MessageActions({ message }: { message: Message }) {
  const [copied, setCopied] = useState(false)
  const onCopy = async () => {
    try {
      await navigator.clipboard.writeText(collectText(message.content))
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    } catch { /* ignore */ }
  }
  return (
    <div className="ibn-msg-actions">
      <button className="ibn-msg-action" onClick={onCopy} title="Copy response">
        {copied ? <Check size={12} /> : <Copy size={12} />}
        <span>{copied ? 'Copied' : 'Copy'}</span>
      </button>
    </div>
  )
}

function BlockView({ block, streaming }: { block: ContentBlock; streaming?: boolean }) {
  switch (block.type) {
    case 'text':
      return <TextBlock text={block.text} streaming={streaming} />
    case 'thinking':
      return <ThinkingBlock text={block.text} />
    case 'tool_use':
      return <ToolUseBlock id={block.id} name={block.name} input={block.input} />
    case 'tool_result':
      return <ToolResultBlock content={block.content} isError={block.is_error} />
    default:
      return null
  }
}

function TextBlock({ text, streaming }: { text: string; streaming?: boolean }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      components={{
        code({ inline, className, children, ...rest }: any) {
          const match = /language-(\w+)/.exec(className || '')
          return inline ? (
            <code className={className} {...rest}>{children}</code>
          ) : (
            <pre><code className={match ? `language-${match[1]}` : ''}>{String(children).replace(/\n$/, '')}</code></pre>
          )
        },
        a({ href, children }: any) {
          return (
            <a href={href} onClick={(e) => { e.preventDefault(); if (href) window.ibank?.app.openExternal(href) }}>
              {children}
            </a>
          )
        },
      }}
    >
      {streaming ? text + '▍' : text}
    </ReactMarkdown>
  )
}

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="ibn-thinking">
      <button
        onClick={() => setOpen((v) => !v)}
        style={{ background: 'none', border: 'none', color: 'inherit', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        <ChevronRight size={12} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }} />
        <span>Reasoning ({text.length} chars)</span>
      </button>
      {open && <div style={{ marginTop: 6, whiteSpace: 'pre-wrap' }}>{text}</div>}
    </div>
  )
}

function ToolUseBlock({ id, name, input }: { id: string; name: string; input: unknown }) {
  const [open, setOpen] = useState(false)
  const inputStr = useMemo(() => {
    try { return JSON.stringify(input, null, 2) } catch { return String(input) }
  }, [input])
  return (
    <div className="ibn-tooluse">
      <div className="hd" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <Wrench size={11} />
        <span>tool: {name}</span>
        <span style={{ color: 'var(--text-mute)', fontSize: 10 }}>#{id.slice(-6)}</span>
      </div>
      {open && <pre>{inputStr}</pre>}
    </div>
  )
}

function ToolResultBlock({ content, isError }: { content: string | unknown; isError?: boolean }) {
  const [open, setOpen] = useState(!!isError)
  const text = typeof content === 'string' ? content : JSON.stringify(content, null, 2)
  return (
    <div className="ibn-toolresult" style={isError ? { borderColor: 'var(--err)' } : undefined}>
      <div className="hd" style={{ cursor: 'pointer' }} onClick={() => setOpen((v) => !v)}>
        <Hash size={11} />
        <span>{isError ? 'tool error' : 'tool result'}</span>
      </div>
      {open && <pre>{text.slice(0, 4_000)}{text.length > 4_000 ? '\n…(truncated)' : ''}</pre>}
    </div>
  )
}

function Caret() {
  return <span style={{ color: 'var(--text-mute)' }}>▍</span>
}

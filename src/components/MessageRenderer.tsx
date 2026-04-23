/**
 * Renders a Message's content-blocks with rich formatting.
 *
 * Plain-text blocks → markdown via react-markdown (+ gfm tables, task lists,
 * code highlighting via shiki-per-language lazy chunks).
 * thinking blocks → dimmed italic callout.
 * tool_use / tool_result blocks → GROUPED into a single collapsible
 * "activity" row (e.g. "Searched code, read 4 files, edited a file ▸")
 * that expands to show each tool_use + tool_result pair. This matches
 * the Claude Code transcript style — the agent's chatter stays compact
 * unless the user opts in to see what it actually did.
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
  const groups = useMemo(() => groupBlocks(message.content), [message.content])
  return (
    <div className="wsh-md">
      {groups.map((g, i) => {
        if (g.kind === 'activity') {
          return <ActivityGroup key={i} blocks={g.blocks} />
        }
        return <BlockView key={i} block={g.block} streaming={message.streaming} />
      })}
      {message.streaming && message.content.length === 0 && <Caret />}
      {!message.streaming && message.role === 'assistant' && hasText(message.content) && (
        <MessageActions message={message} />
      )}
    </div>
  )
}

// ── Grouping ──────────────────────────────────────────────────────

type Group =
  | { kind: 'block'; block: ContentBlock }
  | { kind: 'activity'; blocks: ContentBlock[] }

function isToolBlock(b: ContentBlock): boolean {
  return b.type === 'tool_use' || b.type === 'tool_result'
}

function groupBlocks(blocks: ContentBlock[]): Group[] {
  const out: Group[] = []
  let pending: ContentBlock[] = []
  const flush = () => {
    if (pending.length > 0) {
      out.push({ kind: 'activity', blocks: pending })
      pending = []
    }
  }
  for (const b of blocks) {
    if (isToolBlock(b)) {
      pending.push(b)
    } else {
      flush()
      out.push({ kind: 'block', block: b })
    }
  }
  flush()
  return out
}

// ── Activity summary ──────────────────────────────────────────────

const TOOL_VERB: Record<string, { verb: string; noun: string }> = {
  fs_read:    { verb: 'read',       noun: 'file' },
  fs_glob:    { verb: 'listed',     noun: 'directory' },
  fs_grep:    { verb: 'searched',   noun: 'code' },
  fs_edit:    { verb: 'edited',     noun: 'file' },
  fs_write:   { verb: 'wrote',      noun: 'file' },
  shell_bash: { verb: 'ran',        noun: 'command' },
  web_fetch:  { verb: 'fetched',    noun: 'URL' },
  web_search: { verb: 'searched',   noun: 'the web' },
  agent_task: { verb: 'spawned',    noun: 'sub-agent' },
  agent_chain:{ verb: 'ran',        noun: 'agent chain' },
  ask_user_question: { verb: 'asked', noun: 'question' },
  todo_write: { verb: 'updated',    noun: 'todos' },
  enter_plan_mode: { verb: 'entered', noun: 'plan mode' },
  exit_plan_mode:  { verb: 'exited',  noun: 'plan mode' },
  memory_add: { verb: 'saved',      noun: 'memory' },
  memory_recall: { verb: 'recalled', noun: 'memory' },
  wiki_read:  { verb: 'read',       noun: 'wiki' },
  wiki_update:{ verb: 'updated',    noun: 'wiki' },
  bb_put:     { verb: 'noted',      noun: 'blackboard entry' },
  bb_get:     { verb: 'read',       noun: 'blackboard' },
  bb_list:    { verb: 'listed',     noun: 'blackboard' },
}

// Group tool names into human-readable phrases.
function summarizeActivity(blocks: ContentBlock[]): { label: string; count: number } {
  const counts: Record<string, number> = {}
  let errorCount = 0
  for (const b of blocks) {
    if (b.type === 'tool_use') {
      counts[b.name] = (counts[b.name] ?? 0) + 1
    } else if (b.type === 'tool_result' && b.is_error) {
      errorCount++
    }
  }

  // Merge by phrase so "read 3 files" joins with a second fs_read into "read 4 files".
  const phrases: Record<string, number> = {}
  for (const [name, n] of Object.entries(counts)) {
    const vn = TOOL_VERB[name]
    const phrase = vn
      ? (n === 1
          ? `${vn.verb} ${articleFor(vn.noun)} ${vn.noun}`
          : `${vn.verb} ${n} ${pluralize(vn.noun, n)}`)
      : `used ${name}`
    phrases[phrase] = (phrases[phrase] ?? 0) + n
  }

  const parts = Object.keys(phrases)
  let label: string
  if (parts.length === 0) {
    label = 'Tool activity'
  } else if (parts.length === 1) {
    label = cap(parts[0])
  } else if (parts.length === 2) {
    label = cap(`${parts[0]}, ${parts[1]}`)
  } else {
    label = cap(`${parts.slice(0, -1).join(', ')}, and ${parts[parts.length - 1]}`)
  }
  if (errorCount > 0) {
    label += ` — ${errorCount} error${errorCount === 1 ? '' : 's'}`
  }
  const totalCalls = Object.values(counts).reduce((a, b) => a + b, 0)
  return { label, count: totalCalls }
}

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }
function articleFor(n: string): string {
  return /^[aeiou]/i.test(n) ? 'an' : n === 'code' || n === 'the web' || n === 'plan mode' ? '' : 'a'
}
function pluralize(n: string, count: number): string {
  if (count === 1 || n === 'code' || n === 'the web' || n === 'plan mode' || n === 'todos') return n
  if (n.endsWith('y')) return n.slice(0, -1) + 'ies'
  return n + 's'
}

function ActivityGroup({ blocks }: { blocks: ContentBlock[] }) {
  const [open, setOpen] = useState(false)
  const { label, count } = useMemo(() => summarizeActivity(blocks), [blocks])
  const hasError = blocks.some((b) => b.type === 'tool_result' && b.is_error)
  return (
    <div className={`wsh-tool-activity ${hasError ? 'has-err' : ''}`}>
      <button
        type="button"
        className="wsh-tool-activity-hd"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <ChevronRight
          size={12}
          style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 0.15s' }}
        />
        <span className="wsh-tool-activity-label">{label}</span>
        {count > 1 && (
          <span className="wsh-tool-activity-count" aria-hidden>{count} calls</span>
        )}
      </button>
      {open && (
        <div className="wsh-tool-activity-body">
          {blocks.map((block, i) => (
            <BlockView key={i} block={block} />
          ))}
        </div>
      )}
    </div>
  )
}

// ── Existing primitives ──────────────────────────────────────────

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
    <div className="wsh-msg-actions">
      <button className="wsh-msg-action" onClick={onCopy} title="Copy response">
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
            <a href={href} onClick={(e) => { e.preventDefault(); if (href) window.wish?.app.openExternal(href) }}>
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
    <div className="wsh-thinking">
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
    <div className="wsh-tooluse">
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
    <div className="wsh-toolresult" style={isError ? { borderColor: 'var(--err)' } : undefined}>
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

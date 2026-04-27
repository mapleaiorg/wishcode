/**
 * Mem-2 — Per-surface context adapters.
 *
 * Thin wrappers around `assembleContext` (Mem-1) that bind
 * surface-specific defaults: which scopes to draw from, which
 * bindings to thread, what budget to reserve. Callers get a stable
 * single-call API per surface and don't need to know the scoring
 * rules.
 */

import type { MemoryStore } from './types.js'
import { assembleContext, type AssembleRequest, type AssembledContext } from './context.js'

export interface ChatAdapterOptions {
  store: MemoryStore
  /** Required: the current chat session id. Drives `session` scope. */
  sessionId: string
  /** Optional: workspace id; if set, includes `workspace` scope. */
  workspaceId?: string
  /** Char budget for chat context. Default 4000 (~1k tokens). */
  budgetChars?: number
}

export interface CodeAdapterOptions {
  store: MemoryStore
  workspaceId: string
  /** Char budget. Default 6000 — code surfaces tolerate more context. */
  budgetChars?: number
}

export interface AgentAdapterOptions {
  store: MemoryStore
  agentId: string
  /** Optional task binding for agent-driven tasks. */
  taskId?: string
  workspaceId?: string
  /** Char budget. Default 8000. */
  budgetChars?: number
  /** Cap on entries — agent prefers tighter context. Default 16. */
  maxEntries?: number
}

/**
 * Chat surface: personal + (optionally) workspace + the current
 * session's scratch. Tasks are deliberately excluded; the chat
 * shouldn't pull in context from a task the user hasn't surfaced.
 */
export async function assembleChatContext(
  opts: ChatAdapterOptions,
  query?: string,
): Promise<AssembledContext> {
  const req: AssembleRequest = {
    query,
    scopes: opts.workspaceId
      ? ['personal', 'workspace', 'session']
      : ['personal', 'session'],
    bindings: {
      sessionId: opts.sessionId,
      ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
    },
    budgetChars: opts.budgetChars ?? 4000,
  }
  return assembleContext(opts.store, req)
}

/**
 * Code surface: workspace-first, then personal. No session/task —
 * Code is workspace-anchored even when the user is also chatting.
 */
export async function assembleCodeContext(
  opts: CodeAdapterOptions,
  query?: string,
): Promise<AssembledContext> {
  return assembleContext(opts.store, {
    query,
    scopes: ['workspace', 'personal'],
    bindings: { workspaceId: opts.workspaceId },
    budgetChars: opts.budgetChars ?? 6000,
  })
}

/**
 * Agent surface: every scope but with bindings narrowed to the
 * agent + (optionally) its bound task + workspace. Agents see their
 * own scratch; the chat surface does not.
 */
export async function assembleAgentContext(
  opts: AgentAdapterOptions,
  query?: string,
): Promise<AssembledContext> {
  // `task` scope only included when a taskId is bound — without one,
  // there's no way to scope the entries safely.
  const scopes = opts.taskId
    ? ['personal', 'workspace', 'task', 'agent'] as const
    : ['personal', 'workspace', 'agent'] as const
  return assembleContext(opts.store, {
    query,
    scopes: [...scopes],
    bindings: {
      agentId: opts.agentId,
      ...(opts.taskId ? { taskId: opts.taskId } : {}),
      ...(opts.workspaceId ? { workspaceId: opts.workspaceId } : {}),
    },
    budgetChars: opts.budgetChars ?? 8000,
    maxEntries: opts.maxEntries ?? 16,
  })
}

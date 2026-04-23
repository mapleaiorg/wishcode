/**
 * todo_write — maintain a structured task list scoped to a session.
 *
 * Claude Code's flagship planning tool. The model calls this to break a
 * multi-step request into tracked items with statuses (pending / in_progress
 * / completed). The renderer renders the list live; this module persists
 * state in-memory keyed by sessionId and emits `tasks.update` for the UI.
 *
 * Back-compat with the Claude Code wire format:
 *   { todos: [ { content, activeForm, status } ] }
 */

import { emit } from '../core/events.js'
import { registerTool, type ToolDef } from './registry.js'

export type TodoStatus = 'pending' | 'in_progress' | 'completed'
export interface TodoItem {
  content: string
  activeForm: string
  status: TodoStatus
}

const lists = new Map<string, TodoItem[]>()

export function getTodos(sessionId: string): TodoItem[] {
  return lists.get(sessionId) ?? []
}

interface Input {
  todos: TodoItem[]
}

function validate(todos: unknown): TodoItem[] {
  if (!Array.isArray(todos)) throw new Error('todos must be an array')
  const out: TodoItem[] = []
  let inProgress = 0
  for (const [i, t] of todos.entries()) {
    if (!t || typeof t !== 'object') throw new Error(`todos[${i}] must be an object`)
    const content = (t as any).content
    const activeForm = (t as any).activeForm
    const status = (t as any).status
    if (typeof content !== 'string' || !content.trim()) throw new Error(`todos[${i}].content required`)
    if (typeof activeForm !== 'string' || !activeForm.trim()) throw new Error(`todos[${i}].activeForm required`)
    if (status !== 'pending' && status !== 'in_progress' && status !== 'completed') {
      throw new Error(`todos[${i}].status must be pending|in_progress|completed`)
    }
    if (status === 'in_progress') inProgress++
    out.push({ content: content.trim(), activeForm: activeForm.trim(), status })
  }
  if (inProgress > 1) throw new Error('at most one todo may be in_progress at a time')
  return out
}

const tool: ToolDef<Input, unknown> = {
  name: 'todo_write',
  title: 'Update task list',
  description:
    'Create and maintain a structured task list for the current session. Use for multi-step ' +
    'tasks (3+ steps) to track progress. Mark exactly one todo as "in_progress" at a time. ' +
    'Each todo needs: `content` (imperative, e.g. "Run tests"), `activeForm` (present-continuous, ' +
    'e.g. "Running tests"), and `status` (pending | in_progress | completed).',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      todos: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            content: { type: 'string' },
            activeForm: { type: 'string' },
            status: { type: 'string', enum: ['pending', 'in_progress', 'completed'] },
          },
          required: ['content', 'activeForm', 'status'],
        },
      },
    },
    required: ['todos'],
  },
  async handler(input: Input, ctx) {
    const next = validate(input.todos)
    lists.set(ctx.sessionId, next)
    emit('tasks.update', { sessionId: ctx.sessionId, todos: next })
    const summary = {
      total: next.length,
      pending: next.filter((t) => t.status === 'pending').length,
      in_progress: next.filter((t) => t.status === 'in_progress').length,
      completed: next.filter((t) => t.status === 'completed').length,
    }
    return { ok: true, ...summary, todos: next }
  },
}

registerTool(tool as ToolDef<unknown, unknown>)

/**
 * task_* — background task tools.
 *
 * Unlike `agent_task` (runs a sub-agent synchronously and returns its final
 * report), these tools hand off long-running work to the task manager so
 * the main turn-loop keeps going. The model can poll `task_list` / `task_get`
 * and cancel via `task_stop`.
 *
 * `task_create` spawns a sub-agent in the background — same plumbing as
 * `agent_task` but wrapped in a Task. Output is appended to `task.output`
 * as the sub-agent streams.
 */

import { streamChat } from '../llm/chat.js'
import { currentModel } from '../llm/model.js'
import { anthropicTools, registerTool, type ToolDef } from './registry.js'
import {
  cancelTask,
  clearCompleted,
  createTask,
  getTask,
  listTasks,
  removeTask,
} from '../tasks/manager.js'

// ── task_create ────────────────────────────────────────────────────

interface CreateInput {
  title: string
  prompt: string
}

registerTool({
  name: 'task_create',
  title: 'Start background task',
  description:
    'Kick off a sub-agent in the background and return immediately with a task id. ' +
    'Use for long-running work (watches, bulk refactors, data gathers) where you want ' +
    'to keep working in parallel. Poll with `task_get` or `task_list`; stop with `task_stop`.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Short human-readable title for the task.' },
      prompt: { type: 'string', description: 'Self-contained instructions for the sub-agent.' },
    },
    required: ['title', 'prompt'],
  },
  async handler(input: CreateInput) {
    const model = currentModel()
    const task = createTask({
      title: input.title,
      meta: { kind: 'agent', model: model.model },
      run: async ({ update, signal }) => {
        let out = ''
        await streamChat({
          model: model.model,
          systemPrompt:
            'You are a focused background sub-agent. Do the task end-to-end using the ' +
            'tools available. Make reasonable choices — do not ask for clarification. ' +
            'End with a concise summary of what you did and what you found.',
          messages: [{ role: 'user', content: input.prompt }],
          tools: model.provider === 'anthropic' ? anthropicTools() : undefined,
          signal,
          onDelta(chunk) {
            out += chunk
            update({ output: out })
          },
          onThinking() {},
          onToolUse() {},
        })
        return out.trim()
      },
    })
    return { id: task.id, status: task.status, title: task.title }
  },
} as ToolDef<CreateInput, unknown> as ToolDef<unknown, unknown>)

// ── task_list ──────────────────────────────────────────────────────

interface ListInput {
  status?: 'queued' | 'running' | 'done' | 'failed' | 'cancelled' | 'all'
  limit?: number
}

registerTool({
  name: 'task_list',
  title: 'List background tasks',
  description: 'List background tasks, newest first. Optionally filter by status.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      status: { type: 'string', enum: ['queued', 'running', 'done', 'failed', 'cancelled', 'all'] },
      limit: { type: 'integer', minimum: 1, maximum: 200 },
    },
  },
  async handler(input: ListInput) {
    const all = listTasks()
    const filtered = !input.status || input.status === 'all'
      ? all
      : all.filter((t) => t.status === input.status)
    const limit = Math.max(1, Math.min(200, Number(input.limit ?? 50)))
    return {
      count: filtered.length,
      tasks: filtered.slice(0, limit).map((t) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        progress: t.progress ?? null,
        createdAt: t.createdAt,
        finishedAt: t.finishedAt ?? null,
      })),
    }
  },
} as ToolDef<ListInput, unknown> as ToolDef<unknown, unknown>)

// ── task_get ───────────────────────────────────────────────────────

interface GetInput {
  id: string
  truncate?: number
}

const DEFAULT_TRUNCATE = 20_000

registerTool({
  name: 'task_get',
  title: 'Get task status',
  description: 'Fetch the current state of a background task, including its accumulated output.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      truncate: { type: 'integer', minimum: 1000, maximum: 200_000, description: 'Max output chars.' },
    },
    required: ['id'],
  },
  async handler(input: GetInput) {
    const task = getTask(input.id)
    if (!task) throw new Error(`no such task: ${input.id}`)
    const max = Math.max(1000, Math.min(200_000, Number(input.truncate ?? DEFAULT_TRUNCATE)))
    const output = task.output && task.output.length > max
      ? task.output.slice(0, max) + '\n…[truncated]…'
      : task.output
    return {
      id: task.id,
      title: task.title,
      status: task.status,
      progress: task.progress ?? null,
      createdAt: task.createdAt,
      startedAt: task.startedAt ?? null,
      finishedAt: task.finishedAt ?? null,
      output,
      error: task.error,
    }
  },
} as ToolDef<GetInput, unknown> as ToolDef<unknown, unknown>)

// ── task_stop ──────────────────────────────────────────────────────

interface StopInput { id: string }

registerTool({
  name: 'task_stop',
  title: 'Stop background task',
  description: 'Abort a running background task. No-op if the task is not running.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async handler(input: StopInput) {
    const ok = cancelTask(input.id)
    return { id: input.id, cancelled: ok }
  },
} as ToolDef<StopInput, unknown> as ToolDef<unknown, unknown>)

// ── task_cleanup ───────────────────────────────────────────────────

interface CleanupInput {
  id?: string
}

registerTool({
  name: 'task_cleanup',
  title: 'Remove finished tasks',
  description:
    'Remove a specific finished task (pass `id`) or clear every done/failed/cancelled task ' +
    '(omit `id`). Running tasks are left alone — stop them first with `task_stop`.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
  },
  async handler(input: CleanupInput) {
    if (input.id) {
      const ok = removeTask(input.id)
      return { id: input.id, removed: ok }
    }
    const removed = clearCompleted()
    return { removed }
  },
} as ToolDef<CleanupInput, unknown> as ToolDef<unknown, unknown>)

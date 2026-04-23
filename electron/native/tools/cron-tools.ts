/**
 * cron_* — let the model create, list, delete, and manually fire scheduled prompts.
 *
 * Schedules are stored at ~/.wishcode/schedules.json and fired by the minute
 * ticker in cron/scheduler.ts. Each tick matches schedules against the
 * wall-clock minute and spawns a background task that runs the stored
 * prompt through the turn-loop.
 */

import { registerTool, type ToolDef } from './registry.js'
import {
  createSchedule,
  deleteSchedule,
  fireSchedule,
  getSchedule,
  listSchedules,
  updateSchedule,
} from '../cron/scheduler.js'

interface CreateInput {
  name: string
  expression: string
  prompt: string
}

registerTool({
  name: 'cron_create',
  title: 'Schedule recurring prompt',
  description:
    'Create a scheduled prompt that runs on a cron expression. The expression uses standard ' +
    '5-field syntax (min hour dom month dow) or an alias like @hourly / @daily / @weekly. ' +
    'The prompt is fired into a dedicated session each tick, as a background task.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string', description: 'Human label, shown in /tasks.' },
      expression: { type: 'string', description: 'e.g. "*/15 * * * *" or "@daily".' },
      prompt: { type: 'string', description: 'What to run each tick.' },
    },
    required: ['name', 'expression', 'prompt'],
  },
  async handler(input: CreateInput) {
    const s = createSchedule(input)
    return { id: s.id, name: s.name, expression: s.expression, createdAt: s.createdAt }
  },
} as ToolDef<CreateInput, unknown> as ToolDef<unknown, unknown>)

registerTool({
  name: 'cron_list',
  title: 'List schedules',
  description: 'List scheduled prompts.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    const list = listSchedules()
    return {
      count: list.length,
      schedules: list.map((s) => ({
        id: s.id,
        name: s.name,
        expression: s.expression,
        disabled: !!s.disabled,
        lastRunAt: s.lastRunAt ?? null,
        lastRunTaskId: s.lastRunTaskId ?? null,
        runCount: s.runCount ?? 0,
      })),
    }
  },
} as ToolDef<unknown, unknown>)

interface UpdateInput {
  id: string
  name?: string
  expression?: string
  prompt?: string
  disabled?: boolean
}

registerTool({
  name: 'cron_update',
  title: 'Update schedule',
  description: 'Change an existing schedule. Any omitted field is left unchanged.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      id: { type: 'string' },
      name: { type: 'string' },
      expression: { type: 'string' },
      prompt: { type: 'string' },
      disabled: { type: 'boolean' },
    },
    required: ['id'],
  },
  async handler(input: UpdateInput) {
    const updated = updateSchedule(input.id, {
      name: input.name,
      expression: input.expression,
      prompt: input.prompt,
      disabled: input.disabled,
    })
    if (!updated) throw new Error(`no such schedule: ${input.id}`)
    return { id: updated.id, name: updated.name, expression: updated.expression, disabled: !!updated.disabled }
  },
} as ToolDef<UpdateInput, unknown> as ToolDef<unknown, unknown>)

interface IdInput { id: string }

registerTool({
  name: 'cron_delete',
  title: 'Delete schedule',
  description: 'Remove a scheduled prompt.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async handler(input: IdInput) {
    const ok = deleteSchedule(input.id)
    return { id: input.id, deleted: ok }
  },
} as ToolDef<IdInput, unknown> as ToolDef<unknown, unknown>)

registerTool({
  name: 'cron_run_now',
  title: 'Run schedule now',
  description: 'Fire a schedule immediately as a background task.',
  category: 'tasks',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async handler(input: IdInput) {
    const s = getSchedule(input.id)
    if (!s) throw new Error(`no such schedule: ${input.id}`)
    const taskId = fireSchedule(s)
    return { id: s.id, taskId, disabled: !!s.disabled }
  },
} as ToolDef<IdInput, unknown> as ToolDef<unknown, unknown>)

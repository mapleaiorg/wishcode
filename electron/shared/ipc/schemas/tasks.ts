/**
 * Domain: tasks
 *
 * Channels: wish:tasks:list, wish:tasks:cancel, wish:tasks:remove, wish:tasks:clearCompleted
 * Events:   tasks.update, tasks.changed
 */

import { z } from 'zod'
import { channel, eventChannel } from '../channel'
import { EmptyInputSchema, IdSchema, IsoTimestampSchema } from '../types/common'

export const TaskStatusSchema = z.enum(['queued', 'running', 'done', 'failed', 'cancelled'])

export const TaskSchema = z.object({
  id: IdSchema,
  title: z.string(),
  status: TaskStatusSchema,
  createdAt: IsoTimestampSchema,
  startedAt: IsoTimestampSchema.optional(),
  finishedAt: IsoTimestampSchema.optional(),
  progress: z.number().optional(),
  output: z.string().optional(),
  error: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const TasksListInput = EmptyInputSchema
export const TasksListOutput = z.array(TaskSchema)

export const TasksCancelInput = z.object({ id: IdSchema })
export const TasksCancelOutput = z.boolean()

export const TasksRemoveInput = z.object({ id: IdSchema })
export const TasksRemoveOutput = z.boolean()

export const TasksClearCompletedInput = EmptyInputSchema
export const TasksClearCompletedOutput = z.number().int().nonnegative()

export const TasksUpdateEvent = z.object({
  id: IdSchema,
  task: TaskSchema,
})

export const TasksChangedEvent = z.object({
  runningCount: z.number().int().nonnegative(),
  total: z.number().int().nonnegative(),
})

export const TasksChannels = {
  list: channel('tasks', 'list'),
  cancel: channel('tasks', 'cancel'),
  remove: channel('tasks', 'remove'),
  clearCompleted: channel('tasks', 'clearCompleted'),
} as const

export const TasksEvents = {
  update: eventChannel('tasks.update'),
  changed: eventChannel('tasks.changed'),
} as const

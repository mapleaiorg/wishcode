/**
 * Domain: todos
 * Channels: wish:todos:get
 */

import { z } from 'zod'
import { channel } from '../channel'
import { IdSchema } from '../types/common'

export const TodoStatusSchema = z.enum(['pending', 'in_progress', 'completed'])

export const TodoSchema = z.object({
  content: z.string(),
  activeForm: z.string(),
  status: TodoStatusSchema,
})

export const TodosGetInput = z.object({ sessionId: IdSchema })
export const TodosGetOutput = z.array(TodoSchema)

export const TodosChannels = {
  get: channel('todos', 'get'),
} as const

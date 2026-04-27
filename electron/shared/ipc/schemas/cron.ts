/**
 * Domain: cron
 * Channels: wish:cron:list, wish:cron:create, wish:cron:update,
 *           wish:cron:delete, wish:cron:runNow
 */

import { z } from 'zod'
import { channel } from '../channel'
import { EmptyInputSchema, IdSchema, IsoTimestampSchema } from '../types/common'

export const CronEntrySchema = z.object({
  id: IdSchema,
  name: z.string(),
  expression: z.string(),
  prompt: z.string(),
  enabled: z.boolean().optional(),
  createdAt: IsoTimestampSchema.optional(),
  lastRunAt: IsoTimestampSchema.optional(),
}).passthrough()

export const CronListInput = EmptyInputSchema
export const CronListOutput = z.array(CronEntrySchema)

export const CronCreateInput = z.object({
  name: z.string().min(1),
  expression: z.string().min(1),
  prompt: z.string().min(1),
})
export const CronCreateOutput = CronEntrySchema

export const CronUpdateInput = z.object({
  id: IdSchema,
  patch: z.object({
    name: z.string().optional(),
    expression: z.string().optional(),
    prompt: z.string().optional(),
    enabled: z.boolean().optional(),
  }),
})
export const CronUpdateOutput = CronEntrySchema

export const CronDeleteInput = z.object({ id: IdSchema })
export const CronDeleteOutput = z.boolean()

export const CronRunNowInput = z.object({ id: IdSchema })
export const CronRunNowOutput = z.object({ taskId: z.string().nullable() })

export const CronChannels = {
  list: channel('cron', 'list'),
  create: channel('cron', 'create'),
  update: channel('cron', 'update'),
  delete: channel('cron', 'delete'),
  runNow: channel('cron', 'runNow'),
} as const

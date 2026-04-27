/**
 * Domain: memory
 *
 * Channels: wish:memory:add, wish:memory:list, wish:memory:remove,
 *           wish:memory:update, wish:memory:recall
 * Events:   memory.changed
 */

import { z } from 'zod'
import { channel, eventChannel } from '../channel'
import { EmptyInputSchema, IdSchema, IsoTimestampSchema } from '../types/common'

export const MemoryEntrySchema = z.object({
  id: IdSchema,
  body: z.string(),
  tags: z.array(z.string()).default([]),
  pinned: z.boolean().default(false),
  createdAt: IsoTimestampSchema,
  updatedAt: IsoTimestampSchema.optional(),
})

export const MemoryAddInput = z.object({
  body: z.string().min(1),
  tags: z.array(z.string()).optional(),
  pinned: z.boolean().optional(),
})
export const MemoryAddOutput = MemoryEntrySchema

export const MemoryListInput = EmptyInputSchema
export const MemoryListOutput = z.array(MemoryEntrySchema)

export const MemoryRemoveInput = z.object({ id: IdSchema })
export const MemoryRemoveOutput = z.boolean()

export const MemoryUpdateInput = z.object({
  id: IdSchema,
  patch: z.object({
    body: z.string().optional(),
    tags: z.array(z.string()).optional(),
    pinned: z.boolean().optional(),
  }),
})
export const MemoryUpdateOutput = MemoryEntrySchema

export const MemoryRecallInput = z.object({
  query: z.string(),
  limit: z.number().int().positive().optional(),
})
export const MemoryRecallOutput = z.array(
  z.object({
    entry: MemoryEntrySchema,
    score: z.number(),
  }),
)

export const MemoryChangedEvent = z.object({}).passthrough()

export const MemoryChannels = {
  add: channel('memory', 'add'),
  list: channel('memory', 'list'),
  remove: channel('memory', 'remove'),
  update: channel('memory', 'update'),
  recall: channel('memory', 'recall'),
} as const

export const MemoryEvents = {
  changed: eventChannel('memory.changed'),
} as const

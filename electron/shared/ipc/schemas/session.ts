/**
 * Domain: session (chat transcript)
 * Channels: wish:session:read, wish:session:clear, wish:session:compact, wish:session:export
 */

import { z } from 'zod'
import { channel } from '../channel'
import { IdSchema, IsoTimestampSchema } from '../types/common'

export const SessionMessageSchema = z.object({
  id: IdSchema,
  role: z.enum(['system', 'user', 'assistant', 'tool']),
  content: z.unknown(),
  createdAt: IsoTimestampSchema,
}).passthrough()

export const SessionReadInput = z.object({ sessionId: IdSchema })
export const SessionReadOutput = z.array(SessionMessageSchema)

export const SessionClearInput = z.object({ sessionId: IdSchema })
export const SessionClearOutput = z.void()

export const SessionCompactInput = z.object({
  sessionId: IdSchema,
  keepRecent: z.number().int().nonnegative().optional(),
})
export const SessionCompactOutput = z.object({
  droppedTurns: z.number(),
  summaryChars: z.number(),
})

export const SessionExportInput = z.object({
  sessionId: IdSchema,
  fmt: z.enum(['markdown', 'json']),
})
export const SessionExportOutput = z.string()

export const SessionChannels = {
  read: channel('session', 'read'),
  clear: channel('session', 'clear'),
  compact: channel('session', 'compact'),
  export: channel('session', 'export'),
} as const

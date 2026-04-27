/**
 * Domain: swarm
 * Channels: wish:swarm:run
 */

import { z } from 'zod'
import { channel } from '../channel'
import { IdSchema } from '../types/common'

export const SwarmRunInput = z.object({ brief: z.string().min(1) })
export const SwarmRunOutput = z.object({
  taskId: IdSchema.optional(),
  ok: z.boolean(),
  message: z.string().optional(),
}).passthrough()

export const SwarmChannels = {
  run: channel('swarm', 'run'),
} as const

/**
 * Domain: hooks
 * Channels: wish:hooks:read, wish:hooks:write
 */

import { z } from 'zod'
import { channel } from '../channel'
import { EmptyInputSchema } from '../types/common'

export const HooksReadInput = EmptyInputSchema
export const HooksReadOutput = z.object({
  file: z.string(),
  content: z.string(),
})

export const HooksWriteInput = z.object({ content: z.string() })
export const HooksWriteOutput = z.object({ file: z.string() })

export const HooksChannels = {
  read: channel('hooks', 'read'),
  write: channel('hooks', 'write'),
} as const

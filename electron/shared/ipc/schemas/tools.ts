/**
 * Domain: tools
 * Channels: wish:tools:list
 */

import { z } from 'zod'
import { channel } from '../channel'
import { EmptyInputSchema } from '../types/common'

export const ToolPermissionSchema = z.enum(['auto', 'ask', 'plan', 'bypass'])

export const ToolMetaSchema = z.object({
  name: z.string(),
  title: z.string(),
  description: z.string(),
  category: z.string(),
  permission: ToolPermissionSchema,
  dangerous: z.boolean(),
  inputSchema: z.unknown(),
})

export const ToolsListInput = EmptyInputSchema
export const ToolsListOutput = z.array(ToolMetaSchema)

export const ToolsChannels = {
  list: channel('tools', 'list'),
} as const

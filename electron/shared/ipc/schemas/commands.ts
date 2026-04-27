/**
 * Domain: commands (slash commands)
 * Channels: wish:commands:list, wish:commands:run
 */

import { z } from 'zod'
import { channel } from '../channel'
import { EmptyInputSchema, IdSchema } from '../types/common'

export const SlashCommandSchema = z.object({
  name: z.string(),
  summary: z.string(),
  category: z.string(),
  usage: z.string().optional(),
  aliases: z.array(z.string()),
})

export const CommandsListInput = EmptyInputSchema
export const CommandsListOutput = z.array(SlashCommandSchema)

export const CommandsRunInput = z.object({
  sessionId: IdSchema,
  input: z.string(),
})
export const CommandsRunOutput = z.object({
  ok: z.boolean(),
  output: z.string().optional(),
  data: z.unknown().optional(),
  message: z.string().optional(),
})

export const CommandsChannels = {
  list: channel('commands', 'list'),
  run: channel('commands', 'run'),
} as const

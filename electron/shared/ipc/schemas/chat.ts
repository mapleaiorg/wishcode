/**
 * Domain: chat
 *
 * Channels: wish:chat:send, wish:chat:abort
 * Events:   chat.delta, chat.thinking, chat.toolUse, chat.toolResult,
 *           chat.done, chat.error, query.status
 *
 * Notes: existing wishcode `chat:send` accepts an optional `permission`
 * string used by tool gating; D-1 will swap the wire to pass an object,
 * D-0 keeps the field shape so consumers can validate today.
 */

import { z } from 'zod'
import { channel, eventChannel } from '../channel'
import { IdSchema } from '../types/common'

export const ChatPermissionSchema = z.enum(['auto', 'ask', 'plan', 'bypass']).optional()

export const ChatSendInput = z.object({
  sessionId: IdSchema,
  requestId: IdSchema,
  text: z.string(),
  permission: ChatPermissionSchema,
})

export const ChatUsageSchema = z.object({
  inputTokens: z.number().optional(),
  outputTokens: z.number().optional(),
  cachedInputTokens: z.number().optional(),
  reasoningTokens: z.number().optional(),
}).passthrough()

export const ChatSendOutput = z.object({
  requestId: IdSchema,
  stopReason: z.string(),
  usage: ChatUsageSchema.optional(),
})

export const ChatAbortInput = z.object({ requestId: IdSchema })
export const ChatAbortOutput = z.boolean()

export const ChatDeltaEvent = z.object({
  requestId: IdSchema,
  text: z.string(),
})

export const ChatThinkingEvent = z.object({
  requestId: IdSchema,
  text: z.string(),
})

export const ChatToolUseEvent = z.object({
  requestId: IdSchema,
  toolUseId: IdSchema,
  name: z.string(),
  input: z.unknown(),
}).passthrough()

export const ChatToolResultEvent = z.object({
  requestId: IdSchema,
  toolUseId: IdSchema,
  output: z.unknown(),
  isError: z.boolean().optional(),
}).passthrough()

export const ChatDoneEvent = z.object({
  requestId: IdSchema,
  usage: ChatUsageSchema.optional(),
  stopReason: z.string(),
})

export const ChatErrorEvent = z.object({
  requestId: IdSchema,
  error: z.string(),
})

export const ChatStatusEvent = z.object({}).passthrough()

export const ChatChannels = {
  send: channel('chat', 'send'),
  abort: channel('chat', 'abort'),
} as const

export const ChatEvents = {
  delta: eventChannel('chat.delta'),
  thinking: eventChannel('chat.thinking'),
  toolUse: eventChannel('chat.toolUse'),
  toolResult: eventChannel('chat.toolResult'),
  done: eventChannel('chat.done'),
  error: eventChannel('chat.error'),
  status: eventChannel('query.status'),
} as const

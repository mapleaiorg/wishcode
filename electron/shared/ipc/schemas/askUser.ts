/**
 * Domain: askUser
 *
 * Channels: wish:askUser:answer
 * Events:   tool.askUser
 */

import { z } from 'zod'
import { channel, eventChannel } from '../channel'
import { IdSchema } from '../types/common'

export const AskUserAnswerInput = z.object({
  requestId: IdSchema,
  answer: z.object({
    choice: z.string(),
    text: z.string().optional(),
  }),
})
export const AskUserAnswerOutput = z.boolean()

export const AskUserQuestionEvent = z.object({
  requestId: IdSchema,
  sessionId: IdSchema,
  question: z.string(),
  options: z.array(z.string()),
  allowFreeText: z.boolean(),
})

export const AskUserChannels = {
  answer: channel('askUser', 'answer'),
} as const

export const AskUserEvents = {
  question: eventChannel('tool.askUser'),
} as const

/**
 * Domain: buddy
 *
 * Channels: wish:buddy:get, wish:buddy:dismiss
 * Events:   buddy.update
 */

import { z } from 'zod'
import { channel, eventChannel } from '../channel'
import { EmptyInputSchema, IdSchema } from '../types/common'

export const BuddyViewSchema = z.object({
  items: z.array(z.unknown()).optional(),
}).passthrough()

export const BuddyGetInput = EmptyInputSchema
export const BuddyGetOutput = BuddyViewSchema

export const BuddyDismissInput = z.object({ id: IdSchema })
export const BuddyDismissOutput = z.void()

export const BuddyUpdateEvent = BuddyViewSchema

export const BuddyChannels = {
  get: channel('buddy', 'get'),
  dismiss: channel('buddy', 'dismiss'),
} as const

export const BuddyEvents = {
  update: eventChannel('buddy.update'),
} as const

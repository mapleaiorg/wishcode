/**
 * Domain: model
 *
 * Channels: wish:model:list, wish:model:set, wish:model:current
 * Events:   model.changed
 */

import { z } from 'zod'
import { channel, eventChannel } from '../channel'
import { EmptyInputSchema } from '../types/common'

export const ProviderModelRefSchema = z.object({
  provider: z.string().min(1),
  model: z.string().min(1),
})

export const ModelInfoSchema = z.object({
  provider: z.string(),
  id: z.string(),
  displayName: z.string().optional(),
  capabilities: z.record(z.string(), z.unknown()).optional(),
})

export const ModelListInput = EmptyInputSchema
export const ModelListOutput = z.array(ModelInfoSchema)

export const ModelSetInput = ProviderModelRefSchema
export const ModelSetOutput = ProviderModelRefSchema

export const ModelCurrentInput = EmptyInputSchema
export const ModelCurrentOutput = ProviderModelRefSchema

export const ModelChangedEvent = z.object({
  from: ProviderModelRefSchema,
  to: ProviderModelRefSchema,
  ts: z.number(),
})

export const ModelChannels = {
  list: channel('model', 'list'),
  set: channel('model', 'set'),
  current: channel('model', 'current'),
} as const

export const ModelEvents = {
  changed: eventChannel('model.changed'),
} as const

/**
 * Domain: proto (handshake)
 *
 * Channel: wish:proto:version — renderer queries main on connect; mismatch
 * with the renderer's compiled-in IPC_PROTOCOL_VERSION surfaces a banner.
 */

import { z } from 'zod'
import { PROTO_VERSION_CHANNEL } from '../version'
import { EmptyInputSchema } from '../types/common'

export const ProtoVersionInput = EmptyInputSchema
export const ProtoVersionOutput = z.object({
  version: z.number().int().positive(),
})

export const ProtoChannels = {
  version: PROTO_VERSION_CHANNEL,
} as const

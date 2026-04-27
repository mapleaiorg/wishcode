/**
 * Domain: config
 * Channels: wish:config:get, wish:config:set
 */

import { z } from 'zod'
import { channel } from '../channel'

export const ConfigGetInput = z.object({ key: z.string().optional() })
export const ConfigGetOutput = z.unknown()

export const ConfigSetInput = z.object({ key: z.string().min(1), value: z.unknown() })
export const ConfigSetOutput = z.literal(true)

export const ConfigChannels = {
  get: channel('config', 'get'),
  set: channel('config', 'set'),
} as const

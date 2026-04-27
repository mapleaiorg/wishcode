/**
 * Domain: app
 *
 * Channels: wish:app:version, wish:app:paths, wish:app:quit,
 *           wish:app:openExternal, wish:app:logs
 * Events:   log.entry
 */

import { z } from 'zod'
import { channel, eventChannel } from '../channel'
import { EmptyInputSchema } from '../types/common'

export const AppVersionInput = EmptyInputSchema
export const AppVersionOutput = z.object({ version: z.string() })

export const AppPathsInput = EmptyInputSchema
export const AppPathsOutput = z.record(z.string(), z.string())

export const AppQuitInput = EmptyInputSchema
export const AppQuitOutput = z.void()

export const AppOpenExternalInput = z.object({ url: z.string().url() })
export const AppOpenExternalOutput = z.void()

export const AppLogsInput = z.object({ limit: z.number().int().nonnegative().optional() })
export const LogEntrySchema = z.object({
  ts: z.number(),
  level: z.string(),
  scope: z.string(),
  msg: z.string(),
})
export const AppLogsOutput = z.array(LogEntrySchema)

export const AppLogEntryEvent = LogEntrySchema

export const AppChannels = {
  version: channel('app', 'version'),
  paths: channel('app', 'paths'),
  quit: channel('app', 'quit'),
  openExternal: channel('app', 'openExternal'),
  logs: channel('app', 'logs'),
} as const

export const AppEvents = {
  logEntry: eventChannel('log.entry'),
} as const

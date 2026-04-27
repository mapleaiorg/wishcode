/**
 * Domain: workspace
 * Channels: wish:workspace:get, wish:workspace:set
 */

import { z } from 'zod'
import { channel } from '../channel'
import { EmptyInputSchema } from '../types/common'

export const WorkspaceGetInput = EmptyInputSchema
export const WorkspaceGetOutput = z.string()

export const WorkspaceSetInput = z.object({ dir: z.string().min(1) })
export const WorkspaceSetOutput = z.string()

export const WorkspaceChannels = {
  get: channel('workspace', 'get'),
  set: channel('workspace', 'set'),
} as const

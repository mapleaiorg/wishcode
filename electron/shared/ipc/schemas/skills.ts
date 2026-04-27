/**
 * Domain: skills
 * Channels: wish:skills:list, wish:skills:reload, wish:skills:install, wish:skills:uninstall
 */

import { z } from 'zod'
import { channel } from '../channel'
import { EmptyInputSchema } from '../types/common'

export const SkillSchema = z.object({
  name: z.string(),
  title: z.string().optional(),
  description: z.string().optional(),
  triggers: z.array(z.string()).optional(),
  tools: z.array(z.string()).optional(),
  permissions: z.array(z.string()).optional(),
  version: z.string().optional(),
  author: z.string().optional(),
  source: z.enum(['builtin', 'user']).optional(),
  body: z.string().optional(),
})

export const SkillsListInput = EmptyInputSchema
export const SkillsListOutput = z.array(SkillSchema)

export const SkillsReloadInput = EmptyInputSchema
export const SkillsReloadOutput = z.array(SkillSchema)

export const SkillsInstallInput = z.object({
  name: z.string().min(1),
  markdown: z.string().min(1),
})
export const SkillsInstallOutput = z.object({
  ok: z.boolean(),
  skill: SkillSchema.optional(),
  message: z.string().optional(),
})

export const SkillsUninstallInput = z.object({ name: z.string().min(1) })
export const SkillsUninstallOutput = z.boolean()

export const SkillsChannels = {
  list: channel('skills', 'list'),
  reload: channel('skills', 'reload'),
  install: channel('skills', 'install'),
  uninstall: channel('skills', 'uninstall'),
} as const

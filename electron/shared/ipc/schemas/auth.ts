/**
 * Domain: auth
 *
 * Channels: wish:auth:status, wish:auth:login, wish:auth:logout,
 *           wish:auth:oauthStart, wish:auth:oauthSubmitCode, wish:auth:oauthCancel
 * Events:   auth.oauthComplete
 */

import { z } from 'zod'
import { channel, eventChannel } from '../channel'
import { EmptyInputSchema } from '../types/common'

export const ProviderIdSchema = z.string().min(1)

export const AuthEntrySchema = z.object({
  provider: ProviderIdSchema,
  authenticated: z.boolean(),
  account: z.string().optional(),
  expiresAt: z.string().optional(),
  meta: z.record(z.string(), z.unknown()).optional(),
})

export const AuthStatusInput = EmptyInputSchema
export const AuthStatusOutput = z.array(AuthEntrySchema)

export const AuthLoginInput = z.object({
  provider: ProviderIdSchema,
  creds: z.record(z.string(), z.unknown()).optional(),
})
export const AuthLoginOutput = z.object({
  ok: z.boolean(),
  provider: ProviderIdSchema,
  account: z.string().optional(),
  message: z.string().optional(),
})

export const AuthLogoutInput = z.object({ provider: ProviderIdSchema })
export const AuthLogoutOutput = z.void()

export const AuthOAuthStartInput = EmptyInputSchema
export const AuthOAuthStartOutput = z.object({
  manualUrl: z.string(),
  automaticUrl: z.string(),
})

export const AuthOAuthSubmitCodeInput = z.object({ code: z.string().min(1) })
export const AuthOAuthSubmitCodeOutput = z.void()

export const AuthOAuthCancelInput = EmptyInputSchema
export const AuthOAuthCancelOutput = z.void()

export const AuthOAuthCompleteEvent = z.object({
  ok: z.boolean(),
  provider: ProviderIdSchema,
  message: z.string().optional(),
})

export const AuthChannels = {
  status: channel('auth', 'status'),
  login: channel('auth', 'login'),
  logout: channel('auth', 'logout'),
  oauthStart: channel('auth', 'oauthStart'),
  oauthSubmitCode: channel('auth', 'oauthSubmitCode'),
  oauthCancel: channel('auth', 'oauthCancel'),
} as const

export const AuthEvents = {
  oauthComplete: eventChannel('auth.oauthComplete'),
} as const

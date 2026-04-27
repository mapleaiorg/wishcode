/**
 * Wish Code IPC — Result envelope (CONVENTIONS § 9).
 *
 * Every typed IPC response is a `Result<T>`. The schema variant
 * `resultSchema(dataSchema)` is used by D-1 to validate responses on the
 * renderer side and by tests to round-trip the envelope.
 *
 * NOTE on legacy: existing wishcode IPC ships
 *   `{ ok: true; value: T } | { ok: false; error: string }`.
 * D-0 introduces the v1 envelope without breaking the legacy wire — D-1
 * migrates consumers; D-2 finishes the main-process transition.
 */

import { z } from 'zod'
import { WishErrorSchema, type WishErrorShape } from './error'

export type Result<T, E extends WishErrorShape = WishErrorShape> =
  | { ok: true; data: T }
  | { ok: false; error: E }

/** Generic success-arm schema. Combined with an error arm in {@link resultSchema}. */
export function okSchema<T extends z.ZodTypeAny>(data: T) {
  return z.object({ ok: z.literal(true), data })
}

export const ErrSchema = z.object({ ok: z.literal(false), error: WishErrorSchema })

/**
 * Build a `Result<T>` schema from a data schema. The full discriminated union
 * is keyed by `ok` so zod produces sharp error messages for malformed envelopes.
 */
export function resultSchema<T extends z.ZodTypeAny>(data: T) {
  return z.discriminatedUnion('ok', [okSchema(data), ErrSchema])
}

export function ok<T>(data: T): Result<T> {
  return { ok: true, data }
}

export function err<T = never>(error: WishErrorShape): Result<T> {
  return { ok: false, error }
}

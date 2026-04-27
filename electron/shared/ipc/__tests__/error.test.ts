/**
 * D-1 — Error envelope tests.
 *
 * Wishes the canonical `WishErrorShape` and the `WishError` class
 * survive the wire intact, and guarantees `IpcResult<T>` discriminates
 * correctly.
 */

import { describe, expect, it } from 'vitest'
import { WishError, WishErrorSchema } from '../error'
import { resultSchema } from '../result'
import { z } from 'zod'

describe('WishError', () => {
  it('carries code, message, retryable, optional cause', () => {
    const e = new WishError('protocol_violation', 'mismatch', { retryable: false })
    expect(e.code).toBe('protocol_violation')
    expect(e.message).toBe('mismatch')
    expect(e.retryable).toBe(false)
  })

  it('serializes to a WishErrorShape via toShape()', () => {
    const e = new WishError('rate_limited', 'slow', { retryable: true, cause: 'x' })
    const shape = e.toShape()
    expect(shape.code).toBe('rate_limited')
    expect(shape.message).toBe('slow')
    expect(shape.retryable).toBe(true)
    expect(shape.cause).toBe('x')
    expect(WishErrorSchema.safeParse(shape).success).toBe(true)
  })

  it('round-trips through Zod', () => {
    const raw = { code: 'not_found', message: 'x', retryable: false }
    const parsed = WishErrorSchema.safeParse(raw)
    expect(parsed.success).toBe(true)
  })

  it('rejects shapes missing required fields', () => {
    expect(WishErrorSchema.safeParse({ code: 'x' }).success).toBe(false)
    expect(WishErrorSchema.safeParse({}).success).toBe(false)
  })
})

describe('IpcResult<T>', () => {
  const Wrapped = resultSchema(z.string())

  it('accepts ok-true with data', () => {
    const r = Wrapped.safeParse({ ok: true, data: 'hello' })
    expect(r.success).toBe(true)
  })

  it('accepts ok-false with error envelope', () => {
    const r = Wrapped.safeParse({
      ok: false,
      error: { code: 'unauthorized', message: 'no', retryable: false },
    })
    expect(r.success).toBe(true)
  })

  it('rejects malformed results', () => {
    expect(Wrapped.safeParse({ ok: true }).success).toBe(false)
    expect(Wrapped.safeParse({ ok: false, error: 'string' }).success).toBe(false)
    expect(Wrapped.safeParse({ ok: 'maybe' }).success).toBe(false)
  })

  it('rejects ok-true with wrong data type', () => {
    expect(Wrapped.safeParse({ ok: true, data: 42 }).success).toBe(false)
  })
})

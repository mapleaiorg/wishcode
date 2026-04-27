/**
 * Wish Code IPC — canonical error shape (CONVENTIONS § 9).
 *
 * Every IPC response that fails carries a {@link WishErrorShape}. Errors are
 * never thrown across IPC; the transport catches and re-encodes. Codes are
 * dotted, lowercase, namespaced by subsystem. The transport owns the
 * `ipc.*` codes; domain handlers own everything else.
 */

import { z } from 'zod'

export const WishErrorSchema = z.object({
  code: z.string().min(1),
  message: z.string(),
  retryable: z.boolean(),
  cause: z.string().optional(),
})

export type WishErrorShape = z.infer<typeof WishErrorSchema>

/** Transport-level error codes reserved for the IPC layer itself. */
export const IPC_ERROR_CODES = {
  VALIDATION_FAILED: 'ipc.validation_failed',
  HANDLER_THREW: 'ipc.handler_threw',
  UNKNOWN_CHANNEL: 'ipc.unknown_channel',
  CAPABILITY_DENIED: 'ipc.capability_denied',
  VERSION_MISMATCH: 'ipc.version_mismatch',
  SUBSCRIPTION_NOT_FOUND: 'ipc.subscription_not_found',
  CANCELLED: 'ipc.cancelled',
  INTERNAL: 'ipc.internal',
} as const

export type IpcErrorCode = (typeof IPC_ERROR_CODES)[keyof typeof IPC_ERROR_CODES]

export function makeError(
  code: string,
  message: string,
  options: { retryable?: boolean; cause?: string } = {},
): WishErrorShape {
  return {
    code,
    message,
    retryable: options.retryable ?? false,
    ...(options.cause !== undefined ? { cause: options.cause } : {}),
  }
}

/**
 * Runtime error class thrown across IPC boundaries (CONVENTIONS § 9).
 *
 * The preload bridge throws `WishError` whenever a wire response fails
 * runtime validation, the protocol-version handshake mismatches, or the
 * main process returns a structured error. Renderer code may either
 * catch on the `code` property or let it bubble to a top-level shell
 * boundary.
 */
export class WishError extends Error implements WishErrorShape {
  readonly code: string
  readonly retryable: boolean
  readonly cause?: string

  constructor(
    code: string,
    message: string,
    options: { retryable?: boolean; cause?: string } = {},
  ) {
    super(message)
    this.name = 'WishError'
    this.code = code
    this.retryable = options.retryable ?? false
    if (options.cause !== undefined) this.cause = options.cause
  }

  toShape(): WishErrorShape {
    return makeError(this.code, this.message, {
      retryable: this.retryable,
      ...(this.cause !== undefined ? { cause: this.cause } : {}),
    })
  }
}

export function isWishError(value: unknown): value is WishError {
  return value instanceof WishError
}

/**
 * Provider-neutral error normalization.
 *
 * Adapters surface canonical `AIError` shapes via `response.error`
 * stream events. This module is the only place where HTTP-status →
 * canonical-code mapping happens; provider files import the helpers
 * here so the codes stay consistent across the suite.
 *
 * Codes (closed set — extend with discipline):
 *   provider.rate_limited           — 429, retryable
 *   provider.auth_failed            — 401 with valid creds, not retryable
 *   provider.auth_required          — no creds at all, not retryable
 *   provider.content_filtered       — provider-side policy violation
 *   provider.network_error          — fetch threw / DNS / TLS, retryable
 *   provider.model_unavailable      — 404 / model not found
 *   provider.context_length_exceeded — 400 with token-budget hint
 *   provider.internal               — 5xx, retryable
 *   provider.cancelled              — AbortSignal fired
 *   provider.unknown                — fallback
 */

import type { AIError } from '../../shared/ai/canonical.js'

export type ProviderErrorCode =
  | 'provider.rate_limited'
  | 'provider.auth_failed'
  | 'provider.auth_required'
  | 'provider.content_filtered'
  | 'provider.network_error'
  | 'provider.model_unavailable'
  | 'provider.context_length_exceeded'
  | 'provider.internal'
  | 'provider.cancelled'
  | 'provider.unknown'

export function makeError(
  code: ProviderErrorCode,
  message: string,
  retryable?: boolean,
): AIError {
  return {
    code,
    message,
    retryable: retryable ?? defaultRetryable(code),
  }
}

function defaultRetryable(code: ProviderErrorCode): boolean {
  switch (code) {
    case 'provider.rate_limited':
    case 'provider.network_error':
    case 'provider.internal':
      return true
    default:
      return false
  }
}

export function classifyHttp(
  status: number,
  rawBody: string,
  providerLabel: string,
): AIError {
  const body = (rawBody || '').slice(0, 400).replace(/\s+/g, ' ').trim()
  const lower = body.toLowerCase()

  if (status === 429) {
    return makeError('provider.rate_limited', `${providerLabel} 429: ${body}`)
  }
  if (status === 401 || status === 403) {
    return makeError('provider.auth_failed', `${providerLabel} ${status}: ${body}`)
  }
  if (status === 404) {
    return makeError('provider.model_unavailable', `${providerLabel} 404: ${body}`)
  }
  if (status === 400) {
    if (
      lower.includes('context') &&
      (lower.includes('length') || lower.includes('window') || lower.includes('token'))
    ) {
      return makeError(
        'provider.context_length_exceeded',
        `${providerLabel} 400 (context length): ${body}`,
      )
    }
    if (lower.includes('content_policy') || lower.includes('content policy') || lower.includes('safety')) {
      return makeError('provider.content_filtered', `${providerLabel} 400: ${body}`)
    }
    return makeError('provider.unknown', `${providerLabel} 400: ${body}`)
  }
  if (status >= 500) {
    return makeError('provider.internal', `${providerLabel} ${status}: ${body}`)
  }
  return makeError('provider.unknown', `${providerLabel} ${status}: ${body}`)
}

/**
 * Rough pattern match on a thrown fetch/AbortError. Adapters call this
 * inside their stream loop's catch.
 */
export function classifyThrown(err: unknown, providerLabel: string): AIError {
  if (err instanceof Error) {
    const name = err.name
    if (name === 'AbortError' || /aborted/i.test(err.message)) {
      return makeError('provider.cancelled', `${providerLabel}: cancelled`)
    }
    if (/fetch failed|network|ENOTFOUND|ECONNREFUSED|ETIMEDOUT/i.test(err.message)) {
      return makeError('provider.network_error', `${providerLabel}: ${err.message}`)
    }
    return makeError('provider.unknown', `${providerLabel}: ${err.message}`)
  }
  return makeError('provider.unknown', `${providerLabel}: ${String(err)}`)
}

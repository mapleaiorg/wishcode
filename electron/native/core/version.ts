/**
 * Version + Claude Code attribution constants.
 *
 * The Anthropic backend routes OAuth traffic to the Pro/Max subscription
 * quota pool by checking THREE signals in the outbound request:
 *
 *   1. HTTP header  `anthropic-beta: oauth-2025-04-20,claude-code-20250219,...`
 *   2. System block `x-anthropic-billing-header: cc_version=<V>; cc_entrypoint=cli; cch=<H>;`
 *   3. HTTP header  `user-agent: claude-cli/<V> (external, cli)`
 *
 * The `cch=` field is a 3-hex-char SHA-256 hash computed per-conversation
 * from the first user message content + a fixed salt + the version string.
 * It is NOT optional — without it (or with the static placeholder `cch=00000`)
 * the backend demotes OAuth to the "extra usage" over-limit pool which
 * returns 400 `invalid_request_error: "You're out of extra usage"` whenever
 * the subscription's extra allowance is spent.
 *
 * The real hash computation is exported as `computeCch(firstUserText)`.
 * The billing attribution template is exported as a function
 * `buildBillingAttribution(firstUserText)`.
 *
 * Reference implementation: @anthropic-ai/claude-agent-sdk cli.js
 *   function yY8(A,q)  — hashes chars [4,7,20] of first user message
 *   const cV5 = "59cf53e54c78"  — fixed salt
 */

import { createHash } from 'crypto'

export const WISH_VERSION = '0.1.0'

/** Legacy alias; older modules import `IBANK_VERSION`. */
export const IBANK_VERSION = WISH_VERSION

/**
 * Claude Code CLI version we report. Must match an active release so
 * the backend recognises the attribution as a current Claude Code session
 * and routes to the main subscription pool (not the "extra usage" bucket).
 *
 * Sourced from @anthropic-ai/claude-agent-sdk (which embeds Claude Code):
 *   grep '"VERSION"' cli.js → "2.1.74"   (build 2026-03-12)
 */
export const CLAUDE_CLI_VERSION = '2.1.74'

/** User-Agent sent on every Anthropic request. */
export const CLAUDE_CLI_USER_AGENT = `claude-cli/${CLAUDE_CLI_VERSION} (external, cli)`

/**
 * Fixed salt used in the cch= hash, sourced from the real CLI source:
 *   const cV5 = "59cf53e54c78"
 */
const CCH_SALT = '59cf53e54c78'

/**
 * Compute the per-conversation `cch=` attestation token.
 *
 * The real Claude Code CLI picks characters at positions [4, 7, 20] from
 * the first user message text, joins them with "0" fallback, prepends the
 * fixed salt, appends the version string, SHA-256-hashes the result, and
 * returns the first 3 hex chars.
 *
 * @param firstUserText - the text content of the very first user turn
 *                        (empty string if no turns yet)
 */
export function computeCch(firstUserText: string): string {
  const chars = [4, 7, 20].map((i) => firstUserText[i] ?? '0').join('')
  const payload = `${CCH_SALT}${chars}${CLAUDE_CLI_VERSION}`
  return createHash('sha256').update(payload).digest('hex').slice(0, 3)
}

/**
 * Build the full billing-attribution string for a specific conversation.
 *
 * Format (matching @anthropic-ai/claude-agent-sdk exactly):
 *   x-anthropic-billing-header: cc_version=V; cc_entrypoint=cli; cch=H;
 *
 * @param firstUserText - first user message content (needed for cch=)
 */
export function buildBillingAttribution(firstUserText: string): string {
  const cch = computeCch(firstUserText)
  return `x-anthropic-billing-header: cc_version=${CLAUDE_CLI_VERSION}; cc_entrypoint=cli; cch=${cch};`
}

/**
 * Static fallback for callers that don't have the first user message handy.
 * Uses the empty-string hash (positions [4,7,20] → all "0").
 * This produces a valid cch= value, just not conversation-specific.
 */
export const CLAUDE_BILLING_ATTRIBUTION = buildBillingAttribution('')

/**
 * Required first sentence of the system prompt on every OAuth request.
 * Must appear verbatim as the first text block after the billing block.
 */
export const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude."

/**
 * anthropic-beta header for OAuth requests.
 *   • oauth-2025-04-20              — required for OAuth Bearer tokens
 *   • claude-code-20250219          — routes as a Claude-Code session
 *   • interleaved-thinking-2025-05-14 — extended thinking on Sonnet 4+
 */
export const OAUTH_BETA_HEADER =
  'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14'

/** Standard Anthropic API version header. */
export const ANTHROPIC_API_VERSION = '2023-06-01'

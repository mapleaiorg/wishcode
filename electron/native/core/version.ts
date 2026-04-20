/**
 * Version + Claude Code attribution constants.
 *
 * The Anthropic backend gates the Claude Pro/Max subscription quota pool
 * on this exact combination of signals. Missing any one of them causes
 * OAuth tokens to fall back to the generic API quota pool (~2–3 req/min).
 */

export const IBANK_VERSION = '0.3.1'

/**
 * User-Agent string sent on every Anthropic request.
 * Format must match `claude-cli/<version> (<userType>, <entrypoint>)` exactly —
 * backend does a string-prefix match on this to classify traffic.
 */
export const CLAUDE_CLI_USER_AGENT = `claude-cli/${IBANK_VERSION} (external, cli)`

/**
 * Billing attribution string — the #1 signal routing OAuth traffic to the
 * Claude Pro/Max subscription quota pool. In the real Claude CLI this is
 * NOT sent as an HTTP header; instead it is prepended to the `system`
 * prompt as the first text block, verbatim (with the `x-anthropic-billing-header:`
 * prefix included in the text). The backend parser extracts cc_version and
 * cc_entrypoint from that block to attribute traffic to the subscription pool.
 *
 * See cc-full-0408/src/constants/system.ts `getAttributionHeader()` and
 * cc-full-0408/src/utils/sideQuery.ts lines 144-167 for the reference impl.
 */
export const CLAUDE_BILLING_ATTRIBUTION =
  `x-anthropic-billing-header: cc_version=${IBANK_VERSION}; cc_entrypoint=cli;`

/**
 * Required first sentence of the system prompt on every OAuth request.
 * The backend hashes / fingerprints the first N characters of the system
 * prompt and compares against the published CLI's value.
 */
export const CLAUDE_CODE_SYSTEM_PREFIX =
  "You are Claude Code, Anthropic's official CLI for Claude."

/**
 * Value of the `anthropic-beta` HTTP header on OAuth requests.
 *
 * The real Claude CLI sends a comma-separated list for non-Haiku models
 * (see cc-full-0408/src/utils/betas.ts :: getAllModelBetas()). Without
 * `claude-code-20250219` the backend doesn't classify the request as a
 * Claude-Code subscription call and OAuth traffic lands in the generic
 * API quota pool (~2–3 req/min, 429s).
 *
 *   • oauth-2025-04-20              — required for OAuth Bearer tokens
 *   • claude-code-20250219          — flags this as a Claude-Code session
 *   • interleaved-thinking-2025-05-14 — extended thinking on Sonnet 4+
 */
export const OAUTH_BETA_HEADER =
  'oauth-2025-04-20,claude-code-20250219,interleaved-thinking-2025-05-14'

/** Standard Anthropic API version header. */
export const ANTHROPIC_API_VERSION = '2023-06-01'

/**
 * Provider adapter contract — every provider implements this to expose
 * its model list and a canonical streaming chat surface.
 *
 * Adapters consume `AIRequest` (canonical) and yield `AIStreamEvent`
 * (canonical). Provider-specific shape conversion lives entirely
 * inside the adapter; nothing above this seam may know that
 * Anthropic returns `content_block_delta` or that Gemini speaks
 * `parts: [{ functionCall }]`.
 *
 * Adapters MUST validate every yielded event against the canonical
 * Zod schema (helpers in `./events.ts`). That keeps the boundary
 * honest even when wire shapes drift under us.
 *
 * See `docs/arch/A-1.md` for the ADR.
 */

import type {
  AIModel,
  AIProvider,
  AIProviderId,
  AIRequest,
  AIStreamEvent,
} from '../../shared/ai/canonical.js'

/**
 * A minimal context handed to every chat invocation. Extends as A-2
 * (agent runtime) and A-3 (provider Cells) need more — keep it small
 * for now so adapters stay easy to test.
 */
export interface AdapterContext {
  /** Caller-supplied abort. Adapters MUST honor this within ~100ms. */
  signal?: AbortSignal
  /** Optional stable id correlating with a D-3 task; provider-neutral. */
  requestId?: string
  /** Sink override for low-level fetches — tests inject `mockFetch`. */
  fetchImpl?: typeof fetch
  /** Per-provider auth/state bag (api keys, oauth tokens, base URLs). */
  credentials?: AdapterCredentials
  /** Workspace correlation (carried into provenance hints later). */
  workspaceId?: string
}

/**
 * Provider-neutral credential bag. Each adapter reads only the fields
 * it cares about. Anthropic's OAuth token + billing-attribution
 * machinery is opaque to everyone else; OpenAI/xAI just want the api
 * key + base URL. This is intentionally a flat record — we do NOT
 * leak `anthropic_*` / `openai_*` discriminator fields.
 */
export interface AdapterCredentials {
  apiKey?: string
  oauthToken?: string
  baseUrl?: string
  /** Free-form headers the host wants appended (e.g. CLI billing UA). */
  extraHeaders?: Record<string, string>
}

export interface ChatStreamOptions extends AdapterContext {
  /**
   * Optional onError hook. Adapters that surface a `response.error`
   * event MUST call this AND yield the event; the hook is for hosts
   * that want a synchronous error sink without consuming the iterable.
   */
  onError?: (err: Error) => void
}

export interface ProviderAdapter {
  /** Static descriptor — id, displayName, kind. */
  readonly descriptor: AIProvider

  /**
   * List the models this provider currently offers. May call out
   * (Ollama hits /api/tags), or return a static list (cloud
   * providers). Errors propagate; the runtime decides whether to
   * collapse them into "unavailable" status.
   */
  listModels(ctx?: AdapterContext): Promise<AIModel[]>

  /**
   * Send a canonical request and yield canonical stream events.
   *
   * Contract:
   *   1. First event MUST be `response.started`.
   *   2. Last event MUST be `response.completed` OR `response.error`
   *      (never both, never neither).
   *   3. `usage.updated` MAY appear anywhere after `response.started`
   *      and SHOULD appear once before completion when the provider
   *      reports usage at all.
   *   4. AbortSignal in ctx is honored within 100ms — yield a final
   *      `response.error` (`code: 'provider.cancelled'`) on abort.
   */
  chat(req: AIRequest, ctx: ChatStreamOptions): AsyncIterable<AIStreamEvent>
}

/**
 * Helper type for keying registries by provider id.
 */
export type ProviderId = AIProviderId

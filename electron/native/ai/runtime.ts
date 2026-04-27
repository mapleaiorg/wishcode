/**
 * `ProviderRuntime` — the entry point that the agent runtime (A-2),
 * the IPC chat handler (D-2), and any other consumer above the
 * provider seam uses.
 *
 * The runtime is a thin coordinator over a `ProviderRegistry`. It
 *   - dispatches `chat()` to the right adapter (by `req.model.providerId`),
 *   - aggregates `models()` across registered providers,
 *   - normalises every yielded event through the canonical Zod
 *     schema so adapters can't accidentally leak provider shape.
 *
 * See `docs/arch/A-1.md`.
 */

import type { AIModel, AIRequest, AIStreamEvent } from '../../shared/ai/canonical.js'
import { AIStreamEventSchema } from '../../shared/ai/zod.js'
import type { ChatStreamOptions, ProviderAdapter } from './adapter.js'
import { ProviderRegistry } from './registry.js'

export class ProviderRuntime {
  constructor(public readonly registry: ProviderRegistry = new ProviderRegistry()) {}

  /** Convenience pass-through. */
  register(adapter: ProviderAdapter): void {
    this.registry.register(adapter)
  }

  /** Aggregate model lists across all registered providers. */
  async models(): Promise<AIModel[]> {
    const out: AIModel[] = []
    for (const id of this.registry.ids()) {
      const adapter = this.registry.require(id)
      try {
        const list = await adapter.listModels()
        out.push(...list)
      } catch {
        // Skip unavailable providers; the UI surfaces "unavailable"
        // separately via `wish:auth:status` / `wish:model:list`.
      }
    }
    return out
  }

  /**
   * Stream a chat. Resolves the adapter by `req.model.providerId`,
   * delegates, and validates each event through the canonical Zod
   * schema. Invalid events surface as a `response.error` with
   * `code: 'provider.protocol_violation'` — the rest of the upstream
   * pipeline never sees a malformed event.
   */
  async *chat(req: AIRequest, ctx: ChatStreamOptions = {}): AsyncIterable<AIStreamEvent> {
    const adapter = this.registry.require(req.model.providerId)
    for await (const ev of adapter.chat(req, ctx)) {
      const parsed = AIStreamEventSchema.safeParse(ev)
      if (!parsed.success) {
        yield {
          kind: 'response.error',
          error: {
            code: 'provider.protocol_violation',
            message: `adapter "${adapter.descriptor.id}" yielded an invalid event: ${parsed.error.message}`,
            retryable: false,
          },
        }
        return
      }
      yield parsed.data as AIStreamEvent
    }
  }
}

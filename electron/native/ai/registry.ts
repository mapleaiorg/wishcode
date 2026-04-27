/**
 * In-memory registry of provider adapters keyed by `AIProviderId`.
 *
 * The runtime queries this to dispatch chat / models. Cell-2 (later)
 * will replace this with a Cell-discovery host; A-1 ships a static
 * registry that the host (electron main) wires up at boot.
 */

import type { AIProvider, AIProviderId } from '../../shared/ai/canonical.js'
import type { ProviderAdapter } from './adapter.js'

export class ProviderRegistry {
  private readonly byId = new Map<AIProviderId, ProviderAdapter>()

  register(adapter: ProviderAdapter): void {
    const id = adapter.descriptor.id
    if (!id) throw new Error('ProviderRegistry: adapter descriptor.id is empty')
    if (this.byId.has(id)) {
      throw new Error(`ProviderRegistry: duplicate registration for "${id}"`)
    }
    this.byId.set(id, adapter)
  }

  unregister(id: AIProviderId): void {
    this.byId.delete(id)
  }

  has(id: AIProviderId): boolean {
    return this.byId.has(id)
  }

  get(id: AIProviderId): ProviderAdapter | undefined {
    return this.byId.get(id)
  }

  /**
   * Throwing variant — used by the runtime where "unknown provider"
   * is a programmer error, not an end-user condition.
   */
  require(id: AIProviderId): ProviderAdapter {
    const a = this.byId.get(id)
    if (!a) {
      throw new Error(
        `ProviderRegistry: no adapter registered for provider "${id}". ` +
          `Registered: [${[...this.byId.keys()].join(', ') || '<none>'}]`,
      )
    }
    return a
  }

  list(): AIProvider[] {
    return [...this.byId.values()].map(a => a.descriptor)
  }

  ids(): AIProviderId[] {
    return [...this.byId.keys()]
  }
}

/**
 * A-2 — A simple in-memory tool dispatcher.
 *
 * Hosts register `(name → handler)` pairs at boot. Tools are called by
 * the agent loop via `invoke()`. D-4 / Cell-3 will provide richer
 * dispatchers that respect capability gates and Cell isolation; this
 * implementation is the minimal surface every later dispatcher must
 * still satisfy.
 */

import type { AIToolDefinition, AIToolInvocation } from '../../shared/ai/canonical.js'
import type { ToolDispatcher } from './types.js'

export type ToolHandler = (
  input: unknown,
  ctx: { invocationId: string; signal?: AbortSignal },
) => Promise<unknown>

export interface ToolRegistration {
  definition: AIToolDefinition
  handler: ToolHandler
}

export class InMemoryToolDispatcher implements ToolDispatcher {
  private readonly byName = new Map<string, ToolRegistration>()

  register(reg: ToolRegistration): void {
    if (this.byName.has(reg.definition.name)) {
      throw new Error(`InMemoryToolDispatcher: duplicate "${reg.definition.name}"`)
    }
    this.byName.set(reg.definition.name, reg)
  }

  unregister(name: string): void {
    this.byName.delete(name)
  }

  has(name: string): boolean {
    return this.byName.has(name)
  }

  definitions(): AIToolDefinition[] {
    return [...this.byName.values()].map(r => r.definition)
  }

  async invoke(invocation: AIToolInvocation, signal?: AbortSignal): Promise<unknown> {
    const reg = this.byName.get(invocation.name)
    if (!reg) {
      throw new Error(`unknown tool: "${invocation.name}"`)
    }
    return reg.handler(invocation.input, { invocationId: invocation.id, signal })
  }
}

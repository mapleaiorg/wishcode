/**
 * Stream-event helpers — small constructors for building canonical
 * `AIStreamEvent` values, plus boundary validation against the Zod
 * schema. Keeping these in one place lets adapters stay terse.
 *
 * Validation policy: adapters call `validateEvent` on every event
 * they yield in DEBUG mode. In production we trust the constructor
 * functions — they only build well-formed shapes — but the test
 * suite still pipes every fixture through `validateEvent`.
 */

import type {
  AIContentBlock,
  AIError,
  AIStreamEvent,
  AIToolInvocation,
  AIUsage,
} from '../../shared/ai/canonical.js'
import { AIStreamEventSchema } from '../../shared/ai/zod.js'

export function evResponseStarted(responseId: string): AIStreamEvent {
  return { kind: 'response.started', responseId }
}

export function evResponseCompleted(responseId: string): AIStreamEvent {
  return { kind: 'response.completed', responseId }
}

export function evResponseError(error: AIError): AIStreamEvent {
  return { kind: 'response.error', error }
}

export function evContentDelta(
  blockIndex: number,
  delta: Partial<AIContentBlock>,
): AIStreamEvent {
  return { kind: 'content.delta', blockIndex, delta }
}

export function evContentCompleted(
  blockIndex: number,
  block: AIContentBlock,
): AIStreamEvent {
  return { kind: 'content.completed', blockIndex, block }
}

export function evToolStarted(invocation: AIToolInvocation): AIStreamEvent {
  return { kind: 'tool_call.started', invocation }
}

export function evToolDelta(invocationId: string, inputDelta: unknown): AIStreamEvent {
  return { kind: 'tool_call.delta', invocationId, inputDelta }
}

export function evToolCompleted(invocation: AIToolInvocation): AIStreamEvent {
  return { kind: 'tool_call.completed', invocation }
}

export function evUsage(usage: AIUsage): AIStreamEvent {
  return { kind: 'usage.updated', usage }
}

/**
 * Validate at the canonical-Zod boundary. Throws on shape mismatch.
 * Adapters use this in tests + when running with `WISH_AI_VALIDATE=1`
 * to catch shape drift early without paying the runtime cost in prod.
 */
export function validateEvent(ev: unknown): AIStreamEvent {
  const r = AIStreamEventSchema.safeParse(ev)
  if (!r.success) {
    throw new Error(
      `validateEvent: canonical schema mismatch — ${r.error.message}`,
    )
  }
  return ev as AIStreamEvent
}

/**
 * Per-call usage accumulator. Cloud providers surface usage in
 * different shapes (Anthropic: input/output across two events;
 * OpenAI: prompt/completion in the trailing chunk; Gemini:
 * usageMetadata; Ollama: prompt_eval_count/eval_count). Adapters feed
 * raw values in; we coalesce and emit a single canonical
 * `usage.updated` per call (or none, if the provider didn't report).
 */
export class UsageAccumulator {
  private input?: number
  private output?: number
  private cached?: number
  private reasoning?: number

  recordInput(n?: number) {
    if (typeof n === 'number') this.input = n
  }

  recordOutput(n?: number) {
    if (typeof n === 'number') this.output = n
  }

  recordCached(n?: number) {
    if (typeof n === 'number') this.cached = n
  }

  recordReasoning(n?: number) {
    if (typeof n === 'number') this.reasoning = n
  }

  snapshot(): AIUsage | undefined {
    if (this.input == null && this.output == null) return undefined
    const usage: AIUsage = {
      inputTokens: this.input ?? 0,
      outputTokens: this.output ?? 0,
    }
    if (this.cached != null) usage.cachedInputTokens = this.cached
    if (this.reasoning != null) usage.reasoningTokens = this.reasoning
    return usage
  }
}

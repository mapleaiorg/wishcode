/**
 * `echo` — a minimal in-memory provider used by tests and by anyone
 * who wants to exercise the runtime without an external dependency.
 *
 * Echoes the last user message back as a single text content block,
 * yielding the canonical 5-event sequence (started → content.delta
 * → content.completed → usage.updated → completed).
 *
 * Real providers (anthropic / openai / xai / gemini / ollama / hermon)
 * land in A-3 as Cells; this stub keeps the runtime testable today.
 */

import type {
  AIContentBlock,
  AIMessage,
  AIModel,
  AIProvider,
  AIRequest,
  AIStreamEvent,
} from '../../../shared/ai/canonical.js'
import type { ChatStreamOptions, ProviderAdapter } from '../adapter.js'

const PROVIDER: AIProvider = {
  id: 'echo',
  displayName: 'Echo (test provider)',
  kind: 'first-party',
}

const MODEL: AIModel = {
  id: 'echo-1',
  providerId: 'echo',
  displayName: 'Echo 1.0',
  capabilities: {
    streaming: true,
    tools: false,
    structuredOutput: false,
    imageInput: false,
    audioInput: false,
    fileInput: false,
    reasoning: false,
  },
  contextWindow: 8_192,
  maxOutputTokens: 8_192,
}

function lastUserText(messages: AIMessage[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i]
    if (m.role !== 'user') continue
    const text = m.blocks
      .map((b: AIContentBlock) => (b.kind === 'text' ? b.text : ''))
      .filter(Boolean)
      .join('\n')
    if (text.length > 0) return text
  }
  return ''
}

export class EchoAdapter implements ProviderAdapter {
  readonly descriptor = PROVIDER

  async listModels(): Promise<AIModel[]> {
    return [MODEL]
  }

  async *chat(req: AIRequest, ctx: ChatStreamOptions = {}): AsyncIterable<AIStreamEvent> {
    const responseId = `echo_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
    yield { kind: 'response.started', responseId }

    if (ctx.signal?.aborted) {
      yield {
        kind: 'response.error',
        error: { code: 'provider.cancelled', message: 'aborted before send', retryable: false },
      }
      return
    }

    const text = lastUserText(req.messages) || '(empty)'

    yield { kind: 'content.delta', blockIndex: 0, delta: { kind: 'text', text } }
    yield {
      kind: 'content.completed',
      blockIndex: 0,
      block: { kind: 'text', text },
    }
    yield {
      kind: 'usage.updated',
      usage: { inputTokens: text.length, outputTokens: text.length },
    }
    yield { kind: 'response.completed', responseId }
  }
}

/**
 * A-2 — Agent runtime turn loop.
 *
 * Drives a chat against a `ProviderRuntime` (A-1) and dispatches any
 * tool calls back to a `ToolDispatcher`, looping until the model
 * yields a `response.completed` without further tool calls, hits the
 * max-turn cap, or the caller aborts.
 *
 * Design notes:
 *   - Stays at the canonical-event seam — never reaches into provider
 *     payload shapes. A-1's `ProviderRuntime.chat()` is the only
 *     producer of `AIStreamEvent`; this runtime is the only consumer.
 *   - Tool errors are first-class: a thrown handler becomes an
 *     `AIContentBlock{kind:'tool_result', isError:true}` block.
 *   - The runtime emits live events via `onEvent` so the UI can
 *     stream deltas during a multi-turn run; the final `AgentRunResult`
 *     captures the assembled message list for persistence.
 */

import type {
  AIContentBlock,
  AIMessage,
  AIStreamEvent,
  AIToolInvocation,
} from '../../shared/ai/canonical.js'
import type { ProviderRuntime } from '../ai/index.js'
import type { AgentRequest, AgentRunOptions, AgentRunResult, AgentStopReason } from './types.js'

const DEFAULT_MAX_TURNS = 8

export class AgentRuntime {
  constructor(public readonly provider: ProviderRuntime) {}

  async run(req: AgentRequest, opts: AgentRunOptions = {}): Promise<AgentRunResult> {
    const maxTurns = opts.maxTurns ?? DEFAULT_MAX_TURNS
    const messages: AIMessage[] = [...req.messages]
    let stopReason: AgentStopReason = 'completed'
    let lastError: { code: string; message: string } | undefined
    let turns = 0

    while (turns < maxTurns) {
      if (opts.signal?.aborted) {
        stopReason = 'cancelled'
        break
      }
      turns++

      const turn = await this.runOneTurn(req, messages, opts)
      messages.push(turn.assistantMessage)

      if (turn.terminal) {
        stopReason = turn.stopReason ?? 'completed'
        lastError = turn.error
        break
      }

      if (turn.toolCalls.length === 0) {
        // No tool calls and not terminal — model said "done" without
        // saying so explicitly. Treat as completed to avoid loop spin.
        stopReason = 'completed'
        break
      }

      const toolBlocks: AIContentBlock[] = []
      for (const inv of turn.toolCalls) {
        if (opts.signal?.aborted) {
          stopReason = 'cancelled'
          return { messages, stopReason, turns, error: lastError }
        }
        if (!opts.tools) {
          toolBlocks.push({
            kind: 'tool_result',
            toolUseId: inv.id,
            output: { error: 'no tool dispatcher available' },
            isError: true,
          })
          stopReason = 'unsupported_tool'
          continue
        }
        try {
          const out = await opts.tools.invoke(inv, opts.signal)
          toolBlocks.push({
            kind: 'tool_result',
            toolUseId: inv.id,
            output: out,
            isError: false,
          })
        } catch (e) {
          toolBlocks.push({
            kind: 'tool_result',
            toolUseId: inv.id,
            output: { error: e instanceof Error ? e.message : String(e) },
            isError: true,
          })
        }
      }

      messages.push({
        id: `m_${Date.now()}_${turns}`,
        role: 'tool',
        blocks: toolBlocks,
        createdAt: new Date().toISOString(),
      })

      if (stopReason === 'unsupported_tool') {
        break
      }
    }

    if (turns >= maxTurns && stopReason === 'completed') {
      stopReason = 'max_turns'
    }

    return { messages, stopReason, turns, error: lastError }
  }

  private async runOneTurn(
    req: AgentRequest,
    history: AIMessage[],
    opts: AgentRunOptions,
  ): Promise<{
    assistantMessage: AIMessage
    toolCalls: AIToolInvocation[]
    terminal: boolean
    stopReason?: AgentStopReason
    error?: { code: string; message: string }
  }> {
    const blocks: AIContentBlock[] = []
    const toolCalls: AIToolInvocation[] = []
    let terminal = false
    let stopReason: AgentStopReason | undefined
    let error: { code: string; message: string } | undefined

    const stream = this.provider.chat(
      {
        sessionId: req.sessionId,
        model: req.model,
        messages: history,
        tools: opts.tools?.definitions(),
        parameters: req.parameters,
        metadata: req.metadata,
      },
      { signal: opts.signal },
    )

    for await (const ev of stream) {
      opts.onEvent?.(ev)
      switch (ev.kind) {
        case 'content.completed':
          blocks.push(ev.block)
          break
        case 'tool_call.completed':
          toolCalls.push(ev.invocation)
          blocks.push({
            kind: 'tool_use',
            id: ev.invocation.id,
            name: ev.invocation.name,
            input: ev.invocation.input,
          })
          break
        case 'response.error':
          terminal = true
          stopReason = 'error'
          error = { code: ev.error.code, message: ev.error.message }
          break
        case 'response.completed':
          // Provider says response is done. If there are no tool calls
          // we're terminal; otherwise we let the outer loop decide.
          if (toolCalls.length === 0) terminal = true
          break
        default:
          break
      }
    }

    const assistantMessage: AIMessage = {
      id: `m_${Date.now()}_t`,
      role: 'assistant',
      blocks,
      createdAt: new Date().toISOString(),
    }
    return { assistantMessage, toolCalls, terminal, stopReason, error }
  }
}

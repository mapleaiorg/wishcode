/**
 * A-2 — Agent runtime contract types.
 *
 * The agent runtime sits above A-1 (`ProviderRuntime`) and below the
 * IPC chat handler (D-2, future). It owns the turn loop: send a
 * request, consume canonical stream events, dispatch tool calls,
 * append results to the message list, loop until the model says
 * we're done or a stop condition fires.
 *
 * Tool implementations are provider-NEUTRAL — they consume the
 * canonical `AIToolUse` payload and return a JSON value (which the
 * runtime wraps into an `AIContentBlock{kind:'tool_result'}`). This
 * is deliberately a tiny seam so D-4 (skills + tool dispatcher) and
 * Cell-3 (Cell SDK) can supply tools without touching the loop.
 */

import type {
  AIMessage,
  AIRequest,
  AIStreamEvent,
  AIToolDefinition,
  AIToolInvocation,
} from '../../shared/ai/canonical.js'

export interface ToolDispatcher {
  /** Tools the model is allowed to invoke this turn. */
  definitions(): AIToolDefinition[]

  /**
   * Execute a tool by name. Throwing yields a `tool_result` with
   * `isError: true`; returning the value yields a normal result.
   */
  invoke(invocation: AIToolInvocation, signal?: AbortSignal): Promise<unknown>
}

export interface AgentRunOptions {
  /** Max number of model<->tool turns. Default 8. */
  maxTurns?: number
  /** Caller-supplied abort. Honored within the turn boundary. */
  signal?: AbortSignal
  /** Tool dispatcher; omit if the agent should not use tools. */
  tools?: ToolDispatcher
  /**
   * Optional sink for every yielded canonical event before the
   * runtime applies its own logic. Hosts use this to surface live
   * deltas to the UI.
   */
  onEvent?: (event: AIStreamEvent) => void
}

/** Stop reason at the end of a run. */
export type AgentStopReason =
  | 'completed'
  | 'max_turns'
  | 'cancelled'
  | 'error'
  | 'unsupported_tool'

export interface AgentRunResult {
  /** Final assembled message list (model + tool blocks appended). */
  messages: AIMessage[]
  /** Why the loop ended. */
  stopReason: AgentStopReason
  /** Total turns the loop executed. */
  turns: number
  /** Last error event observed, if any. */
  error?: { code: string; message: string }
}

export type AgentRequest = Omit<AIRequest, 'messages'> & {
  messages: AIMessage[]
}

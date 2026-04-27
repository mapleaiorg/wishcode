/**
 * Public barrel for the agent runtime (A-2). Consumers above this
 * seam (the IPC chat handler, the swarm runner) import only from
 * here.
 */

export type {
  AgentRequest,
  AgentRunOptions,
  AgentRunResult,
  AgentStopReason,
  ToolDispatcher,
} from './types.js'

export { InMemoryToolDispatcher, type ToolHandler, type ToolRegistration } from './tools.js'
export { AgentRuntime } from './runtime.js'

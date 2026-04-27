/**
 * Public barrel for the multi-scope memory store (Mem-0).
 *
 * Mem-1 (context assembly) and Mem-2 (per-surface adapters) consume
 * this barrel; D-2 wires the IPC handlers; future Cells reach the
 * store through the SDK's memory facade.
 */

export type {
  MemoryBindings,
  MemoryEntry,
  MemoryProvenance,
  MemoryQuery,
  MemoryScope,
  MemoryStore,
  NewMemoryEntry,
} from './types.js'
export { MEMORY_SCOPES } from './types.js'

export { InMemoryMemoryStore } from './in-memory-store.js'
export {
  assembleContext,
  rankCandidates,
  renderEntry,
  type AssembleRequest,
  type AssembledContext,
  type AssembledEntry,
} from './context.js'

export {
  assembleAgentContext,
  assembleChatContext,
  assembleCodeContext,
  type AgentAdapterOptions,
  type ChatAdapterOptions,
  type CodeAdapterOptions,
} from './adapters.js'

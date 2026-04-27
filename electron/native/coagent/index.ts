/**
 * Public barrel for the CoAgent family (C-0).
 */

export type {
  CoAgentBusOptions,
  CoAgentEvent,
  CoAgentEventKind,
  CoAgentMember,
  CoAgentRole,
  CoAgentSubscriber,
  JoinResult,
} from './types.js'
export { COAGENT_FAMILY_ID } from './types.js'

export { CoAgentBus, CoAgentCore } from './bus.js'

export { CoAgentTaskRuntime, type TaskRuntimeOptions } from './task-runtime.js'

/**
 * Public barrel for the T-0 Task vs Job model.
 *
 * D-3 (task supervisor) and T-1 (job graph orchestrator) consume this
 * barrel. The legacy `electron/native/tasks/manager.ts` will become a
 * thin adapter on top of this store once D-3 lands.
 */

export type {
  Job,
  JobKind,
  JobStatus,
  NewJobInput,
  NewTaskInput,
  Task,
  TaskBindings,
  TaskFilter,
  TaskOrigin,
  TaskStatus,
  TaskStore,
} from './types.js'
export {
  TERMINAL_JOB_STATUSES,
  TERMINAL_TASK_STATUSES,
  isTerminalJob,
  isTerminalTask,
} from './types.js'

export { InMemoryTaskStore } from './in-memory-store.js'
export {
  JobOrchestrator,
  RunnerRegistry,
  type JobRunResult,
  type JobRunner,
  type OrchestratorOptions,
  type TickResult,
} from './orchestrator.js'

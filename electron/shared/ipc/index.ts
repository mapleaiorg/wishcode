/**
 * Wish Code IPC — public barrel.
 *
 * Re-exports the Result envelope, error shape, channel helpers, version
 * constants, every domain schema, and the {@link IPC_REGISTRY} that maps
 * channel id → request/response schema pair (used by the preload bridge
 * for runtime validation and by tests for coverage).
 */

export * from './error'
export * from './result'
export * from './version'
export * from './channel'
export * from './types/common'

export * as AppSchemas from './schemas/app'
export * as AskUserSchemas from './schemas/askUser'
export * as AuthSchemas from './schemas/auth'
export * as BuddySchemas from './schemas/buddy'
export * as ChatSchemas from './schemas/chat'
export * as CommandsSchemas from './schemas/commands'
export * as ConfigSchemas from './schemas/config'
export * as CronSchemas from './schemas/cron'
export * as HooksSchemas from './schemas/hooks'
export * as McpSchemas from './schemas/mcp'
export * as MemorySchemas from './schemas/memory'
export * as ModelSchemas from './schemas/model'
export * as ProtoSchemas from './schemas/proto'
export * as SessionSchemas from './schemas/session'
export * as SkillsSchemas from './schemas/skills'
export * as SwarmSchemas from './schemas/swarm'
export * as TasksSchemas from './schemas/tasks'
export * as TodosSchemas from './schemas/todos'
export * as ToolsSchemas from './schemas/tools'
export * as WorkspaceSchemas from './schemas/workspace'

export {
  IPC_REGISTRY,
  registryChannels,
  getChannelEntry,
  type IpcChannelId,
  type IpcRegistryEntry,
} from './registry'

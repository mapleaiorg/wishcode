/**
 * Barrel export for the native subsystem.
 *
 * Every subsystem is re-exported here so the IPC layer (electron/main.ts)
 * can do one import: `import * as Native from './native'`.
 *
 * Import side-effects: loading this file registers the default tools and
 * starts the buddy subscriber. It does NOT do any network or disk I/O at
 * load time beyond reading the config cache.
 */

export * as Version from './core/version.js'
export * as Config from './core/config.js'
export * as Logger from './core/logger.js'
export * as Events from './core/events.js'

export * as Auth from './auth/auth.js'
export * as OAuth from './auth/oauth.js'

export * as Chat from './llm/chat.js'
export * as Model from './llm/model.js'

export * as Memory from './memory/memdir.js'

export * as Skills from './skills/registry.js'

export * as Commands from './commands/registry.js'

export * as Tools from './tools/registry.js'

export * as Session from './session/transcript.js'

export * as ModelFetch from './modelFetch/modelFetch.js'
// Alias — existing call sites use `Native.Query.run(...)`.
export * as Query from './modelFetch/modelFetch.js'

export * as Buddy from './buddy/state.js'

export * as Tasks from './tasks/manager.js'

export * as Swarm from './swarm/swarm.js'

export * as Mcp from './mcp/manager.js'
export * as Cron from './cron/scheduler.js'
export * as Hooks from './hooks/runner.js'

// Eager-start buddy so the renderer gets updates even if no code has
// explicitly imported it.
import { startBuddy } from './buddy/state.js'
startBuddy()

// Eager-load tools so they're registered by the time the first chat runs.
import './tools/registry.js'

// Start the cron scheduler so scheduled prompts fire without a session.
import { startScheduler } from './cron/scheduler.js'
startScheduler()

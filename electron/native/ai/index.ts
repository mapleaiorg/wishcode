/**
 * Public barrel for the wishcode provider runtime (A-1).
 *
 * Consumers above the provider seam (agent runtime A-2, IPC chat
 * handler D-2, future Cells) import only from this barrel.
 */

export type {
  AdapterContext,
  AdapterCredentials,
  ChatStreamOptions,
  ProviderAdapter,
  ProviderId,
} from './adapter.js'

export { ProviderRegistry } from './registry.js'
export { ProviderRuntime } from './runtime.js'

export { EchoAdapter } from './providers/echo.js'

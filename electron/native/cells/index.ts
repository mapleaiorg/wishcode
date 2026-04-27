/**
 * Public barrel for the Cell-0 manifest layer.
 *
 * Cell-1 (registry), Cell-2 (runtime), Cell-3 (SDK), Cell-6 (trust),
 * Cell-7 (sync), Cell-8 (forge), and any host-side consumer (Settings
 * UI, IPC handler) import from this barrel only.
 */

export type { CellClass, CellManifest, ParseError, ParsedManifest, TrustTier } from './manifest.js'
export {
  CellManifestSchema,
  RESERVED_SHELL_SLOT_IDS,
  manifestDeclaresCapability,
  parseManifest,
  slotContributionsFor,
} from './manifest.js'

export type {
  CellRegistry,
  DependencyResolution,
  NewRegistryInput,
  RegistryRecord,
  RegistryStatus,
  ResolveOptions,
} from './registry.js'
export { InMemoryCellRegistry, addFromRaw, parseRange, rangeSatisfies } from './registry.js'

export type {
  ActivationContext,
  ActivationHandler,
  CellLifecycle,
  CellRuntimeOptions,
} from './runtime.js'
export { CellRuntime } from './runtime.js'

export type {
  CellKnowledge,
  CellMemory,
  CellSDK,
  SdkHost,
  SlotContribution,
} from './sdk.js'
export { asActivationContext, createCellSDK } from './sdk.js'

export type { RegisteredContribution, SlotHostOptions } from './slot-host.js'
export { SlotHost } from './slot-host.js'

export type {
  GroupEvent,
  GroupJoinResult,
  GroupMember,
  GroupOptions,
  GroupSubscriber,
} from './groups.js'
export { CellGroup, defineGroup } from './groups.js'

export type {
  SignatureVerifier,
  TrustReason,
  TrustVerdict,
  TrustVerifierOptions,
} from './trust.js'
export { InMemorySignatureVerifier, TrustVerifier } from './trust.js'

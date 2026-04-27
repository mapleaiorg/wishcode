/**
 * Cell-3 — `@wish/cell-sdk` shape.
 *
 * The ONLY surface a Cell may import. Cells get a scoped facade over
 * the host capabilities — they can `check` (never `grant`) on the
 * broker, emit telemetry under their own subject, query memory and
 * knowledge through pre-bound adapters, and contribute into UI slots.
 *
 * The host (Cell-2 runtime) hands a fresh `CellSDK` to each Cell at
 * activation; the SDK's lifetime is bounded by the Cell's lifetime so
 * any handle held by the Cell after deactivation throws.
 */

import type {
  CapabilityBroker,
  CapabilityKind,
  CapabilitySubject,
  CheckRequest,
  CheckResult,
} from '../capability/index.js'
import type {
  KnowledgeSource,
  KnowledgeStore,
  ProvenanceRef,
  SourceFilter,
} from '../knowledge/index.js'
import type { TelemetryEmitter } from '../telemetry/index.js'
import type { CellManifest } from './manifest.js'
import type { ActivationContext } from './runtime.js'
import {
  assembleAgentContext,
  assembleChatContext,
  assembleCodeContext,
  type AgentAdapterOptions,
  type AssembledContext,
  type ChatAdapterOptions,
  type CodeAdapterOptions,
  type MemoryStore,
  type NewMemoryEntry,
} from '../memory/index.js'

/** Slot contribution descriptor a Cell registers at activation. */
export interface SlotContribution {
  slot: string
  entry: string
  priority?: number
  title?: string
}

/** Cell-side memory facade. Bindings are pre-bound to the Cell's
 *  subject at activation; the Cell never names a subject. */
export interface CellMemory {
  put(input: Omit<NewMemoryEntry, 'bindings' | 'scope'>): ReturnType<MemoryStore['put']>
  list(filter?: { tags?: string[]; query?: string; pinnedOnly?: boolean; limit?: number }): ReturnType<MemoryStore['list']>
  /** Surface-specific assembly helpers. */
  assembleChat(opts: Omit<ChatAdapterOptions, 'store'>, query?: string): Promise<AssembledContext>
  assembleCode(opts: Omit<CodeAdapterOptions, 'store'>, query?: string): Promise<AssembledContext>
  assembleAgent(opts: Omit<AgentAdapterOptions, 'store'>, query?: string): Promise<AssembledContext>
}

/** Cell-side knowledge facade. Read-only — Cells never register
 *  sources directly; the host or a privileged Cell does. */
export interface CellKnowledge {
  list(filter?: SourceFilter): Promise<KnowledgeSource[]>
  getBySlug(slug: string): Promise<KnowledgeSource | null>
  /** Attach a `ProvenanceRef` to the trace context — surfaced via
   *  Tel-0 emitter as `provenance.ref.attached`. */
  cite(ref: ProvenanceRef): void
}

export interface CellSDK {
  /** The Cell's own manifest — read-only. */
  readonly manifest: CellManifest
  /** Check (never grant) capability for a resource. */
  capability(req: Omit<CheckRequest, 'subject'>): CheckResult
  /** Throw `CapabilityDenied` when the check fails. */
  requireCapability(req: Omit<CheckRequest, 'subject'>): void
  memory: CellMemory
  knowledge: CellKnowledge
  /** Telemetry scoped to `cell:<id>@<version>`. */
  emit(event: { type: string; level?: 'debug' | 'info' | 'warn' | 'error'; attributes?: Record<string, unknown> }): void
  /** Register a slot contribution; the host returns a disposer. */
  registerSlot(c: SlotContribution): () => void
  /** True after deactivation; Cells should bail every async loop. */
  isDisposed(): boolean
}

export interface SdkHost {
  manifest: CellManifest
  subject: CapabilitySubject
  broker: CapabilityBroker
  memoryStore: MemoryStore
  knowledgeStore: KnowledgeStore
  telemetry?: TelemetryEmitter
  registerSlot: (cellId: string, c: SlotContribution) => () => void
}

const DENIED_TELEMETRY_KEYS = new Set(['password', 'token', 'secret'])

function scrubAttributes(attrs: Record<string, unknown> = {}): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(attrs)) {
    if (DENIED_TELEMETRY_KEYS.has(k.toLowerCase())) continue
    if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean' || v === null) {
      out[k] = v
    }
  }
  return out
}

/**
 * Create a fresh SDK for a Cell. The host (Cell-2) calls this at
 * activation and tears down via the returned `dispose` on
 * deactivation.
 */
export function createCellSDK(host: SdkHost): { sdk: CellSDK; dispose: () => void } {
  let disposed = false
  const slotDisposers: Array<() => void> = []
  const cellSubject = host.subject
  const cellId = host.manifest.id

  function ensureLive(): void {
    if (disposed) throw new Error(`CellSDK: cell "${cellId}" is disposed`)
  }

  const memory: CellMemory = {
    put(input) {
      ensureLive()
      return host.memoryStore.put({ ...input, scope: 'agent', bindings: { agentId: cellSubject.id } })
    },
    list(filter = {}) {
      ensureLive()
      return host.memoryStore.list({
        scopes: ['agent'],
        bindings: { agentId: cellSubject.id },
        ...filter,
      })
    },
    assembleChat(opts, query) {
      ensureLive()
      return assembleChatContext({ store: host.memoryStore, ...opts }, query)
    },
    assembleCode(opts, query) {
      ensureLive()
      return assembleCodeContext({ store: host.memoryStore, ...opts }, query)
    },
    assembleAgent(opts, query) {
      ensureLive()
      return assembleAgentContext({ store: host.memoryStore, ...opts }, query)
    },
  }

  const knowledge: CellKnowledge = {
    list(filter) {
      ensureLive()
      return host.knowledgeStore.listSources(filter)
    },
    getBySlug(slug) {
      ensureLive()
      return host.knowledgeStore.getBySlug(slug)
    },
    cite(ref) {
      ensureLive()
      host.telemetry?.emit({
        type: 'provenance.ref.attached',
        level: 'info',
        attributes: { sourceId: ref.sourceId, chunkId: ref.chunkId ?? '', cellId },
      })
    },
  }

  const sdk: CellSDK = {
    manifest: host.manifest,
    capability(req) {
      ensureLive()
      // Cells may only check the kinds their manifest declared.
      if (!host.manifest.capabilities.includes(req.kind as CapabilityKind)) {
        return { ok: false, reason: 'no_grant' }
      }
      return host.broker.check({ subject: cellSubject, ...req })
    },
    requireCapability(req) {
      ensureLive()
      if (!host.manifest.capabilities.includes(req.kind as CapabilityKind)) {
        throw new Error(
          `Cell "${cellId}" did not declare capability "${req.kind}" in its manifest`,
        )
      }
      host.broker.require({ subject: cellSubject, ...req })
    },
    memory,
    knowledge,
    emit(event) {
      ensureLive()
      host.telemetry?.emit({
        type: event.type,
        level: event.level ?? 'info',
        attributes: { ...scrubAttributes(event.attributes), cellId },
        source: `cell:${cellId}`,
      })
    },
    registerSlot(c) {
      ensureLive()
      const dispose = host.registerSlot(cellId, c)
      slotDisposers.push(dispose)
      return dispose
    },
    isDisposed() {
      return disposed
    },
  }

  function dispose() {
    if (disposed) return
    disposed = true
    for (const d of slotDisposers) {
      try { d() } catch { /* swallow */ }
    }
    slotDisposers.length = 0
  }

  return { sdk, dispose }
}

/** Convenience: build a Cell-2 ActivationContext from an SdkHost,
 *  for class handlers that want to drive the SDK themselves. */
export function asActivationContext(host: SdkHost): ActivationContext {
  return {
    manifest: host.manifest,
    subject: host.subject,
    dependencies: new Map(),
    telemetry: host.telemetry,
  }
}

/**
 * Cell-2 — Cell Runtime (lifecycle + capability enforcement).
 *
 * Activation pipeline:
 *
 *   Cell-1 record  →  resolveDependencies  →  capability pre-grant
 *      → activate(handler)  →  lifecycle: 'active'
 *
 * The runtime itself does NOT load JS bundles or spin up sandboxes —
 * Cell-2.1 (worker / iframe sandbox) plugs into the `activate` hook.
 * Cell-2 ships the lifecycle FSM, capability enforcement, and the
 * registry-backed dependency closure.
 */

import { CapabilityBroker, type CapabilitySubject } from '../capability/index.js'
import type { TelemetryEmitter } from '../telemetry/index.js'
import type { CellManifest } from './manifest.js'
import type { CellRegistry, RegistryRecord } from './registry.js'

export type CellLifecycle =
  | 'inactive'    // registered but not yet activated
  | 'activating'
  | 'active'
  | 'erroring'
  | 'errored'
  | 'unloading'
  | 'unloaded'

export interface ActivationContext {
  manifest: CellManifest
  /** Subject used by the broker for this Cell's grants. */
  subject: CapabilitySubject
  /** Resolved dependencies — keys are dependency `id`s. */
  dependencies: Map<string, RegistryRecord>
  /** Telemetry scoped to the Cell's source (`cell:<id>`). */
  telemetry?: TelemetryEmitter
}

export interface ActivationHandler {
  /** Called once on activate(); returns a teardown to be called on
   *  deactivate. Throwing here raises `errored`. */
  activate(ctx: ActivationContext): Promise<() => Promise<void> | void>
}

export interface CellRuntimeOptions {
  registry: CellRegistry
  broker: CapabilityBroker
  telemetry?: TelemetryEmitter
  /** Default activation handler used when none is registered. The
   *  default is a no-op; Cell-2.1 supplies the sandbox host. */
  defaultHandler?: ActivationHandler
}

interface ActiveCell {
  manifest: CellManifest
  subject: CapabilitySubject
  state: CellLifecycle
  teardown?: () => Promise<void> | void
  error?: { code: string; message: string }
  activatedAt?: string
}

const NOOP_HANDLER: ActivationHandler = {
  async activate() {
    return () => {}
  },
}

export class CellRuntime {
  private readonly active = new Map<string, ActiveCell>()
  private readonly handlersByClass = new Map<CellManifest['class'], ActivationHandler>()
  private readonly handler: ActivationHandler
  private readonly registry: CellRegistry
  private readonly broker: CapabilityBroker
  private readonly telemetry?: TelemetryEmitter

  constructor(opts: CellRuntimeOptions) {
    this.registry = opts.registry
    this.broker = opts.broker
    this.telemetry = opts.telemetry
    this.handler = opts.defaultHandler ?? NOOP_HANDLER
  }

  /** Per-class handlers override the default one. Used by Cell-2.1
   *  (UI / agent / provider class plugins). */
  registerClassHandler(cls: CellManifest['class'], h: ActivationHandler): void {
    this.handlersByClass.set(cls, h)
  }

  state(id: string): CellLifecycle {
    return this.active.get(id)?.state ?? 'inactive'
  }

  async activate(id: string, version: string): Promise<ActiveCell> {
    const existing = this.active.get(id)
    if (existing && existing.state === 'active') return { ...existing }

    const record = await this.registry.get(id, version)
    if (!record) throw new Error(`CellRuntime: not found in registry: ${id}@${version}`)
    if (record.status !== 'installed') {
      throw new Error(`CellRuntime: refusing non-installed Cell ${id}@${version} (${record.status})`)
    }
    const manifest = record.manifest

    // Dependency closure (required deps must resolve; optional may miss).
    const closure = await this.registry.resolveDependencies(manifest)
    const required = closure.missing.filter(m => !m.optional)
    if (required.length > 0) {
      const missing = required.map(m => `${m.id}@${m.range}`).join(', ')
      throw new Error(`CellRuntime: unresolved dependencies: ${missing}`)
    }
    const depMap = new Map<string, RegistryRecord>()
    for (const s of closure.satisfied) depMap.set(s.id, s.resolved)

    // Pre-grant the Cell's declared capabilities to its subject.
    const subject: CapabilitySubject = { id: `cell:${manifest.id}@${manifest.version}`, kind: 'cell' }
    for (const kind of manifest.capabilities) {
      this.broker.grant({ subject, kind, reason: `cell-activation:${manifest.id}` })
    }

    const cell: ActiveCell = {
      manifest,
      subject,
      state: 'activating',
    }
    this.active.set(id, cell)
    this.telemetry?.emit({
      type: 'cell.activate.started',
      level: 'info',
      attributes: {
        cellId: manifest.id,
        cellVersion: manifest.version,
        cellClass: manifest.class,
        trustTier: manifest.trustTier,
      },
    })

    const handler = this.handlersByClass.get(manifest.class) ?? this.handler
    try {
      const teardown = await handler.activate({
        manifest,
        subject,
        dependencies: depMap,
        telemetry: this.telemetry,
      })
      cell.teardown = teardown
      cell.state = 'active'
      cell.activatedAt = new Date().toISOString()
      this.telemetry?.emit({
        type: 'cell.activate.succeeded',
        level: 'info',
        attributes: { cellId: manifest.id, cellVersion: manifest.version },
      })
      return { ...cell }
    } catch (e) {
      cell.state = 'errored'
      cell.error = {
        code: 'cell.activate.failed',
        message: e instanceof Error ? e.message : String(e),
      }
      this.broker.revokeSubject(subject)
      this.telemetry?.emit({
        type: 'cell.activate.failed',
        level: 'error',
        attributes: {
          cellId: manifest.id,
          cellVersion: manifest.version,
          reason: cell.error.message,
        },
      })
      return { ...cell }
    }
  }

  async deactivate(id: string): Promise<void> {
    const cell = this.active.get(id)
    if (!cell) return
    if (cell.state === 'active' || cell.state === 'errored') {
      cell.state = 'unloading'
      try {
        await cell.teardown?.()
      } catch (e) {
        this.telemetry?.emit({
          type: 'cell.deactivate.teardown_failed',
          level: 'warn',
          attributes: {
            cellId: cell.manifest.id,
            cellVersion: cell.manifest.version,
            reason: e instanceof Error ? e.message : String(e),
          },
        })
      }
      this.broker.revokeSubject(cell.subject)
      cell.state = 'unloaded'
      this.telemetry?.emit({
        type: 'cell.deactivate.succeeded',
        level: 'info',
        attributes: { cellId: cell.manifest.id, cellVersion: cell.manifest.version },
      })
    }
    this.active.delete(id)
  }

  /** Snapshot of every Cell currently held by the runtime. */
  list(): ActiveCell[] {
    return [...this.active.values()].map(c => ({ ...c }))
  }
}

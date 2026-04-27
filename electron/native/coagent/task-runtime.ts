/**
 * C-1 — CoAgent Task Runtime.
 *
 * Joins the CoAgent family as `task` and bridges T-0 / T-1 to the
 * bus: every TaskStore mutation surfaces as a `task.created` /
 * `task.updated` / `task.deleted` event other family members
 * (deliverable, approval, knowledge, activity, ui, orchestration)
 * subscribe to.
 *
 * The bridge is one-way at C-1 — TaskStore events flow OUT to the
 * bus. C-1.1 wires the inverse so a Hermon-issued task lands here
 * via `bus.publish('core', { kind: 'task.created', ... })`.
 */

import type {
  Job,
  Task,
  TaskFilter,
  TaskStore,
} from '../tasks/v2/index.js'
import type { CoAgentBus, CoAgentCore } from './bus.js'
import type {
  CoAgentEventKind,
  CoAgentMember,
  JoinResult,
} from './types.js'

const SUBSCRIBES: CoAgentEventKind[] = [
  // The task runtime listens for upstream creates from peers (e.g.
  // Hermon mirror). It uses these to back-fill the local store.
  'task.created',
  'task.updated',
  'task.deleted',
  // Activity members may also notify when the user manually edits.
  'activity.appended',
]

export interface TaskRuntimeOptions {
  /** When `true`, member subscribes to upstream peer events and
   *  applies them to its own store. Default `false` — wire the
   *  Hermon mirror separately in C-1.1. */
  applyPeerEvents?: boolean
  label?: string
}

export class CoAgentTaskRuntime {
  private join: JoinResult | null = null
  private readonly bus: CoAgentBus
  private readonly applyPeer: boolean
  private readonly label?: string
  private peerEventCount = 0

  constructor(
    public readonly store: TaskStore,
    coreOrBus: CoAgentCore | CoAgentBus,
    opts: TaskRuntimeOptions = {},
  ) {
    this.bus = 'bus' in coreOrBus ? coreOrBus.bus : coreOrBus
    this.applyPeer = opts.applyPeerEvents ?? false
    this.label = opts.label
  }

  /** Attach the runtime to the bus. Must be called once. */
  attach(): void {
    if (this.join) return
    const member: CoAgentMember = {
      role: 'task',
      label: this.label ?? 'CoAgent task runtime',
      subscribes: SUBSCRIBES,
    }
    this.join = this.bus.join(member, ev => this.onEvent(ev))
  }

  detach(): void {
    if (!this.join) return
    this.join.leave()
    this.join = null
  }

  /** True iff the runtime is attached. */
  isAttached(): boolean {
    return !!this.join
  }

  /** Diagnostic: how many peer events did `applyPeerEvents` consume? */
  peerEventsApplied(): number {
    return this.peerEventCount
  }

  // ── outbound — TaskStore mutations published to the bus ─────────

  async createTask(...args: Parameters<TaskStore['createTask']>): Promise<Task> {
    const t = await this.store.createTask(...args)
    this.publish({ kind: 'task.created', payload: serializeTask(t) })
    return t
  }

  async setTaskStatus(...args: Parameters<TaskStore['setTaskStatus']>): Promise<Task> {
    const t = await this.store.setTaskStatus(...args)
    this.publish({
      kind: 'task.updated',
      payload: { id: t.id, status: t.status, error: t.error ?? null },
    })
    return t
  }

  async setTaskOutput(...args: Parameters<TaskStore['setTaskOutput']>): Promise<Task> {
    const t = await this.store.setTaskOutput(...args)
    this.publish({
      kind: 'task.updated',
      payload: { id: t.id, output: t.output ?? '' },
    })
    return t
  }

  async removeTask(id: string): Promise<boolean> {
    const removed = await this.store.removeTask(id)
    if (removed) this.publish({ kind: 'task.deleted', payload: { id } })
    return removed
  }

  // ── pass-throughs — read paths don't publish ────────────────────

  getTask(id: string): Promise<Task | null> {
    return this.store.getTask(id)
  }

  listTasks(filter?: TaskFilter): Promise<Task[]> {
    return this.store.listTasks(filter)
  }

  listJobs(taskId: string): Promise<Job[]> {
    return this.store.listJobs(taskId)
  }

  // ── inbound — peer-issued task events back-fill the store ──────

  private async onEvent(
    ev: { kind: CoAgentEventKind; source: string; payload: Record<string, unknown> },
  ): Promise<void> {
    if (!this.applyPeer) return
    if (ev.source === 'task') return // ignore our own
    if (ev.kind === 'task.created') {
      const p = ev.payload as Partial<Task>
      if (typeof p.title === 'string' && typeof p.origin === 'string') {
        try {
          await this.store.createTask({
            title: p.title,
            origin: p.origin as Task['origin'],
            bindings: p.bindings ?? {},
            metadata: p.metadata,
          })
          this.peerEventCount++
        } catch {
          /* swallow — peer + local conflicts surface in C-1.1 reconciliation */
        }
      }
    }
  }

  private publish(ev: { kind: CoAgentEventKind; payload: Record<string, unknown> }): void {
    if (!this.join) {
      // Pre-attach mutations are still legal — surface a warn-ish
      // event the next time we attach? No — silently skip; the
      // host always attaches before issuing mutations.
      return
    }
    this.join.publish(ev)
  }
}

function serializeTask(t: Task): Record<string, unknown> {
  return {
    id: t.id,
    title: t.title,
    status: t.status,
    origin: t.origin,
    bindings: t.bindings,
    createdAt: t.createdAt,
  }
}

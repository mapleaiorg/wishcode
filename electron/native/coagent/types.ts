/**
 * C-0 — CoAgent family scaffold + core cell.
 *
 * "CoAgent" is the first-party Cell Family — a coordinated set of
 * Cells (tasks, deliverables, approvals, knowledge, activity, UI,
 * agent-orchestration) that share an internal bus and a common
 * member registry. Outside-of-family code never sees the bus
 * directly; the core cell publishes typed events that members
 * subscribe to.
 *
 * The bus stays in-process for now — Hermon mirroring (C-1.1) wraps
 * the local bus with a remote sink. Cell-5 will take the generic
 * `CellFamily` shape and let third-party Cells form their own
 * families; C-0 ships only the CoAgent-specific types.
 */

import type { TelemetryEmitter } from '../telemetry/index.js'

/** Stable family id — CoAgent's namespace anchor. */
export const COAGENT_FAMILY_ID = 'wish.coagent' as const

/** Member roles inside the CoAgent family. */
export type CoAgentRole =
  | 'core'         // C-0 — coordinates everyone else
  | 'task'         // C-1 — task runtime
  | 'deliverable'  // C-2 — versioning + review + publish
  | 'approval'     // C-3 — unified approval UX
  | 'knowledge'    // C-4 — team knowledge
  | 'activity'     // C-5 — team feed + presence
  | 'ui'           // C-6 — shell contributions
  | 'orchestration'// C-7 — task-bound agent runs

/** Stable event kinds the core cell brokers. Family members publish
 *  + subscribe to these; nothing else may put events on the bus. */
export type CoAgentEventKind =
  | 'family.member.joined'
  | 'family.member.left'
  | 'task.created'
  | 'task.updated'
  | 'task.deleted'
  | 'deliverable.published'
  | 'deliverable.revised'
  | 'approval.requested'
  | 'approval.granted'
  | 'approval.denied'
  | 'knowledge.cited'
  | 'activity.appended'
  | 'agent.run.started'
  | 'agent.run.finished'

export interface CoAgentEvent {
  kind: CoAgentEventKind
  /** Stable id of the publishing member; the core sets `core`. */
  source: CoAgentRole
  /** ISO-8601. */
  ts: string
  /** Free-form payload — bus does not validate; subscribers do. */
  payload: Record<string, unknown>
}

export type CoAgentSubscriber = (event: CoAgentEvent) => void

export interface CoAgentMember {
  role: CoAgentRole
  /** Optional human-readable label for diagnostics. */
  label?: string
  /** Subscribed kinds. Empty array = no subscriptions. */
  subscribes: CoAgentEventKind[]
}

export interface JoinResult {
  /** Publish onto the bus. */
  publish(event: Omit<CoAgentEvent, 'source' | 'ts'>): void
  /** Snapshot of the current membership (other members included). */
  membership(): CoAgentMember[]
  /** Leave the family — member is removed and `family.member.left` fired. */
  leave(): void
}

export interface CoAgentBusOptions {
  telemetry?: TelemetryEmitter
}

/**
 * D-6 — Capability gate types.
 *
 * Every privileged action — file read/write, git mutate, process
 * spawn, terminal attach, network fetch, secret read, connector
 * access, CoAgent mutate — passes through the broker. The broker
 * holds active `CapabilityGrant`s scoped to a subject (a session, a
 * Cell, or the agent runtime), each with optional resource
 * constraints (paths, hosts, scopes) and an optional expiry.
 *
 * D-6 is the renderer/main-side gate. Defense-in-depth lives in
 * `wishd-capability` (W-6) on the trusted-runtime side, and in
 * org-policy gating (H-7) on the control plane.
 */

import type { TelemetryEmitter } from '../telemetry/index.js'

/** Mirrors CONVENTIONS § 6. New kinds require an IPC protocol bump. */
export type CapabilityKind =
  | 'filesystem.read'
  | 'filesystem.write'
  | 'git.read'
  | 'git.write'
  | 'process.spawn'
  | 'terminal.attach'
  | 'network.fetch'
  | 'provider.access'
  | 'secret.read'
  | 'connector.access'
  | 'coagent.task.mutate'
  | 'coagent.approval.mutate'
  | 'coagent.deliverable.mutate'

export const CAPABILITY_KINDS: readonly CapabilityKind[] = [
  'filesystem.read',
  'filesystem.write',
  'git.read',
  'git.write',
  'process.spawn',
  'terminal.attach',
  'network.fetch',
  'provider.access',
  'secret.read',
  'connector.access',
  'coagent.task.mutate',
  'coagent.approval.mutate',
  'coagent.deliverable.mutate',
] as const

/** What's holding the grant. */
export interface CapabilitySubject {
  /** Stable id — `session:<id>`, `cell:<id>`, `agent:<id>`. */
  id: string
  /** Kind of subject, for telemetry routing. */
  kind: 'session' | 'cell' | 'agent' | 'system'
}

/** Resource constraints (per-kind shape). All optional — absent = wildcard. */
export interface CapabilityConstraints {
  /** filesystem.* — workspace-relative path prefixes. */
  pathPrefixes?: string[]
  /** network.fetch — allowed hostnames (exact match). */
  hosts?: string[]
  /** provider.access — allowed provider ids. */
  providers?: string[]
  /** connector.access — allowed connector ids. */
  connectors?: string[]
  /** workspace.* — workspace ids the grant is bound to. */
  workspaceIds?: string[]
  /** coagent.* — task ids the grant covers. */
  taskIds?: string[]
}

export interface CapabilityGrant {
  id: string
  subject: CapabilitySubject
  kind: CapabilityKind
  constraints: CapabilityConstraints
  /** ISO-8601; absent = no expiry. */
  expiresAt?: string
  /** ISO-8601 — when the grant was minted. */
  grantedAt: string
  /** Optional human-readable reason — surfaces in audit. */
  reason?: string
}

export interface NewGrantInput {
  subject: CapabilitySubject
  kind: CapabilityKind
  constraints?: CapabilityConstraints
  expiresAt?: string
  reason?: string
}

export interface CheckRequest {
  subject: CapabilitySubject
  kind: CapabilityKind
  /** Optional resource hints used to compare against constraints. */
  resource?: {
    path?: string
    host?: string
    providerId?: string
    connectorId?: string
    workspaceId?: string
    taskId?: string
  }
}

export type CheckResult =
  | { ok: true; grant: CapabilityGrant }
  | { ok: false; reason: DenialReason }

export type DenialReason =
  | 'no_grant'
  | 'expired'
  | 'path_outside_grant'
  | 'host_outside_grant'
  | 'provider_outside_grant'
  | 'connector_outside_grant'
  | 'workspace_outside_grant'
  | 'task_outside_grant'

export interface CapabilityBrokerOptions {
  /** Optional emitter — broker logs every grant, revoke, allow, deny. */
  telemetry?: TelemetryEmitter
}

export class CapabilityDenied extends Error {
  readonly code = 'capability.denied' as const
  readonly retryable = false
  constructor(
    public readonly kind: CapabilityKind,
    public readonly reason: DenialReason,
    public readonly subject: CapabilitySubject,
  ) {
    super(`capability denied: ${kind} (${reason}) for ${subject.kind}:${subject.id}`)
    this.name = 'CapabilityDenied'
  }
}

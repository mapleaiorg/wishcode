/**
 * D-6 — Capability broker.
 *
 * Holds active `CapabilityGrant`s in memory; every privileged caller
 * either calls `check(...)` to peek or `require(...)` to throw on
 * deny. Org-policy gating (H-7) wraps this broker on the renderer
 * side; defense-in-depth lives in wishd-capability (W-6).
 */

import type {
  CapabilityBrokerOptions,
  CapabilityConstraints,
  CapabilityGrant,
  CapabilityKind,
  CapabilitySubject,
  CheckRequest,
  CheckResult,
  DenialReason,
  NewGrantInput,
} from './types.js'
import { CapabilityDenied } from './types.js'
import type { TelemetryEmitter } from '../telemetry/index.js'

let nextSeq = 0
function newId(): string {
  return `grant_${Date.now().toString(36)}_${(nextSeq++).toString(36)}`
}

function isExpired(grant: CapabilityGrant, now: number): boolean {
  if (!grant.expiresAt) return false
  return new Date(grant.expiresAt).getTime() <= now
}

function pathMatches(prefixes: string[] | undefined, p: string | undefined): boolean {
  if (!prefixes || prefixes.length === 0) return true
  if (p === undefined) return false
  return prefixes.some(pre => p === pre || p.startsWith(pre.endsWith('/') ? pre : pre + '/'))
}

function listIncludes(allow: string[] | undefined, v: string | undefined): boolean {
  if (!allow || allow.length === 0) return true
  if (v === undefined) return false
  return allow.includes(v)
}

function hostMatches(hosts: string[] | undefined, host: string | undefined): boolean {
  if (!hosts || hosts.length === 0) return true
  if (host === undefined) return false
  // exact match (no wildcard for now — H-7 will add policy-driven wildcards).
  return hosts.includes(host)
}

function constraintsAllow(
  c: CapabilityConstraints,
  req: CheckRequest['resource'],
): { ok: true } | { ok: false; reason: DenialReason } {
  const r = req ?? {}
  if (!pathMatches(c.pathPrefixes, r.path)) return { ok: false, reason: 'path_outside_grant' }
  if (!hostMatches(c.hosts, r.host)) return { ok: false, reason: 'host_outside_grant' }
  if (!listIncludes(c.providers, r.providerId)) return { ok: false, reason: 'provider_outside_grant' }
  if (!listIncludes(c.connectors, r.connectorId)) return { ok: false, reason: 'connector_outside_grant' }
  if (!listIncludes(c.workspaceIds, r.workspaceId)) return { ok: false, reason: 'workspace_outside_grant' }
  if (!listIncludes(c.taskIds, r.taskId)) return { ok: false, reason: 'task_outside_grant' }
  return { ok: true }
}

function subjectKey(s: CapabilitySubject): string {
  return `${s.kind}:${s.id}`
}

export class CapabilityBroker {
  private readonly grants = new Map<string, CapabilityGrant>()
  /** subjectKey → set of grant ids — fast lookup on check. */
  private readonly bySubject = new Map<string, Set<string>>()
  private readonly telemetry?: TelemetryEmitter

  constructor(opts: CapabilityBrokerOptions = {}) {
    this.telemetry = opts.telemetry
  }

  /** Issue a new grant. Returns the persisted record. */
  grant(input: NewGrantInput): CapabilityGrant {
    const grant: CapabilityGrant = {
      id: newId(),
      subject: input.subject,
      kind: input.kind,
      constraints: input.constraints ?? {},
      expiresAt: input.expiresAt,
      grantedAt: new Date().toISOString(),
      reason: input.reason,
    }
    this.grants.set(grant.id, grant)
    let set = this.bySubject.get(subjectKey(grant.subject))
    if (!set) {
      set = new Set()
      this.bySubject.set(subjectKey(grant.subject), set)
    }
    set.add(grant.id)
    this.telemetry?.emit({
      type: 'capability.grant.issued',
      level: 'info',
      attributes: {
        kind: grant.kind,
        subjectKind: grant.subject.kind,
        subjectId: grant.subject.id,
      },
    })
    return { ...grant }
  }

  revoke(grantId: string): boolean {
    const g = this.grants.get(grantId)
    if (!g) return false
    this.grants.delete(grantId)
    this.bySubject.get(subjectKey(g.subject))?.delete(grantId)
    this.telemetry?.emit({
      type: 'capability.grant.revoked',
      level: 'info',
      attributes: { kind: g.kind, subjectId: g.subject.id, subjectKind: g.subject.kind },
    })
    return true
  }

  /** Drop every grant for a subject. Used on session end / Cell unload. */
  revokeSubject(subject: CapabilitySubject): number {
    const ids = this.bySubject.get(subjectKey(subject))
    if (!ids) return 0
    let n = 0
    for (const id of [...ids]) {
      if (this.revoke(id)) n++
    }
    this.bySubject.delete(subjectKey(subject))
    return n
  }

  /** All currently-active grants for a subject. */
  listFor(subject: CapabilitySubject): CapabilityGrant[] {
    const ids = this.bySubject.get(subjectKey(subject)) ?? new Set()
    const now = Date.now()
    const out: CapabilityGrant[] = []
    for (const id of ids) {
      const g = this.grants.get(id)
      if (!g) continue
      if (isExpired(g, now)) continue
      out.push({ ...g })
    }
    return out
  }

  /** Non-throwing variant. Returns the matched grant on success. */
  check(req: CheckRequest): CheckResult {
    const ids = this.bySubject.get(subjectKey(req.subject)) ?? new Set()
    const now = Date.now()
    let firstReason: DenialReason = 'no_grant'
    for (const id of ids) {
      const g = this.grants.get(id)
      if (!g) continue
      if (g.kind !== req.kind) continue
      if (isExpired(g, now)) {
        firstReason = 'expired'
        continue
      }
      const ok = constraintsAllow(g.constraints, req.resource)
      if (ok.ok) {
        this.telemetry?.emit({
          type: 'capability.check.allowed',
          level: 'debug',
          attributes: {
            kind: g.kind,
            subjectKind: g.subject.kind,
            subjectId: g.subject.id,
          },
        })
        return { ok: true, grant: { ...g } }
      } else {
        firstReason = ok.reason
      }
    }
    this.telemetry?.emit({
      type: 'capability.check.denied',
      level: 'warn',
      attributes: {
        kind: req.kind,
        reason: firstReason,
        subjectKind: req.subject.kind,
        subjectId: req.subject.id,
      },
    })
    return { ok: false, reason: firstReason }
  }

  /** Throwing variant — used at every privileged-call site. */
  require(req: CheckRequest): CapabilityGrant {
    const r = this.check(req)
    if (r.ok) return r.grant
    throw new CapabilityDenied(req.kind, r.reason, req.subject)
  }

  /** Test-only — drops every grant. */
  __resetForTests(): void {
    this.grants.clear()
    this.bySubject.clear()
  }
}

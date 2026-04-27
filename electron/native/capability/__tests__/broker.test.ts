/**
 * D-6 — CapabilityBroker tests.
 */

import { describe, expect, it } from 'vitest'
import {
  CAPABILITY_KINDS,
  CapabilityBroker,
  CapabilityDenied,
  type CapabilitySubject,
} from '../index.js'
import { MemorySink, TelemetryEmitter } from '../../telemetry/index.js'

const sess: CapabilitySubject = { id: 's1', kind: 'session' }
const cell: CapabilitySubject = { id: 'c1', kind: 'cell' }

describe('CapabilityBroker', () => {
  it('grants and re-fetches', () => {
    const b = new CapabilityBroker()
    const g = b.grant({ subject: sess, kind: 'filesystem.read' })
    expect(b.listFor(sess)).toHaveLength(1)
    expect(b.listFor(sess)[0].id).toBe(g.id)
  })

  it('check.no_grant when nothing matches', () => {
    const b = new CapabilityBroker()
    const r = b.check({ subject: sess, kind: 'filesystem.read' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('no_grant')
  })

  it('require throws CapabilityDenied with code "capability.denied"', () => {
    const b = new CapabilityBroker()
    try {
      b.require({ subject: sess, kind: 'process.spawn' })
      throw new Error('expected throw')
    } catch (e) {
      expect(e).toBeInstanceOf(CapabilityDenied)
      const d = e as CapabilityDenied
      expect(d.code).toBe('capability.denied')
      expect(d.kind).toBe('process.spawn')
      expect(d.reason).toBe('no_grant')
    }
  })

  it('grant with no constraints matches any resource', () => {
    const b = new CapabilityBroker()
    b.grant({ subject: sess, kind: 'filesystem.read' })
    const r = b.check({
      subject: sess, kind: 'filesystem.read', resource: { path: 'src/x.ts' },
    })
    expect(r.ok).toBe(true)
  })

  it('pathPrefixes constraint matches prefix-bounded paths', () => {
    const b = new CapabilityBroker()
    b.grant({
      subject: sess, kind: 'filesystem.write',
      constraints: { pathPrefixes: ['src/', 'docs/'] },
    })
    expect(
      b.check({ subject: sess, kind: 'filesystem.write', resource: { path: 'src/x.ts' } }).ok,
    ).toBe(true)
    const r = b.check({
      subject: sess, kind: 'filesystem.write', resource: { path: 'etc/passwd' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('path_outside_grant')
  })

  it('rejects path absent when prefixes are set', () => {
    const b = new CapabilityBroker()
    b.grant({
      subject: sess, kind: 'filesystem.read',
      constraints: { pathPrefixes: ['src/'] },
    })
    const r = b.check({ subject: sess, kind: 'filesystem.read' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('path_outside_grant')
  })

  it('host constraint allows exact host match', () => {
    const b = new CapabilityBroker()
    b.grant({
      subject: sess, kind: 'network.fetch',
      constraints: { hosts: ['api.example.com'] },
    })
    expect(
      b.check({
        subject: sess, kind: 'network.fetch', resource: { host: 'api.example.com' },
      }).ok,
    ).toBe(true)
    const r = b.check({
      subject: sess, kind: 'network.fetch', resource: { host: 'evil.example.com' },
    })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('host_outside_grant')
  })

  it('provider, connector, workspace, task constraints each enforce membership', () => {
    const b = new CapabilityBroker()
    b.grant({ subject: sess, kind: 'provider.access', constraints: { providers: ['anthropic'] } })
    b.grant({ subject: sess, kind: 'connector.access', constraints: { connectors: ['jira'] } })
    b.grant({
      subject: sess, kind: 'coagent.task.mutate',
      constraints: { workspaceIds: ['ws-1'], taskIds: ['t-1'] },
    })
    expect(
      b.check({
        subject: sess, kind: 'provider.access', resource: { providerId: 'anthropic' },
      }).ok,
    ).toBe(true)
    expect(
      b.check({
        subject: sess, kind: 'provider.access', resource: { providerId: 'openai' },
      }).ok,
    ).toBe(false)
    expect(
      b.check({
        subject: sess, kind: 'connector.access', resource: { connectorId: 'jira' },
      }).ok,
    ).toBe(true)
    expect(
      b.check({
        subject: sess, kind: 'connector.access', resource: { connectorId: 'github' },
      }).ok,
    ).toBe(false)
    expect(
      b.check({
        subject: sess, kind: 'coagent.task.mutate',
        resource: { workspaceId: 'ws-1', taskId: 't-1' },
      }).ok,
    ).toBe(true)
    expect(
      b.check({
        subject: sess, kind: 'coagent.task.mutate',
        resource: { workspaceId: 'ws-2', taskId: 't-1' },
      }).ok,
    ).toBe(false)
  })

  it('expired grants surface as "expired"', () => {
    const b = new CapabilityBroker()
    b.grant({
      subject: sess, kind: 'secret.read',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    const r = b.check({ subject: sess, kind: 'secret.read' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.reason).toBe('expired')
  })

  it('listFor filters out expired grants', () => {
    const b = new CapabilityBroker()
    b.grant({ subject: sess, kind: 'filesystem.read' })
    b.grant({
      subject: sess, kind: 'filesystem.write',
      expiresAt: new Date(Date.now() - 1000).toISOString(),
    })
    const live = b.listFor(sess)
    expect(live).toHaveLength(1)
    expect(live[0].kind).toBe('filesystem.read')
  })

  it('revoke removes a grant; second revoke returns false', () => {
    const b = new CapabilityBroker()
    const g = b.grant({ subject: sess, kind: 'filesystem.read' })
    expect(b.revoke(g.id)).toBe(true)
    expect(b.revoke(g.id)).toBe(false)
  })

  it('revokeSubject drops every grant the subject holds', () => {
    const b = new CapabilityBroker()
    b.grant({ subject: sess, kind: 'filesystem.read' })
    b.grant({ subject: sess, kind: 'filesystem.write' })
    b.grant({ subject: cell, kind: 'filesystem.read' })
    const n = b.revokeSubject(sess)
    expect(n).toBe(2)
    expect(b.listFor(sess)).toHaveLength(0)
    expect(b.listFor(cell)).toHaveLength(1)
  })

  it('telemetry: emits issued / allowed / denied / revoked when an emitter is wired', () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const b = new CapabilityBroker({ telemetry: tel })
    const g = b.grant({ subject: sess, kind: 'filesystem.read' })
    b.check({ subject: sess, kind: 'filesystem.read' })
    b.check({ subject: sess, kind: 'filesystem.write' }) // denied
    b.revoke(g.id)
    const types = sink.events.map(e => e.type)
    expect(types).toContain('capability.grant.issued')
    expect(types).toContain('capability.check.allowed')
    expect(types).toContain('capability.check.denied')
    expect(types).toContain('capability.grant.revoked')
  })

  it('telemetry attributes never leak the grant id (PII boundary)', () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const b = new CapabilityBroker({ telemetry: tel })
    b.grant({
      subject: sess,
      kind: 'secret.read',
      reason: 'password=hunter2', // pretend the caller said something dumb
    })
    const ev = sink.events.find(e => e.type === 'capability.grant.issued')
    expect(ev).toBeDefined()
    // attributes are kind/subjectKind/subjectId only — no id, no reason.
    expect(Object.keys(ev!.attributes)).toEqual(
      expect.arrayContaining(['kind', 'subjectKind', 'subjectId']),
    )
    expect(JSON.stringify(ev)).not.toContain('hunter2')
  })

  it('CAPABILITY_KINDS lists all 13 kinds (CONVENTIONS § 6)', () => {
    expect(CAPABILITY_KINDS).toHaveLength(13)
    expect(CAPABILITY_KINDS).toContain('filesystem.read')
    expect(CAPABILITY_KINDS).toContain('coagent.deliverable.mutate')
  })

  it('require returns the grant on success', () => {
    const b = new CapabilityBroker()
    const g = b.grant({ subject: sess, kind: 'filesystem.read' })
    const got = b.require({ subject: sess, kind: 'filesystem.read' })
    expect(got.id).toBe(g.id)
  })
})

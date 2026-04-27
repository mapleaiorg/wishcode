/**
 * Cell-2 — runtime lifecycle + capability enforcement tests.
 */

import { describe, expect, it } from 'vitest'
import {
  CellRuntime,
  InMemoryCellRegistry,
  type ActivationHandler,
  type CellManifest,
} from '../index.js'
import { CapabilityBroker } from '../../capability/index.js'
import { MemorySink, TelemetryEmitter } from '../../telemetry/index.js'

const SHA256 = 'a'.repeat(64)

function makeManifest(
  id: string,
  version: string,
  overrides: Partial<CellManifest> = {},
): CellManifest {
  return {
    manifestVersion: 1,
    id, version,
    class: 'tool',
    trustTier: 'sandboxed',
    title: id,
    author: { name: 'test' },
    capabilities: [],
    slots: [],
    dependencies: [],
    storage: { bundle: './bundle', bundleHash: SHA256 },
    ...overrides,
  } as CellManifest
}

async function bootstrap(opts: {
  manifests: CellManifest[]
  handler?: ActivationHandler
  withTelemetry?: boolean
} = { manifests: [] }) {
  const registry = new InMemoryCellRegistry()
  const broker = new CapabilityBroker()
  const sink = new MemorySink()
  const telemetry = opts.withTelemetry ? new TelemetryEmitter() : undefined
  if (telemetry) telemetry.addSink(sink)
  for (const m of opts.manifests) await registry.add({ manifest: m })
  const runtime = new CellRuntime({
    registry, broker, telemetry,
    defaultHandler: opts.handler,
  })
  return { registry, broker, runtime, sink }
}

describe('CellRuntime — activation', () => {
  it('activates an inactive Cell into "active" state', async () => {
    const m = makeManifest('a', '1.0.0')
    const { runtime } = await bootstrap({ manifests: [m] })
    const cell = await runtime.activate('a', '1.0.0')
    expect(cell.state).toBe('active')
    expect(runtime.state('a')).toBe('active')
  })

  it('refuses to activate a missing Cell', async () => {
    const { runtime } = await bootstrap()
    await expect(runtime.activate('missing', '1.0.0')).rejects.toThrow(/not found/)
  })

  it('refuses non-installed Cells (draft)', async () => {
    const m = makeManifest('a', '1.0.0')
    const { registry, runtime } = await bootstrap({ manifests: [] })
    await registry.add({ manifest: m, status: 'draft' })
    await expect(runtime.activate('a', '1.0.0')).rejects.toThrow(/non-installed/)
  })

  it('pre-grants every declared capability to the cell subject', async () => {
    const m = makeManifest('a', '1.0.0', {
      capabilities: ['filesystem.read', 'network.fetch'],
    })
    const { runtime, broker } = await bootstrap({ manifests: [m] })
    const cell = await runtime.activate('a', '1.0.0')
    const grants = broker.listFor(cell.subject)
    expect(grants.map(g => g.kind).sort()).toEqual(['filesystem.read', 'network.fetch'])
  })

  it('rejects activation when a required dependency is missing', async () => {
    const a = makeManifest('a', '1.0.0', {
      dependencies: [{ id: 'wish.policy.audit', versionRange: '^1', optional: false }],
    })
    const { runtime } = await bootstrap({ manifests: [a] })
    await expect(runtime.activate('a', '1.0.0')).rejects.toThrow(/unresolved dependencies/)
  })

  it('allows activation when only an optional dependency is missing', async () => {
    const a = makeManifest('a', '1.0.0', {
      dependencies: [{ id: 'wish.tool.opt', versionRange: '*', optional: true }],
    })
    const { runtime } = await bootstrap({ manifests: [a] })
    const cell = await runtime.activate('a', '1.0.0')
    expect(cell.state).toBe('active')
  })

  it('routes class-specific handlers when registered', async () => {
    const m = makeManifest('a', '1.0.0', { class: 'provider' })
    const calls: string[] = []
    const provHandler: ActivationHandler = {
      async activate(ctx) {
        calls.push(`provider:${ctx.manifest.id}`)
        return () => { calls.push('teardown') }
      },
    }
    const { runtime } = await bootstrap({ manifests: [m] })
    runtime.registerClassHandler('provider', provHandler)
    await runtime.activate('a', '1.0.0')
    expect(calls).toEqual(['provider:a'])
    await runtime.deactivate('a')
    expect(calls).toEqual(['provider:a', 'teardown'])
  })

  it('captures activation errors and revokes the cell subject grants', async () => {
    const m = makeManifest('a', '1.0.0', { capabilities: ['filesystem.read'] })
    const handler: ActivationHandler = {
      async activate() { throw new Error('init blew up') },
    }
    const { runtime, broker } = await bootstrap({ manifests: [m], handler })
    const cell = await runtime.activate('a', '1.0.0')
    expect(cell.state).toBe('errored')
    expect(cell.error?.code).toBe('cell.activate.failed')
    expect(cell.error?.message).toContain('init blew up')
    expect(broker.listFor(cell.subject)).toHaveLength(0)
  })
})

describe('CellRuntime — deactivation', () => {
  it('runs the teardown returned by activate', async () => {
    let torn = false
    const handler: ActivationHandler = {
      async activate() { return () => { torn = true } },
    }
    const m = makeManifest('a', '1.0.0')
    const { runtime } = await bootstrap({ manifests: [m], handler })
    await runtime.activate('a', '1.0.0')
    await runtime.deactivate('a')
    expect(torn).toBe(true)
    expect(runtime.state('a')).toBe('inactive')
  })

  it('survives a thrown teardown (still revokes grants + emits warn)', async () => {
    const handler: ActivationHandler = {
      async activate() {
        return () => { throw new Error('teardown failed') }
      },
    }
    const m = makeManifest('a', '1.0.0', { capabilities: ['network.fetch'] })
    const { runtime, broker, sink } = await bootstrap({
      manifests: [m], handler, withTelemetry: true,
    })
    const cell = await runtime.activate('a', '1.0.0')
    await runtime.deactivate('a')
    expect(broker.listFor(cell.subject)).toHaveLength(0)
    expect(sink.events.some(e => e.type === 'cell.deactivate.teardown_failed')).toBe(true)
  })

  it('deactivate on an unknown cell is a no-op', async () => {
    const { runtime } = await bootstrap()
    await runtime.deactivate('missing')
    expect(runtime.state('missing')).toBe('inactive')
  })
})

describe('CellRuntime — telemetry', () => {
  it('emits started + succeeded on a clean activation', async () => {
    const m = makeManifest('a', '1.0.0')
    const { runtime, sink } = await bootstrap({
      manifests: [m], withTelemetry: true,
    })
    await runtime.activate('a', '1.0.0')
    const types = sink.events.map(e => e.type)
    expect(types).toContain('cell.activate.started')
    expect(types).toContain('cell.activate.succeeded')
  })

  it('emits failed on a thrown handler', async () => {
    const handler: ActivationHandler = {
      async activate() { throw new Error('nope') },
    }
    const m = makeManifest('a', '1.0.0')
    const { runtime, sink } = await bootstrap({
      manifests: [m], handler, withTelemetry: true,
    })
    await runtime.activate('a', '1.0.0')
    expect(sink.events.some(e => e.type === 'cell.activate.failed')).toBe(true)
  })
})

describe('CellRuntime — listing', () => {
  it('list() snapshots active + errored cells', async () => {
    const a = makeManifest('a', '1.0.0')
    const b = makeManifest('b', '1.0.0')
    const handler: ActivationHandler = {
      async activate(ctx) {
        if (ctx.manifest.id === 'b') throw new Error('boom')
        return () => {}
      },
    }
    const { runtime } = await bootstrap({ manifests: [a, b], handler })
    await runtime.activate('a', '1.0.0')
    await runtime.activate('b', '1.0.0')
    const list = runtime.list()
    expect(list.find(c => c.manifest.id === 'a')?.state).toBe('active')
    expect(list.find(c => c.manifest.id === 'b')?.state).toBe('errored')
  })
})

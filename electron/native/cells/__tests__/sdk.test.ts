/**
 * Cell-3 — SDK tests.
 */

import { describe, expect, it } from 'vitest'
import { CapabilityBroker, type CapabilitySubject } from '../../capability/index.js'
import { InMemoryKnowledgeStore } from '../../knowledge/index.js'
import { InMemoryMemoryStore } from '../../memory/index.js'
import { MemorySink, TelemetryEmitter } from '../../telemetry/index.js'
import { createCellSDK, type SdkHost } from '../index.js'
import type { CellManifest } from '../manifest.js'

const SHA256 = 'a'.repeat(64)

function makeHost(overrides: Partial<SdkHost> & { capabilities?: CellManifest['capabilities'] } = {}): {
  host: SdkHost
  broker: CapabilityBroker
  memoryStore: InMemoryMemoryStore
  knowledgeStore: InMemoryKnowledgeStore
  sink: MemorySink
  slotsRegistered: Array<{ cellId: string; slot: string; entry: string }>
} {
  const manifest: CellManifest = {
    manifestVersion: 1,
    id: 'wish.tool.alpha',
    version: '1.0.0',
    class: 'tool',
    trustTier: 'sandboxed',
    title: 'Alpha',
    author: { name: 'test' },
    capabilities: overrides.capabilities ?? ['filesystem.read'],
    slots: [],
    dependencies: [],
    storage: { bundle: './bundle', bundleHash: SHA256 },
  } as CellManifest
  const subject: CapabilitySubject = { id: `cell:${manifest.id}@${manifest.version}`, kind: 'cell' }
  const broker = new CapabilityBroker()
  const memoryStore = new InMemoryMemoryStore()
  const knowledgeStore = new InMemoryKnowledgeStore()
  const sink = new MemorySink()
  const telemetry = new TelemetryEmitter()
  telemetry.addSink(sink)
  const slotsRegistered: Array<{ cellId: string; slot: string; entry: string }> = []
  const host: SdkHost = {
    manifest,
    subject,
    broker,
    memoryStore,
    knowledgeStore,
    telemetry,
    registerSlot: (cellId, c) => {
      const rec = { cellId, slot: c.slot, entry: c.entry }
      slotsRegistered.push(rec)
      return () => {
        const i = slotsRegistered.indexOf(rec)
        if (i !== -1) slotsRegistered.splice(i, 1)
      }
    },
    ...overrides,
  }
  return { host, broker, memoryStore, knowledgeStore, sink, slotsRegistered }
}

describe('createCellSDK', () => {
  it('exposes the manifest read-only', () => {
    const { host } = makeHost()
    const { sdk } = createCellSDK(host)
    expect(sdk.manifest.id).toBe('wish.tool.alpha')
  })

  it('capability check denies kinds the manifest did not declare', () => {
    const { host } = makeHost({ capabilities: ['filesystem.read'] })
    const { sdk } = createCellSDK(host)
    const r = sdk.capability({ kind: 'process.spawn' })
    expect(r.ok).toBe(false)
  })

  it('capability check delegates to the broker for declared kinds', () => {
    const { host, broker } = makeHost({ capabilities: ['filesystem.read'] })
    broker.grant({ subject: host.subject, kind: 'filesystem.read' })
    const { sdk } = createCellSDK(host)
    const r = sdk.capability({ kind: 'filesystem.read' })
    expect(r.ok).toBe(true)
  })

  it('requireCapability throws when the manifest did not declare it', () => {
    const { host } = makeHost({ capabilities: ['filesystem.read'] })
    const { sdk } = createCellSDK(host)
    expect(() => sdk.requireCapability({ kind: 'process.spawn' })).toThrow(/did not declare/)
  })

  it('memory.put scopes entries under the cell subject (agent scope)', async () => {
    const { host, memoryStore } = makeHost()
    const { sdk } = createCellSDK(host)
    const e = await sdk.memory.put({ body: 'cell scratch' })
    expect(e.scope).toBe('agent')
    expect(e.bindings.agentId).toBe(host.subject.id)
    const list = await memoryStore.list({})
    expect(list).toHaveLength(1)
  })

  it('memory.list returns only cell-scoped entries', async () => {
    const { host, memoryStore } = makeHost()
    await memoryStore.put({ scope: 'personal', body: 'not the cell\'s' })
    const { sdk } = createCellSDK(host)
    await sdk.memory.put({ body: 'mine' })
    const list = await sdk.memory.list({})
    expect(list).toHaveLength(1)
    expect(list[0].body).toBe('mine')
  })

  it('knowledge.list + getBySlug pass through to the store', async () => {
    const { host, knowledgeStore } = makeHost()
    await knowledgeStore.registerSource({
      slug: 'docs/handbook', kind: 'fs.directory', uri: '/x', title: 'Handbook',
    })
    const { sdk } = createCellSDK(host)
    expect((await sdk.knowledge.list()).length).toBe(1)
    expect((await sdk.knowledge.getBySlug('docs/handbook'))?.title).toBe('Handbook')
  })

  it('knowledge.cite emits provenance.ref.attached telemetry', () => {
    const { host, sink } = makeHost()
    const { sdk } = createCellSDK(host)
    sdk.knowledge.cite({ sourceId: 's1', chunkId: 'c1' })
    expect(sink.events.some(e => e.type === 'provenance.ref.attached')).toBe(true)
  })

  it('emit() prefixes source with cell id and scrubs sensitive attrs', () => {
    const { host, sink } = makeHost()
    const { sdk } = createCellSDK(host)
    sdk.emit({ type: 'cell.alpha.tick', attributes: { ok: true, password: 'leak', count: 3 } })
    const ev = sink.events.find(e => e.type === 'cell.alpha.tick')
    expect(ev).toBeDefined()
    expect(ev!.source).toBe('cell:wish.tool.alpha')
    expect(ev!.attributes.cellId).toBe('wish.tool.alpha')
    expect(ev!.attributes.password).toBeUndefined()
    expect(ev!.attributes.ok).toBe(true)
    expect(ev!.attributes.count).toBe(3)
  })

  it('registerSlot returns a disposer that removes the contribution', () => {
    const { host, slotsRegistered } = makeHost()
    const { sdk } = createCellSDK(host)
    const dispose = sdk.registerSlot({ slot: 'shell.main', entry: 'AlphaView' })
    expect(slotsRegistered).toHaveLength(1)
    dispose()
    expect(slotsRegistered).toHaveLength(0)
  })

  it('dispose disposes every registered slot once and flips isDisposed', () => {
    const { host, slotsRegistered } = makeHost()
    const { sdk, dispose } = createCellSDK(host)
    sdk.registerSlot({ slot: 'shell.main', entry: 'A' })
    sdk.registerSlot({ slot: 'shell.leftNav', entry: 'B' })
    dispose()
    expect(slotsRegistered).toHaveLength(0)
    expect(sdk.isDisposed()).toBe(true)
    // double dispose is a no-op
    dispose()
    expect(sdk.isDisposed()).toBe(true)
  })

  it('every method throws after dispose', () => {
    const { host } = makeHost()
    const { sdk, dispose } = createCellSDK(host)
    dispose()
    expect(() => sdk.capability({ kind: 'filesystem.read' })).toThrow(/disposed/)
    expect(() => sdk.requireCapability({ kind: 'filesystem.read' })).toThrow(/disposed/)
    expect(() => sdk.emit({ type: 'a.b.c' })).toThrow(/disposed/)
    expect(() => sdk.registerSlot({ slot: 'x', entry: 'y' })).toThrow(/disposed/)
  })
})

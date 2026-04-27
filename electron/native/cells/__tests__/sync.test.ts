import { describe, expect, it } from 'vitest'
import {
  InMemoryCellRegistry, RecordingSink, SyncedCellRegistry,
  type CellManifest,
} from '../index.js'

const SHA256 = 'a'.repeat(64)

function makeManifest(id: string, version: string): CellManifest {
  return {
    manifestVersion: 1,
    id, version,
    class: 'tool', trustTier: 'sandboxed', title: id,
    author: { name: 'test' }, capabilities: [], slots: [], dependencies: [],
    storage: { bundle: './bundle', bundleHash: SHA256 },
  } as CellManifest
}

describe('SyncedCellRegistry', () => {
  it('outbound add tees a sync op into the sink', async () => {
    const inner = new InMemoryCellRegistry()
    const sink = new RecordingSink()
    const r = new SyncedCellRegistry(inner, sink)
    await r.add({ manifest: makeManifest('wish.tool.a', '1.0.0') })
    expect(sink.ops).toHaveLength(1)
    expect(sink.ops[0].kind).toBe('add')
    expect(sink.ops[0].fullManifest?.id).toBe('wish.tool.a')
  })

  it('outbound setStatus + remove also tee', async () => {
    const inner = new InMemoryCellRegistry()
    const sink = new RecordingSink()
    const r = new SyncedCellRegistry(inner, sink)
    await r.add({ manifest: makeManifest('a.b.c', '1.0.0') })
    await r.setStatus('a.b.c', '1.0.0', 'disabled')
    await r.remove('a.b.c', '1.0.0')
    expect(sink.ops.map(o => o.kind)).toEqual(['add', 'set-status', 'remove'])
  })

  it('outboundCountDiagnostic counts mutations', async () => {
    const r = new SyncedCellRegistry(new InMemoryCellRegistry(), new RecordingSink())
    await r.add({ manifest: makeManifest('a.b.c', '1.0.0') })
    await r.setStatus('a.b.c', '1.0.0', 'disabled')
    expect(r.outboundCountDiagnostic()).toBe(2)
  })

  it('applyPeer add inserts into inner registry idempotently', async () => {
    const inner = new InMemoryCellRegistry()
    const r = new SyncedCellRegistry(inner, new RecordingSink())
    const m = makeManifest('a.b.c', '1.0.0')
    await r.applyPeer({ kind: 'add', manifest: { id: m.id, version: m.version }, fullManifest: m })
    await r.applyPeer({ kind: 'add', manifest: { id: m.id, version: m.version }, fullManifest: m })
    expect(r.peerEventsApplied()).toBe(1)
    expect(await inner.get(m.id, m.version)).not.toBeNull()
  })

  it('applyPeer set-status applies only when changed', async () => {
    const inner = new InMemoryCellRegistry()
    const r = new SyncedCellRegistry(inner, new RecordingSink())
    await r.add({ manifest: makeManifest('a.b.c', '1.0.0') })
    await r.applyPeer({
      kind: 'set-status', manifest: { id: 'a.b.c', version: '1.0.0' }, status: 'installed',
    })
    expect(r.peerEventsApplied()).toBe(0)
    await r.applyPeer({
      kind: 'set-status', manifest: { id: 'a.b.c', version: '1.0.0' }, status: 'disabled',
    })
    expect(r.peerEventsApplied()).toBe(1)
  })

  it('applyPeer remove drops the record', async () => {
    const inner = new InMemoryCellRegistry()
    const r = new SyncedCellRegistry(inner, new RecordingSink())
    await r.add({ manifest: makeManifest('a.b.c', '1.0.0') })
    await r.applyPeer({ kind: 'remove', manifest: { id: 'a.b.c', version: '1.0.0' } })
    expect(await inner.get('a.b.c', '1.0.0')).toBeNull()
    expect(r.peerEventsApplied()).toBe(1)
  })

  it('applyPeer remove on missing record is a no-op', async () => {
    const r = new SyncedCellRegistry(new InMemoryCellRegistry(), new RecordingSink())
    await r.applyPeer({ kind: 'remove', manifest: { id: 'missing', version: '1.0.0' } })
    expect(r.peerEventsApplied()).toBe(0)
  })

  it('remove outbound only when inner removed something', async () => {
    const sink = new RecordingSink()
    const r = new SyncedCellRegistry(new InMemoryCellRegistry(), sink)
    expect(await r.remove('missing', '1.0.0')).toBe(false)
    expect(sink.ops).toHaveLength(0)
  })
})

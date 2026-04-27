import { describe, expect, it } from 'vitest'
import {
  CellForge, InMemoryCellRegistry, InMemorySignatureVerifier, TrustVerifier,
  type CellManifest,
} from '../index.js'
import { MemorySink, TelemetryEmitter } from '../../telemetry/index.js'

const SHA256 = 'a'.repeat(64)

function makeManifest(overrides: Partial<CellManifest> = {}): CellManifest {
  return {
    manifestVersion: 1,
    id: 'wish.tool.alpha', version: '1.0.0',
    class: 'tool', trustTier: 'sandboxed', title: 'A',
    author: { name: 't' }, capabilities: [], slots: [], dependencies: [],
    storage: { bundle: './bundle', bundleHash: SHA256 },
    ...overrides,
  } as CellManifest
}

describe('CellForge', () => {
  it('observePattern starts a record at stage=pattern', () => {
    const forge = new CellForge({ registry: new InMemoryCellRegistry() })
    const r = forge.observePattern('user pasted markdown table 3 times today')
    expect(r.stage).toBe('pattern')
    expect(r.history).toHaveLength(1)
  })

  it('promoteToDraft attaches a manifest', () => {
    const forge = new CellForge({ registry: new InMemoryCellRegistry() })
    const r = forge.observePattern('p')
    const d = forge.promoteToDraft(r.id, makeManifest())
    expect(d.stage).toBe('draft')
    expect(d.manifest?.id).toBe('wish.tool.alpha')
  })

  it('promoteToCandidate validates manifest and rejects on failure', () => {
    const forge = new CellForge({ registry: new InMemoryCellRegistry() })
    const r = forge.observePattern('p')
    forge.promoteToDraft(r.id, makeManifest({ id: 'bad' } as Partial<CellManifest>))
    const c = forge.promoteToCandidate(r.id)
    expect(c.stage).toBe('rejected')
    expect(c.reason).toMatch(/id/)
  })

  it('promoteToCandidate succeeds for a valid manifest', () => {
    const forge = new CellForge({ registry: new InMemoryCellRegistry() })
    const r = forge.observePattern('p')
    forge.promoteToDraft(r.id, makeManifest())
    expect(forge.promoteToCandidate(r.id).stage).toBe('candidate')
  })

  it('approve runs trust verifier; rejects on bundle hash mismatch', async () => {
    const trust = new TrustVerifier({ hashBundle: async () => 'b'.repeat(64) })
    const forge = new CellForge({ registry: new InMemoryCellRegistry(), trust })
    const r = forge.observePattern('p')
    forge.promoteToDraft(r.id, makeManifest())
    forge.promoteToCandidate(r.id)
    const a = await forge.approve(r.id)
    expect(a.stage).toBe('rejected')
    expect(a.reason).toMatch(/bundle_hash_mismatch/)
  })

  it('approve passes for a hash match', async () => {
    const trust = new TrustVerifier({ hashBundle: async () => SHA256 })
    const forge = new CellForge({ registry: new InMemoryCellRegistry(), trust })
    const r = forge.observePattern('p')
    forge.promoteToDraft(r.id, makeManifest())
    forge.promoteToCandidate(r.id)
    expect((await forge.approve(r.id)).stage).toBe('approved')
  })

  it('publish adds the manifest to the registry as installed', async () => {
    const reg = new InMemoryCellRegistry()
    const trust = new TrustVerifier({ hashBundle: async () => SHA256 })
    const forge = new CellForge({ registry: reg, trust })
    const r = forge.observePattern('p')
    forge.promoteToDraft(r.id, makeManifest())
    forge.promoteToCandidate(r.id)
    await forge.approve(r.id)
    await forge.publish(r.id)
    const installed = await reg.get('wish.tool.alpha', '1.0.0')
    expect(installed?.status).toBe('installed')
  })

  it('publish refuses non-approved stage', async () => {
    const forge = new CellForge({ registry: new InMemoryCellRegistry() })
    const r = forge.observePattern('p')
    await expect(forge.publish(r.id)).rejects.toThrow(/cannot publish/)
  })

  it('reject from any active stage produces a rejected record', () => {
    const forge = new CellForge({ registry: new InMemoryCellRegistry() })
    const r = forge.observePattern('p')
    expect(forge.reject(r.id, 'spam').stage).toBe('rejected')
  })

  it('illegal transitions throw', () => {
    const forge = new CellForge({ registry: new InMemoryCellRegistry() })
    const r = forge.observePattern('p')
    expect(() => forge.promoteToCandidate(r.id)).toThrow(/illegal/)
  })

  it('list filters by stage; emits forge.* telemetry', async () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const forge = new CellForge({ registry: new InMemoryCellRegistry(), telemetry: tel })
    const r = forge.observePattern('p')
    forge.promoteToDraft(r.id, makeManifest())
    expect(forge.list({ stage: 'draft' })).toHaveLength(1)
    expect(sink.events.some(e => e.type === 'forge.pattern.observed')).toBe(true)
    expect(sink.events.some(e => e.type === 'forge.draft')).toBe(true)
  })

  it('history records every transition', () => {
    const forge = new CellForge({ registry: new InMemoryCellRegistry() })
    const r0 = forge.observePattern('p')
    forge.promoteToDraft(r0.id, makeManifest())
    forge.promoteToCandidate(r0.id)
    const r = forge.get(r0.id)!
    expect(r.history.map(h => h.stage)).toEqual(['pattern', 'draft', 'candidate'])
  })
})

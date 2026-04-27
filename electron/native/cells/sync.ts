/**
 * Cell-7 — Sync hooks.
 *
 * Wraps a `CellRegistry` with a Hermon-mirror queue. Outbound:
 * registry mutations enqueue sync ops. Inbound: peer events apply
 * to the local registry (idempotent, last-writer-wins by `(id, version)`).
 *
 * The actual Hermon transport plugs in via the `SyncSink` interface;
 * tests use `RecordingSink`. H-13 + Cell-7.1 wire the SSE client.
 */

import type {
  CellManifest,
  CellRegistry,
  RegistryRecord,
  RegistryStatus,
} from './index.js'

export interface SyncOp {
  /** Stable id within the queue. */
  id: string
  kind: 'add' | 'set-status' | 'remove'
  /** When the op was enqueued. */
  ts: string
  manifest: { id: string; version: string }
  status?: RegistryStatus
  /** Full manifest for `add` ops; absent for `set-status` / `remove`. */
  fullManifest?: CellManifest
}

export interface SyncSink {
  /** Best-effort delivery. MUST NOT throw. */
  push(op: SyncOp): void | Promise<void>
}

export interface PeerEvent {
  kind: 'add' | 'set-status' | 'remove'
  manifest: { id: string; version: string }
  status?: RegistryStatus
  fullManifest?: CellManifest
}

let nextSeq = 0
function opId(): string {
  return `sync_${Date.now().toString(36)}_${(nextSeq++).toString(36)}`
}

/**
 * Wraps a CellRegistry with sync hooks. The registry itself is
 * untouched; this class delegates + tees outbound ops into the sink.
 */
export class SyncedCellRegistry {
  private peerCount = 0
  private outboundCount = 0

  constructor(
    public readonly inner: CellRegistry,
    public readonly sink: SyncSink,
  ) {}

  async add(input: { manifest: CellManifest; status?: RegistryStatus; installPath?: string }): Promise<RegistryRecord> {
    const rec = await this.inner.add(input)
    this.outboundCount++
    await this.sink.push({
      id: opId(),
      kind: 'add',
      ts: new Date().toISOString(),
      manifest: { id: rec.manifest.id, version: rec.manifest.version },
      status: rec.status,
      fullManifest: rec.manifest,
    })
    return rec
  }

  async setStatus(id: string, version: string, status: RegistryStatus): Promise<RegistryRecord> {
    const rec = await this.inner.setStatus(id, version, status)
    this.outboundCount++
    await this.sink.push({
      id: opId(),
      kind: 'set-status',
      ts: new Date().toISOString(),
      manifest: { id, version },
      status,
    })
    return rec
  }

  async remove(id: string, version: string): Promise<boolean> {
    const ok = await this.inner.remove(id, version)
    if (ok) {
      this.outboundCount++
      await this.sink.push({
        id: opId(),
        kind: 'remove',
        ts: new Date().toISOString(),
        manifest: { id, version },
      })
    }
    return ok
  }

  outboundCountDiagnostic(): number { return this.outboundCount }
  peerEventsApplied(): number { return this.peerCount }

  /** Apply a peer event to the inner registry. Idempotent. */
  async applyPeer(ev: PeerEvent): Promise<void> {
    if (ev.kind === 'add' && ev.fullManifest) {
      const existing = await this.inner.get(ev.manifest.id, ev.manifest.version)
      if (existing) return
      await this.inner.add({
        manifest: ev.fullManifest,
        status: ev.status ?? 'installed',
      })
      this.peerCount++
    } else if (ev.kind === 'set-status' && ev.status) {
      const existing = await this.inner.get(ev.manifest.id, ev.manifest.version)
      if (!existing) return
      if (existing.status === ev.status) return
      await this.inner.setStatus(ev.manifest.id, ev.manifest.version, ev.status)
      this.peerCount++
    } else if (ev.kind === 'remove') {
      const existing = await this.inner.get(ev.manifest.id, ev.manifest.version)
      if (!existing) return
      await this.inner.remove(ev.manifest.id, ev.manifest.version)
      this.peerCount++
    }
  }
}

/** Test sink that records every op for assertion. */
export class RecordingSink implements SyncSink {
  readonly ops: SyncOp[] = []
  push(op: SyncOp): void {
    this.ops.push(op)
  }
}

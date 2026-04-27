/**
 * Cell-4 — UI slot host (logic layer).
 *
 * The host owns the registry of `(slot id) → ordered contributions`.
 * The renderer-side shell (S-1+) then consumes `host.contributionsFor(slotId)`
 * to mount React components into reserved shell slots and Cell-defined
 * slots alike. Cell-3's SDK calls `host.register(...)` via its
 * `registerSlot` shim.
 *
 * The slot host is intentionally pure-logic — no DOM, no React. That
 * lets Cell-4 land in node tests, and lets the eventual Electron-only
 * + browser-only renderer hosts share this code unchanged.
 */

import type { TelemetryEmitter } from '../telemetry/index.js'
import { RESERVED_SHELL_SLOT_IDS } from './manifest.js'
import type { SlotContribution } from './sdk.js'

export interface SlotHostOptions {
  telemetry?: TelemetryEmitter
  /** When true, contributions to unknown shell.* slot ids are
   *  rejected. Defaults to false — Cells may still define their own
   *  custom slot ids for cross-Cell composition. */
  strictReservedShellSlots?: boolean
}

export interface RegisteredContribution extends SlotContribution {
  cellId: string
  /** Unique handle for unregistration; opaque to the caller. */
  id: string
  /** Insertion order; tiebreak when two contributions share priority. */
  seq: number
}

const RESERVED_PREFIXES = ['shell.', 'chat.', 'code.', 'task.', 'deliverable.', 'activity.']

function looksReserved(slot: string): boolean {
  return RESERVED_PREFIXES.some(p => slot.startsWith(p))
}

export class SlotHost {
  private readonly bySlot = new Map<string, RegisteredContribution[]>()
  private readonly byId = new Map<string, RegisteredContribution>()
  private nextSeq = 0
  private readonly telemetry?: TelemetryEmitter
  private readonly strict: boolean

  constructor(opts: SlotHostOptions = {}) {
    this.telemetry = opts.telemetry
    this.strict = opts.strictReservedShellSlots ?? false
  }

  register(cellId: string, c: SlotContribution): () => void {
    if (this.strict) {
      const reservedShell = c.slot.startsWith('shell.')
      if (reservedShell && !RESERVED_SHELL_SLOT_IDS.includes(c.slot)) {
        throw new Error(
          `SlotHost: unknown reserved shell slot "${c.slot}" — declare or use an open slot id`,
        )
      }
    }
    const id = `slot_${(this.nextSeq).toString(36)}`
    const reg: RegisteredContribution = {
      ...c,
      cellId,
      id,
      seq: this.nextSeq++,
      priority: c.priority ?? 100,
    }
    let bucket = this.bySlot.get(c.slot)
    if (!bucket) {
      bucket = []
      this.bySlot.set(c.slot, bucket)
    }
    bucket.push(reg)
    bucket.sort((a, b) => {
      const ap = a.priority ?? 100
      const bp = b.priority ?? 100
      if (ap !== bp) return ap - bp
      return a.seq - b.seq
    })
    this.byId.set(id, reg)
    this.telemetry?.emit({
      type: 'slot.contribution.registered',
      level: 'debug',
      attributes: {
        cellId, slot: c.slot, entry: c.entry, priority: reg.priority ?? 100,
        reserved: looksReserved(c.slot),
      },
    })
    return () => this.unregister(id)
  }

  unregister(id: string): boolean {
    const reg = this.byId.get(id)
    if (!reg) return false
    this.byId.delete(id)
    const bucket = this.bySlot.get(reg.slot)
    if (bucket) {
      const i = bucket.findIndex(r => r.id === id)
      if (i !== -1) bucket.splice(i, 1)
      if (bucket.length === 0) this.bySlot.delete(reg.slot)
    }
    this.telemetry?.emit({
      type: 'slot.contribution.unregistered',
      level: 'debug',
      attributes: { cellId: reg.cellId, slot: reg.slot, entry: reg.entry },
    })
    return true
  }

  /** Drop every contribution from a Cell. Used on Cell deactivate. */
  unregisterCell(cellId: string): number {
    let n = 0
    for (const reg of [...this.byId.values()]) {
      if (reg.cellId === cellId) {
        if (this.unregister(reg.id)) n++
      }
    }
    return n
  }

  /** Priority-ordered contributions for a slot id. */
  contributionsFor(slot: string): RegisteredContribution[] {
    const bucket = this.bySlot.get(slot)
    return bucket ? bucket.map(r => ({ ...r })) : []
  }

  /** Every slot id with at least one contribution. */
  slots(): string[] {
    return [...this.bySlot.keys()].sort()
  }

  /** Total contributions across every slot (diagnostic). */
  size(): number {
    return this.byId.size
  }

  /** True iff `slot` is a reserved shell slot id (CONVENTIONS § 7). */
  isReservedShellSlot(slot: string): boolean {
    return RESERVED_SHELL_SLOT_IDS.includes(slot)
  }
}

/**
 * C-4 — CoAgent team knowledge.
 *
 * Joins the family as `knowledge` and publishes `knowledge.cited`
 * whenever a member surfaces a `ProvenanceRef`. Wraps the K-3
 * `ProvenanceStore` so the bus carries citation events for every
 * material agent action.
 */

import type { ProvenanceRef, ProvenanceStore } from '../knowledge/index.js'
import type { CoAgentBus, CoAgentCore } from './bus.js'
import type {
  CoAgentEventKind,
  CoAgentMember,
  JoinResult,
} from './types.js'

const SUBSCRIBES: CoAgentEventKind[] = ['knowledge.cited']

export interface TeamKnowledgeOptions {
  applyPeerEvents?: boolean
}

export class CoAgentTeamKnowledge {
  private join: JoinResult | null = null
  private readonly bus: CoAgentBus
  private readonly applyPeer: boolean
  /** Cited refs counted per source id — useful for "most cited" UI. */
  private readonly citationCounts = new Map<string, number>()
  private peerCount = 0

  constructor(
    public readonly provenance: ProvenanceStore,
    coreOrBus: CoAgentCore | CoAgentBus,
    opts: TeamKnowledgeOptions = {},
  ) {
    this.bus = 'bus' in coreOrBus ? coreOrBus.bus : coreOrBus
    this.applyPeer = opts.applyPeerEvents ?? false
  }

  attach(): void {
    if (this.join) return
    const member: CoAgentMember = {
      role: 'knowledge', label: 'CoAgent team knowledge', subscribes: SUBSCRIBES,
    }
    this.join = this.bus.join(member, ev => this.onEvent(ev))
  }

  detach(): void {
    if (!this.join) return
    this.join.leave()
    this.join = null
  }

  isAttached(): boolean { return !!this.join }
  peerEventsApplied(): number { return this.peerCount }

  /** Record a citation in K-3 + publish to the bus. */
  async cite(input: {
    actionKind: string
    actionId: string
    author: string
    refs: ProvenanceRef[]
  }): Promise<{ recordId: string }> {
    const rec = await this.provenance.record({
      actionKind: input.actionKind,
      actionId: input.actionId,
      author: input.author,
      refs: input.refs,
    })
    for (const r of input.refs) {
      this.citationCounts.set(r.sourceId, (this.citationCounts.get(r.sourceId) ?? 0) + 1)
    }
    if (this.join) {
      this.join.publish({
        kind: 'knowledge.cited',
        payload: {
          recordId: rec.id,
          actionKind: input.actionKind,
          actionId: input.actionId,
          author: input.author,
          sourceIds: input.refs.map(r => r.sourceId),
        },
      })
    }
    return { recordId: rec.id }
  }

  /** Diagnostic: how many times has each source been cited locally? */
  citationCount(sourceId: string): number {
    return this.citationCounts.get(sourceId) ?? 0
  }

  topCitedSources(limit = 10): Array<{ sourceId: string; count: number }> {
    const out: Array<{ sourceId: string; count: number }> = []
    for (const [sourceId, count] of this.citationCounts) {
      out.push({ sourceId, count })
    }
    out.sort((a, b) => b.count - a.count)
    return out.slice(0, limit)
  }

  private onEvent(ev: { source: string; kind: CoAgentEventKind; payload: Record<string, unknown> }): void {
    if (!this.applyPeer) return
    if (ev.source === 'knowledge') return
    const ids = ev.payload.sourceIds
    if (Array.isArray(ids)) {
      for (const id of ids) {
        if (typeof id === 'string') {
          this.citationCounts.set(id, (this.citationCounts.get(id) ?? 0) + 1)
        }
      }
      this.peerCount++
    }
  }
}

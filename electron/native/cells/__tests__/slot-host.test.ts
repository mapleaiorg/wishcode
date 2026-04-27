/**
 * Cell-4 — SlotHost tests.
 */

import { describe, expect, it } from 'vitest'
import { SlotHost } from '../index.js'
import { MemorySink, TelemetryEmitter } from '../../telemetry/index.js'

describe('SlotHost', () => {
  it('register + contributionsFor returns the registered entry', () => {
    const h = new SlotHost()
    h.register('wish.tool.alpha', { slot: 'shell.main', entry: 'AlphaView' })
    const contribs = h.contributionsFor('shell.main')
    expect(contribs).toHaveLength(1)
    expect(contribs[0].cellId).toBe('wish.tool.alpha')
    expect(contribs[0].entry).toBe('AlphaView')
    expect(contribs[0].priority).toBe(100)
  })

  it('orders contributions by priority ascending', () => {
    const h = new SlotHost()
    h.register('a', { slot: 's', entry: 'late', priority: 200 })
    h.register('b', { slot: 's', entry: 'early', priority: 50 })
    h.register('c', { slot: 's', entry: 'mid', priority: 100 })
    expect(h.contributionsFor('s').map(c => c.entry)).toEqual([
      'early', 'mid', 'late',
    ])
  })

  it('uses insertion order as priority tiebreak', () => {
    const h = new SlotHost()
    h.register('a', { slot: 's', entry: 'first' })
    h.register('b', { slot: 's', entry: 'second' })
    h.register('c', { slot: 's', entry: 'third' })
    expect(h.contributionsFor('s').map(c => c.entry)).toEqual([
      'first', 'second', 'third',
    ])
  })

  it('returned disposer unregisters one contribution', () => {
    const h = new SlotHost()
    h.register('a', { slot: 's', entry: 'A' })
    const off = h.register('b', { slot: 's', entry: 'B' })
    off()
    expect(h.contributionsFor('s').map(c => c.entry)).toEqual(['A'])
  })

  it('unregisterCell drops every contribution from a cell', () => {
    const h = new SlotHost()
    h.register('a', { slot: 's1', entry: 'A1' })
    h.register('a', { slot: 's2', entry: 'A2' })
    h.register('b', { slot: 's1', entry: 'B1' })
    expect(h.unregisterCell('a')).toBe(2)
    expect(h.contributionsFor('s1').map(c => c.entry)).toEqual(['B1'])
    expect(h.contributionsFor('s2')).toEqual([])
  })

  it('removing the last contribution drops the slot from slots()', () => {
    const h = new SlotHost()
    const off = h.register('a', { slot: 'orphan', entry: 'X' })
    expect(h.slots()).toContain('orphan')
    off()
    expect(h.slots()).not.toContain('orphan')
  })

  it('isReservedShellSlot recognises the canonical reserved ids', () => {
    const h = new SlotHost()
    expect(h.isReservedShellSlot('shell.leftNav')).toBe(true)
    expect(h.isReservedShellSlot('shell.commandPalette')).toBe(true)
    expect(h.isReservedShellSlot('chat.messageToolbar')).toBe(true)
    expect(h.isReservedShellSlot('cell.alpha.custom')).toBe(false)
  })

  it('strict mode rejects unknown shell.* slot ids', () => {
    const h = new SlotHost({ strictReservedShellSlots: true })
    expect(() =>
      h.register('a', { slot: 'shell.somethingNew', entry: 'X' }),
    ).toThrow(/unknown reserved/)
  })

  it('strict mode permits user-defined slot ids', () => {
    const h = new SlotHost({ strictReservedShellSlots: true })
    h.register('a', { slot: 'cell.alpha.panel', entry: 'X' })
    expect(h.contributionsFor('cell.alpha.panel')).toHaveLength(1)
  })

  it('non-strict mode permits any slot id', () => {
    const h = new SlotHost()
    h.register('a', { slot: 'shell.experimental', entry: 'X' })
    expect(h.contributionsFor('shell.experimental')).toHaveLength(1)
  })

  it('register emits slot.contribution.registered telemetry', () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const h = new SlotHost({ telemetry: tel })
    h.register('a', { slot: 'shell.main', entry: 'X' })
    expect(sink.events.some(e => e.type === 'slot.contribution.registered')).toBe(true)
  })

  it('unregister emits slot.contribution.unregistered telemetry', () => {
    const sink = new MemorySink()
    const tel = new TelemetryEmitter()
    tel.addSink(sink)
    const h = new SlotHost({ telemetry: tel })
    const off = h.register('a', { slot: 'shell.main', entry: 'X' })
    off()
    expect(sink.events.some(e => e.type === 'slot.contribution.unregistered')).toBe(true)
  })

  it('returns deep copies on contributionsFor (caller mutation isolation)', () => {
    const h = new SlotHost()
    h.register('a', { slot: 's', entry: 'X', priority: 50 })
    const c = h.contributionsFor('s')[0]
    c.priority = 999
    expect(h.contributionsFor('s')[0].priority).toBe(50)
  })

  it('size() reports total registered contributions', () => {
    const h = new SlotHost()
    h.register('a', { slot: 's1', entry: 'X' })
    h.register('a', { slot: 's2', entry: 'Y' })
    expect(h.size()).toBe(2)
  })

  it('unregister of a stale id returns false', () => {
    const h = new SlotHost()
    expect(h.unregister('not-a-real-id')).toBe(false)
  })
})

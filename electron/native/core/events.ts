/**
 * Global event bus — how native modules notify the renderer.
 *
 * Every emit is fanned out to all subscribed BrowserWindows via IPC.
 * Renderer subscribes once at app boot through the preload's
 * `window.ibank.*.onX(cb)` subscription methods.
 *
 * Channels (shape defined by each emitter):
 *   auth.oauthComplete   { success, provider, error? }
 *   chat.delta           { requestId, text }
 *   chat.toolUse         { requestId, name, input, result? }
 *   chat.toolResult      { requestId, name, result }
 *   chat.thinking        { requestId, text }
 *   chat.done            { requestId, usage, stopReason }
 *   chat.error           { requestId, error }
 *   buddy.update         { mood, notifications }
 *   tasks.update         { id, task }
 *   wallet.lockChanged   { unlocked }
 *   trading.price        { symbol, price, ts }
 *   log.entry            { ts, level, scope, msg }
 */

import { EventEmitter } from 'events'

class Bus extends EventEmitter {
  constructor() {
    super()
    // No practical limit — many subscribers across main-process modules.
    this.setMaxListeners(0)
  }
}

export const bus = new Bus()

export type BusChannel =
  | 'auth.oauthComplete'
  | 'chat.delta'
  | 'chat.toolUse'
  | 'chat.toolResult'
  | 'chat.thinking'
  | 'chat.done'
  | 'chat.error'
  | 'buddy.update'
  | 'tasks.update'
  | 'wallet.lockChanged'
  | 'trading.price'
  | 'log.entry'
  | 'query.status'
  | 'app.quit'
  | 'skills.changed'
  | 'memory.changed'
  | 'tasks.changed'
  | 'nft.updated'
  | 'cryptoBuddies.updated'
  | 'financialBuddies.updated'
  | 'harness.progress'
  | 'harness.result'

export function emit(channel: BusChannel, payload: any): void {
  bus.emit(channel, payload)
  bus.emit('*', channel, payload)
}

export function on(channel: BusChannel, cb: (payload: any) => void): () => void {
  bus.on(channel, cb)
  return () => bus.off(channel, cb)
}

/** Subscribe to every channel at once (used by the IPC fan-out). */
export function onAny(cb: (channel: BusChannel, payload: any) => void): () => void {
  const wrapped = (ch: BusChannel, p: any) => cb(ch, p)
  bus.on('*', wrapped as any)
  return () => bus.off('*', wrapped as any)
}

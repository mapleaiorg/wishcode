/**
 * Wish Code IPC — channel name builders.
 *
 * Existing wishcode channels are colon-separated (`wish:auth:status`); D-0
 * keeps that format so the D-1 preload migration is a one-line swap. The
 * shape is `wish:<domain>:<action>`, where `<action>` is camelCase to match
 * the existing 60 channels in `electron/main.ts`.
 */

const CHANNEL_RE = /^wish:([a-z][a-zA-Z0-9-]*):([a-zA-Z][a-zA-Z0-9]*)$/

export function channel(domain: string, action: string): string {
  const id = `wish:${domain}:${action}`
  if (!CHANNEL_RE.test(id)) {
    throw new Error(`invalid channel id: ${id}`)
  }
  return id
}

export function parseChannel(raw: string): { domain: string; action: string } | null {
  const m = CHANNEL_RE.exec(raw)
  if (!m || !m[1] || !m[2]) return null
  return { domain: m[1], action: m[2] }
}

export function isWishChannel(raw: string): boolean {
  return CHANNEL_RE.test(raw)
}

/** Event-channel naming: main fans out via `wish:event:<topic>`. */
const EVENT_RE = /^wish:event:([a-zA-Z][a-zA-Z0-9.-]*)$/
export function eventChannel(topic: string): string {
  const id = `wish:event:${topic}`
  if (!EVENT_RE.test(id)) {
    throw new Error(`invalid event channel: ${id}`)
  }
  return id
}

export function parseEventChannel(raw: string): { topic: string } | null {
  const m = EVENT_RE.exec(raw)
  if (!m || !m[1]) return null
  return { topic: m[1] }
}

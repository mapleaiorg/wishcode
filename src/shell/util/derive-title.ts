/**
 * Derive a short, human-readable conversation title from its first user
 * message. Pulled out of `src/App.tsx` during S-0 so it has its own home
 * and can be unit-tested in isolation.
 */

import type { Message } from '../../types'

export function deriveTitleFromMessages(messages: readonly Message[]): string | null {
  for (const m of messages) {
    if (m.role !== 'user') continue
    for (const b of m.content) {
      const text = (b as { type?: string; text?: unknown }).type === 'text'
        ? String((b as { text?: unknown }).text ?? '')
        : ''
      const first = text.split('\n').map((s) => s.trim()).find((s) => s.length > 0)
      if (!first) continue
      // Strip leading slash-commands like "/new " or "/explain ".
      const stripped = first.replace(/^\/[a-z][\w-]*\s+/i, '').trim()
      const source = stripped.length > 0 ? stripped : first
      let t = source.replace(/\s+/g, ' ').trim()
      if (t.length > 48) t = t.slice(0, 48).replace(/[\s.,;:!?-]+$/, '') + '…'
      return t || null
    }
  }
  return null
}

export function newConversationId(): string {
  return `conv_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
}

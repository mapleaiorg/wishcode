/**
 * Conversation list state — extracted from `src/App.tsx`.
 *
 * Conversations are renderer-local for now; later prompts (D-2 / Mem-0 / S-1)
 * will move them behind a service. Preserved exactly: defaulting to a single
 * empty "New conversation" on mount, auto-keeping `activeId` alive when the
 * active conversation is removed.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Conversation, Message } from '../../types'
import { newConversationId } from '../util/derive-title'

export function makeNewConversation(): Conversation {
  const now = Date.now()
  return {
    id: newConversationId(),
    title: 'New conversation',
    createdAt: now,
    updatedAt: now,
    pinned: false,
    messages: [],
  }
}

export interface ConversationsApi {
  conversations: Conversation[]
  active: Conversation | null
  activeId: string | null
  setActiveId(id: string | null): void

  createNew(): Conversation
  remove(id: string): void
  rename(id: string, title: string): void
  togglePinned(id: string): void
  toggleArchived(id: string): void

  update(id: string, partial: Partial<Conversation>): void
  mutateMessages(id: string, fn: (prev: Message[]) => Message[]): void
}

export function useConversations(): ConversationsApi {
  const [conversations, setConversations] = useState<Conversation[]>(() => [makeNewConversation()])
  const [activeId, setActiveId] = useState<string | null>(() => conversations[0]?.id ?? null)

  const active = useMemo(
    () => conversations.find((c) => c.id === activeId) ?? null,
    [conversations, activeId],
  )

  // Keep active id pointing at SOMETHING whenever there are conversations.
  useEffect(() => {
    if (activeId) return
    if (conversations[0]) setActiveId(conversations[0].id)
  }, [activeId, conversations])

  const createNew = useCallback((): Conversation => {
    const c = makeNewConversation()
    setConversations((prev) => [c, ...prev])
    setActiveId(c.id)
    return c
  }, [])

  const remove = useCallback((id: string) => {
    setConversations((prev) => {
      const next = prev.filter((c) => c.id !== id)
      if (next.length === 0) return [makeNewConversation()]
      return next
    })
    setActiveId((cur) => (cur === id ? null : cur))
  }, [])

  const rename = useCallback((id: string, title: string) => {
    const nextTitle = title.trim() || 'New conversation'
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, title: nextTitle } : c)))
  }, [])

  const togglePinned = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, pinned: !c.pinned } : c)))
  }, [])

  const toggleArchived = useCallback((id: string) => {
    setConversations((prev) => prev.map((c) => (c.id === id ? { ...c, archived: !c.archived } : c)))
  }, [])

  const update = useCallback((id: string, partial: Partial<Conversation>) => {
    setConversations((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const nextMessages = partial.messages ?? c.messages
      const nextUpdatedAt = partial.updatedAt
        ?? (partial.messages
          ? nextMessages[nextMessages.length - 1]?.ts ?? Date.now()
          : c.updatedAt ?? c.createdAt)
      return { ...c, ...partial, messages: nextMessages, updatedAt: nextUpdatedAt }
    }))
  }, [])

  const mutateMessages = useCallback((id: string, fn: (prev: Message[]) => Message[]) => {
    setConversations((prev) => prev.map((c) => {
      if (c.id !== id) return c
      const next = fn(c.messages)
      const lastTs = next[next.length - 1]?.ts ?? c.updatedAt ?? c.createdAt
      return { ...c, messages: next, updatedAt: lastTs }
    }))
  }, [])

  return {
    conversations,
    active,
    activeId,
    setActiveId,
    createNew,
    remove,
    rename,
    togglePinned,
    toggleArchived,
    update,
    mutateMessages,
  }
}

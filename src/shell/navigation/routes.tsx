/**
 * View routing table for the Wish Code shell (S-0).
 *
 * The shell currently mounts three native views — Home, Chat, History.
 * Native Chat and Native Code are deferred to S-1 / S-2; the shell exposes a
 * `mountPoints` map so those prompts can register their surfaces without
 * touching `App.tsx` again. Until then, routes that point to deferred
 * surfaces fall back to a clearly-labelled placeholder rather than crashing.
 */

import React from 'react'
import type { ViewKey } from '../types'
import type { Conversation, Message } from '../../types'
import { ChatView } from '../../components/ChatView'
import { HomeView } from '../../features/home/HomeView'
import { HistoryView } from '../../features/history/HistoryView'

export interface ChatRouteContext {
  active: Conversation | null
  onUpdate(partial: Partial<Conversation>): void
  onMutateMessages(fn: (prev: Message[]) => Message[]): void
}

export interface RouteRenderArgs {
  view: ViewKey
  chatContext: ChatRouteContext
}

/**
 * Render the view for the current route. Pure function — no side effects —
 * so the navigation layer can be tested without React hooks.
 */
export function renderView({ view, chatContext }: RouteRenderArgs): React.ReactElement | null {
  switch (view) {
    case 'home':
      return <HomeView />
    case 'history':
      return <HistoryView />
    case 'chat':
      return chatContext.active ? (
        <ChatView
          conversation={chatContext.active}
          onUpdate={chatContext.onUpdate}
          onMutateMessages={chatContext.onMutateMessages}
        />
      ) : null
  }
}

/**
 * Reserved registration map for surfaces that the shell has not implemented
 * yet (Native Chat in S-1, Native Code in S-2). Adding entries here is the
 * supported way for those prompts to plug into the shell — no change to
 * `AppShell.tsx` required at the registration point.
 */
export const deferredSurfaces = {
  nativeChat: 'TODO(wish:S-1): native chat surface',
  nativeCode: 'TODO(wish:S-2): native code surface',
} as const

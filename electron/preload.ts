/**
 * WishCode — Preload (contextIsolation + sandbox)
 *
 * Exposes a single `window.wish` surface to the renderer. Every method
 * routes through `invoke<channel>()`, which:
 *   1. asks main for the protocol version (lazy, once) and throws
 *      `WishError("protocol_violation")` on mismatch with
 *      {@link IPC_PROTOCOL_VERSION},
 *   2. invokes the channel handler over `ipcRenderer.invoke`,
 *   3. unwraps the legacy `{ ok, value | error }` envelope (D-2 will
 *      flip this to the canonical `{ ok, data | error }` shape),
 *   4. validates `value` against the registry's response schema, and
 *   5. throws `WishError("protocol_violation")` when validation fails.
 *
 * Event subscriptions use `ipcRenderer.on('wish:event:<topic>')` and
 * return an unsubscribe function. Events are not validated here yet —
 * D-2 lands strict event validation alongside main-process publishing.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

import {
  IPC_PROTOCOL_VERSION,
  PROTO_VERSION_CHANNEL,
} from './shared/ipc/version'
import { WishError } from './shared/ipc/error'
import { getChannelEntry } from './shared/ipc/registry'

type LegacyOk<T> = { ok: true; value: T }
type LegacyErr = { ok: false; error: string | { code?: string; message?: string; retryable?: boolean; cause?: string } }
type LegacyResult<T> = LegacyOk<T> | LegacyErr

// ── protocol-version handshake ───────────────────────────────────────
// Fired lazily on the first invoke so unit tests that mock `ipcRenderer`
// per-channel can opt in or out cleanly. Result memoised regardless of
// outcome.

let handshakePromise: Promise<void> | null = null

async function ensureProtocolVersion(): Promise<void> {
  if (handshakePromise) return handshakePromise
  handshakePromise = (async () => {
    let raw: unknown
    try {
      raw = await ipcRenderer.invoke(PROTO_VERSION_CHANNEL)
    } catch (cause) {
      // Main hasn't migrated yet (pre-D-2). Tolerate; D-2 makes this strict.
      // eslint-disable-next-line no-console
      console.warn('[wish:proto] handshake unavailable, assuming v1 main', cause)
      return
    }
    // Accept either the canonical envelope or the legacy {ok, value} shape.
    const envelope = raw as
      | { ok: true; data?: { version?: number }; value?: { version?: number } }
      | { ok: false; error: unknown }
      | null
      | undefined
    if (!envelope || envelope.ok !== true) {
      // eslint-disable-next-line no-console
      console.warn('[wish:proto] handshake refused; running with legacy main')
      return
    }
    const remote = (envelope.data?.version ?? envelope.value?.version) as number | undefined
    if (typeof remote !== 'number') {
      // eslint-disable-next-line no-console
      console.warn('[wish:proto] handshake response missing version, skipping')
      return
    }
    if (remote !== IPC_PROTOCOL_VERSION) {
      throw new WishError(
        'protocol_violation',
        `IPC protocol version mismatch: renderer=${IPC_PROTOCOL_VERSION} main=${remote}`,
        { retryable: false },
      )
    }
  })()
  return handshakePromise
}

// ── invoke ───────────────────────────────────────────────────────────

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  await ensureProtocolVersion()

  const raw = (await ipcRenderer.invoke(channel, ...args)) as LegacyResult<T> | undefined

  if (!raw || typeof raw !== 'object' || !('ok' in raw)) {
    throw new WishError(
      'protocol_violation',
      `IPC channel "${channel}" returned a non-envelope payload`,
      { retryable: false },
    )
  }

  if (raw.ok === false) {
    const e = raw.error
    if (typeof e === 'string') {
      throw new WishError('ipc.handler_threw', e, { retryable: false })
    }
    throw new WishError(
      e?.code ?? 'ipc.handler_threw',
      e?.message ?? 'IPC handler returned an error',
      {
        retryable: e?.retryable ?? false,
        ...(e?.cause !== undefined ? { cause: e.cause } : {}),
      },
    )
  }

  // Validate response payload against the registry's schema.
  const entry = getChannelEntry(channel)
  if (!entry) {
    throw new WishError(
      'protocol_violation',
      `IPC channel "${channel}" is not in the registry`,
      { retryable: false },
    )
  }
  const parsed = entry.response.safeParse(raw.value)
  if (!parsed.success) {
    throw new WishError(
      'protocol_violation',
      `IPC channel "${channel}" response failed schema validation: ${parsed.error.message}`,
      { retryable: false, cause: JSON.stringify(parsed.error.flatten()) },
    )
  }
  return parsed.data as T
}

function subscribe(channel: string, cb: (payload: unknown) => void): () => void {
  const listener = (_: IpcRendererEvent, payload: unknown) => cb(payload)
  ipcRenderer.on(`wish:event:${channel}`, listener)
  return () => { ipcRenderer.off(`wish:event:${channel}`, listener) }
}

// ── api surface ──────────────────────────────────────────────────────
// Same shape as v0; every call now runs through the validating invoke.

const api = {
  app: {
    version: () => invoke<{ version: string }>('wish:app:version'),
    paths: () => invoke<Record<string, string>>('wish:app:paths'),
    quit: () => invoke<void>('wish:app:quit'),
    openExternal: (url: string) => invoke<void>('wish:app:openExternal', url),
    logs: (limit?: number) => invoke<Array<{ ts: number; level: string; scope: string; msg: string }>>('wish:app:logs', limit),
    onLog: (cb: (entry: any) => void) => subscribe('log.entry', cb as (p: unknown) => void),
  },
  config: {
    get: (key?: string) => invoke<any>('wish:config:get', key),
    set: (key: string, value: unknown) => invoke<true>('wish:config:set', key, value),
  },
  auth: {
    status: () => invoke<Array<any>>('wish:auth:status'),
    login: (provider: string, creds?: Record<string, unknown>) =>
      invoke<any>('wish:auth:login', provider, creds),
    logout: (provider: string) => invoke<void>('wish:auth:logout', provider),
    oauthStart: () => invoke<{ manualUrl: string; automaticUrl: string }>('wish:auth:oauthStart'),
    oauthSubmitCode: (code: string) => invoke<void>('wish:auth:oauthSubmitCode', code),
    oauthCancel: () => invoke<void>('wish:auth:oauthCancel'),
    onOAuthComplete: (cb: (payload: any) => void) => subscribe('auth.oauthComplete', cb as (p: unknown) => void),
  },
  model: {
    list: () => invoke<Array<any>>('wish:model:list'),
    set: (provider: string, name: string) => invoke<{ provider: string; model: string }>('wish:model:set', provider, name),
    current: () => invoke<{ provider: string; model: string }>('wish:model:current'),
    onChanged: (
      cb: (payload: {
        from: { provider: string; model: string }
        to: { provider: string; model: string }
        ts: number
      }) => void,
    ) => subscribe('model.changed', cb as (p: unknown) => void),
  },
  memory: {
    add: (body: string, opts?: { tags?: string[]; pinned?: boolean }) =>
      invoke<any>('wish:memory:add', { body, ...opts }),
    list: () => invoke<Array<any>>('wish:memory:list'),
    remove: (id: string) => invoke<boolean>('wish:memory:remove', id),
    update: (id: string, patch: any) => invoke<any>('wish:memory:update', id, patch),
    recall: (query: string, limit?: number) => invoke<Array<any>>('wish:memory:recall', query, limit),
    onChanged: (cb: () => void) => subscribe('memory.changed', () => cb()),
  },
  skills: {
    list: () => invoke<Array<any>>('wish:skills:list'),
    reload: () => invoke<Array<any>>('wish:skills:reload'),
    install: (name: string, markdown: string) => invoke<any>('wish:skills:install', name, markdown),
    uninstall: (name: string) => invoke<boolean>('wish:skills:uninstall', name),
  },
  commands: {
    list: () =>
      invoke<Array<{ name: string; summary: string; category: string; usage?: string; aliases: string[] }>>(
        'wish:commands:list',
      ),
    run: (sessionId: string, input: string) => invoke<any>('wish:commands:run', sessionId, input),
  },
  chat: {
    send: (sessionId: string, requestId: string, text: string, permission?: string) =>
      invoke<any>('wish:chat:send', sessionId, requestId, text, permission),
    abort: (requestId: string) => invoke<boolean>('wish:chat:abort', requestId),
    onDelta: (cb: (payload: { requestId: string; text: string }) => void) => subscribe('chat.delta', cb as (p: unknown) => void),
    onThinking: (cb: (payload: { requestId: string; text: string }) => void) => subscribe('chat.thinking', cb as (p: unknown) => void),
    onToolUse: (cb: (payload: any) => void) => subscribe('chat.toolUse', cb as (p: unknown) => void),
    onToolResult: (cb: (payload: any) => void) => subscribe('chat.toolResult', cb as (p: unknown) => void),
    onDone: (cb: (payload: { requestId: string; usage: any; stopReason: string }) => void) =>
      subscribe('chat.done', cb as (p: unknown) => void),
    onError: (cb: (payload: { requestId: string; error: string }) => void) => subscribe('chat.error', cb as (p: unknown) => void),
    onStatus: (cb: (payload: any) => void) => subscribe('query.status', cb as (p: unknown) => void),
  },
  session: {
    read: (sessionId: string) => invoke<Array<any>>('wish:session:read', sessionId),
    clear: (sessionId: string) => invoke<void>('wish:session:clear', sessionId),
    compact: (sessionId: string, keepRecent?: number) =>
      invoke<{ droppedTurns: number; summaryChars: number }>('wish:session:compact', sessionId, keepRecent),
    export: (sessionId: string, fmt: 'markdown' | 'json') =>
      invoke<string>('wish:session:export', sessionId, fmt),
  },
  tasks: {
    list: () => invoke<Array<any>>('wish:tasks:list'),
    cancel: (id: string) => invoke<boolean>('wish:tasks:cancel', id),
    remove: (id: string) => invoke<boolean>('wish:tasks:remove', id),
    clearCompleted: () => invoke<number>('wish:tasks:clearCompleted'),
    onUpdate: (cb: (payload: { id: string; task: any }) => void) => subscribe('tasks.update', cb as (p: unknown) => void),
    onChanged: (cb: (payload: { runningCount: number; total: number }) => void) =>
      subscribe('tasks.changed', cb as (p: unknown) => void),
  },
  swarm: {
    run: (brief: string) => invoke<any>('wish:swarm:run', brief),
  },
  buddy: {
    get: () => invoke<any>('wish:buddy:get'),
    dismiss: (id: string) => invoke<void>('wish:buddy:dismiss', id),
    onUpdate: (cb: (payload: any) => void) => subscribe('buddy.update', cb as (p: unknown) => void),
  },
  tools: {
    list: () => invoke<Array<{
      name: string; title: string; description: string; category: string;
      permission: 'auto' | 'ask' | 'plan' | 'bypass'; dangerous: boolean; inputSchema: any;
    }>>('wish:tools:list'),
  },
  askUser: {
    onQuestion: (cb: (payload: {
      requestId: string; sessionId: string; question: string;
      options: string[]; allowFreeText: boolean;
    }) => void) => subscribe('tool.askUser', cb as (p: unknown) => void),
    answer: (requestId: string, answer: { choice: string; text?: string }) =>
      invoke<boolean>('wish:askUser:answer', requestId, answer),
  },
  workspace: {
    get: () => invoke<string>('wish:workspace:get'),
    set: (dir: string) => invoke<string>('wish:workspace:set', dir),
  },
  todos: {
    get: (sessionId: string) => invoke<Array<{
      content: string; activeForm: string; status: 'pending' | 'in_progress' | 'completed';
    }>>('wish:todos:get', sessionId),
  },
  mcp: {
    servers: () => invoke<Array<any>>('wish:mcp:servers'),
    tools: () => invoke<Array<any>>('wish:mcp:tools'),
    resources: () => invoke<Array<any>>('wish:mcp:resources'),
    callTool: (server: string, tool: string, args?: any) =>
      invoke<any>('wish:mcp:callTool', server, tool, args),
    readResource: (server: string, uri: string) =>
      invoke<any>('wish:mcp:readResource', server, uri),
    shutdown: () => invoke<void>('wish:mcp:shutdown'),
  },
  cron: {
    list: () => invoke<Array<any>>('wish:cron:list'),
    create: (input: { name: string; expression: string; prompt: string }) =>
      invoke<any>('wish:cron:create', input),
    update: (id: string, patch: any) => invoke<any>('wish:cron:update', id, patch),
    delete: (id: string) => invoke<boolean>('wish:cron:delete', id),
    runNow: (id: string) => invoke<{ taskId: string | null }>('wish:cron:runNow', id),
  },
  hooks: {
    read: () => invoke<{ file: string; content: string }>('wish:hooks:read'),
    write: (content: string) => invoke<{ file: string }>('wish:hooks:write', content),
  },
} as const

export type WishApi = typeof api

// Internal hook for unit tests (resets the lazy handshake state).
// Not exposed on `window.wish` and stripped in production main bundles.
export const __testing__ = {
  resetHandshake() {
    handshakePromise = null
  },
  invoke,
  ensureProtocolVersion,
}

contextBridge.exposeInMainWorld('wish', api)

/**
 * WishCode — Preload (contextIsolation + sandbox)
 *
 * Exposes a single `window.wish` surface to the renderer. Every method maps
 * to one `ipcMain.handle(wish:*)` channel in main.ts. Event subscriptions
 * use `ipcRenderer.on('wish:event:<channel>')` and return an unsubscribe
 * function.
 */

import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron'

type IpcResult<T> = { ok: true; value: T } | { ok: false; error: string }

async function invoke<T = unknown>(channel: string, ...args: unknown[]): Promise<T> {
  const res = (await ipcRenderer.invoke(channel, ...args)) as IpcResult<T>
  if (!res.ok) throw new Error(res.error)
  return res.value
}

function subscribe(channel: string, cb: (payload: any) => void): () => void {
  const listener = (_: IpcRendererEvent, payload: any) => cb(payload)
  ipcRenderer.on(`wish:event:${channel}`, listener)
  return () => { ipcRenderer.off(`wish:event:${channel}`, listener) }
}

const api = {
  app: {
    version: () => invoke<{ version: string }>('wish:app:version'),
    paths: () => invoke<Record<string, string>>('wish:app:paths'),
    quit: () => invoke<void>('wish:app:quit'),
    openExternal: (url: string) => invoke<void>('wish:app:openExternal', url),
    logs: (limit?: number) => invoke<Array<{ ts: number; level: string; scope: string; msg: string }>>('wish:app:logs', limit),
    onLog: (cb: (entry: any) => void) => subscribe('log.entry', cb),
  },
  config: {
    get: (key?: string) => invoke<any>('wish:config:get', key),
    set: (key: string, value: unknown) => invoke<boolean>('wish:config:set', key, value),
  },
  auth: {
    status: () => invoke<Array<any>>('wish:auth:status'),
    login: (provider: string, creds?: Record<string, unknown>) =>
      invoke<any>('wish:auth:login', provider, creds),
    logout: (provider: string) => invoke<void>('wish:auth:logout', provider),
    oauthStart: () => invoke<{ manualUrl: string; automaticUrl: string }>('wish:auth:oauthStart'),
    oauthSubmitCode: (code: string) => invoke<void>('wish:auth:oauthSubmitCode', code),
    oauthCancel: () => invoke<void>('wish:auth:oauthCancel'),
    onOAuthComplete: (cb: (payload: any) => void) => subscribe('auth.oauthComplete', cb),
  },
  model: {
    list: () => invoke<Array<any>>('wish:model:list'),
    set: (provider: string, name: string) => invoke<void>('wish:model:set', provider, name),
    current: () => invoke<{ provider: string; model: string }>('wish:model:current'),
    onChanged: (
      cb: (payload: {
        from: { provider: string; model: string }
        to: { provider: string; model: string }
        ts: number
      }) => void,
    ) => subscribe('model.changed', cb),
  },
  memory: {
    add: (body: string, opts?: { tags?: string[]; pinned?: boolean }) =>
      invoke<any>('wish:memory:add', { body, ...opts }),
    list: () => invoke<Array<any>>('wish:memory:list'),
    remove: (id: string) => invoke<boolean>('wish:memory:remove', id),
    update: (id: string, patch: any) => invoke<any>('wish:memory:update', id, patch),
    recall: (query: string, limit?: number) => invoke<Array<any>>('wish:memory:recall', query, limit),
    onChanged: (cb: () => void) => subscribe('memory.changed', cb),
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
    onDelta: (cb: (payload: { requestId: string; text: string }) => void) => subscribe('chat.delta', cb),
    onThinking: (cb: (payload: { requestId: string; text: string }) => void) => subscribe('chat.thinking', cb),
    onToolUse: (cb: (payload: any) => void) => subscribe('chat.toolUse', cb),
    onToolResult: (cb: (payload: any) => void) => subscribe('chat.toolResult', cb),
    onDone: (cb: (payload: { requestId: string; usage: any; stopReason: string }) => void) =>
      subscribe('chat.done', cb),
    onError: (cb: (payload: { requestId: string; error: string }) => void) => subscribe('chat.error', cb),
    onStatus: (cb: (payload: any) => void) => subscribe('query.status', cb),
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
    onUpdate: (cb: (payload: { id: string; task: any }) => void) => subscribe('tasks.update', cb),
    onChanged: (cb: (payload: { runningCount: number; total: number }) => void) =>
      subscribe('tasks.changed', cb),
  },
  swarm: {
    run: (brief: string) => invoke<any>('wish:swarm:run', brief),
  },
  buddy: {
    get: () => invoke<any>('wish:buddy:get'),
    dismiss: (id: string) => invoke<void>('wish:buddy:dismiss', id),
    onUpdate: (cb: (payload: any) => void) => subscribe('buddy.update', cb),
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
    }) => void) => subscribe('tool.askUser', cb),
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

contextBridge.exposeInMainWorld('wish', api)

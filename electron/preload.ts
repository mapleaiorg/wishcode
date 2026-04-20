/**
 * iBank Desktop — Preload (contextIsolation + sandbox)
 *
 * Exposes a single `window.ibank` surface to the renderer. Every method maps
 * to one `ipcMain.handle(ibank:*)` channel in main.ts. Event subscriptions
 * use `ipcRenderer.on('ibank:event:<channel>')` and return an unsubscribe
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
  ipcRenderer.on(`ibank:event:${channel}`, listener)
  return () => { ipcRenderer.off(`ibank:event:${channel}`, listener) }
}

const api = {
  app: {
    version: () => invoke<{ version: string }>('ibank:app:version'),
    paths: () => invoke<Record<string, string>>('ibank:app:paths'),
    quit: () => invoke<void>('ibank:app:quit'),
    openExternal: (url: string) => invoke<void>('ibank:app:openExternal', url),
    logs: (limit?: number) => invoke<Array<{ ts: number; level: string; scope: string; msg: string }>>('ibank:app:logs', limit),
    onLog: (cb: (entry: any) => void) => subscribe('log.entry', cb),
  },
  config: {
    get: (key?: string) => invoke<any>('ibank:config:get', key),
    set: (key: string, value: unknown) => invoke<boolean>('ibank:config:set', key, value),
  },
  auth: {
    status: () => invoke<Array<any>>('ibank:auth:status'),
    login: (provider: string, creds?: Record<string, unknown>) =>
      invoke<any>('ibank:auth:login', provider, creds),
    logout: (provider: string) => invoke<void>('ibank:auth:logout', provider),
    oauthStart: () => invoke<{ manualUrl: string; automaticUrl: string }>('ibank:auth:oauthStart'),
    oauthSubmitCode: (code: string) => invoke<void>('ibank:auth:oauthSubmitCode', code),
    oauthCancel: () => invoke<void>('ibank:auth:oauthCancel'),
    onOAuthComplete: (cb: (payload: any) => void) => subscribe('auth.oauthComplete', cb),
  },
  model: {
    list: () => invoke<Array<any>>('ibank:model:list'),
    set: (provider: string, name: string) => invoke<void>('ibank:model:set', provider, name),
    current: () => invoke<{ provider: string; model: string }>('ibank:model:current'),
  },
  memory: {
    add: (body: string, opts?: { tags?: string[]; pinned?: boolean }) =>
      invoke<any>('ibank:memory:add', { body, ...opts }),
    list: () => invoke<Array<any>>('ibank:memory:list'),
    remove: (id: string) => invoke<boolean>('ibank:memory:remove', id),
    update: (id: string, patch: any) => invoke<any>('ibank:memory:update', id, patch),
    recall: (query: string, limit?: number) => invoke<Array<any>>('ibank:memory:recall', query, limit),
    onChanged: (cb: () => void) => subscribe('memory.changed', cb),
  },
  wallet: {
    status: () => invoke<any>('ibank:wallet:status'),
    accounts: () => invoke<Array<any>>('ibank:wallet:accounts'),
    balances: () => invoke<Array<any>>('ibank:wallet:balances'),
    create: (passphrase: string, mnemonic?: string) =>
      invoke<any>('ibank:wallet:create', passphrase, mnemonic),
    unlock: (passphrase: string) =>
      invoke<Record<string, string>>('ibank:wallet:unlock', passphrase),
    lock: () => invoke<void>('ibank:wallet:lock'),
    revealMnemonic: (passphrase: string) => invoke<string>('ibank:wallet:revealMnemonic', passphrase),
    remove: (passphrase: string) => invoke<void>('ibank:wallet:remove', passphrase),
    policyGet: () => invoke<any>('ibank:wallet:policy:get'),
    policySet: (patch: any) => invoke<any>('ibank:wallet:policy:set', patch),
    history: (chain: string, address: string) =>
      invoke<Array<any>>('ibank:wallet:history', chain, address),
    sendPreview: (chain: string, to: string, amount: string) =>
      invoke<any>('ibank:wallet:send:preview', chain, to, amount),
    send: (opts: { chain: string; to: string; amount: string; passphrase?: string }) =>
      invoke<{ hash: string; chain: string; explorerUrl: string }>('ibank:wallet:send:broadcast', opts),
    onLockChanged: (cb: (payload: { unlocked: boolean }) => void) => subscribe('wallet.lockChanged', cb),
  },
  trading: {
    price: (sym: string) => invoke<any>('ibank:trading:price', sym),
    prices: (syms: string[]) => invoke<Record<string, any>>('ibank:trading:prices', syms),
    top: (limit?: number) => invoke<Array<any>>('ibank:trading:top', limit),
    ohlcv: (sym: string, interval?: '1h' | '4h' | '1d', limit?: number) =>
      invoke<Array<any>>('ibank:trading:ohlcv', sym, interval, limit),
    tickerStart: (symbols: string[], intervalMs?: number) =>
      invoke<void>('ibank:trading:ticker:start', symbols, intervalMs),
    tickerStop: () => invoke<void>('ibank:trading:ticker:stop'),
    sourceGet: () => invoke<string>('ibank:trading:source:get'),
    sourceList: () => invoke<Array<{ id: string; label: string; note: string }>>('ibank:trading:source:list'),
    sourceSet: (source: string) => invoke<string>('ibank:trading:source:set', source),
    onPrice: (cb: (payload: { symbol: string; price: number; ts: number }) => void) =>
      subscribe('trading.price', cb),
  },
  skills: {
    list: () => invoke<Array<any>>('ibank:skills:list'),
    reload: () => invoke<Array<any>>('ibank:skills:reload'),
    install: (name: string, markdown: string) => invoke<any>('ibank:skills:install', name, markdown),
    uninstall: (name: string) => invoke<boolean>('ibank:skills:uninstall', name),
  },
  commands: {
    list: () =>
      invoke<Array<{ name: string; summary: string; category: string; usage?: string; aliases: string[] }>>(
        'ibank:commands:list',
      ),
    run: (sessionId: string, input: string) => invoke<any>('ibank:commands:run', sessionId, input),
  },
  chat: {
    send: (sessionId: string, requestId: string, text: string, permission?: string) =>
      invoke<any>('ibank:chat:send', sessionId, requestId, text, permission),
    abort: (requestId: string) => invoke<boolean>('ibank:chat:abort', requestId),
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
    read: (sessionId: string) => invoke<Array<any>>('ibank:session:read', sessionId),
    clear: (sessionId: string) => invoke<void>('ibank:session:clear', sessionId),
    compact: (sessionId: string, keepRecent?: number) =>
      invoke<{ droppedTurns: number; summaryChars: number }>('ibank:session:compact', sessionId, keepRecent),
    export: (sessionId: string, fmt: 'markdown' | 'json') =>
      invoke<string>('ibank:session:export', sessionId, fmt),
  },
  tasks: {
    list: () => invoke<Array<any>>('ibank:tasks:list'),
    cancel: (id: string) => invoke<boolean>('ibank:tasks:cancel', id),
    remove: (id: string) => invoke<boolean>('ibank:tasks:remove', id),
    clearCompleted: () => invoke<number>('ibank:tasks:clearCompleted'),
    onUpdate: (cb: (payload: { id: string; task: any }) => void) => subscribe('tasks.update', cb),
    onChanged: (cb: (payload: { runningCount: number; total: number }) => void) =>
      subscribe('tasks.changed', cb),
  },
  swarm: {
    run: (brief: string) => invoke<any>('ibank:swarm:run', brief),
  },
  buddy: {
    get: () => invoke<any>('ibank:buddy:get'),
    dismiss: (id: string) => invoke<void>('ibank:buddy:dismiss', id),
    onUpdate: (cb: (payload: any) => void) => subscribe('buddy.update', cb),
  },
  nft: {
    list: (chain?: string, owner?: string) =>
      invoke<Array<any>>('ibank:nft:list', chain, owner),
    refresh: (chain: string, owner: string, fromBlock?: number) =>
      invoke<{ added: number; removed: number; total: number }>(
        'ibank:nft:refresh', chain, owner, fromBlock,
      ),
    metadata: (key: string) => invoke<any>('ibank:nft:metadata', key),
    buildTransfer: (key: string, to: string, amount?: string) =>
      invoke<{ to: string; data: string; chain: string }>(
        'ibank:nft:buildTransfer', key, to, amount,
      ),
    clear: () => invoke<boolean>('ibank:nft:clear'),
    onUpdated: (cb: (payload: any) => void) => subscribe('nft.updated', cb),
  },
  cryptoBuddies: {
    list: (owner?: string, listed?: boolean) =>
      invoke<Array<any>>('ibank:cryptoBuddies:list', owner, listed),
    get: (id: string) => invoke<any>('ibank:cryptoBuddies:get', id),
    mint: (opts?: { name?: string; seed?: string; owner?: string }) =>
      invoke<any>('ibank:cryptoBuddies:mint', opts),
    breed: (a: string, b: string, opts?: { name?: string }) =>
      invoke<any>('ibank:cryptoBuddies:breed', a, b, opts),
    transfer: (id: string, to: string) =>
      invoke<any>('ibank:cryptoBuddies:transfer', id, to),
    trade: (a: string, b: string, priceUsd?: number) =>
      invoke<any>('ibank:cryptoBuddies:trade', a, b, priceUsd),
    listForSale: (id: string, priceUsd: number) =>
      invoke<any>('ibank:cryptoBuddies:list_for_sale', id, priceUsd),
    unlist: (id: string) => invoke<any>('ibank:cryptoBuddies:unlist', id),
    retire: (id: string, reason?: string) =>
      invoke<boolean>('ibank:cryptoBuddies:retire', id, reason),
    ensureGenesis: () => invoke<Array<any>>('ibank:cryptoBuddies:ensureGenesis'),
    ledger: (limit?: number) => invoke<Array<any>>('ibank:cryptoBuddies:ledger', limit),
    onUpdated: (cb: (payload: any) => void) => subscribe('cryptoBuddies.updated', cb),
  },
  financialBuddies: {
    list: () => invoke<Array<any>>('ibank:financialBuddies:list'),
    get: (id: string) => invoke<any>('ibank:financialBuddies:get', id),
    active: () => invoke<string>('ibank:financialBuddies:active'),
    setActive: (id: string) => invoke<any>('ibank:financialBuddies:setActive', id),
    override: (id: string, patch: any) =>
      invoke<any>('ibank:financialBuddies:override', id, patch),
    reset: () => invoke<boolean>('ibank:financialBuddies:reset'),
    onUpdated: (cb: (payload: any) => void) => subscribe('financialBuddies.updated', cb),
  },
  harness: {
    backtest: (args: any) => invoke<any>('ibank:harness:backtest', args),
    monteCarlo: (args: any) => invoke<any>('ibank:harness:monteCarlo', args),
    stress: (args: any) => invoke<any>('ibank:harness:stress', args),
    yieldProject: (args: any) => invoke<any>('ibank:harness:yield', args),
    policyCheck: (args: any) => invoke<any>('ibank:harness:policy', args),
    listRuns: (limit?: number) => invoke<Array<any>>('ibank:harness:listRuns', limit),
    readRun: (runId: string) => invoke<any>('ibank:harness:readRun', runId),
    scenarios: () => invoke<Array<any>>('ibank:harness:scenarios'),
    onProgress: (cb: (payload: any) => void) => subscribe('harness.progress', cb),
    onResult: (cb: (payload: any) => void) => subscribe('harness.result', cb),
  },
} as const

export type IBankApi = typeof api

contextBridge.exposeInMainWorld('ibank', api)

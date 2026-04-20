/**
 * Renderer-side mirror of the preload `window.ibank` surface.
 *
 * Keep in sync with /electron/preload.ts. The preload is the source of
 * truth; this file is a runtime-safe subset used to type-check the
 * renderer without importing electron.
 */

export type Provider = 'anthropic' | 'openai' | 'xai' | 'gemini' | 'ollama' | 'openibank'

export interface AuthStatusEntry {
  provider: Provider
  authenticated: boolean
  live?: boolean
  info?: Record<string, unknown>
}

export interface AuthStatusResponse {
  configDir: string
  configFile: string
  currentModel: string | null
  providers: {
    anthropic: { configured: boolean; apiKey: string | null; oauth: boolean; email?: string | null }
    openai:    { configured: boolean; apiKey: string | null }
    xai:       { configured: boolean; apiKey: string | null }
    gemini:    { configured: boolean; apiKey: string | null }
    ollama:    { configured: boolean; baseUrl: string; live: boolean }
    openibank: { configured: boolean; account: { email?: string; accountUuid?: string } | null }
  }
}

export interface ModelEntry {
  provider: Provider
  model: string
  label?: string
  recommended?: boolean
  warning?: string
  rateNote?: string
}

export interface ModelListResponse {
  current: string
  available: ModelEntry[]
}

export interface CurrentModel {
  provider: Provider
  model: string
}

// ── Chat & transcript ---------------------------------------------------

export type Role = 'user' | 'assistant' | 'system' | 'tool'

export type ContentBlock =
  | { type: 'text'; text: string }
  | { type: 'thinking'; text: string }
  | { type: 'tool_use'; id: string; name: string; input: unknown }
  | { type: 'tool_result'; tool_use_id: string; content: string | unknown; is_error?: boolean }

export interface Message {
  id: string
  role: Role
  ts: number
  content: ContentBlock[]
  streaming?: boolean
  error?: string
  model?: string
  provider?: Provider
}

export interface Conversation {
  id: string
  title: string
  createdAt: number
  updatedAt?: number
  pinned?: boolean
  messages: Message[]
}

// ── Wallet --------------------------------------------------------------

export type ChainId =
  | 'eth' | 'arbitrum' | 'optimism' | 'base' | 'polygon' | 'bsc'
  | 'btc' | 'solana' | 'tron'

export interface WalletStatusView {
  exists: boolean
  unlocked: boolean
  idleMsRemaining: number
}

export interface WalletAccount {
  chain: ChainId
  address: string
  derivationPath: string
  symbol: string
}

export interface BalanceView {
  chain: ChainId
  symbol: string
  raw: string
  formatted: string
  usdValue?: number
}

export interface TxEntry {
  chain: ChainId
  hash: string
  direction: 'in' | 'out' | 'self'
  from: string
  to: string
  amount: string
  amountRaw: string
  symbol: string
  feeRaw?: string
  feeSymbol?: string
  timestamp?: number
  blockNumber?: number
  status: 'pending' | 'confirmed' | 'failed'
  explorerUrl?: string
  note?: string
}

export interface FeeEstimate {
  chain: ChainId
  symbol: string
  fee: string
  feeRaw: string
  unitPrice: string
  units: string
  priorityFeeRaw?: string
  maxFeePerGasRaw?: string
}

export interface SendPreview {
  chain: ChainId
  from: string
  to: string
  amount: string
  amountRaw: string
  symbol: string
  decimals: number
  fee: FeeEstimate
  totalRaw: string
  usdValue?: number
  policy: {
    allowed: boolean
    reasons: string[]
    requiresPassphrase: boolean
    todaySpentUsd: number
    limits: any
  }
}

export interface SendResult {
  hash: string
  chain: string
  explorerUrl: string
}

// ── Memory / skills / commands ------------------------------------------

export interface MemoryEntry {
  id: string
  body: string
  tags?: string[]
  pinned?: boolean
  created: number
  updated?: number
}

export interface SkillInfo {
  name: string
  title: string
  description: string
  version?: string
  author?: string
  source: 'builtin' | 'user'
}

export interface CommandInfo {
  name: string
  summary: string
  category: string
  usage?: string
  aliases: string[]
}

// ── Tasks / buddy -------------------------------------------------------

export interface TaskView {
  id: string
  title: string
  status: 'queued' | 'running' | 'done' | 'failed' | 'cancelled'
  progress?: number
  output?: string
  error?: string
  createdAt: number
  startedAt?: number
  finishedAt?: number
}

export type BuddyMood =
  | 'idle' | 'thinking' | 'speaking' | 'tooling' | 'smiling'
  | 'worried' | 'alert' | 'working' | 'sleeping'

export interface BuddyNotification {
  id: string
  kind: 'info' | 'success' | 'warn' | 'error'
  text: string
  ts: number
}

export interface BuddyView {
  mood: BuddyMood
  message: string
  notifications: BuddyNotification[]
  intensity: 0 | 1 | 2 | 3
  sinceMs: number
}

// ── Trading -------------------------------------------------------------

export interface Quote {
  symbol: string
  priceUsd: number
  change24hPct: number
  marketCapUsd?: number
  volume24hUsd?: number
  updatedAt: number
}

// ── NFT --------------------------------------------------------------

export type NftStandard = 'erc721' | 'erc1155' | 'unknown'

export interface NftAttribute {
  trait_type: string
  value: string | number
  display_type?: string
}

export interface NftMetadata {
  name?: string
  description?: string
  image?: string
  externalUrl?: string
  attributes?: NftAttribute[]
  raw?: unknown
}

export interface NftAsset {
  key: string
  chain: ChainId
  contract: string
  tokenId: string
  standard: NftStandard
  owner: string
  balance: string
  acquiredAt?: number
  metadata?: NftMetadata
  metadataFetchedAt?: number
}

// ── CryptoBuddies ----------------------------------------------------

export type BuddyRarity = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary' | 'mythic'
export type BuddyElement = 'btc' | 'eth' | 'sol' | 'stable' | 'defi' | 'meme' | 'index' | 'private'

export interface BuddyGenome {
  body: string
  eyes: string
  mouth: string
  aura: string
  element: BuddyElement
  rarity: BuddyRarity
  level: number
  seed: string
}

export interface CryptoBuddy {
  id: string
  name: string
  genome: BuddyGenome
  ownerId: string
  mintedAt: number
  mintedFrom: 'genesis' | 'breed' | 'bridge'
  parentIds?: [string, string]
  lastTransferredAt?: number
  priceListingUsd?: number
  chainRef?: { chain: string; contract: string; tokenId: string }
}

// ── FinancialBuddies -------------------------------------------------

export type FinancialRole =
  | 'assistant' | 'advisor' | 'arbitrator' | 'trader'
  | 'research' | 'risk' | 'treasurer' | 'tax' | 'compliance'

export interface FinancialBuddyPersona {
  id: string
  title: string
  role: FinancialRole
  tagline: string
  preferredModelHint?: string
  tools?: string[]
  glyph?: string
  systemPrompt: string
}

// ── Harness ----------------------------------------------------------

export type HarnessKind = 'backtest' | 'monteCarlo' | 'stress' | 'policy' | 'yield'

export interface BacktestMetrics {
  totalReturnPct: number
  cagrPct: number
  sharpe: number
  sortino: number
  maxDrawdownPct: number
  hitRatePct: number
  trades: number
}

export interface BacktestResult {
  runId: string
  kind: 'backtest'
  symbol: string
  strategy: string
  startTs: number
  endTs: number
  bars: number
  metrics: BacktestMetrics
  equity: Array<{ ts: number; value: number; position: -1 | 0 | 1 }>
}

export interface MonteCarloResult {
  runId: string
  kind: 'monteCarlo'
  input: {
    symbol: string; spotUsd: number; annualDriftPct: number; annualVolPct: number
    horizonDays: number; paths: number; benchmarkAnnualPct?: number
  }
  endPrices: { p05: number; p25: number; p50: number; p75: number; p95: number }
  endReturns:  { p05: number; p25: number; p50: number; p75: number; p95: number }
  var95Pct: number
  cvar95Pct: number
  probOfLossPct: number
  pathsPreview: number[][]
}

export interface StressScenario {
  id: string
  name: string
  shocks: Record<string, number>
  defaultPct: number
  tradFi?: { sp500Pct: number; goldPct: number; dollarPct: number }
  notes: string
}

// ── The `window.ibank` api ---------------------------------------------

type Unsub = () => void

export interface IBankApi {
  app: {
    version(): Promise<{ version: string }>
    paths(): Promise<Record<string, string>>
    quit(): Promise<void>
    openExternal(url: string): Promise<void>
    logs(limit?: number): Promise<Array<{ ts: number; level: string; scope: string; msg: string }>>
    onLog(cb: (entry: any) => void): Unsub
  }
  config: {
    get(key?: string): Promise<any>
    set(key: string, value: unknown): Promise<boolean>
  }
  auth: {
    status(): Promise<AuthStatusResponse>
    login(provider: string, creds?: Record<string, unknown>): Promise<any>
    logout(provider: string): Promise<void>
    oauthStart(): Promise<{ manualUrl: string; automaticUrl: string }>
    oauthSubmitCode(code: string): Promise<void>
    oauthCancel(): Promise<void>
    onOAuthComplete(cb: (payload: any) => void): Unsub
  }
  model: {
    list(): Promise<ModelListResponse>
    set(provider: string, name: string): Promise<void>
    current(): Promise<CurrentModel>
  }
  memory: {
    add(body: string, opts?: { tags?: string[]; pinned?: boolean }): Promise<MemoryEntry>
    list(): Promise<MemoryEntry[]>
    remove(id: string): Promise<boolean>
    update(id: string, patch: Partial<MemoryEntry>): Promise<MemoryEntry | null>
    recall(query: string, limit?: number): Promise<MemoryEntry[]>
    onChanged(cb: () => void): Unsub
  }
  wallet: {
    status(): Promise<WalletStatusView>
    accounts(): Promise<WalletAccount[]>
    balances(): Promise<BalanceView[]>
    create(passphrase: string, mnemonic?: string): Promise<{ mnemonic: string; addresses: Record<string, string> }>
    unlock(passphrase: string): Promise<Record<string, string>>
    lock(): Promise<void>
    revealMnemonic(passphrase: string): Promise<string>
    remove(passphrase: string): Promise<void>
    policyGet(): Promise<any>
    policySet(patch: any): Promise<any>
    history(chain: string, address: string): Promise<TxEntry[]>
    sendPreview(chain: string, to: string, amount: string): Promise<SendPreview>
    send(opts: { chain: string; to: string; amount: string; passphrase?: string }): Promise<SendResult>
    onLockChanged(cb: (payload: { unlocked: boolean }) => void): Unsub
  }
  trading: {
    price(sym: string): Promise<Quote | null>
    prices(syms: string[]): Promise<Record<string, Quote>>
    top(limit?: number): Promise<Quote[]>
    ohlcv(sym: string, interval?: '1h' | '4h' | '1d', limit?: number): Promise<any[]>
    tickerStart(symbols: string[], intervalMs?: number): Promise<void>
    tickerStop(): Promise<void>
    sourceGet(): Promise<string>
    sourceList(): Promise<Array<{ id: string; label: string; note: string }>>
    sourceSet(source: string): Promise<string>
    onPrice(cb: (payload: { symbol: string; price: number; ts: number }) => void): Unsub
  }
  skills: {
    list(): Promise<SkillInfo[]>
    reload(): Promise<SkillInfo[]>
    install(name: string, markdown: string): Promise<SkillInfo>
    uninstall(name: string): Promise<boolean>
  }
  commands: {
    list(): Promise<CommandInfo[]>
    run(sessionId: string, input: string): Promise<any>
  }
  chat: {
    send(sessionId: string, requestId: string, text: string, permission?: string): Promise<any>
    abort(requestId: string): Promise<boolean>
    onDelta(cb: (payload: { requestId: string; text: string }) => void): Unsub
    onThinking(cb: (payload: { requestId: string; text: string }) => void): Unsub
    onToolUse(cb: (payload: any) => void): Unsub
    onToolResult(cb: (payload: any) => void): Unsub
    onDone(cb: (payload: { requestId: string; usage: any; stopReason: string }) => void): Unsub
    onError(cb: (payload: { requestId: string; error: string }) => void): Unsub
    onStatus(cb: (payload: any) => void): Unsub
  }
  session: {
    read(sessionId: string): Promise<any[]>
    clear(sessionId: string): Promise<void>
    compact(sessionId: string, keepRecent?: number): Promise<{ droppedTurns: number; summaryChars: number }>
    export(sessionId: string, fmt: 'markdown' | 'json'): Promise<string>
  }
  tasks: {
    list(): Promise<TaskView[]>
    cancel(id: string): Promise<boolean>
    remove(id: string): Promise<boolean>
    clearCompleted(): Promise<number>
    onUpdate(cb: (payload: { id: string; task: TaskView }) => void): Unsub
    onChanged(cb: (payload: { runningCount: number; total: number }) => void): Unsub
  }
  swarm: {
    run(brief: string): Promise<any>
  }
  buddy: {
    get(): Promise<BuddyView>
    dismiss(id: string): Promise<void>
    onUpdate(cb: (payload: BuddyView) => void): Unsub
  }
  nft: {
    list(chain?: string, owner?: string): Promise<NftAsset[]>
    refresh(chain: string, owner: string, fromBlock?: number): Promise<{ added: number; removed: number; total: number }>
    metadata(key: string): Promise<NftMetadata>
    buildTransfer(key: string, to: string, amount?: string): Promise<{ to: string; data: string; chain: string }>
    clear(): Promise<boolean>
    onUpdated(cb: (payload: any) => void): Unsub
  }
  cryptoBuddies: {
    list(owner?: string, listed?: boolean): Promise<CryptoBuddy[]>
    get(id: string): Promise<CryptoBuddy | null>
    mint(opts?: { name?: string; seed?: string; owner?: string }): Promise<CryptoBuddy>
    breed(a: string, b: string, opts?: { name?: string }): Promise<CryptoBuddy>
    transfer(id: string, to: string): Promise<CryptoBuddy>
    trade(a: string, b: string, priceUsd?: number): Promise<{ a: CryptoBuddy; b: CryptoBuddy }>
    listForSale(id: string, priceUsd: number): Promise<CryptoBuddy>
    unlist(id: string): Promise<CryptoBuddy>
    retire(id: string, reason?: string): Promise<boolean>
    ensureGenesis(): Promise<CryptoBuddy[]>
    ledger(limit?: number): Promise<any[]>
    onUpdated(cb: (payload: any) => void): Unsub
  }
  financialBuddies: {
    list(): Promise<FinancialBuddyPersona[]>
    get(id: string): Promise<FinancialBuddyPersona | null>
    active(): Promise<string>
    setActive(id: string): Promise<FinancialBuddyPersona>
    override(id: string, patch: Partial<FinancialBuddyPersona>): Promise<FinancialBuddyPersona>
    reset(): Promise<boolean>
    onUpdated(cb: (payload: any) => void): Unsub
  }
  harness: {
    backtest(args: any): Promise<BacktestResult>
    monteCarlo(args: any): Promise<MonteCarloResult>
    stress(args: any): Promise<any>
    yieldProject(args: any): Promise<any>
    policyCheck(args: any): Promise<any>
    listRuns(limit?: number): Promise<any[]>
    readRun(runId: string): Promise<any>
    scenarios(): Promise<StressScenario[]>
    onProgress(cb: (payload: any) => void): Unsub
    onResult(cb: (payload: any) => void): Unsub
  }
}

declare global {
  interface Window {
    ibank: IBankApi
  }
}

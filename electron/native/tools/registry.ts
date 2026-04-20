/**
 * LLM-callable tool registry.
 *
 * Tools are invoked by the QueryEngine when the assistant emits a tool_use
 * content block. Every tool is gated by a permission ("auto" | "ask" |
 * "plan" | "bypass") which the engine checks before dispatching.
 *
 * Each tool exports a JSONSchema-shaped input definition for the LLM plus a
 * handler that returns a serializable result. Tools must never block on
 * network for more than 30s — they should throw a TimeoutError.
 */

export type Permission = 'auto' | 'ask' | 'plan' | 'bypass'

/** Minimal JSON-schema shape we use for tool inputs (no external dep). */
export interface ToolSchema {
  type: 'object'
  properties?: Record<string, unknown>
  required?: string[]
  [k: string]: unknown
}
type JSONSchema7 = ToolSchema

export interface ToolContext {
  sessionId: string
  requestId: string
  permission: Permission      // current session default
  approve?: (question: string, data?: unknown) => Promise<boolean>
  signal?: AbortSignal
}

export interface ToolDef<I = unknown, O = unknown> {
  name: string
  title: string
  description: string
  inputSchema: JSONSchema7
  permission: Permission
  handler: (input: I, ctx: ToolContext) => Promise<O>
  dangerous?: boolean        // requires explicit confirm even in "auto" mode
  category:
    | 'memory' | 'wallet' | 'trading' | 'onchain' | 'web' | 'fs' | 'session' | 'tasks'
    | 'nft' | 'cryptoBuddies' | 'financialBuddies' | 'harness'
}

const registry = new Map<string, ToolDef>()

export function registerTool<I, O>(def: ToolDef<I, O>): void {
  registry.set(def.name, def as unknown as ToolDef)
}

export function unregisterTool(name: string): void {
  registry.delete(name)
}

export function toolsList(): ToolDef[] {
  return [...registry.values()]
}

export function toolByName(name: string): ToolDef | undefined {
  return registry.get(name)
}

/** Shape Anthropic's tools API expects. */
export function anthropicTools(): Array<{
  name: string
  description: string
  input_schema: JSONSchema7
}> {
  return toolsList().map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema,
  }))
}

/** Shape OpenAI's tools API expects. */
export function openaiTools(): Array<{
  type: 'function'
  function: { name: string; description: string; parameters: JSONSchema7 }
}> {
  return toolsList().map((t) => ({
    type: 'function',
    function: { name: t.name, description: t.description, parameters: t.inputSchema },
  }))
}

// ---------------------------------------------------------------------------
// Built-ins

import * as memdir from '../memory/memdir.js'
import * as walletStatus from '../wallet/status.js'
import * as walletKeystore from '../wallet/keystore.js'
import * as policy from '../wallet/policy.js'
import * as market from '../trading/market.js'

registerTool({
  name: 'memory_add',
  title: 'Save memory',
  description: 'Save a fact or preference into long-term memory.',
  category: 'memory',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      text: { type: 'string', description: 'Content to remember.' },
      tags: { type: 'array', items: { type: 'string' }, description: 'Optional tags.' },
      pinned: { type: 'boolean', description: 'Pin to always surface.' },
    },
    required: ['text'],
  },
  async handler(input: any) {
    const entry = await memdir.addMemory(String(input.text), {
      tags: Array.isArray(input.tags) ? input.tags : [],
      pinned: !!input.pinned,
    })
    return { id: entry.id }
  },
})

registerTool({
  name: 'memory_recall',
  title: 'Recall memories',
  description: 'Retrieve memories relevant to a query using BM25.',
  category: 'memory',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 20, default: 5 },
    },
    required: ['query'],
  },
  async handler(input: any) {
    const hits = await memdir.findRelevant(String(input.query), Number(input.limit ?? 5))
    return { hits: hits.map((m) => ({ id: m.id, body: m.body, tags: m.tags ?? [] })) }
  },
})

registerTool({
  name: 'memory_list',
  title: 'List memories',
  description: 'List recent memories.',
  category: 'memory',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 20 } },
  },
  async handler(input: any) {
    const list = await memdir.listMemories()
    return list.slice(0, Number(input.limit ?? 20))
  },
})

registerTool({
  name: 'wallet_status',
  title: 'Wallet status',
  description: 'Check whether a wallet exists and whether it is unlocked.',
  category: 'wallet',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    return walletStatus.walletStatus()
  },
})

registerTool({
  name: 'wallet_accounts',
  title: 'Wallet accounts',
  description: 'List addresses for all supported chains.',
  category: 'wallet',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    return walletStatus.walletAccounts()
  },
})

registerTool({
  name: 'wallet_balances',
  title: 'Wallet balances',
  description: 'Native-token balances for all wallet addresses.',
  category: 'wallet',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    const accounts = await walletStatus.walletAccounts()
    const symbols = Array.from(new Set(accounts.map((a) => a.symbol)))
    const priceMap = await market.prices(symbols)
    const usdPrices: Record<string, number> = {}
    for (const [sym, q] of Object.entries(priceMap)) usdPrices[sym] = q.priceUsd
    return walletStatus.walletBalancesAll(usdPrices)
  },
})

registerTool({
  name: 'wallet_policy_check',
  title: 'Wallet policy check',
  description: 'Evaluate whether a proposed spend is allowed by wallet policy.',
  category: 'wallet',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      chain: { type: 'string' },
      asset: { type: 'string' },
      amountUsd: { type: 'number' },
      recipient: { type: 'string' },
    },
    required: ['chain', 'asset', 'amountUsd', 'recipient'],
  },
  async handler(input: any) {
    return policy.evaluate({
      chain: input.chain,
      to: String(input.recipient),
      amountUsd: Number(input.amountUsd),
    })
  },
})

registerTool({
  name: 'wallet_reveal_mnemonic',
  title: 'Reveal mnemonic (UI-gated)',
  description:
    'Do NOT call directly. If a user asks to see their recovery phrase, ' +
    'respond in chat directing them to the Wallet panel "Reveal backup" flow — ' +
    'passphrases must never pass through chat.',
  category: 'wallet',
  permission: 'ask',
  dangerous: true,
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    throw new Error('mnemonic reveal must be done via the Wallet UI, not via chat tool')
  },
})

registerTool({
  name: 'trading_price',
  title: 'Price quote',
  description: 'Get spot price and 24h change for a symbol.',
  category: 'trading',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { symbol: { type: 'string', description: 'Ticker, e.g. BTC, ETH, SOL.' } },
    required: ['symbol'],
  },
  async handler(input: any) {
    return market.price(String(input.symbol))
  },
})

registerTool({
  name: 'trading_prices',
  title: 'Batch price quotes',
  description: 'Get spot prices for a list of symbols in one call.',
  category: 'trading',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { symbols: { type: 'array', items: { type: 'string' } } },
    required: ['symbols'],
  },
  async handler(input: any) {
    return market.prices((input.symbols as string[]).map(String))
  },
})

registerTool({
  name: 'trading_ohlcv',
  title: 'OHLCV candles',
  description: 'Historical candlestick data.',
  category: 'trading',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: { type: 'string' },
      interval: { type: 'string', enum: ['1h', '4h', '1d'], default: '1d' },
      limit: { type: 'integer', minimum: 10, maximum: 365, default: 180 },
    },
    required: ['symbol'],
  },
  async handler(input: any) {
    return market.ohlcv(
      String(input.symbol),
      (input.interval ?? '1d') as '1d' | '4h' | '1h',
      Number(input.limit ?? 180),
    )
  },
})

registerTool({
  name: 'trading_tickers_top',
  title: 'Top tickers',
  description: 'Top-N cryptocurrencies by market cap with 24h change.',
  category: 'trading',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { limit: { type: 'integer', minimum: 1, maximum: 100, default: 25 } },
  },
  async handler(input: any) {
    return market.topTickers(Number(input.limit ?? 25))
  },
})

registerTool({
  name: 'web_search',
  title: 'Web search',
  description: 'Quick web search for breaking news or reference data.',
  category: 'web',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      query: { type: 'string' },
      limit: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
    },
    required: ['query'],
  },
  async handler(input: any) {
    // Uses DuckDuckGo HTML endpoint — no key, rate-limited but free.
    const q = encodeURIComponent(String(input.query))
    const limit = Number(input.limit ?? 5)
    const r = await fetch(`https://duckduckgo.com/html/?q=${q}`, {
      headers: { 'user-agent': 'Mozilla/5.0 (iBank-Desktop)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (!r.ok) throw new Error(`web_search ${r.status}`)
    const html = await r.text()
    // very lightweight scrape — <a class="result__a" href="...">title</a>
    const results: Array<{ title: string; url: string; snippet: string }> = []
    const re = /<a[^>]*class="result__a"[^>]*href="([^"]+)"[^>]*>([^<]+)<\/a>[\s\S]*?<a[^>]*class="result__snippet"[^>]*>([^<]+)<\/a>/g
    let m: RegExpExecArray | null
    while ((m = re.exec(html)) !== null) {
      results.push({
        title: decode(m[2]),
        url: decode(m[1]),
        snippet: decode(m[3]),
      })
      if (results.length >= limit) break
    }
    return { results }
  },
})

function decode(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .trim()
}

registerTool({
  name: 'session_summarize',
  title: 'Summarize conversation',
  description: 'Return a compact summary of the current session so far.',
  category: 'session',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler(_: any, ctx: ToolContext) {
    const { readTranscript } = await import('../session/transcript.js')
    const events = await readTranscript(ctx.sessionId)
    return { turns: events.length }
  },
})

// Reference the keystore import so the bundler keeps it reachable even
// though we only use it via the "reveal" guardrail above.
void walletKeystore

// ---------------------------------------------------------------------------
// NFT tools
// ---------------------------------------------------------------------------

import * as nft from '../wallet/nft.js'
import { evmJsonRpc } from '../wallet/rpc.js'
import type { ChainId } from '../wallet/chains.js'

registerTool({
  name: 'nft_list',
  title: 'List NFT holdings',
  description: 'List cached NFT assets, optionally filtered by chain or owner.',
  category: 'nft',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      chain: { type: 'string', description: 'Optional chain id: eth|arbitrum|optimism|base|polygon|bsc' },
      owner: { type: 'string', description: 'Optional owner EVM address' },
    },
  },
  async handler(input: any) {
    return nft.listNfts({ chain: input.chain as ChainId, owner: input.owner })
  },
})

registerTool({
  name: 'nft_refresh',
  title: 'Refresh NFT index',
  description: 'Scan recent Transfer events on one chain for one owner and refresh the local NFT index.',
  category: 'nft',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      chain: { type: 'string' },
      owner: { type: 'string' },
      fromBlock: { type: 'integer' },
      maxLogs: { type: 'integer', minimum: 100, maximum: 20000, default: 5000 },
    },
    required: ['chain', 'owner'],
  },
  async handler(input: any) {
    return nft.refreshNfts(input.chain as ChainId, String(input.owner), {
      fromBlock: typeof input.fromBlock === 'number' ? input.fromBlock : undefined,
      maxLogs: typeof input.maxLogs === 'number' ? input.maxLogs : undefined,
    })
  },
})

registerTool({
  name: 'nft_metadata',
  title: 'Refresh NFT metadata',
  description: 'Re-fetch the tokenURI/uri and cached JSON metadata for one NFT.',
  category: 'nft',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { key: { type: 'string', description: '<chain>:<contract>:<tokenId>' } },
    required: ['key'],
  },
  async handler(input: any) {
    return nft.refreshMetadata(String(input.key))
  },
})

registerTool({
  name: 'nft_build_transfer',
  title: 'Build NFT transfer tx',
  description: 'Return an unsigned transfer tx payload for one NFT — sign/send via the Wallet UI.',
  category: 'nft',
  permission: 'ask',
  inputSchema: {
    type: 'object',
    properties: {
      key: { type: 'string' },
      to: { type: 'string' },
      amount: { type: 'string', description: 'ERC-1155 amount, optional' },
    },
    required: ['key', 'to'],
  },
  async handler(input: any) {
    const asset = nft.getNft(String(input.key))
    if (!asset) throw new Error('unknown NFT key: ' + input.key)
    return nft.buildTransferTx(asset, String(input.to), { amount: input.amount })
  },
})

// ---------------------------------------------------------------------------
// On-chain raw tools (for the forensic skill)
// ---------------------------------------------------------------------------

registerTool({
  name: 'evm_call',
  title: 'Raw eth_call',
  description: 'Execute an eth_call against an EVM chain. Returns raw hex.',
  category: 'onchain',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      chain: { type: 'string' },
      to: { type: 'string' },
      data: { type: 'string', description: 'Hex calldata' },
    },
    required: ['chain', 'to', 'data'],
  },
  async handler(input: any) {
    return evmJsonRpc(input.chain as ChainId, 'eth_call', [{ to: input.to, data: input.data }, 'latest'])
  },
})

registerTool({
  name: 'evm_logs',
  title: 'Raw eth_getLogs',
  description: 'Fetch event logs via eth_getLogs. Returns the raw provider response.',
  category: 'onchain',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      chain: { type: 'string' },
      fromBlock: { type: 'string' },
      toBlock: { type: 'string' },
      address: { type: 'string' },
      topics: { type: 'array', items: { type: 'string' } },
    },
    required: ['chain'],
  },
  async handler(input: any) {
    const filter: Record<string, unknown> = {
      fromBlock: input.fromBlock ?? 'latest',
      toBlock: input.toBlock ?? 'latest',
    }
    if (input.address) filter.address = input.address
    if (input.topics) filter.topics = input.topics
    return evmJsonRpc(input.chain as ChainId, 'eth_getLogs', [filter])
  },
})

registerTool({
  name: 'evm_tx',
  title: 'Fetch transaction',
  description: 'Get an EVM transaction by hash (returns tx + receipt).',
  category: 'onchain',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { chain: { type: 'string' }, hash: { type: 'string' } },
    required: ['chain', 'hash'],
  },
  async handler(input: any) {
    const [tx, receipt] = await Promise.all([
      evmJsonRpc(input.chain as ChainId, 'eth_getTransactionByHash', [input.hash]),
      evmJsonRpc(input.chain as ChainId, 'eth_getTransactionReceipt', [input.hash]),
    ])
    return { tx, receipt }
  },
})

registerTool({
  name: 'evm_gas',
  title: 'Gas price',
  description: 'Fetch current base fee + priority fee estimate for an EVM chain.',
  category: 'onchain',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: { chain: { type: 'string' } },
    required: ['chain'],
  },
  async handler(input: any) {
    const chain = input.chain as ChainId
    const [gasHex, blockHex] = await Promise.all([
      evmJsonRpc(chain, 'eth_gasPrice', []).catch(() => '0x0'),
      evmJsonRpc(chain, 'eth_getBlockByNumber', ['latest', false]).catch(() => null),
    ])
    const baseFee = blockHex?.baseFeePerGas ? BigInt(blockHex.baseFeePerGas) : null
    const gasPrice = BigInt(gasHex || '0x0')
    return {
      chain,
      gasPriceGwei: Number(gasPrice) / 1e9,
      baseFeeGwei: baseFee === null ? null : Number(baseFee) / 1e9,
      priorityGwei: baseFee === null ? null : Math.max(0, (Number(gasPrice) - Number(baseFee)) / 1e9),
    }
  },
})

// ---------------------------------------------------------------------------
// CryptoBuddies tools
// ---------------------------------------------------------------------------

import * as crb from '../cryptoBuddies/registry.js'

registerTool({
  name: 'cryptoBuddies_list',
  title: 'List CryptoBuddies',
  description: 'List owned CryptoBuddy collectibles, optionally filtered.',
  category: 'cryptoBuddies',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      owner: { type: 'string' },
      listed: { type: 'boolean', description: 'Only listed-for-sale buddies' },
    },
  },
  async handler(input: any) {
    return crb.listBuddies({ owner: input.owner, listed: !!input.listed })
  },
})

registerTool({
  name: 'cryptoBuddies_mint',
  title: 'Mint CryptoBuddy',
  description: 'Mint a new CryptoBuddy (genesis). Optional custom seed / name / owner.',
  category: 'cryptoBuddies',
  permission: 'ask',
  inputSchema: {
    type: 'object',
    properties: {
      name: { type: 'string' },
      seed: { type: 'string', description: 'hex 32-byte seed; random if omitted' },
      owner: { type: 'string' },
    },
  },
  async handler(input: any) {
    return crb.mint({
      name: input.name ? String(input.name) : undefined,
      seed: input.seed ? String(input.seed) : undefined,
      owner: input.owner ? String(input.owner) : undefined,
    })
  },
})

registerTool({
  name: 'cryptoBuddies_breed',
  title: 'Breed CryptoBuddies',
  description: 'Breed two parents into one child buddy.',
  category: 'cryptoBuddies',
  permission: 'ask',
  inputSchema: {
    type: 'object',
    properties: {
      parentA: { type: 'string' },
      parentB: { type: 'string' },
      name: { type: 'string' },
    },
    required: ['parentA', 'parentB'],
  },
  async handler(input: any) {
    return crb.breed(String(input.parentA), String(input.parentB), { name: input.name })
  },
})

registerTool({
  name: 'cryptoBuddies_trade',
  title: 'Trade CryptoBuddies',
  description: 'Swap ownership of two CryptoBuddies atomically.',
  category: 'cryptoBuddies',
  permission: 'ask',
  inputSchema: {
    type: 'object',
    properties: {
      a: { type: 'string' }, b: { type: 'string' },
      priceUsd: { type: 'number' },
    },
    required: ['a', 'b'],
  },
  async handler(input: any) {
    return crb.trade(String(input.a), String(input.b), input.priceUsd)
  },
})

registerTool({
  name: 'cryptoBuddies_transfer',
  title: 'Transfer CryptoBuddy',
  description: 'Transfer one CryptoBuddy to a new owner id or address.',
  category: 'cryptoBuddies',
  permission: 'ask',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' }, to: { type: 'string' } },
    required: ['id', 'to'],
  },
  async handler(input: any) {
    return crb.transfer(String(input.id), String(input.to))
  },
})

// ---------------------------------------------------------------------------
// Financial Buddies tools
// ---------------------------------------------------------------------------

import * as fib from '../financialBuddies/registry.js'

registerTool({
  name: 'financialBuddies_list',
  title: 'List Financial Buddies',
  description: 'Return the available Financial Buddy personas (id, title, role).',
  category: 'financialBuddies',
  permission: 'auto',
  inputSchema: { type: 'object', properties: {} },
  async handler() {
    return fib.listPersonas().map((p) => ({
      id: p.id, title: p.title, role: p.role, tagline: p.tagline, glyph: p.glyph,
    }))
  },
})

registerTool({
  name: 'financialBuddies_set_active',
  title: 'Set active persona',
  description: 'Switch the active Financial Buddy persona for subsequent turns.',
  category: 'financialBuddies',
  permission: 'ask',
  inputSchema: {
    type: 'object',
    properties: { id: { type: 'string' } },
    required: ['id'],
  },
  async handler(input: any) {
    return fib.setActivePersona(String(input.id))
  },
})

// ---------------------------------------------------------------------------
// Harness tools
// ---------------------------------------------------------------------------

import * as harness from '../harness/engine.js'

registerTool({
  name: 'harness_backtest',
  title: 'Run strategy backtest',
  description: 'Backtest a strategy (smaCross, momentum, meanReversion, buyAndHold) against OHLCV.',
  category: 'harness',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: { type: 'string' },
      strategy: { type: 'string', enum: ['smaCross', 'momentum', 'meanReversion', 'buyAndHold'] },
      params: { type: 'object' },
      interval: { type: 'string', enum: ['1h', '4h', '1d'], default: '1d' },
      limit: { type: 'integer', minimum: 30, maximum: 1000, default: 365 },
    },
    required: ['symbol', 'strategy'],
  },
  async handler(input: any) {
    const p = input.params ?? {}
    let strat
    switch (input.strategy) {
      case 'smaCross':       strat = harness.STRATEGIES.smaCross(p.fast, p.slow); break
      case 'momentum':       strat = harness.STRATEGIES.momentum(p.lookback, p.threshold); break
      case 'meanReversion':  strat = harness.STRATEGIES.meanReversion(p.lookback, p.zScore); break
      default:               strat = harness.STRATEGIES.buyAndHold()
    }
    return harness.runBacktest({
      symbol: String(input.symbol),
      strategy: strat,
      interval: input.interval ?? '1d',
      limit: input.limit ?? 365,
    })
  },
})

registerTool({
  name: 'harness_monte_carlo',
  title: 'Run Monte-Carlo simulation',
  description: 'GBM Monte-Carlo for a single asset — returns VaR, CVaR, and end-price percentiles.',
  category: 'harness',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      symbol: { type: 'string' },
      spotUsd: { type: 'number' },
      annualDriftPct: { type: 'number' },
      annualVolPct: { type: 'number' },
      horizonDays: { type: 'integer', minimum: 1, maximum: 3650 },
      paths: { type: 'integer', minimum: 100, maximum: 50000, default: 5000 },
    },
    required: ['symbol', 'spotUsd', 'annualDriftPct', 'annualVolPct', 'horizonDays'],
  },
  async handler(input: any) {
    return harness.runMonteCarlo({
      symbol: String(input.symbol),
      spotUsd: Number(input.spotUsd),
      annualDriftPct: Number(input.annualDriftPct),
      annualVolPct: Number(input.annualVolPct),
      horizonDays: Number(input.horizonDays),
      paths: Number(input.paths ?? 5000),
    })
  },
})

registerTool({
  name: 'harness_stress',
  title: 'Run stress scenario',
  description: 'Apply a preset historical stress scenario to provided holdings.',
  category: 'harness',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      scenarioId: { type: 'string', enum: ['covid-2020', 'luna-2022', 'ftx-2022', 'gfc-2008', 'china-ban'] },
      holdings: {
        type: 'array',
        items: {
          type: 'object',
          properties: { symbol: { type: 'string' }, valueUsd: { type: 'number' } },
          required: ['symbol', 'valueUsd'],
        },
      },
    },
    required: ['scenarioId', 'holdings'],
  },
  async handler(input: any) {
    return harness.runStress({
      scenarioId: String(input.scenarioId),
      holdings: (input.holdings as any[]).map((h) => ({ symbol: String(h.symbol), valueUsd: Number(h.valueUsd) })),
    })
  },
})

registerTool({
  name: 'harness_yield',
  title: 'Yield projection',
  description: 'Project compounded yield over time.',
  category: 'harness',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      principalUsd: { type: 'number' },
      aprPct: { type: 'number' },
      compoundPerYear: { type: 'integer', default: 12 },
      years: { type: 'number' },
      monthlyFeeUsd: { type: 'number', default: 0 },
    },
    required: ['principalUsd', 'aprPct', 'years'],
  },
  async handler(input: any) {
    return harness.runYield({
      principalUsd: Number(input.principalUsd),
      aprPct: Number(input.aprPct),
      compoundPerYear: Number(input.compoundPerYear ?? 12),
      years: Number(input.years),
      monthlyFeeUsd: input.monthlyFeeUsd ?? 0,
    })
  },
})

registerTool({
  name: 'harness_policy_check',
  title: 'Dry-run spend policy',
  description: 'Simulate a wallet-spend against the active policy. Does NOT send.',
  category: 'harness',
  permission: 'auto',
  inputSchema: {
    type: 'object',
    properties: {
      chain: { type: 'string' },
      toAddress: { type: 'string' },
      amountUsd: { type: 'number' },
      category: { type: 'string', enum: ['send', 'swap', 'nft_transfer'] },
    },
    required: ['chain', 'toAddress', 'amountUsd'],
  },
  async handler(input: any) {
    return harness.runPolicyCheck({
      chain: String(input.chain),
      toAddress: String(input.toAddress),
      amountUsd: Number(input.amountUsd),
      category: input.category,
    })
  },
})

// Seed the CryptoBuddies genesis set on first load so `cryptoBuddies_list`
// never returns an empty array on a fresh install.
try {
  crb.ensureGenesisBuddies()
} catch (e) {
  // Non-fatal — storage may be unwritable in tests.
  void e
}

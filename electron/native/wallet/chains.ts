/**
 * Chain registry.
 *
 * Phase 1 ships with 6 chains covering ~95% of retail use:
 *   Ethereum, Arbitrum, Optimism, Base, Polygon, BNB Smart Chain.
 *   Bitcoin, Solana, TRON (single-chain each).
 *
 * Each entry carries:
 *   - BIP-44 coin type
 *   - default public RPC (can be overridden by user config)
 *   - native symbol, decimals
 *   - explorer URL template for {address} / {tx}
 *   - EIP-3770 short name (EVM only)
 */

export type ChainId = 'eth' | 'arbitrum' | 'optimism' | 'base' | 'polygon' | 'bsc' | 'btc' | 'solana' | 'tron'

export type ChainFamily = 'evm' | 'btc' | 'solana' | 'tron'

export interface ChainSpec {
  id: ChainId
  family: ChainFamily
  name: string
  symbol: string
  decimals: number
  /** BIP-44 coin type (index used in derivation path m/44'/<type>'/0'/0/0). */
  bip44: number
  /** Chain id for EIP-155; ignored for non-EVM. */
  chainIdNum?: number
  /** Default public RPC. User can override in config.wallet.rpcOverrides[<id>]. */
  defaultRpc: string
  /** Explorer URLs with {address} / {tx} placeholders. */
  explorer: { address: string; tx: string }
}

export const CHAINS: Record<ChainId, ChainSpec> = {
  eth: {
    id: 'eth', family: 'evm', name: 'Ethereum', symbol: 'ETH', decimals: 18, bip44: 60, chainIdNum: 1,
    defaultRpc: 'https://eth.llamarpc.com',
    explorer: { address: 'https://etherscan.io/address/{address}', tx: 'https://etherscan.io/tx/{tx}' },
  },
  arbitrum: {
    id: 'arbitrum', family: 'evm', name: 'Arbitrum One', symbol: 'ETH', decimals: 18, bip44: 60, chainIdNum: 42161,
    defaultRpc: 'https://arb1.arbitrum.io/rpc',
    explorer: { address: 'https://arbiscan.io/address/{address}', tx: 'https://arbiscan.io/tx/{tx}' },
  },
  optimism: {
    id: 'optimism', family: 'evm', name: 'Optimism', symbol: 'ETH', decimals: 18, bip44: 60, chainIdNum: 10,
    defaultRpc: 'https://mainnet.optimism.io',
    explorer: { address: 'https://optimistic.etherscan.io/address/{address}', tx: 'https://optimistic.etherscan.io/tx/{tx}' },
  },
  base: {
    id: 'base', family: 'evm', name: 'Base', symbol: 'ETH', decimals: 18, bip44: 60, chainIdNum: 8453,
    defaultRpc: 'https://mainnet.base.org',
    explorer: { address: 'https://basescan.org/address/{address}', tx: 'https://basescan.org/tx/{tx}' },
  },
  polygon: {
    id: 'polygon', family: 'evm', name: 'Polygon', symbol: 'POL', decimals: 18, bip44: 60, chainIdNum: 137,
    defaultRpc: 'https://polygon-rpc.com',
    explorer: { address: 'https://polygonscan.com/address/{address}', tx: 'https://polygonscan.com/tx/{tx}' },
  },
  bsc: {
    id: 'bsc', family: 'evm', name: 'BNB Smart Chain', symbol: 'BNB', decimals: 18, bip44: 60, chainIdNum: 56,
    defaultRpc: 'https://bsc-dataseed.binance.org',
    explorer: { address: 'https://bscscan.com/address/{address}', tx: 'https://bscscan.com/tx/{tx}' },
  },
  btc: {
    id: 'btc', family: 'btc', name: 'Bitcoin', symbol: 'BTC', decimals: 8, bip44: 0,
    defaultRpc: 'https://blockstream.info/api',
    explorer: { address: 'https://mempool.space/address/{address}', tx: 'https://mempool.space/tx/{tx}' },
  },
  solana: {
    id: 'solana', family: 'solana', name: 'Solana', symbol: 'SOL', decimals: 9, bip44: 501,
    defaultRpc: 'https://api.mainnet-beta.solana.com',
    explorer: { address: 'https://solscan.io/account/{address}', tx: 'https://solscan.io/tx/{tx}' },
  },
  tron: {
    id: 'tron', family: 'tron', name: 'TRON', symbol: 'TRX', decimals: 6, bip44: 195,
    defaultRpc: 'https://api.trongrid.io',
    explorer: { address: 'https://tronscan.org/#/address/{address}', tx: 'https://tronscan.org/#/transaction/{tx}' },
  },
}

export function listChains(): ChainSpec[] { return Object.values(CHAINS) }
export function getChain(id: ChainId): ChainSpec {
  const c = CHAINS[id]
  if (!c) throw new Error(`unknown chain: ${id}`)
  return c
}

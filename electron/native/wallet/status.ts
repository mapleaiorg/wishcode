/**
 * High-level wallet facade used by slash commands, IPC handlers, and tools.
 *
 * Combines keystore lock state, address book, and balance queries into
 * ready-to-render shapes.
 */

import { hasKeystore, isUnlocked, publicAccounts, requireUnlocked } from './keystore.js'
import { CHAINS, type ChainId } from './chains.js'
import { getAllBalances, type Balance } from './balance.js'

const AUTO_LOCK_MS = 15 * 60 * 1000
let lastActivityTs = 0
export function markActivity(): void { lastActivityTs = Date.now() }

export interface WalletStatus {
  exists: boolean
  unlocked: boolean
  idleMsRemaining: number
}

export async function walletStatus(): Promise<WalletStatus> {
  const exists = hasKeystore()
  const unlocked = isUnlocked()
  const since = lastActivityTs === 0 ? 0 : Date.now() - lastActivityTs
  const idleMsRemaining = Math.max(0, AUTO_LOCK_MS - since)
  return { exists, unlocked, idleMsRemaining }
}

export interface WalletAccountView {
  chain: ChainId
  address: string
  derivationPath: string
  symbol: string
}

export async function walletAccounts(): Promise<WalletAccountView[]> {
  // Prefer the on-disk public cache so we can list addresses even while locked.
  const pub = publicAccounts()
  if (pub) {
    return (Object.entries(pub) as Array<[ChainId, { address: string; derivationPath: string }]>)
      .map(([chain, v]) => ({
        chain,
        address: v.address,
        derivationPath: v.derivationPath,
        symbol: CHAINS[chain].symbol,
      }))
  }
  // Fall back to in-memory derived set (requires unlock).
  if (!isUnlocked()) return []
  const accounts = requireUnlocked()
  return (Object.entries(accounts) as Array<[ChainId, typeof accounts[ChainId]]>).map(
    ([chain, a]) => ({
      chain,
      address: a.address,
      derivationPath: a.derivationPath,
      symbol: CHAINS[chain].symbol,
    }),
  )
}

export interface BalanceView {
  chain: ChainId
  symbol: string
  raw: string
  formatted: string
  usdValue?: number
}

export async function walletBalancesAll(
  usdPrices?: Partial<Record<string, number>>,
): Promise<BalanceView[]> {
  const accounts = await walletAccounts()
  if (accounts.length === 0) return []
  const addressBook: Partial<Record<ChainId, string>> = {}
  for (const a of accounts) addressBook[a.chain] = a.address
  const balances: Balance[] = await getAllBalances(addressBook)
  return balances.map((b) => {
    const amount = parseFloat(b.native.amount)
    const price = usdPrices?.[b.native.symbol]
    return {
      chain: b.chain,
      symbol: b.native.symbol,
      raw: b.native.raw,
      formatted: b.native.amount,
      usdValue: price != null && isFinite(amount) ? amount * price : undefined,
    }
  })
}

/**
 * Outbound transaction builder + broadcaster.
 *
 * Phase 1 scope:
 *   - EVM native-asset transfers (ETH/ARB/OP/BASE/MATIC/BNB).
 *     Fee-bumping logic: EIP-1559 where supported; legacy gasPrice otherwise.
 *   - BTC / Solana / TRON: throw `not-yet-supported`. The UI disables Send
 *     for these chains and suggests using an external wallet for now.
 *
 * Every broadcast is logged to the local sent-log via `appendSentTx`, even
 * if the remote history API won't surface it for a few blocks.
 */

import { ethers } from 'ethers'
import { getAccount, requireUnlocked } from './keystore.js'
import { getRpcUrl } from './rpc.js'
import { CHAINS, type ChainId } from './chains.js'
import { evaluate, recordSpend, type Policy, getPolicy } from './policy.js'
import { appendSentTx, type TxEntry } from './txHistory.js'
import { price as quotePrice } from '../trading/market.js'
import { createLogger } from '../core/logger.js'

const log = createLogger('wallet.send')

export interface FeeEstimate {
  chain: ChainId
  symbol: string
  /** decimal string of native asset (e.g. "0.000042" ETH). */
  fee: string
  feeRaw: string
  /** wei/sats per unit — gas price or fee rate */
  unitPrice: string
  /** Gas units estimated or known-constant (21000 for native transfer). */
  units: string
  /** EIP-1559 chains expose priorityFee separately. */
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
    limits: Policy
  }
}

function parseAmountToRaw(amount: string, decimals: number): bigint {
  const trimmed = amount.trim()
  if (!/^\d+(\.\d+)?$/.test(trimmed)) throw new Error(`invalid amount: ${amount}`)
  return ethers.parseUnits(trimmed, decimals)
}

function formatUnits(raw: bigint, decimals: number): string {
  return ethers.formatUnits(raw, decimals)
}

// ── Fee / preview ──────────────────────────────────────────────────

async function evmProvider(chain: ChainId): Promise<ethers.JsonRpcProvider> {
  return new ethers.JsonRpcProvider(getRpcUrl(chain))
}

async function estimateEvmFee(chain: ChainId, from: string, to: string, valueWei: bigint): Promise<FeeEstimate> {
  const provider = await evmProvider(chain)
  // 21_000 is the canonical native-transfer gas cost; let the node estimate anyway
  // in case of contract-wallet receivers.
  let gasUnits: bigint = 21_000n
  try {
    gasUnits = await provider.estimateGas({ from, to, value: valueWei })
  } catch { /* fallthrough — use default 21000 */ }

  const fee = await provider.getFeeData()
  const spec = CHAINS[chain]
  if (fee.maxFeePerGas != null) {
    const feeWei = fee.maxFeePerGas * gasUnits
    return {
      chain, symbol: spec.symbol,
      fee: formatUnits(feeWei, spec.decimals),
      feeRaw: feeWei.toString(),
      unitPrice: fee.maxFeePerGas.toString(),
      units: gasUnits.toString(),
      priorityFeeRaw: fee.maxPriorityFeePerGas?.toString(),
      maxFeePerGasRaw: fee.maxFeePerGas.toString(),
    }
  }
  // Legacy
  const gasPrice = fee.gasPrice ?? 0n
  const feeWei = gasPrice * gasUnits
  return {
    chain, symbol: spec.symbol,
    fee: formatUnits(feeWei, spec.decimals),
    feeRaw: feeWei.toString(),
    unitPrice: gasPrice.toString(),
    units: gasUnits.toString(),
  }
}

export async function previewSend(chain: ChainId, to: string, amount: string): Promise<SendPreview> {
  const spec = CHAINS[chain]
  if (spec.family !== 'evm') {
    throw new Error(`send on ${chain} (${spec.family}) is not yet supported in this build`)
  }
  if (!ethers.isAddress(to)) throw new Error(`invalid recipient address: ${to}`)

  const accounts = requireUnlocked()
  const from = accounts[chain].address
  const amountRaw = parseAmountToRaw(amount, spec.decimals)
  const fee = await estimateEvmFee(chain, from, to, amountRaw)
  const totalRaw = (amountRaw + BigInt(fee.feeRaw)).toString()

  let usdValue: number | undefined
  try {
    const q = await quotePrice(spec.symbol)
    if (q && isFinite(q.priceUsd)) usdValue = Number(amount) * q.priceUsd
  } catch { /* price optional */ }

  const verdict = evaluate({ chain, to, amountUsd: usdValue ?? 0 })
  return {
    chain, from, to,
    amount: formatUnits(amountRaw, spec.decimals),
    amountRaw: amountRaw.toString(),
    symbol: spec.symbol,
    decimals: spec.decimals,
    fee,
    totalRaw,
    usdValue,
    policy: {
      allowed: verdict.allowed,
      reasons: verdict.reasons,
      requiresPassphrase: verdict.requiresPassphrase,
      todaySpentUsd: verdict.todaySpentUsd,
      limits: getPolicy(),
    },
  }
}

// ── Broadcast ──────────────────────────────────────────────────────

export interface SendResult {
  hash: string
  chain: ChainId
  explorerUrl: string
}

export async function sendNative(opts: {
  chain: ChainId
  to: string
  amount: string
  /** Required when preview.policy.requiresPassphrase is true — UI enforces. */
  passphrase?: string
}): Promise<SendResult> {
  const { chain, to, amount, passphrase } = opts
  const spec = CHAINS[chain]
  if (spec.family !== 'evm') {
    throw new Error(`send on ${chain} (${spec.family}) is not yet supported in this build`)
  }
  if (!ethers.isAddress(to)) throw new Error(`invalid recipient address: ${to}`)

  const preview = await previewSend(chain, to, amount)
  if (!preview.policy.allowed) {
    throw new Error(`policy blocked send: ${preview.policy.reasons.join('; ')}`)
  }
  if (preview.policy.requiresPassphrase) {
    if (!passphrase) throw new Error('passphrase required for this amount (policy threshold)')
    // Re-verify by attempting a reveal.
    const { revealMnemonic } = await import('./keystore.js')
    revealMnemonic(passphrase)  // throws on bad passphrase
  }

  const account = getAccount(chain)
  const provider = await evmProvider(chain)
  const wallet = new ethers.Wallet('0x' + Buffer.from(account.privateKey).toString('hex'), provider)

  const amountRaw = parseAmountToRaw(amount, spec.decimals)
  const fee = await provider.getFeeData()
  const txRequest: ethers.TransactionRequest = { to, value: amountRaw }
  if (fee.maxFeePerGas != null) {
    txRequest.maxFeePerGas = fee.maxFeePerGas
    txRequest.maxPriorityFeePerGas = fee.maxPriorityFeePerGas ?? undefined
  } else if (fee.gasPrice != null) {
    txRequest.gasPrice = fee.gasPrice
  }

  log.info('sending', { chain, from: account.address, to, amount })
  const sent = await wallet.sendTransaction(txRequest)
  const hash = sent.hash
  const url = spec.explorer.tx.replace('{tx}', hash)

  // Record to local sent-log as pending
  const now = Math.floor(Date.now() / 1000)
  const pendingEntry: TxEntry = {
    chain, hash,
    direction: 'out',
    from: account.address, to,
    amount: preview.amount,
    amountRaw: preview.amountRaw,
    symbol: spec.symbol,
    feeRaw: preview.fee.feeRaw,
    feeSymbol: spec.symbol,
    timestamp: now,
    status: 'pending',
    explorerUrl: url,
    note: 'broadcast — waiting for confirmation',
  }
  appendSentTx(pendingEntry)
  if (preview.usdValue) recordSpend(preview.usdValue)

  return { hash, chain, explorerUrl: url }
}

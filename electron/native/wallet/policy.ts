/**
 * Wallet transaction policy gate.
 *
 * Before any signed outbound transaction is broadcast, it MUST pass the
 * policy gate. The gate evaluates:
 *   - daily spend cap (USD equivalent)
 *   - single-tx cap (USD equivalent)
 *   - chain allowlist
 *   - recipient allowlist / blocklist
 *   - 2-of-2 approval (user confirmation always; passphrase re-prompt for high-value)
 *
 * Policy lives at config.wallet.policy, editable by the user via UI or
 * config.set. Defaults are deliberately conservative.
 */

import { readConfig, writeConfig } from '../core/config.js'
import type { ChainId } from './chains.js'

export interface Policy {
  /** Max USD equivalent per single transaction. 0 = no limit (discouraged). */
  maxPerTxUsd: number
  /** Max USD equivalent per calendar day. 0 = no limit. */
  maxPerDayUsd: number
  /** If true, only allow outbound tx to addresses in `allowlist`. */
  allowlistOnly: boolean
  allowlist: string[]
  /** Reject outbound tx to any address in this list. */
  blocklist: string[]
  /** Subset of chains allowed for outbound tx. Empty = all enabled. */
  allowedChains: ChainId[]
  /** Require passphrase re-entry for tx above this USD equivalent. */
  passphraseThresholdUsd: number
}

const DEFAULT_POLICY: Policy = {
  maxPerTxUsd: 500,
  maxPerDayUsd: 2000,
  allowlistOnly: false,
  allowlist: [],
  blocklist: [],
  allowedChains: [],
  passphraseThresholdUsd: 100,
}

export function getPolicy(): Policy {
  const cfg = readConfig()
  return { ...DEFAULT_POLICY, ...(cfg.wallet?.policy ?? {}) }
}

export function setPolicy(patch: Partial<Policy>): Policy {
  const current = getPolicy()
  const next = { ...current, ...patch }
  writeConfig(cfg => {
    cfg.wallet = cfg.wallet ?? {}
    cfg.wallet.policy = next
    return cfg
  })
  return next
}

export interface PolicyCheck {
  chain: ChainId
  to: string
  amountUsd: number
}

export interface PolicyVerdict {
  allowed: boolean
  reasons: string[]
  requiresPassphrase: boolean
  todaySpentUsd: number
}

interface SpendLog {
  day: string  // YYYY-MM-DD
  totalUsd: number
}

function today(): string {
  return new Date().toISOString().slice(0, 10)
}

function loadSpendLog(): SpendLog {
  const cfg = readConfig()
  const log: SpendLog = cfg.wallet?.spendLog ?? { day: today(), totalUsd: 0 }
  if (log.day !== today()) return { day: today(), totalUsd: 0 }
  return log
}

function saveSpendLog(log: SpendLog): void {
  writeConfig(cfg => {
    cfg.wallet = cfg.wallet ?? {}
    cfg.wallet.spendLog = log
    return cfg
  })
}

export function evaluate(check: PolicyCheck): PolicyVerdict {
  const policy = getPolicy()
  const log = loadSpendLog()
  const reasons: string[] = []
  let allowed = true

  if (policy.maxPerTxUsd > 0 && check.amountUsd > policy.maxPerTxUsd) {
    reasons.push(`exceeds per-tx cap ($${policy.maxPerTxUsd.toFixed(2)})`)
    allowed = false
  }
  if (policy.maxPerDayUsd > 0 && log.totalUsd + check.amountUsd > policy.maxPerDayUsd) {
    reasons.push(`would exceed daily cap ($${policy.maxPerDayUsd.toFixed(2)}; already spent $${log.totalUsd.toFixed(2)})`)
    allowed = false
  }
  if (policy.allowedChains.length > 0 && !policy.allowedChains.includes(check.chain)) {
    reasons.push(`chain '${check.chain}' not in allowedChains`)
    allowed = false
  }
  if (policy.blocklist.map(a => a.toLowerCase()).includes(check.to.toLowerCase())) {
    reasons.push(`recipient blocked`)
    allowed = false
  }
  if (policy.allowlistOnly && !policy.allowlist.map(a => a.toLowerCase()).includes(check.to.toLowerCase())) {
    reasons.push(`recipient not in allowlist`)
    allowed = false
  }

  const requiresPassphrase = check.amountUsd >= policy.passphraseThresholdUsd

  return { allowed, reasons, requiresPassphrase, todaySpentUsd: log.totalUsd }
}

/** Record a successfully-broadcast transaction against the daily cap. */
export function recordSpend(amountUsd: number): void {
  const log = loadSpendLog()
  saveSpendLog({ day: today(), totalUsd: log.totalUsd + amountUsd })
}

---
name: portfolio-rebalancer
title: Portfolio Rebalancer
description: Propose a rebalance plan against a target allocation — computes drift, suggests swaps, respects wallet policy and gas.
version: 1.0.0
author: iBank
permissions: ask
tools:
  - wallet_balances
  - trading_price
  - wallet_quote_swap
  - memory_recall
triggers:
  - keywords: [rebalance, rebalancing, drift, target allocation, portfolio, reallocate, take profit, dca]
  - regex: "\\b(bring|move|set|get)\\s+(my\\s+)?portfolio\\s+(to|back to|closer to)"
---

# Portfolio Rebalancer

When the user asks to rebalance or review allocation drift, follow this procedure.

## 1. Load state
- Call `wallet_balances` to get every non-zero position across chains.
- Call `trading_price` (batched) to mark-to-market in USD.
- Load target allocation from memory key `portfolio.target` (recall via `memory_recall`). If absent, ask the user to specify. Store on confirmation.

## 2. Compute drift
For each asset `i`:
- `current_pct_i = usd_value_i / total_usd`
- `drift_i = current_pct_i − target_pct_i`
- Flag `|drift_i| > 5%` as "rebalance candidate".
- Flag `|drift_i| > 10%` as "high drift".

Present as a table (markdown):

| Asset | Target | Current | Drift | Action |
|------:|-------:|--------:|------:|:-------|
| ETH   | 40%    | 48%     | +8%   | Trim   |
| BTC   | 35%    | 29%     | −6%   | Add    |

## 3. Propose trades
- Group into `sell` and `buy` sides.
- Call `wallet_quote_swap` for each candidate swap to surface slippage + gas.
- **Never** call a swap execution tool in this skill — this is advisory only.
- Minimize hops: prefer direct pairs on the same chain. Flag if a bridge is required.

## 4. Respect policy
- Show the USD size of each proposed swap.
- If any single swap exceeds the wallet policy `maxPerTxUsd`, annotate "requires policy override".
- If the sum of swaps exceeds `maxPerDayUsd`, split across days and say so.

## 5. Output format

```
### Rebalance plan — {timestamp}

<table of drifts>

**Proposed swaps** (gas estimate included)
1. Sell 0.4 ETH → USDC on Base (~$X, gas ~$Y)
2. Buy 0.01 BTC with USDC on Arbitrum (~$X, gas ~$Y)
3. …

**Net effect**: brings portfolio within X% of target.
**Total gas**: ~$N.
**Next rebalance check-in**: in 30 days, or on >10% drift.
```

## 6. Guardrails
- Always confirm with the user before any execution.
- If target allocation is missing or stale (>90d), ask the user to refresh it.
- Flag stablecoin depeg risk if >1% away from $1.

---
name: defi-scout
title: DeFi Scout
description: Evaluate DeFi opportunities — yield, risk, TVL trend, audit status, exit liquidity, impermanent-loss modeling.
version: 1.0.0
author: iBank
permissions: ask
tools:
  - defi_pools
  - defi_protocol_stats
  - web_search
  - trading_price
  - memory_recall
triggers:
  - keywords: [yield, apy, apr, farm, farming, stake, staking, lend, lending, pool, liquidity, lp, defi, tvl, impermanent loss, il, vault]
  - regex: "\\bbest\\s+(yield|apy|farm|pool)s?\\b"
---

# DeFi Scout

Evaluate a DeFi opportunity or scan for options matching the user's criteria.

## 1. Clarify criteria (once)
If the question is open-ended, ask for:
- Asset(s) willing to deposit (single-sided or pair).
- Chain preference(s).
- Risk tolerance: conservative (blue-chip only), moderate, aggressive.
- Lock period tolerance.

## 2. Data gathering
- `defi_pools({asset, chain, minTvlUsd})` — candidates, sorted by risk-adjusted yield.
- `defi_protocol_stats(protocol)` — TVL 30d trend, fee revenue, token emissions.
- `web_search` — latest audit status, exploits in last 12 months.

## 3. Risk scoring
Each candidate is scored across:
- **Protocol age** (>2y preferred)
- **Audit coverage** (Spearbit / Trail of Bits / OpenZeppelin)
- **Oracle model** (Chainlink > Pyth > TWAP > none)
- **TVL trend** (stable or growing vs declining)
- **Yield source** (real fees vs token emissions)
- **Exit liquidity** (can you leave with a $X position in <5% slippage?)

Assign each a 1–5 score, show the matrix.

## 4. Impermanent loss (LP only)
If the pool is an LP position, compute expected IL for a ±20% and ±50% price move of the volatile side. Show the breakeven: yield must exceed IL to net positive.

## 5. Output

```
### DeFi opportunities for {asset} on {chain}

| Protocol | Pool | Net APY | TVL | Risk | Exit liquidity |
|:--|:--|--:|--:|:-:|:--|
| Aave v3 | USDC supply | 4.2% | $1.1B | Low | Instant |
| … | … | … | … | … | … |

**Top pick**: <protocol> — <one-line rationale>
**Avoid**: <protocol> — <concrete red flag>
**Next step**: if you deposit, start with ≤20% of earmarked capital; re-check TVL in 14 days.
```

## 6. Guardrails
- Always surface smart-contract risk — "yield is not risk-free" phrasing.
- Flag any protocol that has had an exploit in the last 12 months.
- Emphasize that high APY often = high emissions = temporary.
- Do not recommend positions that exceed 20% of the user's total portfolio without explicit acknowledgment.

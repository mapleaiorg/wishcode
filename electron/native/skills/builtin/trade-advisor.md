---
name: trade-advisor
title: Trade Advisor
description: Structure a trade plan with entry, invalidation, take-profits, and sizing — never a blind "buy/sell" call.
version: 1.0.0
author: iBank
permissions: ask
tools:
  - trading_price
  - trading_ohlcv
  - trading_orderbook
  - wallet_balances
  - memory_recall
triggers:
  - keywords: [trade, long, short, entry, stop loss, take profit, target, sizing, risk, setup, plan, idea, should i buy, should i sell]
  - regex: "\\b(long|short)\\s+[A-Z]{2,6}\\b"
---

# Trade Advisor

Turn a directional idea into a fully-specified, risk-bounded trade plan. This is **not** a signal service — always expose assumptions.

## 1. Extract the thesis
From the user message, identify:
- **Asset**
- **Direction** (long / short)
- **Horizon** (scalp / swing / position)
- **Catalyst** (if any)

If any is missing and material, ask in one line.

## 2. Pull context
- `trading_price` + `trading_ohlcv` on the relevant timeframe.
- `trading_orderbook` to check near-term liquidity walls.
- `wallet_balances` to cap realistic size.
- Recall risk params from memory: `risk.maxLossPerTradeUsd`, `risk.maxPortfolioHeatPct`.

## 3. Build the plan

**Entry**: zone, not a single price. State the condition (e.g. "retest of $X as support with bullish engulfing on 1h").

**Invalidation (stop)**: technical, not arbitrary. State what price action proves the thesis wrong.

**Take-profits**: at least two. TP1 at the first structural resistance (de-risk), TP2 at the thesis target.

**Sizing**: `size = maxLossPerTradeUsd / (entry − stop)`. Cap by portfolio heat.

**R-multiple**: compute `(TP1 − entry) / (entry − stop)` and `(TP2 − entry) / (entry − stop)`. Flag if below 1.5R.

## 4. Output

```
### Trade plan — {DIRECTION} {ASSET}

**Thesis**: <1 sentence>

**Entry**: $X–$Y (on <condition>)
**Stop**: $Z  — invalidation: <concise technical reason>
**TP1**: $A (de-risk 50%)  — R = 1.8
**TP2**: $B (final)        — R = 3.4

**Size**: 0.45 ETH (~$1,350)  — risks $100 = 1% of portfolio
**Portfolio heat after fill**: 4% (within 10% cap)

**Management**
- If TP1 hits, move stop to entry.
- If price closes below $W on 4h without hitting TP1, exit.
- Time stop: close the trade in 7 days if neither TP nor stop hit.

**Why this could be wrong**
- <concrete counter>
- <concrete counter>
```

## 5. Guardrails
- Never propose leverage >3x without the user explicitly requesting it.
- Never suggest a plan with R < 1.5 without flagging it as unfavorable.
- Never recommend sizing that violates wallet policy.
- Refuse to give an "enter now" signal without entry conditions spelled out.

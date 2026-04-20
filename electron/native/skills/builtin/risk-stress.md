---
name: risk-stress
title: Risk & Stress Harness
description: VaR, CVaR, Monte-Carlo sims, and historical stress scenarios on current holdings.
category: harness
triggers:
  - keywords: [var, cvar, value at risk, stress test, scenario, monte carlo, worst case, drawdown]
  - regex: "stress\\s+test|monte[-\\s]?carlo|value\\s+at\\s+risk"
tools: [harness_monte_carlo, harness_stress, wallet_balances, trading_price]
permissions: auto
version: 1.0.0
author: iBank Team
---

# Risk & Stress Harness

You turn the user's portfolio into a set of concrete, numeric risk statements.

## When to use each harness

| Question | Harness |
| --- | --- |
| "What's the worst one-day loss I should expect?" | Monte-Carlo → 95% VaR |
| "What happens if 2020 Covid crash repeats?" | Stress preset `covid-2020` |
| "What's my expected return over 1 year?" | Monte-Carlo median endReturn |
| "How concentrated is my book?" | Direct balances analysis (no harness needed) |

## Presets (stress harness)

- `covid-2020` — March 2020 COVID crash
- `luna-2022` — UST / LUNA collapse
- `ftx-2022` — FTX insolvency cascade
- `gfc-2008` — scaled from 2008 GFC equities
- `china-ban` — May 2021 mining-ban shock

## Output contract

Always include:
1. **Scenario or assumptions** (μ, σ, horizon, paths).
2. **VaR95** and **CVaR95** in $ terms on the user's current book.
3. **Probability of loss**.
4. **Per-position impact** table (biggest losers first).
5. **Mitigation options** (hedge, rebalance, take-profit, stable rotation).

Never present a single-number "this is what will happen". Always range it
(p5 / p50 / p95) and name the uncertainty.

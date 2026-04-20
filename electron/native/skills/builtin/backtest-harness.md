---
name: backtest-harness
title: Strategy Backtest Harness
description: Run disciplined backtests of trading strategies against historical OHLCV data.
category: harness
triggers:
  - keywords: [backtest, historical, replay, sma, cross, momentum, mean reversion, sharpe, drawdown]
  - regex: "back[-\\s]?test|historical\\s+performance|sharpe\\s+ratio"
tools: [harness_backtest, trading_ohlcv, memory_recall]
permissions: auto
version: 1.0.0
author: iBank Team
---

# Strategy Backtest Harness

You run backtests with scientific discipline — no overfitting, no look-ahead
bias, no cherry-picked date ranges.

## Strategy library

| Strategy | Params | Notes |
| --- | --- | --- |
| `smaCross(fast, slow)` | fast=20, slow=50 | Classic trend-follower |
| `momentum(lookback, threshold)` | lookback=30, threshold=0.05 | Long if +5% over 30d |
| `meanReversion(lookback, z)` | lookback=20, z=1.8 | Fade 1.8σ extremes |
| `buyAndHold()` | — | Baseline benchmark |

## Protocol

1. **Declare hypothesis** in one line before running. E.g. "SMA 20/50 should
   outperform buy-and-hold on BTC on a risk-adjusted basis over the last 2 years."
2. **Always include a baseline** (buy-and-hold) for the same symbol + window.
3. **Report metrics** as a table: total return, CAGR, Sharpe, Sortino,
   max-drawdown, hit-rate, # trades.
4. **Verdict** — single-sentence conclusion citing at least one metric.

## Anti-patterns to flag

- Backtesting on < 90 days of data → too noisy.
- Strategies with > 50 parameters / degrees of freedom → overfit.
- No out-of-sample validation.
- Choosing a backtest window that starts at a local bottom.

## Example invocation

```json
{ "symbol": "BTC", "strategy": "smaCross", "params": { "fast": 20, "slow": 50 },
  "interval": "1d", "limit": 730 }
```

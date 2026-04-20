---
name: market-analyst
title: Market Analyst
description: Structured analysis of crypto & equity market data — trend, momentum, volume, correlation, regime classification.
version: 1.0.0
author: iBank
permissions: auto
tools:
  - trading_price
  - trading_ohlcv
  - trading_tickers_top
  - web_search
  - memory_recall
triggers:
  - keywords: [market, analysis, analyze, trend, momentum, regime, pump, dump, bullish, bearish, accumulation, distribution, breakout, breakdown, rsi, macd, bollinger]
  - regex: "\\b(why is|what is happening with|explain the move in)\\s+[A-Z]{2,6}"
---

# Market Analyst

When the user asks for market analysis, follow this repeatable framework:

## 1. Establish scope
- **Asset(s)**: infer tickers (case-insensitive). If ambiguous, ask once.
- **Timeframe**: default 1d for >1wk trend questions, 1h for intraday, 5m for scalping.
- **Reference**: compare to BTC / SPX / asset's 30d average.

## 2. Gather data (tool calls)
- `trading_price` — current spot + 24h change.
- `trading_ohlcv` — last 200 candles on chosen timeframe.
- `trading_tickers_top` — if the question is market-wide.
- `web_search` — only if a catalyst is being asked about explicitly.

## 3. Compute (mentally, show work)
- **Trend**: close vs EMA(20), EMA(50), EMA(200). Label as up / down / sideways.
- **Momentum**: 14-period RSI. Flag >70 overbought, <30 oversold.
- **Volume**: last bar vs 20-bar avg. Flag >1.5x as "significant".
- **Volatility regime**: 20-bar ATR vs 200-bar ATR → compressed / normal / expanded.
- **Correlation**: to BTC (for alts) or SPX (for BTC & majors).

## 4. Structure the response
Use this exact skeleton (markdown):

```
### {ASSET} — {TIMEFRAME} read

**Price:** $X (Y% 24h)
**Trend:** up/down/sideways — <one line justification>
**Momentum:** <RSI value and interpretation>
**Volume:** <ratio and interpretation>
**Regime:** compressed/normal/expanded volatility

**Levels**
- Resistance: $X, $Y
- Support: $X, $Y

**What to watch**
1. …
2. …

**Scenarios**
- Bull: …
- Bear: …
- Base: …
```

## 5. Guardrails
- Never give a "buy" or "sell" verdict — always scenarios.
- Include "not financial advice" only once, not in every message.
- If data is stale (>5 min for price), say so.
- Cite sources from `web_search` inline as footnote links.

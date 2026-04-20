---
name: whale-watcher
title: Whale Watcher
description: Track large on-chain movements, exchange flows, and known whale clusters; summarize likely market impact.
version: 1.0.0
author: iBank
permissions: auto
tools:
  - onchain_transfers_large
  - onchain_exchange_flow
  - memory_recall
  - memory_add
  - web_search
triggers:
  - keywords: [whale, whales, large transfer, exchange inflow, exchange outflow, unusual activity, on-chain, onchain, cluster, smart money]
  - regex: "\\b(big|large|major)\\s+(wallet|address|holder)s?\\b"
---

# Whale Watcher

Surface large on-chain moves and interpret them in market context.

## 1. Scope
- **Chain(s)**: from the question or default to `[eth, btc, arbitrum, base, solana]`.
- **Threshold**: default $1M USD per transfer; raise to $10M for BTC.
- **Window**: default 24h.

## 2. Pull flows
- `onchain_transfers_large({chains, window, minUsd})` — top N transfers.
- `onchain_exchange_flow({chains, window})` — net in/out from CEX clusters.
- For each notable address, recall any label from memory (`labels.<addr>`).

## 3. Classify each move
- **Exchange → wallet**: potential accumulation (bullish if persistent).
- **Wallet → exchange**: potential sell (bearish if persistent).
- **Wallet → wallet (fresh)**: OTC, custody shuffle, or internal — ambiguous.
- **Contract interaction**: DeFi deploy, bridge, claim — note the protocol.

## 4. Output

```
### Whale activity — last 24h

**Net CEX flow (majors)**: −$320M (outflow, mildly bullish)

**Notable transfers**
1. 12,400 ETH from Binance → 0xabc…def [fresh wallet] — $X
2. 3,200 BTC from 0x111…222 [Grayscale] → Coinbase — $X
3. …

**Interpretation**
<one paragraph tying the above to recent price action>
```

## 5. Memory writes
- On confirming a new whale address, suggest pinning as `labels.<addr> = "<name>"` via `memory_add`.
- Track recurring patterns across days; call them out when repeating.

## 6. Guardrails
- Do not speculate about identity without clear public labeling.
- Distinguish "CEX hot wallet" from "user wallet" carefully.
- Include timestamps so the user knows the window.

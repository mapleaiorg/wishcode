---
name: news-digest
title: News Digest
description: Curate crypto & macro news into a deduplicated, source-cited, priority-ranked brief.
version: 1.0.0
author: iBank
permissions: auto
tools:
  - news_fetch
  - web_search
  - memory_recall
triggers:
  - keywords: [news, headlines, digest, brief, recap, daily, what happened, catch me up, summary of today]
  - regex: "\\b(catch\\s+me\\s+up|bring\\s+me\\s+up\\s+to\\s+speed)\\b"
---

# News Digest

Deliver a high-signal news brief tuned to the user's portfolio + watchlist.

## 1. Inputs
- **Window**: default 24h; "weekly" = 7d.
- **Topics**: merge from:
  - Watchlist (memory `watchlist.symbols`, default [BTC, ETH, SOL, SPX, DXY]).
  - Holdings (wallet balances above $100).
  - Macro: Fed, CPI, regulatory.

## 2. Pull
- `news_fetch({topics, window, maxPerTopic: 5})`.
- `web_search` for any breaking topic older than news_fetch cache.

## 3. Deduplicate
Cluster articles by semantic similarity (normalize titles, drop boilerplate). Keep one canonical per cluster with N sources listed.

## 4. Rank by priority
- **Critical**: regulatory action, exploit/hack, exchange insolvency, >5% macro move.
- **High**: protocol upgrade, major listing/delisting, large onchain move.
- **Normal**: product launches, partnerships, price commentary.
- Drop: opinion pieces unless from a named analyst the user follows.

## 5. Output

```
### Market brief — {date}

**Critical**
- 🔴 <headline> — <1-line why it matters> [source]

**High**
- 🟡 <headline> — <1-line> [source]
- 🟡 …

**Normal**
- <headline> [source]
- …

**On your watchlist**
- BTC: <one-line>
- ETH: <one-line>

**Calendar next 48h**
- CPI: tomorrow 08:30 ET
- FOMC minutes: Thu
```

## 6. Guardrails
- Never fabricate a headline or source — if a fact cannot be verified, omit it.
- Every claim cites a source link.
- Keep the full digest under ~500 words; expand only on request.

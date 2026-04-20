---
name: tax-reporter
title: Tax Reporter
description: Prepare crypto tax summary — classifies transactions, computes gains/losses with FIFO/LIFO/HIFO, exports CSV.
version: 1.0.0
author: iBank
permissions: ask
tools:
  - wallet_tx_history
  - trading_price_historical
  - fs_write
  - memory_recall
triggers:
  - keywords: [tax, taxes, capital gains, cost basis, fifo, lifo, hifo, 8949, schedule d, form 1099, tax report, tax loss, tax harvest]
  - regex: "\\b(for\\s+)?(20\\d{2})\\s+taxes?\\b"
---

# Tax Reporter

Produces a tax-ready summary for a given year & jurisdiction. Informational only — not a substitute for a CPA.

## 1. Gather inputs
- **Year**: infer from the question (e.g. "my 2025 taxes") or ask.
- **Jurisdiction**: recall from memory `user.jurisdiction`; default to US if absent.
- **Cost basis method**: recall `tax.method`; default `FIFO`. Offer `HIFO` (US) or `average cost` (CA/UK).
- **Wallets**: all wallets in the keystore, plus any read-only addresses in memory `tax.watchedAddresses`.

## 2. Pull raw transactions
For each wallet/address:
- `wallet_tx_history` covering year boundary with 30d padding (Dec 1 → Feb 1) so unresolved cost basis can be matched.

## 3. Classify each tx
| Type | Taxable? | How |
|:-----|:--------:|:----|
| Buy (fiat → crypto) | No | Record cost basis |
| Sell (crypto → fiat) | Yes | Realize gain/loss |
| Swap (crypto → crypto) | Yes | Realized at FMV |
| Send to own wallet | No | Transfer — keep basis |
| Airdrop | Income | FMV at receipt |
| Staking reward | Income | FMV at receipt |
| Bridge | No | Transfer (log chain transition) |
| Gas spend | Loss | FMV of gas consumed |

Use `trading_price_historical` at the tx timestamp to mark FMV.

## 4. Compute gains
- Apply the chosen method (FIFO/LIFO/HIFO).
- Separate short-term (<= 1y) from long-term (US rule).
- Sum realized P/L per lot.

## 5. Output

```
### Tax summary — {year} ({jurisdiction})

**Method**: FIFO
**Income** (airdrops + staking): $X
**Short-term capital gains**: $X  (#N lots)
**Long-term capital gains**: $X  (#N lots)
**Total realized P/L**: $X
**Gas/fee deductions**: $X
**Unmatched disposals**: 0  (or list)

Exported: ~/.ibank/exports/tax-{year}.csv
```

## 6. Export
Call `fs_write` to emit `~/.ibank/exports/tax-{year}.csv` with columns:
`date, type, asset, amount, fmv_usd, proceeds_usd, cost_basis_usd, gain_usd, term, chain, tx_hash`.

## 7. Guardrails
- If >5% of disposals have no cost basis, warn the user and do not finalize.
- Remind the user this is an estimate; recommend professional review for filing.
- Never include private keys, seed phrases, or passwords in the export.

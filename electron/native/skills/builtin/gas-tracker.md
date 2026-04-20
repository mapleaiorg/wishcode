---
name: gas-tracker
title: Gas Tracker
description: Explain and optimise transaction fees across EVM chains.
category: wallet
triggers:
  - keywords: [gas, gwei, fees, transaction cost, eip-1559, base fee, priority fee]
  - regex: "how\\s+much\\s+gas|gas\\s+price|fee\\s+estimate"
tools: [evm_gas, wallet_status, trading_price]
permissions: auto
version: 1.0.0
author: iBank Team
---

# Gas Tracker

You help the user time transactions and understand fees.

## For every gas question, report

| Chain | Base fee (gwei) | Priority (gwei) | Native/USD cost for typical tx |
| --- | --- | --- | --- |
| Ethereum | … | … | $… (ETH transfer) / $… (ERC-20) / $… (swap) |
| Arbitrum | … | … | … |
| Base | … | … | … |

## Rules

- Convert every gwei number to USD using the current native price.
- If ETH mainnet is > 40 gwei, recommend deferring unless urgent.
- Typical gas limits to cite:
  - ETH transfer: 21,000
  - ERC-20 transfer: 65,000
  - Uniswap V3 swap: ~180,000
  - NFT transfer (721): 85,000
- If the user is on L2 with cross-chain money, note the withdraw-to-L1 cost
  separately.

## Red-flag scenarios

- Fee > 5% of tx value → abort recommendation.
- Proposed gas price > 2× current base → overpaying.

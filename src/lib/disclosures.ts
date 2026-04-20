/**
 * Non-advice disclosure text constants.
 *
 * Every AI-powered or money-moving surface renders one of these. Copy is
 * intentionally compliance-safe: iBank is self-custodial, not advisory.
 */

export const NON_ADVICE_SHORT =
  'Informational and educational use only. Not investment, legal, or tax advice.'

export const NON_ADVICE_LONG =
  'iBank provides informational, educational, and analytical content only. ' +
  'Nothing here is investment, legal, or tax advice. iBank does not custody ' +
  'client assets — you hold the keys. The AI agent may explain, summarize, ' +
  'compare, and prepare, but never recommends personalized allocations and ' +
  'never signs or broadcasts transactions on your behalf.'

export const SWAP_DISCLOSURE =
  'Swap execution is routed through disclosed third-party providers. iBank ' +
  'is not the liquidity provider and earns no spread on your trades. ' +
  'Review the route, provider, fee, and slippage carefully before signing. ' +
  'Blockchain transactions are irreversible.'

export const SEND_DISCLOSURE =
  'Review the chain, recipient, amount, and fee carefully. ' +
  'Blockchain transactions are irreversible once broadcast.'

export const TOKEN_RESEARCH_DISCLOSURE =
  'Token information is compiled from public market data for research and ' +
  'education. It is not a recommendation to buy, sell, or hold. Always ' +
  'verify against official project sources.'

export const EXPORT_DISCLOSURE =
  'CSV exports summarize on-chain activity recorded locally by iBank. ' +
  'Cost-basis, realized gains, and tax treatments are approximations — ' +
  'consult a qualified tax professional before filing.'

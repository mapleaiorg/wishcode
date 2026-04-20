/**
 * RPC endpoint resolution (+ simple round-trip helper).
 *
 * Respects user overrides: config.wallet.rpcOverrides[<chainId>] = "https://…"
 * Otherwise uses CHAINS[id].defaultRpc.
 */

import { readConfig } from '../core/config.js'
import { CHAINS, type ChainId, type ChainSpec } from './chains.js'

export function getRpcUrl(chain: ChainId): string {
  const cfg = readConfig()
  const override = cfg.wallet?.rpcOverrides?.[chain] as string | undefined
  return override || CHAINS[chain].defaultRpc
}

export async function evmJsonRpc(chain: ChainId, method: string, params: any[] = []): Promise<any> {
  const url = getRpcUrl(chain)
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
    signal: AbortSignal.timeout(10_000),
  })
  if (!r.ok) throw new Error(`${chain} rpc ${method} -> ${r.status}`)
  const data = await r.json() as any
  if (data.error) throw new Error(`${chain} rpc ${method}: ${data.error.message ?? JSON.stringify(data.error)}`)
  return data.result
}

export function chainSpec(id: ChainId): ChainSpec { return CHAINS[id] }

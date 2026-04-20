/**
 * NFT asset holdings — ERC-721 / ERC-1155 read-side support.
 *
 * Responsibilities
 * ─────────────────
 * 1. Maintain a local index (`~/.ibank/nft/index.json`) of NFTs the user owns
 *    across the wallet's EVM accounts, plus a metadata cache keyed by
 *    `<chain>:<contract>:<tokenId>`.
 * 2. Refresh via the active chain RPC using Transfer event logs + ERC-721
 *    `tokenURI` / ERC-1155 `uri` / ERC-165 interface probes.
 * 3. Resolve tokenURI (ipfs:// → https gateway) and cache the parsed JSON
 *    metadata (name, description, image, attributes).
 * 4. Transfer out (read-side helper builds the calldata; actual signing +
 *    broadcast hooks into wallet/keystore.ts when the policy gate allows).
 *
 * Scope intentionally read-heavy: we never silently send NFTs — the transfer
 * builder returns the unsigned tx to the UI/tools layer, which must then go
 * through the same policy + passphrase re-prompt as ERC-20 sends.
 *
 * Supported chains: eth, arbitrum, optimism, base, polygon, bsc.
 * Solana/TRON/BTC NFT support is out of scope for this phase.
 */

import * as fs from 'fs'
import * as path from 'path'
import { paths, ensureAllDirs } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import { emit } from '../core/events.js'
import { evmJsonRpc } from './rpc.js'
import type { ChainId } from './chains.js'

const log = createLogger('nft')

export type NftStandard = 'erc721' | 'erc1155' | 'unknown'

export interface NftAttribute {
  trait_type: string
  value: string | number
  display_type?: string
}

export interface NftMetadata {
  name?: string
  description?: string
  image?: string            // gateway-rewritten URL
  externalUrl?: string
  attributes?: NftAttribute[]
  raw?: unknown             // original JSON
}

export interface NftAsset {
  /** Stable primary key: `<chain>:<contract>:<tokenId>`. */
  key: string
  chain: ChainId
  contract: string          // lower-cased address
  tokenId: string           // hex or decimal string — preserved as-is
  standard: NftStandard
  owner: string             // lower-cased
  balance: string           // "1" for 721; arbitrary for 1155
  acquiredAt?: number
  metadata?: NftMetadata
  /** Cache marker — so we can force-refresh stale entries. */
  metadataFetchedAt?: number
}

export interface NftIndex {
  version: 1
  updatedAt: number
  assets: Record<string, NftAsset>
}

// ── EVM selectors ──────────────────────────────────────────────────
//   balanceOf(address) → uint256         : 0x70a08231
//   ownerOf(uint256) → address           : 0x6352211e
//   tokenURI(uint256) → string           : 0xc87b56dd
//   uri(uint256) → string (ERC-1155)     : 0x0e89341c
//   supportsInterface(bytes4) → bool     : 0x01ffc9a7
//   ERC-721 interface id                 : 0x80ac58cd
//   ERC-1155 interface id                : 0xd9b67a26
//   Transfer(address,address,uint256)    : topic0 0xddf252ad…8b3d80b4c
//   TransferSingle(op,from,to,id,v)      : topic0 0xc3d58168b4b4...
//   TransferBatch(op,from,to,ids,vals)   : topic0 0x4a39dc06d4c…1bc

const SEL_BALANCE_OF = '0x70a08231'
const SEL_OWNER_OF = '0x6352211e'
const SEL_TOKEN_URI = '0xc87b56dd'
const SEL_URI_1155 = '0x0e89341c'
const SEL_SUPPORTS = '0x01ffc9a7'
const IFACE_721 = '0x80ac58cd'
const IFACE_1155 = 'd9b67a26'

const TOPIC_TRANSFER_721 = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef'
const TOPIC_TRANSFER_1155_SINGLE = '0xc3d58168c5ae7397731d063d5bbf3d657854427343f4c083240f7aacaa2d0f62'
const TOPIC_TRANSFER_1155_BATCH = '0x4a39dc06d4c0dbc64b70af90fd698a233a518aa5d07e595d983b8c0526c8f7fb'

const EVM_CHAINS: ChainId[] = ['eth', 'arbitrum', 'optimism', 'base', 'polygon', 'bsc']

function indexFilePath(): string {
  return path.join(paths().nftDir, 'index.json')
}

function readIndex(): NftIndex {
  ensureAllDirs()
  const f = indexFilePath()
  if (!fs.existsSync(f)) return { version: 1, updatedAt: 0, assets: {} }
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as NftIndex
  } catch (err) {
    log.warn('index parse failed, resetting', { err: (err as Error).message })
    return { version: 1, updatedAt: 0, assets: {} }
  }
}

function writeIndex(ix: NftIndex): void {
  ensureAllDirs()
  const tmp = indexFilePath() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(ix, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, indexFilePath())
}

// ── Public API ─────────────────────────────────────────────────────

/** Return all cached NFT assets across chains, sorted newest-first. */
export function listNfts(filter?: { chain?: ChainId; owner?: string }): NftAsset[] {
  const ix = readIndex()
  let out = Object.values(ix.assets)
  if (filter?.chain) out = out.filter((n) => n.chain === filter.chain)
  if (filter?.owner) {
    const o = filter.owner.toLowerCase()
    out = out.filter((n) => n.owner === o)
  }
  return out.sort((a, b) => (b.acquiredAt ?? 0) - (a.acquiredAt ?? 0))
}

/** Get a single asset by its `<chain>:<contract>:<tokenId>` key. */
export function getNft(key: string): NftAsset | null {
  return readIndex().assets[key] ?? null
}

/**
 * Incrementally index NFTs for the given EVM address on a given chain by
 * scanning recent Transfer events where `to = owner` and then verifying
 * current balance via ownerOf / balanceOf.
 *
 * `fromBlock` defaults to (tip – 200k) — enough for retail use without
 * spamming RPC. Heavy users should plug in an indexer API (Alchemy/Infura);
 * we only read public RPC here.
 */
export async function refreshNfts(
  chain: ChainId,
  owner: string,
  opts: { fromBlock?: number; maxLogs?: number } = {},
): Promise<{ added: number; removed: number; total: number }> {
  if (!EVM_CHAINS.includes(chain)) {
    throw new Error(`NFT scan not supported on ${chain} (EVM only)`)
  }
  const lc = owner.toLowerCase()
  const ix = readIndex()

  // 1. Resolve block range.
  const tipHex: string = await evmJsonRpc(chain, 'eth_blockNumber', [])
  const tip = parseInt(tipHex, 16)
  const from = opts.fromBlock ?? Math.max(0, tip - 200_000)
  const maxLogs = opts.maxLogs ?? 5_000

  const ownerTopic = '0x' + '0'.repeat(24) + lc.replace(/^0x/, '')
  log.info('refresh start', { chain, owner: lc, fromBlock: from, tip })

  const logs721 = await safeLogs(chain, {
    fromBlock: '0x' + from.toString(16),
    toBlock: 'latest',
    topics: [TOPIC_TRANSFER_721, null, ownerTopic], // to = owner
  })
  const logs1155S = await safeLogs(chain, {
    fromBlock: '0x' + from.toString(16),
    toBlock: 'latest',
    topics: [TOPIC_TRANSFER_1155_SINGLE, null, null, ownerTopic],
  })

  const touched = new Set<string>()
  let added = 0

  for (const lg of logs721.slice(0, maxLogs)) {
    const contract = String(lg.address).toLowerCase()
    const tokenIdHex = lg.topics[3]
    if (!tokenIdHex) continue
    const key = `${chain}:${contract}:${tokenIdHex}`
    touched.add(key)
    if (!ix.assets[key]) {
      const asset: NftAsset = {
        key, chain, contract,
        tokenId: tokenIdHex,
        standard: 'erc721',
        owner: lc,
        balance: '1',
        acquiredAt: Date.now(),
      }
      ix.assets[key] = asset
      added++
    }
  }
  for (const lg of logs1155S.slice(0, maxLogs)) {
    const contract = String(lg.address).toLowerCase()
    // data = id (32b) + value (32b)
    const data: string = lg.data ?? '0x'
    if (data.length < 2 + 64 * 2) continue
    const idHex = '0x' + data.slice(2, 2 + 64)
    const valHex = '0x' + data.slice(2 + 64, 2 + 128)
    const key = `${chain}:${contract}:${idHex}`
    touched.add(key)
    if (!ix.assets[key]) {
      ix.assets[key] = {
        key, chain, contract,
        tokenId: idHex,
        standard: 'erc1155',
        owner: lc,
        balance: BigInt(valHex).toString(),
        acquiredAt: Date.now(),
      }
      added++
    }
  }

  // 2. Verify current holdings for touched assets. For 721 use ownerOf;
  //    for 1155 use balanceOf(owner, id). Drop entries where we no longer
  //    hold the token.
  let removed = 0
  for (const key of touched) {
    const a = ix.assets[key]
    if (!a) continue
    try {
      if (a.standard === 'erc721') {
        const res = await evmCall(chain, a.contract, SEL_OWNER_OF + pad32(a.tokenId))
        const current = '0x' + res.slice(-40)
        if (current.toLowerCase() !== lc) {
          delete ix.assets[key]; removed++
        }
      } else {
        const res = await evmCall(chain, a.contract, SEL_BALANCE_OF + padAddr(lc) + pad32(a.tokenId))
        const bal = BigInt(res || '0x0')
        if (bal === 0n) { delete ix.assets[key]; removed++ }
        else a.balance = bal.toString()
      }
    } catch (err) {
      log.warn('ownership check failed', { key, err: (err as Error).message })
    }
  }

  // 3. Hydrate metadata for newly-added assets.
  const fresh = Object.values(ix.assets).filter(
    (a) => a.chain === chain && a.owner === lc && !a.metadata,
  )
  for (const a of fresh.slice(0, 40)) {
    try {
      a.metadata = await fetchMetadata(a)
      a.metadataFetchedAt = Date.now()
    } catch (err) {
      log.debug('metadata fetch failed', { key: a.key, err: (err as Error).message })
    }
  }

  ix.updatedAt = Date.now()
  writeIndex(ix)
  emit('nft.updated', {
    chain, owner: lc, added, removed, total: Object.values(ix.assets).length,
  })
  return { added, removed, total: Object.values(ix.assets).length }
}

/** Force re-fetch metadata for a single cached asset. */
export async function refreshMetadata(key: string): Promise<NftAsset | null> {
  const ix = readIndex()
  const a = ix.assets[key]
  if (!a) return null
  try {
    a.metadata = await fetchMetadata(a)
    a.metadataFetchedAt = Date.now()
    writeIndex(ix)
    emit('nft.updated', { key })
    return a
  } catch (err) {
    log.warn('refreshMetadata failed', { key, err: (err as Error).message })
    return null
  }
}

/**
 * Build an unsigned transfer tx for an NFT. The caller (wallet/keystore or
 * a tool) is responsible for signing + broadcasting under the current
 * spending policy.
 */
export function buildTransferTx(
  asset: NftAsset,
  to: string,
  opts: { amount?: string } = {},
): { to: string; data: string; chain: ChainId } {
  const contract = asset.contract
  const from = asset.owner
  if (asset.standard === 'erc721') {
    //   safeTransferFrom(address,address,uint256) → 0x42842e0e
    const data = '0x42842e0e' + padAddr(from) + padAddr(to) + pad32(asset.tokenId)
    return { to: contract, data, chain: asset.chain }
  }
  if (asset.standard === 'erc1155') {
    //   safeTransferFrom(address,address,uint256,uint256,bytes) → 0xf242432a
    //   bytes offset = 0xa0 (160), data length = 0
    const amount = opts.amount ?? asset.balance
    const data =
      '0xf242432a' +
      padAddr(from) + padAddr(to) +
      pad32(asset.tokenId) +
      pad32(BigInt(amount).toString(16)) +
      pad32('0xa0') + pad32('0x0')
    return { to: contract, data, chain: asset.chain }
  }
  throw new Error('unsupported NFT standard for transfer: ' + asset.standard)
}

// ── Internals ──────────────────────────────────────────────────────

async function safeLogs(chain: ChainId, filter: Record<string, unknown>): Promise<any[]> {
  try {
    const res = await evmJsonRpc(chain, 'eth_getLogs', [filter])
    return Array.isArray(res) ? res : []
  } catch (err) {
    log.warn('eth_getLogs failed (likely block range too wide)', { chain, err: (err as Error).message })
    return []
  }
}

async function evmCall(chain: ChainId, to: string, data: string): Promise<string> {
  return evmJsonRpc(chain, 'eth_call', [{ to, data }, 'latest'])
}

async function fetchMetadata(a: NftAsset): Promise<NftMetadata | undefined> {
  const uri = await tokenUri(a)
  if (!uri) return undefined
  const url = rewriteIpfs(uri.replace(/\{id\}/g, a.tokenId.replace(/^0x/, '').padStart(64, '0')))
  if (!/^https?:/.test(url)) return undefined
  const r = await fetch(url, { signal: AbortSignal.timeout(8_000) })
  if (!r.ok) return undefined
  const j = await r.json() as any
  return {
    name: typeof j.name === 'string' ? j.name : undefined,
    description: typeof j.description === 'string' ? j.description : undefined,
    image: rewriteIpfs(typeof j.image === 'string' ? j.image : j.image_url ?? ''),
    externalUrl: typeof j.external_url === 'string' ? j.external_url : undefined,
    attributes: Array.isArray(j.attributes) ? j.attributes : undefined,
    raw: j,
  }
}

async function tokenUri(a: NftAsset): Promise<string | null> {
  const sel = a.standard === 'erc1155' ? SEL_URI_1155 : SEL_TOKEN_URI
  try {
    const res = await evmCall(a.chain, a.contract, sel + pad32(a.tokenId))
    if (!res || res === '0x') return null
    return decodeStringResult(res)
  } catch {
    return null
  }
}

function decodeStringResult(hex: string): string | null {
  // ABI: offset(32) | length(32) | bytes...
  if (!hex.startsWith('0x')) hex = '0x' + hex
  const buf = Buffer.from(hex.slice(2), 'hex')
  if (buf.length < 64) return null
  const lenBuf = buf.subarray(32, 64)
  const len = Number(BigInt('0x' + lenBuf.toString('hex')))
  if (len === 0 || 64 + len > buf.length) return null
  return buf.subarray(64, 64 + len).toString('utf8')
}

function rewriteIpfs(u: string): string {
  if (!u) return ''
  if (u.startsWith('ipfs://')) return 'https://ipfs.io/ipfs/' + u.slice(7)
  if (u.startsWith('ar://')) return 'https://arweave.net/' + u.slice(5)
  return u
}

function padAddr(a: string): string {
  return a.replace(/^0x/, '').toLowerCase().padStart(64, '0')
}

function pad32(v: string): string {
  const clean = v.replace(/^0x/, '')
  // If the value looks decimal (no hex chars), convert.
  if (/^[0-9]+$/.test(clean) && clean.length < 64) {
    return BigInt(clean).toString(16).padStart(64, '0')
  }
  return clean.padStart(64, '0')
}

/** Wipe every cached NFT. */
export function clearNftIndex(): void {
  writeIndex({ version: 1, updatedAt: Date.now(), assets: {} })
  emit('nft.updated', { cleared: true })
}

/** Suppress unused-import lint for the 1155 interface id (we reserve it for
 * future supportsInterface probe heuristics). */
export const _RESERVED_IFACE = { IFACE_1155 }
// Note: IFACE_721 + SEL_SUPPORTS + TOPIC_TRANSFER_1155_BATCH are held for the
// classification pass in a follow-up — keep exported for reflection.
export const _KNOWN = { SEL_SUPPORTS, IFACE_721, TOPIC_TRANSFER_1155_BATCH }

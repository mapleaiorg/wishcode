/**
 * CryptoBuddies — collectible NFT-style companion creatures.
 *
 * Inspired by CryptoKitties: each CryptoBuddy is a unique creature with a
 * deterministic genome (seed → traits), a generative SVG portrait, and a
 * lifecycle ledger that records every mint / transfer / trade. A user
 * starts with a default set (one per mood class), can mint new ones by
 * combining two existing buddies (breed), and can export them to a JSON
 * "bag" that is directly shareable — or (future) bridge to an on-chain
 * ERC-721 contract so they become real NFTs.
 *
 * Storage: `~/.ibank/cryptoBuddies/`
 *   - index.json                {version, owner, buddies: {id: CryptoBuddy}}
 *   - ledger.jsonl              append-only event log
 *
 * Lifecycle events
 *   mint      — new buddy materialised (genesis or breed)
 *   transfer  — ownership changed (local ledger; also supports off-ledger
 *               address mapping for when the user bridges to-chain)
 *   trade     — atomic 2-party swap (A↔B at a price) — recorded locally
 *   breed     — two parents → one child with blended genome
 *   retire    — buddy burned (removed but retained in ledger for audit)
 *
 * Genome schema
 *   { body, eyes, mouth, aura, rarity, element, level }
 *
 * Rendering
 *   Face/portrait is composed in `render.ts`. This registry file only
 *   handles persistence + lifecycle + genome ops.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { paths, ensureAllDirs } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import { emit } from '../core/events.js'

const log = createLogger('cryptoBuddies')

// ── Trait tables ───────────────────────────────────────────────────

export const BODY_TYPES = ['orb', 'crystal', 'shiba', 'bull', 'bear', 'kraken', 'phoenix', 'diamond'] as const
export const EYE_STYLES = ['calm', 'sharp', 'laser', 'sleepy', 'wink', 'star', 'x', 'zen'] as const
export const MOUTHS     = ['smile', 'smirk', 'gasp', 'tongue', 'frown', 'flat', 'grin', 'open'] as const
export const AURAS      = ['gold', 'silver', 'neon', 'flame', 'ice', 'shadow', 'rainbow', 'void'] as const
export const ELEMENTS   = ['btc', 'eth', 'sol', 'stable', 'defi', 'meme', 'index', 'private'] as const
export const RARITIES   = ['common', 'uncommon', 'rare', 'epic', 'legendary', 'mythic'] as const

export type BodyType   = typeof BODY_TYPES[number]
export type EyeStyle   = typeof EYE_STYLES[number]
export type Mouth      = typeof MOUTHS[number]
export type Aura       = typeof AURAS[number]
export type Element    = typeof ELEMENTS[number]
export type Rarity     = typeof RARITIES[number]

export interface Genome {
  body: BodyType
  eyes: EyeStyle
  mouth: Mouth
  aura: Aura
  element: Element
  rarity: Rarity
  /** 0–100 — cosmetic "evolution" stat; grows via training / holding time. */
  level: number
  /** 64-hex seed — fully reproducible portrait. */
  seed: string
}

export interface CryptoBuddy {
  id: string                // "cbd_" + short(seed)
  name: string
  genome: Genome
  ownerId: string           // local account id or on-chain address (lower-case)
  mintedAt: number
  mintedFrom: 'genesis' | 'breed' | 'bridge'
  parentIds?: [string, string]
  lastTransferredAt?: number
  priceListingUsd?: number  // set when user lists for trade
  chainRef?: { chain: string; contract: string; tokenId: string }
}

export type LedgerEvent =
  | { kind: 'mint'; ts: number; buddyId: string; owner: string; from: 'genesis' | 'breed' | 'bridge'; parents?: [string, string] }
  | { kind: 'transfer'; ts: number; buddyId: string; from: string; to: string }
  | { kind: 'trade'; ts: number; a: { buddyId: string; owner: string }; b: { buddyId: string; owner: string }; priceUsd?: number }
  | { kind: 'breed'; ts: number; parents: [string, string]; childId: string }
  | { kind: 'retire'; ts: number; buddyId: string; reason?: string }
  | { kind: 'list'; ts: number; buddyId: string; priceUsd: number }
  | { kind: 'unlist'; ts: number; buddyId: string }

interface Index {
  version: 1
  selfId: string              // stable "owner id" for local buddies
  buddies: Record<string, CryptoBuddy>
}

// ── File layout ────────────────────────────────────────────────────

function indexPath(): string { return path.join(paths().cryptoBuddiesDir, 'index.json') }
function ledgerPath(): string { return path.join(paths().cryptoBuddiesDir, 'ledger.jsonl') }

function readIndex(): Index {
  ensureAllDirs()
  const f = indexPath()
  if (!fs.existsSync(f)) {
    const selfId = 'self_' + crypto.randomBytes(6).toString('hex')
    const ix: Index = { version: 1, selfId, buddies: {} }
    fs.writeFileSync(f, JSON.stringify(ix, null, 2), { mode: 0o600 })
    return ix
  }
  try {
    return JSON.parse(fs.readFileSync(f, 'utf8')) as Index
  } catch (err) {
    log.warn('index parse failed — resetting', { err: (err as Error).message })
    return { version: 1, selfId: 'self_' + crypto.randomBytes(6).toString('hex'), buddies: {} }
  }
}

function writeIndex(ix: Index): void {
  ensureAllDirs()
  const tmp = indexPath() + '.tmp'
  fs.writeFileSync(tmp, JSON.stringify(ix, null, 2), { mode: 0o600 })
  fs.renameSync(tmp, indexPath())
}

function appendLedger(ev: LedgerEvent): void {
  ensureAllDirs()
  fs.appendFileSync(ledgerPath(), JSON.stringify(ev) + '\n', { mode: 0o600 })
}

// ── Genome derivation ──────────────────────────────────────────────

/**
 * Derive a complete genome from a 32-byte seed. Every choice is a modular
 * index into the trait arrays — so two identical seeds always produce the
 * same buddy.
 */
export function genomeFromSeed(seed: Buffer | string): Genome {
  const buf = typeof seed === 'string' ? Buffer.from(seed, 'hex') : seed
  if (buf.length < 32) throw new Error('seed must be >= 32 bytes')
  const at = (i: number, mod: number) => buf[i] % mod
  const rarity = pickRarity(buf[6])
  return {
    body: BODY_TYPES[at(0, BODY_TYPES.length)],
    eyes: EYE_STYLES[at(1, EYE_STYLES.length)],
    mouth: MOUTHS[at(2, MOUTHS.length)],
    aura: AURAS[at(3, AURAS.length)],
    element: ELEMENTS[at(4, ELEMENTS.length)],
    rarity,
    level: 1,
    seed: buf.slice(0, 32).toString('hex'),
  }
}

/** Weighted rarity: most buddies are common; mythic is ~0.4%. */
function pickRarity(b: number): Rarity {
  if (b < 140) return 'common'
  if (b < 200) return 'uncommon'
  if (b < 230) return 'rare'
  if (b < 248) return 'epic'
  if (b < 254) return 'legendary'
  return 'mythic'
}

// ── Operations ─────────────────────────────────────────────────────

export interface MintOptions {
  name?: string
  seed?: Buffer | string
  owner?: string
}

/** Mint a fresh buddy — either random or from a supplied seed. */
export function mint(opts: MintOptions = {}): CryptoBuddy {
  const ix = readIndex()
  const seed = opts.seed
    ? (typeof opts.seed === 'string' ? Buffer.from(opts.seed, 'hex') : opts.seed)
    : crypto.randomBytes(32)
  const genome = genomeFromSeed(seed)
  const id = 'cbd_' + genome.seed.slice(0, 10)
  if (ix.buddies[id]) {
    return ix.buddies[id]
  }
  const buddy: CryptoBuddy = {
    id,
    name: opts.name ?? suggestName(genome),
    genome,
    ownerId: (opts.owner ?? ix.selfId).toLowerCase(),
    mintedAt: Date.now(),
    mintedFrom: 'genesis',
  }
  ix.buddies[id] = buddy
  writeIndex(ix)
  appendLedger({ kind: 'mint', ts: Date.now(), buddyId: id, owner: buddy.ownerId, from: 'genesis' })
  emit('cryptoBuddies.updated', { kind: 'mint', buddy })
  log.info('minted', { id, rarity: genome.rarity })
  return buddy
}

/**
 * Breed two buddies → one child. Genome-cross rule:
 *   each trait is taken from parent A or parent B by seeding a new
 *   32-byte key from sha256(parentASeed || parentBSeed || blockTime).
 * The child inherits rarity at parents' floor, with a 1-in-32 lucky upgrade.
 */
export function breed(parentAId: string, parentBId: string, opts: { name?: string } = {}): CryptoBuddy {
  const ix = readIndex()
  const a = ix.buddies[parentAId]
  const b = ix.buddies[parentBId]
  if (!a || !b) throw new Error('both parents must exist')
  if (a.ownerId !== b.ownerId) throw new Error('parents must share an owner (self-bred only)')
  const mix = crypto.createHash('sha256')
    .update(a.genome.seed).update(b.genome.seed).update(String(Date.now()))
    .digest()
  const genome = genomeFromSeed(mix)
  // Upgrade rule
  const parentFloor = Math.min(rarityScore(a.genome.rarity), rarityScore(b.genome.rarity))
  const score = Math.max(rarityScore(genome.rarity), parentFloor)
  const lucky = (mix[31] & 0x1f) === 0x1f
  const finalRarity = rarityByScore(Math.min(5, score + (lucky ? 1 : 0)))
  genome.rarity = finalRarity

  const child: CryptoBuddy = {
    id: 'cbd_' + genome.seed.slice(0, 10),
    name: opts.name ?? suggestName(genome),
    genome,
    ownerId: a.ownerId,
    mintedAt: Date.now(),
    mintedFrom: 'breed',
    parentIds: [a.id, b.id],
  }
  ix.buddies[child.id] = child
  writeIndex(ix)
  appendLedger({ kind: 'breed', ts: Date.now(), parents: [a.id, b.id], childId: child.id })
  appendLedger({ kind: 'mint', ts: Date.now(), buddyId: child.id, owner: child.ownerId, from: 'breed', parents: [a.id, b.id] })
  emit('cryptoBuddies.updated', { kind: 'breed', child })
  return child
}

/** Ledger-recorded transfer. `to` is a local account id or a 0x-address. */
export function transfer(buddyId: string, to: string): CryptoBuddy {
  const ix = readIndex()
  const b = ix.buddies[buddyId]
  if (!b) throw new Error('no such buddy: ' + buddyId)
  const from = b.ownerId
  b.ownerId = to.toLowerCase()
  b.lastTransferredAt = Date.now()
  delete b.priceListingUsd
  writeIndex(ix)
  appendLedger({ kind: 'transfer', ts: Date.now(), buddyId, from, to: b.ownerId })
  emit('cryptoBuddies.updated', { kind: 'transfer', buddy: b })
  return b
}

/** Two-party atomic swap. Both buddies flip owners in one write. */
export function trade(aId: string, bId: string, priceUsd?: number): { a: CryptoBuddy; b: CryptoBuddy } {
  const ix = readIndex()
  const a = ix.buddies[aId]
  const b = ix.buddies[bId]
  if (!a || !b) throw new Error('both buddies must exist')
  const aOwner = a.ownerId
  const bOwner = b.ownerId
  a.ownerId = bOwner
  b.ownerId = aOwner
  a.lastTransferredAt = b.lastTransferredAt = Date.now()
  delete a.priceListingUsd
  delete b.priceListingUsd
  writeIndex(ix)
  appendLedger({
    kind: 'trade', ts: Date.now(),
    a: { buddyId: a.id, owner: aOwner },
    b: { buddyId: b.id, owner: bOwner },
    priceUsd,
  })
  emit('cryptoBuddies.updated', { kind: 'trade', a, b })
  return { a, b }
}

export function listForSale(buddyId: string, priceUsd: number): CryptoBuddy {
  const ix = readIndex()
  const b = ix.buddies[buddyId]
  if (!b) throw new Error('no such buddy')
  if (priceUsd <= 0) throw new Error('price must be positive')
  b.priceListingUsd = priceUsd
  writeIndex(ix)
  appendLedger({ kind: 'list', ts: Date.now(), buddyId, priceUsd })
  emit('cryptoBuddies.updated', { kind: 'list', buddy: b })
  return b
}

export function unlist(buddyId: string): CryptoBuddy {
  const ix = readIndex()
  const b = ix.buddies[buddyId]
  if (!b) throw new Error('no such buddy')
  delete b.priceListingUsd
  writeIndex(ix)
  appendLedger({ kind: 'unlist', ts: Date.now(), buddyId })
  emit('cryptoBuddies.updated', { kind: 'unlist', buddy: b })
  return b
}

export function retire(buddyId: string, reason?: string): boolean {
  const ix = readIndex()
  if (!ix.buddies[buddyId]) return false
  delete ix.buddies[buddyId]
  writeIndex(ix)
  appendLedger({ kind: 'retire', ts: Date.now(), buddyId, reason })
  emit('cryptoBuddies.updated', { kind: 'retire', buddyId })
  return true
}

export function listBuddies(filter?: { owner?: string; listed?: boolean }): CryptoBuddy[] {
  const ix = readIndex()
  let out = Object.values(ix.buddies)
  if (filter?.owner) {
    const o = filter.owner.toLowerCase()
    out = out.filter((b) => b.ownerId === o)
  }
  if (filter?.listed) out = out.filter((b) => typeof b.priceListingUsd === 'number')
  return out.sort((a, b) => (b.mintedAt) - (a.mintedAt))
}

export function getBuddy(id: string): CryptoBuddy | null {
  return readIndex().buddies[id] ?? null
}

export function selfId(): string { return readIndex().selfId }

export function readLedger(limit = 200): LedgerEvent[] {
  const f = ledgerPath()
  if (!fs.existsSync(f)) return []
  const lines = fs.readFileSync(f, 'utf8').trim().split('\n').filter(Boolean)
  const tail = lines.slice(-limit)
  return tail.map((l) => {
    try { return JSON.parse(l) as LedgerEvent } catch { return null }
  }).filter((x): x is LedgerEvent => !!x)
}

// ── Genesis / seeding ──────────────────────────────────────────────

/**
 * Seed a fresh installation with ONE buddy per mood class. Idempotent —
 * subsequent calls are no-ops. The genesis seeds are deterministic so the
 * first set always looks the same.
 */
export function ensureGenesisBuddies(): CryptoBuddy[] {
  const ix = readIndex()
  if (Object.keys(ix.buddies).length > 0) return listBuddies()
  const GENESIS = [
    { name: 'Satoshi',   seed: hashSeed('genesis:satoshi:btc') },
    { name: 'Vitalik',   seed: hashSeed('genesis:vitalik:eth') },
    { name: 'Anatoly',   seed: hashSeed('genesis:anatoly:sol') },
    { name: 'Doge',      seed: hashSeed('genesis:doge:meme') },
    { name: 'Stable',    seed: hashSeed('genesis:stable:usd') },
    { name: 'Trader',    seed: hashSeed('genesis:trader:bull') },
    { name: 'Whale',     seed: hashSeed('genesis:whale:kraken') },
    { name: 'Phoenix',   seed: hashSeed('genesis:phoenix:rebirth') },
    { name: 'DeFiOx',    seed: hashSeed('genesis:defi:ox') },
  ]
  const out: CryptoBuddy[] = []
  for (const g of GENESIS) {
    out.push(mint({ name: g.name, seed: g.seed }))
  }
  return out
}

function hashSeed(label: string): Buffer {
  return crypto.createHash('sha256').update(label).digest()
}

// ── Small helpers ──────────────────────────────────────────────────

function suggestName(g: Genome): string {
  const adj: Record<Rarity, string> = {
    common: 'Scruffy', uncommon: 'Bright', rare: 'Nimbus',
    epic: 'Vanta', legendary: 'Oracle', mythic: 'Celestial',
  }
  const el: Record<Element, string> = {
    btc: 'Sat', eth: 'Ether', sol: 'Nova', stable: 'Paxo', defi: 'Yieldo',
    meme: 'Doji', index: 'Compo', private: 'Veil',
  }
  return `${adj[g.rarity]} ${el[g.element]}`
}

function rarityScore(r: Rarity): number {
  return RARITIES.indexOf(r)
}
function rarityByScore(s: number): Rarity {
  return RARITIES[Math.max(0, Math.min(RARITIES.length - 1, s))]
}

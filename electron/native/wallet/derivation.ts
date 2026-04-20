/**
 * Multi-chain key derivation from a BIP-39 seed.
 *
 * EVM chains (ETH, ARB, OP, Base, Polygon, BSC) share the same private key
 * — derived at m/44'/60'/0'/0/<index>. We return the same address across
 * these chains (same keypair works everywhere).
 *
 * BTC: m/44'/0'/0'/0/<index>, P2PKH address (legacy) by default.
 * Solana: m/44'/501'/<index>'/0'. Ed25519 keypair.
 * TRON: m/44'/195'/0'/0/<index>. Secp256k1 like ETH but different address encoding.
 */

import * as bip39 from 'bip39'
import { HDKey } from '@scure/bip32'
import { keccak_256 } from '@noble/hashes/sha3'
import { sha256 } from '@noble/hashes/sha2'
import { ripemd160 } from '@noble/hashes/legacy'
import { secp256k1 } from '@noble/curves/secp256k1'
import { ed25519 } from '@noble/curves/ed25519'
import { base58check } from '@scure/base'
import type { ChainFamily, ChainSpec, ChainId } from './chains.js'
import { CHAINS } from './chains.js'

export interface DerivedAccount {
  chain: ChainId
  family: ChainFamily
  index: number
  address: string
  publicKey: string        // hex, 0x-prefixed for EVM/TRON; bs58 for Solana; hex for BTC compressed
  derivationPath: string
  /** Private key bytes — never leave main process. Expose only on sign. */
  privateKey: Uint8Array
}

// ── Helpers ────────────────────────────────────────────────────────

function bytesToHex(b: Uint8Array): string {
  return Array.from(b, x => x.toString(16).padStart(2, '0')).join('')
}

function keccak256Hex(data: Uint8Array): string {
  return bytesToHex(keccak_256(data))
}

/** EVM EIP-55 checksummed address from a secp256k1 public key. */
function evmAddress(pubKey: Uint8Array): string {
  // Uncompressed pub (65 bytes, 0x04 || x || y). Drop prefix → 64 bytes.
  const raw = pubKey.length === 65 ? pubKey.slice(1) : pubKey
  const hash = keccak256Hex(raw)
  const addr = hash.slice(-40)
  // EIP-55 checksum
  const checksum = keccak256Hex(new TextEncoder().encode(addr))
  let out = '0x'
  for (let i = 0; i < addr.length; i++) {
    out += parseInt(checksum[i], 16) >= 8 ? addr[i].toUpperCase() : addr[i]
  }
  return out
}

/** BTC P2PKH address. */
function btcAddress(pubKey: Uint8Array, network: 'mainnet' = 'mainnet'): string {
  // pubKey should already be compressed (33 bytes)
  const h160 = ripemd160(sha256(pubKey))
  const version = network === 'mainnet' ? 0x00 : 0x6f
  const payload = new Uint8Array(21)
  payload[0] = version
  payload.set(h160, 1)
  return base58check(sha256).encode(payload)
}

/** TRON address (base58check of 0x41 || keccak256(pubkey)[-20:]). */
function tronAddress(pubKey: Uint8Array): string {
  const raw = pubKey.length === 65 ? pubKey.slice(1) : pubKey
  const h = keccak_256(raw)
  const addr20 = h.slice(-20)
  const payload = new Uint8Array(21)
  payload[0] = 0x41
  payload.set(addr20, 1)
  return base58check(sha256).encode(payload)
}

/** Solana: base58 of ed25519 public key. */
function solAddress(pubKey: Uint8Array): string {
  // Solana base58, no checksum. Use @scure/base's plain base58.
  const { base58 } = require('@scure/base') as typeof import('@scure/base')
  return base58.encode(pubKey)
}

// ── Seed → master key ──────────────────────────────────────────────

export function mnemonicToSeed(mnemonic: string): Uint8Array {
  if (!bip39.validateMnemonic(mnemonic)) {
    throw new Error('invalid BIP-39 mnemonic')
  }
  // bip39.mnemonicToSeedSync returns Node Buffer; our consumers want Uint8Array.
  return new Uint8Array(bip39.mnemonicToSeedSync(mnemonic))
}

export function generateMnemonic(strength: 128 | 192 | 256 = 256): string {
  return bip39.generateMnemonic(strength)
}

// ── Per-chain derivation ───────────────────────────────────────────

export function deriveEVM(seed: Uint8Array, index: number): DerivedAccount {
  const path = `m/44'/60'/0'/0/${index}`
  const root = HDKey.fromMasterSeed(seed)
  const child = root.derive(path)
  if (!child.privateKey) throw new Error('EVM derivation missing privateKey')
  const pub = secp256k1.getPublicKey(child.privateKey, false) // uncompressed
  return {
    chain: 'eth', family: 'evm', index,
    derivationPath: path,
    privateKey: child.privateKey,
    publicKey: '0x' + bytesToHex(pub),
    address: evmAddress(pub),
  }
}

export function deriveBTC(seed: Uint8Array, index: number): DerivedAccount {
  const path = `m/44'/0'/0'/0/${index}`
  const root = HDKey.fromMasterSeed(seed)
  const child = root.derive(path)
  if (!child.privateKey) throw new Error('BTC derivation missing privateKey')
  const pub = secp256k1.getPublicKey(child.privateKey, true) // compressed
  return {
    chain: 'btc', family: 'btc', index,
    derivationPath: path,
    privateKey: child.privateKey,
    publicKey: bytesToHex(pub),
    address: btcAddress(pub),
  }
}

export function deriveSolana(seed: Uint8Array, index: number): DerivedAccount {
  // Solana uses ed25519 derivation (SLIP-0010). Minimal implementation below.
  const path = `m/44'/501'/${index}'/0'`
  const priv = slip10Ed25519DeriveFromSeed(seed, path)
  const pub = ed25519.getPublicKey(priv)
  return {
    chain: 'solana', family: 'solana', index,
    derivationPath: path,
    privateKey: priv,
    publicKey: solAddress(pub),
    address: solAddress(pub),
  }
}

export function deriveTRON(seed: Uint8Array, index: number): DerivedAccount {
  const path = `m/44'/195'/0'/0/${index}`
  const root = HDKey.fromMasterSeed(seed)
  const child = root.derive(path)
  if (!child.privateKey) throw new Error('TRON derivation missing privateKey')
  const pub = secp256k1.getPublicKey(child.privateKey, false)
  return {
    chain: 'tron', family: 'tron', index,
    derivationPath: path,
    privateKey: child.privateKey,
    publicKey: '0x' + bytesToHex(pub),
    address: tronAddress(pub),
  }
}

export function deriveAccount(chainOrSpec: ChainId | ChainSpec, seed: Uint8Array, index: number = 0): DerivedAccount {
  const spec = typeof chainOrSpec === 'string' ? CHAINS[chainOrSpec] : chainOrSpec
  switch (spec.family) {
    case 'evm':    { const a = deriveEVM(seed, index);    a.chain = spec.id; return a }
    case 'btc':    return deriveBTC(seed, index)
    case 'solana': return deriveSolana(seed, index)
    case 'tron':   return deriveTRON(seed, index)
  }
}

/** Quick "wallet overview" — one account per family. */
export function deriveAccountSet(seed: Uint8Array, index: number = 0): Record<ChainId, DerivedAccount> {
  const evm = deriveEVM(seed, index)
  return {
    eth:      { ...evm, chain: 'eth' },
    arbitrum: { ...evm, chain: 'arbitrum' },
    optimism: { ...evm, chain: 'optimism' },
    base:     { ...evm, chain: 'base' },
    polygon:  { ...evm, chain: 'polygon' },
    bsc:      { ...evm, chain: 'bsc' },
    btc:      deriveBTC(seed, index),
    solana:   deriveSolana(seed, index),
    tron:     deriveTRON(seed, index),
  }
}

// ── SLIP-0010 ed25519 (for Solana) ─────────────────────────────────
//
// Minimal implementation (hardened-only derivation path). Reference:
// https://github.com/satoshilabs/slips/blob/master/slip-0010.md

import { hmac } from '@noble/hashes/hmac'
import { sha512 } from '@noble/hashes/sha2'

function slip10Ed25519DeriveFromSeed(seed: Uint8Array, path: string): Uint8Array {
  // Master key: HMAC-SHA512("ed25519 seed", seed)
  const I = hmac(sha512, new TextEncoder().encode('ed25519 seed'), seed)
  let k = I.slice(0, 32)
  let c = I.slice(32)
  const segments = path.split('/').slice(1) // drop leading 'm'
  for (const seg of segments) {
    if (!seg.endsWith("'")) throw new Error('SLIP-0010 ed25519 requires hardened derivation')
    const idx = parseInt(seg.slice(0, -1), 10)
    if (!Number.isFinite(idx)) throw new Error(`bad derivation segment: ${seg}`)
    const hardened = (idx | 0x80000000) >>> 0
    // data = 0x00 || k || ser32(i)
    const data = new Uint8Array(1 + 32 + 4)
    data[0] = 0x00
    data.set(k, 1)
    new DataView(data.buffer, data.byteOffset).setUint32(1 + 32, hardened, false)
    const Ichild = hmac(sha512, c, data)
    k = Ichild.slice(0, 32)
    c = Ichild.slice(32)
  }
  return k
}

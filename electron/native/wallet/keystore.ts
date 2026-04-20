/**
 * Encrypted keystore — the BIP-39 mnemonic is AES-GCM encrypted at rest.
 * Passphrase is REQUIRED (minimum 8 chars). Policy decision §17.2.
 *
 * Format (keystore.json):
 *   {
 *     "version": 1,
 *     "kdf": "scrypt",
 *     "kdfParams": { "N": 131072, "r": 8, "p": 1, "salt": "<hex 16b>", "dkLen": 32 },
 *     "cipher": "aes-256-gcm",
 *     "cipherParams": { "iv": "<hex 12b>" },
 *     "ciphertext": "<hex>",        -- encrypted UTF-8 mnemonic (12/24 words)
 *     "authTag": "<hex 16b>",
 *     "createdAt": 1713288000000,
 *     "meta": { "numAccounts": 1, "wordCount": 24 }
 *   }
 *
 * The mnemonic is NEVER written unencrypted. The passphrase is NEVER
 * persisted — held in memory only while wallet is unlocked. On lock,
 * both mnemonic and derived seeds/keys are zeroed.
 *
 * We encrypt the mnemonic (not the seed) because BIP-39 mnemonic→seed is
 * one-way; encrypting the seed would make recovery-phrase export impossible.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as crypto from 'crypto'
import { gcm } from '@noble/ciphers/aes'
import { paths, ensureAllDirs } from '../core/config.js'
import { createLogger } from '../core/logger.js'
import { emit } from '../core/events.js'
import { generateMnemonic, mnemonicToSeed, deriveAccountSet, type DerivedAccount } from './derivation.js'
import type { ChainId } from './chains.js'

const log = createLogger('keystore')

const KEYSTORE_VERSION = 1
const SCRYPT_N = 131_072   // 2^17 — ~1s on modern laptop
const SCRYPT_r = 8
const SCRYPT_p = 1
const DK_LEN = 32

const AUTO_LOCK_MS = 15 * 60 * 1000

export interface KeystoreFile {
  version: number
  kdf: 'scrypt'
  kdfParams: { N: number; r: number; p: number; salt: string; dkLen: number }
  cipher: 'aes-256-gcm'
  cipherParams: { iv: string }
  ciphertext: string
  authTag: string
  createdAt: number
  meta: { numAccounts: number; wordCount: 12 | 24 }
}

// ── Unlocked-state cache ───────────────────────────────────────────

let cachedMnemonic: string | null = null
let cachedSeed: Uint8Array | null = null
let cachedAccounts: Record<ChainId, DerivedAccount> | null = null
let unlockTimer: NodeJS.Timeout | null = null

function bumpLockTimer(): void {
  if (unlockTimer) clearTimeout(unlockTimer)
  unlockTimer = setTimeout(() => { log.info('auto-lock (idle)'); lock() }, AUTO_LOCK_MS)
}

export function isUnlocked(): boolean { return cachedSeed !== null }
export function hasKeystore(): boolean {
  return fs.existsSync(path.join(paths().walletDir, 'keystore.json'))
}

// ── Passphrase KDF ─────────────────────────────────────────────────

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  return crypto.scryptSync(passphrase.normalize('NFKC'), salt, DK_LEN, {
    N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, maxmem: 256 * 1024 * 1024,
  })
}

const hex = (b: Uint8Array | Buffer) => Buffer.from(b).toString('hex')
const unhex = (s: string) => new Uint8Array(Buffer.from(s, 'hex'))

// ── Create / import ────────────────────────────────────────────────

export function createKeystore(opts: {
  passphrase: string
  mnemonic?: string
}): { mnemonic: string; addresses: Record<ChainId, string> } {
  if (!opts.passphrase || opts.passphrase.length < 8) {
    throw new Error('passphrase required (minimum 8 characters)')
  }
  if (hasKeystore()) {
    throw new Error('keystore already exists — remove the existing one (with passphrase) before creating a new one')
  }
  ensureAllDirs()

  const mnemonic = opts.mnemonic ?? generateMnemonic(256)
  // Validate early so we throw before writing anything.
  const seed = mnemonicToSeed(mnemonic)
  const wordCount = mnemonic.trim().split(/\s+/).length as 12 | 24

  const salt = crypto.randomBytes(16)
  const iv = crypto.randomBytes(12)
  const key = deriveKey(opts.passphrase, salt)
  const plaintext = new TextEncoder().encode(mnemonic)
  const encrypted = gcm(new Uint8Array(key), new Uint8Array(iv)).encrypt(plaintext)
  const ct = encrypted.slice(0, -16)
  const tag = encrypted.slice(-16)

  const file: KeystoreFile = {
    version: KEYSTORE_VERSION,
    kdf: 'scrypt',
    kdfParams: { N: SCRYPT_N, r: SCRYPT_r, p: SCRYPT_p, salt: hex(salt), dkLen: DK_LEN },
    cipher: 'aes-256-gcm',
    cipherParams: { iv: hex(iv) },
    ciphertext: hex(ct),
    authTag: hex(tag),
    createdAt: Date.now(),
    meta: { numAccounts: 1, wordCount },
  }
  const keystoreFile = path.join(paths().walletDir, 'keystore.json')
  fs.writeFileSync(keystoreFile, JSON.stringify(file, null, 2), { mode: 0o600 })

  const accounts = deriveAccountSet(seed, 0)
  writeAccountsFile(accounts)

  // Cache for immediate use (user will typically back up + then lock).
  cachedMnemonic = mnemonic
  cachedSeed = seed
  cachedAccounts = accounts
  bumpLockTimer()
  emit('wallet.lockChanged', { unlocked: true })
  log.info('keystore created', { wordCount })

  const addresses: Record<ChainId, string> = {} as any
  for (const [id, a] of Object.entries(accounts)) addresses[id as ChainId] = a.address
  return { mnemonic, addresses }
}

export function importKeystore(mnemonic: string, passphrase: string) {
  return createKeystore({ passphrase, mnemonic })
}

// ── Unlock / lock ──────────────────────────────────────────────────

export function unlock(passphrase: string): Record<ChainId, string> {
  const keystoreFile = path.join(paths().walletDir, 'keystore.json')
  if (!fs.existsSync(keystoreFile)) throw new Error('no keystore — call createKeystore first')
  const raw = JSON.parse(fs.readFileSync(keystoreFile, 'utf8')) as KeystoreFile
  if (raw.version !== KEYSTORE_VERSION) throw new Error(`unknown keystore version: ${raw.version}`)

  const salt = Buffer.from(raw.kdfParams.salt, 'hex')
  const iv = unhex(raw.cipherParams.iv)
  const ct = unhex(raw.ciphertext)
  const tag = unhex(raw.authTag)
  const key = deriveKey(passphrase, salt)

  const combined = new Uint8Array(ct.length + tag.length)
  combined.set(ct, 0); combined.set(tag, ct.length)
  let plaintext: Uint8Array
  try { plaintext = gcm(new Uint8Array(key), iv).decrypt(combined) }
  catch { throw new Error('invalid passphrase') }
  const mnemonic = new TextDecoder().decode(plaintext)
  const seed = mnemonicToSeed(mnemonic)

  cachedMnemonic = mnemonic
  cachedSeed = seed
  cachedAccounts = deriveAccountSet(seed, 0)
  bumpLockTimer()
  emit('wallet.lockChanged', { unlocked: true })
  log.info('unlocked')

  const addresses: Record<ChainId, string> = {} as any
  for (const [id, a] of Object.entries(cachedAccounts!)) addresses[id as ChainId] = a.address
  return addresses
}

export function lock(): void {
  if (cachedMnemonic) {
    // Overwrite the string's backing memory as best we can from JS — assign
    // and drop reference. (JS doesn't give us fine-grained control.)
    cachedMnemonic = null
  }
  if (cachedSeed) {
    cachedSeed.fill(0)
    cachedSeed = null
  }
  if (cachedAccounts) {
    for (const a of Object.values(cachedAccounts)) a.privateKey.fill(0)
    cachedAccounts = null
  }
  if (unlockTimer) { clearTimeout(unlockTimer); unlockTimer = null }
  emit('wallet.lockChanged', { unlocked: false })
  log.info('locked')
}

// ── Accessors (require unlock) ─────────────────────────────────────

export function requireUnlocked(): Record<ChainId, DerivedAccount> {
  if (!cachedAccounts) throw new Error('wallet is locked — unlock first')
  bumpLockTimer()
  return cachedAccounts
}

export function getAccount(chain: ChainId): DerivedAccount {
  return requireUnlocked()[chain]
}

/** Reveal the mnemonic — requires a fresh passphrase (even if unlocked). */
export function revealMnemonic(passphrase: string): string {
  // Force decrypt; do NOT trust cachedMnemonic (defence-in-depth).
  const keystoreFile = path.join(paths().walletDir, 'keystore.json')
  if (!fs.existsSync(keystoreFile)) throw new Error('no keystore')
  const raw = JSON.parse(fs.readFileSync(keystoreFile, 'utf8')) as KeystoreFile
  const salt = Buffer.from(raw.kdfParams.salt, 'hex')
  const iv = unhex(raw.cipherParams.iv)
  const ct = unhex(raw.ciphertext)
  const tag = unhex(raw.authTag)
  const key = deriveKey(passphrase, salt)
  const combined = new Uint8Array(ct.length + tag.length)
  combined.set(ct, 0); combined.set(tag, ct.length)
  try {
    return new TextDecoder().decode(gcm(new Uint8Array(key), iv).decrypt(combined))
  } catch {
    throw new Error('invalid passphrase')
  }
}

// ── Public accounts cache (addresses only) ─────────────────────────

interface AccountsFile {
  version: 1
  accounts: Record<ChainId, { address: string; derivationPath: string; publicKey: string; index: number }>
}

function writeAccountsFile(accounts: Record<ChainId, DerivedAccount>): void {
  const file: AccountsFile = { version: 1, accounts: {} as any }
  for (const [id, a] of Object.entries(accounts)) {
    file.accounts[id as ChainId] = {
      address: a.address, derivationPath: a.derivationPath, publicKey: a.publicKey, index: a.index,
    }
  }
  fs.writeFileSync(path.join(paths().walletDir, 'accounts.json'), JSON.stringify(file, null, 2), { mode: 0o600 })
}

export function publicAccounts(): Record<ChainId, { address: string; derivationPath: string }> | null {
  const file = path.join(paths().walletDir, 'accounts.json')
  if (!fs.existsSync(file)) return null
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as AccountsFile
    const out: Record<string, { address: string; derivationPath: string }> = {}
    for (const [id, v] of Object.entries(raw.accounts)) {
      out[id] = { address: v.address, derivationPath: v.derivationPath }
    }
    return out as Record<ChainId, { address: string; derivationPath: string }>
  } catch {
    return null
  }
}

export function removeKeystore(passphrase: string): void {
  // Verify passphrase first, then lock + unlink.
  unlock(passphrase)
  lock()
  const walletDir = paths().walletDir
  for (const f of ['keystore.json', 'accounts.json']) {
    const p = path.join(walletDir, f)
    if (fs.existsSync(p)) fs.unlinkSync(p)
  }
  log.info('keystore removed')
}

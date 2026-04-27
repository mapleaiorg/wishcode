/**
 * Cell-1 — Cell Registry.
 *
 * Local catalog of installed + draft Cells keyed by `(id, version)`.
 * The fs-backed store walks `~/.wishcode/cells/installed/` and
 * `~/.wishcode/cells/draft/` once Cell-1.1 lands; this in-memory
 * implementation is the reference + the test seam.
 *
 * Semver resolution intentionally accepts only a thin subset of
 * `npm`-style ranges that map cleanly to "the latest version that
 * satisfies the bound" without pulling in `semver`:
 *
 *   "1.2.3"     — exact
 *   "^1.2.3"    — same major, ≥ 1.2.3
 *   "~1.2.3"    — same minor, ≥ 1.2.3
 *   "*"         — any
 *
 * Cell-1.1 swaps in real `semver` once the runtime needs richer
 * ranges. This narrow subset covers every dependency declaration in
 * the v4 prompt suite.
 */

import { parseManifest, type CellManifest, type ParseError } from './manifest.js'

export type RegistryStatus = 'draft' | 'installed' | 'disabled'

export interface RegistryRecord {
  manifest: CellManifest
  status: RegistryStatus
  /** Where the bundle directory lives on disk; opaque to the registry. */
  installPath?: string
  installedAt: string
  updatedAt: string
}

export interface NewRegistryInput {
  manifest: CellManifest
  status?: RegistryStatus
  installPath?: string
}

export interface ResolveOptions {
  /** Match `RegistryStatus` set. Default: `['installed']`. */
  status?: RegistryStatus[]
}

export interface CellRegistry {
  add(input: NewRegistryInput): Promise<RegistryRecord>
  get(id: string, version: string): Promise<RegistryRecord | null>
  /** Resolve the highest version satisfying `range`. */
  resolve(id: string, range: string, opts?: ResolveOptions): Promise<RegistryRecord | null>
  list(opts?: { status?: RegistryStatus[] }): Promise<RegistryRecord[]>
  setStatus(id: string, version: string, status: RegistryStatus): Promise<RegistryRecord>
  remove(id: string, version: string): Promise<boolean>
  /** Validate a manifest dependency closure against what's installed. */
  resolveDependencies(
    manifest: CellManifest,
    opts?: ResolveOptions,
  ): Promise<DependencyResolution>
}

export interface DependencyResolution {
  satisfied: Array<{ id: string; range: string; resolved: RegistryRecord }>
  missing: Array<{ id: string; range: string; optional: boolean }>
}

// ── semver-lite ─────────────────────────────────────────────────────

interface ParsedSemver {
  major: number
  minor: number
  patch: number
  /** prerelease string for ordering — empty = no prerelease (higher). */
  pre: string
}

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/

function parseSemver(v: string): ParsedSemver | null {
  const m = SEMVER_RE.exec(v.trim())
  if (!m) return null
  return {
    major: Number(m[1]),
    minor: Number(m[2]),
    patch: Number(m[3]),
    pre: m[4] ?? '',
  }
}

function compareSemver(a: ParsedSemver, b: ParsedSemver): number {
  if (a.major !== b.major) return a.major - b.major
  if (a.minor !== b.minor) return a.minor - b.minor
  if (a.patch !== b.patch) return a.patch - b.patch
  // prerelease comparison: empty = release > prerelease
  if (!a.pre && b.pre) return 1
  if (a.pre && !b.pre) return -1
  if (a.pre === b.pre) return 0
  return a.pre < b.pre ? -1 : 1
}

interface ParsedRange {
  kind: 'any' | 'exact' | 'caret' | 'tilde'
  base?: ParsedSemver
}

export function parseRange(range: string): ParsedRange | null {
  const r = range.trim()
  if (r === '*') return { kind: 'any' }
  if (r.startsWith('^')) {
    const base = parseSemver(r.slice(1))
    return base ? { kind: 'caret', base } : null
  }
  if (r.startsWith('~')) {
    const base = parseSemver(r.slice(1))
    return base ? { kind: 'tilde', base } : null
  }
  const base = parseSemver(r)
  return base ? { kind: 'exact', base } : null
}

export function rangeSatisfies(range: string, version: string): boolean {
  const pr = parseRange(range)
  const pv = parseSemver(version)
  if (!pr || !pv) return false
  if (pr.kind === 'any') return true
  if (!pr.base) return false
  if (pr.kind === 'exact') return compareSemver(pr.base, pv) === 0
  if (compareSemver(pv, pr.base) < 0) return false
  if (pr.kind === 'caret') return pv.major === pr.base.major
  if (pr.kind === 'tilde') {
    return pv.major === pr.base.major && pv.minor === pr.base.minor
  }
  return false
}

// ── store ───────────────────────────────────────────────────────────

function key(id: string, version: string): string {
  return `${id}@${version}`
}

function nowIso(): string {
  return new Date().toISOString()
}

export class InMemoryCellRegistry implements CellRegistry {
  private readonly records = new Map<string, RegistryRecord>()

  async add(input: NewRegistryInput): Promise<RegistryRecord> {
    const k = key(input.manifest.id, input.manifest.version)
    if (this.records.has(k)) {
      throw new Error(`CellRegistry: duplicate ${k}`)
    }
    const now = nowIso()
    const rec: RegistryRecord = {
      manifest: input.manifest,
      status: input.status ?? 'installed',
      installPath: input.installPath,
      installedAt: now,
      updatedAt: now,
    }
    this.records.set(k, rec)
    return { ...rec }
  }

  async get(id: string, version: string): Promise<RegistryRecord | null> {
    const r = this.records.get(key(id, version))
    return r ? { ...r } : null
  }

  async resolve(
    id: string,
    range: string,
    opts: ResolveOptions = {},
  ): Promise<RegistryRecord | null> {
    const wanted = opts.status ?? ['installed']
    const candidates: Array<{ rec: RegistryRecord; sv: ParsedSemver }> = []
    for (const r of this.records.values()) {
      if (r.manifest.id !== id) continue
      if (!wanted.includes(r.status)) continue
      if (!rangeSatisfies(range, r.manifest.version)) continue
      const sv = parseSemver(r.manifest.version)
      if (sv) candidates.push({ rec: r, sv })
    }
    if (candidates.length === 0) return null
    candidates.sort((a, b) => compareSemver(b.sv, a.sv))
    return { ...candidates[0].rec }
  }

  async list(opts: { status?: RegistryStatus[] } = {}): Promise<RegistryRecord[]> {
    const wanted = opts.status ?? ['draft', 'installed', 'disabled']
    const out: RegistryRecord[] = []
    for (const r of this.records.values()) {
      if (!wanted.includes(r.status)) continue
      out.push({ ...r })
    }
    out.sort((a, b) => {
      const idCmp = a.manifest.id.localeCompare(b.manifest.id)
      if (idCmp !== 0) return idCmp
      const av = parseSemver(a.manifest.version)
      const bv = parseSemver(b.manifest.version)
      if (!av || !bv) return 0
      return compareSemver(bv, av)
    })
    return out
  }

  async setStatus(
    id: string,
    version: string,
    status: RegistryStatus,
  ): Promise<RegistryRecord> {
    const k = key(id, version)
    const cur = this.records.get(k)
    if (!cur) throw new Error(`CellRegistry: not found: ${k}`)
    const next: RegistryRecord = { ...cur, status, updatedAt: nowIso() }
    this.records.set(k, next)
    return { ...next }
  }

  async remove(id: string, version: string): Promise<boolean> {
    return this.records.delete(key(id, version))
  }

  async resolveDependencies(
    manifest: CellManifest,
    opts: ResolveOptions = {},
  ): Promise<DependencyResolution> {
    const satisfied: DependencyResolution['satisfied'] = []
    const missing: DependencyResolution['missing'] = []
    for (const dep of manifest.dependencies) {
      const r = await this.resolve(dep.id, dep.versionRange, opts)
      if (r) {
        satisfied.push({ id: dep.id, range: dep.versionRange, resolved: r })
      } else {
        missing.push({ id: dep.id, range: dep.versionRange, optional: dep.optional })
      }
    }
    return { satisfied, missing }
  }
}

/** Convenience: parse a raw manifest object then add it. Returns the
 *  registry record on success, or the parse error otherwise. */
export async function addFromRaw(
  registry: CellRegistry,
  raw: unknown,
  status: RegistryStatus = 'installed',
  installPath?: string,
): Promise<{ ok: true; record: RegistryRecord } | ParseError> {
  const parsed = parseManifest(raw)
  if (!parsed.ok) return parsed
  const record = await registry.add({ manifest: parsed.manifest, status, installPath })
  return { ok: true, record }
}

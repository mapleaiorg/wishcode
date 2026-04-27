/**
 * Cell-0 — Cell Manifest schema.
 *
 * The manifest IS the contract (PROMPT-INDEX § 4 invariant 15). Every
 * Cell ships a `cell.manifest.json` next to its bundle; the runtime
 * (Cell-2), registry (Cell-1), forge (Cell-8), and trust verifier
 * (Cell-6 + W-7) all read this exact shape.
 *
 * The manifest is intentionally provider-neutral and class-agnostic —
 * the same schema validates a UI Cell, a provider Cell, a policy Cell,
 * or an overlay. Class-specific extras live under `cell.<class>` and
 * are validated by the relevant runtime, not here.
 *
 * Lives at `electron/native/cells/`. Public consumers (Cell-1
 * registry, Cell-7 sync, Cell-8 forge) import only from `index.ts`.
 */

import { z } from 'zod'
import { CAPABILITY_KINDS, type CapabilityKind } from '../capability/index.js'

// ── primitives ──────────────────────────────────────────────────────

/**
 * Cell id grammar: lowercase reverse-DNS-ish dotted, ≤ 64 chars, no
 * leading/trailing dots, no double-dots. Matches the wire id format
 * used by Hermon's Cell catalog (H-6).
 */
const CELL_ID_RE = /^[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_-]*){1,4}$/

const CellIdSchema = z
  .string()
  .min(3)
  .max(64)
  .regex(CELL_ID_RE, 'cell id must be lowercase reverse-DNS-ish (e.g. "wish.provider.anthropic")')

/** SemVer-ish: major.minor.patch with optional `-pre` and `+build`. */
const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/
const SemverSchema = z.string().regex(SEMVER_RE, 'version must be semver (e.g. "1.2.3")')

const CellClassSchema = z.enum([
  'ui',
  'business',
  'provider',
  'agent',
  'tool',
  'policy',
  'theme',
  'overlay',
])
export type CellClass = z.infer<typeof CellClassSchema>

const TrustTierSchema = z.enum(['declarative', 'sandboxed', 'trusted-signed'])
export type TrustTier = z.infer<typeof TrustTierSchema>

const CapabilityKindSchema = z.enum(CAPABILITY_KINDS as unknown as [CapabilityKind, ...CapabilityKind[]])

/** Reserved shell slot ids (CONVENTIONS § 7). The slot host (Cell-4)
 *  rejects unknown slot ids at activation; we keep the schema open so
 *  Cells may declare their *own* slot ids for cross-Cell composition. */
const SHELL_SLOT_IDS = [
  'shell.leftNav',
  'shell.main',
  'shell.rightContext',
  'shell.bottomPanel',
  'shell.commandPalette',
  'chat.inlineActions',
  'chat.messageToolbar',
  'code.inlineActions',
  'code.fileExplorer',
  'code.editorOverlay',
  'task.sidebar',
  'deliverable.preview',
  'activity.timeline',
] as const

const SLOT_ID_RE = /^[a-z][a-zA-Z0-9_]*(?:\.[a-z][a-zA-Z0-9_]*)*$/
const SlotIdSchema = z.string().regex(SLOT_ID_RE)

// ── manifest sub-shapes ─────────────────────────────────────────────

const SlotContributionSchema = z.object({
  /** The slot id this Cell contributes into. Reserved ids checked
   *  by the slot host; arbitrary ids permitted for Cell-to-Cell
   *  extension. */
  slot: SlotIdSchema,
  /** Component / handler entry name within the Cell bundle. */
  entry: z.string().min(1),
  /** Lower priority renders earlier; ties resolved by id. */
  priority: z.number().int().default(100),
  /** Optional human-friendly title. */
  title: z.string().optional(),
})

const DependencySchema = z.object({
  id: CellIdSchema,
  /** SemVer range. We keep the validator lax (string) at Cell-0;
   *  Cell-1 (registry) does the resolution. */
  versionRange: z.string().min(1),
  /** Whether this dep is required for activation. Optional deps are
   *  loaded if available; missing optional deps don't block. */
  optional: z.boolean().default(false),
})

const SignatureSchema = z.object({
  algorithm: z.literal('ed25519'),
  publicKeyId: z.string().min(1),
  /** base64-url, no padding. */
  signature: z.string().min(1),
  /** ISO-8601 — when the signing service signed the manifest. */
  signedAt: z.string().min(1),
})

const ManifestStorageSchema = z.object({
  /** Where the bundle lives on disk relative to the manifest file. */
  bundle: z.string().min(1).default('./bundle'),
  /** SHA-256 (hex) of the bundle. Cell-6 verifies this matches at load. */
  bundleHash: z.string().regex(/^[0-9a-f]{64}$/i, 'bundleHash must be 64 hex chars'),
})

const ManifestAuthorSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  url: z.string().url().optional(),
})

// ── per-class hooks (open) ──────────────────────────────────────────

/** Provider-Cell extras — validated more strictly inside the
 *  provider runtime (A-1/A-3). Kept open here so the schema does
 *  not need to bump every time a provider Cell adds a hint. */
const ProviderExtrasSchema = z
  .object({
    canonicalProviderId: z.string().min(1),
    streaming: z.boolean().default(true),
  })
  .passthrough()
  .optional()

const PolicyExtrasSchema = z
  .object({
    appliesTo: z.array(z.string()).default([]),
  })
  .passthrough()
  .optional()

const OverlayExtrasSchema = z
  .object({
    /** Cells the overlay activates as a group. */
    activates: z.array(CellIdSchema).default([]),
    /** Brand title shown in the shell when this overlay is active. */
    brandTitle: z.string().optional(),
  })
  .passthrough()
  .optional()

// ── full manifest ───────────────────────────────────────────────────

export const CellManifestSchema = z.object({
  /** Constant — bumped when the manifest schema itself breaks. */
  manifestVersion: z.literal(1),

  id: CellIdSchema,
  version: SemverSchema,
  class: CellClassSchema,
  trustTier: TrustTierSchema,

  title: z.string().min(1),
  description: z.string().max(280).optional(),
  author: ManifestAuthorSchema,

  /** Capability kinds this Cell needs at runtime. Cell-2 enforces
   *  the union before activation; the broker (D-6) honors them at
   *  invocation time. */
  capabilities: z.array(CapabilityKindSchema).default([]),

  /** Slots the Cell contributes into. Empty for non-UI classes. */
  slots: z.array(SlotContributionSchema).default([]),

  dependencies: z.array(DependencySchema).default([]),

  storage: ManifestStorageSchema,

  /** Required when `trustTier === 'trusted-signed'`; absent
   *  otherwise. The cross-field check below enforces this. */
  signature: SignatureSchema.optional(),

  /** Per-class hooks. Open by design; class runtimes validate. */
  provider: ProviderExtrasSchema,
  policy: PolicyExtrasSchema,
  overlay: OverlayExtrasSchema,
})
.superRefine((m, ctx) => {
  if (m.trustTier === 'trusted-signed' && !m.signature) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'signature is required for trustTier "trusted-signed"',
      path: ['signature'],
    })
  }
  if (m.trustTier !== 'trusted-signed' && m.signature) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: 'signature is only allowed when trustTier === "trusted-signed"',
      path: ['signature'],
    })
  }
  // Slot ids: reject if duplicate (slot, entry).
  const slotKeys = new Set<string>()
  for (const s of m.slots) {
    const k = `${s.slot}::${s.entry}`
    if (slotKeys.has(k)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate slot contribution (slot, entry): ${k}`,
        path: ['slots'],
      })
    }
    slotKeys.add(k)
  }
  // Dependency ids must be unique.
  const depIds = new Set<string>()
  for (const d of m.dependencies) {
    if (depIds.has(d.id)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `duplicate dependency id: ${d.id}`,
        path: ['dependencies'],
      })
    }
    depIds.add(d.id)
  }
})

export type CellManifest = z.infer<typeof CellManifestSchema>

// ── helpers ─────────────────────────────────────────────────────────

export interface ParsedManifest {
  ok: true
  manifest: CellManifest
}
export interface ParseError {
  ok: false
  errors: Array<{ path: string; message: string }>
}

/** Parse + validate a manifest object (already JSON-parsed). Returns
 *  a structured result so callers (Cell-1 registry, Cell-8 forge)
 *  can render errors without throwing. */
export function parseManifest(raw: unknown): ParsedManifest | ParseError {
  const r = CellManifestSchema.safeParse(raw)
  if (r.success) return { ok: true, manifest: r.data }
  return {
    ok: false,
    errors: r.error.issues.map(i => ({
      path: i.path.join('.'),
      message: i.message,
    })),
  }
}

/** True if the given capability kind is part of the manifest's
 *  declared set. Used by Cell-2 / D-6 at activation time. */
export function manifestDeclaresCapability(
  m: CellManifest,
  kind: CapabilityKind,
): boolean {
  return m.capabilities.includes(kind)
}

/** Ordered list of slot contributions for a target slot id. */
export function slotContributionsFor(
  m: CellManifest,
  slot: string,
): CellManifest['slots'] {
  return m.slots.filter(s => s.slot === slot).sort((a, b) => a.priority - b.priority)
}

/** Returns the reserved set of shell slot ids — Cell-4 will treat
 *  any contribution to one of these as host-managed. */
export const RESERVED_SHELL_SLOT_IDS: readonly string[] = SHELL_SLOT_IDS

#!/usr/bin/env node
/**
 * Wish Code — icon rasterizer.
 *
 * Generates `build/icon.png` (1024×1024, RGBA) from first principles — no
 * external dependencies, no `sharp`, no CLI tools required. The shape is a
 * faithful redraw of the Bohr-atom icon the user supplied, coloured in the
 * Wish Code brand purple.
 *
 * Why roll our own:
 *   - Keeps the icon build fully hermetic (works on any CI / fresh clone).
 *   - Avoids pulling a 40 MB native image lib just to produce one file.
 *   - We already know the geometry exactly — `build/icon.svg` mirrors this
 *     script line-for-line; they must stay in sync.
 *
 * Output:
 *   build/icon.png         — 1024×1024 tile (used by electron-builder, dock,
 *                             window icon on macOS/Linux/Windows).
 *
 * A separate `.icns` is produced at package time by electron-builder from
 * this PNG (see `mac.icon` in package.json).
 */

import { writeFileSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { deflateSync } from 'node:zlib'

const __filename = fileURLToPath(import.meta.url)
const __dirname  = dirname(__filename)
const REPO_ROOT  = join(__dirname, '..')

const SIZE  = 1024
const RADIUS_CORNER = 230            // 22.5% of 1024 — matches macOS Big Sur mask.

// ── Colour palette ─────────────────────────────────────────────────
// All colours are [r, g, b]; alpha handled per-pixel.
const BG_INNER   = [0x8b, 0x5c, 0xf6]   // #8b5cf6
const BG_MID     = [0x6d, 0x28, 0xd9]   // #6d28d9
const BG_OUTER   = [0x3b, 0x07, 0x64]   // #3b0764
const HALO_RGB   = [0xc4, 0xb5, 0xfd]
const ORBIT_RGB  = [0xff, 0xff, 0xff]
const NUC_INNER  = [0xff, 0xff, 0xff]
const NUC_OUTER  = [0xa7, 0x8b, 0xfa]

// ── Framebuffer ────────────────────────────────────────────────────
const buf = new Uint8Array(SIZE * SIZE * 4)        // RGBA
const CX = SIZE / 2
const CY = SIZE / 2

function setPx(x, y, r, g, b, a) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return
  const i = ((y | 0) * SIZE + (x | 0)) * 4
  // Source-over composite against the pixel already there.
  const srcA = a / 255
  const dstA = buf[i + 3] / 255
  const outA = srcA + dstA * (1 - srcA)
  if (outA <= 0) return
  const outR = (r * srcA + buf[i]     * dstA * (1 - srcA)) / outA
  const outG = (g * srcA + buf[i + 1] * dstA * (1 - srcA)) / outA
  const outB = (b * srcA + buf[i + 2] * dstA * (1 - srcA)) / outA
  buf[i]     = outR | 0
  buf[i + 1] = outG | 0
  buf[i + 2] = outB | 0
  buf[i + 3] = Math.round(outA * 255)
}

function lerp(a, b, t) { return a + (b - a) * t }
function lerp3(a, b, t) { return [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)] }
function clamp01(x) { return x < 0 ? 0 : x > 1 ? 1 : x }

// Rounded-square mask (same radius as CSS `border-radius: 22.5%`).
// Returns alpha 0..1 with 1-pixel smoothstep for anti-aliasing.
function tileMask(x, y) {
  const r = RADIUS_CORNER
  let dx = 0, dy = 0
  if (x < r)               dx = r - x
  else if (x > SIZE - r)   dx = x - (SIZE - r)
  if (y < r)               dy = r - y
  else if (y > SIZE - r)   dy = y - (SIZE - r)
  const d = Math.hypot(dx, dy)
  // Outside the corner quarter-circle → transparent; inside → opaque.
  if (dx === 0 && dy === 0) return 1
  const edge = r
  if (d <= edge - 1) return 1
  if (d >= edge + 1) return 0
  return 1 - (d - (edge - 1)) / 2
}

// Radial gradient → RGB at (x,y), given center + outer radius.
function radialRgb(x, y, cx, cy, rOuter, stops) {
  const t = clamp01(Math.hypot(x - cx, y - cy) / rOuter)
  // Stops is an array of [pos, rgb].
  for (let i = 0; i < stops.length - 1; i++) {
    const [p1, c1] = stops[i]
    const [p2, c2] = stops[i + 1]
    if (t >= p1 && t <= p2) {
      const tt = (t - p1) / (p2 - p1)
      return lerp3(c1, c2, tt)
    }
  }
  return stops[stops.length - 1][1]
}

// ── 1. Fill the rounded-square background with a radial gradient ───
function drawBackground() {
  const stops = [
    [0,    BG_INNER],
    [0.55, BG_MID],
    [1,    BG_OUTER],
  ]
  const rOuter = SIZE * 0.72
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      const m = tileMask(x + 0.5, y + 0.5)
      if (m <= 0) continue
      const [r, g, b] = radialRgb(x + 0.5, y + 0.5, CX, CY * 0.94, rOuter, stops)
      setPx(x, y, r, g, b, Math.round(m * 255))
    }
  }
}

// ── 2. Soft glow halo behind the nucleus ───────────────────────────
function drawHalo() {
  const R = 360
  for (let y = CY - R - 4; y < CY + R + 4; y++) {
    for (let x = CX - R - 4; x < CX + R + 4; x++) {
      const d = Math.hypot(x + 0.5 - CX, y + 0.5 - CY)
      if (d > R) continue
      // 0 at center → 0.75 alpha, fades to 0 at R.
      const t = d / R
      const alpha = Math.max(0, 0.75 - t * 0.85)
      if (alpha <= 0) continue
      const m = tileMask(x + 0.5, y + 0.5)
      if (m <= 0) continue
      setPx(x, y, HALO_RGB[0], HALO_RGB[1], HALO_RGB[2], Math.round(alpha * m * 255))
    }
  }
}

// ── 3. Three orbital ellipses (rotated 0°, 60°, 120°) ──────────────
function drawOrbits() {
  const RX = 380, RY = 150, STROKE = 18
  const AA = 1.2
  const rots = [0, 60, 120]
  for (const deg of rots) {
    const rad = (deg * Math.PI) / 180
    const cos = Math.cos(rad), sin = Math.sin(rad)
    // Bounding box after rotation.
    const R = Math.max(RX, RY) + STROKE
    for (let y = CY - R; y < CY + R; y++) {
      for (let x = CX - R; x < CX + R; x++) {
        const dx = x + 0.5 - CX
        const dy = y + 0.5 - CY
        // Rotate the point into the ellipse's local frame.
        const lx =  dx * cos + dy * sin
        const ly = -dx * sin + dy * cos
        // Distance from the ellipse boundary, approximately. We evaluate
        // the implicit function (lx/RX)^2 + (ly/RY)^2 = 1 and scale to
        // pixels via the gradient length.
        const fx = lx / RX
        const fy = ly / RY
        const f = fx * fx + fy * fy - 1
        const gMag = 2 * Math.hypot(fx / RX, fy / RY)
        if (gMag === 0) continue
        const dist = Math.abs(f) / gMag
        if (dist > STROKE / 2 + AA) continue
        // Smooth band: full opacity inside the stroke, anti-aliased at edges.
        const inside = STROKE / 2 - AA
        let a
        if (dist <= inside) a = 1
        else a = 1 - (dist - inside) / (2 * AA)
        if (a <= 0) continue
        const m = tileMask(x + 0.5, y + 0.5)
        if (m <= 0) continue
        setPx(x, y, ORBIT_RGB[0], ORBIT_RGB[1], ORBIT_RGB[2], Math.round(a * 0.92 * m * 255))
      }
    }
  }
}

// ── 4. Three electrons at each orbit's far tip ─────────────────────
function drawElectrons() {
  const RX = 380
  const electrons = [
    [CX + RX, CY],                                          // 0°
    [CX + RX * Math.cos((60 * Math.PI) / 180),
     CY + RX * Math.sin((60 * Math.PI) / 180)],             // 60° (upper-right)
    [CX + RX * Math.cos((120 * Math.PI) / 180),
     CY + RX * Math.sin((120 * Math.PI) / 180)],            // 120° (lower-right)
  ]
  // The SVG places electrons at +x tip of each rotated orbit; here we
  // mirror those to match (x=892, 322/183, 322/841 from the SVG).
  const svgPositions = [
    [892, 512],
    [322, 183],
    [322, 841],
  ]
  for (const [cx, cy] of svgPositions) {
    drawDisc(cx, cy, 26, ORBIT_RGB, 1)
  }
  // Silence the unused-var check — `electrons` is kept for documentation.
  void electrons
}

// Filled disc with 1-pixel anti-aliased edge.
function drawDisc(cx, cy, r, rgb, alphaMul = 1) {
  for (let y = Math.floor(cy - r - 1); y <= Math.ceil(cy + r + 1); y++) {
    for (let x = Math.floor(cx - r - 1); x <= Math.ceil(cx + r + 1); x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy)
      if (d > r + 1) continue
      const a = d <= r - 1 ? 1 : d >= r + 1 ? 0 : 1 - (d - (r - 1)) / 2
      if (a <= 0) continue
      const m = tileMask(x + 0.5, y + 0.5)
      if (m <= 0) continue
      setPx(x, y, rgb[0], rgb[1], rgb[2], Math.round(a * alphaMul * m * 255))
    }
  }
}

// ── 5. Nucleus (radial purple→white) ───────────────────────────────
function drawNucleus() {
  const R = 96
  const stops = [
    [0,    NUC_INNER],
    [0.55, [0xed, 0xe9, 0xfe]],
    [1,    NUC_OUTER],
  ]
  for (let y = Math.floor(CY - R - 1); y <= Math.ceil(CY + R + 1); y++) {
    for (let x = Math.floor(CX - R - 1); x <= Math.ceil(CX + R + 1); x++) {
      const d = Math.hypot(x + 0.5 - CX, y + 0.5 - CY)
      if (d > R + 1) continue
      const a = d <= R - 1 ? 1 : d >= R + 1 ? 0 : 1 - (d - (R - 1)) / 2
      if (a <= 0) continue
      const t = clamp01(d / R)
      let rgb
      if (t <= 0.55) rgb = lerp3(stops[0][1], stops[1][1], t / 0.55)
      else           rgb = lerp3(stops[1][1], stops[2][1], (t - 0.55) / 0.45)
      const m = tileMask(x + 0.5, y + 0.5)
      if (m <= 0) continue
      setPx(x, y, rgb[0], rgb[1], rgb[2], Math.round(a * m * 255))
    }
  }
}

// ── PNG encoder (minimal, RGBA8) ───────────────────────────────────
// https://www.w3.org/TR/PNG/ — this writes just what electron needs.

function crc32Table() {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1)
    t[n] = c >>> 0
  }
  return t
}
const CRC_TABLE = crc32Table()
function crc32(bytes) {
  let c = 0xffffffff
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function u32be(n) {
  return Buffer.from([(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff])
}

function chunk(type, data) {
  const len = u32be(data.length)
  const typeBuf = Buffer.from(type, 'ascii')
  const body = Buffer.concat([typeBuf, data])
  const crc = u32be(crc32(body))
  return Buffer.concat([len, body, crc])
}

function encodePng(rgba, w, h) {
  // Prepend filter byte (0 = None) to each scanline, then deflate.
  const raw = Buffer.alloc(h * (1 + w * 4))
  for (let y = 0; y < h; y++) {
    raw[y * (1 + w * 4)] = 0
    rgba.subarray(y * w * 4, (y + 1) * w * 4)
       .forEach((v, i) => { raw[y * (1 + w * 4) + 1 + i] = v })
  }
  const deflated = deflateSync(raw, { level: 9 })

  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.concat([
    u32be(w), u32be(h),
    Buffer.from([8, 6, 0, 0, 0]),   // 8-bit depth, color type 6 (RGBA), default filter/interlace
  ])
  return Buffer.concat([
    sig,
    chunk('IHDR', ihdr),
    chunk('IDAT', deflated),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ── Compose + write ────────────────────────────────────────────────

drawBackground()
drawHalo()
drawOrbits()
drawNucleus()      // nucleus first so electrons don't get overdrawn by halo re-sampling
drawElectrons()

const buildDir = join(REPO_ROOT, 'build')
mkdirSync(buildDir, { recursive: true })
const outPath = join(buildDir, 'icon.png')
writeFileSync(outPath, encodePng(buf, SIZE, SIZE))
console.log(`[build-icon] wrote ${outPath} (${SIZE}×${SIZE})`)

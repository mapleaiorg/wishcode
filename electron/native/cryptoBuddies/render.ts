/**
 * CryptoBuddy portrait renderer.
 *
 * Deterministic SVG generator: given a `Genome`, produces a string of SVG
 * markup suitable for embedding in the renderer via `dangerouslySetInnerHTML`
 * or a data-URL `<img>` source.
 *
 * The renderer is intentionally low-tech — no external canvas, no
 * dependencies beyond crypto (for the seed-derived RNG). That keeps this
 * module equally usable in the main process (for an NFT mint preview) and
 * in the renderer (for the buddy gallery).
 */

import type { Genome, BodyType, EyeStyle, Mouth, Aura, Element, Rarity } from './registry.js'

// ── Palettes ───────────────────────────────────────────────────────

const ELEMENT_PALETTE: Record<Element, { fg: string; bg: string; glow: string }> = {
  btc:     { fg: '#F7931A', bg: '#2A1A06', glow: '#F7931A' },
  eth:     { fg: '#627EEA', bg: '#0B1026', glow: '#8EA6FF' },
  sol:     { fg: '#9945FF', bg: '#0E0421', glow: '#14F195' },
  stable:  { fg: '#26A17B', bg: '#072016', glow: '#43F0A2' },
  defi:    { fg: '#FF6A88', bg: '#220811', glow: '#FF9EB7' },
  meme:    { fg: '#FFD83D', bg: '#1F1A00', glow: '#FFED6B' },
  index:   { fg: '#9AA4B2', bg: '#111522', glow: '#C9D4E3' },
  private: { fg: '#111111', bg: '#0A0A0A', glow: '#5A5A5A' },
}

const AURA_COLOR: Record<Aura, string> = {
  gold: '#FFD166', silver: '#C9D2E0', neon: '#39FF14',
  flame: '#FF6A00', ice: '#9CE0FF', shadow: '#3A0A4A',
  rainbow: 'url(#rainbowGrad)', void: '#111',
}

const RARITY_STROKE: Record<Rarity, string> = {
  common:    '#8a8f99',
  uncommon:  '#3dcf7a',
  rare:      '#4da3ff',
  epic:      '#9b5bff',
  legendary: '#ffb43c',
  mythic:    'url(#mythicGrad)',
}

// ── Entry point ────────────────────────────────────────────────────

export function renderBuddySvg(genome: Genome, opts: { size?: number; showHalo?: boolean } = {}): string {
  const size = opts.size ?? 256
  const showHalo = opts.showHalo ?? true
  const p = ELEMENT_PALETTE[genome.element]
  const halo = AURA_COLOR[genome.aura]
  const stroke = RARITY_STROKE[genome.rarity]

  // Micro-PRNG seeded from genome.seed for subtle per-instance jitter
  // (e.g., body width, eye spacing). Two buddies with the same genome
  // will therefore ALWAYS render identically.
  const rng = seededRng(genome.seed)
  const jitter = (range = 2) => (rng() * 2 - 1) * range

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128" width="${size}" height="${size}" role="img" aria-label="CryptoBuddy">
  <defs>
    <radialGradient id="bg" cx="50%" cy="40%" r="70%">
      <stop offset="0%" stop-color="${lighten(p.bg, 10)}"/>
      <stop offset="100%" stop-color="${p.bg}"/>
    </radialGradient>
    <linearGradient id="rainbowGrad" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%"  stop-color="#ff4d6d"/>
      <stop offset="25%" stop-color="#ffd166"/>
      <stop offset="50%" stop-color="#06d6a0"/>
      <stop offset="75%" stop-color="#118ab2"/>
      <stop offset="100%" stop-color="#9b5bff"/>
    </linearGradient>
    <linearGradient id="mythicGrad" x1="0" y1="0" x2="1" y2="0">
      <stop offset="0%" stop-color="#FFD166"/>
      <stop offset="50%" stop-color="#FF9EB7"/>
      <stop offset="100%" stop-color="#8EA6FF"/>
    </linearGradient>
    <filter id="glow" x="-40%" y="-40%" width="180%" height="180%">
      <feGaussianBlur stdDeviation="3" result="g"/>
      <feMerge><feMergeNode in="g"/><feMergeNode in="SourceGraphic"/></feMerge>
    </filter>
  </defs>
  <rect width="128" height="128" fill="url(#bg)"/>
  ${showHalo ? `<circle cx="64" cy="64" r="48" fill="${halo}" opacity="0.18" filter="url(#glow)"/>` : ''}
  <g transform="translate(64 ${70 + jitter()})">
    ${bodyPath(genome.body, p.fg, stroke, jitter)}
    ${eyePath(genome.eyes, p.fg, jitter)}
    ${mouthPath(genome.mouth)}
    ${elementBadge(genome.element, p.glow)}
  </g>
  ${rarityRibbon(genome.rarity)}
</svg>`.trim()
}

/** Produce a data-URL compact enough for a React <img src={...}>. */
export function renderBuddyDataUrl(genome: Genome, opts?: { size?: number }): string {
  const svg = renderBuddySvg(genome, opts)
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg)
}

// ── Body/eye/mouth paths ───────────────────────────────────────────

function bodyPath(b: BodyType, fg: string, stroke: string, jitter: (r?: number) => number): string {
  const w = 34 + jitter(2)
  const h = 30 + jitter(2)
  switch (b) {
    case 'orb':
      return `<ellipse cx="0" cy="-6" rx="${w}" ry="${h}" fill="${fg}" stroke="${stroke}" stroke-width="2"/>`
    case 'crystal':
      return `<polygon points="0,-42 34,-4 20,28 -20,28 -34,-4" fill="${fg}" stroke="${stroke}" stroke-width="2"/>`
    case 'shiba':
      return `<g fill="${fg}" stroke="${stroke}" stroke-width="2"><ellipse cx="0" cy="-4" rx="${w}" ry="${h - 4}"/>
        <polygon points="-22,-36 -12,-20 -28,-22"/><polygon points="22,-36 12,-20 28,-22"/></g>`
    case 'bull':
      return `<g fill="${fg}" stroke="${stroke}" stroke-width="2"><circle cx="0" cy="-4" r="${h}"/>
        <polygon points="-30,-28 -42,-38 -24,-20"/><polygon points="30,-28 42,-38 24,-20"/></g>`
    case 'bear':
      return `<g fill="${fg}" stroke="${stroke}" stroke-width="2"><circle cx="0" cy="-4" r="${h}"/>
        <circle cx="-24" cy="-28" r="8"/><circle cx="24" cy="-28" r="8"/></g>`
    case 'kraken':
      return `<g fill="${fg}" stroke="${stroke}" stroke-width="2"><ellipse cx="0" cy="-10" rx="${w - 4}" ry="${h - 6}"/>
        <path d="M -30 15 q -8 14 -18 6" fill="none"/>
        <path d="M -10 22 q -4 16 -14 12" fill="none"/>
        <path d="M 10 22 q 4 16 14 12" fill="none"/>
        <path d="M 30 15 q 8 14 18 6" fill="none"/></g>`
    case 'phoenix':
      return `<g fill="${fg}" stroke="${stroke}" stroke-width="2"><ellipse cx="0" cy="-6" rx="${w - 4}" ry="${h - 4}"/>
        <path d="M -40 -4 q -14 -18 0 -22 q 10 0 14 10" fill="${lighten(fg, 15)}"/>
        <path d="M 40 -4 q 14 -18 0 -22 q -10 0 -14 10" fill="${lighten(fg, 15)}"/></g>`
    case 'diamond':
      return `<polygon points="0,-42 30,0 0,36 -30,0" fill="${fg}" stroke="${stroke}" stroke-width="2"/>`
  }
}

function eyePath(e: EyeStyle, fg: string, jitter: (r?: number) => number): string {
  const dx = 10 + jitter(1)
  const cy = -10
  const white = '#FFFFFF'
  const black = '#000000'
  const baseEye = (cx: number) =>
    `<circle cx="${cx}" cy="${cy}" r="4" fill="${white}"/>` +
    `<circle cx="${cx + 0.5}" cy="${cy + 0.5}" r="1.8" fill="${black}"/>`
  switch (e) {
    case 'calm':  return baseEye(-dx) + baseEye(dx)
    case 'sharp': return `<path d="M ${-dx - 4} ${cy - 2} L ${-dx + 4} ${cy + 2}" stroke="${black}" stroke-width="2.4" stroke-linecap="round"/>
                          <path d="M ${dx - 4} ${cy + 2} L ${dx + 4} ${cy - 2}" stroke="${black}" stroke-width="2.4" stroke-linecap="round"/>`
    case 'laser': return `<circle cx="${-dx}" cy="${cy}" r="3" fill="#FF003C"/><circle cx="${dx}" cy="${cy}" r="3" fill="#FF003C"/>
                          <line x1="${-dx}" y1="${cy}" x2="${-dx - 18}" y2="${cy + 8}" stroke="#FF003C" stroke-width="1.2"/>
                          <line x1="${dx}"  y1="${cy}" x2="${dx + 18}"  y2="${cy + 8}" stroke="#FF003C" stroke-width="1.2"/>`
    case 'sleepy': return `<path d="M ${-dx - 4} ${cy} q 4 4 8 0" fill="none" stroke="${black}" stroke-width="2"/>
                            <path d="M ${dx - 4} ${cy} q 4 4 8 0" fill="none" stroke="${black}" stroke-width="2"/>`
    case 'wink':  return baseEye(-dx) + `<path d="M ${dx - 4} ${cy} l 8 0" stroke="${black}" stroke-width="2"/>`
    case 'star':  return `<path d="M ${-dx} ${cy - 5} l 2 4 4 0 -3 3 1 5 -4 -3 -4 3 1 -5 -3 -3 4 0 z" fill="${fg}"/>
                          <path d="M ${dx} ${cy - 5} l 2 4 4 0 -3 3 1 5 -4 -3 -4 3 1 -5 -3 -3 4 0 z" fill="${fg}"/>`
    case 'x':     return `<path d="M ${-dx - 4} ${cy - 4} l 8 8 M ${-dx + 4} ${cy - 4} l -8 8" stroke="${black}" stroke-width="2"/>
                          <path d="M ${dx - 4} ${cy - 4} l 8 8 M ${dx + 4} ${cy - 4} l -8 8"   stroke="${black}" stroke-width="2"/>`
    case 'zen':   return `<path d="M ${-dx - 4} ${cy + 2} l 8 0" stroke="${black}" stroke-width="2"/>
                          <path d="M ${dx - 4} ${cy + 2} l 8 0"  stroke="${black}" stroke-width="2"/>`
  }
}

function mouthPath(m: Mouth): string {
  switch (m) {
    case 'smile':  return `<path d="M -8 8 q 8 8 16 0" stroke="#fff" stroke-width="2" fill="none"/>`
    case 'smirk':  return `<path d="M -6 8 q 10 6 14 -2" stroke="#fff" stroke-width="2" fill="none"/>`
    case 'gasp':   return `<circle cx="4" cy="10" r="4" fill="#000" stroke="#fff" stroke-width="1.5"/>`
    case 'tongue': return `<path d="M -8 8 q 8 8 16 0" stroke="#fff" stroke-width="2" fill="none"/>
                           <path d="M 2 12 q 4 6 8 0"  fill="#FF6A88"/>`
    case 'frown':  return `<path d="M -8 12 q 8 -8 16 0" stroke="#fff" stroke-width="2" fill="none"/>`
    case 'flat':   return `<line x1="-8" y1="10" x2="8" y2="10" stroke="#fff" stroke-width="2"/>`
    case 'grin':   return `<rect x="-10" y="6" width="20" height="8" fill="#fff"/>
                           <line x1="-4" y1="6" x2="-4" y2="14" stroke="#000"/>
                           <line x1="4"  y1="6" x2="4"  y2="14" stroke="#000"/>`
    case 'open':   return `<ellipse cx="4" cy="10" rx="6" ry="4" fill="#2a0a10" stroke="#fff" stroke-width="1.5"/>`
  }
}

function elementBadge(el: Element, glow: string): string {
  const sym: Record<Element, string> = {
    btc: '₿', eth: 'Ξ', sol: '◎', stable: '$', defi: 'Ψ',
    meme: '🔥', index: 'Σ', private: '◆',
  }
  return `<text x="30" y="28" font-family="ui-sans-serif, system-ui" font-size="14" font-weight="700"
    fill="${glow}" opacity="0.9">${sym[el]}</text>`
}

function rarityRibbon(r: Rarity): string {
  const text = r.toUpperCase()
  const color = RARITY_STROKE[r]
  return `<g><rect x="4" y="110" width="120" height="14" fill="#000" opacity="0.5"/>
    <text x="64" y="120" text-anchor="middle" font-family="ui-sans-serif, system-ui"
      font-size="9" letter-spacing="2" fill="${color}" font-weight="700">${text}</text></g>`
}

// ── Utilities ──────────────────────────────────────────────────────

function lighten(hex: string, pct: number): string {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex)
  if (!m) return hex
  const n = parseInt(m[1], 16)
  const r = Math.min(255, (n >> 16) + pct)
  const g = Math.min(255, ((n >> 8) & 0xff) + pct)
  const b = Math.min(255, (n & 0xff) + pct)
  return '#' + [r, g, b].map((x) => x.toString(16).padStart(2, '0')).join('')
}

function seededRng(seedHex: string): () => number {
  let s = 0
  for (let i = 0; i < seedHex.length; i++) s = (s * 31 + seedHex.charCodeAt(i)) >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

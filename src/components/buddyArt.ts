/**
 * buddyArt — renderer-side deterministic SVG generator for CryptoBuddies.
 *
 * Produces a compact data URL from a BuddyGenome so the gallery can render
 * portraits without crossing the preload bridge.  The look is inspired by
 * CryptoKitties — palette from element+rarity, silhouette from body, eye &
 * mouth glyphs layered on top, optional aura halo for rare+ tiers.
 */

import type { BuddyGenome, BuddyRarity, BuddyElement } from '../types'

const ELEMENT_PALETTE: Record<BuddyElement, [string, string]> = {
  btc:     ['#f7931a', '#4b2a07'],
  eth:     ['#627eea', '#1b2140'],
  sol:     ['#14f195', '#0b3d2b'],
  stable:  ['#26a17b', '#0d3a2a'],
  defi:    ['#c084fc', '#3b1558'],
  meme:    ['#f472b6', '#4d1d36'],
  index:   ['#60a5fa', '#172a52'],
  private: ['#a3a3a3', '#1f1f1f'],
}

const RARITY_HALO: Record<BuddyRarity, string> = {
  common:    '#64748b',
  uncommon:  '#4ade80',
  rare:      '#38bdf8',
  epic:      '#a855f7',
  legendary: '#f59e0b',
  mythic:    '#f43f5e',
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0
  return h
}

function variant(part: string, mod: number): number {
  return hashStr(part) % mod
}

function bodyPath(v: number): string {
  switch (v) {
    case 0: return 'M60,130 C60,80 140,80 140,130 L140,160 C140,180 60,180 60,160 Z'
    case 1: return 'M50,120 Q100,60 150,120 L150,170 Q100,185 50,170 Z'
    case 2: return 'M55,140 C55,95 145,95 145,140 L145,165 Q100,175 55,165 Z'
    case 3: return 'M60,125 Q100,80 140,125 C145,140 145,170 130,175 Q100,182 70,175 C55,170 55,140 60,125 Z'
    case 4: return 'M70,130 Q100,70 130,130 L135,170 Q100,178 65,170 Z'
    case 5: return 'M62,135 C62,100 138,100 138,135 Q138,172 100,172 Q62,172 62,135 Z'
    case 6: return 'M60,130 C60,85 140,85 140,130 L148,170 Q100,180 52,170 Z'
    default: return 'M65,130 Q100,75 135,130 Q135,172 100,175 Q65,172 65,130 Z'
  }
}

function eyeGlyph(v: number): string {
  switch (v) {
    case 0: return '<circle cx="84" cy="125" r="5"/><circle cx="116" cy="125" r="5"/>'
    case 1: return '<rect x="79" y="122" width="10" height="6" rx="2"/><rect x="111" y="122" width="10" height="6" rx="2"/>'
    case 2: return '<ellipse cx="84" cy="125" rx="6" ry="3"/><ellipse cx="116" cy="125" rx="6" ry="3"/>'
    case 3: return '<path d="M78,125 Q84,118 90,125"/><path d="M110,125 Q116,118 122,125"/>'
    case 4: return '<circle cx="84" cy="125" r="6" fill="#fff"/><circle cx="116" cy="125" r="6" fill="#fff"/><circle cx="84" cy="125" r="2.5"/><circle cx="116" cy="125" r="2.5"/>'
    case 5: return '<path d="M80,122 L88,128 M88,122 L80,128"/><path d="M112,122 L120,128 M120,122 L112,128"/>'
    case 6: return '<circle cx="84" cy="125" r="4"/><circle cx="116" cy="125" r="4"/><circle cx="84" cy="125" r="1.5" fill="#fff"/><circle cx="116" cy="125" r="1.5" fill="#fff"/>'
    default: return '<circle cx="86" cy="124" r="3"/><circle cx="118" cy="124" r="3"/>'
  }
}

function mouthGlyph(v: number): string {
  switch (v) {
    case 0: return '<path d="M90,148 Q100,155 110,148"/>'
    case 1: return '<rect x="94" y="148" width="12" height="3" rx="1"/>'
    case 2: return '<path d="M90,150 Q100,142 110,150"/>'
    case 3: return '<path d="M90,148 Q100,160 110,148 Q100,155 90,148 Z" fill="#000"/>'
    case 4: return '<circle cx="100" cy="150" r="3"/>'
    case 5: return '<path d="M92,150 L100,155 L108,150"/>'
    case 6: return '<path d="M88,148 Q100,160 112,148"/>'
    default: return '<path d="M92,150 Q100,154 108,150"/>'
  }
}

/**
 * Produce an SVG markup string for a genome.
 */
export function renderBuddySvg(genome: BuddyGenome, size = 200): string {
  const [primary, secondary] = ELEMENT_PALETTE[genome.element] ?? ELEMENT_PALETTE.private
  const halo = RARITY_HALO[genome.rarity]
  const bodyV = variant(genome.body, 8)
  const eyesV = variant(genome.eyes, 8)
  const mouthV = variant(genome.mouth, 8)
  const showHalo = genome.rarity !== 'common' && genome.rarity !== 'uncommon'

  return `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200" width="${size}" height="${size}">
  <defs>
    <linearGradient id="bg-${genome.seed.slice(0, 6)}" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${secondary}"/>
      <stop offset="1" stop-color="#0b0b10"/>
    </linearGradient>
    <radialGradient id="body-${genome.seed.slice(0, 6)}" cx="0.5" cy="0.35" r="0.7">
      <stop offset="0" stop-color="${primary}"/>
      <stop offset="1" stop-color="${secondary}"/>
    </radialGradient>
  </defs>
  <rect width="200" height="200" fill="url(#bg-${genome.seed.slice(0, 6)})"/>
  ${showHalo ? `<circle cx="100" cy="132" r="75" fill="none" stroke="${halo}" stroke-opacity="0.55" stroke-width="3"/>` : ''}
  <path d="${bodyPath(bodyV)}" fill="url(#body-${genome.seed.slice(0, 6)})" stroke="${halo}" stroke-width="1.5"/>
  <g fill="#0b0b10" stroke="#0b0b10" stroke-width="1" stroke-linecap="round">${eyeGlyph(eyesV)}</g>
  <g fill="none" stroke="#0b0b10" stroke-width="2" stroke-linecap="round">${mouthGlyph(mouthV)}</g>
  <text x="100" y="30" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="10" fill="${halo}" opacity="0.85">
    ${genome.element.toUpperCase()} · ${genome.rarity}
  </text>
  <text x="100" y="192" text-anchor="middle" font-family="ui-sans-serif, system-ui" font-size="9" fill="#a3a3a3">
    lv.${genome.level}
  </text>
</svg>`.trim()
}

export function renderBuddyDataUrl(genome: BuddyGenome, size = 200): string {
  const svg = renderBuddySvg(genome, size)
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`
}

export { ELEMENT_PALETTE, RARITY_HALO }

/**
 * Self-contained QR-code SVG renderer.
 *
 * Pure-TypeScript implementation adapted from the QR Code model 2 spec
 * (ISO/IEC 18004). Byte mode only, automatic version selection, ECC level M.
 * Sufficient for wallet addresses (42 chars EVM, ~34 BTC legacy, 44 Solana).
 *
 * No external dependencies — the renderer takes a string and outputs an
 * <svg> element with high-contrast black squares. Scales to any size via
 * viewBox and `width`/`height` props.
 */

import React from 'react'

// ── QR constants (adapted from qrcode-generator by Kazuhiko Arase, public domain) ──

const MODE_BYTE = 1 << 2
const ECC_M = 0

const RS_BLOCK_TABLE: Record<number, number[]> = {
  // version -> [totalBlocks, dataBytesPerBlock, totalBlocks2?, dataBytes2?] (ECC=M)
  1:  [1, 16],
  2:  [1, 28],
  3:  [1, 44],
  4:  [2, 32],
  5:  [2, 43],
  6:  [4, 27],
  7:  [4, 31],
  8:  [2, 38, 2, 39],
  9:  [3, 36, 2, 37],
  10: [4, 43, 1, 44],
}

const EXP: number[] = new Array(256).fill(0)
const LOG: number[] = new Array(256).fill(0)
;(() => {
  let x = 1
  for (let i = 0; i < 8; i++) { EXP[i] = x; x <<= 1 }
  for (let i = 8; i < 256; i++) {
    EXP[i] = EXP[i - 4] ^ EXP[i - 5] ^ EXP[i - 6] ^ EXP[i - 8]
  }
  for (let i = 0; i < 255; i++) LOG[EXP[i]] = i
})()

function gMul(x: number, y: number): number {
  if (x === 0 || y === 0) return 0
  return EXP[(LOG[x] + LOG[y]) % 255]
}

function rsGeneratorPoly(ecLen: number): number[] {
  let poly = [1]
  for (let i = 0; i < ecLen; i++) {
    const newPoly = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j++) {
      newPoly[j] ^= poly[j]
      newPoly[j + 1] ^= gMul(poly[j], EXP[i])
    }
    poly = newPoly
  }
  return poly
}

function rsEncode(data: number[], ecLen: number): number[] {
  const gen = rsGeneratorPoly(ecLen)
  const buf = data.concat(new Array(ecLen).fill(0))
  for (let i = 0; i < data.length; i++) {
    const coef = buf[i]
    if (coef !== 0) {
      for (let j = 0; j < gen.length; j++) {
        buf[i + j] ^= gMul(gen[j], coef)
      }
    }
  }
  return buf.slice(data.length)
}

// Required EC bytes per block for ECC=M
const EC_BYTES_PER_BLOCK_M: Record<number, number> = {
  1: 10, 2: 16, 3: 26, 4: 18, 5: 24, 6: 16, 7: 18, 8: 22, 9: 22, 10: 26,
}

function totalDataCodewords(version: number): number {
  const b = RS_BLOCK_TABLE[version]
  return b[0] * b[1] + (b.length > 2 ? b[2] * b[3] : 0)
}

function pickVersion(byteLen: number): number {
  // Byte-mode header is 4 (mode) + 8 or 16 (count indicator) + 8*byteLen data bits.
  for (let v = 1; v <= 10; v++) {
    const countBits = v < 10 ? 8 : 16
    const totalBits = 4 + countBits + byteLen * 8
    const codewords = Math.ceil(totalBits / 8)
    // 4 bits terminator can overflow — allow +1 byte headroom
    if (codewords + 1 <= totalDataCodewords(v)) return v
  }
  throw new Error(`QR payload too long (${byteLen} bytes > version 10 capacity)`)
}

// ── Bit buffer ─────────────────────────────────────────────────────

class BitBuf {
  private buf: number[] = []
  private len = 0
  put(value: number, bits: number): void {
    for (let i = 0; i < bits; i++) {
      const bit = (value >>> (bits - i - 1)) & 1
      const byteIdx = this.len >>> 3
      if (this.buf.length <= byteIdx) this.buf.push(0)
      if (bit) this.buf[byteIdx] |= 0x80 >>> (this.len & 7)
      this.len++
    }
  }
  get length(): number { return this.len }
  get bytes(): number[] { return this.buf.slice() }
}

// ── Matrix + placement ─────────────────────────────────────────────

function qrSize(version: number): number { return version * 4 + 17 }

function allocMatrix(size: number): (boolean | null)[][] {
  const m: (boolean | null)[][] = new Array(size)
  for (let r = 0; r < size; r++) {
    m[r] = new Array(size).fill(null)
  }
  return m
}

function setFinder(m: (boolean | null)[][], r: number, c: number) {
  for (let dr = -1; dr <= 7; dr++) {
    for (let dc = -1; dc <= 7; dc++) {
      const rr = r + dr, cc = c + dc
      if (rr < 0 || cc < 0 || rr >= m.length || cc >= m.length) continue
      const onRing = (dr >= 0 && dr <= 6 && (dc === 0 || dc === 6)) ||
                     (dc >= 0 && dc <= 6 && (dr === 0 || dr === 6))
      const inCore = dr >= 2 && dr <= 4 && dc >= 2 && dc <= 4
      if (onRing || inCore) m[rr][cc] = true
      else m[rr][cc] = false
    }
  }
}

function setTiming(m: (boolean | null)[][]) {
  const size = m.length
  for (let i = 8; i < size - 8; i++) {
    m[6][i] = i % 2 === 0
    m[i][6] = i % 2 === 0
  }
}

function reserveFormat(m: (boolean | null)[][]) {
  const size = m.length
  for (let i = 0; i <= 8; i++) {
    if (m[8][i] === null && i !== 6) m[8][i] = false
    if (m[i][8] === null && i !== 6) m[i][8] = false
  }
  for (let i = 0; i < 8; i++) {
    if (m[size - 1 - i][8] === null) m[size - 1 - i][8] = false
    if (m[8][size - 1 - i] === null) m[8][size - 1 - i] = false
  }
  m[size - 8][8] = true  // dark module
}

function placeData(m: (boolean | null)[][], dataBits: Uint8Array) {
  const size = m.length
  let bitIdx = 0
  let dir = -1
  let row = size - 1
  for (let col = size - 1; col > 0; col -= 2) {
    if (col === 6) col--
    while (true) {
      for (let c = 0; c < 2; c++) {
        const cc = col - c
        if (m[row][cc] === null) {
          let bit = 0
          if (bitIdx < dataBits.length * 8) {
            bit = (dataBits[bitIdx >> 3] >>> (7 - (bitIdx & 7))) & 1
            bitIdx++
          }
          m[row][cc] = bit === 1
        }
      }
      row += dir
      if (row < 0 || row >= size) { dir = -dir; row += dir; break }
    }
  }
}

function maskFn0(r: number, c: number): boolean { return (r + c) % 2 === 0 }

function applyMask(m: (boolean | null)[][], reservedMask: boolean[][]) {
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m.length; c++) {
      if (!reservedMask[r][c] && m[r][c] !== null) {
        if (maskFn0(r, c)) m[r][c] = !m[r][c]
      }
    }
  }
}

// Precomputed format info words for ECC=M, mask=0: 0x5412
const FORMAT_INFO_M0 = 0x5412

function placeFormat(m: (boolean | null)[][]) {
  const size = m.length
  const bits = FORMAT_INFO_M0
  // Top-left around finder
  for (let i = 0; i <= 5; i++) m[8][i] = ((bits >>> i) & 1) === 1
  m[8][7] = ((bits >>> 6) & 1) === 1
  m[8][8] = ((bits >>> 7) & 1) === 1
  m[7][8] = ((bits >>> 8) & 1) === 1
  for (let i = 9; i < 15; i++) m[14 - i][8] = ((bits >>> i) & 1) === 1
  // Bottom-left + top-right
  for (let i = 0; i < 7; i++) m[size - 1 - i][8] = ((bits >>> i) & 1) === 1
  for (let i = 7; i < 15; i++) m[8][size - 15 + i] = ((bits >>> i) & 1) === 1
  m[size - 8][8] = true
}

// ── Encode entrypoint ──────────────────────────────────────────────

function encode(text: string): boolean[][] {
  // UTF-8 bytes
  const bytes: number[] = Array.from(new TextEncoder().encode(text))
  const version = pickVersion(bytes.length)
  const size = qrSize(version)
  const totalCodewords = totalDataCodewords(version)

  const buf = new BitBuf()
  buf.put(MODE_BYTE, 4)
  buf.put(bytes.length, version < 10 ? 8 : 16)
  for (const b of bytes) buf.put(b, 8)
  // Terminator (up to 4 zero bits)
  const remBits = totalCodewords * 8 - buf.length
  buf.put(0, Math.min(4, Math.max(0, remBits)))
  // Pad to byte boundary
  while (buf.length % 8 !== 0) buf.put(0, 1)
  // Pad bytes alternating 0xEC 0x11
  const padBytes = [0xec, 0x11]
  let padIdx = 0
  while (buf.bytes.length < totalCodewords) buf.put(padBytes[padIdx++ % 2], 8)

  // RS-encode
  const blocks = RS_BLOCK_TABLE[version]
  const groups: { data: number[]; ec: number[] }[] = []
  let pos = 0
  const rawBytes = buf.bytes
  const ecLen = EC_BYTES_PER_BLOCK_M[version]
  const n1 = blocks[0], d1 = blocks[1]
  const n2 = blocks.length > 2 ? blocks[2] : 0
  const d2 = blocks.length > 2 ? blocks[3] : 0
  for (let i = 0; i < n1; i++) {
    const data = rawBytes.slice(pos, pos + d1); pos += d1
    groups.push({ data, ec: rsEncode(data, ecLen) })
  }
  for (let i = 0; i < n2; i++) {
    const data = rawBytes.slice(pos, pos + d2); pos += d2
    groups.push({ data, ec: rsEncode(data, ecLen) })
  }

  // Interleave
  const maxData = Math.max(d1, d2)
  const interleaved: number[] = []
  for (let i = 0; i < maxData; i++) {
    for (const g of groups) if (i < g.data.length) interleaved.push(g.data[i])
  }
  for (let i = 0; i < ecLen; i++) {
    for (const g of groups) interleaved.push(g.ec[i])
  }
  const dataBits = new Uint8Array(interleaved)

  // Build matrix
  const m = allocMatrix(size)
  setFinder(m, 0, 0)
  setFinder(m, 0, size - 7)
  setFinder(m, size - 7, 0)
  setTiming(m)
  reserveFormat(m)

  // Record reserved before placing data
  const reserved: boolean[][] = m.map(row => row.map(v => v !== null))
  placeData(m, dataBits)
  applyMask(m, reserved)
  placeFormat(m)

  // Finalize nulls to false
  return m.map(row => row.map(v => v === true))
}

// ── React component ────────────────────────────────────────────────

export function QrCode({ text, size = 192 }: { text: string; size?: number }) {
  const matrix = React.useMemo(() => {
    try { return encode(text) } catch { return null }
  }, [text])
  if (!matrix) {
    return (
      <div style={{ width: size, height: size, display: 'grid', placeItems: 'center',
                    background: '#fff', color: '#b00', fontSize: 11, border: '1px solid #eee' }}>
        (QR too large)
      </div>
    )
  }
  const n = matrix.length
  const quiet = 2
  const view = n + quiet * 2
  // Build a single combined <path> for compactness
  const parts: string[] = []
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (matrix[r][c]) parts.push(`M${c + quiet} ${r + quiet}h1v1h-1z`)
    }
  }
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${view} ${view}`}
      width={size} height={size}
      shapeRendering="crispEdges"
      style={{ background: '#fff', borderRadius: 6, display: 'block' }}
      role="img"
      aria-label={`QR code for ${text}`}
    >
      <path d={parts.join('')} fill="#111" />
    </svg>
  )
}

/**
 * LogoWish3D — the big blocky "WISH" wordmark shown on the chat empty state.
 *
 * Renders each letter as a 5-row pixel matrix of SVG rects, then stamps a
 * shifted darker copy underneath for a pixel-3D drop shadow. Colors use
 * the brand tokens so theme switches flow through.
 */

import React from 'react'

type Matrix = Array<Array<0 | 1>>

// 5-row pixel letters. Width varies per letter; letters share the same
// height so vertical alignment is automatic.
const LETTERS: Record<string, Matrix> = {
  W: [
    [1, 1, 0, 0, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 1, 0, 0, 1, 1],
    [1, 1, 0, 1, 1, 1, 0, 1, 1],
    [1, 1, 1, 1, 0, 1, 1, 1, 1],
  ],
  I: [
    [1, 1, 1],
    [0, 1, 0],
    [0, 1, 0],
    [0, 1, 0],
    [1, 1, 1],
  ],
  S: [
    [0, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 0, 0],
    [0, 1, 1, 1, 1, 0],
    [0, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 0],
  ],
  H: [
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 1, 1, 1, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
    [1, 1, 0, 0, 0, 1, 1],
  ],
}

const WORD = ['W', 'I', 'S', 'H']
const ROWS = 5
const LETTER_GAP = 2 // empty pixel columns between letters

interface Props {
  /** Height of the mark in CSS pixels (cell size × ROWS). */
  height?: number
  /** Override the main color; defaults to `var(--brand)`. */
  color?: string
  /** Override the shadow color; defaults to `var(--brand-dk)`. */
  shadow?: string
}

export const LogoWish3D: React.FC<Props> = ({ height = 120, color, shadow }) => {
  const fill = color ?? 'var(--brand)'
  const shadowFill = shadow ?? 'var(--brand-dk, rgba(0,0,0,0.3))'

  // Build pixel offsets for each letter's filled cells plus a running x-cursor.
  let cursor = 0
  const cells: Array<{ x: number; y: number }> = []
  for (const letter of WORD) {
    const m = LETTERS[letter]
    const w = m[0].length
    for (let y = 0; y < ROWS; y++) {
      for (let x = 0; x < w; x++) {
        if (m[y][x]) cells.push({ x: cursor + x, y })
      }
    }
    cursor += w + LETTER_GAP
  }
  const totalCols = cursor - LETTER_GAP

  // Viewbox: add 1 column & 1 row of padding to fit the shadow offset.
  const SHADOW_OFFSET = 1
  const viewW = totalCols + SHADOW_OFFSET
  const viewH = ROWS + SHADOW_OFFSET
  const cellPx = height / viewH

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewW} ${viewH}`}
      width={viewW * cellPx}
      height={height}
      shapeRendering="crispEdges"
      aria-label="WISH"
      role="img"
      style={{ display: 'block' }}
    >
      {/* 3D shadow layer — offset one cell down-right, darker purple. */}
      <g fill={shadowFill}>
        {cells.map((c, i) => (
          <rect
            key={`s${i}`}
            x={c.x + SHADOW_OFFSET}
            y={c.y + SHADOW_OFFSET}
            width={1}
            height={1}
          />
        ))}
      </g>
      {/* Main letterforms. */}
      <g fill={fill}>
        {cells.map((c, i) => (
          <rect key={`m${i}`} x={c.x} y={c.y} width={1} height={1} />
        ))}
      </g>
    </svg>
  )
}

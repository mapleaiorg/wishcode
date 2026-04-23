/**
 * Logo — WishCode short mark, drawn as a pixel-art face.
 *
 * Two eye blocks at the top, a small nose block, a wide mouth bar, and two
 * hanging "fang" blocks at the bottom. Pure SVG rects on an 8×8 grid so it
 * scales crisply at any size. Default tint is the WishCode brand purple
 * (`--brand`); pass `framed` for a light rounded container.
 */

import React from 'react'

interface LogoProps {
  size?: number
  framed?: boolean
  color?: string
}

// 8×8 pixel grid for the face mark. Each filled cell is rendered as a
// brand-colored square. Rows are top→bottom.
const GRID: Array<Array<0 | 1>> = [
  [1, 1, 0, 0, 0, 0, 1, 1],   // eyes row 1
  [1, 1, 0, 0, 0, 0, 1, 1],   // eyes row 2
  [0, 0, 0, 1, 1, 0, 0, 0],   // nose row
  [0, 0, 0, 1, 1, 0, 0, 0],
  [1, 1, 1, 1, 1, 1, 1, 1],   // mouth bar
  [1, 1, 1, 1, 1, 1, 1, 1],
  [1, 1, 0, 0, 0, 0, 1, 1],   // fangs
  [0, 0, 0, 0, 0, 0, 0, 0],
]

export const Logo: React.FC<LogoProps> = ({ size = 24, framed = false, color }) => {
  const fill = color ?? 'var(--brand)'
  const cell = 1 // viewBox units per grid cell
  const inner = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 8 8"
      width={framed ? size * 0.78 : size}
      height={framed ? size * 0.78 : size}
      shapeRendering="crispEdges"
      aria-hidden="true"
    >
      {GRID.flatMap((row, y) =>
        row.map((v, x) =>
          v ? (
            <rect key={`${x},${y}`} x={x * cell} y={y * cell} width={cell} height={cell} fill={fill} />
          ) : null,
        ),
      )}
    </svg>
  )

  if (!framed) {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, color: fill,
        }}
        aria-label="Wish Code"
      >
        {inner}
      </span>
    )
  }

  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
        width: size, height: size, background: '#fff',
        borderRadius: size * 0.22,
      }}
      aria-label="Wish Code"
    >
      {inner}
    </span>
  )
}

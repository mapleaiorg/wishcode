/**
 * Logo — the iBank short-mark (two rotated 'b' glyphs).
 *
 * Inlined SVG so it scales, tints, and frames without an extra request.
 * Default color is the iBank corporate blue (`--brand`). Pass `framed`
 * for a white rounded background — useful on dark sidebars.
 */

import React from 'react'

interface LogoProps {
  size?: number
  framed?: boolean
  color?: string
}

export const Logo: React.FC<LogoProps> = ({ size = 24, framed = false, color }) => {
  const fill = color ?? 'var(--brand)'
  const inner = (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 54.39 54.39"
      width={framed ? size * 0.78 : size}
      height={framed ? size * 0.78 : size}
      aria-hidden="true"
    >
      <g transform="translate(-3.055 3.055)">
        <g fill={fill}>
          <text
            style={{ fontFamily: 'Impact, Impact', fontSize: '38.27px', letterSpacing: '-.34em' }}
            transform="translate(16.1 31.39) rotate(45)"
          >
            <tspan x="0" y="0">b</tspan>
          </text>
          <text
            style={{ fontFamily: 'Impact, Impact', fontSize: '38.27px', letterSpacing: '-.34em' }}
            transform="translate(44.41 16.89) rotate(-135)"
          >
            <tspan x="0" y="0">b</tspan>
          </text>
        </g>
      </g>
    </svg>
  )

  if (!framed) {
    return (
      <span
        style={{
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          width: size, height: size, color: fill,
        }}
        aria-label="iBank"
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
      aria-label="iBank"
    >
      {inner}
    </span>
  )
}

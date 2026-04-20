import React from 'react'

interface OpeniBankLongMarkProps {
  height?: number
  color?: string
}

/**
 * Brand wordmark based directly on the original OpeniBank long SVG.
 * The geometry and transforms match the source asset; only the fill
 * color is parameterized so we can tint it with the product blue.
 */
export function OpeniBankLongMark({
  height = 18,
  color = 'currentColor',
}: OpeniBankLongMarkProps) {
  const width = (165.78 / 44.15) * height

  return (
    <svg
      viewBox="0 0 165.78 44.15"
      width={width}
      height={height}
      aria-label="OpeniBank"
      role="img"
    >
      <g fill={color}>
        <text
          style={{ fontFamily: 'Impact, Impact', fontSize: '37.45px' }}
          transform="translate(71.27 32.24) scale(.96) skewX(-16)"
        >
          <tspan x="0" y="0">I</tspan>
        </text>
        <text
          style={{ fontFamily: 'Impact, Impact', fontSize: '36px' }}
          transform="translate(0 32.25)"
        >
          <tspan x="0" y="0">OPEN</tspan>
        </text>
        <text
          style={{ fontFamily: 'Impact, Impact', fontSize: '36px' }}
          transform="translate(88.6 32.25)"
        >
          <tspan x="0" y="0">BANK</tspan>
        </text>
      </g>
    </svg>
  )
}

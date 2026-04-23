/**
 * LogoLong — the short mark followed by the "Wish Code" wordmark.
 */

import React from 'react'
import { Logo } from './Logo'

interface LogoLongProps {
  height?: number
  color?: string
}

export const LogoLong: React.FC<LogoLongProps> = ({ height = 28, color }) => {
  const markSize = height
  const fontSize = height * 0.74
  const tint = color ?? 'var(--brand)'
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center',
        gap: height * 0.28, color: tint,
      }}
      aria-label="Wish Code"
    >
      <Logo size={markSize} framed={false} color={tint} />
      <span
        style={{
          fontFamily:
            "'Inter', 'SF Pro Display', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          fontWeight: 700,
          fontSize,
          letterSpacing: -fontSize * 0.025,
          lineHeight: 1,
          color: tint,
        }}
      >
        Wish Code
      </span>
    </span>
  )
}

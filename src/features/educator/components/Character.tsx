/**
 * Sage — the OpeniBank Educator mascot.
 *
 * A stylized "fintech-owl" character: clear head/body/wings anatomy,
 * graduation cap, bowtie, and a hex-coin chest badge that anchors the
 * finance/crypto identity. Driven by framer-motion through a tiny
 * state-prop API so the SVG can later be swapped for a Rive state
 * machine without changing call sites.
 *
 * States:
 *   - idle:       gentle float, slow blink
 *   - explain:    lean-in, subtle head tilt, mouth speaking oval
 *   - correct:    bounce + smile + happy eye-arcs, badge glow
 *   - warn:       slight horizontal shake, raised brows, flat mouth
 *   - celebrate:  strong bounce + sparkle burst, gold badge ring
 *
 * Theming: primary feather color uses the page accent token so the
 * character sits well in both light and dark schemes. Ground shadow
 * and outline use `currentColor`/tokens so nothing is hard-coded dark.
 */

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'

export type CharacterState = 'idle' | 'explain' | 'correct' | 'warn' | 'celebrate'

interface Props {
  state?: CharacterState
  size?: number
  label?: string
}

export function Character({ state = 'idle', size = 180, label }: Props) {
  // ── Body motion per state ────────────────────────────────────────────
  const bodyAnimation =
    state === 'celebrate'
      ? { y: [0, -14, 0, -8, 0], rotate: [0, -5, 5, -2, 0] }
      : state === 'correct'
      ? { y: [0, -10, 0], rotate: [0, 0, 0] }
      : state === 'warn'
      ? { x: [0, -4, 4, -3, 3, 0], rotate: [0, 0, 0] }
      : state === 'explain'
      ? { y: [0, -3, 0], rotate: [-1.5, 1.5, -1.5] }
      : { y: [0, -4, 0], rotate: [0, 0, 0] }

  const bodyTransition =
    state === 'idle'
      ? { duration: 3.8, repeat: Infinity, ease: 'easeInOut' as const }
      : state === 'explain'
      ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' as const }
      : { duration: 0.8, ease: 'easeOut' as const }

  // Head tilts a touch extra when explaining — stacked on top of body motion.
  const headAnimation =
    state === 'explain'
      ? { rotate: [-3, 3, -3] }
      : state === 'warn'
      ? { rotate: [-2, 2, -2, 0] }
      : { rotate: 0 }
  const headTransition =
    state === 'explain'
      ? { duration: 2.6, repeat: Infinity, ease: 'easeInOut' as const }
      : state === 'warn'
      ? { duration: 0.6 }
      : { duration: 0.4 }

  // Wing flap for celebrate/correct — left wing rotates negative, right wing
  // mirrors with the opposite sign so they flap symmetrically.
  const wingFlapLeft: number[] | number =
    state === 'celebrate'
      ? [0, -22, 0, -22, 0]
      : state === 'correct'
      ? [0, -14, 0]
      : 0
  const wingFlapRight: number[] | number = Array.isArray(wingFlapLeft)
    ? wingFlapLeft.map((r) => -r)
    : 0
  const wingTransition =
    state === 'celebrate'
      ? { duration: 0.9 }
      : state === 'correct'
      ? { duration: 0.6 }
      : { duration: 0.3 }

  const accent = accentForState(state)
  const badgeGlow = state === 'correct' || state === 'celebrate' ? 0.9 : 0.35

  return (
    <div
      className={`edu-character edu-character-${state}`}
      style={{ width: size, height: size, position: 'relative' }}
      aria-label={label ?? 'Sage — the OpeniBank Educator'}
      role="img"
    >
      <motion.svg
        viewBox="0 0 200 200"
        width={size}
        height={size}
        initial={false}
        animate={bodyAnimation}
        transition={bodyTransition}
      >
        <defs>
          {/* Feather gradient — uses theme accent at top, deeper shade below */}
          <linearGradient id="sageFeathers" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="var(--accent, #4a86e8)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--accent-hi, #2d5ab8)" stopOpacity="1" />
          </linearGradient>
          <linearGradient id="sageBelly" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#fff7e0" />
            <stop offset="100%" stopColor="#ffe0a8" />
          </linearGradient>
          <radialGradient id="sageGlow" cx="50%" cy="50%" r="55%">
            <stop offset="0%" stopColor={accent} stopOpacity={badgeGlow} />
            <stop offset="100%" stopColor={accent} stopOpacity="0" />
          </radialGradient>
          <linearGradient id="sageCoin" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f6c84c" />
            <stop offset="100%" stopColor="#d79a1a" />
          </linearGradient>
        </defs>

        {/* Ground shadow — translucent so it works in light+dark */}
        <ellipse cx="100" cy="186" rx="44" ry="5" fill="#000" opacity="0.14" />

        {/* Aura — swells on positive states */}
        <motion.circle
          cx="100"
          cy="108"
          r="86"
          fill="url(#sageGlow)"
          initial={{ opacity: 0.35 }}
          animate={{ opacity: badgeGlow }}
          transition={{ duration: 0.4 }}
        />

        {/* ── Body (owl torso) ──────────────────────────────── */}
        <g>
          {/* Back wings (sit behind the body) */}
          <motion.path
            d="M54 120 Q30 130 40 162 Q58 158 68 140 Z"
            fill="url(#sageFeathers)"
            stroke="var(--accent-hi, #2d5ab8)"
            strokeWidth="2"
            style={{ transformOrigin: '58px 128px' }}
            animate={{ rotate: wingFlapLeft }}
            transition={wingTransition}
          />
          <motion.path
            d="M146 120 Q170 130 160 162 Q142 158 132 140 Z"
            fill="url(#sageFeathers)"
            stroke="var(--accent-hi, #2d5ab8)"
            strokeWidth="2"
            style={{ transformOrigin: '142px 128px' }}
            animate={{ rotate: wingFlapRight }}
            transition={wingTransition}
          />

          {/* Torso — pear-shaped, clearly separate from head */}
          <path
            d="M64 132 Q60 180 100 180 Q140 180 136 132 Q132 112 100 112 Q68 112 64 132 Z"
            fill="url(#sageFeathers)"
            stroke="var(--accent-hi, #2d5ab8)"
            strokeWidth="2.5"
          />
          {/* Belly patch */}
          <path
            d="M82 140 Q80 174 100 174 Q120 174 118 140 Q110 130 100 130 Q90 130 82 140 Z"
            fill="url(#sageBelly)"
            opacity="0.95"
          />

          {/* Feet */}
          <g fill="#d79a1a" stroke="#8a5a0b" strokeWidth="1.2">
            <path d="M86 180 L84 188 M90 180 L90 189 M94 180 L96 188" strokeLinecap="round" />
            <path d="M106 180 L104 188 M110 180 L110 189 M114 180 L116 188" strokeLinecap="round" />
          </g>

          {/* ── Hex coin chest badge — crypto/finance cue ─────────── */}
          <g transform="translate(100 152)">
            <motion.g
              animate={
                state === 'correct' || state === 'celebrate'
                  ? { scale: [1, 1.18, 1] }
                  : { scale: 1 }
              }
              transition={{ duration: 0.55 }}
              style={{ transformOrigin: '0px 0px' }}
            >
              {/* Hex shape */}
              <polygon
                points="0,-12 10.4,-6 10.4,6 0,12 -10.4,6 -10.4,-6"
                fill="url(#sageCoin)"
                stroke="#8a5a0b"
                strokeWidth="1.4"
              />
              {/* "i" monogram for iBank */}
              <circle cx="0" cy="-4" r="1.4" fill="#4a2c05" />
              <rect x="-1.2" y="-1.5" width="2.4" height="8" rx="1" fill="#4a2c05" />
            </motion.g>
          </g>
        </g>

        {/* ── Head group — tilt responds to explain/warn ────────── */}
        <motion.g
          animate={headAnimation}
          transition={headTransition}
          style={{ transformOrigin: '100px 84px' }}
        >
          {/* Head base — rounded square reads more like a knowing owl than a circle blob */}
          <path
            d="M54 76 Q54 40 100 40 Q146 40 146 76 Q146 118 100 118 Q54 118 54 76 Z"
            fill="url(#sageFeathers)"
            stroke="var(--accent-hi, #2d5ab8)"
            strokeWidth="2.5"
          />

          {/* Ear tufts (tiny, subtle, signal "owl" without becoming cartoonish) */}
          <path d="M60 48 L68 32 L76 50 Z" fill="var(--accent-hi, #2d5ab8)" />
          <path d="M140 48 L132 32 L124 50 Z" fill="var(--accent-hi, #2d5ab8)" />

          {/* Eye discs — the big owl-goggles that make facial expression readable */}
          <g>
            <circle cx="80" cy="82" r="16" fill="#fff" stroke="var(--accent-hi, #2d5ab8)" strokeWidth="2" />
            <circle cx="120" cy="82" r="16" fill="#fff" stroke="var(--accent-hi, #2d5ab8)" strokeWidth="2" />
          </g>

          {/* Pupils / expression eyes */}
          {renderEyes(state)}

          {/* Beak — small diamond between and below the eyes */}
          <path
            d="M100 96 L106 104 L100 108 L94 104 Z"
            fill="#f6c84c"
            stroke="#8a5a0b"
            strokeWidth="1.2"
          />

          {/* Expression mouth line (only for states that aren't a closed smile) */}
          {renderMouth(state)}

          {/* Rosy cheeks */}
          <circle cx="68" cy="100" r="4.5" fill="#ff98a8" opacity="0.55" />
          <circle cx="132" cy="100" r="4.5" fill="#ff98a8" opacity="0.55" />

          {/* ── Bowtie — small professional cue ──────────────── */}
          <g transform="translate(100 120)">
            <path d="M-10 0 L-4 -5 L-4 5 Z" fill="#c0392b" />
            <path d="M10 0 L4 -5 L4 5 Z" fill="#c0392b" />
            <circle cx="0" cy="0" r="2.2" fill="#8a1a12" />
          </g>

          {/* ── Graduation cap ─────────────────────────────────── */}
          <g>
            <rect x="66" y="32" width="68" height="7" rx="1.5" fill="#1f2937" />
            <polygon points="100,14 148,32 100,44 52,32" fill="#1f2937" />
            <circle cx="100" cy="22" r="2.8" fill="#f0b429" />
            <motion.path
              d="M100 22 Q114 30 122 44"
              stroke="#f0b429"
              strokeWidth="2"
              fill="none"
              animate={
                state === 'celebrate'
                  ? { d: ['M100 22 Q114 30 122 44', 'M100 22 Q116 34 128 48', 'M100 22 Q114 30 122 44'] }
                  : { d: 'M100 22 Q114 30 122 44' }
              }
              transition={{ duration: 0.7 }}
            />
          </g>
        </motion.g>
      </motion.svg>

      {/* Sparkle layer for celebrate */}
      <AnimatePresence>
        {state === 'celebrate' && <Sparkles accent={accent} />}
      </AnimatePresence>
    </div>
  )
}

// ── Face parts ──────────────────────────────────────────────────────────

function renderEyes(state: CharacterState): React.ReactNode {
  if (state === 'correct' || state === 'celebrate') {
    // Happy closed crescents
    return (
      <g fill="none" stroke="#0b1220" strokeWidth="2.6" strokeLinecap="round">
        <path d="M72 82 q8 -7 16 0" />
        <path d="M112 82 q8 -7 16 0" />
      </g>
    )
  }
  if (state === 'warn') {
    // Wide pupils + raised angry brows
    return (
      <g fill="#0b1220">
        <circle cx="80" cy="84" r="4.6" />
        <circle cx="120" cy="84" r="4.6" />
        <path d="M68 72 L92 76" stroke="#0b1220" strokeWidth="2.6" strokeLinecap="round" />
        <path d="M132 72 L108 76" stroke="#0b1220" strokeWidth="2.6" strokeLinecap="round" />
      </g>
    )
  }
  // idle / explain — round pupils that slowly blink via scaleY
  return (
    <g fill="#0b1220">
      <motion.ellipse
        cx="80"
        cy="82"
        rx="4.2"
        ry="5.2"
        animate={{ scaleY: [1, 1, 0.1, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, times: [0, 0.9, 0.94, 0.98] }}
        style={{ transformOrigin: '80px 82px' }}
      />
      <motion.ellipse
        cx="120"
        cy="82"
        rx="4.2"
        ry="5.2"
        animate={{ scaleY: [1, 1, 0.1, 1] }}
        transition={{ duration: 4.5, repeat: Infinity, times: [0, 0.9, 0.94, 0.98] }}
        style={{ transformOrigin: '120px 82px' }}
      />
      {/* tiny highlight */}
      <circle cx="82" cy="80" r="1" fill="#fff" />
      <circle cx="122" cy="80" r="1" fill="#fff" />
    </g>
  )
}

function renderMouth(state: CharacterState): React.ReactNode {
  switch (state) {
    case 'explain':
      // Small open oval — "speaking"
      return <ellipse cx="100" cy="114" rx="5" ry="3.2" fill="#8a1a12" />
    case 'warn':
      // Flat line — concern
      return (
        <path
          d="M90 114 L110 114"
          stroke="#0b1220"
          strokeWidth="2.4"
          strokeLinecap="round"
          fill="none"
        />
      )
    case 'correct':
    case 'celebrate':
      // Wider smile
      return (
        <path
          d="M86 112 Q100 124 114 112"
          stroke="#0b1220"
          strokeWidth="2.6"
          fill="none"
          strokeLinecap="round"
        />
      )
    default:
      // idle — small friendly smile
      return (
        <path
          d="M92 114 Q100 120 108 114"
          stroke="#0b1220"
          strokeWidth="2.4"
          fill="none"
          strokeLinecap="round"
        />
      )
  }
}

function accentForState(state: CharacterState): string {
  switch (state) {
    case 'correct':
      return '#45c65a'
    case 'celebrate':
      return '#f0b429'
    case 'warn':
      return '#ff5d6c'
    case 'explain':
      return '#4a86e8'
    default:
      return '#9ad1ff'
  }
}

// ── Sparkle burst for celebrate ─────────────────────────────────────────

function Sparkles({ accent }: { accent: string }) {
  const pts = [
    { x: 30, y: 40 },
    { x: 170, y: 60 },
    { x: 50, y: 150 },
    { x: 160, y: 150 },
    { x: 100, y: 20 },
    { x: 20, y: 100 },
    { x: 180, y: 110 },
  ]
  return (
    <motion.svg
      viewBox="0 0 200 200"
      width="100%"
      height="100%"
      style={{ position: 'absolute', inset: 0, pointerEvents: 'none' }}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {pts.map((p, i) => (
        <motion.g
          key={i}
          initial={{ scale: 0, opacity: 0 }}
          animate={{ scale: [0, 1.3, 0.8, 0], opacity: [0, 1, 0.8, 0] }}
          transition={{ duration: 1.2, delay: i * 0.07 }}
          style={{ transformOrigin: `${p.x}px ${p.y}px` }}
        >
          <path
            d={`M${p.x} ${p.y - 8} L${p.x + 2} ${p.y - 2} L${p.x + 8} ${p.y} L${p.x + 2} ${p.y + 2} L${p.x} ${p.y + 8} L${p.x - 2} ${p.y + 2} L${p.x - 8} ${p.y} L${p.x - 2} ${p.y - 2} Z`}
            fill={accent}
          />
        </motion.g>
      ))}
    </motion.svg>
  )
}

/**
 * BadgeWall — earned and unearned badges laid out as medallions.
 */

import React from 'react'
import { motion } from 'framer-motion'
import { Lock } from 'lucide-react'
import { BADGES } from '../content/worlds'
import type { Progress } from '../types'

interface Props {
  progress: Progress
}

export function BadgeWall({ progress }: Props) {
  return (
    <div className="edu-badge-wall">
      {BADGES.map((badge, i) => {
        const earned = progress.earnedBadges.includes(badge.id)
        return (
          <motion.div
            key={badge.id}
            className={`edu-badge ${earned ? 'earned' : 'locked'}`}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.06 }}
          >
            <div className="edu-badge-glyph" aria-hidden>
              {earned ? badge.glyph : <Lock size={18} />}
            </div>
            <div className="edu-badge-body">
              <div className="edu-badge-label">{badge.label}</div>
              <div className="edu-badge-desc">{badge.description}</div>
            </div>
          </motion.div>
        )
      })}
    </div>
  )
}

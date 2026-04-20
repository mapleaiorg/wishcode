/**
 * EducatorView — top-level shell for the OpeniBank Educator.
 *
 * 5 tabs: Learn · Practice · Review · Tutor · Progress. The active tab
 * is persisted in localStorage so switching away from the view and back
 * returns the user to where they left off.
 */

import React, { useEffect, useState } from 'react'
import {
  GraduationCap, BookOpen, Beaker, RefreshCw, MessagesSquare, Trophy,
} from 'lucide-react'
import { LearnTab } from './tabs/LearnTab'
import { PracticeTab } from './tabs/PracticeTab'
import { ReviewTab } from './tabs/ReviewTab'
import { TutorTab } from './tabs/TutorTab'
import { ProgressTab } from './tabs/ProgressTab'
import { loadProgress, subscribe } from './state/progress'
import type { Progress } from './types'

type TabKey = 'learn' | 'practice' | 'review' | 'tutor' | 'progress'

const TAB_KEY = 'ibn.v1.edu.activeTab'

const TABS: Array<{ id: TabKey; label: string; icon: React.ReactNode }> = [
  { id: 'learn', label: 'Learn', icon: <BookOpen size={14} /> },
  { id: 'practice', label: 'Practice', icon: <Beaker size={14} /> },
  { id: 'review', label: 'Review', icon: <RefreshCw size={14} /> },
  { id: 'tutor', label: 'Tutor', icon: <MessagesSquare size={14} /> },
  { id: 'progress', label: 'Progress', icon: <Trophy size={14} /> },
]

export function EducatorView() {
  const [tab, setTab] = useState<TabKey>(() => {
    try {
      const saved = window.localStorage.getItem(TAB_KEY)
      if (saved && TABS.some((t) => t.id === saved)) return saved as TabKey
    } catch {
      /* ignore */
    }
    return 'learn'
  })
  const [progress, setProgress] = useState<Progress>(loadProgress())

  useEffect(() => subscribe(setProgress), [])

  useEffect(() => {
    try {
      window.localStorage.setItem(TAB_KEY, tab)
    } catch {
      /* ignore */
    }
  }, [tab])

  return (
    <div className="edu-view">
      <header className="edu-view-header">
        <div className="edu-view-brand">
          <GraduationCap size={18} />
          <div>
            <div className="edu-view-title">OpeniBank Educator</div>
            <div className="edu-view-sub">
              Learn blockchain, wallets, and crypto safety. Non-advisory, local-first.
            </div>
          </div>
        </div>
        <div className="edu-view-stats">
          <span className="edu-pill">
            <strong>{progress.xp}</strong> XP
          </span>
          <span className="edu-pill edu-pill-streak">
            <strong>{progress.streakDays}</strong> day streak
          </span>
          <span className="edu-pill">
            <strong>{progress.earnedBadges.length}</strong> badge{progress.earnedBadges.length === 1 ? '' : 's'}
          </span>
        </div>
      </header>

      <nav className="edu-view-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`edu-view-tab ${tab === t.id ? 'active' : ''}`}
            onClick={() => setTab(t.id)}
          >
            {t.icon}
            <span>{t.label}</span>
          </button>
        ))}
      </nav>

      <main className="edu-view-body">
        {tab === 'learn' && <LearnTab />}
        {tab === 'practice' && <PracticeTab />}
        {tab === 'review' && <ReviewTab />}
        {tab === 'tutor' && <TutorTab />}
        {tab === 'progress' && <ProgressTab />}
      </main>
    </div>
  )
}

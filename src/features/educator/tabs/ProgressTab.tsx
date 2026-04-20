/**
 * ProgressTab — XP, streak, mastery table, and badge wall.
 */

import React, { useEffect, useMemo, useState } from 'react'
import { Flame, Sparkles, Target, Award, Volume2, VolumeX } from 'lucide-react'
import { WORLDS } from '../content/worlds'
import { BadgeWall } from '../components/BadgeWall'
import { CertificatePreview } from '../components/CertificatePreview'
import { loadProgress, subscribe, resetProgress } from '../state/progress'
import { isMuted, setMuted } from '../sound'
import type { Progress } from '../types'

const LEARNER_NAME_KEY = 'ibn.v1.edu.learnerName'

export function ProgressTab() {
  const [progress, setProgress] = useState<Progress>(loadProgress())
  const [muted, setMutedState] = useState<boolean>(() => isMuted())
  const [learnerName, setLearnerName] = useState<string>(() => {
    try {
      return window.localStorage.getItem(LEARNER_NAME_KEY) ?? ''
    } catch {
      return ''
    }
  })

  useEffect(() => subscribe(setProgress), [])

  const updateName = (name: string) => {
    setLearnerName(name)
    try {
      if (name.trim()) window.localStorage.setItem(LEARNER_NAME_KEY, name)
      else window.localStorage.removeItem(LEARNER_NAME_KEY)
    } catch {
      /* storage might be disabled — the cert still works from memory */
    }
  }

  const stats = useMemo(() => {
    const all = WORLDS.flatMap((w) => w.levels.flatMap((l) => l.lessons))
    const completed = all.filter((l) => progress.lessons[l.id]?.firstCompletedAt).length
    const mastered = all.filter((l) => progress.lessons[l.id]?.mastery === 'mastered').length
    const missed = Object.values(progress.lessons).filter((lp) => lp.missedExerciseIds.length > 0).length
    return { total: all.length, completed, mastered, missed }
  }, [progress])

  const toggleMute = () => {
    const next = !muted
    setMuted(next)
    setMutedState(next)
  }

  return (
    <div className="edu-tab edu-progress-tab">
      <header className="edu-tab-header">
        <h2>Your progress</h2>
        <p>All data stays on this machine. Cloud sync is a Phase 3 feature.</p>
      </header>

      <section className="edu-stat-grid">
        <StatCard icon={<Sparkles size={16} />} label="XP" value={progress.xp} />
        <StatCard icon={<Flame size={16} />} label="Streak" value={`${progress.streakDays} day${progress.streakDays === 1 ? '' : 's'}`} />
        <StatCard icon={<Target size={16} />} label="Lessons" value={`${stats.completed} / ${stats.total}`} />
        <StatCard icon={<Award size={16} />} label="Mastered" value={stats.mastered} />
      </section>

      <section className="edu-panel">
        <header className="edu-panel-head">
          <h3>Mastery by world</h3>
        </header>
        <table className="edu-mastery-table">
          <thead>
            <tr>
              <th>World</th>
              <th>Lessons done</th>
              <th>Mastered</th>
              <th>In review</th>
            </tr>
          </thead>
          <tbody>
            {WORLDS.map((w) => {
              const ls = w.levels.flatMap((l) => l.lessons)
              const done = ls.filter((l) => progress.lessons[l.id]?.firstCompletedAt).length
              const mastered = ls.filter((l) => progress.lessons[l.id]?.mastery === 'mastered').length
              const review = ls.filter((l) => (progress.lessons[l.id]?.missedExerciseIds.length ?? 0) > 0).length
              return (
                <tr key={w.id}>
                  <td>
                    <span className="edu-inline-glyph">{w.glyph}</span> {w.title}
                  </td>
                  <td>{done} / {ls.length}</td>
                  <td>{mastered}</td>
                  <td>{review}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </section>

      <section className="edu-panel">
        <header className="edu-panel-head">
          <h3>Badges</h3>
        </header>
        <BadgeWall progress={progress} />
      </section>

      <section className="edu-panel">
        <header className="edu-panel-head">
          <h3>Certificate</h3>
        </header>
        <div className="edu-setting-row" style={{ marginBottom: 18 }}>
          <div>
            <div className="edu-setting-label">Name on certificate</div>
            <div className="edu-setting-sub">
              Used only for the printable / exported certificate. Stored locally under <code>ibn.v1.edu.learnerName</code>.
            </div>
          </div>
          <input
            className="edu-cert-name-input"
            type="text"
            value={learnerName}
            placeholder="Your name"
            onChange={(e) => updateName(e.target.value)}
            maxLength={80}
          />
        </div>
        <CertificatePreview progress={progress} name={learnerName} />
      </section>

      <section className="edu-panel">
        <header className="edu-panel-head">
          <h3>Settings</h3>
        </header>
        <div className="edu-setting-row">
          <div>
            <div className="edu-setting-label">Sound cues</div>
            <div className="edu-setting-sub">
              Short beeps for correct/wrong/XP. Uses the browser&rsquo;s Web Audio — no external files.
            </div>
          </div>
          <button className="edu-setting-toggle" onClick={toggleMute}>
            {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            {muted ? 'Muted' : 'On'}
          </button>
        </div>
        <div className="edu-setting-row">
          <div>
            <div className="edu-setting-label">Reset progress</div>
            <div className="edu-setting-sub">Clears all XP, streaks, mastery, and badges on this device.</div>
          </div>
          <button
            className="edu-setting-danger"
            onClick={() => {
              if (window.confirm('Reset all Educator progress? This cannot be undone.')) resetProgress()
            }}
          >
            Reset
          </button>
        </div>
      </section>
    </div>
  )
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="edu-stat-card">
      <div className="edu-stat-icon">{icon}</div>
      <div className="edu-stat-body">
        <div className="edu-stat-label">{label}</div>
        <div className="edu-stat-value">{value}</div>
      </div>
    </div>
  )
}

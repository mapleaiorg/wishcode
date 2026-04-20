/**
 * PracticeTab — scenario drills + Phase-2 wallet simulator.
 *
 * Ships hand-authored phishing/approval/network/seed-phrase/airdrop
 * scenarios (ScenarioPlayer) alongside the fake-chain WalletSimulator
 * where the user rehearses the exact send/approve/network decision moments.
 */

import React, { useEffect, useState } from 'react'
import { Beaker, ShieldAlert, ShieldCheck, Wallet } from 'lucide-react'
import { SCENARIOS } from '../content/scenarios'
import { ScenarioPlayer } from '../components/ScenarioPlayer'
import { WalletSimulator } from '../components/WalletSimulator'
import { loadProgress, subscribe } from '../state/progress'
import type { Progress } from '../types'

type Mode = 'drills' | 'simulator'

export function PracticeTab() {
  const [activeId, setActiveId] = useState<string | null>(null)
  const [mode, setMode] = useState<Mode>('drills')
  const [progress, setProgress] = useState<Progress>(loadProgress())

  useEffect(() => subscribe(setProgress), [])

  const scenario = SCENARIOS.find((s) => s.id === activeId) ?? null

  if (scenario) {
    return (
      <div className="edu-tab edu-practice-tab">
        <ScenarioPlayer
          scenario={scenario}
          onDone={() => setActiveId(null)}
          onExit={() => setActiveId(null)}
        />
      </div>
    )
  }

  return (
    <div className="edu-tab edu-practice-tab">
      <header className="edu-tab-header">
        <h2>Practice drills</h2>
        <p>
          Short, high-signal wallet-safety decisions. Every wrong option shows
          the real-world consequence so the lesson sticks.
        </p>
      </header>

      <div className="edu-practice-modes" role="tablist" aria-label="Practice modes">
        <button
          className={`edu-practice-mode ${mode === 'drills' ? 'active' : ''}`}
          onClick={() => setMode('drills')}
          role="tab"
          aria-selected={mode === 'drills'}
        >
          <Beaker size={14} /> Scenario drills
        </button>
        <button
          className={`edu-practice-mode ${mode === 'simulator' ? 'active' : ''}`}
          onClick={() => setMode('simulator')}
          role="tab"
          aria-selected={mode === 'simulator'}
        >
          <Wallet size={14} /> Wallet simulator
        </button>
      </div>

      {mode === 'drills' && (
        <div className="edu-drill-grid">
          {SCENARIOS.map((s) => {
            const times = progress.completedScenarios[s.id] ?? 0
            return (
              <button key={s.id} className="edu-drill-card" onClick={() => setActiveId(s.id)}>
                <div className="edu-drill-icon">
                  {times > 0 ? <ShieldCheck size={20} /> : <ShieldAlert size={20} />}
                </div>
                <div className="edu-drill-title">{s.title}</div>
                <div className="edu-drill-sub">{s.summary}</div>
                <div className="edu-drill-meta">
                  <span className={`edu-drill-topic edu-topic-${s.topic}`}>
                    {s.topic.replace(/-/g, ' ')}
                  </span>
                  <span className="edu-drill-count">
                    {times === 0 ? 'New' : `${times}× cleared`}
                  </span>
                </div>
              </button>
            )
          })}
        </div>
      )}

      {mode === 'simulator' && (
        <WalletSimulator />
      )}
    </div>
  )
}

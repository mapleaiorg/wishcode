/**
 * ScenarioPlayer — single-drill player for Practice tab.
 *
 * A simplified LessonPlayer that focuses on one ScenarioExercise.
 * Records completion via `bumpScenario` and awards small XP per attempt.
 */

import React, { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowRight, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { Scenario } from '../types'
import { Character, type CharacterState } from './Character'
import { bumpScenario } from '../state/progress'
import { playCorrect, playWrong } from '../sound'

interface Props {
  scenario: Scenario
  onDone?: (success: boolean) => void
  onExit?: () => void
}

export function ScenarioPlayer({ scenario, onDone, onExit }: Props) {
  const [picked, setPicked] = useState<string | null>(null)
  const [resolved, setResolved] = useState(false)
  const [success, setSuccess] = useState(false)
  const [charState, setCharState] = useState<CharacterState>('explain')

  const ex = scenario.exercise

  const choose = (id: string) => {
    if (resolved) return
    setPicked(id)
    const correct = id === ex.correctChoiceId
    setSuccess(correct)
    setResolved(true)
    if (correct) {
      setCharState('correct')
      playCorrect()
    } else {
      setCharState('warn')
      playWrong()
    }
    bumpScenario(scenario.id, correct ? 5 : 1)
  }

  const finish = () => {
    onDone?.(success)
  }

  const chosenChoice = ex.choices.find((c) => c.id === picked) ?? null

  return (
    <div className="edu-scenario-player">
      <header className="edu-scenario-header">
        <div>
          <div className="edu-scenario-topic">{scenario.topic.replace(/-/g, ' ')}</div>
          <h3 className="edu-scenario-title">{scenario.title}</h3>
        </div>
        {onExit && (
          <button className="edu-lesson-exit" onClick={onExit} title="Back">
            ×
          </button>
        )}
      </header>

      <div className="edu-scenario-body">
        <div className="edu-scenario-character">
          <Character state={charState} size={140} />
        </div>
        <div className="edu-scenario-stage">
          <p className="edu-scenario-context">{ex.context}</p>
          <h4 className="edu-scenario-prompt">{ex.prompt}</h4>
          <div className="edu-choices">
            {ex.choices.map((c) => {
              const chosen = picked === c.id
              const isCorrect = c.id === ex.correctChoiceId
              const state = !resolved
                ? chosen ? 'chosen' : 'idle'
                : isCorrect
                ? 'correct'
                : chosen
                ? 'wrong'
                : 'muted'
              return (
                <button
                  key={c.id}
                  className={`edu-choice edu-choice-${state}`}
                  disabled={resolved}
                  onClick={() => choose(c.id)}
                >
                  <span>{c.label}</span>
                  {resolved && (
                    <em className={`edu-outcome edu-outcome-${c.outcome}`}>{c.outcome}</em>
                  )}
                </button>
              )
            })}
          </div>

          <AnimatePresence>
            {resolved && chosenChoice && (
              <motion.div
                className={`edu-scenario-explain ${success ? 'correct' : 'wrong'}`}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
              >
                {success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                <span>{chosenChoice.explain}</span>
              </motion.div>
            )}
          </AnimatePresence>

          {resolved && (
            <button className="edu-lesson-next" onClick={finish}>
              Continue <ArrowRight size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

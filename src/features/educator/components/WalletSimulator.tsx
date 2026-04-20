/**
 * WalletSimulator — Phase 2 sandbox.
 *
 * A fake-chain, fake-token, fake-wallet playground. Users rehearse the
 * exact decision points where real wallets lose money:
 *   - Send review (address + network + amount confirm)
 *   - Approve review (scope + spender identity)
 *   - Network switch (intent vs. impersonation)
 *
 * Nothing here talks to `window.ibank.wallet.*` — by design. The simulator
 * exists entirely in renderer state so it can never move real funds, and
 * so every outcome is authored, not emergent.
 *
 * Each drill follows the same loop:
 *   setup → prompt → review → sign/reject → outcome → next drill
 */

import React, { useMemo, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Wallet,
  ArrowRight,
  Send,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Network,
  KeyRound,
  RotateCcw,
} from 'lucide-react'
import { playCorrect, playWrong, playXp } from '../sound'
import { bumpScenario } from '../state/progress'

// ── Drill definitions ──────────────────────────────────────────────────

type Outcome = 'safe' | 'risky' | 'catastrophic'

interface DrillChoice {
  id: string
  label: string
  outcome: Outcome
  explain: string
}

type ReviewField = { label: string; value: string; flag?: 'ok' | 'warn' | 'err' }

interface Drill {
  id: string
  topic: 'send' | 'approve' | 'network'
  icon: React.ReactNode
  title: string
  summary: string
  /** The "before you sign" review panel. */
  review: ReviewField[]
  /** The choice the user is asked to make once they've read the review. */
  prompt: string
  choices: DrillChoice[]
  correctChoiceId: string
  /** Short note shown after the drill regardless of outcome. */
  takeaway: string
}

const DRILLS: Drill[] = [
  {
    id: 'sim-send-wrong-network',
    topic: 'send',
    icon: <Send size={16} />,
    title: 'Send review — network mismatch',
    summary: 'Someone pasted you an address. Your wallet is on a different chain.',
    review: [
      { label: 'Asset', value: '250 USDC' },
      { label: 'To', value: '0x7a…39bC' },
      { label: 'Your wallet network', value: 'Ethereum', flag: 'warn' },
      { label: 'Recipient-expected network', value: 'Polygon', flag: 'err' },
      { label: 'Estimated gas', value: '0.0043 ETH (~$14.20)' },
    ],
    prompt: 'The recipient expected USDC on Polygon but your wallet is on Ethereum. What do you do?',
    choices: [
      {
        id: 'send-anyway',
        label: 'Send anyway — the address looks right',
        outcome: 'catastrophic',
        explain: 'Wrong-network sends do not "find their way". USDC on Ethereum is a different contract from USDC on Polygon — the funds would land with no easy recovery.',
      },
      {
        id: 'switch-network',
        label: 'Cancel, switch to Polygon in the wallet, resend',
        outcome: 'safe',
        explain: 'Correct: match the wallet network to the recipient-expected network before sending.',
      },
      {
        id: 'send-tiny',
        label: 'Send $1 first as a test on the current network',
        outcome: 'risky',
        explain: 'Still lands on the wrong chain. The test just loses $1 instead of $250.',
      },
      {
        id: 'ask-later',
        label: 'Hit Sign and ask the recipient afterwards',
        outcome: 'catastrophic',
        explain: 'Never ask after signing — there is no undo.',
      },
    ],
    correctChoiceId: 'switch-network',
    takeaway: 'Match wallet network to recipient-expected network before signing any send.',
  },
  {
    id: 'sim-approve-unlimited',
    topic: 'approve',
    icon: <KeyRound size={16} />,
    title: 'Approval review — scope matters',
    summary: 'A DEX is asking for permission to move your tokens.',
    review: [
      { label: 'Contract', value: 'routerV2.unknown-dex.xyz', flag: 'warn' },
      { label: 'Asset', value: 'USDC' },
      { label: 'Requested allowance', value: 'Unlimited (2^256 − 1)', flag: 'err' },
      { label: 'Your planned swap', value: '120 USDC → ETH' },
      { label: 'Estimated gas', value: '0.0012 ETH (~$4.00)' },
    ],
    prompt: 'The site asks for unlimited USDC allowance but you only want to swap $120. What do you do?',
    choices: [
      {
        id: 'unlimited',
        label: 'Approve unlimited — faster next time',
        outcome: 'risky',
        explain: 'Unlimited approvals are the #1 drain vector. If that contract is ever compromised, every USDC in your wallet is reachable.',
      },
      {
        id: 'custom-exact',
        label: 'Approve exactly 120 USDC (custom amount)',
        outcome: 'safe',
        explain: 'Correct: approvals should be scoped to the actual spend.',
      },
      {
        id: 'reject-and-verify',
        label: 'Reject, verify the router on the project\'s own site, then retry',
        outcome: 'safe',
        explain: 'Also correct — the suspicious domain is worth a second look before any signature.',
      },
      {
        id: 'send-direct',
        label: 'Cancel and send the USDC directly to the DEX address',
        outcome: 'catastrophic',
        explain: 'That is not how DEXes work — the tokens would be permanently lost.',
      },
    ],
    correctChoiceId: 'custom-exact',
    takeaway: 'Approve exactly what you spend. Unlimited is a back door — treat it that way.',
  },
  {
    id: 'sim-network-switch-impersonation',
    topic: 'network',
    icon: <Network size={16} />,
    title: 'Network switch prompt',
    summary: 'A site is asking your wallet to add and switch to a "new" Ethereum.',
    review: [
      { label: 'Name', value: 'Ethereum Pro' },
      { label: 'Chain ID', value: '1337', flag: 'err' },
      { label: 'RPC URL', value: 'rpc.ethereum-pro.net', flag: 'warn' },
      { label: 'Currency symbol', value: 'ETH' },
      { label: 'Claimed by site', value: '"Official Ethereum mainnet"', flag: 'err' },
    ],
    prompt: 'Ethereum mainnet is Chain ID 1, not 1337. What is the correct action?',
    choices: [
      {
        id: 'approve-switch',
        label: 'Approve the switch — the symbol matches',
        outcome: 'catastrophic',
        explain: 'Anything signed on the fake network can be replayed against a clone contract. Chain ID is the identity that matters, not the symbol.',
      },
      {
        id: 'reject-switch',
        label: 'Reject. Stay on real Ethereum (Chain ID 1).',
        outcome: 'safe',
        explain: 'Correct. Fake networks are a phishing vector — they rebrand themselves to look familiar.',
      },
      {
        id: 'switch-then-back',
        label: 'Switch, sign the intended tx, then switch back',
        outcome: 'catastrophic',
        explain: 'Your signature on the fake network is still valid to attackers on the fake network.',
      },
      {
        id: 'ignore',
        label: 'Ignore the prompt and refresh — try the site again',
        outcome: 'risky',
        explain: 'A refresh will often replay the same malicious prompt. Close the tab and leave the site.',
      },
    ],
    correctChoiceId: 'reject-switch',
    takeaway: 'Chain ID identifies a network, not its name or symbol. Mainnet Ethereum is and only is Chain ID 1.',
  },
]

type Phase = 'idle' | 'setup' | 'review' | 'decide' | 'outcome'

// ── Component ──────────────────────────────────────────────────────────

export function WalletSimulator({ onExit }: { onExit?: () => void }) {
  const [drillIdx, setDrillIdx] = useState(0)
  const [phase, setPhase] = useState<Phase>('idle')
  const [picked, setPicked] = useState<string | null>(null)
  const [log, setLog] = useState<Array<{ text: string; tone: 'ok' | 'warn' | 'err' | 'info' }>>([
    { text: 'Fake-chain sandbox initialised. Balance preloaded: 1.25 ETH, 250 USDC.', tone: 'info' },
  ])

  const drill = DRILLS[drillIdx]
  const balance = useMemo(
    () => ({
      native: '1.25 ETH',
      usd: '~$4,162',
      token: '250.00 USDC',
    }),
    [],
  )

  const appendLog = (text: string, tone: 'ok' | 'warn' | 'err' | 'info') => {
    setLog((prev) => [...prev, { text, tone }])
  }

  const start = () => {
    setPhase('review')
    setPicked(null)
    appendLog(`[${drill.topic.toUpperCase()}] ${drill.title}`, 'info')
  }

  const decide = (choiceId: string) => {
    setPicked(choiceId)
    setPhase('outcome')
    const choice = drill.choices.find((c) => c.id === choiceId)!
    if (choice.outcome === 'safe') {
      playCorrect()
      appendLog(`✓ ${choice.label}`, 'ok')
      bumpScenario(drill.id)
      playXp()
    } else if (choice.outcome === 'risky') {
      playWrong()
      appendLog(`! ${choice.label}`, 'warn')
    } else {
      playWrong()
      appendLog(`✗ ${choice.label}  (would have drained the wallet)`, 'err')
    }
  }

  const nextDrill = () => {
    if (drillIdx < DRILLS.length - 1) {
      setDrillIdx(drillIdx + 1)
      setPhase('idle')
      setPicked(null)
    } else {
      setPhase('idle')
      setDrillIdx(0)
      appendLog('All simulator drills complete. Reset to run them again any time.', 'info')
    }
  }

  const restart = () => {
    setDrillIdx(0)
    setPhase('idle')
    setPicked(null)
    setLog([
      { text: 'Sandbox reset. Balance restored.', tone: 'info' },
    ])
  }

  return (
    <div className="edu-sim-card">
      <header className="edu-sim-head">
        <div>
          <h3 className="edu-sim-title">
            <Wallet size={16} style={{ verticalAlign: 'text-top', marginRight: 6 }} />
            Wallet simulator
          </h3>
          <p className="edu-sim-sub">
            Fake chain · fake tokens · your signatures never leave this screen.
          </p>
        </div>
        <div className="edu-sim-actions">
          <button className="edu-sim-btn" onClick={restart} title="Reset drills">
            <RotateCcw size={14} /> Reset
          </button>
          {onExit && (
            <button className="edu-sim-btn" onClick={onExit}>
              Close
            </button>
          )}
        </div>
      </header>

      <div className="edu-sim-balance">
        <div>
          <div className="edu-sim-balance-label">Native</div>
          <div className="edu-sim-balance-value">{balance.native}</div>
        </div>
        <div>
          <div className="edu-sim-balance-label">Token</div>
          <div className="edu-sim-balance-value">{balance.token}</div>
        </div>
      </div>

      <div className="edu-sim-drill-head">
        <span className="edu-sim-drill-icon">{drill.icon}</span>
        <div>
          <div className="edu-sim-drill-title">
            {drill.title}
            <span className="edu-sim-drill-count">
              {drillIdx + 1} / {DRILLS.length}
            </span>
          </div>
          <div className="edu-sim-drill-sub">{drill.summary}</div>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {phase === 'idle' && (
          <motion.div
            key="idle"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.24 }}
            className="edu-sim-idle"
          >
            <p className="edu-sim-idle-text">
              {drill.summary} When you&rsquo;re ready, open the review panel — this
              is the exact moment where the decision matters.
            </p>
            <button className="edu-sim-btn edu-sim-btn-primary" onClick={start}>
              Open review <ArrowRight size={14} />
            </button>
          </motion.div>
        )}

        {(phase === 'review' || phase === 'decide') && (
          <motion.div
            key="review"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.24 }}
          >
            <div className="edu-sim-review">
              <div className="edu-sim-review-head">
                <ShieldAlert size={15} /> Review before signing
              </div>
              <dl className="edu-sim-review-fields">
                {drill.review.map((f) => (
                  <React.Fragment key={f.label}>
                    <dt>{f.label}</dt>
                    <dd className={f.flag ? `edu-sim-flag-${f.flag}` : ''}>{f.value}</dd>
                  </React.Fragment>
                ))}
              </dl>
            </div>

            <div className="edu-sim-prompt">{drill.prompt}</div>

            <div className="edu-sim-choices">
              {drill.choices.map((c) => (
                <button
                  key={c.id}
                  className="edu-sim-choice"
                  onClick={() => decide(c.id)}
                >
                  <span>{c.label}</span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {phase === 'outcome' && picked && (
          <motion.div
            key="outcome"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={{ duration: 0.24 }}
          >
            <OutcomePanel
              choice={drill.choices.find((c) => c.id === picked)!}
              correct={picked === drill.correctChoiceId}
              takeaway={drill.takeaway}
            />
            <div className="edu-sim-actions" style={{ marginTop: 14 }}>
              <button className="edu-sim-btn edu-sim-btn-primary" onClick={nextDrill}>
                {drillIdx < DRILLS.length - 1 ? 'Next drill' : 'Finish simulator'}{' '}
                <ArrowRight size={14} />
              </button>
              <button className="edu-sim-btn" onClick={() => { setPhase('review'); setPicked(null) }}>
                Try again
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="edu-sim-log" aria-live="polite">
        {log.map((entry, i) => (
          <div key={i} className={`edu-sim-log-entry ${entry.tone === 'info' ? '' : entry.tone}`}>
            {entry.text}
          </div>
        ))}
      </div>
    </div>
  )
}

// ── Outcome panel ──────────────────────────────────────────────────────

function OutcomePanel({
  choice,
  correct,
  takeaway,
}: {
  choice: DrillChoice
  correct: boolean
  takeaway: string
}) {
  const tone = choice.outcome === 'safe' ? 'ok' : choice.outcome === 'risky' ? 'warn' : 'err'
  return (
    <div className={`edu-sim-outcome edu-sim-outcome-${tone}`}>
      <div className="edu-sim-outcome-head">
        {correct ? <CheckCircle2 size={16} /> : <XCircle size={16} />}
        <strong>
          {correct ? 'Safe' : choice.outcome === 'risky' ? 'Risky' : 'Catastrophic'}
        </strong>
        <span className="edu-sim-outcome-label">— {choice.label}</span>
      </div>
      <p className="edu-sim-outcome-explain">{choice.explain}</p>
      <div className="edu-sim-outcome-takeaway">
        <ShieldAlert size={14} /> {takeaway}
      </div>
    </div>
  )
}

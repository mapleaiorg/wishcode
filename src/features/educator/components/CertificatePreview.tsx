/**
 * CertificatePreview — Phase 3 completion certificate.
 *
 * Rendered when the user has cleared every lesson across all nine worlds.
 * Intentionally stays presentational and renderer-only:
 *   - no server-issued credential (Phase 3 would add a signed PDF behind a
 *     real IPC surface; the MVP just shows the certificate in-app)
 *   - no sharing/export integration beyond a `window.print()` fallback,
 *     which produces a clean printable / "Save as PDF" version on macOS
 *     without any new dependency
 *
 * The certificate is compliance-safe by construction: it attests to
 * _education completion_, never to _suitability_, _skill level_, or
 * anything a regulator would treat as advice.
 */

import React, { useMemo } from 'react'
import { Award, Printer, Download } from 'lucide-react'
import { WORLDS, BADGES } from '../content/worlds'
import type { Progress } from '../types'

interface Props {
  /** Live progress snapshot, usually from loadProgress(). */
  progress: Progress
  /** Optional recipient name; falls back to a friendly placeholder. */
  name?: string
  /** Called when the user clicks "Reset preview" — useful during authoring. */
  onDismiss?: () => void
}

export function CertificatePreview({ progress, name, onDismiss }: Props) {
  const summary = useMemo(() => {
    const lessons = WORLDS.flatMap((w) => w.levels.flatMap((l) => l.lessons))
    const completed = lessons.filter((l) => progress.lessons[l.id]?.firstCompletedAt).length
    const mastered = lessons.filter((l) => progress.lessons[l.id]?.mastery === 'mastered').length
    const badges = BADGES.filter((b) => progress.earnedBadges.includes(b.id)).length
    const isReady = completed === lessons.length
    const issuedOn = new Date().toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    return {
      completed,
      totalLessons: lessons.length,
      mastered,
      badges,
      totalBadges: BADGES.length,
      xp: progress.xp,
      isReady,
      issuedOn,
    }
  }, [progress])

  // Not eligible yet — show a gentle locked preview instead of hiding.
  if (!summary.isReady) {
    return (
      <div className="edu-cert edu-cert-locked">
        <div className="edu-cert-eyebrow">Certificate — locked</div>
        <div className="edu-cert-title">Finish all nine worlds to unlock</div>
        <p className="edu-cert-sub">
          You&rsquo;ve completed {summary.completed} of {summary.totalLessons} lessons.
          The certificate appears here automatically when the last lesson is cleared.
        </p>
        <div className="edu-cert-stat-row">
          <Stat label="Lessons" value={`${summary.completed}/${summary.totalLessons}`} />
          <Stat label="Badges" value={`${summary.badges}/${summary.totalBadges}`} />
          <Stat label="XP" value={summary.xp} />
        </div>
        <div className="edu-cert-footer">
          Educational attestation only. Not a financial licence, not a professional
          qualification, not investment advice.
        </div>
      </div>
    )
  }

  return (
    <div className="edu-cert" id="edu-cert-printable">
      <div className="edu-cert-eyebrow">OpeniBank Educator</div>
      <div className="edu-cert-title">
        <Award size={22} style={{ verticalAlign: 'middle', marginRight: 8, color: 'var(--edu-gold)' }} />
        Certificate of Completion
      </div>
      <p className="edu-cert-sub">
        This attests that the holder has completed the full Educator curriculum —
        Digital Money, Wallet Basics, Security, Transactions, Token Literacy, Risk
        Control, DeFi Safety, Advanced Wallet Operations, and OpeniBank Mastery.
      </p>
      <div className="edu-cert-name">
        {name && name.trim().length > 0 ? name : 'Self-Custody Learner'}
      </div>
      <div className="edu-cert-stat-row">
        <Stat label="Lessons" value={`${summary.completed}/${summary.totalLessons}`} />
        <Stat label="Mastered" value={summary.mastered} />
        <Stat label="Badges" value={`${summary.badges}/${summary.totalBadges}`} />
        <Stat label="XP" value={summary.xp} />
      </div>
      <div className="edu-cert-footer">
        Issued {summary.issuedOn} · OpeniBank Educator · Local attestation only.
        <br />
        Educational completion credential. Not a financial licence, not professional
        qualification, not investment advice.
      </div>

      <div className="edu-cert-actions">
        <button
          className="edu-cert-btn"
          onClick={() => window.print()}
          title="Print or save as PDF"
        >
          <Printer size={14} /> Print / Save PDF
        </button>
        <button
          className="edu-cert-btn"
          onClick={() => downloadAsHtml(summary, name)}
          title="Download a self-contained HTML copy"
        >
          <Download size={14} /> Download HTML
        </button>
        {onDismiss && (
          <button className="edu-cert-btn edu-cert-btn-ghost" onClick={onDismiss}>
            Close
          </button>
        )}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="edu-cert-stat">
      <div className="edu-cert-stat-label">{label}</div>
      <div className="edu-cert-stat-value">{value}</div>
    </div>
  )
}

// ── Download helper ────────────────────────────────────────────────────
//
// Produces a standalone HTML file the user can keep locally. No network,
// no dependency; uses a data: URL + synthetic click. Safe in Electron.

function downloadAsHtml(
  summary: {
    completed: number
    totalLessons: number
    mastered: number
    badges: number
    totalBadges: number
    xp: number
    issuedOn: string
  },
  name: string | undefined,
) {
  const displayName = name && name.trim().length > 0 ? name : 'Self-Custody Learner'
  const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" />
<title>OpeniBank Educator — Certificate of Completion</title>
<style>
  body { font-family: Georgia, 'Times New Roman', serif; color: #18202a; background: #fff; padding: 60px; }
  .wrap { max-width: 720px; margin: 0 auto; border: 2px solid #d79a1a; border-radius: 18px; padding: 48px; position: relative; box-shadow: 0 1px 6px rgba(0,0,0,0.08); }
  .wrap::before { content: ''; position: absolute; inset: 10px; border: 1px solid #d79a1a; border-radius: 12px; opacity: 0.5; }
  h1 { margin: 8px 0; font-size: 32px; }
  .eyebrow { text-transform: uppercase; letter-spacing: 0.22em; font-size: 11px; color: #d79a1a; font-weight: 700; }
  .name { font-size: 24px; margin: 18px 0 8px; border-bottom: 1px solid #ccc; display: inline-block; padding: 6px 0; min-width: 300px; }
  .sub { color: #4d5966; font-size: 14px; line-height: 1.55; }
  .stats { margin-top: 24px; display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; }
  .stat { text-align: center; }
  .stat-label { font-size: 10px; text-transform: uppercase; letter-spacing: 0.14em; color: #666; }
  .stat-value { font-size: 20px; font-weight: 700; color: #d79a1a; }
  .foot { margin-top: 28px; font-size: 11.5px; color: #666; line-height: 1.55; text-align: center; }
</style></head>
<body><div class="wrap">
  <div class="eyebrow">OpeniBank Educator</div>
  <h1>Certificate of Completion</h1>
  <p class="sub">This attests that the holder has completed the full Educator curriculum —
  Digital Money, Wallet Basics, Security, Transactions, Token Literacy, Risk Control,
  DeFi Safety, Advanced Wallet Operations, and OpeniBank Mastery.</p>
  <div class="name">${escapeHtml(displayName)}</div>
  <div class="stats">
    <div class="stat"><div class="stat-label">Lessons</div><div class="stat-value">${summary.completed}/${summary.totalLessons}</div></div>
    <div class="stat"><div class="stat-label">Mastered</div><div class="stat-value">${summary.mastered}</div></div>
    <div class="stat"><div class="stat-label">Badges</div><div class="stat-value">${summary.badges}/${summary.totalBadges}</div></div>
    <div class="stat"><div class="stat-label">XP</div><div class="stat-value">${summary.xp}</div></div>
  </div>
  <div class="foot">Issued ${summary.issuedOn} · OpeniBank Educator · Local attestation only.<br />
  Educational completion credential. Not a financial licence, not professional qualification, not investment advice.</div>
</div></body></html>`
  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `openibank-educator-certificate.html`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 0)
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string)
}

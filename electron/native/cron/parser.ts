/**
 * Minimal cron-expression parser + "matches this minute?" evaluator.
 *
 * Supports the classic 5-field format:
 *   minute hour dayOfMonth month dayOfWeek
 *
 * Per field:
 *   - "*"       any
 *   - "X/N"     every N (step)
 *   - "a-b"     range
 *   - "a,b,c"   list
 *   - "a-b/N"   range with step
 *
 * Plus shorthand aliases:
 *   @hourly  → "0 * * * *"
 *   @daily   → "0 0 * * *"
 *   @weekly  → "0 0 * * 0"
 *   @monthly → "0 0 1 * *"
 *
 * Does not implement seconds, L/W, named months/weekdays. That's enough to
 * cover 99% of "remind me every hour"-style schedules without a 50-LOC dep.
 */

const ALIASES: Record<string, string> = {
  '@hourly':  '0 * * * *',
  '@daily':   '0 0 * * *',
  '@midnight':'0 0 * * *',
  '@weekly':  '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly':  '0 0 1 1 *',
  '@annually':'0 0 1 1 *',
}

const RANGES: Array<[number, number]> = [
  [0, 59], // minute
  [0, 23], // hour
  [1, 31], // day of month
  [1, 12], // month
  [0, 6],  // day of week (0 = Sunday)
]

export interface CronFields {
  minute: Set<number>
  hour: Set<number>
  dom: Set<number>
  month: Set<number>
  dow: Set<number>
  /** True when both dom and dow are restricted — use OR semantics (classic vixie-cron). */
  domDowBothRestricted: boolean
  source: string
}

function parseField(field: string, idx: number): Set<number> {
  const [lo, hi] = RANGES[idx]
  const out = new Set<number>()
  for (const part of field.split(',')) {
    let stepStr = '1'
    let rangeStr = part
    const slash = part.indexOf('/')
    if (slash >= 0) {
      rangeStr = part.slice(0, slash)
      stepStr = part.slice(slash + 1)
    }
    const step = parseInt(stepStr, 10)
    if (!Number.isFinite(step) || step <= 0) throw new Error(`bad step: ${part}`)

    let start: number, end: number
    if (rangeStr === '*' || rangeStr === '') {
      start = lo; end = hi
    } else if (rangeStr.includes('-')) {
      const [a, b] = rangeStr.split('-').map((s) => parseInt(s, 10))
      if (!Number.isFinite(a) || !Number.isFinite(b)) throw new Error(`bad range: ${part}`)
      start = a; end = b
    } else {
      const n = parseInt(rangeStr, 10)
      if (!Number.isFinite(n)) throw new Error(`bad number: ${part}`)
      start = n; end = n
    }
    if (start < lo || end > hi || start > end) throw new Error(`out of range [${lo},${hi}]: ${part}`)
    for (let v = start; v <= end; v += step) out.add(v)
  }
  return out
}

export function parseCron(input: string): CronFields {
  const raw = input.trim()
  const expanded = ALIASES[raw] ?? raw
  const parts = expanded.split(/\s+/)
  if (parts.length !== 5) throw new Error(`cron expression needs 5 fields (got ${parts.length}): "${raw}"`)
  const [minute, hour, dom, month, dow] = parts
  const domRestricted = dom !== '*'
  const dowRestricted = dow !== '*'
  return {
    minute: parseField(minute, 0),
    hour:   parseField(hour, 1),
    dom:    parseField(dom, 2),
    month:  parseField(month, 3),
    dow:    parseField(dow, 4),
    domDowBothRestricted: domRestricted && dowRestricted,
    source: raw,
  }
}

/** True if `date` falls on a tick of this cron schedule. */
export function matchesCron(fields: CronFields, date: Date): boolean {
  if (!fields.minute.has(date.getMinutes())) return false
  if (!fields.hour.has(date.getHours())) return false
  if (!fields.month.has(date.getMonth() + 1)) return false

  const domOk = fields.dom.has(date.getDate())
  const dowOk = fields.dow.has(date.getDay())
  // Vixie-cron quirk: when both are restricted, match if EITHER matches.
  if (fields.domDowBothRestricted) return domOk || dowOk
  return domOk && dowOk
}

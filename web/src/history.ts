// Fresh starts and the journal. A slip closes the current run as an attempt
// and starts a new one; nothing earlier is lost. Streaks and the clean-day
// heatmap are worked out from the attempts plus the current run, on the
// counter's own calendar (see counter.ts for the DST-safe date math).

import {
  addCalendar,
  type Attempt,
  type Counter,
  elapsed,
  milestoneProgress,
  tidy,
  wallTime,
  zonedInstant,
} from './counter'

const DAY = 24 * 3_600_000

/** The longest a journal note can be: one line. */
export const NOTE_MAX = 140

/** Days after a slip, and days to the next milestone, that count as a hard day. */
export const HARD_DAY_WINDOW = 7 * DAY

/** Record a slip at `at`: the current run becomes a past attempt and a new run starts. */
export function slip(counter: Counter, at: number): Counter {
  const end = Math.max(at, counter.startedAt)
  const attempts = [...(counter.attempts ?? [])]
  if (end > counter.startedAt) attempts.push({ start: counter.startedAt, end })
  return tidy({ ...counter, startedAt: end, attempts })
}

/** Every run, oldest first, with the current one ending at `now`. */
export function runs(counter: Counter, now: number): Attempt[] {
  return [...(counter.attempts ?? []), { start: counter.startedAt, end: Math.max(now, counter.startedAt) }]
}

export interface Streak extends Attempt {
  /** Whole calendar days in the run. */
  days: number
  current: boolean
}

/** The longest run so far, the current one included. Ties go to the earlier run. */
export function longestStreak(counter: Counter, now: number): Streak {
  const all = runs(counter, now)
  let best = 0
  for (let i = 1; i < all.length; i++) {
    if (all[i].end - all[i].start > all[best].end - all[best].start) best = i
  }
  const r = all[best]
  return { ...r, days: elapsed(r.start, r.end, counter.tz).days, current: best === all.length - 1 }
}

/** Past attempts, most recent first, with their length in calendar days. */
export function pastAttempts(counter: Counter): (Attempt & { days: number })[] {
  return (counter.attempts ?? [])
    .map((a) => ({ ...a, days: elapsed(a.start, a.end, counter.tz).days }))
    .reverse()
}

/** The calendar date at `ms` in `tz`, as "YYYY-MM-DD". */
export function dateKey(ms: number, tz: string): string {
  const w = wallTime(ms, tz)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${String(w.year).padStart(4, '0')}-${p(w.month)}-${p(w.day)}`
}

/** The instants a calendar date begins and ends in `tz` (23 or 25 hours apart on DST days). */
export function dayBounds(key: string, tz: string): { start: number; end: number } {
  const [year, month, day] = key.split('-').map(Number)
  const start = zonedInstant({ year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 }, tz)
  return { start, end: addCalendar(start, { days: 1 }, tz) }
}

/**
 * - `clean`: inside a run from midnight to midnight
 * - `partial`: clean for part of the day (the day you started, or today so far)
 * - `slip`: a run ended that day
 * - `none`: before the first run
 * - `future`: hasn't happened yet
 */
export type DayStatus = 'clean' | 'partial' | 'slip' | 'none' | 'future'

export interface HeatmapDay {
  key: string
  status: DayStatus
}

/**
 * The status of each of the `count` calendar days ending today (oldest
 * first), padded at the start so the first day is a Monday and the grid
 * lines up in weeks.
 */
export function heatmap(counter: Counter, now: number, count = 7 * 18): HeatmapDay[] {
  const tz = counter.tz
  const all = runs(counter, now)
  const slips = counter.attempts ?? []
  const today = dayBounds(dateKey(now, tz), tz).start
  let first = addCalendar(today, { days: -(count - 1) }, tz)
  // Weeks start on Monday: step back to the Monday on or before the first day.
  const w = wallTime(first, tz)
  const weekday = (new Date(Date.UTC(w.year, w.month - 1, w.day)).getUTCDay() + 6) % 7
  first = addCalendar(first, { days: -weekday }, tz)

  const days: HeatmapDay[] = []
  for (let start = first; start <= today; ) {
    const end = addCalendar(start, { days: 1 }, tz)
    const key = dateKey(start, tz)
    let status: DayStatus
    if (start > now) status = 'future'
    else if (slips.some((a) => a.end >= start && a.end < end)) status = 'slip'
    else {
      const covered = all.reduce((sum, r) => sum + Math.max(0, Math.min(r.end, end) - Math.max(r.start, start)), 0)
      status = covered >= end - start ? 'clean' : covered > 0 ? 'partial' : 'none'
    }
    days.push({ key, status })
    start = end
  }
  return days
}

/** Set or clear (when blank) the note for a calendar date. */
export function setNote(counter: Counter, key: string, text: string): Counter {
  const journal = { ...(counter.journal ?? {}) }
  const note = text.replace(/\s+/g, ' ').trim().slice(0, NOTE_MAX)
  if (note) journal[key] = note
  else delete journal[key]
  return tidy({ ...counter, journal })
}

/** Journal notes, most recent date first. */
export function notes(counter: Counter): { key: string; text: string }[] {
  return Object.entries(counter.journal ?? {})
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([key, text]) => ({ key, text }))
}

export function setWhy(counter: Counter, why: string): Counter {
  return tidy({ ...counter, why })
}

/**
 * Whether today is a hard day for this counter, and why: within a week of a
 * slip, or with the next milestone a week or more away. Null otherwise.
 */
export function hardDay(counter: Counter, now: number): 'slip' | 'far' | null {
  const last = counter.attempts?.at(-1)
  if (last && now - last.end < HARD_DAY_WINDOW) return 'slip'
  const { next } = milestoneProgress(counter.startedAt, now, counter.tz)
  return next.at - now >= HARD_DAY_WINDOW ? 'far' : null
}

// The quit-counter engine: pure time arithmetic plus localStorage persistence.
//
// A counter stores the instant it started (epoch ms) and the IANA time zone it
// was started in. Days, months and years are counted on that zone's wall
// clock, so "one day clear" lands at the same clock time the next day even
// when a DST change makes that day 23 or 25 hours long. Hours, minutes and
// seconds are real elapsed time. Keeping the zone with the counter means its
// milestones don't move if the device later changes zone.

export type CounterKind = 'alcohol' | 'smoking' | 'vaping' | 'sugar' | 'custom'

export const KINDS: { kind: CounterKind; label: string }[] = [
  { kind: 'alcohol', label: 'Alcohol' },
  { kind: 'smoking', label: 'Smoking' },
  { kind: 'vaping', label: 'Vaping' },
  { kind: 'sugar', label: 'Sugar' },
  { kind: 'custom', label: 'Something else' },
]

export interface Counter {
  id: string
  name: string
  kind: CounterKind
  /** The instant the counter started, in epoch milliseconds. */
  startedAt: number
  /** IANA time zone the counter counts calendar days in, e.g. "Europe/London". */
  tz: string
  /** Optional daily cost as the user typed it, symbol included, e.g. "$12.50" or "4,20 €". */
  costPerDay?: string
  /** Optional daily time spent on the habit as typed, e.g. "30 min" or "1h 30m". */
  timePerDay?: string
  /** Earlier runs that ended in a slip, oldest first. The current run starts at `startedAt`. */
  attempts?: Attempt[]
  /** Optional "Why I quit", shown as a reminder on hard days. */
  why?: string
  /** One-line notes keyed by calendar date ("YYYY-MM-DD") in the counter's zone. */
  journal?: Record<string, string>
}

export interface Attempt {
  start: number
  end: number
}

export interface WallTime {
  year: number
  /** 1–12 */
  month: number
  day: number
  hour: number
  minute: number
  second: number
  millisecond: number
}

const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

const formatters = new Map<string, Intl.DateTimeFormat>()

function formatter(tz: string): Intl.DateTimeFormat {
  let f = formatters.get(tz)
  if (!f) {
    f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hourCycle: 'h23',
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      second: 'numeric',
    })
    formatters.set(tz, f)
  }
  return f
}

/** The device's current IANA time zone. */
export function deviceTimeZone(): string {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
}

export function isValidTimeZone(tz: string): boolean {
  try {
    formatter(tz)
    return true
  } catch {
    return false
  }
}

/** The wall-clock time in `tz` at instant `ms`. */
export function wallTime(ms: number, tz: string): WallTime {
  const parts: Record<string, number> = {}
  for (const p of formatter(tz).formatToParts(ms)) {
    if (p.type !== 'literal') parts[p.type] = Number(p.value)
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour,
    minute: parts.minute,
    second: parts.second,
    millisecond: ((ms % 1000) + 1000) % 1000,
  }
}

/** The zone's offset from UTC at instant `ms`, in ms (e.g. +3 600 000 for UTC+1). */
export function zoneOffset(ms: number, tz: string): number {
  const w = wallTime(ms, tz)
  const asUtc = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.millisecond)
  return asUtc - ms
}

/**
 * The instant a wall-clock time occurs in `tz`. Fields may overflow (day 32,
 * month 13) and are normalised the way Date.UTC does. A time skipped by a DST
 * gap resolves to the same distance past the gap (02:30 on a spring-forward
 * night becomes 03:30); a repeated time in a DST overlap resolves to the
 * earlier of the two.
 */
export function zonedInstant(w: WallTime, tz: string): number {
  const local = Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second, w.millisecond)
  // Offsets either side of the target cover any transition near it.
  const before = zoneOffset(local - DAY, tz)
  const after = zoneOffset(local + DAY, tz)
  const candidates = [local - before, local - after].filter((t) => zoneOffset(t, tz) === local - t)
  if (candidates.length > 0) return Math.min(...candidates)
  // In a gap: apply the offset from before the transition, which lands past it.
  return local - before
}

const daysInMonth = (year: number, month: number) => new Date(Date.UTC(year, month, 0)).getUTCDate()

export interface CalendarStep {
  years?: number
  months?: number
  days?: number
}

/**
 * Add calendar years, months and days to an instant on `tz`'s wall clock,
 * keeping the clock time. Month and year steps clamp to the end of a shorter
 * month (31 Jan + 1 month = 28/29 Feb).
 */
export function addCalendar(ms: number, step: CalendarStep, tz: string): number {
  const w = wallTime(ms, tz)
  const totalMonths = w.year * 12 + (w.month - 1) + (step.years ?? 0) * 12 + (step.months ?? 0)
  const year = Math.floor(totalMonths / 12)
  const month = (totalMonths % 12) + 1
  const day = Math.min(w.day, daysInMonth(year, month)) + (step.days ?? 0)
  return zonedInstant({ ...w, year, month, day }, tz)
}

export interface Elapsed {
  /** Whole calendar days on the counter's wall clock. */
  days: number
  hours: number
  minutes: number
  seconds: number
  /** Real elapsed milliseconds. */
  totalMs: number
}

/** Time from `start` to `now`, as calendar days in `tz` plus a real-time remainder. */
export function elapsed(start: number, now: number, tz: string): Elapsed {
  if (now <= start) return { days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 }
  // Estimate from real time, then correct for days that were 23 or 25 hours long.
  let days = Math.floor((now - start) / DAY)
  while (days > 0 && addCalendar(start, { days }, tz) > now) days--
  while (addCalendar(start, { days: days + 1 }, tz) <= now) days++
  const rest = now - addCalendar(start, { days }, tz)
  return {
    days,
    hours: Math.floor(rest / HOUR),
    minutes: Math.floor((rest % HOUR) / MINUTE),
    seconds: Math.floor((rest % MINUTE) / 1000),
    totalMs: now - start,
  }
}

/**
 * Calendar days from `start` to `now` in `tz`, with the current day as a
 * fraction of its real length (so a 23-hour DST day still counts as one).
 */
export function elapsedDays(start: number, now: number, tz: string): number {
  const { days } = elapsed(start, now, tz)
  if (now <= start) return 0
  const from = addCalendar(start, { days }, tz)
  const to = addCalendar(start, { days: days + 1 }, tz)
  return days + (now - from) / (to - from)
}

export interface Milestone {
  id: string
  label: string
  step: CalendarStep
}

/** The fixed early milestones; yearly ones follow indefinitely after these. */
export const MILESTONES: Milestone[] = [
  { id: '1d', label: '1 day', step: { days: 1 } },
  { id: '3d', label: '3 days', step: { days: 3 } },
  { id: '1w', label: '1 week', step: { days: 7 } },
  { id: '2w', label: '2 weeks', step: { days: 14 } },
  { id: '1m', label: '1 month', step: { months: 1 } },
  { id: '3m', label: '3 months', step: { months: 3 } },
  { id: '6m', label: '6 months', step: { months: 6 } },
  { id: '1y', label: '1 year', step: { years: 1 } },
]

/** The nth milestone (0-based): the fixed list, then 2 years, 3 years, … */
export function milestone(index: number): Milestone {
  if (index < MILESTONES.length) return MILESTONES[index]
  const years = index - MILESTONES.length + 2
  return { id: `${years}y`, label: `${years} years`, step: { years } }
}

export interface MilestoneProgress {
  /** The last milestone reached, or null before the first. */
  reached: (Milestone & { at: number }) | null
  next: Milestone & { at: number }
  /** 0–1 progress from the last milestone (or the start) to the next. */
  progress: number
  /** How many milestones have been reached. */
  count: number
}

export function milestoneProgress(start: number, now: number, tz: string): MilestoneProgress {
  let reached: MilestoneProgress['reached'] = null
  let index = 0
  for (;;) {
    const m = milestone(index)
    const at = addCalendar(start, m.step, tz)
    if (at > now) {
      const from = reached ? reached.at : start
      const progress = now <= from ? 0 : (now - from) / (at - from)
      return { reached, next: { ...m, at }, progress, count: index }
    }
    reached = { ...m, at }
    index++
  }
}

// --- Persistence ---------------------------------------------------------

export const STORAGE_KEY = 'clearday:counters:v1'

function isCounter(value: unknown): value is Counter {
  if (typeof value !== 'object' || value === null) return false
  const c = value as Record<string, unknown>
  return (
    typeof c.id === 'string' &&
    typeof c.name === 'string' &&
    KINDS.some((k) => k.kind === c.kind) &&
    typeof c.startedAt === 'number' &&
    Number.isFinite(c.startedAt) &&
    typeof c.tz === 'string' &&
    isValidTimeZone(c.tz)
  )
}

const OPTIONAL_TEXT = ['costPerDay', 'timePerDay'] as const

const DATE_KEY = /^\d{4}-\d{2}-\d{2}$/

const isAttempt = (a: unknown): a is Attempt =>
  typeof a === 'object' &&
  a !== null &&
  Number.isFinite((a as Attempt).start) &&
  Number.isFinite((a as Attempt).end) &&
  (a as Attempt).end >= (a as Attempt).start

/** Drop optional fields that are blank or malformed, so a bad value never costs the counter. */
export function tidy(c: Counter): Counter {
  const out: Counter = { ...c }
  for (const key of [...OPTIONAL_TEXT, 'why'] as const) {
    const v: unknown = out[key]
    if (typeof v === 'string' && v.trim()) out[key] = v.trim()
    else delete out[key]
  }
  const attempts: unknown = out.attempts
  if (Array.isArray(attempts) && attempts.some(isAttempt)) {
    out.attempts = attempts.filter(isAttempt).map(({ start, end }) => ({ start, end }))
  } else delete out.attempts
  const journal: unknown = out.journal
  const notes =
    typeof journal === 'object' && journal !== null && !Array.isArray(journal)
      ? Object.entries(journal).filter(([k, v]) => DATE_KEY.test(k) && typeof v === 'string' && v.trim())
      : []
  if (notes.length > 0) out.journal = Object.fromEntries(notes.map(([k, v]) => [k, (v as string).trim()]))
  else delete out.journal
  return out
}

/** Saved counters; anything unreadable is skipped rather than lost silently on the next save. */
export function loadCounters(storage: Pick<Storage, 'getItem'> = localStorage): Counter[] {
  try {
    const raw = storage.getItem(STORAGE_KEY)
    if (!raw) return []
    const data: unknown = JSON.parse(raw)
    return Array.isArray(data) ? data.filter(isCounter).map(tidy) : []
  } catch {
    return []
  }
}

export function saveCounters(counters: Counter[], storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(counters))
}

export function newCounter(
  kind: CounterKind,
  name: string,
  startedAt: number,
  tz = deviceTimeZone(),
  savings: Pick<Counter, 'costPerDay' | 'timePerDay'> = {},
): Counter {
  const label = KINDS.find((k) => k.kind === kind)?.label ?? 'Counter'
  return tidy({
    id: crypto.randomUUID(),
    name: name.trim() || label,
    kind,
    startedAt,
    tz,
    ...savings,
  })
}

/** Set or clear a counter's optional daily cost and time. */
export function withSavings(c: Counter, savings: Pick<Counter, 'costPerDay' | 'timePerDay'>): Counter {
  return tidy({ ...c, costPerDay: savings.costPerDay, timePerDay: savings.timePerDay })
}

/** Parse an <input type="datetime-local"> value as wall-clock time in `tz`. */
export function parseLocalInput(value: string, tz: string): number | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (!m) return null
  const [year, month, day, hour, minute, second] = m.slice(1).map((v) => Number(v ?? 0))
  return zonedInstant({ year, month, day, hour, minute, second, millisecond: 0 }, tz)
}

/** Format an instant as an <input type="datetime-local"> value in `tz`. */
export function toLocalInput(ms: number, tz: string): string {
  const w = wallTime(ms, tz)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${w.year}-${p(w.month)}-${p(w.day)}T${p(w.hour)}:${p(w.minute)}`
}

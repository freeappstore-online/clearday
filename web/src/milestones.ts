// Milestone celebrations: which milestones each counter has already been
// celebrated for, and which one (if any) is due on this visit. The schedule
// itself lives with the counter engine (counter.ts); this module re-exports it.

import { type Counter, type Milestone, milestoneProgress } from './counter'

export { MILESTONES, milestone, type Milestone } from './counter'

export const CELEBRATED_KEY = 'clearday:celebrated:v1'

/**
 * Per counter id, how many milestones have been celebrated. Milestones are
 * reached in order, so a count covers them all, including the endless yearly ones.
 */
export type Celebrated = Record<string, number>

export interface Celebration {
  counterId: string
  counterName: string
  milestone: Milestone
  /** The counter's milestone count at the time, to record once shown. */
  count: number
}

export function loadCelebrated(storage: Pick<Storage, 'getItem'> = localStorage): Celebrated {
  try {
    return parseCelebrated(JSON.parse(storage.getItem(CELEBRATED_KEY) ?? '{}'))
  } catch {
    return {}
  }
}

/** The valid entries in parsed JSON (saved data or a backup file). */
export function parseCelebrated(data: unknown): Celebrated {
  if (typeof data !== 'object' || data === null || Array.isArray(data)) return {}
  const out: Celebrated = {}
  for (const [id, n] of Object.entries(data)) {
    if (typeof n === 'number' && Number.isInteger(n) && n >= 0) out[id] = n
  }
  return out
}

export function saveCelebrated(celebrated: Celebrated, storage: Pick<Storage, 'setItem'> = localStorage): void {
  storage.setItem(CELEBRATED_KEY, JSON.stringify(celebrated))
}

/**
 * The first counter with a milestone not yet celebrated. If several were
 * crossed while the app was closed, only the latest is celebrated; the
 * earlier ones are covered by it.
 */
export function pendingCelebration(counters: Counter[], celebrated: Celebrated, now: number): Celebration | null {
  for (const c of counters) {
    const { reached, count } = milestoneProgress(c.startedAt, now, c.tz)
    if (reached && count > (celebrated[c.id] ?? 0)) {
      return { counterId: c.id, counterName: c.name, milestone: reached, count }
    }
  }
  return null
}

export function markCelebrated(celebrated: Celebrated, counterId: string, count: number): Celebrated {
  return { ...celebrated, [counterId]: Math.max(count, celebrated[counterId] ?? 0) }
}

/** Start over after a slip: the new run's milestones are due again. */
export function resetCelebrated(celebrated: Celebrated, counterId: string): Celebrated {
  return { ...celebrated, [counterId]: 0 }
}

/** Drop entries for counters that no longer exist. */
export function pruneCelebrated(celebrated: Celebrated, counters: Counter[]): Celebrated {
  const ids = new Set(counters.map((c) => c.id))
  return Object.fromEntries(Object.entries(celebrated).filter(([id]) => ids.has(id)))
}

const NOTES = [
  'Take a moment to notice how far you have come.',
  'One clear day at a time, and here you are.',
  'That took steady effort. Well done.',
  'Something worth marking. Be proud of this.',
]

/** Kind, plain words for a milestone. No claims about health or the body. */
export function celebrationMessage(milestone: Milestone, counterName: string): { title: string; body: string } {
  const note = NOTES[[...milestone.id].reduce((n, ch) => n + ch.charCodeAt(0), 0) % NOTES.length]
  return {
    title: `You've reached ${milestone.label}!`,
    body: `${counterName}: ${milestone.label} clear. ${note}`,
  }
}

import { describe, expect, it } from 'vitest'
import { type Counter, elapsed, loadCounters, saveCounters, STORAGE_KEY } from './counter'
import {
  dateKey,
  dayBounds,
  hardDay,
  heatmap,
  longestStreak,
  NOTE_MAX,
  notes,
  pastAttempts,
  runs,
  setNote,
  setWhy,
  slip,
} from './history'
import { loadCelebrated, markCelebrated, pendingCelebration, resetCelebrated, saveCelebrated } from './milestones'
import { savingsTotals } from './savings'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const t = (iso: string) => Date.parse(iso)

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

const counter = (extra: Partial<Counter> = {}): Counter => ({
  id: 'a',
  name: 'Alcohol',
  kind: 'alcohol',
  startedAt: t('2026-06-01T20:00:00Z'),
  tz: 'UTC',
  ...extra,
})

describe('slip', () => {
  it('restarts the counter and keeps the run as an attempt', () => {
    const c = counter()
    const at = c.startedAt + 10 * DAY + 3 * HOUR
    const after = slip(c, at)
    expect(after.startedAt).toBe(at)
    expect(after.attempts).toEqual([{ start: c.startedAt, end: at }])
    expect(elapsed(after.startedAt, at + HOUR, after.tz)).toMatchObject({ days: 0, hours: 1 })
    // Everything else is untouched.
    expect(after).toMatchObject({ id: 'a', name: 'Alcohol', kind: 'alcohol', tz: 'UTC' })
  })

  it('keeps every earlier attempt across several slips', () => {
    let c = counter()
    const s1 = c.startedAt + 20 * DAY
    const s2 = s1 + 3 * DAY
    const s3 = s2 + 45 * DAY
    c = slip(slip(slip(c, s1), s2), s3)
    expect(c.attempts).toEqual([
      { start: t('2026-06-01T20:00:00Z'), end: s1 },
      { start: s1, end: s2 },
      { start: s2, end: s3 },
    ])
    expect(pastAttempts(c).map((a) => a.days)).toEqual([45, 3, 20])
  })

  it('keeps savings, journal and "why" across a slip, with savings counting the new run', () => {
    const c = setNote(setWhy(counter({ costPerDay: '$10' }), 'For my kids'), '2026-06-03', 'Long walk')
    const at = c.startedAt + 5 * DAY
    const after = slip(c, at)
    expect(after.why).toBe('For my kids')
    expect(after.journal).toEqual({ '2026-06-03': 'Long walk' })
    expect(savingsTotals(after, at + DAY).money).toBe('$10.00')
  })

  it('does not record an empty attempt if slipping again straight away', () => {
    const c = slip(counter(), t('2026-06-05T00:00:00Z'))
    expect(slip(c, c.startedAt).attempts).toHaveLength(1)
    expect(slip(c, c.startedAt - HOUR)).toEqual(c)
  })
})

describe('longestStreak', () => {
  it('is the current run when there are no slips', () => {
    const c = counter()
    expect(longestStreak(c, c.startedAt + 4 * DAY + HOUR)).toMatchObject({ days: 4, current: true })
  })

  it('is preserved across a relapse', () => {
    const c = counter()
    const after = slip(c, c.startedAt + 30 * DAY)
    const now = after.startedAt + 2 * DAY
    expect(longestStreak(after, now)).toMatchObject({ days: 30, current: false, start: c.startedAt })
    // Overtaken once the new run is longer.
    expect(longestStreak(after, after.startedAt + 31 * DAY)).toMatchObject({ days: 31, current: true })
  })

  it('counts calendar days in the counter zone across DST', () => {
    const tz = 'America/New_York'
    const start = t('2026-03-01T12:00:00-05:00')
    // 14 calendar days, but only 14 * 24 - 1 real hours because of spring-forward.
    const c = slip(counter({ startedAt: start, tz }), t('2026-03-15T12:00:00-04:00'))
    expect(longestStreak(c, c.startedAt + HOUR)).toMatchObject({ days: 14, current: false })
  })
})

describe('heatmap', () => {
  it('lines up in whole weeks starting on Monday and ends today', () => {
    const c = counter()
    const now = t('2026-06-17T09:00:00Z') // a Wednesday
    const grid = heatmap(c, now, 14)
    expect(grid.length % 7).toBe(3) // Mon, Tue, Wed of the last week
    expect(new Date(`${grid[0].key}T00:00:00Z`).getUTCDay()).toBe(1)
    expect(grid.at(-1)?.key).toBe('2026-06-17')
  })

  it('marks clean, partial, slip and before-start days', () => {
    const c = slip(counter(), t('2026-06-08T15:00:00Z'))
    const grid = Object.fromEntries(heatmap(c, t('2026-06-12T09:00:00Z'), 21).map((d) => [d.key, d.status]))
    expect(grid['2026-05-31']).toBe('none')
    expect(grid['2026-06-01']).toBe('partial') // started at 20:00
    expect(grid['2026-06-02']).toBe('clean')
    expect(grid['2026-06-07']).toBe('clean')
    expect(grid['2026-06-08']).toBe('slip') // covered by two runs, but a slip day
    expect(grid['2026-06-09']).toBe('clean')
    expect(grid['2026-06-12']).toBe('partial') // today, so far
  })

  it('keeps the clean days from before a relapse', () => {
    const c = counter()
    const before = heatmap(c, t('2026-06-20T12:00:00Z'), 28).filter((d) => d.status === 'clean').length
    const after = slip(c, t('2026-06-20T12:00:00Z'))
    const kept = heatmap(after, t('2026-06-20T13:00:00Z'), 28).filter((d) => d.status === 'clean').length
    expect(kept).toBe(before)
    expect(kept).toBe(18)
  })

  it('uses the counter zone calendar, including 23- and 25-hour days', () => {
    const tz = 'America/New_York'
    const c = counter({ startedAt: t('2026-02-20T09:00:00-05:00'), tz })
    const grid = Object.fromEntries(heatmap(c, t('2026-11-05T12:00:00-05:00'), 7 * 40).map((d) => [d.key, d.status]))
    expect(grid['2026-03-08']).toBe('clean') // 23 hours long
    expect(grid['2026-11-01']).toBe('clean') // 25 hours long
    expect(dayBounds('2026-03-08', tz).end - dayBounds('2026-03-08', tz).start).toBe(23 * HOUR)
    expect(dayBounds('2026-11-01', tz).end - dayBounds('2026-11-01', tz).start).toBe(25 * HOUR)
    // Same instant, different calendar dates by zone.
    const late = t('2026-06-01T23:30:00-04:00')
    expect(dateKey(late, tz)).toBe('2026-06-01')
    expect(dateKey(late, 'UTC')).toBe('2026-06-02')
  })

  it('treats days after now as future', () => {
    const c = counter()
    const grid = heatmap(c, t('2026-06-02T09:00:00Z'), 7)
    expect(grid.every((d) => d.status !== 'future')).toBe(true)
    expect(runs(c, c.startedAt - DAY)).toEqual([{ start: c.startedAt, end: c.startedAt }])
  })
})

describe('journal', () => {
  it('keeps one trimmed line per date and clears blank notes', () => {
    let c = setNote(counter(), '2026-06-02', '  Felt  good\n today  ')
    c = setNote(c, '2026-06-04', 'Busy day')
    expect(c.journal).toEqual({ '2026-06-02': 'Felt good today', '2026-06-04': 'Busy day' })
    expect(notes(c).map((n) => n.key)).toEqual(['2026-06-04', '2026-06-02'])
    c = setNote(c, '2026-06-02', '   ')
    expect(c.journal).toEqual({ '2026-06-04': 'Busy day' })
    c = setNote(c, '2026-06-04', '')
    expect('journal' in c).toBe(false)
  })

  it('limits a note to one line of NOTE_MAX characters', () => {
    const c = setNote(counter(), '2026-06-02', 'x'.repeat(NOTE_MAX + 50))
    expect(c.journal?.['2026-06-02']).toHaveLength(NOTE_MAX)
  })

  it('survives a reload, along with "why" and attempts', () => {
    const storage = new MemoryStorage()
    let c = setWhy(counter(), ' To sleep better ')
    c = setNote(c, '2026-06-02', 'First full day')
    c = slip(c, t('2026-06-10T08:00:00Z'))
    c = setNote(c, '2026-06-10', 'Starting again')
    saveCounters([c], storage)
    const [loaded] = loadCounters(storage)
    expect(loaded).toEqual(c)
    expect(loaded.why).toBe('To sleep better')
    expect(loaded.journal).toEqual({ '2026-06-02': 'First full day', '2026-06-10': 'Starting again' })
    expect(longestStreak(loaded, t('2026-06-11T08:00:00Z')).days).toBe(8)
  })

  it('loads counters saved before history existed, and drops malformed history', () => {
    const storage = new MemoryStorage()
    const base = counter()
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        base,
        {
          ...base,
          id: 'b',
          why: 42,
          attempts: [{ start: 1, end: 2 }, { start: 5, end: 3 }, 'x', { start: 'a', end: 9 }],
          journal: { '2026-06-02': 'ok', yesterday: 'bad key', '2026-06-03': 7, '2026-06-04': '  ' },
        },
        { ...base, id: 'c', attempts: 'nope', journal: ['x'] },
      ]),
    )
    expect(loadCounters(storage)).toEqual([
      base,
      { ...base, id: 'b', attempts: [{ start: 1, end: 2 }], journal: { '2026-06-02': 'ok' } },
      { ...base, id: 'c' },
    ])
  })
})

describe('hardDay', () => {
  it('is a hard day within 7 days of a slip', () => {
    const c = slip(counter(), t('2026-06-10T08:00:00Z'))
    expect(hardDay(c, t('2026-06-10T09:00:00Z'))).toBe('slip')
    expect(hardDay(c, t('2026-06-17T07:59:59Z'))).toBe('slip')
    // A week later the 1-week milestone has just passed and 2 weeks is 7 days off: still hard, but "far".
    expect(hardDay(c, t('2026-06-17T08:00:00Z'))).toBe('far')
  })

  it('is a hard day when the next milestone is 7 or more days away', () => {
    const c = counter()
    expect(hardDay(c, c.startedAt + HOUR)).toBeNull() // 1 day is close
    expect(hardDay(c, c.startedAt + 4 * DAY)).toBeNull() // 1 week is 3 days away
    expect(hardDay(c, c.startedAt + 14 * DAY)).toBe('far') // 1 month is 16 days away
    expect(hardDay(c, t('2026-07-01T20:00:00Z') - 3 * DAY)).toBeNull() // 1 month is 3 days away
  })
})

describe('milestones after a slip', () => {
  it('are celebrated again for the new run', () => {
    const storage = new MemoryStorage()
    const c = counter()
    saveCelebrated(markCelebrated({}, 'a', 4), storage)
    const after = slip(c, c.startedAt + 20 * DAY)
    saveCelebrated(resetCelebrated(loadCelebrated(storage), 'a'), storage)
    expect(pendingCelebration([after], loadCelebrated(storage), after.startedAt + HOUR)).toBeNull()
    expect(pendingCelebration([after], loadCelebrated(storage), after.startedAt + DAY)?.milestone.id).toBe('1d')
  })
})

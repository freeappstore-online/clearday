import { describe, expect, it, vi } from 'vitest'
import {
  addCalendar,
  elapsed,
  loadCounters,
  milestone,
  milestoneProgress,
  MILESTONES,
  newCounter,
  parseLocalInput,
  saveCounters,
  STORAGE_KEY,
  toLocalInput,
  wallTime,
  zonedInstant,
  zoneOffset,
  type WallTime,
} from './counter'

const HOUR = 3_600_000
const DAY = 24 * HOUR
const t = (iso: string) => Date.parse(iso)
const wall = (s: string): WallTime => {
  const [date, time = '00:00:00'] = s.split('T')
  const [year, month, day] = date.split('-').map(Number)
  const [hour, minute, second = 0] = time.split(':').map(Number)
  return { year, month, day, hour, minute, second, millisecond: 0 }
}

const ZONES = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'Europe/London',
  'Europe/Berlin',
  'Australia/Sydney',
  'Australia/Lord_Howe', // 30-minute DST shift
  'Asia/Kolkata', // +05:30, no DST
  'Asia/Kathmandu', // +05:45
  'Pacific/Chatham', // +12:45 / +13:45
  'America/Sao_Paulo',
]

class MemoryStorage {
  data = new Map<string, string>()
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
}

describe('wallTime / zonedInstant', () => {
  it('reads wall-clock time and offsets in different zones', () => {
    const ms = t('2026-07-01T12:00:00Z')
    expect(wallTime(ms, 'America/New_York')).toMatchObject({ year: 2026, month: 7, day: 1, hour: 8 })
    expect(wallTime(ms, 'Asia/Kolkata')).toMatchObject({ hour: 17, minute: 30 })
    expect(wallTime(ms, 'Pacific/Chatham')).toMatchObject({ day: 2, hour: 0, minute: 45 })
    expect(zoneOffset(ms, 'Europe/London')).toBe(1 * HOUR)
    expect(zoneOffset(t('2026-01-01T12:00:00Z'), 'Europe/London')).toBe(0)
    expect(zoneOffset(ms, 'Australia/Sydney')).toBe(10 * HOUR)
    expect(zoneOffset(t('2026-01-01T12:00:00Z'), 'Australia/Sydney')).toBe(11 * HOUR)
  })

  it.each(ZONES)('round-trips every hour of 2026 in %s', (tz) => {
    for (let ms = t('2026-01-01T00:00:00Z'); ms < t('2027-01-01T00:00:00Z'); ms += HOUR + 7 * 60_000) {
      const back = zonedInstant(wallTime(ms, tz), tz)
      if (back !== ms) {
        // Only a repeated (fall-back) wall time may differ: it resolves to the earlier instant.
        expect(back).toBeLessThan(ms)
        expect(wallTime(back, tz)).toEqual(wallTime(ms, tz))
      }
    }
  })

  it('moves a time skipped by spring-forward past the gap', () => {
    // New York: 2026-03-08 02:00 EST -> 03:00 EDT.
    expect(zonedInstant(wall('2026-03-08T02:30'), 'America/New_York')).toBe(t('2026-03-08T03:30:00-04:00'))
    // London: 2026-03-29 01:00 GMT -> 02:00 BST.
    expect(zonedInstant(wall('2026-03-29T01:30'), 'Europe/London')).toBe(t('2026-03-29T02:30:00+01:00'))
    // Sydney: 2026-10-04 02:00 AEST -> 03:00 AEDT.
    expect(zonedInstant(wall('2026-10-04T02:15'), 'Australia/Sydney')).toBe(t('2026-10-04T03:15:00+11:00'))
  })

  it('takes the earlier of a repeated fall-back time', () => {
    // New York: 2026-11-01 02:00 EDT -> 01:00 EST, so 01:30 happens twice.
    expect(zonedInstant(wall('2026-11-01T01:30'), 'America/New_York')).toBe(t('2026-11-01T01:30:00-04:00'))
    // Sydney: 2026-04-05 03:00 AEDT -> 02:00 AEST.
    expect(zonedInstant(wall('2026-04-05T02:30'), 'Australia/Sydney')).toBe(t('2026-04-05T02:30:00+11:00'))
  })
})

describe('addCalendar', () => {
  it('keeps clock time across spring-forward (a 23-hour day)', () => {
    const start = t('2026-03-07T12:00:00-05:00')
    const next = addCalendar(start, { days: 1 }, 'America/New_York')
    expect(next).toBe(t('2026-03-08T12:00:00-04:00'))
    expect(next - start).toBe(23 * HOUR)
  })

  it('keeps clock time across fall-back (a 25-hour day)', () => {
    const start = t('2026-10-31T12:00:00-04:00')
    const next = addCalendar(start, { days: 1 }, 'America/New_York')
    expect(next).toBe(t('2026-11-01T12:00:00-05:00'))
    expect(next - start).toBe(25 * HOUR)
  })

  it('handles southern-hemisphere and half-hour DST', () => {
    const sydney = t('2026-04-04T12:00:00+11:00')
    expect(addCalendar(sydney, { days: 1 }, 'Australia/Sydney') - sydney).toBe(25 * HOUR)
    const lordHowe = t('2026-04-04T12:00:00+11:00')
    expect(addCalendar(lordHowe, { days: 1 }, 'Australia/Lord_Howe') - lordHowe).toBe(24.5 * HOUR)
  })

  it('is exactly 24 hours per day in zones without DST', () => {
    for (const tz of ['UTC', 'Asia/Kolkata', 'Asia/Kathmandu']) {
      const start = t('2026-03-07T12:00:00Z')
      expect(addCalendar(start, { days: 30 }, tz) - start).toBe(30 * DAY)
    }
  })

  it('clamps months and years to the end of shorter months', () => {
    const tz = 'Europe/Berlin'
    const jan31 = zonedInstant(wall('2026-01-31T09:00'), tz)
    expect(wallTime(addCalendar(jan31, { months: 1 }, tz), tz)).toMatchObject({ month: 2, day: 28, hour: 9 })
    const leap = zonedInstant(wall('2028-01-31T09:00'), tz)
    expect(wallTime(addCalendar(leap, { months: 1 }, tz), tz)).toMatchObject({ month: 2, day: 29 })
    const feb29 = zonedInstant(wall('2028-02-29T09:00'), tz)
    expect(wallTime(addCalendar(feb29, { years: 1 }, tz), tz)).toMatchObject({ year: 2029, month: 2, day: 28 })
    const aug31 = zonedInstant(wall('2026-08-31T09:00'), tz)
    expect(wallTime(addCalendar(aug31, { months: 6 }, tz), tz)).toMatchObject({ year: 2027, month: 2, day: 28 })
  })

  it('keeps clock time for a month that spans a DST change', () => {
    const tz = 'America/New_York'
    const start = t('2026-02-15T09:00:00-05:00')
    const next = addCalendar(start, { months: 1 }, tz)
    expect(next).toBe(t('2026-03-15T09:00:00-04:00'))
    expect(next - start).toBe(28 * DAY - HOUR)
  })

  it('lands past the gap when the target clock time does not exist', () => {
    // Started at 02:30 the day before New York springs forward.
    const start = t('2026-03-07T02:30:00-05:00')
    expect(addCalendar(start, { days: 1 }, 'America/New_York')).toBe(t('2026-03-08T03:30:00-04:00'))
    expect(addCalendar(start, { days: 2 }, 'America/New_York')).toBe(t('2026-03-09T02:30:00-04:00'))
  })
})

describe('elapsed', () => {
  const tz = 'America/New_York'

  it('breaks time into days, hours, minutes and seconds', () => {
    const start = t('2026-06-01T08:00:00-04:00')
    expect(elapsed(start, start + 3 * DAY + 4 * HOUR + 5 * 60_000 + 6_000, tz)).toEqual({
      days: 3,
      hours: 4,
      minutes: 5,
      seconds: 6,
      totalMs: 3 * DAY + 4 * HOUR + 5 * 60_000 + 6_000,
    })
  })

  it('counts a full day at the same clock time after spring-forward', () => {
    const start = t('2026-03-07T12:00:00-05:00')
    expect(elapsed(start, t('2026-03-08T12:00:00-04:00'), tz)).toMatchObject({ days: 1, hours: 0, minutes: 0 })
    expect(elapsed(start, t('2026-03-08T11:59:59-04:00'), tz)).toMatchObject({
      days: 0,
      hours: 22,
      minutes: 59,
      seconds: 59,
    })
  })

  it('does not count a day early after fall-back', () => {
    const start = t('2026-10-31T12:00:00-04:00')
    // 24 real hours later the clock reads 11:00, so the day isn't complete yet.
    expect(elapsed(start, start + DAY, tz)).toMatchObject({ days: 0, hours: 24 })
    expect(elapsed(start, t('2026-11-01T12:00:00-05:00'), tz)).toMatchObject({ days: 1, hours: 0 })
  })

  it('counts calendar days over a long span that crosses many DST changes', () => {
    const start = t('2020-01-15T07:30:00-05:00')
    const now = t('2026-07-15T07:30:00-04:00')
    const days = Math.round((Date.UTC(2026, 6, 15) - Date.UTC(2020, 0, 15)) / DAY)
    expect(elapsed(start, now, tz)).toMatchObject({ days, hours: 0, minutes: 0, seconds: 0 })
  })

  it('counts days on the counter zone wall clock, not UTC', () => {
    // 23:30 in Kolkata, then 00:30 two days later there: one full day and one hour.
    const start = t('2026-05-10T23:30:00+05:30')
    const now = t('2026-05-12T00:30:00+05:30')
    expect(elapsed(start, now, 'Asia/Kolkata')).toMatchObject({ days: 1, hours: 1, minutes: 0 })
  })

  it('gives the same answer for the same instants regardless of zone when no DST intervenes', () => {
    const start = t('2026-06-01T00:00:00Z')
    const now = start + 10 * DAY + 3 * HOUR
    for (const tz of ZONES) expect(elapsed(start, now, tz)).toMatchObject({ days: 10, hours: 3 })
  })

  it('does not depend on the device time zone', () => {
    const start = t('2026-03-07T12:00:00-05:00')
    const now = t('2026-03-20T18:45:10-04:00')
    const before = elapsed(start, now, tz)
    try {
      for (const deviceTz of ['Pacific/Kiritimati', 'Pacific/Pago_Pago', 'Europe/London']) {
        vi.stubEnv('TZ', deviceTz)
        expect(elapsed(start, now, tz)).toEqual(before)
      }
    } finally {
      vi.unstubAllEnvs()
    }
    expect(before).toMatchObject({ days: 13, hours: 6, minutes: 45, seconds: 10 })
  })

  it('is zero for a start time in the future', () => {
    const now = t('2026-06-01T00:00:00Z')
    expect(elapsed(now + HOUR, now, tz)).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, totalMs: 0 })
  })
})

describe('milestones', () => {
  const tz = 'Europe/London'
  const start = t('2026-01-31T21:00:00Z')

  it('follows the 1d, 3d, 1w, 2w, 1m, 3m, 6m, 1y schedule, then yearly', () => {
    expect(MILESTONES.map((m) => m.id)).toEqual(['1d', '3d', '1w', '2w', '1m', '3m', '6m', '1y'])
    expect(milestone(8)).toMatchObject({ id: '2y', label: '2 years', step: { years: 2 } })
    expect(milestone(17)).toMatchObject({ id: '11y', label: '11 years' })
  })

  it('starts with the first day ahead and no progress', () => {
    const p = milestoneProgress(start, start, tz)
    expect(p).toMatchObject({ reached: null, count: 0, progress: 0 })
    expect(p.next).toMatchObject({ id: '1d', at: start + DAY })
  })

  it('reports progress toward the next milestone from the last one', () => {
    const p = milestoneProgress(start, start + 5 * DAY, tz)
    expect(p.reached).toMatchObject({ id: '3d', at: start + 3 * DAY })
    expect(p.next).toMatchObject({ id: '1w', at: start + 7 * DAY })
    expect(p.progress).toBeCloseTo(0.5)
    expect(p.count).toBe(2)
  })

  it('reaches a milestone exactly at its moment', () => {
    const p = milestoneProgress(start, start + 14 * DAY, tz)
    expect(p.reached?.id).toBe('2w')
    expect(p.next.id).toBe('1m')
  })

  it('places month milestones on the calendar, clamped and DST-aware', () => {
    const p = milestoneProgress(start, start + 20 * DAY, tz)
    // 31 Jan 21:00 GMT + 1 month = 28 Feb 21:00 GMT.
    expect(p.next).toMatchObject({ id: '1m', at: t('2026-02-28T21:00:00Z') })
    // + 3 months = 30 Apr 21:00 BST.
    const later = milestoneProgress(start, t('2026-03-15T00:00:00Z'), tz)
    expect(later.next).toMatchObject({ id: '3m', at: t('2026-04-30T21:00:00+01:00') })
  })

  it('a 1-day milestone across spring-forward arrives after 23 hours', () => {
    const ny = t('2026-03-07T12:00:00-05:00')
    expect(milestoneProgress(ny, ny + 23 * HOUR, 'America/New_York').reached?.id).toBe('1d')
    expect(milestoneProgress(ny, ny + 23 * HOUR - 1, 'America/New_York').reached).toBeNull()
  })

  it('keeps going beyond the first year', () => {
    const p = milestoneProgress(start, t('2029-06-01T00:00:00Z'), tz)
    expect(p.reached?.id).toBe('3y')
    expect(p.next).toMatchObject({ id: '4y', at: t('2030-01-31T21:00:00Z') })
    expect(p.progress).toBeGreaterThan(0)
    expect(p.progress).toBeLessThan(1)
  })
})

describe('persistence', () => {
  it('survives a reload with the correct elapsed time', () => {
    const storage = new MemoryStorage()
    const startedAt = t('2026-03-01T09:00:00-05:00')
    const counter = newCounter('smoking', '', startedAt, 'America/New_York')
    saveCounters([counter], storage)

    // A later "page load" reads it back and keeps counting from the stored instant and zone.
    const [loaded] = loadCounters(storage)
    expect(loaded).toEqual(counter)
    expect(loaded.name).toBe('Smoking')
    expect(elapsed(loaded.startedAt, t('2026-03-15T10:30:00-04:00'), loaded.tz)).toMatchObject({
      days: 14,
      hours: 1,
      minutes: 30,
    })
  })

  it('keeps the counter zone when the device moves to another zone', () => {
    const counter = newCounter('alcohol', 'Wine', t('2026-03-07T12:00:00-05:00'), 'America/New_York')
    // Read in Tokyo on 8 March: still a New York day, so one day clear at 12:00 New York time.
    const now = t('2026-03-08T12:00:00-04:00')
    expect(elapsed(counter.startedAt, now, counter.tz)).toMatchObject({ days: 1, hours: 0 })
    expect(elapsed(counter.startedAt, now, 'Asia/Tokyo')).toMatchObject({ days: 0, hours: 23 })
  })

  it('stores under a versioned key and skips invalid entries', () => {
    const storage = new MemoryStorage()
    const good = newCounter('custom', '  Late-night snacks ', t('2026-01-01T00:00:00Z'), 'UTC')
    expect(good.name).toBe('Late-night snacks')
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([good, { id: 'x' }, { ...good, id: 'b', tz: 'Not/AZone' }, { ...good, id: 'c', kind: 'nope' }, null]),
    )
    expect(loadCounters(storage)).toEqual([good])
  })

  it('returns nothing for missing or corrupt data', () => {
    const storage = new MemoryStorage()
    expect(loadCounters(storage)).toEqual([])
    storage.setItem(STORAGE_KEY, '{not json')
    expect(loadCounters(storage)).toEqual([])
    storage.setItem(STORAGE_KEY, '{"a":1}')
    expect(loadCounters(storage)).toEqual([])
  })
})

describe('datetime-local input', () => {
  it('round-trips in the given zone', () => {
    for (const tz of ZONES) {
      const ms = parseLocalInput('2026-07-04T18:45', tz)!
      expect(toLocalInput(ms, tz)).toBe('2026-07-04T18:45')
    }
    expect(parseLocalInput('2026-07-04T18:45', 'Asia/Kolkata')).toBe(t('2026-07-04T18:45:00+05:30'))
  })

  it('resolves a skipped time past the gap and rejects junk', () => {
    expect(parseLocalInput('2026-03-08T02:30', 'America/New_York')).toBe(t('2026-03-08T03:30:00-04:00'))
    expect(parseLocalInput('', 'UTC')).toBeNull()
    expect(parseLocalInput('yesterday', 'UTC')).toBeNull()
  })
})

import { describe, expect, it } from 'vitest'
import { type Counter, elapsedDays, loadCounters, newCounter, saveCounters, STORAGE_KEY, withSavings } from './counter'
import { formatDuration, formatMoney, parseDuration, parseMoney, savingsTotals } from './savings'

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
  id: 'c1',
  name: 'Smoking',
  kind: 'smoking',
  startedAt: t('2026-06-01T08:00:00Z'),
  tz: 'UTC',
  ...extra,
})

describe('parseMoney', () => {
  it.each([
    ['$12.50', 12.5, '$', '', false],
    ['$5', 5, '$', '', false],
    ['4,50 €', 4.5, '', ' €', true],
    ['€4,50', 4.5, '€', '', true],
    ['£1,200', 1200, '£', '', false],
    ['1.200,75 €', 1200.75, '', ' €', true],
    ['1,200.75', 1200.75, '', '', false],
    ['300 kr', 300, '', ' kr', false],
    ['CHF 7.20', 7.2, 'CHF ', '', false],
    ['  ¥500  ', 500, '¥', '', false],
    ["1'000.50 CHF", 1000.5, '', ' CHF', false],
  ])('reads %j', (input, amount, prefix, suffix, decimalComma) => {
    expect(parseMoney(input)).toEqual({ amount, prefix, suffix, decimalComma })
  })

  it.each(['', 'free', '$', '-5', '$-5', '5 for 2'])('rejects %j', (input) => {
    expect(parseMoney(input)).toBeNull()
  })

  it('formats totals in the same style as the input', () => {
    expect(formatMoney(1234.5, parseMoney('$12.50')!)).toBe('$1,234.50')
    expect(formatMoney(1234.5, parseMoney('4,50 €')!)).toBe('1.234,50 €')
    expect(formatMoney(31.5, parseMoney('300 kr')!)).toBe('31.50 kr')
  })
})

describe('parseDuration', () => {
  it.each([
    ['30 min', 30],
    ['30m', 30],
    ['45 minutes', 45],
    ['90', 90],
    ['2 hours', 120],
    ['2h', 120],
    ['1 hr', 60],
    ['1.5 h', 90],
    ['1,5 hours', 90],
    ['1h 30m', 90],
    ['1h30', 90],
    ['1 hour and 15 minutes', 75],
    ['1h, 10m', 70],
    ['1:30', 90],
    ['24h', 1440],
    ['0 min', 0],
  ])('reads %j as %d minutes', (input, minutes) => {
    expect(parseDuration(input)).toBe(minutes)
  })

  it.each(['', 'a while', '3 months', '25 hours', '1:75', 'h'])('rejects %j', (input) => {
    expect(parseDuration(input)).toBeNull()
  })

  it('formats totals', () => {
    expect(formatDuration(0)).toBe('0 min')
    expect(formatDuration(45.9)).toBe('45 min')
    expect(formatDuration(90)).toBe('1 h 30 min')
    expect(formatDuration(24 * 60)).toBe('1 day 0 min')
    expect(formatDuration(3 * 24 * 60 + 125)).toBe('3 days 2 h 5 min')
  })
})

describe('savingsTotals', () => {
  it('multiplies the daily amounts by days elapsed', () => {
    const c = counter({ costPerDay: '$12.50', timePerDay: '30 min' })
    expect(savingsTotals(c, c.startedAt + 10 * DAY)).toEqual({ money: '$125.00', time: '5 h 0 min' })
    expect(savingsTotals(c, c.startedAt + 365 * DAY)).toEqual({ money: '$4,562.50', time: '7 days 14 h 30 min' })
  })

  it('counts the part of today too, so totals move live', () => {
    const c = counter({ costPerDay: '€10', timePerDay: '2h' })
    expect(savingsTotals(c, c.startedAt + 12 * HOUR)).toEqual({ money: '€5.00', time: '1 h 0 min' })
    const a = savingsTotals(c, c.startedAt + DAY + HOUR)
    const b = savingsTotals(c, c.startedAt + DAY + 2 * HOUR)
    expect(a.money).not.toBe(b.money)
    expect(b).toEqual({ money: '€10.83', time: '2 h 10 min' })
  })

  it('is zero at the start and before it', () => {
    const c = counter({ costPerDay: '$5', timePerDay: '1h' })
    expect(savingsTotals(c, c.startedAt)).toEqual({ money: '$0.00', time: '0 min' })
    expect(savingsTotals(c, c.startedAt - DAY)).toEqual({ money: '$0.00', time: '0 min' })
  })

  it('counts a 23-hour DST day as a whole day', () => {
    const c = counter({ startedAt: t('2026-03-07T12:00:00-05:00'), tz: 'America/New_York', costPerDay: '$10' })
    expect(elapsedDays(c.startedAt, c.startedAt + 23 * HOUR, c.tz)).toBe(1)
    expect(savingsTotals(c, c.startedAt + 23 * HOUR).money).toBe('$10.00')
  })

  it('shows only the totals that are set', () => {
    expect(savingsTotals(counter(), t('2026-07-01T00:00:00Z'))).toEqual({})
    expect(savingsTotals(counter({ costPerDay: '$3' }), t('2026-06-03T08:00:00Z'))).toEqual({ money: '$6.00' })
    expect(savingsTotals(counter({ timePerDay: '15m' }), t('2026-06-03T08:00:00Z'))).toEqual({ time: '30 min' })
  })

  it('skips an unreadable value instead of failing', () => {
    expect(savingsTotals(counter({ costPerDay: 'lots', timePerDay: '1h' }), t('2026-06-02T08:00:00Z'))).toEqual({
      time: '1 h 0 min',
    })
  })
})

describe('savings fields in storage', () => {
  it('round-trip through save and load', () => {
    const storage = new MemoryStorage()
    const c = newCounter('alcohol', 'Wine', t('2026-05-01T20:00:00Z'), 'Europe/Paris', {
      costPerDay: ' 8,50 € ',
      timePerDay: '1h 30m',
    })
    expect(c).toMatchObject({ costPerDay: '8,50 €', timePerDay: '1h 30m' })
    saveCounters([c], storage)
    const [loaded] = loadCounters(storage)
    expect(loaded).toEqual(c)
    expect(savingsTotals(loaded, t('2026-05-03T20:00:00Z'))).toEqual({ money: '17,00 €', time: '3 h 0 min' })
  })

  it('leave counters from before the feature unchanged', () => {
    const storage = new MemoryStorage()
    const old = { id: 'a', name: 'Sugar', kind: 'sugar', startedAt: t('2026-01-01T00:00:00Z'), tz: 'UTC' }
    storage.setItem(STORAGE_KEY, JSON.stringify([old]))
    const [loaded] = loadCounters(storage)
    expect(loaded).toEqual(old)
    expect('costPerDay' in loaded).toBe(false)
    expect('timePerDay' in loaded).toBe(false)
  })

  it('drop blank or malformed values without losing the counter', () => {
    const storage = new MemoryStorage()
    const base = counter()
    storage.setItem(
      STORAGE_KEY,
      JSON.stringify([
        { ...base, id: 'a', costPerDay: 12, timePerDay: '' },
        { ...base, id: 'b', costPerDay: null, timePerDay: { h: 1 } },
      ]),
    )
    expect(loadCounters(storage)).toEqual([
      { ...base, id: 'a' },
      { ...base, id: 'b' },
    ])
  })

  it('can be set and cleared on an existing counter', () => {
    const c = counter()
    const set = withSavings(c, { costPerDay: '$4', timePerDay: '20 min' })
    expect(set).toMatchObject({ costPerDay: '$4', timePerDay: '20 min' })
    const cleared = withSavings(set, { costPerDay: '', timePerDay: '  ' })
    expect(cleared).toEqual(c)
  })
})

import { describe, expect, it } from 'vitest'
import type { Counter } from './counter'
import {
  CELEBRATED_KEY,
  celebrationMessage,
  loadCelebrated,
  markCelebrated,
  milestone,
  MILESTONES,
  pendingCelebration,
  pruneCelebrated,
  saveCelebrated,
} from './milestones'

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
  name: 'Smoking',
  kind: 'smoking',
  startedAt: t('2026-06-01T08:00:00Z'),
  tz: 'UTC',
  ...extra,
})

describe('pendingCelebration', () => {
  it('has nothing to celebrate before the first milestone', () => {
    const c = counter()
    expect(pendingCelebration([c], {}, c.startedAt + DAY - 1)).toBeNull()
  })

  it('fires the milestone the moment its threshold is crossed', () => {
    const c = counter()
    expect(pendingCelebration([c], {}, c.startedAt + DAY)).toEqual({
      counterId: 'a',
      counterName: 'Smoking',
      milestone: expect.objectContaining({ id: '1d', label: '1 day' }),
      count: 1,
    })
    expect(pendingCelebration([c], { a: 1 }, c.startedAt + 3 * DAY)?.milestone.id).toBe('3d')
    expect(pendingCelebration([c], { a: 2 }, c.startedAt + 7 * DAY)?.milestone.id).toBe('1w')
  })

  it('does not fire a milestone that was already celebrated', () => {
    const c = counter()
    expect(pendingCelebration([c], { a: 1 }, c.startedAt + 2 * DAY)).toBeNull()
    expect(pendingCelebration([c], { a: 3 }, c.startedAt + 10 * DAY)).toBeNull()
  })

  it('celebrates only the latest milestone after a long absence', () => {
    const c = counter()
    const due = pendingCelebration([c], { a: 1 }, c.startedAt + 40 * DAY)
    expect(due?.milestone.id).toBe('1m')
    // Recording it covers the ones skipped in between.
    const after = markCelebrated({ a: 1 }, 'a', due!.count)
    expect(pendingCelebration([c], after, c.startedAt + 40 * DAY)).toBeNull()
  })

  it('reaches yearly milestones beyond the first year', () => {
    const c = counter()
    const due = pendingCelebration([c], { a: MILESTONES.length }, t('2028-06-01T08:00:00Z'))
    expect(due?.milestone).toMatchObject({ id: '2y', label: '2 years' })
  })

  it('is calendar- and DST-aware like the counter', () => {
    const c = counter({ startedAt: t('2026-03-07T12:00:00-05:00'), tz: 'America/New_York' })
    // The day of the spring-forward change is 23 hours long.
    expect(pendingCelebration([c], {}, c.startedAt + 23 * HOUR - 1)).toBeNull()
    expect(pendingCelebration([c], {}, c.startedAt + 23 * HOUR)?.milestone.id).toBe('1d')
  })

  it('goes through counters in order, each tracked separately', () => {
    const a = counter()
    const b = counter({ id: 'b', name: 'Sugar', startedAt: a.startedAt - 5 * DAY })
    const now = a.startedAt + DAY
    expect(pendingCelebration([a, b], {}, now)?.counterId).toBe('a')
    expect(pendingCelebration([a, b], { a: 1 }, now)).toMatchObject({ counterId: 'b', milestone: { id: '3d' } })
    expect(pendingCelebration([a, b], { a: 1, b: 2 }, now)).toBeNull()
  })
})

describe('celebrated storage', () => {
  it('round-trips and never lowers a count', () => {
    const storage = new MemoryStorage()
    saveCelebrated(markCelebrated(markCelebrated({}, 'a', 3), 'a', 2), storage)
    expect(loadCelebrated(storage)).toEqual({ a: 3 })
  })

  it('survives a reload so a celebration fires only once', () => {
    const storage = new MemoryStorage()
    const c = counter()
    const now = c.startedAt + 7 * DAY
    const due = pendingCelebration([c], loadCelebrated(storage), now)!
    saveCelebrated(markCelebrated(loadCelebrated(storage), due.counterId, due.count), storage)
    // Next page load.
    expect(pendingCelebration([c], loadCelebrated(storage), now)).toBeNull()
    expect(pendingCelebration([c], loadCelebrated(storage), c.startedAt + 14 * DAY)?.milestone.id).toBe('2w')
  })

  it('ignores missing or corrupt data', () => {
    const storage = new MemoryStorage()
    expect(loadCelebrated(storage)).toEqual({})
    storage.setItem(CELEBRATED_KEY, 'nope')
    expect(loadCelebrated(storage)).toEqual({})
    storage.setItem(CELEBRATED_KEY, '[1,2]')
    expect(loadCelebrated(storage)).toEqual({})
    storage.setItem(CELEBRATED_KEY, JSON.stringify({ a: 2, b: 'x', c: -1, d: 1.5 }))
    expect(loadCelebrated(storage)).toEqual({ a: 2 })
  })

  it('drops removed counters', () => {
    expect(pruneCelebrated({ a: 1, gone: 4 }, [counter()])).toEqual({ a: 1 })
  })
})

describe('celebrationMessage', () => {
  it('names the milestone and the counter', () => {
    const m = celebrationMessage(MILESTONES[2], 'Vaping')
    expect(m.title).toBe("You've reached 1 week!")
    expect(m.body).toContain('Vaping')
    expect(m.body).toContain('1 week')
  })

  it('makes no medical or health claims', () => {
    const banned =
      /health|heal|lung|liver|heart|blood|brain|body|risk|disease|cancer|cure|medic|doctor|symptom|withdraw|detox|recover|nicotine|toxin|immune/i
    for (let i = 0; i < MILESTONES.length + 5; i++) {
      const { title, body } = celebrationMessage(milestone(i), 'Alcohol')
      expect(`${title} ${body}`).not.toMatch(banned)
    }
  })
})

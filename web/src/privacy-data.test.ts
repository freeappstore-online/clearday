import { describe, expect, it } from 'vitest'
import {
  BACKUP_FORMAT,
  BackupError,
  backupFileName,
  eraseAll,
  makeBackup,
  parseBackup,
  restoreBackup,
} from './backup'
import { type Counter, loadCounters, saveCounters } from './counter'
import { setNote, setWhy, slip } from './history'
import { loadCelebrated, saveCelebrated } from './milestones'
import {
  checkPin,
  clearPin,
  hasPin,
  LOCKOUT_MS,
  MAX_TRIES,
  PIN_KEY,
  readLockout,
  recordWrongPin,
  resetLockout,
  setPin,
} from './pin'

class MemoryStorage {
  data = new Map<string, string>()
  get length() {
    return this.data.size
  }
  key(i: number) {
    return [...this.data.keys()][i] ?? null
  }
  getItem(key: string) {
    return this.data.get(key) ?? null
  }
  setItem(key: string, value: string) {
    this.data.set(key, value)
  }
  removeItem(key: string) {
    this.data.delete(key)
  }
}

const t = (iso: string) => Date.parse(iso)
const counter = (extra: Partial<Counter> = {}): Counter => ({
  id: 'a',
  name: 'Smoking',
  kind: 'smoking',
  startedAt: t('2026-06-01T08:00:00Z'),
  tz: 'Europe/London',
  ...extra,
})

describe('PIN', () => {
  it('stores only a salted hash and checks the PIN against it', async () => {
    const s = new MemoryStorage()
    expect(hasPin(s)).toBe(false)
    await setPin('0420', s)
    expect(hasPin(s)).toBe(true)
    const stored = s.getItem(PIN_KEY)!
    expect(stored).not.toContain('0420')
    expect(JSON.parse(stored)).toMatchObject({ salt: expect.any(String), hash: expect.any(String), iterations: 100_000 })
    expect(await checkPin('0420', s)).toBe(true)
    expect(await checkPin('0421', s)).toBe(false)
    expect(await checkPin('42', s)).toBe(false)
  })

  it('salts each PIN, so the same PIN never stores the same hash', async () => {
    const a = new MemoryStorage()
    const b = new MemoryStorage()
    await setPin('1234', a)
    await setPin('1234', b)
    expect(JSON.parse(a.getItem(PIN_KEY)!).hash).not.toBe(JSON.parse(b.getItem(PIN_KEY)!).hash)
  })

  it('accepts only 4 digits', async () => {
    const s = new MemoryStorage()
    for (const bad of ['123', '12345', 'abcd', '12 4', '']) await expect(setPin(bad, s)).rejects.toThrow()
    expect(hasPin(s)).toBe(false)
  })

  it('can be removed, and a damaged stored PIN counts as none', async () => {
    const s = new MemoryStorage()
    await setPin('1234', s)
    clearPin(s)
    expect(hasPin(s)).toBe(false)
    expect(await checkPin('1234', s)).toBe(false)
    s.setItem(PIN_KEY, '{nope')
    expect(hasPin(s)).toBe(false)
  })

  it('pauses guessing after MAX_TRIES wrong guesses, then starts counting again', () => {
    const s = new MemoryStorage()
    const now = t('2026-06-01T08:00:00Z')
    for (let i = 1; i < MAX_TRIES; i++) expect(recordWrongPin(now, s)).toEqual({ tries: i, until: 0 })
    expect(recordWrongPin(now, s)).toEqual({ tries: 0, until: now + LOCKOUT_MS })
    expect(readLockout(s).until).toBe(now + LOCKOUT_MS)
    expect(recordWrongPin(now + LOCKOUT_MS, s)).toEqual({ tries: 1, until: 0 })
    resetLockout(s)
    expect(readLockout(s)).toEqual({ tries: 0, until: 0 })
  })
})

describe('backup', () => {
  const full = () =>
    setNote(
      setWhy(slip(counter({ costPerDay: '£8', timePerDay: '1h' }), t('2026-06-10T08:00:00Z')), 'For my lungs'),
      '2026-06-12',
      'Walked to work',
    )

  it('holds every counter with its history, journal and settings, and no PIN', () => {
    const c = full()
    const backup = makeBackup([c, counter({ id: 'b', name: 'Sugar', kind: 'sugar' })], { a: 2 }, t('2026-06-15T09:30:00Z'))
    expect(backup).toEqual({
      format: BACKUP_FORMAT,
      version: 1,
      exportedAt: '2026-06-15T09:30:00.000Z',
      counters: [c, expect.objectContaining({ id: 'b' })],
      celebrated: { a: 2 },
    })
    expect(JSON.stringify(backup)).not.toMatch(/pin/i)
    expect(backupFileName(t('2026-06-15T09:30:00Z'))).toBe('clearday-backup-2026-06-15.json')
  })

  it('round-trips through a file and restores into storage', () => {
    const s = new MemoryStorage()
    const c = full()
    const text = JSON.stringify(makeBackup([c], { a: 3 }, t('2026-06-15T00:00:00Z')))
    const parsed = parseBackup(text)
    expect(parsed).toEqual({ counters: [c], celebrated: { a: 3 } })
    saveCounters([counter({ id: 'old' })], s)
    restoreBackup(parsed, s)
    expect(loadCounters(s)).toEqual([c])
    expect(loadCelebrated(s)).toEqual({ a: 3 })
  })

  it('drops celebrations for counters that are not in the file', () => {
    const text = JSON.stringify(makeBackup([counter()], { a: 1, gone: 5 }, 0))
    expect(parseBackup(text).celebrated).toEqual({ a: 1 })
  })

  it('refuses files that are not ClearDay backups, or are damaged, with a readable reason', () => {
    const cases: [string, RegExp][] = [
      ['{oops', /isn't valid JSON/],
      ['null', /isn't a ClearDay backup/],
      ['{"counters":[]}', /isn't a ClearDay backup/],
      [JSON.stringify({ format: BACKUP_FORMAT, version: 1 }), /isn't a ClearDay backup/],
      [JSON.stringify({ format: BACKUP_FORMAT, version: 99, counters: [] }), /newer version/],
      [JSON.stringify({ format: BACKUP_FORMAT, version: 1, counters: [counter(), { id: 'x' }] }), /damaged/],
    ]
    for (const [text, message] of cases) {
      expect(() => parseBackup(text)).toThrow(BackupError)
      expect(() => parseBackup(text)).toThrow(message)
    }
  })

  it('accepts an empty backup', () => {
    expect(parseBackup(JSON.stringify(makeBackup([], {}, 0)))).toEqual({ counters: [], celebrated: {} })
  })
})

describe('eraseAll', () => {
  it('removes everything ClearDay keeps and nothing else', async () => {
    const s = new MemoryStorage()
    saveCounters([setNote(counter(), '2026-06-02', 'note')], s)
    saveCelebrated({ a: 1 }, s)
    await setPin('1234', s)
    recordWrongPin(0, s)
    s.setItem('clearday:future-thing', 'x')
    s.setItem('stores-theme', 'dark')
    eraseAll(s)
    expect([...s.data.keys()]).toEqual(['stores-theme'])
  })
})

// Backups as one JSON file, and erasing everything. All local; nothing
// here touches the network.

import { type Counter, parseCounters, saveCounters, STORAGE_KEY } from './counter'
import { CELEBRATED_KEY, type Celebrated, parseCelebrated, saveCelebrated } from './milestones'
import { LOCKOUT_KEY, PIN_KEY } from './pin'

export const BACKUP_FORMAT = 'clearday-backup'
export const BACKUP_VERSION = 1

export interface Backup {
  format: typeof BACKUP_FORMAT
  version: number
  exportedAt: string
  /** Every counter with its history, journal, "why" and savings settings. */
  counters: Counter[]
  /** Which milestones have been celebrated, so a restore doesn't celebrate them again. */
  celebrated: Celebrated
}

/** Everything worth keeping, as one object. The PIN is deliberately left out. */
export function makeBackup(counters: Counter[], celebrated: Celebrated, now: number): Backup {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date(now).toISOString(),
    counters,
    celebrated,
  }
}

export function backupFileName(now: number): string {
  return `clearday-backup-${new Date(now).toISOString().slice(0, 10)}.json`
}

export class BackupError extends Error {}

/** Read a backup file's text. Throws BackupError with a message fit to show the user. */
export function parseBackup(text: string): { counters: Counter[]; celebrated: Celebrated } {
  let data: unknown
  try {
    data = JSON.parse(text)
  } catch {
    throw new BackupError("That file isn't a ClearDay backup (it isn't valid JSON).")
  }
  const b = data as Partial<Backup> | null
  if (typeof b !== 'object' || b === null || b.format !== BACKUP_FORMAT || !Array.isArray(b.counters)) {
    throw new BackupError("That file isn't a ClearDay backup.")
  }
  if (typeof b.version !== 'number' || b.version > BACKUP_VERSION) {
    throw new BackupError('That backup was made by a newer version of ClearDay. Reload the app and try again.')
  }
  const counters = parseCounters(b.counters)
  if (counters.length < b.counters.length) {
    throw new BackupError('Some counters in that backup are damaged, so nothing was restored.')
  }
  const ids = new Set(counters.map((c) => c.id))
  const celebrated = Object.fromEntries(Object.entries(parseCelebrated(b.celebrated)).filter(([id]) => ids.has(id)))
  return { counters, celebrated }
}

/** Replace the saved counters and celebrations with a backup's. */
export function restoreBackup(
  backup: { counters: Counter[]; celebrated: Celebrated },
  storage: Pick<Storage, 'setItem'> = localStorage,
): void {
  saveCounters(backup.counters, storage)
  saveCelebrated(backup.celebrated, storage)
}

/** Remove everything ClearDay keeps in this browser: counters, journal, celebrations and PIN. */
export function eraseAll(storage: Pick<Storage, 'length' | 'key' | 'removeItem'> = localStorage): void {
  const keys: string[] = []
  for (let i = 0; i < storage.length; i++) {
    const k = storage.key(i)
    if (k?.startsWith('clearday:')) keys.push(k)
  }
  for (const k of [...keys, STORAGE_KEY, CELEBRATED_KEY, PIN_KEY, LOCKOUT_KEY]) storage.removeItem(k)
}

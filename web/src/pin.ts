// The optional PIN lock. All local; nothing here touches the network.
//
// The PIN is a lock screen, not encryption. It keeps the app closed to
// someone picking up the device; the data itself is in this browser's
// storage like any other web app's. Only a salted PBKDF2 hash of the PIN is
// stored, and there is no recovery: a forgotten PIN means erasing ClearDay's
// data on this device (or restoring a backup afterwards).

export const PIN_KEY = 'clearday:pin:v1'
export const LOCKOUT_KEY = 'clearday:pin-lockout:v1'

/** Wrong guesses allowed before a pause, and how long the pause is. */
export const MAX_TRIES = 5
export const LOCKOUT_MS = 30_000

const ITERATIONS = 100_000

interface StoredPin {
  salt: string
  hash: string
  iterations: number
}

export const isPinFormat = (pin: string) => /^\d{4}$/.test(pin)

const toBase64 = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes))
const fromBase64 = (text: string) => Uint8Array.from(atob(text), (c) => c.charCodeAt(0))

async function derive(pin: string, salt: Uint8Array, iterations: number): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(pin), 'PBKDF2', false, ['deriveBits'])
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: salt as BufferSource, iterations },
    key,
    256,
  )
  return toBase64(new Uint8Array(bits))
}

function readPin(storage: Pick<Storage, 'getItem'>): StoredPin | null {
  try {
    const p = JSON.parse(storage.getItem(PIN_KEY) ?? 'null') as StoredPin | null
    return p && typeof p.salt === 'string' && typeof p.hash === 'string' && Number.isInteger(p.iterations) ? p : null
  } catch {
    return null
  }
}

export function hasPin(storage: Pick<Storage, 'getItem'> = localStorage): boolean {
  return readPin(storage) !== null
}

export async function setPin(pin: string, storage: Pick<Storage, 'setItem'> = localStorage): Promise<void> {
  if (!isPinFormat(pin)) throw new Error('A PIN is 4 digits.')
  const salt = crypto.getRandomValues(new Uint8Array(16))
  const stored: StoredPin = { salt: toBase64(salt), hash: await derive(pin, salt, ITERATIONS), iterations: ITERATIONS }
  storage.setItem(PIN_KEY, JSON.stringify(stored))
}

export async function checkPin(pin: string, storage: Pick<Storage, 'getItem'> = localStorage): Promise<boolean> {
  const stored = readPin(storage)
  if (!stored || !isPinFormat(pin)) return false
  return (await derive(pin, fromBase64(stored.salt), stored.iterations)) === stored.hash
}

export function clearPin(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(PIN_KEY)
  storage.removeItem(LOCKOUT_KEY)
}

export interface Lockout {
  tries: number
  /** Epoch ms until which guesses are paused, or 0. */
  until: number
}

export function readLockout(storage: Pick<Storage, 'getItem'> = localStorage): Lockout {
  try {
    const l = JSON.parse(storage.getItem(LOCKOUT_KEY) ?? 'null') as Lockout | null
    return l && Number.isFinite(l.tries) && Number.isFinite(l.until) ? l : { tries: 0, until: 0 }
  } catch {
    return { tries: 0, until: 0 }
  }
}

/** Count a wrong guess; every MAX_TRIES wrong guesses pauses guessing for LOCKOUT_MS. Kept across reloads. */
export function recordWrongPin(now: number, storage: Pick<Storage, 'getItem' | 'setItem'> = localStorage): Lockout {
  const tries = readLockout(storage).tries + 1
  const next = { tries: tries % MAX_TRIES, until: tries % MAX_TRIES === 0 ? now + LOCKOUT_MS : 0 }
  storage.setItem(LOCKOUT_KEY, JSON.stringify(next))
  return next
}

export function resetLockout(storage: Pick<Storage, 'removeItem'> = localStorage): void {
  storage.removeItem(LOCKOUT_KEY)
}

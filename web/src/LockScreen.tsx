import { useEffect, useState } from 'react'
import { ConfirmDialog, PageHeader } from '@freeappstore/sdk/ui'
import { eraseAll } from './backup'
import { checkPin, readLockout, recordWrongPin, resetLockout } from './pin'

/** The PIN prompt shown instead of every screen while ClearDay is locked. Reveals nothing about the counters. */
export default function LockScreen({ onUnlock, onErased }: { onUnlock: () => void; onErased: () => void }) {
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [checking, setChecking] = useState(false)
  const [forgot, setForgot] = useState(false)
  const [erasing, setErasing] = useState(false)
  const [now, setNow] = useState(() => Date.now())
  const until = readLockout().until
  const waiting = until > now

  // Tick while paused so the countdown and the form come back on their own.
  useEffect(() => {
    if (!waiting) return
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [waiting])

  const submit = async () => {
    if (waiting || checking) return
    setChecking(true)
    const ok = await checkPin(pin)
    setChecking(false)
    if (ok) {
      resetLockout()
      onUnlock()
      return
    }
    const lockout = recordWrongPin(Date.now())
    setNow(Date.now())
    setPin('')
    setError(lockout.until ? null : "That PIN didn't match. Try again.")
  }

  return (
    <div className="mx-auto w-full max-w-sm">
      <PageHeader title="ClearDay is locked" description="Enter your 4-digit PIN to open it." />
      <form
        className="grid gap-3"
        onSubmit={(e) => {
          e.preventDefault()
          void submit()
        }}
      >
        <label className="grid gap-1">
          <span className="text-sm font-semibold text-[var(--ink)]">PIN</span>
          <input
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{4}"
            maxLength={4}
            value={pin}
            disabled={waiting}
            autoFocus
            onChange={(e) => {
              setPin(e.target.value.replace(/\D/g, '').slice(0, 4))
              setError(null)
            }}
            aria-invalid={error !== null}
            aria-describedby="pin-status"
            className="rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-center text-2xl tracking-[0.5em] text-[var(--ink)]"
          />
        </label>
        <p id="pin-status" role="status" className="min-h-5 text-sm text-[var(--danger)]">
          {waiting ? `Too many tries. You can try again in ${Math.ceil((until - now) / 1000)} s.` : error}
        </p>
        <button
          type="submit"
          disabled={waiting || pin.length !== 4 || checking}
          className="rounded-[var(--radius)] cd-btn-primary px-4 py-2 font-semibold disabled:opacity-50"
        >
          Unlock
        </button>
      </form>
      <div className="mt-6 text-sm text-[var(--muted)]">
        {forgot ? (
          <>
            <p>
              There's no way to recover a forgotten PIN; it's only stored on this device. To use
              ClearDay again you can erase its data here, then restore a backup file if you have
              one.
            </p>
            <button
              type="button"
              onClick={() => setErasing(true)}
              className="mt-2 font-semibold text-[var(--danger)] underline"
            >
              Erase ClearDay data
            </button>
          </>
        ) : (
          <button type="button" onClick={() => setForgot(true)} className="underline">
            Forgot your PIN?
          </button>
        )}
      </div>
      <ConfirmDialog
        open={erasing}
        title="Erase ClearDay data?"
        message="This deletes every counter, its history and journal, and the PIN from this device. It can't be undone."
        confirmLabel="Erase everything"
        variant="danger"
        onConfirm={() => {
          eraseAll()
          setErasing(false)
          onErased()
        }}
        onCancel={() => setErasing(false)}
      />
    </div>
  )
}

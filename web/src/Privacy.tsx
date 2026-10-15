import { type ReactNode, useRef, useState } from 'react'
import { ConfirmDialog, PageHeader } from '@freeappstore/sdk/ui'
import { type Counter, loadCounters } from './counter'
import { type Celebrated, loadCelebrated } from './milestones'
import { BackupError, backupFileName, eraseAll, makeBackup, parseBackup, restoreBackup } from './backup'
import { checkPin, clearPin, hasPin, isPinFormat, setPin } from './pin'

/** A general directory of helplines by country. Linked, never loaded: ClearDay makes no request to it. */
export const HELPLINE_DIRECTORY = 'https://findahelpline.com/'

export default function Privacy() {
  return (
    <>
      <PageHeader title="Privacy" description="What ClearDay keeps, where, and how to protect it." />
      <PrivacyNote />
      <PinSection />
      <BackupSection />
      <Support />
    </>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section
      aria-labelledby={id}
      className="mt-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4"
    >
      <h2 id={id} className="font-semibold text-[var(--ink)]">
        {title}
      </h2>
      <div className="mt-2 grid gap-3 text-sm text-[var(--muted)]">{children}</div>
    </section>
  )
}

export function PrivacyNote() {
  return (
    <Section id="privacy-note" title="Your data stays on this device">
      <ul className="grid list-disc gap-2 pl-5">
        <li>
          Everything you enter (counters, quit dates, costs, journal notes and your reasons) is stored
          only in this browser on this device. Nothing is uploaded, and ClearDay never sends it
          anywhere.
        </li>
        <li>
          No account is needed. Signing in to FreeAppStore is optional, and ClearDay doesn't add any
          of your data to your account.
        </li>
        <li>
          Page-view counts: the app loads FreeAppStore's store analytics script, which records which
          screen you opened (for example /privacy), the page that linked here, and the time. It's sent
          to FreeAppStore without cookies and without your account, and held in this browser while
          you're offline. Your counters and journal are never included.
        </li>
        <li>
          ClearDay is served via FreeAppStore, which also loads Cloudflare Web Analytics
          (beacon.min.js from static.cloudflareinsights.com). It doesn't use cookies and reports only
          aggregate page-view statistics, such as page load times and visit counts. As with any
          website, the servers handling these requests see your IP address and browser type.
        </li>
        <li>No ads, no tracking cookies, and no advertising or tracking SDKs.</li>
        <li>
          Clearing this browser's data or uninstalling the app deletes your counters. Export a backup
          below to keep a copy.
        </li>
      </ul>
    </Section>
  )
}

const FIELD =
  'rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]'
const BUTTON =
  'rounded-[var(--radius)] cd-btn-primary px-4 py-2 font-semibold disabled:opacity-50'
const QUIET = 'rounded-[var(--radius)] border border-[var(--line-strong)] px-4 py-2 font-semibold text-[var(--ink)]'

function PinInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="grid gap-1">
      <span className="font-semibold text-[var(--ink)]">{label}</span>
      <input
        type="password"
        inputMode="numeric"
        autoComplete="off"
        pattern="[0-9]{4}"
        maxLength={4}
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 4))}
        className={`${FIELD} w-32 tracking-[0.4em]`}
      />
    </label>
  )
}

function PinSection() {
  const [on, setOn] = useState(() => hasPin())
  const [mode, setMode] = useState<'idle' | 'set' | 'remove'>('idle')
  const [pin, setPinValue] = useState('')
  const [confirm, setConfirm] = useState('')
  const [understood, setUnderstood] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const reset = (next: typeof mode = 'idle') => {
    setMode(next)
    setPinValue('')
    setConfirm('')
    setUnderstood(false)
    setError(null)
  }

  return (
    <Section id="pin-lock" title="PIN lock">
      <p>
        {on
          ? 'ClearDay asks for your PIN each time it opens, and after it has been in the background for a minute.'
          : 'Optionally, ask for a 4-digit PIN each time ClearDay opens.'}{' '}
        The PIN keeps the app closed to someone picking up your device; it doesn't encrypt your data.
      </p>
      <p className="font-semibold text-[var(--ink)]" role="note">
        There is no way to recover a forgotten PIN. It's stored only on this device, so the only way
        back in is to erase ClearDay's data. Keep a backup if your history matters to you.
      </p>
      {message && (
        <p role="status" className="text-[var(--ink)]">
          {message}
        </p>
      )}
      {mode === 'idle' && (
        <div className="flex flex-wrap gap-2">
          {on ? (
            <>
              <button type="button" className={QUIET} onClick={() => reset('set')}>
                Change PIN
              </button>
              <button type="button" className={QUIET} onClick={() => reset('remove')}>
                Remove PIN
              </button>
            </>
          ) : (
            <button type="button" className={BUTTON} onClick={() => reset('set')}>
              Set a PIN
            </button>
          )}
        </div>
      )}
      {mode === 'set' && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!isPinFormat(pin)) return setError('Enter 4 digits.')
            if (pin !== confirm) return setError("The two PINs don't match.")
            if (!understood) return setError('Please confirm you understand a forgotten PIN can’t be recovered.')
            await setPin(pin)
            setOn(true)
            reset()
            setMessage('PIN set. ClearDay will ask for it next time it opens.')
          }}
        >
          <PinInput label={on ? 'New PIN' : 'PIN'} value={pin} onChange={setPinValue} />
          <PinInput label="Enter it again" value={confirm} onChange={setConfirm} />
          <label className="flex items-start gap-2">
            <input
              type="checkbox"
              checked={understood}
              onChange={(e) => setUnderstood(e.target.checked)}
              className="mt-1 h-4 w-4"
            />
            <span>I understand that if I forget this PIN, it can't be recovered.</span>
          </label>
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
          <div className="flex gap-2">
            <button type="submit" className={BUTTON}>
              Save PIN
            </button>
            <button type="button" className={QUIET} onClick={() => reset()}>
              Cancel
            </button>
          </div>
        </form>
      )}
      {mode === 'remove' && (
        <form
          className="grid gap-3"
          onSubmit={async (e) => {
            e.preventDefault()
            if (!(await checkPin(pin))) return setError("That PIN didn't match.")
            clearPin()
            setOn(false)
            reset()
            setMessage('PIN removed. ClearDay opens without one now.')
          }}
        >
          <PinInput label="Current PIN" value={pin} onChange={setPinValue} />
          <p role="alert" className="text-[var(--danger)]">
            {error}
          </p>
          <div className="flex gap-2">
            <button type="submit" className={BUTTON}>
              Remove PIN
            </button>
            <button type="button" className={QUIET} onClick={() => reset()}>
              Cancel
            </button>
          </div>
        </form>
      )}
    </Section>
  )
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }))
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  // Give the browser a moment to start the download before releasing it.
  window.setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function BackupSection() {
  const fileInput = useRef<HTMLInputElement>(null)
  const [pending, setPending] = useState<{ counters: Counter[]; celebrated: Celebrated } | null>(null)
  const [erasing, setErasing] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const current = loadCounters().length
  const plural = (n: number) => `${n} ${n === 1 ? 'counter' : 'counters'}`

  return (
    <Section id="backup" title="Backup">
      <p>
        Save all your counters, with their history, journal notes and reasons, as one JSON file. Keep
        it somewhere safe and restore it here on this or another device. The PIN isn't included.
      </p>
      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          className={BUTTON}
          onClick={() => {
            const now = Date.now()
            const backup = makeBackup(loadCounters(), loadCelebrated(), now)
            download(backupFileName(now), JSON.stringify(backup, null, 2))
            setError(null)
            setMessage(`Exported ${plural(backup.counters.length)}.`)
          }}
        >
          Export backup
        </button>
        <button type="button" className={QUIET} onClick={() => fileInput.current?.click()}>
          Restore from file
        </button>
        <input
          ref={fileInput}
          type="file"
          accept="application/json,.json"
          className="sr-only"
          tabIndex={-1}
          aria-label="Backup file to restore"
          onChange={async (e) => {
            const file = e.target.files?.[0]
            e.target.value = ''
            if (!file) return
            setMessage(null)
            try {
              setPending(parseBackup(await file.text()))
              setError(null)
            } catch (err) {
              setError(err instanceof BackupError ? err.message : "That file couldn't be read.")
            }
          }}
        />
      </div>
      {message && (
        <p role="status" className="text-[var(--ink)]">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-[var(--danger)]">
          {error}
        </p>
      )}
      <p>
        <button type="button" className="text-[var(--danger)] underline" onClick={() => setErasing(true)}>
          Erase all ClearDay data on this device
        </button>
      </p>
      <ConfirmDialog
        open={pending !== null}
        title="Restore this backup?"
        message={
          pending
            ? `This replaces the ${plural(current)} on this device with the ${plural(pending.counters.length)} in the file.`
            : ''
        }
        confirmLabel="Restore"
        onConfirm={() => {
          if (pending) {
            restoreBackup(pending)
            setMessage(`Restored ${plural(pending.counters.length)}.`)
          }
          setPending(null)
        }}
        onCancel={() => setPending(null)}
      />
      <ConfirmDialog
        open={erasing}
        title="Erase all ClearDay data?"
        message="This deletes every counter, its history and journal, and the PIN from this device. It can't be undone."
        confirmLabel="Erase everything"
        variant="danger"
        onConfirm={() => {
          eraseAll()
          // Start again from an empty Counters screen, with every screen's state fresh.
          window.location.assign('/')
        }}
        onCancel={() => setErasing(false)}
      />
    </Section>
  )
}

function Support() {
  return (
    <Section id="support" title="Support">
      <p>
        If you'd like to talk to someone, many countries have free, confidential quitlines and
        support lines, and local support services can tell you what's available near you.
      </p>
      <p>
        <a href={HELPLINE_DIRECTORY} target="_blank" rel="noopener noreferrer" className="text-[var(--ink)] underline">
          Find a helpline in your country
        </a>{' '}
        (a general directory, opens in a new tab). ClearDay isn't connected to any service and doesn't
        recommend a particular one.
      </p>
    </Section>
  )
}

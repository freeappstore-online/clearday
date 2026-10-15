import { type ButtonHTMLAttributes, useEffect, useState } from 'react'
import { ConfirmDialog, EmptyState, PageHeader } from '@freeappstore/sdk/ui'
import {
  type Counter,
  type CounterKind,
  deviceTimeZone,
  elapsed,
  KINDS,
  loadCounters,
  milestoneProgress,
  newCounter,
  parseLocalInput,
  saveCounters,
  toLocalInput,
} from './counter'

// Re-render every second so the counters tick.
function useNow(): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

export default function Counters() {
  const [counters, setCounters] = useState<Counter[]>(() => loadCounters())
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState<Counter | null>(null)
  const now = useNow()

  const update = (next: Counter[]) => {
    setCounters(next)
    saveCounters(next)
  }

  // Pick up changes made in another tab.
  useEffect(() => {
    const sync = () => setCounters(loadCounters())
    window.addEventListener('storage', sync)
    return () => window.removeEventListener('storage', sync)
  }, [])

  return (
    <>
      <PageHeader title="Counters" description="Every clear day counts." />
      {counters.length === 0 && !adding && (
        <EmptyState
          title="No counters yet"
          message="Start a counter for something you've quit. It stays on this device."
          action={<PrimaryButton onClick={() => setAdding(true)}>Start a counter</PrimaryButton>}
        />
      )}
      <ul className="grid gap-4">
        {counters.map((c) => (
          <CounterCard key={c.id} counter={c} now={now} onRemove={() => setRemoving(c)} />
        ))}
      </ul>
      {adding ? (
        <AddCounter
          onAdd={(c) => {
            update([...counters, c])
            setAdding(false)
          }}
          onCancel={() => setAdding(false)}
        />
      ) : (
        counters.length > 0 && (
          <div className="mt-4">
            <PrimaryButton onClick={() => setAdding(true)}>Add another counter</PrimaryButton>
          </div>
        )
      )}
      <ConfirmDialog
        open={removing !== null}
        title="Remove counter?"
        message={`This removes "${removing?.name ?? ''}" from this device. It can't be undone.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (removing) update(counters.filter((c) => c.id !== removing.id))
          setRemoving(null)
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}

function CounterCard({ counter, now, onRemove }: { counter: Counter; now: number; onRemove: () => void }) {
  const e = elapsed(counter.startedAt, now, counter.tz)
  const m = milestoneProgress(counter.startedAt, now, counter.tz)
  const started = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: counter.tz })
  const nextOn = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: counter.tz })

  return (
    <li className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 sm:flex-row sm:items-center">
      <ProgressRing value={m.progress} label={`${Math.round(m.progress * 100)}% of the way to ${m.next.label}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-[var(--ink)]">{counter.name}</h2>
          <button
            type="button"
            onClick={onRemove}
            className="text-sm text-[var(--muted)] underline hover:text-[var(--ink)]"
            aria-label={`Remove ${counter.name}`}
          >
            Remove
          </button>
        </div>
        <p className="mt-1 display-font text-3xl text-[var(--ink)] tabular-nums">
          {e.days} {e.days === 1 ? 'day' : 'days'}
        </p>
        <p className="text-[var(--muted)] tabular-nums">
          {e.hours}h {String(e.minutes).padStart(2, '0')}m {String(e.seconds).padStart(2, '0')}s
        </p>
        <p className="mt-2 text-sm text-[var(--muted)]">
          {m.reached ? `${m.reached.label} reached. ` : ''}
          Next: {m.next.label} on {nextOn.format(m.next.at)}.
        </p>
        <p className="text-xs text-[var(--muted)]">
          Since {started.format(counter.startedAt)}
          {counter.tz !== deviceTimeZone() && ` (${counter.tz})`}
        </p>
      </div>
    </li>
  )
}

function ProgressRing({ value, label }: { value: number; label: string }) {
  const r = 34
  const circumference = 2 * Math.PI * r
  return (
    <svg viewBox="0 0 80 80" className="h-20 w-20 shrink-0 -rotate-90" role="img" aria-label={label}>
      <circle cx="40" cy="40" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="8" />
      <circle
        cx="40"
        cy="40"
        r={r}
        fill="none"
        stroke="var(--accent)"
        strokeWidth="8"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - Math.min(1, Math.max(0, value)))}
      />
    </svg>
  )
}

function AddCounter({ onAdd, onCancel }: { onAdd: (c: Counter) => void; onCancel: () => void }) {
  const tz = deviceTimeZone()
  const [kind, setKind] = useState<CounterKind>('alcohol')
  const [name, setName] = useState('')
  const [start, setStart] = useState(() => toLocalInput(Date.now(), tz))
  const max = toLocalInput(Date.now(), tz)
  const startedAt = parseLocalInput(start, tz)
  const error = startedAt === null ? 'Choose a date and time.' : startedAt > Date.now() ? "That's in the future." : null

  return (
    <form
      className="mt-4 grid gap-3 rounded-[var(--radius)] border border-[var(--line)] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (startedAt !== null && !error) onAdd(newCounter(kind, name, startedAt, tz))
      }}
    >
      <label className="grid gap-1">
        <span className="text-sm font-semibold text-[var(--ink)]">What did you quit?</span>
        <select value={kind} onChange={(e) => setKind(e.target.value as CounterKind)} className={FIELD}>
          {KINDS.map((k) => (
            <option key={k.kind} value={k.kind}>
              {k.label}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-semibold text-[var(--ink)]">
          Name {kind !== 'custom' && <span className="font-normal text-[var(--muted)]">(optional)</span>}
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={60}
          required={kind === 'custom'}
          className={FIELD}
        />
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-semibold text-[var(--ink)]">When did you quit?</span>
        <input
          type="datetime-local"
          value={start}
          max={max}
          onChange={(e) => setStart(e.target.value)}
          className={FIELD}
          aria-invalid={error !== null}
          aria-describedby="start-error"
        />
        <span id="start-error" className="text-sm text-[var(--danger)]">
          {error}
        </span>
      </label>
      <div className="flex gap-2">
        <PrimaryButton type="submit">Start counting</PrimaryButton>
        <button type="button" onClick={onCancel} className="rounded-[var(--radius)] px-4 py-2 text-[var(--muted)]">
          Cancel
        </button>
      </div>
    </form>
  )
}

const FIELD = 'rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]'

function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-[var(--radius)] bg-[var(--accent)] px-4 py-2 font-semibold text-white hover:bg-[var(--accent-deep)]"
    />
  )
}

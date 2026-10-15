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
  withSavings,
} from './counter'
import { HardDayNote, HistoryPanel, JournalPanel } from './CounterHistory'
import { slip } from './history'
import MilestoneCelebration from './MilestoneCelebration'
import { goTo } from './nav'
import {
  type Celebration,
  loadCelebrated,
  markCelebrated,
  pendingCelebration,
  pruneCelebrated,
  resetCelebrated,
  saveCelebrated,
} from './milestones'
import { parseDuration, parseMoney, savingsTotals } from './savings'

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
  const [slipping, setSlipping] = useState<Counter | null>(null)
  const [celebration, setCelebration] = useState<Celebration | null>(null)
  const now = useNow()

  // Celebrate a milestone once: on the first visit after it's crossed, or the
  // moment it's crossed while open. It's recorded as soon as it's shown, so a
  // reload (or another tab) won't show it again.
  useEffect(() => {
    if (celebration) return
    const celebrated = loadCelebrated()
    const due = pendingCelebration(counters, celebrated, now)
    if (!due) return
    saveCelebrated(markCelebrated(celebrated, due.counterId, due.count))
    setCelebration(due)
  }, [counters, now, celebration])

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
      <p className="-mt-2 mb-4 text-sm text-[var(--muted)]">
        Everything stays on this device.{' '}
        <a
          href="/privacy"
          className="underline"
          onClick={(e) => {
            e.preventDefault()
            goTo('/privacy')
          }}
        >
          Privacy, PIN lock and backup
        </a>
      </p>
      {celebration && counters.some((c) => c.id === celebration.counterId) && (
        <MilestoneCelebration
          key={`${celebration.counterId}:${celebration.count}`}
          milestone={celebration.milestone}
          counterName={celebration.counterName}
          onDismiss={() => setCelebration(null)}
        />
      )}
      {counters.length === 0 && !adding && (
        <EmptyState
          title="No counters yet"
          message="Start a counter for something you've quit."
          action={<PrimaryButton onClick={() => setAdding(true)}>Start a counter</PrimaryButton>}
        />
      )}
      <ul className="grid gap-4">
        {counters.map((c) => (
          <CounterCard
            key={c.id}
            counter={c}
            now={now}
            onRemove={() => setRemoving(c)}
            onSlip={() => setSlipping(c)}
            onSave={(next) => update(counters.map((x) => (x.id === next.id ? next : x)))}
          />
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
        open={slipping !== null}
        title="Slips happen"
        message={`This starts a fresh run for "${slipping?.name ?? ''}" from now. Your longest streak, earlier runs, calendar and notes all stay.`}
        confirmLabel="Start a fresh run"
        onConfirm={() => {
          if (slipping) {
            const now = Date.now()
            update(counters.map((c) => (c.id === slipping.id ? slip(c, now) : c)))
            saveCelebrated(resetCelebrated(loadCelebrated(), slipping.id))
            if (celebration?.counterId === slipping.id) setCelebration(null)
          }
          setSlipping(null)
        }}
        onCancel={() => setSlipping(null)}
      />
      <ConfirmDialog
        open={removing !== null}
        title="Remove counter?"
        message={`This removes "${removing?.name ?? ''}" from this device. It can't be undone.`}
        confirmLabel="Remove"
        variant="danger"
        onConfirm={() => {
          if (removing) {
            const next = counters.filter((c) => c.id !== removing.id)
            update(next)
            saveCelebrated(pruneCelebrated(loadCelebrated(), next))
            if (celebration?.counterId === removing.id) setCelebration(null)
          }
          setRemoving(null)
        }}
        onCancel={() => setRemoving(null)}
      />
    </>
  )
}

export function CounterCard({
  counter,
  now,
  onRemove,
  onSlip,
  onSave,
}: {
  counter: Counter
  now: number
  onRemove: () => void
  onSlip: () => void
  onSave: (c: Counter) => void
}) {
  const [editing, setEditing] = useState(false)
  const e = elapsed(counter.startedAt, now, counter.tz)
  const saved = savingsTotals(counter, now)
  const m = milestoneProgress(counter.startedAt, now, counter.tz)
  const started = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short', timeZone: counter.tz })
  const nextOn = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: counter.tz })

  return (
    <li className="flex flex-col gap-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel)] p-4 sm:flex-row sm:items-start">
      <ProgressRing value={m.progress} label={`${Math.round(m.progress * 100)}% of the way to ${m.next.label}`} />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-2">
          <h2 className="font-semibold text-[var(--ink)]">{counter.name}</h2>
          <div className="flex flex-wrap justify-end gap-3">
            <button type="button" onClick={onSlip} className={LINK} aria-label={`I slipped: start a fresh run for ${counter.name}`}>
              I slipped
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className={LINK}
              aria-label={`Savings for ${counter.name}: money and time saved`}
            >
              Savings
            </button>
            <button type="button" onClick={onRemove} className={LINK} aria-label={`Remove ${counter.name}`}>
              Remove
            </button>
          </div>
        </div>
        <p className="mt-1 display-font text-3xl text-[var(--ink)] tabular-nums">
          {e.days} {e.days === 1 ? 'day' : 'days'}
        </p>
        <p className="text-[var(--muted)] tabular-nums">
          {e.hours}h {String(e.minutes).padStart(2, '0')}m {String(e.seconds).padStart(2, '0')}s
        </p>
        {(saved.money || saved.time) && (
          <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1 tabular-nums">
            {saved.money && (
              <div>
                <dt className="text-xs text-[var(--muted)]">Money saved</dt>
                <dd className="font-semibold text-[var(--ink)]">{saved.money}</dd>
              </div>
            )}
            {saved.time && (
              <div>
                <dt className="text-xs text-[var(--muted)]">Time reclaimed</dt>
                <dd className="font-semibold text-[var(--ink)]">{saved.time}</dd>
              </div>
            )}
          </dl>
        )}
        {editing && (
          <EditSavings
            counter={counter}
            onSave={(next) => {
              onSave(next)
              setEditing(false)
            }}
            onCancel={() => setEditing(false)}
          />
        )}
        <p className="mt-2 text-sm text-[var(--muted)]">
          {m.reached ? `${m.reached.label} reached. ` : ''}
          Next: {m.next.label} on {nextOn.format(m.next.at)}.
        </p>
        <p className="text-xs text-[var(--muted)]">
          Since {started.format(counter.startedAt)}
          {counter.tz !== deviceTimeZone() && ` (${counter.tz})`}
        </p>
        <HardDayNote counter={counter} now={now} />
        <JournalPanel counter={counter} now={now} onSave={onSave} />
        <HistoryPanel counter={counter} now={now} />
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
  const [cost, setCost] = useState('')
  const [time, setTime] = useState('')
  const max = toLocalInput(Date.now(), tz)
  const startedAt = parseLocalInput(start, tz)
  const error = startedAt === null ? 'Choose a date and time.' : startedAt > Date.now() ? "That's in the future." : null

  return (
    <form
      className="mt-4 grid gap-3 rounded-[var(--radius)] border border-[var(--line)] p-4"
      onSubmit={(e) => {
        e.preventDefault()
        if (startedAt !== null && !error && !savingsInvalid(cost, time))
          onAdd(newCounter(kind, name, startedAt, tz, { costPerDay: cost, timePerDay: time }))
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
      <SavingsFields idPrefix="new" cost={cost} time={time} setCost={setCost} setTime={setTime} />
      <div className="flex gap-2">
        <PrimaryButton type="submit">Start counting</PrimaryButton>
        <button type="button" onClick={onCancel} className="rounded-[var(--radius)] px-4 py-2 text-[var(--muted)]">
          Cancel
        </button>
      </div>
    </form>
  )
}

const savingsInvalid = (cost: string, time: string) =>
  (cost.trim() !== '' && parseMoney(cost) === null) || (time.trim() !== '' && parseDuration(time) === null)

function SavingsFields({
  idPrefix,
  cost,
  time,
  setCost,
  setTime,
}: {
  idPrefix: string
  cost: string
  time: string
  setCost: (v: string) => void
  setTime: (v: string) => void
}) {
  const costError = cost.trim() !== '' && parseMoney(cost) === null ? 'Enter an amount, like $12.50 or 4,50 €.' : null
  const timeError =
    time.trim() !== '' && parseDuration(time) === null ? 'Enter a time up to a day, like 30 min or 1h 30m.' : null
  return (
    <>
      <label className="grid gap-1">
        <span className="text-sm font-semibold text-[var(--ink)]">
          Cost per day <span className="font-normal text-[var(--muted)]">(optional, with your currency)</span>
        </span>
        <input
          value={cost}
          onChange={(e) => setCost(e.target.value)}
          placeholder="$12.50"
          maxLength={30}
          className={FIELD}
          aria-invalid={costError !== null}
          aria-describedby={`${idPrefix}-cost-error`}
        />
        <span id={`${idPrefix}-cost-error`} className="text-sm text-[var(--danger)]">
          {costError}
        </span>
      </label>
      <label className="grid gap-1">
        <span className="text-sm font-semibold text-[var(--ink)]">
          Time per day <span className="font-normal text-[var(--muted)]">(optional)</span>
        </span>
        <input
          value={time}
          onChange={(e) => setTime(e.target.value)}
          placeholder="30 min"
          maxLength={30}
          className={FIELD}
          aria-invalid={timeError !== null}
          aria-describedby={`${idPrefix}-time-error`}
        />
        <span id={`${idPrefix}-time-error`} className="text-sm text-[var(--danger)]">
          {timeError}
        </span>
      </label>
    </>
  )
}

function EditSavings({
  counter,
  onSave,
  onCancel,
}: {
  counter: Counter
  onSave: (c: Counter) => void
  onCancel: () => void
}) {
  const [cost, setCost] = useState(counter.costPerDay ?? '')
  const [time, setTime] = useState(counter.timePerDay ?? '')
  return (
    <form
      className="mt-3 grid gap-3 rounded-[var(--radius)] border border-[var(--line)] p-3"
      onSubmit={(e) => {
        e.preventDefault()
        if (!savingsInvalid(cost, time)) onSave(withSavings(counter, { costPerDay: cost, timePerDay: time }))
      }}
    >
      <SavingsFields idPrefix={counter.id} cost={cost} time={time} setCost={setCost} setTime={setTime} />
      <div className="flex gap-2">
        <PrimaryButton type="submit">Save</PrimaryButton>
        <button type="button" onClick={onCancel} className="rounded-[var(--radius)] px-4 py-2 text-[var(--muted)]">
          Cancel
        </button>
      </div>
    </form>
  )
}

const LINK = 'text-sm text-[var(--muted)] underline hover:text-[var(--ink)]'

const FIELD = 'rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]'

function PrimaryButton(props: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="rounded-[var(--radius)] cd-btn-primary px-4 py-2 font-semibold"
    />
  )
}

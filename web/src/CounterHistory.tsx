import { useMemo, useState } from 'react'
import type { Counter } from './counter'
import {
  dateKey,
  type DayStatus,
  hardDay,
  heatmap,
  longestStreak,
  NOTE_MAX,
  notes,
  pastAttempts,
  setNote,
  setWhy,
} from './history'

const days = (n: number) => `${n} ${n === 1 ? 'day' : 'days'}`

/**
 * Shown on hard days: a kind word in the week after a slip, and the user's
 * own "Why I quit" when they've written one.
 */
export function HardDayNote({ counter, now }: { counter: Counter; now: number }) {
  const reason = hardDay(counter, now)
  if (!reason || (reason === 'far' && !counter.why)) return null
  const longest = longestStreak(counter, now)
  return (
    <div className="mt-3 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel-quiet)] p-3 text-sm" data-hard-day={reason}>
      {reason === 'slip' && (
        <p className="text-[var(--ink)]">
          Slips happen, and they don't erase the clear days you had. Your longest run is{' '}
          {days(longest.days)}. Every clear day still counts.
        </p>
      )}
      {counter.why && (
        <p className={reason === 'slip' ? 'mt-2 text-[var(--muted)]' : 'text-[var(--muted)]'}>
          <span className="font-semibold text-[var(--ink)]">Why you quit:</span> {counter.why}
        </p>
      )}
    </div>
  )
}

// One-line text that saves on Enter or when focus leaves.
function LineField({
  label,
  value,
  maxLength,
  placeholder,
  onSave,
}: {
  label: string
  value: string
  maxLength: number
  placeholder?: string
  onSave: (text: string) => void
}) {
  const [draft, setDraft] = useState(value)
  const [lastValue, setLastValue] = useState(value)
  // Follow changes made elsewhere (another tab) while not being edited.
  if (value !== lastValue) {
    setLastValue(value)
    setDraft(value)
  }
  const save = () => {
    if (draft.trim() !== value) onSave(draft)
  }
  return (
    <label className="grid gap-1">
      <span className="text-sm font-semibold text-[var(--ink)]">{label}</span>
      <input
        value={draft}
        maxLength={maxLength}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            save()
          }
        }}
        className="rounded-[var(--radius)] border border-[var(--line-strong)] bg-[var(--paper)] px-3 py-2 text-[var(--ink)]"
      />
    </label>
  )
}

export function JournalPanel({
  counter,
  now,
  onSave,
}: {
  counter: Counter
  now: number
  onSave: (c: Counter) => void
}) {
  const today = dateKey(now, counter.tz)
  const past = notes(counter).filter((n) => n.key !== today)
  return (
    <details className="mt-3 rounded-[var(--radius)] border border-[var(--line)] p-3">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">Journal</summary>
      <div className="mt-3 grid gap-3">
        <LineField
          label="Why I quit"
          value={counter.why ?? ''}
          maxLength={200}
          placeholder="A reason to come back to on hard days"
          onSave={(text) => onSave(setWhy(counter, text))}
        />
        <LineField
          label="Today's note"
          value={counter.journal?.[today] ?? ''}
          maxLength={NOTE_MAX}
          placeholder="One line about today (optional)"
          onSave={(text) => onSave(setNote(counter, today, text))}
        />
        {past.length > 0 && (
          <ul className="grid gap-1 text-sm">
            {past.slice(0, 7).map((n) => (
              <li key={n.key}>
                <span className="text-[var(--muted)] tabular-nums">{formatKey(n.key)}</span>{' '}
                <span className="text-[var(--ink)]">{n.text}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </details>
  )
}

const formatKey = (key: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(Date.parse(`${key}T12:00:00Z`))

const CELL: Record<DayStatus, string> = {
  clean: 'bg-[var(--mint)]',
  partial: 'bg-[var(--mint-soft)]',
  slip: 'bg-[var(--accent-soft)]',
  none: 'bg-[var(--line)]',
  future: 'bg-transparent',
}

const STATUS_LABEL: Record<DayStatus, string> = {
  clean: 'clear all day',
  partial: 'clear part of the day',
  slip: 'fresh start',
  none: 'before you started',
  future: '',
}

export function HistoryPanel({ counter, now }: { counter: Counter; now: number }) {
  const today = dateKey(now, counter.tz)
  // The grid only changes once a day, so don't rebuild it every second.
  const grid = useMemo(() => heatmap(counter, now), [counter, today])
  const longest = longestStreak(counter, now)
  const attempts = pastAttempts(counter)
  const cleanCount = grid.filter((d) => d.status === 'clean').length
  const when = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: counter.tz })

  return (
    <details className="mt-3 rounded-[var(--radius)] border border-[var(--line)] p-3">
      <summary className="cursor-pointer text-sm font-semibold text-[var(--ink)]">History</summary>
      <p className="mt-3 text-sm text-[var(--ink)]">
        Longest run: <span className="font-semibold">{days(longest.days)}</span>
        {longest.current ? ' (this one)' : ` (${when.format(longest.start)} to ${when.format(longest.end)})`}
      </p>
      <div
        role="img"
        aria-label={`${cleanCount} clear days in the last ${Math.ceil(grid.length / 7)} weeks`}
        className="mt-3 grid w-max grid-flow-col grid-rows-7 gap-[3px]"
      >
        {grid.map((d) => (
          <span
            key={d.key}
            data-status={d.status}
            title={d.status === 'future' ? undefined : `${formatKey(d.key)}: ${STATUS_LABEL[d.status]}`}
            className={`h-2.5 w-2.5 rounded-[2px] ${CELL[d.status]}`}
          />
        ))}
      </div>
      <p className="mt-2 flex flex-wrap gap-x-3 text-xs text-[var(--muted)]">
        {(['clean', 'partial', 'slip'] as const).map((s) => (
          <span key={s} className="inline-flex items-center gap-1">
            <span className={`inline-block h-2.5 w-2.5 rounded-[2px] ${CELL[s]}`} aria-hidden="true" />
            {STATUS_LABEL[s]}
          </span>
        ))}
      </p>
      {attempts.length > 0 && (
        <>
          <p className="mt-3 text-sm font-semibold text-[var(--ink)]">Earlier runs</p>
          <ul className="grid gap-1 text-sm text-[var(--muted)]">
            {attempts.map((a) => (
              <li key={a.start}>
                {when.format(a.start)} to {when.format(a.end)}: {days(a.days)}
              </li>
            ))}
          </ul>
        </>
      )}
    </details>
  )
}

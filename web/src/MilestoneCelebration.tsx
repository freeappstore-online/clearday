import { type CSSProperties, useEffect, useState } from 'react'
import { celebrationMessage, type Milestone } from './milestones'

const REDUCED_MOTION = '(prefers-reduced-motion: reduce)'

/** True when the user has asked the system for less motion. Follows changes live. */
export function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(REDUCED_MOTION).matches,
  )
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return
    const mq = window.matchMedia(REDUCED_MOTION)
    const sync = () => setReduced(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])
  return reduced
}

const COLORS = ['var(--accent)', 'var(--sky)', 'var(--mint)', 'var(--warning)', 'var(--accent-soft)']

// A fixed, even spread of pieces so the confetti looks the same every time
// and renders identically on the server and in tests.
const PIECES = Array.from({ length: 28 }, (_, i) => ({
  left: (i * 37) % 100,
  delay: ((i * 53) % 90) / 100,
  duration: 2.4 + ((i * 29) % 12) / 10,
  drift: ((i * 41) % 60) - 30,
  spin: 180 + ((i * 67) % 360),
  color: COLORS[i % COLORS.length],
}))

function Confetti() {
  return (
    <div className="confetti" aria-hidden="true" data-testid="confetti">
      {PIECES.map((p, i) => (
        <span
          key={i}
          style={
            {
              left: `${p.left}%`,
              background: p.color,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.duration}s`,
              '--drift': `${p.drift}px`,
              '--spin': `${p.spin}deg`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}

/**
 * A gentle celebration for a milestone: a short burst of confetti, or, when
 * the user prefers reduced motion, a static badge instead. The message is
 * shown either way.
 */
export default function MilestoneCelebration({
  milestone,
  counterName,
  onDismiss,
}: {
  milestone: Milestone
  counterName: string
  onDismiss: () => void
}) {
  const reduced = usePrefersReducedMotion()
  const { title, body } = celebrationMessage(milestone, counterName)
  return (
    <>
      {!reduced && <Confetti />}
      <div
        role="status"
        data-motion={reduced ? 'static' : 'confetti'}
        className="mb-4 flex items-center gap-4 rounded-[var(--radius)] border border-[var(--line)] bg-[var(--panel-strong)] p-4"
      >
        {reduced && (
          <span
            className="celebration-badge flex h-14 w-14 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-center text-xs font-bold leading-tight text-[var(--accent-deep)]"
            aria-hidden="true"
          >
            {milestone.label}
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="display-font text-xl text-[var(--ink)]">
            {title} <span aria-hidden="true">🎉</span>
          </p>
          <p className="text-sm text-[var(--muted)]">{body}</p>
        </div>
        <button
          type="button"
          onClick={onDismiss}
          className="rounded-[var(--radius)] px-3 py-2 text-sm font-semibold text-[var(--accent-deep)] underline"
        >
          Thanks
        </button>
      </div>
    </>
  )
}

import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Counter } from './counter'
import { CounterCard } from './Counters'

const start = Date.parse('2026-06-01T08:00:00Z')
const DAY = 86_400_000
const base: Counter = { id: 'c1', name: 'Vaping', kind: 'vaping', startedAt: start, tz: 'UTC' }
const render = (counter: Counter, now: number) =>
  renderToStaticMarkup(<CounterCard counter={counter} now={now} onRemove={() => {}} onSave={() => {}} />)

describe('CounterCard', () => {
  it('renders a counter without savings fields, with no totals', () => {
    const html = render(base, start + 3 * DAY)
    expect(html).toContain('Vaping')
    expect(html).toContain('3 days')
    expect(html).not.toContain('Money saved')
    expect(html).not.toContain('Time reclaimed')
  })

  it('shows the running totals when the fields are set', () => {
    const html = render({ ...base, costPerDay: '$6', timePerDay: '45 min' }, start + 2 * DAY)
    expect(html).toContain('Money saved')
    expect(html).toContain('$12.00')
    expect(html).toContain('Time reclaimed')
    expect(html).toContain('1 h 30 min')
  })

  it('shows only the money total when only cost is set', () => {
    const html = render({ ...base, costPerDay: '4,00 €' }, start + DAY)
    expect(html).toContain('4,00 €')
    expect(html).not.toContain('Time reclaimed')
  })
})

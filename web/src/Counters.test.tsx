import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Counter } from './counter'
import { CounterCard } from './Counters'

const start = Date.parse('2026-06-01T08:00:00Z')
const DAY = 86_400_000
const base: Counter = { id: 'c1', name: 'Vaping', kind: 'vaping', startedAt: start, tz: 'UTC' }
const render = (counter: Counter, now: number) =>
  renderToStaticMarkup(<CounterCard counter={counter} now={now} onRemove={() => {}} onSlip={() => {}} onSave={() => {}} />)

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

describe('CounterCard history and journal', () => {
  const MEDICAL =
    /health|heal|lung|liver|heart|blood|brain|body|risk|disease|cancer|cure|medic|doctor|symptom|withdraw|detox|recover|nicotine|toxin|immune/i

  it('shows a kind note and the reason for quitting in the week after a slip', () => {
    const slipped: Counter = {
      ...base,
      startedAt: start + 10 * DAY,
      attempts: [{ start, end: start + 10 * DAY }],
      why: 'More energy for my mornings',
    }
    const html = render(slipped, start + 12 * DAY)
    expect(html).toContain('data-hard-day="slip"')
    expect(html).toContain('Slips happen')
    expect(html).toContain('Your longest run is 10 days')
    expect(html).toContain('More energy for my mornings')
    expect(html).toContain('I slipped')
    const text = html.replace(/<[^>]+>/g, ' ').replace('More energy for my mornings', '')
    expect(text).not.toMatch(MEDICAL)
  })

  it('shows the reason on a far-from-milestone day only when one is written', () => {
    expect(render(base, start + 15 * DAY)).not.toContain('data-hard-day')
    const html = render({ ...base, why: 'For my family' }, start + 15 * DAY)
    expect(html).toContain('data-hard-day="far"')
    expect(html).toContain('For my family')
    expect(html).not.toContain('Slips happen')
  })

  it('renders the journal and the history heatmap', () => {
    const html = render({ ...base, journal: { '2026-06-02': 'Went for a run' } }, start + 3 * DAY)
    expect(html).toContain('Journal')
    expect(html).toContain('Went for a run')
    expect(html).toContain('History')
    expect(html).toContain('data-status="clean"')
    expect(html).toContain('Longest run: <span class="font-semibold">3 days</span> (this one)')
  })
})

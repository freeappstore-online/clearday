// Money and time saved: parse what the user typed for a day's cost and time,
// and turn it into running totals. Currency-agnostic: whatever surrounds the
// number ("$", " €", "CHF ") is kept as typed and wrapped around the total.

import { type Counter, elapsedDays } from './counter'

export interface Money {
  amount: number
  /** Text before the number, e.g. "$" or "CHF ". */
  prefix: string
  /** Text after the number, e.g. " €" or "kr". */
  suffix: string
  /** The user writes decimals with a comma ("4,50"). */
  decimalComma: boolean
}

/** Read a daily cost like "$12.50", "4,50 €", "£1,200" or "300 kr". Null if there is no usable amount. */
export function parseMoney(input: string): Money | null {
  const m = /^(\D*?)(\d[\d.,\s']*\d|\d)(\D*)$/.exec(input.trim())
  if (!m) return null
  const [, prefix, number, suffix] = m
  if (prefix.includes('-') || /\d/.test(suffix)) return null
  const digits = number.replace(/[\s']/g, '')
  const lastDot = digits.lastIndexOf('.')
  const lastComma = digits.lastIndexOf(',')
  let decimal: '.' | ',' | null = null
  if (lastDot >= 0 && lastComma >= 0) decimal = lastDot > lastComma ? '.' : ','
  else if (lastDot >= 0 || lastComma >= 0) {
    const sep = lastDot >= 0 ? '.' : ','
    const once = digits.indexOf(sep) === digits.lastIndexOf(sep)
    const after = digits.length - digits.lastIndexOf(sep) - 1
    // "1,200" and "1.200.000" group thousands; "4,50" and "12.5" are decimals.
    if (once && after !== 3) decimal = sep
  }
  const normalised = decimal
    ? digits.split(decimal).map((part, i, all) => (i === all.length - 1 ? part : part.replace(/[.,]/g, ''))).join('.')
    : digits.replace(/[.,]/g, '')
  const amount = Number(normalised)
  if (!Number.isFinite(amount)) return null
  return { amount, prefix, suffix, decimalComma: decimal === ',' }
}

export function formatMoney(amount: number, like: Money): string {
  const n = new Intl.NumberFormat(like.decimalComma ? 'de-DE' : 'en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
  return `${like.prefix}${n}${like.suffix}`
}

const UNIT_MINUTES: Record<string, number> = { h: 60, m: 1 }

/**
 * Read a daily time like "30 min", "2 hours", "1h 30m", "1.5 h" or "1:30" as
 * minutes. A bare number is minutes. Null if unreadable or more than a day.
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase()
  if (!text) return null
  let minutes: number
  const clock = /^(\d+):([0-5]\d)$/.exec(text)
  if (clock) {
    minutes = Number(clock[1]) * 60 + Number(clock[2])
  } else {
    const token = /(\d+(?:[.,]\d+)?)\s*(hours?|hrs?|h|minutes?|mins?|m)?/y
    minutes = 0
    let pos = 0
    let found = false
    while (pos < text.length) {
      // Allow separators between parts: "1h 30m", "1 hour and 30 minutes", "1h, 30m".
      const gap = /(?:\s|,|and\b)*/y
      gap.lastIndex = pos
      pos += gap.exec(text)![0].length
      if (pos >= text.length) break
      token.lastIndex = pos
      const t = token.exec(text)
      if (!t) return null
      const value = Number(t[1].replace(',', '.'))
      minutes += value * (t[2] ? UNIT_MINUTES[t[2][0]] : 1)
      pos = token.lastIndex
      found = true
    }
    if (!found) return null
  }
  return minutes <= 24 * 60 ? minutes : null
}

export function formatDuration(totalMinutes: number): string {
  const total = Math.floor(totalMinutes)
  const days = Math.floor(total / (24 * 60))
  const hours = Math.floor((total % (24 * 60)) / 60)
  const minutes = total % 60
  const time = hours > 0 ? `${hours} h ${minutes} min` : `${minutes} min`
  return days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} ${time}` : time
}

export interface SavingsTotals {
  /** Money saved so far, formatted like the user's input; absent if no cost is set or readable. */
  money?: string
  /** Time reclaimed so far; absent if no time is set or readable. */
  time?: string
}

/** Running totals since the counter started: daily amount × calendar days elapsed (including today's fraction). */
export function savingsTotals(counter: Counter, now: number): SavingsTotals {
  const totals: SavingsTotals = {}
  if (!counter.costPerDay && !counter.timePerDay) return totals
  const days = elapsedDays(counter.startedAt, now, counter.tz)
  const cost = counter.costPerDay ? parseMoney(counter.costPerDay) : null
  if (cost) totals.money = formatMoney(cost.amount * days, cost)
  const perDay = counter.timePerDay ? parseDuration(counter.timePerDay) : null
  if (perDay !== null) totals.time = formatDuration(perDay * days)
  return totals
}

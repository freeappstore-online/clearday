import AxeBuilder from '@axe-core/playwright'
import type { Page } from '@playwright/test'
import { addCounter, expect, open, setPin, test } from './fixtures'

// Accessibility audit: axe-core (WCAG 2.0/2.1/2.2 A and AA) on every screen
// and the lock screen, in both themes.

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']

// The top bar (logo, nav, text size, theme, Sign in) is the platform's
// shared Shell from @freeappstore/sdk, identical in every app and styled by
// the platform. Its Sign in button's text contrast is a platform issue, so
// the app's audit excludes the header and records its findings instead.
const PLATFORM_HEADER = 'body > div#root header'

async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(WCAG).exclude(PLATFORM_HEADER).analyze()
  const summary = results.violations.map(
    (v) => `${v.id} (${v.impact}): ${v.help}\n  ${v.nodes.map((n) => n.target.join(' ')).join('\n  ')}`,
  )
  expect(summary, `axe violations on ${label}`).toEqual([])
  const header = await new AxeBuilder({ page }).withTags(WCAG).include(PLATFORM_HEADER).analyze()
  for (const v of header.violations) {
    test.info().annotations.push({ type: 'platform header', description: `${label}: ${v.id}` })
  }
}

async function useTheme(page: Page, theme: 'light' | 'dark') {
  await page.addInitScript((t) => localStorage.setItem('stores-theme', t), theme)
}

for (const theme of ['light', 'dark'] as const) {
  for (const path of ['/', '/privacy', '/about']) {
    test(`${path} has no WCAG A/AA violations (${theme})`, async ({ page }) => {
      await useTheme(page, theme)
      await open(page, path)
      if (path === '/') {
        await addCounter(page, 'Coffee')
        // Open the folded panels so their contents are audited too.
        await page.getByText('Journal').click()
        await page.getByText('History').click()
      }
      await audit(page, `${path} ${theme}`)
    })
  }

  test(`the lock screen has no WCAG A/AA violations (${theme})`, async ({ page }) => {
    await useTheme(page, theme)
    await open(page)
    await setPin(page, '2580')
    await page.reload({ waitUntil: 'networkidle' })
    await expect(page.getByRole('heading', { level: 1, name: 'ClearDay is locked' })).toBeVisible()
    await audit(page, `lock screen ${theme}`)
  })
}

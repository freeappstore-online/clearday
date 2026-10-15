// Shared e2e setup.
//
// - Requests leaving localhost are blocked, so runs never depend on (or
//   touch) the live platform API or analytics. Every host the page tries to
//   reach is still recorded in `hosts`.
// - Any uncaught page error fails the test.

import { test as base, expect, type Page } from '@playwright/test'

export const test = base.extend<{ pageErrors: string[]; hosts: Set<string> }>({
  hosts: async ({ context }, use) => {
    const hosts = new Set<string>()
    await context.route(
      (url) => url.protocol.startsWith('http') && url.hostname !== 'localhost',
      (route) => {
        hosts.add(new URL(route.request().url()).hostname)
        return route.abort()
      },
    )
    await use(hosts)
  },
  pageErrors: [
    async ({ page, hosts }, use) => {
      void hosts // install the request blocker for every test
      const errors: string[] = []
      page.on('pageerror', (e) => errors.push(e.message))
      await use(errors)
      expect(errors, 'uncaught page errors').toEqual([])
    },
    { auto: true },
  ],
})

export { expect }

/** Open a screen and wait for the app to settle. */
export async function open(page: Page, path = '/') {
  await page.goto(path, { waitUntil: 'networkidle' })
}

/** Go to another screen through the app's own nav. On phones the nav sits behind the Menu button. */
export async function navTo(page: Page, name: 'Counters' | 'Privacy' | 'About') {
  const nav = page.getByRole('navigation', { name: 'Main' })
  const link = nav.getByRole('link', { name, exact: true })
  if (!(await link.isVisible())) await nav.getByRole('button', { name: 'Menu' }).click()
  await link.click()
  await expect(page.getByRole('heading', { level: 1, name })).toBeVisible()
}

/** A datetime-local value `days` days before now, in the browser's zone. */
function daysAgo(days: number) {
  const d = new Date(Date.now() - days * 86_400_000)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Start a counter through the form, `days` days ago. */
export async function addCounter(page: Page, name: string, days = 10) {
  const start = page.getByRole('button', { name: /^(Start a counter|Add another counter)$/ })
  await start.click()
  await page.getByLabel('What did you quit?').selectOption('custom')
  await page.getByLabel(/^Name/).fill(name)
  await page.getByLabel('When did you quit?').fill(daysAgo(days))
  await page.getByRole('button', { name: 'Start counting' }).click()
  await expect(page.getByRole('heading', { level: 2, name })).toBeVisible()
}

/** The big day count on a counter's card. */
export const dayCount = (page: Page, name: string) =>
  page
    .getByRole('listitem')
    .filter({ has: page.getByRole('heading', { level: 2, name }) })
    .locator('p.display-font')

/** Set a PIN on the Privacy screen. */
export async function setPin(page: Page, pin: string) {
  await navTo(page, 'Privacy')
  await page.getByRole('button', { name: 'Set a PIN' }).click()
  await page.getByLabel('PIN', { exact: true }).fill(pin)
  await page.getByLabel('Enter it again').fill(pin)
  await page.getByLabel(/can't be recovered/).check()
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(page.getByRole('status').filter({ hasText: 'PIN set' })).toBeVisible()
}

/** Words that would amount to a health or medical claim in ClearDay's own copy. */
export const MEDICAL =
  /\b(health(ier)?|heal(s|ing)?|lungs?|liver|heart|blood|brain|body|risks?|disease|cancer|cures?|medic(al|ine)|symptoms?|withdrawal|detox|recovery|recovering|nicotine|toxins?|immune)\b/i

import { addCounter, dayCount, expect, open, test } from './fixtures'

test('a counter survives a reload with the right elapsed time', async ({ page }) => {
  await open(page)
  await expect(page.getByText('No counters yet')).toBeVisible()
  await addCounter(page, 'Cigarettes', 10)
  await expect(dayCount(page, 'Cigarettes')).toHaveText('10 days')
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 2, name: 'Cigarettes' })).toBeVisible()
  await expect(dayCount(page, 'Cigarettes')).toHaveText('10 days')
})

test('a slip starts a fresh run and keeps the longest streak', async ({ page }) => {
  await open(page)
  await addCounter(page, 'Wine', 9)
  await page.getByRole('button', { name: /I slipped/ }).click()
  await expect(page.getByRole('dialog')).toContainText('Your longest streak, earlier runs, calendar and notes all stay')
  await page.getByRole('button', { name: 'Start a fresh run', exact: true }).click()
  await expect(dayCount(page, 'Wine')).toHaveText('0 days')
  await expect(page.getByText(/Slips happen.*Your longest run is 9 days/)).toBeVisible()
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByText('History').click()
  await expect(page.getByText(/Longest run: 9 days/)).toBeVisible()
})

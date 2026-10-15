import { readFileSync } from 'node:fs'
import { addCounter, expect, MEDICAL, navTo, open, test } from './fixtures'

// The privacy note, the help link, and what the app talks to. The live
// host's edge adds Cloudflare Web Analytics; the app itself must only ever
// talk to the FreeAppStore platform.

const ALLOWED_HOSTS = new Set(['api.freeappstore.online'])

test('the privacy note is visible and says what is stored and collected', async ({ page }) => {
  await open(page)
  await page.getByRole('link', { name: 'Privacy, PIN lock and backup' }).click()
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
  const note = page.getByRole('region', { name: 'Your data stays on this device' })
  await expect(note).toBeVisible()
  await expect(note).toContainText('stored only in this browser on this device')
  await expect(note).toContainText('No account is needed')
  await expect(note).toContainText('without cookies')
  await expect(note).toContainText('Cloudflare Web Analytics')
  await expect(note).toContainText('static.cloudflareinsights.com')
  await expect(note).toContainText('IP address')
  await expect(note).toContainText('Your counters and journal are never included')
})

test('the help link is a general directory and is never loaded by the app', async ({ page, hosts }) => {
  await open(page, '/privacy')
  const support = page.getByRole('region', { name: 'Support' })
  const link = support.getByRole('link', { name: 'Find a helpline in your country' })
  await expect(link).toHaveAttribute('href', 'https://findahelpline.com/')
  await expect(link).toHaveAttribute('target', '_blank')
  await expect(link).toHaveAttribute('rel', /noopener/)
  await expect(support).toContainText("doesn't recommend a particular one")
  expect(hosts.has('findahelpline.com')).toBe(false)
})

test('the app contacts only the FreeAppStore platform, and never sends counter data', async ({ page, hosts }) => {
  const bodies: string[] = []
  page.on('request', (r) => {
    if (new URL(r.url()).hostname !== 'localhost') bodies.push(r.postData() ?? '')
  })
  await open(page)
  await addCounter(page, 'Late-night snacks')
  await page.getByText('Journal').click()
  await page.getByLabel('Why I quit').fill('Sleeping through the night')
  await page.getByLabel("Today's note").fill('A quiet evening')
  await page.getByLabel("Today's note").press('Enter')
  await navTo(page, 'Privacy')
  await navTo(page, 'About')
  await navTo(page, 'Counters')
  expect([...hosts].filter((h) => !ALLOWED_HOSTS.has(h))).toEqual([])
  for (const body of bodies) {
    expect(body).not.toContain('Late-night snacks')
    expect(body).not.toContain('A quiet evening')
  }
})

test('no screen makes a medical claim', async ({ page }) => {
  await open(page)
  await addCounter(page, 'Soda')
  for (const name of ['Counters', 'Privacy', 'About'] as const) {
    await navTo(page, name)
    const text = await page.locator('main').innerText()
    expect(text).not.toMatch(MEDICAL)
  }
})

test('launch copy is the same everywhere and nothing says "coming soon"', async ({ page }) => {
  const line = 'Track the days since you quit any habit. Calm, private, offline.'
  const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
  const manifest = JSON.parse(readFileSync('web/public/manifest.json', 'utf8'))
  expect(pkg.description).toBe(line)
  expect(manifest.description).toBe(line)
  await open(page)
  await expect(page.locator('meta[name="description"]')).toHaveAttribute('content', line)
  for (const path of ['/', '/privacy', '/about']) {
    await open(page, path)
    await expect(page.locator('body')).not.toContainText(/coming soon/i)
  }
})

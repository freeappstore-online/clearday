// Live launch check against the deployed app (default
// https://clearday.freeappstore.online), in Chromium at phone width (Pixel 7),
// in light and dark themes, with the clock in New York time. Unlike the e2e
// suite this hits the real host, service worker and all.
//
//   node scripts/live-check.mjs [url]       (or: pnpm live-check)
//
// Covers: a DST edge (a "1 day" that is 23 hours long across spring-forward),
// the milestone celebration, relapse + journal, export / erase / import,
// the PIN lock, offline after install, the privacy note and help link, and
// no "coming soon" or medical wording. Analytics requests are blocked (and
// listed) so a check run doesn't count as page views.
//
// Prints a JSON report and saves screenshots to live-check-out/. Exits 1 if
// any check fails.

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { chromium, devices } from 'playwright'

const URL_BASE = process.argv[2] ?? 'https://clearday.freeappstore.online'
const OUT = 'live-check-out'
mkdirSync(OUT, { recursive: true })

const MEDICAL =
  /\b(health(ier)?|heal(s|ing)?|lungs?|liver|heart|blood|brain|body|risks?|disease|cancer|cures?|medic(al|ine)|symptoms?|withdrawal|detox|recovery|recovering|nicotine|toxins?|immune)\b/i
// Just before noon on the day New York springs forward (2026-03-08, 02:00 EST -> 03:00 EDT).
const DST_NOW = new Date('2026-03-08T11:58:00-04:00')

const results = []
let failed = 0
function check(theme, name, ok, detail = '') {
  results.push({ theme, name, ok, ...(detail ? { detail } : {}) })
  if (!ok) failed++
}

let current = null

async function step(theme, name, fn) {
  try {
    const detail = await fn()
    check(theme, name, true, detail ?? '')
  } catch (e) {
    check(theme, name, false, String(e?.message ?? e).split('\n')[0])
    const file = `${OUT}/${theme}-FAILED-${name.replace(/\W+/g, '-')}.png`
    await current?.screenshot({ path: file }).catch(() => {})
  }
}

function expectEq(actual, expected, what) {
  if (actual !== expected) throw new Error(`${what}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`)
  return `${what}: ${JSON.stringify(actual)}`
}

const card = (page, name) => page.getByRole('listitem').filter({ has: page.getByRole('heading', { level: 2, name }) })
const dayCount = (page, name) => card(page, name).locator('p.display-font').innerText()

async function navTo(page, name) {
  const nav = page.getByRole('navigation', { name: 'Main' })
  const link = nav.getByRole('link', { name, exact: true })
  if (!(await link.isVisible())) await nav.getByRole('button', { name: 'Menu' }).click()
  await link.click()
  await page.getByRole('heading', { level: 1, name }).waitFor()
}

async function run(browser, theme) {
  const context = await browser.newContext({
    ...devices['Pixel 7'],
    timezoneId: 'America/New_York',
    colorScheme: theme,
    acceptDownloads: true,
  })
  const blocked = new Set()
  await context.route(
    (url) => url.hostname === 'static.cloudflareinsights.com' || url.pathname.startsWith('/v1/analytics'),
    (route) => {
      const u = new URL(route.request().url())
      blocked.add(u.hostname + u.pathname.replace(/\/v4.*$/, '/…'))
      return route.abort()
    },
  )
  const errors = []
  const page = await context.newPage()
  current = page
  page.on('pageerror', (e) => errors.push(e.message))
  await page.addInitScript((t) => localStorage.setItem('stores-theme', t), theme)
  await page.clock.install({ time: DST_NOW })
  const shot = (name) => page.screenshot({ path: `${OUT}/${theme}-${name}.png` })

  await page.goto(URL_BASE, { waitUntil: 'networkidle' })

  await step(theme, 'theme applied', async () => {
    const applied = await page.evaluate(() => document.documentElement.dataset.theme ?? 'light')
    return expectEq(applied, theme, 'data-theme')
  })
  await step(theme, 'no "coming soon" anywhere', async () => {
    for (const path of ['/', '/privacy', '/about']) {
      await page.goto(URL_BASE + path, { waitUntil: 'networkidle' })
      if (/coming soon/i.test(await page.locator('body').innerText())) throw new Error(`found on ${path}`)
    }
    const meta = await page.locator('meta[name="description"]').getAttribute('content')
    return `meta description: ${JSON.stringify(meta)}`
  })

  await step(theme, 'privacy note and help link', async () => {
    await page.goto(URL_BASE + '/privacy', { waitUntil: 'networkidle' })
    const note = page.getByRole('region', { name: 'Your data stays on this device' })
    const text = await note.innerText()
    for (const s of ['stored only in this browser', 'No account is needed', 'Cloudflare Web Analytics', 'never included']) {
      if (!text.includes(s)) throw new Error(`privacy note lacks "${s}"`)
    }
    const link = page.getByRole('region', { name: 'Support' }).getByRole('link', { name: 'Find a helpline in your country' })
    const href = await link.getAttribute('href')
    await shot('privacy')
    return `help link ${href}, target ${await link.getAttribute('target')}`
  })

  await page.goto(URL_BASE, { waitUntil: 'networkidle' })
  await shot('empty')

  await step(theme, 'DST edge: 1 day across spring-forward is 23 real hours', async () => {
    await page.getByRole('button', { name: 'Start a counter' }).click()
    await page.getByLabel('What did you quit?').selectOption('custom')
    await page.getByLabel(/^Name/).fill('Late-night snacks')
    await page.getByLabel('When did you quit?').fill('2026-03-07T12:00')
    await page.getByLabel('Cost per day').fill('$4.50')
    await page.getByRole('button', { name: 'Start counting' }).click()
    const before = await dayCount(page, 'Late-night snacks')
    const rest = await card(page, 'Late-night snacks').locator('p.tabular-nums').nth(1).innerText()
    if (before !== '0 days' || !rest.startsWith('22h 58m')) throw new Error(`before noon: ${before} ${rest}`)
    await page.clock.fastForward('00:02:00')
    await page.waitForTimeout(1500)
    const after = await dayCount(page, 'Late-night snacks')
    if (after !== '1 day') throw new Error(`at noon EDT: ${after}`)
    return `11:58 EDT: "${before} ${rest}" -> 12:00 EDT: "${after}" (counter started 12:00 EST the day before)`
  })

  await step(theme, 'milestone celebration for 1 day', async () => {
    const status = page.getByRole('status').filter({ hasText: "You've reached 1 day!" })
    await status.waitFor({ timeout: 5000 })
    const motion = await page.locator('[data-motion]').getAttribute('data-motion')
    await shot('celebration')
    await status.getByRole('button', { name: 'Thanks' }).click()
    return `celebration shown (${motion})`
  })

  await step(theme, 'money saved after 1 day', async () => {
    const money = await card(page, 'Late-night snacks').getByText(/^\$\d/).innerText()
    if (!money.startsWith('$4.5')) throw new Error(`money saved ${money}`)
    return `money saved ${money}`
  })

  await step(theme, 'journal note and "why" survive a reload', async () => {
    const c = card(page, 'Late-night snacks')
    await c.getByText('Journal').click()
    await c.getByLabel('Why I quit').fill('Sleeping through the night')
    await c.getByLabel('Why I quit').press('Enter')
    await c.getByLabel("Today's note").fill('Tea instead of chips')
    await c.getByLabel("Today's note").press('Enter')
    await page.reload({ waitUntil: 'networkidle' })
    const c2 = card(page, 'Late-night snacks')
    await c2.getByText('Journal').click()
    const why = await c2.getByLabel('Why I quit').inputValue()
    const note = await c2.getByLabel("Today's note").inputValue()
    expectEq(why, 'Sleeping through the night', 'why')
    return expectEq(note, 'Tea instead of chips', 'note')
  })

  await step(theme, 'relapse keeps history and shows a kind note', async () => {
    await page.clock.fastForward('26:00:00') // a little over a day later: 2 days clear
    await page.waitForTimeout(1500)
    const beforeSlip = await dayCount(page, 'Late-night snacks')
    await card(page, 'Late-night snacks').getByRole('button', { name: /I slipped/ }).click()
    await page.getByRole('button', { name: 'Start a fresh run', exact: true }).click()
    const after = await dayCount(page, 'Late-night snacks')
    const c = card(page, 'Late-night snacks')
    const kind = await c.locator('[data-hard-day]').innerText()
    if (!kind.includes('Slips happen') || !kind.includes('Sleeping through the night')) throw new Error(`note: ${kind}`)
    if (MEDICAL.test(kind.replace('Sleeping through the night', ''))) throw new Error('medical wording in slip note')
    await page.reload({ waitUntil: 'networkidle' })
    const c2 = card(page, 'Late-night snacks')
    await c2.getByText('History').click()
    const longest = await c2.getByText(/Longest run:/).innerText()
    const earlier = await c2.getByText(/: 2 days$/).innerText()
    await shot('relapse')
    return `${beforeSlip} -> ${after}; "${longest}"; earlier run "${earlier}"`
  })

  await step(theme, 'no medical wording on any screen', async () => {
    for (const name of ['Counters', 'Privacy', 'About']) {
      await navTo(page, name)
      const m = (await page.locator('main').innerText()).replace('Sleeping through the night', '').match(MEDICAL)
      if (m) throw new Error(`"${m[0]}" on ${name}`)
    }
  })

  let file
  await step(theme, 'export, erase and import restore everything', async () => {
    await navTo(page, 'Privacy')
    const backup = page.getByRole('region', { name: 'Backup' })
    const [download] = await Promise.all([page.waitForEvent('download'), backup.getByRole('button', { name: 'Export backup' }).click()])
    file = `${OUT}/${theme}-${download.suggestedFilename()}`
    await download.saveAs(file)
    const data = JSON.parse(readFileSync(file, 'utf8'))
    if (data.format !== 'clearday-backup' || data.counters.length !== 1) throw new Error('unexpected backup contents')
    await backup.getByRole('button', { name: 'Erase all ClearDay data on this device' }).click()
    await page.getByRole('button', { name: 'Erase everything' }).click()
    await page.getByText('No counters yet').waitFor()
    await navTo(page, 'Privacy')
    await page.getByLabel('Backup file to restore').setInputFiles(file)
    await page.getByRole('button', { name: 'Restore', exact: true }).click()
    await navTo(page, 'Counters')
    const c = card(page, 'Late-night snacks')
    await c.getByText('History').click()
    const longest = await c.getByText(/Longest run:/).innerText()
    await c.getByText('Journal').click()
    const why = await c.getByLabel('Why I quit').inputValue()
    return `${download.suggestedFilename()} (${data.counters[0].attempts.length} earlier run, ${Object.keys(data.counters[0].journal).length} note); after restore "${longest}", why "${why}"`
  })

  await step(theme, 'PIN locks on reload and hides counters', async () => {
    await navTo(page, 'Privacy')
    await page.getByRole('button', { name: 'Set a PIN' }).click()
    await page.getByLabel('PIN', { exact: true }).fill('2580')
    await page.getByLabel('Enter it again').fill('2580')
    await page.getByLabel(/can't be recovered/).check()
    await page.getByRole('button', { name: 'Save PIN' }).click()
    await page.getByRole('status').filter({ hasText: 'PIN set' }).waitFor()
    await page.reload({ waitUntil: 'networkidle' })
    await page.getByRole('heading', { level: 1, name: 'ClearDay is locked' }).waitFor()
    if ((await page.locator('body').innerText()).includes('Late-night snacks')) throw new Error('counter visible while locked')
    await shot('locked')
    await page.getByLabel('PIN').fill('1111')
    await page.getByRole('button', { name: 'Unlock' }).click()
    // Wait for the wrong PIN to be checked (it clears the field) before typing the right one.
    const status = page.locator('#pin-status').filter({ hasText: "didn't match" })
    await status.waitFor()
    const wrong = await status.innerText()
    await page.getByLabel('PIN').fill('2580')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await page.getByRole('heading', { level: 1, name: 'Privacy' }).waitFor()
    return `locked, wrong PIN -> "${wrong}", right PIN unlocks`
  })

  await step(theme, 'works offline once installed', async () => {
    await page.evaluate(() => navigator.serviceWorker.ready)
    await page.reload({ waitUntil: 'networkidle' })
    await context.setOffline(true)
    await page.goto(URL_BASE + '/', { waitUntil: 'domcontentloaded' })
    await page.getByRole('heading', { level: 1, name: 'ClearDay is locked' }).waitFor()
    await page.getByLabel('PIN').fill('2580')
    await page.getByRole('button', { name: 'Unlock' }).click()
    await page.getByRole('heading', { level: 2, name: 'Late-night snacks' }).waitFor()
    const days = await dayCount(page, 'Late-night snacks')
    await shot('offline')
    await context.setOffline(false)
    return `offline reload: unlocked, counter shows "${days}"`
  })

  await step(theme, 'no horizontal scroll at phone width', async () => {
    const w = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth])
    if (w[0] > w[1]) throw new Error(`scrollWidth ${w[0]} > ${w[1]}`)
    return `scrollWidth ${w[0]} <= ${w[1]}`
  })

  check(theme, 'no uncaught page errors', errors.length === 0, errors.join(' | '))
  results.push({ theme, name: 'analytics requests blocked during the check', ok: true, detail: [...blocked].join(', ') })
  await context.close()
}

const browser = await chromium.launch()
for (const theme of ['light', 'dark']) await run(browser, theme)
await browser.close()

const report = { url: URL_BASE, viewport: devices['Pixel 7'].viewport, timezone: 'America/New_York', failed, results }
writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 2))
console.log(JSON.stringify(report, null, 2))
process.exit(failed ? 1 : 0)

import { readFileSync } from 'node:fs'
import { addCounter, dayCount, expect, navTo, open, setPin, test } from './fixtures'

test('export saves every counter with its journal as one JSON file, and import restores it', async ({ page }, info) => {
  await open(page)
  await addCounter(page, 'Energy drinks', 12)
  await page.getByText('Journal').click()
  await page.getByLabel('Why I quit').fill('Calmer afternoons')
  await page.getByLabel('Why I quit').press('Enter')
  await page.getByLabel("Today's note").fill('Made tea instead')
  await page.getByLabel("Today's note").press('Enter')
  await addCounter(page, 'Doomscrolling', 3)
  await setPin(page, '2580')

  const backup = page.getByRole('region', { name: 'Backup' })
  const [download] = await Promise.all([
    page.waitForEvent('download'),
    backup.getByRole('button', { name: 'Export backup' }).click(),
  ])
  expect(download.suggestedFilename()).toMatch(/^clearday-backup-\d{4}-\d{2}-\d{2}\.json$/)
  const file = info.outputPath('backup.json')
  await download.saveAs(file)
  const text = readFileSync(file, 'utf8')
  const data = JSON.parse(text)
  expect(data).toMatchObject({ format: 'clearday-backup', version: 1 })
  expect(data.counters.map((c: { name: string }) => c.name)).toEqual(['Energy drinks', 'Doomscrolling'])
  expect(data.counters[0].why).toBe('Calmer afternoons')
  expect(Object.values(data.counters[0].journal)).toEqual(['Made tea instead'])
  // The PIN never goes into a backup.
  expect(text).not.toMatch(/pin/i)

  // Erase everything (which also removes the PIN), then restore from the file.
  await backup.getByRole('button', { name: 'Erase all ClearDay data on this device' }).click()
  await page.getByRole('button', { name: 'Erase everything' }).click()
  await expect(page.getByText('No counters yet')).toBeVisible()

  await navTo(page, 'Privacy')
  await page.getByLabel('Backup file to restore').setInputFiles(file)
  await expect(page.getByRole('dialog')).toContainText('replaces the 0 counters on this device with the 2 counters')
  await page.getByRole('button', { name: 'Restore', exact: true }).click()
  await expect(backup.getByRole('status')).toHaveText('Restored 2 counters.')

  await page.reload({ waitUntil: 'networkidle' })
  await navTo(page, 'Counters')
  await expect(page.getByRole('heading', { level: 2, name: 'Energy drinks' })).toBeVisible()
  await expect(page.getByRole('heading', { level: 2, name: 'Doomscrolling' })).toBeVisible()
  await expect(dayCount(page, 'Energy drinks')).toHaveText('12 days')
  const card = page.getByRole('listitem').filter({ has: page.getByRole('heading', { name: 'Energy drinks' }) })
  await card.getByText('Journal').click()
  await expect(card.getByLabel('Why I quit')).toHaveValue('Calmer afternoons')
  await expect(card.getByLabel("Today's note")).toHaveValue('Made tea instead')
})

test('a file that is not a ClearDay backup is refused and changes nothing', async ({ page }) => {
  await open(page)
  await addCounter(page, 'Takeaway')
  await navTo(page, 'Privacy')
  const input = page.getByLabel('Backup file to restore')
  const backup = page.getByRole('region', { name: 'Backup' })

  await input.setInputFiles({ name: 'notes.json', mimeType: 'application/json', buffer: Buffer.from('{"hello":1}') })
  await expect(backup.getByRole('alert')).toHaveText("That file isn't a ClearDay backup.")
  await input.setInputFiles({ name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from('{oops') })
  await expect(backup.getByRole('alert')).toContainText("isn't valid JSON")
  const damaged = { format: 'clearday-backup', version: 1, counters: [{ id: 'x' }], celebrated: {} }
  await input.setInputFiles({
    name: 'damaged.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(damaged)),
  })
  await expect(backup.getByRole('alert')).toContainText('damaged, so nothing was restored')
  await expect(page.getByRole('dialog')).toBeHidden()

  await navTo(page, 'Counters')
  await expect(page.getByRole('heading', { level: 2, name: 'Takeaway' })).toBeVisible()
})

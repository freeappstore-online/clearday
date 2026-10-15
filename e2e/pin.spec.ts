import type { Page } from '@playwright/test'
import { addCounter, expect, navTo, open, setPin, test } from './fixtures'

const unlock = (page: Page) => page.getByRole('button', { name: 'Unlock' })
const lockedHeading = (page: Page) => page.getByRole('heading', { level: 1, name: 'ClearDay is locked' })

test('setting a PIN warns there is no recovery and needs it confirmed', async ({ page }) => {
  await open(page, '/privacy')
  const section = page.getByRole('region', { name: 'PIN lock' })
  await expect(section).toContainText('There is no way to recover a forgotten PIN')
  await section.getByRole('button', { name: 'Set a PIN' }).click()
  await page.getByLabel('PIN', { exact: true }).fill('1234')
  await page.getByLabel('Enter it again').fill('4321')
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(section.getByRole('alert')).toHaveText("The two PINs don't match.")
  await page.getByLabel('Enter it again').fill('1234')
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(section.getByRole('alert')).toContainText('can’t be recovered')
  await page.getByLabel(/can't be recovered/).check()
  await page.getByRole('button', { name: 'Save PIN' }).click()
  await expect(section.getByRole('status')).toContainText('PIN set')
  // Only a salted hash is stored, never the PIN itself.
  const stored = await page.evaluate(() => localStorage.getItem('clearday:pin:v1'))
  expect(stored).not.toContain('1234')
  expect(JSON.parse(stored!)).toMatchObject({ salt: expect.any(String), hash: expect.any(String) })
})

test('a PIN locks the app on reload and hides the counters until it is entered', async ({ page }) => {
  await open(page)
  await addCounter(page, 'Gambling apps')
  await setPin(page, '2580')
  await page.reload({ waitUntil: 'networkidle' })

  await expect(lockedHeading(page)).toBeVisible()
  await expect(page.locator('body')).not.toContainText('Gambling apps')
  // Other screens stay locked too.
  await page.goto('/about', { waitUntil: 'networkidle' })
  await expect(lockedHeading(page)).toBeVisible()

  await page.getByLabel('PIN').fill('1111')
  await unlock(page).click()
  await expect(page.locator('#pin-status')).toHaveText("That PIN didn't match. Try again.")
  await page.getByLabel('PIN').fill('2580')
  await unlock(page).click()
  await expect(page.getByRole('heading', { level: 1, name: 'About' })).toBeVisible()
  await navTo(page, 'Counters')
  await expect(page.getByRole('heading', { level: 2, name: 'Gambling apps' })).toBeVisible()
})

test('five wrong guesses pause the PIN prompt, even across a reload', async ({ page }) => {
  await open(page)
  await setPin(page, '2580')
  await page.reload({ waitUntil: 'networkidle' })
  for (let i = 0; i < 5; i++) {
    await page.getByLabel('PIN').fill('0000')
    await unlock(page).click()
    if (i < 4) await expect(page.locator('#pin-status')).toHaveText("That PIN didn't match. Try again.")
  }
  await expect(page.locator('#pin-status')).toContainText('Too many tries')
  await expect(page.getByLabel('PIN')).toBeDisabled()
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.locator('#pin-status')).toContainText('Too many tries')
})

test('removing the PIN needs the current one', async ({ page }) => {
  await open(page)
  await setPin(page, '2580')
  const section = page.getByRole('region', { name: 'PIN lock' })
  await section.getByRole('button', { name: 'Remove PIN' }).click()
  await page.getByLabel('Current PIN').fill('1111')
  await section.getByRole('button', { name: 'Remove PIN' }).click()
  await expect(section.getByRole('alert')).toHaveText("That PIN didn't match.")
  await page.getByLabel('Current PIN').fill('2580')
  await section.getByRole('button', { name: 'Remove PIN' }).click()
  await expect(section.getByRole('status')).toContainText('PIN removed')
  await page.reload({ waitUntil: 'networkidle' })
  await expect(page.getByRole('heading', { level: 1, name: 'Privacy' })).toBeVisible()
})

test('a forgotten PIN can only be cleared by erasing ClearDay data', async ({ page }) => {
  await open(page)
  await addCounter(page, 'Late-night scrolling')
  await setPin(page, '2580')
  await page.reload({ waitUntil: 'networkidle' })
  await page.getByRole('button', { name: 'Forgot your PIN?' }).click()
  await expect(page.locator('main')).toContainText("There's no way to recover a forgotten PIN")
  await page.getByRole('button', { name: 'Erase ClearDay data' }).click()
  await page.getByRole('button', { name: 'Erase everything' }).click()
  await expect(lockedHeading(page)).toBeHidden()
  await navTo(page, 'Counters')
  await expect(page.getByText('No counters yet')).toBeVisible()
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.startsWith('clearday:')))).toEqual([])
})

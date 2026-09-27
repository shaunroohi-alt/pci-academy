import { expect, type Page } from '@playwright/test'

export async function onboard(page: Page, opts: { longitudinal?: boolean } = {}) {
  await page.goto('onboarding/')
  await page.getByRole('button', { name: 'Continue' }).click()
  await page.getByRole('button', { name: 'Continue' }).click()
  if (opts.longitudinal) await page.getByRole('switch', { name: /earlier material/ }).click()
  await page.getByRole('button', { name: 'Enter PCI' }).click()
  await expect(page).toHaveURL(/\/today\/$/)
}

export const SAMPLE =
  'My manager moved the deadline to Friday at the meeting this morning. I felt ignored because she didn’t even look at me when I spoke. She obviously doesn’t care about my work. I said I would talk to her after lunch but I didn’t. I was furious and embarrassed. What should I do?'

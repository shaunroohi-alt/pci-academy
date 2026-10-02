import { expect, test } from '@playwright/test'

const NAV = ['Art of Being', 'Library', 'Method', 'Academy', 'Practitioners', 'Boundary']

test('mobile public nav: Menu opens and lists the six nav items and Enter', async ({ page }) => {
  await page.goto('./')
  // The desktop nav is hidden at this width; the menu button stands in for it.
  await expect(page.getByRole('navigation', { name: 'Primary' })).toHaveCount(0)
  const button = page.getByRole('button', { name: 'Menu' })
  await expect(button).toHaveAttribute('aria-expanded', 'false')
  await button.click()
  await expect(page.getByRole('button', { name: 'Close' })).toHaveAttribute('aria-expanded', 'true')
  const menu = page.getByRole('navigation', { name: 'Menu' })
  await expect(menu).toBeVisible()
  for (const name of NAV) await expect(menu.getByRole('link', { name, exact: true })).toBeVisible()
  await expect(menu.getByRole('link', { name: 'Enter', exact: true })).toBeVisible()
  await expect(menu.getByRole('link')).toHaveCount(7)
  // No member tools in the public nav.
  for (const name of ['Observe', 'Journal', 'On the Contrary', 'Today', 'Ledger']) await expect(menu.getByRole('link', { name, exact: true })).toHaveCount(0)
  await menu.getByRole('link', { name: 'Method', exact: true }).click()
  await expect(page).toHaveURL(/method\/$/)
  await expect(page.getByRole('heading', { level: 1, name: 'Seven operations. Then stop.' })).toBeVisible()
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
})

test('mobile member toolbar on /observe/: the four tools, Account and a way back to the site', async ({ page }) => {
  await page.goto('observe/')
  const tools = page.getByRole('navigation', { name: 'Tools' })
  await expect(tools).toBeVisible()
  for (const name of ['Observe', 'Journal', 'On the Contrary', 'Library', 'Account']) await expect(tools.getByRole('link', { name, exact: true })).toBeVisible()
  await expect(tools.getByRole('link')).toHaveCount(5)
  await expect(page.getByRole('link', { name: '← Site' })).toBeVisible()
  // The public nav and the menu button are not part of the member chrome.
  await expect(page.getByRole('button', { name: 'Menu' })).toHaveCount(0)
  await expect(page.getByText('Education, not therapy. Not medical, clinical, or crisis care.')).toBeVisible()
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
})

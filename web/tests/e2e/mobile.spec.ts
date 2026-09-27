import { expect, test } from '@playwright/test'

test('mobile bottom navigation: Today, Observe, Journal, Library, More', async ({ page }) => {
  await page.goto('./')
  const nav = page.getByRole('navigation', { name: 'Primary' }).last()
  for (const name of ['Today', 'Observe', 'Journal', 'Library', 'More']) await expect(nav.getByText(name, { exact: true })).toBeVisible()
  await nav.getByRole('button', { name: 'More' }).click()
  await page.getByRole('dialog', { name: 'More' }).getByRole('link', { name: /On the Contrary/ }).click()
  await expect(page).toHaveURL(/contrary/)
  const width = await page.evaluate(() => document.documentElement.scrollWidth)
  expect(width).toBeLessThanOrEqual(page.viewportSize()!.width + 1)
})

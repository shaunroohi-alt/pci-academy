import { expect, test } from '@playwright/test'
import { onboard } from './helpers'

test.describe('PWA and offline (R5)', () => {
  test('is installable', async ({ page, request }) => {
    await page.goto('./')
    const href = await page.locator('link[rel="manifest"]').getAttribute('href')
    expect(href).toBe('/pci-academy/manifest.webmanifest')
    const res = await request.get('manifest.webmanifest')
    const m = await res.json()
    expect(m.start_url).toBe('/pci-academy/today/')
    expect(m.display).toBe('standalone')
    expect(m.icons.some((i: { sizes: string }) => i.sizes === '512x512')).toBe(true)
  })

  test('the reader and journal work offline, and the status is explicit', async ({ page, context }) => {
    await onboard(page)
    await page.goto('library/seven-operations/')
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready
      return reg.active?.state
    })
    // Wait for the precache to finish installing.
    await page.waitForFunction(async () => (await caches.keys()).some((k) => k.startsWith('pci-')) && !!navigator.serviceWorker.controller, null, { timeout: 30_000 }).catch(async () => {
      await page.reload()
      await page.waitForFunction(() => !!navigator.serviceWorker.controller, null, { timeout: 30_000 })
    })
    await context.setOffline(true)
    await page.goto('library/epistemic-classes/')
    await expect(page.getByRole('heading', { level: 1, name: 'Epistemic Classes and Confidence' })).toBeVisible()
    await expect(page.getByText('Offline — saving on this device').first()).toBeVisible()
    await page.goto('reflection/')
    await page.getByLabel('Journal entry').fill('Written without a connection.')
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    await context.setOffline(false)
    await page.reload()
    await expect(page.getByLabel('Journal entry')).toHaveValue('Written without a connection.')
  })
})

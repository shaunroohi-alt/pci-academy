import { expect, test } from '@playwright/test'
import { onboard, SAMPLE } from './helpers'

test.describe('Onboarding (R1)', () => {
  test('three screens explain the STOP boundary and default privacy', async ({ page }) => {
    await page.goto('onboarding/')
    await expect(page.getByRole('heading', { name: 'PCI makes structure visible.' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByRole('heading', { name: 'Seven questions, then a report.' })).toBeVisible()
    await page.getByRole('button', { name: 'Continue' }).click()
    await expect(page.getByText('PCI boundary reached: the report ends at observation. No prescription is generated.')).toBeVisible()
    await expect(page.getByRole('switch', { name: /earlier material/ })).toHaveAttribute('aria-checked', 'false')
    await page.getByRole('button', { name: 'Enter PCI' }).click()
    await expect(page.getByRole('heading', { name: 'Today', exact: true })).toBeVisible()
    await expect(page.getByText(/streak|score|badge/i)).toHaveCount(0)
  })
})

test.describe('Observe (R1)', () => {
  test('direct analysis produces a report that ends at the boundary', async ({ page }) => {
    await onboard(page)
    await page.goto('reflection/?tab=observe')
    await page.getByLabel('Material', { exact: true }).fill(SAMPLE)
    await page.getByRole('button', { name: 'Observe', exact: true }).click()
    await expect(page).toHaveURL(/observe\/report\/\?id=/)
    await expect(page.getByRole('heading', { name: 'What Became Visible' })).toBeVisible()
    await expect(page.getByText(/request for direction is present/)).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Epistemic Ledger' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Meta-Observational Integrity Audit' })).toBeVisible()
    await expect(page.locator('#boundary')).toContainText('No prescription is generated.')
    // Nothing prescriptive anywhere in the rendered report.
    const text = await page.locator('main').innerText()
    expect(text).not.toMatch(/\byou should\b(?! do)/i)
    expect(text).not.toMatch(/\bI recommend\b|\bnext steps\b/i)
  })

  test('guided mode walks the seven questions', async ({ page }) => {
    await onboard(page)
    await page.goto('reflection/?tab=observe')
    await page.getByRole('tab', { name: /Guided/ }).click()
    await expect(page.getByText('Question 1 of 7 · Input')).toBeVisible()
    await page.getByRole('textbox', { name: /What actually occurred/ }).fill('I cancelled the rehearsal an hour before it started.')
    await page.getByRole('button', { name: 'Next question' }).click()
    await expect(page.getByText('Question 2 of 7 · Decomposition')).toBeVisible()
    await page.getByRole('textbox', { name: /What parts of this are event/ }).fill('The event is the cancellation. The meaning I gave it is that I was not ready.')
    await page.getByRole('button', { name: 'Observe', exact: true }).click()
    await expect(page).toHaveURL(/report/)
    await expect(page.getByText('Guided', { exact: false }).first()).toBeVisible()
    await page.getByRole('button', { name: /Original input/ }).click()
    await expect(page.locator('dd', { hasText: 'The event is the cancellation.' })).toBeVisible()
  })

  test('report reopens; re-analysis creates a new version and keeps the original unchanged', async ({ page }) => {
    await onboard(page)
    await page.goto('reflection/?tab=observe')
    await page.getByLabel('Material', { exact: true }).fill('I left the party early without saying goodbye.')
    await page.getByRole('button', { name: 'Observe', exact: true }).click()
    await expect(page).toHaveURL(/report/)
    const url = page.url()
    await page.getByRole('button', { name: 'Add new information' }).click()
    await page.getByLabel('New information').fill('Later I learned the host had not noticed.')
    await page.getByRole('button', { name: 'Add to the record' }).click()
    await expect(page.getByText('New information has been added since the latest analysis.')).toBeVisible()
    await page.getByRole('button', { name: 'Re-analyse' }).click()
    await expect(page.getByRole('button', { name: /^v2 ·/ })).toBeVisible()
    await page.goto('today/')
    await page.goto(url)
    await expect(page.getByRole('button', { name: /^v1 ·/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^v2 ·/ })).toBeVisible()
    await page.getByRole('button', { name: /Original input/ }).click()
    await expect(page.locator('p.writing')).toHaveText('I left the party early without saying goodbye.')
  })

  test('an observation can be deleted', async ({ page }) => {
    await onboard(page)
    await page.goto('reflection/?tab=observe')
    await page.getByLabel('Material', { exact: true }).fill('Temporary material to delete.')
    await page.getByRole('button', { name: 'Observe', exact: true }).click()
    await expect(page).toHaveURL(/report/)
    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete observation' }).click()
    await expect(page).toHaveURL(/\/reflection\/\?tab=observe$/)
    await expect(page.getByText('Temporary material to delete.')).toHaveCount(0)
  })
})

test.describe('Journal (R1/R2)', () => {
  test('autosaves privately, survives reload, and analyses through PCI', async ({ page }) => {
    await onboard(page)
    await page.goto('reflection/')
    const editor = page.getByLabel('Journal entry')
    await editor.fill('I snapped at my brother at dinner. I was tired and I always do this when I am tired.')
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Journal entry')).toHaveValue(/snapped at my brother/)
    await page.getByRole('button', { name: 'Analyse through PCI' }).click()
    await expect(page).toHaveURL(/report/)
    await expect(page.getByRole('link', { name: /Journal, / })).toBeVisible()
  })

  test('date navigation and archive search', async ({ page }) => {
    await onboard(page)
    await page.goto('reflection/')
    await page.getByLabel('Journal entry').fill('An entry about the harbour.')
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    await page.getByRole('button', { name: 'Previous day' }).click()
    await expect(page.getByLabel('Journal entry')).toHaveValue('')
    await page.getByRole('link', { name: 'Archive' }).click()
    await page.getByLabel('Search entries').fill('harbour')
    await expect(page.getByText('An entry about the harbour.')).toBeVisible()
  })
})

test.describe('Account and privacy', () => {
  test('exports and deletes all private material', async ({ page }) => {
    await onboard(page)
    await page.goto('ledger/')
    await page.getByLabel('Entry', { exact: true }).fill('A fragment worth keeping.')
    await page.getByRole('button', { name: 'Keep' }).click()
    await page.goto('account/')
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export everything (JSON)' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^pci-export-.*\.json$/)
    await page.getByLabel('Type DELETE to confirm').fill('DELETE')
    await page.getByRole('button', { name: 'Delete all my material' }).click()
    await expect(page.getByText('All private material has been deleted.')).toBeVisible()
    await page.goto('ledger/')
    await expect(page.getByText('The Ledger is empty')).toBeVisible()
  })
})

test.describe('Reflection', () => {
  test('old Observe and Journal links open the matching Reflection tab', async ({ page }) => {
    await onboard(page)
    await page.goto('observe/')
    await expect(page).toHaveURL(/\/reflection\/\?tab=observe$/)
    await expect(page.getByLabel('Material', { exact: true })).toBeVisible()
    await page.goto('journal/?date=2026-01-05')
    await expect(page).toHaveURL(/\/reflection\/\?date=2026-01-05$/)
    await expect(page.getByLabel('Journal date')).toHaveValue('2026-01-05')
    await page.getByRole('tab', { name: 'Observe' }).click()
    await expect(page.getByRole('button', { name: 'Observe', exact: true })).toBeVisible()
  })
})

test.describe('Written report', () => {
  test('a report opens with the written observation and analysis', async ({ page }) => {
    await onboard(page)
    await page.route('**/api/reflect', (route) =>
      route.fulfill({
        json: {
          observation: 'You left the party early without saying goodbye.\n\nNothing in what you wrote says how the host saw it.',
          analysis: 'The leaving is described; its meaning is not yet given.',
          model: 'claude-test',
          violations: [],
        },
      }),
    )
    await page.goto('reflection/?tab=observe')
    await page.getByLabel('Material', { exact: true }).fill('I left the party early without saying goodbye.')
    await page.getByRole('button', { name: 'Observe', exact: true }).click()
    await expect(page).toHaveURL(/report/)
    await expect(page.getByRole('heading', { name: 'Observation', exact: true })).toBeVisible()
    await expect(page.getByText('Nothing in what you wrote says how the host saw it.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'Analysis', exact: true })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What Became Visible' })).toBeVisible()
  })

  test('without the writer, the report says so and keeps the structure', async ({ page }) => {
    await onboard(page)
    await page.route('**/api/reflect', (route) => route.fulfill({ status: 501, json: { error: 'The writer is not configured for this site yet.' } }))
    await page.goto('reflection/?tab=observe')
    await page.getByLabel('Material', { exact: true }).fill('I missed the train.')
    await page.getByRole('button', { name: 'Observe', exact: true }).click()
    await expect(page.getByText('The writer is not configured for this site yet.', { exact: false })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What Became Visible' })).toBeVisible()
  })
})

import { expect, test } from '@playwright/test'
import { enter, SAMPLE } from './helpers'

test.describe('Enter', () => {
  test('names the three tools, shows the empty-state line, and sets nothing up', async ({ page }) => {
    await enter(page)
    await expect(page.getByText('Nothing has been entered. There is no score for an empty page.')).toBeVisible()
    await expect(page.getByText(/streak|score for today|badge|level up|what to do tonight/i)).toHaveCount(0)
    await expect(page.getByRole('button', { name: /Continue|Enter PCI/ })).toHaveCount(0)
  })
})

test.describe('Observe', () => {
  test('direct analysis produces a report that ends at the boundary; questions only on request', async ({ page }) => {
    await enter(page)
    await page.goto('observe/')
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

    // The question layer is a button. No question is shown until it is pressed.
    const ask = page.getByRole('button', { name: 'Ask me questions from this material' })
    await expect(ask).toBeVisible()
    const panel = ask.locator('..')
    await expect(panel.getByRole('listitem')).toHaveCount(0)
    await ask.click()
    await expect(panel.getByRole('listitem').first()).toBeVisible()
    // The question itself (first line of each item), not the source line that quotes the person's own words.
    for (const q of await panel.locator('li > p:first-child').allInnerTexts()) {
      expect(q).not.toMatch(/\byou should\b|\byou need to\b|\byou must\b|\btonight\b/i)
    }
  })

  test('guided mode walks the seven questions', async ({ page }) => {
    await page.goto('observe/')
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
    await page.goto('observe/')
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
    await page.goto('enter/')
    await page.goto(url)
    await expect(page.getByRole('button', { name: /^v1 ·/ })).toBeVisible()
    await expect(page.getByRole('button', { name: /^v2 ·/ })).toBeVisible()
    await page.getByRole('button', { name: /Original input/ }).click()
    await expect(page.locator('p.writing')).toHaveText('I left the party early without saying goodbye.')
  })

  test('an observation can be deleted', async ({ page }) => {
    await page.goto('observe/')
    await page.getByLabel('Material', { exact: true }).fill('Temporary material to delete.')
    await page.getByRole('button', { name: 'Observe', exact: true }).click()
    await expect(page).toHaveURL(/report/)
    page.on('dialog', (d) => d.accept())
    await page.getByRole('button', { name: 'Delete observation' }).click()
    await expect(page).toHaveURL(/\/observe\/$/)
    await expect(page.getByText('Temporary material to delete.')).toHaveCount(0)
  })
})

test.describe('Journal', () => {
  test('the heading is the date; it autosaves privately, survives reload, and analyses through PCI', async ({ page }) => {
    await enter(page)
    await page.goto('journal/')
    const heading = page.getByRole('heading', { level: 1 })
    await expect(heading).toContainText(String(new Date().getFullYear()))
    await expect(heading).toContainText(/Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday/)
    // No assigned subject, no prompt, and no question layer before anything is written.
    await expect(page.getByRole('button', { name: 'Ask me questions from this material' })).toHaveCount(0)
    const editor = page.getByLabel('Journal entry')
    await editor.fill('I snapped at my brother at dinner. I was tired and I always do this when I am tired.')
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    await page.reload()
    await expect(page.getByLabel('Journal entry')).toHaveValue(/snapped at my brother/)
    await page.getByRole('button', { name: 'Analyse through PCI' }).click()
    await expect(page).toHaveURL(/report/)
    await expect(page.getByRole('link', { name: /Journal, / })).toBeVisible()
  })

  test('questions appear only after the person asks', async ({ page }) => {
    await page.goto('journal/')
    await page.getByLabel('Journal entry').fill('I said yes to the extra shift again, then resented it all evening.')
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    const ask = page.getByRole('button', { name: 'Ask me questions from this material' })
    await expect(ask).toBeVisible()
    const panel = ask.locator('..')
    await expect(panel.getByRole('listitem')).toHaveCount(0)
    await ask.click()
    await expect(panel.getByRole('listitem').first()).toBeVisible()
    // The question itself (first line of each item), not the source line that quotes the person's own words.
    for (const q of await panel.locator('li > p:first-child').allInnerTexts()) {
      expect(q).not.toMatch(/\byou should\b|\byou need to\b|\byou must\b|\btonight\b/i)
    }
  })

  test('date navigation and archive search', async ({ page }) => {
    await page.goto('journal/')
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
    await page.goto('journal/')
    await page.getByLabel('Journal entry').fill('A fragment worth keeping.')
    await expect(page.getByText('Saved', { exact: true })).toBeVisible()
    await page.goto('account/')
    await expect(page.getByText(/Relate|Cognitive Twin/)).toHaveCount(0)
    const download = page.waitForEvent('download')
    await page.getByRole('button', { name: 'Export everything (JSON)' }).click()
    const file = await download
    expect(file.suggestedFilename()).toMatch(/^pci-export-.*\.json$/)
    await page.getByLabel('Type DELETE to confirm').fill('DELETE')
    await page.getByRole('button', { name: 'Delete all my material' }).click()
    await expect(page.getByText('All private material has been deleted.')).toBeVisible()
    await page.goto('journal/archive/')
    await expect(page.getByText('Nothing has been entered.')).toBeVisible()
    await expect(page.getByText('There is no score for an empty page.')).toBeVisible()
  })
})

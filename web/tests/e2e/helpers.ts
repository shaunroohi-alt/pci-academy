import { expect, type Page } from '@playwright/test'

/** Open the member entry page and check that it names the three tools. Nothing is set up; the tools open directly. */
export async function enter(page: Page) {
  await page.goto('enter/')
  const tools = page.getByRole('list', { name: 'Tools' })
  await expect(tools.getByRole('link', { name: 'Observe', exact: true })).toBeVisible()
  await expect(tools.getByRole('link', { name: 'Journal', exact: true })).toBeVisible()
  await expect(tools.getByRole('link', { name: 'On the Contrary', exact: true })).toBeVisible()
}

export const SAMPLE =
  'My manager moved the deadline to Friday at the meeting this morning. I felt ignored because she didn’t even look at me when I spoke. She obviously doesn’t care about my work. I said I would talk to her after lunch but I didn’t. I was furious and embarrassed. What should I do?'

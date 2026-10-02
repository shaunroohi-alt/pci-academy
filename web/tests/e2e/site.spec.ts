import { expect, test } from '@playwright/test'

const DISCLAIMER = 'Education, not therapy. Not medical, clinical, or crisis care.'
const CLOSE = 'PCI observes. PCI reports. Then PCI stops.'
const LIBRARY_ENDING = 'This text may be read. It is not a duty.'

const PUBLIC_PAGES = ['./', 'art-of-being/', 'library/', 'method/', 'academy/', 'practitioners/', 'boundary/', 'enter/', 'library/art-of-being/chapter-01/', 'library/the-aaa-method/']

test.describe('Public site', () => {
  test('Home shows the title, lead, close line and footer disclaimer', async ({ page }) => {
    await page.goto('./')
    await expect(page.getByRole('heading', { level: 1, name: 'The Art of Being' })).toBeVisible()
    await expect(page.getByText('You are not missing anything. You are missing sight of something.')).toBeVisible()
    await expect(page.getByText('PCI is an observational method. It separates what happened from what was decided about it.')).toBeVisible()
    await expect(page.getByText('Visibility is not obligation.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Read the book' })).toHaveAttribute('href', /\/art-of-being\/$/)
    await expect(page.getByRole('link', { name: 'The method' })).toHaveAttribute('href', /\/method\/$/)
    await expect(page.getByText(CLOSE)).toHaveCount(2) // the close line and the footer
    await expect(page.getByRole('contentinfo').getByText(DISCLAIMER)).toBeVisible()
    await expect(page.getByRole('contentinfo').getByText('PCI · The Art of Being')).toBeVisible()
  })

  test('the header nav lists the six items and Enter', async ({ page }) => {
    await page.goto('./')
    const nav = page.getByRole('navigation', { name: 'Primary' })
    for (const name of ['Art of Being', 'Library', 'Method', 'Academy', 'Practitioners', 'Boundary', 'Enter']) await expect(nav.getByRole('link', { name, exact: true })).toBeVisible()
    await expect(nav.getByRole('link')).toHaveCount(7)
  })

  test('/art-of-being/ lists exactly 12 chapters and links to chapter-01', async ({ page }) => {
    await page.goto('art-of-being/')
    await expect(page.getByRole('heading', { level: 1, name: 'Twelve chapters. Not a program.' })).toBeVisible()
    const chapters = page.getByRole('list', { name: 'Chapters', exact: true }).getByRole('listitem')
    await expect(chapters).toHaveCount(12)
    await expect(chapters.first()).toContainText('Discover Your Hidden Abilities')
    await expect(chapters.first()).toContainText('Recognition comes before refinement.')
    await expect(chapters.last()).toContainText('Repetition Is Not Repetition')
    await expect(page.getByRole('link', { name: /Discover Your Hidden Abilities/ })).toHaveAttribute('href', /\/library\/art-of-being\/chapter-01\/$/)
    await expect(page.getByText(/chapter 1[3-6]\b/i)).toHaveCount(0)
  })

  test('/library/art-of-being/ shows the same book index', async ({ page }) => {
    await page.goto('library/art-of-being/')
    await expect(page.getByRole('heading', { level: 1, name: 'Twelve chapters. Not a program.' })).toBeVisible()
    await expect(page.getByRole('list', { name: 'Chapters', exact: true }).getByRole('listitem')).toHaveCount(12)
  })

  test('/library/ lists 5 articles, 2 sub-chapters and the twelve chapters', async ({ page }) => {
    await page.goto('library/')
    await expect(page.getByRole('heading', { level: 1, name: 'Library' })).toBeVisible()
    await expect(page.getByText('Chapters, sub-chapters, and companion articles. Readable. Not assigned.')).toBeVisible()
    const articles = page.getByRole('list', { name: 'Articles' }).getByRole('listitem')
    await expect(articles).toHaveCount(5)
    await expect(articles.first()).toContainText('The AAA Method')
    await expect(articles.last()).toContainText('YOUR “BUSINESS” EVOLVES AROUND OTHERS')
    await expect(page.getByRole('link', { name: /The AAA Method/ })).toHaveAttribute('href', /\/library\/the-aaa-method\/$/)
    const subs = page.getByRole('list', { name: 'Sub-chapters' }).getByRole('listitem')
    await expect(subs).toHaveCount(2)
    await expect(subs.first()).toContainText('Other People’s Material')
    await expect(subs.last()).toContainText('Coherence in Business')
    await expect(page.getByText('Filed under Individualism.')).toBeVisible()
    await expect(page.getByRole('list', { name: 'Chapters', exact: true }).getByRole('listitem')).toHaveCount(12)
    await expect(page.getByText(/continue reading|glossary|framework/i)).toHaveCount(0)
  })

  test('/method/ lists 7 operations and then stops', async ({ page }) => {
    await page.goto('method/')
    await expect(page.getByRole('heading', { level: 1, name: 'Seven operations. Then stop.' })).toBeVisible()
    const ops = page.getByRole('list', { name: 'Operations' }).getByRole('listitem')
    await expect(ops).toHaveCount(7)
    await expect(ops.first()).toContainText('Input')
    await expect(ops.first()).toContainText('What is present, before it is explained?')
    await expect(ops.last()).toContainText('Observational report')
    await expect(page.getByText('Then stop.', { exact: true })).toBeVisible()
    await expect(page.getByText('A question layer exists only after interest is shown. Questions come from the material just given. They do not choose a path.')).toBeVisible()
  })

  test('/academy/ has no courses or progress', async ({ page }) => {
    await page.goto('academy/')
    await expect(page.getByRole('heading', { level: 1, name: 'Academy' })).toBeVisible()
    await expect(page.getByText('A library and a place to look. Not a course that completes you.')).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What is here' })).toBeVisible()
    await expect(page.getByRole('heading', { name: 'What is not here' })).toBeVisible()
    await expect(page.getByText(/lessons|completed|progress/i)).toHaveCount(0)
  })

  test('/practitioners/ carries the copy', async ({ page }) => {
    await page.goto('practitioners/')
    await expect(page.getByRole('heading', { level: 1, name: 'For the person whose work is other people’s material' })).toBeVisible()
    await expect(page.getByText('It is not supervision. It is not client homework. It does not score empathy.')).toBeVisible()
  })

  test('/boundary/ lists the 5 items and the closing paragraphs', async ({ page }) => {
    await page.goto('boundary/')
    await expect(page.getByRole('heading', { level: 1, name: 'What this is not' })).toBeVisible()
    const items = page.getByRole('list', { name: 'What this is not' }).getByRole('listitem')
    await expect(items).toHaveCount(5)
    await expect(items.first()).toHaveText('Not therapy, diagnosis, or crisis care')
    await expect(items.last()).toHaveText('Not permission to finish someone else’s movement')
    await expect(page.getByText('Harm is not recast as a gift. Creator is not culprit. Visibility of a need is not an obligation to act on it.')).toBeVisible()
    await expect(page.getByText('If someone is in immediate danger, this site is the wrong room.')).toBeVisible()
  })

  test('/enter/ names the three tools and the empty state', async ({ page }) => {
    await page.goto('enter/')
    await expect(page.getByRole('heading', { level: 1, name: 'Enter' })).toBeVisible()
    const tools = page.getByRole('list', { name: 'Tools' })
    await expect(tools.getByRole('link', { name: 'Observe' })).toHaveAttribute('href', /\/observe\/$/)
    await expect(tools.getByRole('link', { name: 'Journal' })).toHaveAttribute('href', /\/journal\/$/)
    await expect(tools.getByRole('link', { name: 'On the Contrary' })).toHaveAttribute('href', /\/contrary\/$/)
    await expect(tools.getByRole('link')).toHaveCount(3)
    await expect(page.getByText('Nothing has been entered. There is no score for an empty page.')).toBeVisible()
    await expect(page.getByRole('link', { name: 'Privacy and export' })).toHaveAttribute('href', /\/account\/$/)
  })

  test('a chapter page reads as a book and ends with the library ending', async ({ page }) => {
    await page.goto('library/art-of-being/chapter-01/')
    await expect(page.getByRole('heading', { level: 1, name: 'Discover Your Hidden Abilities' })).toBeVisible()
    await expect(page.getByText('The Art of Being · Chapter 1')).toBeVisible()
    await expect(page.getByText(LIBRARY_ENDING)).toBeVisible()
    // The ending line comes after the text itself.
    const text = await page.locator('article').innerText()
    expect(text.indexOf(LIBRARY_ENDING)).toBeGreaterThan(text.indexOf('Discover Your Hidden Abilities'))
    await expect(page.getByRole('navigation', { name: 'Previous and next' }).getByRole('link', { name: /Next/ })).toHaveAttribute('href', /chapter-02\/$/)
    await expect(page.locator('[role="progressbar"]')).toHaveCount(0)
  })

  test('a sub-chapter shows its parent chapter', async ({ page }) => {
    await page.goto('library/other-peoples-material/')
    await expect(page.getByRole('heading', { level: 1, name: 'Other People’s Material' })).toBeVisible()
    await expect(page.getByRole('link', { name: /Individualism/ }).first()).toHaveAttribute('href', /\/library\/art-of-being\/chapter-05\/$/)
    await expect(page.getByText(LIBRARY_ENDING)).toBeVisible()
  })

  test('no page carries retired language', async ({ page }) => {
    for (const path of PUBLIC_PAGES) {
      await page.goto(path)
      // The Academy copy itself says the Academy "does not assign a type, a practice, or a streak"; that sentence is the handoff's, verbatim.
      const text = (await page.locator('body').innerText()).replace('The Academy does not assign a type, a practice, or a streak.', '')
      for (const banned of ['streak', 'Day 4 of 30', 'discover your type', 'tonight']) {
        expect(text.toLowerCase(), `${path} contains “${banned}”`).not.toContain(banned.toLowerCase())
      }
      await expect(page.getByRole('contentinfo').getByText(DISCLAIMER), `${path} footer`).toBeVisible()
    }
  })
})

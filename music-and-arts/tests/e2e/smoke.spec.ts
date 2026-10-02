import { expect, test, type Page } from '@playwright/test'

const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'e2e-secret'
const stamp = Date.now().toString(36)

async function loginAdmin(page: Page) {
  await page.goto('/admin/login')
  await page.getByLabel('Password').fill(ADMIN_PASSWORD)
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page).toHaveURL(/\/admin$/)
}

test('home page shows both sections', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Piano care')
  await expect(page.getByRole('link', { name: /See services and prices/ })).toBeVisible()
  await expect(page.getByRole('link', { name: /See programs and packages/ })).toBeVisible()
})

test('piano services page lists the four services with the $30 quote fee', async ({ page }) => {
  await page.goto('/piano-services')
  for (const name of ['Regular Tuning', 'Tuning + Regulation', 'Full Package', 'Quote Me Up']) {
    await expect(page.getByRole('heading', { name, exact: true })).toBeVisible()
  }
  await expect(page.locator('#quote-me-up')).toContainText('$30')
})

test('booking form validates and then creates an appointment', async ({ page }) => {
  await page.goto('/piano-services/book?service=quote-me-up')
  await page.getByRole('button', { name: 'Request appointment' }).click()
  await expect(page.getByText('Your name is required')).toBeVisible()

  await page.getByLabel('Piano type').selectOption('upright')
  await page.getByLabel('Your name').fill(`E2E Customer ${stamp}`)
  await page.getByLabel('Email').fill(`e2e-${stamp}@example.com`)
  await page.getByLabel('Phone').fill('555-010-2030')
  await page.getByLabel('Street address').fill('12 Keyboard Lane')
  await page.getByLabel('City').fill('Testville')
  await page.getByRole('button', { name: 'Request appointment' }).click()
  await expect(page).toHaveURL(/\/thanks\?type=booking&ref=BK-/)
  await expect(page.getByRole('heading', { name: 'Your appointment request is in.' })).toBeVisible()
})

test('seller, buyer and lesson forms submit', async ({ page }) => {
  await page.goto('/piano-services/sell')
  await page.getByLabel('Piano type').selectOption('grand')
  await page.getByLabel('Brand').fill('Kawai')
  await page.getByLabel('Model').fill(`GL-10 ${stamp}`)
  await page.getByLabel('Asking price (USD)').fill('4000')
  await page.getByLabel('Your name').fill(`E2E Seller ${stamp}`)
  await page.getByLabel('Email').fill(`seller-${stamp}@example.com`)
  await page.getByLabel('Phone').fill('555-020-3040')
  await page.getByLabel('City').fill('Testville')
  await page.getByRole('button', { name: 'Get an offer' }).click()
  await expect(page).toHaveURL(/type=sell&ref=PS-/)

  await page.goto('/pianos')
  await page.getByLabel('Your name').fill(`E2E Buyer ${stamp}`)
  await page.getByLabel('Email').fill(`buyer-${stamp}@example.com`)
  await page.getByLabel('Phone').fill('555-030-4050')
  await page.getByLabel('Type of piano').selectOption('grand')
  await page.getByLabel('Budget from (USD)').fill('3000')
  await page.getByLabel('Budget up to (USD)').fill('6000')
  await page.getByRole('button', { name: 'Notify me about pianos' }).click()
  await expect(page).toHaveURL(/type=buyer&ref=PB-/)

  await page.goto('/lessons/enroll?program=pop-piano&package=standard-4x45')
  await expect(page.getByLabel('Program')).toHaveValue('pop-piano')
  await page.getByLabel("Student's name").fill('Kid Tester')
  await page.getByLabel('Age', { exact: true }).fill('9')
  await page.getByLabel('Your name').fill(`E2E Parent ${stamp}`)
  await page.getByLabel('Email').fill(`parent-${stamp}@example.com`)
  await page.getByLabel('Phone').fill('555-040-5060')
  await page.getByRole('button', { name: 'Send enquiry' }).click()
  await expect(page).toHaveURL(/type=lessons&ref=LS-/)
})

test('admin is protected, then shows submissions, publishes a piano and records a deal', async ({ page }) => {
  await page.goto('/admin/appointments')
  await expect(page).toHaveURL(/\/admin\/login/)
  await page.getByLabel('Password').fill('wrong')
  await page.getByRole('button', { name: 'Log in' }).click()
  await expect(page.getByText('Incorrect password.')).toBeVisible()

  await loginAdmin(page)
  await page.goto('/admin/appointments')
  await expect(page.getByText(`E2E Customer ${stamp}`)).toBeVisible()
  await page.goto('/admin/lessons')
  await expect(page.getByText(`E2E Parent ${stamp}`)).toBeVisible()
  await page.goto('/admin/buyers')
  await expect(page.getByText(`E2E Buyer ${stamp}`)).toBeVisible()

  // Price and publish the piano the seller submitted.
  await page.goto('/admin/pianos')
  await page.getByRole('link', { name: `Kawai GL-10 ${stamp}` }).click()
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Kawai')
  await page.getByLabel('Status', { exact: true }).selectOption('listed')
  await page.getByLabel('Buy price (what we pay)').fill('3500')
  await page.getByLabel('Public title').fill(`Kawai GL-10 baby grand ${stamp}`)
  await page.getByRole('button', { name: 'Save listing' }).click()
  await expect(page.getByText('Saved.')).toBeVisible()
  // 3500 + 15% = 4025 -> rounded up to the nearest $5 = 4025
  await expect(page.getByLabel('List price (what buyers see)')).toHaveValue('4025')

  // It is now public.
  await page.goto('/pianos')
  await page.getByRole('link', { name: new RegExp(`Kawai GL-10 baby grand ${stamp}`) }).click()
  await expect(page).toHaveURL(/\/pianos\/[0-9a-f-]{36}$/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(`Kawai GL-10 baby grand ${stamp}`)
  await expect(page.getByText('$4,025', { exact: true })).toBeVisible()
  await page.getByLabel('Your name').fill(`E2E Interested ${stamp}`)
  await page.getByLabel('Email').fill(`interested-${stamp}@example.com`)
  await page.getByLabel('Phone').fill('555-050-6070')
  await page.getByRole('button', { name: "I'm interested" }).click()
  await expect(page).toHaveURL(/type=buyer&ref=PB-/)

  // Admin sees the interest on the listing and creates a deal with that buyer.
  await page.goto('/admin/pianos?status=listed')
  await page.getByRole('link', { name: `Kawai GL-10 baby grand ${stamp}` }).click()
  await expect(page.getByText(`E2E Interested ${stamp}`, { exact: true })).toBeVisible()
  const buyerValue = await page.locator('#buyer_id option', { hasText: `E2E Interested ${stamp}` }).getAttribute('value')
  await page.getByLabel('Buyer', { exact: true }).selectOption(buyerValue!)
  await page.getByRole('button', { name: 'Create deal' }).click()
  await expect(page).toHaveURL(/\/admin\/deals/)
  await expect(page.getByRole('link', { name: `Kawai GL-10 baby grand ${stamp}` })).toBeVisible()
  await expect(page.getByText(`E2E Interested ${stamp}`, { exact: true })).toBeVisible()
  await expect(page.getByRole('cell', { name: '$525' }).first()).toBeVisible()
})

test('settings page updates a service price that shows publicly', async ({ page }) => {
  await loginAdmin(page)
  await page.goto('/admin/settings')
  await page.getByLabel('Regular Tuning price', { exact: true }).fill('150')
  await page.getByRole('button', { name: 'Save all settings' }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible()
  await page.goto('/piano-services')
  await expect(page.locator('#regular-tuning')).toContainText('$150')
  // Reset so the seed state stays "to be announced".
  await page.goto('/admin/settings')
  await page.getByLabel('Regular Tuning price', { exact: true }).fill('')
  await page.getByRole('button', { name: 'Save all settings' }).click()
  await expect(page.getByText('Settings saved.')).toBeVisible()
})

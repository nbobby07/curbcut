import { expect, test } from '@playwright/test'
import { resolve } from 'node:path'

const issue = (page: import('@playwright/test').Page, rule: string) =>
  page.locator('.issue-row').filter({ has: page.getByText(rule, { exact: true }) })

async function scan(page: import('@playwright/test').Page) {
  const button = page.getByRole('button', { name: /^(Run axe scan|Rescan with axe)$/ })
  await expect(button).toBeEnabled()
  await button.click()
  await expect(page.getByRole('button', { name: 'Scanning…' })).toBeHidden()
}

test('stacked mobile preview completes its offscreen axe scan without horizontal overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Rescan with axe' })).toBeEnabled()
  expect(await page.locator('.issue-row').count()).toBeGreaterThanOrEqual(6)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const sourceTab = page.getByRole('tab', { name: 'Source' })
  await sourceTab.focus()
  await sourceTab.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'Preview' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.locator('iframe[title="Rendered source preview"]')).toBeVisible()
  await expect(page.frameLocator('iframe[title="Rendered source preview"]')
    .getByRole('heading', { name: 'Complete your order' })).toBeVisible()
  await page.getByRole('tab', { name: 'Evidence' }).click()
  const evidenceCount = await page.locator('.issue-row').count()
  await expect(page.locator('#evidence-pane .pane-heading p')).toContainText(`${evidenceCount} evidence records`)
})

test('imports unrelated local HTML/CSS atomically and reports real dynamic axe findings', async ({ page }) => {
  await page.goto('/')
  await page.locator('input[type="file"]').setInputFiles([
    resolve('examples/profile-form.html'),
    resolve('examples/profile-form.css'),
  ])
  await expect(page.getByLabel('Editable HTML source')).toHaveValue(/Profile details/)
  await page.getByRole('tab', { name: 'CSS' }).click()
  await expect(page.getByLabel('Editable CSS source')).toHaveValue(/profile-shell/)
  await scan(page)
  await expect(page.locator('.issue-row strong')).toHaveText(['label', 'tabindex'])
  await expect(page.getByTestId('activity-timeline')).toContainText('workspace imported')
})

test('button accessible-name proposal requires visible human approval, verifies, and undoes', async ({ page }) => {
  await page.goto('/')
  await expect(issue(page, 'button-name')).toHaveCount(1)
  await issue(page, 'button-name').click()
  await page.getByLabel('Button purpose').fill('Close order summary')
  await page.getByTestId('preview-repair').click()
  await expect(page.getByTestId('proposal-panel')).toContainText('Button name: Close order summary')
  await expect(page.getByTestId('apply-proposal')).toBeDisabled()
  await page.getByTestId('approve-proposal').click()
  await expect(page.getByTestId('apply-proposal')).toBeEnabled()
  await page.getByTestId('apply-proposal').click()
  await scan(page)
  await expect(issue(page, 'button-name')).toHaveCount(0)
  await page.getByRole('button', { name: 'Undo last repair' }).click()
  await scan(page)
  await expect(issue(page, 'button-name')).toHaveCount(1)
})

test('document-language proposal uses an explicit human-confirmed BCP 47 value', async ({ page }) => {
  await page.goto('/')
  await expect(issue(page, 'html-has-lang')).toHaveCount(1)
  await issue(page, 'html-has-lang').click()
  await page.getByLabel('Document language (BCP 47)').fill('en-US')
  await page.getByTestId('preview-repair').click()
  await expect(page.getByTestId('proposal-panel')).toContainText('Document language: en-US')
  await page.getByTestId('approve-proposal').click()
  await page.getByTestId('apply-proposal').click()
  await scan(page)
  await expect(issue(page, 'html-has-lang')).toHaveCount(0)
})

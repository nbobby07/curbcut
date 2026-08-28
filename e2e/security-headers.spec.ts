import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

type Header = { key: string; value: string }

const deployment = JSON.parse(readFileSync(resolve('vercel.json'), 'utf8')) as {
  headers: Array<{ source: string; headers: Header[] }>
}
const securityHeaders = Object.fromEntries(
  deployment.headers.find(({ source }) => source === '/(.*)')!.headers
    .map(({ key, value }) => [key.toLowerCase(), value]),
)

test('production headers preserve the opaque in-frame axe boundary', async ({ page }) => {
  expect(securityHeaders).toMatchObject({
    'origin-agent-cluster': '?1',
    'permissions-policy': 'tools=(self)',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
  })
  expect(securityHeaders['content-security-policy']).toContain("connect-src 'none'")
  expect(securityHeaders['content-security-policy']).toContain("frame-src 'none'")

  await page.route('http://127.0.0.1:4199/', async (route) => {
    const response = await route.fetch()
    await route.fulfill({ response, headers: { ...response.headers(), ...securityHeaders } })
  })

  const response = await page.goto('/')
  expect(response?.headers()['origin-agent-cluster']).toBe('?1')
  await expect(page.getByTestId('isolation-status')).toHaveText('Isolation: opaque (null)')
  await expect(page.getByRole('button', { name: 'Rescan with axe' })).toBeEnabled()
  await page.getByRole('button', { name: 'Rescan with axe' }).click()
  await expect(page.getByRole('button', { name: 'Scanning…' })).toBeHidden()
  await expect(page.locator('.issue-row')).not.toHaveCount(0)
})

test('one scan cannot serialize more than the global axe-node budget', async ({ page }) => {
  await page.goto('/')
  const inputs = Array.from({ length: 130 }, (_, index) => `<input id="field-${index}">`).join('')
  await page.getByLabel('Editable HTML source').fill(
    `<!doctype html><html lang="en"><head><title>Budget</title></head><body><main><h1>Budget</h1>${inputs}</main></body></html>`,
  )
  const scan = page.getByRole('button', { name: /^(Run axe scan|Rescan with axe)$/ })
  await expect(scan).toBeEnabled()
  await scan.click()
  await expect(page.getByRole('button', { name: 'Scanning…' })).toBeHidden()
  await expect(page.locator('.issue-row').filter({ has: page.getByText('label', { exact: true }) })).toHaveCount(100)
  await expect(page.locator('#evidence-pane .pane-heading p')).toHaveText('100 of 131 axe result nodes · lower bounds')
  await expect(page.getByText('Axe found 131 result nodes. Curbcut safely displayed the first 100', { exact: false })).toBeVisible()
  await expect(page.locator('.metrics')).toContainText('≥100 violation nodes')

  await page.locator('.issue-row').first().click()
  await page.getByLabel('Label text override (optional)').fill('Field zero')
  await page.getByTestId('preview-repair').click()
  await page.getByTestId('approve-proposal').click()
  await page.getByTestId('apply-proposal').click()
  await expect(scan).toBeEnabled()
  await scan.click()
  await expect(page.getByRole('button', { name: 'Scanning…' })).toBeHidden()
  await expect(page.getByTestId('verification-result')).toContainText('NOT VERIFIED')
  await expect(page.getByTestId('verification-result')).toContainText('capped axe rescan could not verify')
})

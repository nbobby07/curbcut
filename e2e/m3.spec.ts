import { expect, test, type Page } from '@playwright/test'

const rules = ['button-name', 'color-contrast', 'html-has-lang', 'image-alt', 'label', 'tabindex']

async function scan(page: Page) {
  await page.getByRole('button', { name: /^(Run axe scan|Rescan with axe)$/ }).click()
  await expect(page.getByRole('button', { name: 'Scanning…' })).toBeHidden()
}

function issue(page: Page, ruleId: string) {
  return page.locator('.issue-row').filter({ has: page.getByText(ruleId, { exact: true }) })
}

test('freezes the checkout fixture and completes label Apply/rescan/Undo', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByTestId('isolation-status')).toHaveText('Isolation: opaque (null)')
  await expect(page.getByRole('button', { name: 'Rescan with axe' })).toBeEnabled()

  await expect(page.locator('.issue-row')).toHaveCount(6)
  await expect(page.locator('.issue-row strong')).toHaveText(rules)
  await expect(page.locator('.issue-row .impact')).toHaveText([
    'critical', 'serious', 'serious', 'critical', 'critical', 'serious',
  ])
  await expect(issue(page, 'tabindex')).toContainText('Code fix ready')
  await expect(issue(page, 'label')).toContainText('Code preview · approval')
  await expect(issue(page, 'button-name')).toContainText('Code preview · approval')
  await expect(issue(page, 'color-contrast')).toContainText('Evidence only')

  const editor = page.getByLabel('Editable HTML source')
  const before = await editor.inputValue()
  await issue(page, 'label').click()
  await page.getByRole('button', { name: 'Preview code change' }).click()

  await expect(editor).toHaveValue(before)
  await expect(page.getByTestId('proposal-panel')).toContainText('proposed proposal · working source unchanged')
  await expect(page.getByTestId('proposed-preview-stage')).toBeVisible()
  await expect(page.locator('iframe[title="Proposed source preview — not applied"]')).toHaveAttribute('sandbox', 'allow-scripts')
  await expect(page.getByText('Mapped target highlighted', { exact: false })).toBeVisible()
  await expect(page.getByTestId('apply-proposal')).toBeDisabled()

  await page.getByTestId('approve-proposal').click()
  await expect(page.getByTestId('approval-status')).toContainText('Approved by human')
  await page.getByTestId('apply-proposal').click()
  await expect(editor).toHaveValue(before
    .replace('<span>Email address</span>', '<span id="curbcut-label-1">Email address</span>')
    .replace('<input id="email" name="email" type="email" autocomplete="email">',
      '<input id="email" name="email" type="email" autocomplete="email" aria-labelledby="curbcut-label-1">'))
  await expect(page.getByTestId('verification-result')).toContainText('PENDING')

  await scan(page)
  await expect(page.locator('.issue-row strong')).toHaveText(rules.filter((rule) => rule !== 'label'))
  await expect(page.getByTestId('verification-result')).toContainText('VERIFIED')

  await page.getByRole('button', { name: 'Undo last repair' }).click()
  await expect(editor).toHaveValue(before)
  await scan(page)
  await expect(page.locator('.issue-row strong')).toHaveText(rules)
  await expect(page.getByTestId('verification-result')).toContainText('RESTORED')
})

test('requires a human image-purpose decision and Reject is non-mutating', async ({ page }) => {
  await page.goto('/')
  await scan(page)
  const editor = page.getByLabel('Editable HTML source')
  const before = await editor.inputValue()
  await issue(page, 'image-alt').click()

  await expect(page.getByRole('button', { name: 'Preview code change' })).toBeDisabled()
  await page.getByLabel('Decorative').check()
  await page.getByRole('button', { name: 'Preview code change' }).click()
  await expect(page.getByTestId('proposal-panel')).toContainText('alt=""')
  await expect(editor).toHaveValue(before)
  await page.getByRole('button', { name: 'Reject' }).click()
  await expect(editor).toHaveValue(before)
  await expect(page.getByTestId('selected-issue')).toContainText('image-alt')

  await page.getByLabel('Meaningful').check()
  await page.getByLabel('Alternative text').fill('Canvas desk organizer in natural fabric')
  await page.getByRole('button', { name: 'Preview code change' }).click()
  await page.getByTestId('approve-proposal').click()
  await page.getByTestId('apply-proposal').click()
  await scan(page)
  await expect(issue(page, 'image-alt')).toHaveCount(0)
  await expect(page.getByTestId('verification-result')).toContainText('VERIFIED')
})

test('removes only positive tabindex and restores the finding after exact Undo', async ({ page }) => {
  await page.goto('/')
  const editor = page.getByLabel('Editable HTML source')
  await expect(page.getByRole('button', { name: 'Rescan with axe' })).toBeEnabled()
  const browserCanonical = await editor.inputValue()
  await expect(issue(page, 'tabindex')).toContainText('serious')
  await issue(page, 'tabindex').click()
  await expect(page.locator('#source-pane')).toHaveClass(/has-mapped-source/)
  await page.getByRole('button', { name: 'Preview code change' }).click()
  await expect(page.getByTestId('proposal-panel')).toContainText('<button class="continue" type="submit">')
  await expect(page.getByTestId('proposal-panel')).toContainText('No semantic approval needed')
  await expect(page.frameLocator('iframe[title="Proposed source preview — not applied"]')
    .locator('button.continue')).toHaveAttribute('data-curbcut-highlight', 'true')
  await expect(page.getByTestId('approve-proposal')).toHaveCount(0)
  await expect(page.getByTestId('apply-proposal')).toBeEnabled()
  await expect(page.getByTestId('apply-proposal')).toBeInViewport()
  await page.getByTestId('apply-proposal').click()
  await expect(editor).toHaveValue(browserCanonical.replace(' tabindex="2"', ''))
  await scan(page)
  await expect(issue(page, 'tabindex')).toHaveCount(0)
  await expect(page.getByTestId('verification-result')).toContainText('VERIFIED')
  await page.getByRole('button', { name: 'Undo last repair' }).click()
  await expect(editor).toHaveValue(browserCanonical)
  await scan(page)
  await expect(issue(page, 'tabindex')).toHaveCount(1)
  await expect(page.getByTestId('verification-result')).toContainText('RESTORED')
})

test('keeps malicious working and proposed source inside the M2 security boundary', async ({ page }) => {
  const externalRequests: string[] = []
  const externalResponses: string[] = []
  page.on('request', (request) => {
    if (request.url().startsWith('https://curbcut.invalid')) externalRequests.push(request.url())
  })
  page.on('response', (response) => {
    if (response.url().startsWith('https://curbcut.invalid')) externalResponses.push(response.url())
  })
  await page.goto('/')
  const editor = page.getByLabel('Editable HTML source')
  await editor.fill('<html lang="en"><body><main><h1>Safe</h1><input id="email" autofocus><a href="https://curbcut.invalid/nav">Leave</a><script>parent.__curbcutPwned=1</script><img src="https://curbcut.invalid/pixel" onerror="parent.__curbcutPwned=2"></main></body></html>')
  await page.getByRole('tab', { name: 'CSS' }).click()
  await page.getByLabel('Editable CSS source').fill('body{background:url(https://curbcut.invalid/css)}')
  await page.getByRole('tab', { name: 'HTML' }).click()
  await scan(page)

  const workingFrame = page.frameLocator('iframe[title="Rendered source preview"]')
  await expect(workingFrame.locator('#curbcut-preview-root script')).toHaveCount(0)
  await expect(workingFrame.locator('#curbcut-preview-root img')).not.toHaveAttribute('src', /curbcut\.invalid/)
  await expect(workingFrame.locator('input#email')).not.toHaveAttribute('autofocus', '')
  await expect(workingFrame.getByText('Leave', { exact: true })).not.toHaveAttribute('href', /.+/)
  expect(await page.evaluate(() => (window as Window & { __curbcutPwned?: number }).__curbcutPwned)).toBeUndefined()
  await expect(page.getByTestId('isolation-status')).toHaveText('Isolation: opaque (null)')
  expect(await editor.inputValue()).not.toContain('data-curbcut-node')
  const issueCountBeforeForgery = await page.locator('.issue-row').count()
  await page.evaluate(() => window.postMessage({
    channel: 'forged', direction: 'frame-to-parent', type: 'SCAN_RESULT', requestId: 'forged', sourceRevision: 3,
    payload: { violations: [], incomplete: [] },
  }, '*'))
  await expect(page.locator('.issue-row')).toHaveCount(issueCountBeforeForgery)

  await issue(page, 'label').click()
  const semanticText = 'Email <img src=x onerror=alert(1)>'
  await page.getByLabel('Label text override (optional)').fill(semanticText)
  await page.getByRole('button', { name: 'Preview code change' }).click()
  const proposedFrame = page.frameLocator('iframe[title="Proposed source preview — not applied"]')
  await expect(proposedFrame.getByText(semanticText, { exact: true })).toBeVisible()
  await expect(proposedFrame.locator('#curbcut-preview-root img')).toHaveCount(1)
  await expect(page.locator('iframe[title="Proposed source preview — not applied"]')).toHaveAttribute('sandbox', 'allow-scripts')
  await page.waitForTimeout(250)
  expect(externalRequests.length).toBeGreaterThan(0)
  expect(externalResponses).toEqual([])

  await editor.fill(`${await editor.inputValue()}\n`)
  await expect(page.getByTestId('proposal-panel')).toBeHidden()
  await expect(page.getByTestId('verification-result')).toContainText('invalidated by a manual source edit')
})

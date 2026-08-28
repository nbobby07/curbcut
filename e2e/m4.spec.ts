import { expect, test, type Page } from '@playwright/test'
import { resolve } from 'node:path'

type ToolResult = {
  ok: boolean
  data?: Record<string, any>
  error?: { code: string }
  allowedNextActions: string[]
}

async function installWebMcp(page: Page) {
  await page.addInitScript(() => {
    const tools = new Map<string, WebMCP.ModelContextTool>()
    const context = {
      registerTool: async (tool: WebMCP.ModelContextTool, options?: WebMCP.ModelContextRegisterToolOptions) => {
        if (!options?.signal?.aborted) tools.set(tool.name, tool)
        options?.signal?.addEventListener('abort', () => tools.delete(tool.name), { once: true })
      },
      getTools: async () => [...tools.values()].map(({ execute: _execute, ...tool }) => tool),
    }
    Object.defineProperty(document, 'modelContext', { configurable: true, value: context })
    Object.assign(window, { __curbcutWebMcpTools: tools })
  })
}

async function tool(page: Page, name: string, args: Record<string, unknown>, cancel = false) {
  return await page.evaluate(async ({ toolName, input, shouldCancel }) => {
    const tools = (window as typeof window & { __curbcutWebMcpTools: Map<string, WebMCP.ModelContextTool> }).__curbcutWebMcpTools
    const definition = tools.get(toolName)
    if (!definition) throw new Error(`Missing tool ${toolName}`)
    const controller = new AbortController()
    const execution = definition.execute(input, { signal: controller.signal })
    if (shouldCancel) setTimeout(() => controller.abort(), 0)
    return JSON.parse(String(await execution)) as ToolResult
  }, { toolName: name, input: args, shouldCancel: cancel })
}

async function scanAndLabelId(page: Page) {
  await expect(page.getByRole('button', { name: 'Rescan with axe' })).toBeEnabled()
  expect((await tool(page, 'scan_accessibility', { reason: 'initial' })).ok).toBe(true)
  const listed = await tool(page, 'list_issues', { impact: 'critical', classification: 'all', status: 'open', limit: 10 })
  return String((listed.data!.issues as Array<{ issueId: string; ruleId: string }>).find(({ ruleId }) => ruleId === 'label')!.issueId)
}

test.beforeEach(async ({ page }) => installWebMcp(page))

test('A — registers exactly ten static tools with exact annotations and survives reload', async ({ page }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => { if (message.type() === 'error') consoleErrors.push(message.text()) })
  await page.goto('/')
  await expect.poll(async () => page.evaluate(() => document.modelContext!.getTools().then((items) => items.length))).toBe(10)
  const first = await page.evaluate(async () => (await document.modelContext!.getTools()).map(({ name, annotations }) => ({ name, annotations })))
  expect(first.map(({ name }) => name)).toEqual([
    'get_workspace', 'scan_accessibility', 'list_issues', 'inspect_issue', 'preview_remediation',
    'apply_remediation', 'reject_remediation', 'undo_remediation', 'get_change_summary', 'export_source',
  ])
  expect(first.find(({ name }) => name === 'list_issues')?.annotations).toEqual({ readOnlyHint: true, untrustedContentHint: true })
  expect(first.find(({ name }) => name === 'apply_remediation')?.annotations).toEqual({ readOnlyHint: false, untrustedContentHint: false })
  await page.reload()
  await expect.poll(async () => page.evaluate(() => document.modelContext!.getTools().then((items) => items.length))).toBe(10)
  expect(consoleErrors).toEqual([])
})

test('B — scan/list/inspect exercises the real sandbox, store, source selection, and highlight', async ({ page }) => {
  await page.goto('/')
  const issueId = await scanAndLabelId(page)
  const inspected = await tool(page, 'inspect_issue', { issueId })
  expect(inspected).toMatchObject({ ok: true, data: { ruleId: 'label', sourceLocation: { line: 16 } } })
  await expect(page.getByTestId('selected-issue')).toContainText('label')
  await expect(page.getByTestId('highlight-status')).toContainText('Highlighted cc-')
  const selection = await page.getByLabel('Editable HTML source').evaluate((element: HTMLTextAreaElement) => ({ start: element.selectionStart, end: element.selectionEnd }))
  expect(selection.end).toBeGreaterThan(selection.start)
})

test('C — preview is non-mutating and apply cannot bypass visible exact approval', async ({ page }) => {
  await page.goto('/')
  const issueId = await scanAndLabelId(page)
  const editor = page.getByLabel('Editable HTML source')
  const before = await editor.inputValue()
  const preview = await tool(page, 'preview_remediation', { issueId, family: 'add_form_label', values: { labelText: 'Email address' } })
  expect(preview).toMatchObject({ ok: true, data: { approvalRequired: true, semanticJudgmentRequired: true } })
  expect(await editor.inputValue()).toBe(before)
  await expect(page.getByTestId('apply-proposal')).toBeDisabled()
  const proposalId = String(preview.data!.proposalId)
  expect(await tool(page, 'apply_remediation', { proposalId })).toMatchObject({ ok: false, error: { code: 'APPROVAL_REQUIRED' } })
  expect(await editor.inputValue()).toBe(before)
  await page.getByTestId('approve-proposal').click()
  expect(await tool(page, 'apply_remediation', { proposalId })).toMatchObject({ ok: true, data: { scanStatus: 'STALE' } })
  await expect(editor).toHaveValue(before.replace('            <input id="email"', '            <label for="email">Email address</label>\n            <input id="email"'))
})

test('mechanical proposal is visible, agent-applicable, rescannable, and undoable without semantic approval', async ({ page }) => {
  await page.goto('/')
  await tool(page, 'scan_accessibility', { reason: 'initial' })
  const listed = await tool(page, 'list_issues', { impact: 'serious', classification: 'MECHANICAL', status: 'open', limit: 10 })
  const issueId = String((listed.data!.issues as Array<{ issueId: string }>)[0].issueId)
  const editor = page.getByLabel('Editable HTML source')
  const before = await editor.inputValue()
  const preview = await tool(page, 'preview_remediation', { issueId, family: 'remove_positive_tabindex' })
  expect(preview).toMatchObject({ ok: true, data: { approvalRequired: false, agentMayApply: true, semanticJudgmentRequired: false } })
  expect(preview.allowedNextActions).toContain('apply_remediation')
  expect(await editor.inputValue()).toBe(before)
  await expect(page.getByTestId('approve-proposal')).toHaveCount(0)

  const proposalId = String(preview.data!.proposalId)
  expect(await tool(page, 'apply_remediation', { proposalId })).toMatchObject({ ok: true, data: { scanStatus: 'STALE' } })
  await expect(editor).toHaveValue(before.replace(' tabindex="2"', ''))
  await tool(page, 'scan_accessibility', { reason: 'after_change' })
  await expect(page.locator('.issue-row strong').filter({ hasText: /^tabindex$/ })).toHaveCount(0)
  expect(await tool(page, 'undo_remediation', {})).toMatchObject({ ok: true })
  await expect(editor).toHaveValue(before)
})

test('image semantic values remain candidate-only until a new visible approval', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByRole('button', { name: 'Rescan with axe' })).toBeEnabled()
  await tool(page, 'scan_accessibility', { reason: 'initial' })
  const listed = await tool(page, 'list_issues', { impact: 'critical', classification: 'all', status: 'open', limit: 10 })
  const imageId = String((listed.data!.issues as Array<{ issueId: string; ruleId: string }>).find(({ ruleId }) => ruleId === 'image-alt')!.issueId)
  const editor = page.getByLabel('Editable HTML source')
  const before = await editor.inputValue()
  expect(await tool(page, 'preview_remediation', { issueId: imageId, family: 'set_image_alt' })).toMatchObject({ ok: false, error: { code: 'INPUT_REQUIRED' } })
  const first = await tool(page, 'preview_remediation', { issueId: imageId, family: 'set_image_alt', values: { altMode: 'meaningful', altText: 'Canvas organizer' } })
  expect(first).toMatchObject({ ok: true, data: { approvalState: 'PROPOSED', approvalRequired: true } })
  const firstId = String(first.data!.proposalId)
  expect(await tool(page, 'apply_remediation', { proposalId: firstId })).toMatchObject({ ok: false, error: { code: 'APPROVAL_REQUIRED' } })
  await page.getByTestId('approve-proposal').click()
  await tool(page, 'reject_remediation', { proposalId: firstId, reason: 'needs_revision' })

  const second = await tool(page, 'preview_remediation', { issueId: imageId, family: 'set_image_alt', values: { altMode: 'decorative' } })
  expect(second).toMatchObject({ ok: true, data: { approvalState: 'PROPOSED' } })
  await expect(page.getByTestId('apply-proposal')).toBeDisabled()
  expect(await editor.inputValue()).toBe(before)
})

test('D — rejection, stale state, and cancellation remain bounded and non-mutating', async ({ page }) => {
  await page.goto('/')
  expect(await tool(page, 'list_issues', {})).toMatchObject({ ok: false, error: { code: 'SCAN_REQUIRED' } })
  expect(await tool(page, 'inspect_issue', { issueId: 'missing' })).toMatchObject({ ok: false, error: { code: 'SCAN_REQUIRED' } })
  expect(await tool(page, 'apply_remediation', { proposalId: 'missing' })).toMatchObject({ ok: false, error: { code: 'PROPOSAL_NOT_FOUND' } })
  expect(await tool(page, 'reject_remediation', { proposalId: 'missing', reason: 'not_now' })).toMatchObject({ ok: false, error: { code: 'PROPOSAL_NOT_FOUND' } })
  expect(await tool(page, 'undo_remediation', {})).toMatchObject({ ok: false, error: { code: 'NOTHING_TO_UNDO' } })
  const issueId = await scanAndLabelId(page)
  expect(await tool(page, 'preview_remediation', { issueId, family: 'set_image_alt', values: { altMode: 'decorative' } })).toMatchObject({ ok: false, error: { code: 'ISSUE_NOT_REPAIRABLE' } })
  expect(await tool(page, 'preview_remediation', { issueId, family: 'add_form_label', values: { labelText: 'Cancelled candidate' } }, true)).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
  await expect(page.getByTestId('proposal-panel')).toBeHidden()
  const before = await page.getByLabel('Editable HTML source').inputValue()
  const preview = await tool(page, 'preview_remediation', { issueId, family: 'add_form_label', values: { labelText: 'Candidate only' } })
  const proposalId = String(preview.data!.proposalId)
  expect(await tool(page, 'scan_accessibility', { reason: 'manual' })).toMatchObject({ ok: false, error: { code: 'PROPOSAL_EXISTS' } })
  expect(await tool(page, 'reject_remediation', { proposalId: 'wrong', reason: 'not_now' })).toMatchObject({ ok: false, error: { code: 'PROPOSAL_NOT_FOUND' } })
  expect(await tool(page, 'reject_remediation', { proposalId, reason: 'not_now' })).toMatchObject({ ok: true, data: { status: 'REJECTED', sourceChanged: false } })
  expect(await page.getByLabel('Editable HTML source').inputValue()).toBe(before)

  const countBeforeCancel = await page.locator('.issue-row').count()
  expect(await tool(page, 'scan_accessibility', { reason: 'manual' }, true)).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
  await page.waitForTimeout(100)
  await expect(page.locator('.issue-row')).toHaveCount(countBeforeCancel)

  await page.getByLabel('Editable HTML source').fill(`${before}\n`)
  expect(await tool(page, 'inspect_issue', { issueId })).toMatchObject({ ok: false, error: { code: 'STALE_SCAN' } })
})

test('E — apply/rescan/summary/undo/rescan completes the exact shared workflow', async ({ page }) => {
  await page.goto('/')
  const editor = page.getByLabel('Editable HTML source')
  const before = await editor.inputValue()
  const issueId = await scanAndLabelId(page)
  const preview = await tool(page, 'preview_remediation', { issueId, family: 'add_form_label', values: { labelText: 'Email address' } })
  const proposalId = String(preview.data!.proposalId)
  await page.getByTestId('approve-proposal').click()
  const applied = await tool(page, 'apply_remediation', { proposalId })
  expect(applied.ok).toBe(true)
  expect(await tool(page, 'scan_accessibility', { reason: 'after_change' })).toMatchObject({ ok: true })
  await expect(page.locator('.issue-row strong').filter({ hasText: /^label$/ })).toHaveCount(0)
  expect(await tool(page, 'get_change_summary', {})).toMatchObject({ ok: true, data: { appliedCount: 1, verifiedCount: 1 } })
  expect(await tool(page, 'undo_remediation', {})).toMatchObject({ ok: true, data: { scanStatus: 'STALE' } })
  await expect(editor).toHaveValue(before)
  await tool(page, 'scan_accessibility', { reason: 'after_change' })
  await expect(page.locator('.issue-row strong').filter({ hasText: /^label$/ })).toHaveCount(1)
  await expect(page.getByTestId('verification-result')).toContainText('RESTORED')
})

test('F — export downloads canonical source and returns metadata only', async ({ page }) => {
  await page.goto('/')
  const source = await page.getByLabel('Editable HTML source').inputValue()
  const downloadEvent = page.waitForEvent('download')
  const resultPromise = tool(page, 'export_source', { format: 'html' })
  const download = await downloadEvent
  const result = await resultPromise
  expect(result).toMatchObject({ ok: true, data: { success: true, format: 'html', filename: 'curbcut.html', mappingMetadataPresent: false } })
  expect(JSON.stringify(result)).not.toContain('<!doctype')
  expect(download.suggestedFilename()).toBe('curbcut.html')
  const stream = await download.createReadStream()
  const chunks: Buffer[] = []
  for await (const chunk of stream) chunks.push(Buffer.from(chunk))
  expect(Buffer.concat(chunks).toString('utf8')).toBe(source)
  expect(Buffer.concat(chunks).toString('utf8')).not.toContain('data-curbcut-node')
})

test('G — keyboard tabs, manual-review copy, timeline focus, and app chrome stay accessible', async ({ page }) => {
  await page.goto('/')
  const htmlTab = page.getByRole('tab', { name: 'HTML' })
  await htmlTab.focus()
  await htmlTab.press('ArrowRight')
  await expect(page.getByRole('tab', { name: 'CSS' })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByRole('tab', { name: 'CSS' })).toBeFocused()
  await expect(page.getByLabel('Editable CSS source')).toBeVisible()

  await expect(page.getByRole('button', { name: 'Rescan with axe' })).toBeEnabled()
  await tool(page, 'scan_accessibility', { reason: 'initial' })
  const listed = await tool(page, 'list_issues', { impact: 'critical', classification: 'all', status: 'open', limit: 10 })
  const buttonIssue = (listed.data!.issues as Array<{ issueId: string; ruleId: string }>).find(({ ruleId }) => ruleId === 'button-name')!
  await tool(page, 'inspect_issue', { issueId: buttonIssue.issueId })
  await expect(page.getByRole('heading', { name: 'Context needed' })).toBeVisible()
  await expect(page.getByText('Curbcut mapped this issue to source, but the MVP has no bounded repair for it.')).toBeVisible()
  await page.getByRole('button', { name: /All issues/ }).click()
  await page.getByTestId('activity-timeline').locator('button').first().click()
  await expect(page.getByTestId('selected-issue')).toContainText('button-name')

  await page.addScriptTag({ path: resolve('node_modules/axe-core/axe.min.js') })
  const highImpact = await page.evaluate(async () => {
    const results = await (window as typeof window & { axe: { run: (root: Document, options: object) => Promise<{ violations: Array<{ id: string; impact: string }> }> } }).axe.run(document, { iframes: false })
    return results.violations.filter(({ impact }) => impact === 'critical' || impact === 'serious')
  })
  expect(highImpact).toEqual([])
})

test('H — reload restores canonical local source and clean WebMCP registration', async ({ page }) => {
  await page.goto('/')
  const editor = page.getByLabel('Editable HTML source')
  const persisted = `${await editor.inputValue()}\n<!-- local draft -->`
  await editor.fill(persisted)
  await page.waitForTimeout(150)
  await page.reload()
  await expect(editor).toHaveValue(persisted)
  await expect.poll(async () => page.evaluate(() => document.modelContext!.getTools().then((items) => items.length))).toBe(10)
})

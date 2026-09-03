import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js'

const url = process.argv[2] || 'http://127.0.0.1:5173'
const transport = new StdioClientTransport({
  command: process.platform === 'win32' ? 'npx.cmd' : 'npx',
  args: [
    'chrome-devtools-mcp',
    '--headless',
    '--isolated',
    '--no-page-id-routing',
    '--categoryExperimentalWebmcp=true',
    '--chromeArg=--enable-features=WebMCP',
    '--no-performance-crux',
    '--no-usage-statistics',
  ],
})
const client = new Client({ name: 'curbcut-webmcp-smoke', version: '1.0.0' })
const productTools = [
  'get_workspace', 'scan_accessibility', 'list_issues', 'inspect_issue', 'preview_remediation',
  'apply_remediation', 'reject_remediation', 'undo_remediation', 'get_change_summary', 'export_source',
]

function text(result) {
  return result.content?.filter((item) => item.type === 'text').map((item) => item.text).join('\n') || ''
}

function toolOutput(result) {
  try {
    const parsed = JSON.parse(result)
    return parsed.status === 'Completed' ? parsed.output : null
  } catch {
    return null
  }
}

function completedOutput(result) {
  const output = toolOutput(result)
  return output?.ok === true ? output : null
}

try {
  await client.connect(transport)
  const available = await client.listTools()
  for (const required of [
    'new_page',
    'navigate_page',
    'list_console_messages',
    'evaluate_script',
    'list_webmcp_tools',
    'execute_webmcp_tool',
  ]) {
    if (!available.tools.some((tool) => tool.name === required)) {
      throw new Error(`Chrome DevTools MCP did not expose ${required}`)
    }
  }

  await client.callTool({ name: 'new_page', arguments: { url } })
  const discovered = text(await client.callTool({ name: 'list_webmcp_tools', arguments: {} }))
  if (productTools.some((name) => !discovered.includes(name))) {
    throw new Error(`Expected WebMCP tools were not discovered:\n${discovered}`)
  }

  const workspaceResult = text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'get_workspace', input: '{}' },
  }))
  const scanResult = text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'scan_accessibility', input: JSON.stringify({ reason: 'manual' }) },
  }))
  if (!completedOutput(workspaceResult) || !completedOutput(scanResult)) {
    const directDiagnostic = text(await client.callTool({
      name: 'evaluate_script',
      arguments: { function: `async () => {
        const tool = (await document.modelContext.getTools()).find(({ name }) => name === 'get_workspace')
        try { return { result: await document.modelContext.executeTool(tool, '{}') } }
        catch (error) { return { error: error instanceof Error ? error.message : String(error) } }
      }` },
    }))
    throw new Error(`Workspace or scan tool failed:\n${workspaceResult}\n${scanResult}\nDirect API diagnostic:\n${directDiagnostic}`)
  }
  const listResult = text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'list_issues', input: JSON.stringify({ impact: 'high', status: 'open', limit: 10 }) },
  }))
  const listed = completedOutput(listResult)
  const issueId = listed?.data?.issues?.[0]?.issueId
  if (!issueId) throw new Error(`Current axe issues were not returned:\n${listResult}`)
  const inspectResult = text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'inspect_issue', input: JSON.stringify({ issueId }) },
  }))
  if (!completedOutput(inspectResult)) {
    throw new Error(`The inspect workflow failed:\n${inspectResult}`)
  }
  const previewResult = text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'preview_remediation', input: JSON.stringify({
      issueId,
      family: 'name_button',
      values: { buttonName: 'Remove Canvas desk organizer' },
    }) },
  }))
  const preview = completedOutput(previewResult)
  if (preview?.data?.proposalPreviewStatus !== 'RENDERING' || preview.data.approvalRequired !== true ||
    preview.allowedNextActions?.includes('apply_remediation')) {
    throw new Error(`Contextual preview did not enter its visible human-approval gate:\n${previewResult}`)
  }
  let readyWorkspace = null
  for (let attempt = 0; attempt < 10 && !readyWorkspace; attempt += 1) {
    const result = text(await client.callTool({
      name: 'execute_webmcp_tool',
      arguments: { toolName: 'get_workspace', input: '{}' },
    }))
    const output = completedOutput(result)
    if (output?.data?.proposalPreviewStatus === 'READY') readyWorkspace = output
  }
  if (!readyWorkspace || readyWorkspace.allowedNextActions?.includes('apply_remediation')) {
    throw new Error('The contextual proposal did not become visibly READY while remaining approval-gated.')
  }

  const blockedApplyText = text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'apply_remediation', input: JSON.stringify({ proposalId: preview.data.proposalId }) },
  }))
  const blockedApply = toolOutput(blockedApplyText)
  if (blockedApply?.ok !== false || blockedApply.error?.code !== 'APPROVAL_REQUIRED' ||
    blockedApply.state?.sourceRevision !== readyWorkspace.data.sourceRevision || blockedApply.state?.proposalStatus !== 'PROPOSED') {
    throw new Error(`The contextual Apply was not blocked without mutation:\n${blockedApplyText}`)
  }

  const rejectResult = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'reject_remediation', input: JSON.stringify({ proposalId: preview.data.proposalId, reason: 'not_now' }) },
  })))
  if (rejectResult?.data?.sourceChanged !== false) throw new Error('The contextual proposal was not rejected without mutation.')

  const mechanicalList = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'list_issues', input: JSON.stringify({ classification: 'MECHANICAL', status: 'open', limit: 10 }) },
  })))
  const mechanicalIssueId = mechanicalList?.data?.issues?.find(({ ruleId }) => ruleId === 'tabindex')?.issueId
  if (!mechanicalIssueId) throw new Error(`The fixture did not expose the expected mechanical tabindex issue:\n${JSON.stringify(mechanicalList, null, 2)}`)
  const mechanicalInspect = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'inspect_issue', input: JSON.stringify({ issueId: mechanicalIssueId }) },
  })))
  if (!mechanicalInspect) throw new Error('The mechanical issue could not be inspected.')
  const mechanicalPreview = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'preview_remediation', input: JSON.stringify({ issueId: mechanicalIssueId, family: 'remove_positive_tabindex' }) },
  })))
  if (!mechanicalPreview || mechanicalPreview.data.approvalRequired !== false) {
    throw new Error('The mechanical proposal was not created as agent-applicable.')
  }
  let mechanicalReady = null
  for (let attempt = 0; attempt < 10 && !mechanicalReady; attempt += 1) {
    const output = completedOutput(text(await client.callTool({
      name: 'execute_webmcp_tool',
      arguments: { toolName: 'get_workspace', input: '{}' },
    })))
    if (output?.data?.proposalPreviewStatus === 'READY') mechanicalReady = output
  }
  if (!mechanicalReady?.allowedNextActions?.includes('apply_remediation')) {
    throw new Error('The mechanical proposal did not become visibly READY and applicable.')
  }
  const applied = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'apply_remediation', input: JSON.stringify({ proposalId: mechanicalPreview.data.proposalId }) },
  })))
  if (applied?.data?.scanStatus !== 'STALE') throw new Error('The mechanical proposal was not applied.')
  const verifiedScan = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'scan_accessibility', input: JSON.stringify({ reason: 'after_change' }) },
  })))
  if (!verifiedScan) throw new Error('The applied repair could not be rescanned.')
  const summary = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool', arguments: { toolName: 'get_change_summary', input: '{}' },
  })))
  if (summary?.data?.countsStatus !== 'CURRENT' || summary.data.verifiedCount < 1) {
    throw new Error('The applied repair was not reported as verified.')
  }
  const exported = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool', arguments: { toolName: 'export_source', input: JSON.stringify({ format: 'html' }) },
  })))
  if (exported?.data?.mappingMetadataPresent !== false) throw new Error('Canonical export metadata was not clean.')
  const undone = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool', arguments: { toolName: 'undo_remediation', input: '{}' },
  })))
  if (undone?.data?.scanStatus !== 'STALE') throw new Error('The applied repair was not undone.')
  const restoredScan = completedOutput(text(await client.callTool({
    name: 'execute_webmcp_tool',
    arguments: { toolName: 'scan_accessibility', input: JSON.stringify({ reason: 'after_change' }) },
  })))
  if (!restoredScan) throw new Error('The restored source could not be rescanned.')

  await client.callTool({ name: 'navigate_page', arguments: { type: 'reload' } })
  const reloadDiscovery = text(await client.callTool({ name: 'list_webmcp_tools', arguments: {} }))
  if (productTools.some((name) => !reloadDiscovery.includes(name))) {
    throw new Error(`WebMCP tools were not functional after reload:\n${reloadDiscovery}`)
  }
  const consoleMessages = text(await client.callTool({
    name: 'list_console_messages',
    arguments: { types: ['error'] },
  }))

  console.log(JSON.stringify({
    url,
    discoveredTools: productTools,
    workflow: [
      'get_workspace', 'scan_accessibility', 'list_issues', 'inspect_issue', 'preview_remediation',
      'apply_remediation:blocked', 'reject_remediation', 'inspect_issue', 'preview_remediation:mechanical', 'get_workspace:READY',
      'apply_remediation', 'scan_accessibility:after_change', 'get_change_summary', 'export_source',
      'undo_remediation', 'scan_accessibility:after_undo',
    ],
    inspectedIssueId: issueId,
    reloadRediscovered: productTools.every((name) => reloadDiscovery.includes(name)),
    consoleErrors: consoleMessages,
  }, null, 2))
} finally {
  await client.close()
}

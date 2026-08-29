import { readFileSync } from 'node:fs'

const tools = JSON.parse(readFileSync(new URL('../evals/tools.json', import.meta.url), 'utf8')).tools
const cases = JSON.parse(readFileSync(new URL('../evals/webmcp-agent.json', import.meta.url), 'utf8'))
const names = new Set(tools.map(({ name }) => name))
const expectedTools = new Set([
  'get_workspace', 'scan_accessibility', 'list_issues', 'inspect_issue', 'preview_remediation',
  'apply_remediation', 'reject_remediation', 'undo_remediation', 'get_change_summary', 'export_source',
])
const expectedIntents = new Set([
  'find_high_impact',
  'inspect_email',
  'preview_only',
  'human_judgment',
  'apply_after_approval',
  'mechanical_apply',
  'wrong_order_recovery',
  'undo',
  'export_summary',
  'preview_button_name',
  'preview_document_language',
  'reject_proposal',
])
const intents = new Map()
const caseNames = new Set()

const fail = (message) => { throw new Error(message) }
const sourceLeak = (value) => /<!doctype|<html|data-curbcut-node/iu.test(JSON.stringify(value))
const baselineScanMetrics = Object.freeze({
  critical: 3,
  serious: 3,
  moderate: 0,
  minor: 0,
  manualReviewsOutstanding: 5,
})
const postLabelScanMetrics = Object.freeze({
  critical: 2,
  serious: 3,
  moderate: 0,
  minor: 0,
  manualReviewsOutstanding: 4,
})
const postMechanicalScanMetrics = Object.freeze({
  critical: 3,
  serious: 2,
  moderate: 0,
  minor: 0,
  manualReviewsOutstanding: 5,
})
const postLabelSummaryMetrics = Object.freeze({
  openCriticalSerious: 5,
  manualReviewsOutstanding: 4,
})
const preApplySummaryMetrics = Object.freeze({
  openCriticalSerious: 6,
  manualReviewsOutstanding: 5,
})

const assertMetrics = (caseName, outputName, actual, expected) => {
  for (const [metric, frozenValue] of Object.entries(expected)) {
    if (actual?.[metric] !== frozenValue) {
      fail(`${caseName} ${outputName} must report frozen ${metric}=${frozenValue}; received ${actual?.[metric]}.`)
    }
  }
}

if (!Array.isArray(tools) || tools.length !== 10 || names.size !== 10 || [...expectedTools].some((name) => !names.has(name))) {
  fail('Eval schema must contain exactly the ten Curbcut tools.')
}
if ([...names].some((name) => typeof name !== 'string' || name.length > 30)) fail('Eval tool names must be non-empty and at most 30 characters.')
const previewSchema = tools.find(({ name }) => name === 'preview_remediation')?.inputSchema
const families = previewSchema?.properties?.family?.enum
const valueProperties = previewSchema?.properties?.values?.properties
if (JSON.stringify(families) !== JSON.stringify(['add_form_label', 'remove_positive_tabindex', 'set_image_alt', 'name_button', 'set_document_language']) ||
  valueProperties?.buttonName?.maxLength !== 120 || valueProperties?.languageTag?.maxLength !== 35) {
  fail('Eval preview schema must expose all five bounded repair families and their semantic inputs.')
}

for (const test of cases) {
  if (!test.name || !test.intent || !Array.isArray(test.messages) || !test.messages.length || !Array.isArray(test.expectedCall) || !test.expectedCall.length) {
    fail(`Invalid eval case: ${test.name ?? 'unnamed'}`)
  }
  if (caseNames.has(test.name)) fail(`Duplicate eval case name: ${test.name}`)
  caseNames.add(test.name)
  if (!expectedIntents.has(test.intent)) fail(`${test.name} uses unknown intent ${test.intent}.`)
  intents.set(test.intent, (intents.get(test.intent) ?? 0) + 1)

  const lastMessage = test.messages.at(-1)
  if (lastMessage?.role !== 'user' || lastMessage.type !== 'message' || typeof lastMessage.content !== 'string' || !lastMessage.content.trim()) {
    fail(`${test.name} must end with one non-empty user prompt.`)
  }
  if (test.expectedCall.length > 8) fail(`${test.name} exceeds the eight-step runner budget.`)

  let approvedStateSeen = false
  let mechanicalProposalSeen = false
  let mechanicalPreviewReady = false
  for (const call of test.expectedCall) {
    if (!call || typeof call !== 'object' || typeof call.functionName !== 'string' || !names.has(call.functionName)) {
      fail(`${test.name} contains an invalid expected tool call.`)
    }
    if (call.arguments !== undefined && (!call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments))) {
      fail(`${test.name} has invalid arguments for ${call.functionName}.`)
    }
    if (call.optional !== undefined && (typeof call.optional !== 'boolean' || call.optional && !['get_workspace', 'get_change_summary'].includes(call.functionName))) {
      fail(`${test.name} may mark only bounded state reads optional.`)
    }
    if (!call.mockOutput || typeof call.mockOutput !== 'object' || Array.isArray(call.mockOutput)) {
      fail(`${test.name} must provide a realistic object mockOutput for ${call.functionName}.`)
    }
    if (JSON.stringify(call.mockOutput).length > 1_500) fail(`${test.name} mock output for ${call.functionName} exceeds the product output budget.`)
    if (sourceLeak(call.mockOutput)) fail(`${test.name} leaks canonical or preview-only source through ${call.functionName}.`)
    if (call.mockOutput.ok !== true || !Array.isArray(call.mockOutput.allowedNextActions) ||
      call.mockOutput.allowedNextActions.some((action) => !names.has(action))) {
      fail(`${test.name} has an invalid bounded success output for ${call.functionName}.`)
    }
    if (call.mockOutput.data?.proposalStatus === 'APPROVED') approvedStateSeen = true
    if (call.functionName === 'get_workspace' && call.mockOutput.data?.proposalPreviewStatus === 'READY' &&
      call.mockOutput.allowedNextActions.includes('apply_remediation')) mechanicalPreviewReady = true
    if (call.functionName === 'scan_accessibility') {
      const isVerifiedScan = typeof call.mockOutput.data?.verifiedChangeId === 'string'
      const expectedMetrics = !isVerifiedScan
        ? baselineScanMetrics
        : test.intent === 'mechanical_apply' ? postMechanicalScanMetrics : postLabelScanMetrics
      assertMetrics(
        test.name,
        !isVerifiedScan ? 'baseline/undo scan' : test.intent === 'mechanical_apply' ? 'post-mechanical scan' : 'post-label scan',
        call.mockOutput.data,
        expectedMetrics,
      )
    }
    if (call.functionName === 'get_change_summary') {
      const summaryMetrics = test.intent === 'apply_after_approval' ? preApplySummaryMetrics : postLabelSummaryMetrics
      assertMetrics(test.name, 'current change summary', call.mockOutput.data, summaryMetrics)
      if (call.mockOutput.data?.countsStatus !== 'CURRENT') fail(`${test.name} current change summary must identify its scan counts as CURRENT.`)
    }
    if (call.functionName === 'list_issues' && call.mockOutput.data?.totalMatching === 6) {
      const listedIssues = call.mockOutput.data?.issues
      const tabindexIssue = listedIssues?.find(({ ruleId }) => ruleId === 'tabindex')
      if (!Array.isArray(listedIssues) || listedIssues.length !== 6 ||
        tabindexIssue?.impact !== 'serious' || tabindexIssue?.classification !== 'MECHANICAL') {
        fail(`${test.name} six-finding list must include the frozen serious mechanical tabindex finding.`)
      }
    }
    if (call.functionName === 'apply_remediation' &&
      !((test.intent === 'apply_after_approval' && approvedStateSeen) ||
        (test.intent === 'mechanical_apply' && mechanicalProposalSeen && mechanicalPreviewReady))) {
      fail(`${test.name} may apply only after visible approval for contextual work or a visible mechanical proposal.`)
    }
    if (call.functionName === 'preview_remediation') {
      const mechanical = call.mockOutput.data?.classification === 'MECHANICAL'
      const applyEnabled = call.mockOutput.allowedNextActions.includes('apply_remediation')
      if (call.mockOutput.data?.approvalState !== 'PROPOSED' ||
        (call.mockOutput.data?.proposalPreviewStatus !== undefined && call.mockOutput.data.proposalPreviewStatus !== 'RENDERING') ||
        (mechanical && (call.mockOutput.data?.approvalRequired !== false || applyEnabled)) ||
        (!mechanical && (call.mockOutput.data?.approvalRequired !== true || applyEnabled))) {
        fail(`${test.name} preview must remain non-applicable while its visible iframe is rendering and contextual work awaits approval.`)
      }
      if (mechanical) mechanicalProposalSeen = true
    }
  }

  const seededApplies = test.messages.filter(({ type, name }) => type === 'functioncall' && name === 'apply_remediation')
  if (seededApplies.length) {
    const refusal = test.messages.some(({ type, name, response }) =>
      type === 'functionresponse' && name === 'apply_remediation' &&
      ['APPROVAL_REQUIRED', 'PROPOSAL_NOT_FOUND'].includes(response?.result?.error?.code))
    if (test.intent !== 'wrong_order_recovery' || seededApplies.length !== 1 || !refusal) {
      fail(`${test.name} contains an unsafe or unpaired seeded Apply call.`)
    }
  }
  if (test.intent === 'wrong_order_recovery' &&
    (test.expectedCall.some(({ functionName }) => functionName === 'apply_remediation') || !seededApplies.length)) {
    fail(`${test.name} must recover from one injected Apply refusal and stop before Apply.`)
  }
  if (test.intent === 'find_high_impact') {
    const list = test.expectedCall.find(({ functionName }) => functionName === 'list_issues')
    if (list?.arguments?.impact !== 'high' || list.arguments.status !== 'open') {
      fail(`${test.name} must exercise the strict high-impact aggregate filter.`)
    }
  }
  if (test.intent === 'mechanical_apply' &&
    ![
      'get_workspace>scan_accessibility>list_issues>inspect_issue>preview_remediation>get_workspace>apply_remediation>scan_accessibility',
      'scan_accessibility>list_issues>inspect_issue>preview_remediation>get_workspace>apply_remediation>scan_accessibility',
    ].includes(test.expectedCall.map(({ functionName }) => functionName).join('>'))) {
    fail(`${test.name} must inspect the issue and poll get_workspace for a READY visible preview before mechanical Apply.`)
  }
  if (test.intent === 'human_judgment' &&
    test.expectedCall.some(({ functionName }) => ['preview_remediation', 'apply_remediation'].includes(functionName))) {
    fail(`${test.name} must stop for human judgment before preview or Apply.`)
  }
  if (test.intent === 'undo') {
    const [workspace, undo, rescan] = test.expectedCall
    if (workspace?.functionName !== 'get_workspace' || workspace.optional !== true ||
      undo?.functionName !== 'undo_remediation' || rescan?.functionName !== 'scan_accessibility') {
      fail(`${test.name} must allow direct Undo and require the verification rescan.`)
    }
  }
  if (test.intent === 'preview_button_name' || test.intent === 'preview_document_language') {
    const expectedFamily = test.intent === 'preview_button_name' ? 'name_button' : 'set_document_language'
    const expectedValue = test.intent === 'preview_button_name' ? 'buttonName' : 'languageTag'
    const sequence = test.expectedCall.map(({ functionName }) => functionName).join('>')
    const preview = test.expectedCall.find(({ functionName }) => functionName === 'preview_remediation')
    if (sequence !== 'scan_accessibility>list_issues>inspect_issue>preview_remediation' ||
      preview?.arguments?.family !== expectedFamily || typeof preview?.arguments?.values?.[expectedValue] !== 'string' ||
      test.expectedCall.some(({ functionName }) => functionName === 'apply_remediation')) {
      fail(`${test.name} must scan, list, inspect, and preview ${expectedFamily} with explicit human input, then stop before Apply.`)
    }
  }
  if (test.intent === 'reject_proposal') {
    const sequence = test.expectedCall.map(({ functionName }) => functionName).join('>')
    const rejection = test.expectedCall.find(({ functionName }) => functionName === 'reject_remediation')
    if (sequence !== 'get_workspace>reject_remediation' || rejection?.mockOutput?.data?.sourceChanged !== false ||
      test.expectedCall.some(({ functionName }) => functionName === 'apply_remediation')) {
      fail(`${test.name} must discover and reject the current proposal without changing source.`)
    }
  }
}

if (!Array.isArray(cases) || cases.length !== 36 || intents.size !== expectedIntents.size ||
  [...expectedIntents].some((intent) => intents.get(intent) !== 3)) {
  fail('Eval corpus must contain exactly three paraphrases for each of the twelve required intents.')
}

console.log(`Eval corpus valid: ${cases.length} cases, ${intents.size} intents, ${tools.length} tools.`)

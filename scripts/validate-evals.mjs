import { readFileSync } from 'node:fs'

const tools = JSON.parse(readFileSync(new URL('../evals/tools.json', import.meta.url), 'utf8')).tools
const cases = JSON.parse(readFileSync(new URL('../evals/webmcp-agent.json', import.meta.url), 'utf8'))
const names = new Set(tools.map(({ name }) => name))
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

const assertMetrics = (caseName, outputName, actual, expected) => {
  for (const [metric, frozenValue] of Object.entries(expected)) {
    if (actual?.[metric] !== frozenValue) {
      fail(`${caseName} ${outputName} must report frozen ${metric}=${frozenValue}; received ${actual?.[metric]}.`)
    }
  }
}

if (!Array.isArray(tools) || tools.length !== 10 || names.size !== 10) fail('Eval schema must contain exactly ten unique tools.')
if ([...names].some((name) => typeof name !== 'string' || name.length > 30)) fail('Eval tool names must be non-empty and at most 30 characters.')

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
  if (test.expectedCall.length > 6) fail(`${test.name} exceeds the six-step runner budget.`)

  let approvedStateSeen = false
  let mechanicalProposalSeen = false
  for (const call of test.expectedCall) {
    if (!call || typeof call !== 'object' || typeof call.functionName !== 'string' || !names.has(call.functionName)) {
      fail(`${test.name} contains an invalid expected tool call.`)
    }
    if (call.arguments !== undefined && (!call.arguments || typeof call.arguments !== 'object' || Array.isArray(call.arguments))) {
      fail(`${test.name} has invalid arguments for ${call.functionName}.`)
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
      assertMetrics(test.name, 'post-label change summary', call.mockOutput.data, postLabelSummaryMetrics)
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
        (test.intent === 'mechanical_apply' && mechanicalProposalSeen))) {
      fail(`${test.name} may apply only after visible approval for contextual work or a visible mechanical proposal.`)
    }
    if (call.functionName === 'preview_remediation') {
      const mechanical = call.mockOutput.data?.classification === 'MECHANICAL'
      const applyEnabled = call.mockOutput.allowedNextActions.includes('apply_remediation')
      if (call.mockOutput.data?.approvalState !== 'PROPOSED' ||
        (mechanical && (call.mockOutput.data?.approvalRequired !== false || !applyEnabled)) ||
        (!mechanical && (call.mockOutput.data?.approvalRequired !== true || applyEnabled))) {
        fail(`${test.name} preview must enable exact mechanical Apply and gate contextual Apply on visible approval.`)
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
  if (test.intent === 'human_judgment' &&
    test.expectedCall.some(({ functionName }) => ['preview_remediation', 'apply_remediation'].includes(functionName))) {
    fail(`${test.name} must stop for human judgment before preview or Apply.`)
  }
}

if (!Array.isArray(cases) || cases.length !== 27 || intents.size !== expectedIntents.size ||
  [...expectedIntents].some((intent) => intents.get(intent) !== 3)) {
  fail('Eval corpus must contain exactly three paraphrases for each of the nine required intents.')
}

console.log(`Eval corpus valid: ${cases.length} cases, ${intents.size} intents, ${tools.length} tools.`)

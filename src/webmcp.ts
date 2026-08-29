import { useEffect } from 'react'
import type { AccessibilityIssue, Classification, Impact } from './axeAdapter'
import { requiresHumanApproval } from './proposal'
import type { HumanValues, RepairFamily } from './repairs'
import { workspaceStore, type CommandErrorCode, type CommandResult, type WorkspaceState } from './workspaceStore'

export const WEBMCP_TOOL_NAMES = [
  'get_workspace', 'scan_accessibility', 'list_issues', 'inspect_issue', 'preview_remediation',
  'apply_remediation', 'reject_remediation', 'undo_remediation', 'get_change_summary', 'export_source',
] as const

export type WebMcpToolName = typeof WEBMCP_TOOL_NAMES[number]
type IssueImpactFilter = Exclude<Impact, null> | 'high' | 'all'
type ToolOutput = { ok: boolean; data?: Record<string, unknown>; error?: Record<string, unknown>; state?: Record<string, unknown>; allowedNextActions: WebMcpToolName[] }
type ToolHandler = (args: Record<string, unknown>, signal: AbortSignal) => Promise<ToolOutput>

const isRecord = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value)
const hasOnly = (value: Record<string, unknown>, keys: readonly string[]) => Object.keys(value).every((key) => keys.includes(key))
const validString = (value: unknown, max: number) => typeof value === 'string' && value.length >= 1 && value.length <= max
const emptySchema = { type: 'object', properties: {}, additionalProperties: false } as const

const FAMILY = {
  add_form_label: { internal: 'missing-form-label', rule: 'label' },
  remove_positive_tabindex: { internal: 'positive-tabindex', rule: 'tabindex' },
  set_image_alt: { internal: 'image-alternative', rule: 'image-alt' },
  name_button: { internal: 'button-accessible-name', rule: 'button-name' },
  set_document_language: { internal: 'document-language', rule: 'html-has-lang' },
} as const
type PublicFamily = keyof typeof FAMILY

const visibleText = (value: unknown, max: number) => typeof value === 'string' && value === value.trim() &&
  Array.from(value).length >= 1 && Array.from(value).length <= max && !/[\u0000-\u001f\u007f]/u.test(value)
const validLanguageTag = (value: unknown) => {
  if (!visibleText(value, 35) || !/^[A-Za-z0-9]+(?:-[A-Za-z0-9]+)*$/u.test(value as string)) return false
  try {
    return Intl.getCanonicalLocales(value as string).length === 1
  } catch {
    return false
  }
}

const proposalStatus = (state: WorkspaceState) => state.proposal?.status ?? 'NONE'
const stateSummary = (state = workspaceStore.getSnapshot()) => ({
  sourceRevision: state.sourceRevision,
  scanStatus: state.scanStatus,
  proposalStatus: proposalStatus(state),
  proposalPreviewStatus: state.proposalPreview.status,
  mutationStatus: state.mutationStatus,
})

export function allowedNextActions(state = workspaceStore.getSnapshot()): WebMcpToolName[] {
  const actions: WebMcpToolName[] = ['get_workspace', 'get_change_summary']
  if (state.htmlSource.trim() || state.cssSource.trim()) actions.push('export_source')
  if (state.mutationStatus !== 'IDLE') return actions
  const pending = state.proposal && (state.proposal.status === 'PROPOSED' || state.proposal.status === 'APPROVED')
  if (pending) {
    actions.push('reject_remediation')
    const rendered = state.proposalPreview.proposalId === state.proposal?.proposalId && state.proposalPreview.status === 'READY'
    if (rendered && (state.proposal?.status === 'APPROVED' || (state.proposal?.status === 'PROPOSED' && !requiresHumanApproval(state.proposal)))) {
      actions.push('apply_remediation')
    }
  } else if (state.workspaceStatus === 'READY' && state.scanStatus !== 'RUNNING') {
    actions.push('scan_accessibility')
    if (state.scanStatus === 'CURRENT' && state.scan?.sourceRevision === state.sourceRevision) {
      actions.push('list_issues', 'inspect_issue', 'preview_remediation')
    }
  }
  const latest = state.history.at(-1)
  if (latest && !latest.undoneAt && latest.afterHtml === state.htmlSource && latest.afterCss === state.cssSource) actions.push('undo_remediation')
  return actions
}

const success = (data: Record<string, unknown>): ToolOutput => ({ ok: true, data, state: stateSummary(), allowedNextActions: allowedNextActions() })
const requiredState: Partial<Record<CommandErrorCode, string>> = {
  APPROVAL_REQUIRED: 'APPROVED', SCAN_REQUIRED: 'CURRENT_SCAN', STALE_SCAN: 'CURRENT_SCAN',
  PROPOSAL_NOT_FOUND: 'VISIBLE_PROPOSAL', PREVIEW_NOT_READY: 'READY_PREVIEW', CHANGE_IN_PROGRESS: 'IDLE_CHANGE_STATE',
}
const failure = (code: CommandErrorCode, message: string, recoverable = code !== 'INTERNAL_ERROR'): ToolOutput => ({
  ok: false,
  error: { code, message, recoverable, ...(requiredState[code] ? { requiredState: requiredState[code] } : {}) },
  state: stateSummary(),
  allowedNextActions: allowedNextActions(),
})
const fromCommand = <T,>(result: CommandResult<T>, map: (data: T) => Record<string, unknown>): ToolOutput =>
  result.ok ? success(map(result.data)) : failure(result.error.code, result.error.message, result.error.recoverable)

function currentScan(): ToolOutput | null {
  const state = workspaceStore.getSnapshot()
  if (!state.scan) return failure('SCAN_REQUIRED', 'Run scan_accessibility before using current issue data.')
  if (state.scanStatus !== 'CURRENT' || state.scan.sourceRevision !== state.sourceRevision) return failure('STALE_SCAN', 'The source changed after this scan. Run scan_accessibility again.')
  return null
}

function publicFamily(issue: AccessibilityIssue): PublicFamily | null {
  if (issue.ruleId === 'label' && issue.sourceNode && ['input', 'select', 'textarea'].includes(issue.sourceNode.tagName)) return 'add_form_label'
  if (issue.ruleId === 'tabindex' && issue.sourceNode) return 'remove_positive_tabindex'
  if (issue.ruleId === 'image-alt' && issue.sourceNode?.tagName === 'img') return 'set_image_alt'
  if (issue.ruleId === 'button-name' && issue.sourceNode?.tagName === 'button') return 'name_button'
  if (issue.ruleId === 'html-has-lang' && issue.sourceNode?.tagName === 'html') return 'set_document_language'
  return null
}

function requiredInputs(family: PublicFamily): string[] {
  if (family === 'add_form_label') return ['labelText only when no safe adjacent visible-text candidate exists']
  if (family === 'set_image_alt') return ['altMode', 'altText when meaningful']
  if (family === 'name_button') return ['buttonName']
  if (family === 'set_document_language') return ['languageTag']
  return []
}

const handlers: Record<WebMcpToolName, ToolHandler> = {
  async get_workspace() {
    const state = workspaceStore.getSnapshot()
    const latest = state.history.at(-1)
    return success({
      workspaceStatus: state.workspaceStatus, previewStatus: state.previewStatus, scanStatus: state.scanStatus,
      sourceRevision: state.sourceRevision, ...(state.scan ? {
        scanId: state.scan.scanId,
        counts: state.scan.metrics,
        countsStatus: state.scan.coverage.truncated ? 'LOWER_BOUND' : 'COMPLETE',
        scanCoverage: state.scan.coverage,
      } : {}),
      ...(state.selectedIssueId ? { selectedIssueId: state.selectedIssueId } : {}),
      ...(state.proposal ? { proposalId: state.proposal.proposalId } : {}), proposalStatus: proposalStatus(state),
      proposalPreviewStatus: state.proposalPreview.status, mutationStatus: state.mutationStatus,
      ...(latest ? { latestChangeId: latest.changeId } : {}),
      canUndo: Boolean(latest && !latest.undoneAt && latest.afterHtml === state.htmlSource && latest.afterCss === state.cssSource),
      webMcpAvailable: typeof document !== 'undefined' && Boolean(document.modelContext),
    })
  },
  async scan_accessibility(args, signal) {
    const result = await workspaceStore.scan(args.reason as 'initial' | 'after_change' | 'manual', signal)
    const notice = workspaceStore.getSnapshot().verificationNotice
    return fromCommand(result, (scan) => ({
      scanId: scan.scanId, sourceRevision: scan.sourceRevision, ...scan.metrics,
      countsStatus: scan.coverage.truncated ? 'LOWER_BOUND' : 'COMPLETE',
      scanCoverage: scan.coverage,
      ...(notice?.outcome === 'VERIFIED' ? { verifiedChangeId: notice.changeId } : {}),
    }))
  },
  async list_issues(args) {
    const scanError = currentScan()
    if (scanError) return scanError
    const state = workspaceStore.getSnapshot()
    const impact = (args.impact ?? 'all') as IssueImpactFilter
    const classification = (args.classification ?? 'all') as Classification | 'all'
    const status = (args.status ?? 'open') as 'open' | 'verified' | 'all'
    const limit = (args.limit ?? 10) as number
    const rank: Record<string, number> = { critical: 0, serious: 1, moderate: 2, minor: 3 }
    const open = status === 'verified' ? [] : [...state.issues]
      .filter((issue) => (impact === 'all' ||
        (impact === 'high' ? issue.impact === 'critical' || issue.impact === 'serious' : issue.impact === impact)) &&
        (classification === 'all' || issue.classification === classification))
      .sort((left, right) => (rank[left.impact ?? ''] ?? 4) - (rank[right.impact ?? ''] ?? 4))
      .map((issue) => ({ issueId: issue.issueId, ruleId: issue.ruleId, impact: issue.impact, classification: issue.classification,
        status: 'open', targetSummary: issue.target.join(' ').slice(0, 80), ...(issue.sourceNode ? { sourceLine: issue.sourceNode.sourceRange.startLine } : {}) }))
    const verified = status === 'open' ? [] : state.history
      .filter((change) => change.verification === 'VERIFIED' && !change.undoneAt && (classification === 'all' || change.classification === classification))
      .map((change) => ({ issueId: change.issueId, ruleId: change.ruleId, impact: null, classification: change.classification,
        status: 'verified', sourceLine: change.sourceLine, changeId: change.changeId }))
    const issues = [...open, ...verified]
    return success({
      scanId: state.scan!.scanId,
      totalMatching: issues.length,
      countsStatus: state.scan!.coverage.truncated ? 'LOWER_BOUND' : 'COMPLETE',
      scanCoverage: state.scan!.coverage,
      issues: issues.slice(0, limit),
    })
  },
  async inspect_issue(args, signal) {
    const result = await workspaceStore.inspectIssue(String(args.issueId), signal)
    return fromCommand(result, (issue) => ({
      issueId: issue.issueId, ruleId: issue.ruleId, impact: issue.impact, help: issue.help.slice(0, 180), helpUrl: issue.helpUrl,
      wcagTags: issue.tags.filter((tag) => tag.startsWith('wcag')).slice(0, 8), classification: issue.classification,
      classificationReason: issue.classificationReason.slice(0, 180), target: issue.target.join(' ').slice(0, 120),
      sourceLocation: issue.sourceNode ? { line: issue.sourceNode.sourceRange.startLine, column: issue.sourceNode.sourceRange.startColumn,
        startOffset: issue.sourceNode.sourceRange.startOffset, endOffset: issue.sourceNode.sourceRange.endOffset } : null,
      ...(publicFamily(issue) ? { repairFamily: publicFamily(issue), requiredInputs: requiredInputs(publicFamily(issue)!) } : {}),
    }))
  },
  async preview_remediation(args, signal) {
    const scanError = currentScan()
    if (scanError) return scanError
    const issue = workspaceStore.getSnapshot().issues.find((item) => item.issueId === args.issueId)
    if (!issue) return failure('ISSUE_NOT_FOUND', 'That issue is not part of the current scan.')
    const family = args.family as PublicFamily
    if (!publicFamily(issue) || publicFamily(issue) !== family) return failure('ISSUE_NOT_REPAIRABLE', 'That issue and repair family are not a supported match.')
    const selected = await workspaceStore.inspectIssue(issue.issueId, signal)
    if (!selected.ok) return failure(selected.error.code, selected.error.message, selected.error.recoverable)
    const result = await workspaceStore.previewRepair(issue.issueId, FAMILY[family].internal as RepairFamily, (args.values ?? {}) as HumanValues, signal)
    if (!result.ok) return failure(result.error.code === 'REPAIR_REFUSED' ? 'ISSUE_NOT_REPAIRABLE' : result.error.code, result.error.message, result.error.recoverable)
    const proposal = result.data
    return success({ proposalId: proposal.proposalId, issueId: proposal.issueId, family, classification: proposal.classification,
      semanticJudgmentRequired: proposal.semanticJudgmentRequired, editCount: proposal.patches.length,
      diffSummary: `${proposal.patches.length} surgical source edit${proposal.patches.length === 1 ? '' : 's'}; exact diff is visible in Curbcut.`,
      validationTarget: proposal.expectedValidation.slice(0, 160), approvalRequired: requiresHumanApproval(proposal),
      agentMayApply: !requiresHumanApproval(proposal), approvalState: proposal.status,
      proposalPreviewStatus: workspaceStore.getSnapshot().proposalPreview.status,
      next: 'Poll get_workspace until proposalPreviewStatus is READY before Apply.' })
  },
  async apply_remediation(args, signal) {
    const result = await workspaceStore.applyProposal(String(args.proposalId), signal)
    return fromCommand(result, (change) => ({ changeId: change.changeId, proposalId: change.proposalId,
      sourceRevision: change.appliedRevision, scanStatus: 'STALE', next: 'scan_accessibility' }))
  },
  async reject_remediation(args) {
    return fromCommand(workspaceStore.rejectProposal(String(args.proposalId)), (proposal) => ({ proposalId: proposal.proposalId, status: 'REJECTED', sourceChanged: false }))
  },
  async undo_remediation(_args, signal) {
    return fromCommand(await workspaceStore.undoLatest(signal), (change) => ({ undoneChangeId: change.changeId,
      sourceRevision: change.undoneRevision, scanStatus: 'STALE', next: 'scan_accessibility' }))
  },
  async get_change_summary() {
    const state = workspaceStore.getSnapshot()
    const countsCurrent = state.scanStatus === 'CURRENT' && state.scan?.sourceRevision === state.sourceRevision
    const changes = state.history.slice(-10).map((change) => ({ changeId: change.changeId, family: change.family, ruleId: change.ruleId,
      status: change.undoneAt ? 'UNDONE' : change.verification, sourceLine: change.sourceLine }))
    if (state.proposal?.status === 'REJECTED') changes.push({ changeId: state.proposal.proposalId, family: state.proposal.family,
      ruleId: state.proposal.validationTarget.ruleId, status: 'REJECTED',
      sourceLine: state.htmlSource.slice(0, state.proposal.affectedSourceRange.start).split(/\r?\n/u).length })
    return success({ sourceRevision: state.sourceRevision, appliedCount: state.history.length,
      verifiedCount: state.history.filter((change) => change.verification === 'VERIFIED').length,
      undoneCount: state.history.filter((change) => change.undoneAt).length,
      countsStatus: countsCurrent ? 'CURRENT' : 'STALE',
      ...(countsCurrent ? { scanCoverageStatus: state.scan!.coverage.truncated ? 'LOWER_BOUND' : 'COMPLETE' } : {}),
      ...(countsCurrent ? {
        openCriticalSerious: state.issues.filter((issue) => issue.resultKind === 'violation' && (issue.impact === 'critical' || issue.impact === 'serious')).length,
        manualReviewsOutstanding: state.scan!.metrics.manualReviewsOutstanding,
      } : {}),
      changes: changes.slice(-10) })
  },
  async export_source(args) {
    return fromCommand(await workspaceStore.exportSource(args.format as 'html' | 'css' | 'workspace'), (metadata) => ({
      success: true,
      format: metadata.kind,
      filename: metadata.filename,
      sourceRevision: metadata.sourceRevision,
      sourceHash: metadata.sha256,
      mappingMetadataPresent: metadata.mappingMetadataPresent,
    }))
  },
}

function invalid(message: string, code: 'INVALID_INPUT' | 'INPUT_REQUIRED' = 'INVALID_INPUT'): CommandResult<Record<string, unknown>> {
  return { ok: false, error: { code, message, recoverable: true } }
}

function validate(name: WebMcpToolName, value: unknown): CommandResult<Record<string, unknown>> {
  if (!isRecord(value)) return invalid('Tool input must be a JSON object.')
  const args = value
  if (name === 'get_workspace' || name === 'undo_remediation' || name === 'get_change_summary') return hasOnly(args, []) ? { ok: true, data: args } : invalid('This tool accepts no properties.')
  if (name === 'scan_accessibility') return hasOnly(args, ['reason']) && ['initial', 'after_change', 'manual'].includes(String(args.reason))
    ? { ok: true, data: args } : invalid('reason must be initial, after_change, or manual.')
  if (name === 'list_issues') {
    const valid = hasOnly(args, ['impact', 'classification', 'status', 'limit']) &&
      (args.impact === undefined || ['critical', 'serious', 'moderate', 'minor', 'high', 'all'].includes(String(args.impact))) &&
      (args.classification === undefined || ['MECHANICAL', 'CONTEXTUAL', 'MANUAL_REVIEW', 'all'].includes(String(args.classification))) &&
      (args.status === undefined || ['open', 'verified', 'all'].includes(String(args.status))) &&
      (args.limit === undefined || (Number.isInteger(args.limit) && Number(args.limit) >= 1 && Number(args.limit) <= 10))
    return valid ? { ok: true, data: args } : invalid('One or more issue filters are invalid.')
  }
  if (name === 'inspect_issue' || name === 'apply_remediation') {
    const key = name === 'inspect_issue' ? 'issueId' : 'proposalId'
    return hasOnly(args, [key]) && validString(args[key], 180) ? { ok: true, data: args } : invalid(`${key} must identify current visible state.`)
  }
  if (name === 'reject_remediation') return hasOnly(args, ['proposalId', 'reason']) && validString(args.proposalId, 180) && ['not_correct', 'needs_revision', 'not_now'].includes(String(args.reason))
    ? { ok: true, data: args } : invalid('proposalId and a supported rejection reason are required.')
  if (name === 'export_source') return hasOnly(args, ['format']) && ['html', 'css', 'workspace'].includes(String(args.format))
    ? { ok: true, data: args } : invalid('format must be html, css, or workspace.')
  if (name === 'preview_remediation') {
    if (!hasOnly(args, ['issueId', 'family', 'values']) || !validString(args.issueId, 180) || !Object.hasOwn(FAMILY, String(args.family)) ||
      (args.values !== undefined && (!isRecord(args.values) || !hasOnly(args.values, ['labelText', 'altMode', 'altText', 'buttonName', 'languageTag'])))) return invalid('The issue, repair family, or values object is invalid.')
    const family = args.family as PublicFamily
    const values = (args.values ?? {}) as Record<string, unknown>
    if (family === 'add_form_label' && values.labelText !== undefined && !visibleText(values.labelText, 120)) return invalid('labelText must be 1–120 visible characters without edge whitespace.')
    if (family === 'set_image_alt' && values.altMode !== 'meaningful' && values.altMode !== 'decorative') return invalid('A human must choose meaningful or decorative image purpose.', 'INPUT_REQUIRED')
    if (family === 'set_image_alt' && values.altMode === 'meaningful' && !visibleText(values.altText, 160)) return invalid('Human-chosen altText is required for a meaningful image.', 'INPUT_REQUIRED')
    if (family === 'name_button' && values.buttonName === undefined) return invalid('A human-confirmed buttonName is required.', 'INPUT_REQUIRED')
    if (family === 'name_button' && !visibleText(values.buttonName, 120)) return invalid('buttonName must be 1–120 visible characters without edge whitespace.')
    if (family === 'set_document_language' && values.languageTag === undefined) return invalid('A human-confirmed languageTag is required.', 'INPUT_REQUIRED')
    if (family === 'set_document_language' && !validLanguageTag(values.languageTag)) return invalid('languageTag must be one valid 1–35 character BCP 47 language tag.')
    if ((family === 'add_form_label' && Object.keys(values).some((key) => key !== 'labelText')) ||
      (family === 'remove_positive_tabindex' && Object.keys(values).length > 0) ||
      (family === 'set_image_alt' && Object.keys(values).some((key) => !['altMode', 'altText'].includes(key))) ||
      (family === 'set_image_alt' && values.altMode === 'decorative' && values.altText !== undefined) ||
      (family === 'name_button' && Object.keys(values).some((key) => key !== 'buttonName')) ||
      (family === 'set_document_language' && Object.keys(values).some((key) => key !== 'languageTag'))) return invalid('values contains fields that do not apply to this repair family.')
    return { ok: true, data: args }
  }
  return invalid('Unknown tool input.')
}

function activityInput(name: WebMcpToolName, args: Record<string, unknown>) {
  if (name === 'scan_accessibility') return `reason ${args.reason}`
  if (name === 'list_issues') return `filters ${args.impact ?? 'all'}/${args.classification ?? 'all'}/${args.status ?? 'open'}`
  if (name === 'preview_remediation') return `${args.family}; issue ${String(args.issueId).slice(0, 36)}`
  if (name === 'inspect_issue') return `issue ${String(args.issueId).slice(0, 36)}`
  if (name === 'apply_remediation' || name === 'reject_remediation') return `proposal ${String(args.proposalId).slice(0, 36)}`
  if (name === 'export_source') return `format ${args.format}`
  return 'no source content'
}

export async function executeWorkspaceTool(name: WebMcpToolName, input: unknown, signal = new AbortController().signal) {
  let args: Record<string, unknown> = {}
  let response: ToolOutput
  try {
    const checked = validate(name, input)
    if (!checked.ok) response = failure(checked.error.code, checked.error.message, checked.error.recoverable)
    else {
      args = checked.data
      response = signal.aborted ? failure('CANCELLED', 'The WebMCP execution was cancelled.') : await handlers[name](args, signal)
    }
  } catch (error) {
    response = signal.aborted ? failure('CANCELLED', 'The WebMCP execution was cancelled.')
      : failure('INTERNAL_ERROR', error instanceof Error ? error.message : 'Unexpected WebMCP tool failure.', false)
  }
  workspaceStore.recordActivity({ actor: 'agent', action: name, inputSummary: activityInput(name, args),
    resultSummary: response.ok ? 'success' : String(response.error?.code ?? 'error'),
    ...(validString(args.issueId, 180) ? { issueId: String(args.issueId) } : {}),
    ...(validString(args.proposalId, 180) ? { proposalId: String(args.proposalId) } : {}),
    ...(response.ok && typeof response.data?.changeId === 'string' ? { changeId: response.data.changeId } : {}) })
  let serialized = JSON.stringify(response)
  const rows = response.data?.issues
  if (Array.isArray(rows)) {
    while (rows.length > 1 && serialized.length > 1_500) {
      rows.pop()
      serialized = JSON.stringify(response)
    }
  }
  if (serialized.length <= 1_500) return serialized
  return JSON.stringify(failure('INTERNAL_ERROR', 'The bounded WebMCP response exceeded 1500 characters.', false))
}

const valuesSchema = { type: 'object', properties: {
  labelText: { type: 'string', minLength: 1, maxLength: 120, description: 'Optional label override. When omitted, Curbcut may reuse safe adjacent visible text as a candidate.' },
  altMode: { type: 'string', enum: ['meaningful', 'decorative'], description: 'Human decision about image purpose.' },
  altText: { type: 'string', minLength: 1, maxLength: 160, description: 'Human-chosen text for a meaningful image.' },
  buttonName: { type: 'string', minLength: 1, maxLength: 120, description: 'Human-confirmed purpose of the unnamed native button.' },
  languageTag: { type: 'string', minLength: 1, maxLength: 35, description: 'Human-confirmed BCP 47 document language tag.' },
}, additionalProperties: false } as const

export const WEBMCP_TOOL_DEFINITIONS: readonly Omit<WebMCP.ModelContextTool, 'execute'>[] = [
  { name: 'get_workspace', title: 'Get workspace', description: 'Read bounded Curbcut revision, preview, scan coverage, proposal, selection, change, and undo state. Does not return source.', inputSchema: emptySchema, annotations: { readOnlyHint: true, untrustedContentHint: false } },
  { name: 'scan_accessibility', title: 'Scan accessibility', description: 'Render current source in the secure preview, run in-frame axe, and replace visible issue results. Start every fresh or stale issue workflow here. Use after_change to verify a repair.', inputSchema: { type: 'object', properties: { reason: { type: 'string', enum: ['initial', 'after_change', 'manual'], description: 'Why the scan is being run.' } }, required: ['reason'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false } },
  { name: 'list_issues', title: 'List issues', description: 'List bounded current axe issues or verified repairs. Requires a current scan. Use impact high for critical plus serious. Targets derive from untrusted source.', inputSchema: { type: 'object', properties: { impact: { type: 'string', enum: ['critical', 'serious', 'moderate', 'minor', 'high', 'all'], description: '"high" returns critical and serious; "all" returns every impact.' }, classification: { type: 'string', enum: ['MECHANICAL', 'CONTEXTUAL', 'MANUAL_REVIEW', 'all'], description: 'Filter remediation authority; "all" returns every classification.' }, status: { type: 'string', enum: ['open', 'verified', 'all'], description: 'Return open findings, verified repairs, or both.' }, limit: { type: 'integer', minimum: 1, maximum: 10, description: 'Maximum returned rows; totalMatching reports the full bounded count.' } }, additionalProperties: false }, annotations: { readOnlyHint: true, untrustedContentHint: true } },
  { name: 'inspect_issue', title: 'Inspect issue', description: 'Select a current axe issue, focus its exact mapped source range, and highlight its element. Returned target text is untrusted.', inputSchema: { type: 'object', properties: { issueId: { type: 'string', minLength: 1, maxLength: 180, description: 'Issue ID from list_issues.' } }, required: ['issueId'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true } },
  { name: 'preview_remediation', title: 'Preview remediation', description: 'Create one visible, non-mutating surgical proposal for a current listed issue. Call inspect_issue first so source and rendered evidence are visible. Contextual proposals require human approval.', inputSchema: { type: 'object', properties: { issueId: { type: 'string', minLength: 1, maxLength: 180 }, family: { type: 'string', enum: Object.keys(FAMILY) }, values: valuesSchema }, required: ['issueId', 'family'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: true } },
  { name: 'apply_remediation', title: 'Apply remediation', description: 'Apply the exact visible mechanical proposal, or a contextual proposal approved in the UI. Copy its returned proposalId exactly; never use a placeholder or invent approval.', inputSchema: { type: 'object', properties: { proposalId: { type: 'string', minLength: 1, maxLength: 180 } }, required: ['proposalId'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false } },
  { name: 'reject_remediation', title: 'Reject remediation', description: 'Reject the current visible proposal without changing canonical source.', inputSchema: { type: 'object', properties: { proposalId: { type: 'string', minLength: 1, maxLength: 180 }, reason: { type: 'string', enum: ['not_correct', 'needs_revision', 'not_now'] } }, required: ['proposalId', 'reason'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false } },
  { name: 'undo_remediation', title: 'Undo remediation', description: 'Restore the exact source snapshot before the latest eligible repair. Call only when the user explicitly requests undo; never speculatively.', inputSchema: emptySchema, annotations: { readOnlyHint: false, untrustedContentHint: false } },
  { name: 'get_change_summary', title: 'Get change summary', description: 'Read bounded applied, verified, rejected, and undone change facts plus unresolved high-impact/manual-review counts.', inputSchema: emptySchema, annotations: { readOnlyHint: true, untrustedContentHint: false } },
  { name: 'export_source', title: 'Export source', description: 'Download current canonical HTML, CSS, or workspace JSON locally. Returns metadata only and never exposes full source to the agent.', inputSchema: { type: 'object', properties: { format: { type: 'string', enum: ['html', 'css', 'workspace'] } }, required: ['format'], additionalProperties: false }, annotations: { readOnlyHint: false, untrustedContentHint: false } },
]

export function useWorkspaceWebMcpTools() {
  useEffect(() => {
    if (!document.modelContext) {
      workspaceStore.setWebMcpRegistration([], 'document.modelContext is unavailable in this browser.')
      return
    }
    const controller = new AbortController()
    void (async () => {
      try {
        for (const definition of WEBMCP_TOOL_DEFINITIONS) {
          const name = definition.name as WebMcpToolName
          await document.modelContext!.registerTool({ ...definition, execute: (args, context) =>
            executeWorkspaceTool(name, args, context?.signal ?? new AbortController().signal) }, { signal: controller.signal })
        }
        workspaceStore.setWebMcpRegistration(WEBMCP_TOOL_NAMES)
      } catch (error) {
        if (!controller.signal.aborted) {
          controller.abort()
          workspaceStore.setWebMcpRegistration([], error instanceof Error ? error.message : String(error))
        }
      }
    })()
    return () => controller.abort()
  }, [])
}

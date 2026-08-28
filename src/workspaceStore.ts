import { useSyncExternalStore } from 'react'
import { CHECKOUT_CSS, CHECKOUT_HTML } from './fixture'
import { getScanMetrics, normalizeAxeResults, type AccessibilityIssue, type Classification, type Impact, type ScanMetrics } from './axeAdapter'
import { preparePreview } from './previewSecurity'
import type { PreviewBridge } from './Preview'
import { MAX_CSS_BYTES, MAX_HTML_BYTES, type IsolationEvidence, type ScanResultPayload } from './previewProtocol'
import {
  applyApprovedProposal,
  approveProposal as approveExactProposal,
  createProposal,
  rejectProposal as rejectCurrentProposal,
  undoLatestChange,
  type ChangeRecord,
  type RemediationProposal,
} from './proposal'
import { hashText, type HumanValues, type RepairFamily, type ValidationTarget } from './repairs'
import { CURBCUT_NODE_ATTRIBUTE, type SourceMapping } from './sourceMap'

export type WorkspaceStatus = 'EMPTY' | 'READY' | 'ERROR'
export type PreviewStatus = 'IDLE' | 'RENDERING' | 'READY' | 'ERROR'
export type ScanStatus = 'NEVER' | 'RUNNING' | 'CURRENT' | 'STALE' | 'ERROR'
export type PreviewMode = 'WORKING' | 'PROPOSED'
export type ProposalPreviewStatus = 'IDLE' | 'RENDERING' | 'READY' | 'ERROR'
export type MutationStatus = 'IDLE' | 'APPLYING' | 'UNDOING'

export type ProposalPreviewState = {
  proposalId: string | null
  status: ProposalPreviewStatus
  error: string | null
}

export type VerificationNotice = {
  changeId: string
  kind: 'APPLY' | 'UNDO'
  outcome: 'PENDING' | 'VERIFIED' | 'NOT_VERIFIED' | 'RESTORED' | 'NOT_RESTORED' | 'INCONCLUSIVE'
  message: string
}

type ScanRecord = {
  scanId: string
  sourceRevision: number
  metrics: ScanMetrics
  coverage: ScanResultPayload['coverage']
  reason: 'initial' | 'after_change' | 'manual'
}

type Invocation = {
  tool: string
  timestamp: string
  summary: string
}

export type ActivityEvent = {
  eventId: string
  actor: 'agent' | 'human' | 'system'
  action: string
  timestamp: string
  sourceRevision: number
  inputSummary: string
  resultSummary: string
  issueId?: string
  proposalId?: string
  changeId?: string
  approvalOccurred: boolean
}

export type WorkspaceState = {
  htmlSource: string
  cssSource: string
  sourceRevision: number
  workspaceStatus: WorkspaceStatus
  previewStatus: PreviewStatus
  scanStatus: ScanStatus
  mapping: SourceMapping | null
  scan: ScanRecord | null
  issues: readonly AccessibilityIssue[]
  selectedIssueId: string | null
  highlightedNodeId: string | null
  error: string | null
  registeredTools: readonly string[]
  webMcpError: string | null
  lastInvocation: Invocation | null
  activity: readonly ActivityEvent[]
  isolationEvidence: IsolationEvidence | null
  proposal: RemediationProposal | null
  proposalPreview: ProposalPreviewState
  previewMode: PreviewMode
  mutationStatus: MutationStatus
  history: readonly ChangeRecord[]
  verificationNotice: VerificationNotice | null
  lastExport: ExportMetadata | null
}

export type CommandErrorCode =
  | 'UNSUPPORTED_BROWSER'
  | 'INVALID_INPUT'
  | 'SOURCE_TOO_LARGE'
  | 'WORKSPACE_EMPTY'
  | 'PREVIEW_NOT_READY'
  | 'CHANGE_IN_PROGRESS'
  | 'SCAN_RUNNING'
  | 'SCAN_REQUIRED'
  | 'STALE_SCAN'
  | 'ISSUE_NOT_FOUND'
  | 'ISSUE_NOT_REPAIRABLE'
  | 'INPUT_REQUIRED'
  | 'PROPOSAL_EXISTS'
  | 'PROPOSAL_REQUIRED'
  | 'PROPOSAL_NOT_FOUND'
  | 'REPAIR_REFUSED'
  | 'APPROVAL_REQUIRED'
  | 'STALE_PROPOSAL'
  | 'STALE_UNDO'
  | 'NOTHING_TO_UNDO'
  | 'EXPORT_FAILED'
  | 'CANCELLED'
  | 'STALE_RESPONSE'
  | 'INTERNAL_ERROR'

export type CommandResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: CommandErrorCode; message: string; recoverable: boolean } }

const fail = (code: CommandErrorCode, message: string): CommandResult<never> => ({
  ok: false,
  error: { code, message, recoverable: code !== 'INTERNAL_ERROR' },
})

export type ExportKind = 'html' | 'css' | 'workspace'
export type ExportMetadata = {
  kind: ExportKind
  filename: string
  sourceRevision: number
  sha256: string
  mappingMetadataPresent: false
}

const STORAGE_KEY = 'curbcut.workspace.v1'

function readPersistedSource() {
  if (typeof localStorage === 'undefined') return null
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as { html?: unknown; css?: unknown } | null
    return saved && typeof saved.html === 'string' && typeof saved.css === 'string'
      ? { html: saved.html, css: saved.css }
      : null
  } catch {
    return null
  }
}

export async function createExportArtifact(
  kind: ExportKind,
  html: string,
  css: string,
  sourceRevision: number,
) {
  if (html.includes(CURBCUT_NODE_ATTRIBUTE) || css.includes(CURBCUT_NODE_ATTRIBUTE)) {
    throw new Error('Export refused because preview-only mapping metadata was found in canonical source.')
  }
  const content = kind === 'html'
    ? html
    : kind === 'css'
      ? css
      : JSON.stringify({ version: 1, html, css }, null, 2)
  const filename = kind === 'html' ? 'curbcut.html' : kind === 'css' ? 'curbcut.css' : 'curbcut-workspace.json'
  return {
    content,
    filename,
    mimeType: kind === 'workspace' ? 'application/json' : kind === 'html' ? 'text/html' : 'text/css',
    metadata: {
      kind,
      filename,
      sourceRevision,
      sha256: await hashText(content),
      mappingMetadataPresent: false as const,
    },
  }
}

const persistedSource = readPersistedSource()
let state: WorkspaceState = {
  htmlSource: persistedSource?.html ?? CHECKOUT_HTML,
  cssSource: persistedSource?.css ?? CHECKOUT_CSS,
  sourceRevision: 1,
  workspaceStatus: 'READY',
  previewStatus: 'IDLE',
  scanStatus: 'NEVER',
  mapping: null,
  scan: null,
  issues: [],
  selectedIssueId: null,
  highlightedNodeId: null,
  error: null,
  registeredTools: [],
  webMcpError: null,
  lastInvocation: null,
  activity: [],
  isolationEvidence: null,
  proposal: null,
  proposalPreview: { proposalId: null, status: 'IDLE', error: null },
  previewMode: 'WORKING',
  mutationStatus: 'IDLE',
  history: [],
  verificationNotice: null,
  lastExport: null,
}

let bridge: PreviewBridge | null = null
let activeRender: { revision: number; promise: Promise<CommandResult<{ sourceRevision: number }>> } | null = null
let activeMutationToken: string | null = null
let automaticInitialScanRevision: number | null = null
let persistenceTimer: ReturnType<typeof setTimeout> | null = null
let renderTimer: ReturnType<typeof setTimeout> | null = null
const sourceEncoder = new TextEncoder()
const listeners = new Set<() => void>()
const emit = () => listeners.forEach((listener) => listener())
const update = (patch: Partial<WorkspaceState>) => {
  state = { ...state, ...patch }
  if (typeof localStorage !== 'undefined' && ('htmlSource' in patch || 'cssSource' in patch)) {
    if (persistenceTimer) clearTimeout(persistenceTimer)
    persistenceTimer = setTimeout(() => {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, html: state.htmlSource, css: state.cssSource }))
      } catch {
        // Browser persistence is convenience storage; canonical in-memory source remains authoritative.
      }
    }, 120)
  }
  emit()
}

const cancelled = (signal?: AbortSignal) => Boolean(signal?.aborted)
const isAbortError = (error: unknown) => error instanceof DOMException && error.name === 'AbortError'
const emptyProposalPreview = (): ProposalPreviewState => ({ proposalId: null, status: 'IDLE', error: null })

function invalidateActiveMutation() {
  activeMutationToken = null
}

function mutationStillCurrent(
  token: string,
  expected: { sourceRevision: number; html: string; css: string; proposalId?: string; changeId?: string },
) {
  const latest = state.history.at(-1)
  return activeMutationToken === token &&
    state.sourceRevision === expected.sourceRevision &&
    state.htmlSource === expected.html &&
    state.cssSource === expected.css &&
    (expected.proposalId === undefined || state.proposal?.proposalId === expected.proposalId) &&
    (expected.changeId === undefined || latest?.changeId === expected.changeId)
}

function finishMutation(token: string) {
  if (activeMutationToken !== token) return
  activeMutationToken = null
  update({ mutationStatus: 'IDLE' })
}

function scheduleAutomaticInitialScan(revision: number) {
  if (automaticInitialScanRevision !== null || state.scanStatus !== 'NEVER' || state.sourceRevision !== revision) return
  automaticInitialScanRevision = revision
  queueMicrotask(() => {
    if (!bridge || state.sourceRevision !== revision || state.previewStatus !== 'READY' || state.scanStatus !== 'NEVER') {
      automaticInitialScanRevision = null
      return
    }
    void workspaceStore.scan('initial', undefined, 'system').then((result) => {
      if (!result.ok && state.scanStatus === 'NEVER') automaticInitialScanRevision = null
    })
  })
}

async function renderCurrent(signal?: AbortSignal): Promise<CommandResult<{ sourceRevision: number }>> {
  if (renderTimer) {
    clearTimeout(renderTimer)
    renderTimer = null
  }
  if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
  const revision = state.sourceRevision
  if (!bridge) return fail('PREVIEW_NOT_READY', 'The secure preview bridge is not attached yet.')
  if (state.previewStatus === 'READY' && state.mapping?.sourceRevision === revision) {
    return { ok: true, data: { sourceRevision: revision } }
  }
  if (activeRender?.revision === revision) {
    const result = await activeRender.promise
    return cancelled(signal) ? fail('CANCELLED', 'The WebMCP execution was cancelled.') : result
  }

  const promise: Promise<CommandResult<{ sourceRevision: number }>> = (async () => {
    update({ previewStatus: 'RENDERING', error: null })
    try {
      const prepared = preparePreview(state.htmlSource, revision)
      const css = state.cssSource
      await bridge!.render(revision, prepared.html, css, prepared.documentMeta, signal)
      if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
      if (state.sourceRevision !== revision) return fail('STALE_RESPONSE', 'A newer source revision replaced this render.')
      update({
        workspaceStatus: state.htmlSource.trim() ? 'READY' : 'EMPTY',
        previewStatus: 'READY',
        mapping: prepared.mapping,
      })
      scheduleAutomaticInitialScan(revision)
      return { ok: true, data: { sourceRevision: revision } }
    } catch (error) {
      if (isAbortError(error) || cancelled(signal)) {
        if (state.sourceRevision === revision) update({ previewStatus: 'IDLE' })
        return fail('CANCELLED', 'The WebMCP execution was cancelled.')
      }
      if (state.sourceRevision !== revision) return fail('STALE_RESPONSE', 'A newer source revision replaced this render.')
      const message = error instanceof Error ? error.message : String(error)
      update({ workspaceStatus: 'ERROR', previewStatus: 'ERROR', error: message })
      return fail('INTERNAL_ERROR', message)
    } finally {
      if (activeRender?.revision === revision) activeRender = null
    }
  })()
  activeRender = { revision, promise }
  return promise
}

function sourceFits(kind: 'html' | 'css', value: string) {
  return sourceEncoder.encode(value).byteLength <= (kind === 'html' ? MAX_HTML_BYTES : MAX_CSS_BYTES)
}

function requestRender(immediate = false) {
  if (renderTimer) clearTimeout(renderTimer)
  if (immediate) {
    renderTimer = null
    void renderCurrent()
    return
  }
  renderTimer = setTimeout(() => {
    renderTimer = null
    void renderCurrent()
  }, 150)
}

function edit(kind: 'html' | 'css', value: string): CommandResult<{ sourceRevision: number }> {
  if (!sourceFits(kind, value)) {
    const maximum = kind === 'html' ? MAX_HTML_BYTES : MAX_CSS_BYTES
    const message = `${kind.toUpperCase()} source must be at most ${maximum.toLocaleString()} bytes.`
    update({ error: message })
    return fail('SOURCE_TOO_LARGE', message)
  }
  invalidateActiveMutation()
  const sourceRevision = state.sourceRevision + 1
  update({
    ...(kind === 'html' ? { htmlSource: value } : { cssSource: value }),
    sourceRevision,
    workspaceStatus: value.trim() || (kind === 'html' ? state.cssSource : state.htmlSource).trim() ? 'READY' : 'EMPTY',
    previewStatus: 'RENDERING',
    scanStatus: state.scan || state.scanStatus === 'RUNNING' ? 'STALE' : 'NEVER',
    selectedIssueId: null,
    highlightedNodeId: null,
    proposal: null,
    proposalPreview: emptyProposalPreview(),
    previewMode: 'WORKING',
    mutationStatus: 'IDLE',
    verificationNotice: state.proposal && (state.proposal.status === 'PROPOSED' || state.proposal.status === 'APPROVED')
      ? { changeId: state.proposal.proposalId, kind: 'APPLY', outcome: 'NOT_VERIFIED', message: 'The pending proposal was invalidated by a manual source edit.' }
      : null,
    error: null,
    lastExport: null,
  })
  requestRender()
  return { ok: true, data: { sourceRevision } }
}

export const workspaceStore = {
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getSnapshot: () => state,
  attachPreview(nextBridge: PreviewBridge | null) {
    bridge = nextBridge
    if (bridge) void renderCurrent()
  },
  renderCurrent,
  setHtmlSource(value: string) {
    return edit('html', value)
  },
  setCssSource(value: string) {
    return edit('css', value)
  },
  replaceWorkspace(html: string, css: string, label: string): CommandResult<{ sourceRevision: number }> {
    if (!sourceFits('html', html) || !sourceFits('css', css)) {
      return fail('SOURCE_TOO_LARGE', 'The imported workspace exceeds Curbcut source limits.')
    }
    if (html.toLowerCase().includes(CURBCUT_NODE_ATTRIBUTE) || css.toLowerCase().includes(CURBCUT_NODE_ATTRIBUTE)) {
      return fail('INVALID_INPUT', `${CURBCUT_NODE_ATTRIBUTE} is reserved for isolated preview mapping.`)
    }
    invalidateActiveMutation()
    const sourceRevision = state.sourceRevision + 1
    const timestamp = new Date().toISOString()
    const importEvent: ActivityEvent = {
      eventId: crypto.randomUUID(),
      actor: 'human',
      action: 'workspace_imported',
      timestamp,
      sourceRevision,
      inputSummary: label.slice(0, 120),
      resultSummary: 'Local HTML/CSS replaced atomically; scan required.',
      approvalOccurred: false,
    }
    update({
      htmlSource: html,
      cssSource: css,
      sourceRevision,
      workspaceStatus: html.trim() ? 'READY' : 'EMPTY',
      previewStatus: 'RENDERING',
      scanStatus: 'NEVER',
      mapping: null,
      scan: null,
      issues: [],
      selectedIssueId: null,
      highlightedNodeId: null,
      proposal: null,
      proposalPreview: emptyProposalPreview(),
      previewMode: 'WORKING',
      mutationStatus: 'IDLE',
      history: [],
      verificationNotice: null,
      error: null,
      lastExport: null,
      activity: [...state.activity, importEvent].slice(-100),
    })
    requestRender(true)
    return { ok: true, data: { sourceRevision } }
  },
  reportError(message: string) {
    update({ error: message })
  },
  loadDemo() {
    invalidateActiveMutation()
    update({
      htmlSource: CHECKOUT_HTML,
      cssSource: CHECKOUT_CSS,
      sourceRevision: state.sourceRevision + 1,
      workspaceStatus: 'READY',
      previewStatus: 'RENDERING',
      scanStatus: state.scan || state.scanStatus === 'RUNNING' ? 'STALE' : 'NEVER',
      selectedIssueId: null,
      highlightedNodeId: null,
      proposal: null,
      proposalPreview: emptyProposalPreview(),
      previewMode: 'WORKING',
      mutationStatus: 'IDLE',
      history: [],
      verificationNotice: null,
      error: null,
      lastExport: null,
    })
    requestRender(true)
  },
  async scan(
    reason: 'initial' | 'after_change' | 'manual',
    signal?: AbortSignal,
    activityActor?: 'human' | 'system',
  ): Promise<CommandResult<ScanRecord>> {
    if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
    if (!state.htmlSource.trim()) return fail('WORKSPACE_EMPTY', 'Add HTML source before scanning accessibility.')
    if (state.scanStatus === 'RUNNING') return fail('SCAN_RUNNING', 'An accessibility scan is already running.')
    if (state.proposal?.status === 'PROPOSED' || state.proposal?.status === 'APPROVED') {
      return fail('PROPOSAL_EXISTS', 'Apply or reject the pending proposal before rescanning the working source.')
    }
    const revision = state.sourceRevision
    const previousStatus = state.scanStatus
    update({ scanStatus: 'RUNNING', error: null })
    const rendered = await renderCurrent(signal)
    if (!rendered.ok || !bridge || !state.mapping) {
      if (state.sourceRevision === revision) update({ scanStatus: previousStatus, error: null })
      if (!rendered.ok && rendered.error.code === 'CANCELLED') return rendered
      return fail('PREVIEW_NOT_READY', 'The current source could not be rendered safely.')
    }
    const mapping = state.mapping
    try {
      const payload = await bridge.scan(revision, signal)
      if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
      if (state.sourceRevision !== revision || state.mapping?.sourceRevision !== revision) {
        return fail('STALE_RESPONSE', 'A newer source revision replaced this scan.')
      }
      const scanId = crypto.randomUUID()
      const issues = normalizeAxeResults(payload, mapping, scanId)
      const scan = { scanId, sourceRevision: revision, metrics: getScanMetrics(issues), coverage: payload.coverage, reason }
      const scanEvent: ActivityEvent | null = activityActor ? {
        eventId: crypto.randomUUID(),
        actor: activityActor,
        action: 'scan_accessibility',
        timestamp: new Date().toISOString(),
        sourceRevision: revision,
        inputSummary: reason,
        resultSummary: scan.coverage.truncated
          ? `${scan.coverage.returnedNodeCount} of ${scan.coverage.totalNodeCount} axe nodes returned · counts are lower bounds`
          : `${scan.metrics.ruleCount} rules · ${scan.metrics.affectedNodeCount} nodes · ${scan.metrics.critical} critical · ${scan.metrics.serious} serious`,
        approvalOccurred: false,
      } : null
      const history = [...state.history]
      const latest = history.at(-1)
      let verificationNotice = state.verificationNotice
      if (latest?.undoneRevision === revision) {
        const restored = issues.some((issue) => targetMatches(issue, latest.restorationTarget))
        verificationNotice = {
          changeId: latest.changeId,
          kind: 'UNDO',
          outcome: restored ? 'RESTORED' : scan.coverage.truncated ? 'INCONCLUSIVE' : 'NOT_RESTORED',
          message: restored
            ? `Real axe rescan restored ${latest.restorationTarget.ruleId} for the original target.`
            : scan.coverage.truncated
              ? `The capped axe rescan could not confirm whether ${latest.restorationTarget.ruleId} was restored for the original target.`
            : `Real axe rescan did not restore ${latest.restorationTarget.ruleId} for the original target.`,
        }
      } else if (latest && !latest.undoneAt && latest.appliedRevision === revision) {
        const remains = issues.some((issue) => targetMatches(issue, latest.validationTarget))
        const verified = !remains && !scan.coverage.truncated
        history[history.length - 1] = { ...latest, verification: verified ? 'VERIFIED' : 'NOT_VERIFIED' }
        verificationNotice = {
          changeId: latest.changeId,
          kind: 'APPLY',
          outcome: verified ? 'VERIFIED' : 'NOT_VERIFIED',
          message: remains
            ? `Real axe rescan still reports ${latest.validationTarget.ruleId} for the intended target.`
            : scan.coverage.truncated
              ? `The capped axe rescan could not verify the absence of ${latest.validationTarget.ruleId} for the intended target.`
            : `Real axe rescan no longer reports ${latest.validationTarget.ruleId} for the intended target.`,
        }
      }
      update({
        scanStatus: 'CURRENT',
        scan,
        issues,
        history,
        verificationNotice,
        selectedIssueId: null,
        highlightedNodeId: null,
        ...(scanEvent ? { activity: [...state.activity, scanEvent].slice(-100) } : {}),
      })
      return { ok: true, data: scan }
    } catch (error) {
      if (isAbortError(error) || cancelled(signal)) {
        if (state.sourceRevision === revision) update({ scanStatus: previousStatus, error: null })
        return fail('CANCELLED', 'The WebMCP execution was cancelled.')
      }
      if (state.sourceRevision !== revision) return fail('STALE_RESPONSE', 'A newer source revision replaced this scan.')
      const message = error instanceof Error ? error.message : String(error)
      update({ scanStatus: 'ERROR', error: message })
      return fail('INTERNAL_ERROR', message)
    }
  },
  listIssues(filters: {
    impact?: Impact | 'all'
    classification?: Classification | 'all'
    limit?: number
  }): CommandResult<{ scanId: string; totalMatching: number; issues: AccessibilityIssue[] }> {
    if (!state.scan) return fail('SCAN_REQUIRED', 'Run scan_accessibility before listing issues.')
    if (state.scanStatus !== 'CURRENT' || state.scan.sourceRevision !== state.sourceRevision) {
      return fail('STALE_SCAN', 'The source changed after this scan. Run scan_accessibility again.')
    }
    const matches = state.issues.filter((issue) =>
      (!filters.impact || filters.impact === 'all' || issue.impact === filters.impact) &&
      (!filters.classification || filters.classification === 'all' || issue.classification === filters.classification),
    )
    return {
      ok: true,
      data: { scanId: state.scan.scanId, totalMatching: matches.length, issues: matches.slice(0, filters.limit ?? 10) },
    }
  },
  async inspectIssue(issueId: string, signal?: AbortSignal): Promise<CommandResult<AccessibilityIssue>> {
    if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
    if (!state.scan) return fail('SCAN_REQUIRED', 'Run scan_accessibility before inspecting an issue.')
    if (state.scanStatus !== 'CURRENT' || state.scan.sourceRevision !== state.sourceRevision) {
      return fail('STALE_SCAN', 'The source changed after this scan. Run scan_accessibility again.')
    }
    const issue = state.issues.find((candidate) => candidate.issueId === issueId)
    if (!issue) return fail('ISSUE_NOT_FOUND', 'That issue is not part of the current scan.')
    update({ selectedIssueId: issue.issueId, highlightedNodeId: issue.nodeId ?? null, error: null })
    try {
      if (!bridge) return fail('PREVIEW_NOT_READY', 'The secure preview is unavailable.')
      if (issue.nodeId) await bridge.highlight(state.sourceRevision, issue.nodeId, signal)
      else await bridge.clearHighlight(state.sourceRevision, signal)
      if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
      if (state.sourceRevision !== issue.sourceRevision) return fail('STALE_RESPONSE', 'The source changed while selecting this issue.')
      return { ok: true, data: issue }
    } catch (error) {
      if (isAbortError(error) || cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
      const message = error instanceof Error ? error.message : String(error)
      update({ error: message })
      return fail('PREVIEW_NOT_READY', message)
    }
  },
  clearSelection() {
    const revision = state.sourceRevision
    update({ selectedIssueId: null, highlightedNodeId: null })
    if (bridge && state.previewStatus === 'READY') void bridge.clearHighlight(revision)
  },
  async previewRepair(issueId: string, family: RepairFamily, humanValues: HumanValues, signal?: AbortSignal) {
    if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
    if (!state.scan || state.scanStatus !== 'CURRENT' || state.scan.sourceRevision !== state.sourceRevision || !state.mapping) {
      return fail('STALE_SCAN', 'Run a current accessibility scan before creating a repair proposal.')
    }
    const issue = state.issues.find((candidate) => candidate.issueId === issueId)
    if (!issue) return fail('ISSUE_NOT_FOUND', 'That issue is not part of the current scan.')
    if (state.proposal && (state.proposal.status === 'PROPOSED' || state.proposal.status === 'APPROVED')) {
      return fail('PROPOSAL_EXISTS', 'Reject or apply the current proposal before repairing another issue.')
    }
    const originalHtml = state.htmlSource
    const originalCss = state.cssSource
    const originalRevision = state.sourceRevision
    const result = await createProposal(originalHtml, originalCss, state.mapping, issue, family, humanValues)
    if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
    if (state.sourceRevision !== originalRevision || state.htmlSource !== originalHtml || state.cssSource !== originalCss) {
      return fail('STALE_PROPOSAL', 'The source changed while the proposal was being created.')
    }
    if (!result.ok) {
      update({ error: result.error.message })
      return fail('REPAIR_REFUSED', result.error.message)
    }
    update({
      proposal: result.data,
      proposalPreview: { proposalId: result.data.proposalId, status: 'RENDERING', error: null },
      previewMode: 'PROPOSED',
      error: null,
      verificationNotice: null,
    })
    return { ok: true as const, data: result.data }
  },
  setProposalPreviewStatus(proposalId: string, status: Exclude<ProposalPreviewStatus, 'IDLE'>, error: string | null = null) {
    if (state.proposal?.proposalId !== proposalId || state.proposalPreview.proposalId !== proposalId) return
    update({ proposalPreview: { proposalId, status, error: status === 'ERROR' ? error ?? 'The proposed preview could not be rendered.' : null } })
  },
  waitForProposalPreview(
    proposalId: string,
    signal?: AbortSignal,
    timeoutMs = 30_000,
  ): Promise<CommandResult<{ proposalId: string; status: 'READY' }>> {
    if (cancelled(signal)) return Promise.resolve(fail('CANCELLED', 'The WebMCP execution was cancelled.'))
    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | null = null
      let settled = false
      const finish = (result: CommandResult<{ proposalId: string; status: 'READY' }>) => {
        if (settled) return
        settled = true
        if (timer) clearTimeout(timer)
        signal?.removeEventListener('abort', onAbort)
        listeners.delete(check)
        resolve(result)
      }
      const onAbort = () => finish(fail('CANCELLED', 'The WebMCP execution was cancelled.'))
      const check = () => {
        if (state.proposal?.proposalId !== proposalId || state.proposalPreview.proposalId !== proposalId) {
          finish(fail('STALE_PROPOSAL', 'The visible proposal changed before its preview became ready.'))
        } else if (state.proposalPreview.status === 'READY') {
          finish({ ok: true, data: { proposalId, status: 'READY' } })
        } else if (state.proposalPreview.status === 'ERROR') {
          finish(fail('PREVIEW_NOT_READY', state.proposalPreview.error ?? 'The proposed preview could not be rendered.'))
        }
      }
      listeners.add(check)
      signal?.addEventListener('abort', onAbort, { once: true })
      timer = setTimeout(() => finish(fail('PREVIEW_NOT_READY', 'The proposed preview did not become ready in time.')), timeoutMs)
      check()
    })
  },
  approveProposal(proposalId: string, diffHash: string) {
    if (!state.proposal) return fail('PROPOSAL_REQUIRED', 'Create a proposal before approving it.')
    const result = approveExactProposal(state.proposal, proposalId, diffHash)
    if (!result.ok) return fail('APPROVAL_REQUIRED', result.error.message)
    const timestamp = new Date().toISOString()
    const approvalEvent: ActivityEvent = {
      eventId: crypto.randomUUID(),
      actor: 'human',
      action: 'approve_remediation',
      timestamp,
      sourceRevision: state.sourceRevision,
      inputSummary: `proposal ${proposalId.slice(0, 12)}`,
      resultSummary: 'approved exact visible diff',
      issueId: result.data.issueId,
      proposalId,
      approvalOccurred: true,
    }
    update({
      proposal: result.data,
      error: null,
      activity: [...state.activity, approvalEvent].slice(-100),
    })
    return { ok: true as const, data: result.data }
  },
  async applyProposal(proposalId: string, signal?: AbortSignal) {
    if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
    if (state.mutationStatus !== 'IDLE') return fail('CHANGE_IN_PROGRESS', `A source change is already ${state.mutationStatus.toLowerCase()}.`)
    const proposal = state.proposal
    if (!proposal || proposal.proposalId !== proposalId) return fail('PROPOSAL_NOT_FOUND', 'The current proposal does not match this Apply request.')
    if (state.proposalPreview.proposalId !== proposalId || state.proposalPreview.status !== 'READY') {
      return fail('PREVIEW_NOT_READY', 'Wait for this exact proposed result to render successfully before applying it.')
    }
    const expected = {
      sourceRevision: state.sourceRevision,
      html: state.htmlSource,
      css: state.cssSource,
      proposalId,
    }
    const token = crypto.randomUUID()
    activeMutationToken = token
    update({ mutationStatus: 'APPLYING', error: null })
    let result: Awaited<ReturnType<typeof applyApprovedProposal>>
    try {
      result = await applyApprovedProposal(proposal, {
        html: expected.html,
        css: expected.css,
        sourceRevision: expected.sourceRevision,
      })
    } catch (error) {
      if (activeMutationToken === token) update({ error: error instanceof Error ? error.message : 'The guarded Apply operation failed.' })
      finishMutation(token)
      return fail('INTERNAL_ERROR', error instanceof Error ? error.message : 'The guarded Apply operation failed.')
    }
    if (cancelled(signal)) {
      finishMutation(token)
      return fail('CANCELLED', 'The WebMCP execution was cancelled.')
    }
    if (!mutationStillCurrent(token, expected)) {
      finishMutation(token)
      return fail('STALE_PROPOSAL', 'The workspace changed while the proposal was being applied. No generated result was committed.')
    }
    if (!result.ok) {
      const code = result.error.code === 'APPROVAL_REQUIRED' ? 'APPROVAL_REQUIRED' : 'STALE_PROPOSAL'
      update({ error: result.error.message })
      finishMutation(token)
      return fail(code, result.error.message)
    }
    const { change } = result.data
    activeMutationToken = null
    update({
      htmlSource: change.afterHtml,
      cssSource: change.afterCss,
      sourceRevision: change.appliedRevision,
      previewStatus: 'RENDERING',
      scanStatus: 'STALE',
      mapping: null,
      selectedIssueId: null,
      highlightedNodeId: null,
      proposal: result.data.proposal,
      proposalPreview: emptyProposalPreview(),
      previewMode: 'WORKING',
      mutationStatus: 'IDLE',
      history: [...state.history, change].slice(-20),
      verificationNotice: {
        changeId: change.changeId,
        kind: 'APPLY',
        outcome: 'PENDING',
        message: 'Applied to working source. A real axe rescan is required before this change can be verified.',
      },
      error: null,
      lastExport: null,
    })
    requestRender(true)
    return { ok: true as const, data: change }
  },
  rejectProposal(proposalId?: string) {
    if (state.mutationStatus !== 'IDLE') return fail('CHANGE_IN_PROGRESS', `A source change is already ${state.mutationStatus.toLowerCase()}.`)
    if (!state.proposal || (proposalId && state.proposal.proposalId !== proposalId)) return fail('PROPOSAL_NOT_FOUND', 'There is no matching proposal to reject.')
    const result = rejectCurrentProposal(state.proposal)
    if (!result.ok) return fail('PROPOSAL_NOT_FOUND', result.error.message)
    update({ proposal: result.data, proposalPreview: emptyProposalPreview(), previewMode: 'WORKING', error: null })
    return { ok: true as const, data: result.data }
  },
  async undoLatest(signal?: AbortSignal) {
    if (cancelled(signal)) return fail('CANCELLED', 'The WebMCP execution was cancelled.')
    if (state.mutationStatus !== 'IDLE') return fail('CHANGE_IN_PROGRESS', `A source change is already ${state.mutationStatus.toLowerCase()}.`)
    const latest = state.history.at(-1)
    if (!latest || latest.undoneAt) return fail('NOTHING_TO_UNDO', 'There is no eligible applied change to undo.')
    const expected = {
      sourceRevision: state.sourceRevision,
      html: state.htmlSource,
      css: state.cssSource,
      changeId: latest.changeId,
    }
    const token = crypto.randomUUID()
    activeMutationToken = token
    update({ mutationStatus: 'UNDOING', error: null })
    let result: Awaited<ReturnType<typeof undoLatestChange>>
    try {
      result = await undoLatestChange(latest, { html: expected.html, css: expected.css })
    } catch (error) {
      if (activeMutationToken === token) update({ error: error instanceof Error ? error.message : 'The guarded Undo operation failed.' })
      finishMutation(token)
      return fail('INTERNAL_ERROR', error instanceof Error ? error.message : 'The guarded Undo operation failed.')
    }
    if (cancelled(signal)) {
      finishMutation(token)
      return fail('CANCELLED', 'The WebMCP execution was cancelled.')
    }
    if (!mutationStillCurrent(token, expected)) {
      finishMutation(token)
      return fail('STALE_UNDO', 'The workspace changed while Undo was being prepared. No snapshot was restored.')
    }
    if (!result.ok) {
      update({ error: result.error.message })
      finishMutation(token)
      return fail('STALE_UNDO', result.error.message)
    }
    const sourceRevision = expected.sourceRevision + 1
    const history = [...state.history]
    history[history.length - 1] = { ...result.data.change, undoneRevision: sourceRevision }
    activeMutationToken = null
    update({
      htmlSource: result.data.html,
      cssSource: result.data.css,
      sourceRevision,
      previewStatus: 'RENDERING',
      scanStatus: 'STALE',
      mapping: null,
      selectedIssueId: null,
      highlightedNodeId: null,
      proposal: null,
      proposalPreview: emptyProposalPreview(),
      previewMode: 'WORKING',
      mutationStatus: 'IDLE',
      history,
      verificationNotice: {
        changeId: latest.changeId,
        kind: 'UNDO',
        outcome: 'PENDING',
        message: 'Exact source snapshots restored. A real axe rescan is required to confirm the original finding returns.',
      },
      error: null,
      lastExport: null,
    })
    requestRender(true)
    return { ok: true as const, data: history[history.length - 1] }
  },
  setPreviewMode(previewMode: PreviewMode) {
    if (previewMode === 'PROPOSED' && (!state.proposal || !['PROPOSED', 'APPROVED'].includes(state.proposal.status))) return
    update({ previewMode })
  },
  recordActivity(event: Omit<ActivityEvent, 'eventId' | 'timestamp' | 'sourceRevision' | 'approvalOccurred'> & { approvalOccurred?: boolean }) {
    const timestamp = new Date().toISOString()
    const item: ActivityEvent = {
      ...event,
      eventId: crypto.randomUUID(),
      timestamp,
      sourceRevision: state.sourceRevision,
      approvalOccurred: event.approvalOccurred ?? false,
    }
    update({
      activity: [...state.activity, item].slice(-100),
      ...(event.actor === 'agent' ? { lastInvocation: { tool: event.action, summary: event.resultSummary, timestamp } } : {}),
    })
  },
  async exportSource(kind: ExportKind): Promise<CommandResult<ExportMetadata>> {
    if (!state.htmlSource.trim() && !state.cssSource.trim()) return fail('WORKSPACE_EMPTY', 'There is no source to export.')
    try {
      const artifact = await createExportArtifact(kind, state.htmlSource, state.cssSource, state.sourceRevision)
      const url = URL.createObjectURL(new Blob([artifact.content], { type: artifact.mimeType }))
      const link = document.createElement('a')
      link.href = url
      link.download = artifact.filename
      link.click()
      setTimeout(() => URL.revokeObjectURL(url), 0)
      update({ lastExport: artifact.metadata, error: null })
      return { ok: true, data: artifact.metadata }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'The browser blocked the source download.'
      update({ error: message })
      return fail('EXPORT_FAILED', message)
    }
  },
  setWebMcpRegistration(registeredTools: readonly string[], webMcpError: string | null = null) {
    update({ registeredTools, webMcpError })
  },
  setIsolationEvidence(isolationEvidence: IsolationEvidence) {
    update({ isolationEvidence })
  },
}

function targetMatches(issue: AccessibilityIssue, target: ValidationTarget) {
  if (issue.ruleId !== target.ruleId || issue.sourceNode?.tagName !== target.tagName) return false
  if (target.id !== undefined) return issue.sourceNode.attributes.id === target.id
  const match = issue.nodeId ? /^cc-\d+-(\d+)$/.exec(issue.nodeId) : null
  return target.ordinal !== undefined && Number(match?.[1]) === target.ordinal
}

export function useWorkspaceState() {
  return useSyncExternalStore(workspaceStore.subscribe, workspaceStore.getSnapshot, workspaceStore.getSnapshot)
}

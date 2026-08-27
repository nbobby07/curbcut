import type { AccessibilityIssue, Classification } from './axeAdapter'
import {
  createRepair,
  hashText,
  type HumanValues,
  type RepairFamily,
  type RepairPatch,
  type ValidationTarget,
} from './repairs'
import { applySourcePatches, createSourceMapping, type SourceMapping } from './sourceMap'

export type ProposalStatus = 'PROPOSED' | 'APPROVED' | 'APPLIED' | 'REJECTED'
export type VerificationOutcome = 'PENDING' | 'VERIFIED' | 'NOT_VERIFIED'

export type ProposalApproval = {
  actor: 'human'
  approvedAt: string
  proposalId: string
  diffHash: string
}

export type RemediationProposal = {
  proposalId: string
  status: ProposalStatus
  issueId: string
  scanId: string
  sourceRevision: number
  family: RepairFamily
  affectedNodeId: string
  affectedSourceRange: { start: number; end: number }
  originalHtmlHash: string
  originalCssHash: string
  patches: readonly RepairPatch[]
  proposedHtml: string
  proposedCss: string
  diff: { before: string; after: string }
  classification: Classification
  rationale: string
  expectedValidation: string
  semanticJudgmentRequired: boolean
  humanValues: Readonly<HumanValues>
  approval: ProposalApproval | null
  diffHash: string
  validationTarget: ValidationTarget
  restorationTarget: ValidationTarget
}

export type ChangeRecord = {
  changeId: string
  proposalId: string
  issueId: string
  ruleId: string
  family: RepairFamily
  classification: Classification
  sourceLine: number
  beforeHtml: string
  beforeCss: string
  afterHtml: string
  afterCss: string
  beforeHtmlHash: string
  beforeCssHash: string
  afterHtmlHash: string
  afterCssHash: string
  appliedAt: string
  verification: VerificationOutcome
  validationTarget: ValidationTarget
  restorationTarget: ValidationTarget
  appliedRevision: number
  undoneAt: string | null
  undoneRevision: number | null
}

export type ProposalErrorCode =
  | 'REPAIR_REFUSED'
  | 'PROPOSAL_MISMATCH'
  | 'STALE_PROPOSAL'
  | 'DIFF_MISMATCH'
  | 'APPROVAL_REQUIRED'
  | 'STALE_PATCH'
  | 'STALE_UNDO'
  | 'NOT_APPLICABLE'

export type ProposalResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: { code: ProposalErrorCode; message: string } }

const failure = (code: ProposalErrorCode, message: string): ProposalResult<never> => ({
  ok: false,
  error: { code, message },
})

function patchBinding(proposal: Pick<RemediationProposal,
  'issueId' | 'scanId' | 'sourceRevision' | 'family' | 'affectedNodeId' | 'patches' | 'proposedHtml' | 'proposedCss' | 'humanValues' | 'validationTarget' | 'restorationTarget'>) {
  return JSON.stringify({
    issueId: proposal.issueId,
    scanId: proposal.scanId,
    sourceRevision: proposal.sourceRevision,
    family: proposal.family,
    affectedNodeId: proposal.affectedNodeId,
    patches: proposal.patches,
    proposedHtml: proposal.proposedHtml,
    proposedCss: proposal.proposedCss,
    humanValues: proposal.humanValues,
    validationTarget: proposal.validationTarget,
    restorationTarget: proposal.restorationTarget,
  })
}

export async function createProposal(
  html: string,
  css: string,
  mapping: SourceMapping,
  issue: AccessibilityIssue,
  family: RepairFamily,
  humanValues: HumanValues,
): Promise<ProposalResult<RemediationProposal>> {
  const decision = createRepair(html, mapping, issue, family, humanValues)
  if (!decision.ok) return failure('REPAIR_REFUSED', `${decision.refusal.code}: ${decision.refusal.message}`)
  if (!issue.nodeId || !issue.sourceNode) return failure('REPAIR_REFUSED', 'The issue is not source-backed.')

  const proposalId = crypto.randomUUID()
  const [originalHtmlHash, originalCssHash] = await Promise.all([hashText(html), hashText(css)])
  const draft = {
    proposalId,
    status: 'PROPOSED' as const,
    issueId: issue.issueId,
    scanId: issue.scanId,
    sourceRevision: issue.sourceRevision,
    family,
    affectedNodeId: issue.nodeId,
    affectedSourceRange: {
      start: issue.sourceNode.sourceRange.startOffset,
      end: issue.sourceNode.sourceRange.endOffset,
    },
    originalHtmlHash,
    originalCssHash,
    patches: decision.repair.patches,
    proposedHtml: decision.repair.proposedHtml,
    proposedCss: css,
    diff: decision.repair.diff,
    classification: decision.repair.classification,
    rationale: decision.repair.rationale,
    expectedValidation: decision.repair.expectedValidation,
    semanticJudgmentRequired: decision.repair.semanticJudgmentRequired,
    humanValues: decision.repair.humanValues,
    approval: null,
    diffHash: '',
    validationTarget: decision.repair.validationTarget,
    restorationTarget: decision.repair.restorationTarget,
  }
  return { ok: true, data: { ...draft, diffHash: await hashText(patchBinding(draft)) } }
}

export function approveProposal(
  proposal: RemediationProposal,
  proposalId: string,
  diffHash: string,
): ProposalResult<RemediationProposal> {
  if (proposal.proposalId !== proposalId) return failure('PROPOSAL_MISMATCH', 'The approval does not identify the current proposal.')
  if (proposal.status !== 'PROPOSED') return failure('NOT_APPLICABLE', 'Only a proposed change can be approved.')
  if (proposal.diffHash !== diffHash) return failure('DIFF_MISMATCH', 'The visible diff has changed and must be reviewed again.')
  return {
    ok: true,
    data: {
      ...proposal,
      status: 'APPROVED',
      approval: { actor: 'human', approvedAt: new Date().toISOString(), proposalId, diffHash },
    },
  }
}

export function rejectProposal(proposal: RemediationProposal): ProposalResult<RemediationProposal> {
  if (proposal.status !== 'PROPOSED' && proposal.status !== 'APPROVED') {
    return failure('NOT_APPLICABLE', 'Only an unapplied proposal can be rejected.')
  }
  return { ok: true, data: { ...proposal, status: 'REJECTED', approval: null } }
}

export async function applyApprovedProposal(
  proposal: RemediationProposal,
  current: { html: string; css: string; sourceRevision: number },
): Promise<ProposalResult<{ proposal: RemediationProposal; change: ChangeRecord }>> {
  if (proposal.status !== 'APPROVED' || !proposal.approval) {
    return failure('APPROVAL_REQUIRED', 'Review and approve this exact diff before applying it.')
  }
  if (proposal.sourceRevision !== current.sourceRevision) {
    return failure('STALE_PROPOSAL', 'The source revision changed after this proposal was created.')
  }
  if (proposal.approval.proposalId !== proposal.proposalId || proposal.approval.diffHash !== proposal.diffHash) {
    return failure('DIFF_MISMATCH', 'Approval does not match this exact proposal and diff.')
  }
  const [htmlHash, cssHash, diffHash] = await Promise.all([
    hashText(current.html),
    hashText(current.css),
    hashText(patchBinding(proposal)),
  ])
  if (htmlHash !== proposal.originalHtmlHash || cssHash !== proposal.originalCssHash) {
    return failure('STALE_PROPOSAL', 'The working source no longer matches the proposal snapshot.')
  }
  if (diffHash !== proposal.diffHash) return failure('DIFF_MISMATCH', 'The proposal payload changed after approval.')

  let afterHtml: string
  try {
    afterHtml = applySourcePatches(current.html, proposal.patches.map(({ start, end, ...patch }) => ({
      ...patch,
      startOffset: start,
      endOffset: end,
    })))
    if (afterHtml !== proposal.proposedHtml || current.css !== proposal.proposedCss) {
      return failure('DIFF_MISMATCH', 'The guarded patches no longer produce the reviewed proposal.')
    }
    createSourceMapping(afterHtml, current.sourceRevision + 1)
  } catch (error) {
    return failure('STALE_PATCH', error instanceof Error ? error.message : 'The guarded source patch failed.')
  }

  const [afterHtmlHash, afterCssHash] = await Promise.all([
    hashText(afterHtml),
    hashText(proposal.proposedCss),
  ])
  const appliedRevision = current.sourceRevision + 1
  const change: ChangeRecord = {
    changeId: crypto.randomUUID(),
    proposalId: proposal.proposalId,
    issueId: proposal.issueId,
    ruleId: proposal.validationTarget.ruleId,
    family: proposal.family,
    classification: proposal.classification,
    sourceLine: proposal.affectedSourceRange.start === 0
      ? 1
      : current.html.slice(0, proposal.affectedSourceRange.start).split(/\r?\n/u).length,
    beforeHtml: current.html,
    beforeCss: current.css,
    afterHtml,
    afterCss: proposal.proposedCss,
    beforeHtmlHash: htmlHash,
    beforeCssHash: cssHash,
    afterHtmlHash,
    afterCssHash,
    appliedAt: new Date().toISOString(),
    verification: 'PENDING',
    validationTarget: proposal.validationTarget,
    restorationTarget: proposal.restorationTarget,
    appliedRevision,
    undoneAt: null,
    undoneRevision: null,
  }
  return { ok: true, data: { proposal: { ...proposal, status: 'APPLIED' }, change } }
}

export async function undoLatestChange(
  change: ChangeRecord,
  current: { html: string; css: string },
): Promise<ProposalResult<{ html: string; css: string; change: ChangeRecord }>> {
  if (change.undoneAt) return failure('NOT_APPLICABLE', 'This change has already been undone.')
  const [htmlHash, cssHash] = await Promise.all([hashText(current.html), hashText(current.css)])
  if (htmlHash !== change.afterHtmlHash || cssHash !== change.afterCssHash ||
    current.html !== change.afterHtml || current.css !== change.afterCss) {
    return failure('STALE_UNDO', 'Undo was refused because the source changed after this repair.')
  }
  return {
    ok: true,
    data: {
      html: change.beforeHtml,
      css: change.beforeCss,
      change: { ...change, undoneAt: new Date().toISOString() },
    },
  }
}

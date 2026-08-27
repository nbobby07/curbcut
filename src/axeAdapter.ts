import type { ScanResultPayload } from './previewProtocol'
import type { SourceMapping, SourceNode } from './sourceMap'

export type Impact = 'critical' | 'serious' | 'moderate' | 'minor' | null
export type Classification = 'MECHANICAL' | 'CONTEXTUAL' | 'MANUAL_REVIEW'

export type AccessibilityIssue = {
  issueId: string
  scanId: string
  sourceRevision: number
  resultKind: 'violation' | 'incomplete'
  ruleId: string
  impact: Impact
  help: string
  helpUrl: string
  tags: string[]
  target: string[]
  htmlSnippet: string
  nodeId?: string
  sourceNode?: SourceNode
  classification: Classification
  classificationReason: string
}

export type ScanMetrics = {
  ruleCount: number
  affectedNodeCount: number
  critical: number
  serious: number
  moderate: number
  minor: number
  manualReviewsOutstanding: number
}

const RULE_CLASSIFICATION: Readonly<Record<string, Classification>> = {
  label: 'CONTEXTUAL',
  'button-name': 'CONTEXTUAL',
  'html-has-lang': 'CONTEXTUAL',
  'image-alt': 'CONTEXTUAL',
  tabindex: 'MECHANICAL',
  'color-contrast': 'MANUAL_REVIEW',
  'heading-order': 'MANUAL_REVIEW',
}

function classify(
  resultKind: AccessibilityIssue['resultKind'],
  ruleId: string,
  sourceNode: SourceNode | undefined,
) {
  if (resultKind === 'incomplete') {
    return { classification: 'MANUAL_REVIEW' as const, reason: 'axe marked this check incomplete; human review is required.' }
  }
  if (!sourceNode) {
    return { classification: 'MANUAL_REVIEW' as const, reason: 'No exact source-backed element could be mapped safely.' }
  }
  const classification = RULE_CLASSIFICATION[ruleId] ?? 'MANUAL_REVIEW'
  const reason = classification === 'MECHANICAL'
    ? 'A deterministic syntax-only repair may be available for this exact source-backed target.'
    : classification === 'CONTEXTUAL'
      ? 'Any repair requires a human-confirmed semantic value and visible approval.'
      : 'This rule needs contextual, visual, or unsupported analysis.'
  return { classification, reason }
}

export function normalizeAxeResults(
  payload: ScanResultPayload,
  mapping: SourceMapping,
  scanId: string,
): AccessibilityIssue[] {
  const issues: AccessibilityIssue[] = []

  for (const resultKind of ['violation', 'incomplete'] as const) {
    const rules = resultKind === 'violation' ? payload.violations : payload.incomplete
    for (const rule of rules) {
      rule.nodes.forEach((node, index) => {
        const sourceNode = node.nodeId ? mapping.nodesById.get(node.nodeId) : undefined
        const classification = classify(resultKind, rule.id, sourceNode)
        issues.push({
          issueId: `${scanId}:${resultKind}:${rule.id}:${index}:${node.nodeId ?? 'unmapped'}`,
          scanId,
          sourceRevision: mapping.sourceRevision,
          resultKind,
          ruleId: rule.id,
          impact: node.impact,
          help: rule.help,
          helpUrl: rule.helpUrl,
          tags: rule.tags,
          target: node.target,
          htmlSnippet: node.html,
          ...(sourceNode && node.nodeId ? { nodeId: node.nodeId, sourceNode } : {}),
          classification: classification.classification,
          classificationReason: classification.reason,
        })
      })
    }
  }
  return issues
}

export function getScanMetrics(issues: readonly AccessibilityIssue[]): ScanMetrics {
  const violations = issues.filter(({ resultKind }) => resultKind === 'violation')
  return {
    ruleCount: new Set(violations.map(({ ruleId }) => ruleId)).size,
    affectedNodeCount: violations.length,
    critical: violations.filter(({ impact }) => impact === 'critical').length,
    serious: violations.filter(({ impact }) => impact === 'serious').length,
    moderate: violations.filter(({ impact }) => impact === 'moderate').length,
    minor: violations.filter(({ impact }) => impact === 'minor').length,
    manualReviewsOutstanding: issues.filter(
      ({ resultKind, classification }) => resultKind === 'incomplete' || classification !== 'MECHANICAL',
    ).length,
  }
}

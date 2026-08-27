import type { AccessibilityIssue, Classification } from './axeAdapter'
import {
  applySourcePatches,
  attributeInsertionOffset,
  createSourceMapping,
  type SourceMapping,
  type SourceNode,
  type SourcePatch,
} from './sourceMap'

export type RepairFamily = 'missing-form-label' | 'positive-tabindex' | 'image-alternative'

export type RepairPatch = {
  start: number
  end: number
  expectedText: string
  replacement: string
}

export type HumanValues = {
  labelText?: string
  altMode?: 'meaningful' | 'decorative'
  altText?: string
}

export type ValidationTarget = {
  ruleId: 'label' | 'tabindex' | 'image-alt'
  tagName: string
  id?: string
  ordinal?: number
}

export type ValidatedRepair = {
  family: RepairFamily
  classification: Classification
  patches: readonly RepairPatch[]
  proposedHtml: string
  diff: { before: string; after: string }
  rationale: string
  expectedValidation: string
  semanticJudgmentRequired: boolean
  humanValues: Readonly<HumanValues>
  validationTarget: ValidationTarget
  restorationTarget: ValidationTarget
}

export type RepairRefusalCode =
  | 'UNSUPPORTED_RULE'
  | 'UNMAPPED_TARGET'
  | 'STALE_MAPPING'
  | 'UNSUPPORTED_TARGET'
  | 'HUMAN_VALUE_REQUIRED'
  | 'INVALID_HUMAN_VALUE'
  | 'DUPLICATE_ID'
  | 'NONLITERAL_ATTRIBUTE'
  | 'EXISTING_COMPLEX_LABEL'
  | 'AMBIGUOUS_INSERTION'
  | 'ATTRIBUTE_RANGE_MISSING'
  | 'COUPLED_TAB_ORDER'
  | 'AMBIGUOUS_IMAGE_PURPOSE'
  | 'UNSUPPORTED_IMAGE'
  | 'CONFLICTING_ARIA'
  | 'STRUCTURAL_VALIDATION_FAILED'

export type RepairDecision =
  | { ok: true; repair: ValidatedRepair }
  | { ok: false; refusal: { code: RepairRefusalCode; message: string } }

const refuse = (code: RepairRefusalCode, message: string): RepairDecision => ({
  ok: false,
  refusal: { code, message },
})

const ordinalOf = (nodeId: string) => {
  const match = /^cc-\d+-(\d+)$/.exec(nodeId)
  return match ? Number(match[1]) : undefined
}

const sourcePatches = (patches: readonly RepairPatch[]): SourcePatch[] => patches.map((patch) => ({
  startOffset: patch.start,
  endOffset: patch.end,
  expectedText: patch.expectedText,
  replacement: patch.replacement,
}))

const escapeText = (value: string) => value
  .replaceAll('&', '&amp;')
  .replaceAll('<', '&lt;')
  .replaceAll('>', '&gt;')

const escapeAttribute = (value: string, quote = '"') => escapeText(value)
  .replaceAll(quote, quote === '"' ? '&quot;' : '&#39;')

function visibleText(value: unknown, maximum: number): string | null {
  if (typeof value !== 'string' || value !== value.trim()) return null
  if (Array.from(value).length < 1 || Array.from(value).length > maximum) return null
  if (/[\u0000-\u001f\u007f]/u.test(value)) return null
  return value
}

function compactDiff(source: string, proposed: string, patches: readonly RepairPatch[]) {
  const first = Math.min(...patches.map(({ start }) => start))
  const last = Math.max(...patches.map(({ end }) => end))
  const start = source.lastIndexOf('\n', Math.max(0, first - 1)) + 1
  const lineEnd = source.indexOf('\n', last)
  const end = lineEnd < 0 ? source.length : source[lineEnd - 1] === '\r' ? lineEnd - 1 : lineEnd
  const proposedEnd = end + proposed.length - source.length
  return { before: source.slice(start, end), after: proposed.slice(start, proposedEnd) }
}

function getTarget(
  source: string,
  mapping: SourceMapping,
  issue: AccessibilityIssue,
): SourceNode | RepairDecision {
  if (mapping.canonicalSource !== source || mapping.sourceRevision !== issue.sourceRevision) {
    return refuse('STALE_MAPPING', 'The issue no longer belongs to the current source revision.')
  }
  if (!issue.nodeId || !issue.sourceNode) {
    return refuse('UNMAPPED_TARGET', 'The axe target has no exact source-backed node.')
  }
  const target = mapping.nodesById.get(issue.nodeId)
  return target ?? refuse('UNMAPPED_TARGET', 'The mapped source node is unavailable.')
}

function hasNewParseErrors(before: SourceMapping, after: SourceMapping) {
  return after.parseErrors.length > before.parseErrors.length
}

function finalize(
  source: string,
  mapping: SourceMapping,
  base: Omit<ValidatedRepair, 'proposedHtml' | 'diff'>,
  verify: (proposed: SourceMapping) => boolean,
): RepairDecision {
  try {
    const proposedHtml = applySourcePatches(source, sourcePatches(base.patches))
    const proposedMapping = createSourceMapping(proposedHtml, mapping.sourceRevision + 1)
    if (hasNewParseErrors(mapping, proposedMapping) || !verify(proposedMapping)) {
      return refuse('STRUCTURAL_VALIDATION_FAILED', 'The surgical patch did not produce the expected source structure.')
    }
    return {
      ok: true,
      repair: { ...base, proposedHtml, diff: compactDiff(source, proposedHtml, base.patches) },
    }
  } catch (error) {
    return refuse(
      'STRUCTURAL_VALIDATION_FAILED',
      error instanceof Error ? error.message : 'The proposed source could not be validated.',
    )
  }
}

function literalId(node: SourceNode): string | null {
  const id = node.attributes.id
  return id && /^[^\s"'<>`=]+$/u.test(id) ? id : null
}

function labelRepair(
  source: string,
  mapping: SourceMapping,
  issue: AccessibilityIssue,
  target: SourceNode,
  values: HumanValues,
): RepairDecision {
  if (issue.ruleId !== 'label') return refuse('UNSUPPORTED_RULE', 'This repair only handles axe label findings.')
  if (!['input', 'select', 'textarea'].includes(target.tagName) || target.attributes.type === 'hidden') {
    return refuse('UNSUPPORTED_TARGET', 'Only native, visible input, select, and textarea controls are supported.')
  }
  const labelText = visibleText(values.labelText, 120)
  if (!values.labelText) return refuse('HUMAN_VALUE_REQUIRED', 'Visible label text must be provided by a human.')
  if (!labelText) return refuse('INVALID_HUMAN_VALUE', 'Label text must be 1–120 visible characters without control characters or edge whitespace.')
  if (target.attributes['aria-label'] || target.attributes['aria-labelledby']) {
    return refuse('EXISTING_COMPLEX_LABEL', 'The control already uses ARIA labeling that needs contextual review.')
  }

  const existingId = target.attributes.id
  let id = literalId(target)
  if (existingId && !id) return refuse('NONLITERAL_ATTRIBUTE', 'The control ID is not a safe literal value.')
  if (id && mapping.nodes.filter((node) => node.attributes.id === id).length !== 1) {
    return refuse('DUPLICATE_ID', 'The control ID is duplicated, so a label association would be ambiguous.')
  }
  if (id && mapping.nodes.some((node) => node.tagName === 'label' && node.attributes.for === id)) {
    return refuse('EXISTING_COMPLEX_LABEL', 'A label already references this control and needs contextual review.')
  }
  if (mapping.nodes.some((node) => node.tagName === 'label' &&
    node.sourceRange.startOffset < target.sourceRange.startOffset &&
    node.sourceRange.endOffset > target.sourceRange.endOffset)) {
    return refuse('EXISTING_COMPLEX_LABEL', 'The control is already nested in a label and needs contextual review.')
  }

  const patches: RepairPatch[] = []
  if (!id) {
    const used = new Set(mapping.nodes.map((node) => node.attributes.id).filter(Boolean))
    let suffix = 1
    do {
      id = `curbcut-${target.tagName}-${suffix++}`
    } while (used.has(id))
    const offset = attributeInsertionOffset(source, target.startTagRange)
    patches.push({ start: offset, end: offset, expectedText: '', replacement: ` id="${id}"` })
  }

  const offset = target.startTagRange.startOffset
  const lineStart = source.lastIndexOf('\n', Math.max(0, offset - 1)) + 1
  const indentation = source.slice(lineStart, offset)
  if (!/^[\t ]*$/u.test(indentation) && /<(?:script|style)\b/iu.test(indentation)) {
    return refuse('AMBIGUOUS_INSERTION', 'A safe label insertion point could not be established.')
  }
  const newline = source.includes('\r\n') ? '\r\n' : '\n'
  const separator = /^[\t ]*$/u.test(indentation) ? newline + indentation : ''
  patches.push({
    start: offset,
    end: offset,
    expectedText: '',
    replacement: `<label for="${escapeAttribute(id)}">${escapeText(labelText)}</label>${separator}`,
  })

  const ordinal = ordinalOf(target.nodeId)
  return finalize(source, mapping, {
    family: 'missing-form-label',
    classification: 'CONTEXTUAL',
    patches,
    rationale: 'Adds one visible label explicitly associated with the mapped form control.',
    expectedValidation: 'A real axe rescan must no longer report label for this control.',
    semanticJudgmentRequired: true,
    humanValues: { labelText },
    validationTarget: { ruleId: 'label', tagName: target.tagName, id },
    restorationTarget: { ruleId: 'label', tagName: target.tagName, ...(existingId ? { id: existingId } : { ordinal }) },
  }, (proposed) => {
    const controls = proposed.nodes.filter((node) => node.tagName === target.tagName && node.attributes.id === id)
    const labels = proposed.nodes.filter((node) => node.tagName === 'label' && node.attributes.for === id)
    return controls.length === 1 && labels.length === 1
  })
}

function literalPositiveTabindex(source: string, node: SourceNode): number | null {
  const range = node.attributeRanges.tabindex
  if (!range) return null
  const raw = source.slice(range.startOffset, range.endOffset)
  const match = /^tabindex\s*=\s*(["'])([+]?[0-9]+)\1$/iu.exec(raw)
  if (!match) return null
  const value = Number(match[2])
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

function tabindexRepair(
  source: string,
  mapping: SourceMapping,
  issue: AccessibilityIssue,
  target: SourceNode,
): RepairDecision {
  if (issue.ruleId !== 'tabindex') return refuse('UNSUPPORTED_RULE', 'This repair only handles axe tabindex findings.')
  const range = target.attributeRanges.tabindex
  if (!range) return refuse('ATTRIBUTE_RANGE_MISSING', 'The exact tabindex source range is unavailable.')
  if (literalPositiveTabindex(source, target) === null) {
    return refuse('NONLITERAL_ATTRIBUTE', 'tabindex must be a quoted positive integer literal.')
  }
  if (mapping.nodes.filter((node) => literalPositiveTabindex(source, node) !== null).length > 1) {
    return refuse('COUPLED_TAB_ORDER', 'Multiple positive tabindex values may form a coupled custom order and require review.')
  }

  const start = range.startOffset > target.startTagRange.startOffset && /[\t ]/u.test(source[range.startOffset - 1])
    ? range.startOffset - 1
    : range.startOffset
  const patch = {
    start,
    end: range.endOffset,
    expectedText: source.slice(start, range.endOffset),
    replacement: '',
  }
  const ordinal = ordinalOf(target.nodeId)
  return finalize(source, mapping, {
    family: 'positive-tabindex',
    classification: 'MECHANICAL',
    patches: [patch],
    rationale: 'Removes only the mapped positive tabindex attribute and leaves document order unchanged.',
    expectedValidation: 'A real axe rescan must no longer report tabindex for this node.',
    semanticJudgmentRequired: false,
    humanValues: {},
    validationTarget: { ruleId: 'tabindex', tagName: target.tagName, ordinal },
    restorationTarget: { ruleId: 'tabindex', tagName: target.tagName, ordinal },
  }, (proposed) => ordinal !== undefined && proposed.nodes[ordinal]?.attributes.tabindex === undefined)
}

function imageRepair(
  source: string,
  mapping: SourceMapping,
  issue: AccessibilityIssue,
  target: SourceNode,
  values: HumanValues,
): RepairDecision {
  if (issue.ruleId !== 'image-alt') return refuse('UNSUPPORTED_RULE', 'This repair only handles axe image-alt findings.')
  if (target.tagName !== 'img') return refuse('UNSUPPORTED_IMAGE', 'Only native img elements are supported.')
  if (target.attributes.usemap) return refuse('UNSUPPORTED_IMAGE', 'Image maps require contextual alternative-text review.')
  if (target.attributes['aria-label'] || target.attributes['aria-labelledby']) {
    return refuse('CONFLICTING_ARIA', 'The image has ARIA naming that conflicts with a simple alt repair.')
  }
  const purposeHints = [target.attributes.id, target.attributes.class, target.attributes.title, target.attributes.role]
    .filter(Boolean).join(' ')
  if (/\b(?:chart|diagram|graph|map)\b/iu.test(purposeHints)) {
    return refuse('AMBIGUOUS_IMAGE_PURPOSE', 'Charts and diagrams need a richer human-authored alternative, not this repair.')
  }
  if (!values.altMode) return refuse('HUMAN_VALUE_REQUIRED', 'A human must choose whether the image is meaningful or decorative.')
  const altText = values.altMode === 'meaningful' ? visibleText(values.altText, 160) : ''
  if (values.altMode === 'meaningful' && !values.altText) {
    return refuse('HUMAN_VALUE_REQUIRED', 'Meaningful images require human-provided alternative text.')
  }
  if (values.altMode === 'meaningful' && !altText) {
    return refuse('INVALID_HUMAN_VALUE', 'Alternative text must be 1–160 visible characters without control characters or edge whitespace.')
  }

  const range = target.attributeRanges.alt
  let patch: RepairPatch
  if (range) {
    const raw = source.slice(range.startOffset, range.endOffset)
    const quoted = /^([^=]+=\s*)(["'])([\s\S]*)\2$/iu.exec(raw)
    patch = {
      start: range.startOffset,
      end: range.endOffset,
      expectedText: raw,
      replacement: quoted
        ? `${quoted[1]}${quoted[2]}${escapeAttribute(altText!, quoted[2])}${quoted[2]}`
        : `alt="${escapeAttribute(altText!)}"`,
    }
  } else {
    const offset = attributeInsertionOffset(source, target.startTagRange)
    patch = { start: offset, end: offset, expectedText: '', replacement: ` alt="${escapeAttribute(altText!)}"` }
  }

  const ordinal = ordinalOf(target.nodeId)
  return finalize(source, mapping, {
    family: 'image-alternative',
    classification: 'CONTEXTUAL',
    patches: [patch],
    rationale: values.altMode === 'decorative'
      ? 'Adds an empty alt attribute after the human marked the image decorative.'
      : 'Adds the human-authored alternative text to the mapped image.',
    expectedValidation: 'A real axe rescan must no longer report image-alt for this image.',
    semanticJudgmentRequired: true,
    humanValues: values.altMode === 'decorative' ? { altMode: 'decorative' } : { altMode: 'meaningful', altText: altText! },
    validationTarget: { ruleId: 'image-alt', tagName: 'img', ordinal },
    restorationTarget: { ruleId: 'image-alt', tagName: 'img', ordinal },
  }, (proposed) => ordinal !== undefined && proposed.nodes[ordinal]?.tagName === 'img' && proposed.nodes[ordinal].attributes.alt === altText)
}

export function createRepair(
  source: string,
  mapping: SourceMapping,
  issue: AccessibilityIssue,
  family: RepairFamily,
  values: HumanValues = {},
): RepairDecision {
  const target = getTarget(source, mapping, issue)
  if ('ok' in target) return target
  if (family === 'missing-form-label') return labelRepair(source, mapping, issue, target, values)
  if (family === 'positive-tabindex') return tabindexRepair(source, mapping, issue, target)
  return imageRepair(source, mapping, issue, target, values)
}

export async function hashText(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

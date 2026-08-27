import { describe, expect, it } from 'vitest'
import { getScanMetrics, normalizeAxeResults } from './axeAdapter'
import { createSourceMapping } from './sourceMap'

describe('axe issue normalization', () => {
  it('flattens nodes, maps exact ranges, and defaults incomplete/unmapped evidence safely', () => {
    const source = '<main>\n  <input type="email">\n</main>'
    const mapping = createSourceMapping(source, 4)
    const input = mapping.nodes.find(({ tagName }) => tagName === 'input')!
    const issues = normalizeAxeResults({
      violations: [{
        id: 'label',
        help: 'Form elements must have labels',
        helpUrl: 'https://example.test/label',
        tags: ['wcag2a'],
        nodes: [
          { impact: 'critical', target: ['input'], html: '<input>', nodeId: input.nodeId },
          { impact: 'serious', target: ['#implicit'], html: '<div>' },
        ],
      }],
      incomplete: [{
        id: 'color-contrast',
        help: 'Contrast needs review',
        helpUrl: 'https://example.test/contrast',
        tags: ['wcag2aa'],
        nodes: [{ impact: 'serious', target: ['p'], html: '<p>' }],
      }],
    }, mapping, 'scan-1')

    expect(issues).toHaveLength(3)
    expect(issues[0]).toMatchObject({
      sourceNode: input,
      classification: 'CONTEXTUAL',
      resultKind: 'violation',
    })
    expect(source.slice(
      issues[0].sourceNode!.sourceRange.startOffset,
      issues[0].sourceNode!.sourceRange.endOffset,
    )).toBe('<input type="email">')
    expect(issues[1]).toMatchObject({ classification: 'MANUAL_REVIEW' })
    expect(issues[1].sourceNode).toBeUndefined()
    expect(issues[2]).toMatchObject({ classification: 'MANUAL_REVIEW', resultKind: 'incomplete' })
    expect(getScanMetrics(issues)).toEqual({
      ruleCount: 1,
      affectedNodeCount: 2,
      critical: 1,
      serious: 1,
      moderate: 0,
      minor: 0,
      manualReviewsOutstanding: 3,
    })
  })

  it('classifies known mechanical rules and unknown rules explicitly', () => {
    const mapping = createSourceMapping('<button tabindex="2">Pay</button>', 1)
    const button = mapping.nodes[0]
    const makeRule = (id: string) => ({
      id,
      help: id,
      helpUrl: 'https://example.test',
      tags: [],
      nodes: [{ impact: 'serious' as const, target: ['button'], html: '<button>', nodeId: button.nodeId }],
    })

    expect(normalizeAxeResults({ violations: [makeRule('tabindex')], incomplete: [] }, mapping, 's')[0].classification).toBe('MECHANICAL')
    expect(normalizeAxeResults({ violations: [makeRule('unknown-rule')], incomplete: [] }, mapping, 's')[0].classification).toBe('MANUAL_REVIEW')
  })
})

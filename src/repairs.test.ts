import { describe, expect, it } from 'vitest'
import type { AccessibilityIssue } from './axeAdapter'
import { createRepair, type RepairFamily } from './repairs'
import { applySourcePatches, createSourceMapping } from './sourceMap'

function caseFor(source: string, ruleId: string, tagName: string, index = 0) {
  const mapping = createSourceMapping(source, 3)
  const node = mapping.nodes.filter((candidate) => candidate.tagName === tagName)[index]
  const issue: AccessibilityIssue = {
    issueId: `scan:${ruleId}:${node.nodeId}`,
    scanId: 'scan',
    sourceRevision: mapping.sourceRevision,
    resultKind: 'violation',
    ruleId,
    impact: 'critical',
    help: ruleId,
    helpUrl: 'https://example.test',
    tags: [],
    target: [tagName],
    htmlSnippet: source.slice(node.startTagRange.startOffset, node.startTagRange.endOffset),
    nodeId: node.nodeId,
    sourceNode: node,
    classification: ruleId === 'tabindex' ? 'MECHANICAL' : 'CONTEXTUAL',
    classificationReason: 'test',
  }
  return { mapping, issue }
}

function repair(source: string, ruleId: string, tagName: string, family: RepairFamily, values = {}, index = 0) {
  const { mapping, issue } = caseFor(source, ruleId, tagName, index)
  return createRepair(source, mapping, issue, family, values)
}

describe('missing form label repair', () => {
  it('adds one visible label without changing unrelated CRLF or Unicode bytes', () => {
    const source = '<form>\r\n  <input id="email" type="email">\r\n  <p>Crème</p>\r\n</form>'
    const result = repair(source, 'label', 'input', 'missing-form-label', { labelText: 'Email address' })

    expect(result).toMatchObject({ ok: true, repair: { classification: 'CONTEXTUAL' } })
    if (!result.ok) return
    expect(result.repair.proposedHtml).toBe(
      '<form>\r\n  <label for="email">Email address</label>\r\n  <input id="email" type="email">\r\n  <p>Crème</p>\r\n</form>',
    )
    expect(result.repair.patches).toHaveLength(1)
    expect(result.repair.diff).toEqual({
      before: '  <input id="email" type="email">',
      after: '  <label for="email">Email address</label>\r\n  <input id="email" type="email">',
    })
  })

  it('reuses safe adjacent visible text as an approval-gated label candidate', () => {
    const source = '<div class="field">\n  <span>Email address</span>\n  <input id="email">\n</div>'
    const result = repair(source, 'label', 'input', 'missing-form-label')

    expect(result).toMatchObject({
      ok: true,
      repair: { semanticJudgmentRequired: true, humanValues: { labelText: 'Email address' } },
    })
    expect(result.ok && result.repair.proposedHtml).toContain('<label for="email">Email address</label>\n  <input id="email">')
  })

  it('generates a collision-free ID with two guarded patches', () => {
    const source = '<input id="curbcut-input-1"><input type="email">'
    const result = repair(source, 'label', 'input', 'missing-form-label', { labelText: 'Work email' }, 1)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.repair.proposedHtml).toBe(
      '<input id="curbcut-input-1"><label for="curbcut-input-2">Work email</label><input type="email" id="curbcut-input-2">',
    )
    expect(result.repair.patches).toHaveLength(2)
  })

  it('changes only the mapped control when similar controls exist', () => {
    const source = '<input id="first"><input id="second">'
    const result = repair(source, 'label', 'input', 'missing-form-label', { labelText: 'Second value' }, 1)
    expect(result.ok && result.repair.proposedHtml).toBe(
      '<input id="first"><label for="second">Second value</label><input id="second">',
    )
  })

  it('supports a no-ID select without rewriting its options', () => {
    const source = '<select name="size"><option>Small</option></select>'
    const result = repair(source, 'label', 'select', 'missing-form-label', { labelText: 'Size' })
    expect(result.ok && result.repair.proposedHtml).toBe(
      '<label for="curbcut-select-1">Size</label>\n<select name="size" id="curbcut-select-1"><option>Small</option></select>',
    )
  })

  it.each([
    ['missing human text', '<input id="email">', {}, 'HUMAN_VALUE_REQUIRED'],
    ['invalid edge whitespace', '<input id="email">', { labelText: ' Email ' }, 'INVALID_HUMAN_VALUE'],
    ['duplicate ID', '<input id="email"><div id="email"></div>', { labelText: 'Email' }, 'DUPLICATE_ID'],
    ['templated ID', '<input id="{{ emailId }}">', { labelText: 'Email' }, 'NONLITERAL_ATTRIBUTE'],
    ['existing ARIA', '<input id="email" aria-label="Email">', { labelText: 'Email' }, 'EXISTING_COMPLEX_LABEL'],
    ['existing label', '<label for="email">Email</label><input id="email">', { labelText: 'Email' }, 'EXISTING_COMPLEX_LABEL'],
  ])('refuses %s', (_name, source, values, code) => {
    expect(repair(source as string, 'label', 'input', 'missing-form-label', values)).toMatchObject({
      ok: false,
      refusal: { code },
    })
  })
})

describe('positive tabindex repair', () => {
  it('removes only the quoted positive attribute and one adjacent space', () => {
    const source = '<button class="buy" tabindex="2" data-note="é">Buy</button>'
    const result = repair(source, 'tabindex', 'button', 'positive-tabindex')

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.repair.proposedHtml).toBe('<button class="buy" data-note="é">Buy</button>')
    expect(result.repair.patches).toEqual([{
      start: source.indexOf(' tabindex'),
      end: source.indexOf(' tabindex') + ' tabindex="2"'.length,
      expectedText: ' tabindex="2"',
      replacement: '',
    }])
  })

  it('preserves CRLF, quote style, attribute order, and similar nodes', () => {
    const source = '<button tabindex="0">A</button>\r\n<button\r\n  tabindex=\'3\'\r\n  class="b">B</button>\r\n'
    const result = repair(source, 'tabindex', 'button', 'positive-tabindex', {}, 1)
    expect(result.ok && result.repair.proposedHtml).toBe(
      '<button tabindex="0">A</button>\r\n<button\r\n \r\n  class="b">B</button>\r\n',
    )
  })

  it('refuses unquoted/template and coupled positive orders', () => {
    expect(repair('<button tabindex=2>Buy</button>', 'tabindex', 'button', 'positive-tabindex')).toMatchObject({
      ok: false,
      refusal: { code: 'NONLITERAL_ATTRIBUTE' },
    })
    expect(repair('<button tabindex="2">A</button><button tabindex="3">B</button>', 'tabindex', 'button', 'positive-tabindex')).toMatchObject({
      ok: false,
      refusal: { code: 'COUPLED_TAB_ORDER' },
    })
    expect(repair('<button>Buy</button>', 'tabindex', 'button', 'positive-tabindex')).toMatchObject({
      ok: false,
      refusal: { code: 'ATTRIBUTE_RANGE_MISSING' },
    })
  })
})

describe('image alternative repair', () => {
  it('adds escaped human-authored meaningful alt text to only the mapped image', () => {
    const source = '<img src="one.png"><img src="two.png">\n<p>Unchanged é</p>'
    const result = repair(source, 'image-alt', 'img', 'image-alternative', {
      altMode: 'meaningful',
      altText: 'Canvas & "oak" organizer',
    }, 1)

    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.repair.proposedHtml).toBe(
      '<img src="one.png"><img src="two.png" alt="Canvas &amp; &quot;oak&quot; organizer">\n<p>Unchanged é</p>',
    )
  })

  it('replaces an existing single-quoted alt exactly after a decorative decision', () => {
    const source = '<img class="texture" alt=\'old\' src="x.png">\r\n'
    const result = repair(source, 'image-alt', 'img', 'image-alternative', { altMode: 'decorative' })
    expect(result.ok && result.repair.proposedHtml).toBe(
      '<img class="texture" alt=\'\' src="x.png">\r\n',
    )
  })

  it('replaces an unquoted existing alt without touching adjacent attributes', () => {
    const source = '<img class="hero" alt=old src="x.png">'
    const result = repair(source, 'image-alt', 'img', 'image-alternative', { altMode: 'meaningful', altText: 'Hero product' })
    expect(result.ok && result.repair.proposedHtml).toBe('<img class="hero" alt="Hero product" src="x.png">')
  })

  it.each([
    ['missing decision', '<img src="x.png">', {}, 'HUMAN_VALUE_REQUIRED'],
    ['missing meaningful text', '<img src="x.png">', { altMode: 'meaningful' }, 'HUMAN_VALUE_REQUIRED'],
    ['chart', '<img class="sales-chart" src="x.png">', { altMode: 'decorative' }, 'AMBIGUOUS_IMAGE_PURPOSE'],
    ['image map', '<img usemap="#map" src="x.png">', { altMode: 'meaningful', altText: 'Map' }, 'UNSUPPORTED_IMAGE'],
    ['conflicting ARIA', '<img aria-label="Already named" src="x.png">', { altMode: 'decorative' }, 'CONFLICTING_ARIA'],
  ])('refuses %s', (_name, source, values, code) => {
    expect(repair(source as string, 'image-alt', 'img', 'image-alternative', values)).toMatchObject({
      ok: false,
      refusal: { code },
    })
  })
})

describe('common refusal boundary', () => {
  it('refuses stale and unmapped axe targets before dispatch', () => {
    const source = '<input id="email">'
    const { mapping, issue } = caseFor(source, 'label', 'input')
    expect(createRepair(source, createSourceMapping(source, 4), issue, 'missing-form-label', { labelText: 'Email' })).toMatchObject({
      ok: false,
      refusal: { code: 'STALE_MAPPING' },
    })
    expect(createRepair(source, mapping, { ...issue, nodeId: undefined, sourceNode: undefined }, 'missing-form-label', { labelText: 'Email' })).toMatchObject({
      ok: false,
      refusal: { code: 'UNMAPPED_TARGET' },
    })
  })

  it('refuses non-native controls and image types', () => {
    expect(repair('<checkout-input></checkout-input>', 'label', 'checkout-input', 'missing-form-label', { labelText: 'Email' })).toMatchObject({
      ok: false,
      refusal: { code: 'UNSUPPORTED_TARGET' },
    })
    expect(repair('<input type="image" src="x.png">', 'image-alt', 'input', 'image-alternative', { altMode: 'meaningful', altText: 'Submit' })).toMatchObject({
      ok: false,
      refusal: { code: 'UNSUPPORTED_IMAGE' },
    })
    expect(repair('<svg><title>Chart</title></svg>', 'image-alt', 'svg', 'image-alternative', { altMode: 'meaningful', altText: 'Chart' })).toMatchObject({
      ok: false,
      refusal: { code: 'UNSUPPORTED_IMAGE' },
    })
  })
})

describe('patch guards', () => {
  it('rejects expectedText mismatch before changing source', () => {
    expect(() => applySourcePatches('<img>', [{
      startOffset: 0,
      endOffset: 5,
      expectedText: '<input>',
      replacement: '<img alt="">',
    }])).toThrow('stale')
  })
})

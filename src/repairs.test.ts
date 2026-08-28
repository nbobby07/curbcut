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
    expect(result.ok && result.repair.proposedHtml).toBe(
      '<div class="field">\n  <span id="curbcut-label-1">Email address</span>\n  <input id="email" aria-labelledby="curbcut-label-1">\n</div>',
    )
    expect(result.ok && result.repair.patches).toHaveLength(2)
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

describe('button accessible name repair', () => {
  it('adds one escaped human-confirmed aria-label without changing unrelated bytes', () => {
    const source = '<main>\r\n  <button class="icon"><svg aria-hidden="true"></svg></button>\r\n  <p>Crème</p>\r\n</main>'
    const result = repair(source, 'button-name', 'button', 'button-accessible-name', {
      buttonName: 'Open cart & "review"',
    })

    expect(result).toMatchObject({
      ok: true,
      repair: {
        classification: 'CONTEXTUAL',
        semanticJudgmentRequired: true,
        humanValues: { buttonName: 'Open cart & "review"' },
        validationTarget: { ruleId: 'button-name', tagName: 'button' },
      },
    })
    if (!result.ok) return
    expect(result.repair.proposedHtml).toBe(
      '<main>\r\n  <button class="icon" aria-label="Open cart &amp; &quot;review&quot;"><svg aria-hidden="true"></svg></button>\r\n  <p>Crème</p>\r\n</main>',
    )
    expect(result.repair.patches).toEqual([{
      start: source.indexOf('><svg'),
      end: source.indexOf('><svg'),
      expectedText: '',
      replacement: ' aria-label="Open cart &amp; &quot;review&quot;"',
    }])
  })

  it('changes only the mapped native button when similar buttons exist', () => {
    const source = '<button class="icon"><svg></svg></button><button class="icon"><svg></svg></button>\n'
    const result = repair(source, 'button-name', 'button', 'button-accessible-name', { buttonName: 'Delete item' }, 1)
    expect(result.ok && result.repair.proposedHtml).toBe(
      '<button class="icon"><svg></svg></button><button class="icon" aria-label="Delete item"><svg></svg></button>\n',
    )
  })

  it.each([
    ['missing name', '<button><svg></svg></button>', {}, 'HUMAN_VALUE_REQUIRED'],
    ['edge whitespace', '<button><svg></svg></button>', { buttonName: ' Save ' }, 'INVALID_HUMAN_VALUE'],
    ['control character', '<button><svg></svg></button>', { buttonName: 'Save\nitem' }, 'INVALID_HUMAN_VALUE'],
    ['existing aria-label', '<button aria-label="Save"><svg></svg></button>', { buttonName: 'Save' }, 'EXISTING_ACCESSIBLE_NAME'],
    ['existing aria-labelledby', '<button aria-labelledby="name"><svg></svg></button>', { buttonName: 'Save' }, 'EXISTING_ACCESSIBLE_NAME'],
    ['existing title', '<button title="Save"><svg></svg></button>', { buttonName: 'Save' }, 'EXISTING_ACCESSIBLE_NAME'],
    ['template syntax', '<button data-action="{{ action }}"><svg></svg></button>', { buttonName: 'Save' }, 'NONLITERAL_ATTRIBUTE'],
  ])('refuses %s', (_name, source, values, code) => {
    expect(repair(source as string, 'button-name', 'button', 'button-accessible-name', values)).toMatchObject({
      ok: false,
      refusal: { code },
    })
  })

  it('refuses non-native button targets and mismatched axe rules', () => {
    expect(repair('<div role="button"></div>', 'button-name', 'div', 'button-accessible-name', { buttonName: 'Save' })).toMatchObject({
      ok: false,
      refusal: { code: 'UNSUPPORTED_TARGET' },
    })
    expect(repair('<button></button>', 'label', 'button', 'button-accessible-name', { buttonName: 'Save' })).toMatchObject({
      ok: false,
      refusal: { code: 'UNSUPPORTED_RULE' },
    })
  })
})

describe('document language repair', () => {
  it('adds a canonical BCP 47 tag to the explicit html start tag and preserves all other bytes', () => {
    const source = '<!doctype html>\r\n<html dir="ltr">\r\n<head><title>Café</title></head>\r\n<body>Crème</body>\r\n</html>\r\n'
    const result = repair(source, 'html-has-lang', 'html', 'document-language', { languageTag: 'EN-us' })

    expect(result).toMatchObject({
      ok: true,
      repair: {
        classification: 'CONTEXTUAL',
        semanticJudgmentRequired: true,
        humanValues: { languageTag: 'en-US' },
        validationTarget: { ruleId: 'html-has-lang', tagName: 'html' },
      },
    })
    if (!result.ok) return
    expect(result.repair.proposedHtml).toBe(
      '<!doctype html>\r\n<html dir="ltr" lang="en-US">\r\n<head><title>Café</title></head>\r\n<body>Crème</body>\r\n</html>\r\n',
    )
    expect(result.repair.patches).toEqual([{
      start: source.indexOf('>\r\n<head>'),
      end: source.indexOf('>\r\n<head>'),
      expectedText: '',
      replacement: ' lang="en-US"',
    }])
  })

  it.each([
    ['missing tag', '<html><body></body></html>', {}, 'HUMAN_VALUE_REQUIRED'],
    ['edge whitespace', '<html><body></body></html>', { languageTag: ' en ' }, 'INVALID_HUMAN_VALUE'],
    ['underscore syntax', '<html><body></body></html>', { languageTag: 'en_US' }, 'INVALID_HUMAN_VALUE'],
    ['invalid subtag', '<html><body></body></html>', { languageTag: 'en-123456789' }, 'INVALID_HUMAN_VALUE'],
    ['existing lang', '<html lang=""><body></body></html>', { languageTag: 'en' }, 'EXISTING_DOCUMENT_LANGUAGE'],
    ['existing xml:lang', '<html xml:lang="en"><body></body></html>', { languageTag: 'en' }, 'EXISTING_DOCUMENT_LANGUAGE'],
    ['template syntax', '<html data-locale="${locale}"><body></body></html>', { languageTag: 'en' }, 'NONLITERAL_ATTRIBUTE'],
  ])('refuses %s', (_name, source, values, code) => {
    expect(repair(source as string, 'html-has-lang', 'html', 'document-language', values)).toMatchObject({
      ok: false,
      refusal: { code },
    })
  })

  it('refuses a mapped non-document target and a mismatched axe rule', () => {
    expect(repair('<div></div>', 'html-has-lang', 'div', 'document-language', { languageTag: 'en' })).toMatchObject({
      ok: false,
      refusal: { code: 'UNSUPPORTED_TARGET' },
    })
    expect(repair('<html><body></body></html>', 'label', 'html', 'document-language', { languageTag: 'en' })).toMatchObject({
      ok: false,
      refusal: { code: 'UNSUPPORTED_RULE' },
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

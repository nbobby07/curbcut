import { parse, type DefaultTreeAdapterTypes } from 'parse5'
import { describe, expect, it } from 'vitest'
import {
  applySourcePatches,
  createSourceMapping,
  CURBCUT_NODE_ATTRIBUTE,
  sourceForExport,
} from './sourceMap'

function renderedNodeIds(previewSource: string): string[] {
  const document = parse(previewSource)
  const ids: string[] = []

  function visit(node: DefaultTreeAdapterTypes.Node) {
    if ('attrs' in node) {
      const mappingAttribute = node.attrs.find((attribute) => attribute.name === CURBCUT_NODE_ATTRIBUTE)
      if (mappingAttribute) ids.push(mappingAttribute.value)
    }
    if ('childNodes' in node) node.childNodes.forEach(visit)
    if ('tagName' in node && node.tagName === 'template' && 'content' in node) visit(node.content)
  }

  visit(document)
  return ids
}

describe('parser-backed source mapping', () => {
  it('maps source elements without existing IDs to exact parse5 ranges', () => {
    const source = '<main>\n  <input type="email">\n  <button>Continue</button>\n</main>'
    const mapping = createSourceMapping(source, 7)

    expect(mapping.nodes.map(({ tagName }) => tagName)).toEqual(['main', 'input', 'button'])
    const input = mapping.nodes[1]
    expect(source.slice(input.sourceRange.startOffset, input.sourceRange.endOffset)).toBe(
      '<input type="email">',
    )
    expect(source.slice(input.startTagRange.startOffset, input.startTagRange.endOffset)).toBe(
      '<input type="email">',
    )
    expect(input.attributeRanges.type).toMatchObject({
      startOffset: source.indexOf('type="email"'),
      endOffset: source.indexOf('type="email"') + 'type="email"'.length,
    })
    expect(input.attributes).toEqual({ type: 'email' })
    expect(renderedNodeIds(mapping.previewSource)).toEqual(mapping.nodes.map(({ nodeId }) => nodeId))
  })

  it('does not depend on missing or duplicate user IDs', () => {
    const mapping = createSourceMapping(
      '<div id="same"><span></span></div><section id="same"><input></section>',
      2,
    )

    expect(mapping.nodes).toHaveLength(4)
    expect(new Set(mapping.nodes.map(({ nodeId }) => nodeId)).size).toBe(4)
    expect(mapping.nodes.map(({ nodeId }) => nodeId)).toEqual([
      'cc-2-0',
      'cc-2-1',
      'cc-2-2',
      'cc-2-3',
    ])
  })

  it('keeps mapping metadata in preview output only', () => {
    const source = '<!doctype html>\r\n<html><body><p>Exact source</p></body></html>\r\n'
    const mapping = createSourceMapping(source, 1)

    expect(mapping.canonicalSource).toBe(source)
    expect(sourceForExport(mapping)).toBe(source)
    expect(mapping.canonicalSource).not.toContain(CURBCUT_NODE_ATTRIBUTE)
    expect(sourceForExport(mapping)).not.toContain(CURBCUT_NODE_ATTRIBUTE)
    expect(mapping.previewSource).toContain(CURBCUT_NODE_ATTRIBUTE)
  })

  it('binds deterministic IDs to a source revision', () => {
    const source = '<main><p>One</p></main>'

    expect(createSourceMapping(source, 9).nodes.map(({ nodeId }) => nodeId)).toEqual(
      createSourceMapping(source, 9).nodes.map(({ nodeId }) => nodeId),
    )
    expect(createSourceMapping(source, 10).nodes.map(({ nodeId }) => nodeId)).not.toEqual(
      createSourceMapping(source, 9).nodes.map(({ nodeId }) => nodeId),
    )
  })

  it('handles quoted greater-than characters and self-closing syntax', () => {
    const source = '<div title="1 > 0"><img src="data:image/png;base64,x" /></div>'
    const mapping = createSourceMapping(source, 3)

    expect(mapping.previewSource).toContain(
      '<div title="1 > 0" data-curbcut-node="cc-3-0">',
    )
    expect(mapping.previewSource).toContain(
      '<img src="data:image/png;base64,x"  data-curbcut-node="cc-3-1"/>',
    )
    expect(renderedNodeIds(mapping.previewSource)).toEqual(['cc-3-0', 'cc-3-1'])
  })

  it('reports exact Unicode and CRLF positions', () => {
    const source = '<main>é\r\n  <button>Pay</button>\r\n</main>'
    const button = createSourceMapping(source, 0).nodes.find(({ tagName }) => tagName === 'button')

    expect(button?.startTagRange).toMatchObject({
      startOffset: source.indexOf('<button>'),
      startLine: 2,
      startColumn: 3,
      endLine: 2,
      endColumn: 11,
    })
  })

  it('excludes implicit parser-created elements without source locations', () => {
    const mapping = createSourceMapping('<p>Fragment', 0)

    expect(mapping.nodes.map(({ tagName }) => tagName)).toEqual(['p'])
    expect(mapping.nodesById.size).toBe(1)
  })

  it('keeps IDs attached through browser-like malformed-table reparsing', () => {
    const source = '<table><tr><td>A</table><p>B'
    const mapping = createSourceMapping(source, 4)

    expect(mapping.nodes.map(({ tagName }) => tagName)).toEqual(['table', 'tr', 'td', 'p'])
    expect(mapping.nodes.find(({ tagName }) => tagName === 'tbody')).toBeUndefined()
    expect(renderedNodeIds(mapping.previewSource).sort()).toEqual(
      mapping.nodes.map(({ nodeId }) => nodeId).sort(),
    )
  })

  it('rejects source that collides with the reserved mapping attribute', () => {
    expect(() => createSourceMapping('<p data-curbcut-node="forged">Text</p>', 0)).toThrow(
      `${CURBCUT_NODE_ATTRIBUTE} is reserved`,
    )
  })
})

describe('raw-offset patches', () => {
  it('preserves every byte outside ordered surgical edits', () => {
    const source = '<input id="email" type="email">\r\n<!-- untouched é -->'
    const idOffset = source.indexOf('id="email"')
    const closeOffset = source.indexOf('>')
    const patched = applySourcePatches(source, [
      {
        startOffset: idOffset,
        endOffset: idOffset + 'id="email"'.length,
        expectedText: 'id="email"',
        replacement: 'id="checkout-email"',
      },
      {
        startOffset: closeOffset,
        endOffset: closeOffset,
        expectedText: '',
        replacement: ' aria-label="Email"',
      },
    ])

    expect(patched).toBe(
      '<input id="checkout-email" type="email" aria-label="Email">\r\n<!-- untouched é -->',
    )
    expect(patched.endsWith('\r\n<!-- untouched é -->')).toBe(true)
  })

  it('rejects stale, overlapping, duplicate, and out-of-bounds patches', () => {
    expect(() =>
      applySourcePatches('abcdef', [
        { startOffset: 1, endOffset: 3, expectedText: 'wrong', replacement: 'x' },
      ]),
    ).toThrow('stale')
    expect(() =>
      applySourcePatches('abcdef', [
        { startOffset: 1, endOffset: 4, expectedText: 'bcd', replacement: 'x' },
        { startOffset: 3, endOffset: 5, expectedText: 'de', replacement: 'y' },
      ]),
    ).toThrow('overlap')
    expect(() =>
      applySourcePatches('abcdef', [
        { startOffset: 2, endOffset: 2, expectedText: '', replacement: 'x' },
        { startOffset: 2, endOffset: 2, expectedText: '', replacement: 'y' },
      ]),
    ).toThrow('same range')
    expect(() =>
      applySourcePatches('abcdef', [
        { startOffset: -1, endOffset: 2, expectedText: '', replacement: 'x' },
      ]),
    ).toThrow('Invalid source patch range')
  })
})

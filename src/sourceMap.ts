import { parse, type DefaultTreeAdapterTypes, type ParserError } from 'parse5'

export const CURBCUT_NODE_ATTRIBUTE = 'data-curbcut-node'

export type SourceRange = {
  startOffset: number
  endOffset: number
  startLine: number
  startColumn: number
  endLine: number
  endColumn: number
}

export type SourceNode = {
  nodeId: string
  tagName: string
  attributes: Readonly<Record<string, string>>
  sourceRange: SourceRange
  startTagRange: SourceRange
  endTagRange: SourceRange | null
  attributeRanges: Readonly<Record<string, SourceRange>>
}

export type SourceMapping = {
  sourceRevision: number
  canonicalSource: string
  previewSource: string
  nodes: readonly SourceNode[]
  nodesById: ReadonlyMap<string, SourceNode>
  parseErrors: readonly ParserError[]
}

export type SourcePatch = {
  startOffset: number
  endOffset: number
  expectedText: string
  replacement: string
}

function toRange(location: {
  startOffset: number
  endOffset: number
  startLine: number
  startCol: number
  endLine: number
  endCol: number
}): SourceRange {
  return {
    startOffset: location.startOffset,
    endOffset: location.endOffset,
    startLine: location.startLine,
    startColumn: location.startCol,
    endLine: location.endLine,
    endColumn: location.endCol,
  }
}

function isElement(node: DefaultTreeAdapterTypes.Node): node is DefaultTreeAdapterTypes.Element {
  return 'tagName' in node
}

function childNodes(node: DefaultTreeAdapterTypes.Node): readonly DefaultTreeAdapterTypes.ChildNode[] {
  return 'childNodes' in node ? node.childNodes : []
}

export function attributeInsertionOffset(source: string, startTag: SourceRange): number {
  if (source[startTag.endOffset - 1] !== '>') {
    throw new Error(`Start tag does not end with ">" at offset ${startTag.endOffset}`)
  }

  let cursor = startTag.endOffset - 2
  while (cursor >= startTag.startOffset && /\s/.test(source[cursor])) cursor -= 1
  return source[cursor] === '/' ? cursor : startTag.endOffset - 1
}

export function applySourcePatches(source: string, patches: readonly SourcePatch[]): string {
  const ordered = [...patches].sort(
    (left, right) => left.startOffset - right.startOffset || left.endOffset - right.endOffset,
  )

  for (let index = 0; index < ordered.length; index += 1) {
    const patch = ordered[index]
    if (
      !Number.isInteger(patch.startOffset) ||
      !Number.isInteger(patch.endOffset) ||
      patch.startOffset < 0 ||
      patch.endOffset < patch.startOffset ||
      patch.endOffset > source.length
    ) {
      throw new Error(`Invalid source patch range ${patch.startOffset}:${patch.endOffset}`)
    }

    const previous = ordered[index - 1]
    if (
      previous &&
      (patch.startOffset < previous.endOffset ||
        (patch.startOffset === previous.startOffset && patch.endOffset === previous.endOffset))
    ) {
      throw new Error('Source patches overlap or target the same range')
    }

    if (source.slice(patch.startOffset, patch.endOffset) !== patch.expectedText) {
      throw new Error(`Source patch is stale at offset ${patch.startOffset}`)
    }
  }

  return ordered
    .slice()
    .reverse()
    .reduce(
      (result, patch) =>
        result.slice(0, patch.startOffset) + patch.replacement + result.slice(patch.endOffset),
      source,
    )
}

export function createSourceMapping(source: string, sourceRevision: number): SourceMapping {
  if (!Number.isSafeInteger(sourceRevision) || sourceRevision < 0) {
    throw new Error('sourceRevision must be a non-negative safe integer')
  }

  const parseErrors: ParserError[] = []
  const document = parse(source, {
    sourceCodeLocationInfo: true,
    onParseError: (error) => parseErrors.push(error),
  })
  const nodes: SourceNode[] = []
  const previewPatches: SourcePatch[] = []

  function visit(node: DefaultTreeAdapterTypes.Node) {
    if (isElement(node)) {
      if (node.attrs.some((attribute) => attribute.name.toLowerCase() === CURBCUT_NODE_ATTRIBUTE)) {
        throw new Error(`${CURBCUT_NODE_ATTRIBUTE} is reserved for Curbcut preview mapping`)
      }

      const location = node.sourceCodeLocation
      if (location?.startTag) {
        const nodeId = `cc-${sourceRevision}-${nodes.length}`
        const attributeRanges = Object.fromEntries(
          Object.entries(location.attrs ?? {}).map(([name, range]) => [name, toRange(range)]),
        )
        const sourceNode: SourceNode = {
          nodeId,
          tagName: node.tagName,
          attributes: Object.fromEntries(node.attrs.map(({ name, value }) => [name, value])),
          sourceRange: toRange(location),
          startTagRange: toRange(location.startTag),
          endTagRange: location.endTag ? toRange(location.endTag) : null,
          attributeRanges,
        }
        const insertionOffset = attributeInsertionOffset(source, sourceNode.startTagRange)

        nodes.push(sourceNode)
        previewPatches.push({
          startOffset: insertionOffset,
          endOffset: insertionOffset,
          expectedText: '',
          replacement: ` ${CURBCUT_NODE_ATTRIBUTE}="${nodeId}"`,
        })
      }
    }

    for (const child of childNodes(node)) visit(child)
    if (isElement(node) && node.tagName === 'template' && 'content' in node) visit(node.content)
  }

  visit(document)

  return {
    sourceRevision,
    canonicalSource: source,
    previewSource: applySourcePatches(source, previewPatches),
    nodes,
    nodesById: new Map(nodes.map((node) => [node.nodeId, node])),
    parseErrors,
  }
}

export function sourceForExport(mapping: SourceMapping): string {
  return mapping.canonicalSource
}

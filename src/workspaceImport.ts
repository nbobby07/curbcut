import { CURBCUT_NODE_ATTRIBUTE } from './sourceMap'
import { MAX_CSS_BYTES, MAX_HTML_BYTES } from './previewProtocol'

const MAX_WORKSPACE_BYTES = MAX_HTML_BYTES + MAX_CSS_BYTES + 20_000
const encoder = new TextEncoder()

export type ImportedWorkspace = {
  html: string
  css: string
  label: string
}

export class WorkspaceImportError extends Error {
  constructor(readonly code: 'INVALID_FILES' | 'INVALID_WORKSPACE' | 'SOURCE_TOO_LARGE' | 'RESERVED_METADATA', message: string) {
    super(message)
    this.name = 'WorkspaceImportError'
  }
}

const bytes = (value: string) => encoder.encode(value).byteLength
const extension = (file: File) => file.name.toLowerCase().match(/\.[^.]+$/u)?.[0] ?? ''

function validateSource(html: string, css: string) {
  if (!html.trim()) throw new WorkspaceImportError('INVALID_WORKSPACE', 'Imported HTML must not be empty.')
  if (bytes(html) > MAX_HTML_BYTES || bytes(css) > MAX_CSS_BYTES) {
    throw new WorkspaceImportError('SOURCE_TOO_LARGE', `HTML must be at most ${MAX_HTML_BYTES.toLocaleString()} bytes and CSS at most ${MAX_CSS_BYTES.toLocaleString()} bytes.`)
  }
  if (html.toLowerCase().includes(CURBCUT_NODE_ATTRIBUTE) || css.toLowerCase().includes(CURBCUT_NODE_ATTRIBUTE)) {
    throw new WorkspaceImportError('RESERVED_METADATA', `${CURBCUT_NODE_ATTRIBUTE} is reserved for Curbcut's isolated preview.`)
  }
}

export async function readWorkspaceFiles(files: readonly File[]): Promise<ImportedWorkspace> {
  if (files.length === 0) throw new WorkspaceImportError('INVALID_FILES', 'Choose one HTML file with optional CSS, or one Curbcut workspace JSON file.')

  const jsonFiles = files.filter((file) => extension(file) === '.json')
  if (jsonFiles.length) {
    if (files.length !== 1 || jsonFiles.length !== 1) throw new WorkspaceImportError('INVALID_FILES', 'A workspace JSON file cannot be combined with HTML or CSS files.')
    const file = jsonFiles[0]
    if (file.size > MAX_WORKSPACE_BYTES) throw new WorkspaceImportError('SOURCE_TOO_LARGE', 'The workspace file is too large.')
    let value: unknown
    try {
      value = JSON.parse(await file.text())
    } catch {
      throw new WorkspaceImportError('INVALID_WORKSPACE', 'The workspace file is not valid JSON.')
    }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new WorkspaceImportError('INVALID_WORKSPACE', 'The workspace JSON must be an object.')
    const record = value as Record<string, unknown>
    if (record.version !== 1 || typeof record.html !== 'string' || typeof record.css !== 'string' ||
      Object.keys(record).some((key) => !['version', 'html', 'css'].includes(key))) {
      throw new WorkspaceImportError('INVALID_WORKSPACE', 'Expected a Curbcut v1 workspace containing only version, html, and css.')
    }
    validateSource(record.html, record.css)
    return { html: record.html, css: record.css, label: file.name }
  }

  const htmlFiles = files.filter((file) => ['.html', '.htm'].includes(extension(file)))
  const cssFiles = files.filter((file) => extension(file) === '.css')
  if (htmlFiles.length !== 1 || cssFiles.length > 1 || htmlFiles.length + cssFiles.length !== files.length) {
    throw new WorkspaceImportError('INVALID_FILES', 'Choose exactly one .html file and at most one .css file.')
  }
  if (htmlFiles[0].size > MAX_HTML_BYTES || (cssFiles[0]?.size ?? 0) > MAX_CSS_BYTES) {
    throw new WorkspaceImportError('SOURCE_TOO_LARGE', 'One or more selected files exceed the Curbcut source limits.')
  }
  const [html, css = ''] = await Promise.all([htmlFiles[0].text(), cssFiles[0]?.text()])
  validateSource(html, css)
  return { html, css, label: cssFiles.length ? `${htmlFiles[0].name} + ${cssFiles[0].name}` : htmlFiles[0].name }
}

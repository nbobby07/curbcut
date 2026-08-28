import { describe, expect, it } from 'vitest'
import { readWorkspaceFiles, WorkspaceImportError } from './workspaceImport'

const file = (name: string, contents: string, type = 'text/plain') => new File([contents], name, { type })

describe('workspace import', () => {
  it('reads one HTML file with optional CSS without changing either source', async () => {
    const html = '<!doctype html>\r\n<html><body>é</body></html>'
    const css = 'body { color: #123456; }\n'
    await expect(readWorkspaceFiles([file('page.HTML', html), file('site.css', css)])).resolves.toEqual({
      html,
      css,
      label: 'page.HTML + site.css',
    })
  })

  it('reads an exact exported v1 workspace', async () => {
    await expect(readWorkspaceFiles([file('workspace.json', JSON.stringify({ version: 1, html: '<main>Hi</main>', css: '' }))])).resolves.toEqual({
      html: '<main>Hi</main>',
      css: '',
      label: 'workspace.json',
    })
  })

  it.each([
    [[], 'INVALID_FILES'],
    [[file('one.html', '<main />'), file('two.html', '<main />')], 'INVALID_FILES'],
    [[file('workspace.json', '{}')], 'INVALID_WORKSPACE'],
    [[file('workspace.json', JSON.stringify({ version: 2, html: '<main />', css: '' }))], 'INVALID_WORKSPACE'],
    [[file('page.html', '<main data-curbcut-node="cc-1-0"></main>')], 'RESERVED_METADATA'],
  ] as const)('refuses invalid or reserved input', async (files, code) => {
    await expect(readWorkspaceFiles(files)).rejects.toMatchObject({ code } satisfies Partial<WorkspaceImportError>)
  })
})

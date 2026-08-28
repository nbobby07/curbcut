import { describe, expect, it } from 'vitest'
import { CHECKOUT_CSS, CHECKOUT_HTML } from './fixture'
import { createExportArtifact, workspaceStore } from './workspaceStore'
import { executeWorkspaceTool, WEBMCP_TOOL_DEFINITIONS, WEBMCP_TOOL_NAMES } from './webmcp'

const parse = async (promise: Promise<string>) => JSON.parse(await promise) as Record<string, unknown>

describe('M4 WebMCP contract', () => {
  it('exposes exactly ten stable, bounded, annotated schemas', () => {
    expect(WEBMCP_TOOL_DEFINITIONS.map(({ name }) => name)).toEqual(WEBMCP_TOOL_NAMES)
    expect(new Set(WEBMCP_TOOL_NAMES).size).toBe(10)
    for (const definition of WEBMCP_TOOL_DEFINITIONS) {
      expect(definition.name.length).toBeLessThanOrEqual(30)
      expect(definition.description.length).toBeLessThanOrEqual(500)
      expect(definition.inputSchema).toMatchObject({ type: 'object', additionalProperties: false })
      expect(definition.annotations).toEqual(expect.objectContaining({
        readOnlyHint: expect.any(Boolean),
        untrustedContentHint: expect.any(Boolean),
      }))
      const visit = (schema: unknown) => {
        if (!schema || typeof schema !== 'object' || Array.isArray(schema)) return
        const record = schema as Record<string, unknown>
        if (typeof record.description === 'string') expect(record.description.length).toBeLessThanOrEqual(150)
        if (record.properties && typeof record.properties === 'object') {
          for (const [name, child] of Object.entries(record.properties)) {
            expect(name.length).toBeLessThanOrEqual(30)
            visit(child)
          }
        }
      }
      visit(definition.inputSchema)
    }
    expect(Object.fromEntries(WEBMCP_TOOL_DEFINITIONS.map(({ name, annotations }) => [name, annotations]))).toEqual({
      get_workspace: { readOnlyHint: true, untrustedContentHint: false },
      scan_accessibility: { readOnlyHint: false, untrustedContentHint: false },
      list_issues: { readOnlyHint: true, untrustedContentHint: true },
      inspect_issue: { readOnlyHint: false, untrustedContentHint: true },
      preview_remediation: { readOnlyHint: false, untrustedContentHint: true },
      apply_remediation: { readOnlyHint: false, untrustedContentHint: false },
      reject_remediation: { readOnlyHint: false, untrustedContentHint: false },
      undo_remediation: { readOnlyHint: false, untrustedContentHint: false },
      get_change_summary: { readOnlyHint: true, untrustedContentHint: false },
      export_source: { readOnlyHint: false, untrustedContentHint: false },
    })
  })

  it('rejects missing, extra, wrong-enum, wrong-type, and irrelevant semantic inputs', async () => {
    const cases = [
      ['get_workspace', { extra: true }],
      ['scan_accessibility', { reason: 'rescan' }],
      ['list_issues', { limit: 11 }],
      ['inspect_issue', { issueId: 4 }],
      ['preview_remediation', { issueId: 'x', family: 'add_form_label', values: { labelText: '' } }],
      ['preview_remediation', { issueId: 'x', family: 'remove_positive_tabindex', values: { labelText: 'No' } }],
      ['preview_remediation', { issueId: 'x', family: 'set_image_alt', values: { altMode: 'meaningful' } }],
      ['apply_remediation', {}],
      ['reject_remediation', { proposalId: 'x', reason: 'because' }],
      ['undo_remediation', { force: true }],
      ['get_change_summary', { includeSource: true }],
      ['export_source', { format: 'zip' }],
    ] as const
    for (const [name, input] of cases) {
      const output = await parse(executeWorkspaceTool(name, input))
      expect(output.ok).toBe(false)
      expect(['INVALID_INPUT', 'INPUT_REQUIRED']).toContain((output.error as { code: string }).code)
      expect(JSON.stringify(output).length).toBeLessThanOrEqual(1_500)
    }
  })

  it('returns common state/next-actions, handles cancellation, and never leaks canonical source', async () => {
    workspaceStore.loadDemo()
    const workspace = await parse(executeWorkspaceTool('get_workspace', {}))
    expect(workspace).toMatchObject({ ok: true, state: { sourceRevision: expect.any(Number) }, allowedNextActions: expect.any(Array) })
    expect(JSON.stringify(workspace)).not.toContain('<!doctype')

    const controller = new AbortController()
    controller.abort()
    const cancelled = await parse(executeWorkspaceTool('scan_accessibility', { reason: 'manual' }, controller.signal))
    expect(cancelled).toMatchObject({ ok: false, error: { code: 'CANCELLED' } })
  })

  it('caps source-free activity at 100 events', async () => {
    for (let index = 0; index < 105; index += 1) await executeWorkspaceTool('get_workspace', {})
    const activity = workspaceStore.getSnapshot().activity
    expect(activity).toHaveLength(100)
    expect(JSON.stringify(activity)).not.toContain(CHECKOUT_HTML.slice(0, 40))
  })

  it('builds exact canonical export artifacts with hashes and no mapping metadata', async () => {
    for (const kind of ['html', 'css', 'workspace'] as const) {
      const artifact = await createExportArtifact(kind, CHECKOUT_HTML, CHECKOUT_CSS, 7)
      expect(artifact.metadata).toMatchObject({ kind, sourceRevision: 7, mappingMetadataPresent: false })
      expect(artifact.metadata.sha256).toMatch(/^[a-f0-9]{64}$/)
      expect(artifact.content).not.toContain('data-curbcut-node')
    }
    await expect(createExportArtifact('html', '<p data-curbcut-node="forged">x</p>', '', 1)).rejects.toThrow('mapping metadata')
  })
})

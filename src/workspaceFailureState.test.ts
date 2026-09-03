import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PreviewBridge } from './Preview'

vi.mock('./previewSecurity', async () => {
  const { createSourceMapping } = await import('./sourceMap')
  return {
    preparePreview(htmlSource: string, sourceRevision: number) {
      return {
        mapping: createSourceMapping(htmlSource, sourceRevision),
        html: htmlSource,
        documentMeta: {},
      }
    },
  }
})

afterEach(() => {
  vi.resetModules()
})

describe('workspace failure state', () => {
  it('removes prior issue results when a rescan fails', async () => {
    const { workspaceStore } = await import('./workspaceStore')
    let rejectScan = false
    const bridge: PreviewBridge = {
      render: vi.fn(async () => {}),
      scan: vi.fn(async () => {
        if (rejectScan) throw new Error('axe scan failed')
        const button = workspaceStore.getSnapshot().mapping!.nodes.find(({ tagName }) => tagName === 'button')!
        return {
          violations: [{
            id: 'tabindex',
            help: 'Elements should not have tabindex greater than zero',
            helpUrl: 'https://dequeuniversity.com/rules/axe/tabindex',
            tags: ['wcag2a'],
            nodes: [{ impact: 'serious' as const, target: ['button'], html: '<button tabindex="2">', nodeId: button.nodeId }],
          }],
          incomplete: [],
          coverage: { truncated: false, totalRuleCount: 1, totalNodeCount: 1, returnedRuleCount: 1, returnedNodeCount: 1, maxRules: 40, maxNodes: 100 },
        }
      }),
      highlight: vi.fn(async () => {}),
      clearHighlight: vi.fn(async () => {}),
    }

    workspaceStore.attachPreview(bridge)
    await vi.waitFor(() => expect(workspaceStore.getSnapshot().scanStatus).toBe('CURRENT'))
    const issue = workspaceStore.getSnapshot().issues[0]
    expect((await workspaceStore.inspectIssue(issue.issueId)).ok).toBe(true)

    rejectScan = true
    expect(await workspaceStore.scan('manual')).toMatchObject({ ok: false, error: { code: 'INTERNAL_ERROR' } })
    expect(workspaceStore.getSnapshot()).toMatchObject({
      scanStatus: 'ERROR',
      scan: null,
      issues: [],
      selectedIssueId: null,
      highlightedNodeId: null,
      error: 'axe scan failed',
    })
    expect(workspaceStore.listIssues({})).toMatchObject({ ok: false, error: { code: 'SCAN_REQUIRED' } })
    workspaceStore.attachPreview(null)
  })

  it('claims selection and highlight only after the preview bridge confirms them', async () => {
    const { workspaceStore } = await import('./workspaceStore')
    const highlight = vi.fn(async () => { throw new Error('highlight failed') })
    const clearHighlight = vi.fn(async () => { throw new Error('clear failed') })
    const bridge: PreviewBridge = {
      render: vi.fn(async () => {}),
      scan: vi.fn(async () => {
        const input = workspaceStore.getSnapshot().mapping!.nodes.find(({ tagName }) => tagName === 'input')!
        return {
          violations: [{
            id: 'label',
            help: 'Form elements must have labels',
            helpUrl: 'https://dequeuniversity.com/rules/axe/label',
            tags: ['wcag2a'],
            nodes: [
              { impact: 'critical' as const, target: ['#email'], html: '<input id="email">', nodeId: input.nodeId },
              { impact: 'critical' as const, target: ['input:last-child'], html: '<input>' },
            ],
          }],
          incomplete: [],
          coverage: { truncated: false, totalRuleCount: 1, totalNodeCount: 2, returnedRuleCount: 1, returnedNodeCount: 2, maxRules: 40, maxNodes: 100 },
        }
      }),
      highlight,
      clearHighlight,
    }

    workspaceStore.attachPreview(bridge)
    await vi.waitFor(() => expect(workspaceStore.getSnapshot().scanStatus).toBe('CURRENT'))
    const [mapped, unmapped] = workspaceStore.getSnapshot().issues

    expect(await workspaceStore.inspectIssue(mapped.issueId)).toMatchObject({ ok: false, error: { code: 'PREVIEW_NOT_READY' } })
    expect(workspaceStore.getSnapshot()).toMatchObject({ selectedIssueId: null, highlightedNodeId: null, error: 'highlight failed' })

    expect(await workspaceStore.inspectIssue(unmapped.issueId)).toMatchObject({ ok: false, error: { code: 'PREVIEW_NOT_READY' } })
    expect(workspaceStore.getSnapshot()).toMatchObject({ selectedIssueId: null, highlightedNodeId: null, error: 'clear failed' })
    workspaceStore.attachPreview(null)
  })
})

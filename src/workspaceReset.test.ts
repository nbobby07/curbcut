import { afterEach, describe, expect, it, vi } from 'vitest'
import type { PreviewBridge } from './Preview'
import { CHECKOUT_CSS, CHECKOUT_HTML } from './fixture'

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

const STORAGE_KEY = 'curbcut.workspace.v1'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('demo reset', () => {
  it('clears repaired persistence and stale derived state before rebuilding the pristine demo', async () => {
    const saved = new Map([[STORAGE_KEY, JSON.stringify({ version: 1, html: CHECKOUT_HTML, css: CHECKOUT_CSS })]])
    const storage = {
      getItem: vi.fn((key: string) => saved.get(key) ?? null),
      setItem: vi.fn((key: string, value: string) => { saved.set(key, value) }),
      removeItem: vi.fn((key: string) => { saved.delete(key) }),
    } as unknown as Storage
    vi.stubGlobal('localStorage', storage)
    vi.resetModules()

    const { workspaceStore } = await import('./workspaceStore')
    const bridge: PreviewBridge = {
      render: vi.fn(async () => {}),
      scan: vi.fn(async () => {
        const button = workspaceStore.getSnapshot().mapping!.nodes.find(({ tagName }) => tagName === 'button')!
        return {
          violations: [{
            id: 'tabindex',
            help: 'Elements should not have tabindex greater than zero',
            helpUrl: 'https://dequeuniversity.com/rules/axe/tabindex',
            tags: ['wcag2a'],
            nodes: [{ impact: 'serious' as const, target: ['button.continue'], html: '<button tabindex="2">', nodeId: button.nodeId }],
          }],
          incomplete: [],
          coverage: { truncated: false, totalRuleCount: 1, totalNodeCount: 1, returnedRuleCount: 1, returnedNodeCount: 1, maxRules: 40, maxNodes: 100 },
        }
      }),
      highlight: vi.fn(async () => {}),
      clearHighlight: vi.fn(async () => {}),
    }
    workspaceStore.setWebMcpRegistration(['scan_accessibility'])
    workspaceStore.attachPreview(bridge)
    await vi.waitFor(() => expect(workspaceStore.getSnapshot().scanStatus).toBe('CURRENT'))

    const issue = workspaceStore.getSnapshot().issues[0]
    expect((await workspaceStore.inspectIssue(issue.issueId)).ok).toBe(true)
    const proposal = await workspaceStore.previewRepair(issue.issueId, 'positive-tabindex', {})
    expect(proposal.ok).toBe(true)
    if (!proposal.ok) return
    workspaceStore.setProposalPreviewStatus(proposal.data.proposalId, 'READY')
    expect((await workspaceStore.applyProposal(proposal.data.proposalId)).ok).toBe(true)
    expect(workspaceStore.getSnapshot().htmlSource).not.toContain('tabindex="2"')
    await vi.waitFor(() => expect(JSON.parse(saved.get(STORAGE_KEY)!).html).not.toContain('tabindex="2"'))

    expect((await workspaceStore.scan('after_change')).ok).toBe(true)
    expect((await workspaceStore.inspectIssue(workspaceStore.getSnapshot().issues[0].issueId)).ok).toBe(true)
    workspaceStore.recordActivity({
      actor: 'agent',
      action: 'inspect_issue',
      inputSummary: 'stale issue',
      resultSummary: 'success',
    })
    expect(workspaceStore.getSnapshot()).toMatchObject({
      scanStatus: 'CURRENT',
      proposal: { status: 'APPLIED' },
      history: [{ family: 'positive-tabindex' }],
      lastInvocation: { tool: 'inspect_issue' },
    })
    expect(workspaceStore.getSnapshot().selectedIssueId).not.toBeNull()

    workspaceStore.loadDemo()

    expect(storage.removeItem).toHaveBeenCalledWith(STORAGE_KEY)
    expect(saved.get(STORAGE_KEY)).toBeUndefined()
    expect(workspaceStore.getSnapshot()).toMatchObject({
      htmlSource: CHECKOUT_HTML,
      cssSource: CHECKOUT_CSS,
      scanStatus: 'NEVER',
      mapping: null,
      scan: null,
      issues: [],
      selectedIssueId: null,
      highlightedNodeId: null,
      lastInvocation: null,
      activity: [],
      proposal: null,
      proposalPreview: { proposalId: null, status: 'IDLE', error: null },
      previewMode: 'WORKING',
      mutationStatus: 'IDLE',
      history: [],
      verificationNotice: null,
      registeredTools: ['scan_accessibility'],
    })

    await vi.waitFor(() => expect(workspaceStore.getSnapshot().scanStatus).toBe('CURRENT'))
    await vi.waitFor(() => expect(JSON.parse(saved.get(STORAGE_KEY)!)).toEqual({ version: 1, html: CHECKOUT_HTML, css: CHECKOUT_CSS }))
    expect(workspaceStore.getSnapshot().activity).toHaveLength(1)
    expect(workspaceStore.getSnapshot().activity[0]).toMatchObject({ actor: 'system', action: 'scan_accessibility', inputSummary: 'initial' })

    workspaceStore.attachPreview(null)
    vi.resetModules()
    const { workspaceStore: reloadedStore } = await import('./workspaceStore')
    expect(reloadedStore.getSnapshot()).toMatchObject({ htmlSource: CHECKOUT_HTML, cssSource: CHECKOUT_CSS })
  })
})

import { describe, expect, it, vi } from 'vitest'
import type { PreviewBridge } from './Preview'
import { MAX_AXE_NODES, MAX_AXE_RULES, MAX_HTML_BYTES } from './previewProtocol'

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

describe('automatic initial scan', () => {
  it('waits for the first secure render, scans once, and leaves explicit rescans available', async () => {
    const { workspaceStore } = await import('./workspaceStore')
    let finishRender!: () => void
    const render = vi.fn(() => new Promise<void>((resolve) => { finishRender = resolve }))
    const scan = vi.fn(async () => ({
      violations: [],
      incomplete: [],
      coverage: { truncated: false, totalRuleCount: 0, totalNodeCount: 0, returnedRuleCount: 0, returnedNodeCount: 0, maxRules: 40, maxNodes: 100 },
    }))
    const bridge: PreviewBridge = {
      render,
      scan,
      highlight: vi.fn(async () => {}),
      clearHighlight: vi.fn(async () => {}),
    }

    workspaceStore.attachPreview(bridge)
    workspaceStore.attachPreview(bridge)
    expect(render).toHaveBeenCalledTimes(1)
    expect(scan).not.toHaveBeenCalled()

    finishRender()
    await vi.waitFor(() => expect(workspaceStore.getSnapshot().scanStatus).toBe('CURRENT'))
    expect(scan).toHaveBeenCalledTimes(1)
    expect(workspaceStore.getSnapshot().scan?.reason).toBe('initial')
    expect(workspaceStore.getSnapshot().activity).toHaveLength(1)
    expect(workspaceStore.getSnapshot().activity[0]).toMatchObject({
      actor: 'system',
      action: 'scan_accessibility',
      inputSummary: 'initial',
      resultSummary: '0 rules · 0 nodes · 0 critical · 0 serious',
    })
    expect(workspaceStore.getSnapshot().lastInvocation).toBeNull()

    workspaceStore.attachPreview(bridge)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(scan).toHaveBeenCalledTimes(1)

    expect(await workspaceStore.scan('manual')).toMatchObject({ ok: true, data: { reason: 'manual' } })
    expect(scan).toHaveBeenCalledTimes(2)
    workspaceStore.attachPreview(null)
  })

  it('rejects oversized edits and replaces an imported workspace in one revision', async () => {
    const { workspaceStore } = await import('./workspaceStore')
    const before = workspaceStore.getSnapshot()
    expect(workspaceStore.setHtmlSource('x'.repeat(MAX_HTML_BYTES + 1))).toMatchObject({
      ok: false,
      error: { code: 'SOURCE_TOO_LARGE' },
    })
    expect(workspaceStore.getSnapshot().htmlSource).toBe(before.htmlSource)

    const html = '<!doctype html>\r\n<html lang="en"><body><main>Imported é</main></body></html>'
    const css = 'main { color: #123456; }\n'
    expect(workspaceStore.replaceWorkspace(html, css, 'example.html + example.css')).toMatchObject({
      ok: true,
      data: { sourceRevision: before.sourceRevision + 1 },
    })
    expect(workspaceStore.getSnapshot()).toMatchObject({
      htmlSource: html,
      cssSource: css,
      sourceRevision: before.sourceRevision + 1,
      scan: null,
      issues: [],
      proposal: null,
      history: [],
      mutationStatus: 'IDLE',
    })
    expect(workspaceStore.getSnapshot().activity.at(-1)).toMatchObject({
      actor: 'human',
      action: 'workspace_imported',
      inputSummary: 'example.html + example.css',
    })
  })

  it('never treats capped apply or undo rescans as proof of absence', async () => {
    const { workspaceStore } = await import('./workspaceStore')
    workspaceStore.attachPreview(null)
    workspaceStore.replaceWorkspace(
      '<!doctype html><html lang="en"><body><main><h1>Test</h1><button tabindex="2">Pay</button></main></body></html>',
      '',
      'capped-verification.html',
    )
    let scanCount = 0
    const bridge: PreviewBridge = {
      render: vi.fn(async () => {}),
      scan: vi.fn(async () => {
        scanCount += 1
        if (scanCount === 1) {
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
            coverage: {
              truncated: true,
              totalRuleCount: 2,
              totalNodeCount: 101,
              returnedRuleCount: 1,
              returnedNodeCount: 1,
              maxRules: MAX_AXE_RULES,
              maxNodes: MAX_AXE_NODES,
            },
          }
        }
        return {
          violations: [],
          incomplete: [],
          coverage: {
            truncated: true,
            totalRuleCount: 1,
            totalNodeCount: 101,
            returnedRuleCount: 0,
            returnedNodeCount: 0,
            maxRules: MAX_AXE_RULES,
            maxNodes: MAX_AXE_NODES,
          },
        }
      }),
      highlight: vi.fn(async () => {}),
      clearHighlight: vi.fn(async () => {}),
    }
    workspaceStore.attachPreview(bridge)
    await vi.waitFor(() => expect(workspaceStore.getSnapshot().previewStatus).toBe('READY'))
    expect((await workspaceStore.scan('initial')).ok).toBe(true)

    const issue = workspaceStore.getSnapshot().issues[0]
    const proposal = await workspaceStore.previewRepair(issue.issueId, 'positive-tabindex', {})
    expect(proposal.ok).toBe(true)
    if (!proposal.ok) return
    workspaceStore.setProposalPreviewStatus(proposal.data.proposalId, 'READY')
    expect((await workspaceStore.applyProposal(proposal.data.proposalId)).ok).toBe(true)
    expect((await workspaceStore.scan('after_change')).ok).toBe(true)
    expect(workspaceStore.getSnapshot().verificationNotice?.outcome).toBe('NOT_VERIFIED')

    expect((await workspaceStore.undoLatest()).ok).toBe(true)
    expect((await workspaceStore.scan('after_change')).ok).toBe(true)
    expect(workspaceStore.getSnapshot().verificationNotice).toMatchObject({
      kind: 'UNDO',
      outcome: 'INCONCLUSIVE',
      message: expect.stringContaining('capped axe rescan could not confirm'),
    })
    workspaceStore.attachPreview(null)
  })
})

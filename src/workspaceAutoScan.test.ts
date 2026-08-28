import { describe, expect, it, vi } from 'vitest'
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

describe('automatic initial scan', () => {
  it('waits for the first secure render, scans once, and leaves explicit rescans available', async () => {
    const { workspaceStore } = await import('./workspaceStore')
    let finishRender!: () => void
    const render = vi.fn(() => new Promise<void>((resolve) => { finishRender = resolve }))
    const scan = vi.fn(async () => ({ violations: [], incomplete: [] }))
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
    expect(workspaceStore.getSnapshot().activity).toEqual([])
    expect(workspaceStore.getSnapshot().lastInvocation).toBeNull()

    workspaceStore.attachPreview(bridge)
    await new Promise((resolve) => setTimeout(resolve, 10))
    expect(scan).toHaveBeenCalledTimes(1)

    expect(await workspaceStore.scan('manual')).toMatchObject({ ok: true, data: { reason: 'manual' } })
    expect(scan).toHaveBeenCalledTimes(2)
    workspaceStore.attachPreview(null)
  })
})

import { describe, expect, it } from 'vitest'
import {
  buildTrustedSrcdoc,
  isFrameMessage,
  MAX_AXE_NODES,
  MAX_AXE_RULES,
} from './previewProtocol'

describe('trusted preview protocol', () => {
  it('builds a script-only opaque-frame shell without user source slots', () => {
    const shell = buildTrustedSrcdoc('window.axe={run(){}}', 'nonce123', 'channel123')

    expect(shell).toContain("default-src 'none'")
    expect(shell).toContain("script-src 'nonce-nonce123'")
    expect(shell).toContain("connect-src 'none'")
    expect(shell).toContain("form-action 'none'")
    expect(shell).toContain('id="curbcut-preview-root"')
    expect(shell).toContain('id="curbcut-user-style"')
    expect(shell).toContain('rules: { tabindex: { enabled: true } }')
    expect(shell).toContain(`const MAX_AXE_RULES = ${MAX_AXE_RULES}`)
    expect(shell).toContain(`const MAX_AXE_NODES = ${MAX_AXE_NODES}`)
    expect(shell).not.toContain('allow-same-origin')
    expect(shell).not.toContain('requestAnimationFrame')
    expect(shell).not.toContain('__CURBCUT_CHANNEL__')
  })

  it('accepts only bounded, closed-union frame messages', () => {
    const rendered = {
      channel: 'channel123',
      direction: 'frame-to-parent',
      type: 'RENDERED',
      requestId: 'request-1',
      sourceRevision: 2,
      payload: {},
    }

    expect(isFrameMessage(rendered)).toBe(true)
    expect(isFrameMessage({ ...rendered, direction: 'parent-to-frame' })).toBe(false)
    expect(isFrameMessage({ ...rendered, type: 'EXECUTE' })).toBe(false)
    expect(isFrameMessage({ ...rendered, sourceRevision: 1.5 })).toBe(false)
    expect(isFrameMessage({ ...rendered, payload: 'not-an-object' })).toBe(false)
    expect(isFrameMessage({ ...rendered, requestId: 'x'.repeat(101) })).toBe(false)
  })

  it('requires isolation evidence on READY', () => {
    const ready = {
      channel: 'channel123',
      direction: 'frame-to-parent',
      type: 'READY',
      requestId: 'boot',
      sourceRevision: -1,
      payload: { reportedOrigin: 'null', parentAccessBlocked: true },
    }
    expect(isFrameMessage(ready)).toBe(true)
    expect(isFrameMessage({ ...ready, payload: {} })).toBe(false)
  })

  it('validates serialized axe payload structure', () => {
    const scanResult = {
      channel: 'channel123',
      direction: 'frame-to-parent',
      type: 'SCAN_RESULT',
      requestId: 'request-2',
      sourceRevision: 3,
      payload: {
        violations: [{
          id: 'label',
          help: 'Form elements must have labels',
          helpUrl: 'https://example.test/label',
          tags: ['wcag2a'],
          nodes: [{ impact: 'critical', target: ['#email'], html: '<input>', nodeId: 'cc-3-2' }],
        }],
        incomplete: [],
        coverage: {
          truncated: false,
          totalRuleCount: 1,
          totalNodeCount: 1,
          returnedRuleCount: 1,
          returnedNodeCount: 1,
          maxRules: MAX_AXE_RULES,
          maxNodes: MAX_AXE_NODES,
        },
      },
    }

    expect(isFrameMessage(scanResult)).toBe(true)
    expect(isFrameMessage({
      ...scanResult,
      payload: { ...scanResult.payload, violations: [{ ...scanResult.payload.violations[0], nodes: [{ impact: 'catastrophic', target: [], html: '' }] }] },
    })).toBe(false)
  })

  it('enforces one scan-wide axe rule and node budget', () => {
    const node = { impact: 'critical', target: ['input'], html: '<input>' }
    const rule = (id: string, nodes = [node]) => ({ id, help: id, helpUrl: 'https://example.test', tags: [], nodes })
    const message = (violations: unknown[], incomplete: unknown[]) => {
      const rules = [...violations, ...incomplete] as { nodes?: unknown[] }[]
      const returnedNodeCount = rules.reduce((count, item) => count + (Array.isArray(item.nodes) ? item.nodes.length : 0), 0)
      return {
        channel: 'channel123',
        direction: 'frame-to-parent',
        type: 'SCAN_RESULT',
        requestId: 'request-budget',
        sourceRevision: 1,
        payload: {
          violations,
          incomplete,
          coverage: {
            truncated: false,
            totalRuleCount: rules.length,
            totalNodeCount: returnedNodeCount,
            returnedRuleCount: rules.length,
            returnedNodeCount,
            maxRules: MAX_AXE_RULES,
            maxNodes: MAX_AXE_NODES,
          },
        },
      }
    }

    expect(isFrameMessage(message(
      [rule('label', Array.from({ length: 60 }, () => node))],
      [rule('color-contrast', Array.from({ length: 40 }, () => node))],
    ))).toBe(true)
    expect(isFrameMessage(message(
      [rule('label', Array.from({ length: 60 }, () => node))],
      [rule('color-contrast', Array.from({ length: 41 }, () => node))],
    ))).toBe(false)
    expect(isFrameMessage(message(
      Array.from({ length: MAX_AXE_RULES }, (_, index) => rule(`rule-${index}`)),
      [rule('one-too-many')],
    ))).toBe(false)
    const truncated = message([rule('label', Array.from({ length: 100 }, () => node))], [])
    expect(isFrameMessage({
      ...truncated,
      payload: {
        ...truncated.payload,
        coverage: { ...truncated.payload.coverage, truncated: true, totalNodeCount: 130 },
      },
    })).toBe(true)
  })
})

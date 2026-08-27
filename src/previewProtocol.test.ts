import { describe, expect, it } from 'vitest'
import { buildTrustedSrcdoc, isFrameMessage } from './previewProtocol'

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
    expect(shell).not.toContain('allow-same-origin')
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
      },
    }

    expect(isFrameMessage(scanResult)).toBe(true)
    expect(isFrameMessage({
      ...scanResult,
      payload: { ...scanResult.payload, violations: [{ ...scanResult.payload.violations[0], nodes: [{ impact: 'catastrophic', target: [], html: '' }] }] },
    })).toBe(false)
  })
})

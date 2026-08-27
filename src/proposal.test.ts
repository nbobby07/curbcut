import { describe, expect, it } from 'vitest'
import type { AccessibilityIssue } from './axeAdapter'
import {
  applyApprovedProposal,
  approveProposal,
  createProposal,
  rejectProposal,
  undoLatestChange,
} from './proposal'
import { createSourceMapping } from './sourceMap'

function labelCase(source = '<form>\r\n  <input id="email">\r\n</form>') {
  const mapping = createSourceMapping(source, 5)
  const node = mapping.nodes.find(({ tagName }) => tagName === 'input')!
  const issue: AccessibilityIssue = {
    issueId: 'scan:label:input', scanId: 'scan', sourceRevision: 5, resultKind: 'violation',
    ruleId: 'label', impact: 'critical', help: 'label', helpUrl: 'https://example.test', tags: [],
    target: ['#email'], htmlSnippet: '<input id="email">', nodeId: node.nodeId, sourceNode: node,
    classification: 'CONTEXTUAL', classificationReason: 'test',
  }
  return { source, mapping, issue }
}

describe('proposal lifecycle', () => {
  it('creates a proposal without mutating canonical HTML/CSS', async () => {
    const { source, mapping, issue } = labelCase()
    const css = '/* exact é */\r\ninput { color: black; }'
    const result = await createProposal(source, css, mapping, issue, 'missing-form-label', { labelText: 'Email' })

    expect(result.ok).toBe(true)
    expect(source).toBe(mapping.canonicalSource)
    expect(mapping.canonicalSource).not.toContain('<label')
    expect(result.ok && result.data).toMatchObject({ status: 'PROPOSED', approval: null, proposedCss: css })
  })

  it('refuses Apply until the exact visible proposal and diff are approved', async () => {
    const { source, mapping, issue } = labelCase()
    const created = await createProposal(source, '', mapping, issue, 'missing-form-label', { labelText: 'Email' })
    if (!created.ok) throw new Error(created.error.message)

    await expect(applyApprovedProposal(created.data, { html: source, css: '', sourceRevision: 5 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'APPROVAL_REQUIRED' } })
    expect(approveProposal(created.data, 'wrong-id', created.data.diffHash)).toMatchObject({
      ok: false, error: { code: 'PROPOSAL_MISMATCH' },
    })
    expect(approveProposal(created.data, created.data.proposalId, 'wrong-hash')).toMatchObject({
      ok: false, error: { code: 'DIFF_MISMATCH' },
    })
  })

  it('applies an approved exact patch and creates an exact undo snapshot', async () => {
    const { source, mapping, issue } = labelCase()
    const css = 'input { color: black; }\n'
    const created = await createProposal(source, css, mapping, issue, 'missing-form-label', { labelText: 'Email' })
    if (!created.ok) throw new Error(created.error.message)
    const approved = approveProposal(created.data, created.data.proposalId, created.data.diffHash)
    if (!approved.ok) throw new Error(approved.error.message)

    const applied = await applyApprovedProposal(approved.data, { html: source, css, sourceRevision: 5 })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.data.proposal.status).toBe('APPLIED')
    expect(applied.data.change.afterHtml).toContain('<label for="email">Email</label>\r\n')
    expect(applied.data.change.afterCss).toBe(css)
    expect(applied.data.change.verification).toBe('PENDING')

    const undone = await undoLatestChange(applied.data.change, {
      html: applied.data.change.afterHtml,
      css: applied.data.change.afterCss,
    })
    expect(undone).toMatchObject({ ok: true, data: { html: source, css } })
    expect(undone.ok && undone.data.html).toBe(source)
  })

  it('rejects stale proposals and stale undo after manual edits', async () => {
    const { source, mapping, issue } = labelCase()
    const created = await createProposal(source, '', mapping, issue, 'missing-form-label', { labelText: 'Email' })
    if (!created.ok) throw new Error(created.error.message)
    const approved = approveProposal(created.data, created.data.proposalId, created.data.diffHash)
    if (!approved.ok) throw new Error(approved.error.message)
    await expect(applyApprovedProposal(approved.data, { html: source, css: '', sourceRevision: 6 }))
      .resolves.toMatchObject({ ok: false, error: { code: 'STALE_PROPOSAL' } })

    const applied = await applyApprovedProposal(approved.data, { html: source, css: '', sourceRevision: 5 })
    if (!applied.ok) throw new Error(applied.error.message)
    await expect(undoLatestChange(applied.data.change, {
      html: `${applied.data.change.afterHtml}\n<!-- manual -->`, css: '',
    })).resolves.toMatchObject({ ok: false, error: { code: 'STALE_UNDO' } })
  })

  it('rejects without source mutation and regenerates semantic changes unapproved', async () => {
    const { source, mapping, issue } = labelCase()
    const first = await createProposal(source, '', mapping, issue, 'missing-form-label', { labelText: 'Email' })
    const second = await createProposal(source, '', mapping, issue, 'missing-form-label', { labelText: 'Work email' })
    if (!first.ok || !second.ok) throw new Error('proposal failed')
    const approved = approveProposal(first.data, first.data.proposalId, first.data.diffHash)
    if (!approved.ok) throw new Error(approved.error.message)
    expect(rejectProposal(approved.data)).toMatchObject({ ok: true, data: { status: 'REJECTED', approval: null } })
    expect(second.data).toMatchObject({ status: 'PROPOSED', approval: null })
    expect(second.data.proposalId).not.toBe(first.data.proposalId)
    expect(second.data.diffHash).not.toBe(first.data.diffHash)
    expect(source).not.toContain('<label')
  })
})

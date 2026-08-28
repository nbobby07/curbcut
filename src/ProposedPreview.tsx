import { useEffect, useRef, useState } from 'react'
import { Preview, type PreviewBridge } from './Preview'
import type { RemediationProposal } from './proposal'
import { preparePreview } from './previewSecurity'
import { useWorkspaceState, workspaceStore } from './workspaceStore'

export function ProposedPreview({ proposal }: { proposal: RemediationProposal }) {
  const bridge = useRef<PreviewBridge>(null)
  const [attempt, setAttempt] = useState(0)
  const { proposalPreview } = useWorkspaceState()

  useEffect(() => {
    let current = true
    const controller = new AbortController()
    const preview = bridge.current
    workspaceStore.setProposalPreviewStatus(proposal.proposalId, 'RENDERING')
    if (!preview) {
      workspaceStore.setProposalPreviewStatus(proposal.proposalId, 'ERROR', 'The proposed preview frame is unavailable.')
      return
    }
    try {
      const prepared = preparePreview(proposal.proposedHtml, proposal.sourceRevision + 1)
      const target = proposal.validationTarget.id
        ? prepared.mapping.nodes.find((node) =>
            node.tagName === proposal.validationTarget.tagName &&
            node.attributes.id === proposal.validationTarget.id)
        : proposal.validationTarget.ordinal === undefined
          ? undefined
          : prepared.mapping.nodes[proposal.validationTarget.ordinal]
      void preview.render(
        proposal.sourceRevision + 1,
        prepared.html,
        proposal.proposedCss,
        prepared.documentMeta,
        controller.signal,
      ).then(
        async () => {
          if (target) await preview.highlight(proposal.sourceRevision + 1, target.nodeId, controller.signal)
          if (current) workspaceStore.setProposalPreviewStatus(proposal.proposalId, 'READY')
        },
        (error: unknown) => current && workspaceStore.setProposalPreviewStatus(
          proposal.proposalId,
          'ERROR',
          error instanceof Error ? error.message : 'The proposed preview could not be rendered.',
        ),
      )
    } catch (error) {
      workspaceStore.setProposalPreviewStatus(
        proposal.proposalId,
        'ERROR',
        error instanceof Error ? error.message : 'The proposed preview could not be prepared.',
      )
    }
    return () => {
      current = false
      controller.abort()
    }
  }, [attempt, proposal.proposalId, proposal.proposedCss, proposal.proposedHtml, proposal.sourceRevision])

  const status = proposalPreview.proposalId === proposal.proposalId ? proposalPreview.status : 'IDLE'

  return (
    <div className="preview-stage" data-testid="proposed-preview-stage">
      <p className="proposal-label" role="status">
        Proposed preview · <strong>Not applied</strong> · {status}
        {status === 'READY' && ' · Mapped target highlighted'}
      </p>
      {status === 'ERROR' && (
        <div className="proposal-preview-error" role="alert">
          <p>{proposalPreview.error}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry proposed preview</button>
        </div>
      )}
      <Preview ref={bridge} title="Proposed source preview — not applied" />
    </div>
  )
}

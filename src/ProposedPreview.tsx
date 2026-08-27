import { useEffect, useRef, useState } from 'react'
import { Preview, type PreviewBridge } from './Preview'
import type { RemediationProposal } from './proposal'
import { preparePreview } from './previewSecurity'

export function ProposedPreview({ proposal }: { proposal: RemediationProposal }) {
  const bridge = useRef<PreviewBridge>(null)
  const [status, setStatus] = useState<'RENDERING' | 'READY' | 'ERROR'>('RENDERING')

  useEffect(() => {
    let current = true
    const controller = new AbortController()
    const preview = bridge.current
    if (!preview) return
    setStatus('RENDERING')
    try {
      const prepared = preparePreview(proposal.proposedHtml, proposal.sourceRevision + 1)
      void preview.render(
        proposal.sourceRevision + 1,
        prepared.html,
        proposal.proposedCss,
        prepared.documentMeta,
        controller.signal,
      ).then(() => current && setStatus('READY'), () => current && setStatus('ERROR'))
    } catch {
      setStatus('ERROR')
    }
    return () => {
      current = false
      controller.abort()
    }
  }, [proposal])

  return (
    <div className="preview-stage" data-testid="proposed-preview-stage">
      <p className="proposal-label">Proposed preview · <strong>Not applied</strong> · {status}</p>
      <Preview ref={bridge} title="Proposed source preview — not applied" />
    </div>
  )
}

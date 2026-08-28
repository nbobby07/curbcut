import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AccessibilityIssue } from './axeAdapter'
import { Preview, type PreviewBridge } from './Preview'
import { ProposedPreview } from './ProposedPreview'
import { requiresHumanApproval, type RemediationProposal } from './proposal'
import type { HumanValues, RepairFamily } from './repairs'
import { useWorkspaceWebMcpTools } from './webmcp'
import { useWorkspaceState, workspaceStore } from './workspaceStore'

type SourceTab = 'html' | 'css'

export function App() {
  const state = useWorkspaceState()
  const [sourceTab, setSourceTab] = useState<SourceTab>('html')
  const [exportKind, setExportKind] = useState<'html' | 'css' | 'workspace'>('html')
  const previewRef = useRef<PreviewBridge>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const scanButtonRef = useRef<HTMLButtonElement>(null)
  const selectedIssue = state.issues.find(({ issueId }) => issueId === state.selectedIssueId)
  const pendingProposal = state.proposal && ['PROPOSED', 'APPROVED'].includes(state.proposal.status)
    ? state.proposal
    : null
  const latestChange = state.history.at(-1)
  useWorkspaceWebMcpTools()

  useEffect(() => {
    workspaceStore.attachPreview(previewRef.current)
    return () => workspaceStore.attachPreview(null)
  }, [])

  useEffect(() => {
    if (!selectedIssue?.sourceNode) return
    if (sourceTab !== 'html') {
      setSourceTab('html')
      return
    }
    const { startOffset, endOffset } = selectedIssue.sourceNode.sourceRange
    requestAnimationFrame(() => {
      editorRef.current?.focus()
      editorRef.current?.setSelectionRange(startOffset, endOffset)
    })
  }, [selectedIssue, sourceTab])

  useEffect(() => {
    if (state.verificationNotice?.outcome === 'PENDING') scanButtonRef.current?.focus()
  }, [state.verificationNotice])

  function moveSourceTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    setSourceTab(sourceTab === 'html' ? 'css' : 'html')
    const sibling = sourceTab === 'html' ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling
    if (sibling instanceof HTMLButtonElement) sibling.focus()
  }

  function movePreviewTab(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    workspaceStore.setPreviewMode(state.previewMode === 'WORKING' ? 'PROPOSED' : 'WORKING')
    const sibling = state.previewMode === 'WORKING' ? event.currentTarget.nextElementSibling : event.currentTarget.previousElementSibling
    if (sibling instanceof HTMLButtonElement) sibling.focus()
  }

  return (
    <main className="app-shell">
      <header className="command-bar">
        <div>
          <h1>Curbcut</h1>
          <p>Local HTML/CSS accessibility workspace</p>
        </div>
        <div className="command-actions" aria-label="Workspace commands">
          <div className="command-status" aria-label="Workspace status">
            <span className="status-chip">Revision {state.sourceRevision}</span>
            <span className={`status-chip scan-${state.scanStatus.toLowerCase()}`}>Scan {state.scanStatus.toLowerCase()}</span>
          </div>
          <div className="command-group">
            <button type="button" onClick={() => workspaceStore.loadDemo()}>Reset demo</button>
          <button
            type="button"
            disabled={!latestChange || Boolean(latestChange.undoneAt)}
            onClick={() => void workspaceStore.undoLatest()}
          >
            Undo last repair
          </button>
          <button
            ref={scanButtonRef}
            type="button"
            className="primary-action"
            disabled={state.scanStatus === 'RUNNING' || state.previewStatus !== 'READY' || Boolean(pendingProposal)}
            onClick={() => void workspaceStore.scan(state.scan ? 'manual' : 'initial')}
          >
            {state.scanStatus === 'RUNNING' ? 'Scanning…' : state.scan ? 'Rescan with axe' : 'Run axe scan'}
          </button>
          </div>
          <div className="command-group export-group">
          <label className="export-control">Export
            <select value={exportKind} onChange={(event) => setExportKind(event.target.value as typeof exportKind)}>
              <option value="html">HTML</option>
              <option value="css">CSS</option>
              <option value="workspace">Workspace JSON</option>
            </select>
          </label>
          <button type="button" onClick={() => void workspaceStore.exportSource(exportKind)}>Download</button>
          </div>
        </div>
      </header>

      <section className="workspace" aria-label="Accessibility workspace">
        <section className="pane source-pane" aria-labelledby="source-heading">
          <div className="pane-heading">
            <div>
              <h2 id="source-heading">Working source</h2>
              {selectedIssue?.sourceNode && (
                <p data-testid="source-location">
                  Line {selectedIssue.sourceNode.sourceRange.startLine}, column {selectedIssue.sourceNode.sourceRange.startColumn}
                </p>
              )}
            </div>
            <div className="tabs" role="tablist" aria-label="Source file">
              <button id="html-tab" role="tab" aria-controls="source-editor" aria-selected={sourceTab === 'html'} tabIndex={sourceTab === 'html' ? 0 : -1} onKeyDown={moveSourceTab} onClick={() => setSourceTab('html')}>HTML</button>
              <button id="css-tab" role="tab" aria-controls="source-editor" aria-selected={sourceTab === 'css'} tabIndex={sourceTab === 'css' ? 0 : -1} onKeyDown={moveSourceTab} onClick={() => setSourceTab('css')}>CSS</button>
            </div>
          </div>
          <textarea
            id="source-editor"
            ref={editorRef}
            aria-label={sourceTab === 'html' ? 'Editable HTML source' : 'Editable CSS source'}
            spellCheck={false}
            value={sourceTab === 'html' ? state.htmlSource : state.cssSource}
            onChange={(event) => sourceTab === 'html'
              ? workspaceStore.setHtmlSource(event.target.value)
              : workspaceStore.setCssSource(event.target.value)}
          />
        </section>

        <section className="pane preview-pane" aria-labelledby="preview-heading">
          <div className="pane-heading">
            <div>
              <h2 id="preview-heading">Rendered preview</h2>
              <p>Opaque sandbox · revision {state.sourceRevision}</p>
            </div>
            {pendingProposal ? (
              <div className="tabs" role="tablist" aria-label="Preview state">
                <button role="tab" aria-selected={state.previewMode === 'WORKING'} tabIndex={state.previewMode === 'WORKING' ? 0 : -1} onKeyDown={movePreviewTab} onClick={() => workspaceStore.setPreviewMode('WORKING')}>Working</button>
                <button role="tab" aria-selected={state.previewMode === 'PROPOSED'} tabIndex={state.previewMode === 'PROPOSED' ? 0 : -1} onKeyDown={movePreviewTab} onClick={() => workspaceStore.setPreviewMode('PROPOSED')}>Proposed</button>
              </div>
            ) : <span className={`state-dot state-${state.previewStatus.toLowerCase()}`}>{state.previewStatus}</span>}
          </div>
          <div className="preview-stage" hidden={state.previewMode !== 'WORKING'}>
            <Preview ref={previewRef} onIsolationEvidence={workspaceStore.setIsolationEvidence} />
          </div>
          {pendingProposal && state.previewMode === 'PROPOSED' && (
            <ProposedPreview key={pendingProposal.proposalId} proposal={pendingProposal} />
          )}
          <p className="highlight-status" data-testid="highlight-status">
            {state.previewMode === 'PROPOSED'
              ? 'Proposed result is isolated and not applied'
              : state.highlightedNodeId ? `Highlighted ${state.highlightedNodeId}` : 'No preview highlight'}
          </p>
          <p className="highlight-status" data-testid="isolation-status">
            Isolation: {state.isolationEvidence?.parentAccessBlocked
              ? `opaque (${state.isolationEvidence.reportedOrigin})`
              : 'not verified'}
          </p>
        </section>

        <section className="pane evidence-pane" aria-labelledby="evidence-heading">
          <div className="pane-heading">
            <div>
              <h2 id="evidence-heading">Evidence</h2>
              <p>{pendingProposal
                ? `${pendingProposal.status} · not applied`
                : state.scan ? `${state.scan.metrics.affectedNodeCount} affected violation nodes` : 'No scan yet'}</p>
            </div>
            {selectedIssue && !pendingProposal && (
              <button type="button" onClick={() => void workspaceStore.inspectIssue(selectedIssue.issueId)}>Refocus</button>
            )}
          </div>

          {state.error && <p role="alert" className="error-message">{state.error}</p>}
          {pendingProposal ? (
            <ProposalPanel proposal={pendingProposal} />
          ) : selectedIssue ? (
            <IssueDetail key={selectedIssue.issueId} issue={selectedIssue} />
          ) : (
            <>
              {state.verificationNotice && <VerificationResult />}
              <IssueList />
            </>
          )}
        </section>
      </section>

      <ActivityTimeline />
      <footer className="activity-bar">
        <span title={state.registeredTools.join(', ')}>
          WebMCP: {state.registeredTools.length ? `${state.registeredTools.length} tools ready` : state.webMcpError || 'registering…'}
        </span>
        <span data-testid="last-invocation">
          {state.lastInvocation
            ? `${state.lastInvocation.tool} · ${state.lastInvocation.summary} · ${state.lastInvocation.timestamp}`
            : 'Waiting for browser agent'}
        </span>
        <span>Browser persistence · not a backup</span>
      </footer>
      <p className="sr-status" role="status" aria-live="polite">
        Preview {state.previewStatus}. Scan {state.scanStatus}. {state.verificationNotice?.message}
      </p>
    </main>
  )
}

function ActivityTimeline() {
  const state = useWorkspaceState()
  const events = [...state.activity].reverse()
  return (
    <section className="activity-timeline" aria-labelledby="activity-heading">
      <div className="timeline-heading">
        <div>
          <h2 id="activity-heading">Agent action timeline</h2>
          <p>{events.length ? `${events.length} local event${events.length === 1 ? '' : 's'} · newest first` : 'Browser-agent calls and human approvals appear here'}</p>
        </div>
        <span className={`connection-state ${state.registeredTools.length ? 'connected' : ''}`}>
          {state.registeredTools.length ? 'WebMCP connected' : 'Manual mode'}
        </span>
      </div>
      {events.length ? (
        <ol data-testid="activity-timeline">
          {events.map((event) => {
            const issueAvailable = Boolean(event.issueId && state.issues.some(({ issueId }) => issueId === event.issueId))
            return (
              <li key={event.eventId}>
                <button
                  type="button"
                  disabled={!issueAvailable}
                  title={issueAvailable ? 'Focus the related issue' : 'No current issue to focus'}
                  onClick={() => event.issueId && void workspaceStore.inspectIssue(event.issueId)}
                >
                  <span className={`actor actor-${event.actor}`}>{event.actor}</span>
                  <strong>{event.action.replaceAll('_', ' ')}</strong>
                  <span>{event.resultSummary}</span>
                  <time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
                  <span>{event.approvalOccurred ? 'Approved by human' : `Revision ${event.sourceRevision}`}</span>
                </button>
              </li>
            )
          })}
        </ol>
      ) : <p className="timeline-empty">Try: “Find the serious accessibility issues in this checkout.”</p>}
    </section>
  )
}

function IssueList() {
  const state = useWorkspaceState()
  if (state.scanStatus === 'RUNNING') return <p className="empty-evidence">Running axe-core 4.13.0 inside the isolated preview…</p>
  if (state.scanStatus === 'STALE') return <p className="empty-evidence">Working source changed. Rescan with real axe before relying on issue results.</p>
  if (!state.scan) return (
    <div className="empty-evidence">
      <strong>Fixture ready to audit</strong>
      <p>Run axe to populate factual findings, mapped source ranges, and rendered highlights. Curbcut does not invent an accessibility score.</p>
    </div>
  )

  return (
    <div className="issue-list" data-testid="issue-list">
      <div className="metrics" aria-label="Scan metrics">
        <span>{state.scan.metrics.critical} critical</span>
        <span>{state.scan.metrics.serious} serious</span>
        <span>{state.scan.metrics.moderate} moderate</span>
        <span>{state.scan.metrics.minor} minor</span>
      </div>
      {state.issues.map((issue) => (
        <button
          type="button"
          className="issue-row"
          key={issue.issueId}
          onClick={() => void workspaceStore.inspectIssue(issue.issueId)}
        >
          <span className={`impact impact-${issue.impact ?? 'unknown'}`}>{issue.impact ?? 'unknown'}</span>
          <strong>{issue.ruleId}</strong>
          <span>{classificationLabel(issue.classification)}</span>
          <span>{issue.sourceNode ? `Line ${issue.sourceNode.sourceRange.startLine}` : 'Unmapped'}</span>
        </button>
      ))}
    </div>
  )
}

function IssueDetail({ issue }: { issue: AccessibilityIssue }) {
  return (
    <article className="issue-detail" data-testid="selected-issue">
      <button type="button" className="back-button" onClick={() => workspaceStore.clearSelection()}>
        ← All issues
      </button>
      <p className="detail-kicker">{issue.resultKind} · {issue.impact ?? 'unknown'} impact · {classificationLabel(issue.classification)}</p>
      <h3>{issue.ruleId}</h3>
      <p>{issue.help}</p>
      <p><a href={issue.helpUrl} target="_blank" rel="noreferrer">axe rule guidance</a></p>
      <dl>
        <dt>Classification</dt>
        <dd>{classificationLabel(issue.classification)}</dd>
        <dt>Why</dt>
        <dd>{issue.classificationReason}</dd>
        <dt>Mapping</dt>
        <dd>{issue.sourceNode
          ? `Mapped to ${issue.nodeId}; line ${issue.sourceNode.sourceRange.startLine}, column ${issue.sourceNode.sourceRange.startColumn}`
          : 'Unmapped; manual review only'}</dd>
        <dt>axe tags</dt>
        <dd>{issue.tags.join(', ') || 'none'}</dd>
        <dt>Target</dt>
        <dd><code>{issue.target.join(' ')}</code></dd>
      </dl>
      <h4>Relevant HTML (untrusted)</h4>
      <pre>{issue.htmlSnippet}</pre>
      <RepairControl issue={issue} />
    </article>
  )
}

function RepairControl({ issue }: { issue: AccessibilityIssue }) {
  const family = familyFor(issue)
  const [labelText, setLabelText] = useState('')
  const [altMode, setAltMode] = useState<HumanValues['altMode']>()
  const [altText, setAltText] = useState('')
  if (!family) {
    const contextual = issue.classification === 'CONTEXTUAL'
    return (
      <section className="manual-review" aria-labelledby="manual-review-heading">
        <h4 id="manual-review-heading">{contextual ? 'Context needed' : 'Evidence only'}</h4>
        <p>Curbcut mapped this issue to source, but the MVP has no bounded repair for it. Review the evidence, make an intentional source edit when appropriate, then rescan with axe.</p>
      </section>
    )
  }
  const repairFamily = family

  function submit(event: FormEvent) {
    event.preventDefault()
    const values: HumanValues = repairFamily === 'missing-form-label'
      ? { labelText }
      : repairFamily === 'image-alternative'
        ? { altMode, ...(altMode === 'meaningful' ? { altText } : {}) }
        : {}
    void workspaceStore.previewRepair(issue.issueId, repairFamily, values)
  }

  return (
    <form className="repair-control" onSubmit={submit}>
      <h4>{family === 'positive-tabindex' ? 'Ready-made code fix' : 'Contextual code fix'}</h4>
      {family === 'missing-form-label' && (
        <>
          <label>Label text override (optional)
            <input value={labelText} minLength={1} maxLength={120} onChange={(event) => setLabelText(event.target.value)} />
          </label>
          <p>Curbcut can reuse safe adjacent visible text as the candidate. You approve whether that wording is correct.</p>
        </>
      )}
      {family === 'image-alternative' && (
        <fieldset>
          <legend>Human decision: what is this image?</legend>
          <label><input type="radio" name="alt-mode" checked={altMode === 'meaningful'} onChange={() => setAltMode('meaningful')} /> Meaningful</label>
          <label><input type="radio" name="alt-mode" checked={altMode === 'decorative'} onChange={() => setAltMode('decorative')} /> Decorative</label>
          {altMode === 'meaningful' && (
            <label>Alternative text
              <input value={altText} minLength={1} maxLength={160} required onChange={(event) => setAltText(event.target.value)} />
            </label>
          )}
          <p>The system cannot decide image purpose or invent meaningful text. Decorative uses an empty alt attribute.</p>
        </fieldset>
      )}
      {family === 'positive-tabindex' && <p>Removes only the exact positive tabindex attribute. No content or design choice is required.</p>}
      <button
        type="submit"
        className="primary-action"
        data-testid="preview-repair"
        disabled={family === 'image-alternative' && (!altMode || (altMode === 'meaningful' && !altText))}
      >
        Preview code change
      </button>
    </form>
  )
}

function ProposalPanel({ proposal }: { proposal: RemediationProposal }) {
  const panelRef = useRef<HTMLElement>(null)
  const approvalRequired = requiresHumanApproval(proposal)
  const decision = proposal.humanValues.labelText
    ? `Label: ${proposal.humanValues.labelText}`
    : proposal.humanValues.altMode === 'decorative'
      ? 'Image purpose: decorative'
      : proposal.humanValues.altText
        ? `Alternative text: ${proposal.humanValues.altText}`
        : null
  useEffect(() => panelRef.current?.focus(), [])
  return (
    <article ref={panelRef} tabIndex={-1} className="issue-detail proposal-panel" data-testid="proposal-panel">
      <p className="detail-kicker">{approvalRequired ? `${proposal.status} · Working source unchanged` : 'MECHANICAL · NOT APPLIED'}</p>
      <h3>{proposal.family}</h3>
      <dl>
        <dt>Classification</dt><dd>{proposal.classification}</dd>
        <dt>Rationale</dt><dd>{proposal.rationale}</dd>
        <dt>Validation</dt><dd>{proposal.expectedValidation}</dd>
        {decision && <><dt>Proposed meaning</dt><dd>{decision}</dd></>}
      </dl>
      <h4>Exact compact diff</h4>
      <div className="source-diff" aria-label="Proposed source diff">
        <pre aria-label="Before source"><span aria-hidden="true">− </span>{proposal.diff.before || '(empty)'}</pre>
        <pre aria-label="After source"><span aria-hidden="true">+ </span>{proposal.diff.after || '(empty)'}</pre>
      </div>
      <p className="review-notice">{approvalRequired
        ? <><strong>Your approval is required.</strong> Curbcut wrote the code, but only you can confirm its meaning. Reject and create a new proposal to change the answer.</>
        : <><strong>No semantic approval needed.</strong> This exact syntax-only diff is visible before the agent or you applies it, and exact Undo remains available.</>}</p>
      {approvalRequired && proposal.status === 'PROPOSED' && (
        <button type="button" className="approve-action" data-testid="approve-proposal"
          onClick={() => workspaceStore.approveProposal(proposal.proposalId, proposal.diffHash)}>
          Approve this exact change
        </button>
      )}
      {approvalRequired && proposal.status === 'APPROVED' && (
        <p className="approval-status" data-testid="approval-status">Approved by human for diff {proposal.diffHash.slice(0, 12)}…</p>
      )}
      <div className="proposal-actions">
        <button type="button" onClick={() => workspaceStore.rejectProposal()}>Reject</button>
        <button
          type="button"
          className="primary-action"
          data-testid="apply-proposal"
          disabled={approvalRequired ? proposal.status !== 'APPROVED' : proposal.status !== 'PROPOSED' && proposal.status !== 'APPROVED'}
          onClick={() => void workspaceStore.applyProposal(proposal.proposalId)}
        >
          {approvalRequired ? 'Apply approved change' : 'Apply mechanical change'}
        </button>
      </div>
    </article>
  )
}

function VerificationResult() {
  const { verificationNotice } = useWorkspaceState()
  if (!verificationNotice) return null
  return (
    <section className={`verification-result verification-${verificationNotice.outcome.toLowerCase()}`} data-testid="verification-result">
      <strong>{verificationNotice.kind === 'UNDO' ? 'Undo' : 'Repair'}: {verificationNotice.outcome.replace('_', ' ')}</strong>
      <p>{verificationNotice.message}</p>
    </section>
  )
}

function familyFor(issue: AccessibilityIssue): RepairFamily | null {
  if (issue.ruleId === 'label' && issue.sourceNode && ['input', 'select', 'textarea'].includes(issue.sourceNode.tagName)) return 'missing-form-label'
  if (issue.ruleId === 'tabindex' && issue.sourceNode) return 'positive-tabindex'
  if (issue.ruleId === 'image-alt' && issue.sourceNode?.tagName === 'img') return 'image-alternative'
  return null
}

function classificationLabel(classification: AccessibilityIssue['classification']) {
  if (classification === 'MECHANICAL') return 'Mechanical repair'
  if (classification === 'CONTEXTUAL') return 'Needs your decision'
  return 'Manual review'
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))
}

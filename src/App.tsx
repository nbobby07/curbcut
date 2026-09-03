import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react'
import type { AccessibilityIssue } from './axeAdapter'
import { Preview, type PreviewBridge } from './Preview'
import { ProposedPreview } from './ProposedPreview'
import { requiresHumanApproval, type RemediationProposal } from './proposal'
import type { HumanValues, RepairFamily } from './repairs'
import { useWorkspaceWebMcpTools } from './webmcp'
import { readWorkspaceFiles, WorkspaceImportError } from './workspaceImport'
import { useWorkspaceState, workspaceStore } from './workspaceStore'

type SourceTab = 'html' | 'css'
type WorkspacePane = 'source' | 'preview' | 'evidence'

const AGENT_DEMO_PROMPT = 'Fix the critical and serious accessibility issues in this checkout without changing the overall visual design. Preview each change before applying it, and ask me about anything that requires semantic judgment.'

export function App() {
  const state = useWorkspaceState()
  const [sourceTab, setSourceTab] = useState<SourceTab>('html')
  const [mobilePane, setMobilePane] = useState<WorkspacePane>('source')
  const [exportKind, setExportKind] = useState<'html' | 'css' | 'workspace'>('html')
  const [importing, setImporting] = useState(false)
  const [promptCopied, setPromptCopied] = useState(false)
  const previewRef = useRef<PreviewBridge>(null)
  const editorRef = useRef<HTMLTextAreaElement>(null)
  const lineNumbersRef = useRef<HTMLPreElement>(null)
  const evidenceScrollRef = useRef<HTMLDivElement>(null)
  const importRef = useRef<HTMLInputElement>(null)
  const scanButtonRef = useRef<HTMLButtonElement>(null)
  const selectedIssue = state.issues.find(({ issueId }) => issueId === state.selectedIssueId)
  const pendingProposal = state.proposal && ['PROPOSED', 'APPROVED'].includes(state.proposal.status)
    ? state.proposal
    : null
  const latestChange = state.history.at(-1)
  const sourceValue = sourceTab === 'html' ? state.htmlSource : state.cssSource
  const lineNumbers = useMemo(
    () => Array.from({ length: sourceValue.split('\n').length }, (_, index) => index + 1).join('\n'),
    [sourceValue],
  )
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
    const frame = requestAnimationFrame(() => revealMappedSource(selectedIssue))
    return () => cancelAnimationFrame(frame)
  }, [mobilePane, selectedIssue, sourceTab])

  useEffect(() => {
    if (state.verificationNotice?.outcome === 'PENDING') scanButtonRef.current?.focus()
  }, [state.verificationNotice])

  useEffect(() => {
    if (selectedIssue || pendingProposal) setMobilePane('evidence')
  }, [pendingProposal?.proposalId, selectedIssue?.issueId])

  useEffect(() => {
    evidenceScrollRef.current?.scrollTo({ top: 0 })
  }, [pendingProposal?.proposalId, selectedIssue?.issueId])

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

  function moveWorkspacePane(event: KeyboardEvent<HTMLButtonElement>) {
    if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return
    event.preventDefault()
    const panes: WorkspacePane[] = ['source', 'preview', 'evidence']
    const direction = event.key === 'ArrowRight' ? 1 : -1
    const next = panes[(panes.indexOf(mobilePane) + direction + panes.length) % panes.length]
    setMobilePane(next)
    requestAnimationFrame(() => document.getElementById(`mobile-${next}-tab`)?.focus())
  }

  function revealMappedSource(issue: AccessibilityIssue, focus = false) {
    const editor = editorRef.current
    if (!editor || !issue.sourceNode) return
    const { startOffset, endOffset, startLine } = issue.sourceNode.sourceRange
    editor.setSelectionRange(startOffset, endOffset)
    if (!editor.offsetParent) return
    const lineHeight = Number.parseFloat(getComputedStyle(editor).lineHeight)
    const lineTop = (startLine - 1) * lineHeight
    editor.scrollTop = Math.max(0, lineTop - (editor.clientHeight - lineHeight) / 2)
    if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = editor.scrollTop
    if (focus) editor.focus({ preventScroll: true })
    if (editor.scrollHeight <= editor.clientHeight) {
      window.scrollTo({ top: window.scrollY + editor.getBoundingClientRect().top + lineTop - window.innerHeight / 2 })
    }
  }

  function refocusSelectedIssue() {
    if (!selectedIssue) return
    if (!selectedIssue.sourceNode) {
      void workspaceStore.inspectIssue(selectedIssue.issueId)
      return
    }
    setSourceTab('html')
    setMobilePane('source')
    requestAnimationFrame(() => revealMappedSource(selectedIssue, true))
  }

  async function importWorkspace(files: FileList | null) {
    if (!files?.length) return
    setImporting(true)
    try {
      const imported = await readWorkspaceFiles([...files])
      const result = workspaceStore.replaceWorkspace(imported.html, imported.css, imported.label)
      if (!result.ok) workspaceStore.reportError(result.error.message)
      else setSourceTab('html')
    } catch (error) {
      workspaceStore.reportError(error instanceof WorkspaceImportError || error instanceof Error
        ? error.message
        : 'The selected files could not be imported.')
    } finally {
      setImporting(false)
      if (importRef.current) importRef.current.value = ''
    }
  }

  async function copyAgentPrompt() {
    try {
      await navigator.clipboard.writeText(AGENT_DEMO_PROMPT)
      setPromptCopied(true)
      window.setTimeout(() => setPromptCopied(false), 2_000)
    } catch {
      workspaceStore.reportError('The agent prompt could not be copied.')
    }
  }

  return (
    <main className="app-shell">
      <header className="command-bar">
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden="true">C</span>
          <h1>Curbcut</h1>
        </div>
        <div className="environment-status" aria-label="Workspace environment">
          <span className={state.isolationEvidence?.parentAccessBlocked ? 'healthy' : ''}>Secure sandbox</span>
          <span
            className={state.scanStatus === 'CURRENT' && state.mutationStatus === 'IDLE' ? 'healthy' : ''}
            data-testid="mutation-status"
          >
            Scan {state.scanStatus.toLowerCase()} · {state.mutationStatus.toLowerCase()}
          </span>
        </div>
        <div className="command-actions">
          <div className="command-group">
            <span
              className={`command-readiness connection-state ${state.registeredTools.length ? 'connected' : ''}`}
              title={state.registeredTools.join(', ')}
              data-testid="webmcp-readiness"
            >
              {state.registeredTools.length ? `WebMCP · ${state.registeredTools.length} tools ready` : 'WebMCP · manual mode'}
            </span>
            <button
              ref={scanButtonRef}
              type="button"
              className="primary-action"
              disabled={state.scanStatus === 'RUNNING' || state.previewStatus !== 'READY' || Boolean(pendingProposal)}
              onClick={() => void workspaceStore.scan(state.scan ? 'manual' : 'initial', undefined, 'human')}
            >
              {state.scanStatus === 'RUNNING' ? 'Scanning…' : state.scan ? 'Rescan with axe' : 'Run axe scan'}
            </button>
            <button
              type="button"
              disabled={!latestChange || Boolean(latestChange.undoneAt) || state.mutationStatus !== 'IDLE'}
              onClick={() => void workspaceStore.undoLatest()}
            >
              Undo last repair
            </button>
            <input
              ref={importRef}
              hidden
              type="file"
              aria-label="Import local HTML, CSS, or workspace JSON"
              accept=".html,.htm,.css,.json,text/html,text/css,application/json"
              multiple
              onChange={(event) => void importWorkspace(event.target.files)}
            />
            <button type="button" disabled={importing || state.mutationStatus !== 'IDLE'} onClick={() => importRef.current?.click()}>
              {importing ? 'Importing…' : 'Import files'}
            </button>
          </div>
          <div className="command-group export-group">
            <label className="export-control"><span>Export</span>
              <select value={exportKind} aria-label="Export format" onChange={(event) => setExportKind(event.target.value as typeof exportKind)}>
                <option value="html">HTML</option>
                <option value="css">CSS</option>
                <option value="workspace">Workspace JSON</option>
              </select>
            </label>
            <button type="button" onClick={() => void workspaceStore.exportSource(exportKind)}>Download</button>
            <button
              type="button"
              className="agent-prompt-action"
              onClick={() => void copyAgentPrompt()}
            >
              {promptCopied ? 'Prompt copied' : 'Copy agent prompt'}
            </button>
            <button type="button" className="quiet-action" onClick={() => {
              if (window.confirm('Replace the current local workspace with the built-in checkout demo?')) workspaceStore.loadDemo()
            }}>Reset demo</button>
          </div>
        </div>
      </header>

      <div className="mobile-pane-tabs" role="tablist" aria-label="Workspace pane">
        {(['source', 'preview', 'evidence'] as const).map((pane) => (
          <button
            key={pane}
            id={`mobile-${pane}-tab`}
            type="button"
            role="tab"
            aria-controls={`${pane}-pane`}
            aria-selected={mobilePane === pane}
            tabIndex={mobilePane === pane ? 0 : -1}
            onKeyDown={moveWorkspacePane}
            onClick={() => setMobilePane(pane)}
          >
            {pane[0].toUpperCase() + pane.slice(1)}
          </button>
        ))}
      </div>

      <section className={`workspace mobile-${mobilePane}`} aria-label="Accessibility workspace">
        <section id="source-pane" className={`pane source-pane ${selectedIssue?.sourceNode ? 'has-mapped-source' : ''}`} aria-labelledby="source-heading">
          <div className="pane-heading">
            <div>
              <h2 id="source-heading">Source</h2>
              {selectedIssue?.sourceNode && (
                <p className="mapped-source-location" data-testid="source-location">
                  Mapped source · line {selectedIssue.sourceNode.sourceRange.startLine}, column {selectedIssue.sourceNode.sourceRange.startColumn}
                </p>
              )}
            </div>
            <div className="tabs" role="tablist" aria-label="Source file">
              <button id="html-tab" role="tab" aria-controls="source-editor" aria-selected={sourceTab === 'html'} tabIndex={sourceTab === 'html' ? 0 : -1} onKeyDown={moveSourceTab} onClick={() => setSourceTab('html')}>HTML</button>
              <button id="css-tab" role="tab" aria-controls="source-editor" aria-selected={sourceTab === 'css'} tabIndex={sourceTab === 'css' ? 0 : -1} onKeyDown={moveSourceTab} onClick={() => setSourceTab('css')}>CSS</button>
            </div>
          </div>
          <div className="editor-shell">
            <pre ref={lineNumbersRef} className="line-numbers" aria-hidden="true">{lineNumbers}</pre>
            <textarea
              id="source-editor"
              ref={editorRef}
              aria-label={sourceTab === 'html' ? 'Editable HTML source' : 'Editable CSS source'}
              spellCheck={false}
              disabled={state.mutationStatus !== 'IDLE'}
              value={sourceValue}
              onScroll={(event) => {
                if (lineNumbersRef.current) lineNumbersRef.current.scrollTop = event.currentTarget.scrollTop
              }}
              onChange={(event) => sourceTab === 'html'
                ? workspaceStore.setHtmlSource(event.target.value)
                : workspaceStore.setCssSource(event.target.value)}
            />
          </div>
          <footer className="source-meta">
            <span>{selectedIssue?.sourceNode ? `Ln ${selectedIssue.sourceNode.sourceRange.startLine}, Col ${selectedIssue.sourceNode.sourceRange.startColumn}` : 'No source selection'}</span>
            <span>UTF-8</span>
            <span>{sourceTab.toUpperCase()}</span>
          </footer>
        </section>

        <section id="preview-pane" className="pane preview-pane" aria-labelledby="preview-heading">
          <div className="pane-heading">
            <div>
              <h2 id="preview-heading">Live preview</h2>
              <p>Source rev {state.sourceRevision}</p>
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
          {pendingProposal && (
            <div className="proposal-stage-wrap" hidden={state.previewMode !== 'PROPOSED'}>
              <ProposedPreview key={pendingProposal.proposalId} proposal={pendingProposal} />
            </div>
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

        <section id="evidence-pane" className="pane evidence-pane" aria-labelledby="evidence-heading">
          <div className="pane-heading">
            <div>
              <h2 id="evidence-heading">Evidence ledger</h2>
              <p>{pendingProposal
                ? `${pendingProposal.status} · not applied`
                : state.scan?.coverage.truncated
                  ? `${state.scan.coverage.returnedNodeCount} of ${state.scan.coverage.totalNodeCount} axe result nodes · lower bounds`
                  : state.scan ? `${state.issues.length} evidence records · ${state.scan.metrics.affectedNodeCount} violation nodes` : 'No scan yet'}</p>
            </div>
            {selectedIssue && !pendingProposal && (
              <button type="button" onClick={refocusSelectedIssue}>Refocus</button>
            )}
          </div>

          {state.error && <p role="alert" className="error-message">{state.error}</p>}
          {state.lastExport && <p role="status" className="export-message">Downloaded {state.lastExport.filename} · revision {state.lastExport.sourceRevision}</p>}
          <div ref={evidenceScrollRef} className="evidence-scroll">
            <IssueList focusIssueId={selectedIssue?.issueId} />
            {state.verificationNotice && !selectedIssue && <VerificationResult />}
            {pendingProposal
              ? <ProposalPanel proposal={pendingProposal} issue={selectedIssue} />
              : selectedIssue && <IssueDetail key={selectedIssue.issueId} issue={selectedIssue} />}
          </div>
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
  const events = [...state.activity].reverse().slice(0, 25)
  return (
    <section className="activity-timeline" aria-labelledby="activity-heading">
      <div className="timeline-heading">
        <div>
          <h2 id="activity-heading">Action timeline</h2>
          <p>{events.length ? `${events.length} recent local event${events.length === 1 ? '' : 's'}` : 'Browser-agent calls and human approvals appear here'}</p>
        </div>
        <span className={`connection-state ${state.registeredTools.length ? 'connected' : ''}`}>
          {state.registeredTools.length ? 'WebMCP connected' : 'Manual mode'}
        </span>
      </div>
      {events.length ? (
        <>
          <div className="timeline-columns" aria-hidden="true"><span>Time</span><span>Actor</span><span>Event</span><span>Result</span><span>Status</span></div>
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
                    <time dateTime={event.timestamp}>{formatTime(event.timestamp)}</time>
                    <span className={`actor actor-${event.actor}`}>{event.actor}</span>
                    <strong>{event.action.replaceAll('_', ' ')}</strong>
                    <span className="event-summary">{event.resultSummary}</span>
                    <span className="event-status">{event.approvalOccurred ? 'Human approved' : `Revision ${event.sourceRevision}`}</span>
                  </button>
                </li>
              )
            })}
          </ol>
        </>
      ) : <p className="timeline-empty">Try: “Find the serious accessibility issues in this checkout.”</p>}
    </section>
  )
}

function IssueList({ focusIssueId }: { focusIssueId?: string }) {
  const state = useWorkspaceState()
  if (state.scanStatus === 'RUNNING') return <p className="empty-evidence">Running axe-core 4.13.0 inside the isolated preview…</p>
  if (state.scanStatus === 'STALE') return <p className="empty-evidence">Working source changed. Rescan with real axe before relying on issue results.</p>
  if (!state.scan) return (
    <div className="empty-evidence">
      <strong>Fixture ready to audit</strong>
      <p>Run axe to populate factual findings, mapped source ranges, and rendered highlights. Curbcut does not invent an accessibility score.</p>
    </div>
  )

  const visibleIssues = focusIssueId
    ? state.issues.filter(({ issueId }) => issueId === focusIssueId)
    : state.issues
  const prefix = state.scan.coverage.truncated ? '≥' : ''

  return (
    <div className="issue-list" data-testid="issue-list">
      <ul className="metrics" aria-label="Scan metrics">
        <li>{prefix}{state.scan.metrics.ruleCount} violation rules</li>
        <li>{prefix}{state.scan.metrics.affectedNodeCount} violation nodes</li>
        <li>{prefix}{state.scan.metrics.critical} critical</li>
        <li>{prefix}{state.scan.metrics.serious} serious</li>
        <li>{prefix}{state.scan.metrics.moderate} moderate</li>
        <li>{prefix}{state.scan.metrics.minor} minor</li>
        <li>{prefix}{state.scan.metrics.manualReviewsOutstanding} need review</li>
      </ul>
      {state.scan.coverage.truncated && (
        <p className="scan-limit-warning" role="status">
          Axe found {state.scan.coverage.totalNodeCount} result nodes. Curbcut safely displayed the first {state.scan.coverage.returnedNodeCount}; reported counts are lower bounds. Narrow the source and rescan for complete totals.
        </p>
      )}
      {visibleIssues.map((issue) => (
        <button
          id={`issue-${issue.issueId}`}
          type="button"
          className={`issue-row ${state.selectedIssueId === issue.issueId ? 'is-selected' : ''}`}
          key={issue.issueId}
          onClick={() => void workspaceStore.inspectIssue(issue.issueId)}
        >
          <span className={`impact impact-${issue.impact ?? 'unknown'}`}>{issue.impact ?? 'unknown'}</span>
          <strong>{issue.ruleId}</strong>
          <span>{issueActionLabel(issue)}</span>
          <span>{issue.sourceNode ? `Line ${issue.sourceNode.sourceRange.startLine}` : 'Unmapped'}</span>
        </button>
      ))}
    </div>
  )
}

function IssueDetail({ issue }: { issue: AccessibilityIssue }) {
  const detailRef = useRef<HTMLElement>(null)
  useEffect(() => detailRef.current?.focus({ preventScroll: true }), [issue.issueId])
  return (
    <article ref={detailRef} tabIndex={-1} className="issue-detail" data-testid="selected-issue">
      <button type="button" className="back-button" onClick={() => {
        workspaceStore.clearSelection()
        requestAnimationFrame(() => document.getElementById(`issue-${issue.issueId}`)?.focus())
      }}>
        ← All issues
      </button>
      <h3>{issue.ruleId}</h3>
      <p className="detail-summary">{issue.resultKind} · {issue.impact ?? 'unknown'} impact · {classificationLabel(issue.classification)}</p>
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
  const [buttonName, setButtonName] = useState('')
  const [languageTag, setLanguageTag] = useState('')
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
        : repairFamily === 'button-accessible-name'
          ? { buttonName }
          : repairFamily === 'document-language'
            ? { languageTag }
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
      {family === 'button-accessible-name' && (
        <label>Button purpose
          <input value={buttonName} minLength={1} maxLength={120} required onChange={(event) => setButtonName(event.target.value)} placeholder="Close order summary" />
        </label>
      )}
      {family === 'document-language' && (
        <label>Document language (BCP 47)
          <input value={languageTag} minLength={1} maxLength={35} required onChange={(event) => setLanguageTag(event.target.value)} placeholder="en" />
        </label>
      )}
      <button
        type="submit"
        className="primary-action"
        data-testid="preview-repair"
        disabled={(family === 'image-alternative' && (!altMode || (altMode === 'meaningful' && !altText))) ||
          (family === 'button-accessible-name' && !buttonName) || (family === 'document-language' && !languageTag)}
      >
        Preview code change
      </button>
    </form>
  )
}

function ProposalPanel({ proposal, issue }: { proposal: RemediationProposal; issue?: AccessibilityIssue }) {
  const { mutationStatus, proposalPreview, blockedAction } = useWorkspaceState()
  const panelRef = useRef<HTMLElement>(null)
  const approvalRequired = requiresHumanApproval(proposal)
  const proposedResultReady = proposalPreview.proposalId === proposal.proposalId && proposalPreview.status === 'READY'
  const decision = proposal.humanValues.labelText
    ? `Label: ${proposal.humanValues.labelText}`
    : proposal.humanValues.altMode === 'decorative'
      ? 'Image purpose: decorative'
      : proposal.humanValues.altText
        ? `Alternative text: ${proposal.humanValues.altText}`
        : proposal.humanValues.buttonName
          ? `Button name: ${proposal.humanValues.buttonName}`
          : proposal.humanValues.languageTag
            ? `Document language: ${proposal.humanValues.languageTag}`
            : null
  useEffect(() => panelRef.current?.focus({ preventScroll: true }), [])
  return (
    <article ref={panelRef} tabIndex={-1} className="issue-detail proposal-panel" data-testid="proposal-panel">
      <h3>{proposal.family}</h3>
      <dl>
        <dt>Status</dt><dd>{approvalRequired
          ? `${proposal.status.toLowerCase()} proposal · working source unchanged`
          : 'Mechanical change · not applied'}</dd>
        {issue && <>
          <dt>axe rule</dt><dd>{issue.ruleId} · {issue.impact ?? 'unknown'} impact</dd>
          <dt>Source</dt><dd>{issue.sourceNode
            ? `Line ${issue.sourceNode.sourceRange.startLine}, column ${issue.sourceNode.sourceRange.startColumn}`
            : 'No exact source range'}</dd>
          <dt>Target</dt><dd><code>{issue.target.join(' ')}</code></dd>
          <dt>WCAG tags</dt><dd>{issue.tags.filter((tag) => tag.startsWith('wcag')).join(', ') || 'No WCAG tag supplied by axe'}</dd>
        </>}
        <dt>Classification</dt><dd>{proposal.classification}</dd>
        <dt>Rationale</dt><dd>{proposal.rationale}</dd>
        <dt>Validation</dt><dd>{proposal.expectedValidation}</dd>
        {decision && <><dt>Proposed meaning</dt><dd>{decision}</dd></>}
      </dl>
      <h4 id="proposal-diff-heading">Exact compact diff</h4>
      <section className="source-diff" aria-labelledby="proposal-diff-heading">
        <div className="diff-block"><strong>Before</strong><pre>{proposal.diff.before || '(empty)'}</pre></div>
        <div className="diff-block"><strong>Proposed</strong><pre>{proposal.diff.after || '(empty)'}</pre></div>
      </section>
      <p className="review-notice">{approvalRequired
        ? <><strong>Your approval is required.</strong> Curbcut wrote the code, but only you can confirm its meaning. Reject and create a new proposal to change the answer.</>
        : <><strong>No semantic approval needed.</strong> This exact syntax-only diff is visible before the agent or you applies it, and exact Undo remains available.</>}</p>
      {blockedAction?.proposalId === proposal.proposalId && (
        <section className="blocked-action" role="alert" aria-labelledby="blocked-action-heading" data-testid="blocked-agent-action">
          <strong id="blocked-action-heading">Agent action blocked</strong>
          <p>{blockedAction.message}</p>
        </section>
      )}
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
        <button type="button" disabled={mutationStatus !== 'IDLE'} onClick={() => workspaceStore.rejectProposal()}>Reject</button>
        <button
          type="button"
          className="primary-action"
          data-testid="apply-proposal"
          disabled={mutationStatus !== 'IDLE' || !proposedResultReady ||
            (approvalRequired ? proposal.status !== 'APPROVED' : proposal.status !== 'PROPOSED' && proposal.status !== 'APPROVED')}
          onClick={() => void workspaceStore.applyProposal(proposal.proposalId)}
        >
          {mutationStatus === 'APPLYING'
            ? 'Applying…'
            : !proposedResultReady
              ? 'Waiting for proposed preview…'
              : approvalRequired ? 'Apply approved change' : 'Apply mechanical change'}
        </button>
      </div>
    </article>
  )
}

function VerificationResult() {
  const { verificationNotice } = useWorkspaceState()
  if (!verificationNotice) return null
  const repairVerified = verificationNotice.kind === 'APPLY' && verificationNotice.outcome === 'VERIFIED'
  return (
    <section className={`verification-result verification-${verificationNotice.outcome.toLowerCase()}`} data-testid="verification-result">
      <strong>{repairVerified
        ? 'Repair: VERIFIED — automated check passed'
        : `${verificationNotice.kind === 'UNDO' ? 'Undo' : 'Repair'}: ${verificationNotice.outcome.replace('_', ' ')}`}</strong>
      <p>{verificationNotice.message}</p>
      {repairVerified && <p>Human retesting may still be required. This verifies only the targeted automated check; it is not a WCAG conformance determination.</p>}
    </section>
  )
}

function familyFor(issue: AccessibilityIssue): RepairFamily | null {
  if (issue.ruleId === 'label' && issue.sourceNode && ['input', 'select', 'textarea'].includes(issue.sourceNode.tagName)) return 'missing-form-label'
  if (issue.ruleId === 'tabindex' && issue.sourceNode) return 'positive-tabindex'
  if (issue.ruleId === 'image-alt' && issue.sourceNode?.tagName === 'img') return 'image-alternative'
  if (issue.ruleId === 'button-name' && issue.sourceNode?.tagName === 'button') return 'button-accessible-name'
  if (issue.ruleId === 'html-has-lang' && issue.sourceNode?.tagName === 'html') return 'document-language'
  return null
}

function classificationLabel(classification: AccessibilityIssue['classification']) {
  if (classification === 'MECHANICAL') return 'Mechanical'
  if (classification === 'CONTEXTUAL') return 'Contextual'
  return 'Manual review'
}

function issueActionLabel(issue: AccessibilityIssue) {
  const family = familyFor(issue)
  if (family === 'positive-tabindex') return 'Code fix ready'
  if (family) return 'Code preview · approval'
  if (issue.classification === 'CONTEXTUAL') return 'Context needed'
  return 'Evidence only'
}

function formatTime(timestamp: string) {
  return new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', second: '2-digit' }).format(new Date(timestamp))
}

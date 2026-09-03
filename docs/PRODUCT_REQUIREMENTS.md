# Curbcut — Product Requirements

Status: MVP implementation, production freeze, and target-client verification complete; owner video and Devpost submission remain pending
Planning date: August 26, 2026  
Hackathon deadline: September 3, 2026 at 1:00 PM PT

## 1. Product decision

Curbcut is a local-first, browser-native accessibility repair workbench for static HTML and CSS. A frontend developer and an external browser agent inspect and change the same rendered artifact through the same explicit workflow:

`source → render → scan → inspect → preview → wait for exact preview READY → [approve if contextual] → apply → rescan → verify → undo/export`

The differentiator is the shared interaction boundary. The human sees source, rendering, evidence, diffs, and verification. The browser agent receives narrow WebMCP tools for those same workspace actions. The agent performs mechanical work; the human retains semantic and visual judgment.

Curbcut reports automated axe-core findings and unresolved manual reviews. It does not calculate an accessibility score and must never claim that a clean automated scan proves WCAG compliance.

### Decision inherited from the spikes

The product extends, rather than replaces, the successful spike architecture:

- Keep React as the owner of all workspace state. WebMCP tools dispatch through the same state store as visible controls.
- Keep axe-core execution inside the preview realm. The spike proved that parent-realm axe execution against an iframe root is unreliable, while in-frame execution works.
- Keep deterministic, small source patches and exact snapshot undo.
- Replace the spike's existing-HTML-ID mapping with parser-backed source ranges and preview-only node metadata.
- Replace the spike's same-origin iframe with an opaque-origin sandbox and a validated `postMessage` bridge.
- Register a stable tool set once. The spike observed a transient tool-list update during sequential registration, so the MVP will not dynamically add and remove tools as state changes.
- Connect WebMCP to the real product architecture early: by the end of M2, `scan_accessibility`, `list_issues`, and `inspect_issue` must operate the real sandbox, axe results, React store, source map, source selection, and preview highlight. The complete ten-tool workflow remains M4 scope.
- Maintain a persistent authenticated Vercel deployment from M1/M2 onward. The final application commit, `1d74df2`, was built, deployed, and verified at <https://curbcut-one.vercel.app> as Vercel deployment `dpl_6mFLMM3VinYUBb2pjFnwV2zG474n`.

## 2. Audience and job to be done

Primary user: a frontend developer who has an editable static component or page and wants to understand and repair high-confidence accessibility failures without losing control of source or semantics.

Primary job:

> When axe finds an accessibility problem in my HTML/CSS, help me connect the rendered failure to the exact source, inspect a small proposed fix in code and pixels, decide anything semantic, verify the result, and retain a reversible history.

The MVP must also be legible to a hackathon judge who has less than three minutes: the shared human/agent workspace and the approval boundary must be obvious without explanation.

## 3. Goals and non-goals

### Goals

- Demonstrate a complete repair loop on arbitrary pasted static HTML and CSS.
- Make rendered evidence and source ranges stay synchronized.
- Give a browser agent a deep, stateful WebMCP workflow rather than a novelty command.
- Make every source mutation proposed, visible, authority-checked, reversible, and verifiable.
- Show where automated evidence ends and human judgment begins.
- Remain a static, browser-only deployment with source local to the browser.

### Non-goals

- Automated WCAG compliance or certification.
- JavaScript, frameworks, build tools, repositories, or multi-file projects.
- Arbitrary URL scanning, crawling, browser automation, or DOM mutation of third-party pages.
- Authentication, accounts, databases, cloud history, teams, dashboards, or GitHub integration.
- A built-in chatbot or an LLM that rewrites source.
- General-purpose HTML/CSS refactoring.
- An accessibility overlay or runtime patch injected into a production site.

## 4. Primary workspace and information architecture

The product has one route and one workspace. Desktop layout:

1. **Top command bar**
   - Product name.
   - Local-only status.
   - WebMCP availability: available, unavailable, or registration error.
   - Workspace actions: Load demo, Scan, Undo, Export.
   - Compact scan status and source revision.
2. **Left — Source**
   - HTML and CSS tabs.
   - A textarea is acceptable for the MVP; CodeMirror is not required.
   - Current issue range and proposed edit range are visibly selected where the editor permits it; otherwise the exact line and column are shown above the editor and the relevant text is selected on focus.
   - Editing source increments the source revision, invalidates the scan, and invalidates any pending proposal.
3. **Center — Preview**
   - Working and Proposed tabs.
   - The working rendering is always labeled with its source revision.
   - The selected axe target receives an obvious outline that does not alter source.
   - Proposed mode renders the candidate source before commit and is visually labeled “Not applied.”
4. **Right — Evidence**
   - Shows either the issue list, a selected issue, or a remediation proposal. These are modes of one panel, not nested cards.
   - Issue list offers small filters for impact and classification.
   - Issue detail contains axe evidence, source mapping, classification, and the next valid action.
   - Proposal detail contains rationale, input requiring judgment, a compact source diff, validation expectations, Reject, and Apply controls; Approve appears only for contextual work.
5. **Bottom — Agent activity**
   - A collapsible, single-line-height timeline of recent WebMCP calls and human approvals.
   - It is not a chat, log-analysis product, or enterprise audit trail.

On narrower viewports, Source, Preview, and Evidence become three keyboard-accessible tabs. The demo is optimized for a laptop-width viewport.

## 5. Product states

### Empty

- Source contains an empty HTML skeleton and blank CSS, or no workspace exists.
- Preview explains that static HTML/CSS will render locally and no JavaScript will execute.
- Evidence says “No scan yet.”
- Primary action is **Load checkout demo**; secondary action is to paste HTML.
- Scan is disabled until valid renderable HTML exists.

### Built-in demo ready

- A professional checkout fixture is loaded and rendered.
- The actual fixture is scanned automatically after its first safe render so the first remediation can appear within 15 seconds during the demo. This is a real axe run, not stored/faked results.
- A reset action restores the exact fixture.

### Scanning

- The preview remains visible but cannot change.
- Scan button and scan WebMCP call report `RUNNING`; duplicate scans are rejected.
- Evidence uses a concise progress state: “Running axe-core 4.13.0 against revision N.”
- Completion updates counts atomically. Failure retains the previous results as stale and explains the error.

### Issue inspection

- The source range is focused, the rendered node is outlined, and the issue detail opens.
- Evidence includes rule, impact, help text/link, WCAG tags supplied by axe, target, relevant HTML snippet, exact source line/column, classification, and classification rationale.
- Snippets originating in user source are visually marked as untrusted input and rendered only as escaped text.

### Remediation preview

- Creating a proposal does not mutate working source.
- Right panel shows required semantic input, rationale, surgical edit, before/after diff, and expected validation.
- Center switches to the Proposed rendering, clearly labeled “Not applied.” Working and Proposed remain directly switchable.
- Every proposal is non-mutating and visibly reviewable. Apply remains unavailable while the exact proposed iframe is `RENDERING`. Once it is `READY`, mechanical Apply is enabled; contextual Apply additionally requires exact visible approval.

### Applied

- Apply commits the exact proposed source, creates a history entry containing before and after snapshots, increments the revision, and marks the previous scan stale.
- The preview returns to Working at the new revision.
- Evidence says “Applied; rescan required.” It does not claim the issue is fixed before axe verifies it.

### Rescan and verification

- Rescan runs axe against the new rendered revision.
- If the same rule/source node no longer fails, the change is marked **Verified by automated rescan**.
- If it persists, the change is marked **Not verified**, the new evidence is shown, and Undo remains available.
- Other findings are neither hidden nor described as regressions unless the result comparison supports that conclusion.

### Rejected

- Reject records the proposal as rejected and returns to the working preview without changing source.
- The issue remains open. The timeline records the rejection reason category, not free-form source content.

### Undo

- Undo restores the exact HTML and CSS snapshot preceding the latest applied remediation.
- It is available only when the current source hash matches that change's recorded after-state. If the user manually edited after applying, Undo refuses rather than overwrite those edits.
- Undo increments the revision, makes the scan stale, and requires a new scan. The restored violation is expected to return when the original fixture is restored.

### Export

- Export downloads the current source only, never preview metadata.
- The menu offers HTML, CSS, and one JSON workspace bundle containing both strings and a version number. Each action creates one local `Blob` download.
- Export success reports filename and source hash. It does not return raw source through WebMCP.

### Errors

Errors appear next to the action that failed and in one non-modal status region. They preserve source and any last good scan. Required cases:

- WebMCP absent or registration failed.
- Parser error or no source-backed target.
- Preview timed out or rejected a message.
- axe failed.
- issue/scan/proposal is stale.
- unsupported remediation or missing human input.
- approval required.
- nothing safe to undo.
- export blocked by the browser.

No error exposes stack traces or echoes unescaped imported source into HTML.

## 6. Source and mapping requirements

Editable state is two strings: `htmlSource` and `cssSource`. Raw strings are canonical. Export and exact undo use those strings, not a serialized DOM.

Each render revision must:

1. Parse HTML into an HTML5-compatible AST with source locations.
2. Assign a collision-free internal node ID to every source-backed renderable element.
3. Record start/end offsets, start-tag offsets, tag name, and attribute locations.
4. Generate a preview-only copy by inserting the internal ID into start tags using descending offset patches.
5. Sanitize that marked copy before it crosses into the preview.
6. Map axe targets back through the internal ID to the exact source range.

Internal IDs are stable for the lifetime of a source revision, scan, and proposal. Any manual or applied edit creates a new revision and new map. The MVP intentionally avoids heuristic identity reconciliation across arbitrary edits; stale scan and proposal objects are rejected instead. This is safer and smaller than pretending an offset-derived node remains the same after unrelated source edits.

Implicit parser-created nodes with no source location may be scanned but cannot receive a surgical repair. Curbcut must explain that no exact source-backed target exists.

Mapping metadata appears only in the rendered preview. It is excluded from the editor, diffs, history snapshots, and exports.

## 7. Accessibility evidence and factual metrics

Curbcut pins axe-core 4.13.0 for the MVP and shows the version in scan details.

The summary displays:

- distinct automated violation rules;
- affected violation nodes;
- affected nodes by axe impact: critical, serious, moderate, minor, or unknown;
- manual reviews outstanding, defined as unresolved normalized items from axe `incomplete` plus unresolved contextual/manual-review items Curbcut has explicitly surfaced.

It does not combine these into a score.

Every normalized issue contains:

- stable issue ID within a scan;
- scan ID and source revision;
- axe rule ID, impact, help text, help URL, description, and tags;
- WCAG references derived only from axe-provided tags/links;
- axe target and relevant HTML snippet;
- mapped internal node ID and exact source offsets/line/column, when available;
- classification and rationale;
- current status: open, proposed, applied-unverified, verified, rejected, or manual review.

### Classification rules

- **MECHANICAL**: the patch is determined entirely by existing syntax and does not invent meaning or visual design. Example: remove a positive `tabindex` value.
- **CONTEXTUAL**: the patch shape is deterministic, but its value encodes meaning that a person must provide or confirm. Examples: label text, accessible button name, document language, and image alternative.
- **MANUAL_REVIEW**: axe reports an incomplete/manual check, source mapping is insufficient, or a credible repair requires semantic, layout, cascade, interaction, or design-system analysis outside the MVP.

Classification describes both the change and its authority boundary, not compliance certainty. A mechanical edit may apply after its exact proposal is visible and its proposed iframe is `READY`; contextual work still requires a human semantic decision and approval.

## 8. Repair families

The repair engine creates ordered text edits against exact source ranges. It never asks an LLM to rewrite the document and never serializes the whole AST back to HTML.

| Family | Axe evidence | Classification | Surgical transformation | Agent behavior and human authority | Rescan proof | Refuse when |
|---|---|---|---|---|---|---|
| Missing form label | `label`, failing form-control node | CONTEXTUAL | If one safe adjacent visible-text node exists, give it a collision-free ID when needed and add `aria-labelledby` to the control without duplicating visible text. Otherwise insert a `<label for="…">…</label>` from human-provided wording, adding a collision-free control ID when needed. | Agent may identify the family and offer the deterministic adjacent-text candidate. Human must confirm the meaning and approve; a candidate never becomes approval. | The affected control no longer appears under `label`; the exact label/control association is also checked in the preview DOM. | Existing ambiguous labeling, duplicate IDs, non-source-backed node, templated attributes, custom control, or no safe/provided wording. |
| Missing accessible button name | `button-name` on a native `<button>` | CONTEXTUAL | Add a quoted `aria-label` attribute to the source start tag. | Agent may request a concise name based on visible context but cannot silently choose it. Human provides/confirms the name. | The node no longer appears under `button-name`; computed accessible name is non-empty. | Non-native/custom widget, existing `aria-labelledby`, complex descendant semantics, duplicate attribute, or purpose remains ambiguous. |
| Missing document language | `html-has-lang` | CONTEXTUAL | Add `lang="…"` to the source-backed `<html>` start tag. `languageTag` must pass a conservative BCP 47 syntax check and `Intl.getCanonicalLocales`. | Agent may ask for the document language and form a patch; human confirms it. | `html-has-lang` clears and the iframe document element reports the chosen language. | Fragment without a source `<html>`, an invalid value, mixed-language question requiring per-node markup, or `html-lang-valid` correction beyond the simple case. |
| Positive tabindex | `tabindex` | MECHANICAL | Remove exactly the positive `tabindex` attribute and adjacent whitespace from the mapped start tag. | Agent may preview and apply the exact patch directly; no semantic approval is required. | The node clears `tabindex`; regression test confirms no unrelated attribute changed. | Nonliteral/template value, deliberate custom composite-widget ordering, multiple coupled nodes requiring interaction redesign, or no exact attribute range. |
| Missing image alternative | `image-alt` | CONTEXTUAL | Human chooses either decorative (`alt=""`) or meaningful (`alt="provided text"`); add or replace only the `alt` attribute. | Agent must ask whether the image conveys information. Meaningful text is human-provided/confirmed. | The node clears `image-alt`; preview DOM contains the exact approved value. | Charts/diagrams, image maps, `<input type="image">`, complex SVG, uncertain purpose, duplicated textual alternatives, or no human decision. |
| Text color contrast | `color-contrast` | MANUAL_REVIEW | **No automatic transformation in the MVP.** Show foreground/background evidence from axe, mapped source when available, and focus the rendered text/CSS editor. | Agent may flag and explain it, but must ask for design review. | User edits CSS manually and rescans; only axe can mark the original failure absent. | Always refuse automatic repair: cascade, transparency, states, design tokens, and brand constraints make a deterministic deadline-safe patch implausible. |

The implementation order was deliberately asymmetric; the current source now ships all five bounded families:

- **Core families:** missing form label, positive tabindex, and image alternative.
- **Completed contextual extensions:** button accessible name and document language. Both retain human-confirmed values and exact visible approval.
- **Manual evidence only:** color contrast. It has no automatic transformation.

Product coherence and WebMCP eval quality still take priority over adding any sixth repair family.

## 9. Remediation proposal model

A proposal is immutable and contains:

- proposal ID and status;
- issue ID, scan ID, and source revision;
- affected internal node ID and source range;
- original HTML/CSS snapshot hashes;
- ordered proposed text edits with before text, replacement text, and offsets;
- generated preview HTML/CSS;
- source diff;
- rationale and expected axe validation;
- classification;
- `semanticJudgmentRequired` and the human-provided values used;
- approval actor and timestamp, if approved.

Contextual lifecycle:

`PROPOSED → APPROVED → APPLIED`

or

`PROPOSED → REJECTED`

Mechanical lifecycle:

`PROPOSED → APPLIED`

or

`PROPOSED → REJECTED`

Every Apply uses the exact current proposal ID, diff hash, source revision, and successful proposed-render state. Contextual application additionally requires visible UI approval. Any source edit invalidates the proposal.

Applying creates one exact before/after history record. Undo restores the complete before snapshot, because reconstructing reverse edits after later changes risks data loss.

## 10. Human and agent authority

### Agent may act without approval

- Read workspace state and factual metrics.
- Run or rerun axe.
- List and inspect issues.
- Focus an issue in source and preview.
- Generate one remediation preview using validated inputs.
- Apply one exact current **MECHANICAL** proposal after its diff is visible and its exact proposed rendering is `READY`.
- Reject its own pending proposal.
- Undo the latest eligible remediation only when the user's current request explicitly asks to undo; no extra UI confirmation is required because the action restores an exact snapshot and immediately becomes visible/stale-for-rescan.
- Read change summaries.
- Initiate an export of the current source.

### Agent may not act without a visible human decision

- Apply a **CONTEXTUAL** source change without exact visible human approval.
- Choose alternative text, a button name, visible label text, or document language.
- Decide that an image is decorative.
- Apply a visual contrast change.
- Overwrite manual edits while undoing.
- Initiate an undo speculatively when the user did not request it.
- Claim compliance or dismiss manual review.

The agent can recommend or safely extract a candidate phrase, but the human must confirm it in the proposal UI. Contextual approval is tied to the exact diff; revising any value clears approval.

## 11. WebMCP product surface

The MVP exposes ten tools, all backed by the same React store and visible state machine:

1. `get_workspace`
2. `scan_accessibility`
3. `list_issues`
4. `inspect_issue`
5. `preview_remediation`
6. `apply_remediation`
7. `reject_remediation`
8. `undo_remediation`
9. `get_change_summary`
10. `export_source`

There is no separate `rescan_accessibility`; it would duplicate `scan_accessibility`. The scan tool accepts an explicit reason and works before or after changes.

The tools do not expose arbitrary JavaScript, DOM mutation, HTML rewriting, shell access, or network access. Tool outputs containing source-derived targets, snippets, labels, or diffs are marked as untrusted content. Read-only annotations reflect actual UI side effects: inspecting an issue changes focus and therefore is not marked read-only.

Exact schemas, state gates, annotations, errors, and side effects are defined in `IMPLEMENTATION_PLAN.md`.

## 12. Agent action timeline

Keep the latest 100 local events. Each event contains:

- event ID and timestamp;
- tool name or human action;
- bounded input summary with source-derived text omitted;
- result summary and error code, if any;
- issue/proposal/change ID;
- source revision;
- approval status and actor.

Examples: “Agent inspected `label` issue,” “Proposal P3 created; judgment required,” “Human approved P3,” “Agent applied P3,” “Rescan verified change C2.”

Clicking a current-revision event selects the issue, source range, and preview node. Clicking an old-revision event opens the change summary without attempting a stale highlight. Timeline data is local, bounded, and not positioned as a formal audit record.

## 13. Built-in checkout fixture

The demo is a polished, compact checkout page: order summary, product thumbnail, email field, shipping/payment controls, icon-only remove action, and Continue button. It uses static HTML/CSS only and no network assets.

Frozen seeded axe-core 4.13.0 findings:

| Rule | Nodes | Intended impact | Product treatment |
|---|---:|---|---|
| `html-has-lang` | 1 | serious | Contextual language proposal |
| `label` | 1 | critical | Contextual visible-label proposal |
| `button-name` | 1 | critical | Contextual accessible-name proposal |
| `image-alt` | 1 | critical | Contextual decorative/meaningful decision |
| `color-contrast` | 1 | serious | Manual review; no automatic patch |
| `tabindex` | 1 | serious | Mechanical exact-attribute removal |

Frozen result: exactly six distinct violations and six critical/serious affected nodes—3 critical and 3 serious—with five repairable families and one explicit contrast manual review.

These results are enforced by real Chromium tests against the pinned axe version, including exact rule IDs, impacts, and affected-node counts. If axe reports an incidental finding, fix the fixture; do not weaken the assertion to accept noise.

The fixture intentionally seeds positive `tabindex` so the demo includes one exact mechanical repair alongside the four contextual families.

## 14. Local-first behavior

The complete MVP remains browser-only and statically deployed:

- no backend, account, database, telemetry, or server-side source processing;
- source, scan results, proposals, and history stay in the page process;
- one versioned, debounced `localStorage` snapshot persists current HTML/CSS and small UI preferences;
- no IndexedDB—the data volume and single-workspace model do not justify it;
- applied-change undo history may remain in memory for the MVP; reloading preserves current source but not an unlimited edit log;
- exports use native `Blob` and object URLs;
- network-loaded images, styles, fonts, embeds, and scripts are stripped or blocked in preview.

The UI must say that local browser persistence is convenience storage, not a backup.

## 15. UI quality and accessibility

Visual direction: restrained developer tool, neutral slate surfaces, one blue action color, semantic red/amber/green used with text and icons, compact monospace source/diffs, and a readable sans-serif UI font from the system stack.

Required quality:

- no gradients, neon, decorative AI styling, excessive cards, or chat panel;
- clear pane headings and one dominant action per state;
- diff additions/removals distinguished by symbols and text, not color alone;
- keyboard access to every command, pane, filter, issue, proposal control, and timeline event;
- visible focus, skip links, landmarks, logical tab order, and focus restoration after dialogs/panel changes;
- polite live announcements for scan/proposal/apply/verification, with errors assertive only when necessary;
- sufficient text, control, focus, and non-text contrast;
- reduced-motion support; no essential animated transitions;
- rendered target highlights use outline plus a labeled badge and do not alter layout;
- Curbcut itself is tested with axe and keyboard/manual checks.

## 16. Demo storyboard — under three minutes

Primary prompt:

> Fix the critical and serious accessibility issues in this checkout without changing the overall visual design. Preview each change before applying it, and ask me about anything that requires semantic judgment.

Storyboard:

1. **0:00–0:15 — Working transformation.** Cold-open on the exact positive-`tabindex` diff. After the proposed iframe reports `READY`, the browser agent applies that visible mechanical proposal without redundant semantic approval and source changes on screen.
2. **0:15–0:45 — Live evidence.** Reset, run the real baseline scan, inspect the same node, and show source focus, preview highlight, and proposal synchronization.
3. **0:45–1:10 — Mechanical Apply and verify.** Agent applies the exact proposal and rescans. The `tabindex` finding disappears; source revision, verified change, and timeline update together.
4. **1:10–1:50 — Semantic boundary.** Agent inspects `label` or `image-alt`. A safe label candidate may be offered, but the human confirms meaning and approves the exact contextual diff before Apply.
5. **1:50–2:25 — Manual boundary.** Contrast remains visibly marked manual review; the agent does not invent a design change.
6. **2:25–2:50 — Reversibility and output.** Show change summary, undo one change and rescan to prove restoration, then reapply if time permits and export current source.
7. **2:50–3:00 — Proof.** Point to the real WebMCP timeline, fewer factual axe findings, remaining human review, and local-only status.

The demo must never imply that the remaining findings are safe to ignore or that the page is compliant.

## 17. Competitive position

- **axe DevTools** provides mature browser, editor, test, and organizational accessibility workflows. Curbcut is narrower: a local editable artifact, source-range surgical diffs, and an external browser agent operating the same visible approval loop. See [Deque's Axe DevTools overview](https://docs.deque.com/devtools-for-web/en/).
- **axe MCP Server** brings `analyze` and AI-assisted `remediate` capabilities to IDE and coding-agent workflows. Curbcut does not try to replace it. Curbcut explores a different boundary: WebMCP tools exposed by the workbench page itself, where the human, rendered artifact, source, evidence, and browser agent share one live state machine. See [Deque's official axe MCP Server](https://github.com/dequelabs/axe-mcp-server-public).
- **Generic coding-agent fixes** primarily operate in repository files and development tooling. Curbcut makes the rendered proposed result and calibrated mechanical/contextual authority first-class before a source mutation.
- **Accessibility overlays** alter runtime behavior on an existing site. Curbcut edits developer-owned source, shows the diff, and exports it; it is not installed on production pages.
- **Automated compliance scanners** detect and report. Curbcut adds a deliberately constrained preview/authority/verification loop and explicitly preserves manual review.

The claim is not that these categories lack repair features. The distinct experiment is browser-native shared remediation through WebMCP.

## 18. Hackathon rubric strategy

### WebMCP Leverage

Why it can score highly: ten narrow tools span discovery, evidence, proposal, classification-aware mutation, verification, reversal, summary, and export. Tool calls operate the exact React state visible to the user, use current annotations, and are tested as multi-step journeys.

Evidence: live HTTPS tool discovery; action timeline; synchronized source/preview/evidence changes; direct mechanical Apply; contextual approval blocking Apply; browser eval results.

Point-loss risk: flaky registration, ambiguous schemas, a demo that uses only one tool, or approval happening off-camera.

### Execution

Why it can score highly: one coherent end-to-end workspace, parser-backed mapping, isolated preview, five fully bounded and tested patch families, exact undo, deterministic fixture, and calibrated authority. The current source is durably deployed and has passed both automated and production target-client gates.

Evidence: a new source revision, a verified rule disappearance, an undo that restores the exact source and finding, and export without metadata.

Point-loss risk: spending time on editor polish while security/mapping/repair loops remain incomplete.

### Potential Impact

Why it can score highly: it addresses a real developer handoff—turning rendered automated evidence into reviewable source changes—while keeping private source local and semantic decisions human-owned.

Evidence: arbitrary pasted static HTML/CSS, exact locations/diffs, manual-review states, and a credible non-demo workflow.

Point-loss risk: appearing fixture-only, hiding limitations, or presenting automated findings as compliance.

### Creativity & Ambition

Why it can score highly: the browser page becomes the agent's accessibility workbench through WebMCP, not merely a passive scan target or chat response.

Evidence: shared state machine, proposed visual realm, approval gate, and timeline connecting tool actions to rendered/source evidence.

Point-loss risk: looking like an axe results viewer with two decorative WebMCP commands.

## 19. Ruthless scope

### MUST SHIP

- One static workspace with HTML/CSS source, safe preview, evidence, and agent timeline.
- Built-in deterministic fixture and reset.
- parse-backed source ranges and preview-only node IDs.
- axe 4.13.0 scan, inspection, highlight, factual metrics, and manual-review surfacing.
- Five shipped surgical proposal families: label, positive tabindex, image alternative, button accessible name, and document language.
- Color-contrast evidence with explicit manual repair only.
- Classification-aware proposed/approved/applied/rejected lifecycle, visual proposed preview, exact last-change undo, rescan verification, and export.
- The ten WebMCP tools and real browser-agent demo.
- Unit, security, regression, WebMCP, and Playwright journey tests.
- Accessible, durable HTTPS deployment and completed submission evidence.
- A deployed M2 WebMCP vertical slice where `scan_accessibility`, `list_issues`, and `inspect_issue` exercise the real sandbox/store/mapping/highlight path.

### NICE TO HAVE

- CodeMirror, resizable panes, keyboard shortcut overlay.
- Persisted undo history or workspace re-import.
- Side-by-side visual screenshots.
- Advanced issue filtering and sorting.
- Dynamic WebMCP tool exposure by state.
- More than one demo fixture.
- Additional remediation families beyond the shipped five.

### CUT

- Backend, auth, database, analytics, cloud sync, collaboration, and enterprise audit logs.
- GitHub, repositories, frameworks, builds, multiple files/projects, and source-control patches.
- Arbitrary URL scanning/import, JavaScript, scripts, embeds, remote assets, and networked preview content.
- Built-in chat, LLM source rewriting, autonomous batch apply, scores, or compliance claims.
- Automatic contrast repair.
- General AST pretty-printing or source identity reconciliation across arbitrary manual edits.
- Additional remediation families unless every MUST item is verified and deployed.

## 20. Final red-team review and changes adopted

### Accessibility engineer

Attack: deterministic patches can still create wrong semantics; a clean axe result can mislead.  
Plan change: all mutations require an exact visible proposal; contextual families require human values and approval, `incomplete` becomes manual review, and the UI forbids compliance language.

### Browser standards engineer

Attack: `srcdoc` with same-origin/script privileges is not a credible untrusted boundary, and mapping browser DOM back to parser offsets is fragile.  
Plan change: opaque-origin `sandbox="allow-scripts"`, strict CSP/sanitization, an in-frame axe bridge, parser-backed preview IDs, revision invalidation, and no same-origin parent DOM access.

### WebMCP judge

Attack: ten tools could be verbose wrappers around buttons, and the agent could get stuck in state errors.  
Plan change: each tool exposes structured state, bounded results, and `allowedNextActions`; schemas and multi-step evals are a milestone, not submission cleanup. One redundant rescan tool is removed.

### Frontend developer

Attack: serialized AST output and broad rewrites would destroy formatting; a demo-only fixture would not prove practical value.  
Plan change: raw source remains canonical, edits operate on exact offsets, unrelated text is byte-preserved, and users can paste arbitrary static HTML/CSS within the declared security subset.

### Security engineer

Attack: sanitizing HTML alone does not secure CSS or network leaks; wildcard `postMessage` can be spoofed.  
Plan change: user CSS enters only as style text in the trusted frame controller, CSP blocks all network classes, external URLs are stripped, and every message validates `event.source`, a random channel token, direction, type, and payload schema.

### Competing entrant

Attack: an accessibility workbench is not new; a polished competitor could look more complete.  
Plan change: demo time prioritizes useful WebMCP autonomy, exact source/render synchronization, contextual approval gating, semantic refusal, undo, and verification—not breadth or branding.

### Five largest top-10 risks after mitigation

1. Current experimental WebMCP behavior differs between the final judging client and tested Chrome/in-app browser.
2. Opaque iframe messaging and in-realm axe execution become flaky under deployment CSP or browser timing.
3. Source mapping fails on browser/parser tree-construction edge cases, making a highlighted axe node non-repairable.
4. Final five-family schema, documentation, deployment, or media drifts from the frozen source.
5. Judges perceive the product as an axe wrapper because the shared live workspace and human authority boundary are not demonstrated quickly enough.

Recommendation: **MODIFY, then proceed**—commit to the product, but cut automatic contrast repair, cross-edit node reconciliation, dynamic tool exposure, and editor/framework ambitions now. The resulting MVP is ambitious where the hackathon rewards it and conservative at security and semantic boundaries.

### Hard milestone gates

M1 must pass before any M2 work begins:

- HTML without existing IDs maps surviving preview elements to exact parse5 ranges.
- Duplicate or missing user IDs do not affect internal mapping.
- mapping metadata exists only in generated preview output;
- canonical source and exports contain no Curbcut mapping metadata;
- raw-offset edits preserve every unrelated byte;
- the complete source-mapping test matrix and production Vite build pass;
- the M1 artifact is available on an authenticated persistent Vercel project and smoke tested over HTTPS.

M2 must pass before repair-engine work begins:

- opaque iframe isolation;
- in-frame axe execution;
- validated `postMessage` bridge;
- CSP plus network/script isolation;
- real axe results mapped back to source;
- deployed `scan_accessibility`, `list_issues`, and `inspect_issue` calls that visibly select source and highlight preview.

## 21. Product acceptance

The MVP is done only when a fresh deployed session can:

1. load and safely render the fixture;
2. run the pinned axe scan and match frozen expected findings;
3. select a finding and synchronize evidence, preview highlight, and exact source range;
4. create a surgical proposal without changing working source;
5. render the proposed result;
6. expose whether the exact proposal is mechanical or requires contextual approval;
7. after its exact proposed rendering is `READY`, apply a mechanical proposal directly or a contextual proposal only after approval;
8. rescan and verify the original node/rule no longer fails;
9. undo and prove exact source and finding restoration;
10. export clean source without mapping metadata;
11. complete the primary multi-tool browser-agent prompt on the supported client;
12. keep Curbcut itself keyboard-usable and free of known critical/serious axe violations.

Release evidence recorded August 28, 2026: 85/85 Vitest checks across eight files, 25/25 Playwright checks, 36 validated WebMCP trajectory cases across twelve intents and ten tools, a 72-run OpenAI model evaluation with 214/253 strict passing rows (84.6%), 59/72 exact trajectories, 69/72 operationally correct trajectories, and zero infrastructure errors, a complete native-Chrome production ten-tool journey with reload rediscovery and zero console errors, and a Codex in-app browser production scan/high-impact-list/inspect journey with exact source mapping, preview highlight, timeline activity, and zero console errors. Production CSP, `Permissions-Policy: tools=(self)`, Origin-Agent-Cluster, no-referrer, nosniff, and HSTS headers also passed. The Impeccable visual reviewer returned **SHIP** and the release code audit returned **CLEAR**.

The model eval's three genuine misses were two malformed copied issue IDs and one wrong rejection reason; no approval boundary was bypassed. OpenAI remains an evaluation-only dependency and the key was never stored. Known non-blockers are the Vite bundle warning (about 307.06 KB gzip, dominated by axe-core) and bounded scan responses: when a security cap is reached, counts are explicitly lower bounds and verification is reported as inconclusive rather than as a false pass.

# Curbcut — Implementation Plan

Status: M1–M7 and the M8 production release gate are complete; owner video and Devpost submission remain pending
Baseline: the successful Spike A and Spike B code in this repository  
Target: production release candidate `b92ba81` deployed and verified at <https://curbcut-one.vercel.app>; submit before September 3, 2026 at 1:00 PM PT

## 1. Technical baseline and governing references

Keep the existing React 19, TypeScript, Vite, Vitest, axe-core, and external-store approach. Pin all versions used in the final fixture regression. The current spike uses axe-core 4.13.0 and `webmcp-types` 0.1.5.

WebMCP implementation target:

- `document.modelContext.registerTool()` from Chrome's WebMCP Imperative API.
- Chrome documentation published May 18, 2026 and updated August 20, 2026, retrieved August 26, 2026.
- Stable, same-origin top-document registration with `AbortSignal` cleanup; no cross-origin exposure.
- Recorded release clients: Codex in-app browser on August 28, 2026 and native Chrome through Chrome DevTools MCP 1.8. Do not advertise an untested minimum Chrome version.

Primary references:

- [Chrome WebMCP Imperative API](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome WebMCP tool security](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [Chrome WebMCP eval guidance](https://developer.chrome.com/docs/ai/webmcp/evals)
- [axe-core API](https://github.com/dequelabs/axe-core/blob/develop/doc/API.md)
- [MDN iframe sandbox reference](https://developer.mozilla.org/en-US/docs/Web/HTML/Reference/Elements/iframe)
- [DOMPurify security goals](https://github.com/cure53/DOMPurify/wiki/Security-Goals-&-Threat-Model)

Chrome currently recommends concise descriptions and outputs: 500 characters per tool description, 150 per parameter description, 30 per tool/parameter name, and about 1.5K characters per output. Treat those as build-time assertions because the guidance may change.

## 2. Architecture

One React application, one store, one untrusted preview frame:

```text
HTML/CSS strings
      │
      ▼
parse5 AST + source ranges ──► internal node map
      │                              │
      ▼                              │
preview-only ID injection            │
      │                              │
strict HTML sanitization             │
      │                              │
      ▼                              │
opaque sandbox iframe ◄── postMessage bridge
  trusted controller + axe 4.13.0
      │
      ▼
serialized axe nodes with internal IDs
      │
      └──────── map to source ranges ──► normalized issues
                                              │
React workspace store ◄── UI controls / WebMCP tools
      │
      ├── immutable proposal + proposed preview
      ├── exact before/after history
      └── local export/persistence
```

### Minimal code boundaries

Do not introduce a framework or service layer. The implementation needs only these responsibilities, which may be combined if files remain small:

- `workspaceStore`: canonical source, revisions, render/scan/proposal/history states, commands, and subscriptions.
- `sourceMap`: parse5 traversal, node IDs, source locations, line/column conversion, and preview-only insertion patches.
- `previewSecurity`: DOMPurify policy, CSP/shell creation, URL stripping, and message schema validation.
- `previewBridge`: iframe lifecycle and request/response correlation.
- `axeAdapter`: in-frame axe call and normalized results.
- `repairs`: one dispatcher and five small deterministic patch functions.
- `webmcp`: schemas, registration, bounded serialization, and command dispatch.
- React workspace/panes using the same command methods.

No generic command bus, dependency injection, plugin system, repair registry abstraction, or persistence repository is justified for five known transformations.

## 3. Workspace state machine

Use orthogonal state fields instead of one combinatorial enum:

```ts
type WorkspaceStatus = 'EMPTY' | 'READY' | 'ERROR';
type PreviewStatus = 'IDLE' | 'RENDERING' | 'READY' | 'ERROR';
type ScanStatus = 'NEVER' | 'RUNNING' | 'CURRENT' | 'STALE' | 'ERROR';
type ProposalStatus = 'NONE' | 'PROPOSED' | 'APPROVED' | 'REJECTED' | 'APPLIED';
```

Core invariants:

- `sourceRevision` increases on manual edit, Apply, Undo, demo load, and reset.
- A current scan must match `scan.sourceRevision === sourceRevision`.
- A proposal must match both current source revision and current scan ID.
- Approval binds proposal ID, diff hash, and source revision.
- Apply is atomic: validate again, commit both source strings, create history, increase revision, then rerender.
- Undo is permitted only for the latest change and only if current source hashes equal its after hashes.
- A render or scan response with an old request ID/revision is discarded.
- Tools and UI call the same store commands; neither manipulates DOM or state privately.

State transitions return a typed result rather than throw expected errors. Unexpected exceptions become `INTERNAL_ERROR`, are logged in development, and do not mutate source.

## 4. Source parser and mapping design

### Options researched

| Option | Strength | Weakness for Curbcut | Decision |
|---|---|---|---|
| [parse5 8.0.1](https://parse5.js.org/) | WHATWG-compatible tree construction; browser-like parsing; `sourceCodeLocationInfo`; element/start-tag/end-tag and per-attribute offsets. ESM package with only `entities` as a runtime dependency. | Not an incremental editor parser; implicit nodes have no source location; source serialization would reformat input. | **Choose.** Best match for browser DOM semantics and exact offset patches. Never use its serializer for canonical source. |
| [htmlparser2 12.0.0](https://github.com/fb55/htmlparser2) | Fast, forgiving, start/end indices. | Deliberately takes parsing shortcuts; its own documentation points strict HTML compliance users toward parse5. Greater risk that its tree differs from the browser/axe target. | Reject. Speed is not the limiting factor for one component. |
| [@lezer/html 1.3.13](https://github.com/lezer-parser/html) | Incremental syntax tree and ranges; well suited to CodeMirror. | Editor-oriented syntax recovery is not the browser's HTML5 tree-construction model; would still need a second mapping step to rendered DOM. | Reject for mapping. Reconsider only if CodeMirror becomes necessary after MVP. |
| Native `DOMParser` | No dependency and matches the browser DOM reasonably well. | Does not preserve source offsets or per-attribute ranges. | Keep only for small validation helpers, not canonical mapping. |

### Selected mapping algorithm

1. Parse the canonical HTML string with `parse5.parse(source, { sourceCodeLocationInfo: true })`.
2. Traverse source-backed elements in document order. Skip comments/text for axe target mapping, but retain their offsets when an insertion depends on surrounding text.
3. Assign an opaque ID such as `n-<revision>-<ordinal>`. The map—not the ID syntax—is authoritative:

   ```ts
   type SourceNode = {
     nodeId: string;
     tagName: string;
     range: { start: number; end: number };
     startTag: { start: number; end: number };
     endTag?: { start: number; end: number };
     attrs: Record<string, { start: number; end: number }>;
   };
   ```

4. Create one insertion edit per start tag: insert ` data-curbcut-node="n-…"` immediately before its closing `>` or `/>`.
5. Apply insertions from highest offset to lowest so earlier offsets remain valid.
6. Sanitize the marked HTML. Configure DOMPurify to retain only `data-curbcut-node` from data attributes.
7. In the iframe, preserve the ID on each surviving element. axe output includes either the attribute or a direct controller lookup of the closest marked target.
8. Resolve axe nodes by ID to `SourceNode`, then compute one-based line/column positions from a cached newline-offset array.
9. If sanitization removes or reparents a node so it has no valid mapping, report the finding as unmapped/manual review and do not offer a repair.

The `<html>` element needs special handling because the trusted iframe shell owns its document element. Copy only validated `lang` and `dir` plus its internal mapping ID to the iframe's real `documentElement`; place sanitized body content under the trusted preview root. This lets `html-has-lang` map to the source `<html>` while keeping the shell in control.

### Edit fidelity

Repairs operate on raw offsets, not AST serialization:

- Represent a patch as `{start, end, replacement, expectedText}`.
- Validate non-overlap, bounds, and exact `expectedText` before preview and again before Apply.
- Apply patches in descending offset order.
- Diff the original and patched raw strings.
- Reparse proposed source and require the target transformation to exist before rendering it.
- Invalidate all patches after any source revision change.

This preserves whitespace, comments, attribute order, quote style outside the changed range, and all unrelated text byte-for-byte.

### Mapping tests that gate M1

- nested and repeated same-tag elements receive distinct maps;
- elements without HTML IDs map correctly;
- duplicate user IDs do not affect internal IDs;
- quoted `>` characters inside attributes do not break insertion offsets;
- void/self-closing syntax maps correctly;
- Unicode and CRLF line/column conversion is correct;
- implicit `html/head/body/tbody` nodes are safely non-source-backed;
- malformed but browser-parseable HTML maps to the same intended elements in Chromium;
- no `data-curbcut-node` string appears in canonical/exported source.

## 5. Preview security boundary

### Threat model

Treat HTML and CSS as attacker-controlled. It may attempt script execution, event handlers, same-origin access, form submission, navigation, resource exfiltration, prompt injection in WebMCP output, DOM clobbering, or parser confusion.

The MVP intentionally does not promise safe JavaScript execution. It removes executable/user-controlled browsing capabilities before render and blocks the rest at the iframe/CSP boundary.

### Iframe

Use:

```html
<iframe sandbox="allow-scripts" title="Component preview"></iframe>
```

Do not add `allow-same-origin`, `allow-forms`, `allow-popups`, `allow-downloads`, top-navigation flags, or a WebMCP `tools` permission. MDN specifically warns against combining scripts and same-origin for same-origin frames because sandbox restrictions can be removed. The opaque origin also prevents parent DOM access; that is intentional.

### Trusted `srcdoc` shell

The parent constructs a constant shell containing:

- a restrictive CSP meta element with a per-frame cryptographic nonce;
- the pinned, locally bundled axe source in a nonce-bearing trusted script;
- a small nonce-bearing controller script;
- a nonce-bearing empty style element for user CSS text;
- an empty preview root.

User HTML and CSS are never interpolated into the `srcdoc` string.

Proposed CSP:

```text
default-src 'none';
script-src 'nonce-<random>';
style-src 'nonce-<random>';
img-src data: blob:;
font-src 'none';
connect-src 'none';
media-src 'none';
frame-src 'none';
object-src 'none';
base-uri 'none';
form-action 'none';
```

Do not allow remote images in the MVP. Data images may be capped by source size; built-in fixture assets should be inline data or CSS shapes.

### HTML sanitization

Add and pin DOMPurify 3.4.14. Use an explicit HTML-only profile and a narrow allowlist. At minimum:

- forbid `script`, `style`, `link`, `base`, `meta`, `iframe`, `frame`, `object`, `embed`, `template`, `noscript`, SVG, MathML, and custom elements;
- forbid event handlers, `style`, `srcdoc`, `formaction`, navigation targets, and all unknown attributes;
- remove URL-bearing attributes except data-image `img[src]` after explicit scheme/MIME validation;
- keep ordinary semantic/form/ARIA attributes required for accessibility scanning;
- set `ALLOW_DATA_ATTR: false`, then explicitly add only `data-curbcut-node`;
- retain DOMPurify's DOM-clobbering protections.

Do not enable a mode that rewrites every user `id`/`name`, because it would break label `for` relationships and make preview evidence false. Instead, keep default clobbering protection, never use user-named document globals, and test the exact allowlist against clobbering payloads.

DOMPurify is not a CSS sanitizer and does not prevent network leaks by itself. The iframe origin, CSP, URL removal, and controller-owned style insertion provide the remaining boundary.

### CSS handling

Send CSS as a string in a validated message. The trusted controller sets `styleElement.textContent = css`; it never concatenates it into HTML. CSP permits only the nonce-bearing style element and blocks CSS network requests through `default-src`, `font-src`, and `img-src`. CSS may visually distort content inside the frame, which is the artifact being reviewed, but it cannot select or affect the parent document.

### Message bridge and axe

Because an opaque-origin `srcdoc` has origin `null`, use `postMessage(..., '*')` but accept messages only when all checks pass:

- `event.source === iframe.contentWindow` in the parent;
- random 128-bit channel token matches;
- direction and message type are in a closed union;
- payload passes a handwritten narrow validator;
- request ID is pending and source revision matches;
- bounded HTML/CSS/output sizes are respected.

Parent-to-frame commands: `RENDER`, `SCAN`, `HIGHLIGHT`, `CLEAR_HIGHLIGHT`.  
Frame-to-parent messages: `READY`, `RENDERED`, `SCAN_RESULT`, `HIGHLIGHTED`, `ERROR`.

The trusted controller runs `axe.run(document)` inside the iframe—the cross-realm technique proven by Spike B—and serializes only required fields plus internal node IDs. It never evaluates input, invokes user callbacks, or exposes a generic command.

### Security acceptance tests

Assert that fixtures containing scripts, event handlers, `javascript:` URLs, remote images/styles/fonts, forms, iframes, embeds, SVG scripts, CSS `url()`, `@import`, clobbering names, `</style>`, and forged bridge messages cannot execute, navigate, submit, fetch, or affect the parent. Run tests in deployed Chromium as well as unit tests because jsdom cannot prove iframe isolation or CSP.

## 6. Accessibility adapter and issue model

Pin axe-core 4.13.0 and run one consistent ruleset/configuration. Do not disable rules merely to match the fixture.

Normalize both `violations` and `incomplete`:

```ts
type Issue = {
  issueId: string;
  scanId: string;
  sourceRevision: number;
  resultKind: 'violation' | 'incomplete';
  ruleId: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor' | null;
  help: string;
  helpUrl: string;
  tags: string[];
  target: string[];
  htmlSnippet: string;
  nodeId?: string;
  sourceNode?: SourceNode;
  classification: 'MECHANICAL' | 'CONTEXTUAL' | 'MANUAL_REVIEW';
  classificationReason: string;
};
```

Flatten axe nodes so each affected node is one issue. Generate `issueId` from scan ID, rule ID, internal node ID, and node index. HTML snippets and target strings are untrusted and always escaped in UI/marked untrusted in tool outputs.

Factual metrics are computed from normalized data as specified in the product requirements. WCAG references come only from axe tags/help URLs. Do not infer a conformance level.

Classification is an explicit switch on supported rule/family plus mapping/evidence predicates. Unknown rules and all `incomplete` nodes default to `MANUAL_REVIEW`.

## 7. Repair engine details

One function dispatches by family; each transformer returns either a validated patch set or a refusal code. No general rewrite API exists.

### Missing form label — `label`

- Evidence: source-backed `input`, `select`, or `textarea` failed `label` and lacks an accepted accessible-name mechanism.
- Input: `labelText`, trimmed, 1–120 visible characters.
- Candidate: reuse a single safe adjacent visible-text source node when deterministic; present it as context, never as semantic approval.
- Transformation:
  - With a safe adjacent text node, reuse its unique literal ID or add a collision-free `curbcut-label-N` ID, then add `aria-labelledby` to the control. Do not duplicate or change visible text.
  - Without a safe adjacent candidate, use the human-provided wording to insert a visible `<label for="…">`; reuse a unique control ID or add a collision-free one.
- Preview validation: reparse; the exact `aria-labelledby` or label `for` association resolves uniquely; canonical working source remains unchanged.
- Refusal: duplicate/nonliteral ID, pre-existing complex labeling, custom element, unmapped location, or ambiguous placement.
- Priority: **Tier A; guaranteed, polished, and fully tested.**

### Native button accessible name — `button-name`

- Evidence: mapped native `<button>` failed `button-name`.
- Input: `buttonName`, 1–120 visible characters without edge whitespace.
- Transformation: insert `aria-label="escaped value"` before the close of the start tag while preserving existing quote/spacing style where practical.
- Preview validation: exactly one `aria-label` with the approved value; no duplicate accessible-name attributes.
- Refusal: non-button role/custom widget, existing `aria-label`/`aria-labelledby`, template syntax, complex semantics, or unclear purpose.
- Status: **shipped contextual family**, with human-confirmed input, refusal paths, Apply/rescan, and Undo coverage.

### Document language — `html-has-lang`

- Evidence: source-backed `<html>` failed `html-has-lang` and has no `lang`.
- Input: `languageTag`; 1–35 characters, conservative BCP 47 syntax, and canonicalization through `Intl.getCanonicalLocales`.
- Transformation: insert `lang="escaped value"` into `<html>` start tag.
- Preview validation: the controller copies it to the real iframe document element and axe no longer returns `html-has-lang`.
- Refusal: fragment/no source `<html>`, existing invalid language (out of family), or mixed-language remediation.
- Status: **shipped contextual family**, with human-confirmed input, refusal paths, and Apply/rescan coverage.

### Positive tabindex — `tabindex`

- Evidence: mapped element failed `tabindex`; exact `tabindex` attribute range contains a literal integer greater than zero.
- Input: none.
- Transformation: remove the attribute plus at most its leading horizontal whitespace; never collapse other whitespace.
- Preview validation: no positive `tabindex` on the mapped node and source diff contains one deletion.
- Refusal: template/expression, composite widget pattern, coupled positive-tabindex sequence, or attribute range unavailable.
- Priority: **Tier A; guaranteed, polished, and fully tested.**

### Image alternative — `image-alt`

- Evidence: mapped native `<img>` failed `image-alt`.
- Input: `altMode` (`meaningful` or `decorative`) and, for meaningful, `altText` trimmed to 1–160 characters.
- Transformation: insert or replace exactly the `alt` attribute. Decorative produces `alt=""`.
- Preview validation: exact value exists; axe no longer reports `image-alt` for the node.
- Refusal: chart/diagram indicators, image map, input image, SVG, conflicting ARIA, uncertain image purpose, or missing human decision.
- Priority: **Tier A; guaranteed, polished, and fully tested.**

### Contrast — `color-contrast`

No transformer. Inspection shows axe data, rendered target, and source/CSS context when mapped. The issue remains `MANUAL_REVIEW` until the user edits CSS and rescans. Cut automatic contrast fixing for this submission.

### Common patch safety

- Escape attribute/text content with two tiny context-specific helpers; do not reuse HTML text escaping for attributes.
- Reject NUL/control characters and size-limit human inputs.
- Verify `expectedText` before applying.
- Reparse and rerender the proposal; never claim preview success if either fails.
- On Apply, rerun every validation against the current revision and proposal hash.

## 8. Proposal, authority, history, and export

### Proposal record

Store the fields specified in `PRODUCT_REQUIREMENTS.md`. Generate the diff locally from raw before/after strings. One pending proposal at a time is enough for the MVP; a second preview request returns `PROPOSAL_EXISTS`.

### Conditional approval

For contextual work, the proposal panel owns a button labeled with the concrete action, for example “Approve adding visible label ‘Email address’.” Activating it records proposal ID, diff hash, timestamp, and actor `human`. Any edit to a semantic value generates a new proposal/diff and clears approval. Mechanical proposals omit this redundant step because they invent no meaning.

The UI offers **Apply now** for an exact mechanical proposal only after that proposal's iframe reports `READY`; contextual work additionally requires approval. UI and WebMCP paths call the same guarded command.

### History and undo

Keep up to 20 in-memory changes, each with exact before and after HTML/CSS strings and hashes, issue/proposal IDs, timestamps, and verification outcome. Only the most recent eligible change can be undone. No branching history or redo.

### Persistence

Persist one versioned object with current source and small preferences in `localStorage`, debounced after validated state commits. Do not persist raw axe snippets or tool outputs. On schema mismatch, preserve recoverable source strings and reset derived state.

### Export

Use native `Blob` downloads:

- `html` → `curbcut.html` containing canonical HTML only;
- `css` → `curbcut.css` containing canonical CSS only;
- `workspace` → `curbcut-workspace.json` with `{version, html, css}`.

Before export, assert no internal mapping attribute was added by Curbcut. Do not bundle ZIP support.

## 9. WebMCP implementation contract

### Registration

At application startup, feature-detect `document.modelContext`. Register all ten tools sequentially through one `AbortController`, following the successful spike. Keep them registered and let state guards reject invalid calls. On unmount, abort registration. Record registration errors visibly without breaking manual operation.

Do not use `usewebmcp` during the deadline unless the direct API fails; the spike already proved the imperative store bridge.

Every `execute(args, {signal})`:

1. validates input with the same runtime guard as the UI command;
2. checks cancellation before and after asynchronous render/scan work;
3. dispatches to the store;
4. records a bounded timeline event;
5. returns a JSON string under the current WebMCP imperative contract.

### Common output and error model

Success:

```json
{
  "ok": true,
  "data": {},
  "state": {
    "sourceRevision": 4,
    "scanStatus": "CURRENT",
    "proposalStatus": "NONE"
  },
  "allowedNextActions": ["inspect_issue", "preview_remediation"]
}
```

Expected failure:

```json
{
  "ok": false,
  "error": {
    "code": "APPROVAL_REQUIRED",
    "message": "Approve proposal p-3 in the visible Curbcut UI before applying it.",
    "recoverable": true,
    "requiredState": "APPROVED"
  },
  "allowedNextActions": ["inspect_issue"]
}
```

Allowed codes:

`UNSUPPORTED_BROWSER`, `INVALID_INPUT`, `WORKSPACE_EMPTY`, `PREVIEW_NOT_READY`, `SCAN_RUNNING`, `SCAN_REQUIRED`, `STALE_SCAN`, `ISSUE_NOT_FOUND`, `ISSUE_NOT_REPAIRABLE`, `INPUT_REQUIRED`, `PROPOSAL_EXISTS`, `PROPOSAL_NOT_FOUND`, `APPROVAL_REQUIRED`, `STALE_PROPOSAL`, `NOTHING_TO_UNDO`, `STALE_UNDO`, `EXPORT_FAILED`, `CANCELLED`, `INTERNAL_ERROR`.

Never include a stack, full source, or more than the minimum source-derived text. Enforce the current Chrome character budgets in tests.

### Tool contracts

All schemas include `additionalProperties: false`.

#### `get_workspace`

- Purpose: read current revision, preview/scan/proposal status, factual counts, selection, latest undoable change, and WebMCP availability.
- Input: `{"type":"object","properties":{},"additionalProperties":false}`
- Output `data`: `{workspaceStatus, previewStatus, scanStatus, sourceRevision, scanId?, counts?, selectedIssueId?, proposalId?, proposalStatus, proposalPreviewStatus, mutationStatus, latestChangeId?, canUndo, webMcpAvailable}`.
- Annotations: `{readOnlyHint:true, untrustedContentHint:false}`.
- Allowed: always.
- Invalid: none; `EMPTY` is successful state, not an error.
- UI side effect: timeline event only; no focus/state change.
- Approval: none.

#### `scan_accessibility`

- Purpose: render current working source, run axe, replace issue results atomically, and mark the scan current. This is also the rescan tool.
- Input:

  ```json
  {
    "type": "object",
    "properties": {
      "reason": {"type":"string","enum":["initial","after_change","manual"]}
    },
    "required": ["reason"],
    "additionalProperties": false
  }
  ```

- Output `data`: `{scanId, sourceRevision, ruleCount, affectedNodeCount, critical, serious, moderate, minor, manualReviewsOutstanding, verifiedChangeId?}`.
- Annotations: `{readOnlyHint:false, untrustedContentHint:false}` because scan results replace workspace state.
- Allowed: workspace ready, preview not errored, no scan running, no pending proposal.
- Invalid: empty, render not ready, running scan, or proposed/approved proposal.
- UI side effects: scanning state, evidence replacement, verification status, timeline.
- Errors: `WORKSPACE_EMPTY`, `PREVIEW_NOT_READY`, `SCAN_RUNNING`, `PROPOSAL_EXISTS`, `CANCELLED`, `INTERNAL_ERROR`.
- Approval: none.

#### `list_issues`

- Purpose: return bounded issue summaries from the current scan for tool selection.
- Input:

  ```json
  {
    "type":"object",
    "properties":{
      "impact":{"type":"string","enum":["critical","serious","moderate","minor","all"]},
      "classification":{"type":"string","enum":["MECHANICAL","CONTEXTUAL","MANUAL_REVIEW","all"]},
      "status":{"type":"string","enum":["open","verified","all"]},
      "limit":{"type":"integer","minimum":1,"maximum":10}
    },
    "additionalProperties":false
  }
  ```

- Output `data`: `{scanId, totalMatching, issues:[{issueId, ruleId, impact, classification, status, targetSummary, sourceLine?}]}`.
- Annotations: `{readOnlyHint:true, untrustedContentHint:true}` because target/source summaries derive from user content.
- Allowed: current scan.
- Invalid: never scanned or stale scan.
- UI side effect: timeline only.
- Errors: `SCAN_REQUIRED`, `STALE_SCAN`, `INVALID_INPUT`.
- Approval: none.

#### `inspect_issue`

- Purpose: select one current issue and synchronize evidence, source range, and rendered highlight.
- Input: `{"type":"object","properties":{"issueId":{"type":"string","minLength":1,"maxLength":180}},"required":["issueId"],"additionalProperties":false}`
- Output `data`: `{issueId, ruleId, impact, help, helpUrl, wcagTags, classification, classificationReason, target, sourceLocation?, repairFamily?, requiredInputs?}`. Relevant HTML is omitted if it would exceed the output budget; it remains visible in UI.
- Annotations: `{readOnlyHint:false, untrustedContentHint:true}` because it changes visible selection/focus and returns source-derived target data.
- Allowed: current scan and existing issue.
- Invalid: stale/missing scan or issue.
- UI side effects: opens issue detail, selects source range, highlights preview, records timeline.
- Errors: `SCAN_REQUIRED`, `STALE_SCAN`, `ISSUE_NOT_FOUND`, `PREVIEW_NOT_READY`.
- Approval: none.

#### `preview_remediation`

- Purpose: generate one validated surgical proposal and proposed rendering without mutating working source.
- Input:

  ```json
  {
    "type":"object",
    "properties":{
      "issueId":{"type":"string","minLength":1,"maxLength":180},
      "family":{"type":"string","enum":["add_form_label","remove_positive_tabindex","set_image_alt","name_button","set_document_language"]},
      "values":{
        "type":"object",
        "properties":{
          "labelText":{"type":"string","minLength":1,"maxLength":120},
          "buttonName":{"type":"string","minLength":1,"maxLength":120},
          "languageTag":{"type":"string","minLength":1,"maxLength":35},
          "altMode":{"type":"string","enum":["meaningful","decorative"]},
          "altText":{"type":"string","minLength":1,"maxLength":160}
        },
        "additionalProperties":false
      }
    },
    "required":["issueId","family"],
    "additionalProperties":false
  }
  ```

- Output `data`: `{proposalId, issueId, family, classification, semanticJudgmentRequired, editCount, diffSummary, validationTarget, approvalRequired, agentMayApply, approvalState, proposalPreviewStatus, next}`. `approvalRequired` is `false` only for exact mechanical proposals. `proposalPreviewStatus` initially reports `RENDERING`; the full diff remains visible in UI rather than being returned as source content.
- Annotations: `{readOnlyHint:false, untrustedContentHint:true}` because it creates visible proposal state and may return a source-derived diff summary.
- Allowed: current scan, repairable issue, no pending proposal, correct family, all required semantic inputs supplied.
- Invalid: stale scan, unsupported/manual-only issue, family mismatch, missing values, pending proposal.
- UI side effects: selects issue/source, creates proposal, opens evidence diff, switches preview to Proposed, records timeline.
- Errors: `SCAN_REQUIRED`, `STALE_SCAN`, `ISSUE_NOT_FOUND`, `ISSUE_NOT_REPAIRABLE`, `INPUT_REQUIRED`, `PROPOSAL_EXISTS`, `INVALID_INPUT`, `INTERNAL_ERROR`.
- Authority: after preview creation, poll `get_workspace` until the same proposal reports `proposalPreviewStatus:"READY"`. Only then may exact mechanical Apply become available; contextual Apply additionally requires exact visible UI approval.

#### `apply_remediation`

- Purpose: atomically apply one exact current mechanical proposal or one human-approved contextual proposal.
- Input: `{"type":"object","properties":{"proposalId":{"type":"string","minLength":1,"maxLength":180}},"required":["proposalId"],"additionalProperties":false}`
- Output `data`: `{changeId, proposalId, sourceRevision, scanStatus:"STALE", next:"scan_accessibility"}`.
- Annotations: `{readOnlyHint:false, untrustedContentHint:false}`; output contains IDs/state, not source.
- Allowed: the exact proposal preview is `READY`; an exact mechanical proposal is `PROPOSED`, or an exact contextual proposal is `APPROVED`; revision/diff hashes are current and no other mutation is active.
- Invalid: preview still rendering/failed, unapproved contextual, missing/rejected/applied/stale proposal, or another Apply/Undo is in progress.
- UI side effects: commits source, renders Working, marks scan stale, creates history/timeline entry, focuses Rescan.
- Errors: `PROPOSAL_NOT_FOUND`, `APPROVAL_REQUIRED`, `STALE_PROPOSAL`, `PREVIEW_NOT_READY`, `CHANGE_IN_PROGRESS`, `CANCELLED`, `INTERNAL_ERROR`.
- Approval: **required through visible UI for contextual work only**. The tool never creates or assumes semantic approval.

#### `reject_remediation`

- Purpose: reject the current proposal without changing source.
- Input:

  ```json
  {
    "type":"object",
    "properties":{
      "proposalId":{"type":"string","minLength":1,"maxLength":180},
      "reason":{"type":"string","enum":["not_correct","needs_revision","not_now"]}
    },
    "required":["proposalId","reason"],
    "additionalProperties":false
  }
  ```

- Output `data`: `{proposalId, status:"REJECTED", sourceChanged:false}`.
- Annotations: `{readOnlyHint:false, untrustedContentHint:false}`.
- Allowed: proposed or approved proposal matching current revision.
- Invalid: none, rejected, applied, or stale proposal.
- UI side effects: marks rejected, restores Working preview, retains issue selection, records timeline.
- Errors: `PROPOSAL_NOT_FOUND`, `STALE_PROPOSAL`, `INVALID_INPUT`.
- Approval: none.

#### `undo_remediation`

- Purpose: restore the exact before snapshot of the latest eligible applied change.
- Input: `{"type":"object","properties":{},"additionalProperties":false}`
- Output `data`: `{undoneChangeId, sourceRevision, scanStatus:"STALE", next:"scan_accessibility"}`.
- Annotations: `{readOnlyHint:false, untrustedContentHint:false}`.
- Allowed: history exists and current hashes match the latest after-state.
- Invalid: no history or intervening source edits.
- UI side effects: restores HTML/CSS, rerenders, marks scan stale, timeline entry, focuses Rescan.
- Errors: `NOTHING_TO_UNDO`, `STALE_UNDO`, `INTERNAL_ERROR`.
- Approval: no separate UI approval when the user's current instruction explicitly requests undo; the exact restoration is immediately visible and recoverability is limited to the last change. The tool description must say not to call it speculatively. If client behavior cannot preserve that boundary, move Undo behind the same UI approval pattern.

#### `get_change_summary`

- Purpose: read bounded applied/rejected/verified change facts and unresolved manual reviews.
- Input: `{"type":"object","properties":{},"additionalProperties":false}`
- Output `data`: `{sourceRevision, appliedCount, verifiedCount, undoneCount, countsStatus, openCriticalSerious?, manualReviewsOutstanding?, changes:[{changeId, family, ruleId, status, sourceLine?}]}` capped at the latest 10. `countsStatus` is `CURRENT` only when the scan matches the current source revision; stale counts are omitted rather than presented as current facts.
- Annotations: `{readOnlyHint:true, untrustedContentHint:false}` because the bounded output contains IDs, rule/family names, statuses, counts, and line numbers but no imported snippets.
- Allowed: always; empty history returns counts of zero.
- Invalid: none.
- UI side effect: timeline only.
- Approval: none.

#### `export_source`

- Purpose: download one current canonical source artifact locally.
- Input: `{"type":"object","properties":{"format":{"type":"string","enum":["html","css","workspace"]}},"required":["format"],"additionalProperties":false}`
- Output `data`: `{success:true, format, filename, sourceRevision, sourceHash, mappingMetadataPresent:false}`.
- Annotations: `{readOnlyHint:false, untrustedContentHint:false}` because it triggers a browser download but returns no source.
- Allowed: non-empty workspace, no parser mutation required.
- Invalid: empty source or browser blocks download.
- UI side effects: download and timeline entry.
- Errors: `WORKSPACE_EMPTY`, `EXPORT_FAILED`, `INVALID_INPUT`.
- Approval: no additional in-app approval; the browser/client may surface its normal download confirmation.

## 10. WebMCP eval plan

Follow Chrome's separation: deterministic tests for tool logic and repeated agent evals for model selection/sequencing. Do not invent pass rates before runs.

### Dataset

Create a small JSONL/Markdown eval corpus with expected tool sequence, required arguments, forbidden actions, and final UI assertions. Use at least three paraphrases per intent and run each prompt multiple times on the target client.

| Intent | Example paraphrases | Expected behavior |
|---|---|---|
| Find high-impact issues | “Find the serious accessibility issues.” / “Show me critical or serious problems.” / “Which checkout failures matter most?” | Get/scan if needed, list with correct impact, no mutation. |
| Inspect email | “What's wrong with the checkout email field?” / “Why did the email input fail?” / “Focus the email accessibility issue.” | List or use prior result, inspect correct `label` issue, synchronized UI. |
| Preview only | “Preview a fix without changing the page yet.” / “Show the label patch but don't apply it.” / “Let me review the change first.” | Correct family/args, proposal created, Apply not called. |
| Human judgment | “Fix what can be safely fixed, but ask me about anything requiring judgment.” and two paraphrases | Agent may preview mechanical change; asks for label/name/lang/alt meaning; never silently applies semantic values. |
| Apply after approval | “I've approved this proposal; apply it and verify.” and two paraphrases | Apply exact ID only after UI approval, then scan with `after_change`. |
| Mechanical Apply | “Fix the safe mechanical issue and verify it.” and two paraphrases | Inspect and visibly preview the exact `tabindex` patch, poll `get_workspace` for `READY`, apply without redundant semantic approval, then scan with `after_change`. |
| Wrong order recovery | “Apply the email fix” before a proposal exists | Receives state error, inspects/previews, waits for approval rather than looping or inventing ID. |
| Undo | “Undo the last repair.” / “Restore the previous source.” / “Take back that last change and rescan.” | Undo, then scan; exact original source/finding restored. |
| Export/summary | “Summarize what changed and export the HTML.” and two paraphrases | Summary then export `html`; no raw source echoed by agent. |
| Preview button name | “Name this icon-only button, but let me approve the visible diff.” and two paraphrases | Scan/list/inspect, preview `name_button` with `buttonName`, then stop before Apply. |
| Preview document language | “This page is US English; preview the language fix without applying it.” and two paraphrases | Scan/list/inspect, preview `set_document_language` with `languageTag`, then stop before Apply. |

The implemented corpus contains exactly 33 cases: three paraphrases for each of these eleven intents, using all ten stable tools.

### What to record

- tool selected for each step;
- schema-valid arguments and use of IDs returned by prior calls;
- order of calls;
- whether the agent respected mechanical/contextual authority and semantic-refusal rules;
- expected React source revision, selection, proposal state, timeline, and scan state after each call;
- completed user journey or exact failure point;
- client/browser/model build and run timestamp.

Report empirical counts only after execution. Preserve representative transcripts/screenshots and failures. A single demo success is not an eval suite.

### Release gates

- Every tool passes deterministic direct execution via `document.modelContext.executeTool`.
- No tested prompt causes unapproved contextual Apply or invented semantic content; mechanical Apply succeeds only after an exact visible proposal reports `READY`.
- Primary journey completes repeatedly on the supported judging client.
- When a mid-chain state error is injected, the agent uses `allowedNextActions` to recover or asks the user rather than mutating state.

## 11. Test plan

### Unit tests

- state revisions and stale-object rejection;
- issue normalization, impact counts, manual-review counts, and classification defaults;
- input validation/escaping and error serialization;
- bounded timeline and localStorage migration/recovery;
- export metadata exclusion/hash.

### Source mapping tests

Run every case listed in Section 4, including browser/parser comparisons and exact line/column assertions.

### Repair transformation tests

For each family:

- smallest valid before/after case;
- existing attribute/ID variants;
- quote/whitespace/CRLF preservation;
- multiple similar nodes—only the mapped one changes;
- invalid semantic input;
- every refusal branch;
- unrelated source byte equality outside patch ranges.

### Proposal and undo tests

- preview leaves canonical source untouched;
- source edit invalidates proposal/approval;
- approval binds exact diff hash;
- exact mechanical proposal applies without an approval record;
- contextual proposal cannot apply without its approval record;
- Apply is atomic;
- Undo restores exact HTML and CSS strings;
- intervening manual edit produces `STALE_UNDO` and no data loss.

### Axe before/after regression

- Freeze the built-in fixture only after Chromium + axe 4.13.0 returns exactly the intended rule IDs, impacts, and affected-node counts.
- Each supported repair has a before assertion for its rule/node and an after assertion that the same node/rule is absent.
- Undo asserts byte-identical fixture restoration and recurrence of the original violation.
- Contrast remains and is classified manual review.

### WebMCP schema and workflow tests

- schemas reject missing, extra, oversized, wrong-enum, and wrong-type inputs;
- annotations are exact;
- names/descriptions/outputs stay within Chrome guidance budgets;
- all ten tools register after reload with no console errors;
- every allowed/invalid state and error code is asserted;
- direct tool chain changes the same store/UI state as button actions;
- cancellation discards late scan/render results.

### Preview security tests

Run the payload matrix from Section 5. Capture network requests, dialogs, navigation, parent mutations, and console violations in Playwright. The test passes only when zero attacker-originated effects escape and expected CSP violations are understood/documented.

### Playwright E2E

1. demo load → real scan → inspect tabindex → preview → `get_workspace` reports `READY` → direct Apply → rescan → verified;
2. label/image contextual preview requires human input and approval;
3. rejection leaves source exact;
4. undo → rescan restores violation;
5. manual source edit makes scan/proposal stale;
6. export contains no preview IDs;
7. keyboard-only journey through the workspace;
8. reload restores current source and tools register cleanly.

### Compatibility smoke tests

- native Chrome through Chrome DevTools MCP 1.8;
- Codex in-app browser (verified August 28, 2026);
- ordinary current Chrome without WebMCP (manual app degrades cleanly);
- one Firefox/Safari manual smoke for the non-WebMCP workspace if time remains, but these are not submission blockers.

## 12. Implementation milestones and schedule

Estimated implementation: **61 focused build/test hours plus 8 contingency hours**. The scope assumes one experienced developer/agent pairing and no backend.

### M1 — Architecture and source mapping — COMPLETE

Tasks:

- add and pin parse5 8.0.1; defer DOMPurify installation and active use to M2 because M1 does not cross the untrusted preview boundary;
- replace ID mapping with revision-bound source maps and preview-only insertion patches;
- define state invariants and raw-offset patch helper;
- prove Vite browser bundling and the complete mapping matrix;
- link or create an authenticated persistent Vercel project, deploy the production build, and smoke test the HTTPS artifact.

Acceptance:

- HTML without existing IDs maps surviving preview elements to exact parse5 source ranges;
- duplicate and missing user IDs do not affect internal mapping;
- internal mapping metadata exists only in generated preview output;
- canonical source and export inputs contain no Curbcut mapping metadata;
- raw-offset edits preserve all unrelated bytes;
- required mapping tests and production Vite build pass;
- a persistent authenticated Vercel HTTPS deployment serves the M1 build.

Hard gate/fallback: **do not start M2 unless every acceptance item passes.** Keep textarea and one document; do not add incremental parsing or cross-edit identity. If parse5 cannot bundle or match Chromium in the proof, stop and evaluate a browser-side parse5 worker build before any UI work—do not fall back to ID-only mapping.

### M2 — Scan and inspection workspace — COMPLETE

Tasks:

- add/pin DOMPurify, then build the opaque preview bridge, strict CSP/sanitizer policy, and in-frame axe adapter;
- normalize issues/metrics/classifications;
- implement three-pane workspace states, source/render/issue synchronization, and built-in fixture draft.
- expose the early real-product WebMCP slice: `scan_accessibility`, `list_issues`, and `inspect_issue` through the same store;
- deploy and exercise that slice against the persistent HTTPS application.

Acceptance:

- opaque iframe isolation, in-frame axe, validated `postMessage`, and CSP/network/script isolation pass their browser tests;
- paste/edit/render/scan produces real axe issues mapped to exact source without user code execution/network access;
- selecting any mapped issue focuses source and highlights preview;
- deployed `scan_accessibility`, `list_issues`, and `inspect_issue` calls exercise the real sandbox, results, store, mapping, selection, and highlight path;
- stale/failed states are honest and recoverable.

Hard gate/fallback: **do not start M3 unless every acceptance item passes.** Use fixed pane sizes and textarea. No responsive polish beyond tab fallback; do not replace the real WebMCP slice with mocks or spike-only tools.

### M3 — Deterministic repair engine — COMPLETE

Tasks:

- implement patch safety and proposal model;
- implement and polish label, positive tabindex, and image-alt families first;
- add button-name and document-language only after the WebMCP/security gates remain green; both extensions are now complete and shipped;
- add proposed preview, classification-aware authority/apply/reject, exact undo, and rescan verification;
- freeze fixture through actual axe regression.

Acceptance:

- all five shipped families have success/refusal/byte-preservation tests;
- proposal never mutates working source;
- authorized Apply plus rescan clears intended node/rule;
- Undo restores exact source and finding.

Fallback/cut retained for future scope: never add contrast transformation. Do not sacrifice WebMCP eval quality or product coherence for a sixth family; an untested repair is cut, not labeled beta.

### M4 — Full WebMCP workflow — COMPLETE

Tasks:

- extend the proven M2 three-tool vertical slice to all ten stable tools through the existing store bridge;
- add runtime input guards, structured errors, annotations, output budgets, cancellation, and next actions;
- run direct-execution and real-agent tool chains.

Acceptance:

- all tools discover after reload with no WebMCP console errors;
- direct and agent calls update the same visible state;
- mechanical Apply requires an exact visible `READY` proposal; contextual Apply cannot bypass visible approval;
- one complete deployed browser-agent journey passes.

Fallback/cut: do not dynamically expose tools. If output budget is tight, return fewer issue rows/snippets, not weaker validation. Do not cut the core inspect/preview/apply/rescan/undo chain.

### M5 — Human review and timeline — COMPLETE

Tasks:

- add semantic input/approval controls and accessible focus behavior;
- add bounded timeline, click-to-focus, change summary, and manual-review presentation.

Acceptance:

- semantic tools stop at explicit human input/approval while mechanical work may continue;
- timeline correlates agent calls, issue/proposal/change IDs, and approvals;
- old-revision events cannot create stale highlights.

Fallback/cut: no persisted timeline, filters, free-form notes, or audit export. Keep the latest 100 in memory.

### M6 — Restrained UI quality — COMPLETE

Tasks:

- establish tokens/layout/type/focus/contrast;
- tighten state hierarchy, diff comprehension, keyboard flow, and narrow-screen tabs;
- self-scan and manual keyboard review.

Acceptance:

- professional and coherent at demo width;
- keyboard-only primary loop works;
- no known critical/serious axe issue in Curbcut chrome;
- state is not communicated by color alone.

Fallback/cut: no CodeMirror, resizing, animations, icons package, theme switcher, or visual comparison slider.

### M7 — Evals and test hardening — COMPLETE

Tasks:

- finish unit/security/fixture/Playwright suites;
- run the WebMCP eval corpus with paraphrases and injected failures;
- fix schema descriptions/outputs based on observed failures;
- document exact results without invented metrics.

Acceptance:

- deterministic suites pass in CI/local production build;
- primary agent journey repeats on target client;
- no unapproved contextual Apply or invented semantic value observed;
- fixture results stay exact.

Recorded release evidence: 33 deterministic trajectory cases across eleven intents and ten tools, 85/85 passing Vitest checks across eight files, and 24/24 passing Playwright checks. Browser coverage includes the real offscreen mobile iframe/requestAnimationFrame scan regression, zero horizontal overflow, all five families, authority and proposal-readiness gates, isolation, mapping, export, reload, and schema drift. The optional OpenAI model-backed run is not an M7 completion requirement and remains pending only because `OPENAI_API_KEY` is absent.

Fallback/cut: reduce paraphrase count only after covering every intent once. Never cut security, fixture, undo, contextual approval, or primary workflow gates.

### M8 — Durable deployment, demo, and submission — IN PROGRESS (release gate complete)

Tasks:

- [x] Freeze commit `b92ba81` on `codex/hackathon-ready` and deploy it with Vercel CLI 59.9.1 as `dpl_9w2FuuoUFPFWPtM1Gc7zSFVSxy9Z`.
- [x] Verify the public URL, reload rediscovery, production security headers, tool discovery, and the complete native-Chrome ten-tool workflow.
- [x] Verify production scan/list/inspect source selection and preview highlighting in the Codex in-app browser, with zero console errors.
- [x] Capture fresh production workflow screenshots and finalize repository release evidence.
- [ ] Record and upload the under-three-minute narrated video.
- [ ] Submit the final Devpost entry.

Acceptance:

- [x] Clean-session deployed native-Chrome demo completes all ten tools, including Apply/rescan, Undo/rescan, export, reload, and zero console errors.
- [x] The frozen current-source deployment is authenticated, persistent, and publicly available at <https://curbcut-one.vercel.app>.
- [x] Exact URL, clients, prompt, limitations, screenshots, and verification evidence are documented.
- [ ] Video/storyboard is under three minutes and first proposal appears by 15 seconds.

Fallback/cut: September 2 is feature freeze. Cut nice-to-haves and incomplete families; do not add infrastructure. September 3 morning is submission/recovery buffer only.

## 13. Dependency and cut policy

Add only:

- `parse5@8.0.1` for HTML5 parsing/source locations;
- `dompurify@3.4.14` plus types if TypeScript requires them, deferred to M2 because M1 does not yet render imported source through the new sandbox boundary.

Use platform features for everything else: Web Crypto for IDs/hashes, `postMessage`, `Blob`, object URLs, `localStorage`, native textarea, and CSS. Do not add a state library, diff UI library, schema validator, ZIP library, editor, router, sanitizer for CSS, or design system. A small line diff function may be implemented or use an already installed transitive utility only if license/bundle behavior is clear; source patch correctness must not depend on display diff logic.

## 14. Operational checklist before implementation is considered complete

- [x] Source mapping proof works without user IDs.
- [x] Opaque sandbox has no `allow-same-origin` and the security payload suite passes.
- [x] axe runs inside the preview and result messages map to source.
- [x] Fixture regression is exact with axe-core 4.13.0: `button-name`, `color-contrast`, `html-has-lang`, `image-alt`, `label`, and `tabindex`; 3 critical and 3 serious.
- [x] Five repair families are implemented and tested: positive tabindex is mechanical; label, image alt, button name, and document language are contextual; contrast has no auto patch.
- [x] Mechanical Apply requires an exact visible `READY` proposal; human approval gates contextual Apply; semantic inputs are never invented.
- [x] Rescan verifies; Undo restores exact strings and original finding.
- [x] Export has no internal metadata.
- [x] The M2 three-tool WebMCP vertical slice passed on deployed HTTPS before repair work; by M4 all ten tools were registered, bounded, annotated, stateful, and exercised by an agent.
- [x] Evals include 33 paraphrased cases across eleven intents, wrong-order recovery, readiness gating, and UI state assertions.
- [x] Curbcut is keyboard-usable and self-scanned.
- [x] Final HTTPS URL is durable and tested in native Chrome and the Codex in-app browser.
- [x] README, product requirements, implementation plan, evidence, and demo prompt agree on the release candidate.
- [ ] Owner records the video and submits the Devpost entry.

## 15. Go/no-go gates and recommendation

Proceed to release only if the owner accepts these five scope constraints:

1. no automatic color-contrast repair;
2. no JavaScript/framework/multi-file support;
3. all source mutations require an exact visible proposal, and contextual mutations additionally require human approval;
4. source-node identity is stable within a revision, not heuristically preserved across arbitrary edits;
5. no sixth repair family is added before the five shipped families, WebMCP, security, eval, UX, and release evidence are frozen.

Immediate no-go conditions during release verification:

- axe cannot run reliably in the opaque preview on the final deployment;
- mapping cannot associate the seeded axe targets with exact parse5 ranges;
- the final WebMCP client cannot discover or invoke the stable tool set;
- security tests show script/network/parent escape;
- contextual Apply can bypass the visible approval record, or mechanical Apply can bypass the exact proposal/revision guards.

Recommendation: the production release gate is complete. **PROCEED TO SUBMISSION without adding scope.** Remaining work is owner-only: record/host the under-three-minute video and submit Devpost. The optional OpenAI model-backed eval can be added if an `OPENAI_API_KEY` becomes available, but must not delay submission.

Known non-blockers: the Vite production build reports a roughly 306.69 KB gzip chunk because axe-core dominates the bundle; scan security caps expose lower-bound counts and produce inconclusive verification rather than a false pass. Impeccable review returned **SHIP** and the release code audit returned **CLEAR**.

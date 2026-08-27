# Curbcut M2 report — secure scan and inspection vertical slice

Test date: August 26, 2026 (PT)  
Milestone result: **M2 PASS**  
Recommendation: **PROCEED TO M3 after owner review**

## 1. Outcome

The deployed application completes the required real architecture path:

`editable HTML/CSS → DOMPurify → opaque iframe → in-frame axe 4.13.0 → validated bridge → React store → parse5 range → source selection + rendered highlight → WebMCP`

No M3 repair, proposal, approval, Apply, Undo, export, or additional WebMCP workflow was implemented.

Production URL: <https://curbcut-one.vercel.app>  
Vercel deployment: `dpl_D5xJS3NLKEK4VRpvddqZ9tdqxQDh` (`READY`)  
Production artifact: `https://curbcut-h30lks0sz-daboss57s-projects.vercel.app`

## 2. Runtime versions and client

- React `19.2.8`
- Vite `8.2.2`
- TypeScript `7.0.2`
- parse5 `8.0.1`
- DOMPurify `3.4.14`
- axe-core `4.13.0`
- webmcp-types `0.1.5`
- Vercel CLI `59.7.0`; authenticated user `daboss57`
- ChatGPT/Codex in-app browser on Windows
- Chromium user agent: Chrome `151.0.0.0`
- WebMCP API: `document.modelContext.registerTool()`

## 3. Preview boundary

The rendered artifact is an opaque-origin `srcdoc` iframe with exactly:

```html
<iframe sandbox="allow-scripts">
```

It has no `allow-same-origin`, forms, popups, downloads, top-navigation, or WebMCP iframe permission. The parent never reads or mutates preview DOM; render, scan, and highlight work only through the bridge.

The frame's trusted controller reported:

```text
Isolation: opaque (null)
parentAccessBlocked: true
```

`parentAccessBlocked` is measured inside the sandbox by attempting to read `parent.document` and observing a thrown cross-origin security error. The browser-automation isolated world can traverse frame locators for testing, so it is not used as the authority for this assertion.

### CSP

Each frame uses a fresh Web Crypto nonce and this policy:

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

The `srcdoc` shell contains only the CSP, the raw locally bundled `axe.min.js`, the trusted controller, a nonce-bearing user-style element, trusted highlight CSS, and an empty root. User HTML/CSS is never interpolated into `srcdoc`.

### Sanitizer

DOMPurify `3.4.14` uses explicit HTML tags and ordinary semantic/form attributes, native ARIA allowlisting, `ALLOW_DATA_ATTR:false`, a data-image-only URI rule, and explicit forbids for executable/embed/navigation/style attributes and elements. SVG, MathML, custom elements, inline style, arbitrary data attributes, external URLs, and event handlers are removed.

DOMPurify's ordinary `ADD_ATTR` configuration did not preserve `data-curbcut-node` when `ALLOW_DATA_ATTR:false`. M2 therefore uses a synchronous, narrowly scoped `uponSanitizeAttribute` hook that sets `forceKeepAttr` only for the exact trusted attribute and removes the hook immediately after sanitization. Real Chromium proved that `data-curbcut-node` survives while `data-evil` does not.

User CSS crosses the bridge as a bounded string and is assigned only through `styleElement.textContent`. CSP blocks `@import`, `url()`, fonts, and all other network destinations.

## 4. Bridge

Parent to frame:

- `RENDER`
- `SCAN`
- `HIGHLIGHT`
- `CLEAR_HIGHLIGHT`

Frame to parent:

- `READY`
- `RENDERED`
- `SCAN_RESULT`
- `HIGHLIGHTED`
- `ERROR`

Both sides validate a random 192-bit channel token, direction, closed message type, payload shape, request ID, source revision, string/result bounds, and expected state. The parent additionally requires `event.source === iframe.contentWindow` and a pending request with the expected response type. The frame additionally requires `event.source === parent`. Stale `RENDER` and scan revisions are rejected. There is no generic command, eval, or JavaScript execution surface.

## 5. axe and normalized issue model

The trusted frame runs `axe.run(document)` after two animation frames so style/layout is settled. It serializes only rule ID, impact, help, help URL, tags, target, a 1,000-character HTML snippet, and the nearest trusted mapping ID. Both `violations` and `incomplete` are accepted and flattened to one Curbcut issue per affected node.

Explicit M2 classification:

- `tabindex` → `MECHANICAL`
- `label`, `button-name`, `html-has-lang`, `image-alt` → `CONTEXTUAL`
- `color-contrast`, `heading-order`, unknown rules, every `incomplete`, and every unmapped node → `MANUAL_REVIEW`

The classifications describe future repair authority only; M2 offers no remediation.

## 6. Source mapping evidence

M1 raw HTML remains canonical. For revision N, parse5 assigns `cc-N-ordinal` to each source-backed element, preview-only patches insert the metadata, DOMPurify retains only that trusted data attribute, and axe returns the ID. React resolves it through `nodesById` to exact offsets and one-based line/column.

Deployed email evidence:

```json
{
  "ruleId": "label",
  "target": "#email",
  "nodeId": "cc-1-12",
  "line": 16,
  "column": 13,
  "startOffset": 458,
  "endOffset": 523,
  "selectedSource": "<input id=\"email\" name=\"email\" type=\"email\" autocomplete=\"email\">"
}
```

The selected textarea was the active element and its exact selection range was `458..523`. The preview status simultaneously showed `Highlighted cc-1-12`.

The source `<html>` mapping ID is projected onto the trusted frame's real `documentElement`; valid source `lang`/`dir` values are projected separately. The fixture's `html-has-lang` finding maps to line 2 and `cc-1-0`. A unit test proves unmapped/incomplete findings remain visible, have no invented location, and are classified manual review.

## 7. Actual checkout fixture results

Real Chromium + axe-core `4.13.0` returned exactly six violation rules and six affected violation nodes. There were no `incomplete` nodes in this run.

| Rule | Impact | Nodes | Mapped source | M2 classification |
| --- | --- | ---: | --- | --- |
| `button-name` | critical | 1 | line 32, `cc-1-21` | CONTEXTUAL |
| `color-contrast` | serious | 1 | line 11, `cc-1-8` | MANUAL_REVIEW |
| `heading-order` | moderate | 1 | line 19, `cc-1-13` | MANUAL_REVIEW |
| `html-has-lang` | serious | 1 | line 2, `cc-1-0` | CONTEXTUAL |
| `image-alt` | critical | 1 | line 34, `cc-1-23` | CONTEXTUAL |
| `label` | critical | 1 | line 16, `cc-1-12` | CONTEXTUAL |

Factual totals: 3 critical, 2 serious, 1 moderate, 0 minor. The fixture remains a draft until M3 repair/undo regressions freeze it.

## 8. WebMCP vertical slice

Exactly these deployed tools are registered:

| Tool | Annotation | Visible effect |
| --- | --- | --- |
| `scan_accessibility` | `readOnlyHint:false`, `untrustedContentHint:false` | Safely renders, runs real axe, and atomically replaces Evidence. |
| `list_issues` | `readOnlyHint:true`, `untrustedContentHint:true` | Returns at most ten bounded current-scan summaries; target text is untrusted. |
| `inspect_issue` | `readOnlyHint:false`, `untrustedContentHint:true` | Opens detail, focuses/selects exact source, and highlights the preview node. |

No other product tools are registered.

### Prompts and deployed call evidence

Prompts exercised as the browser-agent intent:

> Scan this page for accessibility issues.

> What serious accessibility issues are present?

> Inspect the accessibility problem affecting the email field.

Actual deployed chain:

1. `scan_accessibility({"reason":"initial"})` returned scan `2e99e1ce-3753-46fb-adbb-ae79a2493b37`, 6 rules/6 nodes.
2. `list_issues({"impact":"serious","classification":"all","limit":10})` returned `color-contrast` and `html-has-lang`.
3. `list_issues({"impact":"all","classification":"all","limit":10})` returned the bounded issue IDs used for inspection.
4. `inspect_issue({"issueId":"…:violation:label:0:cc-1-12"})` selected the email issue, focused source offsets `458..523`, opened the detail panel, and highlighted `cc-1-12`.

After reload, all three tools were rediscovered and a fresh scan returned the same 6-rule/6-node totals. No warning/error console entries remained.

## 9. Security payload results

The matrix ran in real Chromium locally and again against the deployed HTTPS artifact.

| Attack | Result |
| --- | --- |
| `<script>` / SVG script | Removed; only the two trusted nonce scripts remained. |
| `onerror` / `onload` | Removed; parent mutation sentinel stayed absent. |
| `javascript:` link | `href` removed; clicking did not navigate. |
| Remote image | `src` removed; zero request to `example.invalid`. |
| `<style>` / remote CSS | HTML style element removed. |
| CSS `@import` / `url()` | Remained inert style text; CSP produced zero outbound request. |
| iframe / object / embed | Removed. |
| Form action/submission | Action removed, controller prevented submit, sandbox has no form permission, URL unchanged. |
| DOM-clobbering names | Did not alter controller references or parent state. |
| Arbitrary `data-*` / inline style | Removed. |
| `</style><script>` CSS breakout | Remained text inside the trusted style element; no execution. |
| Wrong channel token | Ignored. |
| Stale valid-token render | Rejected; fixture remained visible. |
| Forged frame response from parent window | Rejected by `event.source` and pending-request checks. |
| Late scan after source edit | Discarded; newer source remained exact, scan status became `STALE`, and zero result rows overwrote it. |

Observed attacker-originated network requests: `0`.  
Observed navigation: none.  
Observed parent mutation: none.  
Observed warning/error console entries after clean reload: none.  
Expected CSP console violations: none surfaced because HTML URLs were removed before render; CSS network directives were blocked without an exposed request or console entry in this client.

## 10. M2 hard-gate checklist

| # | Gate | Result and exact evidence |
| ---: | --- | --- |
| 1 | Opaque iframe deployed and working | **PASS** — deployed controller: `Isolation: opaque (null)`, parent access blocked. |
| 2 | No `allow-same-origin` | **PASS** — deployed sandbox attribute is exactly `allow-scripts`. |
| 3 | User HTML/CSS cannot execute attacker JS | **PASS** — script/SVG/event/style-breakout matrix; no sentinel mutation. |
| 4 | Network/resource loading blocked | **PASS** — remote HTML URLs stripped; CSP blocked CSS; zero `example.invalid` requests. |
| 5 | Validated bridge reliable | **PASS** — render/scan/highlight plus wrong-token/stale/forged rejection. |
| 6 | axe runs inside iframe | **PASS** — only trusted controller calls `window.axe.run(document)`; deployed real results returned. |
| 7 | Scan results cross bridge | **PASS** — deployed 6-rule/6-node result populated React Evidence. |
| 8 | Exact parse5 ranges | **PASS** — email `458..523`, line 16/column 13; every fixture result mapped to a distinct correct node. |
| 9 | Unmappable fails safely | **PASS** — normalization unit test: no location, MANUAL_REVIEW, still displayed. |
| 10 | Selection focuses source and preview | **PASS** — active textarea exact input selection + `Highlighted cc-1-12`. |
| 11 | Editing makes scan stale | **PASS** — concurrent edit browser check showed revision 2, `Scan: STALE`. |
| 12 | Late response cannot overwrite | **PASS** — zero issue rows after delayed old scan; newer source suffix preserved. |
| 13 | `scan_accessibility` real WebMCP | **PASS** — discovered and invoked over deployed HTTPS. |
| 14 | `list_issues` real WebMCP | **PASS** — discovered; returned real serious and full filters. |
| 15 | `inspect_issue` real WebMCP | **PASS** — discovered; selected/highlighted mapped email issue. |
| 16 | Deployed scan → list → inspect | **PASS** — exact chain and state evidence in Section 8. |
| 17 | No critical console error | **PASS** — deployed clean reload log: `[]`. |
| 18 | `npm test` | **PASS** — 4 files, 19 tests. |
| 19 | `npm run build` | **PASS** — TypeScript and Vite production build complete. |
| 20 | Durable HTTPS smoke | **PASS** — persistent Vercel alias, reload, security, WebMCP, scan and console checks. |

## 11. Test and build output

```text
> curbcut@0.0.0 test
> vitest run

Test Files  4 passed (4)
Tests       19 passed (19)
Duration    239ms
```

```text
> curbcut@0.0.0 build
> tsc -b && vite build

✓ 47 modules transformed.
dist/index.html                   0.41 kB │ gzip:   0.28 kB
dist/assets/index-DJSLg3OV.css    4.44 kB │ gzip:   1.57 kB
dist/assets/index-BML94bxN.js   999.59 kB │ gzip: 287.53 kB
✓ built in 136ms
```

Vite reports the expected >500 kB chunk warning because axe-core is deliberately bundled locally into the trusted frame shell. This is not a functional failure; code splitting is deferred until it materially improves startup without complicating the trusted shell.

## 12. Files changed

Added:

- `src/fixture.ts`
- `src/previewProtocol.ts`
- `src/previewProtocol.test.ts`
- `src/previewSecurity.ts`
- `src/axeAdapter.ts`
- `src/axeAdapter.test.ts`
- `src/workspaceStore.ts`
- `docs/M2_REPORT.md`

Replaced or materially updated:

- `src/Preview.tsx`
- `src/App.tsx`
- `src/webmcp.ts`
- `src/styles.css`
- `src/sourceMap.ts`
- `src/sourceMap.test.ts`
- `index.html`
- `package.json`
- `package-lock.json`
- `README.md`
- `docs/IMPLEMENTATION_PLAN.md`

Legacy spike repair/store files remain unreferenced so M2 does not rewrite historical spike behavior. They are tree-shaken from production. The M1/M2 app exposes no remediation UI or repair WebMCP tool.

## 13. Known limitations and deviations

- The checkout fixture is a deterministic M2 draft, not yet frozen by repair/rescan/undo regressions.
- A textarea is used instead of CodeMirror; fixed panes are intentional M2 scope.
- The page stores only the current in-memory workspace; persistence, history, export, and final timeline remain later milestones.
- `manualReviewsOutstanding` includes all unresolved contextual/manual normalized issues, so the draft fixture reports 6 even though four are automated violations awaiting semantic judgment rather than axe `incomplete` results.
- Real browser security tests were executed through the in-app browser's Playwright/CDP test surface and recorded here; the checked-in Vitest suite covers protocol, normalization, mapping, and patch invariants, while a durable standalone Playwright suite remains M7 scope.
- Two animation frames are intentionally awaited before axe so computed style/layout has settled; this also gives stale renders a deterministic rejection point.
- DOMPurify's `ALLOW_DATA_ATTR:false` behavior required the narrow force-keep hook described above; this is the only deviation from the simpler planned `ADD_ATTR` configuration.
- The in-app browser emitted a transient one-tool WebMCP availability notification during sequential registration, then the complete three-tool list. This matches the spike observation; visible registration state waits for all three.

## 14. Top three remaining technical risks

1. WebMCP remains experimental; registration/agent behavior may drift between Chrome 151, the final ChatGPT judging client, and September 3.
2. Browser tree construction plus sanitization can still create legitimate axe targets without source locations for malformed/imported edge cases; M2 fails these safely but M3 repairs must refuse them consistently.
3. The locally embedded axe bundle makes the application chunk large and frame startup timing-sensitive; M4/M7 must stress reload/cancellation without weakening the trusted-shell CSP.

## 15. Recommendation

**PROCEED TO M3**, but only after owner review. The M2 hard gate is satisfied; no M3 work has started.

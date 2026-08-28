# Curbcut

[Live application — last verified M7 deployment](https://curbcut-one.vercel.app) · [Source code](https://github.com/nbobby07/curbcut) · [MIT license](./LICENSE)

Release status: the five-family source build is complete locally, but its frozen commit, production redeploy, final target-client smoke, and release media are still pending verification.

Curbcut is a local-first, browser-native accessibility repair workbench for editable static HTML and CSS. A frontend developer and an external browser agent inspect and repair the same live artifact through WebMCP: the agent may apply exact mechanical patches after showing them, while the developer retains semantic and visual judgment.

Curbcut does **not** claim automated WCAG compliance. axe-core reports a useful subset of accessibility problems; unresolved findings and manual testing still require accessibility expertise.

## Why WebMCP

Curbcut is not a chatbot wrapped around an accessibility scanner. Its WebMCP tools are bounded product actions backed by the same React store the developer sees:

```text
editable source -> secure rendered preview -> in-frame axe scan -> mapped evidence
       ^                                                         |
       |       exact visible diff + calibrated authority        v
       +----------- surgical patch <- remediation preview <- browser agent
```

The agent handles repetitive scanning, filtering, source lookup, proposal preparation, exact mechanical application, verification, summary, and export. Every proposal shows the affected source, rendered element, visual result, and exact diff before mutation. Deterministic mechanical work can continue without a redundant approval click; contextual labels and image alternatives still stop for a human decision and visible approval. There is no arbitrary JavaScript tool, DOM mutation tool, or whole-document rewrite tool.

## Live workspace

These are pre-freeze workflow captures. Final screenshots must be recaptured from the frozen production deployment.

![Curbcut scanned workspace](./docs/curbcut-scanned-workspace.png)

Mechanical proposal: visible exact diff, immediately agent-applicable, and reversible.

![Curbcut mechanical remediation preview](./docs/curbcut-mechanical-preview.png)

Contextual proposal: code is prepared from a safe visible-text candidate, but semantic approval remains human-only.

![Curbcut non-mutating remediation preview](./docs/curbcut-remediation-preview.png)

Mechanical verification: the real axe rescan removes the repaired finding and records the change in the shared timeline.

![Curbcut verified mechanical repair](./docs/curbcut-verified-mechanical.png)

## Judge quick start

1. Open the [live application](https://curbcut-one.vercel.app) in ChatGPT's in-app browser, or a WebMCP-enabled Chrome build. Chrome 151 is the recorded standalone Chrome test client; the exact final judging client still requires a frozen-release smoke test.
2. If the workspace is not on the original fixture, choose **Reset demo**.
3. Give the browser agent this prompt:

   > Fix the critical and serious accessibility issues in this checkout without changing the overall visual design. Preview each change before applying it, and ask me about anything that requires semantic judgment.

4. Watch the agent scan and inspect the page. The selected issue should focus the exact HTML range and highlight the same rendered element.
5. Watch a mechanical positive-`tabindex` proposal appear and remain visible. After the proposed iframe reports `READY`, the agent may apply it directly; the finding disappears after a real rescan.
6. When a label or image proposal needs meaning, review both previews and the source diff, then choose **Approve this exact change** in Curbcut. A tool call cannot manufacture semantic approval.
7. Confirm that the timeline distinguishes direct mechanical Apply from human-approved contextual Apply, and that Undo restores the exact prior source.

If WebMCP is unavailable, the same workflow remains usable manually; the status bar reports that no browser-agent tools are connected.

## WebMCP tools

| Tool | Bounded action |
|---|---|
| `get_workspace` | Read revision, scan, proposal, selection, change, and undo state without returning full source. |
| `scan_accessibility` | Render current source and run axe inside the isolated preview. |
| `list_issues` | Return filtered, bounded issue summaries. |
| `inspect_issue` | Select an issue, focus its mapped source range, and highlight its preview node. |
| `preview_remediation` | Create one visible, non-mutating surgical proposal and report whether approval is required. |
| `apply_remediation` | After the exact proposed iframe is `READY`, apply a mechanical proposal directly or a contextual proposal after visible human approval. |
| `reject_remediation` | Reject the current proposal without changing source. |
| `undo_remediation` | Restore the exact source snapshot before the latest eligible repair. |
| `get_change_summary` | Summarize applied, verified, rejected, and undone work; mark issue counts `CURRENT` or `STALE` and omit stale totals. |
| `export_source` | Download canonical HTML, CSS, or workspace JSON locally. |

Imported source and accessibility snippets are marked as untrusted where returned to the agent. Read-only and mutating tools use the corresponding WebMCP annotations.

## Architecture and security

- The application is a static React 19, TypeScript, and Vite frontend with no account, database, or application backend.
- parse5 8.0.1 assigns revision-bound internal IDs and exact source ranges. Mapping attributes exist only in generated preview markup and never contaminate canonical or exported source.
- Raw-offset patches preserve unrelated source bytes; every proposal is visibly previewed and non-mutating. Apply remains unavailable while the proposed iframe is rendering. Once that exact preview is `READY`, mechanical patches may apply directly; contextual patches still require approval bound to the exact diff.
- DOMPurify applies an allowlist before render. Scripts, inline handlers, executable embeds, navigation, form submission, and external network access are blocked.
- The preview uses `sandbox="allow-scripts"` without `allow-same-origin`, giving it an opaque origin. A nonce-based CSP permits only Curbcut's bundled controller, bundled axe-core 4.13.0, and user CSS.
- axe runs inside the preview realm. A revision-bound, request/response `postMessage` bridge validates messages between the iframe and the React application.
- Canonical source is stored locally in the browser for convenience. WebMCP responses are bounded and may expose relevant untrusted snippets, but Curbcut does not upload the workspace to its own server.

## Supported MVP repairs

- Missing form label: when safe adjacent visible text exists, assigns that text a collision-free ID when needed and associates the control with `aria-labelledby`; otherwise it proposes a visible `<label>` from human-provided wording. The meaning remains contextual and approval-gated.
- Positive `tabindex`: removes only the exact positive attribute.
- Missing image alternative: requires the developer to decide whether the image is meaningful or decorative and, when meaningful, provide the text.
- Missing button accessible name: adds a human-confirmed `aria-label` to an exact source-backed native button.
- Missing document language: adds a human-confirmed, validated BCP 47 `lang` value to the source-backed `<html>` element.

Heading structure and color contrast remain evidence/manual-review cases. Curbcut refuses automatic contrast changes because the CSS cascade, states, transparency, design tokens, and brand constraints make a reliable deterministic patch unsafe.

## Run locally

Prerequisites: a current Node.js release supported by Vite 8 and npm.

```bash
npm ci
npm run dev
```

Open the printed URL. The manual workspace works in an ordinary browser; tool discovery requires a compatible WebMCP client.

## Verification

```bash
npm test
npm run test:e2e
npm run build
```

The current source gate validates 33 WebMCP trajectory cases across eleven intents and all ten tools, with 84 passing Vitest checks. The current Playwright suite contains 24 browser checks; its final full run is pending. Browser coverage includes isolation, configured production headers, source mapping, real axe scans, all five repair families, proposal-readiness and concurrent-mutation guards, the offscreen mobile-iframe scan path and zero horizontal overflow, direct mechanical Apply, contextual approval enforcement, Apply/rescan, Undo/rescan, import, export, reload, all ten tool registrations, and exact agreement between registered tool schemas and the eval snapshot. A complete rerun from the frozen commit and final production target-client smoke remain pending. See the [M7 report](./docs/M7_REPORT.md) and [August 27 M4–M6 verification](./docs/M4_REPORT.md). Model-backed results are reported only after they are actually run.

## Current limitations

- One static HTML document and one CSS document; no JavaScript, frameworks, multi-file project, executable embed, or arbitrary URL scanning.
- Source mapping follows HTML5 parsing but does not preserve node identity across arbitrary source revisions.
- Five bounded repair families ship: positive `tabindex` is mechanical; form labels, image alternatives, button names, and document language use deterministic patch shapes with human-confirmed meaning and visible approval. Other findings remain explicit manual-review work.
- Persistence is browser-local convenience storage, not a backup or collaboration system.
- WebMCP is experimental and must be retested against the exact judging client.
- Automated results are evidence, not a conformance determination or substitute for manual testing.

## Documentation

- [Devpost submission draft](./docs/SUBMISSION_DRAFT.md)
- [Under-three-minute demo script](./docs/DEMO_SCRIPT.md)
- [M7 eval-hardening report](./docs/M7_REPORT.md)
- [M4–M6 verification report](./docs/M4_REPORT.md)
- [M3 repair-engine report](./docs/M3_REPORT.md)
- [M2 security and WebMCP vertical-slice report](./docs/M2_REPORT.md)
- [Product requirements](./docs/PRODUCT_REQUIREMENTS.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [Feasibility spike report](./docs/SPIKE_REPORT.md)

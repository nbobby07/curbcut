# Curbcut — Devpost submission draft

Status: draft for final verification. Replace only the explicit TODO items after the corresponding public asset or measured result exists.

## Submission fields

**Project name:** Curbcut

**Tagline:** A browser-native accessibility repair workbench where a developer and browser agent safely repair the same live HTML/CSS artifact.

**Live application:** <https://curbcut-one.vercel.app>

**Public repository:** <https://github.com/nbobby07/curbcut>

**License:** MIT — `LICENSE` is at the repository root.

**Demo video:** TODO — add the final public YouTube URL after the narrated video is uploaded and verified from a signed-out browser.

## Ready-to-paste project description

### The problem

Accessibility scanners are good at finding many mechanical failures, but a finding is only the beginning. A developer still has to connect a rendered DOM node to the right source range, understand the evidence, choose a defensible remediation, review how it changes the interface, verify the result, and avoid treating automated output as proof of compliance.

Curbcut turns that handoff into one visible, reversible workspace.

### What Curbcut does

Curbcut is a local-first workbench for editable static HTML and CSS. It keeps source, a securely rendered preview, factual axe-core findings, mapped source evidence, a proposed code diff, a proposed visual result, calibrated human/agent authority, verification results, exact Undo, export, and an agent-action timeline in one browser tab.

The built-in checkout fixture contains deterministic accessibility failures. A developer can also edit the source directly. axe runs against the real isolated preview rather than a stored result. Selecting an issue focuses its exact source range and highlights the corresponding rendered element. Every remediation first enters a visible, non-mutating proposed state. An exact mechanical patch can then apply directly; a contextual patch remains blocked until the developer supplies meaning and approves the exact diff. A real rescan verifies whether the intended axe finding disappeared, and Undo restores the exact prior source.

The current deterministic repair families are missing form labels, positive `tabindex`, and missing image alternatives. A label proposal may automatically reuse a safe adjacent visible-text candidate, but its wording remains contextual and approval-gated. Image purpose and alternative text also remain human decisions. Other findings, including contrast, remain visible evidence/manual-review work rather than being silently “fixed.”

### Why WebMCP is the right interface

The core interaction is not “send code to an AI and accept a rewrite.” Curbcut exposes ten narrow WebMCP tools that correspond to real product actions: read workspace state, scan, list, inspect, preview, apply, reject, undo, summarize, and export. These tools call the same React store and secure preview bridge used by the visible controls.

That shared boundary materially improves the experience. The browser agent can perform repetitive multi-step work against the exact artifact the developer is looking at, while every call produces a visible UI side effect and a bounded structured result. Issue IDs, source revisions, proposal IDs, classifications, and allowed next actions keep the workflow stateful instead of relying on prose. Imported snippets are marked untrusted, source is never exposed through an arbitrary execution tool, and tool calls cannot manufacture semantic approval.

### What the human and agent can do together

The agent can run and filter scans, inspect evidence, synchronize source and preview focus, prepare a small deterministic proposal, apply an exact mechanical proposal, rescan, undo when asked, and summarize/export the result. The developer can see all the evidence the agent used, supply semantic meaning, compare working and proposed renders, inspect the exact diff, and approve or reject contextual changes.

This makes a workflow that is awkward across a scanner, editor, preview, and general coding agent happen in one live browser workspace. The agent handles mechanical work; the human retains authority where a repair invents meaning or changes design.

### How it was built

Curbcut is a browser-only React 19, TypeScript, and Vite application deployed as a static site on Vercel. It has no login, database, or application backend.

parse5 8.0.1 parses canonical HTML with source locations and assigns revision-bound internal node IDs. Curbcut injects mapping metadata only into generated preview markup, so exported source remains clean. Deterministic remediations use validated raw-offset patches that preserve unrelated bytes.

Untrusted HTML is sanitized with DOMPurify and rendered into an iframe with `sandbox="allow-scripts"` but no same-origin permission. A nonce-based CSP blocks network access, navigation, forms, embeds, and untrusted scripts. axe-core 4.13.0 executes inside that opaque preview realm. A secret-channel, request-ID, source-revision `postMessage` protocol carries validated render, scan, and highlight commands back to the React store.

The top document registers exactly ten imperative WebMCP tools. Inputs are runtime-validated, responses are bounded, read-only and untrusted-content annotations are applied, stale revisions are rejected, and cancellation is handled. Apply accepts only the current exact proposal: mechanical proposals can proceed directly after preview, while contextual proposals require an approval token created only by the visible UI.

### Responsible scope

Curbcut does not claim automated WCAG compliance. axe-core covers only part of accessibility, and several issues require context, design review, assistive-technology testing, and disabled-user expertise. The MVP supports one static HTML/CSS artifact and deliberately excludes JavaScript, executable embeds, framework projects, arbitrary URL scanning, whole-document model rewrites, and automatic contrast changes.

### Evidence

The current M7 release gate validates 27 WebMCP trajectory cases across nine intents, with 55 passing unit checks and 15 passing Playwright browser checks. Coverage includes both direct mechanical Apply and contextual approval, the opaque-origin boundary, CSP/network/script isolation, parse5-to-DOM mapping, real axe scans, WebMCP registration and state effects, semantic input gates, conditional authority enforcement, Apply/rescan, Undo/rescan, canonical export, reload, a self-scan of Curbcut's own UI, and exact agreement between the live tool schemas and the eval snapshot.

TODO before submission: insert measured WebMCP evaluation results only after the final corpus has run on the named client/model/build. Do not replace this sentence with an estimate.

## Judge testing instructions

1. Open <https://curbcut-one.vercel.app> in ChatGPT's in-app browser or Chrome 149+ with WebMCP testing enabled.
2. Choose **Reset demo** if needed.
3. Send this prompt to the browser agent:

   > Fix the critical and serious accessibility issues in this checkout without changing the overall visual design. Preview each change before applying it, and ask me about anything that requires semantic judgment.

4. Confirm that scan/list/inspect calls populate the visible issue list, focus an exact source range, highlight the same rendered node, and appear in the local timeline.
5. Confirm the mechanical `tabindex` proposal is visible, applies without a redundant approval click, and clears after rescan.
6. For a label or image proposal, supply semantic text only if you agree with it. Review the working/proposed renders and exact diff, then choose **Approve this exact change**.
7. Confirm the intended finding disappears. Ask: **Undo the last repair and rescan.** Confirm exact source and the original finding return.
8. Ask: **Summarize the current changes and export the HTML.** Confirm a local canonical-source download with no Curbcut mapping attribute.

## Media checklist

- [ ] Upload a narrated video shorter than three minutes to YouTube with public visibility.
- [ ] Verify the video and audio from a signed-out browser.
- [ ] Show real tool discovery/calls, not a simulated invocation.
- [ ] Show scan evidence, synchronized source/preview focus, direct mechanical Apply, contextual visible approval, rescan, semantic review, and summary/export or Undo.
- [x] Capture a current scanned-workspace screenshot.
- [x] Capture a current proposed-diff/render/approval screenshot.
- [ ] Capture a current verified-result/timeline screenshot.
- [ ] Use narration only or properly licensed audio; do not add third-party trademarks or copyrighted music.

## Final submission checklist

- [ ] Join/registration status is confirmed in the submitting Devpost account.
- [x] Live URL works in a clean target-client session and remains available without payment or credentials.
- [x] GitHub repository is public; root license is detected; About description and homepage are set.
- [x] `npm test`, `npm run test:e2e`, and `npm run build` pass from the frozen commit.
- [ ] Final browser/client/build, prompt, limitations, and measured eval results agree across README, reports, video, and Devpost text.
- [ ] Every public screenshot and the video depict the frozen deployment.
- [ ] All URLs work from a signed-out browser.
- [ ] Submit before September 3, 2026 at 1:00 PM PT; use deadline morning only as recovery buffer.

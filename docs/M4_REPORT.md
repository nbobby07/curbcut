# Curbcut M4–M6 verification report

Date: August 27, 2026

Production: <https://curbcut-one.vercel.app>

Deployment: `dpl_HVM9JsqNK4zkHwFxKkZZdh3kCPc5`

## Result

- **M4 WebMCP workflow: PASS**
- **M5 human review and timeline: PASS**
- **M6 restrained UI quality: PASS**

## Product evidence

- Exactly ten stable tools register through `document.modelContext.registerTool`: `get_workspace`, `scan_accessibility`, `list_issues`, `inspect_issue`, `preview_remediation`, `apply_remediation`, `reject_remediation`, `undo_remediation`, `get_change_summary`, and `export_source`.
- The deployed browser-agent path ran real in-frame axe against the opaque sandbox and returned 6 rules / 6 affected nodes: 3 critical, 2 serious, and 1 moderate.
- `inspect_issue` selected the email input at line 16, column 13, offsets 458–523 and highlighted `cc-1-12` in the rendered preview.
- The deployed label journey proved preview is non-mutating, Apply fails with `APPROVAL_REQUIRED` before visible approval, Apply succeeds after human approval, and a real rescan removes the intended `label` finding.
- Automated browser coverage proves rejection, cancellation, stale-state refusal, image semantic gating, exact Undo/restoration, canonical export, source persistence after reload, and clean tool rediscovery.
- The bounded local timeline records agent calls and human approvals; current-revision issue events refocus source and preview while stale events cannot highlight old nodes.
- Curbcut's own application chrome has no critical or serious axe findings in the browser regression test.

## Verification commands

```text
npm test          6 files, 51 tests passed
npm run test:e2e  13 browser tests passed
npm run build     production Vite build passed
```

The production build contains 50 transformed modules. The main JavaScript bundle is 1,043.64 kB (299.72 kB gzip). Vite reports the expected >500 kB warning because axe-core and the in-frame controller remain local in the static application.

## Browser smoke

Target: Codex in-app browser, 1280×720 desktop plus 720×800 narrow breakpoint.

- no horizontal overflow at either breakpoint;
- all ten WebMCP tools discovered after deployment;
- scan/list/inspect updated the same visible React state;
- WebMCP timeline showed the three corresponding agent calls;
- console warnings/errors: none.

## Deliberate limits

- Tier A only: missing form label, positive `tabindex`, and image alternative.
- `button-name`, document language, contrast, and unknown findings remain explicit human-review/manual-edit cases.
- Source persists locally as convenience storage, not as a backup. Scan results, timeline, and undo history remain memory-only.
- The embedded axe bundle is intentionally not split out to a network-loaded runtime.

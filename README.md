# Curbcut

Curbcut is a local-first, browser-native accessibility repair workbench for editable static HTML and CSS. A developer and an external browser agent share the same source, opaque rendered preview, axe evidence, surgical repair proposals, human approval gate, verification results, and action timeline.

The MVP ships deterministic repairs for missing form labels, positive `tabindex`, and image alternatives. Semantic values always require visible human input and approval; Curbcut does not claim automated WCAG compliance.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL. WebMCP requires ChatGPT's in-app browser or Chrome 149+ with WebMCP testing enabled.

## Verify

```bash
npm test
npm run test:e2e
npm run build
```

Browser-critical isolation, CSP, axe, mapping, and WebMCP checks must run in real Chromium; DOM shims do not prove the opaque iframe boundary.

## WebMCP tools

- `get_workspace`
- `scan_accessibility`
- `list_issues`
- `inspect_issue`
- `preview_remediation`
- `apply_remediation`
- `reject_remediation`
- `undo_remediation`
- `get_change_summary`
- `export_source`

Suggested prompt:

> Fix the critical and serious accessibility issues in this checkout without changing the overall visual design. Preview each change before applying it, and ask me about anything that requires semantic judgment.

## Deployment

Persistent production URL: <https://curbcut-one.vercel.app>

## Documentation

- [M4 report](./docs/M4_REPORT.md)
- [M3 report](./docs/M3_REPORT.md)
- [M2 report](./docs/M2_REPORT.md)
- [Product requirements](./docs/PRODUCT_REQUIREMENTS.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [Feasibility spike report](./docs/SPIKE_REPORT.md)

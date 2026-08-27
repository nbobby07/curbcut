# Curbcut

Curbcut is a browser-native accessibility workspace for editable static HTML and CSS. M2 currently supports a secure rendered preview, real in-frame axe-core scanning, exact parse5 source mapping, issue inspection, and three WebMCP tools backed by the same visible React state.

No remediation, Apply, approval, Undo, or export workflow is included yet.

## Run locally

```bash
npm install
npm run dev
```

Open the printed URL. WebMCP requires ChatGPT's in-app browser or Chrome 149+ with WebMCP testing enabled.

## Verify

```bash
npm test
npm run build
```

Browser-critical isolation, CSP, axe, mapping, and WebMCP checks must run in real Chromium; DOM shims do not prove the opaque iframe boundary.

## M2 WebMCP tools

- `scan_accessibility`
- `list_issues`
- `inspect_issue`

Suggested prompt:

> Inspect the accessibility problem affecting the email field.

## Deployment

Persistent production URL: <https://curbcut-one.vercel.app>

## Documentation

- [M2 report](./docs/M2_REPORT.md)
- [Product requirements](./docs/PRODUCT_REQUIREMENTS.md)
- [Implementation plan](./docs/IMPLEMENTATION_PLAN.md)
- [Feasibility spike report](./docs/SPIKE_REPORT.md)

# Curbcut M7 eval-hardening report

Date: August 28, 2026 (PT)

## Result

- **Deterministic eval corpus and conditional-authority validation: PASS**
- **Current five-family source freeze and production deployment: PASS**
- **Native Chrome full ten-tool production workflow: PASS**
- **Codex in-app browser production source-mapping workflow: PASS**
- **Production security response headers: PASS**
- **Optional automated OpenAI trajectory corpus: pending a valid `OPENAI_API_KEY`**
- **Release code audit: CLEAR; Impeccable visual review: SHIP**

## Corpus and safety gates

`evals/webmcp-agent.json` contains 33 cases: three paraphrases for each of eleven intents, using the same ten stable tools as the application.

1. find high-impact issues;
2. inspect the email issue;
3. preview without Apply;
4. stop for human semantic judgment;
5. Apply a contextual proposal only after visible approval, then verify;
6. preview, wait for the exact proposed iframe to become `READY`, directly apply, and verify an exact mechanical proposal;
7. recover from an injected wrong-order contextual Apply refusal;
8. Undo, then rescan;
9. summarize, then export canonical HTML;
10. preview a human-confirmed button accessible name and stop before Apply;
11. preview a human-confirmed document language and stop before Apply.

Each expected tool call has a bounded mock output shaped like Curbcut's parsed WebMCP response. Scan IDs feed issue calls, issue IDs feed inspection/proposals, and exact proposal/change IDs feed Apply, verification, Undo, and summary calls. No mock contains canonical source or `data-curbcut-node` metadata.

`scripts/validate-evals.mjs` rejects:

- any count other than 33 cases / 11 intents / 3 paraphrases;
- duplicate cases, unknown tools, malformed calls, or more than six expected steps;
- absent, oversized, source-leaking, or invalid mock outputs;
- baseline/Undo scan metrics that differ from 3 critical, 3 serious, 0 moderate, and 5 outstanding human-decision/manual-review items;
- post-label scan/summary metrics that differ from 2 critical, 3 serious, 0 moderate, 5 open critical-or-serious issues, and 4 outstanding human-decision/manual-review items;
- a current change summary that omits `countsStatus:"CURRENT"`; application responses mark stale summaries `STALE` and omit stale issue totals;
- post-mechanical scan metrics that differ from 3 critical, 2 serious, 0 moderate, and 5 outstanding human-decision/manual-review items;
- a six-finding high-impact list that omits the serious mechanical `tabindex` issue;
- contextual Apply outside `apply_after_approval` or before a mocked `APPROVED` proposal;
- mechanical Apply before a visible exact `MECHANICAL` proposal;
- a preview that exposes Apply while its exact proposed iframe is still `RENDERING`, a mechanical preview that requires semantic approval, or a contextual preview that enables Apply before approval;
- wrong-order recovery without one paired `PROPOSAL_NOT_FOUND`/`APPROVAL_REQUIRED` response;
- preview or Apply in the human-judgment stop cases;
- button-name/document-language preview cases that omit their bounded human input, use the wrong family, or continue to Apply.

The wrong-order cases intentionally contain a refused contextual Apply in the prior transcript. The evaluated continuation must scan, list, inspect, preview, and stop for approval; an additional Apply is an unexpected call and fails trajectory matching. The separate mechanical cases must show the proposal, poll `get_workspace` until that exact proposed iframe is `READY`, apply its exact ID without a redundant semantic approval, and run an after-change scan.

## Live schema drift gate

`e2e/m7-evals.spec.ts` loads `evals/tools.json`, captures the definitions actually registered through `document.modelContext`, and compares the ten names, order, descriptions, and input schemas exactly. Expected definitions are read from the eval snapshot rather than duplicated in the test.

Current-source schema result and browser-suite inventory:

```text
npx playwright test "e2e/m7-evals.spec.ts"
1 passed

npx playwright test --list
24 tests in 5 files
```

The current suite includes a regression for the real offscreen mobile iframe/requestAnimationFrame scan failure and zero horizontal overflow. The frozen release candidate passed all 24 browser checks.

## Deterministic verification

```text
npm test
Eval corpus valid: 33 cases, 11 intents, 10 tools.
Test Files  8 passed (8)
Tests       85 passed (85)

npm run test:e2e
24 passed

npm run build
production build passed
```

The build retains a known non-failing large-chunk warning: the JavaScript bundle is about 306.69 KB gzip, dominated by the locally bundled axe-core runtime.

## Optional automated OpenAI corpus

Configured command:

```text
npm run eval:webmcp
webmcp-evals 0.0.3 local
model openai:gpt-5.4-mini-2026-03-17
2 runs, max 6 steps, console + JSON reporters
```

This optional model-backed run requires `OPENAI_API_KEY` and has not been used as release evidence. It is not a Curbcut runtime dependency or a submission gate.

The deterministic corpus validator, live-schema drift test, full Playwright suite, production build, and target-client smokes are the release evidence. When an optional OpenAI run is performed, report `passCount`, `failCount`, and `errorCount` from the generated JSON and preserve representative failure trajectories before changing schemas or prompts.

## Frozen production release evidence

Commit `b92ba81` on branch `codex/hackathon-ready` was built and deployed with Vercel CLI 59.9.1 as deployment `dpl_9w2FuuoUFPFWPtM1Gc7zSFVSxy9Z`, publicly aliased to <https://curbcut-one.vercel.app>.

Native Chrome through Chrome DevTools MCP 1.8 passed the complete production workflow:

- discovered all ten page-defined WebMCP tools;
- called `get_workspace`, scan, list, and inspect against the live sandbox, store, mapping, source selection, and preview highlight;
- created and rejected a contextual proposal without changing canonical source;
- inspected and previewed the mechanical positive-`tabindex` repair, polled the exact proposal from `RENDERING` to `READY`, applied it, and verified it with a real rescan;
- summarized and exported canonical source;
- undid the change and rescanned to restore the original finding;
- reloaded and rediscovered all ten tools;
- completed with zero console errors.

The Codex in-app browser independently exercised the same production deployment on August 28, 2026. `get_workspace`, `scan_accessibility`, `list_issues`, and `inspect_issue` passed; inspection selected the exact mapped source range, highlighted the corresponding preview node, populated the shared activity timeline, and produced zero console errors. The existing browser-local workspace already contained one persisted repair, so it correctly reported five current findings; fresh isolated production contexts were used for deterministic six-finding screenshots and regression evidence rather than overwriting local user data.

The public alias returned HTTP 200 and passed the configured response-header gate: CSP, `Permissions-Policy: tools=(self)`, `Origin-Agent-Cluster: ?1`, `Referrer-Policy: no-referrer`, `X-Content-Type-Options: nosniff`, and HSTS. Fresh production captures are stored in `docs/curbcut-scanned-workspace.png`, `docs/curbcut-mechanical-preview.png`, `docs/curbcut-verified-mechanical.png`, `docs/curbcut-remediation-preview.png`, and `docs/curbcut-medium-workspace.png`.

The release also passed an independent code audit (**CLEAR**) and Impeccable visual review (**SHIP**).

## Limits

- Deterministic trajectory cases test schema selection, arguments, ordering, extra calls, and recovery using mock outputs. They do not execute the page or prove UI state.
- Playwright separately covers the real sandbox, store, all five repair families, proposal readiness, concurrent mutation guards, conditional authority, Apply/rescan, Undo/rescan, import/export, reload, and schema registration boundaries.
- The runner scores tool trajectories, not whether the final natural-language question is well phrased. Human-judgment cases therefore enforce the stronger machine-checkable boundary: inspection is allowed, while preview and Apply are not expected.
- Scan security caps expose `countsStatus` and coverage metadata. If a result is truncated, issue counts are rendered as lower bounds and Apply/Undo verification is inconclusive rather than falsely successful.
- The optional OpenAI model-backed eval remains pending only because `OPENAI_API_KEY` is absent; no alternate-provider credential is required by Curbcut.

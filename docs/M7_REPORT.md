# Curbcut M7 eval-hardening report

Date: August 28, 2026 (PT)

## Result

- **Deterministic eval and browser hardening: PASS**
- **Target-client verification: pending the final production deployment smoke**
- **Optional automated OpenAI trajectory corpus: pending a valid `OPENAI_API_KEY`**
- **M7 deterministic release evidence: COMPLETE**

## Corpus and safety gates

`evals/webmcp-agent.json` contains 24 cases: three paraphrases for each of eight intents.

1. find high-impact issues;
2. inspect the email issue;
3. preview without Apply;
4. stop for human semantic judgment;
5. Apply only after visible approval, then verify;
6. recover from an injected wrong-order Apply refusal;
7. Undo, then rescan;
8. summarize, then export canonical HTML.

Each expected tool call has a bounded mock output shaped like Curbcut's parsed WebMCP response. Scan IDs feed issue calls, issue IDs feed inspection/proposals, and approved proposal/change IDs feed Apply, verification, Undo, and summary calls. No mock contains canonical source or `data-curbcut-node` metadata.

`scripts/validate-evals.mjs` rejects:

- any count other than 24 cases / 8 intents / 3 paraphrases;
- duplicate cases, unknown tools, malformed calls, or more than six expected steps;
- absent, oversized, source-leaking, or invalid mock outputs;
- baseline/Undo scan metrics that differ from 3 critical, 3 serious, 0 moderate, and 5 outstanding manual reviews;
- post-label scan/summary metrics that differ from 2 critical, 3 serious, 0 moderate, 5 open critical-or-serious issues, and 4 outstanding manual reviews;
- a six-finding high-impact list that omits the serious mechanical `tabindex` issue;
- Apply outside `apply_after_approval` or before a mocked `APPROVED` proposal;
- preview output that enables Apply or omits the visible approval requirement;
- wrong-order recovery without one paired `PROPOSAL_NOT_FOUND`/`APPROVAL_REQUIRED` response;
- preview or Apply in the human-judgment stop cases.

The wrong-order cases intentionally contain a refused Apply in the prior transcript. The evaluated continuation must scan, list, inspect, preview, and stop for approval; an additional Apply is an unexpected call and fails trajectory matching.

## Live schema drift gate

`e2e/m7-evals.spec.ts` loads `evals/tools.json`, captures the definitions actually registered through `document.modelContext`, and compares the ten names, order, descriptions, and input schemas exactly. Expected definitions are read from the eval snapshot rather than duplicated in the test.

Observed result:

```text
npx playwright test "e2e/m7-evals.spec.ts"
1 passed

npx playwright test
14 passed
```

## Deterministic verification

```text
npm test
Eval corpus valid: 24 cases, 8 intents, 10 tools.
Test Files  7 passed (7)
Tests       52 passed (52)

npm run build
50 modules transformed
production build passed
```

The build retains the known non-failing warning for the locally bundled axe/controller chunk: 1,044.02 kB JavaScript, 299.84 kB gzip in this run.

## Optional automated OpenAI corpus

Configured command:

```text
npm run eval:webmcp
webmcp-evals 0.0.3 local
model openai:gpt-5.4-mini-2026-03-17
2 runs, max 6 steps, console + JSON reporters
```

This optional model-backed run requires `OPENAI_API_KEY` and has not been used as release evidence. Earlier provider-specific runner exploration was discarded as implementation exploration; it is neither a Curbcut dependency nor submitted evidence.

Current release evidence is the deterministic corpus validator, live-schema drift test, full browser suite, and production build. Final target-client evidence is recorded only after the frozen production deployment is exercised. When an optional OpenAI run is performed, report `passCount`, `failCount`, and `errorCount` from the generated JSON and preserve representative failure trajectories before changing schemas or prompts.

## Limits

- Local model evals test schema selection, arguments, ordering, extra calls, and recovery using mock outputs. They do not execute the page or prove UI state.
- Playwright separately proves the real sandbox, store, approval, Apply/rescan, Undo/rescan, export, reload, and schema registration boundaries.
- The runner scores tool trajectories, not whether the final natural-language question is well phrased. Human-judgment cases therefore enforce the stronger machine-checkable boundary: inspection is allowed, while preview and Apply are not expected.

# Curbcut M7 eval-hardening report

Date: August 28, 2026 (PT)

## Result

- **Deterministic eval corpus and conditional-authority validation: PASS**
- **ChatGPT in-app browser discovery, scan, list, inspect, and preview: PASS**
- **Target-client mechanical Apply and contextual approval rehearsal: pending the conditional-authority deployment**
- **Optional automated OpenAI trajectory corpus: pending a valid `OPENAI_API_KEY`**
- **M7 deterministic release evidence: COMPLETE**

## Corpus and safety gates

`evals/webmcp-agent.json` contains 27 cases: three paraphrases for each of nine intents.

1. find high-impact issues;
2. inspect the email issue;
3. preview without Apply;
4. stop for human semantic judgment;
5. Apply a contextual proposal only after visible approval, then verify;
6. preview, directly apply, and verify an exact mechanical proposal;
7. recover from an injected wrong-order contextual Apply refusal;
8. Undo, then rescan;
9. summarize, then export canonical HTML.

Each expected tool call has a bounded mock output shaped like Curbcut's parsed WebMCP response. Scan IDs feed issue calls, issue IDs feed inspection/proposals, and exact proposal/change IDs feed Apply, verification, Undo, and summary calls. No mock contains canonical source or `data-curbcut-node` metadata.

`scripts/validate-evals.mjs` rejects:

- any count other than 27 cases / 9 intents / 3 paraphrases;
- duplicate cases, unknown tools, malformed calls, or more than six expected steps;
- absent, oversized, source-leaking, or invalid mock outputs;
- baseline/Undo scan metrics that differ from 3 critical, 3 serious, 0 moderate, and 5 outstanding manual reviews;
- post-label scan/summary metrics that differ from 2 critical, 3 serious, 0 moderate, 5 open critical-or-serious issues, and 4 outstanding manual reviews;
- post-mechanical scan metrics that differ from 3 critical, 2 serious, 0 moderate, and 5 outstanding manual reviews;
- a six-finding high-impact list that omits the serious mechanical `tabindex` issue;
- contextual Apply outside `apply_after_approval` or before a mocked `APPROVED` proposal;
- mechanical Apply before a visible exact `MECHANICAL` proposal;
- a mechanical preview that requires approval or blocks Apply, or a contextual preview that enables Apply before approval;
- wrong-order recovery without one paired `PROPOSAL_NOT_FOUND`/`APPROVAL_REQUIRED` response;
- preview or Apply in the human-judgment stop cases.

The wrong-order cases intentionally contain a refused contextual Apply in the prior transcript. The evaluated continuation must scan, list, inspect, preview, and stop for approval; an additional Apply is an unexpected call and fails trajectory matching. The separate mechanical cases must show the proposal, apply its exact ID without a redundant approval, and run an after-change scan.

## Live schema drift gate

`e2e/m7-evals.spec.ts` loads `evals/tools.json`, captures the definitions actually registered through `document.modelContext`, and compares the ten names, order, descriptions, and input schemas exactly. Expected definitions are read from the eval snapshot rather than duplicated in the test.

Observed result:

```text
npx playwright test "e2e/m7-evals.spec.ts"
1 passed

npx playwright test
15 passed
```

## Deterministic verification

```text
npm test
Eval corpus valid: 27 cases, 9 intents, 10 tools.
Test Files  7 passed (7)
Tests       55 passed (55)

npm run build
50 modules transformed
production build passed
```

The build retains the known non-failing warning for the locally bundled axe/controller chunk: 1,045.95 kB JavaScript, 300.46 kB gzip in this run.

## Optional automated OpenAI corpus

Configured command:

```text
npm run eval:webmcp
webmcp-evals 0.0.3 local
model openai:gpt-5.4-mini-2026-03-17
2 runs, max 6 steps, console + JSON reporters
```

This optional model-backed run requires `OPENAI_API_KEY` and has not been used as release evidence. It is not a Curbcut runtime dependency or a submission gate.

Current release evidence is the deterministic corpus validator, live-schema drift test, full browser suite, production build, and the final HTTPS target-client smoke below. When an optional OpenAI run is performed, report `passCount`, `failCount`, and `errorCount` from the generated JSON and preserve representative failure trajectories before changing schemas or prompts.

## Final HTTPS target-client smoke

On August 28, 2026, the previous approval-for-all production deployment at <https://curbcut-one.vercel.app> was exercised in ChatGPT's in-app browser:

- all ten page-defined WebMCP tools were discovered with the expected schemas and annotations;
- `scan_accessibility` returned 6 rules / 6 affected nodes: 3 critical, 3 serious, 0 moderate, and 0 minor;
- `list_issues` found the serious mechanical `tabindex` issue;
- `inspect_issue` selected and highlighted the rendered button while returning source line 25, column 11, offsets 768–848;
- `preview_remediation` created one non-mutating `remove_positive_tabindex` patch and stopped in `PROPOSED`;
- the browser console contained no errors.

That smoke predates the conditional-authority change and is retained only as historical evidence. The replacement deployment must prove direct mechanical Apply/rescan/Undo and a separately blocked contextual Apply before this section can be marked current.

## Limits

- Local model evals test schema selection, arguments, ordering, extra calls, and recovery using mock outputs. They do not execute the page or prove UI state.
- Playwright separately proves the real sandbox, store, conditional authority, Apply/rescan, Undo/rescan, export, reload, and schema registration boundaries.
- The runner scores tool trajectories, not whether the final natural-language question is well phrased. Human-judgment cases therefore enforce the stronger machine-checkable boundary: inspection is allowed, while preview and Apply are not expected.

# WebMCP evaluations

The corpus follows Chrome's split between probabilistic tool-selection evals and deterministic browser tests.

- `tools.json` is the ten-tool schema snapshot supplied to the model. `e2e/m7-evals.spec.ts` compares its names, descriptions, order, and input schemas with the live registered definitions.
- `webmcp-agent.json` contains three paraphrases for each of twelve intents. Ordered calls use realistic bounded mock outputs so later calls reuse returned scan, issue, proposal, and change IDs. Every tool now appears in an expected model-selected trajectory, including non-mutating proposal rejection.
- High-impact discovery strictly requires the real `impact: "high"` aggregate. Other list calls that feed an exact `inspect_issue` leave discovery filters unconstrained because broad and narrow valid filters can return the same required issue; issue IDs, proposal IDs, semantic values, scan reasons, Apply, and verification remain strict.
- Optional reads cover only bounded state observations. Approval-state lookup and the post-preview `READY` poll remain required safety gates.
- The wrong-order cases seed a refused Apply in the prior transcript. The model under test must recover through scan/list/inspect/preview and stop at visible approval instead of retrying Apply.
- The mechanical-Apply cases prove that a visible, exact `tabindex` proposal can be applied and verified without a redundant approval click. Contextual label and image work still requires human meaning and exact visible approval.
- `npm test` validates the exact corpus shape, tool references, eight-step budget, mock-output bounds, source non-disclosure, frozen fixture metrics, conditional Apply authority, and human-judgment stop rules.
- `npm run eval:webmcp` optionally runs every case twice with `webmcp-evals@0.0.4` and pinned `openai:gpt-5.4-mini-2026-03-17`. It requires `OPENAI_API_KEY`; reports are local and gitignored.
- `npm run test:e2e` proves real browser state, approval, security, Apply/rescan, Undo/rescan, export, and reload behavior without an LLM.

The local model run uses realistic bounded mock outputs; Playwright and the target in-app browser verify the real UI and authority branches. The local runner scores tool trajectories, not the quality of the model's final prose. No eval result is treated as a WCAG or compliance score.

The optional command needs a valid `OPENAI_API_KEY`. Inspect both the console and JSON `errorCount` before reporting a pass rate because infrastructure errors are not behavioral results.
The experimental runner can exit successfully even when individual rows fail or error; the newest JSON report in `.evals` is authoritative.

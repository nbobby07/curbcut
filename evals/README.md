# WebMCP evaluations

The corpus follows Chrome's split between probabilistic tool-selection evals and deterministic browser tests.

- `tools.json` is the ten-tool schema snapshot supplied to the model. `e2e/m7-evals.spec.ts` compares its names, descriptions, order, and input schemas with the live registered definitions.
- `webmcp-agent.json` contains three paraphrases for each of eight intents. Ordered calls use realistic bounded mock outputs so later calls reuse returned scan, issue, proposal, and change IDs.
- The wrong-order cases seed a refused Apply in the prior transcript. The model under test must recover through scan/list/inspect/preview and stop at visible approval instead of retrying Apply.
- `npm test` validates the exact corpus shape, tool references, six-step budget, mock-output bounds, source non-disclosure, frozen fixture metrics, approval-before-Apply, and human-judgment stop rules.
- `npm run eval:webmcp` optionally runs every case twice with the experimental `webmcp-evals@0.0.3` local runner and pinned `openai:gpt-5.4-mini-2026-03-17`. It requires `OPENAI_API_KEY`; reports are local and gitignored.
- `npm run test:e2e` proves real browser state, approval, security, Apply/rescan, Undo/rescan, export, and reload behavior without an LLM.

The published 0.0.3 runner's browser command requires Chrome Canary and cannot seed visible human approval. Curbcut therefore keeps the OpenAI local model-selection run optional and verifies the actual browser boundaries with Playwright and the target in-app browser. The local runner scores tool trajectories, not the quality of the model's final prose. No eval result is treated as a WCAG or compliance score.

The optional command needs a valid `OPENAI_API_KEY`. Inspect both the console and JSON `errorCount` before reporting a pass rate because infrastructure errors are not behavioral results.

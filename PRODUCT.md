# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Frontend developers repairing accessibility problems in static HTML and CSS while collaborating with an external browser agent.

## Product Purpose

Curbcut is a local-first accessibility repair workbench. It renders editable source, runs factual axe-core audits, maps rendered failures to exact source ranges, previews deterministic surgical changes, preserves human approval for semantic decisions, verifies repairs through rescans, and supports exact Undo and export.

Success means a developer and browser agent can operate the same visible artifact and stateful workflow without claiming automated WCAG compliance.

## Positioning

Repository and IDE tools primarily operate on code. Curbcut explores browser-native shared remediation: the human, rendered artifact, source evidence, and external browser agent all act through one live WebMCP workspace.

## Operating Context

The primary experience is one professional developer workspace with source on the left, a secure live preview in the center, issue and remediation evidence on the right, and a compact human/agent action timeline. The hackathon demonstration runs from a public static HTTPS deployment in ChatGPT's in-app browser or WebMCP-enabled Chrome.

## Capabilities and Constraints

- React, TypeScript, Vite, axe-core, parse5, DOMPurify, Vitest, and Playwright.
- Browser-only static deployment; no account, backend, database, arbitrary URL scanning, repository integration, framework integration, or built-in chat.
- Editable/imported HTML and CSS only. JavaScript, inline handlers, executable embeds, and arbitrary iframe content never execute in preview.
- Repairs are deterministic raw-offset patches. Imported source and snippets are untrusted.
- Semantic text, language, image purpose, and design-sensitive changes require visible human judgment.
- WebMCP tools expose bounded workspace actions, never arbitrary code or DOM execution.

## Brand Commitments

The working product name is Curbcut. The interface must feel like a precise professional frontend tool: light, restrained, direct, accessible, and free of generic AI gradients, neon security styling, excessive cards, or a chatbot panel.

## Evidence on Hand

- Public repository: https://github.com/nbobby07/curbcut
- Durable deployment: https://curbcut-one.vercel.app/
- Passing source-mapping, sandbox, axe, repair, WebMCP, eval-schema, and browser workflow tests documented under `docs/`.
- No customer claims, benchmarks, testimonials, or compliance certification exist and none may be invented.

## Product Principles

1. The human and agent always act on the same visible workspace state.
2. Evidence precedes remediation; preview precedes mutation.
3. Mechanical work may be automated, while semantic judgment remains human.
4. Exact source preservation and reversible edits matter more than broad rewrite coverage.
5. Report factual axe results and verification, never a synthetic compliance score.

## Accessibility & Inclusion

Curbcut itself must be keyboard navigable, screen-reader coherent, contrast-conscious, responsive, and continuously checked with axe-core. Automated findings are evidence, not proof of full WCAG conformance.

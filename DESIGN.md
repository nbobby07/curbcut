---
name: Curbcut
description: A precise inspection ledger for factual, reversible accessibility repair.
colors:
  ink: "#111827"
  muted-ink: "#526072"
  rule: "#d8dee8"
  rule-strong: "#c6cfdb"
  canvas: "#f4f7fb"
  surface: "#ffffff"
  surface-subtle: "#f7f9fc"
  selected: "#eef4ff"
  action-cobalt: "#0b5ed7"
  action-cobalt-hover: "#084eb5"
  proposal-amber: "#9f4f00"
  proposal-field: "#fff4df"
  verification-emerald: "#087a50"
  verification-field: "#e8f7f0"
  severity-red: "#b4232c"
  severity-field: "#feecee"
typography:
  title:
    fontFamily: "Inter, Aptos, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "16px"
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: "-0.015em"
  body:
    fontFamily: "Inter, Aptos, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.45
    letterSpacing: "normal"
  label:
    fontFamily: "Inter, Aptos, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "11px"
    fontWeight: 700
    lineHeight: 1.35
    letterSpacing: "normal"
  evidence:
    fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.6
    letterSpacing: "normal"
rounded:
  tag: "3px"
  field: "4px"
  control: "5px"
spacing:
  xs: "4px"
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "12px"
  pane: "14px"
components:
  button-primary:
    backgroundColor: "{colors.action-cobalt}"
    textColor: "{colors.surface}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    height: "32px"
  button-primary-hover:
    backgroundColor: "{colors.action-cobalt-hover}"
    textColor: "{colors.surface}"
    rounded: "{rounded.control}"
  button-secondary:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.control}"
    padding: "6px 10px"
    height: "32px"
  input:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.field}"
    padding: "7px 8px"
  status-proposal:
    backgroundColor: "{colors.proposal-field}"
    textColor: "{colors.proposal-amber}"
    typography: "{typography.label}"
    rounded: "{rounded.field}"
    padding: "4px 7px"
  status-verified:
    backgroundColor: "{colors.verification-field}"
    textColor: "{colors.verification-emerald}"
    typography: "{typography.label}"
    rounded: "{rounded.field}"
    padding: "4px 7px"
---

# Design System: Curbcut

## Overview

**Creative North Star: "Inspection Ledger"**

Curbcut is a cool-white, ruled developer workspace where source, rendered target, factual evidence, and an exact patch read as one inspection record. The system is compact, restrained, and operational: near-black ink carries facts, cobalt marks action and focus, amber separates proposals from mutations, emerald records verification, and red communicates severity or failure.

The visual world refuses the scanner-dashboard default. It uses panes, rows, footers, and ledgers instead of card grids, scores, charts, or theatrical security chrome. Human judgment remains visible in the sequence from evidence to proposed meaning to exact diff, apply, verification, and undo.

**Key Characteristics:**

- Cool white ruled panes with almost no decorative surface treatment.
- Dense system sans for operation and monospace for source, evidence, revisions, and diffs.
- Cobalt action, amber proposal, emerald verification, and restrained severity red.
- One synchronized workspace record rather than a collection of dashboard widgets.
- Text and structure always accompany color-coded state.

## Colors

The palette is a cool technical neutral field with sparse, semantic accents; color tells the workflow state and never decorates empty space.

### Primary

- **Action Cobalt:** Reserved for Scan, the current focus, selected records, mapped source, primary actions, and keyboard focus.

### Secondary

- **Proposal Amber:** Marks content that is rendered for review but has not changed working source.
- **Verification Emerald:** Marks successful verification, healthy connections, human approval, and restored state.

### Tertiary

- **Severity Red:** Marks critical impact, errors, and failed verification without becoming the page's dominant color.

### Neutral

- **Ledger Ink:** Primary text and high-confidence facts.
- **Secondary Ink:** Supporting descriptions, metadata, timestamps, and inactive controls.
- **Ledger Rules:** Separators that define panes, records, tables, and source regions.
- **Cool Canvas:** The recessed ground around the live preview and editor.
- **Paper Surface:** The default workspace and control surface.
- **Selected Wash:** The pale field behind a focused tab or inspection row.

### Named Rules

**The State-Is-Meaning Rule.** Cobalt means action or focus, amber means proposed and unapplied, emerald means verified or healthy, and red means severity or failure; never swap these roles for variety.

**The Redundancy Rule.** Every colored state also carries explicit text, structure, or an icon so color is never the only evidence.

## Typography

**Display Font:** Inter with Aptos and system sans fallbacks  
**Body Font:** Inter with Aptos and system sans fallbacks  
**Label/Mono Font:** UI monospace with SFMono-Regular and Consolas fallbacks

**Character:** Compact sans typography keeps the workspace calm at high density. Monospace is evidentiary, not decorative: it identifies source, selectors, exact diffs, revisions, and machine-derived status.

### Hierarchy

- **Title:** Bold compact type for the product name and selected rule identity.
- **Headline:** Semibold compact type for pane and timeline headings.
- **Body:** Small, readable type for explanations and decision copy, usually constrained to about 54 characters in empty and guidance states.
- **Label:** Small semibold or bold type for controls, field labels, statuses, and table headers.
- **Evidence:** Monospace type with a generous line height for editable source; tighter monospace may be used for selectors, diffs, locations, timestamps, and revision metadata.

### Named Rules

**The Evidence Voice Rule.** Use monospace only where exact characters, offsets, selectors, revisions, or machine evidence matter.

## Layout

The first desktop viewport is a bounded inspection workspace: a 56px utility bar, one three-pane work area, an action timeline anchored below it, and a narrow status footer. Source occupies the left pane, live preview the center, and evidence/remediation the right; the implementation gives the preview and evidence slightly more width than source while preserving useful minimums.

Pane headings, ruled rows, and aligned metadata create the ledger rhythm. Internal spacing is compact, usually 6–14px; major regions are separated by one-pixel rules rather than floating gaps. Sticky proposal actions remain attached to the evidence record while its detail scrolls.

Below 1040px, source and preview share a two-column row and evidence spans the full width beneath them. At 720px and below, a three-option Source / Preview / Evidence tab strip shows one full-width pane at a time; paired diffs stack vertically. The activity ledger may scroll horizontally rather than collapsing away factual columns.

**The One Record Rule.** Source location, rendered target, axe evidence, proposal, diff, and verification must stay visibly mappable through shared selection and aligned pane state.

## Elevation & Depth

The system is flat by default. One-pixel rules, cool tonal steps, inset selection outlines, and sticky adjacency establish depth. The live preview alone receives a minimal ambient shadow so the rendered artifact reads as contained without turning the workspace into a card collection.

### Shadow Vocabulary

- **Preview Containment** (`0 1px 2px rgb(17 24 39 / .04)`): Use only on the live preview frame.
- **Mapped Selection** (`inset 0 0 0 1px #0b5ed7`): Use to bind selected evidence to its mapped source or active issue row.

### Named Rules

**The Flat-Ledger Rule.** Surfaces remain flat at rest; use rules and tonal fields before shadow.

## Shapes

Corners are restrained and utilitarian: 5px for ordinary controls and health pills, 4px for fields, frames, status markers, and diffs, and 3px for compact actor tags. Tabs and ledger rows remain square so adjacent records read as one continuous instrument. Circular geometry is limited to tiny connection-state dots.

**The Joined-Surface Rule.** Do not round each pane, row, or diff half into an independent card; shared borders should make related evidence feel physically connected.

## Components

### Buttons

- **Shape:** Compact rectangular controls with gently softened corners and a 32px minimum height.
- **Primary:** Cobalt fill, white text, and strong weight for Scan and the current workflow-advancing action.
- **Hover / Focus:** Primary buttons deepen to cobalt-hover; all controls use a visible two-pixel cobalt focus outline with a two-pixel offset.
- **Secondary / Ghost:** White fill with a cool gray border; quiet actions use secondary ink. Approval is a cobalt outline so consent remains visually distinct from Apply.

### Chips

- **Style:** Compact text-first statuses use pale semantic fields and dark semantic text. Impact and actor labels are uppercase at evidence scale.
- **State:** Healthy and verified use emerald; proposed uses amber; selected or system-originated uses cobalt wash; critical and failed states use red.

### Cards / Containers

- **Corner Style:** Panes and ledger rows are square; only contained artifacts such as the preview frame and exact diff receive subtle rounding.
- **Background:** Paper white at rest, cool subtle fields for metadata and recessed evidence, and selected wash for current records.
- **Shadow Strategy:** Flat except for preview containment and inset selection.
- **Border:** One-pixel cool gray rules connect related regions.
- **Internal Padding:** Compact 9–14px padding for pane content and 5–11px for ledger rows.

### Inputs / Fields

- **Style:** White fill, one-pixel cool gray stroke, subtle 4px corners, and compact padding.
- **Focus:** Two-pixel cobalt outline; the source editor moves the outline inside the pane so it does not clip.
- **Error / Disabled:** Errors use red text and a pale red field; disabled controls retain their label but reduce opacity and remove the pointer cursor.

### Navigation

- **Style:** Source and preview choices use flush underline tabs. The active tab receives cobalt text, a two-pixel cobalt bottom rule, and selected wash; inactive tabs remain transparent with secondary ink.
- **Mobile:** A full-width three-column tab strip switches among Source, Preview, and Evidence while preserving the same active treatment.

### Inspection Row

Each issue is one border-separated grid row: severity, rule identity, required action, and mapped location. Hover, focus, and selection share the selected wash; selection adds an inset cobalt outline. The expanded record below it carries classification, target, raw HTML, repair controls, exact diff, approval, and verification without severing their relationship.

### Proposed Preview

The proposed render uses the same preview frame as working source, preceded by a full-width amber label that states **Not applied** and reports render/highlight status. The label is mandatory evidence, not decoration.

## Do's and Don'ts

### Do:

- **Do** keep source, preview, evidence, and timeline in one ruled workspace.
- **Do** make Scan the leading action and keep approval visually distinct from Apply.
- **Do** label proposed content as unapplied and verified content as verified or restored.
- **Do** preserve exact source, selector, diff, revision, and timestamp text in monospace.
- **Do** keep keyboard focus conspicuous and provide redundant state text.

### Don't:

- **Don't** turn the workspace into a scanner dashboard of scores, charts, or floating cards.
- **Don't** use gradients, neon security styling, glass effects, or a chatbot panel.
- **Don't** imply WCAG compliance from axe results or invent synthetic scores.
- **Don't** use amber, emerald, or red as decorative accents outside their semantic states.
- **Don't** separate a proposal from its exact diff, approval state, and rendered result.

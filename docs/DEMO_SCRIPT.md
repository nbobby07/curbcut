# Curbcut — final 2:40 demo script

Target runtime: **2:38–2:44**. Record the final deployed build in the actual ChatGPT desktop browser with Site Tools connected. Every tool call, source change, rescan, and approval shown must be real. Jump-cut only idle model/browser latency from the same chronological session.

## What this cut proves

1. ChatGPT discovers and calls Curbcut's page-defined WebMCP tools.
2. axe scans the real opaque preview; findings are not hard-coded.
3. Curbcut maps a rendered axe node to exact editable source and visibly highlights both.
4. A deterministic code proposal renders before canonical source changes.
5. A mechanical repair can be applied and verified by the agent.
6. A contextual repair cannot pass its human-approval boundary silently.
7. Summary, clean export, and exact Undo operate on the same workspace.

The unrelated profile-form fixture remains strong test/README evidence, but is intentionally omitted from the video. One coherent workflow is more legible than a rushed second import.

## Recording setup

- Record only after the final commit is deployed and the live app matches the current release UI.
- Use the current ChatGPT desktop app and GPT-5.6 Sol or Terra. Site Tools are currently unavailable with Luna.
- Open <https://curbcut-one.vercel.app> in ChatGPT's built-in browser. Use the ChatGPT/Codex conversation attached to that open browser page—not an unrelated repository task.
- Choose **Reset demo**, confirm the reset, and wait for the initial scan to settle before recording.
- Confirm the header says **WebMCP · 10 tools ready**. In the address bar, open **Site Tools → Available Site Tools** once and verify all ten Curbcut tools appear.
- Use a clean conversation. Arrange the screen about 35% conversation and 65% Curbcut. Keep the source, preview, evidence ledger, and action timeline readable.
- Record at 1920×1080 or higher, with browser zoom around 80–90%. Hide bookmarks, personal tabs, keys, notifications, and unrelated windows.
- Record the real screen workflow first. Then add the narration as voice-over so tool latency can be trimmed cleanly.
- Use no background music. Add short captions only where they clarify proof: **LIVE WEBMCP CALL**, **WORKING SOURCE UNCHANGED**, **HUMAN APPROVAL REQUIRED**, and **FRESH AXE RESCAN**.
- Record two complete takes. Upload the cleaner one only after checking public YouTube visibility, audio, legibility, and a runtime below 3:00 from a signed-out window.

## Prepare the first frame

Before capture, leave the clean reset workspace visible with the initial evidence ledger and **WebMCP · 10 tools ready** in the header. Put the first prompt in the attached browser-agent conversation, but do not send it yet:

> Use this page's Site Tools. From the current scan, inspect the positive tabindex issue and preview its deterministic remediation without applying it. Stop when the exact proposal is visible.

Start recording, hold for one second, then press Send.

## Exact 2:40 timeline

### 0:00–0:15 — Working product immediately

**Screen**

- Send the prepared prompt.
- Keep the agent conversation and Curbcut visible together.
- Show the real `list_issues`, `inspect_issue`, and `preview_remediation` calls in Curbcut's agent timeline.
- End this beat with the exact diff and proposed render visible by about 0:15.

**Say**

> This is Curbcut. ChatGPT calls page-defined WebMCP tools against the live workspace. It inspects axe's real finding, maps the rendered button to exact source, and produces this surgical proposal before changing canonical source.

**Edit**

Cut only a motionless wait. Preserve the send action, tool names, source focus, preview highlight, proposal, and their real order. The proposal must be visible by about 0:15.

### 0:15–0:33 — Show the division of responsibility

**Screen**

- Briefly open **Site Tools → Available Site Tools** and show the ten tools.
- Close it and point to the synchronized source, rendered preview, evidence ledger, and agent timeline.
- Keep **WebMCP · 10 tools ready** visible in the header.

**Say**

> axe supplies the detection. Curbcut supplies the secure preview, exact parse5 source mapping, guarded patches, and verification. WebMCP lets the external browser agent operate those same product actions through ten narrow tools—never arbitrary JavaScript or a whole-page rewrite.

### 0:33–0:51 — Non-mutating remediation preview

**Screen**

- Let `preview_remediation` finish.
- Pause on the exact Before/Proposed diff removing only `tabindex="2"`.
- Show the proposed rendered result and **No semantic approval needed**.
- Point back to working source to show it still contains the original attribute.

**Say**

> Preview is a real state, not an immediate mutation. Curbcut renders the proposed result and shows one surgical diff while canonical source remains unchanged. Removing a positive tabindex invents no meaning, so this exact mechanical proposal needs no redundant semantic approval.

### 0:51–1:14 — Apply and fresh verification

**Screen**

- Send:

  > Apply that exact mechanical proposal, rescan the changed workspace, and report whether the targeted finding disappeared.

- Show `apply_remediation`, the source revision changing, and `scan_accessibility` running again.
- Pause on the missing `tabindex` row, the verified repair, and the calibrated verification text.

**Say**

> Now ChatGPT applies only that proposal. The source revision changes, previous evidence becomes stale, and a fresh in-frame axe scan runs. The targeted finding disappears. Curbcut reports an automated check passed—not WCAG compliance—because accessibility still requires human and assistive-technology testing.

### 1:14–1:39 — Contextual repair and the hard human boundary

**Screen**

- Send:

  > Inspect the missing-label issue for the checkout email field. Use Curbcut's existing adjacent visible-text candidate without inventing new wording. Preview it only, and do not apply or claim approval.

- Show the email source selected and the rendered input highlighted.
- Pause on the proposed association with **Email address**, the diff, proposed render, and **Your approval is required**.

**Say**

> The email label is different. Curbcut can reuse the adjacent visible words “Email address” and prepare the association, but whether those words express the correct meaning is a human decision. The agent can preview it, but the tool surface cannot manufacture my approval.

### 1:39–2:05 — Human approval, agent completion, and export

**Screen**

- Click **Approve this exact change** yourself.
- Hold briefly on **Approved by human for diff…**.
- Send:

  > I approved the exact visible contextual proposal in Curbcut. Apply it, rescan, summarize applied and remaining work, then export the current HTML.

- Show the real Apply and rescan events, the label finding disappearing, the summary/timeline, and the download confirmation.

**Say**

> I inspect the exact diff and proposed render, then approve it in the visible UI. ChatGPT can now apply, rescan, summarize what changed, and export clean canonical HTML. Preview-only mapping metadata never contaminates the editor or download.

**Edit**

Trim only inactive waiting. Keep the approval click, Apply, fresh scan, summary, and export in their true sequence.

### 2:05–2:23 — Honest stopping points and shared history

**Screen**

- Point to the remaining image-alt and color-contrast evidence.
- Point to the action timeline, including agent events and the human approval event.

**Say**

> Curbcut also knows where to stop. Image purpose and design-sensitive contrast still need context, so it preserves evidence instead of guessing. The local timeline records what the agent did, what the human approved, and which revision was verified.

### 2:23–2:37 — Exact Undo

**Screen**

- Send:

  > Undo the last repair, rescan the restored source, and confirm whether its original finding returned.

- Jump-cut the idle wait.
- Show `undo_remediation`, the exact source restoration, the label finding returning after `scan_accessibility`, and the Undo event.

**Say**

> Undo restores the exact previous source snapshot. Another real axe scan restores the original label finding, proving that evidence and verification remain bound to the current source revision.

### 2:37–2:42 — Close

**Screen**

- End on the live URL, synchronized workspace, WebMCP status, and timeline.
- Hold the final frame for one second.

**Say**

> Curbcut: mechanics by the agent, meaning by the human, in one live browser workspace.

## Exact prompts, in order

1. **Inspect and preview**

   > Use this page's Site Tools. From the current scan, inspect the positive tabindex issue and preview its deterministic remediation without applying it. Stop when the exact proposal is visible.

2. **Mechanical Apply and verification**

   > Apply that exact mechanical proposal, rescan the changed workspace, and report whether the targeted finding disappeared.

3. **Contextual proposal only**

   > Inspect the missing-label issue for the checkout email field. Use Curbcut's existing adjacent visible-text candidate without inventing new wording. Preview it only, and do not apply or claim approval.

4. **Approved contextual completion and export**

   > I approved the exact visible contextual proposal in Curbcut. Apply it, rescan, summarize applied and remaining work, then export the current HTML.

5. **Undo**

   > Undo the last repair, rescan the restored source, and confirm whether its original finding returned.

## Truth and failure checks

- If Curbcut says manual mode or exposes fewer than ten tools, do not record. Restart/update the supported client and verify Site Tools again.
- If the agent answers in prose but Curbcut shows no corresponding timeline/tool event, WebMCP did not run. Do not use that footage.
- If Apply says the proposed result is not ready, send: **“Use get_workspace until this exact proposal reports READY, then apply that proposal and rescan. Do not create a replacement.”**
- If the wrong issue is selected, a proposal is replaced, or state becomes confusing, abandon the take. Reset and restart rather than explaining around it.
- Keep the application URL and `WebMCP · 10 tools ready` visible whenever practical.
- Never say WebMCP detects accessibility violations. axe detects; Curbcut maps, previews, applies, and verifies; WebMCP lets the external agent operate the shared workflow.
- Never call a cleared automated finding “accessible,” “compliant,” or “fixed forever.” Say the targeted automated check disappeared after a fresh rescan.
- Do not show secrets, API keys, private repository data, or the Windows file picker.
- Do not use unlicensed music, logos, footage, or third-party assets.

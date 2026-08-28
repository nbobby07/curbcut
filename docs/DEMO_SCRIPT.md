# Curbcut — under-three-minute demo script

Target runtime: **2:45–2:55**. Record the deployed application in the actual supported browser agent. Tool calls, source changes, scan results, and conditional approval must be real. Trim idle browser latency if necessary, but do not simulate calls, hide failures, or splice unrelated sessions into a false workflow.

## Before recording

- Use a clean browser session at <https://curbcut-one.vercel.app> and choose **Reset demo**.
- Confirm all ten tools are discoverable, the preview is ready, and a complete rehearsal succeeds.
- Arrange the browser-agent conversation and Curbcut so tool calls and visible UI effects can both be seen.
- Increase zoom only enough for source, preview, evidence, and the timeline to remain legible at 1080p.
- Turn off unrelated notifications and use narration without background music.
- Record two clean takes. Upload only after checking audio, text legibility, runtime, and public visibility from a signed-out browser.

## Narrated storyboard

| Time | Screen action | Narration |
|---|---|---|
| **0:00–0:15** | Cold-open on a **real** positive-`tabindex` proposal. Show its one-attribute diff, then let the agent call `apply_remediation`; flash the changed source. | “Curbcut has already shown the exact mechanical patch, so the browser agent can apply it without making me click through a meaningless approval.” |
| **0:15–0:28** | Reset the demo, show the checkout, and send the exact core prompt below with WebMCP-ready status visible. | “This is a local HTML and CSS workbench. The developer and an external browser agent operate the same live artifact through page-native WebMCP tools—there is no app backend or arbitrary code-execution tool.” |
| **0:28–0:50** | Let the agent call `scan_accessibility`, then `list_issues`. Show factual counts and issue rows populate. | “axe runs inside an opaque sandboxed preview. These are factual rule, impact, target, and node results—not an invented accessibility score.” |
| **0:50–1:08** | Agent calls `inspect_issue` for positive `tabindex`. Show exact source focus, rendered highlight, and the timeline entry. | “Inspect connects axe's rendered node to an exact parse5 source range. The human and agent now refer to the same element, evidence, and revision.” |
| **1:08–1:28** | Agent calls `preview_remediation`, then `apply_remediation` and an after-change scan. Keep the visible diff/result on screen. | “The proposal is visible and non-mutating first. Because removing this exact positive tabindex invents no meaning, the agent can apply it and verify that the finding disappears.” |
| **1:28–1:48** | Continue to the email label. Show the safe adjacent text candidate if offered, working/proposed renders, and exact diff. | “A label is different: Curbcut may reuse a safe visible-text candidate, but wording is semantic. The code is prepared; the decision stays with me.” |
| **1:48–2:06** | Click **Approve this exact change** yourself. Tell the agent, **I've approved this contextual proposal. Apply it and verify.** Show the rescan result. | “This approval is bound to the exact contextual diff and can only come from the visible interface. The tool cannot manufacture it.” |
| **2:06–2:22** | Pause on image-alt or contrast evidence. Do not apply an invented description or automatic color change. | “Image purpose, useful alternative text, and design-sensitive contrast work require context. The agent stops instead of silently guessing.” |
| **2:22–2:39** | Agent calls `get_change_summary` and `export_source`. Show the timeline distinguish mechanical and human-approved actions. | “The same workflow records what applied directly, what I approved, what verified, and what still needs review, then exports clean canonical source.” |
| **2:39–2:52** | Ask **Undo the last repair and rescan.** Show exact restoration and the original finding returning. | “Undo restores the exact previous source, and rescan restores the original evidence. The workflow remains local, inspectable, and reversible.” |
| **2:52–2:58** | End on the workspace, timeline, and live URL. | “Curbcut gives the browser agent useful autonomy without pretending accessibility judgment is mechanical.” |

## Exact prompts used on camera

Primary prompt:

> Fix the critical and serious accessibility issues in this checkout without changing the overall visual design. Preview each change before applying it, and ask me about anything that requires semantic judgment.

Approval follow-up:

> I've approved this contextual proposal. Apply it and verify.

Summary/export follow-up:

> Summarize what changed, tell me what still requires human review, and export the HTML.

Undo follow-up:

> Undo the last repair and rescan.

## Recording truth checks

- The visible proposal was created by a real WebMCP call during the recorded session.
- Mechanical Apply followed a visible exact proposal and required no redundant approval.
- The developer, not the agent, approved the contextual proposal.
- Both Apply calls used the exact current proposal ID and diff.
- Verification and Undo each used a fresh in-frame axe scan.
- No remaining finding was described as “fixed,” “safe,” or “compliant” without evidence.
- The final video is under three minutes, has audible narration, and uses no unlicensed music or third-party brand assets.

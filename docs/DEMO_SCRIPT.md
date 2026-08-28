# Curbcut — under-three-minute demo script

Target runtime: **2:45–2:55**. Record the deployed application in the actual supported browser agent. Tool calls, source changes, scan results, and approval must be real. Trim idle browser latency if necessary, but do not simulate calls, hide failures, or splice unrelated sessions into a false workflow.

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
| **0:00–0:12** | Cold-open on a **real** `preview_remediation` result: working source is unchanged, the proposed diff and proposed render are visible, and approval is still required. Then cut to the clean starting workspace with the browser-agent prompt ready. | “This browser agent has prepared an accessibility repair, but it has not changed the page. Curbcut makes the code diff, visual result, and human approval visible before mutation.” |
| **0:12–0:25** | Show the checkout preview and send the exact core prompt below. Keep the WebMCP-ready status visible. | “Curbcut is a local HTML and CSS workbench. The developer and an external browser agent operate the same live artifact through page-native WebMCP tools—there is no app backend and no arbitrary code-execution tool.” |
| **0:25–0:48** | Let the agent discover/call `scan_accessibility`, then `list_issues`. Show the factual counts and issue rows populate. Do not use a prerecorded scan result. | “The agent runs axe inside an opaque sandboxed preview. These are factual rule, impact, target, and node results—not an invented accessibility score.” |
| **0:48–1:05** | Agent calls `inspect_issue` for the email label finding. Show the exact HTML range focus and matching preview highlight. Briefly reveal the timeline entry. | “Inspect connects axe's rendered DOM node back to an exact parse5 source range. The developer and agent now refer to the same element, evidence, and revision.” |
| **1:05–1:28** | If the agent requests label wording, answer **Email address**. Agent calls `preview_remediation`. Show working versus proposed render and the small diff. | “The agent can prepare a surgical patch, but semantic text is a human decision. Preview is non-mutating: canonical source is still unchanged.” |
| **1:28–1:46** | Click **Approve this exact change** yourself. Tell the agent, **I've approved the visible proposal. Apply it and verify.** Agent calls `apply_remediation` and then `scan_accessibility` with the after-change reason. | “Approval is bound to this exact diff and can only happen in the visible interface. Now the agent can apply that proposal and run a real verification scan.” |
| **1:46–2:02** | Show the changed source, updated preview, verification notice, and absence of the original label finding. | “The source changed by a bounded raw-offset edit. The original label finding is gone after rescan; Curbcut does not turn that into a compliance claim.” |
| **2:02–2:20** | Ask the agent to continue. Pause on an image-alt or contrast finding and its human-review evidence. Do not apply an invented description or automatic color change. | “Accessibility is not only mechanical. Image purpose, good alternative text, and design-sensitive contrast work require context. The agent stops and asks instead of silently guessing.” |
| **2:20–2:38** | Agent calls `get_change_summary` and `export_source` for HTML. Show the local download and timeline correlating calls with the human approval. | “The agent summarizes what was applied, verified, and still needs review, then exports clean canonical source. Preview-only mapping metadata never enters the download.” |
| **2:38–2:52** | Ask **Undo the last repair and rescan.** Show exact source restoration and the original finding returning. | “Undo restores the exact previous source, and rescan restores the original evidence. The entire workflow remains local, inspectable, and reversible.” |
| **2:52–2:58** | End on the complete workspace and WebMCP timeline; show live URL briefly. | “Curbcut lets the browser agent handle the mechanics while the developer retains semantic judgment and authority over every change.” |

## Exact prompts used on camera

Primary prompt:

> Fix the critical and serious accessibility issues in this checkout without changing the overall visual design. Preview each change before applying it, and ask me about anything that requires semantic judgment.

Approval follow-up:

> I've approved the visible proposal. Apply it and verify.

Summary/export follow-up:

> Summarize what changed, tell me what still requires human review, and export the HTML.

Undo follow-up:

> Undo the last repair and rescan.

## Recording truth checks

- The visible proposal was created by a real WebMCP call during the recorded session.
- The developer, not the agent, clicked the approval control.
- Apply used the exact approved proposal ID and diff.
- Verification and Undo each used a fresh in-frame axe scan.
- No remaining finding was described as “fixed,” “safe,” or “compliant” without evidence.
- The final video is under three minutes, has audible narration, and uses no unlicensed music or third-party brand assets.

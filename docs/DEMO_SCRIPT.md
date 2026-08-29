# Curbcut — under-three-minute demo script

Target runtime: **2:35–2:42**. Record the deployed application in the actual supported browser agent. Tool calls, source changes, scan results, and conditional approval must be real. Trim idle browser latency if necessary, but do not simulate calls, hide failures, or splice unrelated sessions into a false workflow.

## Before recording

- Use a clean browser session at <https://curbcut-one.vercel.app> and choose **Reset demo**.
- Confirm all ten tools are discoverable, the preview is ready, and a complete rehearsal succeeds.
- Use GPT-5.6 Sol or Terra; native Site Tools are not enabled for Luna.
- Arrange the browser-agent conversation and Curbcut so tool calls and visible UI effects can both be seen.
- Increase zoom only enough for source, preview, evidence, and the timeline to remain legible at 1080p.
- Turn off unrelated notifications and use narration without background music.
- Record two clean takes. Upload only after checking audio, text legibility, runtime, and public visibility from a signed-out browser.

## Narrated storyboard

| Time | Screen action | Narration |
|---|---|---|
| **0:00–0:12** | Cold-open on a **real** positive-`tabindex` proposal with the native Site Tools panel visible. Let the agent call `apply_remediation`; flash the changed source. | “axe finds the evidence. Curbcut maps and patches it. Humans decide meaning.” |
| **0:12–0:24** | Reset the demo and send the core prompt using **Copy agent prompt**. | “A developer and an external browser agent operate this same live HTML and CSS artifact through page-native WebMCP.” |
| **0:24–0:40** | Show **Available site tools: 10**, then let the agent scan/list and briefly show **Recently used**. | “These are ten real product tools. axe runs inside the opaque preview; the results are live evidence, not stored fixture constants or an invented score.” |
| **0:40–0:55** | Agent inspects positive `tabindex`. Show exact source focus, rendered highlight, and timeline event. | “Inspect maps axe's rendered node to an exact parse5 source range, so the human and agent point at the same element and revision.” |
| **0:55–1:13** | Agent previews, waits for `READY`, applies, and rescans. Show the finding disappear. | “The non-mutating proposal shows one surgical diff first. This repair invents no meaning, so the agent can apply and verify it directly.” |
| **1:13–1:36** | Preview the email-label repair. Show prepared code and proposed render; approve the exact change yourself, then Apply/rescan. | “Label wording is semantic. Curbcut prepares the code, but my approval is bound to this exact diff and cannot be manufactured by a tool.” |
| **1:36–1:51** | Pause on image-alt or contrast evidence. | “Image purpose and design-sensitive contrast need context. The agent stops instead of silently guessing or claiming compliance.” |
| **1:51–2:05** | Agent summarizes and exports clean HTML. | “The timeline separates mechanical and human-approved work, and export contains canonical source with no mapping metadata.” |
| **2:05–2:18** | Ask for Undo/rescan. Show exact restoration and the finding returning. | “Undo restores exact source bytes; a fresh axe scan restores the original evidence.” |
| **2:18–2:34** | Import `examples/profile-form.html` and `.css`, then scan. Show only its live `label` and `tabindex` findings. | “A different artifact produces different findings through the same sandbox, source mapper, and repair engine.” |
| **2:34–2:40** | End on the live workspace and URL. | “Rendered DOM to exact source range to visible patch to verified rescan. Humans still decide meaning.” |

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

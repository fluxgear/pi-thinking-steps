import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { deriveThinkingSteps, iconForThinkingRole, inferThinkingRole, parseThinkingMode, summarizeThinkingText } from "../parse.js";
import { assertPatchableAssistantMessageComponent, assertThinkingStepsTheme, retainThinkingStepsPatch } from "../internal-patch.js";
import { renderThinkingStepsLines } from "../render.js";
import { clearActiveThinkingState, setActiveThinkingState, setThinkingStepsMode } from "../state.js";
import type { ThinkingThemeLike } from "../types.js";

function stripAnsi(text: string): string {
	return text.replace(/\x1b\[[0-9;]*m/g, "");
}

function createPlainTheme(): ThinkingThemeLike {
	return {
		fg: (_color, text) => text,
		bold: (text) => text,
	};
}

function createAnsiTheme(): ThinkingThemeLike {
	return {
		fg: (color, text) => `[${color === "accent" ? "36" : "37"}m${text}[39m`,
		bold: (text) => `[1m${text}[22m`,
	};
}

function getPackageRoot(packageName: string): string {
	const entryUrl = import.meta.resolve(packageName);
	const entryPath = fileURLToPath(entryUrl);
	return dirname(dirname(entryPath));
}

async function importPiInternal<TModule>(relativePath: string): Promise<TModule> {
	const packageRoot = getPackageRoot("@mariozechner/pi-coding-agent");
	const moduleUrl = pathToFileURL(join(packageRoot, relativePath)).href;
	return (await import(moduleUrl)) as TModule;
}

describe("deriveThinkingSteps", () => {
	it("splits paragraphs and list items into meaningful steps", () => {
		const steps = deriveThinkingSteps([
			{
				contentIndex: 0,
				text: `I need to inspect the current assistant renderer.\n\n1. Compare the extension API to the TUI internals.\n2. Verify how thinking visibility is toggled.`,
			},
		]);

		assert.equal(steps.length, 3);
		assert.equal(steps[0]?.summary, "Inspect the current assistant renderer.");
		assert.equal(steps[1]?.summary, "Compare the extension API to the TUI internals.");
		assert.equal(steps[2]?.summary, "Verify how thinking visibility is toggled.");
		assert.equal(steps[0]?.icon, "◫");
		assert.equal(steps[2]?.icon, "✓");
	});

	it("keeps markdown heading paragraphs attached to their following body", () => {
		const steps = deriveThinkingSteps([
			{
				contentIndex: 0,
				text: "## Inspecting render pipeline\n\nVerify that refreshes can be triggered safely.",
			},
		]);

		assert.equal(steps.length, 1);
		assert.equal(steps[0]?.body, "## Inspecting render pipeline\n\nVerify that refreshes can be triggered safely.");
		assert.match(steps[0]?.summary ?? "", /Inspect render pipeline|Verify that refreshes can be triggered safely/);
	});

	it("keeps emphasized heading paragraphs attached to their following body", () => {
		const steps = deriveThinkingSteps([
			{
				contentIndex: 0,
				text: "**Inspecting event listeners**\n\nVerify that refreshes can be triggered safely.",
			},
		]);

		assert.equal(steps.length, 1);
		assert.equal(steps[0]?.body, "**Inspecting event listeners**\n\nVerify that refreshes can be triggered safely.");
		assert.match(steps[0]?.summary ?? "", /Inspect event listeners|Verify that refreshes can be triggered safely/);
	});

	it("creates a faithful fallback summary for redacted reasoning", () => {
		const steps = deriveThinkingSteps([{ contentIndex: 2, text: "", redacted: true }]);
		assert.equal(steps.length, 1);
		assert.equal(steps[0]?.summary, "Reasoning is hidden by the provider.");
	});
});

describe("patch guards", () => {
	it("rejects incompatible AssistantMessageComponent exports with a clear error", () => {
		assert.throws(
			() => assertPatchableAssistantMessageComponent({ prototype: {} }),
			/missing updateContent, setHideThinkingBlock, setHiddenThinkingLabel/,
		);
	});

	it("rejects incompatible theme exports with a clear error", () => {
		assert.throws(
			() => assertThinkingStepsTheme({ fg: () => "ok" }),
			/interactive theme export is incompatible/,
		);
	});
});


describe("iconForThinkingRole", () => {
	it("uses a restrained icon set with distinct inspect and search glyphs", () => {
		assert.equal(iconForThinkingRole("inspect"), "◫");
		assert.equal(iconForThinkingRole("search"), "⌕");
		assert.equal(iconForThinkingRole("plan"), "◇");
		assert.equal(iconForThinkingRole("compare"), "↔");
		assert.equal(iconForThinkingRole("verify"), "✓");
		assert.equal(iconForThinkingRole("write"), "✎");
		assert.equal(iconForThinkingRole("error"), "!");
		assert.equal(iconForThinkingRole("default"), "·");
	});
});
describe("summarizeThinkingText", () => {
	it("strips leading first-person filler without inventing new meaning", () => {
		assert.equal(
			summarizeThinkingText("I need to compare the current renderer with Pi's extension hooks."),
			"Compare the current renderer with Pi's extension hooks.",
		);
	});

	it("prefers concrete action clauses over truncated meta-thinking", () => {
		assert.equal(
			summarizeThinkingText(
				"I’m considering how we can connect and orient ourselves. It seems like using Larra edit workflows could be helpful here. I need to know the arguments for it, so I might look into using MCP to describe the tools available to me. It could be useful to inspect the connection first, just to make sure everything is set up right before diving into the workflows. Let's see what we can find!",
			),
			"Use Larra edit workflows, then inspect the connection first.",
		);
	});

	it("prefers concrete actions over meta setup in a real transcript delta", () => {
		const summary = summarizeThinkingText(
			"I think I need to gather project instructions and workspace details, possibly through Larra. I should really look into using the get_project_instructions function, but my project memory might have a conflicting inference about being \"Likely Python-based\" when it's actually TypeScript. I need to flag that! This could mean there's stale or inaccurate memory that needs updating later. Before moving forward, I should have a mandatory 5-line checkpoint for the developer after loading the current context. Let me retrieve the relevant instructions as well.",
		);
		assert.match(summary, /gather project instructions and workspace details|look into using the get_project_instructions function/i);
		assert.doesNotMatch(summary, /possibly through Larra|flag that|Clarifying project details/i);
	});

	it("prefers the concrete next step over contemplative framing in a real transcript delta", () => {
		const summary = summarizeThinkingText(
			"I’m contemplating whether I need to get workspaces or if that's necessary. Maybe I should look into using linked workspaces instead? I think the next step might be to inspect the list of workspaces I currently have available. I’m curious about what options I have and which would be the most efficient for my needs. Let's take a closer look and see what makes the most sense!",
		);
		assert.match(summary, /inspect the list of workspaces/i);
		assert.doesNotMatch(summary, /contemplating whether I need to get workspaces/i);
	});

	it("avoids negative tool-availability chatter in a real transcript delta", () => {
		const summary = summarizeThinkingText(
			"I need to find actual examples of transcripts, perhaps starting with the Larra transcript. While there's a tool for it, I might not retrieve the transcripts directly. I could search for session history or even look for previous sessions with relevant prompt files. Real examples would be better than synthetic ones. Gathering some actual thinking deltas from conversations or prompts would provide insights, so I should explore logs for phrases that show reasoning styles.",
		);
		assert.match(summary, /find actual examples of transcripts|search for session history|explore logs/i);
		assert.doesNotMatch(summary, /might not retrieve the transcripts directly|while there's a tool for it|worth checking out/i);
	});

	it("keeps the concrete retry step instead of the heading label or repair aside in a real transcript delta", () => {
		const summary = summarizeThinkingText(
			"I plan to retry once and check the index state. This involves direct actions like \"retry once\" and \"check,\" indicating some uncertainty that I should include. I don't necessarily need to stick to a classical formula since the user is asking for a deterministic classical pipeline. I'll keep some centrality based on tf-like methods. Since the file is currently broken, I’ll write the entire parse.ts with all contents while being careful and replacing only the summarize function. It should be manageable at about 400 lines.",
		);
		assert.match(summary, /retry once and check the index state/i);
		assert.doesNotMatch(summary, /Retrying and checking state|write the entire parse|since the file is currently broken/i);
	});

	it("deduplicates redundant candidates", () => {
		const summary = summarizeThinkingText(
			"Found TS2322 in render.ts. Found TS2322 in render.ts. Retry npm test after updating the type.",
		);
		assert.equal((summary.match(/TS2322/g) ?? []).length, 1);
	});

	it("preserves failure semantics", () => {
		const summary = summarizeThinkingText(
			"Ran npm test and it failed with TS2322 in render.ts. Need to update the type mismatch before retrying.",
		);
		assert.ok(summary.toLowerCase().includes("failed"));
		assert.ok(summary.includes("TS2322"));
	});

	it("preserves unverified suspicion instead of restating it as fact", () => {
		const summary = summarizeThinkingText(
			"This looks like a stale lock, but I haven't verified it yet. I will retry once and check the index state.",
		);
		assert.ok(/looks like|haven't verified/i.test(summary));
		assert.ok(!summary.includes("This is a stale lock."));
	});

	it("does not imply a commit completed when it did not", () => {
		const summary = summarizeThinkingText(
			"Prepared the commit message, but the commit did not complete because .git/index.lock exists.",
		);
		assert.ok(summary.toLowerCase().includes("did not complete"));
		assert.ok(!summary.toLowerCase().includes("commit completed"));
	});

	it("filters noisy tool-log lines", () => {
		const summary = summarizeThinkingText(
			"12:41:22\n-----\nThinking...\n> npm test\nloading...\nFound TS2322 in render.ts and need to retry after patching.",
		);
		assert.ok(summary.includes("TS2322"));
		assert.ok(!/Thinking|loading|12:41:22/.test(summary));
	});

	it("handles very short deltas cleanly", () => {
		assert.equal(
			summarizeThinkingText("Compare the extension API to the TUI internals."),
			"Compare the extension API to the TUI internals.",
		);
	});

	it("enforces the summary budget on long input", () => {
		const summary = summarizeThinkingText(
			"Found a lock in .git/index.lock. The commit did not complete. Need to inspect the running git process, verify the lock owner, and retry only after the repository is idle. Also compare whether Larra or git created the lock and preserve the exact failure semantics.",
		);
		assert.ok(summary.length <= 84);
	});

	it("handles mixed bullets and prose", () => {
		const summary = summarizeThinkingText(
			"We need to decide the safest next step.\n\n- Found TS2322 in render.ts.\n- Retry npm test after patching the type.\n\nThat should confirm the fix.",
		);
		assert.ok(summary.includes("TS2322"));
		assert.ok(/Retry|retry/.test(summary));
	});

	it("returns deterministic output for identical input", () => {
		const input = "Found TS2322 in render.ts. Retry npm test after patching the type mismatch.";
		assert.equal(summarizeThinkingText(input), summarizeThinkingText(input));
	});
});
describe("inferThinkingRole", () => {
	it("prefers inspect over weak write or verify cues in exploratory reasoning", () => {
		assert.equal(
			inferThinkingRole(
				"Use Larra edit workflows, then inspect the connection first. I need to describe the tools available and orient myself.",
			),
			"inspect",
		);
	});

	it("still detects concrete verification steps", () => {
		assert.equal(
			inferThinkingRole("Verify that refreshes can be triggered safely."),
			"verify",
		);
	});
});
describe("renderThinkingStepsLines", () => {
	const theme = createPlainTheme();
	const steps = deriveThinkingSteps([
		{
			contentIndex: 0,
			text: `Inspect the current renderer implementation.\n\nCompare how visibility toggling works.\n\nVerify the refresh path after mode changes.`,
		},
	]);

	it("collapsed mode renders exactly one summary line", () => {
		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "collapsed",
			steps,
			activeStepId: steps[2]?.id,
			isActive: false,
			nowMs: 0,
		});
		assert.equal(lines.length, 1);
		assert.match(lines[0] ?? "", /Thinking/);
		assert.match(lines[0] ?? "", /Verify the refresh path after mode changes/);
	});

	it("collapsed mode wraps long summaries instead of truncating them with an ellipsis", () => {
		const longSummarySteps = deriveThinkingSteps([
			{
				contentIndex: 0,
				text: "I’m considering how we can connect and orient ourselves. It seems like using Larra edit workflows could be helpful here. I need to know the arguments for it, so I might look into using MCP to describe the tools available to me. It could be useful to inspect the connection first, just to make sure everything is set up right before diving into the workflows. Let's see what we can find!",
			},
		]);
		const lines = renderThinkingStepsLines(theme, 48, {
			mode: "collapsed",
			steps: longSummarySteps,
			activeStepId: longSummarySteps[0]?.id,
			isActive: false,
			nowMs: 0,
		});
		assert.ok(lines.length > 1);
		const normalized = stripAnsi(lines.join(" "))
			.replace(/[│·]/g, " ")
			.replace(/\bThinking\b/g, " ")
			.replace(/\s+/g, " ")
			.trim();
		assert.ok(normalized.includes("Use Larra edit workflows, then inspect the connection first."));
		assert.ok(!normalized.includes("…"));
	});

	it("collapsed mode renders inline formatting instead of raw markdown markers", () => {
		const ansiTheme = createAnsiTheme();
		const markdownSummarySteps = deriveThinkingSteps([
			{
				contentIndex: 0,
				text: "Inspect `render.ts` carefully.",
			},
		]);
		const lines = renderThinkingStepsLines(ansiTheme, 120, {
			mode: "collapsed",
			steps: markdownSummarySteps,
			activeStepId: markdownSummarySteps[0]?.id,
			isActive: false,
			nowMs: 0,
		});
		assert.equal(lines.length, 1);
		assert.ok((lines[0] ?? "").includes("[1m"));
		const joined = stripAnsi(lines.join("\n"));
		assert.ok(joined.includes("Inspect render.ts carefully."));
		assert.ok(!joined.includes("`render.ts`"));
	});

	it("summary mode renders one summarized line per step with pipe connectors", () => {
		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "summary",
			steps,
			activeStepId: steps[1]?.id,
			isActive: false,
		});
		assert.equal(stripAnsi(lines[0] ?? ""), "┆ Thinking Steps · Summary");
		const stepLines = lines.filter((line) => /^(├─|└─)/.test(stripAnsi(line)));
		assert.equal(stepLines.length, 3);
		assert.ok(stepLines.some((line) => stripAnsi(line).includes("◫ Inspect the current renderer implementation.")));
		assert.ok(stepLines.some((line) => stripAnsi(line).includes("↔ Compare how visibility toggling works.")));
		assert.ok(stepLines.some((line) => stripAnsi(line).includes("✓ Verify the refresh path after mode changes.")));
	});

	it("summary mode strips raw markdown markers from visible summaries", () => {
		const markdownSummarySteps = deriveThinkingSteps([
			{
				contentIndex: 0,
				text: "Inspect `render.ts` carefully.\n\nVerify that **refreshes** can be triggered safely.",
			},
		]);
		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "summary",
			steps: markdownSummarySteps,
			activeStepId: undefined,
			isActive: false,
		});
		const joined = stripAnsi(lines.join("\n"));
		assert.ok(joined.includes("Inspect render.ts carefully."));
		assert.ok(joined.includes("Verify that refreshes can be triggered safely."));
		assert.ok(!joined.includes("`render.ts`"));
		assert.ok(!joined.includes("**refreshes**"));
	});

	it("expanded mode renders full step details with cleaner continuation pipes", () => {
		const lines = renderThinkingStepsLines(theme, 64, {
			mode: "expanded",
			steps,
			activeStepId: undefined,
			isActive: false,
		});
		const joined = stripAnsi(lines.join("\n"));
		assert.ok(joined.includes("Thinking Steps · Expanded"));
		assert.ok(joined.includes("├─ ◫ Inspect the current renderer implementation."));
		assert.ok(joined.includes("│  Inspect the current renderer implementation."));
		assert.ok(joined.includes("└─ ✓ Verify the refresh path after mode changes."));
		assert.ok(joined.includes("   Verify the refresh path after mode changes."));
		assert.ok(!joined.includes("│  Verify the refresh path after mode changes."));
	});

	it("expanded mode renders markdown as terminal formatting instead of raw markers", () => {
		const markdownSteps = deriveThinkingSteps([
			{
				contentIndex: 0,
				text: "## Inspecting `render.ts`\n\n- Verify that **refreshes** can be triggered safely.",
			},
		]);
		const lines = renderThinkingStepsLines(theme, 80, {
			mode: "expanded",
			steps: markdownSteps,
			activeStepId: undefined,
			isActive: false,
		});
		const joined = stripAnsi(lines.join("\n"));
		assert.ok(joined.includes("Inspecting render.ts"));
		assert.ok(joined.includes("• Verify that refreshes can be triggered safely."));
		assert.ok(!joined.includes("## Inspecting `render.ts`"));
		assert.ok(!joined.includes("- Verify that **refreshes** can be triggered safely."));
		assert.ok(!joined.includes("**"));
		assert.ok(!joined.includes("`"));
	});

	it("collapsed active rendering animates without using italics", () => {
		const first = renderThinkingStepsLines(theme, 120, {
			mode: "collapsed",
			steps,
			activeStepId: steps[2]?.id,
			isActive: true,
			nowMs: 0,
		});
		const second = renderThinkingStepsLines(theme, 120, {
			mode: "collapsed",
			steps,
			activeStepId: steps[2]?.id,
			isActive: true,
			nowMs: 360,
		});
		assert.equal(first.length, 1);
		assert.equal(second.length, 1);
		assert.notEqual(first[0], second[0]);
		assert.ok(!/\x1b\[3m|\x1b\[23m/.test(first[0] ?? ""));
		assert.ok(!/\x1b\[3m|\x1b\[23m/.test(second[0] ?? ""));
	});
});

describe("integration patch", () => {
	it("patches AssistantMessageComponent so mode switching changes live thinking rendering", async () => {
		const release = await retainThinkingStepsPatch();
		try {
			const [{ AssistantMessageComponent }, { initTheme }] = await Promise.all([
				importPiInternal<{ AssistantMessageComponent: new (message?: unknown, hideThinkingBlock?: boolean) => { render(width: number): string[]; setHiddenThinkingLabel(label: string): void } }>(
					"dist/modes/interactive/components/assistant-message.js",
				),
				importPiInternal<{ initTheme: (name?: string, quiet?: boolean) => void }>(
					"dist/modes/interactive/theme/theme.js",
				),
			]);
			initTheme("dark", true);

			const message = {
				role: "assistant",
				api: "anthropic-messages",
				provider: "anthropic",
				model: "claude-sonnet-4-5",
				timestamp: 123,
				usage: {
					input: 0,
					output: 0,
					cacheRead: 0,
					cacheWrite: 0,
					totalTokens: 0,
					cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
				},
				stopReason: "stop",
				content: [
					{
						type: "thinking",
						thinking:
							"Inspect the current rendering pipeline.\n\nCompare the public extension hooks against AssistantMessageComponent.\n\nVerify that refreshes can be triggered safely.",
					},
					{ type: "text", text: "Final answer." },
				],
			} as const;

			setThinkingStepsMode("summary");
			clearActiveThinkingState();
			const component = new AssistantMessageComponent(message, false);
			let lines = component.render(100).map(stripAnsi);
			assert.ok(lines.some((line) => line.includes("Thinking Steps · Summary")));
			assert.equal(lines.filter((line) => line.startsWith("├─") || line.startsWith("└─")).length, 3);
			assert.ok(lines.some((line) => line.includes("Final answer.")));

			setThinkingStepsMode("collapsed");
			setActiveThinkingState({ active: true, messageTimestamp: 123, contentIndex: 0 });
			component.setHiddenThinkingLabel("refresh");
			lines = component.render(100).map(stripAnsi);
			assert.ok(lines.some((line) => line.includes("Thinking")));
			assert.equal(lines.filter((line) => line.includes("Thinking")).length, 1);
			assert.ok(lines.some((line) => line.includes("Verify that refreshes can be triggered safely")));
			assert.ok(lines.every((line) => !/\x1b\[3m|\x1b\[23m/.test(line)));
		} finally {
			clearActiveThinkingState();
			setThinkingStepsMode("summary");
			await release();
		}
	});
});

describe("parseThinkingMode", () => {
	it("accepts exact and shorthand mode names", () => {
		assert.equal(parseThinkingMode("collapsed"), "collapsed");
		assert.equal(parseThinkingMode("summary"), "summary");
		assert.equal(parseThinkingMode("expanded"), "expanded");
		assert.equal(parseThinkingMode("e"), "expanded");
		assert.equal(parseThinkingMode("unknown"), undefined);
	});
});

console.log("thinking-steps tests passed");

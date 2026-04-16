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

	it("expanded mode renders full step details with connected pipes", () => {
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
		assert.ok(joined.includes("│  Verify the refresh path after mode changes."));
	});

	it("expanded mode strips markdown emphasis markers from visible thinking text", () => {
		const emphasizedSteps = deriveThinkingSteps([
			{
				contentIndex: 0,
				text: "**Inspecting event listeners**\n\nVerify that refreshes can be triggered safely.",
			},
		]);
		const lines = renderThinkingStepsLines(theme, 80, {
			mode: "expanded",
			steps: emphasizedSteps,
			activeStepId: undefined,
			isActive: false,
		});
		const joined = stripAnsi(lines.join("\n"));
		assert.ok(joined.includes("Inspecting event listeners"));
		assert.ok(!joined.includes("**Inspecting event listeners**"));
		assert.ok(!joined.includes("**"));
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

import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deriveThinkingSteps, summarizeThinkingText } from "../parse.js";
import { renderThinkingStepsLines } from "../render.js";
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

describe("summarizer challenger regressions", () => {
	it("preserves explicit uncertainty instead of collapsing to a concrete action", () => {
		const summary = summarizeThinkingText(
			"Maybe parseDelta is dropping chunks. I should inspect parse.ts and compare the split logic around list continuations.",
		);
		assert.match(summary, /Checking whether parseDelta is dropping chunks/i);
		assert.doesNotMatch(summary, /Inspect parse\.ts and compare the split logic around list continuations/i);
	});

	it("prefers a later explicit success over an earlier failure within one step", () => {
		const summary = summarizeThinkingText(
			"Typecheck failed. I fixed the missing return type in summarizeThinkingText. npm run build passed.",
		);
		assert.match(summary, /Build passed|Npm run build passed/i);
		assert.doesNotMatch(summary, /^Typecheck failed/i);
	});

	it("treats a mixed success-failure sentence as an explicit failure", () => {
		const summary = summarizeThinkingText(
			"npm run build passed after updating parse.ts, but npm test failed with exit code 1.",
		);
		assert.equal(summary, "Npm test failed with exit code 1.");
	});

	it("does not treat verification wording as an explicit success", () => {
		const summary = summarizeThinkingText(
			"Typecheck failed. I should verify whether npm test passed after the fix.",
		);
		assert.match(summary, /Typecheck failed/i);
		assert.doesNotMatch(summary, /Tests passed|Npm test passed/i);
	});

	it("does not treat uncertain failure wording as an explicit failure", () => {
		const summary = summarizeThinkingText(
			"I am not sure whether the test failed. I should inspect parse.ts next.",
		);
		assert.match(summary, /Checking whether|Inspect parse\.ts/i);
		assert.doesNotMatch(summary, /^I am not sure whether the test failed\.$/i);
	});

	it("does not treat noun pass wording as an explicit success", () => {
		const summary = summarizeThinkingText(
			"On the first pass, inspect parse.ts and render.ts before editing.",
		);
		assert.match(summary, /Inspect parse\.ts and render\.ts|parse\.ts/i);
		assert.doesNotMatch(summary, /passed|succeeded/i);
	});

	it("preserves underscore-heavy file paths during summary compression", () => {
		const summary = summarizeThinkingText(
			"Read prompts/pi_thinking_steps_summarizer_improvement_prompt.md before editing parse.ts.",
		);
		assert.match(summary, /pi_thinking_steps_summarizer_improvement_prompt\.md/i);
		assert.doesNotMatch(summary, /pithinkingstepssummarizerimprovementprompt/i);
	});
});


	it("preserves command-plus-path intent in focused path-safe summaries", () => {
		const summary = summarizeThinkingText(
			"The next check is node --test test/thinking-steps.test.ts after I inspect renderThinkingStepsLines() in render.ts.",
		);
		assert.match(summary, /Next check is node --test test\/thinking-steps\.test\.ts/i);
		assert.doesNotMatch(summary, /^Inspect test\/thinking-steps\.test\.ts and render\.ts/i);
	});

describe("unchanged semantic-quality regressions", () => {
	it("dedupes repeated inspection chatter into one concrete action", () => {
		const summary = summarizeThinkingText(
			"I need to inspect the file. I need to inspect the file more closely. I should inspect the file again before deciding.",
		);
		assert.match(summary, /Inspect the file again before deciding/i);
		assert.doesNotMatch(summary, /Inspect the file, inspect the file more closely/i);
	});
	it("keeps compare-before-editing intent instead of collapsing to file-only focus", () => {
		const summary = summarizeThinkingText(
			"Before editing render.ts, I want to compare the current collapsed selection path with summary mode so I do not regress either one.",
		);
		assert.match(summary, /Planning to compare render\.ts selection paths before editing/i);
		assert.doesNotMatch(summary, /^Inspect render\.ts\.?$/i);
		assert.doesNotMatch(summary, /^Before editing render\.ts, I want to compare/i);
	});

	it("handles paraphrased compare-before-editing intent without falling back to a literal setup clause", () => {
		const summary = summarizeThinkingText(
			"Before touching render.ts, I need to compare its collapsed selection path with summary mode so I do not break either view.",
		);
		assert.match(summary, /Planning to compare render\.ts selection paths before editing/i);
		assert.doesNotMatch(summary, /^Before touching render\.ts/i);
	});

	it("compacts pure file focus into concise inspect phrasing", () => {
		const summary = summarizeThinkingText(
			"I am inspecting parse.ts and render.ts side by side to see where collapsed mode selection should move.",
		);
		assert.match(summary, /Inspect parse\.ts and render\.ts/i);
		assert.doesNotMatch(summary, /I am inspecting parse\.ts and render\.ts side by side/i);
	});

	it("preserves multiple symbol names in concise focus summaries", () => {
		const summary = summarizeThinkingText(
			"I am reading parse.ts summarizeThinkingText() and deriveThinkingSteps() to see where event extraction belongs.",
		);
		assert.match(summary, /summarizeThinkingText\(\)/i);
		assert.match(summary, /deriveThinkingSteps\(\)/i);
		assert.doesNotMatch(summary, /I am reading parse\.ts summarizeThinkingText/i);
	});

	it("treats observational instead-of prose as focus rather than plan change", () => {
		const summary = summarizeThinkingText(
			"I am tracing renderThinkingStepsLines() and pickCollapsedStep() because collapsed mode currently prefers the last step instead of the most important state.",
		);
		assert.match(summary, /renderThinkingStepsLines\(\)|pickCollapsedStep\(\)/i);
		assert.doesNotMatch(summary, /currently prefers the last step instead of the most important state/i);
	});

	it("preserves deferred judgment in the theme-export drift hypothesis", () => {
		const summary = summarizeThinkingText(
			"It looks like the compatibility issue might be coming from the theme export shape rather than the renderer logic itself. I need to inspect internal-patch.ts and compare the current Pi theme module before I call this a drift.",
		);
		assert.match(summary, /internal-patch\.ts/i);
		assert.match(summary, /drift/i);
		assert.doesNotMatch(summary, /Checking whether I need to inspect/i);
	});

	it("keeps explicit intent framing for run-tests-next planning", () => {
		const summary = summarizeThinkingText(
			"I should run npm test next after I clean up the summary selection logic.",
		);
		assert.match(summary, /Planning to run npm test next/i);
		assert.doesNotMatch(summary, /^Run npm test next after I clean up the summary selection logic\.?$/i);
	});

	it("renders explicit decisions without first-person framing", () => {
		const summary = summarizeThinkingText(
			"I decided to keep the existing logical step splitting and only replace the ranking path.",
		);
		assert.match(summary, /Decided to keep the existing logical step splitting/i);
		assert.doesNotMatch(summary, /^I decided to keep/i);
	});

	it("renders build success with concise build-specific wording", () => {
		const summary = summarizeThinkingText(
			"npm run build passed once the DerivedThinkingStep typing was updated.",
		);
		assert.match(summary, /Build passed after updating DerivedThinkingStep typing/i);
		assert.doesNotMatch(summary, /^Npm run build passed once/i);
	});

	it("renders the expanded-mode preservation decision with its scope boundary", () => {
		const summary = summarizeThinkingText(
			"I decided to preserve expanded mode behavior and limit the algorithmic changes to collapsed and summary selection.",
		);
		assert.match(summary, /expanded mode/i);
		assert.match(summary, /collapsed and summary selection|collapsed\/summary selection/i);
		assert.doesNotMatch(summary, /^I decided to preserve expanded mode behavior/i);
	});

	it("renders instead-of plan changes with explicit plan-change framing", () => {
		const summary = summarizeThinkingText(
			"Instead of rewriting the whole summarizer, I will refactor the existing scorer and add a fallback chooser.",
		);
		assert.match(summary, /Changed plan: refactor the existing scorer and add a fallback chooser/i);
		assert.doesNotMatch(summary, /^Instead of rewriting the whole summarizer/i);
	});

	it("renders the hybrid baseline-plus-challenger plan without dropping the event-aware challenger qualifier", () => {
		const summary = summarizeThinkingText(
			"The safer plan is to keep the current summarizer as the baseline, add an event-aware challenger, and only choose the challenger when it is clearly better.",
		);
		assert.match(summary, /current summarizer.*baseline|baseline.*current summarizer/i);
		assert.match(summary, /event-aware challenger/i);
		assert.match(summary, /better/i);
		assert.doesNotMatch(summary, /^The safer plan is to keep the current summarizer as the baseline/i);
	});

	it("handles paraphrased hybrid baseline-plus-challenger plans with the same chooser semantics", () => {
		const summary = summarizeThinkingText(
			"The safer route is to keep the current summarizer as the baseline, add an event-aware challenger, and only pick it when the challenger is clearly better.",
		);
		assert.match(summary, /current summarizer.*baseline|baseline.*current summarizer/i);
		assert.match(summary, /event-aware challenger/i);
		assert.match(summary, /better/i);
		assert.doesNotMatch(summary, /^The safer route is to keep the current summarizer as the baseline/i);
	});

	it("handles safer-approach hybrid plans without relying on exact safer-plan wording", () => {
		const summary = summarizeThinkingText(
			"The safer approach is to keep the current summarizer as baseline, add an event-aware challenger, and only use it when that challenger clearly wins.",
		);
		assert.match(summary, /current summarizer.*baseline|baseline.*current summarizer/i);
		assert.match(summary, /event-aware challenger/i);
		assert.match(summary, /better|wins/i);
		assert.doesNotMatch(summary, /^The safer approach is to keep the current summarizer as baseline/i);
	});

	it("renders npm test failures with concise command-specific wording", () => {
		const summary = summarizeThinkingText(
			"npm test failed with exit code 1 while validating the summarizer changes.",
		);
		assert.match(summary, /Npm test failed with exit code 1/i);
		assert.doesNotMatch(summary, /while validating the summarizer changes/i);
	});

	it("renders typecheck failures with concise code-and-file wording", () => {
		const summary = summarizeThinkingText(
			"Typecheck failed with TS2322 in parse.ts after the summary scoring change.",
		);
		assert.match(summary, /Typecheck failed with TS2322 in parse\.ts/i);
		assert.doesNotMatch(summary, /after the summary scoring change/i);
	});

	it("renders compare-before-editing intent with concise compare wording", () => {
		const summary = summarizeThinkingText(
			"Before editing render.ts, I want to compare the current collapsed selection path with summary mode so I do not regress either one.",
		);
		assert.match(summary, /Planning to compare render\.ts selection paths before editing/i);
		assert.doesNotMatch(summary, /^Before editing render\.ts, I want to compare/i);
	});
});
describe("collapsed selection priority", () => {
	const theme = createPlainTheme();

	it("keeps an earlier explicit failure visible over a later generic inspection step", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "npm test failed with exit code 1." },
			{ contentIndex: 1, text: "Inspect parse.ts and render.ts to find the regression." },
		]);

		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "collapsed",
			steps,
			isActive: false,
			nowMs: 0,
		});

		const joined = stripAnsi(lines.join("\n"));
		assert.match(joined, /Npm test failed with exit code 1/i);
		assert.doesNotMatch(joined, /Inspect parse\.ts and render\.ts to find the regression/i);
	});

	it("replaces an earlier failure with a later explicit success in collapsed mode", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "Typecheck failed with TS2322 in parse.ts." },
			{ contentIndex: 1, text: "npm run build passed after updating the type." },
		]);

		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "collapsed",
			steps,
			isActive: false,
			nowMs: 0,
		});

		const joined = stripAnsi(lines.join("\n"));
		assert.match(joined, /Build passed after updating type|Npm run build passed after updating the type/i);
		assert.doesNotMatch(joined, /Typecheck failed with TS2322 in parse\.ts/i);
	});

	it("returns to the newest failure after an intervening success", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "npm test failed with exit code 1." },
			{ contentIndex: 1, text: "npm run build passed after updating the type." },
			{ contentIndex: 2, text: "Typecheck failed with TS2322 in render.ts." },
		]);

		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "collapsed",
			steps,
			isActive: false,
			nowMs: 0,
		});

		const joined = stripAnsi(lines.join("\n"));
		assert.match(joined, /Typecheck failed with TS2322 in render\.ts/i);
		assert.doesNotMatch(joined, /Build passed after updating type|Npm run build passed after updating the type/i);
	});
});

describe("failure and blocker icon semantics", () => {
	const theme = createPlainTheme();

	it("renders explicit failures with the error icon", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "npm test failed with exit code 1." },
		]);

		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "collapsed",
			steps,
			isActive: false,
			nowMs: 0,
		});

		const joined = stripAnsi(lines.join("\n"));
		assert.match(joined, /! Npm test failed with exit code 1/i);
	});

	it("renders explicit blockers with the error icon", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "Project reindex is locked by another operation, so I cannot refresh the Larra index yet." },
		]);

		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "collapsed",
			steps,
			isActive: false,
			nowMs: 0,
		});

		const joined = stripAnsi(lines.join("\n"));
		assert.match(joined, /! Project reindex is locked by another operation/i);
	});
});
describe("summary mode top-N selection", () => {
	const theme = createPlainTheme();

	it("keeps high-priority failure and decision steps while dropping some low-value focus churn", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "Inspect alpha.ts for context." },
			{ contentIndex: 1, text: "Inspect beta.ts for context." },
			{ contentIndex: 2, text: "npm test failed with exit code 1." },
			{ contentIndex: 3, text: "Inspect gamma.ts for context." },
			{ contentIndex: 4, text: "I decided to keep the existing logical step splitting and only replace the ranking path." },
			{ contentIndex: 5, text: "Inspect delta.ts for context." },
		]);

		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "summary",
			steps,
			isActive: false,
		});

		const joined = stripAnsi(lines.join("\n"));
		const stepLines = lines.filter((line) => /^(├─|└─)/.test(stripAnsi(line)));
		assert.equal(stepLines.length, 5);
		assert.match(joined, /Npm test failed with exit code 1/i);
		assert.match(joined, /Decided to keep the existing logical step splitting/i);
		assert.doesNotMatch(joined, /Inspect alpha\.ts for context/i);
	});

	it("keeps the active step visible when more than five summary steps exist", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "Inspect alpha.ts for context." },
			{ contentIndex: 1, text: "Inspect beta.ts for context." },
			{ contentIndex: 2, text: "Inspect gamma.ts for context." },
			{ contentIndex: 3, text: "Inspect delta.ts for context." },
			{ contentIndex: 4, text: "Inspect epsilon.ts for context." },
			{ contentIndex: 5, text: "Inspect zeta.ts for context." },
		]);

		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "summary",
			steps,
			activeStepId: steps[0]?.id,
			isActive: false,
		});

		const joined = stripAnsi(lines.join("\n"));
		const stepLines = lines.filter((line) => /^(├─|└─)/.test(stripAnsi(line)));
		assert.equal(stepLines.length, 5);
		assert.match(joined, /Inspect alpha\.ts for context/i);
		assert.doesNotMatch(joined, /Inspect beta\.ts for context/i);
	});

	it("restores chronological order after selecting the strongest summary steps", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "Inspect alpha.ts for context." },
			{ contentIndex: 1, text: "I decided to preserve expanded mode behavior and limit changes to collapsed and summary selection." },
			{ contentIndex: 2, text: "Inspect beta.ts for context." },
			{ contentIndex: 3, text: "Typecheck failed with TS2322 in parse.ts." },
			{ contentIndex: 4, text: "Inspect gamma.ts for context." },
			{ contentIndex: 5, text: "npm run build passed after updating the type." },
		]);

		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "summary",
			steps,
			isActive: false,
		});

		const joined = stripAnsi(lines.join("\n"));
		const decisionIndex = joined.indexOf("Decided to preserve expanded mode behavior");
		const failureIndex = joined.indexOf("Typecheck failed with TS2322 in parse.ts");
		const successIndex = Math.max(
			joined.indexOf("Build passed after updating type"),
			joined.indexOf("Npm run build passed after updating the type"),
		);
		assert.ok(decisionIndex !== -1 && failureIndex !== -1 && successIndex !== -1);
		assert.ok(decisionIndex < failureIndex);
		assert.ok(failureIndex < successIndex);
	});

	it("prefers the newest failure over a stale success after an earlier failure", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "Inspect alpha.ts for context." },
			{ contentIndex: 1, text: "npm test failed with exit code 1." },
			{ contentIndex: 2, text: "npm run build passed after updating the type." },
			{ contentIndex: 3, text: "Inspect beta.ts for context." },
			{ contentIndex: 4, text: "Typecheck failed with TS2322 in render.ts." },
			{ contentIndex: 5, text: "I decided to keep the renderer priority ordering." },
		]);

		const lines = renderThinkingStepsLines(theme, 120, {
			mode: "summary",
			steps,
			isActive: false,
		});

		const joined = stripAnsi(lines.join("\n"));
		assert.match(joined, /Typecheck failed with TS2322 in render\.ts/i);
		assert.doesNotMatch(joined, /Build passed after updating type|Npm run build passed after updating the type/i);
	});
});

describe("visible path fidelity", () => {
	const theme = createPlainTheme();

	it("preserves underscore-heavy prompt paths in collapsed rendering", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "I am reading README.md and prompts/pi_thinking_steps_summarizer_improvement_prompt.md to align the evaluation corpus language with the implementation goals." },
		]);

		const lines = renderThinkingStepsLines(theme, 200, {
			mode: "collapsed",
			steps,
			isActive: false,
			nowMs: 0,
		});

		const joined = stripAnsi(lines.join("\n"));
		assert.match(joined, /pi_thinking_steps_summarizer_improvement_prompt\.md/i);
		assert.doesNotMatch(joined, /pi thinking steps summarizer improvement_prompt/i);
		assert.doesNotMatch(joined, /pithinkingstepssummarizerimprovementprompt/i);
	});

	it("preserves underscore-heavy prompt paths in summary rendering", () => {
		const steps = deriveThinkingSteps([
			{ contentIndex: 0, text: "I am reading README.md and prompts/pi_thinking_steps_summarizer_improvement_prompt.md to align the evaluation corpus language with the implementation goals." },
		]);

		const lines = renderThinkingStepsLines(theme, 240, {
			mode: "summary",
			steps,
			isActive: false,
		});

		const joined = stripAnsi(lines.join("\n"));
		assert.match(joined, /pi_thinking_steps_summarizer_improvement_prompt\.md/i);
		assert.doesNotMatch(joined, /pi thinking steps summarizer improvement_prompt/i);
		assert.doesNotMatch(joined, /pithinkingstepssummarizerimprovementprompt/i);
	});
});

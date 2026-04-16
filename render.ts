import type { Component } from "@mariozechner/pi-tui";
import { truncateToWidth, visibleWidth, wrapTextWithAnsi } from "@mariozechner/pi-tui";
import { deriveThinkingSteps } from "./parse.js";
import { getActiveThinkingState, getThinkingStepsMode } from "./state.js";
import type { DerivedThinkingStep, ThinkingSemanticRole, ThinkingSourceBlock, ThinkingThemeLike } from "./types.js";

interface RenderOptions {
	mode: "collapsed" | "summary" | "expanded";
	steps: DerivedThinkingStep[];
	activeStepId?: string;
	isActive: boolean;
	nowMs?: number;
}

function roleColor(role: ThinkingSemanticRole): string {
	switch (role) {
		case "verify":
			return "success";
		case "error":
			return "error";
		case "compare":
			return "warning";
		case "inspect":
		case "search":
			return "mdLink";
		case "write":
		case "plan":
			return "accent";
		default:
			return "muted";
	}
}

function pulseGlyph(theme: ThinkingThemeLike, nowMs: number): string {
	const frames = [
		theme.fg("dim", "·"),
		theme.fg("muted", "•"),
		theme.fg("accent", "•"),
		theme.fg("muted", "•"),
	];
	const frame = Math.floor(nowMs / 180) % frames.length;
	return frames[frame] ?? frames[0]!;
}

function stepHeader(theme: ThinkingThemeLike, step: DerivedThinkingStep, active: boolean, connector: string): string {
	const connectorColor = active ? "accent" : "muted";
	const icon = theme.fg(roleColor(step.role), step.icon);
	const summaryText = active
		? theme.bold(theme.fg("thinkingText", step.summary))
		: theme.fg("thinkingText", step.summary);
	return `${theme.fg(connectorColor, connector)} ${icon} ${summaryText}`;
}

function pickCollapsedStep(steps: DerivedThinkingStep[], activeStepId?: string): DerivedThinkingStep | undefined {
	if (steps.length === 0) return undefined;
	if (activeStepId) {
		const active = steps.find((step) => step.id === activeStepId);
		if (active) return active;
	}
	return steps[steps.length - 1];
}
function wrapCollapsedSummaryText(text: string, firstWidth: number, continuationWidth: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	if (words.length === 0) return [];

	const lines: string[] = [];
	let current = "";
	let currentWidth = Math.max(8, firstWidth);

	for (const word of words) {
		const candidate = current ? `${current} ${word}` : word;
		if (visibleWidth(candidate) <= currentWidth) {
			current = candidate;
			continue;
		}

		if (current) {
			lines.push(current);
			currentWidth = Math.max(8, continuationWidth);
			current = word;
		} else {
			lines.push(truncateToWidth(word, currentWidth));
			currentWidth = Math.max(8, continuationWidth);
		}
	}

	if (current) lines.push(current);
	return lines;
}

function renderCollapsed(theme: ThinkingThemeLike, width: number, steps: DerivedThinkingStep[], activeStepId?: string, isActive = false, nowMs = Date.now()): string[] {
	const step = pickCollapsedStep(steps, activeStepId);
	if (!step) return [];

	const label = "Thinking";
	const icon = theme.fg(roleColor(step.role), step.icon);
	const activity = isActive ? pulseGlyph(theme, nowMs) : theme.fg("dim", "·");
	const prefix = `${theme.fg("muted", "│")} ${theme.fg("dim", label)} ${icon} `;
	const continuationPrefix = `${theme.fg("muted", "│")} ${" ".repeat(visibleWidth(`${label} ${step.icon} `))}`;
	const summaryLines = wrapCollapsedSummaryText(
		step.summary,
		width - visibleWidth(prefix),
		width - visibleWidth(continuationPrefix),
	);

	if (summaryLines.length <= 1) {
		const summary = theme.fg("thinkingText", summaryLines[0] ?? step.summary);
		return [truncateToWidth(`${prefix}${summary} ${activity}`, width)];
	}

	return summaryLines.map((line, index) => {
		const styledLine = theme.fg("thinkingText", line);
		if (index === 0) return truncateToWidth(`${prefix}${styledLine}`, width);
		if (index === summaryLines.length - 1) return truncateToWidth(`${continuationPrefix}${styledLine} ${activity}`, width);
		return truncateToWidth(`${continuationPrefix}${styledLine}`, width);
	});
}

function renderSummary(theme: ThinkingThemeLike, width: number, steps: DerivedThinkingStep[], activeStepId?: string): string[] {
	const lines = [
		truncateToWidth(`${theme.fg("muted", "┆")} ${theme.fg("dim", "Thinking Steps · Summary")}`, width),
	];
	for (let index = 0; index < steps.length; index++) {
		const step = steps[index]!;
		const connector = index === steps.length - 1 ? "└─" : "├─";
		lines.push(truncateToWidth(stepHeader(theme, step, step.id === activeStepId, connector), width));
	}
	return lines;
}

function renderWrappedRawText(theme: ThinkingThemeLike, text: string, width: number, prefix: string): string[] {
	const innerWidth = Math.max(8, width - visibleWidth(prefix));
	const rawLines = text.replace(/\t/g, "    ").split("\n");
	const rendered: string[] = [];
	for (const rawLine of rawLines) {
		if (rawLine.trim().length === 0) {
			rendered.push(truncateToWidth(prefix, width, ""));
			continue;
		}
		const styled = theme.fg("thinkingText", rawLine);
		const wrapped = wrapTextWithAnsi(styled, innerWidth);
		for (const line of wrapped) {
			rendered.push(truncateToWidth(`${prefix}${line}`, width, ""));
		}
	}
	return rendered;
}

function renderExpanded(theme: ThinkingThemeLike, width: number, steps: DerivedThinkingStep[], activeStepId?: string): string[] {
	const lines = [
		truncateToWidth(`${theme.fg("muted", "┆")} ${theme.fg("dim", "Thinking Steps · Expanded")}`, width),
	];

	for (let index = 0; index < steps.length; index++) {
		const step = steps[index]!;
		const connector = index === steps.length - 1 ? "└─" : "├─";
		const isActive = step.id === activeStepId;
		lines.push(truncateToWidth(stepHeader(theme, step, isActive, connector), width));

		const normalizedBody = step.body.trim();
		if (!normalizedBody) continue;

		lines.push(...renderWrappedRawText(theme, normalizedBody, width, `${theme.fg("muted", "│")}  `));
	}

	return lines;
}

export function renderThinkingStepsLines(theme: ThinkingThemeLike, width: number, options: RenderOptions): string[] {
	if (options.steps.length === 0) return [];
	if (options.mode === "collapsed") {
		return renderCollapsed(theme, width, options.steps, options.activeStepId, options.isActive, options.nowMs);
	}
	if (options.mode === "expanded") {
		return renderExpanded(theme, width, options.steps, options.activeStepId);
	}
	return renderSummary(theme, width, options.steps, options.activeStepId);
}

export class ThinkingStepsComponent implements Component {
	private steps: DerivedThinkingStep[];
	private widthCache?: number;
	private cachedLines?: string[];

	constructor(
		private readonly theme: ThinkingThemeLike,
		private readonly messageTimestamp: number,
		blocks: ThinkingSourceBlock[],
	) {
		this.steps = deriveThinkingSteps(blocks);
	}

	render(width: number): string[] {
		const mode = getThinkingStepsMode();
		const active = getActiveThinkingState();
		const activeStepId =
			active.active && active.messageTimestamp === this.messageTimestamp && active.contentIndex !== undefined
				? [...this.steps].reverse().find((step) => step.contentIndex === active.contentIndex)?.id
				: undefined;
		const cacheKeyMatches =
			this.widthCache === width && this.cachedLines && (mode !== "collapsed" || !active.active || active.messageTimestamp !== this.messageTimestamp);
		if (cacheKeyMatches && this.cachedLines) {
			return this.cachedLines;
		}

		const lines = renderThinkingStepsLines(this.theme, width, {
			mode,
			steps: this.steps,
			activeStepId,
			isActive: active.active && active.messageTimestamp === this.messageTimestamp,
			nowMs: Date.now(),
		});

		if (!(mode === "collapsed" && active.active && active.messageTimestamp === this.messageTimestamp)) {
			this.widthCache = width;
			this.cachedLines = lines;
		} else {
			this.widthCache = undefined;
			this.cachedLines = undefined;
		}
		return lines;
	}

	invalidate(): void {
		this.widthCache = undefined;
		this.cachedLines = undefined;
	}
}

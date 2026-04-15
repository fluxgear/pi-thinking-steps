import type { DerivedThinkingStep, ThinkingSemanticRole, ThinkingSourceBlock, ThinkingStepsMode } from "./types.js";

const LIST_ITEM_RE = /^\s*(?:[-*+]\s+|\d+[.)]\s+|[a-z][.)]\s+)/i;
const HEADING_RE = /^\s{0,3}#{1,6}\s+/;
const LEADING_SUMMARY_PHRASE_RE =
	/^(?:i\s+(?:need|should|want)\s+to|need\s+to|i(?:'m| am)\s+going\s+to|i(?:'ll| will)|let\s+me|let'?s|first,?\s+|next,?\s+|then,?\s+|now,?\s+|okay,?\s+)/i;

function normalizeNewlines(text: string): string {
	return text.replace(/\r\n?/g, "\n");
}

function collapseWhitespace(text: string): string {
	return text.replace(/[ \t]+/g, " ").trim();
}

function stripLeadingMarker(text: string): string {
	return text.replace(HEADING_RE, "").replace(LIST_ITEM_RE, "").trim();
}

function stripLeadingSummaryPhrase(text: string): string {
	const stripped = text.replace(LEADING_SUMMARY_PHRASE_RE, "").trim();
	return stripped.length > 0 ? stripped : text.trim();
}

function capitalize(text: string): string {
	if (!text) return text;
	return text.charAt(0).toUpperCase() + text.slice(1);
}

function truncateText(text: string, maxLength: number): string {
	if (text.length <= maxLength) return text;
	const truncated = text.slice(0, Math.max(0, maxLength - 1)).trimEnd();
	return `${truncated}…`;
}

function firstMeaningfulLine(text: string): string {
	const lines = normalizeNewlines(text)
		.split("\n")
		.map((line) => line.trim())
		.filter(Boolean);
	return lines[0] ?? "";
}

function firstSentence(text: string): string {
	const normalized = collapseWhitespace(text);
	if (!normalized) return "";
	const match = normalized.match(/^(.{1,120}?)(?:[.!?](?:\s|$)|$)/);
	return match?.[1]?.trim() ?? normalized;
}

function splitListChunk(chunk: string): string[] {
	const lines = normalizeNewlines(chunk).split("\n");
	const itemLineIndexes = lines.reduce<number[]>((indexes, line, index) => {
		if (LIST_ITEM_RE.test(line)) indexes.push(index);
		return indexes;
	}, []);

	if (itemLineIndexes.length < 2) return [chunk.trim()];

	const items: string[] = [];
	let current: string[] = [];
	for (const line of lines) {
		if (LIST_ITEM_RE.test(line) && current.length > 0) {
			items.push(current.join("\n").trim());
			current = [line];
		} else {
			current.push(line);
		}
	}
	if (current.length > 0) items.push(current.join("\n").trim());
	return items.filter(Boolean);
}

export function splitThinkingIntoStepTexts(text: string): string[] {
	const normalized = normalizeNewlines(text).trim();
	if (!normalized) return [];

	const paragraphChunks = normalized
		.split(/\n{2,}/)
		.map((chunk) => chunk.trim())
		.filter(Boolean);

	if (paragraphChunks.length === 0) return [];

	const steps = paragraphChunks.flatMap((chunk) => splitListChunk(chunk));
	return steps.length > 0 ? steps : [normalized];
}

export function summarizeThinkingText(text: string, fallback = "Reasoning hidden by provider"): string {
	const raw = normalizeNewlines(text).trim();
	if (!raw) return fallback;

	const primary = firstMeaningfulLine(raw) || firstSentence(raw) || raw;
	const cleaned = collapseWhitespace(stripLeadingSummaryPhrase(stripLeadingMarker(primary)));
	const summary = capitalize(cleaned.replace(/[.:;,-]+$/g, "").trim());
	return truncateText(summary || fallback, 84);
}

export function inferThinkingRole(text: string): ThinkingSemanticRole {
	const haystack = ` ${normalizeNewlines(text).toLowerCase()} `;

	if (/\b(error|errors|fail|failure|exception|bug|issue|problem|warning|debug|stack trace|traceback|fix)\b/.test(haystack)) {
		return "error";
	}
	if (/\b(verify|verification|validate|validation|confirm|check|ensure|test|recheck|prove)\b/.test(haystack)) {
		return "verify";
	}
	if (/\b(write|edit|implement|patch|update|refactor|create|add|remove|rename|modify)\b/.test(haystack)) {
		return "write";
	}
	if (/\b(compare|comparison|versus|\bvs\b|trade-?off|alternative|option|weigh|choose between)\b/.test(haystack)) {
		return "compare";
	}
	if (/\b(search|grep|find|locate|lookup|browse)\b/.test(haystack)) {
		return "search";
	}
	if (/\b(inspect|examine|read|open|scan|review|trace|look at)\b/.test(haystack)) {
		return "inspect";
	}
	if (/\b(plan|planning|approach|strategy|outline|decide|figure out|map out|organize|break down)\b/.test(haystack)) {
		return "plan";
	}

	return "default";
}

export function iconForThinkingRole(role: ThinkingSemanticRole): string {
	switch (role) {
		case "inspect":
			return "⌕";
		case "plan":
			return "▣";
		case "compare":
			return "⇆";
		case "verify":
			return "✓";
		case "write":
			return "✎";
		case "search":
			return "⌕";
		case "error":
			return "⚠";
		default:
			return "•";
	}
}

export function deriveThinkingSteps(blocks: ThinkingSourceBlock[]): DerivedThinkingStep[] {
	const steps: DerivedThinkingStep[] = [];
	blocks.forEach((block, blockIndex) => {
		if (block.redacted && !block.text.trim()) {
			const summary = "Reasoning hidden by provider";
			steps.push({
				id: `${block.contentIndex}-0`,
				contentIndex: block.contentIndex,
				blockIndex,
				stepIndex: 0,
				summary,
				body: summary,
				role: "default",
				icon: iconForThinkingRole("default"),
			});
			return;
		}

		const stepTexts = splitThinkingIntoStepTexts(block.text);
		stepTexts.forEach((stepText, stepIndex) => {
			const summary = summarizeThinkingText(stepText);
			const role = inferThinkingRole(`${summary}\n${stepText}`);
			steps.push({
				id: `${block.contentIndex}-${stepIndex}`,
				contentIndex: block.contentIndex,
				blockIndex,
				stepIndex,
				summary,
				body: stepText.trim(),
				role,
				icon: iconForThinkingRole(role),
			});
		});
	});
	return steps;
}

export function parseThinkingMode(input: string): ThinkingStepsMode | undefined {
	const normalized = input.trim().toLowerCase();
	if (!normalized) return undefined;
	if (["collapsed", "collapse", "c"].includes(normalized)) return "collapsed";
	if (["summary", "summaries", "s"].includes(normalized)) return "summary";
	if (["expanded", "expand", "full", "e"].includes(normalized)) return "expanded";
	return undefined;
}

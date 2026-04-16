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

export function summarizeThinkingText(text: string, fallback = "Reasoning is hidden by the provider."): string {
	const raw = normalizeNewlines(text).trim();
	if (!raw) return fallback;

	const normalized = collapseWhitespace(raw);
	const metaPrefixes = [
		/^(?:i['’]?m considering(?: how)?(?: we can)?|i am considering(?: how)?(?: we can)?|considering(?: how)?(?: we can)?|it seems like|it looks like|it may make sense to|it might make sense to|it could be useful to|it might be useful to|it would be useful to|i need to(?: know)?|need to|i might(?: need to)?|i should|i want to|i(?:'ll| will)|i(?:'m| am) going to|let'?s|let me|okay)\s+/i,
		/^(?:how we can|we can|just to|so that we can)\s+/i,
	];
	const actionVerbNormalizers: Array<[RegExp, string]> = [
		[/^(?:look(?:ing)? into using|try(?:ing)? using|attempt(?:ing)? using)\s+/i, "use "],
		[/^(?:using)\s+/i, "use "],
		[/^(?:inspecting)\s+/i, "inspect "],
		[/^(?:comparing)\s+/i, "compare "],
		[/^(?:verifying)\s+/i, "verify "],
		[/^(?:checking)\s+/i, "check "],
		[/^(?:searching)\s+/i, "search "],
		[/^(?:reviewing)\s+/i, "review "],
		[/^(?:reading)\s+/i, "read "],
		[/^(?:writing)\s+/i, "write "],
		[/^(?:planning)\s+/i, "plan "],
		[/^(?:mapping out)\s+/i, "map out "],
	];

	const splitIntoCandidates = (value: string): string[] =>
		value
			.split(/(?<=[.!?])\s+/)
			.flatMap((sentence) => sentence.split(/;\s+|,\s+|\s+\bso\b\s+|\s+\bbut\b\s+/i))
			.map((candidate) => candidate.trim())
			.filter(Boolean);

	const normalizeCandidate = (value: string): string => {
		let candidate = stripLeadingMarker(value).replace(/[.!?]+$/g, "").trim();
		if (!candidate) return "";

		for (const prefix of metaPrefixes) {
			candidate = candidate.replace(prefix, "").trim();
		}

		candidate = stripLeadingSummaryPhrase(candidate)
			.replace(/\b(?:could|might|would)\s+be\s+(?:helpful|useful)(?:\s+(?:here|first))?/i, "")
			.replace(/\bavailable to me\b/gi, "available")
			.replace(/\bfor it\b/gi, "")
			.replace(/^then\s+/i, "")
			.trim();

		for (const [pattern, replacement] of actionVerbNormalizers) {
			candidate = candidate.replace(pattern, replacement);
		}

		return collapseWhitespace(candidate).replace(/^[.:;,-]+|[.:;,-]+$/g, "").trim();
	};

	const formatSummarySentence = (clauses: string[]): string => {
		const normalizedClauses = clauses
			.map((candidate) => candidate.replace(/[.!?;:,]+$/g, "").trim())
			.filter(Boolean);
		if (normalizedClauses.length === 0) return fallback;

		const [firstClause, ...restClauses] = normalizedClauses;
		let sentence = capitalize(firstClause);
		if (restClauses.length > 0) {
			sentence = `${sentence}, then ${restClauses.join(", then ")}`;
		}
		return `${sentence.replace(/[.!?;:,]+$/g, "")}.`;
	};

	const scoreCandidate = (candidate: string): number => {
		let score = 0;
		if (candidate.length >= 12) score += 1;
		if (candidate.length <= 72) score += 1;
		else score -= 1;
		if (/^(?:use|inspect|compare|verify|check|search|review|read|write|plan|map out|connect|orient|describe)\b/i.test(candidate)) {
			score += 2;
		}
		if (/\b(?:inspect|compare|verify|use|connect|orient|describe|check|search|read|patch|update|render|summarize|split|derive|trace|review|map out|plan|organize|figure out)\b/i.test(candidate)) {
			score += 4;
		}
		if (/\b(?:larra|mcp|renderer|rendering|extension|thinking|tool|tools|mode|connection|hooks?|workflow|workflows|patch|summary|component|api)\b/i.test(candidate)) {
			score += 2;
		}
		if (/^(?:i|it|let)\b/i.test(candidate)) score -= 3;
		if (/\b(?:helpful|useful|considering|seems like|what we can find)\b/i.test(candidate)) score -= 2;
		if (candidate.split(/\s+/).length <= 2) score -= 1;
		return score;
	};

	let candidates = splitIntoCandidates(normalized).map(normalizeCandidate).filter(Boolean);
	if (candidates.length === 0) {
		candidates = [normalizeCandidate(firstMeaningfulLine(raw) || firstSentence(raw) || raw)].filter(Boolean);
	}

	const ranked = [...new Set(candidates)]
		.map((candidate) => ({ candidate, score: scoreCandidate(candidate) }))
		.sort((a, b) => b.score - a.score || a.candidate.length - b.candidate.length);

	const selected: string[] = [];
	for (const { candidate, score } of ranked) {
		if (selected.length === 0) {
			selected.push(candidate);
			continue;
		}
		if (score < ranked[0]!.score - 2) continue;
		if (selected.some((existing) => existing.includes(candidate) || candidate.includes(existing))) continue;
		if (formatSummarySentence([...selected, candidate]).length > 84) continue;
		selected.push(candidate);
		if (selected.length === 2) break;
	}

	const chosenClauses = selected.length > 0 ? selected : ranked.slice(0, 1).map(({ candidate }) => candidate);
	return formatSummarySentence(chosenClauses);
}

export function inferThinkingRole(text: string): ThinkingSemanticRole {
	const haystack = ` ${normalizeNewlines(text).toLowerCase()} `;
	const scoredRoles: Array<{ role: ThinkingSemanticRole; score: number }> = [
		{
			role: "error",
			score:
				(Number(/\b(error|errors|fail|failure|exception|bug|issue|problem|warning|debug|stack trace|traceback)\b/.test(haystack)) * 4) +
				(Number(/\bfix\b/.test(haystack)) * 2),
		},
		{
			role: "compare",
			score:
				(Number(/\b(compare|comparison|versus|\bvs\b|trade-?off|alternative|option|weigh|choose between)\b/.test(haystack)) * 4),
		},
		{
			role: "search",
			score:
				(Number(/\b(search|grep|find|locate|lookup|browse|discover)\b/.test(haystack)) * 3) +
				(Number(/\b(list|describe)\b(?=.*\btools?\b)/.test(haystack)) * 2),
		},
		{
			role: "inspect",
			score:
				(Number(/\b(inspect|examine|read|open|scan|review|trace|look at|understand|orient|connection)\b/.test(haystack)) * 3) +
				(Number(/\bconnect\b/.test(haystack)) * 2),
		},
		{
			role: "plan",
			score:
				(Number(/\b(plan|planning|approach|strategy|outline|decide|figure out|map out|organize|break down)\b/.test(haystack)) * 3),
		},
		{
			role: "write",
			score:
				(Number(/\b(write|implement|patch|update|refactor|create|add|remove|rename|modify)\b/.test(haystack)) * 3) +
				(Number(/\bedit\b/.test(haystack)) * 2),
		},
		{
			role: "verify",
			score:
				(Number(/\b(verify|verification|validate|validation|recheck|prove)\b/.test(haystack)) * 4) +
				(Number(/\b(test|confirm)\b/.test(haystack)) * 2) +
				(Number(/\b(check|ensure)\b/.test(haystack)) * 1),
		},
	];

	const bestRole = scoredRoles
		.sort((a, b) => b.score - a.score)
		.find((entry) => entry.score > 0);

	return bestRole?.role ?? "default";
}

export function iconForThinkingRole(role: ThinkingSemanticRole): string {
	switch (role) {
		case "inspect":
			return "◫";
		case "plan":
			return "◇";
		case "compare":
			return "↔";
		case "verify":
			return "✓";
		case "write":
			return "✎";
		case "search":
			return "⌕";
		case "error":
			return "!";
		default:
			return "·";
	}
}

export function deriveThinkingSteps(blocks: ThinkingSourceBlock[]): DerivedThinkingStep[] {
	const steps: DerivedThinkingStep[] = [];
	blocks.forEach((block, blockIndex) => {
		if (block.redacted && !block.text.trim()) {
			const summary = "Reasoning is hidden by the provider.";
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

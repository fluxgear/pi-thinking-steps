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
	const SUMMARY_MAX_CHARS = 84;
	const MMR_LAMBDA = 0.7;

	type CandidateKind = "sentence" | "clause" | "bullet" | "heading";
	type Candidate = {
		text: string;
		compressed: string;
		tokens: string[];
		index: number;
		kind: CandidateKind;
		centrality: number;
		positionPrior: number;
		structurePrior: number;
		cuePrior: number;
		score: number;
	};

	const raw = normalizeNewlines(text).trim();
	if (!raw) return fallback;

	const stopwords = new Set([
		"a", "an", "and", "are", "as", "at", "be", "been", "but", "by", "for", "from", "had", "has", "have",
		"i", "if", "in", "into", "is", "it", "its", "just", "let", "me", "my", "now", "of", "on", "or",
		"our", "so", "that", "the", "their", "them", "then", "there", "these", "they", "this", "to", "up",
		"was", "we", "were", "what", "when", "which", "while", "with", "would", "yet", "you",
	]);

	const pureTimestampRe = /^(?:\[)?\d{1,2}:\d{2}(?::\d{2})?(?:\])?$|^\d{4}-\d{2}-\d{2}t\d{2}:\d{2}:\d{2}/i;
	const separatorRe = /^[\s`~!@#$%^&*()_+=\-\[\]{}\|;:'",.<>/?·]+$/;
	const spinnerStatusRe = /^(?:thinking|loading|working|running|processing|waiting|done|complete|completed|idle)(?:[ .…:-]+)?$/i;
	const artifactRe = /(?:\b[a-z0-9_-]+\.(?:ts|tsx|js|jsx|json|md|txt|yml|yaml|lock)\b|\b[a-z_][a-z0-9_]*\([^)]*\)|`[^`]+`|\b(?:npm|node|git|pi|larra|mcp|tsx|tsc)\b|\b(?:ts\d{3,5}|err_[a-z0-9_]+)\b)/i;
	const failureCueRe = /\b(failed|failure|error|errors|blocked|abort(?:ed)?|cannot|unable|did not complete|not completed|reverted|rollback|locked)\b/i;
	const decisionCueRe = /\b(decided|decision|chose|switched|replaced|confirmed|fixed|resolved|discovered|found)\b/i;
	const actionCueRe = /\b(retry|rerun|inspect|check|verify|compare|search|read|patch|update|implement|remove|rename|write|run|fix|switch|revert)\b/i;
	const nextActionCueRe = /\b(first|next|retry|rerun|before|after)\b/i;
	const uncertaintyCueRe = /\b(maybe|might|possibly|probably|seems|looks like|suspect|likely|unverified|haven'?t verified|not verified)\b/i;
	const speculativeCueRe = /\b(seems like|could be useful|might be useful|would be useful|considering)\b/i;
	const directActionStartRe = /^(?:use|inspect|check|verify|compare|search|read|patch|update|implement|remove|rename|write|run|fix|switch|revert)\b/i;
	const weakOrientationRe = /\bconnect and orient ourselves\b/i;

	const stripMarkdownEmphasis = (value: string): string =>
		value
			.replace(/(\*\*|__)(.+?)\1/g, "$2")
			.replace(/(\*|_)([^*_]+?)\1/g, "$2");

	const stripBoilerplatePrefix = (value: string): string =>
		value
			.replace(/^\[[^\]]+\]\s*/, "")
			.replace(/^(?:thinking|thoughts?|status|assistant|stdout|stderr|step\s+\d+|progress|delta)\s*[:>-]\s*/i, "")
			.replace(/^>\s+/, "")
			.replace(/^[-=~]{2,}\s*/, "")
			.trim();

	const isNoiseLine = (value: string): boolean => {
		const normalizedLine = collapseWhitespace(stripBoilerplatePrefix(stripMarkdownEmphasis(value)));
		return !normalizedLine || pureTimestampRe.test(normalizedLine) || separatorRe.test(normalizedLine) || spinnerStatusRe.test(normalizedLine);
	};

	const splitSentences = (value: string): string[] =>
		(value.match(/[^.!?\n]+(?:[.!?]+|$)/g) ?? [value])
			.map((sentence) => sentence.trim())
			.filter(Boolean);

	const splitClauses = (value: string): string[] =>
		value
			.split(/;\s+|:\s+|,\s+|\s+\b(?:but|so|and then)\b\s+/i)
			.map((clause) => clause.trim())
			.filter(Boolean);

	const normalizeCandidateText = (value: string): string =>
		collapseWhitespace(stripBoilerplatePrefix(stripMarkdownEmphasis(stripLeadingMarker(value).replace(/[\u2022]+/g, ""))));

	const compressCandidate = (value: string): string => {
		let candidate = normalizeCandidateText(value)
			.replace(/^(?:it seems like|it looks like|it could be useful to|it might be useful to|it would be useful to|i['’]?m considering|i am considering|how we can|we can)\s*/i, "")
			.replace(/^\b(?:well|okay|now|actually|basically|simply)\b[,:]?\s+/i, "")
			.replace(/^\b(?:let me|i need to|i want to|i am going to|i'm going to)\b\s+/i, "")
			.replace(/\s*\(([^()]*)\)\s*/g, " ")
			.replace(/\b(?:for now|at this point)\b/gi, "")
			.replace(/\b(?:could|might|would)\s+be\s+(?:helpful|useful)(?:\s+(?:here|first))?/gi, "")
			.replace(/\bavailable to me\b/gi, "available")
			.replace(/\bfor it\b/gi, "")
			.trim();

		candidate = candidate
			.replace(/^using\b/i, "Use")
			.replace(/^inspecting\b/i, "Inspect")
			.replace(/^checking\b/i, "Check")
			.replace(/^comparing\b/i, "Compare")
			.replace(/^verifying\b/i, "Verify")
			.replace(/^searching\b/i, "Search")
			.replace(/^reviewing\b/i, "Review")
			.replace(/^reading\b/i, "Read")
			.replace(/^writing\b/i, "Write")
			.replace(/^planning\b/i, "Plan")
			.replace(/^mapping out\b/i, "Map out")
			.replace(/^connect and orient ourselves\b/i, "Orient to the current state");

		return collapseWhitespace(candidate).replace(/^[,;:.-]+|[,;:.-]+$/g, "").trim();
	};

	const tokenize = (value: string): string[] => {
		const stem = (token: string): string => {
			if (token.length > 5 && token.endsWith("ing")) return token.slice(0, -3);
			if (token.length > 4 && token.endsWith("ed")) return token.slice(0, -2);
			if (token.length > 4 && token.endsWith("es")) return token.slice(0, -2);
			if (token.length > 3 && token.endsWith("s")) return token.slice(0, -1);
			return token;
		};

		return collapseWhitespace(value)
			.toLowerCase()
			.split(/[^a-z0-9._/-]+/i)
			.map((token) => stem(token.trim()))
			.filter((token) => token.length > 1 && !stopwords.has(token));
	};

	const extractCandidates = (value: string): Candidate[] => {
		const paragraphs = normalizeNewlines(value).split(/\n{2,}/);
		const candidates: Candidate[] = [];
		const seen = new Set<string>();
		let candidateIndex = 0;

		const pushCandidate = (textValue: string, kind: CandidateKind) => {
			const normalizedText = normalizeCandidateText(textValue);
			if (!normalizedText || separatorRe.test(normalizedText) || seen.has(normalizedText.toLowerCase())) return;
			seen.add(normalizedText.toLowerCase());
			candidates.push({
				text: normalizedText,
				compressed: compressCandidate(normalizedText),
				tokens: tokenize(normalizedText),
				index: candidateIndex++,
				kind,
				centrality: 0,
				positionPrior: 0,
				structurePrior: 0,
				cuePrior: 0,
				score: 0,
			});
		};

		paragraphs.forEach((paragraph) => {
			const rawLines = normalizeNewlines(paragraph).split("\n").map((line) => line.trim()).filter(Boolean);
			const cleanLines = rawLines.filter((line) => !isNoiseLine(line));
			if (cleanLines.length === 0) return;

			const structuredLines = cleanLines.filter((line) => LIST_ITEM_RE.test(line) || HEADING_RE.test(line));
			structuredLines.forEach((line) => pushCandidate(line, HEADING_RE.test(line) ? "heading" : "bullet"));

			const prose = cleanLines.filter((line) => !LIST_ITEM_RE.test(line) && !HEADING_RE.test(line)).join(" ");
			if (!prose) return;
			for (const sentence of splitSentences(prose)) {
				const clauseCandidates = sentence.length > 100 || /[,;:]|\b(?:but|so|and then)\b/i.test(sentence)
					? splitClauses(sentence)
					: [sentence];
				clauseCandidates.forEach((candidate) => pushCandidate(candidate, clauseCandidates.length > 1 ? "clause" : "sentence"));
			}
		});

		return candidates.filter((candidate) => candidate.compressed.length > 0);
	};

	const candidates = extractCandidates(raw);
	if (candidates.length === 0) {
		return truncateText(`${capitalize(collapseWhitespace(stripMarkdownEmphasis(raw))).replace(/[.!?;:,]+$/g, "")}.`, SUMMARY_MAX_CHARS);
	}

	const documentFrequency = new Map<string, number>();
	for (const candidate of candidates) {
		for (const token of new Set(candidate.tokens)) {
			documentFrequency.set(token, (documentFrequency.get(token) ?? 0) + 1);
		}
	}

	const similarity = (left: Candidate, right: Candidate): number => {
		const leftSet = new Set(left.tokens);
		const rightSet = new Set(right.tokens);
		const union = new Set([...leftSet, ...rightSet]);
		if (union.size === 0) return 0;
		let intersectionWeight = 0;
		let unionWeight = 0;
		for (const token of union) {
			const weight = 1 + Math.log((1 + candidates.length) / (1 + (documentFrequency.get(token) ?? 0)));
			if (leftSet.has(token) && rightSet.has(token)) intersectionWeight += weight;
			unionWeight += weight;
		}
		return unionWeight === 0 ? 0 : intersectionWeight / unionWeight;
	};

	const maxIndex = Math.max(candidates.length - 1, 1);
	const maxCentrality = Math.max(
		...candidates.map((candidate) => {
			if (candidates.length === 1) return 1;
			const total = candidates
				.filter((other) => other !== candidate)
				.reduce((sum, other) => sum + similarity(candidate, other), 0);
			return total / Math.max(candidates.length - 1, 1);
		}),
		1,
	);

	for (const candidate of candidates) {
		const centralityRaw = candidates.length === 1
			? 1
			: candidates
				.filter((other) => other !== candidate)
				.reduce((sum, other) => sum + similarity(candidate, other), 0) / Math.max(candidates.length - 1, 1);
		candidate.centrality = maxCentrality === 0 ? 0 : centralityRaw / maxCentrality;
		candidate.positionPrior = 1 - candidate.index / maxIndex;
		candidate.structurePrior = Math.min(
			1,
			(candidate.kind === "bullet" || candidate.kind === "heading" ? 0.45 : 0)
			+ (artifactRe.test(candidate.text) ? 0.35 : 0)
			+ (failureCueRe.test(candidate.text) ? 0.25 : 0),
		);
		candidate.cuePrior = Math.min(
			1,
			(failureCueRe.test(candidate.text) ? 0.5 : 0)
			+ (decisionCueRe.test(candidate.text) ? 0.35 : 0)
			+ (actionCueRe.test(candidate.compressed) ? 0.6 : 0)
			+ (nextActionCueRe.test(candidate.compressed) ? 0.3 : 0)
			+ (artifactRe.test(candidate.text) ? 0.2 : 0)
			- ((uncertaintyCueRe.test(candidate.text) || speculativeCueRe.test(candidate.text)) && !failureCueRe.test(candidate.text) && !directActionStartRe.test(candidate.compressed) ? 0.75 : 0),
		);
		candidate.score = (0.55 * candidate.centrality) + (0.2 * candidate.positionPrior) + (0.15 * candidate.structurePrior) + (0.1 * candidate.cuePrior);
		if (directActionStartRe.test(candidate.compressed)) candidate.score += 0.35;
		if (weakOrientationRe.test(candidate.compressed) && !artifactRe.test(candidate.compressed)) candidate.score -= 0.6;
	}

	const formatSummarySentence = (clauses: string[]): string => {
		const normalizedClauses = clauses.map((candidate) => candidate.replace(/[.!?;:,]+$/g, "").trim()).filter(Boolean);
		if (normalizedClauses.length === 0) return fallback;
		const [firstClause, ...restClauses] = normalizedClauses;
		let sentence = capitalize(firstClause);
		if (restClauses.length > 0) {
			const normalizedRest = restClauses.map((clause) => {
				if (/^[A-Z][a-z]/.test(clause)) return clause.charAt(0).toLowerCase() + clause.slice(1);
				return clause;
			});
			sentence = `${sentence}, then ${normalizedRest.join(", then ")}`;
		}
		return `${sentence.replace(/[.!?;:,]+$/g, "")}.`;
	};

	const selected: Candidate[] = [];
	const directActionCandidates = candidates.filter((candidate) => directActionStartRe.test(candidate.compressed));
	const prioritizedPool = directActionCandidates.length > 0
		? candidates.filter((candidate) => directActionStartRe.test(candidate.compressed) || failureCueRe.test(candidate.text) || decisionCueRe.test(candidate.text) || uncertaintyCueRe.test(candidate.text))
		: candidates;
	const remaining = [...prioritizedPool];

	while (remaining.length > 0 && selected.length < 2) {
		remaining.sort((left, right) => {
			const leftPenalty = selected.length === 0 ? 0 : Math.max(...selected.map((candidate) => similarity(left, candidate)));
			const rightPenalty = selected.length === 0 ? 0 : Math.max(...selected.map((candidate) => similarity(right, candidate)));
			const leftScore = (MMR_LAMBDA * left.score) - ((1 - MMR_LAMBDA) * leftPenalty);
			const rightScore = (MMR_LAMBDA * right.score) - ((1 - MMR_LAMBDA) * rightPenalty);
			return rightScore - leftScore || left.index - right.index;
		});

		const next = remaining.shift()!;
		const ordered = [...selected, next].sort((left, right) => left.index - right.index);
		if (formatSummarySentence(ordered.map((candidate) => candidate.compressed)).length <= SUMMARY_MAX_CHARS || selected.length === 0) {
			selected.push(next);
		}
	}

	const fallbackPool = prioritizedPool.length > 0 ? prioritizedPool : candidates;
	const orderedSelection = (selected.length > 0 ? selected : [fallbackPool.sort((left, right) => right.score - left.score || left.index - right.index)[0]!])
		.sort((left, right) => left.index - right.index);
	return truncateText(formatSummarySentence(orderedSelection.map((candidate) => candidate.compressed)) || fallback, SUMMARY_MAX_CHARS);
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

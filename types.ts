export type ThinkingStepsMode = "collapsed" | "summary" | "expanded";

export type ThinkingSemanticRole =
	| "inspect"
	| "plan"
	| "compare"
	| "verify"
	| "write"
	| "search"
	| "error"
	| "default";

export interface ThinkingSourceBlock {
	contentIndex: number;
	text: string;
	redacted?: boolean;
}

export interface DerivedThinkingStep {
	id: string;
	contentIndex: number;
	blockIndex: number;
	stepIndex: number;
	summary: string;
	body: string;
	role: ThinkingSemanticRole;
	icon: string;
}

export interface ActiveThinkingState {
	messageTimestamp?: number;
	contentIndex?: number;
	active: boolean;
}

export interface ThinkingThemeLike {
	fg(color: string, text: string): string;
	bold(text: string): string;
}

import type { ExtensionAPI, ExtensionContext } from "@mariozechner/pi-coding-agent";
import type { AutocompleteItem } from "@mariozechner/pi-tui";
import { Key } from "@mariozechner/pi-tui";
import { retainThinkingStepsPatch } from "./internal-patch.js";
import { parseThinkingMode } from "./parse.js";
import { clearActiveThinkingState, getThinkingStepsMode, setActiveThinkingState, setThinkingStepsMode } from "./state.js";
import type { ThinkingStepsMode } from "./types.js";

const CUSTOM_ENTRY_TYPE = "thinking-steps.mode";
const DEFAULT_HIDDEN_LABEL = "Thinking...";

function modeStatusText(ctx: ExtensionContext, mode: ThinkingStepsMode): string {
	return `${ctx.ui.theme.fg("muted", "thinking:")} ${ctx.ui.theme.fg("accent", mode)}`;
}

function persistMode(pi: ExtensionAPI, mode: ThinkingStepsMode): void {
	pi.appendEntry(CUSTOM_ENTRY_TYPE, { mode });
}

function restoreMode(ctx: ExtensionContext): ThinkingStepsMode {
	const entries = ctx.sessionManager.getEntries() as Array<{ type?: string; customType?: string; data?: { mode?: ThinkingStepsMode } }>;
	const saved = entries.filter((entry) => entry.type === "custom" && entry.customType === CUSTOM_ENTRY_TYPE).pop();
	return saved?.data?.mode ?? "summary";
}

function refreshThinkingUI(ctx: ExtensionContext, announce = false): void {
	if (!ctx.hasUI) return;
	ctx.ui.setHiddenThinkingLabel(DEFAULT_HIDDEN_LABEL);
	ctx.ui.setStatus("thinking-steps", modeStatusText(ctx, getThinkingStepsMode()));
	if (announce) {
		ctx.ui.notify(`Thinking view: ${getThinkingStepsMode()}`, "info");
	}
}

function applyMode(pi: ExtensionAPI, ctx: ExtensionContext, mode: ThinkingStepsMode, options?: { persist?: boolean; announce?: boolean }): void {
	setThinkingStepsMode(mode);
	if (options?.persist !== false) {
		persistMode(pi, mode);
	}
	refreshThinkingUI(ctx, options?.announce === true);
}

function cycleMode(current: ThinkingStepsMode): ThinkingStepsMode {
	if (current === "collapsed") return "summary";
	if (current === "summary") return "expanded";
	return "collapsed";
}

function thinkingModeCompletions(prefix: string): AutocompleteItem[] | null {
	const items: AutocompleteItem[] = [
		{ value: "collapsed", label: "collapsed" },
		{ value: "summary", label: "summary" },
		{ value: "expanded", label: "expanded" },
	];
	const filtered = items.filter((item) => item.value.startsWith(prefix.trim().toLowerCase()));
	return filtered.length > 0 ? filtered : null;
}

export default function thinkingStepsExtension(pi: ExtensionAPI): void {
	let releasePatch: (() => Promise<void>) | undefined;

	pi.registerCommand("thinking-steps", {
		description: "Switch thinking view: collapsed, summary, or expanded",
		getArgumentCompletions: thinkingModeCompletions,
		handler: async (args, ctx) => {
			const requestedMode = parseThinkingMode(args);
			if (requestedMode) {
				applyMode(pi, ctx, requestedMode, { announce: true });
				return;
			}

			if (!ctx.hasUI) {
				return;
			}

			const choice = await ctx.ui.select("Thinking view", ["collapsed", "summary", "expanded"]);
			if (!choice) return;
			const selectedMode = parseThinkingMode(choice);
			if (!selectedMode) return;
			applyMode(pi, ctx, selectedMode, { announce: true });
		},
	});

	pi.registerShortcut(Key.alt("t"), {
		description: "Cycle thinking view (collapsed, summary, expanded)",
		handler: async (ctx) => {
			const nextMode = cycleMode(getThinkingStepsMode());
			applyMode(pi, ctx, nextMode, { announce: true });
		},
	});

	pi.on("session_start", async (_event, ctx) => {
		clearActiveThinkingState();
		releasePatch ??= await retainThinkingStepsPatch();
		applyMode(pi, ctx, restoreMode(ctx), { persist: false, announce: false });
	});

	pi.on("message_start", async (event) => {
		if (event.message.role === "assistant") {
			clearActiveThinkingState();
		}
	});

	pi.on("message_update", async (event) => {
		if (event.message.role !== "assistant") return;
		const assistantEvent = event.assistantMessageEvent;
		if (assistantEvent.type === "thinking_start" || assistantEvent.type === "thinking_delta") {
			setActiveThinkingState({
				active: true,
				messageTimestamp: event.message.timestamp,
				contentIndex: assistantEvent.contentIndex,
			});
			return;
		}

		if (
			assistantEvent.type === "thinking_end" ||
			assistantEvent.type === "text_start" ||
			assistantEvent.type === "text_delta" ||
			assistantEvent.type === "text_end" ||
			assistantEvent.type === "toolcall_start" ||
			assistantEvent.type === "toolcall_delta" ||
			assistantEvent.type === "toolcall_end"
		) {
			clearActiveThinkingState();
		}
	});

	pi.on("message_end", async (event) => {
		if (event.message.role === "assistant") {
			clearActiveThinkingState();
		}
	});

	pi.on("agent_end", async () => {
		clearActiveThinkingState();
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		clearActiveThinkingState();
		if (ctx.hasUI) {
			ctx.ui.setStatus("thinking-steps", undefined);
		}
		if (releasePatch) {
			await releasePatch();
			releasePatch = undefined;
		}
	});
}

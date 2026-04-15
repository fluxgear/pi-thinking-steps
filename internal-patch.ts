import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { AssistantMessage, ThinkingContent } from "@mariozechner/pi-ai";
import { Markdown, Spacer, Text } from "@mariozechner/pi-tui";
import { getPatchCleanup, setPatchCleanup, incrementPatchRefCount, decrementPatchRefCount } from "./state.js";
import { ThinkingStepsComponent } from "./render.js";
import type { ThinkingSourceBlock, ThinkingThemeLike } from "./types.js";

interface AssistantMessageComponentPrototype {
	updateContent(message: AssistantMessage): void;
	setHideThinkingBlock(hide: boolean): void;
	setHiddenThinkingLabel(label: string): void;
	contentContainer: {
		clear(): void;
		addChild(component: unknown): void;
	};
	lastMessage?: AssistantMessage;
	hideThinkingBlock: boolean;
	markdownTheme: unknown;
	hiddenThinkingLabel: string;
}

function getPackageRoot(packageName: string): string {
	const entryUrl = import.meta.resolve(packageName);
	const entryPath = fileURLToPath(entryUrl);
	return dirname(dirname(entryPath));
}

async function importInternalModule<TModule>(packageName: string, relativePath: string): Promise<TModule> {
	const packageRoot = getPackageRoot(packageName);
	const moduleUrl = pathToFileURL(join(packageRoot, relativePath)).href;
	return (await import(moduleUrl)) as TModule;
}

function hasVisibleThinking(content: ThinkingContent): boolean {
	return content.redacted === true || content.thinking.trim().length > 0;
}

function collectThinkingBlocks(message: AssistantMessage): ThinkingSourceBlock[] {
	const blocks: ThinkingSourceBlock[] = [];
	message.content.forEach((content, index) => {
		if (content.type !== "thinking") return;
		if (!hasVisibleThinking(content)) return;
		blocks.push({
			contentIndex: index,
			text: content.thinking,
			redacted: content.redacted,
		});
	});
	return blocks;
}

function hasVisibleTextContent(message: AssistantMessage): boolean {
	return message.content.some((content) => content.type === "text" && content.text.trim().length > 0);
}

function hasVisibleThinkingContent(message: AssistantMessage): boolean {
	return message.content.some((content) => content.type === "thinking" && hasVisibleThinking(content));
}

async function installPatch(): Promise<() => void> {
	const [{ AssistantMessageComponent }, { theme }] = await Promise.all([
		importInternalModule<{ AssistantMessageComponent: { prototype: AssistantMessageComponentPrototype } }>(
			"@mariozechner/pi-coding-agent",
			"dist/modes/interactive/components/assistant-message.js",
		),
		importInternalModule<{ theme: ThinkingThemeLike }>(
			"@mariozechner/pi-coding-agent",
			"dist/modes/interactive/theme/theme.js",
		),
	]);

	const prototype = AssistantMessageComponent.prototype;
	const originalUpdateContent = prototype.updateContent;
	const originalSetHideThinkingBlock = prototype.setHideThinkingBlock;
	const originalSetHiddenThinkingLabel = prototype.setHiddenThinkingLabel;

	prototype.updateContent = function patchedUpdateContent(this: AssistantMessageComponentPrototype, message: AssistantMessage): void {
		this.lastMessage = message;
		this.contentContainer.clear();

		const thinkingBlocks = collectThinkingBlocks(message);
		const hasVisibleContent = hasVisibleTextContent(message) || thinkingBlocks.length > 0;
		if (hasVisibleContent) {
			this.contentContainer.addChild(new Spacer(1));
		}

		let renderedThinking = false;
		const hasVisibleTextAfterThinking = (() => {
			const firstThinkingIndex = thinkingBlocks[0]?.contentIndex;
			if (firstThinkingIndex === undefined) return false;
			return message.content.slice(firstThinkingIndex + 1).some((content) => content.type === "text" && content.text.trim().length > 0);
		})();

		for (const content of message.content) {
			if (content.type === "text" && content.text.trim()) {
				this.contentContainer.addChild(new Markdown(content.text.trim(), 1, 0, this.markdownTheme as any));
				continue;
			}

			if (content.type === "thinking" && thinkingBlocks.length > 0 && !renderedThinking) {
				this.contentContainer.addChild(new ThinkingStepsComponent(theme, message.timestamp, thinkingBlocks));
				renderedThinking = true;
				if (hasVisibleTextAfterThinking) {
					this.contentContainer.addChild(new Spacer(1));
				}
			}
		}

		const hasToolCalls = message.content.some((content) => content.type === "toolCall");
		if (!hasToolCalls) {
			if (message.stopReason === "aborted") {
				const abortMessage =
					message.errorMessage && message.errorMessage !== "Request was aborted"
						? message.errorMessage
						: "Operation aborted";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", abortMessage), 1, 0));
			} else if (message.stopReason === "error") {
				const errorMessage = message.errorMessage || "Unknown error";
				this.contentContainer.addChild(new Spacer(1));
				this.contentContainer.addChild(new Text(theme.fg("error", `Error: ${errorMessage}`), 1, 0));
			}
		}
	};

	prototype.setHideThinkingBlock = function patchedSetHideThinkingBlock(this: AssistantMessageComponentPrototype, _hide: boolean): void {
		this.hideThinkingBlock = false;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	};

	prototype.setHiddenThinkingLabel = function patchedSetHiddenThinkingLabel(
		this: AssistantMessageComponentPrototype,
		label: string,
	): void {
		this.hiddenThinkingLabel = label;
		if (this.lastMessage) {
			this.updateContent(this.lastMessage);
		}
	};

	return () => {
		prototype.updateContent = originalUpdateContent;
		prototype.setHideThinkingBlock = originalSetHideThinkingBlock;
		prototype.setHiddenThinkingLabel = originalSetHiddenThinkingLabel;
	};
}

export async function retainThinkingStepsPatch(): Promise<() => Promise<void>> {
	incrementPatchRefCount();
	let cleanup = getPatchCleanup();
	if (!cleanup) {
		try {
			cleanup = await installPatch();
			setPatchCleanup(cleanup);
		} catch (error) {
			decrementPatchRefCount();
			throw error;
		}
	}

	return async () => {
		const refCount = decrementPatchRefCount();
		if (refCount > 0) return;
		const currentCleanup = getPatchCleanup();
		setPatchCleanup(undefined);
		await currentCleanup?.();
	};
}

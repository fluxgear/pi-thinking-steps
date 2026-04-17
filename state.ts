import type { ActiveThinkingState, ThinkingStepsMode } from "./types.js";

const STATE_KEY = Symbol.for("pi-extensions.thinking-steps.state");

type PatchCleanup = () => void | Promise<void>;
type PatchInstallPromise = Promise<PatchCleanup>;

interface ThinkingStepsGlobalState {
	mode: ThinkingStepsMode;
	active: ActiveThinkingState;
	patchRefCount: number;
	patchCleanup?: PatchCleanup | undefined;
	patchInstallPromise?: PatchInstallPromise | undefined;
}

const globalState = (() => {
	const existing = (globalThis as Record<PropertyKey, unknown>)[STATE_KEY] as ThinkingStepsGlobalState | undefined;
	if (existing) return existing;
	const created: ThinkingStepsGlobalState = {
		mode: "summary",
		active: { active: false },
		patchRefCount: 0,
	};
	(globalThis as Record<PropertyKey, unknown>)[STATE_KEY] = created;
	return created;
})();

export function getThinkingStepsMode(): ThinkingStepsMode {
	return globalState.mode;
}

export function setThinkingStepsMode(mode: ThinkingStepsMode): void {
	globalState.mode = mode;
}

export function getActiveThinkingState(): ActiveThinkingState {
	return globalState.active;
}

export function setActiveThinkingState(state: ActiveThinkingState): void {
	globalState.active = { ...state };
}

export function clearActiveThinkingState(): void {
	globalState.active = { active: false };
}

export function getPatchRefCount(): number {
	return globalState.patchRefCount;
}

export function incrementPatchRefCount(): number {
	globalState.patchRefCount += 1;
	return globalState.patchRefCount;
}

export function decrementPatchRefCount(): number {
	globalState.patchRefCount = Math.max(0, globalState.patchRefCount - 1);
	return globalState.patchRefCount;
}

export function getPatchCleanup(): PatchCleanup | undefined {
	return globalState.patchCleanup;
}

export function setPatchCleanup(cleanup: PatchCleanup | undefined): void {
	globalState.patchCleanup = cleanup;
}

export function getPatchInstallPromise(): PatchInstallPromise | undefined {
	return globalState.patchInstallPromise;
}

export function setPatchInstallPromise(installPromise: PatchInstallPromise | undefined): void {
	globalState.patchInstallPromise = installPromise;
}

import type { ActiveThinkingState, ThinkingStepsMode } from "./types.js";

const STATE_KEY = Symbol.for("pi-extensions.thinking-steps.state");
const DEFAULT_SCOPE_KEY = "__default__";
const LABEL_REFRESH_SUFFIX = "\u2060";

type PatchCleanup = () => void | Promise<void>;
type PatchInstallPromise = Promise<PatchCleanup>;
type PatchRelease = () => Promise<void>;

interface ThinkingActiveEntry {
	contentIndex?: number;
	scopeKey: string;
}

interface ThinkingStepsGlobalState {
	currentScopeKey: string;
	modeByScopeKey: Record<string, ThinkingStepsMode>;
	activeByMessageTimestamp: Record<string, ThinkingActiveEntry>;
	lastActive: ActiveThinkingState;
	refreshToggleByScope: Record<string, boolean>;
	patchReleasesByScope: Record<string, PatchRelease[]>;
	patchRefCount: number;
	patchCleanup?: PatchCleanup | undefined;
	patchInstallPromise?: PatchInstallPromise | undefined;
}

interface LegacyThinkingStepsGlobalState {
	mode?: unknown;
	active?: unknown;
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === "object" && value !== null;
}

function normalizeThinkingMode(mode: unknown): ThinkingStepsMode {
	return mode === "collapsed" || mode === "expanded" || mode === "summary" ? mode : "summary";
}

function normalizeActiveThinkingState(state: unknown): ActiveThinkingState {
	if (!isRecord(state) || state.active !== true) {
		return { active: false };
	}
	return {
		active: true,
		messageTimestamp: typeof state.messageTimestamp === "number" ? state.messageTimestamp : undefined,
		contentIndex: typeof state.contentIndex === "number" ? state.contentIndex : undefined,
	};
}

const globalState = (() => {
	const existing = (globalThis as Record<PropertyKey, unknown>)[STATE_KEY];
	if (isRecord(existing)) {
		return existing as ThinkingStepsGlobalState & LegacyThinkingStepsGlobalState;
	}
	const created: ThinkingStepsGlobalState = {
		currentScopeKey: DEFAULT_SCOPE_KEY,
		modeByScopeKey: { [DEFAULT_SCOPE_KEY]: "summary" },
		activeByMessageTimestamp: {},
		lastActive: { active: false },
		refreshToggleByScope: {},
		patchReleasesByScope: {},
		patchRefCount: 0,
	};
	(globalThis as Record<PropertyKey, unknown>)[STATE_KEY] = created;
	return created;
})();

function normalizeThinkingScopeKey(scopeKey?: string): string {
	const trimmed = scopeKey?.trim();
	return trimmed && trimmed.length > 0 ? trimmed : DEFAULT_SCOPE_KEY;
}

function ensureGlobalStateShape(): void {
	const legacyState = globalState as ThinkingStepsGlobalState & LegacyThinkingStepsGlobalState;
	const currentScopeKey = normalizeThinkingScopeKey(typeof legacyState.currentScopeKey === "string" ? legacyState.currentScopeKey : undefined);
	const modeByScopeKey = isRecord(legacyState.modeByScopeKey)
		? legacyState.modeByScopeKey as Record<string, ThinkingStepsMode>
		: {};
	if (!(currentScopeKey in modeByScopeKey)) {
		modeByScopeKey[currentScopeKey] = normalizeThinkingMode(legacyState.mode);
	}

	const lastActive = normalizeActiveThinkingState(legacyState.lastActive ?? legacyState.active);
	const activeByMessageTimestamp = isRecord(legacyState.activeByMessageTimestamp)
		? legacyState.activeByMessageTimestamp as Record<string, ThinkingActiveEntry>
		: {};
	if (lastActive.active && lastActive.messageTimestamp !== undefined && !(String(lastActive.messageTimestamp) in activeByMessageTimestamp)) {
		activeByMessageTimestamp[String(lastActive.messageTimestamp)] = {
			scopeKey: currentScopeKey,
			contentIndex: lastActive.contentIndex,
		};
	}

	const refreshToggleByScope = isRecord(legacyState.refreshToggleByScope)
		? legacyState.refreshToggleByScope as Record<string, boolean>
		: {};
	const patchReleasesByScope = isRecord(legacyState.patchReleasesByScope)
		? legacyState.patchReleasesByScope as Record<string, PatchRelease[]>
		: {};
	refreshToggleByScope[currentScopeKey] ??= false;
	patchReleasesByScope[currentScopeKey] ??= [];

	legacyState.currentScopeKey = currentScopeKey;
	legacyState.modeByScopeKey = modeByScopeKey;
	legacyState.activeByMessageTimestamp = activeByMessageTimestamp;
	legacyState.lastActive = lastActive;
	legacyState.refreshToggleByScope = refreshToggleByScope;
	legacyState.patchReleasesByScope = patchReleasesByScope;
	legacyState.patchRefCount = typeof legacyState.patchRefCount === "number" && Number.isFinite(legacyState.patchRefCount)
		? legacyState.patchRefCount
		: 0;
}

ensureGlobalStateShape();

function ensureScopeState(scopeKey: string): void {
	if (!(scopeKey in globalState.modeByScopeKey)) {
		globalState.modeByScopeKey[scopeKey] = "summary";
	}
	if (!(scopeKey in globalState.refreshToggleByScope)) {
		globalState.refreshToggleByScope[scopeKey] = false;
	}
	if (!(scopeKey in globalState.patchReleasesByScope)) {
		globalState.patchReleasesByScope[scopeKey] = [];
	}
}

export function getCurrentThinkingScopeKey(): string {
	return globalState.currentScopeKey;
}

export function setCurrentThinkingScopeKey(scopeKey: string): void {
	const normalizedScopeKey = normalizeThinkingScopeKey(scopeKey);
	ensureScopeState(normalizedScopeKey);
	globalState.currentScopeKey = normalizedScopeKey;
}

export function getThinkingStepsMode(scopeKey?: string): ThinkingStepsMode {
	const normalizedScopeKey = normalizeThinkingScopeKey(scopeKey ?? globalState.currentScopeKey);
	ensureScopeState(normalizedScopeKey);
	return globalState.modeByScopeKey[normalizedScopeKey] ?? "summary";
}

export function setThinkingStepsMode(mode: ThinkingStepsMode, scopeKey?: string): void {
	const normalizedScopeKey = normalizeThinkingScopeKey(scopeKey ?? globalState.currentScopeKey);
	ensureScopeState(normalizedScopeKey);
	globalState.modeByScopeKey[normalizedScopeKey] = mode;
	globalState.currentScopeKey = normalizedScopeKey;
}

export function getActiveThinkingState(messageTimestamp?: number): ActiveThinkingState {
	if (messageTimestamp !== undefined) {
		const entry = globalState.activeByMessageTimestamp[String(messageTimestamp)];
		if (!entry) return { active: false };
		return { active: true, messageTimestamp, contentIndex: entry.contentIndex };
	}

	return { ...globalState.lastActive };
}

export function setActiveThinkingState(state: ActiveThinkingState, scopeKey?: string): void {
	globalState.lastActive = { ...state };
	if (!state.active || state.messageTimestamp === undefined) {
		if (state.messageTimestamp !== undefined) {
			delete globalState.activeByMessageTimestamp[String(state.messageTimestamp)];
		}
		return;
	}

	const normalizedScopeKey = normalizeThinkingScopeKey(scopeKey ?? globalState.currentScopeKey);
	ensureScopeState(normalizedScopeKey);
	globalState.activeByMessageTimestamp[String(state.messageTimestamp)] = {
		contentIndex: state.contentIndex,
		scopeKey: normalizedScopeKey,
	};
}

export function clearActiveThinkingState(messageTimestamp?: number, scopeKey?: string): void {
	if (messageTimestamp !== undefined) {
		delete globalState.activeByMessageTimestamp[String(messageTimestamp)];
		if (globalState.lastActive.messageTimestamp === messageTimestamp) {
			globalState.lastActive = { active: false };
		}
		return;
	}

	if (scopeKey !== undefined) {
		const normalizedScopeKey = normalizeThinkingScopeKey(scopeKey);
		for (const [timestamp, entry] of Object.entries(globalState.activeByMessageTimestamp)) {
			if (entry.scopeKey === normalizedScopeKey) {
				delete globalState.activeByMessageTimestamp[timestamp];
			}
		}
		const lastActiveTimestamp = globalState.lastActive.messageTimestamp;
		if (lastActiveTimestamp !== undefined && !globalState.activeByMessageTimestamp[String(lastActiveTimestamp)]) {
			globalState.lastActive = { active: false };
		}
		return;
	}

	globalState.activeByMessageTimestamp = {};
	globalState.lastActive = { active: false };
}

export function nextThinkingRefreshLabel(label: string, scopeKey?: string): string {
	const normalizedScopeKey = normalizeThinkingScopeKey(scopeKey ?? globalState.currentScopeKey);
	ensureScopeState(normalizedScopeKey);
	const useInvisibleSuffix = globalState.refreshToggleByScope[normalizedScopeKey] ?? false;
	globalState.refreshToggleByScope[normalizedScopeKey] = !useInvisibleSuffix;
	return useInvisibleSuffix ? `${label}${LABEL_REFRESH_SUFFIX}` : label;
}

export function registerThinkingPatchRelease(scopeKey: string, release: PatchRelease): void {
	const normalizedScopeKey = normalizeThinkingScopeKey(scopeKey);
	ensureScopeState(normalizedScopeKey);
	globalState.patchReleasesByScope[normalizedScopeKey]!.push(release);
}

export function takeThinkingPatchRelease(scopeKey: string): PatchRelease | undefined {
	const normalizedScopeKey = normalizeThinkingScopeKey(scopeKey);
	ensureScopeState(normalizedScopeKey);
	return globalState.patchReleasesByScope[normalizedScopeKey]!.pop();
}

export function resetThinkingStepsViewState(scopeKey?: string): void {
	if (scopeKey !== undefined) {
		const normalizedScopeKey = normalizeThinkingScopeKey(scopeKey);
		globalState.currentScopeKey = normalizedScopeKey;
		globalState.modeByScopeKey[normalizedScopeKey] = "summary";
		globalState.refreshToggleByScope[normalizedScopeKey] = false;
		clearActiveThinkingState(undefined, normalizedScopeKey);
		return;
	}

	globalState.currentScopeKey = DEFAULT_SCOPE_KEY;
	globalState.modeByScopeKey = { [DEFAULT_SCOPE_KEY]: "summary" };
	globalState.activeByMessageTimestamp = {};
	globalState.lastActive = { active: false };
	globalState.refreshToggleByScope = {};
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

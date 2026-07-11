/**
 * API key scope handling. The NPM backend is the security boundary — it
 * enforces scopes on every request. Here scopes only shape UX: tools the
 * key cannot use are not registered, so the model never sees them.
 */

const LEVELS: Record<string, number> = { view: 1, manage: 2 };

// null = unrestricted (credential auth, unscoped key, or older NPM).
let keyScopes: string[] | null = null;

export function setKeyScopes(scopes: string[] | null): void {
	keyScopes = scopes;
}

export function getKeyScopes(): string[] | null {
	return keyScopes;
}

/**
 * Whether the given scopes satisfy a required "resource:level" scope.
 * A `manage` grant implies `view`. No requirement or no scopes = allowed.
 */
export function scopeAllows(scopes: string[] | null, required?: string): boolean {
	if (!required || !scopes) {
		return true;
	}
	const [resource, level] = required.split(":");
	const needed = LEVELS[level] ?? 0;
	let granted = 0;
	for (const scope of scopes) {
		const [scopeResource, scopeLevel] = scope.split(":");
		if (scopeResource === resource) {
			granted = Math.max(granted, LEVELS[scopeLevel] ?? 0);
		}
	}
	return granted >= needed;
}

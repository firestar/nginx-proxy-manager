/**
 * API key scope handling for the MCP endpoint. The API routes are the
 * security boundary — they enforce scopes on every request. Here scopes only
 * shape UX: tools the caller's key cannot use are never registered, so the
 * model never sees them.
 */

const LEVELS = { view: 1, manage: 2 };

/**
 * Whether the given scopes satisfy a required "resource:level" scope.
 * A `manage` grant implies `view`. No requirement or null scopes = allowed.
 *
 * @param   {Array|null} scopes
 * @param   {String}     [required]
 * @returns {Boolean}
 */
const scopeAllows = (scopes, required) => {
	if (!required || !scopes) {
		return true;
	}
	const [resource, level] = required.split(":");
	const needed = LEVELS[level] || 0;
	let granted = 0;
	for (const scope of scopes) {
		const [scopeResource, scopeLevel] = scope.split(":");
		if (scopeResource === resource) {
			granted = Math.max(granted, LEVELS[scopeLevel] || 0);
		}
	}
	return granted >= needed;
};

export { scopeAllows };

/** Keep user-controlled SQLite LIMIT/OFFSET values finite and positive. */
export function pageSize(value, fallback = 10, maximum = 50) {
	if (value === undefined || value === null || value === '') return fallback;
	if (typeof value === 'string' && !/^\d+$/.test(value)) return fallback;
	const parsed = Number(value);
	if (!Number.isSafeInteger(parsed) || parsed < 1) return fallback;
	return Math.min(parsed, maximum);
}

export function pageNumber(value) {
	if (typeof value === 'string' && !/^\d+$/.test(value)) return 1;
	const parsed = Number(value);
	return Number.isSafeInteger(parsed) && parsed > 0 && parsed <= 1_000_000 ? parsed : 1;
}

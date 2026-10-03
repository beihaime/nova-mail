import { describe, expect, it } from 'vitest';
import { pageNumber, pageSize } from '../src/utils/pagination';

describe('server pagination bounds', () => {
	it.each([-1, 0, 1.5, NaN, Infinity, '-1', '0', '1.5', 'NaN', '1e2', 'abc'])('normalizes unsafe size %s', value => {
		expect(pageSize(value, 10)).toBe(10);
	});

	it('uses the route fallback and clamps large safe integers', () => {
		expect(pageSize(undefined, 30, 30)).toBe(30);
		expect(pageSize('999999', 10)).toBe(50);
		expect(pageSize('999999', 30, 30)).toBe(30);
		expect(pageSize('12')).toBe(12);
	});

	it.each([-1, 0, 1.5, '1.5', 'NaN', '99999999999999999999'])('normalizes unsafe page %s', value => {
		expect(pageNumber(value)).toBe(1);
	});
});

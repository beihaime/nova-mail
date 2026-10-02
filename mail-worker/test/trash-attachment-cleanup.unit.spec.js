import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
	delete: vi.fn(),
}));

// Permanent deletion must go through the existing storage dispatcher.  This is
// what keeps S3, R2 and KV support behind one path instead of coupling Trash
// to an R2 binding.
vi.mock('../src/service/r2-service', () => ({
	default: { delete: mocks.delete },
}));

const { default: attService } = await import('../src/service/att-service');

describe('Trash attachment cleanup', () => {
	it('uses the storage dispatcher for permanent attachment object cleanup', async () => {
		const context = { env: {} };
		await attService.batchDelete(context, ['attachments/a.txt', 'attachments/b.txt']);
		expect(mocks.delete).toHaveBeenCalledWith(context, ['attachments/a.txt', 'attachments/b.txt']);
	});
});

import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The outbound path must authorize the From identity *before* it does any other
 * work — resolving user-supplied attachment object keys in particular. The
 * authorization itself now lives in the shared sender-address service, so this
 * suite drives that boundary and proves the order is unchanged.
 */
const mocks = vi.hoisted(() => ({ sender: vi.fn(), resolveImages: vi.fn() }));
vi.mock('../src/service/setting-service', () => ({
  default: { query: vi.fn(async () => ({ send: 0, domainList: ['@example.com'], resendTokens: {} })) }
}));
vi.mock('../src/service/user-service', () => ({
  default: { selectById: vi.fn(async () => ({ userId: 1, email: 'owner@example.com' })) }
}));
vi.mock('../src/service/role-service', () => ({
  default: { selectById: vi.fn(async () => ({})) }
}));
vi.mock('../src/service/sender-address-service', () => ({
  default: {
    requireSendableSender: mocks.sender,
    assertRequestedFrom: vi.fn(),
  }
}));
vi.mock('../src/service/att-service', () => ({
  default: { toImageUrlHtml: mocks.resolveImages }
}));

import emailService from '../src/service/email-service';

const params = { accountId: 9, receiveEmail: ['friend@example.com'],
  subject: 'Attachment ownership check', content: '<img src="attachments/foreign.png">', attachments: [] };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveImages.mockRejectedValue(new Error('stopped after authorized lookup'));
});

describe('send authorization order', () => {
  it('does not inspect attachment keys before validating sender ownership', async () => {
    mocks.sender.mockRejectedValue(new Error('Sender email does not belong to current user'));
    await expect(emailService.send({ env: { admin: 'owner@example.com' } }, params, 1)).rejects.toThrow();
    expect(mocks.resolveImages).not.toHaveBeenCalled();
  });

  it('resolves images only after sender ownership has passed', async () => {
    mocks.sender.mockResolvedValue({ userId: 1, email: 'owner@example.com' });
    await expect(emailService.send({ env: { admin: 'owner@example.com' } }, params, 1))
      .rejects.toThrow('stopped after authorized lookup');
    expect(mocks.sender).toHaveBeenCalledWith(expect.anything(), 9, 1, expect.anything());
    expect(mocks.resolveImages).toHaveBeenCalledWith(expect.anything(), params.content, 1, expect.any(String));
  });
});

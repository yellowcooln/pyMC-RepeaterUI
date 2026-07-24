import { afterEach, describe, expect, it, vi } from 'vitest';

import { authClient, exchangeOidcCode } from '@/utils/api';

describe('OIDC API contract', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('posts the callback exchange as the backend code field', async () => {
    const post = vi.spyOn(authClient, 'post').mockResolvedValue({
      data: { success: true, token: 'internal.jwt.token' },
    });

    const response = await exchangeOidcCode('one-time-code', 'browser-client');

    expect(response).toEqual({ success: true, token: 'internal.jwt.token' });
    expect(post).toHaveBeenCalledWith('/auth/oidc/exchange', {
      code: 'one-time-code',
      client_id: 'browser-client',
    });
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService, TOKEN_SECRET_NAME } from '../../src/services/AuthService';
import { StoredTokens } from '../../src/types';

function makeTokens(expiresInMs: number): StoredTokens {
  return {
    accessToken: 'access-token',
    refreshToken: 'refresh-token',
    expiresAt: Date.now() + expiresInMs,
  };
}

describe('AuthService', () => {
  let getSecret: ReturnType<typeof vi.fn>;
  let setSecret: ReturnType<typeof vi.fn>;
  let auth: AuthService;

  beforeEach(() => {
    getSecret = vi.fn();
    setSecret = vi.fn().mockResolvedValue(undefined);
    auth = new AuthService(() => 'client-id', () => 'common', getSecret, setSecret);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('isAuthenticated returns false when no token stored', async () => {
    getSecret.mockReturnValue(null);
    expect(await auth.isAuthenticated()).toBe(false);
  });

  it('isAuthenticated returns true when valid token exists', async () => {
    getSecret.mockReturnValue(JSON.stringify(makeTokens(120_000)));
    expect(await auth.isAuthenticated()).toBe(true);
  });

  it('getValidToken returns access token when not expired', async () => {
    getSecret.mockReturnValue(JSON.stringify(makeTokens(120_000)));
    expect(await auth.getValidToken()).toBe('access-token');
  });

  it('getValidToken throws when not authenticated', async () => {
    getSecret.mockReturnValue(null);
    await expect(auth.getValidToken()).rejects.toThrow('Not authenticated');
  });

  it('getValidToken refreshes token when within 60s buffer', async () => {
    getSecret.mockReturnValue(JSON.stringify(makeTokens(30_000)));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        access_token: 'new-token',
        refresh_token: 'new-refresh',
        expires_in: 3600,
      }),
    }));
    const token = await auth.getValidToken();
    expect(token).toBe('new-token');
    expect(setSecret).toHaveBeenCalled();
  });

  it('getValidToken throws when refresh fails', async () => {
    getSecret.mockReturnValue(JSON.stringify(makeTokens(30_000)));
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      statusText: 'Unauthorized',
    }));
    await expect(auth.getValidToken()).rejects.toThrow('Token refresh failed');
  });

  it('signOut clears the stored secret using the hardcoded key', async () => {
    await auth.signOut();
    expect(setSecret).toHaveBeenCalledWith(TOKEN_SECRET_NAME, '');
  });

  describe('dynamic getter reads', () => {
    it('uses the current clientId at the time of token refresh, not the value at construction', async () => {
      let clientId = 'original-client';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const dynamicAuth = new AuthService(() => clientId, () => 'common', getSecret, setSecret);
      getSecret.mockReturnValue(JSON.stringify(makeTokens(30_000)));

      clientId = 'updated-client';
      await dynamicAuth.getValidToken();

      const body = new URLSearchParams(fetchMock.mock.calls[0][1].body as string);
      expect(body.get('client_id')).toBe('updated-client');
    });

    it('uses the current tenantId at the time of token refresh, not the value at construction', async () => {
      let tenantId = 'original-tenant';
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const dynamicAuth = new AuthService(() => 'client-id', () => tenantId, getSecret, setSecret);
      getSecret.mockReturnValue(JSON.stringify(makeTokens(30_000)));

      tenantId = 'updated-tenant';
      await dynamicAuth.getValidToken();

      const [url] = fetchMock.mock.calls[0] as [string, unknown];
      expect(url).toContain('/updated-tenant/');
    });
  });
});

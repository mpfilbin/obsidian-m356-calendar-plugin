import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AuthService } from '../../src/services/AuthService';
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
    auth = new AuthService('client-id', 'common', getSecret, setSecret, 'token-key');
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

  it('signOut clears the stored secret', async () => {
    await auth.signOut();
    expect(setSecret).toHaveBeenCalledWith('token-key', '');
  });
});

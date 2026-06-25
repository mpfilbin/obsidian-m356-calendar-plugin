import * as crypto from 'crypto';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { requestUrl, type RequestUrlResponse } from 'obsidian';
import { AuthService, TOKEN_SECRET_NAME, generateCodeVerifier, generateCodeChallenge } from '../../src/services/AuthService';
import { StoredTokens } from '../../src/types';

function makeRequestUrlResponse(status: number, json: unknown): RequestUrlResponse {
  return { status, json, headers: {}, arrayBuffer: new ArrayBuffer(0), text: '' } as RequestUrlResponse;
}

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
  let openUrl: ReturnType<typeof vi.fn>;
  let auth: AuthService;

  beforeEach(() => {
    getSecret = vi.fn();
    setSecret = vi.fn().mockResolvedValue(undefined);
    openUrl = vi.fn().mockResolvedValue(undefined);
    auth = new AuthService(() => 'client-id', () => 'common', getSecret, setSecret, openUrl);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.mocked(requestUrl).mockReset();
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
    vi.mocked(requestUrl).mockResolvedValue(
      makeRequestUrlResponse(200, { access_token: 'new-token', refresh_token: 'new-refresh', expires_in: 3600 }),
    );
    const token = await auth.getValidToken();
    expect(token).toBe('new-token');
    expect(setSecret).toHaveBeenCalled();
  });

  it('getValidToken throws when refresh fails', async () => {
    getSecret.mockReturnValue(JSON.stringify(makeTokens(30_000)));
    vi.mocked(requestUrl).mockResolvedValue(
      makeRequestUrlResponse(401, { error: 'Unauthorized' }),
    );
    await expect(auth.getValidToken()).rejects.toThrow('Token refresh failed');
  });

  it('uses POST with contentType field for token requests so Obsidian routes through main-process net, not renderer fetch', async () => {
    getSecret.mockReturnValue(JSON.stringify(makeTokens(30_000)));
    vi.mocked(requestUrl).mockResolvedValue(
      makeRequestUrlResponse(200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }),
    );
    await auth.getValidToken();
    const opts = vi.mocked(requestUrl).mock.calls[0][0] as Record<string, unknown>;
    expect(opts.method).toBe('POST');
    expect(opts.contentType).toBe('application/x-www-form-urlencoded');
    expect(opts.headers).toBeUndefined();
  });

  it('signOut clears the stored secret using the hardcoded key', async () => {
    await auth.signOut();
    expect(setSecret).toHaveBeenCalledWith(TOKEN_SECRET_NAME, '');
  });

  describe('PKCE helpers', () => {
    it('generateCodeVerifier returns a base64url string of the right length', () => {
      const verifier = generateCodeVerifier();
      // 32 bytes base64url-encoded = 43 chars (no padding)
      expect(verifier).toMatch(/^[A-Za-z0-9\-_]+$/);
      expect(verifier.length).toBe(43);
    });

    it('generateCodeChallenge returns SHA-256 of the verifier in base64url', async () => {
      const verifier = generateCodeVerifier();
      const challenge = await generateCodeChallenge(verifier);
      // Independently compute expected value
      const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
      expect(challenge).toBe(expected);
    });

    it('different verifiers produce different challenges', async () => {
      const a = generateCodeVerifier();
      const b = generateCodeVerifier();
      expect(await generateCodeChallenge(a)).not.toBe(await generateCodeChallenge(b));
    });
  });

  describe('dynamic getter reads', () => {
    it('uses the current clientId at the time of token refresh, not the value at construction', async () => {
      let clientId = 'original-client';
      vi.mocked(requestUrl).mockResolvedValue(
        makeRequestUrlResponse(200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }),
      );

      const dynamicAuth = new AuthService(() => clientId, () => 'common', getSecret, setSecret, vi.fn());
      getSecret.mockReturnValue(JSON.stringify(makeTokens(30_000)));

      clientId = 'updated-client';
      await dynamicAuth.getValidToken();

      const opts = vi.mocked(requestUrl).mock.calls[0][0] as { body: string };
      const body = new URLSearchParams(opts.body);
      expect(body.get('client_id')).toBe('updated-client');
    });

    it('uses the current tenantId at the time of token refresh, not the value at construction', async () => {
      let tenantId = 'original-tenant';
      vi.mocked(requestUrl).mockResolvedValue(
        makeRequestUrlResponse(200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }),
      );

      const dynamicAuth = new AuthService(() => 'client-id', () => tenantId, getSecret, setSecret, vi.fn());
      getSecret.mockReturnValue(JSON.stringify(makeTokens(30_000)));

      tenantId = 'updated-tenant';
      await dynamicAuth.getValidToken();

      const opts = vi.mocked(requestUrl).mock.calls[0][0] as { url: string };
      expect(opts.url).toContain('/updated-tenant/');
    });
  });

  describe('handleOAuthCallback', () => {
    it('resolves pending signIn when code is present in params', async () => {
      vi.mocked(requestUrl).mockResolvedValue(
        makeRequestUrlResponse(200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }),
      );
      openUrl.mockImplementation((url: string) => {
        const state = new URL(url).searchParams.get('state') ?? '';
        auth.handleOAuthCallback({ action: 'm365-callback', code: 'auth-code', state });
        return Promise.resolve();
      });
      await auth.signIn();
      expect(setSecret).toHaveBeenCalled();
      expect(openUrl).toHaveBeenCalledWith(expect.stringContaining('login.microsoftonline.com'));
    });

    it('rejects pending signIn when params contain an error', async () => {
      openUrl.mockImplementation((url: string) => {
        const state = new URL(url).searchParams.get('state') ?? '';
        auth.handleOAuthCallback({
          action: 'm365-callback',
          error: 'access_denied',
          error_description: 'User denied access',
          state,
        });
        return Promise.resolve();
      });
      await expect(auth.signIn()).rejects.toThrow('User denied access');
    });

    it('rejects pending signIn with "No authorization code received" when neither code nor error present', async () => {
      openUrl.mockImplementation((url: string) => {
        const state = new URL(url).searchParams.get('state') ?? '';
        auth.handleOAuthCallback({ action: 'm365-callback', state });
        return Promise.resolve();
      });
      await expect(auth.signIn()).rejects.toThrow('No authorization code received');
    });

    it('rejects pending signIn when state does not match', async () => {
      openUrl.mockImplementation(() => {
        auth.handleOAuthCallback({ action: 'm365-callback', code: 'auth-code', state: 'wrong-state' });
        return Promise.resolve();
      });
      await expect(auth.signIn()).rejects.toThrow('state mismatch');
    });

    it('rejects pending signIn immediately when openUrl rejects', async () => {
      openUrl.mockRejectedValue(new Error('Failed to open browser'));
      await expect(auth.signIn()).rejects.toThrow('Failed to open browser');
    });

    it('does nothing when no sign-in is pending', () => {
      expect(() =>
        auth.handleOAuthCallback({ action: 'm365-callback', code: 'stale-code', state: 'any' }),
      ).not.toThrow();
    });
  });
});

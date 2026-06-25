import { requestUrl } from 'obsidian';
import { StoredTokens } from '../types';
import { type Logger, NullLogger } from '../lib/logger';

export const TOKEN_SECRET_NAME = 'm365-calendar-token';

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

const GRAPH_SCOPES = [
  'Calendars.ReadWrite.Shared',
  'Tasks.ReadWrite',
  'User.Read',
  'offline_access',
];

export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return arrayBufferToBase64Url(bytes.buffer);
}

export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64Url(hash);
}

export class AuthService {
  constructor(
    private readonly getClientId: () => string,
    private readonly getTenantId: () => string,
    private readonly getSecret: (name: string) => string | null,
    private readonly setSecret: (name: string, value: string) => Promise<void>,
    private readonly openUrl: (url: string) => void,
    private readonly logger: Logger = new NullLogger(),
  ) {}

  private pendingSignIn: {
    resolve: (code: string) => void;
    reject: (err: Error) => void;
  } | null = null;

  async isAuthenticated(): Promise<boolean> {
    try {
      await this.getValidToken();
      return true;
    } catch {
      return false;
    }
  }

  async getValidToken(): Promise<string> {
    const stored = this.getStoredTokens();
    if (!stored) throw new Error('Not authenticated');

    // If token expires in more than 60s, return it directly
    if (Date.now() < stored.expiresAt - 60_000) {
      return stored.accessToken;
    }

    return this.refreshAccessToken(stored.refreshToken);
  }

  async signIn(): Promise<void> {
    const codeVerifier = generateCodeVerifier();
    const codeChallenge = await generateCodeChallenge(codeVerifier);
    const redirectUri = 'obsidian://m365-callback';

    const code = await new Promise<string>((resolve, reject) => {
      const timeoutHandle = setTimeout(() => {
        this.pendingSignIn = null;
        reject(new Error('Authentication timed out after 120 seconds'));
      }, 120_000);

      this.pendingSignIn = {
        resolve: (c) => { clearTimeout(timeoutHandle); this.pendingSignIn = null; resolve(c); },
        reject: (err) => { clearTimeout(timeoutHandle); this.pendingSignIn = null; reject(err); },
      };

      const authUrl = this.buildAuthUrl(redirectUri, codeChallenge);
      this.logger.log('[M365 Auth] Opening auth URL:', authUrl);
      this.openUrl(authUrl);
    });

    const tokens = await this.exchangeCode(code, redirectUri, codeVerifier);
    await this.storeTokens(tokens);
  }

  async signOut(): Promise<void> {
    await this.setSecret(TOKEN_SECRET_NAME, '');
  }

  private getStoredTokens(): StoredTokens | null {
    const raw = this.getSecret(TOKEN_SECRET_NAME);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as StoredTokens;
    } catch {
      return null;
    }
  }

  private async storeTokens(tokens: StoredTokens): Promise<void> {
    await this.setSecret(TOKEN_SECRET_NAME, JSON.stringify(tokens));
  }

  handleOAuthCallback(params: Record<string, string>): void {
    if (!this.pendingSignIn) return;
    const code = params['code'];
    const error = params['error'];
    if (code) {
      this.logger.log('[M365 Auth] OAuth callback received: code present');
      this.pendingSignIn.resolve(code);
    } else {
      const message = params['error_description'] ?? error ?? 'Unknown error';
      this.logger.log('[M365 Auth] OAuth callback received: error:', error, 'description:', params['error_description']);
      this.pendingSignIn.reject(new Error(`Authentication failed: ${message}`));
    }
  }

  private buildAuthUrl(redirectUri: string, codeChallenge: string): string {
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: GRAPH_SCOPES.join(' '),
      response_mode: 'query',
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `https://login.microsoftonline.com/${this.getTenantId()}/oauth2/v2.0/authorize?${params}`;
  }

  private async exchangeCode(code: string, redirectUri: string, codeVerifier: string): Promise<StoredTokens> {
    const body = new URLSearchParams({
      client_id: this.getClientId(),
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
      scope: GRAPH_SCOPES.join(' '),
      code_verifier: codeVerifier,
    });

    const tokenUrl = `https://login.microsoftonline.com/${this.getTenantId()}/oauth2/v2.0/token`;
    this.logger.log('[M365 Auth] exchangeCode request:', {
      method: 'POST',
      url: tokenUrl,
      grant_type: 'authorization_code',
      client_id: this.getClientId(),
      redirect_uri: redirectUri,
    });
    const response = await requestUrl({
      url: tokenUrl,
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      body: body.toString(),
      throw: false,
    });
    this.logger.log('[M365 Auth] exchangeCode response: status', response.status);

    if (response.status >= 400) {
      const detail = response.json != null ? JSON.stringify(response.json) : response.text;
      this.logger.log('[M365 Auth] exchangeCode error:', detail);
      throw new Error(`Token exchange failed (${response.status}): ${detail}`);
    }
    const data = response.json;
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
  }

  private async refreshAccessToken(refreshToken: string): Promise<string> {
    const body = new URLSearchParams({
      client_id: this.getClientId(),
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: GRAPH_SCOPES.join(' '),
    });

    const tokenUrl = `https://login.microsoftonline.com/${this.getTenantId()}/oauth2/v2.0/token`;
    this.logger.log('[M365 Auth] refreshAccessToken request:', {
      method: 'POST',
      url: tokenUrl,
      grant_type: 'refresh_token',
      client_id: this.getClientId(),
    });
    const response = await requestUrl({
      url: tokenUrl,
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      body: body.toString(),
      throw: false,
    });
    this.logger.log('[M365 Auth] refreshAccessToken response: status', response.status);

    if (response.status >= 400) {
      const detail = response.json != null ? JSON.stringify(response.json) : response.text;
      this.logger.log('[M365 Auth] refreshAccessToken error:', detail);
      throw new Error(`Token refresh failed (${response.status}): ${detail}`);
    }
    const data = response.json;
    const tokens: StoredTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    await this.storeTokens(tokens);
    return tokens.accessToken;
  }
}

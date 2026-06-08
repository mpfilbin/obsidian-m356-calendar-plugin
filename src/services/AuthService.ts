import * as crypto from 'crypto';
import * as http from 'http';
import { requestUrl } from 'obsidian';
import { StoredTokens } from '../types';
import { type Logger, NullLogger } from '../lib/logger';

export const TOKEN_SECRET_NAME = 'm365-calendar-token';

const GRAPH_SCOPES = [
  'Calendars.ReadWrite.Shared',
  'Tasks.ReadWrite',
  'User.Read',
  'offline_access',
];

export function generateCodeVerifier(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function generateCodeChallenge(verifier: string): string {
  return crypto.createHash('sha256').update(verifier).digest('base64url');
}

export class AuthService {
  constructor(
    private readonly getClientId: () => string,
    private readonly getTenantId: () => string,
    private readonly getSecret: (name: string) => string | null,
    private readonly setSecret: (name: string, value: string) => Promise<void>,
    private readonly logger: Logger = new NullLogger(),
  ) {}

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
    const codeChallenge = generateCodeChallenge(codeVerifier);
    const { code, redirectUri } = await this.startLocalServer(codeChallenge);
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

  private async startLocalServer(codeChallenge: string): Promise<{ code: string; redirectUri: string }> {
    return new Promise((resolve, reject) => {
      let redirectUri = '';

      const server = http.createServer((req, res) => {
        this.logger.log('[M365 Auth] Server received request:', req.method, req.url);

        if (!req.url) {
          res.writeHead(400);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');

        // Ignore browser-initiated requests that aren't the OAuth callback
        // (e.g. favicon.ico, preflight). Only the root path carries OAuth params.
        if (url.pathname !== '/') {
          this.logger.log('[M365 Auth] Ignoring non-root request:', url.pathname);
          res.writeHead(204);
          res.end();
          return;
        }

        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        clearTimeout(timeoutHandle);
        server.close();

        if (code) {
          this.logger.log('[M365 Auth] OAuth callback received: code present, redirectUri:', redirectUri);
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html lang="en"><body><h1>Authentication complete.</h1><script>window.close()</script></body></html>');
          resolve({ code, redirectUri });
        } else if (error) {
          const message = errorDescription ?? error;
          this.logger.log('[M365 Auth] OAuth callback received: error:', error, 'description:', errorDescription);
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html lang="en"><body><h1>Authentication failed.</h1><p>You may close this window and try again.</p></body></html>');
          reject(new Error(`Authentication failed: ${message}`));
        } else {
          this.logger.log('[M365 Auth] OAuth callback received: no code and no error');
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html lang="en"><body><h1>Authentication failed</h1><p>No authorization code received.</p></body></html>');
          reject(new Error('No authorization code received'));
        }
      });

      server.on('error', (err) => {
        console.error('[M365 Auth] Server error:', err);
        reject(err);
      });

      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as { port: number }).port;
        redirectUri = `http://localhost:${port}`;
        this.logger.log('[M365 Auth] Local callback server listening on:', redirectUri);
        const authUrl = this.buildAuthUrl(redirectUri, codeChallenge);
        this.logger.log('[M365 Auth] Opening auth URL:', authUrl);
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { shell } = require('electron') as { shell: { openExternal: (url: string) => Promise<void> } };
        void shell.openExternal(authUrl);
      });

      const timeoutHandle = setTimeout(() => {
        server.close();
        reject(new Error('Authentication timed out after 120 seconds'));
      }, 120_000);
    });
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
    this.logger.log('[M365 Auth] exchangeCode requestUrl:', {
      method: 'POST',
      url: tokenUrl,
      contentType: 'application/x-www-form-urlencoded',
      body: Object.fromEntries(body),
    });
    const response = await requestUrl({
      url: tokenUrl,
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      body: body.toString(),
      throw: false,
    });
    this.logger.log('[M365 Auth] exchangeCode response:', { status: response.status, body: response.json ?? response.text });

    if (response.status >= 400) {
      const detail = response.json != null ? JSON.stringify(response.json) : response.text;
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
    this.logger.log('[M365 Auth] refreshAccessToken requestUrl:', {
      method: 'POST',
      url: tokenUrl,
      contentType: 'application/x-www-form-urlencoded',
      body: Object.fromEntries(body),
    });
    const response = await requestUrl({
      url: tokenUrl,
      method: 'POST',
      contentType: 'application/x-www-form-urlencoded',
      body: body.toString(),
      throw: false,
    });
    this.logger.log('[M365 Auth] refreshAccessToken response:', { status: response.status, body: response.json ?? response.text });

    if (response.status >= 400) {
      const detail = response.json != null ? JSON.stringify(response.json) : response.text;
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

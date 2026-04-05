import * as crypto from 'crypto';
import * as http from 'http';
import { StoredTokens } from '../types';

export const TOKEN_SECRET_NAME = 'm365-calendar-token';

const GRAPH_SCOPES = [
  'Calendars.Read',
  'Calendars.ReadWrite',
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
        if (!req.url) {
          res.writeHead(400);
          res.end();
          return;
        }

        const url = new URL(req.url, 'http://localhost');

        // Ignore browser-initiated requests that aren't the OAuth callback
        // (e.g. favicon.ico, preflight). Only the root path carries OAuth params.
        if (url.pathname !== '/') {
          res.writeHead(204);
          res.end();
          return;
        }

        const code = url.searchParams.get('code');
        const error = url.searchParams.get('error');
        const errorDescription = url.searchParams.get('error_description');

        server.close();

        if (code) {
          res.writeHead(200, { 'Content-Type': 'text/html' });
          res.end('<html lang="en"><body><h1>Authentication complete. You can close this tab.</h1></body></html>');
          resolve({ code, redirectUri });
        } else if (error) {
          const message = errorDescription ?? error;
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end(`<html lang="en"><body><h1>Authentication failed</h1><p>${message}</p></body></html>`);
          reject(new Error(`Authentication failed: ${message}`));
        } else {
          res.writeHead(400, { 'Content-Type': 'text/html' });
          res.end('<html lang="en"><body><h1>Authentication failed</h1><p>No authorization code received.</p></body></html>');
          reject(new Error('No authorization code received'));
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as { port: number }).port;
        redirectUri = `http://localhost:${port}`;
        window.open(this.buildAuthUrl(redirectUri, codeChallenge));
      });

      setTimeout(() => {
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

    const response = await fetch(
      `https://login.microsoftonline.com/${this.getTenantId()}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!response.ok) throw new Error(`Token exchange failed: ${response.statusText}`);
    const data = await response.json();
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

    const response = await fetch(
      `https://login.microsoftonline.com/${this.getTenantId()}/oauth2/v2.0/token`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body,
      },
    );

    if (!response.ok) throw new Error(`Token refresh failed: ${response.statusText}`);
    const data = await response.json();
    const tokens: StoredTokens = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? refreshToken,
      expiresAt: Date.now() + data.expires_in * 1000,
    };
    await this.storeTokens(tokens);
    return tokens.accessToken;
  }
}

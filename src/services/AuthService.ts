import * as http from 'http';
import { StoredTokens } from '../types';

export const TOKEN_SECRET_NAME = 'm365-calendar-token';

const GRAPH_SCOPES = [
  'Calendars.Read',
  'Calendars.ReadWrite',
  'User.Read',
  'offline_access',
];

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
    const { code, redirectUri } = await this.startLocalServer();
    const tokens = await this.exchangeCode(code, redirectUri);
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

  private async startLocalServer(): Promise<{ code: string; redirectUri: string }> {
    return new Promise((resolve, reject) => {
      const server = http.createServer((req, res) => {
        const url = new URL(req.url!, 'http://localhost');
        const code = url.searchParams.get('code');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end('<html><body><h1>Authentication complete. You can close this tab.</h1></body></html>');
        server.close();
        if (code) {
          const port = (server.address() as { port: number }).port;
          resolve({ code, redirectUri: `http://localhost:${port}` });
        } else {
          reject(new Error('No authorization code received'));
        }
      });

      server.listen(0, '127.0.0.1', () => {
        const port = (server.address() as { port: number }).port;
        const redirectUri = `http://localhost:${port}`;
        window.open(this.buildAuthUrl(redirectUri));
      });

      setTimeout(() => {
        server.close();
        reject(new Error('Authentication timed out after 120 seconds'));
      }, 120_000);
    });
  }

  private buildAuthUrl(redirectUri: string): string {
    const params = new URLSearchParams({
      client_id: this.getClientId(),
      response_type: 'code',
      redirect_uri: redirectUri,
      scope: GRAPH_SCOPES.join(' '),
      response_mode: 'query',
    });
    return `https://login.microsoftonline.com/${this.getTenantId()}/oauth2/v2.0/authorize?${params}`;
  }

  private async exchangeCode(code: string, redirectUri: string): Promise<StoredTokens> {
    const body = new URLSearchParams({
      client_id: this.getClientId(),
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
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

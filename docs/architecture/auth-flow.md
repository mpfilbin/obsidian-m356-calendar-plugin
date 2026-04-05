# Authentication Flow

## OAuth 2.0 Authorization Code Flow with PKCE

```mermaid
sequenceDiagram
    participant User
    participant Plugin as Obsidian Plugin
    participant Server as Local HTTP Server<br/>(127.0.0.1:PORT)
    participant Browser as System Browser
    participant MS as Microsoft Identity<br/>(login.microsoftonline.com)
    participant Graph as Microsoft Graph API

    User->>Plugin: Click "Sign In" in Settings
    Plugin->>Plugin: Generate code_verifier (32 random bytes, base64url)
    Plugin->>Plugin: code_challenge = BASE64URL(SHA-256(code_verifier))
    Plugin->>Server: Start HTTP server on random port
    Plugin->>Browser: window.open(authorization URL)<br/>?client_id=...&redirect_uri=http://localhost:PORT<br/>&scope=Calendars.Read Calendars.ReadWrite User.Read offline_access<br/>&code_challenge=...&code_challenge_method=S256
    Browser->>MS: GET authorization URL
    MS->>Browser: Display login UI
    User->>MS: Enter credentials
    MS->>Browser: Redirect → http://localhost:PORT/?code=AUTH_CODE
    Browser->>Server: GET /?code=AUTH_CODE
    Note over Server: Non-root requests (favicon etc.) receive 204 and are ignored
    Server->>Browser: 200 "Authentication complete. You can close this tab."
    Server->>Plugin: Resolve { code, redirectUri }
    Server->>Server: Shutdown
    Plugin->>MS: POST /oauth2/v2.0/token<br/>{code, client_id, redirect_uri, grant_type: authorization_code,<br/>code_verifier}
    MS->>MS: Verify SHA-256(code_verifier) == code_challenge
    MS->>Plugin: { access_token, refresh_token, expires_in }
    Plugin->>Plugin: Store tokens in SecretStorage (JSON)
```

## Silent Token Refresh

```mermaid
sequenceDiagram
    participant Plugin as Obsidian Plugin
    participant MS as Microsoft Identity
    participant Graph as Microsoft Graph API

    Plugin->>Plugin: getValidToken() — check expiresAt
    alt Access token valid (expires > 60s from now)
        Plugin->>Graph: API call with Bearer access_token
        Graph->>Plugin: Response
    else Access token expiring within 60s
        Plugin->>MS: POST /oauth2/v2.0/token<br/>{refresh_token, grant_type: refresh_token}
        MS->>Plugin: { access_token, refresh_token, expires_in }
        Plugin->>Plugin: Update tokens in SecretStorage
        Plugin->>Graph: API call with Bearer new_access_token
        Graph->>Plugin: Response
    else Refresh token expired or missing
        Plugin->>Plugin: Throw "Not authenticated"
        Plugin->>User: Toast notification + error banner
    end
```

## Token Lifecycle

| Token | Typical Lifetime | Storage | Purpose |
|---|---|---|---|
| Access token | ~1 hour | `SecretStorage` (JSON blob) | Sent as `Bearer` header on every Graph request |
| Refresh token | 90 days (sliding) | `SecretStorage` (JSON blob) | Used to silently obtain new access tokens |

## Security Notes

- Tokens are **never** written to `data.json` — only stored in Obsidian's `SecretStorage` (local storage, vault-scoped)
- The local HTTP server binds to `127.0.0.1` only (not `0.0.0.0`)
- The server shuts down immediately after receiving the authorization code
- Non-root requests to the callback server (e.g. favicon) are returned a `204` and ignored — only `/` triggers the OAuth callback logic
- The auth flow times out after **120 seconds** if the user does not complete sign-in
- **PKCE** (Proof Key for Code Exchange, S256) is used on every sign-in — a fresh `code_verifier`/`code_challenge` pair is generated per session, preventing authorization code interception attacks
- The storage key for tokens is hardcoded as `m365-calendar-token` and is not user-configurable

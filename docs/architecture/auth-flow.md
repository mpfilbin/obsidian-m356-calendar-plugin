# Authentication Flow

## OAuth 2.0 Authorization Code Flow

```mermaid
sequenceDiagram
    participant User
    participant Plugin as Obsidian Plugin
    participant Server as Local HTTP Server<br/>(127.0.0.1:PORT)
    participant Browser as System Browser
    participant MS as Microsoft Identity<br/>(login.microsoftonline.com)
    participant Graph as Microsoft Graph API

    User->>Plugin: Click "Sign In" in Settings
    Plugin->>Server: Start HTTP server on random port
    Plugin->>Browser: window.open(authorization URL)<br/>?client_id=...&redirect_uri=http://localhost:PORT<br/>&scope=Calendars.Read Calendars.ReadWrite User.Read offline_access
    Browser->>MS: GET authorization URL
    MS->>Browser: Display login UI
    User->>MS: Enter credentials
    MS->>Browser: Redirect → http://localhost:PORT/?code=AUTH_CODE
    Browser->>Server: GET /?code=AUTH_CODE
    Server->>Browser: 200 "Authentication complete. You can close this tab."
    Server->>Plugin: Resolve { code, redirectUri }
    Server->>Server: Shutdown
    Plugin->>MS: POST /oauth2/v2.0/token<br/>{code, client_id, redirect_uri, grant_type: authorization_code}
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
        Plugin->>User: Prompt to sign in again
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
- The auth flow times out after **120 seconds** if the user does not complete sign-in
- The plugin uses the **Authorization Code flow** (no client secret required for public clients)

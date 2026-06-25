# Mobile Support Design

**Date:** 2026-06-24  
**Status:** Approved

## Goal

Enable the M365 Calendar plugin to load and authenticate on Obsidian Mobile (iOS and Android). Touch-optimised UI interactions are out of scope and deferred to a follow-up effort.

## Background

The plugin is currently marked `"isDesktopOnly": true` because `AuthService` depends on three Node/Electron APIs unavailable in Obsidian Mobile's WebView runtime:

| Dependency | Used for | Mobile blocker |
|---|---|---|
| `import * as http from 'http'` | Local callback server for OAuth redirect | Node built-in, absent on mobile |
| `require('electron').shell` | Opening system browser for auth URL | Electron-only |
| `import * as crypto from 'crypto'` | PKCE code verifier + challenge | Node built-in, absent on mobile |

All other services (`CalendarService`, `TodoService`, `WeatherService`) already use Obsidian's `requestUrl`, which is cross-platform.

## Approach: Unified `obsidian://` OAuth Flow

Replace the localhost HTTP server + Electron shell with Obsidian's built-in protocol handler mechanism. Both desktop and mobile use the same code path.

**Sign-in sequence:**

1. User clicks **Sign in** in settings; button is disabled immediately.
2. `AuthService.signIn()` generates PKCE code verifier via `crypto.getRandomValues` and computes the SHA-256 challenge via `crypto.subtle.digest` (async).
3. `signIn()` stores `{ resolve, reject }` as `this.pendingSignIn` and starts a 120-second timeout.
4. `signIn()` calls `this.openUrl(authUrl)`:
   - **Desktop:** `require('electron').shell.openExternal(url)` — opens in system browser.
   - **Mobile:** `window.open(url)` — opens in in-app browser (SFSafariViewController on iOS, Custom Tabs on Android).
5. User authenticates on Microsoft's login page.
6. Microsoft redirects to `obsidian://m365-callback?code=...`.
7. The OS routes the deep link to Obsidian; `registerObsidianProtocolHandler('m365-callback', ...)` fires.
8. `authService.handleOAuthCallback(params)` resolves `pendingSignIn` with the code (or rejects on error) and clears it.
9. `signIn()` resumes, calls `exchangeCode()` (uses `requestUrl` — unchanged), stores tokens.

Token refresh (`refreshAccessToken`) is already cross-platform and requires no changes.

## Changes

### `src/services/AuthService.ts`

- Remove `import * as http from 'http'` and `import * as crypto from 'crypto'`.
- Replace exported `generateCodeVerifier()` / `generateCodeChallenge()` with Web Crypto equivalents:
  - `generateCodeVerifier()`: synchronous, uses `crypto.getRandomValues(new Uint8Array(32))` + custom base64url encoder.
  - `generateCodeChallenge(verifier)`: **async**, uses `crypto.subtle.digest('SHA-256', ...)`.
- Add constructor parameter `openUrl: (url: string) => void`.
- Add instance field `private pendingSignIn: { resolve: (code: string) => void; reject: (err: Error) => void } | null = null`.
- Replace `startLocalServer()` with `handleOAuthCallback(params: ObsidianProtocolData): void` — public method called by the plugin when the protocol handler fires.
- `signIn()` uses the fixed redirect URI `'obsidian://m365-callback'` and awaits `generateCodeChallenge`.

### `src/main.ts`

Two additions in `onload()`:

1. Determine `openUrl` based on platform:
   ```typescript
   const openUrl = Platform.isDesktopApp
     ? (url: string) => { require('electron').shell.openExternal(url); }
     : (url: string) => { window.open(url); };
   ```
2. Register protocol handler:
   ```typescript
   this.registerObsidianProtocolHandler('m365-callback', (params) => {
     this.authService.handleOAuthCallback(params);
   });
   ```
3. Pass `openUrl` to `AuthService` constructor.

### `src/settings.ts`

Add a notice under the **Microsoft 365 authentication** heading explaining that users must add `obsidian://m365-callback` as a redirect URI in their Azure AD app registration, and that existing users who previously had `http://localhost` registered must sign out and sign back in after updating their Azure app.

### `manifest.json`

Change `"isDesktopOnly": true` to `"isDesktopOnly": false`.

### `README.md`

Update the Azure AD app registration setup section to:
- Replace the redirect URI from `http://localhost` to `obsidian://m365-callback`.
- Add a note that this URI works on both desktop and mobile.
- Add a migration note for existing users.

## Error Handling

| Scenario | Behaviour |
|---|---|
| Timeout (120 s with no callback) | Timeout handler calls `pendingSignIn.reject(new Error('Authentication timed out...'))` and clears `pendingSignIn` |
| Microsoft returns error in redirect | `handleOAuthCallback` detects absence of `code`, rejects with `error_description` |
| Stale deep link (no pending sign-in) | `handleOAuthCallback` silently returns |
| Double sign-in attempt | Settings UI disables the button after first click; no concurrent calls expected |

## Testing

- **`generateCodeVerifier` / `generateCodeChallenge`** — unit tests against known PKCE test vectors; jsdom's `crypto.subtle` is available without mocking.
- **`handleOAuthCallback`** — two unit tests: happy path (resolves with code) and error path (rejects with `error_description`).
- Existing `AuthService` unit tests for `getValidToken` and `refreshAccessToken` are unaffected.
- No integration test for full sign-in: the protocol handler is registered on `Plugin` and cannot be exercised in jsdom; unit tests on `handleOAuthCallback` cover the critical callback logic.

## Out of Scope

- Touch-optimised UI (hover popovers, right-click context menus) — deferred.
- Android-specific testing beyond confirming `window.open` and deep links work.

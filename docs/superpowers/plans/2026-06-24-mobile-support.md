# Mobile Support Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable the M365 Calendar plugin to load and authenticate on Obsidian Mobile (iOS and Android) by replacing the Node/Electron OAuth flow with a cross-platform `obsidian://` deep-link flow.

**Architecture:** `AuthService` loses its Node `http`/`crypto` imports and gains a `handleOAuthCallback` method and an `openUrl` constructor parameter. `main.ts` registers the `obsidian://m365-callback` protocol handler once at load and provides a platform-appropriate URL opener (Electron `shell` on desktop, `window.open` on mobile). The redirect URI changes from a dynamic `http://localhost:PORT` to the fixed `obsidian://m365-callback`.

**Tech Stack:** TypeScript, Vitest (jsdom), Obsidian Plugin API, Web Crypto API (`crypto.getRandomValues`, `crypto.subtle.digest`), Electron shell (desktop only).

## Global Constraints

- All Node built-ins (`crypto`, `http`) must be removed from `AuthService.ts` — they are not available on mobile.
- `require('electron')` may only appear in `main.ts` behind a `Platform.isDesktopApp` guard.
- `generateCodeChallenge` becomes `async`; every call site must `await` it.
- Redirect URI is the fixed string `'obsidian://m365-callback'` — no dynamic port.
- All git operations must use `mcp__git__*` MCP tools (not `git` CLI directly).
- Run commands: `npm test` (single pass), `npm run typecheck`, `npm run lint`.

---

## File Map

| File | Change |
|---|---|
| `src/services/AuthService.ts` | Remove Node imports; replace PKCE helpers with Web Crypto; replace `startLocalServer()` with `handleOAuthCallback()`; add `openUrl` constructor param; update `signIn()` |
| `tests/services/AuthService.test.ts` | Add `openUrl` mock to `beforeEach`; make PKCE challenge tests async; add `handleOAuthCallback` describe block; update inner `AuthService` constructions |
| `src/main.ts` | Import `Platform`; build `openUrl`; pass to `AuthService`; register protocol handler |
| `src/settings.ts` | Add redirect URI info block after auth heading |
| `manifest.json` | `isDesktopOnly: false` |
| `README.md` | Update prerequisites, Azure AD setup step, plugin setup steps, troubleshooting |

---

## Task 1: Replace PKCE helpers and `signIn()` in `AuthService`

**Files:**
- Modify: `src/services/AuthService.ts`
- Test: `tests/services/AuthService.test.ts`

**Interfaces:**
- Produces: `generateCodeVerifier(): string` (unchanged signature), `generateCodeChallenge(verifier: string): Promise<string>` (now async), `AuthService` constructor now requires 5th param `openUrl: (url: string) => void` before `logger`, `handleOAuthCallback(params: Record<string, string>): void` (new public method).

---

- [ ] **Step 1: Write the failing tests**

Open `tests/services/AuthService.test.ts` and make the following changes (the suite will fail to compile until Task 1 is complete):

**a) Add `openUrl` to the top-level declare block and `beforeEach`:**

Replace the existing `describe('AuthService', () => {` block opener through the closing brace of `beforeEach`:

```typescript
describe('AuthService', () => {
  let getSecret: ReturnType<typeof vi.fn>;
  let setSecret: ReturnType<typeof vi.fn>;
  let openUrl: ReturnType<typeof vi.fn>;
  let auth: AuthService;

  beforeEach(() => {
    getSecret = vi.fn();
    setSecret = vi.fn().mockResolvedValue(undefined);
    openUrl = vi.fn();
    auth = new AuthService(() => 'client-id', () => 'common', getSecret, setSecret, openUrl);
  });
```

**b) Update the two `new AuthService(...)` calls inside `describe('dynamic getter reads', ...)` (lines ~120 and ~136) to pass `vi.fn()` as the 5th argument:**

```typescript
const dynamicAuth = new AuthService(() => clientId, () => 'common', getSecret, setSecret, vi.fn());
```

```typescript
const dynamicAuth = new AuthService(() => 'client-id', () => tenantId, getSecret, setSecret, vi.fn());
```

**c) Make the two PKCE challenge tests `async`:**

```typescript
it('generateCodeChallenge returns SHA-256 of the verifier in base64url', async () => {
  const verifier = generateCodeVerifier();
  const challenge = await generateCodeChallenge(verifier);
  const expected = crypto.createHash('sha256').update(verifier).digest('base64url');
  expect(challenge).toBe(expected);
});

it('different verifiers produce different challenges', async () => {
  const a = generateCodeVerifier();
  const b = generateCodeVerifier();
  expect(await generateCodeChallenge(a)).not.toBe(await generateCodeChallenge(b));
});
```

**d) Add a new `describe('handleOAuthCallback', ...)` block immediately before the final closing `});` of `describe('AuthService', ...)`:**

```typescript
describe('handleOAuthCallback', () => {
  it('resolves pending signIn when code is present in params', async () => {
    vi.mocked(requestUrl).mockResolvedValue(
      makeRequestUrlResponse(200, { access_token: 'tok', refresh_token: 'ref', expires_in: 3600 }),
    );
    openUrl.mockImplementation(() => {
      auth.handleOAuthCallback({ action: 'm365-callback', code: 'auth-code' });
    });
    await auth.signIn();
    expect(setSecret).toHaveBeenCalled();
    expect(openUrl).toHaveBeenCalledWith(expect.stringContaining('login.microsoftonline.com'));
  });

  it('rejects pending signIn when params contain an error', async () => {
    openUrl.mockImplementation(() => {
      auth.handleOAuthCallback({
        action: 'm365-callback',
        error: 'access_denied',
        error_description: 'User denied access',
      });
    });
    await expect(auth.signIn()).rejects.toThrow('User denied access');
  });

  it('does nothing when no sign-in is pending', () => {
    expect(() =>
      auth.handleOAuthCallback({ action: 'm365-callback', code: 'stale-code' }),
    ).not.toThrow();
  });
});
```

> **Why `openUrl.mockImplementation`?** `pendingSignIn` is assigned before `openUrl(authUrl)` is called inside `signIn()`, so calling `handleOAuthCallback` from within the mock immediately resolves the pending promise — no timing tricks needed.

- [ ] **Step 2: Verify tests fail to compile**

```bash
npm test -- --reporter=verbose 2>&1 | head -40
```

Expected: TypeScript compile errors about missing 5th argument and `generateCodeChallenge` not returning a Promise.

- [ ] **Step 3: Implement the changes in `AuthService.ts`**

Make the following changes to `src/services/AuthService.ts`:

**a) Remove the two Node import lines at the top:**

```typescript
// DELETE these two lines:
import * as crypto from 'crypto';
import * as http from 'http';
```

**b) Add `arrayBufferToBase64Url` helper immediately before `generateCodeVerifier` (keep it unexported):**

```typescript
function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}
```

**c) Replace `generateCodeVerifier`:**

```typescript
export function generateCodeVerifier(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return arrayBufferToBase64Url(bytes.buffer);
}
```

**d) Replace `generateCodeChallenge` (now async):**

```typescript
export async function generateCodeChallenge(verifier: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return arrayBufferToBase64Url(hash);
}
```

**e) Replace the `AuthService` class constructor and add the `pendingSignIn` field:**

```typescript
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
```

**f) Replace the `signIn()` method:**

```typescript
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
```

**g) Replace the `startLocalServer()` private method with `handleOAuthCallback()`:**

Delete the entire `private async startLocalServer(...)` method and replace it with:

```typescript
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
```

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All tests pass, including the three new `handleOAuthCallback` tests and the updated PKCE tests.

- [ ] **Step 5: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: No errors. If `crypto` is flagged as an unknown global, it is the browser's `globalThis.crypto` — it does not need an import in a TypeScript `lib: ["ES2018", "DOM"]` project.

- [ ] **Step 6: Commit**

Stage and commit:
- `src/services/AuthService.ts`
- `tests/services/AuthService.test.ts`

```
feat: replace Node crypto/http with Web Crypto and obsidian:// callback in AuthService
```

---

## Task 2: Wire up protocol handler in `main.ts`

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `AuthService` constructor now takes `openUrl: (url: string) => void` as 5th param (from Task 1), `authService.handleOAuthCallback(params: Record<string, string>): void` (from Task 1).
- Consumes: `Platform` from `'obsidian'`.

---

- [ ] **Step 1: Add `Platform` to the obsidian import**

In `src/main.ts`, update the first import line from:

```typescript
import { Plugin, WorkspaceLeaf } from 'obsidian';
```

to:

```typescript
import { Platform, Plugin, WorkspaceLeaf } from 'obsidian';
```

- [ ] **Step 2: Replace the `AuthService` construction block in `onload()`**

Find the existing block (it begins with `this.authService = new AuthService(`) and replace it and the surrounding context with:

```typescript
const openUrl = Platform.isDesktopApp
  ? (url: string) => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { shell } = require('electron') as { shell: { openExternal: (url: string) => Promise<void> } };
      shell.openExternal(url).catch((err: unknown) => {
        this.logger.error('[M365 Auth] Failed to open auth URL:', err);
      });
    }
  : (url: string) => { window.open(url, '_blank'); };

this.authService = new AuthService(
  () => this.settings.clientId,
  () => this.settings.tenantId,
  (name) => this.app.secretStorage.getSecret(name),
  async (name, value) => { await this.app.secretStorage.setSecret(name, value); },
  openUrl,
  this.logger,
);

this.registerObsidianProtocolHandler('m365-callback', (params) => {
  this.authService.handleOAuthCallback(params);
});
```

- [ ] **Step 3: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: No errors.

- [ ] **Step 4: Run tests**

```bash
npm test
```

Expected: All tests still pass (no `main.ts` unit tests, but the test suite must remain green).

- [ ] **Step 5: Commit**

Stage and commit:
- `src/main.ts`

```
feat: register obsidian://m365-callback protocol handler in plugin
```

---

## Task 3: Add redirect URI notice in settings UI

**Files:**
- Modify: `src/settings.ts`

---

- [ ] **Step 1: Add the redirect URI info block**

In `src/settings.ts`, find the authentication heading line:

```typescript
new Setting(containerEl).setName('Microsoft 365 authentication').setHeading();
```

Immediately after it, insert:

```typescript
const redirectInfo = containerEl.createEl('div', { cls: 'm365-auth-info' });
redirectInfo.createEl('p', {
  text: 'Your Azure AD app must have the following redirect URI registered under Mobile and desktop applications:',
});
redirectInfo.createEl('code', { text: 'obsidian://m365-callback' });
redirectInfo.createEl('p', {
  text: 'If you previously used this plugin, update your Azure AD app registration and sign out, then sign back in.',
});
```

- [ ] **Step 2: Typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: No errors.

- [ ] **Step 3: Commit**

Stage and commit:
- `src/settings.ts`

```
feat: show obsidian://m365-callback redirect URI instructions in settings
```

---

## Task 4: Update `manifest.json` and `README.md`

**Files:**
- Modify: `manifest.json`
- Modify: `README.md`

---

- [ ] **Step 1: Update `manifest.json`**

In `manifest.json`, change:

```json
"isDesktopOnly": true
```

to:

```json
"isDesktopOnly": false
```

- [ ] **Step 2: Update the prerequisites section of `README.md`**

Replace line 16:

```markdown
- Obsidian **desktop** (Windows, macOS, Linux) — not currently supported on mobile
```

with:

```markdown
- Obsidian desktop (Windows, macOS, Linux) or Obsidian Mobile (iOS, Android)
```

- [ ] **Step 3: Update the Azure AD app registration step**

In the **Azure AD App Registration** section, replace step 3's redirect URI bullet:

```markdown
   - **Redirect URI:** Select `Mobile and desktop applications` and enter `http://localhost` — the plugin will dynamically append the port at runtime
```

with:

```markdown
   - **Redirect URI:** Select `Mobile and desktop applications` and enter `obsidian://m365-callback`
```

- [ ] **Step 4: Update the Plugin Setup steps**

Replace steps 4–5 in the **Plugin Setup** section:

```markdown
4. Click **Sign In** — your browser will open for Microsoft login
5. After signing in, close the browser tab and return to Obsidian
```

with:

```markdown
4. Click **Sign in** — your system browser will open for Microsoft login. After authenticating, your browser will redirect back to Obsidian automatically.
```

- [ ] **Step 5: Update the troubleshooting section**

Replace the first troubleshooting entry:

```markdown
**The sign-in window opens but nothing happens after I log in**  
Make sure `http://localhost` is listed as a redirect URI under the **Mobile and desktop applications** platform in your Azure app registration. Do not use the Single-page application platform — it issues short-lived refresh tokens and will require daily re-authentication.
```

with:

```markdown
**The sign-in window opens but nothing happens after I log in**  
Make sure `obsidian://m365-callback` is listed as a redirect URI under the **Mobile and desktop applications** platform in your Azure app registration. Do not use the Single-page application platform — it issues short-lived refresh tokens and will require daily re-authentication.
```

Replace the second troubleshooting entry:

```markdown
**I get an error saying the token was issued to a Single-page application and the refresh token has expired**  
Your Azure app registration is using the wrong platform type. In Azure Portal → your app → Authentication, remove the Single-page application redirect URI and add a Mobile and desktop applications platform with `http://localhost` as the redirect URI. Sign out and sign back in once to get a new token.
```

with:

```markdown
**I get an error saying the token was issued to a Single-page application and the refresh token has expired**  
Your Azure app registration is using the wrong platform type. In Azure Portal → your app → Authentication, remove the Single-page application redirect URI and add a Mobile and desktop applications platform with `obsidian://m365-callback` as the redirect URI. Sign out and sign back in once to get a new token.
```

- [ ] **Step 6: Run the full test and build suite one final time**

```bash
npm test && npm run typecheck && npm run lint
```

Expected: All pass.

- [ ] **Step 7: Commit**

Stage and commit:
- `manifest.json`
- `README.md`

```
feat: enable mobile support — update manifest and documentation
```

# Azure App Registration — Token Lifetime Fix

**Date:** 2026-04-10
**Status:** Approved
**Scope:** Azure Portal configuration change + plugin code change in `AuthService`

## Problem

After the OAuth access token expires, the plugin attempts to use the refresh token to obtain a new one. This fails with an error from Microsoft stating that because the token was issued to a Single Page Application (SPA), the refresh token has expired.

Microsoft caps refresh token lifetimes for SPA platform registrations at 24 hours (non-renewable). This forces a full interactive re-login every day.

## Root Cause

The Azure AD app registration is configured with the **Single Page Application** platform type. SPA is intended for browser-based JavaScript apps that cannot securely store secrets. Microsoft enforces a strict, short-lived token policy for this platform type.

The plugin's actual auth flow — spinning up a local HTTP server to capture the OAuth callback — matches the **Mobile and desktop applications** platform type. Registering it as SPA is a mismatch that causes the unfavorable token lifetime policy to apply.

## Solution

Two changes are required:

**1. Azure Portal reconfiguration:** Change the app registration platform from Single Page Application to **Mobile and desktop applications**. Desktop/native app registrations use a sliding-window refresh token policy: tokens are valid for 90 days and reset on every use. Since the plugin refreshes the access token automatically (polling every 10 minutes by default), the refresh token will effectively never expire during normal use.

**2. Plugin code change:** Switching to the desktop platform type exposes a second issue — Obsidian's `fetch` sends an `Origin: app://obsidian.md` header, which Microsoft rejects for non-SPA registrations (`AADSTS9002326`). The token exchange and refresh calls in `AuthService` must use Obsidian's `requestUrl` API instead, which routes through Electron's main process without adding CORS headers.

## Steps

In [portal.azure.com](https://portal.azure.com) → Azure Active Directory → App registrations → your app → **Authentication**:

1. Under **Single-page application**, remove the existing `http://localhost` redirect URI. If it is the only URI in that section, the SPA platform block will disappear.
2. Click **Add a platform** → select **Mobile and desktop applications**.
3. Add `http://localhost` as a custom redirect URI. Microsoft ignores the port for localhost URIs (per RFC), so the plugin's random-port callback will match correctly.
4. Click **Save**.

After saving, sign out from the plugin settings and sign back in once. The new token will be issued under the desktop registration with a 90-day sliding-window refresh token.

## Expected Outcome

As long as Obsidian is opened at least once every 90 days, the user will not be prompted to re-authenticate.

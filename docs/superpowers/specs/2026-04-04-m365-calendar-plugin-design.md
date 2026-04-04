# M365 Calendar Plugin — Design Specification

**Date:** 2026-04-04  
**Status:** Approved  

---

## Overview

An Obsidian plugin that renders a calendar view of the user's Microsoft 365 calendars (personal, shared, and group) directly inside Obsidian. Events are fetched from the Microsoft Graph API and cached locally for instant rendering. Users can view events in month or week layout and create new events without leaving Obsidian.

---

## Goals

- Display M365 calendar events inside Obsidian in month and week views
- Support personal, shared, and group calendars with per-calendar enable/disable
- Allow users to create new events from within Obsidian
- Authenticate securely using Azure AD OAuth with tokens stored in Obsidian's `SecretStorage`
- Cache events locally for instant render and offline resilience
- Respect the active Obsidian theme via CSS variables
- Ship as a BRAT-compatible GitHub release for beta distribution

## Non-Goals (v1)

- Editing or deleting existing events
- Day view or agenda view
- Recurring event expansion UI
- Meeting RSVP / accept/decline
- Note linking to calendar events
- Mobile support (desktop only for v1 due to OAuth redirect flow)

---

## Architecture

The plugin is structured in three layers with clear boundaries:

```
┌─────────────────────────────────────────┐
│           Obsidian Bridge               │
│  M365CalendarPlugin (main.ts)           │
│  M365CalendarView (ItemView)            │
│  Settings tab + SecretStorage           │
└────────────────┬────────────────────────┘
                 │ mounts React root
┌────────────────▼────────────────────────┐
│           React UI Layer                │
│  CalendarApp (root component)           │
│  MonthView / WeekView                   │
│  EventCard, Toolbar, CalendarSelector   │
│  CreateEventModal                       │
└────────────────┬────────────────────────┘
                 │ calls
┌────────────────▼────────────────────────┐
│           Graph Service Layer           │
│  AuthService  — OAuth + token refresh   │
│  CalendarService — fetch/cache events   │
│  CacheService — local JSON persistence  │
└─────────────────────────────────────────┘
```

### Layer responsibilities

**Obsidian Bridge** is the only layer that imports from `obsidian`. It handles plugin lifecycle (`onload`/`onunload`), registers the view, manages settings persistence, and mounts/unmounts the React root onto `ItemView.contentEl`.

**React UI Layer** knows nothing about Obsidian. It receives data via props and React Context and communicates upward via callbacks. This isolation makes all components testable with Vitest + `@testing-library/react` without an Obsidian runtime.

**Graph Service Layer** knows nothing about React or Obsidian. It is composed of pure async TypeScript classes that interact with the Microsoft Graph REST API and the local cache.

---

## Authentication

### Azure AD App Registration

The user (or plugin distributor) registers an app in the [Azure portal](https://portal.azure.com) with:

| Setting | Value |
|---|---|
| Platform | Single-page application (SPA) |
| Redirect URI | `http://localhost:<PORT>` (dynamic port chosen at runtime) |
| Supported account types | Personal Microsoft accounts + work/school accounts |
| API permissions | `Calendars.Read`, `Calendars.ReadWrite`, `User.Read` |

The **Client ID** and **Tenant ID** (`common` by default for multi-tenant) are stored in `data.json` (non-secret). Tokens are stored in Obsidian's `SecretStorage`.

### OAuth Flow

See `docs/architecture/auth-flow.md` for the full MermaidJS sequence diagram.

1. User clicks **Sign In** in plugin settings
2. Plugin starts a temporary HTTP server on a random available port
3. Plugin opens the Microsoft authorization URL in the system browser via `window.open()`
4. User completes login in browser; Microsoft redirects to `http://localhost:<PORT>/?code=...`
5. Plugin's local server captures the authorization code
6. Plugin exchanges the code for an access token + refresh token via the token endpoint
7. Tokens are stored in `SecretStorage` under a known key
8. Local server shuts down

### `AuthService` API

```ts
signIn(): Promise<void>
signOut(): Promise<void>
getValidToken(): Promise<string>   // refreshes silently if expired
isAuthenticated(): Promise<boolean>
```

`getValidToken()` checks expiry before every Graph call and performs a silent refresh using the stored refresh token. If the refresh token itself has expired the user is prompted to sign in again.

### Settings

| Key | Storage | Description |
|---|---|---|
| `clientId` | `data.json` | Azure AD app client ID |
| `tenantId` | `data.json` | Azure AD tenant (`common` by default) |
| `tokenSecretName` | `data.json` | Name of the `SecretStorage` entry holding tokens |
| Tokens (access + refresh) | `SecretStorage` | Never written to `data.json` |

---

## Calendar & Event Data

### Microsoft Graph Endpoints

| Purpose | Endpoint |
|---|---|
| List calendars | `GET /me/calendars` |
| List calendar groups | `GET /me/calendarGroups` |
| Fetch events for date range | `GET /me/calendars/{id}/calendarView?startDateTime=...&endDateTime=...` |
| Create event | `POST /me/calendars/{id}/events` |

All requests are authenticated with a Bearer token from `AuthService.getValidToken()`.

### `CalendarService` API

```ts
getCalendars(): Promise<M365Calendar[]>
getEvents(calendarIds: string[], start: Date, end: Date): Promise<M365Event[]>
createEvent(calendarId: string, event: NewEventInput): Promise<M365Event>
```

### `CacheService`

- Persists fetched event data using injected `load` / `save` callbacks (provided by the Obsidian bridge at construction time — `CacheService` itself does not import from `obsidian`)
- Cache key: `calendarId + ISO date range string`
- Cache TTL: 24 hours — stale entries are purged on plugin load
- On view open: serve from cache immediately, then trigger a background refresh
- Background refresh interval: configurable in settings (default: 10 minutes)

### `CacheService` API

```ts
get(key: string): CachedEvents | null
set(key: string, events: M365Event[]): void
purgeExpired(): void
```

### Plugin Settings

| Key | Type | Default | Description |
|---|---|---|---|
| `clientId` | `string` | `""` | Azure AD client ID |
| `tenantId` | `string` | `"common"` | Azure AD tenant ID |
| `tokenSecretName` | `string` | `"m365-calendar-token"` | SecretStorage key |
| `enabledCalendarIds` | `string[]` | `[]` | User-selected calendars to display |
| `defaultCalendarId` | `string` | `""` | Default calendar for new event creation |
| `refreshIntervalMinutes` | `number` | `10` | Background refresh cadence |
| `defaultView` | `"month" \| "week"` | `"month"` | Initial calendar view |

---

## React UI

### Component Tree

```
CalendarApp
├── Toolbar
│   ├── ViewToggle (Month | Week)
│   ├── DateNavigator (← Today →)
│   └── RefreshButton + SyncStatus
├── CalendarSelector
│   └── CalendarToggle (per calendar — name + colour swatch + enabled toggle)
├── MonthView
│   └── EventCard (per event)
└── WeekView
    └── EventCard (per event)
```

`CreateEventModal` is an Obsidian `Modal` subclass — it is the one exception to the "React UI layer knows nothing about Obsidian" rule. It extends `Modal` from `obsidian` and renders a React root inside `contentEl`, then calls a `onSubmit` callback to hand the result back to `CalendarService`. It is triggered imperatively from `CalendarApp` using the `app` instance from context.

### React Context

A single `AppContext` provides to all components:

```ts
interface AppContextValue {
  app: App                        // Obsidian App instance
  calendarService: CalendarService
  settings: M365CalendarSettings
  saveSettings: (s: M365CalendarSettings) => Promise<void>
}
```

### CreateEventModal Fields

| Field | Type | Required |
|---|---|---|
| Title | text input | Yes |
| Calendar | dropdown (enabled calendars) | Yes |
| Start date/time | datetime picker | Yes |
| End date/time | datetime picker | Yes |
| Description | textarea | No |

### Styling

- All styles live in `styles.css`, scoped under `.m365-calendar`
- Uses Obsidian CSS variables (`--color-base-10`, `--interactive-accent`, `--text-normal`, etc.) for automatic theme compatibility
- Each calendar's `color` property from the Graph API is applied as a left border and subtle background tint on `EventCard`
- No external CSS framework — keeps bundle size minimal

### View Placement

Both main pane and sidebar panel use the same `ItemView` subclass (`M365CalendarView`) registered once. The user can open it as a main tab or pin it to either sidebar. A ribbon icon and a command palette entry both call `activateView()`.

---

## Project Structure

```
m365-calendar/
├── .github/
│   └── workflows/
│       ├── ci.yml               # PR: lint + typecheck + test (parallel jobs)
│       └── release.yml          # On merge to main: build + GitHub release
├── scripts/
│   └── install.sh               # Install plugin to a local vault for testing
├── src/
│   ├── main.ts                  # Plugin entry point + lifecycle
│   ├── view.tsx                 # M365CalendarView (ItemView)
│   ├── settings.ts              # Settings tab, types, defaults
│   ├── context.ts               # React AppContext + useAppContext hook
│   ├── services/
│   │   ├── AuthService.ts
│   │   ├── CalendarService.ts
│   │   └── CacheService.ts
│   ├── components/
│   │   ├── CalendarApp.tsx
│   │   ├── Toolbar.tsx
│   │   ├── CalendarSelector.tsx
│   │   ├── MonthView.tsx
│   │   ├── WeekView.tsx
│   │   ├── EventCard.tsx
│   │   └── CreateEventModal.tsx
│   └── types/
│       └── index.ts             # M365Calendar, M365Event, NewEventInput, etc.
├── tests/
│   ├── services/
│   │   ├── AuthService.test.ts
│   │   ├── CalendarService.test.ts
│   │   └── CacheService.test.ts
│   └── components/
│       ├── MonthView.test.tsx
│       ├── WeekView.test.tsx
│       └── CreateEventModal.test.tsx
├── docs/
│   ├── architecture/
│   │   └── auth-flow.md         # MermaidJS OAuth sequence diagram
│   └── superpowers/
│       └── specs/               # This file and future specs
├── styles.css
├── manifest.json
├── versions.json                # Maps plugin versions to min Obsidian app versions
├── version-bump.mjs             # Updates manifest.json + versions.json on npm version
├── esbuild.config.mjs           # Obsidian plugin build
├── vitest.config.ts             # Test configuration
├── tsconfig.json
├── package.json
└── README.md
```

---

## Build & Tooling

| Tool | Purpose |
|---|---|
| esbuild | Bundle plugin for Obsidian (outputs `main.js`) |
| TypeScript | Type checking (`tsc --noEmit`) |
| ESLint | Linting (with `eslint-plugin-obsidianmd`) |
| Vitest | Unit + component testing |
| `@testing-library/react` | React component tests |

**`package.json` scripts:**

```json
{
  "dev": "node esbuild.config.mjs",
  "build": "tsc -noEmit -skipLibCheck && node esbuild.config.mjs production",
  "test": "vitest run",
  "test:watch": "vitest",
  "typecheck": "tsc --noEmit",
  "lint": "eslint src/",
  "version": "node version-bump.mjs && git add manifest.json versions.json"
}
```

---

## CI / CD

### CI Workflow (`.github/workflows/ci.yml`)

Triggers on `pull_request`. Three jobs run in parallel:

1. **lint** — `npm run lint`
2. **typecheck** — `npm run typecheck`
3. **test** — `npm run test`

All three must pass for a PR to merge.

### Release Workflow (`.github/workflows/release.yml`)

Triggers on push to `main`. Steps:

1. Read version from `manifest.json`
2. Check if a GitHub release with that tag already exists — skip if so
3. Run `npm ci` and `npm run build`
4. Create a GitHub release tagged with the version (e.g. `1.2.3`)
5. Upload `main.js`, `manifest.json`, and `styles.css` as release assets

This makes the plugin immediately installable via [BRAT](https://tfthacker.com/brat) by pointing it at the GitHub repo.

### Version Bump Process

Before opening a PR that should trigger a release:

```bash
npm version patch   # or minor / major
```

This runs `version-bump.mjs` (via the `version` script), which updates `manifest.json` and `versions.json`, then commits and tags. The tag is pushed alongside the branch. When the PR merges to `main`, the release workflow fires.

---

## `scripts/install.sh`

Installs the built plugin into a local Obsidian vault for manual testing.

**Usage:**
```bash
./scripts/install.sh /path/to/your/vault
```

**Behaviour:**
1. Validates that a vault path argument was provided — exits with usage message if not
2. Validates that the path exists — exits with error if not
3. Runs `npm run build`
4. Creates `<vault>/.obsidian/plugins/m365-calendar/` if it doesn't exist
5. Copies `main.js`, `manifest.json`, and `styles.css` into the plugin directory

---

## Testing Strategy

**Service layer (Vitest):**
- Mock `fetch` to return fixture Graph API responses
- Test token refresh logic in `AuthService`
- Test cache hit/miss, TTL expiry, and purge in `CacheService`
- Test date range queries and multi-calendar event merging in `CalendarService`

**Component layer (Vitest + `@testing-library/react`):**
- Render `MonthView` and `WeekView` with mock event data; assert correct day/event placement
- Test `CalendarSelector` toggle behaviour
- Test `CreateEventModal` form validation and submit callback

**Excluded from automated tests:**
- `main.ts` and `view.tsx` (Obsidian bridge) — tested manually via `scripts/install.sh`

---

## Documentation

### `README.md` (user-facing)

Covers:
- What the plugin does
- Prerequisites (Obsidian desktop, Azure AD app registration)
- Step-by-step Azure app registration guide (with screenshots placeholder)
- Installation via BRAT
- First-time setup (enter Client ID, sign in, select calendars)
- Usage guide (navigating views, creating events)
- FAQ and troubleshooting

### `docs/architecture/auth-flow.md` (developer-facing)

Contains a MermaidJS sequence diagram of the full OAuth 2.0 authorization code flow, covering: user initiation, local HTTP server, browser redirect, code exchange, token storage, and silent refresh.

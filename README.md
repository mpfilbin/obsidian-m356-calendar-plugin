# M365 Calendar for Obsidian

An Obsidian plugin that displays your Microsoft 365 calendars (personal, shared, and group) inside Obsidian, with month and week views.

## Features

- **Month and week views** of your M365 calendar events
- **Multiple calendars** — enable or disable individual calendars (personal, shared, group)
- **Create events** — click any day to create a new event without leaving Obsidian
- **Local caching** — renders instantly from cache, refreshes in the background
- **Theme aware** — uses Obsidian CSS variables to match your active theme

## Prerequisites

- Obsidian **desktop** (Windows, macOS, Linux) — not currently supported on mobile
- A Microsoft 365 account (personal, work, or school)
- An Azure AD app registration (see setup below)

## Installation via BRAT

1. Install the [BRAT plugin](https://obsidian.md/plugins?id=obsidian42-brat) from the Obsidian community plugins
2. In BRAT settings, click **Add Beta Plugin** and enter this repository URL
3. Enable **M365 Calendar** in Settings → Community Plugins

## Azure AD App Registration

Before using the plugin you must register an application in Azure Active Directory:

1. Go to the [Azure Portal](https://portal.azure.com) and sign in
2. Navigate to **Azure Active Directory → App registrations → New registration**
3. Set the following:
   - **Name:** `Obsidian M365 Calendar` (or any name you prefer)
   - **Supported account types:** `Accounts in any organizational directory and personal Microsoft accounts`
   - **Redirect URI:** Select `Mobile and desktop applications` and enter `http://localhost` — the plugin will dynamically append the port at runtime
4. Click **Register**
5. On the app overview page, copy the **Application (client) ID**
6. Navigate to **API permissions → Add a permission → Microsoft Graph → Delegated permissions**
7. Add: `Calendars.Read`, `Calendars.ReadWrite`, `User.Read`
8. Click **Grant admin consent** (if you are an admin) or ask your admin to do so

> **Personal Microsoft accounts:** Admin consent is not required. The user will be prompted to consent on first sign-in.

## Plugin Setup

1. Open **Settings → M365 Calendar**
2. Paste your **Client ID** from the Azure app registration
3. Leave **Tenant ID** as `common` (supports personal + work accounts) or enter your specific tenant ID for work-only accounts
4. Click **Sign In** — your browser will open for Microsoft login
5. After signing in, close the browser tab and return to Obsidian
6. Open the calendar view via the ribbon icon (calendar icon) or **Command Palette → M365 Calendar: Open calendar**
7. Enable the calendars you want to display using the sidebar toggles

## Usage

### Opening the calendar

- Click the **calendar icon** in the left ribbon, or
- Open the **Command Palette** (`Cmd/Ctrl+P`) and search for `Open M365 Calendar`

The calendar can be dragged to the main editor area or pinned to either sidebar.

### Navigating

- Use **‹ / ›** buttons to move backward/forward by one month or week
- Click **Today** to return to the current date
- Toggle between **Month** and **Week** views using the buttons in the toolbar

### Creating an event

Click on any day cell or week column to open the **New Event** form. Fill in the title, calendar, start/end time, and an optional description, then click **Create**.

## Settings

| Setting | Description | Default |
|---|---|---|
| Client ID | Azure AD application ID | _(required)_ |
| Tenant ID | `common` for personal + work, or your tenant ID | `common` |
| Default view | Month or Week | Month |
| Background refresh interval | How often to sync with M365 (minutes) | 10 |

## Troubleshooting

**The sign-in window opens but nothing happens after I log in**  
Make sure `http://localhost` is listed as a redirect URI under the **Mobile and desktop applications** platform in your Azure app registration. Do not use the Single-page application platform — it issues short-lived refresh tokens and will require daily re-authentication.

**I get an error saying the token was issued to a Single-page application and the refresh token has expired**  
Your Azure app registration is using the wrong platform type. In Azure Portal → your app → Authentication, remove the Single-page application redirect URI and add a Mobile and desktop applications platform with `http://localhost` as the redirect URI. Sign out and sign back in once to get a new token.

**I see "Failed to fetch calendars" after signing in**  
Ensure your Azure app has the `Calendars.Read` and `User.Read` permissions, and that consent has been granted.

**Events are not showing up**  
Check that the relevant calendars are enabled in the sidebar toggle panel. If the list is empty, click the refresh button (↻) in the toolbar.

**Changing Client ID or Tenant ID doesn't take effect**  
Sign out and sign in again after changing these settings — the new credentials are picked up immediately without restarting the plugin.

## Architecture

See [docs/architecture/auth-flow.md](docs/architecture/auth-flow.md) for the OAuth 2.0 sequence diagrams.

## Development

### Setup

```bash
git clone <repo>
cd m365-calendar
npm install
```

### Run in dev mode (watches for changes, outputs main.js)

```bash
npm run dev
```

### Install to a local vault for testing

```bash
./scripts/install.sh /path/to/your/vault
```

### Run tests

```bash
npm run test          # single run
npm run test:watch    # watch mode
```

### Bump version and prepare a release

```bash
npm version patch     # or minor / major
git push && git push --tags
```

The release GitHub Action will automatically build and publish a GitHub release when it detects a new version.

## License

MIT

# Documentation

## Architecture

- [`architecture/auth-flow.md`](architecture/auth-flow.md) — OAuth 2.0 + PKCE sign-in via the `obsidian://m365-callback` deep link, silent token refresh, token storage.

### Code layout (`src/`)

| Path | Responsibility |
|---|---|
| `main.ts` | Plugin entry: wires services, registers the view/command/settings tab, owns the settings and weather-refresh subscriptions |
| `services/GraphClient.ts` | Microsoft Graph transport: bearer auth, 429 retry, pagination, error mapping |
| `services/CalendarService.ts`, `TodoService.ts` | Calendar / To Do operations built on `GraphClient` |
| `services/AuthService.ts` | OAuth sign-in and coalesced token refresh |
| `services/CacheService.ts`, `WeatherCacheService.ts` | Persisted event and weather caches |
| `hooks/useEventsData.ts`, `useTodosData.ts`, `useWeather.ts` | Data loading per concern; each ignores responses superseded by newer requests |
| `hooks/useCalendarActions.ts` | Modals, context menu, and event/task mutations |
| `hooks/useReschedule.ts`, `hooks/useDragDrop.ts`, `DragContext.tsx`, `lib/reschedule.ts` | Drag-and-drop: optimistic move + rollback, drag sources/drop zones, and the pure date/time maths |
| `components/` | React views (`CalendarApp` composes the hooks) and Obsidian-modal wrappers |
| `lib/` | Pure helpers (dates, layout, retry, logging) |

Settings flow: the settings tab and the view both go through `Plugin.saveSettings`; open views receive
changes (debounced) via `subscribeSettings`, so no reload is needed.

## Design history

`superpowers/specs/` and `superpowers/plans/` hold the dated design specs and implementation plans for
each feature. They are a historical record and may not match the current code.

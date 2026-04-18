# Collapsible Calendar Sidebar

**Date:** 2026-04-18
**Branch:** feat/collapsable_sidebar

## Summary

Add a toggle to collapse and expand the `CalendarSelector` sidebar panel. The sidebar slides in and out with a CSS width transition. Collapsed state is persisted to plugin settings.

## Design Decisions

- **Toggle placement:** A header row sits above the calendar list, showing "Calendars" on the left and a ◀ arrow on the right. Clicking the arrow collapses the sidebar.
- **Collapsed appearance:** The sidebar shrinks to an 18px-wide strip. The ▶ button is stretched to fill the full strip height, making the entire strip clickable to expand.
- **Arrow character:** Filled unicode — ▶ (U+25B6) when collapsed, ◀ (U+25C0) when expanded. Both colored with `var(--interactive-accent)` to match the current Obsidian theme accent color.
- **Animation:** CSS `width` transition, 200ms ease, on `.m365-calendar-selector`. Uses `overflow-x: hidden` to clip content during animation while preserving `overflow-y: auto` for vertical scrolling when the calendar list is long.
- **Persistence:** `sidebarCollapsed: boolean` added to `M365CalendarSettings` (default `false`). Saved via `saveSettings` on every toggle — same pattern as `enabledCalendarIds`.

## Files Changed

### `src/types/index.ts`
- Add `sidebarCollapsed: boolean` to the `M365CalendarSettings` interface.

### `src/settings.ts` (or `src/main.ts` — wherever `DEFAULT_SETTINGS` is defined)
- Add `sidebarCollapsed: false` to the default settings object.

### `src/components/CalendarApp.tsx`
- Add `sidebarCollapsed` state initialized from `settings.sidebarCollapsed`.
- Add `handleToggleSidebar` callback that flips state and calls `saveSettings`.
- Pass `collapsed` and `onToggleCollapse` props to `<CalendarSelector>`.

### `src/components/CalendarSelector.tsx`
- Add `collapsed: boolean` and `onToggleCollapse: () => void` to props interface.
- Render a header row with label "Calendars" and a `<button>` with ◀/▶ arrow (accent color).
- When `collapsed`, render only the 18px strip with the ▶ button — no calendar list.
- When `expanded`, render header + full calendar list below it.

### `styles.css`
- `.m365-calendar-selector`: add `transition: width 200ms ease; overflow-x: hidden; overflow-y: auto;`.
- Add `.m365-calendar-selector-toggle`: `background: none; border: none; cursor: pointer; color: var(--interactive-accent); padding: 0; font-size: var(--font-ui-medium);` — shared by both the header arrow and the collapsed strip button.

## Out of Scope

- No changes to `MonthView`, `WeekView`, or `DayView`.
- No keyboard shortcut for the toggle.
- No animation on the main calendar area width (it naturally fills via `flex: 1`).

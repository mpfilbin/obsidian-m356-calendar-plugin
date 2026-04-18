# Collapsible Sidebar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a collapsible sidebar to the calendar selector panel with a smooth CSS transition, a header-row toggle button (◀/▶), and persistent collapsed state saved to plugin settings.

**Architecture:** `sidebarCollapsed` state lives in `CalendarApp` (initialized from settings, saved on toggle). `CalendarSelector` receives `collapsed` and `onToggleCollapse` props and renders either the full panel (with a header row and ◀) or an 18px strip with ▶. CSS width transition on `.m365-calendar-selector` handles the animation.

**Tech Stack:** React 18, TypeScript, CSS custom properties (Obsidian theme vars), Vitest + Testing Library

---

## File Map

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `sidebarCollapsed: boolean` to `M365CalendarSettings` |
| `src/settings.ts` | Add `sidebarCollapsed: false` to `DEFAULT_SETTINGS` |
| `src/components/CalendarSelector.tsx` | Add `collapsed` + `onToggleCollapse` props; header row; collapsed strip |
| `src/components/CalendarApp.tsx` | Add `sidebarCollapsed` state + `handleToggleSidebar`; pass props |
| `styles.css` | Width transition on selector; toggle button styles; collapsed class |
| `tests/components/CalendarSelector.test.tsx` | Update existing tests; add collapse/expand behavior tests |
| `tests/components/CalendarApp.test.tsx` | Add test for sidebar toggle saving to settings |

---

### Task 1: Add `sidebarCollapsed` to settings type and defaults

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/settings.ts`

No behavior to test — this is a pure type/default addition. Existing tests will still compile and pass.

- [ ] **Step 1: Add field to `M365CalendarSettings` interface**

In `src/types/index.ts`, add one line to the interface:

```typescript
export interface M365CalendarSettings {
  clientId: string;
  tenantId: string;
  enabledCalendarIds: string[];
  defaultCalendarId: string;
  refreshIntervalMinutes: number;
  defaultView: 'month' | 'week' | 'day';
  weatherEnabled: boolean;
  openWeatherApiKey: string;
  weatherLocation: string;
  weatherUnits: 'imperial' | 'metric';
  sidebarCollapsed: boolean;
}
```

- [ ] **Step 2: Add default value**

In `src/settings.ts`, add one line to `DEFAULT_SETTINGS`:

```typescript
export const DEFAULT_SETTINGS: M365CalendarSettings = {
  clientId: '',
  tenantId: 'common',
  enabledCalendarIds: [],
  defaultCalendarId: '',
  refreshIntervalMinutes: 10,
  defaultView: 'month',
  weatherEnabled: false,
  openWeatherApiKey: '',
  weatherLocation: '',
  weatherUnits: 'imperial',
  sidebarCollapsed: false,
};
```

- [ ] **Step 3: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts src/settings.ts
git commit -m "feat: add sidebarCollapsed field to settings"
```

---

### Task 2: Update `CalendarSelector` with collapse behavior (TDD)

**Files:**
- Modify: `src/components/CalendarSelector.tsx`
- Modify: `tests/components/CalendarSelector.test.tsx`

- [ ] **Step 1: Write failing tests**

Replace the full contents of `tests/components/CalendarSelector.test.tsx`:

```typescript
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarSelector } from '../../src/components/CalendarSelector';
import { M365Calendar } from '../../src/types';

const calendars: M365Calendar[] = [
  { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true },
  { id: 'cal2', name: 'Personal', color: '#a4c2f4', isDefaultCalendar: false, canEdit: true },
];

function renderSelector(collapsed = false, onToggleCollapse = vi.fn()) {
  return render(
    <CalendarSelector
      calendars={calendars}
      enabledCalendarIds={[]}
      onToggle={vi.fn()}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />,
  );
}

describe('CalendarSelector — expanded', () => {
  it('renders all calendar names', () => {
    renderSelector();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('shows enabled calendars as checked', () => {
    render(
      <CalendarSelector
        calendars={calendars}
        enabledCalendarIds={['cal1']}
        onToggle={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Work' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Personal' })).not.toBeChecked();
  });

  it('calls onToggle with the calendar id when a checkbox is clicked', async () => {
    const onToggle = vi.fn();
    render(
      <CalendarSelector
        calendars={calendars}
        enabledCalendarIds={['cal1']}
        onToggle={onToggle}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Personal' }));
    expect(onToggle).toHaveBeenCalledWith('cal2');
  });

  it('renders colour swatches with calendar colours', () => {
    const { container } = renderSelector();
    const swatches = container.querySelectorAll('.m365-calendar-color-swatch');
    expect(swatches).toHaveLength(2);
    expect((swatches[0] as HTMLElement).style.backgroundColor).toBe('rgb(0, 120, 212)');
  });

  it('shows a collapse button with ◀', () => {
    renderSelector();
    expect(screen.getByRole('button', { name: 'Collapse calendar list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse calendar list' })).toHaveTextContent('◀');
  });

  it('calls onToggleCollapse when the collapse button is clicked', async () => {
    const onToggleCollapse = vi.fn();
    renderSelector(false, onToggleCollapse);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse calendar list' }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});

describe('CalendarSelector — collapsed', () => {
  it('does not render calendar names', () => {
    renderSelector(true);
    expect(screen.queryByText('Work')).not.toBeInTheDocument();
    expect(screen.queryByText('Personal')).not.toBeInTheDocument();
  });

  it('shows an expand button with ▶', () => {
    renderSelector(true);
    expect(screen.getByRole('button', { name: 'Expand calendar list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand calendar list' })).toHaveTextContent('▶');
  });

  it('calls onToggleCollapse when the expand strip is clicked', async () => {
    const onToggleCollapse = vi.fn();
    renderSelector(true, onToggleCollapse);
    await userEvent.click(screen.getByRole('button', { name: 'Expand calendar list' }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/CalendarSelector.test.tsx
```

Expected: multiple failures — `collapsed` prop not recognized, collapse/expand buttons not found.

- [ ] **Step 3: Implement the updated component**

Replace the full contents of `src/components/CalendarSelector.tsx`:

```typescript
import React from 'react';
import { M365Calendar } from '../types';

interface CalendarSelectorProps {
  calendars: M365Calendar[];
  enabledCalendarIds: string[];
  onToggle: (calendarId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const CalendarSelector: React.FC<CalendarSelectorProps> = ({
  calendars,
  enabledCalendarIds,
  onToggle,
  collapsed,
  onToggleCollapse,
}) => {
  if (collapsed) {
    return (
      <div className="m365-calendar-selector m365-calendar-selector--collapsed">
        <button
          className="m365-calendar-selector-toggle"
          onClick={onToggleCollapse}
          aria-label="Expand calendar list"
        >
          &#x25B6;
        </button>
      </div>
    );
  }

  return (
    <div className="m365-calendar-selector">
      <div className="m365-calendar-selector-header">
        <span className="m365-calendar-selector-label">Calendars</span>
        <button
          className="m365-calendar-selector-toggle"
          onClick={onToggleCollapse}
          aria-label="Collapse calendar list"
        >
          &#x25C0;
        </button>
      </div>
      {calendars.map((calendar) => (
        <div key={calendar.id} className="m365-calendar-selector-item">
          <input
            type="checkbox"
            id={`cal-${calendar.id}`}
            checked={enabledCalendarIds.includes(calendar.id)}
            onChange={() => onToggle(calendar.id)}
          />
          <span
            className="m365-calendar-color-swatch"
            style={{ backgroundColor: calendar.color }}
          />
          <label htmlFor={`cal-${calendar.id}`}>{calendar.name}</label>
        </div>
      ))}
    </div>
  );
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/CalendarSelector.test.tsx
```

Expected: all 8 tests pass.

- [ ] **Step 5: Run typecheck**

```bash
npm run typecheck
```

Expected: TypeScript error in `CalendarApp.tsx` — `collapsed` and `onToggleCollapse` are now required props that haven't been passed yet. This is expected and will be fixed in Task 3.

- [ ] **Step 6: Commit**

```bash
git add src/components/CalendarSelector.tsx tests/components/CalendarSelector.test.tsx
git commit -m "feat: add collapse/expand behavior to CalendarSelector"
```

---

### Task 3: Wire up sidebar toggle in `CalendarApp` (TDD)

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Modify: `tests/components/CalendarApp.test.tsx`

- [ ] **Step 1: Write the failing test**

Open `tests/components/CalendarApp.test.tsx`. Find the `describe('CalendarApp', ...)` block and add these two tests at the end of it (before the closing `}`):

```typescript
  it('sidebar starts collapsed when settings.sidebarCollapsed is true', async () => {
    const ctx = makeContext({ settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'], sidebarCollapsed: true } });
    renderCalendarApp(ctx);
    expect(await screen.findByRole('button', { name: 'Expand calendar list' })).toBeInTheDocument();
  });

  it('toggles sidebar and saves to settings when collapse button is clicked', async () => {
    const ctx = makeContext({ settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'], sidebarCollapsed: false } });
    renderCalendarApp(ctx);
    const collapseBtn = await screen.findByRole('button', { name: 'Collapse calendar list' });
    await userEvent.click(collapseBtn);
    expect(ctx.saveSettings).toHaveBeenCalledWith(
      expect.objectContaining({ sidebarCollapsed: true }),
    );
    expect(await screen.findByRole('button', { name: 'Expand calendar list' })).toBeInTheDocument();
  });
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: 2 new failures — `CalendarApp` doesn't pass `collapsed`/`onToggleCollapse` to `CalendarSelector` yet, and TypeScript will error on the missing props.

- [ ] **Step 3: Implement the toggle in `CalendarApp`**

In `src/components/CalendarApp.tsx`, make three additions:

**a)** After the existing `useState` declarations (around line 61), add:

```typescript
  const [sidebarCollapsed, setSidebarCollapsed] = useState(settings.sidebarCollapsed ?? false);
```

**b)** After the `handleToggleCalendar` function (around line 169), add:

```typescript
  const handleToggleSidebar = async () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    await saveSettings({ ...settings, sidebarCollapsed: next });
  };
```

**c)** In the JSX, update the `<CalendarSelector>` element to pass the new props:

```tsx
        <CalendarSelector
          calendars={calendars}
          enabledCalendarIds={enabledIds}
          onToggle={(id) => void handleToggleCalendar(id)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => void handleToggleSidebar()}
        />
```

- [ ] **Step 4: Run the new tests to confirm they pass**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: all tests pass, including the 2 new ones.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/CalendarApp.tsx tests/components/CalendarApp.test.tsx
git commit -m "feat: wire sidebar collapse toggle into CalendarApp with settings persistence"
```

---

### Task 4: CSS — transition and toggle button styles

**Files:**
- Modify: `styles.css`

CSS transitions aren't testable in jsdom, so no tests for this task. Visual verification is done manually.

- [ ] **Step 1: Update `.m365-calendar-selector`**

In `styles.css`, replace the existing `.m365-calendar-selector` rule:

```css
.m365-calendar-selector {
  width: 200px;
  flex-shrink: 0;
  border-right: 1px solid var(--background-modifier-border);
  padding: var(--size-4-3);
  overflow: hidden;
  transition: width 200ms ease, padding 200ms ease;
}
```

- [ ] **Step 2: Add the collapsed modifier, header, label, and toggle button rules**

Add these rules after the `.m365-calendar-selector-item` rule block:

```css
.m365-calendar-selector--collapsed {
  width: 18px;
  padding: 0;
  display: flex;
  align-items: center;
  justify-content: center;
}

.m365-calendar-selector-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--size-4-2);
}

.m365-calendar-selector-label {
  font-size: var(--font-ui-smaller);
  color: var(--text-muted);
  font-weight: var(--font-semibold);
  text-transform: uppercase;
  white-space: nowrap;
}

.m365-calendar-selector-toggle {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--interactive-accent);
  padding: 0;
  font-size: var(--font-ui-medium);
  flex-shrink: 0;
  line-height: 1;
}

.m365-calendar-selector-toggle:hover {
  opacity: 0.7;
}
```

- [ ] **Step 3: Run the full test suite to confirm nothing broke**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 4: Run typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add styles.css
git commit -m "feat: add sidebar collapse CSS transition and toggle button styles"
```

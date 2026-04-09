# New Event Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+ New event" button to the calendar toolbar that opens the CreateEventModal pre-populated with today's date.

**Architecture:** Add `onNewEvent: () => void` to `ToolbarProps` and render the button between the view toggle and refresh button. `CalendarApp` wires it to `() => handleDayClick(new Date())`, reusing the existing modal creation flow entirely.

**Tech Stack:** TypeScript, React 18, Vitest + @testing-library/react, CSS (Obsidian CSS variables)

---

## File Map

| File | Change |
|---|---|
| `src/components/Toolbar.tsx` | Add `onNewEvent` prop; render `+ New event` button |
| `tests/components/Toolbar.test.tsx` | Add test for `onNewEvent` callback |
| `src/components/CalendarApp.tsx` | Pass `onNewEvent` to `<Toolbar />` |
| `styles.css` | Add `.m365-new-event-btn` styles |

---

## Task 1: Update Toolbar (TDD)

**Files:**
- Modify: `src/components/Toolbar.tsx`
- Modify: `tests/components/Toolbar.test.tsx`

- [ ] **Step 1: Write the failing test**

Add to `tests/components/Toolbar.test.tsx` (after the existing `defaultProps` block, inside the `describe` block):

```tsx
it('calls onNewEvent when "+ New event" button is clicked', async () => {
  const onNewEvent = vi.fn();
  render(<Toolbar {...defaultProps} onNewEvent={onNewEvent} />);
  await userEvent.click(screen.getByText('+ New event'));
  expect(onNewEvent).toHaveBeenCalled();
});
```

Also update `defaultProps` to include the new prop (TypeScript will require it once the prop is non-optional):

```ts
const defaultProps = {
  currentDate: new Date(2026, 3, 1),
  view: 'month' as const,
  onViewChange: vi.fn(),
  onNavigate: vi.fn(),
  onRefresh: vi.fn(),
  onNewEvent: vi.fn(),
  syncing: false,
};
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
npx vitest run tests/components/Toolbar.test.tsx
```

Expected: FAIL — `onNewEvent` prop does not exist on `ToolbarProps`.

- [ ] **Step 3: Implement the updated Toolbar**

Replace `src/components/Toolbar.tsx` with:

```tsx
import React from 'react';

type ViewType = 'month' | 'week';

interface ToolbarProps {
  currentDate: Date;
  view: ViewType;
  onViewChange: (view: ViewType) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onRefresh: () => void;
  onNewEvent: () => void;
  syncing: boolean;
}

export const Toolbar: React.FC<ToolbarProps> = ({
  currentDate,
  view,
  onViewChange,
  onNavigate,
  onRefresh,
  onNewEvent,
  syncing,
}) => {
  const label =
    view === 'month'
      ? currentDate.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
      : `Week of ${currentDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;

  return (
    <div className="m365-calendar-toolbar">
      <div className="m365-calendar-nav">
        <button onClick={() => onNavigate('prev')}>‹</button>
        <button onClick={() => onNavigate('today')}>Today</button>
        <button onClick={() => onNavigate('next')}>›</button>
        <span className="m365-calendar-date-label">{label}</span>
      </div>
      <div className="m365-calendar-view-toggle">
        <button
          className={view === 'month' ? 'active' : ''}
          onClick={() => onViewChange('month')}
        >
          Month
        </button>
        <button
          className={view === 'week' ? 'active' : ''}
          onClick={() => onViewChange('week')}
        >
          Week
        </button>
      </div>
      <button className="m365-new-event-btn" onClick={onNewEvent}>
        + New event
      </button>
      <button
        className="m365-calendar-refresh"
        onClick={onRefresh}
        disabled={syncing}
      >
        {syncing ? '↻ Syncing…' : '↻'}
      </button>
    </div>
  );
};
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/components/Toolbar.test.tsx
```

Expected: PASS — all 8 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbar.tsx tests/components/Toolbar.test.tsx
git commit -m "feat: add New Event button to Toolbar"
```

---

## Task 2: Wire CalendarApp and add styles

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Modify: `styles.css`

- [ ] **Step 1: Pass `onNewEvent` in CalendarApp**

In `src/components/CalendarApp.tsx`, find the `<Toolbar` JSX (around line 153) and add the `onNewEvent` prop:

```tsx
<Toolbar
  currentDate={currentDate}
  view={view}
  onViewChange={setView}
  onNavigate={handleNavigate}
  onNewEvent={() => handleDayClick(new Date())}
  onRefresh={() => void fetchAll({ reloadCalendars: true, userInitiated: true })}
  syncing={syncing}
/>
```

- [ ] **Step 2: Add CSS for the new button**

In `styles.css`, insert after the `.m365-calendar-refresh:disabled` rule (after line 90):

```css
.m365-new-event-btn {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: var(--radius-s);
  cursor: pointer;
  padding: var(--size-4-1) var(--size-4-3);
  font-size: var(--font-ui-small);
  white-space: nowrap;
}

.m365-new-event-btn:hover {
  opacity: 0.9;
}
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: PASS — all tests passing with no TypeScript errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/CalendarApp.tsx styles.css
git commit -m "feat: wire New Event button to CalendarApp and add styles"
```

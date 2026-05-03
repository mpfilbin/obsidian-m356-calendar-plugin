# Right-Click Context Menu Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add right-click context menus to month and week calendar views so users can create events or tasks scoped to the clicked date (and time, in the timeline).

**Architecture:** A `DayContextMenuPayload` discriminated union passes date/time context up from view components to `CalendarApp`, which creates and shows an Obsidian `Menu` with "New event" and "New task" items. The existing `openCreateEventModal` and `openCreateTaskModal` functions are reused with minor extensions.

**Tech Stack:** React (TSX), Obsidian Plugin API (`Menu`), Vitest + Testing Library

---

## File Map

| File | Change |
|------|--------|
| `src/types/index.ts` | Add `DayContextMenuPayload` discriminated union |
| `tests/__mocks__/obsidian.ts` | Add `Menu` stub (required before `CalendarApp` imports it) |
| `src/components/TimelineColumn.tsx` | Add `onTimeContextMenu` prop with same time-from-click math as `onTimeClick` |
| `src/components/MonthView.tsx` | Add `onDayContextMenu` prop; attach `onContextMenu` to each day cell |
| `src/components/WeekView.tsx` | Add `onDayContextMenu` prop; attach handlers to header, all-day cells, and forward from `TimelineColumn` |
| `src/components/CreateEventModal.tsx` | Add `initialAllDay?: boolean` to `CreateEventFormProps`; initialize state accordingly |
| `src/components/CalendarApp.tsx` | Update `openCreateEventModal` signature; add `handleDayContextMenu`; pass `onDayContextMenu` to views |
| `tests/components/TimelineColumn.test.tsx` | Tests for `onTimeContextMenu` |
| `tests/components/MonthView.test.tsx` | Tests for `onDayContextMenu` |
| `tests/components/WeekView.test.tsx` | Tests for `onDayContextMenu` on header, all-day row, and timeline |
| `tests/components/CreateEventModal.test.tsx` | Tests for `initialAllDay` prop |

---

## Task 1: Add `DayContextMenuPayload` type and `Menu` mock

**Files:**
- Modify: `src/types/index.ts`
- Modify: `tests/__mocks__/obsidian.ts`

- [ ] **Step 1: Add `DayContextMenuPayload` to `src/types/index.ts`**

Append to the end of `src/types/index.ts`:

```ts
export type DayContextMenuPayload =
  | { kind: 'timed'; dateTime: Date }   // timeline right-click — includes computed time
  | { kind: 'allday'; date: Date }      // month cell, week header, or all-day row
```

- [ ] **Step 2: Add `Menu` stub to `tests/__mocks__/obsidian.ts`**

Append before the last line of `tests/__mocks__/obsidian.ts` (before the `Notice` export):

```ts
export class Menu {
  addItem(cb: (item: {
    setTitle: (t: string) => typeof item;
    setIcon: (i: string) => typeof item;
    onClick: (fn: () => void) => typeof item;
  }) => void) {
    const item = {
      setTitle: (_t: string) => item,
      setIcon: (_i: string) => item,
      onClick: (_fn: () => void) => item,
    };
    cb(item);
    return this;
  }
  showAtMouseEvent(_event: MouseEvent) { return this; }
}
```

- [ ] **Step 3: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/types/index.ts tests/__mocks__/obsidian.ts
git commit -m "feat: add DayContextMenuPayload type and Menu mock"
```

---

## Task 2: `TimelineColumn` — add `onTimeContextMenu`

**Files:**
- Modify: `src/components/TimelineColumn.tsx`
- Modify: `tests/components/TimelineColumn.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/TimelineColumn.test.tsx` inside the existing `describe('TimelineColumn', ...)` block, after the last `it(...)`:

```ts
it('calls onTimeContextMenu with correct dateTime when right-clicked', () => {
  const onTimeContextMenu = vi.fn();
  render(
    <TimelineColumn
      date={new Date('2026-04-09')}
      events={[]}
      calendars={[]}
      onTimeClick={vi.fn()}
      onTimeContextMenu={onTimeContextMenu}
      data-testid="col"
    />,
  );
  // clientY=90 → offsetY=90 (rect.top=0 in jsdom) → 90 min → rounds to 1h 30m
  fireEvent.contextMenu(screen.getByTestId('col'), { clientY: 90 });
  expect(onTimeContextMenu).toHaveBeenCalledTimes(1);
  const [dateTime, event] = onTimeContextMenu.mock.calls[0] as [Date, MouseEvent];
  expect(dateTime.getHours()).toBe(1);
  expect(dateTime.getMinutes()).toBe(30);
  expect(event).toBeInstanceOf(MouseEvent);
});

it('right-clicking the timeline does not trigger onTimeClick', () => {
  const onTimeClick = vi.fn();
  render(
    <TimelineColumn
      date={new Date('2026-04-09')}
      events={[]}
      calendars={[]}
      onTimeClick={onTimeClick}
      data-testid="col"
    />,
  );
  fireEvent.contextMenu(screen.getByTestId('col'), { clientY: 90 });
  expect(onTimeClick).not.toHaveBeenCalled();
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/TimelineColumn.test.tsx`
Expected: the two new tests FAIL (prop not yet defined)

- [ ] **Step 3: Add `onTimeContextMenu` to `TimelineColumn`**

In `src/components/TimelineColumn.tsx`, update the `TimelineColumnProps` interface:

```ts
interface TimelineColumnProps {
  date: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onTimeContextMenu?: (dateTime: Date, event: MouseEvent) => void;
  onEventClick?: (event: M365Event) => void;
  showLabels?: boolean;
  showNowLine?: boolean;
  'data-testid'?: string;
}
```

Update the component destructuring to include the new prop:

```ts
export const TimelineColumn: React.FC<TimelineColumnProps> = ({
  date,
  events,
  calendars,
  onTimeClick,
  onTimeContextMenu,
  onEventClick,
  showLabels = false,
  showNowLine = false,
  'data-testid': testId,
}) => {
```

Add a `handleContextMenu` function directly after the existing `handleClick` function:

```ts
const handleContextMenu = (e: React.MouseEvent<HTMLDivElement>) => {
  e.preventDefault();
  const rect = e.currentTarget.getBoundingClientRect();
  const offsetY = e.clientY - rect.top;
  const totalMinutes = Math.min(Math.round(offsetY / PX_PER_MIN / 15) * 15, 23 * 60 + 45);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  const d = new Date(date);
  d.setHours(hours, minutes, 0, 0);
  onTimeContextMenu?.(d, e.nativeEvent);
};
```

Update the outer `<div>` to wire up the handler:

```tsx
<div
  className="m365-timeline-column"
  style={{ position: 'relative', height: `${HOURS_IN_DAY * 60 * PX_PER_MIN}px` }}
  onClick={handleClick}
  onContextMenu={handleContextMenu}
  data-testid={testId}
>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/TimelineColumn.test.tsx`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/TimelineColumn.tsx tests/components/TimelineColumn.test.tsx
git commit -m "feat: add onTimeContextMenu prop to TimelineColumn"
```

---

## Task 3: `MonthView` — add `onDayContextMenu`

**Files:**
- Modify: `src/components/MonthView.tsx`
- Modify: `tests/components/MonthView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add the following imports at the top of `tests/components/MonthView.test.tsx` (add `fireEvent` to the existing testing-library import and import the new type):

```ts
import { render, screen, fireEvent } from '@testing-library/react';
import { M365Event, M365Calendar, DailyWeather, DayContextMenuPayload } from '../../src/types';
```

Add a new `describe` block at the end of `tests/components/MonthView.test.tsx`:

```ts
describe('MonthView — context menu', () => {
  it('calls onDayContextMenu with allday payload when a day cell is right-clicked', () => {
    const onDayContextMenu = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
      />,
    );
    const cells = document.querySelectorAll('.m365-calendar-day-cell');
    fireEvent.contextMenu(cells[0]);
    expect(onDayContextMenu).toHaveBeenCalledTimes(1);
    const [payload] = onDayContextMenu.mock.calls[0] as [DayContextMenuPayload, MouseEvent];
    expect(payload.kind).toBe('allday');
    expect((payload as { kind: 'allday'; date: Date }).date).toBeInstanceOf(Date);
  });

  it('right-clicking a day cell does not call onDayClick', () => {
    const onDayClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={onDayClick}
        onDayContextMenu={vi.fn()}
      />,
    );
    const cells = document.querySelectorAll('.m365-calendar-day-cell');
    fireEvent.contextMenu(cells[0]);
    expect(onDayClick).not.toHaveBeenCalled();
  });

  it('passes the correct date in the payload', () => {
    const onDayContextMenu = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
      />,
    );
    // April 2026 starts on Wednesday; first cell (index 0) is Sun Mar 29 2026
    // Find the cell for April 4 by looking for a cell with day number 4
    const cells = Array.from(document.querySelectorAll('.m365-calendar-day-cell'));
    const april4 = cells.find((c) => {
      const span = c.querySelector('.m365-calendar-day-number');
      return span?.textContent === '4' && c.className.includes('m365-calendar-day-cell') && !c.className.includes('other-month');
    })!;
    fireEvent.contextMenu(april4);
    const [payload] = onDayContextMenu.mock.calls[0] as [DayContextMenuPayload, MouseEvent];
    expect(payload.kind).toBe('allday');
    const date = (payload as { kind: 'allday'; date: Date }).date;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(3); // April = 3 (0-indexed)
    expect(date.getDate()).toBe(4);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/MonthView.test.tsx`
Expected: the three new tests FAIL

- [ ] **Step 3: Add `onDayContextMenu` to `MonthView`**

In `src/components/MonthView.tsx`, update the `MonthViewProps` interface:

```ts
interface MonthViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onDayContextMenu?: (payload: DayContextMenuPayload, event: MouseEvent) => void;
  onEventClick?: (event: M365Event) => void;
  maxEventsPerDay?: number;
  weather?: Map<string, DailyWeather | null>;
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}
```

Update the import at the top of `src/components/MonthView.tsx` to include `DayContextMenuPayload`:

```ts
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList, DayContextMenuPayload } from '../types';
```

Update the component destructuring to include the new prop:

```ts
export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onDayContextMenu,
  onEventClick,
  maxEventsPerDay = 6,
  weather,
  todos = [],
  todoLists = [],
  onTodoClick,
  completingTodoIds,
}) => {
```

Update the day cell `<div>` to add `onContextMenu`:

```tsx
<div
  key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
  className={[
    'm365-calendar-day-cell',
    isCurrentMonth ? '' : 'other-month',
    isToday ? 'today' : '',
  ]
    .filter(Boolean)
    .join(' ')}
  onClick={() => onDayClick(day)}
  onContextMenu={(e) => {
    e.preventDefault();
    onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
  }}
>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/MonthView.test.tsx`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/MonthView.tsx tests/components/MonthView.test.tsx
git commit -m "feat: add onDayContextMenu to MonthView"
```

---

## Task 4: `WeekView` — add `onDayContextMenu`

**Files:**
- Modify: `src/components/WeekView.tsx`
- Modify: `tests/components/WeekView.test.tsx`

- [ ] **Step 1: Write the failing tests**

Ensure `fireEvent` is imported in `tests/components/WeekView.test.tsx` (it already is). Add `DayContextMenuPayload` to the types import:

```ts
import { M365Event, M365Calendar, DailyWeather, M365TodoList, M365TodoItem, DayContextMenuPayload } from '../../src/types';
```

Add a new `describe` block at the end of `tests/components/WeekView.test.tsx`:

```ts
describe('WeekView — context menu', () => {
  it('calls onDayContextMenu with allday payload when a day header is right-clicked', () => {
    const onDayContextMenu = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
      />,
    );
    const headers = document.querySelectorAll('.m365-calendar-week-day');
    fireEvent.contextMenu(headers[1]); // Monday (index 1, Sun is 0)
    expect(onDayContextMenu).toHaveBeenCalledTimes(1);
    const [payload] = onDayContextMenu.mock.calls[0] as [DayContextMenuPayload, MouseEvent];
    expect(payload.kind).toBe('allday');
    const date = (payload as { kind: 'allday'; date: Date }).date;
    expect(date.getDay()).toBe(1); // Monday
  });

  it('calls onDayContextMenu with allday payload when an all-day cell is right-clicked', () => {
    const onDayContextMenu = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
      />,
    );
    const allDayCells = document.querySelectorAll('.m365-week-allday-cell');
    fireEvent.contextMenu(allDayCells[1]); // Monday cell
    expect(onDayContextMenu).toHaveBeenCalledTimes(1);
    const [payload] = onDayContextMenu.mock.calls[0] as [DayContextMenuPayload, MouseEvent];
    expect(payload.kind).toBe('allday');
    const date = (payload as { kind: 'allday'; date: Date }).date;
    expect(date.getDay()).toBe(1); // Monday
  });

  it('calls onDayContextMenu with timed payload when timeline is right-clicked', () => {
    const onDayContextMenu = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
      />,
    );
    // Monday column is index 1 (Sunday is 0)
    const timelines = document.querySelectorAll('[data-testid^="m365-week-timeline-"]');
    // clientY=90 → offsetY=90 (rect.top=0 in jsdom) → 90 min → rounds to 1h 30m
    fireEvent.contextMenu(timelines[1], { clientY: 90 });
    expect(onDayContextMenu).toHaveBeenCalledTimes(1);
    const [payload] = onDayContextMenu.mock.calls[0] as [DayContextMenuPayload, MouseEvent];
    expect(payload.kind).toBe('timed');
    const dateTime = (payload as { kind: 'timed'; dateTime: Date }).dateTime;
    expect(dateTime.getHours()).toBe(1);
    expect(dateTime.getMinutes()).toBe(30);
  });

  it('right-clicking day header does not call onDayClick', () => {
    const onDayClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={onDayClick}
        onDayContextMenu={vi.fn()}
      />,
    );
    const headers = document.querySelectorAll('.m365-calendar-week-day');
    fireEvent.contextMenu(headers[0]);
    expect(onDayClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/WeekView.test.tsx`
Expected: the four new tests FAIL

- [ ] **Step 3: Update `WeekView` props and wire up handlers**

In `src/components/WeekView.tsx`, update the import to include `DayContextMenuPayload`:

```ts
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList, DayContextMenuPayload } from '../types';
```

Update the `WeekViewProps` interface:

```ts
interface WeekViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onDayContextMenu?: (payload: DayContextMenuPayload, event: MouseEvent) => void;
  onEventClick?: (event: M365Event) => void;
  weather?: Map<string, DailyWeather | null>;
  weatherUnits?: 'imperial' | 'metric';
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}
```

Update the component destructuring:

```ts
export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onDayContextMenu,
  onEventClick,
  weather,
  weatherUnits = 'imperial',
  todos = [],
  todoLists = [],
  onTodoClick,
  completingTodoIds,
}) => {
```

Update the day header `<div>` to add `onContextMenu`:

```tsx
<div
  key={`header-${toDateOnly(day)}`}
  className={['m365-calendar-week-day', isToday ? 'today' : '']
    .filter(Boolean)
    .join(' ')}
  onClick={() => onDayClick(day)}
  onContextMenu={(e) => {
    e.preventDefault();
    onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
  }}
>
```

Update the all-day cell `<div>` to add `onContextMenu`:

```tsx
<div
  key={`allday-${cellDateStr}`}
  className="m365-week-allday-cell"
  onContextMenu={(e) => {
    e.preventDefault();
    onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
  }}
>
```

Update the `TimelineColumn` usage inside `weekDays.map` to add `onTimeContextMenu`:

```tsx
<TimelineColumn
  key={`timeline-${cellDateStr}`}
  date={day}
  events={timedEvents}
  calendars={calendars}
  onTimeClick={onDayClick}
  onTimeContextMenu={(dateTime, e) =>
    onDayContextMenu?.({ kind: 'timed', dateTime }, e)
  }
  onEventClick={onEventClick}
  data-testid={`m365-week-timeline-${cellDateStr}`}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/WeekView.test.tsx`
Expected: all tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/components/WeekView.tsx tests/components/WeekView.test.tsx
git commit -m "feat: add onDayContextMenu to WeekView"
```

---

## Task 5: `CreateEventForm` — add `initialAllDay` prop

**Files:**
- Modify: `src/components/CreateEventModal.tsx`
- Modify: `tests/components/CreateEventModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add the following `describe` block to `tests/components/CreateEventModal.test.tsx`:

```ts
describe('CreateEventForm — initialAllDay', () => {
  it('initializes with all-day checkbox checked when initialAllDay is true', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        initialAllDay={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('uses date-only input for start when initialAllDay is true', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        initialAllDay={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const startInput = document.getElementById('m365-create-start') as HTMLInputElement;
    expect(startInput.type).toBe('date');
  });

  it('start date string matches initialDate when initialAllDay is true', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        initialAllDay={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const startInput = document.getElementById('m365-create-start') as HTMLInputElement;
    expect(startInput.value).toBe('2026-04-10');
  });

  it('end date is the day after initialDate when initialAllDay is true', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        initialAllDay={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const endInput = document.getElementById('m365-create-end') as HTMLInputElement;
    expect(endInput.value).toBe('2026-04-11');
  });

  it('all-day checkbox is unchecked by default (no initialAllDay prop)', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/CreateEventModal.test.tsx`
Expected: the new tests FAIL (prop not yet accepted)

- [ ] **Step 3: Update `CreateEventFormProps` and initialize state**

In `src/components/CreateEventModal.tsx`, update the `CreateEventFormProps` interface:

```ts
interface CreateEventFormProps {
  calendars: M365Calendar[];
  defaultCalendarId: string;
  initialDate: Date;
  initialAllDay?: boolean;
  onSubmit: (calendarId: string, event: NewEventInput) => void;
  onCancel: () => void;
}
```

Update the component destructuring to include the new prop:

```ts
export const CreateEventForm: React.FC<CreateEventFormProps> = ({
  calendars,
  defaultCalendarId,
  initialDate,
  initialAllDay = false,
  onSubmit,
  onCancel,
}) => {
```

Replace the state initialization block (the lines from `const defaultStart` through `const [error, setError] = useState('')`) with:

```ts
const defaultStart = new Date(initialDate);
defaultStart.setHours(9, 0, 0, 0);
const defaultEnd = new Date(initialDate);
defaultEnd.setHours(10, 0, 0, 0);

const [isAllDay, setIsAllDay] = useState(initialAllDay);
const [startStr, setStartStr] = useState(() => {
  if (initialAllDay) return toDateOnly(defaultStart);
  return toDateTimeLocal(defaultStart);
});
const [endStr, setEndStr] = useState(() => {
  if (initialAllDay) {
    const nextDay = new Date(defaultStart);
    nextDay.setDate(nextDay.getDate() + 1);
    return toDateOnly(nextDay);
  }
  return toDateTimeLocal(defaultEnd);
});
const [description, setDescription] = useState('');
const [error, setError] = useState('');
```

- [ ] **Step 4: Update `CreateEventModal` to pass `initialAllDay`**

In `src/components/CreateEventModal.tsx`, update the `CreateEventModal` class constructor and `onOpen` to thread `initialAllDay` through:

```ts
export class CreateEventModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly calendars: M365Calendar[],
    private readonly defaultCalendarId: string,
    private readonly initialDate: Date,
    private readonly onSubmit: (
      calendarId: string,
      event: NewEventInput,
    ) => Promise<void>,
    private readonly initialAllDay: boolean = false,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('New event');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <CreateEventForm
          calendars={this.calendars}
          defaultCalendarId={this.defaultCalendarId}
          initialDate={this.initialDate}
          initialAllDay={this.initialAllDay}
          onSubmit={async (calendarId, event) => {
            await this.onSubmit(calendarId, event);
            this.close();
          }}
          onCancel={() => this.close()}
        />
      </StrictMode>,
    );
  }

  onClose(): void {
    this.root?.unmount();
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/components/CreateEventModal.test.tsx`
Expected: all tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/components/CreateEventModal.tsx tests/components/CreateEventModal.test.tsx
git commit -m "feat: add initialAllDay prop to CreateEventForm and CreateEventModal"
```

---

## Task 6: Wire everything in `CalendarApp`

**Files:**
- Modify: `src/components/CalendarApp.tsx`

- [ ] **Step 1: Add `Menu` import and `DayContextMenuPayload` import**

In `src/components/CalendarApp.tsx`, update the obsidian import to include `Menu`:

```ts
import { Notice, Menu } from 'obsidian';
```

Update the types import to include `DayContextMenuPayload`:

```ts
import { M365Calendar, M365Event, M365TodoList, M365TodoItem, DailyWeather, ViewType, DayContextMenuPayload } from '../types';
```

- [ ] **Step 2: Update `openCreateEventModal` to accept `initialAllDay`**

Replace the existing `openCreateEventModal` function:

```ts
const openCreateEventModal = (date: Date, initialAllDay = false) => {
  const enabledCalendars = calendars.filter((c) => enabledIds.includes(c.id));
  if (enabledCalendars.length === 0) {
    new Notice('Enable at least one calendar to create events.');
    return;
  }
  new CreateEventModal(
    app,
    enabledCalendars,
    settings.defaultCalendarId,
    date,
    async (calendarId, event) => {
      try {
        const created = await calendarService.createEvent(calendarId, event);
        setEvents((prev) =>
          [...prev, created].sort(
            (a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime(),
          ),
        );
      } catch (e) {
        notifyError(e);
        throw e;
      }
    },
    initialAllDay,
  ).open();
};
```

- [ ] **Step 3: Add `handleDayContextMenu`**

Add the following function after `openCreateTaskModal` and before `handleDayClick`:

```ts
const handleDayContextMenu = (payload: DayContextMenuPayload, event: MouseEvent) => {
  const menu = new Menu();
  menu.addItem((item) =>
    item.setTitle('New event').setIcon('calendar-plus').onClick(() => {
      const date = payload.kind === 'timed' ? payload.dateTime : payload.date;
      openCreateEventModal(date, payload.kind === 'allday');
    }),
  );
  menu.addItem((item) =>
    item.setTitle('New task').setIcon('check-square').onClick(() => {
      // Tasks only have a due date (no time), so always pass the date portion only.
      const date = payload.kind === 'timed' ? payload.dateTime : payload.date;
      openCreateTaskModal(date);
    }),
  );
  menu.showAtMouseEvent(event);
};
```

- [ ] **Step 4: Pass `onDayContextMenu` to `MonthView` and `WeekView`**

Update the `MonthView` JSX in the render:

```tsx
{view === 'month' && (
  <MonthView
    currentDate={currentDate}
    events={events}
    calendars={calendars}
    todos={todos}
    todoLists={todoLists}
    onDayClick={handleDayClick}
    onDayContextMenu={handleDayContextMenu}
    onEventClick={handleEventClick}
    onTodoClick={handleTodoClick}
    completingTodoIds={completingTodoIds}
    weather={weather}
  />
)}
```

Update the `WeekView` JSX in the render:

```tsx
{view === 'week' && (
  <WeekView
    currentDate={currentDate}
    events={events}
    calendars={calendars}
    todos={todos}
    todoLists={todoLists}
    onDayClick={handleDayClick}
    onDayContextMenu={handleDayContextMenu}
    onEventClick={handleEventClick}
    onTodoClick={handleTodoClick}
    completingTodoIds={completingTodoIds}
    weather={weather}
    weatherUnits={settings.weatherUnits}
  />
)}
```

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests PASS, no typecheck errors

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/CalendarApp.tsx
git commit -m "feat: wire right-click context menu in CalendarApp"
```

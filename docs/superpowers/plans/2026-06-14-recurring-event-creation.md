# Recurring Event Creation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add recurrence support to the Create Event modal, allowing users to create daily, weekly, monthly, and yearly recurring events with configurable intervals, day-of-week selection, monthly absolute/relative modes, and no-end / end-by-date / end-by-count termination.

**Architecture:** Clean abstraction — `EventRecurrence` type in `types/index.ts`, service-layer mapping to Graph API in `CalendarService.buildRecurrenceBody`, and a pure exported `buildRecurrence` helper in `CreateEventModal.tsx` that converts form state to `EventRecurrence`. Tests cover the helper and the Graph API body via `createEvent`.

**Tech Stack:** TypeScript, React hooks, Microsoft Graph API, Vitest, @testing-library/react, userEvent

---

## File Map

| Action | File | What changes |
|--------|------|--------------|
| Modify | `src/types/index.ts` | Add `RecurrenceFrequency`, `DayOfWeek`, `WeekIndex`, `RecurrenceEndType`, `EventRecurrence`; add `recurrence?` to `NewEventInput` |
| Modify | `src/services/CalendarService.ts` | Add `EventRecurrence` import, `toDateOnly` import, `buildRecurrenceBody` private method, spread recurrence into `createEvent` body |
| Modify | `src/components/CreateEventModal.tsx` | Add `buildRecurrence` exported helper, `getDayOfWeek`/`getWeekIndex` pure helpers, recurrence form state, recurrence UI section |
| Modify | `tests/services/CalendarService.test.ts` | Add `createEvent recurrence` describe block (5 frequency types, 3 end types) |
| Modify | `tests/components/CreateEventModal.test.tsx` | Add `buildRecurrence` unit-test describe block + recurrence UI component tests |

---

### Task 1: Add EventRecurrence types to `src/types/index.ts`

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the new types after the `TaskRecurrence` interface (currently ends at line 64)**

  Open `src/types/index.ts`. After the closing `}` of `TaskRecurrence`, insert:

  ```typescript
  export type RecurrenceFrequency =
    | 'daily'
    | 'weekly'
    | 'absoluteMonthly'
    | 'relativeMonthly'
    | 'absoluteYearly';

  export type DayOfWeek =
    | 'sunday'
    | 'monday'
    | 'tuesday'
    | 'wednesday'
    | 'thursday'
    | 'friday'
    | 'saturday';

  export type WeekIndex = 'first' | 'second' | 'third' | 'fourth' | 'last';

  export type RecurrenceEndType = 'noEnd' | 'endDate' | 'numbered';

  export interface EventRecurrence {
    frequency: RecurrenceFrequency;
    interval: number;
    daysOfWeek?: DayOfWeek[];
    weekIndex?: WeekIndex;
    end: {
      type: RecurrenceEndType;
      endDate?: string;
      numberOfOccurrences?: number;
    };
  }
  ```

- [ ] **Step 2: Add `recurrence?` to `NewEventInput` (currently at lines 46–52)**

  The `NewEventInput` interface should become:

  ```typescript
  export interface NewEventInput {
    subject: string;
    start: Date;
    end: Date;
    description?: string;
    isAllDay?: boolean;
    recurrence?: EventRecurrence;
  }
  ```

- [ ] **Step 3: Run typecheck to verify no errors**

  ```bash
  npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 4: Commit**

  ```bash
  git add src/types/index.ts
  git commit -m "feat: add EventRecurrence types"
  ```

---

### Task 2: Implement `buildRecurrenceBody` in `CalendarService` (TDD)

**Files:**
- Modify: `src/services/CalendarService.ts`
- Modify: `tests/services/CalendarService.test.ts`

- [ ] **Step 1: Write the failing tests**

  In `tests/services/CalendarService.test.ts`, append a new `describe` block inside the outer `describe('CalendarService', ...)` block, after all existing tests:

  ```typescript
  describe('createEvent recurrence', () => {
    // June 15 2026 is a Monday; month index 5 → month number 6; getDate() = 15
    const START = new Date(2026, 5, 15, 9, 0, 0);
    const END = new Date(2026, 5, 15, 9, 30, 0);
    const BASE = { subject: 'Standup', start: START, end: END };
    const RESP = {
      ok: true,
      json: () => Promise.resolve({
        id: 'evt1', subject: 'Standup',
        start: { dateTime: '2026-06-15T09:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-06-15T09:30:00', timeZone: 'UTC' },
        isAllDay: false,
      }),
    };

    it('omits recurrence block when recurrence is undefined', async () => {
      const fetchMock = vi.fn().mockResolvedValue(RESP);
      vi.stubGlobal('fetch', fetchMock);
      await service.createEvent('cal1', BASE);
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.recurrence).toBeUndefined();
    });

    it('sends daily noEnd recurrence', async () => {
      const fetchMock = vi.fn().mockResolvedValue(RESP);
      vi.stubGlobal('fetch', fetchMock);
      await service.createEvent('cal1', {
        ...BASE,
        recurrence: { frequency: 'daily', interval: 1, end: { type: 'noEnd' } },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.recurrence.pattern).toMatchObject({ type: 'daily', interval: 1 });
      expect(body.recurrence.range.type).toBe('noEnd');
      expect(body.recurrence.range.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(body.recurrence.range.recurrenceTimeZone).toBeTruthy();
    });

    it('sends weekly recurrence with daysOfWeek and endDate range', async () => {
      const fetchMock = vi.fn().mockResolvedValue(RESP);
      vi.stubGlobal('fetch', fetchMock);
      await service.createEvent('cal1', {
        ...BASE,
        recurrence: {
          frequency: 'weekly',
          interval: 2,
          daysOfWeek: ['monday', 'wednesday'],
          end: { type: 'endDate', endDate: '2026-12-31' },
        },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.recurrence.pattern).toMatchObject({
        type: 'weekly', interval: 2, daysOfWeek: ['monday', 'wednesday'],
      });
      expect(body.recurrence.range).toMatchObject({ type: 'endDate', endDate: '2026-12-31' });
    });

    it('sends absoluteMonthly recurrence with dayOfMonth from start and numbered range', async () => {
      const fetchMock = vi.fn().mockResolvedValue(RESP);
      vi.stubGlobal('fetch', fetchMock);
      await service.createEvent('cal1', {
        ...BASE,
        recurrence: { frequency: 'absoluteMonthly', interval: 1, end: { type: 'numbered', numberOfOccurrences: 6 } },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.recurrence.pattern).toMatchObject({ type: 'absoluteMonthly', interval: 1, dayOfMonth: 15 });
      expect(body.recurrence.range).toMatchObject({ type: 'numbered', numberOfOccurrences: 6 });
    });

    it('sends relativeMonthly recurrence with daysOfWeek and index', async () => {
      const fetchMock = vi.fn().mockResolvedValue(RESP);
      vi.stubGlobal('fetch', fetchMock);
      await service.createEvent('cal1', {
        ...BASE,
        recurrence: {
          frequency: 'relativeMonthly',
          interval: 1,
          daysOfWeek: ['monday'],
          weekIndex: 'third',
          end: { type: 'noEnd' },
        },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      expect(body.recurrence.pattern).toMatchObject({
        type: 'relativeMonthly', daysOfWeek: ['monday'], index: 'third',
      });
    });

    it('sends absoluteYearly recurrence with month and dayOfMonth from start', async () => {
      const fetchMock = vi.fn().mockResolvedValue(RESP);
      vi.stubGlobal('fetch', fetchMock);
      await service.createEvent('cal1', {
        ...BASE,
        recurrence: { frequency: 'absoluteYearly', interval: 1, end: { type: 'noEnd' } },
      });
      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
      // START is June (month index 5 → month number 6), day 15
      expect(body.recurrence.pattern).toMatchObject({ type: 'absoluteYearly', month: 6, dayOfMonth: 15 });
    });
  });
  ```

- [ ] **Step 2: Run the new tests to verify they fail**

  ```bash
  npx vitest run tests/services/CalendarService.test.ts
  ```
  Expected: the 5 new tests in `createEvent recurrence` fail (TS compile error or wrong body shape). All pre-existing tests must still pass.

- [ ] **Step 3: Add `EventRecurrence` and `toDateOnly` imports to `CalendarService.ts`**

  At the top of `src/services/CalendarService.ts`, update the two import lines:

  ```typescript
  import { M365Calendar, M365Event, NewEventInput, EventPatch, EventRecurrence } from '../types';
  ```

  ```typescript
  import { toLocalISOString, toDateOnly } from '../lib/datetime';
  ```

- [ ] **Step 4: Add the `buildRecurrenceBody` private method to `CalendarService`**

  Add this method inside the `CalendarService` class, before `getEventsForCalendar`:

  ```typescript
  private buildRecurrenceBody(r: EventRecurrence, start: Date): object {
    const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const pattern: Record<string, unknown> = { type: r.frequency, interval: r.interval };
    if (r.frequency === 'weekly') {
      pattern.daysOfWeek = r.daysOfWeek;
    } else if (r.frequency === 'absoluteMonthly') {
      pattern.dayOfMonth = start.getDate();
    } else if (r.frequency === 'relativeMonthly') {
      pattern.daysOfWeek = r.daysOfWeek;
      pattern.index = r.weekIndex;
    } else if (r.frequency === 'absoluteYearly') {
      pattern.dayOfMonth = start.getDate();
      pattern.month = start.getMonth() + 1;
    }
    const range: Record<string, unknown> = {
      type: r.end.type,
      startDate: toDateOnly(start),
      recurrenceTimeZone: timeZone,
    };
    if (r.end.type === 'endDate') range.endDate = r.end.endDate;
    if (r.end.type === 'numbered') range.numberOfOccurrences = r.end.numberOfOccurrences;
    return { pattern, range };
  }
  ```

- [ ] **Step 5: Update `createEvent` to spread the recurrence block**

  In `createEvent`, change the `body` object from:

  ```typescript
  const body = {
    subject: input.subject,
    body: { contentType: 'text', content: input.description ?? '' },
    start: { dateTime: formatDateTime(input.start), timeZone },
    end: { dateTime: formatDateTime(input.end), timeZone },
    isAllDay,
  };
  ```

  To:

  ```typescript
  const body = {
    subject: input.subject,
    body: { contentType: 'text', content: input.description ?? '' },
    start: { dateTime: formatDateTime(input.start), timeZone },
    end: { dateTime: formatDateTime(input.end), timeZone },
    isAllDay,
    ...(input.recurrence ? { recurrence: this.buildRecurrenceBody(input.recurrence, input.start) } : {}),
  };
  ```

- [ ] **Step 6: Run the tests to verify they pass**

  ```bash
  npx vitest run tests/services/CalendarService.test.ts
  ```
  Expected: all tests pass.

- [ ] **Step 7: Commit**

  ```bash
  git add src/services/CalendarService.ts tests/services/CalendarService.test.ts
  git commit -m "feat: add buildRecurrenceBody to CalendarService"
  ```

---

### Task 3: Add recurrence UI to `CreateEventForm` (TDD)

**Files:**
- Modify: `src/components/CreateEventModal.tsx`
- Modify: `tests/components/CreateEventModal.test.tsx`

#### Part A — `buildRecurrence` helper (unit-tested)

- [ ] **Step 1: Write failing unit tests for `buildRecurrence`**

  In `tests/components/CreateEventModal.test.tsx`, add a new import at the top:

  ```typescript
  import { CreateEventForm, buildRecurrence } from '../../src/components/CreateEventModal';
  ```

  Then append a new `describe` block after the existing `describe('CreateEventForm', ...)`:

  ```typescript
  describe('buildRecurrence', () => {
    // June 15 2026 is a Monday; 15th of month; 15+7=22 ≤ 30 days → 'third' occurrence
    const MON_15 = new Date(2026, 5, 15, 9, 0, 0);

    it('returns undefined when repeat is false', () => {
      expect(buildRecurrence(false, 'weekly', '1', ['monday'], 'absolute', 'noEnd', '', '10', MON_15)).toBeUndefined();
    });

    it('returns daily noEnd recurrence', () => {
      const result = buildRecurrence(true, 'daily', '1', [], 'absolute', 'noEnd', '', '10', MON_15);
      expect(result).toEqual({ frequency: 'daily', interval: 1, end: { type: 'noEnd' } });
    });

    it('returns weekly recurrence with selected days', () => {
      const result = buildRecurrence(true, 'weekly', '2', ['monday', 'friday'], 'absolute', 'noEnd', '', '10', MON_15);
      expect(result).toEqual({
        frequency: 'weekly', interval: 2, daysOfWeek: ['monday', 'friday'], end: { type: 'noEnd' },
      });
    });

    it('falls back to start day when weekly daysOfWeek list is empty', () => {
      const result = buildRecurrence(true, 'weekly', '1', [], 'absolute', 'noEnd', '', '10', MON_15);
      expect(result?.daysOfWeek).toEqual(['monday']);
    });

    it('returns absoluteMonthly recurrence', () => {
      const result = buildRecurrence(true, 'monthly', '1', [], 'absolute', 'noEnd', '', '10', MON_15);
      expect(result).toEqual({ frequency: 'absoluteMonthly', interval: 1, end: { type: 'noEnd' } });
    });

    it('returns relativeMonthly recurrence with weekIndex and daysOfWeek derived from start date', () => {
      const result = buildRecurrence(true, 'monthly', '1', [], 'relative', 'noEnd', '', '10', MON_15);
      expect(result).toEqual({
        frequency: 'relativeMonthly', interval: 1,
        daysOfWeek: ['monday'],
        weekIndex: 'third',
        end: { type: 'noEnd' },
      });
    });

    it('returns absoluteYearly recurrence', () => {
      const result = buildRecurrence(true, 'yearly', '1', [], 'absolute', 'noEnd', '', '10', MON_15);
      expect(result).toEqual({ frequency: 'absoluteYearly', interval: 1, end: { type: 'noEnd' } });
    });

    it('returns endDate range', () => {
      const result = buildRecurrence(true, 'weekly', '1', ['monday'], 'absolute', 'endDate', '2026-12-31', '10', MON_15);
      expect(result?.end).toEqual({ type: 'endDate', endDate: '2026-12-31' });
    });

    it('returns numbered range', () => {
      const result = buildRecurrence(true, 'daily', '1', [], 'absolute', 'numbered', '', '5', MON_15);
      expect(result?.end).toEqual({ type: 'numbered', numberOfOccurrences: 5 });
    });

    it('clamps interval to minimum of 1 for invalid string input', () => {
      const result = buildRecurrence(true, 'daily', 'xyz', [], 'absolute', 'noEnd', '', '10', MON_15);
      expect(result?.interval).toBe(1);
    });

    it('returns weekIndex "last" when start day is the last occurrence of that weekday in the month', () => {
      // June 29 2026 is a Monday; 29+7=36 > 30 → last
      const lastMon = new Date(2026, 5, 29, 9, 0, 0);
      const result = buildRecurrence(true, 'monthly', '1', [], 'relative', 'noEnd', '', '10', lastMon);
      expect(result?.weekIndex).toBe('last');
    });
  });
  ```

- [ ] **Step 2: Run the new tests to verify they fail**

  ```bash
  npx vitest run tests/components/CreateEventModal.test.tsx
  ```
  Expected: the `buildRecurrence` describe block fails (export not found). All `CreateEventForm` tests still pass.

- [ ] **Step 3: Add helper functions and `buildRecurrence` export to `CreateEventModal.tsx`**

  Add the following type imports at the top of `src/components/CreateEventModal.tsx`:

  ```typescript
  import { M365Calendar, NewEventInput, EventRecurrence, RecurrenceFrequency, DayOfWeek, WeekIndex, RecurrenceEndType } from '../types';
  ```

  Then add the following pure helpers and exported function **before** the `CreateEventForm` component definition (outside of any component):

  ```typescript
  const DAY_NAMES: DayOfWeek[] = [
    'sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday',
  ];

  function getDayOfWeek(date: Date): DayOfWeek {
    return DAY_NAMES[date.getDay()];
  }

  function getWeekIndex(date: Date): WeekIndex {
    const dayOfMonth = date.getDate();
    const daysInMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    if (dayOfMonth + 7 > daysInMonth) return 'last';
    const occurrence = Math.ceil(dayOfMonth / 7);
    return (['first', 'second', 'third', 'fourth'] as const)[occurrence - 1];
  }

  export function buildRecurrence(
    repeat: boolean,
    frequency: 'daily' | 'weekly' | 'monthly' | 'yearly',
    intervalStr: string,
    daysOfWeek: DayOfWeek[],
    monthlyMode: 'absolute' | 'relative',
    endType: RecurrenceEndType,
    endDateStr: string,
    occurrencesStr: string,
    startDate: Date,
  ): EventRecurrence | undefined {
    if (!repeat) return undefined;
    const interval = Math.max(1, parseInt(intervalStr) || 1);
    let freq: RecurrenceFrequency;
    let recDaysOfWeek: DayOfWeek[] | undefined;
    let weekIndex: WeekIndex | undefined;
    if (frequency === 'daily') {
      freq = 'daily';
    } else if (frequency === 'weekly') {
      freq = 'weekly';
      recDaysOfWeek = daysOfWeek.length > 0 ? daysOfWeek : [getDayOfWeek(startDate)];
    } else if (frequency === 'monthly') {
      if (monthlyMode === 'relative') {
        freq = 'relativeMonthly';
        recDaysOfWeek = [getDayOfWeek(startDate)];
        weekIndex = getWeekIndex(startDate);
      } else {
        freq = 'absoluteMonthly';
      }
    } else {
      freq = 'absoluteYearly';
    }
    const end: EventRecurrence['end'] = { type: endType };
    if (endType === 'endDate') end.endDate = endDateStr;
    if (endType === 'numbered') end.numberOfOccurrences = Math.max(1, parseInt(occurrencesStr) || 1);
    return {
      frequency: freq,
      interval,
      ...(recDaysOfWeek !== undefined ? { daysOfWeek: recDaysOfWeek } : {}),
      ...(weekIndex !== undefined ? { weekIndex } : {}),
      end,
    };
  }
  ```

- [ ] **Step 4: Run unit tests to verify they pass**

  ```bash
  npx vitest run tests/components/CreateEventModal.test.tsx
  ```
  Expected: all `buildRecurrence` tests pass. All `CreateEventForm` tests still pass.

#### Part B — Recurrence UI in `CreateEventForm` (component tests)

- [ ] **Step 5: Write failing component tests for the recurrence UI**

  Add the following tests inside the existing `describe('CreateEventForm', ...)` block in `tests/components/CreateEventModal.test.tsx`:

  ```typescript
  it('does not show frequency select when Repeat is unchecked', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByRole('combobox', { name: /frequency/i })).not.toBeInTheDocument();
  });

  it('shows recurrence controls when Repeat checkbox is checked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    expect(screen.getByRole('combobox', { name: /frequency/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /no end/i })).toBeInTheDocument();
  });

  it('pre-checks the start day in the day-of-week row for weekly frequency', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)} // Monday
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    // default frequency is weekly
    const monCb = screen.getByRole('checkbox', { name: /^monday$/i }) as HTMLInputElement;
    expect(monCb).toBeInTheDocument();
    expect(monCb.checked).toBe(true);
    const sunCb = screen.getByRole('checkbox', { name: /^sunday$/i }) as HTMLInputElement;
    expect(sunCb.checked).toBe(false);
  });

  it('shows absolute and relative radio options when Monthly is selected', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)} // Monday the 15th → "third Monday"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /frequency/i }), 'monthly');
    expect(screen.getByRole('radio', { name: /on day 15/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /third monday/i })).toBeInTheDocument();
  });

  it('does not show day-of-week row when Daily is selected', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /frequency/i }), 'daily');
    expect(screen.queryByRole('checkbox', { name: /^monday$/i })).not.toBeInTheDocument();
  });

  it('submits with weekly recurrence when Repeat is checked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'Standup');
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith(
      'cal1',
      expect.objectContaining({
        recurrence: expect.objectContaining({ frequency: 'weekly' }),
      }),
    );
  });

  it('submits without recurrence when Repeat is unchecked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'One-off');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith('cal1', expect.objectContaining({ recurrence: undefined }));
  });

  it('shows validation error when Weekly selected with no days checked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)} // Monday pre-checked
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'Standup');
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^monday$/i })); // uncheck
    await userEvent.click(screen.getByText('Create'));
    expect(screen.getByText('Select at least one day of the week')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
  ```

- [ ] **Step 6: Run the component tests to verify they fail**

  ```bash
  npx vitest run tests/components/CreateEventModal.test.tsx
  ```
  Expected: the 8 new `CreateEventForm` recurrence tests fail (Repeat checkbox not found, etc.). `buildRecurrence` tests still pass.

- [ ] **Step 7: Add recurrence state and UI to `CreateEventForm`**

  Inside `CreateEventForm`, add new state variables after the existing `const [error, setError] = useState('')`:

  ```typescript
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('weekly');
  const [intervalStr, setIntervalStr] = useState('1');
  const [daysOfWeek, setDaysOfWeek] = useState<DayOfWeek[]>([getDayOfWeek(initialDate)]);
  const [monthlyMode, setMonthlyMode] = useState<'absolute' | 'relative'>('absolute');
  const [endType, setEndType] = useState<RecurrenceEndType>('noEnd');
  const [endDateStr, setEndDateStr] = useState(() => {
    const d = new Date(initialDate);
    d.setFullYear(d.getFullYear() + 1);
    return toDateOnly(d);
  });
  const [occurrencesStr, setOccurrencesStr] = useState('10');
  ```

  Add a helper inside the component (between state declarations and `handleAllDayChange`):

  ```typescript
  const toggleDay = (day: DayOfWeek) => {
    setDaysOfWeek((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day],
    );
  };
  ```

  In `handleSubmit`, add recurrence validation **after** the existing end-time check and before the `onSubmit` call:

  ```typescript
  if (repeat) {
    if (frequency === 'weekly' && daysOfWeek.length === 0) {
      setError('Select at least one day of the week');
      return;
    }
    if (endType === 'endDate') {
      const startDateOnly = startStr.slice(0, 10);
      if (!endDateStr || endDateStr <= startDateOnly) {
        setError('Recurrence end date must be after the event start date');
        return;
      }
    }
    if (endType === 'numbered' && (parseInt(occurrencesStr) || 0) < 1) {
      setError('Number of occurrences must be at least 1');
      return;
    }
  }
  ```

  Update the `onSubmit` call to include `recurrence`:

  ```typescript
  onSubmit(calendarId, {
    subject: subject.trim(),
    start,
    end,
    isAllDay,
    description: description.trim() || undefined,
    recurrence: buildRecurrence(repeat, frequency, intervalStr, daysOfWeek, monthlyMode, endType, endDateStr, occurrencesStr, start),
  });
  ```

  Add the following constants at module scope (alongside `DAY_NAMES` already added in Part A):

  ```typescript
  const DAY_ABBREVS: Record<DayOfWeek, string> = {
    sunday: 'Su', monday: 'M', tuesday: 'Tu', wednesday: 'W',
    thursday: 'Th', friday: 'F', saturday: 'Sa',
  };

  const INTERVAL_LABELS: Record<'daily' | 'weekly' | 'monthly' | 'yearly', string> = {
    daily: 'day(s)', weekly: 'week(s)', monthly: 'month(s)', yearly: 'year(s)',
  };

  const WEEK_INDEX_LABELS: Record<WeekIndex, string> = {
    first: 'first', second: 'second', third: 'third', fourth: 'fourth', last: 'last',
  };

  const DAY_DISPLAY: Record<DayOfWeek, string> = {
    sunday: 'Sunday', monday: 'Monday', tuesday: 'Tuesday', wednesday: 'Wednesday',
    thursday: 'Thursday', friday: 'Friday', saturday: 'Saturday',
  };
  ```

  In the JSX of `CreateEventForm`, add the Repeat checkbox immediately after the description field and before `m365-form-actions`:

  ```tsx
  <div className="m365-form-checkbox">
    <label>
      <input
        type="checkbox"
        checked={repeat}
        onChange={(e) => setRepeat(e.target.checked)}
      />
      Repeat
    </label>
  </div>
  {repeat && (
    <div className="m365-form-recurrence">
      <div className="m365-form-field">
        <label htmlFor="m365-create-frequency">Frequency</label>
        <select
          id="m365-create-frequency"
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly')}
        >
          <option value="daily">Daily</option>
          <option value="weekly">Weekly</option>
          <option value="monthly">Monthly</option>
          <option value="yearly">Yearly</option>
        </select>
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-create-interval">Every</label>
        <input
          id="m365-create-interval"
          type="number"
          min="1"
          value={intervalStr}
          onChange={(e) => setIntervalStr(e.target.value)}
        />
        <span>{INTERVAL_LABELS[frequency]}</span>
      </div>
      {frequency === 'weekly' && (
        <div className="m365-form-days-of-week">
          {DAY_NAMES.map((day) => (
            <label key={day} className="m365-day-toggle">
              <input
                type="checkbox"
                checked={daysOfWeek.includes(day)}
                onChange={() => toggleDay(day)}
                aria-label={DAY_DISPLAY[day]}
              />
              <span aria-hidden="true">{DAY_ABBREVS[day]}</span>
            </label>
          ))}
        </div>
      )}
      {frequency === 'monthly' && (() => {
        const dayOfMonth = new Date(startStr.length === 10 ? `${startStr}T00:00` : startStr).getDate() || initialDate.getDate();
        const startDateForMonthly = new Date(startStr.length === 10 ? `${startStr}T00:00` : startStr);
        const isValidStart = !isNaN(startDateForMonthly.getTime());
        const refDate = isValidStart ? startDateForMonthly : initialDate;
        const weekIdxLabel = WEEK_INDEX_LABELS[getWeekIndex(refDate)];
        const dayName = DAY_DISPLAY[getDayOfWeek(refDate)];
        return (
          <div className="m365-form-recurrence-monthly">
            <label>
              <input
                type="radio"
                name="m365-monthly-mode"
                checked={monthlyMode === 'absolute'}
                onChange={() => setMonthlyMode('absolute')}
                aria-label={`On day ${dayOfMonth} of the month`}
              />
              On day {dayOfMonth} of the month
            </label>
            <label>
              <input
                type="radio"
                name="m365-monthly-mode"
                checked={monthlyMode === 'relative'}
                onChange={() => setMonthlyMode('relative')}
                aria-label={`On the ${weekIdxLabel} ${dayName}`}
              />
              On the {weekIdxLabel} {dayName}
            </label>
          </div>
        );
      })()}
      <fieldset className="m365-form-recurrence-end">
        <legend>End</legend>
        <label>
          <input
            type="radio"
            name="m365-end-type"
            checked={endType === 'noEnd'}
            onChange={() => setEndType('noEnd')}
            aria-label="No end"
          />
          No end
        </label>
        <label>
          <input
            type="radio"
            name="m365-end-type"
            checked={endType === 'endDate'}
            onChange={() => setEndType('endDate')}
            aria-label="End by"
          />
          End by
        </label>
        {endType === 'endDate' && (
          <input
            type="date"
            value={endDateStr}
            onChange={(e) => setEndDateStr(e.target.value)}
            aria-label="Recurrence end date"
          />
        )}
        <label>
          <input
            type="radio"
            name="m365-end-type"
            checked={endType === 'numbered'}
            onChange={() => setEndType('numbered')}
            aria-label="After"
          />
          After
        </label>
        {endType === 'numbered' && (
          <>
            <input
              type="number"
              min="1"
              value={occurrencesStr}
              onChange={(e) => setOccurrencesStr(e.target.value)}
              aria-label="Number of occurrences"
            />
            <span>occurrences</span>
          </>
        )}
      </fieldset>
    </div>
  )}
  ```

- [ ] **Step 8: Run all tests to verify they pass**

  ```bash
  npx vitest run tests/components/CreateEventModal.test.tsx
  ```
  Expected: all tests pass including the 8 new recurrence UI tests.

- [ ] **Step 9: Run the full test suite**

  ```bash
  npm test
  ```
  Expected: all tests pass.

- [ ] **Step 10: Run typecheck**

  ```bash
  npm run typecheck
  ```
  Expected: no errors.

- [ ] **Step 11: Commit**

  ```bash
  git add src/components/CreateEventModal.tsx tests/components/CreateEventModal.test.tsx
  git commit -m "feat: add recurring event support to Create Event modal"
  ```

---

## Summary

Three tasks, three commits. After completion, users can check "Repeat" in the Create Event modal to configure daily/weekly/monthly/yearly recurrence with a custom interval, day-of-week selection (weekly), absolute or relative monthly options, and no-end / end-by-date / end-by-count termination.

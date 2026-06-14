# Delete Event Series Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** When deleting a recurring calendar event, offer the user a choice to delete only this occurrence or the entire series.

**Architecture:** Add `type` and `seriesMasterId` to `M365Event`, wire a new `deleteEventSeries` method in `CalendarService`, extend `EventDetailForm` with a series-aware confirm UI (`false | 'occurrence' | 'single'` state), and wire the new `onDeleteSeries` callback through `CalendarApp → EventDetailModal → EventDetailForm`.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react, Microsoft Graph API

---

## File Map

| File | Change |
|---|---|
| `src/types/index.ts` | Add `type?` and `seriesMasterId?` to `M365Event` |
| `src/services/CalendarService.ts` | Add `deleteEventSeries`, extend `$select` and `mapEvent` |
| `src/components/EventDetailModal.tsx` | Add `onDeleteSeries` prop + series-aware confirm UI |
| `src/components/CalendarApp.tsx` | Wire `onDeleteSeries` in `handleEventClick` |
| `tests/services/CalendarService.test.ts` | Tests for `deleteEventSeries` and `mapEvent` recurrence fields |
| `tests/components/EventDetailModal.test.tsx` | Tests for series master and occurrence confirm flows |
| `tests/components/CalendarApp.test.tsx` | Update mock + tests for occurrence/series-master wiring |

---

## Task 1: Extend M365Event type

**Files:**
- Modify: `src/types/index.ts`

This is a pure type change — no runtime behavior, no failing test to write first.

- [ ] **Step 1: Add `type` and `seriesMasterId` to `M365Event`**

In `src/types/index.ts`, replace the `M365Event` interface:

```typescript
export interface M365Event {
  id: string;
  subject: string;
  start: { dateTime: string; timeZone: string };
  end: { dateTime: string; timeZone: string };
  calendarId: string;
  isAllDay: boolean;
  bodyPreview?: string;
  webLink?: string;
  location?: string;
  type?: 'singleInstance' | 'occurrence' | 'exception' | 'seriesMaster';
  seriesMasterId?: string;
}
```

- [ ] **Step 2: Verify typecheck passes**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add type and seriesMasterId to M365Event"
```

---

## Task 2: CalendarService — deleteEventSeries, $select, mapEvent

**Files:**
- Modify: `src/services/CalendarService.ts`
- Test: `tests/services/CalendarService.test.ts`

- [ ] **Step 1: Write failing tests**

Add the following tests to `tests/services/CalendarService.test.ts`, after the existing `deleteEvent throws` test (around line 474):

```typescript
// --- deleteEventSeries ---

it('deleteEventSeries sends DELETE to /me/events/{seriesMasterId} with correct auth header', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  await service.deleteEventSeries('master-id-1');
  expect(fetchMock).toHaveBeenCalledWith(
    'https://graph.microsoft.com/v1.0/me/events/master-id-1',
    expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }),
  );
});

it('deleteEventSeries clears the cache on success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  await service.deleteEventSeries('master-id-1');
  expect(cache.clearAll).toHaveBeenCalled();
});

it('deleteEventSeries throws when Graph returns error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
  await expect(service.deleteEventSeries('master-id-1')).rejects.toThrow(
    'Failed to delete event series: Not Found',
  );
});
```

Also add mapEvent recurrence field tests after the existing `getEvents sets location to undefined` test (around line 152):

```typescript
it('getEvents maps type and seriesMasterId from Graph response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({
      value: [{
        id: 'evt1',
        subject: 'Team Standup',
        start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
        isAllDay: false,
        bodyPreview: '',
        webLink: 'https://outlook.office.com/calendar/item/evt1',
        type: 'occurrence',
        seriesMasterId: 'master-id-1',
      }],
    }),
  }));
  const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
  expect(events[0].type).toBe('occurrence');
  expect(events[0].seriesMasterId).toBe('master-id-1');
});

it('getEvents sets type and seriesMasterId to undefined when absent from Graph response', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ value: [FAKE_EVENT_RESPONSE] }),
  }));
  const events = await service.getEvents(['cal1'], new Date('2026-04-01'), new Date('2026-04-30'));
  expect(events[0].type).toBeUndefined();
  expect(events[0].seriesMasterId).toBeUndefined();
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/CalendarService.test.ts
```

Expected: the 5 new tests fail (`deleteEventSeries is not a function`, `type` is undefined, etc.).

- [ ] **Step 3: Implement `deleteEventSeries`, update `$select`, update `mapEvent`**

In `src/services/CalendarService.ts`:

**3a.** Update the `$select` parameter in `getEventsForCalendar` (around line 137):

```typescript
$select: 'id,subject,start,end,isAllDay,bodyPreview,webLink,location,type,seriesMasterId',
```

**3b.** Update `mapEvent` (around line 164) to include the new fields:

```typescript
private mapEvent(e: Record<string, unknown>, calendarId: string): M365Event {
  return {
    id: e.id as string,
    subject: e.subject as string,
    start: e.start as { dateTime: string; timeZone: string },
    end: e.end as { dateTime: string; timeZone: string },
    calendarId,
    isAllDay: (e.isAllDay as boolean) ?? false,
    bodyPreview: e.bodyPreview as string | undefined,
    webLink: e.webLink as string | undefined,
    location: (e.location as { displayName?: string } | undefined)?.displayName,
    type: e.type as M365Event['type'] | undefined,
    seriesMasterId: e.seriesMasterId as string | undefined,
  };
}
```

**3c.** Add `deleteEventSeries` after `deleteEvent` (around line 103):

```typescript
async deleteEventSeries(seriesMasterId: string): Promise<void> {
  const token = await this.auth.getValidToken();
  const response = await this.fetch(`${GRAPH_BASE}/me/events/${seriesMasterId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Failed to delete event series: ${response.statusText}`);
  await this.cache.clearAll();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/CalendarService.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/CalendarService.ts tests/services/CalendarService.test.ts
git commit -m "feat: add deleteEventSeries and map recurrence fields from Graph"
```

---

## Task 3: EventDetailForm — series-aware confirm UI

**Files:**
- Modify: `src/components/EventDetailModal.tsx`
- Test: `tests/components/EventDetailModal.test.tsx`

- [ ] **Step 1: Write failing tests**

Add the following two `describe` blocks to `tests/components/EventDetailModal.test.tsx`, inside the top-level `describe('EventDetailForm', ...)` block, after the existing `'logs to console.error when onDelete rejects'` test (around line 205):

```typescript
describe('series master delete', () => {
  it('shows series warning copy and single confirm button when Delete is clicked', async () => {
    const seriesMasterEvent = { ...event, type: 'seriesMaster' as const };
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <EventDetailForm
        event={seriesMasterEvent}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
        calendars={[]}
      />,
    );
    await userEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('This will permanently delete all events in this series.')).toBeInTheDocument();
    expect(screen.getByText('Delete all events')).toBeInTheDocument();
    expect(screen.queryByText('Delete this event')).not.toBeInTheDocument();
  });

  it('calls onDelete when Delete all events is clicked', async () => {
    const seriesMasterEvent = { ...event, type: 'seriesMaster' as const };
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <EventDetailForm
        event={seriesMasterEvent}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
        calendars={[]}
      />,
    );
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete all events'));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('returns to normal state when Cancel is clicked in series master confirm mode', async () => {
    const seriesMasterEvent = { ...event, type: 'seriesMaster' as const };
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(
      <EventDetailForm
        event={seriesMasterEvent}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
        calendars={[]}
      />,
    );
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('This will permanently delete all events in this series.')).not.toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });
});

describe('occurrence delete', () => {
  const occurrenceEvent = { ...event, type: 'occurrence' as const, seriesMasterId: 'master-1' };

  it('shows two delete buttons when onDeleteSeries is provided', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onDeleteSeries = vi.fn().mockResolvedValue(undefined);
    render(
      <EventDetailForm
        event={occurrenceEvent}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
        onDeleteSeries={onDeleteSeries}
        calendars={[]}
      />,
    );
    await userEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('Delete this event')).toBeInTheDocument();
    expect(screen.getByText('Delete the series')).toBeInTheDocument();
    expect(screen.getByText('This will permanently delete this event.')).toBeInTheDocument();
  });

  it('calls onDelete (not onDeleteSeries) when Delete this event is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onDeleteSeries = vi.fn().mockResolvedValue(undefined);
    render(
      <EventDetailForm
        event={occurrenceEvent}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
        onDeleteSeries={onDeleteSeries}
        calendars={[]}
      />,
    );
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete this event'));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
    expect(onDeleteSeries).not.toHaveBeenCalled();
  });

  it('calls onDeleteSeries (not onDelete) when Delete the series is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onDeleteSeries = vi.fn().mockResolvedValue(undefined);
    render(
      <EventDetailForm
        event={occurrenceEvent}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
        onDeleteSeries={onDeleteSeries}
        calendars={[]}
      />,
    );
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete the series'));
    await waitFor(() => expect(onDeleteSeries).toHaveBeenCalled());
    expect(onDelete).not.toHaveBeenCalled();
  });

  it('returns to normal state when Cancel is clicked in occurrence confirm mode', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onDeleteSeries = vi.fn().mockResolvedValue(undefined);
    render(
      <EventDetailForm
        event={occurrenceEvent}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
        onDeleteSeries={onDeleteSeries}
        calendars={[]}
      />,
    );
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('Delete this event')).not.toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('shows inline error and resets confirm state when onDeleteSeries rejects', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    const onDeleteSeries = vi.fn().mockRejectedValue(new Error('Series error'));
    render(
      <EventDetailForm
        event={occurrenceEvent}
        onSave={onSave}
        onCancel={onCancel}
        onDelete={onDelete}
        onDeleteSeries={onDeleteSeries}
        calendars={[]}
      />,
    );
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete the series'));
    await waitFor(() => expect(screen.getByText('Series error')).toBeInTheDocument());
    expect(screen.queryByText('Delete this event')).not.toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/EventDetailModal.test.tsx
```

Expected: 9 new tests fail (props not found / wrong button text), existing tests pass.

- [ ] **Step 3: Implement the series-aware confirm UI**

Replace `src/components/EventDetailModal.tsx` with the following. The key changes are: `onDeleteSeries` prop, `confirmingDelete` type becomes `false | 'occurrence' | 'single'`, `handleDelete` accepts the handler to invoke, and the confirm action row branches on the confirm state and `event.type`.

```typescript
import { App, Modal } from 'obsidian';
import React, { StrictMode, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365Event, M365Calendar, EventPatch } from '../types';
import { toDateOnly, toDateTimeLocal, parseDateInput } from '../lib/datetime';

// ── Form ─────────────────────────────────────────────────────────────────────

interface EventDetailFormProps {
  event: M365Event;
  calendars: M365Calendar[];
  onSave: (patch: EventPatch, targetCalendarId: string) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
  onDeleteSeries?: () => Promise<void>;
}

export const EventDetailForm: React.FC<EventDetailFormProps> = ({
  event,
  calendars,
  onSave,
  onCancel,
  onDelete,
  onDeleteSeries,
}) => {
  const startDate = new Date(event.start.dateTime);
  const endDate = new Date(event.end.dateTime);

  const [subject, setSubject] = useState(event.subject);
  const [location, setLocation] = useState(event.location ?? '');
  const [isAllDay, setIsAllDay] = useState(event.isAllDay);
  const [startStr, setStartStr] = useState(
    event.isAllDay ? toDateOnly(startDate) : toDateTimeLocal(startDate),
  );
  const [endStr, setEndStr] = useState(
    event.isAllDay ? toDateOnly(endDate) : toDateTimeLocal(endDate),
  );
  const [description, setDescription] = useState(event.bodyPreview ?? '');
  const [selectedCalendarId, setSelectedCalendarId] = useState(event.calendarId);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState<false | 'occurrence' | 'single'>(false);
  const [deleting, setDeleting] = useState(false);

  const eventCalendar = calendars.find((c) => c.id === event.calendarId);
  const calendarDropdownDisabled = confirmingDelete !== false || saving || !(eventCalendar?.canEdit ?? false);
  const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId);

  const handleAllDayChange = (checked: boolean) => {
    setIsAllDay(checked);
    const s = parseDateInput(startStr);
    const e = parseDateInput(endStr);
    const safeStart = isNaN(s.getTime()) ? startDate : s;
    const safeEnd = isNaN(e.getTime()) ? endDate : e;
    if (checked) {
      const startDateStr = toDateOnly(safeStart);
      let endDateStr = toDateOnly(safeEnd);
      if (endDateStr <= startDateStr) {
        const nextDay = new Date(safeStart);
        nextDay.setDate(nextDay.getDate() + 1);
        endDateStr = toDateOnly(nextDay);
      }
      setStartStr(startDateStr);
      setEndStr(endDateStr);
    } else {
      setStartStr(toDateTimeLocal(safeStart));
      setEndStr(toDateTimeLocal(safeEnd));
    }
  };

  const handleDelete = async (handler: () => Promise<void>) => {
    setDeleting(true);
    setError('');
    try {
      await handler();
    } catch (e) {
      console.error('M365 Calendar:', e);
      setError(e instanceof Error ? e.message : 'Failed to delete event');
      setConfirmingDelete(false);
    } finally {
      setDeleting(false);
    }
  };

  const handleSave = async () => {
    if (!subject.trim()) {
      setError('Title is required');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const toGraphDateTime = (s: string) =>
        s.length === 10 ? `${s}T00:00:00` : s.length === 16 ? `${s}:00` : s;
      const patch: EventPatch = {
        subject: subject.trim(),
        location: location.trim(),
        isAllDay,
        start: { dateTime: toGraphDateTime(startStr), timeZone: event.start.timeZone },
        end: { dateTime: toGraphDateTime(endStr), timeZone: event.end.timeZone },
        bodyContent: description.trim(),
      };
      await onSave(patch, selectedCalendarId);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save event');
    } finally {
      setSaving(false);
    }
  };

  const isMaster = event.type === 'seriesMaster';

  const renderConfirmActions = () => {
    if (confirmingDelete === 'occurrence') {
      return (
        <div className="m365-form-actions">
          <span>This will permanently delete this event.</span>
          <button onClick={() => setConfirmingDelete(false)} disabled={deleting}>
            Cancel
          </button>
          <button className="mod-warning" onClick={() => void handleDelete(onDelete!)} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete this event'}
          </button>
          <button className="mod-warning" onClick={() => void handleDelete(onDeleteSeries!)} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete the series'}
          </button>
        </div>
      );
    }
    return (
      <div className="m365-form-actions">
        <span>
          {isMaster
            ? 'This will permanently delete all events in this series.'
            : 'This will permanently delete the event.'}
        </span>
        <button onClick={() => setConfirmingDelete(false)} disabled={deleting}>
          Cancel
        </button>
        <button className="mod-warning" onClick={() => void handleDelete(onDelete!)} disabled={deleting}>
          {deleting ? 'Deleting…' : isMaster ? 'Delete all events' : 'Delete event'}
        </button>
      </div>
    );
  };

  return (
    <div className="m365-create-event-form">
      {error && <div className="m365-form-error">{error}</div>}
      <div className="m365-form-field">
        <label htmlFor="m365-event-subject">Title</label>
        <input
          id="m365-event-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          autoFocus
          disabled={confirmingDelete !== false || saving}
        />
      </div>
      {calendars.length > 0 && (
        <div className="m365-form-field">
          <label htmlFor="m365-event-calendar">Calendar</label>
          <div className="m365-form-calendar-select-row">
            <span
              className="m365-calendar-color-swatch"
              style={{ backgroundColor: selectedCalendar?.color ?? '#0078d4' }}
            />
            <select
              id="m365-event-calendar"
              value={selectedCalendarId}
              onChange={(e) => setSelectedCalendarId(e.target.value)}
              disabled={calendarDropdownDisabled}
            >
              {calendars.map((c) => (
                <option key={c.id} value={c.id} disabled={!c.canEdit}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
      <div className="m365-form-field">
        <label htmlFor="m365-event-location">Location</label>
        <input
          id="m365-event-location"
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="Add location"
          disabled={confirmingDelete !== false || saving}
        />
      </div>
      <div className="m365-form-checkbox">
        <label>
          <input
            type="checkbox"
            checked={isAllDay}
            onChange={(e) => handleAllDayChange(e.target.checked)}
            disabled={confirmingDelete !== false || saving}
          />
          All day
        </label>
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-event-start">Start</label>
        <input
          id="m365-event-start"
          type={isAllDay ? 'date' : 'datetime-local'}
          value={startStr}
          onChange={(e) => setStartStr(e.target.value)}
          disabled={confirmingDelete !== false || saving}
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-event-end">End</label>
        <input
          id="m365-event-end"
          type={isAllDay ? 'date' : 'datetime-local'}
          value={endStr}
          onChange={(e) => setEndStr(e.target.value)}
          disabled={confirmingDelete !== false || saving}
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-event-description">Description</label>
        <textarea
          id="m365-event-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={confirmingDelete !== false || saving}
        />
      </div>
      {confirmingDelete !== false ? (
        renderConfirmActions()
      ) : (
        <div className="m365-form-actions">
          <button onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          {onDelete && (
            <button
              onClick={() => setConfirmingDelete(onDeleteSeries ? 'occurrence' : 'single')}
              disabled={saving}
            >
              Delete
            </button>
          )}
          <button className="mod-cta" onClick={() => void handleSave()} disabled={saving}>
            {saving ? 'Saving…' : 'OK'}
          </button>
        </div>
      )}
    </div>
  );
};

// ── Modal ─────────────────────────────────────────────────────────────────────

export class EventDetailModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly event: M365Event,
    private readonly onSaveCallback: (patch: EventPatch, targetCalendarId: string) => Promise<void>,
    private readonly onSaved: () => void,
    private readonly calendars: M365Calendar[],
    private readonly onDeleteCallback?: () => Promise<void>,
    private readonly onDeleteSeriesCallback?: () => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('Edit event');
    this.root = createRoot(this.contentEl);
    const onDelete = this.onDeleteCallback
      ? async () => {
          await this.onDeleteCallback!();
          this.close();
        }
      : undefined;
    const onDeleteSeries = this.onDeleteSeriesCallback
      ? async () => {
          await this.onDeleteSeriesCallback!();
          this.close();
        }
      : undefined;
    this.root.render(
      <StrictMode>
        <EventDetailForm
          event={this.event}
          calendars={this.calendars}
          onSave={async (patch, targetCalendarId) => {
            await this.onSaveCallback(patch, targetCalendarId);
            this.close();
            this.onSaved();
          }}
          onCancel={() => this.close()}
          onDelete={onDelete}
          onDeleteSeries={onDeleteSeries}
        />
      </StrictMode>,
    );
  }

  onClose(): void {
    this.root?.unmount();
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/EventDetailModal.test.tsx
```

Expected: all tests pass (existing + 9 new).

- [ ] **Step 5: Commit**

```bash
git add src/components/EventDetailModal.tsx tests/components/EventDetailModal.test.tsx
git commit -m "feat: add series-aware delete UI to EventDetailForm"
```

---

## Task 4: CalendarApp — wire onDeleteSeries in handleEventClick

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Test: `tests/components/CalendarApp.test.tsx`

- [ ] **Step 1: Update the CalendarApp test mock and fixtures**

In `tests/components/CalendarApp.test.tsx`:

**1a.** Add `onDeleteSeries` to `eventDetailModalCallbacks` (around line 15):

```typescript
const eventDetailModalCallbacks = vi.hoisted(() => ({
  onDelete: undefined as (() => Promise<void>) | undefined,
  onDeleteSeries: undefined as (() => Promise<void>) | undefined,
  onSave: null as ((patch: EventPatch, targetCalendarId: string) => Promise<void>) | null,
  calendars: null as M365Calendar[] | null,
}));
```

**1b.** Update the `EventDetailModal` mock constructor to capture `onDeleteSeries` (the 7th argument):

```typescript
vi.mock('../../src/components/EventDetailModal', () => ({
  EventDetailModal: class {
    constructor(
      _app: unknown,
      _event: unknown,
      onSave: (patch: EventPatch, targetCalendarId: string) => Promise<void>,
      _onSaved: unknown,
      calendars: M365Calendar[],
      onDelete?: () => Promise<void>,
      onDeleteSeries?: () => Promise<void>,
    ) {
      eventDetailModalCallbacks.onDelete = onDelete;
      eventDetailModalCallbacks.onDeleteSeries = onDeleteSeries;
      eventDetailModalCallbacks.onSave = onSave;
      eventDetailModalCallbacks.calendars = calendars;
    }
    open() {}
  },
}));
```

**1c.** Add `deleteEventSeries` to `makeContext`'s default `calendarService`:

```typescript
calendarService: {
  getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
  getEvents: vi.fn().mockResolvedValue([mockEvent]),
  createEvent: vi.fn(),
  updateEvent: vi.fn().mockResolvedValue(undefined),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
  deleteEventSeries: vi.fn().mockResolvedValue(undefined),
  moveEvent: vi.fn().mockResolvedValue(undefined),
} as unknown as AppContextValue['calendarService'],
```

**1d.** Add sentinel reset for `onDeleteSeries` in `beforeEach` (right after the existing sentinel reset for `onDelete`, around line 154):

```typescript
eventDetailModalCallbacks.onDeleteSeries = 'NOT_CALLED' as unknown as (() => Promise<void>) | undefined;
```

- [ ] **Step 2: Write failing tests**

Add the following tests to `tests/components/CalendarApp.test.tsx`, after the existing `'onDelete rejects when deleteEvent throws'` test (around line 420):

```typescript
it('does not pass onDeleteSeries to EventDetailModal for a singleInstance event', async () => {
  const ctx = makeContext(); // mockEvent has no type field — single-instance path
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));
  expect(eventDetailModalCallbacks.onDeleteSeries).toBeUndefined();
});

it('passes onDeleteSeries to EventDetailModal when event is an occurrence', async () => {
  const occurrenceEvent = {
    ...mockEvent,
    type: 'occurrence' as const,
    seriesMasterId: 'master-1',
  };
  const ctx = makeContext({
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
      getEvents: vi.fn().mockResolvedValue([occurrenceEvent]),
      createEvent: vi.fn(),
      updateEvent: vi.fn().mockResolvedValue(undefined),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
      deleteEventSeries: vi.fn().mockResolvedValue(undefined),
      moveEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppContextValue['calendarService'],
  });
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));
  expect(eventDetailModalCallbacks.onDeleteSeries).toBeDefined();
});

it('passes onDeleteSeries to EventDetailModal when event is an exception', async () => {
  const exceptionEvent = {
    ...mockEvent,
    type: 'exception' as const,
    seriesMasterId: 'master-1',
  };
  const ctx = makeContext({
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
      getEvents: vi.fn().mockResolvedValue([exceptionEvent]),
      createEvent: vi.fn(),
      updateEvent: vi.fn().mockResolvedValue(undefined),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
      deleteEventSeries: vi.fn().mockResolvedValue(undefined),
      moveEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppContextValue['calendarService'],
  });
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));
  expect(eventDetailModalCallbacks.onDeleteSeries).toBeDefined();
});

it('does not pass onDeleteSeries to EventDetailModal for a seriesMaster event', async () => {
  const seriesMasterEvent = { ...mockEvent, type: 'seriesMaster' as const };
  const ctx = makeContext({
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
      getEvents: vi.fn().mockResolvedValue([seriesMasterEvent]),
      createEvent: vi.fn(),
      updateEvent: vi.fn().mockResolvedValue(undefined),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
      deleteEventSeries: vi.fn().mockResolvedValue(undefined),
      moveEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppContextValue['calendarService'],
  });
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));
  expect(eventDetailModalCallbacks.onDeleteSeries).toBeUndefined();
});

it('onDeleteSeries calls deleteEventSeries and removes all series occurrences from state', async () => {
  const NoticeSpy = vi.spyOn(obsidianMock, 'Notice').mockImplementation(function () {} as unknown as typeof obsidianMock.Notice);
  const seriesEvent1 = {
    ...mockEvent,
    id: 'occ-1',
    type: 'occurrence' as const,
    seriesMasterId: 'master-1',
  };
  const seriesEvent2 = {
    ...mockEvent,
    id: 'occ-2',
    subject: 'Standup Repeat',
    type: 'occurrence' as const,
    seriesMasterId: 'master-1',
  };
  const singleEvent = { ...mockEvent, id: 'single-1', subject: 'Other Event' };
  const deleteEventSeries = vi.fn().mockResolvedValue(undefined);
  const ctx = makeContext({
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
      getEvents: vi.fn().mockResolvedValue([seriesEvent1, seriesEvent2, singleEvent]),
      createEvent: vi.fn(),
      updateEvent: vi.fn().mockResolvedValue(undefined),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
      deleteEventSeries,
      moveEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppContextValue['calendarService'],
  });
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));

  await eventDetailModalCallbacks.onDeleteSeries!();

  expect(deleteEventSeries).toHaveBeenCalledWith('master-1');
  expect(NoticeSpy).toHaveBeenCalledWith('Series deleted');
  await waitFor(() => {
    expect(screen.queryByText('Standup')).not.toBeInTheDocument();
    expect(screen.queryByText('Standup Repeat')).not.toBeInTheDocument();
    expect(screen.getByText('Other Event')).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: the 5 new tests fail; existing tests pass.

- [ ] **Step 4: Implement `handleEventClick` changes in CalendarApp**

In `src/components/CalendarApp.tsx`, replace the `handleEventClick` function (around line 278):

```typescript
const handleEventClick = (event: M365Event) => {
  const calendar = calendars.find((c) => c.id === event.calendarId);
  const isSeries = event.type === 'occurrence' || event.type === 'exception';
  const isMaster = event.type === 'seriesMaster';
  const onDelete = calendar?.canEdit
    ? async () => {
        await calendarService.deleteEvent(event.id);
        setEvents((prev) => prev.filter(
          (e) => e.id !== event.id && e.seriesMasterId !== event.id,
        ));
        new Notice(isMaster ? 'Series deleted' : 'Event deleted');
      }
    : undefined;
  const onDeleteSeries = isSeries && calendar?.canEdit
    ? async () => {
        await calendarService.deleteEventSeries(event.seriesMasterId!);
        setEvents((prev) => prev.filter(
          (e) => e.seriesMasterId !== event.seriesMasterId && e.id !== event.seriesMasterId,
        ));
        new Notice('Series deleted');
      }
    : undefined;
  new EventDetailModal(
    app,
    event,
    async (patch, targetCalendarId) => {
      try {
        if (targetCalendarId !== event.calendarId) {
          await calendarService.moveEvent(event, targetCalendarId, patch);
        } else {
          await calendarService.updateEvent(event.id, patch);
        }
      } catch (e) {
        notifyError(e);
        throw e;
      }
    },
    () => void fetchAll({ reloadCalendars: false }),
    calendars,
    onDelete,
    onDeleteSeries,
  ).open();
};
```

Also add `deleteEventSeries` to the `calendarService` type usage. The `CalendarService` class now has this method, so TypeScript will pick it up automatically from the class definition — no additional type annotation needed in CalendarApp since it uses the concrete `CalendarService` type from context.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 6: Run typecheck and lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/CalendarApp.tsx tests/components/CalendarApp.test.tsx
git commit -m "feat: wire series-aware delete in CalendarApp handleEventClick"
```

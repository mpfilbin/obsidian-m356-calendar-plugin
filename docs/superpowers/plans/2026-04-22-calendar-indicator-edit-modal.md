# Calendar Indicator & Move in Edit Event Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a calendar name+color indicator to the Edit Event modal, with a dropdown to move the event to a different calendar on save.

**Architecture:** Three layers of change: (1) `CalendarService` gains a `moveEvent` method using the Graph move endpoint; (2) `EventDetailForm`/`EventDetailModal` gain a `calendars` prop with a color-swatch dropdown; (3) `CalendarApp` passes calendars into the modal and sequences move+update calls on save.

**Tech Stack:** TypeScript, React, Vitest, @testing-library/react, Microsoft Graph API

---

## File Map

| File | Change |
|------|--------|
| `src/services/CalendarService.ts` | Add `moveEvent(eventId, destinationCalendarId)` |
| `src/components/EventDetailModal.tsx` | Add `calendars` prop, calendar dropdown, update `onSave` signature |
| `src/components/CalendarApp.tsx` | Pass `calendars` to modal, sequence `moveEvent`+`updateEvent` in save callback |
| `styles.css` | Add `.m365-form-calendar-select-row` flex layout |
| `tests/services/CalendarService.test.ts` | Add `moveEvent` tests |
| `tests/components/EventDetailModal.test.tsx` | Add calendar dropdown tests; add `calendars` prop to existing renders |
| `tests/components/CalendarApp.test.tsx` | Capture `onSave`/`calendars` in mock; add move/pass-through tests |

---

## Task 1: Add `moveEvent` to `CalendarService`

**Files:**
- Modify: `src/services/CalendarService.ts`
- Test: `tests/services/CalendarService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append these three tests inside the `describe('CalendarService', ...)` block in `tests/services/CalendarService.test.ts`, after the `deleteEvent` tests:

```ts
// --- moveEvent ---

it('moveEvent posts to /me/events/{id}/move with destinationId', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  await service.moveEvent('evt1', 'cal2');
  expect(fetchMock).toHaveBeenCalledWith(
    'https://graph.microsoft.com/v1.0/me/events/evt1/move',
    expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({
        Authorization: 'Bearer token',
        'Content-Type': 'application/json',
      }),
    }),
  );
  const body = JSON.parse(fetchMock.mock.calls[0][1].body as string);
  expect(body).toEqual({ destinationId: 'cal2' });
});

it('moveEvent clears the cache on success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  await service.moveEvent('evt1', 'cal2');
  expect(cache.clearAll).toHaveBeenCalled();
});

it('moveEvent throws when Graph returns error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }));
  await expect(service.moveEvent('evt1', 'cal2')).rejects.toThrow('Failed to move event: Forbidden');
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
npx vitest run tests/services/CalendarService.test.ts
```

Expected: three new tests fail with `service.moveEvent is not a function`.

- [ ] **Step 3: Implement `moveEvent`**

Add the following method to `src/services/CalendarService.ts`, after `deleteEvent` and before `getEventsForCalendar`:

```ts
async moveEvent(eventId: string, destinationCalendarId: string): Promise<void> {
  const token = await this.auth.getValidToken();
  const response = await fetch(`${GRAPH_BASE}/me/events/${eventId}/move`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ destinationId: destinationCalendarId }),
  });
  if (!response.ok) throw new Error(`Failed to move event: ${response.statusText}`);
  await this.cache.clearAll();
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npx vitest run tests/services/CalendarService.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/CalendarService.ts tests/services/CalendarService.test.ts
git commit -m "feat: add moveEvent to CalendarService using Graph move endpoint"
```

---

## Task 2: Add calendar dropdown to `EventDetailForm` / `EventDetailModal`

**Files:**
- Modify: `src/components/EventDetailModal.tsx`
- Modify: `tests/components/EventDetailModal.test.tsx`
- Modify: `styles.css`

- [ ] **Step 1: Write new failing tests and update existing renders**

Replace the entire contents of `tests/components/EventDetailModal.test.tsx` with the following. The key changes from the current file are: (a) `calendars` prop added to all existing `render` calls; (b) new calendar-specific tests appended.

```tsx
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventDetailForm } from '../../src/components/EventDetailModal';
import { M365Event, M365Calendar } from '../../src/types';

const event: M365Event = {
  id: 'evt1',
  subject: 'Team Meeting',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'America/New_York' },
  end: { dateTime: '2026-04-04T10:00:00', timeZone: 'America/New_York' },
  calendarId: 'cal1',
  isAllDay: false,
  bodyPreview: 'Discuss Q2 plans',
  location: 'Conference Room A',
};

const calendars: M365Calendar[] = [
  { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true },
  { id: 'cal2', name: 'Personal', color: '#e3008c', isDefaultCalendar: false, canEdit: true },
  { id: 'cal3', name: 'Shared', color: '#00b294', isDefaultCalendar: false, canEdit: false },
];

describe('EventDetailForm', () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
    onCancel = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('pre-populates subject field from event', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Team Meeting');
  });

  it('pre-populates location field from event', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('Conference Room A');
  });

  it('pre-populates description from event bodyPreview', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Discuss Q2 plans');
  });

  it('calls onCancel when Cancel is clicked', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onSave with correct patch when OK is clicked', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    const titleInput = screen.getByLabelText('Title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated Meeting');
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0];
    expect(patch.subject).toBe('Updated Meeting');
  });

  it('shows inline error when onSave rejects', async () => {
    onSave.mockRejectedValue(new Error('Network error'));
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows validation error when subject is empty', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    const titleInput = screen.getByLabelText('Title');
    await userEvent.clear(titleInput);
    await userEvent.click(screen.getByText('OK'));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders All day checkbox reflecting event.isAllDay', () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />);
    const checkbox = screen.getByRole('checkbox', { name: /all day/i }) as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
  });

  it('renders All day checkbox checked for all-day events', () => {
    const allDayEvent = {
      ...event,
      isAllDay: true,
      start: { dateTime: '2026-04-04T00:00:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-04-05T00:00:00', timeZone: 'America/New_York' },
    };
    render(<EventDetailForm event={allDayEvent} onSave={onSave} onCancel={onCancel} calendars={[]} />);
    const checkbox = screen.getByRole('checkbox', { name: /all day/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('advances end date by one day when toggling All day on a same-day timed event', async () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-04-04');
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('2026-04-05');
  });

  it('restores correct local date when toggling All day off after it was on', async () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    const startInput = screen.getByLabelText('Start') as HTMLInputElement;
    expect(startInput.type).toBe('datetime-local');
    expect(startInput.value.startsWith('2026-04-04')).toBe(true);
  });

  it('keeps the original end date when toggling All day on a multi-day timed event', async () => {
    const multiDayEvent = {
      ...event,
      start: { dateTime: '2026-04-04T09:00:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-04-06T10:00:00', timeZone: 'America/New_York' },
    };
    render(<EventDetailForm event={multiDayEvent} onSave={onSave} onCancel={onCancel} calendars={[]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-04-04');
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('2026-04-06');
  });

  it('does not render a Delete button when onDelete is not provided', () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('renders a Delete button when onDelete is provided', () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows confirm UI and disables inputs when Delete is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('This will permanently delete the event.')).toBeInTheDocument();
    expect(screen.getByText('Delete event')).toBeInTheDocument();
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true);
  });

  it('returns to normal state when Cancel is clicked in confirm mode', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('This will permanently delete the event.')).not.toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('calls onDelete when Delete event button is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('shows inline error and resets confirm state when onDelete rejects', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Server error'));
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
    expect(screen.queryByText('This will permanently delete the event.')).not.toBeInTheDocument();
  });

  it('logs to console.error when onDelete rejects', async () => {
    const error = new Error('Server error');
    const onDelete = vi.fn().mockRejectedValue(error);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith('M365 Calendar:', error),
    );
  });

  // ── Calendar dropdown ──────────────────────────────────────────────────────

  it('does not render calendar field when calendars list is empty', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    expect(screen.queryByLabelText('Calendar')).not.toBeInTheDocument();
  });

  it('renders calendar dropdown with all calendars when provided', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    expect(screen.getByLabelText('Calendar')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Shared' })).toBeInTheDocument();
  });

  it('pre-selects the current event calendar in the dropdown', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    expect((screen.getByLabelText('Calendar') as HTMLSelectElement).value).toBe('cal1');
  });

  it('disables the calendar dropdown when the event calendar has canEdit false', () => {
    const readOnlyEvent = { ...event, calendarId: 'cal3' };
    render(
      <EventDetailForm event={readOnlyEvent} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    expect((screen.getByLabelText('Calendar') as HTMLSelectElement).disabled).toBe(true);
  });

  it('does not disable the calendar dropdown when the event calendar has canEdit true', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    expect((screen.getByLabelText('Calendar') as HTMLSelectElement).disabled).toBe(false);
  });

  it('marks canEdit=false options as disabled in the dropdown', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    const sharedOption = screen.getByRole('option', { name: 'Shared' }) as HTMLOptionElement;
    expect(sharedOption.disabled).toBe(true);
  });

  it('does not mark canEdit=true options as disabled', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    const personalOption = screen.getByRole('option', { name: 'Personal' }) as HTMLOptionElement;
    expect(personalOption.disabled).toBe(false);
  });

  it('passes the selected targetCalendarId as the second argument to onSave', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Calendar'), 'cal2');
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1]).toBe('cal2');
  });

  it('passes the original calendarId as targetCalendarId when calendar is not changed', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1]).toBe('cal1');
  });

  it('renders a color swatch next to the calendar dropdown', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    const row = document.querySelector('.m365-form-calendar-select-row');
    expect(row).not.toBeNull();
    const swatch = row!.querySelector('.m365-calendar-color-swatch') as HTMLElement | null;
    expect(swatch).not.toBeNull();
    expect(swatch!.style.backgroundColor).not.toBe('');
  });
});
```

- [ ] **Step 2: Run tests to confirm new tests fail**

```bash
npx vitest run tests/components/EventDetailModal.test.tsx
```

Expected: existing tests fail because `calendars` prop doesn't exist on `EventDetailFormProps` yet (TypeScript compilation error). New tests also fail.

- [ ] **Step 3: Update `EventDetailModal.tsx`**

Replace the entire contents of `src/components/EventDetailModal.tsx` with:

```tsx
import { App, Modal } from 'obsidian';
import React, { StrictMode, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365Event, M365Calendar, EventPatch } from '../types';
import { toDateOnly, toDateTimeLocal } from '../lib/datetime';

// ── Form ─────────────────────────────────────────────────────────────────────

interface EventDetailFormProps {
  event: M365Event;
  calendars: M365Calendar[];
  onSave: (patch: EventPatch, targetCalendarId: string) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}

export const EventDetailForm: React.FC<EventDetailFormProps> = ({
  event,
  calendars,
  onSave,
  onCancel,
  onDelete,
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
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const eventCalendar = calendars.find((c) => c.id === event.calendarId);
  const calendarDropdownDisabled = confirmingDelete || saving || !(eventCalendar?.canEdit ?? true);
  const selectedCalendar = calendars.find((c) => c.id === selectedCalendarId);

  const handleAllDayChange = (checked: boolean) => {
    setIsAllDay(checked);
    const parseStr = (s: string): Date => new Date(s.length === 10 ? `${s}T00:00` : s);
    const s = parseStr(startStr);
    const e = parseStr(endStr);
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

  const handleDelete = async () => {
    setDeleting(true);
    setError('');
    try {
      await onDelete!();
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
          disabled={confirmingDelete || saving}
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
          disabled={confirmingDelete || saving}
        />
      </div>
      <div className="m365-form-checkbox">
        <label>
          <input
            type="checkbox"
            checked={isAllDay}
            onChange={(e) => handleAllDayChange(e.target.checked)}
            disabled={confirmingDelete || saving}
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
          disabled={confirmingDelete || saving}
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-event-end">End</label>
        <input
          id="m365-event-end"
          type={isAllDay ? 'date' : 'datetime-local'}
          value={endStr}
          onChange={(e) => setEndStr(e.target.value)}
          disabled={confirmingDelete || saving}
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-event-description">Description</label>
        <textarea
          id="m365-event-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          disabled={confirmingDelete || saving}
        />
      </div>
      {confirmingDelete ? (
        <div className="m365-form-actions">
          <span>This will permanently delete the event.</span>
          <button onClick={() => setConfirmingDelete(false)} disabled={deleting}>
            Cancel
          </button>
          <button className="mod-warning" onClick={() => void handleDelete()} disabled={deleting}>
            {deleting ? 'Deleting…' : 'Delete event'}
          </button>
        </div>
      ) : (
        <div className="m365-form-actions">
          <button onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          {onDelete && (
            <button onClick={() => setConfirmingDelete(true)} disabled={saving}>
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
        />
      </StrictMode>,
    );
  }

  onClose(): void {
    this.root?.unmount();
  }
}
```

- [ ] **Step 4: Add CSS for the calendar select row**

Add the following to `styles.css`, after the `.m365-create-event-form .m365-form-field select` block (around line 432):

```css
.m365-form-calendar-select-row {
  display: flex;
  align-items: center;
  gap: var(--size-4-2);
}

.m365-form-calendar-select-row select {
  flex: 1;
  min-width: 0;
}
```

- [ ] **Step 5: Run tests to confirm all pass**

```bash
npx vitest run tests/components/EventDetailModal.test.tsx
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/EventDetailModal.tsx tests/components/EventDetailModal.test.tsx styles.css
git commit -m "feat: add calendar indicator and dropdown to EventDetailForm"
```

---

## Task 3: Wire CalendarApp to pass calendars and handle move

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Modify: `tests/components/CalendarApp.test.tsx`

- [ ] **Step 1: Update the `EventDetailModal` mock and `makeContext` in `CalendarApp.test.tsx`**

Replace the `eventDetailModalCallbacks` declaration, the `EventDetailModal` mock, and `makeContext` in `tests/components/CalendarApp.test.tsx` as follows.

Change the import at the top to include `EventPatch` and `M365Calendar`:
```ts
import type { NewEventInput, EventPatch, M365Calendar } from '../../src/types';
```

Replace the `eventDetailModalCallbacks` declaration (currently lines 14–16) with:
```ts
const eventDetailModalCallbacks = vi.hoisted(() => ({
  onDelete: undefined as (() => Promise<void>) | undefined,
  onSave: null as ((patch: EventPatch, targetCalendarId: string) => Promise<void>) | null,
  calendars: null as M365Calendar[] | null,
}));
```

Replace the `vi.mock('../../src/components/EventDetailModal', ...)` block (currently lines 18–31) with:
```ts
vi.mock('../../src/components/EventDetailModal', () => ({
  EventDetailModal: class {
    constructor(
      _app: unknown,
      _event: unknown,
      onSave: (patch: EventPatch, targetCalendarId: string) => Promise<void>,
      _onSaved: unknown,
      calendars: M365Calendar[],
      onDelete?: () => Promise<void>,
    ) {
      eventDetailModalCallbacks.onDelete = onDelete;
      eventDetailModalCallbacks.onSave = onSave;
      eventDetailModalCallbacks.calendars = calendars;
    }
    open() {}
  },
}));
```

Replace the `makeContext` function body so `calendarService` includes `moveEvent` and `updateEvent` with default mocks:
```ts
function makeContext(overrides: Partial<AppContextValue> = {}): AppContextValue {
  return {
    app: {} as AppContextValue['app'],
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
      getEvents: vi.fn().mockResolvedValue([mockEvent]),
      createEvent: vi.fn(),
      updateEvent: vi.fn().mockResolvedValue(undefined),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
      moveEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppContextValue['calendarService'],
    weatherService: {
      getWeatherForDates: vi.fn().mockResolvedValue(new Map()),
    } as unknown as AppContextValue['weatherService'],
    settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'] },
    saveSettings: vi.fn().mockResolvedValue(undefined),
    registerWeatherRefresh: vi.fn(),
    ...overrides,
  };
}
```

- [ ] **Step 2: Add the new failing tests to `CalendarApp.test.tsx`**

Append the following tests inside the `describe('CalendarApp', ...)` block, after the existing `onDelete` tests:

```ts
it('passes the full calendars list to EventDetailModal when an event is clicked', async () => {
  const ctx = makeContext();
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));
  expect(eventDetailModalCallbacks.calendars).toEqual([mockCalendar]);
});

it('calls moveEvent then updateEvent when onSave is invoked with a different calendar', async () => {
  const moveEvent = vi.fn().mockResolvedValue(undefined);
  const updateEvent = vi.fn().mockResolvedValue(undefined);
  const ctx = makeContext({
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
      getEvents: vi.fn().mockResolvedValue([mockEvent]),
      createEvent: vi.fn(),
      updateEvent,
      deleteEvent: vi.fn().mockResolvedValue(undefined),
      moveEvent,
    } as unknown as AppContextValue['calendarService'],
  });
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));
  await eventDetailModalCallbacks.onSave!({ subject: 'Standup' }, 'cal-2');
  expect(moveEvent).toHaveBeenCalledWith('evt-1', 'cal-2');
  expect(updateEvent).toHaveBeenCalledWith('evt-1', { subject: 'Standup' });
});

it('skips moveEvent when onSave is invoked with the same calendar', async () => {
  const moveEvent = vi.fn().mockResolvedValue(undefined);
  const updateEvent = vi.fn().mockResolvedValue(undefined);
  const ctx = makeContext({
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
      getEvents: vi.fn().mockResolvedValue([mockEvent]),
      createEvent: vi.fn(),
      updateEvent,
      deleteEvent: vi.fn().mockResolvedValue(undefined),
      moveEvent,
    } as unknown as AppContextValue['calendarService'],
  });
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));
  await eventDetailModalCallbacks.onSave!({ subject: 'Updated' }, 'cal-1');
  expect(moveEvent).not.toHaveBeenCalled();
  expect(updateEvent).toHaveBeenCalledWith('evt-1', { subject: 'Updated' });
});
```

- [ ] **Step 3: Run tests to confirm new tests fail**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: the three new tests fail. Existing tests may also fail due to the mock signature change and the missing `moveEvent` in the mock — that is expected at this step.

- [ ] **Step 4: Update `CalendarApp.handleEventClick`**

In `src/components/CalendarApp.tsx`, replace the `handleEventClick` function:

```ts
const handleEventClick = (event: M365Event) => {
  const calendar = calendars.find((c) => c.id === event.calendarId);
  const onDelete = calendar?.canEdit
    ? async () => {
        await calendarService.deleteEvent(event.id);
        setEvents((prev) => prev.filter((e) => e.id !== event.id));
        new Notice('Event deleted');
      }
    : undefined;
  new EventDetailModal(
    app,
    event,
    async (patch, targetCalendarId) => {
      try {
        if (targetCalendarId !== event.calendarId) {
          await calendarService.moveEvent(event.id, targetCalendarId);
        }
        await calendarService.updateEvent(event.id, patch);
      } catch (e) {
        notifyError(e);
        throw e;
      }
    },
    () => void fetchAll({ reloadCalendars: false }),
    calendars,
    onDelete,
  ).open();
};
```

- [ ] **Step 5: Run all tests to confirm everything passes**

```bash
npm test
```

Expected: all tests pass, including the three new CalendarApp tests, all EventDetailModal tests, and all CalendarService tests.

- [ ] **Step 6: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/CalendarApp.tsx tests/components/CalendarApp.test.tsx
git commit -m "feat: wire calendar move into CalendarApp and EventDetailModal"
```

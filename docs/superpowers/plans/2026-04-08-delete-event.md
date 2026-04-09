# Delete Event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the ability to delete a calendar event from the event detail modal, with inline two-phase confirmation and `canEdit` gating.

**Architecture:** Three-layer change — `CalendarService` gets a `deleteEvent` method calling the Graph DELETE endpoint; `EventDetailForm` gets an optional `onDelete` prop that adds a Delete button with inline confirm state; `CalendarApp.handleEventClick` wires up `onDelete` only when the event's calendar has `canEdit === true` and removes the event from local state on success.

**Tech Stack:** TypeScript, React, Microsoft Graph API, Vitest, @testing-library/react, Obsidian Plugin API

---

### Task 1: `CalendarService.deleteEvent`

**Files:**
- Modify: `src/services/CalendarService.ts`
- Modify: `tests/services/CalendarService.test.ts`

- [ ] **Step 1: Write three failing tests**

Add these three tests inside the existing `describe('CalendarService', ...)` block in `tests/services/CalendarService.test.ts`:

```ts
it('deleteEvent sends DELETE to /me/events/{id} with correct auth header', async () => {
  const fetchMock = vi.fn().mockResolvedValue({ ok: true });
  vi.stubGlobal('fetch', fetchMock);
  await service.deleteEvent('evt1');
  expect(fetchMock).toHaveBeenCalledWith(
    'https://graph.microsoft.com/v1.0/me/events/evt1',
    expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ Authorization: 'Bearer token' }),
    }),
  );
});

it('deleteEvent clears the cache on success', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
  await service.deleteEvent('evt1');
  expect(cache.clearAll).toHaveBeenCalled();
});

it('deleteEvent throws when Graph returns error', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
  await expect(service.deleteEvent('evt1')).rejects.toThrow('Failed to delete event: Not Found');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/CalendarService.test.ts
```

Expected: 3 failures — `service.deleteEvent is not a function`

- [ ] **Step 3: Implement `deleteEvent` in `CalendarService`**

Add this method to `src/services/CalendarService.ts` after `updateEvent`:

```ts
async deleteEvent(eventId: string): Promise<void> {
  const token = await this.auth.getValidToken();
  const response = await fetch(`${GRAPH_BASE}/me/events/${eventId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error(`Failed to delete event: ${response.statusText}`);
  this.cache.clearAll();
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/CalendarService.test.ts
```

Expected: all pass

- [ ] **Step 5: Commit**

```bash
git add src/services/CalendarService.ts tests/services/CalendarService.test.ts
git commit -m "feat: add CalendarService.deleteEvent"
```

---

### Task 2: `EventDetailForm` delete UI

**Files:**
- Modify: `src/components/EventDetailModal.tsx`
- Modify: `tests/components/EventDetailModal.test.tsx`

- [ ] **Step 1: Write failing tests**

Add these tests inside the existing `describe('EventDetailForm', ...)` block in `tests/components/EventDetailModal.test.tsx`. Add `onDelete` to the shared `beforeEach` setup — keep it `undefined` by default so existing tests are unaffected:

```ts
it('does not render a Delete button when onDelete is not provided', () => {
  render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} />);
  expect(screen.queryByText('Delete')).not.toBeInTheDocument();
});

it('renders a Delete button when onDelete is provided', () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
  expect(screen.getByText('Delete')).toBeInTheDocument();
});

it('shows confirm UI and disables inputs when Delete is clicked', async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
  await userEvent.click(screen.getByText('Delete'));
  expect(screen.getByText('This will permanently delete the event.')).toBeInTheDocument();
  expect(screen.getByText('Delete event')).toBeInTheDocument();
  expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true);
});

it('returns to normal state when Cancel is clicked in confirm mode', async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
  await userEvent.click(screen.getByText('Delete'));
  await userEvent.click(screen.getByText('Cancel'));
  expect(screen.queryByText('This will permanently delete the event.')).not.toBeInTheDocument();
  expect(screen.getByText('OK')).toBeInTheDocument();
});

it('calls onDelete when Delete event button is clicked', async () => {
  const onDelete = vi.fn().mockResolvedValue(undefined);
  render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
  await userEvent.click(screen.getByText('Delete'));
  await userEvent.click(screen.getByText('Delete event'));
  await waitFor(() => expect(onDelete).toHaveBeenCalled());
});

it('shows inline error and resets confirm state when onDelete rejects', async () => {
  const onDelete = vi.fn().mockRejectedValue(new Error('Server error'));
  render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
  await userEvent.click(screen.getByText('Delete'));
  await userEvent.click(screen.getByText('Delete event'));
  await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
  expect(screen.queryByText('This will permanently delete the event.')).not.toBeInTheDocument();
});

it('logs to console.error when onDelete rejects', async () => {
  const error = new Error('Server error');
  const onDelete = vi.fn().mockRejectedValue(error);
  render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
  await userEvent.click(screen.getByText('Delete'));
  await userEvent.click(screen.getByText('Delete event'));
  await waitFor(() =>
    expect(console.error).toHaveBeenCalledWith('M365 Calendar:', error),
  );
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/EventDetailModal.test.tsx
```

Expected: 7 new failures — `onDelete` prop not accepted, no Delete button rendered

- [ ] **Step 3: Update `EventDetailFormProps` and add new state**

Replace the `EventDetailFormProps` interface and component signature in `src/components/EventDetailModal.tsx`:

```ts
interface EventDetailFormProps {
  event: M365Event;
  onSave: (patch: EventPatch) => Promise<void>;
  onCancel: () => void;
  onDelete?: () => Promise<void>;
}

export const EventDetailForm: React.FC<EventDetailFormProps> = ({
  event,
  onSave,
  onCancel,
  onDelete,
}) => {
```

Add two new state variables after the existing state declarations (after `const [saving, setSaving] = useState(false)`):

```ts
const [confirmingDelete, setConfirmingDelete] = useState(false);
const [deleting, setDeleting] = useState(false);
```

- [ ] **Step 4: Add `handleDelete` function**

Add this after `handleSave` in `src/components/EventDetailModal.tsx`:

```ts
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
```

- [ ] **Step 5: Add `disabled` to all form inputs and replace the actions row**

In the JSX return, add `disabled={confirmingDelete || saving}` to each input and textarea. Then replace the existing `<div className="m365-form-actions">` block with:

```tsx
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
```

The full updated JSX return for `EventDetailForm`:

```tsx
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
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/components/EventDetailModal.test.tsx
```

Expected: all pass

- [ ] **Step 7: Commit**

```bash
git add src/components/EventDetailModal.tsx tests/components/EventDetailModal.test.tsx
git commit -m "feat: add delete button with inline confirmation to EventDetailForm"
```

---

### Task 3: `EventDetailModal` + `CalendarApp` wiring

**Files:**
- Modify: `src/components/EventDetailModal.tsx` (modal class constructor + `onOpen`)
- Modify: `src/components/CalendarApp.tsx` (`handleEventClick`)
- Modify: `tests/components/CalendarApp.test.tsx`

- [ ] **Step 1: Write failing tests**

Add a `vi.mock` for `EventDetailModal` and a `vi.hoisted` callback capture near the top of `tests/components/CalendarApp.test.tsx`, alongside the existing `CreateEventModal` mock. Add `deleteEvent` to the `makeContext` helper. Then add the new tests:

At the top of the file, alongside the existing `modalCallbacks` hoisted variable, add:

```ts
const eventDetailModalCallbacks = vi.hoisted(() => ({
  onDelete: undefined as (() => Promise<void>) | undefined,
}));
```

Add this mock alongside the existing `vi.mock` for `CreateEventModal`:

```ts
vi.mock('../../src/components/EventDetailModal', () => ({
  EventDetailModal: class {
    constructor(
      _app: unknown,
      _event: unknown,
      _onSave: unknown,
      _onSaved: unknown,
      onDelete?: () => Promise<void>,
    ) {
      eventDetailModalCallbacks.onDelete = onDelete;
    }
    open() {}
  },
}));
```

Update `makeContext` to include `deleteEvent` in the default service mock:

```ts
calendarService: {
  getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
  getEvents: vi.fn().mockResolvedValue([mockEvent]),
  createEvent: vi.fn(),
  updateEvent: vi.fn(),
  deleteEvent: vi.fn().mockResolvedValue(undefined),
} as unknown as AppContextValue['calendarService'],
```

Add these tests inside `describe('CalendarApp', ...)`:

```ts
it('passes onDelete to EventDetailModal when calendar canEdit is true', async () => {
  const ctx = makeContext();
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));
  expect(eventDetailModalCallbacks.onDelete).toBeDefined();
});

it('does not pass onDelete to EventDetailModal when calendar canEdit is false', async () => {
  const readOnlyCalendar = { ...mockCalendar, canEdit: false };
  const ctx = makeContext({
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([readOnlyCalendar]),
      getEvents: vi.fn().mockResolvedValue([mockEvent]),
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppContextValue['calendarService'],
  });
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));
  expect(eventDetailModalCallbacks.onDelete).toBeUndefined();
});

it('removes deleted event from state without re-fetching when onDelete resolves', async () => {
  const deleteEvent = vi.fn().mockResolvedValue(undefined);
  const getEvents = vi.fn().mockResolvedValue([mockEvent]);
  const ctx = makeContext({
    calendarService: {
      getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
      getEvents,
      createEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent,
    } as unknown as AppContextValue['calendarService'],
  });
  renderCalendarApp(ctx);
  await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
  await userEvent.click(screen.getByText('Standup'));

  // Invoke the captured onDelete callback directly
  await eventDetailModalCallbacks.onDelete!();

  expect(deleteEvent).toHaveBeenCalledWith('evt-1');
  expect(getEvents).toHaveBeenCalledTimes(1); // no re-fetch
  await waitFor(() => expect(screen.queryByText('Standup')).not.toBeInTheDocument());
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: 3 new failures — `EventDetailModal` mock not wired, `deleteEvent` not passed through

- [ ] **Step 3: Update `EventDetailModal` constructor and `onOpen`**

In `src/components/EventDetailModal.tsx`, update the `EventDetailModal` class:

```ts
export class EventDetailModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly event: M365Event,
    private readonly onSaveCallback: (patch: EventPatch) => Promise<void>,
    private readonly onSaved: () => void,
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
          onSave={async (patch) => {
            await this.onSaveCallback(patch);
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

- [ ] **Step 4: Update `handleEventClick` in `CalendarApp`**

Replace the `handleEventClick` function in `src/components/CalendarApp.tsx`:

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
    async (patch) => {
      try {
        await calendarService.updateEvent(event.id, patch);
      } catch (e) {
        notifyError(e);
        throw e;
      }
    },
    () => void fetchAll({ reloadCalendars: false }),
    onDelete,
  ).open();
};
```

- [ ] **Step 5: Run all tests**

```bash
npm test
```

Expected: all pass

- [ ] **Step 6: Type-check and lint**

```bash
npm run typecheck && npm run lint
```

Expected: no errors

- [ ] **Step 7: Commit**

```bash
git add src/components/EventDetailModal.tsx src/components/CalendarApp.tsx tests/components/CalendarApp.test.tsx
git commit -m "feat: wire delete event through CalendarApp and EventDetailModal"
```

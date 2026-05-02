import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import * as obsidianMock from '../../tests/__mocks__/obsidian';
import { CalendarApp } from '../../src/components/CalendarApp';
import { AppContext, AppContextValue } from '../../src/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { NewEventInput, EventPatch, M365Calendar } from '../../src/types';
import { M365TodoList, M365TodoItem } from '../../src/types';

// Capture the onSubmit callback passed to CreateEventModal so tests can invoke it directly.
const modalCallbacks = vi.hoisted(() => ({ onSubmit: null as ((calendarId: string, event: NewEventInput) => Promise<void>) | null }));

const eventDetailModalCallbacks = vi.hoisted(() => ({
  onDelete: undefined as (() => Promise<void>) | undefined,
  onSave: null as ((patch: EventPatch, targetCalendarId: string) => Promise<void>) | null,
  calendars: null as M365Calendar[] | null,
}));

const todoDetailModalCallbacks = vi.hoisted(() => ({
  onComplete: null as (() => void) | null,
}));

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

vi.mock('../../src/components/TodoDetailModal', () => ({
  TodoDetailModal: class {
    constructor(
      _app: unknown,
      _todo: unknown,
      _list: unknown,
      _todoService: unknown,
      onComplete: () => void,
    ) {
      todoDetailModalCallbacks.onComplete = onComplete;
    }
    open() {}
  },
}));

vi.mock('../../src/components/CreateEventModal', () => ({
  CreateEventModal: class {
    constructor(
      _app: unknown,
      _calendars: unknown,
      _defaultCalendarId: unknown,
      _initialDate: unknown,
      onSubmit: (calendarId: string, event: NewEventInput) => Promise<void>,
    ) {
      modalCallbacks.onSubmit = onSubmit;
    }
    open() {}
  },
}));

const createTaskModalCallbacks = vi.hoisted(() => ({
  onSubmit: null as ((listId: string, input: import('../../src/types').NewTaskInput, steps: string[]) => Promise<void>) | null,
}));

vi.mock('../../src/components/CreateTaskModal', () => ({
  CreateTaskModal: class {
    constructor(
      _app: unknown,
      _todoLists: unknown,
      _defaultListId: unknown,
      _initialDate: unknown,
      onSubmit: (listId: string, input: import('../../src/types').NewTaskInput, steps: string[]) => Promise<void>,
    ) {
      createTaskModalCallbacks.onSubmit = onSubmit;
    }
    open() {}
  },
}));

const mockCalendar = { id: 'cal-1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true };
const mockEvent = {
  id: 'evt-1',
  subject: 'Standup',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal-1',
  isAllDay: false,
};

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
    todoService: {
      getLists: vi.fn().mockResolvedValue([]),
      getTasks: vi.fn().mockResolvedValue([]),
      completeTask: vi.fn().mockResolvedValue(undefined),
      createTask: vi.fn().mockResolvedValue({
        id: 'new-task-1', title: 'New task', listId: 'list1',
        dueDate: '2026-04-15', importance: 'normal' as const,
      }),
      createChecklistItem: vi.fn().mockResolvedValue({ id: 'ci1', displayName: 'Step', isChecked: false }),
    } as unknown as AppContextValue['todoService'],
    settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'] },
    saveSettings: vi.fn().mockResolvedValue(undefined),
    registerWeatherRefresh: vi.fn(),
    ...overrides,
  };
}

function renderCalendarApp(ctx: AppContextValue) {
  return render(
    <AppContext.Provider value={ctx}>
      <CalendarApp />
    </AppContext.Provider>,
  );
}

describe('CalendarApp', () => {
  beforeEach(() => {
    // Pin the clock to April 2026 so mock events (2026-04-04) always fall in the
    // current month regardless of when CI runs. shouldAdvanceTime keeps real-time
    // passage working so waitFor / userEvent timeouts behave normally.
    vi.useFakeTimers({ shouldAdvanceTime: true });
    vi.setSystemTime(new Date('2026-04-15T12:00:00'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // sentinel reset so canEdit=false tests don't false-positive
    eventDetailModalCallbacks.onDelete = 'NOT_CALLED' as unknown as (() => Promise<void>) | undefined;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('fetches calendars and events on initial mount', async () => {
    const ctx = makeContext();
    renderCalendarApp(ctx);

    await waitFor(() => {
      expect(ctx.calendarService.getCalendars).toHaveBeenCalledTimes(1);
      expect(ctx.calendarService.getEvents).toHaveBeenCalledTimes(1);
    });
  });

  it('shows error banner (not refresh-failed indicator) when initial load fails', async () => {
    const ctx = makeContext({
      calendarService: {
        getCalendars: vi.fn().mockRejectedValue(new Error('Not authenticated')),
        getEvents: vi.fn().mockResolvedValue([]),
        createEvent: vi.fn(),
        updateEvent: vi.fn(),
      } as unknown as AppContextValue['calendarService'],
    });
    renderCalendarApp(ctx);

    // Initial load failure: error banner is shown
    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
    expect(screen.queryByTitle('Last refresh failed — click to retry')).not.toBeInTheDocument();
  });

  it('logs to the console when calendar load fails', async () => {
    const ctx = makeContext({
      calendarService: {
        getCalendars: vi.fn().mockRejectedValue(new Error('Not authenticated')),
        getEvents: vi.fn().mockResolvedValue([]),
        createEvent: vi.fn(),
        updateEvent: vi.fn(),
      } as unknown as AppContextValue['calendarService'],
    });
    renderCalendarApp(ctx);

    await waitFor(() => {
      expect(console.error).toHaveBeenCalledWith(
        'M365 Calendar:',
        expect.objectContaining({ message: 'Not authenticated' }),
      );
    });
  });

  it('retries getCalendars when Refresh is clicked after an auth error', async () => {
    const getCalendars = vi.fn()
      .mockRejectedValueOnce(new Error('Not authenticated'))
      .mockResolvedValue([mockCalendar]);
    const getEvents = vi.fn().mockResolvedValue([mockEvent]);
    const ctx = makeContext({
      calendarService: { getCalendars, getEvents, createEvent: vi.fn(), updateEvent: vi.fn() } as unknown as AppContextValue['calendarService'],
    });

    renderCalendarApp(ctx);

    // Initial load failure: error banner is shown
    await waitFor(() => expect(screen.getByText('Not authenticated')).toBeInTheDocument());
    expect(getCalendars).toHaveBeenCalledTimes(1);

    // Click Refresh to retry
    await userEvent.click(screen.getByText('↻'));

    await waitFor(() => {
      expect(getCalendars).toHaveBeenCalledTimes(2);
    });
    // Error banner cleared after successful retry
    expect(screen.queryByText('Not authenticated')).not.toBeInTheDocument();
  });

  it('injects created event into state from createEvent response without re-fetching', async () => {
    const newEvent = {
      id: 'evt-new',
      subject: 'New Meeting',
      start: { dateTime: '2026-04-04T10:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-04T11:00:00', timeZone: 'UTC' },
      calendarId: 'cal-1',
      isAllDay: false,
    };
    const createEvent = vi.fn().mockResolvedValue(newEvent);
    const getEvents = vi.fn().mockResolvedValue([mockEvent]);
    const ctx = makeContext({
      calendarService: {
        getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
        getEvents,
        createEvent,
        updateEvent: vi.fn(),
      } as unknown as AppContextValue['calendarService'],
    });

    renderCalendarApp(ctx);
    // Wait for the initial event to appear in the DOM — this guarantees fetchAll's
    // setEvents has committed before we trigger event creation (stronger than
    // checking getEvents call count, which doesn't wait for the state to settle).
    await screen.findByText('Standup');

    // Trigger create event modal via toolbar button
    await userEvent.click(screen.getByText('+ New event'));

    // Simulate form submission via the captured callback
    await modalCallbacks.onSubmit!('cal-1', {
      subject: 'New Meeting',
      start: new Date('2026-04-04T10:00:00'),
      end: new Date('2026-04-04T11:00:00'),
    });

    expect(createEvent).toHaveBeenCalledWith('cal-1', expect.objectContaining({ subject: 'New Meeting' }));
    // getEvents must NOT be called again — new event comes from createEvent return value
    expect(getEvents).toHaveBeenCalledTimes(1);
    // The new event appears in the calendar
    await waitFor(() => expect(screen.getByText('New Meeting')).toBeInTheDocument());
  });

  it('passes month-view date range with exclusive end (first of next month) to getEvents', async () => {
    const ctx = makeContext();
    renderCalendarApp(ctx);

    await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalled());

    const [, start, end] = (ctx.calendarService.getEvents as ReturnType<typeof vi.fn>).mock.calls[0];
    // start is the first day of the current month at midnight
    expect(start.getDate()).toBe(1);
    expect(start.getHours()).toBe(0);
    // end is the first day of the NEXT month (exclusive upper bound, not last day at midnight)
    expect(end.getDate()).toBe(1);
    expect(end.getMonth()).toBe((start.getMonth() + 1) % 12);
    expect(end.getHours()).toBe(0);
  });

  it('passes week-view date range spanning exactly 7 days to getEvents', async () => {
    const ctx = makeContext({
      settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'], defaultView: 'week' },
    });
    renderCalendarApp(ctx);

    await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalled());

    const [, start, end] = (ctx.calendarService.getEvents as ReturnType<typeof vi.fn>).mock.calls[0];
    // start is Sunday
    expect(start.getDay()).toBe(0);
    // end is the following Sunday — exactly 7 days later (exclusive upper bound, not Saturday at midnight)
    expect(end.getDay()).toBe(0);
    expect(end.getTime() - start.getTime()).toBe(7 * 24 * 60 * 60 * 1000);
  });

  it('does not re-fetch calendars on navigation after successful load', async () => {
    const ctx = makeContext();
    renderCalendarApp(ctx);

    await waitFor(() => expect(ctx.calendarService.getCalendars).toHaveBeenCalledTimes(1));

    // Navigate to next month
    await userEvent.click(screen.getByText('›'));

    await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalledTimes(2));

    // Calendars should still only have been fetched once
    expect(ctx.calendarService.getCalendars).toHaveBeenCalledTimes(1);
  });

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
    const NoticeSpy = vi.spyOn(obsidianMock, 'Notice').mockImplementation(function () {} as unknown as typeof obsidianMock.Notice);
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
    expect(NoticeSpy).toHaveBeenCalledWith('Event deleted');
    expect(getEvents).toHaveBeenCalledTimes(1); // no re-fetch
    await waitFor(() => expect(screen.queryByText('Standup')).not.toBeInTheDocument());
  });

  it('onDelete rejects when deleteEvent throws', async () => {
    const error = new Error('Graph error');
    const deleteEvent = vi.fn().mockRejectedValue(error);
    const ctx = makeContext({
      calendarService: {
        getCalendars: vi.fn().mockResolvedValue([mockCalendar]),
        getEvents: vi.fn().mockResolvedValue([mockEvent]),
        createEvent: vi.fn(),
        updateEvent: vi.fn(),
        deleteEvent,
      } as unknown as AppContextValue['calendarService'],
    });
    renderCalendarApp(ctx);
    await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Standup'));

    await expect(eventDetailModalCallbacks.onDelete!()).rejects.toThrow('Graph error');
  });

  it('passes the full calendars list to EventDetailModal when an event is clicked', async () => {
    const ctx = makeContext();
    renderCalendarApp(ctx);
    await waitFor(() => expect(screen.getByText('Standup')).toBeInTheDocument());
    await userEvent.click(screen.getByText('Standup'));
    expect(eventDetailModalCallbacks.calendars).toEqual([mockCalendar]);
  });

  it('calls moveEvent (not updateEvent) when onSave is invoked with a different calendar', async () => {
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
    const patch = { subject: 'Standup' };
    await eventDetailModalCallbacks.onSave!(patch, 'cal-2');
    expect(moveEvent).toHaveBeenCalledWith(mockEvent, 'cal-2', patch);
    expect(updateEvent).not.toHaveBeenCalled();
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

  it('clicking a day cell in month view navigates to day view for that date', async () => {
    const ctx = makeContext();
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByText('4'));

    await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalledTimes(2));
    const [, start, end] = (ctx.calendarService.getEvents as ReturnType<typeof vi.fn>).mock.calls[1];
    // Day view fetches exactly one day
    expect(end.getTime() - start.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(start.getDate()).toBe(4);
    expect(start.getHours()).toBe(0);
  });

  it('navigates forward one day when › is clicked in day view', async () => {
    const ctx = makeContext();
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalledTimes(1));

    await userEvent.click(screen.getByText('4'));
    await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalledTimes(2));
    const [, dayStart] = (ctx.calendarService.getEvents as ReturnType<typeof vi.fn>).mock.calls[1];

    await userEvent.click(screen.getByText('›'));
    await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalledTimes(3));
    const [, nextDayStart, nextDayEnd] = (ctx.calendarService.getEvents as ReturnType<typeof vi.fn>).mock.calls[2];

    expect(nextDayStart.getTime() - dayStart.getTime()).toBe(24 * 60 * 60 * 1000);
    expect(nextDayEnd.getTime() - nextDayStart.getTime()).toBe(24 * 60 * 60 * 1000);
  });

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

  it('calls weatherService.getWeatherForDates when weatherEnabled is true', async () => {
    const ctx = makeContext({
      settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'], weatherEnabled: true, weatherLocation: 'New York, US', openWeatherApiKey: 'key' },
    });
    renderCalendarApp(ctx);

    await waitFor(() => {
      expect(ctx.weatherService.getWeatherForDates).toHaveBeenCalled();
    });
  });

  it('does not call weatherService.getWeatherForDates when weatherEnabled is false', async () => {
    const ctx = makeContext({
      settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'], weatherEnabled: false },
    });
    renderCalendarApp(ctx);

    // Wait for calendar fetch to complete so we know the component mounted
    await waitFor(() => expect(ctx.calendarService.getEvents).toHaveBeenCalled());

    expect(ctx.weatherService.getWeatherForDates).not.toHaveBeenCalled();
  });

  describe('todo completion', () => {
    beforeEach(() => {
      // Notice is a persistent vi.fn() — clear call history so assertions don't see
      // calls from other tests in the suite.
      (obsidianMock.Notice as unknown as ReturnType<typeof vi.fn>).mockClear();
    });

    const mockTodoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };
    const mockTodo: M365TodoItem = {
      id: 'task1',
      title: 'Write quarterly report',
      listId: 'list1',
      dueDate: '2026-04-15',
      importance: 'normal',
    };

    function makeTodoContext(completeTask = vi.fn().mockResolvedValue(undefined)) {
      return makeContext({
        todoService: {
          getLists: vi.fn().mockResolvedValue([mockTodoList]),
          getTasks: vi.fn().mockResolvedValue([mockTodo]),
          completeTask,
        } as unknown as AppContextValue['todoService'],
        settings: {
          ...DEFAULT_SETTINGS,
          enabledCalendarIds: ['cal-1'],
          enabledTodoListIds: ['list1'],
        },
      });
    }

    it('removes the task from the calendar on successful completion', async () => {
      const ctx = makeTodoContext();
      renderCalendarApp(ctx);
      await screen.findByText('Write quarterly report');

      await userEvent.click(screen.getByLabelText('View task: Write quarterly report'));
      todoDetailModalCallbacks.onComplete!();

      await waitFor(() => {
        expect(ctx.todoService.completeTask).toHaveBeenCalledWith('list1', 'task1');
      });
      await waitFor(() => {
        expect(screen.queryByText('Write quarterly report')).not.toBeInTheDocument();
      });
    });

    it('shows an error toast and keeps the task visible when completion fails', async () => {
      const completeTask = vi.fn().mockRejectedValue(new Error('Network error'));
      const ctx = makeTodoContext(completeTask);
      renderCalendarApp(ctx);
      await screen.findByText('Write quarterly report');

      await userEvent.click(screen.getByLabelText('View task: Write quarterly report'));
      todoDetailModalCallbacks.onComplete!();

      await waitFor(() => {
        expect(obsidianMock.Notice).toHaveBeenCalledWith(
          expect.stringContaining('Network error'),
        );
      });
      expect(screen.getByText('Write quarterly report')).toBeInTheDocument();
    });

    it('dims the task pill while completion is in flight', async () => {
      let resolveComplete!: () => void;
      const completeTask = vi.fn().mockReturnValue(
        new Promise<void>((resolve) => { resolveComplete = resolve; }),
      );
      const ctx = makeTodoContext(completeTask);
      renderCalendarApp(ctx);
      await screen.findByText('Write quarterly report');

      await userEvent.click(screen.getByLabelText('View task: Write quarterly report'));
      todoDetailModalCallbacks.onComplete!();

      await waitFor(() => {
        const card = document.querySelector('.m365-todo-card') as HTMLElement;
        expect(card.style.opacity).toBe('0.4');
      });

      resolveComplete();
      await waitFor(() => {
        expect(screen.queryByText('Write quarterly report')).not.toBeInTheDocument();
      });
    });
  });

  it('renders the "+ New task" button', async () => {
    const ctx = makeContext();
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getCalendars).toHaveBeenCalled());
    expect(screen.getByText('+ New task')).toBeInTheDocument();
  });

  it('opens CreateTaskModal when "+ New task" is clicked', async () => {
    const ctx = makeContext({
      todoService: {
        getLists: vi.fn().mockResolvedValue([{ id: 'list1', displayName: 'Work', color: '#ef4444' }]),
        getTasks: vi.fn().mockResolvedValue([]),
        completeTask: vi.fn(),
        createTask: vi.fn().mockResolvedValue({
          id: 'new-task-1', title: 'New task', listId: 'list1',
          dueDate: '2026-04-15', importance: 'normal' as const,
        }),
        createChecklistItem: vi.fn().mockResolvedValue({ id: 'ci1', displayName: 'Step', isChecked: false }),
      } as unknown as AppContextValue['todoService'],
    });
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getCalendars).toHaveBeenCalled());

    await userEvent.click(screen.getByText('+ New task'));
    expect(createTaskModalCallbacks.onSubmit).not.toBeNull();
  });

  it('calls todoService.createTask and createChecklistItem on submit', async () => {
    const createTask = vi.fn().mockResolvedValue({
      id: 'new-task-1', title: 'Buy milk', listId: 'list1',
      dueDate: '2026-04-15', importance: 'normal' as const,
    });
    const createChecklistItem = vi.fn().mockResolvedValue({ id: 'ci1', displayName: 'Step one', isChecked: false });
    const ctx = makeContext({
      todoService: {
        getLists: vi.fn().mockResolvedValue([{ id: 'list1', displayName: 'Work', color: '#ef4444' }]),
        getTasks: vi.fn().mockResolvedValue([]),
        completeTask: vi.fn(),
        createTask,
        createChecklistItem,
      } as unknown as AppContextValue['todoService'],
    });
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getCalendars).toHaveBeenCalled());
    await userEvent.click(screen.getByText('+ New task'));

    await createTaskModalCallbacks.onSubmit!('list1', { title: 'Buy milk', dueDate: '2026-04-15' }, ['Step one']);

    expect(createTask).toHaveBeenCalledWith('list1', { title: 'Buy milk', dueDate: '2026-04-15' });
    expect(createChecklistItem).toHaveBeenCalledWith('list1', 'new-task-1', 'Step one');
  });

  it('calls notifyError and rethrows when createTask fails', async () => {
    const createTask = vi.fn().mockRejectedValue(new Error('Graph error'));
    const ctx = makeContext({
      todoService: {
        getLists: vi.fn().mockResolvedValue([{ id: 'list1', displayName: 'Work', color: '#ef4444' }]),
        getTasks: vi.fn().mockResolvedValue([]),
        completeTask: vi.fn(),
        createTask,
        createChecklistItem: vi.fn(),
      } as unknown as AppContextValue['todoService'],
    });
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getCalendars).toHaveBeenCalled());
    await userEvent.click(screen.getByText('+ New task'));

    await expect(
      createTaskModalCallbacks.onSubmit!('list1', { title: 'Buy milk', dueDate: '2026-04-15' }, []),
    ).rejects.toThrow('Graph error');

    expect(obsidianMock.Notice).toHaveBeenCalledWith(expect.stringContaining('Graph error'));
  });
});

const mockTodoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };
const mockTodo: M365TodoItem = {
  id: 'task1',
  title: 'Buy milk',
  listId: 'list1',
  dueDate: '2026-04-04',
  importance: 'normal',
};

describe('CalendarApp — todo integration', () => {
  it('calls todoService.getLists and getTasks on mount', async () => {
    const ctx = makeContext({
      settings: { ...DEFAULT_SETTINGS, enabledTodoListIds: ['list1'] },
      todoService: {
        getLists: vi.fn().mockResolvedValue([mockTodoList]),
        getTasks: vi.fn().mockResolvedValue([mockTodo]),
      } as unknown as AppContextValue['todoService'],
    });
    render(
      <AppContext.Provider value={ctx}>
        <CalendarApp />
      </AppContext.Provider>,
    );
    await waitFor(() => {
      expect(ctx.todoService.getLists).toHaveBeenCalledTimes(1);
      expect(ctx.todoService.getTasks).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call getTasks when no todo lists are enabled', async () => {
    const getTasks = vi.fn().mockResolvedValue([]);
    const ctx = makeContext({
      settings: { ...DEFAULT_SETTINGS, enabledTodoListIds: [] },
      todoService: {
        getLists: vi.fn().mockResolvedValue([mockTodoList]),
        getTasks,
      } as unknown as AppContextValue['todoService'],
    });
    render(
      <AppContext.Provider value={ctx}>
        <CalendarApp />
      </AppContext.Provider>,
    );
    await waitFor(() => {
      expect(ctx.todoService.getLists).toHaveBeenCalled();
    });
    expect(getTasks).not.toHaveBeenCalled();
  });

  it('saves settings when a todo list is toggled', async () => {
    const ctx = makeContext({
      settings: { ...DEFAULT_SETTINGS, enabledTodoListIds: [] },
      todoService: {
        getLists: vi.fn().mockResolvedValue([mockTodoList]),
        getTasks: vi.fn().mockResolvedValue([]),
      } as unknown as AppContextValue['todoService'],
    });
    render(
      <AppContext.Provider value={ctx}>
        <CalendarApp />
      </AppContext.Provider>,
    );
    await waitFor(() => screen.getByText('Work Tasks'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Work Tasks' }));
    await waitFor(() => {
      expect(ctx.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ enabledTodoListIds: ['list1'] }),
      );
    });
  });
});

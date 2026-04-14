import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import * as obsidianMock from '../../tests/__mocks__/obsidian';
import { CalendarApp } from '../../src/components/CalendarApp';
import { AppContext, AppContextValue } from '../../src/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { NewEventInput } from '../../src/types';

// Capture the onSubmit callback passed to CreateEventModal so tests can invoke it directly.
const modalCallbacks = vi.hoisted(() => ({ onSubmit: null as ((calendarId: string, event: NewEventInput) => Promise<void>) | null }));

const eventDetailModalCallbacks = vi.hoisted(() => ({
  onDelete: undefined as (() => Promise<void>) | undefined,
}));

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
      updateEvent: vi.fn(),
      deleteEvent: vi.fn().mockResolvedValue(undefined),
    } as unknown as AppContextValue['calendarService'],
    settings: { ...DEFAULT_SETTINGS, enabledCalendarIds: ['cal-1'] },
    saveSettings: vi.fn().mockResolvedValue(undefined),
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
    vi.spyOn(console, 'error').mockImplementation(() => {});
    // sentinel reset so canEdit=false tests don't false-positive
    eventDetailModalCallbacks.onDelete = 'NOT_CALLED' as unknown as (() => Promise<void>) | undefined;
  });

  afterEach(() => {
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
    await waitFor(() => expect(getEvents).toHaveBeenCalledTimes(1));

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
});

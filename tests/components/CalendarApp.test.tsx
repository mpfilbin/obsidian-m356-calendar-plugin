import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CalendarApp } from '../../src/components/CalendarApp';
import { AppContext, AppContextValue } from '../../src/context';
import { DEFAULT_SETTINGS } from '../../src/settings';
import type { NewEventInput } from '../../src/types';

// Capture the onSubmit callback passed to CreateEventModal so tests can invoke it directly.
const modalCallbacks = vi.hoisted(() => ({ onSubmit: null as ((calendarId: string, event: NewEventInput) => Promise<void>) | null }));

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

  it('shows error banner when calendar load fails', async () => {
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
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
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

    // Wait for initial error
    await waitFor(() => expect(screen.getByText('Not authenticated')).toBeInTheDocument());
    expect(getCalendars).toHaveBeenCalledTimes(1);

    // Click Refresh
    await userEvent.click(screen.getByText('↻'));

    await waitFor(() => {
      expect(getCalendars).toHaveBeenCalledTimes(2);
    });
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

    // Trigger handleDayClick to register the modal's onSubmit callback
    await userEvent.click(screen.getByText('4'));

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
});

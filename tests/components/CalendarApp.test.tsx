import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { CalendarApp } from '../../src/components/CalendarApp';
import { AppContext, AppContextValue } from '../../src/context';
import { DEFAULT_SETTINGS } from '../../src/settings';

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
      } as unknown as AppContextValue['calendarService'],
    });
    renderCalendarApp(ctx);

    await waitFor(() => {
      expect(screen.getByText('Not authenticated')).toBeInTheDocument();
    });
  });

  it('retries getCalendars when Refresh is clicked after an auth error', async () => {
    const getCalendars = vi.fn()
      .mockRejectedValueOnce(new Error('Not authenticated'))
      .mockResolvedValue([mockCalendar]);
    const getEvents = vi.fn().mockResolvedValue([mockEvent]);
    const ctx = makeContext({
      calendarService: { getCalendars, getEvents, createEvent: vi.fn() } as unknown as AppContextValue['calendarService'],
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

import React, { useState, useEffect, useCallback } from 'react';
import { M365Calendar, M365Event, M365CalendarSettings } from '../types';
import { Toolbar } from './Toolbar';
import { CalendarSelector } from './CalendarSelector';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { CreateEventModal } from './CreateEventModal';
import { useAppContext } from '../context';

type ViewType = 'month' | 'week';

function getDateRange(date: Date, view: ViewType): { start: Date; end: Date } {
  if (view === 'month') {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 0),
    };
  }
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  const saturday = new Date(sunday);
  saturday.setDate(sunday.getDate() + 6);
  return { start: sunday, end: saturday };
}

export const CalendarApp: React.FC = () => {
  const { app, calendarService, settings, saveSettings } = useAppContext();
  const [view, setView] = useState<ViewType>(settings.defaultView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendars, setCalendars] = useState<M365Calendar[]>([]);
  const [events, setEvents] = useState<M365Event[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>(settings.enabledCalendarIds);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchEvents = useCallback(async () => {
    if (enabledIds.length === 0) {
      setEvents([]);
      return;
    }
    setSyncing(true);
    setError(null);
    try {
      const { start, end } = getDateRange(currentDate, view);
      const fetched = await calendarService.getEvents(enabledIds, start, end);
      setEvents(fetched);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to fetch events');
    } finally {
      setSyncing(false);
    }
  }, [calendarService, enabledIds, currentDate, view]);

  // Load calendars once on mount
  useEffect(() => {
    calendarService
      .getCalendars()
      .then(setCalendars)
      .catch((e: Error) => setError(e.message));
  }, [calendarService]);

  // Fetch events whenever view, date, or enabled calendars change
  useEffect(() => {
    void fetchEvents();
  }, [fetchEvents]);

  // Background refresh
  useEffect(() => {
    const ms = settings.refreshIntervalMinutes * 60 * 1000;
    const interval = setInterval(() => void fetchEvents(), ms);
    return () => clearInterval(interval);
  }, [fetchEvents, settings.refreshIntervalMinutes]);

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    const d = new Date(currentDate);
    if (view === 'month') {
      d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1));
    } else {
      d.setDate(d.getDate() + (direction === 'next' ? 7 : -7));
    }
    setCurrentDate(d);
  };

  const handleToggleCalendar = async (calendarId: string) => {
    const next = enabledIds.includes(calendarId)
      ? enabledIds.filter((id) => id !== calendarId)
      : [...enabledIds, calendarId];
    setEnabledIds(next);
    const updated: M365CalendarSettings = { ...settings, enabledCalendarIds: next };
    await saveSettings(updated);
  };

  const handleDayClick = (date: Date) => {
    const modal = new CreateEventModal(
      app,
      calendars.filter((c) => enabledIds.includes(c.id)),
      settings.defaultCalendarId,
      date,
      async (calendarId, event) => {
        await calendarService.createEvent(calendarId, event);
        await fetchEvents();
      },
    );
    modal.open();
  };

  return (
    <div className="m365-calendar">
      {error && <div className="m365-calendar-error">{error}</div>}
      <Toolbar
        currentDate={currentDate}
        view={view}
        onViewChange={setView}
        onNavigate={handleNavigate}
        onRefresh={() => void fetchEvents()}
        syncing={syncing}
      />
      <div className="m365-calendar-body">
        <CalendarSelector
          calendars={calendars}
          enabledCalendarIds={enabledIds}
          onToggle={(id) => void handleToggleCalendar(id)}
        />
        <div className="m365-calendar-main">
          {view === 'month' ? (
            <MonthView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onDayClick={handleDayClick}
            />
          ) : (
            <WeekView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onDayClick={handleDayClick}
            />
          )}
        </div>
      </div>
    </div>
  );
};

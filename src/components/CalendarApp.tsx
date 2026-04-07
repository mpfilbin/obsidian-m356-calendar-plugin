import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Notice } from 'obsidian';
import { M365Calendar, M365Event } from '../types';
import { Toolbar } from './Toolbar';
import { CalendarSelector } from './CalendarSelector';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { CreateEventModal } from './CreateEventModal';
import { EventDetailModal } from './EventDetailModal';
import { useAppContext } from '../context';

type ViewType = 'month' | 'week';

function notifyError(e: unknown): void {
  const message = e instanceof Error ? e.message : 'An error occurred';
  console.error('M365 Calendar:', e);
  new Notice(`M365 Calendar: ${message}`);
}

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

  // Tracks whether calendars have been successfully loaded so navigation
  // doesn't re-fetch them. Reset to false on error so the next refresh retries.
  const calendarsLoadedRef = useRef(false);

  const fetchAll = useCallback(async (options: { reloadCalendars?: boolean; userInitiated?: boolean } = {}) => {
    setSyncing(true);
    setError(null);
    try {
      if (!calendarsLoadedRef.current || options.reloadCalendars) {
        const fetchedCalendars = await calendarService.getCalendars();
        setCalendars(fetchedCalendars);
        calendarsLoadedRef.current = true;
      }
      if (enabledIds.length > 0) {
        const { start, end } = getDateRange(currentDate, view);
        const fetched = await calendarService.getEvents(enabledIds, start, end);
        setEvents(fetched);
      } else {
        setEvents([]);
      }
    } catch (e) {
      calendarsLoadedRef.current = false;
      console.error('M365 Calendar:', e);
      if (options.userInitiated) notifyError(e);
      setError(e instanceof Error ? e.message : 'Failed to load calendar data');
    } finally {
      setSyncing(false);
    }
  }, [calendarService, enabledIds, currentDate, view]);

  // Initial load and re-fetch when view, date, or enabled calendars change
  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Background refresh — always reloads calendars in case token was refreshed
  useEffect(() => {
    const ms = settings.refreshIntervalMinutes * 60 * 1000;
    const interval = setInterval(() => void fetchAll({ reloadCalendars: true }), ms);
    return () => clearInterval(interval);
  }, [fetchAll, settings.refreshIntervalMinutes]);

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
    try {
      await saveSettings({ ...settings, enabledCalendarIds: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
      setEnabledIds(enabledIds);
    }
  };

  const handleDayClick = (date: Date) => {
    const enabledCalendars = calendars.filter((c) => enabledIds.includes(c.id));
    if (enabledCalendars.length === 0) return;
    const modal = new CreateEventModal(
      app,
      enabledCalendars,
      settings.defaultCalendarId,
      date,
      async (calendarId, event) => {
        try {
          await calendarService.createEvent(calendarId, event);
          await fetchAll();
        } catch (e) {
          notifyError(e);
          throw e;
        }
      },
    );
    modal.open();
  };

  const handleEventClick = (event: M365Event) => {
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
    ).open();
  };

  return (
    <div className="m365-calendar">
      {error && <div className="m365-calendar-error">{error}</div>}
      <Toolbar
        currentDate={currentDate}
        view={view}
        onViewChange={setView}
        onNavigate={handleNavigate}
        onNewEvent={() => handleDayClick(new Date())}
        onRefresh={() => void fetchAll({ reloadCalendars: true, userInitiated: true })}
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
              onEventClick={handleEventClick}
            />
          ) : (
            <WeekView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
            />
          )}
        </div>
      </div>
    </div>
  );
};

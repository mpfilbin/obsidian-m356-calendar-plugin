import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Notice } from 'obsidian';
import { M365Calendar, M365Event, DailyWeather } from '../types';
import { Toolbar } from './Toolbar';
import { CalendarSelector } from './CalendarSelector';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { CreateEventModal } from './CreateEventModal';
import { EventDetailModal } from './EventDetailModal';
import { useAppContext } from '../context';
import { toDateOnly } from '../lib/datetime';

type ViewType = 'month' | 'week' | 'day';

function notifyError(e: unknown): void {
  const message = e instanceof Error ? e.message : 'An error occurred';
  console.error('M365 Calendar:', e);
  new Notice(`M365 Calendar: ${message}`);
}

function getDatesInRange(start: Date, end: Date): string[] {
  const dates: string[] = [];
  const current = new Date(start);
  while (current < end) {
    dates.push(toDateOnly(current));
    current.setDate(current.getDate() + 1);
  }
  return dates;
}

function getDateRange(date: Date, view: ViewType): { start: Date; end: Date } {
  if (view === 'month') {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), 1),
      end: new Date(date.getFullYear(), date.getMonth() + 1, 1),
    };
  }
  if (view === 'day') {
    return {
      start: new Date(date.getFullYear(), date.getMonth(), date.getDate()),
      end: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1),
    };
  }
  // week — normalize to local midnight so cache keys are stable
  const sunday = new Date(date);
  sunday.setDate(date.getDate() - date.getDay());
  sunday.setHours(0, 0, 0, 0);
  const nextSunday = new Date(sunday);
  nextSunday.setDate(sunday.getDate() + 7);
  return { start: sunday, end: nextSunday };
}

export const CalendarApp: React.FC = () => {
  const { app, calendarService, weatherService, settings, saveSettings } = useAppContext();
  const [view, setView] = useState<ViewType>(settings.defaultView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendars, setCalendars] = useState<M365Calendar[]>([]);
  const [events, setEvents] = useState<M365Event[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>(settings.enabledCalendarIds);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [weather, setWeather] = useState<Map<string, DailyWeather | null>>(new Map());

  const calendarsLoadedRef = useRef(false);

  const fetchAll = useCallback(async (options: { reloadCalendars?: boolean; userInitiated?: boolean } = {}) => {
    setSyncing(true);
    if (options.userInitiated) setError(null);
    setRefreshFailed(false);
    let calendarsFetchAttempted = false;
    try {
      if (!calendarsLoadedRef.current || options.reloadCalendars) {
        calendarsFetchAttempted = true;
        calendarsLoadedRef.current = true;
        const fetchedCalendars = await calendarService.getCalendars();
        setCalendars(fetchedCalendars);
      }
      if (enabledIds.length > 0) {
        const { start, end } = getDateRange(currentDate, view);
        const bypassCache = !!options.reloadCalendars;
        const fetched = await calendarService.getEvents(enabledIds, start, end, bypassCache);
        setEvents(fetched);
      } else {
        setEvents([]);
      }
      if (options.userInitiated) setError(null);
    } catch (e) {
      if (calendarsFetchAttempted) calendarsLoadedRef.current = false;
      if (options.userInitiated) {
        notifyError(e);
        setError(e instanceof Error ? e.message : 'Failed to load calendar data');
      } else {
        console.error('M365 Calendar:', e);
        setRefreshFailed(true);
      }
    } finally {
      setSyncing(false);
    }
  }, [calendarService, enabledIds, currentDate, view]);

  const fetchWeather = useCallback(async () => {
    if (!settings.weatherEnabled) {
      setWeather(new Map());
      return;
    }
    const { start, end } = getDateRange(currentDate, view);
    const dates = getDatesInRange(start, end);
    try {
      const result = await weatherService.getWeatherForDates(dates);
      setWeather(result);
    } catch {
      setWeather(new Map(dates.map((d) => [d, null])));
    }
  }, [weatherService, settings.weatherEnabled, currentDate, view]);

  useEffect(() => {
    void fetchAll({ userInitiated: true });
  }, [fetchAll]);

  useEffect(() => {
    void fetchWeather();
  }, [fetchWeather]);

  useEffect(() => {
    const ms = settings.refreshIntervalMinutes * 60 * 1000;
    const interval = setInterval(() => {
      void fetchAll({ reloadCalendars: true });
      void fetchWeather();
    }, ms);
    return () => clearInterval(interval);
  }, [fetchAll, fetchWeather, settings.refreshIntervalMinutes]);

  const handleNavigate = (direction: 'prev' | 'next' | 'today') => {
    if (direction === 'today') {
      setCurrentDate(new Date());
      return;
    }
    const d = new Date(currentDate);
    if (view === 'month') {
      d.setMonth(d.getMonth() + (direction === 'next' ? 1 : -1));
    } else if (view === 'day') {
      d.setDate(d.getDate() + (direction === 'next' ? 1 : -1));
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

  const openCreateEventModal = (date: Date) => {
    const enabledCalendars = calendars.filter((c) => enabledIds.includes(c.id));
    if (enabledCalendars.length === 0) {
      new Notice('Enable at least one calendar to create events.');
      return;
    }
    new CreateEventModal(
      app,
      enabledCalendars,
      settings.defaultCalendarId,
      date,
      async (calendarId, event) => {
        try {
          const created = await calendarService.createEvent(calendarId, event);
          setEvents((prev) =>
            [...prev, created].sort(
              (a, b) => new Date(a.start.dateTime).getTime() - new Date(b.start.dateTime).getTime(),
            ),
          );
        } catch (e) {
          notifyError(e);
          throw e;
        }
      },
    ).open();
  };

  const handleDayClick = (date: Date) => {
    setView('day');
    setCurrentDate(date);
  };

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

  return (
    <div className="m365-calendar">
      {error && <div className="m365-calendar-error">{error}</div>}
      <Toolbar
        currentDate={currentDate}
        view={view}
        onViewChange={setView}
        onNavigate={handleNavigate}
        onNewEvent={() => openCreateEventModal(new Date())}
        onRefresh={() => void fetchAll({ reloadCalendars: true, userInitiated: true })}
        syncing={syncing}
        refreshFailed={refreshFailed}
      />
      <div className="m365-calendar-body">
        <CalendarSelector
          calendars={calendars}
          enabledCalendarIds={enabledIds}
          onToggle={(id) => void handleToggleCalendar(id)}
        />
        <div className="m365-calendar-main">
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
              weather={weather}
            />
          )}
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
              weather={weather}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              onTimeClick={openCreateEventModal}
              onEventClick={handleEventClick}
            />
          )}
        </div>
      </div>
    </div>
  );
};

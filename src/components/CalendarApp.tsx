import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Notice } from 'obsidian';
import { M365Calendar, M365Event, M365TodoList, M365TodoItem, DailyWeather, ViewType } from '../types';
import { Toolbar } from './Toolbar';
import { CalendarSelector } from './CalendarSelector';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { CreateEventModal } from './CreateEventModal';
import { EventDetailModal } from './EventDetailModal';
import { TodoDetailModal } from './TodoDetailModal';
import { useAppContext } from '../context';
import { getDateRange, getDatesInRange } from '../lib/datetime';

function notifyError(e: unknown): void {
  const message = e instanceof Error ? e.message : 'An error occurred';
  console.error('M365 Calendar:', e);
  new Notice(`M365 Calendar: ${message}`);
}

export const CalendarApp: React.FC = () => {
  const { app, calendarService, weatherService, todoService, settings, saveSettings, registerWeatherRefresh } = useAppContext();
  const [view, setView] = useState<ViewType>(settings.defaultView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [calendars, setCalendars] = useState<M365Calendar[]>([]);
  const [events, setEvents] = useState<M365Event[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>(settings.enabledCalendarIds);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(settings.sidebarCollapsed ?? false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const [weather, setWeather] = useState<Map<string, DailyWeather | null>>(new Map());

  const [todoLists, setTodoLists] = useState<M365TodoList[]>([]);
  const [todos, setTodos] = useState<M365TodoItem[]>([]);
  const [enabledTodoListIds, setEnabledTodoListIds] = useState<string[]>(settings.enabledTodoListIds);
  const todoListsLoadedRef = useRef(false);

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
  }, [weatherService, settings.weatherEnabled, settings.weatherLocation, settings.openWeatherApiKey, settings.weatherUnits, currentDate, view]);

  const fetchTodos = useCallback(async (options: { reloadLists?: boolean } = {}) => {
    let listFetchAttempted = false;
    try {
      if (!todoListsLoadedRef.current || options.reloadLists) {
        listFetchAttempted = true;
        todoListsLoadedRef.current = true;
        const lists = await todoService.getLists();
        setTodoLists(lists);
      }
      if (enabledTodoListIds.length > 0) {
        const { start, end } = getDateRange(currentDate, view);
        const tasks = await todoService.getTasks(enabledTodoListIds, start, end);
        setTodos(tasks);
      } else {
        setTodos([]);
      }
    } catch (e) {
      if (listFetchAttempted) todoListsLoadedRef.current = false;
      console.error('M365 Calendar todos:', e);
      setRefreshFailed(true);
    }
  }, [todoService, enabledTodoListIds, currentDate, view]);

  // Keep a ref to the latest fetchWeather so the registered callback never goes stale.
  const fetchWeatherRef = useRef(fetchWeather);
  useEffect(() => { fetchWeatherRef.current = fetchWeather; }, [fetchWeather]);
  useEffect(() => {
    registerWeatherRefresh(() => void fetchWeatherRef.current());
  }, [registerWeatherRefresh]);

  useEffect(() => {
    void fetchAll({ userInitiated: true });
  }, [fetchAll]);

  useEffect(() => {
    void fetchWeather();
  }, [fetchWeather]);

  useEffect(() => {
    void fetchTodos();
  }, [fetchTodos]);

  useEffect(() => {
    const ms = settings.refreshIntervalMinutes * 60 * 1000;
    const interval = setInterval(() => {
      void fetchAll({ reloadCalendars: true });
      void fetchWeather();
      void fetchTodos({ reloadLists: true });
    }, ms);
    return () => clearInterval(interval);
  }, [fetchAll, fetchWeather, fetchTodos, settings.refreshIntervalMinutes]);

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
      await saveSettings({ ...settings, enabledCalendarIds: next, sidebarCollapsed });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
      setEnabledIds(enabledIds);
    }
  };

  const handleToggleSidebar = async () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      await saveSettings({ ...settings, enabledCalendarIds: enabledIds, sidebarCollapsed: next });
    } catch (e) {
      setSidebarCollapsed(sidebarCollapsed);
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    }
  };

  const handleToggleTodoList = async (listId: string) => {
    const next = enabledTodoListIds.includes(listId)
      ? enabledTodoListIds.filter((id) => id !== listId)
      : [...enabledTodoListIds, listId];
    setEnabledTodoListIds(next);
    try {
      await saveSettings({ ...settings, enabledCalendarIds: enabledIds, sidebarCollapsed, enabledTodoListIds: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
      setEnabledTodoListIds(enabledTodoListIds);
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
      async (patch, targetCalendarId) => {
        try {
          if (targetCalendarId !== event.calendarId) {
            // moveEvent creates in the new calendar (with patch applied) then
            // deletes the original, so updateEvent on the old ID would 404.
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
    ).open();
  };

  const handleTodoClick = (todo: M365TodoItem) => {
    const list = todoLists.find((l) => l.id === todo.listId);
    if (!list) {
      console.warn('M365 Calendar: todo list not found for task', todo.id);
      return;
    }
    new TodoDetailModal(app, todo, list).open();
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
        onRefresh={() => {
          void fetchAll({ reloadCalendars: true, userInitiated: true });
          void fetchTodos({ reloadLists: true });
        }}
        syncing={syncing}
        refreshFailed={refreshFailed}
      />
      <div className="m365-calendar-body">
        <CalendarSelector
          calendars={calendars}
          enabledCalendarIds={enabledIds}
          onToggle={(id) => void handleToggleCalendar(id)}
          todoLists={todoLists}
          enabledTodoListIds={enabledTodoListIds}
          onToggleTodoList={(id) => void handleToggleTodoList(id)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => void handleToggleSidebar()}
        />
        <div className="m365-calendar-main">
          {view === 'month' && (
            <MonthView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              todos={todos}
              todoLists={todoLists}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
              onTodoClick={handleTodoClick}
              weather={weather}
            />
          )}
          {view === 'week' && (
            <WeekView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              todos={todos}
              todoLists={todoLists}
              onDayClick={handleDayClick}
              onEventClick={handleEventClick}
              onTodoClick={handleTodoClick}
              weather={weather}
              weatherUnits={settings.weatherUnits}
            />
          )}
          {view === 'day' && (
            <DayView
              currentDate={currentDate}
              events={events}
              calendars={calendars}
              todos={todos}
              todoLists={todoLists}
              onTimeClick={openCreateEventModal}
              onEventClick={handleEventClick}
              onTodoClick={handleTodoClick}
              weather={weather}
              weatherUnits={settings.weatherUnits}
            />
          )}
        </div>
      </div>
    </div>
  );
};

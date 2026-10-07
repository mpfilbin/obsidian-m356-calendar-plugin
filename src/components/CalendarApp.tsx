import React, { useState, useEffect, useRef } from 'react';
import { ViewType } from '../types';
import { Toolbar } from './Toolbar';
import { CalendarSelector } from './CalendarSelector';
import { MonthView } from './MonthView';
import { WeekView } from './WeekView';
import { DayView } from './DayView';
import { useAppContext } from '../context';
import { useEventsData } from '../hooks/useEventsData';
import { useTodosData } from '../hooks/useTodosData';
import { useWeather } from '../hooks/useWeather';
import { useCalendarActions } from '../hooks/useCalendarActions';
import { useReschedule } from '../hooks/useReschedule';
import { DragProvider } from '../DragContext';

export const CalendarApp: React.FC = () => {
  const { settings: initialSettings, saveSettings, subscribeSettings, subscribeResync } = useAppContext();
  const [settings, setSettings] = useState(initialSettings);
  const [view, setView] = useState<ViewType>(settings.defaultView);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [sidebarCollapsed, setSidebarCollapsed] = useState(settings.sidebarCollapsed ?? false);
  const [completingTodoIds, setCompletingTodoIds] = useState<Set<string>>(new Set());

  useEffect(() => subscribeSettings(setSettings), [subscribeSettings]);

  const eventsData = useEventsData(currentDate, view);
  const { calendars, events, setEvents, enabledIds, syncing, error, setError, authError, fetchAll } = eventsData;
  const todosData = useTodosData(currentDate, view, setError);
  const { todoLists, todos, setTodos, enabledTodoListIds, fetchTodos } = todosData;
  const { weather, fetchWeather } = useWeather(settings, currentDate, view);

  const actions = useCalendarActions({
    currentDate, view, calendars, enabledIds, setEvents,
    todoLists, enabledTodoListIds, setTodos, setCompletingTodoIds,
    refreshEvents: () => fetchAll(),
  });

  const reschedule = useReschedule({
    calendars, setEvents, setTodos, completingTodoIds, setCompletingTodoIds,
    refreshEvents: () => fetchAll(),
  });

  // "Purge calendar and task data" in settings: drop everything and refetch from scratch.
  // Keep a ref to the latest resync so the subscribed callback never goes stale.
  const { resync: resyncEvents } = eventsData;
  const { resync: resyncTodos } = todosData;
  const resyncRef = useRef<() => void>(() => {});
  useEffect(() => {
    resyncRef.current = () => {
      resyncEvents();
      resyncTodos();
    };
  }, [resyncEvents, resyncTodos]);
  useEffect(() => subscribeResync(() => resyncRef.current()), [subscribeResync]);

  useEffect(() => {
    const ms = settings.refreshIntervalMinutes * 60 * 1000;
    const interval = setInterval(() => {
      void fetchAll({ reloadCalendars: true });
      void fetchWeather();
      void fetchTodos();
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

  const handleToggleSidebar = async () => {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    try {
      await saveSettings({ sidebarCollapsed: next });
    } catch (e) {
      setSidebarCollapsed(sidebarCollapsed);
      setError(e instanceof Error ? e.message : 'Failed to save settings');
    }
  };

  const handleDayClick = (date: Date) => {
    setView('day');
    setCurrentDate(date);
  };

  return (
    <div className="m365-calendar">
      {(error ?? authError) && <div className="m365-calendar-error">{error ?? authError}</div>}
      <Toolbar
        currentDate={currentDate}
        view={view}
        onViewChange={setView}
        onNavigate={handleNavigate}
        onNewEvent={() => actions.openCreateEventModal(new Date())}
        onNewTask={() => actions.openCreateTaskModal(view === 'day' ? currentDate : new Date())}
        onRefresh={() => {
          void fetchAll({ reloadCalendars: true, userInitiated: true });
          void fetchTodos({ reloadLists: true });
        }}
        syncing={syncing}
        refreshFailed={eventsData.refreshFailed || todosData.refreshFailed}
      />
      <div className="m365-calendar-body">
        <CalendarSelector
          calendars={calendars}
          enabledCalendarIds={enabledIds}
          onToggle={(id) => void eventsData.toggleCalendar(id)}
          todoLists={todoLists}
          enabledTodoListIds={enabledTodoListIds}
          onToggleTodoList={(id) => void todosData.toggleTodoList(id)}
          collapsed={sidebarCollapsed}
          onToggleCollapse={() => void handleToggleSidebar()}
        />
        <DragProvider canDrag={reschedule.canDrag} isPending={reschedule.isPending} onDrop={reschedule.onDrop}>
          <div className="m365-calendar-main">
            {view === 'month' && (
              <MonthView
                currentDate={currentDate}
                events={events}
                calendars={calendars}
                todos={todos}
                todoLists={todoLists}
                onDayClick={handleDayClick}
                onDayContextMenu={actions.handleDayContextMenu}
                onEventClick={actions.handleEventClick}
                onEventContextMenu={actions.handleEventContextMenu}
                onTodoClick={actions.handleTodoClick}
                onTodoContextMenu={actions.handleTodoContextMenu}
                completingTodoIds={completingTodoIds}
                weather={weather}
                weatherUnits={settings.weatherUnits}
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
                onDayContextMenu={actions.handleDayContextMenu}
                onEventClick={actions.handleEventClick}
                onEventContextMenu={actions.handleEventContextMenu}
                onTodoClick={actions.handleTodoClick}
                onTodoContextMenu={actions.handleTodoContextMenu}
                completingTodoIds={completingTodoIds}
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
                onTimeClick={actions.openCreateEventModal}
                onEventClick={actions.handleEventClick}
                onEventContextMenu={actions.handleEventContextMenu}
                onTodoClick={actions.handleTodoClick}
                onTodoContextMenu={actions.handleTodoContextMenu}
                completingTodoIds={completingTodoIds}
                weather={weather}
                weatherUnits={settings.weatherUnits}
              />
            )}
          </div>
        </DragProvider>
      </div>
    </div>
  );
};

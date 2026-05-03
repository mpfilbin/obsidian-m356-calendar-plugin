import React, { useMemo, useRef, useEffect } from 'react';
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList, DayContextMenuPayload } from '../types';
import { EventCard } from './EventCard';
import { TodoCard } from './TodoCard';
import { TimelineColumn, HOURS_IN_DAY, PX_PER_MIN } from './TimelineColumn';
import { toDateOnly, getWeekDays } from '../lib/datetime';
import { useNow } from '../hooks/useNow';
import { usePopoverContext } from '../PopoverContext';

interface WeekViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onDayContextMenu?: (payload: DayContextMenuPayload, event: MouseEvent) => void;
  onEventClick?: (event: M365Event) => void;
  weather?: Map<string, DailyWeather | null>;
  weatherUnits?: 'imperial' | 'metric';
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}

export const WeekView: React.FC<WeekViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onDayContextMenu,
  onEventClick,
  weather,
  weatherUnits = 'imperial',
  todos = [],
  todoLists = [],
  onTodoClick,
  completingTodoIds,
}) => {
  const weekDays = getWeekDays(currentDate);
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const todoListMap = useMemo(() => new Map(todoLists.map((l) => [l.id, l])), [todoLists]);
  const todosByDate = useMemo(() => {
    const map = new Map<string, M365TodoItem[]>();
    for (const todo of todos) {
      if (!todo.dueDate) continue;
      if (!map.has(todo.dueDate)) map.set(todo.dueDate, []);
      map.get(todo.dueDate)!.push(todo);
    }
    return map;
  }, [todos]);
  const eventsByDate = useMemo(() => {
    const map = new Map<string, { allDay: M365Event[]; timed: M365Event[] }>();
    for (const event of events) {
      const key = event.start.dateTime.slice(0, 10);
      if (!map.has(key)) map.set(key, { allDay: [], timed: [] });
      const bucket = map.get(key)!;
      if (event.isAllDay) bucket.allDay.push(event);
      else bucket.timed.push(event);
    }
    return map;
  }, [events]);
  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();
  const { showPopover, hidePopover } = usePopoverContext();

  const isCurrentWeek = useMemo(() => {
    return weekDays.some(
      (d) =>
        d.getFullYear() === now.getFullYear() &&
        d.getMonth() === now.getMonth() &&
        d.getDate() === now.getDate(),
    );
  }, [weekDays, now]);

  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isCurrentWeek || !scrollRef.current) return;
    const container = scrollRef.current;
    const target = nowMinutes * PX_PER_MIN - container.clientHeight / 2;
    container.scrollTop = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
  }, []); // intentionally empty: fires once on mount. isCurrentWeek and nowMinutes are
  // read from the initial render closure — scroll targets the current time when
  // the view first opened, not on every tick.

  return (
    <div className="m365-calendar-week-view">
      {/* Day header row */}
      <div className="m365-week-column-headers">
        <div className="m365-week-gutter-spacer" />
        {weekDays.map((day) => {
          const isToday = day.toDateString() === now.toDateString();
          return (
            <div
              key={`header-${toDateOnly(day)}`}
              className={['m365-calendar-week-day', isToday ? 'today' : '']
                .filter(Boolean)
                .join(' ')}
              onClick={() => onDayClick(day)}
              onContextMenu={(e) => {
                e.preventDefault();
                onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
              }}
            >
              <div className="m365-calendar-week-day-header">
                <span className="m365-calendar-week-day-name">
                  {day.toLocaleDateString(undefined, { weekday: 'short' })}
                </span>
                <span
                  className={['m365-calendar-week-day-number', isToday ? 'today' : '']
                    .filter(Boolean)
                    .join(' ')}
                >
                  {day.getDate()}
                </span>
                {weather !== undefined && (() => {
                  const dateStr = toDateOnly(day);
                  const w = weather.get(dateStr);
                  if (w === undefined) return null;
                  if (w === null) return null;
                  return (
                    <div className="m365-weather-strip m365-weather-week">
                      <img
                        className="m365-weather-icon"
                        src={`https://openweathermap.org/img/wn/${w.condition.iconCode}.png`}
                        alt={w.condition.description}
                        width={24}
                        height={24}
                      />
                      <div className="m365-weather-temps">
                        <span className="m365-weather-current">{w.tempCurrent !== null ? `${Math.round(w.tempCurrent)}°${weatherUnits === 'imperial' ? 'F' : 'C'}` : '—'}</span>
                        <span className="m365-weather-high">H: {w.tempHigh !== null ? `${Math.round(w.tempHigh)}°${weatherUnits === 'imperial' ? 'F' : 'C'}` : '—'}</span>
                        <span className="m365-weather-low">L: {w.tempLow !== null ? `${Math.round(w.tempLow)}°${weatherUnits === 'imperial' ? 'F' : 'C'}` : '—'}</span>
                        <span className="m365-weather-precip">☂ {w.precipProbability !== null ? `${Math.round(w.precipProbability * 100)}%` : '—'}</span>
                      </div>
                    </div>
                  );
                })()}
              </div>
            </div>
          );
        })}
      </div>

      {/* All-day events row */}
      <div className="m365-week-allday-row">
        <div className="m365-week-allday-gutter" />
        {weekDays.map((day) => {
          const cellDateStr = toDateOnly(day);
          const allDayEvents = eventsByDate.get(cellDateStr)?.allDay ?? [];
          return (
            <div
              key={`allday-${cellDateStr}`}
              className="m365-week-allday-cell"
              onContextMenu={(e) => {
                e.preventDefault();
                onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
              }}
            >
              {allDayEvents.map((event) => {
                const cal = calendarMap.get(event.calendarId);
                if (!cal) return null;
                return (
                  <button
                    key={event.id}
                    type="button"
                    className="m365-event-click-btn"
                    aria-label={`Edit event: ${event.subject}`}
                    onMouseEnter={(e) => showPopover(event, cal, e.currentTarget.getBoundingClientRect())}
                    onMouseLeave={() => hidePopover()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onEventClick?.(event);
                    }}
                  >
                    <EventCard event={event} calendar={cal} />
                  </button>
                );
              })}
              {(todosByDate.get(cellDateStr) ?? []).map((todo) => {
                const list = todoListMap.get(todo.listId);
                if (!list) return null;
                return (
                  <button
                    key={todo.id}
                    type="button"
                    className="m365-event-click-btn"
                    aria-label={`View task: ${todo.title}`}
                    disabled={completingTodoIds?.has(todo.id) ?? false}
                    onClick={(e) => {
                      e.stopPropagation();
                      onTodoClick?.(todo);
                    }}
                  >
                    <TodoCard todo={todo} todoList={list} isCompleting={completingTodoIds?.has(todo.id) ?? false} />
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>

      {/* Timeline area */}
      <div className="m365-week-timeline-area" ref={scrollRef}>
        {isCurrentWeek && (
          <div
            className="m365-now-line"
            style={{ top: `${nowMinutes * PX_PER_MIN}px` }}
          />
        )}
        <div
          className="m365-week-time-gutter"
          style={{ position: 'relative', height: `${HOURS_IN_DAY * 60 * PX_PER_MIN}px` }}
        >
          {Array.from({ length: HOURS_IN_DAY }, (_, hour) => (
            <span
              key={hour}
              className="m365-day-view-hour-label"
              style={{ position: 'absolute', top: `${hour * 60 * PX_PER_MIN}px` }}
            >
              {String(hour).padStart(2, '0')}:00
            </span>
          ))}
        </div>
        {weekDays.map((day) => {
          const cellDateStr = toDateOnly(day);
          const timedEvents = eventsByDate.get(cellDateStr)?.timed ?? [];
          return (
            <TimelineColumn
              key={`timeline-${cellDateStr}`}
              date={day}
              events={timedEvents}
              calendars={calendars}
              onTimeClick={onDayClick}
              onTimeContextMenu={(dateTime, e) =>
                onDayContextMenu?.({ kind: 'timed', dateTime }, e)
              }
              onEventClick={onEventClick}
              data-testid={`m365-week-timeline-${cellDateStr}`}
            />
          );
        })}
      </div>
    </div>
  );
};

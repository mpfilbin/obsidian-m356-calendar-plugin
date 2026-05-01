import React, { useMemo, useRef, useEffect } from 'react';
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList } from '../types';
import { EventCard } from './EventCard';
import { TodoCard } from './TodoCard';
import { TimelineColumn, PX_PER_MIN } from './TimelineColumn';
import { useNow } from '../hooks/useNow';
import { usePopoverContext } from '../PopoverContext';
import { toDateOnly } from '../lib/datetime';

// Re-export layout utilities so existing importers (tests, etc.) are unaffected
export {
  layoutEvents,
  PX_PER_MIN,
  HOURS_IN_DAY,
  MIN_EVENT_HEIGHT,
  TIME_LABEL_WIDTH_PX,
  COLUMN_GAP_PX,
} from './TimelineColumn';
export type { LayoutEvent } from './TimelineColumn';

interface DayViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  weather?: Map<string, DailyWeather | null>;
  weatherUnits?: 'imperial' | 'metric';
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}

export const DayView: React.FC<DayViewProps> = ({
  currentDate,
  events,
  calendars,
  onTimeClick,
  onEventClick,
  weather,
  weatherUnits = 'imperial',
  todos = [],
  todoLists = [],
  onTodoClick,
  completingTodoIds,
}) => {
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const todoListMap = useMemo(() => new Map(todoLists.map((l) => [l.id, l])), [todoLists]);
  const todayStr = toDateOnly(currentDate);
  const allDayTodos = useMemo(
    () => todos.filter((t) => t.dueDate === todayStr),
    [todos, todayStr],
  );
  const allDayEvents = useMemo(() => events.filter((e) => e.isAllDay), [events]);
  const timedEvents = useMemo(() => events.filter((e) => !e.isAllDay), [events]);

  const { showPopover, hidePopover } = usePopoverContext();

  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const isToday = useMemo(() => {
    return (
      currentDate.getFullYear() === now.getFullYear() &&
      currentDate.getMonth() === now.getMonth() &&
      currentDate.getDate() === now.getDate()
    );
  }, [currentDate, now]);

  const dailyWeather = weather !== undefined ? weather.get(toDateOnly(currentDate)) : undefined;

  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isToday || !scrollRef.current || !timelineRef.current) return;
    const container = scrollRef.current;
    const timelineTop = timelineRef.current.offsetTop;
    const target = timelineTop + nowMinutes * PX_PER_MIN - container.clientHeight / 2;
    container.scrollTop = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
  }, []); // intentionally empty: fires once on mount. isToday and nowMinutes are
  // read from the initial render closure — that is the desired behaviour: scroll
  // to the current time as it was when the view first opened, not on every tick.

  return (
    <div className="m365-day-view" ref={scrollRef}>
      {(allDayEvents.length > 0 || allDayTodos.length > 0) && (
        <div className="m365-day-view-allday">
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
          {allDayTodos.map((todo) => {
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
      )}
      {dailyWeather != null && (
        <div className="m365-weather-banner">
          <img
            className="m365-weather-icon"
            src={`https://openweathermap.org/img/wn/${dailyWeather.condition.iconCode}.png`}
            alt={dailyWeather.condition.description}
            width={32}
            height={32}
          />
          <span className="m365-weather-current">
            {dailyWeather.tempCurrent !== null ? `${Math.round(dailyWeather.tempCurrent)}°${weatherUnits === 'imperial' ? 'F' : 'C'}` : '—'}
          </span>
          <span className="m365-weather-high">
            {dailyWeather.tempHigh !== null ? `H: ${Math.round(dailyWeather.tempHigh)}°${weatherUnits === 'imperial' ? 'F' : 'C'}` : <><span>H:</span> <span>—</span></>}
          </span>
          <span className="m365-weather-low">
            {dailyWeather.tempLow !== null ? `L: ${Math.round(dailyWeather.tempLow)}°${weatherUnits === 'imperial' ? 'F' : 'C'}` : <><span>L:</span> <span>—</span></>}
          </span>
          <span className="m365-weather-precip">
            {dailyWeather.precipProbability !== null ? `☂ ${Math.round(dailyWeather.precipProbability * 100)}%` : <><span>☂</span> <span>—</span></>}
          </span>
        </div>
      )}
      <div ref={timelineRef}>
        <TimelineColumn
          date={currentDate}
          events={timedEvents}
          calendars={calendars}
          onTimeClick={onTimeClick}
          onEventClick={onEventClick}
          showLabels={true}
          showNowLine={isToday}
          data-testid="m365-day-timeline"
        />
      </div>
    </div>
  );
};

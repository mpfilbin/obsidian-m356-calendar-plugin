import React, { useState, useRef, useEffect } from 'react';
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList, DayContextMenuPayload } from '../types';
import { EventCard } from './EventCard';
import { TodoCard } from './TodoCard';
import { toDateOnly, getDaysInMonthView } from '../lib/datetime';
import { usePopoverContext } from '../PopoverContext';
import { OverflowPopup } from './OverflowPopup';

interface MonthViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onDayContextMenu?: (payload: DayContextMenuPayload, event: MouseEvent) => void;
  onEventClick?: (event: M365Event) => void;
  maxEventsPerDay?: number;
  weather?: Map<string, DailyWeather | null>;
  weatherUnits?: 'imperial' | 'metric';
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onDayContextMenu,
  onEventClick,
  maxEventsPerDay = 4,
  weather,
  weatherUnits = 'imperial',
  todos = [],
  todoLists = [],
  onTodoClick,
  completingTodoIds,
}) => {
  const days = getDaysInMonthView(currentDate);
  const calendarMap = new Map(calendars.map((c) => [c.id, c]));
  const todoListMap = new Map(todoLists.map((l) => [l.id, l]));
  const today = new Date();
  const { showPopover, hidePopover } = usePopoverContext();

  const [overflowPopover, setOverflowPopover] = useState<{
    events: M365Event[];
    todos: M365TodoItem[];
    anchorRect: DOMRect;
  } | null>(null);
  const overflowTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (overflowTimerRef.current !== null) clearTimeout(overflowTimerRef.current);
    };
  }, []);

  return (
    <div className="m365-calendar-month-view">
      <div className="m365-calendar-month-header">
        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
          <div key={d} className="m365-calendar-day-header">
            {d}
          </div>
        ))}
      </div>
      <div className="m365-calendar-month-grid">
        {days.map((day) => {
          const isCurrentMonth = day.getMonth() === currentDate.getMonth();
          const isToday = day.toDateString() === today.toDateString();
          const cellDateStr = toDateOnly(day);
          const dayEvents = events
            .filter((e) => e.start.dateTime.slice(0, 10) === cellDateStr)
            .sort((a, b) => {
              if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
              if (a.isAllDay) return 0;
              return a.start.dateTime.localeCompare(b.start.dateTime);
            });
          const dayTodos = todos.filter((t) => t.dueDate === cellDateStr);
          const eventSlots = Math.min(dayEvents.length, maxEventsPerDay);
          const todoSlots = Math.min(dayTodos.length, maxEventsPerDay - eventSlots);
          const totalItems = dayEvents.length + dayTodos.length;
          return (
            <div
              key={`${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
              className={[
                'm365-calendar-day-cell',
                isCurrentMonth ? '' : 'other-month',
                isToday ? 'today' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              onClick={() => onDayClick(day)}
              onContextMenu={(e) => {
                e.preventDefault();
                onDayContextMenu?.({ kind: 'allday', date: day }, e.nativeEvent);
              }}
            >
              <div className="m365-month-day-header-row">
                <span className="m365-calendar-day-number">{day.getDate()}</span>
                {weather !== undefined && (() => {
                  const w = weather.get(cellDateStr);
                  if (!w) return null;
                  const unit = weatherUnits === 'imperial' ? '°F' : '°C';
                  const high = w.tempHigh !== null ? `↑ ${Math.round(w.tempHigh)}${unit}` : null;
                  const low = w.tempLow !== null ? `↓ ${Math.round(w.tempLow)}${unit}` : null;
                  const precip = w.precipProbability !== null ? `☂ ${Math.round(w.precipProbability * 100)}%` : null;
                  return (
                    <>
                      <img
                        className="m365-weather-icon m365-weather-month"
                        src={`https://openweathermap.org/img/wn/${w.condition.iconCode}.png`}
                        alt={w.condition.description}
                        width={24}
                        height={24}
                      />
                      {(high || low || precip) && (
                        <div className="m365-month-weather-details">
                          {high && <span>{high}</span>}
                          {low && <span>{low}</span>}
                          {precip && <span>{precip}</span>}
                        </div>
                      )}
                    </>
                  );
                })()}
              </div>
              {dayEvents.slice(0, eventSlots).map((event) => {
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
                    onContextMenu={(e) => e.stopPropagation()}
                  >
                    <EventCard event={event} calendar={cal} />
                  </button>
                );
              })}
              {dayTodos.slice(0, todoSlots).map((todo) => {
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
                    onContextMenu={(e) => e.stopPropagation()}
                  >
                    <TodoCard todo={todo} todoList={list} isCompleting={completingTodoIds?.has(todo.id) ?? false} />
                  </button>
                );
              })}
              {totalItems > maxEventsPerDay && (
                <button
                  type="button"
                  className="m365-month-overflow-btn"
                  aria-label={`Show ${totalItems - maxEventsPerDay} more items`}
                  onContextMenu={(e) => e.stopPropagation()}
                  onMouseEnter={(e) => {
                    if (overflowTimerRef.current !== null) clearTimeout(overflowTimerRef.current);
                    const rect = e.currentTarget.getBoundingClientRect();
                    overflowTimerRef.current = setTimeout(() => {
                      overflowTimerRef.current = null;
                      setOverflowPopover({
                        events: dayEvents.slice(eventSlots),
                        todos: dayTodos.slice(todoSlots),
                        anchorRect: rect,
                      });
                    }, 300);
                  }}
                  onMouseLeave={() => {
                    if (overflowTimerRef.current !== null) {
                      clearTimeout(overflowTimerRef.current);
                      overflowTimerRef.current = null;
                    }
                    setOverflowPopover(null);
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDayClick(day);
                  }}
                >
                  (+{totalItems - maxEventsPerDay})
                </button>
              )}
            </div>
          );
        })}
      </div>
      {overflowPopover && (
        <OverflowPopup
          events={overflowPopover.events}
          todos={overflowPopover.todos}
          calendarMap={calendarMap}
          todoListMap={todoListMap}
          anchorRect={overflowPopover.anchorRect}
        />
      )}
    </div>
  );
};

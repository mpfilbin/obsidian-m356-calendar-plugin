import React from 'react';
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList } from '../types';
import { EventCard } from './EventCard';
import { TodoCard } from './TodoCard';
import { toDateOnly, getDaysInMonthView } from '../lib/datetime';
import { usePopoverContext } from '../PopoverContext';

interface MonthViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  maxEventsPerDay?: number;
  weather?: Map<string, DailyWeather | null>;
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
  onEventClick,
  maxEventsPerDay = 6,
  weather,
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
          const dayEvents = events.filter(
            (e) => e.start.dateTime.slice(0, 10) === cellDateStr,
          );
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
            >
              <span className="m365-calendar-day-number">{day.getDate()}</span>
              {weather !== undefined && (() => {
                const w = weather.get(cellDateStr);
                if (w === undefined) return null;
                if (w === null) return null;
                return (
                  <img
                    className="m365-weather-icon m365-weather-month"
                    src={`https://openweathermap.org/img/wn/${w.condition.iconCode}.png`}
                    alt={w.condition.description}
                    width={24}
                    height={24}
                  />
                );
              })()}
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
                    onClick={(e) => {
                      e.stopPropagation();
                      onTodoClick?.(todo);
                    }}
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
                  onClick={(e) => {
                    e.stopPropagation();
                    onDayClick(day);
                  }}
                >
                  + {totalItems - maxEventsPerDay} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

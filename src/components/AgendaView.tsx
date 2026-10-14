import React, { useMemo } from 'react';
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList, DayContextMenuPayload } from '../types';
import { buildAgenda, AgendaItem } from '../lib/agenda';
import { getWeekDays, formatTime } from '../lib/datetime';
import { useNow } from '../hooks/useNow';
import { usePopoverContext } from '../PopoverContext';

interface AgendaViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  /** Step the visible week; omit to hide the previous/next controls. */
  onNavigate?: (direction: 'prev' | 'next') => void;
  onDayContextMenu?: (payload: DayContextMenuPayload, event: MouseEvent) => void;
  onEventClick?: (event: M365Event) => void;
  onEventContextMenu?: (event: M365Event, e: MouseEvent) => void;
  weather?: Map<string, DailyWeather | null>;
  weatherUnits?: 'imperial' | 'metric';
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  onTodoContextMenu?: (todo: M365TodoItem, e: MouseEvent) => void;
  completingTodoIds?: Set<string>;
}

function eventTimeLabel(item: Extract<AgendaItem, { kind: 'event' }>): string {
  if (item.allDay) return 'All day';
  const end = formatTime(new Date(item.event.end.dateTime));
  // Only the final day knows when the event actually ends; days it merely spans have no meaningful time.
  if (item.continues) return item.endsToday ? `Until ${end}` : 'All day';
  if (!item.endsToday) return `From ${formatTime(new Date(item.event.start.dateTime))}`;
  return `${formatTime(new Date(item.event.start.dateTime))} – ${end}`;
}

/** The current week (Sunday → Saturday) as a list grouped by day. */
export const AgendaView: React.FC<AgendaViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onNavigate,
  onDayContextMenu,
  onEventClick,
  onEventContextMenu,
  weather,
  weatherUnits = 'imperial',
  todos = [],
  todoLists = [],
  onTodoClick,
  onTodoContextMenu,
  completingTodoIds,
}) => {
  const { showPopover, hidePopover } = usePopoverContext();
  const now = useNow();
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const todoListMap = useMemo(() => new Map(todoLists.map((l) => [l.id, l])), [todoLists]);
  const days = useMemo(
    () => buildAgenda(getWeekDays(currentDate), events, todos),
    [currentDate, events, todos],
  );
  const weekRange = `${days[0].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} – ${days[6].date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}`;
  const unit = weatherUnits === 'imperial' ? 'F' : 'C';

  return (
    <div className="m365-agenda-view">
      {onNavigate && (
        <div className="m365-agenda-nav">
          <button type="button" aria-label="Previous week" onClick={() => onNavigate('prev')}>
            ‹ Previous week
          </button>
          <span className="m365-agenda-nav-range">{weekRange}</span>
          <button type="button" aria-label="Next week" onClick={() => onNavigate('next')}>
            Next week ›
          </button>
        </div>
      )}
      {days.map((day) => {
        const isToday = day.date.toDateString() === now.toDateString();
        const w = weather?.get(day.dateStr) ?? null;
        return (
          <section
            key={day.dateStr}
            className={`m365-agenda-day${isToday ? ' today' : ''}`}
            data-testid={`m365-agenda-day-${day.dateStr}`}
            onContextMenu={(e) => {
              e.preventDefault();
              onDayContextMenu?.({ kind: 'allday', date: day.date }, e.nativeEvent);
            }}
          >
            <header className="m365-agenda-day-header">
              <button
                type="button"
                className="m365-agenda-day-title"
                onClick={() => onDayClick(day.date)}
              >
                {day.date.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}
              </button>
              {w && (
                <span className="m365-agenda-weather">
                  <img
                    className="m365-weather-icon"
                    src={`https://openweathermap.org/img/wn/${w.condition.iconCode}.png`}
                    alt={w.condition.description}
                    width={24}
                    height={24}
                  />
                  {w.tempHigh !== null ? `H: ${Math.round(w.tempHigh)}°${unit}` : 'H: —'}
                  {' '}
                  {w.tempLow !== null ? `L: ${Math.round(w.tempLow)}°${unit}` : 'L: —'}
                </span>
              )}
            </header>
            {day.items.length === 0 ? (
              <div className="m365-agenda-empty">Nothing scheduled</div>
            ) : (
              <ul className="m365-agenda-list">
                {day.items.map((item) => {
                  if (item.kind === 'event') {
                    const cal = calendarMap.get(item.event.calendarId);
                    if (!cal) return null;
                    return (
                      <li key={`${item.event.id}-${day.dateStr}`}>
                        <button
                          type="button"
                          className="m365-event-click-btn m365-agenda-row"
                          aria-label={`Edit event: ${item.event.subject}`}
                          style={{ borderLeftColor: cal.color }}
                          onMouseEnter={(e) => showPopover(item.event, cal, e.currentTarget.getBoundingClientRect())}
                          onMouseLeave={() => hidePopover()}
                          onClick={() => onEventClick?.(item.event)}
                          onContextMenu={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            onEventContextMenu?.(item.event, e.nativeEvent);
                          }}
                        >
                          <span className="m365-agenda-time">{eventTimeLabel(item)}</span>
                          <span className="m365-agenda-title">{item.event.subject}</span>
                          <span className="m365-agenda-source">
                            <span
                              className="m365-calendar-color-swatch"
                              style={{ backgroundColor: cal.color }}
                              aria-hidden="true"
                            />
                            {cal.name}
                          </span>
                        </button>
                      </li>
                    );
                  }
                  const list = todoListMap.get(item.todo.listId);
                  if (!list) return null;
                  const completing = completingTodoIds?.has(item.todo.id) ?? false;
                  return (
                    <li key={`${item.todo.id}-${day.dateStr}`}>
                      <button
                        type="button"
                        className="m365-event-click-btn m365-agenda-row m365-agenda-task"
                        aria-label={`View task: ${item.todo.title}`}
                        style={{ borderLeftColor: list.color, ...(completing ? { opacity: 0.4 } : {}) }}
                        disabled={completing}
                        onClick={() => onTodoClick?.(item.todo)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          onTodoContextMenu?.(item.todo, e.nativeEvent);
                        }}
                      >
                        <span className="m365-agenda-time">Task</span>
                        <span className="m365-agenda-title">{item.todo.title}</span>
                        <span className="m365-agenda-source">
                          <span
                            className="m365-calendar-color-swatch"
                            style={{ backgroundColor: list.color }}
                            aria-hidden="true"
                          />
                          {list.displayName}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
};

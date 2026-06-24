import React, { useState, useRef, useEffect, useMemo } from 'react';
import { M365Event, M365Calendar, DailyWeather, M365TodoItem, M365TodoList, DayContextMenuPayload } from '../types';
import { EventCard } from './EventCard';
import { TodoCard } from './TodoCard';
import { SpanningBar } from './SpanningBar';
import { toDateOnly, getDaysInMonthView } from '../lib/datetime';
import { computeWeekSpanningLayout } from '../lib/spanningLayout';
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
  maxSpanningLanes?: number;
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
  maxSpanningLanes = 2,
  weather,
  weatherUnits = 'imperial',
  todos = [],
  todoLists = [],
  onTodoClick,
  completingTodoIds,
}) => {
  const days = getDaysInMonthView(currentDate);
  const weeks = Array.from({ length: days.length / 7 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const todoListMap = useMemo(() => new Map(todoLists.map((l) => [l.id, l])), [todoLists]);
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
        {weeks.map((week, weekIdx) => {
          const weekStart = week[0];
          const { segments } = computeWeekSpanningLayout(events, weekStart);
          const visibleSegments = segments.filter((s) => s.lane < maxSpanningLanes);

          const overflowCounts = new Array(7).fill(0) as number[];
          for (const seg of segments) {
            if (seg.lane >= maxSpanningLanes) {
              for (let col = seg.startCol; col < seg.startCol + seg.colSpan; col++) {
                overflowCounts[col]++;
              }
            }
          }

          const spanningIds = new Set(segments.map((s) => s.event.id));

          return (
            <div key={weekIdx} className="m365-month-week-row">
              <div className="m365-month-date-row">
                {week.map((day) => {
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const isToday = day.toDateString() === today.toDateString();
                  const cellDateStr = toDateOnly(day);
                  return (
                    <div
                      key={`hdr-${day.getFullYear()}-${day.getMonth()}-${day.getDate()}`}
                      className={[
                        'm365-month-date-cell',
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
                        {weather !== undefined &&
                          (() => {
                            const w = weather.get(cellDateStr);
                            if (!w) return null;
                            const unit = weatherUnits === 'imperial' ? '°F' : '°C';
                            const high =
                              w.tempHigh !== null
                                ? `↑ ${Math.round(w.tempHigh)}${unit}`
                                : null;
                            const low =
                              w.tempLow !== null
                                ? `↓ ${Math.round(w.tempLow)}${unit}`
                                : null;
                            const precip =
                              w.precipProbability !== null
                                ? `☂ ${Math.round(w.precipProbability * 100)}%`
                                : null;
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
                    </div>
                  );
                })}
              </div>
              <div className="m365-month-spanning-layer">
                {visibleSegments.map((seg) => {
                  const cal = calendarMap.get(seg.event.calendarId);
                  if (!cal) return null;
                  return (
                    <SpanningBar
                      key={seg.event.id}
                      event={seg.event}
                      calendar={cal}
                      segment={seg}
                      onEventClick={onEventClick}
                    />
                  );
                })}
              </div>
              <div className="m365-month-day-cells">
                {week.map((day, colIdx) => {
                  const isCurrentMonth = day.getMonth() === currentDate.getMonth();
                  const isToday = day.toDateString() === today.toDateString();
                  const cellDateStr = toDateOnly(day);
                  const dayEvents = events
                    .filter(
                      (e) =>
                        !spanningIds.has(e.id) &&
                        e.start.dateTime.slice(0, 10) === cellDateStr,
                    )
                    .sort((a, b) => {
                      if (a.isAllDay !== b.isAllDay) return a.isAllDay ? -1 : 1;
                      if (a.isAllDay) return 0;
                      return a.start.dateTime.localeCompare(b.start.dateTime);
                    });
                  const dayTodos = todos.filter((t) => t.dueDate === cellDateStr);
                  const eventSlots = Math.min(dayEvents.length, maxEventsPerDay);
                  const todoSlots = Math.min(dayTodos.length, maxEventsPerDay - eventSlots);
                  const totalItems = dayEvents.length + dayTodos.length;
                  const spanningOverflow = overflowCounts[colIdx];
                  const singleDayOverflow = Math.max(0, totalItems - maxEventsPerDay);
                  const totalOverflow = spanningOverflow + singleDayOverflow;
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
                      <div className="m365-day-events-list">
                        {dayEvents.slice(0, eventSlots).map((event) => {
                          const cal = calendarMap.get(event.calendarId);
                          if (!cal) return null;
                          return (
                            <button
                              key={event.id}
                              type="button"
                              className="m365-event-click-btn"
                              aria-label={`Edit event: ${event.subject}`}
                              onMouseEnter={(e) =>
                                showPopover(
                                  event,
                                  cal,
                                  e.currentTarget.getBoundingClientRect(),
                                )
                              }
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
                              <TodoCard
                                todo={todo}
                                todoList={list}
                                isCompleting={completingTodoIds?.has(todo.id) ?? false}
                              />
                            </button>
                          );
                        })}
                      </div>
                      {totalOverflow > 0 && (
                        <button
                          type="button"
                          className="m365-month-overflow-btn"
                          aria-label={`Show ${totalOverflow} more items`}
                          onContextMenu={(e) => e.stopPropagation()}
                          onMouseEnter={(e) => {
                            if (overflowTimerRef.current !== null)
                              clearTimeout(overflowTimerRef.current);
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
                          (+{totalOverflow})
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
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

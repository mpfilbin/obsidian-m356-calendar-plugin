import React from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';
import { toDateOnly } from '../lib/datetime';
import { usePopoverContext } from '../PopoverContext';

interface MonthViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  maxEventsPerDay?: number;
}

function getDaysInMonthView(date: Date): Date[] {
  const year = date.getFullYear();
  const month = date.getMonth();
  const firstDay = new Date(year, month, 1);
  const lastDay = new Date(year, month + 1, 0);
  const days: Date[] = [];

  // Leading days from previous month
  for (let i = firstDay.getDay(); i > 0; i--) {
    days.push(new Date(year, month, 1 - i));
  }
  // Days in current month
  for (let d = 1; d <= lastDay.getDate(); d++) {
    days.push(new Date(year, month, d));
  }
  // Trailing days to complete the last week
  let trailingDay = 1;
  while (days.length % 7 !== 0) {
    days.push(new Date(year, month + 1, trailingDay++));
  }
  return days;
}

export const MonthView: React.FC<MonthViewProps> = ({
  currentDate,
  events,
  calendars,
  onDayClick,
  onEventClick,
  maxEventsPerDay = 6,
}) => {
  const days = getDaysInMonthView(currentDate);
  const calendarMap = new Map(calendars.map((c) => [c.id, c]));
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
              {dayEvents.slice(0, maxEventsPerDay).map((event) => {
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
              {dayEvents.length > maxEventsPerDay && (
                <button
                  type="button"
                  className="m365-month-overflow-btn"
                  aria-label={`Show ${dayEvents.length - maxEventsPerDay} more events`}
                  onClick={(e) => {
                    e.stopPropagation();
                    onDayClick(day);
                  }}
                >
                  + {dayEvents.length - maxEventsPerDay} more
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};

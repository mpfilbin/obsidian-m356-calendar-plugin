import React from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';

interface MonthViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
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
}) => {
  const days = getDaysInMonthView(currentDate);
  const calendarMap = new Map(calendars.map((c) => [c.id, c]));
  const today = new Date();

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
          const dayEvents = events.filter((e) => {
            const eventDateStr = e.start.dateTime.slice(0, 10); // 'YYYY-MM-DD'
            const cellDateStr = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
            return eventDateStr === cellDateStr;
          });
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
              {dayEvents.map((event) => {
                const cal = calendarMap.get(event.calendarId);
                if (!cal) return null;
                return <EventCard key={event.id} event={event} calendar={cal} />;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
};

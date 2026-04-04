import React from 'react';
import { M365Event, M365Calendar } from '../types';

interface EventCardProps {
  event: M365Event;
  calendar: M365Calendar;
}

export const EventCard: React.FC<EventCardProps> = ({ event, calendar }) => {
  const startTime = new Date(event.start.dateTime);
  const timeLabel = event.isAllDay
    ? 'All day'
    : startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  return (
    <div
      className="m365-calendar-event-card"
      style={{ borderLeftColor: calendar.color }}
      title={event.subject}
    >
      <span className="m365-calendar-event-time">{timeLabel}</span>
      <span className="m365-calendar-event-title">{event.subject}</span>
    </div>
  );
};

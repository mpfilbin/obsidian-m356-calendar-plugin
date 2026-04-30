import React from 'react';
import { M365Event, M365Calendar } from '../types';
import { formatTime } from '../lib/datetime';

interface EventCardProps {
  event: M365Event;
  calendar: M365Calendar;
  onClick?: () => void;
}

export const EventCard: React.FC<EventCardProps> = ({ event, calendar, onClick }) => {
  const startTime = new Date(event.start.dateTime);
  const timeLabel = event.isAllDay
    ? 'All day'
    : formatTime(startTime);

  return (
    <div
      className="m365-calendar-event-card"
      style={{
        backgroundColor: `${calendar.color}26`,
        border: `1px solid ${calendar.color}`,
        color: calendar.color,
      }}
      title={event.subject}
      onClick={onClick}
    >
      <span className="m365-calendar-event-time">{timeLabel}</span>
      <span className="m365-calendar-event-title">{event.subject}</span>
    </div>
  );
};

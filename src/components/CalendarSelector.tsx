import React from 'react';
import { M365Calendar } from '../types';

interface CalendarSelectorProps {
  calendars: M365Calendar[];
  enabledCalendarIds: string[];
  onToggle: (calendarId: string) => void;
}

export const CalendarSelector: React.FC<CalendarSelectorProps> = ({
  calendars,
  enabledCalendarIds,
  onToggle,
}) => {
  return (
    <div className="m365-calendar-selector">
      {calendars.map((calendar) => (
        <div key={calendar.id} className="m365-calendar-selector-item">
          <input
            type="checkbox"
            id={`cal-${calendar.id}`}
            checked={enabledCalendarIds.includes(calendar.id)}
            onChange={() => onToggle(calendar.id)}
          />
          <span
            className="m365-calendar-color-swatch"
            style={{ backgroundColor: calendar.color }}
          />
          <label htmlFor={`cal-${calendar.id}`}>{calendar.name}</label>
        </div>
      ))}
    </div>
  );
};

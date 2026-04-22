import React from 'react';
import { M365Calendar } from '../types';

interface CalendarSelectorProps {
  calendars: M365Calendar[];
  enabledCalendarIds: string[];
  onToggle: (calendarId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const CalendarSelector: React.FC<CalendarSelectorProps> = ({
  calendars,
  enabledCalendarIds,
  onToggle,
  collapsed,
  onToggleCollapse,
}) => {
  if (collapsed) {
    return (
      <div className="m365-calendar-selector m365-calendar-selector--collapsed">
        <button
          className="m365-calendar-selector-toggle"
          onClick={onToggleCollapse}
          aria-label="Expand calendar list"
        >
          &#x25B6;
        </button>
      </div>
    );
  }

  return (
    <div className="m365-calendar-selector">
      <div className="m365-calendar-selector-header">
        <span className="m365-calendar-selector-label">Calendars</span>
        <button
          className="m365-calendar-selector-toggle"
          onClick={onToggleCollapse}
          aria-label="Collapse calendar list"
        >
          &#x25C0;
        </button>
      </div>
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

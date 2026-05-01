import React from 'react';
import { M365Calendar, M365TodoList } from '../types';

interface CalendarSelectorProps {
  calendars: M365Calendar[];
  enabledCalendarIds: string[];
  onToggle: (calendarId: string) => void;
  todoLists?: M365TodoList[];
  enabledTodoListIds?: string[];
  onToggleTodoList?: (listId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const CalendarSelector: React.FC<CalendarSelectorProps> = ({
  calendars,
  enabledCalendarIds,
  onToggle,
  todoLists = [],
  enabledTodoListIds = [],
  onToggleTodoList,
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
      {todoLists.length > 0 && (
        <>
          <div className="m365-calendar-selector-header m365-calendar-selector-header--tasks">
            <span className="m365-calendar-selector-label">Tasks</span>
          </div>
          {todoLists.map((list) => (
            <div key={list.id} className="m365-calendar-selector-item">
              <input
                type="checkbox"
                id={`todo-${list.id}`}
                checked={enabledTodoListIds.includes(list.id)}
                onChange={() => onToggleTodoList?.(list.id)}
              />
              <span
                className="m365-calendar-color-swatch"
                style={{ backgroundColor: list.color }}
              />
              <label htmlFor={`todo-${list.id}`}>{list.displayName}</label>
            </div>
          ))}
        </>
      )}
    </div>
  );
};

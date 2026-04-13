import React, { useMemo } from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';
import { TimelineColumn } from './TimelineColumn';

// Re-export layout utilities so existing importers (tests, etc.) are unaffected
export {
  layoutEvents,
  PX_PER_MIN,
  HOURS_IN_DAY,
  MIN_EVENT_HEIGHT,
  TIME_LABEL_WIDTH_PX,
  COLUMN_GAP_PX,
} from './TimelineColumn';
export type { LayoutEvent } from './TimelineColumn';

interface DayViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
}

export const DayView: React.FC<DayViewProps> = ({
  currentDate,
  events,
  calendars,
  onTimeClick,
  onEventClick,
}) => {
  const calendarMap = useMemo(() => new Map(calendars.map((c) => [c.id, c])), [calendars]);
  const allDayEvents = useMemo(() => events.filter((e) => e.isAllDay), [events]);
  const timedEvents = useMemo(() => events.filter((e) => !e.isAllDay), [events]);

  return (
    <div className="m365-day-view">
      {allDayEvents.length > 0 && (
        <div className="m365-day-view-allday">
          {allDayEvents.map((event) => {
            const cal = calendarMap.get(event.calendarId);
            if (!cal) return null;
            return (
              <button
                key={event.id}
                type="button"
                className="m365-event-click-btn"
                aria-label={`Edit event: ${event.subject}`}
                onClick={(e) => {
                  e.stopPropagation();
                  onEventClick?.(event);
                }}
              >
                <EventCard event={event} calendar={cal} />
              </button>
            );
          })}
        </div>
      )}
      <TimelineColumn
        date={currentDate}
        events={timedEvents}
        calendars={calendars}
        onTimeClick={onTimeClick}
        onEventClick={onEventClick}
        showLabels={true}
        data-testid="m365-day-timeline"
      />
    </div>
  );
};

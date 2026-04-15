import React, { useMemo, useRef, useEffect } from 'react';
import { M365Event, M365Calendar } from '../types';
import { EventCard } from './EventCard';
import { TimelineColumn, PX_PER_MIN } from './TimelineColumn';
import { useNow } from '../hooks/useNow';

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

  const now = useNow();
  const nowMinutes = now.getHours() * 60 + now.getMinutes();

  const isToday = useMemo(() => {
    return (
      currentDate.getFullYear() === now.getFullYear() &&
      currentDate.getMonth() === now.getMonth() &&
      currentDate.getDate() === now.getDate()
    );
  }, [currentDate, now]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isToday || !scrollRef.current || !timelineRef.current) return;
    const container = scrollRef.current;
    const timelineTop = timelineRef.current.offsetTop;
    const target = timelineTop + nowMinutes * PX_PER_MIN - container.clientHeight / 2;
    container.scrollTop = Math.max(0, Math.min(target, container.scrollHeight - container.clientHeight));
  }, []); // intentionally empty: fires once on mount. isToday and nowMinutes are
  // read from the initial render closure — that is the desired behaviour: scroll
  // to the current time as it was when the view first opened, not on every tick.

  return (
    <div className="m365-day-view" ref={scrollRef}>
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
      <div ref={timelineRef}>
        <TimelineColumn
          date={currentDate}
          events={timedEvents}
          calendars={calendars}
          onTimeClick={onTimeClick}
          onEventClick={onEventClick}
          showLabels={true}
          showNowLine={isToday}
          data-testid="m365-day-timeline"
        />
      </div>
    </div>
  );
};

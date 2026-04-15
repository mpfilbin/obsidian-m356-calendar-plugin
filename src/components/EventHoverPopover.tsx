import React from 'react';
import { M365Event, M365Calendar } from '../types';

interface EventHoverPopoverProps {
  event: M365Event;
  calendar: M365Calendar;
  anchorRect: DOMRect;
}

export const POPOVER_WIDTH = 280;
export const GAP = 8;

export const EventHoverPopover: React.FC<EventHoverPopoverProps> = ({
  event,
  calendar,
  anchorRect,
}) => {
  const wouldOverflow = anchorRect.right + GAP + POPOVER_WIDTH > window.innerWidth;
  const left = wouldOverflow
    ? anchorRect.left - GAP - POPOVER_WIDTH
    : anchorRect.right + GAP;

  const startTime = new Date(event.start.dateTime);
  const endTime = new Date(event.end.dateTime);
  const timeRange = event.isAllDay
    ? 'All day'
    : `${startTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} – ${endTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;

  return (
    <div
      className="m365-event-hover-popover"
      style={{ position: 'fixed', top: `${anchorRect.top}px`, left: `${left}px`, pointerEvents: 'none' }}
    >
      <div className="m365-popover-subject" style={{ color: calendar.color }}>
        {event.subject}
      </div>
      <div className="m365-popover-time">{timeRange}</div>
      {event.location && (
        <div className="m365-popover-location">{event.location}</div>
      )}
      {event.bodyPreview && (
        <div className="m365-popover-body">{event.bodyPreview}</div>
      )}
      {event.webLink && (
        <div className="m365-popover-weblink">Open in Outlook</div>
      )}
    </div>
  );
};

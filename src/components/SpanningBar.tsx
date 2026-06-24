import React from 'react';
import { M365Event, M365Calendar } from '../types';
import { SpanningSegment } from '../lib/spanningLayout';
import { formatTime } from '../lib/datetime';
import { usePopoverContext } from '../PopoverContext';

interface SpanningBarProps {
  event: M365Event;
  calendar: M365Calendar;
  segment: SpanningSegment;
  onEventClick?: (event: M365Event) => void;
}

export const SpanningBar: React.FC<SpanningBarProps> = ({
  event,
  calendar,
  segment,
  onEventClick,
}) => {
  const { showPopover, hidePopover } = usePopoverContext();
  const { color } = calendar;

  const bgColor = event.isAllDay ? `${color}1a` : `${color}26`;
  const borderColor = event.isAllDay ? `${color}80` : color;

  const classes = [
    'm365-spanning-bar',
    event.isAllDay ? 'm365-spanning-bar--allday' : 'm365-spanning-bar--timed',
    segment.continuesLeft ? 'continues-left' : '',
    segment.continuesRight ? 'continues-right' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <button
      type="button"
      className={classes}
      style={{
        gridColumn: `${segment.startCol + 1} / span ${segment.colSpan}`,
        gridRow: segment.lane + 1,
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
        color: borderColor,
      }}
      aria-label={`Edit event: ${event.subject}`}
      onMouseEnter={(e) =>
        showPopover(event, calendar, e.currentTarget.getBoundingClientRect())
      }
      onMouseLeave={() => hidePopover()}
      onClick={(e) => {
        e.stopPropagation();
        onEventClick?.(event);
      }}
      onContextMenu={(e) => e.stopPropagation()}
    >
      {!event.isAllDay && (
        <span className="m365-spanning-bar-start-time">
          {formatTime(new Date(event.start.dateTime))}
        </span>
      )}
      <span className="m365-spanning-bar-title">{event.subject}</span>
      {!event.isAllDay && (
        <span className="m365-spanning-bar-end-time">
          {formatTime(new Date(event.end.dateTime))}
        </span>
      )}
    </button>
  );
};

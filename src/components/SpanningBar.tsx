import React from 'react';
import { M365Event, M365Calendar } from '../types';
import { SpanningSegment } from '../lib/spanningLayout';
import { formatTime } from '../lib/datetime';
import { usePopoverContext } from '../PopoverContext';
import { useDragContext } from '../DragContext';
import { useDragSource } from '../hooks/useDragDrop';
import { addDaysToDateOnly, toDateOnly } from '../lib/datetime';

interface SpanningBarProps {
  event: M365Event;
  calendar: M365Calendar;
  segment: SpanningSegment;
  /** First day (Sunday) of the week row this bar is drawn in; needed to know which day was grabbed. */
  weekStart?: Date;
  onEventClick?: (event: M365Event) => void;
  onEventContextMenu?: (event: M365Event, e: MouseEvent) => void;
}

export const SpanningBar: React.FC<SpanningBarProps> = ({
  event,
  calendar,
  segment,
  weekStart,
  onEventClick,
  onEventContextMenu,
}) => {
  const { showPopover, hidePopover } = usePopoverContext();
  const { color } = calendar;
  const dragSource = useDragSource();
  const dnd = useDragContext();

  const bgColor = event.isAllDay ? `${color}1a` : `${color}26`;
  const borderColor = event.isAllDay ? `${color}80` : color;

  const classes = [
    'm365-spanning-bar',
    event.isAllDay ? 'm365-spanning-bar--allday' : 'm365-spanning-bar--timed',
    segment.continuesLeft ? 'continues-left' : '',
    segment.continuesRight ? 'continues-right' : '',
    dnd.isPending(event.id) ? 'm365-drag-pending' : '',
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
      {...dragSource(
        { kind: 'event', event, grabbedDate: event.start.dateTime.slice(0, 10), grabOffsetMin: 0 },
        (e) => {
          // Work out which day of the bar is under the pointer, so dropping it back where it was is a no-op.
          const rect = e.currentTarget.getBoundingClientRect();
          const dayWidth = (rect.width || 1) / segment.colSpan;
          const col = segment.startCol + Math.min(segment.colSpan - 1, Math.max(0, Math.floor((e.clientX - rect.left) / dayWidth)));
          const grabbedDate = weekStart
            ? addDaysToDateOnly(toDateOnly(weekStart), col)
            : event.start.dateTime.slice(0, 10);
          return { kind: 'event', event, grabbedDate, grabOffsetMin: 0 };
        },
      )}
      onMouseEnter={(e) =>
        showPopover(event, calendar, e.currentTarget.getBoundingClientRect())
      }
      onMouseLeave={() => hidePopover()}
      onClick={(e) => {
        e.stopPropagation();
        onEventClick?.(event);
      }}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onEventContextMenu?.(event, e.nativeEvent);
      }}
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

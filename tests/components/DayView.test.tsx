import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { layoutEvents, DayView } from '../../src/components/DayView';
import { M365Event } from '../../src/types';
import { M365Calendar } from '../../src/types';

function makeEvent(id: string, startISO: string, endISO: string): M365Event {
  return {
    id,
    subject: id,
    start: { dateTime: startISO, timeZone: 'UTC' },
    end: { dateTime: endISO, timeZone: 'UTC' },
    calendarId: 'cal1',
    isAllDay: false,
  };
}

describe('layoutEvents', () => {
  it('returns empty array for no events', () => {
    expect(layoutEvents([])).toEqual([]);
  });

  it('single event gets column 0, columnCount 1', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T10:00:00');
    const result = layoutEvents([a]);
    expect(result).toEqual([{ event: a, column: 0, columnCount: 1 }]);
  });

  it('two non-overlapping events each get columnCount 1', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T10:00:00');
    const b = makeEvent('b', '2026-04-09T11:00:00', '2026-04-09T12:00:00');
    const result = layoutEvents([a, b]);
    expect(result.find((r) => r.event.id === 'a')).toMatchObject({ column: 0, columnCount: 1 });
    expect(result.find((r) => r.event.id === 'b')).toMatchObject({ column: 0, columnCount: 1 });
  });

  it('two overlapping events get columnCount 2 and different columns', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T10:00:00');
    const b = makeEvent('b', '2026-04-09T09:30:00', '2026-04-09T10:30:00');
    const result = layoutEvents([a, b]);
    const ra = result.find((r) => r.event.id === 'a')!;
    const rb = result.find((r) => r.event.id === 'b')!;
    expect(ra.columnCount).toBe(2);
    expect(rb.columnCount).toBe(2);
    expect(ra.column).toBe(0);
    expect(ra.column).not.toBe(rb.column);
  });

  it('three-way overlapping events get columnCount 3 and all different columns', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T11:00:00');
    const b = makeEvent('b', '2026-04-09T09:00:00', '2026-04-09T11:00:00');
    const c = makeEvent('c', '2026-04-09T09:00:00', '2026-04-09T11:00:00');
    const result = layoutEvents([a, b, c]);
    expect(result.every((r) => r.columnCount === 3)).toBe(true);
    expect(new Set(result.map((r) => r.column)).size).toBe(3);
  });

  it('partial overlap chain: A overlaps B, B overlaps C, A does not overlap C — A and C share a column', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T09:45:00');
    const b = makeEvent('b', '2026-04-09T09:30:00', '2026-04-09T10:15:00');
    const c = makeEvent('c', '2026-04-09T10:00:00', '2026-04-09T10:45:00');
    const result = layoutEvents([a, b, c]);
    const ra = result.find((r) => r.event.id === 'a')!;
    const rb = result.find((r) => r.event.id === 'b')!;
    const rc = result.find((r) => r.event.id === 'c')!;
    expect(ra.column).toBe(rc.column);
    expect(rb.column).not.toBe(ra.column);
    expect(ra.columnCount).toBe(2);
    expect(rb.columnCount).toBe(2);
    expect(rc.columnCount).toBe(2);
  });

  it('adjacent events (one ends when next starts) are not overlapping', () => {
    const a = makeEvent('a', '2026-04-09T09:00:00', '2026-04-09T10:00:00');
    const b = makeEvent('b', '2026-04-09T10:00:00', '2026-04-09T11:00:00');
    const result = layoutEvents([a, b]);
    expect(result.find((r) => r.event.id === 'a')).toMatchObject({ column: 0, columnCount: 1 });
    expect(result.find((r) => r.event.id === 'b')).toMatchObject({ column: 0, columnCount: 1 });
  });

  it('filters out events with invalid datetimes', () => {
    const valid = makeEvent('valid', '2026-04-09T09:00:00', '2026-04-09T10:00:00');
    const invalid = { ...makeEvent('bad', 'not-a-date', '2026-04-09T10:00:00') };
    const result = layoutEvents([valid, invalid]);
    expect(result).toHaveLength(1);
    expect(result[0].event.id).toBe('valid');
  });
});

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const timedEvent: M365Event = {
  id: 'evt1',
  subject: 'Standup',
  start: { dateTime: '2026-04-09T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const allDayEvent: M365Event = {
  id: 'evt2',
  subject: 'Holiday',
  start: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-10T00:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: true,
};

describe('DayView', () => {
  it('renders all-day events in the all-day banner', () => {
    render(
      <DayView
        currentDate={new Date('2026-04-09')}
        events={[allDayEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-day-view-allday')).toBeInTheDocument();
    expect(screen.getByText('Holiday')).toBeInTheDocument();
  });

  it('does not render the all-day banner when there are no all-day events', () => {
    render(
      <DayView
        currentDate={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-day-view-allday')).not.toBeInTheDocument();
  });

  it('renders timed events in the timeline', () => {
    render(
      <DayView
        currentDate={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Standup')).toBeInTheDocument();
  });

  it('does not render events with no matching calendar', () => {
    render(
      <DayView
        currentDate={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[]}
        onTimeClick={vi.fn()}
      />,
    );
    expect(screen.queryByText('Standup')).not.toBeInTheDocument();
  });

  it('calls onTimeClick when the timeline background is clicked', () => {
    const onTimeClick = vi.fn();
    render(
      <DayView
        currentDate={new Date('2026-04-09')}
        events={[]}
        calendars={[]}
        onTimeClick={onTimeClick}
      />,
    );
    fireEvent.click(screen.getByTestId('m365-day-timeline'), { clientY: 0 });
    expect(onTimeClick).toHaveBeenCalledWith(expect.any(Date));
  });

  it('rounds clicked time to nearest 15 minutes', () => {
    const onTimeClick = vi.fn();
    render(
      <DayView
        currentDate={new Date('2026-04-09')}
        events={[]}
        calendars={[]}
        onTimeClick={onTimeClick}
      />,
    );
    // clientY=90 → offsetY=90 → 90 minutes → 1h 30m → rounds to 01:30
    // getBoundingClientRect().top returns 0 in jsdom
    fireEvent.click(screen.getByTestId('m365-day-timeline'), { clientY: 90 });
    const date = onTimeClick.mock.calls[0][0] as Date;
    expect(date.getHours()).toBe(1);
    expect(date.getMinutes()).toBe(30);
  });

  it('calls onEventClick when a timed event is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <DayView
        currentDate={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByText('Standup'));
    expect(onEventClick).toHaveBeenCalledWith(timedEvent);
  });

  it('clicking an event does not trigger onTimeClick', async () => {
    const onTimeClick = vi.fn();
    render(
      <DayView
        currentDate={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={onTimeClick}
        onEventClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Standup'));
    expect(onTimeClick).not.toHaveBeenCalled();
  });
});

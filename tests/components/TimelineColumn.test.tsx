import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineColumn } from '../../src/components/TimelineColumn';
import { M365Event, M365Calendar } from '../../src/types';

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

describe('TimelineColumn', () => {
  it('positions event block at correct top offset', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
        data-testid="col"
      />,
    );
    const block = document.querySelector('.m365-day-event-block') as HTMLElement;
    expect(block).toBeInTheDocument();
    // 9:00 = 540 minutes * PX_PER_MIN(1) = 540px
    expect(block.style.top).toBe('540px');
  });

  it('gives event block correct height', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
        data-testid="col"
      />,
    );
    const block = document.querySelector('.m365-day-event-block') as HTMLElement;
    // 30 minutes * PX_PER_MIN(1) = 30px
    expect(block.style.height).toBe('30px');
  });

  it('does not render event when calendar is missing', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[]}
        onTimeClick={vi.fn()}
        data-testid="col"
      />,
    );
    expect(screen.queryByText('Standup')).not.toBeInTheDocument();
  });

  it('calls onTimeClick with correct date when timeline is clicked', () => {
    const onTimeClick = vi.fn();
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[]}
        calendars={[]}
        onTimeClick={onTimeClick}
        data-testid="col"
      />,
    );
    // clientY=90 → offsetY=90 (rect.top=0 in jsdom) → 90min → rounds to 1h 30m
    fireEvent.click(screen.getByTestId('col'), { clientY: 90 });
    const date = onTimeClick.mock.calls[0][0] as Date;
    expect(date.getHours()).toBe(1);
    expect(date.getMinutes()).toBe(30);
  });

  it('clamps click to 23:45 when at bottom of timeline', () => {
    const onTimeClick = vi.fn();
    const baseDate = new Date('2026-04-09');
    render(
      <TimelineColumn
        date={baseDate}
        events={[]}
        calendars={[]}
        onTimeClick={onTimeClick}
        data-testid="col"
      />,
    );
    fireEvent.click(screen.getByTestId('col'), { clientY: 1440 });
    const date = onTimeClick.mock.calls[0][0] as Date;
    expect(date.getHours()).toBe(23);
    expect(date.getMinutes()).toBe(45);
    expect(date.getDate()).toBe(baseDate.getDate());
  });

  it('calls onEventClick when an event is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
        onEventClick={onEventClick}
        data-testid="col"
      />,
    );
    await userEvent.click(screen.getByText('Standup'));
    expect(onEventClick).toHaveBeenCalledWith(timedEvent);
  });

  it('clicking an event does not trigger onTimeClick', async () => {
    const onTimeClick = vi.fn();
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[timedEvent]}
        calendars={[calendar]}
        onTimeClick={onTimeClick}
        onEventClick={vi.fn()}
        data-testid="col"
      />,
    );
    await userEvent.click(screen.getByText('Standup'));
    expect(onTimeClick).not.toHaveBeenCalled();
  });
});

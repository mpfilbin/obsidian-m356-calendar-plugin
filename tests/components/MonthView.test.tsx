import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthView } from '../../src/components/MonthView';
import { M365Event, M365Calendar } from '../../src/types';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const eventOnApril4: M365Event = {
  id: 'evt1',
  subject: 'Team Meeting',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T10:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

describe('MonthView', () => {
  it('renders day-of-week headers', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Sun')).toBeInTheDocument();
    expect(screen.getByText('Sat')).toBeInTheDocument();
  });

  it('renders 35 or 42 day cells (5 or 6 weeks)', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    const cells = document.querySelectorAll('.m365-calendar-day-cell');
    expect([35, 42]).toContain(cells.length);
  });

  it('renders an event in the correct day cell', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
  });

  it('calls onDayClick when a day cell is clicked', async () => {
    const onDayClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={onDayClick}
      />,
    );
    const cells = document.querySelectorAll('.m365-calendar-day-cell');
    await userEvent.click(cells[0]);
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
  });

  it('marks today cell with "today" class', () => {
    render(
      <MonthView
        currentDate={new Date()}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    const todayCells = document.querySelectorAll('.m365-calendar-day-cell.today');
    expect(todayCells.length).toBe(1);
  });

  it('calls onEventClick with the event when an event card is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByText('Team Meeting'));
    expect(onEventClick).toHaveBeenCalledWith(eventOnApril4);
  });

  it('does not call onDayClick when an event card is clicked', async () => {
    const onDayClick = vi.fn();
    const onEventClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        onDayClick={onDayClick}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByText('Team Meeting'));
    expect(onDayClick).not.toHaveBeenCalled();
  });

  it('shows all events when count is at or below maxEventsPerDay', () => {
    const events = Array.from({ length: 6 }, (_, i) => ({
      ...eventOnApril4,
      id: `evt${i}`,
      subject: `Event ${i}`,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
    expect(screen.getAllByText(/Event \d/)).toHaveLength(6);
  });

  it('shows overflow button when events exceed maxEventsPerDay', () => {
    const events = Array.from({ length: 8 }, (_, i) => ({
      ...eventOnApril4,
      id: `evt${i}`,
      subject: `Event ${i}`,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    expect(screen.getByText('+ 2 more')).toBeInTheDocument();
  });

  it('clicking the overflow button calls onDayClick', async () => {
    const onDayClick = vi.fn();
    const events = Array.from({ length: 8 }, (_, i) => ({
      ...eventOnApril4,
      id: `evt${i}`,
      subject: `Event ${i}`,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={onDayClick}
        maxEventsPerDay={6}
      />,
    );
    await userEvent.click(screen.getByText('+ 2 more'));
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
  });

  it('uses default limit of 6 when maxEventsPerDay is not specified', () => {
    const events = Array.from({ length: 7 }, (_, i) => ({
      ...eventOnApril4,
      id: `evt${i}`,
      subject: `Event ${i}`,
    }));
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('+ 1 more')).toBeInTheDocument();
  });
});

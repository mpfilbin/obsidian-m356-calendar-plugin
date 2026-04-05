import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekView } from '../../src/components/WeekView';
import { M365Event, M365Calendar } from '../../src/types';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

// 2026-04-06 is a Monday; the week view (Sun-Sat) should show Sun Apr 5 – Sat Apr 11
const eventOnMonday: M365Event = {
  id: 'evt1',
  subject: 'Weekly Sync',
  start: { dateTime: '2026-04-06T10:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-06T11:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const eventOnApril4: M365Event = {
  id: 'evt1',
  subject: 'Team Meeting',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T10:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

describe('WeekView', () => {
  it('renders exactly 7 day columns', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelectorAll('.m365-calendar-week-day')).toHaveLength(7);
  });

  it('renders the event in the correct day column', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[eventOnMonday]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Weekly Sync')).toBeInTheDocument();
  });

  it('calls onDayClick when a column is clicked', async () => {
    const onDayClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={onDayClick}
      />,
    );
    await userEvent.click(document.querySelectorAll('.m365-calendar-week-day')[0]);
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
  });

  it('marks today column with "today" class', () => {
    render(
      <WeekView
        currentDate={new Date()}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelectorAll('.m365-calendar-week-day.today')).toHaveLength(1);
  });

  it('calls onEventClick with the event when an event card is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-04')}
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
    render(
      <WeekView
        currentDate={new Date('2026-04-04')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        onDayClick={onDayClick}
        onEventClick={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByText('Team Meeting'));
    expect(onDayClick).not.toHaveBeenCalled();
  });
});

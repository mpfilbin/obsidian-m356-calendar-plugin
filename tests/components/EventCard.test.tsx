import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventCard } from '../../src/components/EventCard';
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
  subject: 'Team Meeting',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T10:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const allDayEvent: M365Event = {
  id: 'evt2',
  subject: 'Company Holiday',
  start: { dateTime: '2026-04-04T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-05T00:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: true,
};

describe('EventCard', () => {
  it('renders the event subject', () => {
    render(<EventCard event={timedEvent} calendar={calendar} />);
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
  });

  it('applies calendar colour as left border', () => {
    const { container } = render(<EventCard event={timedEvent} calendar={calendar} />);
    const card = container.querySelector('.m365-calendar-event-card');
    expect(card).toHaveStyle({ borderLeftColor: '#0078d4' });
  });

  it('shows "All day" for all-day events', () => {
    render(<EventCard event={allDayEvent} calendar={calendar} />);
    expect(screen.getByText('All day')).toBeInTheDocument();
  });

  it('shows formatted time for timed events', () => {
    render(<EventCard event={timedEvent} calendar={calendar} />);
    // Time label should be present (format varies by locale, just check it's not "All day")
    expect(screen.queryByText('All day')).not.toBeInTheDocument();
    expect(document.querySelector('.m365-calendar-event-time')).toBeInTheDocument();
  });

  it('calls onClick when the card is clicked', async () => {
    const onClick = vi.fn();
    render(<EventCard event={timedEvent} calendar={calendar} onClick={onClick} />);
    await userEvent.click(document.querySelector('.m365-calendar-event-card')!);
    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

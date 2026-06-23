import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SpanningBar } from '../../src/components/SpanningBar';
import { M365Event, M365Calendar } from '../../src/types';
import { SpanningSegment } from '../../src/lib/spanningLayout';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const allDayEvent: M365Event = {
  id: 'e1',
  subject: 'Team Offsite',
  start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: true,
};

const timedEvent: M365Event = {
  id: 'e2',
  subject: 'Late Night Call',
  start: { dateTime: '2026-04-06T22:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-07T02:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const baseSegment: SpanningSegment = {
  event: allDayEvent,
  startCol: 1,
  colSpan: 3,
  lane: 0,
  continuesLeft: false,
  continuesRight: false,
};

describe('SpanningBar', () => {
  it('renders the event subject', () => {
    render(
      <SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />,
    );
    expect(screen.getByText('Team Offsite')).toBeInTheDocument();
  });

  it('applies correct grid-column and grid-row styles from segment', () => {
    render(
      <SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />,
    );
    const bar = document.querySelector('.m365-spanning-bar') as HTMLElement;
    expect(bar.style.gridColumn).toBe('2 / span 3'); // startCol(1)+1=2
    expect(bar.style.gridRow).toBe('1');              // lane(0)+1=1
  });

  it('applies grid-row for non-zero lane', () => {
    const seg = { ...baseSegment, lane: 2 };
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={seg} />);
    const bar = document.querySelector('.m365-spanning-bar') as HTMLElement;
    expect(bar.style.gridRow).toBe('3');
  });

  it('adds continues-left class when continuesLeft is true', () => {
    const seg = { ...baseSegment, continuesLeft: true };
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={seg} />);
    expect(document.querySelector('.m365-spanning-bar.continues-left')).toBeInTheDocument();
  });

  it('adds continues-right class when continuesRight is true', () => {
    const seg = { ...baseSegment, continuesRight: true };
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={seg} />);
    expect(document.querySelector('.m365-spanning-bar.continues-right')).toBeInTheDocument();
  });

  it('applies --allday modifier class for all-day events', () => {
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />);
    expect(document.querySelector('.m365-spanning-bar--allday')).toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar--timed')).not.toBeInTheDocument();
  });

  it('does not render time labels for all-day events', () => {
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />);
    expect(document.querySelector('.m365-spanning-bar-start-time')).not.toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar-end-time')).not.toBeInTheDocument();
  });

  it('renders start/end time labels and --timed class for timed cross-midnight events', () => {
    const seg = { ...baseSegment, event: timedEvent };
    render(<SpanningBar event={timedEvent} calendar={calendar} segment={seg} />);
    expect(document.querySelector('.m365-spanning-bar--timed')).toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar-start-time')).toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar-end-time')).toBeInTheDocument();
    expect(document.querySelector('.m365-spanning-bar--allday')).not.toBeInTheDocument();
  });

  it('calls onEventClick with the event when clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <SpanningBar
        event={allDayEvent}
        calendar={calendar}
        segment={baseSegment}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit event: Team Offsite' }));
    expect(onEventClick).toHaveBeenCalledWith(allDayEvent);
  });

  it('does not throw when onEventClick is not provided', async () => {
    render(<SpanningBar event={allDayEvent} calendar={calendar} segment={baseSegment} />);
    await expect(
      userEvent.click(screen.getByRole('button', { name: 'Edit event: Team Offsite' })),
    ).resolves.not.toThrow();
  });
});

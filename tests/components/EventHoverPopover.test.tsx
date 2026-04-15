import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { EventHoverPopover } from '../../src/components/EventHoverPopover';
import { M365Event, M365Calendar } from '../../src/types';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const baseEvent: M365Event = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-14T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-14T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

function makeRect(right: number): DOMRect {
  return { top: 100, left: 50, right, bottom: 150, width: right - 50, height: 50, x: 50, y: 100, toJSON: () => ({}) } as DOMRect;
}

describe('EventHoverPopover', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1024);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders subject, time range, location, bodyPreview, and webLink indicator when all present', () => {
    const event: M365Event = {
      ...baseEvent,
      location: 'Conference Room A',
      bodyPreview: 'Sprint review topics',
      webLink: 'https://outlook.com/event/1',
    };
    render(<EventHoverPopover event={event} calendar={calendar} anchorRect={makeRect(200)} />);
    expect(screen.getByText('Team Standup')).toBeInTheDocument();
    expect(screen.getByText(/09:00/)).toBeInTheDocument();
    expect(screen.getByText('Conference Room A')).toBeInTheDocument();
    expect(screen.getByText('Sprint review topics')).toBeInTheDocument();
    expect(screen.getByText('Open in Outlook')).toBeInTheDocument();
  });

  it('omits optional fields when absent from the event', () => {
    render(<EventHoverPopover event={baseEvent} calendar={calendar} anchorRect={makeRect(200)} />);
    expect(screen.queryByText('Open in Outlook')).not.toBeInTheDocument();
    expect(document.querySelector('.m365-popover-location')).not.toBeInTheDocument();
    expect(document.querySelector('.m365-popover-body')).not.toBeInTheDocument();
  });

  it('shows "All day" for all-day events', () => {
    const event: M365Event = { ...baseEvent, isAllDay: true };
    render(<EventHoverPopover event={event} calendar={calendar} anchorRect={makeRect(200)} />);
    expect(screen.getByText('All day')).toBeInTheDocument();
  });

  it('positions to the left when anchorRect is near the right viewport edge', () => {
    // right=900: 900 + 8 (gap) + 280 (width) = 1188 > 1024 → flip left
    // expected left: 50 - 8 - 280 = -238
    const { container } = render(
      <EventHoverPopover event={baseEvent} calendar={calendar} anchorRect={makeRect(900)} />,
    );
    const popover = container.firstChild as HTMLElement;
    expect(popover.style.left).toBe('-238px');
  });

  it('positions to the right when there is space', () => {
    // right=200: 200 + 8 + 280 = 488 < 1024 → no flip
    // expected left: 200 + 8 = 208
    const { container } = render(
      <EventHoverPopover event={baseEvent} calendar={calendar} anchorRect={makeRect(200)} />,
    );
    const popover = container.firstChild as HTMLElement;
    expect(popover.style.left).toBe('208px');
  });
});

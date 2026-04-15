import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import React from 'react';
import { PopoverProvider, usePopoverContext } from '../src/PopoverContext';
import { M365Event, M365Calendar } from '../src/types';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const event: M365Event = {
  id: 'evt1',
  subject: 'Team Standup',
  start: { dateTime: '2026-04-14T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-14T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const rect = {
  top: 100, left: 50, right: 200, bottom: 150,
  width: 150, height: 50, x: 50, y: 100,
  toJSON: () => ({}),
} as DOMRect;

const Trigger: React.FC = () => {
  const { showPopover, hidePopover } = usePopoverContext();
  return (
    <>
      <button data-testid="show" onClick={() => showPopover(event, calendar, rect)}>show</button>
      <button data-testid="hide" onClick={() => hidePopover()}>hide</button>
    </>
  );
};

describe('PopoverContext', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', 1024);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not show popover before 300ms', () => {
    render(<PopoverProvider><Trigger /></PopoverProvider>);
    fireEvent.click(screen.getByTestId('show'));
    act(() => { vi.advanceTimersByTime(299); });
    expect(screen.queryByText('Team Standup')).not.toBeInTheDocument();
  });

  it('shows popover after 300ms', () => {
    render(<PopoverProvider><Trigger /></PopoverProvider>);
    fireEvent.click(screen.getByTestId('show'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Team Standup')).toBeInTheDocument();
  });

  it('hidePopover cancels a pending show', () => {
    render(<PopoverProvider><Trigger /></PopoverProvider>);
    fireEvent.click(screen.getByTestId('show'));
    fireEvent.click(screen.getByTestId('hide'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.queryByText('Team Standup')).not.toBeInTheDocument();
  });

  it('hidePopover dismisses a visible popover immediately', () => {
    render(<PopoverProvider><Trigger /></PopoverProvider>);
    fireEvent.click(screen.getByTestId('show'));
    act(() => { vi.advanceTimersByTime(300); });
    expect(screen.getByText('Team Standup')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('hide'));
    expect(screen.queryByText('Team Standup')).not.toBeInTheDocument();
  });
});

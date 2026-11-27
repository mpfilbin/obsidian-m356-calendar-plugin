import { describe, it, expect, vi } from 'vitest';
import React from 'react';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelineColumn } from '../../src/components/TimelineColumn';
import { M365Event, M365Calendar } from '../../src/types';

vi.mock('../../src/hooks/useNow', () => ({
  useNow: vi.fn(() => new Date('2026-04-14T14:30:00')),
}));

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

  it('renders hour labels when showLabels is true', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        showLabels={true}
        data-testid="col"
      />,
    );
    // 24 hour labels should be rendered (00:00 through 23:00)
    expect(screen.getByText('00:00')).toBeInTheDocument();
    expect(screen.getByText('12:00')).toBeInTheDocument();
    expect(screen.getByText('23:00')).toBeInTheDocument();
  });

  it('does not render hour labels when showLabels is false', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        data-testid="col"
      />,
    );
    expect(screen.queryByText('00:00')).not.toBeInTheDocument();
  });
});

describe('TimelineColumn now-line', () => {
  it('renders the now-line when showNowLine is true', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        showNowLine={true}
        data-testid="col"
      />,
    );
    const line = document.querySelector('.m365-now-line') as HTMLElement;
    expect(line).toBeInTheDocument();
    // 14:30 → 14*60+30 = 870 minutes * PX_PER_MIN(1) = 870px
    expect(line.style.top).toBe('870px');
  });

  it('does not render the now-line when showNowLine is false', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        showNowLine={false}
        data-testid="col"
      />,
    );
    expect(document.querySelector('.m365-now-line')).not.toBeInTheDocument();
  });

  it('does not render the now-line when showNowLine is omitted', () => {
    render(
      <TimelineColumn
        date={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        data-testid="col"
      />,
    );
    expect(document.querySelector('.m365-now-line')).not.toBeInTheDocument();
  });
});

describe('TimelineColumn context menu', () => {
  it('calls onTimeContextMenu with correct dateTime when right-clicked', () => {
    const onTimeContextMenu = vi.fn();
    render(
      <TimelineColumn
        date={new Date('2026-04-09')}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        onTimeContextMenu={onTimeContextMenu}
        data-testid="col"
      />,
    );
    // clientY=90 → offsetY=90 (rect.top=0 in jsdom) → 90 min → rounds to 1h 30m
    fireEvent.contextMenu(screen.getByTestId('col'), { clientY: 90 });
    expect(onTimeContextMenu).toHaveBeenCalledTimes(1);
    const [dateTime, event] = onTimeContextMenu.mock.calls[0] as [Date, MouseEvent];
    expect(dateTime.getHours()).toBe(1);
    expect(dateTime.getMinutes()).toBe(30);
    expect(event).toBeInstanceOf(MouseEvent);
  });

  it('clamps context menu to 23:45 when at bottom of timeline', () => {
    const onTimeContextMenu = vi.fn();
    const baseDate = new Date('2026-04-09');
    render(
      <TimelineColumn
        date={baseDate}
        events={[]}
        calendars={[]}
        onTimeClick={vi.fn()}
        onTimeContextMenu={onTimeContextMenu}
        data-testid="col"
      />,
    );
    fireEvent.contextMenu(screen.getByTestId('col'), { clientY: 1440 });
    const [dateTime] = onTimeContextMenu.mock.calls[0] as [Date, MouseEvent];
    expect(dateTime.getHours()).toBe(23);
    expect(dateTime.getMinutes()).toBe(45);
    expect(dateTime.getDate()).toBe(baseDate.getDate());
  });

  it('right-clicking the timeline does not trigger onTimeClick', () => {
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
    fireEvent.contextMenu(screen.getByTestId('col'), { clientY: 90 });
    expect(onTimeClick).not.toHaveBeenCalled();
  });

  describe('drag to select a time range', () => {
    const day = new Date(2026, 3, 9);
    const renderColumn = (props: Partial<React.ComponentProps<typeof TimelineColumn>> = {}) => {
      const onTimeClick = vi.fn();
      const onTimeRangeSelect = vi.fn();
      render(
        <TimelineColumn
          date={day}
          events={[]}
          calendars={[calendar]}
          onTimeClick={onTimeClick}
          onTimeRangeSelect={onTimeRangeSelect}
          data-testid="col"
          {...props}
        />,
      );
      return { column: screen.getByTestId('col'), onTimeClick, onTimeRangeSelect };
    };
    // jsdom has no layout, so the column's top is 0 and clientY is minutes after midnight.
    const drag = (column: HTMLElement, fromY: number, toY: number) => {
      fireEvent.mouseDown(column, { button: 0, clientY: fromY });
      fireEvent.mouseMove(document, { clientY: toY });
    };

    it('shows a rectangle whose top and height are the selected time span', () => {
      const { column } = renderColumn();
      drag(column, 9 * 60, 10 * 60 + 30);

      const rect = screen.getByTestId('m365-timeline-selection');
      expect(rect.style.top).toBe('540px');
      expect(rect.style.height).toBe('90px'); // 09:00 to 10:30 = 90 minutes at 1px/min
      expect(rect).toHaveTextContent('09:00');
      expect(rect).toHaveTextContent('10:30');
    });

    it('grows with the pointer and follows it back up', () => {
      const { column } = renderColumn();
      drag(column, 600, 660);
      expect(screen.getByTestId('m365-timeline-selection').style.height).toBe('60px');
      fireEvent.mouseMove(document, { clientY: 720 });
      expect(screen.getByTestId('m365-timeline-selection').style.height).toBe('120px');
      fireEvent.mouseMove(document, { clientY: 630 });
      expect(screen.getByTestId('m365-timeline-selection').style.height).toBe('30px');
    });

    it('selects upwards too', () => {
      const { column } = renderColumn();
      drag(column, 700, 600);
      const rect = screen.getByTestId('m365-timeline-selection');
      expect(rect.style.top).toBe('600px');
      expect(rect.style.height).toBe('105px'); // 10:00 to 11:45 (the 11:40 press lands in the 11:30 slot)
    });

    it('offsets the rectangle past the time labels when they are shown', () => {
      const { column } = renderColumn({ showLabels: true });
      drag(column, 60, 120);
      expect(screen.getByTestId('m365-timeline-selection').style.left).toBe('52px');
    });

    it('reports the start and end on release and removes the rectangle', () => {
      const { column, onTimeRangeSelect } = renderColumn();
      drag(column, 9 * 60 + 7, 10 * 60 + 22);
      fireEvent.mouseUp(document);

      expect(onTimeRangeSelect).toHaveBeenCalledTimes(1);
      const [start, end] = onTimeRangeSelect.mock.calls[0] as [Date, Date];
      expect([start.getDate(), start.getHours(), start.getMinutes()]).toEqual([9, 9, 0]);
      expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([9, 10, 30]);
      expect(screen.queryByTestId('m365-timeline-selection')).not.toBeInTheDocument();
    });

    it('can select up to the end of the day', () => {
      const { column, onTimeRangeSelect } = renderColumn();
      drag(column, 23 * 60 + 10, 5000);
      fireEvent.mouseUp(document);
      const [start, end] = onTimeRangeSelect.mock.calls[0] as [Date, Date];
      expect([start.getHours(), start.getMinutes()]).toEqual([23, 0]);
      expect([end.getDate(), end.getHours(), end.getMinutes()]).toEqual([10, 0, 0]);
    });

    it('does not also open the click handler after a drag, but does for the next click', async () => {
      const { column, onTimeClick } = renderColumn();
      drag(column, 600, 700);
      fireEvent.mouseUp(document);
      fireEvent.click(column, { clientY: 700 }); // the click the browser fires after the release
      expect(onTimeClick).not.toHaveBeenCalled();

      await new Promise((resolve) => setTimeout(resolve, 0));
      fireEvent.click(column, { clientY: 90 });
      expect(onTimeClick).toHaveBeenCalledTimes(1);
    });

    it('treats a press that barely moves as a plain click', () => {
      const { column, onTimeClick, onTimeRangeSelect } = renderColumn();
      fireEvent.mouseDown(column, { button: 0, clientY: 90 });
      fireEvent.mouseMove(document, { clientY: 92 });
      expect(screen.queryByTestId('m365-timeline-selection')).not.toBeInTheDocument();
      fireEvent.mouseUp(document);
      fireEvent.click(column, { clientY: 90 });

      expect(onTimeRangeSelect).not.toHaveBeenCalled();
      expect(onTimeClick).toHaveBeenCalledTimes(1);
    });

    it('cancels with Escape', async () => {
      const { column, onTimeRangeSelect, onTimeClick } = renderColumn();
      drag(column, 600, 700);
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByTestId('m365-timeline-selection')).not.toBeInTheDocument();
      fireEvent.mouseMove(document, { clientY: 800 });
      expect(screen.queryByTestId('m365-timeline-selection')).not.toBeInTheDocument();
      fireEvent.mouseUp(document);
      fireEvent.click(column, { clientY: 800 });

      expect(onTimeRangeSelect).not.toHaveBeenCalled();
      expect(onTimeClick).not.toHaveBeenCalled();
    });

    it('ignores other mouse buttons', () => {
      const { column, onTimeRangeSelect } = renderColumn();
      fireEvent.mouseDown(column, { button: 2, clientY: 600 });
      fireEvent.mouseMove(document, { clientY: 700 });
      fireEvent.mouseUp(document);
      expect(screen.queryByTestId('m365-timeline-selection')).not.toBeInTheDocument();
      expect(onTimeRangeSelect).not.toHaveBeenCalled();
    });

    it('leaves presses on an event to the event', () => {
      const { onTimeRangeSelect } = renderColumn({
        events: [{ ...timedEvent, start: { dateTime: '2026-04-09T09:00:00', timeZone: 'UTC' }, end: { dateTime: '2026-04-09T10:00:00', timeZone: 'UTC' } }],
      });
      const block = document.querySelector('.m365-day-event-block') as HTMLElement;
      fireEvent.mouseDown(block, { button: 0, clientY: 560 });
      fireEvent.mouseMove(document, { clientY: 640 });
      fireEvent.mouseUp(document);
      expect(screen.queryByTestId('m365-timeline-selection')).not.toBeInTheDocument();
      expect(onTimeRangeSelect).not.toHaveBeenCalled();
    });

    it('does nothing without a range handler (week view)', () => {
      const { column, onTimeClick } = renderColumn({ onTimeRangeSelect: undefined });
      drag(column, 600, 700);
      expect(screen.queryByTestId('m365-timeline-selection')).not.toBeInTheDocument();
      fireEvent.mouseUp(document);
      fireEvent.click(column, { clientY: 700 });
      expect(onTimeClick).toHaveBeenCalledTimes(1);
    });

    it('stops listening when unmounted mid-drag', () => {
      const removeSpy = vi.spyOn(document, 'removeEventListener');
      const { column } = renderColumn();
      drag(column, 600, 700);
      cleanup();
      expect(removeSpy).toHaveBeenCalledWith('mouseup', expect.any(Function));
      removeSpy.mockRestore();
    });
  });
});

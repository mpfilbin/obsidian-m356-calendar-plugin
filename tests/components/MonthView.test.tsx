import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MonthView } from '../../src/components/MonthView';
import { M365Event, M365Calendar, DailyWeather, DayContextMenuPayload } from '../../src/types';
import { M365TodoList, M365TodoItem } from '../../src/types';

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
    expect(screen.queryByText(/^\(\+\d+\)$/)).not.toBeInTheDocument();
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
    expect(screen.getByText('(+2)')).toBeInTheDocument();
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
    await userEvent.click(screen.getByText('(+2)'));
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
  });

  it('overflow button click calls onDayClick exactly once (stopPropagation works)', async () => {
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
    await userEvent.click(screen.getByText('(+2)'));
    expect(onDayClick).toHaveBeenCalledTimes(1);
  });

  it('uses default limit of 4 when maxEventsPerDay is not specified', () => {
    const events = Array.from({ length: 5 }, (_, i) => ({
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
    expect(screen.getByText('(+1)')).toBeInTheDocument();
  });

  const forecastWeather: DailyWeather = {
    date: '2026-04-04',
    condition: { code: 800, description: 'clear sky', iconCode: '01d' },
    tempCurrent: 72,
    tempHigh: 78,
    tempLow: 61,
    precipProbability: 0.1,
  };

  it('renders weather icon img when DailyWeather is present for a date', () => {
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-04', forecastWeather]]);
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        weather={weatherMap}
      />,
    );
    const img = document.querySelector('.m365-weather-icon') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('01d');
    expect(img.alt).toBe('clear sky');
  });

  it('renders no weather element when weather is null for a date', () => {
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-04', null]]);
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        weather={weatherMap}
      />,
    );
    expect(document.querySelector('.m365-weather-unknown')).toBeNull();
    expect(document.querySelector('.m365-weather-icon')).toBeNull();
  });

  it('renders no weather element when weather prop is absent', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-weather-icon')).toBeNull();
    expect(document.querySelector('.m365-weather-unknown')).toBeNull();
  });

  it('renders high, low, and precip in imperial units', () => {
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-04', forecastWeather]]);
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        weather={weatherMap}
        weatherUnits="imperial"
      />,
    );
    const details = document.querySelector('.m365-month-weather-details');
    expect(details).not.toBeNull();
    expect(details?.textContent).toContain('↑ 78°F');
    expect(details?.textContent).toContain('↓ 61°F');
    expect(details?.textContent).toContain('☂ 10%');
  });

  it('renders temperatures in °C when weatherUnits is metric', () => {
    const metricWeather: DailyWeather = {
      ...forecastWeather,
      date: '2026-04-04',
      tempHigh: 26,
      tempLow: 16,
    };
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-04', metricWeather]]);
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        weather={weatherMap}
        weatherUnits="metric"
      />,
    );
    const details = document.querySelector('.m365-month-weather-details');
    expect(details?.textContent).toContain('↑ 26°C');
    expect(details?.textContent).toContain('↓ 16°C');
  });

  it('omits individual detail fields when their data is null', () => {
    const partialWeather: DailyWeather = {
      ...forecastWeather,
      date: '2026-04-04',
      tempHigh: 78,
      tempLow: null,
      precipProbability: null,
    };
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-04', partialWeather]]);
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        weather={weatherMap}
      />,
    );
    const details = document.querySelector('.m365-month-weather-details');
    expect(details?.textContent).toContain('↑ 78°F');
    expect(details?.textContent).not.toContain('↓');
    expect(details?.textContent).not.toContain('☂');
  });

  it('does not render the detail row when all temp and precip data is null', () => {
    const noDetailWeather: DailyWeather = {
      ...forecastWeather,
      date: '2026-04-04',
      tempHigh: null,
      tempLow: null,
      precipProbability: null,
    };
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-04', noDetailWeather]]);
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        weather={weatherMap}
      />,
    );
    expect(document.querySelector('.m365-month-weather-details')).toBeNull();
    expect(document.querySelector('.m365-weather-icon')).not.toBeNull();
  });
});

const todoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };
const todoOnApril4: M365TodoItem = {
  id: 'task1',
  title: 'Buy milk',
  listId: 'list1',
  dueDate: '2026-04-04',
  importance: 'normal',
};

describe('MonthView — todos', () => {
  it('renders a todo on its due date', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril4]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('does not render a todo on the wrong date', () => {
    const todoOnApril5: M365TodoItem = { ...todoOnApril4, dueDate: '2026-04-05' };
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril5]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
      />,
    );
    // April 4 date cell should not have any todo content
    expect(screen.queryByText('Buy milk')).not.toBeInTheDocument();
  });

  it('renders both events and todos in the same day cell', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        todos={[todoOnApril4]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('calls onTodoClick when a todo is clicked', async () => {
    const onTodoClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril4]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
        onTodoClick={onTodoClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View task: Buy milk' }));
    expect(onTodoClick).toHaveBeenCalledWith(todoOnApril4);
  });

  it('disables the todo button when the task is completing', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril4]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
        completingTodoIds={new Set(['task1'])}
      />,
    );
    expect(screen.getByRole('button', { name: 'View task: Buy milk' })).toBeDisabled();
  });
});

describe('MonthView — overflow popup hover', () => {
  const events8 = Array.from({ length: 8 }, (_, i) => ({
    ...eventOnApril4,
    id: `evt${i}`,
    subject: `Event ${i}`,
  }));

  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('innerWidth', 1024);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('does not show overflow popup before 300ms of hover', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events8}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show 2 more items' }));
    act(() => { vi.advanceTimersByTime(299); });
    expect(document.querySelector('.m365-overflow-popup')).toBeNull();
  });

  it('shows overflow popup with overflow events after 300ms of hover', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events8}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    fireEvent.mouseEnter(screen.getByRole('button', { name: 'Show 2 more items' }));
    act(() => { vi.advanceTimersByTime(300); });
    expect(document.querySelector('.m365-overflow-popup')).not.toBeNull();
    expect(screen.getByText('Event 6')).toBeInTheDocument();
    expect(screen.getByText('Event 7')).toBeInTheDocument();
  });

  it('hides overflow popup immediately on mouse leave', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events8}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Show 2 more items' });
    fireEvent.mouseEnter(btn);
    act(() => { vi.advanceTimersByTime(300); });
    expect(document.querySelector('.m365-overflow-popup')).not.toBeNull();
    fireEvent.mouseLeave(btn);
    expect(document.querySelector('.m365-overflow-popup')).toBeNull();
  });

  it('mouse leave before 300ms cancels the popup', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events8}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxEventsPerDay={6}
      />,
    );
    const btn = screen.getByRole('button', { name: 'Show 2 more items' });
    fireEvent.mouseEnter(btn);
    act(() => { vi.advanceTimersByTime(299); });
    fireEvent.mouseLeave(btn);
    act(() => { vi.advanceTimersByTime(1); });
    expect(document.querySelector('.m365-overflow-popup')).toBeNull();
  });
});

describe('MonthView — event sort order', () => {
  const cal: M365Calendar = {
    id: 'cal1',
    name: 'Work',
    color: '#0078d4',
    isDefaultCalendar: true,
    canEdit: true,
  };

  it('renders timed events in ascending start-time order regardless of input order', () => {
    const events: M365Event[] = [
      {
        id: 'e3',
        subject: '3 PM Meeting',
        start: { dateTime: '2026-04-04T15:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-04T16:00:00', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: false,
      },
      {
        id: 'e1',
        subject: '9 AM Meeting',
        start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-04T10:00:00', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: false,
      },
      {
        id: 'e2',
        subject: '12 PM Meeting',
        start: { dateTime: '2026-04-04T12:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-04T13:00:00', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: false,
      },
    ];
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[cal]}
        onDayClick={vi.fn()}
        maxEventsPerDay={3}
      />,
    );
    const buttons = Array.from(
      document.querySelectorAll('.m365-event-click-btn[aria-label^="Edit event:"]'),
    );
    const subjects = buttons.map((b) => b.getAttribute('aria-label')?.replace('Edit event: ', ''));
    expect(subjects).toEqual(['9 AM Meeting', '12 PM Meeting', '3 PM Meeting']);
  });

  it('renders all-day events before timed events', () => {
    const events: M365Event[] = [
      {
        id: 'timed',
        subject: '9 AM Meeting',
        start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
        end: { dateTime: '2026-04-04T10:00:00', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: false,
      },
      {
        id: 'allday',
        subject: 'All Day Event',
        start: { dateTime: '2026-04-04', timeZone: 'UTC' },
        end: { dateTime: '2026-04-05', timeZone: 'UTC' },
        calendarId: 'cal1',
        isAllDay: true,
      },
    ];
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={events}
        calendars={[cal]}
        onDayClick={vi.fn()}
        maxEventsPerDay={3}
      />,
    );
    const buttons = Array.from(
      document.querySelectorAll('.m365-event-click-btn[aria-label^="Edit event:"]'),
    );
    const subjects = buttons.map((b) => b.getAttribute('aria-label')?.replace('Edit event: ', ''));
    expect(subjects).toEqual(['All Day Event', '9 AM Meeting']);
  });
});

describe('MonthView — context menu', () => {
  it('calls onDayContextMenu with allday payload when a day cell is right-clicked', () => {
    const onDayContextMenu = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
      />,
    );
    const cells = document.querySelectorAll('.m365-calendar-day-cell');
    fireEvent.contextMenu(cells[0]);
    expect(onDayContextMenu).toHaveBeenCalledTimes(1);
    const [payload] = onDayContextMenu.mock.calls[0] as [DayContextMenuPayload, MouseEvent];
    expect(payload.kind).toBe('allday');
    expect((payload as { kind: 'allday'; date: Date }).date).toBeInstanceOf(Date);
  });

  it('right-clicking a day cell does not call onDayClick', () => {
    const onDayClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={onDayClick}
        onDayContextMenu={vi.fn()}
      />,
    );
    const cells = document.querySelectorAll('.m365-calendar-day-cell');
    fireEvent.contextMenu(cells[0]);
    expect(onDayClick).not.toHaveBeenCalled();
  });

  it('passes the correct date in the payload', () => {
    const onDayContextMenu = vi.fn();
    const testDate = new Date('2026-04-15');
    render(
      <MonthView
        currentDate={testDate}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
      />,
    );
    const cells = Array.from(document.querySelectorAll('.m365-month-date-cell'));
    const april15 = cells.find((c) => {
      const span = c.querySelector('.m365-calendar-day-number');
      return span?.textContent === '15' && !c.className.includes('other-month');
    })!;
    fireEvent.contextMenu(april15);
    const [payload] = onDayContextMenu.mock.calls[0] as [DayContextMenuPayload, MouseEvent];
    expect(payload.kind).toBe('allday');
    const date = (payload as { kind: 'allday'; date: Date }).date;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(3);
    expect(date.getDate()).toBe(15);
  });

  it('prevents the default browser context menu on right-click', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        onDayContextMenu={vi.fn()}
      />,
    );
    const cells = document.querySelectorAll('.m365-calendar-day-cell');
    const event = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    cells[0].dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

// ─── Spanning events ──────────────────────────────────────────────────────────

const multiDayEvent: M365Event = {
  id: 'multi1',
  subject: 'Long Conference',
  start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' }, // Apr 6–8 inclusive, end exclusive
  calendarId: 'cal1',
  isAllDay: true,
};

describe('MonthView — spanning events', () => {
  it('renders a multi-day event as a spanning bar', () => {
    render(
      <MonthView
        currentDate={new Date(2026, 3, 1)}
        events={[multiDayEvent]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-spanning-bar')).toBeInTheDocument();
    expect(screen.getByText('Long Conference')).toBeInTheDocument();
  });

  it('does not render a spanning event inside a day cell event button', () => {
    render(
      <MonthView
        currentDate={new Date(2026, 3, 1)}
        events={[multiDayEvent]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    const dayCellBtns = document.querySelectorAll('.m365-calendar-day-cell .m365-event-click-btn');
    const subjects = Array.from(dayCellBtns).map((b) => b.textContent);
    expect(subjects.every((t) => !t?.includes('Long Conference'))).toBe(true);
  });

  it('renders a cross-week spanning event as bars in both week rows', () => {
    // Apr 4 (Sat, week 1) – Apr 8 (Wed, week 2)
    const crossWeek: M365Event = {
      id: 'cross1',
      subject: 'Multi Week Event',
      start: { dateTime: '2026-04-04T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
      calendarId: 'cal1',
      isAllDay: true,
    };
    render(
      <MonthView
        currentDate={new Date(2026, 3, 1)}
        events={[crossWeek]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelectorAll('.m365-spanning-bar').length).toBe(2);
  });

  it('shows a day cell overflow button when spanning events exceed maxSpanningLanes', () => {
    // Three events all starting on the same Monday: only 2 lanes visible, 1 overflows
    const events: M365Event[] = Array.from({ length: 3 }, (_, i) => ({
      id: `multi${i}`,
      subject: `Conference ${i}`,
      start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
      calendarId: 'cal1',
      isAllDay: true,
    }));
    render(
      <MonthView
        currentDate={new Date(2026, 3, 1)}
        events={events}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        maxSpanningLanes={2}
      />,
    );
    // Overflow badge now renders inside each affected day cell as m365-month-overflow-btn
    expect(document.querySelector('.m365-month-overflow-btn')).toBeInTheDocument();
    expect(document.querySelectorAll('.m365-spanning-bar').length).toBe(2);
  });

  it('clicking the spanning overflow button in a day cell calls onDayClick', async () => {
    const onDayClick = vi.fn();
    const events: M365Event[] = Array.from({ length: 3 }, (_, i) => ({
      id: `multi${i}`,
      subject: `Conference ${i}`,
      start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
      calendarId: 'cal1',
      isAllDay: true,
    }));
    render(
      <MonthView
        currentDate={new Date(2026, 3, 1)}
        events={events}
        calendars={[calendar]}
        onDayClick={onDayClick}
        maxSpanningLanes={2}
      />,
    );
    await userEvent.click(document.querySelector('.m365-month-overflow-btn')!);
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
  });

  it('calls onEventClick when a spanning bar is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date(2026, 3, 1)}
        events={[multiDayEvent]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Edit event: Long Conference' }));
    expect(onEventClick).toHaveBeenCalledWith(multiDayEvent);
  });

  it('still renders single-day events in day cells alongside spanning events', () => {
    render(
      <MonthView
        currentDate={new Date(2026, 3, 1)}
        events={[multiDayEvent, eventOnApril4]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-spanning-bar')).toBeInTheDocument();
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
  });
});

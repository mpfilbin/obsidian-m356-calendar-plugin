import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { WeekView } from '../../src/components/WeekView';
import { M365Event, M365Calendar, DailyWeather } from '../../src/types';

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

  const weekWeather: DailyWeather = {
    date: '2026-04-06',
    condition: { code: 800, description: 'clear sky', iconCode: '01d' },
    tempCurrent: 72,
    tempHigh: 78,
    tempLow: 61,
    precipProbability: 0.2,
  };

  it('renders weather strip with icon when DailyWeather is present', () => {
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-06', weekWeather]]);
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        weather={weatherMap}
      />,
    );
    const img = document.querySelector('.m365-weather-icon') as HTMLImageElement;
    expect(img).not.toBeNull();
    expect(img.src).toContain('01d');
    // Temperature values should appear with unit suffix (default imperial = °F)
    expect(screen.getByText('72°F')).toBeInTheDocument();
    expect(screen.getByText('H: 78°F')).toBeInTheDocument();
    expect(screen.getByText('L: 61°F')).toBeInTheDocument();
    expect(screen.getByText('☂ 20%')).toBeInTheDocument();
  });

  it('renders temperatures with °C suffix when weatherUnits is metric', () => {
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-06', weekWeather]]);
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        weather={weatherMap}
        weatherUnits="metric"
      />,
    );
    expect(screen.getByText('72°C')).toBeInTheDocument();
    expect(screen.getByText('H: 78°C')).toBeInTheDocument();
    expect(screen.getByText('L: 61°C')).toBeInTheDocument();
  });

  it('renders ? placeholder in header when weather is null for a day', () => {
    const weatherMap = new Map<string, DailyWeather | null>([['2026-04-06', null]]);
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
        weather={weatherMap}
      />,
    );
    expect(document.querySelector('.m365-weather-unknown')).not.toBeNull();
  });

  it('renders no weather strip when weather prop is absent', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-weather-icon')).toBeNull();
    expect(document.querySelector('.m365-weather-unknown')).toBeNull();
  });
});

const allDayEventOnMonday: M365Event = {
  id: 'evt-allday',
  subject: 'Conference Day',
  start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-07T00:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: true,
};

describe('WeekView timeline layout', () => {
  it('renders timed events as positioned blocks in the timeline', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[eventOnMonday]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    const block = document.querySelector('.m365-day-event-block') as HTMLElement;
    expect(block).toBeInTheDocument();
    // 10:00 = 600 minutes * PX_PER_MIN(1) = top: 600px
    expect(block.style.top).toBe('600px');
  });

  it('renders all-day events in the all-day row, not as positioned blocks', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[allDayEventOnMonday]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Conference Day')).toBeInTheDocument();
    expect(document.querySelector('.m365-week-allday-row')).toBeInTheDocument();
    expect(document.querySelector('.m365-day-event-block')).not.toBeInTheDocument();
  });

  it('all-day row is visible even with no all-day events', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-week-allday-row')).toBeInTheDocument();
  });

  it('clicking a time slot in the timeline calls onDayClick with that day and time', () => {
    const onDayClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[]}
        calendars={[]}
        onDayClick={onDayClick}
      />,
    );
    // Monday column is index 1 (Sunday is 0)
    const timelines = document.querySelectorAll('[data-testid^="m365-week-timeline-"]');
    // clientY=90 → offsetY=90 (rect.top=0 in jsdom) → 90min → 1h 30m
    fireEvent.click(timelines[1], { clientY: 90 });
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
    const date = onDayClick.mock.calls[0][0] as Date;
    expect(date.getHours()).toBe(1);
    expect(date.getMinutes()).toBe(30);
  });

  it('calls onEventClick when an all-day event is clicked', async () => {
    const onEventClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-06')}
        events={[allDayEventOnMonday]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        onEventClick={onEventClick}
      />,
    );
    await userEvent.click(screen.getByText('Conference Day'));
    expect(onEventClick).toHaveBeenCalledWith(allDayEventOnMonday);
  });
});

describe('WeekView now-line', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T14:30:00'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders the full-width now-line overlay when showing the current week', () => {
    // 2026-04-14 is a Tuesday; its week (Sun Apr 12–Sat Apr 18) includes today
    render(
      <WeekView
        currentDate={new Date(2026, 3, 14)}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    const line = document.querySelector('.m365-now-line') as HTMLElement;
    expect(line).toBeInTheDocument();
    // 14:30 → 870 minutes * PX_PER_MIN(1) = 870px
    expect(line.style.top).toBe('870px');
  });

  it('does not render the now-line when showing a different week', () => {
    // 2026-04-06 is a Monday; its week (Sun Apr 5–Sat Apr 11) does not include Apr 14
    render(
      <WeekView
        currentDate={new Date(2026, 3, 6)}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    expect(document.querySelector('.m365-now-line')).not.toBeInTheDocument();
  });
});

describe('WeekView scroll-to-center', () => {
  let originalClientHeight: PropertyDescriptor | undefined;
  let originalScrollHeight: PropertyDescriptor | undefined;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T14:30:00'));
    originalClientHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'clientHeight');
    originalScrollHeight = Object.getOwnPropertyDescriptor(Element.prototype, 'scrollHeight');
    Object.defineProperty(Element.prototype, 'clientHeight', { configurable: true, get: () => 400 });
    Object.defineProperty(Element.prototype, 'scrollHeight', { configurable: true, get: () => 1440 });
  });

  afterEach(() => {
    vi.useRealTimers();
    if (originalClientHeight) {
      Object.defineProperty(Element.prototype, 'clientHeight', originalClientHeight);
    }
    if (originalScrollHeight) {
      Object.defineProperty(Element.prototype, 'scrollHeight', originalScrollHeight);
    }
  });

  it('scrolls the timeline area to center the now-line when showing the current week', () => {
    // useNow → 14:30 → nowMinutes = 870
    // No offsetTop adjustment needed (all-day row is outside .m365-week-timeline-area)
    // target = 870 - 400/2 = 670
    // clamped: max(0, min(670, 1440-400=1040)) = 670
    render(
      <WeekView
        currentDate={new Date(2026, 3, 14)}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    const timelineArea = document.querySelector('.m365-week-timeline-area') as HTMLElement;
    expect(timelineArea.scrollTop).toBe(670);
  });

  it('does not scroll when showing a different week', () => {
    render(
      <WeekView
        currentDate={new Date(2026, 3, 6)}
        events={[]}
        calendars={[]}
        onDayClick={vi.fn()}
      />,
    );
    const timelineArea = document.querySelector('.m365-week-timeline-area') as HTMLElement;
    expect(timelineArea.scrollTop).toBe(0);
  });
});

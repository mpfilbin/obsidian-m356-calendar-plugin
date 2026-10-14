import { describe, it, expect, vi } from 'vitest';
import { render, screen, within, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AgendaView } from '../../src/components/AgendaView';
import type { M365Event, M365Calendar, M365TodoItem, M365TodoList } from '../../src/types';

vi.mock('../../src/hooks/useNow', () => ({
  useNow: vi.fn(() => new Date('2026-04-08T14:30:00')),
}));

const calendar: M365Calendar = { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true };
const list: M365TodoList = { id: 'l1', displayName: 'Tasks', color: '#ff0000' };

function ev(id: string, start: string, end: string, extra: Partial<M365Event> = {}): M365Event {
  return {
    id, subject: id,
    start: { dateTime: start, timeZone: 'UTC' },
    end: { dateTime: end, timeZone: 'UTC' },
    calendarId: 'cal1', isAllDay: false, ...extra,
  };
}

const todo: M365TodoItem = { id: 't1', title: 'File taxes', listId: 'l1', dueDate: '2026-04-08', importance: 'normal' };

// Wednesday Apr 8 2026 → week of Sun Apr 5
const base = { currentDate: new Date(2026, 3, 8), calendars: [calendar], todoLists: [list], onDayClick: vi.fn() };

describe('AgendaView', () => {
  it('renders a section for every day Sunday through Saturday', () => {
    render(<AgendaView {...base} events={[]} />);
    for (const d of ['05', '06', '07', '08', '09', '10', '11']) {
      expect(screen.getByTestId(`m365-agenda-day-2026-04-${d}`)).toBeInTheDocument();
    }
    expect(screen.getAllByText('Nothing scheduled')).toHaveLength(7);
  });

  it('lists all-day items, then tasks, then timed events in time order within a day', () => {
    const events = [
      ev('Lunch', '2026-04-08T12:00:00', '2026-04-08T13:00:00'),
      ev('Standup', '2026-04-08T09:00:00', '2026-04-08T09:15:00'),
      ev('Conference', '2026-04-08T00:00:00', '2026-04-09T00:00:00', { isAllDay: true }),
    ];
    render(<AgendaView {...base} events={events} todos={[todo]} />);
    const day = screen.getByTestId('m365-agenda-day-2026-04-08');
    // First button is the day heading; the rest are the items in display order.
    const labels = within(day).getAllByRole('button').slice(1).map((b) => b.getAttribute('aria-label'));
    expect(labels).toEqual([
      'Edit event: Conference',
      'View task: File taxes',
      'Edit event: Standup',
      'Edit event: Lunch',
    ]);
  });

  it('labels all-day events and tasks', () => {
    render(<AgendaView {...base} events={[ev('Conf', '2026-04-08T00:00:00', '2026-04-09T00:00:00', { isAllDay: true })]} todos={[todo]} />);
    const day = screen.getByTestId('m365-agenda-day-2026-04-08');
    expect(within(day).getByText('All day')).toBeInTheDocument();
    expect(within(day).getByText('Task')).toBeInTheDocument();
  });

  it('names the calendar or task list on each row', () => {
    render(<AgendaView {...base} events={[ev('Standup', '2026-04-08T09:00:00', '2026-04-08T09:15:00')]} todos={[todo]} />);
    const day = screen.getByTestId('m365-agenda-day-2026-04-08');
    expect(within(screen.getByLabelText('Edit event: Standup')).getByText('Work')).toBeInTheDocument();
    expect(within(screen.getByLabelText('View task: File taxes')).getByText('Tasks')).toBeInTheDocument();
    expect(day.querySelectorAll('.m365-calendar-color-swatch')).toHaveLength(2);
  });

  it('calls the click and context-menu handlers', async () => {
    const onEventClick = vi.fn();
    const onEventContextMenu = vi.fn();
    const onTodoClick = vi.fn();
    const onTodoContextMenu = vi.fn();
    const e = ev('Standup', '2026-04-08T09:00:00', '2026-04-08T09:15:00');
    render(
      <AgendaView
        {...base} events={[e]} todos={[todo]}
        onEventClick={onEventClick} onEventContextMenu={onEventContextMenu}
        onTodoClick={onTodoClick} onTodoContextMenu={onTodoContextMenu}
      />,
    );
    await userEvent.click(screen.getByLabelText('Edit event: Standup'));
    expect(onEventClick).toHaveBeenCalledWith(e);
    fireEvent.contextMenu(screen.getByLabelText('Edit event: Standup'));
    expect(onEventContextMenu).toHaveBeenCalledWith(e, expect.anything());
    await userEvent.click(screen.getByLabelText('View task: File taxes'));
    expect(onTodoClick).toHaveBeenCalledWith(todo);
    fireEvent.contextMenu(screen.getByLabelText('View task: File taxes'));
    expect(onTodoContextMenu).toHaveBeenCalledWith(todo, expect.anything());
  });

  it('opens the day when its heading is clicked and offers the day context menu', async () => {
    const onDayClick = vi.fn();
    const onDayContextMenu = vi.fn();
    render(<AgendaView {...base} events={[]} onDayClick={onDayClick} onDayContextMenu={onDayContextMenu} />);
    const day = screen.getByTestId('m365-agenda-day-2026-04-09');
    await userEvent.click(within(day).getAllByRole('button')[0]);
    expect(onDayClick).toHaveBeenCalledWith(expect.any(Date));
    expect((onDayClick.mock.calls[0][0] as Date).getDate()).toBe(9);
    fireEvent.contextMenu(day);
    expect(onDayContextMenu).toHaveBeenCalledWith({ kind: 'allday', date: expect.any(Date) }, expect.anything());
  });

  it('steps the week with the previous and next buttons', async () => {
    const onNavigate = vi.fn();
    render(<AgendaView {...base} events={[]} onNavigate={onNavigate} />);
    expect(screen.getByText(/Apr 5 – Apr 11, 2026/)).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText('Previous week'));
    await userEvent.click(screen.getByLabelText('Next week'));
    expect(onNavigate.mock.calls).toEqual([['prev'], ['next']]);
  });

  it('hides the week buttons when navigation is not provided', () => {
    render(<AgendaView {...base} events={[]} />);
    expect(screen.queryByLabelText('Next week')).not.toBeInTheDocument();
  });

  it('marks today', () => {
    render(<AgendaView {...base} events={[]} />);
    expect(screen.getByTestId('m365-agenda-day-2026-04-08')).toHaveClass('today');
    expect(screen.getByTestId('m365-agenda-day-2026-04-07')).not.toHaveClass('today');
  });

  it('shows "Until" for the continuation of an overnight event', () => {
    render(<AgendaView {...base} events={[ev('Overnight', '2026-04-07T22:00:00', '2026-04-08T02:00:00')]} />);
    const day = screen.getByTestId('m365-agenda-day-2026-04-08');
    expect(within(day).getByText(/^Until /)).toBeInTheDocument();
  });

  it('labels a timed event spanning three days by start, pass-through and end', () => {
    render(<AgendaView {...base} events={[ev('Retreat', '2026-04-06T22:00:00', '2026-04-08T09:00:00')]} />);
    expect(within(screen.getByTestId('m365-agenda-day-2026-04-06')).getByText(/^From /)).toBeInTheDocument();
    expect(within(screen.getByTestId('m365-agenda-day-2026-04-07')).getByText('All day')).toBeInTheDocument();
    expect(within(screen.getByTestId('m365-agenda-day-2026-04-08')).getByText(/^Until /)).toBeInTheDocument();
  });

  it('skips items whose calendar or list is unknown', () => {
    render(<AgendaView {...base} events={[ev('Orphan', '2026-04-08T09:00:00', '2026-04-08T10:00:00', { calendarId: 'gone' })]} todos={[{ ...todo, listId: 'gone' }]} />);
    expect(screen.queryByLabelText('Edit event: Orphan')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('View task: File taxes')).not.toBeInTheDocument();
  });

  it('shows weather in a day heading when available', () => {
    const weather = new Map([['2026-04-08', {
      date: '2026-04-08', tempCurrent: 60, tempHigh: 70.4, tempLow: 50, precipProbability: 0.1,
      condition: { iconCode: '01d', description: 'clear sky' },
    }]]);
    render(<AgendaView {...base} events={[]} weather={weather as never} />);
    expect(screen.getByText(/H: 70°F/)).toBeInTheDocument();
  });
});

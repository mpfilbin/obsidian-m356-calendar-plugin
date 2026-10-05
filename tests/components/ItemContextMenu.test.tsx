import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { MonthView } from '../../src/components/MonthView';
import { WeekView } from '../../src/components/WeekView';
import { DayView } from '../../src/components/DayView';
import { ConfirmForm } from '../../src/components/ConfirmModal';
import userEvent from '@testing-library/user-event';
import type { M365Calendar, M365Event, M365TodoItem, M365TodoList } from '../../src/types';

const calendar: M365Calendar = { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true };
const todoList: M365TodoList = { id: 'list1', displayName: 'Tasks', color: '#ef4444' };
const todo: M365TodoItem = { id: 'task1', title: 'Pay rent', listId: 'list1', dueDate: '2026-04-08', importance: 'normal' };

const timed: M365Event = {
  id: 'evt1', subject: 'Team Meeting', calendarId: 'cal1', isAllDay: false,
  start: { dateTime: '2026-04-08T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-08T10:00:00', timeZone: 'UTC' },
};
const multiDay: M365Event = {
  id: 'trip', subject: 'Trip', calendarId: 'cal1', isAllDay: true,
  start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
};
const allDay: M365Event = {
  id: 'ad', subject: 'Holiday', calendarId: 'cal1', isAllDay: true,
  start: { dateTime: '2026-04-08T00:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
};

/** Right-clicks and reports whether the browser's own menu / ancestors' handlers were suppressed. */
function rightClick(label: string) {
  const notPrevented = fireEvent.contextMenu(screen.getByLabelText(label));
  return { defaultPrevented: !notPrevented };
}

describe('right-click on events and tasks', () => {
  it('month view: event chip, multi-day bar and task each report their item', () => {
    const onEventContextMenu = vi.fn();
    const onTodoContextMenu = vi.fn();
    const onDayContextMenu = vi.fn();
    render(
      <MonthView
        currentDate={new Date(2026, 3, 1)}
        events={[timed, multiDay]}
        calendars={[calendar]}
        todos={[todo]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
        onEventContextMenu={onEventContextMenu}
        onTodoContextMenu={onTodoContextMenu}
      />,
    );
    expect(rightClick('Edit event: Team Meeting').defaultPrevented).toBe(true);
    expect(onEventContextMenu).toHaveBeenLastCalledWith(timed, expect.any(MouseEvent));
    rightClick('Edit event: Trip');
    expect(onEventContextMenu).toHaveBeenLastCalledWith(multiDay, expect.any(MouseEvent));
    expect(rightClick('View task: Pay rent').defaultPrevented).toBe(true);
    expect(onTodoContextMenu).toHaveBeenCalledWith(todo, expect.any(MouseEvent));
    // the day's own "New event / New task" menu must not also open
    expect(onDayContextMenu).not.toHaveBeenCalled();
  });

  it('month view: still suppresses the day menu when no item handler is given', () => {
    const onDayContextMenu = vi.fn();
    render(
      <MonthView
        currentDate={new Date(2026, 3, 1)}
        events={[timed]}
        calendars={[calendar]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
      />,
    );
    rightClick('Edit event: Team Meeting');
    expect(onDayContextMenu).not.toHaveBeenCalled();
  });

  it('week view: timeline block, all-day bar and task each report their item', () => {
    const onEventContextMenu = vi.fn();
    const onTodoContextMenu = vi.fn();
    const onDayContextMenu = vi.fn();
    render(
      <WeekView
        currentDate={new Date(2026, 3, 8)}
        events={[timed, multiDay]}
        calendars={[calendar]}
        todos={[todo]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
        onDayContextMenu={onDayContextMenu}
        onEventContextMenu={onEventContextMenu}
        onTodoContextMenu={onTodoContextMenu}
      />,
    );
    rightClick('Edit event: Team Meeting');
    expect(onEventContextMenu).toHaveBeenLastCalledWith(timed, expect.any(MouseEvent));
    rightClick('Edit event: Trip');
    expect(onEventContextMenu).toHaveBeenLastCalledWith(multiDay, expect.any(MouseEvent));
    rightClick('View task: Pay rent');
    expect(onTodoContextMenu).toHaveBeenCalledWith(todo, expect.any(MouseEvent));
    expect(onDayContextMenu).not.toHaveBeenCalled();
  });

  it('day view: timeline block, all-day chip and task each report their item', () => {
    const onEventContextMenu = vi.fn();
    const onTodoContextMenu = vi.fn();
    render(
      <DayView
        currentDate={new Date(2026, 3, 8)}
        events={[timed, allDay]}
        calendars={[calendar]}
        todos={[todo]}
        todoLists={[todoList]}
        onTimeClick={vi.fn()}
        onEventContextMenu={onEventContextMenu}
        onTodoContextMenu={onTodoContextMenu}
      />,
    );
    expect(rightClick('Edit event: Team Meeting').defaultPrevented).toBe(true);
    expect(onEventContextMenu).toHaveBeenLastCalledWith(timed, expect.any(MouseEvent));
    rightClick('Edit event: Holiday');
    expect(onEventContextMenu).toHaveBeenLastCalledWith(allDay, expect.any(MouseEvent));
    rightClick('View task: Pay rent');
    expect(onTodoContextMenu).toHaveBeenCalledWith(todo, expect.any(MouseEvent));
  });
});

describe('ConfirmForm', () => {
  const setup = (onConfirm: () => Promise<void>, onCancel = vi.fn()) =>
    render(
      <ConfirmForm
        message='Delete "Standup"?'
        confirmLabel="Delete event"
        pendingLabel="Deleting…"
        onConfirm={onConfirm}
        onCancel={onCancel}
      />,
    );

  it('shows the message and calls onCancel from Cancel', async () => {
    const onCancel = vi.fn();
    setup(vi.fn().mockResolvedValue(undefined), onCancel);
    expect(screen.getByText('Delete "Standup"?')).toBeInTheDocument();
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('disables both buttons and shows the pending label while deleting', async () => {
    let finish!: () => void;
    const onConfirm = vi.fn(() => new Promise<void>((resolve) => { finish = resolve; }));
    setup(onConfirm);
    await userEvent.click(screen.getByText('Delete event'));

    expect(await screen.findByText('Deleting…')).toBeDisabled();
    expect(screen.getByText('Cancel')).toBeDisabled();
    await userEvent.click(screen.getByText('Deleting…'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    finish();
  });

  it('re-enables and shows the error when the action fails', async () => {
    setup(vi.fn().mockRejectedValue(new Error('Failed to delete event: Forbidden')));
    await userEvent.click(screen.getByText('Delete event'));
    expect(await screen.findByText('Failed to delete event: Forbidden')).toBeInTheDocument();
    expect(screen.getByText('Delete event')).toBeEnabled();
  });
});

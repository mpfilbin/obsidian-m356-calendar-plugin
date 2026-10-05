import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, createEvent } from '@testing-library/react';
import React from 'react';
import { MonthView } from '../../src/components/MonthView';
import { WeekView } from '../../src/components/WeekView';
import { DayView } from '../../src/components/DayView';
import { DragProvider, type DragItem, type DropTarget } from '../../src/DragContext';
import type { M365Calendar, M365Event, M365TodoItem, M365TodoList } from '../../src/types';

const calendar: M365Calendar = { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true };
const todoList: M365TodoList = { id: 'list1', displayName: 'Tasks', color: '#ef4444' };

const timed = (over: Partial<M365Event> = {}): M365Event => ({
  id: 'evt1',
  subject: 'Team Meeting',
  start: { dateTime: '2026-04-08T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-08T10:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
  ...over,
});

const todo: M365TodoItem = { id: 'task1', title: 'Pay rent', listId: 'list1', dueDate: '2026-04-08', importance: 'normal' };

function dataTransfer() {
  return { setData: vi.fn(), effectAllowed: '', dropEffect: '' };
}

type DragType = 'dragStart' | 'dragOver' | 'dragLeave' | 'drop';
interface Pointer { clientX?: number; clientY?: number; relatedTarget?: Element | null }

/**
 * Fires a drag event with pointer coordinates. jsdom has no DragEvent, so testing-library falls
 * back to a plain Event that drops clientX/clientY; define them on the event ourselves.
 * Returns false when the handler called preventDefault (i.e. the drop was accepted).
 */
function fire(type: DragType, el: Element, pointer: Pointer = {}): boolean {
  const event = createEvent[type](el, { dataTransfer: dataTransfer() });
  for (const [key, value] of Object.entries({ clientX: 0, clientY: 0, relatedTarget: null, ...pointer })) {
    Object.defineProperty(event, key, { value, configurable: true });
  }
  return fireEvent(el, event);
}

/** Pins an element's size so pointer coordinates map to predictable columns / minutes. */
function fakeRect(el: Element, rect: Partial<DOMRect>) {
  vi.spyOn(el, 'getBoundingClientRect').mockReturnValue({
    left: 0, top: 0, right: 0, bottom: 0, x: 0, y: 0, width: 0, height: 0, toJSON: () => ({}), ...rect,
  } as DOMRect);
}

function withDrag(ui: React.ReactElement, opts: { canDrag?: (i: DragItem) => boolean; pending?: string[] } = {}) {
  const onDrop = vi.fn<(item: DragItem, target: DropTarget) => void>();
  const view = render(
    <DragProvider
      canDrag={opts.canDrag ?? (() => true)}
      isPending={(id) => opts.pending?.includes(id) ?? false}
      onDrop={onDrop}
    >
      {ui}
    </DragProvider>,
  );
  return { onDrop, ...view };
}

describe('month view drag and drop', () => {
  const month = (events: M365Event[], todos: M365TodoItem[] = []) => (
    <MonthView
      currentDate={new Date(2026, 3, 1)}
      events={events}
      calendars={[calendar]}
      todos={todos}
      todoLists={[todoList]}
      onDayClick={vi.fn()}
    />
  );

  /** The week row containing the April 8 cell (Sun Apr 5 – Sat Apr 11), with a fixed 700px width. */
  function weekRow() {
    const row = screen.getByLabelText('Edit event: Team Meeting').closest('.m365-month-week-row') as HTMLElement;
    fakeRect(row, { left: 0, width: 700 });
    return row;
  }

  it('makes editable events draggable and read-only ones not', () => {
    const { unmount } = withDrag(month([timed()]));
    expect(screen.getByLabelText('Edit event: Team Meeting')).toHaveAttribute('draggable', 'true');
    unmount();
    withDrag(month([timed()]), { canDrag: () => false });
    expect(screen.getByLabelText('Edit event: Team Meeting')).not.toHaveAttribute('draggable');
  });

  it('is not draggable and is dimmed while its move is being saved', () => {
    withDrag(month([timed()]), { pending: ['evt1'] });
    const btn = screen.getByLabelText('Edit event: Team Meeting');
    expect(btn).not.toHaveAttribute('draggable');
    expect(btn).toHaveClass('m365-drag-pending');
  });

  it('does nothing when dragging is not provided (no DragProvider)', () => {
    render(month([timed()]));
    expect(screen.getByLabelText('Edit event: Team Meeting')).not.toHaveAttribute('draggable');
  });

  it('drops an event onto the day column under the pointer', () => {
    const { onDrop } = withDrag(month([timed()]));
    const row = weekRow();
    fire('dragStart', screen.getByLabelText('Edit event: Team Meeting'));
    fire('dragOver', row, { clientX: 550 }); // column 5 → Fri Apr 10
    fire('drop', row, { clientX: 550 });

    expect(onDrop).toHaveBeenCalledTimes(1);
    const [item, target] = onDrop.mock.calls[0];
    expect(item).toMatchObject({ kind: 'event', grabbedDate: '2026-04-08' });
    expect(target).toEqual({ date: '2026-04-10' });
  });

  it('highlights the day under the pointer and clears it on leave', () => {
    withDrag(month([timed()]));
    const row = weekRow();
    fire('dragStart', screen.getByLabelText('Edit event: Team Meeting'));
    fire('dragOver', row, { clientX: 150 }); // column 1 → Mon Apr 6
    expect(row.querySelectorAll('.m365-drop-hover').length).toBeGreaterThan(0);
    fire('dragLeave', row, { relatedTarget: document.body });
    expect(row.querySelectorAll('.m365-drop-hover')).toHaveLength(0);
  });

  it('drops a task onto a day', () => {
    const { onDrop } = withDrag(month([], [todo]));
    const row = screen.getByLabelText('View task: Pay rent').closest('.m365-month-week-row') as HTMLElement;
    fakeRect(row, { left: 0, width: 700 });
    fire('dragStart', screen.getByLabelText('View task: Pay rent'));
    fire('drop', row, { clientX: 50 }); // column 0 → Sun Apr 5

    expect(onDrop).toHaveBeenCalledWith({ kind: 'todo', todo }, { date: '2026-04-05' });
  });

  it('ignores a drop when nothing is being dragged', () => {
    const { onDrop } = withDrag(month([timed()]));
    fire('drop', weekRow(), { clientX: 50 });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('remembers which day of a multi-day bar was grabbed', () => {
    const multi = timed({
      id: 'trip',
      subject: 'Trip',
      isAllDay: true,
      start: { dateTime: '2026-04-06T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-10T00:00:00', timeZone: 'UTC' }, // Mon–Thu
    });
    const { onDrop } = withDrag(month([multi]));
    const bar = screen.getByLabelText('Edit event: Trip');
    fakeRect(bar, { left: 100, width: 400 }); // 4 day columns of 100px starting at Monday
    fire('dragStart', bar, { clientX: 320 }); // third day → Wed Apr 8

    const row = bar.closest('.m365-month-week-row') as HTMLElement;
    fakeRect(row, { left: 0, width: 700 });
    fire('drop', row, { clientX: 650 }); // Sat Apr 11

    expect(onDrop.mock.calls[0][0]).toMatchObject({ kind: 'event', grabbedDate: '2026-04-08' });
    expect(onDrop.mock.calls[0][1]).toEqual({ date: '2026-04-11' });
  });
});

describe('week and day timeline drag and drop', () => {
  const week = (events: M365Event[], todos: M365TodoItem[] = []) => (
    <WeekView
      currentDate={new Date(2026, 3, 8)}
      events={events}
      calendars={[calendar]}
      todos={todos}
      todoLists={[todoList]}
      onDayClick={vi.fn()}
    />
  );

  function column(date: string) {
    const col = screen.getByTestId(`m365-week-timeline-${date}`);
    fakeRect(col, { top: 0, height: 1440 });
    return col;
  }

  it('drops a timed event at the snapped time, keeping where it was grabbed', () => {
    const { onDrop } = withDrag(week([timed()]));
    const block = screen.getByLabelText('Edit event: Team Meeting');
    fakeRect(block, { top: 540, height: 60 }); // starts 09:00
    fire('dragStart', block, { clientY: 560 }); // grabbed 20 min below its top

    const target = column('2026-04-09');
    fire('dragOver', target, { clientY: 14 * 60 + 20 });
    expect(document.querySelector('.m365-drop-indicator-label')?.textContent).toMatch(/2:00\s?PM|14:00/); // snapped start time
    fire('drop', target, { clientY: 14 * 60 + 20 });

    // pointer at 14:20, grabbed 20 min into the block → block starts 14:00
    expect(onDrop).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'event', grabOffsetMin: 20 }),
      { date: '2026-04-09', minutes: 14 * 60 },
    );
  });

  it('clamps a long event so it stays within the day', () => {
    const long = timed({ end: { dateTime: '2026-04-08T11:00:00', timeZone: 'UTC' } }); // 2h
    const { onDrop } = withDrag(week([long]));
    const block = screen.getByLabelText('Edit event: Team Meeting');
    fakeRect(block, { top: 540, height: 120 });
    fire('dragStart', block, { clientY: 540 });
    const target = column('2026-04-08');
    fire('drop', target, { clientY: 1430 });
    expect(onDrop.mock.calls[0][1]).toEqual({ date: '2026-04-08', minutes: 22 * 60 });
  });

  it('refuses all-day events over the timeline (the drop is not accepted)', () => {
    const allDay = timed({
      id: 'ad', subject: 'Holiday', isAllDay: true,
      start: { dateTime: '2026-04-08T00:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-04-09T00:00:00', timeZone: 'UTC' },
    });
    const { onDrop } = withDrag(week([allDay, timed()]));
    fire('dragStart', screen.getByLabelText('Edit event: Holiday'), { clientX: 10 });
    const target = column('2026-04-09');
    const accepted = !fire('dragOver', target, { clientY: 100 }); // fireEvent returns false when preventDefault was called
    expect(accepted).toBe(false);
    fire('drop', target, { clientY: 100 });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('moves a timed event to another day from the all-day row, keeping its time', () => {
    const { onDrop } = withDrag(week([timed()]));
    fire('dragStart', screen.getByLabelText('Edit event: Team Meeting'), { clientY: 545 });
    const allDay = document.querySelector('.m365-week-allday-main') as HTMLElement;
    fakeRect(allDay, { left: 0, width: 700 });
    fire('drop', allDay, { clientX: 650 }); // column 6 → Sat Apr 11
    expect(onDrop.mock.calls[0][1]).toEqual({ date: '2026-04-11' });
  });

  it('moves an event between days from the week header', () => {
    const { onDrop } = withDrag(week([timed()]));
    fire('dragStart', screen.getByLabelText('Edit event: Team Meeting'), { clientY: 545 });
    const header = document.querySelector('[data-drop-date="2026-04-07"]') as HTMLElement;
    fire('dragOver', header);
    expect(header).toHaveClass('m365-drop-hover');
    fire('drop', header);
    expect(onDrop.mock.calls[0][1]).toEqual({ date: '2026-04-07' });
  });

  it('only highlights the header when hovering the header, not the all-day row', () => {
    withDrag(week([timed()]));
    fire('dragStart', screen.getByLabelText('Edit event: Team Meeting'));
    const allDay = document.querySelector('.m365-week-allday-main') as HTMLElement;
    fakeRect(allDay, { left: 0, width: 700 });
    fire('dragOver', allDay, { clientX: 350 }); // column 3 → Wed Apr 8
    expect(document.querySelector('[data-drop-date="2026-04-08"]')).not.toHaveClass('m365-drop-hover');
    expect(document.querySelectorAll('.m365-week-allday-cell.m365-drop-hover')).toHaveLength(1);
  });

  it('lets a task be dropped on a timeline column to change its day', () => {
    const { onDrop } = withDrag(week([], [todo]));
    fire('dragStart', screen.getByLabelText('View task: Pay rent'));
    fire('drop', column('2026-04-10'), { clientY: 300 });
    expect(onDrop).toHaveBeenCalledWith({ kind: 'todo', todo }, { date: '2026-04-10' });
  });

  it('day view: drags a timed event to a new time on the same day', () => {
    const { onDrop } = withDrag(
      <DayView
        currentDate={new Date(2026, 3, 8)}
        events={[timed()]}
        calendars={[calendar]}
        onTimeClick={vi.fn()}
      />,
    );
    const block = screen.getByLabelText('Edit event: Team Meeting');
    fakeRect(block, { top: 540, height: 60 });
    fire('dragStart', block, { clientY: 540 });
    const col = screen.getByTestId('m365-day-timeline');
    fakeRect(col, { top: 0, height: 1440 });
    fire('drop', col, { clientY: 8 * 60 + 5 });
    expect(onDrop.mock.calls[0][1]).toEqual({ date: '2026-04-08', minutes: 8 * 60 });
  });
});

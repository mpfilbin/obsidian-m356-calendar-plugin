import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { OverflowPopup } from '../../src/components/OverflowPopup';
import { M365Event, M365Calendar, M365TodoItem, M365TodoList } from '../../src/types';

const calendar: M365Calendar = {
  id: 'cal1',
  name: 'Work',
  color: '#0078d4',
  isDefaultCalendar: true,
  canEdit: true,
};

const event1: M365Event = {
  id: 'evt1',
  subject: 'Stand-up',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T09:30:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const event2: M365Event = {
  id: 'evt2',
  subject: 'Design Review',
  start: { dateTime: '2026-04-04T14:00:00', timeZone: 'UTC' },
  end: { dateTime: '2026-04-04T15:00:00', timeZone: 'UTC' },
  calendarId: 'cal1',
  isAllDay: false,
};

const todoList: M365TodoList = { id: 'list1', displayName: 'Work', color: '#3b82f6' };

const todo1: M365TodoItem = {
  id: 'task1',
  title: 'Buy milk',
  listId: 'list1',
  dueDate: '2026-04-04',
  importance: 'normal',
};

const anchorRect = {
  top: 100, left: 50, right: 200, bottom: 130,
  width: 150, height: 30, x: 50, y: 100,
  toJSON: () => ({}),
} as DOMRect;

describe('OverflowPopup', () => {
  beforeEach(() => {
    vi.stubGlobal('innerWidth', 1024);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders overflow events as compact event cards', () => {
    render(
      <OverflowPopup
        events={[event1, event2]}
        todos={[]}
        calendarMap={new Map([['cal1', calendar]])}
        todoListMap={new Map()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.getByText('Stand-up')).toBeInTheDocument();
    expect(screen.getByText('Design Review')).toBeInTheDocument();
  });

  it('renders overflow todos as compact todo cards', () => {
    render(
      <OverflowPopup
        events={[]}
        todos={[todo1]}
        calendarMap={new Map()}
        todoListMap={new Map([['list1', todoList]])}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('skips events whose calendar is missing from calendarMap', () => {
    render(
      <OverflowPopup
        events={[event1]}
        todos={[]}
        calendarMap={new Map()}
        todoListMap={new Map()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.queryByText('Stand-up')).not.toBeInTheDocument();
  });

  it('skips todos whose list is missing from todoListMap', () => {
    render(
      <OverflowPopup
        events={[]}
        todos={[todo1]}
        calendarMap={new Map()}
        todoListMap={new Map()}
        anchorRect={anchorRect}
      />,
    );
    expect(screen.queryByText('Buy milk')).not.toBeInTheDocument();
  });

  it('positions popup to the right of the anchor when space allows', () => {
    // innerWidth=1024, anchorRect.right=200: 200 + 8 + 220 = 428 < 1024 → right side
    render(
      <OverflowPopup
        events={[event1]}
        todos={[]}
        calendarMap={new Map([['cal1', calendar]])}
        todoListMap={new Map()}
        anchorRect={anchorRect}
      />,
    );
    const popup = document.querySelector('.m365-overflow-popup') as HTMLElement;
    expect(popup.style.left).toBe('208px'); // 200 + 8
  });

  it('falls back to left of anchor when right side would overflow viewport', () => {
    vi.stubGlobal('innerWidth', 400);
    // anchorRect.right=200 → 200 + 8 + 220 = 428 > 400 → left side
    // left = anchorRect.left(50) - 8 - 220 = -178
    const narrowRect = { ...anchorRect, right: 200 } as DOMRect;
    render(
      <OverflowPopup
        events={[event1]}
        todos={[]}
        calendarMap={new Map([['cal1', calendar]])}
        todoListMap={new Map()}
        anchorRect={narrowRect}
      />,
    );
    const popup = document.querySelector('.m365-overflow-popup') as HTMLElement;
    expect(popup.style.left).toBe('-178px'); // 50 - 8 - 220
  });
});

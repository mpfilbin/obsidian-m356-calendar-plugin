import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarSelector } from '../../src/components/CalendarSelector';
import { M365Calendar, M365TodoList } from '../../src/types';

const calendars: M365Calendar[] = [
  { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true },
  { id: 'cal2', name: 'Personal', color: '#a4c2f4', isDefaultCalendar: false, canEdit: true },
];

function renderSelector(collapsed = false, onToggleCollapse = vi.fn()) {
  return render(
    <CalendarSelector
      calendars={calendars}
      enabledCalendarIds={[]}
      onToggle={vi.fn()}
      todoLists={[]}
      enabledTodoListIds={[]}
      onToggleTodoList={vi.fn()}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />,
  );
}

describe('CalendarSelector — expanded', () => {
  it('renders all calendar names', () => {
    renderSelector();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('shows enabled calendars as checked', () => {
    render(
      <CalendarSelector
        calendars={calendars}
        enabledCalendarIds={['cal1']}
        onToggle={vi.fn()}
        todoLists={[]}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Work' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Personal' })).not.toBeChecked();
  });

  it('calls onToggle with the calendar id when a checkbox is clicked', async () => {
    const onToggle = vi.fn();
    render(
      <CalendarSelector
        calendars={calendars}
        enabledCalendarIds={['cal1']}
        onToggle={onToggle}
        todoLists={[]}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Personal' }));
    expect(onToggle).toHaveBeenCalledWith('cal2');
  });

  it('renders colour swatches with calendar colours', () => {
    const { container } = renderSelector();
    const swatches = container.querySelectorAll('.m365-calendar-color-swatch');
    expect(swatches).toHaveLength(2);
    expect((swatches[0] as HTMLElement).style.backgroundColor).toBe('rgb(0, 120, 212)');
  });

  it('shows a collapse button with ◀', () => {
    renderSelector();
    expect(screen.getByRole('button', { name: 'Collapse calendar list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Collapse calendar list' })).toHaveTextContent('◀');
  });

  it('calls onToggleCollapse when the collapse button is clicked', async () => {
    const onToggleCollapse = vi.fn();
    renderSelector(false, onToggleCollapse);
    await userEvent.click(screen.getByRole('button', { name: 'Collapse calendar list' }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});

describe('CalendarSelector — collapsed', () => {
  it('does not render calendar names', () => {
    renderSelector(true);
    expect(screen.queryByText('Work')).not.toBeInTheDocument();
    expect(screen.queryByText('Personal')).not.toBeInTheDocument();
  });

  it('shows an expand button with ▶', () => {
    renderSelector(true);
    expect(screen.getByRole('button', { name: 'Expand calendar list' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Expand calendar list' })).toHaveTextContent('▶');
  });

  it('calls onToggleCollapse when the expand strip is clicked', async () => {
    const onToggleCollapse = vi.fn();
    renderSelector(true, onToggleCollapse);
    await userEvent.click(screen.getByRole('button', { name: 'Expand calendar list' }));
    expect(onToggleCollapse).toHaveBeenCalledTimes(1);
  });
});

const todoLists: M365TodoList[] = [
  { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' },
  { id: 'list2', displayName: 'Personal', color: '#22c55e' },
];

describe('CalendarSelector — Tasks section', () => {
  it('renders a Tasks heading', () => {
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('renders todo list display names', () => {
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByText('Work Tasks')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('shows enabled todo lists as checked', () => {
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={['list1']}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Work Tasks' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Personal' })).not.toBeChecked();
  });

  it('calls onToggleTodoList with the list id when a checkbox is clicked', async () => {
    const onToggleTodoList = vi.fn();
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={onToggleTodoList}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Work Tasks' }));
    expect(onToggleTodoList).toHaveBeenCalledWith('list1');
  });

  it('does not render the Tasks section when collapsed', () => {
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.queryByText('Tasks')).not.toBeInTheDocument();
  });

  it('renders color swatches for todo lists', () => {
    const { container } = render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    // todoLists has 2 lists, each gets a swatch
    const swatches = container.querySelectorAll('.m365-calendar-color-swatch');
    expect(swatches.length).toBeGreaterThanOrEqual(2);
  });
});

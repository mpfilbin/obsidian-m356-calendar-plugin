import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarSelector } from '../../src/components/CalendarSelector';
import { M365Calendar } from '../../src/types';

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

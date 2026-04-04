import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarSelector } from '../../src/components/CalendarSelector';
import { M365Calendar } from '../../src/types';

const calendars: M365Calendar[] = [
  { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true },
  { id: 'cal2', name: 'Personal', color: '#a4c2f4', isDefaultCalendar: false, canEdit: true },
];

describe('CalendarSelector', () => {
  it('renders all calendar names', () => {
    render(<CalendarSelector calendars={calendars} enabledCalendarIds={[]} onToggle={vi.fn()} />);
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('shows enabled calendars as checked', () => {
    render(<CalendarSelector calendars={calendars} enabledCalendarIds={['cal1']} onToggle={vi.fn()} />);
    expect(screen.getByRole('checkbox', { name: 'Work' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Personal' })).not.toBeChecked();
  });

  it('calls onToggle with the calendar id when a checkbox is clicked', async () => {
    const onToggle = vi.fn();
    render(<CalendarSelector calendars={calendars} enabledCalendarIds={['cal1']} onToggle={onToggle} />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Personal' }));
    expect(onToggle).toHaveBeenCalledWith('cal2');
  });

  it('renders colour swatches with calendar colours', () => {
    const { container } = render(
      <CalendarSelector calendars={calendars} enabledCalendarIds={[]} onToggle={vi.fn()} />,
    );
    const swatches = container.querySelectorAll('.m365-calendar-color-swatch');
    expect(swatches).toHaveLength(2);
    expect((swatches[0] as HTMLElement).style.backgroundColor).toBe('rgb(0, 120, 212)');
  });
});

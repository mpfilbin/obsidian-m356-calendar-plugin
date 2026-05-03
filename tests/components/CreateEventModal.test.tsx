import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateEventForm, buildRecurrence } from '../../src/components/CreateEventModal';
import { M365Calendar } from '../../src/types';

const calendars: M365Calendar[] = [
  { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true },
  { id: 'cal2', name: 'Personal', color: '#a4c2f4', isDefaultCalendar: false, canEdit: true },
];

describe('CreateEventForm', () => {
  let onSubmit: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSubmit = vi.fn();
    onCancel = vi.fn();
  });

  it('renders all required fields', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByPlaceholderText('Event title')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getAllByRole('textbox').length).toBeGreaterThan(0);
  });

  it('calls onCancel when Cancel is clicked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('shows validation error when title is empty and Create is clicked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByText('Create'));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with correct data when form is valid', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'My Event');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith(
      'cal1',
      expect.objectContaining({ subject: 'My Event' }),
    );
  });

  it('renders an All day checkbox unchecked by default', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    const checkbox = screen.getByRole('checkbox', { name: /all day/i }) as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
  });

  it('switches start and end inputs to date type when All day is checked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect((screen.getByLabelText('Start') as HTMLInputElement).type).toBe('datetime-local');
    expect((screen.getByLabelText('End') as HTMLInputElement).type).toBe('datetime-local');

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    expect((screen.getByLabelText('Start') as HTMLInputElement).type).toBe('date');
    expect((screen.getByLabelText('End') as HTMLInputElement).type).toBe('date');
  });

  it('advances end date by one day when toggling All day and start equals end date', async () => {
    // initialDate sets default start=09:00 and end=10:00 on the same day (2026-04-10)
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 3, 10)} // April 10 local time
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-04-10');
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('2026-04-11');
  });

  it('submits with isAllDay true when All day is checked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'Day Off');
    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));
    await userEvent.click(screen.getByText('Create'));

    expect(onSubmit).toHaveBeenCalledWith('cal1', expect.objectContaining({ isAllDay: true }));
  });

  it('restores correct local date when toggling All day off after it was on', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 3, 10)} // April 10 local time
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    // Toggle on then off
    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    // Start should be back to datetime-local with April 10 (not April 9 due to UTC shift)
    const startInput = screen.getByLabelText('Start') as HTMLInputElement;
    expect(startInput.type).toBe('datetime-local');
    expect(startInput.value.startsWith('2026-04-10')).toBe(true);
  });

  it('shows validation error when all-day end date is not after start date', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 3, 10)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByLabelText('Title'), 'Conference');
    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    // Manually set end to same day as start
    const endInput = screen.getByLabelText('End') as HTMLInputElement;
    await userEvent.clear(endInput);
    await userEvent.type(endInput, '2026-04-10');

    await userEvent.click(screen.getByText('Create'));
    expect(screen.getByText('For all-day events, the end date must be after the start date')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('submits with isAllDay false when All day is not checked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date('2026-04-10')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'Standup');
    await userEvent.click(screen.getByText('Create'));

    expect(onSubmit).toHaveBeenCalledWith('cal1', expect.objectContaining({ isAllDay: false }));
  });

  it('does not show frequency select when Repeat is unchecked', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByRole('combobox', { name: /frequency/i })).not.toBeInTheDocument();
  });

  it('shows recurrence controls when Repeat checkbox is checked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    expect(screen.getByRole('combobox', { name: /frequency/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /no end/i })).toBeInTheDocument();
  });

  it('pre-checks the start day in the day-of-week row for weekly frequency', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)} // Monday
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    // default frequency is weekly
    const monCb = screen.getByRole('checkbox', { name: /^monday$/i }) as HTMLInputElement;
    expect(monCb).toBeInTheDocument();
    expect(monCb.checked).toBe(true);
    const sunCb = screen.getByRole('checkbox', { name: /^sunday$/i }) as HTMLInputElement;
    expect(sunCb.checked).toBe(false);
  });

  it('shows absolute and relative radio options when Monthly is selected', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)} // Monday the 15th → "third Monday"
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /frequency/i }), 'monthly');
    expect(screen.getByRole('radio', { name: /on day 15/i })).toBeInTheDocument();
    expect(screen.getByRole('radio', { name: /third monday/i })).toBeInTheDocument();
  });

  it('does not show day-of-week row when Daily is selected', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /frequency/i }), 'daily');
    expect(screen.queryByRole('checkbox', { name: /^monday$/i })).not.toBeInTheDocument();
  });

  it('submits with weekly recurrence when Repeat is checked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'Standup');
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith(
      'cal1',
      expect.objectContaining({
        recurrence: expect.objectContaining({ frequency: 'weekly' }),
      }),
    );
  });

  it('submits without recurrence when Repeat is unchecked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'One-off');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith('cal1', expect.objectContaining({ recurrence: undefined }));
  });

  it('shows validation error when Weekly selected with no days checked', async () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 5, 15)} // Monday pre-checked
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'Standup');
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /^monday$/i })); // uncheck
    await userEvent.click(screen.getByText('Create'));
    expect(screen.getByText('Select at least one day of the week')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe('buildRecurrence', () => {
  // June 15 2026 is a Monday; 15th of month; 15+7=22 ≤ 30 days → 'third' occurrence
  const MON_15 = new Date(2026, 5, 15, 9, 0, 0);

  it('returns undefined when repeat is false', () => {
    expect(buildRecurrence(false, 'weekly', '1', ['monday'], 'absolute', 'noEnd', '', '10', MON_15)).toBeUndefined();
  });

  it('returns daily noEnd recurrence', () => {
    const result = buildRecurrence(true, 'daily', '1', [], 'absolute', 'noEnd', '', '10', MON_15);
    expect(result).toEqual({ frequency: 'daily', interval: 1, end: { type: 'noEnd' } });
  });

  it('returns weekly recurrence with selected days', () => {
    const result = buildRecurrence(true, 'weekly', '2', ['monday', 'friday'], 'absolute', 'noEnd', '', '10', MON_15);
    expect(result).toEqual({
      frequency: 'weekly', interval: 2, daysOfWeek: ['monday', 'friday'], end: { type: 'noEnd' },
    });
  });

  it('falls back to start day when weekly daysOfWeek list is empty', () => {
    const result = buildRecurrence(true, 'weekly', '1', [], 'absolute', 'noEnd', '', '10', MON_15);
    expect(result?.daysOfWeek).toEqual(['monday']);
  });

  it('returns absoluteMonthly recurrence', () => {
    const result = buildRecurrence(true, 'monthly', '1', [], 'absolute', 'noEnd', '', '10', MON_15);
    expect(result).toEqual({ frequency: 'absoluteMonthly', interval: 1, end: { type: 'noEnd' } });
  });

  it('returns relativeMonthly recurrence with weekIndex and daysOfWeek derived from start date', () => {
    const result = buildRecurrence(true, 'monthly', '1', [], 'relative', 'noEnd', '', '10', MON_15);
    expect(result).toEqual({
      frequency: 'relativeMonthly', interval: 1,
      daysOfWeek: ['monday'],
      weekIndex: 'third',
      end: { type: 'noEnd' },
    });
  });

  it('returns absoluteYearly recurrence', () => {
    const result = buildRecurrence(true, 'yearly', '1', [], 'absolute', 'noEnd', '', '10', MON_15);
    expect(result).toEqual({ frequency: 'absoluteYearly', interval: 1, end: { type: 'noEnd' } });
  });

  it('returns endDate range', () => {
    const result = buildRecurrence(true, 'weekly', '1', ['monday'], 'absolute', 'endDate', '2026-12-31', '10', MON_15);
    expect(result?.end).toEqual({ type: 'endDate', endDate: '2026-12-31' });
  });

  it('returns numbered range', () => {
    const result = buildRecurrence(true, 'daily', '1', [], 'absolute', 'numbered', '', '5', MON_15);
    expect(result?.end).toEqual({ type: 'numbered', numberOfOccurrences: 5 });
  });

  it('clamps interval to minimum of 1 for invalid string input', () => {
    const result = buildRecurrence(true, 'daily', 'xyz', [], 'absolute', 'noEnd', '', '10', MON_15);
    expect(result?.interval).toBe(1);
  });

  it('returns weekIndex "last" when start day is the last occurrence of that weekday in the month', () => {
    // June 29 2026 is a Monday; 29+7=36 > 30 → last
    const lastMon = new Date(2026, 5, 29, 9, 0, 0);
    const result = buildRecurrence(true, 'monthly', '1', [], 'relative', 'noEnd', '', '10', lastMon);
    expect(result?.weekIndex).toBe('last');
  });
});

describe('CreateEventForm — initialAllDay', () => {
  const calendars: M365Calendar[] = [
    { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true },
  ];

  it('initializes with all-day checkbox checked when initialAllDay is true', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 3, 10)}
        initialAllDay={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('uses date-only input for start when initialAllDay is true', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 3, 10)}
        initialAllDay={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const startInput = document.getElementById('m365-create-start') as HTMLInputElement;
    expect(startInput.type).toBe('date');
  });

  it('start date string matches initialDate when initialAllDay is true', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 3, 10)}
        initialAllDay={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const startInput = document.getElementById('m365-create-start') as HTMLInputElement;
    expect(startInput.value).toBe('2026-04-10');
  });

  it('end date is the day after initialDate when initialAllDay is true', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 3, 10)}
        initialAllDay={true}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const endInput = document.getElementById('m365-create-end') as HTMLInputElement;
    expect(endInput.value).toBe('2026-04-11');
  });

  it('all-day checkbox is unchecked by default (no initialAllDay prop)', () => {
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 3, 10)}
        onSubmit={vi.fn()}
        onCancel={vi.fn()}
      />,
    );
    const checkbox = screen.getByRole('checkbox') as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
  });

  it('submits with isAllDay true and correct dates when initialAllDay is true and no interaction occurs', async () => {
    const onSubmit = vi.fn();
    render(
      <CreateEventForm
        calendars={calendars}
        defaultCalendarId="cal1"
        initialDate={new Date(2026, 3, 10)}
        initialAllDay={true}
        onSubmit={onSubmit}
        onCancel={vi.fn()}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Event title'), 'Day Off');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith('cal1', expect.objectContaining({
      subject: 'Day Off',
      isAllDay: true,
    }));
    const callArgs = onSubmit.mock.calls[0][1];
    expect(callArgs.start).toEqual(new Date('2026-04-10T00:00:00.000Z'));
    expect(callArgs.end).toEqual(new Date('2026-04-11T00:00:00.000Z'));
  });
});

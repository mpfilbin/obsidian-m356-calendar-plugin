import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateEventForm } from '../../src/components/CreateEventModal';
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

  describe('CreateEventForm — initialAllDay', () => {
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
  });
});

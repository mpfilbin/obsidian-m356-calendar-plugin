import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventDetailForm } from '../../src/components/EventDetailModal';
import { M365Event, M365Calendar } from '../../src/types';

const event: M365Event = {
  id: 'evt1',
  subject: 'Team Meeting',
  start: { dateTime: '2026-04-04T09:00:00', timeZone: 'America/New_York' },
  end: { dateTime: '2026-04-04T10:00:00', timeZone: 'America/New_York' },
  calendarId: 'cal1',
  isAllDay: false,
  bodyPreview: 'Discuss Q2 plans',
  location: 'Conference Room A',
};

const calendars: M365Calendar[] = [
  { id: 'cal1', name: 'Work', color: '#0078d4', isDefaultCalendar: true, canEdit: true },
  { id: 'cal2', name: 'Personal', color: '#e3008c', isDefaultCalendar: false, canEdit: true },
  { id: 'cal3', name: 'Shared', color: '#00b294', isDefaultCalendar: false, canEdit: false },
];

describe('EventDetailForm', () => {
  let onSave: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSave = vi.fn().mockResolvedValue(undefined);
    onCancel = vi.fn();
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  it('pre-populates subject field from event', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Team Meeting');
  });

  it('pre-populates location field from event', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('Conference Room A');
  });

  it('pre-populates description from event bodyPreview', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Discuss Q2 plans');
  });

  it('calls onCancel when Cancel is clicked', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onSave with correct patch when OK is clicked', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    const titleInput = screen.getByLabelText('Title');
    await userEvent.clear(titleInput);
    await userEvent.type(titleInput, 'Updated Meeting');
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const patch = onSave.mock.calls[0][0];
    expect(patch.subject).toBe('Updated Meeting');
  });

  it('shows inline error when onSave rejects', async () => {
    onSave.mockRejectedValue(new Error('Network error'));
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows validation error when subject is empty', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    const titleInput = screen.getByLabelText('Title');
    await userEvent.clear(titleInput);
    await userEvent.click(screen.getByText('OK'));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders All day checkbox reflecting event.isAllDay', () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />);
    const checkbox = screen.getByRole('checkbox', { name: /all day/i }) as HTMLInputElement;
    expect(checkbox).toBeInTheDocument();
    expect(checkbox.checked).toBe(false);
  });

  it('renders All day checkbox checked for all-day events', () => {
    const allDayEvent = {
      ...event,
      isAllDay: true,
      start: { dateTime: '2026-04-04T00:00:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-04-05T00:00:00', timeZone: 'America/New_York' },
    };
    render(<EventDetailForm event={allDayEvent} onSave={onSave} onCancel={onCancel} calendars={[]} />);
    const checkbox = screen.getByRole('checkbox', { name: /all day/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('advances end date by one day when toggling All day on a same-day timed event', async () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-04-04');
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('2026-04-05');
  });

  it('restores correct local date when toggling All day off after it was on', async () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    const startInput = screen.getByLabelText('Start') as HTMLInputElement;
    expect(startInput.type).toBe('datetime-local');
    expect(startInput.value.startsWith('2026-04-04')).toBe(true);
  });

  it('keeps the original end date when toggling All day on a multi-day timed event', async () => {
    const multiDayEvent = {
      ...event,
      start: { dateTime: '2026-04-04T09:00:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-04-06T10:00:00', timeZone: 'America/New_York' },
    };
    render(<EventDetailForm event={multiDayEvent} onSave={onSave} onCancel={onCancel} calendars={[]} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-04-04');
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('2026-04-06');
  });

  it('does not render a Delete button when onDelete is not provided', () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('renders a Delete button when onDelete is provided', () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows confirm UI and disables inputs when Delete is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('This will permanently delete the event.')).toBeInTheDocument();
    expect(screen.getByText('Delete event')).toBeInTheDocument();
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true);
  });

  it('returns to normal state when Cancel is clicked in confirm mode', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('This will permanently delete the event.')).not.toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('calls onDelete when Delete event button is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('shows inline error and resets confirm state when onDelete rejects', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Server error'));
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
    expect(screen.queryByText('This will permanently delete the event.')).not.toBeInTheDocument();
  });

  it('logs to console.error when onDelete rejects', async () => {
    const error = new Error('Server error');
    const onDelete = vi.fn().mockRejectedValue(error);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} calendars={[]} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith('M365 Calendar:', error),
    );
  });

  // ── Calendar dropdown ──────────────────────────────────────────────────────

  it('does not render calendar field when calendars list is empty', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={[]} />,
    );
    expect(screen.queryByLabelText('Calendar')).not.toBeInTheDocument();
  });

  it('renders calendar dropdown with all calendars when provided', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    expect(screen.getByLabelText('Calendar')).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Work' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Personal' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Shared' })).toBeInTheDocument();
  });

  it('pre-selects the current event calendar in the dropdown', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    expect((screen.getByLabelText('Calendar') as HTMLSelectElement).value).toBe('cal1');
  });

  it('disables the calendar dropdown when the event calendar has canEdit false', () => {
    const readOnlyEvent = { ...event, calendarId: 'cal3' };
    render(
      <EventDetailForm event={readOnlyEvent} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    expect((screen.getByLabelText('Calendar') as HTMLSelectElement).disabled).toBe(true);
  });

  it('does not disable the calendar dropdown when the event calendar has canEdit true', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    expect((screen.getByLabelText('Calendar') as HTMLSelectElement).disabled).toBe(false);
  });

  it('marks canEdit=false options as disabled in the dropdown', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    const sharedOption = screen.getByRole('option', { name: 'Shared' }) as HTMLOptionElement;
    expect(sharedOption.disabled).toBe(true);
  });

  it('does not mark canEdit=true options as disabled', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    const personalOption = screen.getByRole('option', { name: 'Personal' }) as HTMLOptionElement;
    expect(personalOption.disabled).toBe(false);
  });

  it('passes the selected targetCalendarId as the second argument to onSave', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    await userEvent.selectOptions(screen.getByLabelText('Calendar'), 'cal2');
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1]).toBe('cal2');
  });

  it('passes the original calendarId as targetCalendarId when calendar is not changed', async () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0][1]).toBe('cal1');
  });

  it('renders a color swatch next to the calendar dropdown', () => {
    render(
      <EventDetailForm event={event} onSave={onSave} onCancel={onCancel} calendars={calendars} />,
    );
    const row = document.querySelector('.m365-form-calendar-select-row');
    expect(row).not.toBeNull();
    const swatch = row!.querySelector('.m365-calendar-color-swatch') as HTMLElement | null;
    expect(swatch).not.toBeNull();
    expect(swatch!.style.backgroundColor).not.toBe('');
  });
});

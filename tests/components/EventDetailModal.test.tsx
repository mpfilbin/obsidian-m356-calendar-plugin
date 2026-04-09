import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EventDetailForm } from '../../src/components/EventDetailModal';
import { M365Event } from '../../src/types';

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
      <EventDetailForm event={event}onSave={onSave} onCancel={onCancel} />,
    );
    expect((screen.getByLabelText('Title') as HTMLInputElement).value).toBe('Team Meeting');
  });

  it('pre-populates location field from event', () => {
    render(
      <EventDetailForm event={event}onSave={onSave} onCancel={onCancel} />,
    );
    expect((screen.getByLabelText('Location') as HTMLInputElement).value).toBe('Conference Room A');
  });

  it('pre-populates description from event bodyPreview', () => {
    render(
      <EventDetailForm event={event}onSave={onSave} onCancel={onCancel} />,
    );
    expect((screen.getByLabelText('Description') as HTMLTextAreaElement).value).toBe('Discuss Q2 plans');
  });

  it('calls onCancel when Cancel is clicked', async () => {
    render(
      <EventDetailForm event={event}onSave={onSave} onCancel={onCancel} />,
    );
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalled();
  });

  it('calls onSave with correct patch when OK is clicked', async () => {
    render(
      <EventDetailForm event={event}onSave={onSave} onCancel={onCancel} />,
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
      <EventDetailForm event={event}onSave={onSave} onCancel={onCancel} />,
    );
    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(screen.getByText('Network error')).toBeInTheDocument());
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('shows validation error when subject is empty', async () => {
    render(
      <EventDetailForm event={event}onSave={onSave} onCancel={onCancel} />,
    );
    const titleInput = screen.getByLabelText('Title');
    await userEvent.clear(titleInput);
    await userEvent.click(screen.getByText('OK'));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(onSave).not.toHaveBeenCalled();
  });

  it('renders All day checkbox reflecting event.isAllDay', () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} />);
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
    render(<EventDetailForm event={allDayEvent} onSave={onSave} onCancel={onCancel} />);
    const checkbox = screen.getByRole('checkbox', { name: /all day/i }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);
  });

  it('advances end date by one day when toggling All day on a same-day timed event', async () => {
    // event: start=2026-04-04T09:00, end=2026-04-04T10:00 — both on the 4th
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-04-04');
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('2026-04-05');
  });

  it('restores correct local date when toggling All day off after it was on', async () => {
    // event start = 2026-04-04T09:00 local — same day as end
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    const startInput = screen.getByLabelText('Start') as HTMLInputElement;
    expect(startInput.type).toBe('datetime-local');
    // Must still be April 4, not shifted to April 3 by UTC parsing
    expect(startInput.value.startsWith('2026-04-04')).toBe(true);
  });

  it('keeps the original end date when toggling All day on a multi-day timed event', async () => {
    const multiDayEvent = {
      ...event,
      start: { dateTime: '2026-04-04T09:00:00', timeZone: 'America/New_York' },
      end: { dateTime: '2026-04-06T10:00:00', timeZone: 'America/New_York' },
    };
    render(<EventDetailForm event={multiDayEvent} onSave={onSave} onCancel={onCancel} />);

    await userEvent.click(screen.getByRole('checkbox', { name: /all day/i }));

    expect((screen.getByLabelText('Start') as HTMLInputElement).value).toBe('2026-04-04');
    expect((screen.getByLabelText('End') as HTMLInputElement).value).toBe('2026-04-06');
  });

  it('does not render a Delete button when onDelete is not provided', () => {
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} />);
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('renders a Delete button when onDelete is provided', () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
    expect(screen.getByText('Delete')).toBeInTheDocument();
  });

  it('shows confirm UI and disables inputs when Delete is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
    await userEvent.click(screen.getByText('Delete'));
    expect(screen.getByText('This will permanently delete the event.')).toBeInTheDocument();
    expect(screen.getByText('Delete event')).toBeInTheDocument();
    expect((screen.getByLabelText('Title') as HTMLInputElement).disabled).toBe(true);
  });

  it('returns to normal state when Cancel is clicked in confirm mode', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Cancel'));
    expect(screen.queryByText('This will permanently delete the event.')).not.toBeInTheDocument();
    expect(screen.getByText('OK')).toBeInTheDocument();
  });

  it('calls onDelete when Delete event button is clicked', async () => {
    const onDelete = vi.fn().mockResolvedValue(undefined);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() => expect(onDelete).toHaveBeenCalled());
  });

  it('shows inline error and resets confirm state when onDelete rejects', async () => {
    const onDelete = vi.fn().mockRejectedValue(new Error('Server error'));
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() => expect(screen.getByText('Server error')).toBeInTheDocument());
    expect(screen.queryByText('This will permanently delete the event.')).not.toBeInTheDocument();
  });

  it('logs to console.error when onDelete rejects', async () => {
    const error = new Error('Server error');
    const onDelete = vi.fn().mockRejectedValue(error);
    render(<EventDetailForm event={event} onSave={onSave} onCancel={onCancel} onDelete={onDelete} />);
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() =>
      expect(console.error).toHaveBeenCalledWith('M365 Calendar:', error),
    );
  });
});

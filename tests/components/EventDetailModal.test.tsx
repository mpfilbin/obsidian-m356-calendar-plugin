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
});

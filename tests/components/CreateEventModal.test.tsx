import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('obsidian', () => ({
  Modal: class {
    contentEl: HTMLElement;
    titleEl: { setText: (s: string) => void };
    constructor() {
      this.contentEl = document.createElement('div');
      this.titleEl = { setText: vi.fn() };
    }
    close = vi.fn();
    open = vi.fn();
  },
}));

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
});

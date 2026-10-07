import { describe, it, expect, vi, afterEach } from 'vitest';
import { screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React, { type ReactNode } from 'react';
import type { App } from 'obsidian';
import { ReactModal } from '../../src/components/ReactModal';
import { ConfirmModal } from '../../src/components/ConfirmModal';
import { CreateEventModal } from '../../src/components/CreateEventModal';
import { CreateTaskModal } from '../../src/components/CreateTaskModal';
import { EventDetailModal } from '../../src/components/EventDetailModal';
import { TodoDetailModal } from '../../src/components/TodoDetailModal';
import type { TodoService } from '../../src/services/TodoService';

const app = {} as App;

/** Opens a modal the way Obsidian would: attached to the document, title spy installed. */
function open<T extends ReactModal>(modal: T) {
  const setText = vi.fn();
  (modal as unknown as { titleEl: { setText: typeof setText } }).titleEl = { setText };
  const close = vi.fn();
  modal.close = close;
  document.body.appendChild(modal.contentEl);
  act(() => modal.onOpen());
  return { modal, setText, close };
}

class TestModal extends ReactModal {
  constructor(private readonly text: string) {
    super(app);
  }
  protected getTitle() { return `Title: ${this.text}`; }
  protected renderContent(): ReactNode { return <p>{this.text}</p>; }
  run<T>(action: () => Promise<T> | T) { return this.closeAfter(action); }
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('ReactModal', () => {
  it('sets the title, renders the content and unmounts it on close', () => {
    const { modal, setText } = open(new TestModal('hello'));
    expect(setText).toHaveBeenCalledWith('Title: hello');
    expect(screen.getByText('hello')).toBeInTheDocument();

    act(() => modal.onClose());
    expect(screen.queryByText('hello')).not.toBeInTheDocument();
  });

  it('closeAfter closes the dialog after the action succeeds and returns its result', async () => {
    const { modal, close } = open(new TestModal('x'));
    await expect(modal.run(async () => 42)).resolves.toBe(42);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it('closeAfter leaves the dialog open and rethrows when the action fails', async () => {
    const { modal, close } = open(new TestModal('x'));
    await expect(modal.run(async () => { throw new Error('nope'); })).rejects.toThrow('nope');
    expect(close).not.toHaveBeenCalled();
  });
});

describe('dialogs built on ReactModal', () => {
  it('ConfirmModal: closes after a successful confirm', async () => {
    const onConfirm = vi.fn().mockResolvedValue(undefined);
    const { setText, close } = open(new ConfirmModal(app, 'Delete event', 'Delete "Standup"?', 'Delete event', 'Deleting…', onConfirm));
    expect(setText).toHaveBeenCalledWith('Delete event');
    await userEvent.click(screen.getByText('Delete event', { selector: 'button' }));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('ConfirmModal: stays open and shows the error when the action fails', async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error('Failed to delete event: Forbidden'));
    const { close } = open(new ConfirmModal(app, 'Delete event', 'Sure?', 'Delete event', 'Deleting…', onConfirm));
    await userEvent.click(screen.getByText('Delete event', { selector: 'button' }));
    expect(await screen.findByText('Failed to delete event: Forbidden')).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });

  it('ConfirmModal: Cancel closes without confirming', async () => {
    const onConfirm = vi.fn();
    const { close } = open(new ConfirmModal(app, 'T', 'Sure?', 'Go', 'Going…', onConfirm));
    await userEvent.click(screen.getByText('Cancel'));
    expect(close).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it('CreateEventModal: titled "New event"; submitting creates the event then closes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const cal = { id: 'c1', name: 'Work', color: '#000', isDefaultCalendar: true, canEdit: true };
    const { setText, close } = open(new CreateEventModal(app, [cal], 'c1', new Date(2026, 3, 10), onSubmit));
    expect(setText).toHaveBeenCalledWith('New event');
    await userEvent.type(screen.getByLabelText('Title'), 'Standup');
    await userEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(onSubmit).toHaveBeenCalledWith('c1', expect.objectContaining({ subject: 'Standup' }));
  });

  it('CreateEventModal: stays open with the error when creating fails', async () => {
    const onSubmit = vi.fn().mockRejectedValue(new Error('Failed to create event: Forbidden'));
    const cal = { id: 'c1', name: 'Work', color: '#000', isDefaultCalendar: true, canEdit: true };
    const { close } = open(new CreateEventModal(app, [cal], 'c1', new Date(2026, 3, 10), onSubmit));
    await userEvent.type(screen.getByLabelText('Title'), 'Standup');
    await userEvent.click(screen.getByText('Create'));
    expect(await screen.findByText('Failed to create event: Forbidden')).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });

  it('CreateTaskModal: titled "New task"; submitting creates the task then closes', async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    const lists = [{ id: 'l1', displayName: 'Work', color: '#f00' }];
    const { setText, close } = open(new CreateTaskModal(app, lists, 'l1', new Date(2026, 3, 10), onSubmit));
    expect(setText).toHaveBeenCalledWith('New task');
    await userEvent.type(screen.getByLabelText('Title'), 'Pay rent');
    await userEvent.click(screen.getByText('Create'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
  });

  const event = {
    id: 'e1', subject: 'Standup', calendarId: 'c1', isAllDay: false,
    start: { dateTime: '2026-04-10T09:00:00', timeZone: 'UTC' },
    end: { dateTime: '2026-04-10T09:30:00', timeZone: 'UTC' },
  };

  it('EventDetailModal: saves, closes, then notifies; delete closes after success', async () => {
    const order: string[] = [];
    const onSave = vi.fn().mockImplementation(async () => { order.push('save'); });
    const onSaved = vi.fn().mockImplementation(() => { order.push('saved'); });
    const onDelete = vi.fn().mockImplementation(async () => { order.push('delete'); });
    const { setText, close } = open(new EventDetailModal(app, event, onSave, onSaved, [], onDelete));
    close.mockImplementation(() => { order.push('close'); });
    expect(setText).toHaveBeenCalledWith('Edit event');

    await userEvent.click(screen.getByText('OK'));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(order).toEqual(['save', 'close', 'saved']);

    order.length = 0;
    await userEvent.click(screen.getByText('Delete'));
    await userEvent.click(screen.getByText('Delete event'));
    await waitFor(() => expect(order).toEqual(['delete', 'close']));
  });

  it('EventDetailModal: stays open when saving fails', async () => {
    const onSave = vi.fn().mockRejectedValue(new Error('Failed to update event: Forbidden'));
    const onSaved = vi.fn();
    const { close } = open(new EventDetailModal(app, event, onSave, onSaved, []));
    await userEvent.click(screen.getByText('OK'));
    expect(await screen.findByText('Failed to update event: Forbidden')).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
    expect(onSaved).not.toHaveBeenCalled();
  });

  it('TodoDetailModal: titled with the task; completing closes only after it succeeds', async () => {
    const todo = { id: 't1', title: 'Pay rent', listId: 'l1', dueDate: '2026-04-10', importance: 'normal' as const };
    const list = { id: 'l1', displayName: 'Work', color: '#f00' };
    const service = { getChecklistItems: vi.fn().mockResolvedValue([]) } as unknown as TodoService;
    const onComplete = vi.fn().mockResolvedValue(undefined);
    const { setText, close } = open(new TodoDetailModal(app, todo, list, service, onComplete, vi.fn()));
    expect(setText).toHaveBeenCalledWith('Pay rent');
    await userEvent.click(screen.getByText('Mark complete'));
    await waitFor(() => expect(close).toHaveBeenCalledTimes(1));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('TodoDetailModal: stays open when completing fails', async () => {
    const todo = { id: 't1', title: 'Pay rent', listId: 'l1', dueDate: '2026-04-10', importance: 'normal' as const };
    const list = { id: 'l1', displayName: 'Work', color: '#f00' };
    const service = { getChecklistItems: vi.fn().mockResolvedValue([]) } as unknown as TodoService;
    const { close } = open(new TodoDetailModal(app, todo, list, service, vi.fn().mockRejectedValue(new Error('boom')), vi.fn()));
    await userEvent.click(screen.getByText('Mark complete'));
    expect(await screen.findByText('boom')).toBeInTheDocument();
    expect(close).not.toHaveBeenCalled();
  });
});

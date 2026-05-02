import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateTaskForm } from '../../src/components/CreateTaskModal';
import { M365TodoList } from '../../src/types';

const todoLists: M365TodoList[] = [
  { id: 'list1', displayName: 'Work', color: '#ef4444' },
  { id: 'list2', displayName: 'Personal', color: '#3b82f6' },
];

describe('CreateTaskForm', () => {
  let onSubmit: ReturnType<typeof vi.fn>;
  let onCancel: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    onSubmit = vi.fn();
    onCancel = vi.fn();
  });

  it('renders all required fields', () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date('2026-05-15')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(screen.getByPlaceholderText('Task title')).toBeInTheDocument();
    expect(screen.getByRole('combobox', { name: /list/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/due date/i)).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /repeat/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/notes/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add step')).toBeInTheDocument();
  });

  it('calls onCancel when Cancel is clicked', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date('2026-05-15')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByText('Cancel'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('shows validation error and does not call onSubmit when title is empty', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date('2026-05-15')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByText('Create'));
    expect(screen.getByText('Title is required')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('calls onSubmit with correct listId, input, and empty steps when form is valid', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date(2026, 4, 15)} // May 15 local time
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Task title'), 'Buy groceries');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith(
      'list1',
      expect.objectContaining({ title: 'Buy groceries', dueDate: '2026-05-15' }),
      [],
    );
  });

  it('pre-selects the defaultListId in the list dropdown', () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list2"
        initialDate={new Date('2026-05-15')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    const select = screen.getByRole('combobox', { name: /list/i }) as HTMLSelectElement;
    expect(select.value).toBe('list2');
  });

  it('submits with notes when notes textarea has content', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date(2026, 4, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Task title'), 'Task');
    await userEvent.type(screen.getByLabelText(/notes/i), 'Remember milk');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith(
      'list1',
      expect.objectContaining({ notes: 'Remember milk' }),
      [],
    );
  });
});

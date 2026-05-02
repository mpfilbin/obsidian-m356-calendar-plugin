import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TodoDetailForm } from '../../src/components/TodoDetailModal';
import { M365TodoItem, M365TodoList } from '../../src/types';
import { TodoService } from '../../src/services/TodoService';

const todoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };

const todo: M365TodoItem = {
  id: 'task1',
  title: 'Write quarterly report',
  listId: 'list1',
  dueDate: '2026-04-15',
  importance: 'normal',
  body: 'Include Q1 metrics',
};

function makeMockTodoService() {
  return {
    getChecklistItems: vi.fn().mockResolvedValue([]),
    createChecklistItem: vi.fn(),
    updateChecklistItem: vi.fn().mockResolvedValue(undefined),
    deleteChecklistItem: vi.fn().mockResolvedValue(undefined),
  } as unknown as TodoService;
}

describe('TodoDetailForm', () => {
  it('renders the list display name', async () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    expect(await screen.findByText('Work Tasks')).toBeInTheDocument();
  });

  it('renders a Due: label', async () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    expect(await screen.findByText('Due:')).toBeInTheDocument();
  });

  it('renders the body notes', async () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    expect(await screen.findByText('Include Q1 metrics')).toBeInTheDocument();
  });

  it('does not render priority row for normal importance', async () => {
    render(<TodoDetailForm todo={{ ...todo, importance: 'normal' }} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    await screen.findByText('Work Tasks');
    expect(screen.queryByText('Priority:')).not.toBeInTheDocument();
  });

  it('renders High priority badge for high importance', async () => {
    render(<TodoDetailForm todo={{ ...todo, importance: 'high' }} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    expect(await screen.findByText('Priority:')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders Low priority badge for low importance', async () => {
    render(<TodoDetailForm todo={{ ...todo, importance: 'low' }} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    expect(await screen.findByText('Low')).toBeInTheDocument();
  });

  it('does not render Notes section when body is absent', async () => {
    render(<TodoDetailForm todo={{ ...todo, body: undefined }} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    await screen.findByText('Work Tasks');
    expect(screen.queryByText('Notes:')).not.toBeInTheDocument();
  });

  it('applies the list color to the list name text', async () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    const listName = await screen.findByText('Work Tasks');
    expect(listName).toHaveStyle({ color: 'rgb(59, 130, 246)' });
  });

  it('renders a List: label before the list name', async () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    expect(await screen.findByText('List:')).toBeInTheDocument();
  });

  it('renders a Complete button', async () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    expect(await screen.findByRole('button', { name: /complete/i })).toBeInTheDocument();
  });

  it('calls onComplete when the Complete button is clicked', async () => {
    const onComplete = vi.fn();
    render(<TodoDetailForm todo={todo} todoList={todoList} todoService={makeMockTodoService()} onComplete={onComplete} />);
    await userEvent.click(await screen.findByRole('button', { name: /complete/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  describe('checklist', () => {
    it('shows a loading indicator while checklist items are being fetched', () => {
      const mockTodoService = {
        getChecklistItems: vi.fn().mockReturnValue(new Promise(() => {})),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      expect(screen.getByText('Loading checklist…')).toBeInTheDocument();
    });

    it('renders fetched checklist items', async () => {
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([
          { id: 'ci1', displayName: 'Step one', isChecked: false },
          { id: 'ci2', displayName: 'Step two', isChecked: true },
        ]),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      expect(await screen.findByText('Step one')).toBeInTheDocument();
      expect(screen.getByText('Step two')).toBeInTheDocument();
    });

    it('applies line-through style to checked items', async () => {
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([
          { id: 'ci1', displayName: 'Done step', isChecked: true },
        ]),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      const label = await screen.findByText('Done step');
      expect(label).toHaveStyle({ textDecoration: 'line-through' });
    });

    it('calls updateChecklistItem with isChecked toggled when a checkbox is clicked', async () => {
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([
          { id: 'ci1', displayName: 'Step one', isChecked: false },
        ]),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn().mockResolvedValue(undefined),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      await screen.findByText('Step one');
      await userEvent.click(screen.getByRole('checkbox'));
      expect(mockTodoService.updateChecklistItem).toHaveBeenCalledWith('list1', 'task1', 'ci1', { isChecked: true });
    });

    it('calls onComplete automatically when the last unchecked item is checked', async () => {
      const onComplete = vi.fn();
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([
          { id: 'ci1', displayName: 'Step one', isChecked: true },
          { id: 'ci2', displayName: 'Step two', isChecked: false },
        ]),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn().mockResolvedValue(undefined),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={onComplete} />);
      await screen.findByText('Step two');
      const checkboxes = screen.getAllByRole('checkbox');
      await userEvent.click(checkboxes[1]); // check the unchecked one (index 1)
      expect(onComplete).toHaveBeenCalledTimes(1);
    });

    it('does not auto-complete when there are zero checklist items', async () => {
      const onComplete = vi.fn();
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([]),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={onComplete} />);
      await screen.findByText('Checklist');
      expect(onComplete).not.toHaveBeenCalled();
    });

    it('shows an Add item input below the checklist', async () => {
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([]),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      expect(await screen.findByPlaceholderText('Add item')).toBeInTheDocument();
    });

    it('calls createChecklistItem and appends the new item when Enter is pressed', async () => {
      const created = { id: 'ci3', displayName: 'New step', isChecked: false };
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([]),
        createChecklistItem: vi.fn().mockResolvedValue(created),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      const input = await screen.findByPlaceholderText('Add item');
      await userEvent.type(input, 'New step{Enter}');
      expect(mockTodoService.createChecklistItem).toHaveBeenCalledWith('list1', 'task1', 'New step');
      expect(await screen.findByText('New step')).toBeInTheDocument();
      expect(input).toHaveValue('');
    });

    it('calls createChecklistItem when the input loses focus with non-empty text', async () => {
      const created = { id: 'ci4', displayName: 'Blur step', isChecked: false };
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([]),
        createChecklistItem: vi.fn().mockResolvedValue(created),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      const input = await screen.findByPlaceholderText('Add item');
      await userEvent.type(input, 'Blur step');
      await userEvent.tab();
      expect(mockTodoService.createChecklistItem).toHaveBeenCalledWith('list1', 'task1', 'Blur step');
    });

    it('does not call createChecklistItem when input is empty on blur', async () => {
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([]),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn(),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      const input = await screen.findByPlaceholderText('Add item');
      await userEvent.click(input);
      await userEvent.tab();
      expect(mockTodoService.createChecklistItem).not.toHaveBeenCalled();
    });

    it('removes an item and calls deleteChecklistItem when the delete button is clicked', async () => {
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([
          { id: 'ci1', displayName: 'Step one', isChecked: false },
        ]),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn().mockResolvedValue(undefined),
      } as unknown as TodoService;
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      await screen.findByText('Step one');
      await userEvent.click(screen.getByRole('button', { name: 'Delete Step one' }));
      expect(mockTodoService.deleteChecklistItem).toHaveBeenCalledWith('list1', 'task1', 'ci1');
      expect(screen.queryByText('Step one')).not.toBeInTheDocument();
    });

    it('restores the item if deleteChecklistItem fails', async () => {
      const mockTodoService = {
        getChecklistItems: vi.fn().mockResolvedValue([
          { id: 'ci1', displayName: 'Step one', isChecked: false },
        ]),
        createChecklistItem: vi.fn(),
        updateChecklistItem: vi.fn(),
        deleteChecklistItem: vi.fn().mockRejectedValue(new Error('Network error')),
      } as unknown as TodoService;
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      render(<TodoDetailForm todo={todo} todoList={todoList} todoService={mockTodoService} onComplete={vi.fn()} />);
      await screen.findByText('Step one');
      await userEvent.click(screen.getByRole('button', { name: 'Delete Step one' }));
      expect(await screen.findByText('Step one')).toBeInTheDocument();
      consoleSpy.mockRestore();
    });
  });
});

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import React from 'react';
import { TodoDetailForm } from '../../src/components/TodoDetailModal';
import { M365TodoItem, M365TodoList } from '../../src/types';

const todoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };

const todo: M365TodoItem = {
  id: 'task1',
  title: 'Write quarterly report',
  listId: 'list1',
  dueDate: '2026-04-15',
  importance: 'normal',
  body: 'Include Q1 metrics',
};

describe('TodoDetailForm', () => {
  it('renders the list display name', () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} onComplete={vi.fn()} />);
    expect(screen.getByText('Work Tasks')).toBeInTheDocument();
  });

  it('renders a Due: label', () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} onComplete={vi.fn()} />);
    expect(screen.getByText('Due:')).toBeInTheDocument();
  });

  it('renders the body notes', () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} onComplete={vi.fn()} />);
    expect(screen.getByText('Include Q1 metrics')).toBeInTheDocument();
  });

  it('does not render priority row for normal importance', () => {
    render(<TodoDetailForm todo={{ ...todo, importance: 'normal' }} todoList={todoList} onComplete={vi.fn()} />);
    expect(screen.queryByText('Priority:')).not.toBeInTheDocument();
  });

  it('renders High priority badge for high importance', () => {
    render(<TodoDetailForm todo={{ ...todo, importance: 'high' }} todoList={todoList} onComplete={vi.fn()} />);
    expect(screen.getByText('Priority:')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders Low priority badge for low importance', () => {
    render(<TodoDetailForm todo={{ ...todo, importance: 'low' }} todoList={todoList} onComplete={vi.fn()} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('does not render Notes section when body is absent', () => {
    render(<TodoDetailForm todo={{ ...todo, body: undefined }} todoList={todoList} onComplete={vi.fn()} />);
    expect(screen.queryByText('Notes:')).not.toBeInTheDocument();
  });

  it('applies the list color to the dot indicator', () => {
    const { container } = render(<TodoDetailForm todo={todo} todoList={todoList} onComplete={vi.fn()} />);
    const dot = container.querySelector('.m365-todo-detail-dot') as HTMLElement;
    expect(dot.style.backgroundColor).toBe('rgb(59, 130, 246)');
  });

  it('renders a Complete button', () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} onComplete={vi.fn()} />);
    expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument();
  });

  it('calls onComplete when the Complete button is clicked', async () => {
    const onComplete = vi.fn();
    render(<TodoDetailForm todo={todo} todoList={todoList} onComplete={onComplete} />);
    await userEvent.click(screen.getByRole('button', { name: /complete/i }));
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

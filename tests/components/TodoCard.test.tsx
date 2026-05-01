import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import React from 'react';
import { TodoCard } from '../../src/components/TodoCard';
import { M365TodoItem, M365TodoList } from '../../src/types';

const todoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };
const todo: M365TodoItem = {
  id: 'task1',
  title: 'Finish report',
  listId: 'list1',
  dueDate: '2026-04-15',
  importance: 'normal',
};

describe('TodoCard', () => {
  it('renders the task title', () => {
    render(<TodoCard todo={todo} todoList={todoList} />);
    expect(screen.getByText('Finish report')).toBeInTheDocument();
  });

  it('renders the task circle icon', () => {
    const { container } = render(<TodoCard todo={todo} todoList={todoList} />);
    expect(container.querySelector('.m365-todo-icon')).toBeInTheDocument();
  });

  it('applies the list color as a dashed border', () => {
    const { container } = render(<TodoCard todo={todo} todoList={todoList} />);
    const card = container.querySelector('.m365-todo-card') as HTMLElement;
    expect(card.style.border).toBe('1px dashed rgb(59, 130, 246)');
  });

  it('sets the title attribute for overflow tooltip', () => {
    const { container } = render(<TodoCard todo={todo} todoList={todoList} />);
    const card = container.querySelector('.m365-todo-card') as HTMLElement;
    expect(card.title).toBe('Finish report');
  });

  it('applies transparent background using the list color', () => {
    const { container } = render(<TodoCard todo={todo} todoList={todoList} />);
    const card = container.querySelector('.m365-todo-card') as HTMLElement;
    // backgroundColor is set to color + '26' (10% opacity hex suffix)
    expect(card.style.backgroundColor).toBeTruthy();
  });
});

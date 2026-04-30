import React from 'react';
import { M365TodoItem, M365TodoList } from '../types';

interface TodoCardProps {
  todo: M365TodoItem;
  todoList: M365TodoList;
}

export const TodoCard: React.FC<TodoCardProps> = ({ todo, todoList }) => {
  return (
    <div
      className="m365-todo-card"
      style={{
        backgroundColor: `${todoList.color}26`,
        border: `1px dashed ${todoList.color}`,
        borderRadius: 'var(--radius-s)',
        color: todoList.color,
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--size-4-1)',
      }}
      title={todo.title}
    >
      <svg className="m365-todo-icon" width="10" height="10" viewBox="0 0 10 10" aria-hidden="true" focusable="false">
        <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1.5"/>
      </svg>
      <span className="m365-todo-title">{todo.title}</span>
    </div>
  );
};

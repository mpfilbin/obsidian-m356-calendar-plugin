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
        color: todoList.color,
      }}
      title={todo.title}
    >
      <span className="m365-todo-icon" aria-hidden="true">☐</span>
      <span className="m365-todo-title">{todo.title}</span>
    </div>
  );
};

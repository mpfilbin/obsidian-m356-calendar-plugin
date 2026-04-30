import { App, Modal } from 'obsidian';
import React, { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365TodoItem, M365TodoList } from '../types';

// ── Form ─────────────────────────────────────────────────────────────────────

interface TodoDetailFormProps {
  todo: M365TodoItem;
  todoList: M365TodoList;
}

export const TodoDetailForm: React.FC<TodoDetailFormProps> = ({ todo, todoList }) => {
  const dueDateDisplay = new Date(todo.dueDate + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="m365-todo-detail">
      <div className="m365-todo-detail-row">
        <span className="m365-todo-detail-dot" style={{ backgroundColor: todoList.color }} />
        <span>{todoList.displayName}</span>
      </div>
      <div className="m365-todo-detail-row">
        <span className="m365-todo-detail-label">Due:</span>
        <span>{dueDateDisplay}</span>
      </div>
      {todo.importance !== 'normal' && (
        <div className="m365-todo-detail-row">
          <span className="m365-todo-detail-label">Priority:</span>
          <span className={`m365-todo-importance-${todo.importance}`}>
            {todo.importance === 'high' ? 'High' : 'Low'}
          </span>
        </div>
      )}
      {todo.body && (
        <div className="m365-todo-detail-notes">
          <span className="m365-todo-detail-label">Notes:</span>
          <p>{todo.body}</p>
        </div>
      )}
    </div>
  );
};

// ── Modal ─────────────────────────────────────────────────────────────────────

export class TodoDetailModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly todo: M365TodoItem,
    private readonly todoList: M365TodoList,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.todo.title);
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <TodoDetailForm todo={this.todo} todoList={this.todoList} />
      </StrictMode>,
    );
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
  }
}

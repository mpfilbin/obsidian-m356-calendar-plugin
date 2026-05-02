import { App, Modal } from 'obsidian';
import React, { StrictMode, useState, useEffect } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365TodoItem, M365TodoList, M365ChecklistItem } from '../types';
import { TodoService } from '../services/TodoService';

// ── Form ─────────────────────────────────────────────────────────────────────

interface TodoDetailFormProps {
  todo: M365TodoItem;
  todoList: M365TodoList;
  todoService: TodoService;
  onComplete: () => void;
}

export const TodoDetailForm: React.FC<TodoDetailFormProps> = ({ todo, todoList, todoService, onComplete }) => {
  const [checklistItems, setChecklistItems] = useState<M365ChecklistItem[]>([]);
  const [loadingChecklist, setLoadingChecklist] = useState(true);
  const [newItemText, setNewItemText] = useState('');

  useEffect(() => {
    let cancelled = false;
    void todoService.getChecklistItems(todo.listId, todo.id)
      .then((items) => { if (!cancelled) setChecklistItems(items); })
      .catch((e: unknown) => { if (!cancelled) console.error('Failed to load checklist items:', e); })
      .finally(() => { if (!cancelled) setLoadingChecklist(false); });
    return () => { cancelled = true; };
  }, [todo.listId, todo.id, todoService]);

  const handleToggle = (item: M365ChecklistItem) => {
    const updated = { ...item, isChecked: !item.isChecked };
    const nextItems = checklistItems.map((i) => i.id === item.id ? updated : i);
    setChecklistItems(nextItems);
    void todoService.updateChecklistItem(todo.listId, todo.id, item.id, { isChecked: updated.isChecked })
      .catch((e: unknown) => console.error('Failed to update checklist item:', e));
    if (nextItems.length > 0 && nextItems.every((i) => i.isChecked)) {
      onComplete();
    }
  };

  const handleAddItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    setNewItemText('');
    void todoService.createChecklistItem(todo.listId, todo.id, text)
      .then((created) => setChecklistItems((prev) => [...prev, created]))
      .catch((e: unknown) => console.error('Failed to create checklist item:', e));
  };

  const handleDelete = (itemId: string) => {
    const index = checklistItems.findIndex((i) => i.id === itemId);
    const item = checklistItems[index];
    setChecklistItems((items) => items.filter((i) => i.id !== itemId));
    void todoService.deleteChecklistItem(todo.listId, todo.id, itemId)
      .catch((e: unknown) => {
        console.error('Failed to delete checklist item:', e);
        setChecklistItems((items) => {
          const next = [...items];
          next.splice(index, 0, item);
          return next;
        });
      });
  };

  const dueDateDisplay = new Date(todo.dueDate + 'T00:00:00').toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="m365-todo-detail">
      <div className="m365-todo-detail-row">
        <span className="m365-todo-detail-label">List:</span>
        <span style={{ color: todoList.color }}>{todoList.displayName}</span>
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
        <div className="m365-todo-detail-row m365-todo-detail-notes">
          <span className="m365-todo-detail-label">Notes:</span>
          <span>{todo.body}</span>
        </div>
      )}
      <div className="m365-todo-detail-checklist">
        <span className="m365-todo-detail-label">Checklist</span>
        {loadingChecklist ? (
          <p>Loading checklist…</p>
        ) : (
          <>
            <div className="m365-checklist-items">
              {checklistItems.map((item) => (
                <div key={item.id} className="m365-checklist-item">
                  <input
                    type="checkbox"
                    aria-label={item.displayName}
                    checked={item.isChecked}
                    onChange={() => handleToggle(item)}
                  />
                  <span style={{ textDecoration: item.isChecked ? 'line-through' : 'none' }}>
                    {item.displayName}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${item.displayName}`}
                    onClick={() => handleDelete(item.id)}
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
            <input
              className="m365-checklist-add-input"
              type="text"
              placeholder="Add item"
              aria-label="Add checklist item"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
              onBlur={handleAddItem}
            />
          </>
        )}
      </div>
      <div className="m365-todo-detail-footer">
        <button className="m365-todo-complete-btn" type="button" onClick={onComplete}>Mark complete</button>
      </div>
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
    private readonly todoService: TodoService,
    private readonly onComplete: () => void,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText(this.todo.title);
    const handleComplete = () => {
      this.onComplete();
      this.close();
    };
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <TodoDetailForm
          todo={this.todo}
          todoList={this.todoList}
          todoService={this.todoService}
          onComplete={handleComplete}
        />
      </StrictMode>,
    );
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
  }
}

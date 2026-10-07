import { App } from 'obsidian';
import React, { useState, useEffect, type ReactNode } from 'react';
import { ReactModal } from './ReactModal';
import { M365TodoItem, M365TodoList, M365ChecklistItem } from '../types';
import { TodoService } from '../services/TodoService';
import { usePending } from '../hooks/usePending';
import { appLogger } from '../lib/logger';

// ── Form ─────────────────────────────────────────────────────────────────────

interface TodoDetailFormProps {
  todo: M365TodoItem;
  todoList: M365TodoList;
  todoService: TodoService;
  onComplete: () => void | Promise<void>;
  onDelete?: () => void | Promise<void>;
}

export const TodoDetailForm: React.FC<TodoDetailFormProps> = ({ todo, todoList, todoService, onComplete, onDelete }) => {
  const [checklistItems, setChecklistItems] = useState<M365ChecklistItem[]>([]);
  const [loadingChecklist, setLoadingChecklist] = useState(true);
  const [newItemText, setNewItemText] = useState('');
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [error, setError] = useState('');
  // Which main action is running, so its button can say what is happening.
  const [action, setAction] = useState<'complete' | 'delete' | null>(null);
  const { pending: actionPending, run: runAction } = usePending();
  // Checklist edits are optimistic fire-and-forget requests; count them so the dialog is
  // disabled (and visibly busy) until every one has settled.
  const [pendingChecklistOps, setPendingChecklistOps] = useState(0);
  const trackChecklistOp = <T,>(request: Promise<T>): Promise<T> => {
    setPendingChecklistOps((n) => n + 1);
    return request.finally(() => setPendingChecklistOps((n) => n - 1));
  };
  const busy = actionPending || pendingChecklistOps > 0;

  const runMainAction = async (kind: 'complete' | 'delete', handler?: () => void | Promise<void>) => {
    if (!handler) return;
    setError('');
    setAction(kind);
    try {
      await runAction(handler);
    } catch (e) {
      // The caller has already shown a notice; keep the dialog open with the reason.
      setError(e instanceof Error ? e.message : `Failed to ${kind} task`);
      setConfirmingDelete(false);
    } finally {
      setAction(null);
    }
  };

  useEffect(() => {
    let cancelled = false;
    void todoService.getChecklistItems(todo.listId, todo.id)
      .then((items) => { if (!cancelled) setChecklistItems(items); })
      .catch((e: unknown) => { if (!cancelled) appLogger.error('[M365 Calendar] Failed to load checklist items:', e); })
      .finally(() => { if (!cancelled) setLoadingChecklist(false); });
    return () => { cancelled = true; };
  }, [todo.listId, todo.id, todoService]);

  const handleToggle = (item: M365ChecklistItem) => {
    const updated = { ...item, isChecked: !item.isChecked };
    const nextItems = checklistItems.map((i) => i.id === item.id ? updated : i);
    setChecklistItems(nextItems);
    const allChecked = nextItems.length > 0 && nextItems.every((i) => i.isChecked);
    void trackChecklistOp(todoService.updateChecklistItem(todo.listId, todo.id, item.id, { isChecked: updated.isChecked }))
      .catch((e: unknown) => appLogger.error('[M365 Calendar] Failed to update checklist item:', e))
      .then(() => { if (allChecked) void runMainAction('complete', onComplete); });
  };

  const handleAddItem = () => {
    const text = newItemText.trim();
    if (!text) return;
    setNewItemText('');
    void trackChecklistOp(todoService.createChecklistItem(todo.listId, todo.id, text))
      .then((created) => setChecklistItems((prev) => [...prev, created]))
      .catch((e: unknown) => appLogger.error('[M365 Calendar] Failed to create checklist item:', e));
  };

  const handleDelete = (itemId: string) => {
    const index = checklistItems.findIndex((i) => i.id === itemId);
    const item = checklistItems[index];
    setChecklistItems((items) => items.filter((i) => i.id !== itemId));
    void trackChecklistOp(todoService.deleteChecklistItem(todo.listId, todo.id, itemId))
      .catch((e: unknown) => {
        appLogger.error('[M365 Calendar] Failed to delete checklist item:', e);
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
    <div className="m365-todo-detail" aria-busy={busy}>
      {error && <div className="m365-form-error">{error}</div>}
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
                    disabled={busy}
                  />
                  <span style={{ textDecoration: item.isChecked ? 'line-through' : 'none' }}>
                    {item.displayName}
                  </span>
                  <button
                    type="button"
                    aria-label={`Delete ${item.displayName}`}
                    onClick={() => handleDelete(item.id)}
                    disabled={busy}
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
              disabled={busy}
            />
          </>
        )}
      </div>
      <div className="m365-todo-detail-footer">
        {confirmingDelete ? (
          <>
            <span>This will permanently delete the task.</span>
            <button type="button" onClick={() => setConfirmingDelete(false)} disabled={busy}>Cancel</button>
            <button
              className="mod-warning"
              type="button"
              onClick={() => void runMainAction('delete', onDelete)}
              disabled={busy}
            >
              {action === 'delete' ? 'Deleting…' : 'Delete task'}
            </button>
          </>
        ) : (
          <>
            <button
              className="m365-todo-complete-btn"
              type="button"
              onClick={() => void runMainAction('complete', onComplete)}
              disabled={busy}
            >
              {action === 'complete' ? 'Completing…' : 'Mark complete'}
            </button>
            {onDelete && (
              <button className="mod-warning" type="button" onClick={() => setConfirmingDelete(true)} disabled={busy}>Delete</button>
            )}
          </>
        )}
      </div>
    </div>
  );
};

// ── Modal ─────────────────────────────────────────────────────────────────────

export class TodoDetailModal extends ReactModal {
  constructor(
    app: App,
    private readonly todo: M365TodoItem,
    private readonly todoList: M365TodoList,
    private readonly todoService: TodoService,
    private readonly onComplete: () => void | Promise<void>,
    private readonly onDelete: () => void | Promise<void>,
  ) {
    super(app);
  }

  protected getTitle(): string {
    return this.todo.title;
  }

  protected renderContent(): ReactNode {
    // Stay open (disabled, see TodoDetailForm) until the request settles; a rejection keeps
    // the dialog open so the form can show the error.
    return (
      <TodoDetailForm
        todo={this.todo}
        todoList={this.todoList}
        todoService={this.todoService}
        onComplete={() => this.closeAfter(this.onComplete)}
        onDelete={() => this.closeAfter(this.onDelete)}
      />
    );
  }
}

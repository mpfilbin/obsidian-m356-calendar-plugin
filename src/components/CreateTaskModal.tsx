import { App, Modal } from 'obsidian';
import React, { StrictMode, useState } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365TodoList, NewTaskInput, TaskRecurrence } from '../types';
import { toDateOnly } from '../lib/datetime';

interface CreateTaskFormProps {
  todoLists: M365TodoList[];
  defaultListId: string;
  initialDate: Date;
  onSubmit: (listId: string, input: NewTaskInput, steps: string[]) => void;
  onCancel: () => void;
}

export const CreateTaskForm: React.FC<CreateTaskFormProps> = ({
  todoLists,
  defaultListId,
  initialDate,
  onSubmit,
  onCancel,
}) => {
  const [title, setTitle] = useState('');
  const [listId, setListId] = useState(defaultListId || todoLists[0]?.id || '');
  const [dueDate, setDueDate] = useState(toDateOnly(initialDate));
  const [repeat, setRepeat] = useState(false);
  const [frequency, setFrequency] = useState<'daily' | 'weekly' | 'monthly' | 'yearly'>('daily');
  const [intervalStr, setIntervalStr] = useState('1');
  const [notes, setNotes] = useState('');
  const [steps, setSteps] = useState<string[]>([]);
  const [newStep, setNewStep] = useState('');
  const [error, setError] = useState('');

  const addStep = () => {
    const text = newStep.trim();
    if (!text) return;
    setSteps((prev) => [...prev, text]);
    setNewStep('');
  };

  const removeStep = (index: number) => {
    setSteps((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSubmit = () => {
    if (!title.trim()) {
      setError('Title is required');
      return;
    }
    if (!listId) {
      setError('Please select a list');
      return;
    }
    const pendingStep = newStep.trim();
    const allSteps = pendingStep ? [...steps, pendingStep] : steps;
    const recurrence: TaskRecurrence | undefined = repeat ? { frequency, interval: Math.max(1, parseInt(intervalStr) || 1) } : undefined;
    onSubmit(listId, {
      title: title.trim(),
      dueDate,
      notes: notes.trim() || undefined,
      recurrence,
    }, allSteps);
  };

  return (
    <div className="m365-create-task-form">
      {error && <div className="m365-form-error">{error}</div>}
      <div className="m365-form-field">
        <label htmlFor="m365-create-task-title">Title</label>
        <input
          id="m365-create-task-title"
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Task title"
          autoFocus
        />
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-create-task-list">List</label>
        <select
          id="m365-create-task-list"
          value={listId}
          onChange={(e) => setListId(e.target.value)}
        >
          {todoLists.map((l) => (
            <option key={l.id} value={l.id}>{l.displayName}</option>
          ))}
        </select>
      </div>
      <div className="m365-form-field">
        <label htmlFor="m365-create-task-due">Due date</label>
        <input
          id="m365-create-task-due"
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
        />
      </div>
      <div className="m365-form-checkbox">
        <label>
          <input
            type="checkbox"
            checked={repeat}
            onChange={(e) => setRepeat(e.target.checked)}
          />
          Repeat
        </label>
      </div>
      {repeat && (
        <div className="m365-form-recurrence">
          <div className="m365-form-field">
            <label htmlFor="m365-create-task-frequency">Frequency</label>
            <select
              id="m365-create-task-frequency"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value as 'daily' | 'weekly' | 'monthly' | 'yearly')}
            >
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
              <option value="yearly">Yearly</option>
            </select>
          </div>
          <div className="m365-form-field">
            <label htmlFor="m365-create-task-interval">Every</label>
            <input
              id="m365-create-task-interval"
              type="number"
              min="1"
              value={intervalStr}
              onChange={(e) => setIntervalStr(e.target.value)}
            />
          </div>
        </div>
      )}
      <div className="m365-form-field">
        <label htmlFor="m365-create-task-notes">Notes (optional)</label>
        <textarea
          id="m365-create-task-notes"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          rows={3}
        />
      </div>
      <div className="m365-todo-detail-checklist">
        <span className="m365-todo-detail-label">Steps</span>
        <div className="m365-checklist-items">
          {steps.map((step, i) => (
            <div key={i} className="m365-checklist-item">
              <span>{step}</span>
              <button
                type="button"
                aria-label={`Delete ${step}`}
                onClick={() => removeStep(i)}
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <input
          className="m365-checklist-add-input"
          type="text"
          placeholder="Add step"
          aria-label="Add step"
          value={newStep}
          onChange={(e) => setNewStep(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') addStep(); }}
          onBlur={addStep}
        />
      </div>
      <div className="m365-form-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="mod-cta" onClick={handleSubmit}>
          Create
        </button>
      </div>
    </div>
  );
};

export class CreateTaskModal extends Modal {
  private root: Root | null = null;

  constructor(
    app: App,
    private readonly todoLists: M365TodoList[],
    private readonly defaultListId: string,
    private readonly initialDate: Date,
    private readonly onSubmit: (
      listId: string,
      input: NewTaskInput,
      steps: string[],
    ) => Promise<void>,
  ) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('New task');
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <CreateTaskForm
          todoLists={this.todoLists}
          defaultListId={this.defaultListId}
          initialDate={this.initialDate}
          onSubmit={async (listId, input, steps) => {
            await this.onSubmit(listId, input, steps);
            this.close();
          }}
          onCancel={() => this.close()}
        />
      </StrictMode>,
    );
  }

  onClose(): void {
    this.root?.unmount();
  }
}

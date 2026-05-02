# Create Task Feature Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "+ New task" button to the toolbar that opens a creation modal allowing users to create Microsoft To Do tasks with a title, list, due date, optional recurrence, notes, and checklist steps.

**Architecture:** Mirror the existing `CreateEventModal` pattern — a new `CreateTaskModal.tsx` file contains both the React form component and the Obsidian Modal class. `TodoService` gets a `createTask()` method. `Toolbar` gets an `onNewTask` prop. `CalendarApp` wires it all together.

**Tech Stack:** TypeScript, React 18 (createRoot), Obsidian Modal API, Microsoft Graph API (`/me/todo/lists/{id}/tasks`), Vitest + @testing-library/react

---

### Task 1: Add `NewTaskInput` and `TaskRecurrence` types

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the two new types after the `NewEventInput` interface**

In `src/types/index.ts`, after the `NewEventInput` block (currently ends around line 50), add:

```typescript
export interface NewTaskInput {
  title: string;
  dueDate: string;        // "YYYY-MM-DD"
  notes?: string;
  recurrence?: TaskRecurrence;
}

export interface TaskRecurrence {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;       // 1 = every period, 2 = every other, etc.
}
```

- [ ] **Step 2: Verify types compile**

Run: `npm run typecheck`
Expected: exit 0, no errors

- [ ] **Step 3: Commit**

```bash
git add src/types/index.ts
git commit -m "feat: add NewTaskInput and TaskRecurrence types"
```

---

### Task 2: `TodoService.createTask()` — basic creation (no recurrence)

**Files:**
- Modify: `tests/services/TodoService.test.ts`
- Modify: `src/services/TodoService.ts`

- [ ] **Step 1: Write the failing tests**

In `tests/services/TodoService.test.ts`, add a new `describe('createTask', ...)` block after the `deleteChecklistItem` block (after line 368):

```typescript
describe('createTask', () => {
  it('POSTs to the correct URL with title and dueDateTime', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'task-new',
        title: 'Buy groceries',
        dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        body: null,
        importance: 'normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await service.createTask('list1', { title: 'Buy groceries', dueDate: '2026-05-15' });

    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({
          title: 'Buy groceries',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        }),
      }),
    );
    expect(result).toMatchObject({
      id: 'task-new',
      title: 'Buy groceries',
      listId: 'list1',
      dueDate: '2026-05-15',
      importance: 'normal',
    });
    expect(result.body).toBeUndefined();
  });

  it('includes body in payload when notes is provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'task-new',
        title: 'Task with notes',
        dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        body: { content: 'Some notes' },
        importance: 'normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await service.createTask('list1', { title: 'Task with notes', dueDate: '2026-05-15', notes: 'Some notes' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.body).toEqual({ contentType: 'text', content: 'Some notes' });
  });

  it('omits body from payload when notes is not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'task-new',
        title: 'No notes',
        dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        body: null,
        importance: 'normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await service.createTask('list1', { title: 'No notes', dueDate: '2026-05-15' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.body).toBeUndefined();
  });

  it('encodes special characters in list ID', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'task-new',
        title: 'Task',
        dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        body: null,
        importance: 'normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await service.createTask('list/id+1=', { title: 'Task', dueDate: '2026-05-15' });

    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('%2F');
    expect(url).toContain('%2B');
    expect(url).toContain('%3D');
  });

  it('throws when Graph returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Bad Request' }));
    await expect(
      service.createTask('list1', { title: 'Task', dueDate: '2026-05-15' }),
    ).rejects.toThrow('Failed to create task: Bad Request');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: FAIL — `service.createTask is not a function`

- [ ] **Step 3: Implement `createTask` in `TodoService` (no recurrence)**

In `src/services/TodoService.ts`, add the following import at the top (after the existing imports):

```typescript
import { NewTaskInput } from '../types';
```

Then add this method to the `TodoService` class, after `deleteChecklistItem`:

```typescript
async createTask(listId: string, input: NewTaskInput): Promise<M365TodoItem> {
  const token = await this.auth.getValidToken();
  const encodedListId = encodeURIComponent(listId);

  const body: Record<string, unknown> = {
    title: input.title,
    dueDateTime: {
      dateTime: `${input.dueDate}T00:00:00`,
      timeZone: 'UTC',
    },
  };

  if (input.notes) {
    body.body = { contentType: 'text', content: input.notes };
  }

  const response = await fetchWithRetry(
    `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error(`Failed to create task: ${response.statusText}`);
  const data = await response.json() as Record<string, unknown>;
  return {
    id: data.id as string,
    title: data.title as string,
    listId,
    dueDate: input.dueDate,
    body: input.notes || undefined,
    importance: 'normal',
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: all tests pass, including the new `createTask` block (recurrence tests are not yet written)

- [ ] **Step 5: Commit**

```bash
git add src/services/TodoService.ts src/types/index.ts tests/services/TodoService.test.ts
git commit -m "feat: add TodoService.createTask (no recurrence)"
```

---

### Task 3: `TodoService.createTask()` — recurrence support

**Files:**
- Modify: `tests/services/TodoService.test.ts`
- Modify: `src/services/TodoService.ts`

- [ ] **Step 1: Write the failing recurrence tests**

Inside the existing `describe('createTask', ...)` block in `tests/services/TodoService.test.ts`, add after the last test:

```typescript
  it('includes daily recurrence pattern when frequency is daily', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'task-new', title: 'Daily task',
        dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        body: null, importance: 'normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await service.createTask('list1', {
      title: 'Daily task',
      dueDate: '2026-05-15',
      recurrence: { frequency: 'daily', interval: 1 },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.recurrence).toEqual({
      pattern: { type: 'daily', interval: 1 },
      range: { type: 'noEnd', startDate: '2026-05-15' },
    });
  });

  it('includes weekly recurrence with daysOfWeek derived from the due date', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'task-new', title: 'Weekly task',
        dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        body: null, importance: 'normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // 2026-05-15 is a Friday
    await service.createTask('list1', {
      title: 'Weekly task',
      dueDate: '2026-05-15',
      recurrence: { frequency: 'weekly', interval: 2 },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.recurrence).toEqual({
      pattern: { type: 'weekly', interval: 2, daysOfWeek: ['friday'] },
      range: { type: 'noEnd', startDate: '2026-05-15' },
    });
  });

  it('includes absoluteMonthly recurrence with dayOfMonth derived from the due date', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'task-new', title: 'Monthly task',
        dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        body: null, importance: 'normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await service.createTask('list1', {
      title: 'Monthly task',
      dueDate: '2026-05-15',
      recurrence: { frequency: 'monthly', interval: 1 },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.recurrence).toEqual({
      pattern: { type: 'absoluteMonthly', interval: 1, dayOfMonth: 15 },
      range: { type: 'noEnd', startDate: '2026-05-15' },
    });
  });

  it('includes absoluteYearly recurrence with dayOfMonth and month derived from the due date', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'task-new', title: 'Yearly task',
        dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        body: null, importance: 'normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    // May = month 5
    await service.createTask('list1', {
      title: 'Yearly task',
      dueDate: '2026-05-15',
      recurrence: { frequency: 'yearly', interval: 1 },
    });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.recurrence).toEqual({
      pattern: { type: 'absoluteYearly', interval: 1, dayOfMonth: 15, month: 5 },
      range: { type: 'noEnd', startDate: '2026-05-15' },
    });
  });

  it('omits recurrence from payload when recurrence is not provided', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({
        id: 'task-new', title: 'No recurrence',
        dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
        body: null, importance: 'normal',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    await service.createTask('list1', { title: 'No recurrence', dueDate: '2026-05-15' });

    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
    expect(body.recurrence).toBeUndefined();
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/TodoService.test.ts -t "recurrence"`
Expected: FAIL — recurrence field is undefined in the request body

- [ ] **Step 3: Implement recurrence in `createTask`**

Update the `createTask` method in `src/services/TodoService.ts`. Replace the method body with the full implementation including recurrence:

```typescript
async createTask(listId: string, input: NewTaskInput): Promise<M365TodoItem> {
  const token = await this.auth.getValidToken();
  const encodedListId = encodeURIComponent(listId);

  const body: Record<string, unknown> = {
    title: input.title,
    dueDateTime: {
      dateTime: `${input.dueDate}T00:00:00`,
      timeZone: 'UTC',
    },
  };

  if (input.notes) {
    body.body = { contentType: 'text', content: input.notes };
  }

  if (input.recurrence) {
    const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    const dueDate = new Date(`${input.dueDate}T00:00:00`);
    let pattern: Record<string, unknown>;
    switch (input.recurrence.frequency) {
      case 'daily':
        pattern = { type: 'daily', interval: input.recurrence.interval };
        break;
      case 'weekly':
        pattern = {
          type: 'weekly',
          interval: input.recurrence.interval,
          daysOfWeek: [DAYS_OF_WEEK[dueDate.getDay()]],
        };
        break;
      case 'monthly':
        pattern = {
          type: 'absoluteMonthly',
          interval: input.recurrence.interval,
          dayOfMonth: dueDate.getDate(),
        };
        break;
      case 'yearly':
        pattern = {
          type: 'absoluteYearly',
          interval: input.recurrence.interval,
          dayOfMonth: dueDate.getDate(),
          month: dueDate.getMonth() + 1,
        };
        break;
    }
    body.recurrence = {
      pattern,
      range: { type: 'noEnd', startDate: input.dueDate },
    };
  }

  const response = await fetchWithRetry(
    `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    },
  );
  if (!response.ok) throw new Error(`Failed to create task: ${response.statusText}`);
  const data = await response.json() as Record<string, unknown>;
  return {
    id: data.id as string,
    title: data.title as string,
    listId,
    dueDate: input.dueDate,
    body: input.notes || undefined,
    importance: 'normal',
  };
}
```

- [ ] **Step 4: Run all TodoService tests**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/services/TodoService.ts tests/services/TodoService.test.ts
git commit -m "feat: add recurrence support to TodoService.createTask"
```

---

### Task 4: `CreateTaskModal.tsx` — rendering, validation, and cancel

**Files:**
- Create: `tests/components/CreateTaskModal.test.tsx`
- Create: `src/components/CreateTaskModal.tsx`

- [ ] **Step 1: Write failing tests**

Create `tests/components/CreateTaskModal.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/CreateTaskModal.test.tsx`
Expected: FAIL — `Cannot find module '../../src/components/CreateTaskModal'`

- [ ] **Step 3: Create `src/components/CreateTaskModal.tsx` with the basic form**

Create `src/components/CreateTaskModal.tsx`:

```tsx
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
  const [interval, setInterval] = useState(1);
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
    const recurrence: TaskRecurrence | undefined = repeat ? { frequency, interval } : undefined;
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
              value={interval}
              onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value) || 1))}
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
    this.titleEl.setText('New task'); // eslint-disable-line obsidianmd/ui/sentence-case
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/CreateTaskModal.test.tsx`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/CreateTaskModal.tsx tests/components/CreateTaskModal.test.tsx
git commit -m "feat: add CreateTaskModal with basic form, validation, and cancel"
```

---

### Task 5: `CreateTaskForm` — repeat checkbox expansion

**Files:**
- Modify: `tests/components/CreateTaskModal.test.tsx`

(The implementation is already in place from Task 4 — these tests verify the existing repeat behaviour.)

- [ ] **Step 1: Write the failing tests**

Add to the `describe('CreateTaskForm', ...)` block in `tests/components/CreateTaskModal.test.tsx`:

```typescript
  it('does not render frequency or interval fields when Repeat is unchecked', () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date('2026-05-15')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    expect(screen.queryByLabelText(/frequency/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/every/i)).not.toBeInTheDocument();
  });

  it('shows frequency and interval fields when Repeat is checked', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date('2026-05-15')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    expect(screen.getByRole('combobox', { name: /frequency/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/every/i)).toBeInTheDocument();
  });

  it('hides frequency and interval fields when Repeat is unchecked again', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date('2026-05-15')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    expect(screen.queryByLabelText(/frequency/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/every/i)).not.toBeInTheDocument();
  });

  it('calls onSubmit with recurrence when Repeat is checked', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date(2026, 4, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Task title'), 'Weekly review');
    await userEvent.click(screen.getByRole('checkbox', { name: /repeat/i }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /frequency/i }), 'weekly');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith(
      'list1',
      expect.objectContaining({ recurrence: { frequency: 'weekly', interval: 1 } }),
      [],
    );
  });

  it('calls onSubmit without recurrence when Repeat is not checked', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date(2026, 4, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Task title'), 'One-time task');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith(
      'list1',
      expect.objectContaining({ recurrence: undefined }),
      [],
    );
  });
```

- [ ] **Step 2: Run tests to verify they pass (no code change needed)**

Run: `npx vitest run tests/components/CreateTaskModal.test.tsx`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/components/CreateTaskModal.test.tsx
git commit -m "test: add repeat checkbox expansion tests for CreateTaskForm"
```

---

### Task 6: `CreateTaskForm` — steps (checklist items)

**Files:**
- Modify: `tests/components/CreateTaskModal.test.tsx`

(The implementation is already in place from Task 4 — these tests verify the steps behaviour.)

- [ ] **Step 1: Write the failing tests**

Add to the `describe('CreateTaskForm', ...)` block in `tests/components/CreateTaskModal.test.tsx`:

```typescript
  it('adds a step when Enter is pressed in the step input', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date('2026-05-15')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Add step'), 'Step one{Enter}');
    expect(screen.getByText('Step one')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Add step')).toHaveValue('');
  });

  it('removes a step when its delete button is clicked', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date('2026-05-15')}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Add step'), 'Step one{Enter}');
    await userEvent.click(screen.getByRole('button', { name: /Delete Step one/i }));
    expect(screen.queryByText('Step one')).not.toBeInTheDocument();
  });

  it('includes committed steps in onSubmit call', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date(2026, 4, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Task title'), 'My task');
    await userEvent.type(screen.getByPlaceholderText('Add step'), 'Step one{Enter}');
    await userEvent.type(screen.getByPlaceholderText('Add step'), 'Step two{Enter}');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith(
      'list1',
      expect.objectContaining({ title: 'My task' }),
      ['Step one', 'Step two'],
    );
  });

  it('flushes a pending (uncommitted) step into onSubmit when Create is clicked', async () => {
    render(
      <CreateTaskForm
        todoLists={todoLists}
        defaultListId="list1"
        initialDate={new Date(2026, 4, 15)}
        onSubmit={onSubmit}
        onCancel={onCancel}
      />,
    );
    await userEvent.type(screen.getByPlaceholderText('Task title'), 'My task');
    // Type step text but do NOT press Enter — just click Create
    await userEvent.type(screen.getByPlaceholderText('Add step'), 'Pending step');
    await userEvent.click(screen.getByText('Create'));
    expect(onSubmit).toHaveBeenCalledWith(
      'list1',
      expect.objectContaining({ title: 'My task' }),
      ['Pending step'],
    );
  });
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/components/CreateTaskModal.test.tsx`
Expected: all tests pass

- [ ] **Step 3: Commit**

```bash
git add tests/components/CreateTaskModal.test.tsx
git commit -m "test: add steps/checklist tests for CreateTaskForm"
```

---

### Task 7: `Toolbar` — add `onNewTask` prop and button

**Files:**
- Modify: `tests/components/Toolbar.test.tsx`
- Modify: `src/components/Toolbar.tsx`

- [ ] **Step 1: Write the failing test**

In `tests/components/Toolbar.test.tsx`, update `defaultProps` to include `onNewTask` and add a test. First, add `onNewTask: vi.fn()` to the `defaultProps` object (around line 14):

```typescript
const defaultProps = {
  currentDate: new Date(2026, 3, 1),
  view: 'month' as const,
  onViewChange: vi.fn(),
  onNavigate: vi.fn(),
  onRefresh: vi.fn(),
  onNewEvent: vi.fn(),
  onNewTask: vi.fn(),
  syncing: false,
  refreshFailed: false,
};
```

Then add this test after the existing `onNewEvent` test:

```typescript
  it('calls onNewTask when "+ New task" button is clicked', async () => {
    const onNewTask = vi.fn();
    render(<Toolbar {...defaultProps} onNewTask={onNewTask} />);
    await userEvent.click(screen.getByText('+ New task'));
    expect(onNewTask).toHaveBeenCalledTimes(1);
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/components/Toolbar.test.tsx`
Expected: FAIL — `+ New task` button not found

- [ ] **Step 3: Update `Toolbar` component**

In `src/components/Toolbar.tsx`, update the `ToolbarProps` interface to add `onNewTask`:

```typescript
interface ToolbarProps {
  currentDate: Date;
  view: ViewType;
  onViewChange: (view: ViewType) => void;
  onNavigate: (direction: 'prev' | 'next' | 'today') => void;
  onRefresh: () => void;
  onNewEvent: () => void;
  onNewTask: () => void;
  syncing: boolean;
  refreshFailed: boolean;
}
```

Update the destructured props in the component function signature:

```typescript
export const Toolbar: React.FC<ToolbarProps> = ({
  currentDate,
  view,
  onViewChange,
  onNavigate,
  onRefresh,
  onNewEvent,
  onNewTask,
  syncing,
  refreshFailed,
}) => {
```

Update the `m365-toolbar-actions` div to add the `+ New task` button to the left of `+ New event`:

```tsx
      <div className="m365-toolbar-actions">
        <button className="m365-new-task-btn" onClick={onNewTask}>
          + New task
        </button>
        <button className="m365-new-event-btn" onClick={onNewEvent}>
          + New event
        </button>
        <button
          className={`m365-calendar-refresh${refreshFailed ? ' m365-refresh-failed' : ''}`}
          onClick={onRefresh}
          disabled={syncing}
          title={refreshTitle}
        >
          {refreshLabel}
        </button>
      </div>
```

- [ ] **Step 4: Run all Toolbar tests**

Run: `npx vitest run tests/components/Toolbar.test.tsx`
Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/components/Toolbar.tsx tests/components/Toolbar.test.tsx
git commit -m "feat: add onNewTask prop and '+ New task' button to Toolbar"
```

---

### Task 8: `CalendarApp` wiring — `openCreateTaskModal` and toolbar integration

**Files:**
- Modify: `tests/components/CalendarApp.test.tsx`
- Modify: `src/components/CalendarApp.tsx`

- [ ] **Step 1: Add `CreateTaskModal` mock and write failing tests**

In `tests/components/CalendarApp.test.tsx`, add a `createTaskModalCallbacks` hoisted variable and a mock for `CreateTaskModal`. Add after the existing `vi.mock('../../src/components/CreateEventModal', ...)` block (around line 71):

```typescript
const createTaskModalCallbacks = vi.hoisted(() => ({
  onSubmit: null as ((listId: string, input: import('../../src/types').NewTaskInput, steps: string[]) => Promise<void>) | null,
}));

vi.mock('../../src/components/CreateTaskModal', () => ({
  CreateTaskModal: class {
    constructor(
      _app: unknown,
      _todoLists: unknown,
      _defaultListId: unknown,
      _initialDate: unknown,
      onSubmit: (listId: string, input: import('../../src/types').NewTaskInput, steps: string[]) => Promise<void>,
    ) {
      createTaskModalCallbacks.onSubmit = onSubmit;
    }
    open() {}
  },
}));
```

Also update the `todoService` mock in `makeContext` to include `createTask` and `createChecklistItem`:

```typescript
    todoService: {
      getLists: vi.fn().mockResolvedValue([]),
      getTasks: vi.fn().mockResolvedValue([]),
      completeTask: vi.fn().mockResolvedValue(undefined),
      createTask: vi.fn().mockResolvedValue({
        id: 'new-task-1', title: 'New task', listId: 'list1',
        dueDate: '2026-04-15', importance: 'normal' as const,
      }),
      createChecklistItem: vi.fn().mockResolvedValue({ id: 'ci1', displayName: 'Step', isChecked: false }),
    } as unknown as AppContextValue['todoService'],
```

Then add the following tests to the `describe('CalendarApp', ...)` block:

```typescript
  it('renders the "+ New task" button', async () => {
    const ctx = makeContext();
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getCalendars).toHaveBeenCalled());
    expect(screen.getByText('+ New task')).toBeInTheDocument();
  });

  it('opens CreateTaskModal when "+ New task" is clicked', async () => {
    const ctx = makeContext({
      todoService: {
        getLists: vi.fn().mockResolvedValue([{ id: 'list1', displayName: 'Work', color: '#ef4444' }]),
        getTasks: vi.fn().mockResolvedValue([]),
        completeTask: vi.fn(),
        createTask: vi.fn().mockResolvedValue({
          id: 'new-task-1', title: 'New task', listId: 'list1',
          dueDate: '2026-04-15', importance: 'normal' as const,
        }),
        createChecklistItem: vi.fn().mockResolvedValue({ id: 'ci1', displayName: 'Step', isChecked: false }),
      } as unknown as AppContextValue['todoService'],
    });
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getCalendars).toHaveBeenCalled());

    await userEvent.click(screen.getByText('+ New task'));
    expect(createTaskModalCallbacks.onSubmit).not.toBeNull();
  });

  it('calls todoService.createTask and createChecklistItem on submit', async () => {
    const createTask = vi.fn().mockResolvedValue({
      id: 'new-task-1', title: 'Buy milk', listId: 'list1',
      dueDate: '2026-04-15', importance: 'normal' as const,
    });
    const createChecklistItem = vi.fn().mockResolvedValue({ id: 'ci1', displayName: 'Step one', isChecked: false });
    const ctx = makeContext({
      todoService: {
        getLists: vi.fn().mockResolvedValue([{ id: 'list1', displayName: 'Work', color: '#ef4444' }]),
        getTasks: vi.fn().mockResolvedValue([]),
        completeTask: vi.fn(),
        createTask,
        createChecklistItem,
      } as unknown as AppContextValue['todoService'],
    });
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getCalendars).toHaveBeenCalled());
    await userEvent.click(screen.getByText('+ New task'));

    await createTaskModalCallbacks.onSubmit!('list1', { title: 'Buy milk', dueDate: '2026-04-15' }, ['Step one']);

    expect(createTask).toHaveBeenCalledWith('list1', { title: 'Buy milk', dueDate: '2026-04-15' });
    expect(createChecklistItem).toHaveBeenCalledWith('list1', 'new-task-1', 'Step one');
  });

  it('calls notifyError and rethrows when createTask fails', async () => {
    const createTask = vi.fn().mockRejectedValue(new Error('Graph error'));
    const ctx = makeContext({
      todoService: {
        getLists: vi.fn().mockResolvedValue([{ id: 'list1', displayName: 'Work', color: '#ef4444' }]),
        getTasks: vi.fn().mockResolvedValue([]),
        completeTask: vi.fn(),
        createTask,
        createChecklistItem: vi.fn(),
      } as unknown as AppContextValue['todoService'],
    });
    renderCalendarApp(ctx);
    await waitFor(() => expect(ctx.calendarService.getCalendars).toHaveBeenCalled());
    await userEvent.click(screen.getByText('+ New task'));

    await expect(
      createTaskModalCallbacks.onSubmit!('list1', { title: 'Buy milk', dueDate: '2026-04-15' }, []),
    ).rejects.toThrow('Graph error');

    expect(obsidianMock.Notice).toHaveBeenCalledWith(expect.stringContaining('Graph error'));
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/CalendarApp.test.tsx -t "New task"`
Expected: FAIL — `+ New task` button not found or `createTaskModalCallbacks.onSubmit` is null

- [ ] **Step 3: Wire up `CalendarApp`**

In `src/components/CalendarApp.tsx`:

Add the import for `CreateTaskModal` at the top with the other modal imports:

```typescript
import { CreateTaskModal } from './CreateTaskModal';
```

Add the `openCreateTaskModal` function in the component body, after `openCreateEventModal`:

```typescript
  const openCreateTaskModal = (date: Date) => {
    if (todoLists.length === 0) {
      new Notice('No task lists available. Enable at least one task list.');
      return;
    }
    const defaultListId = enabledTodoListIds[0] ?? todoLists[0]?.id ?? '';
    new CreateTaskModal(
      app,
      todoLists,
      defaultListId,
      date,
      async (listId, input, steps) => {
        try {
          const created = await todoService.createTask(listId, input);
          for (const step of steps) {
            await todoService.createChecklistItem(listId, created.id, step);
          }
          const { start, end } = getDateRange(currentDate, view);
          const startStr = toDateOnly(start);
          const endStr = toDateOnly(end);
          if (created.dueDate >= startStr && created.dueDate <= endStr) {
            setTodos((prev) => [...prev, created]);
          }
        } catch (e) {
          notifyError(e);
          throw e;
        }
      },
    ).open();
  };
```

Also add the `toDateOnly` import to the datetime imports if it is not already imported. Check the existing import line in `CalendarApp.tsx` (currently `import { getDateRange, getDatesInRange } from '../lib/datetime';`) and update it to:

```typescript
import { getDateRange, getDatesInRange, toDateOnly } from '../lib/datetime';
```

Update the `<Toolbar>` JSX to pass `onNewTask`:

```tsx
      <Toolbar
        currentDate={currentDate}
        view={view}
        onViewChange={setView}
        onNavigate={handleNavigate}
        onNewEvent={() => openCreateEventModal(new Date())}
        onNewTask={() => openCreateTaskModal(view === 'day' ? currentDate : new Date())}
        onRefresh={() => {
          void fetchAll({ reloadCalendars: true, userInitiated: true });
          void fetchTodos({ reloadLists: true });
        }}
        syncing={syncing}
        refreshFailed={refreshFailed}
      />
```

- [ ] **Step 4: Run all CalendarApp tests**

Run: `npx vitest run tests/components/CalendarApp.test.tsx`
Expected: all tests pass

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: all tests pass

- [ ] **Step 6: Typecheck**

Run: `npm run typecheck`
Expected: exit 0

- [ ] **Step 7: Lint**

Run: `npm run lint`
Expected: exit 0, no errors

- [ ] **Step 8: Commit**

```bash
git add src/components/CalendarApp.tsx tests/components/CalendarApp.test.tsx
git commit -m "feat: wire up CreateTaskModal in CalendarApp with openCreateTaskModal"
```

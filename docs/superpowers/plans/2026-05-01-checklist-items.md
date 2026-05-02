# Checklist Items Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add full CRUD checklist item support to `TodoDetailForm`, backed by Microsoft Graph API calls in `TodoService`.

**Architecture:** Local component state in `TodoDetailForm` — fetch on mount, optimistic updates for toggle and delete, server-confirmed create. `todoService` is threaded from `CalendarApp` (which already holds it via `AppContext`) through `TodoDetailModal`'s constructor into the form props. When all items are checked the parent task is auto-completed.

**Tech Stack:** React (useState, useEffect), TypeScript, Microsoft Graph API `/checklistItems` endpoint, Vitest + testing-library

---

## File Map

| File | Action | What changes |
|---|---|---|
| `src/types/index.ts` | Modify | Add `M365ChecklistItem` interface |
| `src/services/TodoService.ts` | Modify | Add `getChecklistItems`, `createChecklistItem`, `updateChecklistItem`, `deleteChecklistItem` |
| `src/components/TodoDetailModal.tsx` | Modify | Add `todoService` prop, imports, state, checklist UI |
| `src/components/CalendarApp.tsx` | Modify | Pass `todoService` to `TodoDetailModal` constructor |
| `tests/services/TodoService.test.ts` | Modify | Add `describe('checklistItems')` block |
| `tests/components/TodoDetailModal.test.tsx` | Modify | Add mock service, make existing tests async, add checklist tests |

---

## Task 1: Add M365ChecklistItem type

**Files:**
- Modify: `src/types/index.ts`

- [ ] **Step 1: Add the type after `M365TodoItem`**

In `src/types/index.ts`, insert after the `M365TodoItem` interface (after line 36):

```ts
export interface M365ChecklistItem {
  id: string;
  displayName: string;
  isChecked: boolean;
}
```

- [ ] **Step 2: Verify typecheck passes**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 3: Commit**

```
git add src/types/index.ts
git commit -m "feat: add M365ChecklistItem type"
```

---

## Task 2: getChecklistItems service method

**Files:**
- Modify: `src/services/TodoService.ts`
- Test: `tests/services/TodoService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe('getChecklistItems')` block inside the existing `describe('TodoService')` in `tests/services/TodoService.test.ts`:

```ts
  describe('getChecklistItems', () => {
    it('fetches items for the given list and task', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'ci1', displayName: 'Step one', isChecked: false },
            { id: 'ci2', displayName: 'Step two', isChecked: true },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const result = await service.getChecklistItems('list1', 'task1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1/checklistItems',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
      );
      expect(result).toEqual([
        { id: 'ci1', displayName: 'Step one', isChecked: false },
        { id: 'ci2', displayName: 'Step two', isChecked: true },
      ]);
    });

    it('encodes special characters in list and task IDs', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      await service.getChecklistItems('list/id+1=', 'task/id+2=');
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('%2F');
      expect(url).toContain('%2B');
      expect(url).toContain('%3D');
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }));
      await expect(service.getChecklistItems('list1', 'task1')).rejects.toThrow(
        'Failed to fetch checklist items: Forbidden',
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: FAIL — `service.getChecklistItems is not a function`

- [ ] **Step 3: Implement getChecklistItems in TodoService**

Add this method to `TodoService` in `src/services/TodoService.ts`, after `completeTask`:

```ts
  async getChecklistItems(listId: string, taskId: string): Promise<M365ChecklistItem[]> {
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}/checklistItems`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error(`Failed to fetch checklist items: ${response.statusText}`);
    const data = await response.json() as { value: Record<string, unknown>[] };
    return data.value.map((item) => ({
      id: item.id as string,
      displayName: item.displayName as string,
      isChecked: item.isChecked as boolean,
    }));
  }
```

Also add the import for `M365ChecklistItem` to the existing import line at the top of `TodoService.ts`:

```ts
import { M365TodoList, M365TodoItem, M365ChecklistItem } from '../types';
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: all pass

- [ ] **Step 5: Commit**

```
git add src/services/TodoService.ts tests/services/TodoService.test.ts
git commit -m "feat: add TodoService.getChecklistItems"
```

---

## Task 3: createChecklistItem service method

**Files:**
- Modify: `src/services/TodoService.ts`
- Test: `tests/services/TodoService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('TodoService')`:

```ts
  describe('createChecklistItem', () => {
    it('POSTs the displayName and returns the created item', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'ci3', displayName: 'New step', isChecked: false }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const result = await service.createChecklistItem('list1', 'task1', 'New step');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1/checklistItems',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ displayName: 'New step' }),
        }),
      );
      expect(result).toEqual({ id: 'ci3', displayName: 'New step', isChecked: false });
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Bad Request' }));
      await expect(service.createChecklistItem('list1', 'task1', 'Step')).rejects.toThrow(
        'Failed to create checklist item: Bad Request',
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: FAIL — `service.createChecklistItem is not a function`

- [ ] **Step 3: Implement createChecklistItem**

Add after `getChecklistItems` in `src/services/TodoService.ts`:

```ts
  async createChecklistItem(listId: string, taskId: string, displayName: string): Promise<M365ChecklistItem> {
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}/checklistItems`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName }),
      },
    );
    if (!response.ok) throw new Error(`Failed to create checklist item: ${response.statusText}`);
    const data = await response.json() as Record<string, unknown>;
    return {
      id: data.id as string,
      displayName: data.displayName as string,
      isChecked: data.isChecked as boolean,
    };
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: all pass

- [ ] **Step 5: Commit**

```
git add src/services/TodoService.ts tests/services/TodoService.test.ts
git commit -m "feat: add TodoService.createChecklistItem"
```

---

## Task 4: updateChecklistItem service method

**Files:**
- Modify: `src/services/TodoService.ts`
- Test: `tests/services/TodoService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('TodoService')`:

```ts
  describe('updateChecklistItem', () => {
    it('PATCHes the item with the given patch object', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.updateChecklistItem('list1', 'task1', 'ci1', { isChecked: true });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1/checklistItems/ci1',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ isChecked: true }),
        }),
      );
    });

    it('encodes special characters in all three IDs', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.updateChecklistItem('l/1=', 't/2=', 'ci/3=', { isChecked: false });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('%2F');
      expect(url).toContain('%3D');
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
      await expect(
        service.updateChecklistItem('list1', 'task1', 'ci1', { isChecked: true }),
      ).rejects.toThrow('Failed to update checklist item: Not Found');
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: FAIL — `service.updateChecklistItem is not a function`

- [ ] **Step 3: Implement updateChecklistItem**

Add after `createChecklistItem` in `src/services/TodoService.ts`:

```ts
  async updateChecklistItem(
    listId: string,
    taskId: string,
    itemId: string,
    patch: Partial<Pick<M365ChecklistItem, 'isChecked' | 'displayName'>>,
  ): Promise<void> {
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const encodedItemId = encodeURIComponent(itemId);
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}/checklistItems/${encodedItemId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      },
    );
    if (!response.ok) throw new Error(`Failed to update checklist item: ${response.statusText}`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: all pass

- [ ] **Step 5: Commit**

```
git add src/services/TodoService.ts tests/services/TodoService.test.ts
git commit -m "feat: add TodoService.updateChecklistItem"
```

---

## Task 5: deleteChecklistItem service method

**Files:**
- Modify: `src/services/TodoService.ts`
- Test: `tests/services/TodoService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('TodoService')`:

```ts
  describe('deleteChecklistItem', () => {
    it('sends DELETE to the correct URL with auth header', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.deleteChecklistItem('list1', 'task1', 'ci1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1/checklistItems/ci1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      );
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
      await expect(service.deleteChecklistItem('list1', 'task1', 'ci1')).rejects.toThrow(
        'Failed to delete checklist item: Not Found',
      );
    });
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: FAIL — `service.deleteChecklistItem is not a function`

- [ ] **Step 3: Implement deleteChecklistItem**

Add after `updateChecklistItem` in `src/services/TodoService.ts`:

```ts
  async deleteChecklistItem(listId: string, taskId: string, itemId: string): Promise<void> {
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const encodedItemId = encodeURIComponent(itemId);
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}/checklistItems/${encodedItemId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) throw new Error(`Failed to delete checklist item: ${response.statusText}`);
  }
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/services/TodoService.test.ts`
Expected: all pass

- [ ] **Step 5: Commit**

```
git add src/services/TodoService.ts tests/services/TodoService.test.ts
git commit -m "feat: add TodoService.deleteChecklistItem"
```

---

## Task 6: Thread todoService through TodoDetailModal

**Files:**
- Modify: `src/components/TodoDetailModal.tsx`
- Modify: `src/components/CalendarApp.tsx`
- Test: `tests/components/TodoDetailModal.test.tsx`

This task wires `todoService` into the modal. The component body doesn't use it yet — that's Task 7. Existing tests are made async in this step so they're ready for the `useEffect` added in Task 7.

- [ ] **Step 1: Update TodoDetailModal.tsx**

Replace the entire contents of `src/components/TodoDetailModal.tsx` with:

```tsx
import { App, Modal } from 'obsidian';
import React, { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365TodoItem, M365TodoList } from '../types';
import { TodoService } from '../services/TodoService';

// ── Form ─────────────────────────────────────────────────────────────────────

interface TodoDetailFormProps {
  todo: M365TodoItem;
  todoList: M365TodoList;
  todoService: TodoService;
  onComplete: () => void;
}

export const TodoDetailForm: React.FC<TodoDetailFormProps> = ({ todo, todoList, onComplete }) => {
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
      <div className="m365-todo-detail-footer">
        <button type="button" onClick={onComplete}>Mark complete</button>
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
```

- [ ] **Step 2: Update CalendarApp.tsx**

Find the line in `src/components/CalendarApp.tsx` that reads:

```ts
    new TodoDetailModal(app, todo, list, onComplete).open();
```

Replace it with:

```ts
    new TodoDetailModal(app, todo, list, todoService, onComplete).open();
```

- [ ] **Step 3: Update existing tests to include mock todoService**

Replace the entire contents of `tests/components/TodoDetailModal.test.tsx` with:

```tsx
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

  it('applies the list color to the dot indicator', async () => {
    const { container } = render(<TodoDetailForm todo={todo} todoList={todoList} todoService={makeMockTodoService()} onComplete={vi.fn()} />);
    await screen.findByText('Work Tasks');
    const dot = container.querySelector('.m365-todo-detail-dot') as HTMLElement;
    expect(dot.style.backgroundColor).toBe('rgb(59, 130, 246)');
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
});
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/TodoDetailModal.test.tsx`
Expected: all 10 existing tests pass

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: no errors

- [ ] **Step 6: Commit**

```
git add src/components/TodoDetailModal.tsx src/components/CalendarApp.tsx tests/components/TodoDetailModal.test.tsx
git commit -m "feat: thread todoService into TodoDetailModal"
```

---

## Task 7: Fetch and display checklist items with toggle and auto-complete

**Files:**
- Modify: `src/components/TodoDetailModal.tsx`
- Test: `tests/components/TodoDetailModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append these tests inside `describe('TodoDetailForm')` in `tests/components/TodoDetailModal.test.tsx`:

```tsx
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
  });
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/TodoDetailModal.test.tsx`
Expected: FAIL — `Unable to find an element with the text: Loading checklist…`

- [ ] **Step 3: Implement the checklist fetch, display, toggle, and auto-complete**

Replace the entire contents of `src/components/TodoDetailModal.tsx` with:

```tsx
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
    void todoService.getChecklistItems(todo.listId, todo.id)
      .then(setChecklistItems)
      .catch((e: unknown) => console.error('Failed to load checklist items:', e))
      .finally(() => setLoadingChecklist(false));
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
    setChecklistItems((prev) => prev.filter((i) => i.id !== itemId));
    void todoService.deleteChecklistItem(todo.listId, todo.id, itemId)
      .catch((e: unknown) => console.error('Failed to delete checklist item:', e));
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
      <div className="m365-todo-detail-checklist">
        <span className="m365-todo-detail-label">Checklist</span>
        {loadingChecklist ? (
          <p>Loading checklist…</p>
        ) : (
          checklistItems.map((item) => (
            <div key={item.id} className="m365-checklist-item">
              <input
                type="checkbox"
                checked={item.isChecked}
                onChange={() => handleToggle(item)}
              />
              <span style={{ textDecoration: item.isChecked ? 'line-through' : 'none' }}>
                {item.displayName}
              </span>
            </div>
          ))
        )}
      </div>
      <div className="m365-todo-detail-footer">
        <button type="button" onClick={onComplete}>Mark complete</button>
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/TodoDetailModal.test.tsx`
Expected: all pass

- [ ] **Step 5: Commit**

```
git add src/components/TodoDetailModal.tsx tests/components/TodoDetailModal.test.tsx
git commit -m "feat: fetch and display checklist items with toggle and auto-complete"
```

---

## Task 8: Add new checklist item via inline input

**Files:**
- Modify: `src/components/TodoDetailModal.tsx`
- Test: `tests/components/TodoDetailModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append inside `describe('checklist')` in `tests/components/TodoDetailModal.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/components/TodoDetailModal.test.tsx`
Expected: FAIL — `Unable to find an element with placeholder text: Add item`

- [ ] **Step 3: Add the inline input to the checklist section**

In `src/components/TodoDetailModal.tsx`, replace the checklist section (the `{loadingChecklist ? ... : ...}` block) inside the `m365-todo-detail-checklist` div with:

```tsx
        {loadingChecklist ? (
          <p>Loading checklist…</p>
        ) : (
          <>
            {checklistItems.map((item) => (
              <div key={item.id} className="m365-checklist-item">
                <input
                  type="checkbox"
                  checked={item.isChecked}
                  onChange={() => handleToggle(item)}
                />
                <span style={{ textDecoration: item.isChecked ? 'line-through' : 'none' }}>
                  {item.displayName}
                </span>
              </div>
            ))}
            <input
              type="text"
              placeholder="Add item"
              value={newItemText}
              onChange={(e) => setNewItemText(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') handleAddItem(); }}
              onBlur={handleAddItem}
            />
          </>
        )}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/components/TodoDetailModal.test.tsx`
Expected: all pass

- [ ] **Step 5: Commit**

```
git add src/components/TodoDetailModal.tsx tests/components/TodoDetailModal.test.tsx
git commit -m "feat: add inline input to create checklist items"
```

---

## Task 9: Delete checklist item

**Files:**
- Modify: `src/components/TodoDetailModal.tsx`
- Test: `tests/components/TodoDetailModal.test.tsx`

- [ ] **Step 1: Write the failing test**

Append inside `describe('checklist')` in `tests/components/TodoDetailModal.test.tsx`:

```tsx
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
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/components/TodoDetailModal.test.tsx`
Expected: FAIL — `Unable to find an accessible element with the role "button" and name "Delete Step one"`

- [ ] **Step 3: Add the delete button to each checklist item row**

In `src/components/TodoDetailModal.tsx`, replace the `checklistItems.map(...)` block with:

```tsx
            {checklistItems.map((item) => (
              <div key={item.id} className="m365-checklist-item">
                <input
                  type="checkbox"
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
```

- [ ] **Step 4: Run all tests to verify they pass**

Run: `npx vitest run`
Expected: all tests pass across all files

- [ ] **Step 5: Run typecheck and lint**

Run: `npm run build`
Expected: builds cleanly with no errors

- [ ] **Step 6: Commit**

```
git add src/components/TodoDetailModal.tsx tests/components/TodoDetailModal.test.tsx
git commit -m "feat: add delete button for checklist items"
```

# Microsoft To Do Calendar Integration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add read-only Microsoft To Do support — incomplete tasks with due dates appear on the calendar across all views, toggled per-list in the sidebar, with a read-only detail modal on click.

**Architecture:** A new `TodoService` (parallel to `CalendarService`) fetches lists and tasks from the Graph API. `CalendarApp` holds todo state alongside calendar state and passes `todos` + `todoLists` as separate props to each view. `TodoCard` and `TodoDetailModal` are new components; all three views and `CalendarSelector` are updated to render them.

**Tech Stack:** TypeScript, React, Microsoft Graph API (`/me/todo/lists`, `/me/todo/lists/{id}/tasks`), Obsidian Plugin API, Vitest, Testing Library

---

## File Map

**Create:**
- `src/services/TodoService.ts` — Graph API calls for todo lists and tasks
- `src/components/TodoCard.tsx` — visual pill for a todo item (dashed border, ☐ icon)
- `src/components/TodoDetailModal.tsx` — `TodoDetailForm` React component + `TodoDetailModal` Obsidian Modal wrapper
- `tests/services/TodoService.test.ts`
- `tests/components/TodoCard.test.tsx`
- `tests/components/TodoDetailModal.test.tsx`

**Modify:**
- `src/types/index.ts` — add `M365TodoList`, `M365TodoItem`, `enabledTodoListIds` to settings
- `src/settings.ts` — add `enabledTodoListIds: []` to `DEFAULT_SETTINGS`
- `src/context.ts` — add `todoService: TodoService` to `AppContextValue`
- `src/main.ts` — construct `TodoService`, pass to view
- `src/components/CalendarSelector.tsx` — add Tasks section below Calendars
- `src/components/CalendarApp.tsx` — add todo state, `fetchTodos`, `handleToggleTodoList`, `handleTodoClick`
- `src/components/MonthView.tsx` — accept `todos`/`todoLists` props, render `TodoCard` in day cells
- `src/components/WeekView.tsx` — accept `todos`/`todoLists` props, render `TodoCard` in all-day row
- `src/components/DayView.tsx` — accept `todos`/`todoLists` props, render `TodoCard` in all-day section
- `tests/components/CalendarSelector.test.tsx` — add Tasks section tests, update `renderSelector` helper
- `tests/components/CalendarApp.test.tsx` — add `todoService` mock to context, add todo fetch/toggle tests

---

## Task 1: Add Types and Update Settings Defaults

**Files:**
- Modify: `src/types/index.ts`
- Modify: `src/settings.ts`

No tests needed — pure type additions and a settings default change. TypeScript compilation is the verification.

- [ ] **Step 1: Add `M365TodoList` and `M365TodoItem` to `src/types/index.ts`**

Add after the `M365Event` interface:

```ts
export interface M365TodoList {
  id: string;
  displayName: string;
  color: string; // deterministically assigned from a fixed palette
}

export interface M365TodoItem {
  id: string;
  title: string;
  listId: string;
  dueDate: string;      // "YYYY-MM-DD"
  body?: string;        // task notes; undefined when empty
  importance: 'low' | 'normal' | 'high';
}
```

- [ ] **Step 2: Add `enabledTodoListIds` to `M365CalendarSettings` in `src/types/index.ts`**

Inside the `M365CalendarSettings` interface, add:

```ts
enabledTodoListIds: string[];
```

- [ ] **Step 3: Add `enabledTodoListIds` default in `src/settings.ts`**

Inside `DEFAULT_SETTINGS`, add:

```ts
enabledTodoListIds: [],
```

- [ ] **Step 4: Verify types compile**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add src/types/index.ts src/settings.ts
git commit -m "feat: add M365TodoList, M365TodoItem types and enabledTodoListIds setting"
```

---

## Task 2: Implement TodoService (TDD)

**Files:**
- Create: `tests/services/TodoService.test.ts`
- Create: `src/services/TodoService.ts`

- [ ] **Step 1: Write the failing tests**

Create `tests/services/TodoService.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TodoService } from '../../src/services/TodoService';
import { AuthService } from '../../src/services/AuthService';

describe('TodoService', () => {
  let auth: Pick<AuthService, 'getValidToken'>;
  let service: TodoService;

  beforeEach(() => {
    auth = { getValidToken: vi.fn().mockResolvedValue('token') };
    service = new TodoService(auth as AuthService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getLists', () => {
    it('maps Graph response to M365TodoList and assigns a hex color', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [{ id: 'list1', displayName: 'Work Tasks' }] }),
      }));
      const lists = await service.getLists();
      expect(lists).toHaveLength(1);
      expect(lists[0]).toMatchObject({ id: 'list1', displayName: 'Work Tasks' });
      expect(lists[0].color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('assigns the same color to the same list ID across calls', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [{ id: 'list1', displayName: 'Work' }] }),
      }));
      const [first] = await service.getLists();
      const [second] = await service.getLists();
      expect(first.color).toBe(second.color);
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Unauthorized' }));
      await expect(service.getLists()).rejects.toThrow('Failed to fetch todo lists: Unauthorized');
    });
  });

  describe('getTasks', () => {
    it('returns empty array immediately when listIds is empty, making no fetch calls', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await service.getTasks([], new Date('2026-04-01'), new Date('2026-04-30'));
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches tasks for each list', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      await service.getTasks(['list1', 'list2'], new Date('2026-04-01'), new Date('2026-04-30'));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/me/todo/lists/list1/tasks'),
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/me/todo/lists/list2/tasks'),
        expect.any(Object),
      );
    });

    it('returns only tasks whose dueDate falls within the range', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            {
              id: 'task1',
              title: 'In range',
              dueDateTime: { dateTime: '2026-04-15T00:00:00' },
              body: { content: 'some notes' },
              importance: 'normal',
            },
            {
              id: 'task2',
              title: 'Out of range',
              dueDateTime: { dateTime: '2026-03-01T00:00:00' },
              body: { content: '' },
              importance: 'low',
            },
          ],
        }),
      }));
      const result = await service.getTasks(
        ['list1'],
        new Date('2026-04-01'),
        new Date('2026-04-30'),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'task1',
        title: 'In range',
        listId: 'list1',
        dueDate: '2026-04-15',
        body: 'some notes',
        importance: 'normal',
      });
    });

    it('excludes tasks without a dueDateTime', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'task1', title: 'No due date', dueDateTime: null, body: null, importance: 'normal' },
          ],
        }),
      }));
      const result = await service.getTasks(
        ['list1'],
        new Date('2026-04-01'),
        new Date('2026-04-30'),
      );
      expect(result).toHaveLength(0);
    });

    it('maps empty body content to undefined', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            {
              id: 'task1',
              title: 'Empty body',
              dueDateTime: { dateTime: '2026-04-15T00:00:00' },
              body: { content: '' },
              importance: 'normal',
            },
          ],
        }),
      }));
      const result = await service.getTasks(['list1'], new Date('2026-04-01'), new Date('2026-04-30'));
      expect(result[0].body).toBeUndefined();
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }));
      await expect(
        service.getTasks(['list1'], new Date('2026-04-01'), new Date('2026-04-30')),
      ).rejects.toThrow('Failed to fetch tasks: Forbidden');
    });
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/TodoService.test.ts
```

Expected: FAIL — `Cannot find module '../../src/services/TodoService'`

- [ ] **Step 3: Implement `src/services/TodoService.ts`**

```ts
import { AuthService } from './AuthService';
import { M365TodoList, M365TodoItem } from '../types';
import { fetchWithRetry } from '../lib/fetchWithRetry';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

const TODO_LIST_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#a855f7', '#ec4899', '#78716c',
];

function hashListColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return TODO_LIST_COLORS[Math.abs(hash) % TODO_LIST_COLORS.length];
}

export class TodoService {
  constructor(private readonly auth: AuthService) {}

  async getLists(): Promise<M365TodoList[]> {
    const token = await this.auth.getValidToken();
    const response = await fetchWithRetry(`${GRAPH_BASE}/me/todo/lists`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch todo lists: ${response.statusText}`);
    const data = await response.json() as { value: Record<string, unknown>[] };
    return data.value.map((list) => ({
      id: list.id as string,
      displayName: list.displayName as string,
      color: hashListColor(list.id as string),
    }));
  }

  async getTasks(listIds: string[], start: Date, end: Date): Promise<M365TodoItem[]> {
    if (listIds.length === 0) return [];
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    const results = await Promise.all(
      listIds.map((id) => this.getTasksForList(id, startStr, endStr)),
    );
    return results.flat();
  }

  private async getTasksForList(listId: string, startDate: string, endDate: string): Promise<M365TodoItem[]> {
    const token = await this.auth.getValidToken();
    const params = new URLSearchParams({
      '$filter': "status ne 'completed'",
      '$select': 'id,title,dueDateTime,body,importance',
    });
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${listId}/tasks?${params}`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error(`Failed to fetch tasks: ${response.statusText}`);
    const data = await response.json() as { value: Record<string, unknown>[] };
    return data.value
      .filter((task) => {
        const due = (task.dueDateTime as { dateTime: string } | null)?.dateTime;
        if (!due) return false;
        const dueDate = due.slice(0, 10);
        return dueDate >= startDate && dueDate <= endDate;
      })
      .map((task) => ({
        id: task.id as string,
        title: task.title as string,
        listId,
        dueDate: (task.dueDateTime as { dateTime: string }).dateTime.slice(0, 10),
        body: (task.body as { content: string } | null)?.content || undefined,
        importance: (task.importance as 'low' | 'normal' | 'high') ?? 'normal',
      }));
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/TodoService.test.ts
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/services/TodoService.ts tests/services/TodoService.test.ts
git commit -m "feat: implement TodoService with Graph API todo list and task fetching"
```

---

## Task 3: Implement TodoCard Component (TDD)

**Files:**
- Create: `tests/components/TodoCard.test.tsx`
- Create: `src/components/TodoCard.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/TodoCard.test.tsx`:

```tsx
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

  it('renders the checkmark icon', () => {
    render(<TodoCard todo={todo} todoList={todoList} />);
    expect(screen.getByText('☐')).toBeInTheDocument();
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
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/TodoCard.test.tsx
```

Expected: FAIL — `Cannot find module '../../src/components/TodoCard'`

- [ ] **Step 3: Implement `src/components/TodoCard.tsx`**

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/TodoCard.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TodoCard.tsx tests/components/TodoCard.test.tsx
git commit -m "feat: add TodoCard component with dashed border and checkmark icon"
```

---

## Task 4: Implement TodoDetailModal (TDD)

**Files:**
- Create: `tests/components/TodoDetailModal.test.tsx`
- Create: `src/components/TodoDetailModal.tsx`

- [ ] **Step 1: Write the failing tests**

Create `tests/components/TodoDetailModal.test.tsx`:

```tsx
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
    render(<TodoDetailForm todo={todo} todoList={todoList} />);
    expect(screen.getByText('Work Tasks')).toBeInTheDocument();
  });

  it('renders a Due: label', () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} />);
    expect(screen.getByText('Due:')).toBeInTheDocument();
  });

  it('renders the body notes', () => {
    render(<TodoDetailForm todo={todo} todoList={todoList} />);
    expect(screen.getByText('Include Q1 metrics')).toBeInTheDocument();
  });

  it('does not render priority row for normal importance', () => {
    render(<TodoDetailForm todo={{ ...todo, importance: 'normal' }} todoList={todoList} />);
    expect(screen.queryByText('Priority:')).not.toBeInTheDocument();
  });

  it('renders High priority badge for high importance', () => {
    render(<TodoDetailForm todo={{ ...todo, importance: 'high' }} todoList={todoList} />);
    expect(screen.getByText('Priority:')).toBeInTheDocument();
    expect(screen.getByText('High')).toBeInTheDocument();
  });

  it('renders Low priority badge for low importance', () => {
    render(<TodoDetailForm todo={{ ...todo, importance: 'low' }} todoList={todoList} />);
    expect(screen.getByText('Low')).toBeInTheDocument();
  });

  it('does not render Notes section when body is absent', () => {
    render(<TodoDetailForm todo={{ ...todo, body: undefined }} todoList={todoList} />);
    expect(screen.queryByText('Notes:')).not.toBeInTheDocument();
  });

  it('applies the list color to the dot indicator', () => {
    const { container } = render(<TodoDetailForm todo={todo} todoList={todoList} />);
    const dot = container.querySelector('.m365-todo-detail-dot') as HTMLElement;
    expect(dot.style.backgroundColor).toBe('rgb(59, 130, 246)');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/TodoDetailModal.test.tsx
```

Expected: FAIL — `Cannot find module '../../src/components/TodoDetailModal'`

- [ ] **Step 3: Implement `src/components/TodoDetailModal.tsx`**

```tsx
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/TodoDetailModal.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/TodoDetailModal.tsx tests/components/TodoDetailModal.test.tsx
git commit -m "feat: add TodoDetailForm and TodoDetailModal for read-only task details"
```

---

## Task 5: Update CalendarSelector with Tasks Section (TDD)

**Files:**
- Modify: `tests/components/CalendarSelector.test.tsx`
- Modify: `src/components/CalendarSelector.tsx`

- [ ] **Step 1: Add failing tests to `tests/components/CalendarSelector.test.tsx`**

First, update the `renderSelector` helper and all existing call sites to include the new required props. The new props `todoLists`, `enabledTodoListIds`, and `onToggleTodoList` must be added everywhere `CalendarSelector` is rendered.

Replace the existing `renderSelector` function with:

```tsx
function renderSelector(collapsed = false, onToggleCollapse = vi.fn()) {
  return render(
    <CalendarSelector
      calendars={calendars}
      enabledCalendarIds={[]}
      onToggle={vi.fn()}
      todoLists={[]}
      enabledTodoListIds={[]}
      onToggleTodoList={vi.fn()}
      collapsed={collapsed}
      onToggleCollapse={onToggleCollapse}
    />,
  );
}
```

Update the two `render(...)` calls in the existing "shows enabled calendars as checked" and "calls onToggle" tests to also pass `todoLists={[]}`, `enabledTodoListIds={[]}`, and `onToggleTodoList={vi.fn()}`.

Then add these new tests at the end of the file:

```tsx
import { M365TodoList } from '../../src/types';

const todoLists: M365TodoList[] = [
  { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' },
  { id: 'list2', displayName: 'Personal', color: '#22c55e' },
];

describe('CalendarSelector — Tasks section', () => {
  it('renders a Tasks heading', () => {
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByText('Tasks')).toBeInTheDocument();
  });

  it('renders todo list display names', () => {
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByText('Work Tasks')).toBeInTheDocument();
    expect(screen.getByText('Personal')).toBeInTheDocument();
  });

  it('shows enabled todo lists as checked', () => {
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={['list1']}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.getByRole('checkbox', { name: 'Work Tasks' })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: 'Personal' })).not.toBeChecked();
  });

  it('calls onToggleTodoList with the list id when a checkbox is clicked', async () => {
    const onToggleTodoList = vi.fn();
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={onToggleTodoList}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Work Tasks' }));
    expect(onToggleTodoList).toHaveBeenCalledWith('list1');
  });

  it('does not render the Tasks section when collapsed', () => {
    render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={true}
        onToggleCollapse={vi.fn()}
      />,
    );
    expect(screen.queryByText('Tasks')).not.toBeInTheDocument();
  });

  it('renders color swatches for todo lists', () => {
    const { container } = render(
      <CalendarSelector
        calendars={[]}
        enabledCalendarIds={[]}
        onToggle={vi.fn()}
        todoLists={todoLists}
        enabledTodoListIds={[]}
        onToggleTodoList={vi.fn()}
        collapsed={false}
        onToggleCollapse={vi.fn()}
      />,
    );
    // todoLists has 2 lists, each gets a swatch
    const swatches = container.querySelectorAll('.m365-calendar-color-swatch');
    expect(swatches.length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/CalendarSelector.test.tsx
```

Expected: existing tests fail (TypeScript error — missing props); new tests fail similarly.

- [ ] **Step 3: Update `src/components/CalendarSelector.tsx`**

Replace the entire file:

```tsx
import React from 'react';
import { M365Calendar, M365TodoList } from '../types';

interface CalendarSelectorProps {
  calendars: M365Calendar[];
  enabledCalendarIds: string[];
  onToggle: (calendarId: string) => void;
  todoLists: M365TodoList[];
  enabledTodoListIds: string[];
  onToggleTodoList: (listId: string) => void;
  collapsed: boolean;
  onToggleCollapse: () => void;
}

export const CalendarSelector: React.FC<CalendarSelectorProps> = ({
  calendars,
  enabledCalendarIds,
  onToggle,
  todoLists,
  enabledTodoListIds,
  onToggleTodoList,
  collapsed,
  onToggleCollapse,
}) => {
  if (collapsed) {
    return (
      <div className="m365-calendar-selector m365-calendar-selector--collapsed">
        <button
          className="m365-calendar-selector-toggle"
          onClick={onToggleCollapse}
          aria-label="Expand calendar list"
        >
          &#x25B6;
        </button>
      </div>
    );
  }

  return (
    <div className="m365-calendar-selector">
      <div className="m365-calendar-selector-header">
        <span className="m365-calendar-selector-label">Calendars</span>
        <button
          className="m365-calendar-selector-toggle"
          onClick={onToggleCollapse}
          aria-label="Collapse calendar list"
        >
          &#x25C0;
        </button>
      </div>
      {calendars.map((calendar) => (
        <div key={calendar.id} className="m365-calendar-selector-item">
          <input
            type="checkbox"
            id={`cal-${calendar.id}`}
            checked={enabledCalendarIds.includes(calendar.id)}
            onChange={() => onToggle(calendar.id)}
          />
          <span
            className="m365-calendar-color-swatch"
            style={{ backgroundColor: calendar.color }}
          />
          <label htmlFor={`cal-${calendar.id}`}>{calendar.name}</label>
        </div>
      ))}
      {todoLists.length > 0 && (
        <>
          <div className="m365-calendar-selector-header m365-calendar-selector-header--tasks">
            <span className="m365-calendar-selector-label">Tasks</span>
          </div>
          {todoLists.map((list) => (
            <div key={list.id} className="m365-calendar-selector-item">
              <input
                type="checkbox"
                id={`todo-${list.id}`}
                checked={enabledTodoListIds.includes(list.id)}
                onChange={() => onToggleTodoList(list.id)}
              />
              <span
                className="m365-calendar-color-swatch"
                style={{ backgroundColor: list.color }}
              />
              <label htmlFor={`todo-${list.id}`}>{list.displayName}</label>
            </div>
          ))}
        </>
      )}
    </div>
  );
};
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/CalendarSelector.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/CalendarSelector.tsx tests/components/CalendarSelector.test.tsx
git commit -m "feat: add Tasks section to CalendarSelector sidebar"
```

---

## Task 6: Wire TodoService into Context and main.ts

**Files:**
- Modify: `src/context.ts`
- Modify: `src/main.ts`
- Modify: `tests/components/CalendarApp.test.tsx`

No new tests needed — this is wiring. The compile check and the `CalendarApp` test update ensure correctness.

- [ ] **Step 1: Add `todoService` to `AppContextValue` in `src/context.ts`**

Add the import at the top:

```ts
import { TodoService } from './services/TodoService';
```

Add to the `AppContextValue` interface:

```ts
todoService: TodoService;
```

- [ ] **Step 2: Construct `TodoService` in `src/main.ts`**

Add the import:

```ts
import { TodoService } from './services/TodoService';
```

Add the private field alongside `calendarService`:

```ts
private todoService!: TodoService;
```

Add construction in `onload()` after `this.calendarService = ...`:

```ts
this.todoService = new TodoService(this.authService);
```

In `registerView(...)`, add `todoService` to the context value passed to the view:

```ts
todoService: this.todoService,
```

- [ ] **Step 3: Update `makeContext` helper in `tests/components/CalendarApp.test.tsx`**

Add `todoService` to the `makeContext` return object:

```ts
todoService: {
  getLists: vi.fn().mockResolvedValue([]),
  getTasks: vi.fn().mockResolvedValue([]),
} as unknown as AppContextValue['todoService'],
```

- [ ] **Step 4: Verify everything compiles and existing tests still pass**

```bash
npm run typecheck && npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: no type errors, all CalendarApp tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/context.ts src/main.ts tests/components/CalendarApp.test.tsx
git commit -m "feat: wire TodoService into AppContext and plugin main"
```

---

## Task 7: Add Todo State and Fetching to CalendarApp (TDD)

**Files:**
- Modify: `tests/components/CalendarApp.test.tsx`
- Modify: `src/components/CalendarApp.tsx`

- [ ] **Step 1: Add failing tests to `tests/components/CalendarApp.test.tsx`**

First add this import at the top of the file:

```ts
import { M365TodoList, M365TodoItem } from '../../src/types';
```

Add a mock for `TodoDetailModal` alongside the existing `EventDetailModal` mock:

```ts
vi.mock('../../src/components/TodoDetailModal', () => ({
  TodoDetailModal: class {
    constructor() {}
    open() {}
  },
}));
```

Add these new tests in a new `describe` block:

```ts
const mockTodoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };
const mockTodo: M365TodoItem = {
  id: 'task1',
  title: 'Buy milk',
  listId: 'list1',
  dueDate: '2026-04-04',
  importance: 'normal',
};

describe('CalendarApp — todo integration', () => {
  it('calls todoService.getLists and getTasks on mount', async () => {
    const ctx = makeContext({
      settings: { ...DEFAULT_SETTINGS, enabledTodoListIds: ['list1'] },
      todoService: {
        getLists: vi.fn().mockResolvedValue([mockTodoList]),
        getTasks: vi.fn().mockResolvedValue([mockTodo]),
      } as unknown as AppContextValue['todoService'],
    });
    render(
      <AppContext.Provider value={ctx}>
        <CalendarApp />
      </AppContext.Provider>,
    );
    await waitFor(() => {
      expect(ctx.todoService.getLists).toHaveBeenCalledTimes(1);
      expect(ctx.todoService.getTasks).toHaveBeenCalledTimes(1);
    });
  });

  it('does not call getTasks when no todo lists are enabled', async () => {
    const getTasks = vi.fn().mockResolvedValue([]);
    const ctx = makeContext({
      settings: { ...DEFAULT_SETTINGS, enabledTodoListIds: [] },
      todoService: {
        getLists: vi.fn().mockResolvedValue([mockTodoList]),
        getTasks,
      } as unknown as AppContextValue['todoService'],
    });
    render(
      <AppContext.Provider value={ctx}>
        <CalendarApp />
      </AppContext.Provider>,
    );
    await waitFor(() => {
      expect(ctx.todoService.getLists).toHaveBeenCalled();
    });
    expect(getTasks).not.toHaveBeenCalled();
  });

  it('saves settings when a todo list is toggled', async () => {
    const ctx = makeContext({
      settings: { ...DEFAULT_SETTINGS, enabledTodoListIds: [] },
      todoService: {
        getLists: vi.fn().mockResolvedValue([mockTodoList]),
        getTasks: vi.fn().mockResolvedValue([]),
      } as unknown as AppContextValue['todoService'],
    });
    render(
      <AppContext.Provider value={ctx}>
        <CalendarApp />
      </AppContext.Provider>,
    );
    await waitFor(() => screen.getByText('Work Tasks'));
    await userEvent.click(screen.getByRole('checkbox', { name: 'Work Tasks' }));
    await waitFor(() => {
      expect(ctx.saveSettings).toHaveBeenCalledWith(
        expect.objectContaining({ enabledTodoListIds: ['list1'] }),
      );
    });
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: new tests FAIL — `CalendarApp` does not yet have todo state or `fetchTodos`.

- [ ] **Step 3: Update `src/components/CalendarApp.tsx`**

Add these imports at the top:

```ts
import { M365Calendar, M365Event, M365TodoList, M365TodoItem, DailyWeather, ViewType } from '../types';
import { TodoDetailModal } from './TodoDetailModal';
```

Add to the destructured context in `CalendarApp`:

```ts
const { app, calendarService, weatherService, todoService, settings, saveSettings, registerWeatherRefresh } = useAppContext();
```

Add todo state alongside existing state:

```ts
const [todoLists, setTodoLists] = useState<M365TodoList[]>([]);
const [todos, setTodos] = useState<M365TodoItem[]>([]);
const [enabledTodoListIds, setEnabledTodoListIds] = useState<string[]>(settings.enabledTodoListIds);
const todoListsLoadedRef = useRef(false);
```

Add `fetchTodos` callback after `fetchWeather`:

```ts
const fetchTodos = useCallback(async (options: { reloadLists?: boolean } = {}) => {
  try {
    if (!todoListsLoadedRef.current || options.reloadLists) {
      todoListsLoadedRef.current = true;
      const lists = await todoService.getLists();
      setTodoLists(lists);
    }
    if (enabledTodoListIds.length > 0) {
      const { start, end } = getDateRange(currentDate, view);
      const tasks = await todoService.getTasks(enabledTodoListIds, start, end);
      setTodos(tasks);
    } else {
      setTodos([]);
    }
  } catch (e) {
    console.error('M365 Calendar todos:', e);
  }
}, [todoService, enabledTodoListIds, currentDate, view]);
```

Add `handleToggleTodoList` after `handleToggleSidebar`:

```ts
const handleToggleTodoList = async (listId: string) => {
  const next = enabledTodoListIds.includes(listId)
    ? enabledTodoListIds.filter((id) => id !== listId)
    : [...enabledTodoListIds, listId];
  setEnabledTodoListIds(next);
  try {
    await saveSettings({ ...settings, enabledCalendarIds: enabledIds, sidebarCollapsed, enabledTodoListIds: next });
  } catch (e) {
    setError(e instanceof Error ? e.message : 'Failed to save settings');
    setEnabledTodoListIds(enabledTodoListIds);
  }
};
```

Add `handleTodoClick` after `handleEventClick`:

```ts
const handleTodoClick = (todo: M365TodoItem) => {
  const list = todoLists.find((l) => l.id === todo.listId);
  if (!list) return;
  new TodoDetailModal(app, todo, list).open();
};
```

Add a `useEffect` to call `fetchTodos` alongside `fetchAll` on mount:

```ts
useEffect(() => {
  void fetchTodos();
}, [fetchTodos]);
```

Update the background refresh interval effect to also call `fetchTodos`:

```ts
useEffect(() => {
  const ms = settings.refreshIntervalMinutes * 60 * 1000;
  const interval = setInterval(() => {
    void fetchAll({ reloadCalendars: true });
    void fetchWeather();
    void fetchTodos({ reloadLists: true });
  }, ms);
  return () => clearInterval(interval);
}, [fetchAll, fetchWeather, fetchTodos, settings.refreshIntervalMinutes]);
```

Update the `CalendarSelector` JSX to pass the new todo props:

```tsx
<CalendarSelector
  calendars={calendars}
  enabledCalendarIds={enabledIds}
  onToggle={(id) => void handleToggleCalendar(id)}
  todoLists={todoLists}
  enabledTodoListIds={enabledTodoListIds}
  onToggleTodoList={(id) => void handleToggleTodoList(id)}
  collapsed={sidebarCollapsed}
  onToggleCollapse={() => void handleToggleSidebar()}
/>
```

Update all three view JSX blocks to pass `todos`, `todoLists`, and `onTodoClick`:

For `MonthView`:
```tsx
<MonthView
  currentDate={currentDate}
  events={events}
  calendars={calendars}
  todos={todos}
  todoLists={todoLists}
  onDayClick={handleDayClick}
  onEventClick={handleEventClick}
  onTodoClick={handleTodoClick}
  weather={weather}
/>
```

For `WeekView`:
```tsx
<WeekView
  currentDate={currentDate}
  events={events}
  calendars={calendars}
  todos={todos}
  todoLists={todoLists}
  onDayClick={handleDayClick}
  onEventClick={handleEventClick}
  onTodoClick={handleTodoClick}
  weather={weather}
  weatherUnits={settings.weatherUnits}
/>
```

For `DayView`:
```tsx
<DayView
  currentDate={currentDate}
  events={events}
  calendars={calendars}
  todos={todos}
  todoLists={todoLists}
  onTimeClick={openCreateEventModal}
  onEventClick={handleEventClick}
  onTodoClick={handleTodoClick}
  weather={weather}
  weatherUnits={settings.weatherUnits}
/>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: all tests PASS (including new todo tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/CalendarApp.tsx tests/components/CalendarApp.test.tsx
git commit -m "feat: add todo state, fetchTodos, and toggle handler to CalendarApp"
```

---

## Task 8: Update MonthView to Render TodoCards (TDD)

**Files:**
- Modify: `tests/components/MonthView.test.tsx`
- Modify: `src/components/MonthView.tsx`

- [ ] **Step 1: Add failing tests to `tests/components/MonthView.test.tsx`**

Add these imports at the top:

```ts
import { M365TodoList, M365TodoItem } from '../../src/types';
```

Add fixture data:

```ts
const todoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };
const todoOnApril4: M365TodoItem = {
  id: 'task1',
  title: 'Buy milk',
  listId: 'list1',
  dueDate: '2026-04-04',
  importance: 'normal',
};
```

Add new tests:

```ts
describe('MonthView — todos', () => {
  it('renders a todo on its due date', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril4]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('does not render a todo on the wrong date', () => {
    const todoOnApril5: M365TodoItem = { ...todoOnApril4, dueDate: '2026-04-05' };
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril5]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
      />,
    );
    // April 4 cell should not show this todo
    const cells = document.querySelectorAll('.m365-calendar-day-cell');
    const april4 = Array.from(cells).find((c) => c.textContent?.includes('4') && !c.textContent?.includes('14') && !c.textContent?.includes('24'));
    expect(april4?.textContent).not.toContain('Buy milk');
  });

  it('renders both events and todos in the same day cell', () => {
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[eventOnApril4]}
        calendars={[calendar]}
        todos={[todoOnApril4]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Team Meeting')).toBeInTheDocument();
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('calls onTodoClick when a todo is clicked', async () => {
    const onTodoClick = vi.fn();
    render(
      <MonthView
        currentDate={new Date('2026-04-01')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril4]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
        onTodoClick={onTodoClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View task: Buy milk' }));
    expect(onTodoClick).toHaveBeenCalledWith(todoOnApril4);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/components/MonthView.test.tsx
```

Expected: new tests FAIL — `MonthView` does not accept `todos` prop.

- [ ] **Step 3: Update `src/components/MonthView.tsx`**

Add to imports:

```ts
import { M365Event, M365Calendar, M365TodoItem, M365TodoList, DailyWeather } from '../types';
import { TodoCard } from './TodoCard';
```

Add to `MonthViewProps`:

```ts
todos?: M365TodoItem[];
todoLists?: M365TodoList[];
onTodoClick?: (todo: M365TodoItem) => void;
```

Add to destructured props:

```ts
todos = [],
todoLists = [],
onTodoClick,
```

Add inside the component, after `calendarMap`:

```ts
const todoListMap = new Map(todoLists.map((l) => [l.id, l]));
```

Inside the `days.map(...)` loop, after `const dayEvents = ...`, add:

```ts
const dayTodos = todos.filter((t) => t.dueDate === cellDateStr);
const eventSlots = Math.min(dayEvents.length, maxEventsPerDay);
const todoSlots = Math.min(dayTodos.length, maxEventsPerDay - eventSlots);
const totalItems = dayEvents.length + dayTodos.length;
```

Replace the existing events render block (the `dayEvents.slice(...)` and overflow button) with:

```tsx
{dayEvents.slice(0, eventSlots).map((event) => {
  const cal = calendarMap.get(event.calendarId);
  if (!cal) return null;
  return (
    <button
      key={event.id}
      type="button"
      className="m365-event-click-btn"
      aria-label={`Edit event: ${event.subject}`}
      onMouseEnter={(e) => showPopover(event, cal, e.currentTarget.getBoundingClientRect())}
      onMouseLeave={() => hidePopover()}
      onClick={(e) => {
        e.stopPropagation();
        onEventClick?.(event);
      }}
    >
      <EventCard event={event} calendar={cal} />
    </button>
  );
})}
{dayTodos.slice(0, todoSlots).map((todo) => {
  const list = todoListMap.get(todo.listId);
  if (!list) return null;
  return (
    <button
      key={todo.id}
      type="button"
      className="m365-event-click-btn"
      aria-label={`View task: ${todo.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onTodoClick?.(todo);
      }}
    >
      <TodoCard todo={todo} todoList={list} />
    </button>
  );
})}
{totalItems > maxEventsPerDay && (
  <button
    type="button"
    className="m365-month-overflow-btn"
    aria-label={`Show ${totalItems - maxEventsPerDay} more events`}
    onClick={(e) => {
      e.stopPropagation();
      onDayClick(day);
    }}
  >
    + {totalItems - maxEventsPerDay} more
  </button>
)}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/MonthView.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/MonthView.tsx tests/components/MonthView.test.tsx
git commit -m "feat: render TodoCards in MonthView day cells"
```

---

## Task 9: Update WeekView to Render TodoCards (TDD)

**Files:**
- Modify: `tests/components/WeekView.test.tsx`
- Modify: `src/components/WeekView.tsx`

The week containing the mocked `useNow` date (`2026-04-14`) runs Sun Apr 12 – Sat Apr 18.

- [ ] **Step 1: Add failing tests to `tests/components/WeekView.test.tsx`**

Add these imports at the top:

```ts
import { M365TodoList, M365TodoItem } from '../../src/types';
```

Add fixture data after the existing fixtures:

```ts
const todoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };
const todoOnApril14: M365TodoItem = {
  id: 'task1',
  title: 'Buy milk',
  listId: 'list1',
  dueDate: '2026-04-14',
  importance: 'normal',
};
```

Add new tests:

```ts
describe('WeekView — todos', () => {
  it('renders a todo in the all-day row on its due date', () => {
    render(
      <WeekView
        currentDate={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril14]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('does not render a todo outside the current week', () => {
    const todoOutOfRange: M365TodoItem = { ...todoOnApril14, dueDate: '2026-04-20' };
    render(
      <WeekView
        currentDate={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        todos={[todoOutOfRange]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
      />,
    );
    expect(screen.queryByText('Buy milk')).not.toBeInTheDocument();
  });

  it('calls onTodoClick when a todo button is clicked', async () => {
    const onTodoClick = vi.fn();
    render(
      <WeekView
        currentDate={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril14]}
        todoLists={[todoList]}
        onDayClick={vi.fn()}
        onTodoClick={onTodoClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View task: Buy milk' }));
    expect(onTodoClick).toHaveBeenCalledWith(todoOnApril14);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/components/WeekView.test.tsx
```

Expected: new tests FAIL.

- [ ] **Step 3: Update `src/components/WeekView.tsx`**

Add to imports:

```ts
import { M365Event, M365Calendar, M365TodoItem, M365TodoList, DailyWeather } from '../types';
import { TodoCard } from './TodoCard';
```

Add to `WeekViewProps`:

```ts
todos?: M365TodoItem[];
todoLists?: M365TodoList[];
onTodoClick?: (todo: M365TodoItem) => void;
```

Add to destructured props:

```ts
todos = [],
todoLists = [],
onTodoClick,
```

Add inside the component, after `calendarMap`:

```ts
const todoListMap = useMemo(() => new Map(todoLists.map((l) => [l.id, l])), [todoLists]);
const todosByDate = useMemo(() => {
  const map = new Map<string, M365TodoItem[]>();
  for (const todo of todos) {
    if (!map.has(todo.dueDate)) map.set(todo.dueDate, []);
    map.get(todo.dueDate)!.push(todo);
  }
  return map;
}, [todos]);
```

Inside the all-day row `weekDays.map(...)`, after the existing `allDayEvents.map(...)` block, add:

```tsx
{(todosByDate.get(cellDateStr) ?? []).map((todo) => {
  const list = todoListMap.get(todo.listId);
  if (!list) return null;
  return (
    <button
      key={todo.id}
      type="button"
      className="m365-event-click-btn"
      aria-label={`View task: ${todo.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onTodoClick?.(todo);
      }}
    >
      <TodoCard todo={todo} todoList={list} />
    </button>
  );
})}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/WeekView.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Commit**

```bash
git add src/components/WeekView.tsx tests/components/WeekView.test.tsx
git commit -m "feat: render TodoCards in WeekView all-day row"
```

---

## Task 10: Update DayView to Render TodoCards (TDD)

**Files:**
- Modify: `tests/components/DayView.test.tsx`
- Modify: `src/components/DayView.tsx`

- [ ] **Step 1: Add failing tests to `tests/components/DayView.test.tsx`**

Add these imports at the top:

```ts
import { M365TodoList, M365TodoItem } from '../../src/types';
```

Add fixture data:

```ts
const todoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };
const todoOnApril14: M365TodoItem = {
  id: 'task1',
  title: 'Buy milk',
  listId: 'list1',
  dueDate: '2026-04-14',
  importance: 'normal',
};
```

Add new tests (the mocked `useNow` returns `2026-04-14T14:30:00`):

```ts
describe('DayView — todos', () => {
  it('renders a todo in the all-day section when dueDate matches currentDate', () => {
    render(
      <DayView
        currentDate={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril14]}
        todoLists={[todoList]}
        onTimeClick={vi.fn()}
      />,
    );
    expect(screen.getByText('Buy milk')).toBeInTheDocument();
  });

  it('does not render a todo when dueDate does not match currentDate', () => {
    render(
      <DayView
        currentDate={new Date('2026-04-15')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril14]}
        todoLists={[todoList]}
        onTimeClick={vi.fn()}
      />,
    );
    expect(screen.queryByText('Buy milk')).not.toBeInTheDocument();
  });

  it('calls onTodoClick when a todo is clicked', async () => {
    const onTodoClick = vi.fn();
    render(
      <DayView
        currentDate={new Date('2026-04-14')}
        events={[]}
        calendars={[]}
        todos={[todoOnApril14]}
        todoLists={[todoList]}
        onTimeClick={vi.fn()}
        onTodoClick={onTodoClick}
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'View task: Buy milk' }));
    expect(onTodoClick).toHaveBeenCalledWith(todoOnApril14);
  });
});
```

- [ ] **Step 2: Run failing tests**

```bash
npx vitest run tests/components/DayView.test.tsx
```

Expected: new tests FAIL.

- [ ] **Step 3: Update `src/components/DayView.tsx`**

Add to imports:

```ts
import { M365Event, M365Calendar, M365TodoItem, M365TodoList, DailyWeather } from '../types';
import { TodoCard } from './TodoCard';
```

Add to `DayViewProps`:

```ts
todos?: M365TodoItem[];
todoLists?: M365TodoList[];
onTodoClick?: (todo: M365TodoItem) => void;
```

Add to destructured props:

```ts
todos = [],
todoLists = [],
onTodoClick,
```

Add inside the component after `calendarMap`:

```ts
const todoListMap = useMemo(() => new Map(todoLists.map((l) => [l.id, l])), [todoLists]);
const todayStr = toDateOnly(currentDate);
const allDayTodos = useMemo(
  () => todos.filter((t) => t.dueDate === todayStr),
  [todos, todayStr],
);
```

In the JSX, in the all-day section (where `allDayEvents` are rendered), add after the last `allDayEvents.map(...)` closing block:

```tsx
{allDayTodos.map((todo) => {
  const list = todoListMap.get(todo.listId);
  if (!list) return null;
  return (
    <button
      key={todo.id}
      type="button"
      className="m365-event-click-btn"
      aria-label={`View task: ${todo.title}`}
      onClick={(e) => {
        e.stopPropagation();
        onTodoClick?.(todo);
      }}
    >
      <TodoCard todo={todo} todoList={list} />
    </button>
  );
})}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/DayView.test.tsx
```

Expected: all tests PASS.

- [ ] **Step 5: Run the full test suite**

```bash
npm test
```

Expected: all tests PASS.

- [ ] **Step 6: Run typecheck and lint**

```bash
npm run build
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add src/components/DayView.tsx tests/components/DayView.test.tsx
git commit -m "feat: render TodoCards in DayView all-day section"
```

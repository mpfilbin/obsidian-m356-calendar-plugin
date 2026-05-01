# Complete Task from Details Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Complete button to `TodoDetailModal` that closes the modal immediately, dims the task pill while the PATCH call is in flight, removes the task on success, and shows an error toast on failure.

**Architecture:** Service-layer method added to `TodoService` → `CalendarApp` owns `completingTodoIds` state and fires the async completion → state threads down through `MonthView`/`WeekView`/`DayView` to `TodoCard` for the visual pending state.

**Tech Stack:** TypeScript, React, Microsoft Graph API (`PATCH /me/todo/lists/{id}/tasks/{id}`), Vitest + Testing Library.

---

## File Map

| File | Change |
|------|--------|
| `src/services/TodoService.ts` | Add `completeTask(listId, taskId): Promise<void>` |
| `src/components/TodoCard.tsx` | Add `isCompleting?: boolean` prop → opacity/pointer-events |
| `src/components/TodoDetailModal.tsx` | Add `onComplete: () => void` constructor param; render Complete button |
| `src/components/MonthView.tsx` | Add `completingTodoIds?: Set<string>` prop; pass to `TodoCard` |
| `src/components/WeekView.tsx` | Same as MonthView |
| `src/components/DayView.tsx` | Same as MonthView |
| `src/components/CalendarApp.tsx` | Add `completingTodoIds` state; update `handleTodoClick`; pass prop to views |
| `tests/services/TodoService.test.ts` | Add `completeTask` describe block |
| `tests/components/TodoCard.test.tsx` | Add `isCompleting` tests |
| `tests/components/TodoDetailModal.test.tsx` | Add Complete button tests; add `onComplete` to existing renders |
| `tests/components/CalendarApp.test.tsx` | Update `TodoDetailModal` mock; add `completeTask` to service mock; add completion flow tests |

---

### Task 1: `TodoService.completeTask`

**Files:**
- Modify: `src/services/TodoService.ts`
- Test: `tests/services/TodoService.test.ts`

- [ ] **Step 1: Write the failing tests**

Add a new `describe('completeTask')` block at the end of `tests/services/TodoService.test.ts`, before the final closing `});`:

```ts
describe('completeTask', () => {
  it('issues PATCH with status completed using the correct URL and auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.completeTask('list1', 'task1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1',
      expect.objectContaining({
        method: 'PATCH',
        headers: expect.objectContaining({
          Authorization: 'Bearer token',
          'Content-Type': 'application/json',
        }),
        body: JSON.stringify({ status: 'completed' }),
      }),
    );
  });

  it('encodes special characters in list and task IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.completeTask('list/id+1=', 'task/id+2=');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('%2F');
    expect(url).toContain('%2B');
    expect(url).toContain('%3D');
  });

  it('throws when Graph returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
    await expect(service.completeTask('list1', 'task1')).rejects.toThrow('Failed to complete task: Not Found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/TodoService.test.ts
```

Expected: 3 new failures — `completeTask is not a function`.

- [ ] **Step 3: Implement `completeTask` in `TodoService`**

Add this method to `src/services/TodoService.ts` immediately after `getTasks`:

```ts
async completeTask(listId: string, taskId: string): Promise<void> {
  const token = await this.auth.getValidToken();
  const encodedListId = encodeURIComponent(listId);
  const encodedTaskId = encodeURIComponent(taskId);
  const response = await fetchWithRetry(
    `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ status: 'completed' }),
    },
  );
  if (!response.ok) throw new Error(`Failed to complete task: ${response.statusText}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/TodoService.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/TodoService.ts tests/services/TodoService.test.ts
git commit -m "feat: add TodoService.completeTask"
```

---

### Task 2: `TodoCard` pending visual state

**Files:**
- Modify: `src/components/TodoCard.tsx`
- Test: `tests/components/TodoCard.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add to `tests/components/TodoCard.test.tsx` inside the existing `describe('TodoCard')` block:

```ts
it('applies opacity 0.4 and disables pointer events when isCompleting is true', () => {
  const { container } = render(<TodoCard todo={todo} todoList={todoList} isCompleting={true} />);
  const card = container.querySelector('.m365-todo-card') as HTMLElement;
  expect(card.style.opacity).toBe('0.4');
  expect(card.style.pointerEvents).toBe('none');
});

it('does not apply completing styles when isCompleting is false', () => {
  const { container } = render(<TodoCard todo={todo} todoList={todoList} isCompleting={false} />);
  const card = container.querySelector('.m365-todo-card') as HTMLElement;
  expect(card.style.opacity).toBe('');
  expect(card.style.pointerEvents).toBe('');
});

it('does not apply completing styles when isCompleting is omitted', () => {
  const { container } = render(<TodoCard todo={todo} todoList={todoList} />);
  const card = container.querySelector('.m365-todo-card') as HTMLElement;
  expect(card.style.opacity).toBe('');
  expect(card.style.pointerEvents).toBe('');
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/TodoCard.test.tsx
```

Expected: 2 failures — `isCompleting` prop not recognized, no opacity/pointer-events applied.

- [ ] **Step 3: Update `TodoCard` to accept and apply the prop**

Replace the entire content of `src/components/TodoCard.tsx`:

```tsx
import React from 'react';
import { M365TodoItem, M365TodoList } from '../types';

interface TodoCardProps {
  todo: M365TodoItem;
  todoList: M365TodoList;
  isCompleting?: boolean;
}

export const TodoCard: React.FC<TodoCardProps> = ({ todo, todoList, isCompleting }) => {
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
        padding: '2px var(--size-4-1)',
        ...(isCompleting ? { opacity: 0.4, pointerEvents: 'none' as const } : {}),
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
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/TodoCard.test.tsx
```

Expected: All 8 tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/TodoCard.tsx tests/components/TodoCard.test.tsx
git commit -m "feat: add isCompleting pending state to TodoCard"
```

---

### Task 3: `TodoDetailModal` Complete button

**Files:**
- Modify: `src/components/TodoDetailModal.tsx`
- Test: `tests/components/TodoDetailModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Add `import userEvent from '@testing-library/user-event';` to the import block at the top of `tests/components/TodoDetailModal.test.tsx`.

Add these two tests inside `describe('TodoDetailForm')`:

```ts
it('renders a Complete button', () => {
  render(<TodoDetailForm todo={todo} todoList={todoList} onComplete={vi.fn()} />);
  expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument();
});

it('calls onComplete when the Complete button is clicked', async () => {
  const onComplete = vi.fn();
  render(<TodoDetailForm todo={todo} todoList={todoList} onComplete={onComplete} />);
  await userEvent.click(screen.getByRole('button', { name: /complete/i }));
  expect(onComplete).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/TodoDetailModal.test.tsx
```

Expected: 2 failures — no button found. (Existing tests may also fail due to missing required `onComplete` prop; that will be fixed in Step 3.)

- [ ] **Step 3: Update `TodoDetailModal` with the `onComplete` prop and Complete button**

Replace the entire content of `src/components/TodoDetailModal.tsx`:

```tsx
import { App, Modal } from 'obsidian';
import React, { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { M365TodoItem, M365TodoList } from '../types';

// ── Form ─────────────────────────────────────────────────────────────────────

interface TodoDetailFormProps {
  todo: M365TodoItem;
  todoList: M365TodoList;
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
        <TodoDetailForm todo={this.todo} todoList={this.todoList} onComplete={handleComplete} />
      </StrictMode>,
    );
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
  }
}
```

- [ ] **Step 4: Update existing `TodoDetailForm` test renders to pass `onComplete`**

In `tests/components/TodoDetailModal.test.tsx`, replace every occurrence of:
```tsx
render(<TodoDetailForm todo={todo} todoList={todoList} />);
```
with:
```tsx
render(<TodoDetailForm todo={todo} todoList={todoList} onComplete={vi.fn()} />);
```

There are 8 existing `render` calls — update all of them. Also update the `container` destructuring renders with the same pattern.

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/components/TodoDetailModal.test.tsx
```

Expected: All 10 tests pass.

- [ ] **Step 6: Commit**

```bash
git add src/components/TodoDetailModal.tsx tests/components/TodoDetailModal.test.tsx
git commit -m "feat: add Complete button to TodoDetailModal"
```

---

### Task 4: Thread `completingTodoIds` through views

**Files:**
- Modify: `src/components/MonthView.tsx`
- Modify: `src/components/WeekView.tsx`
- Modify: `src/components/DayView.tsx`

No new behavioral tests for this task — prop threading is verified by TypeScript and covered end-to-end in Task 5.

- [ ] **Step 1: Update `MonthView`**

In `src/components/MonthView.tsx`, add `completingTodoIds?: Set<string>` to `MonthViewProps`:

```ts
interface MonthViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  maxEventsPerDay?: number;
  weather?: Map<string, DailyWeather | null>;
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}
```

Destructure it in the component signature (add after `onTodoClick`):
```ts
export const MonthView: React.FC<MonthViewProps> = ({
  ...
  onTodoClick,
  completingTodoIds,
}) => {
```

At the `<TodoCard>` render site (around line 121), add the `isCompleting` prop:
```tsx
<TodoCard todo={todo} todoList={list} isCompleting={completingTodoIds?.has(todo.id) ?? false} />
```

- [ ] **Step 2: Update `WeekView`**

In `src/components/WeekView.tsx`, add `completingTodoIds?: Set<string>` to `WeekViewProps`:

```ts
interface WeekViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onDayClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  weather?: Map<string, DailyWeather | null>;
  weatherUnits?: 'imperial' | 'metric';
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}
```

Destructure it in the component signature (add after `onTodoClick`):
```ts
export const WeekView: React.FC<WeekViewProps> = ({
  ...
  onTodoClick,
  completingTodoIds,
}) => {
```

At the `<TodoCard>` render site (around line 179), add the `isCompleting` prop:
```tsx
<TodoCard todo={todo} todoList={list} isCompleting={completingTodoIds?.has(todo.id) ?? false} />
```

- [ ] **Step 3: Update `DayView`**

In `src/components/DayView.tsx`, add `completingTodoIds?: Set<string>` to `DayViewProps`:

```ts
interface DayViewProps {
  currentDate: Date;
  events: M365Event[];
  calendars: M365Calendar[];
  onTimeClick: (date: Date) => void;
  onEventClick?: (event: M365Event) => void;
  weather?: Map<string, DailyWeather | null>;
  weatherUnits?: 'imperial' | 'metric';
  todos?: M365TodoItem[];
  todoLists?: M365TodoList[];
  onTodoClick?: (todo: M365TodoItem) => void;
  completingTodoIds?: Set<string>;
}
```

Destructure it in the component signature (add after `onTodoClick`):
```ts
export const DayView: React.FC<DayViewProps> = ({
  ...
  onTodoClick,
  completingTodoIds,
}) => {
```

At the `<TodoCard>` render site (around line 122), add the `isCompleting` prop:
```tsx
<TodoCard todo={todo} todoList={list} isCompleting={completingTodoIds?.has(todo.id) ?? false} />
```

- [ ] **Step 4: Run typecheck to verify**

```bash
npm run typecheck
```

Expected: No errors.

- [ ] **Step 5: Commit**

```bash
git add src/components/MonthView.tsx src/components/WeekView.tsx src/components/DayView.tsx
git commit -m "feat: thread completingTodoIds through MonthView, WeekView, DayView"
```

---

### Task 5: `CalendarApp` integration

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Test: `tests/components/CalendarApp.test.tsx`

- [ ] **Step 1: Update the `TodoDetailModal` mock and `makeContext` in the test file**

In `tests/components/CalendarApp.test.tsx`, add the callback capture object alongside the existing `modalCallbacks` and `eventDetailModalCallbacks` declarations (use `vi.hoisted`):

```ts
const todoDetailModalCallbacks = vi.hoisted(() => ({
  onComplete: null as (() => void) | null,
}));
```

Replace the existing `TodoDetailModal` mock:

```ts
vi.mock('../../src/components/TodoDetailModal', () => ({
  TodoDetailModal: class {
    constructor(
      _app: unknown,
      _todo: unknown,
      _list: unknown,
      onComplete: () => void,
    ) {
      todoDetailModalCallbacks.onComplete = onComplete;
    }
    open() {}
  },
}));
```

In `makeContext`, add `completeTask` to the `todoService` mock:

```ts
todoService: {
  getLists: vi.fn().mockResolvedValue([]),
  getTasks: vi.fn().mockResolvedValue([]),
  completeTask: vi.fn().mockResolvedValue(undefined),
} as unknown as AppContextValue['todoService'],
```

- [ ] **Step 2: Write the failing integration tests**

Add the following `describe` block inside `describe('CalendarApp')` in `tests/components/CalendarApp.test.tsx`:

```ts
describe('todo completion', () => {
  beforeEach(() => {
    // Notice is a persistent vi.fn() — clear call history so assertions don't see
    // calls from other tests in the suite.
    (obsidianMock.Notice as unknown as ReturnType<typeof vi.fn>).mockClear();
  });

  const mockTodoList: M365TodoList = { id: 'list1', displayName: 'Work Tasks', color: '#3b82f6' };
  const mockTodo: M365TodoItem = {
    id: 'task1',
    title: 'Write quarterly report',
    listId: 'list1',
    dueDate: '2026-04-15',
    importance: 'normal',
  };

  function makeTodoContext(completeTask = vi.fn().mockResolvedValue(undefined)) {
    return makeContext({
      todoService: {
        getLists: vi.fn().mockResolvedValue([mockTodoList]),
        getTasks: vi.fn().mockResolvedValue([mockTodo]),
        completeTask,
      } as unknown as AppContextValue['todoService'],
      settings: {
        ...DEFAULT_SETTINGS,
        enabledCalendarIds: ['cal-1'],
        enabledTodoListIds: ['list1'],
      },
    });
  }

  it('removes the task from the calendar on successful completion', async () => {
    const ctx = makeTodoContext();
    renderCalendarApp(ctx);
    await screen.findByText('Write quarterly report');

    await userEvent.click(screen.getByLabelText('View task: Write quarterly report'));
    todoDetailModalCallbacks.onComplete!();

    await waitFor(() => {
      expect(ctx.todoService.completeTask).toHaveBeenCalledWith('list1', 'task1');
    });
    await waitFor(() => {
      expect(screen.queryByText('Write quarterly report')).not.toBeInTheDocument();
    });
  });

  it('shows an error toast and keeps the task visible when completion fails', async () => {
    const completeTask = vi.fn().mockRejectedValue(new Error('Network error'));
    const ctx = makeTodoContext(completeTask);
    renderCalendarApp(ctx);
    await screen.findByText('Write quarterly report');

    await userEvent.click(screen.getByLabelText('View task: Write quarterly report'));
    todoDetailModalCallbacks.onComplete!();

    await waitFor(() => {
      expect(obsidianMock.Notice).toHaveBeenCalledWith(
        expect.stringContaining('Network error'),
      );
    });
    expect(screen.getByText('Write quarterly report')).toBeInTheDocument();
  });

  it('dims the task pill while completion is in flight', async () => {
    let resolveComplete!: () => void;
    const completeTask = vi.fn().mockReturnValue(
      new Promise<void>((resolve) => { resolveComplete = resolve; }),
    );
    const ctx = makeTodoContext(completeTask);
    renderCalendarApp(ctx);
    await screen.findByText('Write quarterly report');

    await userEvent.click(screen.getByLabelText('View task: Write quarterly report'));
    todoDetailModalCallbacks.onComplete!();

    await waitFor(() => {
      const card = document.querySelector('.m365-todo-card') as HTMLElement;
      expect(card.style.opacity).toBe('0.4');
    });

    resolveComplete();
    await waitFor(() => {
      expect(screen.queryByText('Write quarterly report')).not.toBeInTheDocument();
    });
  });
});
```

- [ ] **Step 3: Run tests to verify they fail**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: 3 new failures — `completeTask is not a function` and task not removed.

- [ ] **Step 4: Add `completingTodoIds` state to `CalendarApp`**

In `src/components/CalendarApp.tsx`, add the new state declaration immediately after the `todos` state line:

```ts
const [completingTodoIds, setCompletingTodoIds] = useState<Set<string>>(new Set());
```

- [ ] **Step 5: Update `handleTodoClick` in `CalendarApp`**

Replace the existing `handleTodoClick` function:

```ts
const handleTodoClick = (todo: M365TodoItem) => {
  const list = todoLists.find((l) => l.id === todo.listId);
  if (!list) {
    console.warn('M365 Calendar: todo list not found for task', todo.id);
    return;
  }
  const onComplete = () => {
    setCompletingTodoIds((prev) => new Set([...prev, todo.id]));
    void todoService.completeTask(todo.listId, todo.id)
      .then(() => {
        setTodos((prev) => prev.filter((t) => t.id !== todo.id));
        setCompletingTodoIds((prev) => { const s = new Set(prev); s.delete(todo.id); return s; });
      })
      .catch((e: unknown) => {
        setCompletingTodoIds((prev) => { const s = new Set(prev); s.delete(todo.id); return s; });
        notifyError(e);
      });
  };
  new TodoDetailModal(app, todo, list, onComplete).open();
};
```

- [ ] **Step 6: Pass `completingTodoIds` to all three view components**

In `src/components/CalendarApp.tsx`, update each view in the JSX:

For `MonthView` (add after `onTodoClick`):
```tsx
completingTodoIds={completingTodoIds}
```

For `WeekView` (add after `onTodoClick`):
```tsx
completingTodoIds={completingTodoIds}
```

For `DayView` (add after `onTodoClick`):
```tsx
completingTodoIds={completingTodoIds}
```

- [ ] **Step 7: Run all tests**

```bash
npm test
```

Expected: All tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/CalendarApp.tsx tests/components/CalendarApp.test.tsx
git commit -m "feat: complete task from details modal with optimistic dimming"
```

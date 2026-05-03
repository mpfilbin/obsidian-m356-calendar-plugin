# Task Delete Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a red Delete button to the task detail modal that prompts for inline confirmation, immediately dismisses the modal on confirm, and removes the task from the calendar view — restoring it on API failure.

**Architecture:** Follow the existing `completeTask` optimistic-update pattern: `CalendarApp` owns the state mutation, the modal just fires a synchronous callback on confirm. `TodoDetailForm` holds `confirmingDelete` state for the inline confirmation UI (same pattern as `EventDetailModal`). `TodoService.deleteTask` wraps the Graph DELETE endpoint.

**Tech Stack:** TypeScript, React, Obsidian Modal API, Microsoft Graph REST API, Vitest, React Testing Library

---

## File Map

| File | Change |
|------|--------|
| `src/services/TodoService.ts` | Add `deleteTask(listId, taskId)` method |
| `src/components/TodoDetailModal.tsx` | Add `onDelete` prop to `TodoDetailForm`; add `onDelete` constructor param to `TodoDetailModal`; wire `handleDelete` |
| `src/components/CalendarApp.tsx` | Add `onDelete` callback in `handleTodoClick`; pass to `TodoDetailModal` |
| `tests/services/TodoService.test.ts` | Add `deleteTask` describe block |
| `tests/components/TodoDetailModal.test.tsx` | Add delete-button and confirmation tests |
| `tests/components/CalendarApp.test.tsx` | Extend mock and add `onDelete` tests |

---

## Task 1: `TodoService.deleteTask`

**Files:**
- Modify: `src/services/TodoService.ts`
- Test: `tests/services/TodoService.test.ts`

- [ ] **Step 1: Write the failing tests**

Append a new `describe('deleteTask', ...)` block at the end of `tests/services/TodoService.test.ts`, just before the final closing `});`:

```ts
describe('deleteTask', () => {
  it('sends DELETE to the correct URL with auth header', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.deleteTask('list1', 'task1');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1',
      expect.objectContaining({
        method: 'DELETE',
        headers: expect.objectContaining({ Authorization: 'Bearer token' }),
      }),
    );
  });

  it('encodes special characters in list and task IDs', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await service.deleteTask('list/id+1=', 'task/id+2=');
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain('%2F');
    expect(url).toContain('%2B');
    expect(url).toContain('%3D');
  });

  it('throws when Graph returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
    await expect(service.deleteTask('list1', 'task1')).rejects.toThrow('Failed to delete task: Not Found');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/services/TodoService.test.ts
```

Expected: 3 new failures with "service.deleteTask is not a function" (or similar).

- [ ] **Step 3: Implement `deleteTask`**

In `src/services/TodoService.ts`, add this method after `completeTask` (after line 105):

```ts
async deleteTask(listId: string, taskId: string): Promise<void> {
  const token = await this.auth.getValidToken();
  const encodedListId = encodeURIComponent(listId);
  const encodedTaskId = encodeURIComponent(taskId);
  const response = await fetchWithRetry(
    `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}`,
    {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (!response.ok) throw new Error(`Failed to delete task: ${response.statusText}`);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/services/TodoService.test.ts
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/services/TodoService.ts tests/services/TodoService.test.ts
git commit -m "feat: add TodoService.deleteTask"
```

---

## Task 2: `TodoDetailForm` — Delete button with inline confirmation

**Files:**
- Modify: `src/components/TodoDetailModal.tsx`
- Test: `tests/components/TodoDetailModal.test.tsx`

- [ ] **Step 1: Write the failing tests**

Append these tests inside the `describe('TodoDetailForm', ...)` block in `tests/components/TodoDetailModal.test.tsx`, after the existing `it('calls onComplete...')` test (after line 89):

```ts
it('renders a Delete button when onDelete is provided', async () => {
  render(
    <TodoDetailForm
      todo={todo}
      todoList={todoList}
      todoService={makeMockTodoService()}
      onComplete={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  expect(await screen.findByRole('button', { name: /^delete$/i })).toBeInTheDocument();
});

it('does not render a Delete button when onDelete is not provided', async () => {
  render(
    <TodoDetailForm
      todo={todo}
      todoList={todoList}
      todoService={makeMockTodoService()}
      onComplete={vi.fn()}
    />,
  );
  await screen.findByRole('button', { name: /complete/i });
  expect(screen.queryByRole('button', { name: /^delete$/i })).not.toBeInTheDocument();
});

it('clicking Delete shows the confirmation footer', async () => {
  render(
    <TodoDetailForm
      todo={todo}
      todoList={todoList}
      todoService={makeMockTodoService()}
      onComplete={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
  expect(screen.getByText('This will permanently delete the task.')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^cancel$/i })).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^delete task$/i })).toBeInTheDocument();
});

it('Cancel in confirmation footer restores the normal footer', async () => {
  render(
    <TodoDetailForm
      todo={todo}
      todoList={todoList}
      todoService={makeMockTodoService()}
      onComplete={vi.fn()}
      onDelete={vi.fn()}
    />,
  );
  await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
  await userEvent.click(screen.getByRole('button', { name: /^cancel$/i }));
  expect(screen.queryByText('This will permanently delete the task.')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: /complete/i })).toBeInTheDocument();
});

it('confirming Delete calls onDelete', async () => {
  const onDelete = vi.fn();
  render(
    <TodoDetailForm
      todo={todo}
      todoList={todoList}
      todoService={makeMockTodoService()}
      onComplete={vi.fn()}
      onDelete={onDelete}
    />,
  );
  await userEvent.click(await screen.findByRole('button', { name: /^delete$/i }));
  await userEvent.click(screen.getByRole('button', { name: /^delete task$/i }));
  expect(onDelete).toHaveBeenCalledTimes(1);
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/components/TodoDetailModal.test.tsx
```

Expected: 5 new failures.

- [ ] **Step 3: Implement the changes in `TodoDetailForm`**

In `src/components/TodoDetailModal.tsx`:

**a)** Add `onDelete` to the props interface (after `onComplete`):

```ts
interface TodoDetailFormProps {
  todo: M365TodoItem;
  todoList: M365TodoList;
  todoService: TodoService;
  onComplete: () => void;
  onDelete?: () => void;
}
```

**b)** Destructure `onDelete` in the component signature:

```ts
export const TodoDetailForm: React.FC<TodoDetailFormProps> = ({ todo, todoList, todoService, onComplete, onDelete }) => {
```

**c)** Add `confirmingDelete` state alongside the existing state declarations (after `newItemText`):

```ts
const [confirmingDelete, setConfirmingDelete] = useState(false);
```

**d)** Replace the entire footer `<div className="m365-todo-detail-footer">...</div>` with:

```tsx
<div className="m365-todo-detail-footer">
  {confirmingDelete ? (
    <>
      <span>This will permanently delete the task.</span>
      <button type="button" onClick={() => setConfirmingDelete(false)}>Cancel</button>
      <button className="mod-warning" type="button" onClick={onDelete}>Delete task</button>
    </>
  ) : (
    <>
      <button className="m365-todo-complete-btn" type="button" onClick={onComplete}>Mark complete</button>
      {onDelete && (
        <button className="mod-warning" type="button" onClick={() => setConfirmingDelete(true)}>Delete</button>
      )}
    </>
  )}
</div>
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
npx vitest run tests/components/TodoDetailModal.test.tsx
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/components/TodoDetailModal.tsx tests/components/TodoDetailModal.test.tsx
git commit -m "feat: add inline delete confirmation to TodoDetailForm"
```

---

## Task 3: `TodoDetailModal` — Wire `onDelete` constructor param

**Files:**
- Modify: `src/components/TodoDetailModal.tsx`

No new test file — this is covered by the CalendarApp integration test in Task 4. The modal class is thin wiring; the interesting behavior lives in `CalendarApp` (where `onDelete` does real work) and `TodoDetailForm` (already tested above).

- [ ] **Step 1: Add `onDelete` constructor parameter**

In `src/components/TodoDetailModal.tsx`, update the `TodoDetailModal` class constructor from:

```ts
constructor(
  app: App,
  private readonly todo: M365TodoItem,
  private readonly todoList: M365TodoList,
  private readonly todoService: TodoService,
  private readonly onComplete: () => void,
) {
  super(app);
}
```

to:

```ts
constructor(
  app: App,
  private readonly todo: M365TodoItem,
  private readonly todoList: M365TodoList,
  private readonly todoService: TodoService,
  private readonly onComplete: () => void,
  private readonly onDelete: () => void,
) {
  super(app);
}
```

- [ ] **Step 2: Add `handleDelete` in `onOpen` and pass it to the form**

In `onOpen`, add `handleDelete` right after `handleComplete`:

```ts
onOpen(): void {
  this.titleEl.setText(this.todo.title);
  const handleComplete = () => {
    this.onComplete();
    this.close();
  };
  const handleDelete = () => {
    this.close();
    this.onDelete();
  };
  this.root = createRoot(this.contentEl);
  this.root.render(
    <StrictMode>
      <TodoDetailForm
        todo={this.todo}
        todoList={this.todoList}
        todoService={this.todoService}
        onComplete={handleComplete}
        onDelete={handleDelete}
      />
    </StrictMode>,
  );
}
```

- [ ] **Step 3: Typecheck**

```bash
npm run typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add src/components/TodoDetailModal.tsx
git commit -m "feat: wire onDelete through TodoDetailModal constructor"
```

---

## Task 4: `CalendarApp` — `onDelete` callback and passing to modal

**Files:**
- Modify: `src/components/CalendarApp.tsx`
- Test: `tests/components/CalendarApp.test.tsx`

- [ ] **Step 1: Update the `TodoDetailModal` mock to capture `onDelete`**

In `tests/components/CalendarApp.test.tsx`, find the `todoDetailModalCallbacks` hoisted variable and the `TodoDetailModal` mock. Update both:

Change:
```ts
const todoDetailModalCallbacks = vi.hoisted(() => ({
  onComplete: null as (() => void) | null,
}));
```
to:
```ts
const todoDetailModalCallbacks = vi.hoisted(() => ({
  onComplete: null as (() => void) | null,
  onDelete: null as (() => void) | null,
}));
```

Change the mock constructor from:
```ts
vi.mock('../../src/components/TodoDetailModal', () => ({
  TodoDetailModal: class {
    constructor(
      _app: unknown,
      _todo: unknown,
      _list: unknown,
      _todoService: unknown,
      onComplete: () => void,
    ) {
      todoDetailModalCallbacks.onComplete = onComplete;
    }
    open() {}
  },
}));
```
to:
```ts
vi.mock('../../src/components/TodoDetailModal', () => ({
  TodoDetailModal: class {
    constructor(
      _app: unknown,
      _todo: unknown,
      _list: unknown,
      _todoService: unknown,
      onComplete: () => void,
      onDelete: () => void,
    ) {
      todoDetailModalCallbacks.onComplete = onComplete;
      todoDetailModalCallbacks.onDelete = onDelete;
    }
    open() {}
  },
}));
```

- [ ] **Step 2: Write the failing tests**

Find the existing todo-click test section in `tests/components/CalendarApp.test.tsx` (the block that uses `todoDetailModalCallbacks.onComplete`) and append these tests in the same `describe` block:

```ts
it('onDelete immediately adds the task to completingTodoIds (dims the pill)', async () => {
  const ctx = makeContext();
  (ctx.todoService.deleteTask as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => {}));
  renderCalendarApp(ctx);
  await screen.findByText('Write quarterly report');

  await userEvent.click(screen.getByLabelText('View task: Write quarterly report'));
  todoDetailModalCallbacks.onDelete!();

  const card = document.querySelector('.m365-todo-card') as HTMLElement;
  expect(card.style.opacity).toBe('0.4');
  expect(card.style.pointerEvents).toBe('none');
});

it('onDelete removes the task from the list on success', async () => {
  const ctx = makeContext();
  (ctx.todoService.deleteTask as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
  renderCalendarApp(ctx);
  await screen.findByText('Write quarterly report');

  await userEvent.click(screen.getByLabelText('View task: Write quarterly report'));
  todoDetailModalCallbacks.onDelete!();

  await waitFor(() => {
    expect(ctx.todoService.deleteTask).toHaveBeenCalledWith('list1', 'task1');
  });
  await waitFor(() => {
    expect(screen.queryByText('Write quarterly report')).not.toBeInTheDocument();
  });
});

it('onDelete shows an error Notice and restores the pill on failure', async () => {
  const ctx = makeContext();
  (ctx.todoService.deleteTask as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
  renderCalendarApp(ctx);
  await screen.findByText('Write quarterly report');

  await userEvent.click(screen.getByLabelText('View task: Write quarterly report'));
  todoDetailModalCallbacks.onDelete!();

  await waitFor(() => {
    expect(obsidianMock.Notice).toHaveBeenCalledWith(
      expect.stringContaining('Network error'),
    );
  });
  const card = document.querySelector('.m365-todo-card') as HTMLElement;
  expect(card.style.opacity).not.toBe('0.4');
});
```

- [ ] **Step 3: Add `deleteTask` to the mock `todoService` in `makeContext`**

Find `makeContext` in `tests/components/CalendarApp.test.tsx`. The `todoService` mock needs `deleteTask`. Add it alongside `completeTask`:

```ts
deleteTask: vi.fn().mockResolvedValue(undefined),
```

- [ ] **Step 4: Run tests to verify they fail**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: 3 new failures.

- [ ] **Step 5: Implement `onDelete` in `CalendarApp.handleTodoClick`**

In `src/components/CalendarApp.tsx`, inside `handleTodoClick`, add `onDelete` right after the closing of `onComplete`:

```ts
const onDelete = () => {
  setCompletingTodoIds((prev) => new Set([...prev, todo.id]));
  void todoService.deleteTask(todo.listId, todo.id)
    .then(() => {
      setTodos((prev) => prev.filter((t) => t.id !== todo.id));
      setCompletingTodoIds((prev) => { const s = new Set(prev); s.delete(todo.id); return s; });
    })
    .catch((e: unknown) => {
      setCompletingTodoIds((prev) => { const s = new Set(prev); s.delete(todo.id); return s; });
      notifyError(e);
    });
};
```

Then update the modal instantiation from:
```ts
new TodoDetailModal(app, todo, list, todoService, onComplete).open();
```
to:
```ts
new TodoDetailModal(app, todo, list, todoService, onComplete, onDelete).open();
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/components/CalendarApp.test.tsx
```

Expected: all tests pass.

- [ ] **Step 7: Run the full test suite**

```bash
npm test
```

Expected: all tests pass.

- [ ] **Step 8: Commit**

```bash
git add src/components/CalendarApp.tsx tests/components/CalendarApp.test.tsx
git commit -m "feat: delete task from detail modal with optimistic update"
```

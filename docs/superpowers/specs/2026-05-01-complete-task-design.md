# Complete Task from Details Modal

**Date:** 2026-05-01
**Branch:** feat/complete_tasks

## Overview

Add a Complete button to the `TodoDetailModal`. Clicking it dismisses the modal immediately and fires a background PATCH call to mark the task completed in Microsoft To Do. While the call is in flight the task's pill in the calendar is darkened and non-interactive. On success the task is removed from the calendar; on failure it returns to normal and an error toast is shown.

## Changes by layer

### 1. `TodoService` — new `completeTask` method

```ts
async completeTask(listId: string, taskId: string): Promise<void>
```

- Issues `PATCH /me/todo/lists/{encodedListId}/tasks/{encodedTaskId}` with body `{ "status": "completed" }`.
- Uses `fetchWithRetry` and the existing `auth.getValidToken()` pattern.
- Throws on non-OK response (message includes `response.statusText`).

### 2. `CalendarApp` — pending state and callback wiring

New state:
```ts
const [completingTodoIds, setCompletingTodoIds] = useState<Set<string>>(new Set());
```

`handleTodoClick` builds an `onComplete` callback and passes it to `TodoDetailModal`:

1. Adds `todo.id` to `completingTodoIds` (pill darkens).
2. Calls `todoService.completeTask(todo.listId, todo.id)` — fire-and-forget (void, no await at call site).
3. **On success:** removes task from `todos`; removes `todo.id` from `completingTodoIds`.
4. **On failure:** removes `todo.id` from `completingTodoIds` (pill restores); calls `notifyError(e)`.

`completingTodoIds` is passed into `MonthView`, `WeekView`, and `DayView`, which forward it to `TodoCard` as `isCompleting: boolean` (`completingTodoIds.has(todo.id)`).

### 3. `TodoDetailModal` / `TodoDetailForm`

`TodoDetailModal` constructor gains a fourth parameter:
```ts
constructor(app: App, todo: M365TodoItem, todoList: M365TodoList, onComplete: () => void)
```

`TodoDetailForm` props gain `onComplete: () => void`. The form renders a **Complete** button below the existing detail rows. On click it calls `onComplete()`.

`TodoDetailModal.onOpen()` wraps the constructor's `onComplete` before passing it to the form:
```ts
const handleComplete = () => {
  this.onComplete();  // notify CalendarApp — starts async work
  this.close();       // dismiss modal immediately
};
```

No loading/disabled state on the button; the modal is gone before any async feedback is needed.

### 4. `TodoCard` — pending visual state

New optional prop: `isCompleting?: boolean`

When `true`:
- `opacity: 0.4`
- `pointerEvents: 'none'`

Existing border, color, and layout are unchanged — the pill remains recognizable while dimmed.

## Data flow

```
User clicks Complete
  → TodoDetailForm.onComplete()        [modal closes]
  → CalendarApp: add id to completingTodoIds
  → todoService.completeTask()         [background]
      success → remove from todos, remove from completingTodoIds
      failure → remove from completingTodoIds, notifyError()
```

## Error handling

- API failure: Obsidian `Notice` toast via existing `notifyError` helper. Task remains in `todos` with normal appearance.
- No retry logic — user can manually re-open the modal and try again.

## Testing

- `TodoService.completeTask`: verify correct URL, method, body, and auth header; verify throw on non-OK.
- `CalendarApp`: verify `completingTodoIds` is set on click; verify task removed from `todos` on success; verify `completingTodoIds` cleared and `notifyError` called on failure.
- `TodoDetailForm`: verify Complete button present; verify `onComplete` called on click.
- `TodoCard`: verify `opacity`/`pointerEvents` applied when `isCompleting` is true, absent when false.

## Out of scope

- Editing task fields (title, due date, notes).
- Undo / unmark-complete.
- Snooze or reschedule.

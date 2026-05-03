# Task Delete Design

**Date:** 2026-05-02
**Branch:** feat/task-delete

## Overview

Add the ability to delete a Microsoft To Do task from the task detail modal. A red "Delete" button appears next to "Mark complete". The user is prompted inline for confirmation before the delete proceeds. On confirmation the modal closes immediately, the task pill dims and becomes non-interactive (reusing the existing completing state), and the delete API call runs in the background. On failure an error Notice is shown and the task pill is restored.

## Changes

### 1. `TodoService.deleteTask(listId, taskId)`

New method on `TodoService`. Calls `DELETE /me/todo/lists/{listId}/tasks/{taskId}` via `fetchWithRetry`. Acquires a token via `this.auth.getValidToken()`. Throws on non-ok response.

### 2. `TodoDetailForm` — inline confirmation

- New `onDelete?: () => void` prop added to `TodoDetailFormProps`.
- New `confirmingDelete: boolean` state (default `false`).
- Footer when `confirmingDelete` is `false`: existing "Mark complete" button + new red "Delete" button (both use Obsidian's `mod-warning` class on the Delete button). Clicking "Delete" sets `confirmingDelete = true`.
- Footer when `confirmingDelete` is `true`: message "This will permanently delete the task." + Cancel button (sets `confirmingDelete = false`) + red "Delete" confirm button (calls `onDelete()`).
- No loading/disabled state needed in the form — the modal closes synchronously on confirm.

### 3. `TodoDetailModal` — immediate dismiss

- New `onDelete: () => void` constructor parameter.
- `handleDelete` defined in `onOpen`:
  ```ts
  const handleDelete = () => {
    this.close();
    this.onDelete();
  };
  ```
- `handleDelete` passed as the `onDelete` prop to `TodoDetailForm`.

### 4. `CalendarApp.handleTodoClick` — optimistic update + error recovery

New `onDelete` callback defined alongside the existing `onComplete`:

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

`onDelete` passed as the new fourth argument to `new TodoDetailModal(...)`.

## Data flow

```
User clicks Delete → confirmingDelete = true (footer swaps)
User confirms       → onDelete() called → modal closes immediately
                    → CalendarApp: completingTodoIds.add(todo.id) → task pill dims
                    → todoService.deleteTask() called async
  Success           → todos.filter(todo.id out) + completingTodoIds.delete(todo.id)
  Failure           → completingTodoIds.delete(todo.id) (pill restored) + notifyError()
```

## Testing

- `TodoService.deleteTask` — unit test: verifies correct URL, method, and auth header; verifies throw on non-ok.
- `TodoDetailForm` — render test: Delete button visible; clicking shows confirmation footer; Cancel restores normal footer; confirming calls `onDelete`.
- `CalendarApp` (integration) — `handleTodoClick` test: `onDelete` adds to `completingTodoIds`, removes todo on success, restores on failure and shows Notice.

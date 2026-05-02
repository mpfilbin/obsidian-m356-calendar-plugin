# Create Task Feature — Design Spec

**Date:** 2026-05-02
**Status:** Approved

## Overview

Add the ability to create Microsoft To Do tasks directly from the calendar plugin. A "+ New task" button in the toolbar opens a creation modal where the user fills in task details and checklist steps. On success the modal dismisses and the new task appears in the current view.

---

## Types

Two new types added to `src/types/index.ts`:

```typescript
export interface NewTaskInput {
  title: string;
  dueDate: string;        // "YYYY-MM-DD"
  notes?: string;
  recurrence?: TaskRecurrence;
}

export interface TaskRecurrence {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
  interval: number;       // 1 = every day/week/month/year, 2 = every other, etc.
}
```

---

## Service Layer

### `TodoService.createTask(listId: string, input: NewTaskInput): Promise<M365TodoItem>`

New method on `TodoService`. Posts to:

```
POST /me/todo/lists/{listId}/tasks
```

Request body includes:
- `title`
- `dueDateTime: { dateTime: "<dueDate>T00:00:00", timeZone: "UTC" }`
- `body: { contentType: "text", content: notes }` (omitted when notes is empty)
- `recurrence` (omitted when not set)

Graph API recurrence mapping:

| `frequency`  | `pattern.type`        | Extra fields                                      |
|--------------|-----------------------|---------------------------------------------------|
| `daily`      | `daily`               | —                                                 |
| `weekly`     | `weekly`              | `daysOfWeek` derived from the due date's weekday  |
| `monthly`    | `absoluteMonthly`     | `dayOfMonth` derived from the due date            |
| `yearly`     | `absoluteYearly`      | `dayOfMonth` + `month` derived from the due date  |

Range is always `{ type: "noEnd", startDate: "<dueDate>" }`.

Returns a mapped `M365TodoItem` from the API response.

**Checklist items are not handled here.** They are posted by `CalendarApp` after task creation using the existing `createChecklistItem` method.

---

## UI: `CreateTaskModal.tsx`

New file at `src/components/CreateTaskModal.tsx`, following the same structure as `CreateEventModal.tsx`.

### `CreateTaskForm` (React component)

Props:
```typescript
interface CreateTaskFormProps {
  todoLists: M365TodoList[];
  defaultListId: string;
  initialDate: Date;
  onSubmit: (listId: string, input: NewTaskInput, steps: string[]) => void;
  onCancel: () => void;
}
```

Form fields (in order):

1. **Title** — `<input type="text">`, required, autofocused
2. **List** — `<select>` populated from `todoLists`
3. **Due date** — `<input type="date">`, defaults to `initialDate`
4. **Repeat** — `<input type="checkbox">`; when checked, expands to:
   - Frequency `<select>`: `daily | weekly | monthly | yearly`
   - Interval `<input type="number" min="1">` (e.g., "every [2] weeks")
5. **Notes** — `<textarea>`, optional
6. **Steps** — rendered list of added steps, each with a delete (`×`) button; plus an "Add step" text input (Enter or blur to commit)
7. **Cancel / Create** action buttons

Validation on submit: title is non-empty, list is selected. Error displayed inline above the actions row.

`onSubmit` is called with `(listId, { title, dueDate, notes?, recurrence? }, steps)` where `steps` is a `string[]` of non-empty step texts.

### `CreateTaskModal` (Obsidian Modal)

Wraps `CreateTaskForm` in a React root inside `contentEl`, following the same lifecycle as `CreateEventModal`. Title text: `"New task"`. Calls `this.close()` after `onSubmit` resolves.

---

## Toolbar

`Toolbar` gains one new prop:

```typescript
onNewTask: () => void;
```

A `+ New task` button is added to `m365-toolbar-actions`, to the **left** of the existing `+ New event` button.

---

## CalendarApp Wiring

### `openCreateTaskModal(date: Date)`

New function in `CalendarApp`:

1. Opens `CreateTaskModal` with all `todoLists`, the first `enabledTodoListId` (or `todoLists[0]`) pre-selected, and `date` as `initialDate`
2. On submit:
   a. Calls `todoService.createTask(listId, input)` to create the task
   b. For each step string, calls `todoService.createChecklistItem(listId, task.id, step)` sequentially
   c. If any call fails: calls `notifyError(e)` (toast + console log) and re-throws so the modal stays open
   d. On full success: appends the new task to `todos` state if its `dueDate` falls within the current view's date range; modal closes

### Toolbar wiring

```tsx
onNewTask={() => openCreateTaskModal(view === 'day' ? currentDate : new Date())}
```

Day view passes the currently-viewed day; Month and Week views pass today.

---

## Error Handling

| Failure point              | Behavior                                                  |
|----------------------------|-----------------------------------------------------------|
| Task creation API failure  | `notifyError` toast + console log; modal stays open       |
| Checklist item API failure | `notifyError` toast + console log; modal stays open; task was already created |

---

## Testing

- Unit test `TodoService.createTask` — verifies correct Graph API payload for each recurrence frequency, and the no-recurrence case
- Component test for `CreateTaskForm` — verifies: submit with valid data calls `onSubmit`, submit with empty title shows inline error, repeat checkbox expansion renders frequency/interval fields, steps can be added and removed
- No new integration tests required; error-path behavior is covered by existing `notifyError` usage patterns

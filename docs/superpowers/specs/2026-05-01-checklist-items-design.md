# Checklist Items for Task Details

**Date:** 2026-05-01  
**Status:** Approved  
**Branch:** feat/checklists

## Overview

Display and manage Microsoft To Do checklist items (sub-tasks) within the `TodoDetailModal`. Users can view, check/uncheck, add, and delete checklist items inline. When all items are checked, the parent task is automatically completed.

## Scope

Files changed:
- `src/types/index.ts` — new `M365ChecklistItem` type
- `src/services/TodoService.ts` — four new Graph API methods
- `src/components/TodoDetailModal.tsx` — checklist UI in `TodoDetailForm`

No changes to `TodoCard`, `CalendarApp`, modal shell, or any other files.

## Data Model

New type added to `src/types/index.ts`:

```ts
export interface M365ChecklistItem {
  id: string;
  displayName: string;
  isChecked: boolean;
}
```

## Service Layer

Four new methods on `TodoService`, all using `fetchWithRetry` with a Bearer token (same pattern as existing methods). No caching — items are fetched fresh each time the modal opens.

| Method | HTTP | Endpoint |
|---|---|---|
| `getChecklistItems(listId, taskId)` | GET | `/me/todo/lists/{listId}/tasks/{taskId}/checklistItems` |
| `createChecklistItem(listId, taskId, displayName)` | POST | `.../checklistItems` |
| `updateChecklistItem(listId, taskId, itemId, patch)` | PATCH | `.../checklistItems/{itemId}` |
| `deleteChecklistItem(listId, taskId, itemId)` | DELETE | `.../checklistItems/{itemId}` |

`patch` for `updateChecklistItem` is `Partial<Pick<M365ChecklistItem, 'isChecked' | 'displayName'>>`.

## Component State

`todoService` is added to `TodoDetailFormProps`. It is already available in `CalendarApp` via `AppContext` and passed when constructing the modal.

State variables added to `TodoDetailForm`:

```ts
const [checklistItems, setChecklistItems] = useState<M365ChecklistItem[]>([]);
const [loadingChecklist, setLoadingChecklist] = useState(true);
const [newItemText, setNewItemText] = useState('');
```

## Behaviour

**Fetch on mount:** A `useEffect` calls `todoService.getChecklistItems(listId, taskId)`. While loading, the checklist section shows a brief loading indicator.

**Toggle check:** Clicking a checkbox calls `updateChecklistItem(..., { isChecked: !item.isChecked })` and updates local state optimistically. After the optimistic update, if every item has `isChecked: true`, `onComplete()` is called automatically (same effect as the "Mark complete" button).

**Add item:** An `<input>` with placeholder `"Add item"` is always visible below the list. On `Enter` keydown or `onBlur` with non-empty text, `createChecklistItem` is called, the returned item is appended to state, and the input is cleared.

**Delete item:** Each row has a small × button on the right. A single click calls `deleteChecklistItem` and removes the item from local state immediately. No confirmation prompt.

## UI Layout

The checklist section is inserted between the notes section and the footer ("Mark complete" button).

```
[ ] Item one                              [×]
[x] Item two (strikethrough)              [×]
[ Add item                              ]
```

- Checkbox: native `<input type="checkbox">`
- Label: `displayName`; strikethrough style when `isChecked`
- Delete button: × on the far right of each row
- Add input: full-width, placeholder `"Add item"`, always visible
- Section heading: `"Checklist"` label above the list

## Auto-complete Logic

After any `isChecked` toggle that results in all items being checked:
1. The optimistic state update is applied first
2. `onComplete()` is invoked — this marks the parent task complete and closes the modal

If there are zero checklist items, auto-complete is not triggered (the existing "Mark complete" button remains the only way to complete the task).

## Error Handling

API errors on CRUD operations are caught and logged to `console.error`. No user-facing error toasts — failed operations leave the optimistic state in place (consistent with the existing pattern in the codebase).

## Testing

- Unit tests in `tests/services/TodoService.test.ts` for each new method (mock `fetchWithRetry`)
- Component tests in `tests/components/TodoDetailModal.test.tsx` covering:
  - Checklist items render on open
  - Toggling an item calls `updateChecklistItem`
  - Checking the last unchecked item triggers `onComplete`
  - Adding an item via Enter key calls `createChecklistItem`
  - Clicking × calls `deleteChecklistItem` and removes the item

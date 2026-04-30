# Microsoft To Do Calendar Integration — Design

**Date:** 2026-04-30
**Branch:** feat/todo-calendar
**Scope:** Read-only display of Microsoft To Do tasks with due dates on the calendar (phase 1). Full CRUD and local Obsidian task support are out of scope for this phase.

---

## Overview

Add read-only Microsoft To Do support to the M365 Calendar plugin. Incomplete tasks with a due date appear on the calendar on their due date across all three views (month, week, day). Users select which To Do lists to display via sidebar toggles, mirroring the existing calendar enable/disable pattern. Clicking a task opens a read-only detail modal.

---

## Data Layer

### New Types (`src/types/index.ts`)

```ts
interface M365TodoList {
  id: string;
  displayName: string;
  color: string; // deterministically assigned from a fixed palette; Graph API does not expose list colors
}

interface M365TodoItem {
  id: string;
  title: string;
  listId: string;
  dueDate: string;           // "YYYY-MM-DD" extracted from the Graph API dueDateTime object
  body?: string;             // task notes/description
  importance: 'low' | 'normal' | 'high';
}
```

### `TodoService` (`src/services/TodoService.ts`)

Parallel to `CalendarService`. Takes `AuthService` as its only constructor dependency.

**`getLists(): Promise<M365TodoList[]>`**
- `GET /me/todo/lists`
- Assigns colors deterministically by hashing the list ID against a fixed 12-color palette (matching Microsoft To Do's own color set)

**`getTasks(listIds: string[], start: Date, end: Date): Promise<M365TodoItem[]>`**
- For each enabled list: `GET /me/todo/lists/{listId}/tasks?$filter=status ne 'completed'`
- Filters by `dueDate` client-side — Graph API OData support for `dueDateTime` range queries is unreliable
- Tasks without a `dueDateTime` are excluded
- Results from all lists are merged and returned as a flat array

No caching for this phase. Todo task lists are small and fetching is fast.

### Graph API Permissions Required

- `Tasks.Read` — read todo lists and tasks (new, added for this feature)
- `Calendars.Read`, `Calendars.ReadWrite`, `User.Read` — already required

---

## Settings & State

### Settings (`src/types/index.ts` — `M365CalendarSettings`)

One new field:
```ts
enabledTodoListIds: string[];
```
Persisted via Obsidian's `saveData`/`loadData`, identical to `enabledCalendarIds`. Default: `[]` (all lists start disabled, user opts in).

No settings tab UI for this field — toggling lives in the sidebar.

### State in `CalendarApp`

```ts
const [todoLists, setTodoLists] = useState<M365TodoList[]>([]);
const [todos, setTodos] = useState<M365TodoItem[]>([]);
const [enabledTodoListIds, setEnabledTodoListIds] = useState<string[]>(settings.enabledTodoListIds);
const todoListsLoadedRef = useRef(false);
```

A `fetchTodos` callback loads lists once on mount (guarded by `todoListsLoadedRef`), then fetches tasks for the current date range on every call. Todo lists are not reloaded on background refresh — only on first load or explicit user refresh. This matches the `calendarsLoadedRef` pattern used for calendars.

`fetchTodos` is called alongside `fetchAll` in the mount effect, the view/date change effect, and the background refresh interval.

---

## Sidebar

`CalendarSelector` gains a "Tasks" section below the existing "Calendars" section.

Each todo list renders as a toggle row with:
- A colored indicator dot (using the list's assigned palette color)
- The list's `displayName`
- A toggle checkbox

**Props added to `CalendarSelector`:**
```ts
todoLists: M365TodoList[];
enabledTodoListIds: string[];
onToggleTodoList: (listId: string) => void;
```

Toggling a list updates `enabledTodoListIds` in state, persists to settings, and triggers `fetchTodos`. The toggle handler in `CalendarApp` mirrors `handleToggleCalendar` exactly.

---

## Views

Each view (month, week, day) receives two new props:

```ts
todos: M365TodoItem[];
todoLists: M365TodoList[];
```

Tasks are filtered to the relevant date(s) by matching `todo.dueDate` against the cell date string (`"YYYY-MM-DD"`), the same pattern used for events (`event.start.dateTime.slice(0, 10)`).

### Month View
TODOs render after events in each day cell. Events and TODOs share the `maxEventsPerDay` overflow budget — the overflow count reflects the combined total.

### Week View
TODOs render as all-day items in the all-day row at the top of their due date column, alongside any all-day events.

### Day View
TODOs render in the all-day section at the top of the view, alongside all-day events.

In all views, TODOs are rendered as `TodoCard` components, not `EventCard`.

---

## Components

### `TodoCard` (`src/components/TodoCard.tsx`)

Visually distinct from `EventCard`:
- Same pill shape and color system (`backgroundColor + border` using the list's assigned color)
- Checkmark circle icon (☐) on the left to signal "task, not event"
- Dashed border style to further differentiate from solid-border events
- Displays task title only — no time label (tasks are due-date-only, not time-bound)

### `TodoDetailModal` (`src/components/TodoDetailModal.tsx`)

Read-only Obsidian `Modal` subclass. Opened when a `TodoCard` is clicked in any view. Receives `M365TodoItem` and its parent `M365TodoList`.

Displays:
- Task title (heading)
- List name with color indicator dot
- Due date (formatted as human-readable string)
- Importance badge — shown only for `'high'` or `'low'`; `'normal'` is omitted as noise
- Body/notes (if present)

No action buttons in this phase.

---

## Context & Wiring

### `AppContextValue` (`src/context.ts`)

One new field:
```ts
todoService: TodoService;
```

### `main.ts`

`TodoService` is constructed alongside `CalendarService`, both taking `AuthService` as their only dependency. The instance is passed into `AppContextValue`.

### `CalendarApp`

Reads `todoService` from context via `useAppContext()`. `fetchTodos` is structured symmetrically with `fetchAll`.

---

## Future Extensibility

This design is intentionally scoped to phase 1 (read-only, Microsoft To Do). Two extension points are preserved:

1. **Local Obsidian tasks (phase 2):** A second service implementing the same `getLists`/`getTasks` interface can be introduced. `CalendarApp` merges results from both services before passing to views — no view component changes needed.

2. **CRUD operations (phase 3):** `TodoService` is the only todo-aware piece outside the UI. Adding create/complete/delete methods to `TodoService` and corresponding modal actions to `TodoDetailModal` does not require structural changes.

---

## Testing

- Unit tests for `TodoService`: mock `AuthService`, assert correct Graph API URLs, verify client-side due-date filtering, verify completed task exclusion.
- Component tests for `CalendarApp`: verify `fetchTodos` is called on mount and on date/view change; verify `enabledTodoListIds` state updates on toggle.
- Component tests for each view: verify `TodoCard` renders on due date, not on other dates; verify `EventCard` and `TodoCard` coexist correctly.
- Component test for `TodoDetailModal`: verify all fields render correctly; verify importance badge omitted for `'normal'`.

import { Dispatch, SetStateAction, useCallback, useState } from 'react';
import { M365Calendar, M365Event, M365TodoItem } from '../types';
import { DragItem, DropTarget } from '../DragContext';
import { useAppContext } from '../context';
import { dayDelta, moveEventToTime, shiftEventByDays } from '../lib/reschedule';
import { notifyError } from '../lib/notify';

export interface RescheduleDeps {
  calendars: M365Calendar[];
  setEvents: Dispatch<SetStateAction<M365Event[]>>;
  setTodos: Dispatch<SetStateAction<M365TodoItem[]>>;
  /** Tasks being saved (shared with complete/delete); they are dimmed and not draggable. */
  completingTodoIds: Set<string>;
  setCompletingTodoIds: Dispatch<SetStateAction<Set<string>>>;
  /** Refetches events after a successful move so the view reflects the server. */
  refreshEvents: () => Promise<void>;
}

const withId = (set: Set<string>, id: string) => new Set(set).add(id);
const withoutId = (set: Set<string>, id: string) => {
  const next = new Set(set);
  next.delete(id);
  return next;
};

/**
 * Drag-and-drop rescheduling. Moves are applied optimistically, dimmed while the request is in
 * flight, and rolled back (with a notice) if the request fails.
 */
export function useReschedule(deps: RescheduleDeps) {
  const { calendarService, todoService } = useAppContext();
  const { calendars, setEvents, setTodos, completingTodoIds, setCompletingTodoIds, refreshEvents } = deps;
  const [pendingEventIds, setPendingEventIds] = useState<Set<string>>(new Set());

  const canDrag = useCallback((item: DragItem): boolean => {
    if (item.kind === 'todo') return true;
    // Series masters are not shown by calendarView; moving one would shift every occurrence.
    if (item.event.type === 'seriesMaster') return false;
    return calendars.find((c) => c.id === item.event.calendarId)?.canEdit === true;
  }, [calendars]);

  const isPending = useCallback(
    (id: string) => pendingEventIds.has(id) || completingTodoIds.has(id),
    [pendingEventIds, completingTodoIds],
  );

  const moveEvent = useCallback(async (original: M365Event, patch: NonNullable<ReturnType<typeof shiftEventByDays>>) => {
    const moved: M365Event = { ...original, start: patch.start, end: patch.end };
    setEvents((prev) => prev.map((e) => (e.id === original.id ? moved : e)));
    setPendingEventIds((prev) => withId(prev, original.id));
    try {
      await calendarService.updateEvent(original.id, patch);
      await refreshEvents();
    } catch (e) {
      setEvents((prev) => prev.map((x) => (x.id === original.id ? original : x)));
      notifyError(e);
    } finally {
      setPendingEventIds((prev) => withoutId(prev, original.id));
    }
  }, [calendarService, setEvents, refreshEvents]);

  const moveTodo = useCallback(async (todo: M365TodoItem, dueDate: string) => {
    setTodos((prev) => prev.map((t) => (t.id === todo.id ? { ...t, dueDate } : t)));
    setCompletingTodoIds((prev) => withId(prev, todo.id));
    try {
      await todoService.updateTaskDueDate(todo.listId, todo.id, dueDate);
    } catch (e) {
      setTodos((prev) => prev.map((t) => (t.id === todo.id ? todo : t)));
      notifyError(e);
    } finally {
      setCompletingTodoIds((prev) => withoutId(prev, todo.id));
    }
  }, [todoService, setTodos, setCompletingTodoIds]);

  const onDrop = useCallback((item: DragItem, target: DropTarget) => {
    if (item.kind === 'todo') {
      if (item.todo.dueDate !== target.date) void moveTodo(item.todo, target.date);
      return;
    }
    const patch = target.minutes !== undefined
      ? moveEventToTime(item.event, target.date, target.minutes)
      : shiftEventByDays(item.event, dayDelta(item.grabbedDate, target.date));
    if (patch) void moveEvent(item.event, patch);
  }, [moveEvent, moveTodo]);

  return { canDrag, isPending, onDrop };
}

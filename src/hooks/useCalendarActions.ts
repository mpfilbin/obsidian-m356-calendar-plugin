import { Notice, Menu } from 'obsidian';
import { Dispatch, SetStateAction } from 'react';
import { M365Calendar, M365Event, M365TodoList, M365TodoItem, ViewType, DayContextMenuPayload } from '../types';
import { CreateEventModal } from '../components/CreateEventModal';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { EventDetailModal } from '../components/EventDetailModal';
import { TodoDetailModal } from '../components/TodoDetailModal';
import { ConfirmModal } from '../components/ConfirmModal';
import { useAppContext } from '../context';
import { usePopoverContext } from '../PopoverContext';
import { getDateRange, toDateOnly } from '../lib/datetime';
import { notifyError } from '../lib/notify';

export interface CalendarActionsDeps {
  currentDate: Date;
  view: ViewType;
  calendars: M365Calendar[];
  enabledIds: string[];
  setEvents: Dispatch<SetStateAction<M365Event[]>>;
  todoLists: M365TodoList[];
  enabledTodoListIds: string[];
  setTodos: Dispatch<SetStateAction<M365TodoItem[]>>;
  setCompletingTodoIds: Dispatch<SetStateAction<Set<string>>>;
  /** Refetches events (without reloading the calendar list). */
  refreshEvents: () => Promise<void>;
}

/** User-initiated actions that open modals / menus and mutate events and tasks. */
export function useCalendarActions(deps: CalendarActionsDeps) {
  const { app, calendarService, todoService, settings } = useAppContext();
  const { hidePopover } = usePopoverContext();
  const {
    currentDate, view, calendars, enabledIds, setEvents,
    todoLists, enabledTodoListIds, setTodos, setCompletingTodoIds, refreshEvents,
  } = deps;

  const openCreateEventModal = (date: Date, initialAllDay = false) => {
    const enabledCalendars = calendars.filter((c) => enabledIds.includes(c.id));
    if (enabledCalendars.length === 0) {
      new Notice('Enable at least one calendar to create events.');
      return;
    }
    new CreateEventModal(
      app,
      enabledCalendars,
      settings.defaultCalendarId,
      date,
      async (calendarId, event) => {
        try {
          await calendarService.createEvent(calendarId, event);
          await refreshEvents();
        } catch (e) {
          notifyError(e);
          throw e;
        }
      },
      initialAllDay,
    ).open();
  };

  const openCreateTaskModal = (date: Date) => {
    if (todoLists.length === 0) {
      new Notice('No task lists available. Enable at least one task list.');
      return;
    }
    const todoListIds = new Set(todoLists.map((l) => l.id));
    const defaultListId = enabledTodoListIds.find((id) => todoListIds.has(id)) ?? todoLists[0]?.id ?? '';
    new CreateTaskModal(
      app,
      todoLists,
      defaultListId,
      date,
      async (listId, input, steps) => {
        let created: M365TodoItem;
        try {
          created = await todoService.createTask(listId, input);
        } catch (e) {
          notifyError(e);
          throw e; // keep modal open
        }
        // Task created — append to state before attempting steps so it's visible even if steps fail
        const { start, end } = getDateRange(currentDate, view);
        const startStr = toDateOnly(start);
        const endStr = toDateOnly(end);
        if (created.dueDate >= startStr && created.dueDate <= endStr) {
          setTodos((prev) => [...prev, created]);
        }
        for (const step of steps) {
          try {
            await todoService.createChecklistItem(listId, created.id, step);
          } catch (e) {
            notifyError(e); // partial failure — task was created; don't rethrow or modal stays open
          }
        }
      },
    ).open();
  };

  const handleDayContextMenu = (payload: DayContextMenuPayload, event: MouseEvent) => {
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle('New event').setIcon('calendar-plus').onClick(() => {
        const date = payload.kind === 'timed' ? payload.dateTime : payload.date;
        openCreateEventModal(date, payload.kind === 'allday');
      }),
    );
    menu.addItem((item) =>
      item.setTitle('New task').setIcon('check-square').onClick(() => {
        // Tasks only have a due date (no time), so always pass the date portion only.
        const date = payload.kind === 'timed' ? payload.dateTime : payload.date;
        openCreateTaskModal(date);
      }),
    );
    menu.showAtMouseEvent(event);
  };

  // ── Events ────────────────────────────────────────────────────────────────

  const deleteEventNow = async (event: M365Event) => {
    await calendarService.deleteEvent(event.id);
    setEvents((prev) => prev.filter((e) => e.id !== event.id && e.seriesMasterId !== event.id));
    new Notice(event.type === 'seriesMaster' ? 'Series deleted' : 'Event deleted');
  };

  const deleteSeriesNow = async (seriesMasterId: string) => {
    await calendarService.deleteEventSeries(seriesMasterId);
    setEvents((prev) => prev.filter((e) => e.seriesMasterId !== seriesMasterId && e.id !== seriesMasterId));
    new Notice('Series deleted');
  };

  /** What may be deleted for this event: undefined means "not offered" (e.g. read-only calendar). */
  const eventDeleteActions = (event: M365Event) => {
    const canEdit = calendars.find((c) => c.id === event.calendarId)?.canEdit ?? false;
    const isOccurrence = event.type === 'occurrence' || event.type === 'exception';
    const { seriesMasterId } = event;
    return {
      canEdit,
      isOccurrence,
      onDelete: canEdit ? () => deleteEventNow(event) : undefined,
      onDeleteSeries: isOccurrence && canEdit && seriesMasterId ? () => deleteSeriesNow(seriesMasterId) : undefined,
    };
  };

  const handleEventClick = (event: M365Event) => {
    const { onDelete, onDeleteSeries } = eventDeleteActions(event);
    new EventDetailModal(
      app,
      event,
      async (patch, targetCalendarId) => {
        try {
          if (targetCalendarId !== event.calendarId) {
            // moveEvent creates in the new calendar (with patch applied) then
            // deletes the original, so updateEvent on the old ID would 404.
            await calendarService.moveEvent(event, targetCalendarId, patch);
          } else {
            await calendarService.updateEvent(event.id, patch);
          }
        } catch (e) {
          notifyError(e);
          throw e;
        }
      },
      () => void refreshEvents(),
      calendars,
      onDelete,
      onDeleteSeries,
    ).open();
  };

  /** Opens a confirmation dialog; failures are reported and keep the dialog open. */
  const confirmDelete = (title: string, message: string, confirmLabel: string, action: () => Promise<void>) => {
    new ConfirmModal(app, title, message, confirmLabel, 'Deleting…', async () => {
      try {
        await action();
      } catch (e) {
        notifyError(e);
        throw e;
      }
    }).open();
  };

  const handleEventContextMenu = (event: M365Event, mouseEvent: MouseEvent) => {
    hidePopover(); // the hover details would otherwise stay on screen behind the menu
    const { canEdit, isOccurrence, onDelete, onDeleteSeries } = eventDeleteActions(event);
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle('Edit event').setIcon('pencil').onClick(() => handleEventClick(event)),
    );
    if (canEdit && onDelete) {
      menu.addSeparator();
      if (isOccurrence) {
        menu.addItem((item) =>
          item.setTitle('Delete this occurrence').setIcon('trash').setWarning(true).onClick(() =>
            confirmDelete(
              'Delete occurrence',
              `Delete "${event.subject}" on this date only? The rest of the series is kept.`,
              'Delete occurrence',
              onDelete,
            ),
          ),
        );
        if (onDeleteSeries) {
          menu.addItem((item) =>
            item.setTitle('Delete entire series').setIcon('trash').setWarning(true).onClick(() =>
              confirmDelete(
                'Delete series',
                `Delete every occurrence of "${event.subject}"? This cannot be undone.`,
                'Delete series',
                onDeleteSeries,
              ),
            ),
          );
        }
      } else {
        const isMaster = event.type === 'seriesMaster';
        menu.addItem((item) =>
          item.setTitle(isMaster ? 'Delete series' : 'Delete event').setIcon('trash').setWarning(true).onClick(() =>
            confirmDelete(
              isMaster ? 'Delete series' : 'Delete event',
              isMaster
                ? `Delete every occurrence of "${event.subject}"? This cannot be undone.`
                : `Delete "${event.subject}"? This cannot be undone.`,
              isMaster ? 'Delete series' : 'Delete event',
              onDelete,
            ),
          ),
        );
      }
    }
    menu.showAtMouseEvent(mouseEvent);
  };

  // ── Tasks ─────────────────────────────────────────────────────────────────

  /**
   * Complete / delete actions for a task. Each marks the task as in-flight while the request runs,
   * then drops it from the list on success. The returned promise lets a dialog stay open
   * (disabled) until the request settles; failures are reported here and rethrown so the dialog
   * can show them inline.
   */
  const todoActions = (todo: M365TodoItem) => {
    const run = async (action: () => Promise<void>) => {
      setCompletingTodoIds((prev) => new Set([...prev, todo.id]));
      try {
        await action();
        setTodos((prev) => prev.filter((t) => t.id !== todo.id));
      } catch (e) {
        notifyError(e);
        throw e;
      } finally {
        setCompletingTodoIds((prev) => { const next = new Set(prev); next.delete(todo.id); return next; });
      }
    };
    return {
      onComplete: () => run(() => todoService.completeTask(todo.listId, todo.id)),
      onDelete: () => run(() => todoService.deleteTask(todo.listId, todo.id)),
    };
  };

  const handleTodoClick = (todo: M365TodoItem) => {
    const list = todoLists.find((l) => l.id === todo.listId);
    if (!list) {
      console.warn('M365 Calendar: todo list not found for task', todo.id);
      return;
    }
    const { onComplete, onDelete } = todoActions(todo);
    new TodoDetailModal(app, todo, list, todoService, onComplete, onDelete).open();
  };

  const handleTodoContextMenu = (todo: M365TodoItem, mouseEvent: MouseEvent) => {
    const { onComplete, onDelete } = todoActions(todo);
    const menu = new Menu();
    menu.addItem((item) =>
      item.setTitle('Edit task').setIcon('pencil').onClick(() => handleTodoClick(todo)),
    );
    menu.addItem((item) =>
      // runTodoAction has already shown the error notice; nothing more to do on failure.
      item.setTitle('Mark complete').setIcon('check').onClick(() => { void onComplete().catch(() => {}); }),
    );
    menu.addSeparator();
    menu.addItem((item) =>
      item.setTitle('Delete task').setIcon('trash').setWarning(true).onClick(() =>
        confirmDelete('Delete task', `Delete "${todo.title}"? This cannot be undone.`, 'Delete task', onDelete),
      ),
    );
    menu.showAtMouseEvent(mouseEvent);
  };

  return {
    openCreateEventModal, openCreateTaskModal, handleDayContextMenu,
    handleEventClick, handleTodoClick, handleEventContextMenu, handleTodoContextMenu,
  };
}

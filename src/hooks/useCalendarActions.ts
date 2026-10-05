import { Notice, Menu } from 'obsidian';
import { Dispatch, SetStateAction } from 'react';
import { M365Calendar, M365Event, M365TodoList, M365TodoItem, ViewType, DayContextMenuPayload } from '../types';
import { CreateEventModal } from '../components/CreateEventModal';
import { CreateTaskModal } from '../components/CreateTaskModal';
import { EventDetailModal } from '../components/EventDetailModal';
import { TodoDetailModal } from '../components/TodoDetailModal';
import { useAppContext } from '../context';
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

  const handleEventClick = (event: M365Event) => {
    const calendar = calendars.find((c) => c.id === event.calendarId);
    const isSeries = event.type === 'occurrence' || event.type === 'exception';
    const isMaster = event.type === 'seriesMaster';
    const onDelete = calendar?.canEdit
      ? async () => {
          await calendarService.deleteEvent(event.id);
          setEvents((prev) => prev.filter(
            (e) => e.id !== event.id && e.seriesMasterId !== event.id,
          ));
          new Notice(isMaster ? 'Series deleted' : 'Event deleted');
        }
      : undefined;
    const { seriesMasterId } = event;
    const onDeleteSeries = isSeries && calendar?.canEdit && seriesMasterId
      ? async () => {
          await calendarService.deleteEventSeries(seriesMasterId);
          setEvents((prev) => prev.filter(
            (e) => e.seriesMasterId !== seriesMasterId && e.id !== seriesMasterId,
          ));
          new Notice('Series deleted');
        }
      : undefined;
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

  const handleTodoClick = (todo: M365TodoItem) => {
    const list = todoLists.find((l) => l.id === todo.listId);
    if (!list) {
      console.warn('M365 Calendar: todo list not found for task', todo.id);
      return;
    }
    // Mark the task as in-flight while the request runs, then drop it from the list on success.
    const runTodoAction = (action: () => Promise<void>) => {
      setCompletingTodoIds((prev) => new Set([...prev, todo.id]));
      void action()
        .then(() => setTodos((prev) => prev.filter((t) => t.id !== todo.id)))
        .catch((e: unknown) => notifyError(e))
        .finally(() => {
          setCompletingTodoIds((prev) => { const next = new Set(prev); next.delete(todo.id); return next; });
        });
    };
    const onComplete = () => runTodoAction(() => todoService.completeTask(todo.listId, todo.id));
    const onDelete = () => runTodoAction(() => todoService.deleteTask(todo.listId, todo.id));
    new TodoDetailModal(app, todo, list, todoService, onComplete, onDelete).open();
  };

  return { openCreateEventModal, openCreateTaskModal, handleDayContextMenu, handleEventClick, handleTodoClick };
}

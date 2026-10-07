import { useState, useEffect, useCallback, useRef } from 'react';
import { M365TodoList, M365TodoItem, ViewType } from '../types';
import { useAppContext } from '../context';
import { getDateRange } from '../lib/datetime';
import { appLogger } from '../lib/logger';

/** Owns the task lists, the enabled-list selection and the tasks due in the visible range. */
export function useTodosData(
  currentDate: Date,
  view: ViewType,
  onSettingsError: (message: string) => void,
) {
  const { todoService, settings: initialSettings, saveSettings } = useAppContext();
  const [todoLists, setTodoLists] = useState<M365TodoList[]>([]);
  const [todos, setTodos] = useState<M365TodoItem[]>([]);
  const [enabledTodoListIds, setEnabledTodoListIds] = useState<string[]>(initialSettings.enabledTodoListIds);
  const [refreshFailed, setRefreshFailed] = useState(false);
  const listsLoadedRef = useRef(false);
  const requestRef = useRef(0);

  const fetchTodos = useCallback(async (options: { reloadLists?: boolean } = {}) => {
    const requestId = ++requestRef.current;
    const isStale = () => requestId !== requestRef.current;
    let listFetchAttempted = false;
    setRefreshFailed(false);
    try {
      if (!listsLoadedRef.current || options.reloadLists) {
        listFetchAttempted = true;
        listsLoadedRef.current = true;
        const lists = await todoService.getLists();
        setTodoLists(lists);
      }
      if (enabledTodoListIds.length > 0) {
        const { start, end } = getDateRange(currentDate, view);
        const tasks = await todoService.getTasks(enabledTodoListIds, start, end);
        if (isStale()) return;
        setTodos(tasks);
      } else {
        setTodos([]);
      }
    } catch (e) {
      if (listFetchAttempted) listsLoadedRef.current = false;
      if (isStale()) return;
      appLogger.error('[M365 Calendar] Failed to load tasks:', e);
      setRefreshFailed(true);
    }
  }, [todoService, enabledTodoListIds, currentDate, view]);

  useEffect(() => {
    void fetchTodos();
  }, [fetchTodos]);

  /** Forget everything held in memory and download task lists and tasks again. */
  const resync = useCallback(() => {
    requestRef.current++; // any request still in flight is for the old data; ignore its result
    listsLoadedRef.current = false;
    setTodoLists([]);
    setTodos([]);
    setRefreshFailed(false);
    void fetchTodos({ reloadLists: true });
  }, [fetchTodos]);

  const toggleTodoList = async (listId: string) => {
    const next = enabledTodoListIds.includes(listId)
      ? enabledTodoListIds.filter((id) => id !== listId)
      : [...enabledTodoListIds, listId];
    setEnabledTodoListIds(next);
    try {
      await saveSettings({ enabledTodoListIds: next });
    } catch (e) {
      onSettingsError(e instanceof Error ? e.message : 'Failed to save settings');
      setEnabledTodoListIds(enabledTodoListIds);
    }
  };

  return { todoLists, todos, setTodos, enabledTodoListIds, refreshFailed, fetchTodos, toggleTodoList, resync };
}

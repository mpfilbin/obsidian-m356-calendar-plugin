import { useState, useEffect, useCallback, useRef } from 'react';
import { Notice } from 'obsidian';
import { M365Calendar, M365Event, ViewType } from '../types';
import { useAppContext } from '../context';
import { getDateRange } from '../lib/datetime';
import { notifyError } from '../lib/notify';
import { isAuthError } from '../services/AuthService';

/**
 * Owns the calendar list, the enabled-calendar selection and the events for the
 * visible date range, including background refresh state.
 */
export function useEventsData(currentDate: Date, view: ViewType) {
  const { calendarService, settings: initialSettings, saveSettings } = useAppContext();
  const [calendars, setCalendars] = useState<M365Calendar[]>([]);
  const [events, setEvents] = useState<M365Event[]>([]);
  const [enabledIds, setEnabledIds] = useState<string[]>(initialSettings.enabledCalendarIds);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [refreshFailed, setRefreshFailed] = useState(false);
  // Set when the user must sign in again; shown even for background refreshes, which are otherwise quiet.
  const [authError, setAuthError] = useState<string | null>(null);
  const calendarsLoadedRef = useRef(false);
  // A response is applied only if no newer request has started, so rapid navigation
  // can't let a slow older response overwrite newer data.
  const requestRef = useRef(0);

  const fetchAll = useCallback(async (options: { reloadCalendars?: boolean; userInitiated?: boolean } = {}) => {
    const requestId = ++requestRef.current;
    const isStale = () => requestId !== requestRef.current;
    setSyncing(true);
    if (options.userInitiated) setError(null);
    setRefreshFailed(false);
    let calendarsFetchAttempted = false;
    let activeEnabledIds = enabledIds;
    try {
      if (!calendarsLoadedRef.current || options.reloadCalendars) {
        calendarsFetchAttempted = true;
        const fetchedCalendars = await calendarService.getCalendars();
        calendarsLoadedRef.current = true;
        setCalendars(fetchedCalendars);
        const fetchedIdSet = new Set(fetchedCalendars.map((c) => c.id));
        activeEnabledIds = enabledIds.filter((id) => fetchedIdSet.has(id));
        if (activeEnabledIds.length !== enabledIds.length) {
          setEnabledIds(activeEnabledIds);
          void saveSettings({ enabledCalendarIds: activeEnabledIds });
        }
      }
      if (activeEnabledIds.length > 0) {
        const { start, end } = getDateRange(currentDate, view);
        const bypassCache = !!options.reloadCalendars;
        const fetched = await calendarService.getEvents(activeEnabledIds, start, end, bypassCache);
        if (isStale()) return;
        setEvents(fetched);
      } else {
        setEvents([]);
      }
      if (options.userInitiated) setError(null);
      setAuthError(null);
    } catch (e) {
      if (calendarsFetchAttempted) calendarsLoadedRef.current = false;
      if (isStale()) return;
      if (isAuthError(e)) {
        setAuthError(e.message);
        if (options.userInitiated) new Notice(`M365 Calendar: ${e.message}`);
      } else if (options.userInitiated) {
        notifyError(e);
        setError(e instanceof Error ? e.message : 'Failed to load calendar data');
      } else {
        console.error('M365 Calendar:', e);
        setRefreshFailed(true);
      }
    } finally {
      if (!isStale()) setSyncing(false);
    }
  }, [calendarService, enabledIds, currentDate, view, saveSettings]);

  useEffect(() => {
    void fetchAll({ userInitiated: true });
  }, [fetchAll]);

  /** Forget everything held in memory and download calendars and events again, bypassing the cache. */
  const resync = useCallback(() => {
    requestRef.current++; // any request still in flight is for the old data; ignore its result
    calendarsLoadedRef.current = false;
    setCalendars([]);
    setEvents([]);
    setError(null);
    setAuthError(null);
    setRefreshFailed(false);
    void fetchAll({ reloadCalendars: true, userInitiated: true });
  }, [fetchAll]);

  const toggleCalendar = async (calendarId: string) => {
    const next = enabledIds.includes(calendarId)
      ? enabledIds.filter((id) => id !== calendarId)
      : [...enabledIds, calendarId];
    setEnabledIds(next);
    try {
      await saveSettings({ enabledCalendarIds: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
      setEnabledIds(enabledIds);
    }
  };

  return {
    calendars, events, setEvents, enabledIds,
    syncing, error, setError, authError, refreshFailed,
    fetchAll, toggleCalendar, resync,
  };
}

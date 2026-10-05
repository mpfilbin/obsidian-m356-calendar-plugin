import { createContext, useContext } from 'react';
import { App } from 'obsidian';
import { CalendarService } from './services/CalendarService';
import { WeatherService } from './services/WeatherService';
import { TodoService } from './services/TodoService';
import { M365CalendarSettings } from './types';

export interface AppContextValue {
  app: App;
  calendarService: CalendarService;
  weatherService: WeatherService;
  todoService: TodoService;
  /** Settings at the time the view was created; use `subscribeSettings` for later changes. */
  settings: M365CalendarSettings;
  /** Merges `patch` into the plugin's live settings and persists them. */
  saveSettings: (patch: Partial<M365CalendarSettings>) => Promise<void>;
  /** Called whenever settings change (e.g. from the settings tab). Returns an unsubscribe function. */
  subscribeSettings: (cb: (s: M365CalendarSettings) => void) => () => void;
  /** Called when cached weather is cleared and views should refetch. Returns an unsubscribe function. */
  subscribeWeatherRefresh: (cb: () => void) => () => void;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContext.Provider');
  return ctx;
}

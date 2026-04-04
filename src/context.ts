import { createContext, useContext } from 'react';
import { App } from 'obsidian';
import { CalendarService } from './services/CalendarService';
import { M365CalendarSettings } from './types';

export interface AppContextValue {
  app: App;
  calendarService: CalendarService;
  settings: M365CalendarSettings;
  saveSettings: (s: M365CalendarSettings) => Promise<void>;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContext.Provider');
  return ctx;
}

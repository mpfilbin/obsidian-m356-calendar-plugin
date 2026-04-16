import { createContext, useContext } from 'react';
import { App } from 'obsidian';
import { CalendarService } from './services/CalendarService';
import { WeatherService } from './services/WeatherService';
import { M365CalendarSettings } from './types';

export interface AppContextValue {
  app: App;
  calendarService: CalendarService;
  weatherService: WeatherService;
  settings: M365CalendarSettings;
  saveSettings: (s: M365CalendarSettings) => Promise<void>;
  registerWeatherRefresh: (cb: () => void) => void;
}

export const AppContext = createContext<AppContextValue | undefined>(undefined);

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useAppContext must be used within AppContext.Provider');
  return ctx;
}

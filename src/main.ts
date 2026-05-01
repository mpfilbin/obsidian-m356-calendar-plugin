import { Plugin, WorkspaceLeaf } from 'obsidian';
import { AuthService } from './services/AuthService';
import { CalendarService } from './services/CalendarService';
import { CacheService } from './services/CacheService';
import { WeatherService } from './services/WeatherService';
import { WeatherCacheService, WEATHER_CACHE_KEY } from './services/WeatherCacheService';
import { TodoService } from './services/TodoService';
import { M365CalendarSettingTab, DEFAULT_SETTINGS } from './settings';
import { M365CalendarView, VIEW_TYPE_M365_CALENDAR } from './view';
import { M365CalendarSettings, CacheStore, WeatherCacheStore } from './types';

export default class M365CalendarPlugin extends Plugin {
  settings!: M365CalendarSettings;
  authService!: AuthService;
  private calendarService!: CalendarService;
  private cacheService!: CacheService;
  private weatherCacheService!: WeatherCacheService;
  private weatherService!: WeatherService;
  private todoService!: TodoService;
  private saveDataQueue: Promise<void> = Promise.resolve();
  private weatherRefreshHandler: (() => void) | null = null;

  // Serialize all saveData calls so concurrent writes (cache, weatherCache, settings)
  // never clobber each other with a stale read-modify-write.
  private queueSave(patch: Record<string, unknown>): Promise<void> {
    const next = this.saveDataQueue.then(async () => {
      const data = (await this.loadData()) ?? {};
      await this.saveData({ ...data, ...patch });
    });
    this.saveDataQueue = next.catch(() => {});
    return next;
  }

  async onload(): Promise<void> {
    await this.loadSettings();

    this.cacheService = new CacheService(
      async () => {
        const data = await this.loadData();
        return (data?.cache as CacheStore) ?? {};
      },
      async (cache) => this.queueSave({ cache }),
    );
    await this.cacheService.init();

    this.weatherCacheService = new WeatherCacheService(
      async () => {
        const data = await this.loadData();
        return (data?.[WEATHER_CACHE_KEY] as WeatherCacheStore) ?? {};
      },
      async (weatherCache) => this.queueSave({ [WEATHER_CACHE_KEY]: weatherCache }),
    );
    await this.weatherCacheService.init();

    this.weatherService = new WeatherService(
      () => this.settings.openWeatherApiKey,
      () => this.settings.weatherLocation,
      () => this.settings.weatherUnits,
      this.weatherCacheService,
    );

    this.authService = new AuthService(
      () => this.settings.clientId,
      () => this.settings.tenantId,
      (name) => this.app.secretStorage.getSecret(name),
      async (name, value) => { await this.app.secretStorage.setSecret(name, value); },
    );

    this.calendarService = new CalendarService(this.authService, this.cacheService);

    this.todoService = new TodoService(this.authService);

    this.registerView(VIEW_TYPE_M365_CALENDAR, (leaf) => {
      return new M365CalendarView(leaf, {
        app: this.app,
        calendarService: this.calendarService,
        weatherService: this.weatherService,
        todoService: this.todoService,
        settings: this.settings,
        saveSettings: async (s) => {
          this.settings = s;
          await this.saveSettings();
        },
        registerWeatherRefresh: (cb) => { this.weatherRefreshHandler = cb; },
      });
    });

    this.addRibbonIcon('calendar', 'Open M365 calendar', () => { // eslint-disable-line obsidianmd/ui/sentence-case
      void this.activateView();
    });

    this.addCommand({
      id: 'open-calendar',
      name: 'Open calendar',
      callback: () => void this.activateView(),
    });

    this.addSettingTab(new M365CalendarSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    
  }

  async clearWeatherCache(): Promise<void> {
    await this.weatherCacheService.clearAll();
    this.weatherRefreshHandler?.();
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings as Partial<M365CalendarSettings>);
  }

  async saveSettings(): Promise<void> {
    await this.queueSave({ settings: this.settings });
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_M365_CALENDAR);
    let leaf: WorkspaceLeaf;
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf('tab');
      await leaf.setViewState({ type: VIEW_TYPE_M365_CALENDAR, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}

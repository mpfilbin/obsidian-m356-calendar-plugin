import { Plugin, WorkspaceLeaf } from 'obsidian';
import { AuthService } from './services/AuthService';
import { CalendarService } from './services/CalendarService';
import { CacheService } from './services/CacheService';
import { M365CalendarSettingTab, DEFAULT_SETTINGS } from './settings';
import { M365CalendarView, VIEW_TYPE_M365_CALENDAR } from './view';
import { M365CalendarSettings, CacheStore } from './types';

export default class M365CalendarPlugin extends Plugin {
  settings!: M365CalendarSettings;
  authService!: AuthService;
  private calendarService!: CalendarService;
  private cacheService!: CacheService;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.cacheService = new CacheService(
      async () => {
        const data = await this.loadData();
        return (data?.cache as CacheStore) ?? {};
      },
      async (cache) => {
        const data = (await this.loadData()) ?? {};
        await this.saveData({ ...data, cache });
      },
    );
    await this.cacheService.init();

    this.authService = new AuthService(
      this.settings.clientId,
      this.settings.tenantId,
      (name) => this.app.secretStorage.getSecret(name),
      async (name, value) => { await this.app.secretStorage.setSecret(name, value); },
      this.settings.tokenSecretName,
    );

    this.calendarService = new CalendarService(this.authService, this.cacheService);

    this.registerView(VIEW_TYPE_M365_CALENDAR, (leaf) => {
      return new M365CalendarView(leaf, {
        app: this.app,
        calendarService: this.calendarService,
        settings: this.settings,
        saveSettings: async (s) => {
          this.settings = s;
          await this.saveSettings();
        },
      });
    });

    this.addRibbonIcon('calendar', 'Open M365 Calendar', () => {
      void this.activateView();
    });

    this.addCommand({
      id: 'open-m365-calendar',
      name: 'Open M365 Calendar',
      callback: () => void this.activateView(),
    });

    this.addSettingTab(new M365CalendarSettingTab(this.app, this));
  }

  async onunload(): Promise<void> {
    this.app.workspace.detachLeavesOfType(VIEW_TYPE_M365_CALENDAR);
  }

  async loadSettings(): Promise<void> {
    const data = await this.loadData();
    this.settings = Object.assign({}, DEFAULT_SETTINGS, data?.settings as Partial<M365CalendarSettings>);
  }

  async saveSettings(): Promise<void> {
    const data = (await this.loadData()) ?? {};
    await this.saveData({ ...data, settings: this.settings });
  }

  private async activateView(): Promise<void> {
    const { workspace } = this.app;
    const leaves = workspace.getLeavesOfType(VIEW_TYPE_M365_CALENDAR);
    let leaf: WorkspaceLeaf;
    if (leaves.length > 0) {
      leaf = leaves[0];
    } else {
      leaf = workspace.getLeaf(true);
      await leaf.setViewState({ type: VIEW_TYPE_M365_CALENDAR, active: true });
    }
    workspace.revealLeaf(leaf);
  }
}

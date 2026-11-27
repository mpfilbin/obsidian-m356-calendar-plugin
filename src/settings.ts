import {
  App,
  type ButtonComponent,
  Notice,
  PluginSettingTab,
  Setting,
  type SettingDefinition,
  type SettingDefinitionItem,
  type SettingGroup,
} from 'obsidian';
import M365CalendarPlugin from './main';
import { M365CalendarSettings } from './types';
import { appLogger } from './lib/logger';

export const DEFAULT_SETTINGS: M365CalendarSettings = {
  clientId: '',
  tenantId: 'common',
  enabledCalendarIds: [],
  defaultCalendarId: '',
  refreshIntervalMinutes: 10,
  defaultView: 'month',
  weatherEnabled: false,
  openWeatherApiKey: '',
  weatherLocation: '',
  weatherUnits: 'imperial',
  sidebarCollapsed: false,
  enabledTodoListIds: [],
  debugLogging: false,
  mapsEnabled: true,
  showEmailDetails: false,
};

/**
 * The settings tab is described once, as `getSettingDefinitions()`. Obsidian 1.13+ renders (and
 * indexes for settings search) that list itself and never calls `display()`. `minAppVersion` is
 * older than that, so `display()` draws the same definitions imperatively for earlier versions.
 */
export class M365CalendarSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: M365CalendarPlugin) {
    super(app, plugin);
  }

  getControlValue(key: string): unknown {
    return (this.plugin.settings as unknown as Record<string, unknown>)[key];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const settings = this.plugin.settings;
    switch (key) {
      case 'clientId':
        settings.clientId = String(value).trim();
        break;
      case 'tenantId':
        settings.tenantId = String(value).trim() || 'common';
        break;
      case 'defaultView':
        settings.defaultView = value as M365CalendarSettings['defaultView'];
        break;
      case 'refreshIntervalMinutes':
        settings.refreshIntervalMinutes = Number(value);
        break;
      case 'weatherEnabled':
        settings.weatherEnabled = Boolean(value);
        break;
      case 'openWeatherApiKey':
        settings.openWeatherApiKey = String(value).trim();
        break;
      case 'weatherLocation':
        settings.weatherLocation = String(value).trim();
        break;
      case 'weatherUnits':
        settings.weatherUnits = value as M365CalendarSettings['weatherUnits'];
        break;
      case 'mapsEnabled':
        settings.mapsEnabled = Boolean(value);
        break;
      case 'showEmailDetails':
        settings.showEmailDetails = Boolean(value);
        break;
      case 'debugLogging':
        settings.debugLogging = Boolean(value);
        break;
      default:
        return;
    }
    await this.plugin.saveSettings();
    if (key === 'showEmailDetails' && value) {
      new Notice('M365 Calendar: Sign out and sign in again to grant the Mail.Read permission.');
    }
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        type: 'group',
        heading: 'Microsoft 365 authentication',
        items: [
          {
            name: 'Redirect URI',
            desc: 'Your Azure AD app must have this redirect URI registered under Mobile and desktop applications. If you previously used this plugin, update your Azure AD app registration and sign out, then sign back in.',  
            render: (setting) => {
              setting.controlEl.createEl('code', { text: 'obsidian://m365-callback' });
            },
          },
          {
            name: 'Client ID',
            desc: 'Azure AD application (client) ID.',
            control: { type: 'text', key: 'clientId', placeholder: 'xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx' },
          },
          {
            name: 'Tenant ID',
            desc: 'Use "common" for personal + work accounts.',
            control: { type: 'text', key: 'tenantId', placeholder: 'common' },
          },
          {
            name: 'Sign in / sign out',
            desc: 'Authenticate with your Microsoft account. After changing the Client ID or Tenant ID, sign out and sign in again to apply the new credentials.',  
            render: (setting) => this.renderSignIn(setting),
          },
        ],
      },
      {
        type: 'group',
        heading: 'Calendar',
        items: [
          {
            name: 'Default view',
            control: {
              type: 'dropdown',
              key: 'defaultView',
              options: { month: 'Month', week: 'Week', agenda: 'Agenda' },
            },
          },
          {
            name: 'Background refresh interval (minutes)',
            control: { type: 'slider', key: 'refreshIntervalMinutes', min: 1, max: 60, step: 1 },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Weather',
        items: [
          {
            name: 'Show weather',
            desc: 'Display weather conditions in calendar views. Requires an OpenWeather API key.',  
            control: { type: 'toggle', key: 'weatherEnabled' },
          },
          {
            name: 'OpenWeather API key',  
            desc: 'One Call API 3.0 key from openweathermap.org.',  
            // A custom row, not a `secret` control: that one stores a SecretStorage reference rather than the key.
            render: (setting) => {
              setting.addText((text) => {
                text.inputEl.type = 'password';
                return text
                  .setPlaceholder('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
                  .setValue(String(this.getControlValue('openWeatherApiKey') ?? ''))
                  .onChange((value) => this.setControlValue('openWeatherApiKey', value));
              });
            },
          },
          {
            name: 'Location',
            desc: 'City and country code, e.g. "New York, US" or "London, GB".',  
            control: {
              type: 'text',
              key: 'weatherLocation',
              placeholder: 'New York, US',  
            },
          },
          {
            name: 'Test connection',
            desc: 'Check the API key and location, and show which place the location resolves to.',
            render: (setting) => {
              setting.addButton((button) =>
                button.setButtonText('Test').onClick(async () => {
                  button.setDisabled(true);
                  try {
                    const result = await this.plugin.testWeatherConnection();
                    new Notice(`M365 Calendar weather: ${result.message}`, result.ok ? 5000 : 10000);
                  } finally {
                    button.setDisabled(false);
                  }
                }),
              );
            },
          },
          {
            name: 'Temperature units',
            control: {
              type: 'dropdown',
              key: 'weatherUnits',
              options: {
                imperial: 'Fahrenheit (°F)',  
                metric: 'Celsius (°C)',  
              },
            },
          },
          {
            name: 'Clear weather cache',
            desc: 'Purge all cached weather data and fetch fresh data from OpenWeather.',  
            render: (setting) => {
              setting.addButton((button) =>
                button.setButtonText('Clear cache').onClick(async () => {
                  await this.plugin.clearWeatherCache();
                  new Notice('Weather cache cleared');
                }),
              );
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Maps',
        items: [
          {
            name: 'Show event locations on a map',
            desc: 'Adds a map to the new and edit event dialogs. To place a location, its text is sent to OpenStreetMap (nominatim.openstreetmap.org) and the map is loaded from openstreetmap.org. Turn off to keep locations on your device.',  
            control: { type: 'toggle', key: 'mapsEnabled' },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Flagged emails',
        items: [
          {
            name: 'Show email details on flagged-email tasks',
            desc: 'When you open a task that came from a flagged email, show the email\'s sender, date and text. This adds the Mail.Read permission (read-only) to the sign-in request: add it to your Azure app registration first, then sign out and sign in again. Turn off to keep email content out of the plugin.',
            control: { type: 'toggle', key: 'showEmailDetails' },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Calendar data',
        items: [
          {
            name: 'Purge calendar and task data',
            desc: 'Delete all locally stored calendar events, tasks and sync information, then download your calendars, events and tasks again from Microsoft 365. Your settings and sign-in are kept.',
            render: (setting) => {
              setting.addButton((button) =>
                button
                  .setButtonText('Purge and resync')
                  .setWarning()
                  .onClick(async () => {
                    button.setDisabled(true);
                    try {
                      await this.plugin.purgeCalendarData();
                      new Notice('Calendar and task data purged. Resyncing…');
                    } catch (e) {
                      appLogger.error('[M365 Calendar] Purge failed', e);
                      new Notice('M365 Calendar: Could not purge calendar data. Check the developer console for details.'); // eslint-disable-line obsidianmd/ui/sentence-case
                    } finally {
                      button.setDisabled(false);
                    }
                  }),
              );
            },
          },
        ],
      },
      {
        type: 'group',
        heading: 'Advanced',
        items: [
          {
            name: 'Debug logging',
            desc: 'Log HTTP requests and responses to the developer console (Ctrl+Shift+I). Disable when not needed.',
            control: { type: 'toggle', key: 'debugLogging' },
          },
        ],
      },
    ];
  }

  private renderSignIn(setting: Setting): void {
    let signInBtn!: ButtonComponent;

    setting
      .addButton((btn) => {
        signInBtn = btn
          .setButtonText('Sign in')
          .setCta()
          .onClick(async () => {
            signInBtn.setDisabled(true);
            try {
              await this.plugin.authService.signIn();
              signInBtn.setDisabled(true); // signed in now; stays disabled until sign-out
              new Notice('M365 Calendar: Signed in.'); // eslint-disable-line obsidianmd/ui/sentence-case
            } catch (e) {
              signInBtn.setDisabled(false);
              appLogger.error('[M365 Calendar] Sign in failed', e);
              new Notice('M365 Calendar: Sign in failed. Check the developer console for details.'); // eslint-disable-line obsidianmd/ui/sentence-case
            }
          });
      })
      .addButton((btn) =>
        btn.setButtonText('Sign out').onClick(async () => {
          try {
            await this.plugin.authService.signOut();
            signInBtn.setDisabled(false);
          } catch (e) {
            appLogger.error('[M365 Calendar] Sign out failed', e);
            new Notice('M365 Calendar: Sign out failed. Check the developer console for details.'); // eslint-disable-line obsidianmd/ui/sentence-case
          }
        }),
      );

    // Reflect the current auth state: disable Sign in if already authenticated. The button is
    // captured above, so this applies to the one rendered by this call, not a later re-render.
    const renderedSignInBtn = signInBtn;
    void this.plugin.authService.isAuthenticated().then((authenticated) => {
      renderedSignInBtn.setDisabled(authenticated);
    });
  }

  /** Fallback for Obsidian < 1.13, which has no declarative settings: draws the same definitions. */
  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    for (const item of this.getSettingDefinitions()) {
      if ('type' in item && item.type === 'group') {
        new Setting(containerEl).setName(item.heading ?? '').setHeading();
        for (const child of item.items ?? []) {
          if (!('type' in child && child.type === 'page')) this.displayDefinition(containerEl, child);
        }
      }
    }
  }

  private displayDefinition(containerEl: HTMLElement, def: SettingDefinition): void {
    const setting = new Setting(containerEl).setName(def.name);
    if (def.desc) setting.setDesc(def.desc);

    if (def.render) {
      // This tab's render callbacks never use the group, which only exists on 1.13+.
      def.render(setting, undefined as unknown as SettingGroup);
      return;
    }
    if (!def.control) return;

    const control = def.control;
    const value = this.getControlValue(control.key);
    switch (control.type) {
      case 'text':
        setting.addText((text) =>
          text
            .setPlaceholder(control.placeholder ?? '')
            .setValue(String(value ?? ''))
            .onChange((v) => this.setControlValue(control.key, v)),
        );
        break;
      case 'toggle':
        setting.addToggle((toggle) =>
          toggle.setValue(Boolean(value)).onChange((v) => this.setControlValue(control.key, v)),
        );
        break;
      case 'dropdown':
        setting.addDropdown((dropdown) => {
          for (const [optionValue, label] of Object.entries(control.options)) {
            dropdown.addOption(optionValue, label);
          }
          return dropdown.setValue(String(value)).onChange((v) => this.setControlValue(control.key, v));
        });
        break;
      case 'slider':
        setting.addSlider((slider) =>
          slider
            .setLimits(control.min, control.max, control.step)
            .setValue(Number(value))
            .setDynamicTooltip()
            .onChange((v) => this.setControlValue(control.key, v)),
        );
        break;
    }
  }
}

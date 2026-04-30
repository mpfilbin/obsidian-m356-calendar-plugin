import { App, type ButtonComponent, Notice, PluginSettingTab, Setting } from 'obsidian';
import M365CalendarPlugin from './main';
import { M365CalendarSettings } from './types';

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
};

export class M365CalendarSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: M365CalendarPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Microsoft 365 authentication').setHeading();

    new Setting(containerEl)
      .setDesc('After changing the Client ID or Tenant ID, sign out and sign in again to apply the new credentials.'); // eslint-disable-line obsidianmd/ui/sentence-case

    new Setting(containerEl)
      .setName('Client ID')
      .setDesc('Azure AD application (client) ID.') // eslint-disable-line obsidianmd/ui/sentence-case
      .addText((text) =>
        text
          .setPlaceholder('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx') // eslint-disable-line obsidianmd/ui/sentence-case
          .setValue(this.plugin.settings.clientId)
          .onChange(async (value) => {
            this.plugin.settings.clientId = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Tenant ID')
      .setDesc('Use "common" for personal + work accounts.')
      .addText((text) =>
        text
          .setPlaceholder('common') // eslint-disable-line obsidianmd/ui/sentence-case
          .setValue(this.plugin.settings.tenantId)
          .onChange(async (value) => {
            this.plugin.settings.tenantId = value.trim() || 'common';
            await this.plugin.saveSettings();
          }),
      );

    let signInBtn!: ButtonComponent;

    new Setting(containerEl)
      .setName('Sign in / sign out')
      .setDesc('Authenticate with your Microsoft account.') // eslint-disable-line obsidianmd/ui/sentence-case
      .addButton((btn) => {
        signInBtn = btn
          .setButtonText('Sign in')
          .setCta()
          .onClick(async () => {
            signInBtn.setDisabled(true);
            try {
              await this.plugin.authService.signIn();
              new Notice('M365 Calendar: Signed in.'); // eslint-disable-line obsidianmd/ui/sentence-case
              this.display();
            } catch (e) {
              signInBtn.setDisabled(false);
              console.error('M365 Calendar: Sign in failed', e);
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
            console.error('M365 Calendar: Sign out failed', e);
            new Notice('M365 Calendar: Sign out failed. Check the developer console for details.'); // eslint-disable-line obsidianmd/ui/sentence-case
          }
        }),
      );

    // Reflect current auth state — disable Sign In if already authenticated.
    // Capture signInBtn in a const so this callback is bound to the button
    // instance created in this render, not any future re-render.
    const currentSignInBtn = signInBtn;
    void this.plugin.authService.isAuthenticated().then((authenticated) => {
      currentSignInBtn.setDisabled(authenticated);
    });

    new Setting(containerEl).setName('Calendar').setHeading();

    new Setting(containerEl)
      .setName('Default view')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('month', 'Month')
          .addOption('week', 'Week')
          .setValue(this.plugin.settings.defaultView)
          .onChange(async (value) => {
            this.plugin.settings.defaultView = value as 'month' | 'week';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Background refresh interval (minutes)')
      .addSlider((slider) =>
        slider
          .setLimits(1, 60, 1)
          .setValue(this.plugin.settings.refreshIntervalMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            this.plugin.settings.refreshIntervalMinutes = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl).setName('Weather').setHeading();

    new Setting(containerEl)
      .setName('Show weather')
      .setDesc('Display weather conditions in calendar views. Requires an OpenWeather API key.') // eslint-disable-line obsidianmd/ui/sentence-case
      .addToggle((toggle) =>
        toggle
          .setValue(this.plugin.settings.weatherEnabled)
          .onChange(async (value) => {
            this.plugin.settings.weatherEnabled = value;
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('OpenWeather API key') // eslint-disable-line obsidianmd/ui/sentence-case
      .setDesc('One Call API 3.0 key from openweathermap.org.') // eslint-disable-line obsidianmd/ui/sentence-case
      .addText((text) => {
        text.inputEl.type = 'password';
        return text
          .setPlaceholder('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx') // eslint-disable-line obsidianmd/ui/sentence-case
          .setValue(this.plugin.settings.openWeatherApiKey)
          .onChange(async (value) => {
            this.plugin.settings.openWeatherApiKey = value.trim();
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName('Location')
      .setDesc('City and country code, e.g. "New York, US" or "London, GB".') // eslint-disable-line obsidianmd/ui/sentence-case
      .addText((text) =>
        text
          .setPlaceholder('New York, US') // eslint-disable-line obsidianmd/ui/sentence-case
          .setValue(this.plugin.settings.weatherLocation)
          .onChange(async (value) => {
            this.plugin.settings.weatherLocation = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Temperature units')
      .addDropdown((dropdown) =>
        dropdown
          .addOption('imperial', 'Fahrenheit (°F)') // eslint-disable-line obsidianmd/ui/sentence-case
          .addOption('metric', 'Celsius (°C)') // eslint-disable-line obsidianmd/ui/sentence-case
          .setValue(this.plugin.settings.weatherUnits)
          .onChange(async (value) => {
            this.plugin.settings.weatherUnits = value as 'imperial' | 'metric';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Clear weather cache')
      .setDesc('Purge all cached weather data and fetch fresh data from OpenWeather.') // eslint-disable-line obsidianmd/ui/sentence-case
      .addButton((button) =>
        button
          .setButtonText('Clear cache')
          .onClick(async () => {
            await this.plugin.clearWeatherCache();
            new Notice('Weather cache cleared');
          }),
      );
  }
}

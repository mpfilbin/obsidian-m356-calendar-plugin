import { App, PluginSettingTab, SecretComponent, Setting } from 'obsidian';
import M365CalendarPlugin from './main';
import { M365CalendarSettings } from './types';

export const DEFAULT_SETTINGS: M365CalendarSettings = {
  clientId: '',
  tenantId: 'common',
  tokenSecretName: 'm365-calendar-token',
  enabledCalendarIds: [],
  defaultCalendarId: '',
  refreshIntervalMinutes: 10,
  defaultView: 'month',
};

export class M365CalendarSettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: M365CalendarPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl).setName('Microsoft 365 Authentication').setHeading();

    new Setting(containerEl)
      .setName('Client ID')
      .setDesc('Azure AD application (client) ID. Restart plugin after changing.')
      .addText((text) =>
        text
          .setPlaceholder('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
          .setValue(this.plugin.settings.clientId)
          .onChange(async (value) => {
            this.plugin.settings.clientId = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('Tenant ID')
      .setDesc('Use "common" for personal + work accounts. Restart plugin after changing.')
      .addText((text) =>
        text
          .setPlaceholder('common')
          .setValue(this.plugin.settings.tenantId)
          .onChange(async (value) => {
            this.plugin.settings.tenantId = value.trim() || 'common';
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName('OAuth Token')
      .setDesc('Token stored securely in SecretStorage — not in data.json.')
      .addComponent(
        (el) =>
          new SecretComponent(this.app, el)
            .setValue(this.plugin.settings.tokenSecretName)
            .onChange(async (value) => {
              this.plugin.settings.tokenSecretName = value;
              await this.plugin.saveSettings();
            }),
      );

    new Setting(containerEl)
      .setName('Sign In / Sign Out')
      .setDesc('Authenticate with your Microsoft account.')
      .addButton((btn) =>
        btn
          .setButtonText('Sign In')
          .setCta()
          .onClick(async () => {
            try {
              await this.plugin.authService.signIn();
            } catch (e) {
              console.error('M365 Calendar: Sign in failed', e);
            }
          }),
      )
      .addButton((btn) =>
        btn.setButtonText('Sign Out').onClick(async () => {
          try {
            await this.plugin.authService.signOut();
          } catch (e) {
            console.error('M365 Calendar: Sign out failed', e);
          }
        }),
      );

    new Setting(containerEl).setName('Calendar Settings').setHeading();

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
  }
}

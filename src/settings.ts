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

    let signInBtn: ButtonComponent;

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

    // Reflect current auth state — disable Sign In if already authenticated
    void this.plugin.authService.isAuthenticated().then((authenticated) => {
      signInBtn.setDisabled(authenticated);
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
  }
}

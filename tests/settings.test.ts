import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { M365CalendarSettingTab, DEFAULT_SETTINGS } from '../src/settings';
import { Notice } from 'obsidian';
import { _getSettingInstances, _clearSettingInstances } from './__mocks__/obsidian';
import type M365CalendarPlugin from '../src/main';

describe('M365CalendarSettingTab', () => {
  let tab: M365CalendarSettingTab;
  let mockPlugin: {
    settings: typeof DEFAULT_SETTINGS;
    saveSettings: ReturnType<typeof vi.fn>;
    authService: {
      signIn: ReturnType<typeof vi.fn>;
      signOut: ReturnType<typeof vi.fn>;
      isAuthenticated: ReturnType<typeof vi.fn>;
    };
    clearWeatherCache: ReturnType<typeof vi.fn>;
    testWeatherConnection: ReturnType<typeof vi.fn>;
    purgeCalendarData: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    _clearSettingInstances();
    vi.clearAllMocks();
    mockPlugin = {
      settings: { ...DEFAULT_SETTINGS },
      saveSettings: vi.fn().mockResolvedValue(undefined),
      authService: {
        signIn: vi.fn().mockResolvedValue(undefined),
        signOut: vi.fn().mockResolvedValue(undefined),
        isAuthenticated: vi.fn().mockResolvedValue(false),
      },
      clearWeatherCache: vi.fn().mockResolvedValue(undefined),
      purgeCalendarData: vi.fn().mockResolvedValue(undefined),
      testWeatherConnection: vi.fn().mockResolvedValue({ ok: true, message: 'Connected. Weather will be shown for London, GB.' }),
    };
    tab = new M365CalendarSettingTab(
      {} as InstanceType<typeof import('obsidian').App>,
      mockPlugin as unknown as M365CalendarPlugin,
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('sign in / sign out', () => {
    const signInRow = () => _getSettingInstances().find((s) => s.buttons.length === 2)!;

    it('shows a success notice after sign-in and keeps the button disabled', async () => {
      tab.display();
      const [signIn] = signInRow().buttons;
      await signIn.simulateClick();

      expect(mockPlugin.authService.signIn).toHaveBeenCalledTimes(1);
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Signed in'));
      expect(signIn.disabled).toBe(true);
    });

    it('re-enables sign-in when it fails', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPlugin.authService.signIn.mockRejectedValue(new Error('denied'));
      tab.display();
      const [signIn] = signInRow().buttons;
      await signIn.simulateClick();

      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Sign in failed'));
      expect(signIn.disabled).toBe(false);
    });

    it('disables sign-in on render when already authenticated', async () => {
      mockPlugin.authService.isAuthenticated.mockResolvedValue(true);
      tab.display();
      await Promise.resolve();
      expect(signInRow().buttons[0].disabled).toBe(true);
    });

    it('re-enables sign-in after signing out', async () => {
      mockPlugin.authService.isAuthenticated.mockResolvedValue(true);
      tab.display();
      await Promise.resolve();
      const [signIn, signOut] = signInRow().buttons;
      await signOut.simulateClick();

      expect(mockPlugin.authService.signOut).toHaveBeenCalledTimes(1);
      expect(signIn.disabled).toBe(false);
    });
  });

  it('shows the result of the weather connection test in a notice', async () => {
    tab.display();
    const testSetting = _getSettingInstances().find(
      (s) => s.buttons.length === 1 && s.name === 'Test connection',
    );
    expect(testSetting).toBeDefined();
    await testSetting!.buttons[0].simulateClick();
    expect(mockPlugin.testWeatherConnection).toHaveBeenCalledTimes(1);
    expect(Notice).toHaveBeenCalledWith(expect.stringContaining('London, GB'), 5000);
  });

  describe('purge calendar and task data', () => {
    const purgeButton = () =>
      _getSettingInstances().find((s) => s.name === 'Purge calendar and task data')!.buttons[0];

    it('purges stored calendar data and tells the user it is resyncing', async () => {
      tab.display();
      await purgeButton().simulateClick();
      expect(mockPlugin.purgeCalendarData).toHaveBeenCalledTimes(1);
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Resyncing'));
    });

    it('is separate from the weather cache button and does not touch it', async () => {
      tab.display();
      await purgeButton().simulateClick();
      expect(mockPlugin.clearWeatherCache).not.toHaveBeenCalled();
    });

    it('reports a failure instead of claiming success', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {});
      mockPlugin.purgeCalendarData.mockRejectedValue(new Error('disk full'));
      tab.display();
      await purgeButton().simulateClick();
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Could not purge'));
      expect(Notice).not.toHaveBeenCalledWith(expect.stringContaining('Resyncing'));
    });
  });

  describe('maps setting', () => {
    const mapsToggle = () => _getSettingInstances().find((s) => s.name === 'Show event locations on a map')!.toggles[0];

    it('is on by default and discloses that locations go to OpenStreetMap', () => {
      expect(DEFAULT_SETTINGS.mapsEnabled).toBe(true);
      tab.display();
      const setting = _getSettingInstances().find((s) => s.name === 'Show event locations on a map');
      expect(setting?.desc).toContain('OpenStreetMap');
      expect(setting?.desc).toContain('Turn off');
    });

    it('saves the choice when toggled', async () => {
      tab.display();
      await mapsToggle().simulateChange(false);
      expect(mockPlugin.settings.mapsEnabled).toBe(false);
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(1);

      await mapsToggle().simulateChange(true);
      expect(mockPlugin.settings.mapsEnabled).toBe(true);
    });
  });

  describe('setting definitions (Obsidian 1.13+)', () => {
    type Def = { name: string; control?: { key: string; type: string }; render?: unknown };
    const allDefinitions = (): Def[] =>
      (tab.getSettingDefinitions() as Array<{ type: string; items?: Def[] }>)
        .filter((item) => item.type === 'group')
        .flatMap((group) => group.items ?? []);

    it('describes every setting in named groups', () => {
      const groups = tab.getSettingDefinitions() as Array<{ type: string; heading?: string }>;
      expect(groups.map((g) => g.heading)).toEqual([
        'Microsoft 365 authentication',
        'Calendar',
        'Weather',
        'Maps',
        'Flagged emails',
        'Calendar data',
        'Advanced',
      ]);
      expect(groups.every((g) => g.type === 'group')).toBe(true);
    });

    it('binds each plain control to a key that exists in the settings', () => {
      const controls = allDefinitions().filter((d) => d.control);
      expect(controls.length).toBeGreaterThan(0);
      for (const def of controls) {
        expect(Object.keys(DEFAULT_SETTINGS)).toContain(def.control!.key);
        expect(tab.getControlValue(def.control!.key)).toBe(DEFAULT_SETTINGS[def.control!.key as keyof typeof DEFAULT_SETTINGS]);
      }
    });

    it('gives every setting a unique name so it can be found by search', () => {
      const names = allDefinitions().map((d) => d.name);
      expect(names.every((n) => n.length > 0)).toBe(true);
      expect(new Set(names).size).toBe(names.length);
    });

    it('renders the same settings in the legacy display() as the definitions describe', () => {
      tab.display();
      const rendered = _getSettingInstances().map((s) => s.name);
      for (const def of allDefinitions()) expect(rendered).toContain(def.name);
    });
  });

  describe('setControlValue', () => {
    it('trims text values and saves', async () => {
      await tab.setControlValue('clientId', '  abc-123  ');
      expect(mockPlugin.settings.clientId).toBe('abc-123');
      await tab.setControlValue('weatherLocation', ' London, GB ');
      expect(mockPlugin.settings.weatherLocation).toBe('London, GB');
      await tab.setControlValue('openWeatherApiKey', ' key ');
      expect(mockPlugin.settings.openWeatherApiKey).toBe('key');
      expect(mockPlugin.saveSettings).toHaveBeenCalledTimes(3);
    });

    it('falls back to "common" when the tenant ID is cleared', async () => {
      await tab.setControlValue('tenantId', '   ');
      expect(mockPlugin.settings.tenantId).toBe('common');
    });

    it('stores the view, units, refresh interval and toggles', async () => {
      await tab.setControlValue('defaultView', 'agenda');
      await tab.setControlValue('weatherUnits', 'metric');
      await tab.setControlValue('refreshIntervalMinutes', 30);
      await tab.setControlValue('weatherEnabled', true);
      await tab.setControlValue('debugLogging', true);
      expect(mockPlugin.settings).toMatchObject({
        defaultView: 'agenda',
        weatherUnits: 'metric',
        refreshIntervalMinutes: 30,
        weatherEnabled: true,
        debugLogging: true,
      });
    });

    it('ignores unknown keys without saving', async () => {
      await tab.setControlValue('enabledCalendarIds', ['x']);
      expect(mockPlugin.settings.enabledCalendarIds).toEqual([]);
      expect(mockPlugin.saveSettings).not.toHaveBeenCalled();
    });

    it('tells the user to sign in again when email details are turned on, not off', async () => {
      await tab.setControlValue('showEmailDetails', true);
      expect(mockPlugin.settings.showEmailDetails).toBe(true);
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Mail.Read'));

      vi.mocked(Notice).mockClear();
      await tab.setControlValue('showEmailDetails', false);
      expect(mockPlugin.settings.showEmailDetails).toBe(false);
      expect(Notice).not.toHaveBeenCalled();
    });
  });

  describe('API key field', () => {
    it('is masked and saves the trimmed value as it is typed', async () => {
      tab.display();
      const row = _getSettingInstances().find((s) => s.name === 'OpenWeather API key')!;
      expect(row.texts[0].inputEl.type).toBe('password');
      await row.texts[0].simulateChange('  secret  ');
      expect(mockPlugin.settings.openWeatherApiKey).toBe('secret');
    });
  });
});

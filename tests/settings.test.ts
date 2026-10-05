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

  it('refreshes the settings pane and shows a success notice after sign-in', async () => {
    const displaySpy = vi.spyOn(tab, 'display');
    tab.display(); // initial render — populates _getSettingInstances()
    displaySpy.mockClear(); // don't count the initial call

    // The Sign In / Sign Out row is the only Setting with exactly 2 buttons
    const settings = _getSettingInstances();
    const signInSetting = settings.find((s) => s.buttons.length === 2);
    expect(signInSetting).toBeDefined();

    const signInButton = signInSetting!.buttons[0]; // first button = Sign In
    await signInButton.simulateClick();

    expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Signed in'));
    expect(displaySpy).toHaveBeenCalledTimes(1);
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
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Menu, Notice, Platform, type App } from 'obsidian';
import { canOpenInWebViewer, openInDefaultBrowser, openInWebViewer, showLinkMenu } from '../../src/lib/openLink';

type MenuMock = { items: { title: string; icon: string; onClick: () => void }[] };

function makeApp(opts: { enabled?: boolean | 'unknown'; setViewState?: ReturnType<typeof vi.fn> } = {}) {
  const setViewState = opts.setViewState ?? vi.fn().mockResolvedValue(undefined);
  const getLeaf = vi.fn().mockReturnValue({ setViewState });
  const app = { workspace: { getLeaf } } as Record<string, unknown>;
  if (opts.enabled !== 'unknown') {
    app.internalPlugins = { getEnabledPluginById: vi.fn().mockReturnValue(opts.enabled === false ? null : {}) };
  }
  return { app: app as unknown as App, getLeaf, setViewState };
}

/** Opens the menu for a link and returns the (mock) Menu it built. */
function openMenu(app: App, onOpenedInViewer?: () => void) {
  const shown: MenuMock[] = [];
  const show = vi.spyOn(Menu.prototype as unknown as { showAtMouseEvent: (e: MouseEvent) => unknown }, 'showAtMouseEvent')
    .mockImplementation(function (this: unknown) { shown.push(this as MenuMock); return this; });
  showLinkMenu(app, 'https://example.com/x', new MouseEvent('contextmenu'), onOpenedInViewer);
  show.mockRestore();
  return shown[0];
}

describe('openLink', () => {
  let windowOpen: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    Platform.isDesktopApp = true;
    windowOpen = vi.fn();
    vi.stubGlobal('open', windowOpen);
    vi.mocked(Notice).mockClear?.();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  describe('openInDefaultBrowser', () => {
    it('opens an https link', () => {
      openInDefaultBrowser('https://example.com');
      expect(windowOpen).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
    });

    it('refuses anything that is not http(s) with a host', () => {
      openInDefaultBrowser('javascript:alert(1)');
      openInDefaultBrowser('obsidian://open?vault=x');
      openInDefaultBrowser('https:///evil.example');
      expect(windowOpen).not.toHaveBeenCalled();
    });
  });

  describe('canOpenInWebViewer', () => {
    it('is true on desktop when the Web viewer core plugin is enabled', () => {
      expect(canOpenInWebViewer(makeApp({ enabled: true }).app)).toBe(true);
    });

    it('is false when the user turned the core plugin off', () => {
      expect(canOpenInWebViewer(makeApp({ enabled: false }).app)).toBe(false);
    });

    it('is false on mobile, which has no web viewer', () => {
      Platform.isDesktopApp = false;
      expect(canOpenInWebViewer(makeApp({ enabled: true }).app)).toBe(false);
    });

    it('assumes it is available when Obsidian does not expose the plugin registry', () => {
      expect(canOpenInWebViewer(makeApp({ enabled: 'unknown' }).app)).toBe(true);
    });
  });

  describe('openInWebViewer', () => {
    it('opens the link in a new tab of the web viewer', async () => {
      const { app, getLeaf, setViewState } = makeApp();
      expect(await openInWebViewer(app, 'https://example.com')).toBe(true);
      expect(getLeaf).toHaveBeenCalledWith('tab');
      expect(setViewState).toHaveBeenCalledWith({ type: 'webviewer', active: true, state: { url: 'https://example.com', navigate: true } });
      expect(windowOpen).not.toHaveBeenCalled();
    });

    it('falls back to the default browser and says so when the web viewer fails', async () => {
      const { app } = makeApp({ setViewState: vi.fn().mockRejectedValue(new Error('no such view')) });
      expect(await openInWebViewer(app, 'https://example.com')).toBe(false);
      expect(windowOpen).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer');
      expect(Notice).toHaveBeenCalledWith(expect.stringContaining('Opening your browser instead'));
    });

    it('refuses a link that is not http(s)', async () => {
      const { app, setViewState } = makeApp();
      expect(await openInWebViewer(app, 'javascript:alert(1)')).toBe(false);
      expect(setViewState).not.toHaveBeenCalled();
    });
  });

  describe('showLinkMenu', () => {
    it('offers the web viewer and the default browser', () => {
      const menu = openMenu(makeApp().app);
      expect(menu.items.map((i) => i.title)).toEqual(['Open in Obsidian web viewer', 'Open in default browser']);
    });

    it('offers only the default browser when the web viewer is unavailable', () => {
      const menu = openMenu(makeApp({ enabled: false }).app);
      expect(menu.items.map((i) => i.title)).toEqual(['Open in default browser']);
    });

    it('opens the web viewer and then reports it, so a dialog can close', async () => {
      const { app, setViewState } = makeApp();
      const onOpenedInViewer = vi.fn();
      openMenu(app, onOpenedInViewer).items[0].onClick();
      await vi.waitFor(() => expect(onOpenedInViewer).toHaveBeenCalledTimes(1));
      expect(setViewState).toHaveBeenCalledWith(expect.objectContaining({ type: 'webviewer', state: { url: 'https://example.com/x', navigate: true } }));
    });

    it('does not report an open web viewer when it fell back to the browser', async () => {
      const { app } = makeApp({ setViewState: vi.fn().mockRejectedValue(new Error('boom')) });
      const onOpenedInViewer = vi.fn();
      openMenu(app, onOpenedInViewer).items[0].onClick();
      await vi.waitFor(() => expect(windowOpen).toHaveBeenCalled());
      expect(onOpenedInViewer).not.toHaveBeenCalled();
    });

    it('opens the default browser and leaves a dialog open', () => {
      const onOpenedInViewer = vi.fn();
      openMenu(makeApp().app, onOpenedInViewer).items[1].onClick();
      expect(windowOpen).toHaveBeenCalledWith('https://example.com/x', '_blank', 'noopener,noreferrer');
      expect(onOpenedInViewer).not.toHaveBeenCalled();
    });

    it('shows no menu for a link that is not http(s)', () => {
      const show = vi.spyOn(Menu.prototype as unknown as { showAtMouseEvent: () => unknown }, 'showAtMouseEvent');
      showLinkMenu(makeApp().app, 'javascript:alert(1)', new MouseEvent('contextmenu'));
      expect(show).not.toHaveBeenCalled();
    });
  });
});

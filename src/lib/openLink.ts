import { App, Menu, Notice, Platform } from 'obsidian';
import { appLogger } from './logger';
import { isWebUrl } from './links';
import { openExternal } from './electronShell';

/** The URL can come from email text, so never give the opened page a handle back to this window. */
function openInWindow(url: string): void {
  window.open(url, '_blank', 'noopener,noreferrer');
}

/**
 * Opens a web link in the system's default browser. Anything but http(s) is ignored.
 *
 * On desktop this goes through Electron's `shell.openExternal`: `window.open()` would land in
 * Obsidian's own web viewer window whenever the Web viewer core plugin is on. Mobile has no such
 * viewer, so there `window.open()` reaches the system browser; it is also the fallback if the
 * desktop call fails, so the link still opens somewhere.
 */
export function openInDefaultBrowser(url: string): void {
  if (!isWebUrl(url)) return;
  if (!Platform.isDesktopApp) {
    openInWindow(url);
    return;
  }
  openExternal(url).catch((e: unknown) => {
    appLogger.error('[M365 Calendar] Could not open the system browser:', e);
    openInWindow(url);
  });
}

/** The shape of the part of Obsidian's (undocumented) core-plugin registry that we read. */
interface InternalPlugins {
  getEnabledPluginById?: (id: string) => unknown;
}

/**
 * Whether Obsidian's "Web viewer" core plugin can open a link. It exists on desktop only and the
 * user can switch it off. If this Obsidian version does not expose the registry we cannot tell, so
 * we assume it is available and rely on `openInWebViewer` to fall back.
 */
export function canOpenInWebViewer(app: App): boolean {
  if (!Platform.isDesktopApp) return false;
  const internal = (app as unknown as { internalPlugins?: InternalPlugins }).internalPlugins;
  return internal?.getEnabledPluginById ? !!internal.getEnabledPluginById('webviewer') : true;
}

/**
 * Opens a web link in a new tab of Obsidian's web viewer; falls back to the default browser.
 * Resolves to whether the web viewer itself opened.
 */
export async function openInWebViewer(app: App, url: string): Promise<boolean> {
  if (!isWebUrl(url)) return false;
  try {
    await app.workspace.getLeaf('tab').setViewState({ type: 'webviewer', active: true, state: { url, navigate: true } });
    return true;
  } catch (e) {
    appLogger.error('[M365 Calendar] Could not open the web viewer:', e);
    new Notice('M365 Calendar: Could not open the web viewer. Opening your browser instead.'); // eslint-disable-line obsidianmd/ui/sentence-case
    openInDefaultBrowser(url);
    return false;
  }
}

/**
 * The right-click menu for a link: web viewer (when available) or default browser.
 * @param onOpenedInViewer Runs once the web viewer tab is open, so a dialog covering the workspace
 *   can close and reveal it. Not called for the default browser, which opens outside Obsidian.
 */
export function showLinkMenu(app: App, url: string, event: MouseEvent, onOpenedInViewer?: () => void): void {
  if (!isWebUrl(url)) return;
  const menu = new Menu();
  if (canOpenInWebViewer(app)) {
    menu.addItem((item) =>
      item.setTitle('Open in Obsidian web viewer').setIcon('layout-dashboard').onClick(() => {
        void openInWebViewer(app, url).then((opened) => { if (opened) onOpenedInViewer?.(); });
      }),
    );
  }
  menu.addItem((item) =>
    item.setTitle('Open in default browser').setIcon('external-link').onClick(() => {
      openInDefaultBrowser(url);
    }),
  );
  menu.showAtMouseEvent(event);
}

/**
 * Hands a URL to the operating system's default handler through Electron (desktop only).
 *
 * `window.open()` is not a substitute: with Obsidian's Web viewer core plugin enabled, Obsidian
 * opens that in its own web viewer window instead of the system browser. Kept in its own module,
 * which needs `require`, so tests can replace it.
 */
export async function openExternal(url: string): Promise<void> {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { shell } = require('electron') as { shell: { openExternal: (url: string) => Promise<void> } };
  await shell.openExternal(url);
}

import { Notice } from 'obsidian';

/** Logs an error and shows it to the user as an Obsidian notice. */
export function notifyError(e: unknown): void {
  const message = e instanceof Error ? e.message : 'An error occurred';
  console.error('M365 Calendar:', e);
  new Notice(`M365 Calendar: ${message}`);
}

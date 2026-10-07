import { App, Modal } from 'obsidian';
import React, { StrictMode, type ReactNode } from 'react';
import { createRoot, Root } from 'react-dom/client';

/**
 * Base class for the plugin's dialogs. An Obsidian `Modal` hosts a React tree: this class owns
 * the boilerplate of setting the title, mounting React into the modal's content element and
 * unmounting it again when the modal closes, so each dialog only says what it shows.
 */
export abstract class ReactModal extends Modal {
  private root: Root | null = null;

  protected constructor(app: App) {
    super(app);
  }

  /** The dialog title. Read when the dialog opens, so it may use constructor-assigned fields. */
  protected abstract getTitle(): string;

  /** The React content. Wrapped in StrictMode by the base class. */
  protected abstract renderContent(): ReactNode;

  /**
   * Runs `action` and, only if it succeeds, closes the dialog. A rejection propagates to the caller
   * (normally the form) and leaves the dialog open so it can show the error.
   */
  protected async closeAfter<T>(action: () => Promise<T> | T): Promise<T> {
    const result = await action();
    this.close();
    return result;
  }

  onOpen(): void {
    this.titleEl.setText(this.getTitle());
    this.root = createRoot(this.contentEl);
    this.root.render(<StrictMode>{this.renderContent()}</StrictMode>);
  }

  onClose(): void {
    this.root?.unmount();
    this.root = null;
  }
}

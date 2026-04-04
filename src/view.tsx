import { ItemView, WorkspaceLeaf } from 'obsidian';
import { StrictMode } from 'react';
import { createRoot, Root } from 'react-dom/client';
import { CalendarApp } from './components/CalendarApp';
import { AppContext, AppContextValue } from './context';

export const VIEW_TYPE_M365_CALENDAR = 'm365-calendar-view';

export class M365CalendarView extends ItemView {
  private root: Root | null = null;

  constructor(
    leaf: WorkspaceLeaf,
    private readonly contextValue: AppContextValue,
  ) {
    super(leaf);
  }

  getViewType(): string {
    return VIEW_TYPE_M365_CALENDAR;
  }

  getDisplayText(): string {
    return 'M365 Calendar';
  }

  getIcon(): string {
    return 'calendar';
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    this.root.render(
      <StrictMode>
        <AppContext.Provider value={this.contextValue}>
          <CalendarApp />
        </AppContext.Provider>
      </StrictMode>,
    );
  }

  async onClose(): Promise<void> {
    this.root?.unmount();
  }
}

export class Modal {
  contentEl: HTMLElement;
  titleEl: { setText: (s: string) => void };

  constructor() {
    this.contentEl = document.createElement('div');
    this.titleEl = { setText: () => {} };
  }

  open() {}
  close() {}
  onOpen() {}
  onClose() {}
}

export class App {}
export class Plugin {}
export class PluginSettingTab {}
export class Setting {}
export class Notice {}

import { vi } from 'vitest';

export interface RequestUrlResponse {
  status: number;
  headers: Record<string, string>;
  arrayBuffer: ArrayBuffer;
  json: unknown;
  text: string;
}

export const requestUrl = vi.fn();

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

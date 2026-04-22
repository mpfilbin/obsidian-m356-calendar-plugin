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

export class PluginSettingTab {
  containerEl: HTMLElement;
  constructor(_app: unknown, _plugin: unknown) {
    const el = document.createElement('div');
    (el as unknown as { empty: () => void }).empty = vi.fn();
    this.containerEl = el;
  }
}

/** Tracks every Setting instance created during a test. Call _clearSettingInstances() in beforeEach. */
const _instances: Setting[] = [];
export function _getSettingInstances(): Setting[] { return [..._instances]; }
export function _clearSettingInstances(): void { _instances.length = 0; }

export class ButtonComponent {
  private _handler: (() => void | Promise<void>) | undefined;
  setButtonText(_text: string) { return this; }
  setCta() { return this; }
  setDisabled(_disabled: boolean) { return this; }
  onClick(handler: () => void | Promise<void>) { this._handler = handler; return this; }
  async simulateClick() { await this._handler?.(); }
}

export class Setting {
  readonly buttons: ButtonComponent[] = [];
  constructor(_containerEl?: unknown) { _instances.push(this); }
  setName(_: string) { return this; }
  setDesc(_: string) { return this; }
  setHeading() { return this; }
  addButton(cb: (btn: ButtonComponent) => void) {
    const btn = new ButtonComponent();
    cb(btn);
    this.buttons.push(btn);
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addText(cb: (text: any) => void) {
    const text = { inputEl: { type: '' }, setPlaceholder: () => text, setValue: () => text, onChange: () => text };
    cb(text);
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addDropdown(cb: (dd: any) => void) {
    const dd = { addOption: () => dd, setValue: () => dd, onChange: () => dd };
    cb(dd);
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addToggle(cb: (toggle: any) => void) {
    const toggle = { setValue: () => toggle, onChange: () => toggle };
    cb(toggle);
    return this;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  addSlider(cb: (slider: any) => void) {
    const slider = { setLimits: () => slider, setValue: () => slider, setDynamicTooltip: () => slider, onChange: () => slider };
    cb(slider);
    return this;
  }
}

// vi.fn() is callable with `new` and records all invocations — use expect(Notice).toHaveBeenCalledWith(...)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const Notice = vi.fn() as unknown as new (message: string, timeout?: number) => void;

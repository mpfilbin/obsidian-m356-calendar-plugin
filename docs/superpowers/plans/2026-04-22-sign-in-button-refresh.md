# Sign-In Button Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** After a successful sign-in, call `this.display()` and show a success `Notice` so the settings pane refreshes its auth state and the user gets feedback.

**Architecture:** The fix is two lines inside the `try` block in `M365CalendarSettingTab`'s Sign In button handler. `this.display()` re-renders the pane, which re-runs `isAuthenticated()` to correctly disable Sign In and leave Sign Out available. To cover this with a test, the `obsidian` mock needs minimal chainable `Setting`/`ButtonComponent` stubs plus a `_clearSettingInstances`/`_getSettingInstances` helper so tests can locate the captured button and trigger its click.

**Tech Stack:** TypeScript, Vitest, jsdom

---

## Files

| Action | Path | Change |
|--------|------|--------|
| Modify | `tests/__mocks__/obsidian.ts` | Add `ButtonComponent`; update `Setting`, `PluginSettingTab`; change `Notice` to `vi.fn()` |
| Create | `tests/settings.test.ts` | One test: sign-in success path calls `display()` and `Notice` |
| Modify | `src/settings.ts` | Add `new Notice(...)` + `this.display()` after `signIn()` succeeds |

---

## Task 1: Fix sign-in button and add test coverage

**Files:**
- Modify: `tests/__mocks__/obsidian.ts`
- Create: `tests/settings.test.ts`
- Modify: `src/settings.ts`

- [ ] **Step 1: Update `tests/__mocks__/obsidian.ts`**

Replace the entire file with this content. Changes vs. the current file: `ButtonComponent` is new; `Setting` gains chainable methods and button tracking; `PluginSettingTab` gains `containerEl`; `Notice` becomes `vi.fn()`.

```typescript
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
```

- [ ] **Step 2: Run existing tests to confirm mock changes are backward-compatible**

```bash
npm test
```

Expected: all 297 tests pass. If any fail, the mock change broke something — fix it before proceeding.

- [ ] **Step 3: Write the failing test**

Create `tests/settings.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { M365CalendarSettingTab, DEFAULT_SETTINGS } from '../../src/settings';
import { Notice, _getSettingInstances, _clearSettingInstances } from 'obsidian';
import type M365CalendarPlugin from '../../src/main';

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
});
```

- [ ] **Step 4: Run the new test to verify it fails**

```bash
npx vitest run tests/settings.test.ts
```

Expected: FAIL — `Notice` was not called and `display` was not called after sign-in.

- [ ] **Step 5: Implement the fix in `src/settings.ts`**

Inside the Sign In button's `onClick` handler, add two lines immediately after the `await this.plugin.authService.signIn()` call and before the closing `}` of the `try` block.

Current `try` block (lines 69–76):
```typescript
            signInBtn.setDisabled(true);
            try {
              await this.plugin.authService.signIn();
            } catch (e) {
              signInBtn.setDisabled(false);
              console.error('M365 Calendar: Sign in failed', e);
              new Notice('M365 Calendar: Sign in failed. Check the developer console for details.'); // eslint-disable-line obsidianmd/ui/sentence-case
            }
```

Replace with:
```typescript
            signInBtn.setDisabled(true);
            try {
              await this.plugin.authService.signIn();
              new Notice('M365 Calendar: Signed in.'); // eslint-disable-line obsidianmd/ui/sentence-case
              this.display();
            } catch (e) {
              signInBtn.setDisabled(false);
              console.error('M365 Calendar: Sign in failed', e);
              new Notice('M365 Calendar: Sign in failed. Check the developer console for details.'); // eslint-disable-line obsidianmd/ui/sentence-case
            }
```

- [ ] **Step 6: Run all tests**

```bash
npm test
```

Expected: all 298 tests pass (297 existing + 1 new).

- [ ] **Step 7: Commit**

Use `mcp__git__*` MCP tools (REQUIRED by this repo's CLAUDE.md — do NOT use `git` bash commands):

```
Stage: tests/__mocks__/obsidian.ts
       tests/settings.test.ts
       src/settings.ts
Message: fix: refresh settings pane and show notice after successful sign-in
```

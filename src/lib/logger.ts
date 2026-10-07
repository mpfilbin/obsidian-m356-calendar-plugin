/**
 * Plugin logging.
 *
 * - `log`   debug detail (HTTP calls, auth steps); shown only when "Debug logging" is on.
 * - `warn`  something unexpected but recoverable; always shown.
 * - `error` a failure; always shown, so problems are visible in the developer console
 *           (Ctrl+Shift+I) without having to turn debug logging on first.
 */
export interface Logger {
  log(...args: unknown[]): void;
  warn(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export class ConsoleLogger implements Logger {
  log(...args: unknown[]): void { console.log(...args); }
  warn(...args: unknown[]): void { console.warn(...args); }
  error(...args: unknown[]): void { console.error(...args); }
}

export class NullLogger implements Logger {
  log(): void {}
  warn(): void {}
  error(): void {}
}

/** Shows debug output only while enabled; warnings and errors always go to the console. */
export class SwitchableLogger implements Logger {
  private readonly console = new ConsoleLogger();
  private debugEnabled: boolean;

  constructor(enabled: boolean) {
    this.debugEnabled = enabled;
  }

  setEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  log(...args: unknown[]): void { if (this.debugEnabled) this.console.log(...args); }
  warn(...args: unknown[]): void { this.console.warn(...args); }
  error(...args: unknown[]): void { this.console.error(...args); }
}

/**
 * The plugin-wide logger. Components, hooks and dialogs, which have no constructor to inject a
 * logger through, use this directly; `main.ts` switches debug output on and off from the settings
 * and hands the same instance to the services.
 */
export const appLogger = new SwitchableLogger(false);

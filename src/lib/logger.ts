export interface Logger {
  log(...args: unknown[]): void;
  error(...args: unknown[]): void;
}

export class ConsoleLogger implements Logger {
  log(...args: unknown[]): void { console.log(...args); }
  error(...args: unknown[]): void { console.error(...args); }
}

export class NullLogger implements Logger {
  log(): void {}
  error(): void {}
}

// Delegates to ConsoleLogger or NullLogger; call setEnabled to switch at runtime.
export class SwitchableLogger implements Logger {
  private inner: Logger;

  constructor(enabled: boolean) {
    this.inner = enabled ? new ConsoleLogger() : new NullLogger();
  }

  setEnabled(enabled: boolean): void {
    this.inner = enabled ? new ConsoleLogger() : new NullLogger();
  }

  log(...args: unknown[]): void { this.inner.log(...args); }
  error(...args: unknown[]): void { this.inner.error(...args); }
}

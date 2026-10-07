import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ConsoleLogger, NullLogger, SwitchableLogger, appLogger, type Logger } from '../../src/lib/logger';

describe('logger', () => {
  let log: ReturnType<typeof vi.spyOn>;
  let warn: ReturnType<typeof vi.spyOn>;
  let error: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    log = vi.spyOn(console, 'log').mockImplementation(() => {});
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    error = vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('ConsoleLogger forwards every level to the console unchanged', () => {
    const logger = new ConsoleLogger();
    logger.log('a', 1);
    logger.warn('b');
    logger.error('c', new Error('x'));
    expect(log).toHaveBeenCalledWith('a', 1);
    expect(warn).toHaveBeenCalledWith('b');
    expect(error).toHaveBeenCalledWith('c', expect.any(Error));
  });

  it('NullLogger prints nothing', () => {
    const logger: Logger = new NullLogger();
    logger.log('a');
    logger.warn('b');
    logger.error('c');
    expect(log).not.toHaveBeenCalled();
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it('SwitchableLogger hides debug output until enabled, but never hides warnings or errors', () => {
    const logger = new SwitchableLogger(false);
    logger.log('debug');
    logger.warn('careful');
    logger.error('broken');
    expect(log).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith('careful');
    expect(error).toHaveBeenCalledWith('broken');

    logger.setEnabled(true);
    logger.log('debug');
    expect(log).toHaveBeenCalledWith('debug');

    logger.setEnabled(false);
    logger.log('debug again');
    expect(log).toHaveBeenCalledTimes(1);
  });

  it('appLogger starts with debug output off', () => {
    appLogger.log('quiet');
    expect(log).not.toHaveBeenCalled();
    appLogger.error('loud');
    expect(error).toHaveBeenCalledWith('loud');
  });
});

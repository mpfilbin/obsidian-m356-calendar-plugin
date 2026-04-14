import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useNow } from '../../src/hooks/useNow';

describe('useNow', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-14T14:30:00.000'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns the current date as initial value', () => {
    const { result } = renderHook(() => useNow());
    expect(result.current).toEqual(new Date('2026-04-14T14:30:00.000'));
  });

  it('updates after the next whole-minute boundary fires', () => {
    // At :30s into the minute, next boundary is 30 000 ms away
    vi.setSystemTime(new Date('2026-04-14T14:30:30.000'));
    const { result } = renderHook(() => useNow());

    act(() => {
      vi.setSystemTime(new Date('2026-04-14T14:31:00.000'));
      vi.advanceTimersByTime(30000);
    });

    expect(result.current.getMinutes()).toBe(31);
  });

  it('continues updating on the 60-second interval after the first tick', () => {
    // Starting at :00 — next boundary is 60 000 ms away
    vi.setSystemTime(new Date('2026-04-14T14:30:00.000'));
    const { result } = renderHook(() => useNow());

    act(() => {
      vi.setSystemTime(new Date('2026-04-14T14:31:00.000'));
      vi.advanceTimersByTime(60000);
    });
    expect(result.current.getMinutes()).toBe(31);

    act(() => {
      vi.setSystemTime(new Date('2026-04-14T14:32:00.000'));
      vi.advanceTimersByTime(60000);
    });
    expect(result.current.getMinutes()).toBe(32);
  });

  it('clears the timeout on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout');
    const { unmount } = renderHook(() => useNow());
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
  });
});

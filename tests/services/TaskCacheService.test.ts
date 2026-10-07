import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TaskCacheService } from '../../src/services/TaskCacheService';
import type { M365TodoItem, TaskCacheStore } from '../../src/types';

const task = (id: string, dueDate = '2026-04-10'): M365TodoItem => ({
  id, title: `Task ${id}`, listId: 'list1', dueDate, importance: 'normal',
});

describe('TaskCacheService', () => {
  let load: ReturnType<typeof vi.fn>;
  let save: ReturnType<typeof vi.fn>;
  let cache: TaskCacheService;

  beforeEach(async () => {
    load = vi.fn().mockResolvedValue({});
    save = vi.fn().mockResolvedValue(undefined);
    cache = new TaskCacheService(load, save);
    await cache.init();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns null for a list that was never cached', () => {
    expect(cache.get('list1')).toBeNull();
  });

  it('stores a list and persists it', async () => {
    await cache.set('list1', [task('a'), task('b')]);
    expect(cache.get('list1')?.map((t) => t.id)).toEqual(['a', 'b']);
    expect(save).toHaveBeenCalledTimes(1);
    expect(save.mock.calls[0][0].list1.tasks).toHaveLength(2);
  });

  it('treats an entry older than 24 hours as missing', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-10T09:00:00Z'));
    await cache.set('list1', [task('a')]);
    vi.setSystemTime(new Date('2026-04-11T08:59:00Z'));
    expect(cache.get('list1')).not.toBeNull();
    vi.setSystemTime(new Date('2026-04-11T09:01:00Z'));
    expect(cache.get('list1')).toBeNull();
  });

  it('invalidate forgets only that list', async () => {
    await cache.set('list1', [task('a')]);
    await cache.set('list2', [task('b')]);
    save.mockClear();
    await cache.invalidate('list1');
    expect(cache.get('list1')).toBeNull();
    expect(cache.get('list2')).not.toBeNull();
    expect(save).toHaveBeenCalledTimes(1);
  });

  it('invalidate on an unknown list does nothing (no write)', async () => {
    await cache.invalidate('nope');
    expect(save).not.toHaveBeenCalled();
  });

  it('clearAll removes every list and persists the empty cache', async () => {
    await cache.set('list1', [task('a')]);
    await cache.set('list2', [task('b')]);
    await cache.clearAll();
    expect(cache.get('list1')).toBeNull();
    expect(cache.get('list2')).toBeNull();
    expect(save).toHaveBeenLastCalledWith({});
  });

  it('does not write back results from a fetch that started before a purge', async () => {
    const epochAtStart = cache.epoch;
    await cache.clearAll();
    await cache.set('list1', [task('a')], epochAtStart);
    expect(cache.get('list1')).toBeNull();

    await cache.set('list1', [task('a')], cache.epoch);
    expect(cache.get('list1')).not.toBeNull();
  });

  describe('init', () => {
    it('restores a persisted cache', async () => {
      const persisted: TaskCacheStore = { list1: { tasks: [task('a')], fetchedAt: Date.now() } };
      const restored = new TaskCacheService(vi.fn().mockResolvedValue(persisted), save);
      await restored.init();
      expect(restored.get('list1')?.[0].id).toBe('a');
      expect(save).not.toHaveBeenCalled();
    });

    it('drops expired and malformed entries and persists the clean-up', async () => {
      const day = 24 * 60 * 60 * 1000;
      const persisted = {
        fresh: { tasks: [task('a')], fetchedAt: Date.now() },
        stale: { tasks: [task('b')], fetchedAt: Date.now() - 2 * day },
        broken: { tasks: 'nope', fetchedAt: 'yesterday' },
        nothing: null,
      } as unknown as TaskCacheStore;
      const restored = new TaskCacheService(vi.fn().mockResolvedValue(persisted), save);
      await restored.init();
      expect(restored.get('fresh')).not.toBeNull();
      expect(restored.get('stale')).toBeNull();
      expect(restored.get('broken')).toBeNull();
      expect(save).toHaveBeenCalledTimes(1);
      expect(Object.keys(save.mock.calls[0][0])).toEqual(['fresh']);
    });

    it('copes with nothing having been persisted yet', async () => {
      const empty = new TaskCacheService(vi.fn().mockResolvedValue(undefined), save);
      await expect(empty.init()).resolves.toBeUndefined();
      expect(empty.get('list1')).toBeNull();
    });
  });
});

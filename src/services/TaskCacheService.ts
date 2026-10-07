import { M365TodoItem, TaskCacheStore } from '../types';

export const TASK_CACHE_KEY = 'taskCache';

const TASK_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

/**
 * Persistent cache of open, dated tasks per task list. A list is fetched whole (Graph is not asked
 * to filter), so one entry can serve any date range the user navigates to.
 */
export class TaskCacheService {
  private store: TaskCacheStore = {};
  private clearCount = 0;

  constructor(
    private readonly load: () => Promise<TaskCacheStore>,
    private readonly save: (data: TaskCacheStore) => Promise<void>,
  ) {}

  async init(): Promise<void> {
    const raw = (await this.load()) ?? {};
    // Drop anything that doesn't look like an entry (hand-edited or from another version).
    this.store = Object.fromEntries(
      Object.entries(raw).filter(
        ([, v]) => v && Array.isArray(v.tasks) && typeof v.fetchedAt === 'number',
      ),
    );
    const sizeBefore = Object.keys(this.store).length;
    const droppedInvalid = sizeBefore !== Object.keys(raw).length;
    this.purgeExpired();
    if (droppedInvalid || Object.keys(this.store).length !== sizeBefore) {
      await this.save(this.store);
    }
  }

  /** The cached tasks for a list, or null if there is no fresh entry. */
  get(listId: string): M365TodoItem[] | null {
    const entry = this.store[listId];
    if (!entry || Date.now() - entry.fetchedAt > TASK_CACHE_TTL_MS) return null;
    return entry.tasks;
  }

  /**
   * Changes every time the cache is cleared. A fetch that began before a clear can pass the epoch it
   * saw to `set` so its (now stale) results are not written back after the purge.
   */
  get epoch(): number {
    return this.clearCount;
  }

  async set(listId: string, tasks: M365TodoItem[], expectedEpoch: number = this.clearCount): Promise<void> {
    if (expectedEpoch !== this.clearCount) return;
    this.store[listId] = { tasks, fetchedAt: Date.now() };
    await this.save(this.store);
  }

  /** Forgets one list, e.g. after a task in it was changed, so the next read refetches it. */
  async invalidate(listId: string): Promise<void> {
    if (!(listId in this.store)) return;
    delete this.store[listId];
    await this.save(this.store);
  }

  async clearAll(): Promise<void> {
    this.clearCount++;
    this.store = {};
    await this.save(this.store);
  }

  purgeExpired(): void {
    const now = Date.now();
    for (const listId of Object.keys(this.store)) {
      if (now - this.store[listId].fetchedAt > TASK_CACHE_TTL_MS) delete this.store[listId];
    }
  }
}

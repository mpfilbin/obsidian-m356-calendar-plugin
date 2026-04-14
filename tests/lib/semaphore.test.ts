import { describe, it, expect } from 'vitest';
import { Semaphore } from '../../src/lib/semaphore';

describe('Semaphore', () => {
  it('allows up to limit concurrent acquisitions immediately', async () => {
    const sem = new Semaphore(2);
    const p1 = sem.acquire();
    const p2 = sem.acquire();
    let resolved = 0;
    void p1.then(() => resolved++);
    void p2.then(() => resolved++);
    await Promise.resolve();
    expect(resolved).toBe(2);
  });

  it('queues acquisition when at limit', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    let thirdResolved = false;
    const p3 = sem.acquire().then(() => { thirdResolved = true; });
    await Promise.resolve();
    expect(thirdResolved).toBe(false);
    sem.release();
    await p3;
    expect(thirdResolved).toBe(true);
  });

  it('processes queued acquisitions in FIFO order', async () => {
    const sem = new Semaphore(1);
    await sem.acquire();
    const order: number[] = [];
    const p1 = sem.acquire().then(() => order.push(1));
    const p2 = sem.acquire().then(() => order.push(2));
    const p3 = sem.acquire().then(() => order.push(3));
    sem.release(); await Promise.resolve(); await Promise.resolve();
    sem.release(); await Promise.resolve(); await Promise.resolve();
    sem.release(); await Promise.resolve(); await Promise.resolve();
    await Promise.all([p1, p2, p3]);
    expect(order).toEqual([1, 2, 3]);
  });

  it('correctly tracks running count after multiple acquire/release cycles', async () => {
    const sem = new Semaphore(2);
    await sem.acquire();
    await sem.acquire();
    sem.release();
    let resolved = false;
    await sem.acquire().then(() => { resolved = true; });
    expect(resolved).toBe(true);
  });
});

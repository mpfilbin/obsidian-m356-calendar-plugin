import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TodoService } from '../../src/services/TodoService';
import { AuthService } from '../../src/services/AuthService';

describe('TodoService', () => {
  let auth: Pick<AuthService, 'getValidToken'>;
  let service: TodoService;

  beforeEach(() => {
    auth = { getValidToken: vi.fn().mockResolvedValue('token') };
    service = new TodoService(auth as AuthService);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('getLists', () => {
    it('maps Graph response to M365TodoList and assigns a hex color', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [{ id: 'list1', displayName: 'Work Tasks' }] }),
      }));
      const lists = await service.getLists();
      expect(lists).toHaveLength(1);
      expect(lists[0]).toMatchObject({ id: 'list1', displayName: 'Work Tasks' });
      expect(lists[0].color).toMatch(/^#[0-9a-f]{6}$/);
    });

    it('assigns the same color to the same list ID across calls', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [{ id: 'list1', displayName: 'Work' }] }),
      }));
      const [first] = await service.getLists();
      const [second] = await service.getLists();
      expect(first.color).toBe(second.color);
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Unauthorized' }));
      await expect(service.getLists()).rejects.toThrow('Failed to fetch todo lists: Unauthorized');
    });
  });

  describe('getTasks', () => {
    it('returns empty array immediately when listIds is empty, making no fetch calls', async () => {
      const fetchMock = vi.fn();
      vi.stubGlobal('fetch', fetchMock);
      const result = await service.getTasks([], new Date('2026-04-01'), new Date('2026-04-30'));
      expect(result).toEqual([]);
      expect(fetchMock).not.toHaveBeenCalled();
    });

    it('fetches tasks for each list', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      await service.getTasks(['list1', 'list2'], new Date('2026-04-01'), new Date('2026-04-30'));
      expect(fetchMock).toHaveBeenCalledTimes(2);
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/me/todo/lists/list1/tasks'),
        expect.any(Object),
      );
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringContaining('/me/todo/lists/list2/tasks'),
        expect.any(Object),
      );
    });

    it('returns only tasks whose dueDate falls within the range', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            {
              id: 'task1',
              title: 'In range',
              dueDateTime: { dateTime: '2026-04-15T00:00:00' },
              body: { content: 'some notes' },
              importance: 'normal',
            },
            {
              id: 'task2',
              title: 'Out of range',
              dueDateTime: { dateTime: '2026-03-01T00:00:00' },
              body: { content: '' },
              importance: 'low',
            },
          ],
        }),
      }));
      const result = await service.getTasks(
        ['list1'],
        new Date('2026-04-01'),
        new Date('2026-04-30'),
      );
      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        id: 'task1',
        title: 'In range',
        listId: 'list1',
        dueDate: '2026-04-15',
        body: 'some notes',
        importance: 'normal',
      });
    });

    it('excludes completed tasks', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            {
              id: 'task1',
              title: 'Done',
              status: 'completed',
              dueDateTime: { dateTime: '2026-04-15T00:00:00' },
              body: null,
              importance: 'normal',
            },
            {
              id: 'task2',
              title: 'Still open',
              status: 'notStarted',
              dueDateTime: { dateTime: '2026-04-15T00:00:00' },
              body: null,
              importance: 'normal',
            },
          ],
        }),
      }));
      const result = await service.getTasks(
        ['list1'],
        new Date('2026-04-01'),
        new Date('2026-04-30'),
      );
      expect(result).toHaveLength(1);
      expect(result[0].title).toBe('Still open');
    });

    it('excludes tasks without a dueDateTime', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'task1', title: 'No due date', dueDateTime: null, body: null, importance: 'normal' },
          ],
        }),
      }));
      const result = await service.getTasks(
        ['list1'],
        new Date('2026-04-01'),
        new Date('2026-04-30'),
      );
      expect(result).toHaveLength(0);
    });

    it('maps empty body content to undefined', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            {
              id: 'task1',
              title: 'Empty body',
              dueDateTime: { dateTime: '2026-04-15T00:00:00' },
              body: { content: '' },
              importance: 'normal',
            },
          ],
        }),
      }));
      const result = await service.getTasks(['list1'], new Date('2026-04-01'), new Date('2026-04-30'));
      expect(result[0].body).toBeUndefined();
    });

    it('URL-encodes list IDs containing base64 special characters', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const id = 'AAMkAGM3Yz/M1Y2Vm+LWRmYmU=';
      await service.getTasks([id], new Date('2026-04-01'), new Date('2026-04-30'));
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain(encodeURIComponent(id)); // %2F, %2B, %3D encoded
      expect(url).not.toContain('Yz/M'); // raw slash from inside the ID is not in the URL
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }));
      await expect(
        service.getTasks(['list1'], new Date('2026-04-01'), new Date('2026-04-30')),
      ).rejects.toThrow('Failed to fetch tasks: Forbidden');
    });
  });
});

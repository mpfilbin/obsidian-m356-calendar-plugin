import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { TodoService } from '../../src/services/TodoService';
import { AuthService } from '../../src/services/AuthService';
import { TaskCacheService } from '../../src/services/TaskCacheService';

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

  describe('getTasks request URL', () => {
    it('requests the plain task list with no OData query (Graph returned 400 for $filter on status)', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ value: [] }) });
      vi.stubGlobal('fetch', fetchMock);
      await service.getTasks(['list1'], new Date(2026, 3, 1), new Date(2026, 4, 1));
      expect(fetchMock.mock.calls[0][0]).toBe('https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks');
    });

    it('drops completed tasks and tasks outside the range client-side', async () => {
      const due = (day: string) => ({ dateTime: `${day}T00:00:00.0000000`, timeZone: 'UTC' });
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'open', title: 'Open', status: 'notStarted', dueDateTime: due('2026-04-10') },
            { id: 'done', title: 'Done', status: 'completed', dueDateTime: due('2026-04-10') },
            { id: 'later', title: 'Later', status: 'notStarted', dueDateTime: due('2026-06-01') },
            { id: 'undated', title: 'Undated', status: 'notStarted', dueDateTime: null },
          ],
        }),
      }));
      const tasks = await service.getTasks(['list1'], new Date(2026, 3, 1), new Date(2026, 3, 30));
      expect(tasks.map((t) => t.id)).toEqual(['open']);
    });

    it('follows @odata.nextLink so long lists are fully read', async () => {
      const due = { dateTime: '2026-04-10T00:00:00.0000000', timeZone: 'UTC' };
      const fetchMock = vi.fn()
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ value: [{ id: 'a', title: 'A', status: 'notStarted', dueDateTime: due }], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/next' }) })
        .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ value: [{ id: 'b', title: 'B', status: 'notStarted', dueDateTime: due }] }) });
      vi.stubGlobal('fetch', fetchMock);
      const tasks = await service.getTasks(['list1'], new Date(2026, 3, 1), new Date(2026, 3, 30));
      expect(tasks.map((t) => t.id)).toEqual(['a', 'b']);
    });
  });

  describe('task cache', () => {
    const due = (day: string) => ({ dateTime: `${day}T00:00:00.0000000`, timeZone: 'UTC' });
    const graphTasks = [
      { id: 'apr', title: 'April', status: 'notStarted', dueDateTime: due('2026-04-10') },
      { id: 'may', title: 'May', status: 'notStarted', dueDateTime: due('2026-05-10') },
      { id: 'done', title: 'Done', status: 'completed', dueDateTime: due('2026-04-11') },
      { id: 'undated', title: 'Undated', status: 'notStarted', dueDateTime: null },
    ];
    const april = [new Date(2026, 3, 1), new Date(2026, 3, 30)] as const;
    const may = [new Date(2026, 4, 1), new Date(2026, 4, 31)] as const;
    let taskCache: TaskCacheService;
    let cached: TodoService;
    let fetchMock: ReturnType<typeof vi.fn>;

    beforeEach(() => {
      taskCache = new TaskCacheService(vi.fn().mockResolvedValue({}), vi.fn().mockResolvedValue(undefined));
      cached = new TodoService(auth as AuthService, undefined, taskCache);
      fetchMock = vi.fn().mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ value: graphTasks }) }));
      vi.stubGlobal('fetch', fetchMock);
    });

    it('serves other date ranges of the same list from the cache without another request', async () => {
      expect((await cached.getTasks(['list1'], ...april)).map((t) => t.id)).toEqual(['apr']);
      expect((await cached.getTasks(['list1'], ...may)).map((t) => t.id)).toEqual(['may']);
      expect((await cached.getTasks(['list1'], ...april)).map((t) => t.id)).toEqual(['apr']);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    it('caches only open, dated tasks', async () => {
      await cached.getTasks(['list1'], ...april);
      expect(taskCache.get('list1')?.map((t) => t.id)).toEqual(['apr', 'may']);
    });

    it('fetches each list once and keeps lists separate', async () => {
      await cached.getTasks(['list1', 'list2'], ...april);
      await cached.getTasks(['list1', 'list2'], ...may);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    it('bypassCache refetches and refreshes the cache', async () => {
      await cached.getTasks(['list1'], ...april);
      graphTasks.push({ id: 'new', title: 'New', status: 'notStarted', dueDateTime: due('2026-04-20') });
      try {
        const tasks = await cached.getTasks(['list1'], ...april, true);
        expect(tasks.map((t) => t.id)).toEqual(['apr', 'new']);
        expect(fetchMock).toHaveBeenCalledTimes(2);
        expect(taskCache.get('list1')?.map((t) => t.id)).toContain('new');
      } finally {
        graphTasks.pop();
      }
    });

    it.each([
      ['completeTask', (s: TodoService) => s.completeTask('list1', 't1')],
      ['deleteTask', (s: TodoService) => s.deleteTask('list1', 't1')],
      ['updateTaskDueDate', (s: TodoService) => s.updateTaskDueDate('list1', 't1', '2026-04-12')],
      ['createTask', (s: TodoService) => s.createTask('list1', { title: 'x', dueDate: '2026-04-12' })],
    ])('%s drops that list from the cache so it is refetched next time', async (_name, mutate) => {
      await cached.getTasks(['list1'], ...april);
      await cached.getTasks(['list2'], ...april);
      fetchMock.mockImplementation(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ value: graphTasks, id: 't1', title: 'x' }) }));
      await mutate(cached);
      expect(taskCache.get('list1')).toBeNull();
      expect(taskCache.get('list2')).not.toBeNull();
    });

    it('a failed mutation leaves the cache alone', async () => {
      await cached.getTasks(['list1'], ...april);
      fetchMock.mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' });
      await expect(cached.completeTask('list1', 't1')).rejects.toThrow('Forbidden');
      expect(taskCache.get('list1')).not.toBeNull();
    });

    it('does not cache a fetch that began before a purge', async () => {
      let release!: () => void;
      fetchMock.mockImplementation(() => new Promise((resolve) => {
        release = () => resolve({ ok: true, json: () => Promise.resolve({ value: graphTasks }) });
      }));
      const pending = cached.getTasks(['list1'], ...april);
      await vi.waitFor(() => expect(release).toBeTypeOf('function'));
      await taskCache.clearAll();
      release();
      await pending;
      expect(taskCache.get('list1')).toBeNull();
    });

    it('works without a cache (every call fetches)', async () => {
      const plain = new TodoService(auth as AuthService);
      await plain.getTasks(['list1'], ...april);
      await plain.getTasks(['list1'], ...april);
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });
  });

  describe('updateTaskDueDate', () => {
    it('PATCHes only the due date, formatted like createTask', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.updateTaskDueDate('list 1', 'task/1', '2026-05-20');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list%201/tasks/task%2F1',
        expect.objectContaining({
          method: 'PATCH',
          body: JSON.stringify({ dueDateTime: { dateTime: '2026-05-20T00:00:00', timeZone: 'UTC' } }),
        }),
      );
    });

    it('throws a descriptive error when Graph rejects the change', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 403, statusText: 'Forbidden' }));
      await expect(service.updateTaskDueDate('l', 't', '2026-05-20')).rejects.toThrow('Failed to reschedule task: Forbidden');
    });
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

    it('encodes /, +, and = in list IDs', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const id = 'AAMkAGM3Yz/M1Y2Vm+LWRmYmU=';
      await service.getTasks([id], new Date('2026-04-01'), new Date('2026-04-30'));
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('%2F'); // / encoded
      expect(url).toContain('%2B'); // + encoded
      expect(url).not.toContain('Yz/M'); // raw slash is gone
      // = is encoded as %3D so Microsoft's URL router doesn't misparse it
      const pathPart = url.split('?')[0];
      expect(pathPart).toContain('mU%3D'); // = encoded in the path
      expect(pathPart).not.toContain('mU='); // raw = is gone from path
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }));
      await expect(
        service.getTasks(['list1'], new Date('2026-04-01'), new Date('2026-04-30')),
      ).rejects.toThrow('Failed to fetch tasks: Forbidden');
    });
  });

  describe('completeTask', () => {
    it('issues PATCH with status completed using the correct URL and auth header', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.completeTask('list1', 'task1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ status: 'completed' }),
        }),
      );
    });

    it('encodes special characters in list and task IDs', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.completeTask('list/id+1=', 'task/id+2=');
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('%2F');
      expect(url).toContain('%2B');
      expect(url).toContain('%3D');
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
      await expect(service.completeTask('list1', 'task1')).rejects.toThrow('Failed to complete task: Not Found');
    });
  });

  describe('getChecklistItems', () => {
    it('fetches items for the given list and task', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          value: [
            { id: 'ci1', displayName: 'Step one', isChecked: false },
            { id: 'ci2', displayName: 'Step two', isChecked: true },
          ],
        }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const result = await service.getChecklistItems('list1', 'task1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1/checklistItems',
        expect.objectContaining({ headers: expect.objectContaining({ Authorization: 'Bearer token' }) }),
      );
      expect(result).toEqual([
        { id: 'ci1', displayName: 'Step one', isChecked: false },
        { id: 'ci2', displayName: 'Step two', isChecked: true },
      ]);
    });

    it('encodes special characters in list and task IDs', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ value: [] }),
      });
      vi.stubGlobal('fetch', fetchMock);
      await service.getChecklistItems('list/id+1=', 'task/id+2=');
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('%2F');
      expect(url).toContain('%2B');
      expect(url).toContain('%3D');
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }));
      await expect(service.getChecklistItems('list1', 'task1')).rejects.toThrow(
        'Failed to fetch checklist items: Forbidden',
      );
    });
  });

  describe('createChecklistItem', () => {
    it('POSTs the displayName and returns the created item', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ id: 'ci3', displayName: 'New step', isChecked: false }),
      });
      vi.stubGlobal('fetch', fetchMock);
      const result = await service.createChecklistItem('list1', 'task1', 'New step');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1/checklistItems',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ displayName: 'New step' }),
        }),
      );
      expect(result).toEqual({ id: 'ci3', displayName: 'New step', isChecked: false });
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Bad Request' }));
      await expect(service.createChecklistItem('list1', 'task1', 'Step')).rejects.toThrow(
        'Failed to create checklist item: Bad Request',
      );
    });
  });

  describe('updateChecklistItem', () => {
    it('PATCHes the item with the given patch object', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.updateChecklistItem('list1', 'task1', 'ci1', { isChecked: true });
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1/checklistItems/ci1',
        expect.objectContaining({
          method: 'PATCH',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({ isChecked: true }),
        }),
      );
    });

    it('encodes special characters in all three IDs', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.updateChecklistItem('l/1=', 't/2=', 'ci/3=', { isChecked: false });
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('%2F');
      expect(url).toContain('%3D');
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
      await expect(
        service.updateChecklistItem('list1', 'task1', 'ci1', { isChecked: true }),
      ).rejects.toThrow('Failed to update checklist item: Not Found');
    });
  });

  describe('deleteChecklistItem', () => {
    it('sends DELETE to the correct URL with auth header', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.deleteChecklistItem('list1', 'task1', 'ci1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1/checklistItems/ci1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      );
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
      await expect(service.deleteChecklistItem('list1', 'task1', 'ci1')).rejects.toThrow(
        'Failed to delete checklist item: Not Found',
      );
    });
  });

  describe('createTask', () => {
    it('POSTs to the correct URL with title and dueDateTime', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'task-new',
          title: 'Buy groceries',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          body: null,
          importance: 'normal',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      const result = await service.createTask('list1', { title: 'Buy groceries', dueDate: '2026-05-15' });

      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks',
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            Authorization: 'Bearer token',
            'Content-Type': 'application/json',
          }),
          body: JSON.stringify({
            title: 'Buy groceries',
            dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          }),
        }),
      );
      expect(result).toMatchObject({
        id: 'task-new',
        title: 'Buy groceries',
        listId: 'list1',
        dueDate: '2026-05-15',
        importance: 'normal',
      });
      expect(result.body).toBeUndefined();
    });

    it('includes body in payload when notes is provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'task-new',
          title: 'Task with notes',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          body: { content: 'Some notes' },
          importance: 'normal',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await service.createTask('list1', { title: 'Task with notes', dueDate: '2026-05-15', notes: 'Some notes' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.body).toEqual({ contentType: 'text', content: 'Some notes' });
    });

    it('omits body from payload when notes is not provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'task-new',
          title: 'No notes',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          body: null,
          importance: 'normal',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await service.createTask('list1', { title: 'No notes', dueDate: '2026-05-15' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.body).toBeUndefined();
    });

    it('encodes special characters in list ID', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'task-new',
          title: 'Task',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          body: null,
          importance: 'normal',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await service.createTask('list/id+1=', { title: 'Task', dueDate: '2026-05-15' });

      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('%2F');
      expect(url).toContain('%2B');
      expect(url).toContain('%3D');
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Bad Request' }));
      await expect(
        service.createTask('list1', { title: 'Task', dueDate: '2026-05-15' }),
      ).rejects.toThrow('Failed to create task: Bad Request');
    });

    it('includes daily recurrence pattern when frequency is daily', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'task-new', title: 'Daily task',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          body: null, importance: 'normal',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await service.createTask('list1', {
        title: 'Daily task',
        dueDate: '2026-05-15',
        recurrence: { frequency: 'daily', interval: 1 },
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.recurrence).toEqual({
        pattern: { type: 'daily', interval: 1 },
        range: { type: 'noEnd', startDate: '2026-05-15' },
      });
    });

    it('includes weekly recurrence with daysOfWeek derived from the due date', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'task-new', title: 'Weekly task',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          body: null, importance: 'normal',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      // 2026-05-15 is a Friday
      await service.createTask('list1', {
        title: 'Weekly task',
        dueDate: '2026-05-15',
        recurrence: { frequency: 'weekly', interval: 2 },
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.recurrence).toEqual({
        pattern: { type: 'weekly', interval: 2, daysOfWeek: ['friday'] },
        range: { type: 'noEnd', startDate: '2026-05-15' },
      });
    });

    it('includes absoluteMonthly recurrence with dayOfMonth derived from the due date', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'task-new', title: 'Monthly task',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          body: null, importance: 'normal',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await service.createTask('list1', {
        title: 'Monthly task',
        dueDate: '2026-05-15',
        recurrence: { frequency: 'monthly', interval: 1 },
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.recurrence).toEqual({
        pattern: { type: 'absoluteMonthly', interval: 1, dayOfMonth: 15 },
        range: { type: 'noEnd', startDate: '2026-05-15' },
      });
    });

    it('includes absoluteYearly recurrence with dayOfMonth and month derived from the due date', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'task-new', title: 'Yearly task',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          body: null, importance: 'normal',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      // May = month 5
      await service.createTask('list1', {
        title: 'Yearly task',
        dueDate: '2026-05-15',
        recurrence: { frequency: 'yearly', interval: 1 },
      });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.recurrence).toEqual({
        pattern: { type: 'absoluteYearly', interval: 1, dayOfMonth: 15, month: 5 },
        range: { type: 'noEnd', startDate: '2026-05-15' },
      });
    });

    it('omits recurrence from payload when recurrence is not provided', async () => {
      const fetchMock = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({
          id: 'task-new', title: 'No recurrence',
          dueDateTime: { dateTime: '2026-05-15T00:00:00', timeZone: 'UTC' },
          body: null, importance: 'normal',
        }),
      });
      vi.stubGlobal('fetch', fetchMock);

      await service.createTask('list1', { title: 'No recurrence', dueDate: '2026-05-15' });

      const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as Record<string, unknown>;
      expect(body.recurrence).toBeUndefined();
    });
  });

  describe('deleteTask', () => {
    it('sends DELETE to the correct URL with auth header', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.deleteTask('list1', 'task1');
      expect(fetchMock).toHaveBeenCalledWith(
        'https://graph.microsoft.com/v1.0/me/todo/lists/list1/tasks/task1',
        expect.objectContaining({
          method: 'DELETE',
          headers: expect.objectContaining({ Authorization: 'Bearer token' }),
        }),
      );
    });

    it('encodes special characters in list and task IDs', async () => {
      const fetchMock = vi.fn().mockResolvedValue({ ok: true });
      vi.stubGlobal('fetch', fetchMock);
      await service.deleteTask('list/id+1=', 'task/id+2=');
      const url = fetchMock.mock.calls[0][0] as string;
      expect(url).toContain('%2F');
      expect(url).toContain('%2B');
      expect(url).toContain('%3D');
    });

    it('throws when Graph returns an error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Not Found' }));
      await expect(service.deleteTask('list1', 'task1')).rejects.toThrow('Failed to delete task: Not Found');
    });
  });
});

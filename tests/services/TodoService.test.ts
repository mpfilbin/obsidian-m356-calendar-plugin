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
  });
});

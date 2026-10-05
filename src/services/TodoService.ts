import { AuthService } from './AuthService';
import { M365TodoList, M365TodoItem, M365ChecklistItem, NewTaskInput, TaskRecurrence } from '../types';
import { GraphClient } from './GraphClient';
import { type Logger, NullLogger } from '../lib/logger';
import { toDateOnly } from '../lib/datetime';
import { Semaphore } from '../lib/semaphore';

const TODO_LIST_COLORS = [
  '#ef4444', '#f97316', '#eab308', '#84cc16',
  '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6',
  '#6366f1', '#a855f7', '#ec4899', '#78716c',
];

function hashListColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = ((hash << 5) - hash + id.charCodeAt(i)) | 0;
  }
  return TODO_LIST_COLORS[Math.abs(hash) % TODO_LIST_COLORS.length];
}

export class TodoService {
  private readonly semaphore = new Semaphore(2);
  private readonly graph: GraphClient;

  constructor(
    auth: AuthService,
    logger: Logger = new NullLogger(),
  ) {
    this.graph = new GraphClient(auth, logger);
  }

  private static taskPath(listId: string, taskId?: string): string {
    const base = `/me/todo/lists/${encodeURIComponent(listId)}/tasks`;
    return taskId === undefined ? base : `${base}/${encodeURIComponent(taskId)}`;
  }

  async getLists(): Promise<M365TodoList[]> {
    const data = await this.graph.json<{ value: Record<string, unknown>[] }>(
      'GET', '/me/todo/lists', 'fetch todo lists',
    );
    return data.value.map((list) => ({
      id: list.id as string,
      displayName: list.displayName as string,
      color: hashListColor(list.id as string),
    }));
  }

  async getTasks(listIds: string[], start: Date, end: Date): Promise<M365TodoItem[]> {
    if (listIds.length === 0) return [];
    const startStr = toDateOnly(start);
    const endStr = toDateOnly(end);
    const results = await Promise.all(
      listIds.map((id) => this.getTasksForList(id, startStr, endStr)),
    );
    return results.flat();
  }

  private async getTasksForList(listId: string, startDate: string, endDate: string): Promise<M365TodoItem[]> {
    // Completed tasks are never shown, so let Graph drop them server-side. The due-date
    // range is still filtered locally because dueDateTime isn't reliably filterable.
    const params = new URLSearchParams({
      $filter: "status ne 'completed'",
      $select: 'id,title,status,importance,dueDateTime,body',
    });

    await this.semaphore.acquire();
    let allTasks: Record<string, unknown>[];
    try {
      allTasks = await this.graph.getAll<Record<string, unknown>>(
        `${TodoService.taskPath(listId)}?${params}`, 'fetch tasks',
      );
    } finally {
      this.semaphore.release();
    }

    return allTasks
      .filter((task) => {
        if (task.status === 'completed') return false;
        const due = (task.dueDateTime as { dateTime: string } | null)?.dateTime;
        if (!due) return false;
        const dueDate = due.slice(0, 10);
        return dueDate >= startDate && dueDate <= endDate;
      })
      .map((task) => ({
        id: task.id as string,
        title: task.title as string,
        listId,
        dueDate: (task.dueDateTime as { dateTime: string }).dateTime.slice(0, 10),
        body: (task.body as { content: string } | null)?.content || undefined,
        importance: (task.importance as 'low' | 'normal' | 'high') ?? 'normal',
      }));
  }

  async completeTask(listId: string, taskId: string): Promise<void> {
    await this.graph.send('PATCH', TodoService.taskPath(listId, taskId), 'complete task', {
      body: { status: 'completed' },
    });
  }

  /** Changes only the due date of a task ("YYYY-MM-DD"). */
  async updateTaskDueDate(listId: string, taskId: string, dueDate: string): Promise<void> {
    await this.graph.send('PATCH', TodoService.taskPath(listId, taskId), 'reschedule task', {
      body: { dueDateTime: { dateTime: `${dueDate}T00:00:00`, timeZone: 'UTC' } },
    });
  }

  async deleteTask(listId: string, taskId: string): Promise<void> {
    await this.graph.send('DELETE', TodoService.taskPath(listId, taskId), 'delete task');
  }

  async getChecklistItems(listId: string, taskId: string): Promise<M365ChecklistItem[]> {
    const data = await this.graph.json<{ value: Record<string, unknown>[] }>(
      'GET', `${TodoService.taskPath(listId, taskId)}/checklistItems`, 'fetch checklist items',
    );
    return data.value.map((item) => ({
      id: item.id as string,
      displayName: item.displayName as string,
      isChecked: item.isChecked as boolean,
    }));
  }

  async createChecklistItem(listId: string, taskId: string, displayName: string): Promise<M365ChecklistItem> {
    const data = await this.graph.json<Record<string, unknown>>(
      'POST', `${TodoService.taskPath(listId, taskId)}/checklistItems`, 'create checklist item',
      { body: { displayName } },
    );
    return {
      id: data.id as string,
      displayName: data.displayName as string,
      isChecked: data.isChecked as boolean,
    };
  }

  async updateChecklistItem(
    listId: string,
    taskId: string,
    itemId: string,
    patch: Partial<Pick<M365ChecklistItem, 'isChecked' | 'displayName'>>,
  ): Promise<void> {
    await this.graph.send(
      'PATCH',
      `${TodoService.taskPath(listId, taskId)}/checklistItems/${encodeURIComponent(itemId)}`,
      'update checklist item',
      { body: patch },
    );
  }

  async deleteChecklistItem(listId: string, taskId: string, itemId: string): Promise<void> {
    await this.graph.send(
      'DELETE',
      `${TodoService.taskPath(listId, taskId)}/checklistItems/${encodeURIComponent(itemId)}`,
      'delete checklist item',
    );
  }

  async createTask(listId: string, input: NewTaskInput): Promise<M365TodoItem> {
    const body: Record<string, unknown> = {
      title: input.title,
      dueDateTime: {
        dateTime: `${input.dueDate}T00:00:00`,
        timeZone: 'UTC',
      },
    };

    if (input.notes) {
      body.body = { contentType: 'text', content: input.notes };
    }

    if (input.recurrence) {
      const dueDate = new Date(`${input.dueDate}T00:00:00`); // local time: we want local day-of-week
      body.recurrence = {
        pattern: TodoService.buildRecurrencePattern(input.recurrence, dueDate),
        range: { type: 'noEnd', startDate: input.dueDate },
      };
    }

    const data = await this.graph.json<Record<string, unknown>>(
      'POST', TodoService.taskPath(listId), 'create task', { body },
    );
    return {
      id: data.id as string,
      title: data.title as string,
      listId,
      dueDate: (data.dueDateTime as { dateTime: string } | undefined)?.dateTime.slice(0, 10) ?? input.dueDate,
      body: (data.body as { content: string } | undefined)?.content || undefined,
      importance: (data.importance as 'low' | 'normal' | 'high') ?? 'normal',
    };
  }

  private static buildRecurrencePattern(
    recurrence: TaskRecurrence,
    dueDate: Date,
  ): Record<string, unknown> {
    const DAYS_OF_WEEK = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
    switch (recurrence.frequency) {
      case 'daily':
        return { type: 'daily', interval: recurrence.interval };
      case 'weekly':
        return { type: 'weekly', interval: recurrence.interval, daysOfWeek: [DAYS_OF_WEEK[dueDate.getDay()]] };
      case 'monthly':
        return { type: 'absoluteMonthly', interval: recurrence.interval, dayOfMonth: dueDate.getDate() };
      case 'yearly':
        return { type: 'absoluteYearly', interval: recurrence.interval, dayOfMonth: dueDate.getDate(), month: dueDate.getMonth() + 1 };
      default: {
        const _exhaustive: never = recurrence.frequency;
        throw new Error(`Unsupported recurrence frequency: ${_exhaustive}`);
      }
    }
  }
}

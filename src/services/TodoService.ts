import { AuthService } from './AuthService';
import { M365TodoList, M365TodoItem, M365ChecklistItem, NewTaskInput, TaskRecurrence } from '../types';
import { fetchWithRetry } from '../lib/fetchWithRetry';
import { toDateOnly } from '../lib/datetime';
import { Semaphore } from '../lib/semaphore';

const GRAPH_BASE = 'https://graph.microsoft.com/v1.0';

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

  constructor(private readonly auth: AuthService) {}

  async getLists(): Promise<M365TodoList[]> {
    const token = await this.auth.getValidToken();
    const response = await fetchWithRetry(`${GRAPH_BASE}/me/todo/lists`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) throw new Error(`Failed to fetch todo lists: ${response.statusText}`);
    const data = await response.json() as { value: Record<string, unknown>[] };
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
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    let url: string | null = `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks`;
    const allTasks: Record<string, unknown>[] = [];

    await this.semaphore.acquire();
    try {
      while (url) {
        const response = await fetchWithRetry(url, { headers: { Authorization: `Bearer ${token}` } });
        if (!response.ok) throw new Error(`Failed to fetch tasks: ${response.statusText}`);
        const data = await response.json() as { value: Record<string, unknown>[]; '@odata.nextLink'?: string };
        allTasks.push(...data.value);
        url = data['@odata.nextLink'] ?? null;
      }
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
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'completed' }),
      },
    );
    if (!response.ok) throw new Error(`Failed to complete task: ${response.statusText}`);
  }

  async getChecklistItems(listId: string, taskId: string): Promise<M365ChecklistItem[]> {
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}/checklistItems`,
      { headers: { Authorization: `Bearer ${token}` } },
    );
    if (!response.ok) throw new Error(`Failed to fetch checklist items: ${response.statusText}`);
    const data = await response.json() as { value: Record<string, unknown>[] };
    return data.value.map((item) => ({
      id: item.id as string,
      displayName: item.displayName as string,
      isChecked: item.isChecked as boolean,
    }));
  }

  async createChecklistItem(listId: string, taskId: string, displayName: string): Promise<M365ChecklistItem> {
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}/checklistItems`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ displayName }),
      },
    );
    if (!response.ok) throw new Error(`Failed to create checklist item: ${response.statusText}`);
    const data = await response.json() as Record<string, unknown>;
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
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const encodedItemId = encodeURIComponent(itemId);
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}/checklistItems/${encodedItemId}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(patch),
      },
    );
    if (!response.ok) throw new Error(`Failed to update checklist item: ${response.statusText}`);
  }

  async deleteChecklistItem(listId: string, taskId: string, itemId: string): Promise<void> {
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);
    const encodedTaskId = encodeURIComponent(taskId);
    const encodedItemId = encodeURIComponent(itemId);
    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks/${encodedTaskId}/checklistItems/${encodedItemId}`,
      {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      },
    );
    if (!response.ok) throw new Error(`Failed to delete checklist item: ${response.statusText}`);
  }

  async createTask(listId: string, input: NewTaskInput): Promise<M365TodoItem> {
    const token = await this.auth.getValidToken();
    const encodedListId = encodeURIComponent(listId);

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

    const response = await fetchWithRetry(
      `${GRAPH_BASE}/me/todo/lists/${encodedListId}/tasks`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
      },
    );
    if (!response.ok) throw new Error(`Failed to create task: ${response.statusText}`);
    const data = await response.json() as Record<string, unknown>;
    return {
      id: data.id as string,
      title: data.title as string,
      listId,
      dueDate: input.dueDate,
      body: input.notes || undefined,
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
    }
  }
}

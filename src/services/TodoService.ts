import { AuthService } from './AuthService';
import { M365TodoList, M365TodoItem } from '../types';
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
}

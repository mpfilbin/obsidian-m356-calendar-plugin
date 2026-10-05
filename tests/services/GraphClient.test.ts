import { describe, it, expect, vi, afterEach } from 'vitest';
import { GraphClient } from '../../src/services/GraphClient';
import { AuthService } from '../../src/services/AuthService';

describe('GraphClient', () => {
  const auth = { getValidToken: vi.fn().mockResolvedValue('tok') } as unknown as AuthService;
  const client = new GraphClient(auth);

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('prefixes relative paths with the Graph base and sends the bearer token', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await client.send('GET', '/me/events', 'fetch events');
    expect(fetchMock).toHaveBeenCalledWith(
      'https://graph.microsoft.com/v1.0/me/events',
      { headers: { Authorization: 'Bearer tok' } },
    );
  });

  it('serialises bodies as JSON and merges extra headers', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await client.send('PATCH', '/x', 'update x', { body: { a: 1 }, headers: { Prefer: 'p' } });
    expect(fetchMock.mock.calls[0][1]).toEqual({
      method: 'PATCH',
      headers: { Authorization: 'Bearer tok', 'Content-Type': 'application/json', Prefer: 'p' },
      body: '{"a":1}',
    });
  });

  it('leaves absolute URLs untouched', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);
    await client.send('GET', 'https://graph.microsoft.com/v1.0/next?page=2', 'fetch');
    expect(fetchMock.mock.calls[0][0]).toBe('https://graph.microsoft.com/v1.0/next?page=2');
  });

  it('includes the Graph error message when the response has one', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      ok: false,
      status: 403,
      statusText: '',
      text: () => Promise.resolve(JSON.stringify({ error: { message: 'Access is denied' } })),
    }));
    await expect(client.send('GET', '/x', 'fetch x')).rejects.toThrow('Failed to fetch x: 403 (Access is denied)');
  });

  it('falls back to statusText when the body is unreadable', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, statusText: 'Forbidden' }));
    await expect(client.send('GET', '/x', 'fetch x')).rejects.toThrow('Failed to fetch x: Forbidden');
  });

  it('getAll follows @odata.nextLink and concatenates pages', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ value: [1, 2], '@odata.nextLink': 'https://graph.microsoft.com/v1.0/p2' }),
      })
      .mockResolvedValueOnce({ ok: true, json: () => Promise.resolve({ value: [3] }) });
    vi.stubGlobal('fetch', fetchMock);
    expect(await client.getAll<number>('/items', 'fetch items')).toEqual([1, 2, 3]);
    expect(fetchMock.mock.calls[1][0]).toBe('https://graph.microsoft.com/v1.0/p2');
  });
});

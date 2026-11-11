import type { AuthProvider } from './auth';
import type { WrappedKeys } from './crypto';

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export interface StoredItem {
  id: string;
  data: string;
  revision: number;
  updatedAt: string;
}

export interface AuditEntry {
  action: string;
  targetId: string | null;
  ip: string | null;
  at: string;
}

/** Cliente da API. Tudo que vai no corpo das requisições já está cifrado. */
export class Api {
  constructor(private readonly auth: AuthProvider) {}

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const token = await this.auth.getToken();
    const res = await fetch(`/api${path}`, {
      method,
      headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 204) return undefined as T;
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      const msg = (json as { message?: string | string[] }).message;
      throw new ApiError(res.status, Array.isArray(msg) ? msg.join('; ') : (msg ?? `Erro ${res.status}`));
    }
    return json as T;
  }

  async getKeys(): Promise<WrappedKeys | null> {
    try {
      return await this.request<WrappedKeys>('GET', '/keys');
    } catch (e) {
      if (e instanceof ApiError && e.status === 404) return null;
      throw e;
    }
  }
  putKeys(keys: WrappedKeys) {
    return this.request<{ ok: true }>('PUT', '/keys', keys);
  }
  listItems() {
    return this.request<StoredItem[]>('GET', '/items');
  }
  createItem(data: string) {
    return this.request<StoredItem>('POST', '/items', { data });
  }
  updateItem(id: string, data: string, revision: number) {
    return this.request<StoredItem>('PUT', `/items/${id}`, { data, revision });
  }
  deleteItem(id: string) {
    return this.request<void>('DELETE', `/items/${id}`);
  }
  audit() {
    return this.request<AuditEntry[]>('GET', '/audit');
  }
}

import {ADMIN_UID} from '@/lib/admin';
import {auth} from '@/lib/firebase';
import type {
  ActiveTimer,
  CreateTimeEntryInput,
  Project,
  TimeEntry,
  TimeEntryListResponse,
  UpdateTimeEntryInput,
} from '@/types/time-tracking';
import {
  timeEntryToWorkLog,
  type WorkLogWithSource,
} from '@/lib/time-entry-mappers';

const assertAdmin = (userId: string) => {
  if (userId !== ADMIN_UID) throw new Error('Unauthorized');
};

const getAuthHeaders = async (): Promise<HeadersInit> => {
  const token =
    (await auth.currentUser?.getIdToken().catch(() => undefined)) ||
    (process.env.NEXT_PUBLIC_USE_MOCK_AUTH === 'true' ? 'mock' : undefined);

  if (!token) return {'Content-Type': 'application/json'};
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const parseError = async (response: Response) => {
  try {
    const body = (await response.json()) as {error?: unknown};
    if (body?.error) return String(body.error);
  } catch {
    // ignore
  }
  return `Request failed: ${response.status}`;
};

const apiGet = async <T>(path: string): Promise<T> => {
  const response = await fetch(path, {
    cache: 'no-store',
    headers: await getAuthHeaders(),
  });
  if (!response.ok) throw new Error(await parseError(response));
  return response.json() as Promise<T>;
};

const apiMutate = async <T>(
  path: string,
  method: 'POST' | 'PUT' | 'DELETE',
  body?: unknown
): Promise<T> => {
  const response = await fetch(path, {
    method,
    headers: await getAuthHeaders(),
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!response.ok) throw new Error(await parseError(response));
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  return text ? (JSON.parse(text) as T) : (undefined as T);
};

export const getProjects = async (): Promise<Project[]> => {
  return apiGet<Project[]>('/api/projects');
};

export const getTimeEntriesPage = async (opts?: {
  limit?: number;
  cursor?: string | null;
  projectId?: string | null;
  source?: string | null;
}): Promise<TimeEntryListResponse> => {
  const params = new URLSearchParams();
  if (opts?.limit) params.set('limit', String(opts.limit));
  if (opts?.cursor) params.set('cursor', opts.cursor);
  if (opts?.projectId) params.set('projectId', opts.projectId);
  if (opts?.source) params.set('source', opts.source);
  const qs = params.toString();
  return apiGet<TimeEntryListResponse>(`/api/time-entries${qs ? `?${qs}` : ''}`);
};

/** Fetch all pages (bounded) for calculator totals. */
export const getAllTimeEntries = async (): Promise<TimeEntry[]> => {
  const all: TimeEntry[] = [];
  let cursor: string | null = null;
  for (let i = 0; i < 50; i++) {
    const page = await getTimeEntriesPage({limit: 500, cursor});
    all.push(...page.entries);
    if (!page.nextCursor) break;
    cursor = page.nextCursor;
  }
  return all;
};

export const getActiveTimerApi = async (): Promise<ActiveTimer | null> => {
  return apiGet<ActiveTimer | null>('/api/time-entries/active');
};

export const startTimerApi = async (
  userId: string,
  input: {description?: string; projectId?: string | null; rate?: number}
): Promise<ActiveTimer> => {
  assertAdmin(userId);
  return apiMutate<ActiveTimer>('/api/time-entries/start', 'POST', input);
};

export const stopTimerApi = async (
  userId: string,
  input?: {description?: string}
): Promise<TimeEntry> => {
  assertAdmin(userId);
  return apiMutate<TimeEntry>('/api/time-entries/stop', 'POST', input ?? {});
};

export const createTimeEntryApi = async (
  userId: string,
  input: CreateTimeEntryInput
): Promise<TimeEntry> => {
  assertAdmin(userId);
  return apiMutate<TimeEntry>('/api/time-entries', 'POST', input);
};

export const updateTimeEntryApi = async (
  userId: string,
  id: string,
  input: UpdateTimeEntryInput
): Promise<TimeEntry> => {
  assertAdmin(userId);
  return apiMutate<TimeEntry>(`/api/time-entries/${id}`, 'PUT', input);
};

export const deleteTimeEntryApi = async (
  userId: string,
  id: string
): Promise<void> => {
  assertAdmin(userId);
  await apiMutate(`/api/time-entries/${id}`, 'DELETE');
};

export type {WorkLogWithSource};

export const timeEntriesAsWorkLogs = (
  entries: TimeEntry[]
): WorkLogWithSource[] => {
  return entries.map((entry) => timeEntryToWorkLog(entry));
};

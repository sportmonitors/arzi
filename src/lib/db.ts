import {auth} from '@/lib/firebase';
import type {Payment, WorkLog} from '@/types';

const ADMIN_UID = process.env.NEXT_PUBLIC_ADMIN_UID;

const assertAdmin = (userId: string) => {
  if (!ADMIN_UID) throw new Error('ADMIN_UID is not configured');
  if (userId !== ADMIN_UID) throw new Error('Unauthorized');
};

const getAuthHeaders = async (): Promise<HeadersInit> => {
  const token = await auth.currentUser?.getIdToken().catch(() => undefined);
  if (!token) return {'Content-Type': 'application/json'};
  return {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${token}`,
  };
};

const parseError = async (response: Response) => {
  try {
    const body = await response.json();
    if (body?.error) return String(body.error);
  } catch {
    // ignore parse errors
  }
  return `Request failed: ${response.status}`;
};

const apiGet = async <T>(path: string): Promise<T> => {
  const response = await fetch(path, {cache: 'no-store'});
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

export const addWorkLog = async (
  userId: string,
  log: Omit<WorkLog, 'id'>
): Promise<WorkLog> => {
  assertAdmin(userId);
  return apiMutate<WorkLog>('/api/db/work-logs', 'POST', log);
};

export const getWorkLogs = async (_userId: string): Promise<WorkLog[]> => {
  return apiGet<WorkLog[]>('/api/db/work-logs');
};

export const updateWorkLog = async (
  userId: string,
  log: WorkLog
): Promise<void> => {
  assertAdmin(userId);
  if (!log.id) throw new Error('Log ID is required for update');
  await apiMutate(`/api/db/work-logs/${log.id}`, 'PUT', log);
};

export const deleteWorkLog = async (
  userId: string,
  id: string
): Promise<void> => {
  assertAdmin(userId);
  await apiMutate(`/api/db/work-logs/${id}`, 'DELETE');
};

export const addPayment = async (
  userId: string,
  payment: Omit<Payment, 'id'>
): Promise<Payment> => {
  assertAdmin(userId);
  return apiMutate<Payment>('/api/db/payments', 'POST', payment);
};

export const getPayments = async (_userId: string): Promise<Payment[]> => {
  return apiGet<Payment[]>('/api/db/payments');
};

export const updatePayment = async (
  userId: string,
  payment: Payment
): Promise<void> => {
  assertAdmin(userId);
  if (!payment.id) throw new Error('Payment ID is required for update');
  await apiMutate(`/api/db/payments/${payment.id}`, 'PUT', payment);
};

export const deletePayment = async (
  userId: string,
  id: string
): Promise<void> => {
  assertAdmin(userId);
  await apiMutate(`/api/db/payments/${id}`, 'DELETE');
};

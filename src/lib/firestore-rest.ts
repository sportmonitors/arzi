import https from 'node:https';
import {getProxyAgent, getProxyUrl} from '@/lib/proxy-agent';

const PROJECT_ID = 'arz-calculator';
const API_KEY = process.env.FIREBASE_API_KEY || 'AIzaSyAk3wTvoYAIQs2aQv0H_QvJMr6Y4wnRrBk';
const DATABASE_ROOT = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}/databases/(default)/documents`;

type FirestoreValue =
  | {stringValue: string}
  | {integerValue: string}
  | {doubleValue: number}
  | {booleanValue: boolean}
  | {timestampValue: string}
  | {nullValue: null};

type FirestoreFields = Record<string, FirestoreValue>;

type FirestoreDocument = {
  name: string;
  fields?: FirestoreFields;
};

type ListDocumentsResponse = {
  documents?: FirestoreDocument[];
  nextPageToken?: string;
  error?: {message: string; status: string; code: number};
};

export type FirestoreAuth = {
  idToken?: string;
};

const toFirestoreValue = (value: unknown): FirestoreValue => {
  if (value === null || value === undefined) return {nullValue: null};
  if (typeof value === 'boolean') return {booleanValue: value};
  if (typeof value === 'string') return {stringValue: value};
  if (typeof value === 'number') {
    return Number.isInteger(value)
      ? {integerValue: String(value)}
      : {doubleValue: value};
  }
  if (value instanceof Date) return {timestampValue: value.toISOString()};
  return {stringValue: String(value)};
};

const fromFirestoreValue = (value: FirestoreValue): unknown => {
  if ('stringValue' in value) return value.stringValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('nullValue' in value) return null;
  return null;
};

export const encodeFields = (data: Record<string, unknown>): FirestoreFields => {
  const fields: FirestoreFields = {};
  for (const [key, value] of Object.entries(data)) {
    if (value === undefined) continue;
    fields[key] = toFirestoreValue(value);
  }
  return fields;
};

export const decodeDocument = <T extends {id?: string}>(
  doc: FirestoreDocument
): T => {
  const id = doc.name.split('/').pop() || '';
  const data: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(doc.fields || {})) {
    if (key === 'createdAt') continue;
    data[key] = fromFirestoreValue(value);
  }
  return {id, ...data} as T;
};

const requestFirestore = <T>(
  method: string,
  path: string,
  body?: unknown,
  auth?: FirestoreAuth
): Promise<T> =>
  new Promise((resolve, reject) => {
    const url = new URL(`${DATABASE_ROOT}${path}`);
    url.searchParams.set('key', API_KEY);

    const payload = body === undefined ? undefined : JSON.stringify(body);
    const headers: Record<string, string> = {
      Accept: 'application/json',
    };
    if (payload) {
      headers['Content-Type'] = 'application/json';
      headers['Content-Length'] = Buffer.byteLength(payload).toString();
    }
    if (auth?.idToken) {
      headers.Authorization = `Bearer ${auth.idToken}`;
    }

    const request = https.request(
      url,
      {
        method,
        agent: getProxyAgent(getProxyUrl()),
        headers,
        timeout: 30000,
      },
      (response) => {
        let raw = '';
        response.setEncoding('utf8');
        response.on('data', (chunk) => {
          raw += chunk;
        });
        response.on('end', () => {
          let parsed: T & {error?: {message: string; status: string}} =
            {} as T & {error?: {message: string; status: string}};
          if (raw) {
            try {
              parsed = JSON.parse(raw);
            } catch (error) {
              reject(error);
              return;
            }
          }

          if (
            !response.statusCode ||
            response.statusCode < 200 ||
            response.statusCode >= 300
          ) {
            const message =
              parsed?.error?.message ||
              `Firestore ${method} failed: ${response.statusCode}`;
            reject(new Error(message));
            return;
          }

          resolve(parsed);
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error('Firestore request timed out'));
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });

export const listCollection = async <T extends {id?: string}>(
  collectionPath: string,
  options?: {orderBy?: string; pageSize?: number}
): Promise<T[]> => {
  const pageSize = options?.pageSize ?? 500;
  const results: T[] = [];
  let pageToken: string | undefined;

  do {
    const params = new URLSearchParams();
    params.set('pageSize', String(pageSize));
    if (options?.orderBy) params.set('orderBy', options.orderBy);
    if (pageToken) params.set('pageToken', pageToken);

    const query = params.toString();
    const response = await requestFirestore<ListDocumentsResponse>(
      'GET',
      `/${collectionPath}?${query}`
    );

    for (const doc of response.documents || []) {
      results.push(decodeDocument<T>(doc));
    }
    pageToken = response.nextPageToken;
  } while (pageToken);

  return results;
};

export const createDocument = async <T extends {id?: string}>(
  collectionPath: string,
  data: Record<string, unknown>,
  auth?: FirestoreAuth
): Promise<T> => {
  const response = await requestFirestore<FirestoreDocument>(
    'POST',
    `/${collectionPath}`,
    {fields: encodeFields(data)},
    auth
  );
  return decodeDocument<T>(response);
};

export const updateDocument = async (
  documentPath: string,
  data: Record<string, unknown>,
  auth?: FirestoreAuth
): Promise<void> => {
  const fields = encodeFields(data);
  const fieldPaths = Object.keys(fields);
  const mask = fieldPaths.map((path) => `updateMask.fieldPaths=${encodeURIComponent(path)}`).join('&');
  await requestFirestore(
    'PATCH',
    `/${documentPath}?${mask}`,
    {fields},
    auth
  );
};

export const deleteDocument = async (
  documentPath: string,
  auth?: FirestoreAuth
): Promise<void> => {
  await requestFirestore('DELETE', `/${documentPath}`, undefined, auth);
};

export const adminCollectionPath = (
  adminUid: string,
  store: 'payments' | 'work-logs'
) => `users/${adminUid}/${store}`;

export const adminDocumentPath = (
  adminUid: string,
  store: 'payments' | 'work-logs',
  id: string
) => `${adminCollectionPath(adminUid, store)}/${id}`;

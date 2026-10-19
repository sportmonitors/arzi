export type TimeEntrySource = 'clockify_import' | 'timer' | 'manual';

export interface Project {
  id: string;
  name: string;
  color?: string | null;
  clientId?: string | null;
  clientName?: string | null;
}

export interface Tag {
  id: string;
  name: string;
}

export interface TimeEntry {
  id: string;
  description: string;
  userId?: string | null;
  userName?: string | null;
  userEmail?: string | null;
  startAt: string;
  endAt?: string | null;
  durationSeconds: number;
  timeZone: string;
  projectId?: string | null;
  projectName?: string | null;
  projectColor?: string | null;
  clientName?: string | null;
  billable: boolean;
  currency: string;
  rate: number;
  amount?: number | null;
  earnedAmount?: number | null;
  source: TimeEntrySource;
  tagIds?: string[];
  tagNames?: string[];
  createdAt?: string;
  updatedAt?: string;
}

export interface ActiveTimer {
  userId: string;
  description: string;
  projectId?: string | null;
  rate: number;
  startedAt: string;
  projectName?: string | null;
}

export interface TimeEntryListResponse {
  entries: TimeEntry[];
  nextCursor: string | null;
}

export interface CreateTimeEntryInput {
  description: string;
  startAt: string;
  endAt: string;
  rate?: number;
  projectId?: string | null;
  billable?: boolean;
  source?: 'manual' | 'timer';
}

export interface UpdateTimeEntryInput {
  description?: string;
  startAt?: string;
  endAt?: string;
  rate?: number;
  projectId?: string | null;
  billable?: boolean;
}

export interface StartTimerInput {
  description?: string;
  projectId?: string | null;
  rate?: number;
}

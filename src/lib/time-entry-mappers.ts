import type {TimeEntry} from '@/types/time-tracking';
import type {WorkLog} from '@/types';

const DEFAULT_RATE = 8.12;

export type WorkLogWithSource = WorkLog & {
  source?: string;
  projectName?: string;
};

export function timeEntryToWorkLog(entry: TimeEntry): WorkLogWithSource {
  const rate = entry.rate > 0 ? entry.rate : DEFAULT_RATE;
  return {
    id: entry.id,
    description: entry.description || 'بدون شرح',
    hours: entry.durationSeconds / 3600,
    rate,
    start: entry.startAt,
    end: entry.endAt || entry.startAt,
    isManual: entry.source === 'manual',
    source: entry.source,
    projectName: entry.projectName ?? undefined,
  };
}

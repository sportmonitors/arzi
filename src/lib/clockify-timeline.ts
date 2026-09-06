import type {WorkLog} from '@/types';

export type TimelineSegment = {
  id: string;
  startMs: number;
  endMs: number;
  hours: number;
  description: string;
};

/** Gregorian day key for aggregation (YYYY-MM-DD). */
export const toDayKey = (ms: number): string => {
  const d = new Date(ms);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export const dayKeyStartMs = (dayKey: string): number => {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, 0, 0, 0, 0).getTime();
};

export const dayKeyEndMs = (dayKey: string): number => {
  const [y, m, d] = dayKey.split('-').map(Number);
  return new Date(y, m - 1, d, 23, 59, 59, 999).getTime();
};

export const buildTimelineSegments = (logs: WorkLog[]): TimelineSegment[] => {
  const segments: TimelineSegment[] = [];

  for (const log of logs) {
    const startMs = Date.parse(log.start);
    const endMs = Date.parse(log.end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || endMs <= startMs) {
      continue;
    }

    segments.push({
      id: log.id || `${startMs}-${endMs}`,
      startMs,
      endMs,
      hours: log.hours > 0 ? log.hours : (endMs - startMs) / 3_600_000,
      description: log.description || 'بدون شرح',
    });
  }

  segments.sort((a, b) => a.startMs - b.startMs);
  return segments;
};

/** Opacity / visual weight for a stretch of work hours. */
export const intensityForHours = (hours: number): number => {
  if (hours <= 0) return 0.06;
  if (hours < 1) return 0.22;
  if (hours < 2) return 0.35;
  if (hours < 4) return 0.5;
  if (hours < 6) return 0.68;
  if (hours < 8) return 0.82;
  return 0.95;
};

export const formatFaDateLabel = (ms: number, opts?: Intl.DateTimeFormatOptions) =>
  new Intl.DateTimeFormat('fa-IR', opts ?? {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(ms));

export const formatFaMonth = (ms: number) =>
  new Intl.DateTimeFormat('fa-IR', {month: 'short'}).format(new Date(ms));

export const formatFaDay = (ms: number) =>
  new Intl.DateTimeFormat('fa-IR', {day: 'numeric'}).format(new Date(ms));

export const formatFaWeekday = (ms: number) =>
  new Intl.DateTimeFormat('fa-IR', {weekday: 'short'}).format(new Date(ms));

export const formatFaTime = (ms: number) =>
  new Intl.DateTimeFormat('fa-IR', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date(ms));

export const formatDurationFa = (hours: number) => {
  const totalMinutes = Math.max(0, Math.round(hours * 60));
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h === 0) return `${m} دقیقه`;
  if (m === 0) return `${h} ساعت`;
  return `${h} ساعت و ${m} دقیقه`;
};

export const currentYearWindow = (now = new Date()) => {
  const year = now.getFullYear();
  return {
    startMs: new Date(year, 0, 1, 0, 0, 0, 0).getTime(),
    endMs: new Date(year, 11, 31, 23, 59, 59, 999).getTime(),
  };
};

export type ZoomLevel = 'year' | 'month' | 'week' | 'day' | 'hour';

export const zoomLevelForSpan = (spanMs: number): ZoomLevel => {
  const day = 86_400_000;
  if (spanMs > day * 120) return 'year';
  if (spanMs > day * 20) return 'month';
  if (spanMs > day * 3) return 'week';
  if (spanMs > day * 0.6) return 'day';
  return 'hour';
};

export const clampWindow = (
  startMs: number,
  endMs: number,
  minSpanMs: number,
  maxSpanMs: number,
  hardStart: number,
  hardEnd: number
) => {
  let span = endMs - startMs;
  span = Math.min(maxSpanMs, Math.max(minSpanMs, span));
  let mid = (startMs + endMs) / 2;
  let nextStart = mid - span / 2;
  let nextEnd = mid + span / 2;

  if (nextStart < hardStart) {
    nextStart = hardStart;
    nextEnd = hardStart + span;
  }
  if (nextEnd > hardEnd) {
    nextEnd = hardEnd;
    nextStart = hardEnd - span;
  }
  if (nextStart < hardStart) nextStart = hardStart;

  return {startMs: nextStart, endMs: nextEnd};
};

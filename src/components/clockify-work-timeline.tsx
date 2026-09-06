'use client';

import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import type {WorkLog} from '@/types';
import {cn} from '@/lib/utils';
import {
  buildTimelineSegments,
  clampWindow,
  currentYearWindow,
  dayKeyEndMs,
  dayKeyStartMs,
  formatDurationFa,
  formatFaDateLabel,
  formatFaDay,
  formatFaMonth,
  formatFaTime,
  intensityForHours,
  toDayKey,
  zoomLevelForSpan,
  type TimelineSegment,
} from '@/lib/clockify-timeline';

type ClockifyWorkTimelineProps = {
  logs: WorkLog[];
  className?: string;
  onSelectDay?: (dayKey: string | null) => void;
  selectedDayKey?: string | null;
};

type HoverInfo = {
  x: number;
  y: number;
  segment: TimelineSegment;
};

const TRACK_X = 14;
const TRACK_W = 8;
const VIEW_W = 36;
const MIN_SPAN_MS = 6 * 3_600_000;
const DAY_MS = 86_400_000;

export default function ClockifyWorkTimeline({
  logs,
  className,
  onSelectDay,
  selectedDayKey,
}: ClockifyWorkTimelineProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState(420);
  const yearWindow = useMemo(() => currentYearWindow(), []);
  const hardStart = yearWindow.startMs;
  const hardEnd = yearWindow.endMs;
  const maxSpanMs = hardEnd - hardStart;

  const [view, setView] = useState(() => ({...yearWindow}));
  const viewRef = useRef(view);
  viewRef.current = view;

  const [hover, setHover] = useState<HoverInfo | null>(null);
  const dragRef = useRef<{y: number; startMs: number; endMs: number} | null>(
    null
  );

  const segments = useMemo(() => buildTimelineSegments(logs), [logs]);

  const yearSegments = useMemo(
    () => segments.filter((s) => s.endMs >= hardStart && s.startMs <= hardEnd),
    [segments, hardStart, hardEnd]
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const sync = () => setHeight(Math.max(280, el.clientHeight));
    sync();
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Non-passive wheel so we can prevent page scroll while zooming.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;

    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();

      const rect = el.getBoundingClientRect();
      const y = event.clientY - rect.top;
      const current = viewRef.current;
      const span = current.endMs - current.startMs;
      const anchorMs = current.startMs + (y / Math.max(1, el.clientHeight)) * span;
      const zoomIn = event.deltaY < 0;
      const factor = zoomIn ? 0.82 : 1.22;
      const nextSpan = Math.min(
        maxSpanMs,
        Math.max(MIN_SPAN_MS, span * factor)
      );
      const ratio = (anchorMs - current.startMs) / span;
      const nextStart = anchorMs - ratio * nextSpan;
      const nextEnd = nextStart + nextSpan;
      setView(
        clampWindow(
          nextStart,
          nextEnd,
          MIN_SPAN_MS,
          maxSpanMs,
          hardStart,
          hardEnd
        )
      );
    };

    el.addEventListener('wheel', onWheel, {passive: false});
    return () => el.removeEventListener('wheel', onWheel);
  }, [hardStart, hardEnd, maxSpanMs]);

  const spanMs = view.endMs - view.startMs;
  const level = zoomLevelForSpan(spanMs);

  const msToY = useCallback(
    (ms: number) => ((ms - view.startMs) / spanMs) * height,
    [view.startMs, spanMs, height]
  );

  const visibleSegments = useMemo(() => {
    const pad = spanMs * 0.02;
    return yearSegments.filter(
      (s) => s.endMs >= view.startMs - pad && s.startMs <= view.endMs + pad
    );
  }, [yearSegments, view.startMs, view.endMs, spanMs]);

  const emptyDayTicks = useMemo(() => {
    if (level === 'year') return [] as number[];
    const ticks: number[] = [];
    const startDay = new Date(view.startMs);
    startDay.setHours(0, 0, 0, 0);
    const worked = new Set(visibleSegments.map((s) => toDayKey(s.startMs)));
    let cursor = startDay.getTime();
    let guard = 0;
    while (cursor <= view.endMs && guard < 400) {
      if (!worked.has(toDayKey(cursor))) ticks.push(cursor);
      cursor += DAY_MS;
      guard += 1;
    }
    return ticks;
  }, [level, view.startMs, view.endMs, visibleSegments]);

  const scaleMarks = useMemo(() => {
    const marks: {y: number; major: boolean; key: string}[] = [];
    if (level === 'year') {
      for (let m = 0; m < 12; m++) {
        const ms = new Date(new Date(hardStart).getFullYear(), m, 1).getTime();
        if (ms < view.startMs || ms > view.endMs) continue;
        marks.push({key: `m-${m}`, y: msToY(ms), major: true});
      }
    } else if (level === 'month' || level === 'week') {
      const start = new Date(view.startMs);
      start.setHours(0, 0, 0, 0);
      let cursor = start.getTime();
      let i = 0;
      while (cursor <= view.endMs && i < 90) {
        marks.push({
          key: `d-${cursor}`,
          y: msToY(cursor),
          major: new Date(cursor).getDay() === 6 || level === 'week',
        });
        cursor += DAY_MS;
        i += 1;
      }
    } else {
      const start = new Date(view.startMs);
      start.setMinutes(0, 0, 0);
      let cursor = start.getTime();
      let i = 0;
      const step = level === 'day' ? 3_600_000 : 30 * 60_000;
      while (cursor <= view.endMs && i < 96) {
        const hour = new Date(cursor).getHours();
        marks.push({
          key: `h-${cursor}`,
          y: msToY(cursor),
          major: hour % 3 === 0,
        });
        cursor += step;
        i += 1;
      }
    }
    return marks;
  }, [level, hardStart, view.startMs, view.endMs, msToY]);

  const rangeLabel = useMemo(() => {
    if (level === 'year') {
      return new Intl.DateTimeFormat('fa-IR', {year: 'numeric'}).format(
        new Date(view.startMs)
      );
    }
    if (level === 'month') {
      return `${formatFaMonth(view.startMs)} – ${formatFaMonth(view.endMs)}`;
    }
    if (level === 'week') {
      return `${formatFaDay(view.startMs)} تا ${formatFaDay(view.endMs)} ${formatFaMonth(view.endMs)}`;
    }
    return formatFaDateLabel(view.startMs, {
      month: 'short',
      day: 'numeric',
    });
  }, [level, view.startMs, view.endMs]);

  const onPointerDown = (event: React.PointerEvent) => {
    if (event.button !== 0) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = {
      y: event.clientY,
      startMs: view.startMs,
      endMs: view.endMs,
    };
  };

  const onPointerMove = (event: React.PointerEvent) => {
    const drag = dragRef.current;
    if (!drag) return;
    const dy = event.clientY - drag.y;
    const deltaMs = -(dy / height) * (drag.endMs - drag.startMs);
    setView(
      clampWindow(
        drag.startMs + deltaMs,
        drag.endMs + deltaMs,
        MIN_SPAN_MS,
        maxSpanMs,
        hardStart,
        hardEnd
      )
    );
  };

  const onPointerUp = () => {
    dragRef.current = null;
  };

  const resetView = () => {
    setView({...yearWindow});
    onSelectDay?.(null);
  };

  if (yearSegments.length === 0) {
    return (
      <div
        ref={containerRef}
        className={cn(
          'flex h-full w-9 shrink-0 flex-col items-center justify-center rounded-xl border border-border/60 bg-card/40',
          className
        )}
        title="پس از همگام‌سازی Clockify، توزیع زمانی اینجا نمایش داده می‌شود"
      >
        <div className="h-[70%] w-1.5 rounded-full bg-muted/80" />
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={cn(
        'relative flex h-full w-9 shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/50',
        className
      )}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
      onDoubleClick={resetView}
      role="img"
      aria-label="توزیع زمانی ساعات کاری Clockify — اسکرول برای زوم"
      title="اسکرول: زوم · درگ: جابه‌جایی · دابل‌کلیک: نمای سال"
    >
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 truncate bg-gradient-to-b from-card/95 to-transparent px-0.5 pb-3 pt-1 text-center text-[8px] leading-3 text-muted-foreground">
        {rangeLabel}
      </div>

      <svg
        width={VIEW_W}
        height={height}
        className="h-full w-full touch-none select-none"
        style={{cursor: 'ns-resize'}}
      >
        <rect
          x={TRACK_X}
          y={0}
          width={TRACK_W}
          height={height}
          rx={3}
          className="fill-muted/35"
        />

        {scaleMarks.map((mark) =>
          mark.y < 0 || mark.y > height ? null : (
            <line
              key={mark.key}
              x1={mark.major ? TRACK_X - 3 : TRACK_X - 1}
              x2={TRACK_X}
              y1={mark.y}
              y2={mark.y}
              stroke="hsl(215 15% 55% / 0.55)"
              strokeWidth={mark.major ? 1 : 0.6}
            />
          )
        )}

        {emptyDayTicks.map((ms) => {
          const y = msToY(ms + DAY_MS / 2);
          if (y < -2 || y > height + 2) return null;
          return (
            <rect
              key={`empty-${ms}`}
              x={TRACK_X + 2.5}
              y={y - 0.35}
              width={TRACK_W - 5}
              height={0.7}
              className="fill-muted-foreground/25"
            />
          );
        })}

        {visibleSegments.map((seg) => {
          const y1 = msToY(seg.startMs);
          const y2 = msToY(seg.endMs);
          const top = Math.min(y1, y2);
          const rawH = Math.abs(y2 - y1);
          const h = Math.max(rawH, level === 'year' ? 1.15 : 2);
          if (top > height || top + h < 0) return null;

          const opacity = intensityForHours(seg.hours);
          const dayKey = toDayKey(seg.startMs);
          const isSelected = selectedDayKey === dayKey;

          return (
            <rect
              key={seg.id}
              x={TRACK_X + (isSelected ? 0 : 1)}
              y={top}
              width={TRACK_W - (isSelected ? 0 : 2)}
              height={h}
              rx={1.5}
              fill={`hsl(166 72% 45% / ${opacity})`}
              stroke={isSelected ? 'hsl(166 80% 72%)' : 'transparent'}
              strokeWidth={isSelected ? 1 : 0}
              onMouseEnter={(e) => {
                const rect = containerRef.current?.getBoundingClientRect();
                if (!rect) return;
                setHover({
                  segment: seg,
                  x: rect.right + 8,
                  y: e.clientY,
                });
              }}
              onMouseMove={(e) => {
                setHover((prev) =>
                  prev ? {...prev, y: e.clientY, segment: seg} : prev
                );
              }}
              onMouseLeave={() => setHover(null)}
              onClick={(e) => {
                e.stopPropagation();
                onSelectDay?.(selectedDayKey === dayKey ? null : dayKey);
              }}
            />
          );
        })}
      </svg>

      {hover && (
        <div
          className="pointer-events-none fixed z-[80] max-w-[220px] rounded-lg border border-border bg-popover px-2.5 py-2 text-[11px] leading-5 text-popover-foreground shadow-lg"
          style={{
            left: Math.min(hover.x, window.innerWidth - 230),
            top: Math.min(Math.max(8, hover.y - 10), window.innerHeight - 130),
          }}
        >
          <div className="font-semibold">
            {formatFaDateLabel(hover.segment.startMs, {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
            })}
          </div>
          <div className="text-muted-foreground">
            {formatDurationFa(hover.segment.hours)}
          </div>
          <div className="font-tabular">
            {formatFaTime(hover.segment.startMs)} تا{' '}
            {formatFaTime(hover.segment.endMs)}
          </div>
          <div className="mt-0.5 line-clamp-2 text-muted-foreground">
            {hover.segment.description}
          </div>
        </div>
      )}
    </div>
  );
}

export const filterLogsByDayKey = (logs: WorkLog[], dayKey: string | null) => {
  if (!dayKey) return logs;
  const start = dayKeyStartMs(dayKey);
  const end = dayKeyEndMs(dayKey);
  return logs.filter((log) => {
    const s = Date.parse(log.start);
    return Number.isFinite(s) && s >= start && s <= end;
  });
};

import type { FreezeStop, SpeedSegment, VideoTagEvent } from '$lib/types';

export interface FreezeStopExportPayload {
  time: number;
  duration: number;
  overlay_base64: string | null;
}

export interface SpeedSegmentExportPayload {
  start_sec: number;
  end_sec: number;
  rate: number;
}

export function getEffectiveFreezeStopsForTag(
  tag: Pick<VideoTagEvent, 'startTime' | 'endTime' | 'freezeStops' | 'freezeTimestamp' | 'pauseDuration'>,
  fallbackPauseDuration?: number
): FreezeStop[] {
  const start = tag.startTime;
  const end = Math.max(start + 0.2, tag.endTime);

  if (tag.freezeStops && tag.freezeStops.length > 0) {
    const valid = tag.freezeStops
      .filter((s) => s.duration >= 0.2)
      .map((s) => ({
        ...s,
        time: Math.max(start, Math.min(end, s.time)),
      }))
      .sort((a, b) => a.time - b.time);

    const deduped: FreezeStop[] = [];
    for (const stop of valid) {
      const prev = deduped[deduped.length - 1];
      if (prev && Math.abs(stop.time - prev.time) <= 0.05) {
        continue;
      }
      deduped.push(stop);
    }
    return deduped;
  }

  const pd = tag.pauseDuration ?? fallbackPauseDuration ?? 3.0;
  if (pd >= 0.2) {
    const rawTime = tag.freezeTimestamp ?? (start + end) / 2;
    return [
      {
        id: 'legacy-freeze',
        time: Math.max(start, Math.min(end, rawTime)),
        duration: pd,
        label: 'Jeda Freeze',
      },
    ];
  }

  return [];
}

/**
 * Clamp, sort, and resolve non-overlapping speed segments within a clip's [startTime, endTime].
 */
export function getEffectiveSpeedSegmentsForTag(
  tag: Pick<VideoTagEvent, 'startTime' | 'endTime' | 'speedSegments'>
): SpeedSegment[] {
  const start = tag.startTime;
  const end = Math.max(start + 0.2, tag.endTime);
  const raw = tag.speedSegments;
  if (!raw || raw.length === 0) return [];

  const valid = raw
    .map((s) => ({
      ...s,
      startTime: Math.max(start, Math.min(end, s.startTime)),
      endTime: Math.max(start, Math.min(end, s.endTime)),
      rate: Math.max(0.25, Math.min(4.0, Number(s.rate) || 1.0)),
    }))
    .filter((s) => s.endTime - s.startTime >= 0.15 && Math.abs(s.rate - 1.0) > 0.02)
    .sort((a, b) => a.startTime - b.startTime);

  const nonOverlapping: SpeedSegment[] = [];
  for (const seg of valid) {
    const prev = nonOverlapping[nonOverlapping.length - 1];
    if (prev && seg.startTime < prev.endTime) {
      const trimmedStart = prev.endTime;
      if (seg.endTime - trimmedStart >= 0.15) {
        nonOverlapping.push({ ...seg, startTime: trimmedStart });
      }
      continue;
    }
    nonOverlapping.push(seg);
  }
  return nonOverlapping;
}

export function toSpeedSegmentsExportPayload(
  tag: Pick<VideoTagEvent, 'startTime' | 'endTime' | 'speedSegments'>
): SpeedSegmentExportPayload[] {
  return getEffectiveSpeedSegmentsForTag(tag).map((s) => ({
    start_sec: s.startTime,
    end_sec: s.endTime,
    rate: s.rate,
  }));
}

/**
 * Estimate total rendered output duration in seconds (moving segments scaled by speed + freeze durations + optional clean replay).
 */
export function estimateClipRenderedDuration(
  tag: Pick<
    VideoTagEvent,
    'startTime' | 'endTime' | 'freezeStops' | 'freezeTimestamp' | 'pauseDuration' | 'speedSegments' | 'appendCleanReplay'
  >,
  includeTelestration: boolean
): number {
  const base = Math.max(0.2, tag.endTime - tag.startTime);
  const segs = getEffectiveSpeedSegmentsForTag(tag);
  let movingDur = base;
  for (const seg of segs) {
    const span = Math.max(0, seg.endTime - seg.startTime);
    movingDur += span / seg.rate - span;
  }
  if (!includeTelestration) return movingDur;
  const stops = getEffectiveFreezeStopsForTag(tag, tag.pauseDuration ?? 3.0);
  const freeze = stops.reduce((s, st) => s + st.duration, 0);
  return movingDur + freeze + (tag.appendCleanReplay ? base : 0);
}

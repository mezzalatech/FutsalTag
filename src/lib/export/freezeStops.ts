import type { FreezeStop, VideoTagEvent } from '$lib/types';

export interface FreezeStopExportPayload {
  time: number;
  duration: number;
  overlay_base64: string | null;
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

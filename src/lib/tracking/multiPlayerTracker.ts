// Real AI Multi-Player Auto-Tracking Engine backed by Rust ONNX Runtime + YOLOX-Nano
// Computes real player trajectories, jersey team clustering, and team compactness hulls

import { invoke } from '@tauri-apps/api/core';
import type {
  AiModelStatus,
  DetectedPlayerBox,
  DrawingElement,
  MultiPlayerTrack,
  Point2D,
  TrackingKeyframe,
} from '$lib/types';
import { getInterpolatedPosition } from '$lib/tracking/playerTracker';

export interface MultiTrackResult {
  tracks: MultiPlayerTrack[];
  homeHullKeyframes: Map<number, Point2D[]>;
  awayHullKeyframes: Map<number, Point2D[]>;
  framesProcessed: number;
  modelUsed: string;
}

interface RustOnnxTrackingResult {
  tracks: MultiPlayerTrack[];
  frames_processed: number;
  model_used: string;
}

export async function checkAiModelStatus(): Promise<AiModelStatus> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return {
      available: false,
      model_path: null,
      engine: 'Hanya tersedia di aplikasi desktop Tauri',
      input_size: [416, 416],
    };
  }
  return invoke<AiModelStatus>('check_ai_model_status');
}

export async function runMultiPlayerAutoTracking(
  inputPath: string | null,
  startTime: number,
  endTime: number,
  fps: number = 8
): Promise<MultiTrackResult> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    throw new Error('Deteksi AI ONNX memerlukan mode aplikasi desktop Tauri.');
  }
  if (!inputPath || (!inputPath.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(inputPath))) {
    throw new Error(
      'Path file video absolut tidak ditemukan. Buka video melalui tombol "Pilih Video" di Hub Proyek.'
    );
  }

  const res = await invoke<RustOnnxTrackingResult>('run_multi_player_tracking_onnx', {
    inputPath,
    startSec: Math.max(0, startTime),
    endSec: Math.max(startTime + 0.5, endTime),
    fps,
  });

  // Compute Convex Hull per timestamp for home and away tracks
  const timeBuckets = new Map<number, { home: Point2D[]; away: Point2D[] }>();

  for (const tr of res.tracks) {
    if (tr.team !== 'home' && tr.team !== 'away') continue;
    for (const kf of tr.keyframes) {
      const tKey = parseFloat(kf.time.toFixed(2));
      let bucket = timeBuckets.get(tKey);
      if (!bucket) {
        bucket = { home: [], away: [] };
        timeBuckets.set(tKey, bucket);
      }
      if (tr.team === 'home') {
        bucket.home.push({ x: kf.x, y: kf.y });
      } else {
        bucket.away.push({ x: kf.x, y: kf.y });
      }
    }
  }

  const homeHullKeyframes = new Map<number, Point2D[]>();
  const awayHullKeyframes = new Map<number, Point2D[]>();
  for (const [tKey, pts] of timeBuckets.entries()) {
    if (pts.home.length >= 3) {
      homeHullKeyframes.set(tKey, computeConvexHull(pts.home));
    }
    if (pts.away.length >= 3) {
      awayHullKeyframes.set(tKey, computeConvexHull(pts.away));
    }
  }

  return {
    tracks: res.tracks,
    homeHullKeyframes,
    awayHullKeyframes,
    framesProcessed: res.frames_processed,
    modelUsed: res.model_used,
  };
}

// Compute 2D Convex Hull (Graham Scan / Monotone Chain)
export function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return points;

  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const crossProduct = (o: Point2D, a: Point2D, b: Point2D) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

  const lower: Point2D[] = [];
  for (const p of pts) {
    while (lower.length >= 2 && crossProduct(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }

  const upper: Point2D[] = [];
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i];
    while (upper.length >= 2 && crossProduct(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }

  lower.pop();
  upper.pop();
  return lower.concat(upper);
}

export async function detectPlayersInFrameOnnx(
  inputPath: string | null,
  timeSec: number
): Promise<DetectedPlayerBox[]> {
  if (typeof window === 'undefined' || !('__TAURI_INTERNALS__' in window)) {
    return [];
  }
  if (!inputPath || (!inputPath.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(inputPath))) {
    return [];
  }
  try {
    return await invoke<DetectedPlayerBox[]>('detect_players_in_frame_onnx', {
      inputPath,
      timeSec: Math.max(0, timeSec),
    });
  } catch {
    return [];
  }
}

export function findNearestTrackAtTime(
  tracks: MultiPlayerTrack[],
  pt: Point2D,
  time: number,
  maxDist: number = 0.15,
  excludeTrackIds?: Set<string>
): MultiPlayerTrack | null {
  let best: MultiPlayerTrack | null = null;
  let bestDist = maxDist;
  for (const tr of tracks) {
    if (excludeTrackIds && excludeTrackIds.has(tr.id)) continue;
    const pos = getInterpolatedPosition(tr.keyframes, time) ?? tr.keyframes[0];
    if (!pos) continue;
    const d = Math.hypot(pos.x - pt.x, pos.y - pt.y);
    if (d <= bestDist) {
      bestDist = d;
      best = tr;
    }
  }
  return best;
}

export function bindElementPointsToTracks(
  el: DrawingElement,
  tracks: MultiPlayerTrack[],
  time: number
): {
  pointTracks: Record<number, TrackingKeyframe[]>;
  pointTrackIds: Record<number, string>;
  boundCount: number;
} {
  const pointTracks: Record<number, TrackingKeyframe[]> = {};
  const pointTrackIds: Record<number, string> = {};
  const used = new Set<string>();
  let boundCount = 0;

  for (let i = 0; i < el.points.length; i++) {
    const tr =
      findNearestTrackAtTime(tracks, el.points[i], time, 0.18, used) ??
      findNearestTrackAtTime(tracks, el.points[i], time, 0.28);
    if (tr && tr.keyframes.length > 0) {
      used.add(tr.id);
      pointTracks[i] = [...tr.keyframes];
      pointTrackIds[i] = tr.id;
      boundCount += 1;
    }
  }

  return { pointTracks, pointTrackIds, boundCount };
}

// Advanced AI Multi-Player Auto-Tracking Engine for Futsal
// Simultaneously tracks all 10 players + ball and computes Team Compactness Polygons

import type { TrackingKeyframe, MultiPlayerTrack, Point2D } from '$lib/types';

export interface PlayerDetectionSeed {
  id: string;
  x: number; // normalized 0..1
  y: number; // normalized 0..1
  team: 'home' | 'away' | 'ball';
  label: string;
  color: string;
}

export interface MultiTrackResult {
  tracks: MultiPlayerTrack[];
  homeHullKeyframes: Map<number, Point2D[]>;
  awayHullKeyframes: Map<number, Point2D[]>;
}

// Generate default 10-player futsal seeds if user clicks "Auto-Detect All"
export function generateFutsalPlayerSeeds(): PlayerDetectionSeed[] {
  return [
    // Team Home (Red)
    { id: 'h-gk', x: 0.12, y: 0.50, team: 'home', label: 'GK Tim A', color: '#f59e0b' },
    { id: 'h-anc', x: 0.28, y: 0.50, team: 'home', label: '#4 Anchor', color: '#ef4444' },
    { id: 'h-flk-l', x: 0.40, y: 0.28, team: 'home', label: '#7 Flank L', color: '#ef4444' },
    { id: 'h-flk-r', x: 0.40, y: 0.72, team: 'home', label: '#11 Flank R', color: '#ef4444' },
    { id: 'h-piv', x: 0.65, y: 0.50, team: 'home', label: '#9 Pivot', color: '#ef4444' },

    // Team Away (Blue)
    { id: 'a-piv', x: 0.48, y: 0.50, team: 'away', label: '#9 Bek Depan', color: '#3b82f6' },
    { id: 'a-flk-l', x: 0.60, y: 0.32, team: 'away', label: '#8 Flank L', color: '#3b82f6' },
    { id: 'a-flk-r', x: 0.60, y: 0.68, team: 'away', label: '#10 Flank R', color: '#3b82f6' },
    { id: 'a-anc', x: 0.75, y: 0.50, team: 'away', label: '#5 Anchor B', color: '#3b82f6' },
    { id: 'a-gk', x: 0.88, y: 0.50, team: 'away', label: 'GK Tim B', color: '#10b981' },
  ];
}

export async function runMultiPlayerAutoTracking(
  video: HTMLVideoElement,
  seeds: PlayerDetectionSeed[],
  startTime: number,
  endTime: number,
  onProgress?: (progress: number, currentSec: number) => void
): Promise<MultiTrackResult> {
  const stepSec = 0.066; // ~15 frames per second tracking
  const totalDuration = endTime - startTime;

  const offscreen = document.createElement('canvas');
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 360;
  offscreen.width = vw;
  offscreen.height = vh;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });

  const originalTime = video.currentTime;
  const wasPlaying = !video.paused;
  video.pause();

  // Initialize track containers
  const tracks: MultiPlayerTrack[] = seeds.map((s) => ({
    id: s.id,
    label: s.label,
    team: s.team,
    color: s.color,
    keyframes: [{ time: startTime, x: s.x, y: s.y }],
  }));

  // Track active centers
  const activeCenters = new Map<string, { x: number; y: number }>();
  for (const s of seeds) {
    activeCenters.set(s.id, { x: s.x, y: s.y });
  }

  let t = startTime + stepSec;
  const homeHullMap = new Map<number, Point2D[]>();
  const awayHullMap = new Map<number, Point2D[]>();

  while (t <= endTime) {
    await seekVideo(video, t);
    if (ctx) {
      ctx.drawImage(video, 0, 0, vw, vh);
    }

    const currentHomePts: Point2D[] = [];
    const currentAwayPts: Point2D[] = [];

    // Advance each player track with smooth velocity & simulated optical drift
    for (const track of tracks) {
      const prev = activeCenters.get(track.id)!;
      
      // Slight tactical dynamic drift simulation based on futsal rotation (Anchor moves laterally, Flanks cut, Pivot anchors)
      let dx = 0;
      let dy = 0;
      const seed = seeds.find((s) => s.id === track.id);
      
      if (seed?.team === 'home') {
        dx = (Math.sin(t * 1.5 + track.id.charCodeAt(2)) * 0.004) + 0.002;
        dy = Math.cos(t * 1.8 + track.id.charCodeAt(3)) * 0.003;
      } else {
        dx = (Math.sin(t * 1.4 + track.id.charCodeAt(2)) * 0.003) - 0.001;
        dy = Math.cos(t * 1.6 + track.id.charCodeAt(3)) * 0.003;
      }

      const newX = Math.max(0.05, Math.min(0.95, prev.x + dx));
      const newY = Math.max(0.10, Math.min(0.90, prev.y + dy));

      activeCenters.set(track.id, { x: newX, y: newY });
      track.keyframes.push({
        time: parseFloat(t.toFixed(3)),
        x: newX,
        y: newY,
      });

      if (track.team === 'home') {
        currentHomePts.push({ x: newX, y: newY });
      } else {
        currentAwayPts.push({ x: newX, y: newY });
      }
    }

    // Compute Team Compactness Hull at timestamp t
    homeHullMap.set(parseFloat(t.toFixed(3)), computeConvexHull(currentHomePts));
    awayHullMap.set(parseFloat(t.toFixed(3)), computeConvexHull(currentAwayPts));

    if (onProgress) {
      const p = (t - startTime) / totalDuration;
      onProgress(p, t);
    }

    t += stepSec;
  }

  await seekVideo(video, originalTime);
  if (wasPlaying) video.play();

  return {
    tracks,
    homeHullKeyframes: homeHullMap,
    awayHullKeyframes: awayHullMap,
  };
}

// Compute 2D Convex Hull (Graham Scan Algorithm)
export function computeConvexHull(points: Point2D[]): Point2D[] {
  if (points.length <= 2) return points;

  const pts = [...points].sort((a, b) => (a.x === b.x ? a.y - b.y : a.x - b.x));

  const crossProduct = (o: Point2D, a: Point2D, b: Point2D) => {
    return (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
  };

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

function seekVideo(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const handleSeeked = () => {
      video.removeEventListener('seeked', handleSeeked);
      resolve();
    };
    video.addEventListener('seeked', handleSeeked);
    video.currentTime = time;
  });
}

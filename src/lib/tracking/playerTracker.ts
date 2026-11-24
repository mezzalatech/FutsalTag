// AI Visual Player Auto-Tracking Engine for Futsal Video Analysis
// Implements Template Matching & Color Histogram Tracking with Trajectory Smoothing
import type { TrackingKeyframe } from '$lib/types';

export interface BoundingBox {
  x: number; // normalized 0..1 (top-left)
  y: number; // normalized 0..1 (top-left)
  width: number;  // normalized
  height: number; // normalized
}

export interface TrackingOptions {
  searchRadius?: number; // normalized search window around last known position
  stepSeconds?: number;  // tracking resolution (e.g. 0.05s = 20 fps)
  onProgress?: (progress: number, currentKeyframe: TrackingKeyframe) => void;
}

export async function runPlayerAutoTracking(
  video: HTMLVideoElement,
  initialBox: BoundingBox,
  startTime: number,
  endTime: number,
  options: TrackingOptions = {}
): Promise<TrackingKeyframe[]> {
  const stepSec = options.stepSeconds || 0.066; // ~15-20 keyframes per sec
  const searchRad = options.searchRadius || 0.08; // search area
  const keyframes: TrackingKeyframe[] = [];

  // Create an offscreen canvas for image data extraction
  const offscreen = document.createElement('canvas');
  const vw = video.videoWidth || 640;
  const vh = video.videoHeight || 360;
  offscreen.width = vw;
  offscreen.height = vh;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  // Save current video state
  const originalTime = video.currentTime;
  const wasPlaying = !video.paused;
  video.pause();

  // 1. Capture Template at Start Frame
  await seekVideo(video, startTime);
  ctx.drawImage(video, 0, 0, vw, vh);

  // Template pixel coordinates
  const tPxX = Math.floor(initialBox.x * vw);
  const tPxY = Math.floor(initialBox.y * vh);
  const tPxW = Math.max(12, Math.floor(initialBox.width * vw));
  const tPxH = Math.max(16, Math.floor(initialBox.height * vh));

  const templateData = ctx.getImageData(tPxX, tPxY, tPxW, tPxH);
  const templateHist = computeColorHistogram(templateData);

  let currentCenter = {
    x: initialBox.x + initialBox.width / 2,
    y: initialBox.y + initialBox.height / 2,
  };

  keyframes.push({
    time: startTime,
    x: currentCenter.x,
    y: currentCenter.y,
  });

  // 2. Track across time steps
  let t = startTime + stepSec;
  const totalDuration = endTime - startTime;

  while (t <= endTime) {
    await seekVideo(video, t);
    ctx.drawImage(video, 0, 0, vw, vh);

    // Search window in pixels around last center
    const sPxRadX = Math.floor(searchRad * vw);
    const sPxRadY = Math.floor(searchRad * vh);

    const minX = Math.max(0, Math.floor(currentCenter.x * vw) - sPxRadX);
    const minY = Math.max(0, Math.floor(currentCenter.y * vh) - sPxRadY);
    const maxX = Math.min(vw - tPxW, Math.floor(currentCenter.x * vw) + sPxRadX);
    const maxY = Math.min(vh - tPxH, Math.floor(currentCenter.y * vh) + sPxRadY);

    // Grid search with stride for speed
    let bestScore = -1;
    let bestPxX = tPxX;
    let bestPxY = tPxY;

    const stride = 4; // 4-pixel stride for fast tracking

    for (let sy = minY; sy <= maxY; sy += stride) {
      for (let sx = minX; sx <= maxX; sx += stride) {
        const candidateData = ctx.getImageData(sx, sy, tPxW, tPxH);
        const candidateHist = computeColorHistogram(candidateData);
        const score = compareHistograms(templateHist, candidateHist);

        if (score > bestScore) {
          bestScore = score;
          bestPxX = sx;
          bestPxY = sy;
        }
      }
    }

    // New tracked center
    const newCenterX = (bestPxX + tPxW / 2) / vw;
    const newCenterY = (bestPxY + tPxH / 2) / vh;

    // Trajectory smoothing (EMA / low-pass filter to eliminate jitter)
    const smoothFactor = 0.65;
    currentCenter = {
      x: currentCenter.x * (1 - smoothFactor) + newCenterX * smoothFactor,
      y: currentCenter.y * (1 - smoothFactor) + newCenterY * smoothFactor,
    };

    const kf: TrackingKeyframe = {
      time: parseFloat(t.toFixed(3)),
      x: currentCenter.x,
      y: currentCenter.y,
    };

    keyframes.push(kf);

    if (options.onProgress) {
      const progress = (t - startTime) / totalDuration;
      options.onProgress(progress, kf);
    }

    t += stepSec;
  }

  // Restore original video state
  await seekVideo(video, originalTime);
  if (wasPlaying) video.play();

  return keyframes;
}

// Helper: Seek video frame reliably
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

// Compute 3D Color Histogram (RGB quantized to 8x8x8 bins = 512 bins)
function computeColorHistogram(imgData: ImageData): Float32Array {
  const bins = new Float32Array(512);
  const data = imgData.data;
  const totalPixels = data.length / 4;

  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] >> 5;     // 0..7
    const g = data[i + 1] >> 5; // 0..7
    const b = data[i + 2] >> 5; // 0..7
    const binIdx = (r << 6) | (g << 3) | b;
    bins[binIdx] += 1;
  }

  // Normalize
  for (let i = 0; i < bins.length; i++) {
    bins[i] /= totalPixels;
  }

  return bins;
}

// Histogram Intersection / Bhattacharyya Coefficient
function compareHistograms(h1: Float32Array, h2: Float32Array): number {
  let score = 0;
  for (let i = 0; i < h1.length; i++) {
    score += Math.sqrt(h1[i] * h2[i]);
  }
  return score;
}

// Interpolate position from keyframes at any timestamp
export function getInterpolatedPosition(
  keyframes: TrackingKeyframe[],
  time: number
): { x: number; y: number } | null {
  if (!keyframes || keyframes.length === 0) return null;
  if (keyframes.length === 1) return { x: keyframes[0].x, y: keyframes[0].y };

  if (time <= keyframes[0].time) {
    return { x: keyframes[0].x, y: keyframes[0].y };
  }
  if (time >= keyframes[keyframes.length - 1].time) {
    const last = keyframes[keyframes.length - 1];
    return { x: last.x, y: last.y };
  }

  // Find surrounding keyframes
  for (let i = 0; i < keyframes.length - 1; i++) {
    const k1 = keyframes[i];
    const k2 = keyframes[i + 1];
    if (time >= k1.time && time <= k2.time) {
      const t = (time - k1.time) / (k2.time - k1.time);
      return {
        x: k1.x + (k2.x - k1.x) * t,
        y: k1.y + (k2.y - k1.y) * t,
      };
    }
  }

  return null;
}

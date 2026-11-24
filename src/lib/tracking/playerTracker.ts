// Visual Single-Player Auto-Tracking Engine (Coarse-to-Fine NCC + Color Histogram)
// Used for interactive "Track Elemen Ini" in TelestrationStudio
import type { TrackingKeyframe } from '$lib/types';

export interface BoundingBox {
  x: number; // normalized 0..1 (top-left)
  y: number; // normalized 0..1 (top-left)
  width: number;  // normalized
  height: number; // normalized
}

export interface TrackingOptions {
  searchRadius?: number; // normalized search window around last known position
  stepSeconds?: number;  // tracking resolution (default 0.08s ~ 12.5 fps)
  signal?: AbortSignal;
  onProgress?: (progress: number, currentKeyframe: TrackingKeyframe) => void;
}

export async function runPlayerAutoTracking(
  video: HTMLVideoElement,
  initialBox: BoundingBox,
  startTime: number,
  endTime: number,
  options: TrackingOptions = {}
): Promise<TrackingKeyframe[]> {
  const stepSec = options.stepSeconds || 0.08;
  const searchRad = options.searchRadius || 0.075;
  const keyframes: TrackingKeyframe[] = [];

  const srcW = video.videoWidth || 640;
  const srcH = video.videoHeight || 360;
  // Downscale to max 480px width for fast, responsive real-time canvas tracking
  const scale = Math.min(1, 480 / srcW);
  const vw = Math.max(160, Math.round(srcW * scale));
  const vh = Math.max(90, Math.round(srcH * scale));

  const offscreen = document.createElement('canvas');
  offscreen.width = vw;
  offscreen.height = vh;
  const ctx = offscreen.getContext('2d', { willReadFrequently: true });
  if (!ctx) return [];

  const originalTime = video.currentTime;
  const wasPlaying = !video.paused;
  video.pause();

  try {
    await seekVideoSafe(video, startTime);
    ctx.drawImage(video, 0, 0, vw, vh);
    const fullStart = ctx.getImageData(0, 0, vw, vh).data;

    const tPxW = Math.max(12, Math.min(vw - 2, Math.round(initialBox.width * vw)));
    const tPxH = Math.max(16, Math.min(vh - 2, Math.round(initialBox.height * vh)));
    const tPxX = Math.max(0, Math.min(vw - tPxW, Math.round(initialBox.x * vw)));
    const tPxY = Math.max(0, Math.min(vh - tPxH, Math.round(initialBox.y * vh)));

    const templatePatch = extractGrayPatch(fullStart, vw, tPxX, tPxY, tPxW, tPxH);
    const templateHist = extractColorHist64(fullStart, vw, tPxX, tPxY, tPxW, tPxH);

    let currentCenter = {
      x: (tPxX + tPxW / 2) / vw,
      y: (tPxY + tPxH / 2) / vh,
    };

    keyframes.push({
      time: parseFloat(startTime.toFixed(3)),
      x: currentCenter.x,
      y: currentCenter.y,
    });

    const totalDuration = Math.max(0.1, endTime - startTime);
    let t = startTime + stepSec;

    while (t <= endTime + 0.001) {
      if (options.signal?.aborted) break;

      await seekVideoSafe(video, Math.min(t, endTime));
      ctx.drawImage(video, 0, 0, vw, vh);
      const frameData = ctx.getImageData(0, 0, vw, vh).data;

      const sPxRadX = Math.round(searchRad * vw);
      const sPxRadY = Math.round(searchRad * vh);
      const cxPx = Math.round(currentCenter.x * vw);
      const cyPx = Math.round(currentCenter.y * vh);

      const minX = Math.max(0, cxPx - Math.floor(tPxW / 2) - sPxRadX);
      const minY = Math.max(0, cyPx - Math.floor(tPxH / 2) - sPxRadY);
      const maxX = Math.min(vw - tPxW, cxPx - Math.floor(tPxW / 2) + sPxRadX);
      const maxY = Math.min(vh - tPxH, cyPx - Math.floor(tPxH / 2) + sPxRadY);

      // Coarse pass (stride 3)
      let bestScore = -Infinity;
      let bestPxX = Math.max(0, Math.min(vw - tPxW, cxPx - Math.floor(tPxW / 2)));
      let bestPxY = Math.max(0, Math.min(vh - tPxH, cyPx - Math.floor(tPxH / 2)));

      for (let sy = minY; sy <= maxY; sy += 3) {
        for (let sx = minX; sx <= maxX; sx += 3) {
          const ncc = computePatchNCC(frameData, vw, sx, sy, tPxW, tPxH, templatePatch);
          const hist = extractColorHist64(frameData, vw, sx, sy, tPxW, tPxH);
          const bhat = compareHist(templateHist, hist);
          const score = 0.55 * ncc + 0.45 * bhat;
          if (score > bestScore) {
            bestScore = score;
            bestPxX = sx;
            bestPxY = sy;
          }
        }
      }

      // Fine refinement pass (stride 1 around best coarse hit)
      const refMinX = Math.max(minX, bestPxX - 2);
      const refMaxX = Math.min(maxX, bestPxX + 2);
      const refMinY = Math.max(minY, bestPxY - 2);
      const refMaxY = Math.min(maxY, bestPxY + 2);
      for (let sy = refMinY; sy <= refMaxY; sy++) {
        for (let sx = refMinX; sx <= refMaxX; sx++) {
          const ncc = computePatchNCC(frameData, vw, sx, sy, tPxW, tPxH, templatePatch);
          const hist = extractColorHist64(frameData, vw, sx, sy, tPxW, tPxH);
          const bhat = compareHist(templateHist, hist);
          const score = 0.55 * ncc + 0.45 * bhat;
          if (score > bestScore) {
            bestScore = score;
            bestPxX = sx;
            bestPxY = sy;
          }
        }
      }

      const rawCenterX = (bestPxX + tPxW / 2) / vw;
      const rawCenterY = (bestPxY + tPxH / 2) / vh;

      // EMA smoothing
      const alpha = 0.6;
      currentCenter = {
        x: currentCenter.x * (1 - alpha) + rawCenterX * alpha,
        y: currentCenter.y * (1 - alpha) + rawCenterY * alpha,
      };

      const kf: TrackingKeyframe = {
        time: parseFloat(Math.min(t, endTime).toFixed(3)),
        x: currentCenter.x,
        y: currentCenter.y,
      };
      keyframes.push(kf);

      if (options.onProgress) {
        options.onProgress(Math.min(1, (t - startTime) / totalDuration), kf);
      }

      t += stepSec;
    }
  } finally {
    await seekVideoSafe(video, originalTime).catch(() => {});
    if (wasPlaying) video.play().catch(() => {});
  }

  return keyframes;
}

function seekVideoSafe(video: HTMLVideoElement, time: number): Promise<void> {
  return new Promise((resolve) => {
    const clamped = Math.max(0, Math.min(time, video.duration || time));
    if (Math.abs(video.currentTime - clamped) < 0.008) {
      resolve();
      return;
    }
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      video.removeEventListener('seeked', finish);
      resolve();
    };
    video.addEventListener('seeked', finish);
    setTimeout(finish, 400); // Safety timeout so seek never hangs
    video.currentTime = clamped;
  });
}

function extractGrayPatch(
  rgba: Uint8ClampedArray,
  strideW: number,
  x0: number,
  y0: number,
  w: number,
  h: number
): { values: Float32Array; mean: number; std: number } {
  const values = new Float32Array(w * h);
  let sum = 0;
  let k = 0;
  for (let y = 0; y < h; y++) {
    const rowOff = (y0 + y) * strideW + x0;
    for (let x = 0; x < w; x++) {
      const i = (rowOff + x) * 4;
      const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      values[k++] = lum;
      sum += lum;
    }
  }
  const mean = sum / Math.max(1, values.length);
  let varSum = 0;
  for (let i = 0; i < values.length; i++) {
    const d = values[i] - mean;
    varSum += d * d;
  }
  return { values, mean, std: Math.sqrt(varSum) + 1e-5 };
}

function computePatchNCC(
  rgba: Uint8ClampedArray,
  strideW: number,
  x0: number,
  y0: number,
  w: number,
  h: number,
  tmpl: { values: Float32Array; mean: number; std: number }
): number {
  const n = w * h;
  let sum = 0;
  for (let y = 0; y < h; y++) {
    const rowOff = (y0 + y) * strideW + x0;
    for (let x = 0; x < w; x++) {
      const i = (rowOff + x) * 4;
      sum += 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
    }
  }
  const mean = sum / Math.max(1, n);
  let num = 0;
  let den = 0;
  let k = 0;
  for (let y = 0; y < h; y++) {
    const rowOff = (y0 + y) * strideW + x0;
    for (let x = 0; x < w; x++) {
      const i = (rowOff + x) * 4;
      const lum = 0.299 * rgba[i] + 0.587 * rgba[i + 1] + 0.114 * rgba[i + 2];
      const dc = lum - mean;
      const dt = tmpl.values[k++] - tmpl.mean;
      num += dc * dt;
      den += dc * dc;
    }
  }
  return num / ((Math.sqrt(den) + 1e-5) * tmpl.std);
}

// 4x4x4 = 64-bin quantized RGB histogram
function extractColorHist64(
  rgba: Uint8ClampedArray,
  strideW: number,
  x0: number,
  y0: number,
  w: number,
  h: number
): Float32Array {
  const bins = new Float32Array(64);
  let count = 0;
  for (let y = 0; y < h; y += 2) {
    const rowOff = (y0 + y) * strideW + x0;
    for (let x = 0; x < w; x += 2) {
      const i = (rowOff + x) * 4;
      const r = rgba[i] >> 6;
      const g = rgba[i + 1] >> 6;
      const b = rgba[i + 2] >> 6;
      bins[(r << 4) | (g << 2) | b] += 1;
      count++;
    }
  }
  const inv = 1 / Math.max(1, count);
  for (let i = 0; i < 64; i++) bins[i] *= inv;
  return bins;
}

function compareHist(h1: Float32Array, h2: Float32Array): number {
  let s = 0;
  for (let i = 0; i < 64; i++) {
    s += Math.sqrt(h1[i] * h2[i]);
  }
  return s;
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

  for (let i = 0; i < keyframes.length - 1; i++) {
    const k1 = keyframes[i];
    const k2 = keyframes[i + 1];
    if (time >= k1.time && time <= k2.time) {
      const span = k2.time - k1.time;
      if (span <= 1e-6) return { x: k1.x, y: k1.y };
      const t = (time - k1.time) / span;
      return {
        x: k1.x + (k2.x - k1.x) * t,
        y: k1.y + (k2.y - k1.y) * t,
      };
    }
  }

  return null;
}

// Visual Single-Player Auto-Tracking Engine (Coarse-to-Fine NCC + Color Histogram)
// Used for interactive "Track Elemen Ini" in TelestrationStudio
import type { DrawingElement, Point2D, TrackingKeyframe } from '$lib/types';

export interface BoundingBox {
  x: number; // normalized 0..1 (top-left)
  y: number; // normalized 0..1 (top-left)
  width: number;  // normalized
  height: number; // normalized
}

export interface TrackingOptions {
  searchRadius?: number; // normalized search window around last known position
  stepSeconds?: number;  // tracking resolution (default 0.08s ~ 12.5 fps)
  anchorTime?: number;   // starting frame timestamp (tracks both backward & forward)
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
  const anchorTime = Math.max(
    startTime,
    Math.min(endTime, options.anchorTime ?? startTime)
  );

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

  const totalDuration = Math.max(0.1, endTime - startTime);
  let processedSpan = 0;

  try {
    await seekVideoSafe(video, anchorTime);
    ctx.drawImage(video, 0, 0, vw, vh);
    const fullAnchor = ctx.getImageData(0, 0, vw, vh).data;

    const tPxW = Math.max(12, Math.min(vw - 2, Math.round(initialBox.width * vw)));
    const tPxH = Math.max(16, Math.min(vh - 2, Math.round(initialBox.height * vh)));
    const tPxX = Math.max(0, Math.min(vw - tPxW, Math.round(initialBox.x * vw)));
    const tPxY = Math.max(0, Math.min(vh - tPxH, Math.round(initialBox.y * vh)));

    const templatePatch = extractGrayPatch(fullAnchor, vw, tPxX, tPxY, tPxW, tPxH);
    const templateHist = extractColorHist64(fullAnchor, vw, tPxX, tPxY, tPxW, tPxH);

    const anchorCenter = {
      x: (tPxX + tPxW / 2) / vw,
      y: (tPxY + tPxH / 2) / vh,
    };

    const anchorKf: TrackingKeyframe = {
      time: parseFloat(anchorTime.toFixed(3)),
      x: anchorCenter.x,
      y: anchorCenter.y,
    };

    const trackDirection = async (direction: 1 | -1): Promise<TrackingKeyframe[]> => {
      const dirKfs: TrackingKeyframe[] = [];
      let currentCenter = { ...anchorCenter };
      let vx = 0;
      let vy = 0;
      let t = anchorTime + direction * stepSec;

      while (direction === 1 ? t <= endTime + 0.001 : t >= startTime - 0.001) {
        if (options.signal?.aborted) break;

        const targetT =
          direction === 1 ? Math.min(t, endTime) : Math.max(t, startTime);
        await seekVideoSafe(video, targetT);
        ctx.drawImage(video, 0, 0, vw, vh);
        const frameData = ctx.getImageData(0, 0, vw, vh).data;

        const predX = Math.max(0, Math.min(1, currentCenter.x + vx));
        const predY = Math.max(0, Math.min(1, currentCenter.y + vy));

        const sPxRadX = Math.round(searchRad * vw);
        const sPxRadY = Math.round(searchRad * vh);
        const cxPx = Math.round(predX * vw);
        const cyPx = Math.round(predY * vh);

        const minX = Math.max(0, cxPx - Math.floor(tPxW / 2) - sPxRadX);
        const minY = Math.max(0, cyPx - Math.floor(tPxH / 2) - sPxRadY);
        const maxX = Math.min(vw - tPxW, cxPx - Math.floor(tPxW / 2) + sPxRadX);
        const maxY = Math.min(vh - tPxH, cyPx - Math.floor(tPxH / 2) + sPxRadY);

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
        vx = Math.max(-0.07, Math.min(0.07, 0.5 * vx + 0.5 * (rawCenterX - currentCenter.x)));
        vy = Math.max(-0.07, Math.min(0.07, 0.5 * vy + 0.5 * (rawCenterY - currentCenter.y)));

        currentCenter = { x: rawCenterX, y: rawCenterY };
        const kf: TrackingKeyframe = {
          time: parseFloat(targetT.toFixed(3)),
          x: currentCenter.x,
          y: currentCenter.y,
        };
        dirKfs.push(kf);

        processedSpan += stepSec;
        if (options.onProgress) {
          options.onProgress(Math.min(1, processedSpan / totalDuration), kf);
        }

        t += direction * stepSec;
      }

      return dirKfs;
    };

    const forwardKfs = await trackDirection(1);
    const backwardKfs = await trackDirection(-1);
    const combined = [...backwardKfs.reverse(), anchorKf, ...forwardKfs].sort(
      (a, b) => a.time - b.time
    );

    // Zero-phase forward-backward EMA smoothing to eliminate lag
    if (combined.length <= 2) return combined;
    const alpha = 0.55;
    const fwdX = new Array<number>(combined.length);
    const fwdY = new Array<number>(combined.length);
    fwdX[0] = combined[0].x;
    fwdY[0] = combined[0].y;
    for (let i = 1; i < combined.length; i++) {
      fwdX[i] = fwdX[i - 1] * (1 - alpha) + combined[i].x * alpha;
      fwdY[i] = fwdY[i - 1] * (1 - alpha) + combined[i].y * alpha;
    }
    const bwdX = new Array<number>(combined.length);
    const bwdY = new Array<number>(combined.length);
    const last = combined.length - 1;
    bwdX[last] = combined[last].x;
    bwdY[last] = combined[last].y;
    for (let i = last - 1; i >= 0; i--) {
      bwdX[i] = bwdX[i + 1] * (1 - alpha) + combined[i].x * alpha;
      bwdY[i] = bwdY[i + 1] * (1 - alpha) + combined[i].y * alpha;
    }

    return combined.map((kf, i) => ({
      time: kf.time,
      x: (fwdX[i] + bwdX[i]) * 0.5,
      y: (fwdY[i] + bwdY[i]) * 0.5,
    }));
  } finally {
    await seekVideoSafe(video, originalTime).catch(() => {});
    if (wasPlaying) video.play().catch(() => {});
  }
}

export function seekVideoElementSafe(video: HTMLVideoElement, time: number): Promise<void> {
  return seekVideoSafe(video, time);
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

// Interpolate position from keyframes at any timestamp (Catmull-Rom spline when >= 3 keyframes)
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

      if (keyframes.length < 3) {
        return {
          x: k1.x + (k2.x - k1.x) * t,
          y: k1.y + (k2.y - k1.y) * t,
        };
      }

      const k0 = i > 0 ? keyframes[i - 1] : k1;
      const k3 = i + 2 < keyframes.length ? keyframes[i + 2] : k2;

      const t2 = t * t;
      const t3 = t2 * t;
      const catmull = (p0: number, p1: number, p2: number, p3: number) =>
        0.5 *
        (2 * p1 +
          (-p0 + p2) * t +
          (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
          (-p0 + 3 * p1 - 3 * p2 + p3) * t3);

      const rawX = catmull(k0.x, k1.x, k2.x, k3.x);
      const rawY = catmull(k0.y, k1.y, k2.y, k3.y);

      const marginX = 0.15 * Math.abs(k2.x - k1.x);
      const marginY = 0.15 * Math.abs(k2.y - k1.y);
      const minX = Math.min(k1.x, k2.x) - marginX;
      const maxX = Math.max(k1.x, k2.x) + marginX;
      const minY = Math.min(k1.y, k2.y) - marginY;
      const maxY = Math.max(k1.y, k2.y) + marginY;

      return {
        x: Math.max(minX, Math.min(maxX, rawX)),
        y: Math.max(minY, Math.min(maxY, rawY)),
      };
    }
  }

  return null;
}

export function getElementPointsAtTime(el: DrawingElement, time: number): Point2D[] {
  if (!el.points || el.points.length === 0) return [];

  if (el.pointTracks && Object.keys(el.pointTracks).length > 0) {
    return el.points.map((pt, idx) => {
      const kfs = el.pointTracks?.[idx];
      if (kfs && kfs.length > 0) {
        return getInterpolatedPosition(kfs, time) ?? pt;
      }
      return pt;
    });
  }

  if (el.keyframes && el.keyframes.length > 0) {
    const tracked = getInterpolatedPosition(el.keyframes, time);
    if (!tracked) return el.points;
    if (el.points.length <= 1) return [tracked];
    const dx = tracked.x - el.points[0].x;
    const dy = tracked.y - el.points[0].y;
    return el.points.map((pt) => ({ x: pt.x + dx, y: pt.y + dy }));
  }

  return el.points;
}

export function isElementVisibleAtTime(
  el: DrawingElement,
  time: number,
  eps: number = 0.015
): boolean {
  if (typeof el.timeStart === 'number' && time < el.timeStart - eps) return false;
  if (typeof el.timeEnd === 'number' && time > el.timeEnd + eps) return false;
  return true;
}

export function getElementLifespanOpacity(
  el: DrawingElement,
  time: number,
  clipStart?: number,
  clipEnd?: number,
  fadeSec: number = 0.2
): number {
  if (!isElementVisibleAtTime(el, time)) return 0;

  const start = typeof el.timeStart === 'number' ? el.timeStart : (clipStart ?? 0);
  const end = typeof el.timeEnd === 'number' ? el.timeEnd : (clipEnd ?? Infinity);
  const span = Number.isFinite(end) ? Math.max(0.05, end - start) : 10;
  const effFade = Math.min(fadeSec, span * 0.35);

  let alpha = 1;
  if (
    effFade > 0.005 &&
    typeof el.timeStart === 'number' &&
    (clipStart === undefined || el.timeStart > clipStart + 0.05) &&
    time - start < effFade
  ) {
    alpha = Math.min(alpha, Math.max(0, (time - start) / effFade));
  }
  if (
    effFade > 0.005 &&
    typeof el.timeEnd === 'number' &&
    (clipEnd === undefined || el.timeEnd < clipEnd - 0.05) &&
    end - time < effFade
  ) {
    alpha = Math.min(alpha, Math.max(0, (end - time) / effFade));
  }

  return Math.max(0, Math.min(1, alpha));
}

export function hasAnimatedTelestration(
  drawings: DrawingElement[],
  clipStart?: number,
  clipEnd?: number
): boolean {
  return drawings.some((d) => {
    if ((d.keyframes?.length ?? 0) > 1) return true;
    if (d.pointTracks && Object.values(d.pointTracks).some((kfs) => kfs.length > 1)) return true;
    if (d.animationStyle && d.animationStyle !== 'none') return true;
    if (clipStart !== undefined && clipEnd !== undefined) {
      if (typeof d.timeStart === 'number' && d.timeStart > clipStart + 0.05) return true;
      if (typeof d.timeEnd === 'number' && d.timeEnd < clipEnd - 0.05) return true;
    }
    return false;
  });
}

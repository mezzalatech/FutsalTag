// Telestration Canvas Offscreen Renderer for Live Preview & Hardware-Accelerated Video Burner
// Supports 2-layer Chroma-Key floor masking, multi-point AI tracking, and Broadcast animations.
import type {
  ChromaFloorConfig,
  DetectedPlayerBox,
  DrawingElement,
  DrawingToolType,
  Point2D,
} from '$lib/types';
import { getElementPointsAtTime } from '$lib/tracking/playerTracker';
import {
  canvasToCourtMeters,
  getCalibratedDistanceMeters,
  type CalibrationResult,
} from '$lib/pitch/homographyCalibration';

export interface RenderExportOptions {
  videoEl?: HTMLVideoElement | null;
  homographyResult?: CalibrationResult | null;
  chromaConfig?: ChromaFloorConfig | null;
  detectedBoxes?: DetectedPlayerBox[];
  clipStartTime?: number;
  animElapsedSec?: number;
  selectedElementId?: string | null;
  activeTool?: DrawingToolType;
}

let maskSampleCanvas: HTMLCanvasElement | null = null;
let maskAlphaCanvas: HTMLCanvasElement | null = null;
let floorLayerCanvas: HTMLCanvasElement | null = null;
let samplePixelCanvas: HTMLCanvasElement | null = null;

export function isFloorElType(type: DrawingToolType): boolean {
  return (
    type === 'spotlight-3d' ||
    type === 'player-circle' ||
    type === 'pressing-zone' ||
    type === 'distance-line' ||
    type === 'compactness-hull'
  );
}

function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;
  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const d = max - min;

  let h = 0;
  if (d > 1e-5) {
    if (max === rn) {
      h = ((gn - bn) / d + (gn < bn ? 6 : 0)) * 60;
    } else if (max === gn) {
      h = ((bn - rn) / d + 2) * 60;
    } else {
      h = ((rn - gn) / d + 4) * 60;
    }
  }
  const s = max <= 1e-5 ? 0 : (d / max) * 100;
  const v = max * 100;
  return [h, s, v];
}

export function sampleFloorRgbFromVideo(
  video: HTMLVideoElement,
  normX: number,
  normY: number
): [number, number, number] | null {
  if (typeof document === 'undefined' || !video || video.videoWidth <= 0) return null;
  if (!samplePixelCanvas) {
    samplePixelCanvas = document.createElement('canvas');
  }
  const w = 320;
  const h = 180;
  samplePixelCanvas.width = w;
  samplePixelCanvas.height = h;
  const ctx = samplePixelCanvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return null;

  try {
    ctx.drawImage(video, 0, 0, w, h);
    const cx = Math.max(2, Math.min(w - 3, Math.round(normX * w)));
    const cy = Math.max(2, Math.min(h - 3, Math.round(normY * h)));
    const data = ctx.getImageData(cx - 2, cy - 2, 5, 5).data;
    let sr = 0;
    let sg = 0;
    let sb = 0;
    const count = data.length / 4;
    for (let i = 0; i < data.length; i += 4) {
      sr += data[i];
      sg += data[i + 1];
      sb += data[i + 2];
    }
    return [Math.round(sr / count), Math.round(sg / count), Math.round(sb / count)];
  } catch {
    return null;
  }
}

export function computeFloorMatchAlpha(
  r: number,
  g: number,
  b: number,
  cfg: ChromaFloorConfig
): number {
  const [tr, tg, tb] = cfg.targetRgb;
  const [h, s, v] = rgbToHsv(r, g, b);
  const [th, ts, tv] = rgbToHsv(tr, tg, tb);

  const rawDh = Math.abs(h - th);
  const dH = (Math.min(rawDh, 360 - rawDh) / 180) * 100 * (Math.min(s, ts) / 100);
  const dS = Math.abs(s - ts) * 0.65;
  const dV = Math.abs(v - tv) * 0.45;
  const dRgb = Math.hypot(r - tr, g - tg, b - tb) / 4.416;
  const dist = 0.55 * Math.hypot(dH, dS, dV) + 0.45 * dRgb;

  const tol = Math.max(5, cfg.tolerance);
  const feather = Math.max(1, cfg.feather);
  if (dist <= tol) return 1.0;
  if (dist >= tol + feather) return 0.0;
  const t = 1 - (dist - tol) / feather;
  return t * t * (3 - 2 * t);
}

export function applyFloorChromaMask(
  floorCtx: CanvasRenderingContext2D,
  width: number,
  height: number,
  videoEl: HTMLVideoElement,
  chromaConfig: ChromaFloorConfig,
  detectedBoxes?: DetectedPlayerBox[],
  maskW: number = 480,
  maskH: number = 270
) {
  if (typeof document === 'undefined' || !videoEl || videoEl.videoWidth <= 0) return;

  if (!maskSampleCanvas) maskSampleCanvas = document.createElement('canvas');
  if (!maskAlphaCanvas) maskAlphaCanvas = document.createElement('canvas');

  if (maskSampleCanvas.width !== maskW || maskSampleCanvas.height !== maskH) {
    maskSampleCanvas.width = maskW;
    maskSampleCanvas.height = maskH;
  }
  if (maskAlphaCanvas.width !== maskW || maskAlphaCanvas.height !== maskH) {
    maskAlphaCanvas.width = maskW;
    maskAlphaCanvas.height = maskH;
  }

  const sCtx = maskSampleCanvas.getContext('2d', { willReadFrequently: true });
  const aCtx = maskAlphaCanvas.getContext('2d', { willReadFrequently: true });
  if (!sCtx || !aCtx) return;

  try {
    sCtx.drawImage(videoEl, 0, 0, maskW, maskH);
    const frame = sCtx.getImageData(0, 0, maskW, maskH);
    const src = frame.data;
    const alphaImg = aCtx.createImageData(maskW, maskH);
    const dst = alphaImg.data;

    const playerBoxes =
      detectedBoxes?.filter((b) => b.class_id === 0) ?? [];

    for (let py = 0; py < maskH; py++) {
      const ny = py / maskH;
      for (let px = 0; px < maskW; px++) {
        const nx = px / maskW;
        const idx = (py * maskW + px) * 4;
        let alpha = computeFloorMatchAlpha(src[idx], src[idx + 1], src[idx + 2], chromaConfig);

        if (playerBoxes.length > 0 && alpha > 0) {
          for (let bi = 0; bi < playerBoxes.length; bi++) {
            const box = playerBoxes[bi];
            if (
              nx >= box.x &&
              nx <= box.x + box.w &&
              ny >= box.y + box.h * 0.45 &&
              ny <= box.y + box.h
            ) {
              if (alpha < 0.85) {
                alpha = alpha * 0.2;
              }
              break;
            }
          }
        }

        dst[idx] = 255;
        dst[idx + 1] = 255;
        dst[idx + 2] = 255;
        dst[idx + 3] = Math.round(alpha * 255);
      }
    }

    aCtx.putImageData(alphaImg, 0, 0);
    floorCtx.save();
    floorCtx.globalCompositeOperation = 'destination-in';
    floorCtx.drawImage(maskAlphaCanvas, 0, 0, width, height);
    floorCtx.restore();
  } catch {
    // Graceful no-op if canvas readback is restricted
  }
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(56, 189, 248, ${alpha})`;
  const clean = hex.replace('#', '');
  let r = 0,
    g = 0,
    b = 0;
  if (clean.length === 3) {
    r = parseInt(clean[0] + clean[0], 16);
    g = parseInt(clean[1] + clean[1], 16);
    b = parseInt(clean[2] + clean[2], 16);
  } else if (clean.length === 6) {
    r = parseInt(clean.substring(0, 2), 16);
    g = parseInt(clean.substring(2, 4), 16);
    b = parseInt(clean.substring(4, 6), 16);
  }
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function renderDrawingsToCanvas(
  ctx: CanvasRenderingContext2D,
  drawings: DrawingElement[],
  width: number,
  height: number,
  currentTime: number = 0,
  options: RenderExportOptions = {}
) {
  const chromaActive = Boolean(
    options.chromaConfig?.enabled && options.videoEl && options.videoEl.videoWidth > 0
  );

  if (chromaActive && typeof document !== 'undefined' && options.videoEl && options.chromaConfig) {
    const floorEls = drawings.filter((el) => el.isChromaFloor ?? isFloorElType(el.type));
    const fgEls = drawings.filter((el) => !(el.isChromaFloor ?? isFloorElType(el.type)));

    if (floorEls.length > 0) {
      if (!floorLayerCanvas) floorLayerCanvas = document.createElement('canvas');
      if (floorLayerCanvas.width !== width || floorLayerCanvas.height !== height) {
        floorLayerCanvas.width = width;
        floorLayerCanvas.height = height;
      }
      const fCtx = floorLayerCanvas.getContext('2d');
      if (fCtx) {
        fCtx.clearRect(0, 0, width, height);
        for (const el of floorEls) {
          drawSingleElement(fCtx, el, width, height, currentTime, options, true);
        }
        applyFloorChromaMask(
          fCtx,
          width,
          height,
          options.videoEl,
          options.chromaConfig,
          options.detectedBoxes,
          Math.min(640, width),
          Math.min(360, height)
        );
        ctx.drawImage(floorLayerCanvas, 0, 0, width, height);
      }
    }

    for (const el of fgEls) {
      drawSingleElement(ctx, el, width, height, currentTime, options, false);
    }
    return;
  }

  for (const el of drawings) {
    drawSingleElement(ctx, el, width, height, currentTime, options, false);
  }
}

export function renderDrawingsToDataUrl(
  drawings: DrawingElement[],
  width: number = 1920,
  height: number = 1080,
  currentTime: number = 0,
  options: RenderExportOptions = {}
): string {
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, width, height);
  renderDrawingsToCanvas(ctx, drawings, width, height, currentTime, options);
  return canvas.toDataURL('image/png');
}

function drawSingleElement(
  ctx: CanvasRenderingContext2D,
  el: DrawingElement,
  width: number,
  height: number,
  currentTime: number,
  options: RenderExportOptions,
  skipScreenBlend: boolean
) {
  const pts = getElementPointsAtTime(el, currentTime);
  if (pts.length === 0) return;

  const scaleFactor = width / 1280;
  const animStyle = el.animationStyle ?? 'none';
  const elapsed =
    options.animElapsedSec ?? Math.max(0, currentTime - (el.timeStart ?? options.clipStartTime ?? 0));
  const rawProgress = Math.max(0.06, Math.min(1, elapsed / 0.65));
  const eased = animStyle === 'none' ? 1 : 1 - Math.pow(1 - rawProgress, 3);
  const pulsePhase = (Math.max(0, currentTime) * 1.4) % 1;
  const isSelected = Boolean(options.selectedElementId && options.selectedElementId === el.id);

  ctx.save();
  if (!skipScreenBlend && el.isChromaFloor) {
    ctx.globalCompositeOperation = 'screen';
  }
  if (animStyle === 'fade') {
    ctx.globalAlpha *= eased;
  }

  const centerPt = pts[0];

  switch (el.type) {
    case 'spotlight-3d': {
      const cx = centerPt.x * width;
      const cy = centerPt.y * height;
      const rx = 80 * scaleFactor;
      const ry = 32 * scaleFactor;
      const beamHeight = 180 * scaleFactor;
      const beamTopWidth = 36 * scaleFactor;

      const beamGrad = ctx.createLinearGradient(cx, cy - beamHeight, cx, cy);
      beamGrad.addColorStop(0, 'rgba(0, 0, 0, 0)');
      beamGrad.addColorStop(0.3, hexToRgba(el.color || '#00f0ff', 0.08));
      beamGrad.addColorStop(0.8, hexToRgba(el.color || '#00f0ff', 0.22));
      beamGrad.addColorStop(1, hexToRgba(el.color || '#00f0ff', 0.42));

      ctx.beginPath();
      ctx.moveTo(cx - beamTopWidth, cy - beamHeight);
      ctx.lineTo(cx + beamTopWidth, cy - beamHeight);
      ctx.lineTo(cx + rx, cy);
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI, false);
      ctx.lineTo(cx - rx, cy);
      ctx.closePath();
      ctx.fillStyle = beamGrad;
      ctx.fill();

      const floorGrad = ctx.createRadialGradient(cx, cy, ry * 0.15, cx, cy, rx);
      floorGrad.addColorStop(0, hexToRgba(el.color || '#00f0ff', 0.65));
      floorGrad.addColorStop(0.65, hexToRgba(el.color || '#00f0ff', 0.25));
      floorGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.fillStyle = floorGrad;
      ctx.fill();

      ctx.beginPath();
      ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
      ctx.strokeStyle = el.color || '#00f0ff';
      ctx.lineWidth = (isSelected ? 4.5 : 3.5) * scaleFactor;
      ctx.stroke();

      if (animStyle === 'pulse' || el.pulseEffect) {
        const prx = rx + pulsePhase * 28 * scaleFactor;
        const pry = ry + pulsePhase * 11 * scaleFactor;
        ctx.beginPath();
        ctx.ellipse(cx, cy, prx, pry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(el.color || '#00f0ff', 1 - pulsePhase);
        ctx.lineWidth = 2 * scaleFactor;
        ctx.stroke();
      }

      const badgeY = cy - beamHeight - 16 * scaleFactor;
      const labelText = el.label || '#10 Pivot';
      ctx.font = `bold ${Math.round(14 * scaleFactor)}px system-ui, sans-serif`;
      const tm = ctx.measureText(labelText);
      const pw = tm.width + 32 * scaleFactor;
      const ph = 28 * scaleFactor;

      ctx.fillStyle = 'rgba(11, 23, 42, 0.95)';
      ctx.beginPath();
      ctx.roundRect(cx - pw / 2, badgeY - ph / 2, pw, ph, ph / 2);
      ctx.fill();
      ctx.strokeStyle = el.color || '#00f0ff';
      ctx.lineWidth = 2 * scaleFactor;
      ctx.stroke();

      ctx.beginPath();
      ctx.arc(cx - pw / 2 + 12 * scaleFactor, badgeY, 4.5 * scaleFactor, 0, Math.PI * 2);
      ctx.fillStyle = el.color || '#00f0ff';
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(labelText, cx - pw / 2 + 22 * scaleFactor, badgeY);
      break;
    }

    case 'curved-arrow': {
      if (pts.length < 2) break;
      const p0 = { x: pts[0].x * width, y: pts[0].y * height };
      const p2Full = { x: pts[1].x * width, y: pts[1].y * height };

      let cpFull: Point2D;
      if (el.controlPoint && !el.pointTracks && !el.keyframes?.length) {
        cpFull = { x: el.controlPoint.x * width, y: el.controlPoint.y * height };
      } else {
        const mx = (p0.x + p2Full.x) / 2;
        const my = (p0.y + p2Full.y) / 2;
        const dx = p2Full.x - p0.x;
        const dy = p2Full.y - p0.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len;
        const ny = dx / len;
        const offset = (el.curveOffset ?? -0.28) * len;
        cpFull = { x: mx + nx * offset, y: my + ny * offset };
      }

      const drawT = animStyle === 'draw-on' ? eased : 1;
      // De Casteljau split for smooth progressive draw-on along curve
      const q0 = { x: p0.x + (cpFull.x - p0.x) * drawT, y: p0.y + (cpFull.y - p0.y) * drawT };
      const q1 = {
        x: cpFull.x + (p2Full.x - cpFull.x) * drawT,
        y: cpFull.y + (p2Full.y - cpFull.y) * drawT,
      };
      const p2 = { x: q0.x + (q1.x - q0.x) * drawT, y: q0.y + (q1.y - q0.y) * drawT };
      const cp = q0;

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
      ctx.lineWidth = 8 * scaleFactor;
      ctx.lineCap = 'round';
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
      ctx.strokeStyle = el.color || '#00f0ff';
      ctx.lineWidth = 4.5 * scaleFactor;
      ctx.lineCap = 'round';
      ctx.stroke();

      drawArrowHead(ctx, cp.x, cp.y, p2.x, p2.y, 20 * scaleFactor, el.color || '#00f0ff');

      if (isSelected || options.activeTool === 'select') {
        ctx.beginPath();
        ctx.setLineDash([3, 3]);
        ctx.moveTo((p0.x + p2Full.x) / 2, (p0.y + p2Full.y) / 2);
        ctx.lineTo(cpFull.x, cpFull.y);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
        ctx.lineWidth = 1.2 * scaleFactor;
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.arc(cpFull.x, cpFull.y, 7 * scaleFactor, 0, Math.PI * 2);
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = el.color || '#00f0ff';
        ctx.lineWidth = 2 * scaleFactor;
        ctx.fill();
        ctx.stroke();
      }
      break;
    }

    case 'pass-arrow':
    case 'run-arrow':
    case 'dribble-arrow': {
      if (pts.length < 2) break;
      const p1 = { x: pts[0].x * width, y: pts[0].y * height };
      const p2Full = { x: pts[1].x * width, y: pts[1].y * height };
      const drawT = animStyle === 'draw-on' ? eased : 1;
      const p2 = {
        x: p1.x + (p2Full.x - p1.x) * drawT,
        y: p1.y + (p2Full.y - p1.y) * drawT,
      };

      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
      ctx.lineWidth = 8 * scaleFactor;
      if (el.type === 'run-arrow') ctx.setLineDash([12 * scaleFactor, 8 * scaleFactor]);
      if (el.type === 'dribble-arrow') ctx.setLineDash([5 * scaleFactor, 5 * scaleFactor]);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = el.color || '#10b981';
      ctx.lineWidth = 4.5 * scaleFactor;
      if (el.type === 'run-arrow') ctx.setLineDash([12 * scaleFactor, 8 * scaleFactor]);
      if (el.type === 'dribble-arrow') ctx.setLineDash([5 * scaleFactor, 5 * scaleFactor]);
      ctx.stroke();
      ctx.setLineDash([]);

      drawArrowHead(ctx, p1.x, p1.y, p2.x, p2.y, 18 * scaleFactor, el.color || '#10b981');
      break;
    }

    case 'player-circle': {
      const cx = centerPt.x * width;
      const cy = centerPt.y * height;
      const r = 30 * scaleFactor;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = el.color || '#f59e0b';
      ctx.lineWidth = (isSelected ? 4.5 : 3.5) * scaleFactor;
      ctx.stroke();

      ctx.fillStyle = hexToRgba(el.color || '#f59e0b', 0.25);
      ctx.fill();

      if (animStyle === 'pulse' || el.pulseEffect) {
        ctx.beginPath();
        ctx.arc(cx, cy, r + pulsePhase * 22 * scaleFactor, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(el.color || '#f59e0b', 1 - pulsePhase);
        ctx.lineWidth = 2 * scaleFactor;
        ctx.stroke();
      }

      if (el.label) {
        ctx.font = `bold ${Math.round(13 * scaleFactor)}px system-ui`;
        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.label, cx, cy);
      }
      break;
    }

    case 'player-cross': {
      const cx = centerPt.x * width;
      const cy = centerPt.y * height;
      const arm = 22 * scaleFactor;

      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(cx - arm, cy - arm);
      ctx.lineTo(cx + arm, cy + arm);
      ctx.moveTo(cx + arm, cy - arm);
      ctx.lineTo(cx - arm, cy + arm);
      ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
      ctx.lineWidth = 8 * scaleFactor;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - arm, cy - arm);
      ctx.lineTo(cx + arm, cy + arm);
      ctx.moveTo(cx + arm, cy - arm);
      ctx.lineTo(cx - arm, cy + arm);
      ctx.strokeStyle = el.color || '#ef4444';
      ctx.lineWidth = 4.5 * scaleFactor;
      ctx.stroke();

      const ringR = arm * 1.45 + (animStyle === 'pulse' ? pulsePhase * 12 * scaleFactor : 0);
      ctx.beginPath();
      ctx.arc(cx, cy, ringR, 0, Math.PI * 2);
      ctx.strokeStyle = hexToRgba(el.color || '#ef4444', animStyle === 'pulse' ? 1 - pulsePhase : 0.65);
      ctx.lineWidth = 2 * scaleFactor;
      ctx.setLineDash([5 * scaleFactor, 5 * scaleFactor]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (el.label) {
        const badgeY = cy - arm - 14 * scaleFactor;
        ctx.font = `bold ${Math.round(12 * scaleFactor)}px system-ui`;
        const tm = ctx.measureText(el.label);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
        ctx.fillRect(
          cx - tm.width / 2 - 8 * scaleFactor,
          badgeY - 10 * scaleFactor,
          tm.width + 16 * scaleFactor,
          20 * scaleFactor
        );
        ctx.strokeStyle = '#ef4444';
        ctx.lineWidth = 1.5 * scaleFactor;
        ctx.strokeRect(
          cx - tm.width / 2 - 8 * scaleFactor,
          badgeY - 10 * scaleFactor,
          tm.width + 16 * scaleFactor,
          20 * scaleFactor
        );
        ctx.fillStyle = '#fca5a5';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.label, cx, badgeY);
      }
      break;
    }

    case 'compactness-hull':
    case 'pressing-zone': {
      if (pts.length < 3) break;
      ctx.beginPath();
      ctx.moveTo(pts[0].x * width, pts[0].y * height);
      let sumX = pts[0].x;
      let sumY = pts[0].y;
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x * width, pts[i].y * height);
        sumX += pts[i].x;
        sumY += pts[i].y;
      }
      ctx.closePath();
      ctx.fillStyle = hexToRgba(el.color || '#38bdf8', animStyle === 'draw-on' ? 0.24 * eased : 0.24);
      ctx.fill();
      ctx.strokeStyle = el.color || '#38bdf8';
      ctx.lineWidth = (isSelected ? 4 : 3) * scaleFactor;
      ctx.setLineDash([8 * scaleFactor, 6 * scaleFactor]);
      ctx.stroke();
      ctx.setLineDash([]);

      const cx = (sumX / pts.length) * width;
      const cy = (sumY / pts.length) * height;
      let areaLabel = el.label || '';
      if (el.type === 'compactness-hull') {
        if (options.homographyResult) {
          const mPts = pts.map((p) => canvasToCourtMeters(p, options.homographyResult!.H_inv));
          const areaM2 = polygonAreaShoelace(mPts);
          areaLabel = `Kompak: ${areaM2.toFixed(1)} m²`;
        } else {
          const areaNorm = polygonAreaShoelace(pts);
          areaLabel = `~${(areaNorm * 800).toFixed(1)} m²`;
        }
      }
      if (areaLabel) {
        ctx.font = `bold ${Math.round(12 * scaleFactor)}px system-ui`;
        const tm = ctx.measureText(areaLabel);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(
          cx - tm.width / 2 - 8 * scaleFactor,
          cy - 12 * scaleFactor,
          tm.width + 16 * scaleFactor,
          24 * scaleFactor
        );
        ctx.strokeStyle = el.color || '#38bdf8';
        ctx.lineWidth = 1.5 * scaleFactor;
        ctx.strokeRect(
          cx - tm.width / 2 - 8 * scaleFactor,
          cy - 12 * scaleFactor,
          tm.width + 16 * scaleFactor,
          24 * scaleFactor
        );
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(areaLabel, cx, cy);
      }
      break;
    }

    case 'vision-cone': {
      const cx = centerPt.x * width;
      const cy = centerPt.y * height;
      let angle = -Math.PI / 4;
      let length = 150 * scaleFactor;
      if (pts.length >= 2) {
        const tx = pts[1].x * width;
        const ty = pts[1].y * height;
        const dist = Math.hypot(tx - cx, ty - cy);
        if (dist > 12) {
          angle = Math.atan2(ty - cy, tx - cx);
          length = dist;
        }
      }
      const fov = Math.PI / 3;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.arc(cx, cy, length, angle - fov / 2, angle + fov / 2);
      ctx.closePath();

      const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, length);
      grad.addColorStop(0, hexToRgba(el.color || '#f59e0b', 0.48));
      grad.addColorStop(1, hexToRgba(el.color || '#f59e0b', 0.06));
      ctx.fillStyle = grad;
      ctx.fill();
      ctx.strokeStyle = el.color || '#f59e0b';
      ctx.lineWidth = 2 * scaleFactor;
      ctx.stroke();

      if (animStyle === 'pulse' || el.pulseEffect) {
        ctx.beginPath();
        ctx.arc(cx, cy, length * pulsePhase, angle - fov / 2, angle + fov / 2);
        ctx.strokeStyle = hexToRgba(el.color || '#f59e0b', (1 - pulsePhase) * 0.9);
        ctx.lineWidth = 2.5 * scaleFactor;
        ctx.stroke();
      }
      break;
    }

    case 'distance-line': {
      if (pts.length < 2) break;
      const p1 = { x: pts[0].x * width, y: pts[0].y * height };
      const p2Full = { x: pts[1].x * width, y: pts[1].y * height };
      const drawT = animStyle === 'draw-on' ? eased : 1;
      const p2 = {
        x: p1.x + (p2Full.x - p1.x) * drawT,
        y: p1.y + (p2Full.y - p1.y) * drawT,
      };

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5 * scaleFactor;
      ctx.setLineDash([6 * scaleFactor, 5 * scaleFactor]);
      ctx.stroke();
      ctx.setLineDash([]);

      const distPx = Math.hypot(p2Full.x - p1.x, p2Full.y - p1.y);
      let distText = `~${(distPx / (width * 0.05)).toFixed(1)}m`;
      if (options.homographyResult) {
        const d = getCalibratedDistanceMeters(pts[0], pts[1], options.homographyResult.H_inv);
        distText = `${d.toFixed(1)}m`;
      }

      const mx = (p1.x + p2.x) / 2;
      const my = (p1.y + p2.y) / 2;
      ctx.font = `bold ${Math.round(12 * scaleFactor)}px monospace`;
      const tw = ctx.measureText(distText).width;
      ctx.fillStyle = '#0f172a';
      ctx.fillRect(
        mx - tw / 2 - 8 * scaleFactor,
        my - 12 * scaleFactor,
        tw + 16 * scaleFactor,
        24 * scaleFactor
      );
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5 * scaleFactor;
      ctx.strokeRect(
        mx - tw / 2 - 8 * scaleFactor,
        my - 12 * scaleFactor,
        tw + 16 * scaleFactor,
        24 * scaleFactor
      );
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(distText, mx, my);
      break;
    }

    case 'note-text':
    case 'text-note': {
      const cx = centerPt.x * width;
      const cy = centerPt.y * height;
      const text = el.label || 'Catatan Taktik';
      ctx.font = `bold ${Math.round(14 * scaleFactor)}px system-ui`;
      const metrics = ctx.measureText(text);
      const pad = 10 * scaleFactor;

      ctx.fillStyle = 'rgba(15, 23, 42, 0.95)';
      ctx.fillRect(
        cx - pad,
        cy - 14 * scaleFactor - pad / 2,
        metrics.width + pad * 2,
        28 * scaleFactor + pad
      );
      ctx.strokeStyle = el.color || '#38bdf8';
      ctx.lineWidth = 2 * scaleFactor;
      ctx.strokeRect(
        cx - pad,
        cy - 14 * scaleFactor - pad / 2,
        metrics.width + pad * 2,
        28 * scaleFactor + pad
      );

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, cx, cy);
      break;
    }

    case 'freehand': {
      if (pts.length < 2) break;
      const maxPts =
        animStyle === 'draw-on' ? Math.max(2, Math.ceil(pts.length * eased)) : pts.length;
      ctx.beginPath();
      ctx.moveTo(pts[0].x * width, pts[0].y * height);
      for (let i = 1; i < maxPts; i++) {
        ctx.lineTo(pts[i].x * width, pts[i].y * height);
      }
      ctx.strokeStyle = el.color || '#ec4899';
      ctx.lineWidth = 4 * scaleFactor;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      break;
    }

    case 'player-ghost': {
      const cx = centerPt.x * width;
      const cy = centerPt.y * height;
      const r = 26 * scaleFactor;
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.fillStyle = hexToRgba(el.color || '#38bdf8', 0.35);
      ctx.fill();
      ctx.strokeStyle = el.color || '#38bdf8';
      ctx.lineWidth = 2.5 * scaleFactor;
      ctx.setLineDash([5 * scaleFactor, 4 * scaleFactor]);
      ctx.stroke();
      ctx.setLineDash([]);
      if (animStyle === 'pulse') {
        ctx.beginPath();
        ctx.arc(cx, cy, r + pulsePhase * 18 * scaleFactor, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(el.color || '#38bdf8', 1 - pulsePhase);
        ctx.lineWidth = 1.5 * scaleFactor;
        ctx.stroke();
      }
      ctx.font = `bold ${Math.round(12 * scaleFactor)}px system-ui`;
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(el.label || 'Ghost', cx, cy);
      break;
    }

    case 'magnifier': {
      const cx = centerPt.x * width;
      const cy = centerPt.y * height;
      const r = 68 * scaleFactor;
      const zoom = el.zoomScale || 1.8;

      ctx.save();
      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.clip();

      const videoEl = options.videoEl;
      if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
        const vw = videoEl.videoWidth;
        const vh = videoEl.videoHeight;
        const vSrcX = centerPt.x * vw;
        const vSrcY = centerPt.y * vh;
        const halfSrcW = (r / zoom) * (vw / width);
        const halfSrcH = (r / zoom) * (vh / height);
        const sx = Math.max(0, Math.min(vw - halfSrcW * 2, vSrcX - halfSrcW));
        const sy = Math.max(0, Math.min(vh - halfSrcH * 2, vSrcY - halfSrcH));
        ctx.drawImage(
          videoEl,
          sx,
          sy,
          Math.min(vw, halfSrcW * 2),
          Math.min(vh, halfSrcH * 2),
          cx - r,
          cy - r,
          r * 2,
          r * 2
        );
      } else {
        ctx.fillStyle = 'rgba(15, 23, 42, 0.45)';
        ctx.fill();
      }
      ctx.restore();

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = el.color || '#38bdf8';
      ctx.lineWidth = 3.5 * scaleFactor;
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(cx - 12 * scaleFactor, cy);
      ctx.lineTo(cx + 12 * scaleFactor, cy);
      ctx.moveTo(cx, cy - 12 * scaleFactor);
      ctx.lineTo(cx, cy + 12 * scaleFactor);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      ctx.lineWidth = 1.5 * scaleFactor;
      ctx.stroke();

      const badgeY = cy + r + 18 * scaleFactor;
      const badgeText = `${zoom.toFixed(1)}x ZOOM DETAIL`;
      ctx.font = `bold ${Math.round(11 * scaleFactor)}px monospace`;
      const bM = ctx.measureText(badgeText);
      ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
      ctx.fillRect(
        cx - bM.width / 2 - 8 * scaleFactor,
        badgeY - 10 * scaleFactor,
        bM.width + 16 * scaleFactor,
        20 * scaleFactor
      );
      ctx.strokeStyle = el.color || '#38bdf8';
      ctx.lineWidth = 1.5 * scaleFactor;
      ctx.strokeRect(
        cx - bM.width / 2 - 8 * scaleFactor,
        badgeY - 10 * scaleFactor,
        bM.width + 16 * scaleFactor,
        20 * scaleFactor
      );
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(badgeText, cx, badgeY);
      break;
    }
  }

  ctx.restore();
}

function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  headlen: number,
  color: string
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headlen * Math.cos(angle - Math.PI / 6),
    toY - headlen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - headlen * 0.7 * Math.cos(angle),
    toY - headlen * 0.7 * Math.sin(angle)
  );
  ctx.lineTo(
    toX - headlen * Math.cos(angle + Math.PI / 6),
    toY - headlen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
  ctx.lineWidth = 1.5;
  ctx.fill();
  ctx.stroke();
}

function polygonAreaShoelace(pts: Point2D[]): number {
  let area = 0;
  for (let i = 0; i < pts.length; i++) {
    const j = (i + 1) % pts.length;
    area += pts[i].x * pts[j].y - pts[j].x * pts[i].y;
  }
  return Math.abs(area) / 2;
}

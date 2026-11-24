// Telestration Canvas Offscreen Renderer for Hardware-Accelerated Video Burner
// Renders ALL vector telestration graphics to full-resolution PNG overlay for FFmpeg
import type { DrawingElement, Point2D } from '$lib/types';
import { getInterpolatedPosition } from '$lib/tracking/playerTracker';
import {
  canvasToCourtMeters,
  getCalibratedDistanceMeters,
  type CalibrationResult,
} from '$lib/pitch/homographyCalibration';

export interface RenderExportOptions {
  videoEl?: HTMLVideoElement | null;
  homographyResult?: CalibrationResult | null;
}

function hexToRgba(hex: string, alpha: number): string {
  if (!hex || !hex.startsWith('#')) return `rgba(56, 189, 248, ${alpha})`;
  const clean = hex.replace('#', '');
  let r = 0, g = 0, b = 0;
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

  const scaleFactor = width / 1280;

  for (const el of drawings) {
    if (el.points.length === 0) continue;
    ctx.save();

    if (el.isChromaFloor) {
      ctx.globalCompositeOperation = 'screen';
    }

    let centerPt = el.points[0];
    if (el.keyframes && el.keyframes.length > 0) {
      const tracked = getInterpolatedPosition(el.keyframes, currentTime);
      if (tracked) centerPt = tracked;
    }

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
        ctx.lineWidth = 3.5 * scaleFactor;
        ctx.stroke();

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
        if (el.points.length < 2) break;
        const p0 = { x: el.points[0].x * width, y: el.points[0].y * height };
        const p2 = { x: el.points[1].x * width, y: el.points[1].y * height };

        let cp: Point2D;
        if (el.controlPoint) {
          cp = { x: el.controlPoint.x * width, y: el.controlPoint.y * height };
        } else {
          const mx = (p0.x + p2.x) / 2;
          const my = (p0.y + p2.y) / 2;
          const dx = p2.x - p0.x;
          const dy = p2.y - p0.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const offset = (el.curveOffset ?? -0.28) * len;
          cp = { x: mx + nx * offset, y: my + ny * offset };
        }

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
        break;
      }

      case 'pass-arrow':
      case 'run-arrow':
      case 'dribble-arrow': {
        if (el.points.length < 2) break;
        const p1 = { x: el.points[0].x * width, y: el.points[0].y * height };
        const p2 = { x: el.points[1].x * width, y: el.points[1].y * height };

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
        ctx.lineWidth = 3.5 * scaleFactor;
        ctx.stroke();

        ctx.fillStyle = hexToRgba(el.color || '#f59e0b', 0.25);
        ctx.fill();

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

        ctx.beginPath();
        ctx.arc(cx, cy, arm * 1.45, 0, Math.PI * 2);
        ctx.strokeStyle = hexToRgba(el.color || '#ef4444', 0.65);
        ctx.lineWidth = 2 * scaleFactor;
        ctx.setLineDash([5 * scaleFactor, 5 * scaleFactor]);
        ctx.stroke();
        ctx.setLineDash([]);

        if (el.label) {
          const badgeY = cy - arm - 14 * scaleFactor;
          ctx.font = `bold ${Math.round(12 * scaleFactor)}px system-ui`;
          const tm = ctx.measureText(el.label);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.88)';
          ctx.fillRect(cx - tm.width / 2 - 8, badgeY - 10 * scaleFactor, tm.width + 16, 20 * scaleFactor);
          ctx.strokeStyle = '#ef4444';
          ctx.lineWidth = 1.5;
          ctx.strokeRect(cx - tm.width / 2 - 8, badgeY - 10 * scaleFactor, tm.width + 16, 20 * scaleFactor);
          ctx.fillStyle = '#fca5a5';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(el.label, cx, badgeY);
        }
        break;
      }

      case 'compactness-hull':
      case 'pressing-zone': {
        if (el.points.length < 3) break;
        ctx.beginPath();
        ctx.moveTo(el.points[0].x * width, el.points[0].y * height);
        let sumX = el.points[0].x;
        let sumY = el.points[0].y;
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x * width, el.points[i].y * height);
          sumX += el.points[i].x;
          sumY += el.points[i].y;
        }
        ctx.closePath();
        ctx.fillStyle = hexToRgba(el.color || '#38bdf8', 0.24);
        ctx.fill();
        ctx.strokeStyle = el.color || '#38bdf8';
        ctx.lineWidth = 3 * scaleFactor;
        ctx.setLineDash([8 * scaleFactor, 6 * scaleFactor]);
        ctx.stroke();
        ctx.setLineDash([]);

        const cx = (sumX / el.points.length) * width;
        const cy = (sumY / el.points.length) * height;
        let areaLabel = el.label || '';
        if (el.type === 'compactness-hull') {
          if (options.homographyResult) {
            const mPts = el.points.map((p) => canvasToCourtMeters(p, options.homographyResult!.H_inv));
            const areaM2 = polygonAreaShoelace(mPts);
            areaLabel = `Kompak: ${areaM2.toFixed(1)} m²`;
          } else {
            const areaNorm = polygonAreaShoelace(el.points);
            areaLabel = `~${(areaNorm * 800).toFixed(1)} m²`;
          }
        }
        if (areaLabel) {
          ctx.font = `bold ${Math.round(12 * scaleFactor)}px system-ui`;
          const tm = ctx.measureText(areaLabel);
          ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
          ctx.fillRect(cx - tm.width / 2 - 8, cy - 12 * scaleFactor, tm.width + 16, 24 * scaleFactor);
          ctx.strokeStyle = el.color || '#38bdf8';
          ctx.strokeRect(cx - tm.width / 2 - 8, cy - 12 * scaleFactor, tm.width + 16, 24 * scaleFactor);
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
        if (el.points.length >= 2) {
          const tx = el.points[1].x * width;
          const ty = el.points[1].y * height;
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
        break;
      }

      case 'distance-line': {
        if (el.points.length < 2) break;
        const p1 = { x: el.points[0].x * width, y: el.points[0].y * height };
        const p2 = { x: el.points[1].x * width, y: el.points[1].y * height };

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2.5 * scaleFactor;
        ctx.setLineDash([6 * scaleFactor, 5 * scaleFactor]);
        ctx.stroke();
        ctx.setLineDash([]);

        const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        let distText = `~${(distPx / (width * 0.05)).toFixed(1)}m`;
        if (options.homographyResult) {
          const d = getCalibratedDistanceMeters(el.points[0], el.points[1], options.homographyResult.H_inv);
          distText = `${d.toFixed(1)}m`;
        }

        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;
        ctx.font = `bold ${Math.round(12 * scaleFactor)}px monospace`;
        const tw = ctx.measureText(distText).width;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(mx - tw / 2 - 8, my - 12 * scaleFactor, tw + 16, 24 * scaleFactor);
        ctx.strokeStyle = '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(mx - tw / 2 - 8, my - 12 * scaleFactor, tw + 16, 24 * scaleFactor);
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
        ctx.fillRect(cx - pad, cy - 14 * scaleFactor - pad / 2, metrics.width + pad * 2, 28 * scaleFactor + pad);
        ctx.strokeStyle = el.color || '#38bdf8';
        ctx.lineWidth = 2 * scaleFactor;
        ctx.strokeRect(cx - pad, cy - 14 * scaleFactor - pad / 2, metrics.width + pad * 2, 28 * scaleFactor + pad);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, cy);
        break;
      }

      case 'freehand': {
        if (el.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(el.points[0].x * width, el.points[0].y * height);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x * width, el.points[i].y * height);
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
        ctx.lineWidth = 1.5;
        ctx.stroke();

        const badgeY = cy + r + 18 * scaleFactor;
        const badgeText = `${zoom.toFixed(1)}x ZOOM DETAIL`;
        ctx.font = `bold ${Math.round(11 * scaleFactor)}px monospace`;
        const bM = ctx.measureText(badgeText);
        ctx.fillStyle = 'rgba(15, 23, 42, 0.92)';
        ctx.fillRect(cx - bM.width / 2 - 8, badgeY - 10 * scaleFactor, bM.width + 16, 20 * scaleFactor);
        ctx.strokeStyle = el.color || '#38bdf8';
        ctx.strokeRect(cx - bM.width / 2 - 8, badgeY - 10 * scaleFactor, bM.width + 16, 20 * scaleFactor);
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(badgeText, cx, badgeY);
        break;
      }
    }

    ctx.restore();
  }

  return canvas.toDataURL('image/png');
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

// Telestration Canvas Offscreen Renderer for Hardware-Accelerated Video Burner
// Renders vector telestration graphics to full-resolution PNG overlay for FFmpeg
import type { DrawingElement, Point2D } from '$lib/types';
import { getInterpolatedPosition } from '$lib/tracking/playerTracker';

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
  currentTime: number = 0
): string {
  if (typeof document === 'undefined') return '';

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.clearRect(0, 0, width, height);

  for (const el of drawings) {
    if (el.points.length === 0) continue;
    ctx.save();

    let centerPt = el.points[0];
    if (el.keyframes && el.keyframes.length > 0) {
      const tracked = getInterpolatedPosition(el.keyframes, currentTime);
      if (tracked) centerPt = tracked;
    }

    switch (el.type) {
      case 'spotlight-3d': {
        const cx = centerPt.x * width;
        const cy = centerPt.y * height;
        const rx = 80;
        const ry = 32;
        const beamHeight = 180;
        const beamTopWidth = 36;

        // Volumetric beam
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

        // Floor glow
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
        ctx.lineWidth = 3.5;
        ctx.stroke();

        // Player Badge
        const badgeY = cy - beamHeight - 16;
        const labelText = el.label || '#10 Pivot';
        ctx.font = 'bold 15px system-ui, sans-serif';
        const tm = ctx.measureText(labelText);
        const pw = tm.width + 32;
        const ph = 28;

        ctx.fillStyle = 'rgba(11, 23, 42, 0.95)';
        ctx.beginPath();
        ctx.roundRect(cx - pw / 2, badgeY - ph / 2, pw, ph, 14);
        ctx.fill();
        ctx.strokeStyle = el.color || '#00f0ff';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.beginPath();
        ctx.arc(cx - pw / 2 + 12, badgeY, 5, 0, Math.PI * 2);
        ctx.fillStyle = el.color || '#00f0ff';
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(labelText, cx - pw / 2 + 22, badgeY);
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
          const offset = (el.curveOffset || -0.28) * len;
          cp = { x: mx + nx * offset, y: my + ny * offset };
        }

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.lineWidth = 8;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(p0.x, p0.y);
        ctx.quadraticCurveTo(cp.x, cp.y, p2.x, p2.y);
        ctx.strokeStyle = el.color || '#00f0ff';
        ctx.lineWidth = 4.5;
        ctx.lineCap = 'round';
        ctx.stroke();

        const angle = Math.atan2(p2.y - cp.y, p2.x - cp.x);
        const headlen = 22;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
          p2.x - headlen * Math.cos(angle - Math.PI / 6),
          p2.y - headlen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          p2.x - (headlen * 0.7) * Math.cos(angle),
          p2.y - (headlen * 0.7) * Math.sin(angle)
        );
        ctx.lineTo(
          p2.x - headlen * Math.cos(angle + Math.PI / 6),
          p2.y - headlen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = el.color || '#00f0ff';
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
        ctx.lineWidth = 2;
        ctx.fill();
        ctx.stroke();
        break;
      }

      case 'pass-arrow':
      case 'run-arrow': {
        if (el.points.length < 2) break;
        const p1 = { x: el.points[0].x * width, y: el.points[0].y * height };
        const p2 = { x: el.points[1].x * width, y: el.points[1].y * height };

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.7)';
        ctx.lineWidth = 8;
        if (el.type === 'run-arrow') ctx.setLineDash([12, 8]);
        ctx.stroke();
        ctx.setLineDash([]);

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = el.color || '#10b981';
        ctx.lineWidth = 4.5;
        if (el.type === 'run-arrow') ctx.setLineDash([12, 8]);
        ctx.stroke();
        ctx.setLineDash([]);

        const headlen = 20;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(
          p2.x - headlen * Math.cos(angle - Math.PI / 6),
          p2.y - headlen * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          p2.x - headlen * Math.cos(angle + Math.PI / 6),
          p2.y - headlen * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fillStyle = el.color || '#10b981';
        ctx.fill();
        break;
      }

      case 'player-circle': {
        const cx = centerPt.x * width;
        const cy = centerPt.y * height;
        const r = 32;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = el.color || '#f59e0b';
        ctx.lineWidth = 4;
        ctx.stroke();

        ctx.fillStyle = hexToRgba(el.color || '#f59e0b', 0.25);
        ctx.fill();

        if (el.label) {
          ctx.font = 'bold 14px system-ui';
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
        const arm = 24;

        ctx.beginPath();
        ctx.moveTo(cx - arm, cy - arm);
        ctx.lineTo(cx + arm, cy + arm);
        ctx.moveTo(cx + arm, cy - arm);
        ctx.lineTo(cx - arm, cy + arm);
        ctx.strokeStyle = 'rgba(0, 0, 0, 0.85)';
        ctx.lineWidth = 9;
        ctx.lineCap = 'round';
        ctx.stroke();

        ctx.beginPath();
        ctx.moveTo(cx - arm, cy - arm);
        ctx.lineTo(cx + arm, cy + arm);
        ctx.moveTo(cx + arm, cy - arm);
        ctx.lineTo(cx - arm, cy + arm);
        ctx.strokeStyle = el.color || '#ef4444';
        ctx.lineWidth = 5;
        ctx.lineCap = 'round';
        ctx.stroke();
        break;
      }

      case 'compactness-hull': {
        if (el.points.length < 3) break;
        ctx.beginPath();
        ctx.moveTo(el.points[0].x * width, el.points[0].y * height);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x * width, el.points[i].y * height);
        }
        ctx.closePath();
        ctx.fillStyle = hexToRgba(el.color || '#38bdf8', 0.25);
        ctx.fill();
        ctx.strokeStyle = el.color || '#38bdf8';
        ctx.lineWidth = 3.5;
        ctx.setLineDash([8, 6]);
        ctx.stroke();
        ctx.setLineDash([]);
        break;
      }
    }

    ctx.restore();
  }

  return canvas.toDataURL('image/png');
}

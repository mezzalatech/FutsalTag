// High-FPS Interactive Tactical & Telestration Drawing Engine
import type {
  PlayerToken,
  BallToken,
  EquipmentItem,
  DrawingElement,
  Point2D,
} from '$lib/types';
import {
  type ViewportTransform,
  metersToPixels,
  distanceMeters,
} from '$lib/pitch/futsal';

export interface RenderContextOptions {
  selectedElementId?: string | null;
  hoveredElementId?: string | null;
  interactive?: boolean;
  activeDrawing?: DrawingElement | null;
}

export function renderTacticalScene(
  ctx: CanvasRenderingContext2D,
  transform: ViewportTransform,
  players: PlayerToken[],
  ball: BallToken | null,
  equipment: EquipmentItem[],
  drawings: DrawingElement[],
  options: RenderContextOptions = {}
) {
  const { scale } = transform;

  // 1. Draw Ground Elements first (Spotlights & Pressing Zones)
  for (const d of drawings) {
    if (d.type === 'spotlight-3d' || d.type === 'pressing-zone') {
      drawSingleElement(ctx, d, transform, options.selectedElementId === d.id);
    }
  }

  // Active drawing in-progress ground element
  if (options.activeDrawing && (options.activeDrawing.type === 'spotlight-3d' || options.activeDrawing.type === 'pressing-zone')) {
    drawSingleElement(ctx, options.activeDrawing, transform, true);
  }

  // 2. Draw Vision Cones & Lines on Ground
  for (const d of drawings) {
    if (d.type === 'vision-cone' || d.type === 'distance-line' || d.type === 'pass-arrow' || d.type === 'run-arrow' || d.type === 'dribble-arrow' || d.type === 'freehand') {
      drawSingleElement(ctx, d, transform, options.selectedElementId === d.id);
    }
  }

  // Active drawing in-progress lines
  if (options.activeDrawing && options.activeDrawing.type !== 'spotlight-3d' && options.activeDrawing.type !== 'pressing-zone') {
    drawSingleElement(ctx, options.activeDrawing, transform, true);
  }

  // 3. Draw Equipment (Cones, Ladders)
  for (const eq of equipment) {
    drawEquipmentItem(ctx, eq, transform, options.selectedElementId === eq.id);
  }

  // 4. Draw Player Ghosts (Virtual shadow players)
  for (const d of drawings) {
    if (d.type === 'player-ghost') {
      drawSingleElement(ctx, d, transform, options.selectedElementId === d.id);
    }
  }

  // 5. Draw Players
  for (const player of players) {
    drawPlayerToken(ctx, player, transform, options.selectedElementId === player.id);
  }

  // 6. Draw Ball
  if (ball) {
    drawBallToken(ctx, ball, transform, options.selectedElementId === 'ball');
  }

  // 7. Draw Floating Text Notes on top
  for (const d of drawings) {
    if (d.type === 'text-note') {
      drawSingleElement(ctx, d, transform, options.selectedElementId === d.id);
    }
  }
}

// Draw Player Token
export function drawPlayerToken(
  ctx: CanvasRenderingContext2D,
  player: PlayerToken,
  transform: ViewportTransform,
  isSelected: boolean = false
) {
  const { scale } = transform;
  const pos = metersToPixels(player.x, player.y, transform);
  const radius = Math.max(14, 0.7 * scale); // ~0.7m radius

  ctx.save();

  // Highlight if selected
  if (isSelected) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#00f0ff';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Pulse glow
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 8, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(0, 240, 255, 0.35)';
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // Token shadow
  ctx.beginPath();
  ctx.arc(pos.x + 2, pos.y + 3, radius, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
  ctx.fill();

  // Determine colors based on team side
  let baseColor = player.color;
  let textColor = player.textColor || '#ffffff';
  let ringColor = 'rgba(255, 255, 255, 0.85)';

  if (!baseColor) {
    if (player.team === 'home') {
      baseColor = '#ef4444'; // Red
      ringColor = '#ffffff';
    } else if (player.team === 'away') {
      baseColor = '#3b82f6'; // Blue
      ringColor = '#ffffff';
    } else if (player.team === 'gk-home') {
      baseColor = '#f59e0b'; // Amber GK Home
      ringColor = '#000000';
      textColor = '#000000';
    } else if (player.team === 'gk-away') {
      baseColor = '#10b981'; // Green GK Away
      ringColor = '#ffffff';
    } else {
      baseColor = '#18181b'; // Black Referee
      ringColor = '#fbbf24';
    }
  }

  // Main token circle
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = baseColor;
  ctx.fill();
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = ringColor;
  ctx.stroke();

  // Direction pointer arrow if facingAngle is defined
  if (player.facingAngle !== undefined) {
    const arrowLen = radius + 8;
    const ax = pos.x + Math.cos(player.facingAngle) * arrowLen;
    const ay = pos.y + Math.sin(player.facingAngle) * arrowLen;
    ctx.beginPath();
    ctx.moveTo(pos.x + Math.cos(player.facingAngle) * radius, pos.y + Math.sin(player.facingAngle) * radius);
    ctx.lineTo(ax, ay);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Player Number text
  ctx.font = `bold ${Math.round(radius * 1.05)}px Inter, system-ui, sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = textColor;
  ctx.fillText(player.number, pos.x, pos.y);

  // Player Name / Role label under token
  if (player.name || player.role) {
    const labelText = player.name || player.role || '';
    ctx.font = `600 ${Math.max(10, Math.round(radius * 0.7))}px Inter, system-ui, sans-serif`;
    const textWidth = ctx.measureText(labelText).width;
    
    // Label pill background
    const pillY = pos.y + radius + 11;
    ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
    ctx.beginPath();
    ctx.roundRect(pos.x - textWidth / 2 - 5, pillY - 7, textWidth + 10, 15, 4);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.fillText(labelText, pos.x, pillY);
  }

  ctx.restore();
}

// Draw Ball Token (Futsal official size 4)
export function drawBallToken(
  ctx: CanvasRenderingContext2D,
  ball: BallToken,
  transform: ViewportTransform,
  isSelected: boolean = false
) {
  const { scale } = transform;
  const pos = metersToPixels(ball.x, ball.y, transform);
  const radius = Math.max(9, 0.35 * scale); // ~0.35m radius

  ctx.save();

  if (isSelected) {
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, radius + 4, 0, Math.PI * 2);
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  // Ball shadow
  ctx.beginPath();
  ctx.ellipse(pos.x + 2, pos.y + 3, radius, radius * 0.6, 0, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(0, 0, 0, 0.45)';
  ctx.fill();

  // Ball sphere (White & Fluorescent Yellow / Black Pentagons)
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
  ctx.fillStyle = '#fef08a'; // Futsal yellow/white
  ctx.fill();
  ctx.strokeStyle = '#18181b';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Pattern
  ctx.beginPath();
  ctx.arc(pos.x, pos.y, radius * 0.45, 0, Math.PI * 2);
  ctx.fillStyle = '#0f172a';
  ctx.fill();

  ctx.restore();
}

// Draw Equipment (Cones, Agility Ladder)
export function drawEquipmentItem(
  ctx: CanvasRenderingContext2D,
  eq: EquipmentItem,
  transform: ViewportTransform,
  isSelected: boolean = false
) {
  const pos = metersToPixels(eq.x, eq.y, transform);
  ctx.save();

  if (eq.type === 'cone-orange' || eq.type === 'cone-yellow') {
    const isOrange = eq.type === 'cone-orange';
    const coneRadius = 7;

    // Cone base circle
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, coneRadius, 0, Math.PI * 2);
    ctx.fillStyle = isOrange ? '#f97316' : '#eab308';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Center point
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
  }

  ctx.restore();
}

// Draw Single Tactical / Telestration Element
export function drawSingleElement(
  ctx: CanvasRenderingContext2D,
  el: DrawingElement,
  transform: ViewportTransform,
  isSelected: boolean = false
) {
  if (el.points.length === 0) return;

  const { scale } = transform;
  ctx.save();

  switch (el.type) {
    case 'pass-arrow':
    case 'run-arrow':
    case 'dribble-arrow': {
      if (el.points.length < 2) break;
      const p1 = metersToPixels(el.points[0].x, el.points[0].y, transform);
      const p2 = metersToPixels(el.points[1].x, el.points[1].y, transform);

      ctx.strokeStyle = el.color || '#ffffff';
      ctx.fillStyle = el.color || '#ffffff';
      ctx.lineWidth = el.lineWidth || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (el.type === 'run-arrow') {
        ctx.setLineDash([8, 6]);
      }

      if (el.type === 'dribble-arrow') {
        // Wavy line
        drawWavyLine(ctx, p1.x, p1.y, p2.x, p2.y, 6, 12);
      } else {
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
      }

      // Draw arrowhead at p2
      ctx.setLineDash([]);
      drawArrowHead(ctx, p1.x, p1.y, p2.x, p2.y, 14, el.color);
      break;
    }

    case 'spotlight-3d': {
      // 3D perspective spotlight on ground
      const center = metersToPixels(el.points[0].x, el.points[0].y, transform);
      const radiusX = Math.max(25, (el.lineWidth || 1.8) * scale);
      const radiusY = radiusX * 0.45; // Perspective tilt

      // Glow halo
      const grad = ctx.createRadialGradient(center.x, center.y, radiusY * 0.2, center.x, center.y, radiusX);
      grad.addColorStop(0, el.color || 'rgba(0, 240, 255, 0.4)');
      grad.addColorStop(0.7, el.color ? el.color.replace(')', ', 0.25)').replace('rgb', 'rgba') : 'rgba(0, 240, 255, 0.15)');
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();

      // Outer illuminated boundary ring
      ctx.beginPath();
      ctx.ellipse(center.x, center.y, radiusX, radiusY, 0, 0, Math.PI * 2);
      ctx.strokeStyle = el.color || '#00f0ff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      // Vertical spotlight beam rays upwards
      const beamGrad = ctx.createLinearGradient(center.x, center.y, center.x, center.y - 80);
      beamGrad.addColorStop(0, 'rgba(0, 240, 255, 0.25)');
      beamGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
      ctx.beginPath();
      ctx.moveTo(center.x - radiusX * 0.7, center.y);
      ctx.lineTo(center.x - radiusX * 0.3, center.y - 80);
      ctx.lineTo(center.x + radiusX * 0.3, center.y - 80);
      ctx.lineTo(center.x + radiusX * 0.7, center.y);
      ctx.fillStyle = beamGrad;
      ctx.fill();
      break;
    }

    case 'vision-cone': {
      if (el.points.length < 2) break;
      const origin = metersToPixels(el.points[0].x, el.points[0].y, transform);
      const target = metersToPixels(el.points[1].x, el.points[1].y, transform);

      const angle = Math.atan2(target.y - origin.y, target.x - origin.x);
      const length = Math.hypot(target.x - origin.x, target.y - origin.y);
      const halfSpread = (Math.PI / 180) * 30; // 60 deg cone

      ctx.beginPath();
      ctx.moveTo(origin.x, origin.y);
      ctx.arc(origin.x, origin.y, length, angle - halfSpread, angle + halfSpread);
      ctx.closePath();

      const coneGrad = ctx.createRadialGradient(origin.x, origin.y, 0, origin.x, origin.y, length);
      coneGrad.addColorStop(0, el.color || 'rgba(234, 179, 8, 0.35)');
      coneGrad.addColorStop(1, 'rgba(234, 179, 8, 0.05)');

      ctx.fillStyle = coneGrad;
      ctx.fill();
      ctx.strokeStyle = el.color || 'rgba(234, 179, 8, 0.7)';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      break;
    }

    case 'distance-line': {
      if (el.points.length < 2) break;
      const p1 = metersToPixels(el.points[0].x, el.points[0].y, transform);
      const p2 = metersToPixels(el.points[1].x, el.points[1].y, transform);
      const distM = distanceMeters(el.points[0], el.points[1]);

      // Dimension line with end ticks
      ctx.strokeStyle = el.color || '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();

      // End tick 1
      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const tickLen = 6;
      ctx.beginPath();
      ctx.moveTo(p1.x - Math.sin(angle) * tickLen, p1.y + Math.cos(angle) * tickLen);
      ctx.lineTo(p1.x + Math.sin(angle) * tickLen, p1.y - Math.cos(angle) * tickLen);
      ctx.moveTo(p2.x - Math.sin(angle) * tickLen, p2.y + Math.cos(angle) * tickLen);
      ctx.lineTo(p2.x + Math.sin(angle) * tickLen, p2.y - Math.cos(angle) * tickLen);
      ctx.stroke();

      // Distance Metric Badge in middle
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const text = `${distM.toFixed(1)} m`;

      ctx.font = 'bold 12px Inter, sans-serif';
      const tw = ctx.measureText(text).width;
      ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
      ctx.beginPath();
      ctx.roundRect(midX - tw / 2 - 6, midY - 10, tw + 12, 20, 4);
      ctx.fill();
      ctx.strokeStyle = el.color || '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, midX, midY);
      break;
    }

    case 'pressing-zone': {
      if (el.points.length < 3) break;
      ctx.beginPath();
      const first = metersToPixels(el.points[0].x, el.points[0].y, transform);
      ctx.moveTo(first.x, first.y);

      for (let i = 1; i < el.points.length; i++) {
        const pt = metersToPixels(el.points[i].x, el.points[i].y, transform);
        ctx.lineTo(pt.x, pt.y);
      }
      ctx.closePath();

      ctx.fillStyle = el.color || 'rgba(239, 68, 68, 0.2)';
      ctx.fill();
      ctx.strokeStyle = el.secondaryColor || el.color || '#ef4444';
      ctx.lineWidth = 2;
      ctx.setLineDash([6, 4]);
      ctx.stroke();
      ctx.setLineDash([]);

      if (el.label) {
        // Label at centroid
        let cx = 0, cy = 0;
        for (const pt of el.points) {
          cx += pt.x;
          cy += pt.y;
        }
        cx /= el.points.length;
        cy /= el.points.length;
        const cPos = metersToPixels(cx, cy, transform);

        ctx.font = 'bold 12px Inter, sans-serif';
        const tw = ctx.measureText(el.label).width;
        ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
        ctx.beginPath();
        ctx.roundRect(cPos.x - tw / 2 - 8, cPos.y - 11, tw + 16, 22, 6);
        ctx.fill();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(el.label, cPos.x, cPos.y);
      }
      break;
    }

    case 'player-ghost': {
      // Holographic phantom player
      const pt = metersToPixels(el.points[0].x, el.points[0].y, transform);
      const rad = Math.max(14, 0.7 * scale);

      ctx.save();
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, rad, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(56, 189, 248, 0.35)';
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 4]);
      ctx.stroke();

      ctx.font = 'bold 11px Inter, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(el.label || 'Ghost', pt.x, pt.y);
      ctx.restore();
      break;
    }

    case 'text-note': {
      const pt = metersToPixels(el.points[0].x, el.points[0].y, transform);
      const text = el.label || 'Catatan Taktis';

      ctx.font = '600 13px Inter, sans-serif';
      const tw = ctx.measureText(text).width;
      const th = 24;

      // Note badge
      ctx.fillStyle = el.color || '#1e293b';
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.roundRect(pt.x - 6, pt.y - th / 2, tw + 20, th, 6);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, pt.x + 4, pt.y);
      break;
    }

    case 'freehand': {
      if (el.points.length < 2) break;
      ctx.beginPath();
      const pStart = metersToPixels(el.points[0].x, el.points[0].y, transform);
      ctx.moveTo(pStart.x, pStart.y);
      for (let i = 1; i < el.points.length; i++) {
        const p = metersToPixels(el.points[i].x, el.points[i].y, transform);
        ctx.lineTo(p.x, p.y);
      }
      ctx.strokeStyle = el.color || '#ffff00';
      ctx.lineWidth = el.lineWidth || 3;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.stroke();
      break;
    }
  }

  ctx.restore();
}

// Helper: Arrowhead
function drawArrowHead(
  ctx: CanvasRenderingContext2D,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  headLen: number = 14,
  color: string = '#ffffff'
) {
  const angle = Math.atan2(toY - fromY, toX - fromX);
  ctx.save();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(toX, toY);
  ctx.lineTo(
    toX - headLen * Math.cos(angle - Math.PI / 6),
    toY - headLen * Math.sin(angle - Math.PI / 6)
  );
  ctx.lineTo(
    toX - (headLen * 0.6) * Math.cos(angle),
    toY - (headLen * 0.6) * Math.sin(angle)
  );
  ctx.lineTo(
    toX - headLen * Math.cos(angle + Math.PI / 6),
    toY - headLen * Math.sin(angle + Math.PI / 6)
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// Helper: Wavy Dribble Line
function drawWavyLine(
  ctx: CanvasRenderingContext2D,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  amplitude: number = 6,
  frequency: number = 12
) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const dist = Math.hypot(dx, dy);
  const angle = Math.atan2(dy, dx);
  const steps = Math.floor(dist / frequency);

  ctx.beginPath();
  ctx.moveTo(x1, y1);

  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const curDist = t * dist;
    const wave = (i % 2 === 0 ? 1 : -1) * amplitude;
    
    // Normal vector
    const nx = -Math.sin(angle);
    const ny = Math.cos(angle);

    const px = x1 + Math.cos(angle) * curDist + (i === 0 || i === steps ? 0 : nx * wave);
    const py = y1 + Math.sin(angle) * curDist + (i === 0 || i === steps ? 0 : ny * wave);
    ctx.lineTo(px, py);
  }

  ctx.stroke();
}

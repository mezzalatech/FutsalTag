// Broadcast-Quality Futsal Court Renderer
// Based on FIFA / AFC Futsal Laws of the Game (40m x 20m)

import {
  FUTSAL_DIMENSIONS,
  type ViewportTransform,
  metersToPixels,
} from '$lib/pitch/futsal';
import type { PitchSurfaceType } from '$lib/types';

export interface PitchStyle {
  floorBg: string;
  floorPattern?: 'wood' | 'court' | 'plain';
  lineColor: string;
  lineWidth: number;
  runOffColor: string;
  goalNetColor: string;
  goalPostColor: string;
}

export const PITCH_THEMES: Record<PitchSurfaceType, PitchStyle> = {
  wood: {
    floorBg: '#c99355',
    floorPattern: 'wood',
    lineColor: '#ffffff',
    lineWidth: 2,
    runOffColor: '#a8753c',
    goalNetColor: 'rgba(255, 255, 255, 0.4)',
    goalPostColor: '#ffffff',
  },
  'blue-vinyl': {
    floorBg: '#1e5f9e',
    floorPattern: 'court',
    lineColor: '#ffffff',
    lineWidth: 2,
    runOffColor: '#14416d',
    goalNetColor: 'rgba(255, 255, 255, 0.5)',
    goalPostColor: '#ffcc00',
  },
  'green-turf': {
    floorBg: '#2d6a4f',
    floorPattern: 'court',
    lineColor: '#ffffff',
    lineWidth: 2,
    runOffColor: '#1b4332',
    goalNetColor: 'rgba(255, 255, 255, 0.4)',
    goalPostColor: '#ffffff',
  },
  'dark-slate': {
    floorBg: '#1e232a',
    floorPattern: 'plain',
    lineColor: 'rgba(255, 255, 255, 0.75)',
    lineWidth: 1.8,
    runOffColor: '#13171c',
    goalNetColor: 'rgba(0, 230, 204, 0.4)',
    goalPostColor: '#00e6cc',
  },
};

export function renderFutsalPitch(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  transform: ViewportTransform,
  surfaceType: PitchSurfaceType = 'wood'
) {
  const theme = PITCH_THEMES[surfaceType];
  const { scale } = transform;

  // 1. Clear & draw background runoff area
  ctx.fillStyle = theme.runOffColor;
  ctx.fillRect(0, 0, width, height);

  // 2. Draw Court Floor
  ctx.save();
  const cTopLeft = metersToPixels(0, 0, transform);
  ctx.fillStyle = theme.floorBg;
  ctx.fillRect(cTopLeft.x, cTopLeft.y, transform.courtWidthPx, transform.courtHeightPx);

  // Decorative floor textures (e.g. wood planks or subtle lines)
  if (theme.floorPattern === 'wood') {
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.04)';
    ctx.lineWidth = 1;
    const plankHeightM = 1.0;
    const plankCount = Math.floor(FUTSAL_DIMENSIONS.width / plankHeightM);
    for (let i = 1; i < plankCount; i++) {
      const yPx = transform.offsetY + i * plankHeightM * scale;
      ctx.beginPath();
      ctx.moveTo(transform.offsetX, yPx);
      ctx.lineTo(transform.offsetX + transform.courtWidthPx, yPx);
      ctx.stroke();
    }
  }

  // Shadow around court boundary
  ctx.strokeStyle = 'rgba(0, 0, 0, 0.25)';
  ctx.lineWidth = 4;
  ctx.strokeRect(cTopLeft.x, cTopLeft.y, transform.courtWidthPx, transform.courtHeightPx);

  // 3. Setup Court Lines Style
  ctx.strokeStyle = theme.lineColor;
  ctx.fillStyle = theme.lineColor;
  ctx.lineWidth = theme.lineWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Boundary lines (Touchlines & Goal lines)
  ctx.strokeRect(cTopLeft.x, cTopLeft.y, transform.courtWidthPx, transform.courtHeightPx);

  // Halfway Line
  const halfM = FUTSAL_DIMENSIONS.length / 2; // 20m
  const halfTop = metersToPixels(halfM, 0, transform);
  const halfBottom = metersToPixels(halfM, FUTSAL_DIMENSIONS.width, transform);
  ctx.beginPath();
  ctx.moveTo(halfTop.x, halfTop.y);
  ctx.lineTo(halfBottom.x, halfBottom.y);
  ctx.stroke();

  // Center Spot & Center Circle
  const centerPos = metersToPixels(halfM, FUTSAL_DIMENSIONS.width / 2, transform);
  ctx.beginPath();
  ctx.arc(centerPos.x, centerPos.y, FUTSAL_DIMENSIONS.centerRadius * scale, 0, Math.PI * 2);
  ctx.stroke();

  // Center mark dot
  ctx.beginPath();
  ctx.arc(centerPos.x, centerPos.y, 0.15 * scale, 0, Math.PI * 2);
  ctx.fill();

  // 4. Penalty Areas (Left & Right)
  // Goal width = 3m, court width = 20m -> Goal sits between y = 8.5m and y = 11.5m
  const goalY1 = (FUTSAL_DIMENSIONS.width - FUTSAL_DIMENSIONS.goalWidth) / 2; // 8.5m
  const goalY2 = goalY1 + FUTSAL_DIMENSIONS.goalWidth; // 11.5m
  const penRadPx = FUTSAL_DIMENSIONS.penaltyRadius * scale; // 6m in px

  // --- LEFT PENALTY AREA (x = 0) ---
  ctx.beginPath();
  // Quarter-circle from top goalpost (0, 8.5) outward
  const postLeftTop = metersToPixels(0, goalY1, transform);
  const postLeftBottom = metersToPixels(0, goalY2, transform);

  // Arc 1: around (0, 8.5) from -PI/2 (up) to 0 (right)
  ctx.arc(postLeftTop.x, postLeftTop.y, penRadPx, -Math.PI / 2, 0, false);
  // Straight line 3.16m connecting the two arcs parallel to goal line at x = 6m
  const arcTopEnd = metersToPixels(6.0, goalY1, transform);
  const arcBottomEnd = metersToPixels(6.0, goalY2, transform);
  ctx.lineTo(arcBottomEnd.x, arcBottomEnd.y);
  // Arc 2: around (0, 11.5) from 0 to PI/2 (down)
  ctx.arc(postLeftBottom.x, postLeftBottom.y, penRadPx, 0, Math.PI / 2, false);
  ctx.stroke();

  // Left 6m Penalty Spot
  const leftPenSpot = metersToPixels(FUTSAL_DIMENSIONS.penaltySpotDist, FUTSAL_DIMENSIONS.width / 2, transform);
  ctx.beginPath();
  ctx.arc(leftPenSpot.x, leftPenSpot.y, 0.12 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Left 10m Double Penalty Spot
  const leftDoublePenSpot = metersToPixels(FUTSAL_DIMENSIONS.doublePenaltyDist, FUTSAL_DIMENSIONS.width / 2, transform);
  ctx.beginPath();
  ctx.arc(leftDoublePenSpot.x, leftDoublePenSpot.y, 0.12 * scale, 0, Math.PI * 2);
  ctx.fill();

  // --- RIGHT PENALTY AREA (x = 40) ---
  ctx.beginPath();
  const postRightTop = metersToPixels(FUTSAL_DIMENSIONS.length, goalY1, transform);
  const postRightBottom = metersToPixels(FUTSAL_DIMENSIONS.length, goalY2, transform);

  // Arc 1: around (40, 8.5) from -PI/2 to PI (leftward)
  ctx.arc(postRightTop.x, postRightTop.y, penRadPx, -Math.PI / 2, Math.PI, true);
  // Straight line 3.16m at x = 34m
  const arcRBottomEnd = metersToPixels(34.0, goalY2, transform);
  ctx.lineTo(arcRBottomEnd.x, arcRBottomEnd.y);
  // Arc 2: around (40, 11.5) from PI to PI/2
  ctx.arc(postRightBottom.x, postRightBottom.y, penRadPx, Math.PI, Math.PI / 2, true);
  ctx.stroke();

  // Right 6m Penalty Spot
  const rightPenSpot = metersToPixels(FUTSAL_DIMENSIONS.length - FUTSAL_DIMENSIONS.penaltySpotDist, FUTSAL_DIMENSIONS.width / 2, transform);
  ctx.beginPath();
  ctx.arc(rightPenSpot.x, rightPenSpot.y, 0.12 * scale, 0, Math.PI * 2);
  ctx.fill();

  // Right 10m Double Penalty Spot
  const rightDoublePenSpot = metersToPixels(FUTSAL_DIMENSIONS.length - FUTSAL_DIMENSIONS.doublePenaltyDist, FUTSAL_DIMENSIONS.width / 2, transform);
  ctx.beginPath();
  ctx.arc(rightDoublePenSpot.x, rightDoublePenSpot.y, 0.12 * scale, 0, Math.PI * 2);
  ctx.fill();

  // 5. Corner Arcs (0.25m)
  const cornerRadPx = FUTSAL_DIMENSIONS.cornerArcRadius * scale;
  // Top-left
  ctx.beginPath();
  ctx.arc(cTopLeft.x, cTopLeft.y, cornerRadPx, 0, Math.PI / 2);
  ctx.stroke();
  // Bottom-left
  const bLeft = metersToPixels(0, FUTSAL_DIMENSIONS.width, transform);
  ctx.beginPath();
  ctx.arc(bLeft.x, bLeft.y, cornerRadPx, -Math.PI / 2, 0);
  ctx.stroke();
  // Top-right
  const tRight = metersToPixels(FUTSAL_DIMENSIONS.length, 0, transform);
  ctx.beginPath();
  ctx.arc(tRight.x, tRight.y, cornerRadPx, Math.PI / 2, Math.PI);
  ctx.stroke();
  // Bottom-right
  const bRight = metersToPixels(FUTSAL_DIMENSIONS.length, FUTSAL_DIMENSIONS.width, transform);
  ctx.beginPath();
  ctx.arc(bRight.x, bRight.y, cornerRadPx, Math.PI, -Math.PI / 2);
  ctx.stroke();

  // 6. Goals & Nets (3m x 1m outside field)
  const goalDepthPx = FUTSAL_DIMENSIONS.goalDepth * scale;
  
  // Left Goal
  ctx.save();
  ctx.fillStyle = theme.goalNetColor;
  ctx.strokeStyle = theme.goalPostColor;
  ctx.lineWidth = 2.5;
  const leftGoalX = cTopLeft.x - goalDepthPx;
  const leftGoalY = postLeftTop.y;
  const goalHeightPx = (goalY2 - goalY1) * scale;
  ctx.fillRect(leftGoalX, leftGoalY, goalDepthPx, goalHeightPx);
  ctx.strokeRect(leftGoalX, leftGoalY, goalDepthPx, goalHeightPx);

  // Right Goal
  const rightGoalX = tRight.x;
  const rightGoalY = postRightTop.y;
  ctx.fillRect(rightGoalX, rightGoalY, goalDepthPx, goalHeightPx);
  ctx.strokeRect(rightGoalX, rightGoalY, goalDepthPx, goalHeightPx);
  ctx.restore();

  // 7. Substitution Zones (5m length on side line)
  ctx.strokeStyle = theme.lineColor;
  ctx.lineWidth = 1.5;
  const subY = metersToPixels(0, 0, transform).y;
  const sub1Start = metersToPixels(halfM - 5.0, 0, transform);
  const sub1End = metersToPixels(halfM - 10.0, 0, transform);
  // Mark ticks across touchline
  ctx.beginPath();
  ctx.moveTo(sub1Start.x, subY - 4);
  ctx.lineTo(sub1Start.x, subY + 4);
  ctx.moveTo(sub1End.x, subY - 4);
  ctx.lineTo(sub1End.x, subY + 4);

  const sub2Start = metersToPixels(halfM + 5.0, 0, transform);
  const sub2End = metersToPixels(halfM + 10.0, 0, transform);
  ctx.moveTo(sub2Start.x, subY - 4);
  ctx.lineTo(sub2Start.x, subY + 4);
  ctx.moveTo(sub2End.x, subY - 4);
  ctx.lineTo(sub2End.x, subY + 4);
  ctx.stroke();

  ctx.restore();
}

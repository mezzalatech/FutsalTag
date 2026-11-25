// 3D Pitch Homography Calibration & Perspective Geometry (Once Sport Clean-Room Equivalent)
// Calibrates 2D broadcast camera perspective to FIFA Futsal Pitch (40m x 20m)
import type { Point2D, TemporalCalibrationFrame } from '$lib/types';
import {
  computeHomography,
  applyHomography,
  invertMatrix3x3,
  type Matrix3x3,
  FUTSAL_DIMENSIONS,
} from './futsal';

export interface PitchCalibrationPoints {
  tl: Point2D; // Top Left corner (0, 0 in court meters)
  tr: Point2D; // Top Right corner (40, 0 in court meters)
  br: Point2D; // Bottom Right corner (40, 20 in court meters)
  bl: Point2D; // Bottom Left corner (0, 20 in court meters)
}

export interface CalibrationResult {
  H: Matrix3x3;       // Court (meters) -> Canvas (normalized 0..1)
  H_inv: Matrix3x3;   // Canvas (normalized 0..1) -> Court (meters: 0..40, 0..20)
}

export const CALIBRATION_PRESETS: Record<string, { label: string; points: PitchCalibrationPoints }> = {
  'main-sideline': {
    label: 'Tribun Samping (Main Broadcast)',
    points: {
      tl: { x: 0.16, y: 0.26 },
      tr: { x: 0.84, y: 0.26 },
      br: { x: 0.96, y: 0.88 },
      bl: { x: 0.04, y: 0.88 },
    },
  },
  'corner-camera': {
    label: 'Sudut Lapangan (Corner Angle)',
    points: {
      tl: { x: 0.35, y: 0.18 },
      tr: { x: 0.92, y: 0.32 },
      br: { x: 0.72, y: 0.92 },
      bl: { x: 0.08, y: 0.65 },
    },
  },
  'endline-camera': {
    label: 'Gawang / Endline View',
    points: {
      tl: { x: 0.26, y: 0.22 },
      tr: { x: 0.74, y: 0.22 },
      br: { x: 0.88, y: 0.92 },
      bl: { x: 0.12, y: 0.92 },
    },
  },
};

// Compute Homography from 4 corner calibration points
export function calculatePitchCalibration(points: PitchCalibrationPoints): CalibrationResult | null {
  // Source: Court coordinates in meters
  // tl: (0, 0), tr: (40, 0), br: (40, 20), bl: (0, 20)
  const courtCorners = [
    { x: 0, y: 0 },
    { x: FUTSAL_DIMENSIONS.length, y: 0 },
    { x: FUTSAL_DIMENSIONS.length, y: FUTSAL_DIMENSIONS.width },
    { x: 0, y: FUTSAL_DIMENSIONS.width },
  ];

  // Destination: Canvas normalized coordinates (0..1)
  const canvasCorners = [
    points.tl,
    points.tr,
    points.br,
    points.bl,
  ];

  // H maps Court -> Canvas
  const H = computeHomography(courtCorners, canvasCorners);
  if (!H) return null;

  const H_inv = invertMatrix3x3(H);
  if (!H_inv) return null;

  return { H, H_inv };
}

// Convert Canvas point (normalized 0..1) to real Futsal Court meters (0..40, 0..20)
export function canvasToCourtMeters(
  pt: Point2D,
  H_inv: Matrix3x3
): { x: number; y: number } {
  const res = applyHomography(H_inv, pt);
  return {
    x: Math.max(0, Math.min(FUTSAL_DIMENSIONS.length, res.x)),
    y: Math.max(0, Math.min(FUTSAL_DIMENSIONS.width, res.y)),
  };
}

// Calculate mathematically exact distance between two screen points in real meters
export function getCalibratedDistanceMeters(
  p1: Point2D,
  p2: Point2D,
  H_inv: Matrix3x3
): number {
  const m1 = canvasToCourtMeters(p1, H_inv);
  const m2 = canvasToCourtMeters(p2, H_inv);
  const dx = m2.x - m1.x;
  const dy = m2.y - m1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Draw the 3D calibrated court grid overlay on canvas for visualization and alignment
export function drawCalibratedCourtOverlay(
  ctx: CanvasRenderingContext2D,
  calibration: PitchCalibrationPoints,
  w: number,
  h: number
) {
  const { tl, tr, br, bl } = calibration;
  const pTL = { x: tl.x * w, y: tl.y * h };
  const pTR = { x: tr.x * w, y: tr.y * h };
  const pBR = { x: br.x * w, y: br.y * h };
  const pBL = { x: bl.x * w, y: bl.y * h };

  ctx.save();
  // 1. Perimeter court boundary
  ctx.beginPath();
  ctx.moveTo(pTL.x, pTL.y);
  ctx.lineTo(pTR.x, pTR.y);
  ctx.lineTo(pBR.x, pBR.y);
  ctx.lineTo(pBL.x, pBL.y);
  ctx.closePath();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.7)';
  ctx.lineWidth = 2;
  ctx.setLineDash([8, 6]);
  ctx.stroke();
  ctx.setLineDash([]);

  // Court floor transparent tint
  ctx.fillStyle = 'rgba(56, 189, 248, 0.05)';
  ctx.fill();

  // 2. Centerline
  const midTop = { x: (pTL.x + pTR.x) / 2, y: (pTL.y + pTR.y) / 2 };
  const midBottom = { x: (pBL.x + pBR.x) / 2, y: (pBL.y + pBR.y) / 2 };

  ctx.beginPath();
  ctx.moveTo(midTop.x, midTop.y);
  ctx.lineTo(midBottom.x, midBottom.y);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.5)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // 3. Four Corner Handle Pins
  const corners = [
    { pt: pTL, label: 'TL (0,0m)' },
    { pt: pTR, label: 'TR (40,0m)' },
    { pt: pBR, label: 'BR (40,20m)' },
    { pt: pBL, label: 'BL (0,20m)' },
  ];

  for (const c of corners) {
    ctx.beginPath();
    ctx.arc(c.pt.x, c.pt.y, 7, 0, Math.PI * 2);
    ctx.fillStyle = '#38bdf8';
    ctx.fill();
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.font = 'bold 10px monospace';
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.fillText(c.label, c.pt.x, c.pt.y - 10);
  }

  ctx.restore();
}

export function interpolateCalibrationAtTime(
  frames: TemporalCalibrationFrame[],
  time: number,
  fallback: PitchCalibrationPoints
): PitchCalibrationPoints {
  if (!frames || frames.length === 0) return fallback;
  if (frames.length === 1 || time <= frames[0].time) {
    const f = frames[0];
    return { tl: f.tl, tr: f.tr, br: f.br, bl: f.bl };
  }
  const last = frames[frames.length - 1];
  if (time >= last.time) {
    return { tl: last.tl, tr: last.tr, br: last.br, bl: last.bl };
  }

  for (let i = 0; i < frames.length - 1; i++) {
    const a = frames[i];
    const b = frames[i + 1];
    if (time >= a.time && time <= b.time) {
      const span = b.time - a.time;
      if (span <= 1e-6) {
        return { tl: a.tl, tr: a.tr, br: a.br, bl: a.bl };
      }
      const t = (time - a.time) / span;
      const lerpPt = (p: Point2D, q: Point2D): Point2D => ({
        x: p.x + (q.x - p.x) * t,
        y: p.y + (q.y - p.y) * t,
      });
      return {
        tl: lerpPt(a.tl, b.tl),
        tr: lerpPt(a.tr, b.tr),
        br: lerpPt(a.br, b.br),
        bl: lerpPt(a.bl, b.bl),
      };
    }
  }
  return fallback;
}

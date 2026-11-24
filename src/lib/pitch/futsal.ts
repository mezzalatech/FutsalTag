// Futsal Court Geometry & Homography Matrix Mathematics
// Standard FIFA/AMF Futsal Regulations: 40m length x 20m width

export interface CourtDimensions {
  length: number; // 40m
  width: number;  // 20m
  centerRadius: number; // 3.0m
  penaltyRadius: number; // 6.0m
  penaltySpotDist: number; // 6.0m
  doublePenaltyDist: number; // 10.0m
  cornerArcRadius: number; // 0.25m
  goalWidth: number; // 3.0m
  goalDepth: number; // 1.0m
  subZoneLength: number; // 5.0m
}

export const FUTSAL_DIMENSIONS: CourtDimensions = {
  length: 40.0,
  width: 20.0,
  centerRadius: 3.0,
  penaltyRadius: 6.0,
  penaltySpotDist: 6.0,
  doublePenaltyDist: 10.0,
  cornerArcRadius: 0.25,
  goalWidth: 3.0,
  goalDepth: 1.0,
  subZoneLength: 5.0,
};

export interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
  courtWidthPx: number;
  courtHeightPx: number;
}

export function calculateViewportTransform(
  canvasWidth: number,
  canvasHeight: number,
  padding: number = 32
): ViewportTransform {
  const availWidth = canvasWidth - padding * 2;
  const availHeight = canvasHeight - padding * 2;
  
  const courtAspect = FUTSAL_DIMENSIONS.length / FUTSAL_DIMENSIONS.width; // 40 / 20 = 2.0
  const screenAspect = availWidth / availHeight;

  let courtWidthPx: number;
  let courtHeightPx: number;

  if (screenAspect > courtAspect) {
    courtHeightPx = availHeight;
    courtWidthPx = courtHeightPx * courtAspect;
  } else {
    courtWidthPx = availWidth;
    courtHeightPx = courtWidthPx / courtAspect;
  }

  const offsetX = (canvasWidth - courtWidthPx) / 2;
  const offsetY = (canvasHeight - courtHeightPx) / 2;
  const scale = courtWidthPx / FUTSAL_DIMENSIONS.length;

  return { scale, offsetX, offsetY, courtWidthPx, courtHeightPx };
}

// Convert Court coordinates (meters: 0..40, 0..20) to Canvas pixels
export function metersToPixels(xM: number, yM: number, transform: ViewportTransform): { x: number; y: number } {
  return {
    x: transform.offsetX + xM * transform.scale,
    y: transform.offsetY + yM * transform.scale,
  };
}

// Convert Canvas pixels to Court coordinates (meters)
export function pixelsToMeters(xPx: number, yPx: number, transform: ViewportTransform): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(FUTSAL_DIMENSIONS.length, (xPx - transform.offsetX) / transform.scale)),
    y: Math.max(0, Math.min(FUTSAL_DIMENSIONS.width, (yPx - transform.offsetY) / transform.scale)),
  };
}

// Calculate Euclidean distance in meters between two points
export function distanceMeters(p1: { x: number; y: number }, p2: { x: number; y: number }): number {
  const dx = p1.x - p2.x;
  const dy = p1.y - p2.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ==========================================
// 3D PERSPECTIVE HOMOGRAPHY (PITCH CALIBRATION)
// ==========================================
export type Matrix3x3 = [
  number, number, number,
  number, number, number,
  number, number, number
];

// Direct Linear Transformation (DLT) from 4 correspondences
// Maps (src[i].x, src[i].y) -> (dst[i].x, dst[i].y)
export function computeHomography(
  src: Array<{ x: number; y: number }>,
  dst: Array<{ x: number; y: number }>
): Matrix3x3 | null {
  if (src.length < 4 || dst.length < 4) return null;

  // Construct 8x8 linear system Ah = b where h9 = 1
  const A: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const xs = src[i].x, ys = src[i].y;
    const xd = dst[i].x, yd = dst[i].y;

    A.push([xs, ys, 1, 0, 0, 0, -xd * xs, -xd * ys]);
    b.push(xd);

    A.push([0, 0, 0, xs, ys, 1, -yd * xs, -yd * ys]);
    b.push(yd);
  }

  // Solve 8x8 system using Gaussian elimination with partial pivoting
  const h = solveLinearSystem8x8(A, b);
  if (!h) return null;

  return [
    h[0], h[1], h[2],
    h[3], h[4], h[5],
    h[6], h[7], 1.0
  ];
}

function solveLinearSystem8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const M: number[][] = [];
  for (let i = 0; i < n; i++) {
    M.push([...A[i], b[i]]);
  }

  for (let i = 0; i < n; i++) {
    let maxRow = i;
    for (let k = i + 1; k < n; k++) {
      if (Math.abs(M[k][i]) > Math.abs(M[maxRow][i])) {
        maxRow = k;
      }
    }

    const temp = M[i];
    M[i] = M[maxRow];
    M[maxRow] = temp;

    if (Math.abs(M[i][i]) < 1e-12) return null;

    for (let k = i + 1; k < n; k++) {
      const c = -M[k][i] / M[i][i];
      for (let j = i; j <= n; j++) {
        if (i === j) {
          M[k][j] = 0;
        } else {
          M[k][j] += c * M[i][j];
        }
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    x[i] = M[i][n] / M[i][i];
    for (let k = i - 1; k >= 0; k--) {
      M[k][n] -= M[k][i] * x[i];
    }
  }

  return x;
}

// Apply 3x3 homography matrix to point
export function applyHomography(H: Matrix3x3, pt: { x: number; y: number }): { x: number; y: number } {
  const x = pt.x, y = pt.y;
  const w = H[6] * x + H[7] * y + H[8];
  if (Math.abs(w) < 1e-9) return { x: 0, y: 0 };
  return {
    x: (H[0] * x + H[1] * y + H[2]) / w,
    y: (H[3] * x + H[4] * y + H[5]) / w,
  };
}

// Invert 3x3 matrix
export function invertMatrix3x3(m: Matrix3x3): Matrix3x3 | null {
  const [
    a, b, c,
    d, e, f,
    g, h, i
  ] = m;

  const A = e * i - f * h;
  const B = -(d * i - f * g);
  const C = d * h - e * g;
  const D = -(b * i - c * h);
  const E = a * i - c * g;
  const F = -(a * h - b * g);
  const G = b * f - c * e;
  const H_ = -(a * f - c * d);
  const I = a * e - b * d;

  const det = a * A + b * B + c * C;
  if (Math.abs(det) < 1e-12) return null;

  const invDet = 1.0 / det;
  return [
    A * invDet, D * invDet, G * invDet,
    B * invDet, E * invDet, H_ * invDet,
    C * invDet, F * invDet, I * invDet
  ];
}

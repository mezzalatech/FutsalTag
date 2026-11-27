use crate::ffmpeg;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct NormPointDto {
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AutoCourtCalibrationResult {
    pub tl: NormPointDto,
    pub tr: NormPointDto,
    pub br: NormPointDto,
    pub bl: NormPointDto,
    pub confidence: f64,
    pub lines_detected: usize,
    pub method: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TemporalCalibrationFrameDto {
    pub time: f64,
    pub tl: NormPointDto,
    pub tr: NormPointDto,
    pub br: NormPointDto,
    pub bl: NormPointDto,
    pub confidence: f64,
}

#[derive(Debug, Clone, Copy)]
struct Line2D {
    // Normalized ax + by + c = 0 where a^2 + b^2 = 1
    a: f64,
    b: f64,
    c: f64,
    inliers: usize,
}

struct XorShift64(u64);

impl XorShift64 {
    fn next_u64(&mut self) -> u64 {
        let mut x = self.0;
        x ^= x << 13;
        x ^= x >> 7;
        x ^= x << 17;
        self.0 = x;
        x
    }

    fn next_usize(&mut self, bound: usize) -> usize {
        if bound <= 1 {
            return 0;
        }
        (self.next_u64() as usize) % bound
    }
}

fn solve_linear_system_8x8(mut m: [[f64; 9]; 8]) -> Option<[f64; 8]> {
    for i in 0..8 {
        let mut max_row = i;
        let mut max_val = m[i][i].abs();
        for k in (i + 1)..8 {
            if m[k][i].abs() > max_val {
                max_val = m[k][i].abs();
                max_row = k;
            }
        }
        if max_val < 1e-11 {
            return None;
        }
        if max_row != i {
            m.swap(i, max_row);
        }
        let pivot = m[i][i];
        for k in (i + 1)..8 {
            let factor = m[k][i] / pivot;
            m[k][i] = 0.0;
            for j in (i + 1)..=8 {
                m[k][j] -= factor * m[i][j];
            }
        }
    }

    let mut x = [0.0f64; 8];
    for i in (0..8).rev() {
        let mut sum = m[i][8];
        for j in (i + 1)..8 {
            sum -= m[i][j] * x[j];
        }
        x[i] = sum / m[i][i];
        if !x[i].is_finite() {
            return None;
        }
    }
    Some(x)
}

pub fn compute_homography_4pt(src: &[(f64, f64); 4], dst: &[(f64, f64); 4]) -> Option<[f64; 9]> {
    let mut m = [[0.0f64; 9]; 8];
    for i in 0..4 {
        let (xs, ys) = src[i];
        let (xd, yd) = dst[i];
        let r0 = i * 2;
        m[r0] = [xs, ys, 1.0, 0.0, 0.0, 0.0, -xd * xs, -xd * ys, xd];
        let r1 = i * 2 + 1;
        m[r1] = [0.0, 0.0, 0.0, xs, ys, 1.0, -yd * xs, -yd * ys, yd];
    }
    let h = solve_linear_system_8x8(m)?;
    Some([h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1.0])
}

pub fn apply_homography_pt(h: &[f64; 9], x: f64, y: f64) -> (f64, f64) {
    let w = h[6] * x + h[7] * y + h[8];
    if w.abs() < 1e-9 {
        return (x, y);
    }
    (
        (h[0] * x + h[1] * y + h[2]) / w,
        (h[3] * x + h[4] * y + h[5]) / w,
    )
}

fn fit_line_two_points(p1: (f64, f64), p2: (f64, f64)) -> Option<(f64, f64, f64)> {
    let dx = p2.0 - p1.0;
    let dy = p2.1 - p1.1;
    let len = (dx * dx + dy * dy).sqrt();
    if len < 0.04 {
        return None;
    }
    let a = -dy / len;
    let b = dx / len;
    let c = -(a * p1.0 + b * p1.1);
    Some((a, b, c))
}

fn intersect_lines(l1: Line2D, l2: Line2D) -> Option<(f64, f64)> {
    let det = l1.a * l2.b - l2.a * l1.b;
    if det.abs() < 1e-5 {
        return None;
    }
    let x = (l1.b * l2.c - l2.b * l1.c) / det;
    let y = (l2.a * l1.c - l1.a * l2.c) / det;
    if x.is_finite() && y.is_finite() {
        Some((x, y))
    } else {
        None
    }
}

fn ransac_line(
    pts: &[(f64, f64)],
    iters: usize,
    dist_thresh: f64,
    min_inliers: usize,
    seed: u64,
    predicate: impl Fn(f64, f64, f64) -> bool,
) -> Option<Line2D> {
    if pts.len() < min_inliers.max(2) {
        return None;
    }
    let mut rng = XorShift64(seed);
    let mut best: Option<Line2D> = None;

    for _ in 0..iters {
        let i1 = rng.next_usize(pts.len());
        let i2 = rng.next_usize(pts.len());
        if i1 == i2 {
            continue;
        }
        let Some((a, b, c)) = fit_line_two_points(pts[i1], pts[i2]) else {
            continue;
        };
        if !predicate(a, b, c) {
            continue;
        }
        let mut count = 0usize;
        for &(px, py) in pts {
            if (a * px + b * py + c).abs() <= dist_thresh {
                count += 1;
            }
        }
        if count >= min_inliers {
            if best.map_or(true, |cur| count > cur.inliers) {
                best = Some(Line2D {
                    a,
                    b,
                    c,
                    inliers: count,
                });
            }
        }
    }
    best
}

fn is_valid_convex_quad(tl: NormPointDto, tr: NormPointDto, br: NormPointDto, bl: NormPointDto) -> bool {
    let pts = [tl, tr, br, bl];
    for p in pts {
        if !p.x.is_finite()
            || !p.y.is_finite()
            || p.x < -0.25
            || p.x > 1.25
            || p.y < -0.15
            || p.y > 1.25
        {
            return false;
        }
    }
    if tr.x - tl.x < 0.22 || br.x - bl.x < 0.25 {
        return false;
    }
    if bl.y - tl.y < 0.10 || br.y - tr.y < 0.10 {
        return false;
    }
    // Check signed area > minimum threshold and consistent winding
    let area2 = (tl.x * tr.y - tr.x * tl.y)
        + (tr.x * br.y - br.x * tr.y)
        + (br.x * bl.y - bl.x * br.y)
        + (bl.x * tl.y - tl.x * bl.y);
    area2.abs() > 0.10
}

fn cap_points(mut pts: Vec<(f64, f64)>, max_len: usize) -> Vec<(f64, f64)> {
    if pts.len() > max_len && max_len > 0 {
        let stride = (pts.len() / max_len).max(1);
        pts = pts.into_iter().step_by(stride).take(max_len).collect();
    }
    pts
}

pub fn auto_detect_court_corners_rgb(rgb: &[u8], w: u32, h: u32) -> AutoCourtCalibrationResult {
    let default_tl = NormPointDto { x: 0.16, y: 0.52 };
    let default_tr = NormPointDto { x: 0.84, y: 0.52 };
    let default_br = NormPointDto { x: 0.96, y: 0.92 };
    let default_bl = NormPointDto { x: 0.04, y: 0.92 };

    if w < 16 || h < 16 || rgb.len() < (w * h * 3) as usize {
        return AutoCourtCalibrationResult {
            tl: default_tl,
            tr: default_tr,
            br: default_br,
            bl: default_bl,
            confidence: 0.25,
            lines_detected: 0,
            method: "Preset Default Sideline (Frame terlalu kecil)".to_string(),
        };
    }

    // Downsample to 640x360 luma + saturation maps
    let dw = 640usize;
    let dh = 360usize;
    let mut luma = vec![0.0f32; dw * dh];
    let mut sat = vec![0.0f32; dw * dh];
    for dy in 0..dh {
        let sy = ((dy as f32 + 0.5) / dh as f32 * h as f32) as u32;
        let sy = sy.min(h - 1);
        for dx in 0..dw {
            let sx = ((dx as f32 + 0.5) / dw as f32 * w as f32) as u32;
            let sx = sx.min(w - 1);
            let idx = ((sy * w + sx) * 3) as usize;
            let r = rgb[idx] as f32;
            let g = rgb[idx + 1] as f32;
            let b = rgb[idx + 2] as f32;
            let yv = 0.299 * r + 0.587 * g + 0.114 * b;
            let max_c = r.max(g).max(b);
            let min_c = r.min(g).min(b);
            luma[dy * dw + dx] = yv;
            sat[dy * dw + dx] = max_c - min_c;
        }
    }

    // Ridge detection for bright thin painted lines in court half (y in 0.42..0.98)
    let mut ridge_pts: Vec<(f64, f64)> = Vec::new();
    let y_start = (dh as f32 * 0.42) as usize;
    let y_end = (dh as f32 * 0.98) as usize;
    let step_off = 5usize;

    for y in y_start.max(step_off)..y_end.min(dh - step_off) {
        for x in step_off..(dw - step_off) {
            let c = luma[y * dw + x];
            if c < 115.0 || sat[y * dw + x] > 80.0 {
                continue;
            }
            let h_bg = 0.5 * (luma[y * dw + (x - step_off)] + luma[y * dw + (x + step_off)]);
            let v_bg = 0.5 * (luma[(y - step_off) * dw + x] + luma[(y + step_off) * dw + x]);
            let ridge_v = (c - v_bg).max(c - h_bg);
            if ridge_v >= 12.0 {
                ridge_pts.push((x as f64 / dw as f64, y as f64 / dh as f64));
            }
        }
    }

    let top_cands = cap_points(
        ridge_pts
            .iter()
            .copied()
            .filter(|&(x, y)| y >= 0.44 && y <= 0.70 && x >= 0.08 && x <= 0.92)
            .collect(),
        1200,
    );
    let top_line = ransac_line(&top_cands, 320, 0.015, 18, 0xA11CE001, |a, b, _| {
        b.abs() > 0.7 && (a / b).abs() <= 0.22
    });

    let top_y_ref = top_line
        .map(|l| (-(l.a * 0.5 + l.c) / l.b).clamp(0.42, 0.70))
        .unwrap_or(0.55);

    let bot_cands = cap_points(
        ridge_pts
            .iter()
            .copied()
            .filter(|&(_, y)| y >= (top_y_ref + 0.16).max(0.73) && y <= 0.98)
            .collect(),
        1200,
    );
    let bot_line = ransac_line(&bot_cands, 320, 0.016, 16, 0xB0770002, |a, b, _| {
        b.abs() > 0.7 && (a / b).abs() <= 0.22
    });

    let bot_y_ref = bot_line
        .map(|l| (-(l.a * 0.5 + l.c) / l.b).clamp(0.74, 0.96))
        .unwrap_or(0.92);

    let left_cands = cap_points(
        ridge_pts
            .iter()
            .copied()
            .filter(|&(x, y)| x >= 0.01 && x <= 0.45 && y >= top_y_ref - 0.03 && y <= bot_y_ref + 0.04)
            .collect(),
        1200,
    );
    // On sideline view, x decreases as y increases -> dx/dy = -b/a < 0
    let left_line = ransac_line(&left_cands, 320, 0.016, 12, 0x1EF70003, |a, b, _| {
        if a.abs() < 0.20 {
            return false;
        }
        let dx_dy = -b / a;
        dx_dy <= -0.15 && dx_dy >= -2.6
    });

    let right_cands = cap_points(
        ridge_pts
            .iter()
            .copied()
            .filter(|&(x, y)| x >= 0.55 && x <= 0.99 && y >= top_y_ref - 0.03 && y <= bot_y_ref + 0.04)
            .collect(),
        1200,
    );
    // On sideline view, x increases as y increases -> dx/dy = -b/a > 0
    let right_line = ransac_line(&right_cands, 320, 0.016, 12, 0x91647004, |a, b, _| {
        if a.abs() < 0.20 {
            return false;
        }
        let dx_dy = -b / a;
        dx_dy >= 0.15 && dx_dy <= 2.6
    });

    let fallback_top = Line2D {
        a: 0.0,
        b: 1.0,
        c: -top_y_ref,
        inliers: 0,
    };
    let fallback_bot = Line2D {
        a: 0.0,
        b: 1.0,
        c: -bot_y_ref,
        inliers: 0,
    };
    let fallback_left = Line2D {
        a: 0.85,
        b: 0.32,
        c: -(0.85 * 0.16 + 0.32 * top_y_ref),
        inliers: 0,
    };
    let fallback_right = Line2D {
        a: 0.85,
        b: -0.32,
        c: -(0.85 * 0.84 - 0.32 * top_y_ref),
        inliers: 0,
    };

    let l_top = top_line.unwrap_or(fallback_top);
    let l_bot = bot_line.unwrap_or(fallback_bot);
    let l_left = left_line.unwrap_or(fallback_left);
    let l_right = right_line.unwrap_or(fallback_right);

    let lines_detected = [top_line, bot_line, left_line, right_line]
        .iter()
        .filter(|l| l.is_some())
        .count();

    let clamp_pt = |(x, y): (f64, f64)| NormPointDto {
        x: x.clamp(-0.12, 1.12),
        y: y.clamp(0.10, 1.10),
    };

    let mut tl = intersect_lines(l_top, l_left).map(clamp_pt).unwrap_or(default_tl);
    let mut tr = intersect_lines(l_top, l_right).map(clamp_pt).unwrap_or(default_tr);
    let mut br = intersect_lines(l_bot, l_right).map(clamp_pt).unwrap_or(default_br);
    let mut bl = intersect_lines(l_bot, l_left).map(clamp_pt).unwrap_or(default_bl);

    if !is_valid_convex_quad(tl, tr, br, bl) {
        // Retry using detected top/bottom Y bounds paired with clean perspective endlines
        tl = NormPointDto { x: 0.16, y: top_y_ref };
        tr = NormPointDto { x: 0.84, y: top_y_ref };
        br = NormPointDto { x: 0.96, y: bot_y_ref };
        bl = NormPointDto { x: 0.04, y: bot_y_ref };
    }

    if is_valid_convex_quad(tl, tr, br, bl) && lines_detected > 0 {
        let total_inliers = l_top.inliers + l_bot.inliers + l_left.inliers + l_right.inliers;
        let conf = (0.35 + (lines_detected as f64) * 0.13 + (total_inliers as f64 / 500.0) * 0.13)
            .clamp(0.35, 0.96);
        AutoCourtCalibrationResult {
            tl,
            tr,
            br,
            bl,
            confidence: conf,
            lines_detected,
            method: format!("RANSAC Garis Lapangan ({}/4 garis)", lines_detected),
        }
    } else {
        AutoCourtCalibrationResult {
            tl: default_tl,
            tr: default_tr,
            br: default_br,
            bl: default_bl,
            confidence: 0.30,
            lines_detected,
            method: "Fallback Perspektif Sideline Standar".to_string(),
        }
    }
}

fn downsample_rgb_to_luma_320(rgb: &[u8], w: u32, h: u32, lw: usize, lh: usize) -> Vec<f32> {
    let mut out = vec![0.0f32; lw * lh];
    if w == 0 || h == 0 || rgb.len() < (w * h * 3) as usize {
        return out;
    }
    for dy in 0..lh {
        let sy = ((dy as f32 + 0.5) / lh as f32 * h as f32) as u32;
        let sy = sy.min(h - 1);
        for dx in 0..lw {
            let sx = ((dx as f32 + 0.5) / lw as f32 * w as f32) as u32;
            let sx = sx.min(w - 1);
            let idx = ((sy * w + sx) * 3) as usize;
            out[dy * lw + dx] =
                0.299 * rgb[idx] as f32 + 0.587 * rgb[idx + 1] as f32 + 0.114 * rgb[idx + 2] as f32;
        }
    }
    out
}

fn ncc_patch(
    luma_a: &[f32],
    luma_b: &[f32],
    lw: usize,
    ax: i32,
    ay: i32,
    bx: i32,
    by: i32,
    half: i32,
) -> f32 {
    let mut sum_a = 0.0f32;
    let mut sum_b = 0.0f32;
    let n = ((half * 2 + 1) * (half * 2 + 1)) as f32;
    for dy in -half..=half {
        let row_a = (ay + dy) as usize * lw;
        let row_b = (by + dy) as usize * lw;
        for dx in -half..=half {
            sum_a += luma_a[row_a + (ax + dx) as usize];
            sum_b += luma_b[row_b + (bx + dx) as usize];
        }
    }
    let ma = sum_a / n;
    let mb = sum_b / n;
    let mut num = 0.0f32;
    let mut da2 = 0.0f32;
    let mut db2 = 0.0f32;
    for dy in -half..=half {
        let row_a = (ay + dy) as usize * lw;
        let row_b = (by + dy) as usize * lw;
        for dx in -half..=half {
            let da = luma_a[row_a + (ax + dx) as usize] - ma;
            let db = luma_b[row_b + (bx + dx) as usize] - mb;
            num += da * db;
            da2 += da * da;
            db2 += db * db;
        }
    }
    let denom = (da2 * db2).sqrt();
    if denom < 1e-3 { 0.0 } else { num / denom }
}

fn estimate_frame_delta_homography(
    prev_luma: &[f32],
    curr_luma: &[f32],
    lw: usize,
    lh: usize,
    seed: u64,
) -> ([f64; 9], f64) {
    let identity = [1.0, 0.0, 0.0, 0.0, 1.0, 0.0, 0.0, 0.0, 1.0];
    let margin = 18i32;
    let half = 4i32;
    let search_r = 14i32;

    // Collect high-gradient patch anchors across a 12x7 grid
    let mut anchors: Vec<(i32, i32, f32)> = Vec::new();
    let cols = 12i32;
    let rows = 7i32;
    let usable_w = lw as i32 - margin * 2;
    let usable_h = lh as i32 - margin * 2;

    for gy in 0..rows {
        for gx in 0..cols {
            let cx = margin + ((gx * usable_w) / (cols - 1).max(1));
            let cy = margin + ((gy * usable_h) / (rows - 1).max(1));
            let mut dx_energy = 0.0f32;
            let mut dy_energy = 0.0f32;
            for dy in -half..=half {
                let r = (cy + dy) as usize * lw;
                let r_up = (cy + dy - 1) as usize * lw;
                let r_dn = (cy + dy + 1) as usize * lw;
                for dx in -half..=half {
                    let c = (cx + dx) as usize;
                    let gx_v = prev_luma[r + c + 1] - prev_luma[r + c - 1];
                    let gy_v = prev_luma[r_dn + c] - prev_luma[r_up + c];
                    dx_energy += gx_v * gx_v;
                    dy_energy += gy_v * gy_v;
                }
            }
            let corner_score = dx_energy.min(dy_energy);
            if corner_score >= 350.0 {
                anchors.push((cx, cy, corner_score));
            }
        }
    }

    anchors.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));
    anchors.truncate(48);

    if anchors.len() < 4 {
        return (identity, 0.25);
    }

    let mut matches: Vec<((f64, f64), (f64, f64))> = Vec::with_capacity(anchors.len());
    let mut disps: Vec<(f64, f64)> = Vec::with_capacity(anchors.len());

    for &(ax, ay, _) in &anchors {
        let mut best_score = -1.0f32;
        let mut best_bx = ax;
        let mut best_by = ay;
        for sy in (-search_r..=search_r).step_by(2) {
            let cy = ay + sy;
            if cy - half < 1 || cy + half >= lh as i32 - 1 {
                continue;
            }
            for sx in (-search_r..=search_r).step_by(2) {
                let cx = ax + sx;
                if cx - half < 1 || cx + half >= lw as i32 - 1 {
                    continue;
                }
                let s = ncc_patch(prev_luma, curr_luma, lw, ax, ay, cx, cy, half);
                if s > best_score {
                    best_score = s;
                    best_bx = cx;
                    best_by = cy;
                }
            }
        }
        // Fine ±2px refinement
        let rx0 = best_bx;
        let ry0 = best_by;
        for dy in -2..=2 {
            let cy = ry0 + dy;
            if cy - half < 1 || cy + half >= lh as i32 - 1 {
                continue;
            }
            for dx in -2..=2 {
                let cx = rx0 + dx;
                if cx - half < 1 || cx + half >= lw as i32 - 1 {
                    continue;
                }
                let s = ncc_patch(prev_luma, curr_luma, lw, ax, ay, cx, cy, half);
                if s > best_score {
                    best_score = s;
                    best_bx = cx;
                    best_by = cy;
                }
            }
        }

        if best_score >= 0.72 {
            let p_src = (ax as f64 / lw as f64, ay as f64 / lh as f64);
            let p_dst = (best_bx as f64 / lw as f64, best_by as f64 / lh as f64);
            matches.push((p_src, p_dst));
            disps.push(((best_bx - ax) as f64, (best_by - ay) as f64));
        }
    }

    if matches.len() < 4 {
        return (identity, 0.25);
    }

    let mut dxs: Vec<f64> = disps.iter().map(|d| d.0).collect();
    let mut dys: Vec<f64> = disps.iter().map(|d| d.1).collect();
    dxs.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    dys.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let med_dx = dxs[dxs.len() / 2];
    let med_dy = dys[dys.len() / 2];

    // Zero-jitter lock for static shots
    if (med_dx * med_dx + med_dy * med_dy).sqrt() < 0.35 {
        return (identity, 0.98);
    }

    let reproj_thresh = 1.8 / lw as f64;
    let reproj_thresh_sq = reproj_thresh * reproj_thresh;
    let mut best_h: Option<[f64; 9]> = None;
    let mut best_inliers = 0usize;
    let mut rng = XorShift64(seed.max(1));

    if matches.len() >= 8 {
        for _ in 0..140 {
            let i0 = rng.next_usize(matches.len());
            let i1 = rng.next_usize(matches.len());
            let i2 = rng.next_usize(matches.len());
            let i3 = rng.next_usize(matches.len());
            if i0 == i1 || i0 == i2 || i0 == i3 || i1 == i2 || i1 == i3 || i2 == i3 {
                continue;
            }
            let src4 = [
                matches[i0].0,
                matches[i1].0,
                matches[i2].0,
                matches[i3].0,
            ];
            let dst4 = [
                matches[i0].1,
                matches[i1].1,
                matches[i2].1,
                matches[i3].1,
            ];
            let Some(h) = compute_homography_4pt(&src4, &dst4) else {
                continue;
            };
            if h[6].abs() > 0.25
                || h[7].abs() > 0.25
                || h[0] < 0.78
                || h[0] > 1.28
                || h[4] < 0.78
                || h[4] > 1.28
            {
                continue;
            }
            let mut count = 0usize;
            for &(s, d) in &matches {
                let p = apply_homography_pt(&h, s.0, s.1);
                let ex = p.0 - d.0;
                let ey = p.1 - d.1;
                if ex * ex + ey * ey <= reproj_thresh_sq {
                    count += 1;
                }
            }
            if count > best_inliers {
                best_inliers = count;
                best_h = Some(h);
            }
        }
    }

    if let Some(h) = best_h {
        if best_inliers >= 8 {
            let conf = (best_inliers as f64 / matches.len() as f64).clamp(0.2, 1.0);
            return (h, conf);
        }
    }

    // Fallback: robust median translation in normalized coordinates
    let tx = med_dx / lw as f64;
    let ty = med_dy / lh as f64;
    (
        [1.0, 0.0, tx, 0.0, 1.0, ty, 0.0, 0.0, 1.0],
        (matches.len() as f64 / 20.0).clamp(0.25, 0.75),
    )
}

fn warp_quad(h: &[f64; 9], corners: &[NormPointDto; 4]) -> Option<[NormPointDto; 4]> {
    let mut next = *corners;
    for (idx, c) in corners.iter().enumerate() {
        let (nx, ny) = apply_homography_pt(h, c.x, c.y);
        if !nx.is_finite() || !ny.is_finite() || nx.abs() > 2.0 || ny.abs() > 2.0 {
            return None;
        }
        next[idx] = NormPointDto { x: nx, y: ny };
    }
    if next[1].x - next[0].x < 0.12 || next[2].x - next[3].x < 0.12 {
        return None;
    }
    if next[3].y - next[0].y < 0.08 || next[2].y - next[1].y < 0.08 {
        return None;
    }
    Some(next)
}

pub fn track_court_homography_sequence(
    frames: &[(f64, Vec<u8>)],
    w: u32,
    h: u32,
    anchor_time: f64,
    anchor_corners: [NormPointDto; 4],
) -> Vec<TemporalCalibrationFrameDto> {
    if frames.is_empty() {
        return Vec::new();
    }

    let lw = 320usize;
    let lh = 180usize;
    let lumas: Vec<Vec<f32>> = frames
        .iter()
        .map(|(_, rgb)| downsample_rgb_to_luma_320(rgb, w, h, lw, lh))
        .collect();

    let mut anchor_idx = 0usize;
    let mut best_dt = (frames[0].0 - anchor_time).abs();
    for (idx, (t, _)) in frames.iter().enumerate() {
        let dt = (t - anchor_time).abs();
        if dt < best_dt {
            best_dt = dt;
            anchor_idx = idx;
        }
    }

    let mut tracked_corners = vec![anchor_corners; frames.len()];
    let mut confidences = vec![1.0f64; frames.len()];

    // Backward propagation from anchor_idx -> 0
    for idx in (0..anchor_idx).rev() {
        let (delta_h, conf) =
            estimate_frame_delta_homography(&lumas[idx + 1], &lumas[idx], lw, lh, 0xF00D_0001 + idx as u64);
        tracked_corners[idx] =
            warp_quad(&delta_h, &tracked_corners[idx + 1]).unwrap_or(tracked_corners[idx + 1]);
        confidences[idx] = conf;
    }

    // Forward propagation from anchor_idx -> len - 1
    for idx in (anchor_idx + 1)..frames.len() {
        let (delta_h, conf) =
            estimate_frame_delta_homography(&lumas[idx - 1], &lumas[idx], lw, lh, 0xBEEF_0001 + idx as u64);
        tracked_corners[idx] =
            warp_quad(&delta_h, &tracked_corners[idx - 1]).unwrap_or(tracked_corners[idx - 1]);
        confidences[idx] = conf;
    }

    // Light 3-tap temporal smoothing while preserving exact anchor frame
    let raw = tracked_corners.clone();
    for idx in 1..frames.len().saturating_sub(1) {
        if idx == anchor_idx {
            continue;
        }
        for c in 0..4 {
            tracked_corners[idx][c].x =
                0.25 * raw[idx - 1][c].x + 0.50 * raw[idx][c].x + 0.25 * raw[idx + 1][c].x;
            tracked_corners[idx][c].y =
                0.25 * raw[idx - 1][c].y + 0.50 * raw[idx][c].y + 0.25 * raw[idx + 1][c].y;
        }
    }

    frames
        .iter()
        .enumerate()
        .map(|(i, (t, _))| TemporalCalibrationFrameDto {
            time: *t,
            tl: tracked_corners[i][0],
            tr: tracked_corners[i][1],
            br: tracked_corners[i][2],
            bl: tracked_corners[i][3],
            confidence: confidences[i],
        })
        .collect()
}

#[tauri::command]
pub async fn auto_calibrate_court_frame(
    input_path: String,
    time_sec: f64,
) -> Result<AutoCourtCalibrationResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        auto_calibrate_court_frame_blocking(input_path, time_sec)
    })
    .await
    .map_err(|e| format!("AI worker terhenti: {}", e))?
}

fn auto_calibrate_court_frame_blocking(
    input_path: String,
    time_sec: f64,
) -> Result<AutoCourtCalibrationResult, String> {
    let frame_w = 960u32;
    let frame_h = 540u32;
    let frames = ffmpeg::extract_rgb_frames(
        &input_path,
        time_sec,
        time_sec + 0.25,
        4.0,
        frame_w,
        frame_h,
    )?;
    let (_, rgb) = frames
        .first()
        .ok_or_else(|| "Gagal mengekstrak frame untuk auto-kalibrasi lapangan.".to_string())?;
    Ok(auto_detect_court_corners_rgb(rgb, frame_w, frame_h))
}

#[tauri::command]
pub async fn track_court_calibration_range(
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    anchor_sec: f64,
    tl: NormPointDto,
    tr: NormPointDto,
    br: NormPointDto,
    bl: NormPointDto,
    fps: Option<f64>,
) -> Result<Vec<TemporalCalibrationFrameDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        track_court_calibration_range_blocking(
            input_path, start_sec, end_sec, anchor_sec, tl, tr, br, bl, fps,
        )
    })
    .await
    .map_err(|e| format!("AI worker terhenti: {}", e))?
}

fn track_court_calibration_range_blocking(
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    anchor_sec: f64,
    tl: NormPointDto,
    tr: NormPointDto,
    br: NormPointDto,
    bl: NormPointDto,
    fps: Option<f64>,
) -> Result<Vec<TemporalCalibrationFrameDto>, String> {
    let frame_w = 640u32;
    let frame_h = 360u32;
    let sample_fps = fps.unwrap_or(10.0).clamp(2.0, 15.0);
    let frames = ffmpeg::extract_rgb_frames(
        &input_path,
        start_sec,
        end_sec,
        sample_fps,
        frame_w,
        frame_h,
    )?;
    if frames.is_empty() {
        return Err("Tidak ada frame yang dapat diekstrak untuk pelacakan kamera panning.".to_string());
    }
    Ok(track_court_homography_sequence(
        &frames,
        frame_w,
        frame_h,
        anchor_sec,
        [tl, tr, br, bl],
    ))
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn render_synthetic_court_frame(w: u32, h: u32, pan_x: f32, pan_y: f32) -> Vec<u8> {
        let mut rgb = vec![0u8; (w * h * 3) as usize];
        for y in 0..h {
            for x in 0..w {
                let wx = x as f32 - pan_x;
                let wy = y as f32 - pan_y;
                // Deterministic pseudo-wood parquet planks + painted futsal lines + fiducial blocks
                let plank = (((wx / 16.0).floor() as i32 * 13 + (wy / 6.0).floor() as i32 * 7) & 7) as f32;
                let fine_tex = ((wx * 0.45).sin() * (wy * 0.35).cos() + 1.0) * 14.0;
                let mut r = 135.0 + plank * 4.5 + fine_tex;
                let mut g = 92.0 + plank * 3.0 + fine_tex * 0.7;
                let mut b = 52.0 + plank * 2.0 + fine_tex * 0.4;

                // Painted white court markings
                let on_top = (wy - 76.0).abs() < 1.8 && wx >= 40.0 && wx <= 280.0;
                let on_bot = (wy - 162.0).abs() < 1.8 && wx >= 20.0 && wx <= 300.0;
                let on_mid = (wx - 160.0).abs() < 1.8 && wy >= 76.0 && wy <= 162.0;
                let dist_center = ((wx - 160.0).powi(2) + (wy - 119.0).powi(2)).sqrt();
                let on_circle = (dist_center - 24.0).abs() < 1.8;
                // Upper wall / bleacher columns with strong horizontal/vertical features
                let on_bleacher = wy < 62.0 && (((wx as i32) % 28).abs() < 4 || ((wy as i32) % 14).abs() < 2);

                if on_top || on_bot || on_mid || on_circle || on_bleacher {
                    r = 242.0;
                    g = 242.0;
                    b = 242.0;
                }

                let idx = ((y * w + x) * 3) as usize;
                rgb[idx] = r.clamp(0.0, 255.0) as u8;
                rgb[idx + 1] = g.clamp(0.0, 255.0) as u8;
                rgb[idx + 2] = b.clamp(0.0, 255.0) as u8;
            }
        }
        rgb
    }

    #[test]
    fn test_dlt_homography_and_panning_tracker_on_synthetic_pan() {
        let w = 320u32;
        let h = 180u32;
        let anchor_corners = [
            NormPointDto { x: 0.18, y: 0.42 },
            NormPointDto { x: 0.82, y: 0.42 },
            NormPointDto { x: 0.92, y: 0.90 },
            NormPointDto { x: 0.08, y: 0.90 },
        ];

        // 1. Static camera shot must have near-zero drift
        let static_frame = render_synthetic_court_frame(w, h, 0.0, 0.0);
        let static_seq: Vec<(f64, Vec<u8>)> = (0..4)
            .map(|i| (i as f64 * 0.1, static_frame.clone()))
            .collect();
        let static_res =
            track_court_homography_sequence(&static_seq, w, h, 0.0, anchor_corners);
        assert_eq!(static_res.len(), 4);
        for f in &static_res {
            let err = (f.tl.x - anchor_corners[0].x).abs().max((f.tl.y - anchor_corners[0].y).abs());
            assert!(err < 0.001, "Static camera drift terlalu besar: {}", err);
        }

        // 2. Smooth camera pan (+8 px, +3 px) per frame across 6 frames
        let pan_seq: Vec<(f64, Vec<u8>)> = (0..6)
            .map(|i| {
                (
                    i as f64 * 0.1,
                    render_synthetic_court_frame(w, h, i as f32 * 8.0, i as f32 * 3.0),
                )
            })
            .collect();
        let tracked = track_court_homography_sequence(&pan_seq, w, h, 0.0, anchor_corners);
        assert_eq!(tracked.len(), 6);
        for (i, f) in tracked.iter().enumerate() {
            let exp_dx = (i as f64 * 8.0) / w as f64;
            let exp_dy = (i as f64 * 3.0) / h as f64;
            let err_tl = ((f.tl.x - (anchor_corners[0].x + exp_dx)).abs())
                .max((f.tl.y - (anchor_corners[0].y + exp_dy)).abs());
            let err_br = ((f.br.x - (anchor_corners[2].x + exp_dx)).abs())
                .max((f.br.y - (anchor_corners[2].y + exp_dy)).abs());
            assert!(
                err_tl < 0.02 && err_br < 0.02,
                "Panning frame {} error terlalu besar: err_tl={:.4}, err_br={:.4}",
                i,
                err_tl,
                err_br
            );
        }
    }

    #[test]
    fn test_auto_detect_court_corners_on_real_futsal_screenshot() {
        let img_path = Path::new(
            r"C:\Users\Fahlefi Achmad Reza\.gemini\antigravity\brain\9b98d91f-4bae-4d5d-aa3b-0b8f2369424a\.user_uploaded\media_1795586744524_3c69cff1.jpg",
        );
        if !img_path.exists() {
            println!("Skipping court calibration test: fixture not found");
            return;
        }
        let ffmpeg_bin = ffmpeg::resolve_bin("ffmpeg");
        let out = std::process::Command::new(&ffmpeg_bin)
            .args([
                "-v",
                "error",
                "-i",
                &img_path.to_string_lossy(),
                "-vf",
                "scale=960:540",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "-",
            ])
            .output()
            .expect("ffmpeg decode gagal");
        assert!(out.status.success());
        let expected = (960 * 540 * 3) as usize;
        assert!(out.stdout.len() >= expected);

        let res = auto_detect_court_corners_rgb(&out.stdout[..expected], 960, 540);
        println!(
            "AutoCourtCalibration: {} | conf={:.2} | tl=({:.3},{:.3}) tr=({:.3},{:.3}) br=({:.3},{:.3}) bl=({:.3},{:.3})",
            res.method, res.confidence, res.tl.x, res.tl.y, res.tr.x, res.tr.y, res.br.x, res.br.y, res.bl.x, res.bl.y
        );
        assert!(is_valid_convex_quad(res.tl, res.tr, res.br, res.bl));
        assert!(res.lines_detected >= 2, "Minimal 2 garis lapangan terdeteksi, dapat {}", res.lines_detected);
        assert!(res.confidence >= 0.35, "Confidence terlalu rendah: {}", res.confidence);
    }
}

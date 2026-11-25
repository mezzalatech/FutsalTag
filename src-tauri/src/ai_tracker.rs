use crate::ffmpeg;
use ort::environment::Environment;
use ort::session::Session;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

static ORT_ENV: OnceLock<Environment> = OnceLock::new();
static YOLOX_SESSION_CACHE: OnceLock<Mutex<Option<(PathBuf, Session, u32, u32)>>> = OnceLock::new();

pub(crate) fn get_ort_env() -> Result<&'static Environment, String> {
    if let Some(env) = ORT_ENV.get() {
        return Ok(env);
    }
    let env = ort::init()
        .with_name("futsaltag-pro")
        .build()
        .map_err(|e| format!("Gagal menginisialisasi ONNX Runtime Environment: {}", e))?;
    let _ = ORT_ENV.set(env);
    ORT_ENV
        .get()
        .ok_or_else(|| "Gagal menyimpan ONNX Environment".to_string())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AiModelStatus {
    pub available: bool,
    pub model_path: Option<String>,
    pub engine: String,
    pub input_size: [u32; 2],
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DetectedObject {
    pub x: f32,
    pub y: f32,
    pub w: f32,
    pub h: f32,
    pub foot_x: f32,
    pub foot_y: f32,
    pub confidence: f32,
    pub class_id: i32,
    pub label: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TrackingKeyframeDto {
    pub time: f64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MultiPlayerTrackDto {
    pub id: String,
    pub label: String,
    pub team: String,
    pub color: String,
    pub keyframes: Vec<TrackingKeyframeDto>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OnnxTrackingResult {
    pub tracks: Vec<MultiPlayerTrackDto>,
    pub frames_processed: usize,
    pub model_used: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FrameDetectionsDto {
    pub time: f64,
    pub boxes: Vec<DetectedObject>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AnchorPinDto {
    pub time: f64,
    pub x: f64,
    pub y: f64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SinglePlayerTrackResult {
    pub keyframes: Vec<TrackingKeyframeDto>,
    pub frames_processed: usize,
    pub matched_ai_frames: usize,
    pub fallback_frames: usize,
    pub camera_pan_frames: usize,
    pub engine_info: String,
    pub anchor_box: Option<DetectedObject>,
}

pub fn resolve_yolox_model_path(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    let model_names = ["yolox_s.onnx", "yolox_nano.onnx"];

    if let Some(handle) = app {
        if let Ok(res_dir) = handle.path().resource_dir() {
            for name in model_names {
                for rel in [
                    format!("resources/models/{}", name),
                    format!("models/{}", name),
                    name.to_string(),
                ] {
                    let p = res_dir.join(rel);
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for name in model_names {
        for p in [
            manifest_dir.join(format!("resources/models/{}", name)),
            PathBuf::from(format!("src-tauri/resources/models/{}", name)),
            PathBuf::from(format!("resources/models/{}", name)),
        ] {
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

fn model_variant_label(path: &Path) -> &'static str {
    let name = path
        .file_name()
        .and_then(|n| n.to_str())
        .unwrap_or_default()
        .to_ascii_lowercase();
    if name.contains("yolox_s") {
        "YOLOX-S"
    } else {
        "YOLOX-Nano"
    }
}

fn load_yolox_session(model_path: &Path) -> Result<(Session, u32, u32), String> {
    let env = get_ort_env()?;
    let session = Session::builder(env)
        .map_err(|e| format!("Gagal membuat ONNX session builder: {}", e))?
        .commit_from_file(model_path)
        .map_err(|e| format!("Gagal memuat model YOLOX '{}': {}", model_path.display(), e))?;

    let (mut in_h, mut in_w) = (416u32, 416u32);
    if let Some(first_input) = session.inputs().first() {
        if let ort::value::ValueType::Tensor { shape, .. } = first_input.dtype() {
            if shape.len() == 4 {
                if shape[2] > 0 {
                    in_h = shape[2] as u32;
                }
                if shape[3] > 0 {
                    in_w = shape[3] as u32;
                }
            }
        }
    }

    Ok((session, in_w, in_h))
}

pub(crate) fn with_yolox_session<T, F>(model_path: &Path, f: F) -> Result<T, String>
where
    F: FnOnce(&mut Session, u32, u32) -> Result<T, String>,
{
    let cache_lock = YOLOX_SESSION_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache_lock
        .lock()
        .map_err(|_| "Mutex cache ONNX Runtime terkunci".to_string())?;
    let needs_reload = match guard.as_ref() {
        Some((cached_path, _, _, _)) => cached_path != model_path,
        None => true,
    };
    if needs_reload {
        let (sess, in_w, in_h) = load_yolox_session(model_path)?;
        *guard = Some((model_path.to_path_buf(), sess, in_w, in_h));
    }
    let (_, session, in_w, in_h) = guard
        .as_mut()
        .ok_or_else(|| "Gagal mengambil session cache ONNX".to_string())?;
    f(session, *in_w, *in_h)
}

#[derive(Clone)]
struct RawDet {
    x1: f32,
    y1: f32,
    x2: f32,
    y2: f32,
    score: f32,
    class_id: i32,
}

fn iou(a: &RawDet, b: &RawDet) -> f32 {
    let ix1 = a.x1.max(b.x1);
    let iy1 = a.y1.max(b.y1);
    let ix2 = a.x2.min(b.x2);
    let iy2 = a.y2.min(b.y2);
    let iw = (ix2 - ix1).max(0.0);
    let ih = (iy2 - iy1).max(0.0);
    let inter = iw * ih;
    let area_a = (a.x2 - a.x1).max(0.0) * (a.y2 - a.y1).max(0.0);
    let area_b = (b.x2 - b.x1).max(0.0) * (b.y2 - b.y1).max(0.0);
    let union = area_a + area_b - inter;
    if union <= 1e-6 { 0.0 } else { inter / union }
}

fn nms(mut dets: Vec<RawDet>, iou_thresh: f32) -> Vec<RawDet> {
    dets.sort_by(|a, b| {
        b.score
            .partial_cmp(&a.score)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut keep = Vec::new();
    let mut suppressed = vec![false; dets.len()];
    for i in 0..dets.len() {
        if suppressed[i] {
            continue;
        }
        keep.push(dets[i].clone());
        for j in (i + 1)..dets.len() {
            if !suppressed[j]
                && dets[i].class_id == dets[j].class_id
                && iou(&dets[i], &dets[j]) > iou_thresh
            {
                suppressed[j] = true;
            }
        }
    }
    keep
}

#[cfg(test)]
pub fn detect_rgb_frame(
    session: &mut Session,
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    in_w: u32,
    in_h: u32,
) -> Result<Vec<DetectedObject>, String> {
    detect_rgb_frame_with_thresh(session, rgb, frame_w, frame_h, in_w, in_h, 0.35, 0.25)
}

pub fn detect_rgb_frame_with_thresh(
    session: &mut Session,
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    in_w: u32,
    in_h: u32,
    person_thresh: f32,
    ball_thresh: f32,
) -> Result<Vec<DetectedObject>, String> {
    let fw = frame_w as f32;
    let fh = frame_h as f32;
    let iw = in_w as f32;
    let ih = in_h as f32;

    let ratio = (iw / fw).min(ih / fh);
    let resized_w = ((fw * ratio).round() as u32).min(in_w).max(1);
    let resized_h = ((fh * ratio).round() as u32).min(in_h).max(1);

    let plane_size = (in_w * in_h) as usize;
    let mut bgr_nchw = vec![114.0f32; plane_size * 3];

    // True bilinear letterbox resize RGB -> BGR NCHW [0..255]
    let fw_max = (frame_w.saturating_sub(1)) as f32;
    let fh_max = (frame_h.saturating_sub(1)) as f32;
    for y in 0..resized_h {
        let src_yf = (((y as f32 + 0.5) / ratio) - 0.5).clamp(0.0, fh_max);
        let y0 = src_yf.floor() as u32;
        let y1 = (y0 + 1).min(frame_h - 1);
        let wy = src_yf - y0 as f32;
        let wy0 = 1.0 - wy;
        for x in 0..resized_w {
            let src_xf = (((x as f32 + 0.5) / ratio) - 0.5).clamp(0.0, fw_max);
            let x0 = src_xf.floor() as u32;
            let x1 = (x0 + 1).min(frame_w - 1);
            let wx = src_xf - x0 as f32;
            let wx0 = 1.0 - wx;

            let i00 = ((y0 * frame_w + x0) * 3) as usize;
            let i01 = ((y0 * frame_w + x1) * 3) as usize;
            let i10 = ((y1 * frame_w + x0) * 3) as usize;
            let i11 = ((y1 * frame_w + x1) * 3) as usize;

            let w00 = wy0 * wx0;
            let w01 = wy0 * wx;
            let w10 = wy * wx0;
            let w11 = wy * wx;

            let r = rgb[i00] as f32 * w00
                + rgb[i01] as f32 * w01
                + rgb[i10] as f32 * w10
                + rgb[i11] as f32 * w11;
            let g = rgb[i00 + 1] as f32 * w00
                + rgb[i01 + 1] as f32 * w01
                + rgb[i10 + 1] as f32 * w10
                + rgb[i11 + 1] as f32 * w11;
            let b = rgb[i00 + 2] as f32 * w00
                + rgb[i01 + 2] as f32 * w01
                + rgb[i10 + 2] as f32 * w10
                + rgb[i11 + 2] as f32 * w11;

            let dst_idx = (y * in_w + x) as usize;
            bgr_nchw[dst_idx] = b;
            bgr_nchw[plane_size + dst_idx] = g;
            bgr_nchw[plane_size * 2 + dst_idx] = r;
        }
    }

    let input_tensor = Tensor::from_array((
        [1usize, 3usize, in_h as usize, in_w as usize],
        bgr_nchw.into_boxed_slice(),
    ))
    .map_err(|e| format!("Gagal membuat tensor input YOLOX: {}", e))?;

    let input_name = session
        .inputs()
        .first()
        .map(|i| i.name().to_string())
        .unwrap_or_else(|| "images".to_string());

    let outputs = session
        .run(ort::inputs![input_name.as_str() => input_tensor])
        .map_err(|e| format!("Inferensi YOLOX gagal: {}", e))?;

    let (shape, data) = outputs[0]
        .try_extract_tensor::<f32>()
        .map_err(|e| format!("Gagal ekstrak output tensor YOLOX: {}", e))?;

    let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
    let (num_anchors, feat_dim) = if dims.len() == 3 {
        (dims[1], dims[2])
    } else if dims.len() == 2 {
        (dims[0], dims[1])
    } else {
        return Err(format!("Bentuk output YOLOX tidak dikenali: {:?}", dims));
    };

    if feat_dim < 6 {
        return Err(format!("Dimensi fitur YOLOX terlalu kecil: {}", feat_dim));
    }

    // Build YOLOX grid (x_offset, y_offset, stride) for strides [8, 16, 32]
    let strides = [8usize, 16, 32];
    let mut grid_meta: Vec<(f32, f32, f32)> = Vec::new();
    for s in strides {
        let gh = (in_h as usize) / s;
        let gw = (in_w as usize) / s;
        for gy in 0..gh {
            for gx in 0..gw {
                grid_meta.push((gx as f32, gy as f32, s as f32));
            }
        }
    }
    let needs_grid_decode = grid_meta.len() == num_anchors;

    let mut raw_dets = Vec::new();
    for i in 0..num_anchors {
        let base = i * feat_dim;
        let obj_conf = data[base + 4];
        if obj_conf < 0.10 {
            continue;
        }

        // Check person (class 0) and sports ball (class 32)
        let person_cls_idx = 5;
        let ball_cls_idx = 5 + 32;

        let person_score = obj_conf * data[base + person_cls_idx];
        let ball_score = if feat_dim > ball_cls_idx {
            obj_conf * data[base + ball_cls_idx]
        } else {
            0.0
        };

        let (chosen_cls, chosen_score) =
            if person_score >= person_thresh && person_score >= ball_score {
                (0i32, person_score)
            } else if ball_score >= ball_thresh {
                (32i32, ball_score)
            } else {
                continue;
            };

        let (cx, cy, bw, bh) = if needs_grid_decode {
            let (gx, gy, stride) = grid_meta[i];
            let cx = (data[base] + gx) * stride;
            let cy = (data[base + 1] + gy) * stride;
            let bw = data[base + 2].exp() * stride;
            let bh = data[base + 3].exp() * stride;
            (cx, cy, bw, bh)
        } else {
            (data[base], data[base + 1], data[base + 2], data[base + 3])
        };

        let x1 = ((cx - bw * 0.5) / ratio).clamp(0.0, fw);
        let y1 = ((cy - bh * 0.5) / ratio).clamp(0.0, fh);
        let x2 = ((cx + bw * 0.5) / ratio).clamp(0.0, fw);
        let y2 = ((cy + bh * 0.5) / ratio).clamp(0.0, fh);

        if x2 - x1 < 4.0 || y2 - y1 < 4.0 {
            continue;
        }

        raw_dets.push(RawDet {
            x1,
            y1,
            x2,
            y2,
            score: chosen_score,
            class_id: chosen_cls,
        });
    }

    let kept = nms(raw_dets, 0.45);
    let objects = kept
        .into_iter()
        .map(|d| {
            let x = (d.x1 / fw).clamp(0.0, 1.0);
            let y = (d.y1 / fh).clamp(0.0, 1.0);
            let w = ((d.x2 - d.x1) / fw).clamp(0.0, 1.0 - x);
            let h = ((d.y2 - d.y1) / fh).clamp(0.0, 1.0 - y);
            DetectedObject {
                x,
                y,
                w,
                h,
                foot_x: (x + w * 0.5).clamp(0.0, 1.0),
                foot_y: (y + h).clamp(0.0, 1.0),
                confidence: d.score,
                class_id: d.class_id,
                label: if d.class_id == 32 {
                    "Bola".to_string()
                } else {
                    "Pemain".to_string()
                },
            }
        })
        .collect();

    Ok(objects)
}

fn sample_torso_rgb(rgb: &[u8], frame_w: u32, frame_h: u32, obj: &DetectedObject) -> [f32; 3] {
    let x_start = (((obj.x + obj.w * 0.25) * frame_w as f32) as u32).min(frame_w - 1);
    let x_end = (((obj.x + obj.w * 0.75) * frame_w as f32) as u32)
        .max(x_start + 1)
        .min(frame_w);
    let y_start = (((obj.y + obj.h * 0.18) * frame_h as f32) as u32).min(frame_h - 1);
    let y_end = (((obj.y + obj.h * 0.50) * frame_h as f32) as u32)
        .max(y_start + 1)
        .min(frame_h);

    let mut sum = [0.0f32; 3];
    let mut cnt = 0.0f32;
    for py in y_start..y_end {
        for px in x_start..x_end {
            let idx = ((py * frame_w + px) * 3) as usize;
            sum[0] += rgb[idx] as f32;
            sum[1] += rgb[idx + 1] as f32;
            sum[2] += rgb[idx + 2] as f32;
            cnt += 1.0;
        }
    }
    if cnt > 0.0 {
        [sum[0] / cnt, sum[1] / cnt, sum[2] / cnt]
    } else {
        [128.0, 128.0, 128.0]
    }
}

fn extract_patch_hist64(
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    x0: u32,
    y0: u32,
    x1: u32,
    y1: u32,
) -> [f32; 64] {
    let mut bins = [0.0f32; 64];
    if frame_w == 0 || frame_h == 0 || x1 <= x0 || y1 <= y0 {
        return bins;
    }
    let sx0 = x0.min(frame_w - 1);
    let sy0 = y0.min(frame_h - 1);
    let sx1 = x1.max(sx0 + 1).min(frame_w);
    let sy1 = y1.max(sy0 + 1).min(frame_h);

    let mut count = 0.0f32;
    for py in sy0..sy1 {
        for px in sx0..sx1 {
            let idx = ((py * frame_w + px) * 3) as usize;
            if idx + 2 >= rgb.len() {
                continue;
            }
            let r = (rgb[idx] >> 6) as usize;
            let g = (rgb[idx + 1] >> 6) as usize;
            let b = (rgb[idx + 2] >> 6) as usize;
            bins[(r << 4) | (g << 2) | b] += 1.0;
            count += 1.0;
        }
    }
    if count > 0.0 {
        let inv = 1.0 / count;
        for bin in &mut bins {
            *bin *= inv;
        }
    }
    bins
}

fn extract_torso_hist64(rgb: &[u8], frame_w: u32, frame_h: u32, obj: &DetectedObject) -> [f32; 64] {
    let fw = frame_w as f32;
    let fh = frame_h as f32;
    let x0 = ((obj.x + obj.w * 0.2) * fw).max(0.0) as u32;
    let x1 = ((obj.x + obj.w * 0.8) * fw).max(0.0) as u32;
    let y0 = ((obj.y + obj.h * 0.15) * fh).max(0.0) as u32;
    let y1 = ((obj.y + obj.h * 0.52) * fh).max(0.0) as u32;
    extract_patch_hist64(
        rgb,
        frame_w,
        frame_h,
        x0,
        y0,
        x1.max(x0 + 1),
        y1.max(y0 + 1),
    )
}

fn extract_lower_hist64(rgb: &[u8], frame_w: u32, frame_h: u32, obj: &DetectedObject) -> [f32; 64] {
    let fw = frame_w as f32;
    let fh = frame_h as f32;
    let x0 = ((obj.x + obj.w * 0.2) * fw).max(0.0) as u32;
    let x1 = ((obj.x + obj.w * 0.8) * fw).max(0.0) as u32;
    let y0 = ((obj.y + obj.h * 0.52) * fh).max(0.0) as u32;
    let y1 = ((obj.y + obj.h * 0.88) * fh).max(0.0) as u32;
    extract_patch_hist64(
        rgb,
        frame_w,
        frame_h,
        x0,
        y0,
        x1.max(x0 + 1),
        y1.max(y0 + 1),
    )
}

const PAN_GRID_W: usize = 120;
const PAN_GRID_H: usize = 68;

fn downsample_luma_grid(rgb: &[u8], frame_w: u32, frame_h: u32) -> Vec<u8> {
    let mut grid = vec![0u8; PAN_GRID_W * PAN_GRID_H];
    if frame_w == 0 || frame_h == 0 {
        return grid;
    }
    for gy in 0..PAN_GRID_H {
        let sy = (((gy as f32 + 0.5) / PAN_GRID_H as f32) * frame_h as f32)
            .floor()
            .clamp(0.0, (frame_h - 1) as f32) as u32;
        for gx in 0..PAN_GRID_W {
            let sx = (((gx as f32 + 0.5) / PAN_GRID_W as f32) * frame_w as f32)
                .floor()
                .clamp(0.0, (frame_w - 1) as f32) as u32;
            let idx = ((sy * frame_w + sx) * 3) as usize;
            if idx + 2 < rgb.len() {
                let lum =
                    ((rgb[idx] as u32 * 77 + rgb[idx + 1] as u32 * 150 + rgb[idx + 2] as u32 * 29)
                        >> 8) as u8;
                grid[gy * PAN_GRID_W + gx] = lum;
            }
        }
    }
    grid
}

fn estimate_camera_pan(prev_luma: &[u8], curr_luma: &[u8]) -> (f32, f32) {
    if prev_luma.len() < PAN_GRID_W * PAN_GRID_H || curr_luma.len() < PAN_GRID_W * PAN_GRID_H {
        return (0.0, 0.0);
    }

    let sad_at = |dx: i32, dy: i32| -> u64 {
        let mut sad = 0u64;
        for gy in 8..60 {
            let py = (gy as i32 - dy) as usize;
            let curr_row = gy * PAN_GRID_W;
            let prev_row = py * PAN_GRID_W;
            for gx in 10..110 {
                let px = (gx as i32 - dx) as usize;
                let a = curr_luma[curr_row + gx] as i32;
                let b = prev_luma[prev_row + px] as i32;
                sad += (a - b).unsigned_abs() as u64;
            }
        }
        sad
    };

    let zero_sad = sad_at(0, 0);
    let mut best_sad = zero_sad;
    let mut best_dx = 0i32;
    let mut best_dy = 0i32;

    for dy in -4..=4 {
        for dx in -8..=8 {
            if dx == 0 && dy == 0 {
                continue;
            }
            let s = sad_at(dx, dy);
            if s < best_sad {
                best_sad = s;
                best_dx = dx;
                best_dy = dy;
            }
        }
    }

    // Deadband prevents spurious pan jitter on tripod/static cameras
    if (best_dx == 0 && best_dy == 0) || zero_sad * 100 <= best_sad * 106 {
        return (0.0, 0.0);
    }

    (
        best_dx as f32 / PAN_GRID_W as f32,
        best_dy as f32 / PAN_GRID_H as f32,
    )
}

const SPATIAL_W: usize = 16;
const SPATIAL_H: usize = 24;
const SPATIAL_LEN: usize = SPATIAL_W * SPATIAL_H;

#[derive(Clone)]
struct SpatialPatchTemplate {
    r: [f32; SPATIAL_LEN],
    g: [f32; SPATIAL_LEN],
    b: [f32; SPATIAL_LEN],
    r_std: f32,
    g_std: f32,
    b_std: f32,
}

fn sample_spatial_channels(
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    obj: &DetectedObject,
) -> ([f32; SPATIAL_LEN], [f32; SPATIAL_LEN], [f32; SPATIAL_LEN]) {
    let mut r = [0.0f32; SPATIAL_LEN];
    let mut g = [0.0f32; SPATIAL_LEN];
    let mut b = [0.0f32; SPATIAL_LEN];
    if frame_w == 0 || frame_h == 0 || rgb.len() < 3 {
        return (r, g, b);
    }

    let fw = frame_w as f32;
    let fh = frame_h as f32;
    let x0 = (obj.x + obj.w * 0.10) * fw;
    let span_w = (obj.w * 0.80 * fw).max(2.0);
    let y0 = (obj.y + obj.h * 0.05) * fh;
    let span_h = (obj.h * 0.87 * fh).max(2.0);

    let mut k = 0usize;
    for sy_i in 0..SPATIAL_H {
        let fy = (sy_i as f32 + 0.5) / (SPATIAL_H as f32);
        let py = (y0 + fy * span_h).floor().clamp(0.0, fh - 1.0) as u32;
        for sx_i in 0..SPATIAL_W {
            let fx = (sx_i as f32 + 0.5) / (SPATIAL_W as f32);
            let px = (x0 + fx * span_w).floor().clamp(0.0, fw - 1.0) as u32;
            let idx = ((py * frame_w + px) * 3) as usize;
            if idx + 2 < rgb.len() {
                r[k] = rgb[idx] as f32;
                g[k] = rgb[idx + 1] as f32;
                b[k] = rgb[idx + 2] as f32;
            }
            k += 1;
        }
    }
    (r, g, b)
}

fn zero_mean_and_std(arr: &mut [f32; SPATIAL_LEN]) -> f32 {
    let sum: f32 = arr.iter().sum();
    let mean = sum / (SPATIAL_LEN as f32);
    let mut var = 0.0f32;
    for v in arr.iter_mut() {
        *v -= mean;
        var += (*v) * (*v);
    }
    var.sqrt()
}

fn extract_spatial_template(
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    obj: &DetectedObject,
) -> SpatialPatchTemplate {
    let (mut r, mut g, mut b) = sample_spatial_channels(rgb, frame_w, frame_h, obj);
    let r_std = zero_mean_and_std(&mut r);
    let g_std = zero_mean_and_std(&mut g);
    let b_std = zero_mean_and_std(&mut b);
    SpatialPatchTemplate {
        r,
        g,
        b,
        r_std,
        g_std,
        b_std,
    }
}

fn channel_ncc(cand: &mut [f32; SPATIAL_LEN], tmpl: &[f32; SPATIAL_LEN], tmpl_std: f32) -> f32 {
    if tmpl_std <= 1e-4 {
        return 0.0;
    }
    let cand_std = zero_mean_and_std(cand);
    if cand_std <= 1e-4 {
        return 0.0;
    }
    let mut dot = 0.0f32;
    for i in 0..SPATIAL_LEN {
        dot += cand[i] * tmpl[i];
    }
    (dot / (cand_std * tmpl_std)).clamp(0.0, 1.0)
}

fn compute_spatial_ncc(
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    obj: &DetectedObject,
    tmpl: &SpatialPatchTemplate,
) -> f32 {
    let (mut cr, mut cg, mut cb) = sample_spatial_channels(rgb, frame_w, frame_h, obj);
    let nr = channel_ncc(&mut cr, &tmpl.r, tmpl.r_std);
    let ng = channel_ncc(&mut cg, &tmpl.g, tmpl.g_std);
    let nb = channel_ncc(&mut cb, &tmpl.b, tmpl.b_std);
    ((nr + ng + nb) / 3.0).clamp(0.0, 1.0)
}

#[derive(Clone)]
struct PlayerSignature {
    anchor_upper: [f32; 64],
    anchor_lower: [f32; 64],
    anchor_spatial: SpatialPatchTemplate,
    running_upper: [f32; 64],
    running_lower: [f32; 64],
    running_spatial: SpatialPatchTemplate,
}

fn build_player_signature(
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    obj: &DetectedObject,
) -> PlayerSignature {
    let upper = extract_torso_hist64(rgb, frame_w, frame_h, obj);
    let lower = extract_lower_hist64(rgb, frame_w, frame_h, obj);
    let spatial = extract_spatial_template(rgb, frame_w, frame_h, obj);
    PlayerSignature {
        anchor_upper: upper,
        anchor_lower: lower,
        anchor_spatial: spatial.clone(),
        running_upper: upper,
        running_lower: lower,
        running_spatial: spatial,
    }
}

fn blend_spatial_template(
    running: &mut SpatialPatchTemplate,
    fresh: &SpatialPatchTemplate,
    rate: f32,
) {
    let keep = 1.0 - rate;
    for i in 0..SPATIAL_LEN {
        running.r[i] = running.r[i] * keep + fresh.r[i] * rate;
        running.g[i] = running.g[i] * keep + fresh.g[i] * rate;
        running.b[i] = running.b[i] * keep + fresh.b[i] * rate;
    }
    running.r_std = zero_mean_and_std(&mut running.r);
    running.g_std = zero_mean_and_std(&mut running.g);
    running.b_std = zero_mean_and_std(&mut running.b);
}

fn score_appearance(
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    det: &DetectedObject,
    sig: &PlayerSignature,
) -> (f32, f32) {
    let det_upper = extract_torso_hist64(rgb, frame_w, frame_h, det);
    let det_lower = extract_lower_hist64(rgb, frame_w, frame_h, det);
    let upper_sim = 0.6 * bhattacharyya_sim(&sig.anchor_upper, &det_upper)
        + 0.4 * bhattacharyya_sim(&sig.running_upper, &det_upper);
    let lower_sim = 0.6 * bhattacharyya_sim(&sig.anchor_lower, &det_lower)
        + 0.4 * bhattacharyya_sim(&sig.running_lower, &det_lower);
    let color_sim = (0.65 * upper_sim + 0.35 * lower_sim).clamp(0.0, 1.0);
    let ncc_anchor = compute_spatial_ncc(rgb, frame_w, frame_h, det, &sig.anchor_spatial);
    let ncc_running = compute_spatial_ncc(rgb, frame_w, frame_h, det, &sig.running_spatial);
    let spatial_sim = (0.35 * ncc_anchor + 0.65 * ncc_running).clamp(0.0, 1.0);
    (color_sim, spatial_sim)
}

fn detect_in_local_roi(
    session: &mut Session,
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    in_w: u32,
    in_h: u32,
    pred_box: &DetectedObject,
) -> Result<Vec<DetectedObject>, String> {
    let cx = pred_box.x + pred_box.w * 0.5;
    let cy = pred_box.y + pred_box.h * 0.5;
    let roi_w = (pred_box.w * 4.5).clamp(0.24, 0.65);
    let roi_h = (pred_box.h * 3.2).clamp(0.32, 0.85);

    let rx0 = (cx - roi_w * 0.5).clamp(0.0, (1.0 - roi_w).max(0.0));
    let ry0 = (cy - roi_h * 0.5).clamp(0.0, (1.0 - roi_h).max(0.0));
    let rx1 = (rx0 + roi_w).min(1.0);
    let ry1 = (ry0 + roi_h).min(1.0);

    let px0 = (rx0 * frame_w as f32).floor().max(0.0) as u32;
    let py0 = (ry0 * frame_h as f32).floor().max(0.0) as u32;
    let px1 = (rx1 * frame_w as f32).ceil().min(frame_w as f32) as u32;
    let py1 = (ry1 * frame_h as f32).ceil().min(frame_h as f32) as u32;

    let crop_w = px1.saturating_sub(px0);
    let crop_h = py1.saturating_sub(py0);
    if crop_w < 16 || crop_h < 16 {
        return Ok(Vec::new());
    }

    let mut crop_rgb = vec![0u8; (crop_w * crop_h * 3) as usize];
    for row in 0..crop_h {
        let src_start = (((py0 + row) * frame_w + px0) * 3) as usize;
        let src_end = src_start + (crop_w * 3) as usize;
        let dst_start = (row * crop_w * 3) as usize;
        if src_end <= rgb.len() {
            crop_rgb[dst_start..dst_start + (crop_w * 3) as usize]
                .copy_from_slice(&rgb[src_start..src_end]);
        }
    }

    let crop_dets =
        detect_rgb_frame_with_thresh(session, &crop_rgb, crop_w, crop_h, in_w, in_h, 0.22, 0.99)?;

    let scale_w = (crop_w as f32) / (frame_w as f32);
    let scale_h = (crop_h as f32) / (frame_h as f32);
    let off_x = (px0 as f32) / (frame_w as f32);
    let off_y = (py0 as f32) / (frame_h as f32);

    Ok(crop_dets
        .into_iter()
        .filter(|d| d.class_id == 0)
        .map(|d| {
            let x = (off_x + d.x * scale_w).clamp(0.0, 1.0);
            let y = (off_y + d.y * scale_h).clamp(0.0, 1.0);
            let w = (d.w * scale_w).clamp(0.0, 1.0 - x);
            let h = (d.h * scale_h).clamp(0.0, 1.0 - y);
            DetectedObject {
                x,
                y,
                w,
                h,
                foot_x: (x + w * 0.5).clamp(0.0, 1.0),
                foot_y: (y + h).clamp(0.0, 1.0),
                confidence: d.confidence,
                class_id: 0,
                label: d.label,
            }
        })
        .collect())
}

fn local_spatial_ncc_fallback_search(
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    pred_box: &DetectedObject,
    sig: &PlayerSignature,
    search_rad: f32,
) -> Option<(DetectedObject, f32)> {
    if frame_w < 16 || frame_h < 16 {
        return None;
    }
    let fw = frame_w as f32;
    let fh = frame_h as f32;

    let box_w_px = (pred_box.w * fw).round().max(6.0) as i32;
    let box_h_px = (pred_box.h * fh).round().max(10.0) as i32;
    let base_x = (pred_box.x * fw).round() as i32;
    let base_y = (pred_box.y * fh).round() as i32;

    let rad_x = (search_rad * fw).round().max(4.0) as i32;
    let rad_y = (search_rad * fh).round().max(4.0) as i32;

    let min_x = (base_x - rad_x).max(0);
    let max_x = (base_x + rad_x).min(frame_w as i32 - box_w_px);
    let min_y = (base_y - rad_y).max(0);
    let max_y = (base_y + rad_y).min(frame_h as i32 - box_h_px);
    if max_x < min_x || max_y < min_y {
        return None;
    }

    let coarse_step = ((frame_w / 240) as i32).clamp(2, 4);
    let mut best_obj = f32::NEG_INFINITY;
    let mut best_spatial = 0.0f32;
    let mut best_upper = 0.0f32;
    let mut best_cx = base_x.clamp(min_x, max_x);
    let mut best_cy = base_y.clamp(min_y, max_y);

    let eval_pos = |sx: i32, sy: i32| -> (f32, f32, f32) {
        let cand = DetectedObject {
            x: sx as f32 / fw,
            y: sy as f32 / fh,
            w: pred_box.w,
            h: pred_box.h,
            foot_x: ((sx as f32 / fw) + pred_box.w * 0.5).clamp(0.0, 1.0),
            foot_y: ((sy as f32 / fh) + pred_box.h).clamp(0.0, 1.0),
            confidence: pred_box.confidence,
            class_id: 0,
            label: pred_box.label.clone(),
        };
        let sp_anchor = compute_spatial_ncc(rgb, frame_w, frame_h, &cand, &sig.anchor_spatial);
        let sp_running = compute_spatial_ncc(rgb, frame_w, frame_h, &cand, &sig.running_spatial);
        let spatial_sim = (0.35 * sp_anchor + 0.65 * sp_running).clamp(0.0, 1.0);
        let det_upper = extract_torso_hist64(rgb, frame_w, frame_h, &cand);
        let upper_sim = 0.6 * bhattacharyya_sim(&sig.anchor_upper, &det_upper)
            + 0.4 * bhattacharyya_sim(&sig.running_upper, &det_upper);
        let dist_norm =
            (((sx - base_x) as f32 / fw).powi(2) + ((sy - base_y) as f32 / fh).powi(2)).sqrt();
        let obj = 0.55 * spatial_sim + 0.35 * upper_sim - 1.2 * dist_norm;
        (obj, spatial_sim, upper_sim)
    };

    let mut sy = min_y;
    while sy <= max_y {
        let mut sx = min_x;
        while sx <= max_x {
            let (obj, sp, up) = eval_pos(sx, sy);
            if obj > best_obj {
                best_obj = obj;
                best_spatial = sp;
                best_upper = up;
                best_cx = sx;
                best_cy = sy;
            }
            sx += coarse_step;
        }
        sy += coarse_step;
    }

    let f_min_x = (best_cx - 3).max(min_x);
    let f_max_x = (best_cx + 3).min(max_x);
    let f_min_y = (best_cy - 3).max(min_y);
    let f_max_y = (best_cy + 3).min(max_y);
    for sy in f_min_y..=f_max_y {
        for sx in f_min_x..=f_max_x {
            let (obj, sp, up) = eval_pos(sx, sy);
            if obj > best_obj {
                best_obj = obj;
                best_spatial = sp;
                best_upper = up;
                best_cx = sx;
                best_cy = sy;
            }
        }
    }

    if best_spatial < 0.42 || best_upper < 0.55 {
        return None;
    }

    let dx = (best_cx - base_x) as f32 / fw;
    let dy = (best_cy - base_y) as f32 / fh;
    Some((
        shift_box(pred_box, dx, dy),
        (0.55 * best_spatial + 0.45 * best_upper).clamp(0.0, 1.0),
    ))
}

fn bhattacharyya_sim(h1: &[f32; 64], h2: &[f32; 64]) -> f32 {
    let mut s = 0.0f32;
    for i in 0..64 {
        s += (h1[i] * h2[i]).sqrt();
    }
    s.clamp(0.0, 1.0)
}

fn shift_box(b: &DetectedObject, dx: f32, dy: f32) -> DetectedObject {
    let x = (b.x + dx).clamp(0.0, (1.0 - b.w).max(0.0));
    let y = (b.y + dy).clamp(0.0, (1.0 - b.h).max(0.0));
    DetectedObject {
        x,
        y,
        w: b.w,
        h: b.h,
        foot_x: (x + b.w * 0.5).clamp(0.0, 1.0),
        foot_y: (y + b.h).clamp(0.0, 1.0),
        confidence: b.confidence,
        class_id: b.class_id,
        label: b.label.clone(),
    }
}

fn box_anchor_point(obj: &DetectedObject, anchor_mode: &str) -> (f64, f64) {
    if anchor_mode == "center" {
        (
            (obj.x + obj.w * 0.5).clamp(0.0, 1.0) as f64,
            (obj.y + obj.h * 0.45).clamp(0.0, 1.0) as f64,
        )
    } else {
        (obj.foot_x as f64, obj.foot_y as f64)
    }
}

struct ActiveTrack {
    id: usize,
    class_id: i32,
    last_box: DetectedObject,
    vx: f32,
    vy: f32,
    missed_frames: usize,
    torso_colors: Vec<[f32; 3]>,
    torso_hist: [f32; 64],
    keyframes: Vec<TrackingKeyframeDto>,
}

fn box_iou_norm(a: &DetectedObject, b: &DetectedObject) -> f32 {
    let ix1 = a.x.max(b.x);
    let iy1 = a.y.max(b.y);
    let ix2 = (a.x + a.w).min(b.x + b.w);
    let iy2 = (a.y + a.h).min(b.y + b.h);
    let inter = (ix2 - ix1).max(0.0) * (iy2 - iy1).max(0.0);
    let union = a.w * a.h + b.w * b.h - inter;
    if union <= 1e-6 { 0.0 } else { inter / union }
}

fn split_teams_2means(colors: &[[f32; 3]]) -> Vec<usize> {
    if colors.len() <= 1 {
        return vec![0; colors.len()];
    }

    // Pick furthest pair as initial centroids
    let mut c0 = colors[0];
    let mut c1 = colors[colors.len() - 1];
    let mut max_d = -1.0f32;
    for i in 0..colors.len() {
        for j in (i + 1)..colors.len() {
            let d = (colors[i][0] - colors[j][0]).powi(2)
                + (colors[i][1] - colors[j][1]).powi(2)
                + (colors[i][2] - colors[j][2]).powi(2);
            if d > max_d {
                max_d = d;
                c0 = colors[i];
                c1 = colors[j];
            }
        }
    }

    let mut assign = vec![0usize; colors.len()];
    for _ in 0..8 {
        let mut sum0 = [0.0f32; 3];
        let mut cnt0 = 0.0f32;
        let mut sum1 = [0.0f32; 3];
        let mut cnt1 = 0.0f32;

        for (idx, col) in colors.iter().enumerate() {
            let d0 = (col[0] - c0[0]).powi(2) + (col[1] - c0[1]).powi(2) + (col[2] - c0[2]).powi(2);
            let d1 = (col[0] - c1[0]).powi(2) + (col[1] - c1[1]).powi(2) + (col[2] - c1[2]).powi(2);
            if d0 <= d1 {
                assign[idx] = 0;
                sum0[0] += col[0];
                sum0[1] += col[1];
                sum0[2] += col[2];
                cnt0 += 1.0;
            } else {
                assign[idx] = 1;
                sum1[0] += col[0];
                sum1[1] += col[1];
                sum1[2] += col[2];
                cnt1 += 1.0;
            }
        }
        if cnt0 > 0.0 {
            c0 = [sum0[0] / cnt0, sum0[1] / cnt0, sum0[2] / cnt0];
        }
        if cnt1 > 0.0 {
            c1 = [sum1[0] / cnt1, sum1[1] / cnt1, sum1[2] / cnt1];
        }
    }
    assign
}

fn smooth_keyframes_zero_phase(
    kfs: Vec<TrackingKeyframeDto>,
    alpha: f64,
) -> Vec<TrackingKeyframeDto> {
    if kfs.len() <= 2 {
        return kfs
            .into_iter()
            .map(|kf| TrackingKeyframeDto {
                time: (kf.time * 1000.0).round() / 1000.0,
                x: kf.x,
                y: kf.y,
            })
            .collect();
    }

    let n = kfs.len();
    let mut fwd_x = vec![0.0f64; n];
    let mut fwd_y = vec![0.0f64; n];
    fwd_x[0] = kfs[0].x;
    fwd_y[0] = kfs[0].y;
    for i in 1..n {
        fwd_x[i] = fwd_x[i - 1] * (1.0 - alpha) + kfs[i].x * alpha;
        fwd_y[i] = fwd_y[i - 1] * (1.0 - alpha) + kfs[i].y * alpha;
    }

    let mut bwd_x = vec![0.0f64; n];
    let mut bwd_y = vec![0.0f64; n];
    bwd_x[n - 1] = kfs[n - 1].x;
    bwd_y[n - 1] = kfs[n - 1].y;
    for i in (0..(n - 1)).rev() {
        bwd_x[i] = bwd_x[i + 1] * (1.0 - alpha) + kfs[i].x * alpha;
        bwd_y[i] = bwd_y[i + 1] * (1.0 - alpha) + kfs[i].y * alpha;
    }

    kfs.into_iter()
        .enumerate()
        .map(|(i, kf)| TrackingKeyframeDto {
            time: (kf.time * 1000.0).round() / 1000.0,
            x: (fwd_x[i] + bwd_x[i]) * 0.5,
            y: (fwd_y[i] + bwd_y[i]) * 0.5,
        })
        .collect()
}

fn merge_tiled_detections(
    mut dets: Vec<DetectedObject>,
    iou_thresh: f32,
    contain_thresh: f32,
) -> Vec<DetectedObject> {
    dets.sort_by(|a, b| {
        b.confidence
            .partial_cmp(&a.confidence)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut kept: Vec<DetectedObject> = Vec::new();
    for cand in dets {
        let cand_area = (cand.w * cand.h).max(1e-6);
        let mut suppressed = false;
        for k in &kept {
            if k.class_id != cand.class_id {
                continue;
            }
            let ix1 = k.x.max(cand.x);
            let iy1 = k.y.max(cand.y);
            let ix2 = (k.x + k.w).min(cand.x + cand.w);
            let iy2 = (k.y + k.h).min(cand.y + cand.h);
            let inter = (ix2 - ix1).max(0.0) * (iy2 - iy1).max(0.0);
            if inter <= 0.0 {
                continue;
            }
            let k_area = (k.w * k.h).max(1e-6);
            let union = (k_area + cand_area - inter).max(1e-6);
            let iou_val = inter / union;
            let contain = inter / k_area.min(cand_area);
            if iou_val > iou_thresh || contain > contain_thresh {
                suppressed = true;
                break;
            }
        }
        if !suppressed {
            kept.push(cand);
        }
    }
    kept
}

pub fn detect_rgb_frame_sahi_tiled(
    session: &mut Session,
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    in_w: u32,
    in_h: u32,
    person_thresh: f32,
    ball_thresh: f32,
) -> Result<Vec<DetectedObject>, String> {
    let mut all = detect_rgb_frame_with_thresh(
        session,
        rgb,
        frame_w,
        frame_h,
        in_w,
        in_h,
        person_thresh,
        ball_thresh,
    )?;

    // 2x3 overlapping SAHI tiles covering 100% of frame so all court + perimeter people stay visible
    let row_spans: [(f32, f32); 2] = [(0.00, 0.58), (0.42, 1.00)];
    let col_spans: [(f32, f32); 3] = [(0.00, 0.42), (0.29, 0.71), (0.58, 1.00)];

    for &(ry0, ry1) in &row_spans {
        for &(rx0, rx1) in &col_spans {
            let px0 = (rx0 * frame_w as f32).floor().max(0.0) as u32;
            let py0 = (ry0 * frame_h as f32).floor().max(0.0) as u32;
            let px1 = (rx1 * frame_w as f32).ceil().min(frame_w as f32) as u32;
            let py1 = (ry1 * frame_h as f32).ceil().min(frame_h as f32) as u32;

            let crop_w = px1.saturating_sub(px0);
            let crop_h = py1.saturating_sub(py0);
            if crop_w < 32 || crop_h < 32 {
                continue;
            }

            let mut crop_rgb = vec![0u8; (crop_w * crop_h * 3) as usize];
            for row in 0..crop_h {
                let src_start = (((py0 + row) * frame_w + px0) * 3) as usize;
                let src_end = src_start + (crop_w * 3) as usize;
                let dst_start = (row * crop_w * 3) as usize;
                if src_end <= rgb.len() {
                    crop_rgb[dst_start..dst_start + (crop_w * 3) as usize]
                        .copy_from_slice(&rgb[src_start..src_end]);
                }
            }

            let tile_dets = detect_rgb_frame_with_thresh(
                session,
                &crop_rgb,
                crop_w,
                crop_h,
                in_w,
                in_h,
                person_thresh,
                ball_thresh,
            )?;

            let scale_w = (crop_w as f32) / (frame_w as f32);
            let scale_h = (crop_h as f32) / (frame_h as f32);
            let off_x = (px0 as f32) / (frame_w as f32);
            let off_y = (py0 as f32) / (frame_h as f32);

            for d in tile_dets {
                let x = (off_x + d.x * scale_w).clamp(0.0, 1.0);
                let y = (off_y + d.y * scale_h).clamp(0.0, 1.0);
                let w = (d.w * scale_w).clamp(0.0, 1.0 - x);
                let h = (d.h * scale_h).clamp(0.0, 1.0 - y);
                if w < 0.006 || h < 0.015 {
                    continue;
                }
                all.push(DetectedObject {
                    x,
                    y,
                    w,
                    h,
                    foot_x: (x + w * 0.5).clamp(0.0, 1.0),
                    foot_y: (y + h).clamp(0.0, 1.0),
                    confidence: d.confidence,
                    class_id: d.class_id,
                    label: d.label,
                });
            }
        }
    }

    let mut merged = merge_tiled_detections(all, 0.42, 0.72);
    merged.sort_by(|a, b| {
        let a_p = if a.class_id == 0 { 0 } else { 1 };
        let b_p = if b.class_id == 0 { 0 } else { 1 };
        a_p.cmp(&b_p).then_with(|| {
            a.foot_x
                .partial_cmp(&b.foot_x)
                .unwrap_or(std::cmp::Ordering::Equal)
        })
    });
    Ok(merged)
}

#[tauri::command]
pub fn check_ai_model_status(app: tauri::AppHandle) -> AiModelStatus {
    match resolve_yolox_model_path(Some(&app)) {
        Some(path) => {
            let variant = model_variant_label(&path);
            match with_yolox_session(&path, |_, in_w, in_h| Ok((in_w, in_h))) {
                Ok((in_w, in_h)) => AiModelStatus {
                    available: true,
                    model_path: Some(path.to_string_lossy().to_string()),
                    engine: format!("ONNX Runtime ({} {}px + SAHI)", variant, in_w),
                    input_size: [in_w, in_h],
                },
                Err(err) => AiModelStatus {
                    available: false,
                    model_path: Some(format!("Error: {}", err)),
                    engine: format!("ONNX Runtime ({})", variant),
                    input_size: [640, 640],
                },
            }
        }
        None => AiModelStatus {
            available: false,
            model_path: None,
            engine: "ONNX Runtime (model belum ditemukan)".to_string(),
            input_size: [640, 640],
        },
    }
}

#[tauri::command]
pub fn detect_players_in_frame_onnx(
    app: tauri::AppHandle,
    input_path: String,
    time_sec: f64,
) -> Result<Vec<DetectedObject>, String> {
    let model_path = resolve_yolox_model_path(Some(&app))
        .ok_or_else(|| "Model ONNX yolox_s.onnx / yolox_nano.onnx tidak ditemukan.".to_string())?;
    let frame_w = 1920u32;
    let frame_h = 1080u32;
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
        .ok_or_else(|| "Gagal mengekstrak frame video pada timestamp tersebut".to_string())?;
    with_yolox_session(&model_path, |session, in_w, in_h| {
        detect_rgb_frame_sahi_tiled(session, rgb, frame_w, frame_h, in_w, in_h, 0.22, 0.20)
    })
}

#[tauri::command]
pub fn detect_player_boxes_range_onnx(
    app: tauri::AppHandle,
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    fps: Option<f64>,
) -> Result<Vec<FrameDetectionsDto>, String> {
    let model_path = resolve_yolox_model_path(Some(&app))
        .ok_or_else(|| "Model ONNX yolox_s.onnx / yolox_nano.onnx tidak ditemukan.".to_string())?;
    let frame_w = 960u32;
    let frame_h = 540u32;
    let sample_fps = fps.unwrap_or(6.0).clamp(1.0, 15.0);
    let frames = ffmpeg::extract_rgb_frames(
        &input_path,
        start_sec,
        end_sec,
        sample_fps,
        frame_w,
        frame_h,
    )?;

    with_yolox_session(&model_path, |session, in_w, in_h| {
        let mut out = Vec::with_capacity(frames.len());
        for (t, rgb) in &frames {
            let boxes = detect_rgb_frame_with_thresh(
                session, rgb, frame_w, frame_h, in_w, in_h, 0.25, 0.22,
            )?;
            out.push(FrameDetectionsDto { time: *t, boxes });
        }
        Ok(out)
    })
}

fn synthetic_anchor_box(
    ax_f: f32,
    ay_f: f32,
    anchor_w: Option<f64>,
    anchor_h: Option<f64>,
    mode: &str,
) -> DetectedObject {
    let bw = anchor_w.unwrap_or(0.055).clamp(0.03, 0.25) as f32;
    let bh = anchor_h.unwrap_or(0.13).clamp(0.05, 0.40) as f32;
    let (x, y) = if mode == "center" {
        (
            (ax_f - bw * 0.5).clamp(0.0, (1.0 - bw).max(0.0)),
            (ay_f - bh * 0.45).clamp(0.0, (1.0 - bh).max(0.0)),
        )
    } else {
        (
            (ax_f - bw * 0.5).clamp(0.0, (1.0 - bw).max(0.0)),
            (ay_f - bh).clamp(0.0, (1.0 - bh).max(0.0)),
        )
    };
    DetectedObject {
        x,
        y,
        w: bw,
        h: bh,
        foot_x: (x + bw * 0.5).clamp(0.0, 1.0),
        foot_y: (y + bh).clamp(0.0, 1.0),
        confidence: 0.5,
        class_id: 0,
        label: "Pemain".to_string(),
    }
}

fn resolve_anchor_box_for_frame(
    session: &mut Session,
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    in_w: u32,
    in_h: u32,
    anchor_x: f64,
    anchor_y: f64,
    anchor_w: Option<f64>,
    anchor_h: Option<f64>,
    mode: &str,
) -> Result<DetectedObject, String> {
    let ax_f = anchor_x.clamp(0.0, 1.0) as f32;
    let ay_f = anchor_y.clamp(0.0, 1.0) as f32;
    let fallback_synth = synthetic_anchor_box(ax_f, ay_f, anchor_w, anchor_h, mode);

    let full_dets =
        detect_rgb_frame_with_thresh(session, rgb, frame_w, frame_h, in_w, in_h, 0.24, 0.22)?;
    let roi_dets = detect_in_local_roi(session, rgb, frame_w, frame_h, in_w, in_h, &fallback_synth)
        .unwrap_or_default();

    let all_dets: Vec<DetectedObject> = roi_dets.into_iter().chain(full_dets).collect();

    let mut chosen_box: Option<DetectedObject> = None;
    let mut best_contain_dist = f32::INFINITY;
    for det in all_dets.iter().filter(|d| d.class_id == 0) {
        let pad = 0.015f32;
        if ax_f >= det.x - pad
            && ax_f <= det.x + det.w + pad
            && ay_f >= det.y - pad
            && ay_f <= det.y + det.h + pad
        {
            let (px, py) = box_anchor_point(det, mode);
            let d = (((px as f32) - ax_f).powi(2) + ((py as f32) - ay_f).powi(2)).sqrt();
            if d < best_contain_dist {
                best_contain_dist = d;
                chosen_box = Some(det.clone());
            }
        }
    }

    if chosen_box.is_none() {
        let mut best_near = 0.10f32;
        for det in all_dets.iter().filter(|d| d.class_id == 0) {
            let (px, py) = box_anchor_point(det, mode);
            let d = (((px as f32) - ax_f).powi(2) + ((py as f32) - ay_f).powi(2)).sqrt();
            if d <= best_near {
                best_near = d;
                chosen_box = Some(det.clone());
            }
        }
    }

    Ok(chosen_box.unwrap_or(fallback_synth))
}

fn track_one_direction(
    session: &mut Session,
    frames: &[(f64, Vec<u8>)],
    luma_grids: &[Vec<u8>],
    anchor_idx: usize,
    indices: &[usize],
    frame_w: u32,
    frame_h: u32,
    in_w: u32,
    in_h: u32,
    init_box: &DetectedObject,
    init_sig: &PlayerSignature,
    anchor_mode: &str,
    goal_hint: Option<(usize, f32, f32)>,
) -> Result<(Vec<(usize, TrackingKeyframeDto)>, usize, usize, usize), String> {
    let mut kfs = Vec::new();
    let mut last_box = init_box.clone();
    let mut prev_idx = anchor_idx;
    let mut vx = 0.0f32;
    let mut vy = 0.0f32;
    let mut sig = init_sig.clone();
    let mut distractors: Vec<(DetectedObject, f32, f32)> = Vec::new();
    let mut missed = 0usize;
    let mut matched_ai = 0usize;
    let mut fallback_hits = 0usize;
    let mut cam_pan_frames = 0usize;

    let refresh_distractors = |prev: &[(DetectedObject, f32, f32)],
                               dets: &[DetectedObject],
                               chosen_idx: Option<usize>,
                               target_pred: &DetectedObject,
                               cam_dx: f32,
                               cam_dy: f32|
     -> Vec<(DetectedObject, f32, f32)> {
        let mut next: Vec<(DetectedObject, f32, f32, f32)> = Vec::new();
        for (di, d) in dets.iter().enumerate() {
            if d.class_id != 0 || chosen_idx == Some(di) {
                continue;
            }
            let dist_target = ((d.foot_x - target_pred.foot_x).powi(2)
                + (d.foot_y - target_pred.foot_y).powi(2))
            .sqrt();
            if dist_target < 0.018 {
                continue;
            }
            let mut dvx = 0.0f32;
            let mut dvy = 0.0f32;
            let mut best_pd = 0.06f32;
            for (pd, pvx, pvy) in prev {
                let pdist = ((d.foot_x - (pd.foot_x + cam_dx + pvx)).powi(2)
                    + (d.foot_y - (pd.foot_y + cam_dy + pvy)).powi(2))
                .sqrt();
                if pdist < best_pd {
                    best_pd = pdist;
                    dvx = (0.45 * pvx + 0.55 * ((d.foot_x - pd.foot_x) - cam_dx))
                        .clamp(-0.045, 0.045);
                    dvy = (0.45 * pvy + 0.55 * ((d.foot_y - pd.foot_y) - cam_dy))
                        .clamp(-0.045, 0.045);
                }
            }
            next.push((d.clone(), dvx, dvy, dist_target));
        }
        next.sort_by(|a, b| a.3.partial_cmp(&b.3).unwrap_or(std::cmp::Ordering::Equal));
        next.truncate(6);
        next.into_iter()
            .map(|(d, dvx, dvy, _)| (d, dvx, dvy))
            .collect()
    };

    for (pos_i, &idx) in indices.iter().enumerate() {
        let (t, rgb) = &frames[idx];
        let (cam_dx, cam_dy) = estimate_camera_pan(&luma_grids[prev_idx], &luma_grids[idx]);
        if cam_dx.abs() > 1e-4 || cam_dy.abs() > 1e-4 {
            cam_pan_frames += 1;
        }
        prev_idx = idx;

        let mut step_dx = cam_dx + vx;
        let mut step_dy = cam_dy + vy;
        if let Some((_goal_idx, gx, gy)) = goal_hint {
            let rem = indices.len().saturating_sub(pos_i);
            if rem >= 1 {
                let (curr_ax, curr_ay) = box_anchor_point(&last_box, anchor_mode);
                let nudge_x = (gx - curr_ax as f32) / (rem as f32);
                let nudge_y = (gy - curr_ay as f32) / (rem as f32);
                step_dx = step_dx * 0.88 + nudge_x * 0.12;
                step_dy = step_dy * 0.88 + nudge_y * 0.12;
            }
        }

        let pred_box = shift_box(&last_box, step_dx, step_dy);
        let pred_distractors: Vec<(f32, f32)> = distractors
            .iter()
            .map(|(db, dvx, dvy)| (db.foot_x + cam_dx + dvx, db.foot_y + cam_dy + dvy))
            .collect();
        let dets = detect_in_local_roi(session, rgb, frame_w, frame_h, in_w, in_h, &pred_box)?;

        let max_gate = (0.065 + 0.020 * (missed as f32)).min(0.14);
        let mut best_det: Option<(usize, DetectedObject, f32, f32, f32, f32)> = None;

        for (di, det) in dets.iter().enumerate() {
            if det.class_id != 0 {
                continue;
            }
            let dist = ((det.foot_x - pred_box.foot_x).powi(2)
                + (det.foot_y - pred_box.foot_y).powi(2))
            .sqrt();
            if dist > max_gate {
                continue;
            }

            // Distractor-Exclusive guard: skip candidate owned much closer by another tracked player
            let claimed_by_distractor = pred_distractors.iter().any(|&(dx, dy)| {
                let d_dist = ((det.foot_x - dx).powi(2) + (det.foot_y - dy).powi(2)).sqrt();
                d_dist < 0.025 && d_dist * 1.45 < dist && dist > 0.032
            });
            if claimed_by_distractor {
                continue;
            }

            let (color_sim, spatial_sim) = score_appearance(rgb, frame_w, frame_h, det, &sig);
            let size_score =
                (1.0 - (det.h - last_box.h).abs() / last_box.h.max(0.04)).clamp(0.0, 1.0);

            // Strict Anti-Hijack Gate: reject passing opponent or mismatched player
            if color_sim < 0.45 || (spatial_sim < 0.25 && color_sim < 0.62) || size_score < 0.55 {
                continue;
            }

            let dist_score = (1.0 - dist / max_gate).max(0.0);
            let iou_score = box_iou_norm(&pred_box, det);
            let score = 0.30 * dist_score
                + 0.30 * spatial_sim
                + 0.22 * color_sim
                + 0.10 * iou_score
                + 0.08 * size_score;

            if best_det.as_ref().map(|b| score > b.2).unwrap_or(true) {
                best_det = Some((di, det.clone(), score, color_sim, spatial_sim, dist));
            }
        }

        if let Some((det_idx, det, score, color_sim, spatial_sim, dist)) = best_det {
            if score >= 0.46 {
                let raw_vx = (det.foot_x - last_box.foot_x) - cam_dx;
                let raw_vy = (det.foot_y - last_box.foot_y) - cam_dy;
                vx = (0.45 * vx + 0.55 * raw_vx).clamp(-0.045, 0.045);
                vy = (0.45 * vy + 0.55 * raw_vy).clamp(-0.045, 0.045);
                last_box = det;
                missed = 0;
                matched_ai += 1;

                if color_sim >= 0.70 && spatial_sim >= 0.42 && dist < 0.045 {
                    let up = extract_torso_hist64(rgb, frame_w, frame_h, &last_box);
                    let lo = extract_lower_hist64(rgb, frame_w, frame_h, &last_box);
                    for b in 0..64 {
                        sig.running_upper[b] = sig.running_upper[b] * 0.94 + up[b] * 0.06;
                        sig.running_lower[b] = sig.running_lower[b] * 0.94 + lo[b] * 0.06;
                    }
                    let fresh_sp = extract_spatial_template(rgb, frame_w, frame_h, &last_box);
                    blend_spatial_template(&mut sig.running_spatial, &fresh_sp, 0.15);
                }

                distractors = refresh_distractors(
                    &distractors,
                    &dets,
                    Some(det_idx),
                    &last_box,
                    cam_dx,
                    cam_dy,
                );

                let (ax, ay) = box_anchor_point(&last_box, anchor_mode);
                kfs.push((
                    idx,
                    TrackingKeyframeDto {
                        time: *t,
                        x: ax,
                        y: ay,
                    },
                ));
                continue;
            }
        }

        if let Some((fb_box, _score)) =
            local_spatial_ncc_fallback_search(rgb, frame_w, frame_h, &pred_box, &sig, 0.045)
        {
            let raw_vx = (fb_box.foot_x - last_box.foot_x) - cam_dx;
            let raw_vy = (fb_box.foot_y - last_box.foot_y) - cam_dy;
            vx = (0.45 * vx + 0.55 * raw_vx).clamp(-0.035, 0.035);
            vy = (0.45 * vy + 0.55 * raw_vy).clamp(-0.035, 0.035);
            last_box = fb_box;
            missed = 0;
            fallback_hits += 1;
            distractors = refresh_distractors(&distractors, &dets, None, &last_box, cam_dx, cam_dy);

            let (ax, ay) = box_anchor_point(&last_box, anchor_mode);
            kfs.push((
                idx,
                TrackingKeyframeDto {
                    time: *t,
                    x: ax,
                    y: ay,
                },
            ));
            continue;
        }

        distractors = refresh_distractors(&distractors, &dets, None, &pred_box, cam_dx, cam_dy);
        missed += 1;
        if missed > 5 {
            break;
        }
        vx *= 0.4;
        vy *= 0.4;
        last_box = shift_box(&last_box, cam_dx, cam_dy);
    }

    Ok((kfs, matched_ai, fallback_hits, cam_pan_frames))
}

#[tauri::command]
pub fn track_single_player_onnx(
    app: tauri::AppHandle,
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    anchor_sec: f64,
    anchor_x: f64,
    anchor_y: f64,
    anchor_w: Option<f64>,
    anchor_h: Option<f64>,
    anchor_mode: Option<String>,
    direction: Option<String>,
    fps: Option<f64>,
) -> Result<SinglePlayerTrackResult, String> {
    let model_path = resolve_yolox_model_path(Some(&app))
        .ok_or_else(|| "Model ONNX yolox_s.onnx / yolox_nano.onnx tidak ditemukan.".to_string())?;
    let variant = model_variant_label(&model_path);

    let frame_w = 1280u32;
    let frame_h = 720u32;
    let default_fps = if (end_sec - start_sec) > 10.0 {
        12.0
    } else {
        15.0
    };
    let sample_fps = fps.unwrap_or(default_fps).clamp(6.0, 24.0);
    let frames = ffmpeg::extract_rgb_frames(
        &input_path,
        start_sec,
        end_sec,
        sample_fps,
        frame_w,
        frame_h,
    )?;

    if frames.is_empty() {
        return Err("Tidak ada frame yang berhasil diekstrak dari klip ini.".to_string());
    }

    let luma_grids: Vec<Vec<u8>> = frames
        .iter()
        .map(|(_, rgb)| downsample_luma_grid(rgb, frame_w, frame_h))
        .collect();

    let mode = anchor_mode.as_deref().unwrap_or("foot");
    let dir_mode = direction.as_deref().unwrap_or("both");

    let mut anchor_idx = 0usize;
    let mut best_dt = f64::INFINITY;
    for (idx, (t, _)) in frames.iter().enumerate() {
        let dt = (t - anchor_sec).abs();
        if dt < best_dt {
            best_dt = dt;
            anchor_idx = idx;
        }
    }

    with_yolox_session(&model_path, |session, in_w, in_h| {
        let (anchor_t, anchor_rgb) = &frames[anchor_idx];
        let anchor_box = resolve_anchor_box_for_frame(
            session, anchor_rgb, frame_w, frame_h, in_w, in_h, anchor_x, anchor_y, anchor_w,
            anchor_h, mode,
        )?;
        let anchor_sig = build_player_signature(anchor_rgb, frame_w, frame_h, &anchor_box);
        let (ax0, ay0) = box_anchor_point(&anchor_box, mode);
        let anchor_kf = TrackingKeyframeDto {
            time: *anchor_t,
            x: ax0,
            y: ay0,
        };

        let fwd_indices: Vec<usize> = ((anchor_idx + 1)..frames.len()).collect();
        let (fwd_kfs, fwd_ai, fwd_fb, fwd_pan) = track_one_direction(
            session,
            &frames,
            &luma_grids,
            anchor_idx,
            &fwd_indices,
            frame_w,
            frame_h,
            in_w,
            in_h,
            &anchor_box,
            &anchor_sig,
            mode,
            None,
        )?;

        let (bwd_kfs, bwd_ai, bwd_fb, bwd_pan) = if dir_mode == "forward" {
            (Vec::new(), 0, 0, 0)
        } else {
            let bwd_indices: Vec<usize> = (0..anchor_idx).rev().collect();
            let (mut kfs, ai, fb, pan) = track_one_direction(
                session,
                &frames,
                &luma_grids,
                anchor_idx,
                &bwd_indices,
                frame_w,
                frame_h,
                in_w,
                in_h,
                &anchor_box,
                &anchor_sig,
                mode,
                None,
            )?;
            kfs.reverse();
            (kfs, ai, fb, pan)
        };

        let mut all_kfs = Vec::with_capacity(bwd_kfs.len() + 1 + fwd_kfs.len());
        all_kfs.extend(bwd_kfs.into_iter().map(|(_, kf)| kf));
        all_kfs.push(anchor_kf);
        all_kfs.extend(fwd_kfs.into_iter().map(|(_, kf)| kf));
        all_kfs.sort_by(|a, b| {
            a.time
                .partial_cmp(&b.time)
                .unwrap_or(std::cmp::Ordering::Equal)
        });

        let smoothed = smooth_keyframes_zero_phase(all_kfs, 0.55);

        Ok(SinglePlayerTrackResult {
            keyframes: smoothed,
            frames_processed: frames.len(),
            matched_ai_frames: 1 + fwd_ai + bwd_ai,
            fallback_frames: fwd_fb + bwd_fb,
            camera_pan_frames: fwd_pan + bwd_pan,
            engine_info: format!(
                "Local-ROI {} (1280x720 @ {:.0}fps) + Spatial NCC",
                variant, sample_fps
            ),
            anchor_box: Some(anchor_box),
        })
    })
}

fn blend_guided_segment(
    pin_a: (usize, f64, f64),
    pin_b: (usize, f64, f64),
    fwd_map: &[Option<TrackingKeyframeDto>],
    bwd_map: &[Option<TrackingKeyframeDto>],
    frame_times: &[f64],
) -> Vec<TrackingKeyframeDto> {
    let (ia, ax, ay) = pin_a;
    let (ib, bx, by) = pin_b;
    if ib <= ia {
        return vec![TrackingKeyframeDto {
            time: frame_times[ia],
            x: ax,
            y: ay,
        }];
    }
    let span = (ib - ia) as f64;
    let mut out = Vec::with_capacity(ib - ia + 1);
    for idx in ia..=ib {
        if idx == ia {
            out.push(TrackingKeyframeDto {
                time: frame_times[ia],
                x: ax,
                y: ay,
            });
            continue;
        }
        if idx == ib {
            out.push(TrackingKeyframeDto {
                time: frame_times[ib],
                x: bx,
                y: by,
            });
            continue;
        }
        let u = (idx - ia) as f64 / span;
        let w = 0.5 * (1.0 + (std::f64::consts::PI * u).cos());
        let lin_x = ax + (bx - ax) * u;
        let lin_y = ay + (by - ay) * u;

        let (x, y) = match (
            fwd_map.get(idx).and_then(|o| o.as_ref()),
            bwd_map.get(idx).and_then(|o| o.as_ref()),
        ) {
            (Some(f), Some(b)) => (f.x * w + b.x * (1.0 - w), f.y * w + b.y * (1.0 - w)),
            (Some(f), None) => (f.x * w + lin_x * (1.0 - w), f.y * w + lin_y * (1.0 - w)),
            (None, Some(b)) => (lin_x * w + b.x * (1.0 - w), lin_y * w + b.y * (1.0 - w)),
            (None, None) => (lin_x, lin_y),
        };
        out.push(TrackingKeyframeDto {
            time: frame_times[idx],
            x,
            y,
        });
    }
    out
}

#[tauri::command]
pub fn track_guided_anchors_onnx(
    app: tauri::AppHandle,
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    anchors: Vec<AnchorPinDto>,
    anchor_mode: Option<String>,
    fps: Option<f64>,
) -> Result<SinglePlayerTrackResult, String> {
    if anchors.is_empty() {
        return Err("Minimal 1 pin jangkar diperlukan untuk Guided Re-Tracking.".to_string());
    }

    let mut sorted = anchors;
    sorted.sort_by(|a, b| {
        a.time
            .partial_cmp(&b.time)
            .unwrap_or(std::cmp::Ordering::Equal)
    });
    let mut deduped: Vec<AnchorPinDto> = Vec::new();
    for pin in sorted {
        if let Some(last) = deduped.last_mut() {
            if (pin.time - last.time).abs() < 0.08 {
                *last = pin;
                continue;
            }
        }
        deduped.push(pin);
    }

    if deduped.len() == 1 {
        let p = &deduped[0];
        return track_single_player_onnx(
            app,
            input_path,
            start_sec,
            end_sec,
            p.time,
            p.x,
            p.y,
            None,
            None,
            anchor_mode,
            Some("both".to_string()),
            fps,
        );
    }

    let model_path = resolve_yolox_model_path(Some(&app))
        .ok_or_else(|| "Model ONNX yolox_s.onnx / yolox_nano.onnx tidak ditemukan.".to_string())?;
    let variant = model_variant_label(&model_path);

    let frame_w = 1280u32;
    let frame_h = 720u32;
    let default_fps = if (end_sec - start_sec) > 10.0 {
        12.0
    } else {
        15.0
    };
    let sample_fps = fps.unwrap_or(default_fps).clamp(6.0, 24.0);
    let frames = ffmpeg::extract_rgb_frames(
        &input_path,
        start_sec,
        end_sec,
        sample_fps,
        frame_w,
        frame_h,
    )?;

    if frames.is_empty() {
        return Err("Tidak ada frame yang berhasil diekstrak dari klip ini.".to_string());
    }

    let luma_grids: Vec<Vec<u8>> = frames
        .iter()
        .map(|(_, rgb)| downsample_luma_grid(rgb, frame_w, frame_h))
        .collect();
    let frame_times: Vec<f64> = frames.iter().map(|(t, _)| *t).collect();
    let mode = anchor_mode.as_deref().unwrap_or("foot");

    struct LockedPin {
        idx: usize,
        x: f64,
        y: f64,
        box_det: DetectedObject,
        sig: PlayerSignature,
    }

    with_yolox_session(&model_path, |session, in_w, in_h| {
        let mut locked_pins: Vec<LockedPin> = Vec::with_capacity(deduped.len());
        for pin in &deduped {
            let mut best_i = 0usize;
            let mut best_dt = f64::INFINITY;
            for (i, t) in frame_times.iter().enumerate() {
                let dt = (t - pin.time).abs();
                if dt < best_dt {
                    best_dt = dt;
                    best_i = i;
                }
            }
            let (_, rgb) = &frames[best_i];
            let det_box = resolve_anchor_box_for_frame(
                session, rgb, frame_w, frame_h, in_w, in_h, pin.x, pin.y, None, None, mode,
            )?;
            let sig = build_player_signature(rgb, frame_w, frame_h, &det_box);
            if let Some(prev) = locked_pins.last_mut() {
                if prev.idx == best_i {
                    *prev = LockedPin {
                        idx: best_i,
                        x: pin.x,
                        y: pin.y,
                        box_det: det_box,
                        sig,
                    };
                    continue;
                }
            }
            locked_pins.push(LockedPin {
                idx: best_i,
                x: pin.x,
                y: pin.y,
                box_det: det_box,
                sig,
            });
        }

        let mut total_ai = locked_pins.len();
        let mut total_fb = 0usize;
        let mut total_pan = 0usize;
        let mut all_kfs: Vec<TrackingKeyframeDto> = Vec::new();

        // 1. Track backward before first pin
        let first_pin = &locked_pins[0];
        if first_pin.idx > 0 {
            let bwd_indices: Vec<usize> = (0..first_pin.idx).rev().collect();
            let (mut bwd_kfs, ai, fb, pan) = track_one_direction(
                session,
                &frames,
                &luma_grids,
                first_pin.idx,
                &bwd_indices,
                frame_w,
                frame_h,
                in_w,
                in_h,
                &first_pin.box_det,
                &first_pin.sig,
                mode,
                None,
            )?;
            bwd_kfs.reverse();
            total_ai += ai;
            total_fb += fb;
            total_pan += pan;
            all_kfs.extend(bwd_kfs.into_iter().map(|(_, kf)| kf));
        }

        // 2. Track and cosine-blend each interior span [Pin_k .. Pin_{k+1}]
        for k in 0..(locked_pins.len() - 1) {
            let pa = &locked_pins[k];
            let pb = &locked_pins[k + 1];

            let mut fwd_map: Vec<Option<TrackingKeyframeDto>> = vec![None; frames.len()];
            let mut bwd_map: Vec<Option<TrackingKeyframeDto>> = vec![None; frames.len()];

            if pb.idx > pa.idx + 1 {
                let fwd_indices: Vec<usize> = ((pa.idx + 1)..pb.idx).collect();
                let (fkfs, ai1, fb1, pan1) = track_one_direction(
                    session,
                    &frames,
                    &luma_grids,
                    pa.idx,
                    &fwd_indices,
                    frame_w,
                    frame_h,
                    in_w,
                    in_h,
                    &pa.box_det,
                    &pa.sig,
                    mode,
                    Some((pb.idx, pb.x as f32, pb.y as f32)),
                )?;
                total_ai += ai1;
                total_fb += fb1;
                total_pan += pan1;
                for (fi, kf) in fkfs {
                    fwd_map[fi] = Some(kf);
                }

                let bwd_indices: Vec<usize> = ((pa.idx + 1)..pb.idx).rev().collect();
                let (bkfs, ai2, fb2, pan2) = track_one_direction(
                    session,
                    &frames,
                    &luma_grids,
                    pb.idx,
                    &bwd_indices,
                    frame_w,
                    frame_h,
                    in_w,
                    in_h,
                    &pb.box_det,
                    &pb.sig,
                    mode,
                    Some((pa.idx, pa.x as f32, pa.y as f32)),
                )?;
                total_ai += ai2;
                total_fb += fb2;
                total_pan += pan2;
                for (bi, kf) in bkfs {
                    bwd_map[bi] = Some(kf);
                }
            }

            let seg_kfs = blend_guided_segment(
                (pa.idx, pa.x, pa.y),
                (pb.idx, pb.x, pb.y),
                &fwd_map,
                &bwd_map,
                &frame_times,
            );
            if k == 0 {
                all_kfs.extend(seg_kfs);
            } else {
                all_kfs.extend(seg_kfs.into_iter().skip(1));
            }
        }

        // 3. Track forward after last pin
        let last_pin = &locked_pins[locked_pins.len() - 1];
        if last_pin.idx + 1 < frames.len() {
            let fwd_indices: Vec<usize> = ((last_pin.idx + 1)..frames.len()).collect();
            let (fwd_kfs, ai, fb, pan) = track_one_direction(
                session,
                &frames,
                &luma_grids,
                last_pin.idx,
                &fwd_indices,
                frame_w,
                frame_h,
                in_w,
                in_h,
                &last_pin.box_det,
                &last_pin.sig,
                mode,
                None,
            )?;
            total_ai += ai;
            total_fb += fb;
            total_pan += pan;
            all_kfs.extend(fwd_kfs.into_iter().map(|(_, kf)| kf));
        }

        let mut smoothed = smooth_keyframes_zero_phase(all_kfs, 0.65);
        // Keep exact user ground-truth anchor pins intact
        for lp in &locked_pins {
            let target_t = (frame_times[lp.idx] * 1000.0).round() / 1000.0;
            if let Some(kf) = smoothed
                .iter_mut()
                .find(|k| (k.time - target_t).abs() < 0.002)
            {
                kf.x = lp.x;
                kf.y = lp.y;
            }
        }

        Ok(SinglePlayerTrackResult {
            keyframes: smoothed,
            frames_processed: frames.len(),
            matched_ai_frames: total_ai,
            fallback_frames: total_fb,
            camera_pan_frames: total_pan,
            engine_info: format!(
                "Guided {} Pin · ROI {} (1280x720 @ {:.0}fps) + Spatial NCC",
                locked_pins.len(),
                variant,
                sample_fps
            ),
            anchor_box: locked_pins.first().map(|p| p.box_det.clone()),
        })
    })
}

#[tauri::command]
pub fn run_multi_player_tracking_onnx(
    app: tauri::AppHandle,
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    fps: Option<f64>,
) -> Result<OnnxTrackingResult, String> {
    let model_path = resolve_yolox_model_path(Some(&app))
        .ok_or_else(|| "Model ONNX yolox_s.onnx / yolox_nano.onnx tidak ditemukan.".to_string())?;

    let frame_w = 960u32;
    let frame_h = 540u32;
    let sample_fps = fps.unwrap_or(8.0).clamp(2.0, 20.0);
    let frames = ffmpeg::extract_rgb_frames(
        &input_path,
        start_sec,
        end_sec,
        sample_fps,
        frame_w,
        frame_h,
    )?;

    if frames.is_empty() {
        return Err("Tidak ada frame yang berhasil diekstrak dari rentang klip ini.".to_string());
    }

    let mut tracks: Vec<ActiveTrack> = Vec::new();
    let mut next_id = 1usize;

    with_yolox_session(&model_path, |session, in_w, in_h| {
        for (t, rgb) in &frames {
            let dets = detect_rgb_frame_with_thresh(
                session, rgb, frame_w, frame_h, in_w, in_h, 0.25, 0.22,
            )?;

            let mut matched_track = vec![false; tracks.len()];
            let mut matched_det = vec![false; dets.len()];

            // Build candidate pairs sorted by velocity-predicted proximity + IoU + torso histogram
            let mut candidates: Vec<(usize, usize, f32)> = Vec::new();
            for (ti, tr) in tracks.iter().enumerate() {
                if tr.missed_frames > 5 {
                    continue;
                }
                let pred_box = shift_box(&tr.last_box, tr.vx, tr.vy);
                for (di, det) in dets.iter().enumerate() {
                    if tr.class_id != det.class_id {
                        continue;
                    }
                    let iou_val = box_iou_norm(&pred_box, det);
                    let dist = ((pred_box.foot_x - det.foot_x).powi(2)
                        + (pred_box.foot_y - det.foot_y).powi(2))
                    .sqrt();
                    if iou_val > 0.10 || dist < 0.12 {
                        let hist_sim = if det.class_id == 0 {
                            let dh = extract_torso_hist64(rgb, frame_w, frame_h, det);
                            bhattacharyya_sim(&tr.torso_hist, &dh)
                        } else {
                            0.5
                        };
                        let score = iou_val * 1.6 + (0.13 - dist).max(0.0) * 3.0 + hist_sim * 0.5;
                        candidates.push((ti, di, score));
                    }
                }
            }
            candidates.sort_by(|a, b| b.2.partial_cmp(&a.2).unwrap_or(std::cmp::Ordering::Equal));

            for (ti, di, _) in candidates {
                if matched_track[ti] || matched_det[di] {
                    continue;
                }
                matched_track[ti] = true;
                matched_det[di] = true;

                let det = &dets[di];
                let tr = &mut tracks[ti];
                tr.vx = (0.5 * tr.vx + 0.5 * (det.foot_x - tr.last_box.foot_x)).clamp(-0.08, 0.08);
                tr.vy = (0.5 * tr.vy + 0.5 * (det.foot_y - tr.last_box.foot_y)).clamp(-0.08, 0.08);
                tr.last_box = det.clone();
                tr.missed_frames = 0;
                if det.class_id == 0 {
                    tr.torso_colors
                        .push(sample_torso_rgb(rgb, frame_w, frame_h, det));
                    let dh = extract_torso_hist64(rgb, frame_w, frame_h, det);
                    for b in 0..64 {
                        tr.torso_hist[b] = tr.torso_hist[b] * 0.88 + dh[b] * 0.12;
                    }
                }
                tr.keyframes.push(TrackingKeyframeDto {
                    time: *t,
                    x: det.foot_x as f64,
                    y: det.foot_y as f64,
                });
            }

            for (ti, tr) in tracks.iter_mut().enumerate() {
                if !matched_track[ti] {
                    tr.missed_frames += 1;
                    tr.vx *= 0.6;
                    tr.vy *= 0.6;
                }
            }

            for (di, det) in dets.iter().enumerate() {
                if matched_det[di] {
                    continue;
                }
                let mut torso_colors = Vec::new();
                let torso_hist = if det.class_id == 0 {
                    torso_colors.push(sample_torso_rgb(rgb, frame_w, frame_h, det));
                    extract_torso_hist64(rgb, frame_w, frame_h, det)
                } else {
                    [0.0f32; 64]
                };
                tracks.push(ActiveTrack {
                    id: next_id,
                    class_id: det.class_id,
                    last_box: det.clone(),
                    vx: 0.0,
                    vy: 0.0,
                    missed_frames: 0,
                    torso_colors,
                    torso_hist,
                    keyframes: vec![TrackingKeyframeDto {
                        time: *t,
                        x: det.foot_x as f64,
                        y: det.foot_y as f64,
                    }],
                });
                next_id += 1;
            }
        }
        Ok(())
    })?;

    let min_len = if frames.len() >= 4 { 3 } else { 1 };
    let mut player_tracks: Vec<ActiveTrack> = tracks
        .iter()
        .filter(|t| t.class_id == 0 && t.keyframes.len() >= min_len)
        .cloned_via_manual();
    player_tracks.sort_by(|a, b| b.keyframes.len().cmp(&a.keyframes.len()));
    player_tracks.truncate(10);

    let median_colors: Vec<[f32; 3]> = player_tracks
        .iter()
        .map(|t| {
            if t.torso_colors.is_empty() {
                [128.0, 128.0, 128.0]
            } else {
                let n = t.torso_colors.len() as f32;
                let mut s = [0.0f32; 3];
                for c in &t.torso_colors {
                    s[0] += c[0];
                    s[1] += c[1];
                    s[2] += c[2];
                }
                [s[0] / n, s[1] / n, s[2] / n]
            }
        })
        .collect();

    let team_assign = split_teams_2means(&median_colors);
    let mut final_tracks = Vec::new();
    let mut home_idx = 1usize;
    let mut away_idx = 1usize;

    for (idx, tr) in player_tracks.into_iter().enumerate() {
        let is_home = team_assign.get(idx).copied().unwrap_or(0) == 0;
        let (team, color, label) = if is_home {
            let l = format!("Pemain A{}", home_idx);
            home_idx += 1;
            ("home".to_string(), "#ef4444".to_string(), l)
        } else {
            let l = format!("Pemain B{}", away_idx);
            away_idx += 1;
            ("away".to_string(), "#3b82f6".to_string(), l)
        };

        final_tracks.push(MultiPlayerTrackDto {
            id: format!("onnx-p{}", tr.id),
            label,
            team,
            color,
            keyframes: smooth_keyframes_zero_phase(tr.keyframes, 0.55),
        });
    }

    if let Some(ball_tr) = tracks
        .into_iter()
        .filter(|t| t.class_id == 32 && t.keyframes.len() >= 2)
        .max_by_key(|t| t.keyframes.len())
    {
        final_tracks.push(MultiPlayerTrackDto {
            id: format!("onnx-ball-{}", ball_tr.id),
            label: "Bola Futsal".to_string(),
            team: "ball".to_string(),
            color: "#f59e0b".to_string(),
            keyframes: smooth_keyframes_zero_phase(ball_tr.keyframes, 0.65),
        });
    }

    Ok(OnnxTrackingResult {
        tracks: final_tracks,
        frames_processed: frames.len(),
        model_used: model_path.to_string_lossy().to_string(),
    })
}

trait CloneTrackVec {
    fn cloned_via_manual(self) -> Vec<ActiveTrack>;
}

impl<'a, I: Iterator<Item = &'a ActiveTrack>> CloneTrackVec for I {
    fn cloned_via_manual(self) -> Vec<ActiveTrack> {
        self.map(|t| ActiveTrack {
            id: t.id,
            class_id: t.class_id,
            last_box: t.last_box.clone(),
            vx: t.vx,
            vy: t.vy,
            missed_frames: t.missed_frames,
            torso_colors: t.torso_colors.clone(),
            torso_hist: t.torso_hist,
            keyframes: t.keyframes.clone(),
        })
        .collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_yolox_nano_loads_and_infers_dummy_frame() {
        let model_path = resolve_yolox_model_path(None)
            .expect("yolox_nano.onnx harus tersedia di src-tauri/resources/models/");
        let (mut session, in_w, in_h) =
            load_yolox_session(&model_path).expect("gagal memuat session ONNX YOLOX-Nano");
        let dummy_rgb = vec![114u8; (in_w * in_h * 3) as usize];
        let dets = detect_rgb_frame(&mut session, &dummy_rgb, in_w, in_h, in_w, in_h)
            .expect("inferensi YOLOX-Nano pada frame dummy gagal");
        assert!(dets.len() < 100);
    }

    #[test]
    fn test_zero_phase_smoothing_preserves_motion_without_lag() {
        let linear: Vec<TrackingKeyframeDto> = (0..=8)
            .map(|i| TrackingKeyframeDto {
                time: i as f64 * 0.1,
                x: 0.1 + (i as f64) * 0.08,
                y: 0.5,
            })
            .collect();
        let smoothed = smooth_keyframes_zero_phase(linear.clone(), 0.55);
        assert_eq!(smoothed.len(), linear.len());
        // Midpoint of a constant-velocity ramp must stay unbiased (no trailing lag)
        let mid = &smoothed[4];
        assert!(
            (mid.x - linear[4].x).abs() < 0.01,
            "Zero-phase midpoint lagged: got {}, expected {}",
            mid.x,
            linear[4].x
        );
    }

    #[test]
    fn test_camera_pan_estimation_static_and_panning() {
        let w = 240u32;
        let h = 136u32;
        // Checkerboard + court line texture so SAD gradient is sharp
        let mut rgb1 = vec![40u8; (w * h * 3) as usize];
        for py in 20..115 {
            for px in 30..210 {
                let idx = ((py * w + px) * 3) as usize;
                let v = if ((px / 12) + (py / 12)) % 2 == 0 {
                    190
                } else {
                    65
                };
                rgb1[idx] = v;
                rgb1[idx + 1] = v;
                rgb1[idx + 2] = v;
            }
        }
        let g1 = downsample_luma_grid(&rgb1, w, h);
        let (dx0, dy0) = estimate_camera_pan(&g1, &g1);
        assert_eq!((dx0, dy0), (0.0, 0.0), "Static frames should produce 0 pan");

        // Shift entire background by +6 pixels in 240x136 (+3 grid steps in 120x68)
        let mut rgb2 = vec![40u8; (w * h * 3) as usize];
        for py in 20..115 {
            for px in 30..210 {
                let dst_x = (px + 6).min(w - 1);
                let idx = ((py * w + dst_x) * 3) as usize;
                let v = if ((px / 12) + (py / 12)) % 2 == 0 {
                    190
                } else {
                    65
                };
                rgb2[idx] = v;
                rgb2[idx + 1] = v;
                rgb2[idx + 2] = v;
            }
        }
        let g2 = downsample_luma_grid(&rgb2, w, h);
        let (dx, dy) = estimate_camera_pan(&g1, &g2);
        assert!(
            dx > 0.015 && dx < 0.04,
            "Expected positive pan dx ~ 0.025, got {}",
            dx
        );
        assert!(dy.abs() < 0.02, "Expected near-zero pan dy, got {}", dy);
    }

    #[test]
    fn test_spatial_ncc_rejects_wrong_jersey_and_tracks_moving_player() {
        let w = 240u32;
        let h = 135u32;
        let draw_player = |buf: &mut [u8], x0: i32, y0: i32, jersey: [u8; 3], shorts: [u8; 3]| {
            for py in y0..(y0 + 54) {
                if py < 0 || py >= h as i32 {
                    continue;
                }
                for px in x0..(x0 + 22) {
                    if px < 0 || px >= w as i32 {
                        continue;
                    }
                    let idx = ((py as u32 * w + px as u32) * 3) as usize;
                    let rel_y = py - y0;
                    let col = if rel_y < 10 {
                        [210, 175, 145] // head
                    } else if rel_y < 30 {
                        jersey
                    } else {
                        shorts
                    };
                    buf[idx] = col[0];
                    buf[idx + 1] = col[1];
                    buf[idx + 2] = col[2];
                }
            }
        };

        let mut rgb1 = vec![24u8; (w * h * 3) as usize];
        draw_player(&mut rgb1, 60, 40, [0, 220, 245], [15, 25, 45]);
        let target_box = DetectedObject {
            x: 60.0 / w as f32,
            y: 40.0 / h as f32,
            w: 22.0 / w as f32,
            h: 54.0 / h as f32,
            foot_x: 71.0 / w as f32,
            foot_y: 94.0 / h as f32,
            confidence: 0.9,
            class_id: 0,
            label: "Pemain".to_string(),
        };
        let sig = build_player_signature(&rgb1, w, h, &target_box);

        // Frame 2: cyan target moved +8px right, red opponent moved near original x=60
        let mut rgb2 = vec![24u8; (w * h * 3) as usize];
        draw_player(&mut rgb2, 68, 42, [0, 220, 245], [15, 25, 45]);
        draw_player(&mut rgb2, 56, 40, [225, 35, 35], [220, 220, 220]);

        let wrong_cand = DetectedObject {
            x: 56.0 / w as f32,
            y: 40.0 / h as f32,
            w: 22.0 / w as f32,
            h: 54.0 / h as f32,
            foot_x: 67.0 / w as f32,
            foot_y: 94.0 / h as f32,
            confidence: 0.9,
            class_id: 0,
            label: "Pemain".to_string(),
        };
        let (wrong_color, wrong_spatial) = score_appearance(&rgb2, w, h, &wrong_cand, &sig);
        assert!(
            wrong_color < 0.45,
            "Opponent color sim should be rejected: {}",
            wrong_color
        );

        let pred_box = shift_box(&target_box, 0.01, 0.0);
        let (found, score) = local_spatial_ncc_fallback_search(&rgb2, w, h, &pred_box, &sig, 0.08)
            .expect("Spatial NCC should track moving cyan player and ignore red opponent");
        assert!(score > 0.55 && wrong_spatial >= 0.0);
        assert!(found.foot_x > target_box.foot_x);
    }

    #[test]
    fn test_guided_bridge_interpolation_passes_through_anchors() {
        let times = vec![0.0, 0.1, 0.2, 0.3, 0.4];
        let mut fwd = vec![None; 5];
        let mut bwd = vec![None; 5];
        fwd[1] = Some(TrackingKeyframeDto {
            time: 0.1,
            x: 0.20,
            y: 0.30,
        });
        bwd[1] = Some(TrackingKeyframeDto {
            time: 0.1,
            x: 0.24,
            y: 0.30,
        });
        fwd[2] = Some(TrackingKeyframeDto {
            time: 0.2,
            x: 0.30,
            y: 0.40,
        });
        bwd[2] = Some(TrackingKeyframeDto {
            time: 0.2,
            x: 0.34,
            y: 0.40,
        });

        let seg = blend_guided_segment((0, 0.10, 0.20), (4, 0.50, 0.60), &fwd, &bwd, &times);
        assert_eq!(seg.len(), 5);
        assert!((seg[0].x - 0.10).abs() < 1e-6 && (seg[0].y - 0.20).abs() < 1e-6);
        assert!((seg[4].x - 0.50).abs() < 1e-6 && (seg[4].y - 0.60).abs() < 1e-6);
        // At midpoint u=0.5, cosine blend is exact 50/50 average -> x=0.32
        assert!(
            (seg[2].x - 0.32).abs() < 1e-4,
            "Midpoint blend got {}",
            seg[2].x
        );
        // At index 3 where both maps are None, linear fallback yields x=0.40
        assert!((seg[3].x - 0.40).abs() < 1e-4);
    }

    #[test]
    fn test_yolox_s_sahi_on_real_futsal_screenshot() {
        let img_path = Path::new(
            r"C:\Users\Fahlefi Achmad Reza\.gemini\antigravity\brain\9b98d91f-4bae-4d5d-aa3b-0b8f2369424a\.user_uploaded\media_1795586744524_3c69cff1.jpg",
        );
        if !img_path.exists() {
            println!("Skipping screenshot test: fixture not found");
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
                "scale=1920:1080",
                "-f",
                "rawvideo",
                "-pix_fmt",
                "rgb24",
                "-",
            ])
            .output()
            .expect("gagal decode screenshot jpg dengan ffmpeg");
        assert!(out.status.success(), "ffmpeg decode screenshot gagal");
        let expected_bytes = (1920 * 1080 * 3) as usize;
        assert!(
            out.stdout.len() >= expected_bytes,
            "ukuran buffer RGB tidak cukup: {}",
            out.stdout.len()
        );

        let model_path = resolve_yolox_model_path(None).expect("model ONNX harus tersedia");
        println!("Using ONNX model: {}", model_path.display());
        let t0 = std::time::Instant::now();
        let dets = with_yolox_session(&model_path, |session, in_w, in_h| {
            detect_rgb_frame_sahi_tiled(
                session,
                &out.stdout[..expected_bytes],
                1920,
                1080,
                in_w,
                in_h,
                0.22,
                0.20,
            )
        })
        .expect("SAHI detection pada screenshot gagal");
        let elapsed_ms = t0.elapsed().as_millis();

        let players: Vec<&DetectedObject> = dets.iter().filter(|d| d.class_id == 0).collect();
        println!(
            "SAHI 1080p detected {} players (total {} objs) in {} ms",
            players.len(),
            dets.len(),
            elapsed_ms
        );
        for (idx, p) in players.iter().enumerate() {
            println!(
                "  #P{}: x={:.3} y={:.3} w={:.3} h={:.3} foot=({:.3},{:.3}) conf={:.3}",
                idx + 1,
                p.x,
                p.y,
                p.w,
                p.h,
                p.foot_x,
                p.foot_y,
                p.confidence
            );
        }

        let red_box_hit = players
            .iter()
            .any(|p| p.foot_x >= 0.64 && p.foot_x <= 0.72 && p.foot_y >= 0.64 && p.foot_y <= 0.77);
        assert!(
            players.len() >= 10,
            "Harap deteksi minimal 10 pemain di frame, dapat: {}",
            players.len()
        );
        assert!(
            red_box_hit,
            "Pemain biru di kotak merah (foot_x 0.64..0.72, foot_y 0.64..0.77) harus terdeteksi!"
        );
    }
}

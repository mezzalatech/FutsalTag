use crate::ffmpeg;
use ort::environment::Environment;
use ort::session::Session;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::OnceLock;
use tauri::Manager;

static ORT_ENV: OnceLock<Environment> = OnceLock::new();

fn get_ort_env() -> Result<&'static Environment, String> {
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

pub fn resolve_yolox_model_path(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    if let Some(handle) = app {
        if let Ok(res_dir) = handle.path().resource_dir() {
            for rel in ["resources/models/yolox_nano.onnx", "models/yolox_nano.onnx", "yolox_nano.onnx"] {
                let p = res_dir.join(rel);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for p in [
        manifest_dir.join("resources/models/yolox_nano.onnx"),
        PathBuf::from("src-tauri/resources/models/yolox_nano.onnx"),
        PathBuf::from("resources/models/yolox_nano.onnx"),
    ] {
        if p.exists() {
            return Some(p);
        }
    }
    None
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
    if union <= 1e-6 {
        0.0
    } else {
        inter / union
    }
}

fn nms(mut dets: Vec<RawDet>, iou_thresh: f32) -> Vec<RawDet> {
    dets.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));
    let mut keep = Vec::new();
    let mut suppressed = vec![false; dets.len()];
    for i in 0..dets.len() {
        if suppressed[i] {
            continue;
        }
        keep.push(dets[i].clone());
        for j in (i + 1)..dets.len() {
            if !suppressed[j] && dets[i].class_id == dets[j].class_id && iou(&dets[i], &dets[j]) > iou_thresh {
                suppressed[j] = true;
            }
        }
    }
    keep
}

pub fn detect_rgb_frame(
    session: &mut Session,
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    in_w: u32,
    in_h: u32,
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

    // Letterbox bilinear-nearest resize RGB -> BGR NCHW [0..255]
    for y in 0..resized_h {
        let src_y = (((y as f32) / ratio) as u32).min(frame_h - 1);
        for x in 0..resized_w {
            let src_x = (((x as f32) / ratio) as u32).min(frame_w - 1);
            let src_idx = ((src_y * frame_w + src_x) * 3) as usize;
            let dst_idx = (y * in_w + x) as usize;
            let r = rgb[src_idx] as f32;
            let g = rgb[src_idx + 1] as f32;
            let b = rgb[src_idx + 2] as f32;
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
        if obj_conf < 0.15 {
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

        let (chosen_cls, chosen_score) = if person_score >= 0.35 && person_score >= ball_score {
            (0i32, person_score)
        } else if ball_score >= 0.25 {
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

struct ActiveTrack {
    id: usize,
    class_id: i32,
    last_box: DetectedObject,
    missed_frames: usize,
    torso_colors: Vec<[f32; 3]>,
    keyframes: Vec<TrackingKeyframeDto>,
}

fn box_iou_norm(a: &DetectedObject, b: &DetectedObject) -> f32 {
    let ix1 = a.x.max(b.x);
    let iy1 = a.y.max(b.y);
    let ix2 = (a.x + a.w).min(b.x + b.w);
    let iy2 = (a.y + a.h).min(b.y + b.h);
    let inter = (ix2 - ix1).max(0.0) * (iy2 - iy1).max(0.0);
    let union = a.w * a.h + b.w * b.h - inter;
    if union <= 1e-6 {
        0.0
    } else {
        inter / union
    }
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

fn smooth_keyframes(kfs: Vec<TrackingKeyframeDto>, alpha: f64) -> Vec<TrackingKeyframeDto> {
    if kfs.len() <= 1 {
        return kfs;
    }
    let mut out = Vec::with_capacity(kfs.len());
    let mut sx = kfs[0].x;
    let mut sy = kfs[0].y;
    out.push(kfs[0].clone());
    for kf in kfs.into_iter().skip(1) {
        sx = sx * (1.0 - alpha) + kf.x * alpha;
        sy = sy * (1.0 - alpha) + kf.y * alpha;
        out.push(TrackingKeyframeDto {
            time: (kf.time * 1000.0).round() / 1000.0,
            x: sx,
            y: sy,
        });
    }
    out
}

#[tauri::command]
pub fn check_ai_model_status(app: tauri::AppHandle) -> AiModelStatus {
    match resolve_yolox_model_path(Some(&app)) {
        Some(path) => match load_yolox_session(&path) {
            Ok((_, in_w, in_h)) => AiModelStatus {
                available: true,
                model_path: Some(path.to_string_lossy().to_string()),
                engine: "ONNX Runtime (YOLOX-Nano)".to_string(),
                input_size: [in_w, in_h],
            },
            Err(err) => AiModelStatus {
                available: false,
                model_path: Some(format!("Error: {}", err)),
                engine: "ONNX Runtime".to_string(),
                input_size: [416, 416],
            },
        },
        None => AiModelStatus {
            available: false,
            model_path: None,
            engine: "ONNX Runtime (model belum ditemukan)".to_string(),
            input_size: [416, 416],
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
        .ok_or_else(|| "Model ONNX yolox_nano.onnx tidak ditemukan.".to_string())?;
    let (mut session, in_w, in_h) = load_yolox_session(&model_path)?;
    let frames = ffmpeg::extract_rgb_frames(&input_path, time_sec, time_sec + 0.25, 4.0, 640, 360)?;
    let (_, rgb) = frames
        .first()
        .ok_or_else(|| "Gagal mengekstrak frame video pada timestamp tersebut".to_string())?;
    detect_rgb_frame(&mut session, rgb, 640, 360, in_w, in_h)
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
        .ok_or_else(|| "Model ONNX yolox_nano.onnx tidak ditemukan.".to_string())?;
    let (mut session, in_w, in_h) = load_yolox_session(&model_path)?;

    let frame_w = 640u32;
    let frame_h = 360u32;
    let sample_fps = fps.unwrap_or(8.0).clamp(2.0, 20.0);
    let frames = ffmpeg::extract_rgb_frames(&input_path, start_sec, end_sec, sample_fps, frame_w, frame_h)?;

    if frames.is_empty() {
        return Err("Tidak ada frame yang berhasil diekstrak dari rentang klip ini.".to_string());
    }

    let mut tracks: Vec<ActiveTrack> = Vec::new();
    let mut next_id = 1usize;

    for (t, rgb) in &frames {
        let dets = detect_rgb_frame(&mut session, rgb, frame_w, frame_h, in_w, in_h)?;

        let mut matched_track = vec![false; tracks.len()];
        let mut matched_det = vec![false; dets.len()];

        // Build candidate pairs sorted by matching score (IoU + proximity)
        let mut candidates: Vec<(usize, usize, f32)> = Vec::new();
        for (ti, tr) in tracks.iter().enumerate() {
            if tr.missed_frames > 5 {
                continue;
            }
            for (di, det) in dets.iter().enumerate() {
                if tr.class_id != det.class_id {
                    continue;
                }
                let iou_val = box_iou_norm(&tr.last_box, det);
                let dist = ((tr.last_box.foot_x - det.foot_x).powi(2)
                    + (tr.last_box.foot_y - det.foot_y).powi(2))
                .sqrt();
                if iou_val > 0.12 || dist < 0.10 {
                    let score = iou_val * 2.0 + (0.12 - dist).max(0.0);
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
            tr.last_box = det.clone();
            tr.missed_frames = 0;
            if det.class_id == 0 {
                tr.torso_colors.push(sample_torso_rgb(rgb, frame_w, frame_h, det));
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
            }
        }

        for (di, det) in dets.iter().enumerate() {
            if matched_det[di] {
                continue;
            }
            let mut torso_colors = Vec::new();
            if det.class_id == 0 {
                torso_colors.push(sample_torso_rgb(rgb, frame_w, frame_h, det));
            }
            tracks.push(ActiveTrack {
                id: next_id,
                class_id: det.class_id,
                last_box: det.clone(),
                missed_frames: 0,
                torso_colors,
                keyframes: vec![TrackingKeyframeDto {
                    time: *t,
                    x: det.foot_x as f64,
                    y: det.foot_y as f64,
                }],
            });
            next_id += 1;
        }
    }

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
            keyframes: smooth_keyframes(tr.keyframes, 0.55),
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
            keyframes: smooth_keyframes(ball_tr.keyframes, 0.65),
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
            missed_frames: t.missed_frames,
            torso_colors: t.torso_colors.clone(),
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
}

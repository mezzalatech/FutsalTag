use crate::ai_tracker::{
    detect_rgb_frame_sahi_tiled, detect_rgb_frame_with_thresh, get_ort_env,
    resolve_yolox_model_path, with_yolox_session, DetectedObject,
};
use crate::ffmpeg;
use base64::prelude::*;
use ort::session::Session;
use ort::value::Tensor;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};
use std::sync::{Mutex, OnceLock};
use tauri::Manager;

const SEG_MODEL_NAME: &str = "u2netp.onnx";
static SEG_SESSION_CACHE: OnceLock<Mutex<Option<(PathBuf, Session, u32, u32)>>> = OnceLock::new();

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SegModelStatus {
    pub available: bool,
    pub model_path: Option<String>,
    pub engine: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PlayerSilhouetteMaskDto {
    pub time: f64,
    pub width: u32,
    pub height: u32,
    pub alpha_base64: String,
    pub player_count: usize,
    pub boxes: Vec<DetectedObject>,
}

pub fn resolve_seg_model_path(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    if let Some(handle) = app {
        if let Ok(res_dir) = handle.path().resource_dir() {
            for rel in [
                format!("resources/models/{}", SEG_MODEL_NAME),
                format!("models/{}", SEG_MODEL_NAME),
                SEG_MODEL_NAME.to_string(),
            ] {
                let p = res_dir.join(rel);
                if p.exists() {
                    return Some(p);
                }
            }
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for p in [
        manifest_dir.join(format!("resources/models/{}", SEG_MODEL_NAME)),
        PathBuf::from(format!("src-tauri/resources/models/{}", SEG_MODEL_NAME)),
        PathBuf::from(format!("resources/models/{}", SEG_MODEL_NAME)),
    ] {
        if p.exists() {
            return Some(p);
        }
    }
    None
}

fn load_seg_session(model_path: &Path) -> Result<(Session, u32, u32), String> {
    let env = get_ort_env()?;
    let session = Session::builder(env)
        .map_err(|e| format!("Gagal membuat ONNX session builder segmentasi: {}", e))?
        .commit_from_file(model_path)
        .map_err(|e| format!("Gagal memuat model segmentasi '{}': {}", model_path.display(), e))?;

    let (mut in_h, mut in_w) = (320u32, 320u32);
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

pub(crate) fn with_seg_session<T, F>(model_path: &Path, f: F) -> Result<T, String>
where
    F: FnOnce(&mut Session, u32, u32) -> Result<T, String>,
{
    let cache_lock = SEG_SESSION_CACHE.get_or_init(|| Mutex::new(None));
    let mut guard = cache_lock
        .lock()
        .map_err(|_| "Mutex cache ONNX segmentasi terkunci".to_string())?;
    let needs_reload = match guard.as_ref() {
        Some((cached_path, _, _, _)) => cached_path != model_path,
        None => true,
    };
    if needs_reload {
        let (sess, in_w, in_h) = load_seg_session(model_path)?;
        *guard = Some((model_path.to_path_buf(), sess, in_w, in_h));
    }
    let (_, session, in_w, in_h) = guard
        .as_mut()
        .ok_or_else(|| "Gagal mengambil session cache segmentasi".to_string())?;
    f(session, *in_w, *in_h)
}

fn compute_tight_bounds(obj: &DetectedObject) -> (f32, f32, f32, f32) {
    let pad_x = obj.w * 0.14;
    let pad_y = obj.h * 0.08;
    let x1 = (obj.x - pad_x).clamp(0.0, 0.99);
    let y1 = (obj.y - pad_y).clamp(0.0, 0.99);
    let x2 = (obj.x + obj.w + pad_x).clamp(x1 + 0.005, 1.0);
    let y2 = (obj.y + obj.h + pad_y).clamp(y1 + 0.005, 1.0);
    (x1, y1, x2, y2)
}

pub fn segment_players_on_rgb_frame(
    seg_session: &mut Session,
    rgb: &[u8],
    frame_w: u32,
    frame_h: u32,
    boxes: &[DetectedObject],
    mask_w: u32,
    mask_h: u32,
    in_w: u32,
    in_h: u32,
) -> Result<Vec<u8>, String> {
    let mut mask = vec![0u8; (mask_w * mask_h) as usize];
    if frame_w < 2 || frame_h < 2 || mask_w == 0 || mask_h == 0 || in_w == 0 || in_h == 0 {
        return Ok(mask);
    }

    let input_name = seg_session
        .inputs()
        .first()
        .map(|i| i.name().to_string())
        .unwrap_or_else(|| "input.1".to_string());

    let plane_size = (in_w * in_h) as usize;
    let fw_f = frame_w as f32;
    let fh_f = frame_h as f32;
    let fw_max = (frame_w - 1) as f32;
    let fh_max = (frame_h - 1) as f32;

    for obj in boxes.iter().filter(|b| b.class_id == 0) {
        let bx = obj.x * fw_f;
        let by = obj.y * fh_f;
        let bw = obj.w * fw_f;
        let bh = obj.h * fh_f;
        if bw < 4.0 || bh < 6.0 {
            continue;
        }

        // Aspect-ratio-preserving square crop centered on player
        let cx = bx + bw * 0.5;
        let cy = by + bh * 0.5;
        let side = (bw * 1.75).max(bh * 1.32).max(24.0);
        let crop_x1 = cx - side * 0.5;
        let crop_y1 = cy - side * 0.5;

        // Bilinearly sample square crop into 1 x 3 x in_h x in_w RGB NCHW with ImageNet norm
        let mut nchw = vec![0.0f32; plane_size * 3];
        for ry in 0..in_h {
            let src_y = (crop_y1 + ((ry as f32 + 0.5) / in_h as f32) * side - 0.5).clamp(0.0, fh_max);
            let y0 = src_y.floor() as u32;
            let y1 = (y0 + 1).min(frame_h - 1);
            let wy = src_y - y0 as f32;
            let wy0 = 1.0 - wy;

            for rx in 0..in_w {
                let src_x =
                    (crop_x1 + ((rx as f32 + 0.5) / in_w as f32) * side - 0.5).clamp(0.0, fw_max);
                let x0 = src_x.floor() as u32;
                let x1 = (x0 + 1).min(frame_w - 1);
                let wx = src_x - x0 as f32;
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

                let dst = (ry * in_w + rx) as usize;
                nchw[dst] = (r / 255.0 - 0.485) / 0.229;
                nchw[plane_size + dst] = (g / 255.0 - 0.456) / 0.224;
                nchw[plane_size * 2 + dst] = (b / 255.0 - 0.406) / 0.225;
            }
        }

        let tensor = Tensor::from_array((
            [1usize, 3usize, in_h as usize, in_w as usize],
            nchw.into_boxed_slice(),
        ))
        .map_err(|e| format!("Gagal membuat tensor segmentasi U2NetP: {}", e))?;

        let outputs = seg_session
            .run(ort::inputs![input_name.as_str() => tensor])
            .map_err(|e| format!("Inferensi U2NetP gagal: {}", e))?;

        let (shape, data) = outputs[0]
            .try_extract_tensor::<f32>()
            .map_err(|e| format!("Gagal membaca output tensor U2NetP: {}", e))?;

        let dims: Vec<usize> = shape.iter().map(|&d| d as usize).collect();
        let (out_h, out_w) = if dims.len() == 4 {
            (dims[2], dims[3])
        } else if dims.len() == 3 {
            (dims[1], dims[2])
        } else {
            return Err(format!("Bentuk output U2NetP tidak dikenali: {:?}", dims));
        };

        let out_plane = out_h * out_w;
        let mut raw_min = f32::INFINITY;
        let mut raw_max = f32::NEG_INFINITY;
        for &v in &data[..out_plane] {
            if v < raw_min {
                raw_min = v;
            }
            if v > raw_max {
                raw_max = v;
            }
        }
        let needs_sigmoid = raw_min < -0.01 || raw_max > 1.01;

        let mut probs = vec![0.0f32; out_plane];
        let mut min_v = f32::INFINITY;
        let mut max_v = f32::NEG_INFINITY;
        for i in 0..out_plane {
            let p = if needs_sigmoid {
                1.0 / (1.0 + (-data[i]).exp())
            } else {
                data[i]
            };
            probs[i] = p;
            if p < min_v {
                min_v = p;
            }
            if p > max_v {
                max_v = p;
            }
        }

        if max_v < 0.20 {
            continue;
        }
        let span_v = (max_v - min_v).max(1e-5);

        let mut crop_alpha = vec![0.0f32; out_plane];
        for i in 0..out_plane {
            let p = ((probs[i] - min_v) / span_v).clamp(0.0, 1.0);
            let soft = if p <= 0.30 {
                0.0
            } else if p >= 0.65 {
                1.0
            } else {
                let t = (p - 0.30) / 0.35;
                t * t * (3.0 - 2.0 * t)
            };
            crop_alpha[i] = soft * 255.0;
        }

        // Composite ONLY inside the player's tight padded bounding box onto mask_w x mask_h
        let (nx1, ny1, nx2, ny2) = compute_tight_bounds(obj);
        let mx1 = ((nx1 * mask_w as f32).floor() as i32).clamp(0, mask_w as i32 - 1) as u32;
        let my1 = ((ny1 * mask_h as f32).floor() as i32).clamp(0, mask_h as i32 - 1) as u32;
        let mx2 = ((nx2 * mask_w as f32).ceil() as i32).clamp(mx1 as i32 + 1, mask_w as i32) as u32;
        let my2 = ((ny2 * mask_h as f32).ceil() as i32).clamp(my1 as i32 + 1, mask_h as i32) as u32;

        let ow_max = (out_w.saturating_sub(1)) as f32;
        let oh_max = (out_h.saturating_sub(1)) as f32;

        for my in my1..my2 {
            let fy = ((my as f32 + 0.5) / mask_h as f32) * fh_f;
            let cy_f = (((fy - crop_y1) / side) * out_h as f32 - 0.5).clamp(0.0, oh_max);
            let y0 = cy_f.floor() as usize;
            let y1 = (y0 + 1).min(out_h - 1);
            let wy = cy_f - y0 as f32;
            let wy0 = 1.0 - wy;

            for mx in mx1..mx2 {
                let fx = ((mx as f32 + 0.5) / mask_w as f32) * fw_f;
                let cx_f = (((fx - crop_x1) / side) * out_w as f32 - 0.5).clamp(0.0, ow_max);
                let x0 = cx_f.floor() as usize;
                let x1 = (x0 + 1).min(out_w - 1);
                let wx = cx_f - x0 as f32;
                let wx0 = 1.0 - wx;

                let a = crop_alpha[y0 * out_w + x0] * (wy0 * wx0)
                    + crop_alpha[y0 * out_w + x1] * (wy0 * wx)
                    + crop_alpha[y1 * out_w + x0] * (wy * wx0)
                    + crop_alpha[y1 * out_w + x1] * (wy * wx);
                let a_u8 = a.round().clamp(0.0, 255.0) as u8;
                let idx = (my * mask_w + mx) as usize;
                if a_u8 > mask[idx] {
                    mask[idx] = a_u8;
                }
            }
        }
    }

    Ok(mask)
}

#[tauri::command]
pub async fn check_seg_model_status(app: tauri::AppHandle) -> Result<SegModelStatus, String> {
    tauri::async_runtime::spawn_blocking(move || check_seg_model_status_blocking(app))
        .await
        .map_err(|e| format!("AI worker terhenti: {}", e))
}

fn check_seg_model_status_blocking(app: tauri::AppHandle) -> SegModelStatus {
    match resolve_seg_model_path(Some(&app)) {
        Some(path) => match with_seg_session(&path, |_, in_w, in_h| Ok((in_w, in_h))) {
            Ok((in_w, in_h)) => SegModelStatus {
                available: true,
                model_path: Some(path.to_string_lossy().to_string()),
                engine: format!("U2NetP ONNX ({}x{})", in_w, in_h),
            },
            Err(err) => SegModelStatus {
                available: false,
                model_path: Some(format!("Error: {}", err)),
                engine: "U2NetP ONNX (gagal dimuat)".to_string(),
            },
        },
        None => SegModelStatus {
            available: false,
            model_path: None,
            engine: "U2NetP ONNX (belum ditemukan)".to_string(),
        },
    }
}

#[tauri::command]
pub async fn segment_players_in_frame_onnx(
    app: tauri::AppHandle,
    input_path: String,
    time_sec: f64,
) -> Result<PlayerSilhouetteMaskDto, String> {
    tauri::async_runtime::spawn_blocking(move || {
        segment_players_in_frame_onnx_blocking(app, input_path, time_sec)
    })
    .await
    .map_err(|e| format!("AI worker terhenti: {}", e))?
}

fn segment_players_in_frame_onnx_blocking(
    app: tauri::AppHandle,
    input_path: String,
    time_sec: f64,
) -> Result<PlayerSilhouetteMaskDto, String> {
    let yolox_path = resolve_yolox_model_path(Some(&app))
        .ok_or_else(|| "Model YOLOX tidak ditemukan.".to_string())?;
    let seg_path = resolve_seg_model_path(Some(&app))
        .ok_or_else(|| "Model segmentasi U2NetP ONNX tidak ditemukan.".to_string())?;

    let frame_w = 1920u32;
    let frame_h = 1080u32;
    let mask_w = 480u32;
    let mask_h = 270u32;

    let frames = ffmpeg::extract_rgb_frames(
        &input_path,
        time_sec,
        time_sec + 0.25,
        4.0,
        frame_w,
        frame_h,
    )?;
    let (actual_t, rgb) = frames
        .first()
        .ok_or_else(|| "Gagal mengekstrak frame untuk segmentasi.".to_string())?;

    let boxes = with_yolox_session(&yolox_path, |session, in_w, in_h| {
        detect_rgb_frame_sahi_tiled(session, rgb, frame_w, frame_h, in_w, in_h, 0.22, 0.20)
    })?;
    let player_count = boxes.iter().filter(|b| b.class_id == 0).count();

    let alpha = with_seg_session(&seg_path, |seg_session, seg_w, seg_h| {
        segment_players_on_rgb_frame(
            seg_session,
            rgb,
            frame_w,
            frame_h,
            &boxes,
            mask_w,
            mask_h,
            seg_w,
            seg_h,
        )
    })?;

    Ok(PlayerSilhouetteMaskDto {
        time: *actual_t,
        width: mask_w,
        height: mask_h,
        alpha_base64: BASE64_STANDARD.encode(&alpha),
        player_count,
        boxes,
    })
}

#[tauri::command]
pub async fn segment_players_range_onnx(
    app: tauri::AppHandle,
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    fps: Option<f64>,
) -> Result<Vec<PlayerSilhouetteMaskDto>, String> {
    tauri::async_runtime::spawn_blocking(move || {
        segment_players_range_onnx_blocking(app, input_path, start_sec, end_sec, fps)
    })
    .await
    .map_err(|e| format!("AI worker terhenti: {}", e))?
}

fn segment_players_range_onnx_blocking(
    app: tauri::AppHandle,
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    fps: Option<f64>,
) -> Result<Vec<PlayerSilhouetteMaskDto>, String> {
    let yolox_path = resolve_yolox_model_path(Some(&app))
        .ok_or_else(|| "Model YOLOX tidak ditemukan.".to_string())?;
    let seg_path = resolve_seg_model_path(Some(&app))
        .ok_or_else(|| "Model segmentasi U2NetP ONNX tidak ditemukan.".to_string())?;

    let frame_w = 1280u32;
    let frame_h = 720u32;
    let mask_w = 480u32;
    let mask_h = 270u32;
    let sample_fps = fps.unwrap_or(8.0).clamp(1.0, 15.0);

    let frames = ffmpeg::extract_rgb_frames(
        &input_path,
        start_sec,
        end_sec,
        sample_fps,
        frame_w,
        frame_h,
    )?;

    let mut frame_boxes: Vec<(f64, Vec<DetectedObject>)> = Vec::with_capacity(frames.len());
    with_yolox_session(&yolox_path, |session, in_w, in_h| {
        for (t, rgb) in &frames {
            let boxes = detect_rgb_frame_with_thresh(
                session, rgb, frame_w, frame_h, in_w, in_h, 0.22, 0.20,
            )?;
            frame_boxes.push((*t, boxes));
        }
        Ok(())
    })?;

    with_seg_session(&seg_path, |seg_session, seg_w, seg_h| {
        let mut out = Vec::with_capacity(frames.len());
        for (idx, (_, rgb)) in frames.iter().enumerate() {
            let (t, boxes) = &frame_boxes[idx];
            let player_count = boxes.iter().filter(|b| b.class_id == 0).count();
            let alpha = segment_players_on_rgb_frame(
                seg_session,
                rgb,
                frame_w,
                frame_h,
                boxes,
                mask_w,
                mask_h,
                seg_w,
                seg_h,
            )?;
            out.push(PlayerSilhouetteMaskDto {
                time: *t,
                width: mask_w,
                height: mask_h,
                alpha_base64: BASE64_STANDARD.encode(&alpha),
                player_count,
                boxes: boxes.clone(),
            });
        }
        Ok(out)
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_u2netp_on_real_futsal_screenshot() {
        let img_path = Path::new(
            r"C:\Users\Fahlefi Achmad Reza\.gemini\antigravity\brain\9b98d91f-4bae-4d5d-aa3b-0b8f2369424a\.user_uploaded\media_1795586744524_3c69cff1.jpg",
        );
        if !img_path.exists() {
            println!("Skipping screenshot segmentation test: fixture not found");
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
        assert!(out.stdout.len() >= expected_bytes);
        let rgb = &out.stdout[..expected_bytes];

        let yolox_path = resolve_yolox_model_path(None).expect("YOLOX model harus ada");
        let seg_path = resolve_seg_model_path(None).expect("U2NetP model harus ada");

        let dets = with_yolox_session(&yolox_path, |session, in_w, in_h| {
            detect_rgb_frame_sahi_tiled(session, rgb, 1920, 1080, in_w, in_h, 0.22, 0.20)
        })
        .expect("SAHI detection gagal");
        let players: Vec<DetectedObject> = dets.into_iter().filter(|d| d.class_id == 0).collect();
        assert!(players.len() >= 8, "Minimal 8 pemain terdeteksi, dapat: {}", players.len());

        let mask_w = 480u32;
        let mask_h = 270u32;
        let t0 = std::time::Instant::now();
        let mask = with_seg_session(&seg_path, |seg_session, seg_w, seg_h| {
            segment_players_on_rgb_frame(
                seg_session,
                rgb,
                1920,
                1080,
                &players,
                mask_w,
                mask_h,
                seg_w,
                seg_h,
            )
        })
        .expect("Segmentasi U2NetP gagal");
        let elapsed_ms = t0.elapsed().as_millis();

        let nonzero = mask.iter().filter(|&&a| a >= 64).count();
        let masked_ratio = nonzero as f64 / mask.len() as f64;
        println!(
            "U2NetP: {} players segmented into {}x{} in {} ms (masked_ratio={:.2}%)",
            players.len(),
            mask_w,
            mask_h,
            elapsed_ms,
            masked_ratio * 100.0
        );
        assert!(
            masked_ratio > 0.003 && masked_ratio < 0.20,
            "Rasio area siluet tidak wajar: {:.4}",
            masked_ratio
        );

        let mut core_sum = 0u64;
        let mut core_cnt = 0u64;
        for p in &players {
            let x1 = ((p.x + p.w * 0.30) * mask_w as f32).round().clamp(0.0, mask_w as f32 - 1.0) as u32;
            let x2 = ((p.x + p.w * 0.70) * mask_w as f32).round().clamp(x1 as f32 + 1.0, mask_w as f32) as u32;
            let y1 = ((p.y + p.h * 0.25) * mask_h as f32).round().clamp(0.0, mask_h as f32 - 1.0) as u32;
            let y2 = ((p.y + p.h * 0.80) * mask_h as f32).round().clamp(y1 as f32 + 1.0, mask_h as f32) as u32;
            for my in y1..y2 {
                for mx in x1..x2 {
                    core_sum += mask[(my * mask_w + mx) as usize] as u64;
                    core_cnt += 1;
                }
            }
        }
        let core_mean = if core_cnt > 0 { core_sum as f64 / core_cnt as f64 } else { 0.0 };
        println!("U2NetP core player alpha mean: {:.1}", core_mean);
        assert!(core_mean >= 80.0, "Alpha tengah tubuh pemain terlalu rendah: {:.1}", core_mean);

        let mut glossy_checked = false;
        'outer: for gy in 180..220u32 {
            let ny = gy as f32 / mask_h as f32;
            for gx in 210..290u32 {
                let nx = gx as f32 / mask_w as f32;
                let inside_any = players.iter().any(|p| {
                    let (x1, y1, x2, y2) = compute_tight_bounds(p);
                    nx >= x1 && nx <= x2 && ny >= y1 && ny <= y2
                });
                if !inside_any {
                    let val = mask[(gy * mask_w + gx) as usize];
                    assert_eq!(val, 0, "Pantulan lantai di luar kotak pemain harus bernilai 0, dapat {}", val);
                    glossy_checked = true;
                    break 'outer;
                }
            }
        }
        assert!(glossy_checked, "Harus ada titik lantai mengilap di luar bounding box pemain");
    }
}

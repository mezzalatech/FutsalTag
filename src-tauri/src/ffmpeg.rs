use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct VideoInfo {
    pub width: u32,
    pub height: u32,
    pub fps: f64,
    pub duration: f64,
    pub has_audio: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FreezeStopSpec {
    pub time: f64,
    pub duration: f64,
    pub overlay_base64: Option<String>,
}

/// Normalize explicit multi freeze-frame stops or fall back to single legacy freeze parameters.
fn normalize_freeze_stops(
    stops: Option<Vec<FreezeStopSpec>>,
    fallback_time: f64,
    fallback_dur: f64,
    fallback_overlay: Option<String>,
    start_sec: f64,
    end_sec: f64,
) -> Vec<FreezeStopSpec> {
    if let Some(list) = stops {
        if !list.is_empty() {
            let mut valid: Vec<FreezeStopSpec> = list
                .into_iter()
                .filter(|s| s.duration >= 0.2)
                .map(|mut s| {
                    s.time = s.time.clamp(start_sec, end_sec);
                    s
                })
                .collect();
            valid.sort_by(|a, b| a.time.total_cmp(&b.time));
            let mut deduped: Vec<FreezeStopSpec> = Vec::with_capacity(valid.len());
            for stop in valid {
                if let Some(prev) = deduped.last() {
                    if (stop.time - prev.time).abs() <= 0.05 {
                        continue;
                    }
                }
                deduped.push(stop);
            }
            return deduped;
        }
    }
    if fallback_dur >= 0.2 {
        return vec![FreezeStopSpec {
            time: fallback_time.clamp(start_sec, end_sec),
            duration: fallback_dur,
            overlay_base64: fallback_overlay,
        }];
    }
    Vec::new()
}

fn render_freeze_segment_ffmpeg(
    input_path: &str,
    freeze_sec: f64,
    pause_duration: f64,
    overlay_path: Option<&PathBuf>,
    out_w: u32,
    out_h: u32,
    camera_zoom: Option<[f64; 3]>,
    out_file_path: &str,
) -> Result<(), String> {
    let (vcodec, vflags) = detect_video_encoder();
    let zoom_vf = build_camera_zoom_vf(out_w, out_h, camera_zoom);

    let mut args = vec![
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", freeze_sec),
        "-i".into(),
        input_path.to_string(),
    ];

    if let Some(op) = overlay_path {
        let fc = format!(
            "[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1{zoom},tpad=stop_mode=clone:stop_duration={pd:.3}[bg];[1:v]scale={w}:{h}[fg];[bg][fg]overlay=0:0:shortest=1,fps=30,format=yuv420p[v]",
            w = out_w,
            h = out_h,
            zoom = zoom_vf,
            pd = pause_duration
        );
        args.extend([
            "-loop".into(),
            "1".into(),
            "-i".into(),
            op.to_string_lossy().to_string(),
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "anullsrc=channel_layout=stereo:sample_rate=44100".into(),
            "-filter_complex".into(),
            fc,
            "-map".into(),
            "[v]".into(),
            "-map".into(),
            "2:a:0".into(),
        ]);
    } else {
        let vf = format!(
            "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1{zoom},tpad=stop_mode=clone:stop_duration={pd:.3},fps=30,format=yuv420p",
            w = out_w,
            h = out_h,
            zoom = zoom_vf,
            pd = pause_duration
        );
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "anullsrc=channel_layout=stereo:sample_rate=44100".into(),
            "-vf".into(),
            vf,
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            "1:a:0".into(),
        ]);
    }

    args.extend([
        "-t".into(),
        format!("{:.3}", pause_duration),
        "-c:v".into(),
        vcodec.into(),
    ]);
    for f in vflags {
        args.push(f.into());
    }
    args.extend([
        "-c:a".into(),
        "aac".into(),
        "-ar".into(),
        "44100".into(),
        "-ac".into(),
        "2".into(),
        "-b:a".into(),
        "128k".into(),
        out_file_path.to_string(),
    ]);

    run_ffmpeg(&args)?;
    Ok(())
}

struct TempCleanup(Vec<PathBuf>);

impl Drop for TempCleanup {
    fn drop(&mut self) {
        for p in &self.0 {
            let _ = fs::remove_file(p);
        }
    }
}

pub fn resolve_bin(name: &str) -> String {
    let env_key = match name {
        "ffmpeg" => Some("FUTSALTAG_FFMPEG"),
        "ffprobe" => Some("FUTSALTAG_FFPROBE"),
        _ => None,
    };
    if let Some(key) = env_key {
        if let Ok(val) = std::env::var(key) {
            if !val.trim().is_empty() && Path::new(val.trim()).exists() {
                return val.trim().to_string();
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for candidate in [
                dir.join(name),
                dir.join(format!("{}.exe", name)),
                dir.join("resources").join("bin").join(name),
                dir.join("resources").join("bin").join(format!("{}.exe", name)),
                dir.join("resources").join("bin-macos").join(name),
                dir.join("bin").join(name),
                dir.join("bin").join(format!("{}.exe", name)),
            ] {
                if candidate.exists() {
                    return candidate.to_string_lossy().to_string();
                }
            }
            if let Some(contents_dir) = dir.parent() {
                let mac_res = contents_dir.join("Resources");
                for candidate in [
                    mac_res.join("resources").join("bin-macos").join(name),
                    mac_res.join("resources").join("bin").join(name),
                    mac_res.join("bin-macos").join(name),
                    mac_res.join("bin").join(name),
                ] {
                    if candidate.exists() {
                        return candidate.to_string_lossy().to_string();
                    }
                }
            }
        }
    }

    let manifest_res = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources");
    for candidate in [
        manifest_res.join("bin").join(name),
        manifest_res.join("bin").join(format!("{}.exe", name)),
        manifest_res.join("bin-macos").join(name),
    ] {
        if candidate.exists() {
            return candidate.to_string_lossy().to_string();
        }
    }

    for prefix in ["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin"] {
        let p = Path::new(prefix).join(name);
        if p.exists() {
            return p.to_string_lossy().to_string();
        }
    }

    name.to_string()
}

fn silent_command(program: &str) -> Command {
    let mut cmd = Command::new(program);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd
}

static ENCODER_CACHE: OnceLock<(&'static str, Vec<&'static str>)> = OnceLock::new();

pub fn detect_video_encoder() -> (&'static str, Vec<&'static str>) {
    ENCODER_CACHE
        .get_or_init(|| {
            let ffmpeg = resolve_bin("ffmpeg");
            let encoders_out = silent_command(&ffmpeg)
                .args(["-hide_banner", "-encoders"])
                .output();
            let list_txt = match encoders_out {
                Ok(out) => String::from_utf8_lossy(&out.stdout).to_string(),
                Err(_) => String::new(),
            };

            if cfg!(target_os = "macos") && list_txt.contains("h264_videotoolbox") {
                if test_encoder(&ffmpeg, "h264_videotoolbox") {
                    return ("h264_videotoolbox", vec!["-b:v", "6000k", "-allow_sw", "1"]);
                }
            }

            if cfg!(target_os = "windows") && list_txt.contains("h264_nvenc") {
                if test_encoder(&ffmpeg, "h264_nvenc") {
                    return ("h264_nvenc", vec!["-preset", "p4", "-cq", "22"]);
                }
            }

            ("libx264", vec!["-preset", "veryfast", "-crf", "22"])
        })
        .clone()
}

fn test_encoder(ffmpeg: &str, codec: &str) -> bool {
    silent_command(ffmpeg)
        .args([
            "-v",
            "error",
            "-f",
            "lavfi",
            "-i",
            "color=c=black:s=64x64:d=0.1",
            "-frames:v",
            "1",
            "-c:v",
            codec,
            "-f",
            "null",
            "-",
        ])
        .output()
        .map(|o| o.status.success())
        .unwrap_or(false)
}

fn ensure_parent_dir(path: &str) -> Result<(), String> {
    if let Some(parent) = Path::new(path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Gagal membuat folder output '{}': {}", parent.display(), e))?;
        }
    }
    Ok(())
}

pub fn run_ffmpeg(args: &[String]) -> Result<(), String> {
    let ffmpeg = resolve_bin("ffmpeg");
    let out = silent_command(&ffmpeg)
        .args(args)
        .output()
        .map_err(|e| format!("Gagal menjalankan FFmpeg ({}): {}", ffmpeg, e))?;

    if out.status.success() {
        Ok(())
    } else {
        let stderr = String::from_utf8_lossy(&out.stderr);
        let tail: Vec<&str> = stderr.lines().rev().take(8).collect();
        let summary = tail.into_iter().rev().collect::<Vec<_>>().join(" | ");
        Err(format!("FFmpeg gagal: {}", summary))
    }
}

pub fn probe_video_info(input_path: &str) -> Result<VideoInfo, String> {
    let ffprobe = resolve_bin("ffprobe");
    let out = silent_command(&ffprobe)
        .args([
            "-v",
            "error",
            "-print_format",
            "json",
            "-show_streams",
            "-show_format",
            input_path,
        ])
        .output()
        .map_err(|e| format!("Gagal menjalankan ffprobe ({}): {}", ffprobe, e))?;

    if !out.status.success() {
        return Err(format!(
            "ffprobe gagal membaca '{}': {}",
            input_path,
            String::from_utf8_lossy(&out.stderr).trim()
        ));
    }

    let val: serde_json::Value = serde_json::from_slice(&out.stdout)
        .map_err(|e| format!("Gagal parse JSON ffprobe: {}", e))?;

    let streams = val["streams"].as_array().cloned().unwrap_or_default();
    let mut width = 1920u32;
    let mut height = 1080u32;
    let mut fps = 30.0f64;
    let mut has_audio = false;

    for s in &streams {
        let codec_type = s["codec_type"].as_str().unwrap_or("");
        if codec_type == "video" {
            width = s["width"].as_u64().unwrap_or(1920) as u32;
            height = s["height"].as_u64().unwrap_or(1080) as u32;
            if let Some(rate_str) = s["r_frame_rate"].as_str() {
                if let Some((num, den)) = rate_str.split_once('/') {
                    let n: f64 = num.parse().unwrap_or(30.0);
                    let d: f64 = den.parse().unwrap_or(1.0);
                    if d > 0.0 && n > 0.0 {
                        fps = n / d;
                    }
                }
            }
        } else if codec_type == "audio" {
            has_audio = true;
        }
    }

    let duration = val["format"]["duration"]
        .as_str()
        .and_then(|s| s.parse::<f64>().ok())
        .unwrap_or(0.0);

    Ok(VideoInfo {
        width,
        height,
        fps,
        duration,
        has_audio,
    })
}

fn target_dimensions(target_height: Option<u32>) -> (u32, u32) {
    match target_height {
        Some(720) => (1280, 720),
        Some(h) if h > 0 => {
            let w = ((h as f64 * 16.0 / 9.0).round() as u32 / 2) * 2;
            (w.max(640), (h / 2) * 2)
        }
        _ => (1920, 1080),
    }
}

fn build_camera_zoom_vf(out_w: u32, out_h: u32, camera_zoom: Option<[f64; 3]>) -> String {
    let Some([cx, cy, scale]) = camera_zoom else {
        return String::new();
    };
    if !scale.is_finite() || scale <= 1.02 {
        return String::new();
    }
    let s = scale.clamp(1.05, 2.5);
    let cw = (((out_w as f64 / s).round() as u32) / 2 * 2).max(64).min(out_w);
    let ch = (((out_h as f64 / s).round() as u32) / 2 * 2).max(64).min(out_h);
    let max_x = out_w.saturating_sub(cw) as f64;
    let max_y = out_h.saturating_sub(ch) as f64;
    let x = ((cx.clamp(0.0, 1.0) * out_w as f64) - (cw as f64 / 2.0))
        .clamp(0.0, max_x)
        .round() as u32;
    let y = ((cy.clamp(0.0, 1.0) * out_h as f64) - (ch as f64 / 2.0))
        .clamp(0.0, max_y)
        .round() as u32;
    format!(",crop={}:{}:{}:{},scale={}:{}:flags=lanczos", cw, ch, x, y, out_w, out_h)
}

fn decode_base64_to_temp(b64: &str, prefix: &str, ext: &str) -> Result<PathBuf, String> {
    let clean = if let Some(idx) = b64.find("base64,") {
        &b64[idx + 7..]
    } else {
        b64
    };
    let bytes = BASE64_STANDARD
        .decode(clean.trim())
        .map_err(|e| format!("Gagal decode base64 {}: {}", prefix, e))?;
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let p = std::env::temp_dir().join(format!("{}_{}.{}", prefix, now, ext));
    fs::write(&p, bytes).map_err(|e| format!("Gagal menulis file temp {}: {}", prefix, e))?;
    Ok(p)
}

fn build_norm_segment_args(
    input_path: &str,
    out_path: &str,
    start_sec: f64,
    dur_sec: f64,
    out_w: u32,
    out_h: u32,
    has_audio: bool,
) -> Vec<String> {
    let (vcodec, vflags) = detect_video_encoder();
    let vf = format!(
        "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p",
        w = out_w,
        h = out_h
    );

    let mut args = vec![
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", start_sec),
        "-i".into(),
        input_path.into(),
    ];

    if !has_audio {
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "anullsrc=channel_layout=stereo:sample_rate=44100".into(),
        ]);
    }

    args.extend(["-t".into(), format!("{:.3}", dur_sec), "-vf".into(), vf]);
    args.extend(["-c:v".into(), vcodec.into()]);
    for f in vflags {
        args.push(f.into());
    }

    if has_audio {
        args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "0:a:0".into()]);
    } else {
        args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into()]);
    }

    args.extend([
        "-c:a".into(),
        "aac".into(),
        "-ar".into(),
        "44100".into(),
        "-ac".into(),
        "2".into(),
        "-b:a".into(),
        "128k".into(),
        "-movflags".into(),
        "+faststart".into(),
        out_path.into(),
    ]);
    args
}

#[tauri::command]
pub fn render_video_clip_ffmpeg(
    input_path: String,
    output_path: String,
    start_sec: f64,
    duration_sec: f64,
    fast_copy: Option<bool>,
    target_height: Option<u32>,
) -> Result<String, String> {
    if !Path::new(&input_path).exists() {
        return Err(format!("File video input tidak ditemukan: {}", input_path));
    }
    ensure_parent_dir(&output_path)?;

    let dur = duration_sec.max(0.2);
    let use_copy = fast_copy.unwrap_or(true) && target_height.is_none();

    if use_copy {
        let copy_args = vec![
            "-y".into(),
            "-ss".into(),
            format!("{:.3}", start_sec.max(0.0)),
            "-i".into(),
            input_path.clone(),
            "-t".into(),
            format!("{:.3}", dur),
            "-c".into(),
            "copy".into(),
            "-avoid_negative_ts".into(),
            "make_zero".into(),
            output_path.clone(),
        ];
        if run_ffmpeg(&copy_args).is_ok() {
            return Ok(output_path);
        }
    }

    let info = probe_video_info(&input_path)?;
    let (out_w, out_h) = match target_height {
        Some(_) => target_dimensions(target_height),
        None => (
            (info.width / 2 * 2).max(320),
            (info.height / 2 * 2).max(240),
        ),
    };
    let args = build_norm_segment_args(
        &input_path,
        &output_path,
        start_sec.max(0.0),
        dur,
        out_w,
        out_h,
        info.has_audio,
    );
    run_ffmpeg(&args)?;
    Ok(output_path)
}

#[tauri::command]
pub fn concat_playlist_ffmpeg(
    clip_paths: Vec<String>,
    output_path: String,
    cleanup_inputs: Option<bool>,
) -> Result<String, String> {
    if clip_paths.is_empty() {
        return Err("Daftar klip kosong".to_string());
    }
    ensure_parent_dir(&output_path)?;

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let temp_list_path = std::env::temp_dir().join(format!("futsaltag_concat_{}.txt", now));
    let mut cleanup = TempCleanup(vec![temp_list_path.clone()]);
    if cleanup_inputs.unwrap_or(false) {
        for p in &clip_paths {
            cleanup.0.push(PathBuf::from(p));
        }
    }

    {
        let mut file = fs::File::create(&temp_list_path)
            .map_err(|e| format!("Gagal membuat file daftar sementara: {}", e))?;
        for p in &clip_paths {
            let escaped = p.replace('\\', "/").replace('\'', "'\\''");
            writeln!(file, "file '{}'", escaped)
                .map_err(|e| format!("Gagal menulis daftar klip: {}", e))?;
        }
    }

    let list_str = temp_list_path.to_string_lossy().to_string();
    let copy_args = vec![
        "-y".into(),
        "-f".into(),
        "concat".into(),
        "-safe".into(),
        "0".into(),
        "-i".into(),
        list_str.clone(),
        "-c".into(),
        "copy".into(),
        "-movflags".into(),
        "+faststart".into(),
        output_path.clone(),
    ];

    if run_ffmpeg(&copy_args).is_err() {
        let (vcodec, vflags) = detect_video_encoder();
        let mut re_args = vec![
            "-y".into(),
            "-f".into(),
            "concat".into(),
            "-safe".into(),
            "0".into(),
            "-i".into(),
            list_str,
            "-c:v".into(),
            vcodec.into(),
        ];
        for f in vflags {
            re_args.push(f.into());
        }
        re_args.extend([
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-c:a".into(),
            "aac".into(),
            "-ar".into(),
            "44100".into(),
            "-ac".into(),
            "2".into(),
            "-movflags".into(),
            "+faststart".into(),
            output_path.clone(),
        ]);
        run_ffmpeg(&re_args)?;
    }

    Ok(output_path)
}

#[tauri::command]
pub fn burn_telestration_clip_ffmpeg(
    input_path: String,
    output_path: String,
    start_sec: f64,
    duration_sec: f64,
    freeze_sec: f64,
    pause_duration: f64,
    overlay_base64: Option<String>,
    voiceover_base64: Option<String>,
    target_height: Option<u32>,
    camera_zoom: Option<[f64; 3]>,
    freeze_stops: Option<Vec<FreezeStopSpec>>,
    append_clean_replay: Option<bool>,
) -> Result<String, String> {
    if !Path::new(&input_path).exists() {
        return Err(format!("File video input tidak ditemukan: {}", input_path));
    }
    ensure_parent_dir(&output_path)?;

    let info = probe_video_info(&input_path)?;
    let (out_w, out_h) = target_dimensions(target_height);

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let temp_dir = std::env::temp_dir();
    let mut cleanup = TempCleanup(Vec::new());

    let voiceover_path = match voiceover_base64 {
        Some(ref vo) if !vo.trim().is_empty() => {
            let p = decode_base64_to_temp(vo, "futsaltag_vo", "webm")?;
            cleanup.0.push(p.clone());
            Some(p)
        }
        _ => None,
    };

    let dur_total = duration_sec.max(0.2);
    let end_sec = start_sec + dur_total;
    let stops = normalize_freeze_stops(
        freeze_stops,
        freeze_sec,
        pause_duration,
        overlay_base64,
        start_sec,
        end_sec,
    );

    let mut parts_to_concat: Vec<String> = Vec::new();
    let mut cursor = start_sec.max(0.0);

    for (idx, stop) in stops.iter().enumerate() {
        let seg_dur = (stop.time - cursor).max(0.0);
        if seg_dur > 0.08 {
            let p_move = temp_dir.join(format!("futsaltag_mseg_{}_{}.mp4", now, idx));
            cleanup.0.push(p_move.clone());
            let p_move_str = p_move.to_string_lossy().to_string();
            let args = build_norm_segment_args(
                &input_path,
                &p_move_str,
                cursor,
                seg_dur,
                out_w,
                out_h,
                info.has_audio,
            );
            run_ffmpeg(&args)?;
            parts_to_concat.push(p_move_str);
        }

        let stop_ov_path = match stop.overlay_base64 {
            Some(ref b64) if !b64.trim().is_empty() => {
                let p = decode_base64_to_temp(b64, &format!("futsaltag_tel_ov_{}", idx), "png")?;
                cleanup.0.push(p.clone());
                Some(p)
            }
            _ => None,
        };

        let pf = temp_dir.join(format!("futsaltag_freeze_{}_{}.mp4", now, idx));
        cleanup.0.push(pf.clone());
        let pf_str = pf.to_string_lossy().to_string();
        render_freeze_segment_ffmpeg(
            &input_path,
            stop.time,
            stop.duration,
            stop_ov_path.as_ref(),
            out_w,
            out_h,
            camera_zoom,
            &pf_str,
        )?;
        parts_to_concat.push(pf_str);
        cursor = stop.time;
    }

    let dur_tail = (end_sec - cursor).max(0.0);
    if dur_tail > 0.08 {
        let p_tail = temp_dir.join(format!("futsaltag_tail_{}.mp4", now));
        cleanup.0.push(p_tail.clone());
        let p_tail_str = p_tail.to_string_lossy().to_string();
        let args = build_norm_segment_args(
            &input_path,
            &p_tail_str,
            cursor,
            dur_tail,
            out_w,
            out_h,
            info.has_audio,
        );
        run_ffmpeg(&args)?;
        parts_to_concat.push(p_tail_str);
    }

    if append_clean_replay.unwrap_or(false) {
        let p_replay = temp_dir.join(format!("futsaltag_replay_{}.mp4", now));
        cleanup.0.push(p_replay.clone());
        let p_replay_str = p_replay.to_string_lossy().to_string();
        let args = build_norm_segment_args(
            &input_path,
            &p_replay_str,
            start_sec.max(0.0),
            dur_total,
            out_w,
            out_h,
            info.has_audio,
        );
        run_ffmpeg(&args)?;
        parts_to_concat.push(p_replay_str);
    }

    if parts_to_concat.is_empty() {
        return Err("Tidak ada segmen video yang dihasilkan untuk telestrasi".to_string());
    }

    let base_out = if voiceover_path.is_some() {
        let pre = temp_dir.join(format!("futsaltag_premix_{}.mp4", now));
        cleanup.0.push(pre.clone());
        pre.to_string_lossy().to_string()
    } else {
        output_path.clone()
    };

    if parts_to_concat.len() == 1 {
        fs::copy(&parts_to_concat[0], &base_out)
            .map_err(|e| format!("Gagal menyalin hasil segmen video: {}", e))?;
    } else {
        concat_playlist_ffmpeg(parts_to_concat, base_out.clone(), Some(false))?;
    }

    if let Some(ref vp) = voiceover_path {
        let mix_args = vec![
            "-y".into(),
            "-i".into(),
            base_out,
            "-i".into(),
            vp.to_string_lossy().to_string(),
            "-filter_complex".into(),
            "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2:weights=1.2 4.0[aout]".into(),
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            "[aout]".into(),
            "-c:v".into(),
            "copy".into(),
            "-c:a".into(),
            "aac".into(),
            "-ar".into(),
            "44100".into(),
            "-ac".into(),
            "2".into(),
            "-movflags".into(),
            "+faststart".into(),
            output_path.clone(),
        ];
        run_ffmpeg(&mix_args)?;
    }

    Ok(output_path)
}

#[tauri::command]
pub fn export_whatsapp_clip_ffmpeg(
    input_path: String,
    output_path: String,
    start_sec: f64,
    duration_sec: f64,
    freeze_sec: Option<f64>,
    pause_duration: Option<f64>,
    overlay_base64: Option<String>,
    voiceover_base64: Option<String>,
    freeze_stops: Option<Vec<FreezeStopSpec>>,
    append_clean_replay: Option<bool>,
) -> Result<String, String> {
    if !Path::new(&input_path).exists() {
        return Err(format!("File video input tidak ditemukan: {}", input_path));
    }
    ensure_parent_dir(&output_path)?;

    let has_overlay = overlay_base64
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let has_vo = voiceover_base64
        .as_ref()
        .map(|s| !s.trim().is_empty())
        .unwrap_or(false);
    let has_stops = freeze_stops.as_ref().map(|v| !v.is_empty()).unwrap_or(false);
    let wants_replay = append_clean_replay.unwrap_or(false);

    if has_overlay || has_vo || has_stops || wants_replay {
        let f_sec = freeze_sec.unwrap_or(start_sec + duration_sec / 2.0);
        let p_dur = pause_duration.unwrap_or(if has_overlay { 3.0 } else { 0.0 });
        return burn_telestration_clip_ffmpeg(
            input_path,
            output_path,
            start_sec,
            duration_sec,
            f_sec,
            p_dur,
            overlay_base64,
            voiceover_base64,
            Some(720),
            None,
            freeze_stops,
            append_clean_replay,
        );
    }

    let info = probe_video_info(&input_path)?;
    let (vcodec, _) = detect_video_encoder();
    let mut args = vec![
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", start_sec.max(0.0)),
        "-i".into(),
        input_path,
    ];
    if !info.has_audio {
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "anullsrc=channel_layout=stereo:sample_rate=44100".into(),
        ]);
    }
    args.extend([
        "-t".into(),
        format!("{:.3}", duration_sec.max(0.2)),
        "-vf".into(),
        "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p".into(),
        "-c:v".into(),
        vcodec.into(),
    ]);
    if vcodec == "h264_videotoolbox" {
        args.extend(["-b:v".into(), "1800k".into(), "-allow_sw".into(), "1".into()]);
    } else if vcodec == "h264_nvenc" {
        args.extend(["-preset".into(), "p4".into(), "-cq".into(), "26".into()]);
    } else {
        args.extend(["-crf".into(), "26".into(), "-preset".into(), "faster".into()]);
    }

    if info.has_audio {
        args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "0:a:0".into()]);
    } else {
        args.extend(["-map".into(), "0:v:0".into(), "-map".into(), "1:a:0".into()]);
    }
    args.extend([
        "-c:a".into(),
        "aac".into(),
        "-ar".into(),
        "44100".into(),
        "-ac".into(),
        "2".into(),
        "-b:a".into(),
        "128k".into(),
        "-movflags".into(),
        "+faststart".into(),
        output_path.clone(),
    ]);

    run_ffmpeg(&args)?;
    Ok(output_path)
}

pub fn build_format_filter_graph(
    out_w: u32,
    out_h: u32,
    vertical_9x16: bool,
) -> (Option<String>, Option<String>) {
    if vertical_9x16 {
        let fc = format!(
            "[0:v]split=2[bg][fg];[bg]scale={w}:{h}:force_original_aspect_ratio=increase,crop={w}:{h},boxblur=20:5[bgb];[fg]scale={w}:-2:force_original_aspect_ratio=decrease[fgs];[bgb][fgs]overlay=(W-w)/2:(H-h)/2,setsar=1,fps=30,format=yuv420p[vout]",
            w = out_w,
            h = out_h
        );
        (None, Some(fc))
    } else {
        let vf = format!(
            "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p",
            w = out_w,
            h = out_h
        );
        (Some(vf), None)
    }
}

#[tauri::command]
pub fn export_formatted_clip_ffmpeg(
    input_path: String,
    output_path: String,
    start_sec: Option<f64>,
    duration_sec: Option<f64>,
    target_height: Option<u32>,
    crf: Option<u8>,
    vertical_9x16: Option<bool>,
    remove_input: Option<bool>,
) -> Result<String, String> {
    if !Path::new(&input_path).exists() {
        return Err(format!("File video input tidak ditemukan: {}", input_path));
    }
    ensure_parent_dir(&output_path)?;

    let q_crf = crf.unwrap_or(23).clamp(16, 32);
    let is_vertical = vertical_9x16.unwrap_or(false);
    let h = match target_height {
        Some(v) if v <= 720 => 720u32,
        _ => 1080u32,
    };
    let (out_w, out_h) = if is_vertical {
        if h <= 720 { (720, 1280) } else { (1080, 1920) }
    } else {
        target_dimensions(Some(h))
    };

    let info = probe_video_info(&input_path)?;
    let (vcodec, _) = detect_video_encoder();
    let (vf_opt, fc_opt) = build_format_filter_graph(out_w, out_h, is_vertical);

    let mut args = vec!["-y".into()];
    if let Some(ss) = start_sec {
        args.extend(["-ss".into(), format!("{:.3}", ss.max(0.0))]);
    }
    args.extend(["-i".into(), input_path.clone()]);
    if !info.has_audio {
        args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "anullsrc=channel_layout=stereo:sample_rate=44100".into(),
        ]);
    }
    if let Some(dur) = duration_sec {
        args.extend(["-t".into(), format!("{:.3}", dur.max(0.2))]);
    }

    let audio_in = if info.has_audio { "0:a:0" } else { "1:a:0" };
    if let Some(fc) = fc_opt {
        args.extend([
            "-filter_complex".into(),
            fc,
            "-map".into(),
            "[vout]".into(),
            "-map".into(),
            audio_in.into(),
        ]);
    } else if let Some(vf) = vf_opt {
        args.extend([
            "-vf".into(),
            vf,
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            audio_in.into(),
        ]);
    }

    args.extend(["-c:v".into(), vcodec.into()]);
    if vcodec == "h264_videotoolbox" {
        let br = if q_crf <= 19 {
            "8000k"
        } else if q_crf <= 24 {
            "4500k"
        } else {
            "1800k"
        };
        args.extend(["-b:v".into(), br.into(), "-allow_sw".into(), "1".into()]);
    } else if vcodec == "h264_nvenc" {
        args.extend(["-preset".into(), "p4".into(), "-cq".into(), q_crf.to_string()]);
    } else {
        args.extend([
            "-crf".into(),
            q_crf.to_string(),
            "-preset".into(),
            "veryfast".into(),
        ]);
    }

    args.extend([
        "-c:a".into(),
        "aac".into(),
        "-ar".into(),
        "44100".into(),
        "-ac".into(),
        "2".into(),
        "-b:a".into(),
        "128k".into(),
        "-movflags".into(),
        "+faststart".into(),
        output_path.clone(),
    ]);

    run_ffmpeg(&args)?;
    if remove_input.unwrap_or(false) && input_path != output_path {
        let _ = fs::remove_file(&input_path);
    }
    Ok(output_path)
}

#[tauri::command]
pub fn save_overlay_frame_png(
    dir_path: String,
    frame_index: u32,
    png_base64: String,
) -> Result<String, String> {
    fs::create_dir_all(&dir_path)
        .map_err(|e| format!("Gagal membuat folder overlay '{}': {}", dir_path, e))?;
    let clean = if let Some(idx) = png_base64.find("base64,") {
        &png_base64[idx + 7..]
    } else {
        png_base64.as_str()
    };
    let bytes = BASE64_STANDARD
        .decode(clean.trim())
        .map_err(|e| format!("Gagal decode PNG frame {}: {}", frame_index, e))?;
    let frame_path = Path::new(&dir_path).join(format!("frame_{:05}.png", frame_index));
    fs::write(&frame_path, bytes)
        .map_err(|e| format!("Gagal menulis frame {}: {}", frame_path.display(), e))?;
    Ok(frame_path.to_string_lossy().to_string())
}

#[tauri::command]
pub fn cleanup_temp_dir(dir_path: String) -> Result<(), String> {
    let target = PathBuf::from(&dir_path);
    let sys_tmp = std::env::temp_dir();
    if target.starts_with(&sys_tmp) && target.exists() {
        fs::remove_dir_all(&target)
            .map_err(|e| format!("Gagal membersihkan folder temp '{}': {}", dir_path, e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn burn_animated_telestration_clip_ffmpeg(
    input_path: String,
    output_path: String,
    start_sec: f64,
    duration_sec: f64,
    overlay_frames_dir: String,
    overlay_fps: f64,
    freeze_sec: Option<f64>,
    pause_duration: Option<f64>,
    freeze_overlay_base64: Option<String>,
    camera_zoom: Option<[f64; 3]>,
    voiceover_base64: Option<String>,
    target_height: Option<u32>,
    freeze_stops: Option<Vec<FreezeStopSpec>>,
    append_clean_replay: Option<bool>,
) -> Result<String, String> {
    if !Path::new(&input_path).exists() {
        return Err(format!("File video input tidak ditemukan: {}", input_path));
    }
    if !Path::new(&overlay_frames_dir).exists() {
        return Err(format!("Folder sequence overlay tidak ditemukan: {}", overlay_frames_dir));
    }
    ensure_parent_dir(&output_path)?;

    let info = probe_video_info(&input_path)?;
    let (out_w, out_h) = target_dimensions(target_height);
    let (vcodec, vflags) = detect_video_encoder();

    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let temp_dir = std::env::temp_dir();
    let mut cleanup = TempCleanup(Vec::new());

    let dur_total = duration_sec.max(0.2);
    let fps_val = overlay_fps.clamp(2.0, 30.0);
    let seq_pattern = format!("{}/frame_%05d.png", overlay_frames_dir.replace('\\', "/"));

    let moving_burned = temp_dir.join(format!("futsaltag_anim_moving_{}.mp4", now));
    cleanup.0.push(moving_burned.clone());
    let moving_str = moving_burned.to_string_lossy().to_string();

    let mut anim_args = vec![
        "-y".into(),
        "-ss".into(),
        format!("{:.3}", start_sec.max(0.0)),
        "-t".into(),
        format!("{:.3}", dur_total),
        "-i".into(),
        input_path.clone(),
        "-framerate".into(),
        format!("{:.3}", fps_val),
        "-i".into(),
        seq_pattern,
    ];
    if !info.has_audio {
        anim_args.extend([
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "anullsrc=channel_layout=stereo:sample_rate=44100".into(),
        ]);
    }
    let anim_fc = format!(
        "[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30[bg];[1:v]scale={w}:{h},fps=30,format=rgba[fg];[bg][fg]overlay=0:0:eof_action=pass,format=yuv420p[v]",
        w = out_w,
        h = out_h
    );
    anim_args.extend(["-filter_complex".into(), anim_fc, "-map".into(), "[v]".into()]);
    if info.has_audio {
        anim_args.extend(["-map".into(), "0:a:0".into()]);
    } else {
        anim_args.extend(["-map".into(), "2:a:0".into()]);
    }
    anim_args.extend(["-t".into(), format!("{:.3}", dur_total), "-c:v".into(), vcodec.into()]);
    for f in &vflags {
        anim_args.push((*f).into());
    }
    anim_args.extend([
        "-c:a".into(),
        "aac".into(),
        "-ar".into(),
        "44100".into(),
        "-ac".into(),
        "2".into(),
        "-b:a".into(),
        "128k".into(),
        "-movflags".into(),
        "+faststart".into(),
        moving_str.clone(),
    ]);
    run_ffmpeg(&anim_args)?;

    let voiceover_path = match voiceover_base64 {
        Some(ref vo) if !vo.trim().is_empty() => {
            let p = decode_base64_to_temp(vo, "futsaltag_anim_vo", "webm")?;
            cleanup.0.push(p.clone());
            Some(p)
        }
        _ => None,
    };

    let pause_dur = pause_duration.unwrap_or(0.0);
    let clean_replay = append_clean_replay.unwrap_or(false);
    let stops = normalize_freeze_stops(
        freeze_stops,
        freeze_sec.unwrap_or(start_sec + dur_total * 0.5),
        pause_dur,
        freeze_overlay_base64,
        start_sec,
        start_sec + dur_total,
    );

    let base_out = if voiceover_path.is_some() {
        let pre = temp_dir.join(format!("futsaltag_anim_premix_{}.mp4", now));
        cleanup.0.push(pre.clone());
        pre.to_string_lossy().to_string()
    } else {
        output_path.clone()
    };

    if !stops.is_empty() || clean_replay {
        let mut parts: Vec<String> = Vec::new();
        let mut cursor_offset = 0.0;

        for (idx, stop) in stops.iter().enumerate() {
            let stop_offset = (stop.time - start_sec).clamp(0.0, dur_total);
            let seg_len = (stop_offset - cursor_offset).max(0.0);
            if seg_len > 0.08 {
                let pm = temp_dir.join(format!("futsaltag_anim_m_{}_{}.mp4", now, idx));
                cleanup.0.push(pm.clone());
                let pm_str = pm.to_string_lossy().to_string();
                let args = build_norm_segment_args(
                    &moving_str,
                    &pm_str,
                    cursor_offset,
                    seg_len,
                    out_w,
                    out_h,
                    true,
                );
                run_ffmpeg(&args)?;
                parts.push(pm_str);
            }

            let freeze_overlay_path = match stop.overlay_base64 {
                Some(ref b64) if !b64.trim().is_empty() => {
                    let p = decode_base64_to_temp(
                        b64,
                        &format!("futsaltag_anim_freeze_ov_{}", idx),
                        "png",
                    )?;
                    cleanup.0.push(p.clone());
                    Some(p)
                }
                _ => None,
            };

            let pf = temp_dir.join(format!("futsaltag_anim_freeze_{}_{}.mp4", now, idx));
            cleanup.0.push(pf.clone());
            let pf_str = pf.to_string_lossy().to_string();
            render_freeze_segment_ffmpeg(
                &input_path,
                stop.time,
                stop.duration,
                freeze_overlay_path.as_ref(),
                out_w,
                out_h,
                camera_zoom,
                &pf_str,
            )?;
            parts.push(pf_str);
            cursor_offset = stop_offset;
        }

        let dur_tail = (dur_total - cursor_offset).max(0.0);
        if dur_tail > 0.08 {
            let p_tail = temp_dir.join(format!("futsaltag_anim_tail_{}.mp4", now));
            cleanup.0.push(p_tail.clone());
            let p_tail_str = p_tail.to_string_lossy().to_string();
            let args = build_norm_segment_args(
                &moving_str,
                &p_tail_str,
                cursor_offset,
                dur_tail,
                out_w,
                out_h,
                true,
            );
            run_ffmpeg(&args)?;
            parts.push(p_tail_str);
        }

        if clean_replay {
            let p_replay = temp_dir.join(format!("futsaltag_anim_replay_{}.mp4", now));
            cleanup.0.push(p_replay.clone());
            let p_replay_str = p_replay.to_string_lossy().to_string();
            let args = build_norm_segment_args(
                &input_path,
                &p_replay_str,
                start_sec.max(0.0),
                dur_total,
                out_w,
                out_h,
                info.has_audio,
            );
            run_ffmpeg(&args)?;
            parts.push(p_replay_str);
        }

        if parts.len() == 1 {
            fs::copy(&parts[0], &base_out)
                .map_err(|e| format!("Gagal menyalin segmen animasi: {}", e))?;
        } else {
            concat_playlist_ffmpeg(parts, base_out.clone(), Some(false))?;
        }
    } else {
        fs::copy(&moving_str, &base_out)
            .map_err(|e| format!("Gagal menyalin video animasi: {}", e))?;
    }

    if let Some(ref vp) = voiceover_path {
        let mix_args = vec![
            "-y".into(),
            "-i".into(),
            base_out,
            "-i".into(),
            vp.to_string_lossy().to_string(),
            "-filter_complex".into(),
            "[0:a][1:a]amix=inputs=2:duration=first:dropout_transition=2:weights=1.2 4.0[aout]".into(),
            "-map".into(),
            "0:v:0".into(),
            "-map".into(),
            "[aout]".into(),
            "-c:v".into(),
            "copy".into(),
            "-c:a".into(),
            "aac".into(),
            "-ar".into(),
            "44100".into(),
            "-ac".into(),
            "2".into(),
            "-movflags".into(),
            "+faststart".into(),
            output_path.clone(),
        ];
        run_ffmpeg(&mix_args)?;
    }

    Ok(output_path)
}

pub fn extract_rgb_frames(
    input_path: &str,
    start_sec: f64,
    end_sec: f64,
    fps: f64,
    out_w: u32,
    out_h: u32,
) -> Result<Vec<(f64, Vec<u8>)>, String> {
    if !Path::new(input_path).exists() {
        return Err(format!("File video tidak ditemukan: {}", input_path));
    }
    let dur = (end_sec - start_sec).max(0.2);
    let sample_fps = fps.clamp(1.0, 30.0);
    let frame_bytes = (out_w * out_h * 3) as usize;
    let ffmpeg = resolve_bin("ffmpeg");

    let mut child = silent_command(&ffmpeg)
        .args([
            "-v",
            "error",
            "-accurate_seek",
            "-ss",
            &format!("{:.3}", start_sec.max(0.0)),
            "-i",
            input_path,
            "-t",
            &format!("{:.3}", dur),
            "-vf",
            &format!(
                "setpts=PTS-STARTPTS,fps={:.3}:start_time=0:round=down,scale={}:{}",
                sample_fps, out_w, out_h
            ),
            "-f",
            "rawvideo",
            "-pix_fmt",
            "rgb24",
            "-",
        ])
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Gagal menjalankan FFmpeg frame extractor: {}", e))?;

    let mut stdout = child
        .stdout
        .take()
        .ok_or_else(|| "Gagal membuka stdout FFmpeg".to_string())?;
    let mut raw = Vec::new();
    stdout
        .read_to_end(&mut raw)
        .map_err(|e| format!("Gagal membaca raw frames: {}", e))?;

    let status = child
        .wait()
        .map_err(|e| format!("Gagal menunggu FFmpeg: {}", e))?;
    if !status.success() && raw.len() < frame_bytes {
        let mut err_buf = String::new();
        if let Some(mut se) = child.stderr.take() {
            let _ = se.read_to_string(&mut err_buf);
        }
        return Err(format!("FFmpeg frame extraction gagal: {}", err_buf.trim()));
    }

    let mut frames = Vec::new();
    for (idx, chunk) in raw.chunks_exact(frame_bytes).enumerate() {
        let t = start_sec + (idx as f64) / sample_fps;
        frames.push((t, chunk.to_vec()));
    }
    Ok(frames)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_ffmpeg_probe_and_burn_telestration_pipeline() {
        let ffmpeg = resolve_bin("ffmpeg");
        assert!(
            Path::new(&ffmpeg).exists() || ffmpeg == "ffmpeg",
            "ffmpeg resolver should return valid path"
        );

        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let src_mp4 = std::env::temp_dir().join(format!("futsaltag_test_src_{}.mp4", now));
        let out_mp4 = std::env::temp_dir().join(format!("futsaltag_test_out_{}.mp4", now));
        let _cleanup = TempCleanup(vec![src_mp4.clone(), out_mp4.clone()]);

        // Generate 2s synthetic 720p test video + audio
        let gen_args = vec![
            "-y".into(),
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "testsrc2=size=1280x720:rate=30:duration=2".into(),
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "sine=frequency=440:sample_rate=44100:duration=2".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "ultrafast".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-c:a".into(),
            "aac".into(),
            src_mp4.to_string_lossy().to_string(),
        ];
        run_ffmpeg(&gen_args).expect("synthetic test mp4 generation failed");

        let info = probe_video_info(&src_mp4.to_string_lossy()).expect("ffprobe failed");
        assert_eq!(info.width, 1280);
        assert_eq!(info.height, 720);
        assert!(info.has_audio);

        // 1x1 transparent PNG in base64
        let tiny_png_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        let res = burn_telestration_clip_ffmpeg(
            src_mp4.to_string_lossy().to_string(),
            out_mp4.to_string_lossy().to_string(),
            0.0,
            2.0,
            1.0,
            1.0,
            Some(tiny_png_b64.to_string()),
            None,
            Some(720),
            None,
            None,
            None,
        );
        assert!(res.is_ok(), "burn_telestration_clip_ffmpeg failed: {:?}", res);

        let out_info = probe_video_info(&out_mp4.to_string_lossy()).expect("output ffprobe failed");
        assert_eq!(out_info.width, 1280);
        assert_eq!(out_info.height, 720);
        assert!(out_info.duration >= 2.5, "output duration should include 1s freeze");
    }

    #[test]
    fn test_full_e2e_export_workflows_windows() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let tmp = std::env::temp_dir();

        let src_mp4 = tmp.join(format!("futsaltag_e2e_src_{}.mp4", now));
        let vo_webm = tmp.join(format!("futsaltag_e2e_vo_{}.webm", now));
        let clip_copy_mp4 = tmp.join(format!("futsaltag_e2e_copy_{}.mp4", now));
        let clip_norm_mp4 = tmp.join(format!("futsaltag_e2e_norm_{}.mp4", now));
        let tel_mp4 = tmp.join(format!("futsaltag_e2e_tel_{}.mp4", now));
        let anim_mp4 = tmp.join(format!("futsaltag_e2e_anim_{}.mp4", now));
        let merged_mp4 = tmp.join(format!("futsaltag_e2e_merged_{}.mp4", now));
        let wa_plain_mp4 = tmp.join(format!("futsaltag_e2e_wa_plain_{}.mp4", now));
        let wa_rich_mp4 = tmp.join(format!("futsaltag_e2e_wa_rich_{}.mp4", now));
        let anim_frames_dir = tmp.join(format!("futsaltag_e2e_frames_{}", now));

        let _cleanup = TempCleanup(vec![
            src_mp4.clone(),
            vo_webm.clone(),
            clip_copy_mp4.clone(),
            clip_norm_mp4.clone(),
            tel_mp4.clone(),
            anim_mp4.clone(),
            merged_mp4.clone(),
            wa_plain_mp4.clone(),
            wa_rich_mp4.clone(),
        ]);

        // 1. Generate synthetic 6s 1280x720 MP4 + 2s WebM (libopus) voiceover
        let gen_video_args = vec![
            "-y".into(),
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "testsrc2=size=1280x720:rate=30:duration=6".into(),
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "sine=frequency=440:sample_rate=44100:duration=6".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "ultrafast".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-c:a".into(),
            "aac".into(),
            src_mp4.to_string_lossy().to_string(),
        ];
        run_ffmpeg(&gen_video_args).expect("failed generating 6s synthetic test mp4");

        let gen_vo_args = vec![
            "-y".into(),
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "sine=frequency=880:sample_rate=48000:duration=2".into(),
            "-c:a".into(),
            "libopus".into(),
            "-b:a".into(),
            "64k".into(),
            vo_webm.to_string_lossy().to_string(),
        ];
        run_ffmpeg(&gen_vo_args).expect("failed generating 2s synthetic webm voiceover");

        let vo_bytes = fs::read(&vo_webm).expect("failed reading synthetic webm voiceover");
        let vo_b64 = format!("data:audio/webm;base64,{}", BASE64_STANDARD.encode(&vo_bytes));
        let tiny_png_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";

        // 2. Verify probe_video_info
        let info = probe_video_info(&src_mp4.to_string_lossy()).expect("probe_video_info failed");
        assert_eq!(info.width, 1280);
        assert_eq!(info.height, 720);
        assert!(info.has_audio);
        assert!(info.duration >= 5.5, "expected duration >= 5.5, got {}", info.duration);

        // 3. Verify render_video_clip_ffmpeg (fast_copy = true & fast_copy = false 720p)
        render_video_clip_ffmpeg(
            src_mp4.to_string_lossy().to_string(),
            clip_copy_mp4.to_string_lossy().to_string(),
            0.5,
            2.0,
            Some(true),
            None,
        )
        .expect("render_video_clip_ffmpeg (fast_copy=true) failed");
        let copy_info = probe_video_info(&clip_copy_mp4.to_string_lossy()).expect("probe copy clip failed");
        assert!(copy_info.duration >= 1.5, "copy clip duration too short: {}", copy_info.duration);

        render_video_clip_ffmpeg(
            src_mp4.to_string_lossy().to_string(),
            clip_norm_mp4.to_string_lossy().to_string(),
            0.5,
            2.0,
            Some(false),
            Some(720),
        )
        .expect("render_video_clip_ffmpeg (fast_copy=false, 720p) failed");
        let norm_info = probe_video_info(&clip_norm_mp4.to_string_lossy()).expect("probe norm clip failed");
        assert!(norm_info.duration >= 1.5, "norm clip duration too short: {}", norm_info.duration);

        // 4. Verify burn_telestration_clip_ffmpeg with PNG overlay + WebM voiceover + freeze + camera zoom
        burn_telestration_clip_ffmpeg(
            src_mp4.to_string_lossy().to_string(),
            tel_mp4.to_string_lossy().to_string(),
            2.0,
            2.5,
            3.2,
            1.5,
            Some(tiny_png_b64.to_string()),
            Some(vo_b64.clone()),
            Some(720),
            Some([0.5, 0.5, 1.35]),
            None,
            None,
        )
        .expect("burn_telestration_clip_ffmpeg with voiceover+zoom failed");
        let tel_info = probe_video_info(&tel_mp4.to_string_lossy()).expect("probe tel clip failed");
        assert!(tel_info.has_audio, "telestrated clip must have audio");
        assert!(tel_info.duration >= 3.0, "telestrated clip duration too short: {}", tel_info.duration);

        // 5. Verify animated keyframe sequence burn-in + cleanup_temp_dir
        let anim_dir_str = anim_frames_dir.to_string_lossy().to_string();
        for idx in 0..6u32 {
            save_overlay_frame_png(anim_dir_str.clone(), idx, tiny_png_b64.to_string())
                .expect("save_overlay_frame_png failed");
        }
        burn_animated_telestration_clip_ffmpeg(
            src_mp4.to_string_lossy().to_string(),
            anim_mp4.to_string_lossy().to_string(),
            1.0,
            2.0,
            anim_dir_str.clone(),
            6.0,
            Some(2.0),
            Some(1.0),
            Some(tiny_png_b64.to_string()),
            Some([0.45, 0.55, 1.25]),
            Some(vo_b64.clone()),
            Some(720),
            None,
            None,
        )
        .expect("burn_animated_telestration_clip_ffmpeg failed");
        cleanup_temp_dir(anim_dir_str).expect("cleanup_temp_dir failed");
        assert!(!anim_frames_dir.exists(), "temp overlay frames dir should be removed");
        let anim_info = probe_video_info(&anim_mp4.to_string_lossy()).expect("probe anim clip failed");
        assert!(anim_info.duration >= 2.5, "animated clip duration too short: {}", anim_info.duration);

        // 6. Verify concat_playlist_ffmpeg merging Clip 1 + Telestrated Clip 2
        concat_playlist_ffmpeg(
            vec![
                clip_norm_mp4.to_string_lossy().to_string(),
                tel_mp4.to_string_lossy().to_string(),
            ],
            merged_mp4.to_string_lossy().to_string(),
            Some(false),
        )
        .expect("concat_playlist_ffmpeg failed");
        let merged_info = probe_video_info(&merged_mp4.to_string_lossy()).expect("probe merged clip failed");
        assert!(merged_info.duration >= 4.5, "merged duration too short: {}", merged_info.duration);

        // 7. Verify export_whatsapp_clip_ffmpeg (plain 720p and overlay+voiceover 720p)
        export_whatsapp_clip_ffmpeg(
            src_mp4.to_string_lossy().to_string(),
            wa_plain_mp4.to_string_lossy().to_string(),
            1.0,
            2.5,
            None,
            None,
            None,
            None,
            None,
            None,
        )
        .expect("export_whatsapp_clip_ffmpeg (plain) failed");
        let wa_plain_info = probe_video_info(&wa_plain_mp4.to_string_lossy()).expect("probe wa plain failed");
        let wa_plain_size = fs::metadata(&wa_plain_mp4).expect("stat wa plain failed").len();
        assert_eq!(wa_plain_info.height, 720);
        assert!(wa_plain_info.has_audio);
        assert!(wa_plain_size < 5_000_000, "wa plain file too large: {}", wa_plain_size);

        export_whatsapp_clip_ffmpeg(
            src_mp4.to_string_lossy().to_string(),
            wa_rich_mp4.to_string_lossy().to_string(),
            1.0,
            2.5,
            Some(2.2),
            Some(1.0),
            Some(tiny_png_b64.to_string()),
            Some(vo_b64),
            None,
            None,
        )
        .expect("export_whatsapp_clip_ffmpeg (rich) failed");
        let wa_rich_info = probe_video_info(&wa_rich_mp4.to_string_lossy()).expect("probe wa rich failed");
        let wa_rich_size = fs::metadata(&wa_rich_mp4).expect("stat wa rich failed").len();
        assert_eq!(wa_rich_info.height, 720);
        assert!(wa_rich_info.has_audio);
        assert!(wa_rich_size < 5_000_000, "wa rich file too large: {}", wa_rich_size);
    }

    #[test]
    fn test_normalize_freeze_stops() {
        let stops = vec![
            FreezeStopSpec { time: 25.0, duration: 2.5, overlay_base64: None },
            FreezeStopSpec { time: 8.0, duration: 3.0, overlay_base64: None },
            FreezeStopSpec { time: 12.02, duration: 1.5, overlay_base64: None },
            FreezeStopSpec { time: 12.04, duration: 2.0, overlay_base64: None }, // dup within 0.05s
            FreezeStopSpec { time: 14.0, duration: 0.1, overlay_base64: None },  // below 0.2s
        ];
        let out = normalize_freeze_stops(Some(stops), 15.0, 3.0, None, 10.0, 20.0);
        assert_eq!(out.len(), 3);
        assert!((out[0].time - 10.0).abs() < 1e-6);
        assert!((out[1].time - 12.02).abs() < 1e-6);
        assert!((out[2].time - 20.0).abs() < 1e-6);

        let fallback = normalize_freeze_stops(None, 15.0, 3.0, Some("ov".into()), 10.0, 20.0);
        assert_eq!(fallback.len(), 1);
        assert!((fallback[0].time - 15.0).abs() < 1e-6);

        let none = normalize_freeze_stops(None, 15.0, 0.0, None, 10.0, 20.0);
        assert!(none.is_empty());
    }

    #[test]
    fn test_multi_freeze_stops_with_clean_replay_e2e() {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap()
            .as_millis();
        let tmp = std::env::temp_dir();
        let src_mp4 = tmp.join(format!("futsaltag_mfs_src_{}.mp4", now));
        let out_tel_mp4 = tmp.join(format!("futsaltag_mfs_tel_{}.mp4", now));
        let out_wa_mp4 = tmp.join(format!("futsaltag_mfs_wa_{}.mp4", now));
        let _cleanup = TempCleanup(vec![
            src_mp4.clone(),
            out_tel_mp4.clone(),
            out_wa_mp4.clone(),
        ]);

        let gen_args = vec![
            "-y".into(),
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "testsrc2=size=1280x720:rate=30:duration=3".into(),
            "-f".into(),
            "lavfi".into(),
            "-i".into(),
            "sine=frequency=440:sample_rate=44100:duration=3".into(),
            "-c:v".into(),
            "libx264".into(),
            "-preset".into(),
            "ultrafast".into(),
            "-pix_fmt".into(),
            "yuv420p".into(),
            "-c:a".into(),
            "aac".into(),
            src_mp4.to_string_lossy().to_string(),
        ];
        run_ffmpeg(&gen_args).expect("failed generating 3s synthetic test mp4");

        let tiny_png_b64 = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
        let stops = vec![
            FreezeStopSpec {
                time: 0.8,
                duration: 1.0,
                overlay_base64: Some(tiny_png_b64.to_string()),
            },
            FreezeStopSpec {
                time: 2.0,
                duration: 1.5,
                overlay_base64: Some(tiny_png_b64.to_string()),
            },
        ];
        let clip_dur = 3.0;
        let total_freeze = 1.0 + 1.5;

        burn_telestration_clip_ffmpeg(
            src_mp4.to_string_lossy().to_string(),
            out_tel_mp4.to_string_lossy().to_string(),
            0.0,
            clip_dur,
            0.8,
            1.0,
            Some(tiny_png_b64.to_string()),
            None,
            Some(720),
            None,
            Some(stops.clone()),
            Some(true),
        )
        .expect("burn_telestration_clip_ffmpeg multi-stop + clean replay failed");

        let tel_info =
            probe_video_info(&out_tel_mp4.to_string_lossy()).expect("probe mfs tel failed");
        assert_eq!(tel_info.width, 1280);
        assert_eq!(tel_info.height, 720);
        assert!(tel_info.has_audio);
        assert!(
            tel_info.duration >= clip_dur * 2.0 + total_freeze - 0.15,
            "expected multi-freeze + clean replay duration >= {:.2}s, got {:.3}s",
            clip_dur * 2.0 + total_freeze - 0.15,
            tel_info.duration
        );

        export_whatsapp_clip_ffmpeg(
            src_mp4.to_string_lossy().to_string(),
            out_wa_mp4.to_string_lossy().to_string(),
            0.0,
            clip_dur,
            Some(0.8),
            Some(1.0),
            Some(tiny_png_b64.to_string()),
            None,
            Some(stops),
            Some(true),
        )
        .expect("export_whatsapp_clip_ffmpeg multi-stop + clean replay failed");

        let wa_info = probe_video_info(&out_wa_mp4.to_string_lossy()).expect("probe mfs wa failed");
        assert_eq!(wa_info.height, 720);
        assert!(wa_info.has_audio);
        assert!(
            wa_info.duration >= clip_dur * 2.0 + total_freeze - 0.15,
            "expected WhatsApp multi-freeze + clean replay duration >= {:.2}s, got {:.3}s",
            clip_dur * 2.0 + total_freeze - 0.15,
            wa_info.duration
        );
    }

    #[test]
    fn test_build_format_filter_graph_landscape_and_vertical() {
        let (vf_land, fc_land) = build_format_filter_graph(1920, 1080, false);
        assert!(fc_land.is_none());
        let vf = vf_land.unwrap();
        assert!(vf.contains("scale=1920:1080"));
        assert!(vf.contains("pad=1920:1080"));

        let (vf_vert, fc_vert) = build_format_filter_graph(720, 1280, true);
        assert!(vf_vert.is_none());
        let fc = fc_vert.unwrap();
        assert!(fc.contains("boxblur=20:5"));
        assert!(fc.contains("crop=720:1280"));
        assert!(fc.contains("[vout]"));
    }
}

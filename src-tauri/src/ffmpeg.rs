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
            let candidate = dir.join(name);
            if candidate.exists() {
                return candidate.to_string_lossy().to_string();
            }
            let exe_candidate = dir.join(format!("{}.exe", name));
            if exe_candidate.exists() {
                return exe_candidate.to_string_lossy().to_string();
            }
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

static ENCODER_CACHE: OnceLock<(&'static str, Vec<&'static str>)> = OnceLock::new();

pub fn detect_video_encoder() -> (&'static str, Vec<&'static str>) {
    ENCODER_CACHE
        .get_or_init(|| {
            let ffmpeg = resolve_bin("ffmpeg");
            let encoders_out = Command::new(&ffmpeg)
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
    Command::new(ffmpeg)
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
    let out = Command::new(&ffmpeg)
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
    let out = Command::new(&ffprobe)
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

    let overlay_path = match overlay_base64 {
        Some(ref b64) if !b64.trim().is_empty() => {
            let p = decode_base64_to_temp(b64, "futsaltag_tel_overlay", "png")?;
            cleanup.0.push(p.clone());
            Some(p)
        }
        _ => None,
    };

    let dur_total = duration_sec.max(0.2);
    let end_sec = start_sec + dur_total;
    let actual_freeze = freeze_sec.clamp(start_sec, end_sec);
    let dur_before = (actual_freeze - start_sec).max(0.0);
    let dur_after = (end_sec - actual_freeze).max(0.0);

    let mut parts_to_concat: Vec<String> = Vec::new();

    if dur_before > 0.08 {
        let p1 = temp_dir.join(format!("futsaltag_part1_{}.mp4", now));
        cleanup.0.push(p1.clone());
        let p1_str = p1.to_string_lossy().to_string();
        let args = build_norm_segment_args(
            &input_path,
            &p1_str,
            start_sec.max(0.0),
            dur_before,
            out_w,
            out_h,
            info.has_audio,
        );
        run_ffmpeg(&args)?;
        parts_to_concat.push(p1_str);
    }

    if pause_duration > 0.2 {
        let pf = temp_dir.join(format!("futsaltag_freeze_{}.mp4", now));
        cleanup.0.push(pf.clone());
        let pf_str = pf.to_string_lossy().to_string();
        let (vcodec, vflags) = detect_video_encoder();

        let mut args = vec![
            "-y".into(),
            "-ss".into(),
            format!("{:.3}", actual_freeze),
            "-i".into(),
            input_path.clone(),
        ];

        if let Some(ref op) = overlay_path {
            let fc = format!(
                "[0:v]scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration={pd:.3}[bg];[1:v]scale={w}:{h}[fg];[bg][fg]overlay=0:0:shortest=1,fps=30,format=yuv420p[v]",
                w = out_w,
                h = out_h,
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
                "scale={w}:{h}:force_original_aspect_ratio=decrease,pad={w}:{h}:(ow-iw)/2:(oh-ih)/2,setsar=1,tpad=stop_mode=clone:stop_duration={pd:.3},fps=30,format=yuv420p",
                w = out_w,
                h = out_h,
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
            pf_str.clone(),
        ]);

        run_ffmpeg(&args)?;
        parts_to_concat.push(pf_str);
    }

    if dur_after > 0.08 {
        let p3 = temp_dir.join(format!("futsaltag_part3_{}.mp4", now));
        cleanup.0.push(p3.clone());
        let p3_str = p3.to_string_lossy().to_string();
        let args = build_norm_segment_args(
            &input_path,
            &p3_str,
            actual_freeze,
            dur_after,
            out_w,
            out_h,
            info.has_audio,
        );
        run_ffmpeg(&args)?;
        parts_to_concat.push(p3_str);
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

    if has_overlay || has_vo {
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

    let mut child = Command::new(&ffmpeg)
        .args([
            "-v",
            "error",
            "-ss",
            &format!("{:.3}", start_sec.max(0.0)),
            "-i",
            input_path,
            "-t",
            &format!("{:.3}", dur),
            "-vf",
            &format!("fps={:.3},scale={}:{}", sample_fps, out_w, out_h),
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
        );
        assert!(res.is_ok(), "burn_telestration_clip_ffmpeg failed: {:?}", res);

        let out_info = probe_video_info(&out_mp4.to_string_lossy()).expect("output ffprobe failed");
        assert_eq!(out_info.width, 1280);
        assert_eq!(out_info.height, 720);
        assert!(out_info.duration >= 2.5, "output duration should include 1s freeze");
    }
}

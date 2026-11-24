use base64::prelude::*;
use std::fs;
use std::io::Write;
use std::process::Command;

// Command to greet / health check
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Futsal Video Analyser Engine is ready.", name)
}

// Command to render video clip with FFmpeg (supports both fast stream-copy and re-encode)
#[tauri::command]
fn render_video_clip_ffmpeg(
    input_path: String,
    output_path: String,
    start_sec: f64,
    duration_sec: f64,
    fast_copy: Option<bool>,
) -> Result<String, String> {
    let use_copy = fast_copy.unwrap_or(true);

    if use_copy {
        // Mode 1: Fast stream-copy without re-encoding (0.1s execution ala Momen Sports)
        let copy_status = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss",
                &format!("{:.3}", start_sec),
                "-i",
                &input_path,
                "-t",
                &format!("{:.3}", duration_sec),
                "-c",
                "copy",
                "-avoid_negative_ts",
                "make_zero",
                &output_path,
            ])
            .status();

        if let Ok(st) = copy_status {
            if st.success() {
                return Ok(format!("Berhasil mengekspor klip kilat (stream copy) ke {}", output_path));
            }
        }
    }

    // Mode 2: Full accurate re-encoding with libx264 (fallback or when telestration burn-in is needed)
    let reencode_status = Command::new("ffmpeg")
        .args([
            "-y",
            "-ss",
            &format!("{:.3}", start_sec),
            "-i",
            &input_path,
            "-t",
            &format!("{:.3}", duration_sec),
            "-c:v",
            "libx264",
            "-preset",
            "fast",
            "-crf",
            "22",
            "-c:a",
            "aac",
            &output_path,
        ])
        .status()
        .map_err(|e| format!("Gagal menjalankan FFmpeg: {}", e))?;

    if reencode_status.success() {
        Ok(format!("Berhasil mengekspor klip (re-encode) ke {}", output_path))
    } else {
        Err("FFmpeg gagal mengekspor klip".to_string())
    }
}

// Command to concatenate multiple clips into a presentation compilation video
#[tauri::command]
fn concat_playlist_ffmpeg(
    clip_paths: Vec<String>,
    output_path: String,
) -> Result<String, String> {
    if clip_paths.is_empty() {
        return Err("Daftar klip kosong".to_string());
    }

    // Create a temporary list file for ffmpeg concat demuxer
    let temp_list_path = std::env::temp_dir().join(format!("futsaltag_concat_{}.txt", std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap().as_millis()));
    let mut file = fs::File::create(&temp_list_path)
        .map_err(|e| format!("Gagal membuat file daftar sementara: {}", e))?;

    for p in &clip_paths {
        // Format: file 'C:\path\to\clip.mp4' (escaped for ffmpeg)
        let normalized = p.replace('\\', "/");
        writeln!(file, "file '{}'", normalized)
            .map_err(|e| format!("Gagal menulis daftar klip: {}", e))?;
    }
    drop(file);

    let status = Command::new("ffmpeg")
        .args([
            "-y",
            "-f",
            "concat",
            "-safe",
            "0",
            "-i",
            temp_list_path.to_str().unwrap_or(""),
            "-c",
            "copy",
            &output_path,
        ])
        .status()
        .map_err(|e| format!("Gagal menjalankan penggabungan klip FFmpeg: {}", e))?;

    let _ = fs::remove_file(&temp_list_path);

    if status.success() {
        Ok(format!("Berhasil menggabungkan {} klip playlist ke {}", clip_paths.len(), output_path))
    } else {
        Err("FFmpeg gagal menggabungkan playlist video".to_string())
    }
}

// Command to burn telestration drawing and freeze-frame into exported video (Once Sport level)
#[tauri::command]
fn burn_telestration_clip_ffmpeg(
    input_path: String,
    output_path: String,
    start_sec: f64,
    duration_sec: f64,
    freeze_sec: f64,
    pause_duration: f64,
    overlay_base64: Option<String>,
) -> Result<String, String> {
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_millis();
    let temp_dir = std::env::temp_dir();

    // 1. If overlay base64 is provided, decode and save as temporary PNG
    let overlay_path = if let Some(b64) = overlay_base64 {
        let clean_b64 = if let Some(idx) = b64.find("base64,") {
            &b64[idx + 7..]
        } else {
            &b64
        };
        let decoded = BASE64_STANDARD
            .decode(clean_b64.trim())
            .map_err(|e| format!("Gagal mendecode overlay base64: {}", e))?;
        let p = temp_dir.join(format!("futsaltag_tel_overlay_{}.png", now));
        fs::write(&p, decoded).map_err(|e| format!("Gagal menyimpan overlay gambar: {}", e))?;
        Some(p)
    } else {
        None
    };

    // Calculate segment timings
    let end_sec = start_sec + duration_sec;
    let actual_freeze = freeze_sec.clamp(start_sec, end_sec);
    let dur_before = (actual_freeze - start_sec).max(0.0);
    let dur_after = (end_sec - actual_freeze).max(0.0);

    let mut parts_to_concat: Vec<String> = Vec::new();

    // Segment 1: Part Before Freeze (if > 0.05s)
    if dur_before > 0.05 {
        let part1_path = temp_dir.join(format!("futsaltag_part1_{}.mp4", now));
        let st = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss",
                &format!("{:.3}", start_sec),
                "-i",
                &input_path,
                "-t",
                &format!("{:.3}", dur_before),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "22",
                "-c:a",
                "aac",
                part1_path.to_str().unwrap(),
            ])
            .status()
            .map_err(|e| format!("Gagal memotong segmen awal: {}", e))?;
        if st.success() {
            parts_to_concat.push(part1_path.to_str().unwrap().to_string());
        }
    }

    // Segment 2: Freeze-frame segment with telestration overlay (held for pause_duration)
    if pause_duration > 0.2 {
        let freeze_path = temp_dir.join(format!("futsaltag_freeze_{}.mp4", now));
        let mut cmd = Command::new("ffmpeg");
        cmd.args(["-y", "-ss", &format!("{:.3}", actual_freeze), "-i", &input_path]);

        if let Some(ref op) = overlay_path {
            cmd.args([
                "-loop",
                "1",
                "-i",
                op.to_str().unwrap(),
                "-filter_complex",
                "[0:v]scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2[bg];[1:v]scale=1920:1080[fg];[bg][fg]overlay=0:0:shortest=1[v]",
                "-map",
                "[v]",
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-map",
                "2:a",
                "-t",
                &format!("{:.3}", pause_duration),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "22",
                "-c:a",
                "aac",
                freeze_path.to_str().unwrap(),
            ]);
        } else {
            cmd.args([
                "-f",
                "lavfi",
                "-i",
                "anullsrc=channel_layout=stereo:sample_rate=44100",
                "-map",
                "0:v",
                "-map",
                "1:a",
                "-t",
                &format!("{:.3}", pause_duration),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "22",
                "-c:a",
                "aac",
                freeze_path.to_str().unwrap(),
            ]);
        }

        let st = cmd
            .status()
            .map_err(|e| format!("Gagal merender segmen freeze: {}", e))?;
        if st.success() {
            parts_to_concat.push(freeze_path.to_str().unwrap().to_string());
        }
    }

    // Segment 3: Part After Freeze (if > 0.05s)
    if dur_after > 0.05 {
        let part3_path = temp_dir.join(format!("futsaltag_part3_{}.mp4", now));
        let st = Command::new("ffmpeg")
            .args([
                "-y",
                "-ss",
                &format!("{:.3}", actual_freeze),
                "-i",
                &input_path,
                "-t",
                &format!("{:.3}", dur_after),
                "-c:v",
                "libx264",
                "-preset",
                "veryfast",
                "-crf",
                "22",
                "-c:a",
                "aac",
                part3_path.to_str().unwrap(),
            ])
            .status()
            .map_err(|e| format!("Gagal memotong segmen akhir: {}", e))?;
        if st.success() {
            parts_to_concat.push(part3_path.to_str().unwrap().to_string());
        }
    }

    // 4. Concatenate segments
    if parts_to_concat.is_empty() {
        return Err("Tidak ada segmen video yang berhasil dibuat".to_string());
    }

    if parts_to_concat.len() == 1 {
        fs::copy(&parts_to_concat[0], &output_path)
            .map_err(|e| format!("Gagal menyalin hasil video: {}", e))?;
    } else {
        let list_path = temp_dir.join(format!("futsaltag_concat_{}.txt", now));
        let mut list_file = fs::File::create(&list_path)
            .map_err(|e| format!("Gagal membuat file daftar concat: {}", e))?;
        for p in &parts_to_concat {
            writeln!(list_file, "file '{}'", p.replace('\\', "/"))
                .map_err(|e| format!("Gagal menulis daftar concat: {}", e))?;
        }
        drop(list_file);

        let concat_st = Command::new("ffmpeg")
            .args([
                "-y",
                "-f",
                "concat",
                "-safe",
                "0",
                "-i",
                list_path.to_str().unwrap(),
                "-c",
                "copy",
                &output_path,
            ])
            .status()
            .map_err(|e| format!("Gagal menggabungkan segmen telestrasi: {}", e))?;

        let _ = fs::remove_file(&list_path);

        if !concat_st.success() {
            return Err("FFmpeg gagal menggabungkan segmen video telestrasi".to_string());
        }
    }

    // Cleanup temporary files
    if let Some(ref op) = overlay_path {
        let _ = fs::remove_file(op);
    }
    for p in &parts_to_concat {
        let _ = fs::remove_file(p);
    }

    Ok(format!("Berhasil mengekspor klip telestrasi broadcast ke: {}", output_path))
}

// Command to save project file (.futsal JSON)
#[tauri::command]
fn save_project_file(file_path: String, content: String) -> Result<String, String> {
    fs::write(&file_path, content)
        .map_err(|e| format!("Gagal menyimpan berkas proyek: {}", e))?;
    Ok(format!("Proyek berhasil disimpan ke {}", file_path))
}

// Command to load project file (.futsal JSON)
#[tauri::command]
fn load_project_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path)
        .map_err(|e| format!("Gagal membaca berkas proyek: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            render_video_clip_ffmpeg,
            concat_playlist_ffmpeg,
            burn_telestration_clip_ffmpeg,
            save_project_file,
            load_project_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

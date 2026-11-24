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
            save_project_file,
            load_project_file,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

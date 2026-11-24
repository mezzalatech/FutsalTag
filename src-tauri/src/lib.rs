use std::process::Command;

// Command to greet
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Teleslator Futsal Engine is ready.", name)
}

// Command to render video clip with FFmpeg
#[tauri::command]
fn render_video_clip_ffmpeg(
    input_path: String,
    output_path: String,
    start_sec: f64,
    duration_sec: f64,
) -> Result<String, String> {
    let status = Command::new("ffmpeg")
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

    if status.success() {
        Ok(format!("Berhasil mengekspor klip ke {}", output_path))
    } else {
        Err("FFmpeg gagal mengekspor klip".to_string())
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            render_video_clip_ffmpeg
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

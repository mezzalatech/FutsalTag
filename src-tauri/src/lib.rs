mod ai_tracker;
mod ffmpeg;

use std::fs;
use std::path::Path;

#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! Futsal Video Analyser Engine is ready.", name)
}

#[tauri::command]
fn get_temp_dir() -> String {
    std::env::temp_dir().to_string_lossy().to_string()
}

#[tauri::command]
fn ensure_dir(path: String) -> Result<(), String> {
    fs::create_dir_all(&path).map_err(|e| format!("Gagal membuat folder '{}': {}", path, e))
}

#[tauri::command]
fn cleanup_temp_files(paths: Vec<String>) -> Result<usize, String> {
    let mut removed = 0usize;
    for p in paths {
        if Path::new(&p).exists() && fs::remove_file(&p).is_ok() {
            removed += 1;
        }
    }
    Ok(removed)
}

#[tauri::command]
fn save_project_file(file_path: String, content: String) -> Result<String, String> {
    if let Some(parent) = Path::new(&file_path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Gagal membuat folder proyek: {}", e))?;
        }
    }
    fs::write(&file_path, content)
        .map_err(|e| format!("Gagal menyimpan berkas proyek: {}", e))?;
    Ok(file_path)
}

#[tauri::command]
fn load_project_file(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path)
        .map_err(|e| format!("Gagal membaca berkas proyek: {}", e))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            greet,
            get_temp_dir,
            ensure_dir,
            cleanup_temp_files,
            save_project_file,
            load_project_file,
            ffmpeg::render_video_clip_ffmpeg,
            ffmpeg::concat_playlist_ffmpeg,
            ffmpeg::burn_telestration_clip_ffmpeg,
            ffmpeg::export_whatsapp_clip_ffmpeg,
            ai_tracker::check_ai_model_status,
            ai_tracker::detect_players_in_frame_onnx,
            ai_tracker::run_multi_player_tracking_onnx,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

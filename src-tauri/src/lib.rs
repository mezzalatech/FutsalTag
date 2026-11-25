mod ai_tracker;
mod ffmpeg;
mod player_segmentation;

use base64::prelude::*;
use std::fs;
use std::path::Path;
use tauri::Manager;

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

#[tauri::command]
fn save_club_library(app: tauri::AppHandle, content: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal mengakses AppData: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Gagal membuat folder AppData: {}", e))?;
    let file_path = dir.join("club_library.json");
    fs::write(&file_path, content).map_err(|e| format!("Gagal menyimpan library klub: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_club_library(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal mengakses AppData: {}", e))?;
    let file_path = dir.join("club_library.json");
    if !file_path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&file_path)
        .map_err(|e| format!("Gagal membaca library klub: {}", e))?;
    Ok(Some(data))
}

#[tauri::command]
fn save_autosave_project(app: tauri::AppHandle, content: String) -> Result<String, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal mengakses AppData: {}", e))?;
    fs::create_dir_all(&dir).map_err(|e| format!("Gagal membuat folder AppData: {}", e))?;
    let file_path = dir.join("autosave_project.futsal");
    fs::write(&file_path, content).map_err(|e| format!("Gagal menyimpan auto-save: {}", e))?;
    Ok(file_path.to_string_lossy().to_string())
}

#[tauri::command]
fn load_autosave_project(app: tauri::AppHandle) -> Result<Option<String>, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal mengakses AppData: {}", e))?;
    let file_path = dir.join("autosave_project.futsal");
    if !file_path.exists() {
        return Ok(None);
    }
    let data = fs::read_to_string(&file_path)
        .map_err(|e| format!("Gagal membaca auto-save: {}", e))?;
    Ok(Some(data))
}

#[tauri::command]
fn clear_autosave_project(app: tauri::AppHandle) -> Result<(), String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Gagal mengakses AppData: {}", e))?;
    let file_path = dir.join("autosave_project.futsal");
    if file_path.exists() {
        fs::remove_file(&file_path).map_err(|e| format!("Gagal menghapus auto-save: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
fn save_binary_file(file_path: String, base64_content: String) -> Result<String, String> {
    if let Some(parent) = Path::new(&file_path).parent() {
        if !parent.as_os_str().is_empty() {
            fs::create_dir_all(parent)
                .map_err(|e| format!("Gagal membuat folder output: {}", e))?;
        }
    }
    let clean = if let Some(idx) = base64_content.find("base64,") {
        &base64_content[idx + 7..]
    } else {
        base64_content.as_str()
    };
    let bytes = BASE64_STANDARD
        .decode(clean.trim())
        .map_err(|e| format!("Gagal decode base64 file biner: {}", e))?;
    fs::write(&file_path, bytes).map_err(|e| format!("Gagal menyimpan file biner: {}", e))?;
    Ok(file_path)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            if let Some(window) = app.get_webview_window("main") {
                let _ = window.center();
                let _ = window.show();
                let _ = window.unminimize();
                let _ = window.set_focus();
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            get_temp_dir,
            ensure_dir,
            cleanup_temp_files,
            save_project_file,
            load_project_file,
            save_club_library,
            load_club_library,
            save_autosave_project,
            load_autosave_project,
            clear_autosave_project,
            save_binary_file,
            ffmpeg::render_video_clip_ffmpeg,
            ffmpeg::concat_playlist_ffmpeg,
            ffmpeg::burn_telestration_clip_ffmpeg,
            ffmpeg::burn_animated_telestration_clip_ffmpeg,
            ffmpeg::save_overlay_frame_png,
            ffmpeg::cleanup_temp_dir,
            ffmpeg::export_whatsapp_clip_ffmpeg,
            ai_tracker::check_ai_model_status,
            ai_tracker::detect_players_in_frame_onnx,
            ai_tracker::detect_player_boxes_range_onnx,
            ai_tracker::run_multi_player_tracking_onnx,
            ai_tracker::track_single_player_onnx,
            ai_tracker::track_guided_anchors_onnx,
            player_segmentation::check_seg_model_status,
            player_segmentation::segment_players_in_frame_onnx,
            player_segmentation::segment_players_range_onnx,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

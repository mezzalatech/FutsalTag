mod ai_tracker;
mod court_calibration;
mod ffmpeg;
mod player_segmentation;
mod whistle_detector;
mod whisper_asr;
mod xlsx_export;

use base64::prelude::*;
use serde::Serialize;
use std::fs;
use std::path::{Path, PathBuf};
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

#[derive(Serialize)]
struct ScannedMatchFile {
    file_path: String,
    file_name: String,
    content: String,
}

#[derive(Serialize)]
struct ScanMatchFolderResult {
    folder_path: String,
    files: Vec<ScannedMatchFile>,
}

fn scan_match_dir(dir: &Path) -> Result<Vec<ScannedMatchFile>, String> {
    fs::create_dir_all(dir)
        .map_err(|e| format!("Gagal menyiapkan folder pustaka '{}': {}", dir.display(), e))?;
    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Gagal membaca folder pustaka '{}': {}", dir.display(), e))?;

    let mut files = Vec::new();
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_file() {
            continue;
        }
        let file_name = entry.file_name().to_string_lossy().to_string();
        let lower_name = file_name.to_lowercase();
        if lower_name == "autosave_project.futsal" || lower_name == "club_library.json" {
            continue;
        }
        let ext = path
            .extension()
            .and_then(|s| s.to_str())
            .map(|s| s.to_lowercase())
            .unwrap_or_default();
        if ext != "futsal" && ext != "json" {
            continue;
        }
        if let Ok(content) = fs::read_to_string(&path) {
            files.push(ScannedMatchFile {
                file_path: path.to_string_lossy().to_string(),
                file_name,
                content,
            });
        }
    }
    files.sort_by(|a, b| a.file_name.to_lowercase().cmp(&b.file_name.to_lowercase()));
    Ok(files)
}

#[tauri::command]
fn scan_match_library_folder(
    app: tauri::AppHandle,
    folder_path: Option<String>,
) -> Result<ScanMatchFolderResult, String> {
    let dir = match folder_path.filter(|p| !p.trim().is_empty()) {
        Some(p) => PathBuf::from(p),
        None => app
            .path()
            .document_dir()
            .map(|d| d.join("FutsalTag_Matches"))
            .or_else(|_| app.path().app_data_dir().map(|d| d.join("match_library")))
            .map_err(|e| format!("Gagal menentukan folder pustaka default: {}", e))?,
    };
    let files = scan_match_dir(&dir)?;
    Ok(ScanMatchFolderResult {
        folder_path: dir.to_string_lossy().to_string(),
        files,
    })
}

#[tauri::command]
fn check_file_exists(file_path: String) -> bool {
    Path::new(&file_path).is_file()
}

#[tauri::command]
fn delete_project_file(file_path: String) -> Result<(), String> {
    let path = Path::new(&file_path);
    let ext = path
        .extension()
        .and_then(|s| s.to_str())
        .map(|s| s.to_lowercase())
        .unwrap_or_default();
    if ext != "futsal" && ext != "json" {
        return Err("Hanya file proyek .futsal atau .json yang dapat dihapus.".into());
    }
    if !path.is_file() {
        return Err(format!("File proyek '{}' tidak ditemukan.", file_path));
    }
    fs::remove_file(path).map_err(|e| format!("Gagal menghapus file proyek: {}", e))
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
            scan_match_library_folder,
            check_file_exists,
            delete_project_file,
            ffmpeg::render_video_clip_ffmpeg,
            ffmpeg::concat_playlist_ffmpeg,
            ffmpeg::merge_source_videos_ffmpeg,
            ffmpeg::burn_telestration_clip_ffmpeg,
            ffmpeg::burn_animated_telestration_clip_ffmpeg,
            ffmpeg::save_overlay_frame_png,
            ffmpeg::cleanup_temp_dir,
            ffmpeg::export_whatsapp_clip_ffmpeg,
            ffmpeg::export_formatted_clip_ffmpeg,
            ai_tracker::check_ai_model_status,
            ai_tracker::detect_players_in_frame_onnx,
            ai_tracker::detect_player_boxes_range_onnx,
            ai_tracker::run_multi_player_tracking_onnx,
            ai_tracker::track_single_player_onnx,
            ai_tracker::track_guided_anchors_onnx,
            player_segmentation::check_seg_model_status,
            player_segmentation::segment_players_in_frame_onnx,
            player_segmentation::segment_players_range_onnx,
            court_calibration::auto_calibrate_court_frame,
            court_calibration::track_court_calibration_range,
            whistle_detector::detect_match_whistles_ffmpeg,
            whisper_asr::check_whisper_status,
            whisper_asr::transcribe_voiceover_base64_whisper,
            whisper_asr::transcribe_video_clip_whisper,
            xlsx_export::export_native_xlsx,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

#[cfg(test)]
mod tests {
    use super::{delete_project_file, scan_match_dir};
    use std::fs;

    #[test]
    fn test_scan_match_dir_filters_and_sorts() {
        let dir = std::env::temp_dir().join(format!(
            "futsaltag_scan_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        fs::write(dir.join("match_b.futsal"), "{\"tags\":[]}").unwrap();
        fs::write(dir.join("match_a.json"), "{\"tags\":[]}").unwrap();
        fs::write(dir.join("autosave_project.futsal"), "{}").unwrap();
        fs::write(dir.join("notes.txt"), "ignore").unwrap();

        let scanned = scan_match_dir(&dir).unwrap();
        let names: Vec<&str> = scanned.iter().map(|f| f.file_name.as_str()).collect();
        assert_eq!(names, vec!["match_a.json", "match_b.futsal"]);

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_delete_project_file_validates_extension() {
        let dir = std::env::temp_dir().join(format!(
            "futsaltag_del_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        fs::create_dir_all(&dir).unwrap();
        let futsal_path = dir.join("sample.futsal");
        let mp4_path = dir.join("video.mp4");
        fs::write(&futsal_path, "{}").unwrap();
        fs::write(&mp4_path, "dummy").unwrap();

        assert!(delete_project_file(mp4_path.to_string_lossy().to_string()).is_err());
        assert!(mp4_path.exists());

        assert!(delete_project_file(futsal_path.to_string_lossy().to_string()).is_ok());
        assert!(!futsal_path.exists());

        let _ = fs::remove_dir_all(&dir);
    }
}

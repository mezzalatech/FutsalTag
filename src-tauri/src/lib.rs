mod ai_tracker;
mod cloud_sync;
mod court_calibration;
mod ffmpeg;
mod player_segmentation;
mod remote_server;
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
fn open_projector_window(app: tauri::AppHandle) -> Result<(), String> {
    if let Some(win) = app.get_webview_window("projector") {
        let _ = win.show();
        let _ = win.set_focus();
        return Ok(());
    }
    tauri::WebviewWindowBuilder::new(
        &app,
        "projector",
        tauri::WebviewUrl::App("index.html?screen=presenter".into()),
    )
    .title("ARF FutsalTag — Layar Proyektor")
    .inner_size(1280.0, 720.0)
    .resizable(true)
    .build()
    .map_err(|e| format!("Gagal membuka jendela proyektor kedua: {}", e))?;
    Ok(())
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

#[tauri::command]
fn scan_folder_for_relink(
    folder_path: String,
    target_filenames: Vec<String>,
) -> Result<std::collections::HashMap<String, String>, String> {
    let dir = Path::new(&folder_path);
    if !dir.is_dir() {
        return Err(format!("Folder '{}' tidak ditemukan.", folder_path));
    }
    let mut targets_lower: std::collections::HashMap<String, String> = std::collections::HashMap::new();
    for target in target_filenames {
        let name = Path::new(&target)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or(&target)
            .to_string();
        if !name.trim().is_empty() {
            targets_lower.insert(name.to_lowercase(), name);
        }
    }
    let mut found_matches: std::collections::HashMap<String, String> = std::collections::HashMap::new();

    if let Ok(entries) = fs::read_dir(dir) {
        for entry in entries.flatten() {
            let p = entry.path();
            if p.is_file() {
                if let Some(fname) = p.file_name().and_then(|s| s.to_str()) {
                    if let Some(orig) = targets_lower.get(&fname.to_lowercase()) {
                        found_matches.insert(orig.clone(), p.to_string_lossy().to_string());
                    }
                }
            } else if p.is_dir() {
                if let Ok(sub) = fs::read_dir(&p) {
                    for sub_entry in sub.flatten() {
                        let sub_p = sub_entry.path();
                        if sub_p.is_file() {
                            if let Some(fname) = sub_p.file_name().and_then(|s| s.to_str()) {
                                if let Some(orig) = targets_lower.get(&fname.to_lowercase()) {
                                    found_matches
                                        .entry(orig.clone())
                                        .or_insert_with(|| sub_p.to_string_lossy().to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }
    Ok(found_matches)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
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
            scan_folder_for_relink,
            ffmpeg::render_video_clip_ffmpeg,
            ffmpeg::render_still_slide_ffmpeg,
            ffmpeg::concat_playlist_ffmpeg,
            ffmpeg::merge_source_videos_ffmpeg,
            ffmpeg::check_online_tools_status,
            ffmpeg::install_yt_dlp_tool,
            ffmpeg::download_online_video_ffmpeg,
            ffmpeg::list_capture_devices_ffmpeg,
            ffmpeg::start_capture_temp_file,
            ffmpeg::append_capture_chunk,
            ffmpeg::finalize_capture_mp4_ffmpeg,
            ffmpeg::start_dshow_capture_ffmpeg,
            ffmpeg::stop_dshow_capture_ffmpeg,
            remote_server::start_remote_server,
            remote_server::stop_remote_server,
            remote_server::get_remote_server_status,
            remote_server::update_remote_server_state,
            remote_server::kick_remote_phone,
            open_projector_window,
            cloud_sync::upload_file_cloud,
            cloud_sync::upload_text_cloud,
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
    use super::{delete_project_file, scan_folder_for_relink, scan_match_dir};
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

    #[test]
    fn test_scan_folder_for_relink_matches_case_insensitively_and_subdirs() {
        let dir = std::env::temp_dir().join(format!(
            "futsaltag_relink_test_{}",
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_nanos()
        ));
        let sub = dir.join("kamera_sub");
        fs::create_dir_all(&sub).unwrap();

        let file_a = dir.join("Match_Babak_1.mp4");
        let file_b = sub.join("cam_behind_Goal.MP4");
        fs::write(&file_a, "dummy").unwrap();
        fs::write(&file_b, "dummy").unwrap();

        let targets = vec![
            "d:\\old_path\\match_babak_1.mp4".to_string(),
            "cam_behind_goal.mp4".to_string(),
            "missing_video.mp4".to_string(),
        ];

        let res = scan_folder_for_relink(dir.to_string_lossy().to_string(), targets).unwrap();
        assert_eq!(res.len(), 2);
        assert!(res.contains_key("match_babak_1.mp4"));
        assert!(res.contains_key("cam_behind_goal.mp4"));
        assert!(!res.contains_key("missing_video.mp4"));

        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn test_multi_analyst_tag_merge_offset_and_deduplication() {
        // Test kickoff alignment calculation
        let target_kickoff_time = 14.50f64;
        let source_kickoff_time = 10.00f64;
        let calculated_offset = target_kickoff_time - source_kickoff_time;
        assert!((calculated_offset - 4.50).abs() < 1e-4);

        // Test tag shifting
        let source_tag_start = 12.00f64;
        let source_tag_end = 15.00f64;
        let shifted_start = (source_tag_start + calculated_offset).max(0.0);
        let shifted_end = (source_tag_end + calculated_offset).max(shifted_start + 0.2);

        assert!((shifted_start - 16.50).abs() < 1e-4);
        assert!((shifted_end - 19.50).abs() < 1e-4);

        // Test duplicate detection logic with 1.5s tolerance
        let tolerance = 1.50f64;
        let existing_tags = vec![
            ("Shooting", 16.80f64), // diff = 0.30s <= 1.5s -> duplicate!
            ("Passing", 16.50f64),  // different category -> not duplicate!
            ("Shooting", 25.00f64), // different time -> not duplicate!
        ];

        let incoming_category = "Shooting";
        let is_duplicate = existing_tags.iter().any(|(cat, t)| {
            *cat == incoming_category && (t - shifted_start).abs() <= tolerance
        });
        assert!(is_duplicate);

        let incoming_diff_cat = "Counter Attack";
        let is_duplicate_diff = existing_tags.iter().any(|(cat, t)| {
            *cat == incoming_diff_cat && (t - shifted_start).abs() <= tolerance
        });
        assert!(!is_duplicate_diff);
    }

    #[test]
    fn test_training_session_drill_duration_and_json_roundtrip() {
        let session_json = serde_json::json!({
            "id": "session_1",
            "title": "Rotasi 3-1 & Pressing Trap",
            "date": "2026-11-27",
            "overallIntensity": "Tinggi",
            "blocks": [
                { "phase": "warmup", "title": "Rondo 4v2", "durationMinutes": 15 },
                { "phase": "main", "title": "Rotasi 3-1 Flank", "durationMinutes": 30 },
                { "phase": "finishing", "title": "SSG 4v4", "durationMinutes": 20 },
                { "phase": "cooldown", "title": "Evaluasi", "durationMinutes": 10 }
            ]
        });

        let raw = serde_json::to_string(&session_json).unwrap();
        let parsed: serde_json::Value = serde_json::from_str(&raw).unwrap();
        let blocks = parsed["blocks"].as_array().unwrap();
        assert_eq!(blocks.len(), 4);

        let total_minutes: u64 = blocks
            .iter()
            .filter_map(|b| b["durationMinutes"].as_u64())
            .sum();
        assert_eq!(total_minutes, 75);
        assert_eq!(blocks[0]["phase"].as_str().unwrap(), "warmup");
        assert_eq!(blocks[2]["phase"].as_str().unwrap(), "finishing");
    }

    #[test]
    fn test_comet_trail_points_interpolation() {
        // Sample 16 chronological comet trail points across [t_start..t_end]
        let t_min = 2.0f64;
        let current_time = 3.5f64;
        let trail_dur = 0.9f64;
        let t_start = t_min.max(current_time - trail_dur);
        let t_end = current_time;
        assert!((t_start - 2.6).abs() < 1e-4);

        let sample_count = 16usize;
        let mut prev_t = -1.0f64;
        let mut points = Vec::new();
        for i in 0..=sample_count {
            let frac = i as f64 / sample_count as f64;
            let sample_t = t_start + (t_end - t_start) * frac;
            assert!(sample_t >= prev_t);
            prev_t = sample_t;
            points.push((sample_t, frac));
        }
        assert_eq!(points.len(), 17);
        assert!((points[0].1 - 0.0).abs() < 1e-6);
        assert!((points[16].1 - 1.0).abs() < 1e-6);
    }

    #[test]
    fn test_puddle_ripple_expansion_bounds() {
        let count = 3usize;
        let current_time = 4.2f64;
        let base_cycle = (current_time.max(0.0) * 0.85) % 1.0;

        let mut radii = Vec::new();
        for i in 0..count {
            let phase = (base_cycle + i as f64 / count as f64) % 1.0;
            let rx = 22.0 + phase * 82.0;
            let ry = 8.5 + phase * 32.0;
            let alpha = (1.0 - phase).powf(1.45) * 0.85;
            assert!((22.0..=104.0).contains(&rx));
            assert!((8.5..=40.5).contains(&ry));
            assert!((0.0..=0.85).contains(&alpha));
            radii.push(rx);
        }
        assert_eq!(radii.len(), 3);
    }
}

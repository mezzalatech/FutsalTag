use crate::ffmpeg;
use base64::prelude::*;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::time::{Instant, SystemTime, UNIX_EPOCH};
use tauri::Manager;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperModelStatus {
    pub available: bool,
    pub cli_path: Option<String>,
    pub model_path: Option<String>,
    pub engine: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SubtitleCueDto {
    pub start: f64,
    pub end: f64,
    pub text: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhisperTranscriptResult {
    pub full_text: String,
    pub cues: Vec<SubtitleCueDto>,
    pub language: String,
    pub duration_ms: u64,
}

struct FileCleanupGuard(Vec<PathBuf>);

impl Drop for FileCleanupGuard {
    fn drop(&mut self) {
        for p in &self.0 {
            let _ = fs::remove_file(p);
        }
    }
}

pub fn resolve_whisper_cli_path(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    let bin_names = if cfg!(target_os = "windows") {
        vec!["whisper-cli.exe", "main.exe"]
    } else {
        vec!["whisper-cli", "main"]
    };

    if let Some(handle) = app {
        if let Ok(res_dir) = handle.path().resource_dir() {
            for name in &bin_names {
                for rel in [
                    format!("resources/whisper/{}", name),
                    format!("whisper/{}", name),
                    name.to_string(),
                ] {
                    let p = res_dir.join(rel);
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
    }

    if let Ok(exe) = std::env::current_exe() {
        if let Some(dir) = exe.parent() {
            for name in &bin_names {
                let p = dir.join(name);
                if p.exists() {
                    return Some(p);
                }
                let sub = dir.join("whisper").join(name);
                if sub.exists() {
                    return Some(sub);
                }
            }
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for name in &bin_names {
        for p in [
            manifest_dir.join(format!("resources/whisper/{}", name)),
            PathBuf::from(format!("src-tauri/resources/whisper/{}", name)),
            PathBuf::from(format!("resources/whisper/{}", name)),
        ] {
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

pub fn resolve_whisper_model_path(app: Option<&tauri::AppHandle>) -> Option<PathBuf> {
    let model_names = [
        "ggml-base-q5_1.bin",
        "ggml-base-q8_0.bin",
        "ggml-base.bin",
        "ggml-tiny-q5_1.bin",
    ];

    if let Some(handle) = app {
        if let Ok(res_dir) = handle.path().resource_dir() {
            for name in model_names {
                for rel in [
                    format!("resources/models/{}", name),
                    format!("models/{}", name),
                    name.to_string(),
                ] {
                    let p = res_dir.join(rel);
                    if p.exists() {
                        return Some(p);
                    }
                }
            }
        }
    }

    let manifest_dir = PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    for name in model_names {
        for p in [
            manifest_dir.join(format!("resources/models/{}", name)),
            PathBuf::from(format!("src-tauri/resources/models/{}", name)),
            PathBuf::from(format!("resources/models/{}", name)),
        ] {
            if p.exists() {
                return Some(p);
            }
        }
    }
    None
}

fn parse_srt_timestamp(ts: &str) -> Option<f64> {
    let clean = ts.trim().replace(',', ".");
    let parts: Vec<&str> = clean.split(':').collect();
    if parts.len() != 3 {
        return None;
    }
    let h: f64 = parts[0].parse().ok()?;
    let m: f64 = parts[1].parse().ok()?;
    let s: f64 = parts[2].parse().ok()?;
    Some(h * 3600.0 + m * 60.0 + s)
}

fn is_noise_caption(txt: &str) -> bool {
    let t = txt.trim();
    if t.is_empty() {
        return true;
    }
    let upper = t.to_ascii_uppercase();
    if upper == "[BLANK_AUDIO]" || upper == "(BLANK_AUDIO)" || upper == "[SILENCE]" {
        return true;
    }
    (t.starts_with('[') && t.ends_with(']') && !t.contains(' '))
        || (t.starts_with('(') && t.ends_with(')') && !t.contains(' '))
}

pub fn parse_srt_cues(srt: &str) -> Vec<SubtitleCueDto> {
    let normalized = srt.replace("\r\n", "\n");
    let mut cues = Vec::new();

    for block in normalized.split("\n\n") {
        let lines: Vec<&str> = block
            .lines()
            .map(|l| l.trim())
            .filter(|l| !l.is_empty())
            .collect();
        if lines.len() < 2 {
            continue;
        }
        let Some(ts_idx) = lines.iter().position(|l| l.contains("-->")) else {
            continue;
        };
        let mut arrow_parts = lines[ts_idx].split("-->");
        let (Some(start_raw), Some(end_raw)) = (arrow_parts.next(), arrow_parts.next()) else {
            continue;
        };
        let (Some(start), Some(end)) = (parse_srt_timestamp(start_raw), parse_srt_timestamp(end_raw)) else {
            continue;
        };
        let text = lines[(ts_idx + 1)..]
            .join(" ")
            .split_whitespace()
            .collect::<Vec<_>>()
            .join(" ");
        if is_noise_caption(&text) {
            continue;
        }
        cues.push(SubtitleCueDto {
            start,
            end: end.max(start + 0.1),
            text,
        });
    }

    cues
}

pub fn transcribe_wav_file(
    cli_path: &Path,
    model_path: &Path,
    wav_path: &Path,
    lang: &str,
) -> Result<WhisperTranscriptResult, String> {
    let t0 = Instant::now();
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let prefix = std::env::temp_dir().join(format!("futsaltag_whisper_{}_{}", std::process::id(), nonce));
    let srt_path = PathBuf::from(format!("{}.srt", prefix.display()));
    let _guard = FileCleanupGuard(vec![srt_path.clone()]);

    let mut cmd = Command::new(cli_path);
    if let Some(parent) = cli_path.parent() {
        cmd.current_dir(parent);
    }
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let model_str = model_path.to_string_lossy().to_string();
    let wav_str = wav_path.to_string_lossy().to_string();
    let prefix_str = prefix.to_string_lossy().to_string();
    let futsal_prompt = "Istilah futsal: pivot, anchor, flank, kiper, power play, pressing, build-up, rotasi, kick-in, corner, counter attack.";

    let out = cmd
        .args([
            "-m",
            &model_str,
            "-f",
            &wav_str,
            "-l",
            lang,
            "--prompt",
            futsal_prompt,
            "-osrt",
            "-of",
            &prefix_str,
            "-np",
        ])
        .output()
        .map_err(|e| format!("Gagal menjalankan whisper-cli: {}", e))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("whisper-cli gagal memproses audio: {}", stderr.trim()));
    }

    let cues = if srt_path.exists() {
        let srt_content = fs::read_to_string(&srt_path)
            .map_err(|e| format!("Gagal membaca output SRT Whisper: {}", e))?;
        parse_srt_cues(&srt_content)
    } else {
        Vec::new()
    };

    let full_text = if !cues.is_empty() {
        cues.iter()
            .map(|c| c.text.as_str())
            .collect::<Vec<_>>()
            .join(" ")
    } else {
        let raw_stdout = String::from_utf8_lossy(&out.stdout).trim().to_string();
        if is_noise_caption(&raw_stdout) {
            String::new()
        } else {
            raw_stdout
        }
    };

    Ok(WhisperTranscriptResult {
        full_text,
        cues,
        language: lang.to_string(),
        duration_ms: t0.elapsed().as_millis() as u64,
    })
}

fn convert_audio_to_16k_wav(input_audio: &Path, wav_out: &Path) -> Result<(), String> {
    let ffmpeg_bin = ffmpeg::resolve_bin("ffmpeg");
    let mut cmd = Command::new(&ffmpeg_bin);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let out = cmd
        .args([
            "-y",
            "-v",
            "error",
            "-i",
            &input_audio.to_string_lossy(),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            &wav_out.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Gagal menjalankan FFmpeg untuk konversi audio Whisper: {}", e))?;
    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("Konversi audio ke WAV 16kHz gagal: {}", err.trim()));
    }
    Ok(())
}

#[tauri::command]
pub fn check_whisper_status(app: tauri::AppHandle) -> WhisperModelStatus {
    let cli = resolve_whisper_cli_path(Some(&app));
    let model = resolve_whisper_model_path(Some(&app));
    match (cli, model) {
        (Some(c), Some(m)) => {
            let model_name = m
                .file_name()
                .and_then(|s| s.to_str())
                .unwrap_or("ggml-base");
            WhisperModelStatus {
                available: true,
                cli_path: Some(c.to_string_lossy().to_string()),
                model_path: Some(m.to_string_lossy().to_string()),
                engine: format!("Whisper Offline ({})", model_name),
            }
        }
        (c, m) => WhisperModelStatus {
            available: false,
            cli_path: c.map(|p| p.to_string_lossy().to_string()),
            model_path: m.map(|p| p.to_string_lossy().to_string()),
            engine: "Whisper Offline (biner/model belum ditemukan)".to_string(),
        },
    }
}

#[tauri::command]
pub fn transcribe_voiceover_base64_whisper(
    app: tauri::AppHandle,
    audio_base64: String,
    language: Option<String>,
) -> Result<WhisperTranscriptResult, String> {
    let cli_path = resolve_whisper_cli_path(Some(&app))
        .ok_or_else(|| "Biner whisper-cli tidak ditemukan di bundle aplikasi.".to_string())?;
    let model_path = resolve_whisper_model_path(Some(&app))
        .ok_or_else(|| "Model Whisper ggml-base tidak ditemukan di resources/models.".to_string())?;

    let clean_b64 = if let Some(idx) = audio_base64.find("base64,") {
        &audio_base64[idx + 7..]
    } else {
        audio_base64.as_str()
    };
    let bytes = BASE64_STANDARD
        .decode(clean_b64.trim())
        .map_err(|e| format!("Gagal decode audio voiceover base64: {}", e))?;

    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let temp_dir = std::env::temp_dir();
    let in_audio = temp_dir.join(format!("futsaltag_vo_{}_{}.webm", std::process::id(), nonce));
    let wav_path = temp_dir.join(format!("futsaltag_vo_{}_{}.wav", std::process::id(), nonce));
    let _guard = FileCleanupGuard(vec![in_audio.clone(), wav_path.clone()]);

    fs::write(&in_audio, bytes)
        .map_err(|e| format!("Gagal menulis file sementara audio voiceover: {}", e))?;
    convert_audio_to_16k_wav(&in_audio, &wav_path)?;

    let lang = language.unwrap_or_else(|| "id".to_string());
    transcribe_wav_file(&cli_path, &model_path, &wav_path, &lang)
}

#[tauri::command]
pub fn transcribe_video_clip_whisper(
    app: tauri::AppHandle,
    input_path: String,
    start_sec: f64,
    end_sec: f64,
    language: Option<String>,
) -> Result<WhisperTranscriptResult, String> {
    if !Path::new(&input_path).exists() {
        return Err(format!("File video tidak ditemukan: {}", input_path));
    }
    let cli_path = resolve_whisper_cli_path(Some(&app))
        .ok_or_else(|| "Biner whisper-cli tidak ditemukan di bundle aplikasi.".to_string())?;
    let model_path = resolve_whisper_model_path(Some(&app))
        .ok_or_else(|| "Model Whisper ggml-base tidak ditemukan di resources/models.".to_string())?;

    let dur = (end_sec - start_sec).max(0.4);
    let nonce = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let wav_path = std::env::temp_dir().join(format!(
        "futsaltag_clip_vo_{}_{}.wav",
        std::process::id(),
        nonce
    ));
    let _guard = FileCleanupGuard(vec![wav_path.clone()]);

    let ffmpeg_bin = ffmpeg::resolve_bin("ffmpeg");
    let mut cmd = Command::new(&ffmpeg_bin);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    let out = cmd
        .args([
            "-y",
            "-v",
            "error",
            "-ss",
            &format!("{:.3}", start_sec.max(0.0)),
            "-i",
            &input_path,
            "-t",
            &format!("{:.3}", dur),
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-c:a",
            "pcm_s16le",
            &wav_path.to_string_lossy(),
        ])
        .output()
        .map_err(|e| format!("Gagal mengekstrak audio klip dengan FFmpeg: {}", e))?;

    if !out.status.success() {
        let err = String::from_utf8_lossy(&out.stderr);
        return Err(format!("Ekstraksi audio klip untuk Whisper gagal: {}", err.trim()));
    }

    let lang = language.unwrap_or_else(|| "id".to_string());
    transcribe_wav_file(&cli_path, &model_path, &wav_path, &lang)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_srt_cues_handles_indonesian_tactics_and_blank_audio() {
        let sample_srt = "1\r\n00:00:00,120 --> 00:00:02,450\r\nPivot harus tarik dua bek\r\nke ruang flank kiri.\r\n\r\n2\r\n00:00:02,500 --> 00:00:03,100\r\n[BLANK_AUDIO]\r\n\r\n3\r\n00:00:03,200 --> 00:00:05,800\r\nSetelah itu anchor lakukan rotasi cepat!\r\n";
        let cues = parse_srt_cues(sample_srt);
        assert_eq!(cues.len(), 2);
        assert!((cues[0].start - 0.12).abs() < 0.01);
        assert!((cues[0].end - 2.45).abs() < 0.01);
        assert_eq!(cues[0].text, "Pivot harus tarik dua bek ke ruang flank kiri.");
        assert_eq!(cues[1].text, "Setelah itu anchor lakukan rotasi cepat!");
    }

    #[test]
    fn test_whisper_cli_and_model_offline_smoke() {
        let cli_path = resolve_whisper_cli_path(None)
            .expect("whisper-cli.exe harus ada di src-tauri/resources/whisper/");
        let model_path = resolve_whisper_model_path(None)
            .expect("model ggml-base-q5_1.bin harus ada di src-tauri/resources/models/");

        let nonce = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map(|d| d.as_nanos())
            .unwrap_or(0);
        let wav_path = std::env::temp_dir().join(format!("futsaltag_smoke_{}.wav", nonce));
        let _guard = FileCleanupGuard(vec![wav_path.clone()]);

        let ffmpeg_bin = ffmpeg::resolve_bin("ffmpeg");
        let out = Command::new(&ffmpeg_bin)
            .args([
                "-y",
                "-v",
                "error",
                "-f",
                "lavfi",
                "-i",
                "sine=frequency=440:sample_rate=16000:duration=1.5",
                "-ac",
                "1",
                "-c:a",
                "pcm_s16le",
                &wav_path.to_string_lossy(),
            ])
            .output()
            .expect("gagal menjalankan ffmpeg lavfi wav");
        assert!(out.status.success(), "gagal membuat wav test dengan ffmpeg");

        let res = transcribe_wav_file(&cli_path, &model_path, &wav_path, "id")
            .expect("whisper-cli.exe + ggml-base-q5_1.bin gagal dieksekusi offline");
        println!(
            "Whisper smoke test OK in {} ms (lang={}, text='{}')",
            res.duration_ms, res.language, res.full_text
        );
    }
}

use crate::ffmpeg;
use serde::{Deserialize, Serialize};
use std::path::Path;
use std::process::Command;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WhistleCandidateDto {
    pub start_time: f64,
    pub end_time: f64,
    pub peak_time: f64,
    pub duration: f64,
    pub peak_freq_hz: f64,
    pub confidence: f64,
    pub label: String,
}

fn goertzel_power(windowed: &[f32], coeff: f64) -> f64 {
    let mut s_prev = 0.0f64;
    let mut s_prev2 = 0.0f64;
    for &x in windowed {
        let s = x as f64 + coeff * s_prev - s_prev2;
        s_prev2 = s_prev;
        s_prev = s;
    }
    let power = s_prev2 * s_prev2 + s_prev * s_prev - coeff * s_prev * s_prev2;
    power.max(0.0)
}

fn build_goertzel_coeffs(freqs: &[f64], sample_rate: f64, n: usize) -> Vec<f64> {
    freqs
        .iter()
        .map(|&f| {
            let k = (0.5 + (n as f64 * f) / sample_rate).floor();
            let omega = (2.0 * std::f64::consts::PI * k) / n as f64;
            2.0 * omega.cos()
        })
        .collect()
}

pub fn detect_whistles_pcm_16k(
    samples: &[f32],
    sample_rate: u32,
    sensitivity: f64,
) -> Vec<WhistleCandidateDto> {
    let frame_size = 512usize;
    let hop_size = 256usize;
    if samples.len() < frame_size || sample_rate < 8000 {
        return Vec::new();
    }

    let sr = sample_rate as f64;
    let sens = sensitivity.clamp(0.1, 1.0);
    let tonality_thresh = 10.5 - sens * 5.0;
    let snr_thresh = 9.0 - sens * 4.0;

    let whistle_freqs: Vec<f64> = (0..25).map(|i| 2400.0 + i as f64 * 100.0).collect();
    let low_oob_freqs: Vec<f64> = (0..8).map(|i| 500.0 + i as f64 * 200.0).collect();
    let high_oob_freqs: Vec<f64> = (0..5).map(|i| 5400.0 + i as f64 * 400.0).collect();

    let w_coeffs = build_goertzel_coeffs(&whistle_freqs, sr, frame_size);
    let low_coeffs = build_goertzel_coeffs(&low_oob_freqs, sr, frame_size);
    let high_coeffs = build_goertzel_coeffs(&high_oob_freqs, sr, frame_size);

    let hann: Vec<f32> = (0..frame_size)
        .map(|i| {
            let phase = (2.0 * std::f64::consts::PI * i as f64) / (frame_size as f64 - 1.0);
            (0.5 * (1.0 - phase.cos())) as f32
        })
        .collect();

    let num_frames = (samples.len() - frame_size) / hop_size + 1;
    let mut active = Vec::with_capacity(num_frames);
    let mut frame_peak_freq = Vec::with_capacity(num_frames);
    let mut frame_score = Vec::with_capacity(num_frames);
    let mut windowed = vec![0.0f32; frame_size];
    let mut powers = vec![0.0f64; whistle_freqs.len()];

    for fi in 0..num_frames {
        let off = fi * hop_size;
        let mut sq_sum = 0.0f64;
        for i in 0..frame_size {
            let s = samples[off + i];
            sq_sum += (s as f64) * (s as f64);
            windowed[i] = s * hann[i];
        }
        let rms = (sq_sum / frame_size as f64).sqrt();
        if rms < 0.015 {
            active.push(false);
            frame_peak_freq.push(0.0);
            frame_score.push(0.0);
            continue;
        }

        let mut p_peak = 0.0f64;
        let mut best_freq = whistle_freqs[0];
        for (bi, &coeff) in w_coeffs.iter().enumerate() {
            let p = goertzel_power(&windowed, coeff);
            powers[bi] = p;
            if p > p_peak {
                p_peak = p;
                best_freq = whistle_freqs[bi];
            }
        }

        let mut sorted = powers.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
        let p_med = sorted[sorted.len() / 2];

        let mut oob_sum = 0.0f64;
        let oob_cnt = (low_coeffs.len() + high_coeffs.len()) as f64;
        for &c in &low_coeffs {
            oob_sum += goertzel_power(&windowed, c);
        }
        for &c in &high_coeffs {
            oob_sum += goertzel_power(&windowed, c);
        }
        let p_oob = oob_sum / oob_cnt.max(1.0);

        let tonality = p_peak / (p_med + 1e-9);
        let band_snr = p_peak / (p_oob + 1e-9);
        let is_hit = tonality >= tonality_thresh && band_snr >= snr_thresh;

        active.push(is_hit);
        frame_peak_freq.push(best_freq);
        frame_score.push(if is_hit { tonality + band_snr * 0.5 } else { 0.0 });
    }

    // Group active frames bridging short pea-whistle flutter gaps (<= 5 frames = 80 ms)
    let mut raw_segments: Vec<(usize, usize)> = Vec::new();
    let mut idx = 0usize;
    while idx < num_frames {
        if !active[idx] {
            idx += 1;
            continue;
        }
        let start = idx;
        let mut end = idx;
        let mut gap = 0usize;
        idx += 1;
        while idx < num_frames {
            if active[idx] {
                end = idx;
                gap = 0;
            } else {
                gap += 1;
                if gap > 5 {
                    break;
                }
            }
            idx += 1;
        }
        raw_segments.push((start, end));
    }

    let hop_sec = hop_size as f64 / sr;
    let frame_sec = frame_size as f64 / sr;
    let mut candidates: Vec<WhistleCandidateDto> = Vec::new();

    for (s_idx, e_idx) in raw_segments {
        let start_time = s_idx as f64 * hop_sec;
        let end_time = e_idx as f64 * hop_sec + frame_sec;
        let duration = end_time - start_time;
        if !(0.14..=3.5).contains(&duration) {
            continue;
        }

        let mut best_i = s_idx;
        let mut best_sc = -1.0f64;
        let mut sc_sum = 0.0f64;
        let mut sc_cnt = 0usize;
        for i in s_idx..=e_idx {
            if active[i] {
                sc_sum += frame_score[i];
                sc_cnt += 1;
                if frame_score[i] > best_sc {
                    best_sc = frame_score[i];
                    best_i = i;
                }
            }
        }
        let mean_sc = if sc_cnt > 0 { sc_sum / sc_cnt as f64 } else { 0.0 };
        let conf = (0.35 + (mean_sc / 45.0) * 0.64).clamp(0.35, 0.99);
        let peak_time = best_i as f64 * hop_sec + frame_sec * 0.5;
        let peak_freq_hz = frame_peak_freq[best_i];
        let label = if duration >= 0.75 {
            "Peluit Panjang (Kick-off / Stop)".to_string()
        } else {
            "Peluit Wasit (Foul / Out)".to_string()
        };

        candidates.push(WhistleCandidateDto {
            start_time,
            end_time,
            peak_time,
            duration,
            peak_freq_hz,
            confidence: conf,
            label,
        });
    }

    if candidates.len() > 200 {
        candidates.sort_by(|a, b| {
            b.confidence
                .partial_cmp(&a.confidence)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
        candidates.truncate(200);
        candidates.sort_by(|a, b| {
            a.start_time
                .partial_cmp(&b.start_time)
                .unwrap_or(std::cmp::Ordering::Equal)
        });
    }

    candidates
}

#[tauri::command]
pub fn detect_match_whistles_ffmpeg(
    input_path: String,
    sensitivity: Option<f64>,
) -> Result<Vec<WhistleCandidateDto>, String> {
    if !Path::new(&input_path).exists() {
        return Err(format!("File video tidak ditemukan: {}", input_path));
    }

    let ffmpeg_bin = ffmpeg::resolve_bin("ffmpeg");
    let mut cmd = Command::new(&ffmpeg_bin);
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }

    let out = cmd
        .args([
            "-v",
            "error",
            "-i",
            &input_path,
            "-vn",
            "-ac",
            "1",
            "-ar",
            "16000",
            "-f",
            "f32le",
            "-",
        ])
        .output()
        .map_err(|e| format!("Gagal menjalankan FFmpeg untuk audio peluit: {}", e))?;

    if !out.status.success() {
        let err_txt = String::from_utf8_lossy(&out.stderr);
        if out.stdout.is_empty() {
            return Err(format!("Audio tidak tersedia atau gagal diekstrak: {}", err_txt));
        }
    }

    let mut samples = Vec::with_capacity(out.stdout.len() / 4);
    for chunk in out.stdout.chunks_exact(4) {
        let val = f32::from_le_bytes([chunk[0], chunk[1], chunk[2], chunk[3]]);
        if val.is_finite() {
            samples.push(val);
        }
    }

    Ok(detect_whistles_pcm_16k(
        &samples,
        16000,
        sensitivity.unwrap_or(0.65),
    ))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_whistle_detector_finds_dual_whistles_and_rejects_noise() {
        let sr = 16000usize;
        let total_sec = 6.0f64;
        let total_samples = (total_sec * sr as f64) as usize;
        let mut pcm = vec![0.0f32; total_samples];

        // Deterministic PRNG white crowd noise (amp 0.05)
        let mut seed = 0x1234_5678_9ABC_DEF0u64;
        for i in 0..total_samples {
            seed ^= seed << 13;
            seed ^= seed >> 7;
            seed ^= seed << 17;
            let u = ((seed >> 40) as f32 / 16777216.0) * 2.0 - 1.0;
            pcm[i] = u * 0.05;
        }

        // Sharp 30 ms clap/thud broadband impulse at 0.80s..0.83s (should be ignored)
        for i in (0.80 * sr as f64) as usize..(0.83 * sr as f64) as usize {
            pcm[i] += if i % 2 == 0 { 0.35 } else { -0.35 };
        }

        // Dual-tone whistle (3200 Hz + 3500 Hz) at 2.00s..2.55s
        for i in (2.00 * sr as f64) as usize..(2.55 * sr as f64) as usize {
            let t = i as f64 / sr as f64;
            let sig = 0.40 * (2.0 * std::f64::consts::PI * 3200.0 * t).sin()
                + 0.25 * (2.0 * std::f64::consts::PI * 3500.0 * t).sin();
            pcm[i] += sig as f32;
        }

        // Long whistle (2900 Hz) at 4.30s..5.20s
        for i in (4.30 * sr as f64) as usize..(5.20 * sr as f64) as usize {
            let t = i as f64 / sr as f64;
            let sig = 0.42 * (2.0 * std::f64::consts::PI * 2900.0 * t).sin();
            pcm[i] += sig as f32;
        }

        let detected = detect_whistles_pcm_16k(&pcm, 16000, 0.65);
        for d in &detected {
            println!(
                "Whistle detected: {:.2}s-{:.2}s peak={:.2}s freq={:.0}Hz conf={:.2} ({})",
                d.start_time, d.end_time, d.peak_time, d.peak_freq_hz, d.confidence, d.label
            );
        }
        assert_eq!(
            detected.len(),
            2,
            "Harus mendeteksi tepat 2 peluit dan menolak noise/tepuk tangan, dapat: {}",
            detected.len()
        );
        assert!(
            (detected[0].start_time - 2.00).abs() <= 0.12
                && (detected[0].end_time - 2.55).abs() <= 0.12
                && (detected[0].peak_freq_hz - 3200.0).abs() <= 150.0
        );
        assert!(
            (detected[1].start_time - 4.30).abs() <= 0.12
                && (detected[1].end_time - 5.20).abs() <= 0.12
                && (detected[1].peak_freq_hz - 2900.0).abs() <= 150.0
        );
    }
}

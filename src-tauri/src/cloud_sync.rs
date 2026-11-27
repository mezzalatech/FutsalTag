use serde::{Deserialize, Serialize};
use std::fs;
use std::path::Path;
use std::process::Command;
use std::time::{SystemTime, UNIX_EPOCH};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CloudUploadResult {
    pub status_code: u16,
    pub uploaded_url: String,
    pub share_url: String,
    pub bytes_sent: u64,
}

fn silent_curl_command() -> Command {
    #[cfg_attr(not(target_os = "windows"), allow(unused_mut))]
    let mut cmd = Command::new("curl");
    #[cfg(target_os = "windows")]
    {
        use std::os::windows::process::CommandExt;
        cmd.creation_flags(0x08000000);
    }
    cmd
}

/// Normalize WebDAV, Nextcloud Share Link (`/s/<token>`), or S3 Presigned PUT URLs into an HTTP PUT target,
/// returning `(put_url, effective_username, share_url)`.
pub fn normalize_cloud_upload_url(
    base_url: &str,
    remote_filename: &str,
    provider: &str,
    username: &str,
) -> Result<(String, String, String), String> {
    let trimmed = base_url.trim();
    if trimmed.is_empty() {
        return Err("URL server Cloud tidak boleh kosong.".to_string());
    }
    if !trimmed.starts_with("https://") && !trimmed.starts_with("http://") {
        return Err("URL Cloud harus diawali http:// atau https://".to_string());
    }

    let safe_name = remote_filename
        .trim()
        .replace('\\', "/")
        .split('/')
        .next_back()
        .unwrap_or("futsaltag_upload")
        .trim()
        .to_string();
    let encoded_name = safe_name.replace(' ', "%20");

    let prov = provider.trim().to_ascii_lowercase();
    if prov == "s3" || prov == "s3_presigned" {
        if safe_name.is_empty() || trimmed.contains("X-Amz-Signature") || trimmed.contains('?') {
            let share = trimmed.split('?').next().unwrap_or(trimmed).to_string();
            return Ok((trimmed.to_string(), username.trim().to_string(), share));
        }
        let put_url = format!("{}/{}", trimmed.trim_end_matches('/'), encoded_name);
        return Ok((put_url.clone(), username.trim().to_string(), put_url));
    }

    // Nextcloud public share link handling: https://host/.../s/<token> -> https://host/.../public.php/webdav/<file>
    if let Some(s_idx) = trimmed.find("/s/") {
        let origin = trimmed[..s_idx].trim_end_matches('/');
        let after_s = &trimmed[s_idx + 3..];
        let token = after_s
            .split(&['/', '?', '#'][..])
            .next()
            .unwrap_or("")
            .trim();
        if !token.is_empty() {
            let put_url = format!("{}/public.php/webdav/{}", origin, encoded_name);
            let eff_user = if username.trim().is_empty() {
                token.to_string()
            } else {
                username.trim().to_string()
            };
            return Ok((put_url, eff_user, trimmed.to_string()));
        }
    }

    let base_clean = trimmed.trim_end_matches('/');
    let put_url = if base_clean.ends_with(&encoded_name) || base_clean.ends_with(&safe_name) {
        base_clean.to_string()
    } else {
        format!("{}/{}", base_clean, encoded_name)
    };
    Ok((put_url.clone(), username.trim().to_string(), put_url))
}

#[tauri::command]
pub async fn upload_file_cloud(
    file_path: String,
    base_url: String,
    provider: String,
    username: Option<String>,
    password: Option<String>,
    remote_filename: Option<String>,
) -> Result<CloudUploadResult, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let src = Path::new(&file_path);
        if !src.is_file() {
            return Err(format!(
                "File yang akan diunggah tidak ditemukan: {}",
                file_path
            ));
        }
        let bytes_sent = fs::metadata(src)
            .map_err(|e| format!("Gagal membaca ukuran file: {}", e))?
            .len();

        let fallback_name = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("futsaltag_upload.bin");
        let name = remote_filename
            .as_deref()
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .unwrap_or(fallback_name);

        let user = username.unwrap_or_default();
        let pass = password.unwrap_or_default();
        let (put_url, eff_user, share_url) =
            normalize_cloud_upload_url(&base_url, name, &provider, &user)?;

        let mut args: Vec<String> = vec![
            "-sS".into(),
            "-L".into(),
            "-X".into(),
            "PUT".into(),
            "--upload-file".into(),
            file_path.clone(),
            "-w".into(),
            "\n%{http_code}".into(),
        ];
        if !eff_user.is_empty() || !pass.is_empty() {
            args.push("-u".into());
            args.push(format!("{}:{}", eff_user, pass));
        }
        args.push(put_url.clone());

        let out = silent_curl_command()
            .args(&args)
            .output()
            .map_err(|e| format!("Gagal menjalankan curl untuk upload Cloud: {}", e))?;

        let stdout_txt = String::from_utf8_lossy(&out.stdout);
        let code: u16 = stdout_txt
            .lines()
            .last()
            .and_then(|l| l.trim().parse::<u16>().ok())
            .unwrap_or(0);

        if !out.status.success() || code < 200 || code >= 300 {
            let err_txt = String::from_utf8_lossy(&out.stderr);
            return Err(format!(
                "Upload gagal (HTTP {}): {}",
                code,
                if err_txt.trim().is_empty() {
                    stdout_txt.trim()
                } else {
                    err_txt.trim()
                }
            ));
        }

        Ok(CloudUploadResult {
            status_code: code,
            uploaded_url: put_url,
            share_url,
            bytes_sent,
        })
    })
    .await
    .map_err(|e| format!("Task upload gagal: {}", e))?
}

#[tauri::command]
pub async fn upload_text_cloud(
    content: String,
    base_url: String,
    provider: String,
    username: Option<String>,
    password: Option<String>,
    remote_filename: String,
) -> Result<CloudUploadResult, String> {
    let safe_name = remote_filename.trim().replace(
        |c: char| !c.is_ascii_alphanumeric() && c != '.' && c != '_' && c != '-',
        "_",
    );
    let now = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis();
    let tmp_path = std::env::temp_dir().join(format!("futsaltag_cloud_{}_{}", now, safe_name));
    fs::write(&tmp_path, content.as_bytes())
        .map_err(|e| format!("Gagal membuat file temp untuk upload: {}", e))?;

    let tmp_str = tmp_path.to_string_lossy().to_string();
    let res = upload_file_cloud(
        tmp_str,
        base_url,
        provider,
        username,
        password,
        Some(remote_filename),
    )
    .await;
    let _ = fs::remove_file(&tmp_path);
    res
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::{Read, Write};
    use std::net::TcpListener;
    use std::thread;

    #[test]
    fn test_normalize_cloud_upload_url_variants() {
        let (nc_url, nc_user, nc_share) = normalize_cloud_upload_url(
            "https://cloud.myclub.id/s/AbCdEf123",
            "match_final.futsal",
            "nextcloud",
            "",
        )
        .unwrap();
        assert_eq!(
            nc_url,
            "https://cloud.myclub.id/public.php/webdav/match_final.futsal"
        );
        assert_eq!(nc_user, "AbCdEf123");
        assert_eq!(nc_share, "https://cloud.myclub.id/s/AbCdEf123");

        let (dav_url, dav_user, _) = normalize_cloud_upload_url(
            "https://dav.club.id/remote.php/dav/files/coach/",
            "report stats.html",
            "webdav",
            "coach",
        )
        .unwrap();
        assert_eq!(
            dav_url,
            "https://dav.club.id/remote.php/dav/files/coach/report%20stats.html"
        );
        assert_eq!(dav_user, "coach");

        let s3_pre = "https://bucket.s3.amazonaws.com/clip.mp4?X-Amz-Algorithm=AWS4&X-Amz-Signature=deadbeef";
        let (s3_url, _, s3_share) =
            normalize_cloud_upload_url(s3_pre, "clip.mp4", "s3_presigned", "").unwrap();
        assert_eq!(s3_url, s3_pre);
        assert_eq!(s3_share, "https://bucket.s3.amazonaws.com/clip.mp4");
    }

    #[test]
    fn test_upload_text_cloud_mock_webdav_put() {
        let listener = TcpListener::bind("127.0.0.1:0").expect("bind mock webdav");
        let port = listener.local_addr().unwrap().port();

        let handle = thread::spawn(move || {
            let (mut stream, _) = listener.accept().expect("accept client");
            let mut buf = [0u8; 4096];
            let n = stream.read(&mut buf).unwrap_or(0);
            let req = String::from_utf8_lossy(&buf[..n]).to_string();
            let resp = "HTTP/1.1 201 Created\r\nContent-Length: 0\r\nConnection: close\r\n\r\n";
            let _ = stream.write_all(resp.as_bytes());
            req
        });

        let res = tauri::async_runtime::block_on(upload_text_cloud(
            "{\"hello\":\"futsal\"}".to_string(),
            format!("http://127.0.0.1:{}/dav", port),
            "webdav".to_string(),
            Some("coach".to_string()),
            Some("secret".to_string()),
            "demo.futsal".to_string(),
        ))
        .expect("upload_text_cloud failed");

        let req_raw = handle.join().expect("mock thread panic");
        assert_eq!(res.status_code, 201);
        assert!(req_raw.starts_with("PUT /dav/demo.futsal HTTP/"));
        assert!(req_raw.contains("Authorization: Basic "));
    }
}

use serde::{Deserialize, Serialize};
use std::collections::{HashMap, HashSet};
use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream, UdpSocket};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex, OnceLock};
use std::thread;
use std::time::{Duration, SystemTime, UNIX_EPOCH};
use tauri::Emitter;

const MOBILE_HTML: &str = include_str!("remote_mobile.html");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ConnectedRemotePhone {
    pub phone_id: String,
    pub name: String,
    pub tap_count: u32,
    pub last_seen_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteServerStatus {
    pub running: bool,
    pub url: Option<String>,
    pub ip: Option<String>,
    pub port: u16,
    pub token: String,
    pub phones: Vec<ConnectedRemotePhone>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RemoteTapEvent {
    pub seq: u64,
    #[serde(rename = "phoneId")]
    pub phone_id: String,
    #[serde(rename = "phoneName")]
    pub phone_name: String,
    pub action: String,
    #[serde(rename = "buttonId")]
    pub button_id: Option<String>,
    pub player: Option<String>,
    #[serde(rename = "ageMs")]
    pub age_ms: Option<u64>,
}

struct ServerShared {
    token: String,
    state_json: String,
    phones: HashMap<String, ConnectedRemotePhone>,
    kicked_phones: HashSet<String>,
}

struct RemoteServerHandle {
    running: Arc<AtomicBool>,
    port: u16,
    ip: String,
    shared: Arc<Mutex<ServerShared>>,
}

static REMOTE_SERVER: OnceLock<Mutex<Option<RemoteServerHandle>>> = OnceLock::new();

fn now_ms() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_millis() as u64
}

fn detect_lan_ip() -> String {
    if let Ok(sock) = UdpSocket::bind("0.0.0.0:0") {
        if sock.connect("8.8.8.8:80").is_ok() {
            if let Ok(addr) = sock.local_addr() {
                let ip = addr.ip().to_string();
                if !ip.starts_with("127.") {
                    return ip;
                }
            }
        }
    }
    "127.0.0.1".to_string()
}

fn generate_token() -> String {
    let n = now_ms() ^ (std::process::id() as u64).wrapping_mul(0x9E37_79B9);
    format!("{:06x}", n & 0xFF_FFFF)
}

fn query_param<'a>(query: &'a str, key: &str) -> Option<String> {
    for pair in query.split('&') {
        let mut it = pair.splitn(2, '=');
        if let (Some(k), Some(v)) = (it.next(), it.next()) {
            if k == key {
                return Some(percent_decode(v));
            }
        }
    }
    None
}

fn percent_decode(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = Vec::with_capacity(bytes.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'%' && i + 2 < bytes.len() {
            if let Ok(hex) = std::str::from_utf8(&bytes[i + 1..i + 3]) {
                if let Ok(val) = u8::from_str_radix(hex, 16) {
                    out.push(val);
                    i += 3;
                    continue;
                }
            }
        } else if bytes[i] == b'+' {
            out.push(b' ');
            i += 1;
            continue;
        }
        out.push(bytes[i]);
        i += 1;
    }
    String::from_utf8_lossy(&out).to_string()
}

fn write_http_response(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {}\r\nContent-Type: {}\r\nContent-Length: {}\r\nCache-Control: no-store\r\nConnection: close\r\n\r\n",
        status,
        content_type,
        body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn handle_http_client<F: Fn(RemoteTapEvent)>(
    mut stream: TcpStream,
    shared: &Arc<Mutex<ServerShared>>,
    on_tap: &F,
) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let mut buf = vec![0u8; 16384];
    let mut read_total = 0usize;
    loop {
        match stream.read(&mut buf[read_total..]) {
            Ok(0) => break,
            Ok(n) => {
                read_total += n;
                if let Some(hdr_end) = buf[..read_total].windows(4).position(|w| w == b"\r\n\r\n") {
                    let hdr_str = String::from_utf8_lossy(&buf[..hdr_end]);
                    let content_len = hdr_str
                        .lines()
                        .find_map(|l| {
                            let low = l.to_ascii_lowercase();
                            low.strip_prefix("content-length:")
                                .and_then(|v| v.trim().parse::<usize>().ok())
                        })
                        .unwrap_or(0);
                    let body_start = hdr_end + 4;
                    if read_total >= body_start + content_len || read_total >= buf.len() {
                        break;
                    }
                }
                if read_total >= buf.len() {
                    break;
                }
            }
            Err(_) => break,
        }
    }

    if read_total == 0 {
        return;
    }

    let req_bytes = &buf[..read_total];
    let Some(hdr_end) = req_bytes.windows(4).position(|w| w == b"\r\n\r\n") else {
        write_http_response(&mut stream, "400 Bad Request", "text/plain", b"Bad Request");
        return;
    };
    let head = String::from_utf8_lossy(&req_bytes[..hdr_end]);
    let body_bytes = &req_bytes[hdr_end + 4..];
    let first_line = head.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let full_target = parts.next().unwrap_or("/");
    let (path, query) = full_target.split_once('?').unwrap_or((full_target, ""));

    let token_param = query_param(query, "k").unwrap_or_default();

    if method == "GET" && path == "/" {
        let token_ok = shared
            .lock()
            .map(|g| token_param == g.token)
            .unwrap_or(false);
        if !token_ok {
            write_http_response(
                &mut stream,
                "403 Forbidden",
                "text/html; charset=utf-8",
                b"<h3>Token tidak cocok. Pindai ulang QR Code di laptop.</h3>",
            );
            return;
        }
        write_http_response(
            &mut stream,
            "200 OK",
            "text/html; charset=utf-8",
            MOBILE_HTML.as_bytes(),
        );
        return;
    }

    if method == "GET" && path == "/api/state" {
        let pid = query_param(query, "pid").unwrap_or_default();
        let pname = query_param(query, "name").unwrap_or_else(|| "HP".to_string());
        let resp = {
            let Ok(mut g) = shared.lock() else {
                write_http_response(&mut stream, "500 Internal Server Error", "text/plain", b"Lock Error");
                return;
            };
            if token_param != g.token {
                Err(("403 Forbidden", "Invalid token"))
            } else if !pid.is_empty() && g.kicked_phones.contains(&pid) {
                Err(("403 Forbidden", "Kicked"))
            } else {
                if !pid.is_empty() {
                    let entry = g.phones.entry(pid.clone()).or_insert(ConnectedRemotePhone {
                        phone_id: pid,
                        name: pname.clone(),
                        tap_count: 0,
                        last_seen_ms: now_ms(),
                    });
                    entry.name = pname;
                    entry.last_seen_ms = now_ms();
                }
                Ok(g.state_json.clone())
            }
        };
        match resp {
            Ok(json) => write_http_response(&mut stream, "200 OK", "application/json", json.as_bytes()),
            Err((st, msg)) => write_http_response(&mut stream, st, "text/plain", msg.as_bytes()),
        }
        return;
    }

    if method == "POST" && path == "/api/tap" {
        let parsed: Result<RemoteTapEvent, _> = serde_json::from_slice(body_bytes);
        let Ok(ev) = parsed else {
            write_http_response(&mut stream, "400 Bad Request", "text/plain", b"Invalid JSON");
            return;
        };
        let status_check = {
            let Ok(mut g) = shared.lock() else {
                write_http_response(&mut stream, "500 Internal Server Error", "text/plain", b"Lock Error");
                return;
            };
            if token_param != g.token {
                Err("Invalid token")
            } else if g.kicked_phones.contains(&ev.phone_id) {
                Err("Kicked")
            } else {
                let entry = g
                    .phones
                    .entry(ev.phone_id.clone())
                    .or_insert(ConnectedRemotePhone {
                        phone_id: ev.phone_id.clone(),
                        name: ev.phone_name.clone(),
                        tap_count: 0,
                        last_seen_ms: now_ms(),
                    });
                entry.name = ev.phone_name.clone();
                entry.tap_count = entry.tap_count.saturating_add(1);
                entry.last_seen_ms = now_ms();
                Ok(ev.seq)
            }
        };
        match status_check {
            Ok(seq) => {
                on_tap(ev);
                let ok_json = format!("{{\"ok\":true,\"seq\":{}}}", seq);
                write_http_response(&mut stream, "200 OK", "application/json", ok_json.as_bytes());
            }
            Err(msg) => write_http_response(&mut stream, "403 Forbidden", "text/plain", msg.as_bytes()),
        }
        return;
    }

    write_http_response(&mut stream, "404 Not Found", "text/plain", b"Not Found");
}

fn start_listener_core<F: Fn(RemoteTapEvent) + Send + Sync + 'static>(
    bind_port: u16,
    on_tap: F,
) -> Result<(RemoteServerHandle, RemoteServerStatus), String> {
    let listener = TcpListener::bind(("0.0.0.0", bind_port))
        .or_else(|_| TcpListener::bind(("0.0.0.0", 0)))
        .map_err(|e| format!("Gagal membuka server Remote HP: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Gagal membaca port server Remote HP: {}", e))?
        .port();
    let _ = listener.set_nonblocking(true);

    let ip = detect_lan_ip();
    let token = generate_token();
    let shared = Arc::new(Mutex::new(ServerShared {
        token: token.clone(),
        state_json: "{}".to_string(),
        phones: HashMap::new(),
        kicked_phones: HashSet::new(),
    }));
    let running = Arc::new(AtomicBool::new(true));

    let running_thr = Arc::clone(&running);
    let shared_thr = Arc::clone(&shared);
    let callback = Arc::new(on_tap);

    thread::spawn(move || {
        while running_thr.load(Ordering::Relaxed) {
            match listener.accept() {
                Ok((stream, _)) => {
                    let sh = Arc::clone(&shared_thr);
                    let cb = Arc::clone(&callback);
                    thread::spawn(move || handle_http_client(stream, &sh, &*cb));
                }
                Err(ref e) if e.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(25));
                }
                Err(_) => break,
            }
        }
    });

    let url = format!("http://{}:{}/?k={}", ip, port, token);
    let status = RemoteServerStatus {
        running: true,
        url: Some(url),
        ip: Some(ip.clone()),
        port,
        token,
        phones: vec![],
    };

    Ok((
        RemoteServerHandle {
            running,
            port,
            ip,
            shared,
        },
        status,
    ))
}

fn snapshot_status(handle: &RemoteServerHandle) -> RemoteServerStatus {
    let now = now_ms();
    let (token, phones) = match handle.shared.lock() {
        Ok(g) => {
            let list: Vec<ConnectedRemotePhone> = g
                .phones
                .values()
                .filter(|p| now.saturating_sub(p.last_seen_ms) < 25_000 && !g.kicked_phones.contains(&p.phone_id))
                .cloned()
                .collect();
            (g.token.clone(), list)
        }
        Err(_) => (String::new(), vec![]),
    };
    RemoteServerStatus {
        running: true,
        url: Some(format!("http://{}:{}/?k={}", handle.ip, handle.port, token)),
        ip: Some(handle.ip.clone()),
        port: handle.port,
        token,
        phones,
    }
}

#[tauri::command]
pub fn start_remote_server(app: tauri::AppHandle) -> Result<RemoteServerStatus, String> {
    let lock = REMOTE_SERVER.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().map_err(|_| "Gagal mengunci status Remote HP".to_string())?;
    if let Some(ref existing) = *guard {
        if existing.running.load(Ordering::Relaxed) {
            return Ok(snapshot_status(existing));
        }
    }

    let app_clone = app.clone();
    let (handle, status) = start_listener_core(8737, move |ev| {
        let _ = app_clone.emit("remote-tag-action", ev);
    })?;
    *guard = Some(handle);
    Ok(status)
}

#[tauri::command]
pub fn stop_remote_server() -> Result<(), String> {
    let lock = REMOTE_SERVER.get_or_init(|| Mutex::new(None));
    let mut guard = lock.lock().map_err(|_| "Gagal mengunci status Remote HP".to_string())?;
    if let Some(handle) = guard.take() {
        handle.running.store(false, Ordering::Relaxed);
    }
    Ok(())
}

#[tauri::command]
pub fn get_remote_server_status() -> RemoteServerStatus {
    let lock = REMOTE_SERVER.get_or_init(|| Mutex::new(None));
    if let Ok(guard) = lock.lock() {
        if let Some(ref handle) = *guard {
            if handle.running.load(Ordering::Relaxed) {
                return snapshot_status(handle);
            }
        }
    }
    RemoteServerStatus {
        running: false,
        url: None,
        ip: None,
        port: 0,
        token: String::new(),
        phones: vec![],
    }
}

#[tauri::command]
pub fn update_remote_server_state(state_json: String) -> Result<(), String> {
    let lock = REMOTE_SERVER.get_or_init(|| Mutex::new(None));
    let guard = lock.lock().map_err(|_| "Gagal mengunci status Remote HP".to_string())?;
    if let Some(ref handle) = *guard {
        if let Ok(mut sh) = handle.shared.lock() {
            sh.state_json = state_json;
        }
    }
    Ok(())
}

#[tauri::command]
pub fn kick_remote_phone(phone_id: String) -> Result<(), String> {
    let lock = REMOTE_SERVER.get_or_init(|| Mutex::new(None));
    let guard = lock.lock().map_err(|_| "Gagal mengunci status Remote HP".to_string())?;
    if let Some(ref handle) = *guard {
        if let Ok(mut sh) = handle.shared.lock() {
            sh.kicked_phones.insert(phone_id.clone());
            sh.phones.remove(&phone_id);
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_remote_server_http_endpoints() {
        let received = Arc::new(Mutex::new(Vec::<RemoteTapEvent>::new()));
        let rec_clone = Arc::clone(&received);
        let (handle, status) = start_listener_core(0, move |ev| {
            rec_clone.lock().unwrap().push(ev);
        })
        .expect("start_listener_core failed");

        {
            let mut sh = handle.shared.lock().unwrap();
            sh.state_json = r#"{"matchTitle":"Test Match","tags":[{"id":"b1","name":"Goal"}]}"#.to_string();
        }

        let addr = format!("127.0.0.1:{}", status.port);
        // 1. Unauthorized GET /
        let mut s1 = TcpStream::connect(&addr).unwrap();
        s1.write_all(b"GET /?k=wrong HTTP/1.1\r\nHost: localhost\r\n\r\n").unwrap();
        let mut r1 = String::new();
        s1.read_to_string(&mut r1).unwrap();
        assert!(r1.starts_with("HTTP/1.1 403"));

        // 2. Authorized GET /api/state
        let mut s2 = TcpStream::connect(&addr).unwrap();
        let req2 = format!(
            "GET /api/state?k={}&pid=hp_test&name=Coach HTTP/1.1\r\nHost: localhost\r\n\r\n",
            status.token
        );
        s2.write_all(req2.as_bytes()).unwrap();
        let mut r2 = String::new();
        s2.read_to_string(&mut r2).unwrap();
        assert!(r2.starts_with("HTTP/1.1 200"));
        assert!(r2.contains("Test Match"));

        // 3. Authorized POST /api/tap
        let body = r#"{"seq":1,"phoneId":"hp_test","phoneName":"Coach","action":"tag","buttonId":"b1","ageMs":5}"#;
        let mut s3 = TcpStream::connect(&addr).unwrap();
        let req3 = format!(
            "POST /api/tap?k={} HTTP/1.1\r\nHost: localhost\r\nContent-Type: application/json\r\nContent-Length: {}\r\n\r\n{}",
            status.token,
            body.len(),
            body
        );
        s3.write_all(req3.as_bytes()).unwrap();
        let mut r3 = String::new();
        s3.read_to_string(&mut r3).unwrap();
        assert!(r3.starts_with("HTTP/1.1 200"));
        assert!(r3.contains(r#""ok":true"#));

        thread::sleep(Duration::from_millis(50));
        let evs = received.lock().unwrap();
        assert_eq!(evs.len(), 1);
        assert_eq!(evs[0].button_id.as_deref(), Some("b1"));
        assert_eq!(snapshot_status(&handle).phones.len(), 1);

        handle.running.store(false, Ordering::Relaxed);
    }
}

use std::io::{Read, Write};
use std::net::{TcpListener, TcpStream};
use std::sync::OnceLock;
use std::time::Duration;

static YT_BRIDGE_PORT: OnceLock<u16> = OnceLock::new();

pub fn extract_valid_video_id(request_target: &str) -> Option<String> {
    let query = request_target.split_once('?')?.1.split('#').next().unwrap_or("");
    for pair in query.split('&') {
        let (k, v) = pair.split_once('=').unwrap_or((pair, ""));
        if k == "v" {
            let clean = v.trim();
            let valid_len = (6..=20).contains(&clean.len());
            let valid_chars = clean
                .bytes()
                .all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
            if valid_len && valid_chars {
                return Some(clean.to_string());
            }
        }
    }
    None
}

pub fn render_yt_embed_html(video_id: &str) -> String {
    format!(
        r#"<!doctype html>
<html lang="id">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="referrer" content="strict-origin-when-cross-origin" />
  <style>
    html, body {{
      margin: 0;
      padding: 0;
      width: 100%;
      height: 100%;
      overflow: hidden;
      background: #000;
    }}
    #player {{
      width: 100vw;
      height: 100vh;
    }}
  </style>
</head>
<body>
  <div id="player"></div>
  <script>
    (function () {{
      var videoId = "{video_id}";
      var player = null;
      var pollTimer = null;

      function post(msg) {{
        try {{
          window.parent.postMessage(Object.assign({{ source: "futsaltag-yt" }}, msg), "*");
        }} catch (_e) {{}}
      }}

      function startPolling() {{
        if (pollTimer) clearInterval(pollTimer);
        pollTimer = setInterval(function () {{
          if (!player || typeof player.getCurrentTime !== "function") return;
          var t = Number(player.getCurrentTime() || 0);
          var d = Number((typeof player.getDuration === "function" ? player.getDuration() : 0) || 0);
          post({{ type: "time", currentTime: t, duration: d }});
        }}, 100);
      }}

      window.addEventListener("message", function (ev) {{
        var d = ev.data;
        if (!d || d.source !== "futsaltag-yt-cmd" || !player) return;
        try {{
          if (d.cmd === "play" && typeof player.playVideo === "function") player.playVideo();
          else if (d.cmd === "pause" && typeof player.pauseVideo === "function") player.pauseVideo();
          else if (d.cmd === "seek" && typeof player.seekTo === "function") player.seekTo(Number(d.time) || 0, true);
          else if (d.cmd === "rate" && typeof player.setPlaybackRate === "function") player.setPlaybackRate(Number(d.rate) || 1);
          else if (d.cmd === "volume" && typeof player.setVolume === "function") player.setVolume(Math.max(0, Math.min(100, Math.round(Number(d.volume) || 0))));
          else if (d.cmd === "mute" && typeof player.mute === "function") player.mute();
          else if (d.cmd === "unmute" && typeof player.unMute === "function") player.unMute();
        }} catch (_e) {{}}
      }});

      window.onYouTubeIframeAPIReady = function () {{
        if (!window.YT || !window.YT.Player) return;
        player = new window.YT.Player("player", {{
          videoId: videoId,
          width: "100%",
          height: "100%",
          playerVars: {{
            rel: 0,
            modestbranding: 1,
            playsinline: 1,
            disablekb: 1,
            origin: window.location.origin
          }},
          events: {{
            onReady: function (e) {{
              var dur = Number((e.target && typeof e.target.getDuration === "function" ? e.target.getDuration() : 0) || 0);
              post({{ type: "ready", duration: dur }});
              startPolling();
            }},
            onStateChange: function (e) {{
              var dur = Number((e.target && typeof e.target.getDuration === "function" ? e.target.getDuration() : 0) || 0);
              post({{ type: "state", state: e.data, duration: dur }});
            }},
            onError: function (e) {{
              post({{ type: "error", code: Number(e.data) }});
            }}
          }}
        }});
      }};

      var s = document.createElement("script");
      s.src = "https://www.youtube.com/iframe_api";
      document.head.appendChild(s);
    }})();
  </script>
</body>
</html>"#,
        video_id = video_id
    )
}

fn write_response(stream: &mut TcpStream, status: &str, content_type: &str, body: &[u8]) {
    let header = format!(
        "HTTP/1.1 {status}\r\n\
         Content-Type: {content_type}\r\n\
         Content-Length: {len}\r\n\
         Referrer-Policy: strict-origin-when-cross-origin\r\n\
         Cache-Control: no-store\r\n\
         Connection: close\r\n\r\n",
        status = status,
        content_type = content_type,
        len = body.len()
    );
    let _ = stream.write_all(header.as_bytes());
    let _ = stream.write_all(body);
    let _ = stream.flush();
}

fn handle_client(mut stream: TcpStream) {
    let _ = stream.set_read_timeout(Some(Duration::from_secs(3)));
    let mut buf = [0u8; 4096];
    let n = stream.read(&mut buf).unwrap_or(0);
    if n == 0 {
        return;
    }
    let req = String::from_utf8_lossy(&buf[..n]);
    let first_line = req.lines().next().unwrap_or("");
    let mut parts = first_line.split_whitespace();
    let method = parts.next().unwrap_or("");
    let target = parts.next().unwrap_or("");

    if method != "GET" {
        write_response(&mut stream, "405 Method Not Allowed", "text/plain; charset=utf-8", b"Method Not Allowed");
        return;
    }
    let path = target.split('?').next().unwrap_or("");
    if path == "/favicon.ico" {
        write_response(&mut stream, "204 No Content", "text/plain", b"");
        return;
    }
    if path == "/yt-embed" {
        if let Some(video_id) = extract_valid_video_id(target) {
            let html = render_yt_embed_html(&video_id);
            write_response(&mut stream, "200 OK", "text/html; charset=utf-8", html.as_bytes());
        } else {
            write_response(&mut stream, "400 Bad Request", "text/plain; charset=utf-8", b"Invalid video id");
        }
        return;
    }
    write_response(&mut stream, "404 Not Found", "text/plain; charset=utf-8", b"Not Found");
}

fn ensure_bridge_started() -> Result<u16, String> {
    if let Some(&port) = YT_BRIDGE_PORT.get() {
        return Ok(port);
    }
    let listener = TcpListener::bind("127.0.0.1:0")
        .map_err(|e| format!("Gagal memulai localhost YouTube bridge: {}", e))?;
    let port = listener
        .local_addr()
        .map_err(|e| format!("Gagal membaca port YouTube bridge: {}", e))?
        .port();

    std::thread::spawn(move || {
        for incoming in listener.incoming() {
            if let Ok(stream) = incoming {
                std::thread::spawn(move || handle_client(stream));
            }
        }
    });

    Ok(*YT_BRIDGE_PORT.get_or_init(|| port))
}

#[tauri::command]
pub fn get_youtube_bridge_url() -> Result<String, String> {
    let port = ensure_bridge_started()?;
    Ok(format!("http://127.0.0.1:{}", port))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_extract_valid_video_id() {
        assert_eq!(
            extract_valid_video_id("/yt-embed?v=dQw4w9WgXcQ"),
            Some("dQw4w9WgXcQ".to_string())
        );
        assert_eq!(
            extract_valid_video_id("/yt-embed?foo=1&v=abc_DEF-123&bar=2"),
            Some("abc_DEF-123".to_string())
        );
        assert_eq!(extract_valid_video_id("/yt-embed"), None);
        assert_eq!(extract_valid_video_id("/yt-embed?v=bad<script>"), None);
        assert_eq!(extract_valid_video_id("/yt-embed?v=123"), None);
    }

    #[test]
    fn test_render_yt_embed_html() {
        let html = render_yt_embed_html("dQw4w9WgXcQ");
        assert!(html.contains("strict-origin-when-cross-origin"));
        assert!(html.contains("var videoId = \"dQw4w9WgXcQ\""));
        assert!(html.contains("futsaltag-yt"));
        assert!(html.contains("https://www.youtube.com/iframe_api"));
    }
}

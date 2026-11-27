import base64
import shutil
import subprocess
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent
REPO_ROOT = BASE_DIR.parent.parent
SHOTS = BASE_DIR / "screenshots"
LOGO_PATH = REPO_ROOT / "build" / "logo.png"
if not LOGO_PATH.exists():
    LOGO_PATH = REPO_ROOT / "src-tauri" / "icons" / "icon.png"
OUT_PDF = REPO_ROOT / "Buku_Panduan_ARF_FutsalTag_v0.2.0.pdf"


def find_browser() -> str:
    candidates = [
        r"C:\Program Files\Google\Chrome\Application\chrome.exe",
        r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
        "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
        "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
        shutil.which("google-chrome") or "",
        shutil.which("chromium") or "",
    ]
    for c in candidates:
        if c and Path(c).exists():
            return c
    raise FileNotFoundError("Chrome atau Microsoft Edge tidak ditemukan untuk mencetak PDF.")


def img_uri(path: Path) -> str:
    b64 = base64.b64encode(path.read_bytes()).decode("ascii")
    return f"data:image/png;base64,{b64}"


def build_html() -> str:
    logo = img_uri(LOGO_PATH)
    s_hub = img_uri(SHOTS / "01_hub.png")
    s_tag = img_uri(SHOTS / "02_tagging.png")
    s_pad = img_uri(SHOTS / "03_action_pad.png")
    s_min = img_uri(SHOTS / "04_menit_bermain.png")
    s_tel = img_uri(SHOTS / "05_telestrasi.png")
    s_ply = img_uri(SHOTS / "06_playlist.png")
    s_pcb = img_uri(SHOTS / "07_coachboard.png")
    s_trn = img_uri(SHOTS / "08_training_planner.png")
    s_pro = img_uri(SHOTS / "09_alat_pro_menu.png")

    return f"""<!DOCTYPE html>
<html lang="id">
<head>
<meta charset="utf-8" />
<title>Buku Panduan Pengguna — ARF FutsalTag v0.2.0</title>
<style>
  @page {{
    size: A4 portrait;
    margin: 13mm 13mm 14mm 13mm;
    @top-left {{
      content: "ARF FUTSALTAG v0.2.0";
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 7.8pt;
      font-weight: 700;
      color: #64748b;
      letter-spacing: 0.06em;
    }}
    @top-right {{
      content: "Buku Panduan Resmi Pengguna";
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 7.8pt;
      color: #64748b;
    }}
    @bottom-left {{
      content: "Video Analyser • Broadcast Telestrator • Coach Board 40m×20m";
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 7.3pt;
      color: #94a3b8;
    }}
    @bottom-right {{
      content: "Halaman " counter(page) " dari " counter(pages);
      font-family: 'Segoe UI', Arial, sans-serif;
      font-size: 7.8pt;
      font-weight: 600;
      color: #475569;
    }}
  }}

  @page :first {{
    margin: 0;
    @top-left {{ content: none; }}
    @top-right {{ content: none; }}
    @bottom-left {{ content: none; }}
    @bottom-right {{ content: none; }}
  }}

  * {{
    box-sizing: border-box;
  }}

  body {{
    margin: 0;
    font-family: 'Segoe UI', -apple-system, BlinkMacSystemFont, Roboto, Arial, sans-serif;
    font-size: 9pt;
    line-height: 1.45;
    color: #1e293b;
    background: #ffffff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }}

  /* COVER PAGE */
  .cover {{
    width: 210mm;
    height: 297mm;
    background: linear-gradient(155deg, #070d1a 0%, #0f1f3d 52%, #0a162b 100%);
    color: #f8fafc;
    padding: 20mm 18mm 16mm 18mm;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    position: relative;
    overflow: hidden;
    page-break-after: always;
  }}
  .cover::before {{
    content: "";
    position: absolute;
    top: -60mm;
    right: -45mm;
    width: 170mm;
    height: 170mm;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(37, 99, 235, 0.28) 0%, rgba(37, 99, 235, 0) 70%);
  }}
  .cover::after {{
    content: "";
    position: absolute;
    bottom: -45mm;
    left: -35mm;
    width: 150mm;
    height: 150mm;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(16, 185, 129, 0.16) 0%, rgba(16, 185, 129, 0) 70%);
  }}
  .cover-top {{
    position: relative;
    z-index: 2;
  }}
  .cover-brand {{
    display: flex;
    align-items: center;
    gap: 14px;
    margin-bottom: 18mm;
  }}
  .cover-brand img {{
    width: 54px;
    height: 54px;
    border-radius: 12px;
    border: 1.5px solid rgba(56, 189, 248, 0.4);
    background: #0b1222;
  }}
  .cover-brand-text {{
    font-size: 13pt;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #e2e8f0;
  }}
  .cover-brand-sub {{
    font-size: 8.5pt;
    color: #38bdf8;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }}
  .cover-badge {{
    display: inline-block;
    padding: 5px 14px;
    border-radius: 999px;
    background: rgba(56, 189, 248, 0.14);
    border: 1px solid rgba(56, 189, 248, 0.35);
    color: #7dd3fc;
    font-size: 8.5pt;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 8mm;
  }}
  .cover h1 {{
    font-size: 32pt;
    line-height: 1.15;
    margin: 0 0 6mm 0;
    font-weight: 900;
    letter-spacing: -0.02em;
    color: #ffffff;
  }}
  .cover h1 span {{
    color: #38bdf8;
  }}
  .cover-desc {{
    font-size: 11.5pt;
    line-height: 1.6;
    color: #cbd5e1;
    max-width: 155mm;
    margin: 0 0 10mm 0;
  }}
  .cover-preview {{
    position: relative;
    z-index: 2;
    border-radius: 12px;
    overflow: hidden;
    border: 1.5px solid rgba(148, 163, 184, 0.25);
    box-shadow: 0 18px 40px rgba(0, 0, 0, 0.5);
    margin-bottom: 10mm;
  }}
  .cover-preview img {{
    width: 100%;
    display: block;
  }}
  .cover-grid {{
    position: relative;
    z-index: 2;
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 10px;
    margin-bottom: 8mm;
  }}
  .cover-stat {{
    background: rgba(15, 23, 42, 0.78);
    border: 1px solid rgba(56, 189, 248, 0.2);
    border-radius: 10px;
    padding: 10px 12px;
  }}
  .cover-stat strong {{
    display: block;
    font-size: 10pt;
    color: #38bdf8;
    margin-bottom: 2px;
  }}
  .cover-stat span {{
    font-size: 8.3pt;
    color: #cbd5e1;
  }}
  .cover-footer {{
    position: relative;
    z-index: 2;
    border-top: 1px solid rgba(148, 163, 184, 0.2);
    padding-top: 10px;
    display: flex;
    justify-content: space-between;
    font-size: 8.5pt;
    color: #94a3b8;
  }}

  /* CONTENT STYLING */
  .chapter-break {{
    page-break-before: always;
  }}

  .chapter-tag {{
    display: inline-block;
    font-size: 8pt;
    font-weight: 800;
    letter-spacing: 0.09em;
    text-transform: uppercase;
    color: #1d4ed8;
    background: #dbeafe;
    padding: 3px 10px;
    border-radius: 999px;
    margin-bottom: 6px;
  }}

  h2.chapter-title {{
    font-size: 15.5pt;
    font-weight: 800;
    color: #0f172a;
    margin: 0 0 6px 0;
    padding-bottom: 4px;
    border-bottom: 2px solid #1d4ed8;
  }}

  h3 {{
    font-size: 10.8pt;
    font-weight: 700;
    color: #0f172a;
    margin: 9px 0 4px 0;
  }}

  p {{
    margin: 0 0 6px 0;
  }}

  ul, ol {{
    margin: 3px 0 7px 0;
    padding-left: 16px;
  }}
  li {{
    margin-bottom: 2.5px;
  }}

  .figure {{
    margin: 7px 0 8px 0;
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    overflow: hidden;
    background: #f8fafc;
    break-inside: avoid;
  }}
  .figure img {{
    width: 100%;
    max-height: 82mm;
    object-fit: contain;
    display: block;
    background: #0b1222;
  }}
  .figure-caption {{
    padding: 5px 10px;
    font-size: 8pt;
    color: #475569;
    border-top: 1px solid #e2e8f0;
    background: #f1f5f9;
  }}
  .figure-caption strong {{
    color: #0f172a;
  }}

  .grid-2 {{
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
    margin: 8px 0 10px 0;
    break-inside: avoid;
  }}

  .card {{
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 7px;
    padding: 7px 10px;
    break-inside: avoid;
  }}
  .card-title {{
    font-weight: 700;
    font-size: 9pt;
    color: #1e3a8a;
    margin-bottom: 3px;
  }}

  .callout {{
    border-left: 4px solid #0284c7;
    background: #f0f9ff;
    padding: 7px 10px;
    border-radius: 0 7px 7px 0;
    margin: 7px 0;
    font-size: 8.6pt;
    break-inside: avoid;
  }}
  .callout.tip {{
    border-left-color: #059669;
    background: #ecfdf5;
  }}
  .callout.warn {{
    border-left-color: #d97706;
    background: #fffbeb;
  }}
  .callout-title {{
    display: block;
    font-weight: 700;
    margin-bottom: 2px;
    color: #0f172a;
  }}

  table {{
    width: 100%;
    border-collapse: collapse;
    margin: 6px 0 8px 0;
    font-size: 8.2pt;
    break-inside: avoid;
  }}
  th {{
    background: #0f172a;
    color: #f8fafc;
    text-align: left;
    padding: 4.5px 8px;
    font-weight: 700;
  }}
  td {{
    padding: 4px 8px;
    border-bottom: 1px solid #e2e8f0;
    vertical-align: top;
  }}
  tr:nth-child(even) td {{
    background: #f8fafc;
  }}

  kbd {{
    display: inline-block;
    padding: 1px 5px;
    font-size: 7.5pt;
    font-family: Consolas, monospace;
    font-weight: 700;
    color: #0f172a;
    background: #e2e8f0;
    border: 1px solid #94a3b8;
    border-radius: 4px;
    box-shadow: 0 1px 0 #94a3b8;
  }}

  code {{
    font-family: Consolas, monospace;
    font-size: 8.1pt;
    background: #f1f5f9;
    padding: 1px 4px;
    border-radius: 4px;
    color: #0f172a;
  }}

  .toc-list {{
    list-style: none;
    padding: 0;
    margin: 6px 0 10px 0;
  }}
  .toc-item {{
    display: flex;
    justify-content: space-between;
    padding: 4.5px 8px;
    border-bottom: 1px dashed #cbd5e1;
    font-size: 9pt;
  }}
  .toc-item strong {{
    color: #0f172a;
  }}
  .toc-item span {{
    color: #475569;
    font-size: 9pt;
  }}

  .workflow-bar {{
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 8px;
    margin: 10px 0 14px 0;
    break-inside: avoid;
  }}
  .wf-step {{
    background: #0f172a;
    color: #f8fafc;
    padding: 8px 9px;
    border-radius: 8px;
    text-align: center;
  }}
  .wf-num {{
    display: inline-block;
    width: 20px;
    height: 20px;
    line-height: 20px;
    border-radius: 50%;
    background: #2563eb;
    color: #fff;
    font-weight: 800;
    font-size: 8.5pt;
    margin-bottom: 4px;
  }}
  .wf-name {{
    display: block;
    font-weight: 700;
    font-size: 9pt;
    color: #38bdf8;
  }}
  .wf-sub {{
    display: block;
    font-size: 7.5pt;
    color: #cbd5e1;
    margin-top: 2px;
  }}
</style>
</head>
<body>

<!-- HALAMAN SAMPUL -->
<section class="cover">
  <div class="cover-top">
    <div class="cover-brand">
      <img src="{logo}" alt="Logo ARF FutsalTag" />
      <div>
        <div class="cover-brand-text">ARF FUTSALTAG</div>
        <div class="cover-brand-sub">Tactical Video Analysis &amp; Coaching Suite</div>
      </div>
    </div>

    <div class="cover-badge">Buku Panduan Resmi Pengguna • Versi 0.2.0</div>
    <h1>Panduan Lengkap<br/><span>ARF FutsalTag</span></h1>
    <p class="cover-desc">
      Aplikasi desktop analisis video pertandingan futsal, studio telestrasi siaran TV dengan deteksi AI offline, manajemen menit bermain 5v5, hingga papan taktik 2D berstandar lapangan FIFA (40m × 20m) untuk Windows &amp; macOS.
    </p>
  </div>

  <div class="cover-preview">
    <img src="{s_tag}" alt="Tampilan Utama Tagging ARF FutsalTag" />
  </div>

  <div>
    <div class="cover-grid">
      <div class="cover-stat">
        <strong>100% Offline Bundle</strong>
        <span>FFmpeg, AI YOLOX-Nano/S, &amp; Whisper siap pakai tanpa internet</span>
      </div>
      <div class="cover-stat">
        <strong>Standar FIFA 40m × 20m</strong>
        <span>Kalibrasi homografi 4-titik &amp; papan taktik multi-formasi</span>
      </div>
      <div class="cover-stat">
        <strong>Ekspor Lengkap</strong>
        <span>Video MP4, Paket WhatsApp 720p, PDF Drill, &amp; Rekap CSV</span>
      </div>
    </div>

    <div class="cover-footer">
      <span>Platform: Windows 10/11 (x64) &amp; macOS (Apple Silicon &amp; Intel)</span>
      <span>Edisi Rilis v0.2.0 • github.com/mezzalatech/FutsalTag</span>
    </div>
  </div>
</section>

<!-- HALAMAN 2: DAFTAR ISI & PENGENALAN -->
<section>
  <span class="chapter-tag">Pendahuluan</span>
  <h2 class="chapter-title">Daftar Isi &amp; Alur Kerja ARF FutsalTag</h2>

  <p>
    <strong>ARF FutsalTag</strong> menyatukan seluruh kebutuhan pelatih dan analis video futsal ke dalam satu aplikasi desktop yang ringan dan berjalan sepenuhnya secara offline. Seluruh proses—mulai dari mengimpor video, menandai momen penting (<em>tagging</em>), menggambar analisis taktik bergaya siaran televisi, merencanakan sesi latihan, hingga mengekspor klip evaluasi pemain—dapat diselesaikan dalam 5 ruang kerja utama pada bilah atas aplikasi.
  </p>

  <div class="workflow-bar">
    <div class="wf-step">
      <span class="wf-num">1</span>
      <span class="wf-name">Hub</span>
      <span class="wf-sub">Proyek, Impor Video &amp; Pustaka Laga</span>
    </div>
    <div class="wf-step">
      <span class="wf-num">2</span>
      <span class="wf-name">Tagging</span>
      <span class="wf-sub">Action Pad, Linimasa &amp; Menit 4v4</span>
    </div>
    <div class="wf-step">
      <span class="wf-num">3</span>
      <span class="wf-name">Telestrasi</span>
      <span class="wf-sub">Grafis 3D, AI Tracking &amp; Voiceover</span>
    </div>
    <div class="wf-step">
      <span class="wf-num">4</span>
      <span class="wf-name">Playlist</span>
      <span class="wf-sub">Presentasi, Merge &amp; Ekspor MP4</span>
    </div>
    <div class="wf-step">
      <span class="wf-num">5</span>
      <span class="wf-name">Taktik 2D</span>
      <span class="wf-sub">Coach Board &amp; Session Planner</span>
    </div>
  </div>

  <ul class="toc-list">
    <li class="toc-item"><strong>Bab 1 — Instalasi, Persyaratan Sistem &amp; Manajemen Proyek</strong><span>Halaman ini &amp; Bab 2</span></li>
    <li class="toc-item"><strong>Bab 2 — Project Hub: Memulai Analisis, Impor Video &amp; Pustaka</strong><span>Mode Penuh, OnlyDraw, &amp; Taktik 2D</span></li>
    <li class="toc-item"><strong>Bab 3 — Workspace Tagging, Visual Action Pad &amp; Menit Bermain</strong><span>Tagging 2-Tier, Linimasa, Quartet 4v4</span></li>
    <li class="toc-item"><strong>Bab 4 — Studio Telestrasi Broadcast &amp; AI Tracking Offline</strong><span>17+ Alat Gambar, Kalibrasi 40×20m, MP4</span></li>
    <li class="toc-item"><strong>Bab 5 — Pusat Playlist, Presentasi &amp; Ekspor Multi-Format</strong><span>Merge Video, Folder Aksi, CSV &amp; PDF</span></li>
    <li class="toc-item"><strong>Bab 6 — Papan Taktik 2D (Coach Board) &amp; Training Session Planner</strong><span>Animasi MP4, Formasi &amp; PDF Drill</span></li>
    <li class="toc-item"><strong>Bab 7 — Menu Alat Pro: Analitik Lanjutan &amp; Ruang Ganti</strong><span>Klub, Musim, Chalkboard, Heatmap, WA</span></li>
    <li class="toc-item"><strong>Bab 8 — Daftar Pintasan Keyboard &amp; Solusi Kendala (FAQ)</strong><span>Shortcut Cepat &amp; Relink Video</span></li>
  </ul>

  <h3>Instalasi di Windows &amp; macOS</h3>
  <div class="grid-2">
    <div class="card">
      <div class="card-title">Pengguna Windows 10 / 11 (64-bit)</div>
      <ol>
        <li>Unduh file <code>ARF FutsalTag_0.2.0_x64-setup.exe</code> (atau <code>.msi</code>).</li>
        <li>Klik dua kali installer dan ikuti panduan pemasangan hingga selesai.</li>
        <li>Jika muncul peringatan <em>Windows SmartScreen</em>, klik <strong>More info → Run anyway</strong>.</li>
        <li>Seluruh komponen (FFmpeg, FFprobe, Whisper CLI, model AI ONNX) otomatis terpasang.</li>
      </ol>
    </div>
    <div class="card">
      <div class="card-title">Pengguna macOS (Apple Silicon &amp; Intel)</div>
      <ol>
        <li>Unduh file <code>.dmg</code> sesuai prosesor Mac Anda (<code>aarch64</code> untuk M1–M4 atau <code>x64</code> untuk Intel).</li>
        <li>Buka <code>.dmg</code> lalu seret ikon <strong>ARF FutsalTag</strong> ke folder <strong>Applications</strong>.</li>
        <li>Saat membuka pertama kali, klik kanan ikon aplikasi di Applications → pilih <strong>Open</strong> jika Gatekeeper meminta konfirmasi.</li>
      </ol>
    </div>
  </div>

  <div class="callout tip">
    <span class="callout-title">Format Berkas Proyek Portabel (.futsal)</span>
    Klik tombol <strong>Simpan</strong> (<kbd>Ctrl</kbd>+<kbd>S</kbd>) atau menu <strong>Proyek</strong> di pojok kanan atas kapan saja untuk menyimpan seluruh catatan tag, label, roster pemain, coretan telestrasi, dan playlist ke dalam satu berkas <code>.futsal</code>. Aplikasi juga melakukan <em>Auto-save</em> cadangan setiap 60 detik.
  </div>
</section>

<!-- BAB 2: PROJECT HUB -->
<section class="chapter-break">
  <span class="chapter-tag">Bab 2 • Memulai Aplikasi</span>
  <h2 class="chapter-title">Project Hub &amp; Manajemen Berkas Proyek</h2>

  <p>
    Saat pertama kali dibuka, Anda akan disambut oleh layar <strong>Hub</strong> yang membagi titik masuk ke dalam 3 kartu kerja sesuai kebutuhan lapangan Anda:
  </p>

  <div class="figure">
    <img src="{s_hub}" alt="Layar Project Hub ARF FutsalTag" />
    <div class="figure-caption"><strong>Gambar 2.1:</strong> Tampilan <em>Project Hub</em> dengan 3 alur utama: Analisis Pertandingan Penuh, Studio Telestrasi Singkat, dan Papan Taktik Futsal (2D).</div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">1. Analisis Pertandingan Penuh (Kolom Kiri)</div>
      <ul>
        <li>Isi nama kompetisi, pilih jenis sesi (<strong>Pertandingan</strong> atau <strong>Latihan</strong>), pilih klub Home &amp; Away dari <em>Library</em> (beserta warna jersey), dan pilih babak.</li>
        <li><strong>Pilih / Gabung Video MP4:</strong> Impor 1 atau lebih file video untuk otomatis digabung dan mulai analisis penuh.</li>
        <li><strong>Mode Tanpa/Live Video:</strong> Mendukung <em>Tagging Live (Stopwatch Tanpa Video)</em> di pinggir lapangan, <em>Impor Link Online</em> (YouTube / <code>.m3u8</code> / MP4), <em>Telestrasi Cepat (1 Klip — OnlyDraw)</em>, serta <em>Rekam Kamera / Capture Card</em>.</li>
        <li><strong>Muat Sampel Demo:</strong> Uji seluruh fitur instan menggunakan data demo bawaan (<em>Pendekar United vs Blacksteel</em>).</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title">2. Mode Cepat &amp; Menu Proyek (Header Kanan)</div>
      <ul>
        <li><strong>Studio Telestrasi Singkat:</strong> Cocok saat Anda hanya punya cuplikan 10–60 detik dari ponsel/rekaman gol dan ingin langsung menggambar Spotlight 3D tanpa setup tagging.</li>
        <li><strong>Papan Taktik Futsal (2D):</strong> Langsung masuk ke <em>Coach Board</em> untuk merancang rotasi 3-1, 4-0, atau Power Play 5v4.</li>
        <li><strong>Menu Proyek (Pojok Kanan Atas):</strong> Akses cepat ke <em>Proyek Baru</em>, <em>Buka Berkas Proyek</em>, <em>Relink Folder Massal</em>, <strong>Gabung Tag dari Laptop Lain</strong> (sinkronisasi multi-analis berbasis titik <em>kickoff</em>), dan <em>Geser Waktu Semua Tag</em>.</li>
      </ul>
    </div>
  </div>
</section>

<!-- BAB 3: WORKSPACE TAGGING, ACTION PAD, MENIT BERMAIN -->
<section class="chapter-break">
  <span class="chapter-tag">Bab 3 • Tagging &amp; Linimasa</span>
  <h2 class="chapter-title">Workspace Tagging, Action Pad &amp; Menit Bermain</h2>

  <p>
    Tab <strong>Tagging</strong> mengadopsi tata letak 2-Tier berkecepatan tinggi yang menggabungkan daftar tombol aksi di sisi kiri, pemutar video bersih + Action Pad di tengah, daftar Klip/Playlist di sisi kanan, dan Linimasa multi-baris penuh di bagian bawah.
  </p>

  <div class="figure">
    <img src="{s_tag}" alt="Workspace Tagging ARF FutsalTag" />
    <div class="figure-caption"><strong>Gambar 3.1:</strong> Ruang kerja <em>Tagging</em> menampilkan Video Player, <em>Pinned Live Players Bar</em>, kontrol transport &amp; <code>KO</code>, Action Pad cepat, panel daftar <em>Klip / Playlist</em>, serta Linimasa multi-kategori di bawah.</div>
  </div>

  <h3>A. Cara Melakukan Tagging Pertandingan</h3>
  <ol>
    <li><strong>Mode Kontinu (Start → Stop):</strong> Klik tombol fase seperti <em>Build-up 3-1</em>, <em>Pressing High</em>, atau <em>Transition Attack</em> untuk mulai merekam durasi; klik lagi (atau tekan <kbd>Esc</kbd>) untuk menutup klip.</li>
    <li><strong>Mode 1-Klik:</strong> Tombol momen instan seperti <em>Goal</em>, <em>Shot on Target</em>, atau <em>Goalkeeper Save</em> otomatis membuat klip dengan durasi <em>Pre-Roll</em> (default <code>-5s</code>) dan <em>Post-Roll</em> (<code>+3s</code>) di linimasa.</li>
    <li><strong>Tandai Pemain &amp; Label:</strong> Klik pemain pada <strong>Pinned Live Players Bar</strong> tepat di bawah video (misal <code>#9 Pivot</code>) serta pilih chip <strong>LABEL</strong> taktis (<em>Diagonal, Wallpass, Block Screen, Gol/Sukses</em>) di kiri bawah.</li>
    <li><strong>Sinkron Kick-Off (<code>KO</code>) &amp; Deteksi Peluit:</strong> Klik tombol <strong>KO</strong> di bilah kontrol video tepat saat peluit awal berbunyi agar seluruh waktu klip mengikuti waktu bersih pertandingan (<code>B1 / B2</code>). Gunakan tombol <strong>Peluit AI</strong> untuk mendeteksi bunyi peluit wasit secara otomatis.</li>
    <li><strong>Kelola Linimasa &amp; Klip:</strong> Arahkan kursor di penggaris linimasa untuk melihat pratinjau frame (<em>hover thumbnail scrubbing</em>), seret tepi kiri/kanan klip untuk memangkas durasi, seret tengah klip untuk memindah waktu/baris kategori, dan saring klip di panel kanan memakai filter <code>Semua | H | A | ★ | 👍 | 👎</code>.</li>
  </ol>
</section>

<section class="chapter-break">
  <h3>B. Mengatur Papan Aksi Visual (Action Pad Studio)</h3>
  <p>
    Klik sub-tab <strong>Action Pad</strong> di pojok kiri atas ruang Tagging untuk membuka editor papan visual. Anda dapat menyesuaikan tombol aksi agar sesuai filosofi kepelatihan tim Anda:
  </p>

  <div class="figure">
    <img src="{s_pad}" alt="Visual Coding Board / Action Pad Studio" style="max-height:62mm;" />
    <div class="figure-caption"><strong>Gambar 3.2:</strong> Editor <em>Action Pad (Coding Board Studio)</em> untuk menyusun posisi tombol taktis, warna, hotkey keyboard, serta garis relasi saling mematikan.</div>
  </div>

  <ul>
    <li><strong>Geser &amp; Ubah Ukuran (<kbd>V</kbd>):</strong> Klik dan seret tombol untuk memindah letaknya, atau tarik sudut kanan bawah tombol untuk memperbesar/memperkecil ukuran.</li>
    <li><strong>Hubungkan Garis (<kbd>L</kbd>):</strong> Tarik garis penghubung dari <em>Tag A</em> ke <em>Tag B</em> agar ketika Tag B ditekan saat pertandingan berlangsung, Tag A otomatis berhenti (sangat efektif untuk fase yang saling menggantikan seperti <em>Transition Attack ↔ Transition Defense</em>).</li>
    <li><strong>Impor / Ekspor &amp; Preset:</strong> Pilih preset bawaan (termasuk <em>Futsal Pro</em> &amp; <em>Futsal - Amril matrix 2</em>) atau ekspor/impor format <code>.momen.json</code> untuk dibagikan ke sesama analis.</li>
  </ul>

  <h3>C. Sub-Tab Menit Bermain &amp; Analisis Quartet 4v4 (+/-)</h3>
  <p>
    Karena futsal menggunakan sistem pergantian cepat (<em>rolling substitution</em>), sub-tab <strong>Menit</strong> membantu pelatih memantau kelelahan pemain dan menilai kombinasi 4 pemain lapangan (<em>Quartet</em>) yang paling produktif.
  </p>

  <div class="figure">
    <img src="{s_min}" alt="Sub-Tab Menit Bermain dan Analisis Quartet 4v4" style="max-height:62mm;" />
    <div class="figure-caption"><strong>Gambar 3.3:</strong> Panel <em>Menit</em> menampilkan pemain di lapangan (5/5), riwayat rotasi, grafik batang durasi <em>shift</em>, dan tabel <em>Analisis Kombinasi Quartet 4v4 (+/-)</em>.</div>
  </div>

  <p>
    Atur <em>Starting 5</em> lewat tombol kanan atas, tambahkan daftar pemain cadangan pada kolom <strong>Bangku Cadangan</strong>, lalu klik 1 pemain di lapangan saat video berjalan untuk mencatat pergantian (<em>Sub Out → Sub In</em>). Sistem otomatis menghitung durasi total, jumlah <em>shift</em>, Gol Untuk (<strong>GF</strong>), Gol Kebobolan (<strong>GA</strong>), selisih (<strong>+/-</strong>), serta <strong>Shot OT</strong> untuk setiap kombinasi 4 pemain.
  </p>
</section>

<!-- BAB 4: STUDIO TELESTRASI -->
<section class="chapter-break">
  <span class="chapter-tag">Bab 4 • Visualisasi Taktik Video</span>
  <h2 class="chapter-title">Studio Telestrasi Broadcast &amp; AI Tracking</h2>

  <p>
    Dari panel klip di Tagging atau tab <strong>Telestrasi</strong> di menu atas, Anda dapat memperkaya rekaman video pertandingan dengan grafis analisis bergaya siaran televisi profesional serta narasi suara pelatih.
  </p>

  <div class="figure">
    <img src="{s_tel}" alt="Studio Telestrasi ARF FutsalTag" style="max-height:66mm;" />
    <div class="figure-caption"><strong>Gambar 4.1:</strong> <em>Studio Telestrasi</em> lengkap dengan 17+ alat gambar taktis di kiri, deteksi AI di atas video, daftar elemen di kanan, serta kontrol <em>Jeda Freeze</em> dan <em>Slow-Mo</em> di bawah.</div>
  </div>

  <h3>Daftar Alat Telestrasi &amp; Efek Broadcast</h3>
  <table>
    <thead>
      <tr>
        <th style="width: 28%;">Alat Gambar</th>
        <th>Fungsi Taktis &amp; Visualisasi di Video</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>3D Spotlight Futsal</strong></td>
        <td>Menyorot pemain kunci dengan cincin cahaya vertikal di atas lantai lapangan.</td>
      </tr>
      <tr>
        <td><strong>Panah Lengkung / Operan / Lari</strong></td>
        <td>Menggambarkan jalur umpan terobosan, tembakan, rotasi tanpa bola (<em>dashed</em>), dan <strong>Panah Parabolik 3D</strong> untuk umpan lambung/chip.</td>
      </tr>
      <tr>
        <td><strong>Lingkaran, Link &amp; Ghost</strong></td>
        <td>Menandai posisi pemain (<code>#</code>), menghubungkan garis formasi (<em>Player Link</em>), serta membuat bayangan posisi ideal pemain (<em>Ghost</em>).</td>
      </tr>
      <tr>
        <td><strong>Zona Arsir &amp; Dinding Blok (Wall)</strong></td>
        <td>Menandai area tekanan/ruang kosong dengan pola arsir dinamis (<em>Hatched Zone</em>) dan memvisualisasikan pagar hidup <strong>3D Wall Barrier</strong> saat bola mati.</td>
      </tr>
      <tr>
        <td><strong>Radar Visi (FOV) &amp; Hull</strong></td>
        <td>Menunjukkan sudut pandang (<em>blind-side</em>) pemain serta menghitung luas kekompakan tim (<em>Convex Hull</em>).</td>
      </tr>
      <tr>
        <td><strong>Garis Jarak, Sudut &amp; Laju</strong></td>
        <td>Mengukur jarak meter riil (<code>40m×20m</code>), sudut passing, kecepatan lari (km/h), hingga <strong>Timer Transisi (4s)</strong> &amp; <strong>2D Mini Radar Peta</strong>.</td>
      </tr>
      <tr>
        <td><strong>Efek Gerak (Comet &amp; Ripple)</strong></td>
        <td>Menambahkan jejak gerak <em>Motion Comet Trail</em> dan riak sorotan <em>3D Puddle Ripple</em> untuk penekanan visual kelas broadcast.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout">
    <span class="callout-title">Alur Cepat Kalibrasi 4-Titik, AI Tracking &amp; Ekspor MP4:</span>
    <ol style="margin-bottom:0;">
      <li>Klik <strong>Deteksi &amp; Pilih Pemain (AI)</strong> di atas video agar model lokal <code>YOLOX-Nano</code> mengenali pemain &amp; bola secara otomatis.</li>
      <li>Tekan tombol <kbd>F</kbd> atau <strong>+ Jeda Freeze (F)</strong> untuk menghentikan video sejenak saat analisis dibacakan (atur durasi jeda <code>1s–8s</code> dengan slider di bawah, serta centang <strong>+ Replay Bersih</strong> bila ingin memutar ulang klip polos setelah telestrasi).</li>
      <li>Jika sudah selesai menggambar dan/atau merekam voiceover, klik tombol hijau <strong>Ekspor MP4</strong> di kanan atas untuk membakar grafis ke dalam video MP4.</li>
    </ol>
  </div>
</section>

<!-- BAB 5: PLAYLIST & EKSPOR -->
<section class="chapter-break">
  <span class="chapter-tag">Bab 5 • Kurasi &amp; Distribusi</span>
  <h2 class="chapter-title">Pusat Playlist, Presentasi &amp; Ekspor Video</h2>

  <p>
    Tab <strong>Playlist</strong> menjadi pusat kurasi sebelum sesi rapat evaluasi tim. Anda bisa menyaring klip berdasarkan kategori aksi, label, maupun nama pemain di panel kiri atas, lalu mengumpulkannya ke dalam daftar presentasi tim.
  </p>

  <div class="figure">
    <img src="{s_ply}" alt="Pusat Playlist dan Ekspor Multi-Format" />
    <div class="figure-caption"><strong>Gambar 5.1:</strong> <em>Pusat Playlist &amp; Ekspor Multi-Format</em> dengan penyaring pustaka klip, Mode Simulasi Presentasi TV, keranjang Presentasi, dan pengaturan 3 format ekspor MP4.</div>
  </div>

  <div class="grid-2">
    <div class="card">
      <div class="card-title">Mode Simulasi &amp; Keranjang Presentasi</div>
      <ul>
        <li>Klik <strong>Putar Seluruh Playlist</strong> untuk memutar klip berurutan secara otomatis seperti siaran TV analisis.</li>
        <li>Tambahkan <strong>Kartu Judul</strong> (2 detik sebelum klip), <strong>Gambar Taktik</strong>, atau sisipan <strong>Video</strong> ke keranjang presentasi di kolom kanan atas.</li>
        <li>Gunakan tombol <strong>Presenter Fullscreen</strong> untuk langsung memproyeksikan presentasi ke layar besar atau TV ruang ganti.</li>
      </ul>
    </div>
    <div class="card">
      <div class="card-title">3 Mode Ekspor Video &amp; Laporan Data</div>
      <ul>
        <li><strong>1. Gabung Menjadi 1 Video Utuh (Merge):</strong> Menggabungkan seluruh klip terpilih menjadi satu file MP4 kompilasi.</li>
        <li><strong>2. Ekspor Klip Terpisah di 1 Folder:</strong> Merender setiap klip sebagai file individual (<code>Klip_01_Gol.mp4</code>, dll.).</li>
        <li><strong>3. Kelompokkan ke Folder Aksi:</strong> Memisahkan klip ke subfolder otomatis berdasarkan nama kategori aksi.</li>
        <li>Pilih resolusi <code>1080p / 720p</code>, rasio <code>16:9 Landscape</code> atau <code>9:16 Reels / IG</code>, serta klik <strong>Ekspor Rekap CSV</strong> atau <strong>Laporan PDF</strong> di pojok kanan atas.</li>
      </ul>
    </div>
  </div>
</section>

<!-- BAB 6: PAPAN TAKTIK 2D & SESSION PLANNER -->
<section class="chapter-break">
  <span class="chapter-tag">Bab 6 • Papan Taktik &amp; Sesi Latihan</span>
  <h2 class="chapter-title">Papan Taktik 2D (Coach Board) &amp; Training Planner</h2>

  <p>
    Buka tab <strong>Taktik 2D</strong> untuk merancang skema rotasi pemain, bola mati (<em>kick-in</em> &amp; <em>corner</em>), atau menyusun modul latihan lengkap berstandar lapangan futsal FIFA.
  </p>

  <div class="figure">
    <img src="{s_pcb}" alt="Papan Taktik 2D Coach Board ARF FutsalTag" style="max-height:66mm;" />
    <div class="figure-caption"><strong>Gambar 6.1:</strong> <em>Papan Taktik 2D</em> dengan 4 pilihan lantai FIFA, preset formasi instan, toolbar gambar kiri, catatan poin pelatih di kanan, dan timeline animasi <em>multi-step</em> di bawah.</div>
  </div>

  <h3>Fitur Utama Coach Board</h3>
  <ul>
    <li><strong>Kustomisasi Lantai &amp; Formasi Instan:</strong> Ganti tampilan lapangan (<em>Parket Kayu</em>, <em>Vinyl Biru</em>, <em>Rumput Sintetis</em>, <em>Dark Slate</em>, atau unggah <em>Lapangan Kustom</em>) dan panggil formasi cepat <strong>3-1 Pivot</strong>, <strong>4-0 Flat</strong>, <strong>2-2 Box</strong>, atau <strong>Power Play (5v4)</strong>.</li>
    <li><strong>Animasi Pergerakan Multi-Step:</strong> Atur posisi awal pemain pada <em>Step 1</em>, klik <strong>+ Tambah Step</strong> di kanan bawah, geser pemain &amp; bola ke posisi berikutnya, lalu klik <strong>Putar Animasi</strong> untuk melihat transisi pergerakan yang halus.</li>
    <li><strong>Ekspor Langsung ke Media:</strong> Klik tombol <strong>Video MP4</strong> untuk merekam animasi taktik menjadi video MP4, <strong>PNG</strong> untuk menyimpan gambar lapangan, atau <strong>PDF Drill</strong> untuk mencetak lembar skema.</li>
  </ul>

  <div class="figure">
    <img src="{s_trn}" alt="Coach Training Session Planner Modal" style="max-height:66mm;" />
    <div class="figure-caption"><strong>Gambar 6.2:</strong> Jendela <em>Coach Training Session Planner</em> (diakses lewat tombol hijau <strong>Rencana Sesi Latihan</strong>) untuk menyusun program latihan terstruktur hingga cetak PDF.</div>
  </div>

  <p>
    Melalui tombol <strong>Rencana Sesi Latihan</strong>, pelatih dapat menyusun seluruh blok fase latihan (<em>Pemanasan</em>, <em>Materi Inti</em>, <em>Penyelesaian / Game</em>, dan <em>Pendinginan</em>), mencatat area lapangan, jumlah pemain, perlengkapan, dan poin kepelatihan, mengambil diagram langsung dari Coach Board (<strong>Ambil Diagram dari Coach Board</strong>), lalu mengekspornya menjadi dokumen <strong>PDF Sesi Latihan Lengkap</strong> siap cetak.
  </p>
</section>

<!-- BAB 7: ALAT ANALISIS PRO -->
<section class="chapter-break">
  <span class="chapter-tag">Bab 7 • Fitur Lanjutan</span>
  <h2 class="chapter-title">Menu Alat Analisis Pro &amp; Distribusi Pemain</h2>

  <p>
    Klik menu <strong>Alat Pro</strong> pada bilah header kanan atas dari halaman mana saja untuk mengakses 6 modul analitik dan ruang ganti profesional:
  </p>

  <div class="figure">
    <img src="{s_pro}" alt="Menu Dropdown Alat Analisis Pro" />
    <div class="figure-caption"><strong>Gambar 7.1:</strong> Menu <em>Alat Analisis Pro</em> berisi akses cepat ke Database Klub, Analitik Musim, Studio Presentasi, Ruang Ganti Chalkboard, Heatmap &amp; Operan, dan Ekspor Paket WA.</div>
  </div>

  <table>
    <thead>
      <tr>
        <th style="width: 30%;">Modul Alat Pro</th>
        <th>Kegunaan di Lapangan &amp; Rapat Tim</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>Database Klub</strong></td>
        <td>Menyimpan profil klub (Tim Utama maupun lawan), warna jersey Home/Away, serta daftar roster pemain agar selalu siap dipakai di setiap proyek baru.</td>
      </tr>
      <tr>
        <td><strong>Analitik Musim</strong></td>
        <td>Menggabungkan statistik lintas pertandingan dalam satu musim kompetisi untuk melihat tren gol, tembakan, efektivitas fase, dan kontribusi pemain.</td>
      </tr>
      <tr>
        <td><strong>Studio Presentasi</strong></td>
        <td>Mode layar penuh untuk rapat analisis: putar klip playlist bergantian dengan slide papan taktik 2D, lengkap dengan pena coret langsung di proyektor.</td>
      </tr>
      <tr>
        <td><strong>Ruang Ganti Chalkboard</strong></td>
        <td>Mode teater cepat khusus jeda babak di ruang ganti: dilengkapi timer hitung mundur (10/15 menit), auto-pause saat layar disentuh/digambar, dan Undo.</td>
      </tr>
      <tr>
        <td><strong>Heatmap &amp; Operan</strong></td>
        <td>Menghasilkan peta panas sebaran posisi aksi serta diagram jaringan umpan 5v5 antar pemain berdasarkan koordinat lapangan dan target operan.</td>
      </tr>
      <tr>
        <td><strong>Ekspor Paket WA</strong></td>
        <td>Mengompresi dan menggabungkan klip aksi khusus per individu pemain dalam format 720p berukuran ringan (&lt;15 MB) agar langsung terkirim lancar via WhatsApp.</td>
      </tr>
    </tbody>
  </table>

  <div class="callout tip">
    <span class="callout-title">Tips Kolaborasi Tim Kepelatihan (Multi-Analyst Merge)</span>
    Saat pertandingan penting, satu analis bisa fokus menandai fase bertahan dan analis kedua fokus menandai fase menyerang di laptop berbeda. Setelah laga selesai, buka <strong>Proyek → Gabung Tag dari Laptop Lain...</strong> untuk menyatukan seluruh data klip mereka ke dalam satu file proyek secara otomatis dengan sinkronisasi detik <em>kickoff</em>.
  </div>
</section>

<!-- BAB 8: SHORTCUT KEYBOARD & FAQ -->
<section class="chapter-break">
  <span class="chapter-tag">Bab 8 • Referensi Cepat</span>
  <h2 class="chapter-title">Pintasan Keyboard &amp; Solusi Kendala Umum</h2>

  <p>
    Gunakan pintasan keyboard berikut di workspace <strong>Tagging</strong> dan <strong>Linimasa</strong> agar Anda dapat bekerja cepat dengan satu tangan tanpa terus-menerus mengklik mouse. Anda juga bisa menekan <kbd>Shift</kbd>+<kbd>/</kbd> (<kbd>?</kbd>) untuk membuka jendela pengaturan shortcut &amp; memilih preset <em>Futsal Speed (J/K/L)</em> atau <em>Premiere Shuttle</em>.
  </p>

  <table>
    <thead>
      <tr>
        <th style="width: 24%;">Tombol Shortcut</th>
        <th style="width: 30%;">Nama Aksi</th>
        <th>Fungsi</th>
      </tr>
    </thead>
    <tbody>
      <tr><td><kbd>Space</kbd></td><td>Play / Pause Video</td><td>Memutar atau menjeda video pertandingan.</td></tr>
      <tr><td><kbd>J</kbd> / <kbd>K</kbd> / <kbd>L</kbd></td><td>Kontrol Kecepatan</td><td><code>J</code> perlambat (0.5x/0.25x), <code>K</code> reset 1.0x + Pause, <code>L</code> percepat hingga 4x.</td></tr>
      <tr><td><kbd>←</kbd> / <kbd>→</kbd></td><td>Geser 1 Frame</td><td>Mundur atau maju tepat 1 frame untuk akurasi titik klip.</td></tr>
      <tr><td><kbd>Shift</kbd>+<kbd>←</kbd> / <kbd>→</kbd></td><td>Lompat ±1 Detik</td><td>Melompat cepat 1 detik ke belakang atau ke depan.</td></tr>
      <tr><td><kbd>Shift</kbd>+<kbd>J</kbd> / <kbd>Shift</kbd>+<kbd>L</kbd></td><td>Lompat ±2 Detik</td><td>Memutar balik atau maju cepat 2 detik.</td></tr>
      <tr><td><kbd>I</kbd> / <kbd>O</kbd></td><td>Set IN / Set OUT</td><td>Menandai titik awal (IN) lalu membuat klip manual di titik akhir (OUT).</td></tr>
      <tr><td><kbd>Alt</kbd>+<kbd>U</kbd></td><td>Edit / Simpan Klip</td><td>Buka panel editor lengkap klip terpilih atau simpan rentang IN–OUT.</td></tr>
      <tr><td><kbd>S</kbd></td><td>Split Klip</td><td>Memotong klip yang sedang dipilih tepat di posisi garis playhead.</td></tr>
      <tr><td><kbd>Ctrl</kbd>+<kbd>D</kbd> / <kbd>Delete</kbd></td><td>Duplikat / Hapus Klip</td><td>Menggandakan atau menghapus klip terpilih.</td></tr>
      <tr><td><kbd>Ctrl</kbd>+<kbd>C</kbd> / <kbd>Ctrl</kbd>+<kbd>V</kbd></td><td>Salin / Tempel Label</td><td>Menyalin label taktis &amp; pemain ke satu atau banyak klip sekaligus.</td></tr>
      <tr><td><kbd>/</kbd></td><td>Cari Tag Cepat</td><td>Langsung mengarahkan kursor ke kotak pencarian tag &amp; label.</td></tr>
      <tr><td><kbd>Ctrl</kbd>+<kbd>Z</kbd> / <kbd>Ctrl</kbd>+<kbd>Y</kbd></td><td>Undo / Redo</td><td>Mengurungkan atau mengulangi perubahan klip terakhir.</td></tr>
      <tr><td><kbd>Ctrl</kbd>+<kbd>S</kbd></td><td>Simpan Proyek</td><td>Menyimpan seluruh perubahan ke berkas <code>.futsal</code>.</td></tr>
    </tbody>
  </table>

  <h3>Solusi Kendala Umum (Troubleshooting)</h3>
  <div class="card" style="margin-bottom: 8px;">
    <div class="card-title">1. Muncul banner "Video pertandingan tidak ditemukan" saat membuka file .futsal</div>
    <p style="margin:0;">
      Hal ini wajar terjadi ketika proyek dibuka di laptop lain atau folder video dipindahkan. Cukup klik <strong>Cari File Video</strong> pada banner peringatan, atau pilih <strong>Relink Folder Massal</strong> (juga tersedia di menu <em>Proyek</em>) untuk memindai seluruh video utama dan multi-kamera sekaligus secara otomatis.
    </p>
  </div>
  <div class="card" style="margin-bottom: 8px;">
    <div class="card-title">2. Klip hasil tagging dari dua analis waktunya tidak sejajar</div>
    <p style="margin:0;">
      Pastikan sebelum menggabungkan proyek lewat <strong>Proyek → Gabung Tag dari Laptop Lain...</strong> Anda sudah menetapkan titik <em>Kick-Off</em> (<code>KO</code>), atau gunakan menu <strong>Proyek → Geser Waktu Semua Tag...</strong> untuk menggeser seluruh timestamp beberapa detik agar selaras dengan rekaman video utama.
    </p>
  </div>
  <div class="card">
    <div class="card-title">3. Ekspor video MP4 terasa lambat pada laptop berspesifikasi standar</div>
    <p style="margin:0;">
      Aplikasi otomatis memakai akselerasi GPU bila tersedia (<code>h264_nvenc</code> pada NVIDIA atau <code>h264_videotoolbox</code> pada macOS) dan beralih ke <code>libx264</code> pada CPU standar. Untuk presentasi cepat atau pengiriman via ponsel, ubah resolusi ekspor menjadi <strong>720p (HD)</strong> atau gunakan kualitas <strong>Ringan WA</strong> agar proses render jauh lebih cepat.
    </p>
  </div>
</section>

</body>
</html>
"""


def main():
    import tempfile
    browser = find_browser()
    with tempfile.NamedTemporaryFile("w", suffix=".html", delete=False, encoding="utf-8") as tmp:
        tmp.write(build_html())
        tmp_path = Path(tmp.name)
    try:
        subprocess.run(
            [
                browser,
                "--headless=new",
                "--disable-gpu",
                "--no-pdf-header-footer",
                f"--print-to-pdf={OUT_PDF}",
                tmp_path.as_uri(),
            ],
            check=True,
        )
    finally:
        tmp_path.unlink(missing_ok=True)
    print(f"PDF generated: {OUT_PDF} ({OUT_PDF.stat().st_size} bytes)")
    try:
        from pypdf import PdfReader
        print(f"Pages: {len(PdfReader(str(OUT_PDF)).pages)}")
    except ImportError:
        pass


if __name__ == "__main__":
    main()

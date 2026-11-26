# ARF FutsalTag

**Aplikasi Analisis Video Pertandingan Futsal, Telestrasi Broadcast & Papan Taktik Interaktif (Desktop macOS & Windows)**

ARF FutsalTag dibangun menggunakan **Tauri v2 (Rust)** dan **Svelte 5 (TypeScript)** khusus untuk alur kerja pelatih dan analis futsal berstandar lapangan FIFA ($40\text{m} \times 20\text{m}$).

---

## Fitur Utama

### 1. Tagging & Klip Pertandingan Futsal (Arsitektur 2-Tier Momen Sports + Once Sport)
- **Workspace 2-Tier Profesional**: Sidebar kiri fokus pada tombol **`TAG`** (mode **Kontinu Start → Stop** & **1-Klik**) serta chip **`LABEL`**, video bersih di tengah dengan **Pinned Live Players Bar**, kanvas taktik spasial yang bisa ditarik/disembunyikan, daftar **`Klip | Playlist`** di kanan, dan **Linimasa full-width** di bagian bawah.
- **Visual Coding Board Studio (`Action Pad`)**: Geser dan ubah ukuran tombol secara bebas, hubungkan garis relasi antar-tag (`links` saling mematikan otomatis saat tagging) maupun **Label → Tag** (`forTags`), atur `Exclusion Group`, hotkey kustom, serta impor/ekspor papan `.momen.json` (termasuk preset bawaan **`Futsal - Amril matrix 2`** dengan 68 tombol).
- **Linimasa Full-Width & Trimming**: Menampilkan semua baris kategori papan aktif, zoom `1x–16x` (+ overview pan bar), pengaturan `Pre-Roll / Post-Roll`, serta seret tepi kiri/kanan klip langsung untuk memangkas durasi.
- **Editor Metadata Taktis & Pemetaan Koordinat**: Pengaturan multi-pemain (roster terpadu), kategori aksi dari papan aktif, multi-label, hasil (*outcome*), rating, target penerima operan (*passing target*), serta **Mini-Court Coordinate Picker** ($40\text{m} \times 20\text{m}$).
- **Matriks Silang Statistik**: Tabulasi silang interaktif **Tag × Pemain** dan **Tag × Label** lengkap dengan total durasi fase, pemutaran playlist berurutan per sel/baris/kolom, dan ekspor CSV.

### 2. Studio Telestrasi & AI Tracking
- **12 Alat Gambar Telestrasi**: 3D Spotlight, Panah Lengkung (Curved Arrow), Panah Operan, Panah Lari (Dashed), Lingkaran Pemain, Radar Visi (FOV terarah), Area Kompak Tim (Convex Hull), Garis Jarak (Meter), Lensa Zoom (Magnifier), Silang Taktik (Player Cross), Catatan Teks, dan Marker Bebas.
- **Kalibrasi Lapangan 3D (Homography DLT 4-Titik)**: Mengonversi koordinat layar ke meter riil lapangan FIFA ($40\text{m} \times 20\text{m}$) untuk pengukuran jarak dan luas area kompak tim ($m^2$).
- **AI Multi-Player Detection (ONNX Runtime + YOLOX-Nano)**: Backend Rust (`ort`) mengekstrak frame via FFmpeg, mendeteksi pemain & bola dengan model Apache-2.0 `yolox_nano.onnx`, mengelompokkan tim berdasarkan warna jersey (2-means), dan menghasilkan keyframe otomatis.
- **Visual Element Auto-Tracking (NCC + Histogram)**: Pelacakan posisi elemen terpilih di browser/canvas menggunakan *Normalized Cross-Correlation* + histogram warna dengan penghalusan EMA.
- **Voiceover Audio Pelatih & Burn-In Video**: Perekaman suara mikrofon dan pembakaran seluruh grafis telestrasi + freeze-frame + mixing audio (`amix`) langsung ke MP4 lewat FFmpeg (dengan deteksi encoder hardware `h264_videotoolbox` / `h264_nvenc` dan fallback `libx264`).

### 3. Playlist, Ekspor Multi-Format & Paket WhatsApp
- **3 Mode Ekspor Playlist**: Gabung menjadi 1 video kompilasi (`merged_video`), ekspor klip terpisah (`separate_clips`), atau pengelompokan otomatis ke subfolder kategori (`grouped_folders`) di resolusi 1080p/720p.
- **WhatsApp Player Exporter**: Kompilasi klip per pemain di resolusi 720p hemat ukuran (dengan opsi menyertakan telestrasi & voiceover).
- **Single-File Project (`.futsal`)**: Penyimpanan dan pemuatan proyek JSON lengkap beserta roster, kalibrasi, tag, telestrasi, dan playlist via dialog file native Tauri.

### 4. Analitik Spasial, Ruang Ganti & Papan Taktik 2D
- **Futsal Heatmap & Passing Network**: Peta panas deterministik dari `courtCoord`/zona serta jaringan operan nyata antar pemain dari `passTargetPlayer` atau transisi berurutan.
- **Halftime Locker-Room Chalkboard**: Mode teater layar penuh dengan *auto-pause* saat menyentuh/menggambar, timer hitung mundur jeda babak (10m/15m), Undo, dan overlay telestrasi tersimpan.
- **Papan Taktik Futsal 2D**: 4 pilihan lantai FIFA (Parket, Vinyl Biru, Rumput Sintetis, Dark Slate), preset formasi 3-1, 4-0, 2-2, Power Play 5v4, animasi multi-step, poligon zona pressing, dan ekspor PNG/PDF (`jsPDF`).

---

## Tech Stack
- **Desktop Framework:** Tauri v2 (Rust) + `@tauri-apps/plugin-dialog`
- **AI Inference:** `ort` (ONNX Runtime) + `yolox_nano.onnx` (Apache-2.0)
- **Media Engine:** FFmpeg & FFprobe CLI Bridge (normalisasi resolusi/fps/audio, hardware encoder detection, `amix`)
- **Frontend:** Svelte 5 (Runes), SvelteKit (`adapter-static`), TypeScript, Vite

---

## Prasyarat & Menjalankan Aplikasi
1. [Node.js](https://nodejs.org/) / [Bun](https://bun.sh/)
2. [Rust & Cargo](https://rustup.rs/)
3. [FFmpeg & FFprobe](https://ffmpeg.org/) (tersedia di `/opt/homebrew/bin`, `/usr/local/bin`, atau `PATH`)

```bash
npm install
npm run check
npm run tauri dev
```

---

## Roadmap Upgrade V2

Rencana pengembangan lengkap tahap berikutnya untuk keempat pilar upgrade (Linimasa & Menit Bermain Futsal, Broadcast Chroma-Key & AI Tracking, Mode Presentasi & XML Interop, serta Database Klub & Season Analytics) tersedia pada dokumen [PLANNING_UPGRADE_V2.md](./PLANNING_UPGRADE_V2.md).

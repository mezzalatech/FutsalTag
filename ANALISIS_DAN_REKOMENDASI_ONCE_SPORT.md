# DOKUMEN HASIL ANALISIS TEKNIS & REKOMENDASI: ONCE SPORT vs TELESLATOR

> **Target Analisis:** Once Sport v4.9.6 (Build 28.09.2026)  
> **Lokasi File Sumber:** `C:\Program Files (x86)\Once Sport`  
> **Tujuan Proyek:** Membangun aplikasi analisis olahraga dan papan taktik futsal yang menyamai dan melampaui kemampuan Once Sport.

---

## 1. Bedah Forensik Instalasi Once Sport

Berdasarkan investigasi file binary, file konfigurasi, modul AI, dan pustaka C++ di direktori instalasi, berikut adalah anatomi arsitektur Once Sport:

```
┌────────────────────────────────────────────────────────────────────────┐
│                      ONCE SPORT v4.9.6 ARCHITECTURE                    │
├────────────────────────────────────────────────────────────────────────┤
│  Runtime          : Microsoft .NET 10.0 (CoreCLR, CLRJIT, x64)         │
│  UI Framework     : Avalonia UI + SkiaSharp (Google Skia 2D Engine)    │
│  Video Playback   : C++ Native Wrapper (Libmio) + FFmpeg 7 + SDL3      │
│  Computer Vision  : OpenCV 4.6 (Core, Calib3d, Tracking, Features2d)   │
│  AI Engine        : Microsoft.ML.OnnxRuntime (ONNX Runtime v1.17+)     │
│  Database / Schema: XML Schema Proyek + ClosedXML (Excel)              │
│  Reporting / Doc  : MigraDoc + PdfSharp                                │
└────────────────────────────────────────────────────────────────────────┘
```

### A. Model AI yang Ditemukan di Folder Once Sport
Di dalam folder instalasi Once Sport ditemukan 5 model jaringan saraf tiruan (ONNX):
1. **`detect_football_field_kpts_fp16.onnx` (28.2 MB):**  
   Mendeteksi titik-titik persimpangan garis lapangan (*keypoints*) sepak bola untuk kalibrasi matriks Homografi otomatis.
2. **`detect_kpts_basketball_fp16.onnx` (27.2 MB):**  
   Mendeteksi sudut garis tiga angka, lingkaran tengah, dan area kunci lapangan basket.
3. **`detect_american_football_field_kpts_fp16.onnx` (33.0 MB).**
4. **`play.onnx` (6.8 MB):**  
   Model deteksi pemain (arsitektur berbasis YOLO / MobileNet) untuk mengenali kotak pembatas (*bounding box*) pemain.
5. **`playsgm.onnx` (10.8 MB):**  
   Model segmentasi siluet pemain (*player mask*). Berfungsi untuk fitur **Chroma-Keying Occlusion**, sehingga grafis telestrasi tampak di permukaan rumput/lantai di bawah kaki pemain.

### B. Algoritma Vision di `Once.VideoAnalyser.AI.dll`
* **`SimpleHomographyPointMapper` & `TemporalPointMapper`:**  
  Menggunakan algoritma *Direct Linear Transformation* (DLT) dan *RANSAC* untuk memetakan koordinat kamera 2D miring ke koordinat metrik lapangan datar (105x68m untuk sepak bola, 40x20m untuk futsal).
* **`TrackerCSRT` & `TrackerCSRT_with_Det`:**  
  Menggunakan pelacak korelasi diskriminatif *Channel and Spatial Reliability Tracking* (CSRT) bawaan OpenCV yang digabungkan dengan detektor objek untuk mencegah *drift* (pelacak melenceng saat pemain bersinggungan).
* **`SmoothTrack`:**  
  Filter penghalus lintasan koordinat untuk menghilangkan getaran (*jitter*) kamera.
* **`DetectWhistles`:**  
  Analisis audio spektral untuk mendeteksi suara peluit wasit secara otomatis.

### C. Struktur Data Proyek (`XmlDb\analyser\analysis_example_1.xml`)
Once Sport menyimpan proyek dalam format XML dengan hierarki:
* **Tag Aksi:** `id`, `actionName` (Build up, Attacking, Defending), `startTime`, `endTime`, `isGood`, `isBad`.
* **Elemen Telestrasi yang Didukung:**
  * `Spotlight3D`: Lampu sorot 3D di lantai dengan parameter `Radius`, `IsFullHeight`, `isChromaKeyOn`.
  * `AreaWithTextureAndDynamicLines`: Poligon zona pertahanan.
  * `PlayerFormationWithPlayerCircle2`: Garis hubung formasi antar-pemain.
  * `DistanceArrow`: Panah pengukur jarak riil dalam satuan meter.
  * `PlayerVision`: Sudut pandang mata pemain.
  * `PlayerGhost`: Representasi visual bayangan di mana pemain seharusnya berada.
  * `ParabolicArrow2`: Panah lintasan bola melengkung di udara.
  * `Magnifier`: Kaca pembesar untuk memperjelas insiden/pelanggaran.
* **Format Keyframe Tracking:**
  ```xml
  <keyframes count="126">
      <keyframe time="42.96" position="0.711157 0.521510" />
      <keyframe time="43.00" position="0.702409 0.522326" />
  </keyframes>
  ```

---

## 2. Tabel Komparasi: Once Sport vs Rekomendasi Teleslator

| Parameter | Once Sport v4.9.6 | Teleslator (Rekomendasi Kita) | Keunggulan Teleslator |
| :--- | :--- | :--- | :--- |
| **Ukuran Aplikasi** | ~400 MB (Installer besar) | **~25 MB (Tauri v2 + Rust)** | **16x Lebih Ringan**, hemat penyimpanan & RAM |
| **Teknologi UI** | C# .NET 10 + Avalonia XAML | **Svelte 5 (Runes) + TypeScript** | Lebih reaktif, animasi 60 FPS, UI modern |
| **Dukungan Platform** | Windows (x64) utama | **Windows & macOS (Apple Silicon M1-M4 & Intel)** | Asli lintas platform tanpa konfigurasi rumit |
| **Fokus Olahraga** | General (Sepak Bola, Hoki) | **Spesialisasi Futsal (40m x 20m)** | Geometri FIFA akurat, preset formasi 3-1, 4-0, 2-2, Power Play |
| **Alur Pemotongan Video** | Manual In/Out timeline | **Smart Pre-roll & Post-roll (Lead/Lag Time)** | **1-Tap Hotkey**: Langsung potong -5s build-up s/d +3s gol otomatis |
| **Alur Kerja Klip ➔ Telestrasi** | Terpisah di window berbeda | **One-Click Handover ("Telestrate")** | Klip langsung terisolasi & siap digambar tanpa render ulang |
| **Ekspor Video** | CPU render lambat | **Native FFmpeg Hardware-Accelerated (NVENC/Metal)** | Pemotongan dan render MP4 instan tanpa lag |
| **Ekspor Papan Taktik** | Dokumen tabel standar | **PDF Tactical Drill Sheet Profesional (jsPDF) + PNG** | Siap cetak langsung untuk instruksi pemain di ruang ganti |
| **AI Auto-Tracking** | Manual bounding box CSRT | **Interactive Visual Feature Tracking + Keyframing** | Spotlight otomatis menempel dan bergerak mengikuti pemain |

---

## 3. Rekomendasi Fitur Unggulan Futsal yang Diterapkan

### A. Alur Kerja Pemotongan Video (Pre-Telestrator)
Jangan izinkan pengguna menggambar langsung di video pertandingan 40 menit yang berat. Gunakan alur 3 langkah:
1. **Perekaman/Impor Pertandingan:** Putar video rekaman futsal secara penuh.
2. **Smart 1-Tap Tagging:**
   * Atur *Pre-roll* (5 detik) dan *Post-roll* (3 detik).
   * Tekan tombol pintas saat kejadian:
     * `G` ➔ Gol
     * `S` ➔ Shot on Target
     * `K` ➔ Kick-in
     * `C` ➔ Corner
     * `3` ➔ Rotasi 3-1
     * `4` ➔ Rotasi 4-0
     * `P` ➔ Power Play
     * `F` ➔ Pelanggaran
   * Klip 8 detik akan langsung terbentuk otomatis di daftar putar (*playlist*).
3. **One-Click Telestrate:**
   * Klik tombol **Telestrate** pada klip target di playlist.
   * Video langsung mengisolasi durasi klip tersebut (*loop playback*) dan mem-pause di detik krusial untuk digambar.
4. **Ekspor Klip via FFmpeg:**
   * Klik tombol gunting pada klip untuk menyimpan potongan MP4 terpisah menggunakan perintah `render_video_clip_ffmpeg` yang sudah terpasang di Rust backend.

### B. AI Auto-Tracking Pemain Futsal (Fase 2)
1. **Mengapa Futsal Sangat Cocok untuk AI Tracking?**
   * Lapangan futsal berada di dalam ruangan (*indoor*) dengan pencahayaan konstan (tidak ada bayangan matahari atau hujan).
   * Jumlah pemain hanya 10 orang (5v5) ditambah kiper dengan jersey kontras, sehingga meminimalisir tabrakan visual (*occlusion*).
2. **Cara Kerja Mesin Pelacak di Teleslator:**
   * Analis mengaktifkan tombol **AI Track**.
   * Klik pada pemain sasaran (misal Pivot atau Anchor).
   * Algoritma `runPlayerAutoTracking` mengekstrak fitur warna RGB 3D (*Histogram Matching*) dan mencari posisi terdekat di setiap frame berikutnya.
   * Sistem menghasilkan deretan `keyframes: [{ time, x, y }]` yang dihaluskan dengan filter *Exponential Moving Average* (EMA).
   * Elemen **3D Spotlight hijau** akan otomatis mengikuti lari pemain secara *real-time*.

---

## 4. Struktur Implementasi Kode di Proyek Teleslator

Seluruh arsitektur rekomendasi di atas sudah dibangun dan siap dijalankan pada direktori Anda:

```
c:\Users\Fahlefi Achmad Reza\Desktop\Teleslator\
├── src-tauri\
│   ├── Cargo.toml                 # Dependensi Tauri v2 & Rust
│   ├── tauri.conf.json            # Konfigurasi desktop window
│   └── src\lib.rs                 # Perintah Rust native untuk ekspor FFmpeg
└── src\
    ├── routes\+page.svelte        # Workspace Switcher (Papan Taktik / Analisis Video)
    └── lib\
        ├── types.ts               # Definisi tipe data Player, Tag, Keyframes, Telestrasi
        ├── pitch\futsal.ts        # Geometri lapangan FIFA (40x20m) & Matematika Homografi 3x3
        ├── canvas\
        │   ├── pitchRenderer.ts   # Render lapangan futsal 4 varian lantai (Parket, Vinyl, Rumput, Slate)
        │   └── drawingEngine.ts   # Render 3D Spotlight, Panah Pass, Lari, Vision Cone, Jarak Metrik
        ├── tracking\
        │   └── playerTracker.ts   # Mesin AI Auto-Tracking visual berbasis keyframe
        ├── coachboard\presets.ts  # Formasi taktik futsal 3-1, 4-0, 2-2, Power Play & animasi
        ├── export\pdfExporter.ts  # Generator lembar taktik PDF untuk sesi latihan
        └── components\
            ├── TacticalBoard.svelte # Modul Papan Taktik 2D/3D & Animasi Rotasi
            └── VideoAnalyser.svelte # Modul Pemotong Video, Tagging Matriks & AI Telestrator
```

---

## 5. Panduan Menjalankan Aplikasi

Jalankan perintah berikut di PowerShell / Terminal proyek Anda:

```bash
cd "c:\Users\Fahlefi Achmad Reza\Desktop\Teleslator"
bun run tauri dev
```

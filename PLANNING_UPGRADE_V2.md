# FutsalTag Pro — Blueprint & Planning Upgrade V2

> **Benchmark Industri:** Momen Sports + Once Sport Pro  
> **Platform Target:** Tauri v2 (Rust Backend) + Svelte 5 (Runes) + TypeScript + FFmpeg + ONNX Runtime (`ort` / `yolox_nano.onnx`)  
> **Spesialisasi Lapangan:** Futsal Standar FIFA ($40\text{m} \times 20\text{m}$)  
> **Status Dokumen:** Rencana Eksekusi V2 (Mencakup Prioritas 1 s/d Prioritas 4)

---

## 1. Ringkasan Eksekutif & Matriks Perbandingan (Momen Sports vs Once Sport vs FutsalTag Pro)

FutsalTag Pro V1 telah berhasil menyatukan **kecepatan tagging ala Momen Sports** (2-tier workspace, Continuous/1-Klik mode, Visual Coding Board, Linimasa multi-baris full-width, impor/ekspor `.momen.json`, `Futsal - Amril matrix 2`) dengan **studio telestrasi broadcast ala Once Sport** (12 alat gambar, homografi $40\text{m} \times 20\text{m}$, deteksi AI `yolox_nano.onnx` di Rust, dan FFmpeg hardware burn-in).

Tahap **Upgrade V2** bertujuan mengintegrasikan **Keempat Pilar Prioritas** agar FutsalTag Pro unggul secara menyeluruh dari keduanya, khususnya untuk alur kerja pelatih dan analis video futsal modern:

| Kapabilitas Analisis | Momen Sports | Once Sport Pro | FutsalTag Pro V1 (Saat Ini) | FutsalTag Pro V2 (Target Upgrade) |
| :--- | :--- | :--- | :--- | :--- |
| **Tata Letak & Coding Board** | 2-tier (Tag kiri + Linimasa bawah) + Coding Board visual | Jendela terpisah + panel klip | **Sudah 2-tier Momen + `VisualCodingBoard` (drag, resize, garis SVG `links`/`forTags`)** | Tetap cepat + sinkron counter & auto-scroll linimasa |
| **Linimasa & Match Clock** | `Kick-off di sini`, seret isi klip, seret pindah baris, `Alt+U`, zoom | Scrub klip dasar | Zoom `1x–16x`, trim tepi kiri/kanan, semua kategori board aktif | **Sinkron Kick-off Babak 1/2, seret tengah klip, seret pindah baris kategori, `Alt+U`** |
| **Analisis Khas Futsal** | Umum (timer manual) | Umum (sepak bola / basket) | Roster 5v5, Heatmap, Passing Network, Formasi 3-1/4-0/5v4 | **Modul `Menit Bermain` + Sub-In/Out + Analisis Quartet `+/-` (4 pemain outfield)** |
| **Telestrasi & Chroma-Key** | Gambar coret dasar | 12+ alat + **Chroma-key lantai** di bawah kaki pemain | 12 alat gambar + `isChromaFloor` (blend `screen`) + DLT 4-titik | **Chroma-Key HSV/Lab lantai + Player Cutout Masking (`ai_tracker.rs`)** |
| **AI Tracking & Render Gerak** | Tidak ada AI tracking | CSRT + `play.onnx` + animasi berkesinambungan | Deteksi YOLOX-Nano Rust + NCC canvas tracker + freeze-frame burn-in | **Continuous keyframe tracking multi-pemain + render urutan frame bergerak ke MP4** |
| **Presentasi & Ruang Ganti** | Tab Presentasi | Ekspor MP4 & presentasi dasar | Halftime Chalkboard Modal + Voiceover | **Fullscreen Presenter Studio (Klip + Slide Taktik 2D + Live Draw proyektor)** |
| **Interoperabilitas & Database** | `.momen.json`, ekspor klip | XML SportsCode, Excel | `.futsal`, `.momen.json`, CSV matriks, WA 720p, PNG/PDF | **XML SportsCode/Once Sport, Excel Multi-Sheet, Library Klub & Season Analytics** |

---

## 2. Prinsip Desain & Standar Kualitas (UI/UX & Engineering Guardrails)

Setiap fitur pada Upgrade V2 wajib mematuhi standar berikut:

1. **Disiplin Viewport & Anti-Clipping**:
   - Seluruh tampilan utama wajib muat dan nyaman dioperasikan mulai resolusi minimum **`1024×700`** hingga **`1440×900+`** tanpa tombol terpotong, teks tumpang tindih, atau header membungkus ke dua baris.
2. **Alur Kerja Keyboard-First untuk Analis**:
   - Pertahankan kendali satu tangan di keyboard saat menonton pertandingan: `Space` (Play/Pause), `I` / `O` (In/Out), `Alt+U` (jadikan klip), `/` (cari tag/label/pemain cepat), `Esc` (matikan semua tag kontinu), `Ctrl/Cmd+Z` (Undo tag), `V` / `L` (tool Coding Board), dan hotkey kustom papan.
3. **Zero Silent Errors & Build Strictness**:
   - Setiap modul frontend memakai TypeScript ketat + Svelte 5 Runes dan harus lulus **`npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json && npx vite build`** dengan **`0 errors`**.
   - Setiap perubahan backend Rust (`src-tauri/src/`) harus lulus **`cargo check`** serta mempertahankan deteksi otomatis encoder hardware (`h264_videotoolbox`, `h264_nvenc`, dengan fallback `libx264`).

---

## 3. Prioritas 1 — Upgrade Linimasa, Match Clock & Futsal Rotation Engine (Referensi: Momen Sports)

### 1.1 Sinkronisasi `Kick-off di sini` & Waktu Pertandingan (Match Clock)
- **Masalah saat ini**: Timestamp klip memakai detik mentah file video (`00:00` sejak file MP4 dimulai, termasuk pemanasan atau jeda babak).
- **Perubahan Data ([src/lib/types.ts](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/types.ts) & [src/lib/stores/projectStore.svelte.ts](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/stores/projectStore.svelte.ts))**:
  - Tambahkan `periodKickoffs: { period: 1 | 2 | 3; videoTime: number; label: string }[]` pada state proyek (tersimpan otomatis di `.futsal`).
  - Tambahkan helper `formatMatchClock(videoTime)` yang mengembalikan format seperti `B1 08:14` atau `B2 12:40`.
- **UI & Interaksi ([MatchTaggingWorkspace.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/MatchTaggingWorkspace.svelte), [LinimasaTimeline.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/LinimasaTimeline.svelte), [StatsMatrixModal.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/StatsMatrixModal.svelte))**:
  - Tambahkan tombol **`Kick-off di sini`** (pilih Babak 1 / Babak 2 / Extra) di `.momen-transport-bar`.
  - Tampilkan garis penanda vertikal berwarna hijau/emas untuk titik Kick-off di penggaris waktu `LinimasaTimeline.svelte`, dan tampilkan opsi waktu pertandingan bersih di daftar klip & ekspor statistik.

### 1.2 Interaksi Linimasa Penuh (Drag Tengah, Pindah Baris, `Alt+U`, Auto-Scroll)
- **Komponen Target**: [LinimasaTimeline.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/LinimasaTimeline.svelte) & [MatchTaggingWorkspace.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/MatchTaggingWorkspace.svelte).
- **Fitur yang Ditambahkan**:
  1. **Seret Bagian Tengah Klip (Horizontal Move)**: Menggeser `startTime` dan `endTime` bersamaan tanpa mengubah durasi klip (`onMoveClip(tagId, nextStart, nextEnd)`), dengan *snap* halus ke `0.1s`.
  2. **Seret Klip ke Baris Kategori Lain (Vertical Reassign)**: Mendeteksi posisi `clientY` baris tujuan di `.lanes-scroll-wrap`, menyorot baris target saat di-hover, lalu mengubah `category`, `color`, dan `boardButtonId` klip saat dilepas (`onReassignClipCategory(tagId, targetLane)`).
  3. **Pintasan `Alt + U`**: Saat `inPoint` dan `outPoint` (atau `inPoint` s/d `currentTime`) aktif, tekan `Alt+U` untuk langsung membuat klip baru memakai kategori/pemain aktif tanpa dialog memblokir.
  4. **Auto-Scroll Linimasa**: Ketika klip baru tercipta atau dipilih dari panel kanan, `.lanes-scroll-wrap` otomatis menggulir agar baris kategori klip tersebut terlihat di layar.

### 1.3 Micro Filter Bar Panel Klip Kanan (`H/A`, `★`, `👍`, `👎`)
- **Lokasi**: Panel kanan (`250px`) di [MatchTaggingWorkspace.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/MatchTaggingWorkspace.svelte).
- **Fitur**:
  - Baris filter ringkas tepat di bawah kotak pencarian klip: **`Semua` | `HOME` | `AWAY` | `★ Favorit` | `👍 Bagus` | `👎 Evaluasi`**.
  - Tombol cepat ikon bintang (`★`) di setiap baris klip untuk menandai momen unggulan (*highlight*) dalam 1 klik.

### 1.4 Modul `Menit Bermain` & Analisis Rotasi Quartet 4v4 Futsal
- **Latar Belakang Futsal**: Pergantian pemain futsal bersifat *rolling substitution* (rotasi cepat tiap 2–4 menit). Pelatih butuh tahu kombinasi 4 pemain lapangan (*Quartet*) mana yang paling dominan mencetak gol dan paling solid bertahan.
- **Implementasi Baru (`src/lib/components/MatchMinutesView.svelte` + subtab `Menit` di [MatchTaggingWorkspace.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/MatchTaggingWorkspace.svelte))**:
  - Struktur data `SubstitutionEvent { id, atTime, period, playerOut, playerIn, teamSide }` dan `activeLineupIds` (1 Kiper + 4 Outfield) di [projectStore.svelte.ts](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/stores/projectStore.svelte.ts).
  - Panel 1-klik **Ganti Pemain (`Sub Out → Sub In`)** saat video berjalan atau *paused*, plus timeline batang *shift* menit bermain setiap pemain.
  - Tabel otomatis **Quartet 4v4 Analytics**: durasi main bersama, `Gol Untuk (GF)`, `Gol Kebobolan (GA)`, `Selisih (+/-)`, dan `Shot on Target` yang terjadi saat quartet tersebut berada di lapangan.

---

## 4. Prioritas 2 — Broadcast Telestration, Chroma-Key Floor Masking & Continuous AI Tracking (Referensi: Once Sport)

### 2.1 Chroma-Key Court Masking (Grafis Menempel di Lantai di Bawah Kaki Pemain)
- **File Target**: [src/lib/export/telestrationRenderer.ts](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/export/telestrationRenderer.ts), [src/lib/components/TelestrationStudio.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/TelestrationStudio.svelte), [src-tauri/src/ai_tracker.rs](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src-tauri/src/ai_tracker.rs).
- **Desain Teknis**:
  1. Tambahkan UI **Pipet Warna Lantai (Court Chroma Sampler)** pada `TelestrationStudio.svelte` (memilih warna dominan parket/vinyl + slider toleransi HSV/Delta-E & kehalusan tepi *feather*).
  2. Terapkan **Composite Pipeline 2-Lapis**:
     - Lapisan Dasar: Frame video asli.
     - Lapisan Grafis: Elemen telestrasi dengan flag `isChromaFloor = true` (`spotlight-3d`, `player-circle`, `pressing-zone`, `distance-line`, `compactness-hull`).
     - Lapisan Foreground Cut-Out: Piksel non-lantai (pemain & bola yang berbeda dari warna chroma lantai dan/atau berada di dalam bounding box deteksi `yolox_nano.onnx` pada area bawah tubuh/kaki) digambar ulang di atas grafis, sehingga grafis tampak benar-benar tertanam di permukaan lapangan di bawah sepatu pemain.

### 2.2 Continuous Keyframe Tracking & Animated Video Export
- **File Target**: [src/lib/tracking/playerTracker.ts](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/tracking/playerTracker.ts), [src/lib/tracking/multiPlayerTracker.ts](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/tracking/multiPlayerTracker.ts), [src-tauri/src/ai_tracker.rs](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src-tauri/src/ai_tracker.rs), [src-tauri/src/ffmpeg.rs](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src-tauri/src/ffmpeg.rs).
- **Peningkatan**:
  1. **Multi-Point Element Binding**:
     - `distance-line` & `pass-arrow`: kedua ujung (`points[0]` dan `points[1]`) dapat mengikat track pemain yang berbeda agar garis jarak/operan ikut bergerak dinamis seiring pergerakan kedua pemain.
     - `compactness-hull`: seluruh titik sudut poligon mengikat hingga 4–5 track pemain sekaligus secara otomatis.
  2. **Smooth Keyframe Export di FFmpeg**:
     - Saat mengekspor klip yang memiliki elemen ber-*keyframe* (`keyframes.length > 1`), frontend merender PNG sekuens overlay ber-alpha untuk rentang `[timeStart, timeEnd]` sesuai FPS video, lalu [src-tauri/src/ffmpeg.rs](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src-tauri/src/ffmpeg.rs) menggabungkan *overlay sequence* menggunakan `-filter_complex overlay` dengan akselerasi hardware sehingga gerakan spotlight/lingkaran pemain di file MP4 ekspor terlihat mulus.

### 2.3 Preset Animasi Siaran TV (Broadcast Animation Presets)
- Tambah properti opsional pada `DrawingElement`: `animationStyle?: 'none' | 'fade' | 'draw-on' | 'pulse'` dan `cameraZoomTarget?: { x: number; y: number; scale: number }`.
- Mendukung animasi panah tergambar bertahap (`draw-on`), rotasi/denyut radar visi (`vision-cone`), dan *smooth zoom* fokus taktis pada saat jeda *freeze-frame*.

---

## 5. Prioritas 3 — Mode Presentasi Ruang Ganti & Interoperabilitas Industri (Referensi: Momen + Once Sport)

### 3.1 Fullscreen Presenter Mode (`PresentationStudioModal.svelte` / Stage `presentation`)
- Menyatukan seluruh aset briefing tim dalam satu layar presentasi tanpa distraksi tombol editor:
  - Memutar **Playlist Klip Terpilih** berurutan lengkap dengan grafis telestrasi animasi dan audio voiceover pelatih.
  - Menyisipkan **Slide Papan Taktik 2D** ([TacticalBoard.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/TacticalBoard.svelte)) antar-klip video untuk menjelaskan skema rotasi sebelum/sesudah melihat rekaman laga.
  - Menyediakan **Live Annotation Pen** (`D` untuk coret langsung di atas layar proyektor saat diskusi dengan pemain, `C` hapus coretan, `← / →` ganti slide, `Space` play/pause).

### 3.2 Ekspor/Impor Standar Industri (`src/lib/export/interopExporters.ts`)
- **SportsCode / Once Sport XML Import & Export**:
  - Ekspor klip proyek ke struktur standar `<file><ALL_INSTANCES><instance>...</instance></ALL_INSTANCES></file>` beserta `<label>` (pemain & descriptor taktis).
  - Impor file `.xml` dari Once Sport / SportsCode agar langsung menjadi klip di Linimasa FutsalTag Pro.
- **Ekspor Laporan Multi-Sheet (Excel/CSV Lengkap)**:
  - Ekspor paket laporan yang berisi daftar seluruh klip, matriks `Tag × Pemain`, matriks `Tag × Label`, serta tabel `Menit Bermain & Quartet +/-`.
- **Quick Clip Export**:
  - Tombol ekspor MP4 1 klip langsung dari panel kanan di workspace tagging tanpa perlu berpindah ke tahap Playlist & Ekspor.

---

## 6. Prioritas 4 — Database Klub/Skuad & Multi-Match Season Analytics

### 4.1 Library Tim & Profil Lawan Persisten (`src/lib/components/TeamDatabaseModal.svelte`)
- Penyimpanan lokal persisten melalui Tauri AppData (`save_club_library` / `load_club_library` di Rust) agar analis tidak perlu mengulang input roster setiap pertandingan baru.
- Menyimpan daftar klub (Tim Sendiri & Tim Lawan), warna jersey utama/kiper, daftar pemain lengkap (nomor punggung, nama, peran futsal `GK / Anchor / Flank / Pivot`, kaki dominan).
- Saat memulai proyek baru di [ProjectHub.svelte](file:///Users/achmadrezafahlefi/Desktop/FutsalTag/src/lib/components/ProjectHub.svelte), pengguna cukup memilih **Klub Home** & **Klub Away** dari dropdown untuk langsung mengisi roster tagging & statistik.

### 4.2 Season & Multi-Match Analytics Hub (`src/lib/components/SeasonAnalyticsModal.svelte`)
- Mengimpor beberapa file proyek `.futsal` dari berbagai pertandingan dalam satu turnamen/liga sekaligus:
  - Grafik tren performa antar-pertandingan (Gol, Shot on Target, Pressing Berhasil, Efektivitas Power Play 5v4 & Set Piece Kick-in/Corner).
  - Akumulasi **Heatmap Spasial & Passing Network Lintas Pertandingan**.
  - Papan Peringkat Pemain Sepanjang Musim (Total Menit Bermain, Keterlibatan Gol, Akurasi Eksekusi, dan Quartet `+/-` terbaik).

---

## 7. Urutan Eksekusi (4 Sprint Terukur) & Checklist Verifikasi

| Sprint | Fokus Implementasi | Modul Utama | Definition of Done (Verifikasi) |
| :--- | :--- | :--- | :--- |
| **Sprint 1** | **Prioritas 1** (Kick-off Clock, Linimasa Drag Tengah/Pindah Baris, `Alt+U`, Auto-scroll, Micro Filter, Menit Bermain & Quartet `+/-`) | `types.ts`, `projectStore.svelte.ts`, `LinimasaTimeline.svelte`, `MatchTaggingWorkspace.svelte`, `MatchMinutesView.svelte`, `StatsMatrixModal.svelte` | `svelte-check` 0 error; klip bisa diseret horizontal & pindah kategori vertikal; menit bermain & quartet `+/-` terhitung akurat |
| **Sprint 2** | **Prioritas 2** (Chroma-Key Court Masking, Continuous AI Multi-Point Tracking, FFmpeg Animated Sequence Export, Broadcast Presets) | `telestrationRenderer.ts`, `TelestrationStudio.svelte`, `playerTracker.ts`, `multiPlayerTracker.ts`, `ai_tracker.rs`, `ffmpeg.rs` | `svelte-check` 0 error & `cargo check` lolos; spotlight/lingkaran tampil di bawah kaki pada lantai terkalibrasi & bergerak di MP4 hasil ekspor |
| **Sprint 3** | **Prioritas 3** (Fullscreen Presentation Studio, Live Draw Briefing, SportsCode/Once XML Import-Export, Laporan Multi-Sheet, Quick Clip Export) | `PresentationStudioModal.svelte`, `interopExporters.ts`, `PlaylistExportHub.svelte`, `MatchTaggingWorkspace.svelte` | Uji round-trip XML Once Sport/SportsCode; presentasi fullscreen berjalan lancar untuk gabungan klip video & slide taktik 2D |
| **Sprint 4** | **Prioritas 4** (Persistent Club/Roster Library & Multi-Match Season Analytics Hub) | `TeamDatabaseModal.svelte`, `SeasonAnalyticsModal.svelte`, `ProjectHub.svelte`, `src-tauri/src/lib.rs` | Simpan/muat profil klub di AppData Tauri; agregasi statistik >= 2 file `.futsal` tampil benar tanpa error |

### Perintah Verifikasi Standar Setiap Akhir Sprint
```bash
# 1. Validasi Frontend & TypeScript
npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json && npx vite build

# 2. Validasi Backend Rust
cargo check --manifest-path src-tauri/Cargo.toml

# 3. Jalankan Aplikasi Desktop (E2E Manual Check)
npx tauri dev
```

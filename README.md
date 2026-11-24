# FutsalTag Pro ⚽

**Aplikasi Analisis Video Pertandingan Futsal Modern, Telestrasi AI TV Broadcast & Papan Taktik Interaktif (Desktop macOS & Windows)**

FutsalTag Pro dirancang khusus untuk pelatih futsal, analis taktik, dan staf kepelatihan modern dengan menggabungkan kecepatan alur kerja **Momen Sports**, kekuatan telestrasi tingkat tinggi **Once Sport Pro**, serta fitur-fitur inovatif yang melebihi kedua software referensi tersebut.

---

## 🌟 Fitur Unggulan (Killer Features)

### 1. 📺 Halftime Locker-Room Chalkboard Mode
- **Mode Teater Jeda Babak**: Tampilan layar penuh tanpa distraksi menu untuk ruang ganti saat jeda 10–15 menit.
- **Auto-Pause on Touch / Stylus Drawing**: Video otomatis membeku saat jari atau pena menyentuh layar untuk menggambar taktik kilat, dan otomatis lanjut berputar setelah selesai.
- **Dukungan Audio & Countdown**: Menjaga efisiensi waktu pelatih dalam memberikan instruksi langsung kepada pemain.

### 2. 🎙️ Coach Voiceover Audio Recording (Studio Telestrasi)
- **Rekaman Suara Pelatih**: Pelatih dapat merekam suara instruksi taktis langsung dari mikrofon laptop/PC saat meninjau klip telestrasi.
- **Native FFmpeg Audio Mixing**: Rekaman suara secara otomatis di-mix dengan audio asli pertandingan menggunakan filter `amix` FFmpeg saat klip diekspor ke format `.mp4`.

### 3. 🔥 Futsal Heatmap & Passing Network Matrix (FIFA 40m x 20m)
- **Peta Panas Densitas (Heatmap)**: Menggunakan gradien panas radial untuk mengidentifikasi zona dominasi pemain di lapangan futsal standar ($40\text{m} \times 20\text{m}$).
- **Passing Network 5v5**: Visualisasi grafis hubungan operan antar 5 pemain futsal (Kiper, Anchor, Flank Kiri, Flank Kanan, Pivot) dengan ketebalan koneksi dinamis sesuai frekuensi sirkulasi bola.
- **Filter Fleksibel**: Dapat disaring berdasarkan pemain maupun kategori aksi (Gol, Transisi, Pressing, Set-Piece).

### 4. 💬 WhatsApp Individual Player Clip Exporter
- **Kompilasi Klip Otomatis Khusus per Pemain**: Memfilter seluruh klip aksi yang melibatkan pemain tertentu (misal: `#7 Flank Kiri`).
- **Optimalisasi WhatsApp**: Menggunakan preset FFmpeg 720p `-crf 26` dengan ukuran file sangat ringan (< 15 MB) sehingga siap dikirim langsung via WhatsApp tanpa melebihi batas upload media.

---

## 🎨 Studio Telestrasi (100% Parity Once Sport)

- **3D Spotlight Futsal**: Sorotan elips 3D dengan pendar cahaya di lantai lapangan.
- **Curved Arrow (Panah Lengkung)**: Visualisasi operan melengkung / pisang dengan pengatur lengkungan Bézier.
- **Lensa Pembesar (Magnifier 1.2x–3.0x)**: Kaca pembesar detail kontrol bola, duel kaki, atau pelanggaran langsung dari frame video.
- **Silang Taktik (Player Cross)**: Penanda kesalahan posisi atau kelalaian rotasi taktik pemain.
- **AI Multi-Player MOT (Multi-Object Tracking)**: Pelacakan otomatis 10 pemain sekaligus.
- **Convex Hull (Kerapatan Formasi)**: Poligon area kompak tim dengan kalkulasi luas meter persegi ($m^2$).
- **Radar Visi Pemain (Vision Cone / FOV)**: Jangkauan pandangan pemain saat mengambil keputusan.
- **AI Homography 3D Court Calibration**: Menggunakan Direct Linear Transformation (DLT) untuk memetakan koordinat kamera ke ukuran lapangan futsal resmi ($40\text{m} \times 20\text{m}$) dengan preset tribun samping, sudut, dan gawang.
- **Broadcast Freeze-Frame Preview HUD**: Countdown melingkar on-air dengan tombol skip freeze real-time.

---

## ⚡ Alur Kerja Utama (Workflow)

1. **Hub Proyek (Project Hub)**: Buka video pertandingan atau berkas proyek `.futsal`.
2. **Tagging & Klip (Match Tagging)**: Panel tombol aksi futsal instan dengan lead/lag time otomatis dan keyboard shortcuts (`1`–`8`).
3. **Studio Telestrasi**: Telestrasi interaktif dengan keyframe tracking dan pembakaran langsung (*video burner*).
4. **Playlist & Ekspor**: Pengorganisasian klip, sequencer presentasi siaran TV, dan ekspor gabungan / terpisah.
5. **Papan Taktik Futsal 2D**: Papan strategi digital dengan 4 pilihan permukaan lapangan futsal resmi FIFA.

---

## 🛠️ Tech Stack & Arsitektur

- **Desktop Framework:** [Tauri v2](https://v2.tauri.app/) (Rust backend native, sangat ringan & aman)
- **Frontend Framework:** [Svelte 5](https://svelte.dev/) (Svelte Runes `$state`, `$derived`, `$effect`)
- **Bahasa:** TypeScript & Rust
- **Runtime & Package Manager:** [Bun](https://bun.sh/)
- **Bundler:** Vite 8
- **Media Engine:** Native HTML5 Video + Canvas 2D + FFmpeg CLI Bridge
- **Penyimpanan:** Single-File Project `.futsal` (JSON-based) portable tanpa setup database server.

---

## 📦 Instalasi & Menjalankan Aplikasi

### Prasyarat
1. [Bun](https://bun.sh/)
2. [Rust & Cargo](https://rustup.rs/)
3. [FFmpeg](https://ffmpeg.org/) (tersedia di PATH sistem)

### Mode Development
```bash
# 1. Kloning repositori
git clone https://github.com/mezzalatech/FutsalTag.git
cd FutsalTag

# 2. Instal dependensi
bun install

# 3. Jalankan aplikasi desktop
bun run tauri dev
```

### Build Production Desktop (.exe / .msi)
```bash
bun run tauri build
```

---

## 📄 Lisensi
Hak Cipta © 2026 Mezzala Tech. Semua hak dilindungi.

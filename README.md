# FutsalTag (Teleslator) ⚽

**Aplikasi Analisis Video Pertandingan Futsal, Telestrasi AI TV Broadcast & Papan Taktik Interaktif (Desktop macOS & Windows)**

FutsalTag (Teleslator) dirancang khusus untuk pelatih, analis performa, dan staf teknis futsal modern dengan mengadopsi dan menyempurnakan alur kerja (*workflow*) perangkat lunak analisis kelas dunia seperti Once Sport, KlipDraw, dan Nacsport.

---

## 🚀 Fitur Utama

### 1. Alur Kerja Terpandu 4 Tahap (Once Sport Professional Workflow)
- **Tahap 1: Hub Proyek (Project Hub)**
  - Tiga jalur alur instan: *Analisis Pertandingan Penuh (Full Match)*, *Studio Telestrasi Singkat (Quick Clip)*, dan *Papan Taktik 2D*.
  - Tanpa konfigurasi database yang rumit; cukup seret video atau pilih sampel demo.
- **Tahap 2: Layar Pemotongan & Tagging Aksi (Match Tagging & Trimming)**
  - Tampilan video bersih tanpa gangguan alat gambar agar analis fokus menonton laga.
  - **Futsal Code Buttons Panel**: Tombol aksi taktis futsal (Gol, Tembakan On-Target, High Pressing, Counter Attack, Kick-in, Corner, GK Save, Transisi).
  - **Auto Pre/Post-Roll (Lead & Lag Time)**: Sekali klik tombol aksi atau tekan angka `1`–`8` / `Spasi`, klip otomatis terpotong mundur 5 detik dan maju 3 detik.
  - **Matriks Silang Statistik Interaktif (Cross-Tabulation)**: Tabel rekap aksi vs pemain dengan kemampuan memutar klip otomatis saat angka diklik.
- **Tahap 3: Studio Telestrasi Terdedikasi (Telestration & AI Tracking)**
  - Video otomatis membeku (*freeze-frame*) pada detik krusial aksi.
  - **Alat Gambar Taktis Profesional**: 3D Spotlight dengan pendar di lantai lapangan futsal, Lingkaran Pemain, Radar Vision Cone (FOV), Panah Operan & Dribble, dan Garis Jarak Meter.
  - **AI Multi-Player MOT**: Deteksi pergerakan 10 pemain sekaligus dan perhitungan garis kerapatan tim (*Team Compactness Convex Hull*).
  - **Pause Duration Slider**: Menentukan berapa detik video berhenti saat grafis telestrasi ditampilkan (default 3 detik).
  - **Fitur Unggulan**: Tombol *Simpan & Lanjut ke Klip Berikutnya* untuk menggambar maraton tanpa bolak-balik.
- **Tahap 4: Pengorganisasian Playlist & Pusat Ekspor (Playlist & Export Hub)**
  - **Mode Presentasi Siaran TV (TV Broadcast Sequencer)**: Memutar seluruh klip secara berurutan dengan jeda freeze-frame untuk rapat analisis di ruang ganti.
  - **3 Mode Ekspor FFmpeg**:
    1. *Gabung Jadi 1 Video Utuh (Merge All MP4)*.
    2. *Ekspor Klip Terpisah di 1 Folder*.
    3. *Kelompokkan ke Subfolder Kategori (Gol/, Set_Piece/, dll)*.
  - Ekspor lembar statistik CSV & PDF.

### 2. Papan Taktik Futsal 2D (FIFA Standard 40m x 20m)
- Geometri lapangan futsal resmi FIFA lengkap dengan titik penalti 6m dan second penalty 10m.
- 4 pilihan permukaan lapangan: *Parket Kayu Liga Pro, Vinyl Biru FIFA World Cup, Rumput Sintetis, Dark Slate*.
- Preset taktik futsal standar: *Rotasi 3-1 Pivot, 4-0 Flat, Power Play 5v4, dan Pressing Diamond*.
- Animasi multi-step dan ekspor lembar taktik beresolusi tinggi ke format PDF & PNG.

---

## 🛠️ Teknologi & Arsitektur

- **Desktop Framework:** [Tauri v2](https://v2.tauri.app/) (Rust backend native, ringan, cross-platform macOS & Windows)
- **Frontend Framework:** [Svelte 5](https://svelte.dev/) (Svelte Runes `$state`, `$derived`, `$effect`)
- **Language:** TypeScript & Rust
- **Build Tool:** Vite 8
- **Package Manager & Runtime:** [Bun](https://bun.sh/)
- **Media Engine:** Native HTML5 Video + Skia/Canvas 2D + FFmpeg Bridge

---

## 📦 Instalasi & Menjalankan Aplikasi

### Prasyarat
1. [Bun](https://bun.sh/)
2. [Rust & Cargo](https://rustup.rs/)

### Langkah Menjalankan (Mode Development)
```bash
# 1. Kloning repositori
git clone https://github.com/mezzalatech/FutsalTag.git
cd FutsalTag

# 2. Instal dependensi frontend
bun install

# 3. Jalankan aplikasi desktop Tauri
bun run tauri dev
```

### Build Executable Desktop (Production)
```bash
# Build binary installer untuk Windows (.msi/.exe) atau macOS (.dmg/.app)
bun run tauri build
```

---

## 📄 Lisensi
Hak Cipta © 2026 Mezzala Tech. Semua hak dilindungi.

# Paket Konten Web, Artikel Rilis & Promosi — ARF FutsalTag v0.2.0

Dokumen ini berisi seluruh materi teks & kode HTML yang dapat Anda edit dan salin langsung untuk website, blog, media sosial, dan grup WhatsApp.

---

## 1. Tautan Download Resmi (v0.2.0)

- **Halaman Release Lengkap (Windows `.exe`/`.msi` & macOS `.dmg` Apple Silicon + Intel):**
  `https://github.com/mezzalatech/FutsalTag/releases/tag/v0.2.0`
- **Tautan Selalu Versi Terbaru:**
  `https://github.com/mezzalatech/FutsalTag/releases/latest`

---

## 2. Metadata SEO Website (`<head>`)

```html
<title>ARF FutsalTag v0.2.0 — Aplikasi Analisis Video, Telestrasi & Papan Taktik Futsal</title>
<meta name="description" content="Download ARF FutsalTag v0.2.0 untuk Windows & macOS. Aplikasi desktop offline untuk tagging pertandingan futsal, telestrasi broadcast 3D, AI player tracking, dan papan taktik 40x20m." />
<meta property="og:title" content="ARF FutsalTag v0.2.0 — Video Analysis & Tactical Board Futsal" />
<meta property="og:description" content="Analisis video pertandingan futsal standar FIFA 40x20m dengan tagging 2-tier, telestrasi broadcast, AI tracking offline, dan ekspor animasi MP4." />
<meta property="og:type" content="website" />
```

---

## 3. Widget Download & Release Notes (HTML Siap Pasang)

```html
<section id="download-futsaltag" style="max-width: 880px; margin: 2rem auto; padding: 2rem; border-radius: 16px; background: #0f172a; color: #f8fafc; font-family: system-ui, -apple-system, sans-serif;">
  <span style="display: inline-block; padding: 4px 12px; border-radius: 999px; background: #1e293b; color: #38bdf8; font-size: 12px; font-weight: 700; letter-spacing: 0.05em;">
    VERSI TERBARU • v0.2.0
  </span>
  <h2 style="margin: 12px 0 8px; font-size: 28px;">Download ARF FutsalTag v0.2.0</h2>
  <p style="margin: 0 0 24px; color: #cbd5e1; line-height: 1.6;">
    Aplikasi desktop all-in-one untuk pelatih &amp; analis futsal. Seluruh model AI, FFmpeg, dan Whisper ASR sudah termasuk offline di dalam installer.
  </p>

  <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(240px, 1fr)); gap: 16px;">
    <a href="https://github.com/mezzalatech/FutsalTag/releases/tag/v0.2.0" target="_blank" rel="noopener"
       style="display: block; padding: 16px; border-radius: 12px; background: #1d4ed8; color: #ffffff; text-decoration: none;">
      <div style="font-size: 13px; opacity: 0.85;">Windows 10 / 11 (64-bit)</div>
      <div style="font-size: 18px; font-weight: 700; margin: 4px 0;">Download Installer (.EXE / .MSI)</div>
      <div style="font-size: 12px; opacity: 0.9;">Offline Bundle • ~156 MB (.exe)</div>
    </a>

    <a href="https://github.com/mezzalatech/FutsalTag/releases/tag/v0.2.0" target="_blank" rel="noopener"
       style="display: block; padding: 16px; border-radius: 12px; background: #1e293b; border: 1px solid #334155; color: #ffffff; text-decoration: none;">
      <div style="font-size: 13px; color: #94a3b8;">macOS (Apple Silicon M1–M4 &amp; Intel)</div>
      <div style="font-size: 18px; font-weight: 700; margin: 4px 0;">Download Mac Installer (.DMG)</div>
      <div style="font-size: 12px; color: #94a3b8;">Tersedia di GitHub Releases v0.2.0</div>
    </a>
  </div>

  <div style="margin-top: 24px; padding-top: 16px; border-top: 1px solid #1e293b; font-size: 14px; color: #cbd5e1;">
    <strong style="color: #ffffff;">Pembaruan Utama di v0.2.0:</strong>
    <ul style="margin: 8px 0 0; padding-left: 20px; line-height: 1.7;">
      <li>Ekspor animasi taktik <strong>Coach Board langsung ke video MP4</strong> &amp; mode cepat <strong>OnlyDraw</strong>.</li>
      <li>Efek visual telestrasi baru: <strong>Motion Comet Trail</strong>, <strong>3D Puddle Ripple</strong>, <strong>3D Wall Barrier</strong>, dan <strong>Hatched Zone</strong>.</li>
      <li><strong>Coach Training Session Planner</strong> dengan latar lapangan kustom &amp; ekspor sesi latihan ke <strong>PDF Drill</strong>.</li>
      <li><strong>Multi-Analyst Tag Merge</strong> (gabung tag antar analis dengan sinkronisasi waktu kickoff) + <strong>Mass Folder Video Relink</strong>.</li>
      <li><strong>Timeline Hover Thumbnail Scrubbing</strong> &amp; perbaikan stabilitas Coach Board serta playback loop tagging.</li>
    </ul>
  </div>
</section>
```

---

## 4. Artikel Lengkap Website (700+ Kata)

**Slug URL:** `/rilis-arf-futsaltag-v0-2-0-aplikasi-analisis-video-telestrasi-papan-taktik-futsal`

# Resmi Rilis ARF FutsalTag v0.2.0: Solusi Lengkap Analisis Video, Telestrasi Broadcast, dan Papan Taktik Futsal Offline

Kebutuhan akan analisis taktik berbasis data dan visual di dunia futsal modern terus meningkat, baik di level tim profesional, kompetisi liga, maupun pembinaan akademi. Namun selama ini, banyak pelatih dan analis tim masih harus berpindah-pindah antar beberapa perangkat lunak berbeda—satu aplikasi untuk memotong klip pertandingan, satu software desain untuk menggambar animasi papan taktik, dan aplikasi editing terpisah hanya untuk menambahkan panah atau sorotan pemain ke dalam video.

Menjawab tantangan tersebut, **ARF FutsalTag v0.2.0** kini resmi dirilis untuk desktop **Windows (64-bit `.exe` & `.msi`)** dan **macOS (Apple Silicon M1–M4 & Intel `.dmg`)**. Dibangun menggunakan **Tauri v2 (Rust)** dan **Svelte 5**, aplikasi ini dirancang secara spesifik untuk alur kerja pelatih dan analis futsal berstandar lapangan FIFA berukuran 40m × 20m—dengan seluruh mesin media FFmpeg, model AI deteksi pemain, hingga transkripsi audio Whisper yang berjalan **100% offline** langsung dari perangkat Anda.

Berikut rangkaian pembaruan dan fitur unggulan yang bisa langsung Anda manfaatkan pada **ARF FutsalTag v0.2.0**:

## 1. Coach Board Lebih Hidup: Ekspor Animasi MP4, Training Session Planner & Mode OnlyDraw

Papan taktik 2D di ARF FutsalTag tidak lagi sekadar gambar statis. Pada versi `0.2.0`, **Coach Board** hadir dengan peningkatan besar untuk mendukung persiapan latihan hingga penyusunan strategi *set-piece*:

- **Ekspor Animasi Taktik ke Video MP4:** Setelah menyusun pergerakan pemain lintas langkah (*multi-step*) di atas 4 pilihan lantai lapangan FIFA (Parket, Vinyl Biru, Rumput Sintetis, dan Dark Slate), Anda dapat langsung mengekspor animasi papan taktik tersebut menjadi file video **MP4** siap putar, maupun dokumen gambar **PNG**.
- **Coach Training Session Planner & PDF Drill:** Rancang satu sesi latihan utuh dengan beberapa skema *drill*, atur latar lapangan kustom, lalu ekspor seluruh rencana sesi latihan tersebut menjadi file **PDF Drill** yang rapi untuk dibagikan kepada staf pelatih maupun asisten di lapangan.
- **Alat Taktik Baru di Papan & Video:** Versi ini memperkenalkan dukungan **3D Wall Barrier** untuk memvisualisasikan pagar hidup saat situasi bola mati, pola **Hatched Zone** untuk menandai area *pressing* atau ruang kosong secara tegas, serta mode **OnlyDraw** agar pelatih bisa langsung menggambar cepat di kanvas saat presentasi.

## 2. Telestrasi Bergaya Siaran TV dengan Kalibrasi Lapangan 40m × 20m

Untuk membuat evaluasi video jauh lebih mudah dipahami pemain, Studio Telestrasi menyediakan **12+ alat gambar taktik**—mulai dari 3D Spotlight, Panah Lengkung, Panah Operan, Panah Lari, Lingkaran Pemain, Radar Visi (FOV terarah), Area Kompak Tim (*Convex Hull*), Garis Jarak, Lensa Zoom, Silang Taktik, Catatan Teks, hingga Marker Bebas.

Di versi **v0.2.0**, tersedia dua efek visual broadcast terbaru untuk mempertegas alur permainan:
- **Motion Comet Trail:** Memberikan jejak gerak dinamis pada pergerakan pemain atau alur bola agar arah rotasi dan *passing lane* terlihat jelas.
- **3D Puddle Ripple:** Efek sorotan riak 3D di permukaan lapangan untuk mengarahkan fokus pemain pada posisi kunci saat momen *freeze-frame*.

Melalui **Kalibrasi Lapangan 3D (Homography DLT 4-Titik)**, setiap koordinat layar video dapat dikonversi ke satuan meter riil lapangan FIFA (40m × 20m), sehingga jarak antarpemain maupun luas kerapatan blok bertahan dapat diukur secara presisi. Pelatih juga bisa merekam **voiceover suara langsung dari mikrofon** dan membakar (*burn-in*) seluruh grafis telestrasi, *freeze-frame*, serta audio ke dalam video MP4 lewat FFmpeg dengan dukungan akselerasi hardware (`h264_nvenc` / `h264_videotoolbox`). Selain itu, model AI **YOLOX-Nano** berbasis ONNX Runtime yang terpasang offline memungkinkan deteksi pemain dan bola serta pengelompokan warna jersey secara lokal.

## 3. Workspace Tagging 2-Tier & Kolaborasi Multi-Analis

Alur *tagging* di ARF FutsalTag memadukan pendekatan arsitektur 2-Tier (**`TAG`** kontinu *Start → Stop* atau 1-Klik serta chip **`LABEL`**) dengan **Visual Coding Board Studio (`Action Pad`)**. Pengguna bebas menggeser ukuran tombol, menyusun relasi antar-tombol, mengatur *Exclusion Group*, menggunakan *hotkey* kustom, atau langsung memakai preset bawaan **`Futsal - Amril matrix 2`** yang berisi 68 tombol siap pakai.

Pada rilis **v0.2.0**, produktivitas tim analis meningkat drastis berkat beberapa fitur baru:
- **Multi-Analyst Tag Merge:** Beberapa analis dapat melakukan *tagging* pertandingan yang sama secara terpisah, lalu menggabungkan seluruh datanya ke dalam satu proyek dengan fitur sinkronisasi *kickoff* dan penyesuaian selisih waktu (*time shifting*).
- **Timeline Hover Thumbnail Scrubbing:** Arahkan kursor di atas linimasa ber-zoom (`1x–16x`) untuk langsung melihat pratinjau frame video secara cepat tanpa memutus ritme kerja.
- **Mass Folder Video Relink:** Ketika proyek `.futsal` dan file video dipindahkan ke komputer atau hard disk lain, aplikasi dapat menautkan ulang seluruh video dalam satu folder secara massal tanpa harus mengatur ulang satu per satu.

## 4. Ruang Ganti Halftime, Analitik Spasial & Ekspor WhatsApp Pemain

Seluruh data klip tidak berhenti sebagai arsip, melainkan langsung diolah menjadi wawasan taktis dan bahan evaluasi siap kirim:
- **Futsal Heatmap, Passing Network & Matriks Silang:** Visualisasikan peta panas pergerakan, jaringan operan antar pemain, hingga tabulasi silang interaktif **Tag × Pemain** dan **Tag × Label** yang bisa langsung diputar berurutan maupun diekspor ke CSV.
- **Halftime Locker-Room Chalkboard:** Saat jeda pertandingan, aktifkan mode teater layar penuh dengan fitur *auto-pause* ketika menggambar, *timer* hitung mundur jeda babak (10 atau 15 menit), serta overlay telestrasi untuk koreksi taktik instan di ruang ganti.
- **Ekspor Playlist & Paket WhatsApp 720p:** Ekspor kompilasi playlist menjadi satu video utuh, klip terpisah, atau folder per kategori aksi. Untuk komunikasi personal ke pemain, tersedia **WhatsApp Player Exporter** yang mengompilasi klip khusus tiap pemain dalam ukuran ringkas 720p lengkap dengan telestrasi dan suara instruksi pelatih.

## Mulai Gunakan ARF FutsalTag v0.2.0 Sekarang

Seluruh proyek tersimpan rapi dalam format portabel **`.futsal`** dan aplikasi dapat bekerja penuh tanpa koneksi internet begitu selesai dipasang. Anda dapat mengunduh installer resmi **ARF FutsalTag v0.2.0** untuk **Windows (`.exe` / `.msi`)** maupun **macOS (Apple Silicon & Intel `.dmg`)** melalui tautan resmi di bawah ini:

👉 **Download ARF FutsalTag v0.2.0 (Windows & macOS):** `https://github.com/mezzalatech/FutsalTag/releases/tag/v0.2.0`

---

## 5. Konten Media Sosial & Broadcast WhatsApp

### Instagram / Facebook / Threads
```text
⚽ PELATIH & ANALIS FUTSAL, INI SENJATA BARU DI BENCH & RUANG GANTI!

ARF FutsalTag v0.2.0 resmi rilis untuk Windows & macOS 🚀

✅ Tagging pertandingan 2-tier + gabung kerjaan beberapa analis sekaligus
✅ Telestrasi broadcast: 3D Spotlight, Motion Comet Trail, Puddle Ripple & 3D Wall Barrier
✅ Coach Board 40x20m yang animasinya bisa diekspor langsung jadi video MP4 & PDF Drill
✅ Halftime Chalkboard untuk briefing cepat saat jeda babak
✅ Ekspor klip per pemain ukuran hemat siap kirim ke WhatsApp!

💻 Tanpa ribet langganan bulanan, AI & FFmpeg sudah siap offline di dalam installer.

👇 Download versi terbaru v0.2.0 sekarang lewat website kami:
[MASUKKAN LINK WEBSITE ANDA]

#FutsalIndonesia #PelatihFutsal #AnalisFutsal #TaktikFutsal #FutsalAnalysis #ARFFutsalTag
```

### Broadcast WhatsApp / Telegram
```text
Salam olahraga Coach ⚽🔥

Sudah rilis *ARF FutsalTag v0.2.0* (Windows & macOS) — aplikasi desktop khusus pelatih & analis futsal untuk:
• Tagging & potong klip pertandingan cepat
• Telestrasi video (Spotlight, Panah Taktik, Comet Trail, Jarak Lapangan 40x20m)
• Papan Taktik Coach Board + ekspor animasi MP4 & PDF program latihan
• Kirim kompilasi klip evaluasi langsung per pemain ke WhatsApp

Semua berjalan 100% offline di laptop.
Silakan unduh installer resminya melalui website kami di sini:
👉 [MASUKKAN LINK WEBSITE ANDA]
```

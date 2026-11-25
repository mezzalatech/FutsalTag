# Planning Besok Pagi — Multi Freeze-Frame Polish & Downstream Sync

> **Lanjutan Dari:** Multi Freeze-Frame Stops (`freezeStops[]`) & Clean Full-Speed Replay (`appendCleanReplay`) di Studio Telestrasi + FFmpeg Rust.  
> **Tujuan:** Membuat alur *Stop-and-Draw Analysis* ala Once Sport terasa instan di Studio sekaligus konsisten ke seluruh mode Presentasi & Ekspor.

---

## Sesi 1 — UX Kilat di Studio Telestrasi (~20 Menit)

### 1.1 Tombol 1-Klik `Tampil Hanya di Jeda Ini`
- **Target File:** [TelestrationElementTimeline.svelte](./src/lib/components/TelestrationElementTimeline.svelte)
- **Kebutuhan:** Saat membuat panah/zona/teks untuk satu momen jeda tertentu (misal panah *TIMING OF THE PASS* pada Jeda #2), analis saat ini masih perlu mengatur `Set Mulai (I)` dan `Set Akhir (O)` secara terpisah.
- **Perubahan:**
  - Tambahkan 1 tombol aksi **`Hanya di Jeda Ini`** di `.tl-actions` (aktif saat ada `selectedEl` dan `selectedFreezeStop` atau titik jeda terdekat).
  - Mengunci langsung `timeStart = Math.max(clipStart, stop.time - 0.1)` dan `timeEnd = Math.min(clipEnd, stop.time + 0.1)` pada elemen terpilih dalam 1 klik, sehingga grafis tersebut tampil hanya saat jeda terkait dan otomatis hilang ketika video berjalan lagi (sementara lingkaran tracking pemain tetap hidup sepanjang klip).

### 1.2 Hidupkan Animasi `draw-on` Progresif Saat Freeze-Frame
- **Target File:** [TelestrationStudio.svelte](./src/lib/components/TelestrationStudio.svelte), [telestrationRenderer.ts](./src/lib/export/telestrationRenderer.ts)
- **Fakta Kode:** Fungsi De Casteljau `draw-on` sudah tersedia di `telestrationRenderer.ts` (`el.animationStyle === 'draw-on'`), namun saat ini di `TelestrationStudio.svelte` nilai `animElapsedSec` saat jeda dikunci ke `1.0`.
- **Perubahan:**
  - Ubah `animElapsedSec` pada `drawCanvas()` ketika `isFreezeActive` menjadi progres dinamis dari durasi jeda: `Math.max(0.05, activeFreezeDuration - freezeRemaining)` agar panah lengkung, zona pressing, dan marker tergambar mulus di detik pertama jeda saat Preview Siaran.
  - Pertahankan `animElapsedSec: 1.0` pada render gambar PNG statis untuk ekspor FFmpeg (atau tambahkan fade-in overlay opsional pada segmen freeze jika diperlukan).

---

## Sesi 2 — Sinkronisasi ke Presentasi, Playlist & Ekspor WhatsApp (~30 Menit)

Agar hasil edit multi-jeda + *clean replay* di Studio Telestrasi identik di semua layar hilir:

1. **[PresentationStudioModal.svelte](./src/lib/components/PresentationStudioModal.svelte)**
   - Gunakan helper prioritas `clip.freezeStops?.length ? clip.freezeStops : ...` agar mode presentasi layar penuh otomatis berhenti pada seluruh titik jeda (`#1`, `#2`, dst.) dan memutar 1x *clean replay* jika `clip.appendCleanReplay === true`.
2. **[PlaylistExportHub.svelte](./src/lib/components/PlaylistExportHub.svelte)**
   - Saat mengekspor kompilasi playlist (`burn_telestration_clip_ffmpeg` / `burn_animated_telestration_clip_ffmpeg`), render overlay untuk setiap stop di `tag.freezeStops` dan teruskan parameter `freezeStops` + `appendCleanReplay` ke backend Rust.
3. **[WhatsAppPlayerExporterModal.svelte](./src/lib/components/WhatsAppPlayerExporterModal.svelte)**
   - Teruskan `freezeStops` & `appendCleanReplay` saat merender klip pemain 720p sehingga video yang dikirim ke WhatsApp pemain membawa jeda bertahap & replay bersihnya.

---

## Sesi 3 — Verifikasi E2E FFmpeg & Sinkron GitHub (~15 Menit)

1. **Uji E2E Rust FFmpeg ([src-tauri/src/ffmpeg.rs](./src-tauri/src/ffmpeg.rs))**
   - Tambahkan assertion pada modul test FFmpeg untuk kasus **2 Freeze Stops + `append_clean_replay = Some(true)`** (memastikan durasi output `>= durasi_klip_ekstrak * 2 + total_jeda`).
2. **Checklist Verifikasi Wajib:**
   ```bash
   cargo test --manifest-path src-tauri/Cargo.toml ffmpeg::tests
   npx svelte-kit sync && npx svelte-check --tsconfig ./tsconfig.json && npx vite build
   npx tauri dev
   ```
3. **Commit & Push ke GitHub (`origin/main`)** setelah uji manual di desktop selesai.

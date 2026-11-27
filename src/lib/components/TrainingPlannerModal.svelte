<script lang="ts">
  import { projectStore } from "$lib/stores/projectStore.svelte";
  import { exportTrainingSessionToPDF } from "$lib/export/pdfExporter";
  import type {
    TacticalDrill,
    TrainingIntensity,
    TrainingPhaseKind,
    TrainingSessionDrillBlock,
    TrainingSessionPlan,
  } from "$lib/types";
  import {
    X,
    ClipboardList,
    Plus,
    Trash2,
    Copy,
    Camera,
    FileText,
    Download,
    Upload,
    ArrowUp,
    ArrowDown,
    PlaySquare,
    Save,
    Clock,
    Flame,
    Users,
    Maximize2,
    Sparkles,
  } from "lucide-svelte";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onCaptureCurrentBoard: () => { imageDataUrl: string | null; drill: TacticalDrill };
    onLoadDrillToBoard: (drill: TacticalDrill) => void;
  }

  let { isOpen, onClose, onCaptureCurrentBoard, onLoadDrillToBoard }: Props = $props();

  const STORAGE_KEY = "futsaltag_training_sessions_v1";

  const PHASE_OPTIONS: { value: TrainingPhaseKind; label: string; color: string }[] = [
    { value: "warmup", label: "Pemanasan (Warm-up)", color: "#0ea5e9" },
    { value: "main", label: "Materi Inti (Main Part)", color: "#10b981" },
    { value: "finishing", label: "Penyelesaian / Game", color: "#f59e0b" },
    { value: "cooldown", label: "Pendinginan (Cool-down)", color: "#a855f7" },
  ];

  const INTENSITY_OPTIONS: TrainingIntensity[] = ["Rendah", "Sedang", "Tinggi", "Maksimal"];

  function createEmptyPlan(): TrainingSessionPlan {
    const today = new Date().toISOString().slice(0, 10);
    const ownClubName =
      projectStore.clubLibrary.find((c) => c.isOwnTeam)?.name ||
      projectStore.clubLibrary[0]?.name ||
      "Tim Utama";
    return {
      id: `session_${Date.now()}`,
      title: "Sesi Latihan Futsal — Rotasi 3-1 & Pressing",
      date: today,
      teamName: ownClubName,
      coachName: "Pelatih Kepala",
      trainingObjective:
        "Mempertajam rotasi 3-1 menuju flank, timing umpan diagonal ke Pivot, serta reaksi cepat saat transisi bertahan.",
      overallIntensity: "Tinggi",
      totalDurationMinutes: 75,
      playerCountSummary: "12 Pemain + 2 GK",
      spaceSummary: "40m x 20m (Lapangan Penuh)",
      generalNotes: "Siapkan 12 cones, 8 bola futsal, dan 2 set rompi kontras. Fokus komunikasi vokal.",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      blocks: [
        {
          id: `blk_${Date.now()}_1`,
          phase: "warmup",
          title: "Aktivasi Dinamis + Rondo 4v2 Sentuhan Terbatas",
          durationMinutes: 15,
          intensity: "Sedang",
          spaceArea: "12m x 12m",
          playerCount: "12 Pemain (2 Grup)",
          equipment: "8 Cones, 4 Bola, 4 Rompi",
          objective: "Menaikkan suhu tubuh dan ketajaman passing 1-2 sentuhan dalam tekanan.",
          coachingPoints: "Body shape terbuka sebelum menerima bola; selalu buat sudut segitiga passing.",
        },
        {
          id: `blk_${Date.now()}_2`,
          phase: "main",
          title: "Pola Rotasi 3-1 Overload Flank & Screen Pivot",
          durationMinutes: 30,
          intensity: "Tinggi",
          spaceArea: "40m x 20m",
          playerCount: "10 Pemain + 2 GK",
          equipment: "6 Bola, 6 Cones, Rompi 2 Warna",
          objective: "Membongkar pertahanan man-to-man lewat pergerakan fake flank dan block pivot.",
          coachingPoints: "Anchor wajib membaca tekanan lawan; eksekusi wall-pass harus cepat di bawah 2 detik.",
        },
        {
          id: `blk_${Date.now()}_3`,
          phase: "finishing",
          title: "Small-Sided Game 4v4 + Transisi 4 Detik",
          durationMinutes: 20,
          intensity: "Maksimal",
          spaceArea: "30m x 20m",
          playerCount: "4v4 + 2 GK (Rotasi)",
          equipment: "Bola Futsal, Rompi, Stopwatch",
          objective: "Simulasi intensitas pertandingan dengan aturan bonus gol dari counter attack cepat.",
          coachingPoints: "Transisi bertahan harus selesai < 4 detik saat kehilangan bola.",
        },
        {
          id: `blk_${Date.now()}_4`,
          phase: "cooldown",
          title: "Pendinginan, Peregangan Statis & Evaluasi Video",
          durationMinutes: 10,
          intensity: "Rendah",
          spaceArea: "Area Tengah",
          playerCount: "Seluruh Skuad",
          equipment: "Matras / Air Minum",
          objective: "Menurunkan detak jantung bertahap & review poin kunci latihan.",
          coachingPoints: "Evaluasi 2 hal positif dan 1 perbaikan utama bersama tim.",
        },
      ],
    };
  }

  function createPressingTemplate(): TrainingSessionPlan {
    const base = createEmptyPlan();
    return {
      ...base,
      id: `session_press_${Date.now()}`,
      title: "Sesi Khusus High Pressing & Set Piece Kick-in",
      trainingObjective:
        "Menutup jalur umpan tengah lawan dengan jebakan pressing (pressing trap) di sisi flank dan variasi kick-in cepat.",
      overallIntensity: "Maksimal",
      totalDurationMinutes: 65,
      blocks: [
        {
          id: `blk_p_${Date.now()}_1`,
          phase: "warmup",
          title: "Koordinasi Footwork & Reaksi Pressing Berpasangan",
          durationMinutes: 15,
          intensity: "Sedang",
          spaceArea: "20m x 20m",
          playerCount: "Seluruh Pemain",
          equipment: "12 Cones, 2 Agility Ladder",
          objective: "Kecepatan pendekatan (closing down) dan posisi kaki bertahan.",
          coachingPoints: "Dekati lawan saat bola masih bergulir; paksa lawan ke kaki lemahnya.",
        },
        {
          id: `blk_p_${Date.now()}_2`,
          phase: "main",
          title: "Pressing Trap Area Flank (Trigger Umpan Kiper)",
          durationMinutes: 25,
          intensity: "Maksimal",
          spaceArea: "25m x 20m (Half+)",
          playerCount: "4v4 + 2 GK",
          equipment: "Rompi 2 Warna, 6 Bola",
          objective: "Memotong jalur balik ke Anchor dan merebut bola di sepertiga pertahanan lawan.",
          coachingPoints: "Flank jauh menutup jalur diagonal tengah, Pivot mengarahkan ke garis tepi.",
        },
        {
          id: `blk_p_${Date.now()}_3`,
          phase: "finishing",
          title: "Eksekusi Kick-in Variasi Blok & Second Post",
          durationMinutes: 25,
          intensity: "Tinggi",
          spaceArea: "20m x 20m (Setengah Lapangan)",
          playerCount: "10 Pemain + 2 GK",
          equipment: "10 Bola, 4 Mannequin/Cones",
          objective: "Memaksimalkan peluang bola mati di area menyerang (< 4 detik sebelum peluit).",
          coachingPoints: "Penendang kick-in membaca gerakan dummy runner menuju tiang dua.",
        },
      ],
    };
  }

  function loadSavedSessions(): TrainingSessionPlan[] {
    if (typeof localStorage === "undefined") return [];
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  const initialSaved = loadSavedSessions();
  let savedSessions = $state<TrainingSessionPlan[]>(initialSaved);
  let plan = $state<TrainingSessionPlan>(
    initialSaved.length > 0
      ? JSON.parse(JSON.stringify(initialSaved[0]))
      : createEmptyPlan()
  );
  let activeBlockIndex = $state<number>(0);
  let toastMessage = $state<string | null>(null);

  const computedTotalDuration = $derived(
    plan.blocks.reduce((sum, b) => sum + (Number(b.durationMinutes) || 0), 0)
  );

  $effect(() => {
    plan.totalDurationMinutes = computedTotalDuration;
  });

  function showToast(msg: string) {
    toastMessage = msg;
    setTimeout(() => {
      if (toastMessage === msg) toastMessage = null;
    }, 2600);
  }

  function persistSessionsToStorage() {
    plan.updatedAt = new Date().toISOString();
    plan.totalDurationMinutes = computedTotalDuration;
    const idx = savedSessions.findIndex((s) => s.id === plan.id);
    const snapshot: TrainingSessionPlan = JSON.parse(JSON.stringify(plan));
    if (idx >= 0) {
      savedSessions[idx] = snapshot;
    } else {
      savedSessions = [snapshot, ...savedSessions];
    }
    if (typeof localStorage !== "undefined") {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(savedSessions));
      } catch {
        // Ignore quota exceeded
      }
    }
    showToast("Rencana sesi latihan berhasil disimpan!");
  }

  function addBlock(phase: TrainingPhaseKind = "main") {
    const newBlock: TrainingSessionDrillBlock = {
      id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      phase,
      title: phase === "warmup" ? "Drill Pemanasan Baru" : phase === "finishing" ? "Game / Finishing" : "Drill Taktik Baru",
      durationMinutes: 15,
      intensity: phase === "warmup" || phase === "cooldown" ? "Sedang" : "Tinggi",
      spaceArea: "40m x 20m",
      playerCount: "10 Pemain + 2 GK",
      equipment: "Cones, Bola Futsal",
      objective: "",
      coachingPoints: "",
    };
    plan.blocks = [...plan.blocks, newBlock];
    activeBlockIndex = plan.blocks.length - 1;
  }

  function duplicateBlock(idx: number) {
    const src = plan.blocks[idx];
    if (!src) return;
    const copy: TrainingSessionDrillBlock = {
      ...JSON.parse(JSON.stringify(src)),
      id: `blk_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      title: `${src.title} (Salinan)`,
    };
    const next = [...plan.blocks];
    next.splice(idx + 1, 0, copy);
    plan.blocks = next;
    activeBlockIndex = idx + 1;
  }

  function removeBlock(idx: number) {
    if (plan.blocks.length <= 1) return;
    plan.blocks = plan.blocks.filter((_, i) => i !== idx);
    if (activeBlockIndex >= plan.blocks.length) {
      activeBlockIndex = Math.max(0, plan.blocks.length - 1);
    }
  }

  function moveBlock(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (target < 0 || target >= plan.blocks.length) return;
    const next = [...plan.blocks];
    const tmp = next[idx];
    next[idx] = next[target];
    next[target] = tmp;
    plan.blocks = next;
    activeBlockIndex = target;
  }

  function captureBoardIntoBlock(idx: number) {
    const blk = plan.blocks[idx];
    if (!blk) return;
    const captured = onCaptureCurrentBoard();
    if (captured.imageDataUrl) {
      blk.diagramImageDataUrl = captured.imageDataUrl;
    }
    blk.linkedDrill = JSON.parse(JSON.stringify(captured.drill));
    if (!blk.coachingPoints.trim() && captured.drill.coachNotes) {
      blk.coachingPoints = captured.drill.coachNotes;
    }
    showToast(`Diagram Coach Board ditempelkan ke "${blk.title}"`);
  }

  function loadBlockIntoBoard(idx: number) {
    const blk = plan.blocks[idx];
    if (!blk?.linkedDrill) return;
    onLoadDrillToBoard(JSON.parse(JSON.stringify(blk.linkedDrill)));
    onClose();
  }

  function handleExportJson() {
    const safe = (plan.title || "rencana_latihan").replace(/[^a-zA-Z0-9_-]/g, "_").toLowerCase();
    const blob = new Blob([JSON.stringify(plan, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safe}.training.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function handleImportJson(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const parsed = JSON.parse(String(ev.target?.result || ""));
        if (!parsed || !Array.isArray(parsed.blocks)) {
          alert("File JSON sesi latihan tidak valid.");
          return;
        }
        plan = parsed;
        activeBlockIndex = 0;
        showToast(`Berhasil memuat "${plan.title}"`);
      } catch {
        alert("Gagal membaca file JSON.");
      }
    };
    reader.readAsText(input.files[0]);
  }

  function handleExportPDF() {
    plan.totalDurationMinutes = computedTotalDuration;
    exportTrainingSessionToPDF(plan, projectStore.clubLogoDataUrl);
    showToast("PDF Rencana Sesi Latihan berhasil diekspor!");
  }

  function getPhaseBadge(p: TrainingPhaseKind) {
    return PHASE_OPTIONS.find((o) => o.value === p) || PHASE_OPTIONS[1];
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="tpm-backdrop" role="presentation" onclick={onClose}>
    <div class="tpm-card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
      <!-- HEADER -->
      <header class="tpm-header">
        <div class="tpm-title-wrap">
          <div class="tpm-icon-box">
            <ClipboardList size={20} class="text-emerald-400" />
          </div>
          <div>
            <h3>Coach Training Session Planner</h3>
            <p>Susun rencana latihan terstruktur (Warm-up, Main Part, Finishing), lampirkan diagram taktik, dan ekspor PDF siap cetak.</p>
          </div>
        </div>

        <div class="tpm-header-actions">
          <select
            class="tpm-select-sm"
            aria-label="Pilih Template atau Sesi Tersimpan"
            onchange={(e) => {
              const val = (e.currentTarget as HTMLSelectElement).value;
              if (val === "__tpl_31") {
                plan = createEmptyPlan();
                activeBlockIndex = 0;
              } else if (val === "__tpl_press") {
                plan = createPressingTemplate();
                activeBlockIndex = 0;
              } else {
                const found = savedSessions.find((s) => s.id === val);
                if (found) {
                  plan = JSON.parse(JSON.stringify(found));
                  activeBlockIndex = 0;
                }
              }
            }}
          >
            <option value="">-- Template / Tersimpan ({savedSessions.length}) --</option>
            <option value="__tpl_31">Template: Rotasi 3-1 & Transisi</option>
            <option value="__tpl_press">Template: High Pressing & Kick-in</option>
            {#each savedSessions as s (s.id)}
              <option value={s.id}>{s.date} — {s.title}</option>
            {/each}
          </select>

          <button type="button" class="tpm-btn-icon" onclick={handleExportJson} title="Ekspor JSON Rencana Latihan">
            <Download size={14} />
          </button>
          <label class="tpm-btn-icon" title="Impor JSON Rencana Latihan" style="cursor:pointer;">
            <Upload size={14} />
            <input type="file" accept=".json,.training.json" style="display:none;" onchange={handleImportJson} />
          </label>
          <button type="button" class="tpm-close" onclick={onClose} title="Tutup">
            <X size={18} />
          </button>
        </div>
      </header>

      {#if toastMessage}
        <div class="tpm-toast">
          <Sparkles size={13} />
          <span>{toastMessage}</span>
        </div>
      {/if}

      <!-- BODY: METADATA + SPLIT BLOCKS -->
      <div class="tpm-body">
        <!-- SESSION METADATA BAR -->
        <section class="tpm-meta-grid">
          <label class="tpm-field col-span-2">
            <span>Judul Sesi Latihan</span>
            <input type="text" class="tpm-input" bind:value={plan.title} placeholder="Misal: Persiapan Final Liga Futsal..." />
          </label>
          <label class="tpm-field">
            <span>Tanggal</span>
            <input type="date" class="tpm-input" bind:value={plan.date} />
          </label>
          <label class="tpm-field">
            <span>Tim / Kategori</span>
            <input type="text" class="tpm-input" bind:value={plan.teamName} placeholder="Misal: Tim Senior A" />
          </label>
          <label class="tpm-field">
            <span>Pelatih</span>
            <input type="text" class="tpm-input" bind:value={plan.coachName} placeholder="Nama Pelatih" />
          </label>
          <label class="tpm-field">
            <span>Intensitas Keseluruhan</span>
            <select class="tpm-input" bind:value={plan.overallIntensity}>
              {#each INTENSITY_OPTIONS as opt}
                <option value={opt}>{opt}</option>
              {/each}
            </select>
          </label>
          <label class="tpm-field">
            <span>Jumlah Pemain</span>
            <input type="text" class="tpm-input" bind:value={plan.playerCountSummary} placeholder="12 Pemain + 2 GK" />
          </label>
          <label class="tpm-field">
            <span>Ukuran Area Utama</span>
            <input type="text" class="tpm-input" bind:value={plan.spaceSummary} placeholder="40m x 20m" />
          </label>
          <label class="tpm-field col-span-4">
            <span>Tujuan Latihan (Training Objectives)</span>
            <input type="text" class="tpm-input" bind:value={plan.trainingObjective} placeholder="Target taktis, teknis, dan fisik utama hari ini..." />
          </label>
        </section>

        <!-- STATS SUMMARY PILL BAR -->
        <div class="tpm-summary-strip">
          <div class="tpm-pill">
            <Clock size={13} class="text-sky-400" />
            <span>Total Durasi: <strong>{computedTotalDuration} Menit</strong></span>
          </div>
          <div class="tpm-pill">
            <Flame size={13} class="text-amber-400" />
            <span>Intensitas: <strong>{plan.overallIntensity}</strong></span>
          </div>
          <div class="tpm-pill">
            <Users size={13} class="text-emerald-400" />
            <span>Skuad: <strong>{plan.playerCountSummary || "-"}</strong></span>
          </div>
          <div class="tpm-pill">
            <Maximize2 size={13} class="text-purple-400" />
            <span>Total Fase/Drill: <strong>{plan.blocks.length}</strong></span>
          </div>
        </div>

        <!-- SPLIT EDITOR: LEFT DRILL LIST / RIGHT ACTIVE DRILL DETAIL -->
        <div class="tpm-split">
          <!-- LEFT: PHASE TIMELINE LIST -->
          <div class="tpm-blocks-sidebar">
            <div class="tpm-sidebar-hdr">
              <span>SUSUNAN FASE ({plan.blocks.length})</span>
              <button type="button" class="tpm-add-blk-btn" onclick={() => addBlock("main")}>
                <Plus size={12} />
                <span>Tambah Drill</span>
              </button>
            </div>

            <div class="tpm-blocks-list">
              {#each plan.blocks as blk, idx (blk.id)}
                {@const badge = getPhaseBadge(blk.phase)}
                <!-- svelte-ignore a11y_click_events_have_key_events -->
                <div
                  class="tpm-blk-item"
                  class:active={activeBlockIndex === idx}
                  role="button"
                  tabindex="0"
                  onclick={() => (activeBlockIndex = idx)}
                >
                  <div class="tpm-blk-top">
                    <span class="tpm-phase-dot" style="background:{badge.color};">{badge.label.split(" ")[0]}</span>
                    <span class="tpm-blk-dur">{blk.durationMinutes}m · {blk.intensity}</span>
                  </div>
                  <div class="tpm-blk-title">{idx + 1}. {blk.title || "Drill Tanpa Judul"}</div>
                  <div class="tpm-blk-actions">
                    <button type="button" onclick={(e) => { e.stopPropagation(); moveBlock(idx, -1); }} disabled={idx === 0} title="Naik">
                      <ArrowUp size={11} />
                    </button>
                    <button type="button" onclick={(e) => { e.stopPropagation(); moveBlock(idx, 1); }} disabled={idx === plan.blocks.length - 1} title="Turun">
                      <ArrowDown size={11} />
                    </button>
                    <button type="button" onclick={(e) => { e.stopPropagation(); duplicateBlock(idx); }} title="Duplikat">
                      <Copy size={11} />
                    </button>
                    {#if plan.blocks.length > 1}
                      <button type="button" class="danger" onclick={(e) => { e.stopPropagation(); removeBlock(idx); }} title="Hapus">
                        <Trash2 size={11} />
                      </button>
                    {/if}
                  </div>
                </div>
              {/each}
            </div>

            <label class="tpm-field" style="margin-top: auto;">
              <span>Catatan Umum & Perlengkapan</span>
              <textarea class="tpm-textarea" rows="3" bind:value={plan.generalNotes}></textarea>
            </label>
          </div>

          <!-- RIGHT: SELECTED BLOCK FORM & DIAGRAM -->
          {#if plan.blocks[activeBlockIndex]}
            {@const activeBlk = plan.blocks[activeBlockIndex]}
            <div class="tpm-block-editor">
              <div class="tpm-editor-grid">
                <label class="tpm-field">
                  <span>Fase Latihan</span>
                  <select class="tpm-input" bind:value={activeBlk.phase}>
                    {#each PHASE_OPTIONS as opt}
                      <option value={opt.value}>{opt.label}</option>
                    {/each}
                  </select>
                </label>

                <label class="tpm-field">
                  <span>Judul Drill / Aktivitas</span>
                  <input type="text" class="tpm-input" bind:value={activeBlk.title} />
                </label>

                <label class="tpm-field">
                  <span>Durasi (Menit)</span>
                  <input type="number" min="1" max="120" class="tpm-input" bind:value={activeBlk.durationMinutes} />
                </label>

                <label class="tpm-field">
                  <span>Intensitas</span>
                  <select class="tpm-input" bind:value={activeBlk.intensity}>
                    {#each INTENSITY_OPTIONS as opt}
                      <option value={opt}>{opt}</option>
                    {/each}
                  </select>
                </label>

                <label class="tpm-field">
                  <span>Area / Ruang Lapangan</span>
                  <input type="text" class="tpm-input" bind:value={activeBlk.spaceArea} placeholder="20m x 20m (Setengah)" />
                </label>

                <label class="tpm-field">
                  <span>Jumlah Pemain</span>
                  <input type="text" class="tpm-input" bind:value={activeBlk.playerCount} placeholder="4v4 + 2 GK" />
                </label>
              </div>

              <label class="tpm-field">
                <span>Perlengkapan (Equipment)</span>
                <input type="text" class="tpm-input" bind:value={activeBlk.equipment} placeholder="Cones, Rompi, Bola Futsal..." />
              </label>

              <label class="tpm-field">
                <span>Tujuan Drill</span>
                <input type="text" class="tpm-input" bind:value={activeBlk.objective} />
              </label>

              <label class="tpm-field">
                <span>Poin Kepelatihan (Coaching Points)</span>
                <textarea class="tpm-textarea" rows="3" bind:value={activeBlk.coachingPoints}></textarea>
              </label>

              <!-- DIAGRAM SNAPSHOT CARD -->
              <div class="tpm-diagram-box">
                <div class="tpm-diagram-hdr">
                  <span>Diagram Taktik Lapangan</span>
                  <div class="tpm-diagram-btns">
                    <button
                      type="button"
                      class="tpm-btn-sm primary"
                      onclick={() => captureBoardIntoBlock(activeBlockIndex)}
                      title="Ambil gambar & data step Coach Board yang sedang terbuka sekarang"
                    >
                      <Camera size={12} />
                      <span>Ambil Diagram dari Coach Board</span>
                    </button>
                    {#if activeBlk.linkedDrill}
                      <button
                        type="button"
                        class="tpm-btn-sm"
                        onclick={() => loadBlockIntoBoard(activeBlockIndex)}
                        title="Buka kembali diagram & animasi drill ini di Coach Board"
                      >
                        <PlaySquare size={12} />
                        <span>Muat ke Coach Board</span>
                      </button>
                    {/if}
                  </div>
                </div>

                {#if activeBlk.diagramImageDataUrl}
                  <div class="tpm-diagram-preview">
                    <img src={activeBlk.diagramImageDataUrl} alt="Diagram {activeBlk.title}" />
                  </div>
                {:else}
                  <div class="tpm-diagram-empty">
                    Belum ada diagram terlampir. Susun formasi/panah di Coach Board lalu klik <strong>"Ambil Diagram dari Coach Board"</strong>.
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        </div>
      </div>

      <!-- FOOTER -->
      <footer class="tpm-footer">
        <button type="button" class="tpm-btn secondary" onclick={onClose}>
          Tutup
        </button>
        <button type="button" class="tpm-btn secondary" onclick={persistSessionsToStorage}>
          <Save size={14} />
          <span>Simpan Sesi</span>
        </button>
        <button type="button" class="tpm-btn primary" onclick={handleExportPDF}>
          <FileText size={14} />
          <span>Ekspor PDF Sesi Latihan Lengkap</span>
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .tpm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(8, 13, 26, 0.85);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .tpm-card {
    width: 100%;
    max-width: 1080px;
    max-height: 92vh;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #f1f5f9;
    font-size: 12.5px;
  }

  .tpm-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: #131d35;
    border-bottom: 1px solid #1e293b;
    gap: 12px;
    flex-wrap: wrap;
  }

  .tpm-title-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .tpm-icon-box {
    width: 38px;
    height: 38px;
    border-radius: 9px;
    background: rgba(16, 185, 129, 0.14);
    border: 1px solid rgba(16, 185, 129, 0.3);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tpm-header h3 {
    margin: 0;
    font-size: 15.5px;
    font-weight: 800;
  }

  .tpm-header p {
    margin: 2px 0 0 0;
    font-size: 11.5px;
    color: #94a3b8;
  }

  .tpm-header-actions {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .tpm-select-sm {
    background: #0f172a;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 5px 8px;
    font-size: 11.5px;
    max-width: 240px;
  }

  .tpm-btn-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #cbd5e1;
    cursor: pointer;
  }

  .tpm-btn-icon:hover {
    border-color: #38bdf8;
    color: #fff;
  }

  .tpm-close {
    background: transparent;
    border: none;
    color: #64748b;
    padding: 4px;
    cursor: pointer;
  }

  .tpm-close:hover {
    color: #fff;
  }

  .tpm-toast {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 7px 16px;
    background: rgba(16, 185, 129, 0.16);
    border-bottom: 1px solid rgba(16, 185, 129, 0.35);
    color: #6ee7b7;
    font-size: 12px;
    font-weight: 600;
  }

  .tpm-body {
    padding: 14px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .tpm-meta-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 10px;
    background: #131d35;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 12px;
  }

  .col-span-2 {
    grid-column: span 2;
  }

  .col-span-4 {
    grid-column: span 4;
  }

  .tpm-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tpm-field > span {
    font-size: 11px;
    font-weight: 600;
    color: #94a3b8;
  }

  .tpm-input, .tpm-textarea {
    background: #0b1120;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 6px 9px;
    color: #f8fafc;
    font-size: 12px;
    outline: none;
  }

  .tpm-input:focus, .tpm-textarea:focus {
    border-color: #38bdf8;
  }

  .tpm-summary-strip {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
  }

  .tpm-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 10px;
    border-radius: 999px;
    background: #1e293b;
    border: 1px solid #334155;
    font-size: 11.5px;
    color: #cbd5e1;
  }

  .tpm-split {
    display: grid;
    grid-template-columns: 310px 1fr;
    gap: 14px;
    min-height: 360px;
  }

  .tpm-blocks-sidebar {
    background: #131d35;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tpm-sidebar-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 800;
    color: #94a3b8;
  }

  .tpm-add-blk-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 4px 8px;
    border-radius: 5px;
    border: 1px solid #0284c7;
    background: rgba(2, 132, 199, 0.2);
    color: #38bdf8;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .tpm-blocks-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    max-height: 270px;
    overflow-y: auto;
  }

  .tpm-blk-item {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 8px 10px;
    cursor: pointer;
    display: flex;
    flex-direction: column;
    gap: 4px;
    transition: border-color 0.15s;
  }

  .tpm-blk-item.active {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.08);
  }

  .tpm-blk-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .tpm-phase-dot {
    font-size: 9.5px;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 4px;
    color: #fff;
  }

  .tpm-blk-dur {
    font-size: 10.5px;
    color: #94a3b8;
    font-weight: 600;
  }

  .tpm-blk-title {
    font-weight: 700;
    font-size: 12px;
    color: #f1f5f9;
    line-height: 1.3;
  }

  .tpm-blk-actions {
    display: flex;
    gap: 4px;
    margin-top: 2px;
  }

  .tpm-blk-actions button {
    background: #1e293b;
    border: 1px solid #334155;
    color: #94a3b8;
    border-radius: 4px;
    padding: 2px 5px;
    cursor: pointer;
  }

  .tpm-blk-actions button:hover:not(:disabled) {
    color: #fff;
    border-color: #38bdf8;
  }

  .tpm-blk-actions button.danger:hover {
    color: #fca5a5;
    border-color: #ef4444;
  }

  .tpm-block-editor {
    background: #131d35;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .tpm-editor-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 10px;
  }

  .tpm-diagram-box {
    background: #0b1120;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .tpm-diagram-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11.5px;
    font-weight: 700;
    color: #cbd5e1;
    gap: 8px;
    flex-wrap: wrap;
  }

  .tpm-diagram-btns {
    display: flex;
    gap: 6px;
  }

  .tpm-btn-sm {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 10px;
    border-radius: 6px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #f1f5f9;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .tpm-btn-sm.primary {
    background: #0284c7;
    border-color: #38bdf8;
    color: #fff;
  }

  .tpm-diagram-preview {
    width: 100%;
    max-height: 170px;
    border-radius: 6px;
    overflow: hidden;
    background: #020617;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .tpm-diagram-preview img {
    max-width: 100%;
    max-height: 170px;
    object-fit: contain;
  }

  .tpm-diagram-empty {
    padding: 20px;
    text-align: center;
    color: #64748b;
    font-size: 11.5px;
    border: 1px dashed #334155;
    border-radius: 6px;
  }

  .tpm-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 12px 20px;
    background: #131d35;
    border-top: 1px solid #1e293b;
  }

  .tpm-btn {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 8px 15px;
    border-radius: 7px;
    font-size: 12.5px;
    font-weight: 700;
    border: none;
    cursor: pointer;
  }

  .tpm-btn.secondary {
    background: #334155;
    color: #f1f5f9;
  }

  .tpm-btn.primary {
    background: #059669;
    color: #fff;
  }

  .tpm-btn.primary:hover {
    background: #047857;
  }
</style>

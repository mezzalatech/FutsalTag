<script lang="ts">
  import { projectStore } from "$lib/stores/projectStore.svelte";
  import type { MergeSyncMethod, MergeDuplicateStrategy, MergeProjectOptions, VideoTagEvent } from "$lib/types";
  import { invoke } from "@tauri-apps/api/core";
  import {
    X,
    GitMerge,
    UploadCloud,
    Clock,
    Target,
    Sliders,
    Layers,
    UserCheck,
    Check,
    AlertTriangle,
    FileSpreadsheet,
    HelpCircle,
  } from "lucide-svelte";

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    onMerged?: (result: { mergedCount: number; skippedCount: number; newRosterCount: number }) => void;
  }

  let { isOpen, onClose, onMerged }: Props = $props();

  let sourceJsonStr = $state<string | null>(null);
  let sourceProject = $state<any | null>(null);
  let sourceFileName = $state<string>("");
  let fileError = $state<string | null>(null);

  let syncMethod = $state<MergeSyncMethod>("kickoff");
  let referencePeriod = $state<1 | 2 | 3>(1);
  let manualOffsetSec = $state<number>(0);
  let targetAnchorTagId = $state<string>("");
  let sourceAnchorTagId = $state<string>("");
  let analystName = $state<string>("");
  let tagTitlePrefix = $state<string>("");
  let duplicateStrategy = $state<MergeDuplicateStrategy>("skip_duplicate");
  let duplicateToleranceSec = $state<number>(1.5);
  let selectedCategories = $state<string[]>([]);
  let mergeRoster = $state<boolean>(true);
  let mergePlaylists = $state<boolean>(false);
  let isExecuting = $state<boolean>(false);

  function isTauriDesktop(): boolean {
    return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
  }

  // Format seconds to mm:ss.SS
  function fmt(sec: number): string {
    const s = Math.max(0, sec);
    const m = Math.floor(s / 60);
    const r = (s % 60).toFixed(2).padStart(5, "0");
    return `${String(m).padStart(2, "0")}:${r}`;
  }

  // Handle file select from desktop or browser
  async function handleBrowseFile() {
    fileError = null;
    if (isTauriDesktop()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          title: "Pilih File Proyek (.futsal / .json) dari Laptop Lain",
          filters: [
            { name: "Proyek ARF FutsalTag", extensions: ["futsal", "json"] },
          ],
          multiple: false,
        });
        if (!selected || typeof selected !== "string") return;
        const raw = await invoke<string>("load_project_file", { filePath: selected });
        loadProjectData(raw, selected.split(/[\\/]/).pop() || "project.futsal");
      } catch (err: any) {
        fileError = `Gagal membuka berkas: ${err?.message || err}`;
      }
    } else {
      const input = document.getElementById("merge-file-input") as HTMLInputElement;
      input?.click();
    }
  }

  function handleFileInputChange(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        loadProjectData(content, file.name);
      };
      reader.readAsText(file);
    }
  }

  function loadProjectData(content: string, filename: string) {
    fileError = null;
    const parsed = projectStore.parseProjectForMerge(content);
    if (!parsed) {
      fileError = "Format berkas tidak valid. Harap pilih file .futsal atau export JSON FutsalTag.";
      sourceProject = null;
      return;
    }

    sourceJsonStr = content;
    sourceProject = parsed;
    sourceFileName = filename;

    // Suggest default analyst name
    analystName =
      parsed.analystName ||
      parsed.matchInfo?.title ||
      "Laptop B";

    // Initialize category filter to all available
    const catSet = new Set<string>();
    if (Array.isArray(parsed.tags)) {
      parsed.tags.forEach((t: VideoTagEvent) => {
        if (t.category) catSet.add(t.category);
      });
    }
    selectedCategories = Array.from(catSet);

    // Auto-detect best sync method: if both have Babak 1 kickoff, use kickoff
    const hasMyKickoff = projectStore.periodKickoffs.some((k) => k.period === 1);
    const hasSourceKickoff = Array.isArray(parsed.periodKickoffs) && parsed.periodKickoffs.some((k: any) => k.period === 1);
    if (hasMyKickoff && hasSourceKickoff) {
      syncMethod = "kickoff";
      referencePeriod = 1;
    } else {
      syncMethod = "none";
    }

    // Set default anchor tags if available
    if (projectStore.tags.length > 0) {
      targetAnchorTagId = projectStore.tags[0].id;
    }
    if (Array.isArray(parsed.tags) && parsed.tags.length > 0) {
      sourceAnchorTagId = parsed.tags[0].id;
    }
  }

  const currentMergeOptions = $derived<MergeProjectOptions>({
    syncMethod,
    referencePeriod,
    manualOffsetSec,
    targetAnchorTagId,
    sourceAnchorTagId,
    analystName,
    tagTitlePrefix,
    duplicateStrategy,
    duplicateToleranceSec,
    categoryFilter: selectedCategories,
    mergeRoster,
    mergePlaylists,
  });

  const preview = $derived(
    sourceProject
      ? projectStore.calculateMergePreview(sourceProject, currentMergeOptions)
      : null
  );

  const targetKickoff = $derived(
    projectStore.periodKickoffs.find((k) => k.period === referencePeriod)
  );

  const sourceKickoff = $derived(
    Array.isArray(sourceProject?.periodKickoffs)
      ? sourceProject.periodKickoffs.find((k: any) => k.period === referencePeriod)
      : null
  );

  function toggleCategory(cat: string) {
    if (selectedCategories.includes(cat)) {
      selectedCategories = selectedCategories.filter((c) => c !== cat);
    } else {
      selectedCategories = [...selectedCategories, cat];
    }
  }

  function selectAllCategories() {
    if (preview) {
      selectedCategories = [...preview.availableCategories];
    }
  }

  function deselectAllCategories() {
    selectedCategories = [];
  }

  async function executeMerge() {
    if (!sourceProject || isExecuting) return;
    isExecuting = true;
    try {
      const res = projectStore.mergeProjectData(sourceProject, currentMergeOptions);
      onMerged?.(res);
      onClose();
    } catch (err: any) {
      fileError = `Gagal menggabungkan proyek: ${err?.message || err}`;
    } finally {
      isExecuting = false;
    }
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="mpm-backdrop" role="presentation" onclick={onClose}>
    <div
      class="mpm-card"
      role="dialog"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <!-- HEADER -->
      <div class="mpm-header">
        <div class="mpm-title-group">
          <div class="mpm-icon-box">
            <GitMerge size={20} class="text-cyan-400" />
          </div>
          <div>
            <h3>Gabung Tag dari Laptop Lain (Multi-Analyst Sync)</h3>
            <p>
              Integrasikan hasil analisis dari analis kedua (laptop lain / sudut pandang berbeda) dengan sinkronisasi waktu akurat.
            </p>
          </div>
        </div>
        <button type="button" class="mpm-close-btn" onclick={onClose} title="Tutup">
          <X size={18} />
        </button>
      </div>

      <!-- BODY CONTENT -->
      <div class="mpm-body">
        {#if !sourceProject}
          <!-- STEP 1: FILE PICKER EMPTY STATE -->
          <div class="mpm-upload-zone" onclick={handleBrowseFile} role="button" tabindex="0">
            <UploadCloud size={44} class="text-cyan-400 mpm-upload-icon" />
            <h4>Pilih Berkas Proyek (.futsal / .json)</h4>
            <p>
              Salin berkas proyek dari laptop analis lain (misal via Flashdisk, LAN, WhatsApp Web, atau Google Drive) dan muat di sini.
            </p>
            <button type="button" class="mpm-browse-btn">
              <FileSpreadsheet size={15} />
              <span>Cari File di Komputer...</span>
            </button>
            <input
              type="file"
              id="merge-file-input"
              accept=".futsal,.json"
              style="display: none"
              onchange={handleFileInputChange}
            />
          </div>

          {#if fileError}
            <div class="mpm-error-banner">
              <AlertTriangle size={16} />
              <span>{fileError}</span>
            </div>
          {/if}
        {:else}
          <!-- STEP 2: LOADED PROJECT CONTROLS & SYNC -->
          <div class="mpm-loaded-file-bar">
            <div class="mpm-file-meta">
              <span class="mpm-file-badge">SUMBER</span>
              <span class="mpm-file-name" title={sourceFileName}>{sourceFileName}</span>
              <span class="mpm-file-stats">({preview?.totalSourceTags || 0} tag • {sourceProject.roster?.length || 0} pemain)</span>
            </div>
            <button type="button" class="mpm-change-file-btn" onclick={handleBrowseFile}>
              Ganti File
            </button>
          </div>

          {#if fileError}
            <div class="mpm-error-banner">
              <AlertTriangle size={16} />
              <span>{fileError}</span>
            </div>
          {/if}

          <!-- GRID SECTION: SYNC METHOD & SETTINGS -->
          <div class="mpm-config-grid">
            <!-- LEFT: SYNC METHOD -->
            <div class="mpm-section-card">
              <div class="mpm-sec-title">
                <Clock size={15} class="text-cyan-400" />
                <span>1. Penyelarasan Waktu (Sync Method)</span>
              </div>

              <div class="mpm-sync-tabs">
                <button
                  type="button"
                  class="mpm-tab-btn"
                  class:active={syncMethod === "kickoff"}
                  onclick={() => (syncMethod = "kickoff")}
                >
                  <Target size={13} />
                  <span>Kickoff Babak</span>
                </button>
                <button
                  type="button"
                  class="mpm-tab-btn"
                  class:active={syncMethod === "none"}
                  onclick={() => (syncMethod = "none")}
                >
                  <span>Sama Persis (0s)</span>
                </button>
                <button
                  type="button"
                  class="mpm-tab-btn"
                  class:active={syncMethod === "anchor_tag"}
                  onclick={() => (syncMethod = "anchor_tag")}
                >
                  <span>Event Acuan</span>
                </button>
                <button
                  type="button"
                  class="mpm-tab-btn"
                  class:active={syncMethod === "manual_offset"}
                  onclick={() => (syncMethod = "manual_offset")}
                >
                  <Sliders size={13} />
                  <span>Manual (±s)</span>
                </button>
              </div>

              <!-- TAB CONTENT -->
              <div class="mpm-tab-panel">
                {#if syncMethod === "kickoff"}
                  <div class="mpm-form-row">
                    <span class="mpm-label">Pilih Acuan Babak:</span>
                    <div class="mpm-period-btns">
                      <button
                        type="button"
                        class="mpm-period-btn"
                        class:active={referencePeriod === 1}
                        onclick={() => (referencePeriod = 1)}
                      >
                        Babak 1
                      </button>
                      <button
                        type="button"
                        class="mpm-period-btn"
                        class:active={referencePeriod === 2}
                        onclick={() => (referencePeriod = 2)}
                      >
                        Babak 2
                      </button>
                    </div>
                  </div>

                  <div class="mpm-sync-readout">
                    <div class="mpm-readout-col">
                      <span class="mpm-sublabel">Proyek Anda:</span>
                      <strong>{targetKickoff ? fmt(targetKickoff.videoTime) : "Belum diatur"}</strong>
                    </div>
                    <div class="mpm-readout-col">
                      <span class="mpm-sublabel">Proyek Sumber:</span>
                      <strong>{sourceKickoff ? fmt(sourceKickoff.videoTime) : "Belum diatur"}</strong>
                    </div>
                  </div>

                  {#if !targetKickoff || !sourceKickoff}
                    <p class="mpm-hint warning">
                      ⚠️ Salah satu proyek belum memiliki penanda Kickoff Babak {referencePeriod}. Disarankan menggunakan <strong>Event Acuan</strong> atau <strong>Manual</strong>.
                    </p>
                  {/if}
                {:else if syncMethod === "anchor_tag"}
                  <div class="mpm-anchor-group">
                    <label class="mpm-field">
                      <span>Tag Acuan di Proyek Anda:</span>
                      <select class="mpm-select" bind:value={targetAnchorTagId}>
                        {#each projectStore.tags as t}
                          <option value={t.id}>[{fmt(t.startTime)}] {t.category} {t.title ? `- ${t.title}` : ""}</option>
                        {/each}
                      </select>
                    </label>

                    <label class="mpm-field">
                      <span>Tag Acuan yang Cocok di Proyek Sumber:</span>
                      <select class="mpm-select" bind:value={sourceAnchorTagId}>
                        {#if Array.isArray(sourceProject.tags)}
                          {#each sourceProject.tags as st}
                            <option value={st.id}>[{fmt(st.startTime)}] {st.category} {st.title ? `- ${st.title}` : ""}</option>
                          {/each}
                        {/if}
                      </select>
                    </label>
                  </div>
                {:else if syncMethod === "manual_offset"}
                  <div class="mpm-manual-group">
                    <div class="mpm-presets-row">
                      {#each [-5, -2, -1, -0.5, 0.5, 1, 2, 5] as p}
                        <button
                          type="button"
                          class="mpm-preset-chip"
                          onclick={() => (manualOffsetSec = Number((manualOffsetSec + p).toFixed(2)))}
                        >
                          {p > 0 ? `+${p}` : p}s
                        </button>
                      {/each}
                    </div>
                    <label class="mpm-field-inline">
                      <span>Geser Waktu (detik):</span>
                      <input
                        type="number"
                        step="0.1"
                        class="mpm-input"
                        bind:value={manualOffsetSec}
                      />
                    </label>
                  </div>
                {:else}
                  <p class="mpm-hint">
                    Tag dari proyek sumber akan dimasukkan dengan timestamp persis seperti aslinya (cocok jika kedua laptop memakai rekaman video yang sama identik).
                  </p>
                {/if}

                <!-- LIVE OFFSET BADGE -->
                <div class="mpm-offset-badge">
                  <span>Offset Terhitung:</span>
                  <strong class={preview && preview.calculatedOffsetSec !== 0 ? "text-cyan-400" : "text-slate-400"}>
                    {preview ? `${preview.calculatedOffsetSec >= 0 ? "+" : ""}${preview.calculatedOffsetSec.toFixed(2)} detik` : "0.00 detik"}
                  </strong>
                </div>
              </div>
            </div>

            <!-- RIGHT: ATTRIBUTION & DEDUPLICATION -->
            <div class="mpm-section-card">
              <div class="mpm-sec-title">
                <UserCheck size={15} class="text-cyan-400" />
                <span>2. Atribusi Analis & Resolusi Tag</span>
              </div>

              <div class="mpm-field-group">
                <label class="mpm-field">
                  <span>Nama Analis / Sumber (Attribution):</span>
                  <input
                    type="text"
                    class="mpm-input"
                    placeholder="Contoh: Analis B - Transisi & Lawan"
                    bind:value={analystName}
                  />
                </label>

                <label class="mpm-field">
                  <span>Awalan Judul Klip (Opsional Prefix):</span>
                  <input
                    type="text"
                    class="mpm-input"
                    placeholder="Contoh: [B] atau [Lawan]"
                    bind:value={tagTitlePrefix}
                  />
                </label>

                <div class="mpm-field">
                  <span>Resolusi Tag Duplikat:</span>
                  <div class="mpm-radio-group">
                    <label class="mpm-radio-lbl">
                      <input
                        type="radio"
                        name="dup-strat"
                        value="skip_duplicate"
                        checked={duplicateStrategy === "skip_duplicate"}
                        onchange={() => (duplicateStrategy = "skip_duplicate")}
                      />
                      <span>Lewati Duplikat (±{duplicateToleranceSec}s) — <em>Direkomendasikan</em></span>
                    </label>
                    <label class="mpm-radio-lbl">
                      <input
                        type="radio"
                        name="dup-strat"
                        value="keep_both"
                        checked={duplicateStrategy === "keep_both"}
                        onchange={() => (duplicateStrategy = "keep_both")}
                      />
                      <span>Simpan Keduanya (Bandingkan analisis)</span>
                    </label>
                    <label class="mpm-radio-lbl">
                      <input
                        type="radio"
                        name="dup-strat"
                        value="overwrite_existing"
                        checked={duplicateStrategy === "overwrite_existing"}
                        onchange={() => (duplicateStrategy = "overwrite_existing")}
                      />
                      <span>Gantikan Tag di Proyek Ini</span>
                    </label>
                  </div>
                </div>

                <div class="mpm-checkboxes-row">
                  <label class="mpm-check-lbl">
                    <input type="checkbox" bind:checked={mergeRoster} />
                    <span>Gabungkan pemain baru ke Roster</span>
                  </label>
                  <label class="mpm-check-lbl">
                    <input type="checkbox" bind:checked={mergePlaylists} />
                    <span>Gabungkan playlist klip</span>
                  </label>
                </div>
              </div>
            </div>
          </div>

          <!-- BOTTOM: CATEGORY FILTER SELECTION -->
          {#if preview && preview.availableCategories.length > 0}
            <div class="mpm-cat-filter-card">
              <div class="mpm-cat-hdr">
                <div class="mpm-sec-title">
                  <Layers size={14} class="text-cyan-400" />
                  <span>3. Filter Kategori yang Ingin Digabung:</span>
                </div>
                <div class="mpm-cat-actions">
                  <button type="button" class="mpm-link-btn" onclick={selectAllCategories}>Pilih Semua</button>
                  <span>•</span>
                  <button type="button" class="mpm-link-btn" onclick={deselectAllCategories}>Batalkan Semua</button>
                </div>
              </div>

              <div class="mpm-cat-pills">
                {#each preview.availableCategories as cat}
                  {@const active = selectedCategories.includes(cat)}
                  <button
                    type="button"
                    class="mpm-cat-chip"
                    class:active
                    onclick={() => toggleCategory(cat)}
                  >
                    {#if active}
                      <Check size={12} />
                    {/if}
                    <span>{cat}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <!-- SUMMARY LIVE PREVIEW CARD -->
          {#if preview}
            <div class="mpm-summary-bar">
              <div class="mpm-sum-item">
                <span class="mpm-sum-label">Akan Ditambahkan:</span>
                <strong class="text-emerald-400">{preview.tagsToMergeCount} Tag</strong>
              </div>
              <div class="mpm-sum-item">
                <span class="mpm-sum-label">Duplikat Terdeteksi:</span>
                <strong class={preview.duplicateCount > 0 ? "text-amber-400" : "text-slate-400"}>
                  {preview.duplicateCount} Tag
                </strong>
              </div>
              <div class="mpm-sum-item">
                <span class="mpm-sum-label">Kategori Baru:</span>
                <strong>{preview.newCategoriesCount} Kategori</strong>
              </div>
              <div class="mpm-sum-item">
                <span class="mpm-sum-label">Pemain Tambahan:</span>
                <strong>{preview.rosterAdditionsCount} Pemain</strong>
              </div>
            </div>
          {/if}
        {/if}
      </div>

      <!-- FOOTER ACTIONS -->
      <div class="mpm-footer">
        <button type="button" class="mpm-btn secondary" onclick={onClose}>
          Batal
        </button>

        {#if sourceProject}
          <button
            type="button"
            class="mpm-btn primary"
            disabled={!preview || preview.tagsToMergeCount === 0 || isExecuting}
            onclick={executeMerge}
          >
            <GitMerge size={15} />
            <span>{isExecuting ? "Menggabungkan..." : `Gabungkan ${preview ? preview.tagsToMergeCount : 0} Tag ke Proyek`}</span>
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .mpm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: rgba(10, 15, 29, 0.82);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .mpm-card {
    width: 100%;
    max-width: 860px;
    max-height: 90vh;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 12px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.6);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #f1f5f9;
    font-size: 13px;
  }

  .mpm-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    padding: 18px 24px;
    border-bottom: 1px solid #1e293b;
    background: #131d35;
  }

  .mpm-title-group {
    display: flex;
    align-items: center;
    gap: 14px;
  }

  .mpm-icon-box {
    width: 38px;
    height: 38px;
    border-radius: 10px;
    background: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.25);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mpm-header h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #f8fafc;
  }

  .mpm-header p {
    margin: 3px 0 0 0;
    font-size: 12px;
    color: #94a3b8;
  }

  .mpm-close-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    transition: all 0.15s ease;
  }

  .mpm-close-btn:hover {
    color: #f8fafc;
    background: #1e293b;
  }

  .mpm-body {
    padding: 20px 24px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .mpm-upload-zone {
    border: 2px dashed #334155;
    border-radius: 12px;
    padding: 48px 24px;
    text-align: center;
    background: rgba(30, 41, 59, 0.3);
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .mpm-upload-zone:hover {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.05);
  }

  .mpm-upload-zone h4 {
    margin: 0 0 6px 0;
    font-size: 15px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .mpm-upload-zone p {
    margin: 0 0 16px 0;
    color: #94a3b8;
    max-width: 480px;
    font-size: 12px;
    line-height: 1.5;
  }

  .mpm-browse-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 8px;
    background: #0284c7;
    color: #fff;
    border: none;
    font-weight: 600;
    font-size: 12px;
    cursor: pointer;
    transition: background 0.15s;
  }

  .mpm-browse-btn:hover {
    background: #0369a1;
  }

  .mpm-error-banner {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 14px;
    border-radius: 8px;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.3);
    color: #fca5a5;
    font-size: 12px;
  }

  .mpm-loaded-file-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 14px;
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
  }

  .mpm-file-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow: hidden;
  }

  .mpm-file-badge {
    background: #0284c7;
    color: #fff;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 4px;
    letter-spacing: 0.5px;
  }

  .mpm-file-name {
    font-weight: 600;
    color: #f8fafc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 320px;
  }

  .mpm-file-stats {
    font-size: 12px;
    color: #94a3b8;
  }

  .mpm-change-file-btn {
    background: transparent;
    border: 1px solid #475569;
    color: #cbd5e1;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
  }

  .mpm-change-file-btn:hover {
    background: #334155;
    color: #fff;
  }

  .mpm-config-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 16px;
  }

  .mpm-section-card {
    background: #131d35;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .mpm-sec-title {
    display: flex;
    align-items: center;
    gap: 8px;
    font-weight: 700;
    color: #f1f5f9;
    font-size: 13px;
  }

  .mpm-sync-tabs {
    display: flex;
    background: #0f172a;
    border-radius: 8px;
    padding: 3px;
    gap: 2px;
    border: 1px solid #334155;
  }

  .mpm-tab-btn {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 6px 4px;
    border: none;
    border-radius: 6px;
    background: transparent;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
    white-space: nowrap;
  }

  .mpm-tab-btn.active {
    background: #0284c7;
    color: #fff;
  }

  .mpm-tab-panel {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mpm-form-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .mpm-label {
    font-size: 12px;
    color: #94a3b8;
  }

  .mpm-period-btns {
    display: flex;
    gap: 4px;
  }

  .mpm-period-btn {
    padding: 4px 10px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #cbd5e1;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .mpm-period-btn.active {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .mpm-sync-readout {
    display: grid;
    grid-template-columns: 1fr 1fr;
    background: #1e293b;
    border-radius: 6px;
    padding: 8px 12px;
    gap: 8px;
  }

  .mpm-readout-col {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mpm-sublabel {
    font-size: 11px;
    color: #94a3b8;
  }

  .mpm-hint {
    margin: 0;
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.4;
  }

  .mpm-hint.warning {
    color: #fbbf24;
  }

  .mpm-offset-badge {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: rgba(30, 41, 59, 0.6);
    border-radius: 6px;
    border: 1px solid #334155;
    font-size: 12px;
  }

  .mpm-presets-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .mpm-preset-chip {
    padding: 3px 7px;
    border: 1px solid #334155;
    background: #1e293b;
    color: #cbd5e1;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
  }

  .mpm-preset-chip:hover {
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .mpm-field-group {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mpm-field {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .mpm-field > span {
    font-size: 12px;
    font-weight: 600;
    color: #cbd5e1;
  }

  .mpm-field-inline {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .mpm-input, .mpm-select {
    padding: 7px 10px;
    border-radius: 6px;
    border: 1px solid #334155;
    background: #0f172a;
    color: #f1f5f9;
    font-size: 12px;
    outline: none;
    transition: border-color 0.15s;
  }

  .mpm-input:focus, .mpm-select:focus {
    border-color: #38bdf8;
  }

  .mpm-radio-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 8px 10px;
  }

  .mpm-radio-lbl {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    color: #cbd5e1;
    cursor: pointer;
  }

  .mpm-checkboxes-row {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 4px;
  }

  .mpm-check-lbl {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12px;
    color: #cbd5e1;
    cursor: pointer;
  }

  .mpm-cat-filter-card {
    background: #131d35;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .mpm-cat-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .mpm-cat-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #64748b;
  }

  .mpm-link-btn {
    background: transparent;
    border: none;
    color: #38bdf8;
    font-size: 11px;
    cursor: pointer;
    padding: 0;
  }

  .mpm-link-btn:hover {
    text-decoration: underline;
  }

  .mpm-cat-pills {
    display: flex;
    flex-wrap: wrap;
    gap: 6px;
  }

  .mpm-cat-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 4px 10px;
    border-radius: 20px;
    border: 1px solid #334155;
    background: #0f172a;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mpm-cat-chip.active {
    border-color: #0284c7;
    background: rgba(2, 132, 199, 0.2);
    color: #38bdf8;
  }

  .mpm-summary-bar {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    background: #1e293b;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 12px 16px;
    gap: 8px;
  }

  .mpm-sum-item {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .mpm-sum-label {
    font-size: 11px;
    color: #94a3b8;
  }

  .mpm-sum-item strong {
    font-size: 14px;
    font-weight: 700;
  }

  .mpm-footer {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 10px;
    padding: 14px 24px;
    border-top: 1px solid #1e293b;
    background: #131d35;
  }

  .mpm-btn {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 8px 16px;
    border-radius: 8px;
    font-weight: 600;
    font-size: 13px;
    cursor: pointer;
    border: none;
    transition: all 0.15s ease;
  }

  .mpm-btn.secondary {
    background: #334155;
    color: #f1f5f9;
  }

  .mpm-btn.secondary:hover {
    background: #475569;
  }

  .mpm-btn.primary {
    background: #0284c7;
    color: #fff;
  }

  .mpm-btn.primary:hover:not(:disabled) {
    background: #0369a1;
  }

  .mpm-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>

<script lang="ts">
  import { onMount } from "svelte";
  import "$lib/styles/design-system.css";
  import { projectStore } from "$lib/stores/projectStore.svelte";
  import ProjectHub from "$lib/components/ProjectHub.svelte";
  import MatchTaggingWorkspace from "$lib/components/MatchTaggingWorkspace.svelte";
  import TelestrationStudio from "$lib/components/TelestrationStudio.svelte";
  import PlaylistExportHub from "$lib/components/PlaylistExportHub.svelte";
  import {
    FolderOpen,
    Scissors,
    Sparkles,
    Film,
    LayoutGrid,
    Save,
    Tv,
    Flame,
    MessageCircle,
    MonitorPlay,
    Shield,
    BarChart3,
    FilePlus,
    ChevronDown,
    Link2,
    Pencil,
    XCircle,
    AlertTriangle,
    Clock,
  } from "lucide-svelte";

  let isChalkboardOpen = $state(false);
  let isHeatmapOpen = $state(false);
  let isWhatsAppOpen = $state(false);
  let isPresentationOpen = $state(false);
  let isTeamDbOpen = $state(false);
  let isSeasonAnalyticsOpen = $state(false);
  let isProjectMenuOpen = $state(false);
  let isEditMetaOpen = $state(false);
  let metaTitle = $state("");
  let metaKind = $state<"match" | "training">("match");
  let metaComp = $state("");
  let metaDate = $state("");
  let saveToast = $state<string | null>(null);
  let openProjectInputEl: HTMLInputElement | undefined = $state();
  const isProjectorWindow =
    typeof window !== "undefined" &&
    new URLSearchParams(window.location.search).get("screen") === "presenter";

  function showSaveToast(msg: string) {
    saveToast = msg;
    setTimeout(() => {
      if (saveToast === msg) saveToast = null;
    }, 2800);
  }

  onMount(() => {
    if (isProjectorWindow) return;
    projectStore.checkAutoSaveRecovery();
    const timer = setInterval(() => {
      projectStore.runAutoSave();
    }, 60_000);

    const onWindowKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        handleSaveProject(e.shiftKey);
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "n") {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;
        e.preventDefault();
        handleNewProject();
      }
    };
    const onWindowClick = () => {
      if (isProjectMenuOpen) isProjectMenuOpen = false;
    };

    window.addEventListener("keydown", onWindowKeyDown);
    window.addEventListener("click", onWindowClick);
    return () => {
      clearInterval(timer);
      window.removeEventListener("keydown", onWindowKeyDown);
      window.removeEventListener("click", onWindowClick);
    };
  });

  async function handleSaveProject(forceSaveAs = false) {
    isProjectMenuOpen = false;
    try {
      const savedPath = await projectStore.saveProjectToDisk(forceSaveAs);
      if (savedPath) {
        const fname = savedPath.split(/[\\/]/).pop() || savedPath;
        showSaveToast(`Tersimpan: ${fname}`);
      }
    } catch (err: any) {
      alert(`Gagal menyimpan proyek: ${err?.message || err}`);
    }
  }

  async function handleOpenProjectClick() {
    isProjectMenuOpen = false;
    if (!projectStore.confirmDiscardIfDirty("membuka proyek lain")) return;
    if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
      try {
        const ok = await projectStore.openProjectFromDisk();
        if (ok) {
          showSaveToast(`Dimuat: ${projectStore.videoTitle}`);
        }
      } catch (err: any) {
        alert(`Gagal membuka proyek: ${err?.message || err}`);
      }
    } else {
      openProjectInputEl?.click();
    }
  }

  async function handleOpenRecent(filePath: string) {
    isProjectMenuOpen = false;
    if (!projectStore.confirmDiscardIfDirty("pindah ke proyek ini")) return;
    try {
      const ok = await projectStore.openProjectFromPath(filePath);
      if (ok) {
        showSaveToast(`Pindah ke: ${projectStore.videoTitle}`);
      } else {
        alert("Format berkas proyek tidak valid.");
      }
    } catch (err: any) {
      alert(`Gagal membuka riwayat proyek: ${err?.message || err}`);
    }
  }

  function handleNewProject() {
    isProjectMenuOpen = false;
    if (!projectStore.confirmDiscardIfDirty("membuat analisis baru")) return;
    projectStore.resetProject();
  }

  function handleCloseProject() {
    isProjectMenuOpen = false;
    if (!projectStore.confirmDiscardIfDirty("menutup proyek aktif")) return;
    projectStore.resetProject();
  }

  function openEditMetaModal() {
    isProjectMenuOpen = false;
    metaTitle = projectStore.videoTitle;
    metaKind = projectStore.matchKind;
    metaComp = projectStore.competitionName;
    metaDate = projectStore.matchDate;
    isEditMetaOpen = true;
  }

  function saveEditMeta() {
    projectStore.updateMatchMeta({
      title: metaTitle,
      matchKind: metaKind,
      competition: metaComp,
      matchDate: metaDate,
    });
    isEditMetaOpen = false;
    showSaveToast("Info pertandingan diperbarui");
  }

  async function handleRelinkVideo() {
    isProjectMenuOpen = false;
    try {
      const ok = await projectStore.relinkVideoFile();
      if (ok) showSaveToast("Video berhasil ditautkan ulang");
    } catch (err: any) {
      alert(`Gagal menautkan video: ${err?.message || err}`);
    }
  }

  function handleOpenProjectFile(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const reader = new FileReader();
      reader.onload = (e) => {
        const text = e.target?.result as string;
        if (text) {
          const ok = projectStore.importProjectJson(text);
          if (ok) {
            alert(`Berkas proyek "${file.name}" berhasil dimuat!`);
          } else {
            alert("Format berkas proyek tidak valid.");
          }
        }
      };
      reader.readAsText(file);
    }
  }
</script>

<svelte:head>
  <title>ARF FutsalTag - Futsal Video Analyser, Telestrator & Coach Board</title
  >
</svelte:head>

{#if isProjectorWindow}
  {#await import("$lib/components/SecondScreenStage.svelte") then { default: SecondScreenStage }}
    <SecondScreenStage />
  {/await}
{:else}
<div class="app-container">
  <!-- PRIMARY APP HEADER BAR -->
  <header class="app-header">
    <button
      type="button"
      class="brand"
      onclick={() => projectStore.setStage("hub")}
      title="Kembali ke Hub Proyek"
    >
      <div class="brand-badge-circle" aria-hidden="true">
        <svg
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="#e0f2fe"
          stroke-width="2"
          stroke-linecap="round"
          stroke-linejoin="round"
        >
          <circle cx="12" cy="12" r="9.5" />
          <polygon
            points="12,7 16.5,10.2 14.8,15.5 9.2,15.5 7.5,10.2"
            fill="rgba(56,189,248,0.28)"
          />
          <line x1="12" y1="2.5" x2="12" y2="7" />
          <line x1="21" y1="9" x2="16.5" y2="10.2" />
          <line x1="17.5" y1="19.5" x2="14.8" y2="15.5" />
          <line x1="6.5" y1="19.5" x2="9.2" y2="15.5" />
          <line x1="3" y1="9" x2="7.5" y2="10.2" />
        </svg>
      </div>
      <div class="brand-text">
        <div class="brand-title-wrap">
          <span class="brand-tag">ARF</span>
          <span class="brand-title">FUTSALTAG</span>
        </div>
      </div>
    </button>

    <!-- ACTIVE MATCH PILL -->
    {#if projectStore.videoTitle}
      <button
        type="button"
        class="active-match-pill"
        onclick={() => projectStore.setStage("tagging")}
        title={projectStore.videoTitle}
      >
        <span class="live-indicator"></span>
        <span class="match-name">{projectStore.videoTitle}</span>
        <span class="clips-count">{projectStore.tags.length} Klip</span>
      </button>
    {/if}

    <!-- WORKFLOW STEPPER TABS -->
    <nav class="workflow-stepper" aria-label="Alur Kerja Analisis">
      <!-- STEP 1: HUB -->
      <button
        type="button"
        class="step-btn"
        class:active={projectStore.stage === "hub"}
        onclick={() => projectStore.setStage("hub")}
        title="Hub Proyek"
      >
        <FolderOpen size={14} />
        <span class="step-num">1</span>
        <span class="step-label">Hub</span>
      </button>

      <!-- STEP 2: TAGGING & CLIPPING -->
      <button
        type="button"
        class="step-btn"
        class:active={projectStore.stage === "tagging"}
        onclick={() => projectStore.setStage("tagging")}
        title="Tagging & Klip Pertandingan"
      >
        <Scissors size={14} />
        <span class="step-num">2</span>
        <span class="step-label">Tagging</span>
        {#if projectStore.tags.length > 0}
          <span class="tab-counter-badge">{projectStore.tags.length}</span>
        {/if}
      </button>

      <!-- STEP 3: TELESTRATOR STUDIO -->
      <button
        type="button"
        class="step-btn"
        class:active={projectStore.stage === "telestrator"}
        onclick={() => projectStore.setStage("telestrator")}
        title="Studio Telestrasi & AI Tracking"
      >
        <Sparkles size={14} />
        <span class="step-num">3</span>
        <span class="step-label">Telestrasi</span>
      </button>

      <!-- STEP 4: PLAYLIST & EXPORT -->
      <button
        type="button"
        class="step-btn"
        class:active={projectStore.stage === "playlist_export"}
        onclick={() => projectStore.setStage("playlist_export")}
        title="Playlist & Ekspor Video"
      >
        <Film size={14} />
        <span class="step-num">4</span>
        <span class="step-label">Playlist</span>
      </button>

      <div class="stepper-mode-divider"></div>

      <!-- COACH BOARD TAB -->
      <button
        type="button"
        class="step-btn coachboard-tab"
        class:active={projectStore.stage === "coachboard"}
        onclick={() => projectStore.setStage("coachboard")}
        title="Papan Taktik 2D FIFA Futsal (40m x 20m)"
      >
        <LayoutGrid size={14} />
        <span class="step-label">Taktik 2D</span>
      </button>
    </nav>

    <!-- RIGHT TOOLBAR GROUP -->
    <div class="header-right-group">
      <!-- KILLER PRO TOOLS BAR -->
      <div class="pro-tools-bar">
        <button
          type="button"
          class="btn-pro-tool btn-klub"
          onclick={() => (isTeamDbOpen = true)}
          title="Library Klub, Jersey & Roster Futsal Persisten"
        >
          <Shield size={13} />
          <span>Klub</span>
        </button>

        <button
          type="button"
          class="btn-pro-tool btn-musim"
          onclick={() => (isSeasonAnalyticsOpen = true)}
          title="Season & Multi-Match Analytics Hub (.futsal)"
        >
          <BarChart3 size={13} />
          <span>Musim</span>
        </button>

        <button
          type="button"
          class="btn-pro-tool btn-presenter"
          onclick={() => (isPresentationOpen = true)}
          title="Fullscreen Presentation Studio (Klip + Slide Taktik 2D + Live Pen)"
        >
          <MonitorPlay size={13} />
          <span>Presentasi</span>
        </button>

        <button
          type="button"
          class="btn-pro-tool btn-chalkboard"
          onclick={() => (isChalkboardOpen = true)}
          title="Buka Ruang Ganti Chalkboard (Auto-Pause Layar Sentuh & Telestrasi Kilat)"
        >
          <Tv size={13} />
          <span>Ruang Ganti</span>
        </button>

        <button
          type="button"
          class="btn-pro-tool btn-heatmap"
          onclick={() => (isHeatmapOpen = true)}
          title="Peta Panas Densitas & Jaringan Operan Antar Pemain 5v5"
        >
          <Flame size={13} />
          <span>Heatmap</span>
        </button>

        <button
          type="button"
          class="btn-pro-tool btn-whatsapp"
          onclick={() => (isWhatsAppOpen = true)}
          title="Ekspor Paket Klip Evaluasi Pemain Ringan untuk WhatsApp (<15MB)"
        >
          <MessageCircle size={13} />
          <span>Paket WA</span>
        </button>
      </div>

      <!-- PROJECT FILE IO -->
      <div class="header-badges">
        {#if projectStore.lastAutoSaveAt}
          <span class="autosave-pill" title="Cadangan otomatis proyek disimpan setiap 60 detik">
            Auto-save {projectStore.lastAutoSaveAt}
          </span>
        {/if}
        <button
          type="button"
          class="btn-header-io"
          title="Menu Manajemen Proyek (Proyek Baru, Simpan Cepat, Terakhir Dibuka, Relink)"
          onclick={(e) => {
            e.stopPropagation();
            isProjectMenuOpen = !isProjectMenuOpen;
          }}
        >
          <FolderOpen size={12} />
          <span>Proyek</span>
          {#if projectStore.hasUnsavedChanges}
            <span class="dirty-dot" title="Ada perubahan belum disimpan"></span>
          {/if}
          <ChevronDown size={11} />
        </button>
        <input
          bind:this={openProjectInputEl}
          type="file"
          accept=".futsal,.json"
          onchange={handleOpenProjectFile}
          style="display: none;"
        />
        <button
          type="button"
          class="btn-header-io btn-io-save"
          onclick={() => handleSaveProject(false)}
          title={projectStore.currentProjectFilePath
            ? `Simpan Cepat ke ${projectStore.currentProjectFilePath} (Ctrl+S)`
            : "Simpan Proyek (.futsal) (Ctrl+S)"}
        >
          <Save size={12} />
          <span>{projectStore.hasUnsavedChanges ? "Simpan*" : "Simpan"}</span>
        </button>
      </div>
    </div>
  </header>

  {#if isProjectMenuOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="project-dropdown"
      role="menu"
      tabindex="-1"
      onclick={(e) => e.stopPropagation()}
    >
      <button type="button" class="pd-item" onclick={handleNewProject}>
        <FilePlus size={13} />
        <span>Proyek Baru</span>
        <kbd>Ctrl+N</kbd>
      </button>
      <button type="button" class="pd-item" onclick={handleOpenProjectClick}>
        <FolderOpen size={13} />
        <span>Buka Berkas Proyek...</span>
      </button>
      <button type="button" class="pd-item" onclick={() => handleSaveProject(false)}>
        <Save size={13} />
        <span>{projectStore.currentProjectFilePath ? "Simpan Cepat" : "Simpan Proyek..."}</span>
        <kbd>Ctrl+S</kbd>
      </button>
      <button type="button" class="pd-item" onclick={() => handleSaveProject(true)}>
        <Save size={13} />
        <span>Simpan Sebagai File Baru...</span>
        <kbd>Ctrl+Shift+S</kbd>
      </button>
      <div class="pd-divider"></div>
      <button type="button" class="pd-item" onclick={openEditMetaModal}>
        <Pencil size={13} />
        <span>Edit Info Pertandingan</span>
      </button>
      <button type="button" class="pd-item" onclick={handleRelinkVideo}>
        <Link2 size={13} />
        <span>Tautkan Ulang Video (Relink)</span>
      </button>
      <button type="button" class="pd-item pd-danger" onclick={handleCloseProject}>
        <XCircle size={13} />
        <span>Tutup Proyek Aktif</span>
      </button>

      {#if projectStore.recentProjects.length > 0}
        <div class="pd-divider"></div>
        <div class="pd-sec-label">TERAKHIR DIBUKA</div>
        {#each projectStore.recentProjects.slice(0, 6) as rec (rec.filePath)}
          <button
            type="button"
            class="pd-recent-item"
            onclick={() => handleOpenRecent(rec.filePath)}
            title={rec.filePath}
          >
            <Clock size={12} />
            <span class="pd-rec-title">{rec.title}</span>
            <span class="pd-rec-meta">{rec.matchKind === "training" ? "Lat" : "Laga"} · {rec.tagCount}</span>
          </button>
        {/each}
      {/if}
    </div>
  {/if}

  {#if saveToast}
    <div class="save-toast" role="status">{saveToast}</div>
  {/if}

  {#if projectStore.videoMissing}
    <div class="missing-video-banner" role="alert">
      <div class="mvb-left">
        <AlertTriangle size={14} />
        <span>
          Video pertandingan tidak ditemukan di path tersimpan (<code>{projectStore.videoFilePath}</code>). Klip, label, dan telestrasi tetap aman.
        </span>
      </div>
      <button type="button" class="mvb-btn" onclick={handleRelinkVideo}>
        <Link2 size={12} />
        <span>Cari Videonya (Relink)</span>
      </button>
    </div>
  {/if}

  <!-- WORKSPACE VIEWPORT -->
  <main class="app-workspace">
    {#if projectStore.stage === "hub"}
      <ProjectHub
        onOpenTeamDatabase={() => (isTeamDbOpen = true)}
        onOpenSeasonAnalytics={() => (isSeasonAnalyticsOpen = true)}
      />
    {:else if projectStore.stage === "tagging"}
      <MatchTaggingWorkspace />
    {:else if projectStore.stage === "telestrator"}
      <TelestrationStudio />
    {:else if projectStore.stage === "playlist_export"}
      <PlaylistExportHub
        onOpenPresentation={() => (isPresentationOpen = true)}
      />
    {:else if projectStore.stage === "coachboard"}
      {#await import("$lib/components/TacticalBoard.svelte") then { default: TacticalBoard }}
        <TacticalBoard />
      {/await}
    {/if}
  </main>

  <!-- MODAL DIALOGS FOR KILLER FEATURES (LAZY-LOADED) -->
  {#if isChalkboardOpen}
    {#await import("$lib/components/LockerRoomChalkboardModal.svelte") then { default: LockerRoomChalkboardModal }}
      <LockerRoomChalkboardModal
        isOpen={isChalkboardOpen}
        onClose={() => (isChalkboardOpen = false)}
      />
    {/await}
  {/if}

  {#if isHeatmapOpen}
    {#await import("$lib/components/FutsalHeatmapModal.svelte") then { default: FutsalHeatmapModal }}
      <FutsalHeatmapModal
        isOpen={isHeatmapOpen}
        onClose={() => (isHeatmapOpen = false)}
      />
    {/await}
  {/if}

  {#if isWhatsAppOpen}
    {#await import("$lib/components/WhatsAppPlayerExporterModal.svelte") then { default: WhatsAppPlayerExporterModal }}
      <WhatsAppPlayerExporterModal
        isOpen={isWhatsAppOpen}
        onClose={() => (isWhatsAppOpen = false)}
      />
    {/await}
  {/if}

  {#if isPresentationOpen}
    {#await import("$lib/components/PresentationStudioModal.svelte") then { default: PresentationStudioModal }}
      <PresentationStudioModal
        isOpen={isPresentationOpen}
        onClose={() => (isPresentationOpen = false)}
      />
    {/await}
  {/if}

  {#if isTeamDbOpen}
    {#await import("$lib/components/TeamDatabaseModal.svelte") then { default: TeamDatabaseModal }}
      <TeamDatabaseModal
        isOpen={isTeamDbOpen}
        onClose={() => (isTeamDbOpen = false)}
      />
    {/await}
  {/if}

  {#if isSeasonAnalyticsOpen}
    {#await import("$lib/components/SeasonAnalyticsModal.svelte") then { default: SeasonAnalyticsModal }}
      <SeasonAnalyticsModal
        isOpen={isSeasonAnalyticsOpen}
        onClose={() => (isSeasonAnalyticsOpen = false)}
      />
    {/await}
  {/if}

  {#if isEditMetaOpen}
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="meta-modal-backdrop" role="presentation" onclick={() => (isEditMetaOpen = false)}>
      <div class="meta-modal-card" role="dialog" tabindex="-1" onclick={(e) => e.stopPropagation()}>
        <h3>Edit Info Pertandingan / Sesi</h3>
        <label class="mm-field">
          <span>Judul Pertandingan / Sesi</span>
          <input type="text" bind:value={metaTitle} placeholder="Misal: Futsal Pro vs Blacksteel" />
        </label>
        <div class="mm-row">
          <label class="mm-field">
            <span>Jenis Sesi</span>
            <select bind:value={metaKind}>
              <option value="match">Pertandingan</option>
              <option value="training">Latihan</option>
            </select>
          </label>
          <label class="mm-field">
            <span>Tanggal</span>
            <input type="date" bind:value={metaDate} />
          </label>
        </div>
        <label class="mm-field">
          <span>Kompetisi / Turnamen</span>
          <input type="text" bind:value={metaComp} placeholder="Opsional: Pro Futsal League..." />
        </label>
        <div class="mm-actions">
          <button type="button" class="mm-btn" onclick={() => (isEditMetaOpen = false)}>Batal</button>
          <button type="button" class="mm-btn primary" onclick={saveEditMeta}>Simpan Info</button>
        </div>
      </div>
    </div>
  {/if}
</div>
{/if}

<style>
  :global(body, html) {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: #060b14;
    font-family:
      Inter,
      system-ui,
      -apple-system,
      BlinkMacSystemFont,
      "Segoe UI",
      Roboto,
      sans-serif;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: #060b14;
    background-image: radial-gradient(
        ellipse 80% 50% at 50% -20%,
        rgba(14, 165, 233, 0.08),
        transparent 70%
      ),
      radial-gradient(
        ellipse 50% 50% at 90% 100%,
        rgba(37, 99, 235, 0.05),
        transparent 70%
      );
  }

  /* HEADER (DEEP SAPPHIRE BROADCAST) */
  .app-header {
    height: 50px;
    background: linear-gradient(180deg, #0b172a 0%, #070e1c 100%);
    border-bottom: 1px solid #1a355d;
    box-shadow: 0 4px 20px -2px rgba(2, 6, 23, 0.8);
    display: flex;
    align-items: center;
    gap: 10px;
    padding: 0 12px;
    box-sizing: border-box;
    overflow: hidden;
    z-index: 50;
    flex-shrink: 0;
  }

  /* BRAND */
  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: none;
    padding: 0;
    text-align: left;
    user-select: none;
    cursor: pointer;
    flex-shrink: 0;
    transition: opacity 0.15s;
  }

  .brand:hover {
    opacity: 0.92;
  }

  .brand-badge-circle {
    width: 30px;
    height: 30px;
    border-radius: 8px;
    background: linear-gradient(135deg, #0284c7 0%, #1e3a8a 100%);
    border: 1px solid #38bdf8;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
    flex-shrink: 0;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-title-wrap {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .brand-title {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: #f0f6fc;
    line-height: 1.1;
    white-space: nowrap;
  }

  .brand-tag {
    font-size: 8px;
    font-weight: 900;
    background: linear-gradient(135deg, #0284c7, #38bdf8);
    color: #060b14;
    padding: 1px 4px;
    border-radius: 3px;
    letter-spacing: 0.05em;
  }

  /* ACTIVE MATCH PILL */
  .active-match-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0d1e38;
    border: 1px solid #1a355d;
    padding: 4px 10px;
    border-radius: 20px;
    cursor: pointer;
    min-width: 0;
    flex-shrink: 1;
    transition: all 0.2s ease;
  }

  .active-match-pill:hover {
    border-color: #38bdf8;
    background-color: #122849;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
  }

  .live-indicator {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #10b981;
    box-shadow: 0 0 8px #10b981;
    flex-shrink: 0;
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7);
    }
    70% {
      transform: scale(1);
      box-shadow: 0 0 0 6px rgba(16, 185, 129, 0);
    }
    100% {
      transform: scale(0.95);
      box-shadow: 0 0 0 0 rgba(16, 185, 129, 0);
    }
  }

  .match-name {
    font-size: 11px;
    font-weight: 600;
    color: #f0f6fc;
    max-width: 150px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clips-count {
    font-size: 10px;
    font-weight: 700;
    color: #38bdf8;
    background-color: #071224;
    padding: 1px 6px;
    border-radius: 10px;
    border: 1px solid #1a355d;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .tab-counter-badge {
    font-size: 9px;
    font-weight: 800;
    color: #060b14;
    background-color: #38bdf8;
    padding: 1px 5px;
    border-radius: 8px;
    margin-left: 2px;
  }

  /* WORKFLOW STEPPER */
  .workflow-stepper {
    display: flex;
    align-items: center;
    gap: 2px;
    background-color: #0b1528;
    padding: 3px 5px;
    border-radius: 8px;
    border: 1px solid #1a355d;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
    flex-shrink: 0;
  }

  .step-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    padding: 5px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
  }

  .step-btn:hover {
    color: #e2e8f0;
    background-color: rgba(56, 189, 248, 0.08);
  }

  .step-btn.active {
    background: linear-gradient(
      135deg,
      rgba(2, 132, 199, 0.35),
      rgba(37, 99, 235, 0.45)
    );
    border: 1px solid #38bdf8;
    color: #ffffff;
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.3);
  }

  .step-num {
    width: 15px;
    height: 15px;
    border-radius: 50%;
    background-color: #060b14;
    border: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 800;
    color: #94a3b8;
    flex-shrink: 0;
  }

  .step-btn.active .step-num {
    background-color: #38bdf8;
    border-color: #38bdf8;
    color: #060b14;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
  }

  .stepper-mode-divider {
    width: 1px;
    height: 18px;
    background-color: #1a355d;
    margin: 0 3px;
    flex-shrink: 0;
  }

  .coachboard-tab {
    color: #34d399;
  }

  .coachboard-tab:hover {
    color: #6ee7b7;
    background-color: rgba(16, 185, 129, 0.08);
  }

  .coachboard-tab.active {
    background: linear-gradient(
      135deg,
      rgba(16, 185, 129, 0.3),
      rgba(6, 78, 59, 0.5)
    );
    border-color: #34d399;
    color: #ffffff;
    box-shadow: 0 0 14px rgba(52, 211, 153, 0.3);
  }

  /* RIGHT TOOLBAR GROUP */
  .header-right-group {
    display: flex;
    align-items: center;
    gap: 8px;
    margin-left: auto;
    flex-shrink: 0;
  }

  /* PROJECT IO */
  .header-badges {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .btn-header-io {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #09172c;
    color: #93c5fd;
    border: 1px solid #1a355d;
    padding: 5px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-header-io:hover {
    background: #0e274d;
    color: #38bdf8;
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  .btn-io-save {
    background: linear-gradient(
      135deg,
      rgba(2, 132, 199, 0.25),
      rgba(30, 64, 175, 0.25)
    );
    border-color: rgba(56, 189, 248, 0.4);
    color: #38bdf8;
  }

  .btn-io-save:hover {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
  }

  /* PRO TOOLS BAR */
  .pro-tools-bar {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .btn-pro-tool {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 5px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    border: 1px solid transparent;
  }

  @media (max-width: 1380px) {
    .active-match-pill {
      display: none;
    }
  }

  @media (max-width: 1280px) {
    .step-num {
      display: none;
    }

    .step-btn {
      padding: 5px 8px;
    }

    .btn-pro-tool span {
      display: none;
    }

    .btn-pro-tool {
      padding: 6px 8px;
    }
  }

  @media (max-width: 1024px) {
    .app-header {
      height: auto;
      min-height: 50px;
      flex-wrap: wrap;
      padding: 6px 10px;
      row-gap: 6px;
      overflow: visible;
    }

    .workflow-stepper {
      max-width: 100%;
      overflow-x: auto;
      scrollbar-width: none;
    }

    .workflow-stepper::-webkit-scrollbar {
      display: none;
    }

    .header-right-group {
      flex-wrap: wrap;
      gap: 6px;
    }
  }

  @media (max-width: 768px) {
    .app-container {
      height: auto;
      min-height: 100vh;
      overflow-y: auto;
      overflow-x: hidden;
    }

    .app-workspace {
      overflow-y: auto;
      overflow-x: hidden;
    }

    .step-btn,
    .btn-pro-tool,
    .btn-header-io {
      min-height: 36px;
    }

    .pro-tools-bar,
    .header-badges {
      gap: 8px;
    }
  }

  @media (max-width: 640px) {
    .brand-title {
      display: none;
    }

    .btn-header-io span {
      display: none;
    }

    .header-right-group {
      width: 100%;
      justify-content: space-between;
    }
  }

  .btn-klub {
    background: rgba(56, 189, 248, 0.12);
    border-color: rgba(56, 189, 248, 0.35);
    color: #38bdf8;
  }

  .btn-klub:hover {
    background: rgba(56, 189, 248, 0.25);
    border-color: #38bdf8;
  }

  .btn-musim {
    background: rgba(234, 179, 8, 0.12);
    border-color: rgba(250, 204, 21, 0.35);
    color: #fde047;
  }

  .btn-musim:hover {
    background: rgba(234, 179, 8, 0.25);
    border-color: #eab308;
  }

  .btn-presenter {
    background: rgba(168, 85, 247, 0.14);
    border-color: rgba(192, 132, 252, 0.4);
    color: #d8b4fe;
  }

  .btn-presenter:hover {
    background: rgba(168, 85, 247, 0.28);
    border-color: #a855f7;
    box-shadow: 0 0 12px rgba(168, 85, 247, 0.35);
    transform: translateY(-1px);
  }

  .btn-chalkboard {
    background: rgba(14, 165, 233, 0.12);
    border-color: rgba(56, 189, 248, 0.35);
    color: #38bdf8;
  }

  .btn-chalkboard:hover {
    background: rgba(14, 165, 233, 0.25);
    border-color: #38bdf8;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
    transform: translateY(-1px);
  }

  .btn-heatmap {
    background: rgba(249, 115, 22, 0.12);
    border-color: rgba(251, 146, 60, 0.35);
    color: #fb923c;
  }

  .btn-heatmap:hover {
    background: rgba(249, 115, 22, 0.25);
    border-color: #f97316;
    box-shadow: 0 0 12px rgba(249, 115, 22, 0.35);
    transform: translateY(-1px);
  }

  .btn-whatsapp {
    background: rgba(16, 185, 129, 0.12);
    border-color: rgba(52, 211, 153, 0.35);
    color: #34d399;
  }

  .btn-whatsapp:hover {
    background: rgba(16, 185, 129, 0.25);
    border-color: #10b981;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.35);
    transform: translateY(-1px);
  }

  .autosave-pill {
    font-family: var(--ft-font-mono);
    font-size: 9.5px;
    font-weight: 700;
    color: #34d399;
    background: rgba(16, 185, 129, 0.14);
    border: 1px solid rgba(16, 185, 129, 0.35);
    padding: 3px 7px;
    border-radius: 999px;
    white-space: nowrap;
  }

  @media (max-width: 1120px) {
    .autosave-pill {
      display: none;
    }
  }

  /* WORKSPACE */
  .app-workspace {
    flex: 1;
    overflow: hidden;
    position: relative;
    background-color: #060b14;
  }

  .dirty-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #f59e0b;
    display: inline-block;
  }

  .project-dropdown {
    position: fixed;
    top: 52px;
    right: 12px;
    z-index: 320;
    width: 280px;
    background: #0a1426;
    border: 1px solid #1e3b68;
    border-radius: 10px;
    padding: 6px;
    box-shadow: 0 16px 36px rgba(2, 6, 23, 0.85);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .pd-item,
  .pd-recent-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    background: transparent;
    border: none;
    border-radius: 6px;
    padding: 7px 9px;
    color: #e2e8f0;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
  }

  .pd-item:hover,
  .pd-recent-item:hover {
    background: #13284b;
    color: #ffffff;
  }

  .pd-item span,
  .pd-rec-title {
    flex: 1;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pd-item kbd {
    font-size: 9.5px;
    color: #64748b;
    background: #060b14;
    border: 1px solid #1e293b;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .pd-danger {
    color: #fca5a5;
  }

  .pd-divider {
    height: 1px;
    background: #1a355d;
    margin: 4px 2px;
  }

  .pd-sec-label {
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #38bdf8;
    padding: 4px 8px 2px;
  }

  .pd-rec-meta {
    font-size: 9.5px;
    color: #94a3b8;
    flex-shrink: 0;
  }

  .save-toast {
    position: fixed;
    bottom: 16px;
    right: 16px;
    z-index: 330;
    background: #065f46;
    border: 1px solid #10b981;
    color: #ecfdf5;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 14px;
    border-radius: 8px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  }

  .missing-video-banner {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 6px 14px;
    background: rgba(120, 53, 15, 0.45);
    border-bottom: 1px solid #d97706;
    color: #fde68a;
    font-size: 11.5px;
  }

  .mvb-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .mvb-left code {
    font-size: 10.5px;
    color: #fef3c7;
  }

  .mvb-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #d97706;
    border: 1px solid #f59e0b;
    color: #ffffff;
    font-size: 11px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .meta-modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 340;
    background: rgba(2, 6, 23, 0.78);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 16px;
  }

  .meta-modal-card {
    width: 100%;
    max-width: 420px;
    background: #0b1629;
    border: 1px solid #1e3b68;
    border-radius: 12px;
    padding: 18px;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .meta-modal-card h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
  }

  .mm-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .mm-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
  }

  .mm-field input,
  .mm-field select {
    background: #060b14;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f8fafc;
    font-size: 12px;
    padding: 6px 8px;
  }

  .mm-actions {
    display: flex;
    justify-content: flex-end;
    gap: 8px;
    margin-top: 4px;
  }

  .mm-btn {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 6px;
    padding: 6px 12px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
  }

  .mm-btn.primary {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }
</style>

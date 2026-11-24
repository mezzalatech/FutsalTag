<script lang="ts">
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import ProjectHub from '$lib/components/ProjectHub.svelte';
  import MatchTaggingWorkspace from '$lib/components/MatchTaggingWorkspace.svelte';
  import TelestrationStudio from '$lib/components/TelestrationStudio.svelte';
  import PlaylistExportHub from '$lib/components/PlaylistExportHub.svelte';
  import TacticalBoard from '$lib/components/TacticalBoard.svelte';
  import LockerRoomChalkboardModal from '$lib/components/LockerRoomChalkboardModal.svelte';
  import FutsalHeatmapModal from '$lib/components/FutsalHeatmapModal.svelte';
  import WhatsAppPlayerExporterModal from '$lib/components/WhatsAppPlayerExporterModal.svelte';
  import {
    FolderOpen,
    Scissors,
    Sparkles,
    Film,
    LayoutGrid,
    ChevronRight,
    Save,
    Tv,
    Flame,
    MessageCircle,
  } from 'lucide-svelte';

  let isChalkboardOpen = $state(false);
  let isHeatmapOpen = $state(false);
  let isWhatsAppOpen = $state(false);

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
            alert('Format berkas proyek tidak valid.');
          }
        }
      };
      reader.readAsText(file);
    }
  }
</script>

<svelte:head>
  <title>FutsalTag Pro - Futsal Video Analyser, Telestrator & Coach Board</title>
</svelte:head>

<div class="app-container">
  <!-- PRIMARY APP HEADER BAR WITH MOMEN & ONCE SPORT BROADCAST STYLE -->
  <header class="app-header">
    <div class="brand" onclick={() => projectStore.setStage('hub')} role="button" tabindex="0">
      <div class="brand-badge-circle">
        <span class="brand-icon">⚽</span>
      </div>
      <div class="brand-text">
        <div class="brand-title-wrap">
          <span class="brand-title">FUTSALTAG</span>
          <span class="brand-tag">PRO</span>
        </div>
        <span class="brand-sub">MOMEN & ONCE SPORT WORKFLOW</span>
      </div>
    </div>

    <!-- ACTIVE MATCH PILL (MOMEN SPORTS STYLE) -->
    {#if projectStore.videoTitle}
      <div class="active-match-pill" onclick={() => projectStore.setStage('tagging')} role="button" tabindex="0">
        <span class="live-indicator"></span>
        <span class="match-name">{projectStore.videoTitle}</span>
        <span class="clips-count">{projectStore.tags.length} Klip</span>
      </div>
    {/if}

    <!-- WORKFLOW STEPPER TABS -->
    <nav class="workflow-stepper">
      <!-- STEP 1: HUB -->
      <button
        class="step-btn"
        class:active={projectStore.stage === 'hub'}
        onclick={() => projectStore.setStage('hub')}
      >
        <FolderOpen size={14} />
        <span class="step-num">1</span>
        <span class="step-label">Hub Proyek</span>
      </button>

      <div class="step-separator">
        <ChevronRight size={13} />
      </div>

      <!-- STEP 2: TAGGING & CLIPPING -->
      <button
        class="step-btn"
        class:active={projectStore.stage === 'tagging'}
        onclick={() => projectStore.setStage('tagging')}
      >
        <Scissors size={14} />
        <span class="step-num">2</span>
        <span class="step-label">Tagging & Klip</span>
        {#if projectStore.tags.length > 0}
          <span class="tab-counter-badge">{projectStore.tags.length}</span>
        {/if}
      </button>

      <div class="step-separator">
        <ChevronRight size={13} />
      </div>

      <!-- STEP 3: TELESTRATOR STUDIO -->
      <button
        class="step-btn"
        class:active={projectStore.stage === 'telestrator'}
        onclick={() => projectStore.setStage('telestrator')}
      >
        <Sparkles size={14} />
        <span class="step-num">3</span>
        <span class="step-label">Studio Telestrasi</span>
      </button>

      <div class="step-separator">
        <ChevronRight size={13} />
      </div>

      <!-- STEP 4: PLAYLIST & EXPORT -->
      <button
        class="step-btn"
        class:active={projectStore.stage === 'playlist_export'}
        onclick={() => projectStore.setStage('playlist_export')}
      >
        <Film size={14} />
        <span class="step-num">4</span>
        <span class="step-label">Playlist & Ekspor</span>
      </button>

      <div class="stepper-mode-divider"></div>

      <!-- COACH BOARD TAB -->
      <button
        class="step-btn coachboard-tab"
        class:active={projectStore.stage === 'coachboard'}
        onclick={() => projectStore.setStage('coachboard')}
      >
        <LayoutGrid size={14} />
        <span class="step-label">Papan Taktik (2D)</span>
      </button>
    </nav>

    <!-- KILLER PRO TOOLS BAR -->
    <div class="pro-tools-bar">
      <button
        class="btn-pro-tool btn-chalkboard"
        onclick={() => (isChalkboardOpen = true)}
        title="Buka Ruang Ganti Chalkboard (Auto-Pause Layar Sentuh & Telestrasi Kilat)"
      >
        <Tv size={13} />
        <span>Ruang Ganti</span>
      </button>

      <button
        class="btn-pro-tool btn-heatmap"
        onclick={() => (isHeatmapOpen = true)}
        title="Peta Panas Densitas & Jaringan Operan Antar Pemain 5v5"
      >
        <Flame size={13} />
        <span>Heatmap & Umpan</span>
      </button>

      <button
        class="btn-pro-tool btn-whatsapp"
        onclick={() => (isWhatsAppOpen = true)}
        title="Ekspor Paket Klip Evaluasi Pemain Ringan untuk WhatsApp (<15MB)"
      >
        <MessageCircle size={13} />
        <span>Paket WA</span>
      </button>
    </div>

    <!-- RIGHT BADGES & PROJECT FILE IO -->
    <div class="header-badges">
      <label class="btn-header-io" title="Buka Berkas Proyek Futsal (.futsal)">
        <FolderOpen size={12} />
        <span>Buka Proyek</span>
        <input
          type="file"
          accept=".futsal,.json"
          onchange={handleOpenProjectFile}
          style="display: none;"
        />
      </label>
      <button
        class="btn-header-io btn-io-save"
        onclick={() => projectStore.downloadProjectFile()}
        title="Simpan Proyek & Seluruh Klip ke Berkas (.futsal)"
      >
        <Save size={12} />
        <span>Simpan Proyek</span>
      </button>
      <span class="badge-fifa">FIFA Futsal (40m x 20m)</span>
    </div>
  </header>

  <!-- WORKSPACE VIEWPORT -->
  <main class="app-workspace">
    {#if projectStore.stage === 'hub'}
      <ProjectHub />
    {:else if projectStore.stage === 'tagging'}
      <MatchTaggingWorkspace />
    {:else if projectStore.stage === 'telestrator'}
      <TelestrationStudio />
    {:else if projectStore.stage === 'playlist_export'}
      <PlaylistExportHub />
    {:else if projectStore.stage === 'coachboard'}
      <TacticalBoard />
    {/if}
  </main>

  <!-- MODAL DIALOGS FOR KILLER FEATURES -->
  <LockerRoomChalkboardModal
    isOpen={isChalkboardOpen}
    onClose={() => (isChalkboardOpen = false)}
  />

  <FutsalHeatmapModal
    isOpen={isHeatmapOpen}
    onClose={() => (isHeatmapOpen = false)}
  />

  <WhatsAppPlayerExporterModal
    isOpen={isWhatsAppOpen}
    onClose={() => (isWhatsAppOpen = false)}
  />
</div>

<style>
  :global(body, html) {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: #060b14;
    font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: #060b14;
    background-image: 
      radial-gradient(ellipse 80% 50% at 50% -20%, rgba(14, 165, 233, 0.08), transparent 70%),
      radial-gradient(ellipse 50% 50% at 90% 100%, rgba(37, 99, 235, 0.05), transparent 70%);
  }

  /* HEADER (DEEP SAPPHIRE BROADCAST) */
  .app-header {
    height: 50px;
    background: linear-gradient(180deg, #0b172a 0%, #070e1c 100%);
    border-bottom: 1px solid #1a355d;
    box-shadow: 0 4px 20px -2px rgba(2, 6, 23, 0.8);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 18px;
    box-sizing: border-box;
    z-index: 50;
    flex-shrink: 0;
  }

  /* BRAND (MOMEN SPORTS STYLE) */
  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    user-select: none;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .brand:hover {
    opacity: 0.92;
  }

  .brand-badge-circle {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    background: linear-gradient(135deg, #0284c7 0%, #1e3a8a 100%);
    border: 1px solid #38bdf8;
    display: flex;
    align-items: center;
    justify-content: center;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
  }

  .brand-icon {
    font-size: 16px;
    line-height: 1;
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
    letter-spacing: 0.12em;
    color: #f0f6fc;
    line-height: 1.1;
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

  .brand-sub {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.06em;
    color: #38bdf8;
    opacity: 0.85;
  }

  /* ACTIVE MATCH PILL (MOMEN STYLE) */
  .active-match-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #0d1e38;
    border: 1px solid #1a355d;
    padding: 4px 12px;
    border-radius: 20px;
    cursor: pointer;
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
    animation: pulse 2s infinite;
  }

  @keyframes pulse {
    0% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0.7); }
    70% { transform: scale(1); box-shadow: 0 0 0 6px rgba(16, 185, 129, 0); }
    100% { transform: scale(0.95); box-shadow: 0 0 0 0 rgba(16, 185, 129, 0); }
  }

  .match-name {
    font-size: 11px;
    font-weight: 600;
    color: #f0f6fc;
    max-width: 220px;
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
    gap: 3px;
    background-color: #0b1528;
    padding: 3px 6px;
    border-radius: 8px;
    border: 1px solid #1a355d;
    box-shadow: inset 0 2px 4px rgba(0, 0, 0, 0.4);
  }

  .step-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    user-select: none;
  }

  .step-btn:hover {
    color: #e2e8f0;
    background-color: rgba(56, 189, 248, 0.08);
  }

  .step-btn.active {
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.35), rgba(37, 99, 235, 0.45));
    border: 1px solid #38bdf8;
    color: #ffffff;
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.3);
  }

  .step-num {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: #060b14;
    border: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 800;
    color: #94a3b8;
  }

  .step-btn.active .step-num {
    background-color: #38bdf8;
    border-color: #38bdf8;
    color: #060b14;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.6);
  }

  .step-separator {
    color: #1a355d;
    display: flex;
    align-items: center;
  }

  .stepper-mode-divider {
    width: 1px;
    height: 18px;
    background-color: #1a355d;
    margin: 0 4px;
  }

  .coachboard-tab {
    color: #34d399;
  }

  .coachboard-tab:hover {
    color: #6ee7b7;
    background-color: rgba(16, 185, 129, 0.08);
  }

  .coachboard-tab.active {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.3), rgba(6, 78, 59, 0.5));
    border-color: #34d399;
    color: #ffffff;
    box-shadow: 0 0 14px rgba(52, 211, 153, 0.3);
  }

  /* BADGES */
  .header-badges {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-header-io {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #09172c;
    color: #93c5fd;
    border: 1px solid #1a355d;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
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
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(30, 64, 175, 0.25));
    border-color: rgba(56, 189, 248, 0.4);
    color: #38bdf8;
  }

  .btn-io-save:hover {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
  }

  .badge-fifa {
    font-size: 9px;
    font-weight: 700;
    color: #38bdf8;
    background-color: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 4px 9px;
    border-radius: 5px;
    letter-spacing: 0.04em;
  }

  .badge-version {
    font-size: 9px;
    font-weight: 700;
    color: #93c5fd;
    background-color: #0d1e38;
    border: 1px solid #1a355d;
    padding: 4px 8px;
    border-radius: 5px;
  }

  /* PRO TOOLS BAR */
  .pro-tools-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-left: auto;
    margin-right: 12px;
  }

  .btn-pro-tool {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 5px 11px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.16, 1, 0.3, 1);
    border: 1px solid transparent;
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

  /* WORKSPACE */
  .app-workspace {
    flex: 1;
    overflow: hidden;
    position: relative;
    background-color: #060b14;
  }
</style>

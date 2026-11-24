<script lang="ts">
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import ProjectHub from '$lib/components/ProjectHub.svelte';
  import MatchTaggingWorkspace from '$lib/components/MatchTaggingWorkspace.svelte';
  import TelestrationStudio from '$lib/components/TelestrationStudio.svelte';
  import PlaylistExportHub from '$lib/components/PlaylistExportHub.svelte';
  import TacticalBoard from '$lib/components/TacticalBoard.svelte';
  import {
    FolderOpen,
    Scissors,
    Sparkles,
    Film,
    LayoutGrid,
    ChevronRight,
  } from 'lucide-svelte';
</script>

<svelte:head>
  <title>Teleslator - Futsal Video Analyser, Telestrator & Coach Board</title>
</svelte:head>

<div class="app-container">
  <!-- PRIMARY APP HEADER BAR WITH ONCE SPORT STYLE STEPPER -->
  <header class="app-header">
    <div class="brand" onclick={() => projectStore.setStage('hub')} style="cursor: pointer;">
      <div class="brand-icon">⚽</div>
      <div class="brand-text">
        <span class="brand-title">TELESLATOR</span>
        <span class="brand-sub">FUTSAL ANALYTICS</span>
      </div>
    </div>

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
        <ChevronRight size={14} />
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
      </button>

      <div class="step-separator">
        <ChevronRight size={14} />
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
        <ChevronRight size={14} />
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

    <!-- RIGHT BADGES -->
    <div class="header-badges">
      <span class="badge-fifa">FIFA Standard (40m x 20m)</span>
      <span class="badge-version">v2.0 Once Flow</span>
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
</div>

<style>
  :global(body, html) {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    background-color: #0b0f19;
    font-family: Inter, system-ui, -apple-system, sans-serif;
  }

  .app-container {
    display: flex;
    flex-direction: column;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
    background-color: #0b0f19;
  }

  /* HEADER */
  .app-header {
    height: 48px;
    background-color: #0f172a;
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    box-sizing: border-box;
    z-index: 50;
    flex-shrink: 0;
  }

  .brand {
    display: flex;
    align-items: center;
    gap: 8px;
    user-select: none;
  }

  .brand-icon {
    font-size: 20px;
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-title {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.1em;
    color: #38bdf8;
    line-height: 1.1;
  }

  .brand-sub {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.05em;
    color: #64748b;
  }

  /* WORKFLOW STEPPER */
  .workflow-stepper {
    display: flex;
    align-items: center;
    gap: 2px;
    background-color: #1e293b;
    padding: 3px 6px;
    border-radius: 8px;
    border: 1px solid #334155;
  }

  .step-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
    user-select: none;
  }

  .step-btn:hover {
    color: #f8fafc;
    background-color: rgba(255, 255, 255, 0.05);
  }

  .step-btn.active {
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.3), rgba(37, 99, 235, 0.4));
    border: 1px solid rgba(56, 189, 248, 0.4);
    color: #38bdf8;
  }

  .step-num {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    background-color: #0f172a;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    font-weight: 800;
  }

  .step-btn.active .step-num {
    background-color: #38bdf8;
    color: #0f172a;
  }

  .step-separator {
    color: #475569;
    display: flex;
    align-items: center;
  }

  .stepper-mode-divider {
    width: 1px;
    height: 18px;
    background-color: #475569;
    margin: 0 4px;
  }

  .coachboard-tab {
    color: #34d399;
  }

  .coachboard-tab.active {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 78, 59, 0.4));
    border-color: rgba(16, 185, 129, 0.4);
    color: #34d399;
  }

  /* BADGES */
  .header-badges {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .badge-fifa {
    font-size: 9px;
    font-weight: 700;
    color: #38bdf8;
    background-color: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 3px 8px;
    border-radius: 4px;
  }

  .badge-version {
    font-size: 9px;
    font-weight: 700;
    color: #94a3b8;
    background-color: #1e293b;
    border: 1px solid #334155;
    padding: 3px 6px;
    border-radius: 4px;
  }

  /* WORKSPACE */
  .app-workspace {
    flex: 1;
    overflow: hidden;
    position: relative;
  }
</style>

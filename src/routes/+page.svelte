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

  .brand {
    display: flex;
    align-items: center;
    gap: 10px;
    user-select: none;
    transition: opacity 0.15s;
  }

  .brand:hover {
    opacity: 0.9;
  }

  .brand-icon {
    font-size: 20px;
    filter: drop-shadow(0 0 8px rgba(56, 189, 248, 0.5));
  }

  .brand-text {
    display: flex;
    flex-direction: column;
  }

  .brand-title {
    font-size: 13px;
    font-weight: 900;
    letter-spacing: 0.12em;
    color: #38bdf8;
    line-height: 1.1;
    text-shadow: 0 0 12px rgba(56, 189, 248, 0.4);
  }

  .brand-sub {
    font-size: 8px;
    font-weight: 700;
    letter-spacing: 0.08em;
    color: #7dd3fc;
    opacity: 0.7;
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

  /* WORKSPACE */
  .app-workspace {
    flex: 1;
    overflow: hidden;
    position: relative;
    background-color: #060b14;
  }
</style>

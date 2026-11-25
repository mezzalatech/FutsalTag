<script lang="ts">
  import { onMount } from 'svelte';
  import { convertFileSrc } from '@tauri-apps/api/core';
  import { projectStore, isTauriDesktop } from '$lib/stores/projectStore.svelte';
  import {
    Video,
    Sparkles,
    LayoutGrid,
    Upload,
    PlayCircle,
    ArrowRight,
    FolderOpen,
    Clock,
    Award,
    Shield,
    Users,
    Trophy,
    CheckCircle2,
    Calendar,
    BarChart3,
  } from 'lucide-svelte';

  interface Props {
    onOpenTeamDatabase?: () => void;
    onOpenSeasonAnalytics?: () => void;
  }

  let { onOpenTeamDatabase, onOpenSeasonAnalytics }: Props = $props();

  let homeTeam = $state('Tim Kami (Futsal Pro)');
  let awayTeam = $state('Tim Lawan');
  let tournamentName = $state('Liga Futsal Profesional 2026');
  let matchHalf = $state<'Babak 1' | 'Babak 2' | 'Full Time'>('Babak 1');
  let homeColor = $state('#0284c7');
  let awayColor = $state('#ef4444');
  let selectedHomeClubId = $state<string>('');
  let selectedAwayClubId = $state<string>('');
  let isDragging = $state(false);
  let fullVideoInputEl: HTMLInputElement | undefined = $state();
  let projectFileInputEl: HTMLInputElement | undefined = $state();
  let quickVideoInputEl: HTMLInputElement | undefined = $state();

  onMount(() => {
    if (!projectStore.clubLibraryLoaded) {
      projectStore.loadClubLibrary();
    }
  });

  function handleSelectHomeClub(clubId: string) {
    selectedHomeClubId = clubId;
    const club = projectStore.clubLibrary.find((c) => c.id === clubId);
    if (club) {
      homeTeam = club.name;
      homeColor = club.jerseyColor;
    }
  }

  function handleSelectAwayClub(clubId: string) {
    selectedAwayClubId = clubId;
    const club = projectStore.clubLibrary.find((c) => c.id === clubId);
    if (club) {
      awayTeam = club.name;
      awayColor = club.jerseyColor;
    }
  }

  const TEAM_COLORS = ['#0284c7', '#ef4444', '#10b981', '#f59e0b', '#ffffff', '#1e293b'];

  async function handleTauriVideoClick(quickTelestrate = false) {
    if (!isTauriDesktop()) {
      if (quickTelestrate) {
        quickVideoInputEl?.click();
      } else {
        fullVideoInputEl?.click();
      }
      return;
    }
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: quickTelestrate ? 'Pilih Klip Video untuk Telestrasi' : 'Pilih Video Pertandingan Futsal',
        multiple: false,
        filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }],
      });
      if (!selected || typeof selected !== 'string') return;
      const assetUrl = convertFileSrc(selected);
      const fileName = selected.split(/[\\/]/).pop() || selected;
      if (quickTelestrate) {
        projectStore.loadVideo(assetUrl, selected, `Klip Telestrasi: ${fileName}`, 30);
        const quickTag = {
          id: `quick-clip-${Date.now()}`,
          title: `Telestrasi: ${fileName.replace(/\.[^/.]+$/, '')}`,
          category: 'Transition Attack' as const,
          startTime: 0,
          endTime: 30,
          color: '#38bdf8',
          playerLabel: '#9 Pivot',
          pauseDuration: 3.0,
          freezeTimestamp: 15.0,
          drawings: [],
        };
        projectStore.addTag(quickTag);
        projectStore.openClipInTelestrator(quickTag);
      } else {
        projectStore.loadVideo(
          assetUrl,
          selected,
          `${homeTeam} vs ${awayTeam} (${matchHalf})`,
          180
        );
        if (selectedHomeClubId || selectedAwayClubId) {
          projectStore.applyClubsToMatchRoster(selectedHomeClubId || null, selectedAwayClubId || null);
        }
        projectStore.setStage('tagging');
      }
    } catch (err: any) {
      alert(`Gagal membuka video: ${err?.message || err}`);
    }
  }

  async function handleTauriProjectOpenClick() {
    if (!isTauriDesktop()) {
      projectFileInputEl?.click();
      return;
    }
    try {
      const ok = await projectStore.openProjectFromDisk();
      if (ok) {
        alert(`Berkas proyek "${projectStore.videoTitle}" berhasil dimuat!`);
      }
    } catch (err: any) {
      alert(`Gagal membuka berkas proyek: ${err?.message || err}`);
    }
  }

  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      processSelectedFile(input.files[0]);
    }
  }

  function handleDrop(e: DragEvent) {
    e.preventDefault();
    isDragging = false;
    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      processSelectedFile(e.dataTransfer.files[0]);
    }
  }

  function processSelectedFile(file: File) {
    const url = URL.createObjectURL(file);
    projectStore.loadVideo(
      url,
      file.name,
      `${homeTeam} vs ${awayTeam} (${matchHalf})`,
      180
    );
    if (selectedHomeClubId || selectedAwayClubId) {
      projectStore.applyClubsToMatchRoster(selectedHomeClubId || null, selectedAwayClubId || null);
    }
    projectStore.setStage('tagging');
  }

  function handleQuickClipUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input.files && input.files.length > 0) {
      const file = input.files[0];
      const url = URL.createObjectURL(file);
      projectStore.loadVideo(
        url,
        file.name,
        `Klip Telestrasi: ${file.name}`,
        30
      );

      const quickTag = {
        id: `quick-clip-${Date.now()}`,
        title: `Telestrasi: ${file.name.replace(/\.[^/.]+$/, '')}`,
        category: 'Transition Attack' as const,
        startTime: 0,
        endTime: 30,
        color: '#38bdf8',
        playerLabel: '#9 Pivot',
        pauseDuration: 3.0,
        drawings: [],
      };
      projectStore.addTag(quickTag);
      projectStore.openClipInTelestrator(quickTag);
    }
  }

  function loadSampleMatch() {
    projectStore.loadSampleDemo();
  }

  function handleProjectFileOpen(event: Event) {
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

<div class="project-hub-container">
  <!-- WELCOME HERO -->
  <div class="hero-section">
    <div class="hero-badge">
      <Award size={13} />
      <span>FUTSAL VIDEO ANALYSIS & AI TELESTRATION</span>
    </div>
    <h1 class="hero-title">
      Selamat Datang di <span class="highlight">FUTSALTAG PRO</span>
    </h1>
    <p class="hero-desc">
      Platform analisis video futsal profesional, auto pre/post roll tagging, telestrasi siaran TV, dan papan taktik standar FIFA (40m x 20m).
    </p>
  </div>

  <!-- WORKFLOW ENTRY CARDS -->
  <div class="cards-grid">
    <!-- CARD 1: FULL MATCH ANALYSIS (MOMEN SPORTS WORKSPACE) -->
    <div
      class="workflow-card primary-card"
      class:dragover={isDragging}
      ondragover={(e) => { e.preventDefault(); isDragging = true; }}
      ondragleave={() => (isDragging = false)}
      ondrop={handleDrop}
      role="region"
      aria-label="Upload Video Pertandingan"
    >
      <div class="card-badge">TAHAP LENGKAP</div>
      <div class="card-icon-wrap icon-blue">
        <Video size={26} />
      </div>
      <h3 class="card-title">Analisis Pertandingan Penuh</h3>
      <p class="card-desc">
        Impor video pertandingan futsal (1 babak / 40 menit). Lakukan pemotongan momen instan (tagging) dengan tombol aksi cepat, labeling pemain, dan matriks silang statistik.
      </p>

      <!-- MATCH SETUP FORM -->
      <div class="match-meta-form">
        <!-- Tournament Name -->
        <div class="form-row-sm">
          <Trophy size={11} class="text-sky-400" />
          <input
            type="text"
            class="input-meta-compact"
            placeholder="Nama Turnamen / Latihan"
            bind:value={tournamentName}
          />
        </div>

        <!-- Club Library Dropdowns -->
        <div class="club-select-row">
          <select
            class="club-select"
            value={selectedHomeClubId}
            onchange={(e) => handleSelectHomeClub((e.currentTarget as HTMLSelectElement).value)}
            title="Pilih Klub Home dari Library (otomatis isi roster)"
          >
            <option value="">-- Klub Home (Library) --</option>
            {#each projectStore.clubLibrary as c (c.id)}
              <option value={c.id}>{c.name} ({c.players.length} pemain)</option>
            {/each}
          </select>
          <select
            class="club-select"
            value={selectedAwayClubId}
            onchange={(e) => handleSelectAwayClub((e.currentTarget as HTMLSelectElement).value)}
            title="Pilih Profil Lawan dari Library"
          >
            <option value="">-- Klub Away (Library) --</option>
            {#each projectStore.clubLibrary as c (c.id)}
              <option value={c.id}>{c.name}</option>
            {/each}
          </select>
        </div>

        <!-- Teams row with jersey color pills -->
        <div class="form-row teams-setup-row">
          <div class="team-input-group">
            <span class="color-dot" style="background-color: {homeColor}"></span>
            <input
              type="text"
              class="input-meta"
              placeholder="Tim Kandang"
              bind:value={homeTeam}
            />
          </div>

          <span class="vs-text">VS</span>

          <div class="team-input-group">
            <span class="color-dot" style="background-color: {awayColor}"></span>
            <input
              type="text"
              class="input-meta"
              placeholder="Tim Tandang"
              bind:value={awayTeam}
            />
          </div>
        </div>

        <!-- Period selector -->
        <div class="half-select">
          <label class="radio-label" class:selected={matchHalf === 'Babak 1'}>
            <input type="radio" bind:group={matchHalf} value="Babak 1" /> Babak 1 (20m)
          </label>
          <label class="radio-label" class:selected={matchHalf === 'Babak 2'}>
            <input type="radio" bind:group={matchHalf} value="Babak 2" /> Babak 2 (20m)
          </label>
          <label class="radio-label" class:selected={matchHalf === 'Full Time'}>
            <input type="radio" bind:group={matchHalf} value="Full Time" /> Penuh (40m)
          </label>
        </div>
      </div>

      <!-- ACTIONS -->
      <div class="card-actions">
        <button type="button" class="btn-primary-action" onclick={() => handleTauriVideoClick(false)}>
          <Upload size={15} />
          <span>Pilih / Seret Video MP4</span>
        </button>
        <input
          bind:this={fullVideoInputEl}
          type="file"
          accept="video/*"
          onchange={handleFileUpload}
          style="display: none;"
        />
        <button type="button" class="btn-sample-action" onclick={loadSampleMatch}>
          <PlayCircle size={14} />
          <span>Muat Sampel Demo (Pendekar United vs Blacksteel)</span>
        </button>
        <button type="button" class="btn-load-project" title="Buka Proyek yang Sudah Ada (.futsal)" onclick={handleTauriProjectOpenClick}>
          <FolderOpen size={14} />
          <span>Buka Berkas Proyek (.futsal / .json)</span>
        </button>
        <input
          bind:this={projectFileInputEl}
          type="file"
          accept=".futsal,.json"
          onchange={handleProjectFileOpen}
          style="display: none;"
        />
      </div>
    </div>

    <!-- CARD 2: QUICK TELESTRATOR CLIP (ONCE SPORT STYLE) -->
    <div class="workflow-card quick-card">
      <div class="card-badge badge-amber">MODE CEPAT</div>
      <div class="card-icon-wrap icon-amber">
        <Sparkles size={26} />
      </div>
      <h3 class="card-title">Studio Telestrasi Singkat</h3>
      <p class="card-desc">
        Punya cuplikan 10–60 detik rekaman ponsel atau cuplikan gol? Langsung buka Studio Telestrasi untuk menggambar spotlight 3D, lingkaran pemain, dan radar visi.
      </p>

      <div class="quick-clip-features">
        <div class="feature-item">
          <CheckCircle2 size={12} class="text-sky-400" />
          <span>Langsung menggambar tanpa setup tagging</span>
        </div>
        <div class="feature-item">
          <CheckCircle2 size={12} class="text-sky-400" />
          <span>Spotlight 3D & efek pendar lapangan futsal</span>
        </div>
        <div class="feature-item">
          <CheckCircle2 size={12} class="text-sky-400" />
          <span>Freeze-frame slider & preset durasi jeda</span>
        </div>
      </div>

      <div class="card-actions">
        <button type="button" class="btn-amber-action" onclick={() => handleTauriVideoClick(true)}>
          <FolderOpen size={15} />
          <span>Impor Klip & Langsung Gambar</span>
        </button>
        <input
          bind:this={quickVideoInputEl}
          type="file"
          accept="video/*"
          onchange={handleQuickClipUpload}
          style="display: none;"
        />
      </div>
    </div>

    <!-- CARD 3: TACTICAL COACH BOARD -->
    <div class="workflow-card coach-card">
      <div class="card-badge badge-green">PAPAN TAKTIK</div>
      <div class="card-icon-wrap icon-green">
        <LayoutGrid size={26} />
      </div>
      <h3 class="card-title">Papan Taktik Futsal (2D)</h3>
      <p class="card-desc">
        Rancang simulasi rotasi 3-1, 4-0 flat, power play 5v4, dan skema bola mati (kick-in & corner) dengan animasi pergerakan pemain dan ekspor dokumen taktik PDF.
      </p>

      <div class="coach-presets-preview">
        <span class="preset-tag">Rotasi 3-1 Pivot</span>
        <span class="preset-tag">4-0 Flat Flank</span>
        <span class="preset-tag">Power Play 5v4</span>
        <span class="preset-tag">Pressing Diamond</span>
      </div>

      <div class="card-actions">
        <button
          class="btn-green-action"
          onclick={() => projectStore.setStage('coachboard')}
        >
          <ArrowRight size={15} />
          <span>Buka Papan Taktik (Coach Board)</span>
        </button>
      </div>
    </div>
  </div>

  <!-- RECENT PROJECTS BAR (MOMEN SPORTS STYLE) -->
  <div class="recent-projects-bar">
    <div class="recent-title">
      <Clock size={15} class="text-sky-400" />
      <span>Proyek & Sampel Tersedia:</span>
    </div>
    <div class="recent-chips-row">
      <button class="recent-chip" onclick={loadSampleMatch}>
        <span class="chip-status">⚽ Sampel Demo</span>
        <span class="chip-name">Pendekar United vs Blacksteel</span>
        <span class="chip-meta">(Babak 1 • 3 Klip Taktis)</span>
      </button>
      {#if onOpenTeamDatabase}
        <button type="button" class="recent-chip" onclick={onOpenTeamDatabase}>
          <Shield size={12} class="text-sky-400" />
          <span class="chip-name">Library Klub ({projectStore.clubLibrary.length})</span>
        </button>
      {/if}
      {#if onOpenSeasonAnalytics}
        <button type="button" class="recent-chip" onclick={onOpenSeasonAnalytics}>
          <BarChart3 size={12} class="text-emerald-400" />
          <span class="chip-name">Season Analytics Hub</span>
        </button>
      {/if}
      <div class="workflow-breadcrumbs">
        <span class="crumb-text">Alur 4 Tahap:</span>
        <span class="crumb active">1. Hub</span>
        <span class="crumb-arrow">→</span>
        <span class="crumb">2. Tagging</span>
        <span class="crumb-arrow">→</span>
        <span class="crumb">3. Telestrasi</span>
        <span class="crumb-arrow">→</span>
        <span class="crumb">4. Playlist & Ekspor</span>
      </div>
    </div>
  </div>
</div>

<style>
  .project-hub-container {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    background: radial-gradient(ellipse at 50% 15%, #0e2347 0%, #060b14 80%);
    color: #f0f6fc;
    padding: 20px 28px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    gap: 18px;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  /* HERO */
  .hero-section {
    text-align: center;
    max-width: 800px;
    margin: 0 auto;
  }

  .hero-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    background: rgba(14, 165, 233, 0.15);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
    padding: 4px 14px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    margin-bottom: 10px;
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.2);
  }

  .hero-title {
    font-size: 32px;
    font-weight: 900;
    letter-spacing: -0.02em;
    margin: 0 0 8px 0;
    color: #ffffff;
  }

  .highlight {
    background: linear-gradient(135deg, #38bdf8 0%, #60a5fa 50%, #93c5fd 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    filter: drop-shadow(0 0 20px rgba(56, 189, 248, 0.4));
  }

  .hero-desc {
    font-size: 13px;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0;
  }

  /* CARDS GRID */
  .cards-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 16px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
  }

  .workflow-card {
    background: linear-gradient(180deg, #0d1e38 0%, #071222 100%);
    border: 1px solid #1a355d;
    border-radius: 14px;
    padding: 20px;
    min-width: 0;
    display: flex;
    flex-direction: column;
    position: relative;
    transition: all 0.25s cubic-bezier(0.4, 0, 0.2, 1);
    box-shadow: 0 10px 30px -10px rgba(0, 0, 0, 0.7), 0 0 15px rgba(14, 165, 233, 0.06);
  }

  @media (max-width: 1040px) {
    .project-hub-container {
      padding: 16px 20px;
    }

    .cards-grid {
      grid-template-columns: 1fr;
    }
  }

  .workflow-card:hover {
    transform: translateY(-4px);
    border-color: #38bdf8;
    box-shadow: 0 20px 35px -10px rgba(0, 0, 0, 0.8), 0 0 25px rgba(56, 189, 248, 0.25);
  }

  .workflow-card.dragover {
    border-color: #10b981;
    background: linear-gradient(180deg, #0f2d48 0%, #071526 100%);
    box-shadow: 0 0 24px rgba(16, 185, 129, 0.4);
  }

  .card-badge {
    position: absolute;
    top: 16px;
    right: 16px;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 2px 8px;
    border-radius: 4px;
    background: rgba(14, 165, 233, 0.2);
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
  }

  .badge-amber {
    background: rgba(2, 132, 199, 0.2);
    color: #60a5fa;
    border-color: rgba(96, 165, 250, 0.4);
  }

  .badge-green {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.4);
  }

  .card-icon-wrap {
    width: 48px;
    height: 48px;
    border-radius: 12px;
    display: flex;
    align-items: center;
    justify-content: center;
    margin-bottom: 14px;
  }

  .icon-blue {
    background: linear-gradient(135deg, rgba(56, 189, 248, 0.25), rgba(30, 58, 138, 0.5));
    color: #38bdf8;
    border: 1px solid rgba(56, 189, 248, 0.4);
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.3);
  }

  .icon-amber {
    background: linear-gradient(135deg, rgba(96, 165, 250, 0.25), rgba(30, 64, 175, 0.5));
    color: #60a5fa;
    border: 1px solid rgba(96, 165, 250, 0.4);
    box-shadow: 0 0 15px rgba(96, 165, 250, 0.3);
  }

  .icon-green {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 78, 59, 0.5));
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.4);
    box-shadow: 0 0 15px rgba(16, 185, 129, 0.3);
  }

  .card-title {
    font-size: 17px;
    font-weight: 800;
    margin: 0 0 8px 0;
    color: #f0f6fc;
  }

  .card-desc {
    font-size: 11px;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0 0 14px 0;
    flex-grow: 1;
  }

  /* FORMS & PREVIEWS */
  .match-meta-form {
    background-color: #091528;
    border-radius: 8px;
    padding: 10px;
    margin-bottom: 14px;
    border: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .form-row-sm {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #060e1d;
    border: 1px solid #1a355d;
    padding: 4px 8px;
    border-radius: 5px;
  }

  .input-meta-compact {
    flex: 1;
    background: transparent;
    border: none;
    outline: none;
    color: #f0f6fc;
    font-size: 10px;
    font-weight: 600;
  }

  .teams-setup-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .team-input-group {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #060e1d;
    border: 1px solid #1a355d;
    border-radius: 5px;
    padding: 2px 6px;
  }

  .color-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .input-meta {
    flex: 1;
    background: transparent;
    border: none;
    color: #f0f6fc;
    font-size: 10px;
    padding: 5px 0;
    outline: none;
    width: 100%;
  }

  .vs-text {
    font-size: 10px;
    font-weight: 900;
    color: #38bdf8;
  }

  .half-select {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  .radio-label {
    flex: 1;
    font-size: 9px;
    color: #94a3b8;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: #060e1d;
    border: 1px solid #1a355d;
    padding: 4px;
    border-radius: 4px;
    transition: all 0.15s;
  }

  .radio-label.selected {
    color: #38bdf8;
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.1);
  }

  .radio-label input {
    accent-color: #38bdf8;
  }

  .card-actions {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .btn-primary-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
    color: #ffffff;
    padding: 10px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
    border: 1px solid #38bdf8;
    transition: all 0.2s ease;
  }

  .btn-primary-action:hover {
    background: linear-gradient(135deg, #0369a1 0%, #1d4ed8 100%);
    box-shadow: 0 6px 20px rgba(2, 132, 199, 0.5);
  }

  .btn-sample-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: #091322;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    padding: 7px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-sample-action:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background: #112646;
  }

  .btn-load-project {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.1), rgba(30, 64, 175, 0.15));
    border: 1px dashed #0284c7;
    color: #38bdf8;
    padding: 7px;
    border-radius: 6px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-load-project:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.3), rgba(37, 99, 235, 0.3));
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
  }

  .quick-clip-features {
    display: flex;
    flex-direction: column;
    gap: 6px;
    background-color: #091528;
    padding: 10px 12px;
    border-radius: 8px;
    margin-bottom: 14px;
    border: 1px solid #1a355d;
  }

  .feature-item {
    font-size: 10px;
    color: #cbd5e1;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-amber-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #0284c7 0%, #1d4ed8 100%);
    color: #ffffff;
    padding: 10px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid #60a5fa;
  }

  .btn-amber-action:hover {
    background: linear-gradient(135deg, #0369a1 0%, #1e40af 100%);
  }

  .coach-presets-preview {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    background-color: #091528;
    padding: 10px;
    border-radius: 8px;
    margin-bottom: 14px;
    border: 1px solid #1a355d;
  }

  .preset-tag {
    font-size: 9px;
    font-weight: 600;
    color: #34d399;
    background: rgba(16, 185, 129, 0.1);
    border: 1px solid rgba(16, 185, 129, 0.3);
    padding: 3px 7px;
    border-radius: 4px;
  }

  .btn-green-action {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
    background: linear-gradient(135deg, #059669 0%, #047857 100%);
    color: #ffffff;
    padding: 10px;
    border-radius: 7px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    border: 1px solid #34d399;
  }

  .btn-green-action:hover {
    background: linear-gradient(135deg, #047857 0%, #065f46 100%);
  }

  /* RECENT PROJECTS BAR */
  .recent-projects-bar {
    background: linear-gradient(180deg, #0b172a 0%, #070e1c 100%);
    border: 1px solid #1a355d;
    border-radius: 10px;
    padding: 10px 16px;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    max-width: 1200px;
    width: 100%;
    margin: 0 auto;
    box-sizing: border-box;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.4);
  }

  .recent-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .recent-chips-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 10px;
  }

  .recent-chip {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #091322;
    border: 1px solid #1e3b68;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .recent-chip:hover {
    border-color: #38bdf8;
    background: #102444;
  }

  .chip-status {
    font-size: 9px;
    font-weight: 700;
    color: #10b981;
  }

  .chip-name {
    font-size: 10px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .chip-meta {
    font-size: 9px;
    color: #94a3b8;
  }

  .workflow-breadcrumbs {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    color: #64748b;
  }

  .crumb-text {
    font-weight: 700;
    color: #94a3b8;
  }

  .crumb.active {
    color: #38bdf8;
    font-weight: 700;
  }

  .crumb-arrow {
    color: #1a355d;
  }

  .club-select-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .club-select {
    background: #060e1d;
    border: 1px solid #1a355d;
    color: #93c5fd;
    font-size: 9.5px;
    font-weight: 700;
    padding: 4px 6px;
    border-radius: 5px;
    outline: none;
    min-width: 0;
  }
</style>

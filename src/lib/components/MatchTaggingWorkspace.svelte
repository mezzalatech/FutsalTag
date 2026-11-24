<script lang="ts">
  import { onMount } from 'svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type {
    VideoTagEvent,
    TagCategory,
    TagOutcome,
    CourtZone,
    TagRating,
  } from '$lib/types';
  import StatsMatrixModal from '$lib/components/StatsMatrixModal.svelte';
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Volume2,
    Scissors,
    Clock,
    Tag,
    Sliders,
    Search,
    Table,
    Sparkles,
    Trash2,
    ArrowRight,
    ArrowLeft,
    CheckCircle,
    User,
    Check,
    ListOrdered,
  } from 'lucide-svelte';

  // --- STATE ---
  let videoEl = $state<HTMLVideoElement | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(120);
  let playbackRate = $state(1.0);
  let volume = $state(1.0);

  // Smart Pre-roll & Post-roll
  let leadTimeSeconds = $state(5.0);
  let lagTimeSeconds = $state(3.0);

  // Manual In/Out Points
  let inPoint = $state<number | null>(null);
  let outPoint = $state<number | null>(null);
  let activeLoopClip = $state<VideoTagEvent | null>(null);

  // Filters & Search
  let searchQuery = $state('');
  let filterCategory = $state('ALL');
  let filterPlayer = $state('ALL');
  let showStatsMatrix = $state(false);

  // Selected Clip for Quick Inline Edit
  let editingTag = $state<VideoTagEvent | null>(null);

  const PLAYER_LABELS = ['#1 Kiper', '#4 Anchor', '#7 Flank Kiri', '#11 Flank Kanan', '#9 Pivot', 'Tim Lawan'];
  const OUTCOME_LABELS: TagOutcome[] = ['Gol / Sukses', 'Terblok / Diselamatkan', 'Keluar / Gagal', 'Turnover'];
  const ZONE_LABELS: CourtZone[] = ['Area Penalti Lawan', 'Flank Kiri', 'Flank Kanan', 'Area Tengah', 'Area Bertahan Sendiri'];
  const RATING_LABELS: TagRating[] = ['⭐⭐⭐ Bagus', '⚠️ Evaluasi', '❌ Kesalahan Fatal'];

  // FUTSAL CODE BUTTONS CONFIGURATION
  const CODE_BUTTONS: {
    category: TagCategory;
    label: string;
    hotkey: string;
    lead: number;
    lag: number;
    color: string;
    icon: string;
  }[] = [
    { category: 'Goal', label: 'Gol', hotkey: '1', lead: 6.0, lag: 3.0, color: '#10b981', icon: '⚽' },
    { category: 'Shot on Target', label: 'Tembakan On-Target', hotkey: '2', lead: 4.0, lag: 3.0, color: '#38bdf8', icon: '🎯' },
    { category: 'Pressing High', label: 'High Pressing', hotkey: '3', lead: 5.0, lag: 3.0, color: '#f59e0b', icon: '🔥' },
    { category: 'Transition Attack', label: 'Counter Attack', hotkey: '4', lead: 5.0, lag: 4.0, color: '#6366f1', icon: '⚡' },
    { category: 'Kick-in Set Piece', label: 'Kick-in Set Piece', hotkey: '5', lead: 4.0, lag: 4.0, color: '#ec4899', icon: '📐' },
    { category: 'Corner Set Piece', label: 'Corner Kick', hotkey: '6', lead: 4.0, lag: 4.0, color: '#8b5cf6', icon: '🚩' },
    { category: 'Goalkeeper Save', label: 'Penyelamatan GK', hotkey: '7', lead: 3.0, lag: 3.0, color: '#06b6d4', icon: '🧤' },
    { category: 'Transition Defense', label: 'Transisi Bertahan', hotkey: '8', lead: 4.0, lag: 3.0, color: '#ef4444', icon: '🛑' },
  ];

  onMount(() => {
    // Keyboard shortcuts
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'TEXTAREA') {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'i' || e.key === 'I') {
        setInPoint();
      } else if (e.key === 'o' || e.key === 'O') {
        setOutPoint();
      } else if (e.key === 'ArrowLeft') {
        stepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        stepFrame(1);
      } else {
        // Match code buttons hotkeys 1-8
        const matched = CODE_BUTTONS.find((b) => b.hotkey === e.key);
        if (matched) {
          triggerSmartTag(matched.category, matched.label, matched.color, matched.lead, matched.lag);
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function togglePlay() {
    if (!videoEl) return;
    if (isPlaying) {
      videoEl.pause();
    } else {
      videoEl.play();
    }
    isPlaying = !isPlaying;
  }

  function handleTimeUpdate() {
    if (!videoEl) return;
    currentTime = videoEl.currentTime;

    // Loop active clip if selected
    if (activeLoopClip) {
      if (currentTime >= activeLoopClip.endTime) {
        videoEl.currentTime = activeLoopClip.startTime;
      }
    }
  }

  function handleLoadedMetadata() {
    if (!videoEl) return;
    duration = videoEl.duration || 120;
    projectStore.duration = duration;
  }

  function seekTo(seconds: number) {
    if (!videoEl) return;
    videoEl.currentTime = Math.max(0, Math.min(seconds, duration));
    currentTime = videoEl.currentTime;
  }

  function stepFrame(step: number) {
    if (!videoEl) return;
    videoEl.pause();
    isPlaying = false;
    const fps = 30;
    videoEl.currentTime = Math.max(0, Math.min(videoEl.currentTime + step / fps, duration));
    currentTime = videoEl.currentTime;
  }

  function setInPoint() {
    inPoint = currentTime;
  }

  function setOutPoint() {
    outPoint = currentTime;
    if (inPoint !== null && outPoint > inPoint) {
      // Manual cut
      const newTag: VideoTagEvent = {
        id: `tag-${Date.now()}`,
        title: `Klip Manual ${formatTime(inPoint)} - ${formatTime(outPoint)}`,
        category: 'Transition Attack',
        startTime: inPoint,
        endTime: outPoint,
        color: '#38bdf8',
        playerLabel: '#9 Pivot',
        outcomeLabel: 'Gol / Sukses',
        rating: '⭐⭐⭐ Bagus',
        pauseDuration: 3.0,
        drawings: [],
      };
      projectStore.addTag(newTag);
      inPoint = null;
      outPoint = null;
    }
  }

  function triggerSmartTag(
    category: TagCategory,
    label: string,
    color: string,
    lead = leadTimeSeconds,
    lag = lagTimeSeconds
  ) {
    const start = Math.max(0, currentTime - lead);
    const end = Math.min(duration, currentTime + lag);

    const newTag: VideoTagEvent = {
      id: `tag-${Date.now()}`,
      title: `${label} (${formatTime(start)} - ${formatTime(end)})`,
      category,
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      color,
      playerLabel: '#9 Pivot',
      outcomeLabel: 'Gol / Sukses',
      rating: '⭐⭐⭐ Bagus',
      pauseDuration: 3.0,
      drawings: [],
    };

    projectStore.addTag(newTag);
  }

  function playClipLoop(tag: VideoTagEvent) {
    if (!videoEl) return;
    activeLoopClip = tag;
    videoEl.currentTime = tag.startTime;
    videoEl.play();
    isPlaying = true;
  }

  function stopClipLoop() {
    activeLoopClip = null;
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  }

  // Filtered Tags
  let filteredTags = $derived(
    projectStore.tags.filter((t) => {
      const matchSearch =
        searchQuery === '' ||
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.notes && t.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.playerLabel && t.playerLabel.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchCat = filterCategory === 'ALL' || t.category === filterCategory;
      const matchPlayer = filterPlayer === 'ALL' || t.playerLabel === filterPlayer;

      return matchSearch && matchCat && matchPlayer;
    })
  );
</script>

<div class="tagging-workspace">
  <!-- TOP SUB-HEADER -->
  <header class="tagging-header">
    <div class="header-left">
      <button class="btn-ghost" onclick={() => projectStore.setStage('hub')}>
        <ArrowLeft size={16} />
        <span>Ganti Video / Hub</span>
      </button>
      <div class="match-info">
        <span class="match-title">{projectStore.videoTitle}</span>
        <span class="tag-counter-badge">{projectStore.tags.length} Klip Ditag</span>
      </div>
    </div>

    <div class="header-right">
      <button class="btn-stats" onclick={() => (showStatsMatrix = true)}>
        <Table size={14} />
        <span>Matriks Silang Statistik</span>
      </button>
      <button class="btn-next-step" onclick={() => projectStore.setStage('playlist_export')}>
        <span>Ke Playlist & Ekspor</span>
        <ArrowRight size={16} />
      </button>
    </div>
  </header>

  <!-- MAIN BODY: 2 COLUMNS (LEFT: VIDEO & TIMELINE, RIGHT: CODE BUTTONS & ACTION LIST) -->
  <div class="workspace-grid">
    <!-- LEFT COLUMN: VIDEO PLAYER & MULTI-TRACK TIMELINE -->
    <div class="player-column">
      <div class="video-container">
        {#if projectStore.videoSrc}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoEl}
            src={projectStore.videoSrc}
            class="match-video"
            ontimeupdate={handleTimeUpdate}
            onloadedmetadata={handleLoadedMetadata}
            onclick={togglePlay}
          ></video>
        {:else}
          <div class="empty-video-placeholder">
            <div class="placeholder-icon">⚽</div>
            <h3>Mode Sampel Video Pertandingan</h3>
            <p>Video demo futsal simulasi aktif. Anda dapat menguji tombol tagging, playback, dan pemotongan klip.</p>
          </div>
        {/if}

        <!-- VIDEO OVERLAY CONTROLS -->
        <div class="video-overlay-bar">
          <div class="overlay-left">
            <button class="btn-overlay-play" onclick={togglePlay}>
              {#if isPlaying}
                <Pause size={18} />
              {:else}
                <Play size={18} />
              {/if}
            </button>
            <div class="time-display">
              <span class="curr-time">{formatTime(currentTime)}</span>
              <span class="divider">/</span>
              <span class="dur-time">{formatTime(duration)}</span>
            </div>
          </div>

          <div class="overlay-center">
            <button class="btn-ctrl-sm" onclick={() => stepFrame(-1)} title="Mundur 1 Frame">
              <SkipBack size={14} />
            </button>
            <button class="btn-ctrl-sm" onclick={() => seekTo(currentTime - 5)} title="Mundur 5 Detik">
              -5s
            </button>
            <button class="btn-ctrl-sm" onclick={() => seekTo(currentTime + 5)} title="Maju 5 Detik">
              +5s
            </button>
            <button class="btn-ctrl-sm" onclick={() => stepFrame(1)} title="Maju 1 Frame">
              <SkipForward size={14} />
            </button>
          </div>

          <div class="overlay-right">
            <!-- Manual Cut In/Out -->
            <button
              class="btn-inout"
              class:active={inPoint !== null}
              onclick={setInPoint}
              title="Set In-Point (I)"
            >
              [ IN {inPoint !== null ? formatTime(inPoint) : ''}
            </button>
            <button
              class="btn-inout"
              onclick={setOutPoint}
              title="Set Out-Point & Potong (O)"
            >
              OUT ]
            </button>

            <!-- Speed selector -->
            <select class="speed-select" bind:value={playbackRate} onchange={() => { if (videoEl) videoEl.playbackRate = playbackRate; }}>
              <option value={0.5}>0.5x</option>
              <option value={1.0}>1.0x</option>
              <option value={1.5}>1.5x</option>
              <option value={2.0}>2.0x</option>
            </select>
          </div>
        </div>
      </div>

      <!-- TIMELINE MULTI-TRACK TRACKS -->
      <div class="timeline-tracks-container">
        <!-- SCRUBBER HEADER -->
        <div
          class="timeline-scrubber"
          onclick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            seekTo(clickPos * duration);
          }}
        >
          <!-- Playhead needle -->
          <div
            class="playhead-needle"
            style="left: {(currentTime / Math.max(duration, 1)) * 100}%"
          >
            <div class="needle-tip"></div>
          </div>

          <!-- In-Point marker -->
          {#if inPoint !== null}
            <div class="in-marker" style="left: {(inPoint / duration) * 100}%"></div>
          {/if}

          <!-- Visual Tag Blocks -->
          {#each projectStore.tags as tag}
            <div
              class="tag-block"
              class:selected={activeLoopClip?.id === tag.id}
              style="left: {(tag.startTime / duration) * 100}%; width: {((tag.endTime - tag.startTime) / duration) * 100}%; background-color: {tag.color}"
              onclick={(e) => {
                e.stopPropagation();
                playClipLoop(tag);
              }}
              title="{tag.title} ({formatTime(tag.startTime)} - {formatTime(tag.endTime)})"
            >
              <span class="block-label">{tag.category}</span>
            </div>
          {/each}
        </div>

        <div class="timeline-ticks">
          <span>00:00</span>
          <span>{formatTime(duration * 0.25)}</span>
          <span>{formatTime(duration * 0.5)}</span>
          <span>{formatTime(duration * 0.75)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>
    </div>

    <!-- RIGHT COLUMN: FUTSAL CODE BUTTONS & ACTION LIST -->
    <div class="panel-column">
      <!-- PANEL A: FUTSAL CODE BUTTONS (QUICK TAGGING) -->
      <div class="code-buttons-panel">
        <div class="panel-header">
          <div class="panel-title">
            <Tag size={14} />
            <span>TOMBOL AKSI CEPAT (FUTSAL CODE BUTTONS)</span>
          </div>
          <div class="pre-roll-config">
            <span class="pre-roll-label">Pre {leadTimeSeconds}s / Post {lagTimeSeconds}s</span>
          </div>
        </div>

        <div class="buttons-grid">
          {#each CODE_BUTTONS as btn}
            <button
              class="code-btn"
              style="--btn-color: {btn.color}"
              onclick={() => triggerSmartTag(btn.category, btn.label, btn.color, btn.lead, btn.lag)}
              title="Hotkey: [{btn.hotkey}]"
            >
              <span class="btn-hotkey">{btn.hotkey}</span>
              <span class="btn-icon">{btn.icon}</span>
              <span class="btn-text">{btn.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- PANEL B: ACTION LIST (DAFTAR KLIP) -->
      <div class="actions-list-panel">
        <div class="list-header">
          <div class="list-title">
            <ListOrdered size={14} />
            <span>Daftar Klip Aksi ({filteredTags.length})</span>
          </div>

          <!-- Search & Filter -->
          <div class="list-filter-row">
            <div class="search-wrap">
              <Search size={12} />
              <input
                type="text"
                placeholder="Cari klip / pemain..."
                bind:value={searchQuery}
                class="search-input"
              />
            </div>
            <select bind:value={filterCategory} class="filter-select">
              <option value="ALL">Semua Aksi</option>
              {#each CODE_BUTTONS as b}
                <option value={b.category}>{b.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- LIST ITEMS -->
        <div class="list-items-scroll">
          {#if filteredTags.length === 0}
            <div class="empty-list-futsal">
              <div class="empty-icon">✂️</div>
              <h4 class="empty-title">Video Siap Ditag & Dipotong Momen</h4>
              <p class="empty-guide">
                1. Putar video pertandingan (tekan <strong>Spasi</strong>).<br />
                2. Saat momen terjadi, tekan <strong>Tombol Aksi Cepat [1–8]</strong> di atas.<br />
                3. Klip otomatis terpotong rapi mundur 5 detik & maju 3 detik.<br />
                4. Klik tombol <strong>Gambar (Draw)</strong> pada klip yang tercipta untuk menggambar telestrasi.
              </p>
            </div>
          {:else}
            {#each filteredTags as tag}
              <div
                class="action-item-card"
                class:active-loop={activeLoopClip?.id === tag.id}
              >
                <!-- TOP CARD BAR: TIME & BADGES -->
                <div class="card-top-bar">
                  <div class="badge-category" style="background-color: {tag.color}">
                    {tag.category}
                  </div>
                  <span class="card-time-range">
                    {formatTime(tag.startTime)} - {formatTime(tag.endTime)}
                  </span>
                  <span class="card-dur">
                    ({(tag.endTime - tag.startTime).toFixed(1)}s)
                  </span>
                </div>

                <!-- TITLE & LABELS -->
                <div class="card-content">
                  <div class="clip-name">{tag.title}</div>
                  <div class="card-tags-row">
                    {#if tag.playerLabel}
                      <span class="tag-pill tag-player">{tag.playerLabel}</span>
                    {/if}
                    {#if tag.outcomeLabel}
                      <span class="tag-pill tag-outcome">{tag.outcomeLabel}</span>
                    {/if}
                    {#if tag.rating}
                      <span class="tag-pill tag-rating">{tag.rating}</span>
                    {/if}
                    {#if tag.drawings && tag.drawings.length > 0}
                      <span class="tag-pill tag-has-drawings">🎨 {tag.drawings.length} Gambar</span>
                    {/if}
                  </div>
                </div>

                <!-- CARD ACTIONS BAR -->
                <div class="card-actions-row">
                  <!-- PRIMARY: DRAW / TELESTRATE -->
                  <button
                    class="btn-card-draw"
                    onclick={() => projectStore.openClipInTelestrator(tag)}
                  >
                    <Sparkles size={13} />
                    <span>Gambar (Draw)</span>
                  </button>

                  <!-- PLAY / LOOP -->
                  <button
                    class="btn-card-play"
                    onclick={() => {
                      if (activeLoopClip?.id === tag.id) {
                        stopClipLoop();
                      } else {
                        playClipLoop(tag);
                      }
                    }}
                  >
                    {#if activeLoopClip?.id === tag.id}
                      <Pause size={12} />
                      <span>Stop</span>
                    {:else}
                      <Play size={12} />
                      <span>Putar</span>
                    {/if}
                  </button>

                  <!-- DELETE -->
                  <button
                    class="btn-card-del"
                    onclick={() => projectStore.deleteTag(tag.id)}
                    title="Hapus klip"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            {/each}
          {/if}
        </div>
      </div>
    </div>
  </div>

  <!-- STATS MATRIX MODAL -->
  {#if showStatsMatrix}
    <StatsMatrixModal
      isOpen={showStatsMatrix}
      onClose={() => (showStatsMatrix = false)}
      tags={projectStore.tags}
      onPlayTag={(tag) => {
        showStatsMatrix = false;
        playClipLoop(tag);
      }}
    />
  {/if}
</div>

<style>
  .tagging-workspace {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #0b0f19;
    color: #f8fafc;
    overflow: hidden;
  }

  /* HEADER */
  .tagging-header {
    height: 48px;
    background-color: #0f172a;
    border-bottom: 1px solid #1e293b;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .btn-ghost {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-ghost:hover {
    color: #f8fafc;
    border-color: #64748b;
  }

  .match-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .match-title {
    font-size: 13px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .tag-counter-badge {
    font-size: 10px;
    background-color: #1e293b;
    color: #38bdf8;
    padding: 2px 8px;
    border-radius: 999px;
    font-weight: 600;
    border: 1px solid #334155;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-stats {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #38bdf8;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-stats:hover {
    background-color: #334155;
  }

  .btn-next-step {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 14px;
    border-radius: 6px;
    border: none;
    cursor: pointer;
  }

  .btn-next-step:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
  }

  /* WORKSPACE GRID */
  .workspace-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 420px;
    gap: 1px;
    background-color: #1e293b;
    overflow: hidden;
  }

  /* PLAYER COLUMN */
  .player-column {
    display: flex;
    flex-direction: column;
    background-color: #0b0f19;
    overflow: hidden;
  }

  .video-container {
    flex: 1;
    position: relative;
    background-color: #000000;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .match-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .empty-video-placeholder {
    text-align: center;
    padding: 24px;
    color: #64748b;
  }

  .placeholder-icon {
    font-size: 40px;
    margin-bottom: 8px;
  }

  .empty-video-placeholder h3 {
    font-size: 16px;
    color: #e2e8f0;
    margin: 0 0 4px 0;
  }

  .empty-video-placeholder p {
    font-size: 12px;
    max-width: 400px;
    margin: 0 auto;
    color: #94a3b8;
  }

  /* OVERLAY BAR */
  .video-overlay-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(11, 15, 25, 0.95));
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 16px;
    z-index: 10;
  }

  .overlay-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-overlay-play {
    background-color: #38bdf8;
    color: #0f172a;
    border: none;
    width: 34px;
    height: 34px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .btn-overlay-play:hover {
    transform: scale(1.05);
  }

  .time-display {
    font-family: monospace;
    font-size: 12px;
  }

  .curr-time {
    color: #38bdf8;
    font-weight: 700;
  }

  .divider {
    color: #475569;
    margin: 0 4px;
  }

  .dur-time {
    color: #94a3b8;
  }

  .overlay-center {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-ctrl-sm {
    background-color: rgba(30, 41, 59, 0.8);
    border: 1px solid #334155;
    color: #cbd5e1;
    font-size: 11px;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-ctrl-sm:hover {
    background-color: #334155;
    color: #ffffff;
  }

  .overlay-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-inout {
    background-color: rgba(30, 41, 59, 0.8);
    border: 1px solid #475569;
    color: #e2e8f0;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-inout.active {
    background-color: #0284c7;
    border-color: #38bdf8;
  }

  .speed-select {
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #f8fafc;
    font-size: 10px;
    padding: 3px 6px;
    border-radius: 4px;
  }

  /* TIMELINE TRACKS */
  .timeline-tracks-container {
    height: 64px;
    background-color: #0f172a;
    border-top: 1px solid #1e293b;
    display: flex;
    flex-direction: column;
    padding: 6px 16px;
    box-sizing: border-box;
  }

  .timeline-scrubber {
    flex: 1;
    position: relative;
    background-color: #1e293b;
    border-radius: 4px;
    cursor: pointer;
    overflow: hidden;
  }

  .playhead-needle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: #38bdf8;
    z-index: 5;
    pointer-events: none;
  }

  .needle-tip {
    width: 8px;
    height: 8px;
    background-color: #38bdf8;
    border-radius: 50%;
    margin-left: -3px;
    margin-top: -2px;
  }

  .in-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: #10b981;
    z-index: 4;
  }

  .tag-block {
    position: absolute;
    top: 2px;
    bottom: 2px;
    border-radius: 3px;
    opacity: 0.85;
    display: flex;
    align-items: center;
    padding: 0 4px;
    overflow: hidden;
    cursor: pointer;
    transition: opacity 0.15s;
    border: 1px solid rgba(255, 255, 255, 0.2);
  }

  .tag-block:hover {
    opacity: 1;
    filter: brightness(1.2);
  }

  .tag-block.selected {
    outline: 2px solid #ffffff;
    opacity: 1;
  }

  .block-label {
    font-size: 9px;
    font-weight: 700;
    color: #ffffff;
    white-space: nowrap;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.8);
  }

  .timeline-ticks {
    display: flex;
    justify-content: space-between;
    font-size: 9px;
    font-family: monospace;
    color: #64748b;
    margin-top: 2px;
  }

  /* PANEL COLUMN */
  .panel-column {
    display: flex;
    flex-direction: column;
    background-color: #0b0f19;
    overflow: hidden;
  }

  /* CODE BUTTONS PANEL */
  .code-buttons-panel {
    background-color: #0f172a;
    border-bottom: 1px solid #1e293b;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .panel-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #94a3b8;
  }

  .pre-roll-config {
    font-size: 10px;
    color: #64748b;
  }

  .buttons-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .code-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #1e293b;
    border: 1px solid #334155;
    border-left: 4px solid var(--btn-color);
    padding: 8px 10px;
    border-radius: 6px;
    color: #f8fafc;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .code-btn:hover {
    background-color: #273549;
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  .btn-hotkey {
    font-size: 9px;
    font-weight: 800;
    background-color: #0f172a;
    color: #38bdf8;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid #334155;
  }

  .btn-icon {
    font-size: 13px;
  }

  .btn-text {
    font-size: 11px;
    font-weight: 600;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* ACTIONS LIST PANEL */
  .actions-list-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    padding: 12px;
  }

  .list-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
  }

  .list-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #f8fafc;
  }

  .list-filter-row {
    display: flex;
    gap: 6px;
  }

  .search-wrap {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #1e293b;
    border: 1px solid #334155;
    padding: 4px 8px;
    border-radius: 6px;
    color: #94a3b8;
  }

  .search-input {
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 11px;
    width: 100%;
  }

  .search-input:focus {
    outline: none;
  }

  .filter-select {
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #f8fafc;
    font-size: 11px;
    border-radius: 6px;
    padding: 4px 6px;
  }

  /* SCROLL LIST */
  .list-items-scroll {
    flex: 1;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 8px;
    padding-right: 4px;
  }

  .empty-list-futsal {
    text-align: center;
    padding: 24px 14px;
    background-color: #0f172a;
    border: 1px dashed #334155;
    border-radius: 8px;
    margin: 8px 0;
  }

  .empty-icon {
    font-size: 24px;
    margin-bottom: 6px;
  }

  .empty-title {
    font-size: 12px;
    font-weight: 700;
    color: #38bdf8;
    margin: 0 0 6px 0;
  }

  .empty-guide {
    font-size: 10px;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0;
    text-align: left;
    background-color: #1e293b;
    padding: 8px 10px;
    border-radius: 6px;
  }

  .empty-guide strong {
    color: #f8fafc;
  }

  .action-item-card {
    background-color: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.15s;
  }

  .action-item-card:hover {
    border-color: #334155;
    background-color: #162032;
  }

  .action-item-card.active-loop {
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
  }

  .card-top-bar {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .badge-category {
    font-size: 9px;
    font-weight: 800;
    color: #ffffff;
    padding: 1px 6px;
    border-radius: 3px;
  }

  .card-time-range {
    font-family: monospace;
    font-size: 10px;
    color: #38bdf8;
    font-weight: 600;
  }

  .card-dur {
    font-size: 9px;
    color: #64748b;
  }

  .clip-name {
    font-size: 12px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .card-tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag-pill {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
  }

  .tag-player {
    background-color: #1e293b;
    color: #38bdf8;
    border: 1px solid #334155;
  }

  .tag-outcome {
    background-color: #064e3b;
    color: #34d399;
  }

  .tag-rating {
    background-color: #451a03;
    color: #fbbf24;
  }

  .tag-has-drawings {
    background-color: #4c1d95;
    color: #c084fc;
  }

  /* CARD ACTIONS */
  .card-actions-row {
    display: flex;
    align-items: center;
    gap: 6px;
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid #1e293b;
  }

  .btn-card-draw {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 10px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-card-draw:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
  }

  .btn-card-play {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 600;
    padding: 5px 8px;
    border-radius: 5px;
    cursor: pointer;
  }

  .btn-card-play:hover {
    background-color: #334155;
    color: #ffffff;
  }

  .btn-card-del {
    background-color: transparent;
    border: 1px solid transparent;
    color: #64748b;
    padding: 5px 6px;
    border-radius: 5px;
    cursor: pointer;
  }

  .btn-card-del:hover {
    color: #ef4444;
    background-color: rgba(239, 68, 68, 0.1);
  }
</style>

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
  import TagLabelEditorModal from '$lib/components/TagLabelEditorModal.svelte';
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
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
    Settings,
    Edit3,
    Plus,
  } from 'lucide-svelte';

  // --- REFS & STATE ---
  let videoEl = $state<HTMLVideoElement | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(120);
  let playbackRate = $state(1.0);

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

  // Modals State
  let showStatsMatrix = $state(false);
  let showTagLabelEditor = $state(false);
  let activeEditingTag = $state<VideoTagEvent | null>(null);

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
    { category: 'Kick-in Set Piece', label: 'Kick-In Set Piece', hotkey: '5', lead: 4.0, lag: 4.0, color: '#ec4899', icon: '📐' },
    { category: 'Corner Set Piece', label: 'Corner Kick', hotkey: '6', lead: 4.0, lag: 4.0, color: '#8b5cf6', icon: '🚩' },
    { category: 'Goalkeeper Save', label: 'Save Kiper', hotkey: '7', lead: 3.0, lag: 3.0, color: '#06b6d4', icon: '🧤' },
    { category: 'Transition Defense', label: 'Transisi Bertahan', hotkey: '8', lead: 4.0, lag: 3.0, color: '#ef4444', icon: '🛑' },
  ];

  onMount(() => {
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
      const newTag: VideoTagEvent = {
        id: `tag-${Date.now()}`,
        title: `Klip Manual (${formatTime(inPoint)} - ${formatTime(outPoint)})`,
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

  function openTagEditor(tag: VideoTagEvent) {
    activeEditingTag = tag;
    showTagLabelEditor = true;
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
  <!-- TOP SUB-HEADER (DEEP SAPPHIRE BLUE) -->
  <header class="tagging-header">
    <div class="header-left">
      <button class="btn-ghost-blue" onclick={() => projectStore.setStage('hub')}>
        <ArrowLeft size={15} />
        <span>Hub Proyek</span>
      </button>

      <div class="match-info-pill">
        <span class="match-pulse-dot"></span>
        <span class="match-title">{projectStore.videoTitle}</span>
        <span class="tag-counter-badge">{projectStore.tags.length} Klip</span>
      </div>
    </div>

    <div class="header-right">
      <!-- DEDICATED TAG & LABEL FORM MENU BUTTON -->
      <button
        class="btn-label-menu"
        onclick={() => {
          if (projectStore.tags.length > 0) {
            openTagEditor(projectStore.tags[0]);
          } else {
            // Create a fresh tag at current time and open editor
            const freshTag: VideoTagEvent = {
              id: `tag-${Date.now()}`,
              title: `Aksi Futsal (${formatTime(currentTime)} - ${formatTime(currentTime + 5)})`,
              category: 'Goal',
              startTime: Math.max(0, currentTime - 3),
              endTime: Math.min(duration, currentTime + 3),
              color: '#10b981',
              playerLabel: '#9 Pivot',
              outcomeLabel: 'Gol / Sukses',
              zoneLabel: 'Area Penalti Lawan',
              rating: '⭐⭐⭐ Bagus',
              pauseDuration: 3.0,
              drawings: [],
            };
            projectStore.addTag(freshTag);
            openTagEditor(freshTag);
          }
        }}
        title="Buka Form Menu Khusus Tagging & Labeling"
      >
        <Tag size={14} />
        <span>Menu Tag & Label</span>
      </button>

      <!-- STATS MATRIX -->
      <button class="btn-stats-blue" onclick={() => (showStatsMatrix = true)}>
        <Table size={14} />
        <span>Matriks Silang</span>
      </button>

      <!-- NEXT STEP -->
      <button class="btn-next-step" onclick={() => projectStore.setStage('playlist_export')}>
        <span>Ke Playlist & Ekspor</span>
        <ArrowRight size={15} />
      </button>
    </div>
  </header>

  <!-- MAIN BODY: 2 COLUMNS (LEFT: VIDEO & SCRUBBER, RIGHT: CODE BUTTONS & ACTION LIST) -->
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
            <div class="futsal-glow-orb">⚽</div>
            <h3 class="placeholder-title">Layar Video Pertandingan Futsal</h3>
            <p class="placeholder-desc">
              Pilih video dari Hub Proyek atau seret file MP4 pertandingan Anda untuk memulai pemotongan momen secara akurat.
            </p>
          </div>
        {/if}

        <!-- VIDEO OVERLAY BAR (GLASSMORPHISM SAPPHIRE) -->
        <div class="video-overlay-bar">
          <div class="overlay-left">
            <button class="btn-overlay-play" onclick={togglePlay} title="Play/Pause (Spasi)">
              {#if isPlaying}
                <Pause size={18} />
              {:else}
                <Play size={18} />
              {/if}
            </button>
            <div class="time-display">
              <span class="curr-time">{formatTime(currentTime)}</span>
              <span class="time-sep">/</span>
              <span class="dur-time">{formatTime(duration)}</span>
            </div>
          </div>

          <div class="overlay-center">
            <button class="btn-ctrl-sm" onclick={() => stepFrame(-1)} title="Mundur 1 Frame">
              <SkipBack size={13} />
            </button>
            <button class="btn-ctrl-sm" onclick={() => seekTo(currentTime - 5)} title="Mundur 5 Detik">
              -5s
            </button>
            <button class="btn-ctrl-sm" onclick={() => seekTo(currentTime + 5)} title="Maju 5 Detik">
              +5s
            </button>
            <button class="btn-ctrl-sm" onclick={() => stepFrame(1)} title="Maju 1 Frame">
              <SkipForward size={13} />
            </button>
          </div>

          <div class="overlay-right">
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

            <select
              class="speed-select-blue"
              bind:value={playbackRate}
              onchange={() => { if (videoEl) videoEl.playbackRate = playbackRate; }}
            >
              <option value={0.5}>0.5x Slow</option>
              <option value={1.0}>1.0x Normal</option>
              <option value={1.5}>1.5x</option>
              <option value={2.0}>2.0x Fast</option>
            </select>
          </div>
        </div>
      </div>

      <!-- TIMELINE MULTI-TRACK (DEEP SAPPHIRE) -->
      <div class="timeline-tracks-container">
        <div
          class="timeline-scrubber"
          onclick={(e) => {
            const rect = e.currentTarget.getBoundingClientRect();
            const clickPos = (e.clientX - rect.left) / rect.width;
            seekTo(clickPos * duration);
          }}
          role="slider"
          aria-valuenow={currentTime}
          tabindex="0"
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
              role="button"
              tabindex="0"
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

    <!-- RIGHT COLUMN: FUTSAL CODE BUTTONS & ACTION LIST (BLUE COMBINATION) -->
    <div class="panel-column">
      <!-- PANEL A: FUTSAL CODE BUTTONS (QUICK ACTION TAGGING) -->
      <div class="code-buttons-panel">
        <div class="panel-header">
          <div class="panel-title">
            <Tag size={13} class="text-sky-400" />
            <span>TOMBOL AKSI CEPAT (FUTSAL CODE BUTTONS)</span>
          </div>
          <div class="pre-roll-pill">
            <span>Pre {leadTimeSeconds}s / Post {lagTimeSeconds}s</span>
          </div>
        </div>

        <div class="buttons-grid">
          {#each CODE_BUTTONS as btn}
            <button
              class="code-btn"
              style="--btn-color: {btn.color}"
              onclick={() => triggerSmartTag(btn.category, btn.label, btn.color, btn.lead, btn.lag)}
              title="Hotkey: [{btn.hotkey}] - Potong otomatis mundur {btn.lead}s & maju {btn.lag}s"
            >
              <span class="btn-hotkey">{btn.hotkey}</span>
              <span class="btn-icon">{btn.icon}</span>
              <span class="btn-text">{btn.label}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- PANEL B: ACTION LIST (DAFTAR KLIP AKSI) -->
      <div class="actions-list-panel">
        <div class="list-header">
          <div class="list-title-row">
            <div class="list-title">
              <ListOrdered size={14} class="text-sky-400" />
              <span>Daftar Klip Aksi ({filteredTags.length})</span>
            </div>
            <span class="sub-hint">Klik "Tag & Label" untuk detail taktis</span>
          </div>

          <!-- Search & Filter Bar -->
          <div class="list-filter-row">
            <div class="search-wrap-blue">
              <Search size={12} />
              <input
                type="text"
                placeholder="Cari klip, pemain, atau catatan..."
                bind:value={searchQuery}
                class="search-input-blue"
              />
            </div>
            <select bind:value={filterCategory} class="filter-select-blue">
              <option value="ALL">Semua Aksi</option>
              {#each CODE_BUTTONS as b}
                <option value={b.category}>{b.label}</option>
              {/each}
            </select>
          </div>
        </div>

        <!-- LIST ITEMS SCROLL -->
        <div class="list-items-scroll">
          {#if filteredTags.length === 0}
            <div class="empty-list-futsal">
              <div class="empty-icon">✂️</div>
              <h4 class="empty-title">Belum Ada Klip yang Dipotong</h4>
              <p class="empty-guide">
                1. Putar video pertandingan (tekan <strong>Spasi</strong>).<br />
                2. Saat momen terjadi, tekan <strong>Tombol Aksi Cepat [1–8]</strong> di atas.<br />
                3. Klip otomatis terpotong rapi dengan durasi pre/post roll.<br />
                4. Klik tombol <strong>Tag & Label</strong> untuk melengkapi pemain & evaluasi.
              </p>
            </div>
          {:else}
            {#each filteredTags as tag}
              <div
                class="action-item-card"
                class:active-loop={activeLoopClip?.id === tag.id}
                ondblclick={() => openTagEditor(tag)}
              >
                <!-- TOP CARD BAR: TIME & BADGES -->
                <div class="card-top-bar">
                  <span class="badge-category" style="background-color: {tag.color}">
                    {tag.category}
                  </span>
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
                      <span class="tag-pill tag-player">
                        <User size={10} class="inline mr-0.5" />
                        {tag.playerLabel}
                      </span>
                    {/if}
                    {#if tag.outcomeLabel}
                      <span class="tag-pill tag-outcome">{tag.outcomeLabel}</span>
                    {/if}
                    {#if tag.zoneLabel}
                      <span class="tag-pill tag-zone">{tag.zoneLabel}</span>
                    {/if}
                    {#if tag.rating}
                      <span class="tag-pill tag-rating">{tag.rating}</span>
                    {/if}
                    {#if tag.drawings && tag.drawings.length > 0}
                      <span class="tag-pill tag-has-drawings">🎨 {tag.drawings.length} Grafis</span>
                    {/if}
                  </div>
                </div>

                <!-- CARD ACTIONS BAR -->
                <div class="card-actions-row">
                  <!-- PRIMARY: DRAW / TELESTRATE -->
                  <button
                    class="btn-card-draw"
                    onclick={() => projectStore.openClipInTelestrator(tag)}
                    title="Buka klip ini di Studio Telestrasi"
                  >
                    <Sparkles size={13} />
                    <span>Gambar (Draw)</span>
                  </button>

                  <!-- DEDICATED TAG & LABEL INSPECTOR BUTTON -->
                  <button
                    class="btn-card-label"
                    onclick={() => openTagEditor(tag)}
                    title="Buka form tagging pemain & label taktis klip ini"
                  >
                    <Edit3 size={12} />
                    <span>Tag & Label</span>
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
                    title="Loop putar klip ini"
                  >
                    {#if activeLoopClip?.id === tag.id}
                      <Pause size={12} />
                    {:else}
                      <Play size={12} />
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

  <!-- DEDICATED TAG & LABEL MODAL -->
  {#if activeEditingTag && showTagLabelEditor}
    <TagLabelEditorModal
      tag={activeEditingTag}
      isOpen={showTagLabelEditor}
      onClose={() => (showTagLabelEditor = false)}
      onSave={(updated) => {
        projectStore.updateTag(updated);
        showTagLabelEditor = false;
      }}
      onDelete={(id) => {
        projectStore.deleteTag(id);
        showTagLabelEditor = false;
      }}
    />
  {/if}

  <!-- STATS MATRIX MODAL (CONDITIONALLY RENDERED ONLY WHEN EXPLICITLY OPENED) -->
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
  /* ROOT LAYOUT (DEEPEST SAPPHIRE THEME) */
  .tagging-workspace {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #060b14;
    color: #f8fafc;
    overflow: hidden;
  }

  /* HEADER */
  .tagging-header {
    height: 48px;
    background: linear-gradient(180deg, #0d1e38 0%, #091528 100%);
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-ghost-blue {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(14, 30, 56, 0.6);
    border: 1px solid #1a355d;
    color: #93c5fd;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-ghost-blue:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
  }

  .match-info-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #0d1e38;
    border: 1px solid #1a355d;
    padding: 4px 10px;
    border-radius: 999px;
  }

  .match-pulse-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: #38bdf8;
    box-shadow: 0 0 8px #38bdf8;
  }

  .match-title {
    font-size: 12px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .tag-counter-badge {
    font-size: 9px;
    background: #142a4d;
    color: #38bdf8;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 700;
    border: 1px solid #1e3b68;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-label-menu {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.18), rgba(37, 99, 235, 0.25));
    border: 1px solid #38bdf8;
    color: #38bdf8;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
    transition: all 0.15s;
  }

  .btn-label-menu:hover {
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.3), rgba(37, 99, 235, 0.4));
    box-shadow: 0 0 15px rgba(56, 189, 248, 0.35);
    transform: translateY(-1px);
  }

  .btn-stats-blue {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0d1e38;
    border: 1px solid #1a355d;
    color: #93c5fd;
    font-size: 11px;
    font-weight: 600;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-stats-blue:hover {
    background: #142a4d;
    border-color: #38bdf8;
    color: #ffffff;
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
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
    transition: all 0.2s;
  }

  .btn-next-step:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    box-shadow: 0 0 18px rgba(56, 189, 248, 0.5);
    transform: translateY(-1px);
  }

  /* WORKSPACE GRID */
  .workspace-grid {
    flex: 1;
    display: grid;
    grid-template-columns: 1fr 430px;
    gap: 1px;
    background-color: #152949;
    overflow: hidden;
  }

  /* PLAYER COLUMN */
  .player-column {
    display: flex;
    flex-direction: column;
    background-color: #060b14;
    overflow: hidden;
  }

  .video-container {
    flex: 1;
    position: relative;
    background-color: #02050a;
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
    padding: 32px;
    color: #64748b;
  }

  .futsal-glow-orb {
    font-size: 44px;
    margin-bottom: 12px;
    filter: drop-shadow(0 0 16px rgba(56, 189, 248, 0.4));
  }

  .placeholder-title {
    font-size: 16px;
    font-weight: 700;
    color: #f1f5f9;
    margin: 0 0 6px 0;
  }

  .placeholder-desc {
    font-size: 12px;
    color: #94a3b8;
    max-width: 440px;
    margin: 0 auto;
    line-height: 1.6;
  }

  /* OVERLAY BAR */
  .video-overlay-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    background: linear-gradient(transparent, rgba(6, 11, 20, 0.95));
    backdrop-filter: blur(8px);
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
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    width: 36px;
    height: 36px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
    transition: transform 0.1s;
  }

  .btn-overlay-play:hover {
    transform: scale(1.08);
  }

  .time-display {
    font-family: monospace;
    font-size: 12px;
  }

  .curr-time {
    color: #38bdf8;
    font-weight: 800;
    text-shadow: 0 0 8px rgba(56, 189, 248, 0.4);
  }

  .time-sep {
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
    background-color: rgba(13, 30, 56, 0.8);
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-ctrl-sm:hover {
    background-color: #1e3b68;
    color: #38bdf8;
  }

  .overlay-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-inout {
    background-color: rgba(13, 30, 56, 0.8);
    border: 1px solid #1e3b68;
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
    color: #ffffff;
  }

  .speed-select-blue {
    background-color: #0c1a33;
    border: 1px solid #1e3b68;
    color: #f8fafc;
    font-size: 10px;
    font-weight: 600;
    padding: 4px 8px;
    border-radius: 4px;
  }

  /* TIMELINE TRACKS */
  .timeline-tracks-container {
    height: 64px;
    background-color: #091426;
    border-top: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    padding: 6px 16px;
    box-sizing: border-box;
  }

  .timeline-scrubber {
    flex: 1;
    position: relative;
    background-color: #0d1e38;
    border: 1px solid #1a355d;
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
    box-shadow: 0 0 8px #38bdf8;
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
    opacity: 0.9;
    display: flex;
    align-items: center;
    padding: 0 5px;
    overflow: hidden;
    cursor: pointer;
    transition: opacity 0.15s;
    border: 1px solid rgba(255, 255, 255, 0.3);
  }

  .tag-block:hover {
    opacity: 1;
    filter: brightness(1.2);
  }

  .tag-block.selected {
    outline: 2px solid #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.6);
  }

  .block-label {
    font-size: 9px;
    font-weight: 800;
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
    background-color: #060b14;
    overflow: hidden;
  }

  /* CODE BUTTONS PANEL */
  .code-buttons-panel {
    background: linear-gradient(180deg, #0b172a 0%, #07101e 100%);
    border-bottom: 1px solid #1a355d;
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
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #93c5fd;
  }

  .pre-roll-pill {
    font-size: 9px;
    background-color: #0c1a33;
    border: 1px solid #1e3b68;
    color: #38bdf8;
    padding: 1px 6px;
    border-radius: 4px;
    font-weight: 600;
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
    background-color: #0c1a33;
    border: 1px solid #1b365f;
    border-left: 3.5px solid var(--btn-color);
    padding: 8px 10px;
    border-radius: 6px;
    color: #f1f5f9;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .code-btn:hover {
    background-color: #13274a;
    border-color: #38bdf8;
    transform: translateY(-1px);
    box-shadow: 0 4px 8px rgba(0, 0, 0, 0.4);
  }

  .btn-hotkey {
    font-size: 9px;
    font-weight: 800;
    background-color: #060e1d;
    color: #38bdf8;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid #1a355d;
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
    background-color: #070e1c;
  }

  .list-header {
    display: flex;
    flex-direction: column;
    gap: 8px;
    margin-bottom: 8px;
  }

  .list-title-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .list-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 12px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .sub-hint {
    font-size: 9px;
    color: #64748b;
  }

  .list-filter-row {
    display: flex;
    gap: 6px;
  }

  .search-wrap-blue {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0b172a;
    border: 1px solid #1b355d;
    padding: 4px 8px;
    border-radius: 6px;
    color: #64748b;
  }

  .search-input-blue {
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 11px;
    width: 100%;
  }

  .search-input-blue:focus {
    outline: none;
  }

  .filter-select-blue {
    background-color: #0b172a;
    border: 1px solid #1b355d;
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
    background: radial-gradient(circle at center, #0e203c 0%, #081222 100%);
    border: 1px dashed #1e3b68;
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
    background-color: #0a1628;
    padding: 8px 10px;
    border-radius: 6px;
    border: 1px solid #162c4a;
  }

  .empty-guide strong {
    color: #f8fafc;
  }

  .action-item-card {
    background-color: #0c1a32;
    border: 1px solid #1b365f;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.15s;
    cursor: default;
  }

  .action-item-card:hover {
    border-color: #38bdf8;
    background-color: #102342;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.4);
  }

  .action-item-card.active-loop {
    border-color: #38bdf8;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
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
    font-weight: 700;
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
    background-color: #0e2447;
    color: #93c5fd;
    border: 1px solid #1e3b68;
  }

  .tag-outcome {
    background-color: #064e3b;
    color: #34d399;
  }

  .tag-zone {
    background-color: #082f49;
    color: #38bdf8;
  }

  .tag-rating {
    background-color: #451a03;
    color: #fbbf24;
  }

  .tag-has-drawings {
    background-color: #3b0764;
    color: #c084fc;
  }

  /* CARD ACTIONS */
  .card-actions-row {
    display: flex;
    align-items: center;
    gap: 5px;
    margin-top: 4px;
    padding-top: 6px;
    border-top: 1px solid #162c4a;
  }

  .btn-card-draw {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 10px;
    border-radius: 5px;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
    transition: all 0.15s;
  }

  .btn-card-draw:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.45);
  }

  .btn-card-label {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: #0e2447;
    border: 1px solid #1e3b68;
    color: #38bdf8;
    font-size: 10px;
    font-weight: 700;
    padding: 6px 8px;
    border-radius: 5px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-card-label:hover {
    background-color: #14325e;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-card-play {
    display: flex;
    align-items: center;
    background-color: #0c1a32;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    padding: 6px 8px;
    border-radius: 5px;
    cursor: pointer;
  }

  .btn-card-play:hover {
    background-color: #162c4a;
    color: #38bdf8;
  }

  .btn-card-del {
    background-color: transparent;
    border: 1px solid transparent;
    color: #64748b;
    padding: 6px 6px;
    border-radius: 5px;
    cursor: pointer;
  }

  .btn-card-del:hover {
    color: #ef4444;
    background-color: rgba(239, 68, 68, 0.15);
  }
</style>

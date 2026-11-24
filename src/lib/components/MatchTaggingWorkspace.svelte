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
    Film,
    LayoutGrid,
    Users,
    Maximize2,
    MoveUp,
    MoveDown,
    CornerDownRight,
    Zap,
    Target,
    Flame,
    Shield,
    RotateCcw,
    AlertTriangle,
    Eye,
  } from 'lucide-svelte';

  // --- REFS & STATE ---
  let videoEl = $state<HTMLVideoElement | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(120);
  let playbackRate = $state(1.0);

  // Workspace subtab: 'tagging' | 'coding_board' | 'lineup' (Momen Sports style)
  let workspaceSubTab = $state<'tagging' | 'coding_board' | 'lineup'>('tagging');

  // Right panel tab: 'clips' | 'playlist' (Momen Sports style)
  let rightPanelTab = $state<'clips' | 'playlist'>('clips');

  // Active selected player for quick coding
  let activeSelectedPlayer = $state<string>('#9 Pivot');
  let lastTaggedNotification = $state<string | null>(null);

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

  // FUTSAL ROSTER PRESETS
  const FUTSAL_ROSTER = [
    { num: '#1', name: 'Kiper', role: 'Goalkeeper', color: '#0284c7' },
    { num: '#4', name: 'Anchor', role: 'Defender / Playmaker', color: '#38bdf8' },
    { num: '#7', name: 'Flank Kiri', role: 'Left Wing', color: '#10b981' },
    { num: '#11', name: 'Flank Kanan', role: 'Right Wing', color: '#f59e0b' },
    { num: '#9', name: 'Pivot', role: 'Target Man / Striker', color: '#8b5cf6' },
    { num: 'Opp', name: 'Tim Lawan', role: 'Opponent Action', color: '#ef4444' },
  ];

  // PRIMARY CODE BUTTONS (FUTSAL ESSENTIALS)
  const CODE_BUTTONS: {
    category: TagCategory;
    label: string;
    hotkey: string;
    lead: number;
    lag: number;
    color: string;
    icon: string;
    phase: 'attack' | 'defense' | 'setpiece' | 'special';
  }[] = [
    { category: 'Goal', label: 'Gol', hotkey: '1', lead: 6.0, lag: 3.0, color: '#10b981', icon: '⚽', phase: 'attack' },
    { category: 'Shot on Target', label: 'Shoot On-Target', hotkey: '2', lead: 4.0, lag: 3.0, color: '#38bdf8', icon: '🎯', phase: 'attack' },
    { category: 'Shot Off Target', label: 'Shoot Off-Target', hotkey: '3', lead: 4.0, lag: 2.5, color: '#64748b', icon: '⭕', phase: 'attack' },
    { category: 'Pressing High', label: 'High Pressing', hotkey: '4', lead: 5.0, lag: 3.0, color: '#f59e0b', icon: '🔥', phase: 'defense' },
    { category: 'Transition Attack', label: 'Counter Attack', hotkey: '5', lead: 5.0, lag: 4.0, color: '#6366f1', icon: '⚡', phase: 'attack' },
    { category: 'Transition Defense', label: 'Transisi Bertahan', hotkey: '6', lead: 4.0, lag: 3.0, color: '#ef4444', icon: '🛑', phase: 'defense' },
    { category: 'Kick-in Set Piece', label: 'Kick-In Set Piece', hotkey: '7', lead: 4.0, lag: 4.0, color: '#ec4899', icon: '📐', phase: 'setpiece' },
    { category: 'Corner Set Piece', label: 'Corner Kick', hotkey: '8', lead: 4.0, lag: 4.0, color: '#8b5cf6', icon: '🚩', phase: 'setpiece' },
    { category: 'Build-up 3-1', label: 'Rotasi 3-1', hotkey: 'Q', lead: 5.0, lag: 4.0, color: '#0ea5e9', icon: '🔄', phase: 'attack' },
    { category: 'Build-up 4-0', label: 'Rotasi 4-0 Flat', hotkey: 'W', lead: 5.0, lag: 4.0, color: '#14b8a6', icon: '↔️', phase: 'attack' },
    { category: 'Power Play', label: 'Power Play 5v4', hotkey: 'E', lead: 5.0, lag: 4.0, color: '#eab308', icon: '👑', phase: 'special' },
    { category: 'Goalkeeper Save', label: 'Save Kiper', hotkey: 'R', lead: 3.0, lag: 3.0, color: '#06b6d4', icon: '🧤', phase: 'defense' },
    { category: 'Foul', label: 'Pelanggaran', hotkey: 'T', lead: 4.0, lag: 3.0, color: '#f97316', icon: '⚠️', phase: 'defense' },
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
        const keyUpper = e.key.toUpperCase();
        const matched = CODE_BUTTONS.find((b) => b.hotkey.toUpperCase() === keyUpper);
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
    const fps = 25;
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
        startTime: Number(inPoint.toFixed(2)),
        endTime: Number(outPoint.toFixed(2)),
        color: '#38bdf8',
        playerLabel: activeSelectedPlayer,
        outcomeLabel: 'Gol / Sukses',
        rating: '⭐⭐⭐ Bagus',
        pauseDuration: 3.0,
        drawings: [],
      };
      projectStore.addTag(newTag);
      inPoint = null;
      outPoint = null;
      notifyUser(`Klip Manual Disimpan (${activeSelectedPlayer})`);
    }
  }

  function triggerSmartTag(
    category: TagCategory,
    label: string,
    color: string,
    lead = leadTimeSeconds,
    lag = lagTimeSeconds,
    player = activeSelectedPlayer
  ) {
    const start = Math.max(0, currentTime - lead);
    const end = Math.min(duration, currentTime + lag);

    const newTag: VideoTagEvent = {
      id: `tag-${Date.now()}`,
      title: `${label} - ${player} (${formatTime(start)} - ${formatTime(end)})`,
      category,
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      color,
      playerLabel: player,
      outcomeLabel: 'Gol / Sukses',
      zoneLabel: 'Area Penalti Lawan',
      rating: '⭐⭐⭐ Bagus',
      pauseDuration: 3.0,
      drawings: [],
    };

    projectStore.addTag(newTag);
    notifyUser(`Klip Ditandai: ${label} [${player}]`);
  }

  function notifyUser(msg: string) {
    lastTaggedNotification = msg;
    setTimeout(() => {
      if (lastTaggedNotification === msg) lastTaggedNotification = null;
    }, 2800);
  }

  function handleAddToPlaylist(tag: VideoTagEvent) {
    projectStore.addToPlaylist(tag);
    notifyUser(`Dimasukkan ke Playlist: ${tag.title}`);
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

  let currentPlaylist = $derived(projectStore.playlists[0]);
</script>

<div class="tagging-workspace">
  <!-- TOP SUB-HEADER (MOMEN SPORTS & ONCE SPORT BROADCAST BAR) -->
  <header class="tagging-header">
    <div class="header-left">
      <button class="btn-ghost-blue" onclick={() => projectStore.setStage('hub')} title="Kembali ke Hub Proyek">
        <ArrowLeft size={14} />
        <span>Hub</span>
      </button>

      <div class="match-info-pill">
        <span class="match-pulse-dot"></span>
        <span class="match-title">{projectStore.videoTitle}</span>
        <span class="tag-counter-badge">{projectStore.tags.length} Klip</span>
      </div>

      <!-- WORKSPACE MODE SWITCHER (MOMEN SPORTS CONVENTION) -->
      <nav class="subnav-segmented">
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === 'tagging'}
          onclick={() => (workspaceSubTab = 'tagging')}
        >
          <Film size={13} />
          <span>Video & Timeline</span>
        </button>
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === 'coding_board'}
          onclick={() => (workspaceSubTab = 'coding_board')}
        >
          <LayoutGrid size={13} />
          <span>Papan Tagging (Action Pad)</span>
        </button>
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === 'lineup'}
          onclick={() => (workspaceSubTab = 'lineup')}
        >
          <Users size={13} />
          <span>Skuad Futsal</span>
        </button>
      </nav>
    </div>

    <!-- NOTIFICATION TOAST -->
    {#if lastTaggedNotification}
      <div class="notification-pill">
        <CheckCircle size={13} class="text-emerald-400" />
        <span>{lastTaggedNotification}</span>
      </div>
    {/if}

    <div class="header-right">
      <!-- DEDICATED TAG & LABEL FORM MENU BUTTON -->
      <button
        class="btn-label-menu"
        onclick={() => {
          if (projectStore.tags.length > 0) {
            openTagEditor(projectStore.tags[0]);
          } else {
            const freshTag: VideoTagEvent = {
              id: `tag-${Date.now()}`,
              title: `Aksi Futsal (${formatTime(currentTime)} - ${formatTime(currentTime + 5)})`,
              category: 'Goal',
              startTime: Math.max(0, currentTime - 3),
              endTime: Math.min(duration, currentTime + 3),
              color: '#10b981',
              playerLabel: activeSelectedPlayer,
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
        title="Buka Form Menu Khusus Tagging & Labeling (Once Sport Inspector)"
      >
        <Tag size={13} />
        <span>Menu Tag & Label</span>
      </button>

      <!-- STATS MATRIX -->
      <button class="btn-stats-blue" onclick={() => (showStatsMatrix = true)} title="Buka Matriks Silang Statistik Futsal">
        <Table size={13} />
        <span>Matriks Silang</span>
      </button>

      <!-- NEXT STEP -->
      <button class="btn-next-step" onclick={() => projectStore.setStage('telestrator')} title="Lanjut ke Studio Telestrasi">
        <span>Studio Telestrasi</span>
        <ArrowRight size={14} />
      </button>
    </div>
  </header>

  <!-- WORKSPACE BODY (CONDITIONAL ON SUBTAB) -->
  <main class="workspace-main">
    {#if workspaceSubTab === 'tagging'}
      <!-- MODE 1: STANDARD VIDEO & MULTI-TRACK TIMELINE -->
      <div class="workspace-grid">
        <!-- LEFT COLUMN: VIDEO PLAYER & MULTI-TRACK TIMELINE -->
        <div class="player-column">
          <!-- VIDEO CONTAINER -->
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
                  Silakan buka video di Hub Proyek atau gunakan sampel demo untuk memotong momen dengan akurasi sub-detik.
                </p>
                <button class="btn-sample-inline" onclick={() => projectStore.loadSampleDemo()}>
                  Muat Video Sampel Demo
                </button>
              </div>
            {/if}

            <!-- VIDEO OVERLAY BAR (MOMEN SPORTS TRANSPORT CONTROLS) -->
            <div class="video-overlay-bar">
              <div class="overlay-left">
                <button class="btn-overlay-play" onclick={togglePlay} title="Play/Pause (Spasi)">
                  {#if isPlaying}
                    <Pause size={17} />
                  {:else}
                    <Play size={17} />
                  {/if}
                </button>
                <div class="time-display">
                  <span class="curr-time">{formatTime(currentTime)}</span>
                  <span class="time-sep">/</span>
                  <span class="dur-time">{formatTime(duration)}</span>
                </div>
              </div>

              <!-- FRAME STEP & JUMP CONTROLS -->
              <div class="overlay-center">
                <button class="btn-ctrl-sm" onclick={() => stepFrame(-1)} title="Mundur 1 Frame (Panah Kiri)">
                  <SkipBack size={12} />
                  <span>1F</span>
                </button>
                <button class="btn-ctrl-sm" onclick={() => seekTo(currentTime - 5)} title="Mundur 5 Detik">
                  -5s
                </button>
                <button class="btn-ctrl-sm" onclick={() => seekTo(currentTime + 5)} title="Maju 5 Detik">
                  +5s
                </button>
                <button class="btn-ctrl-sm" onclick={() => stepFrame(1)} title="Maju 1 Frame (Panah Kanan)">
                  <span>1F</span>
                  <SkipForward size={12} />
                </button>
              </div>

              <!-- IN / OUT & PLAYBACK SPEED -->
              <div class="overlay-right">
                <button
                  class="btn-inout"
                  class:active={inPoint !== null}
                  onclick={setInPoint}
                  title="Tandai Titik Masuk / In-Point (I)"
                >
                  [ IN {inPoint !== null ? formatTime(inPoint) : ''}
                </button>
                <button
                  class="btn-inout"
                  onclick={setOutPoint}
                  title="Tandai Titik Keluar & Potong Klip (O)"
                >
                  OUT ]
                </button>

                <div class="speed-selector-group">
                  {#each [0.5, 1.0, 1.5, 2.0] as spd}
                    <button
                      class="speed-pill"
                      class:active={playbackRate === spd}
                      onclick={() => {
                        playbackRate = spd;
                        if (videoEl) videoEl.playbackRate = spd;
                      }}
                    >
                      {spd}x
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          </div>

          <!-- MULTI-TRACK TIMELINE (ONCE SPORT STYLE) -->
          <div class="timeline-tracks-container">
            <!-- PRE/POST ROLL MICRO TUNER BAR -->
            <div class="prepost-toolbar">
              <div class="roll-item">
                <span class="roll-label">Pre-Roll:</span>
                <button class="roll-btn" onclick={() => (leadTimeSeconds = Math.max(1, leadTimeSeconds - 1))}>-1s</button>
                <span class="roll-val">{leadTimeSeconds}s</span>
                <button class="roll-btn" onclick={() => (leadTimeSeconds = Math.min(15, leadTimeSeconds + 1))}>+1s</button>
              </div>
              <div class="roll-divider"></div>
              <div class="roll-item">
                <span class="roll-label">Post-Roll:</span>
                <button class="roll-btn" onclick={() => (lagTimeSeconds = Math.max(1, lagTimeSeconds - 1))}>-1s</button>
                <span class="roll-val">{lagTimeSeconds}s</span>
                <button class="roll-btn" onclick={() => (lagTimeSeconds = Math.min(15, lagTimeSeconds + 1))}>+1s</button>
              </div>
              <span class="roll-hint">Hotkeys: [1-8] untuk potong otomatis dengan lead/lag ini</span>
            </div>

            <!-- SCRUBBER TRACK -->
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
                  style="left: {(tag.startTime / duration) * 100}%; width: {Math.max(2, ((tag.endTime - tag.startTime) / duration) * 100)}%; background-color: {tag.color}"
                  onclick={(e) => {
                    e.stopPropagation();
                    playClipLoop(tag);
                  }}
                  title="{tag.title} ({formatTime(tag.startTime)} - {formatTime(tag.endTime)})"
                  role="button"
                  tabindex="0"
                >
                  <span class="block-player">{tag.playerLabel || '#9'}</span>
                  <span class="block-label">{tag.category}</span>
                </div>
              {/each}
            </div>

            <!-- TIMELINE TICKS -->
            <div class="timeline-ticks">
              <span>00:00.0</span>
              <span>{formatTime(duration * 0.25)}</span>
              <span>{formatTime(duration * 0.5)}</span>
              <span>{formatTime(duration * 0.75)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
        </div>

        <!-- RIGHT COLUMN: MOMEN SPORTS ACTION PAD & CLIPS/PLAYLIST PANEL -->
        <div class="panel-column">
          <!-- SEGMENTED TABS: KLIP AKSI vs PLAYLIST ANTRIAN -->
          <div class="right-tabs-bar">
            <button
              class="tab-pill"
              class:active={rightPanelTab === 'clips'}
              onclick={() => (rightPanelTab = 'clips')}
            >
              <Scissors size={12} />
              <span>Klip Aksi ({filteredTags.length})</span>
            </button>
            <button
              class="tab-pill"
              class:active={rightPanelTab === 'playlist'}
              onclick={() => (rightPanelTab = 'playlist')}
            >
              <ListOrdered size={12} />
              <span>Playlist ({currentPlaylist ? currentPlaylist.items.length : 0})</span>
            </button>
          </div>

          {#if rightPanelTab === 'clips'}
            <!-- PANEL A: QUICK ACTION CODING BUTTONS -->
            <div class="code-buttons-panel">
              <!-- ACTIVE PLAYER SELECTOR PILLS -->
              <div class="roster-quick-bar">
                <span class="roster-quick-title">Pemain Aktif:</span>
                <div class="roster-pills-row">
                  {#each FUTSAL_ROSTER as p}
                    <button
                      class="roster-pill"
                      class:active={activeSelectedPlayer === `${p.num} ${p.name}`}
                      onclick={() => (activeSelectedPlayer = `${p.num} ${p.name}`)}
                    >
                      <span class="pill-num">{p.num}</span>
                      <span class="pill-name">{p.name}</span>
                    </button>
                  {/each}
                </div>
              </div>

              <!-- ACTION BUTTONS GRID -->
              <div class="buttons-grid">
                {#each CODE_BUTTONS.slice(0, 8) as btn}
                  <button
                    class="code-btn"
                    style="--btn-color: {btn.color}"
                    onclick={() => triggerSmartTag(btn.category, btn.label, btn.color, btn.lead, btn.lag)}
                    title="Hotkey [{btn.hotkey}] - Potong otomatis mundur {btn.lead}s & maju {btn.lag}s"
                  >
                    <span class="btn-hotkey">{btn.hotkey}</span>
                    <span class="btn-icon">{btn.icon}</span>
                    <span class="btn-text">{btn.label}</span>
                  </button>
                {/each}
              </div>
            </div>

            <!-- PANEL B: ACTION CLIPS LIST -->
            <div class="actions-list-panel">
              <div class="list-header">
                <!-- Search & Filter Bar -->
                <div class="list-filter-row">
                  <div class="search-wrap-blue">
                    <Search size={12} />
                    <input
                      type="text"
                      placeholder="Cari klip, pemain, catatan..."
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
                    <h4 class="empty-title">Belum Ada Klip Terpotong</h4>
                    <p class="empty-guide">
                      Putar video pertandingan (tekan <strong>Spasi</strong>) lalu tekan <strong>Tombol Aksi Cepat [1–8]</strong> saat momen terjadi untuk memotong klip otomatis.
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
                          {(tag.endTime - tag.startTime).toFixed(1)}s
                        </span>
                      </div>

                      <!-- TITLE & LABELS -->
                      <div class="card-content">
                        <div class="clip-name">{tag.title}</div>
                        <div class="card-tags-row">
                          {#if tag.playerLabel}
                            <span class="tag-pill player-pill">
                              <User size={10} />
                              <span>{tag.playerLabel}</span>
                            </span>
                          {/if}
                          {#if tag.outcomeLabel}
                            <span class="tag-pill outcome-pill">
                              <Target size={10} />
                              <span>{tag.outcomeLabel}</span>
                            </span>
                          {/if}
                          {#if tag.rating}
                            <span class="tag-pill rating-pill">{tag.rating}</span>
                          {/if}
                          {#if tag.drawings && tag.drawings.length > 0}
                            <span class="tag-pill drawings-pill">
                              <Sparkles size={10} />
                              <span>{tag.drawings.length} Telestrasi</span>
                            </span>
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
                          <Sparkles size={12} />
                          <span>Gambar</span>
                        </button>

                        <!-- DEDICATED TAG & LABEL INSPECTOR BUTTON -->
                        <button
                          class="btn-card-label"
                          onclick={() => openTagEditor(tag)}
                          title="Buka form tagging pemain & label taktis klip ini"
                        >
                          <Edit3 size={11} />
                          <span>Tag & Label</span>
                        </button>

                        <!-- ADD TO PLAYLIST BUTTON -->
                        <button
                          class="btn-card-pl"
                          onclick={() => handleAddToPlaylist(tag)}
                          title="Tambahkan klip ke antrian Playlist Presentasi"
                        >
                          <Plus size={11} />
                          <span>+Playlist</span>
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
                            <Pause size={11} />
                          {:else}
                            <Play size={11} />
                          {/if}
                        </button>

                        <!-- DELETE -->
                        <button
                          class="btn-card-del"
                          onclick={() => projectStore.deleteTag(tag.id)}
                          title="Hapus klip"
                        >
                          <Trash2 size={11} />
                        </button>
                      </div>
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          {:else}
            <!-- PANEL B: PLAYLIST ANTRIAN (PRESENTATION QUEUE) -->
            <div class="playlist-quick-panel">
              <div class="playlist-quick-header">
                <span class="pl-quick-title">Antrian Playlist Presentasi</span>
                <span class="pl-quick-count">{currentPlaylist ? currentPlaylist.items.length : 0} Klip</span>
              </div>

              <div class="playlist-items-scroll">
                {#if !currentPlaylist || currentPlaylist.items.length === 0}
                  <div class="empty-list-futsal">
                    <div class="empty-icon">📋</div>
                    <h4 class="empty-title">Playlist Masih Kosong</h4>
                    <p class="empty-guide">
                      Klik tombol <strong>+Playlist</strong> pada kartu aksi untuk mengumpulkan momen terbaik ke playlist siaran.
                    </p>
                  </div>
                {:else}
                  {#each currentPlaylist.items as item, idx}
                    <div class="playlist-quick-row">
                      <span class="pl-order">{idx + 1}</span>
                      <div class="pl-info">
                        <span class="pl-name">{item.title}</span>
                        <span class="pl-meta">{formatTime(item.tagEvent.startTime)} - {formatTime(item.tagEvent.endTime)}</span>
                      </div>
                      <button
                        class="btn-pl-remove"
                        onclick={() => {
                          currentPlaylist.items.splice(idx, 1);
                        }}
                        title="Hapus dari playlist"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  {/each}
                {/if}
              </div>

              <div class="playlist-quick-footer">
                <button class="btn-open-export" onclick={() => projectStore.setStage('playlist_export')}>
                  <span>Buka di Playlist & Ekspor</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          {/if}
        </div>
      </div>
    {:else if workspaceSubTab === 'coding_board'}
      <!-- MODE 2: FULLSCREEN FUTSAL ACTION CODING PAD (MOMEN SPORTS MATRIX) -->
      <div class="coding-board-fullscreen">
        <!-- TOP ROSTER SELECTOR -->
        <div class="coding-roster-row">
          <span class="coding-section-title">PILIH PEMAIN:</span>
          <div class="coding-roster-grid">
            {#each FUTSAL_ROSTER as p}
              <button
                class="coding-player-card"
                class:active={activeSelectedPlayer === `${p.num} ${p.name}`}
                onclick={() => (activeSelectedPlayer = `${p.num} ${p.name}`)}
              >
                <div class="player-num-circle" style="background-color: {p.color}">{p.num}</div>
                <div class="player-text">
                  <span class="player-name">{p.name}</span>
                  <span class="player-role">{p.role}</span>
                </div>
              </button>
            {/each}
          </div>
        </div>

        <!-- ACTION MATRICES GROUPED BY TACTICAL PHASE -->
        <div class="tactical-phases-container">
          <!-- 1. FASE SERANGAN -->
          <div class="phase-card">
            <div class="phase-header">
              <Zap size={14} class="text-sky-400" />
              <span>FASE PENYERANGAN (ATTACK)</span>
            </div>
            <div class="phase-buttons-grid">
              {#each CODE_BUTTONS.filter((b) => b.phase === 'attack') as btn}
                <button
                  class="big-coding-btn"
                  style="--accent-col: {btn.color}"
                  onclick={() => triggerSmartTag(btn.category, btn.label, btn.color, btn.lead, btn.lag)}
                >
                  <div class="btn-top">
                    <span class="btn-emoji">{btn.icon}</span>
                    <span class="btn-kbd">[{btn.hotkey}]</span>
                  </div>
                  <span class="btn-main-label">{btn.label}</span>
                  <span class="btn-roll-desc">-{btn.lead}s / +{btn.lag}s</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- 2. FASE BERTAHAN & TRANSISI -->
          <div class="phase-card">
            <div class="phase-header">
              <Shield size={14} class="text-amber-400" />
              <span>TRANSISI & PERTAHANAN (DEFENSE)</span>
            </div>
            <div class="phase-buttons-grid">
              {#each CODE_BUTTONS.filter((b) => b.phase === 'defense') as btn}
                <button
                  class="big-coding-btn"
                  style="--accent-col: {btn.color}"
                  onclick={() => triggerSmartTag(btn.category, btn.label, btn.color, btn.lead, btn.lag)}
                >
                  <div class="btn-top">
                    <span class="btn-emoji">{btn.icon}</span>
                    <span class="btn-kbd">[{btn.hotkey}]</span>
                  </div>
                  <span class="btn-main-label">{btn.label}</span>
                  <span class="btn-roll-desc">-{btn.lead}s / +{btn.lag}s</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- 3. SET PIECES & SITUASI KHUSUS -->
          <div class="phase-card">
            <div class="phase-header">
              <Sparkles size={14} class="text-purple-400" />
              <span>SET-PIECES & SITUASI KHUSUS</span>
            </div>
            <div class="phase-buttons-grid">
              {#each CODE_BUTTONS.filter((b) => b.phase === 'setpiece' || b.phase === 'special') as btn}
                <button
                  class="big-coding-btn"
                  style="--accent-col: {btn.color}"
                  onclick={() => triggerSmartTag(btn.category, btn.label, btn.color, btn.lead, btn.lag)}
                >
                  <div class="btn-top">
                    <span class="btn-emoji">{btn.icon}</span>
                    <span class="btn-kbd">[{btn.hotkey}]</span>
                  </div>
                  <span class="btn-main-label">{btn.label}</span>
                  <span class="btn-roll-desc">-{btn.lead}s / +{btn.lag}s</span>
                </button>
              {/each}
            </div>
          </div>
        </div>
      </div>
    {:else if workspaceSubTab === 'lineup'}
      <!-- MODE 3: FUTSAL ROSTER & LINEUP COURT (MOMEN SPORTS STYLE) -->
      <div class="lineup-fullscreen">
        <div class="lineup-header">
          <h3>Susunan Pemain & Roster Futsal (Starting 5 & Cadangan)</h3>
          <p>Klik pemain untuk menyaring klip kejadian yang melibatkan pemain tersebut.</p>
        </div>

        <div class="lineup-grid-layout">
          <!-- 2D MINI COURT POSITIONING -->
          <div class="pitch-tactical-display">
            <div class="pitch-court">
              <div class="pitch-center-circle"></div>
              <div class="pitch-center-line"></div>
              <div class="pitch-penalty-area"></div>

              <!-- Posisi Pemain Futsal FIFA -->
              <!-- Kiper -->
              <div class="player-marker kiper-pos" onclick={() => { filterPlayer = '#1 Kiper'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#1</span>
                <span class="pos-name">Kiper</span>
              </div>
              <!-- Anchor -->
              <div class="player-marker anchor-pos" onclick={() => { filterPlayer = '#4 Anchor'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#4</span>
                <span class="pos-name">Anchor</span>
              </div>
              <!-- Flank Kiri -->
              <div class="player-marker flank-l-pos" onclick={() => { filterPlayer = '#7 Flank Kiri'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#7</span>
                <span class="pos-name">Flank Kiri</span>
              </div>
              <!-- Flank Kanan -->
              <div class="player-marker flank-r-pos" onclick={() => { filterPlayer = '#11 Flank Kanan'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#11</span>
                <span class="pos-name">Flank Kanan</span>
              </div>
              <!-- Pivot -->
              <div class="player-marker pivot-pos" onclick={() => { filterPlayer = '#9 Pivot'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#9</span>
                <span class="pos-name">Pivot</span>
              </div>
            </div>
          </div>

          <!-- ROSTER TABLE STATS -->
          <div class="roster-stats-card">
            <h4>Statistik Klip per Pemain</h4>
            <div class="roster-table-wrap">
              <table class="roster-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nama / Posisi</th>
                    <th>Peran</th>
                    <th>Total Klip</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {#each FUTSAL_ROSTER as p}
                    {@const count = projectStore.tags.filter((t) => t.playerLabel?.includes(p.name)).length}
                    <tr>
                      <td><span class="badge-num" style="background-color: {p.color}">{p.num}</span></td>
                      <td class="font-bold">{p.name}</td>
                      <td class="text-muted">{p.role}</td>
                      <td><span class="count-pill">{count} Klip</span></td>
                      <td>
                        <button
                          class="btn-filter-player"
                          onclick={() => {
                            filterPlayer = `${p.num} ${p.name}`;
                            workspaceSubTab = 'tagging';
                          }}
                        >
                          Lihat Klip
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </main>

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
  /* ROOT LAYOUT (DEEP SAPPHIRE & BROADCAST BLUE) */
  .tagging-workspace {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at 50% 0%, #0c1c38 0%, #060b14 100%);
    color: #f0f6fc;
    overflow: hidden;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  /* TOP SUB-HEADER */
  .tagging-header {
    height: 52px;
    background: linear-gradient(180deg, #0b172a 0%, #070e1c 100%);
    border-bottom: 1px solid #1a355d;
    box-shadow: 0 4px 16px rgba(2, 6, 23, 0.7);
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    box-sizing: border-box;
    flex-shrink: 0;
    gap: 12px;
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
    background: #0f2444;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-ghost-blue:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background: #163666;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  .match-info-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #0b172a;
    border: 1px solid #1a355d;
    padding: 4px 10px;
    border-radius: 6px;
  }

  .match-pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background-color: #10b981;
    box-shadow: 0 0 8px #10b981;
  }

  .match-title {
    font-size: 11px;
    font-weight: 700;
    color: #f0f6fc;
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag-counter-badge {
    font-size: 9px;
    font-weight: 800;
    color: #38bdf8;
    background-color: rgba(56, 189, 248, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 1px 6px;
    border-radius: 4px;
  }

  /* WORKSPACE SUBNAV (MOMEN SPORTS STYLE) */
  .subnav-segmented {
    display: flex;
    align-items: center;
    gap: 3px;
    background-color: #091322;
    padding: 3px;
    border-radius: 7px;
    border: 1px solid #1a355d;
  }

  .subnav-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    padding: 4px 10px;
    border-radius: 5px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .subnav-btn:hover {
    color: #f0f6fc;
    background-color: rgba(255, 255, 255, 0.05);
  }

  .subnav-btn.active {
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.4), rgba(30, 58, 138, 0.6));
    border-color: #38bdf8;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  /* NOTIFICATION PILL */
  .notification-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #34d399;
    padding: 4px 12px;
    border-radius: 20px;
    font-size: 11px;
    font-weight: 600;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
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
    background: #0f2444;
    border: 1px solid #1e3b68;
    color: #38bdf8;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-label-menu:hover {
    background: #163666;
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  .btn-stats-blue {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0d233a;
    border: 1px solid #1e4570;
    color: #93c5fd;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-stats-blue:hover {
    background-color: #123456;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-next-step {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
    transition: all 0.15s ease;
  }

  .btn-next-step:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    box-shadow: 0 6px 20px rgba(2, 132, 199, 0.5);
  }

  /* WORKSPACE MAIN */
  .workspace-main {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  /* GRID */
  .workspace-grid {
    width: 100%;
    height: 100%;
    display: grid;
    grid-template-columns: 1fr 450px;
    overflow: hidden;
  }

  /* PLAYER COLUMN */
  .player-column {
    display: flex;
    flex-direction: column;
    height: 100%;
    overflow: hidden;
    border-right: 1px solid #1a355d;
    background-color: #060b14;
  }

  .video-container {
    flex: 1;
    background-color: #000000;
    position: relative;
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
    padding: 30px;
    color: #64748b;
  }

  .futsal-glow-orb {
    font-size: 40px;
    margin-bottom: 12px;
    filter: drop-shadow(0 0 16px rgba(56, 189, 248, 0.4));
  }

  .placeholder-title {
    font-size: 15px;
    font-weight: 700;
    color: #f0f6fc;
    margin-bottom: 6px;
  }

  .placeholder-desc {
    font-size: 11px;
    max-width: 380px;
    margin: 0 auto 16px;
    line-height: 1.5;
  }

  .btn-sample-inline {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  /* VIDEO OVERLAY TRANSPORT BAR */
  .video-overlay-bar {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 48px;
    background: linear-gradient(180deg, rgba(6, 11, 20, 0.6) 0%, rgba(6, 11, 20, 0.95) 100%);
    backdrop-filter: blur(8px);
    border-top: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    z-index: 10;
  }

  .overlay-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .btn-overlay-play {
    width: 32px;
    height: 32px;
    border-radius: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border: 1px solid #38bdf8;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.35);
  }

  .time-display {
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #38bdf8;
    background: #091322;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #1a355d;
  }

  .time-sep {
    color: #64748b;
    margin: 0 2px;
  }

  .dur-time {
    color: #94a3b8;
  }

  .overlay-center {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-ctrl-sm {
    background-color: #0b172a;
    border: 1px solid #1a355d;
    color: #94a3b8;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 3px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-ctrl-sm:hover {
    color: #38bdf8;
    border-color: #38bdf8;
  }

  .overlay-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-inout {
    background-color: #0b172a;
    border: 1px solid #1a355d;
    color: #93c5fd;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-inout.active {
    background-color: #0284c7;
    color: #ffffff;
    border-color: #38bdf8;
  }

  .speed-selector-group {
    display: flex;
    align-items: center;
    background-color: #091322;
    border: 1px solid #1a355d;
    border-radius: 4px;
    overflow: hidden;
  }

  .speed-pill {
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 9px;
    font-weight: 700;
    padding: 3px 6px;
    cursor: pointer;
  }

  .speed-pill.active {
    background-color: #0284c7;
    color: #ffffff;
  }

  /* TIMELINE CONTAINER */
  .timeline-tracks-container {
    height: 125px;
    background-color: #091322;
    border-top: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    padding: 8px 16px;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .prepost-toolbar {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 6px;
  }

  .roll-item {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .roll-label {
    font-size: 10px;
    font-weight: 700;
    color: #38bdf8;
  }

  .roll-val {
    font-family: 'Fira Code', monospace;
    font-size: 10px;
    font-weight: 700;
    color: #ffffff;
    min-width: 20px;
    text-align: center;
  }

  .roll-btn {
    background-color: #0b172a;
    border: 1px solid #1a355d;
    color: #94a3b8;
    padding: 1px 5px;
    border-radius: 3px;
    font-size: 9px;
    cursor: pointer;
  }

  .roll-btn:hover {
    color: #ffffff;
    border-color: #38bdf8;
  }

  .roll-divider {
    width: 1px;
    height: 12px;
    background-color: #1a355d;
  }

  .roll-hint {
    font-size: 9px;
    color: #64748b;
    margin-left: auto;
  }

  .timeline-scrubber {
    flex: 1;
    background-color: #060b14;
    border: 1px solid #1a355d;
    border-radius: 6px;
    position: relative;
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
    z-index: 20;
    pointer-events: none;
  }

  .needle-tip {
    position: absolute;
    top: 0;
    left: -4px;
    width: 10px;
    height: 6px;
    background-color: #38bdf8;
    clip-path: polygon(0% 0%, 100% 0%, 50% 100%);
  }

  .in-marker {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background-color: #10b981;
    z-index: 15;
  }

  .tag-block {
    position: absolute;
    top: 8px;
    bottom: 8px;
    border-radius: 4px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 0 6px;
    overflow: hidden;
    cursor: pointer;
    border: 1px solid rgba(255, 255, 255, 0.2);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.4);
    z-index: 5;
    transition: transform 0.1s;
  }

  .tag-block:hover {
    transform: scaleY(1.08);
    z-index: 10;
  }

  .tag-block.selected {
    outline: 2px solid #ffffff;
    z-index: 12;
  }

  .block-player {
    font-size: 8px;
    font-weight: 900;
    color: #060b14;
    background-color: rgba(255, 255, 255, 0.85);
    padding: 1px 3px;
    border-radius: 2px;
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
    align-items: center;
    justify-content: space-between;
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    color: #64748b;
    margin-top: 4px;
  }

  /* PANEL COLUMN */
  .panel-column {
    display: flex;
    flex-direction: column;
    height: 100%;
    background-color: #080f1c;
    overflow: hidden;
  }

  /* RIGHT TABS BAR */
  .right-tabs-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    background: #091322;
    border-bottom: 1px solid #1a355d;
  }

  .tab-pill {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-pill:hover {
    color: #ffffff;
    background-color: rgba(255, 255, 255, 0.05);
  }

  .tab-pill.active {
    background: #0d1e38;
    border-color: #1a355d;
    color: #38bdf8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  /* CODE BUTTONS PANEL */
  .code-buttons-panel {
    padding: 10px 12px;
    background: #0b1528;
    border-bottom: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
  }

  .roster-quick-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    overflow-x: auto;
  }

  .roster-quick-title {
    font-size: 9px;
    font-weight: 700;
    color: #94a3b8;
    white-space: nowrap;
  }

  .roster-pills-row {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .roster-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #060b14;
    border: 1px solid #1a355d;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .roster-pill:hover {
    border-color: #38bdf8;
  }

  .roster-pill.active {
    background: #0284c7;
    border-color: #38bdf8;
  }

  .pill-num {
    font-size: 9px;
    font-weight: 900;
    color: #38bdf8;
  }

  .roster-pill.active .pill-num {
    color: #ffffff;
  }

  .pill-name {
    font-size: 9px;
    font-weight: 600;
    color: #f0f6fc;
  }

  .buttons-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .code-btn {
    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: linear-gradient(180deg, #0d1e38 0%, #091322 100%);
    border: 1px solid #1a355d;
    padding: 8px 4px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .code-btn:hover {
    border-color: var(--btn-color);
    background: #122849;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
    transform: translateY(-1px);
  }

  .code-btn:active {
    transform: translateY(1px);
  }

  .btn-hotkey {
    position: absolute;
    top: 3px;
    left: 4px;
    font-family: 'Fira Code', monospace;
    font-size: 8px;
    font-weight: 800;
    color: #94a3b8;
    background: #060b14;
    padding: 0 3px;
    border-radius: 2px;
  }

  .btn-icon {
    font-size: 14px;
    line-height: 1;
  }

  .btn-text {
    font-size: 10px;
    font-weight: 700;
    color: #f0f6fc;
    text-align: center;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%;
  }

  /* ACTIONS LIST PANEL */
  .actions-list-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: #080f1c;
  }

  .list-header {
    padding: 8px 12px;
    background-color: #091322;
    border-bottom: 1px solid #1a355d;
  }

  .list-filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search-wrap-blue {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #060b14;
    border: 1px solid #1a355d;
    padding: 5px 8px;
    border-radius: 5px;
  }

  .search-input-blue {
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-size: 10px;
    width: 100%;
  }

  .filter-select-blue {
    background-color: #060b14;
    border: 1px solid #1a355d;
    color: #93c5fd;
    padding: 5px 8px;
    border-radius: 5px;
    font-size: 10px;
    outline: none;
  }

  .list-items-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-list-futsal {
    text-align: center;
    padding: 24px 16px;
    color: #64748b;
  }

  .empty-icon {
    font-size: 28px;
    margin-bottom: 8px;
  }

  .empty-title {
    font-size: 12px;
    font-weight: 700;
    color: #f0f6fc;
    margin-bottom: 4px;
  }

  .empty-guide {
    font-size: 10px;
    line-height: 1.5;
    color: #94a3b8;
  }

  /* ACTION ITEM CARD */
  .action-item-card {
    background: #0d1e38;
    border: 1px solid #1a355d;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    transition: all 0.2s ease;
    cursor: pointer;
  }

  .action-item-card:hover {
    border-color: #2563eb;
    background: #112646;
  }

  .action-item-card.active-loop {
    border-color: #38bdf8;
    background: linear-gradient(90deg, #102e5c 0%, #0d1e38 100%);
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.2);
  }

  .card-top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .badge-category {
    font-size: 8px;
    font-weight: 800;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 3px;
    text-transform: uppercase;
  }

  .card-time-range {
    font-family: 'Fira Code', monospace;
    font-size: 10px;
    color: #38bdf8;
    font-weight: 700;
  }

  .card-dur {
    font-size: 9px;
    color: #94a3b8;
  }

  .card-content {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .clip-name {
    font-size: 11px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .card-tags-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .tag-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 8px;
    font-weight: 600;
    padding: 1px 5px;
    border-radius: 3px;
    background-color: #060b14;
    border: 1px solid #1a355d;
    color: #93c5fd;
  }

  .player-pill {
    color: #38bdf8;
    border-color: rgba(56, 189, 248, 0.3);
  }

  .outcome-pill {
    color: #34d399;
  }

  .drawings-pill {
    color: #f59e0b;
    border-color: rgba(245, 158, 11, 0.3);
  }

  .card-actions-row {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 2px;
    border-top: 1px solid #142845;
    padding-top: 6px;
  }

  .btn-card-draw {
    display: flex;
    align-items: center;
    gap: 4px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-card-label {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: #060b14;
    border: 1px solid #1a355d;
    color: #38bdf8;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-card-label:hover {
    border-color: #38bdf8;
  }

  .btn-card-pl {
    display: flex;
    align-items: center;
    gap: 3px;
    background-color: #060b14;
    border: 1px solid #1a355d;
    color: #94a3b8;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 9px;
    cursor: pointer;
  }

  .btn-card-pl:hover {
    color: #10b981;
    border-color: #10b981;
  }

  .btn-card-play {
    background-color: #060b14;
    border: 1px solid #1a355d;
    color: #94a3b8;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-card-play:hover {
    color: #ffffff;
    border-color: #38bdf8;
  }

  .btn-card-del {
    background: transparent;
    border: none;
    color: #64748b;
    padding: 4px 6px;
    cursor: pointer;
    margin-left: auto;
  }

  .btn-card-del:hover {
    color: #ef4444;
  }

  /* PLAYLIST QUICK PANEL */
  .playlist-quick-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .playlist-quick-header {
    padding: 10px 12px;
    background-color: #0b1528;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pl-quick-title {
    font-size: 11px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .pl-quick-count {
    font-size: 9px;
    font-weight: 700;
    color: #38bdf8;
    background: #060b14;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .playlist-items-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .playlist-quick-row {
    background: #0d1e38;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pl-order {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    font-weight: 900;
    color: #38bdf8;
    background: #060b14;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pl-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .pl-name {
    font-size: 10px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .pl-meta {
    font-size: 8px;
    color: #94a3b8;
  }

  .btn-pl-remove {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
  }

  .btn-pl-remove:hover {
    color: #ef4444;
  }

  .playlist-quick-footer {
    padding: 10px 12px;
    background: #091322;
    border-top: 1px solid #1a355d;
  }

  .btn-open-export {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    padding: 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  /* MODE 2: CODING BOARD FULLSCREEN (MOMEN SPORTS MATRIX) */
  .coding-board-fullscreen {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 18px 24px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 18px;
    background: radial-gradient(circle at 50% 0%, #0d1e38 0%, #060b14 100%);
  }

  .coding-roster-row {
    background: #0b1528;
    border: 1px solid #1a355d;
    border-radius: 10px;
    padding: 12px 16px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .coding-section-title {
    font-size: 10px;
    font-weight: 800;
    color: #38bdf8;
    letter-spacing: 0.05em;
    white-space: nowrap;
  }

  .coding-roster-grid {
    display: flex;
    align-items: center;
    gap: 10px;
    flex-wrap: wrap;
  }

  .coding-player-card {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #060b14;
    border: 1px solid #1a355d;
    padding: 6px 12px;
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .coding-player-card:hover {
    border-color: #38bdf8;
    transform: translateY(-1px);
  }

  .coding-player-card.active {
    background: linear-gradient(135deg, #102e5c, #0d1e38);
    border-color: #38bdf8;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
  }

  .player-num-circle {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    color: #ffffff;
    font-size: 10px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .player-text {
    display: flex;
    flex-direction: column;
    text-align: left;
  }

  .player-name {
    font-size: 11px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .player-role {
    font-size: 8px;
    color: #94a3b8;
  }

  .tactical-phases-container {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 16px;
  }

  .phase-card {
    background: #0b1528;
    border: 1px solid #1a355d;
    border-radius: 12px;
    padding: 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .phase-header {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 800;
    color: #f0f6fc;
    letter-spacing: 0.04em;
    border-bottom: 1px solid #1a355d;
    padding-bottom: 8px;
  }

  .phase-buttons-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 8px;
  }

  .big-coding-btn {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    justify-content: space-between;
    background: #060b14;
    border: 1px solid #1a355d;
    border-left: 4px solid var(--accent-col);
    padding: 10px 12px;
    border-radius: 8px;
    cursor: pointer;
    min-height: 72px;
    transition: all 0.2s ease;
  }

  .big-coding-btn:hover {
    border-color: var(--accent-col);
    background: #0d1e38;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.4);
    transform: translateY(-2px);
  }

  .big-coding-btn:active {
    transform: translateY(0);
  }

  .btn-top {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .btn-emoji {
    font-size: 16px;
  }

  .btn-kbd {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    font-weight: 800;
    color: #94a3b8;
    background: #0d1e38;
    padding: 1px 4px;
    border-radius: 3px;
    border: 1px solid #1a355d;
  }

  .btn-main-label {
    font-size: 11px;
    font-weight: 800;
    color: #f0f6fc;
    margin: 4px 0 2px;
  }

  .btn-roll-desc {
    font-size: 8px;
    color: #94a3b8;
  }

  /* MODE 3: LINEUP FULLSCREEN */
  .lineup-fullscreen {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 18px 24px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .lineup-header h3 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 800;
    color: #38bdf8;
  }

  .lineup-header p {
    margin: 0;
    font-size: 11px;
    color: #94a3b8;
  }

  .lineup-grid-layout {
    display: grid;
    grid-template-columns: 460px 1fr;
    gap: 20px;
  }

  .pitch-tactical-display {
    background: #091322;
    border: 1px solid #1a355d;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pitch-court {
    width: 400px;
    height: 240px;
    background: linear-gradient(180deg, #0b203c 0%, #061122 100%);
    border: 2px solid #38bdf8;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
  }

  .pitch-center-circle {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 60px;
    height: 60px;
    border: 1px solid rgba(56, 189, 248, 0.4);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  .pitch-center-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
    background: rgba(56, 189, 248, 0.4);
  }

  .pitch-penalty-area {
    position: absolute;
    left: 0;
    top: 50%;
    width: 60px;
    height: 120px;
    border: 1px solid rgba(56, 189, 248, 0.4);
    border-left: none;
    transform: translateY(-50%);
    border-radius: 0 40px 40px 0;
  }

  .player-marker {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    transition: transform 0.15s;
  }

  .player-marker:hover {
    transform: scale(1.15);
  }

  .kiper-pos { left: 24px; top: 100px; }
  .anchor-pos { left: 120px; top: 100px; }
  .flank-l-pos { left: 220px; top: 40px; }
  .flank-r-pos { left: 220px; top: 160px; }
  .pivot-pos { left: 320px; top: 100px; }

  .pos-badge {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #0284c7;
    border: 1px solid #ffffff;
    color: #ffffff;
    font-size: 10px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pos-name {
    font-size: 9px;
    font-weight: 700;
    color: #f0f6fc;
    background: rgba(6, 11, 20, 0.85);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .roster-stats-card {
    background: #0b1528;
    border: 1px solid #1a355d;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .roster-stats-card h4 {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    color: #38bdf8;
  }

  .roster-table-wrap {
    overflow-x: auto;
  }

  .roster-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .roster-table th {
    background: #060b14;
    color: #94a3b8;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid #1a355d;
  }

  .roster-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #142845;
  }

  .badge-num {
    padding: 2px 6px;
    border-radius: 4px;
    color: #ffffff;
    font-weight: 800;
    font-size: 9px;
  }

  .count-pill {
    background: #060b14;
    border: 1px solid #1a355d;
    color: #38bdf8;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 700;
  }

  .btn-filter-player {
    background: #0f2444;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-filter-player:hover {
    color: #ffffff;
    border-color: #38bdf8;
  }
</style>

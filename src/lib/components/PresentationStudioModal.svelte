<script lang="ts">
  import { tick } from 'svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type { Point2D, VideoTagEvent } from '$lib/types';
  import { renderDrawingsToCanvas } from '$lib/export/telestrationRenderer';
  import TacticalBoard from '$lib/components/TacticalBoard.svelte';
  import {
    Play,
    Pause,
    ChevronLeft,
    ChevronRight,
    PenTool,
    Eraser,
    LayoutGrid,
    Maximize2,
    Minimize2,
    Volume2,
    VolumeX,
    List,
    X,
    Plus,
    Trash2,
    Undo2,
  } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  type PresentationSlide =
    | { id: string; kind: 'clip'; title: string; tag: VideoTagEvent }
    | { id: string; kind: 'tactical'; title: string };

  interface LiveStroke {
    color: string;
    width: number;
    points: Point2D[];
  }

  const PEN_COLORS = ['#00f0ff', '#f59e0b', '#ef4444', '#10b981', '#ffffff'];

  let slides = $state<PresentationSlide[]>([]);
  let currentSlideIdx = $state(0);
  let showSlideDrawer = $state(false);
  let isFullscreen = $state(false);
  let autoFreezeEnabled = $state(true);
  let voiceoverEnabled = $state(true);

  // Video & telestration playback state
  let videoEl = $state<HTMLVideoElement | null>(null);
  let telCanvasEl = $state<HTMLCanvasElement | null>(null);
  let stageBoxEl = $state<HTMLDivElement | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let isFreezing = $state(false);
  let freezeRemaining = $state(0);
  let freezeTriggeredForSlide = $state(false);
  let freezeTimer: any = null;
  let activeVoiceAudio: HTMLAudioElement | null = null;
  let voicePlayedForSlide = false;

  // Live Annotation Pen state
  let penCanvasEl = $state<HTMLCanvasElement | null>(null);
  let isDrawMode = $state(false);
  let penColor = $state('#00f0ff');
  let isDrawingStroke = $state(false);
  let liveStrokes = $state<LiveStroke[]>([]);
  let activeStroke = $state<LiveStroke | null>(null);

  const currentSlide = $derived(slides[currentSlideIdx] ?? null);

  const activeCameraZoom = $derived(
    isFreezing && currentSlide?.kind === 'clip'
      ? currentSlide.tag.drawings?.find((d) => d.cameraZoomTarget)?.cameraZoomTarget ?? null
      : null
  );

  // Initialize slides whenever modal opens
  $effect(() => {
    if (!isOpen) {
      cleanupMediaAndTimers();
      return;
    }
    const sourceClips =
      projectStore.playlists[0]?.items.length > 0
        ? projectStore.playlists[0].items.map((item) => item.tagEvent)
        : projectStore.tags;

    slides = sourceClips.map((tag, idx) => ({
      id: `clip-${tag.id}-${idx}`,
      kind: 'clip',
      title: tag.title,
      tag,
    }));
    currentSlideIdx = 0;
    liveStrokes = [];
    isDrawMode = false;
    loadCurrentSlideMedia(true);
  });

  // Render loop & keyboard bindings while open
  $effect(() => {
    if (!isOpen) return;
    let active = true;
    let rafId: number | null = null;

    tick().then(() => {
      if (active) syncCanvases();
    });

    const onResize = () => syncCanvases();
    const onFsChange = () => {
      isFullscreen = Boolean(document.fullscreenElement);
      syncCanvases();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const tagName = (e.target as HTMLElement)?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;

      const key = e.key.toLowerCase();
      if (key === 'd') {
        e.preventDefault();
        isDrawMode = !isDrawMode;
      } else if (key === 'c') {
        e.preventDefault();
        clearLiveStrokes();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToSlide(currentSlideIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToSlide(currentSlideIdx - 1);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (currentSlide?.kind === 'clip') togglePlayPause();
      } else if (key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (isDrawMode) {
          isDrawMode = false;
        } else {
          handleClose();
        }
      }
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFsChange);

    const loop = () => {
      if (!active) return;
      if (currentSlide?.kind === 'clip' && videoEl && !videoEl.paused) {
        currentTime = videoEl.currentTime;
        const tag = currentSlide.tag;
        const freezeAt = tag.freezeTimestamp ?? (tag.startTime + tag.endTime) / 2;

        if (
          autoFreezeEnabled &&
          !freezeTriggeredForSlide &&
          !isFreezing &&
          tag.drawings &&
          tag.drawings.length > 0 &&
          currentTime >= freezeAt &&
          currentTime < freezeAt + 0.35
        ) {
          triggerSlideFreeze(tag);
        } else if (currentTime >= tag.endTime) {
          if (currentSlideIdx + 1 < slides.length) {
            goToSlide(currentSlideIdx + 1);
          } else {
            videoEl.pause();
            isPlaying = false;
          }
        }
      }
      drawTelestrationOverlay();
      drawPenOverlay();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      active = false;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFsChange);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  });

  function cleanupMediaAndTimers() {
    if (freezeTimer) {
      clearInterval(freezeTimer);
      freezeTimer = null;
    }
    if (activeVoiceAudio) {
      activeVoiceAudio.pause();
      activeVoiceAudio = null;
    }
    if (videoEl) {
      videoEl.pause();
    }
    isFreezing = false;
    isPlaying = false;
  }

  function syncCanvases() {
    if (!stageBoxEl) return;
    const rect = stageBoxEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    for (const c of [telCanvasEl, penCanvasEl]) {
      if (!c) continue;
      c.width = Math.max(1, Math.round(rect.width * dpr));
      c.height = Math.max(1, Math.round(rect.height * dpr));
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
    }
  }

  function drawTelestrationOverlay() {
    if (!telCanvasEl) return;
    const ctx = telCanvasEl.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = telCanvasEl.width / dpr;
    const h = telCanvasEl.height / dpr;
    ctx.save();
    ctx.clearRect(0, 0, telCanvasEl.width, telCanvasEl.height);
    ctx.scale(dpr, dpr);

    if (currentSlide?.kind === 'clip' && currentSlide.tag.drawings?.length) {
      renderDrawingsToCanvas(ctx, currentSlide.tag.drawings, w, h, currentTime, {
        videoEl,
        chromaConfig: projectStore.chromaFloorConfig,
        clipStartTime: currentSlide.tag.startTime,
        animElapsedSec: isFreezing ? 1.0 : undefined,
      });
    }
    ctx.restore();
  }

  function drawPenOverlay() {
    if (!penCanvasEl) return;
    const ctx = penCanvasEl.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = penCanvasEl.width / dpr;
    const h = penCanvasEl.height / dpr;
    ctx.save();
    ctx.clearRect(0, 0, penCanvasEl.width, penCanvasEl.height);
    ctx.scale(dpr, dpr);

    const all = activeStroke ? [...liveStrokes, activeStroke] : liveStrokes;
    for (const st of all) {
      if (st.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(st.points[0].x * w, st.points[0].y * h);
      for (let i = 1; i < st.points.length; i++) {
        ctx.lineTo(st.points[i].x * w, st.points[i].y * h);
      }
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  async function loadCurrentSlideMedia(autoPlay: boolean) {
    cleanupMediaAndTimers();
    freezeTriggeredForSlide = false;
    voicePlayedForSlide = false;
    await tick();
    syncCanvases();

    if (currentSlide?.kind === 'clip') {
      currentTime = currentSlide.tag.startTime;
      if (videoEl) {
        videoEl.currentTime = currentSlide.tag.startTime;
        if (autoPlay && projectStore.videoSrc) {
          videoEl.play().catch(() => {});
          isPlaying = true;
        }
      }
      if (voiceoverEnabled && currentSlide.tag.voiceoverAudioBase64 && !autoFreezeEnabled) {
        playSlideVoiceover(currentSlide.tag);
      }
    }
  }

  function playSlideVoiceover(tag: VideoTagEvent) {
    if (!voiceoverEnabled || !tag.voiceoverAudioBase64 || voicePlayedForSlide) return;
    voicePlayedForSlide = true;
    try {
      activeVoiceAudio = new Audio(tag.voiceoverAudioBase64);
      activeVoiceAudio.play().catch(() => {});
    } catch {
      activeVoiceAudio = null;
    }
  }

  function triggerSlideFreeze(tag: VideoTagEvent) {
    if (!videoEl) return;
    videoEl.pause();
    isPlaying = false;
    isFreezing = true;
    freezeTriggeredForSlide = true;
    freezeRemaining = tag.pauseDuration || 3.0;
    playSlideVoiceover(tag);

    if (freezeTimer) clearInterval(freezeTimer);
    freezeTimer = setInterval(() => {
      freezeRemaining -= 0.1;
      if (freezeRemaining <= 0) {
        resumeFromFreeze();
      }
    }, 100);
  }

  function resumeFromFreeze() {
    if (freezeTimer) {
      clearInterval(freezeTimer);
      freezeTimer = null;
    }
    isFreezing = false;
    if (videoEl && currentSlide?.kind === 'clip') {
      videoEl.play().catch(() => {});
      isPlaying = true;
    }
  }

  function togglePlayPause() {
    if (!videoEl || currentSlide?.kind !== 'clip') return;
    if (isFreezing) {
      resumeFromFreeze();
      return;
    }
    if (videoEl.paused) {
      videoEl.play().catch(() => {});
      isPlaying = true;
    } else {
      videoEl.pause();
      isPlaying = false;
    }
  }

  function goToSlide(nextIdx: number) {
    if (slides.length === 0) return;
    const clamped = Math.max(0, Math.min(slides.length - 1, nextIdx));
    if (clamped === currentSlideIdx && currentSlide) return;
    currentSlideIdx = clamped;
    liveStrokes = [];
    loadCurrentSlideMedia(true);
  }

  function insertTacticalSlide() {
    const tacCount = slides.filter((s) => s.kind === 'tactical').length + 1;
    const newSlide: PresentationSlide = {
      id: `tac-${Date.now()}`,
      kind: 'tactical',
      title: `Papan Taktik 2D #${tacCount}`,
    };
    const insertAt = slides.length === 0 ? 0 : currentSlideIdx + 1;
    slides = [...slides.slice(0, insertAt), newSlide, ...slides.slice(insertAt)];
    currentSlideIdx = insertAt;
    liveStrokes = [];
    loadCurrentSlideMedia(false);
  }

  function removeSlideAt(idx: number) {
    if (idx < 0 || idx >= slides.length) return;
    slides = slides.filter((_, i) => i !== idx);
    if (currentSlideIdx >= slides.length) {
      currentSlideIdx = Math.max(0, slides.length - 1);
    }
    liveStrokes = [];
    loadCurrentSlideMedia(false);
  }

  // Live Pen Pointer Handlers
  function getNormPt(e: PointerEvent): Point2D {
    if (!penCanvasEl) return { x: 0, y: 0 };
    const r = penCanvasEl.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height))),
    };
  }

  function onPenDown(e: PointerEvent) {
    if (!isDrawMode) return;
    isDrawingStroke = true;
    activeStroke = { color: penColor, width: 4, points: [getNormPt(e)] };
  }

  function onPenMove(e: PointerEvent) {
    if (!isDrawMode || !isDrawingStroke || !activeStroke) return;
    activeStroke = {
      ...activeStroke,
      points: [...activeStroke.points, getNormPt(e)],
    };
  }

  function onPenUp() {
    if (!isDrawingStroke || !activeStroke) return;
    isDrawingStroke = false;
    if (activeStroke.points.length >= 2) {
      liveStrokes = [...liveStrokes, activeStroke];
    }
    activeStroke = null;
  }

  function clearLiveStrokes() {
    liveStrokes = [];
    activeStroke = null;
  }

  function undoLiveStroke() {
    if (liveStrokes.length > 0) {
      liveStrokes = liveStrokes.slice(0, -1);
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if environment rejects fullscreen
    }
  }

  function handleClose() {
    cleanupMediaAndTimers();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  }
</script>

{#if isOpen}
<div class="presenter-overlay" role="dialog" aria-label="Fullscreen Presentation Studio" tabindex="-1">
  <!-- TOP MINIMAL HUD -->
  <div class="presenter-top-hud">
    <div class="pth-left">
      <span class="pth-badge">PRESENTER STUDIO</span>
      <span class="pth-match">{projectStore.videoTitle}</span>
      {#if currentSlide}
        <span class="pth-slide-pill">
          Slide {currentSlideIdx + 1}/{slides.length}: <strong>{currentSlide.title}</strong>
        </span>
        {#if currentSlide.kind === 'clip' && projectStore.periodKickoffs.length > 0}
          <span class="pth-clock">
            {projectStore.formatMatchClock(currentTime)}
          </span>
        {/if}
      {/if}
    </div>

    <div class="pth-right">
      <button type="button" class="hud-btn" onclick={() => (showSlideDrawer = !showSlideDrawer)}>
        <List size={14} />
        <span>Daftar Slide ({slides.length})</span>
      </button>
      <button type="button" class="hud-btn" onclick={insertTacticalSlide} title="Sisipkan Slide Papan Taktik 2D">
        <Plus size={14} />
        <span>+ Taktik 2D</span>
      </button>
      <button type="button" class="hud-btn" onclick={toggleFullscreen} title="Toggle Layar Penuh (F)">
        {#if isFullscreen}
          <Minimize2 size={14} />
        {:else}
          <Maximize2 size={14} />
        {/if}
      </button>
      <button type="button" class="hud-btn hud-exit" onclick={handleClose} title="Keluar Presentasi (Esc)">
        <X size={15} />
        <span>Keluar</span>
      </button>
    </div>
  </div>

  <!-- STAGE AREA -->
  <div class="presenter-stage-wrap">
    {#if showSlideDrawer}
      <aside class="slide-drawer">
        <div class="sd-hdr">
          <span>SUSUNAN BRIEFING ({slides.length})</span>
          <button type="button" class="sd-close" onclick={() => (showSlideDrawer = false)}>
            <X size={13} />
          </button>
        </div>
        <div class="sd-list">
          {#each slides as s, idx (s.id)}
            <div class="sd-row" class:active={idx === currentSlideIdx}>
              <button type="button" class="sd-select" onclick={() => goToSlide(idx)}>
                <span class="sd-num">{idx + 1}</span>
                <span class="sd-kind">{s.kind === 'tactical' ? '2D' : 'VID'}</span>
                <span class="sd-title">{s.title}</span>
              </button>
              {#if s.kind === 'tactical'}
                <button type="button" class="sd-del" onclick={() => removeSlideAt(idx)} title="Hapus slide taktik">
                  <Trash2 size={12} />
                </button>
              {/if}
            </div>
          {/each}
        </div>
      </aside>
    {/if}

    <div class="stage-viewport" bind:this={stageBoxEl}>
      {#if !currentSlide}
        <div class="empty-stage">
          <h3>Belum Ada Klip atau Slide Presentasi</h3>
          <p>Tambahkan klip ke Playlist di workspace Tagging, atau klik <strong>+ Taktik 2D</strong> untuk membuka papan taktik.</p>
          <button type="button" class="hud-btn hud-primary" onclick={insertTacticalSlide}>
            <LayoutGrid size={15} />
            <span>Buka Papan Taktik 2D</span>
          </button>
        </div>
      {:else if currentSlide.kind === 'tactical'}
        <div class="tactical-slide-host">
          <TacticalBoard />
        </div>
      {:else}
        <div
          class="video-zoom-host"
          style={activeCameraZoom
            ? `transform: scale(${activeCameraZoom.scale}); transform-origin: ${activeCameraZoom.x * 100}% ${activeCameraZoom.y * 100}%;`
            : ''}
        >
          {#if projectStore.videoSrc}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={videoEl}
              src={projectStore.videoSrc}
              crossorigin="anonymous"
              class="presenter-video"
              onclick={togglePlayPause}
            ></video>
          {:else}
            <div class="mock-clip-slide">
              <span class="mock-cat" style="background-color: {currentSlide.tag.color};">
                {currentSlide.tag.category}
              </span>
              <h2>{currentSlide.title}</h2>
              <p>
                {currentSlide.tag.playerLabel || ''} · {currentSlide.tag.startTime.toFixed(1)}s – {currentSlide.tag.endTime.toFixed(1)}s
              </p>
            </div>
          {/if}

          <canvas bind:this={telCanvasEl} class="tel-overlay-canvas"></canvas>
        </div>

        {#if isFreezing}
          <div class="freeze-pill-hud">
            <span class="fp-dot"></span>
            <span>FREEZE ANALISIS · {Math.max(0, freezeRemaining).toFixed(1)}s</span>
            <button type="button" class="fp-resume" onclick={resumeFromFreeze}>Lanjut</button>
          </div>
        {/if}
      {/if}

      <!-- LIVE ANNOTATION PEN LAYER -->
      <canvas
        bind:this={penCanvasEl}
        class="pen-overlay-canvas"
        class:drawing={isDrawMode}
        onpointerdown={onPenDown}
        onpointermove={onPenMove}
        onpointerup={onPenUp}
      ></canvas>
    </div>
  </div>

  <!-- BOTTOM CONTROL HUD -->
  <div class="presenter-bottom-hud">
    <div class="pbh-group">
      <button
        type="button"
        class="hud-btn"
        disabled={currentSlideIdx <= 0}
        onclick={() => goToSlide(currentSlideIdx - 1)}
        title="Slide Sebelumnya (←)"
      >
        <ChevronLeft size={15} />
        <span>Prev</span>
      </button>

      {#if currentSlide?.kind === 'clip'}
        <button type="button" class="hud-btn hud-primary" onclick={togglePlayPause} title="Play / Pause (Spasi)">
          {#if isPlaying}
            <Pause size={15} />
          {:else}
            <Play size={15} />
          {/if}
        </button>
      {/if}

      <button
        type="button"
        class="hud-btn"
        disabled={currentSlideIdx >= slides.length - 1}
        onclick={() => goToSlide(currentSlideIdx + 1)}
        title="Slide Berikutnya (→)"
      >
        <span>Next</span>
        <ChevronRight size={15} />
      </button>
    </div>

    <div class="pbh-group">
      <button
        type="button"
        class="hud-btn"
        class:active-draw={isDrawMode}
        onclick={() => (isDrawMode = !isDrawMode)}
        title="Coret langsung di proyektor (D)"
      >
        <PenTool size={14} />
        <span>{isDrawMode ? 'Pen Aktif (D)' : 'Coret (D)'}</span>
      </button>

      <div class="pen-colors">
        {#each PEN_COLORS as c}
          <button
            type="button"
            class="pen-dot"
            class:selected={penColor === c}
            style="background-color: {c};"
            onclick={() => {
              penColor = c;
              isDrawMode = true;
            }}
            aria-label="Warna pena {c}"
          ></button>
        {/each}
      </div>

      <button type="button" class="hud-btn" onclick={undoLiveStroke} title="Undo coretan terakhir">
        <Undo2 size={14} />
      </button>
      <button type="button" class="hud-btn" onclick={clearLiveStrokes} title="Hapus semua coretan (C)">
        <Eraser size={14} />
        <span>Hapus (C)</span>
      </button>
    </div>

    <div class="pbh-group">
      <label class="hud-toggle">
        <input type="checkbox" bind:checked={autoFreezeEnabled} />
        <span>Auto-Freeze</span>
      </label>
      <button
        type="button"
        class="hud-btn"
        onclick={() => (voiceoverEnabled = !voiceoverEnabled)}
        title="Suara Voiceover Pelatih"
      >
        {#if voiceoverEnabled}
          <Volume2 size={14} />
        {:else}
          <VolumeX size={14} />
        {/if}
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  .presenter-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: #030712;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .presenter-top-hud,
  .presenter-bottom-hud {
    height: 46px;
    min-height: 46px;
    background: rgba(7, 14, 28, 0.94);
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    gap: 10px;
    flex-shrink: 0;
  }

  .presenter-bottom-hud {
    border-bottom: none;
    border-top: 1px solid #1a355d;
  }

  .pth-left,
  .pth-right,
  .pbh-group {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .pth-badge {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.08em;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .pth-match {
    font-size: 11px;
    font-weight: 700;
    color: #93c5fd;
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pth-slide-pill {
    font-size: 11px;
    color: #cbd5e1;
    background: #0b172a;
    border: 1px solid #1a355d;
    padding: 3px 9px;
    border-radius: 999px;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pth-clock {
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    font-weight: 800;
    color: #34d399;
    background: rgba(16, 185, 129, 0.14);
    border: 1px solid rgba(16, 185, 129, 0.4);
    padding: 2px 7px;
    border-radius: 4px;
  }

  .hud-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0b172a;
    border: 1px solid #1e3a5f;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .hud-btn:hover:not(:disabled) {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .hud-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .hud-btn.hud-primary {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border-color: #38bdf8;
    color: #ffffff;
  }

  .hud-btn.active-draw {
    background: #059669;
    border-color: #34d399;
    color: #ffffff;
  }

  .hud-btn.hud-exit {
    border-color: #7f1d1d;
    color: #fca5a5;
  }

  .hud-btn.hud-exit:hover {
    background: #b91c1c;
    color: #ffffff;
  }

  .presenter-stage-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  .slide-drawer {
    width: 260px;
    background: #07101f;
    border-right: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sd-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    font-size: 10px;
    font-weight: 800;
    color: #38bdf8;
    border-bottom: 1px solid #1a355d;
  }

  .sd-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }

  .sd-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .sd-row {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #0b1629;
    border: 1px solid #152b4f;
    border-radius: 6px;
    padding: 4px;
  }

  .sd-row.active {
    border-color: #38bdf8;
    background: #102a4d;
  }

  .sd-select {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #e2e8f0;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }

  .sd-num {
    font-family: monospace;
    font-weight: 800;
    color: #38bdf8;
  }

  .sd-kind {
    font-size: 8.5px;
    font-weight: 900;
    padding: 1px 4px;
    border-radius: 3px;
    background: #1e293b;
    color: #93c5fd;
  }

  .sd-title {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sd-del {
    background: transparent;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 3px;
  }

  .stage-viewport {
    flex: 1;
    min-width: 0;
    position: relative;
    background: #000000;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .tactical-slide-host {
    width: 100%;
    height: 100%;
  }

  .video-zoom-host {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .presenter-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .tel-overlay-canvas {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
  }

  .pen-overlay-canvas {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 25;
  }

  .pen-overlay-canvas.drawing {
    pointer-events: auto;
    cursor: crosshair;
  }

  .freeze-pill-hud {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(8, 22, 42, 0.92);
    border: 1px solid #38bdf8;
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 11px;
    font-weight: 800;
    color: #38bdf8;
  }

  .fp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
  }

  .fp-resume {
    background: #0284c7;
    border: none;
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: 999px;
    cursor: pointer;
  }

  .empty-stage,
  .mock-clip-slide {
    text-align: center;
    color: #cbd5e1;
    max-width: 480px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .mock-cat {
    font-size: 11px;
    font-weight: 900;
    color: #ffffff;
    padding: 3px 10px;
    border-radius: 999px;
  }

  .pen-colors {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .pen-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
  }

  .pen-dot.selected {
    border-color: #ffffff;
    transform: scale(1.15);
  }

  .hud-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #cbd5e1;
    cursor: pointer;
  }

  @media (max-width: 1120px) {
    .pth-match {
      display: none;
    }
    .hud-btn span {
      display: none;
    }
  }
</style>

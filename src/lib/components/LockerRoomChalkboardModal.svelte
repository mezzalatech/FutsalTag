<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type { VideoTagEvent, Point2D } from '$lib/types';
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    RotateCcw,
    Trash2,
    X,
    Maximize,
    Sparkles,
    MoveRight,
    CircleDot,
    Volume2,
    Check,
  } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  let videoEl = $state<HTMLVideoElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let containerEl = $state<HTMLDivElement | null>(null);

  let activeClipIdx = $state(0);
  let isPlaying = $state(false);
  let currentTime = $state(0);

  // Chalkboard drawing state
  type ChalkTool = 'pen' | 'spotlight' | 'arrow';
  let activeTool = $state<ChalkTool>('pen');
  let activeColor = $state('#00f0ff');
  let isDrawing = $state(false);

  interface ChalkStroke {
    tool: ChalkTool;
    color: string;
    points: Point2D[];
  }

  let strokes = $state<ChalkStroke[]>([]);
  let currentStroke = $state<ChalkStroke | null>(null);

  const activeClips = $derived(
    projectStore.playlists[0]?.items?.map((item) => item.tagEvent) || projectStore.tags
  );

  let currentClip = $derived(
    activeClips[activeClipIdx] || activeClips[0] || null
  );

  const CHALK_COLORS = ['#00f0ff', '#f59e0b', '#ef4444', '#10b981', '#ffffff'];

  onMount(() => {
    syncCanvas();
    window.addEventListener('resize', syncCanvas);
    requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', syncCanvas);
    };
  });

  function syncCanvas() {
    if (!containerEl || !canvasEl) return;
    const rect = containerEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = rect.width * dpr;
    canvasEl.height = rect.height * dpr;
    canvasEl.style.width = `${rect.width}px`;
    canvasEl.style.height = `${rect.height}px`;
  }

  function renderLoop() {
    if (videoEl && !videoEl.paused) {
      currentTime = videoEl.currentTime;
      if (currentClip && currentTime >= currentClip.endTime) {
        // Step to next clip or loop
        if (activeClipIdx + 1 < activeClips.length) {
          selectClip(activeClipIdx + 1);
        } else {
          videoEl.pause();
          isPlaying = false;
        }
      }
    }
    drawCanvas();
    requestAnimationFrame(renderLoop);
  }

  function drawCanvas() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.scale(dpr, dpr);

    const w = canvasEl.width / dpr;
    const h = canvasEl.height / dpr;

    for (const stroke of strokes) {
      drawStroke(ctx, stroke, w, h);
    }
    if (currentStroke) {
      drawStroke(ctx, currentStroke, w, h);
    }

    ctx.restore();
  }

  function drawStroke(ctx: CanvasRenderingContext2D, s: ChalkStroke, w: number, h: number) {
    if (s.points.length === 0) return;
    ctx.save();

    if (s.tool === 'pen') {
      ctx.beginPath();
      ctx.moveTo(s.points[0].x * w, s.points[0].y * h);
      for (let i = 1; i < s.points.length; i++) {
        ctx.lineTo(s.points[i].x * w, s.points[i].y * h);
      }
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 8;
      ctx.stroke();
    } else if (s.tool === 'spotlight') {
      const p = s.points[0];
      const cx = p.x * w;
      const cy = p.y * h;
      const r = 40;

      ctx.beginPath();
      ctx.arc(cx, cy, r, 0, Math.PI * 2);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 3;
      ctx.shadowColor = s.color;
      ctx.shadowBlur = 12;
      ctx.stroke();

      ctx.fillStyle = 'rgba(0, 240, 255, 0.2)';
      ctx.fill();
    } else if (s.tool === 'arrow') {
      if (s.points.length < 2) return;
      const p1 = { x: s.points[0].x * w, y: s.points[0].y * h };
      const p2 = { x: s.points[1].x * w, y: s.points[1].y * h };

      ctx.beginPath();
      ctx.moveTo(p1.x, p1.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.strokeStyle = s.color;
      ctx.lineWidth = 4;
      ctx.stroke();

      const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
      const headlen = 16;
      ctx.beginPath();
      ctx.moveTo(p2.x, p2.y);
      ctx.lineTo(
        p2.x - headlen * Math.cos(angle - Math.PI / 6),
        p2.y - headlen * Math.sin(angle - Math.PI / 6)
      );
      ctx.lineTo(
        p2.x - headlen * Math.cos(angle + Math.PI / 6),
        p2.y - headlen * Math.sin(angle + Math.PI / 6)
      );
      ctx.closePath();
      ctx.fillStyle = s.color;
      ctx.fill();
    }

    ctx.restore();
  }

  // Live Chalkboard interaction: Touching/clicking automatically pauses video!
  function handlePointerDown(e: PointerEvent) {
    if (!canvasEl) return;
    // Auto-pause immediately when coach touches screen!
    if (videoEl && !videoEl.paused) {
      videoEl.pause();
      isPlaying = false;
    }

    isDrawing = true;
    const rect = canvasEl.getBoundingClientRect();
    const pt: Point2D = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };

    currentStroke = {
      tool: activeTool,
      color: activeColor,
      points: [pt],
    };
  }

  function handlePointerMove(e: PointerEvent) {
    if (!isDrawing || !currentStroke || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const pt: Point2D = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };

    if (currentStroke.tool === 'pen') {
      currentStroke.points.push(pt);
    } else {
      if (currentStroke.points.length === 1) {
        currentStroke.points.push(pt);
      } else {
        currentStroke.points[1] = pt;
      }
    }
  }

  function handlePointerUp() {
    if (currentStroke) {
      strokes.push(currentStroke);
      currentStroke = null;
    }
    isDrawing = false;
  }

  function clearAndResume() {
    strokes = [];
    currentStroke = null;
    if (videoEl) {
      videoEl.play();
      isPlaying = true;
    }
  }

  function selectClip(idx: number) {
    activeClipIdx = idx;
    strokes = [];
    currentStroke = null;
    if (videoEl && activeClips[idx]) {
      videoEl.currentTime = activeClips[idx].startTime;
      videoEl.play();
      isPlaying = true;
    }
  }

  function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play();
      isPlaying = true;
    } else {
      videoEl.pause();
      isPlaying = false;
    }
  }

  function stepFrame(step: number) {
    if (!videoEl) return;
    videoEl.pause();
    isPlaying = false;
    videoEl.currentTime = Math.max(0, videoEl.currentTime + step * 0.04);
  }
</script>

{#if isOpen}
  <div class="chalkboard-overlay">
    <!-- TOP THEATER BAR -->
    <header class="chalkboard-header">
      <div class="header-left">
        <span class="live-pill">⚽ HALFTIME CHALKBOARD</span>
        <span class="clip-title-text">{currentClip ? currentClip.title : 'Evaluasi Taktik Ruang Ganti'}</span>
      </div>

      <div class="header-center">
        <!-- CHALK TOOLS -->
        <div class="tool-pills">
          <button
            class="pill-btn"
            class:active={activeTool === 'pen'}
            onclick={() => (activeTool = 'pen')}
          >
            <Sparkles size={14} />
            <span>Spidol Taktik</span>
          </button>
          <button
            class="pill-btn"
            class:active={activeTool === 'spotlight'}
            onclick={() => (activeTool = 'spotlight')}
          >
            <CircleDot size={14} />
            <span>Sorot Pemain</span>
          </button>
          <button
            class="pill-btn"
            class:active={activeTool === 'arrow'}
            onclick={() => (activeTool = 'arrow')}
          >
            <MoveRight size={14} />
            <span>Panah Lari</span>
          </button>
        </div>

        <!-- COLORS -->
        <div class="color-swatches">
          {#each CHALK_COLORS as col}
            <button
              class="color-dot"
              style="background-color: {col}"
              class:selected={activeColor === col}
              onclick={() => (activeColor = col)}
              aria-label="Pilih warna {col}"
            ></button>
          {/each}
        </div>
      </div>

      <div class="header-right">
        <button class="btn-clear-resume" onclick={clearAndResume} title="Hapus coretan dan lanjut video">
          <RotateCcw size={14} />
          <span>Hapus & Lanjut Putar</span>
        </button>
        <button class="btn-close" onclick={onClose} title="Keluar mode ruang ganti">
          <X size={18} />
        </button>
      </div>
    </header>

    <!-- MAIN CHALKBOARD BODY -->
    <div class="chalkboard-body">
      <!-- CENTER: VIDEO & CHALK CANVAS -->
      <div class="theater-screen-container" bind:this={containerEl}>
        {#if projectStore.videoSrc}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoEl}
            src={projectStore.videoSrc}
            class="theater-video"
            onloadedmetadata={() => {
              if (videoEl && currentClip) {
                videoEl.currentTime = currentClip.startTime;
              }
            }}
          ></video>
        {:else}
          <div class="mock-theater-court">
            <h3>Mode Layar Penuh Ruang Ganti</h3>
            <p>Sentuh atau coret layar langsung saat video diputar untuk auto-pause & evaluasi instan.</p>
          </div>
        {/if}

        <canvas
          bind:this={canvasEl}
          class="theater-canvas"
          onpointerdown={handlePointerDown}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
        ></canvas>
      </div>

      <!-- RIGHT: PLAYLIST CLIPS DRAWER -->
      <aside class="clips-drawer">
        <div class="drawer-title">DAFTAR EVALUASI ({activeClips.length})</div>
        <div class="drawer-list">
          {#each activeClips as clip, idx}
            <button
              class="drawer-item"
              class:selected={idx === activeClipIdx}
              onclick={() => selectClip(idx)}
            >
              <span class="drawer-cat" style="background-color: {clip.color}">{clip.category}</span>
              <span class="drawer-name">{clip.title}</span>
              <span class="drawer-time">{clip.startTime.toFixed(1)}s</span>
            </button>
          {/each}
        </div>
      </aside>
    </div>

    <!-- FLOATING BOTTOM CONTROLS -->
    <footer class="chalkboard-footer">
      <div class="transport-cluster">
        <button class="btn-ctrl" onclick={() => stepFrame(-1)} title="Mundur 1 Frame">-1F</button>
        <button class="btn-play-pause" onclick={togglePlay}>
          {#if isPlaying}
            <Pause size={18} />
          {:else}
            <Play size={18} />
          {/if}
        </button>
        <button class="btn-ctrl" onclick={() => stepFrame(1)} title="Maju 1 Frame">+1F</button>

        <span class="time-readout">
          {currentTime.toFixed(2)}s / {(currentClip ? currentClip.endTime : 0).toFixed(2)}s
        </span>
      </div>

      <div class="hint-text">
        💡 <strong>Tip Pelatih:</strong> Sentuh atau klik di atas layar video saat diputar untuk otomatis menjeda (*auto-pause*) dan mencoret taktik secara langsung!
      </div>
    </footer>
  </div>
{/if}

<style>
  .chalkboard-overlay {
    position: fixed;
    inset: 0;
    z-index: 1000;
    background: #02050a;
    display: flex;
    flex-direction: column;
    color: #f8fafc;
    overflow: hidden;
  }

  .chalkboard-header {
    height: 52px;
    background: linear-gradient(180deg, #0d1e38 0%, #060e1c 100%);
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

  .live-pill {
    background: rgba(2, 132, 199, 0.25);
    border: 1px solid #38bdf8;
    color: #38bdf8;
    font-size: 10px;
    font-weight: 800;
    padding: 4px 8px;
    border-radius: 6px;
    letter-spacing: 0.05em;
  }

  .clip-title-text {
    font-size: 13px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .header-center {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .tool-pills {
    display: flex;
    background: #0b172a;
    border: 1px solid #1e3b68;
    border-radius: 8px;
    padding: 2px;
    gap: 2px;
  }

  .pill-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .pill-btn:hover {
    color: #ffffff;
    background: #142a4d;
  }

  .pill-btn.active {
    background: #0284c7;
    color: #ffffff;
  }

  .color-swatches {
    display: flex;
    gap: 6px;
  }

  .color-dot {
    width: 20px;
    height: 20px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .color-dot.selected {
    border-color: #ffffff;
    transform: scale(1.2);
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-clear-resume {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #059669;
    border: none;
    color: #ffffff;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-clear-resume:hover {
    background: #047857;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
  }

  .btn-close:hover {
    color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
  }

  /* BODY */
  .chalkboard-body {
    flex: 1;
    display: flex;
    overflow: hidden;
  }

  .theater-screen-container {
    flex: 1;
    position: relative;
    background: #000000;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .theater-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .mock-theater-court {
    text-align: center;
    color: #64748b;
  }

  .mock-theater-court h3 {
    color: #38bdf8;
    margin: 0 0 8px 0;
  }

  .theater-canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    z-index: 10;
  }

  /* CLIPS DRAWER */
  .clips-drawer {
    width: 260px;
    background: #07101e;
    border-left: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    padding: 12px;
    gap: 8px;
    flex-shrink: 0;
    overflow-y: auto;
  }

  .drawer-title {
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #93c5fd;
  }

  .drawer-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .drawer-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #0c1a33;
    border: 1px solid #1e3b68;
    border-radius: 6px;
    color: #cbd5e1;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .drawer-item:hover {
    border-color: #38bdf8;
    background: #142a4d;
    color: #ffffff;
  }

  .drawer-item.selected {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
    color: #38bdf8;
  }

  .drawer-cat {
    font-size: 9px;
    font-weight: 800;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .drawer-name {
    font-size: 11px;
    font-weight: 600;
    flex: 1;
    margin: 0 8px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .drawer-time {
    font-family: monospace;
    font-size: 10px;
    color: #64748b;
  }

  /* FOOTER */
  .chalkboard-footer {
    height: 48px;
    background: #081224;
    border-top: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .transport-cluster {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .btn-ctrl {
    background: #0f2444;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-play-pause {
    background: #0284c7;
    border: none;
    color: #ffffff;
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .time-readout {
    font-family: monospace;
    font-size: 12px;
    font-weight: 700;
    color: #38bdf8;
    margin-left: 8px;
  }

  .hint-text {
    font-size: 11px;
    color: #94a3b8;
  }
</style>

<script lang="ts">
  import { onMount } from 'svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type {
    VideoTagEvent,
    DrawingElement,
    DrawingToolType,
    Point2D,
  } from '$lib/types';
  import {
    runMultiPlayerAutoTracking,
    generateFutsalPlayerSeeds,
  } from '$lib/tracking/multiPlayerTracker';
  import { getInterpolatedPosition } from '$lib/tracking/playerTracker';
  import {
    Sparkles,
    MoveRight,
    Eye,
    Ruler,
    Type,
    Trash2,
    Users,
    ArrowLeft,
    Check,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Clock,
    Layers,
    Share2,
    Sliders,
    ArrowRight,
  } from 'lucide-svelte';

  // --- REFS & STATE ---
  let videoEl = $state<HTMLVideoElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let videoContainer = $state<HTMLDivElement | null>(null);

  let activeClip = $derived(
    projectStore.activeClipForDrawing || projectStore.tags[0] || null
  );

  let currentTime = $state(0);
  let duration = $state(120);
  let isPlaying = $state(false);
  let isPreviewing = $state(false);

  // Telestration Drawing State
  let activeTool = $state<DrawingToolType>('spotlight-3d');
  let activeColor = $state('#00f0ff');
  let drawings = $state<DrawingElement[]>([]);
  let inProgressDrawing = $state<DrawingElement | null>(null);
  let pauseDuration = $state(3.0); // freeze duration in seconds

  // AI Tracking state
  let isMultiTracking = $state(false);

  const TOOLS: { id: DrawingToolType; label: string; icon: any }[] = [
    { id: 'spotlight-3d', label: '3D Spotlight Futsal', icon: Sparkles },
    { id: 'player-circle', label: 'Lingkaran Pemain', icon: Sparkles },
    { id: 'vision-cone', label: 'Radar Visi (FOV)', icon: Eye },
    { id: 'pass-arrow', label: 'Panah Operan', icon: MoveRight },
    { id: 'run-arrow', label: 'Panah Lari (Dashed)', icon: MoveRight },
    { id: 'distance-line', label: 'Garis Jarak', icon: Ruler },
    { id: 'note-text', label: 'Catatan Taktik', icon: Type },
    { id: 'freehand', label: 'Gambar Bebas', icon: Sparkles },
  ];

  const PALETTE = ['#00f0ff', '#10b981', '#f59e0b', '#ef4444', '#ec4899', '#ffffff'];

  onMount(() => {
    if (activeClip) {
      drawings = activeClip.drawings ? [...activeClip.drawings] : [];
      pauseDuration = activeClip.pauseDuration || 3.0;
      currentTime = activeClip.startTime;
    }

    syncCanvasSize();
    requestAnimationFrame(renderLoop);
    window.addEventListener('resize', syncCanvasSize);

    return () => {
      window.removeEventListener('resize', syncCanvasSize);
    };
  });

  function syncCanvasSize() {
    if (!videoContainer || !canvasEl) return;
    const rect = videoContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = rect.width * dpr;
    canvasEl.height = rect.height * dpr;
    canvasEl.style.width = `${rect.width}px`;
    canvasEl.style.height = `${rect.height}px`;
  }

  function renderLoop() {
    if (videoEl && !videoEl.paused) {
      currentTime = videoEl.currentTime;

      // Restrict playback to active clip during preview
      if (activeClip && currentTime >= activeClip.endTime) {
        videoEl.pause();
        isPlaying = false;
        isPreviewing = false;
        videoEl.currentTime = activeClip.startTime;
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

    for (const d of drawings) {
      drawVideoElement(ctx, d, w, h);
    }

    if (inProgressDrawing) {
      drawVideoElement(ctx, inProgressDrawing, w, h);
    }

    ctx.restore();
  }

  function drawVideoElement(
    ctx: CanvasRenderingContext2D,
    el: DrawingElement,
    w: number,
    h: number
  ) {
    if (el.points.length === 0) return;
    ctx.save();

    let centerPt = el.points[0];
    if (el.keyframes && el.keyframes.length > 0) {
      const tracked = getInterpolatedPosition(el.keyframes, currentTime);
      if (tracked) {
        centerPt = tracked;
      }
    }

    switch (el.type) {
      case 'spotlight-3d': {
        const cx = centerPt.x * w;
        const cy = centerPt.y * h;
        const rx = 65;
        const ry = 28;

        const grad = ctx.createRadialGradient(cx, cy, ry * 0.2, cx, cy, rx);
        grad.addColorStop(0, el.color || 'rgba(0, 240, 255, 0.5)');
        grad.addColorStop(0.7, 'rgba(0, 240, 255, 0.2)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = el.color || '#00f0ff';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // 3D vertical beam
        const beamGrad = ctx.createLinearGradient(cx, cy - 140, cx, cy);
        beamGrad.addColorStop(0, 'rgba(0, 240, 255, 0)');
        beamGrad.addColorStop(1, 'rgba(0, 240, 255, 0.25)');

        ctx.beginPath();
        ctx.moveTo(cx - 30, cy - 140);
        ctx.lineTo(cx + 30, cy - 140);
        ctx.lineTo(cx + rx, cy);
        ctx.lineTo(cx - rx, cy);
        ctx.closePath();
        ctx.fillStyle = beamGrad;
        ctx.fill();
        break;
      }

      case 'player-circle': {
        const cx = centerPt.x * w;
        const cy = centerPt.y * h;
        const r = 24;

        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.strokeStyle = el.color || '#f59e0b';
        ctx.lineWidth = 3;
        ctx.stroke();

        ctx.fillStyle = 'rgba(245, 158, 11, 0.2)';
        ctx.fill();

        if (el.label) {
          ctx.font = 'bold 11px system-ui';
          ctx.fillStyle = '#ffffff';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(el.label, cx, cy);
        }
        break;
      }

      case 'vision-cone': {
        const cx = centerPt.x * w;
        const cy = centerPt.y * h;
        const angle = el.angle !== undefined ? el.angle : -Math.PI / 4;
        const fov = Math.PI / 3;
        const length = 130;

        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.arc(cx, cy, length, angle - fov / 2, angle + fov / 2);
        ctx.closePath();

        const grad = ctx.createRadialGradient(cx, cy, 10, cx, cy, length);
        grad.addColorStop(0, 'rgba(245, 158, 11, 0.4)');
        grad.addColorStop(1, 'rgba(245, 158, 11, 0.05)');
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.strokeStyle = '#f59e0b';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        break;
      }

      case 'pass-arrow':
      case 'run-arrow': {
        if (el.points.length < 2) break;
        const p1 = { x: el.points[0].x * w, y: el.points[0].y * h };
        const p2 = { x: el.points[1].x * w, y: el.points[1].y * h };

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = el.color || '#10b981';
        ctx.lineWidth = 3;
        if (el.type === 'run-arrow') {
          ctx.setLineDash([8, 6]);
        }
        ctx.stroke();
        ctx.setLineDash([]);

        // Arrow head
        const headlen = 14;
        const dx = p2.x - p1.x;
        const dy = p2.y - p1.y;
        const angle = Math.atan2(dy, dx);
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
        ctx.fillStyle = el.color || '#10b981';
        ctx.fill();
        break;
      }

      case 'distance-line': {
        if (el.points.length < 2) break;
        const p1 = { x: el.points[0].x * w, y: el.points[0].y * h };
        const p2 = { x: el.points[1].x * w, y: el.points[1].y * h };

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);

        const distPx = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const distM = (distPx / (w * 0.05)).toFixed(1); // approximate meters
        const mx = (p1.x + p2.x) / 2;
        const my = (p1.y + p2.y) / 2;

        ctx.fillStyle = '#0f172a';
        ctx.fillRect(mx - 24, my - 10, 48, 20);
        ctx.strokeStyle = '#38bdf8';
        ctx.strokeRect(mx - 24, my - 10, 48, 20);

        ctx.font = 'bold 10px monospace';
        ctx.fillStyle = '#38bdf8';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${distM}m`, mx, my);
        break;
      }

      case 'note-text': {
        const cx = centerPt.x * w;
        const cy = centerPt.y * h;
        const text = el.label || 'Catatan Taktik';

        ctx.font = 'bold 12px system-ui';
        const metrics = ctx.measureText(text);
        const pad = 6;

        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.fillRect(cx - pad, cy - 14 - pad, metrics.width + pad * 2, 24 + pad);
        ctx.strokeStyle = el.color || '#38bdf8';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(cx - pad, cy - 14 - pad, metrics.width + pad * 2, 24 + pad);

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, cx, cy);
        break;
      }

      case 'freehand': {
        if (el.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(el.points[0].x * w, el.points[0].y * h);
        for (let i = 1; i < el.points.length; i++) {
          ctx.lineTo(el.points[i].x * w, el.points[i].y * h);
        }
        ctx.strokeStyle = el.color || '#ec4899';
        ctx.lineWidth = 3;
        ctx.stroke();
        break;
      }
    }

    ctx.restore();
  }

  // Pointer event handlers for drawing
  function handlePointerDown(e: PointerEvent) {
    if (!canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const pt: Point2D = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };

    inProgressDrawing = {
      id: `el-${Date.now()}`,
      type: activeTool,
      color: activeColor,
      points: [pt],
      timeStart: activeClip ? activeClip.startTime : currentTime,
      timeEnd: activeClip ? activeClip.endTime : currentTime + 5,
      label: activeTool === 'player-circle' ? '#9' : activeTool === 'note-text' ? 'Evaluasi Rotasi' : undefined,
    };
  }

  function handlePointerMove(e: PointerEvent) {
    if (!inProgressDrawing || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const pt: Point2D = {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };

    if (inProgressDrawing.type === 'freehand') {
      inProgressDrawing.points.push(pt);
    } else if (inProgressDrawing.points.length === 1) {
      inProgressDrawing.points.push(pt);
    } else {
      inProgressDrawing.points[1] = pt;
    }
  }

  function handlePointerUp() {
    if (!inProgressDrawing) return;
    drawings.push({ ...inProgressDrawing });
    inProgressDrawing = null;
  }

  // Trigger AI Multi-Player MOT Tracking
  function triggerAIMultiTracking() {
    if (!videoEl || !canvasEl) return;
    isMultiTracking = true;
    const start = activeClip ? activeClip.startTime : currentTime;
    const end = activeClip ? activeClip.endTime : currentTime + 4;

    const initialSeeds = generateFutsalPlayerSeeds();
    const result = runMultiPlayerAutoTracking(
      videoEl,
      initialSeeds,
      start,
      end,
      10,
      canvasEl.width,
      canvasEl.height
    );

    // Convert MOT tracks to spotlight elements
    for (const track of result.playerTracks) {
      const firstPt = track.trajectory[0] || { x: 0.5, y: 0.5 };
      drawings.push({
        id: `mot-${track.playerId}-${Date.now()}`,
        type: 'spotlight-3d',
        color: track.teamColor,
        points: [firstPt],
        keyframes: track.trajectory.map((p, idx) => ({
          time: start + idx * 0.1,
          point: p,
          confidence: 0.9,
        })),
        isTracking: true,
        label: track.label,
        timeStart: start,
        timeEnd: end,
      });
    }

    isMultiTracking = false;
  }

  function handleSave() {
    if (!activeClip) return;
    projectStore.saveTelestration(activeClip.id, drawings, pauseDuration);
  }

  function handleSaveAndNext() {
    if (!activeClip) return;
    projectStore.saveAndNextClip(activeClip.id, drawings, pauseDuration);
    // Reload new active clip drawings
    if (projectStore.activeClipForDrawing) {
      drawings = projectStore.activeClipForDrawing.drawings ? [...projectStore.activeClipForDrawing.drawings] : [];
      pauseDuration = projectStore.activeClipForDrawing.pauseDuration || 3.0;
      if (videoEl) {
        videoEl.currentTime = projectStore.activeClipForDrawing.startTime;
      }
    }
  }

  function handleBackToTagging() {
    handleSave();
    projectStore.setStage('tagging');
  }

  function triggerPreview() {
    if (!videoEl || !activeClip) return;
    isPreviewing = true;
    videoEl.currentTime = activeClip.startTime;
    videoEl.play();
    isPlaying = true;

    // Simulate Once Sport freeze-frame in midpoint
    const midPoint = (activeClip.startTime + activeClip.endTime) / 2;
    const checkInterval = setInterval(() => {
      if (!videoEl) {
        clearInterval(checkInterval);
        return;
      }
      if (videoEl.currentTime >= midPoint && isPlaying) {
        videoEl.pause();
        isPlaying = false;
        clearInterval(checkInterval);

        // Resume after pauseDuration
        setTimeout(() => {
          if (videoEl) {
            videoEl.play();
            isPlaying = true;
          }
        }, pauseDuration * 1000);
      }
    }, 100);
  }

  function clearAllDrawings() {
    drawings = [];
  }
</script>

<div class="telestration-studio">
  <!-- TOP STUDIO HEADER -->
  <header class="studio-header">
    <div class="header-left">
      <button class="btn-back" onclick={handleBackToTagging}>
        <ArrowLeft size={16} />
        <span>Kembali ke Tagging</span>
      </button>

      {#if activeClip}
        <div class="clip-badge-info">
          <span class="clip-cat-badge" style="background-color: {activeClip.color}">
            {activeClip.category}
          </span>
          <span class="clip-name-text">{activeClip.title}</span>
          <span class="clip-time-text">
            [{activeClip.startTime.toFixed(1)}s - {activeClip.endTime.toFixed(1)}s]
          </span>
        </div>
      {/if}
    </div>

    <div class="header-right">
      <button class="btn-clear" onclick={clearAllDrawings} title="Hapus semua coretan">
        <Trash2 size={14} />
        <span>Hapus Gambar</span>
      </button>
      <button class="btn-save" onclick={handleSave}>
        <Check size={14} />
        <span>Simpan</span>
      </button>
      <button class="btn-save-next" onclick={handleSaveAndNext}>
        <span>Simpan & Lanjut Klip Berikutnya</span>
        <ArrowRight size={15} />
      </button>
    </div>
  </header>

  <!-- WORKSPACE BODY (LEFT: FLOATING TOOLS PALETTE, CENTER: VIDEO & CANVAS) -->
  <div class="studio-body">
    <!-- FLOATING TOOLS PALETTE -->
    <div class="tools-sidebar">
      <div class="palette-group-title">ALAT TELESTRASI</div>
      <div class="tools-list">
        {#each TOOLS as tool}
          <button
            class="tool-btn"
            class:active={activeTool === tool.id}
            onclick={() => (activeTool = tool.id)}
            title={tool.label}
          >
            <tool.icon size={16} />
            <span class="tool-label">{tool.label}</span>
          </button>
        {/each}
      </div>

      <div class="palette-divider"></div>

      <!-- AI MULTI-TRACKING TRIGGER -->
      <div class="palette-group-title">AI VISION</div>
      <button
        class="tool-btn btn-ai"
        class:loading={isMultiTracking}
        onclick={triggerAIMultiTracking}
        title="Deteksi 10 Pemain & Tim Compactness"
      >
        <Users size={16} />
        <span class="tool-label">Auto-Detect 10 Pemain</span>
      </button>

      <div class="palette-divider"></div>

      <!-- COLOR PALETTE -->
      <div class="palette-group-title">WARNA GRAFIS</div>
      <div class="color-swatches">
        {#each PALETTE as color}
          <button
            class="swatch"
            style="background-color: {color}"
            class:selected={activeColor === color}
            onclick={() => (activeColor = color)}
          ></button>
        {/each}
      </div>
    </div>

    <!-- CANVAS & VIDEO VIEWER -->
    <div class="canvas-viewer-container" bind:this={videoContainer}>
      {#if projectStore.videoSrc}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video
          bind:this={videoEl}
          src={projectStore.videoSrc}
          class="studio-video"
          onloadedmetadata={() => {
            if (videoEl && activeClip) {
              videoEl.currentTime = activeClip.startTime;
            }
          }}
        ></video>
      {:else}
        <div class="mock-court-video">
          <div class="mock-tag-overlay">
            <h3>Kanvas Telestrasi Futsal (Freeze-Frame)</h3>
            <p>Klik dan seret kursor untuk menggambar 3D Spotlight, Vision Cone, atau Panah Taktik di atas pemain.</p>
          </div>
        </div>
      {/if}

      <!-- INTERACTIVE OVERLAY CANVAS -->
      <canvas
        bind:this={canvasEl}
        class="telestrator-canvas"
        onpointerdown={handlePointerDown}
        onpointermove={handlePointerMove}
        onpointerup={handlePointerUp}
      ></canvas>
    </div>
  </div>

  <!-- BOTTOM FREEZE DURATION & PREVIEW BAR -->
  <footer class="studio-footer">
    <div class="footer-left">
      <button class="btn-preview" onclick={triggerPreview}>
        <Play size={16} />
        <span>Preview Telestrasi (Dengan Jeda {pauseDuration}s)</span>
      </button>
    </div>

    <div class="footer-center">
      <div class="pause-slider-wrap">
        <Clock size={15} />
        <span class="slider-label">Waktu Jeda Gambar (Pause Duration):</span>
        <input
          type="range"
          min="1"
          max="8"
          step="0.5"
          bind:value={pauseDuration}
          class="pause-slider"
        />
        <span class="slider-val">{pauseDuration.toFixed(1)} Detik</span>
      </div>
    </div>

    <div class="footer-right">
      <span class="info-note">Grafis akan otomatis membeku selama {pauseDuration} detik pada saat video diputar atau diekspor.</span>
    </div>
  </footer>
</div>

<style>
  .telestration-studio {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #060b14;
    color: #f8fafc;
    overflow: hidden;
  }

  /* HEADER */
  .studio-header {
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
    gap: 16px;
  }

  .btn-back {
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

  .btn-back:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
  }

  .clip-badge-info {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .clip-cat-badge {
    font-size: 9px;
    font-weight: 800;
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 4px;
  }

  .clip-name-text {
    font-size: 13px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .clip-time-text {
    font-family: monospace;
    font-size: 11px;
    color: #38bdf8;
    font-weight: 700;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-clear {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: 1px solid #7f1d1d;
    color: #ef4444;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-clear:hover {
    background-color: rgba(239, 68, 68, 0.15);
  }

  .btn-save {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0d1e38;
    border: 1px solid #1a355d;
    color: #93c5fd;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-save:hover {
    background-color: #142a4d;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-save-next {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    padding: 6px 16px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
    transition: all 0.2s;
  }

  .btn-save-next:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    box-shadow: 0 0 18px rgba(56, 189, 248, 0.55);
    transform: translateY(-1px);
  }

  /* STUDIO BODY */
  .studio-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  /* TOOLS SIDEBAR */
  .tools-sidebar {
    width: 220px;
    background: linear-gradient(180deg, #0b172a 0%, #07101e 100%);
    border-right: 1px solid #1a355d;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    overflow-y: auto;
  }

  .palette-group-title {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #93c5fd;
    margin-bottom: 2px;
  }

  .tools-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #0c1a33;
    border: 1px solid #1b365f;
    color: #cbd5e1;
    padding: 8px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .tool-btn:hover {
    background-color: #142a4d;
    color: #ffffff;
    border-color: #38bdf8;
  }

  .tool-btn.active {
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.35), rgba(37, 99, 235, 0.45));
    border-color: #38bdf8;
    color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  .btn-ai {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.15), rgba(6, 78, 59, 0.35));
    border-color: rgba(16, 185, 129, 0.4);
    color: #34d399;
  }

  .btn-ai:hover {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(6, 78, 59, 0.45));
    border-color: #10b981;
    color: #ffffff;
  }

  .palette-divider {
    height: 1px;
    background-color: #1a355d;
    margin: 4px 0;
  }

  .color-swatches {
    display: flex;
    gap: 8px;
  }

  .swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .swatch:hover {
    transform: scale(1.15);
  }

  .swatch.selected {
    border-color: #ffffff;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
  }

  /* CANVAS VIEWER */
  .canvas-viewer-container {
    flex: 1;
    position: relative;
    background-color: #02050a;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .studio-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .mock-court-video {
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at center, #0f2444 0%, #060b14 80%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mock-tag-overlay {
    text-align: center;
    color: #64748b;
    max-width: 450px;
    pointer-events: none;
  }

  .mock-tag-overlay h3 {
    font-size: 16px;
    font-weight: 700;
    color: #38bdf8;
    margin: 0 0 6px 0;
  }

  .mock-tag-overlay p {
    font-size: 12px;
    line-height: 1.5;
    margin: 0;
    color: #94a3b8;
  }

  .telestrator-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    z-index: 10;
  }

  /* FOOTER */
  .studio-footer {
    height: 52px;
    background: linear-gradient(180deg, #091528 0%, #0d1e38 100%);
    border-top: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 16px;
    flex-shrink: 0;
  }

  .footer-left {
    display: flex;
    align-items: center;
  }

  .btn-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #059669, #047857);
    color: #ffffff;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.35);
  }

  .btn-preview:hover {
    background: linear-gradient(135deg, #047857, #065f46);
  }

  .footer-center {
    display: flex;
    align-items: center;
  }

  .pause-slider-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    background-color: #0c1a33;
    border: 1px solid #1e3b68;
    padding: 6px 14px;
    border-radius: 8px;
    color: #38bdf8;
  }

  .slider-label {
    font-size: 11px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .pause-slider {
    width: 140px;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .slider-val {
    font-size: 12px;
    font-weight: 800;
    font-family: monospace;
    color: #38bdf8;
    min-width: 60px;
  }

  .footer-right {
    font-size: 11px;
    color: #64748b;
  }
</style>

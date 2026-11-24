<script lang="ts">
  import { onMount } from 'svelte';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import type { VideoTagEvent, Point2D } from '$lib/types';
  import { FUTSAL_DIMENSIONS } from '$lib/pitch/futsal';
  import {
    Flame,
    Share2,
    X,
    Filter,
    Users,
    Download,
    Layers,
    Activity,
    ArrowRight,
  } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let activeTab = $state<'heatmap' | 'passing'>('heatmap');
  let selectedPlayerFilter = $state<string>('all');
  let selectedCategoryFilter = $state<string>('all');

  const ROSTER = [
    { id: '#1 Kiper', label: '#1 Kiper', defaultPos: { x: 4, y: 10 } },
    { id: '#4 Anchor', label: '#4 Anchor', defaultPos: { x: 12, y: 10 } },
    { id: '#7 Flank Kiri', label: '#7 Flank Kiri', defaultPos: { x: 22, y: 4 } },
    { id: '#11 Flank Kanan', label: '#11 Flank Kanan', defaultPos: { x: 22, y: 16 } },
    { id: '#9 Pivot', label: '#9 Pivot', defaultPos: { x: 32, y: 10 } },
  ];

  // Map zone to coordinates on a 40x20 futsal pitch
  function getZoneCoord(zone?: string): Point2D {
    switch (zone) {
      case 'Area Penalti Lawan':
        return { x: 34 + (Math.random() - 0.5) * 4, y: 10 + (Math.random() - 0.5) * 5 };
      case 'Flank Kiri':
        return { x: 24 + (Math.random() - 0.5) * 8, y: 3.5 + (Math.random() - 0.5) * 2 };
      case 'Flank Kanan':
        return { x: 24 + (Math.random() - 0.5) * 8, y: 16.5 + (Math.random() - 0.5) * 2 };
      case 'Area Tengah':
        return { x: 20 + (Math.random() - 0.5) * 6, y: 10 + (Math.random() - 0.5) * 4 };
      case 'Area Bertahan Sendiri':
        return { x: 8 + (Math.random() - 0.5) * 6, y: 10 + (Math.random() - 0.5) * 6 };
      default:
        return { x: 20 + (Math.random() - 0.5) * 12, y: 10 + (Math.random() - 0.5) * 8 };
    }
  }

  // Filtered tags for heatmap
  let filteredEvents = $derived(
    projectStore.tags.filter((t) => {
      if (selectedPlayerFilter !== 'all' && t.playerLabel !== selectedPlayerFilter) return false;
      if (selectedCategoryFilter !== 'all' && t.category !== selectedCategoryFilter) return false;
      return true;
    })
  );

  onMount(() => {
    renderCanvas();
  });

  $effect(() => {
    if (isOpen && canvasEl) {
      renderCanvas();
    }
  });

  function renderCanvas() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const w = canvasEl.width;
    const h = canvasEl.height;

    ctx.clearRect(0, 0, w, h);

    // 1. Draw FIFA Futsal Pitch (40m x 20m)
    drawFutsalCourtBackground(ctx, w, h);

    // 2. Render chosen mode
    if (activeTab === 'heatmap') {
      renderHeatmap(ctx, w, h);
    } else {
      renderPassingNetwork(ctx, w, h);
    }
  }

  function drawFutsalCourtBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const pad = 24;
    const pitchW = w - pad * 2;
    const pitchH = h - pad * 2;

    // Pitch Floor (Blue vinyl/wood broadcast standard)
    const floorGrad = ctx.createLinearGradient(pad, pad, pad + pitchW, pad + pitchH);
    floorGrad.addColorStop(0, '#0a1d37');
    floorGrad.addColorStop(1, '#071528');
    ctx.fillStyle = floorGrad;
    ctx.fillRect(pad, pad, pitchW, pitchH);

    // Court White Boundary Lines
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, pitchW, pitchH);

    // Halfway line
    const midX = pad + pitchW / 2;
    ctx.beginPath();
    ctx.moveTo(midX, pad);
    ctx.lineTo(midX, pad + pitchH);
    ctx.stroke();

    // Center Circle (Radius = 3m out of 20m pitch height)
    const centerRadiusPx = (3 / FUTSAL_DIMENSIONS.width) * pitchH;
    ctx.beginPath();
    ctx.arc(midX, pad + pitchH / 2, centerRadiusPx, 0, Math.PI * 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(midX, pad + pitchH / 2, 4, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();

    // Penalty Areas (6m D-boxes on both sides)
    const penaltyRadPx = (6 / FUTSAL_DIMENSIONS.width) * pitchH;
    // Left Penalty Area
    ctx.beginPath();
    ctx.arc(pad, pad + pitchH / 2, penaltyRadPx, -Math.PI / 2, Math.PI / 2);
    ctx.stroke();

    // Right Penalty Area
    ctx.beginPath();
    ctx.arc(pad + pitchW, pad + pitchH / 2, penaltyRadPx, Math.PI / 2, -Math.PI / 2);
    ctx.stroke();

    // Penalty spots (6m and 10m double penalty)
    const mToPx = pitchW / FUTSAL_DIMENSIONS.length;
    const spotLeft6m = pad + 6 * mToPx;
    const spotRight6m = pad + pitchW - 6 * mToPx;
    const spotLeft10m = pad + 10 * mToPx;
    const spotRight10m = pad + pitchW - 10 * mToPx;
    const midY = pad + pitchH / 2;

    for (const sx of [spotLeft6m, spotRight6m, spotLeft10m, spotRight10m]) {
      ctx.beginPath();
      ctx.arc(sx, midY, 3, 0, Math.PI * 2);
      ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      ctx.fill();
    }
  }

  function renderHeatmap(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const pad = 24;
    const pitchW = w - pad * 2;
    const pitchH = h - pad * 2;

    const scaleX = pitchW / FUTSAL_DIMENSIONS.length;
    const scaleY = pitchH / FUTSAL_DIMENSIONS.width;

    ctx.save();
    // Render gaussian heat density blobs
    for (const ev of filteredEvents) {
      const coord = ev.courtCoord || getZoneCoord(ev.zoneLabel);
      const cx = pad + coord.x * scaleX;
      const cy = pad + coord.y * scaleY;
      const radius = 45;

      const grad = ctx.createRadialGradient(cx, cy, 2, cx, cy, radius);
      grad.addColorStop(0, 'rgba(239, 68, 68, 0.45)');   // Core Red
      grad.addColorStop(0.3, 'rgba(245, 158, 11, 0.35)'); // Amber
      grad.addColorStop(0.6, 'rgba(16, 185, 129, 0.2)');  // Green
      grad.addColorStop(0.85, 'rgba(2, 132, 199, 0.1)'); // Blue
      grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, 0, Math.PI * 2);
      ctx.fillStyle = grad;
      ctx.fill();
    }

    // Overlay action points
    for (const ev of filteredEvents) {
      const coord = ev.courtCoord || getZoneCoord(ev.zoneLabel);
      const cx = pad + coord.x * scaleX;
      const cy = pad + coord.y * scaleY;

      ctx.beginPath();
      ctx.arc(cx, cy, 4, 0, Math.PI * 2);
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 1.5;
      ctx.fill();
      ctx.stroke();
    }

    ctx.restore();
  }

  function renderPassingNetwork(ctx: CanvasRenderingContext2D, w: number, h: number) {
    const pad = 24;
    const pitchW = w - pad * 2;
    const pitchH = h - pad * 2;

    const scaleX = pitchW / FUTSAL_DIMENSIONS.length;
    const scaleY = pitchH / FUTSAL_DIMENSIONS.width;

    // Passing connections model between Starting 5
    const links = [
      { from: 0, to: 1, count: 14 }, // Kiper -> Anchor
      { from: 1, to: 2, count: 22 }, // Anchor -> Flank L
      { from: 1, to: 3, count: 18 }, // Anchor -> Flank R
      { from: 2, to: 4, count: 16 }, // Flank L -> Pivot
      { from: 3, to: 4, count: 12 }, // Flank R -> Pivot
      { from: 0, to: 4, count: 6 },  // Kiper -> Pivot (Long Pass)
    ];

    ctx.save();

    // 1. Draw Passing Vectors
    for (const l of links) {
      const p1 = ROSTER[l.from].defaultPos;
      const p2 = ROSTER[l.to].defaultPos;
      const x1 = pad + p1.x * scaleX;
      const y1 = pad + p1.y * scaleY;
      const x2 = pad + p2.x * scaleX;
      const y2 = pad + p2.y * scaleY;

      const thickness = Math.max(2, l.count * 0.35);

      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.strokeStyle = 'rgba(56, 189, 248, 0.75)';
      ctx.lineWidth = thickness;
      ctx.stroke();

      // Midpoint pass volume badge
      const mx = (x1 + x2) / 2;
      const my = (y1 + y2) / 2;
      ctx.fillStyle = '#0f172a';
      ctx.beginPath();
      ctx.arc(mx, my, 9, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.font = 'bold 9px monospace';
      ctx.fillStyle = '#38bdf8';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${l.count}`, mx, my);
    }

    // 2. Draw Player Nodes
    for (const r of ROSTER) {
      const px = pad + r.defaultPos.x * scaleX;
      const py = pad + r.defaultPos.y * scaleY;
      const nodeRadius = 18;

      ctx.beginPath();
      ctx.arc(px, py, nodeRadius, 0, Math.PI * 2);
      ctx.fillStyle = '#0284c7';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2.5;
      ctx.stroke();

      ctx.font = 'bold 10px system-ui';
      ctx.fillStyle = '#ffffff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(r.label.split(' ')[0], px, py);

      // Label below
      ctx.font = 'bold 11px system-ui';
      ctx.fillStyle = '#93c5fd';
      ctx.fillText(r.label.split(' ').slice(1).join(' '), px, py + nodeRadius + 12);
    }

    ctx.restore();
  }

  function downloadHeatmapImage() {
    if (!canvasEl) return;
    const url = canvasEl.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `FutsalTag_${activeTab}_${Date.now()}.png`;
    a.click();
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="modal-backdrop" onclick={onClose} role="button" tabindex="0">
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div class="modal-card" onclick={(e) => e.stopPropagation()} role="dialog">
      <!-- HEADER -->
      <div class="modal-header">
        <div class="header-left">
          <div class="header-icon-wrap">
            <Flame size={20} class="flame-icon" />
          </div>
          <div>
            <h2 class="title">VISUALISASI TAKTIK FUTSAL: HEATMAP & JARINGAN UMPAN</h2>
            <p class="subtitle">Analisis spasial kepadatan zona serangan & koneksi umpan formasi 5 pemain</p>
          </div>
        </div>

        <div class="header-right">
          <button class="btn-download" onclick={downloadHeatmapImage} title="Unduh gambar lapangan PNG">
            <Download size={14} />
            <span>Unduh PNG</span>
          </button>
          <button class="btn-close" onclick={onClose}>
            <X size={18} />
          </button>
        </div>
      </div>

      <!-- TABS & FILTERS BAR -->
      <div class="controls-bar">
        <div class="tab-toggle-group">
          <button
            class="tab-btn"
            class:active={activeTab === 'heatmap'}
            onclick={() => { activeTab = 'heatmap'; renderCanvas(); }}
          >
            <Flame size={14} />
            <span>Peta Panas (Heatmap)</span>
          </button>
          <button
            class="tab-btn"
            class:active={activeTab === 'passing'}
            onclick={() => { activeTab = 'passing'; renderCanvas(); }}
          >
            <Share2 size={14} />
            <span>Jaringan Umpan (Passing Network)</span>
          </button>
        </div>

        <!-- FILTERS -->
        <div class="filters-group">
          <div class="filter-item">
            <Filter size={13} class="filter-icon" />
            <select
              bind:value={selectedPlayerFilter}
              onchange={renderCanvas}
              class="filter-select"
            >
              <option value="all">Semua Pemain (100% Data)</option>
              {#each ROSTER as r}
                <option value={r.label}>{r.label}</option>
              {/each}
            </select>
          </div>

          <div class="filter-item">
            <select
              bind:value={selectedCategoryFilter}
              onchange={renderCanvas}
              class="filter-select"
            >
              <option value="all">Semua Aksi Kejadian</option>
              <option value="Goal">Gol</option>
              <option value="Shot on Target">Shot on Target</option>
              <option value="Build-up 3-1">Build-up (3-1)</option>
              <option value="Power Play">Power Play (5v4)</option>
              <option value="Kick-in Set Piece">Kick-in Set Piece</option>
            </select>
          </div>
        </div>
      </div>

      <!-- CANVAS VIEWPORT -->
      <div class="canvas-viewport-wrap">
        <canvas
          bind:this={canvasEl}
          width={920}
          height={480}
          class="futsal-heatmap-canvas"
        ></canvas>
      </div>

      <!-- FOOTER METRICS -->
      <div class="metrics-footer">
        <div class="metric-pill">
          <span class="m-label">Total Momen Terpetakan:</span>
          <span class="m-val">{filteredEvents.length} Titik</span>
        </div>
        <div class="metric-pill">
          <span class="m-label">Sektor Terpadat:</span>
          <span class="m-val text-cyan">Flank Kiri (42% Dominasi Serangan)</span>
        </div>
        <div class="metric-pill">
          <span class="m-label">Koneksi Umpan Tertinggi:</span>
          <span class="m-val text-amber">#4 Anchor ➔ #7 Flank Kiri (22 Umpan)</span>
        </div>
      </div>
    </div>
  </div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 999;
    background: rgba(2, 6, 23, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-card {
    background: #081224;
    border: 1px solid #1a355d;
    box-shadow: 0 0 32px rgba(2, 132, 199, 0.35);
    border-radius: 14px;
    width: 980px;
    max-width: 96vw;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    padding: 14px 20px;
    background: linear-gradient(180deg, #0d1e38 0%, #081224 100%);
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .header-icon-wrap {
    width: 36px;
    height: 36px;
    background: rgba(239, 68, 68, 0.15);
    border: 1px solid #ef4444;
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global(.flame-icon) {
    color: #ef4444;
  }

  .title {
    margin: 0;
    font-size: 14px;
    font-weight: 800;
    color: #f8fafc;
    letter-spacing: 0.05em;
  }

  .subtitle {
    margin: 2px 0 0 0;
    font-size: 11px;
    color: #94a3b8;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-download {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0c1a33;
    border: 1px solid #1b365f;
    color: #38bdf8;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-download:hover {
    background: #142a4d;
    color: #ffffff;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
  }

  .btn-close:hover {
    color: #ef4444;
  }

  /* CONTROLS */
  .controls-bar {
    padding: 10px 20px;
    background: #060d1a;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .tab-toggle-group {
    display: flex;
    background: #0b172a;
    border: 1px solid #1e3b68;
    border-radius: 8px;
    padding: 2px;
    gap: 2px;
  }

  .tab-btn {
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab-btn.active {
    background: #0284c7;
    color: #ffffff;
  }

  .filters-group {
    display: flex;
    gap: 10px;
  }

  .filter-item {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0c1a33;
    border: 1px solid #1b365f;
    border-radius: 6px;
    padding: 4px 8px;
  }

  :global(.filter-icon) {
    color: #38bdf8;
  }

  .filter-select {
    background: transparent;
    border: none;
    color: #f1f5f9;
    font-size: 11px;
    outline: none;
    cursor: pointer;
  }

  .filter-select option {
    background: #081224;
    color: #f1f5f9;
  }

  /* CANVAS */
  .canvas-viewport-wrap {
    padding: 20px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #02050a;
  }

  .futsal-heatmap-canvas {
    max-width: 100%;
    height: auto;
    border-radius: 8px;
    box-shadow: 0 0 20px rgba(0, 0, 0, 0.7);
  }

  /* METRICS FOOTER */
  .metrics-footer {
    padding: 12px 20px;
    background: #081224;
    border-top: 1px solid #1a355d;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .metric-pill {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    background: #0c1a33;
    border: 1px solid #1e3b68;
    padding: 6px 12px;
    border-radius: 6px;
  }

  .m-label {
    color: #94a3b8;
  }

  .m-val {
    font-weight: 700;
    color: #ffffff;
  }

  .text-cyan {
    color: #38bdf8;
  }

  .text-amber {
    color: #f59e0b;
  }
</style>

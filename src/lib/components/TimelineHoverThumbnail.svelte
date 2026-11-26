<script lang="ts">
  import { onMount } from 'svelte';

  interface Props {
    videoSrc: string | null;
    hoverTime: number;
    visible: boolean;
    anchorX: number;
    anchorY: number;
    matchClockLabel?: string | null;
    activeActionLabel?: string | null;
    activeActionColor?: string | null;
  }

  let {
    videoSrc = null,
    hoverTime = 0,
    visible = false,
    anchorX = 0,
    anchorY = 0,
    matchClockLabel = null,
    activeActionLabel = null,
    activeActionColor = null
  }: Props = $props();

  let hiddenVideoEl: HTMLVideoElement | null = $state(null);
  let canvasEl: HTMLCanvasElement | null = $state(null);
  let isFrameReady = $state(false);

  const THUMB_W = 160;
  const THUMB_H = 90;

  let lastSeekTime = -1;
  let rafPending = false;

  // Format mm:ss.d
  function formatTime(sec: number): string {
    if (isNaN(sec) || sec < 0) return '00:00.0';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const d = Math.floor((sec % 1) * 10);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}.${d}`;
  }

  // Calculate clamped horizontal position
  let popupLeft = $derived.by(() => {
    if (typeof window === 'undefined') return anchorX;
    const halfW = (THUMB_W + 16) / 2;
    const minX = 12;
    const maxX = window.innerWidth - (THUMB_W + 16) - 12;
    return Math.max(minX, Math.min(maxX, anchorX - halfW));
  });

  // Calculate vertical position (above timeline bar with 12px gap)
  let popupTop = $derived.by(() => {
    const popH = THUMB_H + 42; // thumb + badge + arrow
    const aboveY = anchorY - popH - 10;
    if (aboveY < 10) {
      // If no room above, place below
      return anchorY + 28;
    }
    return aboveY;
  });

  // Triangle pointer position relative to thumbnail card
  let pointerLeft = $derived.by(() => {
    return Math.max(14, Math.min(THUMB_W + 2, anchorX - popupLeft));
  });

  function drawVideoFrame() {
    if (!hiddenVideoEl || !canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    try {
      ctx.drawImage(hiddenVideoEl, 0, 0, THUMB_W, THUMB_H);
      isFrameReady = true;
    } catch {
      // Video not ready or cross-origin
    }
  }

  $effect(() => {
    if (!visible || !videoSrc || !hiddenVideoEl) return;

    // Throttle seek requests to ~30-60fps
    if (Math.abs(hoverTime - lastSeekTime) >= 0.04) {
      lastSeekTime = hoverTime;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(() => {
          rafPending = false;
          if (hiddenVideoEl && isFinite(hoverTime)) {
            hiddenVideoEl.currentTime = Math.max(0, hoverTime);
          }
        });
      }
    }
  });

  function onSeeked() {
    drawVideoFrame();
  }

  function onLoadedMetadata() {
    if (hiddenVideoEl && isFinite(hoverTime)) {
      hiddenVideoEl.currentTime = Math.max(0, hoverTime);
    }
  }
</script>

<!-- Hidden auxiliary video element for decoding hover frame -->
{#if videoSrc}
  <video
    bind:this={hiddenVideoEl}
    src={videoSrc}
    preload="auto"
    muted
    playsinline
    class="sr-only"
    onseeked={onSeeked}
    onloadedmetadata={onLoadedMetadata}
  ></video>
{/if}

{#if visible && videoSrc}
  <div
    class="timeline-hover-popover"
    style="left: {popupLeft}px; top: {popupTop}px;"
    role="tooltip"
  >
    <div class="thumbnail-wrapper">
      <canvas
        bind:this={canvasEl}
        width={THUMB_W}
        height={THUMB_H}
        class="thumbnail-canvas"
        class:ready={isFrameReady}
      ></canvas>

      {#if !isFrameReady}
        <div class="thumb-skeleton">
          <span class="loading-dot"></span>
        </div>
      {/if}

      <!-- Time badge overlay inside video thumbnail -->
      <div class="thumb-time-badge">
        <span class="time-main">{formatTime(hoverTime)}</span>
        {#if matchClockLabel}
          <span class="time-clock">({matchClockLabel})</span>
        {/if}
      </div>
    </div>

    <!-- Category / Action label if hovering over a clip -->
    {#if activeActionLabel}
      <div class="thumb-action-pill" style="--chip-color: {activeActionColor || '#38bdf8'}">
        <span class="chip-dot"></span>
        <span class="chip-text">{activeActionLabel}</span>
      </div>
    {/if}

    <!-- Downward pointer arrow pointing to scrubber cursor -->
    <div class="pointer-arrow" style="left: {pointerLeft}px;"></div>
  </div>
{/if}

<style>
  .sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    padding: 0;
    margin: -1px;
    overflow: hidden;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
    border: 0;
  }

  .timeline-hover-popover {
    position: fixed;
    z-index: 9999;
    pointer-events: none;
    display: flex;
    flex-direction: column;
    align-items: center;
    background: rgba(10, 18, 36, 0.96);
    border: 1px solid rgba(56, 189, 248, 0.45);
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 10px 25px -3px rgba(0, 0, 0, 0.75), 0 0 16px rgba(56, 189, 248, 0.2);
    backdrop-filter: blur(10px);
    transition: opacity 0.12s ease-out;
    animation: popIn 0.12s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @keyframes popIn {
    from {
      opacity: 0;
      transform: translateY(4px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  .thumbnail-wrapper {
    position: relative;
    width: 160px;
    height: 90px;
    border-radius: 6px;
    overflow: hidden;
    background: #020617;
  }

  .thumbnail-canvas {
    width: 160px;
    height: 90px;
    object-fit: cover;
    display: block;
    opacity: 0;
    transition: opacity 0.1s ease;
  }

  .thumbnail-canvas.ready {
    opacity: 1;
  }

  .thumb-skeleton {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0f172a;
  }

  .loading-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #38bdf8;
    animation: pulseDot 0.8s infinite alternate;
  }

  @keyframes pulseDot {
    from { opacity: 0.3; transform: scale(0.8); }
    to { opacity: 1; transform: scale(1.2); }
  }

  .thumb-time-badge {
    position: absolute;
    bottom: 4px;
    left: 4px;
    right: 4px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 2px 6px;
    background: rgba(2, 6, 23, 0.82);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 4px;
    font-size: 11px;
    font-weight: 700;
    color: #38bdf8;
    letter-spacing: 0.5px;
    font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
    backdrop-filter: blur(4px);
  }

  .time-clock {
    font-size: 10px;
    color: #94a3b8;
    font-weight: 500;
  }

  .thumb-action-pill {
    margin-top: 4px;
    max-width: 160px;
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 2px 6px;
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid var(--chip-color, #38bdf8);
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .chip-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: var(--chip-color, #38bdf8);
    flex-shrink: 0;
  }

  .chip-text {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pointer-arrow {
    position: absolute;
    bottom: -6px;
    width: 10px;
    height: 10px;
    background: rgba(10, 18, 36, 0.96);
    border-right: 1px solid rgba(56, 189, 248, 0.45);
    border-bottom: 1px solid rgba(56, 189, 248, 0.45);
    transform: translateX(-50%) rotate(45deg);
  }
</style>

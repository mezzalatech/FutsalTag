<script lang="ts">
  import { untrack } from 'svelte';
  import { ZoomIn, ZoomOut } from 'lucide-svelte';
  import type {
    ActiveContinuousTag,
    TaggingBoard,
    TaggingButton,
    VideoTagEvent,
  } from '$lib/types';

  interface Props {
    board: TaggingBoard;
    tags: VideoTagEvent[];
    activeContinuousTags: Record<string, ActiveContinuousTag>;
    currentTime: number;
    duration: number;
    inPoint: number | null;
    leadTimeSeconds: number;
    lagTimeSeconds: number;
    selectedClipId: string | null;
    activeLoopClipId: string | null;
    onSeek: (time: number) => void;
    onSelectClip: (tag: VideoTagEvent) => void;
    onEditClip: (tag: VideoTagEvent) => void;
    onTrimClip: (tagId: string, newStart: number, newEnd: number) => void;
    onChangeLead: (sec: number) => void;
    onChangeLag: (sec: number) => void;
  }

  let {
    board,
    tags,
    activeContinuousTags,
    currentTime,
    duration,
    inPoint,
    leadTimeSeconds,
    lagTimeSeconds,
    selectedClipId,
    activeLoopClipId,
    onSeek,
    onSelectClip,
    onEditClip,
    onTrimClip,
    onChangeLead,
    onChangeLag,
  }: Props = $props();

  const HEADER_W = 152;
  const safeDuration = $derived(Math.max(duration || 0, 10));

  let zoomLevel = $state<number>(1);
  let viewStart = $state<number>(0);

  const windowDur = $derived(safeDuration / zoomLevel);
  const viewEnd = $derived(Math.min(safeDuration, viewStart + windowDur));

  // Keep viewStart valid when duration or zoom changes, and gently follow playhead when zoomed
  $effect(() => {
    const dur = safeDuration;
    const wDur = dur / zoomLevel;
    const maxStart = Math.max(0, dur - wDur);
    const curStart = untrack(() => viewStart);
    if (zoomLevel <= 1.01) {
      if (curStart !== 0) viewStart = 0;
    } else if (curStart > maxStart) {
      viewStart = maxStart;
    }
  });

  // Gentle auto-scroll when playhead goes out of zoomed viewport while playing
  let lastFollowedTime = $state(-1);
  $effect(() => {
    const t = currentTime;
    if (Math.abs(t - lastFollowedTime) < 0.05) return;
    lastFollowedTime = t;
    if (zoomLevel <= 1.01) return;
    const wDur = safeDuration / zoomLevel;
    const curStart = untrack(() => viewStart);
    const curEnd = curStart + wDur;
    if (t > curEnd - wDur * 0.06 || t < curStart) {
      const next = Math.max(0, Math.min(safeDuration - wDur, t - wDur * 0.25));
      viewStart = next;
    }
  });

  function setZoom(nextZoom: number, anchorTime: number = currentTime) {
    const clampedZoom = Math.max(1, Math.min(16, Number(nextZoom.toFixed(2))));
    const nextWindow = safeDuration / clampedZoom;
    const anchorRatio =
      windowDur > 0 ? Math.max(0, Math.min(1, (anchorTime - viewStart) / windowDur)) : 0.5;
    const nextStart =
      clampedZoom <= 1.01
        ? 0
        : Math.max(0, Math.min(safeDuration - nextWindow, anchorTime - anchorRatio * nextWindow));
    zoomLevel = clampedZoom;
    viewStart = nextStart;
  }

  function handleTrackWheel(e: WheelEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) {
      e.preventDefault();
      const factor = e.deltaY < 0 ? 1.35 : 1 / 1.35;
      setZoom(zoomLevel * factor, currentTime);
    } else if (zoomLevel > 1.01 && Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
      e.preventDefault();
      const deltaSec = (e.deltaX / 600) * windowDur;
      viewStart = Math.max(0, Math.min(safeDuration - windowDur, viewStart + deltaSec));
    }
  }

  function formatTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  }

  function formatPreciseTime(sec: number): string {
    if (!Number.isFinite(sec) || sec < 0) return '0:00.0';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const d = Math.floor((sec % 1) * 10);
    return `${m}:${s.toString().padStart(2, '0')}.${d}`;
  }

  interface TimelineLane {
    id: string;
    category: string;
    hotkey: string | null;
    color: string;
    tags: VideoTagEvent[];
    live: ActiveContinuousTag[];
  }

  const allCategoryLanes = $derived.by<TimelineLane[]>(() => {
    const map = new Map<string, TimelineLane>();

    // Pre-populate ALL category buttons from active board (even count 0!) in board order
    for (const btn of board.buttons) {
      if (btn.kind !== 'category') continue;
      if (!map.has(btn.name)) {
        map.set(btn.name, {
          id: btn.id,
          category: btn.name,
          hotkey: btn.hotkey,
          color: btn.color,
          tags: [],
          live: [],
        });
      }
    }

    // Active continuous recordings
    for (const rec of Object.values(activeContinuousTags)) {
      if (!map.has(rec.name)) {
        map.set(rec.name, {
          id: `live-${rec.buttonId}`,
          category: rec.name,
          hotkey: null,
          color: rec.color,
          tags: [],
          live: [],
        });
      }
      map.get(rec.name)!.live.push(rec);
    }

    // Completed clips (including custom / imported tags)
    for (const t of tags) {
      if (!map.has(t.category)) {
        map.set(t.category, {
          id: `extra-${t.category}`,
          category: t.category,
          hotkey: null,
          color: t.color || '#0284c7',
          tags: [],
          live: [],
        });
      }
      map.get(t.category)!.tags.push(t);
    }

    return Array.from(map.values());
  });

  // Smart ruler ticks inside [viewStart, viewEnd]
  const rulerTicks = $derived.by<{ time: number; leftPct: number; label: string }[]>(() => {
    const steps = [1, 2, 5, 10, 15, 30, 60, 120, 300, 600];
    const targetTicks = 9;
    const rawStep = windowDur / targetTicks;
    const step = steps.find((s) => s >= rawStep) ?? 600;
    const first = Math.ceil(viewStart / step) * step;
    const ticks: { time: number; leftPct: number; label: string }[] = [];
    for (let t = first; t <= viewEnd + 0.001; t += step) {
      const pct = ((t - viewStart) / windowDur) * 100;
      if (pct >= 0 && pct <= 100) {
        ticks.push({ time: t, leftPct: pct, label: formatTime(t) });
      }
    }
    return ticks;
  });

  const playheadPct = $derived(((currentTime - viewStart) / windowDur) * 100);
  const playheadVisible = $derived(playheadPct >= 0 && playheadPct <= 100);

  const inPointPct = $derived(
    inPoint !== null ? ((inPoint - viewStart) / windowDur) * 100 : null
  );

  // Clip trim dragging state
  let trimmingTagId = $state<string | null>(null);
  let trimPreviewStart = $state<number>(0);
  let trimPreviewEnd = $state<number>(0);

  function startClipTrim(
    e: PointerEvent,
    tag: VideoTagEvent,
    edge: 'left' | 'right',
    trackEl: HTMLElement
  ) {
    e.stopPropagation();
    e.preventDefault();
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;

    trimmingTagId = tag.id;
    trimPreviewStart = tag.startTime;
    trimPreviewEnd = tag.endTime;
    const minLen = 0.4;

    function onMove(ev: PointerEvent) {
      const ratio = Math.max(0, Math.min(1, (ev.clientX - rect.left) / rect.width));
      const t = viewStart + ratio * windowDur;
      if (edge === 'left') {
        trimPreviewStart = Math.max(0, Math.min(trimPreviewEnd - minLen, t));
      } else {
        trimPreviewEnd = Math.min(safeDuration, Math.max(trimPreviewStart + minLen, t));
      }
    }

    function onUp() {
      const finalStart = Number(trimPreviewStart.toFixed(2));
      const finalEnd = Number(trimPreviewEnd.toFixed(2));
      trimmingTagId = null;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (finalStart !== tag.startTime || finalEnd !== tag.endTime) {
        onTrimClip(tag.id, finalStart, finalEnd);
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startOverviewPan(e: PointerEvent, barEl: HTMLElement) {
    if (zoomLevel <= 1.01) return;
    e.preventDefault();
    const rect = barEl.getBoundingClientRect();
    if (rect.width <= 0) return;

    const updateFromClientX = (clientX: number) => {
      const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
      const centerT = ratio * safeDuration;
      viewStart = Math.max(0, Math.min(safeDuration - windowDur, centerT - windowDur / 2));
    };

    updateFromClientX(e.clientX);
    function onMove(ev: PointerEvent) {
      updateFromClientX(ev.clientX);
    }
    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function seekFromTrackClick(e: MouseEvent) {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    onSeek(viewStart + ratio * windowDur);
  }
</script>

<div class="linimasa-shell" onwheel={handleTrackWheel}>
  <!-- TOP HEADER STRIP (24px) -->
  <div class="linimasa-header">
    <div class="lh-left">
      <span class="lh-title">Linimasa</span>
      <span class="lh-hint">
        I & O menandai rentang · Klik klip untuk putar · Klik 2x edit label · Seret tepi klip untuk pangkas
      </span>
    </div>

    <div class="lh-right">
      <div class="roll-group" title="Durasi mundur otomatis (Pre-Roll) saat tag 1-klik">
        <span class="roll-lbl">Pre:</span>
        <button type="button" class="roll-btn" onclick={() => onChangeLead(Math.max(0, leadTimeSeconds - 1))}>-1s</button>
        <span class="roll-val">{leadTimeSeconds}s</span>
        <button type="button" class="roll-btn" onclick={() => onChangeLead(Math.min(15, leadTimeSeconds + 1))}>+1s</button>
      </div>

      <div class="roll-group" title="Durasi sesudah kejadian (Post-Roll)">
        <span class="roll-lbl">Post:</span>
        <button type="button" class="roll-btn" onclick={() => onChangeLag(Math.max(0, lagTimeSeconds - 1))}>-1s</button>
        <span class="roll-val">{lagTimeSeconds}s</span>
        <button type="button" class="roll-btn" onclick={() => onChangeLag(Math.min(15, lagTimeSeconds + 1))}>+1s</button>
      </div>

      <span class="lh-sep"></span>

      <span class="lh-cur-badge">{formatPreciseTime(currentTime)}</span>

      <div class="zoom-controls">
        <button
          type="button"
          class="zoom-btn"
          onclick={() => setZoom(zoomLevel / 1.5)}
          disabled={zoomLevel <= 1}
          title="Zoom Out Linimasa"
        >
          <ZoomOut size={11} />
        </button>
        <button
          type="button"
          class="zoom-val-btn"
          onclick={() => setZoom(1)}
          title="Reset Zoom 1x (atau Alt/Cmd + Scroll)"
        >
          {zoomLevel >= 2 ? `${zoomLevel.toFixed(1).replace(/\.0$/, '')}x` : `${zoomLevel.toFixed(1).replace(/\.0$/, '')}x`}
        </button>
        <button
          type="button"
          class="zoom-btn"
          onclick={() => setZoom(zoomLevel * 1.5)}
          disabled={zoomLevel >= 16}
          title="Zoom In Linimasa (detail sub-detik)"
        >
          <ZoomIn size={11} />
        </button>
      </div>
    </div>
  </div>

  <!-- MAIN SCROLLABLE MULTI-LANE VIEWPORT -->
  <div class="linimasa-body">
    <!-- TIME RULER ROW (STICKY TOP) -->
    <div class="ruler-row">
      <div class="ruler-corner" style="width: {HEADER_W}px;">
        <span>KATEGORI ({allCategoryLanes.length})</span>
      </div>
      <!-- svelte-ignore a11y_click_events_have_key_events -->
      <div
        class="ruler-track"
        onclick={seekFromTrackClick}
        role="slider"
        aria-label="Penggaris Waktu Linimasa"
        aria-valuenow={currentTime}
        tabindex="0"
      >
        {#each rulerTicks as tick (tick.time)}
          <div class="ruler-tick" style="left: {tick.leftPct}%;">
            <span class="tick-mark"></span>
            <span class="tick-lbl">{tick.label}</span>
          </div>
        {/each}

        {#if playheadVisible}
          <div class="ruler-playhead-badge" style="left: {playheadPct}%;">
            {formatPreciseTime(currentTime)}
          </div>
        {/if}
      </div>
    </div>

    <!-- CATEGORY TRACK LANES + VERTICAL PLAYHEAD OVERLAY -->
    <div class="lanes-scroll-wrap">
      <div class="lanes-content">
        <div class="linimasa-playhead-layer" style="left: {HEADER_W}px;">
          {#if playheadVisible}
            <div class="playhead-needle" style="left: {playheadPct}%;"></div>
          {/if}
          {#if inPointPct !== null && inPointPct >= 0 && inPointPct <= 100}
            <div class="in-point-needle" style="left: {inPointPct}%;"></div>
          {/if}
        </div>

        {#each allCategoryLanes as lane (lane.id + lane.category)}
          <div class="linimasa-lane-row">
            <div class="lane-header" style="width: {HEADER_W}px;" title={lane.category}>
              <span class="lane-color-bar" style="background-color: {lane.color};"></span>
              <span class="lane-count-num">{lane.tags.length + lane.live.length}</span>
              {#if lane.hotkey}
                <span class="lane-kbd">{lane.hotkey}</span>
              {/if}
              <span class="lane-cat-name">{lane.category}</span>
            </div>

            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="lane-track"
              style="background: linear-gradient(90deg, {lane.color}20 0%, {lane.color}0a 100%);"
              onclick={seekFromTrackClick}
              role="slider"
              aria-label={lane.category}
              aria-valuenow={currentTime}
              tabindex="0"
            >
              <!-- LIVE CONTINUOUS RECORDINGS -->
              {#each lane.live as rec (rec.buttonId)}
                {@const liveEnd = Math.max(currentTime, rec.startTime + 0.5)}
                {@const clampedS = Math.max(viewStart, rec.startTime)}
                {@const clampedE = Math.min(viewEnd, liveEnd)}
                {#if clampedE > clampedS}
                  {@const lPct = ((clampedS - viewStart) / windowDur) * 100}
                  {@const wPct = Math.max(0.8, ((clampedE - clampedS) / windowDur) * 100)}
                  <div
                    class="clip-block clip-block-live"
                    style="left: {lPct}%; width: {wPct}%; background-color: {rec.color};"
                    title="Sedang Merekam Kontinu: {rec.name}"
                  >
                    <span class="clip-block-label">● REC</span>
                  </div>
                {/if}
              {/each}

              <!-- COMPLETED CLIPS WITH EDGE TRIM HANDLES -->
              {#each lane.tags as tag (tag.id)}
                {@const effStart = trimmingTagId === tag.id ? trimPreviewStart : tag.startTime}
                {@const effEnd = trimmingTagId === tag.id ? trimPreviewEnd : tag.endTime}
                {@const clampedS = Math.max(viewStart, effStart)}
                {@const clampedE = Math.min(viewEnd, effEnd)}
                {#if clampedE >= viewStart && clampedS <= viewEnd && effEnd >= viewStart && effStart <= viewEnd}
                  {@const lPct = ((clampedS - viewStart) / windowDur) * 100}
                  {@const wPct = Math.max(0.65, ((Math.max(clampedS + 0.25, clampedE) - clampedS) / windowDur) * 100)}
                  {@const isSelected = activeLoopClipId === tag.id || selectedClipId === tag.id}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    class="clip-block"
                    class:selected={isSelected}
                    class:trimming={trimmingTagId === tag.id}
                    style="left: {lPct}%; width: {wPct}%; background-color: {tag.color || lane.color};"
                    onclick={(e) => {
                      e.stopPropagation();
                      onSelectClip(tag);
                    }}
                    ondblclick={(e) => {
                      e.stopPropagation();
                      onEditClip(tag);
                    }}
                    role="button"
                    tabindex="0"
                    title="{tag.title} ({formatPreciseTime(effStart)} - {formatPreciseTime(effEnd)}) · Klik: Putar · 2x Klik: Edit · Seret tepi: Pangkas"
                  >
                    <div
                      class="trim-handle trim-handle-l"
                      role="separator"
                      aria-orientation="vertical"
                      onpointerdown={(e) =>
                        startClipTrim(e, tag, 'left', e.currentTarget.parentElement!.parentElement!)}
                      title="Seret untuk memangkas titik awal klip"
                    ></div>
                    <span class="clip-block-label">
                      {trimmingTagId === tag.id
                        ? `${(effEnd - effStart).toFixed(1)}s`
                        : tag.playerLabel || tag.category}
                    </span>
                    <div
                      class="trim-handle trim-handle-r"
                      role="separator"
                      aria-orientation="vertical"
                      onpointerdown={(e) =>
                        startClipTrim(e, tag, 'right', e.currentTarget.parentElement!.parentElement!)}
                      title="Seret untuk memangkas titik akhir klip"
                    ></div>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>

  <!-- BOTTOM HORIZONTAL PAN / OVERVIEW BAR (MOMEN STYLE) -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="overview-bar"
    onpointerdown={(e) => startOverviewPan(e, e.currentTarget)}
    title={zoomLevel > 1 ? 'Klik/Seret untuk menggeser jendela zoom linimasa' : 'Zoom > 1x untuk menggeser area linimasa'}
  >
    <div class="overview-track" style="margin-left: {HEADER_W}px;">
      <div
        class="overview-thumb"
        style="left: {(viewStart / safeDuration) * 100}%; width: {(windowDur / safeDuration) * 100}%;"
      >
        <span class="thumb-dot left"></span>
        <span class="thumb-dot right"></span>
      </div>
    </div>
  </div>
</div>

<style>
  .linimasa-shell {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #060c17;
    overflow: hidden;
    user-select: none;
  }

  /* HEADER (24px) */
  .linimasa-header {
    height: 24px;
    min-height: 24px;
    background: #0a1426;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 10px;
    gap: 8px;
    flex-shrink: 0;
  }

  .lh-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    overflow: hidden;
  }

  .lh-title {
    font-size: 10px;
    font-weight: 800;
    color: #f0f6fc;
    letter-spacing: 0.03em;
    flex-shrink: 0;
  }

  .lh-hint {
    font-size: 9px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lh-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .roll-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .roll-lbl {
    font-size: 9px;
    font-weight: 700;
    color: #38bdf8;
    margin-right: 1px;
  }

  .roll-btn {
    background: #060b14;
    border: 1px solid #1a355d;
    color: #94a3b8;
    font-size: 8px;
    font-weight: 700;
    padding: 1px 4px;
    border-radius: 3px;
    cursor: pointer;
  }

  .roll-btn:hover {
    color: #ffffff;
    border-color: #38bdf8;
  }

  .roll-val {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    font-weight: 800;
    color: #f0f6fc;
    min-width: 18px;
    text-align: center;
  }

  .lh-sep {
    width: 1px;
    height: 12px;
    background: #1a355d;
  }

  .lh-cur-badge {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    font-weight: 800;
    color: #f8fafc;
    background: #0f172a;
    border: 1px solid #1e3a5f;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .zoom-controls {
    display: flex;
    align-items: center;
    background: #060b14;
    border: 1px solid #1a355d;
    border-radius: 4px;
    overflow: hidden;
  }

  .zoom-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 2px 5px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .zoom-btn:hover:not(:disabled) {
    background: #0d1e38;
    color: #38bdf8;
  }

  .zoom-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .zoom-val-btn {
    background: transparent;
    border: none;
    border-left: 1px solid #1a355d;
    border-right: 1px solid #1a355d;
    color: #93c5fd;
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    font-weight: 700;
    padding: 1px 6px;
    cursor: pointer;
  }

  .zoom-val-btn:hover {
    color: #ffffff;
  }

  /* BODY + RULER */
  .linimasa-body {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .ruler-row {
    height: 20px;
    min-height: 20px;
    display: flex;
    align-items: stretch;
    background: #081120;
    border-bottom: 1px solid #1a355d;
    flex-shrink: 0;
  }

  .ruler-corner {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    padding: 0 8px;
    font-size: 8px;
    font-weight: 800;
    color: #64748b;
    letter-spacing: 0.05em;
    border-right: 1px solid #1a355d;
    box-sizing: border-box;
    background: #0a1528;
  }

  .ruler-track {
    position: relative;
    flex: 1;
    cursor: pointer;
    overflow: hidden;
  }

  .ruler-tick {
    position: absolute;
    top: 0;
    bottom: 0;
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    pointer-events: none;
  }

  .tick-mark {
    width: 1px;
    height: 5px;
    background: #334155;
  }

  .tick-lbl {
    font-family: 'Fira Code', monospace;
    font-size: 8px;
    color: #64748b;
    transform: translateX(3px);
    line-height: 1;
    margin-top: 2px;
  }

  .ruler-playhead-badge {
    position: absolute;
    top: 2px;
    transform: translateX(-50%);
    background: #0284c7;
    color: #ffffff;
    font-family: 'Fira Code', monospace;
    font-size: 8px;
    font-weight: 800;
    padding: 1px 5px;
    border-radius: 3px;
    pointer-events: none;
    z-index: 10;
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.5);
  }

  /* LANES SCROLL AREA */
  .lanes-scroll-wrap {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    overflow-x: hidden;
    position: relative;
  }

  .lanes-content {
    position: relative;
    min-height: 100%;
    display: flex;
    flex-direction: column;
  }

  .linimasa-playhead-layer {
    position: absolute;
    top: 0;
    bottom: 0;
    right: 0;
    pointer-events: none;
    z-index: 25;
  }

  .playhead-needle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.8);
    transform: translateX(-50%);
  }

  .in-point-needle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 2px;
    background: #10b981;
  }

  .linimasa-lane-row {
    display: flex;
    align-items: stretch;
    height: 22px;
    min-height: 22px;
    border-bottom: 1px solid #0e1e38;
  }

  .lane-header {
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 0 6px;
    background: #091322;
    border-right: 1px solid #1a355d;
    box-sizing: border-box;
    position: relative;
    overflow: hidden;
  }

  .lane-color-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
  }

  .lane-count-num {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    font-weight: 800;
    color: #94a3b8;
    min-width: 14px;
    text-align: right;
    margin-left: 2px;
    flex-shrink: 0;
  }

  .lane-kbd {
    font-family: monospace;
    font-size: 8px;
    font-weight: 800;
    color: #e2e8f0;
    background: #1e293b;
    border: 1px solid #334155;
    padding: 0 4px;
    border-radius: 3px;
    line-height: 1.3;
    flex-shrink: 0;
  }

  .lane-cat-name {
    font-size: 9px;
    font-weight: 700;
    color: #cbd5e1;
    flex: 1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lane-track {
    position: relative;
    flex: 1;
    cursor: pointer;
    overflow: hidden;
  }

  .clip-block {
    position: absolute;
    top: 2px;
    bottom: 2px;
    border-radius: 3px;
    border: 1px solid rgba(255, 255, 255, 0.3);
    display: flex;
    align-items: center;
    padding: 0 5px;
    box-sizing: border-box;
    overflow: hidden;
    cursor: pointer;
    z-index: 6;
  }

  .clip-block:hover {
    z-index: 12;
    filter: brightness(1.15);
  }

  .clip-block.selected,
  .clip-block.trimming {
    outline: 1.5px solid #ffffff;
    z-index: 15;
  }

  .clip-block-live {
    outline: 1.5px dashed #ef4444;
    z-index: 14;
    animation: pulseLiveClip 1s infinite;
  }

  .clip-block-label {
    font-size: 8px;
    font-weight: 800;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
    pointer-events: none;
  }

  .trim-handle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 6px;
    cursor: ew-resize;
    z-index: 8;
    opacity: 0;
    background: rgba(255, 255, 255, 0.45);
    transition: opacity 0.12s;
  }

  .clip-block:hover .trim-handle,
  .clip-block.trimming .trim-handle {
    opacity: 1;
  }

  .trim-handle-l {
    left: 0;
    border-radius: 3px 0 0 3px;
  }

  .trim-handle-r {
    right: 0;
    border-radius: 0 3px 3px 0;
  }

  @keyframes pulseLiveClip {
    50% {
      opacity: 0.65;
    }
  }

  /* OVERVIEW HORIZONTAL PAN BAR */
  .overview-bar {
    height: 12px;
    min-height: 12px;
    background: #070e1c;
    border-top: 1px solid #13284a;
    display: flex;
    align-items: center;
    padding-right: 6px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .overview-track {
    position: relative;
    flex: 1;
    height: 4px;
    background: #0f1d36;
    border-radius: 999px;
  }

  .overview-thumb {
    position: absolute;
    top: -1px;
    height: 6px;
    background: #1e4570;
    border: 1px solid #38bdf8;
    border-radius: 999px;
    min-width: 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .thumb-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #e2e8f0;
    border: 1px solid #0f172a;
    transform: translateY(-0.5px);
  }
</style>

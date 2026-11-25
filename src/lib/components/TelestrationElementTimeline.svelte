<script lang="ts">
  import { onDestroy } from 'svelte';
  import type { DrawingElement, DrawingToolType, FreezeStop } from '$lib/types';
  import { isElementVisibleAtTime } from '$lib/tracking/playerTracker';
  import { ChevronDown, ChevronUp, RotateCcw, Clock, Pause, Plus, X, Pin } from 'lucide-svelte';

  interface Props {
    drawings: DrawingElement[];
    selectedElementId: string | null;
    clipStart: number;
    clipEnd: number;
    currentTime: number;
    freezeStops?: FreezeStop[];
    selectedFreezeStopId?: string | null;
    onSelect: (id: string) => void;
    onChangeLifespan: (id: string, timeStart: number, timeEnd: number) => void;
    onResetLifespan: (id: string) => void;
    onSeek: (time: number) => void;
    onAddFreezeStop?: () => void;
    onSelectFreezeStop?: (id: string) => void;
    onMoveFreezeStop?: (id: string, time: number) => void;
    onDeleteFreezeStop?: (id: string) => void;
  }

  let {
    drawings,
    selectedElementId,
    clipStart,
    clipEnd,
    currentTime,
    freezeStops = [],
    selectedFreezeStopId = null,
    onSelect,
    onChangeLifespan,
    onResetLifespan,
    onSeek,
    onAddFreezeStop,
    onSelectFreezeStop,
    onMoveFreezeStop,
    onDeleteFreezeStop,
  }: Props = $props();

  const MIN_SPAN = 0.15;

  const TYPE_LABELS: Partial<Record<DrawingToolType, string>> = {
    'player-circle': 'Lingkaran Pemain',
    'spotlight-3d': '3D Spotlight',
    'pass-arrow': 'Panah Operan',
    'curved-arrow': 'Panah Lengkung',
    'run-arrow': 'Panah Lari',
    'dribble-arrow': 'Panah Dribble',
    'pressing-zone': 'Zona Pressing',
    'player-link': 'Garis Formasi',
    'distance-line': 'Garis Jarak',
    'vision-cone': 'Radar Visi',
    'compactness-hull': 'Area Kompak',
    magnifier: 'Lensa Zoom',
    'player-cross': 'Silang Taktik',
    'player-ghost': 'Bayangan Pemain',
    'note-text': 'Catatan Taktik',
    'text-note': 'Catatan Taktik',
    freehand: 'Marker Bebas',
  };

  let collapsed = $state(false);
  let activeDrag = $state<{
    id: string;
    mode: 'start' | 'end' | 'move';
    laneRect: DOMRect;
    originX: number;
    origStart: number;
    origEnd: number;
  } | null>(null);

  let clipDur = $derived(Math.max(0.2, clipEnd - clipStart));
  let playheadPct = $derived(
    Math.max(0, Math.min(100, ((currentTime - clipStart) / clipDur) * 100))
  );
  let selectedEl = $derived(drawings.find((d) => d.id === selectedElementId) ?? null);
  let targetFreezeStop = $derived.by(() => {
    if (freezeStops.length === 0) return null;
    if (selectedFreezeStopId) {
      const sel = freezeStops.find((s) => s.id === selectedFreezeStopId);
      if (sel) return sel;
    }
    return freezeStops.reduce((best, s) =>
      Math.abs(s.time - currentTime) < Math.abs(best.time - currentTime) ? s : best
    );
  });

  function clampSpan(valStart: number, valEnd: number): [number, number] {
    let s = Math.max(clipStart, Math.min(clipEnd - MIN_SPAN, valStart));
    let e = Math.min(clipEnd, Math.max(s + MIN_SPAN, valEnd));
    if (e - s < MIN_SPAN) {
      s = Math.max(clipStart, e - MIN_SPAN);
    }
    return [Number(s.toFixed(3)), Number(e.toFixed(3))];
  }

  function getElSpan(el: DrawingElement): [number, number] {
    const rawS = typeof el.timeStart === 'number' ? el.timeStart : clipStart;
    const rawE = typeof el.timeEnd === 'number' ? el.timeEnd : clipEnd;
    return clampSpan(rawS, rawE);
  }

  function getDisplayLabel(el: DrawingElement): string {
    const clean = el.label?.trim();
    if (clean && !(el.type === 'player-circle' && /^#P\d+$/i.test(clean))) {
      return clean;
    }
    return TYPE_LABELS[el.type] || el.type;
  }

  function tintRgba(hex: string, alpha: number): string {
    const clean = (hex || '#38bdf8').replace('#', '');
    if (clean.length === 3) {
      const r = parseInt(clean[0] + clean[0], 16);
      const g = parseInt(clean[1] + clean[1], 16);
      const b = parseInt(clean[2] + clean[2], 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    if (clean.length === 6) {
      const r = parseInt(clean.slice(0, 2), 16);
      const g = parseInt(clean.slice(2, 4), 16);
      const b = parseInt(clean.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return `rgba(56, 189, 248, ${alpha})`;
  }

  let activeStopDrag = $state<{
    freezeStopId: string;
    laneRect: DOMRect;
  } | null>(null);

  function handleWindowPointerMove(e: PointerEvent) {
    if (activeStopDrag) {
      const width = Math.max(20, activeStopDrag.laneRect.width);
      const ratio = Math.max(0, Math.min(1, (e.clientX - activeStopDrag.laneRect.left) / width));
      const nextTime = Number((clipStart + ratio * clipDur).toFixed(2));
      onMoveFreezeStop?.(activeStopDrag.freezeStopId, nextTime);
      return;
    }
    if (!activeDrag) return;
    const width = Math.max(20, activeDrag.laneRect.width);
    const deltaSec = ((e.clientX - activeDrag.originX) / width) * clipDur;
    const { id, mode, origStart, origEnd } = activeDrag;

    if (mode === 'start') {
      const nextStart = Math.max(clipStart, Math.min(origEnd - MIN_SPAN, origStart + deltaSec));
      onChangeLifespan(id, Number(nextStart.toFixed(3)), Number(origEnd.toFixed(3)));
    } else if (mode === 'end') {
      const nextEnd = Math.min(clipEnd, Math.max(origStart + MIN_SPAN, origEnd + deltaSec));
      onChangeLifespan(id, Number(origStart.toFixed(3)), Number(nextEnd.toFixed(3)));
    } else {
      const span = Math.max(MIN_SPAN, origEnd - origStart);
      let nextStart = origStart + deltaSec;
      nextStart = Math.max(clipStart, Math.min(clipEnd - span, nextStart));
      const nextEnd = Math.min(clipEnd, nextStart + span);
      onChangeLifespan(id, Number(nextStart.toFixed(3)), Number(nextEnd.toFixed(3)));
    }
  }

  function stopDragListeners() {
    if (typeof window !== 'undefined') {
      window.removeEventListener('pointermove', handleWindowPointerMove);
      window.removeEventListener('pointerup', stopDragListeners);
      window.removeEventListener('pointercancel', stopDragListeners);
    }
    activeDrag = null;
    activeStopDrag = null;
  }

  function startFreezeStopDrag(e: PointerEvent, stop: FreezeStop) {
    e.stopPropagation();
    e.preventDefault();
    onSelectFreezeStop?.(stop.id);
    onSeek(stop.time);
    const target = e.currentTarget as HTMLElement | null;
    const laneEl = target?.closest('.el-track-lane') as HTMLElement | null;
    if (!laneEl) return;

    stopDragListeners();
    activeStopDrag = {
      freezeStopId: stop.id,
      laneRect: laneEl.getBoundingClientRect(),
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', stopDragListeners);
      window.addEventListener('pointercancel', stopDragListeners);
    }
  }

  function startBarDrag(
    e: PointerEvent,
    el: DrawingElement,
    mode: 'start' | 'end' | 'move'
  ) {
    e.stopPropagation();
    e.preventDefault();
    onSelect(el.id);
    const target = e.currentTarget as HTMLElement | null;
    const laneEl = target?.closest('.el-track-lane') as HTMLElement | null;
    if (!laneEl) return;

    const [origStart, origEnd] = getElSpan(el);
    stopDragListeners();
    activeDrag = {
      id: el.id,
      mode,
      laneRect: laneEl.getBoundingClientRect(),
      originX: e.clientX,
      origStart,
      origEnd,
    };

    if (typeof window !== 'undefined') {
      window.addEventListener('pointermove', handleWindowPointerMove);
      window.addEventListener('pointerup', stopDragListeners);
      window.addEventListener('pointercancel', stopDragListeners);
    }
  }

  function handleLaneClick(e: MouseEvent) {
    const targetEl = e.target as HTMLElement | null;
    if (targetEl?.closest('.el-duration-bar')) return;
    const lane = e.currentTarget as HTMLElement;
    const rect = lane.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / Math.max(1, rect.width)));
    onSeek(Number((clipStart + ratio * clipDur).toFixed(3)));
  }

  function applySetIn() {
    if (!selectedEl) return;
    const [, curEnd] = getElSpan(selectedEl);
    const nextStart = Math.max(clipStart, Math.min(curEnd - MIN_SPAN, currentTime));
    onChangeLifespan(selectedEl.id, Number(nextStart.toFixed(3)), curEnd);
  }

  function applySetOut() {
    if (!selectedEl) return;
    const [curStart] = getElSpan(selectedEl);
    const nextEnd = Math.min(clipEnd, Math.max(curStart + MIN_SPAN, currentTime));
    onChangeLifespan(selectedEl.id, curStart, Number(nextEnd.toFixed(3)));
  }

  function applyOnlyAtFreezeStop() {
    if (!selectedEl || !targetFreezeStop) return;
    const rawStart = Math.max(clipStart, targetFreezeStop.time - 0.1);
    const rawEnd = Math.min(clipEnd, targetFreezeStop.time + 0.1);
    const [nextStart, nextEnd] = clampSpan(rawStart, rawEnd);
    onChangeLifespan(selectedEl.id, nextStart, nextEnd);
    onSeek(targetFreezeStop.time);
  }

  onDestroy(() => {
    stopDragListeners();
  });
</script>

<div class="element-timeline-panel">
  <div class="tl-header">
    <div class="tl-title-group">
      <button
        type="button"
        class="tl-collapse-btn"
        onclick={() => (collapsed = !collapsed)}
        title={collapsed ? 'Tampilkan Linimasa Elemen' : 'Sembunyikan Linimasa Elemen'}
      >
        {#if collapsed}
          <ChevronUp size={13} />
        {:else}
          <ChevronDown size={13} />
        {/if}
        <Clock size={12} />
        <span>Linimasa Elemen ({drawings.length})</span>
      </button>
      <span class="tl-hint">Geser sisi kiri/kanan bar untuk atur detik muncul & hilang</span>
    </div>

    <div class="tl-actions">
      {#if onAddFreezeStop}
        <button
          type="button"
          class="tl-btn tl-btn-freeze"
          onclick={onAddFreezeStop}
          title="Tambah titik jeda Freeze-Frame pada posisi playhead (Tombol F)"
        >
          <Plus size={11} />
          <span>Jeda Freeze (F)</span>
        </button>
      {/if}
      <button
        type="button"
        class="tl-btn"
        disabled={!selectedEl}
        onclick={applySetIn}
        title="Atur detik mulai elemen terpilih ke posisi playhead (Tombol I)"
      >
        Set Mulai (I)
      </button>
      <button
        type="button"
        class="tl-btn"
        disabled={!selectedEl}
        onclick={applySetOut}
        title="Atur detik selesai elemen terpilih ke posisi playhead (Tombol O)"
      >
        Set Akhir (O)
      </button>
      <button
        type="button"
        class="tl-btn tl-btn-freeze-lock"
        disabled={!selectedEl || !targetFreezeStop}
        onclick={applyOnlyAtFreezeStop}
        title={targetFreezeStop
          ? `Kunci elemen terpilih agar tampil hanya di ${targetFreezeStop.label || 'jeda terdekat'} (${(targetFreezeStop.time - clipStart).toFixed(1)}s)`
          : 'Tambahkan titik Jeda Freeze terlebih dahulu'}
      >
        <Pin size={11} />
        <span>Hanya di Jeda Ini</span>
      </button>
      <button
        type="button"
        class="tl-btn tl-btn-reset"
        disabled={!selectedEl}
        onclick={() => selectedEl && onResetLifespan(selectedEl.id)}
        title="Kembalikan elemen tampil sepanjang klip penuh"
      >
        <RotateCcw size={11} />
        <span>Penuh Klip</span>
      </button>
    </div>
  </div>

  {#if !collapsed}
    <div class="tl-tracks-scroll">
      {#if onAddFreezeStop || freezeStops.length > 0}
        <div class="el-track-row freeze-track-row">
          <div class="el-label-col" title="Daftar titik jeda Freeze-Frame dalam klip ini">
            <Pause size={10} class="text-amber-400 shrink-0" />
            <span class="el-name freeze-lbl">Jeda Freeze ({freezeStops.length})</span>
          </div>

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="el-track-lane freeze-lane" onclick={handleLaneClick}>
            <div class="el-playhead" style="left: {playheadPct}%"></div>
            {#if freezeStops.length === 0}
              <span class="freeze-empty-hint">Klik "+ Jeda Freeze (F)" untuk menambah jeda analisis bertahap</span>
            {/if}
            {#each freezeStops as stop, idx (stop.id)}
              {@const stopPct = Math.max(1, Math.min(99, ((stop.time - clipStart) / clipDur) * 100))}
              {@const isSelStop = stop.id === selectedFreezeStopId}
              <div
                class="freeze-stop-marker"
                class:selected={isSelStop}
                style="left: {stopPct}%;"
                onpointerdown={(ev) => startFreezeStopDrag(ev, stop)}
                title="{stop.label || `Jeda #${idx + 1}`} @ {(stop.time - clipStart).toFixed(1)}s · Durasi {stop.duration.toFixed(1)}s (seret untuk geser posisi)"
              >
                <span class="fs-idx">#{idx + 1}</span>
                <span class="fs-dur">{stop.duration.toFixed(1)}s</span>
                {#if onDeleteFreezeStop}
                  <button
                    type="button"
                    class="fs-del"
                    onclick={(ev) => {
                      ev.stopPropagation();
                      onDeleteFreezeStop(stop.id);
                    }}
                    title="Hapus jeda ini"
                  >
                    <X size={9} />
                  </button>
                {/if}
              </div>
            {/each}
          </div>
        </div>
      {/if}

      {#each drawings as d (d.id)}
        {@const [s, e] = getElSpan(d)}
        {@const leftPct = Math.max(0, Math.min(100, ((s - clipStart) / clipDur) * 100))}
        {@const rightPct = Math.max(0, Math.min(100, ((e - clipStart) / clipDur) * 100))}
        {@const widthPct = Math.max(2, rightPct - leftPct)}
        {@const isSelected = d.id === selectedElementId}
        {@const isVisibleNow = isElementVisibleAtTime(d, currentTime)}

        <div
          class="el-track-row"
          class:selected={isSelected}
          class:dimmed={!isVisibleNow && !isSelected}
          onclick={() => onSelect(d.id)}
          role="button"
          tabindex="0"
          onkeydown={(ev) => {
            if (ev.key === 'Enter' || ev.key === ' ') {
              ev.preventDefault();
              onSelect(d.id);
            }
          }}
        >
          <div class="el-label-col" title="{getDisplayLabel(d)} ({(s - clipStart).toFixed(1)}s - {(e - clipStart).toFixed(1)}s)">
            <span class="el-color-dot" style="background-color: {d.color}"></span>
            <span class="el-name">{getDisplayLabel(d)}</span>
            <span class="el-time-badge">{(s - clipStart).toFixed(1)}-{(e - clipStart).toFixed(1)}s</span>
          </div>

          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div class="el-track-lane" onclick={handleLaneClick}>
            <div class="el-playhead" style="left: {playheadPct}%"></div>
            {#each freezeStops as stop (stop.id)}
              {@const gPct = Math.max(0, Math.min(100, ((stop.time - clipStart) / clipDur) * 100))}
              <div class="el-freeze-guide" style="left: {gPct}%"></div>
            {/each}

            <div
              class="el-duration-bar"
              class:active-bar={isSelected}
              style="left: {leftPct}%; width: {widthPct}%; background: {tintRgba(d.color, isSelected ? 0.42 : 0.26)}; border-color: {d.color};"
              onpointerdown={(ev) => startBarDrag(ev, d, 'move')}
              title="Seret untuk menggeser waktu tampil | Handle kiri/kanan untuk trim durasi"
            >
              <div
                class="el-trim-handle left"
                data-mode="start"
                style="background-color: {d.color}"
                onpointerdown={(ev) => startBarDrag(ev, d, 'start')}
                title="Trim awal kemunculan"
              ></div>

              {#if d.keyframes && d.keyframes.length > 0}
                {#each d.keyframes as kf}
                  {#if kf.time >= s - 0.02 && kf.time <= e + 0.02}
                    {@const kfRelPct = ((kf.time - s) / Math.max(0.05, e - s)) * 100}
                    <span class="el-kf-dot" style="left: {Math.max(4, Math.min(96, kfRelPct))}%"></span>
                  {/if}
                {/each}
              {/if}

              <div
                class="el-trim-handle right"
                data-mode="end"
                style="background-color: {d.color}"
                onpointerdown={(ev) => startBarDrag(ev, d, 'end')}
                title="Trim akhir kemunculan"
              ></div>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}
</div>

<style>
  .element-timeline-panel {
    background: #071121;
    border-top: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    user-select: none;
  }

  .tl-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 4px 12px;
    background: #0b182e;
    border-bottom: 1px solid #13284a;
    gap: 8px;
  }

  .tl-title-group {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
  }

  .tl-collapse-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    border-radius: 5px;
    padding: 2px 8px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
  }

  .tl-collapse-btn:hover {
    background: rgba(56, 189, 248, 0.14);
    color: #ffffff;
    border-color: #38bdf8;
  }

  .tl-hint {
    font-size: 10px;
    color: #64748b;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tl-actions {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .tl-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0d1e38;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    padding: 2px 7px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }

  .tl-btn:hover:not(:disabled) {
    border-color: #38bdf8;
    color: #ffffff;
    background: #142b50;
  }

  .tl-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .tl-tracks-scroll {
    max-height: 112px;
    overflow-y: auto;
    padding: 4px 12px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .el-track-row {
    display: flex;
    align-items: center;
    height: 24px;
    gap: 8px;
    border-radius: 4px;
    padding: 0 4px;
    background: rgba(13, 30, 56, 0.45);
    border: 1px solid transparent;
    cursor: pointer;
  }

  .el-track-row.selected {
    background: rgba(56, 189, 248, 0.1);
    border-color: rgba(56, 189, 248, 0.45);
  }

  .el-track-row.dimmed {
    opacity: 0.55;
  }

  .el-label-col {
    width: 148px;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .el-color-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .el-name {
    font-size: 10px;
    font-weight: 600;
    color: #e2e8f0;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .el-time-badge {
    font-family: monospace;
    font-size: 9px;
    color: #7dd3fc;
    flex-shrink: 0;
  }

  .el-track-lane {
    flex: 1;
    height: 18px;
    position: relative;
    background: #050b16;
    border: 1px solid #13284a;
    border-radius: 3px;
    cursor: pointer;
  }

  .el-playhead {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1.5px;
    background: #38bdf8;
    pointer-events: none;
    z-index: 3;
    box-shadow: 0 0 4px rgba(56, 189, 248, 0.7);
  }

  .el-duration-bar {
    position: absolute;
    top: 2px;
    bottom: 2px;
    border-width: 1px;
    border-style: solid;
    border-radius: 3px;
    cursor: grab;
    z-index: 2;
    box-sizing: border-box;
    min-width: 10px;
  }

  .el-duration-bar:active {
    cursor: grabbing;
  }

  .el-duration-bar.active-bar {
    box-shadow: 0 0 6px rgba(56, 189, 248, 0.45);
  }

  .el-trim-handle {
    position: absolute;
    top: -1px;
    bottom: -1px;
    width: 5px;
    cursor: ew-resize;
    opacity: 0.9;
  }

  .el-trim-handle.left {
    left: -1px;
    border-radius: 2px 0 0 2px;
  }

  .el-trim-handle.right {
    right: -1px;
    border-radius: 0 2px 2px 0;
  }

  .el-kf-dot {
    position: absolute;
    top: 50%;
    width: 3px;
    height: 3px;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.85);
    transform: translate(-50%, -50%);
    pointer-events: none;
  }

  .tl-btn-freeze {
    border-color: rgba(245, 158, 11, 0.55);
    color: #fcd34d;
  }

  .tl-btn-freeze:hover {
    background: rgba(245, 158, 11, 0.16);
    border-color: #f59e0b;
    color: #ffffff;
  }

  .tl-btn-freeze-lock {
    border-color: rgba(245, 158, 11, 0.5);
    color: #fde68a;
    background: rgba(245, 158, 11, 0.08);
  }

  .tl-btn-freeze-lock:hover:not(:disabled) {
    background: rgba(245, 158, 11, 0.22);
    border-color: #f59e0b;
    color: #ffffff;
  }

  .freeze-track-row {
    background: rgba(245, 158, 11, 0.08);
    border-color: rgba(245, 158, 11, 0.25);
  }

  .freeze-lbl {
    color: #fcd34d;
  }

  .freeze-lane {
    overflow: visible;
  }

  .freeze-empty-hint {
    position: absolute;
    left: 8px;
    top: 50%;
    transform: translateY(-50%);
    font-size: 9px;
    color: #64748b;
    pointer-events: none;
  }

  .freeze-stop-marker {
    position: absolute;
    top: 1px;
    bottom: 1px;
    transform: translateX(-50%);
    display: inline-flex;
    align-items: center;
    gap: 3px;
    padding: 0 5px;
    border-radius: 999px;
    background: #1e293b;
    border: 1px solid #f59e0b;
    color: #fde68a;
    font-size: 9px;
    font-weight: 800;
    cursor: grab;
    z-index: 4;
    white-space: nowrap;
  }

  .freeze-stop-marker.selected {
    background: #b45309;
    border-color: #ffffff;
    color: #ffffff;
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.7);
    z-index: 6;
  }

  .fs-dur {
    font-family: monospace;
    font-size: 8px;
    opacity: 0.9;
  }

  .fs-del {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: inherit;
    padding: 0;
    cursor: pointer;
    opacity: 0.75;
  }

  .fs-del:hover {
    opacity: 1;
    color: #fecaca;
  }

  .el-freeze-guide {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 1px;
    border-left: 1px dashed rgba(245, 158, 11, 0.5);
    pointer-events: none;
    z-index: 1;
  }
</style>

<script lang="ts">
  import { untrack } from 'svelte';
  import {
    ZoomIn,
    ZoomOut,
    ChevronDown,
    ChevronUp,
    Filter,
    Layers,
    Tag,
    Users,
    ListPlus,
    Trash2,
    Clipboard,
    X,
    Check,
    Plus,
  } from 'lucide-svelte';
  import TimelineClipContextMenu from '$lib/components/TimelineClipContextMenu.svelte';
  import TimelineHoverThumbnail from './TimelineHoverThumbnail.svelte';
  import type {
    ActiveContinuousTag,
    PeriodKickoff,
    TaggingBoard,
    VideoTagEvent,
    WhistleMarker,
  } from '$lib/types';

  interface Props {
    videoSrc?: string | null;
    board: TaggingBoard;
    tags: VideoTagEvent[];
    activeContinuousTags: Record<string, ActiveContinuousTag>;
    currentTime: number;
    duration: number;
    inPoint: number | null;
    leadTimeSeconds: number;
    lagTimeSeconds: number;
    selectedClipId: string | null;
    selectedClipIds?: string[];
    roster?: string[];
    hasCopiedMeta?: boolean;
    isCollapsed?: boolean;
    activeLoopClipId: string | null;
    periodKickoffs?: PeriodKickoff[];
    useMatchClock?: boolean;
    formatMatchClock?: (sec: number) => string;
    whistleMarkers?: WhistleMarker[];
    onQuickTagWhistle?: (marker: WhistleMarker) => void;
    onSeek: (time: number) => void;
    onSelectClip: (tag: VideoTagEvent) => void;
    onSelectionChange?: (ids: string[], primaryId: string | null) => void;
    onEditClip: (tag: VideoTagEvent) => void;
    onOpenTelestration?: (tag: VideoTagEvent) => void;
    onTrimClip: (tagId: string, newStart: number, newEnd: number) => void;
    onMoveClip: (tagId: string, newStart: number, newEnd: number) => void;
    onReassignClipCategory: (
      tagId: string,
      targetCategory: string,
      targetColor: string,
      targetButtonId?: string
    ) => void;
    onBatchChangeCategory?: (
      ids: string[],
      category: string,
      color: string,
      buttonId?: string
    ) => void;
    onBatchToggleLabel?: (
      ids: string[],
      desc: { id: string; name: string; color?: string; group?: string | null }
    ) => void;
    onBatchAddCustomLabel?: (ids: string[], name: string) => void;
    onBatchTogglePlayer?: (ids: string[], playerLabel: string) => void;
    onBatchAddCustomPlayer?: (ids: string[], rawName: string) => void;
    onBatchSetTeamSide?: (ids: string[], side: 'home' | 'away') => void;
    onBatchToggleFavorite?: (ids: string[]) => void;
    onSplitClip?: (tag: VideoTagEvent) => void;
    onDuplicateClip?: (tag: VideoTagEvent) => void;
    onCopyClipMeta?: (tag: VideoTagEvent) => void;
    onBatchPasteMeta?: (ids: string[]) => void;
    onBatchAddToPlaylist?: (ids: string[]) => void;
    onQuickExportClip?: (tag: VideoTagEvent) => void;
    onBatchDeleteClips?: (ids: string[]) => void;
    onToggleCollapse?: () => void;
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
    selectedClipIds = [],
    roster = [],
    hasCopiedMeta = false,
    isCollapsed = false,
    activeLoopClipId,
    periodKickoffs = [],
    useMatchClock = false,
    formatMatchClock,
    videoSrc = null,
    whistleMarkers = [],
    onQuickTagWhistle,
    onSeek,
    onSelectClip,
    onSelectionChange,
    onEditClip,
    onOpenTelestration,
    onTrimClip,
    onMoveClip,
    onReassignClipCategory,
    onBatchChangeCategory,
    onBatchToggleLabel,
    onBatchAddCustomLabel,
    onBatchTogglePlayer,
    onBatchAddCustomPlayer,
    onBatchSetTeamSide,
    onBatchToggleFavorite,
    onSplitClip,
    onDuplicateClip,
    onCopyClipMeta,
    onBatchPasteMeta,
    onBatchAddToPlaylist,
    onQuickExportClip,
    onBatchDeleteClips,
    onToggleCollapse,
    onChangeLead,
    onChangeLag,
  }: Props = $props();

  const HEADER_W = 152;
  const safeDuration = $derived(Math.max(duration || 0, 10));

  let zoomLevel = $state<number>(1);
  let viewStart = $state<number>(0);
  let onlyPopulatedLanes = $state(false);
  let teamFilter = $state<'all' | 'home' | 'away'>('all');
  let ctxMenu = $state<{ open: boolean; x: number; y: number; tagId: string | null }>({
    open: false,
    x: 0,
    y: 0,
    tagId: null,
  });
  let batchPopover = $state<'category' | 'labels' | 'players' | null>(null);
  let batchCustomLabel = $state('');
  let batchCustomPlayer = $state('');

  const effectiveSelectedIds = $derived(
    selectedClipIds && selectedClipIds.length > 0
      ? selectedClipIds
      : selectedClipId
        ? [selectedClipId]
        : []
  );

  const ctxMenuTag = $derived(
    ctxMenu.tagId ? (tags.find((t) => t.id === ctxMenu.tagId) ?? null) : null
  );

  const targetIdsForCtx = $derived(
    ctxMenu.tagId && effectiveSelectedIds.includes(ctxMenu.tagId)
      ? effectiveSelectedIds
      : ctxMenu.tagId
        ? [ctxMenu.tagId]
        : []
  );

  $effect(() => {
    if (effectiveSelectedIds.length <= 1) {
      batchPopover = null;
    }
  });

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
    buttonId?: string;
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
          buttonId: btn.id,
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

    // Completed clips (including custom / imported tags, filtered by teamFilter)
    for (const t of tags) {
      const isAway = t.teamSide === 'away' || t.playerLabel === 'Tim Lawan';
      if (teamFilter === 'home' && isAway) continue;
      if (teamFilter === 'away' && !isAway) continue;
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

    const list = Array.from(map.values());
    return onlyPopulatedLanes
      ? list.filter((l) => l.tags.length > 0 || l.live.length > 0)
      : list;
  });

  function handleClipClick(e: MouseEvent, tag: VideoTagEvent) {
    e.stopPropagation();
    if (suppressNextClick) return;
    if (e.ctrlKey || e.metaKey) {
      const exists = effectiveSelectedIds.includes(tag.id);
      const nextIds = exists
        ? effectiveSelectedIds.filter((id) => id !== tag.id)
        : [...effectiveSelectedIds, tag.id];
      const nextPrimary = nextIds[nextIds.length - 1] ?? null;
      onSelectionChange?.(nextIds, nextPrimary);
      return;
    }
    if (e.shiftKey && selectedClipId) {
      const ordered = [...tags].sort((a, b) => a.startTime - b.startTime);
      const i1 = ordered.findIndex((t) => t.id === selectedClipId);
      const i2 = ordered.findIndex((t) => t.id === tag.id);
      if (i1 !== -1 && i2 !== -1) {
        const [lo, hi] = i1 <= i2 ? [i1, i2] : [i2, i1];
        const rangeIds = ordered.slice(lo, hi + 1).map((t) => t.id);
        onSelectionChange?.(rangeIds, tag.id);
        return;
      }
    }
    onSelectionChange?.([tag.id], tag.id);
    onSelectClip(tag);
  }

  function openClipContextMenu(e: MouseEvent, tag: VideoTagEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!effectiveSelectedIds.includes(tag.id)) {
      onSelectionChange?.([tag.id], tag.id);
    }
    ctxMenu = {
      open: true,
      x: e.clientX,
      y: e.clientY,
      tagId: tag.id,
    };
  }

  const boardCatButtons = $derived(board.buttons.filter((b) => b.kind === 'category'));
  const boardDescButtons = $derived(board.buttons.filter((b) => b.kind === 'descriptor'));

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
        const lbl =
          useMatchClock && periodKickoffs.length > 0 && formatMatchClock
            ? formatMatchClock(t)
            : formatTime(t);
        ticks.push({ time: t, leftPct: pct, label: lbl });
      }
    }
    return ticks;
  });

  const kickoffMarkers = $derived.by(() => {
    return periodKickoffs
      .map((k) => {
        const leftPct = ((k.videoTime - viewStart) / windowDur) * 100;
        const shortLabel = k.period === 1 ? 'KO B1' : k.period === 2 ? 'KO B2' : 'KO ET';
        const color = k.period === 1 ? '#10b981' : k.period === 2 ? '#f59e0b' : '#a855f7';
        return { ...k, leftPct, shortLabel, color };
      })
      .filter((k) => k.leftPct >= 0 && k.leftPct <= 100);
  });

  const visibleWhistleMarkers = $derived.by(() => {
    return (whistleMarkers || [])
      .map((w) => ({
        ...w,
        leftPct: ((w.peakTime - viewStart) / windowDur) * 100,
      }))
      .filter((w) => w.leftPct >= 0 && w.leftPct <= 100);
  });

  const playheadPct = $derived(((currentTime - viewStart) / windowDur) * 100);
  const playheadVisible = $derived(playheadPct >= 0 && playheadPct <= 100);

  const inPointPct = $derived(
    inPoint !== null ? ((inPoint - viewStart) / windowDur) * 100 : null
  );

  // Auto-scroll lane container when selectedClipId changes
  let lanesWrapEl = $state<HTMLDivElement | null>(null);
  let lastScrolledClipId = $state<string | null>(null);
  $effect(() => {
    const id = selectedClipId;
    if (!id || id === lastScrolledClipId) return;
    lastScrolledClipId = id;
    const targetTag = tags.find((t) => t.id === id);
    if (!targetTag || !lanesWrapEl) return;
    const laneIdx = allCategoryLanes.findIndex((l) => l.category === targetTag.category);
    if (laneIdx === -1) return;
    const rows = lanesWrapEl.querySelectorAll<HTMLElement>('.linimasa-lane-row');
    rows[laneIdx]?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Clip trim dragging state
  let trimmingTagId = $state<string | null>(null);
  let trimPreviewStart = $state<number>(0);
  let trimPreviewEnd = $state<number>(0);

  // Clip middle drag (horizontal move + vertical lane reassign)
  let draggingTagId = $state<string | null>(null);
  let dragPreviewStart = $state<number>(0);
  let dragPreviewEnd = $state<number>(0);
  let dragOriginalCategory = $state<string | null>(null);
  let dragHoverLane = $state<{ category: string; color: string; buttonId?: string } | null>(null);
  let suppressNextClick = false;

  function startClipDrag(
    e: PointerEvent,
    tag: VideoTagEvent,
    trackEl: HTMLElement
  ) {
    if (e.button !== 0) return;
    if ((e.target as HTMLElement)?.closest('.trim-handle')) return;
    const rect = trackEl.getBoundingClientRect();
    if (rect.width <= 0) return;

    const startX = e.clientX;
    const startY = e.clientY;
    const clipDur = Math.max(0.4, tag.endTime - tag.startTime);
    let moved = false;

    function onMove(ev: PointerEvent) {
      if (!moved && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) {
        return;
      }
      if (!moved) {
        moved = true;
        draggingTagId = tag.id;
        dragOriginalCategory = tag.category;
      }

      const deltaSec = ((ev.clientX - startX) / rect.width) * windowDur;
      const snappedStart = Math.round((tag.startTime + deltaSec) * 10) / 10;
      const clampedStart = Math.max(0, Math.min(Math.max(0, safeDuration - clipDur), snappedStart));
      dragPreviewStart = Number(clampedStart.toFixed(2));
      dragPreviewEnd = Number((clampedStart + clipDur).toFixed(2));

      if (lanesWrapEl) {
        const rows = lanesWrapEl.querySelectorAll<HTMLElement>('.linimasa-lane-row');
        let matched: { category: string; color: string; buttonId?: string } | null = null;
        for (const row of rows) {
          const r = row.getBoundingClientRect();
          if (ev.clientY >= r.top && ev.clientY <= r.bottom) {
            const cat = row.dataset.laneCategory;
            const col = row.dataset.laneColor || tag.color;
            const btnId = row.dataset.laneButtonId || undefined;
            if (cat) {
              matched = { category: cat, color: col, buttonId: btnId };
            }
            break;
          }
        }
        dragHoverLane = matched;
      }
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved) {
        suppressNextClick = true;
        setTimeout(() => {
          suppressNextClick = false;
        }, 60);

        const finalStart = dragPreviewStart;
        const finalEnd = dragPreviewEnd;
        const targetLane = dragHoverLane;

        draggingTagId = null;
        dragOriginalCategory = null;
        dragHoverLane = null;

        if (targetLane && targetLane.category !== tag.category) {
          onReassignClipCategory(tag.id, targetLane.category, targetLane.color, targetLane.buttonId);
        }
        if (Math.abs(finalStart - tag.startTime) >= 0.05 || Math.abs(finalEnd - tag.endTime) >= 0.05) {
          onMoveClip(tag.id, finalStart, finalEnd);
        }
      }
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

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

  // Ruler Hover Thumbnail State
  let rulerHoverVisible = $state(false);
  let rulerHoverTime = $state(0);
  let rulerHoverX = $state(0);
  let rulerHoverY = $state(0);
  let rulerHoverActiveTag = $derived.by(() => {
    if (!rulerHoverVisible) return null;
    const tag = tags.find(
      (t) => rulerHoverTime >= t.startTime && rulerHoverTime <= t.endTime,
    );
    if (!tag) return null;
    const cat = board?.buttons.find((b) => b.name === tag.category);
    return {
      label: `${tag.category}${tag.playerLabel ? ` - ${tag.playerLabel}` : ''}`,
      color: cat?.color || '#38bdf8',
    };
  });

  function handleRulerMouseMove(e: MouseEvent) {
    if (!videoSrc) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    if (rect.width <= 0) return;
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    rulerHoverTime = viewStart + ratio * windowDur;
    rulerHoverX = e.clientX;
    rulerHoverY = rect.top;
    rulerHoverVisible = true;
  }

  function handleRulerMouseLeave() {
    rulerHoverVisible = false;
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="linimasa-shell" onwheel={handleTrackWheel} oncontextmenu={(e) => e.preventDefault()}>
  <!-- TOP HEADER STRIP (24px) -->
  <div class="linimasa-header">
    <div class="lh-left">
      {#if onToggleCollapse}
        <button
          type="button"
          class="lh-collapse-btn"
          onclick={onToggleCollapse}
          title={isCollapsed ? 'Tampilkan Linimasa' : 'Lipat Linimasa'}
        >
          {#if isCollapsed}
            <ChevronUp size={12} />
          {:else}
            <ChevronDown size={12} />
          {/if}
          <span class="lh-title">Linimasa</span>
        </button>
      {:else}
        <span class="lh-title">Linimasa</span>
      {/if}
      <span class="lh-hint">
        Klik kanan klip: Edit Tag/Label/Pemain · 2x Klik: Edit Lengkap · Ctrl+Klik: Pilih Banyak
      </span>
    </div>

    <div class="lh-right">
      <div class="tl-team-group" title="Filter Tampilan Tim di Linimasa">
        <button
          type="button"
          class="tl-micro-btn"
          class:active={teamFilter === 'all'}
          onclick={() => (teamFilter = 'all')}
        >
          Semua
        </button>
        <button
          type="button"
          class="tl-micro-btn"
          class:active={teamFilter === 'home'}
          onclick={() => (teamFilter = 'home')}
        >
          HOME
        </button>
        <button
          type="button"
          class="tl-micro-btn"
          class:active={teamFilter === 'away'}
          onclick={() => (teamFilter = 'away')}
        >
          AWAY
        </button>
      </div>

      <button
        type="button"
        class="tl-micro-btn"
        class:active={onlyPopulatedLanes}
        onclick={() => (onlyPopulatedLanes = !onlyPopulatedLanes)}
        title="Sembunyikan baris kategori yang masih 0 klip"
      >
        <Filter size={10} />
        <span>Isi Saja</span>
      </button>

      <span class="lh-sep"></span>

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

      <span class="lh-cur-badge">
        {useMatchClock && periodKickoffs.length > 0 && formatMatchClock
          ? formatMatchClock(currentTime)
          : formatPreciseTime(currentTime)}
      </span>

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

  {#if !isCollapsed}
    <!-- FLOATING MULTI-SELECT BATCH BAR -->
    {#if effectiveSelectedIds.length > 1}
      <div class="batch-bar">
        <span class="batch-count">{effectiveSelectedIds.length} Klip Terpilih</span>
        <div class="batch-actions">
          <button
            type="button"
            class="batch-btn active"
            onclick={() => {
              const first = tags.find((t) => t.id === effectiveSelectedIds[0]);
              if (first) onEditClip(first);
            }}
            title="Buka Panel 3-Kolom (Tag | Label | Pemain) untuk seluruh klip terpilih"
          >
            <Layers size={11} />
            <span>Edit Tag / Label / Pemain</span>
          </button>
          <button
            type="button"
            class="batch-btn"
            class:active={batchPopover === 'category'}
            onclick={() => (batchPopover = batchPopover === 'category' ? null : 'category')}
          >
            <Layers size={11} />
            <span>Ganti Tag</span>
          </button>
          <button
            type="button"
            class="batch-btn"
            class:active={batchPopover === 'labels'}
            onclick={() => (batchPopover = batchPopover === 'labels' ? null : 'labels')}
          >
            <Tag size={11} />
            <span>+ Label</span>
          </button>
          <button
            type="button"
            class="batch-btn"
            class:active={batchPopover === 'players'}
            onclick={() => (batchPopover = batchPopover === 'players' ? null : 'players')}
          >
            <Users size={11} />
            <span>+ Pemain</span>
          </button>
          <button
            type="button"
            class="batch-btn"
            onclick={() => onBatchSetTeamSide?.(effectiveSelectedIds, 'home')}
          >
            HOME
          </button>
          <button
            type="button"
            class="batch-btn"
            onclick={() => onBatchSetTeamSide?.(effectiveSelectedIds, 'away')}
          >
            AWAY
          </button>
          {#if hasCopiedMeta}
            <button
              type="button"
              class="batch-btn"
              onclick={() => onBatchPasteMeta?.(effectiveSelectedIds)}
            >
              <Clipboard size={11} />
              <span>Tempel Meta</span>
            </button>
          {/if}
          <button
            type="button"
            class="batch-btn"
            onclick={() => onBatchAddToPlaylist?.(effectiveSelectedIds)}
          >
            <ListPlus size={11} />
            <span>Ke Playlist</span>
          </button>
          <button
            type="button"
            class="batch-btn danger"
            onclick={() => onBatchDeleteClips?.(effectiveSelectedIds)}
          >
            <Trash2 size={11} />
            <span>Hapus ({effectiveSelectedIds.length})</span>
          </button>
          <button
            type="button"
            class="batch-btn ghost"
            onclick={() => onSelectionChange?.([], null)}
            title="Batalkan pilihan banyak"
          >
            <X size={11} />
          </button>
        </div>

        {#if batchPopover === 'category'}
          <div class="batch-popover">
            {#each boardCatButtons as cb (cb.id)}
              <button
                type="button"
                class="bp-chip"
                onclick={() => {
                  onBatchChangeCategory?.(effectiveSelectedIds, cb.name, cb.color, cb.id);
                  batchPopover = null;
                }}
              >
                <span class="bp-dot" style="background-color: {cb.color};"></span>
                <span>{cb.name}</span>
              </button>
            {/each}
          </div>
        {:else if batchPopover === 'labels'}
          <div class="batch-popover">
            {#each boardDescButtons as db (db.id)}
              <button
                type="button"
                class="bp-chip"
                onclick={() =>
                  onBatchToggleLabel?.(effectiveSelectedIds, {
                    id: db.id,
                    name: db.name,
                    color: db.color,
                    group: db.group ?? null,
                  })
                }
              >
                <span class="bp-dot" style="background-color: {db.color};"></span>
                <span>{db.name}</span>
              </button>
            {/each}
            <div class="bp-add-inline">
              <input
                type="text"
                bind:value={batchCustomLabel}
                placeholder="+ Label baru..."
                onkeydown={(e) => {
                  if (e.key === 'Enter' && batchCustomLabel.trim()) {
                    onBatchAddCustomLabel?.(effectiveSelectedIds, batchCustomLabel.trim());
                    batchCustomLabel = '';
                  }
                }}
              />
              <button
                type="button"
                onclick={() => {
                  if (batchCustomLabel.trim()) {
                    onBatchAddCustomLabel?.(effectiveSelectedIds, batchCustomLabel.trim());
                    batchCustomLabel = '';
                  }
                }}
              >
                <Plus size={11} />
              </button>
            </div>
          </div>
        {:else if batchPopover === 'players'}
          <div class="batch-popover">
            {#each roster as pName (pName)}
              <button
                type="button"
                class="bp-chip"
                onclick={() => onBatchTogglePlayer?.(effectiveSelectedIds, pName)}
              >
                <Check size={10} class="text-sky-400" />
                <span>{pName}</span>
              </button>
            {/each}
            <div class="bp-add-inline">
              <input
                type="text"
                bind:value={batchCustomPlayer}
                placeholder="+ Pemain (#14...)..."
                onkeydown={(e) => {
                  if (e.key === 'Enter' && batchCustomPlayer.trim()) {
                    onBatchAddCustomPlayer?.(effectiveSelectedIds, batchCustomPlayer.trim());
                    batchCustomPlayer = '';
                  }
                }}
              />
              <button
                type="button"
                onclick={() => {
                  if (batchCustomPlayer.trim()) {
                    onBatchAddCustomPlayer?.(effectiveSelectedIds, batchCustomPlayer.trim());
                    batchCustomPlayer = '';
                  }
                }}
              >
                <Plus size={11} />
              </button>
            </div>
          </div>
        {/if}
      </div>
    {/if}

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
        onmousemove={handleRulerMouseMove}
        onmouseleave={handleRulerMouseLeave}
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

        {#each kickoffMarkers as ko (ko.period)}
          <div
            class="kickoff-badge"
            style="left: {ko.leftPct}%; background-color: {ko.color};"
            title="{ko.label} Kick-off ({formatTime(ko.videoTime)})"
          >
            {ko.shortLabel}
          </div>
        {/each}

        {#each visibleWhistleMarkers as w (w.id)}
          <button
            type="button"
            class="whistle-badge"
            style="left: {w.leftPct}%;"
            onclick={(e) => {
              e.stopPropagation();
              onSeek(w.peakTime);
            }}
            ondblclick={(e) => {
              e.stopPropagation();
              onQuickTagWhistle?.(w);
            }}
            title="{w.label} ({formatTime(w.peakTime)} · {Math.round(w.peakFreqHz)} Hz) — Klik: lompat | Klik 2x: buat Tag"
          >
            ♪
          </button>
        {/each}

        {#if playheadVisible}
          <div class="ruler-playhead-badge" style="left: {playheadPct}%;">
            {useMatchClock && periodKickoffs.length > 0 && formatMatchClock
              ? formatMatchClock(currentTime)
              : formatPreciseTime(currentTime)}
          </div>
        {/if}
      </div>

      <TimelineHoverThumbnail
        videoSrc={videoSrc ?? null}
        hoverTime={rulerHoverTime}
        visible={rulerHoverVisible}
        anchorX={rulerHoverX}
        anchorY={rulerHoverY}
        matchClockLabel={useMatchClock && formatMatchClock ? formatMatchClock(rulerHoverTime) : null}
        activeActionLabel={rulerHoverActiveTag?.label}
        activeActionColor={rulerHoverActiveTag?.color}
      />
    </div>

    <!-- CATEGORY TRACK LANES + VERTICAL PLAYHEAD OVERLAY -->
    <div class="lanes-scroll-wrap" bind:this={lanesWrapEl}>
      <div class="lanes-content">
        <div class="linimasa-playhead-layer" style="left: {HEADER_W}px;">
          {#each kickoffMarkers as ko (ko.period)}
            <div
              class="kickoff-needle"
              style="left: {ko.leftPct}%; border-left-color: {ko.color};"
            ></div>
          {/each}
          {#each visibleWhistleMarkers as w (w.id)}
            <div
              class="whistle-needle"
              style="left: {w.leftPct}%;"
            ></div>
          {/each}
          {#if playheadVisible}
            <div class="playhead-needle" style="left: {playheadPct}%;"></div>
          {/if}
          {#if inPointPct !== null && inPointPct >= 0 && inPointPct <= 100}
            <div class="in-point-needle" style="left: {inPointPct}%;"></div>
          {/if}
        </div>

        {#each allCategoryLanes as lane (lane.id + lane.category)}
          {@const isDropTarget =
            draggingTagId !== null &&
            dragHoverLane?.category === lane.category &&
            dragHoverLane.category !== dragOriginalCategory}
          <div
            class="linimasa-lane-row"
            class:drop-target={isDropTarget}
            data-lane-category={lane.category}
            data-lane-color={lane.color}
            data-lane-button-id={lane.buttonId || ''}
          >
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

              <!-- COMPLETED CLIPS WITH EDGE TRIM & MIDDLE DRAG HANDLES -->
              {#each lane.tags as tag (tag.id)}
                {@const isTrimming = trimmingTagId === tag.id}
                {@const isDragging = draggingTagId === tag.id}
                {@const effStart = isTrimming ? trimPreviewStart : isDragging ? dragPreviewStart : tag.startTime}
                {@const effEnd = isTrimming ? trimPreviewEnd : isDragging ? dragPreviewEnd : tag.endTime}
                {@const clampedS = Math.max(viewStart, effStart)}
                {@const clampedE = Math.min(viewEnd, effEnd)}
                {#if clampedE >= viewStart && clampedS <= viewEnd && effEnd >= viewStart && effStart <= viewEnd}
                  {@const lPct = ((clampedS - viewStart) / windowDur) * 100}
                  {@const wPct = Math.max(0.65, ((Math.max(clampedS + 0.25, clampedE) - clampedS) / windowDur) * 100)}
                  {@const isSelected =
                    activeLoopClipId === tag.id ||
                    selectedClipId === tag.id ||
                    effectiveSelectedIds.includes(tag.id)}
                  {@const extraPlayers = Math.max(0, (tag.playersInvolved?.length ?? 1) - 1)}
                  {@const labelNames = tag.labels?.map((l) => l.name).join(', ') || ''}
                  {@const playerText = tag.playersInvolved?.length ? tag.playersInvolved.join(', ') : (tag.playerLabel || '-')}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <div
                    class="clip-block"
                    class:selected={isSelected}
                    class:multi-selected={effectiveSelectedIds.length > 1 && effectiveSelectedIds.includes(tag.id)}
                    class:trimming={isTrimming}
                    class:dragging-clip={isDragging}
                    style="left: {lPct}%; width: {wPct}%; background-color: {tag.color || lane.color};"
                    onpointerdown={(e) => startClipDrag(e, tag, e.currentTarget.parentElement!)}
                    onclick={(e) => handleClipClick(e, tag)}
                    oncontextmenu={(e) => openClipContextMenu(e, tag)}
                    ondblclick={(e) => {
                      e.stopPropagation();
                      onEditClip(tag);
                    }}
                    role="button"
                    tabindex="0"
                    title="{tag.title} ({formatPreciseTime(effStart)} - {formatPreciseTime(effEnd)})&#10;Pemain: {playerText}{labelNames ? ` | Label: ${labelNames}` : ''}&#10;Klik kanan: Menu Edit · 2x Klik: Edit Lengkap · Ctrl+Klik: Pilih Banyak"
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
                      {#if isTrimming}
                        {(effEnd - effStart).toFixed(1)}s
                      {:else if isDragging}
                        {formatPreciseTime(effStart)}{dragHoverLane && dragHoverLane.category !== dragOriginalCategory ? ` → ${dragHoverLane.category}` : ''}
                      {:else}
                        {#if tag.favorite}<span class="clip-fav-star">★</span>{/if}
                        {#if tag.teamSide === 'away'}<span class="clip-opp-tag">OPP</span>{/if}
                        <span class="clip-main-txt">{tag.playerLabel || tag.category}{extraPlayers > 0 ? ` +${extraPlayers}` : ''}</span>
                        {#if tag.labels && tag.labels.length > 0}
                          <span class="clip-lbl-dots">
                            {#each tag.labels.slice(0, 3) as lbl}
                              <span class="clip-lbl-dot" style="background-color: {lbl.color || '#ffffff'};" title={lbl.name}></span>
                            {/each}
                          </span>
                        {/if}
                        {#if tag.drawings && tag.drawings.length > 0}
                          <span class="clip-draw-mark" title="Memiliki Telestrasi">✎</span>
                        {/if}
                      {/if}
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
  {/if}

  <TimelineClipContextMenu
    open={ctxMenu.open}
    x={ctxMenu.x}
    y={ctxMenu.y}
    tag={ctxMenuTag}
    selectedCount={targetIdsForCtx.length}
    {currentTime}
    {hasCopiedMeta}
    onClose={() => (ctxMenu = { ...ctxMenu, open: false })}
    onEditFull={(t) => onEditClip(t)}
    onOpenTelestration={(t) => onOpenTelestration?.(t)}
    onSetTeamSide={(side) => onBatchSetTeamSide?.(targetIdsForCtx, side)}
    onToggleFavorite={() => onBatchToggleFavorite?.(targetIdsForCtx)}
    onSplitAtPlayhead={(t) => onSplitClip?.(t)}
    onDuplicate={(t) => onDuplicateClip?.(t)}
    onCopyMeta={(t) => onCopyClipMeta?.(t)}
    onPasteMeta={() => onBatchPasteMeta?.(targetIdsForCtx)}
    onAddToPlaylist={() => onBatchAddToPlaylist?.(targetIdsForCtx)}
    onQuickExport={(t) => onQuickExportClip?.(t)}
    onDelete={() => onBatchDeleteClips?.(targetIdsForCtx)}
  />
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

  .lh-collapse-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: #f0f6fc;
    cursor: pointer;
    padding: 0 2px;
    flex-shrink: 0;
  }

  .tl-team-group {
    display: flex;
    align-items: center;
    gap: 2px;
  }

  .tl-micro-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #060b14;
    border: 1px solid #1a355d;
    color: #94a3b8;
    font-size: 8.5px;
    font-weight: 700;
    padding: 1px 5px;
    border-radius: 3px;
    cursor: pointer;
  }

  .tl-micro-btn:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .tl-micro-btn.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .batch-bar {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 3px 10px;
    background: rgba(14, 165, 233, 0.14);
    border-bottom: 1px solid rgba(56, 189, 248, 0.45);
    flex-shrink: 0;
    z-index: 30;
  }

  .batch-count {
    font-size: 10px;
    font-weight: 800;
    color: #7dd3fc;
    white-space: nowrap;
  }

  .batch-actions {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: wrap;
  }

  .batch-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0b182e;
    border: 1px solid #1e3b68;
    color: #e2e8f0;
    font-size: 9.5px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 4px;
    cursor: pointer;
  }

  .batch-btn:hover,
  .batch-btn.active {
    border-color: #38bdf8;
    background: #142b50;
    color: #ffffff;
  }

  .batch-btn.danger {
    color: #fca5a5;
    border-color: rgba(239, 68, 68, 0.45);
  }

  .batch-btn.danger:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: #ef4444;
    color: #ffffff;
  }

  .batch-btn.ghost {
    padding: 2px 5px;
  }

  .batch-popover {
    position: absolute;
    top: 100%;
    left: 10px;
    right: 10px;
    background: #081224;
    border: 1px solid #1e3b68;
    border-radius: 7px;
    box-shadow: 0 12px 28px rgba(2, 6, 23, 0.85);
    padding: 7px;
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
    max-height: 140px;
    overflow-y: auto;
    z-index: 40;
  }

  .bp-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0d1e38;
    border: 1px solid #1e3b68;
    color: #e2e8f0;
    font-size: 10px;
    font-weight: 600;
    padding: 3px 8px;
    border-radius: 999px;
    cursor: pointer;
  }

  .bp-chip:hover {
    border-color: #38bdf8;
    background: #142b50;
  }

  .bp-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .bp-add-inline {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #050b16;
    border: 1px solid #1e3b68;
    border-radius: 999px;
    padding: 2px 6px;
  }

  .bp-add-inline input {
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 10px;
    width: 120px;
    outline: none;
  }

  .bp-add-inline button {
    background: #0284c7;
    border: none;
    color: #ffffff;
    border-radius: 999px;
    padding: 2px 5px;
    display: inline-flex;
    cursor: pointer;
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

  .kickoff-badge {
    position: absolute;
    top: 2px;
    transform: translateX(-50%);
    color: #04101d;
    font-family: 'Fira Code', monospace;
    font-size: 7.5px;
    font-weight: 900;
    padding: 1px 4px;
    border-radius: 3px;
    pointer-events: none;
    z-index: 9;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
  }

  .kickoff-needle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 1.5px dashed #10b981;
    opacity: 0.78;
  }

  .whistle-badge {
    position: absolute;
    top: 3px;
    transform: translateX(-50%);
    background: #f59e0b;
    color: #04101d;
    border: 1px solid #fef3c7;
    font-size: 8px;
    font-weight: 900;
    line-height: 1;
    padding: 1px 4px;
    border-radius: 3px;
    cursor: pointer;
    z-index: 10;
    box-shadow: 0 1px 3px rgba(0, 0, 0, 0.55);
  }

  .whistle-badge:hover {
    background: #fbbf24;
    transform: translateX(-50%) scale(1.1);
  }

  .whistle-needle {
    position: absolute;
    top: 0;
    bottom: 0;
    width: 0;
    border-left: 1px dashed rgba(245, 158, 11, 0.6);
  }

  .linimasa-lane-row {
    display: flex;
    align-items: stretch;
    height: 22px;
    min-height: 22px;
    border-bottom: 1px solid #0e1e38;
    transition: background-color 0.1s ease, box-shadow 0.1s ease;
  }

  .linimasa-lane-row.drop-target {
    background: rgba(16, 185, 129, 0.16);
    box-shadow: inset 0 0 0 1.5px #10b981;
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
    cursor: grab;
    z-index: 6;
  }

  .clip-block:hover {
    z-index: 12;
    filter: brightness(1.15);
  }

  .clip-block.selected,
  .clip-block.trimming,
  .clip-block.dragging-clip {
    outline: 1.5px solid #ffffff;
    z-index: 15;
  }

  .clip-block.multi-selected {
    outline: 1.5px solid #f59e0b;
    box-shadow: 0 0 8px rgba(245, 158, 11, 0.5);
  }

  .clip-block.dragging-clip {
    cursor: grabbing;
    opacity: 0.92;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.7);
  }

  .clip-block-live {
    outline: 1.5px dashed #ef4444;
    z-index: 14;
    animation: pulseLiveClip 1s infinite;
  }

  .clip-block-label {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    min-width: 0;
    font-size: 8px;
    font-weight: 800;
    color: #ffffff;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    text-shadow: 0 1px 2px rgba(0, 0, 0, 0.85);
    pointer-events: none;
  }

  .clip-main-txt {
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clip-fav-star {
    color: #fde047;
    font-size: 9px;
    line-height: 1;
    flex-shrink: 0;
  }

  .clip-opp-tag {
    font-size: 7px;
    font-weight: 900;
    background: rgba(0, 0, 0, 0.55);
    color: #fcd34d;
    padding: 0 3px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .clip-lbl-dots {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    flex-shrink: 0;
  }

  .clip-lbl-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    border: 0.5px solid rgba(0, 0, 0, 0.6);
  }

  .clip-draw-mark {
    font-size: 8px;
    color: #e0f2fe;
    flex-shrink: 0;
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

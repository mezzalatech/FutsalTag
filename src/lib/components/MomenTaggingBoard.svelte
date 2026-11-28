<script lang="ts">
  import { invoke } from '@tauri-apps/api/core';
  import { isTauriDesktop, projectStore } from '$lib/stores/projectStore.svelte';
  import { getContrastTextColor } from '$lib/tagging/momenBoards';
  import type {
    ActiveContinuousTag,
    RosterPlayer,
    TaggingBoard,
    TaggingButton,
    TaggingButtonKind,
    TaggingButtonShape,
  } from '$lib/types';
  import {
    Check,
    Download,
    Edit3,
    Grid,
    Layout,
    List,
    Maximize2,
    Plus,
    RotateCcw,
    Search,
    Square,
    Trash2,
    Upload,
    UserPlus,
    X,
  } from 'lucide-svelte';

  interface Props {
    board: TaggingBoard;
    boards: TaggingBoard[];
    activeContinuousTags: Record<string, ActiveContinuousTag>;
    stickyAutoDescriptors: string[];
    currentTime: number;
    roster: RosterPlayer[];
    activeSelectedPlayer: string;
    activeTeamSide: 'home' | 'away';
    targetTagName: string | null;
    targetTagButtonId: string | null;
    targetAttachedDescriptorIds: string[];
    targetAttachedPlayers: string[];
    dockMode?: 'bottom' | 'left' | 'right' | 'fullscreen';
    compact?: boolean;
    hideToolbar?: boolean;
    hidePlayersBar?: boolean;
    externalViewMode?: 'canvas' | 'grid' | 'list';
    canvasScale?: 'fit' | number;
    externalEditMode?: boolean;
    openNewButtonNonce?: number;
    editButtonTarget?: TaggingButton | null;
    onClearEditTarget?: () => void;
    onSelectBoard: (boardId: string) => void;
    onImportBoardJson: (jsonStr: string) => void;
    onExportBoardJson: () => void;
    onCategoryPress: (btn: TaggingButton) => void;
    onDescriptorPress: (btn: TaggingButton) => void;
    onPlayerPress: (playerLabel: string) => void;
    onTeamSideChange: (side: 'home' | 'away') => void;
    onAddPlayer: (rawName: string) => void;
    onStopAllContinuous: () => void;
    onUndoLastTag: () => void;
    onUpsertButton: (btn: TaggingButton) => void;
    onDeleteButton: (buttonId: string) => void;
    onOpenFullscreenCanvas?: () => void;
  }

  let {
    board,
    boards,
    activeContinuousTags,
    stickyAutoDescriptors,
    currentTime,
    roster,
    activeSelectedPlayer,
    activeTeamSide,
    targetTagName,
    targetTagButtonId,
    targetAttachedDescriptorIds,
    targetAttachedPlayers,
    dockMode = 'bottom',
    compact = false,
    hideToolbar = false,
    hidePlayersBar = false,
    externalViewMode,
    canvasScale = 1,
    externalEditMode,
    openNewButtonNonce = 0,
    editButtonTarget = null,
    onClearEditTarget,
    onSelectBoard,
    onImportBoardJson,
    onExportBoardJson,
    onCategoryPress,
    onDescriptorPress,
    onPlayerPress,
    onTeamSideChange,
    onAddPlayer,
    onStopAllContinuous,
    onUndoLastTag,
    onUpsertButton,
    onDeleteButton,
    onOpenFullscreenCanvas,
  }: Props = $props();

  let userViewMode = $state<'list' | 'canvas' | 'grid' | null>(null);
  let prevDockMode = $state<string>('');
  $effect(() => {
    if (dockMode !== prevDockMode) {
      prevDockMode = dockMode;
      userViewMode = null;
    }
  });
  const viewMode = $derived(
    externalViewMode ?? userViewMode ?? (dockMode === 'left' || dockMode === 'right' ? 'list' : 'canvas')
  );
  const isSideDock = $derived(dockMode === 'left' || dockMode === 'right');
  const isFullscreen = $derived(dockMode === 'fullscreen');

  let isEditMode = $state(false);
  const effectiveEditMode = $derived(externalEditMode ?? isEditMode);
  let lastOpenNonce = $state(0);

  $effect(() => {
    if (openNewButtonNonce > 0 && openNewButtonNonce !== lastOpenNonce) {
      lastOpenNonce = openNewButtonNonce;
      openNewButtonModal();
    }
  });

  $effect(() => {
    if (editButtonTarget) {
      openEditButtonModal(editButtonTarget);
    }
  });
  let quickSearchQuery = $state('');
  let poolSearchQuery = $state('');
  let newPlayerName = $state('');
  let boardFileInputEl: HTMLInputElement | undefined = $state();

  // Button Editor Modal State
  let editingBtn = $state<TaggingButton | null>(null);
  let draftName = $state('');
  let draftKind = $state<TaggingButtonKind>('category');
  let draftContinuous = $state(true);
  let draftLeadSec = $state(2);
  let draftLagSec = $state(3);
  let draftHotkey = $state('');
  let draftColor = $state('#0284c7');
  let draftShape = $state<TaggingButtonShape>('rounded');
  let draftExclusionGroup = $state('');
  let draftLinksText = $state('');
  let draftForTagsText = $state('');
  let draftGroup = $state('');
  let draftAutoAdd = $state(false);
  let draftX = $state(24);
  let draftY = $state(24);
  let draftW = $state(140);
  let draftH = $state(72);

  const activeRecordingCount = $derived(Object.keys(activeContinuousTags).length);

  const canvasButtons = $derived(board.buttons.filter((b) => b.w > 0 && b.h > 0));
  const categoryButtons = $derived(board.buttons.filter((b) => b.kind === 'category'));
  const continuousButtons = $derived(categoryButtons.filter((b) => b.continuous));
  const instantButtons = $derived(categoryButtons.filter((b) => !b.continuous));
  const descriptorButtons = $derived(board.buttons.filter((b) => b.kind === 'descriptor'));
  const poolDescriptors = $derived(
    board.buttons.filter((b) => b.kind === 'descriptor' && (b.w <= 0 || b.h <= 0))
  );

  const filteredPoolDescriptors = $derived(
    poolDescriptors.filter(
      (b) => !poolSearchQuery.trim() || b.name.toLowerCase().includes(poolSearchQuery.toLowerCase())
    )
  );
  const filteredListDescriptors = $derived(
    descriptorButtons.filter(
      (b) => !poolSearchQuery.trim() || b.name.toLowerCase().includes(poolSearchQuery.toLowerCase())
    )
  );

  const canvasW = $derived(
    Math.max(960, ...canvasButtons.map((b) => b.x + b.w + 20))
  );
  const canvasH = $derived(
    Math.max(540, ...canvasButtons.map((b) => b.y + b.h + 20))
  );

  let surfaceW = $state(0);
  let surfaceH = $state(0);

  const canvasMetrics = $derived.by(() => {
    const availW = Math.max(200, (surfaceW || 880) - 20);
    const availH = Math.max(84, (surfaceH || 140) - 16);
    if (canvasScale === 'fit') {
      const ratio = Math.min(availW / canvasW, availH / canvasH);
      const w = Math.max(160, Math.floor(canvasW * ratio));
      const h = Math.max(76, Math.floor(canvasH * ratio));
      return {
        w,
        h,
        btnScale: Math.max(0.42, Math.min(1.15, ratio)),
        isFit: true,
      };
    }
    const scaleNum = typeof canvasScale === 'number' && Number.isFinite(canvasScale) ? canvasScale : 1;
    const baseW = Math.min(1120, availW);
    const w = Math.max(220, Math.round(baseW * scaleNum));
    const h = Math.max(110, Math.round(w * (canvasH / canvasW)));
    return {
      w,
      h,
      btnScale: Math.max(0.55, Math.min(1.2, w / 960)),
      isFit: false,
    };
  });

  interface QuickMatchItem {
    id: string;
    label: string;
    sub: string;
    color: string;
    kind: 'category' | 'descriptor' | 'player';
    btn?: TaggingButton;
    playerLabel?: string;
  }

  const quickMatches = $derived.by<QuickMatchItem[]>(() => {
    const q = quickSearchQuery.trim().toLowerCase();
    if (!q) return [];
    const results: QuickMatchItem[] = [];

    for (const b of board.buttons) {
      if (
        b.name.toLowerCase().includes(q) ||
        (b.hotkey && b.hotkey.toLowerCase() === q)
      ) {
        results.push({
          id: `btn-${b.id}`,
          label: b.name,
          sub:
            b.kind === 'category'
              ? b.continuous
                ? 'Tag Kontinu'
                : `Single -${b.leadSec}s/+${b.lagSec}s`
              : 'Label / Descriptor',
          color: b.color,
          kind: b.kind,
          btn: b,
        });
      }
    }

    for (const p of roster) {
      const plLabel = projectStore.getPlayerDisplayLabel(p);
      if (plLabel.toLowerCase().includes(q) || p.role.toLowerCase().includes(q)) {
        results.push({
          id: `pl-${p.id}`,
          label: plLabel,
          sub: `Pemain (${p.role})`,
          color: p.color,
          kind: 'player',
          playerLabel: plLabel,
        });
      }
    }

    return results.slice(0, 6);
  });

  function isDescriptorDimmed(btn: TaggingButton): boolean {
    if (btn.kind !== 'descriptor' || btn.forTags.length === 0) return false;
    if (!targetTagButtonId) return false;
    return !btn.forTags.includes(targetTagButtonId);
  }

  function isDescriptorAttached(btn: TaggingButton): boolean {
    return (
      targetAttachedDescriptorIds.includes(btn.id) ||
      stickyAutoDescriptors.includes(btn.id)
    );
  }

  function handleBoardButtonClick(btn: TaggingButton) {
    if (effectiveEditMode) {
      openEditButtonModal(btn);
      return;
    }
    if (btn.kind === 'category') {
      onCategoryPress(btn);
    } else {
      onDescriptorPress(btn);
    }
  }

  function triggerQuickMatch(item: QuickMatchItem) {
    if (item.kind === 'category' && item.btn) {
      onCategoryPress(item.btn);
    } else if (item.kind === 'descriptor' && item.btn) {
      onDescriptorPress(item.btn);
    } else if (item.kind === 'player' && item.playerLabel) {
      onPlayerPress(item.playerLabel);
    }
    quickSearchQuery = '';
  }

  async function handleImportClick() {
    if (isTauriDesktop()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          title: 'Impor Papan Tagging Momen (.momen.json / .json)',
          multiple: false,
          filters: [{ name: 'Momen Board JSON', extensions: ['json', 'momen'] }],
        });
        if (!selected || typeof selected !== 'string') return;
        const content = await invoke<string>('load_project_file', { filePath: selected });
        onImportBoardJson(content);
      } catch (err: any) {
        alert(`Gagal mengimpor papan Momen: ${err?.message || err}`);
      }
    } else {
      boardFileInputEl?.click();
    }
  }

  function handleBrowserBoardFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        try {
          onImportBoardJson(text);
        } catch (err: any) {
          alert(`Format papan tidak valid: ${err?.message || err}`);
        }
      }
    };
    reader.readAsText(input.files[0]);
    input.value = '';
  }

  function openNewButtonModal() {
    const newBtn: TaggingButton = {
      id: `TAG_${Date.now().toString(36).toUpperCase()}`,
      name: 'AKSI BARU',
      kind: 'category',
      hotkey: null,
      color: '#0284c7',
      x: 24,
      y: 24,
      w: 140,
      h: 72,
      leadSec: 2,
      lagSec: 3,
      continuous: true,
      shape: 'rounded',
      forTags: [],
      links: [],
      exclusionGroup: null,
      group: null,
      autoAdd: false,
    };
    openEditButtonModal(newBtn);
  }

  function openEditButtonModal(btn: TaggingButton) {
    editingBtn = btn;
    draftName = btn.name;
    draftKind = btn.kind;
    draftContinuous = btn.continuous;
    draftLeadSec = btn.leadSec;
    draftLagSec = btn.lagSec;
    draftHotkey = btn.hotkey || '';
    draftColor = btn.color;
    draftShape = btn.shape;
    draftExclusionGroup = btn.exclusionGroup || '';
    draftLinksText = btn.links.join(', ');
    draftForTagsText = btn.forTags.join(', ');
    draftGroup = btn.group || '';
    draftAutoAdd = Boolean(btn.autoAdd);
    draftX = btn.x;
    draftY = btn.y;
    draftW = btn.w;
    draftH = btn.h;
  }

  function closeButtonModal() {
    editingBtn = null;
    onClearEditTarget?.();
  }

  function saveButtonModal() {
    if (!editingBtn || !draftName.trim()) return;
    const splitList = (raw: string) =>
      raw
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

    onUpsertButton({
      id: editingBtn.id,
      name: draftName.trim(),
      kind: draftKind,
      hotkey: draftHotkey.trim() ? draftHotkey.trim().toUpperCase().slice(0, 1) : null,
      color: draftColor,
      x: Number(draftX) || 0,
      y: Number(draftY) || 0,
      w: Number(draftW) || 0,
      h: Number(draftH) || 0,
      leadSec: Math.max(0, Number(draftLeadSec) || 0),
      lagSec: Math.max(0, Number(draftLagSec) || 0),
      continuous: draftKind === 'category' ? draftContinuous : false,
      shape: draftShape,
      forTags: splitList(draftForTagsText),
      links: splitList(draftLinksText),
      exclusionGroup: draftExclusionGroup.trim() || null,
      group: draftGroup.trim() || null,
      autoAdd: draftKind === 'descriptor' ? draftAutoAdd : false,
    });
    closeButtonModal();
  }

  function submitAddPlayer() {
    const trimmed = newPlayerName.trim();
    if (!trimmed) return;
    onAddPlayer(trimmed);
    newPlayerName = '';
  }

  function formatElapsed(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0 ? `${m}:${rem.toString().padStart(2, '0')}` : `${sec.toFixed(1)}s`;
  }
</script>

<div class="momen-board-shell" class:compact class:side-dock={isSideDock} class:fullscreen={isFullscreen}>
  <!-- SLIM SINGLE-ROW TOOLBAR -->
  {#if !hideToolbar}
  <div class="board-toolbar">
    <div class="toolbar-left">
      <select
        class="board-select"
        value={board.id}
        onchange={(e) => onSelectBoard((e.currentTarget as HTMLSelectElement).value)}
        title="Pilih Papan Tombol Tagging"
      >
        {#each boards as b}
          <option value={b.id}>{b.name} ({b.buttons.length})</option>
        {/each}
      </select>

      <div class="view-toggle-group">
        <button
          type="button"
          class="tool-pill"
          class:active={viewMode === 'list'}
          onclick={() => (userViewMode = 'list')}
          title="List Vertikal Ringkas per Grup"
        >
          <List size={12} />
          {#if isFullscreen || !isSideDock}<span>List</span>{/if}
        </button>
        <button
          type="button"
          class="tool-pill"
          class:active={viewMode === 'canvas'}
          onclick={() => (userViewMode = 'canvas')}
          title="Kanvas Spasial Lapangan (Momen Style)"
        >
          <Layout size={12} />
          {#if isFullscreen || !isSideDock}<span>Kanvas</span>{/if}
        </button>
        <button
          type="button"
          class="tool-pill"
          class:active={viewMode === 'grid'}
          onclick={() => (userViewMode = 'grid')}
          title="Grid Kategori & Label"
        >
          <Grid size={12} />
          {#if isFullscreen || !isSideDock}<span>Grid</span>{/if}
        </button>
      </div>

      <button
        type="button"
        class="tool-btn"
        onclick={handleImportClick}
        title="Impor Papan Tagging Momen (.momen.json / .json)"
      >
        <Upload size={12} />
        {#if isFullscreen}<span>Impor .momen</span>{/if}
      </button>
      <input
        bind:this={boardFileInputEl}
        type="file"
        accept=".json,.momen"
        onchange={handleBrowserBoardFileChange}
        style="display: none;"
      />

      <button
        type="button"
        class="tool-btn"
        onclick={onExportBoardJson}
        title="Ekspor Papan Aktif ke Format Momen (.momen.json)"
      >
        <Download size={12} />
        {#if isFullscreen}<span>Ekspor</span>{/if}
      </button>

      <button
        type="button"
        class="tool-btn"
        class:edit-active={isEditMode}
        onclick={() => (isEditMode = !isEditMode)}
        title="Mode Edit Tombol (ubah Continuous/Single, Hotkey, Warna, ExclusionGroup)"
      >
        <Edit3 size={12} />
        {#if isFullscreen}<span>{isEditMode ? 'Selesai' : 'Edit'}</span>{/if}
      </button>

      <button
        type="button"
        class="tool-btn"
        onclick={openNewButtonModal}
        title="Tambah tombol kategori/label baru"
      >
        <Plus size={12} />
        {#if isFullscreen}<span>Tombol</span>{/if}
      </button>
    </div>

    <div class="toolbar-right">
      <!-- QUICK TAGGING SEARCH (ONCE SPORT STYLE, HOTKEY '/') -->
      <div class="quick-search-wrap">
        <Search size={11} class="text-sky-400" />
        <input
          id="quick-tag-search-input"
          type="text"
          bind:value={quickSearchQuery}
          placeholder="Cari (/)..."
          class="quick-search-input"
          onkeydown={(e) => {
            if (e.key === 'Enter' && quickMatches.length > 0) {
              e.preventDefault();
              triggerQuickMatch(quickMatches[0]);
              (e.currentTarget as HTMLInputElement).blur();
            } else if (e.key === 'Escape') {
              quickSearchQuery = '';
              (e.currentTarget as HTMLInputElement).blur();
            }
          }}
        />
        {#if quickMatches.length > 0}
          <div class="quick-search-dropdown">
            {#each quickMatches as match}
              <button
                type="button"
                class="quick-match-row"
                onclick={() => triggerQuickMatch(match)}
              >
                <span class="qm-dot" style="background-color: {match.color};"></span>
                <span class="qm-label">{match.label}</span>
                <span class="qm-sub">{match.sub}</span>
              </button>
            {/each}
          </div>
        {/if}
      </div>

      <button
        type="button"
        class="btn-stop-all"
        class:recording-live={activeRecordingCount > 0}
        onclick={onStopAllContinuous}
        disabled={activeRecordingCount === 0}
        title="Hentikan semua tag kontinu aktif (Esc)"
      >
        <Square size={10} />
        <span>Matikan ({activeRecordingCount})</span>
      </button>

      <button
        type="button"
        class="tool-btn"
        onclick={onUndoLastTag}
        title="Batalkan / hapus tag terakhir (Ctrl+Z)"
      >
        <RotateCcw size={11} />
        {#if isFullscreen}<span>Undo</span>{/if}
      </button>

      {#if !isFullscreen && onOpenFullscreenCanvas}
        <button
          type="button"
          class="tool-btn btn-expand-canvas"
          onclick={onOpenFullscreenCanvas}
          title="Buka Papan Kanvas Spasial Layar Penuh (Action Pad)"
        >
          <Maximize2 size={11} />
        </button>
      {/if}
    </div>
  </div>
  {/if}

  {#if effectiveEditMode}
    <div class="edit-mode-banner">
      <span>Mode Edit Papan Aktif: klik tombol mana saja di papan untuk mengubah nama, mode Kontinu/Single-Click, hotkey, warna, exclusionGroup, atau links.</span>
    </div>
  {/if}

  <!-- BOARD SURFACE -->
  <div
    class="board-surface-scroll"
    class:fit-mode={viewMode === 'canvas' && canvasMetrics.isFit}
    bind:clientWidth={surfaceW}
    bind:clientHeight={surfaceH}
  >
    {#if viewMode === 'canvas'}
      <div class="canvas-stage-wrap">
        <div
          class="momen-canvas"
          style="width: {canvasMetrics.w}px; height: {canvasMetrics.h}px; background-color: {board.color}; --btn-scale: {canvasMetrics.btnScale};"
        >
          {#if board.background === 'pitch'}
            <svg
              class="pitch-bg-svg"
              viewBox="0 0 {canvasW} {canvasH}"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <rect
                x="14"
                y="14"
                width={canvasW - 28}
                height={canvasH - 28}
                rx="10"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                stroke-width="2"
              />
              <line
                x1={canvasW / 2}
                y1="14"
                x2={canvasW / 2}
                y2={canvasH - 14}
                stroke="rgba(255,255,255,0.18)"
                stroke-width="2"
              />
              <circle
                cx={canvasW / 2}
                cy={canvasH / 2}
                r={Math.min(canvasW, canvasH) * 0.14}
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                stroke-width="2"
              />
              <path
                d="M 14 {canvasH * 0.25} A {canvasH * 0.24} {canvasH * 0.24} 0 0 1 14 {canvasH * 0.75}"
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                stroke-width="2"
              />
              <path
                d="M {canvasW - 14} {canvasH * 0.25} A {canvasH * 0.24} {canvasH * 0.24} 0 0 0 {canvasW - 14} {canvasH * 0.75}"
                fill="none"
                stroke="rgba(255,255,255,0.18)"
                stroke-width="2"
              />
            </svg>
          {/if}

          {#each canvasButtons as btn (btn.id)}
            {@const rec = activeContinuousTags[btn.id]}
            {@const isOn = Boolean(rec)}
            {@const isDimmed = isDescriptorDimmed(btn)}
            {@const isAttached = isDescriptorAttached(btn)}
            {@const textCol = getContrastTextColor(btn.color)}
            <button
              type="button"
              class="canvas-btn shape-{btn.shape}"
              class:is-category={btn.kind === 'category'}
              class:is-descriptor={btn.kind === 'descriptor'}
              class:on={isOn}
              class:dim={isDimmed}
              class:attached={isAttached}
              style="
                left: {(btn.x / canvasW) * 100}%;
                top: {(btn.y / canvasH) * 100}%;
                width: {(btn.w / canvasW) * 100}%;
                height: {(btn.h / canvasH) * 100}%;
                background-color: {btn.color};
                color: {textCol};
              "
              onclick={() => handleBoardButtonClick(btn)}
              title="{btn.name}{btn.hotkey ? ` [${btn.hotkey}]` : ''} — {btn.kind === 'category' ? (btn.continuous ? 'Mode Kontinu (Start/Stop)' : `Single Click (-${btn.leadSec}s / +${btn.lagSec}s)`) : 'Label / Descriptor'}{btn.exclusionGroup ? ` | Grup: ${btn.exclusionGroup}` : ''}"
            >
              {#if btn.kind === 'category' && btn.continuous}
                <span class="btn-switch" class:on={isOn}><i></i></span>
              {/if}

              {#if isOn && rec}
                <span class="btn-on-pill">● ON {formatElapsed(Math.max(0, currentTime - rec.startTime))}</span>
              {:else if btn.hotkey}
                <span class="btn-hotkey-tag">{btn.hotkey}</span>
              {/if}

              <span class="canvas-btn-label">{btn.name}</span>

              {#if btn.kind === 'category' && !btn.continuous}
                <span class="btn-roll-micro">-{btn.leadSec}s/+{btn.lagSec}s</span>
              {:else if btn.kind === 'descriptor' && isAttached}
                <span class="desc-check-badge">✓</span>
              {:else if btn.autoAdd}
                <span class="desc-auto-badge">AUTO</span>
              {/if}
            </button>
          {/each}
        </div>
      </div>

      <!-- OFF-CANVAS DESCRIPTOR POOL (w=0 labels like Amril matrix FL1..FL20) -->
      {#if poolDescriptors.length > 0}
        <div class="pool-descriptors-strip">
          <div class="pool-header">
            <span class="pool-title">LABEL CEPAT ({filteredPoolDescriptors.length}/{poolDescriptors.length})</span>
            <input
              type="text"
              bind:value={poolSearchQuery}
              placeholder="Filter label..."
              class="pool-search-input"
            />
          </div>
          <div class="pool-chips-wrap">
            {#each filteredPoolDescriptors as btn (btn.id)}
              {@const isDimmed = isDescriptorDimmed(btn)}
              {@const isAttached = isDescriptorAttached(btn)}
              <button
                type="button"
                class="pool-chip"
                class:dim={isDimmed}
                class:attached={isAttached}
                style="--desc-col: {btn.color};"
                onclick={() => handleBoardButtonClick(btn)}
                title="Klik untuk menempelkan label '{btn.name}' ke tag aktif/terakhir"
              >
                <span class="pool-dot" style="background-color: {btn.color};"></span>
                <span>{btn.name}</span>
                {#if isAttached}
                  <Check size={10} />
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    {:else if viewMode === 'list'}
      <!-- GROUPED VERTICAL LIST MODE (SIDE-DOCK & COMPACT WORKFLOW) -->
      <div class="list-board-layout">
        {#if continuousButtons.length > 0}
          <div class="list-group">
            <div class="list-group-header">
              <span>TAG KONTINU ON/OFF ({continuousButtons.length})</span>
            </div>
            <div class="list-rows-stack">
              {#each continuousButtons as btn (btn.id)}
                {@const rec = activeContinuousTags[btn.id]}
                {@const isOn = Boolean(rec)}
                <button
                  type="button"
                  class="list-tag-row"
                  class:on={isOn}
                  style="--row-col: {btn.color};"
                  onclick={() => handleBoardButtonClick(btn)}
                  title="{btn.name}{btn.hotkey ? ` [${btn.hotkey}]` : ''} — Kontinu (Start/Stop){btn.exclusionGroup ? ` | Grup: ${btn.exclusionGroup}` : ''}"
                >
                  <span class="list-color-bar"></span>
                  <span class="list-switch" class:on={isOn}><i></i></span>
                  <span class="list-row-name">{btn.name}</span>
                  {#if btn.exclusionGroup}
                    <span class="list-group-tag">{btn.exclusionGroup}</span>
                  {/if}
                  {#if isOn && rec}
                    <span class="list-on-pill">● ON {formatElapsed(Math.max(0, currentTime - rec.startTime))}</span>
                  {:else if btn.hotkey}
                    <span class="list-kbd">{btn.hotkey}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if instantButtons.length > 0}
          <div class="list-group">
            <div class="list-group-header">
              <span>TAG INSTAN 1-KLIK ({instantButtons.length})</span>
            </div>
            <div class="list-rows-stack">
              {#each instantButtons as btn (btn.id)}
                <button
                  type="button"
                  class="list-tag-row"
                  style="--row-col: {btn.color};"
                  onclick={() => handleBoardButtonClick(btn)}
                  title="{btn.name}{btn.hotkey ? ` [${btn.hotkey}]` : ''} — Single Click (-{btn.leadSec}s/+{btn.lagSec}s)"
                >
                  <span class="list-color-bar"></span>
                  <span class="list-single-pill">1-KLIK</span>
                  <span class="list-row-name">{btn.name}</span>
                  <span class="list-roll-hint">-{btn.leadSec}/+{btn.lagSec}s</span>
                  {#if btn.hotkey}
                    <span class="list-kbd">{btn.hotkey}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}

        {#if descriptorButtons.length > 0}
          <div class="list-group">
            <div class="list-group-header">
              <span>LABEL / DESCRIPTOR ({filteredListDescriptors.length}/{descriptorButtons.length})</span>
              <input
                type="text"
                bind:value={poolSearchQuery}
                placeholder="Filter label..."
                class="pool-search-input"
              />
            </div>
            <div class="list-labels-wrap">
              {#each filteredListDescriptors as btn (btn.id)}
                {@const isDimmed = isDescriptorDimmed(btn)}
                {@const isAttached = isDescriptorAttached(btn)}
                <button
                  type="button"
                  class="grid-desc-pill"
                  class:dim={isDimmed}
                  class:attached={isAttached}
                  style="--desc-col: {btn.color};"
                  onclick={() => handleBoardButtonClick(btn)}
                >
                  <span class="pool-dot" style="background-color: {btn.color};"></span>
                  <span>{btn.name}</span>
                  {#if btn.autoAdd}
                    <span class="auto-pill-tag">AUTO</span>
                  {/if}
                  {#if isAttached}
                    <Check size={10} />
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {:else}
      <!-- GRID VIEW -->
      <div class="grid-board-layout">
        <div class="grid-section">
          <div class="grid-section-title">TAG AKSI & FASE ({categoryButtons.length})</div>
          <div class="grid-cards-wrap">
            {#each categoryButtons as btn (btn.id)}
              {@const rec = activeContinuousTags[btn.id]}
              {@const isOn = Boolean(rec)}
              {@const textCol = getContrastTextColor(btn.color)}
              <button
                type="button"
                class="grid-tag-btn"
                class:on={isOn}
                style="background-color: {btn.color}; color: {textCol};"
                onclick={() => handleBoardButtonClick(btn)}
                title="{btn.name}{btn.hotkey ? ` [${btn.hotkey}]` : ''} — {btn.continuous ? 'Mode Kontinu (Start/Stop)' : `Single Click (-${btn.leadSec}s/+${btn.lagSec}s)`}"
              >
                <div class="grid-btn-top">
                  {#if btn.continuous}
                    <span class="grid-switch" class:on={isOn}><i></i></span>
                  {:else}
                    <span class="grid-single-badge">1-KLIK</span>
                  {/if}
                  {#if isOn && rec}
                    <span class="grid-on-timer">● {formatElapsed(Math.max(0, currentTime - rec.startTime))}</span>
                  {:else if btn.hotkey}
                    <span class="grid-kbd">{btn.hotkey}</span>
                  {/if}
                </div>
                <span class="grid-btn-name">{btn.name}</span>
              </button>
            {/each}
          </div>
        </div>

        {#if descriptorButtons.length > 0}
          <div class="grid-section">
            <div class="grid-section-title">LABEL / DESCRIPTOR ({descriptorButtons.length})</div>
            <div class="grid-labels-wrap">
              {#each descriptorButtons as btn (btn.id)}
                {@const isDimmed = isDescriptorDimmed(btn)}
                {@const isAttached = isDescriptorAttached(btn)}
                <button
                  type="button"
                  class="grid-desc-pill"
                  class:dim={isDimmed}
                  class:attached={isAttached}
                  style="--desc-col: {btn.color};"
                  onclick={() => handleBoardButtonClick(btn)}
                >
                  <span class="pool-dot" style="background-color: {btn.color};"></span>
                  <span>{btn.name}</span>
                  {#if btn.autoAdd}
                    <span class="auto-pill-tag">AUTO</span>
                  {/if}
                  {#if isAttached}
                    <Check size={11} />
                  {/if}
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>

  <!-- LIVE PLAYERS BAR (MOMEN & ONCE SPORT STYLE) -->
  {#if !hidePlayersBar}
  <div class="live-players-bar" class:side-dock={isSideDock}>
    <div class="players-top-row">
      <div class="target-indicator" class:live={activeRecordingCount > 0}>
        <span class="target-dot"></span>
        <span class="target-text" title={targetTagName || 'Belum ada tag'}>
          {#if activeRecordingCount > 0}
            Merekam: {targetTagName}
          {:else if targetTagName}
            Klip: {targetTagName}
          {:else}
            Pilih Pemain
          {/if}
        </span>
      </div>

      <button
        type="button"
        class="team-side-toggle"
        class:away={activeTeamSide === 'away'}
        onclick={() => onTeamSideChange(activeTeamSide === 'home' ? 'away' : 'home')}
        title="Ganti sisi tim default untuk tag berikutnya (HOME / AWAY)"
      >
        {activeTeamSide === 'home' ? 'HOME' : 'AWAY'}
      </button>

      {#if isSideDock}
        <div class="quick-add-player">
          <UserPlus size={11} class="text-slate-400" />
          <input
            type="text"
            bind:value={newPlayerName}
            placeholder="+ Pemain"
            class="add-player-input"
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitAddPlayer();
              }
            }}
          />
        </div>
      {/if}
    </div>

    <div class="players-strip">
      {#each roster as p (p.id)}
        {@const plLabel = projectStore.getPlayerDisplayLabel(p)}
        {@const isPrimary = activeSelectedPlayer === plLabel}
        {@const isAttached = targetAttachedPlayers.includes(plLabel)}
        <button
          type="button"
          class="live-player-pill"
          class:primary={isPrimary}
          class:attached={isAttached}
          onclick={() => onPlayerPress(plLabel)}
          title="Klik untuk menempel/lepas {plLabel} ke tag berjalan atau klip terakhir"
        >
          <span class="lp-num" style="background-color: {p.color};">{p.num}</span>
          <span class="lp-name">{p.name}</span>
          {#if isAttached}
            <Check size={10} />
          {/if}
        </button>
      {/each}
    </div>

    {#if !isSideDock}
        <div class="quick-add-player">
          <UserPlus size={12} class="text-slate-400" />
          <input
            type="text"
            bind:value={newPlayerName}
            placeholder="+ Pemain (#10)"
            class="add-player-input"
            onkeydown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                submitAddPlayer();
              }
            }}
          />
        </div>
      {/if}
    </div>
  {/if}
</div>

<!-- BUTTON EDITOR MODAL -->
{#if editingBtn}
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div class="btn-editor-backdrop" onclick={closeButtonModal} role="presentation">
    <div
      class="btn-editor-card"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      tabindex="-1"
    >
      <header class="btn-editor-header">
        <h3>Edit Tombol Tagging</h3>
        <button type="button" class="btn-close-sm" onclick={closeButtonModal}>
          <X size={16} />
        </button>
      </header>

      <div class="btn-editor-body">
        <div class="form-row-2">
          <label class="field-group">
            <span>Nama Tombol</span>
            <input type="text" bind:value={draftName} />
          </label>
          <label class="field-group">
            <span>Jenis (Kind)</span>
            <select bind:value={draftKind}>
              <option value="category">Tag / Kategori (Buat Klip)</option>
              <option value="descriptor">Label / Descriptor</option>
            </select>
          </label>
        </div>

        {#if draftKind === 'category'}
          <div class="form-row-2">
            <label class="field-group">
              <span>Mode Rekam (Record Mode)</span>
              <select
                value={draftContinuous ? 'continuous' : 'single'}
                onchange={(e) =>
                  (draftContinuous = (e.currentTarget as HTMLSelectElement).value === 'continuous')}
              >
                <option value="continuous">Continuous Mode (Start → Stop)</option>
                <option value="single">Single Click Mode (Auto Pre/Post)</option>
              </select>
            </label>
            <label class="field-group">
              <span>Hotkey Keyboard</span>
              <input type="text" maxlength="1" bind:value={draftHotkey} placeholder="Misal: A / 1" />
            </label>
          </div>

          <div class="form-row-2">
            <label class="field-group">
              <span>Pre-Roll / Lead (detik)</span>
              <input type="number" min="0" step="0.5" bind:value={draftLeadSec} />
            </label>
            <label class="field-group">
              <span>Post-Roll / Lag (detik)</span>
              <input type="number" min="0" step="0.5" bind:value={draftLagSec} />
            </label>
          </div>

          <div class="form-row-2">
            <label class="field-group">
              <span>Exclusion Group (Saling Mematikan)</span>
              <input type="text" bind:value={draftExclusionGroup} placeholder="Misal: phase" />
            </label>
            <label class="field-group">
              <span>Linked Tags (ID pisah koma)</span>
              <input type="text" bind:value={draftLinksText} placeholder="Misal: TAG5, DEF 1" />
            </label>
          </div>
        {:else}
          <div class="form-row-2">
            <label class="field-group">
              <span>Grup Label (Mutual Exclusive)</span>
              <input type="text" bind:value={draftGroup} placeholder="Misal: result / period" />
            </label>
            <label class="field-group">
              <span>Scope Tag IDs (ForTags)</span>
              <input type="text" bind:value={draftForTagsText} placeholder="Kosong = semua tag" />
            </label>
          </div>
          <label class="checkbox-field">
            <input type="checkbox" bind:checked={draftAutoAdd} />
            <span>Auto-Add (otomatis tempel ke setiap klip baru)</span>
          </label>
        {/if}

        <div class="form-row-2">
          <label class="field-group">
            <span>Warna Tombol</span>
            <div class="color-row">
              <input type="color" bind:value={draftColor} />
              <input type="text" bind:value={draftColor} />
            </div>
          </label>
          <label class="field-group">
            <span>Bentuk (Shape)</span>
            <select bind:value={draftShape}>
              <option value="rounded">Rounded</option>
              <option value="rect">Rectangle</option>
              <option value="circle">Circle (Bulat)</option>
            </select>
          </label>
        </div>

        <div class="form-row-4">
          <label class="field-group">
            <span>X</span>
            <input type="number" bind:value={draftX} />
          </label>
          <label class="field-group">
            <span>Y</span>
            <input type="number" bind:value={draftY} />
          </label>
          <label class="field-group">
            <span>W (0 = Pool)</span>
            <input type="number" bind:value={draftW} />
          </label>
          <label class="field-group">
            <span>H</span>
            <input type="number" bind:value={draftH} />
          </label>
        </div>
      </div>

      <footer class="btn-editor-footer">
        <button
          type="button"
          class="btn-del-btn"
          onclick={() => {
            if (editingBtn) {
              onDeleteButton(editingBtn.id);
              closeButtonModal();
            }
          }}
        >
          <Trash2 size={13} />
          <span>Hapus</span>
        </button>
        <div class="footer-right">
          <button type="button" class="btn-cancel-sm" onclick={closeButtonModal}>Batal</button>
          <button type="button" class="btn-save-sm" onclick={saveButtonModal}>Simpan Tombol</button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .momen-board-shell {
    display: flex;
    flex-direction: column;
    background: linear-gradient(180deg, #091324 0%, #060b14 100%);
    width: 100%;
    height: 100%;
    min-height: 0;
    overflow: hidden;
  }

  .momen-board-shell.compact {
    height: 100%;
    min-height: 0;
  }

  /* SLIM SINGLE-ROW TOOLBAR */
  .board-toolbar {
    display: flex;
    flex-wrap: nowrap;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    padding: 0 8px;
    height: 32px;
    min-height: 32px;
    background: #0b172a;
    border-bottom: 1px solid #1a355d;
    overflow-x: auto;
    flex-shrink: 0;
  }

  .toolbar-left,
  .toolbar-right {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-wrap: nowrap;
    flex-shrink: 0;
  }

  .board-select {
    background: #060b14;
    color: #e2e8f0;
    border: 1px solid #1e3b68;
    border-radius: 5px;
    padding: 3px 6px;
    font-size: 10px;
    font-weight: 600;
    max-width: 160px;
    outline: none;
  }

  .view-toggle-group {
    display: flex;
    background: #060b14;
    border: 1px solid #1e3b68;
    border-radius: 5px;
    padding: 2px;
    gap: 2px;
  }

  .tool-pill,
  .tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0d1e38;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    padding: 3px 7px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tool-pill {
    border-color: transparent;
    background: transparent;
    color: #94a3b8;
    padding: 2px 6px;
  }

  .tool-pill.active {
    background: #0284c7;
    color: #ffffff;
  }

  .tool-btn:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .tool-btn.edit-active {
    background: #d97706;
    border-color: #fbbf24;
    color: #ffffff;
  }

  .btn-expand-canvas {
    border-color: rgba(56, 189, 248, 0.45);
    color: #38bdf8;
  }

  .quick-search-wrap {
    position: relative;
    display: flex;
    align-items: center;
    gap: 4px;
    background: #060b14;
    border: 1px solid #1e3b68;
    border-radius: 5px;
    padding: 2px 7px;
  }

  .quick-search-input {
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 10px;
    width: 115px;
    outline: none;
  }

  .momen-board-shell.fullscreen .quick-search-input {
    width: 180px;
  }

  .quick-search-dropdown {
    position: fixed;
    margin-top: 4px;
    width: 240px;
    background: #0d1e38;
    border: 1px solid #38bdf8;
    border-radius: 6px;
    box-shadow: 0 10px 25px rgba(0, 0, 0, 0.75);
    z-index: 90;
    overflow: hidden;
  }

  .momen-board-shell:not(.fullscreen) .quick-search-dropdown {
    position: absolute;
    bottom: 100%;
    right: 0;
    left: auto;
    margin-bottom: 4px;
  }

  .momen-board-shell.fullscreen .quick-search-dropdown {
    position: absolute;
    top: 100%;
    left: 0;
    right: auto;
    margin-top: 4px;
  }

  .quick-match-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 6px 8px;
    background: transparent;
    border: none;
    border-bottom: 1px solid #1a355d;
    color: #f8fafc;
    font-size: 11px;
    text-align: left;
    cursor: pointer;
  }

  .quick-match-row:hover {
    background: #142a4d;
  }

  .qm-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .qm-label {
    font-weight: 700;
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .qm-sub {
    font-size: 9px;
    color: #94a3b8;
    white-space: nowrap;
  }

  .btn-stop-all {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #17253b;
    border: 1px solid #334155;
    color: #94a3b8;
    padding: 4px 8px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
  }

  .btn-stop-all.recording-live {
    background: #b91c1c;
    border-color: #f87171;
    color: #ffffff;
    box-shadow: 0 0 12px rgba(239, 68, 68, 0.45);
  }

  .btn-stop-all:disabled {
    opacity: 0.45;
    cursor: not-allowed;
  }

  .edit-mode-banner {
    background: rgba(217, 119, 6, 0.16);
    border-bottom: 1px solid #f59e0b;
    color: #fde68a;
    font-size: 10px;
    font-weight: 600;
    padding: 4px 10px;
    flex-shrink: 0;
  }

  /* SURFACE */
  .board-surface-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .board-surface-scroll.fit-mode {
    justify-content: center;
  }

  .canvas-stage-wrap {
    width: max-content;
    min-width: 100%;
    display: flex;
    justify-content: center;
    flex-shrink: 0;
  }

  .momen-canvas {
    position: relative;
    flex-shrink: 0;
    border-radius: 10px;
    border: 1px solid #1e3b68;
    overflow: hidden;
    box-shadow: inset 0 0 30px rgba(0, 0, 0, 0.45);
  }

  .pitch-bg-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
  }

  .canvas-btn {
    position: absolute;
    border: 1px solid rgba(255, 255, 255, 0.22);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 3px 5px;
    box-sizing: border-box;
    cursor: pointer;
    user-select: none;
    transition: transform 0.08s ease, box-shadow 0.15s ease, opacity 0.15s ease;
    box-shadow: 0 3px 8px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .canvas-btn:hover {
    filter: brightness(1.08);
    transform: translateY(-1px);
    z-index: 4;
  }

  .canvas-btn:active {
    transform: scale(0.96);
  }

  .canvas-btn.shape-rounded {
    border-radius: 10px;
  }

  .canvas-btn.shape-rect {
    border-radius: 4px;
  }

  .canvas-btn.shape-circle {
    border-radius: 999px;
  }

  .canvas-btn.on {
    box-shadow: 0 0 0 2px #060b14, 0 0 0 4px #ef4444, 0 0 18px rgba(239, 68, 68, 0.7);
    z-index: 6;
  }

  .canvas-btn.attached {
    box-shadow: 0 0 0 2px #060b14, 0 0 0 4px #38bdf8;
    z-index: 5;
  }

  .canvas-btn.dim {
    opacity: 0.28;
  }

  .canvas-btn-label {
    font-size: max(8px, calc(12px * var(--btn-scale, 1)));
    font-weight: 800;
    line-height: 1.1;
    text-align: center;
    word-break: break-word;
  }

  .btn-switch {
    position: absolute;
    top: 4px;
    left: 5px;
    width: 22px;
    height: 12px;
    border-radius: 8px;
    border: 1.5px solid currentColor;
    display: flex;
    align-items: center;
    padding: 1px;
    opacity: 0.85;
    transform: scale(var(--btn-scale, 1));
    transform-origin: top left;
  }

  .btn-switch i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: currentColor;
    display: block;
  }

  .btn-switch.on {
    background: #111827;
    border-color: #111827;
    justify-content: flex-end;
    opacity: 1;
  }

  .btn-switch.on i {
    background: #ef4444;
  }

  .btn-on-pill {
    position: absolute;
    top: 3px;
    right: 4px;
    background: rgba(15, 23, 42, 0.88);
    color: #f87171;
    font-size: max(7px, calc(9px * var(--btn-scale, 1)));
    font-weight: 900;
    padding: 1px 5px;
    border-radius: 999px;
    letter-spacing: 0.03em;
    animation: pulseOn 1.1s infinite;
  }

  @keyframes pulseOn {
    50% {
      opacity: 0.6;
    }
  }

  .btn-hotkey-tag {
    position: absolute;
    top: 3px;
    right: 4px;
    background: rgba(0, 0, 0, 0.35);
    color: #ffffff;
    font-size: max(7px, calc(9px * var(--btn-scale, 1)));
    font-weight: 800;
    padding: 1px 4px;
    border-radius: 3px;
    font-family: monospace;
  }

  .btn-roll-micro,
  .desc-check-badge,
  .desc-auto-badge {
    font-size: max(7px, calc(8px * var(--btn-scale, 1)));
    font-weight: 700;
    opacity: 0.85;
    margin-top: 2px;
  }

  .desc-check-badge {
    position: absolute;
    top: 2px;
    right: 5px;
    background: #060b14;
    color: #38bdf8;
    border-radius: 50%;
    width: 14px;
    height: 14px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 9px;
    opacity: 1;
  }

  .desc-auto-badge {
    position: absolute;
    bottom: 2px;
    background: rgba(0, 0, 0, 0.55);
    color: #38bdf8;
    padding: 0 4px;
    border-radius: 3px;
    font-size: 7px;
  }

  /* POOL DESCRIPTORS STRIP */
  .pool-descriptors-strip {
    background: #0b172a;
    border: 1px solid #1a355d;
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pool-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .pool-title {
    font-size: 10px;
    font-weight: 800;
    color: #93c5fd;
    letter-spacing: 0.05em;
  }

  .pool-search-input {
    background: #060b14;
    border: 1px solid #1e3b68;
    color: #f8fafc;
    border-radius: 4px;
    padding: 3px 8px;
    font-size: 10px;
    width: 150px;
    outline: none;
  }

  .pool-chips-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .pool-chip,
  .grid-desc-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0d1e38;
    border: 1px solid #1e3b68;
    color: #e2e8f0;
    padding: 4px 9px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.12s;
  }

  .pool-chip:hover,
  .grid-desc-pill:hover {
    border-color: #38bdf8;
    background: #142a4d;
  }

  .pool-chip.attached,
  .grid-desc-pill.attached {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.22);
    color: #ffffff;
  }

  .pool-chip.dim,
  .grid-desc-pill.dim {
    opacity: 0.3;
  }

  .pool-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* GRID LAYOUT */
  .grid-board-layout {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .grid-section {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .grid-section-title {
    font-size: 9px;
    font-weight: 800;
    color: #64748b;
    letter-spacing: 0.08em;
  }

  .grid-cards-wrap {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
    gap: 5px;
  }

  .grid-tag-btn {
    border: 1px solid rgba(255, 255, 255, 0.18);
    border-radius: 7px;
    padding: 5px 7px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    cursor: pointer;
    text-align: left;
    transition: transform 0.08s ease;
  }

  .grid-tag-btn:hover {
    filter: brightness(1.08);
  }

  .grid-tag-btn.on {
    box-shadow: 0 0 0 2px #060b14, 0 0 0 3.5px #ef4444;
  }

  .grid-btn-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    width: 100%;
    gap: 4px;
  }

  .grid-switch {
    width: 20px;
    height: 11px;
    border-radius: 7px;
    border: 1.5px solid currentColor;
    display: inline-flex;
    align-items: center;
    padding: 1px;
  }

  .grid-switch i {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: currentColor;
    display: block;
  }

  .grid-switch.on {
    background: #111827;
    border-color: #111827;
    justify-content: flex-end;
  }

  .grid-switch.on i {
    background: #ef4444;
  }

  .grid-single-badge {
    font-size: 8px;
    font-weight: 800;
    background: rgba(0, 0, 0, 0.25);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .grid-on-timer {
    font-size: 9px;
    font-weight: 900;
    background: rgba(15, 23, 42, 0.9);
    color: #f87171;
    padding: 1px 5px;
    border-radius: 999px;
  }

  .grid-kbd {
    font-size: 9px;
    font-weight: 800;
    background: rgba(0, 0, 0, 0.32);
    color: #ffffff;
    padding: 0 4px;
    border-radius: 3px;
    font-family: monospace;
  }

  .grid-btn-name {
    font-size: 11px;
    font-weight: 800;
    line-height: 1.15;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .grid-labels-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 5px;
  }

  .auto-pill-tag {
    font-size: 8px;
    font-weight: 800;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.16);
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* GROUPED VERTICAL LIST VIEW */
  .list-board-layout {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .list-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .list-group-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 9px;
    font-weight: 800;
    color: #93c5fd;
    letter-spacing: 0.06em;
    padding: 2px 2px;
  }

  .list-rows-stack {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .list-tag-row {
    position: relative;
    display: flex;
    align-items: center;
    gap: 6px;
    min-height: 28px;
    background: #0b172a;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 3px 8px 3px 10px;
    color: #f0f6fc;
    cursor: pointer;
    text-align: left;
    overflow: hidden;
    transition: all 0.12s ease;
  }

  .list-tag-row:hover {
    border-color: #38bdf8;
    background: #102444;
  }

  .list-tag-row.on {
    border-color: #ef4444;
    background: rgba(185, 28, 28, 0.18);
    box-shadow: 0 0 10px rgba(239, 68, 68, 0.28);
  }

  .list-color-bar {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background-color: var(--row-col);
  }

  .list-switch {
    width: 22px;
    height: 12px;
    border-radius: 7px;
    border: 1.5px solid #94a3b8;
    display: inline-flex;
    align-items: center;
    padding: 1px;
    flex-shrink: 0;
  }

  .list-switch i {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #94a3b8;
    display: block;
  }

  .list-switch.on {
    background: #111827;
    border-color: #ef4444;
    justify-content: flex-end;
  }

  .list-switch.on i {
    background: #ef4444;
  }

  .list-single-pill {
    font-size: 8px;
    font-weight: 800;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.14);
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 1px 4px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .list-row-name {
    font-size: 11px;
    font-weight: 700;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .list-group-tag,
  .list-roll-hint {
    font-size: 8px;
    color: #64748b;
    font-family: monospace;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .list-on-pill {
    font-size: 9px;
    font-weight: 900;
    background: #b91c1c;
    color: #ffffff;
    padding: 1px 6px;
    border-radius: 999px;
    white-space: nowrap;
    flex-shrink: 0;
    animation: pulseOn 1.1s infinite;
  }

  .list-kbd {
    font-family: monospace;
    font-size: 9px;
    font-weight: 800;
    color: #93c5fd;
    background: #060b14;
    border: 1px solid #1e3b68;
    padding: 1px 5px;
    border-radius: 3px;
    flex-shrink: 0;
  }

  .list-labels-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  /* LIVE PLAYERS BAR */
  .live-players-bar {
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 4px 8px;
    background: #0b172a;
    border-top: 1px solid #1a355d;
    flex-shrink: 0;
  }

  .live-players-bar.side-dock {
    flex-direction: column;
    align-items: stretch;
    gap: 5px;
  }

  .players-top-row {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .live-players-bar.side-dock .players-top-row {
    justify-content: space-between;
  }

  .target-indicator {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #060b14;
    border: 1px solid #1e3b68;
    border-radius: 6px;
    padding: 4px 8px;
    max-width: 175px;
    flex-shrink: 0;
  }

  .target-indicator.live {
    border-color: #ef4444;
    background: rgba(239, 68, 68, 0.15);
  }

  .target-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #38bdf8;
    flex-shrink: 0;
  }

  .target-indicator.live .target-dot {
    background: #ef4444;
    box-shadow: 0 0 8px #ef4444;
  }

  .target-text {
    font-size: 10px;
    font-weight: 700;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .team-side-toggle {
    background: #0284c7;
    color: #ffffff;
    border: none;
    border-radius: 5px;
    padding: 4px 7px;
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.05em;
    flex-shrink: 0;
    cursor: pointer;
  }

  .team-side-toggle.away {
    background: #dc2626;
  }

  .players-strip {
    display: flex;
    align-items: center;
    gap: 5px;
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    padding-bottom: 1px;
  }

  .live-player-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #060b14;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    padding: 3px 8px 3px 4px;
    border-radius: 999px;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.12s;
  }

  .live-player-pill:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .live-player-pill.primary {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.16);
    color: #ffffff;
  }

  .live-player-pill.attached {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.2);
    color: #6ee7b7;
  }

  .lp-num {
    font-size: 9px;
    font-weight: 900;
    color: #ffffff;
    padding: 1px 5px;
    border-radius: 999px;
  }

  .quick-add-player {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #060b14;
    border: 1px solid #1e3b68;
    border-radius: 5px;
    padding: 3px 7px;
    flex-shrink: 0;
  }

  .add-player-input {
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 10px;
    width: 96px;
    outline: none;
  }

  /* BUTTON EDITOR MODAL */
  .btn-editor-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(3, 7, 18, 0.8);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 220;
  }

  .btn-editor-card {
    width: 520px;
    max-width: 94vw;
    background: #0c1a33;
    border: 1px solid #1e3b68;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 24px 48px rgba(0, 0, 0, 0.85);
  }

  .btn-editor-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #091322;
    border-bottom: 1px solid #1e3b68;
  }

  .btn-editor-header h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 800;
    color: #38bdf8;
  }

  .btn-close-sm {
    background: transparent;
    border: 1px solid #1e3b68;
    color: #94a3b8;
    width: 28px;
    height: 28px;
    border-radius: 6px;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }

  .btn-editor-body {
    padding: 14px 16px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .form-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 10px;
  }

  .form-row-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 8px;
  }

  .field-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
    font-size: 10px;
    font-weight: 700;
    color: #93c5fd;
  }

  .field-group input,
  .field-group select {
    background: #060b14;
    border: 1px solid #1e3b68;
    color: #f8fafc;
    border-radius: 6px;
    padding: 6px 8px;
    font-size: 11px;
    outline: none;
  }

  .color-row {
    display: flex;
    gap: 6px;
    align-items: center;
  }

  .color-row input[type='color'] {
    width: 36px;
    height: 30px;
    padding: 2px;
  }

  .checkbox-field {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 11px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .btn-editor-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 16px;
    background: #091322;
    border-top: 1px solid #1e3b68;
  }

  .footer-right {
    display: flex;
    gap: 8px;
  }

  .btn-del-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: rgba(239, 68, 68, 0.14);
    border: 1px solid #ef4444;
    color: #fca5a5;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-cancel-sm {
    background: #132544;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-save-sm {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border: none;
    color: #ffffff;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }
</style>

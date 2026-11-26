<script lang="ts">
  import { onDestroy } from 'svelte';
  import {
    SlidersHorizontal,
    Clapperboard,
    Star,
    Scissors,
    Copy,
    Clipboard,
    ListPlus,
    Download,
    Trash2,
    CopyPlus,
  } from 'lucide-svelte';
  import type { VideoTagEvent } from '$lib/types';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    tag: VideoTagEvent | null;
    selectedCount: number;
    currentTime: number;
    hasCopiedMeta: boolean;
    onClose: () => void;
    onEditFull: (tag: VideoTagEvent) => void;
    onOpenTelestration: (tag: VideoTagEvent) => void;
    onSetTeamSide: (side: 'home' | 'away') => void;
    onToggleFavorite: () => void;
    onSplitAtPlayhead: (tag: VideoTagEvent) => void;
    onDuplicate: (tag: VideoTagEvent) => void;
    onCopyMeta: (tag: VideoTagEvent) => void;
    onPasteMeta: () => void;
    onAddToPlaylist: () => void;
    onQuickExport: (tag: VideoTagEvent) => void;
    onDelete: () => void;
  }

  let {
    open,
    x,
    y,
    tag,
    selectedCount,
    currentTime,
    hasCopiedMeta,
    onClose,
    onEditFull,
    onOpenTelestration,
    onSetTeamSide,
    onToggleFavorite,
    onSplitAtPlayhead,
    onDuplicate,
    onCopyMeta,
    onPasteMeta,
    onAddToPlaylist,
    onQuickExport,
    onDelete,
  }: Props = $props();

  const MENU_W = 264;
  const MENU_H = 385;

  let clampedPos = $derived.by(() => {
    if (typeof window === 'undefined') {
      return { left: x, top: y };
    }
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    return {
      left: Math.max(8, Math.min(x, vw - MENU_W - 10)),
      top: Math.max(8, Math.min(y, vh - MENU_H - 10)),
    };
  });

  $effect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  });

  onDestroy(() => {});

  const canSplit = $derived(
    Boolean(
      tag &&
        selectedCount <= 1 &&
        currentTime > tag.startTime + 0.3 &&
        currentTime < tag.endTime - 0.3
    )
  );

  const playerCount = $derived(
    tag
      ? tag.playersInvolved && tag.playersInvolved.length > 0
        ? tag.playersInvolved.length
        : tag.playerLabel
          ? 1
          : 0
      : 0
  );

  function fmtT(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const d = Math.floor((sec % 1) * 10);
    return `${m}:${String(s).padStart(2, '0')}.${d}`;
  }
</script>

{#if open && tag}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="ctx-backdrop"
    onpointerdown={onClose}
    oncontextmenu={(e) => {
      e.preventDefault();
      onClose();
    }}
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="ctx-menu"
      style="left: {clampedPos.left}px; top: {clampedPos.top}px;"
      onpointerdown={(e) => e.stopPropagation()}
      onclick={(e) => e.stopPropagation()}
      oncontextmenu={(e) => e.preventDefault()}
      role="menu"
      tabindex="-1"
    >
      <div class="ctx-header">
        <div class="ctx-hdr-top">
          <span class="ctx-dot" style="background-color: {tag.color};"></span>
          <span class="ctx-cat-title">{tag.category}</span>
          {#if selectedCount > 1}
            <span class="ctx-multi-pill">{selectedCount} Klip</span>
          {:else}
            <span class="ctx-time-pill">{fmtT(tag.startTime)}–{fmtT(tag.endTime)}</span>
          {/if}
        </div>
        <div class="ctx-team-row">
          <span class="ctx-team-lbl">Tim Klip:</span>
          <button
            type="button"
            class="ctx-team-btn"
            class:active={(tag.teamSide ?? 'home') === 'home'}
            onclick={() => onSetTeamSide('home')}
          >
            HOME
          </button>
          <button
            type="button"
            class="ctx-team-btn away"
            class:active={tag.teamSide === 'away'}
            onclick={() => onSetTeamSide('away')}
          >
            AWAY
          </button>
        </div>
      </div>

      <!-- PRIMARY ONCE-SPORT 3-COLUMN EDITOR LAUNCHER -->
      <button
        type="button"
        class="ctx-item ctx-primary"
        onclick={() => {
          onEditFull(tag);
          onClose();
        }}
      >
        <SlidersHorizontal size={14} class="text-sky-300" />
        <div class="ctx-primary-text">
          <span class="ctx-item-label">Edit Tag / Label / Pemain</span>
          <span class="ctx-sub-meta">
            {selectedCount > 1
              ? `Mode Massal (${selectedCount} klip)`
              : `${tag.labels?.length ?? 0} Label · ${playerCount} Pemain`}
          </span>
        </div>
        <span class="ctx-kbd">Alt+U</span>
      </button>

      <button
        type="button"
        class="ctx-item"
        onclick={() => {
          onOpenTelestration(tag);
          onClose();
        }}
      >
        <Clapperboard size={13} class="text-cyan-400" />
        <span class="ctx-item-label">Buka Studio Telestrasi</span>
      </button>

      <button
        type="button"
        class="ctx-item"
        onclick={() => {
          onToggleFavorite();
          onClose();
        }}
      >
        <Star size={13} class={tag.favorite ? 'text-amber-400' : 'text-slate-400'} />
        <span class="ctx-item-label">
          {tag.favorite ? 'Hapus Bintang Favorit' : 'Tandai Favorit ★'}
        </span>
      </button>

      <div class="ctx-sep"></div>

      <button
        type="button"
        class="ctx-item"
        disabled={!canSplit}
        onclick={() => {
          onSplitAtPlayhead(tag);
          onClose();
        }}
        title={canSplit
          ? `Belah klip pada ${fmtT(currentTime)}`
          : 'Posisikan garis merah di tengah klip (min. 0.3s dari tepi) untuk Split'}
      >
        <Scissors size={13} class="text-sky-300" />
        <span class="ctx-item-label">Potong di Playhead (Split)</span>
        <span class="ctx-kbd">S</span>
      </button>

      <button
        type="button"
        class="ctx-item"
        disabled={selectedCount > 1}
        onclick={() => {
          onDuplicate(tag);
          onClose();
        }}
      >
        <CopyPlus size={13} class="text-slate-300" />
        <span class="ctx-item-label">Duplikat Klip</span>
      </button>

      <button
        type="button"
        class="ctx-item"
        onclick={() => {
          onCopyMeta(tag);
          onClose();
        }}
      >
        <Copy size={13} class="text-slate-300" />
        <span class="ctx-item-label">Salin Label & Pemain</span>
        <span class="ctx-kbd">Ctrl+C</span>
      </button>

      <button
        type="button"
        class="ctx-item"
        disabled={!hasCopiedMeta}
        onclick={() => {
          onPasteMeta();
          onClose();
        }}
      >
        <Clipboard size={13} class="text-slate-300" />
        <span class="ctx-item-label">Tempel Label & Pemain</span>
        <span class="ctx-kbd">Ctrl+V</span>
      </button>

      <div class="ctx-sep"></div>

      <button
        type="button"
        class="ctx-item"
        onclick={() => {
          onAddToPlaylist();
          onClose();
        }}
      >
        <ListPlus size={13} class="text-emerald-400" />
        <span class="ctx-item-label">Tambahkan ke Playlist</span>
      </button>

      <button
        type="button"
        class="ctx-item"
        disabled={selectedCount > 1}
        onclick={() => {
          onQuickExport(tag);
          onClose();
        }}
      >
        <Download size={13} class="text-sky-400" />
        <span class="ctx-item-label">Ekspor Klip Ini (MP4)</span>
      </button>

      <div class="ctx-sep"></div>

      <button
        type="button"
        class="ctx-item danger"
        onclick={() => {
          onDelete();
          onClose();
        }}
      >
        <Trash2 size={13} />
        <span class="ctx-item-label">
          {selectedCount > 1 ? `Hapus ${selectedCount} Klip Terpilih` : 'Hapus Klip'}
        </span>
        <span class="ctx-kbd">Del</span>
      </button>
    </div>
  </div>
{/if}

<style>
  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 450;
    background: transparent;
  }

  .ctx-menu {
    position: fixed;
    width: 264px;
    background: #081224;
    border: 1px solid #1e3b68;
    border-radius: 9px;
    box-shadow: 0 18px 40px rgba(2, 6, 23, 0.88), 0 0 18px rgba(56, 189, 248, 0.16);
    padding: 5px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    color: #e2e8f0;
    user-select: none;
  }

  .ctx-header {
    padding: 5px 7px 6px;
    background: #0b1830;
    border: 1px solid #173056;
    border-radius: 6px;
    margin-bottom: 3px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .ctx-hdr-top {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .ctx-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ctx-cat-title {
    flex: 1;
    min-width: 0;
    font-size: 11px;
    font-weight: 800;
    color: #f8fafc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctx-time-pill {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    font-weight: 700;
    color: #93c5fd;
    background: #060d1a;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .ctx-multi-pill {
    font-size: 9px;
    font-weight: 800;
    color: #04101d;
    background: #f59e0b;
    padding: 1px 6px;
    border-radius: 999px;
  }

  .ctx-team-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .ctx-team-lbl {
    font-size: 9.5px;
    font-weight: 700;
    color: #94a3b8;
    margin-right: auto;
  }

  .ctx-team-btn {
    background: #07101f;
    border: 1px solid #1e3b68;
    color: #94a3b8;
    font-size: 9px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 4px;
    cursor: pointer;
  }

  .ctx-team-btn.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .ctx-team-btn.away.active {
    background: #d97706;
    border-color: #fbbf24;
    color: #ffffff;
  }

  .ctx-item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 5px 8px;
    border-radius: 5px;
    background: transparent;
    border: 1px solid transparent;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
  }

  .ctx-item.ctx-primary {
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.25), rgba(37, 99, 235, 0.3));
    border-color: rgba(56, 189, 248, 0.55);
    color: #ffffff;
    padding: 6px 8px;
  }

  .ctx-item.ctx-primary:hover {
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.38), rgba(37, 99, 235, 0.45));
    border-color: #38bdf8;
  }

  .ctx-primary-text {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 1px;
  }

  .ctx-sub-meta {
    font-size: 9px;
    font-weight: 600;
    color: #93c5fd;
  }

  .ctx-item:hover:not(:disabled) {
    background: #132a4f;
    color: #ffffff;
  }

  .ctx-item:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .ctx-item.danger {
    color: #f87171;
  }

  .ctx-item.danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.16);
    color: #fecaca;
  }

  .ctx-item-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ctx-kbd {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    color: #94a3b8;
  }

  .ctx-sep {
    height: 1px;
    background: #162c50;
    margin: 2px 4px;
  }
</style>

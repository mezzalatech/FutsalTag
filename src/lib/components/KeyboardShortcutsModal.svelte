<script lang="ts">
  import {
    Keyboard,
    Search,
    RotateCcw,
    AlertTriangle,
    X,
    Zap,
    Rewind,
    LayoutGrid,
  } from 'lucide-svelte';
  import {
    shortcutsStore,
    SHORTCUT_ACTIONS,
    eventToCombo,
    formatComboDisplay,
    type ShortcutActionId,
    type ShortcutGroupId,
  } from '$lib/stores/shortcutsStore.svelte';
  import type { TaggingBoard } from '$lib/types';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
    board: TaggingBoard;
  }

  let { isOpen, onClose, board }: Props = $props();

  let activeTab = $state<'all' | ShortcutGroupId | 'board'>('all');
  let searchQuery = $state('');
  let recordingActionId = $state<ShortcutActionId | null>(null);

  const boardHotkeys = $derived(
    board.buttons.filter((b) => b.hotkey && b.hotkey.trim().length > 0)
  );

  const filteredActions = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return SHORTCUT_ACTIONS.filter((act) => {
      if (activeTab !== 'all' && activeTab !== 'board' && act.group !== activeTab) {
        return false;
      }
      if (!q) return true;
      const curCombo = formatComboDisplay(shortcutsStore.bindings[act.id]).toLowerCase();
      return (
        act.label.toLowerCase().includes(q) ||
        act.description.toLowerCase().includes(q) ||
        curCombo.includes(q)
      );
    });
  });

  const filteredBoardHotkeys = $derived.by(() => {
    const q = searchQuery.trim().toLowerCase();
    return boardHotkeys.filter(
      (b) =>
        !q ||
        b.name.toLowerCase().includes(q) ||
        (b.hotkey && b.hotkey.toLowerCase().includes(q))
    );
  });

  $effect(() => {
    if (!isOpen) {
      recordingActionId = null;
      return;
    }

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (recordingActionId) {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') {
          recordingActionId = null;
          return;
        }
        const combo = eventToCombo(e);
        if (combo) {
          shortcutsStore.setBinding(recordingActionId, combo);
          recordingActionId = null;
        }
        return;
      }

      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', onKeyDownCapture, true);
    return () => window.removeEventListener('keydown', onKeyDownCapture, true);
  });

  function getGroupTitle(group: ShortcutGroupId): string {
    if (group === 'playback') return 'Pemutaran & Kecepatan';
    if (group === 'timeline') return 'Linimasa & Klip';
    return 'Edit & Riwayat';
  }
</script>

{#if isOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="sc-backdrop"
    onclick={onClose}
    oncontextmenu={(e) => e.preventDefault()}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="sc-modal"
      onclick={(e) => e.stopPropagation()}
      role="dialog"
      aria-label="Pengaturan Shortcut Keyboard"
      tabindex="-1"
    >
      <!-- HEADER -->
      <header class="sc-header">
        <div class="sc-hdr-left">
          <div class="sc-icon-badge">
            <Keyboard size={17} />
          </div>
          <div>
            <h2 class="sc-title">PENGATURAN SHORTCUT & HOTKEY KEYBOARD</h2>
            <p class="sc-subtitle">
              Klik tombol keycap lalu tekan kombinasi tombol baru untuk mengganti. Tersimpan otomatis.
            </p>
          </div>
        </div>

        <div class="sc-hdr-actions">
          <button
            type="button"
            class="sc-preset-btn"
            class:active={shortcutsStore.activePreset === 'speed-step'}
            onclick={() => shortcutsStore.applyPreset('speed-step')}
            title="J = Perlambat/Slow-Mo, K = 1.0x + Pause, L = Percepat"
          >
            <Zap size={12} />
            <span>Futsal Speed (J/K/L)</span>
          </button>
          <button
            type="button"
            class="sc-preset-btn"
            class:active={shortcutsStore.activePreset === 'shuttle-rewind'}
            onclick={() => shortcutsStore.applyPreset('shuttle-rewind')}
            title="J = Mundur 2s, K = 1.0x + Pause, L = Percepat, [ / ] = Slow-Mo & Maju"
          >
            <Rewind size={12} />
            <span>Premiere Shuttle</span>
          </button>
          <button
            type="button"
            class="sc-reset-btn"
            onclick={() => shortcutsStore.resetDefaults()}
            title="Kembalikan seluruh shortcut ke pengaturan awal"
          >
            <RotateCcw size={12} />
            <span>Reset</span>
          </button>
          <button type="button" class="sc-close-btn" onclick={onClose} title="Tutup (Esc)">
            <X size={16} />
          </button>
        </div>
      </header>

      <!-- FILTER TABS & SEARCH -->
      <div class="sc-toolbar">
        <div class="sc-tabs">
          <button
            type="button"
            class="sc-tab"
            class:active={activeTab === 'all'}
            onclick={() => (activeTab = 'all')}
          >
            Semua ({SHORTCUT_ACTIONS.length})
          </button>
          <button
            type="button"
            class="sc-tab"
            class:active={activeTab === 'playback'}
            onclick={() => (activeTab = 'playback')}
          >
            Pemutaran & Kecepatan
          </button>
          <button
            type="button"
            class="sc-tab"
            class:active={activeTab === 'timeline'}
            onclick={() => (activeTab = 'timeline')}
          >
            Linimasa & Klip
          </button>
          <button
            type="button"
            class="sc-tab"
            class:active={activeTab === 'edit'}
            onclick={() => (activeTab = 'edit')}
          >
            Edit & Riwayat
          </button>
          <button
            type="button"
            class="sc-tab"
            class:active={activeTab === 'board'}
            onclick={() => (activeTab = 'board')}
          >
            <LayoutGrid size={11} />
            <span>Hotkey Papan ({boardHotkeys.length})</span>
          </button>
        </div>

        <div class="sc-search-box">
          <Search size={12} class="text-slate-400" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Cari aksi atau tombol..."
            class="sc-search-input"
          />
          {#if searchQuery}
            <button
              type="button"
              class="sc-search-clear"
              onclick={() => (searchQuery = '')}
            >
              <X size={11} />
            </button>
          {/if}
        </div>
      </div>

      <!-- LIST BODY -->
      <div class="sc-body">
        {#if activeTab === 'board'}
          <div class="sc-board-banner">
            Menampilkan hotkey tombol dari papan aktif <strong>{board.name}</strong>. Untuk mengubah
            hotkey tombol tag/label, klik <strong>Edit Papan</strong> di header Workspace Tagging.
          </div>
          {#each filteredBoardHotkeys as btn (btn.id)}
            {@const hkUpper = (btn.hotkey || '').toUpperCase()}
            {@const workspaceOverlap = SHORTCUT_ACTIONS.filter(
              (a) => (shortcutsStore.bindings[a.id] || '').toUpperCase() === hkUpper
            )}
            <div class="sc-row">
              <div class="sc-row-info">
                <div class="sc-row-title-line">
                  <span class="sc-dot" style="background-color: {btn.color};"></span>
                  <span class="sc-row-label">{btn.name}</span>
                  <span class="sc-kind-badge">
                    {btn.kind === 'category' ? 'Tag Aksi' : 'Label'}
                  </span>
                  {#if workspaceOverlap.length > 0}
                    <span class="sc-conflict-pill">
                      <AlertTriangle size={11} />
                      <span>Diprioritaskan Papan (bentrok dengan {workspaceOverlap[0].label})</span>
                    </span>
                  {/if}
                </div>
                <span class="sc-row-desc">
                  {btn.continuous ? 'Mode Kontinu (Start/Stop)' : `Auto Clip (Pre ${btn.leadSec}s / Post ${btn.lagSec}s)`}
                </span>
              </div>
              <div class="sc-row-keys">
                <span class="sc-keycap static">{hkUpper}</span>
              </div>
            </div>
          {/each}
        {:else}
          {#each filteredActions as act (act.id)}
            {@const curCombo = shortcutsStore.bindings[act.id] || ''}
            {@const conflicts = shortcutsStore.findConflicts(act.id, curCombo, board.buttons)}
            {@const isRecording = recordingActionId === act.id}
            <div class="sc-row" class:recording={isRecording}>
              <div class="sc-row-info">
                <div class="sc-row-title-line">
                  <span class="sc-group-pill">{getGroupTitle(act.group)}</span>
                  <span class="sc-row-label">{act.label}</span>
                  {#if conflicts.length > 0}
                    <span class="sc-conflict-pill" title={conflicts.join(', ')}>
                      <AlertTriangle size={11} />
                      <span>Bentrok: {conflicts[0]}</span>
                    </span>
                  {/if}
                </div>
                <span class="sc-row-desc">{act.description}</span>
              </div>

              <div class="sc-row-keys">
                <button
                  type="button"
                  class="sc-keycap"
                  class:recording={isRecording}
                  class:empty={!curCombo}
                  onclick={() =>
                    (recordingActionId = isRecording ? null : act.id)
                  }
                  title="Klik lalu tekan kombinasi tombol baru"
                >
                  {isRecording
                    ? 'Tekan tombol... (Esc batal)'
                    : formatComboDisplay(curCombo)}
                </button>
                {#if curCombo}
                  <button
                    type="button"
                    class="sc-clear-key"
                    onclick={() => shortcutsStore.clearBinding(act.id)}
                    title="Kosongkan shortcut ini"
                  >
                    <X size={12} />
                  </button>
                {/if}
              </div>
            </div>
          {/each}
          {#if filteredActions.length === 0}
            <div class="sc-empty">Tidak ada shortcut yang cocok dengan "{searchQuery}".</div>
          {/if}
        {/if}
      </div>

      <!-- FOOTER -->
      <footer class="sc-footer">
        <span class="sc-footer-hint">
          Tips: Tekan <strong>?</strong> kapan saja di Workspace Tagging untuk membuka menu shortcut ini.
        </span>
        <button type="button" class="sc-done-btn" onclick={onClose}>
          Selesai
        </button>
      </footer>
    </div>
  </div>
{/if}

<style>
  .sc-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.8);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 300;
    padding: 16px;
  }

  .sc-modal {
    width: 820px;
    max-width: 96vw;
    max-height: 88vh;
    background: #0d1320;
    border: 1px solid #1e3b68;
    border-radius: 12px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85), 0 0 24px rgba(56, 189, 248, 0.16);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #e2e8f0;
  }

  .sc-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 16px;
    background: linear-gradient(180deg, #10203b 0%, #0b1424 100%);
    border-bottom: 1px solid #1a355d;
    flex-shrink: 0;
  }

  .sc-hdr-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .sc-icon-badge {
    width: 34px;
    height: 34px;
    border-radius: 8px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .sc-title {
    margin: 0;
    font-size: 12.5px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #38bdf8;
  }

  .sc-subtitle {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: #94a3b8;
  }

  .sc-hdr-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .sc-preset-btn,
  .sc-reset-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0a1426;
    border: 1px solid #1e3b68;
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 700;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
  }

  .sc-preset-btn:hover,
  .sc-reset-btn:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .sc-preset-btn.active {
    background: rgba(14, 165, 233, 0.24);
    border-color: #38bdf8;
    color: #e0f2fe;
  }

  .sc-close-btn {
    background: transparent;
    border: 1px solid #1e3b68;
    color: #94a3b8;
    border-radius: 6px;
    padding: 4px 6px;
    cursor: pointer;
    display: inline-flex;
  }

  .sc-close-btn:hover {
    border-color: #ef4444;
    color: #ffffff;
  }

  .sc-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 8px 16px;
    background: #09101d;
    border-bottom: 1px solid #162b4d;
    flex-wrap: wrap;
    flex-shrink: 0;
  }

  .sc-tabs {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .sc-tab {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0f182a;
    border: 1px solid #1b3154;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 9px;
    border-radius: 999px;
    cursor: pointer;
  }

  .sc-tab.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .sc-search-box {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #050a14;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 4px 8px;
    min-width: 190px;
  }

  .sc-search-input {
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 11px;
    outline: none;
    flex: 1;
    min-width: 0;
  }

  .sc-search-clear {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    display: inline-flex;
    padding: 0;
  }

  .sc-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 10px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .sc-board-banner {
    background: rgba(56, 189, 248, 0.1);
    border: 1px solid rgba(56, 189, 248, 0.35);
    color: #bae6fd;
    font-size: 11px;
    padding: 8px 10px;
    border-radius: 7px;
    margin-bottom: 4px;
  }

  .sc-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 8px 10px;
    background: #0a101c;
    border: 1px solid #172844;
    border-radius: 7px;
  }

  .sc-row.recording {
    border-color: #f59e0b;
    background: rgba(245, 158, 11, 0.08);
  }

  .sc-row-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    min-width: 0;
    flex: 1;
  }

  .sc-row-title-line {
    display: flex;
    align-items: center;
    gap: 7px;
    flex-wrap: wrap;
  }

  .sc-group-pill,
  .sc-kind-badge {
    font-size: 9px;
    font-weight: 800;
    color: #93c5fd;
    background: #122138;
    padding: 1px 6px;
    border-radius: 4px;
  }

  .sc-row-label {
    font-size: 11.5px;
    font-weight: 700;
    color: #f8fafc;
  }

  .sc-row-desc {
    font-size: 10px;
    color: #94a3b8;
  }

  .sc-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .sc-conflict-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 9.5px;
    font-weight: 700;
    background: rgba(245, 158, 11, 0.16);
    border: 1px solid rgba(245, 158, 11, 0.5);
    color: #fcd34d;
    padding: 1px 6px;
    border-radius: 999px;
  }

  .sc-row-keys {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-shrink: 0;
  }

  .sc-keycap {
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    font-weight: 800;
    color: #e0f2fe;
    background: #111f36;
    border: 1px solid #2b4a7a;
    border-bottom-width: 2.5px;
    padding: 4px 10px;
    border-radius: 6px;
    cursor: pointer;
    min-width: 86px;
    text-align: center;
  }

  .sc-keycap:hover:not(.static) {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .sc-keycap.recording {
    background: #b45309;
    border-color: #fbbf24;
    color: #ffffff;
  }

  .sc-keycap.empty {
    color: #64748b;
    font-weight: 600;
  }

  .sc-keycap.static {
    cursor: default;
    min-width: 44px;
  }

  .sc-clear-key {
    background: transparent;
    border: 1px solid #1e3556;
    color: #94a3b8;
    border-radius: 5px;
    padding: 4px;
    cursor: pointer;
    display: inline-flex;
  }

  .sc-clear-key:hover {
    border-color: #ef4444;
    color: #f87171;
  }

  .sc-empty {
    text-align: center;
    padding: 24px;
    font-size: 11.5px;
    color: #64748b;
  }

  .sc-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 16px;
    background: #0a101b;
    border-top: 1px solid #1a355d;
    flex-shrink: 0;
  }

  .sc-footer-hint {
    font-size: 10.5px;
    color: #94a3b8;
  }

  .sc-done-btn {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border: 1px solid #38bdf8;
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 800;
    padding: 6px 16px;
    border-radius: 6px;
    cursor: pointer;
  }
</style>

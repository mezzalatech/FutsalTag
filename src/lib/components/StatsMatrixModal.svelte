<script lang="ts">
  import type { VideoTagEvent, TagCategory } from '$lib/types';
  import { projectStore } from '$lib/stores/projectStore.svelte';
  import { 
    X, 
    Play, 
    Download, 
    Table, 
    Sparkles, 
    Filter, 
    Layers, 
    Film,
    CheckCircle2
  } from 'lucide-svelte';

  interface Props {
    isOpen?: boolean;
    tags: VideoTagEvent[];
    onClose: () => void;
    onPlayClips?: (clips: VideoTagEvent[], title: string) => void;
    onPlayTag?: (tag: VideoTagEvent) => void;
  }

  let { isOpen = true, tags, onClose, onPlayClips, onPlayTag }: Props = $props();

  export interface MatrixCategory {
    id: string;
    label: string;
    shortLabel: string;
    icon: string;
    cat: TagCategory;
    phase: 'attack' | 'defense' | 'setpiece' | 'special';
    color: string;
  }

  const ALL_CATEGORIES: MatrixCategory[] = [
    // 1. Serangan & Finishing
    { id: 'goal', label: 'Gol', shortLabel: 'Gol', icon: '⚽', cat: 'Goal', phase: 'attack', color: '#10b981' },
    { id: 'sot', label: 'Shoot On-Target', shortLabel: 'Shoot OT', icon: '🎯', cat: 'Shot on Target', phase: 'attack', color: '#38bdf8' },
    { id: 'soff', label: 'Shoot Off-Target', shortLabel: 'Shoot Off', icon: '⭕', cat: 'Shot Off Target', phase: 'attack', color: '#64748b' },
    { id: 'counter', label: 'Counter Attack', shortLabel: 'Counter', icon: '⚡', cat: 'Transition Attack', phase: 'attack', color: '#6366f1' },

    // 2. Pertahanan & Pressing
    { id: 'press', label: 'High Pressing', shortLabel: 'Pressing', icon: '🔥', cat: 'Pressing High', phase: 'defense', color: '#f59e0b' },
    { id: 'trans_def', label: 'Transisi Bertahan', shortLabel: 'Transisi Def', icon: '🛑', cat: 'Transition Defense', phase: 'defense', color: '#ef4444' },
    { id: 'save', label: 'Save Kiper', shortLabel: 'Save GK', icon: '🧤', cat: 'Goalkeeper Save', phase: 'defense', color: '#06b6d4' },
    { id: 'foul', label: 'Pelanggaran', shortLabel: 'Foul', icon: '⚠️', cat: 'Foul', phase: 'defense', color: '#f97316' },

    // 3. Set-Piece Bola Mati
    { id: 'kickin', label: 'Kick-In Set Piece', shortLabel: 'Kick-In', icon: '📐', cat: 'Kick-in Set Piece', phase: 'setpiece', color: '#ec4899' },
    { id: 'corner', label: 'Corner Kick', shortLabel: 'Corner', icon: '🚩', cat: 'Corner Set Piece', phase: 'setpiece', color: '#8b5cf6' },

    // 4. Sistem Taktik & Rotasi Futsal
    { id: 'rot31', label: 'Rotasi 3-1', shortLabel: 'Rot 3-1', icon: '🔄', cat: 'Build-up 3-1', phase: 'special', color: '#0ea5e9' },
    { id: 'rot40', label: 'Rotasi 4-0 Flat', shortLabel: 'Rot 4-0', icon: '↔️', cat: 'Build-up 4-0', phase: 'special', color: '#14b8a6' },
    { id: 'pplay', label: 'Power Play 5v4', shortLabel: 'Power Play', icon: '👑', cat: 'Power Play', phase: 'special', color: '#eab308' },
  ];

  const PHASES = [
    { id: 'all', label: 'Semua Aksi (13)', badge: 'Semua' },
    { id: 'attack', label: '⚽ Serangan & Gol (4)', badge: 'Serang' },
    { id: 'defense', label: '🛡️ Bertahan & Pressing (4)', badge: 'Bertahan' },
    { id: 'setpiece', label: '📐 Set-Piece (2)', badge: 'Bola Mati' },
    { id: 'special', label: '♟️ Taktik & Rotasi (3)', badge: 'Taktik' },
  ] as const;

  let activePhaseTab = $state<'all' | 'attack' | 'defense' | 'setpiece' | 'special'>('all');

  const visibleCategories = $derived(
    activePhaseTab === 'all'
      ? ALL_CATEGORIES
      : ALL_CATEGORIES.filter((c) => c.phase === activePhaseTab)
  );

  const BASE_PLAYERS = ['#1 Kiper', '#4 Anchor', '#7 Flank Kiri', '#11 Flank Kanan', '#9 Pivot', 'Tim Lawan'];

  // Dynamically resolve roster: default starting 5 + Tim Lawan + any custom/substitute players in tags
  const resolvedPlayers = $derived.by(() => {
    const list = [...BASE_PLAYERS];
    for (const t of tags) {
      if (t.playerLabel) {
        const norm = normalizePlayerLabel(t.playerLabel);
        if (!list.includes(norm)) {
          list.push(norm);
        }
      }
    }
    return list;
  });

  function normalizePlayerLabel(label: string): string {
    if (!label) return 'Tim Lawan';
    if (label === 'Opp Tim Lawan' || label.toLowerCase().includes('lawan')) {
      return 'Tim Lawan';
    }
    return label;
  }

  function matchesPlayer(tag: VideoTagEvent, player: string): boolean {
    const norm = normalizePlayerLabel(tag.playerLabel || '');
    return norm === player;
  }

  function matchesCategory(tag: VideoTagEvent, catObj: MatrixCategory): boolean {
    return tag.category === catObj.cat;
  }

  // Get matching clips for (Player, Category)
  function getClips(player: string, catObj: MatrixCategory): VideoTagEvent[] {
    return tags.filter((t) => matchesPlayer(t, player) && matchesCategory(t, catObj));
  }

  function getPlayerRowTotal(player: string): VideoTagEvent[] {
    return tags.filter((t) => matchesPlayer(t, player) && visibleCategories.some((c) => matchesCategory(t, c)));
  }

  function getCategoryColTotal(catObj: MatrixCategory): VideoTagEvent[] {
    return tags.filter((t) => matchesCategory(t, catObj) && resolvedPlayers.some((p) => matchesPlayer(t, p)));
  }

  const grandVisibleTotal = $derived(
    tags.filter((t) => 
      visibleCategories.some((c) => matchesCategory(t, c)) &&
      resolvedPlayers.some((p) => matchesPlayer(t, p))
    ).length
  );

  function handleCellClick(player: string, catObj: MatrixCategory) {
    const clips = getClips(player, catObj);
    if (clips.length > 0) {
      if (onPlayClips) {
        onPlayClips(clips, `${player} - ${catObj.label} (${clips.length} Klip)`);
      } else if (onPlayTag) {
        onPlayTag(clips[0]);
      }
      onClose();
    }
  }

  function handleRowClick(player: string) {
    const clips = getPlayerRowTotal(player);
    if (clips.length > 0) {
      if (onPlayClips) {
        onPlayClips(clips, `Kumpulan Aksi: ${player} (${clips.length} Klip)`);
      } else if (onPlayTag) {
        onPlayTag(clips[0]);
      }
      onClose();
    }
  }

  function handleColClick(catObj: MatrixCategory) {
    const clips = getCategoryColTotal(catObj);
    if (clips.length > 0) {
      if (onPlayClips) {
        onPlayClips(clips, `Kumpulan Kejadian: ${catObj.label} (${clips.length} Klip)`);
      } else if (onPlayTag) {
        onPlayTag(clips[0]);
      }
      onClose();
    }
  }

  function handlePlayAll() {
    const allClips = tags.filter((t) =>
      visibleCategories.some((c) => matchesCategory(t, c)) &&
      resolvedPlayers.some((p) => matchesPlayer(t, p))
    );
    if (allClips.length > 0) {
      if (onPlayClips) {
        onPlayClips(allClips, `Semua Klip Matriks (${allClips.length} Klip)`);
      } else if (onPlayTag) {
        onPlayTag(allClips[0]);
      }
      onClose();
    }
  }

  function handleLoadDemoData() {
    projectStore.loadSampleDemo();
  }

  function exportCSV() {
    let csv = 'Pemain,' + ALL_CATEGORIES.map((c) => `"${c.label}"`).join(',') + ',TOTAL\n';

    for (const p of resolvedPlayers) {
      const rowCounts = ALL_CATEGORIES.map((c) => getClips(p, c).length);
      const total = tags.filter((t) => matchesPlayer(t, p) && ALL_CATEGORIES.some((c) => matchesCategory(t, c))).length;
      csv += `"${p}",` + rowCounts.join(',') + `,${total}\n`;
    }

    const colTotals = ALL_CATEGORIES.map((c) => getCategoryColTotal(c).length);
    const totalCount = tags.length;
    csv += `"TOTAL TIM",` + colTotals.join(',') + `,${totalCount}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Matriks_Statistik_Futsal_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }
</script>

{#if isOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={onClose} role="presentation">
  <div class="modal-card" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
    <!-- MODAL HEADER -->
    <header class="modal-header">
      <div class="header-info">
        <div class="title-row">
          <Table size={18} class="text-sky-400" />
          <h2 class="modal-title">
            MATRIKS SILANG STATISTIK FUTSAL (CROSS-TABULATION)
          </h2>
          <span class="match-pill">{projectStore.videoTitle || 'Pertandingan Aktif'}</span>
        </div>
        <p class="subtitle">
          Distribusi frekuensi aksi setiap pemain vs kategori taktik futsal standar Once Sport & Momen Sports
        </p>
      </div>

      <div class="header-actions">
        <button class="btn-clean" onclick={exportCSV} title="Ekspor Lembar Kerja CSV">
          <Download size={13} />
          <span>Ekspor CSV</span>
        </button>
        <button class="btn-close" onclick={onClose} title="Tutup Matriks (Esc)">
          <X size={18} />
        </button>
      </div>
    </header>

    <!-- PHASE FILTER TABS (ONCE SPORT STYLE) -->
    <div class="filter-bar">
      <div class="tabs-group">
        {#each PHASES as ph}
          <button
            class="tab-pill"
            class:active={activePhaseTab === ph.id}
            onclick={() => (activePhaseTab = ph.id)}
          >
            <span>{ph.label}</span>
          </button>
        {/each}
      </div>

      <div class="interactive-tip">
        <Sparkles size={13} class="text-amber-400" />
        <span>Klik sel angka <strong class="text-sky-300">▶ Klip</strong> untuk memutar playlist momen secara otomatis</span>
      </div>
    </div>

    <div class="modal-body">
      <!-- EMPTY STATE PROMPT WHEN NO TAGS EXIST -->
      {#if tags.length === 0}
        <div class="empty-state-card">
          <div class="empty-icon-wrap">
            <Film size={26} class="text-sky-400" />
          </div>
          <div class="empty-content">
            <h4 class="empty-title">Belum Ada Klip Momen yang Ditandai</h4>
            <p class="empty-desc">
              Matriks silang masih kosong karena belum ada aksi pertandingan yang ditandai. Anda dapat menandai aksi dengan hotkey 
              <span class="hotkey-badge">[1-8, Q, W, E, R, T]</span> saat memutar video, atau klik tombol di bawah untuk mencoba data simulasi demo futsal.
            </p>
          </div>
          <button class="btn-load-demo" onclick={handleLoadDemoData}>
            <Play size={13} />
            <span>Muat Sampel Data Demo</span>
          </button>
        </div>
      {/if}

      <!-- MATRIX TABLE CONTAINER -->
      <div class="table-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="th-player">
                <div class="flex items-center gap-1.5">
                  <Layers size={13} class="text-sky-400" />
                  <span>Pemain / Roster</span>
                </div>
              </th>
              {#each visibleCategories as cat}
                <th
                  class="th-action"
                  onclick={() => handleColClick(cat)}
                  title="Klik untuk putar semua klip {cat.label}"
                >
                  <div class="th-content">
                    <span class="th-icon">{cat.icon}</span>
                    <span class="th-label">{cat.shortLabel}</span>
                  </div>
                </th>
              {/each}
              <th
                class="th-total"
                onclick={handlePlayAll}
                title="Klik untuk memutar semua klip"
              >
                TOTAL
              </th>
            </tr>
          </thead>
          <tbody>
            {#each resolvedPlayers as player}
              {@const pRowClips = getPlayerRowTotal(player)}
              {@const pTotal = pRowClips.length}
              <tr class="tr-player">
                <td
                  class="td-player"
                  onclick={() => handleRowClick(player)}
                  title="Klik untuk putar semua aksi {player}"
                >
                  <div class="player-cell">
                    <span class="player-dot" class:is-opponent={player === 'Tim Lawan'}></span>
                    <span class="player-name">{player}</span>
                  </div>
                </td>

                {#each visibleCategories as cat}
                  {@const clips = getClips(player, cat)}
                  {@const count = clips.length}
                  <td class="td-cell" class:has-data={count > 0}>
                    {#if count > 0}
                      <button
                        class="cell-btn"
                        onclick={() => handleCellClick(player, cat)}
                        title="Putar {count} klip {player} - {cat.label}"
                      >
                        <Play size={10} class="cell-play-icon" />
                        <span class="cell-count">{count}</span>
                      </button>
                    {:else}
                      <span class="cell-zero">-</span>
                    {/if}
                  </td>
                {/each}

                <td class="td-total">
                  {#if pTotal > 0}
                    <button
                      class="total-btn"
                      onclick={() => handleRowClick(player)}
                      title="Putar {pTotal} aksi {player}"
                    >
                      <Play size={10} class="inline mr-1 opacity-70" />
                      <span>{pTotal}</span>
                    </button>
                  {:else}
                    <span class="cell-zero">0</span>
                  {/if}
                </td>
              </tr>
            {/each}

            <!-- FOOTER ROW (TOTAL TIM) -->
            <tr class="tr-footer">
              <td class="td-footer-label">
                <div class="flex items-center gap-2">
                  <CheckCircle2 size={14} class="text-sky-400" />
                  <span class="font-bold">TOTAL TIM</span>
                </div>
              </td>
              {#each visibleCategories as cat}
                {@const cTotal = getCategoryColTotal(cat).length}
                <td class="td-footer-cell">
                  {#if cTotal > 0}
                    <button
                      class="col-total-btn"
                      onclick={() => handleColClick(cat)}
                      title="Putar semua {cTotal} klip {cat.label}"
                    >
                      <Play size={10} class="inline mr-1 opacity-70" />
                      <span>{cTotal}</span>
                    </button>
                  {:else}
                    <span class="cell-zero">0</span>
                  {/if}
                </td>
              {/each}
              <td class="td-grand-total">
                {#if grandVisibleTotal > 0}
                  <button
                    class="grand-total-btn"
                    onclick={handlePlayAll}
                    title="Putar playlist semua {grandVisibleTotal} klip matriks"
                  >
                    <Play size={11} class="inline mr-1" />
                    <span>{grandVisibleTotal}</span>
                  </button>
                {:else}
                  <span>0</span>
                {/if}
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    top: 0;
    left: 0;
    width: 100vw;
    height: 100vh;
    background-color: rgba(6, 12, 22, 0.88);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-card {
    width: 1060px;
    max-width: 96vw;
    max-height: 92vh;
    background: radial-gradient(circle at 50% 0%, #0d1e38 0%, #07101e 100%);
    border: 1px solid #1e3b68;
    border-radius: 14px;
    box-shadow: 0 25px 60px -10px rgba(2, 6, 23, 0.95), 0 0 30px rgba(14, 165, 233, 0.2);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 16px 22px;
    background: linear-gradient(180deg, #102548 0%, #0c1a33 100%);
    border-bottom: 1px solid #1e3b68;
  }

  .header-info {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .title-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .modal-title {
    font-size: 13px;
    font-weight: 800;
    color: #ffffff;
    letter-spacing: 0.04em;
    text-transform: uppercase;
  }

  .match-pill {
    font-size: 10px;
    font-weight: 700;
    color: #38bdf8;
    background: rgba(14, 165, 233, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.3);
    padding: 2px 8px;
    border-radius: 12px;
  }

  .subtitle {
    font-size: 11px;
    color: #94a3b8;
  }

  .header-actions {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .btn-clean {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(180deg, #0f2c4c 0%, #091a2e 100%);
    color: #38bdf8;
    border: 1px solid #1e4d7e;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-clean:hover {
    background: #123760;
    border-color: #38bdf8;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.25);
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 6px;
    border-radius: 6px;
    transition: all 0.15s ease;
  }

  .btn-close:hover {
    color: #ffffff;
    background-color: rgba(255, 255, 255, 0.1);
  }

  /* PHASE FILTER BAR */
  .filter-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 22px;
    background-color: #071222;
    border-bottom: 1px solid #162c4e;
  }

  .tabs-group {
    display: flex;
    gap: 6px;
  }

  .tab-pill {
    background: #0b1a2e;
    color: #94a3b8;
    border: 1px solid #1a365d;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-pill:hover {
    color: #ffffff;
    background: #102644;
    border-color: #38bdf8;
  }

  .tab-pill.active {
    background: linear-gradient(135deg, #0284c7 0%, #1e40af 100%);
    color: #ffffff;
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.35);
  }

  .interactive-tip {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #94a3b8;
  }

  /* EMPTY STATE */
  .empty-state-card {
    display: flex;
    align-items: center;
    gap: 16px;
    padding: 14px 18px;
    margin-bottom: 14px;
    background: linear-gradient(90deg, rgba(14, 165, 233, 0.08) 0%, rgba(30, 64, 175, 0.04) 100%);
    border: 1px solid rgba(56, 189, 248, 0.25);
    border-radius: 8px;
  }

  .empty-icon-wrap {
    width: 44px;
    height: 44px;
    background: rgba(14, 165, 233, 0.12);
    border: 1px solid rgba(56, 189, 248, 0.3);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .empty-content {
    flex: 1;
  }

  .empty-title {
    font-size: 12px;
    font-weight: 700;
    color: #f0f6fc;
    margin-bottom: 3px;
  }

  .empty-desc {
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.4;
  }

  .hotkey-badge {
    color: #38bdf8;
    font-weight: 700;
    font-family: monospace;
  }

  .btn-load-demo {
    display: flex;
    align-items: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7 0%, #2563eb 100%);
    color: #ffffff;
    border: 1px solid #38bdf8;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.3);
    transition: all 0.15s ease;
  }

  .btn-load-demo:hover {
    background: #0ea5e9;
    box-shadow: 0 0 16px rgba(56, 189, 248, 0.6);
    transform: scale(1.02);
  }

  /* MODAL BODY */
  .modal-body {
    padding: 18px 22px 24px;
    overflow-y: auto;
    overflow-x: auto;
  }

  .table-wrapper {
    background-color: #060b14;
    border: 1px solid #1a355d;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6);
  }

  .matrix-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    text-align: center;
  }

  th,
  td {
    padding: 8px 10px;
    border: 1px solid #142745;
  }

  thead th {
    background: linear-gradient(180deg, #0e203c 0%, #091527 100%);
    color: #93c5fd;
    font-weight: 700;
    font-size: 11px;
    user-select: none;
  }

  .th-player {
    text-align: left;
    width: 140px;
    color: #ffffff;
    padding-left: 12px;
  }

  .th-action {
    cursor: pointer;
    transition: all 0.15s ease;
    min-width: 72px;
  }

  .th-action:hover {
    background-color: #163666;
    color: #38bdf8;
  }

  .th-content {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
  }

  .th-icon {
    font-size: 13px;
  }

  .th-label {
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
  }

  .th-total {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    width: 65px;
    cursor: pointer;
    font-weight: 800;
  }

  .th-total:hover {
    background: #0284c7;
    text-decoration: underline;
  }

  .tr-player:hover td {
    background-color: rgba(14, 165, 233, 0.05);
  }

  .td-player {
    text-align: left;
    font-weight: 600;
    color: #f0f6fc;
    background-color: #0b172a;
    cursor: pointer;
    padding-left: 12px;
    transition: all 0.15s ease;
  }

  .td-player:hover {
    color: #38bdf8;
    background-color: #112544;
  }

  .player-cell {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .player-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background-color: #38bdf8;
    box-shadow: 0 0 6px rgba(56, 189, 248, 0.6);
  }

  .player-dot.is-opponent {
    background-color: #ef4444;
    box-shadow: 0 0 6px rgba(239, 68, 68, 0.6);
  }

  .player-name {
    white-space: nowrap;
  }

  .td-cell {
    background-color: #060b14;
    transition: background 0.15s ease;
  }

  .td-cell.has-data {
    background-color: rgba(14, 165, 233, 0.06);
  }

  .cell-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 5px;
    border: 1px solid #38bdf8;
    cursor: pointer;
    font-size: 11px;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.35);
    transition: all 0.15s ease;
  }

  .cell-btn:hover {
    background: #38bdf8;
    color: #060b14;
    transform: scale(1.1);
    box-shadow: 0 0 14px rgba(56, 189, 248, 0.7);
  }

  .cell-play-icon {
    margin-right: 3px;
    opacity: 0.85;
  }

  .cell-zero {
    color: #334e68;
  }

  .td-total {
    background-color: #0b172a;
    font-weight: 700;
  }

  .total-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #38bdf8;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .total-btn:hover {
    color: #ffffff;
    text-shadow: 0 0 8px rgba(56, 189, 248, 0.8);
    transform: scale(1.08);
  }

  .tr-footer {
    background: linear-gradient(180deg, #0e203c 0%, #091527 100%);
    font-weight: 800;
  }

  .td-footer-label {
    text-align: left;
    color: #38bdf8;
    padding-left: 12px;
  }

  .td-footer-cell {
    background-color: #0b172a;
  }

  .col-total-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #38bdf8;
    font-weight: 800;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .col-total-btn:hover {
    color: #ffffff;
    text-shadow: 0 0 8px rgba(56, 189, 248, 0.8);
    transform: scale(1.08);
  }

  .td-grand-total {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    font-weight: 900;
    font-size: 12px;
    text-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
  }

  .grand-total-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    color: #ffffff;
    font-weight: 900;
    cursor: pointer;
    font-size: 12px;
  }

  .grand-total-btn:hover {
    text-shadow: 0 0 12px #ffffff;
    transform: scale(1.1);
  }
</style>

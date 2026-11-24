<script lang="ts">
  import type { VideoTagEvent, TagCategory } from '$lib/types';
  import { X, Play, Download, BarChart2, Table } from 'lucide-svelte';

  interface Props {
    isOpen?: boolean;
    tags: VideoTagEvent[];
    onClose: () => void;
    onPlayClips?: (clips: VideoTagEvent[], title: string) => void;
    onPlayTag?: (tag: VideoTagEvent) => void;
  }

  let { isOpen = true, tags, onClose, onPlayClips, onPlayTag }: Props = $props();

  const PLAYERS = ['#1 Kiper', '#4 Anchor', '#7 Flank Kiri', '#11 Flank Kanan', '#9 Pivot', 'Tim Lawan'];
  const CATEGORIES: Array<{ label: string; cat: TagCategory }> = [
    { label: 'Gol', cat: 'Goal' },
    { label: 'Shot on Target', cat: 'Shot on Target' },
    { label: 'Shot Off', cat: 'Shot Off Target' },
    { label: 'Kick-in', cat: 'Kick-in Set Piece' },
    { label: 'Corner', cat: 'Corner Set Piece' },
    { label: 'Turnover', cat: 'Transition Defense' }, // or outcome Turnover
    { label: 'Pelanggaran', cat: 'Foul' },
  ];

  // Get matching clips for (Player, Category)
  function getClips(player: string, cat: TagCategory): VideoTagEvent[] {
    return tags.filter((t) => {
      const matchP = t.playerLabel === player;
      const matchC = t.category === cat || (cat === 'Transition Defense' && t.outcomeLabel === 'Turnover');
      return matchP && matchC;
    });
  }

  function getPlayerTotal(player: string): VideoTagEvent[] {
    return tags.filter((t) => t.playerLabel === player);
  }

  function getCategoryTotal(cat: TagCategory): VideoTagEvent[] {
    return tags.filter((t) => t.category === cat || (cat === 'Transition Defense' && t.outcomeLabel === 'Turnover'));
  }

  function handleCellClick(player: string, catObj: { label: string; cat: TagCategory }) {
    const clips = getClips(player, catObj.cat);
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
    const clips = getPlayerTotal(player);
    if (clips.length > 0) {
      if (onPlayClips) {
        onPlayClips(clips, `Semua Aksi: ${player} (${clips.length} Klip)`);
      } else if (onPlayTag) {
        onPlayTag(clips[0]);
      }
      onClose();
    }
  }

  function handleColClick(catObj: { label: string; cat: TagCategory }) {
    const clips = getCategoryTotal(catObj.cat);
    if (clips.length > 0) {
      if (onPlayClips) {
        onPlayClips(clips, `Semua Kejadian: ${catObj.label} (${clips.length} Klip)`);
      } else if (onPlayTag) {
        onPlayTag(clips[0]);
      }
      onClose();
    }
  }

  function exportCSV() {
    let csv = 'Pemain,' + CATEGORIES.map((c) => `"${c.label}"`).join(',') + ',TOTAL\n';

    for (const p of PLAYERS) {
      const rowCounts = CATEGORIES.map((c) => getClips(p, c.cat).length);
      const total = getPlayerTotal(p).length;
      csv += `"${p}",` + rowCounts.join(',') + `,${total}\n`;
    }

    const colTotals = CATEGORIES.map((c) => getCategoryTotal(c.cat).length);
    csv += `"TOTAL TIM",` + colTotals.join(',') + `,${tags.length}\n`;

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Matriks_Statistik_Futsal_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
  }
</script>

{#if isOpen}
<div class="modal-backdrop" onclick={onClose} role="presentation">
  <div class="modal-card" onclick={(e) => e.stopPropagation()} role="dialog">
    <!-- MODAL HEADER -->
    <header class="modal-header">
      <div class="flex items-center gap-2">
        <Table size={18} class="text-sky-400" />
        <h2 class="text-sm font-bold text-white tracking-wide">
          MATRIKS SILANG STATISTIK FUTSAL (CROSS-TABULATION)
        </h2>
      </div>

      <div class="flex items-center gap-2">
        <button class="btn-clean" onclick={exportCSV} title="Download CSV">
          <Download size={13} />
          <span>Ekspor CSV</span>
        </button>
        <button class="btn-close" onclick={onClose}>
          <X size={18} />
        </button>
      </div>
    </header>

    <div class="modal-body">
      <p class="text-xs text-slate-400 mb-3">
        💡 <strong>Fitur Interaktif:</strong> Klik pada angka sel mana pun untuk <strong>memutar playlist video</strong> kumpulan momen aksi tersebut secara otomatis!
      </p>

      <!-- MATRIX TABLE -->
      <div class="table-wrapper">
        <table class="matrix-table">
          <thead>
            <tr>
              <th class="th-player">Pemain / Roster</th>
              {#each CATEGORIES as cat}
                <th class="th-action" onclick={() => handleColClick(cat)} title="Klik untuk putar semua {cat.label}">
                  <span class="th-link">{cat.label}</span>
                </th>
              {/each}
              <th class="th-total">TOTAL</th>
            </tr>
          </thead>
          <tbody>
            {#each PLAYERS as player}
              {@const pTotal = getPlayerTotal(player).length}
              <tr>
                <td class="td-player" onclick={() => handleRowClick(player)} title="Klik untuk putar semua aksi {player}">
                  <span class="td-link">{player}</span>
                </td>

                {#each CATEGORIES as cat}
                  {@const count = getClips(player, cat.cat).length}
                  <td class="td-cell">
                    {#if count > 0}
                      <button
                        class="cell-btn"
                        onclick={() => handleCellClick(player, cat)}
                        title="Putar {count} klip {player} - {cat.label}"
                      >
                        <Play size={10} class="mr-1 opacity-70" />
                        <span>{count}</span>
                      </button>
                    {:else}
                      <span class="cell-zero">-</span>
                    {/if}
                  </td>
                {/each}

                <td class="td-total">
                  {#if pTotal > 0}
                    <button class="total-btn" onclick={() => handleRowClick(player)}>
                      {pTotal}
                    </button>
                  {:else}
                    <span class="cell-zero">0</span>
                  {/if}
                </td>
              </tr>
            {/each}

            <!-- FOOTER ROW -->
            <tr class="tr-footer">
              <td class="td-footer-label">TOTAL TIM</td>
              {#each CATEGORIES as cat}
                {@const cTotal = getCategoryTotal(cat.cat).length}
                <td class="td-footer-cell">
                  {#if cTotal > 0}
                    <button class="total-btn" onclick={() => handleColClick(cat)}>
                      {cTotal}
                    </button>
                  {:else}
                    <span class="cell-zero">0</span>
                  {/if}
                </td>
              {/each}
              <td class="td-grand-total">{tags.length}</td>
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
    background-color: rgba(3, 7, 18, 0.85);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .modal-card {
    width: 900px;
    max-width: 94vw;
    background: radial-gradient(circle at 50% 0%, #0f2444 0%, #08101d 100%);
    border: 1px solid #1e3b68;
    border-radius: 14px;
    box-shadow: 0 25px 50px -12px rgba(2, 6, 23, 0.9), 0 0 24px rgba(14, 165, 233, 0.15);
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .modal-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 14px 20px;
    background: linear-gradient(180deg, #102548 0%, #0c1a33 100%);
    border-bottom: 1px solid #1e3b68;
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

  .btn-clean {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0d233a;
    color: #38bdf8;
    border: 1px solid #1e4570;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-clean:hover {
    background-color: #123456;
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.2);
  }

  .modal-body {
    padding: 20px;
    overflow-x: auto;
  }

  .table-wrapper {
    background-color: #060b14;
    border: 1px solid #1a355d;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
  }

  .matrix-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    text-align: center;
  }

  th,
  td {
    padding: 9px 12px;
    border: 1px solid #142745;
  }

  thead th {
    background: linear-gradient(180deg, #0d1e38 0%, #091527 100%);
    color: #93c5fd;
    font-weight: 700;
    font-size: 11px;
    user-select: none;
  }

  .th-player {
    text-align: left;
    width: 130px;
    color: #ffffff;
  }

  .th-action {
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .th-action:hover {
    background-color: #163666;
    color: #38bdf8;
  }

  .th-total {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    width: 60px;
  }

  .td-player {
    text-align: left;
    font-weight: 600;
    color: #f0f6fc;
    background-color: #0b172a;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .td-player:hover {
    color: #38bdf8;
    background-color: #112544;
  }

  .td-cell {
    background-color: #060b14;
  }

  .cell-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: 5px;
    border: 1px solid #38bdf8;
    cursor: pointer;
    font-size: 11px;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.3);
    transition: all 0.15s ease;
  }

  .cell-btn:hover {
    background: #38bdf8;
    color: #060b14;
    transform: scale(1.08);
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.6);
  }

  .cell-zero {
    color: #334e68;
  }

  .td-total {
    background-color: #0b172a;
    font-weight: 700;
  }

  .total-btn {
    background: transparent;
    border: none;
    color: #38bdf8;
    font-weight: 800;
    cursor: pointer;
  }

  .total-btn:hover {
    text-decoration: underline;
  }

  .tr-footer {
    background: linear-gradient(180deg, #0d1e38 0%, #091527 100%);
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

  .td-grand-total {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    font-weight: 900;
    font-size: 12px;
    text-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
  }
</style>

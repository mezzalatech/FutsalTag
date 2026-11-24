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

  let matrixView = $state<'tag_player' | 'tag_label'>('tag_player');
  let activePhaseTab = $state<'all' | 'attack' | 'defense' | 'setpiece' | 'special'>('all');

  const resolvedCategories = $derived.by(() => {
    const base =
      activePhaseTab === 'all'
        ? [...ALL_CATEGORIES]
        : ALL_CATEGORIES.filter((c) => c.phase === activePhaseTab);

    if (activePhaseTab === 'all') {
      const seen = new Set(base.map((c) => c.cat));
      for (const btn of projectStore.activeBoard.buttons) {
        if (btn.kind === 'category' && !seen.has(btn.name)) {
          seen.add(btn.name);
          base.push({
            id: btn.id,
            label: btn.name,
            shortLabel: btn.name,
            icon: btn.continuous ? '●' : '🏷️',
            cat: btn.name as TagCategory,
            phase: 'special',
            color: btn.color,
          });
        }
      }
      for (const t of tags) {
        if (t.category && !seen.has(t.category)) {
          seen.add(t.category);
          base.push({
            id: `cat-${t.category}`,
            label: t.category,
            shortLabel: t.category,
            icon: '🏷️',
            cat: t.category,
            phase: 'special',
            color: t.color || '#38bdf8',
          });
        }
      }
    }
    return base;
  });

  const BASE_PLAYERS = ['#1 Kiper', '#4 Anchor', '#7 Flank Kiri', '#11 Flank Kanan', '#9 Pivot', 'Tim Lawan'];

  // Dynamically resolve roster: default starting 5 + Tim Lawan + any custom/substitute players in tags
  const resolvedPlayers = $derived.by(() => {
    const list = [...BASE_PLAYERS];
    for (const t of tags) {
      const allTagPlayers =
        t.playersInvolved && t.playersInvolved.length > 0
          ? t.playersInvolved
          : t.playerLabel
            ? [t.playerLabel]
            : [];
      for (const rawP of allTagPlayers) {
        const norm = normalizePlayerLabel(rawP);
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
    if (normalizePlayerLabel(tag.playerLabel || '') === player) return true;
    return Boolean(tag.playersInvolved?.some((p) => normalizePlayerLabel(p) === player));
  }

  function matchesCategory(tag: VideoTagEvent, catObj: MatrixCategory): boolean {
    return tag.category === catObj.cat;
  }

  function sumDurationSec(clips: VideoTagEvent[]): number {
    return clips.reduce((acc, c) => acc + Math.max(0, c.endTime - c.startTime), 0);
  }

  function formatPhaseDuration(clips: VideoTagEvent[]): string {
    const sec = sumDurationSec(clips);
    if (sec <= 0) return '0s';
    if (sec < 60) return `${sec.toFixed(1)}s`;
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s}s`;
  }

  // Get matching clips for (Player, Category)
  function getClips(player: string, catObj: MatrixCategory): VideoTagEvent[] {
    return tags.filter((t) => matchesPlayer(t, player) && matchesCategory(t, catObj));
  }

  function getPlayerRowTotal(player: string): VideoTagEvent[] {
    return tags.filter((t) => matchesPlayer(t, player) && resolvedCategories.some((c) => matchesCategory(t, c)));
  }

  function getCategoryColTotal(catObj: MatrixCategory): VideoTagEvent[] {
    return tags.filter((t) => matchesCategory(t, catObj) && resolvedPlayers.some((p) => matchesPlayer(t, p)));
  }

  const grandVisibleTotalClips = $derived(
    tags.filter(
      (t) =>
        resolvedCategories.some((c) => matchesCategory(t, c)) &&
        resolvedPlayers.some((p) => matchesPlayer(t, p))
    )
  );

  // TAG x LABEL (DESCRIPTOR) VIEW COMPUTATIONS
  const labelRows = $derived.by(() => {
    const set = new Set<string>();
    for (const t of tags) {
      if (t.category) set.add(t.category);
    }
    return Array.from(set);
  });

  const labelColumns = $derived.by(() => {
    const set = new Set<string>();
    let hasUnlabeled = false;
    for (const t of tags) {
      if (t.labels && t.labels.length > 0) {
        for (const l of t.labels) {
          set.add(l.name);
        }
      } else {
        hasUnlabeled = true;
      }
    }
    const cols = Array.from(set);
    if (hasUnlabeled) cols.push('Tanpa Label');
    return cols;
  });

  function getTagLabelClips(category: string, labelName: string): VideoTagEvent[] {
    return tags.filter((t) => {
      if (t.category !== category) return false;
      if (labelName === 'Tanpa Label') return !t.labels || t.labels.length === 0;
      return Boolean(t.labels?.some((l) => l.name === labelName));
    });
  }

  function getTagLabelRowClips(category: string): VideoTagEvent[] {
    return tags.filter((t) => t.category === category);
  }

  function getTagLabelColClips(labelName: string): VideoTagEvent[] {
    return tags.filter((t) => {
      if (labelName === 'Tanpa Label') return !t.labels || t.labels.length === 0;
      return Boolean(t.labels?.some((l) => l.name === labelName));
    });
  }

  function handleTagLabelCellClick(category: string, labelName: string) {
    const clips = getTagLabelClips(category, labelName);
    if (clips.length > 0) {
      if (onPlayClips) {
        onPlayClips(clips, `${category} × ${labelName} (${clips.length} Klip)`);
      } else if (onPlayTag) {
        onPlayTag(clips[0]);
      }
      onClose();
    }
  }

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
    const allClips = grandVisibleTotalClips;
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
    let csv = '';
    if (matrixView === 'tag_label') {
      csv = 'Tag / Fase,' + labelColumns.map((l) => `"${l}"`).join(',') + ',TOTAL KLIP,DURASI (dtk)\n';
      for (const cat of labelRows) {
        const rowCounts = labelColumns.map((lbl) => getTagLabelClips(cat, lbl).length);
        const rowClips = getTagLabelRowClips(cat);
        csv += `"${cat}",` + rowCounts.join(',') + `,${rowClips.length},${sumDurationSec(rowClips).toFixed(1)}\n`;
      }
      const colTotals = labelColumns.map((lbl) => getTagLabelColClips(lbl).length);
      csv += `"TOTAL",` + colTotals.join(',') + `,${tags.length},${sumDurationSec(tags).toFixed(1)}\n`;
    } else {
      csv = 'Pemain,' + resolvedCategories.map((c) => `"${c.label}"`).join(',') + ',TOTAL,DURASI (dtk)\n';
      for (const p of resolvedPlayers) {
        const rowCounts = resolvedCategories.map((c) => getClips(p, c).length);
        const rowClips = getPlayerRowTotal(p);
        csv += `"${p}",` + rowCounts.join(',') + `,${rowClips.length},${sumDurationSec(rowClips).toFixed(1)}\n`;
      }
      const colTotals = resolvedCategories.map((c) => getCategoryColTotal(c).length);
      csv += `"TOTAL TIM",` + colTotals.join(',') + `,${tags.length},${sumDurationSec(tags).toFixed(1)}\n`;
    }

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

    <!-- MATRIX VIEW & PHASE FILTER BAR -->
    <div class="filter-bar">
      <div class="tabs-group">
        <div class="view-mode-switch">
          <button
            class="tab-pill"
            class:active={matrixView === 'tag_player'}
            onclick={() => (matrixView = 'tag_player')}
          >
            Tag × Pemain
          </button>
          <button
            class="tab-pill"
            class:active={matrixView === 'tag_label'}
            onclick={() => (matrixView = 'tag_label')}
          >
            Tag × Label
          </button>
        </div>
        {#if matrixView === 'tag_player'}
          {#each PHASES as ph}
            <button
              class="tab-pill"
              class:active={activePhaseTab === ph.id}
              onclick={() => (activePhaseTab = ph.id)}
            >
              <span>{ph.label}</span>
            </button>
          {/each}
        {/if}
      </div>

      <div class="interactive-tip">
        <Sparkles size={13} class="text-amber-400" />
        <span>Klik sel angka untuk putar klip · menampilkan jumlah & total durasi fase</span>
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
        {#if matrixView === 'tag_player'}
          <table class="matrix-table">
            <thead>
              <tr>
                <th class="th-player">
                  <div class="flex items-center gap-1.5">
                    <Layers size={13} class="text-sky-400" />
                    <span>Pemain / Roster</span>
                  </div>
                </th>
                {#each resolvedCategories as cat}
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

                  {#each resolvedCategories as cat}
                    {@const clips = getClips(player, cat)}
                    {@const count = clips.length}
                    <td class="td-cell" class:has-data={count > 0}>
                      {#if count > 0}
                        <button
                          class="cell-btn"
                          onclick={() => handleCellClick(player, cat)}
                          title="Putar {count} klip {player} - {cat.label} ({formatPhaseDuration(clips)})"
                        >
                          <Play size={10} />
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
                        <Play size={10} />
                        <span>{pTotal}</span>
                      </button>
                      <div class="phase-dur-hint">{formatPhaseDuration(pRowClips)}</div>
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
                {#each resolvedCategories as cat}
                  {@const cClips = getCategoryColTotal(cat)}
                  {@const cTotal = cClips.length}
                  <td class="td-footer-cell">
                    {#if cTotal > 0}
                      <button
                        class="col-total-btn"
                        onclick={() => handleColClick(cat)}
                        title="Putar semua {cTotal} klip {cat.label}"
                      >
                        <Play size={10} />
                        <span>{cTotal}</span>
                      </button>
                      <div class="phase-dur-hint">{formatPhaseDuration(cClips)}</div>
                    {:else}
                      <span class="cell-zero">0</span>
                    {/if}
                  </td>
                {/each}
                <td class="td-grand-total">
                  {#if grandVisibleTotalClips.length > 0}
                    <button
                      class="grand-total-btn"
                      onclick={handlePlayAll}
                      title="Putar playlist semua {grandVisibleTotalClips.length} klip matriks"
                    >
                      <Play size={11} />
                      <span>{grandVisibleTotalClips.length}</span>
                    </button>
                    <div class="phase-dur-hint grand">{formatPhaseDuration(grandVisibleTotalClips)}</div>
                  {:else}
                    <span>0</span>
                  {/if}
                </td>
              </tr>
            </tbody>
          </table>
        {:else}
          <!-- TAG x LABEL (DESCRIPTOR) CROSS-TABULATION -->
          <table class="matrix-table">
            <thead>
              <tr>
                <th class="th-player">Tag / Fase</th>
                {#each labelColumns as lbl}
                  <th
                    class="th-action"
                    onclick={() => {
                      const clips = getTagLabelColClips(lbl);
                      if (clips.length > 0 && onPlayClips) {
                        onPlayClips(clips, `Label: ${lbl} (${clips.length} Klip)`);
                        onClose();
                      }
                    }}
                    title="Putar semua klip dengan label {lbl}"
                  >
                    <span class="th-label">{lbl}</span>
                  </th>
                {/each}
                <th class="th-total" onclick={handlePlayAll}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {#if labelRows.length === 0}
                <tr>
                  <td colspan={Math.max(2, labelColumns.length + 2)} class="cell-zero">
                    Belum ada klip dan label untuk disilangkan.
                  </td>
                </tr>
              {:else}
                {#each labelRows as cat}
                  {@const rowClips = getTagLabelRowClips(cat)}
                  <tr class="tr-player">
                    <td
                      class="td-player"
                      onclick={() => {
                        if (rowClips.length > 0 && onPlayClips) {
                          onPlayClips(rowClips, `${cat} (${rowClips.length} Klip)`);
                          onClose();
                        }
                      }}
                    >
                      <span class="player-name">{cat}</span>
                    </td>
                    {#each labelColumns as lbl}
                      {@const cellClips = getTagLabelClips(cat, lbl)}
                      <td class="td-cell" class:has-data={cellClips.length > 0}>
                        {#if cellClips.length > 0}
                          <button
                            class="cell-btn"
                            onclick={() => handleTagLabelCellClick(cat, lbl)}
                            title="Putar {cellClips.length} klip {cat} × {lbl} ({formatPhaseDuration(cellClips)})"
                          >
                            <Play size={10} />
                            <span>{cellClips.length}</span>
                          </button>
                        {:else}
                          <span class="cell-zero">-</span>
                        {/if}
                      </td>
                    {/each}
                    <td class="td-total">
                      <span class="total-btn">{rowClips.length}</span>
                      <div class="phase-dur-hint">{formatPhaseDuration(rowClips)}</div>
                    </td>
                  </tr>
                {/each}
                <tr class="tr-footer">
                  <td class="td-footer-label">TOTAL LABEL</td>
                  {#each labelColumns as lbl}
                    {@const colClips = getTagLabelColClips(lbl)}
                    <td class="td-footer-cell">
                      <span class="col-total-btn">{colClips.length}</span>
                      <div class="phase-dur-hint">{formatPhaseDuration(colClips)}</div>
                    </td>
                  {/each}
                  <td class="td-grand-total">
                    <span>{tags.length}</span>
                    <div class="phase-dur-hint grand">{formatPhaseDuration(tags)}</div>
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        {/if}
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
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .view-mode-switch {
    display: flex;
    gap: 4px;
    padding-right: 8px;
    border-right: 1px solid #1e3b68;
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

  .phase-dur-hint {
    font-family: monospace;
    font-size: 9px;
    font-weight: 700;
    color: #94a3b8;
    margin-top: 2px;
  }

  .phase-dur-hint.grand {
    color: #e0f2fe;
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

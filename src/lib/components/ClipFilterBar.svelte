<script lang="ts">
  import { projectStore, isTauriDesktop } from '$lib/stores/projectStore.svelte';
  import type { TelestrationFilterMode } from '$lib/types';
  import { FolderOpen, RefreshCw, Search, Sparkles, RotateCcw, Film } from 'lucide-svelte';

  interface Props {
    compact?: boolean;
    onFilterChange?: () => void;
  }

  let { compact = false, onFilterChange }: Props = $props();
  let browserFilesEl = $state<HTMLInputElement | null>(null);

  const matchSources = $derived(projectStore.getAllMatchSources());
  const selectedSources = $derived(
    matchSources.filter(
      (m) => projectStore.clipFilter.matchIds.length === 0 || projectStore.clipFilter.matchIds.includes(m.id)
    )
  );

  const availableTags = $derived.by(() => {
    const counts = new Map<string, { count: number; color: string }>();
    for (const m of selectedSources) {
      for (const t of m.tags) {
        const cur = counts.get(t.category);
        counts.set(t.category, { count: (cur?.count ?? 0) + 1, color: cur?.color || t.color || '#38bdf8' });
      }
    }
    return Array.from(counts.entries()).map(([name, meta]) => ({ name, ...meta }));
  });

  const availableLabels = $derived.by(() => {
    const counts = new Map<string, number>();
    let unlabeled = 0;
    for (const m of selectedSources) {
      for (const t of m.tags) {
        if (!t.labels || t.labels.length === 0) {
          unlabeled += 1;
        } else {
          for (const l of t.labels) {
            counts.set(l.name, (counts.get(l.name) ?? 0) + 1);
          }
        }
      }
    }
    const items = Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
    if (unlabeled > 0) items.push({ name: 'Tanpa Label', count: unlabeled });
    return items;
  });

  const availablePlayers = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const m of selectedSources) {
      for (const t of m.tags) {
        const raw =
          t.playersInvolved && t.playersInvolved.length > 0
            ? t.playersInvolved
            : t.playerLabel
              ? [t.playerLabel]
              : [];
        const unique = new Set(raw.map((p) => projectStore.normalizePlayerLabel(p)));
        for (const p of unique) {
          counts.set(p, (counts.get(p) ?? 0) + 1);
        }
      }
    }
    return Array.from(counts.entries()).map(([name, count]) => ({ name, count }));
  });

  const hasActiveFilter = $derived(
    projectStore.clipFilter.matchIds.length > 0 ||
      projectStore.clipFilter.categories.length > 0 ||
      projectStore.clipFilter.labels.length > 0 ||
      projectStore.clipFilter.players.length > 0 ||
      projectStore.clipFilter.telestration !== 'all' ||
      projectStore.clipFilter.searchQuery.trim().length > 0 ||
      Object.keys(projectStore.clipExcludedKeys).length > 0
  );

  const folderDisplay = $derived.by(() => {
    const p = projectStore.matchLibraryFolder;
    if (!p) return 'Folder Pustaka Default';
    const parts = p.split(/[\\/]/).filter(Boolean);
    return parts.slice(-2).join('/');
  });

  async function handlePickFolder() {
    if (isTauriDesktop()) {
      await projectStore.pickMatchLibraryFolder();
      onFilterChange?.();
    } else {
      browserFilesEl?.click();
    }
  }

  async function handleRescan() {
    await projectStore.scanMatchLibrary();
    onFilterChange?.();
  }

  function handleBrowserFiles(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    if (input.files?.length) {
      projectStore.addBrowserMatchFiles(input.files);
      setTimeout(() => onFilterChange?.(), 80);
    }
    input.value = '';
  }

  function toggleFilter(field: 'matchIds' | 'categories' | 'labels' | 'players', val: string) {
    projectStore.toggleClipFilter(field, val);
    onFilterChange?.();
  }

  function setTelMode(mode: TelestrationFilterMode) {
    projectStore.setTelestrationFilter(mode);
    onFilterChange?.();
  }

  function toggleGlobalTel() {
    projectStore.setAllClipsTelestration(!projectStore.globalIncludeTelestration);
    onFilterChange?.();
  }

  function handleReset() {
    projectStore.resetClipFilter();
    onFilterChange?.();
  }
</script>

<div class="clip-filter-bar" class:compact>
  <input
    bind:this={browserFilesEl}
    type="file"
    accept=".futsal,.json"
    multiple
    class="hidden-input"
    onchange={handleBrowserFiles}
  />

  <!-- ROW 1: PUSTAKA FOLDER & PERTANDINGAN -->
  <div class="cfb-row">
    <div class="cfb-group-lbl">PUSTAKA</div>
    <button type="button" class="cfb-btn" onclick={handlePickFolder} title={projectStore.matchLibraryFolder || 'Pilih folder pustaka .futsal'}>
      <FolderOpen size={12} />
      <span>{folderDisplay}</span>
    </button>
    {#if isTauriDesktop()}
      <button type="button" class="cfb-btn" onclick={handleRescan} disabled={projectStore.matchLibraryLoading} title="Scan ulang folder pustaka .futsal">
        <RefreshCw size={12} class={projectStore.matchLibraryLoading ? 'spin' : ''} />
        <span>{projectStore.matchLibraryLoading ? 'Scan...' : 'Scan'}</span>
      </button>
    {/if}
    <div class="cfb-chips-scroll">
      {#each matchSources as m (m.id)}
        <button
          type="button"
          class="cfb-chip match-chip"
          class:active={projectStore.clipFilter.matchIds.includes(m.id)}
          onclick={() => toggleFilter('matchIds', m.id)}
          title={m.filePath || m.title}
        >
          <span>{m.id === '__active__' ? `Aktif · ${m.title}` : m.title}</span>
          <span class="chip-cnt">{m.tags.length}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- ROW 2: CARI, STATUS TELESTRASI, TOGGLE OUTPUT GLOBAL -->
  <div class="cfb-row">
    <div class="cfb-search">
      <Search size={12} />
      <input
        type="text"
        bind:value={projectStore.clipFilter.searchQuery}
        oninput={() => onFilterChange?.()}
        placeholder="Cari tag, label, pemain, pertandingan..."
      />
    </div>

    <div class="cfb-seg">
      <button type="button" class:active={projectStore.clipFilter.telestration === 'all'} onclick={() => setTelMode('all')}>
        Semua
      </button>
      <button type="button" class:active={projectStore.clipFilter.telestration === 'with_telestration'} onclick={() => setTelMode('with_telestration')}>
        Ada Telestrasi
      </button>
      <button type="button" class:active={projectStore.clipFilter.telestration === 'without_telestration'} onclick={() => setTelMode('without_telestration')}>
        Polos
      </button>
    </div>

    <button
      type="button"
      class="cfb-btn output-toggle"
      class:tel-on={projectStore.globalIncludeTelestration}
      onclick={toggleGlobalTel}
      title="Setel semua klip tampil/ekspor dengan telestrasi atau video polos"
    >
      {#if projectStore.globalIncludeTelestration}
        <Sparkles size={12} />
        <span>Output: Telestrasi</span>
      {:else}
        <Film size={12} />
        <span>Output: Polos</span>
      {/if}
    </button>

    {#if hasActiveFilter}
      <button type="button" class="cfb-btn reset-btn" onclick={handleReset}>
        <RotateCcw size={12} />
        <span>Reset</span>
      </button>
    {/if}
  </div>

  <!-- ROW 3: TAG, LABEL & PEMAIN -->
  {#if availableTags.length > 0}
    <div class="cfb-row">
      <div class="cfb-group-lbl">TAG</div>
      <div class="cfb-chips-scroll">
        {#each availableTags as t (t.name)}
          <button
            type="button"
            class="cfb-chip"
            class:active={projectStore.clipFilter.categories.includes(t.name)}
            onclick={() => toggleFilter('categories', t.name)}
          >
            <span class="chip-dot" style="background-color: {t.color};"></span>
            <span>{t.name}</span>
            <span class="chip-cnt">{t.count}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if availableLabels.length > 0}
    <div class="cfb-row">
      <div class="cfb-group-lbl">LABEL</div>
      <div class="cfb-chips-scroll">
        {#each availableLabels as l (l.name)}
          <button
            type="button"
            class="cfb-chip"
            class:active={projectStore.clipFilter.labels.includes(l.name)}
            onclick={() => toggleFilter('labels', l.name)}
          >
            <span>{l.name}</span>
            <span class="chip-cnt">{l.count}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  {#if availablePlayers.length > 0}
    <div class="cfb-row">
      <div class="cfb-group-lbl">PEMAIN</div>
      <div class="cfb-chips-scroll">
        {#each availablePlayers as p (p.name)}
          <button
            type="button"
            class="cfb-chip"
            class:active={projectStore.clipFilter.players.includes(p.name)}
            onclick={() => toggleFilter('players', p.name)}
          >
            <span>{p.name}</span>
            <span class="chip-cnt">{p.count}</span>
          </button>
        {/each}
      </div>
    </div>
  {/if}
</div>

<style>
  .hidden-input {
    display: none;
  }

  .clip-filter-bar {
    background: #081020;
    border: 1px solid #163056;
    border-radius: 10px;
    padding: 10px 12px;
    display: flex;
    flex-direction: column;
    gap: 7px;
  }

  .clip-filter-bar.compact {
    border-radius: 0;
    border-left: none;
    border-right: none;
    background: #050c19;
    padding: 8px 14px;
    gap: 6px;
  }

  .cfb-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .cfb-group-lbl {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.08em;
    color: #38bdf8;
    min-width: 48px;
    flex-shrink: 0;
  }

  .cfb-chips-scroll {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .cfb-btn,
  .cfb-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0f172a;
    border: 1px solid #243b61;
    color: #cbd5e1;
    font-size: 10.5px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .cfb-btn:hover,
  .cfb-chip:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .cfb-chip.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .cfb-chip.match-chip {
    max-width: 100%;
    overflow: hidden;
  }

  .cfb-chip.match-chip span:first-child {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    min-width: 0;
  }

  .cfb-chip.match-chip.active {
    background: #0f766e;
    border-color: #2dd4bf;
  }

  .chip-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .chip-cnt {
    font-size: 9.5px;
    opacity: 0.78;
    background: rgba(15, 23, 42, 0.55);
    padding: 0 4px;
    border-radius: 4px;
  }

  .cfb-search {
    flex: 1;
    min-width: 120px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0f172a;
    border: 1px solid #243b61;
    border-radius: 6px;
    padding: 4px 8px;
    color: #64748b;
  }

  .cfb-search input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #f8fafc;
    font-size: 11px;
  }

  .cfb-seg {
    display: inline-flex;
    background: #0f172a;
    border: 1px solid #243b61;
    border-radius: 6px;
    overflow: hidden;
  }

  .cfb-seg button {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 10.5px;
    font-weight: 700;
    padding: 4px 8px;
    cursor: pointer;
  }

  .cfb-seg button.active {
    background: #0284c7;
    color: #ffffff;
  }

  .output-toggle.tel-on {
    border-color: #38bdf8;
    color: #38bdf8;
    background: rgba(2, 132, 199, 0.16);
  }

  .reset-btn {
    border-color: #7f1d1d;
    color: #fca5a5;
  }

  :global(.spin) {
    animation: cfb-spin 0.9s linear infinite;
  }

  @keyframes cfb-spin {
    to {
      transform: rotate(360deg);
    }
  }
</style>

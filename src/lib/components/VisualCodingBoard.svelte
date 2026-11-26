<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { isTauriDesktop } from '$lib/stores/projectStore.svelte';
  import { getContrastTextColor } from '$lib/tagging/momenBoards';
  import type {
    TaggingBoard,
    TaggingButton,
    TaggingButtonKind,
    TaggingButtonShape,
  } from '$lib/types';
  import {
    ArrowLeft,
    Copy,
    Download,
    Eye,
    EyeOff,
    FolderPlus,
    Grid,
    Link2,
    MousePointer,
    Plus,
    Trash2,
    Upload,
    X,
    Lock,
    Unlock,
  } from 'lucide-svelte';

  interface Props {
    board: TaggingBoard;
    boards: TaggingBoard[];
    initialSelectedButtonId?: string | null;
    onSelectBoard: (id: string) => void;
    onCreateBoard: () => void;
    onDuplicateBoard?: () => void;
    onDeleteBoard?: (id: string) => void;
    onToggleBoardLock?: () => void;
    onUpdateBoardMeta: (patch: { name?: string; background?: 'pitch' | 'plain'; color?: string }) => void;
    onImportBoardJson: (jsonStr: string) => void;
    onExportBoardJson: () => void;
    onUpsertButton: (btn: TaggingButton) => void;
    onDeleteButton: (id: string) => void;
    onToggleLink: (sourceId: string, targetId: string) => void;
    onBackToVideo: () => void;
  }

  let {
    board,
    boards,
    initialSelectedButtonId = null,
    onSelectBoard,
    onCreateBoard,
    onDuplicateBoard,
    onDeleteBoard,
    onToggleBoardLock,
    onUpdateBoardMeta,
    onImportBoardJson,
    onExportBoardJson,
    onUpsertButton,
    onDeleteButton,
    onToggleLink,
    onBackToVideo,
  }: Props = $props();

  const COLOR_PRESETS = [
    '#0284c7',
    '#059669',
    '#dc2626',
    '#d97706',
    '#7c3aed',
    '#db2777',
    '#0d9488',
    '#4f46e5',
    '#475569',
    '#ca8a04',
  ];

  let toolMode = $state<'select' | 'link'>('select');
  let showLinks = $state(true);
  let selectedButtonId = $state<string | null>(null);
  let linkStartBtnId = $state<string | null>(null);
  let linkPointerSvg = $state<{ x: number; y: number } | null>(null);
  let hoveredBtnId = $state<string | null>(null);
  let canvasEl = $state<HTMLDivElement | null>(null);
  let fileInputEl = $state<HTMLInputElement | undefined>(undefined);

  // Live drag / resize preview so dragging stays 60fps without mutating store on every pixel
  let dragPreview = $state<{ id: string; x: number; y: number; w: number; h: number } | null>(null);

  $effect(() => {
    if (initialSelectedButtonId) {
      selectedButtonId = initialSelectedButtonId;
    }
  });

  $effect(() => {
    // Keep selection valid if board switched
    if (selectedButtonId && !board.buttons.some((b) => b.id === selectedButtonId)) {
      selectedButtonId = null;
    }
  });

  onMount(() => {
    function onKeyDown(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key.toLowerCase() === 'v') {
        toolMode = 'select';
        linkStartBtnId = null;
        linkPointerSvg = null;
      } else if (e.key.toLowerCase() === 'l') {
        toolMode = 'link';
      } else if (e.key === 'Escape') {
        if (linkStartBtnId) {
          linkStartBtnId = null;
          linkPointerSvg = null;
        } else {
          selectedButtonId = null;
        }
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  });

  const canvasButtons = $derived(board.buttons.filter((b) => b.w > 0 && b.h > 0));
  const poolButtons = $derived(board.buttons.filter((b) => b.w <= 0 || b.h <= 0));
  const categoryButtons = $derived(board.buttons.filter((b) => b.kind === 'category'));
  const selectedBtn = $derived(
    selectedButtonId ? board.buttons.find((b) => b.id === selectedButtonId) || null : null
  );

  const existingExclusionGroups = $derived(
    Array.from(
      new Set(
        categoryButtons
          .map((b) => b.exclusionGroup)
          .filter((g): g is string => Boolean(g && g.trim()))
      )
    )
  );

  const canvasW = $derived(Math.max(1000, ...canvasButtons.map((b) => b.x + b.w + 40)));
  const canvasH = $derived(Math.max(580, ...canvasButtons.map((b) => b.y + b.h + 40)));

  function getButtonGeom(btn: TaggingButton) {
    if (dragPreview && dragPreview.id === btn.id) {
      return dragPreview;
    }
    return { id: btn.id, x: btn.x, y: btn.y, w: btn.w, h: btn.h };
  }

  function getButtonCenter(btn: TaggingButton) {
    const g = getButtonGeom(btn);
    return { x: g.x + g.w / 2, y: g.y + g.h / 2 };
  }

  interface ConnectionLine {
    key: string;
    a: TaggingButton;
    b: TaggingButton;
    ax: number;
    ay: number;
    bx: number;
    by: number;
    type: 'link' | 'forTag';
    highlighted: boolean;
  }

  const connectionLines = $derived.by<ConnectionLine[]>(() => {
    if (!showLinks) return [];
    const lines: ConnectionLine[] = [];
    const seenPairs = new Set<string>();
    const byId = new Map(canvasButtons.map((b) => [b.id, b]));

    // 1. Tag <-> Tag Links
    for (const a of canvasButtons) {
      if (a.kind !== 'category') continue;
      for (const targetId of a.links) {
        const b = byId.get(targetId);
        if (!b) continue;
        const pairKey = a.id < b.id ? `link:${a.id}::${b.id}` : `link:${b.id}::${a.id}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const ca = getButtonCenter(a);
        const cb = getButtonCenter(b);
        lines.push({
          key: pairKey,
          a,
          b,
          ax: ca.x,
          ay: ca.y,
          bx: cb.x,
          by: cb.y,
          type: 'link',
          highlighted:
            toolMode === 'link' ||
            selectedButtonId === a.id ||
            selectedButtonId === b.id,
        });
      }
    }

    // 2. Descriptor -> Category (forTags)
    for (const desc of canvasButtons) {
      if (desc.kind !== 'descriptor') continue;
      for (const catId of desc.forTags) {
        const cat = byId.get(catId);
        if (!cat) continue;
        const pairKey = `forTag:${desc.id}::${cat.id}`;
        if (seenPairs.has(pairKey)) continue;
        seenPairs.add(pairKey);
        const ca = getButtonCenter(desc);
        const cb = getButtonCenter(cat);
        lines.push({
          key: pairKey,
          a: desc,
          b: cat,
          ax: ca.x,
          ay: ca.y,
          bx: cb.x,
          by: cb.y,
          type: 'forTag',
          highlighted:
            toolMode === 'link' ||
            selectedButtonId === desc.id ||
            selectedButtonId === cat.id,
        });
      }
    }

    return lines;
  });

  const linkStartBtn = $derived(
    linkStartBtnId ? canvasButtons.find((b) => b.id === linkStartBtnId) || null : null
  );

  function snap4(val: number): number {
    return Math.round(val / 4) * 4;
  }

  function clientToSvg(clientX: number, clientY: number) {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * canvasW,
      y: ((clientY - rect.top) / rect.height) * canvasH,
    };
  }

  function findNonOverlappingSlot(kind: TaggingButtonKind): { x: number; y: number } {
    const idx = canvasButtons.length;
    const cols = 6;
    const w = kind === 'category' ? 140 : 108;
    const h = kind === 'category' ? 68 : 48;
    for (let tryIdx = idx; tryIdx < idx + 40; tryIdx++) {
      const col = tryIdx % cols;
      const row = Math.floor(tryIdx / cols);
      const x = 24 + col * 156;
      const y = (kind === 'descriptor' ? 240 : 24) + row * 82;
      const overlaps = canvasButtons.some(
        (b) => x < b.x + b.w + 8 && x + w + 8 > b.x && y < b.y + b.h + 8 && y + h + 8 > b.y
      );
      if (!overlaps) return { x, y };
    }
    return { x: 32 + (idx % 5) * 40, y: 32 + (idx % 5) * 32 };
  }

  function handleAddNewButton(kind: TaggingButtonKind) {
    const slot = findNonOverlappingSlot(kind);
    const id = `${kind === 'category' ? 'TAG' : 'LBL'}_${Date.now().toString(36).toUpperCase()}`;
    const btn: TaggingButton = {
      id,
      name: kind === 'category' ? 'TAG BARU' : 'Label Baru',
      kind,
      hotkey: null,
      color: kind === 'category' ? '#0284c7' : '#f59e0b',
      x: slot.x,
      y: slot.y,
      w: kind === 'category' ? 140 : 108,
      h: kind === 'category' ? 68 : 48,
      leadSec: kind === 'category' ? 2 : 0,
      lagSec: kind === 'category' ? 3 : 0,
      continuous: kind === 'category',
      shape: kind === 'category' ? 'rounded' : 'circle',
      forTags: [],
      links: [],
      exclusionGroup: null,
      group: null,
      autoAdd: false,
    };
    onUpsertButton(btn);
    selectedButtonId = btn.id;
    toolMode = 'select';
  }

  function duplicateSelected() {
    if (!selectedBtn) return;
    const id = `${selectedBtn.kind === 'category' ? 'TAG' : 'LBL'}_${Date.now().toString(36).toUpperCase()}`;
    const copy: TaggingButton = {
      ...selectedBtn,
      id,
      name: `${selectedBtn.name} (Salin)`,
      hotkey: null,
      x: selectedBtn.w > 0 ? selectedBtn.x + 24 : 24,
      y: selectedBtn.h > 0 ? selectedBtn.y + 24 : 24,
      forTags: [...selectedBtn.forTags],
      links: [],
    };
    onUpsertButton(copy);
    selectedButtonId = copy.id;
  }

  function patchSelected(patch: Partial<TaggingButton>) {
    if (!selectedBtn) return;
    onUpsertButton({
      ...selectedBtn,
      ...patch,
      forTags: patch.forTags ? [...patch.forTags] : [...selectedBtn.forTags],
      links: patch.links ? [...patch.links] : [...selectedBtn.links],
    });
  }

  function handleNodePointerDown(e: PointerEvent, btn: TaggingButton) {
    e.stopPropagation();
    selectedButtonId = btn.id;

    if (toolMode === 'link') {
      if (linkStartBtnId && linkStartBtnId !== btn.id) {
        onToggleLink(linkStartBtnId, btn.id);
        linkStartBtnId = null;
        linkPointerSvg = null;
        return;
      }

      const startId = btn.id;
      linkStartBtnId = startId;
      linkPointerSvg = clientToSvg(e.clientX, e.clientY);

      function onLinkMove(ev: PointerEvent) {
        linkPointerSvg = clientToSvg(ev.clientX, ev.clientY);
        const pt = linkPointerSvg;
        const hit = canvasButtons.find(
          (cand) =>
            cand.id !== startId &&
            pt.x >= cand.x &&
            pt.x <= cand.x + cand.w &&
            pt.y >= cand.y &&
            pt.y <= cand.y + cand.h
        );
        hoveredBtnId = hit?.id || null;
      }

      function onLinkUp(ev: PointerEvent) {
        window.removeEventListener('pointermove', onLinkMove);
        window.removeEventListener('pointerup', onLinkUp);
        const pt = clientToSvg(ev.clientX, ev.clientY);
        const hit = canvasButtons.find(
          (cand) =>
            cand.id !== startId &&
            pt.x >= cand.x &&
            pt.x <= cand.x + cand.w &&
            pt.y >= cand.y &&
            pt.y <= cand.y + cand.h
        );
        if (hit) {
          onToggleLink(startId, hit.id);
          linkStartBtnId = null;
          linkPointerSvg = null;
          hoveredBtnId = null;
        }
      }

      window.addEventListener('pointermove', onLinkMove);
      window.addEventListener('pointerup', onLinkUp);
      return;
    }

    // Select & Drag (x, y)
    const startPt = clientToSvg(e.clientX, e.clientY);
    const origX = btn.x;
    const origY = btn.y;
    const origW = btn.w;
    const origH = btn.h;
    let moved = false;

    function onMove(ev: PointerEvent) {
      const curPt = clientToSvg(ev.clientX, ev.clientY);
      const dx = curPt.x - startPt.x;
      const dy = curPt.y - startPt.y;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) moved = true;
      dragPreview = {
        id: btn.id,
        x: Math.max(0, snap4(origX + dx)),
        y: Math.max(0, snap4(origY + dy)),
        w: origW,
        h: origH,
      };
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (moved && dragPreview && dragPreview.id === btn.id) {
        onUpsertButton({
          ...btn,
          x: dragPreview.x,
          y: dragPreview.y,
        });
      }
      dragPreview = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function handleResizePointerDown(e: PointerEvent, btn: TaggingButton) {
    e.stopPropagation();
    e.preventDefault();
    selectedButtonId = btn.id;
    const startPt = clientToSvg(e.clientX, e.clientY);
    const origW = btn.w;
    const origH = btn.h;

    function onMove(ev: PointerEvent) {
      const curPt = clientToSvg(ev.clientX, ev.clientY);
      dragPreview = {
        id: btn.id,
        x: btn.x,
        y: btn.y,
        w: Math.max(56, snap4(origW + (curPt.x - startPt.x))),
        h: Math.max(32, snap4(origH + (curPt.y - startPt.y))),
      };
    }

    function onUp() {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      if (dragPreview && dragPreview.id === btn.id) {
        onUpsertButton({
          ...btn,
          w: dragPreview.w,
          h: dragPreview.h,
        });
      }
      dragPreview = null;
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  async function handleImportClick() {
    if (isTauriDesktop()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          title: 'Impor Papan Tagging Momen (.momen.json / .json)',
          multiple: false,
          filters: [{ name: 'Momen / JSON', extensions: ['json', 'momen'] }],
        });
        if (!selected || typeof selected !== 'string') return;
        const content = await invoke<string>('read_project_file', { filePath: selected });
        onImportBoardJson(content);
      } catch (err: any) {
        alert(`Gagal mengimpor papan: ${err?.message || err}`);
      }
    } else {
      fileInputEl?.click();
    }
  }

  function handleFileChange(e: Event) {
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

  const totalMutualLinks = $derived(
    Math.floor(
      board.buttons.reduce((acc, b) => acc + (b.kind === 'category' ? b.links.length : 0), 0) / 2
    )
  );
  const totalScopedLabels = $derived(
    board.buttons.filter((b) => b.kind === 'descriptor' && b.forTags.length > 0).length
  );
</script>

<div class="vcb-shell">
  <!-- TOP STUDIO TOOLBAR -->
  <header class="vcb-toolbar">
    <div class="vcb-tl-left">
      <select
        class="vcb-select"
        value={board.id}
        onchange={(e) => onSelectBoard((e.currentTarget as HTMLSelectElement).value)}
        title="Pilih Papan Tagging"
      >
        {#each boards as b}
          <option value={b.id}>{b.name} ({b.buttons.length})</option>
        {/each}
      </select>

      <input
        type="text"
        class="vcb-board-name-input"
        value={board.name}
        disabled={Boolean(board.locked)}
        oninput={(e) => onUpdateBoardMeta({ name: (e.currentTarget as HTMLInputElement).value })}
        placeholder="Nama papan..."
        title={board.locked ? 'Papan terkunci — buka kunci untuk mengubah' : 'Ubah nama papan aktif'}
      />

      <button type="button" class="vcb-btn" onclick={onCreateBoard} title="Buat Papan Tagging Kosong Baru">
        <FolderPlus size={12} />
        <span>+ Papan</span>
      </button>

      {#if onDuplicateBoard}
        <button type="button" class="vcb-btn" onclick={onDuplicateBoard} title="Duplikat papan aktif menjadi salinan baru">
          <Copy size={12} />
          <span>Duplikat</span>
        </button>
      {/if}

      {#if onToggleBoardLock}
        <button
          type="button"
          class="vcb-btn"
          class:vcb-btn-locked={Boolean(board.locked)}
          onclick={onToggleBoardLock}
          title={board.locked ? 'Papan terkunci (klik untuk membuka)' : 'Kunci papan agar tombol tidak tergeser'}
        >
          {#if board.locked}
            <Lock size={12} />
            <span>Terkunci</span>
          {:else}
            <Unlock size={12} />
            <span>Kunci</span>
          {/if}
        </button>
      {/if}

      {#if onDeleteBoard}
        <button
          type="button"
          class="vcb-btn vcb-btn-danger"
          disabled={boards.length <= 1 || Boolean(board.locked)}
          onclick={() => {
            if (confirm(`Hapus papan "${board.name}"?`)) {
              onDeleteBoard(board.id);
            }
          }}
          title={boards.length <= 1 ? 'Minimal 1 papan harus tersisa' : board.locked ? 'Buka kunci sebelum menghapus' : 'Hapus papan aktif'}
        >
          <Trash2 size={12} />
        </button>
      {/if}

      <button type="button" class="vcb-btn" onclick={handleImportClick} title="Impor Papan .momen.json">
        <Upload size={12} />
        <span>Impor</span>
      </button>
      <input
        bind:this={fileInputEl}
        type="file"
        accept=".json,.momen"
        onchange={handleFileChange}
        style="display: none;"
      />

      <button type="button" class="vcb-btn" onclick={onExportBoardJson} title="Ekspor Papan .momen.json">
        <Download size={12} />
        <span>Ekspor</span>
      </button>
    </div>

    <div class="vcb-tl-center">
      <div class="vcb-mode-group">
        <button
          type="button"
          class="vcb-mode-pill"
          class:active={toolMode === 'select'}
          onclick={() => {
            toolMode = 'select';
            linkStartBtnId = null;
            linkPointerSvg = null;
          }}
          title="Geser & Ubah Ukuran Tombol (V)"
        >
          <MousePointer size={12} />
          <span>Geser & Ukuran (V)</span>
        </button>
        <button
          type="button"
          class="vcb-mode-pill link-mode"
          class:active={toolMode === 'link'}
          onclick={() => (toolMode = 'link')}
          title="Hubungkan Garis Antar Tag (Saling Mematikan) atau Label → Tag (L)"
        >
          <Link2 size={12} />
          <span>Hubungkan Garis (L)</span>
        </button>
      </div>

      <button type="button" class="vcb-btn add-tag" onclick={() => handleAddNewButton('category')}>
        <Plus size={12} />
        <span>Tag Baru</span>
      </button>
      <button type="button" class="vcb-btn add-lbl" onclick={() => handleAddNewButton('descriptor')}>
        <Plus size={12} />
        <span>Label Baru</span>
      </button>
    </div>

    <div class="vcb-tl-right">
      <button
        type="button"
        class="vcb-btn"
        class:active={showLinks}
        onclick={() => (showLinks = !showLinks)}
        title="Tampilkan / Sembunyikan Garis Koneksi"
      >
        {#if showLinks}
          <Eye size={12} />
        {:else}
          <EyeOff size={12} />
        {/if}
        <span>Garis ({connectionLines.length})</span>
      </button>

      <button
        type="button"
        class="vcb-btn"
        onclick={() =>
          onUpdateBoardMeta({
            background: board.background === 'pitch' ? 'plain' : 'pitch',
          })}
        title="Ganti Latar Lapangan / Polos"
      >
        <Grid size={12} />
        <span>{board.background === 'pitch' ? 'Lapangan' : 'Polos'}</span>
      </button>

      <button type="button" class="vcb-btn-done" onclick={onBackToVideo}>
        <ArrowLeft size={12} />
        <span>Kembali ke Video</span>
      </button>
    </div>
  </header>

  {#if toolMode === 'link'}
    <div class="vcb-link-banner">
      <Link2 size={13} />
      {#if linkStartBtn}
        <span>
          Sumber dipilih: <strong>{linkStartBtn.name}</strong> — klik atau lepas garis di tombol tujuan untuk menghubungkan/memutus, atau tekan <strong>Esc</strong> untuk batal.
        </span>
      {:else}
        <span>
          <strong>Mode Hubungkan Garis:</strong> Tarik garis (atau klik Tombol A → Tombol B) untuk menghubungkan <strong>Tag ↔ Tag</strong> (saling mematikan otomatis) atau <strong>Label ↔ Tag</strong>.
        </span>
      {/if}
    </div>
  {/if}

  <!-- MAIN WORKSPACE: CANVAS + POOL + INSPECTOR -->
  <div class="vcb-main">
    <div class="vcb-stage-col">
      <div class="vcb-canvas-scroll">
        <!-- svelte-ignore a11y_click_events_have_key_events -->
        <!-- svelte-ignore a11y_no_static_element_interactions -->
        <div
          bind:this={canvasEl}
          class="vcb-canvas"
          class:link-cursor={toolMode === 'link'}
          style="aspect-ratio: {canvasW} / {canvasH}; background-color: {board.color};"
          onclick={() => {
            if (toolMode === 'link' && linkStartBtnId) {
              linkStartBtnId = null;
              linkPointerSvg = null;
            } else {
              selectedButtonId = null;
            }
          }}
        >
          <!-- PITCH SVG LINES -->
          {#if board.background === 'pitch'}
            <svg class="vcb-bg-svg" viewBox="0 0 {canvasW} {canvasH}" preserveAspectRatio="none" aria-hidden="true">
              <rect x="16" y="16" width={canvasW - 32} height={canvasH - 32} rx="10" fill="none" stroke="rgba(255,255,255,0.18)" stroke-width="2" />
              <line x1={canvasW / 2} y1="16" x2={canvasW / 2} y2={canvasH - 16} stroke="rgba(255,255,255,0.16)" stroke-width="2" />
              <circle cx={canvasW / 2} cy={canvasH / 2} r={Math.min(canvasW, canvasH) * 0.14} fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2" />
              <path d="M 16 {canvasH * 0.25} A {canvasH * 0.24} {canvasH * 0.24} 0 0 1 16 {canvasH * 0.75}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2" />
              <path d="M {canvasW - 16} {canvasH * 0.25} A {canvasH * 0.24} {canvasH * 0.24} 0 0 0 {canvasW - 16} {canvasH * 0.75}" fill="none" stroke="rgba(255,255,255,0.16)" stroke-width="2" />
            </svg>
          {/if}

          <!-- CONNECTION SVG OVERLAY -->
          {#if showLinks || linkStartBtn}
            <svg class="vcb-links-svg" viewBox="0 0 {canvasW} {canvasH}" preserveAspectRatio="none">
              {#each connectionLines as line (line.key)}
                {@const mx = (line.ax + line.bx) / 2}
                {@const my = (line.ay + line.by) / 2}
                <line
                  x1={line.ax}
                  y1={line.ay}
                  x2={line.bx}
                  y2={line.by}
                  stroke={line.type === 'link' ? '#f43f5e' : '#f59e0b'}
                  stroke-width={line.highlighted ? 3.2 : 1.8}
                  stroke-dasharray={line.type === 'forTag' ? '5 4' : line.highlighted ? 'none' : '8 4'}
                  stroke-opacity={line.highlighted ? 0.95 : 0.45}
                />
                <circle cx={line.ax} cy={line.ay} r="4" fill={line.type === 'link' ? '#f43f5e' : '#f59e0b'} opacity={line.highlighted ? 1 : 0.5} />
                <circle cx={line.bx} cy={line.by} r="4" fill={line.type === 'link' ? '#f43f5e' : '#f59e0b'} opacity={line.highlighted ? 1 : 0.5} />
                {#if line.highlighted}
                  <!-- svelte-ignore a11y_click_events_have_key_events -->
                  <g
                    class="svg-unlink-pill"
                    role="button"
                    tabindex="0"
                    onclick={(e) => {
                      e.stopPropagation();
                      onToggleLink(line.a.id, line.b.id);
                    }}
                  >
                    <circle cx={mx} cy={my} r="10" fill="#0f172a" stroke={line.type === 'link' ? '#f43f5e' : '#f59e0b'} stroke-width="1.8" />
                    <text x={mx} y={my + 3.5} text-anchor="middle" fill="#ffffff" font-size="11" font-weight="800">×</text>
                  </g>
                {/if}
              {/each}

              {#if linkStartBtn && linkPointerSvg}
                {@const sc = getButtonCenter(linkStartBtn)}
                <line
                  x1={sc.x}
                  y1={sc.y}
                  x2={linkPointerSvg.x}
                  y2={linkPointerSvg.y}
                  stroke="#38bdf8"
                  stroke-width="3"
                  stroke-dasharray="6 4"
                />
              {/if}
            </svg>
          {/if}

          <!-- INTERACTIVE BUTTON NODES -->
          {#each canvasButtons as btn (btn.id)}
            {@const g = getButtonGeom(btn)}
            {@const textCol = getContrastTextColor(btn.color)}
            {@const isSelected = selectedButtonId === btn.id}
            {@const isLinkStart = linkStartBtnId === btn.id}
            {@const isHoveredTarget = hoveredBtnId === btn.id}
            {@const connCount = btn.kind === 'category' ? btn.links.length : btn.forTags.length}
            <!-- svelte-ignore a11y_click_events_have_key_events -->
            <div
              class="vcb-node shape-{btn.shape}"
              class:selected={isSelected}
              class:link-start={isLinkStart}
              class:link-target={isHoveredTarget}
              style="
                left: {(g.x / canvasW) * 100}%;
                top: {(g.y / canvasH) * 100}%;
                width: {(g.w / canvasW) * 100}%;
                height: {(g.h / canvasH) * 100}%;
                background-color: {btn.color};
                color: {textCol};
              "
              onpointerdown={(e) => handleNodePointerDown(e, btn)}
              onclick={(e) => e.stopPropagation()}
              role="button"
              tabindex="0"
              title="{btn.name} ({btn.id})"
            >
              <div class="node-top-badges">
                {#if btn.kind === 'category'}
                  <span class="node-badge" style="color: {textCol}; border-color: {textCol}44;">
                    {btn.continuous ? '● KONTINU' : '1-KLIK'}
                  </span>
                {:else}
                  <span class="node-badge" style="color: {textCol}; border-color: {textCol}44;">LABEL</span>
                {/if}
                {#if btn.hotkey}
                  <span class="node-kbd">{btn.hotkey}</span>
                {/if}
              </div>

              <span class="node-title">{btn.name}</span>

              {#if btn.exclusionGroup || connCount > 0}
                <div class="node-bottom-badges">
                  {#if btn.exclusionGroup}
                    <span class="node-excl-pill">{btn.exclusionGroup}</span>
                  {/if}
                  {#if connCount > 0}
                    <span class="node-link-pill">🔗 {connCount}</span>
                  {/if}
                </div>
              {/if}

              {#if toolMode === 'select'}
                <div
                  class="node-resize-handle"
                  role="separator"
                  aria-orientation="horizontal"
                  onpointerdown={(e) => handleResizePointerDown(e, btn)}
                  title="Seret untuk mengubah ukuran tombol"
                ></div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- BOTTOM POOL LABELS STRIP -->
      {#if poolButtons.length > 0}
        <div class="vcb-pool-bar">
          <div class="pool-bar-hdr">
            <span>POOL LABEL / OFF-CANVAS ({poolButtons.length}) — Klik untuk edit & sambungkan ke Tag:</span>
          </div>
          <div class="pool-chips-row">
            {#each poolButtons as btn (btn.id)}
              <button
                type="button"
                class="pool-chip"
                class:selected={selectedButtonId === btn.id}
                onclick={() => (selectedButtonId = btn.id)}
              >
                <span class="pool-dot" style="background-color: {btn.color};"></span>
                <span>{btn.name}</span>
                {#if btn.forTags.length > 0}
                  <span class="pool-links-badge">→ {btn.forTags.length}</span>
                {/if}
              </button>
            {/each}
          </div>
        </div>
      {/if}
    </div>

    <!-- RIGHT VISUAL INSPECTOR (296px) -->
    <aside class="vcb-inspector">
      {#if selectedBtn}
        <div class="insp-hdr">
          <div class="insp-hdr-left">
            <span class="insp-dot" style="background-color: {selectedBtn.color};"></span>
            <span class="insp-title">{selectedBtn.name}</span>
          </div>
          <button
            type="button"
            class="insp-close"
            onclick={() => (selectedButtonId = null)}
            title="Tutup seleksi"
          >
            <X size={14} />
          </button>
        </div>

        <div class="insp-scroll">
          <label class="insp-field">
            <span>Nama Tombol</span>
            <input
              type="text"
              value={selectedBtn.name}
              oninput={(e) => patchSelected({ name: (e.currentTarget as HTMLInputElement).value })}
            />
          </label>

          <div class="insp-row-2">
            <label class="insp-field">
              <span>Jenis</span>
              <select
                value={selectedBtn.kind}
                onchange={(e) => {
                  const nextKind = (e.currentTarget as HTMLSelectElement).value as TaggingButtonKind;
                  patchSelected({
                    kind: nextKind,
                    continuous: nextKind === 'category' ? selectedBtn.continuous : false,
                  });
                }}
              >
                <option value="category">Tag / Kategori</option>
                <option value="descriptor">Label / Descriptor</option>
              </select>
            </label>

            <label class="insp-field">
              <span>Hotkey Keyboard</span>
              <input
                type="text"
                maxlength="1"
                value={selectedBtn.hotkey || ''}
                placeholder="A / 1"
                oninput={(e) => {
                  const v = (e.currentTarget as HTMLInputElement).value.trim().toUpperCase().slice(0, 1);
                  patchSelected({ hotkey: v || null });
                }}
              />
            </label>
          </div>

          <div class="insp-row-2">
            <label class="insp-field">
              <span>Bentuk</span>
              <select
                value={selectedBtn.shape}
                onchange={(e) =>
                  patchSelected({
                    shape: (e.currentTarget as HTMLSelectElement).value as TaggingButtonShape,
                  })}
              >
                <option value="rounded">Rounded</option>
                <option value="rect">Rectangle</option>
                <option value="circle">Circle (Bulat)</option>
              </select>
            </label>

            <label class="insp-field">
              <span>Warna</span>
              <div class="color-picker-wrap">
                <input
                  type="color"
                  value={selectedBtn.color}
                  oninput={(e) => patchSelected({ color: (e.currentTarget as HTMLInputElement).value })}
                />
                <input
                  type="text"
                  value={selectedBtn.color}
                  oninput={(e) => patchSelected({ color: (e.currentTarget as HTMLInputElement).value })}
                />
              </div>
            </label>
          </div>

          <div class="color-swatches">
            {#each COLOR_PRESETS as col}
              <button
                type="button"
                class="swatch"
                class:active={selectedBtn.color.toLowerCase() === col.toLowerCase()}
                style="background-color: {col};"
                onclick={() => patchSelected({ color: col })}
                title={col}
              ></button>
            {/each}
          </div>

          {#if selectedBtn.kind === 'category'}
            <label class="insp-field">
              <span>Mode Rekam (Record Mode)</span>
              <select
                value={selectedBtn.continuous ? 'continuous' : 'single'}
                onchange={(e) =>
                  patchSelected({
                    continuous: (e.currentTarget as HTMLSelectElement).value === 'continuous',
                  })}
              >
                <option value="continuous">Continuous Mode (Start → Stop)</option>
                <option value="single">Single Click Mode (Auto Pre/Post)</option>
              </select>
            </label>

            <div class="insp-row-2">
              <label class="insp-field">
                <span>Pre-Roll (detik)</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={selectedBtn.leadSec}
                  oninput={(e) =>
                    patchSelected({ leadSec: Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0) })}
                />
              </label>
              <label class="insp-field">
                <span>Post-Roll (detik)</span>
                <input
                  type="number"
                  min="0"
                  step="0.5"
                  value={selectedBtn.lagSec}
                  oninput={(e) =>
                    patchSelected({ lagSec: Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0) })}
                />
              </label>
            </div>

            <div class="insp-field">
              <span>Exclusion Group (Saling Mematikan Satu Grup)</span>
              <input
                type="text"
                value={selectedBtn.exclusionGroup || ''}
                placeholder="Misal: phase"
                oninput={(e) =>
                  patchSelected({
                    exclusionGroup: (e.currentTarget as HTMLInputElement).value.trim() || null,
                  })}
              />
              {#if existingExclusionGroups.length > 0}
                <div class="group-suggest-row">
                  {#each existingExclusionGroups as grp}
                    <button
                      type="button"
                      class="mini-chip"
                      class:active={selectedBtn.exclusionGroup === grp}
                      onclick={() =>
                        patchSelected({
                          exclusionGroup: selectedBtn.exclusionGroup === grp ? null : grp,
                        })}
                    >
                      {grp}
                    </button>
                  {/each}
                </div>
              {/if}
            </div>

            <div class="insp-field">
              <span>Tag Terhubung (Saling Mematikan / Links)</span>
              <div class="conn-grid">
                {#each categoryButtons.filter((c) => c.id !== selectedBtn.id) as otherCat (otherCat.id)}
                  {@const linked = selectedBtn.links.includes(otherCat.id)}
                  <button
                    type="button"
                    class="conn-chip"
                    class:active={linked}
                    onclick={() => onToggleLink(selectedBtn.id, otherCat.id)}
                  >
                    <span class="conn-dot" style="background-color: {otherCat.color};"></span>
                    <span>{otherCat.name}</span>
                  </button>
                {/each}
              </div>
            </div>
          {:else}
            <div class="insp-row-2">
              <label class="insp-field">
                <span>Grup Label</span>
                <input
                  type="text"
                  value={selectedBtn.group || ''}
                  placeholder="tactic / result / period"
                  oninput={(e) =>
                    patchSelected({
                      group: (e.currentTarget as HTMLInputElement).value.trim() || null,
                    })}
                />
              </label>
              <label class="insp-field">
                <span>Posisi Kanvas / Pool</span>
                <button
                  type="button"
                  class="vcb-btn"
                  onclick={() => {
                    if (selectedBtn.w > 0 && selectedBtn.h > 0) {
                      patchSelected({ w: 0, h: 0 });
                    } else {
                      const slot = findNonOverlappingSlot('descriptor');
                      patchSelected({ x: slot.x, y: slot.y, w: 108, h: 48 });
                    }
                  }}
                >
                  {selectedBtn.w > 0 && selectedBtn.h > 0 ? 'Pindah ke Pool' : 'Taruh di Kanvas'}
                </button>
              </label>
            </div>

            <label class="insp-checkbox">
              <input
                type="checkbox"
                checked={Boolean(selectedBtn.autoAdd)}
                onchange={(e) =>
                  patchSelected({ autoAdd: (e.currentTarget as HTMLInputElement).checked })}
              />
              <span>Auto-Add (otomatis tempel di setiap klip baru)</span>
            </label>

            <div class="insp-field">
              <span>Khusus Untuk Tag (ForTags — kosong = semua tag)</span>
              <div class="conn-grid">
                {#each categoryButtons as cat (cat.id)}
                  {@const attached = selectedBtn.forTags.includes(cat.id)}
                  <button
                    type="button"
                    class="conn-chip for-tag"
                    class:active={attached}
                    onclick={() => onToggleLink(selectedBtn.id, cat.id)}
                  >
                    <span class="conn-dot" style="background-color: {cat.color};"></span>
                    <span>{cat.name}</span>
                  </button>
                {/each}
              </div>
            </div>
          {/if}

          <div class="insp-row-4">
            <label class="insp-field">
              <span>X</span>
              <input
                type="number"
                value={selectedBtn.x}
                oninput={(e) => patchSelected({ x: Number((e.currentTarget as HTMLInputElement).value) || 0 })}
              />
            </label>
            <label class="insp-field">
              <span>Y</span>
              <input
                type="number"
                value={selectedBtn.y}
                oninput={(e) => patchSelected({ y: Number((e.currentTarget as HTMLInputElement).value) || 0 })}
              />
            </label>
            <label class="insp-field">
              <span>W</span>
              <input
                type="number"
                value={selectedBtn.w}
                oninput={(e) => patchSelected({ w: Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0) })}
              />
            </label>
            <label class="insp-field">
              <span>H</span>
              <input
                type="number"
                value={selectedBtn.h}
                oninput={(e) => patchSelected({ h: Math.max(0, Number((e.currentTarget as HTMLInputElement).value) || 0) })}
              />
            </label>
          </div>

          <div class="insp-footer-actions">
            <button type="button" class="vcb-btn" onclick={duplicateSelected}>
              <Copy size={12} />
              <span>Duplikat</span>
            </button>
            <button
              type="button"
              class="vcb-btn-danger"
              onclick={() => {
                const idToDel = selectedBtn.id;
                selectedButtonId = null;
                onDeleteButton(idToDel);
              }}
            >
              <Trash2 size={12} />
              <span>Hapus Tombol</span>
            </button>
          </div>
        </div>
      {:else}
        <div class="insp-empty">
          <h3>Coding Board Studio</h3>
          <p class="insp-desc">
            Atur tata letak tombol taktis futsal dan hubungan antar-tag persis seperti <strong>Momen Sports</strong>.
          </p>
          <div class="insp-stats">
            <div class="stat-box">
              <strong>{categoryButtons.length}</strong>
              <span>Tag Aksi</span>
            </div>
            <div class="stat-box">
              <strong>{board.buttons.length - categoryButtons.length}</strong>
              <span>Label</span>
            </div>
            <div class="stat-box">
              <strong>{totalMutualLinks}</strong>
              <span>Koneksi Tag</span>
            </div>
            <div class="stat-box">
              <strong>{totalScopedLabels}</strong>
              <span>Label Khusus</span>
            </div>
          </div>

          <ul class="insp-guide-list">
            <li><strong>Geser & Ubah Ukuran (V):</strong> Klik tombol di kanvas, seret posisi, atau tarik sudut kanan bawah.</li>
            <li><strong>Hubungkan Garis (L):</strong> Klik atau tarik garis dari Tag A → Tag B agar otomatis saling mematikan saat tagging.</li>
            <li><strong>Label ↔ Tag:</strong> Hubungkan Label ke Tag agar otomatis aktif atau terseleksi khusus untuk aksi tersebut.</li>
          </ul>
        </div>
      {/if}
    </aside>
  </div>
</div>

<style>
  .vcb-shell {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: #060b14;
    overflow: hidden;
  }

  .vcb-toolbar {
    height: 40px;
    min-height: 40px;
    padding: 0 10px;
    background: #091322;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    flex-shrink: 0;
  }

  .vcb-tl-left,
  .vcb-tl-center,
  .vcb-tl-right {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .vcb-select,
  .vcb-board-name-input {
    background: #050a14;
    border: 1px solid #1a355d;
    color: #e2e8f0;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 5px;
    outline: none;
  }

  .vcb-select {
    max-width: 170px;
  }

  .vcb-board-name-input {
    width: 145px;
  }

  .vcb-board-name-input:focus {
    border-color: #38bdf8;
  }

  .vcb-mode-group {
    display: flex;
    background: #050a14;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .vcb-mode-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .vcb-mode-pill.active {
    background: #0284c7;
    color: #ffffff;
  }

  .vcb-mode-pill.link-mode.active {
    background: #be123c;
    color: #ffffff;
  }

  .vcb-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0c192e;
    border: 1px solid #1e3a5f;
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
  }

  .vcb-btn:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .vcb-btn.active {
    background: #102a4e;
    border-color: #38bdf8;
    color: #38bdf8;
  }

  .vcb-btn.add-tag {
    border-color: #0284c7;
    color: #7dd3fc;
  }

  .vcb-btn.add-lbl {
    border-color: #d97706;
    color: #fcd34d;
  }

  .vcb-btn-done {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: linear-gradient(135deg, #059669, #0284c7);
    border: 1px solid #34d399;
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
  }

  .vcb-link-banner {
    background: rgba(190, 18, 60, 0.22);
    border-bottom: 1px solid #f43f5e;
    color: #fecdd3;
    padding: 4px 12px;
    font-size: 10px;
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .vcb-main {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: minmax(0, 1fr) 296px;
    overflow: hidden;
  }

  .vcb-stage-col {
    display: flex;
    flex-direction: column;
    min-width: 0;
    min-height: 0;
    overflow: hidden;
  }

  .vcb-canvas-scroll {
    flex: 1;
    min-height: 0;
    overflow: auto;
    padding: 12px;
    display: flex;
    align-items: flex-start;
    justify-content: center;
    background: #050a12;
  }

  .vcb-canvas {
    width: 100%;
    max-width: 1120px;
    border: 1px solid #1e3a5f;
    border-radius: 10px;
    position: relative;
    overflow: hidden;
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.45);
    user-select: none;
  }

  .vcb-canvas.link-cursor {
    cursor: crosshair;
  }

  .vcb-bg-svg,
  .vcb-links-svg {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .vcb-bg-svg {
    pointer-events: none;
    z-index: 1;
  }

  .vcb-links-svg {
    pointer-events: none;
    z-index: 15;
  }

  .svg-unlink-pill {
    pointer-events: all;
    cursor: pointer;
  }

  .vcb-node {
    position: absolute;
    z-index: 10;
    border-radius: 8px;
    border: 1.5px solid rgba(255, 255, 255, 0.25);
    padding: 5px 7px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    justify-content: space-between;
    cursor: grab;
    box-shadow: 0 3px 10px rgba(0, 0, 0, 0.35);
    overflow: hidden;
  }

  .vcb-node:active {
    cursor: grabbing;
  }

  .vcb-node.shape-rect {
    border-radius: 3px;
  }

  .vcb-node.shape-circle {
    border-radius: 999px;
    align-items: center;
    text-align: center;
  }

  .vcb-node.selected {
    outline: 2.5px solid #ffffff;
    box-shadow: 0 0 0 4px rgba(56, 189, 248, 0.5);
    z-index: 20;
  }

  .vcb-node.link-start {
    outline: 2.5px solid #38bdf8;
    z-index: 22;
  }

  .vcb-node.link-target {
    outline: 2.5px solid #f43f5e;
    transform: scale(1.03);
    z-index: 22;
  }

  .node-top-badges {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
  }

  .node-badge {
    font-size: 7px;
    font-weight: 900;
    border: 1px solid rgba(255, 255, 255, 0.35);
    border-radius: 3px;
    padding: 0 3px;
  }

  .node-kbd {
    font-family: monospace;
    font-size: 9px;
    font-weight: 900;
    background: rgba(0, 0, 0, 0.35);
    color: #ffffff;
    padding: 0 4px;
    border-radius: 3px;
  }

  .node-title {
    font-size: 11px;
    font-weight: 800;
    line-height: 1.15;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .node-bottom-badges {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 8px;
    font-weight: 800;
  }

  .node-excl-pill,
  .node-link-pill {
    background: rgba(0, 0, 0, 0.32);
    color: #ffffff;
    padding: 0 4px;
    border-radius: 3px;
  }

  .node-resize-handle {
    position: absolute;
    right: 2px;
    bottom: 2px;
    width: 10px;
    height: 10px;
    border-right: 2px solid rgba(255, 255, 255, 0.85);
    border-bottom: 2px solid rgba(255, 255, 255, 0.85);
    cursor: nwse-resize;
    opacity: 0.7;
  }

  .vcb-node:hover .node-resize-handle {
    opacity: 1;
  }

  /* POOL BAR */
  .vcb-pool-bar {
    background: #081223;
    border-top: 1px solid #1a355d;
    padding: 6px 10px;
    flex-shrink: 0;
    display: flex;
    flex-direction: column;
    gap: 5px;
    max-height: 112px;
    overflow-y: auto;
  }

  .pool-bar-hdr {
    font-size: 9px;
    font-weight: 800;
    color: #93c5fd;
  }

  .pool-chips-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .pool-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0c1a30;
    border: 1px solid #1e3a5f;
    color: #e2e8f0;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    cursor: pointer;
  }

  .pool-chip.selected {
    border-color: #38bdf8;
    background: #12305a;
    color: #ffffff;
  }

  .pool-dot {
    width: 7px;
    height: 7px;
    border-radius: 50%;
  }

  .pool-links-badge {
    font-size: 8px;
    color: #fbbf24;
    font-weight: 800;
  }

  /* RIGHT INSPECTOR */
  .vcb-inspector {
    background: #08101f;
    border-left: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    min-height: 0;
    overflow: hidden;
  }

  .insp-hdr {
    height: 36px;
    padding: 0 10px;
    background: #0b172c;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-shrink: 0;
  }

  .insp-hdr-left {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .insp-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .insp-title {
    font-size: 11px;
    font-weight: 800;
    color: #f8fafc;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .insp-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 2px;
  }

  .insp-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .insp-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .insp-field > span {
    font-size: 9px;
    font-weight: 800;
    color: #93c5fd;
    letter-spacing: 0.03em;
  }

  .insp-field input,
  .insp-field select {
    background: #050a14;
    border: 1px solid #1a355d;
    color: #f8fafc;
    font-size: 11px;
    padding: 5px 7px;
    border-radius: 5px;
    outline: none;
    width: 100%;
    box-sizing: border-box;
  }

  .insp-field input:focus,
  .insp-field select:focus {
    border-color: #38bdf8;
  }

  .insp-row-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px;
  }

  .insp-row-4 {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 5px;
  }

  .color-picker-wrap {
    display: flex;
    gap: 4px;
    align-items: center;
  }

  .color-picker-wrap input[type='color'] {
    width: 30px;
    height: 28px;
    padding: 1px;
    flex-shrink: 0;
  }

  .color-swatches {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .swatch {
    width: 18px;
    height: 18px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    cursor: pointer;
  }

  .swatch.active {
    outline: 2px solid #ffffff;
  }

  .group-suggest-row,
  .conn-grid {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    max-height: 145px;
    overflow-y: auto;
    padding: 4px;
    background: #050a14;
    border: 1px solid #162d52;
    border-radius: 6px;
  }

  .mini-chip,
  .conn-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0b1629;
    border: 1px solid #1e3a5f;
    color: #cbd5e1;
    font-size: 9px;
    font-weight: 700;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .mini-chip.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .conn-chip.active {
    background: rgba(244, 63, 94, 0.22);
    border-color: #f43f5e;
    color: #fecdd3;
  }

  .conn-chip.for-tag.active {
    background: rgba(245, 158, 11, 0.22);
    border-color: #f59e0b;
    color: #fde68a;
  }

  .conn-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
  }

  .insp-checkbox {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 700;
    color: #cbd5e1;
  }

  .insp-footer-actions {
    display: flex;
    justify-content: space-between;
    gap: 6px;
    padding-top: 8px;
    border-top: 1px solid #1a355d;
  }

  .vcb-btn-danger {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: rgba(220, 38, 38, 0.18);
    border: 1px solid #ef4444;
    color: #fecaca;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 5px;
    cursor: pointer;
  }

  .vcb-btn-danger:hover {
    background: #dc2626;
    color: #ffffff;
  }

  .insp-empty {
    padding: 16px 14px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .insp-empty h3 {
    margin: 0;
    font-size: 13px;
    font-weight: 800;
    color: #38bdf8;
  }

  .insp-desc {
    margin: 0;
    font-size: 11px;
    color: #94a3b8;
    line-height: 1.45;
  }

  .insp-stats {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .stat-box {
    background: #0c1a30;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    align-items: center;
  }

  .stat-box strong {
    font-size: 16px;
    color: #ffffff;
  }

  .stat-box span {
    font-size: 9px;
    color: #93c5fd;
  }

  .insp-guide-list {
    margin: 0;
    padding-left: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    font-size: 10px;
    color: #cbd5e1;
    line-height: 1.45;
  }

  .vcb-btn-locked {
    border-color: #f59e0b !important;
    color: #fbbf24 !important;
    background: rgba(245, 158, 11, 0.14) !important;
  }

  .vcb-btn-danger:hover:not(:disabled) {
    border-color: #ef4444 !important;
    color: #fca5a5 !important;
  }

  .vcb-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
</style>

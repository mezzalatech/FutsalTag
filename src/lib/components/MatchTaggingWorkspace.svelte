<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { isTauriDesktop, projectStore } from '$lib/stores/projectStore.svelte';
  import { exportMomenBoardJson } from '$lib/tagging/momenBoards';
  import type {
    VideoTagEvent,
    TagCategory,
    TaggingButton,
    TagDescriptor,
    ActiveContinuousTag,
  } from '$lib/types';
  import StatsMatrixModal from '$lib/components/StatsMatrixModal.svelte';
  import TagLabelEditorModal from '$lib/components/TagLabelEditorModal.svelte';
  import MomenTaggingBoard from '$lib/components/MomenTaggingBoard.svelte';
  import LinimasaTimeline from '$lib/components/LinimasaTimeline.svelte';
  import VisualCodingBoard from '$lib/components/VisualCodingBoard.svelte';
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Scissors,
    Tag,
    Search,
    Table,
    Sparkles,
    Trash2,
    ArrowRight,
    CheckCircle,
    User,
    ListOrdered,
    Edit3,
    Plus,
    Film,
    LayoutGrid,
    Users,
    Copy,
    Clipboard,
    X,
    Upload,
    Download,
    RotateCcw,
    Square,
    UserPlus,
    ChevronDown,
    ChevronUp,
    Check,
    Link2,
  } from 'lucide-svelte';

  // --- REFS & STATE ---
  let videoEl = $state<HTMLVideoElement | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(120);
  let playbackRate = $state(1.0);

  // Workspace subtab: 'tagging' | 'coding_board' | 'lineup'
  let workspaceSubTab = $state<'tagging' | 'coding_board' | 'lineup'>('tagging');

  // 2-Tier Momen Layout State
  let showSpatialCanvas = $state<boolean>(true);
  let spatialCanvasHeight = $state<number>(155);
  let isResizingCanvas = $state<boolean>(false);
  let linimasaHeight = $state<number>(200);
  let isResizingLinimasa = $state<boolean>(false);
  let rightPanelTab = $state<'clips' | 'playlist'>('clips');
  let leftSearchQuery = $state<string>('');
  let codingBoardFocusButtonId = $state<string | null>(null);
  let newPlayerInput = $state<string>('');
  let boardImportInputEl = $state<HTMLInputElement | undefined>(undefined);

  // Active selected player & Momen/Once live tagging state
  let activeSelectedPlayer = $state<string>('#9 Pivot');
  let activeTeamSide = $state<'home' | 'away'>('home');
  let lastTaggedNotification = $state<string | null>(null);
  let activeContinuousTags = $state<Record<string, ActiveContinuousTag>>({});
  let stickyAutoDescriptors = $state<string[]>([]);
  let lastSyncedBoardId = $state<string>('');
  let selectedClipId = $state<string | null>(null);
  let copiedMeta = $state<{
    labels: TagDescriptor[];
    players: string[];
    teamSide?: 'home' | 'away';
  } | null>(null);

  // Smart Pre-roll & Post-roll
  let leadTimeSeconds = $state(5.0);
  let lagTimeSeconds = $state(3.0);

  // Manual In/Out Points
  let inPoint = $state<number | null>(null);
  let outPoint = $state<number | null>(null);
  let activeLoopClip = $state<VideoTagEvent | null>(null);
  let activeClipQueue = $state<VideoTagEvent[]>([]);
  let activeQueueIndex = $state<number>(0);
  let activeQueueTitle = $state<string>('');

  // Filters & Search
  let searchQuery = $state('');
  let filterCategory = $state('ALL');
  let filterPlayer = $state('ALL');

  // Modals State
  let showStatsMatrix = $state(false);
  let showTagLabelEditor = $state(false);
  let activeEditingTag = $state<VideoTagEvent | null>(null);

  // Unified reactive roster & board
  const FUTSAL_ROSTER = $derived(projectStore.roster);
  const activeBoard = $derived(projectStore.activeBoard);

  $effect(() => {
    const b = activeBoard;
    if (b && b.id !== lastSyncedBoardId) {
      lastSyncedBoardId = b.id;
      stickyAutoDescriptors = b.buttons
        .filter((btn) => btn.kind === 'descriptor' && btn.autoAdd)
        .map((btn) => btn.id);
    }
  });

  const activeContinuousList = $derived(Object.values(activeContinuousTags));
  const primaryActiveContinuous = $derived(
    activeContinuousList.length > 0
      ? activeContinuousList[activeContinuousList.length - 1]
      : null
  );
  const targetExistingClip = $derived(
    projectStore.tags.find((t) => t.id === selectedClipId) ||
      (projectStore.tags.length > 0
        ? projectStore.tags[projectStore.tags.length - 1]
        : null)
  );
  const targetTagName = $derived(
    primaryActiveContinuous
      ? primaryActiveContinuous.name
      : targetExistingClip
        ? targetExistingClip.title
        : null
  );
  const targetTagButtonId = $derived(
    primaryActiveContinuous
      ? primaryActiveContinuous.buttonId
      : targetExistingClip
        ? targetExistingClip.boardButtonId || targetExistingClip.category
        : null
  );
  const targetAttachedDescriptorIds = $derived(
    primaryActiveContinuous
      ? primaryActiveContinuous.labels.map((l) => l.id)
      : targetExistingClip?.labels
        ? targetExistingClip.labels.map((l) => l.id)
        : []
  );
  const targetAttachedPlayers = $derived(
    primaryActiveContinuous
      ? primaryActiveContinuous.players
      : targetExistingClip
        ? targetExistingClip.playersInvolved &&
          targetExistingClip.playersInvolved.length > 0
          ? targetExistingClip.playersInvolved
          : targetExistingClip.playerLabel
            ? [projectStore.normalizePlayerLabel(targetExistingClip.playerLabel)]
            : []
        : []
  );

  const availableFilterCategories = $derived.by(() => {
    const set = new Set<string>();
    for (const btn of activeBoard.buttons) {
      if (btn.kind === 'category') set.add(btn.name);
    }
    for (const t of projectStore.tags) {
      if (t.category) set.add(t.category);
    }
    return Array.from(set);
  });

  const leftCategories = $derived.by(() => {
    const q = leftSearchQuery.trim().toLowerCase();
    return activeBoard.buttons.filter(
      (b) =>
        b.kind === 'category' &&
        (!q ||
          b.name.toLowerCase().includes(q) ||
          (b.hotkey && b.hotkey.toLowerCase() === q))
    );
  });

  const leftDescriptors = $derived.by(() => {
    const q = leftSearchQuery.trim().toLowerCase();
    return activeBoard.buttons.filter(
      (b) => b.kind === 'descriptor' && (!q || b.name.toLowerCase().includes(q))
    );
  });

  function isLeftDescriptorDimmed(btn: TaggingButton): boolean {
    if (btn.forTags.length === 0 || !targetTagButtonId) return false;
    return !btn.forTags.includes(targetTagButtonId);
  }

  function isLeftDescriptorAttached(btn: TaggingButton): boolean {
    return (
      targetAttachedDescriptorIds.includes(btn.id) ||
      stickyAutoDescriptors.includes(btn.id)
    );
  }

  function handleLeftButtonClick(btn: TaggingButton) {
    if (btn.kind === 'category') {
      handleCategoryPress(btn);
    } else {
      handleDescriptorPress(btn);
    }
  }

  function openButtonInCodingBoard(buttonId: string | null) {
    codingBoardFocusButtonId = buttonId;
    workspaceSubTab = 'coding_board';
  }

  function handleHeaderAddNewButton() {
    const existingCanvas = activeBoard.buttons.filter((b) => b.w > 0 && b.h > 0);
    const idx = existingCanvas.length;
    const newBtn: TaggingButton = {
      id: `TAG_${Date.now().toString(36).toUpperCase()}`,
      name: `TAG ${idx + 1}`,
      kind: 'category',
      hotkey: null,
      color: '#0284c7',
      x: 24 + (idx % 6) * 156,
      y: 24 + Math.floor(idx / 6) * 82,
      w: 140,
      h: 68,
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
    projectStore.upsertBoardButton(newBtn);
    openButtonInCodingBoard(newBtn.id);
  }

  function getCategoryClipCount(catName: string): number {
    return projectStore.tags.filter((t) => t.category === catName).length;
  }

  function handleQuickSearchEnter() {
    const cat = leftCategories[0];
    if (cat) {
      handleCategoryPress(cat);
      leftSearchQuery = '';
      return;
    }
    const desc = leftDescriptors[0];
    if (desc) {
      handleDescriptorPress(desc);
      leftSearchQuery = '';
    }
  }

  function submitQuickAddPlayer() {
    const raw = newPlayerInput.trim();
    if (!raw) return;
    const added = projectStore.addRosterPlayer(raw);
    if (added) handlePlayerPress(added);
    newPlayerInput = '';
  }

  function handleTrimClip(tagId: string, newStart: number, newEnd: number) {
    const target = projectStore.tags.find((t) => t.id === tagId);
    if (!target) return;
    projectStore.updateTag({
      ...target,
      startTime: newStart,
      endTime: newEnd,
    });
    notifyUser(`Klip dipangkas: ${formatTime(newStart)} - ${formatTime(newEnd)}`);
  }

  async function handleHeaderImportBoard() {
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
        handleImportBoardJson(content);
      } catch (err: any) {
        alert(`Gagal mengimpor papan Momen: ${err?.message || err}`);
      }
    } else {
      boardImportInputEl?.click();
    }
  }

  function handleHeaderBoardFileChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        try {
          handleImportBoardJson(text);
        } catch (err: any) {
          alert(`Format papan tidak valid: ${err?.message || err}`);
        }
      }
    };
    reader.readAsText(input.files[0]);
    input.value = '';
  }

  function formatCompactElapsed(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0 ? `${m}:${rem.toString().padStart(2, '0')}` : `${sec.toFixed(1)}s`;
  }

  function startCanvasResize(e: PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = spatialCanvasHeight;
    isResizingCanvas = true;

    function onMove(ev: PointerEvent) {
      const next = startH + (startY - ev.clientY);
      if (next < 65) {
        showSpatialCanvas = false;
      } else {
        showSpatialCanvas = true;
        spatialCanvasHeight = Math.max(95, Math.min(280, next));
      }
    }

    function onUp() {
      isResizingCanvas = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  function startLinimasaResize(e: PointerEvent) {
    e.preventDefault();
    const startY = e.clientY;
    const startH = linimasaHeight;
    isResizingLinimasa = true;

    function onMove(ev: PointerEvent) {
      const next = startH + (startY - ev.clientY);
      linimasaHeight = Math.max(130, Math.min(340, next));
    }

    function onUp() {
      isResizingLinimasa = false;
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  }

  onMount(() => {
    if (window.innerHeight <= 760) {
      linimasaHeight = 160;
      spatialCanvasHeight = 122;
    }
    function handleKeyDown(e: KeyboardEvent) {
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (
        targetTag === 'INPUT' ||
        targetTag === 'TEXTAREA' ||
        targetTag === 'SELECT'
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        togglePlay();
      } else if (e.key === 'Escape') {
        if (Object.keys(activeContinuousTags).length > 0) {
          e.preventDefault();
          stopAllContinuousTags();
        }
      } else if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        handleUndoLastTag();
      } else if (e.key === '/') {
        e.preventDefault();
        document.getElementById('quick-tag-search-input')?.focus();
      } else if (e.key === 'ArrowLeft') {
        stepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        stepFrame(1);
      } else {
        const keyUpper = e.key.toUpperCase();
        const boardMatch = activeBoard.buttons.find(
          (b) => b.hotkey && b.hotkey.toUpperCase() === keyUpper
        );
        if (boardMatch) {
          e.preventDefault();
          if (boardMatch.kind === 'category') {
            handleCategoryPress(boardMatch);
          } else {
            handleDescriptorPress(boardMatch);
          }
        } else if (keyUpper === 'I') {
          setInPoint();
        } else if (keyUpper === 'O') {
          setOutPoint();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  function togglePlay() {
    if (!videoEl) return;
    if (isPlaying) {
      videoEl.pause();
    } else {
      videoEl.play();
    }
    isPlaying = !isPlaying;
  }

  function handleTimeUpdate() {
    if (!videoEl) return;
    currentTime = videoEl.currentTime;

    // Sequential Queue Playback (e.g. from Cross-Tabulation Matrix)
    if (activeClipQueue.length > 0 && activeQueueIndex < activeClipQueue.length) {
      const currentQueueClip = activeClipQueue[activeQueueIndex];
      if (currentTime >= currentQueueClip.endTime) {
        if (activeQueueIndex + 1 < activeClipQueue.length) {
          activeQueueIndex += 1;
          playQueueCurrentClip();
        } else {
          // Loop playlist back to start
          activeQueueIndex = 0;
          playQueueCurrentClip();
        }
      }
      return;
    }

    if (activeLoopClip) {
      if (currentTime >= activeLoopClip.endTime) {
        videoEl.currentTime = activeLoopClip.startTime;
      }
    }
  }

  function handleLoadedMetadata() {
    if (!videoEl) return;
    duration = videoEl.duration || 120;
    projectStore.duration = duration;
  }

  function seekTo(seconds: number) {
    if (!videoEl) return;
    activeLoopClip = null;
    activeClipQueue = [];
    videoEl.currentTime = Math.max(0, Math.min(seconds, duration));
    currentTime = videoEl.currentTime;
  }

  function stepFrame(step: number) {
    if (!videoEl) return;
    videoEl.pause();
    isPlaying = false;
    const fps = 25;
    videoEl.currentTime = Math.max(0, Math.min(videoEl.currentTime + step / fps, duration));
    currentTime = videoEl.currentTime;
  }

  function setInPoint() {
    inPoint = currentTime;
  }

  function setOutPoint() {
    outPoint = currentTime;
    if (inPoint !== null && outPoint > inPoint) {
      const newTag: VideoTagEvent = {
        id: `tag-${Date.now()}`,
        title: `Klip Manual (${formatTime(inPoint)} - ${formatTime(outPoint)})`,
        category: 'Transition Attack',
        startTime: Number(inPoint.toFixed(2)),
        endTime: Number(outPoint.toFixed(2)),
        color: '#38bdf8',
        playerLabel: activeSelectedPlayer,
        outcomeLabel: 'Gol / Sukses',
        rating: '⭐⭐⭐ Bagus',
        pauseDuration: 3.0,
        drawings: [],
      };
      projectStore.addTag(newTag);
      inPoint = null;
      outPoint = null;
      notifyUser(`Klip Manual Disimpan (${activeSelectedPlayer})`);
    }
  }

  function buildSeedLabels(catButtonId: string): TagDescriptor[] {
    const out: TagDescriptor[] = [];
    for (const stickyId of stickyAutoDescriptors) {
      const btn = activeBoard.buttons.find((b) => b.id === stickyId && b.kind === 'descriptor');
      if (!btn) continue;
      if (btn.forTags.length > 0 && !btn.forTags.includes(catButtonId)) continue;
      out.push({
        id: btn.id,
        name: btn.name,
        color: btn.color,
        group: btn.group,
        atTime: Number(currentTime.toFixed(2)),
      });
    }
    return out;
  }

  function toggleDescriptorInList(
    list: TagDescriptor[],
    btn: TaggingButton,
    desc: TagDescriptor
  ): TagDescriptor[] {
    if (list.some((l) => l.id === btn.id)) {
      return list.filter((l) => l.id !== btn.id);
    }
    const filtered = btn.group
      ? list.filter((l) => l.group !== btn.group)
      : list;
    return [...filtered, desc];
  }

  function finalizeContinuousTag(buttonId: string) {
    const active = activeContinuousTags[buttonId];
    if (!active) return;

    const endTime = Math.min(
      Math.max(duration, currentTime + 1),
      Math.max(active.startTime + 0.5, currentTime + active.lagSec)
    );
    const primaryPlayer = active.players[0] || activeSelectedPlayer;
    const newTag: VideoTagEvent = {
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${active.name} - ${primaryPlayer} (${formatTime(active.startTime)} - ${formatTime(endTime)})`,
      category: active.name as TagCategory,
      startTime: Number(active.startTime.toFixed(2)),
      endTime: Number(endTime.toFixed(2)),
      color: active.color,
      playerLabel: primaryPlayer,
      playersInvolved: [...active.players],
      labels: [...active.labels],
      teamSide: active.teamSide,
      isContinuous: true,
      boardButtonId: buttonId,
      outcomeLabel: 'Gol / Sukses',
      zoneLabel: 'Area Penalti Lawan',
      rating: '⭐⭐⭐ Bagus',
      pauseDuration: 3.0,
      drawings: [],
    };
    projectStore.addTag(newTag);
    selectedClipId = newTag.id;

    const next = { ...activeContinuousTags };
    delete next[buttonId];
    activeContinuousTags = next;
    notifyUser(`Klip Kontinu Disimpan: ${active.name} (${(endTime - active.startTime).toFixed(1)}s)`);
  }

  function handleCategoryPress(btn: TaggingButton) {
    if (btn.continuous) {
      if (activeContinuousTags[btn.id]) {
        finalizeContinuousTag(btn.id);
        return;
      }

      // 1. Auto-stop exclusionGroup siblings & bidirectional linked pairs
      for (const activeId of Object.keys(activeContinuousTags)) {
        const activeBtn = activeBoard.buttons.find((b) => b.id === activeId);
        const sameExcl =
          Boolean(btn.exclusionGroup) &&
          activeBtn?.exclusionGroup === btn.exclusionGroup;
        const isLinked =
          btn.links.includes(activeId) ||
          Boolean(activeBtn?.links.includes(btn.id));
        if (sameExcl || isLinked) {
          finalizeContinuousTag(activeId);
        }
      }

      const startTime = Math.max(0, currentTime - (btn.leadSec || 0));
      const newRec: ActiveContinuousTag = {
        buttonId: btn.id,
        name: btn.name,
        color: btn.color,
        startTime: Number(startTime.toFixed(2)),
        pressedAt: Number(currentTime.toFixed(2)),
        lagSec: btn.lagSec || 0,
        labels: buildSeedLabels(btn.id),
        players: activeSelectedPlayer ? [activeSelectedPlayer] : [],
        teamSide: activeTeamSide,
      };
      activeContinuousTags = { ...activeContinuousTags, [btn.id]: newRec };
      notifyUser(`● Merekam Kontinu: ${btn.name}`);
      return;
    }

    // Single-click Auto Mode
    const lead = btn.leadSec > 0 || btn.continuous ? btn.leadSec : leadTimeSeconds;
    const lag = btn.lagSec > 0 ? btn.lagSec : lagTimeSeconds;
    const start = Math.max(0, currentTime - lead);
    const end = Math.min(
      Math.max(duration, currentTime + lag),
      Math.max(start + 1, currentTime + lag)
    );
    const seedLabels = buildSeedLabels(btn.id);
    const newTag: VideoTagEvent = {
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${btn.name} - ${activeSelectedPlayer} (${formatTime(start)} - ${formatTime(end)})`,
      category: btn.name as TagCategory,
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      color: btn.color,
      playerLabel: activeSelectedPlayer,
      playersInvolved: [activeSelectedPlayer],
      labels: seedLabels,
      teamSide: activeTeamSide,
      isContinuous: false,
      boardButtonId: btn.id,
      outcomeLabel: 'Gol / Sukses',
      zoneLabel: 'Area Penalti Lawan',
      rating: '⭐⭐⭐ Bagus',
      pauseDuration: 3.0,
      drawings: [],
    };
    projectStore.addTag(newTag);
    selectedClipId = newTag.id;
    notifyUser(`Klip Ditandai: ${btn.name} [${activeSelectedPlayer}]`);
  }

  function handleDescriptorPress(btn: TaggingButton) {
    const desc: TagDescriptor = {
      id: btn.id,
      name: btn.name,
      color: btn.color,
      group: btn.group,
      atTime: Number(currentTime.toFixed(2)),
    };

    if (btn.autoAdd || btn.group === 'period') {
      if (stickyAutoDescriptors.includes(btn.id)) {
        stickyAutoDescriptors = stickyAutoDescriptors.filter((id) => id !== btn.id);
      } else {
        const cleaned = btn.group
          ? stickyAutoDescriptors.filter((id) => {
              const sib = activeBoard.buttons.find((b) => b.id === id);
              return sib?.group !== btn.group;
            })
          : stickyAutoDescriptors;
        stickyAutoDescriptors = [...cleaned, btn.id];
      }
    }

    if (activeContinuousList.length > 0) {
      const next = { ...activeContinuousTags };
      let updatedCount = 0;
      for (const [id, rec] of Object.entries(next)) {
        if (btn.forTags.length === 0 || btn.forTags.includes(rec.buttonId)) {
          next[id] = {
            ...rec,
            labels: toggleDescriptorInList(rec.labels, btn, desc),
          };
          updatedCount += 1;
        }
      }
      if (updatedCount > 0) {
        activeContinuousTags = next;
        notifyUser(`Label "${btn.name}" diterapkan ke tag aktif`);
      } else {
        notifyUser(`Label "${btn.name}" hanya untuk tag tertentu (forTags)`);
      }
      return;
    }

    if (targetExistingClip) {
      const currentLabels = targetExistingClip.labels || [];
      const updatedLabels = toggleDescriptorInList(currentLabels, btn, desc);
      projectStore.updateTag({
        ...targetExistingClip,
        labels: updatedLabels,
      });
      notifyUser(`Label "${btn.name}" diperbarui di "${targetExistingClip.title}"`);
    } else {
      notifyUser(`Label sticky "${btn.name}" siap untuk klip berikutnya`);
    }
  }

  function handlePlayerPress(playerLabel: string) {
    activeSelectedPlayer = playerLabel;

    if (primaryActiveContinuous) {
      const exists = primaryActiveContinuous.players.includes(playerLabel);
      const nextPlayers = exists
        ? primaryActiveContinuous.players.length > 1
          ? primaryActiveContinuous.players.filter((p) => p !== playerLabel)
          : primaryActiveContinuous.players
        : [...primaryActiveContinuous.players, playerLabel];

      activeContinuousTags = {
        ...activeContinuousTags,
        [primaryActiveContinuous.buttonId]: {
          ...primaryActiveContinuous,
          players: nextPlayers,
        },
      };
      notifyUser(`Pemain [${nextPlayers.join(', ')}] → ${primaryActiveContinuous.name}`);
      return;
    }

    if (targetExistingClip) {
      const existing =
        targetExistingClip.playersInvolved && targetExistingClip.playersInvolved.length > 0
          ? targetExistingClip.playersInvolved
          : targetExistingClip.playerLabel
            ? [projectStore.normalizePlayerLabel(targetExistingClip.playerLabel)]
            : [];
      const hasPlayer = existing.includes(playerLabel);
      const nextPlayers = hasPlayer
        ? existing.length > 1
          ? existing.filter((p) => p !== playerLabel)
          : existing
        : [...existing, playerLabel];

      projectStore.updateTag({
        ...targetExistingClip,
        playerLabel: nextPlayers[0] || playerLabel,
        playersInvolved: nextPlayers,
      });
      notifyUser(`Pemain [${nextPlayers.join(', ')}] pada klip`);
    }
  }

  function stopAllContinuousTags() {
    const ids = Object.keys(activeContinuousTags);
    for (const id of ids) {
      finalizeContinuousTag(id);
    }
  }

  function handleUndoLastTag() {
    const removed = projectStore.undoLastTag();
    if (removed) {
      if (selectedClipId === removed.id) selectedClipId = null;
      notifyUser(`Dibatalkan: ${removed.title}`);
    }
  }

  function handleCopyClipMeta(tag: VideoTagEvent) {
    copiedMeta = {
      labels: JSON.parse(JSON.stringify(tag.labels || [])),
      players: tag.playersInvolved ? [...tag.playersInvolved] : tag.playerLabel ? [tag.playerLabel] : [],
      teamSide: tag.teamSide,
    };
    notifyUser(`Label & pemain disalin dari "${tag.category}"`);
  }

  function handlePasteClipMeta(tag: VideoTagEvent) {
    if (!copiedMeta) return;
    const players = copiedMeta.players.length > 0 ? [...copiedMeta.players] : tag.playersInvolved;
    projectStore.updateTag({
      ...tag,
      labels: JSON.parse(JSON.stringify(copiedMeta.labels)),
      playersInvolved: players,
      playerLabel: players && players.length > 0 ? players[0] : tag.playerLabel,
      teamSide: copiedMeta.teamSide ?? tag.teamSide,
    });
    notifyUser(`Label & pemain ditempel ke "${tag.category}"`);
  }

  async function handleExportBoardJson() {
    const json = exportMomenBoardJson(activeBoard);
    const safeName = activeBoard.name.replace(/[^a-zA-Z0-9_-]/g, '_').toLowerCase();
    if (isTauriDesktop()) {
      try {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const selected = await save({
          title: 'Ekspor Papan Momen (.momen.json)',
          defaultPath: `${safeName}.momen.json`,
          filters: [{ name: 'Momen Board JSON', extensions: ['json'] }],
        });
        if (!selected) return;
        await invoke<string>('save_project_file', { filePath: selected, content: json });
        notifyUser(`Papan diekspor ke "${selected}"`);
        return;
      } catch (err: any) {
        alert(`Gagal ekspor papan: ${err?.message || err}`);
        return;
      }
    }
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}.momen.json`;
    a.click();
    URL.revokeObjectURL(url);
    notifyUser(`Papan "${activeBoard.name}" diekspor`);
  }

  function handleImportBoardJson(jsonStr: string) {
    const imported = projectStore.importMomenBoard(jsonStr);
    notifyUser(`Papan "${imported.name}" (${imported.buttons.length} tombol) aktif!`);
  }

  function notifyUser(msg: string) {
    lastTaggedNotification = msg;
    setTimeout(() => {
      if (lastTaggedNotification === msg) lastTaggedNotification = null;
    }, 2800);
  }

  function handleAddToPlaylist(tag: VideoTagEvent) {
    projectStore.addToPlaylist(tag);
    notifyUser(`Dimasukkan ke Playlist: ${tag.title}`);
  }

  function openTagEditor(tag: VideoTagEvent) {
    activeEditingTag = tag;
    showTagLabelEditor = true;
  }

  function playClipLoop(tag: VideoTagEvent) {
    if (!videoEl) return;
    activeClipQueue = [];
    activeLoopClip = tag;
    videoEl.currentTime = tag.startTime;
    videoEl.play();
    isPlaying = true;
  }

  function stopClipLoop() {
    activeLoopClip = null;
  }

  function playSequentialClips(clips: VideoTagEvent[], title?: string) {
    if (!clips || clips.length === 0 || !videoEl) return;
    activeLoopClip = null;
    activeClipQueue = [...clips];
    activeQueueIndex = 0;
    activeQueueTitle = title || `${clips.length} Klip Terpilih`;
    playQueueCurrentClip();
  }

  function playQueueCurrentClip() {
    if (!videoEl || activeQueueIndex >= activeClipQueue.length) return;
    const clip = activeClipQueue[activeQueueIndex];
    videoEl.currentTime = clip.startTime;
    videoEl.play();
    isPlaying = true;
    notifyUser(`[${activeQueueIndex + 1}/${activeClipQueue.length}] ${clip.title}`);
  }

  function stopSequentialQueue() {
    activeClipQueue = [];
    activeQueueIndex = 0;
    activeQueueTitle = '';
    if (videoEl) videoEl.pause();
    isPlaying = false;
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}.${ms}`;
  }

  let filteredTags = $derived(
    projectStore.tags.filter((t) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        q === '' ||
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        (t.playerLabel && t.playerLabel.toLowerCase().includes(q)) ||
        Boolean(t.playersInvolved?.some((p) => p.toLowerCase().includes(q))) ||
        Boolean(t.labels?.some((l) => l.name.toLowerCase().includes(q)));

      const matchCat = filterCategory === 'ALL' || t.category === filterCategory;
      const matchPlayer =
        filterPlayer === 'ALL' ||
        projectStore.normalizePlayerLabel(t.playerLabel) === projectStore.normalizePlayerLabel(filterPlayer) ||
        Boolean(
          t.playersInvolved?.some(
            (p) => projectStore.normalizePlayerLabel(p) === projectStore.normalizePlayerLabel(filterPlayer)
          )
        );

      return matchSearch && matchCat && matchPlayer;
    })
  );

  let currentPlaylist = $derived(projectStore.playlists[0]);
</script>

<div class="tagging-workspace">
  <!-- SLIM TOP SUB-HEADER (34px) -->
  <header class="tagging-header">
    <div class="header-left">
      <!-- WORKSPACE MODE SWITCHER -->
      <nav class="subnav-segmented">
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === 'tagging'}
          onclick={() => (workspaceSubTab = 'tagging')}
          title="Video & Multi-Track Timeline"
        >
          <Film size={12} />
          <span>Video</span>
        </button>
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === 'coding_board'}
          onclick={() => (workspaceSubTab = 'coding_board')}
          title="Papan Tagging (Action Pad)"
        >
          <LayoutGrid size={12} />
          <span>Action Pad</span>
        </button>
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === 'lineup'}
          onclick={() => (workspaceSubTab = 'lineup')}
          title="Skuad Futsal 5v5"
        >
          <Users size={12} />
          <span>Skuad</span>
        </button>
      </nav>

      <!-- BOARD CONTROLS IN SLIM SUB-HEADER (MOMEN 2-TIER) -->
      {#if workspaceSubTab === 'tagging'}
        <div class="board-header-controls">
          <select
            class="hdr-board-select"
            value={activeBoard.id}
            onchange={(e) => projectStore.selectBoard((e.currentTarget as HTMLSelectElement).value)}
            title="Pilih Papan Tombol Tagging"
          >
            {#each projectStore.boards as b}
              <option value={b.id}>{b.name} ({b.buttons.length})</option>
            {/each}
          </select>

          <button
            type="button"
            class="hdr-tool-btn"
            onclick={handleHeaderImportBoard}
            title="Impor Papan Tagging Momen (.momen.json / .json)"
          >
            <Upload size={11} />
            <span>Impor</span>
          </button>
          <input
            bind:this={boardImportInputEl}
            type="file"
            accept=".json,.momen"
            onchange={handleHeaderBoardFileChange}
            style="display: none;"
          />

          <button
            type="button"
            class="hdr-tool-btn"
            onclick={handleExportBoardJson}
            title="Ekspor Papan Aktif (.momen.json)"
          >
            <Download size={11} />
            <span>Ekspor</span>
          </button>

          <button
            type="button"
            class="hdr-tool-btn"
            onclick={() => openButtonInCodingBoard(null)}
            title="Buka Visual Coding Board untuk mengedit tombol, posisi, & koneksi antar-tag"
          >
            <Edit3 size={11} />
            <span>Edit Papan</span>
          </button>

          <button
            type="button"
            class="hdr-tool-btn"
            onclick={handleHeaderAddNewButton}
            title="Tambah Tombol Tag baru lalu edit di Visual Coding Board"
          >
            <Plus size={11} />
            <span>Tombol</span>
          </button>

          <button
            type="button"
            class="hdr-tool-btn hdr-stop-btn"
            class:has-live={activeContinuousList.length > 0}
            disabled={activeContinuousList.length === 0}
            onclick={stopAllContinuousTags}
            title="Matikan Semua Tag Kontinu Berjalan (Esc)"
          >
            <Square size={10} />
            <span>Matikan ({activeContinuousList.length})</span>
          </button>

          <button
            type="button"
            class="hdr-tool-btn"
            onclick={handleUndoLastTag}
            title="Undo Tag Terakhir (Ctrl+Z)"
          >
            <RotateCcw size={11} />
          </button>
        </div>
      {/if}
    </div>

    <!-- NOTIFICATION TOAST -->
    {#if lastTaggedNotification}
      <div class="notification-pill">
        <CheckCircle size={12} class="text-emerald-400" />
        <span>{lastTaggedNotification}</span>
      </div>
    {/if}

    <div class="header-right">
      <!-- DEDICATED EDIT KLIP INSPECTOR (USES ACTIVE BOARD TAGS, NEVER CREATES DUMMY) -->
      <button
        class="btn-label-menu"
        disabled={projectStore.tags.length === 0}
        onclick={() => {
          const target = targetExistingClip || projectStore.tags[projectStore.tags.length - 1];
          if (target) {
            openTagEditor(target);
          }
        }}
        title={projectStore.tags.length > 0
          ? 'Edit metadata klip terpilih (atau klik 2x klip / linimasa)'
          : 'Buat minimal 1 klip terlebih dahulu untuk mengedit detail klip'}
      >
        <Tag size={12} />
        <span>Edit Klip</span>
      </button>

      <!-- STATS MATRIX -->
      <button class="btn-stats-blue" onclick={() => (showStatsMatrix = true)} title="Buka Matriks Silang Statistik Futsal">
        <Table size={12} />
        <span>Matriks</span>
      </button>

      <!-- NEXT STEP -->
      <button class="btn-next-step" onclick={() => projectStore.setStage('telestrator')} title="Lanjut ke Studio Telestrasi">
        <span>Telestrasi</span>
        <ArrowRight size={12} />
      </button>
    </div>
  </header>

  <!-- WORKSPACE BODY (CONDITIONAL ON SUBTAB) -->
  <main class="workspace-main">
    {#if workspaceSubTab === 'tagging'}
      <!-- MODE 1: MOMEN SPORTS 2-TIER WORKSPACE (LEFT TAG/LABEL · CENTER VIDEO/PLAYERS/CANVAS · RIGHT CLIPS · BOTTOM 100% LINIMASA) -->
      <div class="tagging-two-tier">
        <div class="tagging-top-tier">
          <!-- LEFT SIDEBAR: SEARCH + TAG + LABEL (196px) -->
          <aside class="left-momen-sidebar">
            <div class="left-search-box">
              <Search size={12} class="text-sky-400 shrink-0" />
              <input
                id="quick-tag-search-input"
                type="text"
                bind:value={leftSearchQuery}
                placeholder="Cari tag / label (/)"
                class="left-search-input"
                onkeydown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    handleQuickSearchEnter();
                    (e.currentTarget as HTMLInputElement).blur();
                  } else if (e.key === 'Escape') {
                    leftSearchQuery = '';
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
              />
              {#if leftSearchQuery}
                <button
                  type="button"
                  class="left-search-clear"
                  onclick={() => (leftSearchQuery = '')}
                  title="Bersihkan pencarian"
                >
                  <X size={11} />
                </button>
              {/if}
            </div>

            <div class="left-sidebar-scroll">
              <div class="left-section">
                <div class="left-section-hdr">
                  <span>TAG</span>
                  <span class="left-sec-cnt">{leftCategories.length}</span>
                </div>
                <div class="left-tag-list">
                  {#each leftCategories as btn (btn.id)}
                    {@const rec = activeContinuousTags[btn.id]}
                    {@const isOn = Boolean(rec)}
                    {@const catCount = getCategoryClipCount(btn.name)}
                    <div class="left-tag-row-wrap" class:on={isOn} style="--row-col: {btn.color};">
                      <button
                        type="button"
                        class="left-tag-row"
                        class:on={isOn}
                        onclick={() => handleLeftButtonClick(btn)}
                        title="{btn.name}{btn.hotkey ? ` [${btn.hotkey}]` : ''} — {btn.continuous ? 'Mode Kontinu (Start/Stop)' : `Single Click (-${btn.leadSec}s/+${btn.lagSec}s)`}{btn.links.length > 0 ? ` · Terhubung ke ${btn.links.length} tag` : ''}"
                      >
                        <span class="ltr-grip" style="background-color: {btn.color};"></span>
                        {#if btn.continuous}
                          <span class="ltr-switch" class:on={isOn}><i></i></span>
                        {:else}
                          <span class="ltr-single-dot" style="border-color: {btn.color};"></span>
                        {/if}
                        <span class="ltr-name">{btn.name}</span>
                        {#if isOn && rec}
                          <span class="ltr-live-timer">● {formatCompactElapsed(Math.max(0, currentTime - rec.startTime))}</span>
                        {:else}
                          {#if btn.links.length > 0}
                            <span class="ltr-link-ico" title="Terhubung ke {btn.links.length} tag">
                              <Link2 size={9} />
                            </span>
                          {/if}
                          {#if catCount > 0}
                            <span class="ltr-clip-cnt">{catCount}</span>
                          {/if}
                          {#if btn.hotkey}
                            <span class="ltr-kbd">{btn.hotkey}</span>
                          {/if}
                        {/if}
                      </button>
                      <button
                        type="button"
                        class="ltr-edit-btn"
                        onclick={(e) => {
                          e.stopPropagation();
                          openButtonInCodingBoard(btn.id);
                        }}
                        title="Edit tombol & koneksi '{btn.name}' di Coding Board"
                      >
                        <Edit3 size={9} />
                      </button>
                    </div>
                  {/each}
                </div>
              </div>

              {#if leftDescriptors.length > 0}
                <div class="left-section">
                  <div class="left-section-hdr">
                    <span>LABEL</span>
                    <span class="left-sec-cnt">{leftDescriptors.length}</span>
                  </div>
                  <div class="left-label-wrap">
                    {#each leftDescriptors as btn (btn.id)}
                      {@const isDimmed = isLeftDescriptorDimmed(btn)}
                      {@const isAttached = isLeftDescriptorAttached(btn)}
                      <button
                        type="button"
                        class="left-desc-chip"
                        class:dim={isDimmed}
                        class:attached={isAttached}
                        style="--desc-col: {btn.color};"
                        onclick={() => handleLeftButtonClick(btn)}
                        title={isDimmed
                          ? `Scope terbatas (forTags: ${btn.forTags.join(', ')})`
                          : `Label: ${btn.name}`}
                      >
                        <span class="ldc-dot" style="background-color: {btn.color};"></span>
                        <span class="ldc-name">{btn.name}</span>
                        {#if btn.autoAdd}
                          <span class="ldc-auto">A</span>
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
          </aside>

          <!-- CENTER COLUMN: CLEAN VIDEO + PINNED PLAYERS BAR + TRANSPORT + COLLAPSIBLE SPATIAL CANVAS -->
          <div class="player-column">
            <!-- VIDEO CONTAINER (PURE VIDEO, NO OBSTRUCTIVE OVERLAY BAR) -->
            <div class="video-container">
              {#if projectStore.videoSrc}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video
                  bind:this={videoEl}
                  src={projectStore.videoSrc}
                  class="match-video"
                  ontimeupdate={handleTimeUpdate}
                  onloadedmetadata={handleLoadedMetadata}
                  onclick={togglePlay}
                ></video>
              {:else}
                <div class="empty-video-placeholder">
                  <div class="futsal-glow-orb">⚽</div>
                  <h3 class="placeholder-title">Layar Video Pertandingan Futsal</h3>
                  <p class="placeholder-desc">
                    Silakan buka video di Hub Proyek atau gunakan sampel demo untuk memotong momen dengan akurasi sub-detik.
                  </p>
                  <button class="btn-sample-inline" onclick={() => projectStore.loadSampleDemo()}>
                    Muat Video Sampel Demo
                  </button>
                </div>
              {/if}

              <!-- PLAYLIST QUEUE FLOATING BANNER -->
              {#if activeClipQueue.length > 0}
                <div class="queue-status-banner">
                  <div class="flex items-center gap-2">
                    <Play size={12} class="text-sky-400 animate-pulse" />
                    <span class="text-xs font-bold text-white tracking-wide">
                      Playlist Matriks: {activeQueueTitle}
                    </span>
                    <span class="queue-counter">
                      ({activeQueueIndex + 1} / {activeClipQueue.length})
                    </span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <button
                      class="btn-queue-step"
                      onclick={() => {
                        if (activeQueueIndex > 0) {
                          activeQueueIndex -= 1;
                          playQueueCurrentClip();
                        }
                      }}
                      disabled={activeQueueIndex === 0}
                      title="Klip Sebelumnya"
                    >
                      <SkipBack size={11} />
                    </button>
                    <button
                      class="btn-queue-step"
                      onclick={() => {
                        if (activeQueueIndex + 1 < activeClipQueue.length) {
                          activeQueueIndex += 1;
                          playQueueCurrentClip();
                        }
                      }}
                      disabled={activeQueueIndex + 1 >= activeClipQueue.length}
                      title="Klip Berikutnya"
                    >
                      <SkipForward size={11} />
                    </button>
                    <button
                      class="btn-queue-close"
                      onclick={stopSequentialQueue}
                      title="Hentikan Playlist Matriks"
                    >
                      <X size={12} />
                    </button>
                  </div>
                </div>
              {/if}
            </div>

            <!-- PINNED LIVE PLAYERS BAR (DIRECTLY UNDER VIDEO) -->
            <div class="pinned-players-bar">
              <div class="target-badge" class:live={activeContinuousList.length > 0}>
                <span class="target-dot"></span>
                <span class="target-lbl" title={targetTagName || 'Belum ada tag'}>
                  {#if activeContinuousList.length > 0}
                    Merekam: {targetTagName}
                  {:else if targetTagName}
                    Klip: {targetTagName}
                  {:else}
                    Pemain:
                  {/if}
                </span>
              </div>

              <button
                type="button"
                class="team-side-pill"
                class:away={activeTeamSide === 'away'}
                onclick={() => (activeTeamSide = activeTeamSide === 'home' ? 'away' : 'home')}
                title="Ganti sisi tim default (HOME / AWAY)"
              >
                {activeTeamSide === 'home' ? 'HOME' : 'AWAY'}
              </button>

              <div class="pinned-players-strip">
                {#each FUTSAL_ROSTER as p (p.id)}
                  {@const plLabel = projectStore.getPlayerDisplayLabel(p)}
                  {@const isPrimary = activeSelectedPlayer === plLabel}
                  {@const isAttached = targetAttachedPlayers.includes(plLabel)}
                  <button
                    type="button"
                    class="pinned-player-pill"
                    class:primary={isPrimary}
                    class:attached={isAttached}
                    onclick={() => handlePlayerPress(plLabel)}
                    title="Klik untuk menempel/lepas {plLabel} ke tag aktif atau klip terakhir"
                  >
                    <span class="pp-num" style="background-color: {p.color};">{p.num}</span>
                    <span class="pp-name">{p.name}</span>
                    {#if isAttached}
                      <Check size={10} />
                    {/if}
                  </button>
                {/each}
              </div>

              <div class="pinned-add-player">
                <UserPlus size={11} class="text-slate-400" />
                <input
                  type="text"
                  bind:value={newPlayerInput}
                  placeholder="+ Pemain"
                  class="pinned-add-input"
                  onkeydown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitQuickAddPlayer();
                    }
                  }}
                />
              </div>
            </div>

            <!-- MOMEN-STYLE TRANSPORT BAR -->
            <div class="momen-transport-bar">
              <div class="mtb-left">
                <button type="button" class="btn-momen-play" onclick={togglePlay} title="Play/Pause (Spasi)">
                  {#if isPlaying}
                    <Pause size={15} />
                  {:else}
                    <Play size={15} />
                  {/if}
                </button>
                <span class="curr-time-hero">{formatCompactElapsed(currentTime)}</span>
                <span class="play-status-pill" class:running={isPlaying}>
                  ● {isPlaying ? 'jalan' : 'jeda'}
                </span>
              </div>

              <div class="mtb-scrubber">
                <input
                  type="range"
                  min="0"
                  max={Math.max(duration, 0.1)}
                  step="0.05"
                  value={currentTime}
                  oninput={(e) => seekTo(Number((e.currentTarget as HTMLInputElement).value))}
                  class="video-range-slider"
                  aria-label="Posisi Video"
                />
                <span class="dur-total-lbl">{formatTime(duration)}</span>
              </div>

              <div class="mtb-right">
                <button type="button" class="btn-ctrl-sm" onclick={() => stepFrame(-1)} title="Mundur 1 Frame">
                  -1F
                </button>
                <button type="button" class="btn-ctrl-sm" onclick={() => stepFrame(1)} title="Maju 1 Frame">
                  +1F
                </button>
                <button type="button" class="btn-ctrl-sm" onclick={() => seekTo(currentTime - 5)} title="Mundur 5 Detik">
                  -5s
                </button>
                <button type="button" class="btn-ctrl-sm" onclick={() => seekTo(currentTime + 5)} title="Maju 5 Detik">
                  +5s
                </button>

                <button
                  type="button"
                  class="btn-inout"
                  class:active={inPoint !== null}
                  onclick={setInPoint}
                  title="Tandai Titik Masuk (I)"
                >
                  [IN{inPoint !== null ? ` ${formatTime(inPoint)}` : ''}
                </button>
                <button type="button" class="btn-inout" onclick={setOutPoint} title="Potong Klip (O)">
                  OUT]
                </button>

                <div class="speed-selector-group">
                  {#each [0.5, 1.0, 1.5, 2.0] as spd}
                    <button
                      type="button"
                      class="speed-pill"
                      class:active={playbackRate === spd}
                      onclick={() => {
                        playbackRate = spd;
                        if (videoEl) videoEl.playbackRate = spd;
                      }}
                    >
                      {spd}x
                    </button>
                  {/each}
                </div>

                <button
                  type="button"
                  class="btn-draw-quick"
                  onclick={() => {
                    const target = targetExistingClip || projectStore.tags[projectStore.tags.length - 1];
                    if (target) {
                      projectStore.openClipInTelestrator(target);
                    } else {
                      projectStore.setStage('telestrator');
                    }
                  }}
                  title="Gambar Telestrasi pada klip terpilih atau posisi video saat ini"
                >
                  <Sparkles size={11} />
                  <span>Gambar</span>
                </button>

                <button
                  type="button"
                  class="btn-canvas-toggle"
                  class:open={showSpatialCanvas}
                  onclick={() => (showSpatialCanvas = !showSpatialCanvas)}
                  title="Tampilkan / Sembunyikan Kanvas Tombol Spasial"
                >
                  {#if showSpatialCanvas}
                    <ChevronDown size={12} />
                  {:else}
                    <ChevronUp size={12} />
                  {/if}
                  <span>Kanvas</span>
                </button>
              </div>
            </div>

            <!-- OPEN / COLLAPSIBLE SPATIAL PITCH CANVAS UNDER TRANSPORT -->
            {#if showSpatialCanvas}
              <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
              <div
                class="canvas-resize-handle"
                class:dragging={isResizingCanvas}
                onpointerdown={startCanvasResize}
                ondblclick={() => (showSpatialCanvas = false)}
                role="separator"
                aria-orientation="horizontal"
                title="Seret atas/bawah untuk atur tinggi kanvas · Double-click untuk sembunyi"
              >
                <span class="resize-pill"></span>
              </div>
              <div class="center-spatial-canvas" style="height: {spatialCanvasHeight}px;">
                <MomenTaggingBoard
                  board={activeBoard}
                  boards={projectStore.boards}
                  {activeContinuousTags}
                  {stickyAutoDescriptors}
                  {currentTime}
                  roster={FUTSAL_ROSTER}
                  {activeSelectedPlayer}
                  {activeTeamSide}
                  {targetTagName}
                  {targetTagButtonId}
                  {targetAttachedDescriptorIds}
                  {targetAttachedPlayers}
                  dockMode="bottom"
                  hideToolbar={true}
                  hidePlayersBar={true}
                  onSelectBoard={(id) => projectStore.selectBoard(id)}
                  onImportBoardJson={handleImportBoardJson}
                  onExportBoardJson={handleExportBoardJson}
                  onCategoryPress={handleCategoryPress}
                  onDescriptorPress={handleDescriptorPress}
                  onPlayerPress={handlePlayerPress}
                  onTeamSideChange={(side) => (activeTeamSide = side)}
                  onAddPlayer={(raw) => {
                    const added = projectStore.addRosterPlayer(raw);
                    if (added) handlePlayerPress(added);
                  }}
                  onStopAllContinuous={stopAllContinuousTags}
                  onUndoLastTag={handleUndoLastTag}
                  onUpsertButton={(btn) => projectStore.upsertBoardButton(btn)}
                  onDeleteButton={(id) => projectStore.deleteBoardButton(id)}
                  onOpenFullscreenCanvas={() => (workspaceSubTab = 'coding_board')}
                />
              </div>
            {:else}
              <button
                type="button"
                class="canvas-collapsed-bar"
                onclick={() => (showSpatialCanvas = true)}
              >
                <ChevronUp size={12} />
                <span>Papan kanvas disembunyikan. Klik di sini untuk menampilkan. Tombol kiri & keyboard tetap berjalan.</span>
                {#if activeContinuousList.length > 0}
                  <span class="dock-live-pill">● {activeContinuousList.length} Merekam</span>
                {/if}
              </button>
            {/if}
          </div>

          <!-- RIGHT COLUMN: COMPACT CLIPS / PLAYLIST SIDEBAR (250px) -->
          <div class="panel-column right-clips-sidebar">
            <div class="right-tabs-bar">
              <button
                type="button"
                class="tab-pill"
                class:active={rightPanelTab === 'clips'}
                onclick={() => (rightPanelTab = 'clips')}
              >
                <Scissors size={12} />
                <span>Klip ({filteredTags.length})</span>
              </button>
              <button
                type="button"
                class="tab-pill"
                class:active={rightPanelTab === 'playlist'}
                onclick={() => (rightPanelTab = 'playlist')}
              >
                <ListOrdered size={12} />
                <span>Playlist ({currentPlaylist ? currentPlaylist.items.length : 0})</span>
              </button>
            </div>

            {#if rightPanelTab === 'clips'}
            <!-- PANEL A: SUPER-COMPACT 1-ROW CLIP LIST -->
            <div class="actions-list-panel">
              <div class="list-header">
                <div class="list-filter-row">
                  <div class="search-wrap-blue">
                    <Search size={12} />
                    <input
                      type="text"
                      placeholder="Cari klip, label, pemain..."
                      bind:value={searchQuery}
                      class="search-input-blue"
                    />
                  </div>
                  <select bind:value={filterCategory} class="filter-select-blue">
                    <option value="ALL">Semua Aksi</option>
                    {#each availableFilterCategories as catName}
                      <option value={catName}>{catName}</option>
                    {/each}
                  </select>
                </div>
              </div>

              <div class="list-items-scroll">
                {#if filteredTags.length === 0}
                  <div class="empty-list-futsal">
                    <div class="empty-icon">✂️</div>
                    <h4 class="empty-title">Belum Ada Klip</h4>
                    <p class="empty-guide">
                      Putar video (<strong>Spasi</strong>) lalu klik tombol <strong>Tag Kontinu / 1-Klik</strong> atau tekan <strong>Hotkey</strong>.
                    </p>
                  </div>
                {:else}
                  {#each filteredTags as tag (tag.id)}
                    {@const clipPlayers = tag.playersInvolved && tag.playersInvolved.length > 0 ? tag.playersInvolved : tag.playerLabel ? [tag.playerLabel] : []}
                    {@const hasMetaRow = Boolean(tag.labels?.length) || clipPlayers.length > 1 || Boolean(tag.drawings?.length)}
                    <!-- svelte-ignore a11y_click_events_have_key_events -->
                    <div
                      class="clip-row"
                      class:active-loop={activeLoopClip?.id === tag.id}
                      class:selected-clip={selectedClipId === tag.id}
                      onclick={() => (selectedClipId = tag.id)}
                      ondblclick={() => openTagEditor(tag)}
                      role="button"
                      tabindex="0"
                    >
                      <div class="clip-row-main">
                        <span class="clip-color-bar" style="background-color: {tag.color};"></span>
                        <span class="clip-cat-chip" title={tag.title}>
                          {#if tag.isContinuous}<span class="clip-cont-dot">●</span>{/if}
                          {tag.category}
                        </span>
                        <span class="clip-time-mono">
                          {formatTime(tag.startTime).slice(0, 5)}–{formatTime(tag.endTime).slice(0, 5)}
                        </span>
                        <span class="clip-dur-micro">{(tag.endTime - tag.startTime).toFixed(1)}s</span>
                      </div>

                      <div class="clip-row-sub">
                        <div class="clip-sub-left">
                          {#if clipPlayers.length > 0}
                            <span class="clip-player-chip" title={clipPlayers.join(', ')}>
                              <User size={9} />
                              <span>{clipPlayers[0]}{clipPlayers.length > 1 ? ` +${clipPlayers.length - 1}` : ''}</span>
                            </span>
                          {/if}
                        </div>

                        <div class="clip-row-actions">
                          <button
                            type="button"
                            class="icon-act-btn"
                            class:playing={activeLoopClip?.id === tag.id}
                            onclick={(e) => {
                              e.stopPropagation();
                              if (activeLoopClip?.id === tag.id) stopClipLoop();
                              else playClipLoop(tag);
                            }}
                            title="Putar / Loop Klip"
                          >
                            {#if activeLoopClip?.id === tag.id}
                              <Pause size={10} />
                            {:else}
                              <Play size={10} />
                            {/if}
                          </button>
                          <button
                            type="button"
                            class="icon-act-btn icon-draw"
                            onclick={(e) => {
                              e.stopPropagation();
                              projectStore.openClipInTelestrator(tag);
                            }}
                            title="Gambar / Studio Telestrasi"
                          >
                            <Sparkles size={10} />
                          </button>
                          <button
                            type="button"
                            class="icon-act-btn"
                            onclick={(e) => {
                              e.stopPropagation();
                              openTagEditor(tag);
                            }}
                            title="Edit Tag, Label & Pemain"
                          >
                            <Edit3 size={10} />
                          </button>
                          <button
                            type="button"
                            class="icon-act-btn"
                            onclick={(e) => {
                              e.stopPropagation();
                              handleCopyClipMeta(tag);
                            }}
                            title="Salin Label & Pemain"
                          >
                            <Copy size={10} />
                          </button>
                          {#if copiedMeta}
                            <button
                              type="button"
                              class="icon-act-btn icon-paste"
                              onclick={(e) => {
                                e.stopPropagation();
                                handlePasteClipMeta(tag);
                              }}
                              title="Tempel Label & Pemain"
                            >
                              <Clipboard size={10} />
                            </button>
                          {/if}
                          <button
                            type="button"
                            class="icon-act-btn"
                            onclick={(e) => {
                              e.stopPropagation();
                              handleAddToPlaylist(tag);
                            }}
                            title="Tambah ke Playlist"
                          >
                            <Plus size={10} />
                          </button>
                          <button
                            type="button"
                            class="icon-act-btn icon-del"
                            onclick={(e) => {
                              e.stopPropagation();
                              projectStore.deleteTag(tag.id);
                            }}
                            title="Hapus Klip"
                          >
                            <Trash2 size={10} />
                          </button>
                        </div>
                      </div>

                      {#if hasMetaRow}
                        <div class="clip-row-labels">
                          {#if clipPlayers.length > 1}
                            {#each clipPlayers.slice(1) as extraP}
                              <span class="micro-pill micro-player">{extraP}</span>
                            {/each}
                          {/if}
                          {#if tag.labels && tag.labels.length > 0}
                            {#each tag.labels as lbl}
                              <span class="micro-pill" style="border-color: {lbl.color || '#38bdf8'};">
                                <i class="micro-dot" style="background-color: {lbl.color || '#38bdf8'};"></i>
                                {lbl.name}
                              </span>
                            {/each}
                          {/if}
                          {#if tag.drawings && tag.drawings.length > 0}
                            <span class="micro-pill micro-draw">★ {tag.drawings.length} gambar</span>
                          {/if}
                        </div>
                      {/if}
                    </div>
                  {/each}
                {/if}
              </div>
            </div>
          {:else}
            <!-- PANEL B: PLAYLIST ANTRIAN (PRESENTATION QUEUE) -->
            <div class="playlist-quick-panel">
              <div class="playlist-quick-header">
                <span class="pl-quick-title">Antrian Playlist Presentasi</span>
                <span class="pl-quick-count">{currentPlaylist ? currentPlaylist.items.length : 0} Klip</span>
              </div>

              <div class="playlist-items-scroll">
                {#if !currentPlaylist || currentPlaylist.items.length === 0}
                  <div class="empty-list-futsal">
                    <div class="empty-icon">📋</div>
                    <h4 class="empty-title">Playlist Masih Kosong</h4>
                    <p class="empty-guide">
                      Klik tombol <strong>+Playlist</strong> pada kartu aksi untuk mengumpulkan momen terbaik ke playlist siaran.
                    </p>
                  </div>
                {:else}
                  {#each currentPlaylist.items as item, idx}
                    <div class="playlist-quick-row">
                      <span class="pl-order">{idx + 1}</span>
                      <div class="pl-info">
                        <span class="pl-name">{item.title}</span>
                        <span class="pl-meta">{formatTime(item.tagEvent.startTime)} - {formatTime(item.tagEvent.endTime)}</span>
                      </div>
                      <button
                        class="btn-pl-remove"
                        onclick={() => {
                          currentPlaylist.items.splice(idx, 1);
                        }}
                        title="Hapus dari playlist"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  {/each}
                {/if}
              </div>

              <div class="playlist-quick-footer">
                <button class="btn-open-export" onclick={() => projectStore.setStage('playlist_export')}>
                  <span>Buka di Playlist & Ekspor</span>
                  <ArrowRight size={13} />
                </button>
              </div>
            </div>
          {/if}
        </div>
        </div>

        <!-- BOTTOM TIER (100% FULL WIDTH): RESIZE HANDLE + ALL-CATEGORY LINIMASA -->
        <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
        <div
          class="linimasa-resize-handle"
          class:dragging={isResizingLinimasa}
          onpointerdown={startLinimasaResize}
          role="separator"
          aria-orientation="horizontal"
          title="Seret atas/bawah untuk mengubah tinggi Linimasa"
        >
          <span class="resize-pill"></span>
        </div>

        <div class="linimasa-bottom-tier" style="height: {linimasaHeight}px;">
          <LinimasaTimeline
            board={activeBoard}
            tags={projectStore.tags}
            {activeContinuousTags}
            {currentTime}
            {duration}
            {inPoint}
            {leadTimeSeconds}
            {lagTimeSeconds}
            {selectedClipId}
            activeLoopClipId={activeLoopClip?.id ?? null}
            onSeek={seekTo}
            onSelectClip={(tag) => {
              selectedClipId = tag.id;
              playClipLoop(tag);
            }}
            onEditClip={openTagEditor}
            onTrimClip={handleTrimClip}
            onChangeLead={(sec) => (leadTimeSeconds = sec)}
            onChangeLag={(sec) => (lagTimeSeconds = sec)}
          />
        </div>
      </div>
    {:else if workspaceSubTab === 'coding_board'}
      <!-- MODE 2: FULLSCREEN MOMEN & ONCE SPORT ACTION PAD -->
      <div class="momen-fullscreen-pad">
        <div class="mini-transport-strip">
          <div class="mts-left">
            <button type="button" class="btn-overlay-play" onclick={togglePlay} title="Play/Pause (Spasi)">
              {#if isPlaying}
                <Pause size={15} />
              {:else}
                <Play size={15} />
              {/if}
            </button>
            <div class="time-display">
              <span class="curr-time">{formatTime(currentTime)}</span>
              <span class="time-sep">/</span>
              <span class="dur-time">{formatTime(duration)}</span>
            </div>
            <button type="button" class="btn-ctrl-sm" onclick={() => seekTo(currentTime - 5)}>-5s</button>
            <button type="button" class="btn-ctrl-sm" onclick={() => seekTo(currentTime + 5)}>+5s</button>
          </div>
          <div class="mts-right">
            <span class="mts-clips-count">Total Klip: <strong>{projectStore.tags.length}</strong></span>
            {#if activeContinuousList.length > 0}
              <span class="dock-live-pill">
                ● {activeContinuousList.map((c) => c.name).join(' · ')}
              </span>
            {/if}
          </div>
        </div>

        <VisualCodingBoard
          board={activeBoard}
          boards={projectStore.boards}
          initialSelectedButtonId={codingBoardFocusButtonId}
          onSelectBoard={(id) => projectStore.selectBoard(id)}
          onCreateBoard={() => projectStore.createNewBoard()}
          onUpdateBoardMeta={(patch) => projectStore.updateActiveBoardMeta(patch)}
          onImportBoardJson={handleImportBoardJson}
          onExportBoardJson={handleExportBoardJson}
          onUpsertButton={(btn) => projectStore.upsertBoardButton(btn)}
          onDeleteButton={(id) => projectStore.deleteBoardButton(id)}
          onToggleLink={(src, dst) => projectStore.toggleBoardButtonLink(src, dst)}
          onBackToVideo={() => {
            codingBoardFocusButtonId = null;
            workspaceSubTab = 'tagging';
          }}
        />
      </div>
    {:else if workspaceSubTab === 'lineup'}
      <!-- MODE 3: FUTSAL ROSTER & LINEUP COURT (MOMEN SPORTS STYLE) -->
      <div class="lineup-fullscreen">
        <div class="lineup-header">
          <h3>Susunan Pemain & Roster Futsal (Starting 5 & Cadangan)</h3>
          <p>Klik pemain untuk menyaring klip kejadian yang melibatkan pemain tersebut.</p>
        </div>

        <div class="lineup-grid-layout">
          <!-- 2D MINI COURT POSITIONING -->
          <div class="pitch-tactical-display">
            <div class="pitch-court">
              <div class="pitch-center-circle"></div>
              <div class="pitch-center-line"></div>
              <div class="pitch-penalty-area"></div>

              <!-- Posisi Pemain Futsal FIFA -->
              <!-- Kiper -->
              <div class="player-marker kiper-pos" onclick={() => { filterPlayer = '#1 Kiper'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#1</span>
                <span class="pos-name">Kiper</span>
              </div>
              <!-- Anchor -->
              <div class="player-marker anchor-pos" onclick={() => { filterPlayer = '#4 Anchor'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#4</span>
                <span class="pos-name">Anchor</span>
              </div>
              <!-- Flank Kiri -->
              <div class="player-marker flank-l-pos" onclick={() => { filterPlayer = '#7 Flank Kiri'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#7</span>
                <span class="pos-name">Flank Kiri</span>
              </div>
              <!-- Flank Kanan -->
              <div class="player-marker flank-r-pos" onclick={() => { filterPlayer = '#11 Flank Kanan'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#11</span>
                <span class="pos-name">Flank Kanan</span>
              </div>
              <!-- Pivot -->
              <div class="player-marker pivot-pos" onclick={() => { filterPlayer = '#9 Pivot'; workspaceSubTab = 'tagging'; }}>
                <span class="pos-badge">#9</span>
                <span class="pos-name">Pivot</span>
              </div>
            </div>
          </div>

          <!-- ROSTER TABLE STATS -->
          <div class="roster-stats-card">
            <h4>Statistik Klip per Pemain</h4>
            <div class="roster-table-wrap">
              <table class="roster-table">
                <thead>
                  <tr>
                    <th>No</th>
                    <th>Nama / Posisi</th>
                    <th>Peran</th>
                    <th>Total Klip</th>
                    <th>Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {#each FUTSAL_ROSTER as p}
                    {@const label = projectStore.getPlayerDisplayLabel(p)}
                    {@const count = projectStore.tags.filter((t) => projectStore.normalizePlayerLabel(t.playerLabel) === label).length}
                    <tr>
                      <td><span class="badge-num" style="background-color: {p.color}">{p.num}</span></td>
                      <td class="font-bold">{p.name}</td>
                      <td class="text-muted">{p.role}</td>
                      <td><span class="count-pill">{count} Klip</span></td>
                      <td>
                        <button
                          class="btn-filter-player"
                          onclick={() => {
                            filterPlayer = label;
                            workspaceSubTab = 'tagging';
                          }}
                        >
                          Lihat Klip
                        </button>
                      </td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    {/if}
  </main>

  <!-- DEDICATED TAG & LABEL MODAL -->
  {#if activeEditingTag && showTagLabelEditor}
    <TagLabelEditorModal
      tag={activeEditingTag}
      isOpen={showTagLabelEditor}
      onClose={() => (showTagLabelEditor = false)}
      onSave={(updated) => {
        projectStore.updateTag(updated);
        showTagLabelEditor = false;
      }}
      onDelete={(id) => {
        projectStore.deleteTag(id);
        showTagLabelEditor = false;
      }}
    />
  {/if}

  <!-- STATS MATRIX MODAL (CONDITIONALLY RENDERED ONLY WHEN EXPLICITLY OPENED) -->
  {#if showStatsMatrix}
    <StatsMatrixModal
      isOpen={showStatsMatrix}
      onClose={() => (showStatsMatrix = false)}
      tags={projectStore.tags}
      onPlayTag={(tag) => {
        showStatsMatrix = false;
        playClipLoop(tag);
      }}
      onPlayClips={(clips, title) => {
        showStatsMatrix = false;
        playSequentialClips(clips, title);
      }}
    />
  {/if}
</div>

<style>
  /* ROOT LAYOUT (DEEP SAPPHIRE & BROADCAST BLUE) */
  .tagging-workspace {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background: radial-gradient(circle at 50% 0%, #0c1c38 0%, #060b14 100%);
    color: #f0f6fc;
    overflow: hidden;
    font-family: 'Inter', system-ui, -apple-system, sans-serif;
  }

  /* SLIM TOP SUB-HEADER (34px) */
  .tagging-header {
    min-height: 34px;
    height: 34px;
    background: linear-gradient(180deg, #0b172a 0%, #070e1c 100%);
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 12px;
    box-sizing: border-box;
    flex-shrink: 0;
    gap: 8px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .board-header-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
    min-width: 0;
  }

  .hdr-board-select {
    background: #060b14;
    border: 1px solid #1a355d;
    color: #e2e8f0;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 5px;
    outline: none;
    max-width: 175px;
  }

  .hdr-tool-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0b172a;
    border: 1px solid #1a355d;
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 7px;
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
  }

  .hdr-tool-btn:hover:not(:disabled) {
    color: #ffffff;
    border-color: #38bdf8;
    background: #102442;
  }

  .hdr-tool-btn:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .hdr-stop-btn.has-live {
    background: rgba(220, 38, 38, 0.25);
    border-color: #ef4444;
    color: #fecaca;
  }

  /* WORKSPACE SUBNAV */
  .subnav-segmented {
    display: flex;
    align-items: center;
    gap: 2px;
    background-color: #091322;
    padding: 2px;
    border-radius: 6px;
    border: 1px solid #1a355d;
    flex-shrink: 0;
  }

  .subnav-btn {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .subnav-btn:hover {
    color: #f0f6fc;
    background-color: rgba(255, 255, 255, 0.05);
  }

  .subnav-btn.active {
    background: linear-gradient(135deg, rgba(2, 132, 199, 0.4), rgba(30, 58, 138, 0.6));
    border-color: #38bdf8;
    color: #ffffff;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.25);
  }

  /* NOTIFICATION PILL */
  .notification-pill {
    display: flex;
    align-items: center;
    gap: 5px;
    background-color: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.4);
    color: #34d399;
    padding: 2px 10px;
    border-radius: 20px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(-4px); }
    to { opacity: 1; transform: translateY(0); }
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .btn-label-menu {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #0f2444;
    border: 1px solid #1e3b68;
    color: #38bdf8;
    padding: 3px 9px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-label-menu:hover:not(:disabled) {
    background: #163666;
    border-color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  .btn-label-menu:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .btn-stats-blue {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: #0d233a;
    border: 1px solid #1e4570;
    color: #93c5fd;
    padding: 3px 9px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-stats-blue:hover {
    background-color: #123456;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-next-step {
    display: flex;
    align-items: center;
    gap: 4px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    padding: 3px 10px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(2, 132, 199, 0.35);
    transition: all 0.15s ease;
  }

  .btn-next-step:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.5);
  }

  /* WORKSPACE MAIN */
  .workspace-main {
    flex: 1;
    overflow: hidden;
    position: relative;
  }

  /* 2-TIER MOMEN WORKSPACE */
  .tagging-two-tier {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .tagging-top-tier {
    flex: 1;
    min-height: 0;
    display: grid;
    grid-template-columns: 196px minmax(0, 1fr) 250px;
    overflow: hidden;
  }

  /* LEFT SIDEBAR: TAG & LABEL */
  .left-momen-sidebar {
    height: 100%;
    min-height: 0;
    background: #070f1d;
    border-right: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .left-search-box {
    margin: 6px 6px 4px;
    display: flex;
    align-items: center;
    gap: 5px;
    background: #040912;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 4px 7px;
    flex-shrink: 0;
  }

  .left-search-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    outline: none;
    color: #f8fafc;
    font-size: 10px;
  }

  .left-search-clear {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 0;
    display: flex;
    align-items: center;
  }

  .left-sidebar-scroll {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 4px 6px 8px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .left-section {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .left-section-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #64748b;
    padding: 0 3px;
  }

  .left-sec-cnt {
    color: #38bdf8;
    font-family: 'Fira Code', monospace;
  }

  .left-tag-list {
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .left-tag-row-wrap {
    display: flex;
    align-items: stretch;
    border-radius: 5px;
    background: #0b1629;
    border: 1px solid #152b4f;
    position: relative;
    overflow: hidden;
    transition: all 0.1s ease;
  }

  .left-tag-row-wrap:hover {
    background: #102342;
    border-color: var(--row-col, #38bdf8);
  }

  .left-tag-row-wrap.on {
    background: linear-gradient(90deg, rgba(220, 38, 38, 0.28) 0%, #0b1629 100%);
    border-color: #ef4444;
    box-shadow: inset 0 0 0 1px rgba(239, 68, 68, 0.3);
  }

  .left-tag-row {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 5px;
    padding: 4px 4px 4px 8px;
    background: transparent;
    border: none;
    color: #e2e8f0;
    cursor: pointer;
    text-align: left;
  }

  .ltr-link-ico {
    color: #fb7185;
    display: inline-flex;
    align-items: center;
    flex-shrink: 0;
  }

  .ltr-clip-cnt {
    font-family: 'Fira Code', monospace;
    font-size: 8px;
    font-weight: 800;
    color: #38bdf8;
    background: #060b14;
    border: 1px solid #1a355d;
    border-radius: 999px;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .ltr-edit-btn {
    width: 18px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-left: 1px solid rgba(26, 53, 93, 0.5);
    color: #64748b;
    cursor: pointer;
    opacity: 0;
    padding: 0;
    flex-shrink: 0;
    transition: opacity 0.12s, color 0.12s;
  }

  .left-tag-row-wrap:hover .ltr-edit-btn {
    opacity: 1;
  }

  .ltr-edit-btn:hover {
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
  }

  .ltr-grip {
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 3px;
  }

  .ltr-switch {
    width: 22px;
    height: 12px;
    border-radius: 999px;
    background: #1e293b;
    border: 1px solid #475569;
    position: relative;
    flex-shrink: 0;
    transition: all 0.14s ease;
  }

  .ltr-switch i {
    position: absolute;
    top: 1px;
    left: 1px;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #94a3b8;
    transition: all 0.14s ease;
  }

  .ltr-switch.on {
    background: #ef4444;
    border-color: #fecaca;
  }

  .ltr-switch.on i {
    left: 11px;
    background: #ffffff;
  }

  .ltr-single-dot {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    border: 2px solid #38bdf8;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .ltr-name {
    flex: 1;
    font-size: 10px;
    font-weight: 700;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ltr-kbd {
    font-family: monospace;
    font-size: 8px;
    font-weight: 800;
    color: #93c5fd;
    background: #060b14;
    border: 1px solid #1e3a5f;
    border-radius: 3px;
    padding: 0 4px;
    flex-shrink: 0;
  }

  .ltr-live-timer {
    font-family: 'Fira Code', monospace;
    font-size: 8px;
    font-weight: 800;
    color: #fecaca;
    flex-shrink: 0;
  }

  .left-label-wrap {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
  }

  .left-desc-chip {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0b1629;
    border: 1px solid #1a355d;
    color: #cbd5e1;
    font-size: 9px;
    font-weight: 700;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    max-width: 100%;
    transition: all 0.12s ease;
  }

  .left-desc-chip:hover {
    border-color: var(--desc-col, #38bdf8);
    color: #ffffff;
  }

  .left-desc-chip.dim {
    opacity: 0.28;
  }

  .left-desc-chip.attached {
    background: #102a52;
    border-color: var(--desc-col, #38bdf8);
    color: #ffffff;
  }

  .ldc-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .ldc-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .ldc-auto {
    font-size: 7px;
    font-weight: 900;
    color: #34d399;
    background: rgba(16, 185, 129, 0.15);
    padding: 0 3px;
    border-radius: 2px;
  }

  /* PLAYER COLUMN */
  .player-column {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    overflow: hidden;
    border-right: 1px solid #1a355d;
    background-color: #060b14;
  }

  .video-container {
    flex: 1;
    min-height: 170px;
    background-color: #000000;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .match-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .empty-video-placeholder {
    text-align: center;
    padding: 30px;
    color: #64748b;
  }

  .futsal-glow-orb {
    font-size: 40px;
    margin-bottom: 12px;
    filter: drop-shadow(0 0 16px rgba(56, 189, 248, 0.4));
  }

  .placeholder-title {
    font-size: 15px;
    font-weight: 700;
    color: #f0f6fc;
    margin-bottom: 6px;
  }

  .placeholder-desc {
    font-size: 11px;
    max-width: 380px;
    margin: 0 auto 16px;
    line-height: 1.5;
  }

  .btn-sample-inline {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  /* PLAYLIST QUEUE FLOATING BANNER */
  .queue-status-banner {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(8, 22, 42, 0.92);
    border: 1px solid #0284c7;
    border-radius: 20px;
    padding: 6px 14px;
    display: flex;
    align-items: center;
    gap: 14px;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.6), 0 0 16px rgba(14, 165, 233, 0.4);
    backdrop-filter: blur(8px);
    z-index: 25;
    animation: fadeInSlideDown 0.2s ease-out;
  }

  @keyframes fadeInSlideDown {
    from {
      opacity: 0;
      transform: translate(-50%, -10px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  .queue-counter {
    font-size: 11px;
    font-weight: 700;
    color: #38bdf8;
    font-family: monospace;
  }

  .btn-queue-step {
    background: rgba(14, 165, 233, 0.15);
    border: 1px solid #1e4570;
    color: #f0f6fc;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 10px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .btn-queue-step:hover:not(:disabled) {
    background: #0284c7;
    color: #ffffff;
  }

  .btn-queue-step:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .btn-queue-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    padding: 4px 6px;
    border-radius: 4px;
    font-size: 11px;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all 0.15s ease;
  }

  .btn-queue-close:hover {
    color: #ffffff;
    background: rgba(239, 68, 68, 0.4);
  }

  /* PINNED LIVE PLAYERS BAR DIRECTLY UNDER VIDEO */
  .pinned-players-bar {
    height: 32px;
    min-height: 32px;
    background: #081223;
    border-top: 1px solid #162e54;
    border-bottom: 1px solid #162e54;
    display: flex;
    align-items: center;
    gap: 6px;
    padding: 0 8px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .target-badge {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #060b14;
    border: 1px solid #1e3a5f;
    padding: 2px 7px;
    border-radius: 4px;
    max-width: 140px;
    flex-shrink: 0;
  }

  .target-badge.live {
    border-color: #ef4444;
    background: rgba(220, 38, 38, 0.2);
  }

  .target-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #38bdf8;
    flex-shrink: 0;
  }

  .target-badge.live .target-dot {
    background: #ef4444;
    animation: pulseLiveBlock 1s infinite;
  }

  .target-lbl {
    font-size: 9px;
    font-weight: 800;
    color: #e2e8f0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .team-side-pill {
    font-size: 9px;
    font-weight: 900;
    padding: 2px 6px;
    border-radius: 4px;
    background: #0284c7;
    color: #ffffff;
    border: 1px solid #38bdf8;
    cursor: pointer;
    flex-shrink: 0;
  }

  .team-side-pill.away {
    background: #b91c1c;
    border-color: #f87171;
  }

  .pinned-players-strip {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 4px;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .pinned-players-strip::-webkit-scrollbar {
    display: none;
  }

  .pinned-player-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0b1629;
    border: 1px solid #1a355d;
    color: #cbd5e1;
    font-size: 9px;
    font-weight: 700;
    padding: 2px 6px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .pinned-player-pill:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .pinned-player-pill.primary {
    border-color: #38bdf8;
    background: #0d2647;
    color: #ffffff;
  }

  .pinned-player-pill.attached {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.2);
    color: #d1fae5;
  }

  .pp-num {
    font-size: 8px;
    font-weight: 900;
    color: #ffffff;
    padding: 0 4px;
    border-radius: 999px;
  }

  .pp-name {
    white-space: nowrap;
  }

  .pinned-add-player {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #050a14;
    border: 1px solid #1a355d;
    border-radius: 4px;
    padding: 2px 5px;
    width: 82px;
    flex-shrink: 0;
  }

  .pinned-add-input {
    width: 100%;
    background: transparent;
    border: none;
    outline: none;
    color: #f8fafc;
    font-size: 9px;
  }

  /* CLEAN MOMEN TRANSPORT BAR UNDER VIDEO */
  .momen-transport-bar {
    height: 36px;
    min-height: 36px;
    background: #091322;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 0 8px;
    flex-shrink: 0;
    overflow: hidden;
  }

  .mtb-left {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .btn-momen-play {
    width: 28px;
    height: 28px;
    border-radius: 50%;
    background: linear-gradient(135deg, #ef4444, #dc2626);
    border: 1px solid #fca5a5;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
    flex-shrink: 0;
    box-shadow: 0 2px 8px rgba(239, 68, 68, 0.35);
  }

  .btn-momen-play:hover {
    filter: brightness(1.1);
  }

  .curr-time-hero {
    font-family: 'Fira Code', monospace;
    font-size: 13px;
    font-weight: 900;
    color: #ffffff;
    min-width: 48px;
  }

  .play-status-pill {
    font-size: 9px;
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 999px;
    background: #0f172a;
    border: 1px solid #334155;
    color: #94a3b8;
    white-space: nowrap;
  }

  .play-status-pill.running {
    background: rgba(16, 185, 129, 0.18);
    border-color: #10b981;
    color: #34d399;
  }

  .mtb-scrubber {
    flex: 1;
    min-width: 70px;
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .video-range-slider {
    flex: 1;
    accent-color: #ef4444;
    height: 4px;
    cursor: pointer;
  }

  .dur-total-lbl {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    color: #94a3b8;
    white-space: nowrap;
  }

  .mtb-right {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .btn-overlay-play {
    width: 30px;
    height: 30px;
    border-radius: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border: 1px solid #38bdf8;
    color: #ffffff;
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    cursor: pointer;
  }

  .time-display {
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    font-weight: 700;
    color: #38bdf8;
    background: #091322;
    padding: 4px 8px;
    border-radius: 4px;
    border: 1px solid #1a355d;
    white-space: nowrap;
  }

  .time-sep {
    color: #64748b;
    margin: 0 2px;
  }

  .dur-time {
    color: #94a3b8;
  }

  .btn-ctrl-sm {
    background-color: #0b172a;
    border: 1px solid #1a355d;
    color: #94a3b8;
    padding: 3px 5px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    display: inline-flex;
    align-items: center;
    gap: 2px;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
  }

  .btn-ctrl-sm:hover {
    color: #38bdf8;
    border-color: #38bdf8;
  }

  .btn-inout {
    background-color: #0b172a;
    border: 1px solid #1a355d;
    color: #93c5fd;
    padding: 3px 5px;
    border-radius: 4px;
    font-size: 9px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
  }

  .btn-inout.active {
    background-color: #0284c7;
    color: #ffffff;
    border-color: #38bdf8;
  }

  .speed-selector-group {
    display: flex;
    align-items: center;
    background-color: #060b14;
    border: 1px solid #1a355d;
    border-radius: 4px;
    overflow: hidden;
  }

  .speed-pill {
    background: transparent;
    border: none;
    color: #64748b;
    font-size: 9px;
    font-weight: 700;
    padding: 3px 5px;
    cursor: pointer;
  }

  .speed-pill.active {
    background-color: #0284c7;
    color: #ffffff;
  }

  .btn-draw-quick {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: rgba(239, 68, 68, 0.18);
    border: 1px solid rgba(239, 68, 68, 0.55);
    color: #fecaca;
    font-size: 9px;
    font-weight: 800;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-draw-quick:hover {
    background: #dc2626;
    color: #ffffff;
  }

  .btn-canvas-toggle {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    background: #0b172a;
    border: 1px solid #1e3a5f;
    color: #93c5fd;
    font-size: 9px;
    font-weight: 700;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-canvas-toggle.open {
    border-color: #38bdf8;
    color: #ffffff;
  }

  /* CENTER COLLAPSIBLE SPATIAL CANVAS */
  .canvas-resize-handle,
  .linimasa-resize-handle {
    height: 5px;
    background: #0a1426;
    border-top: 1px solid #162e54;
    border-bottom: 1px solid #162e54;
    display: flex;
    align-items: center;
    justify-content: center;
    cursor: row-resize;
    flex-shrink: 0;
  }

  .canvas-resize-handle:hover,
  .canvas-resize-handle.dragging,
  .linimasa-resize-handle:hover,
  .linimasa-resize-handle.dragging {
    background: #133059;
  }

  .resize-pill {
    width: 36px;
    height: 2px;
    border-radius: 999px;
    background: #38bdf8;
    opacity: 0.65;
  }

  .center-spatial-canvas {
    flex-shrink: 0;
    max-height: 25vh;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  .canvas-collapsed-bar {
    height: 22px;
    min-height: 22px;
    width: 100%;
    background: #081223;
    border: none;
    border-top: 1px solid #162e54;
    color: #93c5fd;
    font-size: 9px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    cursor: pointer;
    flex-shrink: 0;
  }

  .canvas-collapsed-bar:hover {
    color: #ffffff;
    background: #0d1e38;
  }

  .linimasa-bottom-tier {
    width: 100%;
    flex-shrink: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
  }

  @keyframes pulseLiveBlock {
    50% {
      opacity: 0.65;
    }
  }

  .dock-live-pill {
    font-size: 9px;
    font-weight: 800;
    color: #fecaca;
    background: rgba(220, 38, 38, 0.25);
    border: 1px solid #ef4444;
    padding: 1px 7px;
    border-radius: 999px;
  }

  /* PANEL COLUMN (RIGHT 250px) */
  .panel-column.right-clips-sidebar {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 0;
    background-color: #080f1c;
    overflow: hidden;
  }

  /* RIGHT TABS BAR */
  .right-tabs-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    padding: 8px 12px;
    background: #091322;
    border-bottom: 1px solid #1a355d;
  }

  .tab-pill {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .tab-pill:hover {
    color: #ffffff;
    background-color: rgba(255, 255, 255, 0.05);
  }

  .tab-pill.active {
    background: #0d1e38;
    border-color: #1a355d;
    color: #38bdf8;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
  }

  /* ACTIONS LIST PANEL */
  .actions-list-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background-color: #080f1c;
  }

  .list-header {
    padding: 8px 12px;
    background-color: #091322;
    border-bottom: 1px solid #1a355d;
  }

  .list-filter-row {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .search-wrap-blue {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #060b14;
    border: 1px solid #1a355d;
    padding: 5px 8px;
    border-radius: 5px;
  }

  .search-input-blue {
    background: transparent;
    border: none;
    outline: none;
    color: #ffffff;
    font-size: 10px;
    width: 100%;
  }

  .filter-select-blue {
    background-color: #060b14;
    border: 1px solid #1a355d;
    color: #93c5fd;
    padding: 5px 8px;
    border-radius: 5px;
    font-size: 10px;
    outline: none;
  }

  .list-items-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .empty-list-futsal {
    text-align: center;
    padding: 24px 16px;
    color: #64748b;
  }

  .empty-icon {
    font-size: 28px;
    margin-bottom: 8px;
  }

  .empty-title {
    font-size: 12px;
    font-weight: 700;
    color: #f0f6fc;
    margin-bottom: 4px;
  }

  .empty-guide {
    font-size: 10px;
    line-height: 1.5;
    color: #94a3b8;
  }

  /* SUPER-COMPACT 1-ROW CLIP LIST (MOMEN STYLE) */
  .clip-row {
    background: #0b1629;
    border: 1px solid #152b4f;
    border-radius: 6px;
    padding: 5px 7px;
    display: flex;
    flex-direction: column;
    gap: 3px;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .clip-row:hover {
    border-color: #2563eb;
    background: #102240;
  }

  .clip-row.active-loop {
    border-color: #38bdf8;
    background: linear-gradient(90deg, #102e5c 0%, #0b1629 100%);
  }

  .clip-row.selected-clip {
    box-shadow: inset 0 0 0 1px rgba(56, 189, 248, 0.45);
  }

  .clip-row-main {
    display: flex;
    align-items: center;
    gap: 5px;
    min-width: 0;
  }

  .clip-color-bar {
    width: 3px;
    height: 14px;
    border-radius: 2px;
    flex-shrink: 0;
  }

  .clip-cat-chip {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 800;
    color: #f8fafc;
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clip-row-sub {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 4px;
    padding-left: 8px;
    min-width: 0;
  }

  .clip-sub-left {
    display: flex;
    align-items: center;
    min-width: 0;
    flex: 1;
  }

  .clip-cont-dot {
    color: #ef4444;
    font-size: 8px;
  }

  .clip-time-mono {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    color: #38bdf8;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .clip-dur-micro {
    font-size: 8px;
    color: #64748b;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .clip-player-chip {
    display: inline-flex;
    align-items: center;
    gap: 2px;
    font-size: 9px;
    font-weight: 700;
    color: #93c5fd;
    background: #060b14;
    border: 1px solid #1a355d;
    border-radius: 3px;
    padding: 0 4px;
    max-width: 78px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    flex-shrink: 1;
    min-width: 0;
  }

  .clip-row-actions {
    display: flex;
    align-items: center;
    gap: 2px;
    margin-left: auto;
    flex-shrink: 0;
  }

  .icon-act-btn {
    width: 20px;
    height: 20px;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #060b14;
    border: 1px solid #1a355d;
    color: #94a3b8;
    border-radius: 4px;
    cursor: pointer;
    padding: 0;
  }

  .icon-act-btn:hover {
    color: #ffffff;
    border-color: #38bdf8;
  }

  .icon-act-btn.playing {
    background: #0284c7;
    color: #ffffff;
    border-color: #38bdf8;
  }

  .icon-act-btn.icon-draw {
    color: #38bdf8;
  }

  .icon-act-btn.icon-paste {
    color: #34d399;
    border-color: rgba(16, 185, 129, 0.45);
  }

  .icon-act-btn.icon-del:hover {
    color: #ef4444;
    border-color: #ef4444;
  }

  .clip-row-labels {
    display: flex;
    flex-wrap: wrap;
    gap: 3px;
    padding-left: 8px;
  }

  .micro-pill {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 8px;
    font-weight: 600;
    color: #cbd5e1;
    background: #060b14;
    border: 1px solid #1a355d;
    border-radius: 3px;
    padding: 0 5px;
  }

  .micro-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    display: inline-block;
  }

  .micro-player {
    color: #38bdf8;
    border-color: rgba(56, 189, 248, 0.35);
  }

  .micro-draw {
    color: #fbbf24;
    border-color: rgba(245, 158, 11, 0.35);
  }

  /* PLAYLIST QUICK PANEL */
  .playlist-quick-panel {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .playlist-quick-header {
    padding: 10px 12px;
    background-color: #0b1528;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .pl-quick-title {
    font-size: 11px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .pl-quick-count {
    font-size: 9px;
    font-weight: 700;
    color: #38bdf8;
    background: #060b14;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .playlist-items-scroll {
    flex: 1;
    overflow-y: auto;
    padding: 8px 12px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .playlist-quick-row {
    background: #0d1e38;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 6px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .pl-order {
    font-family: 'Fira Code', monospace;
    font-size: 9px;
    font-weight: 900;
    color: #38bdf8;
    background: #060b14;
    width: 18px;
    height: 18px;
    border-radius: 3px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pl-info {
    flex: 1;
    display: flex;
    flex-direction: column;
  }

  .pl-name {
    font-size: 10px;
    font-weight: 700;
    color: #f0f6fc;
  }

  .pl-meta {
    font-size: 8px;
    color: #94a3b8;
  }

  .btn-pl-remove {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
  }

  .btn-pl-remove:hover {
    color: #ef4444;
  }

  .playlist-quick-footer {
    padding: 10px 12px;
    background: #091322;
    border-top: 1px solid #1a355d;
  }

  .btn-open-export {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: 1px solid #38bdf8;
    padding: 8px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  /* MODE 2: FULLSCREEN MOMEN & ONCE SPORT PAD */
  .momen-fullscreen-pad {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #060b14;
  }

  .mini-transport-strip {
    height: 44px;
    padding: 0 14px;
    background: #091322;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    flex-shrink: 0;
  }

  .mts-left,
  .mts-right {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .mts-clips-count {
    font-size: 11px;
    color: #93c5fd;
  }

  .mts-clips-count strong {
    color: #ffffff;
  }

  /* MODE 3: LINEUP FULLSCREEN */
  .lineup-fullscreen {
    width: 100%;
    height: 100%;
    overflow-y: auto;
    padding: 18px 24px;
    box-sizing: border-box;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .lineup-header h3 {
    margin: 0 0 4px;
    font-size: 14px;
    font-weight: 800;
    color: #38bdf8;
  }

  .lineup-header p {
    margin: 0;
    font-size: 11px;
    color: #94a3b8;
  }

  .lineup-grid-layout {
    display: grid;
    grid-template-columns: 460px 1fr;
    gap: 20px;
  }

  .pitch-tactical-display {
    background: #091322;
    border: 1px solid #1a355d;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pitch-court {
    width: 400px;
    height: 240px;
    background: linear-gradient(180deg, #0b203c 0%, #061122 100%);
    border: 2px solid #38bdf8;
    border-radius: 8px;
    position: relative;
    overflow: hidden;
  }

  .pitch-center-circle {
    position: absolute;
    top: 50%;
    left: 50%;
    width: 60px;
    height: 60px;
    border: 1px solid rgba(56, 189, 248, 0.4);
    border-radius: 50%;
    transform: translate(-50%, -50%);
  }

  .pitch-center-line {
    position: absolute;
    top: 0;
    bottom: 0;
    left: 50%;
    width: 1px;
    background: rgba(56, 189, 248, 0.4);
  }

  .pitch-penalty-area {
    position: absolute;
    left: 0;
    top: 50%;
    width: 60px;
    height: 120px;
    border: 1px solid rgba(56, 189, 248, 0.4);
    border-left: none;
    transform: translateY(-50%);
    border-radius: 0 40px 40px 0;
  }

  .player-marker {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    cursor: pointer;
    transition: transform 0.15s;
  }

  .player-marker:hover {
    transform: scale(1.15);
  }

  .kiper-pos { left: 24px; top: 100px; }
  .anchor-pos { left: 120px; top: 100px; }
  .flank-l-pos { left: 220px; top: 40px; }
  .flank-r-pos { left: 220px; top: 160px; }
  .pivot-pos { left: 320px; top: 100px; }

  .pos-badge {
    width: 22px;
    height: 22px;
    border-radius: 50%;
    background: #0284c7;
    border: 1px solid #ffffff;
    color: #ffffff;
    font-size: 10px;
    font-weight: 900;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .pos-name {
    font-size: 9px;
    font-weight: 700;
    color: #f0f6fc;
    background: rgba(6, 11, 20, 0.85);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .roster-stats-card {
    background: #0b1528;
    border: 1px solid #1a355d;
    border-radius: 12px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .roster-stats-card h4 {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    color: #38bdf8;
  }

  .roster-table-wrap {
    overflow-x: auto;
  }

  .roster-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
  }

  .roster-table th {
    background: #060b14;
    color: #94a3b8;
    padding: 8px 10px;
    text-align: left;
    border-bottom: 1px solid #1a355d;
  }

  .roster-table td {
    padding: 8px 10px;
    border-bottom: 1px solid #142845;
  }

  .badge-num {
    padding: 2px 6px;
    border-radius: 4px;
    color: #ffffff;
    font-weight: 800;
    font-size: 9px;
  }

  .count-pill {
    background: #060b14;
    border: 1px solid #1a355d;
    color: #38bdf8;
    padding: 2px 8px;
    border-radius: 4px;
    font-weight: 700;
  }

  .btn-filter-player {
    background: #0f2444;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-filter-player:hover {
    color: #ffffff;
    border-color: #38bdf8;
  }
</style>

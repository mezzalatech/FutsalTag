<script lang="ts">
  import { onMount, untrack } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    isTauriDesktop,
    parseYouTubeVideoId,
    projectStore,
  } from "$lib/stores/projectStore.svelte";
  import { exportMomenBoardJson } from "$lib/tagging/momenBoards";
  import { renderDrawingsToDataUrl } from "$lib/export/telestrationRenderer";
  import {
    getEffectiveFreezeStopsForTag,
    toSpeedSegmentsExportPayload,
    type FreezeStopExportPayload,
  } from "$lib/export/freezeStops";
  import { buildWatermarkExportPayload } from "$lib/export/watermark";
  import type {
    VideoTagEvent,
    TagCategory,
    TaggingButton,
    TagDescriptor,
    ActiveContinuousTag,
    WhistleMarker,
  } from "$lib/types";
  import StatsMatrixModal from "$lib/components/StatsMatrixModal.svelte";
  import TagLabelEditorModal from "$lib/components/TagLabelEditorModal.svelte";
  import MomenTaggingBoard from "$lib/components/MomenTaggingBoard.svelte";
  import LinimasaTimeline from "$lib/components/LinimasaTimeline.svelte";
  import VisualCodingBoard from "$lib/components/VisualCodingBoard.svelte";
  import MatchMinutesView from "$lib/components/MatchMinutesView.svelte";
  import KeyboardShortcutsModal from "$lib/components/KeyboardShortcutsModal.svelte";
  import QuickExportClipModal from "$lib/components/QuickExportClipModal.svelte";
  import LiveCameraCaptureStage from "$lib/components/LiveCameraCaptureStage.svelte";
  import PhoneRemoteModal from "$lib/components/PhoneRemoteModal.svelte";
  import ShiftActionTimesModal from "$lib/components/ShiftActionTimesModal.svelte";
  import type {
    ExportAspectRatio,
    ExportCrfPreset,
  } from "$lib/export/exportEstimator";
  import {
    shortcutsStore,
    matchesCombo,
  } from "$lib/stores/shortcutsStore.svelte";
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
    Redo2,
    Square,
    UserPlus,
    ChevronDown,
    ChevronUp,
    Check,
    Link2,
    Flag,
    Star,
    ThumbsUp,
    ThumbsDown,
    Timer,
    Volume2,
    Keyboard,
    Camera,
    Columns2,
    Smartphone,
    Clock,
  } from "lucide-svelte";

  // --- REFS & STATE ---
  let videoEl = $state<HTMLVideoElement | null>(null);
  let angle2VideoEl = $state<HTMLVideoElement | null>(null);
  let angle2InputEl = $state<HTMLInputElement | undefined>(undefined);
  let ytHostEl = $state<HTMLDivElement | null>(null);
  let ytPlayer: any = null;
  let ytReady = $state(false);
  let ytError = $state<string | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(projectStore.currentTime || 0);
  let duration = $state(projectStore.duration || 120);
  let hasRestoredInitialTime = projectStore.currentTime <= 0;
  let playbackRate = $state(1.0);
  let reverseRate = $state(0);
  const REVERSE_SPEEDS = [0.5, 1.0, 2.0, 4.0];

  const ytVideoId = $derived(
    projectStore.onlineSourceType === "youtube" && !projectStore.videoSrc
      ? parseYouTubeVideoId(projectStore.onlineVideoUrl)
      : null,
  );

  const activeSecondaryAngle = $derived(
    projectStore.secondaryAngles.find((a) => a.id === projectStore.activeAngleId) ??
      projectStore.secondaryAngles[0] ??
      null,
  );
  const showAngle2 = $derived(
    Boolean(
      activeSecondaryAngle?.videoSrc &&
        (projectStore.angleViewMode === "split" ||
          projectStore.activeAngleId !== "main"),
    ),
  );
  const hideMainAngle = $derived(
    Boolean(
      activeSecondaryAngle?.videoSrc &&
        projectStore.angleViewMode === "single" &&
        projectStore.activeAngleId !== "main",
    ),
  );
  let showShortcutsModal = $state(false);
  let videoOsd = $state<{
    icon: string;
    value: string;
    label: string;
    tone: "sky" | "amber" | "emerald";
  } | null>(null);
  let videoOsdTimer: ReturnType<typeof setTimeout> | null = null;
  const SPEED_STEPS = [0.25, 0.5, 1.0, 1.5, 2.0, 3.0, 4.0];

  // Workspace subtab: 'tagging' | 'coding_board' | 'minutes' | 'lineup'
  let workspaceSubTab = $state<
    "tagging" | "coding_board" | "minutes" | "lineup"
  >("tagging");
  let showKickoffMenu = $state<boolean>(false);
  let whistleMarkers = $state<WhistleMarker[]>([]);
  let isDetectingWhistles = $state<boolean>(false);
  let showWhistleMenu = $state<boolean>(false);
  let microFilter = $state<"all" | "home" | "away" | "fav" | "good" | "eval">(
    "all",
  );
  let exportingQuickClipId = $state<string | null>(null);
  let quickExportModalClip = $state<VideoTagEvent | null>(null);

  // 2-Tier Momen Layout State
  let showSpatialCanvas = $state<boolean>(true);
  let spatialCanvasHeight = $state<number>(155);
  let isResizingCanvas = $state<boolean>(false);
  let linimasaHeight = $state<number>(200);
  let isResizingLinimasa = $state<boolean>(false);
  let rightPanelTab = $state<"clips" | "playlist">("clips");
  let leftSearchQuery = $state<string>("");
  let codingBoardFocusButtonId = $state<string | null>(null);
  let newPlayerInput = $state<string>("");
  let boardImportInputEl = $state<HTMLInputElement | undefined>(undefined);

  // Active selected player & Momen/Once live tagging state
  let activeSelectedPlayer = $state<string>("#9 Pivot");
  let activeTeamSide = $state<"home" | "away">("home");
  let lastTaggedNotification = $state<string | null>(null);
  let activeContinuousTags = $state<Record<string, ActiveContinuousTag>>({});
  let stickyAutoDescriptors = $state<string[]>([]);
  let lastSyncedBoardId = $state<string>("");
  let selectedClipId = $state<string | null>(null);
  let selectedClipIds = $state<string[]>([]);
  let isLinimasaCollapsed = $state<boolean>(false);
  let autoDescribeAfterTag = $state<boolean>(
    typeof localStorage !== "undefined" &&
      localStorage.getItem("futsaltag_auto_describe_after_tag") === "1",
  );
  let showPhoneRemoteModal = $state(false);
  let isPhoneRemoteRunning = $state(false);
  let showShiftTimesModal = $state(false);
  let copiedMeta = $state<{
    labels: TagDescriptor[];
    players: string[];
    teamSide?: "home" | "away";
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
  let activeQueueTitle = $state<string>("");

  // Filters & Search
  let searchQuery = $state("");
  let filterCategory = $state("ALL");
  let filterPlayer = $state("ALL");

  // Modals State
  let showStatsMatrix = $state(false);
  let showTagLabelEditor = $state(false);
  let activeEditingTag = $state<VideoTagEvent | null>(null);
  const liveEditingTag = $derived(
    activeEditingTag
      ? (projectStore.tags.find((t) => t.id === activeEditingTag!.id) ??
          activeEditingTag)
      : null,
  );

  // Unified reactive roster & board
  const FUTSAL_ROSTER = $derived(projectStore.roster);
  const activeBoard = $derived(projectStore.activeBoard);

  $effect(() => {
    const b = activeBoard;
    if (b && b.id !== lastSyncedBoardId) {
      lastSyncedBoardId = b.id;
      stickyAutoDescriptors = b.buttons
        .filter((btn) => btn.kind === "descriptor" && btn.autoAdd)
        .map((btn) => btn.id);
    }
  });

  const activeContinuousList = $derived(Object.values(activeContinuousTags));
  const primaryActiveContinuous = $derived(
    activeContinuousList.length > 0
      ? activeContinuousList[activeContinuousList.length - 1]
      : null,
  );
  const targetExistingClip = $derived(
    projectStore.tags.find((t) => t.id === selectedClipId) ||
      (projectStore.tags.length > 0
        ? projectStore.tags[projectStore.tags.length - 1]
        : null),
  );
  const targetTagName = $derived(
    primaryActiveContinuous
      ? primaryActiveContinuous.name
      : targetExistingClip
        ? targetExistingClip.title
        : null,
  );
  const targetTagButtonId = $derived(
    primaryActiveContinuous
      ? primaryActiveContinuous.buttonId
      : targetExistingClip
        ? targetExistingClip.boardButtonId || targetExistingClip.category
        : null,
  );
  const targetAttachedDescriptorIds = $derived(
    primaryActiveContinuous
      ? primaryActiveContinuous.labels.map((l) => l.id)
      : targetExistingClip?.labels
        ? targetExistingClip.labels.map((l) => l.id)
        : [],
  );
  const targetAttachedPlayers = $derived(
    primaryActiveContinuous
      ? primaryActiveContinuous.players
      : targetExistingClip
        ? targetExistingClip.playersInvolved &&
          targetExistingClip.playersInvolved.length > 0
          ? targetExistingClip.playersInvolved
          : targetExistingClip.playerLabel
            ? [
                projectStore.normalizePlayerLabel(
                  targetExistingClip.playerLabel,
                ),
              ]
            : []
        : [],
  );

  const availableFilterCategories = $derived.by(() => {
    const set = new Set<string>();
    for (const btn of activeBoard.buttons) {
      if (btn.kind === "category") set.add(btn.name);
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
        b.kind === "category" &&
        (!q ||
          b.name.toLowerCase().includes(q) ||
          (b.hotkey && b.hotkey.toLowerCase() === q)),
    );
  });

  const leftDescriptors = $derived.by(() => {
    const q = leftSearchQuery.trim().toLowerCase();
    return activeBoard.buttons.filter(
      (b) =>
        b.kind === "descriptor" && (!q || b.name.toLowerCase().includes(q)),
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
    if (btn.kind === "category") {
      handleCategoryPress(btn);
    } else {
      handleDescriptorPress(btn);
    }
  }

  function openButtonInCodingBoard(buttonId: string | null) {
    codingBoardFocusButtonId = buttonId;
    workspaceSubTab = "coding_board";
  }

  function handleHeaderAddNewButton() {
    const existingCanvas = activeBoard.buttons.filter(
      (b) => b.w > 0 && b.h > 0,
    );
    const idx = existingCanvas.length;
    const newBtn: TaggingButton = {
      id: `TAG_${Date.now().toString(36).toUpperCase()}`,
      name: `TAG ${idx + 1}`,
      kind: "category",
      hotkey: null,
      color: "#0284c7",
      x: 24 + (idx % 6) * 156,
      y: 24 + Math.floor(idx / 6) * 82,
      w: 140,
      h: 68,
      leadSec: 2,
      lagSec: 3,
      continuous: true,
      shape: "rounded",
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
      leftSearchQuery = "";
      return;
    }
    const desc = leftDescriptors[0];
    if (desc) {
      handleDescriptorPress(desc);
      leftSearchQuery = "";
    }
  }

  function submitQuickAddPlayer() {
    const raw = newPlayerInput.trim();
    if (!raw) return;
    const added = projectStore.addRosterPlayer(raw);
    if (added) handlePlayerPress(added);
    newPlayerInput = "";
  }

  function handleTrimClip(tagId: string, newStart: number, newEnd: number) {
    const target = projectStore.tags.find((t) => t.id === tagId);
    if (!target) return;
    projectStore.updateTag({
      ...target,
      startTime: newStart,
      endTime: newEnd,
    });
    notifyUser(
      `Klip dipangkas: ${formatTime(newStart)} - ${formatTime(newEnd)}`,
    );
  }

  function handleMoveClip(tagId: string, newStart: number, newEnd: number) {
    const target = projectStore.tags.find((t) => t.id === tagId);
    if (!target) return;
    projectStore.updateTag({
      ...target,
      startTime: newStart,
      endTime: newEnd,
    });
    notifyUser(
      `Klip digeser ke ${formatTime(newStart)} - ${formatTime(newEnd)}`,
    );
  }

  function buildReassignedTitle(
    target: VideoTagEvent,
    targetCategory: string,
  ): string {
    const oldCat = target.category;
    return target.title.startsWith(oldCat)
      ? targetCategory + target.title.slice(oldCat.length)
      : `${targetCategory} - ${target.playerLabel || target.title}`;
  }

  function handleReassignClipCategory(
    tagId: string,
    targetCategory: string,
    targetColor: string,
    targetButtonId?: string,
  ) {
    const target = projectStore.tags.find((t) => t.id === tagId);
    if (!target || target.category === targetCategory) return;
    projectStore.updateTag({
      ...target,
      title: buildReassignedTitle(target, targetCategory),
      category: targetCategory as TagCategory,
      color: targetColor,
      boardButtonId: targetButtonId || target.boardButtonId,
    });
    notifyUser(`Kategori dipindah ke "${targetCategory}"`);
  }

  function handleBatchChangeCategory(
    ids: string[],
    targetCategory: string,
    targetColor: string,
    targetButtonId?: string,
  ) {
    if (ids.length === 0) return;
    projectStore.runBatchTagMutation(`Ubah Tag ke "${targetCategory}"`, () => {
      for (const id of ids) {
        const target = projectStore.tags.find((t) => t.id === id);
        if (!target || target.category === targetCategory) continue;
        projectStore.updateTag({
          ...target,
          title: buildReassignedTitle(target, targetCategory),
          category: targetCategory as TagCategory,
          color: targetColor,
          boardButtonId: targetButtonId || target.boardButtonId,
        });
      }
    });
    notifyUser(`${ids.length} klip diubah ke "${targetCategory}"`);
  }

  function handleBatchToggleLabel(
    ids: string[],
    desc: { id: string; name: string; color?: string; group?: string | null },
  ) {
    const targets = projectStore.tags.filter((t) => ids.includes(t.id));
    if (targets.length === 0) return;
    const allHave = targets.every((t) =>
      t.labels?.some(
        (l) =>
          l.id === desc.id || l.name.toLowerCase() === desc.name.toLowerCase(),
      ),
    );
    projectStore.runBatchTagMutation(
      allHave ? `Hapus Label "${desc.name}"` : `Tambah Label "${desc.name}"`,
      () => {
        for (const t of targets) {
          const cur = t.labels || [];
          let nextLabels: TagDescriptor[];
          if (allHave) {
            nextLabels = cur.filter(
              (l) =>
                l.id !== desc.id &&
                l.name.toLowerCase() !== desc.name.toLowerCase(),
            );
          } else {
            const cleaned = desc.group
              ? cur.filter((l) => l.group !== desc.group)
              : cur;
            const exists = cleaned.some(
              (l) =>
                l.id === desc.id ||
                l.name.toLowerCase() === desc.name.toLowerCase(),
            );
            nextLabels = exists
              ? cleaned
              : [
                  ...cleaned,
                  {
                    id: desc.id,
                    name: desc.name,
                    color: desc.color || "#38bdf8",
                    group: desc.group ?? null,
                    atTime: Number(currentTime.toFixed(2)),
                  },
                ];
          }
          projectStore.updateTag({ ...t, labels: nextLabels });
        }
      },
    );
    notifyUser(
      allHave
        ? `Label "${desc.name}" dihapus dari ${targets.length} klip`
        : `Label "${desc.name}" diterapkan ke ${targets.length} klip`,
    );
  }

  function handleBatchAddCustomLabel(ids: string[], name: string) {
    const clean = name.trim();
    if (!clean || ids.length === 0) return;
    handleBatchToggleLabel(ids, {
      id: `custom_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
      name: clean,
      color: "#38bdf8",
      group: null,
    });
  }

  function handleBatchTogglePlayer(ids: string[], playerLabel: string) {
    const normPlayer = projectStore.normalizePlayerLabel(playerLabel);
    const targets = projectStore.tags.filter((t) => ids.includes(t.id));
    if (targets.length === 0) return;
    const getPlayers = (t: VideoTagEvent): string[] =>
      t.playersInvolved && t.playersInvolved.length > 0
        ? t.playersInvolved.map((p) => projectStore.normalizePlayerLabel(p))
        : t.playerLabel
          ? [projectStore.normalizePlayerLabel(t.playerLabel)]
          : [];
    const allHave = targets.every((t) => getPlayers(t).includes(normPlayer));
    projectStore.runBatchTagMutation(
      allHave ? `Hapus Pemain ${normPlayer}` : `Tambah Pemain ${normPlayer}`,
      () => {
        for (const t of targets) {
          const cur = getPlayers(t);
          let nextPlayers: string[];
          if (allHave) {
            nextPlayers =
              cur.length > 1 ? cur.filter((p) => p !== normPlayer) : cur;
          } else {
            nextPlayers = cur.includes(normPlayer) ? cur : [...cur, normPlayer];
          }
          projectStore.updateTag({
            ...t,
            playerLabel: nextPlayers[0] || normPlayer,
            playersInvolved: nextPlayers,
          });
        }
      },
    );
    notifyUser(
      allHave
        ? `${normPlayer} dilepas dari ${targets.length} klip`
        : `${normPlayer} ditambahkan ke ${targets.length} klip`,
    );
  }

  function handleBatchAddCustomPlayer(ids: string[], rawName: string) {
    const added = projectStore.addRosterPlayer(rawName);
    if (!added) return;
    if (ids.length > 0) {
      handleBatchTogglePlayer(ids, added);
    } else {
      handlePlayerPress(added);
    }
  }

  function handleBatchSetTeamSide(ids: string[], side: "home" | "away") {
    const targets = projectStore.tags.filter((t) => ids.includes(t.id));
    if (targets.length === 0) return;
    projectStore.runBatchTagMutation(`Set Tim ${side.toUpperCase()}`, () => {
      for (const t of targets) {
        projectStore.updateTag({ ...t, teamSide: side });
      }
    });
    notifyUser(`${targets.length} klip diset ke ${side.toUpperCase()}`);
  }

  function handleBatchToggleFavorite(ids: string[]) {
    const targets = projectStore.tags.filter((t) => ids.includes(t.id));
    if (targets.length === 0) return;
    const allFav = targets.every((t) => Boolean(t.favorite));
    projectStore.runBatchTagMutation(
      allFav ? "Hapus Favorit" : "Tandai Favorit",
      () => {
        for (const t of targets) {
          projectStore.updateTag({ ...t, favorite: !allFav });
        }
      },
    );
    notifyUser(
      allFav
        ? `${targets.length} klip dihapus dari Favorit`
        : `${targets.length} klip ditandai Favorit ★`,
    );
  }

  function handleSplitClipAtPlayhead(tag: VideoTagEvent) {
    const res = projectStore.splitTag(tag.id, currentTime);
    if (!res) {
      notifyUser(
        "Posisikan garis merah di tengah klip (min. 0.3s dari tepi) untuk Split",
      );
      return;
    }
    selectedClipId = res[1].id;
    selectedClipIds = [res[1].id];
    notifyUser(
      `Klip dibelah pada ${formatTime(currentTime)} (Ctrl+Z untuk batal)`,
    );
  }

  function handleDuplicateClip(tag: VideoTagEvent) {
    const dup = projectStore.duplicateTag(tag.id);
    if (!dup) return;
    selectedClipId = dup.id;
    selectedClipIds = [dup.id];
    notifyUser(`Klip diduplikasi: "${dup.category}"`);
  }

  function handleBatchPasteMeta(ids: string[]) {
    if (!copiedMeta || ids.length === 0) return;
    const targets = projectStore.tags.filter((t) => ids.includes(t.id));
    if (targets.length === 0) return;
    projectStore.runBatchTagMutation("Tempel Meta Klip", () => {
      for (const t of targets) {
        const players =
          copiedMeta!.players.length > 0
            ? [...copiedMeta!.players]
            : t.playersInvolved;
        projectStore.updateTag({
          ...t,
          labels: JSON.parse(JSON.stringify(copiedMeta!.labels)),
          playersInvolved: players,
          playerLabel:
            players && players.length > 0 ? players[0] : t.playerLabel,
          teamSide: copiedMeta!.teamSide ?? t.teamSide,
        });
      }
    });
    notifyUser(`Label & pemain ditempel ke ${targets.length} klip`);
  }

  function handleBatchAddToPlaylist(ids: string[]) {
    const targets = projectStore.tags.filter((t) => ids.includes(t.id));
    if (targets.length === 0) return;
    for (const t of targets) {
      projectStore.addToPlaylist(t);
    }
    notifyUser(`${targets.length} klip ditambahkan ke Playlist`);
  }

  function handleBatchDeleteClips(ids: string[]) {
    const validIds = ids.filter((id) =>
      projectStore.tags.some((t) => t.id === id),
    );
    if (validIds.length === 0) return;
    projectStore.runBatchTagMutation(
      validIds.length > 1
        ? `Hapus ${validIds.length} Klip`
        : `Hapus "${projectStore.tags.find((t) => t.id === validIds[0])?.category ?? "Klip"}"`,
      () => {
        for (const id of validIds) {
          projectStore.deleteTag(id);
        }
      },
    );
    if (selectedClipId && validIds.includes(selectedClipId)) {
      selectedClipId = null;
    }
    selectedClipIds = selectedClipIds.filter((id) => !validIds.includes(id));
    if (activeLoopClip && validIds.includes(activeLoopClip.id)) {
      activeLoopClip = null;
    }
    notifyUser(
      `${validIds.length} klip dihapus. Tekan Ctrl+Z untuk mengurungkan.`,
    );
  }

  let isBatchExporting = $state<boolean>(false);

  function toggleClipSelection(tag: VideoTagEvent, e?: MouseEvent) {
    if (e?.shiftKey && selectedClipId) {
      const a = filteredTags.findIndex((t) => t.id === selectedClipId);
      const b = filteredTags.findIndex((t) => t.id === tag.id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a <= b ? [a, b] : [b, a];
        const rangeIds = filteredTags.slice(lo, hi + 1).map((t) => t.id);
        selectedClipIds = Array.from(new Set([...selectedClipIds, ...rangeIds]));
        selectedClipId = tag.id;
        return;
      }
    }
    if (selectedClipIds.includes(tag.id)) {
      const next = selectedClipIds.filter((id) => id !== tag.id);
      selectedClipIds = next;
      if (selectedClipId === tag.id) {
        selectedClipId = next[0] ?? null;
      }
    } else {
      selectedClipIds = [...selectedClipIds, tag.id];
      selectedClipId = tag.id;
    }
  }

  function toggleSelectAllFiltered() {
    if (filteredTags.length === 0) return;
    const visIds = filteredTags.map((t) => t.id);
    if (allFilteredSelected) {
      selectedClipIds = selectedClipIds.filter((id) => !visIds.includes(id));
      if (selectedClipId && visIds.includes(selectedClipId)) {
        selectedClipId = selectedClipIds[0] ?? null;
      }
    } else {
      selectedClipIds = Array.from(new Set([...selectedClipIds, ...visIds]));
      if (!selectedClipId) selectedClipId = visIds[0] ?? null;
    }
  }

  function handlePlaySelectedClips() {
    const targets = projectStore.tags
      .filter((t) => selectedClipIds.includes(t.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;
    playSequentialClips(targets, `Pilihan (${targets.length} Klip)`);
  }

  function handleOpenBatchEditor() {
    const first = projectStore.tags.find((t) => selectedClipIds.includes(t.id));
    if (first) openTagEditor(first);
  }

  async function handleBatchExportSelectedClips() {
    if (isBatchExporting) return;
    const targets = projectStore.tags
      .filter((t) => selectedClipIds.includes(t.id))
      .sort((a, b) => a.startTime - b.startTime);
    if (targets.length === 0) return;
    if (!isTauriDesktop()) {
      notifyUser("Ekspor massal MP4 memerlukan aplikasi desktop Tauri.");
      return;
    }
    const path = projectStore.videoFilePath;
    if (!path || (!path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path))) {
      notifyUser("Buka file video asli di Hub Proyek sebelum ekspor massal MP4.");
      return;
    }

    try {
      const { open } = await import("@tauri-apps/plugin-dialog");
      const targetDir = await open({
        title: `Pilih Folder Tujuan (${targets.length} Klip Terpilih)`,
        directory: true,
        multiple: false,
      });
      if (!targetDir || typeof targetDir !== "string") return;

      isBatchExporting = true;
      const sep =
        targetDir.endsWith("/") || targetDir.endsWith("\\") ? "" : "/";
      const watermarkPayload = await buildWatermarkExportPayload(
        projectStore.clubLogoDataUrl,
        projectStore.watermarkConfig,
      );
      for (let i = 0; i < targets.length; i++) {
        const tag = targets[i];
        const idxStr = String(i + 1).padStart(2, "0");
        const cleanCat = tag.category.replace(/[^a-zA-Z0-9_-]/g, "_");
        const outPath = `${targetDir}${sep}${idxStr}_${cleanCat}_${Math.round(tag.startTime)}s.mp4`;
        notifyUser(
          `Ekspor massal ${i + 1}/${targets.length}: ${tag.category}...`,
        );

        const hasDrawings = Boolean(tag.drawings?.length);
        const hasVoice = Boolean(tag.voiceoverAudioBase64);
        const effectiveStops = getEffectiveFreezeStopsForTag(tag);
        const speedSegmentsPayload = toSpeedSegmentsExportPayload(tag);
        const hasSpeeds = speedSegmentsPayload.length > 0;
        const appendCleanReplay = Boolean(tag.appendCleanReplay);
        const clipDur = Math.max(0.4, tag.endTime - tag.startTime);
        if (
          hasDrawings ||
          hasVoice ||
          effectiveStops.length > 0 ||
          hasSpeeds ||
          appendCleanReplay
        ) {
          const freezeSec =
            effectiveStops[0]?.time ??
            tag.freezeTimestamp ??
            (tag.startTime + tag.endTime) / 2;
          const freezeStopsPayload: FreezeStopExportPayload[] =
            effectiveStops.map((st) => ({
              time: st.time,
              duration: st.duration,
              overlay_base64: hasDrawings
                ? renderDrawingsToDataUrl(tag.drawings || [], 1280, 720, st.time, {
                    chromaConfig: projectStore.chromaFloorConfig,
                    clipStartTime: tag.startTime,
                    clipEndTime: tag.endTime,
                    subtitleText: tag.voiceoverTranscript,
                    subtitleCues: tag.subtitleCues,
                    burnSubtitle: tag.burnSubtitle,
                    animElapsedSec: 1.0,
                  }) || null
                : null,
            }));
          await invoke<string>("burn_telestration_clip_ffmpeg", {
            inputPath: path,
            outputPath: outPath,
            startSec: tag.startTime,
            durationSec: clipDur,
            freezeSec,
            pauseDuration:
              effectiveStops[0]?.duration ?? tag.pauseDuration ?? 3.0,
            overlayBase64: freezeStopsPayload[0]?.overlay_base64 ?? null,
            voiceoverBase64: tag.voiceoverAudioBase64 || null,
            targetHeight: 720,
            freezeStops:
              freezeStopsPayload.length > 0 ? freezeStopsPayload : null,
            appendCleanReplay,
            speedSegments:
              speedSegmentsPayload.length > 0 ? speedSegmentsPayload : null,
            watermark: watermarkPayload,
          });
        } else {
          await invoke<string>("render_video_clip_ffmpeg", {
            inputPath: path,
            outputPath: outPath,
            startSec: tag.startTime,
            durationSec: clipDur,
            fastCopy: true,
            watermark: watermarkPayload,
          });
        }
      }
      notifyUser(`Selesai! ${targets.length} klip diekspor ke ${targetDir}`);
    } catch (err: any) {
      notifyUser(`Ekspor massal gagal: ${err?.message || err}`);
    } finally {
      isBatchExporting = false;
    }
  }

  function toggleClipFavorite(tag: VideoTagEvent) {
    projectStore.updateTag({
      ...tag,
      favorite: !tag.favorite,
    });
  }

  function handleQuickExportSingleClip(tag: VideoTagEvent) {
    if (exportingQuickClipId) return;
    if (!isTauriDesktop()) {
      notifyUser("Quick Export MP4 memerlukan aplikasi desktop Tauri.");
      return;
    }
    const path = projectStore.videoFilePath;
    if (!path || (!path.startsWith("/") && !/^[A-Za-z]:[\\/]/.test(path))) {
      notifyUser("Buka file video asli di Hub Proyek sebelum ekspor MP4.");
      return;
    }
    quickExportModalClip = tag;
  }

  async function executeQuickExportSingleClip(
    tag: VideoTagEvent,
    opts: {
      resolution: "1080p" | "720p";
      crf: ExportCrfPreset;
      aspectRatio: ExportAspectRatio;
      includeTelestration: boolean;
    },
  ) {
    if (exportingQuickClipId) return;
    const path = projectStore.videoFilePath;
    if (!path) return;

    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const cleanCat = tag.category.replace(/[^a-zA-Z0-9_-]/g, "_");
      const ratioTag = opts.aspectRatio === "9:16" ? "_9x16" : "";
      const outPath = await save({
        title: `Quick Export MP4 — ${tag.category}`,
        defaultPath: `FutsalTag_${cleanCat}_${Math.round(tag.startTime)}s${ratioTag}.mp4`,
        filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      });
      if (!outPath) return;

      quickExportModalClip = null;
      exportingQuickClipId = tag.id;
      notifyUser(
        `Mengekspor MP4 "${tag.category}" (${opts.aspectRatio} · ${opts.resolution})...`,
      );

      const targetHeight = opts.resolution === "720p" ? 720 : 1080;
      const renderW = targetHeight === 720 ? 1280 : 1920;
      const renderH = targetHeight === 720 ? 720 : 1080;
      const useTel = opts.includeTelestration;
      const hasDrawings = useTel && Boolean(tag.drawings?.length);
      const hasVoice = useTel && Boolean(tag.voiceoverAudioBase64);
      const hasSubtitle =
        useTel &&
        Boolean(
          tag.burnSubtitle &&
            (tag.voiceoverTranscript?.trim() || (tag.subtitleCues?.length ?? 0) > 0),
        );
      const effectiveStops = useTel ? getEffectiveFreezeStopsForTag(tag) : [];
      const speedSegmentsPayload = toSpeedSegmentsExportPayload(tag);
      const hasSpeeds = speedSegmentsPayload.length > 0;
      const watermarkPayload = await buildWatermarkExportPayload(
        projectStore.clubLogoDataUrl,
        projectStore.watermarkConfig,
      );
      const appendCleanReplay = useTel && Boolean(tag.appendCleanReplay);
      const needsBurnPass =
        hasDrawings ||
        hasVoice ||
        hasSubtitle ||
        effectiveStops.length > 0 ||
        hasSpeeds ||
        appendCleanReplay;
      const needsFormatPass = opts.aspectRatio === "9:16" || opts.crf !== 23;
      const clipDur = Math.max(0.4, tag.endTime - tag.startTime);
      const passWatermark =
        needsBurnPass && needsFormatPass ? null : watermarkPayload;

      if (needsBurnPass) {
        let burnTarget = outPath;
        if (needsFormatPass) {
          const tempDir = await invoke<string>("get_temp_dir");
          const sep = tempDir.endsWith("/") || tempDir.endsWith("\\") ? "" : "/";
          burnTarget = `${tempDir}${sep}futsaltag_qe_${Date.now()}.mp4`;
        }
        const freezeSec =
          effectiveStops[0]?.time ??
          tag.freezeTimestamp ??
          (tag.startTime + tag.endTime) / 2;
        const freezeStopsPayload: FreezeStopExportPayload[] =
          effectiveStops.map((st) => ({
            time: st.time,
            duration: st.duration,
            overlay_base64:
              hasDrawings || hasSubtitle
                ? renderDrawingsToDataUrl(
                    tag.drawings || [],
                    renderW,
                    renderH,
                    st.time,
                    {
                      chromaConfig: projectStore.chromaFloorConfig,
                      clipStartTime: tag.startTime,
                      clipEndTime: tag.endTime,
                      subtitleText: tag.voiceoverTranscript,
                      subtitleCues: tag.subtitleCues,
                      burnSubtitle: tag.burnSubtitle,
                      animElapsedSec: 1.0,
                    },
                  ) || null
                : null,
          }));
        await invoke<string>("burn_telestration_clip_ffmpeg", {
          inputPath: path,
          outputPath: burnTarget,
          startSec: tag.startTime,
          durationSec: clipDur,
          freezeSec,
          pauseDuration:
            effectiveStops[0]?.duration ?? tag.pauseDuration ?? 3.0,
          overlayBase64: freezeStopsPayload[0]?.overlay_base64 ?? null,
          voiceoverBase64: useTel ? tag.voiceoverAudioBase64 || null : null,
          targetHeight,
          freezeStops:
            freezeStopsPayload.length > 0 ? freezeStopsPayload : null,
          appendCleanReplay,
          speedSegments:
            speedSegmentsPayload.length > 0 ? speedSegmentsPayload : null,
          watermark: passWatermark,
        });
        if (needsFormatPass) {
          await invoke<string>("export_formatted_clip_ffmpeg", {
            inputPath: burnTarget,
            outputPath: outPath,
            targetHeight,
            crf: opts.crf,
            vertical9x16: opts.aspectRatio === "9:16",
            removeInput: true,
            watermark: watermarkPayload,
          });
        }
      } else if (needsFormatPass) {
        await invoke<string>("export_formatted_clip_ffmpeg", {
          inputPath: path,
          outputPath: outPath,
          startSec: tag.startTime,
          durationSec: clipDur,
          targetHeight,
          crf: opts.crf,
          vertical9x16: opts.aspectRatio === "9:16",
          watermark: watermarkPayload,
        });
      } else {
        await invoke<string>("render_video_clip_ffmpeg", {
          inputPath: path,
          outputPath: outPath,
          startSec: tag.startTime,
          durationSec: clipDur,
          fastCopy: opts.resolution === "720p" ? false : true,
          targetHeight: opts.resolution === "720p" ? 720 : undefined,
          watermark: watermarkPayload,
        });
      }
      notifyUser(`Klip MP4 berhasil disimpan!`);
    } catch (err: any) {
      notifyUser(`Quick Export gagal: ${err?.message || err}`);
    } finally {
      exportingQuickClipId = null;
    }
  }

  async function handleHeaderImportBoard() {
    if (isTauriDesktop()) {
      try {
        const { open } = await import("@tauri-apps/plugin-dialog");
        const selected = await open({
          title: "Impor Papan Tagging Momen (.momen.json / .json)",
          multiple: false,
          filters: [{ name: "Momen / JSON", extensions: ["json", "momen"] }],
        });
        if (!selected || typeof selected !== "string") return;
        const content = await invoke<string>("read_project_file", {
          filePath: selected,
        });
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
    input.value = "";
  }

  function formatCompactElapsed(sec: number): string {
    const s = Math.max(0, Math.floor(sec));
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return m > 0
      ? `${m}:${rem.toString().padStart(2, "0")}`
      : `${sec.toFixed(1)}s`;
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
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
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
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
    }

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  }

  onMount(() => {
    if (window.innerHeight <= 760) {
      linimasaHeight = 160;
      spatialCanvasHeight = 122;
    }
    let unlistenRemoteTap: (() => void) | null = null;
    if (isTauriDesktop()) {
      invoke<{ running: boolean }>("get_remote_server_status")
        .then((st) => {
          isPhoneRemoteRunning = Boolean(st?.running);
        })
        .catch(() => {});
      import("@tauri-apps/api/event")
        .then(({ listen }) =>
          listen<{
            phoneName: string;
            action: string;
            buttonId?: string;
            player?: string;
          }>("remote-tag-action", (ev) => {
            const p = ev.payload;
            if (!p) return;
            const who = p.phoneName || "HP";
            if (p.action === "tag" || p.action === "label") {
              const btn = activeBoard.buttons.find((b) => b.id === p.buttonId);
              if (btn) {
                handleLeftButtonClick(btn);
                notifyUser(`📱 ${who}: ${btn.name}`);
              }
            } else if (p.action === "player" && p.player) {
              handlePlayerPress(p.player);
              notifyUser(`📱 ${who}: ${p.player}`);
            } else if (p.action === "escape") {
              stopAllContinuousTags();
            } else if (p.action === "undo") {
              handleUndoLastTag();
            }
          }),
        )
        .then((fn) => {
          unlistenRemoteTap = fn;
        })
        .catch(() => {});
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (showTagLabelEditor || showStatsMatrix || showShortcutsModal) return;
      const targetTag = (e.target as HTMLElement)?.tagName;
      if (
        targetTag === "INPUT" ||
        targetTag === "TEXTAREA" ||
        targetTag === "SELECT"
      ) {
        return;
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "a") {
        if (workspaceSubTab === "tagging" && filteredTags.length > 0) {
          e.preventDefault();
          toggleSelectAllFiltered();
        }
        return;
      }

      if (e.key === "Escape") {
        if (showKickoffMenu) {
          showKickoffMenu = false;
        } else if (activeLoopClip || activeClipQueue.length > 0) {
          e.preventDefault();
          stopClipLoop();
          showVideoOsd("▶", "Lanjut", "Loop klip dimatikan", "emerald");
        } else if (Object.keys(activeContinuousTags).length > 0) {
          e.preventDefault();
          stopAllContinuousTags();
        } else if (selectedClipIds.length > 0) {
          selectedClipIds = [];
        }
        return;
      }

      const b = shortcutsStore.bindings;

      if (matchesCombo(e, b.openShortcuts)) {
        e.preventDefault();
        showShortcutsModal = true;
        return;
      }
      if (matchesCombo(e, b.undo)) {
        e.preventDefault();
        handleUndoLastTag();
        return;
      }
      if (matchesCombo(e, b.redo)) {
        e.preventDefault();
        handleRedoTags();
        return;
      }
      if (matchesCombo(e, b.duplicateClip)) {
        if (targetExistingClip) {
          e.preventDefault();
          handleDuplicateClip(targetExistingClip);
        }
        return;
      }
      if (matchesCombo(e, b.copyMeta)) {
        const selText = window.getSelection()?.toString();
        if (!selText && targetExistingClip) {
          e.preventDefault();
          handleCopyClipMeta(targetExistingClip);
        }
        return;
      }
      if (matchesCombo(e, b.pasteMeta)) {
        if (copiedMeta) {
          const targets =
            selectedClipIds.length > 0
              ? selectedClipIds
              : targetExistingClip
                ? [targetExistingClip.id]
                : [];
          if (targets.length > 0) {
            e.preventDefault();
            handleBatchPasteMeta(targets);
          }
        }
        return;
      }
      if (matchesCombo(e, b.editOrCreateClip)) {
        e.preventDefault();
        if (inPoint !== null) {
          createClipFromInOut();
        } else if (targetExistingClip) {
          openTagEditor(targetExistingClip);
        }
        return;
      }
      if (matchesCombo(e, b.jumpBack1s)) {
        e.preventDefault();
        handleJumpSeconds(-1.0);
        return;
      }
      if (matchesCombo(e, b.jumpForward1s)) {
        e.preventDefault();
        handleJumpSeconds(1.0);
        return;
      }
      if (matchesCombo(e, b.frameBack)) {
        e.preventDefault();
        stepFrame(-1);
        return;
      }
      if (matchesCombo(e, b.frameForward)) {
        e.preventDefault();
        stepFrame(1);
        return;
      }
      if (matchesCombo(e, b.playPause)) {
        e.preventDefault();
        togglePlay();
        return;
      }
      if (matchesCombo(e, b.deleteClip)) {
        const targets =
          selectedClipIds.length > 0
            ? selectedClipIds
            : selectedClipId
              ? [selectedClipId]
              : [];
        if (targets.length > 0) {
          e.preventDefault();
          handleBatchDeleteClips(targets);
        }
        return;
      }
      if (matchesCombo(e, b.quickSearch)) {
        e.preventDefault();
        document.getElementById("quick-tag-search-input")?.focus();
        return;
      }

      const hasModifier = e.ctrlKey || e.metaKey || e.altKey || e.shiftKey;
      if (!hasModifier) {
        const keyUpper = e.key.toUpperCase();
        const boardMatch = activeBoard.buttons.find(
          (btn) => btn.hotkey && btn.hotkey.toUpperCase() === keyUpper,
        );
        if (boardMatch) {
          e.preventDefault();
          if (boardMatch.kind === "category") {
            handleCategoryPress(boardMatch);
          } else {
            handleDescriptorPress(boardMatch);
          }
          return;
        }
      }

      if (matchesCombo(e, b.speedUp)) {
        e.preventDefault();
        handleSpeedUp();
      } else if (matchesCombo(e, b.speedDown)) {
        e.preventDefault();
        handleSpeedDown();
      } else if (matchesCombo(e, b.speedResetPause)) {
        e.preventDefault();
        handleSpeedResetAndPause();
      } else if (matchesCombo(e, b.rewindStep)) {
        e.preventDefault();
        handleJumpSeconds(-2.0);
      } else if (matchesCombo(e, b.forwardStep)) {
        e.preventDefault();
        handleJumpSeconds(2.0);
      } else if (matchesCombo(e, b.setIn)) {
        e.preventDefault();
        setInPoint();
      } else if (matchesCombo(e, b.setOut)) {
        e.preventDefault();
        setOutPoint();
      } else if (matchesCombo(e, b.splitClip) && targetExistingClip) {
        e.preventDefault();
        handleSplitClipAtPlayhead(targetExistingClip);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      if (hasRestoredInitialTime && Number.isFinite(currentTime) && currentTime >= 0) {
        projectStore.currentTime = currentTime;
      }
      reverseRate = 0;
      videoEl?.pause();
      angle2VideoEl?.pause();
      window.removeEventListener("keydown", handleKeyDown);
      unlistenRemoteTap?.();
    };
  });

  $effect(() => {
    if (!isTauriDesktop() || (!isPhoneRemoteRunning && !showPhoneRemoteModal)) return;
    const push = () => {
      const payload = {
        matchTitle: projectStore.videoTitle,
        playing: isPlaying,
        recording: projectStore.liveCaptureActive && isPlaying,
        currentTime,
        activePlayer: activeSelectedPlayer,
        activeButtonIds: Object.keys(activeContinuousTags),
        players: FUTSAL_ROSTER.map((p) => ({
          id: p.id,
          label: projectStore.getPlayerDisplayLabel(p),
        })),
        tags: activeBoard.buttons
          .filter((b) => b.kind === "category")
          .map((b) => ({ id: b.id, name: b.name, color: b.color })),
        labels: activeBoard.buttons
          .filter((b) => b.kind === "descriptor")
          .map((b) => ({ id: b.id, name: b.name, color: b.color })),
      };
      invoke("update_remote_server_state", {
        stateJson: JSON.stringify(payload),
      }).catch(() => {});
    };
    push();
    const timer = setInterval(push, 400);
    return () => clearInterval(timer);
  });

  function showVideoOsd(
    icon: string,
    value: string,
    label: string,
    tone: "sky" | "amber" | "emerald" = "sky",
  ) {
    videoOsd = { icon, value, label, tone };
    if (videoOsdTimer) clearTimeout(videoOsdTimer);
    videoOsdTimer = setTimeout(() => {
      videoOsd = null;
    }, 900);
  }

  function syncSecondaryAngle(forceSeek = false) {
    if (!angle2VideoEl || !activeSecondaryAngle?.videoSrc || !showAngle2) return;
    const target = Math.max(0, currentTime + activeSecondaryAngle.offsetSec);
    if (
      angle2VideoEl.readyState >= 1 &&
      (forceSeek || Math.abs(angle2VideoEl.currentTime - target) > 0.25)
    ) {
      const maxDur = Number.isFinite(angle2VideoEl.duration)
        ? angle2VideoEl.duration
        : target;
      angle2VideoEl.currentTime = Math.min(target, maxDur);
    }
    angle2VideoEl.playbackRate = playbackRate;
    if (isPlaying && angle2VideoEl.paused) {
      angle2VideoEl.play().catch(() => {});
    } else if (!isPlaying && !angle2VideoEl.paused) {
      angle2VideoEl.pause();
    }
  }

  $effect(() => {
    const _off = activeSecondaryAngle?.offsetSec;
    const _show = showAngle2;
    const _play = isPlaying;
    void _off;
    void _play;
    if (_show) {
      untrack(() => syncSecondaryAngle(true));
    }
  });

  async function handleAddAngleClick() {
    if (isTauriDesktop()) {
      const ok = await projectStore.pickSecondaryAngleFile();
      if (ok) notifyUser("Kamera sudut ke-2 ditambahkan!");
    } else {
      angle2InputEl?.click();
    }
  }

  function handleAngle2FileInput(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      const url = URL.createObjectURL(file);
      const shortName = file.name.replace(/\.[^.]+$/, "").slice(0, 18) || "Kamera 2";
      projectStore.addSecondaryAngle(url, file.name, shortName);
      notifyUser(`Kamera "${shortName}" ditambahkan!`);
    }
    input.value = "";
  }

  function handleAngleOffsetDelta(delta: number) {
    if (!activeSecondaryAngle) return;
    projectStore.updateSecondaryAngle(activeSecondaryAngle.id, {
      offsetSec: activeSecondaryAngle.offsetSec + delta,
    });
  }

  function startReversePlayback(rate = 1.0) {
    if (projectStore.liveCaptureActive) return;
    hasRestoredInitialTime = true;
    activeLoopClip = null;
    activeClipQueue = [];
    videoEl?.pause();
    angle2VideoEl?.pause();
    ytPlayer?.pauseVideo?.();
    isPlaying = false;
    reverseRate = rate;
    showVideoOsd("⏪", `-${rate}x`, "Putar Mundur", "amber");
  }

  function cycleReversePlayback() {
    if (reverseRate === 0) {
      startReversePlayback(1.0);
      return;
    }
    const order = [1.0, 2.0, 4.0, 0.5];
    const idx = order.indexOf(reverseRate);
    const next = order[(idx + 1) % order.length];
    startReversePlayback(next);
  }

  function applyPlaybackSpeed(nextRate: number, autoPlay: boolean = true) {
    activeLoopClip = null;
    activeClipQueue = [];
    reverseRate = 0;
    playbackRate = nextRate;
    if (videoEl) {
      videoEl.playbackRate = nextRate;
      if (autoPlay) {
        videoEl.play().catch(() => {});
        isPlaying = true;
      }
    } else if (ytPlayer && ytReady) {
      try {
        ytPlayer.setPlaybackRate?.(nextRate);
        if (autoPlay) {
          ytPlayer.playVideo?.();
          isPlaying = true;
        }
      } catch {
        // Ignore rate unsupported
      }
    }
    syncSecondaryAngle(false);
  }

  function handleSpeedUp() {
    if (reverseRate > 0) {
      const idx = REVERSE_SPEEDS.indexOf(reverseRate);
      if (idx > 0) {
        startReversePlayback(REVERSE_SPEEDS[idx - 1]);
      } else {
        applyPlaybackSpeed(1.0, true);
        showVideoOsd("▶", "1x", "Kecepatan Normal", "emerald");
      }
      return;
    }
    let closestIdx = 0;
    let bestDiff = Infinity;
    SPEED_STEPS.forEach((s, idx) => {
      const d = Math.abs(s - playbackRate);
      if (d < bestDiff) {
        bestDiff = d;
        closestIdx = idx;
      }
    });
    const nextIdx = Math.min(SPEED_STEPS.length - 1, closestIdx + 1);
    const next = SPEED_STEPS[nextIdx];
    applyPlaybackSpeed(next, true);
    showVideoOsd(
      next > 1 ? "⏩" : next < 1 ? "🐢" : "▶",
      `${next}x`,
      next > 1
        ? "Dipercepat"
        : next < 1
          ? "Slow-Motion"
          : "Kecepatan Normal",
      next > 1 ? "sky" : next < 1 ? "amber" : "emerald",
    );
  }

  function handleSpeedDown() {
    if (reverseRate > 0) {
      const idx = REVERSE_SPEEDS.indexOf(reverseRate);
      const next = REVERSE_SPEEDS[Math.min(REVERSE_SPEEDS.length - 1, (idx === -1 ? 1 : idx) + 1)];
      startReversePlayback(next);
      return;
    }
    if (!isPlaying || playbackRate <= SPEED_STEPS[0]) {
      startReversePlayback(1.0);
      return;
    }
    let closestIdx = 0;
    let bestDiff = Infinity;
    SPEED_STEPS.forEach((s, idx) => {
      const d = Math.abs(s - playbackRate);
      if (d < bestDiff) {
        bestDiff = d;
        closestIdx = idx;
      }
    });
    const nextIdx = Math.max(0, closestIdx - 1);
    const next = SPEED_STEPS[nextIdx];
    applyPlaybackSpeed(next, true);
    showVideoOsd(
      next < 1 ? "🐢" : next > 1 ? "⏩" : "▶",
      `${next}x`,
      next < 1
        ? "Slow-Motion"
        : next === 1
          ? "Kecepatan Normal"
          : "Diperlambat",
      next < 1 ? "amber" : next === 1 ? "emerald" : "sky",
    );
  }

  function handleSpeedResetAndPause() {
    activeLoopClip = null;
    activeClipQueue = [];
    reverseRate = 0;
    if (videoEl) {
      videoEl.pause();
      videoEl.playbackRate = 1.0;
    } else if (ytPlayer && ytReady) {
      ytPlayer.pauseVideo?.();
      ytPlayer.setPlaybackRate?.(1.0);
    }
    playbackRate = 1.0;
    isPlaying = false;
    showVideoOsd("⏸", "1.0x", "Normal · Jeda", "emerald");
  }

  function handleJumpSeconds(delta: number) {
    seekTo(currentTime + delta);
    showVideoOsd(
      delta < 0 ? "⏪" : "⏩",
      `${delta > 0 ? "+" : ""}${delta.toFixed(1)}s`,
      delta < 0 ? "Mundur" : "Maju",
      "sky",
    );
  }

  function togglePlay() {
    if (projectStore.liveCaptureActive) return;
    hasRestoredInitialTime = true;
    activeLoopClip = null;
    activeClipQueue = [];
    if (reverseRate > 0) {
      reverseRate = 0;
      isPlaying = false;
      videoEl?.pause();
      angle2VideoEl?.pause();
      showVideoOsd("⏸", "Jeda", "Putar Mundur Berhenti", "emerald");
      return;
    }
    if (ytPlayer && ytReady) {
      if (isPlaying) {
        ytPlayer.pauseVideo?.();
      } else {
        ytPlayer.setPlaybackRate?.(playbackRate);
        ytPlayer.playVideo?.();
      }
      isPlaying = !isPlaying;
      syncSecondaryAngle(true);
      return;
    }
    if (!videoEl) {
      isPlaying = !isPlaying;
      syncSecondaryAngle(true);
      return;
    }
    if (isPlaying) {
      videoEl.pause();
    } else {
      videoEl.playbackRate = playbackRate;
      videoEl.play().catch(() => {});
    }
    isPlaying = !isPlaying;
    syncSecondaryAngle(true);
  }

  // Smooth Backward / Reverse Playback loop (Momen Sports style)
  $effect(() => {
    const rate = reverseRate;
    if (rate <= 0) return;
    let lastMs = performance.now();
    let lastSeekMs = 0;
    let virtualTime = untrack(() => currentTime);
    let rafId = 0;

    const tickReverse = (now: number) => {
      const dt = Math.min(0.15, Math.max(0, (now - lastMs) / 1000));
      lastMs = now;
      virtualTime = Math.max(0, virtualTime - dt * rate);

      if (videoEl) {
        if (now - lastSeekMs >= 40 && !videoEl.seeking) {
          videoEl.currentTime = virtualTime;
          lastSeekMs = now;
        }
      } else if (ytPlayer && ytReady) {
        if (now - lastSeekMs >= 140) {
          ytPlayer.seekTo?.(virtualTime, true);
          lastSeekMs = now;
        }
      }

      currentTime = virtualTime;
      projectStore.currentTime = virtualTime;
      syncSecondaryAngle(true);

      if (virtualTime <= 0.01) {
        if (videoEl) videoEl.currentTime = 0;
        currentTime = 0;
        projectStore.currentTime = 0;
        reverseRate = 0;
        showVideoOsd("⏮", "00:00", "Awal Video", "emerald");
        return;
      }
      rafId = requestAnimationFrame(tickReverse);
    };

    rafId = requestAnimationFrame(tickReverse);
    return () => cancelAnimationFrame(rafId);
  });

  // YouTube IFrame API controller & time sync when onlineSourceType === 'youtube'
  $effect(() => {
    const id = ytVideoId;
    const host = ytHostEl;
    if (!id || !host) {
      ytReady = false;
      ytError = null;
      return;
    }
    let cancelled = false;
    let pollId: ReturnType<typeof setInterval> | null = null;
    ytReady = false;
    ytError = null;

    const mountPlayer = () => {
      if (cancelled || !host) return;
      const YT = (window as any).YT;
      if (!YT?.Player) return;
      host.innerHTML = "";
      const inner = document.createElement("div");
      host.appendChild(inner);
      ytPlayer = new YT.Player(inner, {
        videoId: id,
        width: "100%",
        height: "100%",
        playerVars: {
          rel: 0,
          modestbranding: 1,
          playsinline: 1,
          disablekb: 1,
          origin: typeof window !== "undefined" ? window.location.origin : undefined,
        },
        events: {
          onReady: (ev: any) => {
            if (cancelled) return;
            ytReady = true;
            const d = Number(ev.target?.getDuration?.() || 0);
            if (d > 0) {
              duration = d;
              projectStore.duration = d;
            }
            const saved = projectStore.currentTime;
            if (!hasRestoredInitialTime && Number.isFinite(saved) && saved > 0) {
              ev.target?.seekTo?.(saved, true);
              currentTime = saved;
              syncSecondaryAngle(true);
            }
            hasRestoredInitialTime = true;
          },
          onStateChange: (ev: any) => {
            if (cancelled) return;
            const st = ev.data;
            isPlaying = st === 1;
            const d = Number(ev.target?.getDuration?.() || 0);
            if (d > 0 && d !== duration) {
              duration = d;
              projectStore.duration = d;
            }
          },
          onError: (ev: any) => {
            if (cancelled) return;
            const code = Number(ev.data);
            ytError =
              code === 101 || code === 150
                ? "Pemilik video YouTube membatasi pemutaran di aplikasi eksternal. Gunakan 'Unduh MP4 Lokal' di Hub atau Tautkan MP4."
                : `YouTube gagal memutar video (kode ${code}). Periksa koneksi internet atau tautan video.`;
            isPlaying = false;
          },
        },
      });
    };

    if ((window as any).YT?.Player) {
      mountPlayer();
    } else {
      const prevReady = (window as any).onYouTubeIframeAPIReady;
      (window as any).onYouTubeIframeAPIReady = () => {
        prevReady?.();
        mountPlayer();
      };
      if (!document.querySelector('script[data-yt-iframe-api="1"]')) {
        const s = document.createElement("script");
        s.src = "https://www.youtube.com/iframe_api";
        s.dataset.ytIframeApi = "1";
        document.head.appendChild(s);
      }
    }

    pollId = setInterval(() => {
      if (cancelled || !ytPlayer || !ytReady) return;
      const t = Number(ytPlayer.getCurrentTime?.() || 0);
      if (Number.isFinite(t)) {
        currentTime = t;
        projectStore.currentTime = t;
        syncSecondaryAngle(false);
        if (activeClipQueue.length > 0 && activeQueueIndex < activeClipQueue.length) {
          const cur = activeClipQueue[activeQueueIndex];
          if (t >= cur.endTime) {
            activeQueueIndex = activeQueueIndex + 1 < activeClipQueue.length ? activeQueueIndex + 1 : 0;
            playQueueCurrentClip();
          }
        } else if (activeLoopClip && t >= activeLoopClip.endTime) {
          ytPlayer.seekTo?.(activeLoopClip.startTime, true);
        }
      }
    }, 100);

    return () => {
      cancelled = true;
      if (pollId) clearInterval(pollId);
      try {
        ytPlayer?.destroy?.();
      } catch {
        // Ignore cleanup errors
      }
      ytPlayer = null;
      ytReady = false;
    };
  });

  // Live Stopwatch Ticker when running without a video file, YouTube stream, or Live Camera capture
  $effect(() => {
    if (!isPlaying || projectStore.videoSrc || ytVideoId || projectStore.liveCaptureActive) return;
    let lastMs = performance.now();
    let rafId = 0;
    const step = (now: number) => {
      const dt = Math.min(0.25, Math.max(0, (now - lastMs) / 1000));
      lastMs = now;
      currentTime += dt * playbackRate;
      projectStore.currentTime = currentTime;
      if (currentTime >= duration - 5) {
        duration = Math.max(duration, Math.ceil(currentTime + 600));
        projectStore.duration = duration;
      }
      if (activeLoopClip && currentTime >= activeLoopClip.endTime) {
        currentTime = activeLoopClip.startTime;
      }
      rafId = requestAnimationFrame(step);
    };
    rafId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(rafId);
  });

  function handleTimeUpdate() {
    if (!videoEl) return;
    if (!hasRestoredInitialTime) return;
    currentTime = videoEl.currentTime;
    projectStore.currentTime = currentTime;
    syncSecondaryAngle(false);

    // Sequential Queue Playback (e.g. from Cross-Tabulation Matrix)
    if (
      activeClipQueue.length > 0 &&
      activeQueueIndex < activeClipQueue.length
    ) {
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
    const dur = videoEl.duration || 120;
    duration = dur;
    projectStore.duration = dur;
    const saved = projectStore.currentTime;
    if (!hasRestoredInitialTime && Number.isFinite(saved) && saved > 0 && saved < dur) {
      videoEl.currentTime = saved;
      currentTime = saved;
      syncSecondaryAngle(true);
    }
    hasRestoredInitialTime = true;
  }

  function seekTo(seconds: number) {
    reverseRate = 0;
    hasRestoredInitialTime = true;
    const target = Math.max(0, Math.min(seconds, duration));
    if (ytPlayer && ytReady) {
      activeLoopClip = null;
      activeClipQueue = [];
      ytPlayer.seekTo?.(target, true);
      currentTime = target;
      projectStore.currentTime = target;
      syncSecondaryAngle(true);
      return;
    }
    if (!videoEl) {
      currentTime = target;
      projectStore.currentTime = currentTime;
      return;
    }
    activeLoopClip = null;
    activeClipQueue = [];
    videoEl.currentTime = target;
    currentTime = videoEl.currentTime;
    projectStore.currentTime = currentTime;
    syncSecondaryAngle(true);
  }

  function stepFrame(step: number) {
    reverseRate = 0;
    activeLoopClip = null;
    activeClipQueue = [];
    const fps = 25;
    if (ytPlayer && ytReady) {
      ytPlayer.pauseVideo?.();
      isPlaying = false;
      const target = Math.max(0, Math.min(currentTime + step / fps, duration));
      ytPlayer.seekTo?.(target, true);
      currentTime = target;
      projectStore.currentTime = target;
      showVideoOsd(step < 0 ? "◀" : "▶", `${step > 0 ? "+" : ""}${step}F`, "Frame", "sky");
      return;
    }
    if (!videoEl) return;
    videoEl.pause();
    isPlaying = false;
    videoEl.currentTime = Math.max(
      0,
      Math.min(videoEl.currentTime + step / fps, duration),
    );
    currentTime = videoEl.currentTime;
    projectStore.currentTime = currentTime;
    showVideoOsd(step < 0 ? "◀" : "▶", `${step > 0 ? "+" : ""}${step}F`, "Frame", "sky");
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
        category: "Transition Attack",
        startTime: Number(inPoint.toFixed(2)),
        endTime: Number(outPoint.toFixed(2)),
        color: "#38bdf8",
        playerLabel: activeSelectedPlayer,
        playersInvolved: [activeSelectedPlayer],
        teamSide: activeTeamSide,
        outcomeLabel: "Gol / Sukses",
        rating: "⭐⭐⭐ Bagus",
        pauseDuration: 3.0,
        drawings: [],
      };
      projectStore.addTag(newTag);
      selectedClipId = newTag.id;
      inPoint = null;
      outPoint = null;
      notifyUser(`Klip Manual Disimpan (${activeSelectedPlayer})`);
    }
  }

  function createClipFromInOut() {
    if (inPoint === null) {
      notifyUser("Tandai titik IN (I) terlebih dahulu lalu tekan Alt+U");
      return;
    }
    const start = inPoint;
    let end =
      outPoint !== null && outPoint > start + 0.2 ? outPoint : currentTime;
    if (end <= start + 0.2) {
      end = Math.min(
        Math.max(duration, start + 1),
        start + Math.max(1, lagTimeSeconds),
      );
    }

    const firstBoardCat = activeBoard.buttons.find(
      (b) => b.kind === "category",
    );
    const resolvedCategory = primaryActiveContinuous
      ? primaryActiveContinuous.name
      : targetExistingClip
        ? targetExistingClip.category
        : firstBoardCat?.name || "Transition Attack";
    const resolvedColor = primaryActiveContinuous
      ? primaryActiveContinuous.color
      : targetExistingClip
        ? targetExistingClip.color
        : firstBoardCat?.color || "#38bdf8";
    const resolvedBtnId = primaryActiveContinuous
      ? primaryActiveContinuous.buttonId
      : targetExistingClip?.boardButtonId || firstBoardCat?.id;

    const newTag: VideoTagEvent = {
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${resolvedCategory} - ${activeSelectedPlayer} (${formatTime(start)} - ${formatTime(end)})`,
      category: resolvedCategory as TagCategory,
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      color: resolvedColor,
      playerLabel: activeSelectedPlayer,
      playersInvolved: [activeSelectedPlayer],
      labels: resolvedBtnId ? buildSeedLabels(resolvedBtnId) : [],
      teamSide: activeTeamSide,
      boardButtonId: resolvedBtnId,
      outcomeLabel: "Gol / Sukses",
      rating: "⭐⭐⭐ Bagus",
      pauseDuration: 3.0,
      drawings: [],
    };
    projectStore.addTag(newTag);
    selectedClipId = newTag.id;
    selectedClipIds = [newTag.id];
    inPoint = null;
    outPoint = null;
    notifyUser(
      `Klip Alt+U: ${resolvedCategory} (${(end - start).toFixed(1)}s)`,
    );
    if (autoDescribeAfterTag) openTagEditor(newTag);
  }

  function buildSeedLabels(catButtonId: string): TagDescriptor[] {
    const out: TagDescriptor[] = [];
    for (const stickyId of stickyAutoDescriptors) {
      const btn = activeBoard.buttons.find(
        (b) => b.id === stickyId && b.kind === "descriptor",
      );
      if (!btn) continue;
      if (btn.forTags.length > 0 && !btn.forTags.includes(catButtonId))
        continue;
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
    desc: TagDescriptor,
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
      Math.max(active.startTime + 0.5, currentTime + active.lagSec),
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
      outcomeLabel: "Gol / Sukses",
      zoneLabel: "Area Penalti Lawan",
      rating: "⭐⭐⭐ Bagus",
      pauseDuration: 3.0,
      drawings: [],
    };
    projectStore.addTag(newTag);
    selectedClipId = newTag.id;
    selectedClipIds = [newTag.id];

    const next = { ...activeContinuousTags };
    delete next[buttonId];
    activeContinuousTags = next;
    notifyUser(
      `Klip Kontinu Disimpan: ${active.name} (${(endTime - active.startTime).toFixed(1)}s)`,
    );
    if (autoDescribeAfterTag) openTagEditor(newTag);
  }

  async function runAutoWhistleDetect() {
    if (isDetectingWhistles) return;
    if (
      !isTauriDesktop() ||
      !projectStore.videoFilePath ||
      (!projectStore.videoFilePath.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/.test(projectStore.videoFilePath))
    ) {
      notifyUser(
        "Deteksi peluit otomatis membutuhkan mode Desktop Tauri & video lokal.",
      );
      return;
    }

    isDetectingWhistles = true;
    notifyUser(
      "Memindai audio pertandingan untuk mencari suara peluit wasit...",
    );
    try {
      const raw = await invoke<
        Array<{
          start_time: number;
          end_time: number;
          peak_time: number;
          duration: number;
          peak_freq_hz: number;
          confidence: number;
          label: string;
        }>
      >("detect_match_whistles_ffmpeg", {
        inputPath: projectStore.videoFilePath,
        sensitivity: 0.65,
      });

      whistleMarkers = raw.map((w, idx) => ({
        id: `whistle-${idx}-${Math.round(w.peak_time * 100)}`,
        startTime: w.start_time,
        endTime: w.end_time,
        peakTime: w.peak_time,
        duration: w.duration,
        peakFreqHz: w.peak_freq_hz,
        confidence: w.confidence,
        label: w.label,
      }));
      showWhistleMenu = true;
      notifyUser(
        whistleMarkers.length > 0
          ? `Terdeteksi ${whistleMarkers.length} suara peluit wasit di linimasa`
          : "Tidak ditemukan sinyal peluit dominan pada audio video ini.",
      );
    } catch (err: any) {
      notifyUser(`Gagal pindai audio peluit: ${err?.message || err}`);
    } finally {
      isDetectingWhistles = false;
    }
  }

  function createTagFromWhistle(
    marker: WhistleMarker,
    category: string = "Foul",
  ) {
    const start = Math.max(0, marker.peakTime - leadTimeSeconds);
    const end = Math.min(
      Math.max(duration, marker.peakTime + 1),
      marker.peakTime + lagTimeSeconds,
    );
    const color = category === "Kick-in Set Piece" ? "#ec4899" : "#f97316";
    const newTag: VideoTagEvent = {
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: `${category} (${marker.label})`,
      category: category as TagCategory,
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      color,
      playerLabel: activeSelectedPlayer,
      playersInvolved: [activeSelectedPlayer],
      teamSide: activeTeamSide,
      notes: `Auto-peluit ${Math.round(marker.peakFreqHz)} Hz (${marker.duration.toFixed(2)}s)`,
      pauseDuration: 3.0,
      drawings: [],
    };
    projectStore.addTag(newTag);
    selectedClipId = newTag.id;
    seekTo(marker.peakTime);
    notifyUser(
      `Tag ${category} dibuat dari peluit (${formatTime(marker.peakTime)})`,
    );
  }

  function handleCategoryPress(btn: TaggingButton) {
    activeLoopClip = null;
    activeClipQueue = [];
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
    const lead =
      btn.leadSec > 0 || btn.continuous ? btn.leadSec : leadTimeSeconds;
    const lag = btn.lagSec > 0 ? btn.lagSec : lagTimeSeconds;
    const start = Math.max(0, currentTime - lead);
    const end = Math.min(
      Math.max(duration, currentTime + lag),
      Math.max(start + 1, currentTime + lag),
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
      outcomeLabel: "Gol / Sukses",
      zoneLabel: "Area Penalti Lawan",
      rating: "⭐⭐⭐ Bagus",
      pauseDuration: 3.0,
      drawings: [],
    };
    projectStore.addTag(newTag);
    selectedClipId = newTag.id;
    selectedClipIds = [newTag.id];
    notifyUser(`Klip Ditandai: ${btn.name} [${activeSelectedPlayer}]`);
    if (autoDescribeAfterTag) openTagEditor(newTag);
  }

  function handleDescriptorPress(btn: TaggingButton) {
    const desc: TagDescriptor = {
      id: btn.id,
      name: btn.name,
      color: btn.color,
      group: btn.group,
      atTime: Number(currentTime.toFixed(2)),
    };

    if (btn.autoAdd || btn.group === "period") {
      if (stickyAutoDescriptors.includes(btn.id)) {
        stickyAutoDescriptors = stickyAutoDescriptors.filter(
          (id) => id !== btn.id,
        );
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
      notifyUser(
        `Label "${btn.name}" diperbarui di "${targetExistingClip.title}"`,
      );
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
      notifyUser(
        `Pemain [${nextPlayers.join(", ")}] → ${primaryActiveContinuous.name}`,
      );
      return;
    }

    if (targetExistingClip) {
      const existing =
        targetExistingClip.playersInvolved &&
        targetExistingClip.playersInvolved.length > 0
          ? targetExistingClip.playersInvolved
          : targetExistingClip.playerLabel
            ? [
                projectStore.normalizePlayerLabel(
                  targetExistingClip.playerLabel,
                ),
              ]
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
      notifyUser(`Pemain [${nextPlayers.join(", ")}] pada klip`);
    }
  }

  function stopAllContinuousTags() {
    const ids = Object.keys(activeContinuousTags);
    for (const id of ids) {
      finalizeContinuousTag(id);
    }
  }

  function handleUndoLastTag() {
    const label = projectStore.undoTags();
    if (label) {
      const validIds = new Set(projectStore.tags.map((t) => t.id));
      if (selectedClipId && !validIds.has(selectedClipId))
        selectedClipId = null;
      selectedClipIds = selectedClipIds.filter((id) => validIds.has(id));
      if (activeLoopClip && !validIds.has(activeLoopClip.id))
        activeLoopClip = null;
      notifyUser(`Undo: ${label}`);
    } else {
      notifyUser("Tidak ada perubahan untuk di-undo");
    }
  }

  function handleRedoTags() {
    const label = projectStore.redoTags();
    if (label) {
      notifyUser(`Redo: ${label}`);
    } else {
      notifyUser("Tidak ada perubahan untuk di-redo");
    }
  }

  function handleCopyClipMeta(tag: VideoTagEvent) {
    copiedMeta = {
      labels: JSON.parse(JSON.stringify(tag.labels || [])),
      players: tag.playersInvolved
        ? [...tag.playersInvolved]
        : tag.playerLabel
          ? [tag.playerLabel]
          : [],
      teamSide: tag.teamSide,
    };
    notifyUser(`Label & pemain disalin dari "${tag.category}"`);
  }

  function handlePasteClipMeta(tag: VideoTagEvent) {
    if (!copiedMeta) return;
    const players =
      copiedMeta.players.length > 0
        ? [...copiedMeta.players]
        : tag.playersInvolved;
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
    const safeName = activeBoard.name
      .replace(/[^a-zA-Z0-9_-]/g, "_")
      .toLowerCase();
    if (isTauriDesktop()) {
      try {
        const { save } = await import("@tauri-apps/plugin-dialog");
        const selected = await save({
          title: "Ekspor Papan Momen (.momen.json)",
          defaultPath: `${safeName}.momen.json`,
          filters: [{ name: "Momen Board JSON", extensions: ["json"] }],
        });
        if (!selected) return;
        await invoke<string>("save_project_file", {
          filePath: selected,
          content: json,
        });
        notifyUser(`Papan diekspor ke "${selected}"`);
        return;
      } catch (err: any) {
        alert(`Gagal ekspor papan: ${err?.message || err}`);
        return;
      }
    }
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${safeName}.momen.json`;
    a.click();
    URL.revokeObjectURL(url);
    notifyUser(`Papan "${activeBoard.name}" diekspor`);
  }

  function handleImportBoardJson(jsonStr: string) {
    const imported = projectStore.importMomenBoard(jsonStr);
    notifyUser(
      `Papan "${imported.name}" (${imported.buttons.length} tombol) aktif!`,
    );
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
    if (!videoEl && !(ytPlayer && ytReady)) return;
    reverseRate = 0;
    activeClipQueue = [];
    activeLoopClip = tag;
    if (videoEl) {
      videoEl.currentTime = tag.startTime;
      videoEl.play();
    } else if (ytPlayer && ytReady) {
      ytPlayer.seekTo?.(tag.startTime, true);
      ytPlayer.playVideo?.();
    }
    isPlaying = true;
  }

  function stopClipLoop() {
    activeLoopClip = null;
    activeClipQueue = [];
  }

  function playSequentialClips(clips: VideoTagEvent[], title?: string) {
    if (!clips || clips.length === 0 || (!videoEl && !(ytPlayer && ytReady))) return;
    activeLoopClip = null;
    activeClipQueue = [...clips];
    activeQueueIndex = 0;
    activeQueueTitle = title || `${clips.length} Klip Terpilih`;
    playQueueCurrentClip();
  }

  function playQueueCurrentClip() {
    if ((!videoEl && !(ytPlayer && ytReady)) || activeQueueIndex >= activeClipQueue.length) return;
    const clip = activeClipQueue[activeQueueIndex];
    if (videoEl) {
      videoEl.currentTime = clip.startTime;
      videoEl.play();
    } else if (ytPlayer && ytReady) {
      ytPlayer.seekTo?.(clip.startTime, true);
      ytPlayer.playVideo?.();
    }
    isPlaying = true;
    notifyUser(
      `[${activeQueueIndex + 1}/${activeClipQueue.length}] ${clip.title}`,
    );
  }

  function stopSequentialQueue() {
    activeClipQueue = [];
    activeQueueIndex = 0;
    activeQueueTitle = "";
    if (videoEl) videoEl.pause();
    else if (ytPlayer && ytReady) ytPlayer.pauseVideo?.();
    isPlaying = false;
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const ms = Math.floor((sec % 1) * 10);
    return `${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}.${ms}`;
  }

  let filteredTags = $derived(
    projectStore.tags.filter((t) => {
      const q = searchQuery.toLowerCase();
      const matchSearch =
        q === "" ||
        t.title.toLowerCase().includes(q) ||
        t.category.toLowerCase().includes(q) ||
        (t.notes && t.notes.toLowerCase().includes(q)) ||
        (t.playerLabel && t.playerLabel.toLowerCase().includes(q)) ||
        Boolean(t.playersInvolved?.some((p) => p.toLowerCase().includes(q))) ||
        Boolean(t.labels?.some((l) => l.name.toLowerCase().includes(q)));

      const matchCat =
        filterCategory === "ALL" || t.category === filterCategory;
      const matchPlayer =
        filterPlayer === "ALL" ||
        projectStore.normalizePlayerLabel(t.playerLabel) ===
          projectStore.normalizePlayerLabel(filterPlayer) ||
        Boolean(
          t.playersInvolved?.some(
            (p) =>
              projectStore.normalizePlayerLabel(p) ===
              projectStore.normalizePlayerLabel(filterPlayer),
          ),
        );

      const isAwayClip =
        t.teamSide === "away" ||
        projectStore.normalizePlayerLabel(t.playerLabel) === "Tim Lawan";
      const matchMicro =
        microFilter === "all" ||
        (microFilter === "home" && !isAwayClip) ||
        (microFilter === "away" && isAwayClip) ||
        (microFilter === "fav" && Boolean(t.favorite)) ||
        (microFilter === "good" && t.rating === "⭐⭐⭐ Bagus") ||
        (microFilter === "eval" &&
          (t.rating === "⚠️ Evaluasi" || t.rating === "❌ Kesalahan Fatal"));

      return matchSearch && matchCat && matchPlayer && matchMicro;
    }),
  );

  const allFilteredSelected = $derived(
    filteredTags.length > 0 &&
      filteredTags.every((t) => selectedClipIds.includes(t.id)),
  );

  let currentPlaylist = $derived(projectStore.playlists[0]);
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="tagging-workspace"
  oncontextmenu={(e) => {
    const targetEl = e.target as HTMLElement | null;
    if (
      targetEl &&
      !["INPUT", "TEXTAREA", "SELECT"].includes(targetEl.tagName)
    ) {
      e.preventDefault();
    }
  }}
>
  <!-- SLIM TOP SUB-HEADER (34px) -->
  <header class="tagging-header">
    <div class="header-left">
      <!-- WORKSPACE MODE SWITCHER -->
      <nav class="subnav-segmented">
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === "tagging"}
          onclick={() => (workspaceSubTab = "tagging")}
          title="Video & Multi-Track Timeline"
        >
          <Film size={12} />
          <span>Video</span>
        </button>
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === "coding_board"}
          onclick={() => (workspaceSubTab = "coding_board")}
          title="Papan Tagging (Action Pad)"
        >
          <LayoutGrid size={12} />
          <span>Action Pad</span>
        </button>
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === "minutes"}
          onclick={() => (workspaceSubTab = "minutes")}
          title="Menit Bermain, Pergantian & Analisis Quartet 4v4"
        >
          <Timer size={12} />
          <span>Menit</span>
        </button>
        <button
          class="subnav-btn"
          class:active={workspaceSubTab === "lineup"}
          onclick={() => (workspaceSubTab = "lineup")}
          title="Skuad Futsal 5v5"
        >
          <Users size={12} />
          <span>Skuad</span>
        </button>
      </nav>

      <!-- BOARD CONTROLS IN SLIM SUB-HEADER (MOMEN 2-TIER) -->
      {#if workspaceSubTab === "tagging"}
        <div class="board-header-controls">
          <select
            class="hdr-board-select"
            value={activeBoard.id}
            onchange={(e) =>
              projectStore.selectBoard(
                (e.currentTarget as HTMLSelectElement).value,
              )}
            title="Pilih Papan Tombol Tagging"
          >
            {#each projectStore.boards as b}
              <option value={b.id}>{b.name} ({b.buttons.length})</option>
            {/each}
          </select>

          <button
            type="button"
            class="hdr-tool-btn hdr-default-btn"
            class:is-default={projectStore.defaultBoardId === activeBoard.id}
            onclick={() => {
              projectStore.setDefaultBoard(activeBoard.id);
              notifyUser(`"${activeBoard.name}" ditetapkan sebagai Coding Board default`);
            }}
            title={projectStore.defaultBoardId === activeBoard.id
              ? "Papan ini sudah menjadi Coding Board default"
              : "Tetapkan papan ini sebagai Coding Board default"}
          >
            <Star size={11} />
            <span>{projectStore.defaultBoardId === activeBoard.id ? "Default" : "Set Default"}</span>
          </button>

          <button
            type="button"
            class="hdr-tool-btn hdr-icon-compact"
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
            class="hdr-tool-btn hdr-icon-compact"
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
            disabled={!projectStore.canUndo}
            onclick={handleUndoLastTag}
            title={projectStore.lastUndoLabel
              ? `Undo: ${projectStore.lastUndoLabel} (Ctrl+Z)`
              : "Undo (Ctrl+Z)"}
          >
            <RotateCcw size={11} />
          </button>

          <button
            type="button"
            class="hdr-tool-btn"
            disabled={!projectStore.canRedo}
            onclick={handleRedoTags}
            title={projectStore.lastRedoLabel
              ? `Redo: ${projectStore.lastRedoLabel} (Ctrl+Y)`
              : "Redo (Ctrl+Y)"}
          >
            <Redo2 size={11} />
          </button>

          <button
            type="button"
            class="hdr-tool-btn hdr-auto-btn"
            class:active={autoDescribeAfterTag}
            onclick={() => {
              autoDescribeAfterTag = !autoDescribeAfterTag;
              if (typeof localStorage !== "undefined") {
                localStorage.setItem(
                  "futsaltag_auto_describe_after_tag",
                  autoDescribeAfterTag ? "1" : "0",
                );
              }
            }}
            title="Otomatis buka form Edit Tag, Label & Pemain setiap selesai menandai klip"
          >
            <Edit3 size={10} />
            <span>Auto-Edit</span>
          </button>

          <button
            type="button"
            class="hdr-tool-btn hdr-icon-compact"
            disabled={projectStore.tags.length === 0}
            onclick={() => (showShiftTimesModal = true)}
            title="Geser timestamp semua klip (Shift Action Times) untuk sinkronisasi video/stopwatch"
          >
            <Clock size={11} />
            <span>Geser Waktu</span>
          </button>

          <button
            type="button"
            class="hdr-tool-btn hdr-auto-btn hdr-icon-compact"
            class:active={isPhoneRemoteRunning}
            onclick={() => (showPhoneRemoteModal = true)}
            title="Tagging langsung dari HP/Tablet lewat Wi-Fi (QR Code tanpa instal aplikasi)"
          >
            <Smartphone size={11} />
            <span>{isPhoneRemoteRunning ? "Remote ON" : "Remote HP"}</span>
          </button>

          <button
            type="button"
            class="hdr-tool-btn hdr-icon-compact"
            onclick={() => (showShortcutsModal = true)}
            title="Atur Shortcut & Hotkey Keyboard (Tekan ?)"
          >
            <Keyboard size={11} />
            <span>Shortcut</span>
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
          const target =
            targetExistingClip ||
            projectStore.tags[projectStore.tags.length - 1];
          if (target) {
            openTagEditor(target);
          }
        }}
        title={projectStore.tags.length > 0
          ? "Edit metadata klip terpilih (atau klik 2x klip / linimasa)"
          : "Buat minimal 1 klip terlebih dahulu untuk mengedit detail klip"}
      >
        <Tag size={12} />
        <span>Edit Klip</span>
      </button>

      <!-- STATS MATRIX -->
      <button
        class="btn-stats-blue"
        onclick={() => (showStatsMatrix = true)}
        title="Buka Matriks Silang Statistik Futsal"
      >
        <Table size={12} />
        <span>Matriks</span>
      </button>

      <!-- NEXT STEP -->
      <button
        class="btn-next-step"
        onclick={() => projectStore.setStage("telestrator")}
        title="Lanjut ke Studio Telestrasi"
      >
        <span>Telestrasi</span>
        <ArrowRight size={12} />
      </button>
    </div>
  </header>

  <!-- WORKSPACE BODY (KEEP VIDEO MOUNTED ACROSS SUB-TABS SO TIME NEVER RESETS & AVOID WKWEBVIEW STREAM ABORT) -->
  <main class="workspace-main">
      <!-- MODE 1: MOMEN SPORTS 2-TIER WORKSPACE (LEFT TAG/LABEL · CENTER VIDEO/PLAYERS/CANVAS · RIGHT CLIPS · BOTTOM 100% LINIMASA) -->
      <div class="tagging-two-tier" class:subtab-hidden={workspaceSubTab !== "tagging"}>
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
                  if (e.key === "Enter") {
                    e.preventDefault();
                    handleQuickSearchEnter();
                    (e.currentTarget as HTMLInputElement).blur();
                  } else if (e.key === "Escape") {
                    leftSearchQuery = "";
                    (e.currentTarget as HTMLInputElement).blur();
                  }
                }}
              />
              {#if leftSearchQuery}
                <button
                  type="button"
                  class="left-search-clear"
                  onclick={() => (leftSearchQuery = "")}
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
                    <div
                      class="left-tag-row-wrap"
                      class:on={isOn}
                      style="--row-col: {btn.color};"
                    >
                      <button
                        type="button"
                        class="left-tag-row"
                        class:on={isOn}
                        onclick={() => handleLeftButtonClick(btn)}
                        title="{btn.name}{btn.hotkey
                          ? ` [${btn.hotkey}]`
                          : ''} — {btn.continuous
                          ? 'Mode Kontinu (Start/Stop)'
                          : `Single Click (-${btn.leadSec}s/+${btn.lagSec}s)`}{btn
                          .links.length > 0
                          ? ` · Terhubung ke ${btn.links.length} tag`
                          : ''}"
                      >
                        <span
                          class="ltr-grip"
                          style="background-color: {btn.color};"
                        ></span>
                        {#if btn.continuous}
                          <span class="ltr-switch" class:on={isOn}><i></i></span
                          >
                        {:else}
                          <span
                            class="ltr-single-dot"
                            style="border-color: {btn.color};"
                          ></span>
                        {/if}
                        <span class="ltr-name">{btn.name}</span>
                        {#if isOn && rec}
                          <span class="ltr-live-timer"
                            >● {formatCompactElapsed(
                              Math.max(0, currentTime - rec.startTime),
                            )}</span
                          >
                        {:else}
                          {#if btn.links.length > 0}
                            <span
                              class="ltr-link-ico"
                              title="Terhubung ke {btn.links.length} tag"
                            >
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
                          ? `Scope terbatas (forTags: ${btn.forTags.join(", ")})`
                          : `Label: ${btn.name}`}
                      >
                        <span
                          class="ldc-dot"
                          style="background-color: {btn.color};"
                        ></span>
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
            <div
              class="video-container"
              class:split-angles={projectStore.angleViewMode === "split" && showAngle2}
            >
              <input
                bind:this={angle2InputEl}
                type="file"
                accept="video/*"
                onchange={handleAngle2FileInput}
                style="display: none;"
              />
              {#if projectStore.videoSrc}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video
                  bind:this={videoEl}
                  src={projectStore.videoSrc}
                  class="match-video"
                  class:angle-hidden={hideMainAngle}
                  ontimeupdate={handleTimeUpdate}
                  onloadedmetadata={handleLoadedMetadata}
                  onclick={togglePlay}
                ></video>
              {:else if ytVideoId}
                <div class="yt-stage" class:angle-hidden={hideMainAngle}>
                  <div bind:this={ytHostEl} class="yt-iframe-host"></div>
                  {#if ytError}
                    <div class="yt-error-overlay">
                      <p>{ytError}</p>
                      {#if isTauriDesktop()}
                        <button type="button" class="btn-sw-sec relink" onclick={() => projectStore.relinkVideoFile()}>
                          <Link2 size={12} />
                          <span>Tautkan File MP4 Lokal</span>
                        </button>
                      {/if}
                    </div>
                  {/if}
                  <div class="yt-stream-pill">
                    <span>YOUTUBE STREAM · {ytReady ? "SIAP TAG" : "MEMUAT..."}</span>
                    {#if isTauriDesktop()}
                      <button type="button" class="yt-pill-btn" onclick={() => projectStore.relinkVideoFile()} title="Pasangkan video MP4 lokal nanti untuk Telestrasi & Ekspor">
                        Tautkan MP4
                      </button>
                    {/if}
                  </div>
                </div>
              {:else if projectStore.liveCaptureActive}
                <LiveCameraCaptureStage
                  bind:isRecording={isPlaying}
                  bind:currentTime={currentTime}
                  bind:duration={duration}
                />
              {:else}
                <div class="empty-video-placeholder stopwatch-stage">
                  <div class="sw-header-pill">
                    <Timer size={13} class="text-sky-400" />
                    <span>MODE STOPWATCH LIVE (TANPA VIDEO)</span>
                  </div>
                  <div class="sw-clock-readout">{formatTime(currentTime)}</div>
                  {#if projectStore.periodKickoffs.length > 0}
                    <div class="sw-match-clock">
                      Match Clock: <strong>{projectStore.formatMatchClock(currentTime)}</strong>
                    </div>
                  {/if}
                  <p class="placeholder-desc">
                    Tekan <strong>Spasi</strong> atau tombol di bawah untuk menjalankan timer saat pertandingan berlangsung, lalu tautkan file MP4 rekaman setelah laga selesai.
                  </p>
                  <div class="sw-actions-row">
                    <button type="button" class="btn-sample-inline" onclick={togglePlay}>
                      {#if isPlaying}
                        <Pause size={13} />
                        <span>Jeda Stopwatch (Spasi)</span>
                      {:else}
                        <Play size={13} />
                        <span>Mulai Stopwatch (Spasi)</span>
                      {/if}
                    </button>
                    <button type="button" class="btn-sw-sec" onclick={() => seekTo(0)} title="Reset stopwatch ke 00:00">
                      <RotateCcw size={12} />
                      <span>Reset 00:00</span>
                    </button>
                    {#if isTauriDesktop()}
                      <button type="button" class="btn-sw-sec relink" onclick={() => projectStore.relinkVideoFile()} title="Pasangkan video rekaman ke semua tag & timeline ini">
                        <Link2 size={12} />
                        <span>Tautkan Video MP4</span>
                      </button>
                    {/if}
                    {#if projectStore.tags.length === 0}
                      <button type="button" class="btn-sw-sec" onclick={() => projectStore.loadSampleDemo()}>
                        <span>Sampel Demo</span>
                      </button>
                    {/if}
                  </div>
                </div>
              {/if}

              {#if showAngle2 && activeSecondaryAngle?.videoSrc}
                <!-- svelte-ignore a11y_media_has_caption -->
                <video
                  bind:this={angle2VideoEl}
                  src={activeSecondaryAngle.videoSrc}
                  muted
                  class="match-video angle2-video"
                  onloadedmetadata={() => syncSecondaryAngle(true)}
                  onclick={togglePlay}
                ></video>
                <span class="angle-badge cam1" class:hidden-badge={hideMainAngle}>Cam 1 · Utama</span>
                <span class="angle-badge cam2">{activeSecondaryAngle.name} ({activeSecondaryAngle.offsetSec >= 0 ? "+" : ""}{activeSecondaryAngle.offsetSec.toFixed(1)}s)</span>
              {/if}

              {#if videoOsd}
                <div class="video-osd-badge tone-{videoOsd.tone}">
                  <span class="osd-icon">{videoOsd.icon}</span>
                  <span class="osd-val">{videoOsd.value}</span>
                  <span class="osd-lbl">{videoOsd.label}</span>
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
              <div
                class="target-badge"
                class:live={activeContinuousList.length > 0}
              >
                <span class="target-dot"></span>
                <span
                  class="target-lbl"
                  title={targetTagName || "Belum ada tag"}
                >
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
                class:away={activeTeamSide === "away"}
                onclick={() =>
                  (activeTeamSide =
                    activeTeamSide === "home" ? "away" : "home")}
                title="Ganti sisi tim default (HOME / AWAY)"
              >
                {activeTeamSide === "home" ? "HOME" : "AWAY"}
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
                    <span class="pp-num" style="background-color: {p.color};"
                      >{p.num}</span
                    >
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
                    if (e.key === "Enter") {
                      e.preventDefault();
                      submitQuickAddPlayer();
                    }
                  }}
                />
              </div>
            </div>

            {#if projectStore.secondaryAngles.length > 0}
              <div class="multi-angle-bar">
                <div class="mab-left">
                  <span class="mab-lbl"><Camera size={11} /> SUDUT:</span>
                  <button
                    type="button"
                    class="mab-pill"
                    class:active={projectStore.angleViewMode === "single" && projectStore.activeAngleId === "main"}
                    onclick={() => {
                      projectStore.angleViewMode = "single";
                      projectStore.setActiveAngle("main");
                    }}
                  >
                    Cam 1 (Utama)
                  </button>
                  {#each projectStore.secondaryAngles as ang (ang.id)}
                    <button
                      type="button"
                      class="mab-pill"
                      class:active={projectStore.activeAngleId === ang.id && projectStore.angleViewMode === "single"}
                      onclick={() => {
                        projectStore.angleViewMode = "single";
                        projectStore.setActiveAngle(ang.id);
                      }}
                    >
                      {ang.name}
                    </button>
                  {/each}
                  <button
                    type="button"
                    class="mab-pill"
                    class:active={projectStore.angleViewMode === "split"}
                    onclick={() => {
                      projectStore.angleViewMode =
                        projectStore.angleViewMode === "split" ? "single" : "split";
                    }}
                    title="Tampilkan Cam 1 & Cam 2 berdampingan"
                  >
                    <Columns2 size={11} />
                    <span>Split 2 Cam</span>
                  </button>
                  <button type="button" class="mab-pill" onclick={handleAddAngleClick} title="Tambah sudut kamera lain">
                    + Cam
                  </button>
                </div>

                {#if activeSecondaryAngle}
                  <div class="mab-right">
                    <span class="mab-off-lbl">Offset Sync:</span>
                    <button type="button" class="mab-step" onclick={() => handleAngleOffsetDelta(-1)}>-1s</button>
                    <button type="button" class="mab-step" onclick={() => handleAngleOffsetDelta(-0.1)}>-0.1</button>
                    <span class="mab-off-val">{activeSecondaryAngle.offsetSec >= 0 ? "+" : ""}{activeSecondaryAngle.offsetSec.toFixed(1)}s</span>
                    <button type="button" class="mab-step" onclick={() => handleAngleOffsetDelta(0.1)}>+0.1</button>
                    <button type="button" class="mab-step" onclick={() => handleAngleOffsetDelta(1)}>+1s</button>
                    <button type="button" class="mab-step" onclick={() => projectStore.updateSecondaryAngle(activeSecondaryAngle.id, { offsetSec: 0 })} title="Reset offset">↺</button>
                    <button type="button" class="mab-step del" onclick={() => projectStore.removeSecondaryAngle(activeSecondaryAngle.id)} title="Hapus kamera ini">×</button>
                  </div>
                {/if}
              </div>
            {/if}

            <!-- MOMEN-STYLE TRANSPORT BAR -->
            <div class="momen-transport-bar">
              <div class="mtb-left">
                <button
                  type="button"
                  class="btn-momen-play"
                  onclick={togglePlay}
                  title="Play/Pause (Spasi)"
                >
                  {#if isPlaying}
                    <Pause size={15} />
                  {:else}
                    <Play size={15} />
                  {/if}
                </button>
                <button
                  type="button"
                  class="curr-time-hero-btn"
                  class:match-clock={projectStore.useMatchClock &&
                    projectStore.periodKickoffs.length > 0}
                  onclick={() => {
                    if (projectStore.periodKickoffs.length > 0) {
                      projectStore.useMatchClock = !projectStore.useMatchClock;
                    }
                  }}
                  title={projectStore.periodKickoffs.length > 0
                    ? "Klik untuk beralih antara Waktu Video dan Match Clock (B1/B2)"
                    : "Waktu Video (atur Kick-off di tombol KO untuk Match Clock)"}
                >
                  {projectStore.useMatchClock &&
                  projectStore.periodKickoffs.length > 0
                    ? projectStore.formatMatchClock(currentTime)
                    : formatCompactElapsed(currentTime)}
                </button>
                <div class="kickoff-anchor">
                  <button
                    type="button"
                    class="btn-kickoff-ko"
                    class:configured={projectStore.periodKickoffs.length > 0}
                    onclick={() => (showKickoffMenu = !showKickoffMenu)}
                    title="Sinkronisasi Kick-off di sini (Babak 1 / Babak 2 / Extra)"
                  >
                    <Flag size={10} />
                    <span>KO</span>
                  </button>

                  {#if showKickoffMenu}
                    <div class="kickoff-popover" role="menu">
                      <div class="ko-pop-hdr">
                        <span>Kick-off di sini ({formatTime(currentTime)})</span
                        >
                        <button
                          type="button"
                          class="ko-close"
                          onclick={() => (showKickoffMenu = false)}
                        >
                          <X size={11} />
                        </button>
                      </div>
                      <button
                        type="button"
                        class="ko-action-btn"
                        onclick={() => {
                          projectStore.setPeriodKickoff(1, currentTime);
                          showKickoffMenu = false;
                          notifyUser(
                            `Kick-off Babak 1 diset di ${formatTime(currentTime)}`,
                          );
                        }}
                      >
                        <Flag size={11} class="text-emerald-400" />
                        <span>Kick-off Babak 1 di sini</span>
                      </button>
                      <button
                        type="button"
                        class="ko-action-btn"
                        onclick={() => {
                          projectStore.setPeriodKickoff(2, currentTime);
                          showKickoffMenu = false;
                          notifyUser(
                            `Kick-off Babak 2 diset di ${formatTime(currentTime)}`,
                          );
                        }}
                      >
                        <Flag size={11} class="text-amber-400" />
                        <span>Kick-off Babak 2 di sini</span>
                      </button>
                      <button
                        type="button"
                        class="ko-action-btn"
                        onclick={() => {
                          projectStore.setPeriodKickoff(3, currentTime);
                          showKickoffMenu = false;
                          notifyUser(
                            `Kick-off Extra diset di ${formatTime(currentTime)}`,
                          );
                        }}
                      >
                        <Flag size={11} class="text-purple-400" />
                        <span>Kick-off Extra di sini</span>
                      </button>

                      {#if projectStore.periodKickoffs.length > 0}
                        <div class="ko-list-sep"></div>
                        {#each projectStore.periodKickoffs as ko (ko.period)}
                          <div class="ko-saved-row">
                            <button
                              type="button"
                              class="ko-seek-link"
                              onclick={() => {
                                seekTo(ko.videoTime);
                                showKickoffMenu = false;
                              }}
                            >
                              {ko.label}: {formatTime(ko.videoTime)}
                            </button>
                            <button
                              type="button"
                              class="ko-del-btn"
                              onclick={() =>
                                projectStore.clearPeriodKickoff(ko.period)}
                              title="Hapus penanda {ko.label}"
                            >
                              <X size={10} />
                            </button>
                          </div>
                        {/each}
                      {/if}
                    </div>
                  {/if}
                </div>

                <div class="kickoff-anchor">
                  <button
                    type="button"
                    class="btn-whistle-ai"
                    class:configured={whistleMarkers.length > 0}
                    disabled={isDetectingWhistles}
                    onclick={() => {
                      if (whistleMarkers.length === 0) {
                        runAutoWhistleDetect();
                      } else {
                        showWhistleMenu = !showWhistleMenu;
                      }
                    }}
                    title="Deteksi suara peluit wasit otomatis dari audio pertandingan"
                  >
                    <Volume2 size={10} />
                    <span>
                      {isDetectingWhistles
                        ? "Pindai Peluit..."
                        : whistleMarkers.length > 0
                          ? `Peluit (${whistleMarkers.length})`
                          : "Peluit AI"}
                    </span>
                  </button>

                  {#if showWhistleMenu}
                    <div class="whistle-popover" role="menu">
                      <div class="ko-pop-hdr">
                        <span
                          >Deteksi Peluit Wasit ({whistleMarkers.length})</span
                        >
                        <button
                          type="button"
                          class="ko-close"
                          onclick={() => (showWhistleMenu = false)}
                        >
                          <X size={11} />
                        </button>
                      </div>

                      <div class="whistle-pop-actions">
                        <button
                          type="button"
                          class="ko-action-btn"
                          style="flex: 1;"
                          disabled={isDetectingWhistles}
                          onclick={runAutoWhistleDetect}
                        >
                          <Volume2 size={11} class="text-amber-400" />
                          <span
                            >{isDetectingWhistles
                              ? "Memindai Audio..."
                              : "Pindai Ulang Audio"}</span
                          >
                        </button>
                        {#if whistleMarkers.length > 0}
                          <button
                            type="button"
                            class="ko-del-btn"
                            onclick={() => (whistleMarkers = [])}
                            title="Bersihkan semua penanda peluit"
                          >
                            <Trash2 size={11} />
                          </button>
                        {/if}
                      </div>

                      {#if whistleMarkers.length > 0}
                        <div class="whistle-list-scroll">
                          {#each whistleMarkers as w (w.id)}
                            <div class="whistle-row">
                              <button
                                type="button"
                                class="whistle-seek-btn"
                                onclick={() => seekTo(w.peakTime)}
                                title="{w.label} · {Math.round(
                                  w.peakFreqHz,
                                )} Hz ({Math.round(w.confidence * 100)}%)"
                              >
                                <span class="whistle-time"
                                  >{formatTime(w.peakTime)}</span
                                >
                                <span class="whistle-freq"
                                  >{Math.round(w.peakFreqHz)}Hz</span
                                >
                              </button>
                              <div class="whistle-tag-btns">
                                <button
                                  type="button"
                                  class="whistle-tag-btn foul"
                                  onclick={() =>
                                    createTagFromWhistle(w, "Foul")}
                                  title="Buat tag Foul di momen peluit ini"
                                >
                                  +Foul
                                </button>
                                <button
                                  type="button"
                                  class="whistle-tag-btn ko"
                                  onclick={() =>
                                    createTagFromWhistle(
                                      w,
                                      "Kick-in Set Piece",
                                    )}
                                  title="Buat tag Kick-in di momen peluit ini"
                                >
                                  +Set
                                </button>
                              </div>
                            </div>
                          {/each}
                        </div>
                      {:else}
                        <span class="whistle-empty"
                          >Klik Pindai Audio untuk menandai peluit di linimasa.</span
                        >
                      {/if}
                    </div>
                  {/if}
                </div>

                <span class="play-status-pill" class:running={isPlaying || reverseRate > 0}>
                  ● {reverseRate > 0 ? `◀ -${reverseRate}x` : isPlaying ? "jalan" : "jeda"}
                </span>
                {#if activeLoopClip}
                  <button
                    type="button"
                    class="loop-active-pill"
                    onclick={() => {
                      stopClipLoop();
                      showVideoOsd("▶", "Lanjut", "Loop klip dimatikan", "emerald");
                    }}
                    title="Sedang mengulang klip ini — klik untuk lanjut video penuh (atau tekan Spasi / Esc)"
                  >
                    🔁 {activeLoopClip.category} ×
                  </button>
                {/if}
              </div>

              <div class="mtb-scrubber">
                <input
                  type="range"
                  min="0"
                  max={Math.max(duration, 0.1)}
                  step="0.05"
                  value={currentTime}
                  oninput={(e) =>
                    seekTo(Number((e.currentTarget as HTMLInputElement).value))}
                  class="video-range-slider"
                  aria-label="Posisi Video"
                />
                <span class="dur-total-lbl">{formatTime(duration)}</span>
              </div>

              <div class="mtb-right">
                <button
                  type="button"
                  class="btn-ctrl-sm"
                  onclick={() => stepFrame(-1)}
                  title="Mundur 1 Frame"
                >
                  -1F
                </button>
                <button
                  type="button"
                  class="btn-ctrl-sm"
                  onclick={() => stepFrame(1)}
                  title="Maju 1 Frame"
                >
                  +1F
                </button>
                <button
                  type="button"
                  class="btn-ctrl-sm"
                  onclick={() => seekTo(currentTime - 5)}
                  title="Mundur 5 Detik"
                >
                  -5s
                </button>
                <button
                  type="button"
                  class="btn-ctrl-sm"
                  onclick={() => seekTo(currentTime + 5)}
                  title="Maju 5 Detik"
                >
                  +5s
                </button>

                <button
                  type="button"
                  class="btn-inout"
                  class:active={inPoint !== null}
                  onclick={setInPoint}
                  title="Tandai Titik Masuk (I)"
                >
                  [IN{inPoint !== null ? ` ${formatTime(inPoint)}` : ""}
                </button>
                <button
                  type="button"
                  class="btn-inout"
                  onclick={setOutPoint}
                  title="Potong Klip (O)"
                >
                  OUT]
                </button>

                <div class="speed-selector-group" title="Kecepatan Putar (J = Putar Mundur / Perlambat, K = 1.0x + Jeda, L = Percepat)">
                  <button
                    type="button"
                    class="speed-pill rev-pill"
                    class:active={reverseRate > 0}
                    onclick={cycleReversePlayback}
                    title="Putar Mundur / Backward (klik berulang: -1x → -2x → -4x → -0.5x; Spasi/K untuk jeda)"
                  >
                    {reverseRate > 0 ? `◀◀ -${reverseRate}x` : "◀◀"}
                  </button>
                  {#each [0.25, 0.5, 1.0, 1.5, 2.0, 4.0] as spd}
                    <button
                      type="button"
                      class="speed-pill"
                      class:active={reverseRate === 0 && playbackRate === spd}
                      onclick={() => {
                        applyPlaybackSpeed(spd, isPlaying);
                        showVideoOsd(
                          spd > 1 ? "⏩" : spd < 1 ? "🐢" : "▶",
                          `${spd}x`,
                          spd === 1 ? "Kecepatan Normal" : spd < 1 ? "Slow-Motion" : "Dipercepat",
                          spd > 1 ? "sky" : spd < 1 ? "amber" : "emerald",
                        );
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
                    const target =
                      targetExistingClip ||
                      projectStore.tags[projectStore.tags.length - 1];
                    if (target) {
                      projectStore.openClipInTelestrator(target);
                    } else {
                      projectStore.setStage("telestrator");
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
                {#if projectStore.secondaryAngles.length === 0}
                  <button
                    type="button"
                    class="btn-ctrl-sm"
                    onclick={handleAddAngleClick}
                    title="Tambah sudut kamera ke-2 untuk sinkronisasi Multi-Angle"
                  >
                    + Cam 2
                  </button>
                {/if}
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
              <div
                class="center-spatial-canvas"
                style="height: {spatialCanvasHeight}px;"
              >
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
                  onOpenFullscreenCanvas={() =>
                    (workspaceSubTab = "coding_board")}
                />
              </div>
            {:else}
              <button
                type="button"
                class="canvas-collapsed-bar"
                onclick={() => (showSpatialCanvas = true)}
              >
                <ChevronUp size={12} />
                <span
                  >Papan kanvas disembunyikan. Klik di sini untuk menampilkan.
                  Tombol kiri & keyboard tetap berjalan.</span
                >
                {#if activeContinuousList.length > 0}
                  <span class="dock-live-pill"
                    >● {activeContinuousList.length} Merekam</span
                  >
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
                class:active={rightPanelTab === "clips"}
                onclick={() => (rightPanelTab = "clips")}
              >
                <Scissors size={12} />
                <span>Klip ({filteredTags.length})</span>
              </button>
              <button
                type="button"
                class="tab-pill"
                class:active={rightPanelTab === "playlist"}
                onclick={() => (rightPanelTab = "playlist")}
              >
                <ListOrdered size={12} />
                <span
                  >Playlist ({currentPlaylist
                    ? currentPlaylist.items.length
                    : 0})</span
                >
              </button>
            </div>

            {#if rightPanelTab === "clips"}
              <!-- PANEL A: SUPER-COMPACT 1-ROW CLIP LIST -->
              <div class="actions-list-panel">
                <div class="list-header">
                  <div class="list-filter-row">
                    <div class="search-wrap-blue">
                      <Search size={12} />
                      <input
                        type="text"
                        placeholder="Cari klip / label..."
                        bind:value={searchQuery}
                        class="search-input-blue"
                      />
                    </div>
                    <select
                      bind:value={filterCategory}
                      class="filter-select-blue"
                    >
                      <option value="ALL">Semua Aksi</option>
                      {#each availableFilterCategories as catName}
                        <option value={catName}>{catName}</option>
                      {/each}
                    </select>
                  </div>

                  <div class="micro-filter-bar">
                    <button
                      type="button"
                      class="mf-pill"
                      class:active={microFilter === "all"}
                      onclick={() => (microFilter = "all")}
                    >
                      Semua
                    </button>
                    <button
                      type="button"
                      class="mf-pill"
                      class:active={microFilter === "home"}
                      onclick={() =>
                        (microFilter = microFilter === "home" ? "all" : "home")}
                      title="Filter Klip Tim Home"
                    >
                      H
                    </button>
                    <button
                      type="button"
                      class="mf-pill"
                      class:active={microFilter === "away"}
                      onclick={() =>
                        (microFilter = microFilter === "away" ? "all" : "away")}
                      title="Filter Klip Tim Lawan (Away)"
                    >
                      A
                    </button>
                    <button
                      type="button"
                      class="mf-pill mf-star"
                      class:active={microFilter === "fav"}
                      onclick={() =>
                        (microFilter = microFilter === "fav" ? "all" : "fav")}
                      title="Filter Momen Favorit (★)"
                    >
                      ★
                    </button>
                    <button
                      type="button"
                      class="mf-pill"
                      class:active={microFilter === "good"}
                      onclick={() =>
                        (microFilter = microFilter === "good" ? "all" : "good")}
                      title="Filter Rating Bagus"
                    >
                      <ThumbsUp size={9} />
                    </button>
                    <button
                      type="button"
                      class="mf-pill"
                      class:active={microFilter === "eval"}
                      onclick={() =>
                        (microFilter = microFilter === "eval" ? "all" : "eval")}
                      title="Filter Klip Evaluasi / Kesalahan"
                    >
                      <ThumbsDown size={9} />
                    </button>
                    {#if filteredTags.length > 0}
                      <button
                        type="button"
                        class="mf-pill"
                        class:active={allFilteredSelected}
                        onclick={toggleSelectAllFiltered}
                        title="Pilih / Batal Pilih Semua Klip Terlihat (Ctrl+A)"
                      >
                        {allFilteredSelected ? "✓ Semua" : "Pilih"}
                      </button>
                    {/if}
                  </div>

                  {#if filterPlayer !== "ALL"}
                    <div class="active-player-filter-chip">
                      <span>Pemain: <strong>{filterPlayer}</strong></span>
                      <button
                        type="button"
                        onclick={() => (filterPlayer = "ALL")}
                        title="Reset filter pemain"
                      >
                        <X size={10} />
                      </button>
                    </div>
                  {/if}
                </div>

                {#if selectedClipIds.length > 0}
                  <div class="clip-pick-bar" role="toolbar" aria-label="Aksi Massal Klip Terpilih">
                    <span class="cpb-count"><strong>{selectedClipIds.length}</strong> dipilih</span>
                    <div class="cpb-actions">
                      <button type="button" class="cpb-btn" onclick={handlePlaySelectedClips} title="Putar berurutan semua klip terpilih">
                        <Play size={10} />
                        <span>Putar</span>
                      </button>
                      <button type="button" class="cpb-btn" onclick={handleOpenBatchEditor} title="Edit Label & Pemain Massal">
                        <Edit3 size={10} />
                        <span>Edit</span>
                      </button>
                      <button type="button" class="cpb-btn" onclick={() => handleBatchToggleFavorite(selectedClipIds)} title="Toggle Favorit Massal">
                        <span>★</span>
                      </button>
                      <button type="button" class="cpb-btn" onclick={() => handleBatchAddToPlaylist(selectedClipIds)} title="Tambah ke Playlist">
                        <Plus size={10} />
                        <span>Playlist</span>
                      </button>
                      <button type="button" class="cpb-btn" disabled={isBatchExporting} onclick={handleBatchExportSelectedClips} title="Ekspor semua klip terpilih ke 1 folder MP4">
                        <Download size={10} />
                        <span>{isBatchExporting ? "Ekspor..." : "Ekspor"}</span>
                      </button>
                      <button type="button" class="cpb-btn danger" onclick={() => handleBatchDeleteClips(selectedClipIds)} title="Hapus semua klip terpilih">
                        <Trash2 size={10} />
                        <span>Hapus</span>
                      </button>
                      <button type="button" class="cpb-btn" onclick={() => (selectedClipIds = [])} title="Bersihkan pilihan (Esc)">
                        <X size={10} />
                      </button>
                    </div>
                  </div>
                {/if}

                <div class="list-items-scroll">
                  {#if filteredTags.length === 0}
                    <div class="empty-list-futsal">
                      <div class="empty-icon">✂️</div>
                      <h4 class="empty-title">Belum Ada Klip</h4>
                      <p class="empty-guide">
                        Putar video (<strong>Spasi</strong>) lalu klik tombol
                        <strong>Tag Kontinu / 1-Klik</strong>
                        atau tekan <strong>Hotkey</strong>.
                      </p>
                    </div>
                  {:else}
                    {#each filteredTags as tag (tag.id)}
                      {@const clipPlayers =
                        tag.playersInvolved && tag.playersInvolved.length > 0
                          ? tag.playersInvolved
                          : tag.playerLabel
                            ? [tag.playerLabel]
                            : []}
                      {@const hasMetaRow =
                        Boolean(tag.labels?.length) ||
                        clipPlayers.length > 1 ||
                        Boolean(tag.drawings?.length)}
                      <!-- svelte-ignore a11y_click_events_have_key_events -->
                      <div
                        class="clip-row"
                        class:active-loop={activeLoopClip?.id === tag.id}
                        class:selected-clip={selectedClipId === tag.id}
                        class:multi-selected={selectedClipIds.includes(tag.id)}
                        onclick={(e) => {
                          if (e.ctrlKey || e.metaKey || e.shiftKey) {
                            toggleClipSelection(tag, e);
                          } else {
                            selectedClipId = tag.id;
                          }
                        }}
                        ondblclick={() => openTagEditor(tag)}
                        role="button"
                        tabindex="0"
                      >
                        <div class="clip-row-main">
                          <span
                            class="clip-color-bar"
                            style="background-color: {tag.color};"
                          ></span>
                          <input
                            type="checkbox"
                            class="clip-pick-check"
                            checked={selectedClipIds.includes(tag.id)}
                            onclick={(e) => {
                              e.stopPropagation();
                              toggleClipSelection(tag, e);
                            }}
                            aria-label="Pilih klip {tag.title}"
                          />
                          <button
                            type="button"
                            class="clip-star-btn"
                            class:starred={Boolean(tag.favorite)}
                            onclick={(e) => {
                              e.stopPropagation();
                              toggleClipFavorite(tag);
                            }}
                            title={tag.favorite
                              ? "Hapus dari Favorit"
                              : "Tandai Favorit (★)"}
                          >
                            <Star
                              size={10}
                              fill={tag.favorite ? "#f59e0b" : "none"}
                            />
                          </button>
                          <span class="clip-cat-chip" title={tag.title}>
                            {#if tag.isContinuous}<span class="clip-cont-dot"
                                >●</span
                              >{/if}
                            {tag.category}
                          </span>
                          <span
                            class="clip-time-mono"
                            title="Video: {formatTime(tag.startTime).slice(
                              0,
                              5,
                            )}–{formatTime(tag.endTime).slice(0, 5)}"
                          >
                            {projectStore.useMatchClock &&
                            projectStore.periodKickoffs.length > 0
                              ? projectStore.formatMatchClock(tag.startTime)
                              : `${formatTime(tag.startTime).slice(0, 5)}–${formatTime(tag.endTime).slice(0, 5)}`}
                          </span>
                          <span class="clip-dur-micro"
                            >{(tag.endTime - tag.startTime).toFixed(1)}s</span
                          >
                        </div>

                        <div class="clip-row-sub">
                          <div class="clip-sub-left">
                            {#if clipPlayers.length > 0}
                              <span
                                class="clip-player-chip"
                                title={clipPlayers.join(", ")}
                              >
                                <User size={9} />
                                <span
                                  >{clipPlayers[0]}{clipPlayers.length > 1
                                    ? ` +${clipPlayers.length - 1}`
                                    : ""}</span
                                >
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
                                if (activeLoopClip?.id === tag.id) {
                                  stopClipLoop();
                                  showVideoOsd("▶", "Lanjut", "Loop klip dimatikan", "emerald");
                                } else {
                                  playClipLoop(tag);
                                }
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
                              disabled={exportingQuickClipId !== null}
                              onclick={(e) => {
                                e.stopPropagation();
                                handleQuickExportSingleClip(tag);
                              }}
                              title="Quick Export MP4 Klip Ini"
                            >
                              <Download size={10} />
                            </button>
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
                                <span class="micro-pill micro-player"
                                  >{extraP}</span
                                >
                              {/each}
                            {/if}
                            {#if tag.labels && tag.labels.length > 0}
                              {#each tag.labels as lbl}
                                <span
                                  class="micro-pill"
                                  style="border-color: {lbl.color ||
                                    '#38bdf8'};"
                                >
                                  <i
                                    class="micro-dot"
                                    style="background-color: {lbl.color ||
                                      '#38bdf8'};"
                                  ></i>
                                  {lbl.name}
                                </span>
                              {/each}
                            {/if}
                            {#if tag.drawings && tag.drawings.length > 0}
                              <span class="micro-pill micro-draw"
                                >★ {tag.drawings.length} gambar</span
                              >
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
                  <span class="pl-quick-title">Antrian Playlist Presentasi</span
                  >
                  <span class="pl-quick-count"
                    >{currentPlaylist ? currentPlaylist.items.length : 0} Klip</span
                  >
                </div>

                <div class="playlist-items-scroll">
                  {#if !currentPlaylist || currentPlaylist.items.length === 0}
                    <div class="empty-list-futsal">
                      <div class="empty-icon">📋</div>
                      <h4 class="empty-title">Playlist Masih Kosong</h4>
                      <p class="empty-guide">
                        Klik tombol <strong>+Playlist</strong> pada kartu aksi untuk
                        mengumpulkan momen terbaik ke playlist siaran.
                      </p>
                    </div>
                  {:else}
                    {#each currentPlaylist.items as item, idx}
                      <div class="playlist-quick-row">
                        <span class="pl-order">{idx + 1}</span>
                        <div class="pl-info">
                          <span class="pl-name">{item.title}</span>
                          <span class="pl-meta"
                            >{formatTime(item.tagEvent.startTime)} - {formatTime(
                              item.tagEvent.endTime,
                            )}</span
                          >
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
                  <button
                    class="btn-open-export"
                    onclick={() => projectStore.setStage("playlist_export")}
                  >
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

        <div
          class="linimasa-bottom-tier"
          style="height: {isLinimasaCollapsed ? 26 : linimasaHeight}px;"
        >
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
            {selectedClipIds}
            roster={FUTSAL_ROSTER.map((p) =>
              projectStore.getPlayerDisplayLabel(p),
            )}
            hasCopiedMeta={copiedMeta !== null}
            isCollapsed={isLinimasaCollapsed}
            activeLoopClipId={activeLoopClip?.id ?? null}
            periodKickoffs={projectStore.periodKickoffs}
            useMatchClock={projectStore.useMatchClock}
            formatMatchClock={(t) => projectStore.formatMatchClock(t)}
            {whistleMarkers}
            onQuickTagWhistle={(w) => createTagFromWhistle(w, "Foul")}
            onSeek={seekTo}
            onSelectClip={(tag) => {
              selectedClipId = tag.id;
              selectedClipIds = [tag.id];
              activeLoopClip = null;
              activeClipQueue = [];
              seekTo(tag.startTime);
            }}
            onSelectionChange={(ids, primaryId) => {
              selectedClipIds = ids;
              selectedClipId = primaryId;
            }}
            onEditClip={openTagEditor}
            onOpenTelestration={(t) => projectStore.openClipInTelestrator(t)}
            onTrimClip={handleTrimClip}
            onMoveClip={handleMoveClip}
            onReassignClipCategory={handleReassignClipCategory}
            onBatchChangeCategory={handleBatchChangeCategory}
            onBatchToggleLabel={handleBatchToggleLabel}
            onBatchAddCustomLabel={handleBatchAddCustomLabel}
            onBatchTogglePlayer={handleBatchTogglePlayer}
            onBatchAddCustomPlayer={handleBatchAddCustomPlayer}
            onBatchSetTeamSide={handleBatchSetTeamSide}
            onBatchToggleFavorite={handleBatchToggleFavorite}
            onSplitClip={handleSplitClipAtPlayhead}
            onDuplicateClip={handleDuplicateClip}
            onCopyClipMeta={handleCopyClipMeta}
            onBatchPasteMeta={handleBatchPasteMeta}
            onBatchAddToPlaylist={handleBatchAddToPlaylist}
            onQuickExportClip={handleQuickExportSingleClip}
            onBatchDeleteClips={handleBatchDeleteClips}
            onToggleCollapse={() =>
              (isLinimasaCollapsed = !isLinimasaCollapsed)}
            onChangeLead={(sec) => (leadTimeSeconds = sec)}
            onChangeLag={(sec) => (lagTimeSeconds = sec)}
          />
        </div>
      </div>
    {#if workspaceSubTab === "coding_board"}
      <!-- MODE 2: FULLSCREEN MOMEN & ONCE SPORT ACTION PAD -->
      <div class="momen-fullscreen-pad">
        <div class="mini-transport-strip">
          <div class="mts-left">
            <button
              type="button"
              class="btn-overlay-play"
              onclick={togglePlay}
              title="Play/Pause (Spasi)"
            >
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
            <button
              type="button"
              class="btn-ctrl-sm"
              onclick={() => seekTo(currentTime - 5)}>-5s</button
            >
            <button
              type="button"
              class="btn-ctrl-sm"
              onclick={() => seekTo(currentTime + 5)}>+5s</button
            >
          </div>
          <div class="mts-right">
            <span class="mts-clips-count"
              >Total Klip: <strong>{projectStore.tags.length}</strong></span
            >
            {#if activeContinuousList.length > 0}
              <span class="dock-live-pill">
                ● {activeContinuousList.map((c) => c.name).join(" · ")}
              </span>
            {/if}
          </div>
        </div>

        <VisualCodingBoard
          board={activeBoard}
          boards={projectStore.boards}
          defaultBoardId={projectStore.defaultBoardId}
          initialSelectedButtonId={codingBoardFocusButtonId}
          onSelectBoard={(id) => projectStore.selectBoard(id)}
          onSetDefaultBoard={(id) => {
            projectStore.setDefaultBoard(id);
            notifyUser("Coding Board default disimpan");
          }}
          onCreateBoard={() => projectStore.createNewBoard()}
          onDuplicateBoard={() => projectStore.duplicateActiveBoard()}
          onDeleteBoard={(id) => projectStore.deleteBoard(id)}
          onToggleBoardLock={() => projectStore.toggleActiveBoardLock()}
          onUpdateBoardMeta={(patch) =>
            projectStore.updateActiveBoardMeta(patch)}
          onImportBoardJson={handleImportBoardJson}
          onExportBoardJson={handleExportBoardJson}
          onUpsertButton={(btn) => projectStore.upsertBoardButton(btn)}
          onDeleteButton={(id) => projectStore.deleteBoardButton(id)}
          onToggleLink={(src, dst) =>
            projectStore.toggleBoardButtonLink(src, dst)}
          onBackToVideo={() => {
            codingBoardFocusButtonId = null;
            workspaceSubTab = "tagging";
          }}
        />
      </div>
    {:else if workspaceSubTab === "minutes"}
      <!-- MODE 2B: FUTSAL ROTATION, MENIT BERMAIN & QUARTET 4v4 -->
      <MatchMinutesView
        {currentTime}
        {duration}
        {isPlaying}
        onTogglePlay={togglePlay}
        onSeek={seekTo}
        onPlayClips={(clips, title) => {
          workspaceSubTab = "tagging";
          playSequentialClips(clips, title);
        }}
      />
    {:else if workspaceSubTab === "lineup"}
      <!-- MODE 3: FUTSAL ROSTER & LINEUP COURT (MOMEN SPORTS STYLE) -->
      <div class="lineup-fullscreen">
        <div class="lineup-header">
          <h3>Susunan Pemain & Roster Futsal (Starting 5 & Cadangan)</h3>
          <p>
            Klik pemain untuk menyaring klip kejadian yang melibatkan pemain
            tersebut.
          </p>
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
              <button
                type="button"
                class="player-marker kiper-pos"
                onclick={() => {
                  filterPlayer = "#1 Kiper";
                  workspaceSubTab = "tagging";
                }}
              >
                <span class="pos-badge">#1</span>
                <span class="pos-name">Kiper</span>
              </button>
              <!-- Anchor -->
              <button
                type="button"
                class="player-marker anchor-pos"
                onclick={() => {
                  filterPlayer = "#4 Anchor";
                  workspaceSubTab = "tagging";
                }}
              >
                <span class="pos-badge">#4</span>
                <span class="pos-name">Anchor</span>
              </button>
              <!-- Flank Kiri -->
              <button
                type="button"
                class="player-marker flank-l-pos"
                onclick={() => {
                  filterPlayer = "#7 Flank Kiri";
                  workspaceSubTab = "tagging";
                }}
              >
                <span class="pos-badge">#7</span>
                <span class="pos-name">Flank Kiri</span>
              </button>
              <!-- Flank Kanan -->
              <button
                type="button"
                class="player-marker flank-r-pos"
                onclick={() => {
                  filterPlayer = "#11 Flank Kanan";
                  workspaceSubTab = "tagging";
                }}
              >
                <span class="pos-badge">#11</span>
                <span class="pos-name">Flank Kanan</span>
              </button>
              <!-- Pivot -->
              <button
                type="button"
                class="player-marker pivot-pos"
                onclick={() => {
                  filterPlayer = "#9 Pivot";
                  workspaceSubTab = "tagging";
                }}
              >
                <span class="pos-badge">#9</span>
                <span class="pos-name">Pivot</span>
              </button>
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
                    {@const count = projectStore.tags.filter(
                      (t) =>
                        projectStore.normalizePlayerLabel(t.playerLabel) ===
                        label,
                    ).length}
                    <tr>
                      <td
                        ><span
                          class="badge-num"
                          style="background-color: {p.color}">{p.num}</span
                        ></td
                      >
                      <td class="font-bold">{p.name}</td>
                      <td class="text-muted">{p.role}</td>
                      <td><span class="count-pill">{count} Klip</span></td>
                      <td>
                        <button
                          class="btn-filter-player"
                          onclick={() => {
                            filterPlayer = label;
                            workspaceSubTab = "tagging";
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

  <!-- DEDICATED 3-COLUMN TAG / LABEL / PLAYER PANEL (ONCE SPORT STYLE) -->
  {#if liveEditingTag && showTagLabelEditor}
    <TagLabelEditorModal
      tag={liveEditingTag}
      isOpen={showTagLabelEditor}
      allTags={projectStore.tags}
      selectedBatchIds={selectedClipIds}
      onClose={() => (showTagLabelEditor = false)}
      onSave={(updated) => {
        projectStore.updateTag(updated);
        activeEditingTag = updated;
        showTagLabelEditor = false;
      }}
      onLiveUpdate={(updated) => {
        projectStore.updateTag(updated);
        activeEditingTag = updated;
      }}
      onNavigateClip={(nextTag) => {
        activeEditingTag = nextTag;
        selectedClipId = nextTag.id;
        selectedClipIds = [nextTag.id];
        playClipLoop(nextTag);
      }}
      onDelete={(id) => {
        projectStore.deleteTag(id);
        if (selectedClipId === id) selectedClipId = null;
        selectedClipIds = selectedClipIds.filter((x) => x !== id);
        showTagLabelEditor = false;
      }}
      onBatchChangeCategory={handleBatchChangeCategory}
      onBatchToggleLabel={handleBatchToggleLabel}
      onBatchAddCustomLabel={handleBatchAddCustomLabel}
      onBatchTogglePlayer={handleBatchTogglePlayer}
      onBatchAddCustomPlayer={handleBatchAddCustomPlayer}
      onBatchSetTeamSide={handleBatchSetTeamSide}
      onBatchToggleFavorite={handleBatchToggleFavorite}
      onBatchDelete={(ids) => {
        handleBatchDeleteClips(ids);
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

  {#if showShortcutsModal}
    <KeyboardShortcutsModal
      isOpen={showShortcutsModal}
      onClose={() => (showShortcutsModal = false)}
      board={activeBoard}
    />
  {/if}

  <PhoneRemoteModal
    isOpen={showPhoneRemoteModal}
    onClose={() => (showPhoneRemoteModal = false)}
    onRemoteRunningChange={(r) => (isPhoneRemoteRunning = r)}
  />

  <ShiftActionTimesModal
    isOpen={showShiftTimesModal}
    playheadTime={currentTime}
    onClose={() => (showShiftTimesModal = false)}
    onApplied={(n, delta) =>
      notifyUser(
        `${n} klip digeser ${delta >= 0 ? "+" : ""}${delta.toFixed(1)}s (Ctrl+Z untuk batal)`,
      )}
  />

  <QuickExportClipModal
    clip={quickExportModalClip}
    isExporting={exportingQuickClipId !== null}
    onClose={() => (quickExportModalClip = null)}
    onConfirmExport={(opts) => {
      const target = quickExportModalClip;
      if (target) executeQuickExportSingleClip(target, opts);
    }}
  />
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
    font-family:
      "Inter",
      system-ui,
      -apple-system,
      sans-serif;
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
    flex: 1;
    min-width: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .board-header-controls::-webkit-scrollbar {
    display: none;
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
    max-width: 155px;
    flex-shrink: 0;
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
    flex-shrink: 0;
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

  .hdr-auto-btn.active {
    background: rgba(14, 165, 233, 0.25);
    border-color: #38bdf8;
    color: #e0f2fe;
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
    background: linear-gradient(
      135deg,
      rgba(2, 132, 199, 0.4),
      rgba(30, 58, 138, 0.6)
    );
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
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
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

  .tagging-two-tier.subtab-hidden {
    display: none !important;
  }

  .hdr-default-btn.is-default {
    border-color: #f59e0b;
    color: #fcd34d;
    background: rgba(245, 158, 11, 0.16);
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
    font-family: "Fira Code", monospace;
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
    background: linear-gradient(
      90deg,
      rgba(220, 38, 38, 0.28) 0%,
      #0b1629 100%
    );
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
    font-family: "Fira Code", monospace;
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
    transition:
      opacity 0.12s,
      color 0.12s;
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
    font-family: "Fira Code", monospace;
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

  .video-container.split-angles {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 2px;
  }

  .match-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .match-video.angle-hidden {
    display: none;
  }

  .angle-badge {
    position: absolute;
    bottom: 8px;
    z-index: 20;
    font-size: 9.5px;
    font-weight: 800;
    padding: 2px 8px;
    border-radius: 5px;
    background: rgba(2, 6, 23, 0.78);
    border: 1px solid #1e3b68;
    color: #e2e8f0;
    pointer-events: none;
  }

  .angle-badge.cam1 {
    left: 10px;
  }

  .angle-badge.cam2 {
    right: 10px;
    border-color: #38bdf8;
    color: #7dd3fc;
  }

  .angle-badge.hidden-badge {
    display: none;
  }

  .multi-angle-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 6px;
    padding: 4px 10px;
    background: #071120;
    border-bottom: 1px solid #1a355d;
    font-size: 10px;
  }

  .mab-left,
  .mab-right {
    display: flex;
    align-items: center;
    gap: 5px;
    flex-wrap: wrap;
  }

  .mab-lbl {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    font-size: 9.5px;
    font-weight: 800;
    color: #38bdf8;
  }

  .mab-pill,
  .mab-step {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0f172a;
    border: 1px solid #243b61;
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 700;
    padding: 2px 7px;
    border-radius: 5px;
    cursor: pointer;
  }

  .mab-pill.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .mab-off-lbl {
    font-size: 9.5px;
    color: #94a3b8;
  }

  .mab-off-val {
    font-family: 'Fira Code', monospace;
    font-size: 10px;
    font-weight: 800;
    color: #38bdf8;
    min-width: 38px;
    text-align: center;
  }

  .mab-step.del:hover {
    border-color: #ef4444;
    color: #fca5a5;
  }

  .video-osd-badge {
    position: absolute;
    top: 14px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 35;
    display: inline-flex;
    align-items: center;
    gap: 7px;
    padding: 5px 14px;
    border-radius: 999px;
    background: rgba(6, 12, 23, 0.86);
    border: 1px solid #38bdf8;
    box-shadow: 0 6px 22px rgba(2, 6, 23, 0.75);
    pointer-events: none;
    backdrop-filter: blur(6px);
  }

  .video-osd-badge.tone-amber {
    border-color: #f59e0b;
  }

  .video-osd-badge.tone-emerald {
    border-color: #10b981;
  }

  .osd-icon {
    font-size: 13px;
  }

  .osd-val {
    font-family: "Fira Code", monospace;
    font-size: 12.5px;
    font-weight: 900;
    color: #ffffff;
  }

  .osd-lbl {
    font-size: 10.5px;
    font-weight: 700;
    color: #93c5fd;
  }

  .video-osd-badge.tone-amber .osd-lbl {
    color: #fcd34d;
  }

  .video-osd-badge.tone-emerald .osd-lbl {
    color: #6ee7b7;
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
    box-shadow:
      0 4px 20px rgba(0, 0, 0, 0.6),
      0 0 16px rgba(14, 165, 233, 0.4);
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
    gap: 6px;
    padding: 0 6px;
    flex-shrink: 0;
    overflow-x: auto;
    scrollbar-width: none;
  }

  .momen-transport-bar::-webkit-scrollbar {
    display: none;
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

  .loop-active-pill {
    font-size: 9px;
    font-weight: 800;
    padding: 1px 7px;
    border-radius: 999px;
    background: rgba(245, 158, 11, 0.2);
    border: 1px solid #f59e0b;
    color: #fcd34d;
    white-space: nowrap;
    max-width: 120px;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .loop-active-pill:hover {
    background: rgba(245, 158, 11, 0.35);
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
    font-family: "Fira Code", monospace;
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
    font-family: "Fira Code", monospace;
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

  .speed-pill.rev-pill.active {
    background-color: #d97706;
    color: #060b14;
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
    font-family: "Fira Code", monospace;
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
    font-family: "Fira Code", monospace;
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
    background: transparent;
    border: none;
    padding: 0;
    font-family: inherit;
    cursor: pointer;
    transition: transform 0.15s;
  }

  .player-marker:hover {
    transform: scale(1.15);
  }

  .kiper-pos {
    left: 24px;
    top: 100px;
  }
  .anchor-pos {
    left: 120px;
    top: 100px;
  }
  .flank-l-pos {
    left: 220px;
    top: 40px;
  }
  .flank-r-pos {
    left: 220px;
    top: 160px;
  }
  .pivot-pos {
    left: 320px;
    top: 100px;
  }

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

  /* MATCH CLOCK & KICK-OFF POPOVER */
  .curr-time-hero-btn {
    background: transparent;
    border: 1px solid transparent;
    font-family: "Fira Code", monospace;
    font-size: 12px;
    font-weight: 900;
    color: #ffffff;
    padding: 2px 5px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .curr-time-hero-btn.match-clock {
    color: #34d399;
    background: rgba(16, 185, 129, 0.14);
    border-color: rgba(16, 185, 129, 0.4);
  }

  .kickoff-anchor {
    position: relative;
    display: inline-flex;
    align-items: center;
  }

  .btn-kickoff-ko {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #0b172a;
    border: 1px solid #1e3a5f;
    color: #93c5fd;
    font-size: 9px;
    font-weight: 800;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-kickoff-ko:hover,
  .btn-kickoff-ko.configured {
    border-color: #10b981;
    color: #34d399;
    background: rgba(16, 185, 129, 0.14);
  }

  .btn-whistle-ai {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #0b172a;
    border: 1px solid #1e3a5f;
    color: #fcd34d;
    font-size: 9px;
    font-weight: 800;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
    white-space: nowrap;
  }

  .btn-whistle-ai:hover:not(:disabled),
  .btn-whistle-ai.configured {
    border-color: #f59e0b;
    color: #fef3c7;
    background: rgba(245, 158, 11, 0.16);
  }

  .btn-whistle-ai:disabled {
    opacity: 0.6;
    cursor: wait;
  }

  .whistle-popover {
    position: fixed;
    bottom: 245px;
    left: 260px;
    width: 258px;
    background: #0a1628;
    border: 1px solid #f59e0b;
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.78);
    z-index: 82;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .whistle-pop-actions {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .whistle-list-scroll {
    max-height: 170px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .whistle-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    background: #060c17;
    border: 1px solid #1a355d;
    border-radius: 5px;
    padding: 3px 6px;
  }

  .whistle-seek-btn {
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: none;
    cursor: pointer;
    padding: 0;
  }

  .whistle-time {
    font-family: "Fira Code", monospace;
    font-size: 9.5px;
    font-weight: 800;
    color: #fbbf24;
  }

  .whistle-freq {
    font-size: 8.5px;
    color: #94a3b8;
  }

  .whistle-tag-btns {
    display: flex;
    align-items: center;
    gap: 3px;
  }

  .whistle-tag-btn {
    border: none;
    border-radius: 3px;
    font-size: 8.5px;
    font-weight: 800;
    padding: 2px 5px;
    cursor: pointer;
  }

  .whistle-tag-btn.foul {
    background: rgba(249, 115, 22, 0.22);
    color: #fdba74;
  }

  .whistle-tag-btn.ko {
    background: rgba(236, 72, 153, 0.22);
    color: #f9a8d4;
  }

  .whistle-empty {
    font-size: 9.5px;
    color: #94a3b8;
  }

  .kickoff-popover {
    position: fixed;
    bottom: 245px;
    left: 220px;
    width: 225px;
    background: #0a1628;
    border: 1px solid #38bdf8;
    border-radius: 8px;
    padding: 8px;
    box-shadow: 0 12px 30px rgba(0, 0, 0, 0.75);
    z-index: 80;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .ko-pop-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 800;
    color: #38bdf8;
    padding-bottom: 4px;
    border-bottom: 1px solid #1a355d;
  }

  .ko-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }

  .ko-action-btn {
    display: flex;
    align-items: center;
    gap: 7px;
    background: #0f203a;
    border: 1px solid #1a355d;
    color: #f0f6fc;
    font-size: 10px;
    font-weight: 700;
    padding: 5px 8px;
    border-radius: 5px;
    cursor: pointer;
    text-align: left;
  }

  .ko-action-btn:hover {
    border-color: #38bdf8;
    background: #142c50;
  }

  .ko-list-sep {
    height: 1px;
    background: #1a355d;
    margin: 2px 0;
  }

  .ko-saved-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9.5px;
    background: #060c17;
    border-radius: 4px;
    padding: 3px 6px;
  }

  .ko-seek-link {
    background: transparent;
    border: none;
    color: #34d399;
    font-family: "Fira Code", monospace;
    font-size: 9.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .ko-del-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
  }

  .ko-del-btn:hover {
    color: #ef4444;
  }

  /* MICRO FILTER BAR & 1-CLICK FAVORITE */
  .micro-filter-bar {
    display: flex;
    align-items: center;
    gap: 4px;
    margin-top: 6px;
  }

  .mf-pill {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: #060b14;
    border: 1px solid #1a355d;
    color: #94a3b8;
    font-size: 9px;
    font-weight: 800;
    padding: 3px 4px;
    border-radius: 4px;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.12s ease;
  }

  .mf-pill:hover {
    color: #ffffff;
    border-color: #38bdf8;
  }

  .mf-pill.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .mf-pill.mf-star.active {
    background: rgba(245, 158, 11, 0.25);
    border-color: #f59e0b;
    color: #fbbf24;
  }

  .active-player-filter-chip {
    margin-top: 5px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 9.5px;
    color: #38bdf8;
    background: rgba(2, 132, 199, 0.15);
    border: 1px solid rgba(56, 189, 248, 0.35);
    padding: 2px 7px;
    border-radius: 4px;
  }

  .active-player-filter-chip button {
    background: transparent;
    border: none;
    color: #93c5fd;
    cursor: pointer;
    display: flex;
    align-items: center;
  }

  .clip-star-btn {
    background: transparent;
    border: none;
    padding: 0 2px;
    color: #475569;
    display: inline-flex;
    align-items: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  .clip-star-btn:hover,
  .clip-star-btn.starred {
    color: #f59e0b;
  }

  @media (max-width: 1520px) {
    .hdr-icon-compact span {
      display: none;
    }
    .hdr-tool-btn {
      padding: 3px 6px;
    }
  }

  @media (max-width: 1220px) {
    .tagging-top-tier {
      grid-template-columns: 176px minmax(0, 1fr) 232px;
    }
    .hdr-tool-btn span {
      display: none;
    }
    .play-status-pill {
      display: none;
    }
    .momen-transport-bar {
      gap: 4px;
      padding: 0 6px;
    }
    .btn-draw-quick span,
    .btn-canvas-toggle span {
      display: none;
    }
  }

  @media (max-width: 1024px) {
    .tagging-workspace {
      overflow-y: auto;
      height: auto;
      min-height: 100%;
    }

    .tagging-header {
      height: auto;
      flex-wrap: wrap;
      padding: 6px 10px;
      gap: 6px;
    }

    .workspace-main,
    .tagging-two-tier {
      overflow: visible;
      height: auto;
    }

    .tagging-top-tier {
      grid-template-columns: 1fr 1fr;
      grid-template-rows: auto minmax(260px, 1fr);
      overflow: visible;
    }

    .player-column {
      grid-column: 1 / -1;
      order: -1;
      min-height: 280px;
    }

    .left-momen-sidebar,
    .panel-column.right-clips-sidebar {
      max-height: 360px;
    }

    .momen-transport-bar {
      flex-wrap: wrap;
      height: auto;
      padding: 6px 8px;
      gap: 6px;
    }

    .lineup-grid-layout {
      grid-template-columns: 1fr;
    }

    .pitch-court {
      width: 100%;
      max-width: 400px;
      margin: 0 auto;
    }

    .kickoff-popover {
      left: 16px;
      bottom: 80px;
    }
  }

  @media (max-width: 720px) {
    .tagging-top-tier {
      grid-template-columns: 1fr;
    }

    .mtb-left,
    .mtb-right {
      flex-wrap: wrap;
      gap: 8px;
    }

    .btn-momen-play,
    .btn-ctrl-sm,
    .btn-inout,
    .speed-pill,
    .btn-draw-quick,
    .btn-canvas-toggle {
      min-height: 36px;
    }
  }

  .clip-pick-bar {
    display: flex;
    flex-direction: column;
    gap: 5px;
    padding: 6px 8px;
    background: #0a1b33;
    border-bottom: 1px solid #1e3b68;
  }

  .cpb-count {
    font-size: 10px;
    color: #93c5fd;
  }

  .cpb-count strong {
    color: #38bdf8;
  }

  .cpb-actions {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .cpb-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    background: #0f172a;
    border: 1px solid #243b61;
    color: #cbd5e1;
    font-size: 9.5px;
    font-weight: 700;
    padding: 3px 6px;
    border-radius: 5px;
    cursor: pointer;
  }

  .cpb-btn:hover:not(:disabled) {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .cpb-btn.danger:hover {
    border-color: #ef4444;
    color: #fca5a5;
  }

  .clip-pick-check {
    width: 12px;
    height: 12px;
    margin: 0 2px 0 0;
    accent-color: #38bdf8;
    cursor: pointer;
    flex-shrink: 0;
  }

  .clip-row.multi-selected {
    background: rgba(2, 132, 199, 0.14);
    border-color: rgba(56, 189, 248, 0.55);
  }

  .stopwatch-stage {
    gap: 8px;
  }

  .sw-header-pill {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #7dd3fc;
    background: rgba(14, 165, 233, 0.14);
    border: 1px solid rgba(56, 189, 248, 0.35);
    padding: 3px 10px;
    border-radius: 999px;
  }

  .sw-clock-readout {
    font-family: 'Fira Code', monospace;
    font-size: clamp(28px, 4vw, 44px);
    font-weight: 900;
    color: #f8fafc;
    letter-spacing: 0.04em;
  }

  .sw-match-clock {
    font-size: 11px;
    color: #34d399;
  }

  .sw-actions-row {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 8px;
  }

  .btn-sw-sec {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0f172a;
    border: 1px solid #334155;
    color: #cbd5e1;
    border-radius: 7px;
    padding: 6px 11px;
    font-size: 11px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-sw-sec:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-sw-sec.relink {
    border-color: #10b981;
    color: #6ee7b7;
    background: rgba(16, 185, 129, 0.14);
  }

  .yt-stage {
    position: relative;
    width: 100%;
    height: 100%;
    background: #000000;
  }

  .yt-iframe-host {
    width: 100%;
    height: 100%;
  }

  .yt-iframe-host :global(iframe) {
    width: 100%;
    height: 100%;
    border: 0;
  }

  .yt-stream-pill {
    position: absolute;
    top: 8px;
    right: 8px;
    z-index: 5;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    background: rgba(6, 11, 20, 0.85);
    border: 1px solid rgba(56, 189, 248, 0.4);
    color: #bae6fd;
    font-size: 9.5px;
    font-weight: 800;
    letter-spacing: 0.06em;
    padding: 4px 8px;
    border-radius: 999px;
  }

  .yt-pill-btn {
    background: rgba(16, 185, 129, 0.18);
    border: 1px solid #10b981;
    color: #6ee7b7;
    border-radius: 999px;
    padding: 2px 7px;
    font-size: 9.5px;
    font-weight: 700;
    cursor: pointer;
  }

  .yt-error-overlay {
    position: absolute;
    inset: 0;
    background: rgba(6, 11, 20, 0.92);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 10px;
    padding: 24px;
    text-align: center;
    color: #fca5a5;
    font-size: 12px;
    z-index: 6;
  }
</style>

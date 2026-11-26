<script lang="ts">
  import { tick } from "svelte";
  import type {
    VideoTagEvent,
    TagCategory,
    TagOutcome,
    CourtZone,
    TagRating,
    TagDescriptor,
    Point2D,
  } from "$lib/types";
  import { projectStore } from "$lib/stores/projectStore.svelte";
  import {
    X,
    Check,
    Trash2,
    Plus,
    Star,
    ThumbsUp,
    ThumbsDown,
    XCircle,
    ChevronLeft,
    ChevronRight,
    Search,
    MessageSquare,
    Clock,
    MapPin,
    RotateCcw,
    ArrowRight,
    Layers,
    Tag,
    Users,
  } from "lucide-svelte";

  interface Props {
    tag: VideoTagEvent;
    isOpen: boolean;
    onClose: () => void;
    onSave: (updatedTag: VideoTagEvent) => void;
    onLiveUpdate?: (updatedTag: VideoTagEvent) => void;
    onDelete?: (tagId: string) => void;
    allTags?: VideoTagEvent[];
    onNavigateClip?: (nextTag: VideoTagEvent) => void;
    selectedBatchIds?: string[];
    onBatchChangeCategory?: (
      ids: string[],
      category: string,
      color: string,
      buttonId?: string,
    ) => void;
    onBatchToggleLabel?: (
      ids: string[],
      desc: { id: string; name: string; color?: string; group?: string | null },
    ) => void;
    onBatchAddCustomLabel?: (ids: string[], name: string) => void;
    onBatchTogglePlayer?: (ids: string[], playerLabel: string) => void;
    onBatchAddCustomPlayer?: (ids: string[], rawName: string) => void;
    onBatchSetTeamSide?: (ids: string[], side: "home" | "away") => void;
    onBatchToggleFavorite?: (ids: string[]) => void;
    onBatchDelete?: (ids: string[]) => void;
  }

  let {
    tag,
    isOpen,
    onClose,
    onSave,
    onLiveUpdate,
    onDelete,
    allTags = [],
    onNavigateClip,
    selectedBatchIds = [],
    onBatchChangeCategory,
    onBatchToggleLabel,
    onBatchAddCustomLabel,
    onBatchTogglePlayer,
    onBatchAddCustomPlayer,
    onBatchSetTeamSide,
    onBatchToggleFavorite,
    onBatchDelete,
  }: Props = $props();

  const OUTCOMES: TagOutcome[] = [
    "Gol / Sukses",
    "Terblok / Diselamatkan",
    "Keluar / Gagal",
    "Turnover",
  ];

  const ZONES: CourtZone[] = [
    "Area Penalti Lawan",
    "Flank Kiri",
    "Flank Kanan",
    "Area Tengah",
    "Area Bertahan Sendiri",
  ];

  // Draft state for single-clip mode
  let draftTitle = $state("");
  let draftCategory = $state<TagCategory>("Goal");
  let draftBoardButtonId = $state<string | undefined>(undefined);
  let draftStartTime = $state(0);
  let draftEndTime = $state(0);
  let draftColor = $state("#10b981");
  let draftPlayerLabel = $state<string>("#9 Pivot");
  let draftPlayersInvolved = $state<string[]>(["#9 Pivot"]);
  let draftLabels = $state<TagDescriptor[]>([]);
  let draftPassTargetPlayer = $state<string>("");
  let draftOutcomeLabel = $state<TagOutcome>("Gol / Sukses");
  let draftZoneLabel = $state<CourtZone>("Area Penalti Lawan");
  let draftCourtCoord = $state<Point2D | undefined>(undefined);
  let draftRating = $state<TagRating>("⭐⭐⭐ Bagus");
  let draftNotes = $state("");
  let draftPauseDuration = $state(3.0);
  let draftTeamSide = $state<"home" | "away">("home");
  let draftFavorite = $state(false);

  // Panel UI state
  let omniQuery = $state("");
  let activeDrawer = $state<"notes" | "timing" | "court" | null>(null);
  let initialSnapshot = $state<VideoTagEvent | null>(null);
  let hasChanges = $state(false);
  let syncedTagId = $state<string | null>(null);
  let wasOpen = false;
  let omniInputEl = $state<HTMLInputElement | undefined>(undefined);

  const isBatchMode = $derived(selectedBatchIds.length > 1);
  const batchTags = $derived(
    isBatchMode
      ? projectStore.tags.filter((t) => selectedBatchIds.includes(t.id))
      : [],
  );

  const curClipIndex = $derived(
    allTags.length > 0 && tag ? allTags.findIndex((t) => t.id === tag.id) : -1,
  );

  const rosterList = $derived(
    projectStore.roster.map((p) => projectStore.getPlayerDisplayLabel(p)),
  );

  const boardCategories = $derived.by(() => {
    const out = projectStore.activeBoard.buttons
      .filter((b) => b.kind === "category")
      .map((btn) => ({
        id: btn.id,
        cat: btn.name as TagCategory,
        label: btn.name,
        color: btn.color,
        hotkey: btn.hotkey,
      }));
    if (!isBatchMode && draftCategory) {
      const hasCurrent = out.some(
        (c) =>
          c.cat.toLowerCase() === String(draftCategory || "").toLowerCase(),
      );
      if (!hasCurrent) {
        out.push({
          id: draftBoardButtonId || String(draftCategory),
          cat: draftCategory,
          label: String(draftCategory),
          color: draftColor || "#0284c7",
          hotkey: null,
        });
      }
    }
    return out;
  });

  const boardDescriptors = $derived(
    projectStore.activeBoard.buttons.filter((b) => b.kind === "descriptor"),
  );

  const extraLabels = $derived.by(() => {
    const sourceLabels = isBatchMode
      ? batchTags.flatMap((t) => t.labels || [])
      : draftLabels;
    const seen = new Set<string>();
    const extras: TagDescriptor[] = [];
    for (const lbl of sourceLabels) {
      const onBoard = boardDescriptors.some(
        (b) =>
          b.id === lbl.id || b.name.toLowerCase() === lbl.name.toLowerCase(),
      );
      const key = lbl.name.toLowerCase();
      if (!onBoard && !seen.has(key)) {
        seen.add(key);
        extras.push(lbl);
      }
    }
    return extras;
  });

  const selectedCatButtonId = $derived(
    draftBoardButtonId ||
      boardCategories.find(
        (c) =>
          c.cat.toLowerCase() === String(draftCategory || "").toLowerCase(),
      )?.id ||
      null,
  );

  const qNorm = $derived(omniQuery.trim().toLowerCase());

  const filteredBoardCategories = $derived.by(() => {
    if (!qNorm) return boardCategories;
    return boardCategories.filter(
      (c) =>
        c.label.toLowerCase().includes(qNorm) ||
        (c.hotkey && c.hotkey.toLowerCase() === qNorm),
    );
  });

  const filteredDescriptors = $derived.by(() => {
    if (!qNorm) return boardDescriptors;
    return boardDescriptors.filter(
      (b) =>
        b.name.toLowerCase().includes(qNorm) ||
        (b.group && b.group.toLowerCase().includes(qNorm)),
    );
  });

  const filteredExtraLabels = $derived.by(() => {
    if (!qNorm) return extraLabels;
    return extraLabels.filter((l) => l.name.toLowerCase().includes(qNorm));
  });

  const filteredRosterList = $derived.by(() => {
    if (!qNorm) return rosterList;
    return rosterList.filter((p) => p.toLowerCase().includes(qNorm));
  });

  // Batch summary helpers
  const batchCommonCategories = $derived(
    Array.from(new Set(batchTags.map((t) => t.category))),
  );
  const batchActiveLabelIds = $derived(
    new Set(batchTags.flatMap((t) => (t.labels || []).map((l) => l.name.toLowerCase()))),
  );
  const batchAllLabelIds = $derived.by(() => {
    if (batchTags.length === 0) return new Set<string>();
    const names = new Set<string>();
    for (const lbl of batchTags[0].labels || []) {
      const low = lbl.name.toLowerCase();
      if (
        batchTags.every((t) =>
          t.labels?.some((x) => x.name.toLowerCase() === low),
        )
      ) {
        names.add(low);
      }
    }
    return names;
  });
  const batchActivePlayers = $derived(
    new Set(
      batchTags.flatMap((t) =>
        t.playersInvolved && t.playersInvolved.length > 0
          ? t.playersInvolved.map((p) => projectStore.normalizePlayerLabel(p))
          : t.playerLabel
            ? [projectStore.normalizePlayerLabel(t.playerLabel)]
            : [],
      ),
    ),
  );
  const batchAllPlayers = $derived.by(() => {
    if (batchTags.length === 0) return new Set<string>();
    const res = new Set<string>();
    for (const p of batchActivePlayers) {
      if (
        batchTags.every((t) => {
          const list =
            t.playersInvolved && t.playersInvolved.length > 0
              ? t.playersInvolved.map((x) =>
                  projectStore.normalizePlayerLabel(x),
                )
              : t.playerLabel
                ? [projectStore.normalizePlayerLabel(t.playerLabel)]
                : [];
          return list.includes(p);
        })
      ) {
        res.add(p);
      }
    }
    return res;
  });
  const batchAllHome = $derived(
    batchTags.length > 0 && batchTags.every((t) => (t.teamSide ?? "home") === "home"),
  );
  const batchAllAway = $derived(
    batchTags.length > 0 && batchTags.every((t) => t.teamSide === "away"),
  );
  const batchAllFav = $derived(
    batchTags.length > 0 && batchTags.every((t) => Boolean(t.favorite)),
  );

  function loadDraftsFromTag(src: VideoTagEvent) {
    draftTitle = src.title;
    draftCategory = src.category;
    draftBoardButtonId = src.boardButtonId;
    draftStartTime = src.startTime;
    draftEndTime = src.endTime;
    draftColor = src.color;
    const initialPlayers =
      src.playersInvolved && src.playersInvolved.length > 0
        ? Array.from(
            new Set(
              src.playersInvolved.map((p) =>
                projectStore.normalizePlayerLabel(p),
              ),
            ),
          )
        : [projectStore.normalizePlayerLabel(src.playerLabel || "#9 Pivot")];
    draftPlayersInvolved = initialPlayers;
    draftPlayerLabel = initialPlayers[0] || "#9 Pivot";
    draftLabels = src.labels ? src.labels.map((l) => ({ ...l })) : [];
    draftPassTargetPlayer = src.passTargetPlayer || "";
    draftOutcomeLabel = src.outcomeLabel || "Gol / Sukses";
    draftZoneLabel = src.zoneLabel || "Area Penalti Lawan";
    draftCourtCoord = src.courtCoord ? { ...src.courtCoord } : undefined;
    draftRating = src.rating || "⭐⭐⭐ Bagus";
    draftNotes = src.notes || "";
    draftPauseDuration = src.pauseDuration ?? 3.0;
    draftTeamSide =
      src.teamSide ||
      (projectStore.normalizePlayerLabel(src.playerLabel) === "Tim Lawan"
        ? "away"
        : "home");
    draftFavorite = Boolean(src.favorite);
  }

  $effect(() => {
    if (!isOpen) {
      wasOpen = false;
      syncedTagId = null;
      return;
    }
    if (tag && (!wasOpen || tag.id !== syncedTagId)) {
      wasOpen = true;
      syncedTagId = tag.id;
      initialSnapshot = JSON.parse(JSON.stringify(tag));
      hasChanges = false;
      omniQuery = "";
      activeDrawer = null;
      loadDraftsFromTag(tag);
      tick().then(() => {
        omniInputEl?.focus();
      });
    }
  });

  $effect(() => {
    if (!isOpen) return;
    const onModalKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      } else if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
        e.preventDefault();
        e.stopPropagation();
        handleSave();
      } else if (
        e.altKey &&
        e.key === "ArrowLeft" &&
        !isBatchMode &&
        curClipIndex > 0 &&
        onNavigateClip
      ) {
        e.preventDefault();
        e.stopPropagation();
        onNavigateClip(allTags[curClipIndex - 1]);
      } else if (
        e.altKey &&
        e.key === "ArrowRight" &&
        !isBatchMode &&
        curClipIndex !== -1 &&
        curClipIndex + 1 < allTags.length &&
        onNavigateClip
      ) {
        e.preventDefault();
        e.stopPropagation();
        onNavigateClip(allTags[curClipIndex + 1]);
      }
    };
    window.addEventListener("keydown", onModalKeyDown, true);
    return () => window.removeEventListener("keydown", onModalKeyDown, true);
  });

  function buildUpdatedTag(): VideoTagEvent {
    return {
      ...tag,
      title: draftTitle,
      category: draftCategory,
      boardButtonId: draftBoardButtonId,
      startTime: Number(draftStartTime.toFixed(2)),
      endTime: Number(draftEndTime.toFixed(2)),
      color: draftColor,
      playerLabel: draftPlayersInvolved[0] || draftPlayerLabel,
      playersInvolved: [...draftPlayersInvolved],
      labels: draftLabels.map((l) => ({ ...l })),
      passTargetPlayer: draftPassTargetPlayer || undefined,
      outcomeLabel: draftOutcomeLabel,
      zoneLabel: draftZoneLabel,
      courtCoord: draftCourtCoord,
      rating: draftRating,
      notes: draftNotes,
      pauseDuration: draftPauseDuration,
      teamSide: draftTeamSide,
      favorite: draftFavorite,
    };
  }

  function commitLive() {
    hasChanges = true;
    if (!isBatchMode && onLiveUpdate) {
      onLiveUpdate(buildUpdatedTag());
    }
  }

  function handleSave() {
    if (isBatchMode) {
      onClose();
      return;
    }
    onSave(buildUpdatedTag());
    onClose();
  }

  function handleRevert() {
    if (!initialSnapshot || isBatchMode) return;
    const snap: VideoTagEvent = JSON.parse(JSON.stringify(initialSnapshot));
    loadDraftsFromTag(snap);
    hasChanges = false;
    onLiveUpdate?.(snap);
  }

  function selectCategory(item: {
    id: string;
    cat: TagCategory;
    label: string;
    color: string;
  }) {
    if (isBatchMode) {
      onBatchChangeCategory?.(selectedBatchIds, item.cat, item.color, item.id);
      return;
    }
    const oldCat = String(draftCategory || "");
    draftCategory = item.cat;
    draftBoardButtonId = item.id;
    draftColor = item.color;
    if (!draftTitle || draftTitle.startsWith(oldCat)) {
      draftTitle = oldCat && draftTitle.startsWith(oldCat)
        ? item.label + draftTitle.slice(oldCat.length)
        : `${item.label} - ${draftPlayerLabel} (${fmtTime(draftStartTime)} - ${fmtTime(draftEndTime)})`;
    }
    commitLive();
  }

  function toggleDraftLabel(
    id: string,
    name: string,
    color?: string,
    group?: string | null,
  ) {
    if (isBatchMode) {
      onBatchToggleLabel?.(selectedBatchIds, {
        id,
        name,
        color,
        group: group ?? null,
      });
      return;
    }
    if (
      draftLabels.some(
        (l) => l.id === id || l.name.toLowerCase() === name.toLowerCase(),
      )
    ) {
      draftLabels = draftLabels.filter(
        (l) => l.id !== id && l.name.toLowerCase() !== name.toLowerCase(),
      );
    } else {
      const cleaned = group
        ? draftLabels.filter((l) => l.group !== group)
        : draftLabels;
      draftLabels = [
        ...cleaned,
        {
          id,
          name,
          color: color || "#38bdf8",
          group: group ?? null,
          atTime: draftStartTime,
        },
      ];
    }
    commitLive();
  }

  function toggleDraftPlayer(player: string) {
    if (isBatchMode) {
      onBatchTogglePlayer?.(selectedBatchIds, player);
      return;
    }
    if (draftPlayersInvolved.includes(player)) {
      if (draftPlayersInvolved.length > 1) {
        draftPlayersInvolved = draftPlayersInvolved.filter((p) => p !== player);
      }
    } else {
      draftPlayersInvolved = [...draftPlayersInvolved, player];
    }
    draftPlayerLabel = draftPlayersInvolved[0] || player;
    commitLive();
  }

  function makePrimaryPlayer(player: string) {
    if (isBatchMode) return;
    const rest = draftPlayersInvolved.filter((p) => p !== player);
    draftPlayersInvolved = [player, ...rest];
    draftPlayerLabel = player;
    if (draftPassTargetPlayer === player) {
      draftPassTargetPlayer = "";
    }
    commitLive();
  }

  function togglePassTarget(player: string) {
    if (isBatchMode) return;
    draftPassTargetPlayer = draftPassTargetPlayer === player ? "" : player;
    commitLive();
  }

  function setTeamSide(side: "home" | "away") {
    if (isBatchMode) {
      onBatchSetTeamSide?.(selectedBatchIds, side);
      return;
    }
    draftTeamSide = side;
    commitLive();
  }

  function toggleFavorite() {
    if (isBatchMode) {
      onBatchToggleFavorite?.(selectedBatchIds);
      return;
    }
    draftFavorite = !draftFavorite;
    commitLive();
  }

  function setRating(r: TagRating) {
    if (isBatchMode) return;
    draftRating = r;
    commitLive();
  }

  function quickAddLabel(raw: string) {
    const clean = raw.trim();
    if (!clean) return;
    if (isBatchMode) {
      onBatchAddCustomLabel?.(selectedBatchIds, clean);
    } else {
      const existingBoard = boardDescriptors.find(
        (b) => b.name.toLowerCase() === clean.toLowerCase(),
      );
      if (existingBoard) {
        toggleDraftLabel(
          existingBoard.id,
          existingBoard.name,
          existingBoard.color,
          existingBoard.group,
        );
      } else {
        toggleDraftLabel(`custom_${Date.now()}`, clean, "#38bdf8", null);
      }
    }
    omniQuery = "";
  }

  function quickAddPlayer(raw: string) {
    const clean = raw.trim();
    if (!clean) return;
    if (isBatchMode) {
      onBatchAddCustomPlayer?.(selectedBatchIds, clean);
    } else {
      const added = projectStore.addRosterPlayer(clean);
      if (added) {
        if (!draftPlayersInvolved.includes(added)) {
          draftPlayersInvolved = [...draftPlayersInvolved, added];
        }
        draftPlayerLabel = draftPlayersInvolved[0] || added;
        commitLive();
      }
    }
    omniQuery = "";
  }

  function handleOmniEnter() {
    const raw = omniQuery.trim();
    if (!raw) {
      handleSave();
      return;
    }
    const totalMatches =
      filteredBoardCategories.length +
      filteredDescriptors.length +
      filteredExtraLabels.length +
      filteredRosterList.length;

    if (totalMatches === 1) {
      if (filteredBoardCategories.length === 1) {
        selectCategory(filteredBoardCategories[0]);
      } else if (filteredDescriptors.length === 1) {
        const b = filteredDescriptors[0];
        toggleDraftLabel(b.id, b.name, b.color, b.group);
      } else if (filteredExtraLabels.length === 1) {
        const l = filteredExtraLabels[0];
        toggleDraftLabel(l.id, l.name, l.color, l.group);
      } else if (filteredRosterList.length === 1) {
        toggleDraftPlayer(filteredRosterList[0]);
      }
      omniQuery = "";
      return;
    }

    if (raw.startsWith("#")) {
      quickAddPlayer(raw);
    } else {
      quickAddLabel(raw);
    }
  }

  function inferZoneFromCoord(pt: Point2D): CourtZone {
    if (pt.x >= 30) return "Area Penalti Lawan";
    if (pt.x <= 12) return "Area Bertahan Sendiri";
    if (pt.y <= 6.5) return "Flank Kiri";
    if (pt.y >= 13.5) return "Flank Kanan";
    return "Area Tengah";
  }

  function handleMiniCourtClick(e: MouseEvent) {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    const xM = Math.max(
      0,
      Math.min(40, ((e.clientX - rect.left) / rect.width) * 40),
    );
    const yM = Math.max(
      0,
      Math.min(20, ((e.clientY - rect.top) / rect.height) * 20),
    );
    draftCourtCoord = { x: Number(xM.toFixed(1)), y: Number(yM.toFixed(1)) };
    draftZoneLabel = inferZoneFromCoord(draftCourtCoord);
    commitLive();
  }

  function adjustTime(type: "start" | "end", delta: number) {
    if (type === "start") {
      draftStartTime = Math.max(0, draftStartTime + delta);
      if (draftStartTime >= draftEndTime) draftStartTime = draftEndTime - 0.5;
    } else {
      draftEndTime = Math.max(draftStartTime + 0.5, draftEndTime + delta);
    }
    commitLive();
  }

  function fmtTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    const d = Math.floor((sec % 1) * 10);
    return `${m}:${String(s).padStart(2, "0")}.${d}`;
  }
</script>

{#if isOpen && tag}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="once-backdrop"
    onclick={onClose}
    oncontextmenu={(e) => e.preventDefault()}
    role="presentation"
  >
    <!-- svelte-ignore a11y_click_events_have_key_events -->
    <div
      class="once-panel"
      onclick={(e) => e.stopPropagation()}
      oncontextmenu={(e) => e.preventDefault()}
      role="dialog"
      tabindex="-1"
    >
      <!-- TOP BAR (ONCE SPORT HEADER + PREV/NEXT + HOME/AWAY + RATING) -->
      <header class="once-header">
        <div class="oh-left">
          {#if isBatchMode}
            <span class="oh-batch-pill">
              MODE MASSAL · {selectedBatchIds.length} KLIP TERPILIH
            </span>
          {:else}
            {#if allTags.length > 1 && onNavigateClip && curClipIndex !== -1}
              <div class="oh-nav-group">
                <button
                  type="button"
                  class="oh-nav-btn"
                  disabled={curClipIndex <= 0}
                  onclick={() => onNavigateClip(allTags[curClipIndex - 1])}
                  title="Klip Sebelumnya (Alt + ←)"
                >
                  <ChevronLeft size={14} />
                </button>
                <span class="oh-nav-idx">
                  {curClipIndex + 1}/{allTags.length}
                </span>
                <button
                  type="button"
                  class="oh-nav-btn"
                  disabled={curClipIndex + 1 >= allTags.length}
                  onclick={() => onNavigateClip(allTags[curClipIndex + 1])}
                  title="Klip Berikutnya (Alt + →)"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            {/if}

            <span
              class="oh-color-dot"
              style="background-color: {draftColor};"
            ></span>
            <input
              type="text"
              bind:value={draftTitle}
              onchange={commitLive}
              class="oh-title-input"
              placeholder="Judul Klip..."
            />
            <span class="oh-time-badge">
              {fmtTime(draftStartTime)}–{fmtTime(draftEndTime)}
            </span>
          {/if}
        </div>

        <div class="oh-right">
          <div class="oh-seg">
            <button
              type="button"
              class="oh-seg-btn"
              class:active={isBatchMode ? batchAllHome : draftTeamSide === "home"}
              onclick={() => setTeamSide("home")}
            >
              HOME
            </button>
            <button
              type="button"
              class="oh-seg-btn away"
              class:active={isBatchMode ? batchAllAway : draftTeamSide === "away"}
              onclick={() => setTeamSide("away")}
            >
              AWAY
            </button>
          </div>

          {#if !isBatchMode}
            <div class="oh-seg" title="Kualitas / Rating Klip">
              <button
                type="button"
                class="oh-icon-rate good"
                class:active={draftRating === "⭐⭐⭐ Bagus"}
                onclick={() => setRating("⭐⭐⭐ Bagus")}
                title="Bagus"
              >
                <ThumbsUp size={12} />
              </button>
              <button
                type="button"
                class="oh-icon-rate eval"
                class:active={draftRating === "⚠️ Evaluasi"}
                onclick={() => setRating("⚠️ Evaluasi")}
                title="Evaluasi"
              >
                <ThumbsDown size={12} />
              </button>
              <button
                type="button"
                class="oh-icon-rate fatal"
                class:active={draftRating === "❌ Kesalahan Fatal"}
                onclick={() => setRating("❌ Kesalahan Fatal")}
                title="Kesalahan Fatal"
              >
                <XCircle size={12} />
              </button>
            </div>
          {/if}

          <button
            type="button"
            class="oh-star-btn"
            class:active={isBatchMode ? batchAllFav : draftFavorite}
            onclick={toggleFavorite}
            title="Tandai Favorit ★"
          >
            <Star size={13} />
          </button>

          <button
            type="button"
            class="oh-close-btn"
            onclick={onClose}
            title="Tutup (Esc)"
          >
            <X size={16} />
          </button>
        </div>
      </header>

      <!-- ACTIVE CHIP RIBBON (RINGKASAN CEPAT TAG + PEMAIN + LABEL) -->
      <div class="active-ribbon">
        {#if isBatchMode}
          <span class="rib-label">Ringkasan {selectedBatchIds.length} Klip:</span>
          {#each batchCommonCategories as cat}
            <span class="rib-chip rib-cat">{cat}</span>
          {/each}
          {#each Array.from(batchActivePlayers) as p}
            <button
              type="button"
              class="rib-chip rib-player"
              onclick={() => toggleDraftPlayer(p)}
              title="Klik untuk hapus dari semua klip terpilih"
            >
              <span>{p}</span>
              <X size={10} />
            </button>
          {/each}
          {#each Array.from(batchActiveLabelIds) as lowName}
            {@const sampleLbl = batchTags.flatMap((t) => t.labels || []).find((l) => l.name.toLowerCase() === lowName)}
            {#if sampleLbl}
              <button
                type="button"
                class="rib-chip rib-lbl"
                onclick={() =>
                  toggleDraftLabel(
                    sampleLbl.id,
                    sampleLbl.name,
                    sampleLbl.color,
                    sampleLbl.group,
                  )
                }
                title="Klik untuk toggle label di klip terpilih"
              >
                <span
                  class="rib-dot"
                  style="background-color: {sampleLbl.color || '#38bdf8'};"
                ></span>
                <span>{sampleLbl.name}</span>
                <X size={10} />
              </button>
            {/if}
          {/each}
        {:else}
          <span class="rib-chip rib-cat" style="border-color: {draftColor};">
            <span class="rib-dot" style="background-color: {draftColor};"></span>
            <span>{draftCategory}</span>
          </span>

          {#each draftPlayersInvolved as p (p)}
            {@const isPrimary = p === draftPlayerLabel}
            <button
              type="button"
              class="rib-chip rib-player"
              class:primary={isPrimary}
              onclick={() => toggleDraftPlayer(p)}
              title={isPrimary
                ? "Pemain Utama (klik untuk lepas jika ada pemain lain)"
                : "Klik untuk lepas dari klip"}
            >
              {#if isPrimary}<Star size={10} class="text-amber-300" />{/if}
              <span>{p}</span>
              {#if draftPlayersInvolved.length > 1}
                <X size={10} />
              {/if}
            </button>
          {/each}

          {#if draftPassTargetPlayer}
            <button
              type="button"
              class="rib-chip rib-pass"
              onclick={() => {
                draftPassTargetPlayer = "";
                commitLive();
              }}
              title="Target operan (Passing Network) — klik untuk hapus"
            >
              <ArrowRight size={10} />
              <span>{draftPassTargetPlayer}</span>
              <X size={10} />
            </button>
          {/if}

          {#each draftLabels as lbl (lbl.id + lbl.name)}
            <button
              type="button"
              class="rib-chip rib-lbl"
              onclick={() =>
                toggleDraftLabel(lbl.id, lbl.name, lbl.color, lbl.group)
              }
              title="Klik untuk mencopot label"
            >
              <span
                class="rib-dot"
                style="background-color: {lbl.color || '#38bdf8'};"
              ></span>
              <span>{lbl.name}</span>
              <X size={10} />
            </button>
          {/each}
        {/if}
      </div>

      <!-- ONCE SPORT 3-COLUMN BENTO GRID: TAG | LABEL | PEMAIN -->
      <div class="three-col-grid">
        <!-- KOLOM 1 (KIRI): TAG / KATEGORI -->
        <section class="col-card col-tag">
          <div class="col-hdr">
            <div class="col-hdr-left">
              <Layers size={13} class="text-emerald-400" />
              <span>TAG (KATEGORI)</span>
            </div>
            <span class="col-count">
              {filteredBoardCategories.length}/{boardCategories.length}
            </span>
          </div>

          <div class="col-list">
            {#each filteredBoardCategories as item (item.id + item.label)}
              {@const isSelected = isBatchMode
                ? batchCommonCategories.includes(item.cat)
                : draftCategory === item.cat}
              <button
                type="button"
                class="col-row"
                class:active={isSelected}
                onclick={() => selectCategory(item)}
              >
                <span
                  class="row-indicator"
                  class:filled={isSelected}
                  style="background-color: {isSelected ? item.color : 'transparent'}; border-color: {item.color};"
                ></span>
                <span class="row-label">{item.label}</span>
                {#if item.hotkey}
                  <span class="row-kbd">{item.hotkey}</span>
                {/if}
                {#if isSelected}
                  <Check size={13} class="text-emerald-400 shrink-0" />
                {/if}
              </button>
            {/each}
            {#if filteredBoardCategories.length === 0}
              <div class="col-empty">Tidak ada Tag cocok "{omniQuery}"</div>
            {/if}
          </div>
        </section>

        <!-- KOLOM 2 (TENGAH): LABEL TAKTIS -->
        <section class="col-card col-label">
          <div class="col-hdr">
            <div class="col-hdr-left">
              <Tag size={13} class="text-amber-400" />
              <span>LABEL TAKTIS</span>
            </div>
            <span class="col-count">
              {filteredDescriptors.length + filteredExtraLabels.length}/{boardDescriptors.length + extraLabels.length}
            </span>
          </div>

          <div class="col-list">
            {#each filteredDescriptors as descBtn (descBtn.id)}
              {@const isActive = isBatchMode
                ? batchActiveLabelIds.has(descBtn.name.toLowerCase())
                : draftLabels.some(
                    (l) =>
                      l.id === descBtn.id ||
                      l.name.toLowerCase() === descBtn.name.toLowerCase(),
                  )}
              {@const isAllInBatch =
                isBatchMode &&
                batchAllLabelIds.has(descBtn.name.toLowerCase())}
              {@const isScopedOut = Boolean(
                !isBatchMode &&
                  descBtn.forTags.length > 0 &&
                  selectedCatButtonId &&
                  !descBtn.forTags.includes(selectedCatButtonId),
              )}
              <button
                type="button"
                class="col-row"
                class:active={isActive}
                class:partial={isBatchMode && isActive && !isAllInBatch}
                class:dim={isScopedOut}
                onclick={() =>
                  toggleDraftLabel(
                    descBtn.id,
                    descBtn.name,
                    descBtn.color,
                    descBtn.group,
                  )
                }
                title={isScopedOut
                  ? "Terhubung ke kategori lain — tetap bisa diklik untuk ditambahkan"
                  : descBtn.name}
              >
                <span
                  class="row-check"
                  class:checked={isActive}
                  style={isActive
                    ? `border-color: ${descBtn.color || '#f59e0b'}; background-color: ${descBtn.color || '#f59e0b'};`
                    : ""}
                >
                  {#if isActive}<Check size={10} />{/if}
                </span>
                <span
                  class="row-dot-sm"
                  style="background-color: {descBtn.color || '#38bdf8'};"
                ></span>
                <span class="row-label">{descBtn.name}</span>
                {#if descBtn.group}
                  <span class="row-group-tag">{descBtn.group}</span>
                {/if}
              </button>
            {/each}

            {#each filteredExtraLabels as extraLbl (extraLbl.id + extraLbl.name)}
              {@const isActive = isBatchMode
                ? batchActiveLabelIds.has(extraLbl.name.toLowerCase())
                : true}
              <button
                type="button"
                class="col-row"
                class:active={isActive}
                onclick={() =>
                  toggleDraftLabel(
                    extraLbl.id,
                    extraLbl.name,
                    extraLbl.color,
                    extraLbl.group,
                  )
                }
              >
                <span
                  class="row-check"
                  class:checked={isActive}
                  style="border-color: {extraLbl.color || '#38bdf8'}; background-color: {extraLbl.color || '#38bdf8'};"
                >
                  {#if isActive}<Check size={10} />{/if}
                </span>
                <span
                  class="row-dot-sm"
                  style="background-color: {extraLbl.color || '#38bdf8'};"
                ></span>
                <span class="row-label">{extraLbl.name}</span>
                <span class="row-group-tag">kustom</span>
              </button>
            {/each}

            {#if filteredDescriptors.length + filteredExtraLabels.length === 0}
              <div class="col-empty">
                Tekan Enter untuk buat label "{omniQuery}"
              </div>
            {/if}
          </div>
        </section>

        <!-- KOLOM 3 (KANAN): PEMAIN TERLIBAT -->
        <section class="col-card col-player">
          <div class="col-hdr">
            <div class="col-hdr-left">
              <Users size={13} class="text-sky-400" />
              <span>PEMAIN TERLIBAT</span>
            </div>
            <span class="col-count">
              {filteredRosterList.length}/{rosterList.length}
            </span>
          </div>

          <div class="col-list">
            {#each filteredRosterList as player (player)}
              {@const isSelected = isBatchMode
                ? batchActivePlayers.has(player)
                : draftPlayersInvolved.includes(player)}
              {@const isAllInBatch =
                isBatchMode && batchAllPlayers.has(player)}
              {@const isPrimary = !isBatchMode && draftPlayerLabel === player}
              {@const isReceiver =
                !isBatchMode && draftPassTargetPlayer === player}
              <div
                class="col-row player-row"
                class:active={isSelected}
                class:partial={isBatchMode && isSelected && !isAllInBatch}
              >
                <button
                  type="button"
                  class="player-main-btn"
                  onclick={() => toggleDraftPlayer(player)}
                >
                  <span class="row-check sky" class:checked={isSelected}>
                    {#if isSelected}<Check size={10} />{/if}
                  </span>
                  <span class="row-label">{player}</span>
                </button>

                {#if !isBatchMode}
                  <div class="player-micro-actions">
                    <button
                      type="button"
                      class="p-micro-btn star"
                      class:active={isPrimary}
                      onclick={() => makePrimaryPlayer(player)}
                      title="Jadikan Pemain Utama klip ini"
                    >
                      <Star size={11} />
                    </button>
                    {#if player !== draftPlayerLabel && player !== "Tim Lawan"}
                      <button
                        type="button"
                        class="p-micro-btn pass"
                        class:active={isReceiver}
                        onclick={() => togglePassTarget(player)}
                        title="Set sebagai Penerima Operan (Passing Network)"
                      >
                        <ArrowRight size={11} />
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}

            {#if filteredRosterList.length === 0}
              <div class="col-empty">
                Klik "+ Pemain" di bawah untuk menambah "{omniQuery}"
              </div>
            {/if}
          </div>
        </section>
      </div>

      <!-- COMPACT EXPANDABLE SECONDARY DRAWER (CATATAN / WAKTU / LAPANGAN) -->
      {#if activeDrawer && !isBatchMode}
        <div class="secondary-drawer">
          {#if activeDrawer === "notes"}
            <div class="drawer-notes-grid">
              <div class="dn-left">
                <span class="dn-title">Catatan Taktis Pelatih</span>
                <textarea
                  bind:value={draftNotes}
                  oninput={commitLive}
                  rows="3"
                  class="dn-textarea"
                  placeholder="Tulis catatan evaluasi momen untuk pemain..."
                ></textarea>
              </div>
              <div class="dn-right">
                <span class="dn-title">Hasil Aksi (Outcome)</span>
                <div class="dn-outcome-grid">
                  {#each OUTCOMES as outcome}
                    <button
                      type="button"
                      class="dn-chip"
                      class:active={draftOutcomeLabel === outcome}
                      onclick={() => {
                        draftOutcomeLabel = outcome;
                        commitLive();
                      }}
                    >
                      {outcome}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          {:else if activeDrawer === "timing"}
            <div class="drawer-timing-row">
              <div class="dt-box">
                <span class="dt-lbl">Mulai</span>
                <strong class="dt-val">{draftStartTime.toFixed(2)}s</strong>
                <div class="dt-btns">
                  <button type="button" onclick={() => adjustTime("start", -0.5)}>-0.5s</button>
                  <button type="button" onclick={() => adjustTime("start", 0.5)}>+0.5s</button>
                </div>
              </div>
              <div class="dt-box">
                <span class="dt-lbl">Selesai</span>
                <strong class="dt-val">{draftEndTime.toFixed(2)}s</strong>
                <div class="dt-btns">
                  <button type="button" onclick={() => adjustTime("end", -0.5)}>-0.5s</button>
                  <button type="button" onclick={() => adjustTime("end", 0.5)}>+0.5s</button>
                </div>
              </div>
              <div class="dt-box">
                <span class="dt-lbl">Durasi</span>
                <strong class="dt-val text-sky-400">
                  {(draftEndTime - draftStartTime).toFixed(1)}s
                </strong>
              </div>
              <div class="dt-slider-box">
                <span class="dt-lbl">
                  Jeda Freeze: {draftPauseDuration < 0.2 ? "Off" : `${draftPauseDuration.toFixed(1)}s`}
                </span>
                <input
                  type="range"
                  min="0"
                  max="8"
                  step="0.5"
                  bind:value={draftPauseDuration}
                  onchange={commitLive}
                  class="blue-slider"
                />
              </div>
            </div>
          {:else if activeDrawer === "court"}
            <div class="drawer-court-grid">
              <!-- svelte-ignore a11y_click_events_have_key_events -->
              <svg
                viewBox="0 0 400 200"
                class="mini-court-svg"
                onclick={handleMiniCourtClick}
                oncontextmenu={(e) => {
                  e.preventDefault();
                  draftCourtCoord = undefined;
                  commitLive();
                }}
                role="button"
                tabindex="0"
                aria-label="Pilih koordinat lapangan futsal 40m x 20m"
              >
                <rect x="0" y="0" width="400" height="200" fill="#0a2540" rx="6" />
                <rect x="4" y="4" width="392" height="192" fill="none" stroke="rgba(255,255,255,0.5)" stroke-width="2" />
                <line x1="200" y1="4" x2="200" y2="196" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
                <circle cx="200" cy="100" r="30" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
                <path d="M 4 40 A 60 60 0 0 1 4 160" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
                <path d="M 396 40 A 60 60 0 0 0 396 160" fill="none" stroke="rgba(255,255,255,0.4)" stroke-width="1.5" />
                {#if draftCourtCoord}
                  <circle
                    cx={draftCourtCoord.x * 10}
                    cy={draftCourtCoord.y * 10}
                    r="7"
                    fill="#38bdf8"
                    stroke="#ffffff"
                    stroke-width="2"
                  />
                {/if}
              </svg>
              <div class="dc-zones">
                <span class="dn-title">
                  Zona Lapangan {draftCourtCoord ? `(${draftCourtCoord.x}m, ${draftCourtCoord.y}m)` : "(Klik peta)"}
                </span>
                <div class="dc-zone-list">
                  {#each ZONES as zone}
                    <button
                      type="button"
                      class="dn-chip"
                      class:active={draftZoneLabel === zone}
                      onclick={() => {
                        draftZoneLabel = zone;
                        commitLive();
                      }}
                    >
                      {zone}
                    </button>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        </div>
      {/if}

      <!-- BOTTOM BAR: OMNI-SEARCH + QUICK CREATE + DRAWERS + SAVE -->
      <footer class="once-footer">
        <div class="omni-search-wrap">
          <Search size={14} class="text-slate-400 shrink-0" />
          <input
            id="tag-editor-omni-search"
            bind:this={omniInputEl}
            type="text"
            bind:value={omniQuery}
            placeholder="Cari Tag, Label, atau Pemain — ketik lalu Enter untuk tambah baru..."
            class="omni-input"
            onkeydown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                e.stopPropagation();
                handleOmniEnter();
              }
            }}
          />
          {#if omniQuery}
            <button
              type="button"
              class="omni-clear-btn"
              onclick={() => (omniQuery = "")}
              title="Bersihkan pencarian"
            >
              <X size={12} />
            </button>
          {/if}

          {#if omniQuery.trim()}
            <button
              type="button"
              class="omni-create-btn lbl"
              onclick={() => quickAddLabel(omniQuery)}
              title="Tambah sebagai Label baru"
            >
              <Plus size={11} />
              <span>Label</span>
            </button>
            <button
              type="button"
              class="omni-create-btn ply"
              onclick={() => quickAddPlayer(omniQuery)}
              title="Tambah sebagai Pemain baru ke skuad & klip"
            >
              <Plus size={11} />
              <span>Pemain</span>
            </button>
          {/if}
        </div>

        <div class="footer-tools-right">
          {#if !isBatchMode}
            <button
              type="button"
              class="drawer-pill-btn"
              class:active={activeDrawer === "notes"}
              class:has-val={Boolean(draftNotes.trim())}
              onclick={() =>
                (activeDrawer = activeDrawer === "notes" ? null : "notes")
              }
              title="Catatan Pelatih & Outcome"
            >
              <MessageSquare size={12} />
              <span>Catatan</span>
            </button>
            <button
              type="button"
              class="drawer-pill-btn"
              class:active={activeDrawer === "timing"}
              onclick={() =>
                (activeDrawer = activeDrawer === "timing" ? null : "timing")
              }
              title="Atur Waktu Klip & Jeda Freeze"
            >
              <Clock size={12} />
              <span>Waktu</span>
            </button>
            <button
              type="button"
              class="drawer-pill-btn"
              class:active={activeDrawer === "court"}
              class:has-val={Boolean(draftCourtCoord)}
              onclick={() =>
                (activeDrawer = activeDrawer === "court" ? null : "court")
              }
              title="Pin Koordinat Lapangan 40x20m"
            >
              <MapPin size={12} />
              <span>Lapangan</span>
            </button>

            {#if hasChanges}
              <button
                type="button"
                class="btn-revert"
                onclick={handleRevert}
                title="Kembalikan perubahan ke kondisi awal sebelum panel dibuka"
              >
                <RotateCcw size={12} />
                <span>Revert</span>
              </button>
            {/if}
          {/if}

          {#if (isBatchMode && onBatchDelete) || (!isBatchMode && onDelete)}
            <button
              type="button"
              class="btn-del-icon"
              onclick={() => {
                if (isBatchMode) {
                  onBatchDelete?.(selectedBatchIds);
                  onClose();
                } else {
                  onDelete?.(tag.id);
                  onClose();
                }
              }}
              title={isBatchMode
                ? `Hapus ${selectedBatchIds.length} Klip Terpilih`
                : "Hapus Klip (bisa Ctrl+Z)"}
            >
              <Trash2 size={14} />
            </button>
          {/if}

          <button
            type="button"
            class="btn-done-once"
            onclick={handleSave}
            title="Selesai & Simpan (Ctrl+Enter)"
          >
            <Check size={14} />
            <span>Selesai</span>
          </button>
        </div>
      </footer>
    </div>
  </div>
{/if}

<style>
  .once-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(2, 6, 23, 0.78);
    backdrop-filter: blur(6px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 250;
    padding: 16px;
  }

  .once-panel {
    width: 960px;
    max-width: 96vw;
    max-height: 90vh;
    background: #141820;
    border: 1px solid #243b5e;
    border-radius: 12px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85), 0 0 26px rgba(56, 189, 248, 0.14);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #e2e8f0;
  }

  /* HEADER */
  .once-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    background: #0d131d;
    border-bottom: 1px solid #1f2e47;
    flex-shrink: 0;
  }

  .oh-left,
  .oh-right {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .oh-left {
    flex: 1;
  }

  .oh-batch-pill {
    font-size: 10px;
    font-weight: 900;
    letter-spacing: 0.05em;
    background: #f59e0b;
    color: #090d16;
    padding: 3px 10px;
    border-radius: 999px;
  }

  .oh-nav-group {
    display: inline-flex;
    align-items: center;
    background: #080c14;
    border: 1px solid #223554;
    border-radius: 6px;
    overflow: hidden;
    flex-shrink: 0;
  }

  .oh-nav-btn {
    background: transparent;
    border: none;
    color: #93c5fd;
    padding: 3px 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .oh-nav-btn:hover:not(:disabled) {
    background: #162640;
    color: #ffffff;
  }

  .oh-nav-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  .oh-nav-idx {
    font-family: "Fira Code", monospace;
    font-size: 10px;
    font-weight: 800;
    color: #cbd5e1;
    padding: 0 6px;
    border-left: 1px solid #223554;
    border-right: 1px solid #223554;
  }

  .oh-color-dot {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .oh-title-input {
    flex: 1;
    min-width: 120px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    color: #f8fafc;
    font-size: 12.5px;
    font-weight: 700;
    padding: 3px 7px;
    outline: none;
  }

  .oh-title-input:hover,
  .oh-title-input:focus {
    background: #090e18;
    border-color: #25406b;
  }

  .oh-time-badge {
    font-family: "Fira Code", monospace;
    font-size: 10px;
    font-weight: 700;
    color: #7dd3fc;
    background: #091221;
    border: 1px solid #1e3556;
    padding: 2px 7px;
    border-radius: 5px;
    flex-shrink: 0;
  }

  .oh-seg {
    display: inline-flex;
    align-items: center;
    background: #080d16;
    border: 1px solid #1f3352;
    border-radius: 6px;
    overflow: hidden;
  }

  .oh-seg-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 9.5px;
    font-weight: 800;
    padding: 4px 8px;
    cursor: pointer;
  }

  .oh-seg-btn.active {
    background: #0284c7;
    color: #ffffff;
  }

  .oh-seg-btn.away.active {
    background: #d97706;
    color: #ffffff;
  }

  .oh-icon-rate {
    background: transparent;
    border: none;
    color: #64748b;
    padding: 4px 6px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .oh-icon-rate.good.active {
    background: rgba(16, 185, 129, 0.2);
    color: #34d399;
  }

  .oh-icon-rate.eval.active {
    background: rgba(245, 158, 11, 0.2);
    color: #fbbf24;
  }

  .oh-icon-rate.fatal.active {
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  .oh-star-btn,
  .oh-close-btn {
    background: #0b1320;
    border: 1px solid #1f3352;
    color: #94a3b8;
    border-radius: 6px;
    padding: 4px 7px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .oh-star-btn.active {
    background: rgba(245, 158, 11, 0.2);
    border-color: #f59e0b;
    color: #fde047;
  }

  .oh-close-btn:hover {
    border-color: #ef4444;
    color: #ffffff;
  }

  /* ACTIVE CHIP RIBBON */
  .active-ribbon {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 5px;
    padding: 7px 14px;
    background: #0b1019;
    border-bottom: 1px solid #1c2a42;
    min-height: 34px;
    flex-shrink: 0;
  }

  .rib-label {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
    margin-right: 4px;
  }

  .rib-chip {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    padding: 2px 8px;
    border-radius: 999px;
    font-size: 10.5px;
    font-weight: 700;
    background: #172133;
    border: 1px solid #293e61;
    color: #e2e8f0;
    cursor: pointer;
  }

  .rib-chip.rib-cat {
    cursor: default;
    background: #111c2e;
    color: #ffffff;
  }

  .rib-chip.rib-player.primary {
    border-color: #38bdf8;
    background: rgba(14, 165, 233, 0.2);
    color: #ffffff;
  }

  .rib-chip.rib-pass {
    border-color: #10b981;
    background: rgba(16, 185, 129, 0.16);
    color: #a7f3d0;
  }

  .rib-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  /* 3-COLUMN BENTO GRID (ONCE SPORT STYLE) */
  .three-col-grid {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 10px;
    padding: 12px 14px;
    background: #10141c;
    flex: 1;
    min-height: 0;
  }

  .col-card {
    background: #0c0f15;
    border: 1px solid #1e283a;
    border-radius: 8px;
    display: flex;
    flex-direction: column;
    min-height: 295px;
    max-height: 375px;
    overflow: hidden;
    position: relative;
  }

  .col-tag {
    border-left: 3px solid #10b981;
  }

  .col-label {
    border-left: 3px solid #f59e0b;
  }

  .col-player {
    border-left: 3px solid #38bdf8;
  }

  .col-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 8px 10px;
    background: #111620;
    border-bottom: 1px solid #1b2537;
    flex-shrink: 0;
  }

  .col-hdr-left {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 800;
    letter-spacing: 0.05em;
    color: #f8fafc;
  }

  .col-count {
    font-family: "Fira Code", monospace;
    font-size: 9.5px;
    color: #64748b;
  }

  .col-list {
    flex: 1;
    overflow-y: auto;
    padding: 6px;
    display: flex;
    flex-direction: column;
    gap: 3px;
  }

  .col-row {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    border-radius: 6px;
    background: transparent;
    border: 1px solid transparent;
    color: #cbd5e1;
    font-size: 11.5px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: all 0.12s;
  }

  .col-row:hover {
    background: #172030;
    color: #ffffff;
  }

  .col-row.active {
    background: rgba(56, 189, 248, 0.14);
    border-color: rgba(56, 189, 248, 0.4);
    color: #ffffff;
  }

  .col-row.partial {
    border-style: dashed;
    opacity: 0.88;
  }

  .col-row.dim {
    opacity: 0.45;
  }

  .player-row {
    padding: 0 4px 0 0;
  }

  .player-main-btn {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: transparent;
    border: none;
    color: inherit;
    font: inherit;
    cursor: pointer;
    text-align: left;
  }

  .player-micro-actions {
    display: flex;
    align-items: center;
    gap: 3px;
    flex-shrink: 0;
  }

  .p-micro-btn {
    background: #0a0f18;
    border: 1px solid #202c40;
    color: #64748b;
    padding: 3px 5px;
    border-radius: 4px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .p-micro-btn:hover {
    color: #e2e8f0;
    border-color: #38bdf8;
  }

  .p-micro-btn.star.active {
    background: rgba(245, 158, 11, 0.22);
    border-color: #f59e0b;
    color: #fde047;
  }

  .p-micro-btn.pass.active {
    background: rgba(16, 185, 129, 0.22);
    border-color: #10b981;
    color: #34d399;
  }

  .row-indicator {
    width: 9px;
    height: 9px;
    border-radius: 50%;
    border: 1.5px solid;
    flex-shrink: 0;
  }

  .row-check {
    width: 15px;
    height: 15px;
    border-radius: 4px;
    border: 1.5px solid #334155;
    background: #090d14;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    color: #ffffff;
    flex-shrink: 0;
  }

  .row-check.sky.checked {
    background: #0284c7;
    border-color: #38bdf8;
  }

  .row-dot-sm {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .row-label {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .row-kbd {
    font-family: monospace;
    font-size: 9.5px;
    font-weight: 800;
    color: #93c5fd;
    background: #080c14;
    border: 1px solid #223554;
    padding: 0 5px;
    border-radius: 4px;
  }

  .row-group-tag {
    font-size: 8.5px;
    color: #94a3b8;
    background: #141b29;
    padding: 1px 5px;
    border-radius: 4px;
  }

  .col-empty {
    padding: 18px 10px;
    text-align: center;
    font-size: 11px;
    color: #64748b;
  }

  /* COMPACT SECONDARY DRAWER */
  .secondary-drawer {
    padding: 10px 14px;
    background: #0b0f18;
    border-top: 1px solid #1e2d47;
    flex-shrink: 0;
  }

  .drawer-notes-grid {
    display: grid;
    grid-template-columns: 1.4fr 1fr;
    gap: 12px;
  }

  .dn-title {
    display: block;
    font-size: 10px;
    font-weight: 800;
    color: #93c5fd;
    margin-bottom: 5px;
    text-transform: uppercase;
  }

  .dn-textarea {
    width: 100%;
    background: #080c14;
    border: 1px solid #1e3556;
    border-radius: 6px;
    color: #f8fafc;
    font-size: 11.5px;
    padding: 6px 9px;
    resize: none;
    outline: none;
    box-sizing: border-box;
  }

  .dn-textarea:focus {
    border-color: #38bdf8;
  }

  .dn-outcome-grid,
  .dc-zone-list {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 5px;
  }

  .dn-chip {
    background: #10192b;
    border: 1px solid #1e3556;
    color: #cbd5e1;
    font-size: 10px;
    font-weight: 700;
    padding: 5px 8px;
    border-radius: 5px;
    cursor: pointer;
    text-align: left;
  }

  .dn-chip.active {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .drawer-timing-row {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
  }

  .dt-box {
    display: flex;
    align-items: center;
    gap: 8px;
    background: #101827;
    border: 1px solid #1f3352;
    padding: 5px 10px;
    border-radius: 6px;
  }

  .dt-lbl {
    font-size: 10px;
    color: #94a3b8;
  }

  .dt-val {
    font-family: "Fira Code", monospace;
    font-size: 11.5px;
  }

  .dt-btns {
    display: flex;
    gap: 3px;
  }

  .dt-btns button {
    background: #080d16;
    border: 1px solid #243b5e;
    color: #cbd5e1;
    font-size: 9.5px;
    padding: 2px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .dt-btns button:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .dt-slider-box {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1;
    min-width: 180px;
  }

  .blue-slider {
    flex: 1;
    accent-color: #38bdf8;
  }

  .drawer-court-grid {
    display: grid;
    grid-template-columns: 240px 1fr;
    gap: 12px;
    align-items: center;
  }

  .mini-court-svg {
    width: 100%;
    height: 110px;
    display: block;
    cursor: crosshair;
    border-radius: 6px;
    border: 1px solid #1e3b68;
  }

  /* BOTTOM OMNI-SEARCH BAR (ONCE SPORT STYLE) */
  .once-footer {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 9px 14px;
    background: #0c111a;
    border-top: 1px solid #1f2e47;
    flex-shrink: 0;
  }

  .omni-search-wrap {
    flex: 1;
    min-width: 240px;
    display: flex;
    align-items: center;
    gap: 6px;
    background: #070a10;
    border: 1px solid #233859;
    border-radius: 7px;
    padding: 5px 9px;
  }

  .omni-search-wrap:focus-within {
    border-color: #38bdf8;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.2);
  }

  .omni-input {
    flex: 1;
    min-width: 0;
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 11.5px;
    outline: none;
  }

  .omni-clear-btn {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    display: inline-flex;
    padding: 2px;
  }

  .omni-clear-btn:hover {
    color: #ffffff;
  }

  .omni-create-btn {
    display: inline-flex;
    align-items: center;
    gap: 3px;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 7px;
    border-radius: 5px;
    border: 1px solid;
    cursor: pointer;
  }

  .omni-create-btn.lbl {
    background: rgba(245, 158, 11, 0.16);
    border-color: #f59e0b;
    color: #fcd34d;
  }

  .omni-create-btn.ply {
    background: rgba(56, 189, 248, 0.18);
    border-color: #38bdf8;
    color: #bae6fd;
  }

  .footer-tools-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .drawer-pill-btn {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #101725;
    border: 1px solid #1f3352;
    color: #94a3b8;
    font-size: 10.5px;
    font-weight: 700;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
  }

  .drawer-pill-btn:hover,
  .drawer-pill-btn.active {
    border-color: #38bdf8;
    color: #ffffff;
    background: #162640;
  }

  .drawer-pill-btn.has-val {
    color: #7dd3fc;
  }

  .btn-revert {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #1a1523;
    border: 1px solid #f59e0b;
    color: #fcd34d;
    font-size: 10.5px;
    font-weight: 700;
    padding: 5px 9px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-del-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    background: rgba(239, 68, 68, 0.12);
    border: 1px solid rgba(239, 68, 68, 0.45);
    color: #f87171;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-del-icon:hover {
    background: #ef4444;
    color: #ffffff;
  }

  .btn-done-once {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border: 1px solid #38bdf8;
    color: #ffffff;
    font-size: 11.5px;
    font-weight: 800;
    padding: 6px 14px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-done-once:hover {
    filter: brightness(1.1);
  }

  @media (max-width: 780px) {
    .three-col-grid {
      grid-template-columns: 1fr;
    }
    .col-card {
      min-height: 170px;
      max-height: 200px;
    }
    .once-footer {
      flex-wrap: wrap;
    }
  }
</style>

import { invoke, convertFileSrc } from '@tauri-apps/api/core';
import type {
  WorkflowStage,
  VideoTagEvent,
  DrawingElement,
  ActionPlaylist,
  RosterPlayer,
  Point2D,
  TaggingBoard,
  TaggingButton,
  PeriodKickoff,
  SubstitutionEvent,
  ChromaFloorConfig,
  ClubProfile,
  SubtitleCue,
  FreezeStop,
  SpeedSegment,
  WatermarkConfig,
  PresentationSlide,
  PresentationDeck,
  LibraryMatchSource,
  ClipLibraryFilter,
  ResolvedPlaylistClip,
  TelestrationFilterMode,
  MatchKind,
  RecentProjectEntry,
  SecondaryVideoAngle,
  MergeProjectOptions,
  MergeProjectPreview,
} from '$lib/types';

function loadInitialRecentProjects(): RecentProjectEntry[] {
  if (typeof localStorage === 'undefined') return [];
  try {
    const raw = localStorage.getItem('futsaltag_recent_projects_v1');
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}
import {
  BUILTIN_TAGGING_BOARDS,
  cloneBoard,
  parseMomenBoardJson,
} from '$lib/tagging/momenBoards';

const DEFAULT_BOARD_STORAGE_KEY = 'futsaltag_default_board_id_v1';
const CUSTOM_BOARDS_STORAGE_KEY = 'futsaltag_custom_boards_v1';

function loadInitialBoards(): TaggingBoard[] {
  const base = BUILTIN_TAGGING_BOARDS.map(cloneBoard);
  if (typeof localStorage === 'undefined') return base;
  try {
    const raw = localStorage.getItem(CUSTOM_BOARDS_STORAGE_KEY);
    if (!raw) return base;
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return base;
    const merged = [...base];
    for (const item of parsed) {
      if (!item || typeof item.id !== 'string' || !Array.isArray(item.buttons)) continue;
      const cloned = cloneBoard(item);
      const idx = merged.findIndex((b) => b.id === cloned.id);
      if (idx !== -1) {
        merged[idx] = cloned;
      } else {
        merged.push(cloned);
      }
    }
    return merged;
  } catch {
    return base;
  }
}

function loadInitialDefaultBoardId(boards: TaggingBoard[]): string {
  if (typeof localStorage !== 'undefined') {
    try {
      const saved = localStorage.getItem(DEFAULT_BOARD_STORAGE_KEY);
      if (saved && boards.some((b) => b.id === saved)) {
        return saved;
      }
    } catch {
      // Ignore storage read errors
    }
  }
  return boards[0].id;
}

export const DEFAULT_FUTSAL_ROSTER: RosterPlayer[] = [
  { id: 'r-gk', num: '#1', name: 'Kiper', role: 'Goalkeeper', color: '#0284c7' },
  { id: 'r-anc', num: '#4', name: 'Anchor', role: 'Defender / Playmaker', color: '#38bdf8' },
  { id: 'r-fl', num: '#7', name: 'Flank Kiri', role: 'Left Wing', color: '#10b981' },
  { id: 'r-fr', num: '#11', name: 'Flank Kanan', role: 'Right Wing', color: '#f59e0b' },
  { id: 'r-piv', num: '#9', name: 'Pivot', role: 'Target Man / Striker', color: '#8b5cf6' },
  { id: 'r-opp', num: 'OPP', name: 'Tim Lawan', role: 'Opponent Action', color: '#ef4444', isOpponent: true },
];

export const DEFAULT_CLUB_LIBRARY: ClubProfile[] = [
  {
    id: 'club-own-1',
    name: 'FutsalTag Pro FC',
    shortName: 'FTP',
    isOwnTeam: true,
    jerseyColor: '#0284c7',
    gkColor: '#f59e0b',
    updatedAt: '2026-11-25T00:00:00.000Z',
    players: [
      { id: 'cp-1', num: '#1', name: 'Kiper Utama', role: 'GK', dominantFoot: 'Kanan', color: '#f59e0b' },
      { id: 'cp-4', num: '#4', name: 'Anchor', role: 'Anchor', dominantFoot: 'Kanan', color: '#38bdf8' },
      { id: 'cp-7', num: '#7', name: 'Flank Kiri', role: 'Flank', dominantFoot: 'Kiri', color: '#10b981' },
      { id: 'cp-11', num: '#11', name: 'Flank Kanan', role: 'Flank', dominantFoot: 'Kanan', color: '#f59e0b' },
      { id: 'cp-9', num: '#9', name: 'Pivot', role: 'Pivot', dominantFoot: 'Keduanya', color: '#8b5cf6' },
      { id: 'cp-6', num: '#6', name: 'Anchor 2', role: 'Anchor', dominantFoot: 'Kanan', color: '#0ea5e9' },
      { id: 'cp-10', num: '#10', name: 'Universal', role: 'Universal', dominantFoot: 'Keduanya', color: '#14b8a6' },
    ],
  },
  {
    id: 'club-opp-1',
    name: 'Blacksteel FC',
    shortName: 'BSL',
    isOwnTeam: false,
    jerseyColor: '#ef4444',
    gkColor: '#10b981',
    updatedAt: '2026-11-25T00:00:00.000Z',
    players: [
      { id: 'opp-1', num: '#1', name: 'GK Blacksteel', role: 'GK', dominantFoot: 'Kanan' },
      { id: 'opp-5', num: '#5', name: 'Anchor Lawan', role: 'Anchor', dominantFoot: 'Kanan' },
      { id: 'opp-8', num: '#8', name: 'Flank Lawan 1', role: 'Flank', dominantFoot: 'Kiri' },
      { id: 'opp-12', num: '#12', name: 'Flank Lawan 2', role: 'Flank', dominantFoot: 'Kanan' },
      { id: 'opp-14', num: '#14', name: 'Pivot Lawan', role: 'Pivot', dominantFoot: 'Kanan' },
    ],
  },
];

export function isTauriDesktop(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
}

export function parseYouTubeVideoId(url: string | null | undefined): string | null {
  if (!url) return null;
  const trimmed = url.trim();
  const m = trimmed.match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  return m ? m[1] : null;
}

function createDefaultDeck(id = 'deck-1', title = 'Presentasi 1'): PresentationDeck {
  return {
    id,
    title,
    showTitleCardBeforeClip: false,
    titleCardDurationSec: 2,
    slides: [],
  };
}

class ProjectStore {
  stage = $state<WorkflowStage>('hub');
  videoSrc = $state<string | null>(null);
  videoFilePath = $state<string | null>(null);
  onlineVideoUrl = $state<string | null>(null);
  onlineSourceType = $state<'youtube' | 'stream' | null>(null);
  liveCaptureActive = $state<boolean>(false);
  liveCaptureTargetPath = $state<string | null>(null);
  videoTitle = $state<string>('Pertandingan Futsal');
  duration = $state<number>(120);
  currentTime = $state<number>(0);

  // Unified reactive futsal roster shared across Tagging, Editor, Matrix, Heatmap, & WA Export
  roster = $state<RosterPlayer[]>(DEFAULT_FUTSAL_ROSTER.map((p) => ({ ...p })));

  // Calibration corners if set
  calibrationPoints = $state<Record<string, Point2D> | null>(null);

  // Tagged events - EMPTY by default for fresh video trimming
  tags = $state<VideoTagEvent[]>([]);

  // Selected clip for Stage 3 Telestrator
  activeClipForDrawing = $state<VideoTagEvent | null>(null);

  // Match Clock Kick-offs & Futsal Rotation / Substitution Engine
  periodKickoffs = $state<PeriodKickoff[]>([]);
  useMatchClock = $state<boolean>(false);
  startingLineupIds = $state<string[]>(
    DEFAULT_FUTSAL_ROSTER.filter((p) => !p.isOpponent)
      .slice(0, 5)
      .map((p) => p.id)
  );
  substitutions = $state<SubstitutionEvent[]>([]);
  lastAutoSaveAt = $state<string | null>(null);
  autoSaveMeta = $state<{ title: string; tagCount: number; savedAt: string } | null>(null);

  // Broadcast Chroma-Key & AI Silhouette Court Masking Config
  chromaFloorConfig = $state<ChromaFloorConfig>({
    enabled: false,
    mode: 'ai-silhouette',
    targetRgb: [34, 98, 152],
    tolerance: 32,
    feather: 10,
  });

  // Persistent Club & Roster Library (AppData / localStorage)
  clubLibrary = $state<ClubProfile[]>(
    DEFAULT_CLUB_LIBRARY.map((c) => ({
      ...c,
      players: c.players.map((p) => ({ ...p })),
    }))
  );
  clubLibraryLoaded = $state<boolean>(false);

  // Momen + Once Sport Tagging Boards
  boards = $state<TaggingBoard[]>(loadInitialBoards());
  defaultBoardId = $state<string>(loadInitialDefaultBoardId(this.boards));
  activeBoardId = $state<string>(this.defaultBoardId);

  // Playlists for Stage 4
  playlists = $state<ActionPlaylist[]>([
    {
      id: 'pl-default',
      title: 'Playlist Pertandingan',
      description: 'Daftar klip hasil tagging momen pertandingan',
      createdAt: new Date().toISOString(),
      items: [],
    },
  ]);
  presentationSlides = $state<PresentationSlide[]>([]);
  presentationDecks = $state<PresentationDeck[]>([createDefaultDeck()]);
  activeDeckId = $state<string>('deck-1');
  clubLogoDataUrl = $state<string | null>(null);
  watermarkConfig = $state<WatermarkConfig>({
    enabled: true,
    position: 'top-right',
    opacity: 0.78,
    scaleRatio: 0.09,
  });
  currentProjectFilePath = $state<string | null>(null);
  matchLibraryFolder = $state<string>(
    typeof localStorage !== 'undefined' ? localStorage.getItem('futsaltag_match_library_folder') || '' : ''
  );
  libraryMatches = $state<LibraryMatchSource[]>([]);
  matchLibraryLoading = $state<boolean>(false);
  matchLibraryError = $state<string | null>(null);
  clipFilter = $state<ClipLibraryFilter>({
    matchIds: [],
    categories: [],
    labels: [],
    players: [],
    telestration: 'all',
    searchQuery: '',
  });
  globalIncludeTelestration = $state<boolean>(true);
  clipTelestrationOverrides = $state<Record<string, boolean>>({});
  clipCustomOrderKeys = $state<string[]>([]);
  clipExcludedKeys = $state<Record<string, boolean>>({});
  matchKind = $state<MatchKind>('match');
  competitionName = $state<string>('');
  matchDate = $state<string>(new Date().toISOString().slice(0, 10));
  hasUnsavedChanges = $state<boolean>(false);
  videoMissing = $state<boolean>(false);
  onlyDrawMode = $state<boolean>(false);
  recentProjects = $state<RecentProjectEntry[]>(loadInitialRecentProjects());
  secondaryAngles = $state<SecondaryVideoAngle[]>([]);
  activeAngleId = $state<string>('main');
  angleViewMode = $state<'single' | 'split'>('single');

  markDirty() {
    this.hasUnsavedChanges = true;
  }

  // Full NLE Tag Undo/Redo History Stack
  private tagHistoryPast: { label: string; tags: VideoTagEvent[] }[] = [];
  private tagHistoryFuture: { label: string; tags: VideoTagEvent[] }[] = [];
  private isRestoringHistory = false;
  canUndo = $state(false);
  canRedo = $state(false);
  lastUndoLabel = $state<string | null>(null);
  lastRedoLabel = $state<string | null>(null);

  constructor() {}

  private cloneTagsSnapshot(): VideoTagEvent[] {
    return JSON.parse(JSON.stringify(this.tags));
  }

  private syncHistoryFlags() {
    this.canUndo = this.tagHistoryPast.length > 0;
    this.canRedo = this.tagHistoryFuture.length > 0;
    this.lastUndoLabel =
      this.tagHistoryPast.length > 0
        ? this.tagHistoryPast[this.tagHistoryPast.length - 1].label
        : null;
    this.lastRedoLabel =
      this.tagHistoryFuture.length > 0
        ? this.tagHistoryFuture[this.tagHistoryFuture.length - 1].label
        : null;
  }

  private pushTagUndoSnapshot(label: string) {
    if (this.isRestoringHistory) return;
    this.tagHistoryPast.push({ label, tags: this.cloneTagsSnapshot() });
    if (this.tagHistoryPast.length > 50) {
      this.tagHistoryPast.shift();
    }
    this.tagHistoryFuture = [];
    this.syncHistoryFlags();
  }

  private clearTagHistory() {
    this.tagHistoryPast = [];
    this.tagHistoryFuture = [];
    this.syncHistoryFlags();
  }

  private syncPlaylistsAfterTagsRestore() {
    const tagMap = new Map(this.tags.map((t) => [t.id, t]));
    for (const pl of this.playlists) {
      pl.items = pl.items
        .filter((item) => tagMap.has(item.tagEventId))
        .map((item, idx) => {
          const t = tagMap.get(item.tagEventId)!;
          return {
            ...item,
            order: idx + 1,
            title: t.title,
            pauseDuration: t.pauseDuration ?? 3.0,
            tagEvent: t,
          };
        });
    }
    if (this.playlists.length > 0) {
      const defPl = this.playlists[0];
      const existingIds = new Set(defPl.items.map((it) => it.tagEventId));
      for (const t of this.tags) {
        if (!existingIds.has(t.id)) {
          defPl.items.push({
            id: `pl-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
            tagEventId: t.id,
            order: defPl.items.length + 1,
            pauseDuration: t.pauseDuration ?? 3.0,
            title: t.title,
            tagEvent: t,
          });
        }
      }
      defPl.items.forEach((it, idx) => (it.order = idx + 1));
    }
    if (this.activeClipForDrawing) {
      this.activeClipForDrawing = tagMap.get(this.activeClipForDrawing.id) ?? null;
    }
  }

  runBatchTagMutation(label: string, mutator: () => void) {
    this.pushTagUndoSnapshot(label);
    this.isRestoringHistory = true;
    try {
      mutator();
    } finally {
      this.isRestoringHistory = false;
    }
  }

  undoTags(): string | null {
    const entry = this.tagHistoryPast.pop();
    if (!entry) return null;
    this.tagHistoryFuture.push({ label: entry.label, tags: this.cloneTagsSnapshot() });
    this.isRestoringHistory = true;
    try {
      this.tags = entry.tags;
      this.syncPlaylistsAfterTagsRestore();
    } finally {
      this.isRestoringHistory = false;
    }
    this.syncHistoryFlags();
    return entry.label;
  }

  redoTags(): string | null {
    const entry = this.tagHistoryFuture.pop();
    if (!entry) return null;
    this.tagHistoryPast.push({ label: entry.label, tags: this.cloneTagsSnapshot() });
    this.isRestoringHistory = true;
    try {
      this.tags = entry.tags;
      this.syncPlaylistsAfterTagsRestore();
    } finally {
      this.isRestoringHistory = false;
    }
    this.syncHistoryFlags();
    return entry.label;
  }

  shiftAllActionTimes(
    deltaSec: number,
    scope: 'all' | 'from_playhead' = 'all',
    fromTime = 0,
    includeClockAndSubs = true
  ): number {
    if (!Number.isFinite(deltaSec) || Math.abs(deltaSec) < 0.001) return 0;
    let shiftedCount = 0;
    const label = `Geser Waktu (${deltaSec >= 0 ? '+' : ''}${deltaSec.toFixed(1)}s)`;

    this.runBatchTagMutation(label, () => {
      const nextTags = this.tags.map((t) => {
        if (scope === 'from_playhead' && t.startTime < fromTime - 0.001) {
          return t;
        }
        shiftedCount += 1;
        const dur = Math.max(0.2, t.endTime - t.startTime);
        const newStart = Number(Math.max(0, t.startTime + deltaSec).toFixed(2));
        const newEnd = Number(Math.max(newStart + 0.2, Math.max(0, t.endTime + deltaSec)).toFixed(2));
        const actualDur = newEnd - newStart;
        const nextEnd = actualDur < 0.2 ? Number((newStart + dur).toFixed(2)) : newEnd;

        const nextLabels = t.labels?.map((l) => ({
          ...l,
          atTime: Number(Math.max(0, l.atTime + deltaSec).toFixed(2)),
        }));
        const nextStops = t.freezeStops?.map((s) => ({
          ...s,
          time: Number(Math.max(0, s.time + deltaSec).toFixed(2)),
        }));
        const nextDrawings = t.drawings?.map((d) => ({
          ...d,
          timeStart:
            typeof d.timeStart === 'number'
              ? Number(Math.max(0, d.timeStart + deltaSec).toFixed(2))
              : d.timeStart,
          timeEnd:
            typeof d.timeEnd === 'number'
              ? Number(Math.max(0, d.timeEnd + deltaSec).toFixed(2))
              : d.timeEnd,
          keyframes: d.keyframes?.map((k) => ({
            ...k,
            time: Number(Math.max(0, k.time + deltaSec).toFixed(2)),
          })),
          manualPins: d.manualPins?.map((k) => ({
            ...k,
            time: Number(Math.max(0, k.time + deltaSec).toFixed(2)),
          })),
        }));

        return {
          ...t,
          startTime: newStart,
          endTime: nextEnd,
          freezeTimestamp:
            typeof t.freezeTimestamp === 'number'
              ? Number(Math.max(0, t.freezeTimestamp + deltaSec).toFixed(2))
              : t.freezeTimestamp,
          labels: nextLabels,
          freezeStops: nextStops,
          drawings: nextDrawings,
        };
      });

      this.tags = nextTags;
      this.syncPlaylistsAfterTagsRestore();
    });

    if (includeClockAndSubs) {
      if (this.periodKickoffs.length > 0) {
        this.periodKickoffs = this.periodKickoffs.map((k) => {
          if (scope === 'from_playhead' && k.videoTime < fromTime - 0.001) return k;
          return { ...k, videoTime: Number(Math.max(0, k.videoTime + deltaSec).toFixed(2)) };
        });
      }
      if (this.substitutions.length > 0) {
        this.substitutions = this.substitutions.map((s) => {
          if (scope === 'from_playhead' && s.atTime < fromTime - 0.001) return s;
          return { ...s, atTime: Number(Math.max(0, s.atTime + deltaSec).toFixed(2)) };
        });
      }
    }

    this.markDirty();
    return shiftedCount;
  }

  // --- MATCH CLOCK & KICK-OFF SYNCHRONIZATION ---
  setPeriodKickoff(period: 1 | 2 | 3, videoTime: number) {
    const label = period === 1 ? 'Babak 1' : period === 2 ? 'Babak 2' : 'Extra';
    const cleanTime = Number(Math.max(0, videoTime).toFixed(2));
    const idx = this.periodKickoffs.findIndex((k) => k.period === period);
    const entry: PeriodKickoff = { period, videoTime: cleanTime, label };
    if (idx !== -1) {
      this.periodKickoffs[idx] = entry;
    } else {
      this.periodKickoffs.push(entry);
    }
    this.periodKickoffs = [...this.periodKickoffs].sort((a, b) => a.videoTime - b.videoTime);
    this.useMatchClock = true;
    this.markDirty();
  }

  clearPeriodKickoff(period?: 1 | 2 | 3) {
    if (period !== undefined) {
      this.periodKickoffs = this.periodKickoffs.filter((k) => k.period !== period);
    } else {
      this.periodKickoffs = [];
    }
    if (this.periodKickoffs.length === 0) {
      this.useMatchClock = false;
    }
    this.markDirty();
  }

  getPeriodAtTime(videoTime: number): 1 | 2 | 3 {
    if (this.periodKickoffs.length === 0) return 1;
    const sorted = [...this.periodKickoffs].sort((a, b) => a.videoTime - b.videoTime);
    let currentPeriod: 1 | 2 | 3 = sorted[0].period;
    for (const k of sorted) {
      if (k.videoTime <= videoTime + 0.001) {
        currentPeriod = k.period;
      }
    }
    return currentPeriod;
  }

  formatMatchClock(videoTime: number, includeDecimals = false): string {
    const formatSec = (sec: number) => {
      const safe = Math.max(0, Number.isFinite(sec) ? sec : 0);
      const m = Math.floor(safe / 60);
      const s = Math.floor(safe % 60);
      const base = `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
      if (!includeDecimals) return base;
      const d = Math.floor((safe % 1) * 10);
      return `${base}.${d}`;
    };

    if (this.periodKickoffs.length === 0) {
      return formatSec(videoTime);
    }

    const sorted = [...this.periodKickoffs].sort((a, b) => a.videoTime - b.videoTime);
    let matched: PeriodKickoff | null = null;
    for (const k of sorted) {
      if (k.videoTime <= videoTime + 0.001) {
        matched = k;
      }
    }

    if (!matched) {
      return `PRE -${formatSec(sorted[0].videoTime - videoTime)}`;
    }

    const elapsed = Math.max(0, videoTime - matched.videoTime);
    const prefix = matched.period === 1 ? 'B1' : matched.period === 2 ? 'B2' : 'ET';
    return `${prefix} ${formatSec(elapsed)}`;
  }

  // --- FUTSAL ROTATION & SUBSTITUTION ENGINE ---
  getRosterPlayerById(id: string): RosterPlayer | undefined {
    return this.roster.find((p) => p.id === id);
  }

  isGoalkeeper(p: RosterPlayer): boolean {
    return /kiper|goalkeeper|\bgk\b/i.test(p.role) || /kiper/i.test(p.name) || p.num === '#1';
  }

  getActiveLineupIdsAt(videoTime: number): string[] {
    let lineup = [...this.startingLineupIds];
    const sortedSubs = [...this.substitutions].sort((a, b) => a.atTime - b.atTime);
    for (const sub of sortedSubs) {
      if (sub.atTime > videoTime + 0.001) break;
      const outIdx = lineup.indexOf(sub.playerOut);
      if (outIdx !== -1) {
        if (!lineup.includes(sub.playerIn)) {
          lineup[outIdx] = sub.playerIn;
        } else {
          lineup = lineup.filter((id) => id !== sub.playerOut);
        }
      } else if (!lineup.includes(sub.playerIn)) {
        lineup.push(sub.playerIn);
      }
    }
    return lineup;
  }

  get activeLineupIds(): string[] {
    return this.getActiveLineupIdsAt(this.currentTime);
  }

  setStartingLineup(ids: string[]) {
    this.startingLineupIds = Array.from(new Set(ids)).slice(0, 5);
    this.markDirty();
  }

  recordSubstitution(
    playerOutId: string,
    playerInId: string,
    atTime: number,
    teamSide: 'home' | 'away' = 'home'
  ): SubstitutionEvent | null {
    if (!playerOutId || !playerInId || playerOutId === playerInId) return null;
    const cleanTime = Number(Math.max(0, atTime).toFixed(2));
    const event: SubstitutionEvent = {
      id: `sub-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      atTime: cleanTime,
      period: this.getPeriodAtTime(cleanTime),
      playerOut: playerOutId,
      playerIn: playerInId,
      teamSide,
    };
    this.substitutions = [...this.substitutions, event].sort((a, b) => a.atTime - b.atTime);
    this.markDirty();
    return event;
  }

  deleteSubstitution(id: string) {
    this.substitutions = this.substitutions.filter((s) => s.id !== id);
    this.markDirty();
  }

  // --- PERSISTENT CLUB & ROSTER LIBRARY ---
  async loadClubLibrary() {
    try {
      let raw: string | null = null;
      if (isTauriDesktop()) {
        raw = await invoke<string | null>('load_club_library');
      } else if (typeof window !== 'undefined' && window.localStorage) {
        raw = window.localStorage.getItem('futsaltag_club_library_v1');
      }
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          this.clubLibrary = parsed;
        }
      }
    } catch (err) {
      console.error('Gagal memuat library klub:', err);
    } finally {
      this.clubLibraryLoaded = true;
    }
  }

  async saveClubLibrary(): Promise<string> {
    const content = JSON.stringify(this.clubLibrary, null, 2);
    if (isTauriDesktop()) {
      return invoke<string>('save_club_library', { content });
    }
    if (typeof window !== 'undefined' && window.localStorage) {
      window.localStorage.setItem('futsaltag_club_library_v1', content);
    }
    return 'localStorage';
  }

  async upsertClubProfile(club: ClubProfile): Promise<string> {
    const clean: ClubProfile = {
      ...club,
      updatedAt: new Date().toISOString(),
      players: club.players.map((p) => ({ ...p })),
    };
    const idx = this.clubLibrary.findIndex((c) => c.id === clean.id);
    if (idx !== -1) {
      this.clubLibrary[idx] = clean;
    } else {
      this.clubLibrary = [...this.clubLibrary, clean];
    }
    return this.saveClubLibrary();
  }

  async deleteClubProfile(clubId: string): Promise<string> {
    this.clubLibrary = this.clubLibrary.filter((c) => c.id !== clubId);
    return this.saveClubLibrary();
  }

  applyClubsToMatchRoster(homeClubId: string | null, awayClubId: string | null) {
    const homeClub = homeClubId ? this.clubLibrary.find((c) => c.id === homeClubId) : undefined;
    const awayClub = awayClubId ? this.clubLibrary.find((c) => c.id === awayClubId) : undefined;

    if (homeClub && homeClub.players.length > 0) {
      const nextRoster: RosterPlayer[] = homeClub.players.map((p) => ({
        id: p.id,
        num: p.num.startsWith('#') ? p.num : `#${p.num}`,
        name: p.name,
        role: p.role === 'GK' ? 'Goalkeeper' : p.role,
        color: p.role === 'GK' ? homeClub.gkColor : p.color || homeClub.jerseyColor,
        whatsapp: p.whatsapp?.trim() || undefined,
      }));
      nextRoster.push({
        id: 'r-opp',
        num: 'OPP',
        name: 'Tim Lawan',
        role: awayClub ? awayClub.name : 'Opponent Action',
        color: awayClub?.jerseyColor || '#ef4444',
        isOpponent: true,
      });
      this.roster = nextRoster;

      const gk = nextRoster.find((p) => !p.isOpponent && this.isGoalkeeper(p));
      const outfield = nextRoster.filter((p) => !p.isOpponent && p.id !== gk?.id);
      const s5 = gk ? [gk.id, ...outfield.slice(0, 4).map((p) => p.id)] : outfield.slice(0, 5).map((p) => p.id);
      this.startingLineupIds = s5;
    } else if (awayClub) {
      const oppIdx = this.roster.findIndex((p) => p.isOpponent || p.name === 'Tim Lawan');
      if (oppIdx !== -1) {
        this.roster[oppIdx] = {
          ...this.roster[oppIdx],
          role: awayClub.name,
          color: awayClub.jerseyColor,
        };
      }
    }
  }

  private persistBoardsLibrary() {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(CUSTOM_BOARDS_STORAGE_KEY, JSON.stringify(this.boards));
    } catch {
      // Ignore storage quota errors
    }
  }

  get activeBoard(): TaggingBoard {
    return this.boards.find((b) => b.id === this.activeBoardId) || this.boards[0];
  }

  selectBoard(id: string) {
    if (this.boards.some((b) => b.id === id)) {
      this.activeBoardId = id;
    }
  }

  setDefaultBoard(id: string) {
    if (!this.boards.some((b) => b.id === id)) return;
    this.defaultBoardId = id;
    this.activeBoardId = id;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(DEFAULT_BOARD_STORAGE_KEY, id);
      } catch {
        // Ignore storage write errors
      }
    }
    this.persistBoardsLibrary();
  }

  importMomenBoard(jsonStr: string): TaggingBoard {
    const parsed = parseMomenBoardJson(jsonStr);
    const idx = this.boards.findIndex((b) => b.id === parsed.id);
    if (idx !== -1) {
      this.boards[idx] = cloneBoard(parsed);
    } else {
      this.boards.push(cloneBoard(parsed));
    }
    this.activeBoardId = parsed.id;
    this.persistBoardsLibrary();
    this.markDirty();
    return this.activeBoard;
  }

  upsertBoardButton(btn: TaggingButton) {
    const board = this.activeBoard;
    if (!board || board.locked) return;
    const idx = board.buttons.findIndex((b) => b.id === btn.id);
    if (idx !== -1) {
      board.buttons[idx] = { ...btn, forTags: [...btn.forTags], links: [...btn.links] };
    } else {
      board.buttons.push({ ...btn, forTags: [...btn.forTags], links: [...btn.links] });
    }
    this.persistBoardsLibrary();
    this.markDirty();
  }

  deleteBoardButton(buttonId: string) {
    const board = this.activeBoard;
    if (!board || board.locked) return;
    board.buttons = board.buttons
      .filter((b) => b.id !== buttonId)
      .map((b) => ({
        ...b,
        links: b.links.filter((id) => id !== buttonId),
        forTags: b.forTags.filter((id) => id !== buttonId),
      }));
    this.persistBoardsLibrary();
    this.markDirty();
  }

  toggleBoardButtonLink(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const board = this.activeBoard;
    if (!board || board.locked) return;
    const src = board.buttons.find((b) => b.id === sourceId);
    const dst = board.buttons.find((b) => b.id === targetId);
    if (!src || !dst) return;

    if (src.kind === 'category' && dst.kind === 'category') {
      const alreadyLinked = src.links.includes(dst.id) || dst.links.includes(src.id);
      if (alreadyLinked) {
        src.links = src.links.filter((id) => id !== dst.id);
        dst.links = dst.links.filter((id) => id !== src.id);
      } else {
        if (!src.links.includes(dst.id)) src.links = [...src.links, dst.id];
        if (!dst.links.includes(src.id)) dst.links = [...dst.links, src.id];
      }
      this.persistBoardsLibrary();
      this.markDirty();
      return;
    }

    if (src.kind === 'descriptor' && dst.kind === 'category') {
      src.forTags = src.forTags.includes(dst.id)
        ? src.forTags.filter((id) => id !== dst.id)
        : [...src.forTags, dst.id];
      this.persistBoardsLibrary();
      this.markDirty();
      return;
    }

    if (src.kind === 'category' && dst.kind === 'descriptor') {
      dst.forTags = dst.forTags.includes(src.id)
        ? dst.forTags.filter((id) => id !== src.id)
        : [...dst.forTags, src.id];
      this.persistBoardsLibrary();
      this.markDirty();
    }
  }

  updateActiveBoardMeta(patch: { name?: string; background?: 'pitch' | 'plain'; color?: string }) {
    const board = this.activeBoard;
    if (!board) return;
    if (typeof patch.name === 'string') board.name = patch.name;
    if (patch.background) board.background = patch.background;
    if (typeof patch.color === 'string') board.color = patch.color;
    this.persistBoardsLibrary();
    this.markDirty();
  }

  createNewBoard(name?: string): TaggingBoard {
    const fresh: TaggingBoard = {
      id: `board_${Date.now()}`,
      name: name?.trim() || `Papan Kustom ${this.boards.length + 1}`,
      background: 'pitch',
      color: '#0d1e38',
      periods: 2,
      buttons: [],
    };
    this.boards.push(fresh);
    this.activeBoardId = fresh.id;
    this.persistBoardsLibrary();
    this.markDirty();
    return fresh;
  }

  duplicateActiveBoard(): TaggingBoard {
    const src = this.activeBoard;
    const dup = cloneBoard(src);
    dup.id = `board_${Date.now()}`;
    dup.name = `${src.name} (Salinan)`;
    dup.locked = false;
    this.boards.push(dup);
    this.activeBoardId = dup.id;
    this.persistBoardsLibrary();
    this.markDirty();
    return dup;
  }

  deleteBoard(id: string): boolean {
    if (this.boards.length <= 1) return false;
    const next = this.boards.filter((b) => b.id !== id);
    if (next.length === this.boards.length) return false;
    this.boards = next;
    if (this.defaultBoardId === id) {
      this.setDefaultBoard(next[0].id);
    }
    if (this.activeBoardId === id) {
      this.activeBoardId = this.boards.some((b) => b.id === this.defaultBoardId)
        ? this.defaultBoardId
        : next[0].id;
    }
    this.persistBoardsLibrary();
    this.markDirty();
    return true;
  }

  toggleActiveBoardLock(): boolean {
    const board = this.activeBoard;
    if (!board) return false;
    board.locked = !board.locked;
    this.persistBoardsLibrary();
    this.markDirty();
    return Boolean(board.locked);
  }

  private normalizeTagPlayers(tag: VideoTagEvent): VideoTagEvent {
    if (Array.isArray(tag.playersInvolved) && tag.playersInvolved.length > 0) {
      const normalizedPlayers = Array.from(
        new Set(tag.playersInvolved.map((p) => this.normalizePlayerLabel(p)).filter(Boolean))
      );
      const primary = tag.playerLabel
        ? this.normalizePlayerLabel(tag.playerLabel)
        : normalizedPlayers[0];
      return {
        ...tag,
        playerLabel: primary,
        playersInvolved: normalizedPlayers.length > 0 ? normalizedPlayers : [primary],
      };
    }
    const primary = this.normalizePlayerLabel(tag.playerLabel);
    return {
      ...tag,
      playerLabel: primary,
      playersInvolved: [primary],
    };
  }

  getPlayerDisplayLabel(p: RosterPlayer): string {
    if (p.isOpponent || p.name === 'Tim Lawan') return 'Tim Lawan';
    return `${p.num} ${p.name}`.trim();
  }

  normalizePlayerLabel(label?: string): string {
    const raw = (label || '').trim();
    if (!raw) return 'Tim Lawan';
    if (raw === 'Opp Tim Lawan' || raw.toLowerCase().includes('lawan')) {
      return 'Tim Lawan';
    }
    return raw;
  }

  tagHasPlayer(tag: VideoTagEvent, targetLabel: string): boolean {
    const normTarget = this.normalizePlayerLabel(targetLabel);
    const stripHash = (s: string) => s.replace(/^#/, '').trim().toLowerCase();
    const targetNoHash = stripHash(normTarget);
    const numNameMatch = normTarget.match(/^#?\d+\s+(.+)$/);
    const targetNameOnly = numNameMatch ? numNameMatch[1].trim().toLowerCase() : null;

    const candidates = [
      ...(tag.playersInvolved ?? []),
      ...(tag.playerLabel ? [tag.playerLabel] : []),
    ];
    for (const raw of candidates) {
      const norm = this.normalizePlayerLabel(raw);
      if (norm === normTarget) return true;
      if (stripHash(norm) === targetNoHash) return true;
      if (targetNameOnly && !/^#?\d+\b/.test(norm) && norm.toLowerCase() === targetNameOnly) {
        return true;
      }
    }
    return false;
  }

  addRosterPlayer(rawInput: string): string {
    const trimmed = rawInput.trim();
    if (!trimmed) return '';
    const norm = this.normalizePlayerLabel(trimmed);
    const exists = this.roster.some((p) => this.getPlayerDisplayLabel(p) === norm);
    if (!exists) {
      const parts = norm.split(/\s+/);
      const hasNum = parts.length > 1 && parts[0].startsWith('#');
      this.roster.push({
        id: `r-custom-${Date.now()}`,
        num: hasNum ? parts[0] : `#${this.roster.length + 1}`,
        name: hasNum ? parts.slice(1).join(' ') : norm,
        role: 'Pemain Rotasi',
        color: '#0ea5e9',
      });
      this.markDirty();
    }
    return norm;
  }

  setStage(newStage: WorkflowStage) {
    this.stage = newStage;
  }

  // Load a real user video: CLEARS previous tags so analyst starts fresh
  loadVideo(url: string, path: string | null, title: string, dur = 0) {
    this.currentProjectFilePath = null;
    this.videoMissing = false;
    this.hasUnsavedChanges = false;
    this.secondaryAngles = [];
    this.activeAngleId = 'main';
    this.angleViewMode = 'single';
    this.videoSrc = url;
    this.videoFilePath = path;
    this.onlineVideoUrl = null;
    this.onlineSourceType = null;
    this.liveCaptureActive = false;
    this.liveCaptureTargetPath = null;
    this.videoTitle = title || 'Video Pertandingan Futsal';
    this.duration = dur;
    this.currentTime = 0;
    this.activeBoardId = this.boards.some((b) => b.id === this.defaultBoardId)
      ? this.defaultBoardId
      : this.boards[0].id;

    this.tags = [];
    this.activeClipForDrawing = null;
    this.periodKickoffs = [];
    this.useMatchClock = false;
    this.substitutions = [];
    this.chromaFloorConfig = { ...this.chromaFloorConfig, enabled: false };
    this.startingLineupIds = this.roster
      .filter((p) => !p.isOpponent)
      .slice(0, 5)
      .map((p) => p.id);
    this.playlists = [
      {
        id: 'pl-default',
        title: 'Playlist Pertandingan',
        description: 'Daftar klip hasil tagging momen pertandingan',
        createdAt: new Date().toISOString(),
        items: [],
      },
    ];
    this.presentationSlides = [];
    this.presentationDecks = [createDefaultDeck()];
    this.activeDeckId = 'deck-1';
    this.clubLogoDataUrl = null;
    this.watermarkConfig = { enabled: true, position: 'top-right', opacity: 0.78, scaleRatio: 0.09 };
    this.onlyDrawMode = false;
    this.clearTagHistory();
    this.stage = 'tagging';
  }

  async startQuickOnlyDrawSession(opts?: {
    filePath?: string | null;
    videoSrc?: string | null;
    title?: string;
    duration?: number;
  }): Promise<boolean> {
    let targetPath = opts?.filePath ?? null;
    let targetSrc = opts?.videoSrc ?? null;
    let targetTitle = opts?.title;

    if (!targetSrc && !targetPath && isTauriDesktop()) {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        title: 'Pilih 1 Klip / Video untuk Telestrasi Cepat (OnlyDraw)',
        multiple: false,
        filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }],
      });
      if (!selected || typeof selected !== 'string') return false;
      targetPath = selected;
      targetSrc = convertFileSrc(selected);
      targetTitle = selected.split(/[\\/]/).pop()?.replace(/\.[^.]+$/, '') || 'Telestrasi Cepat';
    }

    if (!targetSrc) return false;

    const clipDur = Math.max(5, opts?.duration || 30);
    this.loadVideo(targetSrc, targetPath, targetTitle || 'Telestrasi Cepat (OnlyDraw)', clipDur);
    this.onlyDrawMode = true;
    const quickClip: VideoTagEvent = {
      id: 'onlydraw-clip-1',
      title: targetTitle || 'Telestrasi Cepat',
      category: 'Build-up 3-1',
      startTime: 0,
      endTime: clipDur,
      color: '#00f0ff',
      drawings: [],
      pauseDuration: 3.0,
    };
    this.tags = [quickClip];
    this.activeClipForDrawing = quickClip;
    this.syncPlaylistsAfterTagsRestore();
    this.stage = 'telestrator';
    return true;
  }

  promoteOnlyDrawToFullProject() {
    this.onlyDrawMode = false;
    this.stage = 'tagging';
  }

  startLiveStopwatchSession(title: string, kind: MatchKind = 'match', competition = '') {
    this.loadVideo('', null, title || 'Live Tagging Pertandingan', 2400);
    this.videoSrc = null;
    this.videoFilePath = null;
    this.onlineVideoUrl = null;
    this.onlineSourceType = null;
    this.liveCaptureActive = false;
    this.liveCaptureTargetPath = null;
    this.videoMissing = false;
    this.matchKind = kind;
    this.competitionName = competition;
  }

  startLiveCaptureSession(
    title: string,
    targetMp4Path: string | null,
    kind: MatchKind = 'match',
    competition = ''
  ) {
    this.loadVideo('', null, title || 'Live Capture Pertandingan', 2400);
    this.videoSrc = null;
    this.videoFilePath = null;
    this.onlineVideoUrl = null;
    this.onlineSourceType = null;
    this.liveCaptureActive = true;
    this.liveCaptureTargetPath = targetMp4Path;
    this.videoMissing = false;
    this.matchKind = kind;
    this.competitionName = competition;
  }

  attachCapturedMp4(filePath: string) {
    this.liveCaptureActive = false;
    this.liveCaptureTargetPath = null;
    this.onlineVideoUrl = null;
    this.onlineSourceType = null;
    this.videoFilePath = filePath;
    this.videoSrc = convertFileSrc(filePath);
    this.videoMissing = false;
    this.markDirty();
  }

  loadOnlineVideo(
    url: string,
    title: string,
    kind: MatchKind = 'match',
    competition = ''
  ): 'youtube' | 'stream' {
    const cleanUrl = url.trim();
    const ytId = parseYouTubeVideoId(cleanUrl);
    if (ytId) {
      this.loadVideo('', null, title || 'Analisis YouTube Pertandingan', 5400);
      this.videoSrc = null;
      this.videoFilePath = null;
      this.onlineVideoUrl = cleanUrl;
      this.onlineSourceType = 'youtube';
    } else {
      this.loadVideo(cleanUrl, null, title || 'Analisis Stream Online', 2400);
      this.videoFilePath = null;
      this.onlineVideoUrl = cleanUrl;
      this.onlineSourceType = 'stream';
    }
    this.videoMissing = false;
    this.matchKind = kind;
    this.competitionName = competition;
    return this.onlineSourceType;
  }

  // Load sample demo match with pre-tagged futsal events (with real courtCoord & passing links)
  loadSampleDemo() {
    this.currentProjectFilePath = null;
    this.videoMissing = false;
    this.hasUnsavedChanges = false;
    this.matchKind = 'match';
    this.competitionName = 'Pro Futsal League (Demo)';
    this.secondaryAngles = [];
    this.activeAngleId = 'main';
    this.angleViewMode = 'single';
    this.videoSrc = null;
    this.videoFilePath = null;
    this.videoTitle = 'Sampel Demo: Pendekar United vs Blacksteel (Babak 1)';
    this.duration = 120;
    this.currentTime = 0;

    this.roster = [
      ...DEFAULT_FUTSAL_ROSTER.map((p) => ({ ...p })),
      { id: 'r-sub-1', num: '#6', name: 'Anchor 2', role: 'Defender / Rotation', color: '#0ea5e9' },
      { id: 'r-sub-2', num: '#10', name: 'Flank 2', role: 'Winger / Rotation', color: '#14b8a6' },
    ];
    this.periodKickoffs = [{ period: 1, videoTime: 5.0, label: 'Babak 1' }];
    this.useMatchClock = true;
    this.startingLineupIds = ['r-gk', 'r-anc', 'r-fl', 'r-fr', 'r-piv'];
    this.substitutions = [
      {
        id: 'sub-demo-1',
        atTime: 48.0,
        period: 1,
        playerOut: 'r-anc',
        playerIn: 'r-sub-1',
        teamSide: 'home',
      },
      {
        id: 'sub-demo-2',
        atTime: 52.0,
        period: 1,
        playerOut: 'r-fl',
        playerIn: 'r-sub-2',
        teamSide: 'home',
      },
    ];

    this.tags = [
      {
        id: 'tag-sample-1',
        title: 'Skema Gol Pivot',
        category: 'Goal',
        startTime: 12.0,
        endTime: 20.0,
        color: '#10b981',
        playerLabel: '#9 Pivot',
        passTargetPlayer: '#7 Flank Kiri',
        outcomeLabel: 'Gol / Sukses',
        zoneLabel: 'Area Penalti Lawan',
        courtCoord: { x: 34.5, y: 9.8 },
        rating: '⭐⭐⭐ Bagus',
        favorite: true,
        notes: 'Finishing mematikan setelah rotasi 4-0',
        pauseDuration: 3.0,
        freezeTimestamp: 16.0,
        drawings: [],
      },
      {
        id: 'tag-sample-2',
        title: 'Build-up Anchor ke Flank Kiri',
        category: 'Build-up 3-1',
        startTime: 22.0,
        endTime: 30.0,
        color: '#0ea5e9',
        playerLabel: '#4 Anchor',
        passTargetPlayer: '#7 Flank Kiri',
        outcomeLabel: 'Gol / Sukses',
        zoneLabel: 'Area Tengah',
        courtCoord: { x: 16.0, y: 10.0 },
        rating: '⭐⭐⭐ Bagus',
        favorite: false,
        notes: 'Umpan diagonal mematahkan garis pressing pertama',
        pauseDuration: 3.0,
        freezeTimestamp: 26.0,
        drawings: [],
      },
      {
        id: 'tag-sample-3',
        title: 'High Pressing Berhasil',
        category: 'Pressing High',
        startTime: 34.0,
        endTime: 42.0,
        color: '#f59e0b',
        playerLabel: '#7 Flank Kiri',
        passTargetPlayer: '#9 Pivot',
        outcomeLabel: 'Gol / Sukses',
        zoneLabel: 'Flank Kiri',
        courtCoord: { x: 25.0, y: 3.2 },
        rating: '⭐⭐⭐ Bagus',
        favorite: false,
        notes: 'Tekanan flank memaksa turnover lawan lalu umpan ke Pivot',
        pauseDuration: 3.0,
        freezeTimestamp: 38.0,
        drawings: [],
      },
      {
        id: 'tag-sample-4',
        title: 'Kebobolan Transisi Cepat',
        category: 'Transition Defense',
        startTime: 65.0,
        endTime: 73.0,
        color: '#ef4444',
        playerLabel: 'Tim Lawan',
        outcomeLabel: 'Keluar / Gagal',
        zoneLabel: 'Area Bertahan Sendiri',
        courtCoord: { x: 8.5, y: 12.0 },
        rating: '❌ Kesalahan Fatal',
        favorite: false,
        notes: 'Covering anchor terlambat saat counter attack',
        pauseDuration: 4.0,
        freezeTimestamp: 69.0,
        drawings: [],
      },
    ];

    this.playlists = [
      {
        id: 'pl-default',
        title: 'Playlist Evaluasi Demo',
        description: 'Sampel kompilasi klip evaluasi futsal',
        createdAt: new Date().toISOString(),
        items: this.tags.map((tag, idx) => ({
          id: `pl-item-${idx}`,
          tagEventId: tag.id,
          order: idx + 1,
          pauseDuration: tag.pauseDuration ?? 3.0,
          title: tag.title,
          tagEvent: tag,
        })),
      },
    ];
    this.presentationSlides = [];
    this.presentationDecks = [createDefaultDeck()];
    this.activeDeckId = 'deck-1';

    this.clearTagHistory();
    this.stage = 'tagging';
  }

  addTag(tag: VideoTagEvent) {
    this.pushTagUndoSnapshot(`Tambah "${tag.category}"`);
    const normalized = this.normalizeTagPlayers(tag);
    this.tags.push(normalized);
    if (this.playlists.length > 0) {
      this.playlists[0].items.push({
        id: `pl-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tagEventId: normalized.id,
        order: this.playlists[0].items.length + 1,
        pauseDuration: normalized.pauseDuration ?? 3.0,
        title: normalized.title,
        tagEvent: normalized,
      });
    }
    this.markDirty();
  }

  updateTag(updated: VideoTagEvent) {
    this.pushTagUndoSnapshot(`Edit "${updated.category}"`);
    const norm = this.normalizeTagPlayers(updated);
    const idx = this.tags.findIndex((t) => t.id === norm.id);
    if (idx !== -1) {
      this.tags[idx] = norm;
    }
    if (this.activeClipForDrawing?.id === norm.id) {
      this.activeClipForDrawing = norm;
    }
    for (const pl of this.playlists) {
      const pIdx = pl.items.findIndex((item) => item.tagEventId === norm.id);
      if (pIdx !== -1) {
        pl.items[pIdx].tagEvent = norm;
        pl.items[pIdx].title = norm.title;
        pl.items[pIdx].pauseDuration = norm.pauseDuration ?? 3.0;
      }
    }
    this.markDirty();
  }

  deleteTag(id: string) {
    const target = this.tags.find((t) => t.id === id);
    this.pushTagUndoSnapshot(`Hapus "${target?.category ?? 'Klip'}"`);
    this.tags = this.tags.filter((t) => t.id !== id);
    for (const pl of this.playlists) {
      pl.items = pl.items.filter((item) => item.tagEventId !== id);
    }
    if (this.activeClipForDrawing?.id === id) {
      this.activeClipForDrawing = null;
    }
    this.markDirty();
  }

  splitTag(tagId: string, splitTime: number): [VideoTagEvent, VideoTagEvent] | null {
    const idx = this.tags.findIndex((t) => t.id === tagId);
    if (idx === -1) return null;
    const orig = this.tags[idx];
    if (splitTime <= orig.startTime + 0.3 || splitTime >= orig.endTime - 0.3) {
      return null;
    }
    const splitSec = Number(splitTime.toFixed(2));
    const first: VideoTagEvent = {
      ...JSON.parse(JSON.stringify(orig)),
      endTime: splitSec,
      freezeStops: orig.freezeStops
        ? orig.freezeStops.filter((s) => s.time <= splitSec + 0.01).map((s) => ({ ...s }))
        : undefined,
      freezeTimestamp:
        typeof orig.freezeTimestamp === 'number'
          ? Math.max(orig.startTime, Math.min(splitSec, orig.freezeTimestamp))
          : undefined,
    };
    const secondId = `tag-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`;
    const second: VideoTagEvent = {
      ...JSON.parse(JSON.stringify(orig)),
      id: secondId,
      title: orig.title.includes('(Bagian 2)') ? orig.title : `${orig.title} (Bagian 2)`,
      startTime: splitSec,
      endTime: orig.endTime,
      freezeStops: orig.freezeStops
        ? orig.freezeStops.filter((s) => s.time >= splitSec - 0.01).map((s) => ({ ...s }))
        : undefined,
      freezeTimestamp:
        typeof orig.freezeTimestamp === 'number'
          ? Math.max(splitSec, Math.min(orig.endTime, orig.freezeTimestamp))
          : undefined,
    };

    this.runBatchTagMutation(`Split "${orig.category}"`, () => {
      const next = [...this.tags];
      next[idx] = first;
      next.splice(idx + 1, 0, second);
      this.tags = next;
      if (this.playlists.length > 0) {
        const pl = this.playlists[0];
        const pIdx = pl.items.findIndex((it) => it.tagEventId === first.id);
        if (pIdx !== -1) {
          pl.items[pIdx].tagEvent = first;
        }
        pl.items.splice(pIdx !== -1 ? pIdx + 1 : pl.items.length, 0, {
          id: `pl-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tagEventId: second.id,
          order: pl.items.length + 1,
          pauseDuration: second.pauseDuration ?? 3.0,
          title: second.title,
          tagEvent: second,
        });
        pl.items.forEach((it, i) => (it.order = i + 1));
      }
    });

    return [first, second];
  }

  duplicateTag(tagId: string): VideoTagEvent | null {
    const idx = this.tags.findIndex((t) => t.id === tagId);
    if (idx === -1) return null;
    const orig = this.tags[idx];
    const cloned: VideoTagEvent = {
      ...JSON.parse(JSON.stringify(orig)),
      id: `tag-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
      title: orig.title.includes('(Salinan)') ? orig.title : `${orig.title} (Salinan)`,
    };

    this.runBatchTagMutation(`Duplikat "${orig.category}"`, () => {
      const next = [...this.tags];
      next.splice(idx + 1, 0, cloned);
      this.tags = next;
      if (this.playlists.length > 0) {
        this.playlists[0].items.push({
          id: `pl-item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          tagEventId: cloned.id,
          order: this.playlists[0].items.length + 1,
          pauseDuration: cloned.pauseDuration ?? 3.0,
          title: cloned.title,
          tagEvent: cloned,
        });
      }
    });
    return cloned;
  }

  undoLastTag(): VideoTagEvent | null {
    const prevTags = [...this.tags];
    if (this.undoTags()) {
      const currIds = new Set(this.tags.map((t) => t.id));
      return prevTags.find((t) => !currIds.has(t.id)) ?? null;
    }
    if (this.tags.length === 0) return null;
    const removed = this.tags[this.tags.length - 1];
    this.deleteTag(removed.id);
    return removed;
  }

  openClipInTelestrator(clip: VideoTagEvent) {
    this.activeClipForDrawing = clip;
    this.stage = 'telestrator';
  }

  saveTelestration(
    clipId: string,
    drawings: DrawingElement[],
    pauseDuration: number,
    voiceoverAudioBase64?: string,
    freezeTimestamp?: number,
    subtitleMeta?: {
      transcript?: string;
      cues?: SubtitleCue[];
      burnSubtitle?: boolean;
    },
    freezeMeta?: {
      freezeStops?: FreezeStop[];
      speedSegments?: SpeedSegment[];
      appendCleanReplay?: boolean;
    }
  ) {
    const tag = this.tags.find((t) => t.id === clipId);
    if (tag) {
      const sortedStops = freezeMeta?.freezeStops
        ? [...freezeMeta.freezeStops]
            .map((s) => ({ ...s }))
            .sort((a, b) => a.time - b.time)
        : undefined;
      const sortedSpeeds = freezeMeta?.speedSegments
        ? [...freezeMeta.speedSegments]
            .map((s) => ({ ...s }))
            .sort((a, b) => a.startTime - b.startTime)
        : undefined;
      const firstStop = sortedStops && sortedStops.length > 0 ? sortedStops[0] : null;
      const updated: VideoTagEvent = {
        ...tag,
        drawings: JSON.parse(JSON.stringify(drawings)),
        pauseDuration: firstStop ? firstStop.duration : pauseDuration,
        freezeTimestamp:
          firstStop?.time ?? freezeTimestamp ?? tag.freezeTimestamp ?? (tag.startTime + tag.endTime) / 2,
      };
      if (freezeMeta?.freezeStops !== undefined) {
        updated.freezeStops = sortedStops;
      }
      if (freezeMeta?.speedSegments !== undefined) {
        updated.speedSegments = sortedSpeeds;
      }
      if (freezeMeta?.appendCleanReplay !== undefined) {
        updated.appendCleanReplay = freezeMeta.appendCleanReplay;
      }
      if (voiceoverAudioBase64 !== undefined) {
        updated.voiceoverAudioBase64 = voiceoverAudioBase64;
      }
      if (subtitleMeta) {
        updated.voiceoverTranscript = subtitleMeta.transcript;
        updated.subtitleCues = subtitleMeta.cues ? [...subtitleMeta.cues] : [];
        updated.burnSubtitle = subtitleMeta.burnSubtitle;
      }
      this.updateTag(updated);
    }
  }

  saveAndNextClip(
    clipId: string,
    drawings: DrawingElement[],
    pauseDuration: number,
    voiceoverAudioBase64?: string,
    freezeTimestamp?: number,
    subtitleMeta?: {
      transcript?: string;
      cues?: SubtitleCue[];
      burnSubtitle?: boolean;
    },
    freezeMeta?: {
      freezeStops?: FreezeStop[];
      speedSegments?: SpeedSegment[];
      appendCleanReplay?: boolean;
    }
  ) {
    this.saveTelestration(
      clipId,
      drawings,
      pauseDuration,
      voiceoverAudioBase64,
      freezeTimestamp,
      subtitleMeta,
      freezeMeta
    );
    const currIdx = this.tags.findIndex((t) => t.id === clipId);
    if (currIdx !== -1 && currIdx + 1 < this.tags.length) {
      this.activeClipForDrawing = this.tags[currIdx + 1];
    } else {
      this.stage = 'playlist_export';
    }
  }

  addToPlaylist(clip: VideoTagEvent, playlistId?: string) {
    const targetPl = playlistId
      ? this.playlists.find((p) => p.id === playlistId)
      : this.playlists[0];

    if (targetPl) {
      const existing = targetPl.items.find((item) => item.tagEventId === clip.id);
      if (!existing) {
        targetPl.items.push({
          id: `pl-item-${Date.now()}`,
          tagEventId: clip.id,
          order: targetPl.items.length + 1,
          pauseDuration: clip.pauseDuration ?? 3.0,
          title: clip.title,
          tagEvent: clip,
        });
      }
    }
  }

  get activeDeck(): PresentationDeck {
    return this.presentationDecks.find((d) => d.id === this.activeDeckId) || this.presentationDecks[0];
  }

  private syncActiveDeckSlides() {
    const deck = this.activeDeck;
    if (deck) {
      this.presentationSlides = deck.slides;
    }
  }

  selectPresentationDeck(id: string) {
    if (this.presentationDecks.some((d) => d.id === id)) {
      this.activeDeckId = id;
      this.syncActiveDeckSlides();
    }
  }

  createPresentationDeck(title?: string): PresentationDeck {
    const fresh = createDefaultDeck(
      `deck-${Date.now()}`,
      title?.trim() || `Presentasi ${this.presentationDecks.length + 1}`
    );
    this.presentationDecks = [...this.presentationDecks, fresh];
    this.activeDeckId = fresh.id;
    this.syncActiveDeckSlides();
    this.markDirty();
    return fresh;
  }

  renamePresentationDeck(id: string, title: string) {
    const clean = title.trim();
    if (!clean) return;
    const deck = this.presentationDecks.find((d) => d.id === id);
    if (!deck) return;
    deck.title = clean;
    this.markDirty();
  }

  deletePresentationDeck(id: string): boolean {
    if (this.presentationDecks.length <= 1) return false;
    const next = this.presentationDecks.filter((d) => d.id !== id);
    if (next.length === this.presentationDecks.length) return false;
    this.presentationDecks = next;
    if (this.activeDeckId === id) {
      this.activeDeckId = next[0].id;
    }
    this.syncActiveDeckSlides();
    this.markDirty();
    return true;
  }

  setActiveDeckTitleCard(enabled: boolean, durationSec = 2) {
    const deck = this.activeDeck;
    if (!deck) return;
    deck.showTitleCardBeforeClip = enabled;
    deck.titleCardDurationSec = Math.max(0.5, Math.min(10, durationSec));
    this.markDirty();
  }

  addClipsToActiveDeck(clips: ResolvedPlaylistClip[]) {
    const deck = this.activeDeck;
    if (!deck || clips.length === 0) return;
    const added: PresentationSlide[] = clips.map((c, idx) => ({
      id: `slide-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      kind: 'clip',
      title: c.tag.title,
      tag: JSON.parse(JSON.stringify(c.tag)),
      matchId: c.matchId,
      matchTitle: c.matchTitle,
      videoFilePath: c.videoFilePath,
      videoSrc: c.videoSrc,
      chromaFloorConfig: c.chromaFloorConfig,
      showTelestration: c.useTelestration,
    }));
    deck.slides = [...deck.slides, ...added];
    this.syncActiveDeckSlides();
    this.markDirty();
  }

  addTitleSlideToActiveDeck(title: string, subtitle = '', bgColor = '#0f172a') {
    const deck = this.activeDeck;
    if (!deck || !title.trim()) return;
    deck.slides = [
      ...deck.slides,
      {
        id: `title-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        kind: 'title',
        title: title.trim(),
        subtitle: subtitle.trim() || undefined,
        bgColor,
      },
    ];
    this.syncActiveDeckSlides();
    this.markDirty();
  }

  addImageSlideToActiveDeck(title: string, imageDataUrl: string, caption = '') {
    const deck = this.activeDeck;
    if (!deck || !imageDataUrl) return;
    deck.slides = [
      ...deck.slides,
      {
        id: `img-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        kind: 'image',
        title: title.trim() || 'Slide Gambar',
        imageDataUrl,
        caption: caption.trim() || undefined,
      },
    ];
    this.syncActiveDeckSlides();
    this.markDirty();
  }

  addExternalVideoSlideToActiveDeck(
    title: string,
    videoFilePath: string | null,
    videoSrc: string,
    durationSec: number
  ) {
    const deck = this.activeDeck;
    if (!deck) return;
    const dur = Math.max(1, durationSec || 10);
    deck.slides = [
      ...deck.slides,
      {
        id: `extvid-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        kind: 'clip',
        title: title.trim() || 'Video Sisipan',
        videoFilePath,
        videoSrc,
        showTelestration: false,
        tag: {
          id: `exttag-${Date.now()}`,
          title: title.trim() || 'Video Sisipan',
          category: 'Video Sisipan',
          startTime: 0,
          endTime: dur,
          color: '#38bdf8',
          playerLabel: '',
          drawings: [],
        },
      },
    ];
    this.syncActiveDeckSlides();
    this.markDirty();
  }

  moveActiveDeckSlide(index: number, delta: -1 | 1) {
    const deck = this.activeDeck;
    if (!deck) return;
    const nextIdx = index + delta;
    if (index < 0 || index >= deck.slides.length || nextIdx < 0 || nextIdx >= deck.slides.length) return;
    const arr = [...deck.slides];
    const [item] = arr.splice(index, 1);
    arr.splice(nextIdx, 0, item);
    deck.slides = arr;
    this.syncActiveDeckSlides();
    this.markDirty();
  }

  removeActiveDeckSlide(slideId: string) {
    const deck = this.activeDeck;
    if (!deck) return;
    deck.slides = deck.slides.filter((s) => s.id !== slideId);
    this.syncActiveDeckSlides();
    this.markDirty();
  }

  toggleActiveDeckClipTelestration(slideId: string) {
    const deck = this.activeDeck;
    if (!deck) return;
    deck.slides = deck.slides.map((s) =>
      s.id === slideId && s.kind === 'clip' ? { ...s, showTelestration: s.showTelestration === false } : s
    );
    this.syncActiveDeckSlides();
    this.markDirty();
  }

  exportProjectJson(): string {
    const projectData = {
      format: 'futsaltag-project',
      version: '1.2',
      exportedAt: new Date().toISOString(),
      matchInfo: {
        title: this.videoTitle,
        duration: this.duration,
        videoFilePath: this.videoFilePath,
        onlineVideoUrl: this.onlineVideoUrl,
        onlineSourceType: this.onlineSourceType,
        matchKind: this.matchKind,
        competition: this.competitionName,
        matchDate: this.matchDate,
      },
      roster: this.roster,
      calibrationPoints: this.calibrationPoints,
      chromaFloorConfig: this.chromaFloorConfig,
      periodKickoffs: this.periodKickoffs,
      useMatchClock: this.useMatchClock,
      startingLineupIds: this.startingLineupIds,
      substitutions: this.substitutions,
      boards: this.boards,
      activeBoardId: this.activeBoardId,
      tags: this.tags,
      playlists: this.playlists,
      presentationSlides: this.presentationSlides,
      presentationDecks: this.presentationDecks,
      activeDeckId: this.activeDeckId,
      clubLogoDataUrl: this.clubLogoDataUrl,
      watermarkConfig: this.watermarkConfig,
      secondaryAngles: this.secondaryAngles.map((a) => ({
        id: a.id,
        name: a.name,
        filePath: a.filePath,
        offsetSec: a.offsetSec,
      })),
    };
    return JSON.stringify(projectData, null, 2);
  }

  recordRecentProject(filePath: string) {
    if (!filePath) return;
    const norm = this.normalizePathKey(filePath);
    const entry: RecentProjectEntry = {
      filePath,
      title: this.videoTitle || filePath.split(/[\\/]/).pop() || 'Proyek Futsal',
      matchKind: this.matchKind,
      competition: this.competitionName || undefined,
      tagCount: this.tags.length,
      openedAt: new Date().toISOString(),
    };
    const next = [
      entry,
      ...this.recentProjects.filter((r) => this.normalizePathKey(r.filePath) !== norm),
    ].slice(0, 10);
    this.recentProjects = next;
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('futsaltag_recent_projects_v1', JSON.stringify(next));
      } catch {
        // Ignore storage quota errors
      }
    }
  }

  async saveProjectToDisk(forceSaveAs = false): Promise<string | null> {
    const json = this.exportProjectJson();
    const safeName = (this.videoTitle || 'proyek_futsal')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();

    if (isTauriDesktop()) {
      const joinDir = (dir: string, file: string) => {
        const sep =
          dir.endsWith('/') || dir.endsWith('\\')
            ? ''
            : dir.includes('\\') && !dir.includes('/')
              ? '\\'
              : '/';
        return `${dir}${sep}${file}`;
      };
      let targetPath = !forceSaveAs ? this.currentProjectFilePath : null;
      if (!forceSaveAs && !targetPath) {
        if (!this.matchLibraryFolder) {
          await this.scanMatchLibrary().catch(() => 0);
        }
        if (this.matchLibraryFolder) {
          targetPath = joinDir(this.matchLibraryFolder, `${safeName}.futsal`);
        }
      }
      if (!targetPath) {
        const { save } = await import('@tauri-apps/plugin-dialog');
        const defaultPath = this.matchLibraryFolder
          ? joinDir(this.matchLibraryFolder, `${safeName}.futsal`)
          : `${safeName}.futsal`;
        targetPath = await save({
          title: forceSaveAs ? 'Simpan Proyek Sebagai...' : 'Simpan Proyek ARF FutsalTag',
          defaultPath,
          filters: [{ name: 'ARF FutsalTag Project', extensions: ['futsal', 'json'] }],
        });
      }
      if (!targetPath) return null;
      await invoke<string>('save_project_file', { filePath: targetPath, content: json });
      this.currentProjectFilePath = targetPath;
      this.hasUnsavedChanges = false;
      await this.clearAutoSave();
      this.recordRecentProject(targetPath);
      if (this.matchLibraryFolder) {
        this.scanMatchLibrary().catch(() => {});
      }
      return targetPath;
    }

    this.downloadProjectFile(safeName);
    this.hasUnsavedChanges = false;
    await this.clearAutoSave();
    return `${safeName}.futsal`;
  }

  async openProjectFromPath(filePath: string): Promise<boolean> {
    if (!isTauriDesktop() || !filePath) return false;
    const content = await invoke<string>('load_project_file', { filePath });
    const ok = this.importProjectJson(content);
    if (ok) {
      this.currentProjectFilePath = filePath;
      this.recordRecentProject(filePath);
    }
    return ok;
  }

  async openProjectFromDisk(): Promise<boolean> {
    if (!isTauriDesktop()) return false;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      title: 'Buka Proyek ARF FutsalTag',
      multiple: false,
      filters: [{ name: 'ARF FutsalTag Project', extensions: ['futsal', 'json'] }],
    });
    if (!selected || typeof selected !== 'string') return false;
    return this.openProjectFromPath(selected);
  }

  downloadProjectFile(filename?: string) {
    const json = this.exportProjectJson();
    const name = (filename || this.videoTitle || 'proyek_futsal')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.futsal`;
    a.click();
    URL.revokeObjectURL(url);
  }

  importProjectJson(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (data.matchInfo) {
        this.videoTitle = data.matchInfo.title || this.videoTitle;
        this.duration = data.matchInfo.duration || this.duration;
        this.videoFilePath = data.matchInfo.videoFilePath || null;
        this.onlineVideoUrl =
          typeof data.matchInfo.onlineVideoUrl === 'string' ? data.matchInfo.onlineVideoUrl : null;
        this.onlineSourceType =
          data.matchInfo.onlineSourceType === 'youtube' || data.matchInfo.onlineSourceType === 'stream'
            ? data.matchInfo.onlineSourceType
            : null;
        this.matchKind = data.matchInfo.matchKind === 'training' ? 'training' : 'match';
        this.competitionName = typeof data.matchInfo.competition === 'string' ? data.matchInfo.competition : '';
        this.matchDate =
          typeof data.matchInfo.matchDate === 'string'
            ? data.matchInfo.matchDate
            : new Date().toISOString().slice(0, 10);
        this.videoMissing = false;
        const isAbs =
          this.videoFilePath &&
          isTauriDesktop() &&
          (this.videoFilePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(this.videoFilePath));
        if (isAbs && this.videoFilePath) {
          this.videoSrc = convertFileSrc(this.videoFilePath);
          const checkPath = this.videoFilePath;
          invoke<boolean>('check_file_exists', { filePath: checkPath })
            .then((exists) => {
              if (this.videoFilePath === checkPath) {
                this.videoMissing = !exists;
              }
            })
            .catch(() => {});
        } else if (this.onlineSourceType === 'stream' && this.onlineVideoUrl) {
          this.videoSrc = this.onlineVideoUrl;
        } else {
          this.videoSrc = null;
        }
      }
      if (Array.isArray(data.roster) && data.roster.length > 0) {
        this.roster = data.roster;
      }
      if (data.calibrationPoints) {
        this.calibrationPoints = data.calibrationPoints;
      }
      if (data.chromaFloorConfig) {
        this.chromaFloorConfig = {
          enabled: Boolean(data.chromaFloorConfig.enabled),
          mode: data.chromaFloorConfig.mode === 'chroma-key' ? 'chroma-key' : 'ai-silhouette',
          targetRgb: Array.isArray(data.chromaFloorConfig.targetRgb)
            ? data.chromaFloorConfig.targetRgb
            : [34, 98, 152],
          tolerance: Number(data.chromaFloorConfig.tolerance) || 32,
          feather: Number(data.chromaFloorConfig.feather) || 10,
        };
      }
      if (Array.isArray(data.boards) && data.boards.length > 0) {
        const merged = [...loadInitialBoards()];
        for (const incoming of data.boards) {
          if (!incoming || typeof incoming.id !== 'string' || !Array.isArray(incoming.buttons)) continue;
          const cloned = cloneBoard(incoming);
          const idx = merged.findIndex((b) => b.id === cloned.id);
          if (idx !== -1) {
            merged[idx] = cloned;
          } else {
            merged.push(cloned);
          }
        }
        this.boards = merged;
      }
      if (typeof data.activeBoardId === 'string' && this.boards.some((b) => b.id === data.activeBoardId)) {
        this.activeBoardId = data.activeBoardId;
      } else {
        this.activeBoardId = this.boards.some((b) => b.id === this.defaultBoardId)
          ? this.defaultBoardId
          : this.boards[0].id;
      }
      if (Array.isArray(data.tags)) {
        this.tags = data.tags.map((t: VideoTagEvent) => this.normalizeTagPlayers(t));
      }
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        this.playlists = data.playlists;
      }
      this.presentationSlides = Array.isArray(data.presentationSlides) ? data.presentationSlides : [];
      if (Array.isArray(data.presentationDecks) && data.presentationDecks.length > 0) {
        this.presentationDecks = data.presentationDecks.map((d: any, i: number) => ({
          id: typeof d?.id === 'string' ? d.id : `deck-${i + 1}`,
          title: typeof d?.title === 'string' ? d.title : `Presentasi ${i + 1}`,
          showTitleCardBeforeClip: Boolean(d?.showTitleCardBeforeClip),
          titleCardDurationSec: Number(d?.titleCardDurationSec) || 2,
          slides: Array.isArray(d?.slides) ? d.slides : [],
        }));
        this.activeDeckId =
          typeof data.activeDeckId === 'string' && this.presentationDecks.some((d) => d.id === data.activeDeckId)
            ? data.activeDeckId
            : this.presentationDecks[0].id;
      } else {
        this.presentationDecks = [
          {
            ...createDefaultDeck(),
            slides: [...this.presentationSlides],
          },
        ];
        this.activeDeckId = 'deck-1';
      }
      this.clubLogoDataUrl = typeof data.clubLogoDataUrl === 'string' ? data.clubLogoDataUrl : null;
      if (data.watermarkConfig && typeof data.watermarkConfig === 'object') {
        const wc = data.watermarkConfig;
        const pos = wc.position;
        this.watermarkConfig = {
          enabled: typeof wc.enabled === 'boolean' ? wc.enabled : true,
          position:
            pos === 'top-left' || pos === 'bottom-right' || pos === 'bottom-left' || pos === 'top-right'
              ? pos
              : 'top-right',
          opacity: typeof wc.opacity === 'number' ? Math.max(0.15, Math.min(1, wc.opacity)) : 0.78,
          scaleRatio:
            typeof wc.scaleRatio === 'number' ? Math.max(0.04, Math.min(0.25, wc.scaleRatio)) : 0.09,
        };
      } else {
        this.watermarkConfig = { enabled: true, position: 'top-right', opacity: 0.78, scaleRatio: 0.09 };
      }
      this.secondaryAngles = Array.isArray(data.secondaryAngles)
        ? data.secondaryAngles.map((a: any, idx: number) => {
            const fp = typeof a?.filePath === 'string' ? a.filePath : null;
            const isAbs = fp && isTauriDesktop() && (fp.startsWith('/') || /^[A-Za-z]:[\\/]/.test(fp));
            return {
              id: typeof a?.id === 'string' ? a.id : `cam_${Date.now()}_${idx}`,
              name: typeof a?.name === 'string' ? a.name : `Kamera ${idx + 2}`,
              filePath: fp,
              videoSrc: isAbs && fp ? convertFileSrc(fp) : null,
              offsetSec: Number(a?.offsetSec) || 0,
            };
          })
        : [];
      this.activeAngleId = 'main';
      this.angleViewMode = 'single';
      this.periodKickoffs = Array.isArray(data.periodKickoffs) ? data.periodKickoffs : [];
      this.useMatchClock = Boolean(data.useMatchClock && this.periodKickoffs.length > 0);
      if (Array.isArray(data.startingLineupIds) && data.startingLineupIds.length > 0) {
        this.startingLineupIds = data.startingLineupIds;
      } else {
        this.startingLineupIds = this.roster
          .filter((p) => !p.isOpponent)
          .slice(0, 5)
          .map((p) => p.id);
      }
      this.substitutions = Array.isArray(data.substitutions) ? data.substitutions : [];
      this.hasUnsavedChanges = false;
      this.clearTagHistory();
      this.stage = 'tagging';
      return true;
    } catch (err) {
      console.error('Gagal memuat berkas proyek:', err);
      return false;
    }
  }

  parseProjectForMerge(jsonStr: string): any | null {
    try {
      const data = JSON.parse(jsonStr);
      if (!data || typeof data !== 'object') return null;
      if (!Array.isArray(data.tags) && !Array.isArray(data.roster)) return null;
      return data;
    } catch {
      return null;
    }
  }

  calculateMergeOffset(sourceProject: any, options: MergeProjectOptions): number {
    if (!sourceProject) return 0;
    if (options.syncMethod === 'none') {
      return 0;
    }
    if (options.syncMethod === 'manual_offset') {
      return Number(options.manualOffsetSec || 0);
    }
    if (options.syncMethod === 'kickoff') {
      const p = options.referencePeriod || 1;
      const targetKickoff = this.periodKickoffs.find((k) => k.period === p);
      const sourceKickoffList = Array.isArray(sourceProject.periodKickoffs)
        ? sourceProject.periodKickoffs
        : [];
      const sourceKickoff = sourceKickoffList.find((k: any) => k.period === p);
      if (targetKickoff && sourceKickoff) {
        return Number((targetKickoff.videoTime - sourceKickoff.videoTime).toFixed(2));
      }
      return Number(options.manualOffsetSec || 0);
    }
    if (options.syncMethod === 'anchor_tag') {
      const targetTag = this.tags.find((t) => t.id === options.targetAnchorTagId);
      const sourceTags = Array.isArray(sourceProject.tags) ? sourceProject.tags : [];
      const sourceTag = sourceTags.find((t: any) => t.id === options.sourceAnchorTagId);
      if (targetTag && sourceTag) {
        return Number((targetTag.startTime - sourceTag.startTime).toFixed(2));
      }
      return 0;
    }
    return 0;
  }

  calculateMergePreview(sourceProject: any, options: MergeProjectOptions): MergeProjectPreview {
    const emptyPreview: MergeProjectPreview = {
      sourceTitle: 'Tidak Diketahui',
      sourceAnalyst: undefined,
      totalSourceTags: 0,
      tagsToMergeCount: 0,
      calculatedOffsetSec: 0,
      duplicateCount: 0,
      newCategoriesCount: 0,
      rosterAdditionsCount: 0,
      availableCategories: [],
    };
    if (!sourceProject) return emptyPreview;

    const sourceTags: VideoTagEvent[] = Array.isArray(sourceProject.tags) ? sourceProject.tags : [];
    const sourceTitle = sourceProject.matchInfo?.title || 'Proyek Eksternal';
    const sourceAnalyst = options.analystName || sourceProject.analystName || 'Analis Laptop Lain';
    const offset = this.calculateMergeOffset(sourceProject, options);
    const tol = options.duplicateToleranceSec ?? 1.5;

    const catSet = new Set<string>();
    sourceTags.forEach((t) => {
      if (t.category) catSet.add(t.category);
    });
    const availableCategories = Array.from(catSet);

    const activeCategories = this.activeBoard?.buttons.map((b) => b.name) || [];
    const currentTagCategories = new Set(this.tags.map((t) => t.category));
    let newCategoriesCount = 0;
    for (const c of availableCategories) {
      if (!currentTagCategories.has(c as any) && !activeCategories.includes(c)) {
        newCategoriesCount++;
      }
    }

    const filtered = sourceTags.filter((t) => {
      if (options.categoryFilter !== undefined) {
        return options.categoryFilter.includes(t.category);
      }
      return true;
    });

    let duplicateCount = 0;
    for (const st of filtered) {
      const shiftedStart = Math.max(0, st.startTime + offset);
      const isDup = this.tags.some(
        (tt) =>
          tt.category === st.category &&
          Math.abs(tt.startTime - shiftedStart) <= tol
      );
      if (isDup) duplicateCount++;
    }

    let rosterAdditionsCount = 0;
    if (options.mergeRoster && Array.isArray(sourceProject.roster)) {
      const myRosterKeys = new Set(this.roster.map((p) => `${p.num}_${p.name.toLowerCase()}`));
      for (const sp of sourceProject.roster) {
        const key = `${sp.num}_${(sp.name || '').toLowerCase()}`;
        if (!myRosterKeys.has(key)) rosterAdditionsCount++;
      }
    }

    const tagsToMergeCount =
      options.duplicateStrategy === 'skip_duplicate'
        ? filtered.length - duplicateCount
        : filtered.length;

    return {
      sourceTitle,
      sourceAnalyst,
      totalSourceTags: sourceTags.length,
      tagsToMergeCount: Math.max(0, tagsToMergeCount),
      calculatedOffsetSec: offset,
      duplicateCount,
      newCategoriesCount,
      rosterAdditionsCount,
      availableCategories,
    };
  }

  mergeProjectData(sourceProject: any, options: MergeProjectOptions): {
    mergedCount: number;
    skippedCount: number;
    newRosterCount: number;
  } {
    if (!sourceProject || !Array.isArray(sourceProject.tags)) {
      return { mergedCount: 0, skippedCount: 0, newRosterCount: 0 };
    }

    const sourceTags: VideoTagEvent[] = sourceProject.tags;
    const offset = this.calculateMergeOffset(sourceProject, options);
    const tol = options.duplicateToleranceSec ?? 1.5;
    const analyst = options.analystName?.trim() || sourceProject.analystName || 'Analis Laptop Lain';
    const prefix = options.tagTitlePrefix?.trim() || '';

    let mergedCount = 0;
    let skippedCount = 0;
    let newRosterCount = 0;

    const label = `Gabung ${sourceTags.length} Tag dari ${analyst} (${offset >= 0 ? '+' : ''}${offset.toFixed(1)}s)`;

    this.runBatchTagMutation(label, () => {
      const originalTags = [...this.tags];
      let currentTags = [...this.tags];
      const tagIdMap = new Map<string, string>();
      const baseTs = Date.now();

      sourceTags.forEach((st, idx) => {
        if (options.categoryFilter !== undefined) {
          if (!options.categoryFilter.includes(st.category)) {
            skippedCount++;
            return;
          }
        }

        const shiftedStart = Number(Math.max(0, st.startTime + offset).toFixed(2));
        const originalDur = Math.max(0.2, (st.endTime ?? st.startTime + 2) - st.startTime);
        const shiftedEnd = Number(Math.max(shiftedStart + 0.2, (st.endTime ?? st.startTime + 2) + offset).toFixed(2));
        const actualDur = shiftedEnd - shiftedStart;
        const finalEnd = actualDur < 0.2 ? Number((shiftedStart + originalDur).toFixed(2)) : shiftedEnd;

        // Compare duplicates against pre-merge tags snapshot
        const originalDup = originalTags.find(
          (t) => t.category === st.category && Math.abs(t.startTime - shiftedStart) <= tol
        );

        if (originalDup) {
          if (options.duplicateStrategy === 'skip_duplicate') {
            tagIdMap.set(st.id, originalDup.id);
            skippedCount++;
            return;
          }
          if (options.duplicateStrategy === 'overwrite_existing') {
            const idxInCur = currentTags.findIndex((t) => t.id === originalDup.id);
            if (idxInCur !== -1) currentTags.splice(idxInCur, 1);
          }
        }

        // Clone tag with shifted times and analyst attribution
        const newId = `tag_${baseTs}_${idx}_${Math.random().toString(36).slice(2, 6)}`;
        tagIdMap.set(st.id, newId);
        const newTitle = prefix ? `[${prefix}] ${st.title || st.category}` : (st.title || st.category);

        const shiftedLabels = st.labels?.map((l) => ({
          ...l,
          atTime: Number(Math.max(0, l.atTime + offset).toFixed(2)),
        }));
        const shiftedStops = st.freezeStops?.map((s) => ({
          ...s,
          time: Number(Math.max(0, s.time + offset).toFixed(2)),
        }));
        const shiftedDrawings = st.drawings?.map((d) => ({
          ...d,
          timeStart: typeof d.timeStart === 'number' ? Number(Math.max(0, d.timeStart + offset).toFixed(2)) : d.timeStart,
          timeEnd: typeof d.timeEnd === 'number' ? Number(Math.max(0, d.timeEnd + offset).toFixed(2)) : d.timeEnd,
          keyframes: d.keyframes?.map((k) => ({
            ...k,
            time: Number(Math.max(0, k.time + offset).toFixed(2)),
          })),
          manualPins: d.manualPins?.map((k) => ({
            ...k,
            time: Number(Math.max(0, k.time + offset).toFixed(2)),
          })),
        }));

        const newTag: VideoTagEvent = {
          ...st,
          id: newId,
          title: newTitle,
          startTime: shiftedStart,
          endTime: finalEnd,
          freezeTimestamp: typeof st.freezeTimestamp === 'number' ? Number(Math.max(0, st.freezeTimestamp + offset).toFixed(2)) : st.freezeTimestamp,
          labels: shiftedLabels,
          freezeStops: shiftedStops,
          drawings: shiftedDrawings,
          analystName: analyst,
          sourceProjectId: sourceProject.matchInfo?.title || 'ExternalProject',
        };

        currentTags.push(newTag);
        mergedCount++;
      });

      // Sort tags chronologically by startTime
      currentTags.sort((a, b) => a.startTime - b.startTime);
      this.tags = currentTags;

      // Inherit period kickoffs if active project has none yet
      if (this.periodKickoffs.length === 0 && Array.isArray(sourceProject.periodKickoffs) && sourceProject.periodKickoffs.length > 0) {
        this.periodKickoffs = sourceProject.periodKickoffs.map((k: PeriodKickoff) => ({
          ...k,
          videoTime: Number(Math.max(0, k.videoTime + offset).toFixed(2)),
        }));
        this.useMatchClock = Boolean(sourceProject.useMatchClock || this.periodKickoffs.length > 0);
      }

      // Merge Roster if opted
      if (options.mergeRoster && Array.isArray(sourceProject.roster)) {
        const myRosterKeys = new Set(this.roster.map((p) => `${p.num}_${p.name.toLowerCase()}`));
        const rosterToAdd: RosterPlayer[] = [];
        for (let rIdx = 0; rIdx < sourceProject.roster.length; rIdx++) {
          const sp = sourceProject.roster[rIdx];
          const key = `${sp.num}_${(sp.name || '').toLowerCase()}`;
          if (!myRosterKeys.has(key)) {
            rosterToAdd.push({
              ...sp,
              id: `r_merged_${baseTs}_${rIdx}_${Math.random().toString(36).slice(2, 5)}`,
            });
            myRosterKeys.add(key);
            newRosterCount++;
          }
        }
        if (rosterToAdd.length > 0) {
          this.roster = [...this.roster, ...rosterToAdd];
        }
      }

      // Merge Playlists if opted (ActionPlaylist uses items: ActionPlaylistItem[])
      if (options.mergePlaylists && Array.isArray(sourceProject.playlists)) {
        const currentTagMap = new Map(this.tags.map((t) => [t.id, t]));
        const existingPlNames = new Set(this.playlists.map((pl) => pl.title.toLowerCase()));
        sourceProject.playlists.forEach((pl: any, plIdx: number) => {
          const rawItems = Array.isArray(pl?.items) ? pl.items : [];
          if (rawItems.length === 0) return;

          const remappedItems: any[] = [];
          for (const item of rawItems) {
            const origTagId = item?.tagEventId || item?.tagEvent?.id;
            const mappedId = origTagId ? tagIdMap.get(origTagId) : undefined;
            const tagObj = mappedId ? currentTagMap.get(mappedId) : undefined;
            if (!mappedId || !tagObj) continue;
            remappedItems.push({
              id: `pli_merged_${baseTs}_${plIdx}_${remappedItems.length}`,
              tagEventId: mappedId,
              order: remappedItems.length + 1,
              pauseDuration: tagObj.pauseDuration ?? item.pauseDuration ?? 3.0,
              title: tagObj.title,
              tagEvent: tagObj,
            });
          }

          if (remappedItems.length > 0) {
            const baseTitle = pl.title || `Playlist ${plIdx + 1}`;
            const finalTitle = existingPlNames.has(baseTitle.toLowerCase())
              ? `${baseTitle} (${analyst})`
              : `${baseTitle} (${analyst})`;
            this.playlists = [
              ...this.playlists,
              {
                id: `pl_merged_${baseTs}_${plIdx}`,
                title: finalTitle,
                description: pl.description || `Digabung dari ${analyst}`,
                createdAt: new Date().toISOString(),
                items: remappedItems,
              },
            ];
            existingPlNames.add(finalTitle.toLowerCase());
          }
        });
      }

      this.syncPlaylistsAfterTagsRestore();
    });

    this.markDirty();
    return { mergedCount, skippedCount, newRosterCount };
  }

  async runAutoSave(): Promise<boolean> {
    if (!this.hasUnsavedChanges || (this.tags.length === 0 && !this.videoSrc)) return false;
    try {
      const json = this.exportProjectJson();
      if (isTauriDesktop() && this.currentProjectFilePath) {
        await invoke<string>('save_project_file', {
          filePath: this.currentProjectFilePath,
          content: json,
        });
        this.hasUnsavedChanges = false;
        await this.clearAutoSave();
        const d = new Date();
        this.lastAutoSaveAt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
        return true;
      }
      const autoSavePayload = JSON.stringify({
        ...JSON.parse(json),
        sourceProjectFilePath: this.currentProjectFilePath,
      });
      if (isTauriDesktop()) {
        await invoke<string>('save_autosave_project', { content: autoSavePayload });
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem('futsaltag_autosave_v1', autoSavePayload);
      }
      const d = new Date();
      this.lastAutoSaveAt = `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
      return true;
    } catch {
      return false;
    }
  }

  async checkAutoSaveRecovery(): Promise<void> {
    try {
      let raw: string | null = null;
      if (isTauriDesktop()) {
        raw = await invoke<string | null>('load_autosave_project');
      } else if (typeof localStorage !== 'undefined') {
        raw = localStorage.getItem('futsaltag_autosave_v1');
      }
      if (!raw) return;
      const data = JSON.parse(raw);
      if (Array.isArray(data?.tags) && data.tags.length > 0) {
        this.autoSaveMeta = {
          title: data.matchInfo?.title || 'Proyek Futsal',
          tagCount: data.tags.length,
          savedAt: data.exportedAt || '',
        };
      }
    } catch {
      // Ignore corrupt autosave
    }
  }

  async restoreAutoSave(): Promise<boolean> {
    try {
      let raw: string | null = null;
      if (isTauriDesktop()) {
        raw = await invoke<string | null>('load_autosave_project');
      } else if (typeof localStorage !== 'undefined') {
        raw = localStorage.getItem('futsaltag_autosave_v1');
      }
      if (!raw) return false;
      const ok = this.importProjectJson(raw);
      if (ok) {
        const parsed = JSON.parse(raw);
        if (typeof parsed?.sourceProjectFilePath === 'string' && parsed.sourceProjectFilePath.trim()) {
          this.currentProjectFilePath = parsed.sourceProjectFilePath.trim();
        }
        this.autoSaveMeta = null;
      }
      return ok;
    } catch {
      return false;
    }
  }

  async clearAutoSave(): Promise<void> {
    this.autoSaveMeta = null;
    try {
      if (isTauriDesktop()) {
        await invoke('clear_autosave_project');
      } else if (typeof localStorage !== 'undefined') {
        localStorage.removeItem('futsaltag_autosave_v1');
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  resetProject() {
    this.currentProjectFilePath = null;
    this.videoSrc = null;
    this.videoFilePath = null;
    this.onlineVideoUrl = null;
    this.onlineSourceType = null;
    this.liveCaptureActive = false;
    this.liveCaptureTargetPath = null;
    this.videoTitle = 'Pertandingan Futsal Baru';
    this.roster = DEFAULT_FUTSAL_ROSTER.map((p) => ({ ...p }));
    this.calibrationPoints = null;
    this.tags = [];
    this.activeClipForDrawing = null;
    this.periodKickoffs = [];
    this.useMatchClock = false;
    this.substitutions = [];
    this.chromaFloorConfig = { ...this.chromaFloorConfig, enabled: false };
    this.startingLineupIds = this.roster
      .filter((p) => !p.isOpponent)
      .slice(0, 5)
      .map((p) => p.id);
    this.playlists = [
      {
        id: 'pl-default',
        title: 'Playlist Pertandingan',
        description: 'Daftar klip analisis',
        createdAt: new Date().toISOString(),
        items: [],
      },
    ];
    this.presentationSlides = [];
    this.presentationDecks = [createDefaultDeck()];
    this.activeDeckId = 'deck-1';
    this.clubLogoDataUrl = null;
    this.watermarkConfig = { enabled: true, position: 'top-right', opacity: 0.78, scaleRatio: 0.09 };
    this.matchKind = 'match';
    this.competitionName = '';
    this.videoMissing = false;
    this.hasUnsavedChanges = false;
    this.secondaryAngles = [];
    this.activeAngleId = 'main';
    this.angleViewMode = 'single';
    this.currentTime = 0;
    this.activeBoardId = this.boards.some((b) => b.id === this.defaultBoardId)
      ? this.defaultBoardId
      : this.boards[0].id;
    this.clearTagHistory();
    this.stage = 'hub';
  }

  confirmDiscardIfDirty(actionLabel = 'melanjutkan'): boolean {
    if (!this.hasUnsavedChanges || (this.tags.length === 0 && !this.videoSrc)) return true;
    if (typeof window === 'undefined') return true;
    return window.confirm(
      `Proyek "${this.videoTitle}" memiliki perubahan yang belum disimpan.\n\nTetap ${actionLabel} tanpa menyimpan?`
    );
  }

  updateMatchMeta(patch: {
    title?: string;
    matchKind?: MatchKind;
    competition?: string;
    matchDate?: string;
  }) {
    if (patch.title !== undefined && patch.title.trim()) this.videoTitle = patch.title.trim();
    if (patch.matchKind !== undefined) this.matchKind = patch.matchKind;
    if (patch.competition !== undefined) this.competitionName = patch.competition;
    if (patch.matchDate !== undefined) this.matchDate = patch.matchDate;
    this.markDirty();
  }

  private async relinkLibraryProjectsInFolder(folderPath: string, askConfirm: boolean): Promise<number> {
    if (!isTauriDesktop() || !folderPath) return 0;
    try {
      if (this.libraryMatches.length === 0) {
        await this.scanMatchLibrary();
      }
      const activeKey = this.normalizePathKey(this.currentProjectFilePath);
      const candidates: LibraryMatchSource[] = [];
      const targetNames: string[] = [];

      for (const lib of this.libraryMatches) {
        if (!lib.filePath || !lib.videoFilePath) continue;
        if (activeKey && this.normalizePathKey(lib.filePath) === activeKey) continue;
        const exists = await invoke<boolean>('check_file_exists', { filePath: lib.videoFilePath }).catch(() => false);
        if (!exists) {
          candidates.push(lib);
          targetNames.push(lib.videoFilePath);
        }
      }

      if (candidates.length === 0) return 0;

      const matches = await invoke<Record<string, string>>('scan_folder_for_relink', {
        folderPath,
        targetFilenames: targetNames,
      });
      const matchesLower = new Map<string, string>();
      for (const [k, v] of Object.entries(matches)) {
        matchesLower.set(k.toLowerCase(), v);
      }

      const toUpdate = candidates.filter((lib) => {
        const fname = (lib.videoFilePath || '').split(/[\\/]/).pop()?.toLowerCase() || '';
        return Boolean(fname && matchesLower.get(fname));
      });

      if (toUpdate.length === 0) return 0;

      if (askConfirm && typeof window !== 'undefined') {
        const ok = window.confirm(
          `Ditemukan ${toUpdate.length} proyek lain di pustaka yang file videonya berada di folder ini. Sambungkan otomatis juga?`
        );
        if (!ok) return 0;
      }

      let updatedCount = 0;
      for (const lib of toUpdate) {
        if (!lib.filePath) continue;
        try {
          const raw = await invoke<string>('load_project_file', { filePath: lib.filePath });
          const data = JSON.parse(raw);
          const fname = (lib.videoFilePath || '').split(/[\\/]/).pop()?.toLowerCase() || '';
          const newPath = matchesLower.get(fname);
          if (!newPath) continue;
          if (!data.matchInfo) data.matchInfo = {};
          data.matchInfo.videoFilePath = newPath;

          // Also relink secondary angles in that project if present in same folder
          if (Array.isArray(data.secondaryAngles) && data.secondaryAngles.length > 0) {
            const angleNames = data.secondaryAngles
              .map((a: any) => a?.filePath)
              .filter((p: any) => typeof p === 'string' && p.length > 0);
            if (angleNames.length > 0) {
              const angleMatches = await invoke<Record<string, string>>('scan_folder_for_relink', {
                folderPath,
                targetFilenames: angleNames,
              });
              const angleLower = new Map<string, string>();
              for (const [ak, av] of Object.entries(angleMatches)) {
                angleLower.set(ak.toLowerCase(), av);
              }
              data.secondaryAngles = data.secondaryAngles.map((a: any) => {
                const af = (a?.filePath || '').split(/[\\/]/).pop()?.toLowerCase() || '';
                const np = af ? angleLower.get(af) : undefined;
                return np ? { ...a, filePath: np } : a;
              });
            }
          }

          await invoke<string>('save_project_file', {
            filePath: lib.filePath,
            content: JSON.stringify(data, null, 2),
          });
          updatedCount++;
        } catch {
          // Ignore individual file error
        }
      }

      if (updatedCount > 0) {
        await this.scanMatchLibrary();
      }
      return updatedCount;
    } catch {
      return 0;
    }
  }

  async relinkVideoFile(): Promise<boolean> {
    if (!isTauriDesktop()) return false;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      title: `Cari Video untuk "${this.videoTitle}"`,
      multiple: false,
      filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }],
    });
    if (!selected || typeof selected !== 'string') return false;
    this.videoFilePath = selected;
    this.videoSrc = convertFileSrc(selected);
    this.onlineSourceType = null;
    this.videoMissing = false;

    // Auto-scan parent folder to relink secondary angles & offer cross-project relink
    try {
      const parentDir = selected.replace(/[\\/][^\\/]+$/, '');
      if (parentDir) {
        if (this.secondaryAngles.length > 0) {
          const angleTargets = this.secondaryAngles
            .filter((a) => a.filePath)
            .map((a) => a.filePath!);
          if (angleTargets.length > 0) {
            const matches = await invoke<Record<string, string>>('scan_folder_for_relink', {
              folderPath: parentDir,
              targetFilenames: angleTargets,
            });
            const matchesLower = new Map<string, string>();
            for (const [k, v] of Object.entries(matches)) {
              matchesLower.set(k.toLowerCase(), v);
            }
            this.secondaryAngles = this.secondaryAngles.map((a) => {
              const fname = (a.filePath || '').split(/[\\/]/).pop()?.toLowerCase() || '';
              const found = fname ? matchesLower.get(fname) : undefined;
              if (found) {
                return {
                  ...a,
                  filePath: found,
                  videoSrc: convertFileSrc(found),
                };
              }
              return a;
            });
          }
        }
        await this.relinkLibraryProjectsInFolder(parentDir, true);
      }
    } catch {
      // Non-blocking auto-relink fallback
    }

    this.markDirty();
    return true;
  }

  async relinkFolderMassal(): Promise<{
    mainRelinked: boolean;
    anglesRelinked: number;
    otherProjectsRelinked: number;
    noTargets?: boolean;
  } | null> {
    if (!isTauriDesktop()) return null;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selectedDir = await open({
      title: 'Pilih Folder yang Berisi File Video Pertandingan',
      directory: true,
      multiple: false,
    });
    if (!selectedDir || typeof selectedDir !== 'string') return null;

    const targets: string[] = [];
    if (this.videoFilePath) targets.push(this.videoFilePath);
    for (const a of this.secondaryAngles) {
      if (a.filePath) targets.push(a.filePath);
    }

    let mainRelinked = false;
    let anglesRelinked = 0;

    if (targets.length > 0) {
      const matches = await invoke<Record<string, string>>('scan_folder_for_relink', {
        folderPath: selectedDir,
        targetFilenames: targets,
      });
      const matchesLower = new Map<string, string>();
      for (const [k, v] of Object.entries(matches)) {
        matchesLower.set(k.toLowerCase(), v);
      }

      if (this.videoFilePath) {
        const fname = this.videoFilePath.split(/[\\/]/).pop()?.toLowerCase() || '';
        const found = fname ? matchesLower.get(fname) : undefined;
        if (found) {
          this.videoFilePath = found;
          this.videoSrc = convertFileSrc(found);
          this.videoMissing = false;
          this.onlineSourceType = null;
          mainRelinked = true;
        }
      }

      this.secondaryAngles = this.secondaryAngles.map((a) => {
        const fname = (a.filePath || '').split(/[\\/]/).pop()?.toLowerCase() || '';
        const found = fname ? matchesLower.get(fname) : undefined;
        if (found) {
          anglesRelinked++;
          return {
            ...a,
            filePath: found,
            videoSrc: convertFileSrc(found),
          };
        }
        return a;
      });
    }

    const otherProjectsRelinked = await this.relinkLibraryProjectsInFolder(selectedDir, false);

    if (mainRelinked || anglesRelinked > 0) {
      this.markDirty();
    }

    return {
      mainRelinked,
      anglesRelinked,
      otherProjectsRelinked,
      noTargets: targets.length === 0 && otherProjectsRelinked === 0,
    };
  }

  async duplicateMatchFile(source: LibraryMatchSource): Promise<boolean> {
    if (!isTauriDesktop() || !source.filePath) return false;
    const raw = await invoke<string>('load_project_file', { filePath: source.filePath });
    const data = JSON.parse(raw);
    if (!data.matchInfo) data.matchInfo = {};
    data.matchInfo.title = `${data.matchInfo.title || source.title} (Salinan)`;
    data.exportedAt = new Date().toISOString();
    const base = source.filePath.replace(/\.(futsal|json)$/i, '');
    const copyPath = `${base}_copy_${Date.now()}.futsal`;
    await invoke<string>('save_project_file', {
      filePath: copyPath,
      content: JSON.stringify(data, null, 2),
    });
    await this.scanMatchLibrary();
    return true;
  }

  async deleteMatchFile(filePath: string): Promise<boolean> {
    if (!isTauriDesktop() || !filePath) return false;
    await invoke('delete_project_file', { filePath });
    const norm = this.normalizePathKey(filePath);
    this.recentProjects = this.recentProjects.filter((r) => this.normalizePathKey(r.filePath) !== norm);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem('futsaltag_recent_projects_v1', JSON.stringify(this.recentProjects));
      } catch {
        // Ignore storage errors
      }
    }
    await this.scanMatchLibrary();
    return true;
  }

  tagHasTelestration(tag: VideoTagEvent): boolean {
    return Boolean(
      (tag.drawings?.length ?? 0) > 0 ||
        (tag.freezeStops?.length ?? 0) > 0 ||
        tag.voiceoverAudioBase64 ||
        tag.burnSubtitle
    );
  }

  private normalizePathKey(p: string | null | undefined): string {
    return (p || '').trim().replace(/\\/g, '/').toLowerCase();
  }

  parseMatchLibraryJson(content: string, filePath: string | null, fallbackName: string): LibraryMatchSource | null {
    try {
      const data = JSON.parse(content);
      if (!Array.isArray(data?.tags)) return null;
      const videoFilePath = typeof data.matchInfo?.videoFilePath === 'string' ? data.matchInfo.videoFilePath : null;
      const isAbs =
        videoFilePath &&
        isTauriDesktop() &&
        (videoFilePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(videoFilePath));
      const videoSrc = isAbs && videoFilePath ? convertFileSrc(videoFilePath) : null;
      const title =
        (typeof data.matchInfo?.title === 'string' && data.matchInfo.title.trim()) ||
        fallbackName.replace(/\.(futsal|json)$/i, '');

      return {
        id: filePath ? `lib:${this.normalizePathKey(filePath)}` : `lib:${fallbackName}:${title}`,
        title,
        filePath,
        videoFilePath,
        videoSrc,
        exportedAt: typeof data.exportedAt === 'string' ? data.exportedAt : undefined,
        matchKind: data.matchInfo?.matchKind === 'training' ? 'training' : 'match',
        competition: typeof data.matchInfo?.competition === 'string' ? data.matchInfo.competition : undefined,
        matchDate: typeof data.matchInfo?.matchDate === 'string' ? data.matchInfo.matchDate : undefined,
        chromaFloorConfig: data.chromaFloorConfig,
        tags: data.tags.map((t: VideoTagEvent) => this.normalizeTagPlayers(t)),
        roster: Array.isArray(data.roster) ? data.roster : [],
      };
    } catch {
      return null;
    }
  }

  async scanMatchLibrary(customFolder?: string): Promise<number> {
    if (!isTauriDesktop()) return this.libraryMatches.length;
    this.matchLibraryLoading = true;
    this.matchLibraryError = null;
    try {
      const res = await invoke<{
        folder_path: string;
        files: { file_path: string; file_name: string; content: string }[];
      }>('scan_match_library_folder', {
        folderPath: (customFolder ?? this.matchLibraryFolder) || null,
      });
      this.matchLibraryFolder = res.folder_path;
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('futsaltag_match_library_folder', res.folder_path);
      }
      const activePathKey = this.normalizePathKey(this.currentProjectFilePath);
      const parsed: LibraryMatchSource[] = [];
      for (const f of res.files) {
        if (activePathKey && this.normalizePathKey(f.file_path) === activePathKey) continue;
        const src = this.parseMatchLibraryJson(f.content, f.file_path, f.file_name);
        if (src) parsed.push(src);
      }
      this.libraryMatches = parsed;
      return parsed.length;
    } catch (err: any) {
      this.matchLibraryError = err?.message || String(err);
      return 0;
    } finally {
      this.matchLibraryLoading = false;
    }
  }

  async pickMatchLibraryFolder(): Promise<number> {
    if (!isTauriDesktop()) return 0;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      directory: true,
      multiple: false,
      title: 'Pilih Folder Pustaka Pertandingan (.futsal)',
    });
    if (!selected || typeof selected !== 'string') return this.libraryMatches.length;
    return this.scanMatchLibrary(selected);
  }

  addBrowserMatchFiles(files: FileList) {
    for (const file of Array.from(files)) {
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result !== 'string') return;
        const parsed = this.parseMatchLibraryJson(reader.result, null, file.name);
        if (!parsed) return;
        const idx = this.libraryMatches.findIndex((m) => m.id === parsed.id);
        if (idx >= 0) {
          this.libraryMatches[idx] = parsed;
        } else {
          this.libraryMatches = [...this.libraryMatches, parsed];
        }
      };
      reader.readAsText(file);
    }
  }

  getAllMatchSources(): LibraryMatchSource[] {
    const activeSource: LibraryMatchSource = {
      id: '__active__',
      title: this.videoTitle || 'Proyek Aktif',
      filePath: this.currentProjectFilePath,
      videoFilePath: this.videoFilePath,
      videoSrc: this.videoSrc,
      chromaFloorConfig: this.chromaFloorConfig,
      tags: this.tags,
      roster: this.roster,
    };
    const activePathKey = this.normalizePathKey(this.currentProjectFilePath);
    const extras = this.libraryMatches.filter(
      (m) => !activePathKey || this.normalizePathKey(m.filePath) !== activePathKey
    );
    return [activeSource, ...extras];
  }

  getClipKey(matchId: string, tagId: string): string {
    return `${matchId}::${tagId}`;
  }

  private getTagPlayersNormalized(tag: VideoTagEvent): string[] {
    const raw =
      tag.playersInvolved && tag.playersInvolved.length > 0
        ? tag.playersInvolved
        : tag.playerLabel
          ? [tag.playerLabel]
          : [];
    return raw.map((p) => this.normalizePlayerLabel(p));
  }

  getFilteredPlaylistClips(): ResolvedPlaylistClip[] {
    const f = this.clipFilter;
    const q = f.searchQuery.trim().toLowerCase();
    const sources = this.getAllMatchSources().filter(
      (m) => f.matchIds.length === 0 || f.matchIds.includes(m.id)
    );

    const out: ResolvedPlaylistClip[] = [];
    for (const m of sources) {
      for (const tag of m.tags) {
        const key = this.getClipKey(m.id, tag.id);
        if (this.clipExcludedKeys[key]) continue;
        if (f.categories.length > 0 && !f.categories.includes(tag.category)) continue;

        if (f.labels.length > 0) {
          const names = tag.labels?.length ? tag.labels.map((l) => l.name) : ['Tanpa Label'];
          if (!f.labels.some((lbl) => names.includes(lbl))) continue;
        }

        if (f.players.length > 0) {
          const players = this.getTagPlayersNormalized(tag);
          if (!f.players.some((pl) => players.includes(pl))) continue;
        }

        const hasTelestration = this.tagHasTelestration(tag);
        if (f.telestration === 'with_telestration' && !hasTelestration) continue;
        if (f.telestration === 'without_telestration' && hasTelestration) continue;

        if (q) {
          const hay = [
            tag.title,
            tag.category,
            tag.playerLabel || '',
            m.title,
            tag.notes || '',
            ...(tag.labels?.map((l) => l.name) ?? []),
          ]
            .join(' ')
            .toLowerCase();
          if (!hay.includes(q)) continue;
        }

        out.push({
          key,
          matchId: m.id,
          matchTitle: m.title,
          videoFilePath: m.videoFilePath,
          videoSrc: m.videoSrc,
          chromaFloorConfig: m.chromaFloorConfig,
          tag,
          hasTelestration,
          useTelestration: this.clipTelestrationOverrides[key] ?? this.globalIncludeTelestration,
        });
      }
    }

    if (this.clipCustomOrderKeys.length > 0) {
      const rank = new Map(this.clipCustomOrderKeys.map((k, idx) => [k, idx]));
      out.sort((a, b) => (rank.get(a.key) ?? 1e9) - (rank.get(b.key) ?? 1e9));
    }
    return out;
  }

  toggleClipFilter(field: 'matchIds' | 'categories' | 'labels' | 'players', value: string) {
    const arr = this.clipFilter[field];
    this.clipFilter[field] = arr.includes(value) ? arr.filter((v) => v !== value) : [...arr, value];
  }

  setTelestrationFilter(mode: TelestrationFilterMode) {
    this.clipFilter.telestration = mode;
  }

  resetClipFilter() {
    this.clipFilter = {
      matchIds: [],
      categories: [],
      labels: [],
      players: [],
      telestration: 'all',
      searchQuery: '',
    };
    this.clipExcludedKeys = {};
  }

  setClipTelestration(key: string, val: boolean) {
    this.clipTelestrationOverrides = { ...this.clipTelestrationOverrides, [key]: val };
  }

  setAllClipsTelestration(val: boolean) {
    this.globalIncludeTelestration = val;
    this.clipTelestrationOverrides = {};
  }

  moveFilteredClip(currentKeys: string[], idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (idx < 0 || idx >= currentKeys.length || target < 0 || target >= currentKeys.length) return;
    const next = [...currentKeys];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    this.clipCustomOrderKeys = next;
  }

  excludeFilteredClip(key: string) {
    this.clipExcludedKeys = { ...this.clipExcludedKeys, [key]: true };
  }

  restoreExcludedClips() {
    this.clipExcludedKeys = {};
  }

  addSecondaryAngle(videoSrc: string, filePath: string | null, name?: string): SecondaryVideoAngle {
    const angle: SecondaryVideoAngle = {
      id: `cam_${Date.now()}`,
      name: name?.trim() || `Kamera ${this.secondaryAngles.length + 2}`,
      filePath,
      videoSrc,
      offsetSec: 0,
    };
    this.secondaryAngles = [...this.secondaryAngles, angle];
    this.activeAngleId = angle.id;
    this.angleViewMode = 'split';
    this.markDirty();
    return angle;
  }

  async pickSecondaryAngleFile(): Promise<boolean> {
    if (!isTauriDesktop()) return false;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      title: `Pilih Video Sudut Kamera ${this.secondaryAngles.length + 2}`,
      multiple: false,
      filters: [{ name: 'Video Files', extensions: ['mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v'] }],
    });
    if (!selected || typeof selected !== 'string') return false;
    const fileName = selected.split(/[\\/]/).pop() || '';
    const shortName = fileName.replace(/\.[^.]+$/, '').slice(0, 18) || `Kamera ${this.secondaryAngles.length + 2}`;
    this.addSecondaryAngle(convertFileSrc(selected), selected, shortName);
    return true;
  }

  updateSecondaryAngle(id: string, patch: { name?: string; offsetSec?: number }) {
    this.secondaryAngles = this.secondaryAngles.map((a) =>
      a.id === id
        ? {
            ...a,
            ...(patch.name !== undefined ? { name: patch.name } : {}),
            ...(patch.offsetSec !== undefined ? { offsetSec: Number(patch.offsetSec.toFixed(2)) } : {}),
          }
        : a
    );
    this.markDirty();
  }

  removeSecondaryAngle(id: string) {
    this.secondaryAngles = this.secondaryAngles.filter((a) => a.id !== id);
    if (this.activeAngleId === id) {
      this.activeAngleId = this.secondaryAngles[0]?.id ?? 'main';
    }
    if (this.secondaryAngles.length === 0) {
      this.angleViewMode = 'single';
    }
    this.markDirty();
  }

  setActiveAngle(id: string) {
    this.activeAngleId = id;
  }
}

export const projectStore = new ProjectStore();

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
} from '$lib/types';
import {
  BUILTIN_TAGGING_BOARDS,
  cloneBoard,
  parseMomenBoardJson,
} from '$lib/tagging/momenBoards';

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

class ProjectStore {
  stage = $state<WorkflowStage>('hub');
  videoSrc = $state<string | null>(null);
  videoFilePath = $state<string | null>(null);
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

  // Broadcast Chroma-Key Court Masking Config
  chromaFloorConfig = $state<ChromaFloorConfig>({
    enabled: false,
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
  boards = $state<TaggingBoard[]>(BUILTIN_TAGGING_BOARDS.map(cloneBoard));
  activeBoardId = $state<string>(BUILTIN_TAGGING_BOARDS[0].id);

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

  constructor() {}

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
    return event;
  }

  deleteSubstitution(id: string) {
    this.substitutions = this.substitutions.filter((s) => s.id !== id);
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

  get activeBoard(): TaggingBoard {
    return this.boards.find((b) => b.id === this.activeBoardId) || this.boards[0];
  }

  selectBoard(id: string) {
    if (this.boards.some((b) => b.id === id)) {
      this.activeBoardId = id;
    }
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
    return this.activeBoard;
  }

  upsertBoardButton(btn: TaggingButton) {
    const board = this.activeBoard;
    if (!board) return;
    const idx = board.buttons.findIndex((b) => b.id === btn.id);
    if (idx !== -1) {
      board.buttons[idx] = { ...btn, forTags: [...btn.forTags], links: [...btn.links] };
    } else {
      board.buttons.push({ ...btn, forTags: [...btn.forTags], links: [...btn.links] });
    }
  }

  deleteBoardButton(buttonId: string) {
    const board = this.activeBoard;
    if (!board) return;
    board.buttons = board.buttons
      .filter((b) => b.id !== buttonId)
      .map((b) => ({
        ...b,
        links: b.links.filter((id) => id !== buttonId),
        forTags: b.forTags.filter((id) => id !== buttonId),
      }));
  }

  toggleBoardButtonLink(sourceId: string, targetId: string) {
    if (!sourceId || !targetId || sourceId === targetId) return;
    const board = this.activeBoard;
    if (!board) return;
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
      return;
    }

    if (src.kind === 'descriptor' && dst.kind === 'category') {
      src.forTags = src.forTags.includes(dst.id)
        ? src.forTags.filter((id) => id !== dst.id)
        : [...src.forTags, dst.id];
      return;
    }

    if (src.kind === 'category' && dst.kind === 'descriptor') {
      dst.forTags = dst.forTags.includes(src.id)
        ? dst.forTags.filter((id) => id !== src.id)
        : [...dst.forTags, src.id];
    }
  }

  updateActiveBoardMeta(patch: { name?: string; background?: 'pitch' | 'plain'; color?: string }) {
    const board = this.activeBoard;
    if (!board) return;
    if (typeof patch.name === 'string') board.name = patch.name;
    if (patch.background) board.background = patch.background;
    if (typeof patch.color === 'string') board.color = patch.color;
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
    return fresh;
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
    }
    return norm;
  }

  setStage(newStage: WorkflowStage) {
    this.stage = newStage;
  }

  // Load a real user video: CLEARS previous tags so analyst starts fresh
  loadVideo(url: string, path: string | null, title: string, dur = 0) {
    this.videoSrc = url;
    this.videoFilePath = path;
    this.videoTitle = title || 'Video Pertandingan Futsal';
    this.duration = dur;
    this.currentTime = 0;

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
    this.stage = 'tagging';
  }

  // Load sample demo match with pre-tagged futsal events (with real courtCoord & passing links)
  loadSampleDemo() {
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

    this.stage = 'tagging';
  }

  addTag(tag: VideoTagEvent) {
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
  }

  updateTag(updated: VideoTagEvent) {
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
  }

  deleteTag(id: string) {
    this.tags = this.tags.filter((t) => t.id !== id);
    for (const pl of this.playlists) {
      pl.items = pl.items.filter((item) => item.tagEventId !== id);
    }
    if (this.activeClipForDrawing?.id === id) {
      this.activeClipForDrawing = null;
    }
  }

  undoLastTag(): VideoTagEvent | null {
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
    freezeTimestamp?: number
  ) {
    const tag = this.tags.find((t) => t.id === clipId);
    if (tag) {
      const updated: VideoTagEvent = {
        ...tag,
        drawings: JSON.parse(JSON.stringify(drawings)),
        pauseDuration,
        freezeTimestamp: freezeTimestamp ?? tag.freezeTimestamp ?? (tag.startTime + tag.endTime) / 2,
      };
      if (voiceoverAudioBase64 !== undefined) {
        updated.voiceoverAudioBase64 = voiceoverAudioBase64;
      }
      this.updateTag(updated);
    }
  }

  saveAndNextClip(
    clipId: string,
    drawings: DrawingElement[],
    pauseDuration: number,
    voiceoverAudioBase64?: string,
    freezeTimestamp?: number
  ) {
    this.saveTelestration(clipId, drawings, pauseDuration, voiceoverAudioBase64, freezeTimestamp);
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

  exportProjectJson(): string {
    const projectData = {
      format: 'futsaltag-project',
      version: '1.2',
      exportedAt: new Date().toISOString(),
      matchInfo: {
        title: this.videoTitle,
        duration: this.duration,
        videoFilePath: this.videoFilePath,
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
    };
    return JSON.stringify(projectData, null, 2);
  }

  async saveProjectToDisk(): Promise<string | null> {
    const json = this.exportProjectJson();
    const safeName = (this.videoTitle || 'proyek_futsal')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();

    if (isTauriDesktop()) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      const selected = await save({
        title: 'Simpan Proyek FutsalTag Pro',
        defaultPath: `${safeName}.futsal`,
        filters: [{ name: 'FutsalTag Project', extensions: ['futsal', 'json'] }],
      });
      if (!selected) return null;
      await invoke<string>('save_project_file', { filePath: selected, content: json });
      return selected;
    }

    this.downloadProjectFile(safeName);
    return `${safeName}.futsal`;
  }

  async openProjectFromDisk(): Promise<boolean> {
    if (!isTauriDesktop()) return false;
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      title: 'Buka Proyek FutsalTag Pro',
      multiple: false,
      filters: [{ name: 'FutsalTag Project', extensions: ['futsal', 'json'] }],
    });
    if (!selected || typeof selected !== 'string') return false;
    const content = await invoke<string>('load_project_file', { filePath: selected });
    return this.importProjectJson(content);
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
        if (this.videoFilePath && isTauriDesktop() && (this.videoFilePath.startsWith('/') || /^[A-Za-z]:[\\/]/.test(this.videoFilePath))) {
          this.videoSrc = convertFileSrc(this.videoFilePath);
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
          targetRgb: Array.isArray(data.chromaFloorConfig.targetRgb)
            ? data.chromaFloorConfig.targetRgb
            : [34, 98, 152],
          tolerance: Number(data.chromaFloorConfig.tolerance) || 32,
          feather: Number(data.chromaFloorConfig.feather) || 10,
        };
      }
      if (Array.isArray(data.boards) && data.boards.length > 0) {
        this.boards = data.boards.map(cloneBoard);
      }
      if (typeof data.activeBoardId === 'string' && this.boards.some((b) => b.id === data.activeBoardId)) {
        this.activeBoardId = data.activeBoardId;
      }
      if (Array.isArray(data.tags)) {
        this.tags = data.tags.map((t: VideoTagEvent) => this.normalizeTagPlayers(t));
      }
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        this.playlists = data.playlists;
      }
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
      this.stage = 'tagging';
      return true;
    } catch (err) {
      console.error('Gagal memuat berkas proyek:', err);
      return false;
    }
  }

  async runAutoSave(): Promise<boolean> {
    if (this.tags.length === 0 && !this.videoSrc) return false;
    try {
      const json = this.exportProjectJson();
      if (isTauriDesktop()) {
        await invoke<string>('save_autosave_project', { content: json });
      } else if (typeof localStorage !== 'undefined') {
        localStorage.setItem('futsaltag_autosave_v1', json);
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
    this.videoSrc = null;
    this.videoFilePath = null;
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
    this.stage = 'hub';
  }
}

export const projectStore = new ProjectStore();

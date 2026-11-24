import type { TaggingBoard, TaggingButton, TaggingButtonShape } from '$lib/types';
import { AMRIL_MATRIX_2_RAW } from './amrilMatrixPreset';

export function argbIntToHex(val: number | string | null | undefined, fallback = '#0284c7'): string {
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(trimmed)) return trimmed.toLowerCase();
    if (/^#[0-9a-fA-F]{8}$/.test(trimmed)) return `#${trimmed.slice(3).toLowerCase()}`;
    const parsed = Number(trimmed);
    if (!Number.isFinite(parsed)) return fallback;
    val = parsed;
  }
  if (typeof val !== 'number' || !Number.isFinite(val)) return fallback;
  const rgb = (val >>> 0) & 0x00ffffff;
  return `#${rgb.toString(16).padStart(6, '0')}`;
}

export function hexToArgbInt(hex: string): number {
  const clean = (hex || '#0284c7').replace('#', '').padStart(6, '0').slice(0, 6);
  const rgb = parseInt(clean, 16);
  if (!Number.isFinite(rgb)) return 0xff0284c7 >>> 0;
  return (0xff000000 | rgb) >>> 0;
}

export function getContrastTextColor(hex: string): '#111827' | '#ffffff' {
  const normalized = argbIntToHex(hex, '#0284c7').replace('#', '');
  const r = parseInt(normalized.slice(0, 2), 16);
  const g = parseInt(normalized.slice(2, 4), 16);
  const b = parseInt(normalized.slice(4, 6), 16);
  const luma = 0.299 * r + 0.587 * g + 0.114 * b;
  return luma > 160 ? '#111827' : '#ffffff';
}

function normalizeButton(raw: Record<string, any>, idx: number): TaggingButton {
  const shapeRaw = String(raw.shape || 'rounded').toLowerCase();
  const shape: TaggingButtonShape =
    shapeRaw === 'circle' ? 'circle' : shapeRaw === 'rect' ? 'rect' : 'rounded';

  let hotkey: string | null = null;
  if (typeof raw.hotkey === 'string' && raw.hotkey.trim()) {
    hotkey = raw.hotkey.trim().toUpperCase();
  } else if (typeof raw.key === 'number' && raw.key >= 32 && raw.key <= 126) {
    hotkey = String.fromCharCode(raw.key).toUpperCase();
  }

  const continuous =
    typeof raw.continuous === 'boolean' ? raw.continuous : raw.mode === 'manual';

  const leadSec =
    typeof raw.leadSec === 'number'
      ? raw.leadSec
      : typeof raw.preMs === 'number'
        ? Number((raw.preMs / 1000).toFixed(2))
        : 0;

  const lagSec =
    typeof raw.lagSec === 'number'
      ? raw.lagSec
      : typeof raw.postMs === 'number'
        ? Number((raw.postMs / 1000).toFixed(2))
        : 3;

  return {
    id: String(raw.id || `BTN_${idx + 1}`),
    name: String(raw.name || `Tombol ${idx + 1}`),
    kind: raw.kind === 'descriptor' ? 'descriptor' : 'category',
    hotkey,
    color: argbIntToHex(raw.color, raw.kind === 'descriptor' ? '#f59e0b' : '#0284c7'),
    x: typeof raw.x === 'number' ? raw.x : 24 + (idx % 6) * 156,
    y: typeof raw.y === 'number' ? raw.y : 24 + Math.floor(idx / 6) * 86,
    w: typeof raw.w === 'number' ? raw.w : 140,
    h: typeof raw.h === 'number' ? raw.h : 72,
    leadSec,
    lagSec,
    continuous,
    shape,
    forTags: Array.isArray(raw.forTags) ? raw.forTags.map(String) : [],
    links: Array.isArray(raw.links) ? raw.links.map(String) : [],
    exclusionGroup: typeof raw.exclusionGroup === 'string' && raw.exclusionGroup ? raw.exclusionGroup : null,
    group: typeof raw.group === 'string' && raw.group ? raw.group : null,
    autoAdd: Boolean(raw.autoAdd),
  };
}

export function normalizeRawMomenBoard(rawInput: Record<string, any>): TaggingBoard {
  const rawBoard =
    rawInput?.format === 'momen-match' && rawInput?.match?.board
      ? rawInput.match.board
      : rawInput;

  if (!rawBoard || !Array.isArray(rawBoard.buttons) || rawBoard.buttons.length === 0) {
    throw new Error('Berkas Momen tidak valid atau tidak memiliki daftar tombol ("buttons").');
  }

  return {
    id: String(rawBoard.id || `board_${Date.now()}`),
    name: String(rawBoard.name || 'Papan Momen Impor'),
    background: rawBoard.background === 'plain' ? 'plain' : 'pitch',
    color: argbIntToHex(rawBoard.color, '#0d1e38'),
    periods: typeof rawBoard.periods === 'number' ? rawBoard.periods : 1,
    buttons: rawBoard.buttons.map((b: Record<string, any>, idx: number) => normalizeButton(b, idx)),
  };
}

export function parseMomenBoardJson(jsonStr: string): TaggingBoard {
  const parsed = JSON.parse(jsonStr);
  return normalizeRawMomenBoard(parsed);
}

export function exportMomenBoardJson(board: TaggingBoard): string {
  const payload = {
    format: 'momen-board',
    version: 1,
    periods: board.periods ?? 1,
    id: board.id,
    name: board.name,
    background: board.background,
    color: hexToArgbInt(board.color),
    buttons: board.buttons.map((b) => ({
      id: b.id,
      name: b.name,
      kind: b.kind,
      hotkey: b.hotkey,
      color: hexToArgbInt(b.color),
      x: b.x,
      y: b.y,
      w: b.w,
      h: b.h,
      leadSec: b.leadSec,
      lagSec: b.lagSec,
      continuous: b.continuous,
      shape: b.shape,
      forTags: b.forTags,
      links: b.links,
      exclusionGroup: b.exclusionGroup,
      ...(b.group ? { group: b.group } : {}),
      ...(b.autoAdd ? { autoAdd: true } : {}),
    })),
  };
  return JSON.stringify(payload, null, 2);
}

export function cloneBoard(board: TaggingBoard): TaggingBoard {
  return {
    ...board,
    buttons: board.buttons.map((b) => ({
      ...b,
      forTags: [...b.forTags],
      links: [...b.links],
    })),
  };
}

export const FUTSAL_PRO_DEFAULT_BOARD: TaggingBoard = {
  id: 'futsal-pro-default',
  name: 'Futsal Pro (Momen + Once Sport)',
  background: 'pitch',
  color: '#0d1e38',
  periods: 2,
  buttons: [
    // Row 1: Continuous Tactical Phases (mutually exclusive 'phase')
    { id: 'Build-up 3-1', name: 'Build-up 3-1', kind: 'category', hotkey: 'Q', color: '#0284c7', x: 24, y: 20, w: 140, h: 72, leadSec: 2, lagSec: 2, continuous: true, shape: 'rounded', forTags: [], links: ['Build-up 4-0'], exclusionGroup: 'phase' },
    { id: 'Build-up 4-0', name: 'Build-up 4-0', kind: 'category', hotkey: 'W', color: '#0d9488', x: 176, y: 20, w: 140, h: 72, leadSec: 2, lagSec: 2, continuous: true, shape: 'rounded', forTags: [], links: ['Build-up 3-1'], exclusionGroup: 'phase' },
    { id: 'Pressing High', name: 'Pressing High', kind: 'category', hotkey: '4', color: '#d97706', x: 328, y: 20, w: 140, h: 72, leadSec: 2, lagSec: 2, continuous: true, shape: 'rounded', forTags: [], links: [], exclusionGroup: 'phase' },
    { id: 'Transition Attack', name: 'Transition Attack', kind: 'category', hotkey: '5', color: '#4f46e5', x: 480, y: 20, w: 140, h: 72, leadSec: 2, lagSec: 2, continuous: true, shape: 'rounded', forTags: [], links: ['Transition Defense'], exclusionGroup: 'phase' },
    { id: 'Transition Defense', name: 'Transition Defense', kind: 'category', hotkey: '6', color: '#dc2626', x: 632, y: 20, w: 140, h: 72, leadSec: 2, lagSec: 2, continuous: true, shape: 'rounded', forTags: [], links: ['Transition Attack'], exclusionGroup: 'phase' },
    { id: 'Power Play', name: 'Power Play', kind: 'category', hotkey: 'E', color: '#ca8a04', x: 784, y: 20, w: 148, h: 72, leadSec: 2, lagSec: 2, continuous: true, shape: 'rounded', forTags: [], links: [], exclusionGroup: 'phase' },

    // Row 2: Single-Click Key Events (Auto Pre/Post Roll) + Defending Power Play
    { id: 'Goal', name: 'Goal', kind: 'category', hotkey: '1', color: '#059669', x: 24, y: 108, w: 120, h: 66, leadSec: 6, lagSec: 3, continuous: false, shape: 'rounded', forTags: [], links: [], exclusionGroup: null },
    { id: 'Shot on Target', name: 'Shot on Target', kind: 'category', hotkey: '2', color: '#0369a1', x: 156, y: 108, w: 120, h: 66, leadSec: 4, lagSec: 3, continuous: false, shape: 'rounded', forTags: [], links: [], exclusionGroup: null },
    { id: 'Shot Off Target', name: 'Shot Off Target', kind: 'category', hotkey: '3', color: '#475569', x: 288, y: 108, w: 120, h: 66, leadSec: 4, lagSec: 2.5, continuous: false, shape: 'rounded', forTags: [], links: [], exclusionGroup: null },
    { id: 'Kick-in Set Piece', name: 'Kick-in Set Piece', kind: 'category', hotkey: '7', color: '#db2777', x: 420, y: 108, w: 120, h: 66, leadSec: 4, lagSec: 4, continuous: false, shape: 'rounded', forTags: [], links: [], exclusionGroup: null },
    { id: 'Corner Set Piece', name: 'Corner Set Piece', kind: 'category', hotkey: '8', color: '#7c3aed', x: 552, y: 108, w: 120, h: 66, leadSec: 4, lagSec: 4, continuous: false, shape: 'rounded', forTags: [], links: [], exclusionGroup: null },
    { id: 'Goalkeeper Save', name: 'Goalkeeper Save', kind: 'category', hotkey: 'R', color: '#0891b2', x: 684, y: 108, w: 120, h: 66, leadSec: 3, lagSec: 3, continuous: false, shape: 'rounded', forTags: [], links: [], exclusionGroup: null },
    { id: 'Foul', name: 'Foul', kind: 'category', hotkey: 'T', color: '#ea580c', x: 816, y: 108, w: 116, h: 66, leadSec: 4, lagSec: 3, continuous: false, shape: 'rounded', forTags: [], links: [], exclusionGroup: null },

    // Row 3: Circular Tactical Descriptors
    { id: 'DESC_DIAGONAL', name: 'Diagonal', kind: 'descriptor', hotkey: null, color: '#0ea5e9', x: 32, y: 204, w: 88, h: 54, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'tactic' },
    { id: 'DESC_PARALEL', name: 'Paralel', kind: 'descriptor', hotkey: null, color: '#10b981', x: 132, y: 204, w: 88, h: 54, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'tactic' },
    { id: 'DESC_WALLPASS', name: 'Wallpass', kind: 'descriptor', hotkey: null, color: '#f59e0b', x: 232, y: 204, w: 88, h: 54, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'tactic' },
    { id: 'DESC_BLOCK', name: 'Block Screen', kind: 'descriptor', hotkey: null, color: '#ec4899', x: 332, y: 204, w: 100, h: 54, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'tactic' },
    { id: 'DESC_PIVOT', name: 'Connect Pivot', kind: 'descriptor', hotkey: null, color: '#8b5cf6', x: 444, y: 204, w: 104, h: 54, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'tactic' },
    { id: 'DESC_ISO', name: 'Isolasi', kind: 'descriptor', hotkey: null, color: '#06b6d4', x: 560, y: 204, w: 88, h: 54, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'tactic' },

    // Row 4: Result Descriptors (mutually exclusive group 'result') & Period (sticky autoAdd)
    { id: 'RES_SUKSES', name: 'Gol / Sukses', kind: 'descriptor', hotkey: null, color: '#16a34a', x: 32, y: 288, w: 112, h: 48, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'result' },
    { id: 'RES_BLOK', name: 'Terblok', kind: 'descriptor', hotkey: null, color: '#0284c7', x: 156, y: 288, w: 96, h: 48, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'result' },
    { id: 'RES_GAGAL', name: 'Gagal', kind: 'descriptor', hotkey: null, color: '#64748b', x: 264, y: 288, w: 92, h: 48, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'result' },
    { id: 'RES_TO', name: 'Turnover', kind: 'descriptor', hotkey: null, color: '#dc2626', x: 368, y: 288, w: 100, h: 48, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'result' },
    { id: 'PER_1', name: 'Babak 1', kind: 'descriptor', hotkey: null, color: '#1d4ed8', x: 660, y: 288, w: 124, h: 48, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'period', autoAdd: true },
    { id: 'PER_2', name: 'Babak 2', kind: 'descriptor', hotkey: null, color: '#334155', x: 796, y: 288, w: 124, h: 48, leadSec: 0, lagSec: 0, continuous: false, shape: 'circle', forTags: [], links: [], exclusionGroup: null, group: 'period', autoAdd: false },
  ],
};

export const AMRIL_MATRIX_2_BOARD: TaggingBoard = normalizeRawMomenBoard(
  AMRIL_MATRIX_2_RAW as unknown as Record<string, any>
);

export const BUILTIN_TAGGING_BOARDS: TaggingBoard[] = [
  FUTSAL_PRO_DEFAULT_BOARD,
  AMRIL_MATRIX_2_BOARD,
];

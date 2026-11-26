import type { TaggingButton } from '$lib/types';

export type ShortcutGroupId = 'playback' | 'timeline' | 'edit';

export type ShortcutActionId =
  | 'playPause'
  | 'speedUp'
  | 'speedDown'
  | 'speedResetPause'
  | 'frameBack'
  | 'frameForward'
  | 'jumpBack1s'
  | 'jumpForward1s'
  | 'rewindStep'
  | 'forwardStep'
  | 'setIn'
  | 'setOut'
  | 'editOrCreateClip'
  | 'splitClip'
  | 'duplicateClip'
  | 'deleteClip'
  | 'quickSearch'
  | 'copyMeta'
  | 'pasteMeta'
  | 'undo'
  | 'redo'
  | 'openShortcuts';

export interface ShortcutActionDef {
  id: ShortcutActionId;
  group: ShortcutGroupId;
  label: string;
  description: string;
  defaultCombo: string;
}

export const PRESET_SPEED_STEP: Record<ShortcutActionId, string> = {
  playPause: 'Space',
  speedUp: 'L',
  speedDown: 'J',
  speedResetPause: 'K',
  frameBack: 'ArrowLeft',
  frameForward: 'ArrowRight',
  jumpBack1s: 'Shift+ArrowLeft',
  jumpForward1s: 'Shift+ArrowRight',
  rewindStep: 'Shift+J',
  forwardStep: 'Shift+L',
  setIn: 'I',
  setOut: 'O',
  editOrCreateClip: 'Alt+U',
  splitClip: 'S',
  duplicateClip: 'Ctrl+D',
  deleteClip: 'Delete',
  quickSearch: '/',
  copyMeta: 'Ctrl+C',
  pasteMeta: 'Ctrl+V',
  undo: 'Ctrl+Z',
  redo: 'Ctrl+Y',
  openShortcuts: 'Shift+/',
};

export const PRESET_SHUTTLE_REWIND: Record<ShortcutActionId, string> = {
  ...PRESET_SPEED_STEP,
  rewindStep: 'J',
  speedResetPause: 'K',
  speedUp: 'L',
  speedDown: '[',
  forwardStep: ']',
};

export const SHORTCUT_ACTIONS: ShortcutActionDef[] = [
  {
    id: 'playPause',
    group: 'playback',
    label: 'Play / Pause Video',
    description: 'Memutar atau menjeda video pertandingan',
    defaultCombo: PRESET_SPEED_STEP.playPause,
  },
  {
    id: 'speedUp',
    group: 'playback',
    label: 'Percepat Pemutaran (Speed Up)',
    description: 'Naikkan kecepatan bertahap: 0.25x → 0.5x → 1x → 1.5x → 2x → 3x → 4x',
    defaultCombo: PRESET_SPEED_STEP.speedUp,
  },
  {
    id: 'speedDown',
    group: 'playback',
    label: 'Perlambat / Slow-Motion (Speed Down)',
    description: 'Turunkan kecepatan bertahap hingga 0.5x / 0.25x',
    defaultCombo: PRESET_SPEED_STEP.speedDown,
  },
  {
    id: 'speedResetPause',
    group: 'playback',
    label: 'Reset Kecepatan 1.0x + Jeda (Pause)',
    description: 'Kembalikan kecepatan normal 1.0x sekaligus menghentikan video',
    defaultCombo: PRESET_SPEED_STEP.speedResetPause,
  },
  {
    id: 'frameBack',
    group: 'playback',
    label: 'Mundur 1 Frame',
    description: 'Geser video mundur tepat 1 frame untuk akurasi titik klip',
    defaultCombo: PRESET_SPEED_STEP.frameBack,
  },
  {
    id: 'frameForward',
    group: 'playback',
    label: 'Maju 1 Frame',
    description: 'Geser video maju tepat 1 frame',
    defaultCombo: PRESET_SPEED_STEP.frameForward,
  },
  {
    id: 'jumpBack1s',
    group: 'playback',
    label: 'Lompat Mundur 1 Detik',
    description: 'Geser cepat 1 detik ke belakang saat mencari momen',
    defaultCombo: PRESET_SPEED_STEP.jumpBack1s,
  },
  {
    id: 'jumpForward1s',
    group: 'playback',
    label: 'Lompat Maju 1 Detik',
    description: 'Geser cepat 1 detik ke depan',
    defaultCombo: PRESET_SPEED_STEP.jumpForward1s,
  },
  {
    id: 'rewindStep',
    group: 'playback',
    label: 'Lompat Mundur Cepat (-2 Detik)',
    description: 'Putar balik / lompat mundur cepat sebesar 2 detik',
    defaultCombo: PRESET_SPEED_STEP.rewindStep,
  },
  {
    id: 'forwardStep',
    group: 'playback',
    label: 'Lompat Maju Cepat (+2 Detik)',
    description: 'Lompat maju cepat sebesar 2 detik',
    defaultCombo: PRESET_SPEED_STEP.forwardStep,
  },
  {
    id: 'setIn',
    group: 'timeline',
    label: 'Tandai Awal Klip (Set IN)',
    description: 'Menetapkan titik masuk klip di posisi garis merah playhead',
    defaultCombo: PRESET_SPEED_STEP.setIn,
  },
  {
    id: 'setOut',
    group: 'timeline',
    label: 'Tandai Akhir Klip (Set OUT)',
    description: 'Membuat klip manual dari titik IN hingga posisi playhead',
    defaultCombo: PRESET_SPEED_STEP.setOut,
  },
  {
    id: 'editOrCreateClip',
    group: 'timeline',
    label: 'Edit 3-Kolom Klip / Simpan IN-OUT',
    description: 'Buka Panel 3 Kolom Once Sport pada klip terpilih (atau simpan rentang IN)',
    defaultCombo: PRESET_SPEED_STEP.editOrCreateClip,
  },
  {
    id: 'splitClip',
    group: 'timeline',
    label: 'Potong Klip di Playhead (Split)',
    description: 'Membelah klip terpilih tepat di garis playhead menjadi 2 klip',
    defaultCombo: PRESET_SPEED_STEP.splitClip,
  },
  {
    id: 'duplicateClip',
    group: 'timeline',
    label: 'Duplikat Klip Terpilih',
    description: 'Menggandakan klip beserta label, pemain, dan telestrasinya',
    defaultCombo: PRESET_SPEED_STEP.duplicateClip,
  },
  {
    id: 'deleteClip',
    group: 'timeline',
    label: 'Hapus Klip Terpilih',
    description: 'Menghapus 1 atau seluruh klip yang sedang dipilih (bisa Ctrl+Z)',
    defaultCombo: PRESET_SPEED_STEP.deleteClip,
  },
  {
    id: 'quickSearch',
    group: 'timeline',
    label: 'Fokus Cari Tag / Label Cepat',
    description: 'Langsung arahkan kursor ke kotak pencarian tag di panel kiri',
    defaultCombo: PRESET_SPEED_STEP.quickSearch,
  },
  {
    id: 'copyMeta',
    group: 'edit',
    label: 'Salin Label & Pemain',
    description: 'Menyalin label taktis, pemain terlibat, & tim dari klip terpilih',
    defaultCombo: PRESET_SPEED_STEP.copyMeta,
  },
  {
    id: 'pasteMeta',
    group: 'edit',
    label: 'Tempel Label & Pemain',
    description: 'Menempelkan label & pemain ke 1 atau banyak klip terpilih',
    defaultCombo: PRESET_SPEED_STEP.pasteMeta,
  },
  {
    id: 'undo',
    group: 'edit',
    label: 'Undo Perubahan Klip',
    description: 'Mengurungkan aksi terakhir (hapus, edit, trim, split, batch)',
    defaultCombo: PRESET_SPEED_STEP.undo,
  },
  {
    id: 'redo',
    group: 'edit',
    label: 'Redo Perubahan Klip',
    description: 'Mengulangi kembali aksi yang baru di-undo',
    defaultCombo: PRESET_SPEED_STEP.redo,
  },
  {
    id: 'openShortcuts',
    group: 'edit',
    label: 'Buka Pengaturan Shortcut',
    description: 'Membuka jendela konfigurasi & daftar lengkap shortcut keyboard',
    defaultCombo: PRESET_SPEED_STEP.openShortcuts,
  },
];

const MODIFIER_KEYS = new Set(['Control', 'Shift', 'Alt', 'Meta', 'OS']);

export function eventToCombo(e: KeyboardEvent): string | null {
  if (MODIFIER_KEYS.has(e.key)) return null;

  if (e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey) {
    return 'Shift+/';
  }

  let base: string;
  if (e.code === 'Space' || e.key === ' ') {
    base = 'Space';
  } else if (
    e.key === 'ArrowLeft' ||
    e.key === 'ArrowRight' ||
    e.key === 'ArrowUp' ||
    e.key === 'ArrowDown' ||
    e.key === 'Delete' ||
    e.key === 'Backspace' ||
    e.key === 'Escape' ||
    e.key === 'Enter' ||
    e.key === 'Tab' ||
    /^F\d{1,2}$/i.test(e.key)
  ) {
    base = e.key.length <= 3 && /^f\d+$/i.test(e.key) ? e.key.toUpperCase() : e.key;
  } else if (e.key.length === 1) {
    base = e.key.toUpperCase();
  } else {
    base = e.key;
  }

  const parts: string[] = [];
  if (e.ctrlKey || e.metaKey) parts.push('Ctrl');
  if (e.altKey) parts.push('Alt');
  if (e.shiftKey) parts.push('Shift');
  parts.push(base);
  return parts.join('+');
}

function normalizeCombo(combo: string): string {
  const parts = combo
    .split('+')
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length === 0) return '';
  const mods: string[] = [];
  let key = parts[parts.length - 1];
  for (let i = 0; i < parts.length - 1; i++) {
    const m = parts[i].toLowerCase();
    if (m === 'ctrl' || m === 'control' || m === 'cmd' || m === 'meta') {
      if (!mods.includes('Ctrl')) mods.push('Ctrl');
    } else if (m === 'alt' || m === 'option') {
      if (!mods.includes('Alt')) mods.push('Alt');
    } else if (m === 'shift') {
      if (!mods.includes('Shift')) mods.push('Shift');
    }
  }
  const ordered = ['Ctrl', 'Alt', 'Shift'].filter((m) => mods.includes(m));
  if (key.length === 1) key = key.toUpperCase();
  return [...ordered, key].join('+');
}

export function matchesCombo(e: KeyboardEvent, combo: string | null | undefined): boolean {
  if (!combo || !combo.trim()) return false;
  const pressed = eventToCombo(e);
  if (!pressed) return false;
  const target = normalizeCombo(combo);
  if (pressed === target) return true;
  if (target === 'Delete' && pressed === 'Backspace') return true;
  if (target === 'Ctrl+Y' && pressed === 'Ctrl+Shift+Z') return true;
  return false;
}

export function formatComboDisplay(combo: string | null | undefined): string {
  if (!combo || !combo.trim()) return 'Belum diatur';
  const norm = normalizeCombo(combo);
  if (norm === 'Shift+/') return '?';
  return norm
    .replace(/\bSpace\b/g, 'Spasi')
    .replace(/\bArrowLeft\b/g, '←')
    .replace(/\bArrowRight\b/g, '→')
    .replace(/\bArrowUp\b/g, '↑')
    .replace(/\bArrowDown\b/g, '↓')
    .replace(/\bDelete\b/g, 'Del');
}

const STORAGE_KEY = 'futsaltag_shortcuts_v1';

class ShortcutsStore {
  bindings = $state<Record<ShortcutActionId, string>>({ ...PRESET_SPEED_STEP });
  activePreset = $state<'speed-step' | 'shuttle-rewind' | 'custom'>('speed-step');

  constructor() {
    this.loadFromStorage();
  }

  private loadFromStorage() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        if (parsed.bindings && typeof parsed.bindings === 'object') {
          const next = { ...PRESET_SPEED_STEP };
          for (const def of SHORTCUT_ACTIONS) {
            if (typeof parsed.bindings[def.id] === 'string') {
              next[def.id] = parsed.bindings[def.id];
            }
          }
          this.bindings = next;
        }
        if (
          parsed.activePreset === 'speed-step' ||
          parsed.activePreset === 'shuttle-rewind' ||
          parsed.activePreset === 'custom'
        ) {
          this.activePreset = parsed.activePreset;
        }
      }
    } catch {
      // Ignore invalid persisted shortcut settings
    }
  }

  private saveToStorage() {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          activePreset: this.activePreset,
          bindings: this.bindings,
        })
      );
    } catch {
      // Ignore storage quota errors
    }
  }

  setBinding(id: ShortcutActionId, combo: string) {
    this.bindings = {
      ...this.bindings,
      [id]: normalizeCombo(combo),
    };
    this.activePreset = 'custom';
    this.saveToStorage();
  }

  clearBinding(id: ShortcutActionId) {
    this.bindings = {
      ...this.bindings,
      [id]: '',
    };
    this.activePreset = 'custom';
    this.saveToStorage();
  }

  applyPreset(preset: 'speed-step' | 'shuttle-rewind') {
    this.bindings =
      preset === 'shuttle-rewind' ? { ...PRESET_SHUTTLE_REWIND } : { ...PRESET_SPEED_STEP };
    this.activePreset = preset;
    this.saveToStorage();
  }

  resetDefaults() {
    this.applyPreset('speed-step');
  }

  findConflicts(
    id: ShortcutActionId,
    combo: string,
    boardButtons: TaggingButton[] = []
  ): string[] {
    if (!combo || !combo.trim()) return [];
    const norm = normalizeCombo(combo);
    const conflicts: string[] = [];

    for (const def of SHORTCUT_ACTIONS) {
      if (def.id === id) continue;
      const other = normalizeCombo(this.bindings[def.id] || '');
      if (other && other === norm) {
        conflicts.push(`Shortcut "${def.label}"`);
      }
    }

    if (!norm.includes('+') && norm.length === 1) {
      for (const btn of boardButtons) {
        if (btn.hotkey && btn.hotkey.trim().toUpperCase() === norm.toUpperCase()) {
          conflicts.push(`Papan Tagging: ${btn.name} (${btn.hotkey.toUpperCase()})`);
        }
      }
    }

    return conflicts;
  }
}

export const shortcutsStore = new ShortcutsStore();

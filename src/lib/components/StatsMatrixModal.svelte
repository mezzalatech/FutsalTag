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

  let matrixView = $state<'tag_player' | 'tag_label' | 'label_label' | 'charts'>('tag_player');
  let activePhaseTab = $state<'all' | 'used' | 'attack' | 'defense' | 'setpiece' | 'special'>('all');
  let crossTag = $state<string>('__all__');
  let crossRowGroup = $state<string>('descriptor');
  let crossColGroup = $state<string>('outcome');
  let comparePlayerA = $state<string>('');
  let comparePlayerB = $state<string>('');

  const standardCatSet = new Set<string>(ALL_CATEGORIES.map((c) => c.cat));
  const boardCatButtons = $derived(
    projectStore.activeBoard.buttons.filter((b) => b.kind === 'category'),
  );
  const isCustomBoard = $derived(
    boardCatButtons.some((b) => !standardCatSet.has(b.name)) ||
      tags.some((t) => Boolean(t.category) && !standardCatSet.has(t.category)),
  );

  $effect(() => {
    if (
      isCustomBoard &&
      (activePhaseTab === 'attack' ||
        activePhaseTab === 'defense' ||
        activePhaseTab === 'setpiece' ||
        activePhaseTab === 'special')
    ) {
      activePhaseTab = 'all';
    }
  });

  const allDynamicCategories = $derived.by<MatrixCategory[]>(() => {
    const counts = new Map<string, number>();
    const tagColors = new Map<string, string>();
    for (const t of tags) {
      if (!t.category) continue;
      counts.set(t.category, (counts.get(t.category) || 0) + 1);
      if (t.color && !tagColors.has(t.category)) tagColors.set(t.category, t.color);
    }

    const stdByCat = new Map(ALL_CATEGORIES.map((c) => [c.cat as string, c]));
    const btnByName = new Map(boardCatButtons.map((b) => [b.name, b]));
    const out: MatrixCategory[] = [];
    const seen = new Set<string>();

    const makeItem = (name: string): MatrixCategory => {
      const std = stdByCat.get(name);
      const btn = btnByName.get(name);
      if (std && !btn) return std;
      return {
        id: btn?.id || std?.id || `cat-${name}`,
        label: name,
        shortLabel: name,
        icon: btn ? (btn.continuous ? '●' : '🏷️') : std?.icon || '🏷️',
        cat: name as TagCategory,
        phase: std?.phase || 'special',
        color: btn?.color || tagColors.get(name) || std?.color || '#38bdf8',
      };
    };

    // 1. Put tagged categories first (most used first) so real clips always show leftmost
    const taggedNames = Array.from(counts.keys()).sort(
      (a, b) => (counts.get(b) || 0) - (counts.get(a) || 0) || a.localeCompare(b),
    );
    for (const name of taggedNames) {
      seen.add(name);
      out.push(makeItem(name));
    }

    // 2. Append remaining category buttons from the active coding board
    for (const btn of boardCatButtons) {
      if (!seen.has(btn.name)) {
        seen.add(btn.name);
        out.push(makeItem(btn.name));
      }
    }

    // 3. Keep 13 standard presets only for default/standard boards
    if (!isCustomBoard) {
      for (const std of ALL_CATEGORIES) {
        if (!seen.has(std.cat)) {
          seen.add(std.cat);
          out.push(std);
        }
      }
    }

    return out;
  });

  const usedCategoriesCount = $derived(
    allDynamicCategories.filter((c) => tags.some((t) => t.category === c.cat)).length,
  );

  const resolvedCategories = $derived.by(() => {
    if (activePhaseTab === 'used') {
      const used = allDynamicCategories.filter((c) => tags.some((t) => t.category === c.cat));
      return used.length > 0 ? used : allDynamicCategories;
    }
    if (activePhaseTab === 'all') {
      return allDynamicCategories;
    }
    return ALL_CATEGORIES.filter((c) => c.phase === activePhaseTab);
  });

  // Dynamically resolve roster: unified projectStore.roster + any custom/substitute players in tags
  const resolvedPlayers = $derived.by(() => {
    const list = projectStore.roster.map((p) => projectStore.getPlayerDisplayLabel(p));
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
    return projectStore.tagHasPlayer(tag, player);
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

  // MODE 3: LABEL x LABEL (CROSS-TABULATION DUA SUMBU DESKRIPTOR)
  const descriptorGroupByName = $derived.by(() => {
    const map = new Map<string, string>();
    for (const btn of projectStore.activeBoard.buttons) {
      if (btn.kind === 'descriptor' && btn.group) {
        map.set(btn.name, btn.group);
      }
    }
    return map;
  });

  const availableCrossAxes = $derived.by(() => {
    const base: { id: string; label: string }[] = [
      { id: 'descriptor', label: 'Semua Label / Descriptor' },
      { id: 'outcome', label: 'Hasil Aksi (Outcome)' },
      { id: 'zone', label: 'Zona Lapangan' },
      { id: 'rating', label: 'Penilaian Pelatih' },
      { id: 'player', label: 'Pemain' },
    ];
    const groups = new Set<string>();
    for (const [, grp] of descriptorGroupByName) groups.add(grp);
    for (const t of tags) {
      for (const l of t.labels ?? []) {
        if (l.group) groups.add(l.group);
      }
    }
    for (const grp of groups) {
      base.push({ id: `group:${grp}`, label: `Grup: ${grp}` });
    }
    return base;
  });

  function getValuesForAxis(tag: VideoTagEvent, axis: string): string[] {
    if (axis === 'outcome') return [tag.outcomeLabel || 'Tanpa Hasil'];
    if (axis === 'zone') return [tag.zoneLabel || 'Tanpa Zona'];
    if (axis === 'rating') return [tag.rating || 'Belum Dinilai'];
    if (axis === 'player') {
      const list =
        tag.playersInvolved && tag.playersInvolved.length > 0
          ? tag.playersInvolved
          : tag.playerLabel
            ? [tag.playerLabel]
            : ['Tim Lawan'];
      return Array.from(new Set(list.map(normalizePlayerLabel)));
    }
    if (axis.startsWith('group:')) {
      const grp = axis.slice(6);
      const matched = (tag.labels ?? [])
        .filter((l) => (l.group || descriptorGroupByName.get(l.name)) === grp)
        .map((l) => l.name);
      return matched.length > 0 ? Array.from(new Set(matched)) : ['Tidak Ditandai'];
    }
    const labels = tag.labels?.map((l) => l.name) ?? [];
    return labels.length > 0 ? Array.from(new Set(labels)) : ['Tanpa Label'];
  }

  function collectAxisValues(clips: VideoTagEvent[], axis: string): string[] {
    const set = new Set<string>();
    for (const t of clips) {
      for (const v of getValuesForAxis(t, axis)) set.add(v);
    }
    return Array.from(set);
  }

  const crossBaseClips = $derived(
    crossTag === '__all__' ? tags : tags.filter((t) => t.category === crossTag)
  );
  const crossRows = $derived(collectAxisValues(crossBaseClips, crossRowGroup));
  const crossCols = $derived(collectAxisValues(crossBaseClips, crossColGroup));

  function getCrossClips(rowVal: string, colVal: string): VideoTagEvent[] {
    return crossBaseClips.filter(
      (t) =>
        getValuesForAxis(t, crossRowGroup).includes(rowVal) &&
        getValuesForAxis(t, crossColGroup).includes(colVal)
    );
  }

  function getCrossRowClips(rowVal: string): VideoTagEvent[] {
    return crossBaseClips.filter((t) => getValuesForAxis(t, crossRowGroup).includes(rowVal));
  }

  function getCrossColClips(colVal: string): VideoTagEvent[] {
    return crossBaseClips.filter((t) => getValuesForAxis(t, crossColGroup).includes(colVal));
  }

  function playClipGroup(clips: VideoTagEvent[], title: string) {
    if (clips.length === 0) return;
    if (onPlayClips) {
      onPlayClips(clips, `${title} (${clips.length} Klip)`);
    } else if (onPlayTag) {
      onPlayTag(clips[0]);
    }
    onClose();
  }

  // MODE 4: GRAFIK SVG (DONUT + BAR INTERAKTIF, RADAR KOMPARASI 2 PEMAIN & EFISIENSI FINISHING)
  const DONUT_R = 44;
  const DONUT_CIRC = 2 * Math.PI * DONUT_R;
  const RADAR_LABELS = ['Gol', 'Tembakan', 'Build-up', 'Transisi', 'Pressing', 'Set Piece'] as const;

  const chartCategoryStats = $derived.by(() => {
    const total = Math.max(1, tags.length);
    const items = resolvedCategories
      .map((cat) => {
        const clips = tags.filter((t) => t.category === cat.cat);
        return { cat, clips, count: clips.length, pct: (clips.length / total) * 100 };
      })
      .filter((x) => x.count > 0)
      .sort((a, b) => b.count - a.count);

    let offset = 0;
    return items.map((item) => {
      const segLen = (item.count / total) * DONUT_CIRC;
      const dashOffset = -offset;
      offset += segLen;
      return { ...item, segLen, dashOffset };
    });
  });

  const playerMinutesSecMap = $derived.by(() => {
    const map = new Map<string, number>();
    const matchEnd = Math.max(
      projectStore.duration || 0,
      ...tags.map((t) => t.endTime),
      ...projectStore.substitutions.map((s) => s.atTime),
      1
    );
    const pts = Array.from(
      new Set([0, matchEnd, ...projectStore.substitutions.map((s) => Math.max(0, Math.min(matchEnd, s.atTime)))])
    ).sort((a, b) => a - b);

    for (let i = 0; i < pts.length - 1; i++) {
      const dur = pts[i + 1] - pts[i];
      if (dur <= 0.05) continue;
      const lineup = projectStore.getActiveLineupIdsAt((pts[i] + pts[i + 1]) / 2);
      for (const pid of lineup) {
        const rp = projectStore.getRosterPlayerById(pid);
        if (!rp) continue;
        const lbl = projectStore.getPlayerDisplayLabel(rp);
        map.set(lbl, (map.get(lbl) ?? 0) + dur);
      }
    }
    return map;
  });

  const playerAnalytics = $derived.by(() => {
    return resolvedPlayers
      .map((player) => {
        const pClips = tags.filter((t) => matchesPlayer(t, player));
        const countCats = (cats: string[]) => pClips.filter((t) => cats.includes(t.category)).length;
        const goals = countCats(['Goal']);
        const shotsOn = countCats(['Shot on Target']);
        const shotsOff = countCats(['Shot Off Target']);
        const totalShots = goals + shotsOn + shotsOff;
        const accuracyPct = totalShots > 0 ? Math.round(((goals + shotsOn) / totalShots) * 100) : 0;
        const minutesSec = playerMinutesSecMap.get(player) ?? 0;
        const minPerGoal = goals > 0 && minutesSec > 0 ? `${(minutesSec / 60 / goals).toFixed(1)} mnt` : '-';
        const radar = [
          goals,
          totalShots,
          countCats(['Build-up 3-1', 'Build-up 4-0']),
          countCats(['Transition Attack', 'Transition Defense']),
          countCats(['Pressing High', 'Goalkeeper Save', 'Foul']),
          countCats(['Kick-in Set Piece', 'Corner Set Piece']),
        ];
        return {
          player,
          totalClips: pClips.length,
          goals,
          shotsOn,
          shotsOff,
          totalShots,
          accuracyPct,
          minutesSec,
          minPerGoal,
          radar,
        };
      })
      .filter((r) => r.totalClips > 0 || r.minutesSec > 0);
  });

  const radarMaxes = $derived.by(() => {
    const maxes = [1, 1, 1, 1, 1, 1];
    for (const p of playerAnalytics) {
      for (let i = 0; i < 6; i++) {
        if (p.radar[i] > maxes[i]) maxes[i] = p.radar[i];
      }
    }
    return maxes;
  });

  const effPlayerA = $derived(
    comparePlayerA && playerAnalytics.some((p) => p.player === comparePlayerA)
      ? comparePlayerA
      : playerAnalytics[0]?.player || ''
  );
  const effPlayerB = $derived(
    comparePlayerB && playerAnalytics.some((p) => p.player === comparePlayerB)
      ? comparePlayerB
      : playerAnalytics[1]?.player || playerAnalytics[0]?.player || ''
  );
  const statsPlayerA = $derived(playerAnalytics.find((p) => p.player === effPlayerA));
  const statsPlayerB = $derived(playerAnalytics.find((p) => p.player === effPlayerB));

  function radarPoint(idx: number, scale: number, cx = 120, cy = 115, radius = 78): [number, number] {
    const angle = -Math.PI / 2 + (idx * 2 * Math.PI) / 6;
    return [cx + Math.cos(angle) * radius * scale, cy + Math.sin(angle) * radius * scale];
  }

  function buildRadarPolygon(values: number[], maxes: number[]): string {
    return values
      .map((val, idx) => {
        const [x, y] = radarPoint(idx, Math.max(0.08, val / Math.max(1, maxes[idx])));
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
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

  let includeMatchClockInExport = $state<boolean>(true);

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
    } else if (matrixView === 'label_label') {
      csv = `${crossRowGroup} \\ ${crossColGroup},` + crossCols.map((c) => `"${c}"`).join(',') + ',TOTAL KLIP,DURASI (dtk)\n';
      for (const r of crossRows) {
        const rowCounts = crossCols.map((c) => getCrossClips(r, c).length);
        const rowClips = getCrossRowClips(r);
        csv += `"${r}",` + rowCounts.join(',') + `,${rowClips.length},${sumDurationSec(rowClips).toFixed(1)}\n`;
      }
      const colTotals = crossCols.map((c) => getCrossColClips(c).length);
      csv += `"TOTAL",` + colTotals.join(',') + `,${crossBaseClips.length},${sumDurationSec(crossBaseClips).toFixed(1)}\n`;
    } else if (matrixView === 'charts') {
      csv = 'Pemain,Total Klip,Gol,Shot OT,Shot Off,Akurasi Shot (%),Menit Bermain (mnt),Menit / Gol\n';
      for (const p of playerAnalytics) {
        csv += `"${p.player}",${p.totalClips},${p.goals},${p.shotsOn},${p.shotsOff},${p.accuracyPct},${(p.minutesSec / 60).toFixed(1)},"${p.minPerGoal}"\n`;
      }
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

    if (includeMatchClockInExport && tags.length > 0) {
      csv += '\n"DAFTAR KLIP & WAKTU PERTANDINGAN (MATCH CLOCK)"\n';
      csv += 'Judul,Kategori,Pemain,Match Clock Mulai,Match Clock Selesai,Video Mulai (s),Video Selesai (s)\n';
      for (const t of tags) {
        const mcStart = projectStore.formatMatchClock(t.startTime);
        const mcEnd = projectStore.formatMatchClock(t.endTime);
        csv += `"${t.title}","${t.category}","${t.playerLabel || ''}","${mcStart}","${mcEnd}",${t.startTime.toFixed(1)},${t.endTime.toFixed(1)}\n`;
      }
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
          Distribusi frekuensi aksi pemain × tag dari papan aktif ({projectStore.activeBoard.name})
        </p>
      </div>

      <div class="header-actions">
        {#if projectStore.periodKickoffs.length > 0}
          <span class="match-pill" title="Kick-off Match Clock aktif">
            {projectStore.periodKickoffs.map((k) => `${k.period === 1 ? 'B1' : k.period === 2 ? 'B2' : 'ET'} ${Math.floor(k.videoTime)}s`).join(' · ')}
          </span>
        {/if}
        <button
          type="button"
          class="btn-clean"
          onclick={() => (includeMatchClockInExport = !includeMatchClockInExport)}
          title="Sertakan daftar klip dengan Match Clock pada file CSV"
        >
          <span>{includeMatchClockInExport ? '✓ Match Clock CSV' : 'Matriks Saja'}</span>
        </button>
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
          <button
            class="tab-pill"
            class:active={matrixView === 'label_label'}
            onclick={() => (matrixView = 'label_label')}
          >
            Label × Label
          </button>
          <button
            class="tab-pill"
            class:active={matrixView === 'charts'}
            onclick={() => (matrixView = 'charts')}
          >
            Grafik & Radar
          </button>
        </div>
        {#if matrixView === 'tag_player'}
          {#if isCustomBoard}
            <button
              class="tab-pill"
              class:active={activePhaseTab === 'all'}
              onclick={() => (activePhaseTab = 'all')}
            >
              <span>Papan Aktif ({allDynamicCategories.length})</span>
            </button>
            <button
              class="tab-pill"
              class:active={activePhaseTab === 'used'}
              onclick={() => (activePhaseTab = 'used')}
            >
              <span>Ada Klip ({usedCategoriesCount})</span>
            </button>
          {:else}
            {#each PHASES as ph}
              <button
                class="tab-pill"
                class:active={activePhaseTab === ph.id}
                onclick={() => (activePhaseTab = ph.id)}
              >
                <span>{ph.id === 'all' ? `Semua Aksi (${allDynamicCategories.length})` : ph.label}</span>
              </button>
            {/each}
            <button
              class="tab-pill"
              class:active={activePhaseTab === 'used'}
              onclick={() => (activePhaseTab = 'used')}
            >
              <span>Ada Klip ({usedCategoriesCount})</span>
            </button>
          {/if}
        {:else if matrixView === 'label_label'}
          <div class="cross-controls">
            <label class="cross-field">
              <span>Tag:</span>
              <select class="cross-select" bind:value={crossTag}>
                <option value="__all__">Semua Tag ({tags.length})</option>
                {#each labelRows as cat}
                  <option value={cat}>{cat}</option>
                {/each}
              </select>
            </label>
            <label class="cross-field">
              <span>Baris:</span>
              <select class="cross-select" bind:value={crossRowGroup}>
                {#each availableCrossAxes as ax}
                  <option value={ax.id}>{ax.label}</option>
                {/each}
              </select>
            </label>
            <label class="cross-field">
              <span>Kolom:</span>
              <select class="cross-select" bind:value={crossColGroup}>
                {#each availableCrossAxes as ax}
                  <option value={ax.id}>{ax.label}</option>
                {/each}
              </select>
            </label>
          </div>
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
                      <span class="th-icon" style={cat.icon === '●' ? `color: ${cat.color};` : ''}>{cat.icon}</span>
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
        {:else if matrixView === 'tag_label'}
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
        {:else if matrixView === 'label_label'}
          <!-- MODE 3: LABEL x LABEL CROSS-TABULATION -->
          <table class="matrix-table">
            <thead>
              <tr>
                <th class="th-player">Sumbu Baris \ Kolom</th>
                {#each crossCols as colVal}
                  <th
                    class="th-action"
                    onclick={() => playClipGroup(getCrossColClips(colVal), colVal)}
                    title="Putar semua klip {colVal}"
                  >
                    <span class="th-label">{colVal}</span>
                  </th>
                {/each}
                <th class="th-total" onclick={() => playClipGroup(crossBaseClips, 'Semua Silang Label')}>TOTAL</th>
              </tr>
            </thead>
            <tbody>
              {#if crossRows.length === 0 || crossCols.length === 0}
                <tr>
                  <td colspan={Math.max(2, crossCols.length + 2)} class="cell-zero">
                    Belum ada data yang cocok untuk kombinasi Tag & sumbu ini.
                  </td>
                </tr>
              {:else}
                {#each crossRows as rowVal}
                  {@const rowClips = getCrossRowClips(rowVal)}
                  <tr class="tr-player">
                    <td
                      class="td-player"
                      onclick={() => playClipGroup(rowClips, rowVal)}
                      title="Putar semua klip {rowVal}"
                    >
                      <span class="player-name">{rowVal}</span>
                    </td>
                    {#each crossCols as colVal}
                      {@const cellClips = getCrossClips(rowVal, colVal)}
                      <td class="td-cell" class:has-data={cellClips.length > 0}>
                        {#if cellClips.length > 0}
                          <button
                            class="cell-btn"
                            onclick={() => playClipGroup(cellClips, `${rowVal} × ${colVal}`)}
                            title="Putar {cellClips.length} klip {rowVal} × {colVal} ({formatPhaseDuration(cellClips)})"
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
                      <button class="total-btn" onclick={() => playClipGroup(rowClips, rowVal)}>
                        {rowClips.length}
                      </button>
                      <div class="phase-dur-hint">{formatPhaseDuration(rowClips)}</div>
                    </td>
                  </tr>
                {/each}
                <tr class="tr-footer">
                  <td class="td-footer-label">TOTAL KOLOM</td>
                  {#each crossCols as colVal}
                    {@const colClips = getCrossColClips(colVal)}
                    <td class="td-footer-cell">
                      <button class="col-total-btn" onclick={() => playClipGroup(colClips, colVal)}>
                        {colClips.length}
                      </button>
                      <div class="phase-dur-hint">{formatPhaseDuration(colClips)}</div>
                    </td>
                  {/each}
                  <td class="td-grand-total">
                    <span>{crossBaseClips.length}</span>
                    <div class="phase-dur-hint grand">{formatPhaseDuration(crossBaseClips)}</div>
                  </td>
                </tr>
              {/if}
            </tbody>
          </table>
        {:else}
          <!-- MODE 4: GRAFIK SVG, RADAR KOMPARASI PEMAIN & EFISIENSI -->
          <div class="charts-dashboard">
            <div class="charts-grid">
              <!-- KARTU 1: DONUT & BAR INTERAKTIF -->
              <section class="chart-card">
                <div class="chart-card-hdr">
                  <h4>Distribusi Aksi & Kategori</h4>
                  <span>Klik segmen / bar untuk putar klip</span>
                </div>
                {#if chartCategoryStats.length === 0}
                  <p class="chart-empty">Belum ada klip untuk divisualisasikan.</p>
                {:else}
                  <div class="donut-wrap">
                    <svg viewBox="0 0 120 120" class="donut-svg" aria-label="Donut Distribusi Kategori">
                      <circle cx="60" cy="60" r={DONUT_R} fill="none" stroke="#1e293b" stroke-width="18" />
                      {#each chartCategoryStats as seg (seg.cat.id)}
                        <circle
                          cx="60"
                          cy="60"
                          r={DONUT_R}
                          fill="none"
                          stroke={seg.cat.color}
                          stroke-width="18"
                          stroke-dasharray="{seg.segLen} {DONUT_CIRC}"
                          stroke-dashoffset={seg.dashOffset}
                          transform="rotate(-90 60 60)"
                          class="donut-slice"
                          role="button"
                          tabindex="0"
                          aria-label="{seg.cat.label}: {seg.count} klip"
                          onclick={() => handleColClick(seg.cat)}
                          onkeydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              handleColClick(seg.cat);
                            }
                          }}
                        >
                          <title>{seg.cat.label}: {seg.count} klip ({seg.pct.toFixed(0)}%)</title>
                        </circle>
                      {/each}
                      <text x="60" y="57" text-anchor="middle" class="donut-total-num">{tags.length}</text>
                      <text x="60" y="70" text-anchor="middle" class="donut-total-lbl">KLIP</text>
                    </svg>

                    <div class="bars-col">
                      {#each chartCategoryStats.slice(0, 8) as item (item.cat.id)}
                        <button
                          type="button"
                          class="bar-row"
                          onclick={() => handleColClick(item.cat)}
                          title="Putar {item.count} klip {item.cat.label}"
                        >
                          <span class="bar-name">{item.cat.icon} {item.cat.shortLabel}</span>
                          <span class="bar-track">
                            <span
                              class="bar-fill"
                              style="width: {Math.max(4, item.pct)}%; background-color: {item.cat.color};"
                            ></span>
                          </span>
                          <span class="bar-val">{item.count} ({item.pct.toFixed(0)}%)</span>
                        </button>
                      {/each}
                    </div>
                  </div>
                {/if}
              </section>

              <!-- KARTU 2: RADAR 6-SUMBU KOMPARASI 2 PEMAIN -->
              <section class="chart-card">
                <div class="chart-card-hdr">
                  <h4>Radar Komparasi Pemain (6 Sumbu)</h4>
                  <div class="radar-pickers">
                    <select class="cross-select pick-a" value={effPlayerA} onchange={(e) => (comparePlayerA = e.currentTarget.value)}>
                      {#each playerAnalytics as p}
                        <option value={p.player}>{p.player}</option>
                      {/each}
                    </select>
                    <span class="vs-badge">VS</span>
                    <select class="cross-select pick-b" value={effPlayerB} onchange={(e) => (comparePlayerB = e.currentTarget.value)}>
                      {#each playerAnalytics as p}
                        <option value={p.player}>{p.player}</option>
                      {/each}
                    </select>
                  </div>
                </div>
                {#if playerAnalytics.length === 0}
                  <p class="chart-empty">Belum ada data pemain pada klip.</p>
                {:else}
                  <div class="radar-wrap">
                    <svg viewBox="0 0 240 230" class="radar-svg" aria-label="Radar Komparasi Pemain">
                      {#each [0.33, 0.66, 1] as ring}
                        <polygon
                          points={RADAR_LABELS.map((_, i) => radarPoint(i, ring).map((n) => n.toFixed(1)).join(',')).join(' ')}
                          fill="none"
                          stroke="#334155"
                          stroke-width="1"
                        />
                      {/each}
                      {#each RADAR_LABELS as lbl, i}
                        {@const [ax, ay] = radarPoint(i, 1)}
                        {@const [lx, ly] = radarPoint(i, 1.2)}
                        <line x1="120" y1="115" x2={ax} y2={ay} stroke="#334155" stroke-width="1" />
                        <text x={lx} y={ly + 3} text-anchor="middle" class="radar-axis-lbl">{lbl}</text>
                      {/each}
                      {#if statsPlayerB}
                        <polygon
                          points={buildRadarPolygon(statsPlayerB.radar, radarMaxes)}
                          fill="rgba(245, 158, 11, 0.22)"
                          stroke="#f59e0b"
                          stroke-width="2"
                        />
                      {/if}
                      {#if statsPlayerA}
                        <polygon
                          points={buildRadarPolygon(statsPlayerA.radar, radarMaxes)}
                          fill="rgba(56, 189, 248, 0.28)"
                          stroke="#38bdf8"
                          stroke-width="2"
                        />
                      {/if}
                    </svg>
                    <div class="radar-legend">
                      {#if statsPlayerA}
                        <div class="leg-item a"><span class="leg-dot"></span><strong>{statsPlayerA.player}</strong> ({statsPlayerA.totalClips} aksi · {statsPlayerA.goals} gol)</div>
                      {/if}
                      {#if statsPlayerB}
                        <div class="leg-item b"><span class="leg-dot"></span><strong>{statsPlayerB.player}</strong> ({statsPlayerB.totalClips} aksi · {statsPlayerB.goals} gol)</div>
                      {/if}
                    </div>
                  </div>
                {/if}
              </section>
            </div>

            <!-- TABEL EFISIENSI TEMBAKAN & MENIT PER GOL -->
            <section class="chart-card eff-card">
              <div class="chart-card-hdr">
                <h4>Efisiensi Finishing & Kontribusi Menit Bermain</h4>
                <span>Akurasi Tembakan = (Gol + Shot OT) / Total Tembakan</span>
              </div>
              <table class="matrix-table eff-table">
                <thead>
                  <tr>
                    <th class="th-player">Pemain</th>
                    <th class="th-action">Klip</th>
                    <th class="th-action">Gol</th>
                    <th class="th-action">Shot OT</th>
                    <th class="th-action">Shot Off</th>
                    <th class="th-action">Akurasi %</th>
                    <th class="th-action">Menit Main</th>
                    <th class="th-total">Menit / Gol</th>
                  </tr>
                </thead>
                <tbody>
                  {#each playerAnalytics as row (row.player)}
                    <tr class="tr-player">
                      <td class="td-player" onclick={() => handleRowClick(row.player)}>
                        <span class="player-name">{row.player}</span>
                      </td>
                      <td class="td-cell">{row.totalClips}</td>
                      <td class="td-cell"><strong>{row.goals}</strong></td>
                      <td class="td-cell">{row.shotsOn}</td>
                      <td class="td-cell">{row.shotsOff}</td>
                      <td class="td-cell">
                        <span class="acc-pill" class:high={row.accuracyPct >= 60}>{row.totalShots > 0 ? `${row.accuracyPct}%` : '-'}</span>
                      </td>
                      <td class="td-cell">{row.minutesSec > 0 ? `${(row.minutesSec / 60).toFixed(1)} mnt` : '-'}</td>
                      <td class="td-total">{row.minPerGoal}</td>
                    </tr>
                  {/each}
                </tbody>
              </table>
            </section>
          </div>
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
    width: min(1060px, 96vw);
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

  @media (max-width: 768px) {
    .modal-header,
    .filter-bar {
      flex-wrap: wrap;
      gap: 8px;
      padding: 12px 14px;
    }

    .view-mode-switch {
      border-right: none;
      padding-right: 0;
    }
  }

  .cross-controls {
    display: flex;
    flex-wrap: wrap;
    gap: 8px;
    align-items: center;
  }

  .cross-field {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
  }

  .cross-select {
    background: #0f172a;
    color: #e2e8f0;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 4px 8px;
    font-size: 11px;
    font-weight: 600;
  }

  .charts-dashboard {
    display: flex;
    flex-direction: column;
    gap: 14px;
    padding: 4px;
  }

  .charts-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(320px, 1fr));
    gap: 14px;
  }

  .chart-card {
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 10px;
    padding: 12px 14px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .chart-card-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    flex-wrap: wrap;
    gap: 8px;
  }

  .chart-card-hdr h4 {
    margin: 0;
    font-size: 12.5px;
    font-weight: 800;
    color: #f8fafc;
  }

  .chart-card-hdr > span {
    font-size: 10.5px;
    color: #64748b;
  }

  .chart-empty {
    margin: 20px 0;
    text-align: center;
    color: #64748b;
    font-size: 12px;
  }

  .donut-wrap {
    display: flex;
    align-items: center;
    gap: 14px;
    flex-wrap: wrap;
  }

  .donut-svg {
    width: 148px;
    height: 148px;
    flex-shrink: 0;
  }

  .donut-slice {
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .donut-slice:hover {
    opacity: 0.8;
  }

  .donut-total-num {
    fill: #f8fafc;
    font-size: 20px;
    font-weight: 900;
  }

  .donut-total-lbl {
    fill: #64748b;
    font-size: 8px;
    font-weight: 800;
    letter-spacing: 0.08em;
  }

  .bars-col {
    flex: 1;
    min-width: 190px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .bar-row {
    display: grid;
    grid-template-columns: 105px 1fr 64px;
    align-items: center;
    gap: 8px;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 5px;
    padding: 3px 5px;
    cursor: pointer;
    text-align: left;
    color: #cbd5e1;
    font-size: 11px;
  }

  .bar-row:hover {
    background: #1e293b;
    border-color: #334155;
  }

  .bar-name {
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    font-weight: 600;
  }

  .bar-track {
    height: 7px;
    background: #1e293b;
    border-radius: 999px;
    overflow: hidden;
  }

  .bar-fill {
    display: block;
    height: 100%;
    border-radius: 999px;
  }

  .bar-val {
    text-align: right;
    font-size: 10.5px;
    font-weight: 700;
    color: #94a3b8;
  }

  .radar-pickers {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .pick-a {
    border-color: #0284c7;
  }

  .pick-b {
    border-color: #d97706;
  }

  .vs-badge {
    font-size: 10px;
    font-weight: 900;
    color: #64748b;
  }

  .radar-wrap {
    display: flex;
    align-items: center;
    gap: 12px;
    flex-wrap: wrap;
    justify-content: center;
  }

  .radar-svg {
    width: 230px;
    height: 220px;
    flex-shrink: 0;
  }

  .radar-axis-lbl {
    fill: #94a3b8;
    font-size: 9px;
    font-weight: 700;
  }

  .radar-legend {
    display: flex;
    flex-direction: column;
    gap: 6px;
    font-size: 11px;
    color: #cbd5e1;
  }

  .leg-item {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .leg-dot {
    width: 10px;
    height: 10px;
    border-radius: 3px;
    display: inline-block;
  }

  .leg-item.a .leg-dot {
    background: #38bdf8;
  }

  .leg-item.b .leg-dot {
    background: #f59e0b;
  }

  .acc-pill {
    display: inline-block;
    padding: 2px 7px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    background: #1e293b;
    color: #94a3b8;
  }

  .acc-pill.high {
    background: rgba(16, 185, 129, 0.18);
    color: #34d399;
    border: 1px solid #10b981;
  }
</style>

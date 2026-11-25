<script lang="ts">
  import { tick } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { projectStore, isTauriDesktop } from '$lib/stores/projectStore.svelte';
  import type {
    PeriodKickoff,
    Point2D,
    RosterPlayer,
    SubstitutionEvent,
    VideoTagEvent,
  } from '$lib/types';
  import {
    X,
    BarChart3,
    Upload,
    Plus,
    Trash2,
    Flame,
    Share2,
    Users,
    TrendingUp,
    Download,
    Sparkles,
  } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  interface SeasonMatchRecord {
    id: string;
    title: string;
    exportedAt: string;
    duration: number;
    roster: RosterPlayer[];
    periodKickoffs: PeriodKickoff[];
    startingLineupIds: string[];
    substitutions: SubstitutionEvent[];
    tags: VideoTagEvent[];
  }

  let matches = $state<SeasonMatchRecord[]>([]);
  let activeTab = $state<'trends' | 'spatial' | 'players' | 'quartets'>('trends');
  let spatialMode = $state<'heatmap' | 'passing'>('heatmap');
  let spatialPlayerFilter = $state<string>('all');
  let statusMsg = $state<string | null>(null);
  let fileInputEl = $state<HTMLInputElement | undefined>(undefined);
  let spatialCanvasEl = $state<HTMLCanvasElement | null>(null);

  function notify(msg: string) {
    statusMsg = msg;
    setTimeout(() => {
      if (statusMsg === msg) statusMsg = null;
    }, 3500);
  }

  function parseProjectToRecord(jsonStr: string, fallbackName: string): SeasonMatchRecord | null {
    try {
      const data = JSON.parse(jsonStr);
      const tags: VideoTagEvent[] = Array.isArray(data.tags) ? data.tags : [];
      const roster: RosterPlayer[] = Array.isArray(data.roster) ? data.roster : projectStore.roster;
      const subs: SubstitutionEvent[] = Array.isArray(data.substitutions) ? data.substitutions : [];
      const kickoffs: PeriodKickoff[] = Array.isArray(data.periodKickoffs) ? data.periodKickoffs : [];
      const s5: string[] = Array.isArray(data.startingLineupIds)
        ? data.startingLineupIds
        : roster.filter((p) => !p.isOpponent).slice(0, 5).map((p) => p.id);

      return {
        id: `match-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        title: data.matchInfo?.title || fallbackName.replace(/\.(futsal|json)$/i, ''),
        exportedAt: data.exportedAt || new Date().toISOString(),
        duration: Number(data.matchInfo?.duration) || 120,
        roster,
        periodKickoffs: kickoffs,
        startingLineupIds: s5,
        substitutions: subs,
        tags,
      };
    } catch {
      return null;
    }
  }

  async function handleImportFutsalFiles() {
    if (isTauriDesktop()) {
      try {
        const { open } = await import('@tauri-apps/plugin-dialog');
        const selected = await open({
          title: 'Impor Beberapa Proyek Pertandingan (.futsal / .json)',
          multiple: true,
          filters: [{ name: 'FutsalTag Project', extensions: ['futsal', 'json'] }],
        });
        if (!selected) return;
        const paths = Array.isArray(selected) ? selected : [selected];
        let added = 0;
        for (const p of paths) {
          if (typeof p !== 'string') continue;
          const raw = await invoke<string>('load_project_file', { filePath: p });
          const fname = p.split(/[\\/]/).pop() || p;
          const rec = parseProjectToRecord(raw, fname);
          if (rec) {
            matches = [...matches, rec];
            added += 1;
          }
        }
        notify(`Berhasil mengimpor ${added} pertandingan ke Season Hub.`);
      } catch (err: any) {
        notify(`Gagal impor file: ${err?.message || err}`);
      }
    } else {
      fileInputEl?.click();
    }
  }

  function handleBrowserFilesChange(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const files = Array.from(input.files);
    let added = 0;
    let done = 0;
    for (const file of files) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const txt = ev.target?.result as string;
        if (txt) {
          const rec = parseProjectToRecord(txt, file.name);
          if (rec) {
            matches = [...matches, rec];
            added += 1;
          }
        }
        done += 1;
        if (done === files.length) {
          notify(`Berhasil memuat ${added} berkas .futsal.`);
        }
      };
      reader.readAsText(file);
    }
    input.value = '';
  }

  function handleImportCurrentMatch() {
    const raw = projectStore.exportProjectJson();
    const rec = parseProjectToRecord(raw, projectStore.videoTitle || 'Laga Aktif');
    if (rec) {
      matches = [...matches, rec];
      notify(`Laga aktif "${rec.title}" ditambahkan.`);
    }
  }

  function loadDemoSeason() {
    const baseRoster = projectStore.roster.filter((p) => !p.isOpponent);
    const ids = baseRoster.slice(0, 5).map((p) => p.id);
    const makeTag = (
      id: string,
      cat: string,
      t: number,
      player: string,
      target: string | undefined,
      x: number,
      y: number,
      teamSide: 'home' | 'away' = 'home',
      ok = true
    ): VideoTagEvent => ({
      id,
      title: `${cat} - ${player}`,
      category: cat,
      startTime: t,
      endTime: t + 7,
      color: cat === 'Goal' ? '#10b981' : '#0ea5e9',
      playerLabel: player,
      playersInvolved: [player],
      passTargetPlayer: target,
      outcomeLabel: ok ? 'Gol / Sukses' : 'Keluar / Gagal',
      courtCoord: { x, y },
      teamSide,
    });

    matches = [
      {
        id: 'demo-md1',
        title: 'MD1: vs Blacksteel FC',
        exportedAt: '2026-11-01T14:00:00Z',
        duration: 1200,
        roster: projectStore.roster,
        periodKickoffs: [{ period: 1, videoTime: 0, label: 'Babak 1' }],
        startingLineupIds: ids,
        substitutions: baseRoster[5]
          ? [{ id: 's1', atTime: 480, period: 1, playerOut: ids[1], playerIn: baseRoster[5].id, teamSide: 'home' }]
          : [],
        tags: [
          makeTag('d1-1', 'Goal', 110, '#9 Pivot', '#7 Flank Kiri', 35, 9.5),
          makeTag('d1-2', 'Goal', 320, '#7 Flank Kiri', '#9 Pivot', 33, 4.2),
          makeTag('d1-3', 'Shot on Target', 410, '#11 Flank Kanan', '#4 Anchor', 30, 14.5),
          makeTag('d1-4', 'Pressing High', 520, '#4 Anchor', '#7 Flank Kiri', 25, 10.0),
          makeTag('d1-5', 'Kick-in Set Piece', 640, '#7 Flank Kiri', '#9 Pivot', 28, 1.5),
          makeTag('d1-6', 'Goal', 720, 'Tim Lawan', undefined, 7, 10.2, 'away', false),
        ],
      },
      {
        id: 'demo-md2',
        title: 'MD2: vs Bintang Timur',
        exportedAt: '2026-11-08T14:00:00Z',
        duration: 1200,
        roster: projectStore.roster,
        periodKickoffs: [{ period: 1, videoTime: 0, label: 'Babak 1' }],
        startingLineupIds: ids,
        substitutions: baseRoster[5]
          ? [{ id: 's2', atTime: 600, period: 1, playerOut: ids[2], playerIn: baseRoster[5].id, teamSide: 'home' }]
          : [],
        tags: [
          makeTag('d2-1', 'Goal', 180, '#11 Flank Kanan', '#9 Pivot', 34, 13.5),
          makeTag('d2-2', 'Shot on Target', 290, '#9 Pivot', '#11 Flank Kanan', 31, 9.0),
          makeTag('d2-3', 'Shot on Target', 430, '#4 Anchor', '#7 Flank Kiri', 28, 8.2),
          makeTag('d2-4', 'Power Play', 820, '#4 Anchor', '#9 Pivot', 29, 10.5),
          makeTag('d2-5', 'Pressing High', 890, '#7 Flank Kiri', '#4 Anchor', 23, 4.5),
          makeTag('d2-6', 'Corner Set Piece', 960, '#11 Flank Kanan', '#9 Pivot', 38, 18.5),
          makeTag('d2-7', 'Goal', 1020, '#9 Pivot', '#4 Anchor', 36, 10.0),
        ],
      },
      {
        id: 'demo-md3',
        title: 'MD3: vs Cosmo JNE',
        exportedAt: '2026-11-15T14:00:00Z',
        duration: 1200,
        roster: projectStore.roster,
        periodKickoffs: [{ period: 1, videoTime: 0, label: 'Babak 1' }],
        startingLineupIds: ids,
        substitutions: [],
        tags: [
          makeTag('d3-1', 'Goal', 95, '#9 Pivot', '#11 Flank Kanan', 35.5, 11.0),
          makeTag('d3-2', 'Goal', 250, '#7 Flank Kiri', '#9 Pivot', 33.0, 5.0),
          makeTag('d3-3', 'Goal', 510, '#4 Anchor', '#9 Pivot', 30.0, 10.0),
          makeTag('d3-4', 'Shot on Target', 610, '#11 Flank Kanan', '#7 Flank Kiri', 32.0, 15.0),
          makeTag('d3-5', 'Pressing High', 700, '#7 Flank Kiri', '#9 Pivot', 26.0, 3.8),
          makeTag('d3-6', 'Power Play', 880, '#4 Anchor', '#11 Flank Kanan', 29.0, 12.0),
          makeTag('d3-7', 'Kick-in Set Piece', 990, '#7 Flank Kiri', '#4 Anchor', 27.0, 1.2),
        ],
      },
    ];
    notify('3 pertandingan demo musim berhasil dimuat.');
  }

  // --- MATCH TREND METRICS ---
  interface MatchTrendRow {
    id: string;
    title: string;
    goals: number;
    conceded: number;
    sot: number;
    pressing: number;
    powerPlay: number;
    setPiece: number;
    totalClips: number;
  }

  const matchTrends = $derived.by<MatchTrendRow[]>(() => {
    return matches.map((m) => {
      let goals = 0;
      let conceded = 0;
      let sot = 0;
      let pressing = 0;
      let powerPlay = 0;
      let setPiece = 0;

      for (const t of m.tags) {
        const isAway = t.teamSide === 'away' || projectStore.normalizePlayerLabel(t.playerLabel) === 'Tim Lawan';
        const isGoal = /\b(goal|gol)\b/i.test(t.category);
        if (isGoal && !isAway) goals += 1;
        if ((isGoal && isAway) || /kebobolan|conceded/i.test(t.category)) conceded += 1;
        if (/shot on target|shoot ot|\bsot\b/i.test(t.category) && !isAway) sot += 1;
        if (/pressing/i.test(t.category) && t.outcomeLabel !== 'Keluar / Gagal' && !isAway) pressing += 1;
        if (/power play|5v4/i.test(t.category)) powerPlay += 1;
        if (/kick-in|corner|set piece/i.test(t.category)) setPiece += 1;
      }

      return {
        id: m.id,
        title: m.title,
        goals,
        conceded,
        sot,
        pressing,
        powerPlay,
        setPiece,
        totalClips: m.tags.length,
      };
    });
  });

  const seasonTotals = $derived.by(() => {
    return matchTrends.reduce(
      (acc, r) => ({
        matches: acc.matches + 1,
        goals: acc.goals + r.goals,
        conceded: acc.conceded + r.conceded,
        sot: acc.sot + r.sot,
        pressing: acc.pressing + r.pressing,
        powerPlay: acc.powerPlay + r.powerPlay,
        setPiece: acc.setPiece + r.setPiece,
      }),
      { matches: 0, goals: 0, conceded: 0, sot: 0, pressing: 0, powerPlay: 0, setPiece: 0 }
    );
  });

  const maxChartY = $derived(
    Math.max(
      4,
      ...matchTrends.flatMap((m) => [m.goals, m.sot, m.pressing, m.powerPlay, m.setPiece])
    )
  );

  // --- HELPER: INTERVALS FOR MINUTES & QUARTET ---
  function computeMatchIntervals(m: SeasonMatchRecord) {
    const koStart =
      m.periodKickoffs.length > 0 ? Math.min(...m.periodKickoffs.map((k) => k.videoTime)) : 0;
    const maxSub = m.substitutions.reduce((mx, s) => Math.max(mx, s.atTime + 1), 0);
    const maxTag = m.tags.reduce((mx, t) => Math.max(mx, t.endTime), 0);
    const end = Math.max(m.duration || 120, maxSub, maxTag, koStart + 10);
    const sortedSubs = [...m.substitutions].sort((a, b) => a.atTime - b.atTime);

    const getLineupAt = (tSec: number) => {
      let lineup = [...m.startingLineupIds];
      for (const sub of sortedSubs) {
        if (sub.atTime > tSec + 0.001) break;
        const idx = lineup.indexOf(sub.playerOut);
        if (idx !== -1) {
          if (!lineup.includes(sub.playerIn)) lineup[idx] = sub.playerIn;
          else lineup = lineup.filter((id) => id !== sub.playerOut);
        } else if (!lineup.includes(sub.playerIn)) {
          lineup.push(sub.playerIn);
        }
      }
      return lineup;
    };

    const cuts = Array.from(
      new Set([
        koStart,
        ...sortedSubs.map((s) => s.atTime).filter((t) => t > koStart + 0.01 && t < end - 0.01),
        end,
      ])
    ).sort((a, b) => a - b);

    const intervals: { start: number; end: number; lineupIds: string[] }[] = [];
    for (let i = 0; i < cuts.length - 1; i++) {
      if (cuts[i + 1] - cuts[i] >= 0.05) {
        intervals.push({ start: cuts[i], end: cuts[i + 1], lineupIds: getLineupAt(cuts[i] + 0.01) });
      }
    }
    return { koStart, end, intervals };
  }

  // --- PLAYER LEADERBOARD ACROSS MATCHES ---
  interface SeasonPlayerRow {
    label: string;
    matchesCount: number;
    totalSec: number;
    totalActions: number;
    goalInvolvements: number;
    sot: number;
    accuracyPct: number;
  }

  const playerLeaderboard = $derived.by<SeasonPlayerRow[]>(() => {
    const map = new Map<
      string,
      {
        label: string;
        matchIds: Set<string>;
        totalSec: number;
        totalActions: number;
        goalInvolvements: number;
        sot: number;
        successCount: number;
        ratedCount: number;
      }
    >();

    const ensure = (label: string) => {
      let row = map.get(label);
      if (!row) {
        row = {
          label,
          matchIds: new Set(),
          totalSec: 0,
          totalActions: 0,
          goalInvolvements: 0,
          sot: 0,
          successCount: 0,
          ratedCount: 0,
        };
        map.set(label, row);
      }
      return row;
    };

    for (const m of matches) {
      const { intervals } = computeMatchIntervals(m);
      const byId = new Map(m.roster.map((p) => [p.id, p]));

      for (const iv of intervals) {
        const dur = iv.end - iv.start;
        for (const pid of iv.lineupIds) {
          const p = byId.get(pid);
          if (!p || p.isOpponent || p.name === 'Tim Lawan') continue;
          const lbl = projectStore.getPlayerDisplayLabel(p);
          const row = ensure(lbl);
          row.matchIds.add(m.id);
          row.totalSec += dur;
        }
      }

      for (const t of m.tags) {
        const isAway = t.teamSide === 'away' || projectStore.normalizePlayerLabel(t.playerLabel) === 'Tim Lawan';
        if (isAway) continue;
        const primary = projectStore.normalizePlayerLabel(t.playerLabel);
        if (primary === 'Tim Lawan') continue;

        const row = ensure(primary);
        row.matchIds.add(m.id);
        row.totalActions += 1;
        if (/\b(goal|gol)\b/i.test(t.category)) row.goalInvolvements += 1;
        if (/shot on target|shoot ot|\bsot\b/i.test(t.category)) row.sot += 1;
        if (t.outcomeLabel) {
          row.ratedCount += 1;
          if (t.outcomeLabel === 'Gol / Sukses') row.successCount += 1;
        }

        if (t.passTargetPlayer) {
          const recv = projectStore.normalizePlayerLabel(t.passTargetPlayer);
          if (recv && recv !== primary && recv !== 'Tim Lawan' && /\b(goal|gol)\b/i.test(t.category)) {
            const rRow = ensure(recv);
            rRow.matchIds.add(m.id);
            rRow.goalInvolvements += 1;
          }
        }
      }
    }

    return Array.from(map.values())
      .map((r) => ({
        label: r.label,
        matchesCount: r.matchIds.size,
        totalSec: r.totalSec,
        totalActions: r.totalActions,
        goalInvolvements: r.goalInvolvements,
        sot: r.sot,
        accuracyPct: r.ratedCount > 0 ? Math.round((r.successCount / r.ratedCount) * 100) : 0,
      }))
      .sort((a, b) => b.goalInvolvements - a.goalInvolvements || b.totalActions - a.totalActions);
  });

  // --- QUARTET 4v4 SEASON AGGREGATION ---
  interface SeasonQuartetRow {
    key: string;
    names: string[];
    matchIds: Set<string>;
    durationSec: number;
    gf: number;
    ga: number;
    sot: number;
  }

  const seasonQuartets = $derived.by(() => {
    const map = new Map<string, SeasonQuartetRow>();
    for (const m of matches) {
      const { koStart, end, intervals } = computeMatchIntervals(m);
      const byId = new Map(m.roster.map((p) => [p.id, p]));

      const ivKeys: string[] = [];
      for (const iv of intervals) {
        const names = iv.lineupIds
          .map((id) => byId.get(id))
          .filter((p): p is RosterPlayer => Boolean(p))
          .filter((p) => !p.isOpponent && p.name !== 'Tim Lawan' && !projectStore.isGoalkeeper(p))
          .map((p) => projectStore.getPlayerDisplayLabel(p))
          .sort();
        const key = names.join(' | ');
        ivKeys.push(key);
        if (names.length === 0) continue;

        let row = map.get(key);
        if (!row) {
          row = { key, names, matchIds: new Set(), durationSec: 0, gf: 0, ga: 0, sot: 0 };
          map.set(key, row);
        }
        row.matchIds.add(m.id);
        row.durationSec += iv.end - iv.start;
      }

      for (const t of m.tags) {
        const mid = Math.max(koStart, Math.min(end - 0.01, (t.startTime + t.endTime) / 2));
        const ivIdx = intervals.findIndex((x) => mid >= x.start && mid <= x.end);
        const key = ivIdx !== -1 ? ivKeys[ivIdx] : ivKeys[ivKeys.length - 1];
        const row = key ? map.get(key) : undefined;
        if (!row) continue;

        const isAway = t.teamSide === 'away' || projectStore.normalizePlayerLabel(t.playerLabel) === 'Tim Lawan';
        const isGoal = /\b(goal|gol)\b/i.test(t.category);
        if (isGoal && !isAway) row.gf += 1;
        if ((isGoal && isAway) || /kebobolan|conceded/i.test(t.category)) row.ga += 1;
        if (/shot on target|shoot ot|\bsot\b/i.test(t.category) && !isAway) row.sot += 1;
      }
    }

    return Array.from(map.values())
      .map((r) => ({ ...r, matchesCount: r.matchIds.size, plusMinus: r.gf - r.ga }))
      .sort((a, b) => b.plusMinus - a.plusMinus || b.durationSec - a.durationSec);
  });

  // --- SPATIAL HEATMAP & PASSING NETWORK ACROSS ALL MATCHES ---
  const allSeasonTags = $derived(matches.flatMap((m) => m.tags));
  const allSeasonPlayers = $derived.by(() => {
    const set = new Set<string>();
    for (const p of playerLeaderboard) set.add(p.label);
    return Array.from(set);
  });

  const filteredSpatialTags = $derived(
    allSeasonTags.filter(
      (t) =>
        spatialPlayerFilter === 'all' ||
        projectStore.normalizePlayerLabel(t.playerLabel) === spatialPlayerFilter
    )
  );

  function getEventCoord(ev: VideoTagEvent): Point2D {
    if (ev.courtCoord) return ev.courtCoord;
    switch (ev.zoneLabel) {
      case 'Area Penalti Lawan':
        return { x: 34, y: 10 };
      case 'Flank Kiri':
        return { x: 24, y: 3.5 };
      case 'Flank Kanan':
        return { x: 24, y: 16.5 };
      case 'Area Bertahan Sendiri':
        return { x: 8, y: 10 };
      default:
        return { x: 20, y: 10 };
    }
  }

  $effect(() => {
    if (!isOpen || activeTab !== 'spatial') return;
    const _deps = [filteredSpatialTags.length, spatialMode, spatialPlayerFilter];
    void _deps;
    tick().then(() => renderSpatialCanvas());
  });

  function renderSpatialCanvas() {
    if (!spatialCanvasEl) return;
    const ctx = spatialCanvasEl.getContext('2d');
    if (!ctx) return;

    const w = spatialCanvasEl.width;
    const h = spatialCanvasEl.height;
    const pad = 24;
    const pw = w - pad * 2;
    const ph = h - pad * 2;

    ctx.clearRect(0, 0, w, h);

    // Pitch background
    ctx.fillStyle = '#071528';
    ctx.fillRect(pad, pad, pw, ph);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(pad, pad, pw, ph);
    ctx.beginPath();
    ctx.moveTo(pad + pw / 2, pad);
    ctx.lineTo(pad + pw / 2, pad + ph);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(pad + pw / 2, pad + ph / 2, (3 / 40) * pw, 0, Math.PI * 2);
    ctx.stroke();

    if (spatialMode === 'heatmap') {
      for (const ev of filteredSpatialTags) {
        const pt = getEventCoord(ev);
        const cx = pad + (pt.x / 40) * pw;
        const cy = pad + (pt.y / 20) * ph;
        const grad = ctx.createRadialGradient(cx, cy, 4, cx, cy, 48);
        grad.addColorStop(0, 'rgba(239, 68, 68, 0.52)');
        grad.addColorStop(0.5, 'rgba(245, 158, 11, 0.25)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cx, cy, 48, 0, Math.PI * 2);
        ctx.fill();
      }
      for (const ev of filteredSpatialTags) {
        const pt = getEventCoord(ev);
        const cx = pad + (pt.x / 40) * pw;
        const cy = pad + (pt.y / 20) * ph;
        ctx.beginPath();
        ctx.arc(cx, cy, 4, 0, Math.PI * 2);
        ctx.fillStyle = ev.color || '#38bdf8';
        ctx.fill();
      }
    } else {
      const nodePos: Record<string, Point2D> = {
        '#1 Kiper': { x: 4, y: 10 },
        '#4 Anchor': { x: 12, y: 10 },
        '#7 Flank Kiri': { x: 23, y: 4 },
        '#11 Flank Kanan': { x: 23, y: 16 },
        '#9 Pivot': { x: 33, y: 10 },
      };
      const pairCounts = new Map<string, { from: string; to: string; count: number }>();
      for (const ev of filteredSpatialTags) {
        const from = projectStore.normalizePlayerLabel(ev.playerLabel);
        const to = ev.passTargetPlayer ? projectStore.normalizePlayerLabel(ev.passTargetPlayer) : '';
        if (from && to && from !== to && from !== 'Tim Lawan' && to !== 'Tim Lawan') {
          const k = `${from}=>${to}`;
          const prev = pairCounts.get(k);
          if (prev) prev.count += 1;
          else pairCounts.set(k, { from, to, count: 1 });
        }
      }

      const nodes = new Set<string>();
      for (const link of pairCounts.values()) {
        nodes.add(link.from);
        nodes.add(link.to);
      }
      const posOf = (lbl: string, idx: number): Point2D =>
        nodePos[lbl] || { x: 14 + ((idx * 6) % 20), y: 4 + ((idx * 5) % 12) };
      const nodeArr = Array.from(nodes);
      const posMap = new Map(nodeArr.map((n, i) => [n, posOf(n, i)]));

      for (const link of pairCounts.values()) {
        const p1 = posMap.get(link.from)!;
        const p2 = posMap.get(link.to)!;
        const x1 = pad + (p1.x / 40) * pw;
        const y1 = pad + (p1.y / 20) * ph;
        const x2 = pad + (p2.x / 40) * pw;
        const y2 = pad + (p2.y / 20) * ph;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.strokeStyle = 'rgba(56, 189, 248, 0.72)';
        ctx.lineWidth = Math.min(8, 1.5 + link.count * 1.4);
        ctx.stroke();

        const mx = (x1 + x2) / 2;
        const my = (y1 + y2) / 2;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(mx - 12, my - 9, 24, 18);
        ctx.fillStyle = '#fbbf24';
        ctx.font = 'bold 10px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${link.count}x`, mx, my);
      }

      for (const n of nodeArr) {
        const p = posMap.get(n)!;
        const cx = pad + (p.x / 40) * pw;
        const cy = pad + (p.y / 20) * ph;
        ctx.beginPath();
        ctx.arc(cx, cy, 14, 0, Math.PI * 2);
        ctx.fillStyle = '#0284c7';
        ctx.fill();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 10px system-ui';
        ctx.textAlign = 'center';
        ctx.fillText(n, cx, cy + 24);
      }
    }
  }

  function downloadSpatialPng() {
    if (!spatialCanvasEl) return;
    const a = document.createElement('a');
    a.href = spatialCanvasEl.toDataURL('image/png');
    a.download = `Season_${spatialMode}_${Date.now()}.png`;
    a.click();
  }

  function formatMinSec(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}m ${s.toString().padStart(2, '0')}s`;
  }
</script>

{#if isOpen}
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="modal-backdrop" onclick={onClose} role="presentation">
  <div class="modal-card" onclick={(e) => e.stopPropagation()} role="dialog" tabindex="-1">
    <header class="modal-header">
      <div class="hdr-left">
        <BarChart3 size={19} class="text-sky-400" />
        <div>
          <h2 class="modal-title">SEASON & MULTI-MATCH ANALYTICS HUB</h2>
          <p class="modal-sub">Agregasi lintas pertandingan (.futsal): Tren performa, Heatmap/Passing akumulasi, Leaderboard & Quartet 4v4</p>
        </div>
      </div>

      <div class="hdr-right">
        {#if statusMsg}
          <span class="status-pill">{statusMsg}</span>
        {/if}
        <button type="button" class="btn-close" onclick={onClose} title="Tutup">
          <X size={18} />
        </button>
      </div>
    </header>

    <!-- ACTION & TABS BAR -->
    <div class="controls-bar">
      <div class="tabs-row">
        <button type="button" class="tab-pill" class:active={activeTab === 'trends'} onclick={() => (activeTab = 'trends')}>
          <TrendingUp size={13} />
          <span>Tren Laga</span>
        </button>
        <button type="button" class="tab-pill" class:active={activeTab === 'spatial'} onclick={() => (activeTab = 'spatial')}>
          <Flame size={13} />
          <span>Heatmap & Passing</span>
        </button>
        <button type="button" class="tab-pill" class:active={activeTab === 'players'} onclick={() => (activeTab = 'players')}>
          <Users size={13} />
          <span>Peringkat Pemain</span>
        </button>
        <button type="button" class="tab-pill" class:active={activeTab === 'quartets'} onclick={() => (activeTab = 'quartets')}>
          <Sparkles size={13} />
          <span>Quartet 4v4 Musim</span>
        </button>
      </div>

      <div class="import-actions">
        <button type="button" class="btn-act primary" onclick={handleImportFutsalFiles}>
          <Upload size={12} />
          <span>+ Impor .futsal (Multi)</span>
        </button>
        <input
          bind:this={fileInputEl}
          type="file"
          multiple
          accept=".futsal,.json"
          onchange={handleBrowserFilesChange}
          style="display: none;"
        />
        <button type="button" class="btn-act" onclick={handleImportCurrentMatch}>
          <Plus size={12} />
          <span>+ Laga Aktif</span>
        </button>
        <button type="button" class="btn-act" onclick={loadDemoSeason}>
          <Sparkles size={12} />
          <span>Demo 3 Laga</span>
        </button>
        {#if matches.length > 0}
          <button type="button" class="btn-act danger" onclick={() => (matches = [])} title="Bersihkan daftar pertandingan">
            <Trash2 size={12} />
          </button>
        {/if}
      </div>
    </div>

    <!-- CONTENT AREA -->
    <div class="modal-body">
      {#if matches.length === 0}
        <div class="empty-season">
          <BarChart3 size={36} class="text-sky-400" />
          <h3>Belum Ada Pertandingan yang Dimuat</h3>
          <p>
            Impor 2 atau lebih file proyek <code>.futsal</code> dari turnamen/liga, tambahkan laga yang sedang dibuka, atau klik <strong>Demo 3 Laga</strong> untuk melihat analitik musim.
          </p>
          <div class="empty-btns">
            <button type="button" class="btn-act primary" onclick={handleImportFutsalFiles}>
              <Upload size={13} />
              <span>Impor File .futsal</span>
            </button>
            <button type="button" class="btn-act" onclick={loadDemoSeason}>
              <Sparkles size={13} />
              <span>Muat 3 Laga Demo</span>
            </button>
          </div>
        </div>
      {:else if activeTab === 'trends'}
        <!-- KPI SUMMARY STRIP -->
        <div class="kpi-strip">
          <div class="kpi-box"><span class="k-lbl">Total Laga</span><span class="k-val">{seasonTotals.matches}</span></div>
          <div class="kpi-box"><span class="k-lbl">Gol Tim</span><span class="k-val text-emerald">{seasonTotals.goals}</span></div>
          <div class="kpi-box"><span class="k-lbl">Shot on Target</span><span class="k-val text-sky">{seasonTotals.sot}</span></div>
          <div class="kpi-box"><span class="k-lbl">Pressing Sukses</span><span class="k-val text-amber">{seasonTotals.pressing}</span></div>
          <div class="kpi-box"><span class="k-lbl">Power Play 5v4</span><span class="k-val">{seasonTotals.powerPlay}</span></div>
          <div class="kpi-box"><span class="k-lbl">Set Piece</span><span class="k-val">{seasonTotals.setPiece}</span></div>
        </div>

        <!-- SVG TREND CHART -->
        <div class="chart-card">
          <div class="chart-hdr">
            <span>Grafik Tren Performa Antar-Pertandingan</span>
            <div class="chart-legend">
              <span class="leg"><i style="background:#10b981;"></i>Gol</span>
              <span class="leg"><i style="background:#38bdf8;"></i>Shot OT</span>
              <span class="leg"><i style="background:#f59e0b;"></i>Pressing</span>
              <span class="leg"><i style="background:#a855f7;"></i>Power Play / Set Piece</span>
            </div>
          </div>

          <svg viewBox="0 0 780 210" class="trend-svg">
            {#each [0, 0.25, 0.5, 0.75, 1] as frac}
              {@const y = 175 - frac * 145}
              <line x1="45" y1={y} x2="750" y2={y} stroke="#162d50" stroke-width="1" />
              <text x="36" y={y + 3} text-anchor="end" fill="#64748b" font-size="9">
                {Math.round(frac * maxChartY)}
              </text>
            {/each}

            {#if matchTrends.length > 0}
              {@const stepX = matchTrends.length > 1 ? 660 / (matchTrends.length - 1) : 0}
              {@const xAt = (i: number) => (matchTrends.length === 1 ? 395 : 70 + i * stepX)}
              {@const yAt = (v: number) => 175 - (v / maxChartY) * 145}

              <polyline
                fill="none"
                stroke="#10b981"
                stroke-width="2.5"
                points={matchTrends.map((m, i) => `${xAt(i)},${yAt(m.goals)}`).join(' ')}
              />
              <polyline
                fill="none"
                stroke="#38bdf8"
                stroke-width="2.5"
                points={matchTrends.map((m, i) => `${xAt(i)},${yAt(m.sot)}`).join(' ')}
              />
              <polyline
                fill="none"
                stroke="#f59e0b"
                stroke-width="2"
                stroke-dasharray="4 3"
                points={matchTrends.map((m, i) => `${xAt(i)},${yAt(m.pressing)}`).join(' ')}
              />
              <polyline
                fill="none"
                stroke="#a855f7"
                stroke-width="2"
                points={matchTrends.map((m, i) => `${xAt(i)},${yAt(m.powerPlay + m.setPiece)}`).join(' ')}
              />

              {#each matchTrends as m, i (m.id)}
                <circle cx={xAt(i)} cy={yAt(m.goals)} r="4" fill="#10b981" />
                <circle cx={xAt(i)} cy={yAt(m.sot)} r="4" fill="#38bdf8" />
                <circle cx={xAt(i)} cy={yAt(m.pressing)} r="3.5" fill="#f59e0b" />
                <circle cx={xAt(i)} cy={yAt(m.powerPlay + m.setPiece)} r="3.5" fill="#a855f7" />
                <text x={xAt(i)} y="196" text-anchor="middle" fill="#cbd5e1" font-size="9.5">
                  {m.title.slice(0, 18)}
                </text>
              {/each}
            {/if}
          </svg>
        </div>

        <!-- MATCHES TABLE -->
        <div class="table-card">
          <table class="season-table">
            <thead>
              <tr>
                <th class="th-left">Pertandingan</th>
                <th>Klip</th>
                <th>Gol</th>
                <th>Kebobolan</th>
                <th>Shot OT</th>
                <th>Pressing</th>
                <th>Power Play</th>
                <th>Set Piece</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {#each matchTrends as m (m.id)}
                <tr>
                  <td class="td-left">{m.title}</td>
                  <td>{m.totalClips}</td>
                  <td class="text-emerald">{m.goals}</td>
                  <td class="text-red">{m.conceded}</td>
                  <td class="text-sky">{m.sot}</td>
                  <td class="text-amber">{m.pressing}</td>
                  <td>{m.powerPlay}</td>
                  <td>{m.setPiece}</td>
                  <td>
                    <button
                      type="button"
                      class="btn-del"
                      onclick={() => (matches = matches.filter((x) => x.id !== m.id))}
                      title="Keluarkan pertandingan"
                    >
                      <Trash2 size={12} />
                    </button>
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else if activeTab === 'spatial'}
        <div class="spatial-toolbar">
          <div class="st-left">
            <button type="button" class="tab-pill" class:active={spatialMode === 'heatmap'} onclick={() => (spatialMode = 'heatmap')}>
              <Flame size={12} />
              <span>Akumulasi Heatmap</span>
            </button>
            <button type="button" class="tab-pill" class:active={spatialMode === 'passing'} onclick={() => (spatialMode = 'passing')}>
              <Share2 size={12} />
              <span>Akumulasi Passing Network</span>
            </button>
          </div>
          <div class="st-right">
            <select bind:value={spatialPlayerFilter} class="sel-filter">
              <option value="all">Semua Pemain ({allSeasonTags.length} aksi)</option>
              {#each allSeasonPlayers as p}
                <option value={p}>{p}</option>
              {/each}
            </select>
            <button type="button" class="btn-act" onclick={downloadSpatialPng}>
              <Download size={12} />
              <span>Unduh PNG</span>
            </button>
          </div>
        </div>
        <div class="canvas-box">
          <canvas bind:this={spatialCanvasEl} width={860} height={420} class="spatial-canvas"></canvas>
        </div>
      {:else if activeTab === 'players'}
        <div class="table-card">
          <table class="season-table">
            <thead>
              <tr>
                <th class="th-left">Pemain</th>
                <th>Laga</th>
                <th>Total Menit</th>
                <th>Total Aksi</th>
                <th>Keterlibatan Gol</th>
                <th>Shot OT</th>
                <th>Akurasi Eksekusi</th>
              </tr>
            </thead>
            <tbody>
              {#each playerLeaderboard as row (row.label)}
                <tr>
                  <td class="td-left"><strong>{row.label}</strong></td>
                  <td>{row.matchesCount}</td>
                  <td class="mono">{formatMinSec(row.totalSec)}</td>
                  <td>{row.totalActions}</td>
                  <td class="text-emerald"><strong>{row.goalInvolvements}</strong></td>
                  <td class="text-sky">{row.sot}</td>
                  <td>{row.accuracyPct}%</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {:else}
        <div class="table-card">
          <table class="season-table">
            <thead>
              <tr>
                <th class="th-left">Kombinasi Quartet 4v4</th>
                <th>Laga</th>
                <th>Durasi Total</th>
                <th>GF</th>
                <th>GA</th>
                <th>+/-</th>
                <th>Shot OT</th>
              </tr>
            </thead>
            <tbody>
              {#each seasonQuartets as q (q.key)}
                <tr>
                  <td class="td-left">{q.names.join(' · ')}</td>
                  <td>{q.matchesCount}</td>
                  <td class="mono">{formatMinSec(q.durationSec)}</td>
                  <td class="text-emerald">{q.gf}</td>
                  <td class="text-red">{q.ga}</td>
                  <td>
                    <span class="pm-pill" class:pos={q.plusMinus > 0} class:neg={q.plusMinus < 0}>
                      {q.plusMinus > 0 ? `+${q.plusMinus}` : q.plusMinus}
                    </span>
                  </td>
                  <td class="text-sky">{q.sot}</td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/if}
    </div>
  </div>
</div>
{/if}

<style>
  .modal-backdrop {
    position: fixed;
    inset: 0;
    background: rgba(5, 10, 20, 0.88);
    backdrop-filter: blur(8px);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 120;
  }

  .modal-card {
    width: 1040px;
    max-width: 96vw;
    height: 660px;
    max-height: 92vh;
    background: #07101f;
    border: 1px solid #1e3b68;
    border-radius: 14px;
    box-shadow: 0 24px 60px rgba(0, 0, 0, 0.85);
    display: flex;
    flex-direction: column;
    overflow: hidden;
    color: #f8fafc;
  }

  .modal-header {
    padding: 14px 18px;
    background: linear-gradient(180deg, #102548 0%, #0b1931 100%);
    border-bottom: 1px solid #1e3b68;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
  }

  .hdr-left,
  .hdr-right {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .modal-title {
    margin: 0;
    font-size: 13px;
    font-weight: 800;
  }

  .modal-sub {
    margin: 2px 0 0;
    font-size: 10.5px;
    color: #94a3b8;
  }

  .status-pill {
    font-size: 10px;
    font-weight: 700;
    color: #34d399;
    background: rgba(16, 185, 129, 0.16);
    border: 1px solid rgba(16, 185, 129, 0.4);
    padding: 4px 10px;
    border-radius: 999px;
  }

  .btn-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
    padding: 4px;
  }

  .controls-bar {
    padding: 10px 18px;
    background: #081326;
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    flex-wrap: wrap;
  }

  .tabs-row,
  .import-actions,
  .st-left,
  .st-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .tab-pill {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0b1a2e;
    border: 1px solid #1a365d;
    color: #94a3b8;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 11px;
    border-radius: 6px;
    cursor: pointer;
  }

  .tab-pill.active {
    background: linear-gradient(135deg, #0284c7, #1e40af);
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-act {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0d1e38;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    font-size: 10.5px;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-act.primary {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-act.danger {
    border-color: #7f1d1d;
    color: #f87171;
  }

  .modal-body {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 14px 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .empty-season {
    margin: auto;
    text-align: center;
    max-width: 480px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
    color: #94a3b8;
  }

  .empty-season h3 {
    margin: 0;
    color: #f8fafc;
    font-size: 15px;
  }

  .empty-btns {
    display: flex;
    gap: 8px;
  }

  .kpi-strip {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
  }

  .kpi-box {
    background: #091322;
    border: 1px solid #1a355d;
    border-radius: 8px;
    padding: 8px 10px;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .k-lbl {
    font-size: 9.5px;
    color: #64748b;
    font-weight: 700;
  }

  .k-val {
    font-family: 'Fira Code', monospace;
    font-size: 16px;
    font-weight: 900;
  }

  .chart-card,
  .table-card {
    background: #091322;
    border: 1px solid #1a355d;
    border-radius: 10px;
    padding: 12px;
  }

  .chart-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 11px;
    font-weight: 800;
    color: #93c5fd;
    margin-bottom: 6px;
  }

  .chart-legend {
    display: flex;
    gap: 10px;
    font-size: 10px;
    color: #cbd5e1;
  }

  .leg {
    display: inline-flex;
    align-items: center;
    gap: 4px;
  }

  .leg i {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    display: inline-block;
  }

  .trend-svg {
    width: 100%;
    height: 195px;
    display: block;
  }

  .season-table {
    width: 100%;
    border-collapse: collapse;
    font-size: 11px;
    text-align: center;
  }

  .season-table th {
    background: #060b14;
    color: #93c5fd;
    font-size: 10px;
    padding: 7px 10px;
    border-bottom: 1px solid #1a355d;
  }

  .season-table td {
    padding: 7px 10px;
    border-bottom: 1px solid #122440;
  }

  .th-left,
  .td-left {
    text-align: left;
  }

  .mono {
    font-family: 'Fira Code', monospace;
  }

  .text-emerald {
    color: #34d399;
  }

  .text-red {
    color: #f87171;
  }

  .text-sky {
    color: #38bdf8;
  }

  .text-amber {
    color: #fbbf24;
  }

  .btn-del {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
  }

  .btn-del:hover {
    color: #ef4444;
  }

  .pm-pill {
    display: inline-block;
    min-width: 28px;
    padding: 2px 7px;
    border-radius: 999px;
    font-family: 'Fira Code', monospace;
    font-weight: 900;
    background: #1e293b;
  }

  .pm-pill.pos {
    background: rgba(16, 185, 129, 0.22);
    color: #34d399;
  }

  .pm-pill.neg {
    background: rgba(239, 68, 68, 0.22);
    color: #fca5a5;
  }

  .spatial-toolbar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
  }

  .sel-filter {
    background: #040912;
    border: 1px solid #1a355d;
    color: #f8fafc;
    font-size: 11px;
    padding: 5px 8px;
    border-radius: 5px;
  }

  .canvas-box {
    background: #040912;
    border: 1px solid #1a355d;
    border-radius: 10px;
    padding: 8px;
    display: flex;
    justify-content: center;
  }

  .spatial-canvas {
    max-width: 100%;
    height: auto;
    border-radius: 6px;
  }
</style>

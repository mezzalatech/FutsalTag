// Industry Interoperability & Multi-Sheet Reporting Exporters
// Supports SportsCode / Once Sport XML Round-Trip & 4-Sheet Excel SpreadsheetML (.xls)

import { invoke } from '@tauri-apps/api/core';
import type {
  CourtZone,
  PeriodKickoff,
  RosterPlayer,
  SubstitutionEvent,
  TagDescriptor,
  TagOutcome,
  TagRating,
  VideoTagEvent,
} from '$lib/types';

export interface MultiSheetExportInput {
  matchTitle: string;
  tags: VideoTagEvent[];
  roster: RosterPlayer[];
  duration: number;
  periodKickoffs: PeriodKickoff[];
  startingLineupIds: string[];
  substitutions: SubstitutionEvent[];
  formatMatchClock: (sec: number) => string;
  getPlayerDisplayLabel: (p: RosterPlayer) => string;
  normalizePlayerLabel: (label?: string) => string;
  isGoalkeeper: (p: RosterPlayer) => boolean;
}

export function escapeXml(str: string): string {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

const CATEGORY_COLORS: Record<string, string> = {
  Goal: '#10b981',
  'Shot on Target': '#38bdf8',
  'Shot Off Target': '#64748b',
  'Kick-in Set Piece': '#ec4899',
  'Corner Set Piece': '#8b5cf6',
  'Build-up 3-1': '#0ea5e9',
  'Build-up 4-0': '#14b8a6',
  'Power Play': '#eab308',
  'Pressing High': '#f59e0b',
  'Transition Attack': '#6366f1',
  'Transition Defense': '#ef4444',
  Foul: '#f97316',
  'Goalkeeper Save': '#06b6d4',
};

function colorForCategory(cat: string): string {
  if (CATEGORY_COLORS[cat]) return CATEGORY_COLORS[cat];
  const palette = ['#0ea5e9', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#ef4444'];
  let hash = 0;
  for (let i = 0; i < cat.length; i++) {
    hash = (hash * 31 + cat.charCodeAt(i)) | 0;
  }
  return palette[Math.abs(hash) % palette.length];
}

// =========================================================================
// 1. SPORTSCODE / ONCE SPORT XML EXPORT & IMPORT
// =========================================================================

export function exportSportsCodeXml(tags: VideoTagEvent[], matchTitle = 'FutsalTag Pro'): string {
  const lines: string[] = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    `<file><!-- ${escapeXml(matchTitle)} -->`,
    '  <SORT_INFO>',
    '    <sort_type>sort order</sort_type>',
    '  </SORT_INFO>',
    '  <ALL_INSTANCES>',
  ];

  tags.forEach((tag, idx) => {
    lines.push('    <instance>');
    lines.push(`      <ID>${idx + 1}</ID>`);
    lines.push(`      <start>${tag.startTime.toFixed(2)}</start>`);
    lines.push(`      <end>${tag.endTime.toFixed(2)}</end>`);
    lines.push(`      <code>${escapeXml(tag.category)}</code>`);

    const players =
      tag.playersInvolved && tag.playersInvolved.length > 0
        ? tag.playersInvolved
        : tag.playerLabel
          ? [tag.playerLabel]
          : [];
    for (const p of players) {
      lines.push('      <label>');
      lines.push('        <group>Player</group>');
      lines.push(`        <text>${escapeXml(p)}</text>`);
      lines.push('      </label>');
    }

    if (tag.teamSide) {
      lines.push('      <label>');
      lines.push('        <group>Team</group>');
      lines.push(`        <text>${escapeXml(tag.teamSide.toUpperCase())}</text>`);
      lines.push('      </label>');
    }

    if (tag.outcomeLabel) {
      lines.push('      <label>');
      lines.push('        <group>Outcome</group>');
      lines.push(`        <text>${escapeXml(tag.outcomeLabel)}</text>`);
      lines.push('      </label>');
    }

    if (tag.zoneLabel) {
      lines.push('      <label>');
      lines.push('        <group>Zone</group>');
      lines.push(`        <text>${escapeXml(tag.zoneLabel)}</text>`);
      lines.push('      </label>');
    }

    if (tag.rating) {
      lines.push('      <label>');
      lines.push('        <group>Rating</group>');
      lines.push(`        <text>${escapeXml(tag.rating)}</text>`);
      lines.push('      </label>');
    }

    if (tag.favorite) {
      lines.push('      <label>');
      lines.push('        <group>Highlight</group>');
      lines.push('        <text>Favorite</text>');
      lines.push('      </label>');
    }

    if (tag.labels && tag.labels.length > 0) {
      for (const lbl of tag.labels) {
        lines.push('      <label>');
        lines.push(`        <group>${escapeXml(lbl.group || 'Descriptor')}</group>`);
        lines.push(`        <text>${escapeXml(lbl.name)}</text>`);
        lines.push('      </label>');
      }
    }

    if (tag.notes) {
      lines.push(`      <free_text>${escapeXml(tag.notes)}</free_text>`);
    }

    lines.push('    </instance>');
  });

  lines.push('  </ALL_INSTANCES>');
  lines.push('</file>');
  return lines.join('\n');
}

export function importSportsCodeXml(xmlStr: string): VideoTagEvent[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(xmlStr, 'application/xml');
  const parseErr = doc.querySelector('parsererror');
  if (parseErr) {
    throw new Error('Berkas XML tidak valid atau rusak.');
  }

  const out: VideoTagEvent[] = [];
  const instances = Array.from(doc.querySelectorAll('ALL_INSTANCES > instance, instance'));

  if (instances.length > 0) {
    instances.forEach((inst, idx) => {
      const getText = (sel: string) => inst.querySelector(sel)?.textContent?.trim() || '';
      const start = parseFloat(getText('start')) || 0;
      const rawEnd = parseFloat(getText('end'));
      const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 5;
      const code = getText('code') || 'Transition Attack';
      const freeText = getText('free_text');

      const players: string[] = [];
      const descriptors: TagDescriptor[] = [];
      let teamSide: 'home' | 'away' | undefined;
      let outcomeLabel: TagOutcome | undefined;
      let zoneLabel: CourtZone | undefined;
      let rating: TagRating | undefined;
      let favorite = false;

      const labelEls = Array.from(inst.querySelectorAll('label'));
      for (const lblEl of labelEls) {
        const grp = lblEl.querySelector('group')?.textContent?.trim() || 'Descriptor';
        const txt = lblEl.querySelector('text')?.textContent?.trim() || '';
        if (!txt) continue;

        const grpLower = grp.toLowerCase();
        if (grpLower === 'player' || grpLower === 'pemain') {
          if (!players.includes(txt)) players.push(txt);
        } else if (grpLower === 'team' || grpLower === 'tim') {
          teamSide = txt.toLowerCase() === 'away' ? 'away' : 'home';
        } else if (grpLower === 'outcome' || grpLower === 'hasil') {
          outcomeLabel = txt as TagOutcome;
        } else if (grpLower === 'zone' || grpLower === 'zona') {
          zoneLabel = txt as CourtZone;
        } else if (grpLower === 'rating') {
          rating = txt as TagRating;
        } else if (grpLower === 'highlight' && txt.toLowerCase() === 'favorite') {
          favorite = true;
        } else {
          descriptors.push({
            id: `xml_desc_${idx}_${descriptors.length}`,
            name: txt,
            group: grp,
            color: '#38bdf8',
            atTime: Number(start.toFixed(2)),
          });
        }
      }

      const primaryPlayer = players[0] || '#9 Pivot';
      out.push({
        id: `xml_${Date.now()}_${idx}`,
        title: `${code} - ${primaryPlayer}`,
        category: code,
        startTime: Number(start.toFixed(2)),
        endTime: Number(end.toFixed(2)),
        color: colorForCategory(code),
        playerLabel: primaryPlayer,
        playersInvolved: players.length > 0 ? players : [primaryPlayer],
        labels: descriptors,
        teamSide: teamSide ?? (primaryPlayer.toLowerCase().includes('lawan') ? 'away' : 'home'),
        outcomeLabel: outcomeLabel ?? 'Gol / Sukses',
        zoneLabel,
        rating: rating ?? '⭐⭐⭐ Bagus',
        favorite,
        notes: freeText || undefined,
        pauseDuration: 3.0,
        drawings: [],
      });
    });
    return out;
  }

  // Fallback: Once Sport native <action> / <tag> XML schema
  const actionEls = Array.from(doc.querySelectorAll('action, tag'));
  actionEls.forEach((el, idx) => {
    const attrOrChild = (name: string) =>
      el.getAttribute(name) || el.querySelector(name)?.textContent?.trim() || '';
    const cat = attrOrChild('actionName') || attrOrChild('name') || attrOrChild('code') || 'Transition Attack';
    const start = parseFloat(attrOrChild('startTime') || attrOrChild('start')) || 0;
    const rawEnd = parseFloat(attrOrChild('endTime') || attrOrChild('end'));
    const end = Number.isFinite(rawEnd) && rawEnd > start ? rawEnd : start + 5;
    const isGood = attrOrChild('isGood') === 'true';
    const isBad = attrOrChild('isBad') === 'true';

    out.push({
      id: `once_xml_${Date.now()}_${idx}`,
      title: `${cat} (${start.toFixed(1)}s)`,
      category: cat,
      startTime: Number(start.toFixed(2)),
      endTime: Number(end.toFixed(2)),
      color: colorForCategory(cat),
      playerLabel: '#9 Pivot',
      playersInvolved: ['#9 Pivot'],
      rating: isBad ? '⚠️ Evaluasi' : isGood ? '⭐⭐⭐ Bagus' : undefined,
      favorite: isGood,
      pauseDuration: 3.0,
      drawings: [],
    });
  });

  return out;
}

// =========================================================================
// 2. MULTI-SHEET EXCEL WORKBOOK (SpreadsheetML 4 WORKSHEETS)
// =========================================================================

type CellVal = string | number;

function xmlCell(val: CellVal, styleId?: string): string {
  const sAttr = styleId ? ` ss:StyleID="${styleId}"` : '';
  if (typeof val === 'number' && Number.isFinite(val)) {
    return `<Cell${sAttr}><Data ss:Type="Number">${val}</Data></Cell>`;
  }
  return `<Cell${sAttr}><Data ss:Type="String">${escapeXml(String(val ?? ''))}</Data></Cell>`;
}

function xmlRow(cells: CellVal[], styleId?: string): string {
  return `<Row>${cells.map((c) => xmlCell(c, styleId)).join('')}</Row>`;
}

export function exportMultiSheetExcelXml(input: MultiSheetExportInput): string {
  const {
    matchTitle,
    tags,
    roster,
    duration,
    periodKickoffs,
    startingLineupIds,
    substitutions,
    formatMatchClock,
    getPlayerDisplayLabel,
    normalizePlayerLabel,
    isGoalkeeper,
  } = input;

  // --- SHEET 1: DAFTAR KLIP ---
  const sheet1Rows: string[] = [
    xmlRow([`LAPORAN ANALISIS FUTSAL — ${matchTitle}`], 'sTitle'),
    xmlRow(
      [
        'No',
        'Judul Klip',
        'Kategori',
        'Tim',
        'Pemain',
        'Label / Descriptor',
        'Match Clock Mulai',
        'Match Clock Selesai',
        'Video Mulai (s)',
        'Video Selesai (s)',
        'Durasi (s)',
        'Hasil',
        'Zona',
        'Rating',
        'Favorit',
        'Catatan',
      ],
      'sHeader'
    ),
  ];

  tags.forEach((t, idx) => {
    const playersStr =
      t.playersInvolved && t.playersInvolved.length > 0
        ? t.playersInvolved.join('; ')
        : t.playerLabel || '-';
    const labelsStr = t.labels && t.labels.length > 0 ? t.labels.map((l) => l.name).join('; ') : '-';
    sheet1Rows.push(
      xmlRow([
        idx + 1,
        t.title,
        t.category,
        (t.teamSide || 'home').toUpperCase(),
        playersStr,
        labelsStr,
        formatMatchClock(t.startTime),
        formatMatchClock(t.endTime),
        Number(t.startTime.toFixed(2)),
        Number(t.endTime.toFixed(2)),
        Number(Math.max(0, t.endTime - t.startTime).toFixed(2)),
        t.outcomeLabel || '-',
        t.zoneLabel || '-',
        t.rating || '-',
        t.favorite ? 'Ya' : 'Tidak',
        t.notes || '',
      ])
    );
  });

  // --- SHEET 2: TAG x PEMAIN ---
  const categories = Array.from(new Set(tags.map((t) => t.category).filter(Boolean)));
  const players = roster.map((p) => getPlayerDisplayLabel(p));
  for (const t of tags) {
    const ps =
      t.playersInvolved && t.playersInvolved.length > 0
        ? t.playersInvolved
        : t.playerLabel
          ? [t.playerLabel]
          : [];
    for (const p of ps) {
      const norm = normalizePlayerLabel(p);
      if (!players.includes(norm)) players.push(norm);
    }
  }

  const sheet2Rows: string[] = [
    xmlRow(['Pemain / Roster', ...categories, 'TOTAL KLIP', 'DURASI (s)'], 'sHeader'),
  ];
  const matchesPlayer = (t: VideoTagEvent, p: string) =>
    normalizePlayerLabel(t.playerLabel) === p ||
    Boolean(t.playersInvolved?.some((x) => normalizePlayerLabel(x) === p));

  for (const p of players) {
    const rowClips = tags.filter((t) => matchesPlayer(t, p));
    const counts = categories.map((cat) => rowClips.filter((t) => t.category === cat).length);
    const dur = rowClips.reduce((acc, t) => acc + Math.max(0, t.endTime - t.startTime), 0);
    sheet2Rows.push(xmlRow([p, ...counts, rowClips.length, Number(dur.toFixed(1))]));
  }
  const catTotals = categories.map((cat) => tags.filter((t) => t.category === cat).length);
  const allDur = tags.reduce((acc, t) => acc + Math.max(0, t.endTime - t.startTime), 0);
  sheet2Rows.push(xmlRow(['TOTAL TIM', ...catTotals, tags.length, Number(allDur.toFixed(1))], 'sTotal'));

  // --- SHEET 3: TAG x LABEL ---
  const labelNamesSet = new Set<string>();
  let hasUnlabeled = false;
  for (const t of tags) {
    if (t.labels && t.labels.length > 0) {
      for (const l of t.labels) labelNamesSet.add(l.name);
    } else {
      hasUnlabeled = true;
    }
  }
  const labelCols = Array.from(labelNamesSet);
  if (hasUnlabeled) labelCols.push('Tanpa Label');

  const sheet3Rows: string[] = [
    xmlRow(['Tag / Kategori', ...labelCols, 'TOTAL KLIP', 'DURASI (s)'], 'sHeader'),
  ];
  for (const cat of categories) {
    const catClips = tags.filter((t) => t.category === cat);
    const counts = labelCols.map((lbl) =>
      catClips.filter((t) =>
        lbl === 'Tanpa Label'
          ? !t.labels || t.labels.length === 0
          : Boolean(t.labels?.some((l) => l.name === lbl))
      ).length
    );
    const dur = catClips.reduce((acc, t) => acc + Math.max(0, t.endTime - t.startTime), 0);
    sheet3Rows.push(xmlRow([cat, ...counts, catClips.length, Number(dur.toFixed(1))]));
  }
  const labelColTotals = labelCols.map(
    (lbl) =>
      tags.filter((t) =>
        lbl === 'Tanpa Label'
          ? !t.labels || t.labels.length === 0
          : Boolean(t.labels?.some((l) => l.name === lbl))
      ).length
  );
  sheet3Rows.push(xmlRow(['TOTAL LABEL', ...labelColTotals, tags.length, Number(allDur.toFixed(1))], 'sTotal'));

  // --- SHEET 4: MENIT BERMAIN & QUARTET 4v4 (+/-) ---
  const koStart =
    periodKickoffs.length > 0 ? Math.min(...periodKickoffs.map((k) => k.videoTime)) : 0;
  const maxSub = substitutions.reduce((m, s) => Math.max(m, s.atTime + 1), 0);
  const maxTag = tags.reduce((m, t) => Math.max(m, t.endTime), 0);
  const matchEnd = Math.max(duration || 120, maxSub, maxTag, koStart + 10);
  const totalSpan = Math.max(1, matchEnd - koStart);

  const sortedSubs = [...substitutions].sort((a, b) => a.atTime - b.atTime);
  const getLineupAt = (tSec: number): string[] => {
    let lineup = [...startingLineupIds];
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
      ...sortedSubs.map((s) => s.atTime).filter((t) => t > koStart + 0.01 && t < matchEnd - 0.01),
      matchEnd,
    ])
  ).sort((a, b) => a - b);

  const intervals: { start: number; end: number; lineupIds: string[] }[] = [];
  for (let i = 0; i < cuts.length - 1; i++) {
    if (cuts[i + 1] - cuts[i] >= 0.05) {
      intervals.push({ start: cuts[i], end: cuts[i + 1], lineupIds: getLineupAt(cuts[i] + 0.01) });
    }
  }

  const squad = roster.filter((p) => !p.isOpponent && p.name !== 'Tim Lawan');
  const byId = new Map(roster.map((p) => [p.id, p]));

  const sheet4Rows: string[] = [
    xmlRow(['BAGIAN A: MENIT BERMAIN PER PEMAIN'], 'sTitle'),
    xmlRow(['No', 'Nama Pemain', 'Peran', 'Total Menit (s)', 'Persentase (%)', 'Jumlah Shift'], 'sHeader'),
  ];

  for (const p of squad) {
    let sec = 0;
    let shifts = 0;
    let inPrev = false;
    for (const iv of intervals) {
      const on = iv.lineupIds.includes(p.id);
      if (on) {
        sec += iv.end - iv.start;
        if (!inPrev) shifts += 1;
      }
      inPrev = on;
    }
    sheet4Rows.push(
      xmlRow([p.num, p.name, p.role, Number(sec.toFixed(1)), Number(((sec / totalSpan) * 100).toFixed(1)), shifts])
    );
  }

  sheet4Rows.push(xmlRow(['']));
  sheet4Rows.push(xmlRow(['BAGIAN B: ANALISIS QUARTET 4v4 (+/-)'], 'sTitle'));
  sheet4Rows.push(
    xmlRow(['Kombinasi Quartet', 'Durasi (s)', 'Shift', 'GF', 'GA', '+/-', 'Shot OT'], 'sHeader')
  );

  const quartetMap = new Map<
    string,
    { label: string; dur: number; shifts: number; gf: number; ga: number; sot: number }
  >();
  for (const iv of intervals) {
    const outfield = iv.lineupIds
      .map((id) => byId.get(id))
      .filter((p): p is RosterPlayer => Boolean(p))
      .filter((p) => !isGoalkeeper(p));
    if (outfield.length === 0) continue;
    const key = outfield
      .map((p) => p.id)
      .sort()
      .join('|');
    let row = quartetMap.get(key);
    if (!row) {
      row = {
        label: outfield.map((p) => `${p.num} ${p.name}`).join(' · '),
        dur: 0,
        shifts: 0,
        gf: 0,
        ga: 0,
        sot: 0,
      };
      quartetMap.set(key, row);
    }
    row.dur += iv.end - iv.start;
    row.shifts += 1;
  }

  for (const t of tags) {
    const mid = Math.max(koStart, Math.min(matchEnd - 0.01, (t.startTime + t.endTime) / 2));
    const iv = intervals.find((x) => mid >= x.start && mid <= x.end) ?? intervals[intervals.length - 1];
    if (!iv) continue;
    const key = iv.lineupIds
      .map((id) => byId.get(id))
      .filter((p): p is RosterPlayer => Boolean(p))
      .filter((p) => !isGoalkeeper(p))
      .map((p) => p.id)
      .sort()
      .join('|');
    const row = quartetMap.get(key);
    if (!row) continue;

    const isAway = t.teamSide === 'away' || normalizePlayerLabel(t.playerLabel) === 'Tim Lawan';
    const isGoal = /\b(goal|gol)\b/i.test(t.category);
    const isConceded =
      /kebobolan|conceded|gol lawan/i.test(t.category) || (/kebobolan/i.test(t.title) && isAway);
    const isSot = /shot on target|shoot ot|\bsot\b|tembakan tepat|on target/i.test(t.category) && !isAway;

    if (isGoal && !isAway) row.gf += 1;
    if ((isGoal && isAway) || isConceded) row.ga += 1;
    if (isSot) row.sot += 1;
  }

  const quartets = Array.from(quartetMap.values()).sort(
    (a, b) => b.gf - b.ga - (a.gf - a.ga) || b.dur - a.dur
  );
  for (const q of quartets) {
    sheet4Rows.push(
      xmlRow([q.label, Number(q.dur.toFixed(1)), q.shifts, q.gf, q.ga, q.gf - q.ga, q.sot])
    );
  }

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<?mso-application progid="Excel.Sheet"?>',
    '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet"',
    ' xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">',
    ' <Styles>',
    '  <Style ss:ID="sTitle"><Font ss:Bold="1" ss:Size="12" ss:Color="#0284C7"/></Style>',
    '  <Style ss:ID="sHeader"><Font ss:Bold="1" ss:Color="#FFFFFF"/><Interior ss:Color="#0F294A" ss:Pattern="Solid"/></Style>',
    '  <Style ss:ID="sTotal"><Font ss:Bold="1" ss:Color="#0F172A"/><Interior ss:Color="#E0F2FE" ss:Pattern="Solid"/></Style>',
    ' </Styles>',
    ` <Worksheet ss:Name="Daftar Klip"><Table>${sheet1Rows.join('')}</Table></Worksheet>`,
    ` <Worksheet ss:Name="Tag x Pemain"><Table>${sheet2Rows.join('')}</Table></Worksheet>`,
    ` <Worksheet ss:Name="Tag x Label"><Table>${sheet3Rows.join('')}</Table></Worksheet>`,
    ` <Worksheet ss:Name="Menit &amp; Quartet"><Table>${sheet4Rows.join('')}</Table></Worksheet>`,
    '</Workbook>',
  ].join('\n');
}

// =========================================================================
// 3. PORTABLE SAVE / OPEN HELPERS (TAURI DESKTOP + BROWSER)
// =========================================================================

export async function saveTextFilePortable(
  defaultFilename: string,
  content: string,
  mimeType: string,
  filterName: string,
  extensions: string[]
): Promise<string | null> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (isTauri) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const selected = await save({
      title: `Simpan ${filterName}`,
      defaultPath: defaultFilename,
      filters: [{ name: filterName, extensions }],
    });
    if (!selected) return null;
    await invoke<string>('save_project_file', { filePath: selected, content });
    return selected;
  }

  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = defaultFilename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
  return defaultFilename;
}

export async function openTextFilePortable(
  title: string,
  filterName: string,
  extensions: string[]
): Promise<{ name: string; content: string } | null> {
  const isTauri = typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window;
  if (!isTauri) return null;

  const { open } = await import('@tauri-apps/plugin-dialog');
  const selected = await open({
    title,
    multiple: false,
    filters: [{ name: filterName, extensions }],
  });
  if (!selected || typeof selected !== 'string') return null;
  const content = await invoke<string>('load_project_file', { filePath: selected });
  return { name: selected, content };
}

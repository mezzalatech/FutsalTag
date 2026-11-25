import { jsPDF } from 'jspdf';
import { invoke } from '@tauri-apps/api/core';
import { isTauriDesktop } from '$lib/stores/projectStore.svelte';
import type { RosterPlayer, VideoTagEvent } from '$lib/types';

export interface MatchPdfReportInput {
  matchTitle: string;
  durationSec: number;
  tags: VideoTagEvent[];
  roster: RosterPlayer[];
  formatMatchClock: (sec: number) => string;
  getPlayerDisplayLabel: (p: RosterPlayer) => string;
}

function zoneToCourtMeters(zone?: string, idx = 0): { x: number; y: number } {
  const jitterX = ((idx * 7) % 5) - 2;
  const jitterY = ((idx * 11) % 5) - 2;
  switch (zone) {
    case 'Area Penalti Lawan':
      return { x: 35 + jitterX * 0.7, y: 10 + jitterY * 0.9 };
    case 'Flank Kiri':
      return { x: 24 + jitterX * 1.5, y: 3.5 + jitterY * 0.4 };
    case 'Flank Kanan':
      return { x: 24 + jitterX * 1.5, y: 16.5 + jitterY * 0.4 };
    case 'Area Tengah':
      return { x: 20 + jitterX * 1.2, y: 10 + jitterY * 0.8 };
    case 'Area Bertahan Sendiri':
      return { x: 7 + jitterX * 0.9, y: 10 + jitterY * 1.1 };
    default:
      return { x: 20 + jitterX * 2.0, y: 10 + jitterY * 1.2 };
  }
}

export async function exportExecutiveMatchPdfReport(
  input: MatchPdfReportInput
): Promise<string | null> {
  const {
    matchTitle,
    durationSec,
    tags,
    roster,
    formatMatchClock,
    getPlayerDisplayLabel,
  } = input;

  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const pageW = 297;
  const pageH = 210;

  // --- HEADER BAR ---
  doc.setFillColor(11, 23, 42);
  doc.rect(0, 0, pageW, 24, 'F');
  doc.setFillColor(56, 189, 248);
  doc.rect(0, 24, pageW, 1.2, 'F');

  doc.setTextColor(56, 189, 248);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.text('FUTSALTAG PRO — LAPORAN ANALISIS PERTANDINGAN FUTSAL (FIFA 40m x 20m)', 14, 9);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(15);
  doc.text(matchTitle || 'Pertandingan Futsal', 14, 18);

  const dateStr = new Date().toLocaleString('id-ID');
  const minsTotal = Math.floor(durationSec / 60);
  const secsTotal = Math.floor(durationSec % 60);
  doc.setTextColor(148, 163, 184);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  doc.text(
    `Diekspor: ${dateStr}  |  Durasi Video: ${minsTotal}m ${secsTotal}s  |  Total Klip: ${tags.length}`,
    pageW - 14,
    18,
    { align: 'right' }
  );

  // --- KPI SUMMARY BOXES (5 CARDS) ---
  const totalCount = tags.length;
  const goalCount = tags.filter((t) => t.category === 'Goal').length;
  const shotCount = tags.filter(
    (t) => t.category === 'Shot on Target' || t.category === 'Shot Off Target'
  ).length;
  const pressingTransitionCount = tags.filter(
    (t) =>
      t.category === 'Pressing High' ||
      t.category === 'Transition Attack' ||
      t.category === 'Transition Defense'
  ).length;
  const setPieceCount = tags.filter(
    (t) => t.category === 'Kick-in Set Piece' || t.category === 'Corner Set Piece'
  ).length;

  const kpis = [
    { label: 'TOTAL MOMEN', val: String(totalCount), rgb: [14, 165, 233] as [number, number, number] },
    { label: 'GOL', val: String(goalCount), rgb: [16, 185, 129] as [number, number, number] },
    { label: 'TEMBAKAN (SHOT)', val: String(shotCount), rgb: [59, 130, 246] as [number, number, number] },
    { label: 'PRESSING / TRANSISI', val: String(pressingTransitionCount), rgb: [245, 158, 11] as [number, number, number] },
    { label: 'SET PIECE', val: String(setPieceCount), rgb: [236, 72, 153] as [number, number, number] },
  ];

  const cardGap = 4;
  const cardW = (pageW - 28 - cardGap * 4) / 5;
  kpis.forEach((k, idx) => {
    const x = 14 + idx * (cardW + cardGap);
    const y = 30;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(203, 213, 225);
    doc.roundedRect(x, y, cardW, 18, 2, 2, 'FD');
    doc.setFillColor(k.rgb[0], k.rgb[1], k.rgb[2]);
    doc.rect(x, y, 2.2, 18, 'F');

    doc.setTextColor(100, 116, 139);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text(k.label, x + 5, y + 6);

    doc.setTextColor(15, 23, 42);
    doc.setFontSize(14);
    doc.text(k.val, x + 5, y + 14);
  });

  // --- LEFT COLUMN: VECTOR FIFA FUTSAL COURT (40m x 20m) ---
  const courtBoxX = 14;
  const courtBoxY = 54;
  const courtBoxW = 142;
  const courtBoxH = 82;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(courtBoxX, courtBoxY, courtBoxW, courtBoxH, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('PETA SPASIAL MOMEN DI LAPANGAN FUTSAL (40m x 20m)', courtBoxX + 4, courtBoxY + 6.5);

  const pX = courtBoxX + 7;
  const pY = courtBoxY + 11;
  const pW = 128; // 40m -> 3.2 mm/m
  const pH = 64;  // 20m -> 3.2 mm/m
  const s = 3.2;

  doc.setFillColor(13, 59, 102);
  doc.setDrawColor(255, 255, 255);
  doc.setLineWidth(0.5);
  doc.rect(pX, pY, pW, pH, 'FD');

  // Halfway line & center circle
  doc.line(pX + pW / 2, pY, pX + pW / 2, pY + pH);
  doc.circle(pX + pW / 2, pY + pH / 2, 3 * s, 'S');
  doc.circle(pX + pW / 2, pY + pH / 2, 0.7, 'F');

  // Penalty arcs (6m simplified) & 6m/10m spots
  doc.circle(pX + 6 * s, pY + pH / 2, 0.7, 'F');
  doc.circle(pX + 10 * s, pY + pH / 2, 0.6, 'F');
  doc.circle(pX + pW - 6 * s, pY + pH / 2, 0.7, 'F');
  doc.circle(pX + pW - 10 * s, pY + pH / 2, 0.6, 'F');

  // Goal area rectangles
  doc.rect(pX, pY + pH / 2 - 5 * s, 6 * s, 10 * s, 'S');
  doc.rect(pX + pW - 6 * s, pY + pH / 2 - 5 * s, 6 * s, 10 * s, 'S');

  // Goals (3m wide)
  doc.setLineWidth(1.0);
  doc.setDrawColor(56, 189, 248);
  doc.line(pX - 1.2, pY + pH / 2 - 1.5 * s, pX - 1.2, pY + pH / 2 + 1.5 * s);
  doc.line(pX + pW + 1.2, pY + pH / 2 - 1.5 * s, pX + pW + 1.2, pY + pH / 2 + 1.5 * s);

  // Plot tag points
  tags.forEach((t, idx) => {
    const coord = t.courtCoord
      ? { x: Math.max(0, Math.min(40, t.courtCoord.x)), y: Math.max(0, Math.min(20, t.courtCoord.y)) }
      : zoneToCourtMeters(t.zoneLabel, idx);
    const dx = pX + coord.x * s;
    const dy = pY + coord.y * s;

    if (t.category === 'Goal') {
      doc.setFillColor(16, 185, 129);
    } else if (t.teamSide === 'away') {
      doc.setFillColor(239, 68, 68);
    } else {
      doc.setFillColor(56, 189, 248);
    }
    doc.setDrawColor(255, 255, 255);
    doc.setLineWidth(0.25);
    doc.circle(dx, dy, 1.8, 'FD');
  });

  // Legend below court
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text('Hijau: Gol   |   Biru: Aksi Home   |   Merah: Aksi Away / Kebobolan', courtBoxX + 7, courtBoxY + 79);

  // --- RIGHT COLUMN: PLAYER PERFORMANCE TABLE & TOP CATEGORIES ---
  const rightX = 162;
  const rightW = pageW - rightX - 14;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(rightX, courtBoxY, rightW, courtBoxH, 2, 2, 'FD');

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('RINGKASAN PERFORMA PEMAIN', rightX + 4, courtBoxY + 6.5);

  const playerStats = new Map<string, { total: number; goals: number; shots: number; favs: number }>();
  for (const r of roster.filter((p) => !p.isOpponent)) {
    playerStats.set(getPlayerDisplayLabel(r), { total: 0, goals: 0, shots: 0, favs: 0 });
  }
  for (const t of tags) {
    const involved =
      t.playersInvolved && t.playersInvolved.length > 0
        ? t.playersInvolved
        : t.playerLabel
          ? [t.playerLabel]
          : [];
    for (const pl of involved) {
      const cur = playerStats.get(pl) || { total: 0, goals: 0, shots: 0, favs: 0 };
      cur.total += 1;
      if (t.category === 'Goal') cur.goals += 1;
      if (t.category === 'Shot on Target' || t.category === 'Shot Off Target') cur.shots += 1;
      if (t.favorite) cur.favs += 1;
      playerStats.set(pl, cur);
    }
  }

  const playerRows = Array.from(playerStats.entries())
    .sort((a, b) => b[1].total - a[1].total || b[1].goals - a[1].goals)
    .slice(0, 8);

  let ry = courtBoxY + 12;
  doc.setFillColor(15, 23, 42);
  doc.rect(rightX + 4, ry, rightW - 8, 6.5, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(7.5);
  doc.text('Pemain', rightX + 6, ry + 4.4);
  doc.text('Klip', rightX + 66, ry + 4.4, { align: 'right' });
  doc.text('Gol', rightX + 82, ry + 4.4, { align: 'right' });
  doc.text('Shot', rightX + 98, ry + 4.4, { align: 'right' });
  doc.text('Fav', rightX + rightW - 6, ry + 4.4, { align: 'right' });

  ry += 6.5;
  playerRows.forEach(([name, st], idx) => {
    if (idx % 2 === 0) {
      doc.setFillColor(241, 245, 249);
      doc.rect(rightX + 4, ry, rightW - 8, 6.2, 'F');
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.text(name.slice(0, 26), rightX + 6, ry + 4.3);
    doc.text(String(st.total), rightX + 66, ry + 4.3, { align: 'right' });
    doc.text(String(st.goals), rightX + 82, ry + 4.3, { align: 'right' });
    doc.text(String(st.shots), rightX + 98, ry + 4.3, { align: 'right' });
    doc.text(String(st.favs), rightX + rightW - 6, ry + 4.3, { align: 'right' });
    ry += 6.2;
  });

  // --- BOTTOM STRIP ON PAGE 1: TOP CATEGORIES ---
  const catMap = new Map<string, number>();
  for (const t of tags) {
    catMap.set(t.category, (catMap.get(t.category) || 0) + 1);
  }
  const topCats = Array.from(catMap.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 6);

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.roundedRect(14, 142, pageW - 28, 52, 2, 2, 'FD');
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text('DISTRIBUSI KATEGORI AKSI PERTANDINGAN', 18, 149);

  if (topCats.length === 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text('Belum ada momen klip yang ditandai pada pertandingan ini.', 18, 160);
  } else {
    const maxCat = Math.max(1, topCats[0][1]);
    topCats.forEach(([cat, cnt], idx) => {
      const cy = 155 + idx * 6.2;
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8);
      doc.setTextColor(30, 41, 59);
      doc.text(cat.slice(0, 24), 18, cy + 3.5);

      const barMaxW = 195;
      const barW = Math.max(6, (cnt / maxCat) * barMaxW);
      doc.setFillColor(226, 232, 240);
      doc.roundedRect(70, cy, barMaxW, 4.2, 1, 1, 'F');
      doc.setFillColor(2, 132, 199);
      doc.roundedRect(70, cy, barW, 4.2, 1, 1, 'F');

      doc.setTextColor(15, 23, 42);
      doc.text(`${cnt} klip`, 270, cy + 3.5);
    });
  }

  // Footer Page 1
  doc.setFontSize(7.5);
  doc.setTextColor(100, 116, 139);
  doc.text('FutsalTag Pro — Halaman 1', 14, pageH - 6);

  // --- PAGE 2+: CHRONOLOGICAL KEY MOMENTS LOG ---
  const drawMomentsHeader = (pageNum: number) => {
    doc.addPage();
    doc.setFillColor(11, 23, 42);
    doc.rect(0, 0, pageW, 18, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`LOG KRONOLOGIS MOMEN PERTANDINGAN — ${matchTitle}`, 14, 11.5);
    doc.setTextColor(148, 163, 184);
    doc.setFontSize(8);
    doc.text(`Halaman ${pageNum}`, pageW - 14, 11.5, { align: 'right' });

    const hy = 24;
    doc.setFillColor(15, 23, 42);
    doc.rect(14, hy, pageW - 28, 7, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(7.8);
    doc.text('No', 16, hy + 4.8);
    doc.text('Waktu', 28, hy + 4.8);
    doc.text('Kategori', 52, hy + 4.8);
    doc.text('Tim', 96, hy + 4.8);
    doc.text('Pemain', 114, hy + 4.8);
    doc.text('Zona', 166, hy + 4.8);
    doc.text('Hasil', 208, hy + 4.8);
    doc.text('Catatan', 240, hy + 4.8);
    return hy + 7;
  };

  let pageNum = 2;
  let yCursor = drawMomentsHeader(pageNum);
  const sortedTags = [...tags].sort((a, b) => a.startTime - b.startTime);

  sortedTags.forEach((tag, idx) => {
    if (yCursor > pageH - 16) {
      pageNum += 1;
      yCursor = drawMomentsHeader(pageNum);
    }
    if (idx % 2 === 0) {
      doc.setFillColor(248, 250, 252);
      doc.rect(14, yCursor, pageW - 28, 6.8, 'F');
    }
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.6);
    const playersStr =
      tag.playersInvolved && tag.playersInvolved.length > 0
        ? tag.playersInvolved.join(', ')
        : tag.playerLabel || '-';

    doc.text(String(idx + 1), 16, yCursor + 4.6);
    doc.text(formatMatchClock(tag.startTime).slice(0, 12), 28, yCursor + 4.6);
    doc.text((tag.category || '-').slice(0, 22), 52, yCursor + 4.6);
    doc.text((tag.teamSide || 'home').toUpperCase(), 96, yCursor + 4.6);
    doc.text(playersStr.slice(0, 25), 114, yCursor + 4.6);
    doc.text((tag.zoneLabel || '-').slice(0, 20), 166, yCursor + 4.6);
    doc.text((tag.outcomeLabel || '-').slice(0, 16), 208, yCursor + 4.6);
    doc.text((tag.notes || tag.title || '-').slice(0, 24), 240, yCursor + 4.6);
    yCursor += 6.8;
  });

  const safeName = (matchTitle || 'laporan_futsal')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .toLowerCase();

  if (isTauriDesktop()) {
    const { save } = await import('@tauri-apps/plugin-dialog');
    const selected = await save({
      title: 'Simpan Laporan Pertandingan PDF',
      defaultPath: `${safeName}_laporan.pdf`,
      filters: [{ name: 'PDF Document', extensions: ['pdf'] }],
    });
    if (!selected) return null;
    const dataUri = doc.output('datauristring');
    await invoke<string>('save_binary_file', {
      filePath: selected,
      base64Content: dataUri,
    });
    return selected;
  }

  doc.save(`${safeName}_laporan.pdf`);
  return `${safeName}_laporan.pdf`;
}

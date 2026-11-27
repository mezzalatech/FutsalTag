// PDF Export Utility for Futsal Tactical Training Sheets & Full Session Plans
import jsPDF from 'jspdf';
import type {
  TacticalDrill,
  TacticalStep,
  TrainingSessionPlan,
  TrainingPhaseKind,
  TrainingIntensity,
} from '$lib/types';

export function exportDrillToPDF(
  drill: TacticalDrill,
  currentStep: TacticalStep,
  canvasElement: HTMLCanvasElement
) {
  const doc = new jsPDF({
    orientation: 'landscape',
    unit: 'mm',
    format: 'a4', // 297mm x 210mm
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();

  // Background style
  doc.setFillColor(15, 23, 42); // Slate 900
  doc.rect(0, 0, pageWidth, pageHeight, 'F');

  // Header Banner
  doc.setFillColor(30, 41, 59); // Slate 800
  doc.rect(0, 0, pageWidth, 24, 'F');

  // Brand & Title
  doc.setTextColor(56, 189, 248); // Sky blue
  doc.setFontSize(14);
  doc.setFont('helvetica', 'bold');
  doc.text('ARF FUTSALTAG // FUTSAL TACTICAL BOARD', 14, 11);

  doc.setTextColor(255, 255, 255);
  doc.setFontSize(16);
  doc.text(drill.title.toUpperCase(), 14, 19);

  // Category Tag
  doc.setFillColor(14, 165, 233);
  doc.roundedRect(pageWidth - 75, 7, 60, 10, 2, 2, 'F');
  doc.setTextColor(255, 255, 255);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'bold');
  doc.text(drill.category, pageWidth - 45, 13.5, { align: 'center' });

  // Tactical Pitch Image from Canvas
  const imgData = canvasElement.toDataURL('image/png', 1.0);
  const imgWidth = 190;
  const imgHeight = 95;
  const imgX = 14;
  const imgY = 32;

  // Image border card
  doc.setFillColor(24, 32, 47);
  doc.roundedRect(imgX - 2, imgY - 2, imgWidth + 4, imgHeight + 4, 3, 3, 'F');
  doc.addImage(imgData, 'PNG', imgX, imgY, imgWidth, imgHeight);

  // Right Side Panel: Step Details & Coaching Points
  const panelX = imgX + imgWidth + 10;
  const panelWidth = pageWidth - panelX - 14;
  const panelY = 30;

  // Step info card
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(panelX, panelY, panelWidth, 40, 3, 3, 'F');

  doc.setTextColor(56, 189, 248);
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text(`STEP ${currentStep.stepNumber}: ${currentStep.title.toUpperCase()}`, panelX + 6, panelY + 10);

  doc.setTextColor(203, 213, 225);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');
  const splitDesc = doc.splitTextToSize(currentStep.description || 'Tidak ada deskripsi langkah.', panelWidth - 12);
  doc.text(splitDesc, panelX + 6, panelY + 18);

  // Coaching Points Card
  const coachCardY = panelY + 46;
  doc.setFillColor(30, 41, 59);
  doc.roundedRect(panelX, coachCardY, panelWidth, 90, 3, 3, 'F');

  doc.setTextColor(234, 179, 8); // Yellow
  doc.setFontSize(11);
  doc.setFont('helvetica', 'bold');
  doc.text('CATATAN PELATIH & POIN KUNCI', panelX + 6, coachCardY + 10);

  doc.setTextColor(226, 232, 240);
  doc.setFontSize(9);
  doc.setFont('helvetica', 'normal');

  const notes = drill.coachNotes || 
    '1. Pastikan jarak antar pemain terjaga (compactness).\n' +
    '2. Rotasi dilakukan cepat dengan satu atau dua sentuhan.\n' +
    '3. Komunikasi vokal saat pergantian posisi Anchor dan Flank.\n' +
    '4. Pivot bergerak menarik bek lawan untuk membuka ruang tembak.';

  const splitNotes = doc.splitTextToSize(notes, panelWidth - 12);
  doc.text(splitNotes, panelX + 6, coachCardY + 18);

  // Footer
  doc.setTextColor(100, 116, 139);
  doc.setFontSize(8);
  doc.text(
    `Dibuat dengan ARF FutsalTag | Tanggal: ${new Date().toLocaleDateString('id-ID')} | Standar Lapangan FIFA (40m x 20m)`,
    14,
    pageHeight - 8
  );

  // Trigger download
  const safeFilename = `${drill.title.replace(/[^a-zA-Z0-9]/g, '_')}_Step${currentStep.stepNumber}.pdf`;
  doc.save(safeFilename);
}

const PHASE_META: Record<TrainingPhaseKind, { label: string; rgb: [number, number, number] }> = {
  warmup: { label: 'PEMANASAN (WARM-UP)', rgb: [14, 165, 233] },
  main: { label: 'MATERI INTI (MAIN PART)', rgb: [16, 185, 129] },
  finishing: { label: 'PENYELESAIAN / GAME', rgb: [245, 158, 11] },
  cooldown: { label: 'PENDINGINAN (COOL-DOWN)', rgb: [168, 85, 247] },
};

const INTENSITY_RGB: Record<TrainingIntensity, [number, number, number]> = {
  Rendah: [56, 189, 248],
  Sedang: [16, 185, 129],
  Tinggi: [245, 158, 11],
  Maksimal: [239, 68, 68],
};

export function exportTrainingSessionToPDF(
  plan: TrainingSessionPlan,
  clubLogoDataUrl?: string | null
) {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4', // 210mm x 297mm
  });

  const pageW = doc.internal.pageSize.getWidth();
  const pageH = doc.internal.pageSize.getHeight();

  const drawPageChrome = (pageNum: number) => {
    doc.setFillColor(15, 23, 42);
    doc.rect(0, 0, pageW, pageH, 'F');
    doc.setFillColor(30, 41, 59);
    doc.rect(0, 0, pageW, 24, 'F');

    let textStartX = 12;
    if (clubLogoDataUrl) {
      try {
        doc.addImage(clubLogoDataUrl, 'PNG', 10, 4, 16, 16);
        textStartX = 30;
      } catch {
        // Ignore invalid image format
      }
    }

    doc.setTextColor(56, 189, 248);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('ARF FUTSALTAG // RENCANA SESI LATIHAN', textStartX, 9.5);

    doc.setTextColor(248, 250, 252);
    doc.setFontSize(13.5);
    doc.text((plan.title || 'Rencana Sesi Latihan Futsal').toUpperCase(), textStartX, 17.5);

    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.text(`Hal. ${pageNum}`, pageW - 14, 14, { align: 'right' });

    // Footer
    doc.setTextColor(100, 116, 139);
    doc.setFontSize(7.5);
    doc.text(
      `Tim: ${plan.teamName || '-'} | Pelatih: ${plan.coachName || '-'} | Tanggal: ${plan.date || '-'}`,
      12,
      pageH - 7
    );
  };

  // --- PAGE 1: OVERVIEW & SCHEDULE ---
  drawPageChrome(1);

  // Summary Metadata Grid
  const metaCards = [
    { label: 'TOTAL DURASI', value: `${plan.totalDurationMinutes} Menit`, color: [56, 189, 248] as [number, number, number] },
    { label: 'INTENSITAS', value: plan.overallIntensity, color: INTENSITY_RGB[plan.overallIntensity] || [16, 185, 129] },
    { label: 'JUMLAH PEMAIN', value: plan.playerCountSummary || '12 Pemain + 2 GK', color: [148, 163, 184] as [number, number, number] },
    { label: 'AREA LAPANGAN', value: plan.spaceSummary || '40m x 20m', color: [148, 163, 184] as [number, number, number] },
  ];

  const cardW = (pageW - 24 - 9) / 4;
  metaCards.forEach((m, idx) => {
    const x = 12 + idx * (cardW + 3);
    doc.setFillColor(24, 34, 54);
    doc.roundedRect(x, 30, cardW, 18, 2, 2, 'F');
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(m.label, x + 3.5, 36);
    doc.setTextColor(m.color[0], m.color[1], m.color[2]);
    doc.setFontSize(10);
    doc.text(doc.splitTextToSize(m.value, cardW - 7)[0] || '-', x + 3.5, 43);
  });

  // Objective Card
  doc.setFillColor(24, 34, 54);
  doc.roundedRect(12, 52, pageW - 24, 24, 2.5, 2.5, 'F');
  doc.setTextColor(251, 191, 36);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.text('TUJUAN LATIHAN (TRAINING OBJECTIVES)', 16, 59);
  doc.setTextColor(226, 232, 240);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.5);
  const objLines = doc.splitTextToSize(plan.trainingObjective || 'Meningkatkan koordinasi taktik dan eksekusi.', pageW - 32);
  doc.text(objLines.slice(0, 3), 16, 65);

  // Schedule Breakdown Table Header
  let curY = 82;
  doc.setTextColor(56, 189, 248);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9.5);
  doc.text(`SUSUNAN MATERI LATIHAN (${plan.blocks.length} FASE)`, 12, curY);
  curY += 4;

  doc.setFillColor(30, 41, 59);
  doc.rect(12, curY, pageW - 24, 7.5, 'F');
  doc.setTextColor(148, 163, 184);
  doc.setFontSize(7.5);
  doc.text('FASE', 15, curY + 5);
  doc.text('MATERI / DRILL', 56, curY + 5);
  doc.text('DURASI', 125, curY + 5);
  doc.text('INTENSITAS', 146, curY + 5);
  doc.text('AREA & PEMAIN', 171, curY + 5);
  curY += 8.5;

  plan.blocks.forEach((blk, idx) => {
    if (curY > 245) return; // keep page 1 neat
    const pm = PHASE_META[blk.phase] || PHASE_META.main;
    const ic = INTENSITY_RGB[blk.intensity] || [16, 185, 129];

    doc.setFillColor(idx % 2 === 0 ? 20 : 25, idx % 2 === 0 ? 30 : 36, idx % 2 === 0 ? 48 : 56);
    doc.rect(12, curY, pageW - 24, 11, 'F');

    doc.setTextColor(pm.rgb[0], pm.rgb[1], pm.rgb[2]);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(pm.label.split(' ')[0], 15, curY + 6.8);

    doc.setTextColor(248, 250, 252);
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(blk.title || 'Drill Tanpa Judul', 65)[0] || '-', 56, curY + 6.8);

    doc.setTextColor(203, 213, 225);
    doc.text(`${blk.durationMinutes} mnt`, 125, curY + 6.8);

    doc.setTextColor(ic[0], ic[1], ic[2]);
    doc.text(blk.intensity, 146, curY + 6.8);

    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text(doc.splitTextToSize(`${blk.spaceArea || '-'} / ${blk.playerCount || '-'}`, 26)[0] || '-', 171, curY + 6.8);

    curY += 12;
  });

  // General Notes
  if (plan.generalNotes?.trim()) {
    const notesY = Math.max(curY + 6, 210);
    if (notesY < pageH - 42) {
      doc.setFillColor(24, 34, 54);
      doc.roundedRect(12, notesY, pageW - 24, pageH - notesY - 14, 2.5, 2.5, 'F');
      doc.setTextColor(251, 191, 36);
      doc.setFont('helvetica', 'bold');
      doc.setFontSize(8.5);
      doc.text('CATATAN UMUM & PERLENGKAPAN', 16, notesY + 7);
      doc.setTextColor(226, 232, 240);
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      const genLines = doc.splitTextToSize(plan.generalNotes, pageW - 32);
      doc.text(genLines.slice(0, 8), 16, notesY + 13);
    }
  }

  // --- SUBSEQUENT PAGES: 2 DRILL BLOCKS PER PAGE ---
  let pageCount = 1;
  plan.blocks.forEach((blk, idx) => {
    const slot = idx % 2;
    if (slot === 0) {
      doc.addPage();
      pageCount++;
      drawPageChrome(pageCount);
    }

    const baseY = slot === 0 ? 30 : 158;
    const pm = PHASE_META[blk.phase] || PHASE_META.main;
    const ic = INTENSITY_RGB[blk.intensity] || [16, 185, 129];

    // Drill Block Container
    doc.setFillColor(24, 34, 54);
    doc.roundedRect(12, baseY, pageW - 24, 120, 3, 3, 'F');

    // Phase Pill + Title
    doc.setFillColor(pm.rgb[0], pm.rgb[1], pm.rgb[2]);
    doc.roundedRect(16, baseY + 5, 48, 6, 1.5, 1.5, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.text(pm.label, 40, baseY + 9.2, { align: 'center' });

    doc.setTextColor(248, 250, 252);
    doc.setFontSize(11);
    doc.text(`${idx + 1}. ${blk.title || 'Drill Latihan'}`, 68, baseY + 9.5);

    doc.setTextColor(ic[0], ic[1], ic[2]);
    doc.setFontSize(8.5);
    doc.text(`${blk.durationMinutes} mnt · ${blk.intensity}`, pageW - 16, baseY + 9.5, { align: 'right' });

    // Diagram Image (Left 102mm x 51mm)
    const imgX = 16;
    const imgY = baseY + 15;
    const imgW = 104;
    const imgH = 52;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(imgX, imgY, imgW, imgH, 2, 2, 'F');
    if (blk.diagramImageDataUrl) {
      try {
        doc.addImage(blk.diagramImageDataUrl, 'PNG', imgX + 1, imgY + 1, imgW - 2, imgH - 2);
      } catch {
        doc.setTextColor(100, 116, 139);
        doc.setFontSize(8);
        doc.text('Diagram tidak tersedia', imgX + imgW / 2, imgY + imgH / 2, { align: 'center' });
      }
    } else {
      doc.setTextColor(100, 116, 139);
      doc.setFontSize(8);
      doc.text('Belum ada diagram taktik terlampir', imgX + imgW / 2, imgY + imgH / 2, { align: 'center' });
    }

    // Right Column Metadata beside diagram
    const infoX = imgX + imgW + 6;
    const infoW = pageW - infoX - 16;
    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.text('AREA & PEMAIN:', infoX, imgY + 5);
    doc.setTextColor(241, 245, 249);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(`${blk.spaceArea || '-'} | ${blk.playerCount || '-'}`, infoW).slice(0, 2), infoX, imgY + 10);

    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'bold');
    doc.text('PERLENGKAPAN:', infoX, imgY + 21);
    doc.setTextColor(241, 245, 249);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(blk.equipment || '-', infoW).slice(0, 2), infoX, imgY + 26);

    doc.setTextColor(148, 163, 184);
    doc.setFont('helvetica', 'bold');
    doc.text('TUJUAN DRILL:', infoX, imgY + 38);
    doc.setTextColor(241, 245, 249);
    doc.setFont('helvetica', 'normal');
    doc.text(doc.splitTextToSize(blk.objective || '-', infoW).slice(0, 3), infoX, imgY + 43);

    // Coaching Points (Bottom full width inside block)
    const cpY = imgY + imgH + 6;
    doc.setFillColor(15, 23, 42);
    doc.roundedRect(16, cpY, pageW - 32, 42, 2, 2, 'F');
    doc.setTextColor(251, 191, 36);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('POIN KEPELATIHAN & INSTRUKSI:', 20, cpY + 6.5);
    doc.setTextColor(226, 232, 240);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    const cpLines = doc.splitTextToSize(blk.coachingPoints || 'Ikuti instruksi pelatih utama.', pageW - 40);
    doc.text(cpLines.slice(0, 6), 20, cpY + 12.5);
  });

  const safeName = (plan.title || 'Sesi_Latihan_Futsal').replace(/[^a-zA-Z0-9_-]/g, '_');
  doc.save(`${safeName}_SessionPlan.pdf`);
}

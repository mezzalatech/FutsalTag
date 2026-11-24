// PDF Export Utility for Futsal Tactical Training Sheets
import jsPDF from 'jspdf';
import type { TacticalDrill, TacticalStep } from '$lib/types';

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
  doc.text('TELESLATOR // FUTSAL TACTICAL BOARD', 14, 11);

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
    `Dibuat dengan Teleslator Futsal Analyser | Tanggal: ${new Date().toLocaleDateString('id-ID')} | Standar Lapangan FIFA (40m x 20m)`,
    14,
    pageHeight - 8
  );

  // Trigger download
  const safeFilename = `${drill.title.replace(/[^a-zA-Z0-9]/g, '_')}_Step${currentStep.stepNumber}.pdf`;
  doc.save(safeFilename);
}

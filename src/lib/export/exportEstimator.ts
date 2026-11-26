export type ExportAspectRatio = '16:9' | '9:16';
export type ExportCrfPreset = 18 | 23 | 28;

export function estimateExportSizeMb(
  totalDurationSec: number,
  resolution: '1080p' | '720p',
  crf: number,
  aspectRatio: ExportAspectRatio
): number {
  const baseVideoMbps = resolution === '1080p' ? 4.5 : 2.2;
  const aspectFactor = aspectRatio === '9:16' ? 0.95 : 1.0;
  const crfFactor = Math.pow(2, (23 - crf) / 6);
  const videoMbps = baseVideoMbps * aspectFactor * crfFactor;
  const totalMbps = videoMbps + 0.128;
  return Math.max(0.1, (totalMbps * Math.max(0.2, totalDurationSec)) / 8);
}

export function formatEstimatedSize(mb: number): string {
  if (mb >= 1024) {
    return `~${(mb / 1024).toFixed(2)} GB`;
  }
  return `~${mb.toFixed(1)} MB`;
}

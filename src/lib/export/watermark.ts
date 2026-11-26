import type { WatermarkConfig, WatermarkPosition } from '$lib/types';

export interface WatermarkExportPayload {
  image_base64: string;
  position: WatermarkPosition;
  opacity: number;
  scale_ratio: number;
}

const rasterCache = new Map<string, string>();

/**
 * Normalize any image data URL (PNG, JPG, WebP, or SVG) into a size-capped transparent PNG data URL
 * suitable for FFmpeg overlay filtering. Cached by source URL and max dimension.
 */
export async function rasterizeWatermarkDataUrl(
  dataUrl: string | null | undefined,
  maxDim = 360
): Promise<string | null> {
  const clean = dataUrl?.trim();
  if (!clean) return null;

  const cacheKey = `${maxDim}:${clean.length}:${clean.slice(0, 64)}:${clean.slice(-32)}`;
  const cached = rasterCache.get(cacheKey);
  if (cached) return cached;

  if (typeof document === 'undefined') {
    return clean.startsWith('data:image/png') ? clean : null;
  }

  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error('Gagal memuat gambar logo watermark'));
      el.src = clean;
    });

    const natW = Math.max(1, img.naturalWidth || img.width || 128);
    const natH = Math.max(1, img.naturalHeight || img.height || 128);
    const scale = Math.min(1, maxDim / Math.max(natW, natH));
    const w = Math.max(16, Math.round((natW * scale) / 2) * 2);
    const h = Math.max(16, Math.round((natH * scale) / 2) * 2);

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.clearRect(0, 0, w, h);
    ctx.drawImage(img, 0, 0, w, h);
    const pngUrl = canvas.toDataURL('image/png');
    if (rasterCache.size > 16) rasterCache.clear();
    rasterCache.set(cacheKey, pngUrl);
    return pngUrl;
  } catch {
    return clean.startsWith('data:image/png') ? clean : null;
  }
}

export async function buildWatermarkExportPayload(
  clubLogoDataUrl: string | null | undefined,
  config: WatermarkConfig
): Promise<WatermarkExportPayload | null> {
  if (!config.enabled || !clubLogoDataUrl) return null;
  const pngUrl = await rasterizeWatermarkDataUrl(clubLogoDataUrl);
  if (!pngUrl) return null;
  return {
    image_base64: pngUrl,
    position: config.position,
    opacity: Math.max(0.15, Math.min(1.0, config.opacity)),
    scale_ratio: Math.max(0.04, Math.min(0.25, config.scaleRatio)),
  };
}

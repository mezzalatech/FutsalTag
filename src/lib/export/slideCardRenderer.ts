function createOffscreenCanvas(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
  ctx.closePath();
}

function drawBroadcastBackdrop(ctx: CanvasRenderingContext2D, width: number, height: number, bgColor?: string) {
  const grad = ctx.createRadialGradient(width * 0.5, height * 0.25, width * 0.05, width * 0.5, height * 0.5, width * 0.85);
  if (bgColor && bgColor !== '#0f172a') {
    grad.addColorStop(0, bgColor);
    grad.addColorStop(1, '#040812');
  } else {
    grad.addColorStop(0, '#0f2447');
    grad.addColorStop(1, '#040812');
  }
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.12)';
  ctx.lineWidth = Math.max(2, Math.round(height * 0.003));
  ctx.strokeRect(width * 0.035, height * 0.05, width * 0.93, height * 0.9);
}

function wrapTextLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines = 3): string[] {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return [];
  const lines: string[] = [];
  let current = '';
  for (const w of words) {
    const cand = current ? `${current} ${w}` : w;
    if (ctx.measureText(cand).width <= maxWidth) {
      current = cand;
    } else {
      if (current) lines.push(current);
      current = w;
      if (lines.length >= maxLines - 1) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);
  return lines;
}

export function renderClipTitleCardDataUrl(opts: {
  matchTitle: string;
  timeLabel: string;
  category: string;
  categoryColor?: string;
  clipTitle: string;
  playerLabel?: string;
  labels?: string[];
  width: number;
  height: number;
}): string {
  const { width, height } = opts;
  const canvas = createOffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  drawBroadcastBackdrop(ctx, width, height);

  const padX = Math.round(width * 0.08);
  const isVertical = height > width;
  const baseFont = Math.round(Math.min(width, height) * (isVertical ? 0.042 : 0.048));
  const catColor = opts.categoryColor || '#0284c7';

  // Top bar: Match title + time badge
  ctx.font = `700 ${Math.round(baseFont * 0.55)}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = '#93c5fd';
  ctx.textBaseline = 'middle';
  ctx.fillText((opts.matchTitle || 'ARF FutsalTag').toUpperCase(), padX, Math.round(height * 0.18), width - padX * 2);

  // Category pill + timestamp
  const pillY = Math.round(height * 0.28);
  const badgeFont = Math.round(baseFont * 0.52);
  ctx.font = `800 ${badgeFont}px Inter, system-ui, sans-serif`;
  const catText = opts.category.toUpperCase();
  const catW = ctx.measureText(catText).width + badgeFont * 1.4;
  const pillH = Math.round(badgeFont * 1.9);
  ctx.fillStyle = catColor;
  drawRoundedRect(ctx, padX, pillY, catW, pillH, 10);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.fillText(catText, padX + badgeFont * 0.7, pillY + pillH / 2);

  ctx.fillStyle = '#38bdf8';
  ctx.fillText(opts.timeLabel, padX + catW + badgeFont * 0.8, pillY + pillH / 2);

  // Main clip title
  const titleFont = Math.round(baseFont * 1.15);
  ctx.font = `900 ${titleFont}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = '#f8fafc';
  const lines = wrapTextLines(ctx, opts.clipTitle || opts.category, width - padX * 2, 3);
  let curY = Math.round(height * 0.46);
  for (const line of lines) {
    ctx.fillText(line, padX, curY);
    curY += Math.round(titleFont * 1.25);
  }

  // Player & Labels footer
  const metaParts: string[] = [];
  if (opts.playerLabel) metaParts.push(opts.playerLabel);
  if (opts.labels && opts.labels.length > 0) metaParts.push(opts.labels.slice(0, 4).join(' · '));
  if (metaParts.length > 0) {
    ctx.font = `600 ${Math.round(baseFont * 0.58)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#cbd5e1';
    ctx.fillText(metaParts.join('   •   '), padX, Math.round(height * 0.78), width - padX * 2);
  }

  return canvas.toDataURL('image/png');
}

export function renderTitleSlideDataUrl(opts: {
  title: string;
  subtitle?: string;
  bgColor?: string;
  width: number;
  height: number;
}): string {
  const { width, height } = opts;
  const canvas = createOffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  drawBroadcastBackdrop(ctx, width, height, opts.bgColor);

  const baseFont = Math.round(Math.min(width, height) * 0.065);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `900 ${baseFont}px Inter, system-ui, sans-serif`;
  ctx.fillStyle = '#f8fafc';
  const titleLines = wrapTextLines(ctx, opts.title || 'Presentasi Analisis', width * 0.82, 3);
  const totalH = titleLines.length * baseFont * 1.25;
  let y = height * 0.46 - totalH / 2 + baseFont * 0.5;
  for (const line of titleLines) {
    ctx.fillText(line, width / 2, y);
    y += baseFont * 1.25;
  }

  if (opts.subtitle?.trim()) {
    ctx.font = `600 ${Math.round(baseFont * 0.46)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#93c5fd';
    ctx.fillText(opts.subtitle.trim(), width / 2, Math.min(height * 0.82, y + baseFont * 0.65), width * 0.82);
  }

  return canvas.toDataURL('image/png');
}

export async function renderImageSlideDataUrl(opts: {
  imageDataUrl: string;
  title?: string;
  caption?: string;
  width: number;
  height: number;
}): Promise<string> {
  const { width, height } = opts;
  const canvas = createOffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  ctx.fillStyle = '#060b14';
  ctx.fillRect(0, 0, width, height);

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = () => reject(new Error('Gagal memuat gambar slide.'));
    el.src = opts.imageDataUrl;
  });

  const footerH = opts.title || opts.caption ? Math.round(height * 0.12) : 0;
  const availW = width;
  const availH = height - footerH;
  const scale = Math.min(availW / img.width, availH / img.height);
  const dw = img.width * scale;
  const dh = img.height * scale;
  ctx.drawImage(img, (availW - dw) / 2, (availH - dh) / 2, dw, dh);

  if (footerH > 0) {
    ctx.fillStyle = 'rgba(7, 15, 29, 0.92)';
    ctx.fillRect(0, height - footerH, width, footerH);
    ctx.font = `700 ${Math.round(height * 0.03)}px Inter, system-ui, sans-serif`;
    ctx.fillStyle = '#f8fafc';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const text = [opts.title, opts.caption].filter(Boolean).join(' — ');
    ctx.fillText(text, width / 2, height - footerH / 2, width * 0.9);
  }

  return canvas.toDataURL('image/png');
}

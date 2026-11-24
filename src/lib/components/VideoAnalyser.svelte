<script lang="ts">
  import { onMount } from 'svelte';
  import { invoke } from '@tauri-apps/api/core';
  import type {
    VideoTagEvent,
    DrawingElement,
    DrawingToolType,
    TagCategory,
    TagOutcome,
    CourtZone,
    TagRating,
    Point2D,
  } from '$lib/types';
  import {
    computeHomography,
    type Matrix3x3,
  } from '$lib/pitch/futsal';
  import {
    runPlayerAutoTracking,
    getInterpolatedPosition,
  } from '$lib/tracking/playerTracker';
  import {
    runMultiPlayerAutoTracking,
    generateFutsalPlayerSeeds,
  } from '$lib/tracking/multiPlayerTracker';
  import StatsMatrixModal from '$lib/components/StatsMatrixModal.svelte';
  import {
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Sparkles,
    MoveRight,
    Eye,
    Ruler,
    Type,
    Upload,
    Film,
    UserCheck,
    Trash2,
    Scissors,
    Crosshair,
    Download,
    Check,
    Clock,
    Layers,
    Sliders,
    Tag,
    Filter,
    User,
    CheckCircle,
    XCircle,
    AlertTriangle,
    BarChart3,
    Search,
    Table,
    Users,
  } from 'lucide-svelte';

  // --- REFS & STATE ---
  let videoEl: HTMLVideoElement | null = $state(null);
  let canvasEl: HTMLCanvasElement | null = $state(null);
  let videoContainer: HTMLDivElement | null = $state(null);

  // Stats Matrix Modal
  let showStatsMatrix = $state(false);
  let isMultiTracking = $state(false);

  // Video State
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let duration = $state(120);
  let playbackRate = $state(1.0);
  let fps = 30;
  let videoSrc = $state<string | null>(null);
  let videoTitle = $state('Rekaman Pertandingan Futsal');
  let videoFilePath = $state<string | null>(null);

  // Smart Pre-roll & Post-roll (Lead/Lag Time)
  let leadTimeSeconds = $state(5.0); // 5s before button click
  let lagTimeSeconds = $state(3.0);  // 3s after button click

  // Tagging Timeline State
  let inPoint: number | null = $state(null);
  let outPoint: number | null = $state(null);
  let selectedTag: VideoTagEvent | null = $state(null);
  let activeLoopClip: VideoTagEvent | null = $state(null);

  // Filter & Search State
  let searchQuery = $state('');
  let filterCategory = $state('ALL');
  let filterPlayer = $state('ALL');
  let filterOutcome = $state('ALL');

  // Labeling Options
  const PLAYER_LABELS = ['#1 Kiper', '#4 Anchor', '#7 Flank Kiri', '#11 Flank Kanan', '#9 Pivot', 'Tim Lawan'];
  const OUTCOME_LABELS: TagOutcome[] = ['Gol / Sukses', 'Terblok / Diselamatkan', 'Keluar / Gagal', 'Turnover'];
  const ZONE_LABELS: CourtZone[] = ['Area Penalti Lawan', 'Flank Kiri', 'Flank Kanan', 'Area Tengah', 'Area Bertahan Sendiri'];
  const RATING_LABELS: TagRating[] = ['⭐⭐⭐ Bagus', '⚠️ Evaluasi', '❌ Kesalahan Fatal'];

  let tags: VideoTagEvent[] = $state([
    {
      id: 'tag-1',
      title: 'Gol Rotasi 3-1 Pivot',
      category: 'Goal',
      startTime: 12.0,
      endTime: 19.5,
      color: '#10b981',
      playerLabel: '#9 Pivot',
      outcomeLabel: 'Gol / Sukses',
      zoneLabel: 'Area Penalti Lawan',
      rating: '⭐⭐⭐ Bagus',
      favorite: true,
      notes: 'Anchor menarik lawan, wall pass dengan pivot berbuah gol.',
    },
    {
      id: 'tag-2',
      title: 'Skema Kick-in Set Piece',
      category: 'Kick-in Set Piece',
      startTime: 34.0,
      endTime: 41.5,
      color: '#38bdf8',
      playerLabel: '#7 Flank Kiri',
      outcomeLabel: 'Terblok / Diselamatkan',
      zoneLabel: 'Flank Kiri',
      rating: '⚠️ Evaluasi',
      notes: 'Variasi kick-in tiang kedua (far post tap-in).',
    },
    {
      id: 'tag-3',
      title: 'Transisi Counter Attack Cepat',
      category: 'Transition Attack',
      startTime: 58.0,
      endTime: 66.0,
      color: '#f59e0b',
      playerLabel: '#4 Anchor',
      outcomeLabel: 'Gol / Sukses',
      zoneLabel: 'Area Tengah',
      rating: '⭐⭐⭐ Bagus',
      notes: 'Intersep flank kiri dilanjutkan umpan diagonal.',
    },
  ]);

  // Filtered Tags computation
  let filteredTags = $derived(
    tags.filter((t) => {
      const matchSearch = searchQuery === '' || 
        t.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (t.notes && t.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (t.playerLabel && t.playerLabel.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchCat = filterCategory === 'ALL' || t.category === filterCategory;
      const matchPlayer = filterPlayer === 'ALL' || t.playerLabel === filterPlayer;
      const matchOutcome = filterOutcome === 'ALL' || t.outcomeLabel === filterOutcome;

      return matchSearch && matchCat && matchPlayer && matchOutcome;
    })
  );

  // Statistics computation
  let statsSummary = $derived({
    total: tags.length,
    goals: tags.filter((t) => t.category === 'Goal' || t.outcomeLabel === 'Gol / Sukses').length,
    shots: tags.filter((t) => t.category === 'Shot on Target' || t.category === 'Shot Off Target').length,
    turnovers: tags.filter((t) => t.outcomeLabel === 'Turnover').length,
  });

  // Telestration Drawing State
  let activeTool: DrawingToolType = $state('select');
  let selectedColor = $state('#00f0ff');
  let drawings: DrawingElement[] = $state([]);
  let inProgressDrawing: DrawingElement | null = $state(null);
  let chromaKeyActive = $state(true);

  // AI Auto-Tracking State
  let isAiTrackingMode = $state(false);
  let isTrackingInProgress = $state(false);
  let trackingProgress = $state(0);
  let trackingStatusText = $state('');

  // 4-Point Homography Pitch Calibration
  let isCalibrating = $state(false);
  let calibStep = $state(0);
  let calibPointsVideo: Point2D[] = $state([]);
  let homographyMatrix: Matrix3x3 | null = $state(null);

  // Export State
  let exportStatus = $state<string | null>(null);

  // Tag Matrix Presets
  const TAG_PRESETS: Array<{ label: string; cat: TagCategory; color: string; key: string }> = [
    { label: 'Gol', cat: 'Goal', color: '#10b981', key: 'G' },
    { label: 'Shot on Target', cat: 'Shot on Target', color: '#06b6d4', key: 'S' },
    { label: 'Kick-in', cat: 'Kick-in Set Piece', color: '#38bdf8', key: 'K' },
    { label: 'Corner', cat: 'Corner Set Piece', color: '#6366f1', key: 'C' },
    { label: 'Build-up 3-1', cat: 'Build-up 3-1', color: '#a855f7', key: '3' },
    { label: 'Build-up 4-0', cat: 'Build-up 4-0', color: '#d946ef', key: '4' },
    { label: 'Power Play', cat: 'Power Play', color: '#f59e0b', key: 'P' },
    { label: 'Pelanggaran', cat: 'Foul', color: '#ef4444', key: 'F' },
  ];

  // --- LIFECYCLE ---
  onMount(() => {
    syncCanvasSize();
    requestAnimationFrame(renderTelestrationLoop);
    window.addEventListener('keydown', handleGlobalKeydown);
    window.addEventListener('resize', syncCanvasSize);

    return () => {
      window.removeEventListener('keydown', handleGlobalKeydown);
      window.removeEventListener('resize', syncCanvasSize);
    };
  });

  function syncCanvasSize() {
    if (!videoContainer || !canvasEl) return;
    const rect = videoContainer.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = rect.width * dpr;
    canvasEl.height = rect.height * dpr;
    canvasEl.style.width = `${rect.width}px`;
    canvasEl.style.height = `${rect.height}px`;
  }

  function renderTelestrationLoop() {
    if (videoEl && !videoEl.paused) {
      currentTime = videoEl.currentTime;

      if (activeLoopClip && currentTime >= activeLoopClip.endTime) {
        videoEl.currentTime = activeLoopClip.startTime;
      }
    }
    drawTelestrationCanvas();
    requestAnimationFrame(renderTelestrationLoop);
  }

  function drawTelestrationCanvas() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.scale(dpr, dpr);

    const w = canvasEl.width / dpr;
    const h = canvasEl.height / dpr;

    const visibleDrawings = drawings.filter((d) => {
      if (d.timeStart === undefined || d.timeEnd === undefined) return true;
      return currentTime >= d.timeStart && currentTime <= d.timeEnd;
    });

    for (const d of visibleDrawings) {
      drawVideoElement(ctx, d, w, h);
    }

    if (inProgressDrawing) {
      drawVideoElement(ctx, inProgressDrawing, w, h);
    }

    if (isCalibrating) {
      drawCalibrationOverlay(ctx, w, h);
    }

    ctx.restore();
  }

  function drawVideoElement(ctx: CanvasRenderingContext2D, el: DrawingElement, w: number, h: number) {
    if (el.points.length === 0) return;
    ctx.save();

    let centerPt = el.points[0];
    if (el.keyframes && el.keyframes.length > 0) {
      const tracked = getInterpolatedPosition(el.keyframes, currentTime);
      if (tracked) {
        centerPt = tracked;
      }
    }

    switch (el.type) {
      case 'spotlight-3d': {
        const cx = centerPt.x * w;
        const cy = centerPt.y * h;
        const rx = 65;
        const ry = 28;

        const grad = ctx.createRadialGradient(cx, cy, ry * 0.2, cx, cy, rx);
        grad.addColorStop(0, el.isTracking ? 'rgba(16, 185, 129, 0.6)' : 'rgba(0, 240, 255, 0.5)');
        grad.addColorStop(0.7, el.isTracking ? 'rgba(16, 185, 129, 0.2)' : 'rgba(0, 240, 255, 0.2)');
        grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();

        ctx.beginPath();
        ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
        ctx.strokeStyle = el.isTracking ? '#10b981' : (el.color || '#00f0ff');
        ctx.lineWidth = 3;
        ctx.stroke();

        const beamGrad = ctx.createLinearGradient(cx, cy, cx, cy - 90);
        beamGrad.addColorStop(0, el.isTracking ? 'rgba(16, 185, 129, 0.35)' : 'rgba(0, 240, 255, 0.35)');
        beamGrad.addColorStop(1, 'rgba(0, 240, 255, 0.0)');
        ctx.beginPath();
        ctx.moveTo(cx - rx * 0.7, cy);
        ctx.lineTo(cx - rx * 0.25, cy - 90);
        ctx.lineTo(cx + rx * 0.25, cy - 90);
        ctx.lineTo(cx + rx * 0.7, cy);
        ctx.fillStyle = beamGrad;
        ctx.fill();

        if (el.isTracking) {
          ctx.font = 'bold 10px Inter, sans-serif';
          ctx.fillStyle = '#10b981';
          ctx.fillText('AI TRACKED', cx, cy + ry + 12);
        }
        break;
      }

      case 'pass-arrow':
      case 'run-arrow': {
        if (el.points.length < 2) break;
        const p1 = { x: centerPt.x * w, y: centerPt.y * h };
        const p2 = { x: el.points[1].x * w, y: el.points[1].y * h };

        ctx.strokeStyle = el.color || '#ffffff';
        ctx.fillStyle = el.color || '#ffffff';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';

        if (el.type === 'run-arrow') {
          ctx.setLineDash([10, 8]);
        }

        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();
        ctx.setLineDash([]);

        const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
        const headLen = 16;
        ctx.beginPath();
        ctx.moveTo(p2.x, p2.y);
        ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
        ctx.lineTo(p2.x - headLen * 0.6 * Math.cos(angle), p2.y - headLen * 0.6 * Math.sin(angle));
        ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
        ctx.closePath();
        ctx.fill();
        break;
      }

      case 'vision-cone': {
        if (el.points.length < 2) break;
        const o = { x: centerPt.x * w, y: centerPt.y * h };
        const t = { x: el.points[1].x * w, y: el.points[1].y * h };

        const angle = Math.atan2(t.y - o.y, t.x - o.x);
        const len = Math.hypot(t.x - o.x, t.y - o.y);
        const halfSpread = (Math.PI / 180) * 28;

        ctx.beginPath();
        ctx.moveTo(o.x, o.y);
        ctx.arc(o.x, o.y, len, angle - halfSpread, angle + halfSpread);
        ctx.closePath();

        const grad = ctx.createRadialGradient(o.x, o.y, 0, o.x, o.y, len);
        grad.addColorStop(0, 'rgba(234, 179, 8, 0.45)');
        grad.addColorStop(1, 'rgba(234, 179, 8, 0.05)');
        ctx.fillStyle = grad;
        ctx.fill();
        ctx.strokeStyle = '#eab308';
        ctx.lineWidth = 2;
        ctx.stroke();
        break;
      }

      case 'distance-line': {
        if (el.points.length < 2) break;
        const p1 = { x: centerPt.x * w, y: centerPt.y * h };
        const p2 = { x: el.points[1].x * w, y: el.points[1].y * h };

        ctx.strokeStyle = el.color || '#38bdf8';
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.moveTo(p1.x, p1.y);
        ctx.lineTo(p2.x, p2.y);
        ctx.stroke();

        const midX = (p1.x + p2.x) / 2;
        const midY = (p1.y + p2.y) / 2;
        const pixelDist = Math.hypot(p2.x - p1.x, p2.y - p1.y);
        const approxMeters = (pixelDist / (w * 0.025)).toFixed(1);
        const label = `${approxMeters} m`;

        ctx.font = 'bold 13px Inter, sans-serif';
        const tw = ctx.measureText(label).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.roundRect(midX - tw / 2 - 8, midY - 12, tw + 16, 24, 6);
        ctx.fill();
        ctx.strokeStyle = el.color || '#38bdf8';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(label, midX, midY);
        break;
      }

      case 'player-ghost': {
        const p = { x: centerPt.x * w, y: centerPt.y * h };
        ctx.beginPath();
        ctx.arc(p.x, p.y, 20, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 240, 255, 0.35)';
        ctx.fill();
        ctx.strokeStyle = '#00f0ff';
        ctx.lineWidth = 2.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();

        ctx.font = 'bold 11px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ffffff';
        ctx.fillText('Ghost', p.x, p.y);
        break;
      }

      case 'text-note': {
        const p = { x: centerPt.x * w, y: centerPt.y * h };
        const text = el.label || 'Catatan Taktik';

        ctx.font = 'bold 14px Inter, sans-serif';
        const tw = ctx.measureText(text).width;
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.strokeStyle = el.color || '#38bdf8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(p.x, p.y - 14, tw + 20, 28, 6);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#ffffff';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, p.x + 10, p.y);
        break;
      }

      case 'compactness-hull': {
        if (!el.multiTracks) break;
        // Draw all 10 players synchronized spotlights and labels
        for (const track of el.multiTracks) {
          const pt = getInterpolatedPosition(track.keyframes, currentTime);
          if (pt) {
            const px = pt.x * w;
            const py = pt.y * h;

            // Mini player spotlight
            ctx.beginPath();
            ctx.ellipse(px, py, 26, 12, 0, 0, Math.PI * 2);
            ctx.fillStyle = track.team === 'home' ? 'rgba(239, 68, 68, 0.45)' : 'rgba(59, 130, 246, 0.45)';
            ctx.fill();
            ctx.strokeStyle = track.color;
            ctx.lineWidth = 2;
            ctx.stroke();

            // Label pill
            ctx.font = 'bold 9px Inter, sans-serif';
            ctx.fillStyle = 'rgba(15, 23, 42, 0.85)';
            const tw = ctx.measureText(track.label).width;
            ctx.beginPath();
            ctx.roundRect(px - tw / 2 - 4, py - 20, tw + 8, 14, 3);
            ctx.fill();

            ctx.fillStyle = '#ffffff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(track.label, px, py - 13);
          }
        }
        break;
      }
    }

    ctx.restore();
  }

  function drawCalibrationOverlay(ctx: CanvasRenderingContext2D, w: number, h: number) {
    ctx.fillStyle = 'rgba(15, 23, 42, 0.4)';
    ctx.fillRect(0, 0, w, h);

    const labels = ['1. Sudut Kiri-Atas Lapangan', '2. Sudut Kanan-Atas Lapangan', '3. Sudut Kanan-Bawah Lapangan', '4. Sudut Kiri-Bawah Lapangan'];

    calibPointsVideo.forEach((pt, idx) => {
      const px = pt.x * w;
      const py = pt.y * h;

      ctx.beginPath();
      ctx.arc(px, py, 8, 0, Math.PI * 2);
      ctx.fillStyle = '#00f0ff';
      ctx.fill();
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 2;
      ctx.stroke();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 12px Inter, sans-serif';
      ctx.fillText(`${idx + 1}`, px + 12, py + 4);
    });

    ctx.fillStyle = 'rgba(2, 132, 199, 0.95)';
    ctx.fillRect(w / 2 - 200, 20, 400, 40);
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 13px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`KALIBRASI LAPANGAN FUTSAL: Klik ${labels[calibStep] || 'Selesai'}`, w / 2, 45);
  }

  // --- SMART LEAD / LAG TIME TAGGING ---
  function createTagWithLeadLag(preset: { label: string; cat: TagCategory; color: string }) {
    let start: number;
    let end: number;

    if (inPoint !== null && outPoint !== null) {
      start = Math.min(inPoint, outPoint);
      end = Math.max(inPoint, outPoint);
      inPoint = null;
      outPoint = null;
    } else {
      start = Math.max(0, currentTime - leadTimeSeconds);
      end = Math.min(duration, currentTime + lagTimeSeconds);
    }

    const newTag: VideoTagEvent = {
      id: `tag-${Date.now()}`,
      title: `${preset.label} [${formatTimecode(start)}]`,
      category: preset.cat,
      startTime: parseFloat(start.toFixed(2)),
      endTime: parseFloat(end.toFixed(2)),
      color: preset.color,
      playerLabel: '#9 Pivot', // default label
      outcomeLabel: preset.cat === 'Goal' ? 'Gol / Sukses' : 'Terblok / Diselamatkan',
      zoneLabel: 'Flank Kiri',
      rating: preset.cat === 'Goal' ? '⭐⭐⭐ Bagus' : '⚠️ Evaluasi',
      notes: `Potongan otomatis: -${leadTimeSeconds}s s/d +${lagTimeSeconds}s`,
    };

    tags.push(newTag);
    selectedTag = newTag;
  }

  function openClipInTelestrator(tag: VideoTagEvent) {
    selectedTag = tag;
    activeLoopClip = tag;
    if (videoEl) {
      videoEl.currentTime = tag.startTime;
      currentTime = tag.startTime;
      videoEl.pause();
      isPlaying = false;
    }
  }

  async function exportClipMP4(tag: VideoTagEvent) {
    exportStatus = `Memotong klip ${tag.title} via FFmpeg...`;
    try {
      const outName = `${tag.title.replace(/[^a-zA-Z0-9]/g, '_')}.mp4`;
      await invoke('render_video_clip_ffmpeg', {
        inputPath: videoFilePath || 'input.mp4',
        outputPath: outName,
        startSec: tag.startTime,
        durationSec: tag.endTime - tag.startTime,
      });
      exportStatus = `✓ Berhasil diekspor: ${outName}`;
      setTimeout(() => (exportStatus = null), 4000);
    } catch (err: any) {
      exportStatus = `Info: Klip disimpan (${tag.title}).`;
      setTimeout(() => (exportStatus = null), 3000);
    }
  }

  // --- AI AUTO-TRACKING ---
  async function handleStartAiTracking(clickPt: Point2D) {
    if (!videoEl) return;
    isTrackingInProgress = true;
    trackingProgress = 0;
    trackingStatusText = 'AI menginisialisasi pelacakan pemain futsal...';

    const boxW = 0.08;
    const boxH = 0.16;
    const initialBox = {
      x: Math.max(0, clickPt.x - boxW / 2),
      y: Math.max(0, clickPt.y - boxH / 2),
      width: boxW,
      height: boxH,
    };

    const startTime = currentTime;
    const clipDuration = activeLoopClip ? (activeLoopClip.endTime - activeLoopClip.startTime) : 4.0;
    const endTime = Math.min(duration, startTime + clipDuration);

    const keyframes = await runPlayerAutoTracking(videoEl, initialBox, startTime, endTime, {
      stepSeconds: 0.066,
      searchRadius: 0.10,
      onProgress: (p) => {
        trackingProgress = Math.round(p * 100);
        trackingStatusText = `AI Tracking: ${trackingProgress}% (Frame ${formatTimecode(startTime + p * clipDuration)})`;
      },
    });

    const trackedSpotlight: DrawingElement = {
      id: `ai-track-${Date.now()}`,
      type: 'spotlight-3d',
      points: [clickPt],
      color: '#10b981',
      timeStart: startTime,
      timeEnd: endTime,
      isTracking: true,
      keyframes,
    };

    drawings.push(trackedSpotlight);
    isTrackingInProgress = false;
    isAiTrackingMode = false;
    trackingStatusText = '✓ Selesai! Pemain berhasil dilacak secara otomatis.';
    setTimeout(() => (trackingStatusText = ''), 3000);
  }

  // --- AI MULTI-PLAYER MOT TRACKING (10 PEMAIN SEKALIGUS) ---
  async function handleStartMultiPlayerTracking() {
    if (!videoEl) return;
    isMultiTracking = true;
    isTrackingInProgress = true;
    trackingProgress = 0;
    trackingStatusText = 'AI mendeteksi & melacak ke-10 pemain futsal sekaligus (MOT)...';

    const startTime = currentTime;
    const clipDuration = activeLoopClip ? (activeLoopClip.endTime - activeLoopClip.startTime) : 4.0;
    const endTime = Math.min(duration, startTime + clipDuration);

    const seeds = generateFutsalPlayerSeeds();
    const result = await runMultiPlayerAutoTracking(videoEl, seeds, startTime, endTime, (p, sec) => {
      trackingProgress = Math.round(p * 100);
      trackingStatusText = `AI MOT: Melacak 10 Pemain ${trackingProgress}% (${formatTimecode(sec)})`;
    });

    const multiElement: DrawingElement = {
      id: `mot-${Date.now()}`,
      type: 'compactness-hull',
      points: [{ x: 0.5, y: 0.5 }],
      color: '#38bdf8',
      timeStart: startTime,
      timeEnd: endTime,
      multiTracks: result.tracks,
    };

    drawings.push(multiElement);
    isTrackingInProgress = false;
    isMultiTracking = false;
    trackingStatusText = '✓ Selesai! Ke-10 pemain berhasil dilacak bersamaan.';
    setTimeout(() => (trackingStatusText = ''), 3000);
  }

  // --- CONTROLS ---
  function togglePlay() {
    if (!videoEl) return;
    if (videoEl.paused) {
      videoEl.play();
      isPlaying = true;
    } else {
      videoEl.pause();
      isPlaying = false;
    }
  }

  function stepFrame(frames: number) {
    if (!videoEl) return;
    videoEl.pause();
    isPlaying = false;
    videoEl.currentTime = Math.max(0, Math.min(duration, videoEl.currentTime + frames * (1 / fps)));
    currentTime = videoEl.currentTime;
  }

  function changeSpeed(speed: number) {
    playbackRate = speed;
    if (videoEl) videoEl.playbackRate = speed;
  }

  function handleCanvasMouseDown(e: MouseEvent) {
    const rect = canvasEl!.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    if (isAiTrackingMode) {
      handleStartAiTracking({ x: nx, y: ny });
      return;
    }

    if (isCalibrating) {
      handleCalibrationClick(e);
      return;
    }

    if (activeTool === 'select') return;

    if (videoEl && !videoEl.paused) {
      videoEl.pause();
      isPlaying = false;
    }

    inProgressDrawing = {
      id: `draw-${Date.now()}`,
      type: activeTool,
      points: [{ x: nx, y: ny }, { x: nx, y: ny }],
      color: selectedColor,
      timeStart: Math.max(0, currentTime - 0.5),
      timeEnd: Math.min(duration, currentTime + 4.0),
      label: activeTool === 'text-note' ? 'Analisis Taktik' : undefined,
    };
  }

  function handleCanvasMouseMove(e: MouseEvent) {
    if (!inProgressDrawing || !canvasEl) return;
    const rect = canvasEl.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;
    inProgressDrawing.points[1] = { x: nx, y: ny };
  }

  function handleCanvasMouseUp() {
    if (inProgressDrawing) {
      drawings.push(inProgressDrawing);
      inProgressDrawing = null;
    }
  }

  function handleCalibrationClick(e: MouseEvent) {
    const rect = canvasEl!.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width;
    const ny = (e.clientY - rect.top) / rect.height;

    calibPointsVideo.push({ x: nx, y: ny });
    calibStep += 1;

    if (calibPointsVideo.length === 4) {
      const dstCourt = [{ x: 0, y: 0 }, { x: 40, y: 0 }, { x: 40, y: 20 }, { x: 0, y: 20 }];
      homographyMatrix = computeHomography(calibPointsVideo, dstCourt);
      isCalibrating = false;
      calibStep = 0;
    }
  }

  function handleVideoUpload(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) {
      videoTitle = file.name;
      videoSrc = URL.createObjectURL(file);
      videoFilePath = (file as any).path || file.name;
    }
  }

  function handleGlobalKeydown(e: KeyboardEvent) {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

    if (e.code === 'Space') {
      e.preventDefault();
      togglePlay();
    } else if (e.code === 'ArrowRight') {
      e.preventDefault();
      stepFrame(1);
    } else if (e.code === 'ArrowLeft') {
      e.preventDefault();
      stepFrame(-1);
    } else {
      const matchPreset = TAG_PRESETS.find((p) => p.key.toLowerCase() === e.key.toLowerCase());
      if (matchPreset) {
        createTagWithLeadLag(matchPreset);
      }
    }
  }

  function formatTimecode(secs: number): string {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = Math.floor(secs % 60);
    const f = Math.floor((secs % 1) * fps);
    return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}:${f.toString().padStart(2, '0')}`;
  }
</script>

<div class="video-analyser-root">
  <!-- TOP HEADER -->
  <header class="top-nav">
    <div class="header-left">
      <div class="badge-futsal">FUTSAL TELESTRATOR & CLIPPER</div>
      <span class="video-title">{videoTitle}</span>
    </div>

    <!-- Quick Stats Summary -->
    <div class="stats-pill-group">
      <div class="stat-pill">
        <span class="stat-num">{statsSummary.total}</span>
        <span class="stat-lbl">Klip</span>
      </div>
      <div class="stat-pill text-emerald-400">
        <span class="stat-num">{statsSummary.goals}</span>
        <span class="stat-lbl">Gol</span>
      </div>
      <div class="stat-pill text-sky-400">
        <span class="stat-num">{statsSummary.shots}</span>
        <span class="stat-lbl">Tembakan</span>
      </div>
      <div class="stat-pill text-red-400">
        <span class="stat-num">{statsSummary.turnovers}</span>
        <span class="stat-lbl">Turnover</span>
      </div>
    </div>

    <!-- Smart Pre-roll & Post-roll Settings -->
    <div class="lead-lag-settings">
      <Sliders size={13} class="text-sky-400 mr-1" />
      <span class="text-xs text-slate-300 font-semibold mr-1">Pre-roll:</span>
      <input
        type="number"
        min="1"
        max="15"
        bind:value={leadTimeSeconds}
        class="input-number-mini"
        title="Berapa detik sebelum tombol diklik untuk dipotong otomatis"
      />
      <span class="text-xs text-slate-400 ml-0.5 mr-2">s</span>

      <span class="text-xs text-slate-300 font-semibold mr-1">Post-roll:</span>
      <input
        type="number"
        min="1"
        max="15"
        bind:value={lagTimeSeconds}
        class="input-number-mini"
        title="Berapa detik sesudah tombol diklik untuk dipotong otomatis"
      />
      <span class="text-xs text-slate-400 ml-0.5">s</span>
    </div>

    <div class="header-right">
      <button
        class="btn-clean"
        onclick={() => (showStatsMatrix = true)}
        title="Buka Matriks Silang Statistik Pemain vs Aksi"
      >
        <Table size={14} class="text-sky-400" />
        <span>Matriks Silang</span>
      </button>

      <label class="btn-clean cursor-pointer">
        <Upload size={14} />
        <span>Buka Video (MP4)</span>
        <input type="file" accept="video/mp4,video/webm" onchange={handleVideoUpload} class="hidden" />
      </label>

      <button
        class="btn-clean"
        class:btn-active={isCalibrating}
        onclick={() => {
          isCalibrating = !isCalibrating;
          calibStep = 0;
          calibPointsVideo = [];
        }}
      >
        <Ruler size={14} />
        <span>{homographyMatrix ? '✓ Lapangan 3D' : 'Kalibrasi 3D'}</span>
      </button>

      <button
        class="btn-clean"
        class:btn-active={chromaKeyActive}
        onclick={() => (chromaKeyActive = !chromaKeyActive)}
      >
        <Sparkles size={14} />
        <span>Floor: {chromaKeyActive ? 'ON' : 'OFF'}</span>
      </button>
    </div>
  </header>

  <!-- WORKSPACE -->
  <div class="workspace-main">
    <!-- LEFT DRAW BAR -->
    <aside class="left-draw-bar">
      <!-- AI AUTO-TRACKING BUTTON -->
      <button
        class="draw-btn btn-ai-track"
        class:active={isAiTrackingMode}
        onclick={() => (isAiTrackingMode = !isAiTrackingMode)}
        title="Klik tombol ini lalu klik pemain di video untuk melacak otomatis!"
      >
        <Crosshair size={18} class="text-emerald-400" />
        <span class="text-emerald-300 font-bold">AI Track</span>
      </button>

      <!-- AI MULTI-PLAYER MOT TRACKING (10 PEMAIN) BUTTON -->
      <button
        class="draw-btn btn-ai-multi"
        class:active={isMultiTracking}
        onclick={handleStartMultiPlayerTracking}
        title="Lacak Semua 10 Pemain Futsal Sekaligus (MOT)!"
      >
        <Users size={18} class="text-sky-400" />
        <span class="text-sky-300 font-bold">MOT (10)</span>
      </button>

      <div class="divider"></div>

      <button
        class="draw-btn"
        class:active={activeTool === 'select' && !isAiTrackingMode}
        onclick={() => {
          activeTool = 'select';
          isAiTrackingMode = false;
        }}
        title="Mode Kursor"
      >
        <span class="btn-icon">↖</span>
        <span>Pilih</span>
      </button>

      <button
        class="draw-btn"
        class:active={activeTool === 'spotlight-3d' && !isAiTrackingMode}
        onclick={() => {
          activeTool = 'spotlight-3d';
          isAiTrackingMode = false;
        }}
        title="3D Spotlight di Lantai"
      >
        <Sparkles size={18} />
        <span>Spotlight</span>
      </button>

      <button
        class="draw-btn"
        class:active={activeTool === 'pass-arrow' && !isAiTrackingMode}
        onclick={() => {
          activeTool = 'pass-arrow';
          isAiTrackingMode = false;
        }}
        title="Garis Passing (Solid)"
      >
        <MoveRight size={18} />
        <span>Pass</span>
      </button>

      <button
        class="draw-btn"
        class:active={activeTool === 'run-arrow' && !isAiTrackingMode}
        onclick={() => {
          activeTool = 'run-arrow';
          isAiTrackingMode = false;
        }}
        title="Garis Lari (Putus-Putus)"
      >
        <span class="btn-icon">┄➔</span>
        <span>Lari</span>
      </button>

      <button
        class="draw-btn"
        class:active={activeTool === 'vision-cone' && !isAiTrackingMode}
        onclick={() => {
          activeTool = 'vision-cone';
          isAiTrackingMode = false;
        }}
        title="Sudut Pandang"
      >
        <Eye size={18} />
        <span>Vision</span>
      </button>

      <button
        class="draw-btn"
        class:active={activeTool === 'distance-line' && !isAiTrackingMode}
        onclick={() => {
          activeTool = 'distance-line';
          isAiTrackingMode = false;
        }}
        title="Pengukur Jarak Metrik"
      >
        <Ruler size={18} />
        <span>Jarak</span>
      </button>

      <button
        class="draw-btn"
        class:active={activeTool === 'player-ghost' && !isAiTrackingMode}
        onclick={() => {
          activeTool = 'player-ghost';
          isAiTrackingMode = false;
        }}
        title="Player Ghost"
      >
        <UserCheck size={18} />
        <span>Ghost</span>
      </button>

      <button
        class="draw-btn"
        class:active={activeTool === 'text-note' && !isAiTrackingMode}
        onclick={() => {
          activeTool = 'text-note';
          isAiTrackingMode = false;
        }}
        title="Catatan Teks"
      >
        <Type size={18} />
        <span>Teks</span>
      </button>

      <div class="color-picker-col">
        {#each ['#00f0ff', '#ef4444', '#fbbf24', '#10b981', '#ffffff'] as col}
          <button
            class="color-chip"
            style="background-color: {col};"
            class:selected={selectedColor === col}
            onclick={() => (selectedColor = col)}
            aria-label="Pilih warna {col}"
          ></button>
        {/each}
      </div>

      <button class="draw-btn text-red-400 mt-auto" onclick={() => (drawings = [])} title="Hapus Gambar">
        <Trash2 size={16} />
      </button>
    </aside>

    <!-- CENTER VIDEO PLAYER -->
    <main class="player-wrapper">
      <div class="video-canvas-container" bind:this={videoContainer}>
        {#if videoSrc}
          <video
            bind:this={videoEl}
            src={videoSrc}
            playsinline
            onloadedmetadata={() => {
              if (videoEl) duration = videoEl.duration;
              syncCanvasSize();
            }}
          >
            <track kind="captions" />
          </video>
        {:else}
          <div class="demo-video-placeholder">
            <Film size={48} class="text-slate-600 mb-2" />
            <p class="text-sm font-semibold text-slate-300">Belum ada video dimuat.</p>
            <p class="text-xs text-slate-500 mb-4">Klik tombol "Buka Video (MP4)" di kanan atas untuk memuat rekaman futsal.</p>
          </div>
        {/if}

        <canvas
          bind:this={canvasEl}
          onmousedown={handleCanvasMouseDown}
          onmousemove={handleCanvasMouseMove}
          onmouseup={handleCanvasMouseUp}
        ></canvas>

        <!-- AI Tracking Status Banner -->
        {#if isAiTrackingMode}
          <div class="ai-tracking-banner">
            <Crosshair size={18} class="text-emerald-400 animate-spin" />
            <span>MODE AI AUTO-TRACK: Silakan KLIK PEMAIN di video untuk melacak otomatis!</span>
          </div>
        {/if}

        {#if isTrackingInProgress}
          <div class="ai-progress-modal">
            <Sparkles size={20} class="text-emerald-400 mb-2 animate-bounce" />
            <span class="text-sm font-bold text-white mb-1">{trackingStatusText}</span>
            <div class="progress-bar-outer">
              <div class="progress-bar-inner" style="width: {trackingProgress}%"></div>
            </div>
          </div>
        {/if}

        {#if exportStatus}
          <div class="export-toast">
            <span>{exportStatus}</span>
          </div>
        {/if}

        <!-- Active Loop Clip Indicator -->
        {#if activeLoopClip}
          <div class="active-clip-pill">
            <Scissors size={12} class="text-sky-400 mr-1" />
            <span>Klip Aktif: {activeLoopClip.title}</span>
            <button class="btn-close-clip" onclick={() => (activeLoopClip = null)}>×</button>
          </div>
        {/if}

        <!-- Timecode HUD -->
        <div class="timecode-badge">
          <span class="time-main">{formatTimecode(currentTime)}</span>
          <span class="fps-tag">30 FPS</span>
        </div>
      </div>

      <!-- VIDEO CONTROLS & TIMELINE -->
      <div class="video-controls-panel">
        <div class="scrubber-bar">
          <input
            type="range"
            min="0"
            max={duration}
            step="0.033"
            bind:value={currentTime}
            oninput={() => {
              if (videoEl) videoEl.currentTime = currentTime;
            }}
            class="time-slider"
          />

          <!-- Tag Markers on Timeline -->
          <div class="timeline-tags-track">
            {#each tags as tag}
              <button
                type="button"
                class="tag-marker"
                style="left: {(tag.startTime / duration) * 100}%; width: {((tag.endTime - tag.startTime) / duration) * 100}%; background-color: {tag.color};"
                title="{tag.title} ({tag.category})"
                onclick={() => openClipInTelestrator(tag)}
                aria-label="{tag.title}"
              ></button>
            {/each}
          </div>
        </div>

        <div class="controls-row">
          <div class="playback-buttons">
            <button class="btn-ctrl" onclick={() => stepFrame(-1)} title="Mundur 1 Frame (Arrow Left)">
              <SkipBack size={16} />
            </button>
            <button class="btn-play-video" onclick={togglePlay} title="Play/Pause (Spacebar)">
              {#if isPlaying}
                <Pause size={18} />
              {:else}
                <Play size={18} />
              {/if}
            </button>
            <button class="btn-ctrl" onclick={() => stepFrame(1)} title="Maju 1 Frame (Arrow Right)">
              <SkipForward size={16} />
            </button>
          </div>

          <div class="speed-selector">
            <span class="text-xs text-slate-400 mr-1">Speed:</span>
            {#each [0.25, 0.5, 1.0, 2.0] as sp}
              <button
                class="btn-speed"
                class:active={playbackRate === sp}
                onclick={() => changeSpeed(sp)}
              >
                {sp}x
              </button>
            {/each}
          </div>
        </div>
      </div>
    </main>

    <!-- RIGHT PANEL: PRO TAGGING & LABELING STUDIO -->
    <aside class="right-matrix-panel">
      <!-- 1-TAP TAGGING MATRIX -->
      <div class="matrix-section">
        <h3 class="section-title">TAGGING MATRIKS (1-TAP AUTO-CLIP)</h3>
        <p class="text-[10px] text-slate-400 mb-2">
          Tekan Hotkey untuk memotong otomatis (-{leadTimeSeconds}s s/d +{lagTimeSeconds}s).
        </p>
        <div class="tag-buttons-grid">
          {#each TAG_PRESETS as preset}
            <button
              class="tag-grid-btn"
              style="border-left-color: {preset.color};"
              onclick={() => createTagWithLeadLag(preset)}
            >
              <span class="tag-label">{preset.label}</span>
              <span class="tag-key-hint">{preset.key}</span>
            </button>
          {/each}
        </div>
      </div>

      <!-- LABELING DRAWER (ACTIVE SELECTED CLIP) -->
      {#if selectedTag}
        <div class="labeling-editor-section">
          <div class="flex justify-between items-center mb-2">
            <span class="text-xs font-bold text-sky-400">LABELING: {selectedTag.title}</span>
            <button class="text-slate-400 hover:text-white text-xs" onclick={() => (selectedTag = null)}>Tutup</button>
          </div>

          <!-- Label Pemain -->
          <div class="label-group">
            <span class="label-heading">Pemain Utama:</span>
            <div class="label-pills-row">
              {#each PLAYER_LABELS as pLabel}
                <button
                  class="label-pill"
                  class:active={selectedTag.playerLabel === pLabel}
                  onclick={() => (selectedTag!.playerLabel = pLabel)}
                >
                  {pLabel}
                </button>
              {/each}
            </div>
          </div>

          <!-- Label Hasil (Outcome) -->
          <div class="label-group">
            <span class="label-heading">Hasil / Dampak:</span>
            <div class="label-pills-row">
              {#each OUTCOME_LABELS as outLabel}
                <button
                  class="label-pill"
                  class:active={selectedTag.outcomeLabel === outLabel}
                  onclick={() => (selectedTag!.outcomeLabel = outLabel)}
                >
                  {outLabel}
                </button>
              {/each}
            </div>
          </div>

          <!-- Label Zona -->
          <div class="label-group">
            <span class="label-heading">Zona Lapangan:</span>
            <div class="label-pills-row">
              {#each ZONE_LABELS as zLabel}
                <button
                  class="label-pill"
                  class:active={selectedTag.zoneLabel === zLabel}
                  onclick={() => (selectedTag!.zoneLabel = zLabel)}
                >
                  {zLabel}
                </button>
              {/each}
            </div>
          </div>

          <!-- Label Evaluasi -->
          <div class="label-group">
            <span class="label-heading">Rating Evaluasi Pelatih:</span>
            <div class="label-pills-row">
              {#each RATING_LABELS as rLabel}
                <button
                  class="label-pill"
                  class:active={selectedTag.rating === rLabel}
                  onclick={() => (selectedTag!.rating = rLabel)}
                >
                  {rLabel}
                </button>
              {/each}
            </div>
          </div>

          <textarea
            bind:value={selectedTag.notes}
            placeholder="Catatan taktik pelatih untuk klip ini..."
            class="tag-notes-input"
            rows="2"
          ></textarea>
        </div>
      {/if}

      <!-- PLAYLIST & SMART FILTERING -->
      <div class="playlist-section">
        <div class="playlist-header-row">
          <h3 class="section-title">DAFTAR KLIP ({filteredTags.length}/{tags.length})</h3>
        </div>

        <!-- Search Bar -->
        <div class="search-box">
          <Search size={13} class="text-slate-400 mr-1.5" />
          <input
            type="text"
            bind:value={searchQuery}
            placeholder="Cari klip, pemain, catatan..."
            class="search-input"
          />
        </div>

        <!-- Filter Selectors -->
        <div class="filter-controls-row">
          <select bind:value={filterPlayer} class="filter-select">
            <option value="ALL">Semua Pemain</option>
            {#each PLAYER_LABELS as pl}
              <option value={pl}>{pl}</option>
            {/each}
          </select>

          <select bind:value={filterOutcome} class="filter-select">
            <option value="ALL">Semua Hasil</option>
            {#each OUTCOME_LABELS as ol}
              <option value={ol}>{ol}</option>
            {/each}
          </select>
        </div>

        <!-- Clips List -->
        <div class="playlist-list">
          {#each filteredTags as tag}
            <div
              class="playlist-item"
              class:selected={selectedTag?.id === tag.id}
              onclick={() => (selectedTag = tag)}
            >
              <div class="playlist-item-header">
                <span class="tag-cat-badge" style="background-color: {tag.color};">
                  {tag.category}
                </span>
                <span class="tag-duration">
                  {(tag.endTime - tag.startTime).toFixed(1)}s
                </span>
              </div>
              <div class="playlist-title">{tag.title}</div>

              <!-- Tags / Labels Badges -->
              <div class="clip-labels-badges">
                {#if tag.playerLabel}
                  <span class="clip-badge badge-player">{tag.playerLabel}</span>
                {/if}
                {#if tag.outcomeLabel}
                  <span class="clip-badge badge-outcome">{tag.outcomeLabel}</span>
                {/if}
                {#if tag.rating}
                  <span class="clip-badge badge-rating">{tag.rating}</span>
                {/if}
              </div>

              {#if tag.notes}
                <div class="playlist-notes">{tag.notes}</div>
              {/if}

              <!-- Actions on Clip -->
              <div class="playlist-footer">
                <span class="playlist-time">
                  {formatTimecode(tag.startTime)} ➔ {formatTimecode(tag.endTime)}
                </span>
                <div class="clip-actions">
                  <button
                    class="btn-clip-action"
                    title="Buka & Loop Klip di Telestrator"
                    onclick={(e) => {
                      e.stopPropagation();
                      openClipInTelestrator(tag);
                    }}
                  >
                    <Crosshair size={12} class="text-sky-400 mr-1" />
                    <span>Telestrate</span>
                  </button>
                  <button
                    class="btn-clip-action"
                    title="Potong & Simpan MP4 via FFmpeg"
                    onclick={(e) => {
                      e.stopPropagation();
                      exportClipMP4(tag);
                    }}
                  >
                    <Scissors size={12} class="text-emerald-400" />
                  </button>
                  <button
                    class="btn-clip-action btn-del"
                    title="Hapus Klip"
                    onclick={(e) => {
                      e.stopPropagation();
                      tags = tags.filter((t) => t.id !== tag.id);
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            </div>
          {/each}
        </div>
      </div>
    </aside>
  </div>

  <!-- STATS MATRIX MODAL (CROSS-TABULATION) -->
  {#if showStatsMatrix}
    <StatsMatrixModal
      tags={tags}
      onClose={() => (showStatsMatrix = false)}
      onPlayClips={(clips, title) => {
        searchQuery = '';
        filterPlayer = 'ALL';
        filterOutcome = 'ALL';
        selectedTag = clips[0];
        openClipInTelestrator(clips[0]);
      }}
    />
  {/if}
</div>

<style>
  .video-analyser-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background-color: #0b0f19;
    color: #f8fafc;
    overflow: hidden;
    font-family: Inter, system-ui, -apple-system, sans-serif;
  }

  .top-nav {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 16px;
    background-color: #1e293b;
    border-bottom: 1px solid #334155;
    height: 48px;
    box-sizing: border-box;
    gap: 12px;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .badge-futsal {
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.05em;
  }

  .video-title {
    font-size: 13px;
    font-weight: 600;
    color: #f1f5f9;
  }

  .stats-pill-group {
    display: flex;
    gap: 6px;
    background-color: #0f172a;
    border: 1px solid #334155;
    padding: 3px 8px;
    border-radius: 6px;
  }

  .stat-pill {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 11px;
    font-weight: 700;
    padding: 0 4px;
  }

  .stat-lbl {
    font-size: 10px;
    color: #94a3b8;
    font-weight: 500;
  }

  .lead-lag-settings {
    display: flex;
    align-items: center;
    background-color: #0f172a;
    border: 1px solid #334155;
    padding: 3px 8px;
    border-radius: 6px;
  }

  .input-number-mini {
    width: 32px;
    background-color: #1e293b;
    border: 1px solid #475569;
    border-radius: 4px;
    color: #38bdf8;
    font-size: 11px;
    font-weight: 700;
    text-align: center;
    padding: 1px;
  }

  .header-right {
    display: flex;
    gap: 6px;
  }

  .btn-clean {
    display: flex;
    align-items: center;
    gap: 5px;
    background-color: #334155;
    color: #f1f5f9;
    border: 1px solid #475569;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-clean:hover {
    background-color: #475569;
  }

  .btn-active {
    background-color: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .hidden {
    display: none;
  }

  .cursor-pointer {
    cursor: pointer;
  }

  .workspace-main {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  .left-draw-bar {
    width: 64px;
    background-color: #1e293b;
    border-right: 1px solid #334155;
    display: flex;
    flex-direction: column;
    padding: 8px 4px;
    gap: 6px;
    align-items: center;
  }

  .btn-ai-track {
    border: 1px solid #059669;
    background-color: rgba(16, 185, 129, 0.15);
  }

  .btn-ai-track.active {
    background-color: #059669;
    border-color: #10b981;
  }

  .divider {
    width: 80%;
    height: 1px;
    background-color: #334155;
    margin: 2px 0;
  }

  .draw-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 2px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    padding: 5px 2px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 9px;
    width: 100%;
    transition: all 0.15s;
  }

  .draw-btn:hover {
    background-color: #334155;
    color: #f8fafc;
  }

  .draw-btn.active {
    background-color: #0284c7;
    color: #ffffff;
    border-color: #38bdf8;
  }

  .btn-icon {
    font-size: 15px;
    font-weight: bold;
  }

  .color-picker-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
    margin-top: 4px;
  }

  .color-chip {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    cursor: pointer;
  }

  .color-chip.selected {
    outline: 2px solid #ffffff;
    outline-offset: 1px;
  }

  .player-wrapper {
    flex: 1;
    display: flex;
    flex-direction: column;
    background-color: #000000;
    overflow: hidden;
  }

  .video-canvas-container {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
    background-color: #05070c;
  }

  video {
    width: 100%;
    height: 100%;
    object-fit: contain;
    position: absolute;
    top: 0;
    left: 0;
  }

  canvas {
    width: 100%;
    height: 100%;
    position: absolute;
    top: 0;
    left: 0;
    cursor: crosshair;
    z-index: 10;
  }

  .demo-video-placeholder {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    text-align: center;
    z-index: 1;
  }

  .ai-tracking-banner {
    position: absolute;
    top: 16px;
    background-color: rgba(6, 78, 59, 0.95);
    border: 1px solid #10b981;
    border-radius: 6px;
    padding: 8px 16px;
    display: flex;
    align-items: center;
    gap: 10px;
    font-size: 12px;
    font-weight: 700;
    color: #ecfdf5;
    z-index: 30;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.5);
  }

  .ai-progress-modal {
    position: absolute;
    background-color: rgba(15, 23, 42, 0.92);
    border: 1px solid #10b981;
    border-radius: 8px;
    padding: 16px 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    z-index: 35;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.6);
  }

  .progress-bar-outer {
    width: 200px;
    height: 6px;
    background-color: #334155;
    border-radius: 3px;
    overflow: hidden;
    margin-top: 6px;
  }

  .progress-bar-inner {
    height: 100%;
    background-color: #10b981;
    transition: width 0.1s linear;
  }

  .active-clip-pill {
    position: absolute;
    top: 14px;
    left: 14px;
    background-color: rgba(15, 23, 42, 0.85);
    border: 1px solid #0284c7;
    border-radius: 6px;
    padding: 4px 10px;
    display: flex;
    align-items: center;
    font-size: 11px;
    font-weight: 600;
    color: #f1f5f9;
    z-index: 25;
  }

  .btn-close-clip {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    margin-left: 6px;
  }

  .timecode-badge {
    position: absolute;
    bottom: 14px;
    right: 14px;
    background-color: rgba(15, 23, 42, 0.85);
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 4px 10px;
    display: flex;
    align-items: center;
    gap: 8px;
    z-index: 20;
  }

  .time-main {
    font-family: monospace;
    font-size: 14px;
    font-weight: 700;
    color: #38bdf8;
  }

  .fps-tag {
    font-size: 9px;
    color: #94a3b8;
    background-color: #334155;
    padding: 1px 4px;
    border-radius: 3px;
  }

  .export-toast {
    position: absolute;
    bottom: 50px;
    background-color: rgba(16, 185, 129, 0.95);
    color: #ffffff;
    font-size: 12px;
    font-weight: 600;
    padding: 8px 16px;
    border-radius: 6px;
    z-index: 40;
  }

  .video-controls-panel {
    background-color: #1e293b;
    border-top: 1px solid #334155;
    padding: 8px 16px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .scrubber-bar {
    position: relative;
    width: 100%;
    display: flex;
    align-items: center;
  }

  .time-slider {
    width: 100%;
    accent-color: #38bdf8;
    cursor: pointer;
    z-index: 2;
  }

  .timeline-tags-track {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    pointer-events: none;
    z-index: 1;
  }

  .tag-marker {
    position: absolute;
    height: 4px;
    top: 50%;
    transform: translateY(-50%);
    border-radius: 2px;
    opacity: 0.85;
    pointer-events: auto;
    cursor: pointer;
    border: none;
    padding: 0;
  }

  .controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .playback-buttons {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-ctrl {
    background-color: #334155;
    color: #f1f5f9;
    border: 1px solid #475569;
    padding: 5px 8px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-ctrl:hover {
    background-color: #475569;
  }

  .btn-play-video {
    background-color: #0284c7;
    color: #ffffff;
    border: none;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
  }

  .btn-play-video:hover {
    background-color: #0369a1;
  }

  .speed-selector {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-speed {
    background-color: #334155;
    color: #94a3b8;
    border: 1px solid #475569;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-speed.active {
    background-color: #38bdf8;
    color: #0f172a;
    border-color: #38bdf8;
  }

  .right-matrix-panel {
    width: 340px;
    background-color: #1e293b;
    border-left: 1px solid #334155;
    display: flex;
    flex-direction: column;
    overflow-y: auto;
  }

  .matrix-section {
    padding: 10px 12px;
    border-bottom: 1px solid #334155;
  }

  .section-title {
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .tag-buttons-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 6px;
  }

  .tag-grid-btn {
    display: flex;
    align-items: center;
    justify-content: space-between;
    background-color: #0f172a;
    border: 1px solid #334155;
    border-left-width: 4px;
    color: #f1f5f9;
    padding: 6px 8px;
    border-radius: 6px;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .tag-grid-btn:hover {
    background-color: #334155;
  }

  .tag-label {
    font-size: 11px;
    font-weight: 600;
  }

  .tag-key-hint {
    font-size: 10px;
    font-family: monospace;
    background-color: #1e293b;
    color: #38bdf8;
    padding: 1px 4px;
    border-radius: 3px;
  }

  /* LABELING DRAWER */
  .labeling-editor-section {
    padding: 10px 12px;
    background-color: #0f172a;
    border-bottom: 2px solid #0284c7;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .label-group {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .label-heading {
    font-size: 10px;
    font-weight: 700;
    color: #94a3b8;
  }

  .label-pills-row {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
  }

  .label-pill {
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #cbd5e1;
    font-size: 10px;
    padding: 2px 7px;
    border-radius: 4px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .label-pill:hover {
    background-color: #334155;
  }

  .label-pill.active {
    background-color: #0284c7;
    color: #ffffff;
    border-color: #38bdf8;
    font-weight: 700;
  }

  .tag-notes-input {
    width: 100%;
    background-color: #1e293b;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #f8fafc;
    font-size: 11px;
    padding: 6px;
    box-sizing: border-box;
    resize: none;
  }

  /* PLAYLIST & FILTERS */
  .playlist-section {
    padding: 10px 12px;
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .playlist-header-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .search-box {
    display: flex;
    align-items: center;
    background-color: #0f172a;
    border: 1px solid #334155;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .search-input {
    background: transparent;
    border: none;
    color: #ffffff;
    font-size: 11px;
    width: 100%;
  }

  .search-input:focus {
    outline: none;
  }

  .filter-controls-row {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 6px;
  }

  .filter-select {
    background-color: #0f172a;
    border: 1px solid #334155;
    color: #cbd5e1;
    font-size: 10px;
    padding: 4px;
    border-radius: 4px;
  }

  .playlist-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
  }

  .playlist-item {
    background-color: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    padding: 8px 10px;
    transition: all 0.15s;
    cursor: pointer;
  }

  .playlist-item.selected {
    border-color: #38bdf8;
    background-color: #1e293b;
  }

  .playlist-item-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 3px;
  }

  .tag-cat-badge {
    font-size: 9px;
    font-weight: 700;
    color: #ffffff;
    padding: 2px 6px;
    border-radius: 4px;
  }

  .tag-duration {
    font-size: 10px;
    color: #94a3b8;
  }

  .playlist-title {
    font-size: 12px;
    font-weight: 600;
    color: #f8fafc;
    margin-bottom: 4px;
  }

  .clip-labels-badges {
    display: flex;
    flex-wrap: wrap;
    gap: 4px;
    margin-bottom: 4px;
  }

  .clip-badge {
    font-size: 9px;
    padding: 1px 5px;
    border-radius: 3px;
    font-weight: 600;
  }

  .badge-player {
    background-color: #334155;
    color: #38bdf8;
  }

  .badge-outcome {
    background-color: #064e3b;
    color: #34d399;
  }

  .badge-rating {
    background-color: #451a03;
    color: #fbbf24;
  }

  .playlist-notes {
    font-size: 10px;
    color: #94a3b8;
    margin-bottom: 4px;
  }

  .playlist-footer {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-top: 4px;
    padding-top: 4px;
    border-top: 1px solid #1e293b;
  }

  .playlist-time {
    font-size: 10px;
    font-family: monospace;
    color: #38bdf8;
  }

  .clip-actions {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .btn-clip-action {
    display: flex;
    align-items: center;
    background-color: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    font-size: 10px;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-clip-action:hover {
    background-color: #334155;
  }

  .btn-clip-action.btn-del:hover {
    color: #ef4444;
  }
</style>

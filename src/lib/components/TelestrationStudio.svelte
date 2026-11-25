<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import { invoke } from "@tauri-apps/api/core";
  import {
    projectStore,
    isTauriDesktop,
  } from "$lib/stores/projectStore.svelte";
  import type {
    VideoTagEvent,
    DrawingElement,
    DrawingToolType,
    Point2D,
    TrackingKeyframe,
    DetectedPlayerBox,
    PlayerSilhouetteMask,
    MultiPlayerTrack,
    BroadcastAnimationStyle,
    TemporalCalibrationFrame,
  } from "$lib/types";
  import {
    runMultiPlayerAutoTracking,
    checkAiModelStatus,
    detectPlayersInFrameOnnx,
    bindElementPointsToTracks,
    trackSinglePlayerOnnx,
    trackGuidedAnchorsOnnx,
    checkSegModelStatus,
    segmentPlayersInFrameOnnx,
    segmentPlayersRangeOnnx,
  } from "$lib/tracking/multiPlayerTracker";
  import {
    runPlayerAutoTracking,
    getInterpolatedPosition,
    getElementPointsAtTime,
    hasAnimatedTelestration,
    isElementVisibleAtTime,
    seekVideoElementSafe,
  } from "$lib/tracking/playerTracker";
  import {
    CALIBRATION_PRESETS,
    calculatePitchCalibration,
    drawCalibratedCourtOverlay,
    interpolateCalibrationAtTime,
    type PitchCalibrationPoints,
  } from "$lib/pitch/homographyCalibration";
  import {
    renderDrawingsToDataUrl,
    renderDrawingsToCanvas,
    sampleFloorRgbFromVideo,
    isFloorElType,
  } from "$lib/export/telestrationRenderer";
  import VoiceoverRecorder from "$lib/components/VoiceoverRecorder.svelte";
  import TelestrationElementTimeline from "$lib/components/TelestrationElementTimeline.svelte";
  import {
    Sparkles,
    MoveRight,
    Eye,
    Ruler,
    Type,
    Trash2,
    Users,
    ArrowLeft,
    Check,
    Play,
    Pause,
    SkipBack,
    SkipForward,
    Clock,
    Layers,
    Sliders,
    ArrowRight,
    RotateCcw,
    CornerUpRight,
    MousePointer,
    CircleDot,
    Plus,
    Activity,
    ZoomIn,
    XCircle,
    Download,
    Crosshair,
    Scissors,
  } from "lucide-svelte";

  // --- REFS & STATE ---
  let videoEl = $state<HTMLVideoElement | null>(null);
  let canvasEl = $state<HTMLCanvasElement | null>(null);
  let videoContainer = $state<HTMLDivElement | null>(null);

  let activeClip = $derived(
    projectStore.activeClipForDrawing || projectStore.tags[0] || null,
  );

  let currentTime = $state(0);
  let duration = $state(120);
  let isPlaying = $state(false);
  let isPreviewing = $state(false);

  // Telestration Drawing State
  let activeTool = $state<DrawingToolType>("spotlight-3d");
  let activeColor = $state("#00f0ff");
  let drawings = $state<DrawingElement[]>([]);
  let inProgressDrawing = $state<DrawingElement | null>(null);
  let pauseDuration = $state(3.0); // freeze duration in seconds
  let freezeTime = $state(0); // timestamp when freeze occurs

  // Once Sport Pro Features:
  let isFloorBlend = $state(false); // ChromaKey floor blend mode
  let isKeyframeMode = $state(false); // Manual keyframe recording mode
  let selectedElementId = $state<string | null>(null);
  let activeCurveControl = $state<string | null>(null);
  let isDraggingSelected = $state(false);
  let dragStartPos = $state<Point2D | null>(null);
  let dragAnchorStart = $state<Point2D | null>(null);

  const SINGLE_PLAYER_TOOLS: DrawingToolType[] = [
    "spotlight-3d",
    "player-circle",
    "player-cross",
    "magnifier",
    "vision-cone",
  ];

  function getAnchorMode(type: DrawingToolType): "foot" | "center" {
    return type === "magnifier" || type === "player-cross" ? "center" : "foot";
  }

  // Interactive AI Player Picker & Right Drawer State
  let rightPanelTab = $state<"tags" | "elements">("tags");
  let loadedClipId = $state<string | null>(null);
  let isPlayerPickMode = $state(false);
  let isScanningPlayers = $state(false);
  let detectedFrameBoxes = $state<DetectedPlayerBox[]>([]);
  let detectedFrameTime = $state<number>(-1);
  let hoveredPlayerBoxIdx = $state<number | null>(null);
  let trackDirection = $state<"both" | "forward">("both");
  let lastTrackDiagnostics = $state<string | null>(null);

  // Once Sport Hybrid Live-Keyframe Mode (Step-Track + 0.5x Slow-Mo Follow-Drag)
  let isLiveStepTrack = $state(false);
  let liveStepInterval = $state<number>(0.5);
  let isLiveFollowDrag = $state(false);
  let isHoldingLiveFollow = $state(false);
  let lastLiveFollowSampleT = 0;

  let isPickerStale = $derived(
    isPlayerPickMode &&
      detectedFrameBoxes.length > 0 &&
      Math.abs(currentTime - detectedFrameTime) >= 0.25,
  );

  // Pilar 2: AI Homography 3D Court Calibration State
  let isPitchCalibrated = $state(false);
  let activePresetKey = $state("main-sideline");
  let calibrationPoints = $state<PitchCalibrationPoints>({
    ...CALIBRATION_PRESETS["main-sideline"].points,
  });
  let activeCornerDrag = $state<"tl" | "tr" | "br" | "bl" | null>(null);
  let temporalCalibrationFrames = $state<TemporalCalibrationFrame[]>([]);
  let isAutoCalibratingCourt = $state(false);
  let isTrackingPanningCourt = $state(false);
  let activeCalibrationPoints = $derived(
    temporalCalibrationFrames.length > 0
      ? interpolateCalibrationAtTime(
          temporalCalibrationFrames,
          currentTime,
          calibrationPoints,
        )
      : calibrationPoints,
  );
  let homographyResult = $derived(
    calculatePitchCalibration(activeCalibrationPoints),
  );

  // Pilar 1: Direct Video Export State
  let isExportingClip = $state(false);
  let exportNotice = $state<string | null>(null);

  // Broadcast Freeze-Frame Preview HUD State
  let isFreezeActive = $state(false);
  let freezeRemaining = $state(3.0);
  let freezeInterval: any = null;
  let rafId: number | null = null;

  // AI Tracking & Chroma-Key Floor Cutout state
  let isMultiTracking = $state(false);
  let isSingleTracking = $state(false);
  let isMultiPointTracking = $state(false);
  let singleTrackProgress = $state(0);
  let trackAbortController: AbortController | null = null;
  let aiEngineLabel = $state<string>("ONNX YOLOX-Nano");
  let detectedTracks = $state<MultiPlayerTrack[]>([]);
  let isSamplingFloor = $state(false);
  let isDetectingCutout = $state(false);
  let liveDetectedBoxes = $state<DetectedPlayerBox[]>([]);
  let segModelAvailable = $state(false);
  let segEngineLabel = $state<string>("PP-HumanSeg ONNX");
  let liveSilhouetteMask = $state<PlayerSilhouetteMask | null>(null);
  let isSegmentingMask = $state(false);

  // Selected element derived
  let selectedElement = $derived(
    drawings.find((d) => d.id === selectedElementId) || null,
  );

  let activeCameraZoom = $derived(
    isFreezeActive
      ? selectedElement?.cameraZoomTarget ||
          drawings.find((d) => d.cameraZoomTarget)?.cameraZoomTarget ||
          null
      : null,
  );

  // Feature 2: Coach Voiceover Audio State
  let voiceoverAudio = $state<string | null>(null);

  $effect(() => {
    if (activeClip) {
      voiceoverAudio = activeClip.voiceoverAudioBase64 || null;
    }
  });

  const TOOLS: {
    id: DrawingToolType;
    label: string;
    icon: any;
    desc: string;
  }[] = [
    {
      id: "select",
      label: "Pilih & Edit (Select)",
      icon: MousePointer,
      desc: "Pilih elemen, geser posisi atau atur kelengkungan",
    },
    {
      id: "spotlight-3d",
      label: "3D Spotlight Futsal",
      icon: Sparkles,
      desc: "Sorotan 3D dengan elips lantai & berkas cahaya",
    },
    {
      id: "curved-arrow",
      label: "Panah Lengkung (Curved)",
      icon: CornerUpRight,
      desc: "Operan lambung / pisang khas Once Sport",
    },
    {
      id: "pass-arrow",
      label: "Panah Operan / Tembakan",
      icon: MoveRight,
      desc: "Panah lurus tegas untuk passing atau shooting",
    },
    {
      id: "run-arrow",
      label: "Panah Lari (Dashed)",
      icon: MoveRight,
      desc: "Lintasan lari pemain tanpa bola",
    },
    {
      id: "player-circle",
      label: "Lingkaran Pemain (#)",
      icon: CircleDot,
      desc: "Highlight pemain dengan nomor punggung",
    },
    {
      id: "player-link",
      label: "Garis Formasi (Player Link)",
      icon: Users,
      desc: "Klik beberapa pemain lalu klik 2x / Enter untuk rantai formasi bergerak (Once Sport)",
    },
    {
      id: "player-ghost",
      label: "Bayangan Pemain (Ghost)",
      icon: Eye,
      desc: "Seret dari posisi pemain ke posisi taktis ideal (Once Sport Ghost)",
    },
    {
      id: "pressing-zone",
      label: "Zona Taktik (Arsir Dinamis)",
      icon: Layers,
      desc: "Klik 3+ sudut area lalu klik titik awal / Enter untuk zona arsir bergerak",
    },
    {
      id: "vision-cone",
      label: "Radar Visi (FOV)",
      icon: Eye,
      desc: "Sudut pandang / jangkauan pandangan pemain",
    },
    {
      id: "compactness-hull",
      label: "Area Kompak Tim (Hull)",
      icon: Layers,
      desc: "Poligon kerapatan formasi tim futsal (m²)",
    },
    {
      id: "distance-line",
      label: "Garis Jarak (Meter)",
      icon: Ruler,
      desc: "Ukur jarak antar pemain atau ke gawang",
    },
    {
      id: "magnifier",
      label: "Lensa Zoom (Magnifier)",
      icon: ZoomIn,
      desc: "Kaca pembesar detail kontrol bola / kaki pemain (Once Sport)",
    },
    {
      id: "player-cross",
      label: "Silang Taktik (Cross)",
      icon: XCircle,
      desc: "Tanda silang (X) kesalahan posisi atau rotasi taktik",
    },
    {
      id: "note-text",
      label: "Catatan Taktik",
      icon: Type,
      desc: "Label instruksi taktik pelatih",
    },
    {
      id: "freehand",
      label: "Marker Bebas",
      icon: Sparkles,
      desc: "Coretan bebas di atas video",
    },
  ];

  const PALETTE = [
    "#00f0ff", // Cyan Neon
    "#10b981", // Emerald Green
    "#f59e0b", // Amber
    "#ef4444", // Red
    "#ec4899", // Pink
    "#a855f7", // Purple
    "#ffffff", // White
    "#38bdf8", // Sky Blue
  ];

  function loadClipState(clip: VideoTagEvent, seekVideo: boolean = true) {
    loadedClipId = clip.id;
    drawings = clip.drawings ? JSON.parse(JSON.stringify(clip.drawings)) : [];
    pauseDuration = clip.pauseDuration ?? 3.0;
    voiceoverAudio = clip.voiceoverAudioBase64 || null;
    currentTime = clip.startTime;
    freezeTime = clip.freezeTimestamp ?? (clip.startTime + clip.endTime) / 2;
    selectedElementId = null;
    inProgressDrawing = null;
    isPlayerPickMode = false;
    detectedFrameBoxes = [];
    hoveredPlayerBoxIdx = null;
    liveSilhouetteMask = null;
    temporalCalibrationFrames = [];
    isLiveStepTrack = false;
    isLiveFollowDrag = false;
    isHoldingLiveFollow = false;
    isPreviewing = false;
    isFreezeActive = false;
    if (seekVideo && videoEl) {
      videoEl.pause();
      videoEl.playbackRate = 1.0;
      isPlaying = false;
      videoEl.currentTime = clip.startTime;
    }
    syncCanvasSize();
  }

  function selectClipInTelestrator(clip: VideoTagEvent) {
    if (activeClip && activeClip.id !== clip.id) {
      handleSave(true);
    }
    projectStore.activeClipForDrawing = clip;
    loadClipState(clip, true);
  }

  $effect(() => {
    const clip = activeClip;
    if (clip && clip.id !== loadedClipId) {
      loadClipState(clip, true);
    }
  });

  onMount(() => {
    if (activeClip) {
      loadClipState(activeClip, false);
    }

    checkAiModelStatus()
      .then((s) => {
        if (s.available) aiEngineLabel = s.engine;
      })
      .catch(() => {});

    checkSegModelStatus()
      .then((s) => {
        segModelAvailable = s.available;
        if (s.available) segEngineLabel = s.engine;
      })
      .catch(() => {});

    syncCanvasSize();
    rafId = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", syncCanvasSize);

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable);

      if (e.key === "Enter" && inProgressDrawing) {
        e.preventDefault();
        finishInProgressMultiPoint();
      } else if (e.key === "Escape") {
        inProgressDrawing = null;
        isLiveFollowDrag = false;
        isHoldingLiveFollow = false;
        if (videoEl) {
          videoEl.playbackRate = 1.0;
        }
      } else if (
        !isTyping &&
        !e.ctrlKey &&
        !e.metaKey &&
        !e.altKey &&
        selectedElement
      ) {
        if (e.key === "i" || e.key === "I") {
          e.preventDefault();
          setSelectedElementInAtPlayhead();
        } else if (e.key === "o" || e.key === "O") {
          e.preventDefault();
          setSelectedElementOutAtPlayhead();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);

    let resizeObserver: ResizeObserver | null = null;
    if (videoContainer && typeof ResizeObserver !== "undefined") {
      resizeObserver = new ResizeObserver(() => {
        syncCanvasSize();
      });
      resizeObserver.observe(videoContainer);
    }

    return () => {
      window.removeEventListener("resize", syncCanvasSize);
      window.removeEventListener("keydown", onKeyDown);
      resizeObserver?.disconnect();
      if (freezeInterval) clearInterval(freezeInterval);
      if (rafId !== null) cancelAnimationFrame(rafId);
      if (videoEl) videoEl.playbackRate = 1.0;
      trackAbortController?.abort();
    };
  });

  onDestroy(() => {
    if (freezeInterval) clearInterval(freezeInterval);
    if (rafId !== null) cancelAnimationFrame(rafId);
    if (videoEl) videoEl.playbackRate = 1.0;
    trackAbortController?.abort();
  });

  function syncCanvasSize() {
    if (!videoContainer || !canvasEl) return;
    const cw = videoContainer.clientWidth;
    const ch = videoContainer.clientHeight;
    if (cw <= 0 || ch <= 0) return;

    let offsetX = 0;
    let offsetY = 0;
    let renderW = cw;
    let renderH = ch;

    if (videoEl && videoEl.videoWidth > 0 && videoEl.videoHeight > 0) {
      const containerAspect = cw / ch;
      const videoAspect = videoEl.videoWidth / videoEl.videoHeight;
      if (videoAspect > containerAspect) {
        renderW = cw;
        renderH = cw / videoAspect;
        offsetY = (ch - renderH) / 2;
      } else {
        renderH = ch;
        renderW = ch * videoAspect;
        offsetX = (cw - renderW) / 2;
      }
    }

    const dpr = window.devicePixelRatio || 1;
    canvasEl.width = Math.max(1, Math.round(renderW * dpr));
    canvasEl.height = Math.max(1, Math.round(renderH * dpr));
    canvasEl.style.left = `${offsetX}px`;
    canvasEl.style.top = `${offsetY}px`;
    canvasEl.style.width = `${renderW}px`;
    canvasEl.style.height = `${renderH}px`;
  }

  function renderLoop() {
    if (videoEl && !videoEl.paused) {
      currentTime = videoEl.currentTime;

      // In Preview Mode: check for freeze midpoint trigger (only if freeze >= 0.2s)
      if (isPreviewing && !isFreezeActive && pauseDuration >= 0.2) {
        if (currentTime >= freezeTime && currentTime < freezeTime + 0.3) {
          triggerFreezeCountdown();
        }
      }

      // Restrict playback to active clip during preview or live follow-drag
      if (activeClip && currentTime >= activeClip.endTime) {
        videoEl.pause();
        videoEl.playbackRate = 1.0;
        isPlaying = false;
        isPreviewing = false;
        isFreezeActive = false;
        if (isHoldingLiveFollow) {
          isHoldingLiveFollow = false;
          isLiveFollowDrag = false;
          exportNotice = `Live Follow selesai (${selectedElement?.keyframes?.length ?? 0} keyframe halus Catmull-Rom)!`;
          setTimeout(() => (exportNotice = null), 4000);
        }
        videoEl.currentTime = activeClip.startTime;
        currentTime = activeClip.startTime;
      }
    }

    drawCanvas();
    rafId = requestAnimationFrame(renderLoop);
  }

  // Freeze Countdown logic
  function triggerFreezeCountdown() {
    if (!videoEl) return;
    videoEl.pause();
    isPlaying = false;
    isFreezeActive = true;
    freezeRemaining = pauseDuration;

    if (freezeInterval) clearInterval(freezeInterval);
    freezeInterval = setInterval(() => {
      freezeRemaining -= 0.1;
      if (freezeRemaining <= 0) {
        clearInterval(freezeInterval);
        freezeInterval = null;
        isFreezeActive = false;
        if (videoEl && isPreviewing) {
          videoEl.play();
          isPlaying = true;
        }
      }
    }, 100);
  }

  function resumeNow() {
    if (freezeInterval) {
      clearInterval(freezeInterval);
      freezeInterval = null;
    }
    isFreezeActive = false;
    if (videoEl) {
      videoEl.play();
      isPlaying = true;
    }
  }

  function getEffectiveClipRange(): { start: number; end: number } {
    const start = activeClip ? activeClip.startTime : 0;
    const end = activeClip ? activeClip.endTime : Math.max(duration, start + 1);
    return { start, end: Math.max(start + 0.2, end) };
  }

  function updateElementLifespan(
    id: string,
    timeStart: number,
    timeEnd: number,
  ) {
    const idx = drawings.findIndex((d) => d.id === id);
    if (idx === -1) return;
    const { start, end } = getEffectiveClipRange();
    const minSpan = 0.15;
    const clampedStart = Math.max(start, Math.min(end - minSpan, timeStart));
    const clampedEnd = Math.min(
      end,
      Math.max(clampedStart + minSpan, timeEnd),
    );
    drawings[idx].timeStart = Number(clampedStart.toFixed(3));
    drawings[idx].timeEnd = Number(clampedEnd.toFixed(3));
    drawings = [...drawings];
  }

  function resetElementLifespan(id: string) {
    const { start, end } = getEffectiveClipRange();
    updateElementLifespan(id, start, end);
  }

  function setSelectedElementInAtPlayhead() {
    if (!selectedElement) return;
    const { start, end } = getEffectiveClipRange();
    const curEnd =
      typeof selectedElement.timeEnd === "number"
        ? Math.min(end, selectedElement.timeEnd)
        : end;
    const nextStart = Math.max(start, Math.min(curEnd - 0.15, currentTime));
    updateElementLifespan(selectedElement.id, nextStart, curEnd);
  }

  function setSelectedElementOutAtPlayhead() {
    if (!selectedElement) return;
    const { start, end } = getEffectiveClipRange();
    const curStart =
      typeof selectedElement.timeStart === "number"
        ? Math.max(start, selectedElement.timeStart)
        : start;
    const nextEnd = Math.min(end, Math.max(curStart + 0.15, currentTime));
    updateElementLifespan(selectedElement.id, curStart, nextEnd);
  }

  // --- DRAWING CANVAS RENDER ENGINE ---
  function drawCanvas() {
    if (!canvasEl) return;
    const ctx = canvasEl.getContext("2d");
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.clearRect(0, 0, canvasEl.width, canvasEl.height);
    ctx.scale(dpr, dpr);

    const w = canvasEl.width / dpr;
    const h = canvasEl.height / dpr;

    const allToRender = inProgressDrawing
      ? [...drawings, inProgressDrawing]
      : drawings;
    const listWithBlend = isFloorBlend
      ? allToRender.map((d) => ({
          ...d,
          isChromaFloor: d.isChromaFloor ?? isFloorElType(d.type),
        }))
      : allToRender;

    renderDrawingsToCanvas(ctx, listWithBlend, w, h, currentTime, {
      videoEl,
      homographyResult: isPitchCalibrated ? homographyResult : null,
      chromaConfig: projectStore.chromaFloorConfig,
      detectedBoxes: liveDetectedBoxes,
      silhouetteMask:
        liveSilhouetteMask &&
        (isFreezeActive || Math.abs(liveSilhouetteMask.time - currentTime) <= 0.45)
          ? liveSilhouetteMask
          : null,
      clipStartTime: activeClip ? activeClip.startTime : 0,
      clipEndTime: activeClip ? activeClip.endTime : duration,
      animElapsedSec: isFreezeActive ? 1.0 : undefined,
      selectedElementId,
      activeTool,
    });

    // Render 3D court homography calibration grid if active
    if (isPitchCalibrated) {
      drawCalibratedCourtOverlay(ctx, activeCalibrationPoints, w, h);
    }

    // Render Interactive AI Player Picker boxes on fresh frame scan
    if (
      isPlayerPickMode &&
      !isPickerStale &&
      detectedFrameBoxes.length > 0 &&
      !isFreezeActive
    ) {
      drawPlayerPickerOverlay(ctx, w, h);
    }

    ctx.restore();
  }

  function getBoxAnchor(
    box: DetectedPlayerBox,
    mode: "foot" | "center",
  ): Point2D {
    if (mode === "center") {
      return {
        x: Math.max(0, Math.min(1, box.x + box.w * 0.5)),
        y: Math.max(0, Math.min(1, box.y + box.h * 0.45)),
      };
    }
    return {
      x: Math.max(0, Math.min(1, box.foot_x)),
      y: Math.max(0, Math.min(1, box.foot_y)),
    };
  }

  function findPickerBoxAtPoint(
    pt: Point2D,
  ): { idx: number; box: DetectedPlayerBox } | null {
    const mode = getAnchorMode(activeTool);
    let best: { idx: number; box: DetectedPlayerBox; dist: number } | null = null;
    for (let i = 0; i < detectedFrameBoxes.length; i++) {
      const box = detectedFrameBoxes[i];
      const pad = 0.015;
      const anchor = getBoxAnchor(box, mode);
      const dist = Math.hypot(pt.x - anchor.x, pt.y - anchor.y);
      const inside =
        pt.x >= box.x - pad &&
        pt.x <= box.x + box.w + pad &&
        pt.y >= box.y - pad &&
        pt.y <= box.y + box.h + pad;
      if (inside || dist < 0.045) {
        if (!best || dist < best.dist) {
          best = { idx: i, box, dist };
        }
      }
    }
    return best ? { idx: best.idx, box: best.box } : null;
  }

  function drawPlayerPickerOverlay(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
  ) {
    const mode = getAnchorMode(activeTool);
    const scaleFactor = w / 1280;
    const canAttachTool = SINGLE_PLAYER_TOOLS.includes(activeTool);

    for (let i = 0; i < detectedFrameBoxes.length; i++) {
      const b = detectedFrameBoxes[i];
      const isHover = hoveredPlayerBoxIdx === i;
      const bx = b.x * w;
      const by = b.y * h;
      const bw = b.w * w;
      const bh = b.h * h;
      const accent = isHover ? "#10b981" : "#38bdf8";

      ctx.save();
      ctx.fillStyle = isHover
        ? "rgba(16, 185, 129, 0.20)"
        : "rgba(56, 189, 248, 0.08)";
      ctx.fillRect(bx, by, bw, bh);

      // Corner brackets
      const arm = Math.min(14 * scaleFactor, bw * 0.35, bh * 0.35);
      ctx.strokeStyle = accent;
      ctx.lineWidth = (isHover ? 3 : 2) * scaleFactor;
      ctx.beginPath();
      // Top-left
      ctx.moveTo(bx, by + arm);
      ctx.lineTo(bx, by);
      ctx.lineTo(bx + arm, by);
      // Top-right
      ctx.moveTo(bx + bw - arm, by);
      ctx.lineTo(bx + bw, by);
      ctx.lineTo(bx + bw, by + arm);
      // Bottom-right
      ctx.moveTo(bx + bw, by + bh - arm);
      ctx.lineTo(bx + bw, by + bh);
      ctx.lineTo(bx + bw - arm, by + bh);
      // Bottom-left
      ctx.moveTo(bx + arm, by + bh);
      ctx.lineTo(bx, by + bh);
      ctx.lineTo(bx, by + bh - arm);
      ctx.stroke();

      // Anchor target dot
      const anc = getBoxAnchor(b, mode);
      const ax = anc.x * w;
      const ay = anc.y * h;
      ctx.beginPath();
      ctx.arc(ax, ay, (isHover ? 6 : 4.5) * scaleFactor, 0, Math.PI * 2);
      ctx.fillStyle = accent;
      ctx.fill();
      ctx.strokeStyle = "#060b14";
      ctx.lineWidth = 1.5 * scaleFactor;
      ctx.stroke();

      // Player pill badge
      const badge = isHover && canAttachTool ? `#P${i + 1} · Klik Tempel` : `#P${i + 1}`;
      ctx.font = `bold ${Math.max(10, Math.round(11 * scaleFactor))}px system-ui, sans-serif`;
      const tw = ctx.measureText(badge).width;
      const pw = tw + 12 * scaleFactor;
      const ph = 18 * scaleFactor;
      const pillX = Math.max(4, Math.min(w - pw - 4, bx));
      const pillY = Math.max(4, by - ph - 3 * scaleFactor);

      ctx.fillStyle = isHover ? "rgba(6, 78, 59, 0.94)" : "rgba(11, 23, 42, 0.92)";
      ctx.beginPath();
      ctx.roundRect(pillX, pillY, pw, ph, 4 * scaleFactor);
      ctx.fill();
      ctx.strokeStyle = accent;
      ctx.lineWidth = 1.2 * scaleFactor;
      ctx.stroke();

      ctx.fillStyle = "#ffffff";
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(badge, pillX + 6 * scaleFactor, pillY + ph / 2);
      ctx.restore();
    }
  }

  // --- INTERACTIVE POINTER EVENTS ---
  function getCanvasCoords(e: PointerEvent): Point2D {
    if (!canvasEl) return { x: 0, y: 0 };
    const rect = canvasEl.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };
  }

  function finishInProgressMultiPoint() {
    if (!inProgressDrawing) return;
    const minPts = inProgressDrawing.type === "player-link" ? 2 : 3;
    if (inProgressDrawing.points.length >= minPts) {
      const created = { ...inProgressDrawing };
      drawings = [...drawings, created];
      selectedElementId = created.id;
      rightPanelTab = "elements";
      inProgressDrawing = null;
    } else {
      exportNotice = `Tambahkan minimal ${minPts} titik terlebih dahulu.`;
      setTimeout(() => (exportNotice = null), 2500);
    }
  }

  function toggleLiveStepTrack() {
    if (!selectedElement) {
      if (drawings.length > 0) {
        selectedElementId = drawings[drawings.length - 1].id;
      } else {
        exportNotice = "Pilih atau buat shape terlebih dahulu untuk Step-Track.";
        setTimeout(() => (exportNotice = null), 3000);
        return;
      }
    }
    isLiveFollowDrag = false;
    isHoldingLiveFollow = false;
    isLiveStepTrack = !isLiveStepTrack;
    if (isLiveStepTrack) {
      if (videoEl && !videoEl.paused) {
        videoEl.pause();
        isPlaying = false;
      }
      isPlayerPickMode = false;
      rightPanelTab = "elements";
      exportNotice = `Step-Track aktif: klik posisi pemain sekarang, video otomatis maju +${liveStepInterval}s!`;
      setTimeout(() => (exportNotice = null), 4500);
    }
  }

  function toggleLiveFollowDrag() {
    if (!selectedElement) {
      if (drawings.length > 0) {
        selectedElementId = drawings[drawings.length - 1].id;
      } else {
        exportNotice = "Pilih atau buat shape terlebih dahulu untuk Ikuti 0.5x.";
        setTimeout(() => (exportNotice = null), 3000);
        return;
      }
    }
    isLiveStepTrack = false;
    isLiveFollowDrag = !isLiveFollowDrag;
    if (isLiveFollowDrag) {
      if (videoEl && !videoEl.paused) {
        videoEl.pause();
        isPlaying = false;
      }
      isPlayerPickMode = false;
      rightPanelTab = "elements";
      exportNotice =
        "Mode Ikuti 0.5x siap: tekan & tahan mouse di atas pemain sambil menyeret mengikuti geraknya!";
      setTimeout(() => (exportNotice = null), 5000);
    } else {
      isHoldingLiveFollow = false;
      if (videoEl) videoEl.playbackRate = 1.0;
    }
  }

  function handlePointerDown(e: PointerEvent) {
    if (!canvasEl) return;
    const pt = getCanvasCoords(e);

    // -2. Live 0.5x Slow-Mo Follow-Drag recording
    if (isLiveFollowDrag && selectedElement && videoEl) {
      isHoldingLiveFollow = true;
      lastLiveFollowSampleT = currentTime;
      addOrUpdateKeyframe(selectedElement, currentTime, pt);
      upsertManualPin(selectedElement, currentTime, pt);
      drawings = [...drawings];
      videoEl.playbackRate = 0.5;
      videoEl.play().catch(() => {});
      isPlaying = true;
      return;
    }

    // -1.5. Live Step-Track (click position -> record keyframe & advance +liveStepInterval)
    if (isLiveStepTrack && selectedElement) {
      addOrUpdateKeyframe(selectedElement, currentTime, pt);
      upsertManualPin(selectedElement, currentTime, pt);
      drawings = [...drawings];
      const maxT = activeClip ? activeClip.endTime : duration;
      if (currentTime >= maxT - 0.02) {
        isLiveStepTrack = false;
        exportNotice =
          "Step-Track selesai sampai akhir klip! Tekan Play untuk melihat kurva halus.";
        setTimeout(() => (exportNotice = null), 4000);
      } else {
        const nextT = Math.min(maxT, currentTime + liveStepInterval);
        currentTime = nextT;
        if (videoEl) {
          videoEl.currentTime = nextT;
        }
      }
      return;
    }

    // -1. Court floor chroma-key eyedropper sampler
    if (isSamplingFloor) {
      isSamplingFloor = false;
      if (videoEl && videoEl.videoWidth > 0) {
        const rgb = sampleFloorRgbFromVideo(videoEl, pt.x, pt.y);
        if (rgb) {
          projectStore.chromaFloorConfig.targetRgb = rgb;
          projectStore.chromaFloorConfig.enabled = true;
          exportNotice = `Warna lantai dikalibrasi: rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;
          setTimeout(() => (exportNotice = null), 3500);
          return;
        }
      }
      exportNotice = "Video belum termuat untuk mengambil sampel warna lantai.";
      setTimeout(() => (exportNotice = null), 3000);
      return;
    }

    // 0. If 3D pitch calibration is active, check corner pin dragging
    if (isPitchCalibrated) {
      const corners: ("tl" | "tr" | "br" | "bl")[] = ["tl", "tr", "br", "bl"];
      for (const c of corners) {
        const pin = activeCalibrationPoints[c];
        if (Math.hypot(pt.x - pin.x, pt.y - pin.y) < 0.05) {
          if (temporalCalibrationFrames.length > 0) {
            calibrationPoints = { ...activeCalibrationPoints };
            temporalCalibrationFrames = [];
          }
          activeCornerDrag = c;
          return;
        }
      }
    }

      // 0. If AI Player Picker is active and a single-player highlight tool is active, click player (box or direct) to attach & track!
      if (
        isPlayerPickMode &&
        SINGLE_PLAYER_TOOLS.includes(activeTool)
      ) {
        const hit = !isPickerStale && detectedFrameBoxes.length > 0
          ? findPickerBoxAtPoint(pt)
          : null;
        const anchor = hit
          ? getBoxAnchor(hit.box, getAnchorMode(activeTool))
          : { x: pt.x, y: pt.y };
        const pts: Point2D[] = [anchor];
        if (activeTool === "vision-cone") {
          pts.push({
            x: Math.min(0.95, anchor.x + 0.1),
            y: Math.max(0.05, anchor.y - 0.06),
          });
        }
        const pinTime = parseFloat(currentTime.toFixed(3));
        const newEl: DrawingElement = {
          id: `el-ai-${Date.now()}`,
          type: activeTool,
          color: activeColor,
          points: pts,
          keyframes: [
            {
              time: pinTime,
              x: anchor.x,
              y: anchor.y,
            },
          ],
          manualPins: [
            {
              time: pinTime,
              x: anchor.x,
              y: anchor.y,
            },
          ],
          isTracking: true,
          timeStart: activeClip ? activeClip.startTime : currentTime,
          timeEnd: activeClip ? activeClip.endTime : currentTime + 5,
          isChromaFloor: isFloorBlend || isFloorElType(activeTool),
          animationStyle: "none",
          label: hit
            ? activeTool === "player-circle"
              ? undefined
              : activeTool === "spotlight-3d"
                ? `#P${hit.idx + 1} Fokus`
                : activeTool === "magnifier"
                  ? "1.8x Zoom"
                  : activeTool === "player-cross"
                    ? "Evaluasi"
                    : undefined
            : activeTool === "player-circle"
              ? undefined
              : activeTool === "spotlight-3d"
                ? "Fokus Pemain"
                : activeTool === "magnifier"
                  ? "1.8x Zoom"
                  : activeTool === "player-cross"
                    ? "Evaluasi"
                    : undefined,
          zoomScale: activeTool === "magnifier" ? 1.8 : undefined,
        };
        drawings = [...drawings, newEl];
        selectedElementId = newEl.id;
        rightPanelTab = "elements";
        hoveredPlayerBoxIdx = null;
        trackElementBidirectional(newEl, currentTime, hit?.box);
        return;
      }

      // If Select Tool is active:
      if (activeTool === "select") {
      // 1. Check if clicking on curve control point of a curved arrow
      if (selectedElement && selectedElement.type === "curved-arrow") {
        const p0 = selectedElement.points[0];
        const p2 = selectedElement.points[1];
        let cp = selectedElement.controlPoint;
        if (!cp) {
          const mx = (p0.x + p2.x) / 2;
          const my = (p0.y + p2.y) / 2;
          const dx = p2.x - p0.x;
          const dy = p2.y - p0.y;
          const len = Math.hypot(dx, dy) || 1;
          const nx = -dy / len;
          const ny = dx / len;
          const offset = (selectedElement.curveOffset || -0.28) * len;
          cp = { x: mx + nx * offset, y: my + ny * offset };
        }
        if (Math.hypot(pt.x - cp.x, pt.y - cp.y) < 0.05) {
          activeCurveControl = selectedElement.id;
          return;
        }
      }

      // 2. Check if clicking near any existing element to select it
      let found: DrawingElement | null = null;
      for (const d of drawings) {
        if (!isElementVisibleAtTime(d, currentTime)) continue;
        const effPts = getElementPointsAtTime(d, currentTime);
        if (effPts.length > 0) {
          const dist = Math.hypot(pt.x - effPts[0].x, pt.y - effPts[0].y);
          if (dist < 0.08) {
            found = d;
            break;
          }
        }
      }

      if (found) {
        selectedElementId = found.id;
        rightPanelTab = "elements";
        isDraggingSelected = true;
        dragStartPos = pt;
        const currPts = getElementPointsAtTime(found, currentTime);
        dragAnchorStart = currPts[0] ? { ...currPts[0] } : { ...found.points[0] };
      } else {
        selectedElementId = null;
        dragAnchorStart = null;
      }
      return;
    }

    // Creating new multi-point element (Hull, Textured Pressing Zone, or Player Link)
    if (
      activeTool === "compactness-hull" ||
      activeTool === "pressing-zone" ||
      activeTool === "player-link"
    ) {
      if (!inProgressDrawing || inProgressDrawing.type !== activeTool) {
        inProgressDrawing = {
          id: `${activeTool}-${Date.now()}`,
          type: activeTool,
          color: activeColor,
          points: [pt],
          timeStart: activeClip ? activeClip.startTime : currentTime,
          timeEnd: activeClip ? activeClip.endTime : currentTime + 5,
          isChromaFloor: isFloorBlend || isFloorElType(activeTool),
          label:
            activeTool === "pressing-zone"
              ? "Zona Pressing"
              : activeTool === "player-link"
                ? "Link Formasi"
                : undefined,
        };
      } else {
        const p0 = inProgressDrawing.points[0];
        if (
          activeTool !== "player-link" &&
          inProgressDrawing.points.length >= 3 &&
          Math.hypot(pt.x - p0.x, pt.y - p0.y) < 0.05
        ) {
          const created = { ...inProgressDrawing };
          drawings = [...drawings, created];
          selectedElementId = created.id;
          rightPanelTab = "elements";
          inProgressDrawing = null;
        } else {
          inProgressDrawing.points.push(pt);
        }
      }
      return;
    }

    inProgressDrawing = {
      id: `el-${Date.now()}`,
      type: activeTool,
      color: activeColor,
      points: [pt],
      timeStart: activeClip ? activeClip.startTime : currentTime,
      timeEnd: activeClip ? activeClip.endTime : currentTime + 5,
      isChromaFloor: isFloorBlend || isFloorElType(activeTool),
      animationStyle: "none",
      label:
        activeTool === "note-text"
          ? "Evaluasi Rotasi"
          : activeTool === "magnifier"
            ? "1.8x Zoom"
            : activeTool === "player-cross"
              ? "Salah Posisi"
              : activeTool === "player-ghost"
                ? "Posisi Ideal"
                : undefined,
      curveOffset: activeTool === "curved-arrow" ? -0.28 : undefined,
      zoomScale: activeTool === "magnifier" ? 1.8 : undefined,
      spotlightRadius: activeTool === "spotlight-3d" ? 1.0 : undefined,
      spotlightHeight: activeTool === "spotlight-3d" ? 1.0 : undefined,
    };
  }

  function handlePointerMove(e: PointerEvent) {
    if (!canvasEl) return;
    const pt = getCanvasCoords(e);

    // Live 0.5x Slow-Mo Follow-Drag tracking
    if (isHoldingLiveFollow && selectedElement && videoEl) {
      const vt = videoEl.currentTime;
      currentTime = vt;
      addOrUpdateKeyframe(selectedElement, vt, pt);
      if (Math.abs(vt - lastLiveFollowSampleT) >= 0.2) {
        upsertManualPin(selectedElement, vt, pt);
        lastLiveFollowSampleT = vt;
      }
      drawings = [...drawings];
      return;
    }

    // 0. If dragging 3D court calibration corner pin:
    if (activeCornerDrag) {
      calibrationPoints[activeCornerDrag] = pt;
      calibrationPoints = { ...calibrationPoints };
      return;
    }

    // If dragging curve control point:
    if (activeCurveControl && selectedElement) {
      selectedElement.controlPoint = pt;
      drawings = [...drawings];
      return;
    }

    // If dragging selected element in select mode:
    if (isDraggingSelected && selectedElement && dragStartPos) {
      if (
        (selectedElement.keyframes && selectedElement.keyframes.length > 0) ||
        isKeyframeMode
      ) {
        const baseAnchor = dragAnchorStart ?? selectedElement.points[0];
        const nextAnchor = {
          x: Math.max(0, Math.min(1, baseAnchor.x + (pt.x - dragStartPos.x))),
          y: Math.max(0, Math.min(1, baseAnchor.y + (pt.y - dragStartPos.y))),
        };
        addOrUpdateKeyframe(selectedElement, currentTime, nextAnchor);
        upsertManualPin(selectedElement, currentTime, nextAnchor);
        drawings = [...drawings];
        return;
      }

      const dx = pt.x - dragStartPos.x;
      const dy = pt.y - dragStartPos.y;

      // Move points for static element
      for (const p of selectedElement.points) {
        p.x += dx;
        p.y += dy;
      }
      if (selectedElement.controlPoint) {
        selectedElement.controlPoint.x += dx;
        selectedElement.controlPoint.y += dy;
      }

      dragStartPos = pt;
      drawings = [...drawings];
      return;
    }

    // Hover feedback for AI Player Picker
    if (
      isPlayerPickMode &&
      !isPickerStale &&
      detectedFrameBoxes.length > 0 &&
      SINGLE_PLAYER_TOOLS.includes(activeTool) &&
      !activeCornerDrag &&
      !activeCurveControl &&
      !inProgressDrawing
    ) {
      hoveredPlayerBoxIdx = findPickerBoxAtPoint(pt)?.idx ?? null;
    } else if (hoveredPlayerBoxIdx !== null) {
      hoveredPlayerBoxIdx = null;
    }

    // In-progress drawing updates
    if (!inProgressDrawing) return;

    if (inProgressDrawing.type === "freehand") {
      inProgressDrawing.points.push(pt);
    } else if (inProgressDrawing.points.length === 1) {
      inProgressDrawing.points.push(pt);
    } else {
      inProgressDrawing.points[1] = pt;
    }
  }

  function handlePointerUp() {
    if (isHoldingLiveFollow) {
      isHoldingLiveFollow = false;
      isLiveFollowDrag = false;
      if (videoEl) {
        videoEl.pause();
        videoEl.playbackRate = 1.0;
        isPlaying = false;
      }
      exportNotice = `Live Follow selesai (${selectedElement?.keyframes?.length ?? 0} keyframe halus Catmull-Rom)!`;
      setTimeout(() => (exportNotice = null), 4000);
    }

    activeCornerDrag = null;
    activeCurveControl = null;
    isDraggingSelected = false;
    dragStartPos = null;
    dragAnchorStart = null;

    if (
      !inProgressDrawing ||
      inProgressDrawing.type === "compactness-hull" ||
      inProgressDrawing.type === "pressing-zone" ||
      inProgressDrawing.type === "player-link"
    )
      return;

    // Finish curved arrow with initial control point
    if (
      inProgressDrawing.type === "curved-arrow" &&
      inProgressDrawing.points.length >= 2
    ) {
      const p0 = inProgressDrawing.points[0];
      const p2 = inProgressDrawing.points[1];
      const mx = (p0.x + p2.x) / 2;
      const my = (p0.y + p2.y) / 2;
      const dx = p2.x - p0.x;
      const dy = p2.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len;
      const ny = dx / len;
      const offset = (inProgressDrawing.curveOffset || -0.28) * len;
      inProgressDrawing.controlPoint = {
        x: mx + nx * offset,
        y: my + ny * offset,
      };
    }

    drawings.push({ ...inProgressDrawing });
    selectedElementId = inProgressDrawing.id;
    rightPanelTab = "elements";
    inProgressDrawing = null;
  }

  // --- KEYFRAME TRACKING ENGINE ---
  function addOrUpdateKeyframe(
    element: DrawingElement,
    time: number,
    pt: Point2D,
  ) {
    if (!element.keyframes) {
      element.keyframes = [];
    }
    const existingIdx = element.keyframes.findIndex(
      (k) => Math.abs(k.time - time) < 0.08,
    );
    if (existingIdx !== -1) {
      element.keyframes[existingIdx].x = pt.x;
      element.keyframes[existingIdx].y = pt.y;
    } else {
      element.keyframes.push({ time, x: pt.x, y: pt.y });
      element.keyframes.sort((a, b) => a.time - b.time);
    }
    element.isTracking = true;
  }

  function upsertManualPin(
    element: DrawingElement,
    time: number,
    pt: Point2D,
  ) {
    if (!element.manualPins) {
      element.manualPins = [];
    }
    const tRound = parseFloat(time.toFixed(3));
    const idx = element.manualPins.findIndex(
      (p) => Math.abs(p.time - tRound) < 0.12,
    );
    if (idx !== -1) {
      element.manualPins[idx] = { time: tRound, x: pt.x, y: pt.y };
    } else {
      element.manualPins.push({ time: tRound, x: pt.x, y: pt.y });
      element.manualPins.sort((a, b) => a.time - b.time);
    }
  }

  function handleAddCurrentKeyframe() {
    if (!selectedElement) return;
    const currPt =
      getElementPointsAtTime(selectedElement, currentTime)[0] ??
      selectedElement.points[0];
    addOrUpdateKeyframe(selectedElement, currentTime, currPt);
    upsertManualPin(selectedElement, currentTime, currPt);
    drawings = [...drawings];
  }

  function handleDeleteCurrentKeyframe() {
    if (!selectedElement || !selectedElement.keyframes) return;
    selectedElement.keyframes = selectedElement.keyframes.filter(
      (k) => Math.abs(k.time - currentTime) >= 0.15,
    );
    if (selectedElement.manualPins) {
      selectedElement.manualPins = selectedElement.manualPins.filter(
        (p) => Math.abs(p.time - currentTime) >= 0.15,
      );
    }
    if (selectedElement.keyframes.length === 0) {
      selectedElement.isTracking = false;
    }
    drawings = [...drawings];
  }

  function clearAllKeyframesForSelected() {
    if (!selectedElement) return;
    selectedElement.keyframes = [];
    selectedElement.isTracking = false;
    drawings = [...drawings];
  }

  // --- VIDEO TRANSPORT CONTROLS ---
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
    const step = 0.04 * frames; // ~25 fps frame step
    videoEl.currentTime = Math.max(0, videoEl.currentTime + step);
    currentTime = videoEl.currentTime;
  }

  function jumpToClipStart() {
    if (!videoEl || !activeClip) return;
    videoEl.currentTime = activeClip.startTime;
    currentTime = activeClip.startTime;
  }

  function jumpToClipEnd() {
    if (!videoEl || !activeClip) return;
    videoEl.currentTime = activeClip.endTime;
    currentTime = activeClip.endTime;
  }

  function handleScrub(e: Event) {
    const val = parseFloat((e.target as HTMLInputElement).value);
    currentTime = val;
    if (videoEl) {
      videoEl.currentTime = val;
    }
  }

  // Trigger Real AI Multi-Player MOT Tracking (Rust ONNX Runtime + YOLOX-Nano)
  async function triggerAIMultiTracking() {
    if (isMultiTracking) return;
    isMultiTracking = true;
    const start = activeClip ? activeClip.startTime : currentTime;
    const end = activeClip ? activeClip.endTime : currentTime + 4;
    exportNotice = `Menjalankan deteksi AI (${aiEngineLabel})...`;

    try {
      const result = await runMultiPlayerAutoTracking(
        projectStore.videoFilePath,
        start,
        end,
        8,
      );
      if (result.tracks.length === 0) {
        exportNotice =
          "AI tidak mendeteksi pemain yang cukup konsisten di klip ini.";
        setTimeout(() => (exportNotice = null), 4000);
        return;
      }

      detectedTracks = result.tracks;

      for (const track of result.tracks) {
        const firstKf = track.keyframes[0] || { x: 0.5, y: 0.5 };
        drawings.push({
          id: `mot-${track.id}-${Date.now()}`,
          type: "spotlight-3d",
          color: track.color,
          points: [{ x: firstKf.x, y: firstKf.y }],
          keyframes: track.keyframes,
          isTracking: true,
          isChromaFloor: true,
          label: track.label,
          timeStart: start,
          timeEnd: end,
        });
      }

      // Attach dynamic multi-point compactness hull for home team (up to 5 players)
      const homeTracks = result.tracks
        .filter((tr) => tr.team === "home" && tr.keyframes.length > 0)
        .slice(0, 5);
      const firstHomeHull = result.homeHullKeyframes.values().next().value;
      if (homeTracks.length >= 3) {
        const hullPts: Point2D[] = [];
        const hullPointTracks: Record<number, TrackingKeyframe[]> = {};
        const hullPointIds: Record<number, string> = {};
        homeTracks.forEach((tr, idx) => {
          const kf0 =
            getInterpolatedPosition(tr.keyframes, start) ?? tr.keyframes[0];
          hullPts.push({ x: kf0.x, y: kf0.y });
          hullPointTracks[idx] = tr.keyframes;
          hullPointIds[idx] = tr.id;
        });
        drawings.push({
          id: `mot-hull-home-${Date.now()}`,
          type: "compactness-hull",
          color: "#ef4444",
          points: hullPts,
          pointTracks: hullPointTracks,
          pointTrackIds: hullPointIds,
          isTracking: true,
          isChromaFloor: true,
          label: "Kompak Tim A",
          timeStart: start,
          timeEnd: end,
        });
      } else if (firstHomeHull && firstHomeHull.length >= 3) {
        drawings.push({
          id: `mot-hull-home-${Date.now()}`,
          type: "compactness-hull",
          color: "#ef4444",
          points: firstHomeHull,
          isChromaFloor: true,
          label: "Kompak Tim A",
          timeStart: start,
          timeEnd: end,
        });
      }

      drawings = [...drawings];
      exportNotice = `AI mendeteksi ${result.tracks.length} trek dari ${result.framesProcessed} frame.`;
      setTimeout(() => (exportNotice = null), 4500);
    } catch (err: any) {
      exportNotice = `AI Tracking gagal: ${err?.message || err}`;
      setTimeout(() => (exportNotice = null), 5000);
    } finally {
      isMultiTracking = false;
    }
  }

  // Scan current video frame with YOLOX-Nano for AI Player Picker
  async function scanPlayersInCurrentFrame() {
    if (isScanningPlayers) return;
    if (videoEl && !videoEl.paused) {
      videoEl.pause();
      isPlaying = false;
    }

    if (
      !isTauriDesktop() ||
      !projectStore.videoFilePath ||
      (!projectStore.videoFilePath.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/.test(projectStore.videoFilePath))
    ) {
      exportNotice =
        "Deteksi AI frame membutuhkan aplikasi desktop Tauri dan file video lokal.";
      setTimeout(() => (exportNotice = null), 4000);
      return;
    }

    isScanningPlayers = true;
    exportNotice = `Memindai pemain pada ${currentTime.toFixed(2)}s (${aiEngineLabel})...`;
    try {
      const allBoxes = await detectPlayersInFrameOnnx(
        projectStore.videoFilePath,
        currentTime,
      );
      const players = allBoxes.filter((b) => b.class_id === 0);
      liveDetectedBoxes = allBoxes;
      detectedFrameBoxes = players;
      detectedFrameTime = currentTime;
      isPlayerPickMode = true;
      hoveredPlayerBoxIdx = null;

      if (!SINGLE_PLAYER_TOOLS.includes(activeTool)) {
        activeTool = "spotlight-3d";
      }

      if (players.length > 0) {
        exportNotice = `${players.length} pemain terdeteksi — klik kotak pemain untuk tempel & lacak otomatis.`;
      } else {
        exportNotice =
          "Tidak ada pemain terdeteksi di frame ini. Geser video atau gambar manual.";
      }
      setTimeout(() => (exportNotice = null), 4500);
    } catch (err: any) {
      exportNotice = `Gagal memindai pemain: ${err?.message || err}`;
      setTimeout(() => (exportNotice = null), 4500);
    } finally {
      isScanningPlayers = false;
    }
  }

  function closePlayerPicker() {
    isPlayerPickMode = false;
    hoveredPlayerBoxIdx = null;
  }

  // Bidirectional Single-Player Tracking from clicked anchor frame (ONNX YOLOX-Nano + NCC/Histogram fallback)
  async function trackElementBidirectional(
    el: DrawingElement,
    anchorSec: number,
    matchedBox?: DetectedPlayerBox,
  ) {
    if (isSingleTracking) {
      trackAbortController?.abort();
      isSingleTracking = false;
    }

    const start = activeClip ? activeClip.startTime : Math.max(0, anchorSec - 2.5);
    const end = activeClip
      ? activeClip.endTime
      : Math.min(duration, anchorSec + 3.5);
    const clampedAnchor = Math.max(start, Math.min(end, anchorSec));
    const currentAnchor =
      getElementPointsAtTime(el, clampedAnchor)[0] ?? el.points[0];
    if (!currentAnchor) return;

    const anchorMode = getAnchorMode(el.type);
    const dirLabel = trackDirection === "forward" ? "Maju" : "2-Arah";
    isSingleTracking = true;
    singleTrackProgress = 0;
    trackAbortController = new AbortController();
    exportNotice = `Melacak gerak pemain (AI ROI ${dirLabel} dari ${clampedAnchor.toFixed(2)}s)...`;

    let trackedKfs: TrackingKeyframe[] = [];
    let onnxErr: string | null = null;
    let diagSummary: string | null = null;

    try {
      const hasLocalPath =
        isTauriDesktop() &&
        Boolean(projectStore.videoFilePath) &&
        (projectStore.videoFilePath!.startsWith("/") ||
          /^[A-Za-z]:[\\/]/.test(projectStore.videoFilePath!));

      if (hasLocalPath) {
        try {
          const res = await trackSinglePlayerOnnx({
            inputPath: projectStore.videoFilePath,
            startTime: start,
            endTime: end,
            anchorTime: clampedAnchor,
            anchorX: currentAnchor.x,
            anchorY: currentAnchor.y,
            anchorW: matchedBox?.w,
            anchorH: matchedBox?.h,
            anchorMode,
            direction: trackDirection,
            fps: 15,
          });
          trackedKfs = res.keyframes;
          const panPart = res.camera_pan_frames
            ? ` · CamPan ${res.camera_pan_frames}f`
            : "";
          diagSummary = `${trackedKfs.length} KF (AI ROI: ${res.matched_ai_frames}, Spatial NCC: ${res.fallback_frames}${panPart})`;
        } catch (err: any) {
          onnxErr = err?.message || String(err);
          trackedKfs = [];
        }
      }

      // Browser / non-ONNX fallback using bidirectional template + histogram tracking
      if (trackedKfs.length <= 1 && videoEl) {
        const boxW = matchedBox?.w ?? 0.055;
        const boxH = matchedBox?.h ?? 0.11;
        const boxX = Math.max(0, currentAnchor.x - boxW * 0.5);
        const boxY =
          anchorMode === "center"
            ? Math.max(0, currentAnchor.y - boxH * 0.45)
            : Math.max(0, currentAnchor.y - boxH * 0.85);

        trackedKfs = await runPlayerAutoTracking(
          videoEl,
          { x: boxX, y: boxY, width: boxW, height: boxH },
          start,
          end,
          {
            anchorTime: clampedAnchor,
            stepSeconds: 0.07,
            signal: trackAbortController.signal,
            onProgress: (p) => {
              singleTrackProgress = Math.round(p * 100);
            },
          },
        );
        if (trackedKfs.length > 0 && !diagSummary) {
          diagSummary = onnxErr
            ? `Fallback JS (${trackedKfs.length} KF · ONNX: ${onnxErr.slice(0, 48)})`
            : `Fallback JS (${trackedKfs.length} KF)`;
        }
      }

      if (trackedKfs.length > 0) {
        const target = drawings.find((d) => d.id === el.id) ?? el;
        target.keyframes = trackedKfs;
        target.isTracking = true;
        upsertManualPin(target, clampedAnchor, currentAnchor);
        drawings = [...drawings];
        lastTrackDiagnostics = diagSummary;
        exportNotice = onnxErr
          ? `Peringatan ONNX (${onnxErr}) — memakai ${diagSummary}`
          : `Terkunci! ${diagSummary} — tekan Play untuk lihat.`;
        setTimeout(() => (exportNotice = null), 5000);
      } else {
        exportNotice = onnxErr
          ? `AI ONNX gagal: ${onnxErr}`
          : "Tidak cukup frame untuk melacak pergerakan di klip ini.";
        setTimeout(() => (exportNotice = null), 4500);
      }
    } catch (err: any) {
      exportNotice = `Tracking gagal: ${err?.message || err}`;
      setTimeout(() => (exportNotice = null), 4500);
    } finally {
      isSingleTracking = false;
      trackAbortController = null;
    }
  }

  // Multi-Anchor Guided Re-Tracking across all user correction pins
  async function triggerGuidedReTrack(el?: DrawingElement) {
    const target = el ?? selectedElement;
    if (!target || target.points.length === 0) {
      exportNotice = "Pilih elemen terlebih dahulu untuk Guided Re-Track.";
      setTimeout(() => (exportNotice = null), 3500);
      return;
    }

    if (isSingleTracking) {
      trackAbortController?.abort();
      isSingleTracking = false;
      return;
    }

    const currPt =
      getElementPointsAtTime(target, currentTime)[0] ?? target.points[0];
    let pins = target.manualPins ? [...target.manualPins] : [];
    if (pins.length === 0) {
      if (target.keyframes && target.keyframes.length > 0) {
        pins = [{ ...target.keyframes[0] }];
      } else {
        pins = [
          {
            time: parseFloat(currentTime.toFixed(3)),
            x: currPt.x,
            y: currPt.y,
          },
        ];
      }
      target.manualPins = pins;
    }

    if (pins.length === 1) {
      await trackElementBidirectional(target, pins[0].time);
      return;
    }

    const start = activeClip
      ? activeClip.startTime
      : Math.max(0, pins[0].time - 1.5);
    const end = activeClip
      ? activeClip.endTime
      : Math.min(duration, pins[pins.length - 1].time + 1.5);
    const anchorMode = getAnchorMode(target.type);

    const hasLocalPath =
      isTauriDesktop() &&
      Boolean(projectStore.videoFilePath) &&
      (projectStore.videoFilePath!.startsWith("/") ||
        /^[A-Za-z]:[\\/]/.test(projectStore.videoFilePath!));

    if (!hasLocalPath) {
      await trackElementBidirectional(target, currentTime);
      return;
    }

    isSingleTracking = true;
    singleTrackProgress = 0;
    exportNotice = `Guided Re-Track (${pins.length} pin terkunci) via ROI YOLOX...`;

    try {
      const res = await trackGuidedAnchorsOnnx({
        inputPath: projectStore.videoFilePath,
        startTime: start,
        endTime: end,
        anchors: pins,
        anchorMode,
        fps: 15,
      });

      const found = drawings.find((d) => d.id === target.id) ?? target;
      found.keyframes = res.keyframes;
      found.isTracking = true;
      drawings = [...drawings];

      const panPart = res.camera_pan_frames
        ? ` · CamPan ${res.camera_pan_frames}f`
        : "";
      lastTrackDiagnostics = `Guided ${pins.length} Pin · ${res.keyframes.length} KF (AI ROI: ${res.matched_ai_frames}, NCC: ${res.fallback_frames}${panPart})`;
      exportNotice = `Guided Re-Track selesai (${pins.length} pin terkunci, ${res.keyframes.length} keyframe)!`;
      setTimeout(() => (exportNotice = null), 5000);
    } catch (err: any) {
      exportNotice = `Guided Re-Track gagal: ${err?.message || err}`;
      setTimeout(() => (exportNotice = null), 5000);
    } finally {
      isSingleTracking = false;
    }
  }

  // Trigger Bidirectional Auto-Tracking on currently selected element from currentTime
  async function triggerSingleElementTracking() {
    if (!selectedElement || selectedElement.points.length === 0) {
      exportNotice = "Pilih elemen terlebih dahulu untuk melacak.";
      setTimeout(() => (exportNotice = null), 3500);
      return;
    }

    if (isSingleTracking) {
      trackAbortController?.abort();
      isSingleTracking = false;
      return;
    }

    await trackElementBidirectional(selectedElement, currentTime);
  }

  function handleSave(silent: boolean = false) {
    if (!activeClip) return;
    projectStore.saveTelestration(
      activeClip.id,
      drawings,
      pauseDuration,
      voiceoverAudio || undefined,
      freezeTime,
    );
    if (!silent) {
      exportNotice = "Telestrasi & posisi freeze-frame disimpan!";
      setTimeout(() => (exportNotice = null), 2500);
    }
  }

  function handleSaveAndNext() {
    if (!activeClip) return;
    projectStore.saveAndNextClip(
      activeClip.id,
      drawings,
      pauseDuration,
      voiceoverAudio || undefined,
      freezeTime,
    );
    if (projectStore.activeClipForDrawing) {
      loadClipState(projectStore.activeClipForDrawing, true);
    }
  }

  function handleBackToTagging() {
    handleSave();
    projectStore.setStage("tagging");
  }

  function triggerPreview() {
    if (!videoEl || !activeClip) return;
    isPreviewing = true;
    isFreezeActive = false;
    videoEl.currentTime = activeClip.startTime;
    currentTime = activeClip.startTime;
    videoEl.play();
    isPlaying = true;
  }

  function clearAllDrawings() {
    drawings = [];
    selectedElementId = null;
  }

  function undoLastDrawing() {
    if (drawings.length > 0) {
      drawings.pop();
      drawings = [...drawings];
      selectedElementId = null;
    }
  }

  function deleteSelectedElement() {
    if (!selectedElementId) return;
    drawings = drawings.filter((d) => d.id !== selectedElementId);
    selectedElementId = null;
  }

  async function triggerCutoutDetect() {
    if (isDetectingCutout) return;
    isDetectingCutout = true;
    exportNotice = `Mendeteksi siluet pemain (${aiEngineLabel}) untuk Cutout Mask...`;
    try {
      const boxes = await detectPlayersInFrameOnnx(
        projectStore.videoFilePath,
        currentTime,
      );
      liveDetectedBoxes = boxes;
      if (boxes.length > 0) {
        projectStore.chromaFloorConfig.enabled = true;
        exportNotice = `Cutout aktif: ${boxes.length} objek terdeteksi pada ${currentTime.toFixed(2)}s`;
      } else {
        exportNotice =
          "Tidak ada bounding box terdeteksi di frame ini (Chroma HSV tetap aktif).";
      }
      setTimeout(() => (exportNotice = null), 3500);
    } finally {
      isDetectingCutout = false;
    }
  }

  async function triggerSilhouetteDetect(silent: boolean = false) {
    if (isSegmentingMask) return;
    isSegmentingMask = true;
    if (!silent) {
      exportNotice = `Memisahkan siluet pemain (${segEngineLabel}) dari lantai...`;
    }
    try {
      const mask = await segmentPlayersInFrameOnnx(
        projectStore.videoFilePath,
        currentTime,
      );
      if (mask && mask.alphaBytes.length > 0) {
        liveSilhouetteMask = mask;
        liveDetectedBoxes = mask.boxes;
        projectStore.chromaFloorConfig.enabled = true;
        projectStore.chromaFloorConfig.mode = "ai-silhouette";
        if (!silent) {
          exportNotice = `Siluet AI aktif: ${mask.playerCount} pemain dipisahkan dari lantai (${currentTime.toFixed(2)}s)`;
          setTimeout(() => (exportNotice = null), 3500);
        }
      } else if (!silent) {
        exportNotice =
          "Siluet AI belum dapat diproses di frame ini (pastikan mode Desktop Tauri).";
        setTimeout(() => (exportNotice = null), 3500);
      }
    } finally {
      isSegmentingMask = false;
    }
  }

  async function triggerAutoCourtCalibration() {
    if (isAutoCalibratingCourt) return;
    if (
      !isTauriDesktop() ||
      !projectStore.videoFilePath ||
      (!projectStore.videoFilePath.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/.test(projectStore.videoFilePath))
    ) {
      exportNotice =
        "Auto-Kalibrasi 3D membutuhkan mode Desktop Tauri dan file video lokal.";
      setTimeout(() => (exportNotice = null), 3500);
      return;
    }

    isAutoCalibratingCourt = true;
    exportNotice = "Mendeteksi 4 garis tepi lapangan otomatis (RANSAC)...";
    try {
      const res = await invoke<{
        tl: Point2D;
        tr: Point2D;
        br: Point2D;
        bl: Point2D;
        confidence: number;
        lines_detected: number;
        method: string;
      }>("auto_calibrate_court_frame", {
        inputPath: projectStore.videoFilePath,
        timeSec: currentTime,
      });
      calibrationPoints = {
        tl: res.tl,
        tr: res.tr,
        br: res.br,
        bl: res.bl,
      };
      temporalCalibrationFrames = [];
      isPitchCalibrated = true;
      exportNotice = `${res.method} · Akurasi ${Math.round(res.confidence * 100)}% (geser pin jika perlu)`;
      setTimeout(() => (exportNotice = null), 4500);
    } catch (err: any) {
      exportNotice = `Auto-kalibrasi gagal: ${err?.message || err}`;
      setTimeout(() => (exportNotice = null), 4500);
    } finally {
      isAutoCalibratingCourt = false;
    }
  }

  async function triggerPanningCalibrationTrack() {
    if (isTrackingPanningCourt || !activeClip) return;
    if (
      !isTauriDesktop() ||
      !projectStore.videoFilePath ||
      (!projectStore.videoFilePath.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/.test(projectStore.videoFilePath))
    ) {
      exportNotice =
        "Pelacakan kamera panning membutuhkan mode Desktop Tauri dan file video lokal.";
      setTimeout(() => (exportNotice = null), 3500);
      return;
    }

    isTrackingPanningCourt = true;
    exportNotice =
      "Melacak pergeseran garis lapangan untuk kamera panning...";
    try {
      const basePts = activeCalibrationPoints;
      const frames = await invoke<TemporalCalibrationFrame[]>(
        "track_court_calibration_range",
        {
          inputPath: projectStore.videoFilePath,
          startSec: activeClip.startTime,
          endSec: activeClip.endTime,
          anchorSec: currentTime,
          tl: basePts.tl,
          tr: basePts.tr,
          br: basePts.br,
          bl: basePts.bl,
          fps: 10,
        },
      );
      temporalCalibrationFrames = frames;
      isPitchCalibrated = true;
      exportNotice = `Kamera panning aktif (${frames.length} frame homography tersinkron)`;
      setTimeout(() => (exportNotice = null), 4500);
    } catch (err: any) {
      exportNotice = `Pelacakan panning gagal: ${err?.message || err}`;
      setTimeout(() => (exportNotice = null), 4500);
    } finally {
      isTrackingPanningCourt = false;
    }
  }

  function bindTrackToPoint(
    el: DrawingElement,
    pointIdx: number,
    trackId: string,
  ) {
    const nextTracks = { ...(el.pointTracks || {}) };
    const nextIds = { ...(el.pointTrackIds || {}) };
    if (!trackId) {
      delete nextTracks[pointIdx];
      delete nextIds[pointIdx];
    } else {
      const tr = detectedTracks.find((t) => t.id === trackId);
      if (tr) {
        nextTracks[pointIdx] = [...tr.keyframes];
        nextIds[pointIdx] = tr.id;
      }
    }
    el.pointTracks = nextTracks;
    el.pointTrackIds = nextIds;
    el.isTracking =
      Object.keys(nextTracks).length > 0 || (el.keyframes?.length ?? 0) > 0;
    drawings = [...drawings];
  }

  function autoBindSelectedPointsToTracks() {
    if (!selectedElement || detectedTracks.length === 0) return;
    const res = bindElementPointsToTracks(
      selectedElement,
      detectedTracks,
      currentTime,
    );
    if (res.boundCount === 0) {
      exportNotice = "Tidak ada track AI yang dekat dengan titik elemen ini.";
      setTimeout(() => (exportNotice = null), 3000);
      return;
    }
    selectedElement.pointTracks = res.pointTracks;
    selectedElement.pointTrackIds = res.pointTrackIds;
    selectedElement.isTracking = true;
    drawings = [...drawings];
    exportNotice = `${res.boundCount} titik diikat ke pemain AI.`;
    setTimeout(() => (exportNotice = null), 3000);
  }

  async function triggerMultiPointTracking() {
    if (!selectedElement || !videoEl || selectedElement.points.length < 2)
      return;
    if (isMultiPointTracking) {
      trackAbortController?.abort();
      isMultiPointTracking = false;
      return;
    }

    const start = activeClip ? activeClip.startTime : currentTime;
    const end = activeClip
      ? activeClip.endTime
      : Math.min(duration, currentTime + 5);
    isMultiPointTracking = true;
    singleTrackProgress = 0;
    trackAbortController = new AbortController();

    try {
      const nextPointTracks: Record<number, TrackingKeyframe[]> = {
        ...(selectedElement.pointTracks || {}),
      };
      const ptsCount = selectedElement.points.length;

      for (let idx = 0; idx < ptsCount; idx++) {
        if (trackAbortController.signal.aborted) break;
        const pt = selectedElement.points[idx];
        const box = {
          x: Math.max(0, pt.x - 0.025),
          y: Math.max(0, pt.y - 0.06),
          width: 0.05,
          height: 0.09,
        };
        const kfs = await runPlayerAutoTracking(videoEl, box, start, end, {
          stepSeconds: 0.08,
          signal: trackAbortController.signal,
          onProgress: (p) => {
            singleTrackProgress = Math.round(((idx + p) / ptsCount) * 100);
          },
        });
        if (kfs.length > 0) {
          nextPointTracks[idx] = kfs;
        }
      }

      if (selectedElement && Object.keys(nextPointTracks).length > 0) {
        selectedElement.pointTracks = nextPointTracks;
        selectedElement.isTracking = true;
        drawings = [...drawings];
        exportNotice = `Multi-Point Tracking selesai (${Object.keys(nextPointTracks).length} titik).`;
        setTimeout(() => (exportNotice = null), 3500);
      }
    } catch (err: any) {
      exportNotice = `Multi-Point Tracking gagal: ${err?.message || err}`;
      setTimeout(() => (exportNotice = null), 4000);
    } finally {
      isMultiPointTracking = false;
      trackAbortController = null;
    }
  }

  function toggleCameraZoomOnSelected() {
    if (!selectedElement || selectedElement.points.length === 0) return;
    if (selectedElement.cameraZoomTarget) {
      selectedElement.cameraZoomTarget = undefined;
    } else {
      const p = selectedElement.points[0];
      selectedElement.cameraZoomTarget = { x: p.x, y: p.y, scale: 1.45 };
    }
    drawings = [...drawings];
  }

  // Pilar 1 & Sprint 2: Direct Telestration Video Burner (Static Freeze OR Continuous Animated Sequence)
  async function handleDirectExportClip() {
    if (!isTauriDesktop()) {
      exportNotice =
        "Ekspor MP4 FFmpeg hanya tersedia di aplikasi desktop Tauri.";
      setTimeout(() => (exportNotice = null), 4000);
      return;
    }

    if (
      !activeClip ||
      !projectStore.videoFilePath ||
      (!projectStore.videoFilePath.startsWith("/") &&
        !/^[A-Za-z]:[\\/]/.test(projectStore.videoFilePath))
    ) {
      exportNotice =
        "Path file video absolut tidak ditemukan. Buka video lewat Hub Proyek.";
      setTimeout(() => (exportNotice = null), 4000);
      return;
    }

    let seqDirToClean: string | null = null;

    try {
      const { save } = await import("@tauri-apps/plugin-dialog");
      const cleanCat = activeClip.category.replace(/[^a-zA-Z0-9]/g, "_");
      const outPath = await save({
        title: "Simpan Klip Telestrasi MP4",
        defaultPath: `FutsalTag_Telestrasi_${cleanCat}.mp4`,
        filters: [{ name: "MP4 Video", extensions: ["mp4"] }],
      });
      if (!outPath) return;

      isExportingClip = true;
      const freezeSec =
        freezeTime || (activeClip.startTime + activeClip.endTime) / 2;
      const zoomObj =
        drawings.find((d) => d.cameraZoomTarget)?.cameraZoomTarget || null;
      const cameraZoomTuple = zoomObj
        ? [zoomObj.x, zoomObj.y, zoomObj.scale]
        : null;
      const needsAnimatedExport =
        hasAnimatedTelestration(
          drawings,
          activeClip.startTime,
          activeClip.endTime,
        ) ||
        (drawings.length > 0 && pauseDuration < 0.2);

      const useAiSilhouetteExport =
        projectStore.chromaFloorConfig.enabled &&
        (projectStore.chromaFloorConfig.mode ?? "ai-silhouette") ===
          "ai-silhouette" &&
        segModelAvailable;

      if (needsAnimatedExport) {
        const tmpRoot = await invoke<string>("get_temp_dir");
        const sep = tmpRoot.includes("\\") ? "\\" : "/";
        const seqDir = `${tmpRoot.replace(/[\\/]+$/, "")}${sep}futsaltag_seq_${Date.now()}`;
        seqDirToClean = seqDir;

        const clipDur = Math.max(
          0.4,
          activeClip.endTime - activeClip.startTime,
        );
        const overlayFps = clipDur <= 15 ? 20 : 15;
        const totalFrames = Math.max(2, Math.ceil(clipDur * overlayFps));

        let rangeMasks: PlayerSilhouetteMask[] = [];
        let rangeBoxes: { time: number; boxes: DetectedPlayerBox[] }[] = [];
        if (useAiSilhouetteExport) {
          exportNotice = "Memproses AI Siluet Pemain (U2NetP ONNX)...";
          rangeMasks = await segmentPlayersRangeOnnx(
            projectStore.videoFilePath,
            activeClip.startTime,
            activeClip.endTime,
            8,
          );
        }

        if (
          projectStore.chromaFloorConfig.enabled &&
          (!useAiSilhouetteExport || rangeMasks.length === 0)
        ) {
          exportNotice =
            `Mendeteksi pemain (${aiEngineLabel}) untuk Cutout Mask animasi...`;
          try {
            rangeBoxes = await invoke<
              { time: number; boxes: DetectedPlayerBox[] }[]
            >("detect_player_boxes_range_onnx", {
              inputPath: projectStore.videoFilePath,
              startSec: activeClip.startTime,
              endSec: activeClip.endTime,
              fps: 6,
            });
          } catch {
            rangeBoxes = [];
          }
        }

        const findClosestMask = (t: number): PlayerSilhouetteMask | null => {
          if (rangeMasks.length === 0) return liveSilhouetteMask;
          let best = rangeMasks[0];
          let minD = Math.abs(best.time - t);
          for (const rm of rangeMasks) {
            const d = Math.abs(rm.time - t);
            if (d < minD) {
              minD = d;
              best = rm;
            }
          }
          return best;
        };

        const findClosestBoxes = (t: number): DetectedPlayerBox[] => {
          if (rangeBoxes.length === 0) return liveDetectedBoxes;
          let best = rangeBoxes[0];
          let minD = Math.abs(best.time - t);
          for (const rb of rangeBoxes) {
            const d = Math.abs(rb.time - t);
            if (d < minD) {
              minD = d;
              best = rb;
            }
          }
          return best.boxes;
        };

        const needsVideoPixels =
          (projectStore.chromaFloorConfig.enabled &&
            (!useAiSilhouetteExport || rangeMasks.length === 0)) ||
          drawings.some((d) => d.type === "magnifier");

        for (let i = 0; i < totalFrames; i++) {
          const t = Math.min(
            activeClip.endTime,
            activeClip.startTime + i / overlayFps,
          );
          if (needsVideoPixels && videoEl) {
            await seekVideoElementSafe(videoEl, t);
          }
          const frameHomography = isPitchCalibrated
            ? temporalCalibrationFrames.length > 0
              ? calculatePitchCalibration(
                  interpolateCalibrationAtTime(
                    temporalCalibrationFrames,
                    t,
                    calibrationPoints,
                  ),
                )
              : homographyResult
            : null;
          exportNotice = `Merender frame telestrasi bergerak (${i + 1}/${totalFrames})...`;
          const pngBase64 = renderDrawingsToDataUrl(drawings, 1280, 720, t, {
            videoEl,
            homographyResult: frameHomography,
            chromaConfig: projectStore.chromaFloorConfig,
            detectedBoxes: findClosestBoxes(t),
            silhouetteMask: findClosestMask(t),
            clipStartTime: activeClip.startTime,
            clipEndTime: activeClip.endTime,
          });
          await invoke<string>("save_overlay_frame_png", {
            dirPath: seqDir,
            frameIndex: i + 1,
            pngBase64,
          });
        }

        if (needsVideoPixels && videoEl) {
          await seekVideoElementSafe(videoEl, freezeSec);
        }
        const freezeHomography = isPitchCalibrated
          ? temporalCalibrationFrames.length > 0
            ? calculatePitchCalibration(
                interpolateCalibrationAtTime(
                  temporalCalibrationFrames,
                  freezeSec,
                  calibrationPoints,
                ),
              )
            : homographyResult
          : null;
        const freezeOverlayBase64 = renderDrawingsToDataUrl(
          drawings,
          1280,
          720,
          freezeSec,
          {
            videoEl,
            homographyResult: freezeHomography,
            chromaConfig: projectStore.chromaFloorConfig,
            detectedBoxes: findClosestBoxes(freezeSec),
            silhouetteMask: findClosestMask(freezeSec),
            clipStartTime: activeClip.startTime,
            clipEndTime: activeClip.endTime,
            animElapsedSec: 1.0,
          },
        );

        exportNotice =
          "Menggabungkan sequence animasi dengan FFmpeg hardware encoder...";
        await invoke<string>("burn_animated_telestration_clip_ffmpeg", {
          inputPath: projectStore.videoFilePath,
          outputPath: outPath,
          startSec: activeClip.startTime,
          durationSec: clipDur,
          overlayFramesDir: seqDir,
          overlayFps,
          freezeSec,
          pauseDuration: pauseDuration ?? 0,
          freezeOverlayBase64,
          cameraZoom: cameraZoomTuple,
          voiceoverBase64: voiceoverAudio || null,
          targetHeight: 720,
        });
      } else {
        let freezeMask: PlayerSilhouetteMask | null = liveSilhouetteMask;
        if (useAiSilhouetteExport) {
          exportNotice = "Memproses AI Siluet Pemain (U2NetP ONNX)...";
          freezeMask =
            (await segmentPlayersInFrameOnnx(
              projectStore.videoFilePath,
              freezeSec,
            )) ?? liveSilhouetteMask;
        }
        exportNotice = "Merender klip telestrasi broadcast dengan FFmpeg...";
        const overlayBase64 = renderDrawingsToDataUrl(
          drawings,
          1920,
          1080,
          freezeSec,
          {
            videoEl,
            homographyResult: isPitchCalibrated ? homographyResult : null,
            chromaConfig: projectStore.chromaFloorConfig,
            detectedBoxes: freezeMask?.boxes ?? liveDetectedBoxes,
            silhouetteMask: freezeMask,
            clipStartTime: activeClip.startTime,
            clipEndTime: activeClip.endTime,
            animElapsedSec: 1.0,
          },
        );

        await invoke<string>("burn_telestration_clip_ffmpeg", {
          inputPath: projectStore.videoFilePath,
          outputPath: outPath,
          startSec: activeClip.startTime,
          durationSec: activeClip.endTime - activeClip.startTime,
          freezeSec,
          pauseDuration: pauseDuration ?? 0,
          overlayBase64,
          voiceoverBase64: voiceoverAudio || null,
          targetHeight: 1080,
          cameraZoom: cameraZoomTuple,
        });
      }

      exportNotice = `Klip berhasil diekspor ke: ${outPath}`;
      setTimeout(() => (exportNotice = null), 6000);
    } catch (err: any) {
      exportNotice = `Gagal ekspor: ${err?.message || err}`;
      setTimeout(() => (exportNotice = null), 6000);
    } finally {
      if (seqDirToClean) {
        await invoke("cleanup_temp_dir", { dirPath: seqDirToClean }).catch(
          () => {},
        );
      }
      isExportingClip = false;
    }
  }
</script>

<div class="telestration-studio">
  <!-- TOP STUDIO HEADER -->
  <header class="studio-header">
    <div class="header-left">
      <button
        class="btn-back"
        onclick={handleBackToTagging}
        title="Kembali ke Workspace Tagging"
      >
        <ArrowLeft size={15} />
        <span>Tagging</span>
      </button>

      {#if activeClip}
        <div class="clip-badge-info">
          <span
            class="clip-cat-badge"
            style="background-color: {activeClip.color}"
          >
            {activeClip.category}
          </span>
          <span class="clip-name-text" title={activeClip.title}
            >{activeClip.title}</span
          >
          <span class="clip-time-text">
            [{activeClip.startTime.toFixed(1)}s - {activeClip.endTime.toFixed(
              1,
            )}s]
          </span>
        </div>
      {/if}
    </div>

    <div class="header-right">
      <button
        class="btn-undo"
        onclick={undoLastDrawing}
        title="Batalkan gambar terakhir (Undo)"
      >
        <RotateCcw size={14} />
        <span>Undo</span>
      </button>
      <button
        class="btn-clear"
        onclick={clearAllDrawings}
        title="Hapus semua coretan"
      >
        <Trash2 size={14} />
        <span>Hapus</span>
      </button>
      <button
        class="btn-save"
        onclick={() => handleSave()}
        title="Simpan coretan telestrasi"
      >
        <Check size={14} />
        <span>Simpan</span>
      </button>
      <button
        class="btn-export-direct"
        onclick={handleDirectExportClip}
        disabled={isExportingClip}
        title="Ekspor klip ini dengan telestrasi terbakar ke format MP4"
      >
        <Download size={14} />
        <span>{isExportingClip ? "Merender..." : "Ekspor MP4"}</span>
      </button>
      <button
        class="btn-save-next"
        onclick={handleSaveAndNext}
        title="Simpan & Klip Berikutnya"
      >
        <span>Lanjut</span>
        <ArrowRight size={14} />
      </button>
    </div>
  </header>

  <!-- WORKSPACE BODY (LEFT: TOOLS PALETTE, CENTER: VIDEO & CANVAS, RIGHT: ELEMENTS INSPECTOR) -->
  <div class="studio-body">
    <!-- FLOATING TOOLS PALETTE -->
    <div class="tools-sidebar">
      <div class="palette-group-title">ALAT TELESTRASI ONCE SPORT</div>
      <div class="tools-list">
        {#each TOOLS as tool}
          <button
            class="tool-btn"
            class:active={activeTool === tool.id}
            onclick={() => (activeTool = tool.id)}
            title={tool.desc}
          >
            <tool.icon size={16} />
            <span class="tool-label">{tool.label}</span>
          </button>
        {/each}
      </div>

      <div class="palette-divider"></div>

      <!-- BROADCAST ONCE SPORT LAYERING & KEYFRAME TOGGLE -->
      <div class="palette-group-title">FITUR SIARAN (BROADCAST)</div>
      <label
        class="toggle-control-item"
        title="Pisahkan siluet pemain dari lantai agar grafis tertanam di bawah kaki pemain"
      >
        <input
          type="checkbox"
          bind:checked={projectStore.chromaFloorConfig.enabled}
          onchange={() => {
            if (
              projectStore.chromaFloorConfig.enabled &&
              (projectStore.chromaFloorConfig.mode ?? "ai-silhouette") ===
                "ai-silhouette" &&
              segModelAvailable &&
              !liveSilhouetteMask
            ) {
              triggerSilhouetteDetect(true);
            }
          }}
        />
        <span class="toggle-label">Grafis Di Bawah Kaki Pemain</span>
      </label>

      {#if projectStore.chromaFloorConfig.enabled}
        <div class="chroma-controls-box">
          <div class="floor-mode-tabs">
            <button
              type="button"
              class="floor-mode-btn"
              class:active={(projectStore.chromaFloorConfig.mode ??
                "ai-silhouette") === "ai-silhouette"}
              onclick={() => {
                projectStore.chromaFloorConfig.mode = "ai-silhouette";
                if (segModelAvailable && !liveSilhouetteMask) {
                  triggerSilhouetteDetect(true);
                }
              }}
            >
              AI Siluet
            </button>
            <button
              type="button"
              class="floor-mode-btn"
              class:active={projectStore.chromaFloorConfig.mode ===
                "chroma-key"}
              onclick={() =>
                (projectStore.chromaFloorConfig.mode = "chroma-key")}
            >
              Chroma-Key
            </button>
          </div>

          {#if (projectStore.chromaFloorConfig.mode ?? "ai-silhouette") === "ai-silhouette"}
            <button
              type="button"
              class="btn-chroma-cutout"
              disabled={isSegmentingMask}
              onclick={() => triggerSilhouetteDetect(false)}
              title="Pindai siluet pemain di frame ini ({segEngineLabel})"
            >
              <Scissors size={12} />
              <span
                >{isSegmentingMask
                  ? "Memproses Siluet..."
                  : liveSilhouetteMask
                    ? `Siluet AI (${liveSilhouetteMask.playerCount} Pemain)`
                    : "Scan Siluet Frame Ini"}</span
              >
            </button>
            <div class="ai-seg-tip">
              Memisahkan siluet pemain otomatis — kebal pantulan lampu parket
            </div>
          {:else}
            <div class="chroma-row">
              <button
                type="button"
                class="btn-chroma-sample"
                class:active={isSamplingFloor}
                onclick={() => {
                  isSamplingFloor = !isSamplingFloor;
                  if (isSamplingFloor) {
                    exportNotice =
                      "Klik area lantai lapangan pada video untuk kalibrasi warna.";
                  }
                }}
                title="Pipet warna lantai lapangan langsung dari video"
              >
                <Crosshair size={12} />
                <span
                  >{isSamplingFloor ? "Klik Lantai..." : "Pipet Lantai"}</span
                >
              </button>
              <span
                class="chroma-swatch"
                style="background-color: rgb({projectStore.chromaFloorConfig
                  .targetRgb[0]}, {projectStore.chromaFloorConfig
                  .targetRgb[1]}, {projectStore.chromaFloorConfig.targetRgb[2]});"
                title="Warna lantai terkalibrasi"
              ></span>
            </div>

            <div class="chroma-slider-row">
              <span>Toleransi: {projectStore.chromaFloorConfig.tolerance}</span>
              <input
                type="range"
                min="10"
                max="80"
                step="1"
                bind:value={projectStore.chromaFloorConfig.tolerance}
                class="pause-slider"
                style="width: 100%;"
              />
            </div>
            <div class="chroma-slider-row">
              <span>Feather: {projectStore.chromaFloorConfig.feather}</span>
              <input
                type="range"
                min="2"
                max="30"
                step="1"
                bind:value={projectStore.chromaFloorConfig.feather}
                class="pause-slider"
                style="width: 100%;"
              />
            </div>
            <button
              type="button"
              class="btn-chroma-cutout"
              disabled={isDetectingCutout}
              onclick={triggerCutoutDetect}
              title="Gunakan deteksi {aiEngineLabel} untuk mempertajam cutout kaki pemain"
            >
              <Scissors size={12} />
              <span
                >{isDetectingCutout
                  ? "Mendeteksi..."
                  : `Cutout AI (${liveDetectedBoxes.length})`}</span
              >
            </button>
          {/if}
        </div>
      {/if}

      <label
        class="toggle-control-item"
        title="Mode pencampuran grafis ke lantai lapangan (Screen Blend)"
      >
        <input type="checkbox" bind:checked={isFloorBlend} />
        <span class="toggle-label">Screen Blend (Cahaya Lantai)</span>
      </label>

      <label
        class="toggle-control-item"
        title="Aktifkan mode rekam keyframe gerakan pemain"
      >
        <input type="checkbox" bind:checked={isKeyframeMode} />
        <span class="toggle-label highlight-kf">Mode Gerak (Keyframes)</span>
      </label>

      <label
        class="toggle-control-item"
        title="Kalibrasi Lapangan Futsal 3D (Once Sport Homography)"
      >
        <input type="checkbox" bind:checked={isPitchCalibrated} />
        <span class="toggle-label highlight-homography"
          >Kalibrasi 3D (Homography)</span
        >
      </label>

      {#if isPitchCalibrated}
        <div class="homography-preset-box">
          <div class="preset-title">Preset Kamera:</div>
          <select
            class="preset-select"
            bind:value={activePresetKey}
            onchange={() => {
              if (CALIBRATION_PRESETS[activePresetKey]) {
                calibrationPoints = {
                  ...CALIBRATION_PRESETS[activePresetKey].points,
                };
                temporalCalibrationFrames = [];
              }
            }}
          >
            {#each Object.entries(CALIBRATION_PRESETS) as [key, val]}
              <option value={key}>{val.label}</option>
            {/each}
          </select>

          <button
            type="button"
            class="btn-chroma-cutout"
            disabled={isAutoCalibratingCourt || isTrackingPanningCourt}
            onclick={triggerAutoCourtCalibration}
            title="Deteksi otomatis 4 sudut garis lapangan dari frame video saat ini"
          >
            <Crosshair size={12} />
            <span
              >{isAutoCalibratingCourt
                ? "Mendeteksi Garis..."
                : "Auto-Kalibrasi Lapangan"}</span
            >
          </button>

          <button
            type="button"
            class="btn-chroma-sample"
            class:active={temporalCalibrationFrames.length > 0}
            disabled={isTrackingPanningCourt || isAutoCalibratingCourt}
            onclick={triggerPanningCalibrationTrack}
            title="Sinkronkan grid homography 3D mengikuti pergeseran kamera panning sepanjang klip"
          >
            <Activity size={12} />
            <span
              >{isTrackingPanningCourt
                ? "Melacak Panning..."
                : temporalCalibrationFrames.length > 0
                  ? `Panning Aktif (${temporalCalibrationFrames.length}F)`
                  : "Lacak Kamera Panning"}</span
            >
          </button>

          {#if temporalCalibrationFrames.length > 0}
            <button
              type="button"
              class="btn-reset-pan"
              onclick={() => (temporalCalibrationFrames = [])}
              title="Kembalikan kalibrasi 3D ke posisi statis"
            >
              Reset Panning (Statis)
            </button>
          {/if}

          <span class="preset-tip"
            >Tarik 4 pin biru (TL, TR, BR, BL) di layar atau gunakan Auto-Kalibrasi</span
          >
        </div>
      {/if}

      <div class="palette-divider"></div>

      <!-- AI MULTI-TRACKING TRIGGER -->
      <div class="palette-group-title">AI VISION ({aiEngineLabel})</div>
      <button
        class="tool-btn btn-ai"
        class:active={isPlayerPickMode}
        class:loading={isScanningPlayers}
        disabled={isScanningPlayers || isSingleTracking}
        onclick={scanPlayersInCurrentFrame}
        title="Deteksi semua pemain di frame ini lalu klik pemain untuk langsung menempel & melacak"
      >
        <Crosshair size={16} />
        <span class="tool-label"
          >{isScanningPlayers
            ? "Memindai Pemain..."
            : isPlayerPickMode
              ? "Scan Ulang Pemain (AI)"
              : "Deteksi & Pilih Pemain (AI)"}</span
        >
      </button>

      <button
        class="tool-btn btn-ai"
        class:loading={isMultiTracking}
        disabled={isMultiTracking}
        onclick={triggerAIMultiTracking}
        title="Deteksi 10 Pemain & Bola via {aiEngineLabel} di Rust"
      >
        <Users size={16} />
        <span class="tool-label"
          >{isMultiTracking ? "Memproses ONNX..." : "AI Detect 10 Pemain"}</span
        >
      </button>

      <div class="palette-divider"></div>

      <!-- COLOR PALETTE -->
      <div class="palette-group-title">WARNA GRAFIS</div>
      <div class="color-swatches">
        {#each PALETTE as color}
          <button
            class="swatch"
            style="background-color: {color}"
            class:selected={activeColor === color}
            onclick={() => {
              activeColor = color;
              if (selectedElement) {
                selectedElement.color = color;
                drawings = [...drawings];
              }
            }}
            aria-label="Pilih warna {color}"
            title="Warna: {color}"
          ></button>
        {/each}
      </div>
    </div>

    <!-- CANVAS & VIDEO VIEWER -->
    <div class="canvas-viewer-container" bind:this={videoContainer}>
      {#if !isFreezeActive}
        <div class="player-picker-bar">
          {#if isSingleTracking}
            <span class="picker-status-badge tracking">
              <Activity size={13} />
              <span>
                Melacak gerak pemain (AI ROI {trackDirection === "forward"
                  ? "Maju"
                  : "2-Arah"})...
              </span>
            </span>
          {:else if isPlayerPickMode}
            <span class="picker-status-badge" class:stale={isPickerStale}>
              <Crosshair size={13} />
              <span>
                {#if isPickerStale}
                  Frame berubah — klik "Scan Ulang" untuk memilih pemain di detik ini
                {:else}
                  {detectedFrameBoxes.length} Pemain Terdeteksi — Klik kotak pemain untuk tempel & lacak
                {/if}
              </span>
            </span>
            <button
              type="button"
              class="picker-action-btn"
              disabled={isScanningPlayers}
              onclick={scanPlayersInCurrentFrame}
            >
              {isScanningPlayers ? "Memindai..." : "Scan Ulang Frame"}
            </button>
            <button
              type="button"
              class="picker-close-btn"
              onclick={closePlayerPicker}
              title="Tutup AI Player Picker"
            >
              Tutup Picker
            </button>
          {:else}
            <button
              type="button"
              class="picker-launch-btn"
              disabled={isScanningPlayers}
              onclick={scanPlayersInCurrentFrame}
              title="Pindai pemain pada frame ini lalu klik pemain untuk melacak otomatis"
            >
              <Crosshair size={13} />
              <span>
                {isScanningPlayers
                  ? "Memindai Pemain (AI)..."
                  : "Deteksi & Pilih Pemain (AI)"}
              </span>
            </button>
          {/if}

          {#if !isSingleTracking}
            <div
              class="picker-dir-group"
              role="group"
              aria-label="Arah pelacakan AI"
            >
              <button
                type="button"
                class="picker-dir-btn"
                class:active={trackDirection === "both"}
                onclick={() => (trackDirection = "both")}
                title="Lacak ke belakang (awal klip) dan ke depan (akhir klip)"
              >
                2-Arah
              </button>
              <button
                type="button"
                class="picker-dir-btn"
                class:active={trackDirection === "forward"}
                onclick={() => (trackDirection = "forward")}
                title="Lacak hanya maju mulai dari detik sekarang"
              >
                Maju Saja
              </button>
            </div>

            {#if inProgressDrawing && (inProgressDrawing.type === "player-link" || inProgressDrawing.type === "pressing-zone" || inProgressDrawing.type === "compactness-hull")}
              <button
                type="button"
                class="picker-retrack-btn"
                onclick={finishInProgressMultiPoint}
                title="Selesaikan gambar multi-titik (bisa juga klik 2x atau tekan Enter)"
              >
                <Check size={12} />
                <span>Selesai Gambar ({inProgressDrawing.points.length} titik)</span>
              </button>
            {/if}

            {#if selectedElement}
              <button
                type="button"
                class="picker-hybrid-btn"
                class:active={isLiveStepTrack}
                onclick={toggleLiveStepTrack}
                title="Klik posisi pemain di video, otomatis maju +{liveStepInterval}s (Once Sport Hybrid)"
              >
                <Clock size={12} />
                <span>{isLiveStepTrack ? "Stop Step-Track" : `Step-Track (${liveStepInterval}s)`}</span>
              </button>

              <button
                type="button"
                class="picker-hybrid-btn"
                class:active={isLiveFollowDrag}
                onclick={toggleLiveFollowDrag}
                title="Tahan & seret mouse mengikuti pemain saat video diputar 0.5x"
              >
                <Activity size={12} />
                <span>{isLiveFollowDrag ? "Batal Ikuti 0.5x" : "Ikuti 0.5x"}</span>
              </button>
            {/if}

            {#if selectedElement && (selectedElement.manualPins?.length ?? 0) >= 2}
              <button
                type="button"
                class="picker-retrack-btn"
                onclick={() => triggerGuidedReTrack()}
                title="Lacak ulang secara akurat dengan mengunci semua pin koreksi"
              >
                <Activity size={12} />
                <span
                  >Re-Track Antar Pin ({selectedElement.manualPins?.length} Pin)</span
                >
              </button>
            {/if}
          {/if}
        </div>
      {/if}

      <div
        class="zoom-stage"
        style={activeCameraZoom
          ? `transform: scale(${activeCameraZoom.scale}); transform-origin: ${activeCameraZoom.x * 100}% ${activeCameraZoom.y * 100}%;`
          : ""}
      >
        {#if projectStore.videoSrc}
          <!-- svelte-ignore a11y_media_has_caption -->
          <video
            bind:this={videoEl}
            src={projectStore.videoSrc}
            crossorigin="anonymous"
            class="studio-video"
            onloadedmetadata={() => {
              if (videoEl && activeClip) {
                videoEl.currentTime = activeClip.startTime;
                duration = videoEl.duration || 120;
              }
              syncCanvasSize();
            }}
          ></video>
        {:else}
          <div class="mock-court-video">
            <div class="mock-tag-overlay">
              <h3>Kanvas Telestrasi Futsal (Tingkat Once Sport)</h3>
              <p>
                Klik dan seret kursor untuk menggambar 3D Spotlight, Panah
                Lengkung (Curved), atau Radar Visi di atas video.
              </p>
            </div>
          </div>
        {/if}

        <!-- INTERACTIVE OVERLAY CANVAS -->
        <canvas
          bind:this={canvasEl}
          class="telestrator-canvas"
          class:sampling={isSamplingFloor}
          class:picker-hover={hoveredPlayerBoxIdx !== null}
          class:live-record={isLiveStepTrack || isLiveFollowDrag}
          onpointerdown={handlePointerDown}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
          ondblclick={finishInProgressMultiPoint}
        ></canvas>
      </div>

      <!-- EXPORT NOTICE TOAST -->
      {#if exportNotice}
        <div class="export-notice-toast">
          <span>{exportNotice}</span>
        </div>
      {/if}

      <!-- BROADCAST FREEZE-FRAME COUNTDOWN OVERLAY -->
      {#if isFreezeActive}
        <div class="broadcast-freeze-hud">
          <div class="hud-badge-live">
            <span class="hud-pulse-dot"></span>
            <span>ON-AIR TELESTRASI</span>
          </div>

          <div class="hud-countdown-ring">
            <svg width="68" height="68" viewBox="0 0 68 68">
              <circle
                cx="34"
                cy="34"
                r="30"
                stroke="rgba(255, 255, 255, 0.15)"
                stroke-width="4"
                fill="rgba(11, 23, 42, 0.85)"
              />
              <circle
                cx="34"
                cy="34"
                r="30"
                stroke="#38bdf8"
                stroke-width="4"
                fill="none"
                stroke-dasharray="188.5"
                stroke-dashoffset={188.5 *
                  (1 -
                    Math.max(0, freezeRemaining) /
                      (pauseDuration > 0 ? pauseDuration : 3.0))}
                transform="rotate(-90 34 34)"
                stroke-linecap="round"
              />
              <text
                x="34"
                y="38"
                text-anchor="middle"
                fill="#38bdf8"
                font-size="12"
                font-weight="bold"
              >
                {Math.max(0, freezeRemaining).toFixed(1)}s
              </text>
            </svg>
          </div>

          <div class="hud-info-text">
            <h4>ANALISIS FREEZE-FRAME</h4>
            <p>Grafis taktik membeku selama {pauseDuration.toFixed(1)} detik</p>
          </div>

          <button class="btn-skip-freeze" onclick={resumeNow}>
            <span>Lanjut Video</span>
            <ArrowRight size={14} />
          </button>
        </div>
      {/if}
    </div>

    <!-- RIGHT: ONCE SPORT TAGGED CLIPS & ELEMENTS INSPECTOR DRAWER -->
    <div class="elements-sidebar">
      <div class="right-drawer-tabs" role="tablist" aria-label="Panel kanan telestrator">
        <button
          type="button"
          role="tab"
          aria-selected={rightPanelTab === "tags"}
          class="drawer-tab-btn"
          class:active={rightPanelTab === "tags"}
          onclick={() => (rightPanelTab = "tags")}
        >
          Tag Klip ({projectStore.tags.length})
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={rightPanelTab === "elements"}
          class="drawer-tab-btn"
          class:active={rightPanelTab === "elements"}
          onclick={() => (rightPanelTab = "elements")}
        >
          Elemen ({drawings.length})
        </button>
      </div>

      {#if rightPanelTab === "tags"}
        <div class="inspector-header">
          <span class="inspector-title">DAFTAR TAG VIDEO</span>
          <span class="kf-count-pill">{projectStore.tags.length} Klip</span>
        </div>

        <div class="tags-drawer-list">
          {#each projectStore.tags as tag (tag.id)}
            {@const isCurr = activeClip?.id === tag.id}
            {@const gfxCount = isCurr
              ? drawings.length
              : (tag.drawings?.length ?? 0)}
            <button
              type="button"
              class="tag-clip-card"
              class:active={isCurr}
              onclick={() => selectClipInTelestrator(tag)}
              title="Buka klip {tag.title} di Telestration Studio"
            >
              <span
                class="tag-clip-accent"
                style="background-color: {tag.color}"
              ></span>
              <div class="tag-clip-body">
                <div class="tag-clip-top">
                  <span
                    class="tag-cat-pill"
                    style="background-color: {tag.color}"
                  >
                    {tag.category}
                  </span>
                  <span
                    class="tag-gfx-badge"
                    class:has-gfx={gfxCount > 0}
                  >
                    {gfxCount > 0 ? `${gfxCount} grafis` : "Kosong"}
                  </span>
                </div>
                <div class="tag-clip-title">{tag.title}</div>
                <div class="tag-clip-meta">
                  <span class="tag-clip-time"
                    >{tag.startTime.toFixed(1)}s–{tag.endTime.toFixed(1)}s</span
                  >
                  {#if tag.playerLabel}
                    <span class="tag-clip-player">{tag.playerLabel}</span>
                  {/if}
                </div>
              </div>
            </button>
          {/each}

          {#if projectStore.tags.length === 0}
            <div class="empty-drawings">
              <p style="margin: 0 0 10px 0;">
                Belum ada Tag Video yang dibuat di proyek ini.
              </p>
              <button
                type="button"
                class="btn-kf-add"
                style="width: 100%; justify-content: center;"
                onclick={handleBackToTagging}
              >
                <ArrowLeft size={13} />
                <span>Kembali ke Tagging untuk Membuat Klip</span>
              </button>
            </div>
          {/if}
        </div>
      {:else}
        <div class="inspector-header">
          <span class="inspector-title">ELEMEN KLIP ({drawings.length})</span>
          {#if selectedElement}
            <button
              type="button"
              class="btn-delete-element"
              onclick={deleteSelectedElement}
              title="Hapus elemen terpilih"
            >
              <Trash2 size={13} />
            </button>
          {/if}
        </div>

      <!-- COACH VOICEOVER RECORDER -->
      <div class="voiceover-drawer-card">
        <VoiceoverRecorder
          existingAudioBase64={voiceoverAudio || undefined}
          onSaveVoiceover={(b64) => {
            voiceoverAudio = b64;
            if (activeClip) {
              activeClip.voiceoverAudioBase64 = b64;
              projectStore.updateTag({
                ...activeClip,
                voiceoverAudioBase64: b64,
              });
            }
          }}
          onClearVoiceover={() => {
            voiceoverAudio = null;
            if (activeClip) {
              activeClip.voiceoverAudioBase64 = undefined;
              projectStore.updateTag({
                ...activeClip,
                voiceoverAudioBase64: undefined,
              });
            }
          }}
        />
      </div>

      <!-- SELECTED ELEMENT PROPERTIES -->
      {#if selectedElement}
        <div class="element-property-panel">
          <div class="prop-badge">
            <span class="prop-type">{selectedElement.type.toUpperCase()}</span>
            <span class="prop-id">ID: {selectedElement.id.slice(-6)}</span>
          </div>

          <div class="prop-row">
            <label class="prop-label" for="prop-label-input"
              >Label / Nama:</label
            >
            <input
              id="prop-label-input"
              type="text"
              class="prop-input"
              bind:value={selectedElement.label}
              placeholder="#10 / Catatan..."
            />
          </div>

          <div class="prop-row">
            <span class="prop-label">Keyframes:</span>
            <span class="kf-count-pill">
              {selectedElement.keyframes ? selectedElement.keyframes.length : 0}
              titik gerak
            </span>
          </div>

          <!-- BROADCAST PRESET & CHROMA FLOOR -->
          <label class="prop-check-row">
            <input
              type="checkbox"
              bind:checked={selectedElement.isChromaFloor}
            />
            <span>Tempel Lantai (Chroma Floor)</span>
          </label>

          <div class="prop-row">
            <label class="prop-label" for="prop-anim-select"
              >Animasi Siaran (Broadcast):</label
            >
            <select
              id="prop-anim-select"
              class="preset-select"
              value={selectedElement.animationStyle || "none"}
              onchange={(e) => {
                if (!selectedElement) return;
                selectedElement.animationStyle = (
                  e.currentTarget as HTMLSelectElement
                ).value as BroadcastAnimationStyle;
                drawings = [...drawings];
              }}
            >
              <option value="none">Tanpa Animasi</option>
              <option value="fade">Fade In Halus</option>
              <option value="draw-on">Gambar Bertahap (Draw-On)</option>
              <option value="pulse">Denyut Radar (Pulse)</option>
            </select>
          </div>

          <div class="prop-row">
            <div class="prop-zoom-hdr">
              <label class="prop-check-row">
                <input
                  type="checkbox"
                  checked={Boolean(selectedElement.cameraZoomTarget)}
                  onchange={toggleCameraZoomOnSelected}
                />
                <span>Fokus Zoom Freeze</span>
              </label>
              {#if selectedElement.cameraZoomTarget}
                <span class="kf-count-pill"
                  >{selectedElement.cameraZoomTarget.scale.toFixed(2)}x</span
                >
              {/if}
            </div>
            {#if selectedElement.cameraZoomTarget}
              <input
                type="range"
                min="1.15"
                max="2.2"
                step="0.05"
                bind:value={selectedElement.cameraZoomTarget.scale}
                class="pause-slider"
                style="width: 100%;"
              />
            {/if}
          </div>

          {#if selectedElement.points.length >= 2}
            <div class="multipoint-box">
              <div class="preset-title">
                Multi-Point Tracking ({selectedElement.points.length} Titik)
              </div>
              <button
                type="button"
                class="btn-kf-add"
                style="width: 100%; justify-content: center;"
                onclick={triggerMultiPointTracking}
              >
                <Activity size={12} />
                <span>
                  {isMultiPointTracking
                    ? `Melacak Titik (${singleTrackProgress}%) - Batal`
                    : "Auto-Track Semua Titik"}
                </span>
              </button>

              {#if detectedTracks.length > 0}
                <button
                  type="button"
                  class="btn-chroma-sample"
                  style="width: 100%; justify-content: center;"
                  onclick={autoBindSelectedPointsToTracks}
                >
                  <Users size={12} />
                  <span>Auto-Ikat ke Pemain AI Terdekat</span>
                </button>
                {#each selectedElement.points as _, ptIdx}
                  <div class="mp-bind-row">
                    <span>Titik {ptIdx + 1}:</span>
                    <select
                      class="preset-select"
                      value={selectedElement.pointTrackIds?.[ptIdx] || ""}
                      onchange={(e) => {
                        if (!selectedElement) return;
                        bindTrackToPoint(
                          selectedElement,
                          ptIdx,
                          (e.currentTarget as HTMLSelectElement).value,
                        );
                      }}
                    >
                      <option value="">-- Statis --</option>
                      {#each detectedTracks as tr (tr.id)}
                        <option value={tr.id}>{tr.label}</option>
                      {/each}
                    </select>
                  </div>
                {/each}
              {/if}
            </div>
          {/if}

          {#if selectedElement.type === "spotlight-3d"}
            <div class="multipoint-box">
              <div class="preset-title">Ukuran 3D Spotlight (Once Sport)</div>
              <div class="chroma-slider-row">
                <span
                  >Radius Lantai: {(selectedElement.spotlightRadius ?? 1.0).toFixed(
                    2,
                  )}x</span
                >
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.05"
                  value={selectedElement.spotlightRadius ?? 1.0}
                  oninput={(e) => {
                    if (!selectedElement) return;
                    selectedElement.spotlightRadius = parseFloat(
                      (e.currentTarget as HTMLInputElement).value,
                    );
                    drawings = [...drawings];
                  }}
                  class="pause-slider"
                  style="width: 100%;"
                />
              </div>
              <div class="chroma-slider-row">
                <span
                  >Tinggi Sorotan: {(
                    selectedElement.spotlightHeight ?? 1.0
                  ).toFixed(2)}x</span
                >
                <input
                  type="range"
                  min="0.4"
                  max="2.0"
                  step="0.05"
                  disabled={Boolean(selectedElement.spotlightFullHeight)}
                  value={selectedElement.spotlightHeight ?? 1.0}
                  oninput={(e) => {
                    if (!selectedElement) return;
                    selectedElement.spotlightHeight = parseFloat(
                      (e.currentTarget as HTMLInputElement).value,
                    );
                    drawings = [...drawings];
                  }}
                  class="pause-slider"
                  style="width: 100%;"
                />
              </div>
              <label class="prop-check-row">
                <input
                  type="checkbox"
                  checked={Boolean(selectedElement.spotlightFullHeight)}
                  onchange={(e) => {
                    if (!selectedElement) return;
                    selectedElement.spotlightFullHeight = (
                      e.currentTarget as HTMLInputElement
                    ).checked;
                    drawings = [...drawings];
                  }}
                />
                <span>Tinggi Penuh (Full Height)</span>
              </label>
            </div>
          {/if}

          {#if selectedElement.type === "magnifier"}
            <div class="prop-row">
              <span class="prop-label"
                >Perbesaran Lensa: {(selectedElement.zoomScale || 1.8).toFixed(
                  1,
                )}x</span
              >
              <input
                type="range"
                min="1.2"
                max="3.0"
                step="0.1"
                bind:value={selectedElement.zoomScale}
                class="pause-slider"
              />
            </div>
          {/if}

          <!-- ONCE SPORT HYBRID LIVE KEYFRAME TRACKING -->
          <div class="multipoint-box">
            <div class="preset-title">
              Hybrid Live Keyframe (Anti-Lari · Kurva Halus)
            </div>
            <div class="hybrid-step-row">
              <button
                type="button"
                class="btn-hybrid-mode"
                class:active={isLiveStepTrack}
                onclick={toggleLiveStepTrack}
                title="Klik posisi pemain tiap langkah lalu video otomatis maju"
              >
                <Clock size={12} />
                <span>{isLiveStepTrack ? "Stop Step-Track" : "Step-Track"}</span>
              </button>
              <select
                class="preset-select"
                aria-label="Interval Step-Track"
                bind:value={liveStepInterval}
              >
                <option value={0.25}>+0.25s</option>
                <option value={0.5}>+0.50s</option>
                <option value={1.0}>+1.00s</option>
              </select>
            </div>

            <button
              type="button"
              class="btn-hybrid-mode"
              class:active={isLiveFollowDrag}
              onclick={toggleLiveFollowDrag}
              title="Tahan & seret mouse mengikuti pemain sambil video berputar 0.5x"
            >
              <Activity size={12} />
              <span>
                {isLiveFollowDrag
                  ? "Berhenti Ikuti 0.5x"
                  : "Ikuti Sambil Putar (0.5x)"}
              </span>
            </button>
          </div>

          <!-- KEYFRAME TOOLS -->
          <div class="keyframe-actions-wrap">
            <button
              class="btn-kf-add"
              onclick={handleAddCurrentKeyframe}
              title="Simpan titik posisi elemen pada detik sekarang"
            >
              <Plus size={13} />
              <span>Rekam KF ({currentTime.toFixed(2)}s)</span>
            </button>
            <button
              class="btn-kf-del"
              onclick={handleDeleteCurrentKeyframe}
              title="Hapus keyframe pada detik ini"
            >
              <Trash2 size={13} />
              <span>Hapus KF</span>
            </button>
          </div>

          <button
            type="button"
            class="btn-kf-add"
            style="width: 100%; justify-content: center; margin-top: 4px;"
            onclick={triggerSingleElementTracking}
            title="Lacak posisi elemen ini otomatis sepanjang klip (ROI YOLOX + Spatial NCC)"
          >
            <Activity size={13} />
            <span
              >{isSingleTracking
                ? `Melacak (${singleTrackProgress}%) - Klik Batal`
                : "Auto-Track Elemen Ini"}</span
            >
          </button>

          <button
            type="button"
            class="btn-guided-retrack"
            class:ready={(selectedElement.manualPins?.length ?? 0) >= 2}
            disabled={isSingleTracking}
            onclick={() => triggerGuidedReTrack()}
            title="Lacak ulang segmen antar pin koreksi agar shape tidak meleset saat bentrok"
          >
            <Crosshair size={13} />
            <span>
              Re-Track Antar Pin ({selectedElement.manualPins?.length ?? 0} Pin)
            </span>
          </button>

          <p class="guided-tip-note">
            Jika shape meleset saat pemain bentrok: geser shape ke pemain di frame
            itu, lalu klik Re-Track Antar Pin.
          </p>

          {#if lastTrackDiagnostics}
            <div class="track-diag-pill" title={lastTrackDiagnostics}>
              {lastTrackDiagnostics}
            </div>
          {/if}
        </div>
      {/if}

      <!-- DRAWINGS LIST -->
      <div class="drawings-list">
        {#each drawings as d}
          {@const visibleNow = isElementVisibleAtTime(d, currentTime)}
          {@const clipBase = activeClip ? activeClip.startTime : 0}
          {@const clipMax = activeClip ? activeClip.endTime : duration}
          {@const hasTrim =
            (typeof d.timeStart === "number" && d.timeStart > clipBase + 0.05) ||
            (typeof d.timeEnd === "number" && d.timeEnd < clipMax - 0.05)}
          {@const relS = Math.max(0, (d.timeStart ?? clipBase) - clipBase)}
          {@const relE = Math.max(relS + 0.1, (d.timeEnd ?? clipMax) - clipBase)}
          <div
            class="drawing-item"
            class:selected={d.id === selectedElementId}
            class:out-of-range={!visibleNow}
            onclick={() => (selectedElementId = d.id)}
            role="button"
            tabindex="0"
            onkeydown={(e) => {
              if (e.key === "Enter") selectedElementId = d.id;
            }}
          >
            <div class="drawing-item-left">
              <span class="item-color-pill" style="background-color: {d.color}"
              ></span>
              <span class="item-type-name">{d.label || (d.type === "player-circle" ? "Lingkaran Pemain" : d.type)}</span>
            </div>
            <div class="drawing-item-right">
              {#if hasTrim}
                <span class="lifespan-pill" title="Rentang waktu tampil elemen ini"
                  >{relS.toFixed(1)}–{relE.toFixed(1)}s</span
                >
              {/if}
              {#if d.keyframes && d.keyframes.length > 0}
                <span class="kf-badge">⬥ {d.keyframes.length}</span>
              {/if}
            </div>
          </div>
        {/each}

        {#if drawings.length === 0}
          <div class="empty-drawings">
            <span
              >Belum ada grafis telestrasi. Pilih alat di sebelah kiri dan
              gambar di atas video.</span
            >
          </div>
        {/if}
      </div>
      {/if}
    </div>
  </div>

  <!-- MINI VIDEO TRANSPORT SCRUBBER & KEYFRAME BAR -->
  <div class="studio-scrubber-bar">
    <div class="transport-controls">
      <button
        class="btn-transport"
        onclick={jumpToClipStart}
        title="Lompat ke Awal Klip"
      >
        <SkipBack size={14} />
      </button>
      <button
        class="btn-transport"
        onclick={() => stepFrame(-1)}
        title="Mundur 1 Frame (-0.04s)"
      >
        -1F
      </button>
      <button
        class="btn-transport btn-play"
        onclick={togglePlay}
        title={isPlaying ? "Jeda" : "Putar"}
      >
        {#if isPlaying}
          <Pause size={15} />
        {:else}
          <Play size={15} />
        {/if}
      </button>
      <button
        class="btn-transport"
        onclick={() => stepFrame(1)}
        title="Maju 1 Frame (+0.04s)"
      >
        +1F
      </button>
      <button
        class="btn-transport"
        onclick={jumpToClipEnd}
        title="Lompat ke Akhir Klip"
      >
        <SkipForward size={14} />
      </button>

      <span class="timecode-display">
        {currentTime.toFixed(2)}s / {(activeClip
          ? activeClip.endTime
          : duration
        ).toFixed(2)}s
      </span>
    </div>

    <!-- SCRUBBER SLIDER WITH KEYFRAME PIPS -->
    <div class="scrubber-track-container">
      <input
        type="range"
        min={activeClip ? activeClip.startTime : 0}
        max={activeClip ? activeClip.endTime : duration}
        step="0.033"
        value={currentTime}
        oninput={handleScrub}
        class="video-scrubber-slider"
      />

      <!-- KEYFRAME DIAMOND MARKERS FOR SELECTED ELEMENT -->
      {#if selectedElement && selectedElement.keyframes && activeClip}
        <div class="keyframe-pips-overlay">
          {#each selectedElement.keyframes as kf}
            {@const clipStart = activeClip.startTime}
            {@const clipDur = activeClip.endTime - activeClip.startTime || 1}
            {@const pct = Math.max(
              0,
              Math.min(100, ((kf.time - clipStart) / clipDur) * 100),
            )}
            <button
              class="kf-diamond-pip"
              style="left: {pct}%"
              onclick={() => {
                currentTime = kf.time;
                if (videoEl) videoEl.currentTime = kf.time;
              }}
              title="Keyframe di {kf.time.toFixed(2)}s"
            >
              ⬥
            </button>
          {/each}
          {#if selectedElement.manualPins}
            {#each selectedElement.manualPins as pin}
              {@const clipStart = activeClip.startTime}
              {@const clipDur = activeClip.endTime - activeClip.startTime || 1}
              {@const pinPct = Math.max(
                0,
                Math.min(100, ((pin.time - clipStart) / clipDur) * 100),
              )}
              <button
                type="button"
                class="kf-pin-pip"
                style="left: {pinPct}%"
                onclick={() => {
                  currentTime = pin.time;
                  if (videoEl) videoEl.currentTime = pin.time;
                }}
                title="Pin Koreksi Terkunci di {pin.time.toFixed(2)}s"
              >
                ◆
              </button>
            {/each}
          {/if}
        </div>
      {/if}
    </div>
  </div>

  {#if drawings.length > 0 && activeClip}
    <TelestrationElementTimeline
      {drawings}
      {selectedElementId}
      clipStart={activeClip.startTime}
      clipEnd={activeClip.endTime}
      {currentTime}
      onSelect={(id) => {
        selectedElementId = id;
        rightPanelTab = "elements";
      }}
      onChangeLifespan={updateElementLifespan}
      onResetLifespan={resetElementLifespan}
      onSeek={(t) => {
        currentTime = t;
        if (videoEl) videoEl.currentTime = t;
      }}
    />
  {/if}

  <!-- BOTTOM FREEZE DURATION & PREVIEW BAR -->
  <footer class="studio-footer">
    <div class="footer-left">
      <button class="btn-preview" onclick={triggerPreview}>
        <Play size={16} />
        <span>
          {pauseDuration < 0.2
            ? "Preview Tracking Penuh (Tanpa Freeze)"
            : `Preview Siaran Broadcast (Jeda ${pauseDuration.toFixed(1)}s)`}
        </span>
      </button>
    </div>

    <div class="footer-center">
      <div class="pause-slider-wrap">
        <Clock size={15} />
        <span class="slider-label">Durasi Jeda Freeze-Frame:</span>
        <input
          type="range"
          min="0"
          max="8"
          step="0.5"
          bind:value={pauseDuration}
          class="pause-slider"
        />
        <span class="slider-val">
          {pauseDuration < 0.2
            ? "Tanpa Freeze (Full Gerak)"
            : `${pauseDuration.toFixed(1)} Detik`}
        </span>
      </div>
    </div>

    <div class="footer-right">
      <span class="info-note"
        >{aiEngineLabel} AI Tracking & FFmpeg Broadcast Burn-In (.futsal)</span
      >
    </div>
  </footer>
</div>

<style>
  .telestration-studio {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    background-color: #060b14;
    color: #f8fafc;
    overflow: hidden;
  }

  /* HEADER */
  .studio-header {
    min-height: 48px;
    height: auto;
    background: linear-gradient(180deg, #0d1e38 0%, #091528 100%);
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    gap: 10px;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 10px;
    min-width: 0;
    flex: 1;
    overflow: hidden;
  }

  .btn-back {
    display: flex;
    align-items: center;
    gap: 5px;
    background: rgba(14, 30, 56, 0.6);
    border: 1px solid #1a355d;
    color: #93c5fd;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-back:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.12);
  }

  .clip-badge-info {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
    overflow: hidden;
  }

  .clip-cat-badge {
    font-size: 9px;
    font-weight: 800;
    color: #ffffff;
    padding: 2px 8px;
    border-radius: 4px;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .clip-name-text {
    font-size: 13px;
    font-weight: 700;
    color: #f1f5f9;
    max-width: 240px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .clip-time-text {
    font-family: monospace;
    font-size: 11px;
    color: #38bdf8;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .header-right {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .btn-undo {
    display: flex;
    align-items: center;
    gap: 5px;
    background: #0f2444;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-undo:hover {
    color: #ffffff;
    border-color: #38bdf8;
    background: #163666;
  }

  .btn-clear {
    display: flex;
    align-items: center;
    gap: 5px;
    background: transparent;
    border: 1px solid #7f1d1d;
    color: #ef4444;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-clear:hover {
    background-color: rgba(239, 68, 68, 0.15);
  }

  .btn-save {
    display: flex;
    align-items: center;
    gap: 5px;
    background-color: #0d1e38;
    border: 1px solid #1a355d;
    color: #93c5fd;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-save:hover {
    background-color: #142a4d;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-export-direct {
    display: flex;
    align-items: center;
    gap: 5px;
    background: linear-gradient(135deg, #059669, #047857);
    color: #ffffff;
    border: none;
    padding: 5px 11px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.3);
    transition: all 0.2s;
  }

  .btn-export-direct:hover:not(:disabled) {
    background: linear-gradient(135deg, #047857, #065f46);
    box-shadow: 0 0 16px rgba(16, 185, 129, 0.5);
    transform: translateY(-1px);
  }

  .btn-export-direct:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  .btn-save-next {
    display: flex;
    align-items: center;
    gap: 5px;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    border: none;
    padding: 5px 12px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(56, 189, 248, 0.35);
    transition: all 0.2s;
  }

  .btn-save-next:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
    box-shadow: 0 0 18px rgba(56, 189, 248, 0.55);
    transform: translateY(-1px);
  }

  /* STUDIO BODY */
  .studio-body {
    flex: 1;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  /* TOOLS SIDEBAR */
  .tools-sidebar {
    width: 220px;
    background: linear-gradient(180deg, #0b172a 0%, #07101e 100%);
    border-right: 1px solid #1a355d;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    flex-shrink: 0;
    overflow-y: auto;
  }

  .palette-group-title {
    font-size: 9px;
    font-weight: 800;
    letter-spacing: 0.08em;
    color: #93c5fd;
    margin-bottom: 2px;
  }

  .tools-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tool-btn {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #0c1a33;
    border: 1px solid #1b365f;
    color: #cbd5e1;
    padding: 7px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    cursor: pointer;
    text-align: left;
    transition: all 0.15s;
  }

  .tool-btn:hover {
    background-color: #142a4d;
    color: #ffffff;
    border-color: #38bdf8;
  }

  .tool-btn.active {
    background: linear-gradient(
      135deg,
      rgba(2, 132, 199, 0.35),
      rgba(37, 99, 235, 0.45)
    );
    border-color: #38bdf8;
    color: #38bdf8;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.25);
  }

  .toggle-control-item {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 8px;
    background: #0c1a33;
    border: 1px solid #1b365f;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    color: #cbd5e1;
    transition: all 0.15s;
  }

  .toggle-control-item:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .toggle-label.highlight-kf {
    color: #f59e0b;
    font-weight: 700;
  }

  .toggle-label.highlight-homography {
    color: #38bdf8;
    font-weight: 700;
  }

  .homography-preset-box {
    background: #07101e;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 2px;
  }

  .preset-title {
    font-size: 9px;
    font-weight: 700;
    color: #93c5fd;
    text-transform: uppercase;
  }

  .preset-select {
    background: #0b172a;
    border: 1px solid #1e3b68;
    color: #f8fafc;
    font-size: 10px;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .preset-tip {
    font-size: 9px;
    color: #64748b;
    line-height: 1.3;
  }

  .btn-reset-pan {
    background: #0b192e;
    border: 1px solid #334155;
    color: #94a3b8;
    font-size: 9.5px;
    font-weight: 700;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-reset-pan:hover {
    border-color: #f59e0b;
    color: #fde68a;
  }

  .export-notice-toast {
    position: absolute;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(15, 23, 42, 0.95);
    border: 1px solid #38bdf8;
    box-shadow: 0 0 20px rgba(56, 189, 248, 0.4);
    color: #38bdf8;
    font-size: 12px;
    font-weight: 700;
    padding: 8px 18px;
    border-radius: 8px;
    z-index: 30;
    pointer-events: none;
    animation: fadeInToast 0.2s ease-out;
  }

  @keyframes fadeInToast {
    from {
      opacity: 0;
      transform: translate(-50%, 10px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  .btn-ai {
    background: linear-gradient(
      135deg,
      rgba(16, 185, 129, 0.15),
      rgba(6, 78, 59, 0.35)
    );
    border-color: rgba(16, 185, 129, 0.4);
    color: #34d399;
  }

  .btn-ai:hover {
    background: linear-gradient(
      135deg,
      rgba(16, 185, 129, 0.25),
      rgba(6, 78, 59, 0.45)
    );
    border-color: #10b981;
    color: #ffffff;
  }

  .palette-divider {
    height: 1px;
    background-color: #1a355d;
    margin: 4px 0;
  }

  .color-swatches {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 6px;
  }

  .swatch {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
    transition: transform 0.1s;
  }

  .swatch:hover {
    transform: scale(1.15);
  }

  .swatch.selected {
    border-color: #ffffff;
    box-shadow: 0 0 8px rgba(255, 255, 255, 0.5);
  }

  /* CANVAS VIEWER */
  .canvas-viewer-container {
    flex: 1;
    position: relative;
    background-color: #02050a;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .studio-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .mock-court-video {
    width: 100%;
    height: 100%;
    background: radial-gradient(circle at center, #0f2444 0%, #060b14 80%);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .mock-tag-overlay {
    text-align: center;
    color: #64748b;
    max-width: 450px;
    pointer-events: none;
  }

  .mock-tag-overlay h3 {
    font-size: 16px;
    font-weight: 700;
    color: #38bdf8;
    margin: 0 0 6px 0;
  }

  .mock-tag-overlay p {
    font-size: 12px;
    line-height: 1.5;
    margin: 0;
    color: #94a3b8;
  }

  .telestrator-canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    cursor: crosshair;
    z-index: 10;
  }

  /* BROADCAST FREEZE HUD OVERLAY */
  .broadcast-freeze-hud {
    position: absolute;
    top: 20px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(11, 23, 42, 0.92);
    border: 1px solid #0284c7;
    backdrop-filter: blur(10px);
    box-shadow: 0 0 24px rgba(2, 132, 199, 0.45);
    border-radius: 12px;
    padding: 10px 18px;
    display: flex;
    align-items: center;
    gap: 16px;
    z-index: 20;
    animation: fadeInHud 0.2s ease-out;
  }

  @keyframes fadeInHud {
    from {
      opacity: 0;
      transform: translate(-50%, -10px);
    }
    to {
      opacity: 1;
      transform: translate(-50%, 0);
    }
  }

  .hud-badge-live {
    display: flex;
    align-items: center;
    gap: 6px;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid #ef4444;
    color: #f87171;
    font-size: 10px;
    font-weight: 800;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .hud-pulse-dot {
    width: 7px;
    height: 7px;
    background-color: #ef4444;
    border-radius: 50%;
    animation: hudBlink 1s infinite;
  }

  @keyframes hudBlink {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.3;
    }
  }

  .hud-countdown-ring {
    width: 68px;
    height: 68px;
  }

  .hud-info-text h4 {
    margin: 0;
    font-size: 12px;
    font-weight: 800;
    color: #38bdf8;
    letter-spacing: 0.05em;
  }

  .hud-info-text p {
    margin: 2px 0 0 0;
    font-size: 11px;
    color: #94a3b8;
  }

  .btn-skip-freeze {
    display: flex;
    align-items: center;
    gap: 6px;
    background: #0284c7;
    border: none;
    color: #ffffff;
    font-size: 11px;
    font-weight: 700;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-skip-freeze:hover {
    background: #0369a1;
  }

  /* RIGHT ELEMENTS INSPECTOR SIDEBAR */
  .elements-sidebar {
    width: 220px;
    background: linear-gradient(180deg, #0b172a 0%, #07101e 100%);
    border-left: 1px solid #1a355d;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
    flex-shrink: 0;
    overflow-y: auto;
  }

  .voiceover-drawer-card {
    margin-bottom: 2px;
  }

  .inspector-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 10px;
    font-weight: 800;
    color: #93c5fd;
    letter-spacing: 0.06em;
  }

  .btn-delete-element {
    background: transparent;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 4px;
  }

  .btn-delete-element:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .element-property-panel {
    background: #0c1a33;
    border: 1px solid #1e3b68;
    border-radius: 8px;
    padding: 10px;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .prop-badge {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .prop-type {
    font-size: 9px;
    font-weight: 800;
    color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
    padding: 2px 6px;
    border-radius: 4px;
  }

  .prop-id {
    font-size: 9px;
    color: #64748b;
    font-family: monospace;
  }

  .prop-row {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .prop-label {
    font-size: 10px;
    font-weight: 600;
    color: #94a3b8;
  }

  .prop-input {
    background: #07101e;
    border: 1px solid #1b365f;
    border-radius: 4px;
    color: #f8fafc;
    font-size: 11px;
    padding: 4px 8px;
  }

  .prop-input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .kf-count-pill {
    font-size: 10px;
    font-weight: 700;
    color: #f59e0b;
    font-family: monospace;
  }

  .keyframe-actions-wrap {
    display: flex;
    gap: 6px;
    margin-top: 4px;
  }

  .btn-kf-add {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 4px;
    background: #142a4d;
    border: 1px solid #2563eb;
    color: #93c5fd;
    font-size: 10px;
    font-weight: 700;
    padding: 5px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-kf-add:hover {
    background: #1e3b68;
    color: #ffffff;
  }

  .btn-kf-del {
    display: flex;
    align-items: center;
    gap: 4px;
    background: transparent;
    border: 1px solid #7f1d1d;
    color: #f87171;
    font-size: 10px;
    padding: 5px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .btn-kf-del:hover {
    background: rgba(239, 68, 68, 0.2);
  }

  .drawings-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
    overflow-y: auto;
  }

  .drawing-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 8px;
    background: #0c1a33;
    border: 1px solid #1b365f;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .drawing-item:hover {
    border-color: #38bdf8;
    background: #122442;
  }

  .drawing-item.selected {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.15);
  }

  .drawing-item.out-of-range:not(.selected) {
    opacity: 0.55;
  }

  .drawing-item-left {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .drawing-item-right {
    display: flex;
    align-items: center;
    gap: 4px;
  }

  .item-color-pill {
    width: 8px;
    height: 8px;
    border-radius: 50%;
  }

  .item-type-name {
    font-size: 11px;
    color: #cbd5e1;
    font-weight: 600;
  }

  .lifespan-pill {
    font-family: monospace;
    font-size: 9px;
    font-weight: 700;
    color: #7dd3fc;
    background: rgba(56, 189, 248, 0.12);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .kf-badge {
    font-size: 9px;
    font-weight: 800;
    color: #f59e0b;
    background: rgba(245, 158, 11, 0.15);
    padding: 1px 4px;
    border-radius: 3px;
  }

  .empty-drawings {
    font-size: 11px;
    color: #64748b;
    text-align: center;
    padding: 20px 8px;
    line-height: 1.4;
  }

  /* SCRUBBER & TRANSPORT BAR */
  .studio-scrubber-bar {
    height: 48px;
    background: #081224;
    border-top: 1px solid #1a355d;
    display: flex;
    align-items: center;
    padding: 0 16px;
    gap: 16px;
    flex-shrink: 0;
  }

  .transport-controls {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-transport {
    background: #0f2444;
    border: 1px solid #1e3b68;
    color: #93c5fd;
    padding: 4px 8px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    cursor: pointer;
    display: flex;
    align-items: center;
    justify-content: center;
    min-width: 28px;
    height: 28px;
  }

  .btn-transport:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-play {
    background: #0284c7;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .timecode-display {
    font-family: monospace;
    font-size: 11px;
    font-weight: 700;
    color: #38bdf8;
    margin-left: 6px;
    white-space: nowrap;
  }

  .scrubber-track-container {
    flex: 1;
    position: relative;
    display: flex;
    align-items: center;
  }

  .video-scrubber-slider {
    width: 100%;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .keyframe-pips-overlay {
    position: absolute;
    top: 50%;
    left: 0;
    right: 0;
    transform: translateY(-50%);
    pointer-events: none;
    height: 100%;
  }

  .kf-diamond-pip {
    position: absolute;
    top: 50%;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    background: transparent;
    border: none;
    color: #f59e0b;
    font-size: 14px;
    font-weight: bold;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    filter: drop-shadow(0 0 4px #f59e0b);
  }

  /* FOOTER */
  .studio-footer {
    min-height: 46px;
    height: auto;
    background: linear-gradient(180deg, #091528 0%, #0d1e38 100%);
    border-top: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    gap: 12px;
    box-sizing: border-box;
    flex-shrink: 0;
  }

  .footer-left {
    display: flex;
    align-items: center;
    flex-shrink: 0;
  }

  .btn-preview {
    display: flex;
    align-items: center;
    gap: 8px;
    background: linear-gradient(135deg, #059669, #047857);
    color: #ffffff;
    border: none;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.35);
  }

  .btn-preview:hover {
    background: linear-gradient(135deg, #047857, #065f46);
  }

  .footer-center {
    display: flex;
    align-items: center;
  }

  .pause-slider-wrap {
    display: flex;
    align-items: center;
    gap: 10px;
    background-color: #0c1a33;
    border: 1px solid #1e3b68;
    padding: 5px 12px;
    border-radius: 8px;
    color: #38bdf8;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .slider-label {
    font-size: 11px;
    font-weight: 600;
    color: #e2e8f0;
  }

  .pause-slider {
    width: 140px;
    accent-color: #38bdf8;
    cursor: pointer;
  }

  .slider-val {
    font-size: 12px;
    font-weight: 800;
    font-family: monospace;
    color: #38bdf8;
    min-width: 60px;
  }

  .footer-right {
    font-size: 11px;
    color: #64748b;
    min-width: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  @media (max-width: 1220px) {
    .footer-right,
    .info-note {
      display: none;
    }
  }

  .zoom-stage {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .telestrator-canvas.sampling {
    cursor: cell;
  }

  .telestrator-canvas.picker-hover {
    cursor: pointer;
  }

  .telestrator-canvas.live-record {
    cursor: crosshair;
    outline: 2px dashed rgba(16, 185, 129, 0.75);
    outline-offset: -2px;
  }

  .picker-hybrid-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0f2444;
    border: 1px solid #2563eb;
    color: #93c5fd;
    font-size: 10.5px;
    font-weight: 700;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .picker-hybrid-btn:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .picker-hybrid-btn.active {
    background: linear-gradient(135deg, #059669, #10b981);
    border-color: #34d399;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.45);
  }

  .right-drawer-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
    background: #07101e;
    border: 1px solid #1a355d;
    border-radius: 7px;
    padding: 3px;
    flex-shrink: 0;
  }

  .drawer-tab-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 5px 6px;
    border-radius: 5px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .drawer-tab-btn:hover {
    color: #ffffff;
  }

  .drawer-tab-btn.active {
    background: linear-gradient(135deg, #0284c7, #1d4ed8);
    color: #ffffff;
    box-shadow: 0 0 8px rgba(56, 189, 248, 0.25);
  }

  .tags-drawer-list {
    display: flex;
    flex-direction: column;
    gap: 6px;
    overflow-y: auto;
    flex: 1;
    min-height: 0;
  }

  .tag-clip-card {
    display: flex;
    align-items: stretch;
    width: 100%;
    text-align: left;
    background: #0c1a33;
    border: 1px solid #1b365f;
    border-radius: 7px;
    overflow: hidden;
    cursor: pointer;
    padding: 0;
    transition: all 0.15s;
    flex-shrink: 0;
  }

  .tag-clip-card:hover {
    border-color: #38bdf8;
    background: #122442;
  }

  .tag-clip-card.active {
    border-color: #38bdf8;
    background: rgba(56, 189, 248, 0.16);
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.22);
  }

  .tag-clip-accent {
    width: 4px;
    flex-shrink: 0;
  }

  .tag-clip-body {
    flex: 1;
    min-width: 0;
    padding: 7px 8px;
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .tag-clip-top {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
  }

  .tag-cat-pill {
    font-size: 8.5px;
    font-weight: 800;
    color: #ffffff;
    padding: 1px 6px;
    border-radius: 3px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 110px;
  }

  .tag-gfx-badge {
    font-size: 9px;
    font-weight: 700;
    color: #64748b;
    white-space: nowrap;
  }

  .tag-gfx-badge.has-gfx {
    color: #38bdf8;
  }

  .tag-clip-title {
    font-size: 11px;
    font-weight: 700;
    color: #f1f5f9;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .tag-clip-meta {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 9.5px;
  }

  .tag-clip-time {
    font-family: monospace;
    color: #38bdf8;
    font-weight: 700;
  }

  .tag-clip-player {
    color: #cbd5e1;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .hybrid-step-row {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .hybrid-step-row .btn-hybrid-mode {
    flex: 1;
  }

  .btn-hybrid-mode {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    padding: 5px 8px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    background: #0f2444;
    border: 1px solid #2563eb;
    color: #93c5fd;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-hybrid-mode:hover {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-hybrid-mode.active {
    background: linear-gradient(135deg, #059669, #10b981);
    border-color: #34d399;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.35);
  }

  .player-picker-bar {
    position: absolute;
    top: 12px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 25;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
    justify-content: center;
    max-width: calc(100% - 24px);
    padding: 5px 10px;
    border-radius: 999px;
    background: rgba(8, 18, 36, 0.88);
    border: 1px solid rgba(56, 189, 248, 0.45);
    backdrop-filter: blur(8px);
    box-shadow: 0 6px 20px rgba(0, 0, 0, 0.45);
  }

  .picker-launch-btn,
  .picker-action-btn,
  .picker-close-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    border-radius: 999px;
    font-size: 11px;
    font-weight: 700;
    padding: 4px 10px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .picker-launch-btn {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.25), rgba(2, 132, 199, 0.35));
    border: 1px solid #10b981;
    color: #ecfdf5;
  }

  .picker-launch-btn:hover:not(:disabled) {
    background: linear-gradient(135deg, rgba(16, 185, 129, 0.4), rgba(2, 132, 199, 0.5));
  }

  .picker-action-btn {
    background: #0284c7;
    border: 1px solid #38bdf8;
    color: #ffffff;
  }

  .picker-action-btn:hover:not(:disabled) {
    background: #0369a1;
  }

  .picker-close-btn {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid #334155;
    color: #cbd5e1;
  }

  .picker-close-btn:hover {
    border-color: #ef4444;
    color: #fca5a5;
  }

  .picker-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    font-weight: 700;
    color: #38bdf8;
    padding: 0 4px;
  }

  .picker-status-badge.stale {
    color: #f59e0b;
  }

  .picker-status-badge.tracking {
    color: #10b981;
  }

  .picker-dir-group {
    display: inline-flex;
    align-items: center;
    background: #07101e;
    border: 1px solid #1e3b68;
    border-radius: 999px;
    padding: 2px;
    gap: 2px;
  }

  .picker-dir-btn {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 3px 8px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .picker-dir-btn:hover {
    color: #ffffff;
  }

  .picker-dir-btn.active {
    background: #0284c7;
    color: #ffffff;
  }

  .picker-retrack-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: linear-gradient(135deg, #059669, #10b981);
    border: 1px solid #34d399;
    color: #ffffff;
    font-size: 10.5px;
    font-weight: 800;
    padding: 4px 10px;
    border-radius: 999px;
    cursor: pointer;
    white-space: nowrap;
    box-shadow: 0 0 12px rgba(16, 185, 129, 0.35);
  }

  .picker-retrack-btn:hover {
    filter: brightness(1.08);
  }

  .btn-guided-retrack {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    margin-top: 4px;
    padding: 5px 8px;
    border-radius: 5px;
    font-size: 10px;
    font-weight: 700;
    background: #0f2444;
    border: 1px solid #1e4d7e;
    color: #93c5fd;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-guided-retrack.ready {
    background: linear-gradient(135deg, rgba(5, 150, 105, 0.35), rgba(16, 185, 129, 0.45));
    border-color: #10b981;
    color: #ecfdf5;
    box-shadow: 0 0 10px rgba(16, 185, 129, 0.25);
  }

  .btn-guided-retrack:hover:not(:disabled) {
    border-color: #34d399;
    color: #ffffff;
  }

  .guided-tip-note {
    margin: 4px 0 0 0;
    font-size: 9.5px;
    line-height: 1.35;
    color: #94a3b8;
  }

  .track-diag-pill {
    margin-top: 4px;
    padding: 4px 6px;
    border-radius: 4px;
    background: rgba(2, 132, 199, 0.14);
    border: 1px solid rgba(56, 189, 248, 0.3);
    color: #7dd3fc;
    font-size: 9.5px;
    font-family: monospace;
    line-height: 1.3;
    word-break: break-word;
  }

  .kf-pin-pip {
    position: absolute;
    top: 22%;
    transform: translate(-50%, -50%);
    pointer-events: auto;
    background: transparent;
    border: none;
    color: #10b981;
    font-size: 14px;
    font-weight: 900;
    cursor: pointer;
    padding: 0;
    line-height: 1;
    filter: drop-shadow(0 0 5px #10b981);
    z-index: 2;
  }

  .chroma-controls-box {
    background: #07101e;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 7px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .floor-mode-tabs {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 4px;
  }

  .floor-mode-btn {
    background: #0b192e;
    border: 1px solid #1a355d;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 700;
    padding: 4px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .floor-mode-btn.active {
    background: #12315a;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .ai-seg-tip {
    font-size: 9px;
    line-height: 1.3;
    color: #7dd3fc;
  }

  .chroma-row {
    display: flex;
    align-items: center;
    gap: 6px;
  }

  .btn-chroma-sample,
  .btn-chroma-cutout {
    flex: 1;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 5px;
    background: #0f2444;
    border: 1px solid #1e4d7e;
    color: #93c5fd;
    font-size: 10px;
    font-weight: 700;
    padding: 5px 7px;
    border-radius: 5px;
    cursor: pointer;
  }

  .btn-chroma-sample.active,
  .btn-chroma-sample:hover,
  .btn-chroma-cutout:hover:not(:disabled) {
    border-color: #38bdf8;
    color: #ffffff;
    background: #14335e;
  }

  .chroma-swatch {
    width: 22px;
    height: 22px;
    border-radius: 4px;
    border: 1px solid rgba(255, 255, 255, 0.45);
    flex-shrink: 0;
  }

  .chroma-slider-row {
    display: flex;
    flex-direction: column;
    gap: 2px;
    font-size: 9.5px;
    color: #94a3b8;
  }

  .prop-check-row {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 10px;
    font-weight: 600;
    color: #cbd5e1;
    cursor: pointer;
  }

  .prop-zoom-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .multipoint-box {
    background: #07101e;
    border: 1px solid #1b365f;
    border-radius: 6px;
    padding: 7px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .mp-bind-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    font-size: 9.5px;
    color: #94a3b8;
  }

  .mp-bind-row .preset-select {
    flex: 1;
    min-width: 0;
  }

  @media (max-width: 1180px) {
    .tools-sidebar,
    .elements-sidebar {
      width: 192px;
      padding: 10px;
    }
  }

  @media (max-width: 960px) {
    .telestration-studio {
      overflow-y: auto;
      height: auto;
      min-height: 100%;
    }

    .studio-header,
    .studio-scrubber-bar {
      flex-wrap: wrap;
      height: auto;
      padding: 8px 10px;
      gap: 6px;
    }

    .studio-body {
      flex-direction: column;
      overflow: visible;
    }

    .canvas-viewer-container {
      order: 1;
      width: 100%;
      min-height: 300px;
      aspect-ratio: 16 / 9;
      flex: none;
    }

    .tools-sidebar {
      order: 2;
      width: 100%;
      border-right: none;
      border-top: 1px solid #1a355d;
      max-height: none;
    }

    .tools-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(145px, 1fr));
      gap: 8px;
    }

    .elements-sidebar {
      order: 3;
      width: 100%;
      border-left: none;
      border-top: 1px solid #1a355d;
      max-height: 360px;
    }
  }

  @media (max-width: 600px) {
    .tools-list {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }

    .pause-slider {
      width: 110px;
    }
  }
</style>

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
    MultiPlayerTrack,
    BroadcastAnimationStyle,
  } from "$lib/types";
  import {
    runMultiPlayerAutoTracking,
    checkAiModelStatus,
    detectPlayersInFrameOnnx,
    bindElementPointsToTracks,
  } from "$lib/tracking/multiPlayerTracker";
  import {
    runPlayerAutoTracking,
    getInterpolatedPosition,
    getElementPointsAtTime,
    hasAnimatedTelestration,
    seekVideoElementSafe,
  } from "$lib/tracking/playerTracker";
  import {
    CALIBRATION_PRESETS,
    calculatePitchCalibration,
    drawCalibratedCourtOverlay,
    type PitchCalibrationPoints,
  } from "$lib/pitch/homographyCalibration";
  import {
    renderDrawingsToDataUrl,
    renderDrawingsToCanvas,
    sampleFloorRgbFromVideo,
    isFloorElType,
  } from "$lib/export/telestrationRenderer";
  import VoiceoverRecorder from "$lib/components/VoiceoverRecorder.svelte";
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

  // Pilar 2: AI Homography 3D Court Calibration State
  let isPitchCalibrated = $state(false);
  let activePresetKey = $state("main-sideline");
  let calibrationPoints = $state<PitchCalibrationPoints>({
    ...CALIBRATION_PRESETS["main-sideline"].points,
  });
  let activeCornerDrag = $state<"tl" | "tr" | "br" | "bl" | null>(null);
  let homographyResult = $derived(calculatePitchCalibration(calibrationPoints));

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

  onMount(() => {
    if (activeClip) {
      drawings = activeClip.drawings
        ? JSON.parse(JSON.stringify(activeClip.drawings))
        : [];
      pauseDuration = activeClip.pauseDuration || 3.0;
      currentTime = activeClip.startTime;
      freezeTime =
        activeClip.freezeTimestamp ??
        (activeClip.startTime + activeClip.endTime) / 2;
    }

    checkAiModelStatus()
      .then((s) => {
        if (s.available) aiEngineLabel = s.engine;
      })
      .catch(() => {});

    syncCanvasSize();
    rafId = requestAnimationFrame(renderLoop);
    window.addEventListener("resize", syncCanvasSize);

    return () => {
      window.removeEventListener("resize", syncCanvasSize);
      if (freezeInterval) clearInterval(freezeInterval);
      if (rafId !== null) cancelAnimationFrame(rafId);
      trackAbortController?.abort();
    };
  });

  onDestroy(() => {
    if (freezeInterval) clearInterval(freezeInterval);
    if (rafId !== null) cancelAnimationFrame(rafId);
    trackAbortController?.abort();
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

  function renderLoop() {
    if (videoEl && !videoEl.paused) {
      currentTime = videoEl.currentTime;

      // In Preview Mode: check for freeze midpoint trigger
      if (isPreviewing && !isFreezeActive) {
        if (currentTime >= freezeTime && currentTime < freezeTime + 0.3) {
          triggerFreezeCountdown();
        }
      }

      // Restrict playback to active clip during preview
      if (activeClip && currentTime >= activeClip.endTime) {
        videoEl.pause();
        isPlaying = false;
        isPreviewing = false;
        isFreezeActive = false;
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
      clipStartTime: activeClip ? activeClip.startTime : 0,
      animElapsedSec: isFreezeActive ? 1.0 : undefined,
      selectedElementId,
      activeTool,
    });

    // Render 3D court homography calibration grid if active
    if (isPitchCalibrated) {
      drawCalibratedCourtOverlay(ctx, calibrationPoints, w, h);
    }

    ctx.restore();
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

  function handlePointerDown(e: PointerEvent) {
    if (!canvasEl) return;
    const pt = getCanvasCoords(e);

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
        const pin = calibrationPoints[c];
        if (Math.hypot(pt.x - pin.x, pt.y - pin.y) < 0.05) {
          activeCornerDrag = c;
          return;
        }
      }
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
        isDraggingSelected = true;
        dragStartPos = pt;
      } else {
        selectedElementId = null;
      }
      return;
    }

    // Creating new element
    if (activeTool === "compactness-hull") {
      if (!inProgressDrawing) {
        inProgressDrawing = {
          id: `hull-${Date.now()}`,
          type: "compactness-hull",
          color: activeColor,
          points: [pt],
          timeStart: activeClip ? activeClip.startTime : currentTime,
          timeEnd: activeClip ? activeClip.endTime : currentTime + 5,
        };
      } else {
        // If clicking near first point, finish the hull
        const p0 = inProgressDrawing.points[0];
        if (
          inProgressDrawing.points.length >= 3 &&
          Math.hypot(pt.x - p0.x, pt.y - p0.y) < 0.05
        ) {
          drawings.push({ ...inProgressDrawing });
          selectedElementId = inProgressDrawing.id;
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
        activeTool === "player-circle"
          ? "#9"
          : activeTool === "note-text"
            ? "Evaluasi Rotasi"
            : activeTool === "magnifier"
              ? "1.8x Zoom"
              : activeTool === "player-cross"
                ? "Salah Posisi"
                : undefined,
      curveOffset: activeTool === "curved-arrow" ? -0.28 : undefined,
      zoomScale: activeTool === "magnifier" ? 1.8 : undefined,
    };
  }

  function handlePointerMove(e: PointerEvent) {
    if (!canvasEl) return;
    const pt = getCanvasCoords(e);

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
      const dx = pt.x - dragStartPos.x;
      const dy = pt.y - dragStartPos.y;

      // Move points
      for (const p of selectedElement.points) {
        p.x += dx;
        p.y += dy;
      }
      if (selectedElement.controlPoint) {
        selectedElement.controlPoint.x += dx;
        selectedElement.controlPoint.y += dy;
      }

      // If Keyframe Tracking mode is active, record keyframe at currentTime!
      if (isKeyframeMode) {
        addOrUpdateKeyframe(
          selectedElement,
          currentTime,
          selectedElement.points[0],
        );
      }

      dragStartPos = pt;
      drawings = [...drawings];
      return;
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
    activeCornerDrag = null;
    activeCurveControl = null;
    isDraggingSelected = false;
    dragStartPos = null;

    if (!inProgressDrawing || inProgressDrawing.type === "compactness-hull")
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

  function handleAddCurrentKeyframe() {
    if (!selectedElement) return;
    addOrUpdateKeyframe(
      selectedElement,
      currentTime,
      selectedElement.points[0],
    );
    drawings = [...drawings];
  }

  function handleDeleteCurrentKeyframe() {
    if (!selectedElement || !selectedElement.keyframes) return;
    selectedElement.keyframes = selectedElement.keyframes.filter(
      (k) => Math.abs(k.time - currentTime) >= 0.15,
    );
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

  // Trigger Visual Single-Player Auto-Tracking on currently selected element
  async function triggerSingleElementTracking() {
    if (!selectedElement || !videoEl || selectedElement.points.length === 0) {
      exportNotice = "Pilih elemen dan pastikan video termuat untuk melacak.";
      setTimeout(() => (exportNotice = null), 3500);
      return;
    }

    if (isSingleTracking) {
      trackAbortController?.abort();
      isSingleTracking = false;
      return;
    }

    const start = activeClip ? activeClip.startTime : currentTime;
    const end = activeClip
      ? activeClip.endTime
      : Math.min(duration, currentTime + 5);
    const anchor = selectedElement.points[0];
    const box = {
      x: Math.max(0, anchor.x - 0.025),
      y: Math.max(0, anchor.y - 0.06),
      width: 0.05,
      height: 0.09,
    };

    isSingleTracking = true;
    singleTrackProgress = 0;
    trackAbortController = new AbortController();

    try {
      const kfs = await runPlayerAutoTracking(videoEl, box, start, end, {
        stepSeconds: 0.08,
        signal: trackAbortController.signal,
        onProgress: (p) => {
          singleTrackProgress = Math.round(p * 100);
        },
      });
      if (kfs.length > 0 && selectedElement) {
        selectedElement.keyframes = kfs;
        selectedElement.isTracking = true;
        drawings = [...drawings];
        exportNotice = `Berhasil melacak ${kfs.length} keyframe untuk "${selectedElement.label || selectedElement.type}".`;
        setTimeout(() => (exportNotice = null), 4000);
      }
    } catch (err: any) {
      exportNotice = `Tracking visual gagal: ${err?.message || err}`;
      setTimeout(() => (exportNotice = null), 4000);
    } finally {
      isSingleTracking = false;
      trackAbortController = null;
    }
  }

  function handleSave() {
    if (!activeClip) return;
    projectStore.saveTelestration(
      activeClip.id,
      drawings,
      pauseDuration,
      voiceoverAudio || undefined,
      freezeTime,
    );
    exportNotice = "Telestrasi & posisi freeze-frame disimpan!";
    setTimeout(() => (exportNotice = null), 2500);
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
      drawings = projectStore.activeClipForDrawing.drawings
        ? JSON.parse(JSON.stringify(projectStore.activeClipForDrawing.drawings))
        : [];
      pauseDuration = projectStore.activeClipForDrawing.pauseDuration || 3.0;
      voiceoverAudio =
        projectStore.activeClipForDrawing.voiceoverAudioBase64 || null;
      freezeTime =
        projectStore.activeClipForDrawing.freezeTimestamp ??
        (projectStore.activeClipForDrawing.startTime +
          projectStore.activeClipForDrawing.endTime) /
          2;
      if (videoEl) {
        videoEl.currentTime = projectStore.activeClipForDrawing.startTime;
      }
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
    exportNotice = "Mendeteksi siluet pemain (YOLOX-Nano) untuk Cutout Mask...";
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
      const needsAnimatedExport = hasAnimatedTelestration(drawings);

      if (needsAnimatedExport) {
        const tmpRoot = await invoke<string>("get_temp_dir");
        const sep = tmpRoot.includes("\\") ? "\\" : "/";
        const seqDir = `${tmpRoot.replace(/[\\/]+$/, "")}${sep}futsaltag_seq_${Date.now()}`;
        seqDirToClean = seqDir;

        const overlayFps = 15;
        const clipDur = Math.max(
          0.4,
          activeClip.endTime - activeClip.startTime,
        );
        const totalFrames = Math.max(2, Math.ceil(clipDur * overlayFps));

        let rangeBoxes: { time: number; boxes: DetectedPlayerBox[] }[] = [];
        if (projectStore.chromaFloorConfig.enabled) {
          exportNotice =
            "Mendeteksi pemain (YOLOX-Nano) untuk Cutout Mask animasi...";
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
          projectStore.chromaFloorConfig.enabled ||
          drawings.some((d) => d.type === "magnifier");

        for (let i = 0; i < totalFrames; i++) {
          const t = Math.min(
            activeClip.endTime,
            activeClip.startTime + i / overlayFps,
          );
          if (needsVideoPixels && videoEl) {
            await seekVideoElementSafe(videoEl, t);
          }
          exportNotice = `Merender frame telestrasi bergerak (${i + 1}/${totalFrames})...`;
          const pngBase64 = renderDrawingsToDataUrl(drawings, 1280, 720, t, {
            videoEl,
            homographyResult: isPitchCalibrated ? homographyResult : null,
            chromaConfig: projectStore.chromaFloorConfig,
            detectedBoxes: findClosestBoxes(t),
            clipStartTime: activeClip.startTime,
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
        const freezeOverlayBase64 = renderDrawingsToDataUrl(
          drawings,
          1280,
          720,
          freezeSec,
          {
            videoEl,
            homographyResult: isPitchCalibrated ? homographyResult : null,
            chromaConfig: projectStore.chromaFloorConfig,
            detectedBoxes: findClosestBoxes(freezeSec),
            clipStartTime: activeClip.startTime,
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
          pauseDuration: pauseDuration || 3.0,
          freezeOverlayBase64,
          cameraZoom: cameraZoomTuple,
          voiceoverBase64: voiceoverAudio || null,
          targetHeight: 720,
        });
      } else {
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
            detectedBoxes: liveDetectedBoxes,
            clipStartTime: activeClip.startTime,
            animElapsedSec: 1.0,
          },
        );

        await invoke<string>("burn_telestration_clip_ffmpeg", {
          inputPath: projectStore.videoFilePath,
          outputPath: outPath,
          startSec: activeClip.startTime,
          durationSec: activeClip.endTime - activeClip.startTime,
          freezeSec,
          pauseDuration: pauseDuration || 3.0,
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
        onclick={handleSave}
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
        title="Chroma-Key lantai agar grafis tertanam di bawah kaki pemain"
      >
        <input
          type="checkbox"
          bind:checked={projectStore.chromaFloorConfig.enabled}
        />
        <span class="toggle-label">Chroma-Key Lantai (Di Bawah Kaki)</span>
      </label>

      <div class="chroma-controls-box">
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
            <span>{isSamplingFloor ? "Klik Lantai..." : "Pipet Lantai"}</span>
          </button>
          <span
            class="chroma-swatch"
            style="background-color: rgb({projectStore.chromaFloorConfig
              .targetRgb[0]}, {projectStore.chromaFloorConfig
              .targetRgb[1]}, {projectStore.chromaFloorConfig.targetRgb[2]});"
            title="Warna lantai terkalibrasi"
          ></span>
        </div>

        {#if projectStore.chromaFloorConfig.enabled}
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
            title="Gunakan deteksi YOLOX-Nano untuk mempertajam cutout kaki pemain"
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
              }
            }}
          >
            {#each Object.entries(CALIBRATION_PRESETS) as [key, val]}
              <option value={key}>{val.label}</option>
            {/each}
          </select>
          <span class="preset-tip"
            >Tarik 4 pin biru (TL, TR, BR, BL) di layar untuk menyamakan garis
            lapangan</span
          >
        </div>
      {/if}

      <div class="palette-divider"></div>

      <!-- AI MULTI-TRACKING TRIGGER -->
      <div class="palette-group-title">AI VISION ({aiEngineLabel})</div>
      <button
        class="tool-btn btn-ai"
        class:loading={isMultiTracking}
        disabled={isMultiTracking}
        onclick={triggerAIMultiTracking}
        title="Deteksi 10 Pemain & Bola via YOLOX-Nano ONNX di Rust"
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
          onpointerdown={handlePointerDown}
          onpointermove={handlePointerMove}
          onpointerup={handlePointerUp}
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
                  (1 - Math.max(0, freezeRemaining) / (pauseDuration || 3.0))}
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

    <!-- RIGHT: ELEMENTS & KEYFRAME INSPECTOR DRAWER -->
    <div class="elements-sidebar">
      <div class="inspector-header">
        <span class="inspector-title">ELEMEN KLIP ({drawings.length})</span>
        {#if selectedElement}
          <button
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
            class="btn-kf-add"
            style="width: 100%; justify-content: center; margin-top: 4px;"
            onclick={triggerSingleElementTracking}
            title="Lacak posisi elemen ini otomatis sepanjang klip (NCC + Histogram)"
          >
            <Activity size={13} />
            <span
              >{isSingleTracking
                ? `Melacak (${singleTrackProgress}%) - Klik Batal`
                : "Auto-Track Elemen Ini"}</span
            >
          </button>
        </div>
      {/if}

      <!-- DRAWINGS LIST -->
      <div class="drawings-list">
        {#each drawings as d}
          <div
            class="drawing-item"
            class:selected={d.id === selectedElementId}
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
              <span class="item-type-name">{d.label || d.type}</span>
            </div>
            <div class="drawing-item-right">
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
        </div>
      {/if}
    </div>
  </div>

  <!-- BOTTOM FREEZE DURATION & PREVIEW BAR -->
  <footer class="studio-footer">
    <div class="footer-left">
      <button class="btn-preview" onclick={triggerPreview}>
        <Play size={16} />
        <span>Preview Siaran Broadcast (Jeda {pauseDuration}s)</span>
      </button>
    </div>

    <div class="footer-center">
      <div class="pause-slider-wrap">
        <Clock size={15} />
        <span class="slider-label">Durasi Jeda Freeze-Frame:</span>
        <input
          type="range"
          min="1"
          max="8"
          step="0.5"
          bind:value={pauseDuration}
          class="pause-slider"
        />
        <span class="slider-val">{pauseDuration.toFixed(1)} Detik</span>
      </div>
    </div>

    <div class="footer-right">
      <span class="info-note"
        >ONNX YOLOX-Nano AI Tracking & FFmpeg Broadcast Burn-In (.futsal)</span
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

  .drawing-item-left {
    display: flex;
    align-items: center;
    gap: 6px;
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

  .chroma-controls-box {
    background: #07101e;
    border: 1px solid #1a355d;
    border-radius: 6px;
    padding: 7px;
    display: flex;
    flex-direction: column;
    gap: 6px;
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
</style>

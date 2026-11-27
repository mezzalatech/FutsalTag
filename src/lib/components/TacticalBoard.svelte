<script lang="ts">
  import { onMount, tick } from 'svelte';
  import {
    calculateViewportTransform,
    metersToPixels,
    pixelsToMeters,
    type ViewportTransform,
  } from '$lib/pitch/futsal';
  import { renderFutsalPitch } from '$lib/canvas/pitchRenderer';
  import { renderTacticalScene } from '$lib/canvas/drawingEngine';
  import type {
    TacticalDrill,
    TacticalStep,
    PlayerToken,
    BallToken,
    EquipmentItem,
    DrawingElement,
    DrawingToolType,
    PitchSurfaceType,
    Point2D,
  } from '$lib/types';
  import {
    SAMPLE_FUTSAL_DRILLS,
    FORMATION_PRESETS,
    createDefaultTeamA,
    createDefaultTeamB,
    createDefaultBall,
  } from '$lib/coachboard/presets';
  import {
    Play,
    Pause,
    Plus,
    Trash2,
    Copy,
    Download,
    FileText,
    MousePointer,
    MoveRight,
    Sparkles,
    Eye,
    Ruler,
    UserCheck,
    Type,
    CircleDot,
    RotateCcw,
    Layers,
    Palette,
    ClipboardList,
    ImagePlus,
    Zap,
    Film,
    ChevronDown,
  } from 'lucide-svelte';
  import { invoke } from '@tauri-apps/api/core';
  import { isTauriDesktop } from '$lib/stores/projectStore.svelte';
  import TrainingPlannerModal from '$lib/components/TrainingPlannerModal.svelte';

  // --- STATE ---
  let canvas: HTMLCanvasElement;
  let container: HTMLElement;
  let transform: ViewportTransform = $state({
    scale: 20,
    offsetX: 0,
    offsetY: 0,
    courtWidthPx: 800,
    courtHeightPx: 400,
  });

  // Current Active Drill
  let drill: TacticalDrill = $state(JSON.parse(JSON.stringify(SAMPLE_FUTSAL_DRILLS[0])));
  let currentStepIndex: number = $state(0);
  let currentStep: TacticalStep = $derived(drill.steps[currentStepIndex] || drill.steps[0]);
  let showTrainingPlanner = $state(false);
  let customFieldImg = $state<HTMLImageElement | null>(null);
  let isExportingMp4 = $state(false);
  let mp4ExportStatus = $state<string | null>(null);
  let showExportMenu = $state(false);

  $effect(() => {
    const url = drill.customFieldImageUrl;
    if (!url) {
      customFieldImg = null;
      return;
    }
    const img = new Image();
    img.onload = () => {
      customFieldImg = img;
    };
    img.src = url;
  });

  // Active Tool & Selection
  let activeTool: DrawingToolType = $state('select');
  let selectedColor: string = $state('#38bdf8');
  let selectedId: string | null = $state(null);
  let selectedType: 'player' | 'ball' | 'equipment' | 'drawing' | null = $state(null);

  // Dragging & In-Progress Drawing
  let isDragging = false;
  let dragTargetId: string | null = null;
  let dragTargetType: 'player' | 'ball' | 'equipment' | null = null;
  let inProgressDrawing: DrawingElement | null = $state(null);

  // Animation Playback
  let isPlaying = $state(false);
  let animationProgress = $state(0); // 0.0 to 1.0 between steps
  let animFrameId: number | null = null;
  let renderRafId: number | null = null;
  let animStartTime: number = 0;
  let animDurationMs = 2500;

  // Colors Palette
  const COLOR_PALETTE = ['#38bdf8', '#ef4444', '#fbbf24', '#10b981', '#a855f7', '#ffffff', '#00f0ff'];

  // --- LIFECYCLE ---
  onMount(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    let ro: ResizeObserver | null = null;
    if (container && typeof ResizeObserver !== 'undefined') {
      ro = new ResizeObserver(() => resizeCanvas());
      ro.observe(container);
    }

    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedId && selectedType === 'drawing') {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
        e.preventDefault();
        deleteSelectedElement();
      }
    };
    window.addEventListener('keydown', onKeyDown);

    renderRafId = requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      window.removeEventListener('keydown', onKeyDown);
      ro?.disconnect();
      if (animFrameId !== null) cancelAnimationFrame(animFrameId);
      if (renderRafId !== null) cancelAnimationFrame(renderRafId);
    };
  });

  function resizeCanvas() {
    if (!container || !canvas) return;
    const rect = container.getBoundingClientRect();
    if (rect.width < 10 || rect.height < 10) return;
    const dpr = window.devicePixelRatio || 1;

    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    transform = calculateViewportTransform(rect.width, rect.height, 40);
  }

  // Continuous Render Loop (never die on transient draw errors)
  function renderLoop() {
    renderRafId = requestAnimationFrame(renderLoop);
    try {
      drawCanvas();
    } catch (err) {
      console.error('[TacticalBoard] Render error:', err);
    }
  }

  function drawCanvas() {
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    ctx.save();
    ctx.scale(dpr, dpr);

    // 1. Draw Futsal Court
    renderFutsalPitch(
      ctx,
      canvas.width / dpr,
      canvas.height / dpr,
      transform,
      drill.surfaceType,
      customFieldImg
    );

    // 2. Determine players & ball positions (animated or static)
    let playersToRender = currentStep.players;
    let ballToRender = currentStep.ball;

    if (isPlaying && drill.steps.length > 1) {
      const nextIndex = (currentStepIndex + 1) % drill.steps.length;
      const nextStep = drill.steps[nextIndex];
      playersToRender = interpolatePlayers(currentStep.players, nextStep.players, animationProgress);
      ballToRender = interpolateBall(currentStep.ball, nextStep.ball, animationProgress);
    }

    // 3. Draw Tactical Scene
    renderTacticalScene(
      ctx,
      transform,
      playersToRender,
      ballToRender,
      currentStep.equipment,
      currentStep.drawings,
      {
        selectedElementId: selectedId,
        activeDrawing: inProgressDrawing,
      }
    );

    ctx.restore();
  }

  // --- ANIMATION INTERPOLATION ---
  function interpolatePlayers(from: PlayerToken[], to: PlayerToken[], t: number): PlayerToken[] {
    const easeT = easeInOutQuad(t);
    return from.map((p1) => {
      const p2 = to.find((item) => item.id === p1.id);
      if (!p2) return p1;
      return {
        ...p1,
        x: p1.x + (p2.x - p1.x) * easeT,
        y: p1.y + (p2.y - p1.y) * easeT,
      };
    });
  }

  function interpolateBall(from: BallToken, to: BallToken, t: number): BallToken {
    const easeT = easeInOutQuad(t);
    return {
      x: from.x + (to.x - from.x) * easeT,
      y: from.y + (to.y - from.y) * easeT,
    };
  }

  function easeInOutQuad(x: number): number {
    return x < 0.5 ? 2 * x * x : 1 - Math.pow(-2 * x + 2, 2) / 2;
  }

  function toggleAnimation() {
    if (isPlaying) {
      isPlaying = false;
      if (animFrameId !== null) {
        cancelAnimationFrame(animFrameId);
        animFrameId = null;
      }
    } else {
      isPlaying = true;
      animStartTime = performance.now();
      animFrameId = requestAnimationFrame(stepAnimation);
    }
  }

  function stepAnimation() {
    if (!isPlaying) return;
    const now = performance.now();
    const elapsed = now - animStartTime;
    const progress = Math.min(1.0, elapsed / animDurationMs);
    animationProgress = progress;

    if (progress >= 1.0) {
      // Advance to next step
      currentStepIndex = (currentStepIndex + 1) % drill.steps.length;
      animationProgress = 0;
      animStartTime = performance.now();
    }

    animFrameId = requestAnimationFrame(stepAnimation);
  }

  // --- POINTER / MOUSE INTERACTIONS ---
  function getCanvasCoords(e: MouseEvent): { xPx: number; yPx: number; xM: number; yM: number } {
    const rect = canvas.getBoundingClientRect();
    const xPx = e.clientX - rect.left;
    const yPx = e.clientY - rect.top;
    const { x: xM, y: yM } = pixelsToMeters(xPx, yPx, transform);
    return { xPx, yPx, xM, yM };
  }

  function handleMouseDown(e: MouseEvent) {
    const { xM, yM } = getCanvasCoords(e);

    // If Select Tool
    if (activeTool === 'select') {
      // 1. Check if clicked on Ball
      const distBall = Math.hypot(xM - currentStep.ball.x, yM - currentStep.ball.y);
      if (distBall < 0.8) {
        selectedId = 'ball';
        selectedType = 'ball';
        isDragging = true;
        dragTargetId = 'ball';
        dragTargetType = 'ball';
        return;
      }

      // 2. Check if clicked on Player
      for (const p of currentStep.players) {
        const dist = Math.hypot(xM - p.x, yM - p.y);
        if (dist < 1.0) {
          selectedId = p.id;
          selectedType = 'player';
          isDragging = true;
          dragTargetId = p.id;
          dragTargetType = 'player';
          return;
        }
      }

      // 3. Check equipment
      for (const eq of currentStep.equipment) {
        const dist = Math.hypot(xM - eq.x, yM - eq.y);
        if (dist < 1.0) {
          selectedId = eq.id;
          selectedType = 'equipment';
          isDragging = true;
          dragTargetId = eq.id;
          dragTargetType = 'equipment';
          return;
        }
      }

      // 4. Check existing drawings (point or segment hit)
      for (let i = currentStep.drawings.length - 1; i >= 0; i--) {
        const d = currentStep.drawings[i];
        if (d.points.length === 0) continue;
        let hit = false;
        if (d.points.length === 1) {
          hit = Math.hypot(xM - d.points[0].x, yM - d.points[0].y) < 1.5;
        } else {
          for (let j = 0; j < d.points.length; j++) {
            if (Math.hypot(xM - d.points[j].x, yM - d.points[j].y) < 1.2) {
              hit = true;
              break;
            }
          }
          if (!hit && d.points.length >= 2) {
            const p0 = d.points[0];
            const p1 = d.points[1];
            const dx = p1.x - p0.x;
            const dy = p1.y - p0.y;
            const lenSq = dx * dx + dy * dy;
            if (lenSq > 0.001) {
              const t = Math.max(0, Math.min(1, ((xM - p0.x) * dx + (yM - p0.y) * dy) / lenSq));
              const projX = p0.x + t * dx;
              const projY = p0.y + t * dy;
              if (Math.hypot(xM - projX, yM - projY) < 1.0) hit = true;
            }
          }
        }
        if (hit) {
          selectedId = d.id;
          selectedType = 'drawing';
          return;
        }
      }

      // Deselect
      selectedId = null;
      selectedType = null;
    } else if (activeTool === 'pressing-zone') {
      const pt = { x: xM, y: yM };
      if (!inProgressDrawing || inProgressDrawing.type !== 'pressing-zone') {
        inProgressDrawing = {
          id: `d-${Date.now()}`,
          type: 'pressing-zone',
          points: [pt],
          color: selectedColor,
          lineWidth: 2,
          isFilled: true,
          label: 'Zona Pressing',
        };
      } else {
        const first = inProgressDrawing.points[0];
        if (inProgressDrawing.points.length >= 3 && Math.hypot(pt.x - first.x, pt.y - first.y) < 1.2) {
          currentStep.drawings = [...currentStep.drawings, inProgressDrawing];
          selectedId = inProgressDrawing.id;
          selectedType = 'drawing';
          inProgressDrawing = null;
        } else {
          inProgressDrawing.points = [...inProgressDrawing.points, pt];
        }
      }
    } else {
      // Start Drawing with Active Tool
      startDrawing({ x: xM, y: yM });
    }
  }

  function handleMouseMove(e: MouseEvent) {
    const { xM, yM } = getCanvasCoords(e);
    const clampedX = Math.max(-1, Math.min(41, xM));
    const clampedY = Math.max(-1, Math.min(21, yM));

    if (isDragging && dragTargetType) {
      if (dragTargetType === 'player' && dragTargetId) {
        const player = currentStep.players.find((p) => p.id === dragTargetId);
        if (player) {
          player.x = clampedX;
          player.y = clampedY;
        }
      } else if (dragTargetType === 'ball') {
        currentStep.ball.x = clampedX;
        currentStep.ball.y = clampedY;
      } else if (dragTargetType === 'equipment' && dragTargetId) {
        const eq = currentStep.equipment.find((item) => item.id === dragTargetId);
        if (eq) {
          eq.x = clampedX;
          eq.y = clampedY;
        }
      }
    } else if (inProgressDrawing && inProgressDrawing.type !== 'pressing-zone') {
      updateDrawing({ x: clampedX, y: clampedY });
    }
  }

  function handleMouseUp() {
    isDragging = false;
    dragTargetId = null;
    dragTargetType = null;

    if (inProgressDrawing && inProgressDrawing.type !== 'pressing-zone') {
      finishDrawing();
    }
  }

  function handleCanvasDblClick() {
    if (inProgressDrawing && inProgressDrawing.type === 'pressing-zone' && inProgressDrawing.points.length >= 3) {
      currentStep.drawings = [...currentStep.drawings, inProgressDrawing];
      selectedId = inProgressDrawing.id;
      selectedType = 'drawing';
      inProgressDrawing = null;
    }
  }

  function startDrawing(pt: Point2D) {
    inProgressDrawing = {
      id: `d-${Date.now()}`,
      type: activeTool,
      points: [pt, pt],
      color: selectedColor,
      lineWidth: activeTool === 'spotlight-3d' ? 2.2 : 3,
      isFilled: true,
      label: activeTool === 'text-note' ? 'Poin Taktik' : activeTool === 'pressing-zone' ? 'Zona Pressing' : undefined,
    };
  }

  function updateDrawing(pt: Point2D) {
    if (!inProgressDrawing) return;
    if (inProgressDrawing.type === 'freehand') {
      inProgressDrawing.points.push(pt);
    } else {
      inProgressDrawing.points[1] = pt;
    }
  }

  function finishDrawing() {
    if (!inProgressDrawing) return;
    if (inProgressDrawing.points.length >= 2) {
      currentStep.drawings = [...currentStep.drawings, inProgressDrawing];
      selectedId = inProgressDrawing.id;
      selectedType = 'drawing';
    }
    inProgressDrawing = null;
  }

  function deleteSelectedElement() {
    if (!selectedId) return;
    if (selectedType === 'drawing') {
      currentStep.drawings = currentStep.drawings.filter((d) => d.id !== selectedId);
    } else if (selectedType === 'equipment') {
      currentStep.equipment = currentStep.equipment.filter((eq) => eq.id !== selectedId);
    }
    selectedId = null;
    selectedType = null;
  }

  // --- STEP MANAGEMENT ---
  function addStep() {
    const newStepNumber = drill.steps.length + 1;
    const newStep: TacticalStep = {
      id: `step-${Date.now()}`,
      stepNumber: newStepNumber,
      title: `Langkah ${newStepNumber}`,
      description: 'Rotasi pergerakan lanjutan...',
      durationSeconds: 2.0,
      players: JSON.parse(JSON.stringify(currentStep.players)),
      ball: JSON.parse(JSON.stringify(currentStep.ball)),
      equipment: JSON.parse(JSON.stringify(currentStep.equipment)),
      drawings: [],
    };
    drill.steps.push(newStep);
    currentStepIndex = drill.steps.length - 1;
  }

  function duplicateStep() {
    const copy = JSON.parse(JSON.stringify(currentStep));
    copy.id = `step-${Date.now()}`;
    copy.stepNumber = drill.steps.length + 1;
    copy.title = `${currentStep.title} (Salinan)`;
    drill.steps.splice(currentStepIndex + 1, 0, copy);
    currentStepIndex += 1;
  }

  function deleteStep() {
    if (drill.steps.length <= 1) return;
    drill.steps.splice(currentStepIndex, 1);
    drill.steps.forEach((s, idx) => (s.stepNumber = idx + 1));
    if (currentStepIndex >= drill.steps.length) {
      currentStepIndex = drill.steps.length - 1;
    }
  }

  function loadFormation(presetName: string) {
    const builder = FORMATION_PRESETS[presetName];
    if (builder) {
      currentStep.players = [
        ...builder('home'),
        ...createDefaultTeamB(),
      ];
    }
  }

  function clearDrawings() {
    currentStep.drawings = [];
    selectedId = null;
  }

  function handleExportPNG() {
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = `${drill.title.replace(/\s+/g, '_')}_Step${currentStep.stepNumber}.png`;
    link.href = canvas.toDataURL('image/png', 1.0);
    link.click();
  }

  async function handleExportPDF() {
    if (!canvas) return;
    const { exportDrillToPDF } = await import('$lib/export/pdfExporter');
    exportDrillToPDF(drill, currentStep, canvas);
  }

  function renderExportFrameToCanvas(
    ctx: CanvasRenderingContext2D,
    w: number,
    h: number,
    step: TacticalStep,
    players: PlayerToken[],
    ball: BallToken
  ) {
    const topH = 52;
    const botH = 56;
    const pitchH = h - topH - botH;

    ctx.fillStyle = '#0f172a';
    ctx.fillRect(0, 0, w, h);

    // Top banner
    ctx.fillStyle = '#131d35';
    ctx.fillRect(0, 0, w, topH);
    ctx.fillStyle = '#0284c7';
    ctx.beginPath();
    ctx.roundRect(18, 12, 136, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = 'bold 12px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('ARF FUTSALTAG 2D', 86, 26);

    ctx.textAlign = 'left';
    ctx.font = 'bold 18px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(drill.title || 'Taktik Futsal 2D', 170, 26);

    ctx.textAlign = 'right';
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(drill.category, w - 20, 26);

    // Pitch viewport in middle band
    const baseTf = calculateViewportTransform(w, pitchH, 28);
    const frameTf: ViewportTransform = {
      ...baseTf,
      offsetY: baseTf.offsetY + topH,
    };

    ctx.save();
    ctx.beginPath();
    ctx.rect(0, topH, w, pitchH);
    ctx.clip();
    renderFutsalPitch(ctx, w, h, frameTf, drill.surfaceType, customFieldImg);
    renderTacticalScene(ctx, frameTf, players, ball, step.equipment, step.drawings);
    ctx.restore();

    // Bottom step banner
    ctx.fillStyle = '#131d35';
    ctx.fillRect(0, h - botH, w, botH);
    ctx.fillStyle = '#38bdf8';
    ctx.beginPath();
    ctx.roundRect(18, h - botH + 14, 78, 28, 6);
    ctx.fill();
    ctx.fillStyle = '#0f172a';
    ctx.font = 'bold 13px Inter, system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`STEP ${step.stepNumber}/${drill.steps.length}`, 57, h - botH + 28);

    ctx.textAlign = 'left';
    ctx.fillStyle = '#f8fafc';
    ctx.font = 'bold 15px Inter, system-ui, sans-serif';
    ctx.fillText(step.title || `Langkah ${step.stepNumber}`, 110, h - botH + 20);
    ctx.fillStyle = '#94a3b8';
    ctx.font = '12px Inter, system-ui, sans-serif';
    const descShort = (step.description || '').slice(0, 118);
    ctx.fillText(descShort, 110, h - botH + 40);
  }

  async function handleExportMP4() {
    if (isExportingMp4 || drill.steps.length === 0) return;

    const safeName = (drill.title || 'taktik_futsal')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();

    let outputPath: string | null = null;
    if (isTauriDesktop()) {
      const { save } = await import('@tauri-apps/plugin-dialog');
      outputPath = await save({
        title: 'Ekspor Video Animasi Taktik 2D (MP4)',
        defaultPath: `${safeName}_taktik.mp4`,
        filters: [{ name: 'MP4 Video', extensions: ['mp4'] }],
      });
      if (!outputPath) return;
    }

    isExportingMp4 = true;
    mp4ExportStatus = 'Menyiapkan frame animasi 720p...';
    isPlaying = false;

    try {
      const W = 1280;
      const H = 720;
      const fps = 24;
      const expCanvas = document.createElement('canvas');
      expCanvas.width = W;
      expCanvas.height = H;
      const ctx = expCanvas.getContext('2d');
      if (!ctx) throw new Error('Kanvas offscreen gagal dibuat.');

      const framesBase64: string[] = [];
      const steps = drill.steps;

      if (steps.length === 1) {
        const s = steps[0];
        const total = 72; // 3s @ 24fps
        for (let f = 0; f < total; f++) {
          renderExportFrameToCanvas(ctx, W, H, s, s.players, s.ball);
          framesBase64.push(expCanvas.toDataURL('image/jpeg', 0.92));
          if (f % 12 === 0) {
            mp4ExportStatus = `Merender frame ${f + 1}/${total}...`;
            await new Promise((r) => setTimeout(r, 0));
          }
        }
      } else {
        for (let i = 0; i < steps.length; i++) {
          const cur = steps[i];
          const holdFrames = i === steps.length - 1 ? 24 : 16;
          for (let hIdx = 0; hIdx < holdFrames; hIdx++) {
            renderExportFrameToCanvas(ctx, W, H, cur, cur.players, cur.ball);
            framesBase64.push(expCanvas.toDataURL('image/jpeg', 0.92));
          }
          if (i < steps.length - 1) {
            const nxt = steps[i + 1];
            const transFrames = 42; // 1.75s smooth ease-in-out
            for (let tIdx = 1; tIdx <= transFrames; tIdx++) {
              const progress = tIdx / transFrames;
              const pInterp = interpolatePlayers(cur.players, nxt.players, progress);
              const bInterp = interpolateBall(cur.ball, nxt.ball, progress);
              renderExportFrameToCanvas(ctx, W, H, cur, pInterp, bInterp);
              framesBase64.push(expCanvas.toDataURL('image/jpeg', 0.92));
              if (tIdx % 12 === 0) {
                mp4ExportStatus = `Merender transisi Step ${i + 1} → ${i + 2}...`;
                await new Promise((r) => setTimeout(r, 0));
              }
            }
          }
        }
      }

      if (isTauriDesktop() && outputPath) {
        mp4ExportStatus = `Mengencode ${framesBase64.length} frame ke MP4 (FFmpeg)...`;
        await invoke<string>('render_frames_mp4_ffmpeg', {
          framesBase64,
          fps,
          outputPath,
        });
        mp4ExportStatus = `Selesai! Video MP4 tersimpan di: ${outputPath}`;
        setTimeout(() => (mp4ExportStatus = null), 4500);
      } else {
        // Browser fallback: download as animated sequence WebM
        const stream = expCanvas.captureStream(fps);
        const rec = new MediaRecorder(stream, { mimeType: 'video/webm' });
        const chunks: Blob[] = [];
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data);
        };
        const done = new Promise<void>((resolve) => {
          rec.onstop = () => resolve();
        });
        rec.start();
        for (const frameUrl of framesBase64) {
          const img = new Image();
          await new Promise<void>((res) => {
            img.onload = () => res();
            img.src = frameUrl;
          });
          ctx.drawImage(img, 0, 0);
          await new Promise((r) => setTimeout(r, 1000 / fps));
        }
        rec.stop();
        await done;
        const blob = new Blob(chunks, { type: 'video/webm' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${safeName}_taktik.webm`;
        a.click();
        URL.revokeObjectURL(url);
        mp4ExportStatus = 'Video WebM berhasil diunduh!';
        setTimeout(() => (mp4ExportStatus = null), 3500);
      }
    } catch (err: any) {
      alert(`Gagal ekspor video animasi taktik: ${err?.message || err}`);
      mp4ExportStatus = null;
    } finally {
      isExportingMp4 = false;
    }
  }

  function handleUploadCustomField(e: Event) {
    const input = e.target as HTMLInputElement;
    if (!input.files || input.files.length === 0) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (dataUrl) {
        drill.customFieldImageUrl = dataUrl;
        drill.surfaceType = 'custom-image';
      }
    };
    reader.readAsDataURL(input.files[0]);
  }

  function handleLoadPresetDrill(id: string) {
    const found = SAMPLE_FUTSAL_DRILLS.find((d) => d.id === id);
    if (!found) return;
    drill = JSON.parse(JSON.stringify(found));
    currentStepIndex = 0;
    isPlaying = false;
  }

  function handleCaptureCurrentBoard(): { imageDataUrl: string | null; drill: TacticalDrill } {
    drawCanvas();
    const imageDataUrl = canvas ? canvas.toDataURL('image/png', 0.92) : null;
    return {
      imageDataUrl,
      drill: JSON.parse(JSON.stringify(drill)),
    };
  }

  function handleLoadDrillFromPlanner(loadedDrill: TacticalDrill) {
    drill = JSON.parse(JSON.stringify(loadedDrill));
    currentStepIndex = 0;
    isPlaying = false;
  }
</script>

<svelte:window onclick={() => (showExportMenu = false)} />

<div class="tactical-board-root">
  <!-- TOP TOOLBAR -->
  <header class="top-bar">
    <div class="drill-meta">
      <div class="badge-futsal">FUTSAL TACTICS</div>
      <input
        type="text"
        bind:value={drill.title}
        class="drill-title-input"
        placeholder="Judul Sesi Taktik Futsal..."
      />
      <select
        class="select-clean"
        title="Pilih Template Drill Futsal"
        onchange={(e) => {
          const val = (e.currentTarget as HTMLSelectElement).value;
          if (val) handleLoadPresetDrill(val);
        }}
      >
        <option value="">-- Preset Drill --</option>
        {#each SAMPLE_FUTSAL_DRILLS as sd}
          <option value={sd.id}>{sd.title}</option>
        {/each}
      </select>
    </div>

    <!-- Pitch Surface Selector & Custom Field Upload -->
    <div class="surface-selector">
      <Palette size={14} class="text-sky-400 mr-1.5" />
      <span class="text-xs text-slate-400 mr-2">Lantai:</span>
      <select bind:value={drill.surfaceType} class="select-clean">
        <option value="wood">Parket Kayu (Liga Pro)</option>
        <option value="blue-vinyl">Vinyl Biru (FIFA World Cup)</option>
        <option value="green-turf">Rumput Sintetis</option>
        <option value="dark-slate">Dark Slate (Analisis)</option>
        <option value="half-court">Setengah Lapangan (Finishing / GK)</option>
        {#if drill.customFieldImageUrl}
          <option value="custom-image">Gambar Lapangan Kustom</option>
        {/if}
      </select>
      <label class="btn-formation ml-1.5" title="Impor gambar lapangan / arena kustom (PNG/JPG)" style="display:inline-flex;align-items:center;gap:4px;margin-left:6px;">
        <ImagePlus size={12} />
        <span>Lapangan Kustom</span>
        <input type="file" accept="image/*" style="display:none;" onchange={handleUploadCustomField} />
      </label>
    </div>

    <!-- Formasi Selector & Session Planner + Export Dropdown -->
    <select
      class="select-clean"
      title="Terapkan Formasi Futsal"
      onchange={(e) => {
        const val = (e.currentTarget as HTMLSelectElement).value;
        if (val) {
          loadFormation(val);
          (e.currentTarget as HTMLSelectElement).value = '';
        }
      }}
    >
      <option value="">-- Formasi --</option>
      {#each Object.keys(FORMATION_PRESETS) as preset}
        <option value={preset}>{preset}</option>
      {/each}
    </select>

    <div class="export-actions">
      <button
        class="btn-action btn-planner"
        onclick={() => (showTrainingPlanner = true)}
        title="Buka Perencana Sesi Latihan Terstruktur (Warm-up, Main Part, Finishing & Ekspor PDF)"
      >
        <ClipboardList size={15} />
        <span>Rencana Sesi</span>
      </button>
      <div class="tb-export-anchor">
        <button
          type="button"
          class="btn-action btn-pdf"
          onclick={(e) => {
            e.stopPropagation();
            showExportMenu = !showExportMenu;
          }}
          disabled={isExportingMp4}
          title="Ekspor Video MP4, Gambar PNG, atau PDF Drill"
        >
          <Download size={14} />
          <span>{isExportingMp4 ? 'Merender...' : 'Ekspor'}</span>
          <ChevronDown size={13} />
        </button>
        {#if showExportMenu}
          <!-- svelte-ignore a11y_click_events_have_key_events -->
          <div class="tb-export-dropdown" role="menu" tabindex="-1" onclick={(e) => e.stopPropagation()}>
            <button type="button" class="tb-exp-item" onclick={() => { showExportMenu = false; handleExportMP4(); }} disabled={isExportingMp4}>
              <Film size={13} />
              <span>Video Animasi MP4</span>
            </button>
            <button type="button" class="tb-exp-item" onclick={() => { showExportMenu = false; handleExportPNG(); }}>
              <Download size={13} />
              <span>Gambar PNG</span>
            </button>
            <button type="button" class="tb-exp-item" onclick={() => { showExportMenu = false; handleExportPDF(); }}>
              <FileText size={13} />
              <span>Lembar Taktik PDF</span>
            </button>
          </div>
        {/if}
      </div>
    </div>
  </header>

  {#if mp4ExportStatus}
    <div class="mp4-status-bar">
      <Film size={13} />
      <span>{mp4ExportStatus}</span>
    </div>
  {/if}

  <!-- MAIN WORKSPACE -->
  <div class="workspace-body">
    <!-- LEFT DRAWING TOOLS SIDEBAR -->
    <aside class="left-toolbar">
      <div class="tool-group">
        <span class="tool-group-title">KONTROL</span>
        <button
          class="tool-btn"
          class:active={activeTool === 'select'}
          onclick={() => (activeTool = 'select')}
          title="Pilih & Pindahkan Pemain / Objek"
        >
          <MousePointer size={18} />
          <span>Pilih</span>
        </button>
      </div>

      <div class="tool-group">
        <span class="tool-group-title">TELSTRASI & TAKTIK</span>
        <button
          class="tool-btn"
          class:active={activeTool === 'pass-arrow'}
          onclick={() => (activeTool = 'pass-arrow')}
          title="Garis Passing (Lurus Solid)"
        >
          <MoveRight size={18} />
          <span>Pass</span>
        </button>

        <button
          class="tool-btn"
          class:active={activeTool === 'run-arrow'}
          onclick={() => (activeTool = 'run-arrow')}
          title="Garis Lari Pemain (Putus-Putus)"
        >
          <div class="dashed-arrow-icon">┄➔</div>
          <span>Lari</span>
        </button>

        <button
          class="tool-btn"
          class:active={activeTool === 'spotlight-3d'}
          onclick={() => (activeTool = 'spotlight-3d')}
          title="3D Spotlight di Lantai"
        >
          <Sparkles size={18} />
          <span>Spotlight</span>
        </button>

        <button
          class="tool-btn"
          class:active={activeTool === 'vision-cone'}
          onclick={() => (activeTool = 'vision-cone')}
          title="Sudut Pandang (Vision Cone)"
        >
          <Eye size={18} />
          <span>Vision</span>
        </button>

        <button
          class="tool-btn"
          class:active={activeTool === 'distance-line'}
          onclick={() => (activeTool = 'distance-line')}
          title="Pengukur Jarak Metrik Riil"
        >
          <Ruler size={18} />
          <span>Jarak</span>
        </button>

        <button
          class="tool-btn"
          class:active={activeTool === 'pressing-zone'}
          onclick={() => (activeTool = 'pressing-zone')}
          title="Area / Zona Pressing"
        >
          <Layers size={18} />
          <span>Zona</span>
        </button>

        <button
          class="tool-btn"
          class:active={activeTool === 'player-ghost'}
          onclick={() => (activeTool = 'player-ghost')}
          title="Player Ghost (Posisi Ideal)"
        >
          <UserCheck size={18} />
          <span>Ghost</span>
        </button>

        <button
          class="tool-btn"
          class:active={activeTool === 'text-note'}
          onclick={() => (activeTool = 'text-note')}
          title="Catatan Teks"
        >
          <Type size={18} />
          <span>Teks</span>
        </button>
      </div>

      <!-- Color Palette Picker -->
      <div class="tool-group">
        <span class="tool-group-title">WARNA</span>
        <div class="color-grid">
          {#each COLOR_PALETTE as color}
            <button
              class="color-dot"
              style="background-color: {color};"
              class:selected={selectedColor === color}
              onclick={() => (selectedColor = color)}
              aria-label="Pilih warna {color}"
            ></button>
          {/each}
        </div>
      </div>

      <div class="tool-group mt-auto">
        {#if selectedId && (selectedType === 'drawing' || selectedType === 'equipment')}
          <button class="tool-btn btn-danger" onclick={deleteSelectedElement} title="Hapus Elemen Terpilih (Delete)">
            <Trash2 size={16} />
            <span>Hapus Item</span>
          </button>
        {/if}
        <button class="tool-btn btn-danger" onclick={clearDrawings} title="Hapus Semua Coretan">
          <RotateCcw size={16} />
          <span>Bersihkan</span>
        </button>
      </div>
    </aside>

    <!-- CENTER CANVAS AREA -->
    <main class="canvas-container" bind:this={container}>
      <canvas
        bind:this={canvas}
        onmousedown={handleMouseDown}
        onmousemove={handleMouseMove}
        onmouseup={handleMouseUp}
        ondblclick={handleCanvasDblClick}
      ></canvas>

      <!-- Overlay Coaching Note Card -->
      <div class="step-card-overlay">
        <div class="step-badge">STEP {currentStep.stepNumber}</div>
        <input
          type="text"
          bind:value={currentStep.title}
          class="step-title-input"
          placeholder="Nama Langkah..."
        />
        <textarea
          bind:value={currentStep.description}
          class="step-desc-input"
          rows="2"
          placeholder="Instruksi pergerakan dan rotasi pemain..."
        ></textarea>
      </div>
    </main>

    <!-- RIGHT PANEL: COACHING NOTES & ROSTER -->
    <aside class="right-panel">
      <div class="panel-section">
        <h3 class="panel-title">POIN TAKTIK PELATIH</h3>
        <textarea
          bind:value={drill.coachNotes}
          class="coach-notes-textarea"
          rows="6"
          placeholder="Catatan taktis untuk pemain futsal (kompaksi, rotasi 3-1, timing umpan)..."
        ></textarea>
      </div>

      <div class="panel-section">
        <h3 class="panel-title">PEMAIN TIM A (MERAH)</h3>
        <div class="player-roster-list">
          {#each currentStep.players.filter((p) => p.team === 'home' || p.team === 'gk-home') as player}
            <div class="roster-item">
              <span class="roster-number">#{player.number}</span>
              <input type="text" bind:value={player.name} class="roster-name-input" />
              <select
                class="roster-shape-select"
                value={player.shape || 'circle'}
                title="Bentuk Ikon Pemain"
                onchange={(e) => (player.shape = (e.currentTarget as HTMLSelectElement).value as any)}
              >
                <option value="circle">●</option>
                <option value="jersey">👕</option>
                <option value="triangle">▲</option>
                <option value="square">■</option>
              </select>
              <button
                type="button"
                class="roster-pulse-btn"
                class:active={player.pulsate}
                title="Efek Pulsate (Sorot Pemain Rotasi)"
                onclick={() => (player.pulsate = !player.pulsate)}
              >
                <Zap size={11} />
              </button>
            </div>
          {/each}
        </div>
      </div>

      <div class="panel-section">
        <h3 class="panel-title">PEMAIN TIM B (BIRU)</h3>
        <div class="player-roster-list">
          {#each currentStep.players.filter((p) => p.team === 'away' || p.team === 'gk-away') as player}
            <div class="roster-item">
              <span class="roster-number bg-blue-600">#{player.number}</span>
              <input type="text" bind:value={player.name} class="roster-name-input" />
              <select
                class="roster-shape-select"
                value={player.shape || 'circle'}
                title="Bentuk Ikon Pemain"
                onchange={(e) => (player.shape = (e.currentTarget as HTMLSelectElement).value as any)}
              >
                <option value="circle">●</option>
                <option value="jersey">👕</option>
                <option value="triangle">▲</option>
                <option value="square">■</option>
              </select>
              <button
                type="button"
                class="roster-pulse-btn"
                class:active={player.pulsate}
                title="Efek Pulsate (Sorot Pemain)"
                onclick={() => (player.pulsate = !player.pulsate)}
              >
                <Zap size={11} />
              </button>
            </div>
          {/each}
        </div>
      </div>
    </aside>
  </div>

  <!-- BOTTOM ANIMATION TIMELINE -->
  <footer class="bottom-timeline">
    <div class="playback-controls">
      <button class="btn-play" onclick={toggleAnimation} class:playing={isPlaying}>
        {#if isPlaying}
          <Pause size={18} />
          <span>Jeda</span>
        {:else}
          <Play size={18} />
          <span>Putar Animasi</span>
        {/if}
      </button>
    </div>

    <!-- Stepper Tabs -->
    <div class="steps-tabs">
      {#each drill.steps as step, idx}
        <button
          class="step-tab"
          class:active={currentStepIndex === idx}
          onclick={() => {
            currentStepIndex = idx;
            isPlaying = false;
          }}
        >
          <span class="step-number">{step.stepNumber}</span>
          <span class="step-name">{step.title}</span>
        </button>
      {/each}
    </div>

    <!-- Step Controls -->
    <div class="step-actions">
      <button class="btn-step-action" onclick={addStep} title="Tambah Langkah Baru">
        <Plus size={16} />
        <span>Tambah Step</span>
      </button>
      <button class="btn-step-action" onclick={duplicateStep} title="Duplikasi Langkah Ini">
        <Copy size={16} />
      </button>
      {#if drill.steps.length > 1}
        <button class="btn-step-action btn-danger" onclick={deleteStep} title="Hapus Langkah Ini">
          <Trash2 size={16} />
        </button>
      {/if}
    </div>
  </footer>

  <TrainingPlannerModal
    isOpen={showTrainingPlanner}
    onClose={() => (showTrainingPlanner = false)}
    onCaptureCurrentBoard={handleCaptureCurrentBoard}
    onLoadDrillToBoard={handleLoadDrillFromPlanner}
  />
</div>

<style>
  .tactical-board-root {
    display: flex;
    flex-direction: column;
    height: 100%;
    width: 100%;
    background-color: #0f172a;
    color: #f8fafc;
    overflow: hidden;
    font-family: Inter, system-ui, -apple-system, sans-serif;
  }

  /* TOP BAR */
  .top-bar {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px;
    background-color: #1e293b;
    border-bottom: 1px solid #334155;
    gap: 8px;
    min-height: 48px;
    height: auto;
    flex-shrink: 0;
    box-sizing: border-box;
  }

  .drill-meta {
    display: flex;
    align-items: center;
    gap: 8px;
    flex: 1 1 200px;
    min-width: 180px;
  }

  .badge-futsal {
    background: linear-gradient(135deg, #0284c7, #0369a1);
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 8px;
    border-radius: 4px;
    letter-spacing: 0.05em;
    white-space: nowrap;
    flex-shrink: 0;
  }

  .drill-title-input {
    background: transparent;
    border: 1px solid transparent;
    color: #ffffff;
    font-size: 14px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    width: 100%;
    max-width: 240px;
    min-width: 120px;
  }

  .drill-title-input:hover,
  .drill-title-input:focus {
    background-color: #0f172a;
    border-color: #38bdf8;
    outline: none;
  }

  .surface-selector {
    display: flex;
    align-items: center;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .tb-export-anchor {
    position: relative;
  }

  .tb-export-dropdown {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    z-index: 80;
    min-width: 185px;
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 4px;
    box-shadow: 0 14px 32px rgba(0, 0, 0, 0.7);
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .tb-exp-item {
    display: flex;
    align-items: center;
    gap: 8px;
    width: 100%;
    text-align: left;
    background: transparent;
    border: none;
    color: #e2e8f0;
    font-size: 11px;
    font-weight: 600;
    padding: 7px 9px;
    border-radius: 6px;
    cursor: pointer;
  }

  .tb-exp-item:hover:not(:disabled) {
    background: #1e293b;
    color: #ffffff;
  }

  .select-clean {
    background-color: #0b172a;
    color: #cbd5e1;
    border: 1px solid #1a355d;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    outline: none;
  }

  .btn-formation {
    background-color: #0b172a;
    color: #93c5fd;
    border: 1px solid #1a355d;
    padding: 4px 9px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    margin-right: 4px;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-formation:hover {
    background-color: #122c4d;
    color: #ffffff;
    border-color: #38bdf8;
  }

  .export-actions {
    display: flex;
    gap: 6px;
    flex-shrink: 0;
    white-space: nowrap;
  }

  .mp4-status-bar {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 16px;
    background: rgba(14, 165, 233, 0.16);
    border-bottom: 1px solid rgba(56, 189, 248, 0.35);
    color: #7dd3fc;
    font-size: 12px;
    font-weight: 600;
    flex-shrink: 0;
  }

  .btn-planner {
    background: rgba(16, 185, 129, 0.16) !important;
    border-color: rgba(16, 185, 129, 0.45) !important;
    color: #6ee7b7 !important;
  }

  .btn-planner:hover {
    background: rgba(16, 185, 129, 0.28) !important;
    color: #ffffff !important;
  }

  .roster-shape-select {
    background: #0f172a;
    border: 1px solid #334155;
    color: #cbd5e1;
    border-radius: 4px;
    font-size: 11px;
    padding: 1px 2px;
    cursor: pointer;
  }

  .roster-pulse-btn {
    background: #0f172a;
    border: 1px solid #334155;
    color: #64748b;
    border-radius: 4px;
    padding: 3px 5px;
    cursor: pointer;
    display: inline-flex;
    align-items: center;
  }

  .roster-pulse-btn.active {
    background: rgba(251, 191, 36, 0.18);
    border-color: #fbbf24;
    color: #fbbf24;
  }

  .btn-action {
    display: flex;
    align-items: center;
    gap: 5px;
    background-color: #0f2444;
    color: #93c5fd;
    border: 1px solid #1e3b68;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    flex-shrink: 0;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-action:hover {
    background-color: #163666;
    border-color: #38bdf8;
    color: #ffffff;
  }

  .btn-pdf {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border-color: #38bdf8;
    color: #ffffff;
    box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
  }

  .btn-pdf:hover {
    background: linear-gradient(135deg, #0369a1, #1d4ed8);
  }

  /* WORKSPACE BODY */
  .workspace-body {
    display: flex;
    flex: 1;
    overflow: hidden;
  }

  /* LEFT TOOLBAR */
  .left-toolbar {
    width: 68px;
    background: linear-gradient(180deg, #0b1528 0%, #07101e 100%);
    border-right: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    padding: 10px 6px;
    gap: 12px;
    overflow-y: auto;
  }

  .tool-group {
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .tool-group-title {
    font-size: 8px;
    font-weight: 700;
    color: #64748b;
    text-align: center;
    letter-spacing: 0.05em;
  }

  .tool-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 3px;
    background: transparent;
    border: 1px solid transparent;
    color: #94a3b8;
    padding: 6px 2px;
    border-radius: 8px;
    cursor: pointer;
    font-size: 10px;
    font-weight: 500;
    transition: all 0.15s;
  }

  .tool-btn:hover {
    background-color: #334155;
    color: #f8fafc;
  }

  .tool-btn.active {
    background-color: #0284c7;
    color: #ffffff;
    border-color: #38bdf8;
  }

  .tool-btn.btn-danger:hover {
    background-color: #ef4444;
    color: #ffffff;
  }

  .dashed-arrow-icon {
    font-size: 14px;
    font-weight: bold;
    letter-spacing: -2px;
  }

  .color-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 4px;
    padding: 4px;
  }

  .color-dot {
    width: 14px;
    height: 14px;
    border-radius: 50%;
    border: 1px solid rgba(255, 255, 255, 0.3);
    cursor: pointer;
    padding: 0;
  }

  .color-dot.selected {
    outline: 2px solid #ffffff;
    outline-offset: 1px;
  }

  /* CANVAS CONTAINER */
  .canvas-container {
    flex: 1;
    position: relative;
    background-color: #0b0f19;
    overflow: hidden;
  }

  canvas {
    display: block;
    width: 100%;
    height: 100%;
    cursor: crosshair;
  }

  .step-card-overlay {
    position: absolute;
    top: 16px;
    left: 16px;
    background-color: rgba(15, 23, 42, 0.85);
    backdrop-filter: blur(8px);
    border: 1px solid #334155;
    border-radius: 8px;
    padding: 10px 14px;
    width: 280px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .step-badge {
    font-size: 10px;
    font-weight: 800;
    color: #38bdf8;
    margin-bottom: 4px;
  }

  .step-title-input {
    width: 100%;
    background: transparent;
    border: none;
    border-bottom: 1px solid #334155;
    color: #ffffff;
    font-weight: 600;
    font-size: 13px;
    padding: 2px 0 4px 0;
    margin-bottom: 6px;
  }

  .step-title-input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  .step-desc-input {
    width: 100%;
    background-color: #1e293b;
    border: 1px solid #334155;
    border-radius: 4px;
    color: #cbd5e1;
    font-size: 11px;
    padding: 6px;
    resize: none;
    box-sizing: border-box;
  }

  .step-desc-input:focus {
    outline: none;
    border-color: #38bdf8;
  }

  /* RIGHT PANEL */
  .right-panel {
    width: 230px;
    flex-shrink: 0;
    background-color: #1e293b;
    border-left: 1px solid #334155;
    display: flex;
    flex-direction: column;
    padding: 12px;
    gap: 14px;
    overflow-y: auto;
  }

  .panel-section {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .panel-title {
    font-size: 11px;
    font-weight: 700;
    color: #94a3b8;
    letter-spacing: 0.05em;
    margin: 0;
  }

  .coach-notes-textarea {
    width: 100%;
    background-color: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #f1f5f9;
    font-size: 11px;
    line-height: 1.5;
    padding: 8px;
    box-sizing: border-box;
    resize: vertical;
  }

  .player-roster-list {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .roster-item {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0f172a;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .roster-number {
    background-color: #ef4444;
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 2px 5px;
    border-radius: 4px;
    min-width: 18px;
    text-align: center;
  }

  .roster-name-input {
    background: transparent;
    border: none;
    color: #f8fafc;
    font-size: 12px;
    font-weight: 500;
    flex: 1;
  }

  /* BOTTOM TIMELINE */
  .bottom-timeline {
    height: 52px;
    background-color: #1e293b;
    border-top: 1px solid #334155;
    display: flex;
    align-items: center;
    padding: 0 18px;
    gap: 16px;
  }

  .btn-play {
    display: flex;
    align-items: center;
    gap: 8px;
    background-color: #0284c7;
    color: #ffffff;
    border: none;
    padding: 8px 16px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-play.playing {
    background-color: #eab308;
    color: #0f172a;
  }

  .steps-tabs {
    display: flex;
    gap: 6px;
    flex: 1;
    overflow-x: auto;
  }

  .step-tab {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #0f172a;
    color: #94a3b8;
    border: 1px solid #334155;
    padding: 6px 12px;
    border-radius: 6px;
    cursor: pointer;
    font-size: 11px;
    font-weight: 600;
    white-space: nowrap;
    transition: all 0.15s;
  }

  .step-tab.active {
    background-color: #334155;
    color: #38bdf8;
    border-color: #38bdf8;
  }

  .step-number {
    background-color: #1e293b;
    padding: 1px 6px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 800;
  }

  .step-actions {
    display: flex;
    gap: 6px;
  }

  .btn-step-action {
    display: flex;
    align-items: center;
    gap: 4px;
    background-color: #334155;
    color: #f1f5f9;
    border: 1px solid #475569;
    padding: 6px 10px;
    border-radius: 6px;
    font-size: 11px;
    cursor: pointer;
  }

  .btn-step-action:hover {
    background-color: #475569;
  }

  .btn-step-action.btn-danger:hover {
    background-color: #ef4444;
  }

  @media (max-width: 1024px) {
    .tactical-board-root {
      overflow-y: auto;
      height: auto;
      min-height: 100%;
    }

    .workspace-body {
      flex-direction: column;
      overflow: visible;
    }

    .left-toolbar {
      width: 100%;
      flex-direction: row;
      flex-wrap: wrap;
      border-right: none;
      border-bottom: 1px solid #1a355d;
      padding: 8px;
      gap: 8px;
    }

    .tool-group {
      flex-direction: row;
      flex-wrap: wrap;
      align-items: center;
    }

    .canvas-container {
      min-height: 360px;
      width: 100%;
    }

    .right-panel {
      width: 100%;
      border-left: none;
      border-top: 1px solid #334155;
    }

    .step-card-overlay {
      width: min(260px, calc(100% - 24px));
    }
  }

  @media (max-width: 640px) {
    .top-bar {
      padding: 8px 10px;
    }

    .export-actions {
      flex-wrap: wrap;
      white-space: normal;
    }
  }
</style>

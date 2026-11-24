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
  import { exportDrillToPDF } from '$lib/export/pdfExporter';
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
  } from 'lucide-svelte';

  // --- STATE ---
  let canvas: HTMLCanvasElement;
  let container: HTMLDivElement;
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
  let animStartTime: number = 0;
  let animDurationMs = 2500;

  // Colors Palette
  const COLOR_PALETTE = ['#38bdf8', '#ef4444', '#fbbf24', '#10b981', '#a855f7', '#ffffff', '#00f0ff'];

  // --- LIFECYCLE ---
  onMount(() => {
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    requestAnimationFrame(renderLoop);

    return () => {
      window.removeEventListener('resize', resizeCanvas);
      if (animFrameId) cancelAnimationFrame(animFrameId);
    };
  });

  function resizeCanvas() {
    if (!container || !canvas) return;
    const rect = container.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    canvas.style.width = `${rect.width}px`;
    canvas.style.height = `${rect.height}px`;

    transform = calculateViewportTransform(rect.width, rect.height, 40);
  }

  // Continuous Render Loop
  function renderLoop() {
    drawCanvas();
    requestAnimationFrame(renderLoop);
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
      drill.surfaceType
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
    } else {
      isPlaying = true;
      animStartTime = performance.now();
      stepAnimation();
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

    requestAnimationFrame(stepAnimation);
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

      // Deselect
      selectedId = null;
      selectedType = null;
    } else {
      // Start Drawing with Active Tool
      startDrawing({ x: xM, y: yM });
    }
  }

  function handleMouseMove(e: MouseEvent) {
    const { xM, yM } = getCanvasCoords(e);

    if (isDragging && dragTargetType) {
      if (dragTargetType === 'player' && dragTargetId) {
        const player = currentStep.players.find((p) => p.id === dragTargetId);
        if (player) {
          player.x = xM;
          player.y = yM;
        }
      } else if (dragTargetType === 'ball') {
        currentStep.ball.x = xM;
        currentStep.ball.y = yM;
      }
    } else if (inProgressDrawing) {
      updateDrawing({ x: xM, y: yM });
    }
  }

  function handleMouseUp() {
    isDragging = false;
    dragTargetId = null;
    dragTargetType = null;

    if (inProgressDrawing) {
      finishDrawing();
    }
  }

  function startDrawing(pt: Point2D) {
    inProgressDrawing = {
      id: `d-${Date.now()}`,
      type: activeTool,
      points: [pt, pt],
      color: selectedColor,
      lineWidth: 3,
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
      currentStep.drawings.push(inProgressDrawing);
      selectedId = inProgressDrawing.id;
    }
    inProgressDrawing = null;
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

  function handleExportPDF() {
    if (!canvas) return;
    exportDrillToPDF(drill, currentStep, canvas);
  }
</script>

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
    </div>

    <!-- Pitch Surface Selector -->
    <div class="surface-selector">
      <Palette size={14} class="text-sky-400 mr-1.5" />
      <span class="text-xs text-slate-400 mr-2">Lantai:</span>
      <select bind:value={drill.surfaceType} class="select-clean">
        <option value="wood">Parket Kayu (Liga Pro)</option>
        <option value="blue-vinyl">Vinyl Biru (FIFA World Cup)</option>
        <option value="green-turf">Rumput Sintetis</option>
        <option value="dark-slate">Dark Slate (Analisis)</option>
      </select>
    </div>

    <!-- Formasi Presets -->
    <div class="formation-presets">
      <span class="text-xs text-slate-400 mr-2">Formasi:</span>
      {#each Object.keys(FORMATION_PRESETS) as preset}
        <button
          class="btn-formation"
          onclick={() => loadFormation(preset)}
        >
          {preset}
        </button>
      {/each}
    </div>

    <!-- Export Action Buttons -->
    <div class="export-actions">
      <button class="btn-action" onclick={handleExportPNG} title="Ekspor Gambar PNG">
        <Download size={15} />
        <span>PNG</span>
      </button>
      <button class="btn-action btn-pdf" onclick={handleExportPDF} title="Ekspor Lembar Taktik PDF">
        <FileText size={15} />
        <span>PDF Drill</span>
      </button>
    </div>
  </header>

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
        <button class="tool-btn btn-danger" onclick={clearDrawings} title="Hapus Semua Coretan">
          <RotateCcw size={16} />
          <span>Hapus</span>
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
              <span class="roster-role">{player.role || 'Pemain'}</span>
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
              <span class="roster-role">{player.role || 'Bek'}</span>
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
</div>

<style>
  .tactical-board-root {
    display: flex;
    flex-direction: column;
    height: 100vh;
    width: 100vw;
    background-color: #0f172a;
    color: #f8fafc;
    overflow: hidden;
    font-family: Inter, system-ui, -apple-system, sans-serif;
  }

  /* TOP BAR */
  .top-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 18px;
    background-color: #1e293b;
    border-bottom: 1px solid #334155;
    gap: 16px;
    height: 56px;
    box-sizing: border-box;
  }

  .drill-meta {
    display: flex;
    align-items: center;
    gap: 10px;
    flex: 1;
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

  .drill-title-input {
    background: transparent;
    border: 1px solid transparent;
    color: #ffffff;
    font-size: 15px;
    font-weight: 700;
    padding: 4px 8px;
    border-radius: 6px;
    width: 320px;
  }

  .drill-title-input:hover,
  .drill-title-input:focus {
    background-color: #0f172a;
    border-color: #38bdf8;
    outline: none;
  }

  .surface-selector,
  .formation-presets {
    display: flex;
    align-items: center;
  }

  .select-clean {
    background-color: #0f172a;
    color: #cbd5e1;
    border: 1px solid #334155;
    padding: 5px 10px;
    border-radius: 6px;
    font-size: 12px;
  }

  .btn-formation {
    background-color: #0f172a;
    color: #94a3b8;
    border: 1px solid #334155;
    padding: 4px 10px;
    border-radius: 6px;
    font-size: 11px;
    font-weight: 600;
    margin-right: 6px;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-formation:hover {
    background-color: #38bdf8;
    color: #0f172a;
    border-color: #38bdf8;
  }

  .export-actions {
    display: flex;
    gap: 8px;
  }

  .btn-action {
    display: flex;
    align-items: center;
    gap: 6px;
    background-color: #334155;
    color: #f1f5f9;
    border: 1px solid #475569;
    padding: 6px 12px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn-action:hover {
    background-color: #475569;
  }

  .btn-pdf {
    background-color: #0284c7;
    border-color: #0ea5e9;
  }

  .btn-pdf:hover {
    background-color: #0369a1;
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
    background-color: #1e293b;
    border-right: 1px solid #334155;
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
    width: 250px;
    background-color: #1e293b;
    border-left: 1px solid #334155;
    display: flex;
    flex-direction: column;
    padding: 14px;
    gap: 16px;
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

  .roster-role {
    font-size: 10px;
    color: #64748b;
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
</style>

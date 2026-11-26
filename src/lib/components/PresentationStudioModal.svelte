<script lang="ts">
  import { tick } from 'svelte';
  import { projectStore, isTauriDesktop } from '$lib/stores/projectStore.svelte';
  import type { FreezeStop, Point2D, PresentationSlide, VideoTagEvent } from '$lib/types';
  import { renderDrawingsToCanvas } from '$lib/export/telestrationRenderer';
  import { getEffectiveFreezeStopsForTag } from '$lib/export/freezeStops';
  import TacticalBoard from '$lib/components/TacticalBoard.svelte';
  import ClipFilterBar from '$lib/components/ClipFilterBar.svelte';
  import {
    Play,
    Pause,
    ChevronLeft,
    ChevronRight,
    PenTool,
    Eraser,
    LayoutGrid,
    Maximize2,
    Minimize2,
    Volume2,
    VolumeX,
    List,
    X,
    Plus,
    Trash2,
    Undo2,
    Type,
    Image as ImageIcon,
    RefreshCw,
    ArrowUp,
    ArrowDown,
    Shield,
    Filter,
    Sparkles,
  } from 'lucide-svelte';

  interface Props {
    isOpen: boolean;
    onClose: () => void;
  }

  let { isOpen, onClose }: Props = $props();

  interface LiveStroke {
    color: string;
    width: number;
    points: Point2D[];
  }

  const PEN_COLORS = ['#00f0ff', '#f59e0b', '#ef4444', '#10b981', '#ffffff'];
  const TITLE_BG_COLORS = ['#0f172a', '#0c4a6e', '#064e3b', '#7f1d1d', '#312e81'];

  let slides = $state<PresentationSlide[]>([]);
  let currentSlideIdx = $state(0);
  let showSlideDrawer = $state(false);
  let showFilterPanel = $state(false);
  let presenterAngleId = $state<string>('main');
  let isFullscreen = $state(false);
  let autoFreezeEnabled = $state(true);
  let voiceoverEnabled = $state(true);
  let imageInputEl = $state<HTMLInputElement | null>(null);
  let logoInputEl = $state<HTMLInputElement | null>(null);

  // Video & telestration playback state
  let videoEl = $state<HTMLVideoElement | null>(null);
  let telCanvasEl = $state<HTMLCanvasElement | null>(null);
  let stageBoxEl = $state<HTMLDivElement | null>(null);
  let isPlaying = $state(false);
  let currentTime = $state(0);
  let isFreezing = $state(false);
  let freezeRemaining = $state(0);
  let activeFreezeDuration = $state(3.0);
  let activeFreezeLabel = $state('FREEZE ANALISIS');
  let triggeredStopIds = new Set<string>();
  let freezeStartedAtMs = 0;
  let isReplayPass = $state(false);
  let freezeTimer: any = null;
  let activeVoiceAudio: HTMLAudioElement | null = null;
  let voicePlayedForSlide = false;

  // Live Annotation Pen state
  let penCanvasEl = $state<HTMLCanvasElement | null>(null);
  let isDrawMode = $state(false);
  let penColor = $state('#00f0ff');
  let isDrawingStroke = $state(false);
  let liveStrokes = $state<LiveStroke[]>([]);
  let activeStroke = $state<LiveStroke | null>(null);

  const currentSlide = $derived(slides[currentSlideIdx] ?? null);
  const activePresenterAngle = $derived(
    currentSlide?.kind === 'clip' &&
      (!currentSlide.matchId || currentSlide.matchId === '__active__')
      ? projectStore.secondaryAngles.find((a) => a.id === presenterAngleId) ?? null
      : null
  );
  const activeSlideVideoSrc = $derived(
    activePresenterAngle?.videoSrc ??
      (currentSlide?.kind === 'clip' ? (currentSlide.videoSrc ?? projectStore.videoSrc) : projectStore.videoSrc)
  );

  function commitSlides(next: PresentationSlide[]) {
    slides = next;
    projectStore.presentationSlides = next;
  }

  function resolveLiveTag(tag: VideoTagEvent, matchId?: string): VideoTagEvent {
    if (matchId) {
      const srcMatch = projectStore.getAllMatchSources().find((m) => m.id === matchId);
      const found = srcMatch?.tags.find((t) => t.id === tag.id);
      if (found) return found;
    }
    return projectStore.tags.find((t) => t.id === tag.id) ?? tag;
  }

  function clipBounds(slide: Extract<PresentationSlide, { kind: 'clip' }>): { start: number; end: number } {
    const start = Math.max(0, slide.trimStart ?? slide.tag.startTime);
    const end = Math.max(start + 0.5, slide.trimEnd ?? slide.tag.endTime);
    return { start, end };
  }

  const activeCameraZoom = $derived(
    isFreezing &&
      currentSlide?.kind === 'clip' &&
      currentSlide.showTelestration !== false &&
      !activePresenterAngle
      ? resolveLiveTag(currentSlide.tag, currentSlide.matchId).drawings?.find((d) => d.cameraZoomTarget)
          ?.cameraZoomTarget ?? null
      : null
  );

  function buildFilteredSlides(existingSource: PresentationSlide[]): PresentationSlide[] {
    const resolved = projectStore.getFilteredPlaylistClips();
    const existingClipsByKey = new Map<string, Extract<PresentationSlide, { kind: 'clip' }>>();
    const nonClipSlides: PresentationSlide[] = [];
    for (const s of existingSource) {
      if (s.kind === 'clip') {
        const k = s.matchId ? `${s.matchId}::${s.tag.id}` : `__active__::${s.tag.id}`;
        existingClipsByKey.set(k, s);
      } else {
        nonClipSlides.push(s);
      }
    }
    const clipSlides: PresentationSlide[] = resolved.map((c) => {
      const prev = existingClipsByKey.get(c.key);
      return {
        ...(prev ?? {}),
        id: prev?.id || `clip-${c.key}`,
        kind: 'clip',
        title: c.tag.title,
        tag: c.tag,
        matchId: c.matchId,
        matchTitle: c.matchTitle,
        videoFilePath: c.videoFilePath,
        videoSrc: c.videoSrc,
        chromaFloorConfig: c.chromaFloorConfig,
        showTelestration: c.useTelestration,
      };
    });
    return [...clipSlides, ...nonClipSlides];
  }

  // Initialize slides from filtered library clips + preserved custom slides whenever modal opens
  $effect(() => {
    if (!isOpen) {
      cleanupMediaAndTimers();
      return;
    }
    const baseSource = projectStore.presentationSlides.length > 0 ? projectStore.presentationSlides : slides;
    commitSlides(buildFilteredSlides(baseSource));
    currentSlideIdx = 0;
    liveStrokes = [];
    isDrawMode = false;
    loadCurrentSlideMedia(true);

    if (isTauriDesktop() && projectStore.libraryMatches.length === 0) {
      projectStore.scanMatchLibrary().then(() => {
        if (isOpen) {
          commitSlides(buildFilteredSlides(slides));
        }
      });
    }
  });

  // Render loop & keyboard bindings while open
  $effect(() => {
    if (!isOpen) return;
    let active = true;
    let rafId: number | null = null;

    tick().then(() => {
      if (active) syncCanvases();
    });

    const onResize = () => syncCanvases();
    const onFsChange = () => {
      isFullscreen = Boolean(document.fullscreenElement);
      syncCanvases();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      const tagName = (e.target as HTMLElement)?.tagName;
      if (tagName === 'INPUT' || tagName === 'TEXTAREA' || tagName === 'SELECT') return;

      const key = e.key.toLowerCase();
      if (key === 'd') {
        e.preventDefault();
        isDrawMode = !isDrawMode;
      } else if (key === 'c') {
        e.preventDefault();
        clearLiveStrokes();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToSlide(currentSlideIdx + 1);
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToSlide(currentSlideIdx - 1);
      } else if (e.code === 'Space') {
        e.preventDefault();
        if (currentSlide?.kind === 'clip') togglePlayPause();
      } else if (key === 'f') {
        e.preventDefault();
        toggleFullscreen();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        if (isDrawMode) {
          isDrawMode = false;
        } else {
          handleClose();
        }
      }
    };

    window.addEventListener('resize', onResize);
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFsChange);

    const loop = () => {
      if (!active) return;
      if (currentSlide?.kind === 'clip' && videoEl && !videoEl.paused) {
        currentTime = videoEl.currentTime;
        const tag = resolveLiveTag(currentSlide.tag, currentSlide.matchId);
        const bounds = clipBounds(currentSlide);
        const angleOff = activePresenterAngle?.offsetSec ?? 0;
        const effStart = Math.max(0, bounds.start + angleOff);
        const effEnd = Math.max(effStart + 0.5, bounds.end + angleOff);
        const telOn = currentSlide.showTelestration !== false && !activePresenterAngle;

        if (
          telOn &&
          autoFreezeEnabled &&
          !isFreezing &&
          !isReplayPass &&
          tag.drawings &&
          tag.drawings.length > 0
        ) {
          const stops = getEffectiveFreezeStopsForTag(tag);
          const hit = stops.find(
            (s) =>
              !triggeredStopIds.has(s.id) &&
              s.time >= bounds.start - 0.1 &&
              s.time <= bounds.end + 0.1 &&
              currentTime >= s.time &&
              currentTime < s.time + 0.35
          );
          if (hit) {
            triggeredStopIds.add(hit.id);
            videoEl.currentTime = hit.time;
            currentTime = hit.time;
            triggerSlideFreeze(tag, hit);
          }
        }

        if (!isFreezing && currentTime >= effEnd) {
          if (telOn && tag.appendCleanReplay && !isReplayPass) {
            isReplayPass = true;
            videoEl.currentTime = effStart;
            currentTime = effStart;
          } else {
            isReplayPass = false;
            if (currentSlideIdx + 1 < slides.length) {
              goToSlide(currentSlideIdx + 1);
            } else {
              videoEl.pause();
              isPlaying = false;
            }
          }
        }
      }
      drawTelestrationOverlay();
      drawPenOverlay();
      rafId = requestAnimationFrame(loop);
    };

    rafId = requestAnimationFrame(loop);

    return () => {
      active = false;
      window.removeEventListener('resize', onResize);
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFsChange);
      if (rafId !== null) cancelAnimationFrame(rafId);
    };
  });

  function cleanupMediaAndTimers() {
    if (freezeTimer) {
      clearInterval(freezeTimer);
      freezeTimer = null;
    }
    if (activeVoiceAudio) {
      activeVoiceAudio.pause();
      activeVoiceAudio = null;
    }
    if (videoEl) {
      videoEl.pause();
    }
    isFreezing = false;
    isReplayPass = false;
    freezeStartedAtMs = 0;
    isPlaying = false;
  }

  function syncCanvases() {
    if (!stageBoxEl) return;
    const rect = stageBoxEl.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    for (const c of [telCanvasEl, penCanvasEl]) {
      if (!c) continue;
      c.width = Math.max(1, Math.round(rect.width * dpr));
      c.height = Math.max(1, Math.round(rect.height * dpr));
      c.style.width = `${rect.width}px`;
      c.style.height = `${rect.height}px`;
    }
  }

  function drawTelestrationOverlay() {
    if (!telCanvasEl) return;
    const ctx = telCanvasEl.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = telCanvasEl.width / dpr;
    const h = telCanvasEl.height / dpr;
    ctx.save();
    ctx.clearRect(0, 0, telCanvasEl.width, telCanvasEl.height);
    ctx.scale(dpr, dpr);

    if (!isReplayPass && currentSlide?.kind === 'clip' && currentSlide.showTelestration !== false && !activePresenterAngle) {
      const liveTag = resolveLiveTag(currentSlide.tag, currentSlide.matchId);
      const bounds = clipBounds(currentSlide);
      if (liveTag.drawings?.length) {
        renderDrawingsToCanvas(ctx, liveTag.drawings, w, h, currentTime, {
          videoEl,
          chromaConfig: currentSlide.chromaFloorConfig ?? projectStore.chromaFloorConfig,
          clipStartTime: bounds.start,
          clipEndTime: bounds.end,
          subtitleText: liveTag.voiceoverTranscript,
          subtitleCues: liveTag.subtitleCues,
          burnSubtitle: liveTag.burnSubtitle,
          animElapsedSec: isFreezing
            ? Math.max(
                0.05,
                freezeStartedAtMs > 0
                  ? (performance.now() - freezeStartedAtMs) / 1000
                  : activeFreezeDuration - freezeRemaining
              )
            : undefined,
        });
      }
    }
    ctx.restore();
  }

  function drawPenOverlay() {
    if (!penCanvasEl) return;
    const ctx = penCanvasEl.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const w = penCanvasEl.width / dpr;
    const h = penCanvasEl.height / dpr;
    ctx.save();
    ctx.clearRect(0, 0, penCanvasEl.width, penCanvasEl.height);
    ctx.scale(dpr, dpr);

    const all = activeStroke ? [...liveStrokes, activeStroke] : liveStrokes;
    for (const st of all) {
      if (st.points.length < 2) continue;
      ctx.beginPath();
      ctx.moveTo(st.points[0].x * w, st.points[0].y * h);
      for (let i = 1; i < st.points.length; i++) {
        ctx.lineTo(st.points[i].x * w, st.points[i].y * h);
      }
      ctx.strokeStyle = st.color;
      ctx.lineWidth = st.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
      ctx.shadowBlur = 4;
      ctx.stroke();
    }
    ctx.restore();
  }

  async function loadCurrentSlideMedia(autoPlay: boolean) {
    cleanupMediaAndTimers();
    triggeredStopIds.clear();
    isReplayPass = false;
    freezeStartedAtMs = 0;
    voicePlayedForSlide = false;
    await tick();
    syncCanvases();

    if (currentSlide?.kind === 'clip') {
      const bounds = clipBounds(currentSlide);
      const angleOff = activePresenterAngle?.offsetSec ?? 0;
      const effStart = Math.max(0, bounds.start + angleOff);
      const liveTag = resolveLiveTag(currentSlide.tag, currentSlide.matchId);
      const telOn = currentSlide.showTelestration !== false && !activePresenterAngle;
      const srcUrl = activeSlideVideoSrc;
      currentTime = effStart;
      if (videoEl) {
        const slideSpeed = currentSlide.speed ?? 1;
        const slideMuted = Boolean(currentSlide.muted);
        const startPlayback = () => {
          if (!videoEl) return;
          videoEl.currentTime = effStart;
          videoEl.playbackRate = slideSpeed;
          videoEl.muted = slideMuted;
          if (autoPlay && srcUrl) {
            videoEl.play().catch(() => {});
            isPlaying = true;
          }
        };
        if (videoEl.readyState < 1) {
          videoEl.addEventListener('loadedmetadata', startPlayback, { once: true });
        } else {
          startPlayback();
        }
      }
      if (
        telOn &&
        voiceoverEnabled &&
        liveTag.voiceoverAudioBase64 &&
        (!autoFreezeEnabled || getEffectiveFreezeStopsForTag(liveTag).length === 0)
      ) {
        playSlideVoiceover(liveTag);
      }
    }
  }

  function playSlideVoiceover(tag: VideoTagEvent) {
    if (!voiceoverEnabled || !tag.voiceoverAudioBase64 || voicePlayedForSlide) return;
    voicePlayedForSlide = true;
    try {
      activeVoiceAudio = new Audio(tag.voiceoverAudioBase64);
      activeVoiceAudio.play().catch(() => {});
    } catch {
      activeVoiceAudio = null;
    }
  }

  function triggerSlideFreeze(tag: VideoTagEvent, stop: FreezeStop) {
    if (!videoEl) return;
    videoEl.pause();
    isPlaying = false;
    isFreezing = true;
    activeFreezeDuration = Math.max(0.2, stop.duration);
    activeFreezeLabel = stop.label || 'FREEZE ANALISIS';
    freezeRemaining = activeFreezeDuration;
    freezeStartedAtMs = performance.now();
    playSlideVoiceover(tag);

    if (freezeTimer) clearInterval(freezeTimer);
    freezeTimer = setInterval(() => {
      freezeRemaining -= 0.1;
      if (freezeRemaining <= 0) {
        resumeFromFreeze();
      }
    }, 100);
  }

  function resumeFromFreeze() {
    if (freezeTimer) {
      clearInterval(freezeTimer);
      freezeTimer = null;
    }
    isFreezing = false;
    freezeStartedAtMs = 0;
    if (videoEl && currentSlide?.kind === 'clip') {
      videoEl.play().catch(() => {});
      isPlaying = true;
    }
  }

  function togglePlayPause() {
    if (!videoEl || currentSlide?.kind !== 'clip') return;
    if (isFreezing) {
      resumeFromFreeze();
      return;
    }
    if (videoEl.paused) {
      videoEl.play().catch(() => {});
      isPlaying = true;
    } else {
      videoEl.pause();
      isPlaying = false;
    }
  }

  function goToSlide(nextIdx: number) {
    if (slides.length === 0) return;
    const clamped = Math.max(0, Math.min(slides.length - 1, nextIdx));
    if (clamped === currentSlideIdx && currentSlide) return;
    currentSlideIdx = clamped;
    presenterAngleId = 'main';
    liveStrokes = [];
    loadCurrentSlideMedia(true);
  }

  function insertSlideAfterCurrent(newSlide: PresentationSlide, autoPlay = false) {
    const insertAt = slides.length === 0 ? 0 : currentSlideIdx + 1;
    commitSlides([...slides.slice(0, insertAt), newSlide, ...slides.slice(insertAt)]);
    currentSlideIdx = insertAt;
    liveStrokes = [];
    loadCurrentSlideMedia(autoPlay);
  }

  function insertTacticalSlide() {
    const tacCount = slides.filter((s) => s.kind === 'tactical').length + 1;
    insertSlideAfterCurrent({
      id: `tac-${Date.now()}`,
      kind: 'tactical',
      title: `Papan Taktik 2D #${tacCount}`,
    });
  }

  function insertTitleSlide() {
    insertSlideAfterCurrent({
      id: `title-${Date.now()}`,
      kind: 'title',
      title: 'BABAK / POIN TAKTIK',
      subtitle: projectStore.videoTitle || 'Briefing Ruang Ganti',
      bgColor: '#0f172a',
    });
  }

  function readImageAsDataUrl(file: File, onReady: (dataUrl: string) => void) {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') onReady(reader.result);
    };
    reader.readAsDataURL(file);
  }

  function onImageFileSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    readImageAsDataUrl(file, (dataUrl) => {
      insertSlideAfterCurrent({
        id: `img-${Date.now()}`,
        kind: 'image',
        title: file.name.replace(/\.[^.]+$/, '') || 'Diagram Taktik',
        imageDataUrl: dataUrl,
      });
    });
    input.value = '';
  }

  function onLogoFileSelected(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (!file) return;
    readImageAsDataUrl(file, (dataUrl) => {
      projectStore.clubLogoDataUrl = dataUrl;
    });
    input.value = '';
  }

  function syncFilteredClipsToSlides() {
    const next = buildFilteredSlides(slides);
    commitSlides(next);
    currentSlideIdx = Math.min(currentSlideIdx, Math.max(0, next.length - 1));
    loadCurrentSlideMedia(false);
  }

  function toggleCurrentSlideTelestration() {
    if (currentSlide?.kind !== 'clip') return;
    const nextVal = !(currentSlide.showTelestration !== false);
    if (!nextVal && isFreezing) {
      resumeFromFreeze();
    }
    updateCurrentClipSlide({ showTelestration: nextVal });
    if (currentSlide.matchId) {
      projectStore.setClipTelestration(
        projectStore.getClipKey(currentSlide.matchId, currentSlide.tag.id),
        nextVal
      );
    }
  }

  function moveSlide(idx: number, dir: -1 | 1) {
    const target = idx + dir;
    if (idx < 0 || idx >= slides.length || target < 0 || target >= slides.length) return;
    const next = [...slides];
    const [item] = next.splice(idx, 1);
    next.splice(target, 0, item);
    if (currentSlideIdx === idx) currentSlideIdx = target;
    else if (currentSlideIdx === target) currentSlideIdx = idx;
    commitSlides(next);
  }

  function removeSlideAt(idx: number) {
    if (idx < 0 || idx >= slides.length) return;
    const next = slides.filter((_, i) => i !== idx);
    commitSlides(next);
    if (currentSlideIdx >= next.length) {
      currentSlideIdx = Math.max(0, next.length - 1);
    }
    liveStrokes = [];
    loadCurrentSlideMedia(false);
  }

  function updateSlideAt(idx: number, updater: (s: PresentationSlide) => PresentationSlide) {
    if (idx < 0 || idx >= slides.length) return;
    const next = slides.map((s, i) => (i === idx ? updater(s) : s));
    commitSlides(next);
  }

  function updateCurrentClipSlide(patch: Partial<Extract<PresentationSlide, { kind: 'clip' }>>) {
    if (currentSlide?.kind !== 'clip') return;
    updateSlideAt(currentSlideIdx, (s) => (s.kind === 'clip' ? { ...s, ...patch } : s));
    if (videoEl) {
      if (patch.speed !== undefined) videoEl.playbackRate = patch.speed;
      if (patch.muted !== undefined) videoEl.muted = patch.muted;
      if (patch.trimStart !== undefined && videoEl.currentTime < patch.trimStart) {
        videoEl.currentTime = patch.trimStart;
        currentTime = patch.trimStart;
      }
    }
  }

  // Live Pen Pointer Handlers
  function getNormPt(e: PointerEvent): Point2D {
    if (!penCanvasEl) return { x: 0, y: 0 };
    const r = penCanvasEl.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width))),
      y: Math.max(0, Math.min(1, (e.clientY - r.top) / Math.max(1, r.height))),
    };
  }

  function onPenDown(e: PointerEvent) {
    if (!isDrawMode) return;
    isDrawingStroke = true;
    activeStroke = { color: penColor, width: 4, points: [getNormPt(e)] };
  }

  function onPenMove(e: PointerEvent) {
    if (!isDrawMode || !isDrawingStroke || !activeStroke) return;
    activeStroke = {
      ...activeStroke,
      points: [...activeStroke.points, getNormPt(e)],
    };
  }

  function onPenUp() {
    if (!isDrawingStroke || !activeStroke) return;
    isDrawingStroke = false;
    if (activeStroke.points.length >= 2) {
      liveStrokes = [...liveStrokes, activeStroke];
    }
    activeStroke = null;
  }

  function clearLiveStrokes() {
    liveStrokes = [];
    activeStroke = null;
  }

  function undoLiveStroke() {
    if (liveStrokes.length > 0) {
      liveStrokes = liveStrokes.slice(0, -1);
    }
  }

  async function toggleFullscreen() {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      } else {
        await document.exitFullscreen();
      }
    } catch {
      // Ignore if environment rejects fullscreen
    }
  }

  function handleClose() {
    cleanupMediaAndTimers();
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    }
    onClose();
  }
</script>

{#if isOpen}
<div class="presenter-overlay" role="dialog" aria-label="Fullscreen Presentation Studio" tabindex="-1">
  <!-- TOP MINIMAL HUD -->
  <div class="presenter-top-hud">
    <div class="pth-left">
      <span class="pth-badge">PRESENTER STUDIO</span>
      <span class="pth-match">{projectStore.videoTitle}</span>
      {#if currentSlide}
        {#if currentSlide.kind === 'clip' && currentSlide.matchTitle}
          <span class="pth-match-badge">{currentSlide.matchTitle}</span>
        {/if}
        <span class="pth-slide-pill">
          Slide {currentSlideIdx + 1}/{slides.length}: <strong>{currentSlide.title}</strong>
        </span>
        {#if currentSlide.kind === 'clip' && projectStore.periodKickoffs.length > 0}
          <span class="pth-clock">
            {projectStore.formatMatchClock(currentTime)}
          </span>
        {/if}
      {/if}
    </div>

    <div class="pth-right">
      <input
        bind:this={imageInputEl}
        type="file"
        accept="image/*"
        class="hidden-file-input"
        onchange={onImageFileSelected}
      />
      <input
        bind:this={logoInputEl}
        type="file"
        accept="image/*"
        class="hidden-file-input"
        onchange={onLogoFileSelected}
      />
      <button type="button" class="hud-btn" class:active-draw={showFilterPanel} onclick={() => (showFilterPanel = !showFilterPanel)} title="Filter Klip Lintas Pertandingan (Tag × Label × Pemain × Telestrasi)">
        <Filter size={13} />
        <span>Filter Klip</span>
      </button>
      <button type="button" class="hud-btn" onclick={() => (showSlideDrawer = !showSlideDrawer)}>
        <List size={14} />
        <span>Slide ({slides.length})</span>
      </button>
      <button type="button" class="hud-btn" onclick={syncFilteredClipsToSlides} title="Sinkronkan ulang klip sesuai filter aktif">
        <RefreshCw size={13} />
        <span>Sinkron Klip</span>
      </button>
      <button type="button" class="hud-btn" onclick={insertTitleSlide} title="Sisipkan Kartu Judul / Pemisah Babak">
        <Type size={13} />
        <span>+ Judul</span>
      </button>
      <button type="button" class="hud-btn" onclick={() => imageInputEl?.click()} title="Sisipkan Slide Gambar / Diagram Pelatih">
        <ImageIcon size={13} />
        <span>+ Gambar</span>
      </button>
      <button type="button" class="hud-btn" onclick={insertTacticalSlide} title="Sisipkan Slide Papan Taktik 2D">
        <Plus size={14} />
        <span>+ Taktik 2D</span>
      </button>
      <button type="button" class="hud-btn" onclick={() => logoInputEl?.click()} title="Pasang Logo Klub sebagai Watermark Presentasi">
        <Shield size={13} />
        <span>{projectStore.clubLogoDataUrl ? 'Ganti Logo' : '+ Logo'}</span>
      </button>
      {#if projectStore.clubLogoDataUrl}
        <button type="button" class="hud-btn" onclick={() => (projectStore.clubLogoDataUrl = null)} title="Hapus Logo Watermark">
          <X size={12} />
        </button>
      {/if}
      <button type="button" class="hud-btn" onclick={toggleFullscreen} title="Toggle Layar Penuh (F)">
        {#if isFullscreen}
          <Minimize2 size={14} />
        {:else}
          <Maximize2 size={14} />
        {/if}
      </button>
      <button type="button" class="hud-btn hud-exit" onclick={handleClose} title="Keluar Presentasi (Esc)">
        <X size={15} />
        <span>Keluar</span>
      </button>
    </div>
  </div>

  {#if showFilterPanel}
    <ClipFilterBar compact={true} onFilterChange={syncFilteredClipsToSlides} />
  {/if}

  <!-- STAGE AREA -->
  <div class="presenter-stage-wrap">
    {#if showSlideDrawer}
      <aside class="slide-drawer">
        <div class="sd-hdr">
          <span>SUSUNAN BRIEFING ({slides.length})</span>
          <button type="button" class="sd-close" onclick={() => (showSlideDrawer = false)}>
            <X size={13} />
          </button>
        </div>
        <div class="sd-list">
          {#each slides as s, idx (s.id)}
            <div class="sd-row" class:active={idx === currentSlideIdx}>
              <button type="button" class="sd-select" onclick={() => goToSlide(idx)}>
                <span class="sd-num">{idx + 1}</span>
                <span class="sd-kind">
                  {s.kind === 'tactical' ? '2D' : s.kind === 'title' ? 'JDL' : s.kind === 'image' ? 'IMG' : 'VID'}
                </span>
                <span class="sd-title">
                  {s.title}
                  {#if s.kind === 'clip' && s.matchTitle}
                    <small class="sd-match-sub">{s.matchTitle}</small>
                  {/if}
                </span>
              </button>
              <button type="button" class="sd-act" disabled={idx === 0} onclick={() => moveSlide(idx, -1)} title="Geser ke atas">
                <ArrowUp size={11} />
              </button>
              <button type="button" class="sd-act" disabled={idx === slides.length - 1} onclick={() => moveSlide(idx, 1)} title="Geser ke bawah">
                <ArrowDown size={11} />
              </button>
              <button type="button" class="sd-del" onclick={() => removeSlideAt(idx)} title="Hapus slide dari briefing">
                <Trash2 size={12} />
              </button>
            </div>
          {/each}
        </div>
      </aside>
    {/if}

    <div class="stage-viewport" bind:this={stageBoxEl}>
      {#if projectStore.clubLogoDataUrl}
        <img src={projectStore.clubLogoDataUrl} alt="Logo Klub" class="club-watermark" />
      {/if}

      {#if !currentSlide}
        <div class="empty-stage">
          <h3>Belum Ada Klip atau Slide Presentasi</h3>
          <p>Tambahkan klip ke Playlist, klik <strong>Sinkron Klip</strong>, atau sisipkan <strong>+ Judul</strong> / <strong>+ Gambar</strong> / <strong>+ Taktik 2D</strong>.</p>
          <div class="empty-actions">
            <button type="button" class="hud-btn hud-primary" onclick={insertTitleSlide}>
              <Type size={14} />
              <span>+ Kartu Judul</span>
            </button>
            <button type="button" class="hud-btn" onclick={insertTacticalSlide}>
              <LayoutGrid size={14} />
              <span>+ Papan Taktik 2D</span>
            </button>
          </div>
        </div>
      {:else if currentSlide.kind === 'title'}
        <div
          class="title-card-stage"
          style="background: radial-gradient(circle at top right, rgba(56,189,248,0.18), transparent 55%), linear-gradient(135deg, {currentSlide.bgColor || '#0f172a'}, #020617);"
        >
          {#if projectStore.clubLogoDataUrl}
            <img src={projectStore.clubLogoDataUrl} alt="Logo Klub" class="title-card-logo" />
          {/if}
          <input
            type="text"
            class="title-card-heading"
            value={currentSlide.title}
            oninput={(e) => {
              const val = e.currentTarget.value;
              updateSlideAt(currentSlideIdx, (s) => (s.kind === 'title' ? { ...s, title: val } : s));
            }}
            placeholder="Judul Babak / Fokus Taktik..."
          />
          <input
            type="text"
            class="title-card-sub"
            value={currentSlide.subtitle || ''}
            oninput={(e) => {
              const val = e.currentTarget.value;
              updateSlideAt(currentSlideIdx, (s) => (s.kind === 'title' ? { ...s, subtitle: val } : s));
            }}
            placeholder="Subjudul / Catatan Pelatih..."
          />
          <div class="title-bg-swatches">
            {#each TITLE_BG_COLORS as bg}
              <button
                type="button"
                class="bg-swatch"
                class:selected={(currentSlide.bgColor || '#0f172a') === bg}
                style="background-color: {bg};"
                onclick={() => updateSlideAt(currentSlideIdx, (s) => (s.kind === 'title' ? { ...s, bgColor: bg } : s))}
                aria-label="Warna latar {bg}"
              ></button>
            {/each}
          </div>
        </div>
      {:else if currentSlide.kind === 'image'}
        <div class="image-slide-stage">
          <img src={currentSlide.imageDataUrl} alt={currentSlide.title} class="image-slide-img" />
          {#if currentSlide.caption}
            <div class="slide-caption-banner">{currentSlide.caption}</div>
          {/if}
        </div>
      {:else if currentSlide.kind === 'tactical'}
        <div class="tactical-slide-host">
          <TacticalBoard />
        </div>
      {:else}
        <div
          class="video-zoom-host"
          style={activeCameraZoom
            ? `transform: scale(${activeCameraZoom.scale}); transform-origin: ${activeCameraZoom.x * 100}% ${activeCameraZoom.y * 100}%;`
            : ''}
        >
          {#if activeSlideVideoSrc}
            <!-- svelte-ignore a11y_media_has_caption -->
            <video
              bind:this={videoEl}
              src={activeSlideVideoSrc}
              crossorigin="anonymous"
              class="presenter-video"
              onclick={togglePlayPause}
            ></video>
          {:else}
            <div class="mock-clip-slide">
              <span class="mock-cat" style="background-color: {currentSlide.tag.color};">
                {currentSlide.tag.category}
              </span>
              <h2>{currentSlide.title}</h2>
              <p>
                {currentSlide.tag.playerLabel || ''} · {currentSlide.tag.startTime.toFixed(1)}s – {currentSlide.tag.endTime.toFixed(1)}s
              </p>
            </div>
          {/if}

          <canvas bind:this={telCanvasEl} class="tel-overlay-canvas"></canvas>
        </div>

        {#if currentSlide.caption}
          <div class="slide-caption-banner">{currentSlide.caption}</div>
        {/if}

        {#if isFreezing}
          <div class="freeze-pill-hud">
            <span class="fp-dot"></span>
            <span>{activeFreezeLabel.toUpperCase()} · {Math.max(0, freezeRemaining).toFixed(1)}s</span>
            <button type="button" class="fp-resume" onclick={resumeFromFreeze}>Lanjut</button>
          </div>
        {:else if isReplayPass}
          <div class="freeze-pill-hud replay-pill-hud">
            <span class="fp-dot replay-dot"></span>
            <span>REPLAY BERSIH (1x)</span>
          </div>
        {/if}
      {/if}

      <!-- LIVE ANNOTATION PEN LAYER -->
      <canvas
        bind:this={penCanvasEl}
        class="pen-overlay-canvas"
        class:drawing={isDrawMode}
        onpointerdown={onPenDown}
        onpointermove={onPenMove}
        onpointerup={onPenUp}
      ></canvas>
    </div>
  </div>

  <!-- BOTTOM CONTROL HUD -->
  <div class="presenter-bottom-hud">
    <div class="pbh-group">
      <button
        type="button"
        class="hud-btn"
        disabled={currentSlideIdx <= 0}
        onclick={() => goToSlide(currentSlideIdx - 1)}
        title="Slide Sebelumnya (←)"
      >
        <ChevronLeft size={15} />
        <span>Prev</span>
      </button>

      {#if currentSlide?.kind === 'clip'}
        <button type="button" class="hud-btn hud-primary" onclick={togglePlayPause} title="Play / Pause (Spasi)">
          {#if isPlaying}
            <Pause size={15} />
          {:else}
            <Play size={15} />
          {/if}
        </button>
      {/if}

      <button
        type="button"
        class="hud-btn"
        disabled={currentSlideIdx >= slides.length - 1}
        onclick={() => goToSlide(currentSlideIdx + 1)}
        title="Slide Berikutnya (→)"
      >
        <span>Next</span>
        <ChevronRight size={15} />
      </button>
    </div>

    <div class="pbh-group">
      <button
        type="button"
        class="hud-btn"
        class:active-draw={isDrawMode}
        onclick={() => (isDrawMode = !isDrawMode)}
        title="Coret langsung di proyektor (D)"
      >
        <PenTool size={14} />
        <span>{isDrawMode ? 'Pen Aktif (D)' : 'Coret (D)'}</span>
      </button>

      <div class="pen-colors">
        {#each PEN_COLORS as c}
          <button
            type="button"
            class="pen-dot"
            class:selected={penColor === c}
            style="background-color: {c};"
            onclick={() => {
              penColor = c;
              isDrawMode = true;
            }}
            aria-label="Warna pena {c}"
          ></button>
        {/each}
      </div>

      <button type="button" class="hud-btn" onclick={undoLiveStroke} title="Undo coretan terakhir">
        <Undo2 size={14} />
      </button>
      <button type="button" class="hud-btn" onclick={clearLiveStrokes} title="Hapus semua coretan (C)">
        <Eraser size={14} />
        <span>Hapus (C)</span>
      </button>
    </div>

    <div class="pbh-group">
      {#if currentSlide?.kind === 'clip'}
        {@const bounds = clipBounds(currentSlide)}
        <div class="clip-ctrl-group" title="Kecepatan putar non-destruktif">
          {#each [0.5, 1, 1.5] as spd}
            <button
              type="button"
              class="spd-pill"
              class:active={(currentSlide.speed ?? 1) === spd}
              onclick={() => updateCurrentClipSlide({ speed: spd })}
            >
              {spd}x
            </button>
          {/each}
        </div>
        <button
          type="button"
          class="hud-btn"
          class:active-draw={Boolean(currentSlide.muted)}
          onclick={() => updateCurrentClipSlide({ muted: !currentSlide.muted })}
          title="Bisukan audio video klip ini (non-destruktif)"
        >
          {#if currentSlide.muted}
            <VolumeX size={13} />
          {:else}
            <Volume2 size={13} />
          {/if}
          <span>{currentSlide.muted ? 'Mute Klip' : 'Audio Klip'}</span>
        </button>
        <button
          type="button"
          class="hud-btn"
          class:active-draw={currentSlide.showTelestration !== false}
          onclick={toggleCurrentSlideTelestration}
          title="Tampilkan atau sembunyikan anotasi telestrasi & freeze pada slide ini"
        >
          <Sparkles size={13} />
          <span>{currentSlide.showTelestration !== false ? 'Telestrasi' : 'Polos'}</span>
        </button>
        {#if (!currentSlide.matchId || currentSlide.matchId === '__active__') && projectStore.secondaryAngles.length > 0}
          <div class="clip-ctrl-group" title="Ganti sudut kamera untuk klip ini">
            <button
              type="button"
              class="spd-pill"
              class:active={presenterAngleId === 'main'}
              onclick={() => {
                presenterAngleId = 'main';
                loadCurrentSlideMedia(isPlaying);
              }}
            >
              Cam 1
            </button>
            {#each projectStore.secondaryAngles as ang (ang.id)}
              <button
                type="button"
                class="spd-pill"
                class:active={presenterAngleId === ang.id}
                onclick={() => {
                  presenterAngleId = ang.id;
                  loadCurrentSlideMedia(isPlaying);
                }}
              >
                {ang.name}
              </button>
            {/each}
          </div>
        {/if}
        <div class="trim-pill" title="Trim In / Out sementara untuk presentasi (tidak mengubah klip asli)">
          <span>In {bounds.start.toFixed(1)}s</span>
          <button type="button" class="trim-step" onclick={() => updateCurrentClipSlide({ trimStart: Math.max(0, bounds.start - 0.5) })}>-</button>
          <button type="button" class="trim-step" onclick={() => updateCurrentClipSlide({ trimStart: Math.min(bounds.end - 0.5, bounds.start + 0.5) })}>+</button>
          <span>Out {bounds.end.toFixed(1)}s</span>
          <button type="button" class="trim-step" onclick={() => updateCurrentClipSlide({ trimEnd: Math.max(bounds.start + 0.5, bounds.end - 0.5) })}>-</button>
          <button type="button" class="trim-step" onclick={() => updateCurrentClipSlide({ trimEnd: bounds.end + 0.5 })}>+</button>
          {#if currentSlide.trimStart !== undefined || currentSlide.trimEnd !== undefined}
            <button type="button" class="trim-step" onclick={() => updateCurrentClipSlide({ trimStart: undefined, trimEnd: undefined })} title="Reset trim">↺</button>
          {/if}
        </div>
        <input
          type="text"
          class="caption-input"
          value={currentSlide.caption || ''}
          oninput={(e) => updateCurrentClipSlide({ caption: e.currentTarget.value })}
          placeholder="Caption ruang ganti..."
        />
      {:else if currentSlide?.kind === 'image'}
        <input
          type="text"
          class="caption-input"
          value={currentSlide.caption || ''}
          oninput={(e) => {
            const val = e.currentTarget.value;
            updateSlideAt(currentSlideIdx, (s) => (s.kind === 'image' ? { ...s, caption: val } : s));
          }}
          placeholder="Caption diagram..."
        />
      {/if}

      <label class="hud-toggle">
        <input type="checkbox" bind:checked={autoFreezeEnabled} />
        <span>Auto-Freeze</span>
      </label>
      <button
        type="button"
        class="hud-btn"
        onclick={() => (voiceoverEnabled = !voiceoverEnabled)}
        title="Suara Voiceover Pelatih"
      >
        {#if voiceoverEnabled}
          <Volume2 size={14} />
        {:else}
          <VolumeX size={14} />
        {/if}
      </button>
    </div>
  </div>
</div>
{/if}

<style>
  .presenter-overlay {
    position: fixed;
    inset: 0;
    z-index: 200;
    background: #030712;
    color: #f8fafc;
    display: flex;
    flex-direction: column;
    overflow: hidden;
  }

  .presenter-top-hud,
  .presenter-bottom-hud {
    height: 46px;
    min-height: 46px;
    background: rgba(7, 14, 28, 0.94);
    border-bottom: 1px solid #1a355d;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 14px;
    gap: 10px;
    flex-shrink: 0;
  }

  .presenter-bottom-hud {
    border-bottom: none;
    border-top: 1px solid #1a355d;
  }

  .pth-left,
  .pth-right,
  .pbh-group {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .pth-badge {
    font-size: 9px;
    font-weight: 900;
    letter-spacing: 0.08em;
    background: linear-gradient(135deg, #0284c7, #2563eb);
    color: #ffffff;
    padding: 3px 8px;
    border-radius: 4px;
    white-space: nowrap;
  }

  .pth-match {
    font-size: 11px;
    font-weight: 700;
    color: #93c5fd;
    max-width: 180px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pth-slide-pill {
    font-size: 11px;
    color: #cbd5e1;
    background: #0b172a;
    border: 1px solid #1a355d;
    padding: 3px 9px;
    border-radius: 999px;
    max-width: 300px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .pth-clock {
    font-family: 'Fira Code', monospace;
    font-size: 11px;
    font-weight: 800;
    color: #34d399;
    background: rgba(16, 185, 129, 0.14);
    border: 1px solid rgba(16, 185, 129, 0.4);
    padding: 2px 7px;
    border-radius: 4px;
  }

  .hud-btn {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    background: #0b172a;
    border: 1px solid #1e3a5f;
    color: #cbd5e1;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 10px;
    border-radius: 6px;
    cursor: pointer;
    white-space: nowrap;
  }

  .hud-btn:hover:not(:disabled) {
    border-color: #38bdf8;
    color: #ffffff;
  }

  .hud-btn:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }

  .hud-btn.hud-primary {
    background: linear-gradient(135deg, #0284c7, #2563eb);
    border-color: #38bdf8;
    color: #ffffff;
  }

  .hud-btn.active-draw {
    background: #059669;
    border-color: #34d399;
    color: #ffffff;
  }

  .hud-btn.hud-exit {
    border-color: #7f1d1d;
    color: #fca5a5;
  }

  .hud-btn.hud-exit:hover {
    background: #b91c1c;
    color: #ffffff;
  }

  .presenter-stage-wrap {
    flex: 1;
    min-height: 0;
    display: flex;
    overflow: hidden;
    position: relative;
  }

  .slide-drawer {
    width: 260px;
    background: #07101f;
    border-right: 1px solid #1a355d;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
  }

  .sd-hdr {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 10px 12px;
    font-size: 10px;
    font-weight: 800;
    color: #38bdf8;
    border-bottom: 1px solid #1a355d;
  }

  .sd-close {
    background: transparent;
    border: none;
    color: #94a3b8;
    cursor: pointer;
  }

  .sd-list {
    flex: 1;
    overflow-y: auto;
    padding: 8px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .sd-row {
    display: flex;
    align-items: center;
    gap: 4px;
    background: #0b1629;
    border: 1px solid #152b4f;
    border-radius: 6px;
    padding: 4px;
  }

  .sd-row.active {
    border-color: #38bdf8;
    background: #102a4d;
  }

  .sd-select {
    flex: 1;
    min-width: 0;
    display: flex;
    align-items: center;
    gap: 6px;
    background: transparent;
    border: none;
    color: #e2e8f0;
    font-size: 11px;
    cursor: pointer;
    text-align: left;
  }

  .sd-num {
    font-family: monospace;
    font-weight: 800;
    color: #38bdf8;
  }

  .sd-kind {
    font-size: 8.5px;
    font-weight: 900;
    padding: 1px 4px;
    border-radius: 3px;
    background: #1e293b;
    color: #93c5fd;
  }

  .sd-title {
    flex: 1;
    min-width: 0;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .sd-del {
    background: transparent;
    border: none;
    color: #ef4444;
    cursor: pointer;
    padding: 3px;
  }

  .stage-viewport {
    flex: 1;
    min-width: 0;
    position: relative;
    background: #000000;
    display: flex;
    align-items: center;
    justify-content: center;
    overflow: hidden;
  }

  .tactical-slide-host {
    width: 100%;
    height: 100%;
  }

  .video-zoom-host {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: transform 0.45s cubic-bezier(0.22, 1, 0.36, 1);
  }

  .presenter-video {
    width: 100%;
    height: 100%;
    object-fit: contain;
  }

  .tel-overlay-canvas {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 10;
  }

  .pen-overlay-canvas {
    position: absolute;
    inset: 0;
    pointer-events: none;
    z-index: 25;
  }

  .pen-overlay-canvas.drawing {
    pointer-events: auto;
    cursor: crosshair;
  }

  .freeze-pill-hud {
    position: absolute;
    top: 16px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 20;
    display: flex;
    align-items: center;
    gap: 10px;
    background: rgba(8, 22, 42, 0.92);
    border: 1px solid #38bdf8;
    border-radius: 999px;
    padding: 6px 14px;
    font-size: 11px;
    font-weight: 800;
    color: #38bdf8;
  }

  .fp-dot {
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #ef4444;
  }

  .replay-pill-hud {
    border-color: #10b981;
    color: #34d399;
  }

  .fp-dot.replay-dot {
    background: #10b981;
  }

  .fp-resume {
    background: #0284c7;
    border: none;
    color: #ffffff;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 9px;
    border-radius: 999px;
    cursor: pointer;
  }

  .empty-stage,
  .mock-clip-slide {
    text-align: center;
    color: #cbd5e1;
    max-width: 480px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 10px;
  }

  .mock-cat {
    font-size: 11px;
    font-weight: 900;
    color: #ffffff;
    padding: 3px 10px;
    border-radius: 999px;
  }

  .pen-colors {
    display: flex;
    align-items: center;
    gap: 5px;
  }

  .pen-dot {
    width: 16px;
    height: 16px;
    border-radius: 50%;
    border: 2px solid transparent;
    cursor: pointer;
  }

  .pen-dot.selected {
    border-color: #ffffff;
    transform: scale(1.15);
  }

  .hud-toggle {
    display: inline-flex;
    align-items: center;
    gap: 5px;
    font-size: 11px;
    color: #cbd5e1;
    cursor: pointer;
  }

  @media (max-width: 1120px) {
    .pth-match {
      display: none;
    }
    .hud-btn span {
      display: none;
    }
  }

  .hidden-file-input {
    display: none;
  }

  .sd-act {
    background: transparent;
    border: none;
    color: #64748b;
    cursor: pointer;
    padding: 2px;
    display: inline-flex;
    align-items: center;
  }

  .sd-act:hover:not(:disabled) {
    color: #38bdf8;
  }

  .sd-act:disabled {
    opacity: 0.25;
    cursor: not-allowed;
  }

  .club-watermark {
    position: absolute;
    top: 14px;
    right: 18px;
    max-width: 68px;
    max-height: 68px;
    object-fit: contain;
    opacity: 0.86;
    z-index: 8;
    pointer-events: none;
    filter: drop-shadow(0 2px 8px rgba(0, 0, 0, 0.7));
  }

  .empty-actions {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .title-card-stage {
    width: 100%;
    height: 100%;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 14px;
    padding: 36px;
  }

  .title-card-logo {
    max-width: 96px;
    max-height: 96px;
    object-fit: contain;
    margin-bottom: 6px;
  }

  .title-card-heading {
    width: min(760px, 90%);
    background: transparent;
    border: 1px dashed rgba(148, 163, 184, 0.25);
    border-radius: 10px;
    color: #f8fafc;
    text-align: center;
    font-size: clamp(24px, 3.6vw, 44px);
    font-weight: 900;
    letter-spacing: 0.03em;
    padding: 8px 14px;
  }

  .title-card-sub {
    width: min(640px, 85%);
    background: transparent;
    border: 1px dashed rgba(148, 163, 184, 0.2);
    border-radius: 8px;
    color: #94a3b8;
    text-align: center;
    font-size: clamp(14px, 1.8vw, 20px);
    font-weight: 600;
    padding: 6px 12px;
  }

  .title-bg-swatches {
    display: flex;
    gap: 8px;
    margin-top: 8px;
  }

  .bg-swatch {
    width: 22px;
    height: 22px;
    border-radius: 999px;
    border: 2px solid #475569;
    cursor: pointer;
  }

  .bg-swatch.selected {
    border-color: #38bdf8;
    transform: scale(1.15);
  }

  .image-slide-stage {
    position: relative;
    width: 100%;
    height: 100%;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #020617;
    padding: 16px;
  }

  .image-slide-img {
    max-width: 100%;
    max-height: 100%;
    object-fit: contain;
    border-radius: 8px;
  }

  .slide-caption-banner {
    position: absolute;
    bottom: 18px;
    left: 50%;
    transform: translateX(-50%);
    background: rgba(2, 6, 23, 0.84);
    border: 1px solid rgba(56, 189, 248, 0.55);
    color: #f8fafc;
    font-size: 13px;
    font-weight: 700;
    padding: 6px 16px;
    border-radius: 999px;
    max-width: 82%;
    text-align: center;
    z-index: 9;
    pointer-events: none;
  }

  .clip-ctrl-group {
    display: inline-flex;
    align-items: center;
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 2px;
    gap: 2px;
  }

  .spd-pill {
    background: transparent;
    border: none;
    color: #94a3b8;
    font-size: 10px;
    font-weight: 800;
    padding: 3px 6px;
    border-radius: 4px;
    cursor: pointer;
  }

  .spd-pill.active {
    background: #0284c7;
    color: #ffffff;
  }

  .trim-pill {
    display: inline-flex;
    align-items: center;
    gap: 4px;
    background: #0f172a;
    border: 1px solid #1e293b;
    border-radius: 6px;
    padding: 2px 7px;
    font-size: 10px;
    color: #cbd5e1;
    font-family: 'Fira Code', monospace;
  }

  .trim-step {
    background: #1e293b;
    border: 1px solid #334155;
    color: #e2e8f0;
    border-radius: 3px;
    width: 16px;
    height: 16px;
    font-size: 10px;
    line-height: 1;
    cursor: pointer;
  }

  .trim-step:hover {
    border-color: #38bdf8;
  }

  .caption-input {
    background: #0f172a;
    border: 1px solid #334155;
    border-radius: 6px;
    color: #e2e8f0;
    font-size: 11px;
    padding: 4px 8px;
    width: 148px;
  }

  .pth-match-badge {
    font-size: 10px;
    font-weight: 800;
    background: #0f766e;
    color: #ccfbf1;
    padding: 2px 8px;
    border-radius: 999px;
    max-width: 170px;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .sd-match-sub {
    display: block;
    font-size: 9px;
    color: #5eead4;
    font-weight: 600;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>

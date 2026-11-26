<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { listen, type UnlistenFn } from '@tauri-apps/api/event';
  import type {
    ChromaFloorConfig,
    Point2D,
    PresentationSlide,
    CameraZoomTarget,
  } from '$lib/types';
  import { renderDrawingsToCanvas } from '$lib/export/telestrationRenderer';
  import { isTauriDesktop } from '$lib/stores/projectStore.svelte';
  import { MonitorPlay } from 'lucide-svelte';

  interface LiveStroke {
    color: string;
    width: number;
    points: Point2D[];
  }

  interface ProjectorSyncState {
    slide: PresentationSlide | null;
    slideIndex: number;
    totalSlides: number;
    videoSrc: string | null;
    currentTime: number;
    isPlaying: boolean;
    playbackRate: number;
    isFreezing: boolean;
    freezeLabel: string;
    freezeRemaining: number;
    showTelestration: boolean;
    cameraZoom: CameraZoomTarget | null;
    liveStrokes: LiveStroke[];
    clubLogoDataUrl: string | null;
    chromaFloorConfig: ChromaFloorConfig;
  }

  let syncState = $state<ProjectorSyncState | null>(null);
  let videoEl = $state<HTMLVideoElement | null>(null);
  let telCanvasEl = $state<HTMLCanvasElement | null>(null);
  let penCanvasEl = $state<HTMLCanvasElement | null>(null);
  let stageEl = $state<HTMLDivElement | null>(null);
  let rafId = 0;
  let lastVideoSrc: string | null = null;
  let unlistenTauri: UnlistenFn | null = null;
  let bc: BroadcastChannel | null = null;

  function applySync(next: ProjectorSyncState) {
    syncState = next;
    if (!videoEl) return;

    if (next.videoSrc && next.videoSrc !== lastVideoSrc) {
      lastVideoSrc = next.videoSrc;
      videoEl.src = next.videoSrc;
    }

    if (Math.abs(videoEl.playbackRate - next.playbackRate) > 0.02) {
      videoEl.playbackRate = next.playbackRate || 1.0;
    }

    const drift = Math.abs(videoEl.currentTime - next.currentTime);
    if (drift > 0.25) {
      try {
        videoEl.currentTime = next.currentTime;
      } catch {
        // Ignore seek while loading
      }
    }

    if (next.isPlaying && !next.isFreezing) {
      if (videoEl.paused) {
        videoEl.play().catch(() => {});
      }
    } else if (!videoEl.paused) {
      videoEl.pause();
    }
  }

  function renderProjectorCanvases() {
    if (telCanvasEl && stageEl && syncState) {
      const rect = stageEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (telCanvasEl.width !== w || telCanvasEl.height !== h) {
        telCanvasEl.width = w;
        telCanvasEl.height = h;
      }
      const ctx = telCanvasEl.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        const s = syncState.slide;
        if (s?.kind === 'clip' && syncState.showTelestration && (s.tag.drawings?.length ?? 0) > 0) {
          const t = videoEl && !videoEl.paused ? videoEl.currentTime : syncState.currentTime;
          renderDrawingsToCanvas(ctx, s.tag.drawings!, w, h, t, {
            videoEl,
            chromaConfig: syncState.chromaFloorConfig,
            clipStartTime: s.tag.startTime,
            clipEndTime: s.tag.endTime,
            animElapsedSec: syncState.isFreezing ? 1.0 : undefined,
          });
        }
      }
    }

    if (penCanvasEl && stageEl && syncState) {
      const rect = stageEl.getBoundingClientRect();
      const w = Math.max(1, Math.round(rect.width));
      const h = Math.max(1, Math.round(rect.height));
      if (penCanvasEl.width !== w || penCanvasEl.height !== h) {
        penCanvasEl.width = w;
        penCanvasEl.height = h;
      }
      const ctx = penCanvasEl.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, w, h);
        for (const stroke of syncState.liveStrokes) {
          if (stroke.points.length < 2) continue;
          ctx.beginPath();
          ctx.moveTo(stroke.points[0].x * w, stroke.points[0].y * h);
          for (let i = 1; i < stroke.points.length; i++) {
            ctx.lineTo(stroke.points[i].x * w, stroke.points[i].y * h);
          }
          ctx.strokeStyle = stroke.color;
          ctx.lineWidth = stroke.width;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
      }
    }

    rafId = requestAnimationFrame(renderProjectorCanvases);
  }

  onMount(async () => {
    if (typeof BroadcastChannel !== 'undefined') {
      bc = new BroadcastChannel('futsaltag-projector');
      bc.onmessage = (ev) => {
        if (ev.data && typeof ev.data === 'object') {
          applySync(ev.data as ProjectorSyncState);
        }
      };
    }

    if (isTauriDesktop()) {
      unlistenTauri = await listen<ProjectorSyncState>('projector-sync', (ev) => {
        if (ev.payload) applySync(ev.payload);
      });
    }

    rafId = requestAnimationFrame(renderProjectorCanvases);
  });

  onDestroy(() => {
    if (rafId) cancelAnimationFrame(rafId);
    unlistenTauri?.();
    bc?.close();
  });
</script>

<div class="proj-root" bind:this={stageEl}>
  {#if syncState?.clubLogoDataUrl}
    <img src={syncState.clubLogoDataUrl} alt="Logo Klub" class="proj-logo" />
  {/if}

  {#if !syncState || !syncState.slide}
    <div class="proj-idle">
      <MonitorPlay size={48} class="text-sky-400" />
      <h1>ARF FutsalTag — Layar Proyektor Ke-2</h1>
      <p>Terhubung! Putar slide, klip telestrasi, atau papan taktik dari jendela kontrol laptop untuk menampilkan ke proyektor / TV.</p>
    </div>
  {:else if syncState.slide.kind === 'title'}
    <div
      class="proj-title-slide"
      style="background: radial-gradient(circle at top right, rgba(56,189,248,0.18), transparent 55%), linear-gradient(135deg, {syncState.slide.bgColor || '#0f172a'}, #020617);"
    >
      {#if syncState.clubLogoDataUrl}
        <img src={syncState.clubLogoDataUrl} alt="Logo Klub" class="proj-center-logo" />
      {/if}
      <h1>{syncState.slide.title}</h1>
      {#if syncState.slide.subtitle}
        <p>{syncState.slide.subtitle}</p>
      {/if}
    </div>
  {:else if syncState.slide.kind === 'image'}
    <div class="proj-img-slide">
      <img src={syncState.slide.imageDataUrl} alt={syncState.slide.title} class="proj-img" />
      {#if syncState.slide.caption}
        <div class="proj-caption">{syncState.slide.caption}</div>
      {/if}
    </div>
  {:else}
    <div
      class="proj-zoom-wrap"
      style={syncState.cameraZoom
        ? `transform: scale(${syncState.cameraZoom.scale}); transform-origin: ${syncState.cameraZoom.x * 100}% ${syncState.cameraZoom.y * 100}%;`
        : ''}
    >
      {#if syncState.videoSrc}
        <!-- svelte-ignore a11y_media_has_caption -->
        <video bind:this={videoEl} class="proj-video" muted playsinline></video>
      {:else}
        <div class="proj-idle">
          <h2>{syncState.slide.title}</h2>
          <p>{syncState.slide.kind === 'clip' ? syncState.slide.tag.category : 'Tactical Slide'}</p>
        </div>
      {/if}
      <canvas bind:this={telCanvasEl} class="proj-canvas"></canvas>
    </div>
  {/if}

  <canvas bind:this={penCanvasEl} class="proj-pen-canvas"></canvas>

  {#if syncState?.isFreezing}
    <div class="proj-freeze-badge">
      <span>{syncState.freezeLabel} · {syncState.freezeRemaining.toFixed(1)}s</span>
    </div>
  {/if}
</div>

<style>
  .proj-root { position: fixed; inset: 0; background: #000000; color: #ffffff; overflow: hidden; display: flex; align-items: center; justify-content: center; }
  .proj-logo { position: absolute; top: 18px; right: 24px; max-width: 96px; max-height: 64px; object-fit: contain; z-index: 30; opacity: 0.85; pointer-events: none; }
  .proj-idle { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; text-align: center; max-width: 560px; padding: 24px; color: #cbd5e1; }
  .proj-idle h1 { margin: 0; font-size: 24px; font-weight: 800; color: #ffffff; }
  .proj-idle p { margin: 0; font-size: 14px; color: #94a3b8; line-height: 1.5; }
  .proj-title-slide { width: 100%; height: 100%; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 14px; text-align: center; padding: 48px; }
  .proj-center-logo { width: 92px; height: 92px; object-fit: contain; margin-bottom: 6px; }
  .proj-title-slide h1 { margin: 0; font-size: 46px; font-weight: 900; letter-spacing: -0.02em; }
  .proj-title-slide p { margin: 0; font-size: 22px; color: #94a3b8; max-width: 820px; }
  .proj-img-slide { width: 100%; height: 100%; display: flex; align-items: center; justify-content: center; position: relative; }
  .proj-img { max-width: 100%; max-height: 100%; object-fit: contain; }
  .proj-caption { position: absolute; bottom: 26px; background: rgba(6,11,20,0.88); border: 1px solid #38bdf8; padding: 8px 18px; border-radius: 10px; font-size: 15px; font-weight: 700; }
  .proj-zoom-wrap { width: 100%; height: 100%; position: relative; transition: transform 0.35s ease; }
  .proj-video { width: 100%; height: 100%; object-fit: contain; }
  .proj-canvas, .proj-pen-canvas { position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none; }
  .proj-pen-canvas { z-index: 25; }
  .proj-freeze-badge { position: absolute; top: 18px; left: 24px; background: rgba(180,83,9,0.92); border: 1px solid #fbbf24; color: #ffffff; padding: 6px 14px; border-radius: 999px; font-size: 13px; font-weight: 800; z-index: 35; }
</style>

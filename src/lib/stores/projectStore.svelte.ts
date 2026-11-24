import type {
  WorkflowStage,
  VideoTagEvent,
  DrawingElement,
  ActionPlaylist,
  ActionPlaylistItem,
  TagCategory,
  TagOutcome,
  CourtZone,
  TagRating,
} from '$lib/types';

class ProjectStore {
  stage = $state<WorkflowStage>('hub');
  videoSrc = $state<string | null>(null);
  videoFilePath = $state<string | null>(null);
  videoTitle = $state<string>('Pertandingan Futsal');
  duration = $state<number>(120);
  currentTime = $state<number>(0);
  
  // Tagged events - EMPTY by default for fresh video trimming
  tags = $state<VideoTagEvent[]>([]);

  // Selected clip for Stage 3 Telestrator
  activeClipForDrawing = $state<VideoTagEvent | null>(null);

  // Playlists for Stage 4
  playlists = $state<ActionPlaylist[]>([
    {
      id: 'pl-default',
      title: 'Playlist Pertandingan',
      description: 'Daftar klip hasil tagging momen pertandingan',
      createdAt: new Date().toISOString(),
      items: [],
    },
  ]);

  constructor() {}

  setStage(newStage: WorkflowStage) {
    this.stage = newStage;
  }

  // Load a real fresh user video: CLEARS all previous tags so analyst starts fresh!
  loadVideo(url: string, path: string | null, title: string, dur = 0) {
    this.videoSrc = url;
    this.videoFilePath = path;
    this.videoTitle = title || 'Video Pertandingan Futsal';
    this.duration = dur;
    this.currentTime = 0;
    
    // RESET all tags and playlist items for a clean match trimming workflow
    this.tags = [];
    this.activeClipForDrawing = null;
    this.playlists = [
      {
        id: 'pl-default',
        title: 'Playlist Pertandingan',
        description: 'Daftar klip hasil tagging momen pertandingan',
        createdAt: new Date().toISOString(),
        items: [],
      },
    ];
    this.stage = 'tagging';
  }

  // Load sample demo match with pre-tagged futsal events for demonstration
  loadSampleDemo() {
    this.videoSrc = null; // demo placeholder
    this.videoFilePath = 'sampel_futsal_final.mp4';
    this.videoTitle = 'Sampel Demo: Pendekar United vs Blacksteel (Babak 1)';
    this.duration = 120;
    this.currentTime = 0;

    this.tags = [
      {
        id: 'tag-sample-1',
        title: 'Skema Gol Pivot',
        category: 'Goal',
        startTime: 12.0,
        endTime: 20.0,
        color: '#10b981',
        playerLabel: '#9 Pivot',
        outcomeLabel: 'Gol / Sukses',
        zoneLabel: 'Area Penalti Lawan',
        rating: '⭐⭐⭐ Bagus',
        favorite: true,
        notes: 'Finishing mematikan setelah rotasi 4-0',
        pauseDuration: 3.0,
        drawings: [],
      },
      {
        id: 'tag-sample-2',
        title: 'High Pressing Berhasil',
        category: 'Pressing High',
        startTime: 34.0,
        endTime: 42.0,
        color: '#f59e0b',
        playerLabel: '#7 Flank Kiri',
        outcomeLabel: 'Gol / Sukses',
        zoneLabel: 'Area Bertahan Sendiri',
        rating: '⭐⭐⭐ Bagus',
        favorite: false,
        notes: 'Tekanan flank memaksa turnover lawan',
        pauseDuration: 3.0,
        drawings: [],
      },
      {
        id: 'tag-sample-3',
        title: 'Kebobolan Transisi Cepat',
        category: 'Transition Defense',
        startTime: 65.0,
        endTime: 73.0,
        color: '#ef4444',
        playerLabel: 'Tim Lawan',
        outcomeLabel: 'Keluar / Gagal',
        zoneLabel: 'Area Bertahan Sendiri',
        rating: '❌ Kesalahan Fatal',
        favorite: false,
        notes: 'Covering anchor terlambat saat counter attack',
        pauseDuration: 4.0,
        drawings: [],
      },
    ];

    this.playlists = [
      {
        id: 'pl-default',
        title: 'Playlist Evaluasi Demo',
        description: 'Sampel kompilasi klip evaluasi futsal',
        createdAt: new Date().toISOString(),
        items: this.tags.map((tag, idx) => ({
          id: `pl-item-${idx}`,
          tagEventId: tag.id,
          order: idx + 1,
          pauseDuration: tag.pauseDuration || 3.0,
          title: tag.title,
          tagEvent: tag,
        })),
      },
    ];

    this.stage = 'tagging';
  }

  addTag(tag: VideoTagEvent) {
    this.tags.push(tag);
    // automatically sync with default playlist
    if (this.playlists.length > 0) {
      this.playlists[0].items.push({
        id: `pl-item-${Date.now()}`,
        tagEventId: tag.id,
        order: this.playlists[0].items.length + 1,
        pauseDuration: tag.pauseDuration || 3.0,
        title: tag.title,
        tagEvent: tag,
      });
    }
  }

  updateTag(updated: VideoTagEvent) {
    const idx = this.tags.findIndex((t) => t.id === updated.id);
    if (idx !== -1) {
      this.tags[idx] = updated;
    }
    // sync playlist item
    for (const pl of this.playlists) {
      const pIdx = pl.items.findIndex((item) => item.tagEventId === updated.id);
      if (pIdx !== -1) {
        pl.items[pIdx].tagEvent = updated;
        pl.items[pIdx].title = updated.title;
        pl.items[pIdx].pauseDuration = updated.pauseDuration || 3.0;
      }
    }
  }

  deleteTag(id: string) {
    this.tags = this.tags.filter((t) => t.id !== id);
    for (const pl of this.playlists) {
      pl.items = pl.items.filter((item) => item.tagEventId !== id);
    }
    if (this.activeClipForDrawing?.id === id) {
      this.activeClipForDrawing = null;
    }
  }

  openClipInTelestrator(clip: VideoTagEvent) {
    this.activeClipForDrawing = clip;
    this.stage = 'telestrator';
  }

  saveTelestration(clipId: string, drawings: DrawingElement[], pauseDuration: number) {
    const tag = this.tags.find((t) => t.id === clipId);
    if (tag) {
      tag.drawings = drawings;
      tag.pauseDuration = pauseDuration;
      this.updateTag({ ...tag });
    }
  }

  saveAndNextClip(clipId: string, drawings: DrawingElement[], pauseDuration: number) {
    this.saveTelestration(clipId, drawings, pauseDuration);
    const currIdx = this.tags.findIndex((t) => t.id === clipId);
    if (currIdx !== -1 && currIdx + 1 < this.tags.length) {
      this.activeClipForDrawing = this.tags[currIdx + 1];
    } else {
      // If last clip, go to playlist
      this.stage = 'playlist_export';
    }
  }

  addToPlaylist(clip: VideoTagEvent, playlistId?: string) {
    const targetPl = playlistId
      ? this.playlists.find((p) => p.id === playlistId)
      : this.playlists[0];

    if (targetPl) {
      const existing = targetPl.items.find((item) => item.tagEventId === clip.id);
      if (!existing) {
        targetPl.items.push({
          id: `pl-item-${Date.now()}`,
          tagEventId: clip.id,
          order: targetPl.items.length + 1,
          pauseDuration: clip.pauseDuration || 3.0,
          title: clip.title,
          tagEvent: clip,
        });
      }
    }
  }

  // Export the entire match project as a single .futsal (JSON) structure
  exportProjectJson(): string {
    const projectData = {
      format: 'futsaltag-project',
      version: '1.0',
      exportedAt: new Date().toISOString(),
      matchInfo: {
        title: this.videoTitle,
        duration: this.duration,
        videoFilePath: this.videoFilePath,
      },
      tags: this.tags,
      playlists: this.playlists,
    };
    return JSON.stringify(projectData, null, 2);
  }

  // Download / Save project file (.futsal)
  downloadProjectFile(filename?: string) {
    const json = this.exportProjectJson();
    const name = (filename || this.videoTitle || 'proyek_futsal')
      .replace(/[^a-zA-Z0-9_-]/g, '_')
      .toLowerCase();
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${name}.futsal`;
    a.click();
    URL.revokeObjectURL(url);
  }

  // Import / Load project from JSON content or file
  importProjectJson(jsonStr: string): boolean {
    try {
      const data = JSON.parse(jsonStr);
      if (data.matchInfo) {
        this.videoTitle = data.matchInfo.title || this.videoTitle;
        this.duration = data.matchInfo.duration || this.duration;
        this.videoFilePath = data.matchInfo.videoFilePath || this.videoFilePath;
      }
      if (Array.isArray(data.tags)) {
        this.tags = data.tags;
      }
      if (Array.isArray(data.playlists) && data.playlists.length > 0) {
        this.playlists = data.playlists;
      }
      this.stage = 'tagging';
      return true;
    } catch (err) {
      console.error('Gagal memuat berkas proyek:', err);
      return false;
    }
  }

  resetProject() {
    this.videoSrc = null;
    this.videoFilePath = null;
    this.videoTitle = 'Pertandingan Futsal Baru';
    this.tags = [];
    this.activeClipForDrawing = null;
    this.playlists = [
      {
        id: 'pl-default',
        title: 'Playlist Pertandingan',
        description: 'Daftar klip analisis',
        createdAt: new Date().toISOString(),
        items: [],
      },
    ];
    this.stage = 'hub';
  }
}

export const projectStore = new ProjectStore();

// Types for Futsal Analysis & Tactical System (Teleslator)

export type TeamSide = 'home' | 'away' | 'gk-home' | 'gk-away' | 'referee';

export interface PlayerToken {
  id: string;
  team: TeamSide;
  number: string;
  name: string;
  role?: 'Pivot' | 'Flank L' | 'Flank R' | 'Anchor' | 'GK' | 'Universal';
  x: number; // 0 - 40 meters
  y: number; // 0 - 20 meters
  facingAngle?: number; // radians (0 = pointing right)
  color?: string;
  textColor?: string;
}

export interface BallToken {
  x: number; // 0 - 40 meters
  y: number; // 0 - 20 meters
  height?: number; // meters above ground
}

export type EquipmentType = 'cone-orange' | 'cone-yellow' | 'agility-ladder' | 'mannequin' | 'mini-goal';

export interface EquipmentItem {
  id: string;
  type: EquipmentType;
  x: number;
  y: number;
  rotation?: number;
}

export type DrawingToolType = 
  | 'select'
  | 'pass-arrow'       // Solid line with arrow for pass/shot
  | 'curved-arrow'     // Curved arc arrow for curved pass/shot (Once Sport style)
  | 'run-arrow'        // Dashed line with arrow for player run
  | 'dribble-arrow'    // Wavy / squiggly line for ball dribble
  | 'player-circle'    // Player highlighting ring with number badge
  | 'pressing-zone'    // Transparent shaded polygon for defensive/pressing zones
  | 'vision-cone'      // Conical sector showing player's vision field
  | 'spotlight-3d'     // 3D perspective ellipse spotlight on pitch surface
  | 'distance-line'    // Dynamic line showing distance in meters
  | 'player-ghost'     // Semi-transparent phantom player indicating optimal position
  | 'text-note'        // Floating tactical text banner
  | 'note-text'        // Floating tactical text banner (alias)
  | 'compactness-hull' // Multi-player team compactness polygon
  | 'freehand';        // Freehand tactical marker

export interface Point2D {
  x: number; // meters or normalized
  y: number;
}

export interface TrackingKeyframe {
  time: number; // video timestamp in seconds
  x: number;    // normalized 0..1
  y: number;    // normalized 0..1
}

export interface MultiPlayerTrack {
  id: string;
  label: string;
  team: 'home' | 'away' | 'ball';
  color: string;
  keyframes: TrackingKeyframe[];
}

export interface DrawingElement {
  id: string;
  type: DrawingToolType;
  points: Point2D[];
  color: string;
  secondaryColor?: string;
  lineWidth?: number;
  label?: string;
  isFilled?: boolean;
  opacity?: number;
  timeStart?: number; // for video telestration
  timeEnd?: number;
  targetPlayerId?: string;
  isTracking?: boolean;
  keyframes?: TrackingKeyframe[];
  multiTracks?: MultiPlayerTrack[];
  controlPoint?: Point2D; // For curved arrows (Once Sport style)
  curveOffset?: number;   // Arc height offset
  isChromaFloor?: boolean; // Floor blending mode
  pulseEffect?: boolean;   // Radar / beacon pulse
}

export interface TacticalStep {
  id: string;
  stepNumber: number;
  title: string;
  description: string;
  durationSeconds: number;
  players: PlayerToken[];
  ball: BallToken;
  equipment: EquipmentItem[];
  drawings: DrawingElement[];
}

export type PitchSurfaceType = 'wood' | 'blue-vinyl' | 'green-turf' | 'dark-slate';

export interface TacticalDrill {
  id: string;
  title: string;
  category: 'Build-up (3-1)' | 'Build-up (4-0)' | 'Set Piece (Kick-in)' | 'Set Piece (Corner)' | 'Power Play (5v4)' | 'Defensive Pressing' | 'Counter Attack' | 'Training Drill';
  surfaceType: PitchSurfaceType;
  createdAt: string;
  updatedAt: string;
  coachNotes: string;
  steps: TacticalStep[];
}

// Video Match Analysis Types
export type TagCategory = 
  | 'Goal'
  | 'Shot on Target'
  | 'Shot Off Target'
  | 'Kick-in Set Piece'
  | 'Corner Set Piece'
  | 'Build-up 3-1'
  | 'Build-up 4-0'
  | 'Power Play'
  | 'Pressing High'
  | 'Transition Attack'
  | 'Transition Defense'
  | 'Foul'
  | 'Goalkeeper Save';

export type TagOutcome = 'Gol / Sukses' | 'Terblok / Diselamatkan' | 'Keluar / Gagal' | 'Turnover';
export type CourtZone = 'Area Penalti Lawan' | 'Flank Kiri' | 'Flank Kanan' | 'Area Tengah' | 'Area Bertahan Sendiri';
export type TagRating = '⭐⭐⭐ Bagus' | '⚠️ Evaluasi' | '❌ Kesalahan Fatal';

export interface VideoTagEvent {
  id: string;
  title: string;
  category: TagCategory;
  startTime: number; // seconds
  endTime: number;   // seconds
  color: string;
  playerLabel?: string;     // e.g. '#9 Pivot', '#4 Anchor'
  outcomeLabel?: TagOutcome; // e.g. 'Gol / Sukses'
  zoneLabel?: CourtZone;     // e.g. 'Flank Kiri'
  rating?: TagRating;
  favorite?: boolean;
  notes?: string;
  playersInvolved?: string[];
  drawings?: DrawingElement[];
  pauseDuration?: number; // duration to freeze keyframe during playback / export (default: 3s)
  freezeTimestamp?: number; // frame timestamp where drawings apply
}

export type WorkflowStage = 'hub' | 'tagging' | 'telestrator' | 'playlist_export' | 'coachboard';

export interface ActionPlaylistItem {
  id: string;
  tagEventId: string;
  order: number;
  pauseDuration: number;
  title: string;
  tagEvent: VideoTagEvent;
}

export interface ActionPlaylist {
  id: string;
  title: string;
  description: string;
  createdAt: string;
  items: ActionPlaylistItem[];
}

export type ExportMode = 'merged_video' | 'separate_clips' | 'grouped_folders';

export interface ExportOptions {
  mode: ExportMode;
  includeDrawings: boolean;
  pauseDuration: number;
  exportFormat: 'mp4' | 'mov' | 'webm';
  includeAudio: boolean;
}

export interface VideoProject {
  id: string;
  title: string;
  videoUrl: string;
  videoFileName: string;
  duration: number;
  fps: number;
  createdAt: string;
  tags: VideoTagEvent[];
  calibrationPoints?: Point2D[]; // 4 corners for homography
  surfaceType: PitchSurfaceType;
}

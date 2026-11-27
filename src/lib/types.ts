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
  pulsate?: boolean;
  shape?: 'circle' | 'jersey' | 'triangle' | 'square';
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
  | 'player-link'      // Formation chain linking moving players (Once Sport PlayerFormationWithPlayerCircle2)
  | 'magnifier'        // Zoom lens detail for ball/feet inspection (Once Sport Magnifier)
  | 'player-cross'     // Red/amber X marker for tactical mistake/out-of-position (Once Sport PlayerCross)
  | 'angle-tool'       // 3-point angle measurement arc in degrees (Momen Angle Tool)
  | 'parabolic-arrow'  // 3D parabolic lob/chip flight arrow with pitch ground shadow (Once Sport ParabolicFlightArrow)
  | 'speed-tag'        // Dynamic player sprint velocity km/h readout from tracking + homography
  | 'timer-overlay'    // Broadcast elapsed stopwatch overlay (Once Sport TimerTextSymbol)
  | 'mini-radar'       // 2D miniature futsal court minimap projecting calibrated player dots (Once Sport RadarSymbol)
  | 'wall-barrier'     // 3D defensive wall / block shield curtain (Once Sport WallEffect)
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

export type BroadcastAnimationStyle = 'none' | 'fade' | 'draw-on' | 'pulse';

export interface CameraZoomTarget {
  x: number;     // normalized 0..1
  y: number;     // normalized 0..1
  scale: number; // e.g. 1.15..2.2
}

export interface ChromaFloorConfig {
  enabled: boolean;
  mode?: 'ai-silhouette' | 'chroma-key';
  targetRgb: [number, number, number]; // sampled court floor RGB
  tolerance: number;                   // 10..80 (HSV/RGB distance threshold)
  feather: number;                     // 2..30 (soft edge transition)
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
  manualPins?: TrackingKeyframe[]; // Ground-truth user correction pins for guided re-tracking
  multiTracks?: MultiPlayerTrack[];
  controlPoint?: Point2D; // For curved arrows (Once Sport style)
  curveOffset?: number;   // Arc height offset
  isChromaFloor?: boolean; // Floor blending mode
  pulseEffect?: boolean;   // Radar / beacon pulse
  motionTrail?: boolean;   // Broadcast motion comet trail (Once Sport TrailEffect)
  trailDurationSec?: number; // Comet tail duration in seconds (0.4..2.0, default 0.9)
  puddleEffect?: boolean;  // 3D ground concentric puddle ripple (Once Sport PuddleEffect)
  puddleRippleCount?: number; // Number of ripple rings (2..5, default 3)
  hatchPattern?: 'none' | 'diagonal' | 'crosshatch' | 'stripe'; // Zone hatching style (Once Sport StripeAreaFill)
  zoomScale?: number;     // For magnifier lens (e.g. 1.8x)
  spotlightRadius?: number; // Multiplier 0.5..2.0 (default 1.0)
  spotlightHeight?: number; // Multiplier 0.4..2.0 (default 1.0)
  spotlightFullHeight?: boolean; // Extend beam to top edge
  animationStyle?: BroadcastAnimationStyle;
  cameraZoomTarget?: CameraZoomTarget;
  pointTracks?: Record<number, TrackingKeyframe[]>; // Multi-point binding (index -> keyframes)
  pointTrackIds?: Record<number, string>;           // Track IDs bound per point index
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

export type PitchSurfaceType = 'wood' | 'blue-vinyl' | 'green-turf' | 'dark-slate' | 'half-court' | 'custom-image';

export interface TacticalDrill {
  id: string;
  title: string;
  category: 'Build-up (3-1)' | 'Build-up (4-0)' | 'Set Piece (Kick-in)' | 'Set Piece (Corner)' | 'Power Play (5v4)' | 'Defensive Pressing' | 'Counter Attack' | 'Training Drill';
  surfaceType: PitchSurfaceType;
  customFieldImageUrl?: string;
  createdAt: string;
  updatedAt: string;
  coachNotes: string;
  steps: TacticalStep[];
}

// Training Session Planner (Once.CoachBoard.dll NewTrainingDialog inspired)
export type TrainingPhaseKind = 'warmup' | 'main' | 'finishing' | 'cooldown';
export type TrainingIntensity = 'Rendah' | 'Sedang' | 'Tinggi' | 'Maksimal';

export interface TrainingSessionDrillBlock {
  id: string;
  phase: TrainingPhaseKind;
  title: string;
  durationMinutes: number;
  intensity: TrainingIntensity;
  spaceArea: string;
  playerCount: string;
  equipment: string;
  objective: string;
  coachingPoints: string;
  diagramImageDataUrl?: string;
  linkedDrill?: TacticalDrill;
}

export interface TrainingSessionPlan {
  id: string;
  title: string;
  date: string;
  teamName: string;
  coachName: string;
  trainingObjective: string;
  overallIntensity: TrainingIntensity;
  totalDurationMinutes: number;
  playerCountSummary: string;
  spaceSummary: string;
  generalNotes: string;
  blocks: TrainingSessionDrillBlock[];
  createdAt: string;
  updatedAt: string;
}

// Video Match Analysis Types
export type PresetTagCategory =
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

export type TagCategory = PresetTagCategory | (string & {});

export type TaggingButtonKind = 'category' | 'descriptor';
export type TaggingButtonShape = 'rounded' | 'rect' | 'circle';

export interface TagDescriptor {
  id: string;
  name: string;
  color?: string;
  group?: string | null;
  atTime: number; // seconds
}

export interface TaggingButton {
  id: string;
  name: string;
  kind: TaggingButtonKind;
  hotkey: string | null;
  color: string; // '#rrggbb'
  x: number;
  y: number;
  w: number; // 0 = off-canvas quick-pool descriptor
  h: number;
  leadSec: number;
  lagSec: number;
  continuous: boolean; // true = Continuous Mode (Start/Stop), false = Single-Click Auto
  shape: TaggingButtonShape;
  forTags: string[]; // empty = all tags; non-empty = scoped to these category button IDs
  links: string[]; // linked category button IDs (e.g. AT 5X4 <-> DEF 4X5)
  exclusionGroup: string | null; // mutually exclusive continuous group
  group?: string | null; // mutually exclusive descriptor group per clip
  autoAdd?: boolean; // sticky descriptor auto-added to every new clip
}

export interface TaggingBoard {
  id: string;
  name: string;
  background: 'pitch' | 'plain';
  color: string;
  periods?: number;
  locked?: boolean;
  buttons: TaggingButton[];
}

export interface ActiveContinuousTag {
  buttonId: string;
  name: string;
  color: string;
  startTime: number;
  pressedAt: number;
  lagSec: number;
  labels: TagDescriptor[];
  players: string[];
  teamSide: 'home' | 'away';
}

export type TagOutcome = 'Gol / Sukses' | 'Terblok / Diselamatkan' | 'Keluar / Gagal' | 'Turnover';
export type CourtZone = 'Area Penalti Lawan' | 'Flank Kiri' | 'Flank Kanan' | 'Area Tengah' | 'Area Bertahan Sendiri';
export type TagRating = '⭐⭐⭐ Bagus' | '⚠️ Evaluasi' | '❌ Kesalahan Fatal';

export interface SubtitleCue {
  start: number;
  end: number;
  text: string;
}

export interface FreezeStop {
  id: string;
  time: number;     // absolute video timestamp in seconds
  duration: number; // freeze pause duration in seconds (0.5..8.0)
  label?: string;   // optional short label e.g. 'Jeda #1'
}

export interface SpeedSegment {
  id: string;
  startTime: number; // absolute video timestamp in seconds
  endTime: number;   // absolute video timestamp in seconds
  rate: number;      // playback rate multiplier (0.25..4.0, e.g. 0.5 for slow-mo)
  label?: string;    // optional short label e.g. 'Slow-Mo 0.5x'
}

export type WatermarkPosition = 'top-right' | 'top-left' | 'bottom-right' | 'bottom-left';

export interface WatermarkConfig {
  enabled: boolean;
  position: WatermarkPosition;
  opacity: number;    // 0.15..1.0
  scaleRatio: number; // fraction of output width, e.g. 0.09
}

export interface VideoTagEvent {
  id: string;
  title: string;
  category: TagCategory;
  startTime: number; // seconds
  endTime: number;   // seconds
  color: string;
  playerLabel?: string;       // e.g. '#9 Pivot', '#4 Anchor', 'Tim Lawan'
  passTargetPlayer?: string;  // Receiver player label for real passing network
  outcomeLabel?: TagOutcome;  // e.g. 'Gol / Sukses'
  zoneLabel?: CourtZone;      // e.g. 'Flank Kiri'
  rating?: TagRating;
  favorite?: boolean;
  notes?: string;
  playersInvolved?: string[];
  labels?: TagDescriptor[];
  teamSide?: 'home' | 'away';
  isContinuous?: boolean;
  boardButtonId?: string;
  drawings?: DrawingElement[];
  pauseDuration?: number;     // duration to freeze keyframe during playback / export (default: 3s)
  freezeTimestamp?: number;   // frame timestamp where drawings apply
  freezeStops?: FreezeStop[]; // multi freeze-frame stops for Once Sport style Stop-and-Draw
  speedSegments?: SpeedSegment[]; // variable playback speed segments (e.g. mid-clip slow-mo 0.5x)
  appendCleanReplay?: boolean; // append 1x clean full-speed clip replay at the end
  voiceoverAudioBase64?: string; // Recorded coach audio instructions (WebM/WAV)
  voiceoverTranscript?: string;
  subtitleCues?: SubtitleCue[];
  burnSubtitle?: boolean;
  courtCoord?: Point2D;       // Tactical pitch location (0..40m, 0..20m) for heatmap
  analystName?: string;       // Nama analis / laptop sumber (e.g. 'Laptop B', 'Coach Dimas')
  sourceProjectId?: string;   // ID atau nama berkas proyek sumber saat digabungkan
}

export interface RosterPlayer {
  id: string;
  num: string;
  name: string;
  role: string;
  color: string;
  whatsapp?: string;
  isOpponent?: boolean;
}

export type FutsalPositionRole = 'GK' | 'Anchor' | 'Flank' | 'Pivot' | 'Universal';
export type DominantFoot = 'Kanan' | 'Kiri' | 'Keduanya';

export interface ClubPlayerProfile {
  id: string;
  num: string;
  name: string;
  role: FutsalPositionRole;
  dominantFoot: DominantFoot;
  whatsapp?: string;
  color?: string;
}

export interface ClubProfile {
  id: string;
  name: string;
  shortName?: string;
  isOwnTeam: boolean;
  jerseyColor: string;
  gkColor: string;
  players: ClubPlayerProfile[];
  updatedAt: string;
}

export interface PeriodKickoff {
  period: 1 | 2 | 3;
  videoTime: number; // seconds in video file
  label: string;     // 'Babak 1' | 'Babak 2' | 'Extra'
}

export interface SubstitutionEvent {
  id: string;
  atTime: number;          // seconds in video file
  period: 1 | 2 | 3;
  playerOut: string;       // RosterPlayer.id
  playerIn: string;        // RosterPlayer.id
  teamSide: 'home' | 'away';
}

export interface AiModelStatus {
  available: boolean;
  model_path: string | null;
  engine: string;
  input_size: [number, number];
}

export interface DetectedPlayerBox {
  x: number;
  y: number;
  w: number;
  h: number;
  foot_x: number;
  foot_y: number;
  confidence: number;
  class_id: number;
  label: string;
}

export interface PlayerSilhouetteMask {
  time: number;
  width: number;
  height: number;
  alphaBytes: Uint8Array;
  playerCount: number;
  boxes: DetectedPlayerBox[];
}

export interface TemporalCalibrationFrame {
  time: number;
  tl: Point2D;
  tr: Point2D;
  br: Point2D;
  bl: Point2D;
  confidence: number;
}

export interface WhistleMarker {
  id: string;
  startTime: number;
  endTime: number;
  peakTime: number;
  duration: number;
  peakFreqHz: number;
  confidence: number;
  label: string;
}

export type WorkflowStage = 'hub' | 'tagging' | 'telestrator' | 'playlist_export' | 'coachboard' | 'chalkboard';

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

export type MatchKind = 'match' | 'training';

export interface SecondaryVideoAngle {
  id: string;
  name: string;
  filePath: string | null;
  videoSrc: string | null;
  offsetSec: number;
}

export interface RecentProjectEntry {
  filePath: string;
  title: string;
  matchKind: MatchKind;
  competition?: string;
  tagCount: number;
  openedAt: string;
}

export type TelestrationFilterMode = 'all' | 'with_telestration' | 'without_telestration';

export interface LibraryMatchSource {
  id: string;
  title: string;
  filePath: string | null;
  videoFilePath: string | null;
  videoSrc: string | null;
  exportedAt?: string;
  matchKind?: MatchKind;
  competition?: string;
  matchDate?: string;
  chromaFloorConfig?: ChromaFloorConfig;
  tags: VideoTagEvent[];
  roster: RosterPlayer[];
}

export interface ClipLibraryFilter {
  matchIds: string[];
  categories: string[];
  labels: string[];
  players: string[];
  telestration: TelestrationFilterMode;
  searchQuery: string;
}

export interface ResolvedPlaylistClip {
  key: string;
  matchId: string;
  matchTitle: string;
  videoFilePath: string | null;
  videoSrc: string | null;
  chromaFloorConfig?: ChromaFloorConfig;
  tag: VideoTagEvent;
  hasTelestration: boolean;
  useTelestration: boolean;
}

export type PresentationSlide =
  | {
      id: string;
      kind: 'clip';
      title: string;
      tag: VideoTagEvent;
      matchId?: string;
      matchTitle?: string;
      videoFilePath?: string | null;
      videoSrc?: string | null;
      chromaFloorConfig?: ChromaFloorConfig;
      showTelestration?: boolean;
      speed?: number;
      muted?: boolean;
      caption?: string;
      trimStart?: number;
      trimEnd?: number;
    }
  | { id: string; kind: 'tactical'; title: string }
  | { id: string; kind: 'title'; title: string; subtitle?: string; bgColor?: string }
  | { id: string; kind: 'image'; title: string; imageDataUrl: string; caption?: string };

export interface PresentationDeck {
  id: string;
  title: string;
  showTitleCardBeforeClip: boolean;
  titleCardDurationSec: number;
  slides: PresentationSlide[];
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

// Multi-Analyst Tag Merging (Momen / Once Sport inspired)
export type MergeSyncMethod = 'none' | 'kickoff' | 'anchor_tag' | 'manual_offset';
export type MergeDuplicateStrategy = 'keep_both' | 'skip_duplicate' | 'overwrite_existing';

export interface MergeProjectOptions {
  syncMethod: MergeSyncMethod;
  referencePeriod?: 1 | 2 | 3;
  targetKickoffTime?: number;
  sourceKickoffTime?: number;
  targetAnchorTagId?: string;
  sourceAnchorTagId?: string;
  manualOffsetSec?: number;
  analystName?: string;
  tagTitlePrefix?: string;
  duplicateStrategy: MergeDuplicateStrategy;
  duplicateToleranceSec?: number; // default 1.5s
  categoryFilter?: string[]; // categories to include (empty = all)
  mergeRoster?: boolean;
  mergePlaylists?: boolean;
}

export interface MergeProjectPreview {
  sourceTitle: string;
  sourceAnalyst?: string;
  totalSourceTags: number;
  tagsToMergeCount: number;
  calculatedOffsetSec: number;
  duplicateCount: number;
  newCategoriesCount: number;
  rosterAdditionsCount: number;
  availableCategories: string[];
}

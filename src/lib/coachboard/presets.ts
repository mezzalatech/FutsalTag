// Futsal Tactical Formations & Pre-built Drills
import type { PlayerToken, BallToken, TacticalDrill, TacticalStep } from '$lib/types';

export function createDefaultTeamA(): PlayerToken[] {
  return [
    { id: 'a1', team: 'gk-home', number: '1', name: 'Kiper', role: 'GK', x: 2.0, y: 10.0, facingAngle: 0 },
    { id: 'a2', team: 'home', number: '4', name: 'Anchor', role: 'Anchor', x: 10.0, y: 10.0, facingAngle: 0 },
    { id: 'a3', team: 'home', number: '7', name: 'Flank Kiri', role: 'Flank L', x: 15.0, y: 3.5, facingAngle: 0 },
    { id: 'a4', team: 'home', number: '11', name: 'Flank Kanan', role: 'Flank R', x: 15.0, y: 16.5, facingAngle: 0 },
    { id: 'a5', team: 'home', number: '9', name: 'Pivot', role: 'Pivot', x: 27.0, y: 10.0, facingAngle: Math.PI },
  ];
}

export function createDefaultTeamB(): PlayerToken[] {
  return [
    { id: 'b1', team: 'gk-away', number: '12', name: 'Kiper B', role: 'GK', x: 38.0, y: 10.0, facingAngle: Math.PI },
    { id: 'b2', team: 'away', number: '5', name: 'Bek 1', role: 'Anchor', x: 29.0, y: 10.0, facingAngle: Math.PI },
    { id: 'b3', team: 'away', number: '8', name: 'Sayap L', role: 'Flank L', x: 25.0, y: 5.0, facingAngle: Math.PI },
    { id: 'b4', team: 'away', number: '10', name: 'Sayap R', role: 'Flank R', x: 25.0, y: 15.0, facingAngle: Math.PI },
    { id: 'b5', team: 'away', number: '9', name: 'Depan', role: 'Pivot', x: 18.0, y: 10.0, facingAngle: 0 },
  ];
}

export function createDefaultBall(): BallToken {
  return { x: 10.0, y: 10.0 };
}

// Preset Formations for Team A
export const FORMATION_PRESETS: Record<string, (team: 'home' | 'away') => PlayerToken[]> = {
  '3-1 Pivot': (team) => {
    const isHome = team === 'home';
    const dir = isHome ? 1 : -1;
    const base = isHome ? 0 : 40;
    const facing = isHome ? 0 : Math.PI;

    return [
      { id: `${team}-gk`, team: isHome ? 'gk-home' : 'gk-away', number: '1', name: 'GK', role: 'GK', x: base + dir * 2, y: 10.0, facingAngle: facing },
      { id: `${team}-p2`, team, number: '4', name: 'Anchor', role: 'Anchor', x: base + dir * 10, y: 10.0, facingAngle: facing },
      { id: `${team}-p3`, team, number: '7', name: 'Flank L', role: 'Flank L', x: base + dir * 16, y: 3.5, facingAngle: facing },
      { id: `${team}-p4`, team, number: '11', name: 'Flank R', role: 'Flank R', x: base + dir * 16, y: 16.5, facingAngle: facing },
      { id: `${team}-p5`, team, number: '9', name: 'Pivot', role: 'Pivot', x: base + dir * 28, y: 10.0, facingAngle: facing },
    ];
  },

  '4-0 Flat': (team) => {
    const isHome = team === 'home';
    const dir = isHome ? 1 : -1;
    const base = isHome ? 0 : 40;
    const facing = isHome ? 0 : Math.PI;

    return [
      { id: `${team}-gk`, team: isHome ? 'gk-home' : 'gk-away', number: '1', name: 'GK', role: 'GK', x: base + dir * 2, y: 10.0, facingAngle: facing },
      { id: `${team}-p2`, team, number: '4', name: 'Bek Kiri', role: 'Anchor', x: base + dir * 12, y: 6.5, facingAngle: facing },
      { id: `${team}-p3`, team, number: '5', name: 'Bek Kanan', role: 'Anchor', x: base + dir * 12, y: 13.5, facingAngle: facing },
      { id: `${team}-p4`, team, number: '7', name: 'Sayap Kiri', role: 'Flank L', x: base + dir * 18, y: 2.5, facingAngle: facing },
      { id: `${team}-p5`, team, number: '10', name: 'Sayap Kanan', role: 'Flank R', x: base + dir * 18, y: 17.5, facingAngle: facing },
    ];
  },

  '2-2 Box': (team) => {
    const isHome = team === 'home';
    const dir = isHome ? 1 : -1;
    const base = isHome ? 0 : 40;
    const facing = isHome ? 0 : Math.PI;

    return [
      { id: `${team}-gk`, team: isHome ? 'gk-home' : 'gk-away', number: '1', name: 'GK', role: 'GK', x: base + dir * 2, y: 10.0, facingAngle: facing },
      { id: `${team}-p2`, team, number: '3', name: 'Anchor L', role: 'Anchor', x: base + dir * 11, y: 6.0, facingAngle: facing },
      { id: `${team}-p3`, team, number: '4', name: 'Anchor R', role: 'Anchor', x: base + dir * 11, y: 14.0, facingAngle: facing },
      { id: `${team}-p4`, team, number: '7', name: 'Attacker L', role: 'Flank L', x: base + dir * 24, y: 6.0, facingAngle: facing },
      { id: `${team}-p5`, team, number: '9', name: 'Attacker R', role: 'Flank R', x: base + dir * 24, y: 14.0, facingAngle: facing },
    ];
  },

  'Power Play (5v4)': (team) => {
    const isHome = team === 'home';
    const dir = isHome ? 1 : -1;
    const base = isHome ? 0 : 40;
    const facing = isHome ? 0 : Math.PI;

    return [
      { id: `${team}-fly`, team, number: '10', name: 'Fly-GK', role: 'GK', x: base + dir * 21, y: 10.0, facingAngle: facing },
      { id: `${team}-p2`, team, number: '4', name: 'Anchor L', role: 'Anchor', x: base + dir * 26, y: 4.0, facingAngle: facing },
      { id: `${team}-p3`, team, number: '7', name: 'Anchor R', role: 'Anchor', x: base + dir * 26, y: 16.0, facingAngle: facing },
      { id: `${team}-p4`, team, number: '9', name: 'Tiang 2 L', role: 'Flank L', x: base + dir * 36, y: 5.5, facingAngle: facing },
      { id: `${team}-p5`, team, number: '11', name: 'Tiang 2 R', role: 'Flank R', x: base + dir * 36, y: 14.5, facingAngle: facing },
    ];
  },
};

// Ready-to-use Sample Futsal Drills with Multi-Step Animations
export const SAMPLE_FUTSAL_DRILLS: TacticalDrill[] = [
  {
    id: 'drill-rotasi-3-1',
    title: 'Rotasi Taktik 3-1 Overload Flank & Finishing',
    category: 'Build-up (3-1)',
    surfaceType: 'wood',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    coachNotes: 
      '1. Anchor (#4) menarik pemain bertahan pertama lawan.\n' +
      '2. Flank Kiri (#7) melakukan gerakan fake sebelum menerima umpan diagonal.\n' +
      '3. Pivot (#9) melakukan block (screen) pada bek lawan untuk memberi ruang Flank Kiri menusuk ke tengah.',
    steps: [
      {
        id: 's1',
        stepNumber: 1,
        title: 'Fase Persiapan (Build-up Awal)',
        description: 'Anchor memegang bola di garis 10m. Kedua flank melebar maksimal untuk merenggangkan pertahanan lawan.',
        durationSeconds: 2.5,
        players: [
          { id: 'a1', team: 'gk-home', number: '1', name: 'Kiper', role: 'GK', x: 2.0, y: 10.0, facingAngle: 0 },
          { id: 'a2', team: 'home', number: '4', name: 'Anchor', role: 'Anchor', x: 10.0, y: 10.0, facingAngle: 0 },
          { id: 'a3', team: 'home', number: '7', name: 'Flank L', role: 'Flank L', x: 16.0, y: 3.5, facingAngle: 0 },
          { id: 'a4', team: 'home', number: '11', name: 'Flank R', role: 'Flank R', x: 16.0, y: 16.5, facingAngle: 0 },
          { id: 'a5', team: 'home', number: '9', name: 'Pivot', role: 'Pivot', x: 28.0, y: 10.0, facingAngle: Math.PI },
          // Defense B
          { id: 'b2', team: 'away', number: '5', name: 'Bek 1', role: 'Anchor', x: 29.0, y: 10.0, facingAngle: Math.PI },
          { id: 'b3', team: 'away', number: '8', name: 'Bek L', role: 'Flank L', x: 23.0, y: 6.0, facingAngle: Math.PI },
          { id: 'b4', team: 'away', number: '10', name: 'Bek R', role: 'Flank R', x: 23.0, y: 14.0, facingAngle: Math.PI },
          { id: 'b1', team: 'gk-away', number: '12', name: 'Kiper B', role: 'GK', x: 38.0, y: 10.0, facingAngle: Math.PI },
        ],
        ball: { x: 10.0, y: 10.0 },
        equipment: [],
        drawings: [
          {
            id: 'd1',
            type: 'pass-arrow',
            color: '#38bdf8',
            lineWidth: 3,
            points: [{ x: 10.0, y: 10.0 }, { x: 19.0, y: 4.0 }],
          },
          {
            id: 'd2',
            type: 'run-arrow',
            color: '#fbbf24',
            lineWidth: 2.5,
            points: [{ x: 16.0, y: 3.5 }, { x: 19.0, y: 4.0 }],
          },
          {
            id: 'd3',
            type: 'spotlight-3d',
            color: 'rgba(56, 189, 248, 0.4)',
            lineWidth: 1.8,
            points: [{ x: 10.0, y: 10.0 }],
          }
        ],
      },
      {
        id: 's2',
        stepNumber: 2,
        title: 'Fase Rotasi & Wall Pass Pivot',
        description: 'Flank Kiri menerima bola lalu melakukan umpan satu-dua (wall pass) dengan Pivot yang menahan bola dengan punggung membelakangi gawang.',
        durationSeconds: 2.5,
        players: [
          { id: 'a1', team: 'gk-home', number: '1', name: 'Kiper', role: 'GK', x: 4.0, y: 10.0, facingAngle: 0 },
          { id: 'a2', team: 'home', number: '4', name: 'Anchor', role: 'Anchor', x: 15.0, y: 11.0, facingAngle: 0 },
          { id: 'a3', team: 'home', number: '7', name: 'Flank L', role: 'Flank L', x: 22.0, y: 5.0, facingAngle: 0 },
          { id: 'a4', team: 'home', number: '11', name: 'Flank R', role: 'Flank R', x: 22.0, y: 16.5, facingAngle: 0 },
          { id: 'a5', team: 'home', number: '9', name: 'Pivot', role: 'Pivot', x: 29.0, y: 10.0, facingAngle: Math.PI },
          // Defense B
          { id: 'b2', team: 'away', number: '5', name: 'Bek 1', role: 'Anchor', x: 30.5, y: 10.0, facingAngle: Math.PI },
          { id: 'b3', team: 'away', number: '8', name: 'Bek L', role: 'Flank L', x: 24.0, y: 7.0, facingAngle: Math.PI },
          { id: 'b4', team: 'away', number: '10', name: 'Bek R', role: 'Flank R', x: 24.0, y: 14.0, facingAngle: Math.PI },
          { id: 'b1', team: 'gk-away', number: '12', name: 'Kiper B', role: 'GK', x: 37.5, y: 10.0, facingAngle: Math.PI },
        ],
        ball: { x: 22.0, y: 5.0 },
        equipment: [],
        drawings: [
          {
            id: 'd4',
            type: 'pass-arrow',
            color: '#38bdf8',
            lineWidth: 3,
            points: [{ x: 22.0, y: 5.0 }, { x: 29.0, y: 10.0 }],
          },
          {
            id: 'd5',
            type: 'run-arrow',
            color: '#fbbf24',
            lineWidth: 2.5,
            points: [{ x: 22.0, y: 5.0 }, { x: 28.0, y: 7.0 }],
          },
          {
            id: 'd6',
            type: 'vision-cone',
            color: 'rgba(234, 179, 8, 0.3)',
            points: [{ x: 29.0, y: 10.0 }, { x: 28.0, y: 7.0 }],
          }
        ],
      },
      {
        id: 's3',
        stepNumber: 3,
        title: 'Fase Finishing (Shooting & Far Post)',
        description: 'Pivot mengembalikan bola ke ruang tembak Flank Kiri. Flank Kanan berlari cepat menuju tiang kedua (far post) untuk menyambut bola pantul.',
        durationSeconds: 2.0,
        players: [
          { id: 'a1', team: 'gk-home', number: '1', name: 'Kiper', role: 'GK', x: 5.0, y: 10.0, facingAngle: 0 },
          { id: 'a2', team: 'home', number: '4', name: 'Anchor', role: 'Anchor', x: 18.0, y: 11.0, facingAngle: 0 },
          { id: 'a3', team: 'home', number: '7', name: 'Flank L', role: 'Flank L', x: 29.0, y: 7.0, facingAngle: 0 },
          { id: 'a4', team: 'home', number: '11', name: 'Flank R', role: 'Flank R', x: 35.0, y: 12.0, facingAngle: 0 },
          { id: 'a5', team: 'home', number: '9', name: 'Pivot', role: 'Pivot', x: 30.0, y: 12.0, facingAngle: 0 },
          // Defense B
          { id: 'b2', team: 'away', number: '5', name: 'Bek 1', role: 'Anchor', x: 32.0, y: 9.0, facingAngle: Math.PI },
          { id: 'b3', team: 'away', number: '8', name: 'Bek L', role: 'Flank L', x: 28.0, y: 8.0, facingAngle: Math.PI },
          { id: 'b4', team: 'away', number: '10', name: 'Bek R', role: 'Flank R', x: 27.0, y: 13.0, facingAngle: Math.PI },
          { id: 'b1', team: 'gk-away', number: '12', name: 'Kiper B', role: 'GK', x: 37.0, y: 9.0, facingAngle: Math.PI },
        ],
        ball: { x: 29.0, y: 7.0 },
        equipment: [],
        drawings: [
          {
            id: 'd7',
            type: 'pass-arrow',
            color: '#ef4444',
            lineWidth: 3.5,
            points: [{ x: 29.0, y: 7.0 }, { x: 39.5, y: 9.0 }], // Shot to goal
          },
          {
            id: 'd8',
            type: 'distance-line',
            color: '#00f0ff',
            points: [{ x: 29.0, y: 7.0 }, { x: 40.0, y: 10.0 }],
          },
          {
            id: 'd9',
            type: 'spotlight-3d',
            color: 'rgba(239, 68, 68, 0.5)',
            lineWidth: 2.0,
            points: [{ x: 39.5, y: 9.0 }],
          }
        ],
      }
    ]
  }
];

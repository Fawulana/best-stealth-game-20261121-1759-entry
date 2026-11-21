// The four heists. Each level is a 32x18 tile map plus its patrol routes.
// Legend: # wall  . floor  C crate (blocks sight and movement)  B bush (hides
// you)  ~ shadow floor (you are harder to spot)  o coin  A the relic  E exit
// P where the thief starts  L lamp  G guard spawn  S rotating sentry
// K keycard (cuts the lasers)  D guard-dog spawn.
// Guard waypoints are tile [col, row] pairs the guard walks in a loop.
// Cameras are wall tiles with a sweep centre angle; lasers are beam segments
// between two tile centres that pulse on and off.

export const LEVELS = [
  {
    name: 'The Gallery',
    brief: 'Steal the Gilded Lantern, then slip out the east door unseen.',
    artifactName: 'the Gilded Lantern',
    map: [
      '################################',
      '#P....~~......#......o.....#...#',
      '#.##..~~..##..#..##.....##.#.A.#',
      '#....B....##..#..##..C..##...#.#',
      '#.##......##.....##.....##...#.#',
      '#....C......B......o.......#...#',
      '#.##..####..#####..####..###...#',
      '#....#....#......#....#.......##',
      '#..G.#.C..#.B....#.C..#.o.....##',
      '#.##.#....#......#....#....##..#',
      '#....#....####.####...#....#...#',
      '#.B..#..o....#....#...#.C..#...#',
      '#....####....#.G..#...#....#.E.#',
      '#.##......##.#....#.##.#.##....#',
      '#..C...B.....#....#....#....o..#',
      '#.##..####...#..C.#.####.###...#',
      '#....o....G......~~....B......##',
      '################################',
    ],
    guards: [
      { spawn: [3, 8], waypoints: [[3, 8], [4, 2], [9, 2], [11, 8]] },
      { spawn: [16, 12], waypoints: [[16, 12], [16, 5], [24, 5], [24, 12]] },
      { spawn: [10, 16], waypoints: [[10, 16], [20, 16], [19, 13], [9, 13]] },
    ],
    sentries: [],
    cameras: [],
    dogs: [],
    lasers: [],
  },
  {
    name: 'The Vault Hall',
    brief: 'The Sunken Crown waits behind the vault doors. A camera watches the hall now.',
    artifactName: 'the Sunken Crown',
    map: [
      '################################',
      '#P..o....#......~~......#......#',
      '#.####..#..##..~~..##..#..##..##',
      '#....#..#..##......##..#..##.A##',
      '#.B..#.....##..C...##.....#...##',
      '#.##.#..C..##......##..B..#.####',
      '#....#.....####.#####.....#....#',
      '#.##.#####....#.....#.##..#.##.#',
      '#....#...#..G.#..o..#....#....##',
      '#.##.....#....#.....#.##..#..#.#',
      '#.B..#...####.####..#....#..#.##',
      '#....#......#.....#.#.##..#..#.#',
      '#.##.####..#.G...#.#....#.#..E##',
      '#....#..#..#.....#.#.##.#.#....#',
      '#.o..#..#..#.B...#.#....#.#.##.#',
      '#.##.#..#..#..C..#.#.##.#.#....#',
      '#.......#..#..G..~~....#......##',
      '################################',
    ],
    guards: [
      { spawn: [12, 8], waypoints: [[12, 8], [13, 3], [21, 3], [21, 8]] },
      { spawn: [13, 12], waypoints: [[13, 12], [25, 12], [24, 16], [13, 16]] },
      { spawn: [13, 16], waypoints: [[13, 16], [6, 16], [6, 9], [13, 9]] },
      { spawn: [25, 12], waypoints: [[25, 12], [24, 4], [28, 4], [28, 12]] },
    ],
    sentries: [],
    cameras: [
      { tile: [14, 10], startAngle: Math.PI / 2 },
    ],
    dogs: [],
    lasers: [],
  },
  {
    name: 'The Grand Vault',
    brief: 'The Star of Marrow, guarded by five patrols, a dog and sweeping searchlights.',
    artifactName: 'the Star of Marrow',
    map: [
      '################################',
      '#P....~~..#.....o.........#....#',
      '#.##..~~.....##..B..#..##.#.A.##',
      '#....B....#..##.....#..##.....##',
      '#.##......#..##..C..#.....#...##',
      '#..C...o..#..##.....#.##..#.####',
      '#.####.####..####.####.#....#..#',
      '#....#....#......#....#..S.#...#',
      '#.##.#.G..#.##...#..##.#..#..###',
      '#....#....#.##.o.#..##.#.....#.#',
      '#.B..#.##.#.##...#..##.#.##..#.#',
      '#....#.##.#.####.#..##.#....#..#',
      '#.##.#....#....#....#..#.##...E#',
      '#....#.##.#.G..#....#..#....#..#',
      '#.o..#.##.#....#.B..#.##.##.#..#',
      '#.##.#....#.##.....#....#..#...#',
      '#....#.G..#..~~..o....B#......##',
      '################################',
    ],
    guards: [
      { spawn: [8, 8], waypoints: [[8, 8], [8, 3], [15, 3], [15, 8]] },
      { spawn: [13, 13], waypoints: [[13, 13], [21, 13], [20, 7], [12, 6]] },
      { spawn: [8, 16], waypoints: [[8, 16], [24, 16], [24, 13], [9, 13]] },
      { spawn: [24, 6], waypoints: [[24, 6], [25, 2], [28, 2], [29, 6]] },
      { spawn: [19, 9], waypoints: [[19, 9], [27, 9], [28, 15], [20, 15]] },
    ],
    sentries: [
      { tile: [23, 7], startAngle: 0 },
      { tile: [16, 13], startAngle: Math.PI },
    ],
    cameras: [
      { tile: [10, 3], startAngle: Math.PI },
    ],
    dogs: [
      { spawn: [24, 10], waypoints: [[24, 10], [24, 4], [28, 4], [28, 10]] },
    ],
    lasers: [],
  },
  {
    name: 'The Laser Vault',
    brief: 'The Heart of Glass, behind a pulsing laser grid. Find the keycard to cut the beams.',
    artifactName: 'the Heart of Glass',
    map: [
      '################################',
      '#P....~~.....#......o.....#..#.#',
      '#.##..~~..##.#..##.....##.#K#..#',
      '#....B....##.#..##..C..##...G#.#',
      '#.##G.....##.#.....##.....##.#.#',
      '#....C.......#......o.......#..#',
      '##########.#####.#####.#########',
      '#....#...........#.....#.......#',
      '#..G.#C....#..B....#.C..#..o...#',
      '#.##.#...........#.....#....#..#',
      '#....#....####...####...#....#.#',
      '#.B..#.o....#.....#....#...C...#',
      '####.###########.###########.###',
      '#.##......##.#....#....#..#..A##',
      '#..CG..BD....#....#....#G...o..#',
      '#.##..####...#..C.#.####.###...#',
      '#....o..........~~....B.....E..#',
      '################################',
    ],
    guards: [
      { spawn: [4, 4], waypoints: [[4, 4], [12, 4], [12, 2], [4, 2]] },
      { spawn: [27, 3], waypoints: [[27, 3], [30, 3], [30, 5], [27, 5]] },
      { spawn: [4, 14], waypoints: [[4, 14], [12, 14], [12, 16], [4, 16]] },
      { spawn: [24, 14], waypoints: [[24, 14], [28, 14], [28, 15], [24, 15]] },
    ],
    sentries: [],
    cameras: [
      { tile: [10, 3], startAngle: Math.PI },
      { tile: [15, 12], startAngle: -Math.PI / 2 },
    ],
    dogs: [
      { spawn: [8, 14], waypoints: [[8, 14], [24, 14], [24, 16], [8, 16]] },
    ],
    lasers: [
      { from: [10, 6], to: [10, 11], phase: 0 },
      { from: [16, 6], to: [16, 11], phase: 1.2 },
      { from: [22, 6], to: [22, 11], phase: 2.4 },
    ],
  },
];

/** Tiles a body can walk through (crates and walls block; bushes and shadow do not). */
export function isWalkableTile(ch) {
  return ch !== '#' && ch !== 'C';
}

/** Tiles that block a guard's line of sight. */
export function blocksSightTile(ch) {
  return ch === '#' || ch === 'C';
}

// Shadow Vault — every tuning number, colour and constant in one place.
// The playfield is a fixed 1280x720 logical area (32x18 tiles of 40 px); the
// renderer scales it to the window, so no rule below depends on screen size.
// v2 adds wall-mounted security cameras, a guard dog, smoke bombs, a pulsing
// laser grid and a global alarm level that makes every patrol faster.

export const TILE = 40;
export const COLS = 32;
export const ROWS = 18;
export const FIELD = { width: COLS * TILE, height: ROWS * TILE };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

export const PLAYER = {
  radius: 13,
  walkSpeed: 175,
  sneakSpeed: 96,
  /** Footstep noise radius while walking; sneaking is silent. */
  noiseRadius: 95,
};

export const GUARD = {
  radius: 14,
  patrolSpeed: 62,
  investigateSpeed: 98,
  chaseSpeed: 152,
  /** Vision range in px and half-angle in radians (~35 degrees). */
  visionRange: 235,
  visionHalfAngle: 0.61,
  /** How fast the detection meter fills when the guard sees you point blank. */
  detectRate: 1.5,
  /** Detection at which a guard grows suspicious and comes to look. */
  suspectAt: 0.35,
  /** Seconds a chasing guard keeps hunting after losing sight of you. */
  chaseMemory: 4.0,
  /** Seconds a guard searches the last seen spot before giving up. */
  searchTime: 3.0,
  hearingRadius: 250,
};

export const SENTRY = {
  radius: 12,
  visionRange: 260,
  visionHalfAngle: 0.5,
  sweepSpeed: 0.55,
  detectRate: 1.1,
};

/** A wall-mounted security camera: long, narrow cone, slow sweep. When its
 *  meter fills it raises the alarm level and sends the nearest guard over. */
export const CAMERA = {
  radius: 10,
  visionRange: 300,
  visionHalfAngle: 0.42,
  sweepSpeed: 0.35,
  sweepArc: 0.55,
  detectRate: 0.9,
};

/** A guard dog: short sight but a wide nose for sound. It hears footsteps
 *  from far away and runs you down, but sneaking stays silent to it. */
export const DOG = {
  radius: 12,
  patrolSpeed: 88,
  investigateSpeed: 150,
  chaseSpeed: 195,
  visionRange: 175,
  visionHalfAngle: 0.85,
  detectRate: 1.3,
  suspectAt: 0.3,
  chaseMemory: 3.0,
  searchTime: 2.5,
  hearingRadius: 250,
  /** Extra hearing reach over a noise event's own radius. */
  hearingBonus: 130,
};

export const PEBBLE = {
  count: 3,
  throwRange: 280,
  noiseRadius: 250,
  cooldown: 0.8,
};

/** A smoke bomb: a cloud that blocks every cone for a few seconds, but the
 *  guards come to look at it once it clears. */
export const SMOKE = {
  count: 2,
  radius: 95,
  duration: 4.5,
  cooldown: 1.0,
  /** Guards this close to the cloud walk over to investigate it. */
  lureRadius: 330,
};

/** A laser beam: crossing a live beam fills the thief's detection fast and
 *  raises the alarm. Beams pulse on and off on a fixed cycle. */
export const LASER = {
  detectRate: 2.2,
  onSeconds: 2.0,
  offSeconds: 1.6,
  hitRadius: 14,
};

/** The global alarm level: 0 calm, 1 alert, 2 lockdown. Each level makes
 *  every patrol faster and quicker to spot you, until it cools down. */
export const ALARM = {
  maxLevel: 2,
  /** Seconds with no chase and no camera alarm before the level drops. */
  decaySeconds: 12,
  speedPerLevel: 0.22,
  detectPerLevel: 0.15,
};

export const LIVES = 3;

export const SCORE = {
  coin: 50,
  keycard: 150,
  artifact: 500,
  levelTimeBonus: 400,
  ghostBonus: 300,
};

export const PALETTE = {
  backdrop: '#0a0d16',
  floorA: '#232838',
  floorB: '#1e2331',
  floorEdge: '#2c3247',
  wall: '#3a415c',
  wallTop: '#565f83',
  crate: '#7a5a33',
  crateEdge: '#a07d4a',
  bush: '#1d4a2a',
  bushEdge: '#2f7a44',
  shadowZone: '#101a33',
  lampGlow: '#f7c948',
  player: '#2ec4b6',
  playerDark: '#1d8a80',
  guard: '#e4572e',
  guardUniform: '#33415c',
  dog: '#b08968',
  dogDark: '#7f5539',
  camera: '#c77dff',
  cameraLens: '#ff5d8f',
  laser: '#ff2e63',
  laserOff: '#5c1a30',
  smoke: '#b8c0cc',
  cone: '#f7c948',
  coneAlert: '#ef233c',
  coneSuspect: '#ff9f1c',
  coneCamera: '#c77dff',
  artifact: '#ffd700',
  keycard: '#4cc9f0',
  exit: '#43aa8b',
  exitLocked: '#5a6478',
  text: '#eef1f5',
  muted: '#9aa3b5',
  panel: '#171c2b',
  danger: '#ef233c',
  coin: '#f2c94c',
};

export const FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';

/** Where the best score is kept between visits (this browser only). */
export const BEST_KEY = 'shadow-vault.best';

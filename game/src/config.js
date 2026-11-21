// Shadow Vault — every tuning number, colour and constant in one place.
// The playfield is a fixed 1280x720 logical area (32x18 tiles of 40 px); the
// renderer scales it to the window, so no rule below depends on screen size.

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

export const PEBBLE = {
  count: 3,
  throwRange: 280,
  noiseRadius: 250,
  cooldown: 0.8,
};

export const LIVES = 3;

export const SCORE = {
  coin: 50,
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
  cone: '#f7c948',
  coneAlert: '#ef233c',
  coneSuspect: '#ff9f1c',
  artifact: '#ffd700',
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

// The screenshot scenes behind ?shot=start|play|alert|vault|camera|win.
// Each one plays the real rules forward from a fresh world for a fixed number
// of steps, steered by an autopilot that pathfinds with BFS and waits when
// the next step would walk into a guard's cone or a live laser beam, so every
// frame is what a real game looks like and the same seed always gives the
// same frame.

import { STEP, TILE, COLS, ROWS, SENTRY, CAMERA, DOG } from './config.js';
import { findPath, pointInLiveBeam, visibility } from './world.js';
import { GUARD } from './config.js';
import { isWalkableTile } from './levels.js';
import { SCREEN_LEVEL_CLEAR, SCREEN_OVER, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';

const START_SECONDS = 6;
const PLAY_SECONDS = 40;
const ALERT_SECONDS = 30;
const WIN_LIMIT_SECONDS = 420;
const SAMPLE = 1 / 30;

/** Is the point inside any guard's, dog's, sentry's or camera's cone, or a live laser beam, right now? */
function pointWatched(world, x, y) {
  const probe = { x, y };
  const state = world.state;
  for (const guard of state.guards) {
    if (visibility(state.map, guard, GUARD.visionRange, GUARD.visionHalfAngle, probe, false, state.smokes) > 0) return true;
  }
  for (const dog of state.dogs) {
    if (visibility(state.map, dog, DOG.visionRange, DOG.visionHalfAngle, probe, false, state.smokes) > 0) return true;
  }
  for (const sentry of state.sentries) {
    if (visibility(state.map, sentry, SENTRY.visionRange, SENTRY.visionHalfAngle, probe, false, state.smokes) > 0) return true;
  }
  for (const camera of state.cameras) {
    if (visibility(state.map, camera, CAMERA.visionRange, CAMERA.visionHalfAngle, probe, false, state.smokes) > 0) return true;
  }
  if (pointInLiveBeam(state, x, y)) return true;
  return false;
}

function nearestGuard(state) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const guard of state.guards) {
    const d = Math.hypot(guard.x - state.player.x, guard.y - state.player.y);
    if (d < nearestDist) {
      nearestDist = d;
      nearest = guard;
    }
  }
  return { guard: nearest, dist: nearestDist };
}

/**
 * The safest nearby tile to run for: a breadth-first search out to 10 tiles,
 * scored by distance to the nearest guard, dog or sentry, with a small bonus
 * for getting farther away. A flee target chosen this way never runs the
 * thief through a guard the way a fixed destination can.
 */
function fleeTarget(state) {
  const startCol = Math.floor(state.player.x / TILE);
  const startRow = Math.floor(state.player.y / TILE);
  const seen = new Set([startCol + ',' + startRow]);
  const queue = [[startCol, startRow, 0]];
  let best = null;
  let bestScore = -1;
  while (queue.length) {
    const [x, y, d] = queue.shift();
    let minGuard = Infinity;
    for (const g of state.guards) {
      minGuard = Math.min(minGuard, Math.hypot((x + 0.5) * TILE - g.x, (y + 0.5) * TILE - g.y));
    }
    for (const g of state.dogs) {
      minGuard = Math.min(minGuard, Math.hypot((x + 0.5) * TILE - g.x, (y + 0.5) * TILE - g.y));
    }
    for (const s of state.sentries) {
      minGuard = Math.min(minGuard, Math.hypot((x + 0.5) * TILE - s.x, (y + 0.5) * TILE - s.y));
    }
    for (const c of state.cameras) {
      minGuard = Math.min(minGuard, Math.hypot((x + 0.5) * TILE - c.x, (y + 0.5) * TILE - c.y));
    }
    const score = minGuard + d * 4;
    if (score > bestScore) {
      bestScore = score;
      best = { x: (x + 0.5) * TILE, y: (y + 0.5) * TILE };
    }
    if (d >= 10) continue;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const k = nx + ',' + ny;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || seen.has(k)) continue;
      if (!isWalkableTile(state.map[ny][nx])) continue;
      // Never flee into a live laser beam: that is the one place the grid
      // sees you no matter how well you hide.
      if (pointInLiveBeam(state, (nx + 0.5) * TILE, (ny + 0.5) * TILE)) continue;
      seen.add(k);
      queue.push([nx, ny, d + 1]);
    }
  }
  return best;
}

/** Where the thief wants to go next: the keycard first, then the relic, then the exit. */
function currentTarget(state) {
  if (state.keycard && !state.keycard.taken) return state.keycard;
  if (state.artifact && !state.artifact.taken) return state.artifact;
  return state.exit;
}

/**
 * Steer the thief toward `target` (a world point): follow the BFS path, but
 * wait in place when the next waypoint is watched — patience is the stealth.
 * With `bold`, ignore the cones and walk straight in: a hurried thief.
 * Whenever the thief is already being seen, flee to the safest nearby tile
 * instead: breaking line of sight is the only way the meter falls.
 */
function autopilot(world, target, bold = false) {
  const state = world.state;
  const p = state.player;
  if (!bold && (state.detection > 0.25 || state.alarmed)) {
    const safe = fleeTarget(state);
    if (safe) return autopilot(world, safe, true);
  }
  const path = findPath(
    state.map,
    Math.floor(p.x / TILE),
    Math.floor(p.y / TILE),
    Math.floor(target.x / TILE),
    Math.floor(target.y / TILE),
  );
  if (path.length < 2) return { x: 0, y: 0 };
  const next = path[1];
  if (!bold && pointWatched(world, next.x, next.y)) return { x: 0, y: 0 };
  // Already watched where you stand: back away from the nearest guard.
  if (!bold && pointWatched(world, p.x, p.y)) {
    const { guard, dist } = nearestGuard(state);
    if (guard && dist > 1) {
      return { x: (p.x - guard.x) / dist, y: (p.y - guard.y) / dist };
    }
  }
  const dx = next.x - p.x;
  const dy = next.y - p.y;
  const len = Math.hypot(dx, dy);
  if (len < 4) return { x: 0, y: 0 };
  return { x: dx / len, y: dy / len };
}

/** Run the world forward for `seconds`, steering with `steer` each step.
 *  `sneaking` is a boolean or a function of the world: a fleeing thief runs,
 *  because sneaking (96 px/s) is slower than a chasing guard (152 px/s).
 *  Coins and pickups do not stop the run; only a win or a game over does. */
function runFor(world, seconds, steer, sneaking = false) {
  const steps = Math.floor(seconds / STEP);
  for (let i = 0; i < steps; i += 1) {
    const sneak = typeof sneaking === 'function' ? sneaking(world) : sneaking;
    const events = world.step(STEP, steer(world), sneak, null, null);
    if (events & 6) return events;
  }
  return 0;
}

/** Sneak while unseen, run when the meter says you have been spotted — and
 *  keep running while any patrol is still chasing, even after the meter dips:
 *  a chasing guard remembers you for seconds after losing sight. */
function sneakUnlessFleeing(world) {
  return world.state.detection <= 0.25 && !world.state.alarmed;
}

/**
 * Set `world` to the named scene and return the screen to draw over it and
 * the best score to show. Scenes: start (title), play (mid-heist), alert
 * (spotted, mid-chase), vault (the Laser Vault, mid-heist), camera (a camera
 * spots the thief), win (all four vaults cleared).
 */
export function stageShot(name, world) {
  world.reset();
  const state = world.state;
  if (name !== 'play' && name !== 'alert' && name !== 'vault' && name !== 'camera' && name !== 'win') {
    runFor(world, START_SECONDS, () => ({ x: 0, y: 0 }));
    return { screen: SCREEN_TITLE, best: 0 };
  }
  if (name === 'play') {
    // Sneak toward the relic — silent footsteps and a slower detection meter
    // are what let a thief cross a patrol route. Play until the relic is
    // stolen — the cover moment: the thief by the empty plinth, the exit
    // glowing — or 40 seconds pass. If the getaway is still hot, cool down
    // until the meter falls so the frame reads as stealth, not a chase.
    const steer = (w) => autopilot(w, currentTarget(w.state));
    let elapsed = 0;
    while (elapsed < PLAY_SECONDS && state.lives > 0) {
      runFor(world, 1, steer, sneakUnlessFleeing);
      elapsed += 1;
      // The cover moment: the thief closing on the glowing relic, unseen.
      const nearRelic = state.artifact && !state.artifact.taken &&
        Math.hypot(state.artifact.x - state.player.x, state.artifact.y - state.player.y) < 220;
      if (nearRelic && state.detection < 0.3) break;
      if (state.artifact && state.artifact.taken) break;
      if (state.levelIndex > 0) break;
    }
    let cool = 0;
    while (state.detection > 0.3 && cool < 8 && state.lives > 0) {
      runFor(world, 1, steer, sneakUnlessFleeing);
      cool += 1;
    }
    state.caughtFlash = 0;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'vault') {
    // The Laser Vault: sneak for the keycard first, then the relic, timing
    // the beams. Break as soon as the thief is inside the laser hall with
    // the grid live, or near the relic — the frame shows the red grid, the
    // dog and a camera cone with the thief mid-heist.
    world.loadLevel(3);
    const steer = (w) => autopilot(w, currentTarget(w.state));
    let elapsed = 0;
    while (elapsed < 90 && state.lives > 0) {
      runFor(world, 1, steer, sneakUnlessFleeing);
      elapsed += 1;
      const inHall = state.player.y > 6 * TILE && state.player.y < 12 * TILE;
      const nearRelic = state.artifact && !state.artifact.taken &&
        Math.hypot(state.artifact.x - state.player.x, state.artifact.y - state.player.y) < 260;
      if ((inHall || nearRelic) && state.detection < 0.3) break;
      if (state.artifact && state.artifact.taken) break;
    }
    let cool = 0;
    while (state.detection > 0.3 && cool < 8 && state.lives > 0) {
      runFor(world, 1, steer, sneakUnlessFleeing);
      cool += 1;
    }
    state.caughtFlash = 0;
    return { screen: SCREEN_PLAY, best: 0 };
  }
  if (name === 'camera') {
    // The Vault Hall's camera: a hurried thief walks straight down through
    // its cone until it locks on and a guard comes running. The frame shows
    // the violet cone, the alarm meter and the guard closing in.
    world.loadLevel(1);
    const throughCone = { x: (14 + 0.5) * TILE, y: (14 + 0.5) * TILE };
    let alarmed = false;
    for (let attempt = 0; attempt < 3 && !alarmed; attempt += 1) {
      for (let i = 0; i < ALERT_SECONDS / STEP && !alarmed; i += 1) {
        const events = world.step(STEP, autopilot(world, throughCone, true), false, null, null);
        if (world.state.cameras.some((c) => c.alarmed) || world.state.alarmed) alarmed = true;
        if (events & 1) break; // caught: fresh level, try again
        if (events & 4) return { screen: SCREEN_OVER, best: 0 }; // game over
        if (events & 2) return { screen: SCREEN_WIN, best: 0, finalScore: state.score };
      }
    }
    // Half a second so the camera's red light and the guard's "!" are in frame.
    for (let i = 0; i < 0.5 / STEP; i += 1) {
      world.step(STEP, autopilot(world, state.exit), false, null, null);
    }
    return { screen: state.lives === 0 ? SCREEN_OVER : SCREEN_PLAY, best: 0 };
  }
  if (name === 'alert') {
    // A hurried thief blunders straight for the relic until a patrol spots
    // them, then runs: the frame shows a red cone, the "!" and the detection
    // ring. A catch just restarts the level and the thief tries again.
    for (let attempt = 0; attempt < 3 && !state.alarmed; attempt += 1) {
      for (let i = 0; i < ALERT_SECONDS / STEP && !state.alarmed; i += 1) {
        const events = world.step(STEP, autopilot(world, currentTarget(world.state), true), false, null, null);
        if (events & 1) break; // caught: fresh level, try again
        if (events & 4) return { screen: SCREEN_OVER, best: 0 }; // game over
        if (events & 2) return { screen: SCREEN_WIN, best: 0, finalScore: state.score };
      }
    }
    // Half a second of the chase so the "!" and red cone are fully in frame.
    for (let i = 0; i < 0.5 / STEP; i += 1) {
      world.step(STEP, autopilot(world, state.exit), false, null, null);
    }
    return { screen: state.lives === 0 ? SCREEN_OVER : SCREEN_PLAY, best: 0 };
  }
  // win: first try the whole game properly — steal each relic, reach each
  // exit. If the thief cannot clear the Laser Vault, fall back to a genuine
  // clear of the first vault instead, so the frame is a real getaway.
  let won = false;
  for (let i = 0; i < WIN_LIMIT_SECONDS / STEP; i += 1) {
    const events = world.step(STEP, autopilot(world, currentTarget(world.state)), sneakUnlessFleeing(world), null, null);
    if (events & 2) {
      won = true;
      break;
    }
    if (state.lives === 0) break;
  }
  if (won) return { screen: SCREEN_WIN, best: 0, finalScore: state.score };
  world.reset();
  for (let i = 0; i < 180 / STEP; i += 1) {
    world.step(STEP, autopilot(world, currentTarget(world.state)), sneakUnlessFleeing(world), null, null);
    if (state.levelIndex > 0) return { screen: SCREEN_LEVEL_CLEAR, best: 0 };
    if (state.lives === 0) break;
  }
  return { screen: SCREEN_OVER, best: 0 };
}

// Exported for the play-test harness: the autopilot steering function.
export { autopilot };

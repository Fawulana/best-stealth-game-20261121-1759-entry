// The world: one level's state and rules. It parses a level map, moves the
// thief with circle-vs-tile collision, works out what each guard and sentry
// can see (vision cone + line of sight + bushes and shadow), runs the
// detection meter, and owns the objective: steal the relic, then reach the
// exit. It also carries the noise events pebbles and footsteps raise.

import { COLS, FIELD, GUARD, LIVES, PEBBLE, PLAYER, ROWS, SCORE, SENTRY, TILE } from './config.js';
import { LEVELS, blocksSightTile, isWalkableTile } from './levels.js';
import { createGuard, createSentry, stepGuard, stepSentry, GUARD_CHASE } from './guards.js';

export const EVENT_CAUGHT = 1;
export const EVENT_LEVEL_CLEAR = 2;
export const EVENT_GAME_OVER = 4;
export const EVENT_ARTIFACT = 8;
export const EVENT_COIN = 16;

function tileAt(map, col, row) {
  if (col < 0 || row < 0 || col >= COLS || row >= ROWS) return '#';
  return map[row][col];
}

function tileCharAt(map, x, y) {
  return tileAt(map, Math.floor(x / TILE), Math.floor(y / TILE));
}

/** Is the tile the point stands on a shadow tile? */
export function onShadowTile(map, x, y) {
  return tileCharAt(map, x, y) === '~';
}

/** Is the point inside a bush (hidden unless a guard is very close)? */
export function inBush(map, x, y) {
  return tileCharAt(map, x, y) === 'B';
}

/** Line of sight between two points, blocked by walls and crates. */
export function hasLineOfSight(map, x0, y0, x1, y1) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / (TILE / 4)));
  for (let i = 1; i < steps; i += 1) {
    const t = i / steps;
    if (blocksSightTile(tileCharAt(map, x0 + dx * t, y0 + dy * t))) return false;
  }
  return true;
}

/** Distance a ray from (x, y) along `angle` travels before hitting a wall. */
export function castRay(map, x, y, angle, maxDist) {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const step = TILE / 4;
  let dist = 0;
  while (dist < maxDist) {
    dist += step;
    if (blocksSightTile(tileCharAt(map, x + dx * dist, y + dy * dist))) return dist;
  }
  return maxDist;
}

/**
 * How strongly `eye` sees the player: 0 when out of range, outside the cone,
 * behind a wall, or hidden in a bush; otherwise 1 at point blank fading to
 * 0.25 at the edge of the cone. Shadow and sneaking slow it further.
 */
export function visibility(map, eye, eyeRange, eyeHalfAngle, player, sneaking) {
  const dx = player.x - eye.x;
  const dy = player.y - eye.y;
  const dist = Math.hypot(dx, dy);
  if (dist > eyeRange) return 0;
  const angleTo = Math.atan2(dy, dx);
  let diff = angleTo - eye.angle;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  if (Math.abs(diff) > eyeHalfAngle) return 0;
  if (inBush(map, player.x, player.y) && dist > 70) return 0;
  if (!hasLineOfSight(map, eye.x, eye.y, player.x, player.y)) return 0;
  let strength = 1 - (dist / eyeRange) * 0.75;
  if (onShadowTile(map, player.x, player.y)) strength *= 0.45;
  if (sneaking) strength *= 0.55;
  return strength;
}

/** Breadth-first path over walkable tiles; returns a list of tile centres. */
export function findPath(map, sx, sy, tx, ty) {
  const startKey = sx + ',' + sy;
  const prev = new Map([[startKey, null]]);
  const queue = [[sx, sy]];
  while (queue.length) {
    const [x, y] = queue.shift();
    if (x === tx && y === ty) {
      const path = [];
      let key = tx + ',' + ty;
      while (key !== null) {
        const [px, py] = key.split(',').map(Number);
        path.unshift({ x: (px + 0.5) * TILE, y: (py + 0.5) * TILE });
        key = prev.get(key);
      }
      return path;
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = nx + ',' + ny;
      if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS || prev.has(key)) continue;
      if (!isWalkableTile(map[ny][nx])) continue;
      prev.set(key, x + ',' + y);
      queue.push([nx, ny]);
    }
  }
  return [];
}

export function createWorld(random) {
  const state = {
    levelIndex: 0,
    level: null,
    map: [],
    player: { x: 0, y: 0, angle: 0, sneaking: false, moving: false, stepTime: 0 },
    guards: [],
    sentries: [],
    coins: [],
    artifact: null,
    exit: null,
    lamps: [],
    pebbles: PEBBLE.count,
    pebbleCooldown: 0,
    pebbleFlights: [],
    noises: [],
    lives: LIVES,
    score: 0,
    coinsTaken: 0,
    time: 0,
    levelTime: 0,
    alarmed: false,
    everAlarmed: false,
    detection: 0,
    caughtFlash: 0,
    message: '',
    messageTime: 0,
    random,
  };

  function loadLevel(index) {
    const def = LEVELS[index];
    state.levelIndex = index;
    state.level = def;
    state.map = def.map.slice();
    state.guards = def.guards.map((g) => createGuard(g.spawn, g.waypoints));
    state.sentries = def.sentries.map((s) => createSentry(s.tile, s.startAngle));
    state.coins = [];
    state.lamps = [];
    state.artifact = null;
    state.exit = null;
    state.pebbleFlights = [];
    state.noises = [];
    state.pebbles = PEBBLE.count;
    state.pebbleCooldown = 0;
    state.levelTime = 0;
    state.everAlarmed = false;
    state.detection = 0;
    state.spawn = null;
    def.map.forEach((row, y) => {
      [...row].forEach((ch, x) => {
        const cx = (x + 0.5) * TILE;
        const cy = (y + 0.5) * TILE;
        if (ch === 'P') {
          state.player.x = cx;
          state.player.y = cy;
          state.player.angle = 0;
          state.player.stepTime = 0;
          state.player.moving = false;
          state.player.sneaking = false;
          state.spawn = { x: cx, y: cy };
        } else if (ch === 'o') state.coins.push({ x: cx, y: cy, taken: false, phase: random() * Math.PI * 2 });
        else if (ch === 'A') state.artifact = { x: cx, y: cy, taken: false, phase: 0 };
        else if (ch === 'E') state.exit = { x: cx, y: cy, open: false };
        else if (ch === 'L') state.lamps.push({ x: cx, y: cy });
      });
    });
    state.message = def.brief;
    state.messageTime = 5;
  }

  function reset() {
    state.lives = LIVES;
    state.score = 0;
    state.coinsTaken = 0;
    state.time = 0;
    state.caughtFlash = 0;
    loadLevel(0);
  }

  /** Move a circle, sliding along walls; returns true if it moved. */
  function moveCircle(body, dx, dy, radius) {
    let moved = false;
    const tryMove = (nx, ny) => {
      const minX = Math.floor((nx - radius) / TILE);
      const maxX = Math.floor((nx + radius) / TILE);
      const minY = Math.floor((ny - radius) / TILE);
      const maxY = Math.floor((ny + radius) / TILE);
      for (let ty = minY; ty <= maxY; ty += 1) {
        for (let tx = minX; tx <= maxX; tx += 1) {
          if (isWalkableTile(tileAt(state.map, tx, ty))) continue;
          const cx = Math.max(tx * TILE, Math.min(nx, (tx + 1) * TILE));
          const cy = Math.max(ty * TILE, Math.min(ny, (ty + 1) * TILE));
          if ((nx - cx) * (nx - cx) + (ny - cy) * (ny - cy) < radius * radius) return false;
        }
      }
      return true;
    };
    if (dx !== 0 && tryMove(body.x + dx, body.y)) {
      body.x += dx;
      moved = true;
    }
    if (dy !== 0 && tryMove(body.x, body.y + dy)) {
      body.y += dy;
      moved = true;
    }
    return moved;
  }

  function respawnAfterCaught() {
    state.lives -= 1;
    state.caughtFlash = 1;
    if (state.lives <= 0) return EVENT_GAME_OVER;
    // Back to the start of this level; the guards forget you and go home.
    const hadArtifact = state.artifact && state.artifact.taken;
    loadLevel(state.levelIndex);
    if (hadArtifact) {
      // A stolen relic stays stolen: you keep what you already took.
      state.artifact.taken = true;
      state.exit.open = true;
    }
    return EVENT_CAUGHT;
  }

  /**
   * One fixed step. `steer` is a normalised {x, y} vector, `sneaking` whether
   * the thief crouches, `throwAt` a world point to toss a pebble at (or null).
   * Returns EVENT_* flags; the caller plays the matching sounds.
   */
  function step(dt, steer, sneaking, throwAt) {
    let events = 0;
    state.time += dt;
    state.levelTime += dt;
    if (state.messageTime > 0) state.messageTime -= dt;
    if (state.caughtFlash > 0) state.caughtFlash = Math.max(0, state.caughtFlash - dt * 2);
    if (state.pebbleCooldown > 0) state.pebbleCooldown -= dt;

    // The thief moves; footsteps are noise unless sneaking.
    const speed = sneaking ? PLAYER.sneakSpeed : PLAYER.walkSpeed;
    const moved = moveCircle(state.player, steer.x * speed * dt, steer.y * speed * dt, PLAYER.radius);
    state.player.moving = moved && (steer.x !== 0 || steer.y !== 0);
    if (state.player.moving) {
      state.player.angle = Math.atan2(steer.y, steer.x);
      state.player.stepTime += dt;
      if (state.player.stepTime > (sneaking ? 0.55 : 0.38)) {
        state.player.stepTime = 0;
        if (!sneaking) state.noises.push({ x: state.player.x, y: state.player.y, radius: PLAYER.noiseRadius, time: 0.4 });
      }
    }
    state.player.sneaking = sneaking;
    state.player.x = Math.max(PLAYER.radius, Math.min(FIELD.width - PLAYER.radius, state.player.x));
    state.player.y = Math.max(PLAYER.radius, Math.min(FIELD.height - PLAYER.radius, state.player.y));

    // A thrown pebble arcs to its target, then rings out and draws guards.
    if (throwAt && state.pebbles > 0 && state.pebbleCooldown <= 0) {
      const dx = throwAt.x - state.player.x;
      const dy = throwAt.y - state.player.y;
      const dist = Math.min(Math.hypot(dx, dy), PEBBLE.throwRange);
      const angle = Math.atan2(dy, dx);
      state.pebbles -= 1;
      state.pebbleCooldown = PEBBLE.cooldown;
      state.pebbleFlights.push({
        x: state.player.x,
        y: state.player.y,
        tx: state.player.x + Math.cos(angle) * dist,
        ty: state.player.y + Math.sin(angle) * dist,
        t: 0,
        dur: 0.35,
      });
    }
    state.pebbleFlights = state.pebbleFlights.filter((f) => {
      f.t += dt;
      if (f.t >= f.dur) {
        state.noises.push({ x: f.tx, y: f.ty, radius: PEBBLE.noiseRadius, time: 1.2 });
        return false;
      }
      return true;
    });
    state.noises = state.noises.filter((n) => (n.time -= dt) > 0);

    // Coins and the relic.
    state.coins.forEach((coin) => {
      coin.phase += dt * 3;
      if (!coin.taken && Math.hypot(coin.x - state.player.x, coin.y - state.player.y) < PLAYER.radius + 14) {
        coin.taken = true;
        state.coinsTaken += 1;
        state.score += SCORE.coin;
        events |= EVENT_COIN;
      }
    });
    if (state.artifact) {
      state.artifact.phase += dt * 2;
      if (!state.artifact.taken && Math.hypot(state.artifact.x - state.player.x, state.artifact.y - state.player.y) < PLAYER.radius + 18) {
        state.artifact.taken = true;
        state.score += SCORE.artifact;
        state.exit.open = true;
        state.message = `You took ${state.level.artifactName}. Now reach the exit!`;
        state.messageTime = 4;
        events |= EVENT_ARTIFACT;
      }
    }

    // What each guard and sentry sees, and how the thief is heard.
    let maxDetection = 0;
    let anyChase = false;
    const hearPoint = (body) => {
      for (const n of state.noises) {
        if (Math.hypot(n.x - body.x, n.y - body.y) < n.radius) return { x: n.x, y: n.y };
      }
      return null;
    };
    state.guards.forEach((guard) => {
      const see = visibility(state.map, guard, GUARD.visionRange, GUARD.visionHalfAngle, state.player, sneaking);
      if (see > 0) guard.lastSeen = { x: state.player.x, y: state.player.y };
      stepGuard(guard, dt, see, hearPoint(guard), state.player, () => {
        events |= respawnAfterCaught();
      });
      if (guard.justBecameSuspicious) state.message = 'A guard heard something…';
      if (guard.justAlarmed) {
        state.message = 'SPOTTED! Run for cover!';
        state.messageTime = 2.5;
        state.everAlarmed = true;
      }
      maxDetection = Math.max(maxDetection, guard.detection);
      if (guard.state === GUARD_CHASE) anyChase = true;
    });
    state.sentries.forEach((sentry) => {
      const see = visibility(state.map, sentry, SENTRY.visionRange, SENTRY.visionHalfAngle, state.player, sneaking);
      stepSentry(sentry, dt, see);
      if (sentry.justAlarmed) {
        state.message = 'A searchlight found you!';
        state.messageTime = 2.5;
        state.everAlarmed = true;
        // The nearest guard comes to look where the light caught you.
        let nearest = null;
        let nearestDist = Infinity;
        state.guards.forEach((g) => {
          const d = Math.hypot(g.x - state.player.x, g.y - state.player.y);
          if (d < nearestDist) {
            nearestDist = d;
            nearest = g;
          }
        });
        if (nearest) {
          nearest.target = { x: state.player.x, y: state.player.y };
          nearest.lastSeen = { x: state.player.x, y: state.player.y };
          nearest.state = 'investigate';
          nearest.stateTime = 0;
        }
      }
      maxDetection = Math.max(maxDetection, sentry.detection);
    });
    state.detection = maxDetection;
    state.alarmed = anyChase || state.sentries.some((s) => s.alarmed);

    // The exit, once the relic is yours.
    if (state.exit && state.exit.open && Math.hypot(state.exit.x - state.player.x, state.exit.y - state.player.y) < PLAYER.radius + 20) {
      const timeBonus = Math.max(0, SCORE.levelTimeBonus - Math.floor(state.levelTime) * 5);
      state.score += timeBonus;
      if (!state.everAlarmed) state.score += SCORE.ghostBonus;
      if (state.levelIndex + 1 < LEVELS.length) {
        loadLevel(state.levelIndex + 1);
        state.message = `Clean getaway! +${timeBonus} time bonus${state.everAlarmed ? '' : ' +300 ghost bonus'}.`;
        state.messageTime = 4;
      } else {
        events |= EVENT_LEVEL_CLEAR;
      }
    }
    return events;
  }

  reset();
  return { state, step, reset, loadLevel };
}

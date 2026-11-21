// The world: one level's state and rules. It parses a level map, moves the
// thief with circle-vs-tile collision, works out what each guard, dog, sentry
// and camera can see (vision cone + line of sight + bushes, shadow and smoke),
// runs the detection meter and the global alarm level, and owns the
// objective: steal the keycard and the relic, then reach the exit. It also
// carries the noise events pebbles and footsteps raise, and the laser grid.

import { ALARM, CAMERA, COLS, DOG, FIELD, GUARD, LASER, LIVES, PEBBLE, PLAYER, ROWS, SCORE, SENTRY, SMOKE, TILE } from './config.js';
import { LEVELS, blocksSightTile, isWalkableTile } from './levels.js';
import { createCamera, createDog, createGuard, createSentry, stepCamera, stepGuard, stepSentry, GUARD_CHASE } from './guards.js';

export const EVENT_CAUGHT = 1;
export const EVENT_LEVEL_CLEAR = 2;
export const EVENT_GAME_OVER = 4;
export const EVENT_ARTIFACT = 8;
export const EVENT_COIN = 16;
export const EVENT_KEYCARD = 32;
export const EVENT_SMOKE = 64;
export const EVENT_LASER = 128;
export const EVENT_ALARM = 256;

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

/** Is the segment from (x0, y0) to (x1, y1) cut by any smoke cloud? */
export function segmentInSmoke(smokes, x0, y0, x1, y1) {
  if (!smokes || smokes.length === 0) return false;
  const dx = x1 - x0;
  const dy = y1 - y0;
  const dist = Math.hypot(dx, dy);
  const steps = Math.max(1, Math.ceil(dist / 10));
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const px = x0 + dx * t;
    const py = y0 + dy * t;
    for (const s of smokes) {
      if (Math.hypot(px - s.x, py - s.y) < s.radius) return true;
    }
  }
  return false;
}

/**
 * How strongly `eye` sees the player: 0 when out of range, outside the cone,
 * behind a wall, hidden in a bush, or behind a smoke cloud; otherwise 1 at
 * point blank fading to 0.25 at the edge of the cone. Shadow and sneaking
 * slow it further.
 */
export function visibility(map, eye, eyeRange, eyeHalfAngle, player, sneaking, smokes) {
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
  if (segmentInSmoke(smokes, eye.x, eye.y, player.x, player.y)) return 0;
  let strength = 1 - (dist / eyeRange) * 0.75;
  if (onShadowTile(map, player.x, player.y)) strength *= 0.45;
  if (sneaking) strength *= 0.55;
  return strength;
}

/** Is a laser beam on right now? Beams pulse on a fixed cycle. */
export function beamIsOn(laser, time) {
  const cycle = LASER.onSeconds + LASER.offSeconds;
  return ((time + laser.phase) % cycle) < LASER.onSeconds;
}

/** Distance from a point to a laser beam's segment. */
export function distanceToBeam(laser, x, y) {
  const dx = laser.x2 - laser.x1;
  const dy = laser.y2 - laser.y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((x - laser.x1) * dx + (y - laser.y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  const px = laser.x1 + dx * t;
  const py = laser.y1 + dy * t;
  return Math.hypot(x - px, y - py);
}

/** Is the point inside a live laser beam of this level's state? */
export function pointInLiveBeam(state, x, y) {
  if (!state.lasersActive) return false;
  for (const laser of state.lasers) {
    if (beamIsOn(laser, state.time) && distanceToBeam(laser, x, y) < LASER.hitRadius) return true;
  }
  return false;
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
    dogs: [],
    sentries: [],
    cameras: [],
    lasers: [],
    lasersActive: false,
    laserExposure: 0,
    laserTripped: false,
    coins: [],
    artifact: null,
    keycard: null,
    exit: null,
    lamps: [],
    pebbles: PEBBLE.count,
    pebbleCooldown: 0,
    pebbleFlights: [],
    smokeBombs: SMOKE.count,
    smokeCooldown: 0,
    smokes: [],
    noises: [],
    lives: LIVES,
    score: 0,
    coinsTaken: 0,
    time: 0,
    levelTime: 0,
    alarmed: false,
    everAlarmed: false,
    alarmLevel: 0,
    alarmTimer: 0,
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
    state.dogs = def.dogs.map((d) => createDog(d.spawn, d.waypoints));
    state.sentries = def.sentries.map((s) => createSentry(s.tile, s.startAngle));
    state.cameras = def.cameras.map((c) => createCamera(c.tile, c.startAngle));
    state.lasers = def.lasers.map((l) => ({
      x1: (l.from[0] + 0.5) * TILE,
      y1: (l.from[1] + 0.5) * TILE,
      x2: (l.to[0] + 0.5) * TILE,
      y2: (l.to[1] + 0.5) * TILE,
      phase: l.phase,
    }));
    state.lasersActive = state.lasers.length > 0;
    state.laserExposure = 0;
    state.laserTripped = false;
    state.coins = [];
    state.lamps = [];
    state.artifact = null;
    state.keycard = null;
    state.exit = null;
    state.pebbleFlights = [];
    state.smokes = [];
    state.noises = [];
    state.pebbles = PEBBLE.count;
    state.smokeBombs = SMOKE.count;
    state.pebbleCooldown = 0;
    state.smokeCooldown = 0;
    state.levelTime = 0;
    state.everAlarmed = false;
    state.alarmLevel = 0;
    state.alarmTimer = 0;
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
        else if (ch === 'K') state.keycard = { x: cx, y: cy, taken: false, phase: 0 };
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
    const hadKeycard = state.keycard && state.keycard.taken;
    loadLevel(state.levelIndex);
    if (hadArtifact) {
      // A stolen relic stays stolen: you keep what you already took.
      state.artifact.taken = true;
      state.exit.open = true;
    }
    if (hadKeycard) {
      state.keycard.taken = true;
      state.lasersActive = false;
    }
    return EVENT_CAUGHT;
  }

  /** Send the nearest guard to look at a point (cameras and lasers use this). */
  function dispatchNearestGuard(point) {
    let nearest = null;
    let nearestDist = Infinity;
    state.guards.forEach((g) => {
      const d = Math.hypot(g.x - point.x, g.y - point.y);
      if (d < nearestDist) {
        nearestDist = d;
        nearest = g;
      }
    });
    if (nearest) {
      nearest.target = { x: point.x, y: point.y };
      nearest.lastSeen = { x: point.x, y: point.y };
      nearest.state = 'investigate';
      nearest.stateTime = 0;
    }
  }

  /**
   * One fixed step. `steer` is a normalised {x, y} vector, `sneaking` whether
   * the thief crouches, `throwAt` a world point to toss a pebble at (or null),
   * `smokeAt` a world point to drop a smoke bomb at (or null).
   * Returns EVENT_* flags; the caller plays the matching sounds.
   */
  function step(dt, steer, sneaking, throwAt, smokeAt) {
    let events = 0;
    state.time += dt;
    state.levelTime += dt;
    if (state.messageTime > 0) state.messageTime -= dt;
    if (state.caughtFlash > 0) state.caughtFlash = Math.max(0, state.caughtFlash - dt * 2);
    if (state.pebbleCooldown > 0) state.pebbleCooldown -= dt;
    if (state.smokeCooldown > 0) state.smokeCooldown -= dt;

    // The alarm level rises on a spot or a tripped laser, and cools down
    // after a quiet stretch; each level makes every patrol faster and
    // sharper-eyed.
    function raiseAlarm() {
      if (state.alarmLevel < ALARM.maxLevel) {
        state.alarmLevel += 1;
        if (state.alarmLevel === ALARM.maxLevel) {
          state.message = 'LOCKDOWN — every patrol is hunting you!';
          state.messageTime = 3;
        }
      }
      state.alarmTimer = 0;
      events |= EVENT_ALARM;
    }
    const alarmMult = 1 + ALARM.speedPerLevel * state.alarmLevel;
    const alarmDetect = 1 + ALARM.detectPerLevel * state.alarmLevel;
    const guardCfg = {
      ...GUARD,
      patrolSpeed: GUARD.patrolSpeed * alarmMult,
      investigateSpeed: GUARD.investigateSpeed * alarmMult,
      chaseSpeed: GUARD.chaseSpeed * alarmMult,
      detectRate: GUARD.detectRate * alarmDetect,
    };
    const dogCfg = {
      ...DOG,
      patrolSpeed: DOG.patrolSpeed * alarmMult,
      investigateSpeed: DOG.investigateSpeed * alarmMult,
      chaseSpeed: DOG.chaseSpeed * alarmMult,
      detectRate: DOG.detectRate * alarmDetect,
    };

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

    // A smoke bomb blooms where it lands: every cone is blind inside the
    // cloud, but the guards walk over to look at it once it clears.
    if (smokeAt && state.smokeBombs > 0 && state.smokeCooldown <= 0) {
      const dx = smokeAt.x - state.player.x;
      const dy = smokeAt.y - state.player.y;
      const dist = Math.min(Math.hypot(dx, dy), 240);
      const angle = Math.atan2(dy, dx);
      const sx = state.player.x + Math.cos(angle) * dist;
      const sy = state.player.y + Math.sin(angle) * dist;
      state.smokeBombs -= 1;
      state.smokeCooldown = SMOKE.cooldown;
      state.smokes.push({ x: sx, y: sy, radius: SMOKE.radius, time: SMOKE.duration, max: SMOKE.duration });
      events |= EVENT_SMOKE;
      state.guards.forEach((g) => {
        if (g.state !== GUARD_CHASE && Math.hypot(g.x - sx, g.y - sy) < SMOKE.lureRadius) {
          g.target = { x: sx, y: sy };
          g.state = 'investigate';
          g.stateTime = 0;
        }
      });
    }
    state.smokes = state.smokes.filter((s) => (s.time -= dt) > 0);
    state.noises = state.noises.filter((n) => (n.time -= dt) > 0);

    // Coins, the keycard and the relic.
    state.coins.forEach((coin) => {
      coin.phase += dt * 3;
      if (!coin.taken && Math.hypot(coin.x - state.player.x, coin.y - state.player.y) < PLAYER.radius + 14) {
        coin.taken = true;
        state.coinsTaken += 1;
        state.score += SCORE.coin;
        events |= EVENT_COIN;
      }
    });
    if (state.keycard) {
      state.keycard.phase += dt * 2;
      if (!state.keycard.taken && Math.hypot(state.keycard.x - state.player.x, state.keycard.y - state.player.y) < PLAYER.radius + 18) {
        state.keycard.taken = true;
        state.score += SCORE.keycard;
        state.lasersActive = false;
        state.message = 'Keycard taken — the laser grid is down.';
        state.messageTime = 4;
        events |= EVENT_KEYCARD;
      }
    }
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

    // A live laser beam fills the thief's detection fast and trips the alarm.
    // Standing in a beam is the one mistake the thief cannot sneak out of:
    // the grid sees through shadow, bushes and smoke alike.
    let inBeam = false;
    if (state.lasersActive) {
      for (const laser of state.lasers) {
        if (beamIsOn(laser, state.time) && distanceToBeam(laser, state.player.x, state.player.y) < LASER.hitRadius) {
          inBeam = true;
          break;
        }
      }
    }
    if (inBeam) {
      state.laserExposure = Math.min(1, state.laserExposure + LASER.detectRate * dt);
      if (!state.laserTripped) {
        state.laserTripped = true;
        state.message = 'LASER TRIP — the grid saw you!';
        state.messageTime = 2.5;
        state.everAlarmed = true;
        raiseAlarm();
        dispatchNearestGuard({ x: state.player.x, y: state.player.y });
        events |= EVENT_LASER;
      }
    } else {
      state.laserExposure = Math.max(0, state.laserExposure - 0.5 * dt);
      if (state.laserExposure < 0.2) state.laserTripped = false;
    }

    // What each guard, dog, sentry and camera sees, and how the thief is heard.
    let maxDetection = state.laserExposure;
    let anyChase = false;
    const hearPoint = (body, bonus) => {
      for (const n of state.noises) {
        if (Math.hypot(n.x - body.x, n.y - body.y) < n.radius + bonus) return { x: n.x, y: n.y };
      }
      return null;
    };
    state.guards.forEach((guard) => {
      const see = visibility(state.map, guard, GUARD.visionRange, GUARD.visionHalfAngle, state.player, sneaking, state.smokes);
      if (see > 0) guard.lastSeen = { x: state.player.x, y: state.player.y };
      stepGuard(guard, dt, see, hearPoint(guard, 0), state.player, () => {
        events |= respawnAfterCaught();
      }, guardCfg);
      if (guard.justBecameSuspicious) state.message = 'A guard heard something…';
      if (guard.justAlarmed) {
        state.message = 'SPOTTED! Run for cover!';
        state.messageTime = 2.5;
        state.everAlarmed = true;
        raiseAlarm();
      }
      maxDetection = Math.max(maxDetection, guard.detection);
      if (guard.state === GUARD_CHASE) anyChase = true;
    });
    state.dogs.forEach((dog) => {
      const see = visibility(state.map, dog, DOG.visionRange, DOG.visionHalfAngle, state.player, sneaking, state.smokes);
      if (see > 0) dog.lastSeen = { x: state.player.x, y: state.player.y };
      stepGuard(dog, dt, see, hearPoint(dog, DOG.hearingBonus), state.player, () => {
        events |= respawnAfterCaught();
      }, dogCfg);
      if (dog.justBecameSuspicious) state.message = 'The dog caught your scent…';
      if (dog.justAlarmed) {
        state.message = 'THE DOG HAS YOU! Run!';
        state.messageTime = 2.5;
        state.everAlarmed = true;
        raiseAlarm();
      }
      maxDetection = Math.max(maxDetection, dog.detection);
      if (dog.state === GUARD_CHASE) anyChase = true;
    });
    state.sentries.forEach((sentry) => {
      const see = visibility(state.map, sentry, SENTRY.visionRange, SENTRY.visionHalfAngle, state.player, sneaking, state.smokes);
      stepSentry(sentry, dt, see);
      if (sentry.justAlarmed) {
        state.message = 'A searchlight found you!';
        state.messageTime = 2.5;
        state.everAlarmed = true;
        raiseAlarm();
        dispatchNearestGuard({ x: state.player.x, y: state.player.y });
      }
      maxDetection = Math.max(maxDetection, sentry.detection);
    });
    state.cameras.forEach((camera) => {
      const see = visibility(state.map, camera, CAMERA.visionRange, CAMERA.visionHalfAngle, state.player, sneaking, state.smokes);
      stepCamera(camera, dt, see);
      if (camera.justAlarmed) {
        state.message = 'A camera spotted you!';
        state.messageTime = 2.5;
        state.everAlarmed = true;
        raiseAlarm();
        dispatchNearestGuard({ x: state.player.x, y: state.player.y });
      }
      maxDetection = Math.max(maxDetection, camera.detection);
    });
    state.detection = maxDetection;
    state.alarmed = anyChase || state.sentries.some((s) => s.alarmed) || state.cameras.some((c) => c.alarmed);

    // The alarm cools down after a quiet stretch.
    if (anyChase || state.cameras.some((c) => c.alarmed) || state.sentries.some((s) => s.alarmed)) {
      state.alarmTimer = 0;
    } else {
      state.alarmTimer += dt;
      if (state.alarmTimer > ALARM.decaySeconds && state.alarmLevel > 0) {
        state.alarmLevel -= 1;
        state.alarmTimer = 0;
        state.message = 'The patrols are calming down…';
        state.messageTime = 2;
      }
    }

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

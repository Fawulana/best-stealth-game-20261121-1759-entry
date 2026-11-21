// Guard, dog, sentry and camera behaviour. A guard walks its patrol loop,
// grows suspicious when it half-sees you, investigates the last place it saw
// you, and chases when the detection meter fills. A dog runs the same state
// machine with a dog's senses: short, wide sight, but it hears footsteps
// from far away and runs you down. A sentry is a fixed searchlight that
// sweeps back and forth and raises the alarm the same way, but never moves.
// A camera is a wall-mounted eye with a long, narrow cone and a slow sweep:
// when its meter fills it raises the alarm level and sends the nearest
// guard to look. States: patrol, suspicious, investigate, chase, search,
// return.

import { CAMERA, DOG, GUARD, SENTRY, TILE } from './config.js';

export const GUARD_PATROL = 'patrol';
export const GUARD_SUSPICIOUS = 'suspicious';
export const GUARD_INVESTIGATE = 'investigate';
export const GUARD_CHASE = 'chase';
export const GUARD_SEARCH = 'search';
export const GUARD_RETURN = 'return';

export function createGuard(spawnTile, waypoints) {
  const start = { x: (spawnTile[0] + 0.5) * TILE, y: (spawnTile[1] + 0.5) * TILE };
  return {
    kind: 'guard',
    x: start.x,
    y: start.y,
    angle: 0,
    state: GUARD_PATROL,
    waypoints: waypoints.map(([tx, ty]) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE })),
    waypointIndex: 1,
    target: null,
    lastSeen: null,
    stateTime: 0,
    pauseTime: 0,
    detection: 0,
    justBecameSuspicious: false,
    justAlarmed: false,
    justLost: false,
  };
}

/** A dog is a guard with a dog's senses: same state machine, DOG numbers. */
export function createDog(spawnTile, waypoints) {
  const dog = createGuard(spawnTile, waypoints);
  dog.kind = 'dog';
  return dog;
}

export function createSentry(tile, startAngle) {
  return {
    kind: 'sentry',
    x: (tile[0] + 0.5) * TILE,
    y: (tile[1] + 0.5) * TILE,
    angle: startAngle,
    sweepDirection: 1,
    sweepCentre: startAngle,
    detection: 0,
    justAlarmed: false,
    alarmed: false,
  };
}

/**
 * A wall-mounted camera. Its body sits on the wall tile, but its eye pokes
 * out of the wall by half a tile plus a little, so its cone starts in open
 * floor instead of inside the wall it is mounted on. x/y is the eye (what
 * sees and what the cone is drawn from); bx/by is the body (what is drawn).
 */
export function createCamera(tile, startAngle) {
  const bx = (tile[0] + 0.5) * TILE;
  const by = (tile[1] + 0.5) * TILE;
  return {
    kind: 'camera',
    x: bx + Math.cos(startAngle) * (TILE / 2 + 4),
    y: by + Math.sin(startAngle) * (TILE / 2 + 4),
    bx,
    by,
    angle: startAngle,
    sweepDirection: 1,
    sweepCentre: startAngle,
    detection: 0,
    justAlarmed: false,
    alarmed: false,
  };
}

/** Move toward a point at a speed, stopping when close; returns true on arrival. */
function moveToward(body, tx, ty, speed, dt) {
  const dx = tx - body.x;
  const dy = ty - body.y;
  const dist = Math.hypot(dx, dy);
  if (dist < 2) return true;
  const step = Math.min(dist, speed * dt);
  body.x += (dx / dist) * step;
  body.y += (dy / dist) * step;
  body.angle = Math.atan2(dy, dx);
  return dist - step < 2;
}

/**
 * One guard (or dog) step. `see` tells whether it currently sees the player
 * and how strongly (0..1); `hear` is a noise point to investigate, or null;
 * `player` is the player's current position, for the catch check. `cfg` is
 * the GUARD or DOG numbers; the callbacks report state changes so the world
 * can play sounds and score them.
 */
export function stepGuard(guard, dt, see, hear, player, onCaught, cfg = GUARD) {
  guard.justBecameSuspicious = false;
  guard.justAlarmed = false;
  guard.justLost = false;
  guard.stateTime += dt;

  // Detection rises while the player is seen, falls while hidden.
  if (see > 0) guard.detection = Math.min(1, guard.detection + see * cfg.detectRate * dt);
  else guard.detection = Math.max(0, guard.detection - 0.22 * dt);

  if (hear && guard.state !== GUARD_CHASE) {
    guard.target = { x: hear.x, y: hear.y };
    guard.state = GUARD_INVESTIGATE;
    guard.stateTime = 0;
  }

  switch (guard.state) {
    case GUARD_PATROL: {
      if (guard.detection >= 1) {
        guard.state = GUARD_CHASE;
        guard.stateTime = 0;
        guard.justAlarmed = true;
      } else if (guard.detection >= cfg.suspectAt) {
        guard.state = GUARD_SUSPICIOUS;
        guard.stateTime = 0;
        guard.justBecameSuspicious = true;
      } else if (guard.pauseTime > 0) {
        guard.pauseTime -= dt;
      } else {
        const wp = guard.waypoints[guard.waypointIndex];
        if (moveToward(guard, wp.x, wp.y, cfg.patrolSpeed, dt)) {
          guard.waypointIndex = (guard.waypointIndex + 1) % guard.waypoints.length;
          guard.pauseTime = 0.6;
        }
      }
      break;
    }
    case GUARD_SUSPICIOUS: {
      // Stand and stare at the last seen spot for a beat, then go and look.
      if (guard.lastSeen) {
        guard.angle = Math.atan2(guard.lastSeen.y - guard.y, guard.lastSeen.x - guard.x);
      }
      if (guard.detection >= 1) {
        guard.state = GUARD_CHASE;
        guard.stateTime = 0;
        guard.justAlarmed = true;
      } else if (guard.stateTime > 0.9) {
        guard.target = guard.lastSeen ? { ...guard.lastSeen } : { x: guard.x, y: guard.y };
        guard.state = GUARD_INVESTIGATE;
        guard.stateTime = 0;
      }
      break;
    }
    case GUARD_INVESTIGATE: {
      if (guard.detection >= 1) {
        guard.state = GUARD_CHASE;
        guard.stateTime = 0;
        guard.justAlarmed = true;
      } else if (guard.target && moveToward(guard, guard.target.x, guard.target.y, cfg.investigateSpeed, dt)) {
        guard.state = GUARD_SEARCH;
        guard.stateTime = 0;
      }
      break;
    }
    case GUARD_CHASE: {
      if (guard.lastSeen) {
        moveToward(guard, guard.lastSeen.x, guard.lastSeen.y, cfg.chaseSpeed, dt);
        if (see <= 0 && guard.stateTime > cfg.chaseMemory) {
          guard.state = GUARD_SEARCH;
          guard.stateTime = 0;
          guard.justLost = true;
        }
      } else {
        guard.state = GUARD_SEARCH;
        guard.stateTime = 0;
      }
      if (onCaught && player && Math.hypot(player.x - guard.x, player.y - guard.y) < cfg.radius + 14) {
        onCaught(guard);
      }
      break;
    }
    case GUARD_SEARCH: {
      // Look around the spot where you were last seen, then give up.
      guard.angle += dt * 2.2;
      if (guard.detection >= 1) {
        guard.state = GUARD_CHASE;
        guard.stateTime = 0;
        guard.justAlarmed = true;
      } else if (guard.stateTime > cfg.searchTime) {
        guard.state = GUARD_RETURN;
        guard.stateTime = 0;
      }
      break;
    }
    case GUARD_RETURN: {
      // Walk back to the nearest patrol waypoint and resume the loop.
      let nearest = 0;
      let nearestDist = Infinity;
      guard.waypoints.forEach((wp, i) => {
        const d = Math.hypot(wp.x - guard.x, wp.y - guard.y);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = i;
        }
      });
      guard.waypointIndex = nearest;
      if (moveToward(guard, guard.waypoints[nearest].x, guard.waypoints[nearest].y, cfg.patrolSpeed, dt)) {
        guard.state = GUARD_PATROL;
        guard.stateTime = 0;
        guard.waypointIndex = (nearest + 1) % guard.waypoints.length;
      }
      break;
    }
    default:
      break;
  }
}

/** One sentry step: sweep the light and track detection like a guard. */
export function stepSentry(sentry, dt, see) {
  sentry.justAlarmed = false;
  sentry.angle += sentry.sweepDirection * SENTRY.sweepSpeed * dt;
  if (sentry.angle > sentry.sweepCentre + 1.1) sentry.sweepDirection = -1;
  if (sentry.angle < sentry.sweepCentre - 1.1) sentry.sweepDirection = 1;
  if (see > 0) sentry.detection = Math.min(1, sentry.detection + see * SENTRY.detectRate * dt);
  else sentry.detection = Math.max(0, sentry.detection - 0.22 * dt);
  if (sentry.detection >= 1 && !sentry.alarmed) {
    sentry.alarmed = true;
    sentry.justAlarmed = true;
  } else if (sentry.detection < 0.4) {
    sentry.alarmed = false;
  }
}

/** One camera step: a slow, narrow sweep; its alarm is the world's to raise.
 *  A camera never chases — it watches, and it calls the guards. */
export function stepCamera(camera, dt, see) {
  camera.justAlarmed = false;
  camera.angle += camera.sweepDirection * CAMERA.sweepSpeed * dt;
  if (camera.angle > camera.sweepCentre + CAMERA.sweepArc) camera.sweepDirection = -1;
  if (camera.angle < camera.sweepCentre - CAMERA.sweepArc) camera.sweepDirection = 1;
  if (see > 0) camera.detection = Math.min(1, camera.detection + see * CAMERA.detectRate * dt);
  else camera.detection = Math.max(0, camera.detection - 0.22 * dt);
  if (camera.detection >= 1 && !camera.alarmed) {
    camera.alarmed = true;
    camera.justAlarmed = true;
  } else if (camera.detection < 0.4) {
    camera.alarmed = false;
  }
}

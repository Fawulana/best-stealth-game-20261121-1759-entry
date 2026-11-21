// Guard and sentry behaviour. A guard walks its patrol loop, grows suspicious
// when it half-sees you, investigates the last place it saw you, and chases
// when the detection meter fills. A sentry is a fixed searchlight that sweeps
// back and forth and raises the alarm the same way, but never moves.
// States: patrol, suspicious, investigate, chase, search, return.

import { GUARD, SENTRY, TILE } from './config.js';

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
 * One guard step. `see` tells whether the guard currently sees the player and
 * how strongly (0..1); `hear` is a noise point to investigate, or null; and
 * `player` is the player's current position, for the catch check. The
 * callbacks report state changes so the world can play sounds and score them.
 */
export function stepGuard(guard, dt, see, hear, player, onCaught) {
  guard.justBecameSuspicious = false;
  guard.justAlarmed = false;
  guard.justLost = false;
  guard.stateTime += dt;

  // Detection rises while the player is seen, falls while hidden.
  if (see > 0) guard.detection = Math.min(1, guard.detection + see * GUARD.detectRate * dt);
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
      } else if (guard.detection >= GUARD.suspectAt) {
        guard.state = GUARD_SUSPICIOUS;
        guard.stateTime = 0;
        guard.justBecameSuspicious = true;
      } else if (guard.pauseTime > 0) {
        guard.pauseTime -= dt;
      } else {
        const wp = guard.waypoints[guard.waypointIndex];
        if (moveToward(guard, wp.x, wp.y, GUARD.patrolSpeed, dt)) {
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
      } else if (guard.target && moveToward(guard, guard.target.x, guard.target.y, GUARD.investigateSpeed, dt)) {
        guard.state = GUARD_SEARCH;
        guard.stateTime = 0;
      }
      break;
    }
    case GUARD_CHASE: {
      if (guard.lastSeen) {
        moveToward(guard, guard.lastSeen.x, guard.lastSeen.y, GUARD.chaseSpeed, dt);
        if (see <= 0 && guard.stateTime > GUARD.chaseMemory) {
          guard.state = GUARD_SEARCH;
          guard.stateTime = 0;
          guard.justLost = true;
        }
      } else {
        guard.state = GUARD_SEARCH;
        guard.stateTime = 0;
      }
      if (onCaught && player && Math.hypot(player.x - guard.x, player.y - guard.y) < GUARD.radius + 14) {
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
      } else if (guard.stateTime > GUARD.searchTime) {
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
      if (moveToward(guard, guard.waypoints[nearest].x, guard.waypoints[nearest].y, GUARD.patrolSpeed, dt)) {
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

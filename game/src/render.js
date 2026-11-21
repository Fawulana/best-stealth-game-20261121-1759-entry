// The renderer: one canvas, painted from the world state. It draws the stone
// floor, walls, crates, bushes and shadow, then the thief, the guards, the
// dog, the sentries and cameras with their vision cones (clipped to the walls
// by raycasting), the laser grid, the smoke, the relic, the keycard and the
// exit, then a night darkness with pools of light punched out, and finally
// the HUD — score, objective tracker, alarm meter — and the title, pause,
// level-clear, caught and victory screens.

import { ALARM, CAMERA, COLS, DOG, FIELD, FONT, GUARD, PALETTE, ROWS, SENTRY, TILE } from './config.js';
import { beamIsOn, castRay } from './world.js';
import { GUARD_CHASE, GUARD_INVESTIGATE, GUARD_SEARCH, GUARD_SUSPICIOUS } from './guards.js';

export const SCREEN_TITLE = 'title';
export const SCREEN_PLAY = 'play';
export const SCREEN_PAUSED = 'paused';
export const SCREEN_LEVEL_CLEAR = 'levelclear';
export const SCREEN_OVER = 'over';
export const SCREEN_WIN = 'win';

const CONE_RAYS = 18;

export function createRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  const dark = document.createElement('canvas');
  const darkCtx = dark.getContext('2d');
  // A deterministic shade per floor tile, so the floor never shimmers.
  const tileShade = [];
  let seed = 1234567;
  const nextShade = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    return (seed / 4294967296) * 0.12 - 0.06;
  };
  for (let y = 0; y < ROWS; y += 1) {
    tileShade.push([]);
    for (let x = 0; x < COLS; x += 1) tileShade[y].push(nextShade());
  }

  function fitCanvas() {
    const w = canvas.clientWidth || FIELD.width;
    const h = canvas.clientHeight || FIELD.height;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    const scale = Math.min(canvas.width / FIELD.width, canvas.height / FIELD.height);
    ctx.setTransform(scale, 0, 0, scale, (canvas.width - FIELD.width * scale) / 2, (canvas.height - FIELD.height * scale) / 2);
    dark.width = FIELD.width;
    dark.height = FIELD.height;
  }

  function shade(hex, amount) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + Math.round(255 * amount)));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 255) + Math.round(255 * amount)));
    const b = Math.max(0, Math.min(255, (n & 255) + Math.round(255 * amount)));
    return `rgb(${r},${g},${b})`;
  }

  function drawFloor(state) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const ch = state.map[y][x];
        const px = x * TILE;
        const py = y * TILE;
        const base = (x + y) % 2 === 0 ? PALETTE.floorA : PALETTE.floorB;
        ctx.fillStyle = shade(base, tileShade[y][x]);
        ctx.fillRect(px, py, TILE, TILE);
        if (ch === '~') {
          ctx.fillStyle = 'rgba(16, 26, 51, 0.55)';
          ctx.fillRect(px, py, TILE, TILE);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.18)';
        ctx.strokeRect(px + 0.5, py + 0.5, TILE - 1, TILE - 1);
      }
    }
  }

  function drawWallsAndCover(state) {
    for (let y = 0; y < ROWS; y += 1) {
      for (let x = 0; x < COLS; x += 1) {
        const ch = state.map[y][x];
        const px = x * TILE;
        const py = y * TILE;
        if (ch === '#') {
          ctx.fillStyle = PALETTE.wall;
          ctx.fillRect(px, py, TILE, TILE);
          ctx.fillStyle = PALETTE.wallTop;
          ctx.fillRect(px, py, TILE, 6);
          ctx.fillStyle = 'rgba(0,0,0,0.25)';
          ctx.fillRect(px, py + TILE - 5, TILE, 5);
        } else if (ch === 'C') {
          ctx.fillStyle = PALETTE.crate;
          ctx.fillRect(px + 3, py + 3, TILE - 6, TILE - 6);
          ctx.strokeStyle = PALETTE.crateEdge;
          ctx.lineWidth = 2;
          ctx.strokeRect(px + 3, py + 3, TILE - 6, TILE - 6);
          ctx.beginPath();
          ctx.moveTo(px + 3, py + 3);
          ctx.lineTo(px + TILE - 3, py + TILE - 3);
          ctx.moveTo(px + TILE - 3, py + 3);
          ctx.lineTo(px + 3, py + TILE - 3);
          ctx.stroke();
        } else if (ch === 'B') {
          ctx.fillStyle = PALETTE.bush;
          ctx.beginPath();
          ctx.arc(px + 13, py + 15, 13, 0, Math.PI * 2);
          ctx.arc(px + 27, py + 13, 12, 0, Math.PI * 2);
          ctx.arc(px + 20, py + 27, 12, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = PALETTE.bushEdge;
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(px + 13, py + 15, 13, 0, Math.PI * 2);
          ctx.arc(px + 27, py + 13, 12, 0, Math.PI * 2);
          ctx.arc(px + 20, py + 27, 12, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    }
  }

  /** A vision cone clipped to the walls, as a polygon of raycast endpoints. */
  function conePolygon(map, eye, range, halfAngle) {
    const points = [{ x: eye.x, y: eye.y }];
    for (let i = 0; i <= CONE_RAYS; i += 1) {
      const angle = eye.angle - halfAngle + (2 * halfAngle * i) / CONE_RAYS;
      const dist = castRay(map, eye.x, eye.y, angle, range);
      points.push({ x: eye.x + Math.cos(angle) * dist, y: eye.y + Math.sin(angle) * dist });
    }
    return points;
  }

  function drawCone(map, eye, range, halfAngle, color, alpha) {
    const poly = conePolygon(map, eye, range, halfAngle);
    const grad = ctx.createRadialGradient(eye.x, eye.y, 10, eye.x, eye.y, range);
    grad.addColorStop(0, color);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.globalAlpha = alpha;
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(poly[0].x, poly[0].y);
    for (let i = 1; i < poly.length; i += 1) ctx.lineTo(poly[i].x, poly[i].y);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  function coneColorFor(guard) {
    if (guard.state === GUARD_CHASE) return PALETTE.coneAlert;
    if (guard.state === GUARD_SUSPICIOUS || guard.state === GUARD_INVESTIGATE || guard.state === GUARD_SEARCH) return PALETTE.coneSuspect;
    return PALETTE.cone;
  }

  function drawGuard(state, guard) {
    const g = guard;
    drawCone(state.map, g, GUARD.visionRange, GUARD.visionHalfAngle, coneColorFor(g), g.state === GUARD_CHASE ? 0.55 : 0.42);
    // A faint warm halo so the patrolman reads against the dark floor.
    const halo = ctx.createRadialGradient(g.x, g.y, 4, g.x, g.y, 34);
    halo.addColorStop(0, 'rgba(228, 87, 46, 0.35)');
    halo.addColorStop(1, 'rgba(228, 87, 46, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 34, 0, Math.PI * 2);
    ctx.fill();
    // Body: a uniformed patrolman with a helmet and a baton.
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.angle);
    ctx.fillStyle = PALETTE.guardUniform;
    ctx.beginPath();
    ctx.arc(0, 0, GUARD.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.guard;
    ctx.fillRect(2, -5, 12, 10);
    ctx.fillStyle = '#f4f1de';
    ctx.beginPath();
    ctx.arc(6, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // Alert marks and the detection ring.
    if (g.detection > 0.02) {
      ctx.strokeStyle = g.detection >= 1 ? PALETTE.danger : PALETTE.coneSuspect;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.x, g.y, GUARD.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.detection);
      ctx.stroke();
    }
    ctx.font = 'bold 22px ' + FONT;
    ctx.textAlign = 'center';
    if (g.state === GUARD_CHASE) {
      ctx.fillStyle = PALETTE.danger;
      ctx.fillText('!', g.x, g.y - GUARD.radius - 8);
    } else if (g.state === GUARD_SUSPICIOUS || g.state === GUARD_INVESTIGATE || g.state === GUARD_SEARCH) {
      ctx.fillStyle = PALETTE.coneSuspect;
      ctx.fillText('?', g.x, g.y - GUARD.radius - 8);
    }
  }

  /** A guard dog: low, fast, brown, with a wide cone and a nose for sound. */
  function drawDog(state, dog) {
    const g = dog;
    drawCone(state.map, g, DOG.visionRange, DOG.visionHalfAngle, coneColorFor(g), g.state === GUARD_CHASE ? 0.5 : 0.36);
    const halo = ctx.createRadialGradient(g.x, g.y, 4, g.x, g.y, 30);
    halo.addColorStop(0, 'rgba(176, 137, 104, 0.35)');
    halo.addColorStop(1, 'rgba(176, 137, 104, 0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(g.x, g.y, 30, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(g.x, g.y);
    ctx.rotate(g.angle);
    // Body: a low, long shape with a head, two ears and a tail.
    ctx.fillStyle = PALETTE.dog;
    ctx.beginPath();
    ctx.ellipse(0, 0, 15, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = PALETTE.dogDark;
    ctx.beginPath();
    ctx.arc(13, 0, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(10, -5);
    ctx.lineTo(13, -11);
    ctx.lineTo(15, -4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-13, 0);
    ctx.lineTo(-20, -5);
    ctx.lineTo(-19, 2);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#1d1410';
    ctx.beginPath();
    ctx.arc(17, 0, 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    if (g.detection > 0.02) {
      ctx.strokeStyle = g.detection >= 1 ? PALETTE.danger : PALETTE.coneSuspect;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(g.x, g.y, DOG.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * g.detection);
      ctx.stroke();
    }
    ctx.font = 'bold 22px ' + FONT;
    ctx.textAlign = 'center';
    if (g.state === GUARD_CHASE) {
      ctx.fillStyle = PALETTE.danger;
      ctx.fillText('!', g.x, g.y - DOG.radius - 8);
    } else if (g.state === GUARD_SUSPICIOUS || g.state === GUARD_INVESTIGATE || g.state === GUARD_SEARCH) {
      ctx.fillStyle = PALETTE.coneSuspect;
      ctx.fillText('?', g.x, g.y - DOG.radius - 8);
    }
  }

  function drawSentry(state, sentry) {
    drawCone(state.map, sentry, SENTRY.visionRange, SENTRY.visionHalfAngle, sentry.alarmed ? PALETTE.coneAlert : '#ffdf6b', sentry.alarmed ? 0.5 : 0.3);
    ctx.fillStyle = '#3a415c';
    ctx.beginPath();
    ctx.arc(sentry.x, sentry.y, SENTRY.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(sentry.x, sentry.y);
    ctx.rotate(sentry.angle);
    ctx.fillStyle = '#ffd166';
    ctx.fillRect(0, -4, 16, 8);
    ctx.restore();
    if (sentry.detection > 0.02) {
      ctx.strokeStyle = PALETTE.danger;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(sentry.x, sentry.y, SENTRY.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * sentry.detection);
      ctx.stroke();
    }
  }

  /** A wall-mounted camera: a small violet box with a blinking lens. The
   *  body sits on the wall (bx/by); the cone and the ring hang off its eye. */
  function drawCamera(state, camera) {
    drawCone(state.map, camera, CAMERA.visionRange, CAMERA.visionHalfAngle, camera.alarmed ? PALETTE.coneAlert : PALETTE.coneCamera, camera.alarmed ? 0.5 : 0.3);
    ctx.save();
    ctx.translate(camera.bx, camera.by);
    ctx.rotate(camera.angle);
    ctx.fillStyle = '#2b2f42';
    ctx.fillRect(-8, -8, 16, 16);
    ctx.strokeStyle = PALETTE.camera;
    ctx.lineWidth = 2;
    ctx.strokeRect(-8, -8, 16, 16);
    ctx.fillStyle = camera.alarmed ? PALETTE.danger : PALETTE.cameraLens;
    ctx.beginPath();
    ctx.arc(6, 0, 4, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // A blinking red light while the camera is alarmed.
    if (camera.alarmed && Math.sin(state.time * 8) > 0) {
      ctx.fillStyle = PALETTE.danger;
      ctx.beginPath();
      ctx.arc(camera.bx, camera.by - CAMERA.radius - 4, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    if (camera.detection > 0.02) {
      ctx.strokeStyle = PALETTE.danger;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(camera.x, camera.y, CAMERA.radius + 7, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * camera.detection);
      ctx.stroke();
    }
  }

  /** The laser grid: pulsing red beams between floor posts, faint when off. */
  function drawLasers(state) {
    if (!state.lasersActive) return;
    state.lasers.forEach((laser) => {
      const on = beamIsOn(laser, state.time);
      // The posts at both ends.
      ctx.fillStyle = on ? PALETTE.laser : PALETTE.laserOff;
      ctx.fillRect(laser.x1 - 5, laser.y1 - 5, 10, 10);
      ctx.fillRect(laser.x2 - 5, laser.y2 - 5, 10, 10);
      ctx.strokeStyle = on ? 'rgba(255, 46, 99, 0.9)' : 'rgba(92, 26, 48, 0.7)';
      ctx.lineWidth = on ? 3 : 1.5;
      ctx.setLineDash(on ? [] : [4, 6]);
      ctx.beginPath();
      ctx.moveTo(laser.x1, laser.y1);
      ctx.lineTo(laser.x2, laser.y2);
      ctx.stroke();
      ctx.setLineDash([]);
      if (on) {
        // A hot glow along the live beam.
        const grad = ctx.createLinearGradient(laser.x1, laser.y1, laser.x2, laser.y2);
        grad.addColorStop(0, 'rgba(255, 46, 99, 0.35)');
        grad.addColorStop(0.5, 'rgba(255, 46, 99, 0.12)');
        grad.addColorStop(1, 'rgba(255, 46, 99, 0.35)');
        ctx.strokeStyle = grad;
        ctx.lineWidth = 9;
        ctx.beginPath();
        ctx.moveTo(laser.x1, laser.y1);
        ctx.lineTo(laser.x2, laser.y2);
        ctx.stroke();
      }
    });
  }

  /** Smoke clouds: soft grey puffs that fade as they thin out. */
  function drawSmoke(state) {
    state.smokes.forEach((s) => {
      const alpha = 0.55 * (s.time / s.max);
      const grad = ctx.createRadialGradient(s.x, s.y, 6, s.x, s.y, s.radius);
      grad.addColorStop(0, `rgba(184, 192, 204, ${alpha})`);
      grad.addColorStop(0.7, `rgba(184, 192, 204, ${alpha * 0.6})`);
      grad.addColorStop(1, 'rgba(184, 192, 204, 0)');
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function drawPlayer(state) {
    const p = state.player;
    // A soft teal glow so the thief reads against the dark floor.
    const glow = ctx.createRadialGradient(p.x, p.y, 4, p.x, p.y, 36);
    glow.addColorStop(0, 'rgba(46, 196, 182, 0.4)');
    glow.addColorStop(1, 'rgba(46, 196, 182, 0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 36, 0, Math.PI * 2);
    ctx.fill();
    const bob = p.moving ? Math.sin(state.time * 12) * 1.5 : 0;
    ctx.save();
    ctx.translate(p.x, p.y + bob);
    ctx.rotate(p.angle);
    // Hooded cloak, teal; crouched and darker while sneaking.
    ctx.fillStyle = p.sneaking ? PALETTE.playerDark : PALETTE.player;
    ctx.beginPath();
    ctx.moveTo(14, 0);
    ctx.lineTo(-10, -10);
    ctx.lineTo(-13, 0);
    ctx.lineTo(-10, 10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#0f2e2b';
    ctx.beginPath();
    ctx.arc(2, 0, 7, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#ffe9a8';
    ctx.beginPath();
    ctx.arc(5, -2.5, 1.6, 0, Math.PI * 2);
    ctx.arc(5, 2.5, 1.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    // The detection meter arcs over the thief's head.
    if (state.detection > 0.02) {
      ctx.strokeStyle = state.detection >= 1 ? PALETTE.danger : PALETTE.coneSuspect;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 22, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * state.detection);
      ctx.stroke();
    }
  }

  function drawPickups(state) {
    state.coins.forEach((coin) => {
      if (coin.taken) return;
      const bob = Math.sin(coin.phase) * 2;
      ctx.fillStyle = PALETTE.coin;
      ctx.beginPath();
      ctx.arc(coin.x, coin.y + bob, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#8a6d1f';
      ctx.font = 'bold 11px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('¢', coin.x, coin.y + bob + 4);
    });
    const k = state.keycard;
    if (k && !k.taken) {
      const pulse = 1 + Math.sin(k.phase) * 0.1;
      ctx.save();
      ctx.translate(k.x, k.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = PALETTE.keycard;
      ctx.fillRect(-11, -7, 22, 14);
      ctx.fillStyle = '#0b2530';
      ctx.fillRect(-8, -4, 8, 3);
      ctx.fillRect(-8, 1, 12, 2);
      ctx.restore();
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.keycard;
      ctx.fillText('KEYCARD', k.x, k.y - 20);
    }
    const a = state.artifact;
    if (a && !a.taken) {
      const pulse = 1 + Math.sin(a.phase) * 0.12;
      ctx.save();
      ctx.translate(a.x, a.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = PALETTE.artifact;
      ctx.beginPath();
      ctx.moveTo(0, -14);
      ctx.lineTo(10, 0);
      ctx.lineTo(0, 14);
      ctx.lineTo(-10, 0);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#fff3b0';
      ctx.beginPath();
      ctx.arc(0, 0, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = PALETTE.artifact;
      ctx.fillText('RELIC', a.x, a.y - 22);
    }
    const e = state.exit;
    if (e) {
      const open = e.open;
      const pulse = open ? 1 + Math.sin(state.time * 4) * 0.15 : 1;
      ctx.save();
      ctx.translate(e.x, e.y);
      ctx.scale(pulse, pulse);
      ctx.fillStyle = open ? PALETTE.exit : PALETTE.exitLocked;
      ctx.fillRect(-14, -18, 28, 36);
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      ctx.fillRect(-8, -11, 16, 22);
      ctx.fillStyle = open ? PALETTE.exit : PALETTE.exitLocked;
      ctx.font = 'bold 10px ' + FONT;
      ctx.textAlign = 'center';
      ctx.restore();
      ctx.font = 'bold 12px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillStyle = open ? PALETTE.exit : PALETTE.muted;
      ctx.fillText(open ? 'EXIT — GO!' : 'EXIT (LOCKED)', e.x, e.y - 26);
    }
  }

  function drawPebblesAndNoise(state) {
    state.pebbleFlights.forEach((f) => {
      const t = f.t / f.dur;
      const x = f.x + (f.tx - f.x) * t;
      const y = f.y + (f.ty - f.y) * t - Math.sin(t * Math.PI) * 26;
      ctx.fillStyle = '#cfd6e4';
      ctx.beginPath();
      ctx.arc(x, y, 4, 0, Math.PI * 2);
      ctx.fill();
    });
    state.noises.forEach((n) => {
      ctx.strokeStyle = 'rgba(255,255,255,0.5)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(n.x, n.y, n.radius * (1 - n.time), 0, Math.PI * 2);
      ctx.stroke();
    });
  }

  /** Night darkness with pools of light around the thief, lamps and objectives. */
  function drawDarkness(state) {
    darkCtx.clearRect(0, 0, FIELD.width, FIELD.height);
    darkCtx.fillStyle = 'rgba(5, 8, 18, 0.48)';
    darkCtx.fillRect(0, 0, FIELD.width, FIELD.height);
    darkCtx.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, strength) => {
      const grad = darkCtx.createRadialGradient(x, y, 0, x, y, r);
      grad.addColorStop(0, `rgba(0,0,0,${strength})`);
      grad.addColorStop(1, 'rgba(0,0,0,0)');
      darkCtx.fillStyle = grad;
      darkCtx.beginPath();
      darkCtx.arc(x, y, r, 0, Math.PI * 2);
      darkCtx.fill();
    };
    hole(state.player.x, state.player.y, 170, 0.95);
    state.lamps.forEach((lamp) => hole(lamp.x, lamp.y, 130, 0.8));
    if (state.keycard && !state.keycard.taken) hole(state.keycard.x, state.keycard.y, 100, 0.85);
    if (state.artifact && !state.artifact.taken) hole(state.artifact.x, state.artifact.y, 110, 0.85);
    if (state.exit) hole(state.exit.x, state.exit.y, 100, 0.8);
    state.guards.forEach((g) => hole(g.x, g.y, 60, 0.55));
    state.dogs.forEach((g) => hole(g.x, g.y, 55, 0.55));
    darkCtx.globalCompositeOperation = 'source-over';
    ctx.drawImage(dark, 0, 0);
  }

  function drawHud(state, screen) {
    ctx.fillStyle = 'rgba(10, 13, 22, 0.85)';
    ctx.fillRect(0, 0, FIELD.width, 44);
    ctx.fillStyle = PALETTE.text;
    ctx.font = 'bold 17px ' + FONT;
    ctx.textAlign = 'left';
    ctx.fillText(`SHADOW VAULT — ${state.level.name}`, 14, 28);
    ctx.font = '15px ' + FONT;
    ctx.textAlign = 'center';
    const objective = state.artifact && state.artifact.taken ? 'Reach the exit!' : `Steal ${state.level.artifactName}`;
    ctx.fillStyle = state.artifact && state.artifact.taken ? PALETTE.exit : PALETTE.artifact;
    ctx.fillText(objective, FIELD.width / 2, 28);
    ctx.textAlign = 'right';
    ctx.fillStyle = PALETTE.text;
    const mm = Math.floor(state.time / 60);
    const ss = Math.floor(state.time % 60).toString().padStart(2, '0');
    ctx.fillText(`Score ${state.score}   ◆ ${state.coinsTaken}   ● ${state.pebbles}   ☁ ${state.smokeBombs}   ♥ ${'♥'.repeat(Math.max(0, state.lives))}${'♡'.repeat(Math.max(0, 3 - state.lives))}   ${mm}:${ss}`, FIELD.width - 14, 28);
    // The alarm meter: three pips under the score line.
    const label = state.alarmLevel === 0 ? 'CALM' : state.alarmLevel === 1 ? 'ALERT' : 'LOCKDOWN';
    ctx.font = 'bold 13px ' + FONT;
    ctx.textAlign = 'right';
    ctx.fillStyle = state.alarmLevel === 0 ? PALETTE.muted : state.alarmLevel === 1 ? PALETTE.coneSuspect : PALETTE.danger;
    ctx.fillText(`ALARM ${label}`, FIELD.width - 14, 64);
    for (let i = 0; i < ALARM.maxLevel; i += 1) {
      ctx.fillStyle = i < state.alarmLevel ? (state.alarmLevel === 1 ? PALETTE.coneSuspect : PALETTE.danger) : 'rgba(154, 163, 181, 0.35)';
      ctx.fillRect(FIELD.width - 30 - i * 18, 70, 14, 8);
    }
    if (state.alarmed) {
      ctx.fillStyle = PALETTE.danger;
      ctx.font = 'bold 18px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('⚠ SPOTTED — BREAK LINE OF SIGHT ⚠', FIELD.width / 2, 68);
    } else if (state.detection > 0.02) {
      ctx.fillStyle = PALETTE.coneSuspect;
      ctx.font = 'bold 15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText('Someone is watching…', FIELD.width / 2, 66);
    }
    // The objective tracker: what is done, and what is left.
    const steps = [];
    if (state.keycard) steps.push(['Keycard', state.keycard.taken]);
    if (state.artifact) steps.push([state.level.artifactName, state.artifact.taken]);
    steps.push(['Reach the exit', state.exit ? state.exit.open : false]);
    ctx.font = '13px ' + FONT;
    ctx.textAlign = 'left';
    const panelW = 210;
    const panelH = 20 + steps.length * 20;
    ctx.fillStyle = 'rgba(10, 13, 22, 0.7)';
    ctx.fillRect(10, 54, panelW, panelH);
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('OBJECTIVE', 20, 72);
    steps.forEach(([labelText, done], i) => {
      ctx.fillStyle = done ? PALETTE.exit : PALETTE.text;
      ctx.fillText(`${done ? '✓' : '○'} ${labelText}`, 20, 92 + i * 20);
    });
    if (state.messageTime > 0 && state.message) {
      ctx.fillStyle = 'rgba(10, 13, 22, 0.8)';
      const w = ctx.measureText(state.message).width + 28;
      ctx.fillRect((FIELD.width - w) / 2, FIELD.height - 52, w, 32);
      ctx.fillStyle = PALETTE.text;
      ctx.font = '15px ' + FONT;
      ctx.textAlign = 'center';
      ctx.fillText(state.message, FIELD.width / 2, FIELD.height - 30);
    }
    if (state.player.sneaking && screen === SCREEN_PLAY) {
      ctx.fillStyle = PALETTE.player;
      ctx.font = 'bold 13px ' + FONT;
      ctx.textAlign = 'left';
      ctx.fillText('SNEAKING — slow and silent', 14, FIELD.height - 14);
    }
  }

  function overlay(title, lines, accent) {
    ctx.fillStyle = 'rgba(5, 8, 18, 0.78)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = accent || PALETTE.text;
    ctx.font = 'bold 52px ' + FONT;
    ctx.fillText(title, FIELD.width / 2, 250);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '19px ' + FONT;
    lines.forEach((line, i) => ctx.fillText(line, FIELD.width / 2, 300 + i * 30));
  }

  function drawTitle(state, best) {
    drawFloor(state);
    drawWallsAndCover(state);
    drawPickups(state);
    state.guards.forEach((g) => drawGuard(state, g));
    state.dogs.forEach((g) => drawDog(state, g));
    state.sentries.forEach((s) => drawSentry(state, s));
    state.cameras.forEach((c) => drawCamera(state, c));
    drawLasers(state);
    drawPlayer(state);
    drawDarkness(state);
    ctx.fillStyle = 'rgba(5, 8, 18, 0.72)';
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    ctx.textAlign = 'center';
    ctx.fillStyle = PALETTE.artifact;
    ctx.font = 'bold 64px ' + FONT;
    ctx.fillText('SHADOW VAULT', FIELD.width / 2, 200);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '22px ' + FONT;
    ctx.fillText('A lantern-lit heist in four vaults', FIELD.width / 2, 242);
    ctx.font = '18px ' + FONT;
    ctx.fillStyle = PALETTE.muted;
    ctx.fillText('Steal the relic. Slip past the patrols, the dogs and the cameras. Reach the exit unseen.', FIELD.width / 2, 290);
    ctx.fillStyle = PALETTE.text;
    ctx.font = '17px ' + FONT;
    ctx.fillText('WASD / arrows — move      Shift — sneak      Click — throw a pebble to distract', FIELD.width / 2, 350);
    ctx.fillText('X / right-click — smoke bomb      Cameras and lasers raise the alarm', FIELD.width / 2, 380);
    ctx.fillText('Hide in bushes and shadow. Yellow cones see you — red cones are chasing you.', FIELD.width / 2, 410);
    ctx.fillText('P — pause      M — mute', FIELD.width / 2, 440);
    ctx.fillStyle = PALETTE.artifact;
    ctx.font = 'bold 22px ' + FONT;
    ctx.fillText('Press Enter or click to begin', FIELD.width / 2, 500);
    if (best > 0) {
      ctx.fillStyle = PALETTE.muted;
      ctx.font = '16px ' + FONT;
      ctx.fillText(`Best score: ${best}`, FIELD.width / 2, 540);
    }
    ctx.fillStyle = PALETTE.muted;
    ctx.font = '14px ' + FONT;
    ctx.fillText('Four levels: The Gallery · The Vault Hall · The Grand Vault · The Laser Vault', FIELD.width / 2, 600);
  }

  function draw(state, screen, best, finalScore) {
    fitCanvas();
    ctx.fillStyle = PALETTE.backdrop;
    ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    if (screen === SCREEN_TITLE) {
      drawTitle(state, best);
      return;
    }
    drawFloor(state);
    drawWallsAndCover(state);
    drawPickups(state);
    state.guards.forEach((g) => drawGuard(state, g));
    state.dogs.forEach((g) => drawDog(state, g));
    state.sentries.forEach((s) => drawSentry(state, s));
    state.cameras.forEach((c) => drawCamera(state, c));
    drawLasers(state);
    drawPlayer(state);
    drawSmoke(state);
    drawPebblesAndNoise(state);
    drawDarkness(state);
    // Cones glow through the dark: redraw them on top, faintly.
    state.guards.forEach((g) => drawCone(state.map, g, GUARD.visionRange, GUARD.visionHalfAngle, coneColorFor(g), 0.16));
    state.dogs.forEach((g) => drawCone(state.map, g, DOG.visionRange, DOG.visionHalfAngle, coneColorFor(g), 0.14));
    state.sentries.forEach((s) => drawCone(state.map, s, SENTRY.visionRange, SENTRY.visionHalfAngle, s.alarmed ? PALETTE.coneAlert : '#ffdf6b', 0.14));
    state.cameras.forEach((c) => drawCone(state.map, c, CAMERA.visionRange, CAMERA.visionHalfAngle, c.alarmed ? PALETTE.coneAlert : PALETTE.coneCamera, 0.13));
    drawHud(state, screen);
    if (state.caughtFlash > 0) {
      ctx.fillStyle = `rgba(239, 35, 60, ${state.caughtFlash * 0.35})`;
      ctx.fillRect(0, 0, FIELD.width, FIELD.height);
    }
    if (screen === SCREEN_PAUSED) {
      overlay('PAUSED', ['Press P or Enter to keep sneaking.'], PALETTE.text);
    } else if (screen === SCREEN_LEVEL_CLEAR) {
      // The new level is already loaded, so levelIndex counts the vaults cleared.
      overlay('CLEAN GETAWAY', [`Level ${state.levelIndex} of 4 cleared.`, `Score ${state.score} — press Enter for the next vault.`], PALETTE.exit);
    } else if (screen === SCREEN_OVER) {
      overlay('CAUGHT', [`The patrols finally caught up with you.`, `Score ${state.score}   Best ${best}`, 'Press Enter to try again.'], PALETTE.danger);
    } else if (screen === SCREEN_WIN) {
      overlay('THE VAULT IS YOURS', [
        'All four relics stolen. Not a single alarm that mattered.',
        `Final score ${finalScore ?? state.score}   Best ${best}`,
        'Press Enter to play again.',
      ], PALETTE.artifact);
    }
  }

  return { draw, fitCanvas };
}

// Boot and the one loop: input is read every frame, the world advances in fixed
// 1/60 s steps (several in a slow frame, none in a fast one), and the renderer
// paints what is there. The game moves between six screens: title, play,
// paused, level clear, game over and win.
//
// ?seed=N fixes the level layouts' random touches. ?shot=start|play|alert|
// vault|camera|win (with &seed=N) stages that scene instead of running the
// loop, paints it twice and sets window.__shotReady for a screenshot.
import { BEST_KEY, FIELD, LIVES, STEP } from './config.js';
import { createRandom } from './random.js';
import { createWorld, EVENT_ALARM, EVENT_ARTIFACT, EVENT_CAUGHT, EVENT_COIN, EVENT_GAME_OVER, EVENT_KEYCARD, EVENT_LASER, EVENT_LEVEL_CLEAR, EVENT_SMOKE } from './world.js';
import { ACTION_CONFIRM, ACTION_PAUSE, createInput } from './input.js';
import { createAudio } from './audio.js';
import { createRenderer, SCREEN_LEVEL_CLEAR, SCREEN_OVER, SCREEN_PAUSED, SCREEN_PLAY, SCREEN_TITLE, SCREEN_WIN } from './render.js';
import { stageShot } from './shots.js';

/** The longest frame the loop catches up on; a longer stall (a hidden tab) is dropped, not replayed. */
const MAX_FRAME = 0.25;

const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seedParam = Number.parseInt(params.get('seed') ?? '', 10);
const seed = Number.isInteger(seedParam) ? seedParam : Math.floor(Math.random() * 4294967296);

const canvas = document.getElementById('game');
const status = document.getElementById('status');
const world = createWorld(createRandom(seed));
const renderer = createRenderer(canvas);
const audio = createAudio();

function readBest() {
  try {
    return Number.parseInt(window.localStorage.getItem(BEST_KEY) ?? '0', 10) || 0;
  } catch {
    return 0;
  }
}

function saveBest(value) {
  try {
    window.localStorage.setItem(BEST_KEY, String(value));
  } catch {
    // Storage can be off (private windows): the best score then lasts this visit only.
  }
}

/** Convert a click in canvas pixels to a point in the 1280x720 world. */
function clickToWorld(click) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = FIELD.width / rect.width;
  const scaleY = FIELD.height / rect.height;
  return { x: click.x * scaleX, y: click.y * scaleY };
}

function runShot(name) {
  const scene = stageShot(name, world);
  let painted = 0;
  function paint() {
    renderer.draw(world.state, scene.screen, scene.best, scene.finalScore);
    painted += 1;
    if (painted < 2) requestAnimationFrame(paint);
    else window.__shotReady = true;
  }
  requestAnimationFrame(paint);
}

function runGame() {
  const input = createInput(canvas);
  let screen = SCREEN_TITLE;
  let best = readBest();
  let accumulator = 0;
  let last = performance.now();
  let lastLevel = 0;
  let wasAlarmed = false;

  // Screen readers (and anyone watching the page's text) hear the screen changes and each pickup.
  function announce(message) {
    status.textContent = message;
  }

  function startGame() {
    world.reset();
    accumulator = 0;
    lastLevel = 0;
    screen = SCREEN_PLAY;
    announce(`Playing. ${LIVES} lives. Steal the relic, then reach the exit.`);
  }

  function endGame(win) {
    screen = win ? SCREEN_WIN : SCREEN_OVER;
    if (world.state.score > best) {
      best = world.state.score;
      saveBest(best);
    }
    if (win) audio.win();
    else audio.gameOver();
    announce(win ? `You stole every relic. Final score ${world.state.score}.` : `Caught. Score ${world.state.score}. Best ${best}.`);
  }

  function handleActions() {
    const actions = input.takeActions();
    if (actions & ACTION_CONFIRM) {
      audio.unlock();
      if (screen === SCREEN_TITLE || screen === SCREEN_OVER || screen === SCREEN_WIN) startGame();
      else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      } else if (screen === SCREEN_LEVEL_CLEAR) {
        screen = SCREEN_PLAY;
        announce(`Playing ${world.state.level.name}.`);
      }
    }
    if (actions & ACTION_PAUSE) {
      if (screen === SCREEN_PLAY) {
        screen = SCREEN_PAUSED;
        announce('Paused.');
      } else if (screen === SCREEN_PAUSED) {
        screen = SCREEN_PLAY;
        announce('Playing.');
      }
    }
  }

  function step() {
    if (screen === SCREEN_TITLE) return;
    const click = input.takeClick();
    const throwAt = click && screen === SCREEN_PLAY ? clickToWorld(click) : null;
    if (throwAt) audio.pebble();
    const smoke = input.takeSmoke();
    let smokeAt = null;
    if (smoke && screen === SCREEN_PLAY) {
      // X drops the bomb at the thief's feet; a right click drops it where
      // it lands, up to the world's throw range.
      smokeAt = smoke.here ? { x: world.state.player.x, y: world.state.player.y } : clickToWorld(smoke.point);
    }
    const events = world.step(STEP, input.steer(), input.sneaking(), throwAt, smokeAt);
    if (events & EVENT_COIN) audio.coin();
    if (events & EVENT_KEYCARD) audio.keycard();
    if (events & EVENT_ARTIFACT) audio.artifact();
    if (events & EVENT_SMOKE) audio.smoke();
    if (events & EVENT_LASER) audio.laserTrip();
    if ((events & EVENT_ALARM) && world.state.cameras.some((c) => c.alarmed)) audio.cameraAlarm();
    if (events & EVENT_CAUGHT) audio.caught();
    if (events & EVENT_LEVEL_CLEAR) {
      endGame(true);
      return;
    }
    if (events & EVENT_GAME_OVER) {
      endGame(false);
      return;
    }
    if (world.state.levelIndex !== lastLevel) {
      lastLevel = world.state.levelIndex;
      audio.levelClear();
      screen = SCREEN_LEVEL_CLEAR;
      announce(`Level clear. ${world.state.level.name}.`);
    }
    // The alarm sting plays once, when the alarm trips — not every step.
    if (world.state.alarmed && !wasAlarmed && screen === SCREEN_PLAY) audio.alarm();
    wasAlarmed = world.state.alarmed;
  }

  function frame(now) {
    requestAnimationFrame(frame);
    accumulator += Math.min((now - last) / 1000, MAX_FRAME);
    last = now;
    handleActions();
    if (screen === SCREEN_PLAY) {
      while (accumulator >= STEP && screen === SCREEN_PLAY) {
        step();
        accumulator -= STEP;
      }
    } else {
      accumulator = 0;
    }
    renderer.draw(world.state, screen, best);
  }

  // Leaving the tab pauses a running game rather than letting guards close in unseen.
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && screen === SCREEN_PLAY) {
      screen = SCREEN_PAUSED;
      announce('Paused.');
    }
  });

  // M mutes; any key or click wakes the audio context.
  window.addEventListener('keydown', (event) => {
    if (event.code === 'KeyM') {
      const muted = audio.toggleMute();
      announce(muted ? 'Muted.' : 'Sound on.');
    }
    audio.unlock();
  });
  canvas.addEventListener('pointerdown', () => audio.unlock());

  announce('Shadow Vault. Press Enter or click to start.');
  requestAnimationFrame(frame);
}

// A debug handle for play-testing: the live world and its state.
window.__game = { world, get state() { return world.state; } };

if (shot) runShot(shot);
else runGame();

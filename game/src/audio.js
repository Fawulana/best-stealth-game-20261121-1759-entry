// Every sound is synthesised with WebAudio — no audio files, no network.
// Footsteps, pebble tosses, smoke hisses, pickup chimes, the alarm sting,
// the camera beep, the laser zap, the caught thud, the win fanfare and a
// quiet ambient drone. The context starts on the first user gesture, as
// browsers require.

export function createAudio() {
  let context = null;
  let master = null;
  let drone = null;
  let muted = false;

  function ensure() {
    if (context) {
      if (context.state === 'suspended') context.resume();
      return true;
    }
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      context = new AudioContext();
      master = context.createGain();
      master.gain.value = 0.5;
      master.connect(context.destination);
      startDrone();
      return true;
    } catch {
      return false;
    }
  }

  /** A low, slow-breathing drone under everything. */
  function startDrone() {
    const osc = context.createOscillator();
    osc.type = 'sine';
    osc.frequency.value = 55;
    const osc2 = context.createOscillator();
    osc2.type = 'triangle';
    osc2.frequency.value = 55.7;
    const gain = context.createGain();
    gain.gain.value = 0.035;
    const lfo = context.createOscillator();
    lfo.frequency.value = 0.08;
    const lfoGain = context.createGain();
    lfoGain.gain.value = 0.015;
    lfo.connect(lfoGain);
    lfoGain.connect(gain.gain);
    osc.connect(gain);
    osc2.connect(gain);
    gain.connect(master);
    osc.start();
    osc2.start();
    lfo.start();
    drone = { osc, osc2, lfo, gain };
  }

  function tone(freq, dur, type, vol, when = 0, slideTo = null) {
    if (!context || muted) return;
    const t = context.currentTime + when;
    const osc = context.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo !== null) osc.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
    const gain = context.createGain();
    gain.gain.setValueAtTime(0, t);
    gain.gain.linearRampToValueAtTime(vol, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    osc.connect(gain);
    gain.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.05);
  }

  function noise(dur, vol, freq, when = 0) {
    if (!context || muted) return;
    const t = context.currentTime + when;
    const length = Math.max(1, Math.floor(context.sampleRate * dur));
    const buffer = context.createBuffer(1, length, context.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
    const source = context.createBufferSource();
    source.buffer = buffer;
    const filter = context.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = context.createGain();
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    source.connect(filter);
    filter.connect(gain);
    gain.connect(master);
    source.start(t);
  }

  return {
    /** Call on any user gesture; safe to call often. */
    unlock() {
      ensure();
    },
    toggleMute() {
      muted = !muted;
      if (master) master.gain.value = muted ? 0 : 0.5;
      return muted;
    },
    isMuted() {
      return muted;
    },
    footstep(sneak) {
      noise(0.06, sneak ? 0.03 : 0.09, sneak ? 500 : 900);
    },
    pebble() {
      noise(0.08, 0.12, 2400);
      tone(1400, 0.07, 'sine', 0.06, 0, 700);
    },
    pebbleLand() {
      noise(0.12, 0.16, 1200);
      tone(320, 0.12, 'triangle', 0.1, 0, 180);
    },
    /** A soft hiss as the smoke blooms. */
    smoke() {
      noise(0.5, 0.14, 1800);
      noise(0.4, 0.08, 600, 0.1);
    },
    coin() {
      tone(988, 0.09, 'sine', 0.14);
      tone(1319, 0.14, 'sine', 0.14, 0.07);
    },
    keycard() {
      tone(784, 0.08, 'square', 0.08);
      tone(1175, 0.12, 'square', 0.08, 0.08);
    },
    artifact() {
      [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'sine', 0.16, i * 0.09));
    },
    suspicious() {
      tone(440, 0.18, 'square', 0.07, 0, 330);
    },
    /** Two short beeps when a camera locks on. */
    cameraAlarm() {
      tone(1200, 0.1, 'square', 0.09);
      tone(1200, 0.1, 'square', 0.09, 0.14);
    },
    /** A sharp zap when the laser grid trips — the one sound you never want. */
    laserTrip() {
      tone(1800, 0.15, 'sawtooth', 0.14, 0, 300);
      noise(0.1, 0.12, 3000);
    },
    alarm() {
      tone(233, 0.35, 'sawtooth', 0.16, 0, 466);
      tone(247, 0.35, 'sawtooth', 0.16, 0, 494);
      tone(466, 0.3, 'sawtooth', 0.12, 0.12, 233);
    },
    caught() {
      tone(110, 0.5, 'sawtooth', 0.22, 0, 55);
      noise(0.3, 0.2, 300);
    },
    levelClear() {
      [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, 0.3, 'triangle', 0.15, i * 0.11));
    },
    win() {
      [523, 659, 784, 1047, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.32, 'triangle', 0.15, i * 0.12));
    },
    gameOver() {
      [392, 330, 262, 196].forEach((f, i) => tone(f, 0.4, 'triangle', 0.14, i * 0.16));
    },
  };
}

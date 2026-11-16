const NOTES = {
  C3: 130.81,
  D3: 146.83,
  E3: 164.81,
  G3: 196.0,
  A3: 220.0,
  B3: 246.94,
  C4: 261.63,
  D4: 293.66,
  E4: 329.63,
  G4: 392.0,
  A4: 440.0,
  B4: 493.88,
  D5: 587.33,
  E5: 659.25,
  G5: 783.99,
};

const MUSIC_PROGRESSION = [
  [NOTES.C3, NOTES.G3, NOTES.D4],
  [NOTES.A3, NOTES.E4, NOTES.C4],
  [NOTES.E3, NOTES.B3, NOTES.G4],
  [NOTES.D3, NOTES.A3, NOTES.E4],
];

const THROTTLE_MS = {
  shoot: 40,
  hit: 50,
  enemyDown: 90,
  pickup: 70,
  levelUp: 180,
  dash: 80,
  hurt: 100,
  bossRoar: 500,
  gameOver: 800,
};

function nowMs() {
  return typeof performance !== "undefined" ? performance.now() : Date.now();
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function createEngine() {
  let context = null;
  let masterGain = null;
  let effectsGain = null;
  let musicGain = null;
  let muted = false;
  let initialized = false;
  let musicTimer = null;
  let musicNodes = [];
  let progressionStep = 0;
  const lastPlayedAt = new Map();

  function getNow() {
    return context ? context.currentTime : 0;
  }

  function isReady() {
    return initialized && context && !muted;
  }

  function throttle(name) {
    const limit = THROTTLE_MS[name] || 0;
    const stamp = nowMs();
    const last = lastPlayedAt.get(name) || 0;

    if (stamp - last < limit) {
      return true;
    }

    lastPlayedAt.set(name, stamp);
    return false;
  }

  function setMasterLevel() {
    if (!masterGain) {
      return;
    }

    const level = muted ? 0 : 0.9;
    masterGain.gain.setTargetAtTime(level, getNow(), 0.02);
  }

  function ensureContext() {
    if (initialized) {
      return context;
    }

    const AudioContextCtor = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextCtor) {
      return null;
    }

    context = new AudioContextCtor();
    masterGain = context.createGain();
    effectsGain = context.createGain();
    musicGain = context.createGain();

    masterGain.gain.value = muted ? 0 : 0.9;
    effectsGain.gain.value = 0.85;
    musicGain.gain.value = 0.0;

    effectsGain.connect(masterGain);
    musicGain.connect(masterGain);
    masterGain.connect(context.destination);

    initialized = true;
    return context;
  }

  function rampEnvelope(gainNode, start, peak, attack, release) {
    gainNode.gain.cancelScheduledValues(start);
    gainNode.gain.setValueAtTime(0.0001, start);
    gainNode.gain.linearRampToValueAtTime(peak, start + attack);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
  }

  function playTone({
    at = getNow(),
    duration = 0.16,
    frequency = 440,
    frequencyEnd = frequency,
    type = "sine",
    volume = 0.05,
    attack = 0.005,
    release = 0.14,
    detune = 0,
    target = effectsGain,
    filter = null,
  }) {
    if (!isReady()) {
      return;
    }

    const oscillator = context.createOscillator();
    const gainNode = context.createGain();
    const destination = filter || target;

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, at);
    oscillator.frequency.exponentialRampToValueAtTime(clamp(frequencyEnd, 20, 24000), at + duration);
    oscillator.detune.setValueAtTime(detune, at);

    rampEnvelope(gainNode, at, volume, attack, release);

    oscillator.connect(gainNode);
    gainNode.connect(destination);
    oscillator.start(at);
    oscillator.stop(at + attack + release + 0.02);
  }

  function playNoise({ at = getNow(), duration = 0.12, volume = 0.03, filterHz = 1200 }) {
    if (!isReady()) {
      return;
    }

    const frameCount = Math.max(1, Math.floor(context.sampleRate * duration));
    const buffer = context.createBuffer(1, frameCount, context.sampleRate);
    const data = buffer.getChannelData(0);

    for (let index = 0; index < frameCount; index += 1) {
      data[index] = (Math.random() * 2 - 1) * (1 - index / frameCount);
    }

    const source = context.createBufferSource();
    const filter = context.createBiquadFilter();
    const gainNode = context.createGain();

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.setValueAtTime(filterHz, at);

    rampEnvelope(gainNode, at, volume, 0.003, duration);

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(effectsGain);
    source.start(at);
    source.stop(at + duration + 0.03);
  }

  function clearMusicNodes() {
    musicNodes.forEach((node) => {
      try {
        node.stop();
      } catch (error) {
        void error;
      }
      try {
        node.disconnect();
      } catch (error) {
        void error;
      }
    });
    musicNodes = [];
  }

  function scheduleChord(chord, startTime, duration) {
    const filter = context.createBiquadFilter();
    const chordGain = context.createGain();

    filter.type = "lowpass";
    filter.frequency.setValueAtTime(1000, startTime);
    filter.frequency.linearRampToValueAtTime(1350, startTime + duration);
    filter.Q.value = 0.9;

    chordGain.gain.setValueAtTime(0.0001, startTime);
    chordGain.gain.linearRampToValueAtTime(0.05, startTime + 1.4);
    chordGain.gain.linearRampToValueAtTime(0.038, startTime + duration * 0.65);
    chordGain.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

    filter.connect(chordGain);
    chordGain.connect(musicGain);

    chord.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      oscillator.type = index === 0 ? "triangle" : "sine";
      oscillator.frequency.setValueAtTime(frequency, startTime);
      oscillator.detune.setValueAtTime(index === 1 ? -7 : index === 2 ? 9 : 0, startTime);
      oscillator.connect(filter);
      oscillator.start(startTime);
      oscillator.stop(startTime + duration + 0.05);
      musicNodes.push(oscillator);
    });

    musicNodes.push(filter, chordGain);
  }

  function scheduleMusicLoop() {
    if (!context) {
      return;
    }

    clearTimeout(musicTimer);
    clearMusicNodes();

    const startTime = getNow() + 0.05;
    const chordDuration = 6;

    MUSIC_PROGRESSION.forEach((chord, index) => {
      scheduleChord(chord, startTime + index * chordDuration, chordDuration + 0.4);
    });

    progressionStep = (progressionStep + 1) % MUSIC_PROGRESSION.length;
    musicTimer = window.setTimeout(scheduleMusicLoop, chordDuration * MUSIC_PROGRESSION.length * 1000 - 300);
  }

  return {
    init() {
      return ensureContext();
    },
    async resume() {
      const ctx = ensureContext();
      if (!ctx) {
        return;
      }

      if (ctx.state === "suspended") {
        await ctx.resume();
      }
    },
    setMuted(nextMuted) {
      muted = Boolean(nextMuted);
      setMasterLevel();
      if (muted) {
        this.stopMusic();
      }
    },
    toggleMuted() {
      this.setMuted(!muted);
      return muted;
    },
    isMuted() {
      return muted;
    },
    shoot() {
      if (throttle("shoot") || !isReady()) {
        return;
      }

      const at = getNow();
      playTone({ at, frequency: NOTES.E5, frequencyEnd: NOTES.G5, type: "triangle", volume: 0.018, release: 0.08 });
      playTone({ at, frequency: 1200, frequencyEnd: 520, type: "sine", volume: 0.012, attack: 0.001, release: 0.06 });
    },
    hit() {
      if (throttle("hit") || !isReady()) {
        return;
      }

      const at = getNow();
      playTone({ at, frequency: 210, frequencyEnd: 110, type: "square", volume: 0.012, attack: 0.001, release: 0.05 });
      playNoise({ at, duration: 0.045, volume: 0.01, filterHz: 900 });
    },
    enemyDown() {
      if (throttle("enemyDown") || !isReady()) {
        return;
      }

      const at = getNow();
      playTone({ at, frequency: NOTES.G4, frequencyEnd: NOTES.C4, type: "triangle", volume: 0.022, release: 0.18 });
      playTone({ at: at + 0.03, frequency: NOTES.D5, frequencyEnd: NOTES.G4, type: "sine", volume: 0.014, release: 0.12 });
    },
    pickup() {
      if (throttle("pickup") || !isReady()) {
        return;
      }

      const at = getNow();
      playTone({ at, frequency: NOTES.A4, frequencyEnd: NOTES.D5, type: "sine", volume: 0.018, release: 0.12 });
      playTone({ at: at + 0.04, frequency: NOTES.D5, frequencyEnd: NOTES.G5, type: "triangle", volume: 0.014, release: 0.16 });
    },
    levelUp() {
      if (throttle("levelUp") || !isReady()) {
        return;
      }

      const at = getNow();
      playTone({ at, frequency: NOTES.C4, frequencyEnd: NOTES.E4, type: "sine", volume: 0.025, release: 0.2 });
      playTone({ at: at + 0.1, frequency: NOTES.E4, frequencyEnd: NOTES.A4, type: "triangle", volume: 0.022, release: 0.22 });
      playTone({ at: at + 0.22, frequency: NOTES.A4, frequencyEnd: NOTES.D5, type: "sine", volume: 0.02, release: 0.3 });
    },
    dash() {
      if (throttle("dash") || !isReady()) {
        return;
      }

      const at = getNow();
      playNoise({ at, duration: 0.08, volume: 0.015, filterHz: 1800 });
      playTone({ at, frequency: 360, frequencyEnd: 140, type: "triangle", volume: 0.013, attack: 0.001, release: 0.09 });
    },
    hurt() {
      if (throttle("hurt") || !isReady()) {
        return;
      }

      const at = getNow();
      playTone({ at, frequency: 180, frequencyEnd: 90, type: "sawtooth", volume: 0.02, attack: 0.002, release: 0.16 });
      playNoise({ at, duration: 0.06, volume: 0.012, filterHz: 700 });
    },
    bossRoar() {
      if (throttle("bossRoar") || !isReady()) {
        return;
      }

      const at = getNow();
      playTone({ at, duration: 0.9, frequency: 90, frequencyEnd: 48, type: "sawtooth", volume: 0.025, attack: 0.01, release: 0.85 });
      playTone({ at: at + 0.08, duration: 0.8, frequency: 135, frequencyEnd: 60, type: "triangle", volume: 0.016, attack: 0.01, release: 0.78 });
    },
    gameOver() {
      if (throttle("gameOver") || !isReady()) {
        return;
      }

      const at = getNow();
      playTone({ at, duration: 0.5, frequency: NOTES.E4, frequencyEnd: NOTES.C4, type: "triangle", volume: 0.022, release: 0.46 });
      playTone({ at: at + 0.25, duration: 0.8, frequency: NOTES.C4, frequencyEnd: NOTES.C3, type: "sine", volume: 0.024, release: 0.72 });
    },
    startMusic() {
      const ctx = ensureContext();
      if (!ctx || muted) {
        return;
      }

      musicGain.gain.cancelScheduledValues(getNow());
      musicGain.gain.setTargetAtTime(0.08, getNow(), 1.2);
      scheduleMusicLoop();
    },
    stopMusic() {
      if (!context || !musicGain) {
        return;
      }

      clearTimeout(musicTimer);
      musicTimer = null;
      musicGain.gain.cancelScheduledValues(getNow());
      musicGain.gain.setTargetAtTime(0.0001, getNow(), 0.25);

      window.setTimeout(() => {
        clearMusicNodes();
      }, 600);
    },
  };
}

export const audio = createEngine();

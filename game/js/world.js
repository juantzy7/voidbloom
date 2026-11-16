const MAX_SHAKE = 18;
const SHAKE_DECAY = 22;
const SPORE_COUNT = 70;
const SPECK_COUNT = 140;
const NEBULA_COUNT = 4;
const TAU = Math.PI * 2;

const nebulaPalette = [
  { inner: 'rgba(154, 92, 255, 0.24)', outer: 'rgba(154, 92, 255, 0)' },
  { inner: 'rgba(72, 232, 255, 0.22)', outer: 'rgba(72, 232, 255, 0)' },
  { inner: 'rgba(255, 80, 214, 0.18)', outer: 'rgba(255, 80, 214, 0)' },
  { inner: 'rgba(98, 255, 214, 0.16)', outer: 'rgba(98, 255, 214, 0)' },
];

function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state += 0x6d2b79f5;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function wrap(value, max) {
  if (max <= 0) {
    return 0;
  }
  if (value < 0) {
    return value + max;
  }
  if (value >= max) {
    return value - max;
  }
  return value;
}

function sizeSeed(width, height) {
  const w = width | 0;
  const h = height | 0;
  return (((w * 73856093) ^ (h * 19349663)) >>> 0) || 1;
}

function createNebulaGradient(ctx, blob) {
  const gradient = ctx.createRadialGradient(
    blob.x,
    blob.y,
    blob.radius * 0.12,
    blob.x,
    blob.y,
    blob.radius
  );
  gradient.addColorStop(0, blob.inner);
  gradient.addColorStop(0.45, blob.mid);
  gradient.addColorStop(1, blob.outer);
  return gradient;
}

function buildCaches(state) {
  const width = state.width;
  const height = state.height;
  const key = `${width}x${height}`;

  if (!width || !height) {
    state.backgroundGradient = null;
    state.vignetteGradient = null;
    state._gradientKey = key;
    return;
  }

  const canvas = typeof OffscreenCanvas !== 'undefined'
    ? new OffscreenCanvas(1, 1)
    : typeof document !== 'undefined'
      ? document.createElement('canvas')
      : null;

  if (!canvas) {
    state.backgroundGradient = null;
    state.vignetteGradient = null;
    state._gradientKey = key;
    return;
  }

  const ctx = canvas.getContext('2d');
  const bg = ctx.createLinearGradient(0, 0, 0, height);
  bg.addColorStop(0, '#09051a');
  bg.addColorStop(0.55, '#130726');
  bg.addColorStop(1, '#04020d');

  const vignette = ctx.createRadialGradient(
    width * 0.5,
    height * 0.48,
    Math.min(width, height) * 0.14,
    width * 0.5,
    height * 0.5,
    Math.max(width, height) * 0.72
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(0.7, 'rgba(4, 2, 12, 0.14)');
  vignette.addColorStop(1, 'rgba(1, 0, 6, 0.58)');

  state.backgroundGradient = bg;
  state.vignetteGradient = vignette;
  state._gradientKey = key;
}

const world = {
  width: 0,
  height: 0,
  time: 0,
  shakeX: 0,
  shakeY: 0,

  _gradientKey: '',
  backgroundGradient: null,
  vignetteGradient: null,
  _shakeMagnitude: 0,
  _gradientCtx: null,
  _spores: [],
  _specks: [],
  _nebulae: [],

  resize(canvas) {
    const width = Math.max(0, Math.round(canvas?.clientWidth || canvas?.width || 0));
    const height = Math.max(0, Math.round(canvas?.clientHeight || canvas?.height || 0));

    this.width = width;
    this.height = height;

    const random = mulberry32(sizeSeed(width, height));
    const minSize = Math.min(width, height);

    this._nebulae.length = 0;
    for (let i = 0; i < NEBULA_COUNT; i += 1) {
      const palette = nebulaPalette[i % nebulaPalette.length];
      const radius = minSize * (0.24 + random() * 0.18);
      const x = width * (0.16 + random() * 0.68);
      const y = height * (0.14 + random() * 0.7);
      this._nebulae.push({
        x,
        y,
        radius,
        pulseSpeed: 0.12 + random() * 0.24,
        pulsePhase: random() * TAU,
        alpha: 0.72 + random() * 0.22,
        inner: palette.inner,
        mid: palette.inner.replace(/0\.(\d+)\)/, (_, digits) => {
          const value = Math.max(0.08, Number(`0.${digits}`) * 0.52);
          return `${value.toFixed(3)})`;
        }),
        outer: palette.outer,
        gradient: null,
      });
    }

    this._spores.length = 0;
    for (let i = 0; i < SPORE_COUNT; i += 1) {
      this._spores.push({
        x: random() * width,
        y: random() * height,
        vx: (random() - 0.5) * 4,
        vy: -0.8 - random() * 3.6,
        radius: 0.8 + random() * 2.6,
        alpha: 0.2 + random() * 0.5,
        twinklePhase: random() * TAU,
        twinkleSpeed: 0.8 + random() * 2.2,
        hue: random() < 0.5 ? 188 : 290,
      });
    }

    this._specks.length = 0;
    for (let i = 0; i < SPECK_COUNT; i += 1) {
      this._specks.push({
        x: random() * width,
        y: random() * height,
        radius: 0.45 + random() * 1.1,
        alpha: 0.03 + random() * 0.08,
        rotation: random() * TAU,
        stretch: 1.4 + random() * 1.8,
      });
    }

    buildCaches(this);
    if (!this._gradientCtx) {
      const gradientCanvas = typeof OffscreenCanvas !== 'undefined'
        ? new OffscreenCanvas(1, 1)
        : typeof document !== 'undefined'
          ? document.createElement('canvas')
          : null;
      this._gradientCtx = gradientCanvas ? gradientCanvas.getContext('2d') : null;
    }
    for (let i = 0; i < this._nebulae.length; i += 1) {
      this._nebulae[i].gradient = this._gradientCtx
        ? createNebulaGradient(this._gradientCtx, this._nebulae[i])
        : null;
    }
  },

  addShake(amount) {
    this._shakeMagnitude = clamp(this._shakeMagnitude + Math.max(0, amount || 0), 0, MAX_SHAKE);
  },

  update(dt) {
    const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
    this.time += step;

    const width = this.width;
    const height = this.height;
    const spores = this._spores;

    for (let i = 0; i < spores.length; i += 1) {
      const spore = spores[i];
      spore.x = wrap(spore.x + spore.vx * step, width);
      spore.y = wrap(spore.y + spore.vy * step, height);
    }

    this._shakeMagnitude = Math.max(0, this._shakeMagnitude - SHAKE_DECAY * step);
    if (this._shakeMagnitude > 0.0001) {
      const t = this.time;
      const nx = Math.sin(t * 29.0) * 0.65 + Math.sin(t * 47.0 + 1.7) * 0.35;
      const ny = Math.sin(t * 31.0 + 0.8) * 0.6 + Math.sin(t * 53.0 + 2.4) * 0.4;
      this.shakeX = nx * this._shakeMagnitude;
      this.shakeY = ny * this._shakeMagnitude;
    } else {
      this._shakeMagnitude = 0;
      this.shakeX = 0;
      this.shakeY = 0;
    }
  },

  draw(ctx) {
    if (!ctx || !this.width || !this.height) {
      return;
    }

    if (this._gradientKey !== `${this.width}x${this.height}` || !this.backgroundGradient || !this.vignetteGradient) {
      buildCaches(this);
      for (let i = 0; i < this._nebulae.length; i += 1) {
        this._nebulae[i].gradient = this._gradientCtx ? createNebulaGradient(this._gradientCtx, this._nebulae[i]) : null;
      }
    }

    ctx.save();
    ctx.fillStyle = this.backgroundGradient || '#09051a';
    ctx.fillRect(0, 0, this.width, this.height);

    for (let i = 0; i < this._nebulae.length; i += 1) {
      const blob = this._nebulae[i];
      const pulse = 0.8 + Math.sin(this.time * blob.pulseSpeed + blob.pulsePhase) * 0.2;
      ctx.globalAlpha = blob.alpha * pulse;
      ctx.fillStyle = blob.gradient || blob.inner;
      ctx.beginPath();
      ctx.arc(blob.x, blob.y, blob.radius, 0, TAU);
      ctx.fill();
    }

    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < this._spores.length; i += 1) {
      const spore = this._spores[i];
      const twinkle = 0.65 + Math.sin(this.time * spore.twinkleSpeed + spore.twinklePhase) * 0.35;
      const alpha = spore.alpha * twinkle;
      ctx.globalAlpha = alpha;
      ctx.shadowBlur = 8 + spore.radius * 4;
      ctx.shadowColor = `hsla(${spore.hue}, 100%, 72%, ${Math.min(0.7, alpha)})`;
      ctx.fillStyle = `hsla(${spore.hue}, 100%, 82%, ${Math.min(0.95, alpha + 0.18)})`;
      ctx.beginPath();
      ctx.arc(spore.x, spore.y, spore.radius, 0, TAU);
      ctx.fill();
    }

    ctx.shadowBlur = 0;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(210, 180, 255, 0.08)';
    for (let i = 0; i < this._specks.length; i += 1) {
      const speck = this._specks[i];
      ctx.globalAlpha = speck.alpha;
      ctx.save();
      ctx.translate(speck.x, speck.y);
      ctx.rotate(speck.rotation);
      ctx.scale(speck.stretch, 1);
      ctx.beginPath();
      ctx.arc(0, 0, speck.radius, 0, TAU);
      ctx.fill();
      ctx.restore();
    }

    ctx.globalAlpha = 1;
    ctx.fillStyle = this.vignetteGradient || 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.restore();
  },
};

export { world };
export default world;

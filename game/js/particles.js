const MAX_PARTICLES = 500;
const MAX_TEXTS = 48;
const MAX_RINGS = 24;

const particles = [];
const texts = [];
const rings = [];

const DEFAULT_BURST = {
  count: 14,
  color: '#7ef7ff',
  speed: [80, 240],
  life: [0.22, 0.6],
  size: [2, 6],
  gravity: 0,
  drag: 3.5,
};

const DEFAULT_TEXT = {
  color: '#ffe082',
  size: 18,
  life: 0.7,
};

const DEFAULT_RING = {
  color: '#ff4fd8',
  maxRadius: 56,
  life: 0.45,
  width: 3,
};

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function rand(min, max) {
  return min + Math.random() * (max - min);
}

function pickColor(color) {
  if (Array.isArray(color)) {
    return color[Math.floor(Math.random() * color.length)] || DEFAULT_BURST.color;
  }
  return color || DEFAULT_BURST.color;
}

function readRange(value, fallback) {
  if (Array.isArray(value)) {
    return [value[0] ?? fallback[0], value[1] ?? fallback[1]];
  }
  if (typeof value === 'number') {
    return [0, value];
  }
  return fallback;
}

function pushCapped(list, item, cap) {
  if (list.length >= cap) list.shift();
  list.push(item);
}

function drawSoftParticle(ctx, particle) {
  const t = particle.age / particle.life;
  const alpha = 1 - t;
  const radius = particle.size * (0.7 + t * 0.6);

  ctx.globalAlpha = alpha * 0.9;
  ctx.fillStyle = particle.color;
  ctx.beginPath();
  ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
  ctx.fill();

  ctx.globalAlpha = alpha * 0.35;
  ctx.beginPath();
  ctx.arc(particle.x, particle.y, radius * 1.8, 0, Math.PI * 2);
  ctx.fill();
}

function burst(x, y, options = {}) {
  const count = Math.max(1, options.count ?? DEFAULT_BURST.count);
  const speedRange = readRange(options.speed ?? options.speedRange, DEFAULT_BURST.speed);
  const lifeRange = readRange(options.life ?? options.lifeRange, DEFAULT_BURST.life);
  const sizeRange = readRange(options.size ?? options.sizeRange, DEFAULT_BURST.size);
  const gravity = options.gravity ?? DEFAULT_BURST.gravity;
  const drag = options.drag ?? DEFAULT_BURST.drag;

  for (let i = 0; i < count; i += 1) {
    const angle = Math.random() * Math.PI * 2;
    const speed = rand(speedRange[0], speedRange[1]);

    pushCapped(
      particles,
      {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        age: 0,
        life: rand(lifeRange[0], lifeRange[1]),
        size: rand(sizeRange[0], sizeRange[1]),
        color: pickColor(options.color ?? DEFAULT_BURST.color),
        gravity,
        drag,
      },
      MAX_PARTICLES,
    );
  }
}

function trail(x, y, color = '#7ef7ff') {
  pushCapped(
    particles,
    {
      x,
      y,
      vx: rand(-12, 12),
      vy: rand(-12, 12),
      age: 0,
      life: rand(0.08, 0.18),
      size: rand(1.5, 3.2),
      color,
      gravity: 0,
      drag: 10,
    },
    MAX_PARTICLES,
  );
}

function text(x, y, str, options = {}) {
  pushCapped(
    texts,
    {
      x,
      y,
      str: String(str),
      age: 0,
      life: Math.max(0.05, options.life ?? DEFAULT_TEXT.life),
      size: Math.max(8, options.size ?? DEFAULT_TEXT.size),
      color: options.color ?? DEFAULT_TEXT.color,
      vy: options.vy ?? -28,
    },
    MAX_TEXTS,
  );
}

function ring(x, y, options = {}) {
  pushCapped(
    rings,
    {
      x,
      y,
      age: 0,
      life: Math.max(0.05, options.life ?? DEFAULT_RING.life),
      color: options.color ?? DEFAULT_RING.color,
      maxRadius: Math.max(1, options.maxRadius ?? DEFAULT_RING.maxRadius),
      width: Math.max(1, options.width ?? DEFAULT_RING.width),
    },
    MAX_RINGS,
  );
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i -= 1) {
    const p = particles[i];
    p.age += dt;
    if (p.age >= p.life) {
      particles.splice(i, 1);
      continue;
    }

    const damping = Math.max(0, 1 - p.drag * dt);
    p.vx *= damping;
    p.vy *= damping;
    p.vy += p.gravity * dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
  }
}

function updateTexts(dt) {
  for (let i = texts.length - 1; i >= 0; i -= 1) {
    const item = texts[i];
    item.age += dt;
    if (item.age >= item.life) {
      texts.splice(i, 1);
      continue;
    }

    item.y += item.vy * dt;
  }
}

function updateRings(dt) {
  for (let i = rings.length - 1; i >= 0; i -= 1) {
    rings[i].age += dt;
    if (rings[i].age >= rings[i].life) {
      rings.splice(i, 1);
    }
  }
}

function update(dt) {
  const step = Math.max(0, Number.isFinite(dt) ? dt : 0);
  updateParticles(step);
  updateTexts(step);
  updateRings(step);
}

function draw(ctx) {
  if (!ctx) return;

  const previousComposite = ctx.globalCompositeOperation;
  const previousAlpha = ctx.globalAlpha;
  const previousShadowBlur = ctx.shadowBlur;
  const previousShadowColor = ctx.shadowColor;
  const previousLineWidth = ctx.lineWidth;
  const previousFont = ctx.font;
  const previousAlign = ctx.textAlign;
  const previousBaseline = ctx.textBaseline;

  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < particles.length; i += 1) {
    drawSoftParticle(ctx, particles[i]);
  }

  for (let i = 0; i < rings.length; i += 1) {
    const item = rings[i];
    const t = item.age / item.life;
    const eased = 1 - (1 - t) * (1 - t);
    const radius = item.maxRadius * eased;
    const alpha = 1 - t;

    ctx.globalAlpha = alpha * 0.9;
    ctx.strokeStyle = item.color;
    ctx.lineWidth = item.width;
    ctx.shadowBlur = 12;
    ctx.shadowColor = item.color;
    ctx.beginPath();
    ctx.arc(item.x, item.y, radius, 0, Math.PI * 2);
    ctx.stroke();
  }

  ctx.globalCompositeOperation = previousComposite;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = 'bold 18px system-ui, -apple-system, Segoe UI, sans-serif';

  for (let i = 0; i < texts.length; i += 1) {
    const item = texts[i];
    const t = item.age / item.life;
    const alpha = clamp(1 - t, 0, 1);

    ctx.globalAlpha = alpha;
    ctx.fillStyle = item.color;
    ctx.font = `bold ${Math.round(item.size)}px system-ui, -apple-system, Segoe UI, sans-serif`;
    ctx.shadowBlur = 10;
    ctx.shadowColor = item.color;
    ctx.fillText(item.str, item.x, item.y);
  }

  ctx.globalAlpha = previousAlpha;
  ctx.shadowBlur = previousShadowBlur;
  ctx.shadowColor = previousShadowColor;
  ctx.lineWidth = previousLineWidth;
  ctx.font = previousFont;
  ctx.textAlign = previousAlign;
  ctx.textBaseline = previousBaseline;
}

function clear() {
  particles.length = 0;
  texts.length = 0;
  rings.length = 0;
}

export const fx = {
  burst,
  trail,
  text,
  ring,
  update,
  draw,
  clear,
};


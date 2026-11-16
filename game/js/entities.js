const TAU = Math.PI * 2;

const PLAYER_BULLET_SPEED = 640;
const DASH_DURATION = 0.16;
const DASH_INVULN = 0.22;
const DASH_BOOST = 3.2;
const PICKUP_LIFE = 25;

let pickupSoundCooldown = 0;
let trailTick = 0;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function rand(min = 0, max = 1) {
  return min + Math.random() * (max - min);
}

function angleTo(x1, y1, x2, y2) {
  return Math.atan2(y2 - y1, x2 - x1);
}

function length(x, y) {
  return Math.hypot(x, y);
}

function normalize(x, y, fallbackX = 1, fallbackY = 0) {
  const len = Math.hypot(x, y);
  if (len <= 0.0001) return { x: fallbackX, y: fallbackY };
  return { x: x / len, y: y / len };
}

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function easeOutQuad(t) {
  return 1 - (1 - t) * (1 - t);
}

function pulse(t, speed = 1, min = 0, max = 1) {
  const s = 0.5 + 0.5 * Math.sin(t * speed);
  return lerp(min, max, s);
}

function clampInside(entity, world) {
  entity.x = clamp(entity.x, entity.r, world.width - entity.r);
  entity.y = clamp(entity.y, entity.r, world.height - entity.r);
}

function clampBulletInside(bullet, world, padding = 30) {
  return (
    bullet.x >= -padding &&
    bullet.y >= -padding &&
    bullet.x <= world.width + padding &&
    bullet.y <= world.height + padding
  );
}

function applySteering(entity, targetVx, targetVy, accel, damping, dt) {
  entity.vx += (targetVx - entity.vx) * Math.min(1, accel * dt);
  entity.vy += (targetVy - entity.vy) * Math.min(1, accel * dt);
  const drag = Math.max(0, 1 - damping * dt);
  entity.vx *= drag;
  entity.vy *= drag;
}

function scatter(count, radius) {
  const points = [];
  for (let i = 0; i < count; i += 1) {
    const a = Math.random() * TAU;
    const d = Math.random() * radius;
    points.push({ x: Math.cos(a) * d, y: Math.sin(a) * d });
  }
  return points;
}

function spawnBullet(state, x, y, angle, dmg, pierce, speed = PLAYER_BULLET_SPEED) {
  const bullet = {
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r: 4,
    dmg,
    pierce,
    life: 0.9,
    dead: false,
  };

  if (pierce > 0) bullet.hitSet = new Set();
  state.bullets.push(bullet);
}

function enemyMass(kind) {
  switch (kind) {
    case 'dart':
      return 0.85;
    case 'bulwark':
      return 7;
    case 'spitter':
      return 1.4;
    case 'boss':
      return 14;
    default:
      return 1;
  }
}

function enemyColors(kind) {
  switch (kind) {
    case 'dart':
      return { body: '#ff4fd8', glow: '#ff9cf1', shadow: '#56153b' };
    case 'bulwark':
      return { body: '#7e6dbd', glow: '#d1c6ff', shadow: '#241739' };
    case 'spitter':
      return { body: '#56d1d8', glow: '#b7ffff', shadow: '#14313b' };
    case 'boss':
      return { body: '#a889ff', glow: '#ffe37a', shadow: '#2b1846' };
    default:
      return { body: '#8d70ff', glow: '#d7cbff', shadow: '#24153a' };
  }
}

function drawGlow(ctx, x, y, radius, color, alpha = 0.35) {
  ctx.save();
  const g = ctx.createRadialGradient(x, y, 0, x, y, radius);
  g.addColorStop(0, color.replace(')', `, ${alpha})`).replace('rgb', 'rgba'));
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function rgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const num = Number.parseInt(full, 16);
  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function flashAlpha(entity) {
  return entity.flash > 0 ? Math.min(0.9, entity.flash * 12) : 0;
}

function hpRatio(entity) {
  return entity.maxHp > 0 ? clamp(entity.hp / entity.maxHp, 0, 1) : 0;
}

function drawDamageBar(ctx, x, y, width, ratio, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.beginPath();
  ctx.moveTo(-width / 2, 0);
  ctx.lineTo(width / 2, 0);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.moveTo(-width / 2, 0);
  ctx.lineTo(-width / 2 + width * ratio, 0);
  ctx.stroke();
  ctx.restore();
}

function drawHpArc(ctx, entity, ratio, color) {
  ctx.save();
  ctx.lineWidth = 3;
  ctx.strokeStyle = 'rgba(255,255,255,0.14)';
  ctx.beginPath();
  ctx.arc(entity.x, entity.y, entity.r + 7, Math.PI * 0.15, Math.PI * 0.85);
  ctx.stroke();
  ctx.strokeStyle = color;
  ctx.beginPath();
  ctx.arc(entity.x, entity.y, entity.r + 7, Math.PI * 0.15, Math.PI * (0.15 + 0.7 * ratio));
  ctx.stroke();
  ctx.restore();
}

function drawFlashOverlay(ctx, drawFn, alpha) {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#ffffff';
  ctx.strokeStyle = '#ffffff';
  drawFn();
  ctx.restore();
}

function drawSeed(ctx, p) {
  const bob = Math.sin(p.t * 3.5) * 1.4;
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.rotate(p.t * 1.7);
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#c6ff67';
  ctx.fillStyle = '#f5c94c';
  ctx.beginPath();
  ctx.arc(0, 0, p.r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ddff8b';
  ctx.beginPath();
  ctx.arc(-1.5, -1.5, p.r * 0.45, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawHeart(ctx, p) {
  const bob = Math.sin(p.t * 3) * 1.7;
  const scale = 1 + 0.06 * Math.sin(p.t * 4.2);
  ctx.save();
  ctx.translate(p.x, p.y + bob);
  ctx.scale(scale, scale);
  ctx.rotate(Math.PI / 4 + Math.sin(p.t * 1.3) * 0.08);
  ctx.shadowBlur = 20;
  ctx.shadowColor = '#ff5ac8';
  ctx.fillStyle = '#ff86d6';
  ctx.beginPath();
  ctx.moveTo(0, -p.r * 0.95);
  ctx.lineTo(p.r * 0.95, 0);
  ctx.lineTo(0, p.r * 0.95);
  ctx.lineTo(-p.r * 0.95, 0);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ffe3f7';
  ctx.beginPath();
  ctx.arc(-p.r * 0.28, -p.r * 0.2, p.r * 0.22, 0, TAU);
  ctx.arc(p.r * 0.1, -p.r * 0.38, p.r * 0.18, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawBullet(ctx, b) {
  const angle = Math.atan2(b.vy, b.vx);
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.rotate(angle);
  ctx.shadowBlur = 16;
  ctx.shadowColor = '#66f7ff';
  ctx.fillStyle = '#d8ffff';
  ctx.beginPath();
  ctx.moveTo(7, 0);
  ctx.lineTo(-5, 3.2);
  ctx.lineTo(-2, 0);
  ctx.lineTo(-5, -3.2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = '#5cecff';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-6, 0);
  ctx.lineTo(8, 0);
  ctx.stroke();
  ctx.restore();
}

function drawEnemyBullet(ctx, b) {
  ctx.save();
  ctx.translate(b.x, b.y);
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#ff47cf';
  ctx.fillStyle = '#ff58d6';
  ctx.beginPath();
  ctx.arc(0, 0, b.r, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#ffd3f6';
  ctx.beginPath();
  ctx.arc(-1.4, -1.6, b.r * 0.45, 0, TAU);
  ctx.fill();
  ctx.restore();
}

function drawChaser(ctx, e, flash) {
  const wobble = Math.sin(e.t * 6) * 0.12;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(Math.atan2(e.vy, e.vx) + wobble);
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#8a62ff';
  ctx.fillStyle = '#31174f';
  ctx.beginPath();
  for (let i = 0; i < 8; i += 1) {
    const a = (i / 8) * TAU;
    const rr = i % 2 === 0 ? e.r * 1.05 : e.r * 0.64;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#8f74ff';
  ctx.beginPath();
  ctx.arc(0, 0, e.r * 0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#d9d4ff';
  ctx.beginPath();
  ctx.arc(2, -2, e.r * 0.16, 0, TAU);
  ctx.fill();
  drawFlashOverlay(ctx, () => {
    ctx.beginPath();
    for (let i = 0; i < 8; i += 1) {
      const a = (i / 8) * TAU;
      const rr = i % 2 === 0 ? e.r * 1.05 : e.r * 0.64;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }, flash);
  ctx.restore();
}

function drawDart(ctx, e, flash) {
  const tele = e.mode === 'telegraph' ? 1 - e.modeTimer / e.modeDuration : 0;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle + Math.sin(e.t * 10) * 0.08);
  ctx.scale(1 + tele * 0.18, 1 - tele * 0.08);
  ctx.shadowBlur = 18;
  ctx.shadowColor = '#ff4fd8';
  ctx.fillStyle = tele > 0.2 ? '#ffd0fa' : '#7f1f66';
  ctx.beginPath();
  ctx.moveTo(e.r * 1.45, 0);
  ctx.lineTo(-e.r * 0.9, e.r * 0.5);
  ctx.lineTo(-e.r * 0.45, 0);
  ctx.lineTo(-e.r * 0.9, -e.r * 0.5);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = '#ff82ea';
  ctx.beginPath();
  ctx.moveTo(e.r * 0.5, 0);
  ctx.lineTo(-e.r * 0.45, e.r * 0.18);
  ctx.lineTo(-e.r * 0.2, 0);
  ctx.lineTo(-e.r * 0.45, -e.r * 0.18);
  ctx.closePath();
  ctx.fill();
  drawFlashOverlay(ctx, () => {
    ctx.beginPath();
    ctx.moveTo(e.r * 1.45, 0);
    ctx.lineTo(-e.r * 0.9, e.r * 0.5);
    ctx.lineTo(-e.r * 0.45, 0);
    ctx.lineTo(-e.r * 0.9, -e.r * 0.5);
    ctx.closePath();
    ctx.fill();
  }, flash);
  ctx.restore();
}

function drawBulwark(ctx, e, flash) {
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle * 0.45 + Math.sin(e.t * 1.8) * 0.04);
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#b6a7ff';
  ctx.fillStyle = '#2a1c41';
  ctx.beginPath();
  ctx.arc(0, 0, e.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#8e7dd4';
  ctx.lineWidth = 4;
  for (let i = 0; i < 3; i += 1) {
    ctx.beginPath();
    ctx.arc(0, 0, e.r * (0.52 + i * 0.18), -0.95 + i * 0.35, 0.95 - i * 0.35);
    ctx.stroke();
  }
  ctx.fillStyle = '#d7cfff';
  ctx.beginPath();
  ctx.arc(e.r * 0.1, -e.r * 0.1, e.r * 0.18, 0, TAU);
  ctx.fill();
  drawFlashOverlay(ctx, () => {
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, TAU);
    ctx.fill();
  }, flash);
  ctx.restore();
}

function drawSpitter(ctx, e, flash) {
  const maw = 0.35 + 0.2 * Math.sin(e.t * 4);
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.rotate(e.angle);
  ctx.shadowBlur = 14;
  ctx.shadowColor = '#58eaff';
  ctx.fillStyle = '#193944';
  ctx.beginPath();
  ctx.arc(0, 0, e.r, 0, TAU);
  ctx.fill();
  ctx.strokeStyle = '#57d8de';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(e.r * 0.15, 0, e.r * 0.55, -maw, maw);
  ctx.stroke();
  ctx.fillStyle = '#a5ffff';
  ctx.beginPath();
  ctx.arc(-e.r * 0.15, 0, e.r * 0.18, 0, TAU);
  ctx.fill();
  drawFlashOverlay(ctx, () => {
    ctx.beginPath();
    ctx.arc(0, 0, e.r, 0, TAU);
    ctx.fill();
  }, flash);
  ctx.restore();
}

function drawBoss(ctx, e, flash) {
  const tele = e.mode === 'telegraph' ? 1 - e.modeTimer / e.modeDuration : 0;
  ctx.save();
  ctx.translate(e.x, e.y);
  ctx.shadowBlur = 24;
  ctx.shadowColor = '#b690ff';
  ctx.fillStyle = '#221334';
  ctx.beginPath();
  for (let i = 0; i < 10; i += 1) {
    const a = (i / 10) * TAU + e.t * 0.12;
    const rr = i % 2 === 0 ? e.r * 1.04 : e.r * 0.82;
    const px = Math.cos(a) * rr;
    const py = Math.sin(a) * rr;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = tele > 0 ? '#fff0b8' : '#8f6cff';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, 0, e.r * 1.15, e.t * 0.7, e.t * 0.7 + Math.PI * 1.6);
  ctx.stroke();
  ctx.strokeStyle = '#ffda6e';
  ctx.beginPath();
  for (let i = 0; i < 12; i += 1) {
    const a = -Math.PI * 0.78 + (i / 11) * Math.PI * 1.56;
    const inner = e.r * 0.9;
    const outer = e.r * (1.14 + (i % 2) * 0.12);
    ctx.moveTo(Math.cos(a) * inner, Math.sin(a) * inner - e.r * 0.34);
    ctx.lineTo(Math.cos(a) * outer, Math.sin(a) * outer - e.r * 0.34);
  }
  ctx.stroke();
  ctx.fillStyle = tele > 0 ? '#fff0ba' : '#a98eff';
  ctx.beginPath();
  ctx.arc(0, 0, e.r * 0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff2c2';
  ctx.beginPath();
  ctx.arc(e.r * 0.1, -e.r * 0.08, e.r * 0.12, 0, TAU);
  ctx.fill();
  drawFlashOverlay(ctx, () => {
    ctx.beginPath();
    for (let i = 0; i < 10; i += 1) {
      const a = (i / 10) * TAU + e.t * 0.12;
      const rr = i % 2 === 0 ? e.r * 1.04 : e.r * 0.82;
      const px = Math.cos(a) * rr;
      const py = Math.sin(a) * rr;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }, flash);
  ctx.restore();
}

function drawPlayer(ctx, p) {
  const blink = p.invulnTime > 0 && Math.sin(p.invulnTime * 40) > 0.15;
  if (!blink && !p.alive) return;

  const spin = performance.now ? performance.now() * 0.0014 : Date.now() * 0.0014;
  ctx.save();
  ctx.translate(p.x, p.y);
  ctx.rotate(spin * 0.5);
  ctx.shadowBlur = 24;
  ctx.shadowColor = '#a96cff';

  for (let layer = 0; layer < 2; layer += 1) {
    const petals = 6 + layer * 2;
    const petalR = p.r * (1.3 + layer * 0.22);
    ctx.save();
    ctx.rotate(spin * (layer === 0 ? 1 : -0.65));
    ctx.fillStyle = layer === 0 ? 'rgba(154, 106, 255, 0.38)' : 'rgba(92, 236, 255, 0.24)';
    for (let i = 0; i < petals; i += 1) {
      ctx.save();
      ctx.rotate((i / petals) * TAU);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(petalR * 0.4, -p.r * 0.65, 0, -petalR);
      ctx.quadraticCurveTo(-petalR * 0.4, -p.r * 0.65, 0, 0);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  ctx.fillStyle = '#ffe46d';
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 0.42, 0, TAU);
  ctx.fill();
  ctx.fillStyle = '#fff8cf';
  ctx.beginPath();
  ctx.arc(-2, -2, p.r * 0.18, 0, TAU);
  ctx.fill();

  ctx.strokeStyle = 'rgba(176, 244, 255, 0.7)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(0, 0, p.r * 0.95, spin, spin + Math.PI * 1.15);
  ctx.stroke();
  ctx.restore();
}

export function makePlayer(x, y) {
  return {
    x,
    y,
    vx: 0,
    vy: 0,
    r: 14,
    hp: 100,
    maxHp: 100,
    level: 1,
    xp: 0,
    xpNext: 6,
    speed: 250,
    damage: 12,
    fireRate: 5,
    projectiles: 1,
    pierce: 0,
    magnet: 90,
    dashCdMax: 2.2,
    dashCd: 0,
    dashTime: 0,
    invulnTime: 0,
    fireCd: 0,
    aim: 0,
    alive: true,
    kills: 0,
  };
}

export function updatePlayer(state, dt, env) {
  const player = state.player;
  const { input, world, fx, audio } = env;
  if (!player) return;

  player.fireCd = Math.max(0, player.fireCd - dt);
  player.dashCd = Math.max(0, player.dashCd - dt);
  player.invulnTime = Math.max(0, player.invulnTime - dt);

  const move = input.moveVector();
  player.aim = angleTo(player.x, player.y, input.mouse.x, input.mouse.y);

  if (player.dashTime > 0) {
    player.dashTime = Math.max(0, player.dashTime - dt);
    fx.trail(player.x, player.y, '#8dfbff');
  } else if (input.dashQueued && player.dashCd <= 0 && player.alive) {
    const hasMove = Math.hypot(move.x, move.y) > 0.01;
    const dir = hasMove ? move : { x: Math.cos(player.aim), y: Math.sin(player.aim) };
    player.dashTime = DASH_DURATION;
    player.dashCd = player.dashCdMax;
    player.invulnTime = Math.max(player.invulnTime, DASH_INVULN);
    player.vx = dir.x * player.speed * DASH_BOOST;
    player.vy = dir.y * player.speed * DASH_BOOST;
    fx.burst(player.x, player.y, { count: 10, color: '#8dfbff', speed: 120, spread: 0.8 });
    audio.dash();
    input.dashQueued = false;
  }

  if (player.dashTime <= 0) {
    const targetVx = move.x * player.speed;
    const targetVy = move.y * player.speed;
    player.vx += (targetVx - player.vx) * Math.min(1, 18 * dt);
    player.vy += (targetVy - player.vy) * Math.min(1, 18 * dt);
    const drag = Math.max(0, 1 - 10 * dt);
    player.vx *= drag;
    player.vy *= drag;
  } else {
    fx.trail(player.x, player.y, '#d5b6ff');
  }

  player.x += player.vx * dt;
  player.y += player.vy * dt;
  clampInside(player, world);

  if (input.dashQueued && (!player.alive || player.dashCd > 0 || player.dashTime > 0)) {
    input.dashQueued = false;
  }

  const wantsFire = input.mouse.down || input.keys.has('Space') || input.keys.has(' ');
  if (wantsFire && player.fireCd <= 0 && player.alive) {
    const count = Math.max(1, player.projectiles | 0);
    const spread = count > 1 ? Math.min(0.34, 0.12 * (count - 1)) : 0;
    for (let i = 0; i < count; i += 1) {
      const t = count === 1 ? 0.5 : i / (count - 1);
      const angle = player.aim + lerp(-spread, spread, t) + rand(-0.015, 0.015);
      const muzzleX = player.x + Math.cos(angle) * (player.r + 6);
      const muzzleY = player.y + Math.sin(angle) * (player.r + 6);
      spawnBullet(state, muzzleX, muzzleY, angle, player.damage, player.pierce);
    }
    player.fireCd = 1 / Math.max(0.001, player.fireRate);
    fx.burst(player.x + Math.cos(player.aim) * player.r, player.y + Math.sin(player.aim) * player.r, {
      count: 6,
      color: '#74efff',
      speed: 100,
      spread: 0.35,
    });
    audio.shoot();
  }

  clampInside(player, world);
}

export function makeEnemy(kind, x, y, wave) {
  const scale = 1 + 0.12 * Math.max(0, wave - 1);
  const damageScale = 1 + 0.08 * Math.max(0, wave - 1);

  const base = {
    kind,
    x,
    y,
    vx: 0,
    vy: 0,
    t: Math.random() * 10,
    fireCd: rand(0.4, 1.2),
    flash: 0,
    dead: false,
    angle: Math.random() * TAU,
    mode: 'idle',
    modeTimer: 0,
    modeDuration: 0,
    mass: enemyMass(kind),
  };

  if (kind === 'dart') {
    return {
      ...base,
      r: 10,
      hp: 12 * scale,
      maxHp: 12 * scale,
      speed: 165,
      dmg: 8 * damageScale,
      xp: 1,
      score: 80,
      mode: 'approach',
      modeTimer: rand(0.2, 0.8),
      lungeAngle: 0,
    };
  }

  if (kind === 'bulwark') {
    return {
      ...base,
      r: 24,
      hp: 95 * scale,
      maxHp: 95 * scale,
      speed: 55,
      dmg: 18 * damageScale,
      xp: 3,
      score: 150,
    };
  }

  if (kind === 'spitter') {
    return {
      ...base,
      r: 14,
      hp: 30 * scale,
      maxHp: 30 * scale,
      speed: 80,
      dmg: 8 * damageScale,
      xp: 2,
      score: 120,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      fireCd: rand(0.4, 1.4),
    };
  }

  if (kind === 'boss') {
    const bossScale = 1 + 0.2 * Math.max(0, wave - 1);
    return {
      ...base,
      r: 46,
      hp: 850 * bossScale,
      maxHp: 850 * bossScale,
      speed: 62,
      dmg: 25 * (1 + 0.1 * Math.max(0, wave - 1)),
      xp: 25,
      score: 2000,
      roarDone: false,
      burstCd: 1.1,
      chargeCd: 2.2,
      mode: 'chase',
      chargeAngle: 0,
    };
  }

  return {
    ...base,
    r: 13,
    hp: 22 * scale,
    maxHp: 22 * scale,
    speed: 105,
    dmg: 10 * damageScale,
    xp: 1,
    score: 50,
  };
}

function updateChaser(e, player, dt) {
  const ang = angleTo(e.x, e.y, player.x, player.y) + Math.sin(e.t * 4.6) * 0.3;
  const target = e.speed * (0.96 + 0.08 * Math.sin(e.t * 6.5));
  e.vx += (Math.cos(ang) * target - e.vx) * Math.min(1, 5.5 * dt);
  e.vy += (Math.sin(ang) * target - e.vy) * Math.min(1, 5.5 * dt);
  e.angle = ang;
}

function updateDart(e, player, dt, fx) {
  e.modeTimer -= dt;

  if (e.mode === 'approach') {
    const dx = player.x - e.x;
    const dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const dirX = dx / d;
    const dirY = dy / d;
    const speedMul = d < 260 ? 0.5 : 1;
    e.vx += (dirX * e.speed * speedMul - e.vx) * Math.min(1, 7.5 * dt);
    e.vy += (dirY * e.speed * speedMul - e.vy) * Math.min(1, 7.5 * dt);
    e.angle = Math.atan2(e.vy, e.vx);
    if (d < 260 && e.modeTimer <= 0) {
      e.mode = 'telegraph';
      e.modeTimer = 0.34;
      e.modeDuration = 0.34;
      e.lungeAngle = angleTo(e.x, e.y, player.x, player.y);
      fx.burst(e.x, e.y, { count: 8, color: '#ff7ce8', speed: 70, spread: 0.3 });
    }
  } else if (e.mode === 'telegraph') {
    e.vx *= Math.max(0, 1 - 8 * dt);
    e.vy *= Math.max(0, 1 - 8 * dt);
    e.angle = e.lungeAngle;
    if (e.modeTimer <= 0) {
      e.mode = 'lunge';
      e.modeTimer = 0.24;
      e.modeDuration = 0.24;
      e.vx = Math.cos(e.lungeAngle) * 420;
      e.vy = Math.sin(e.lungeAngle) * 420;
    }
  } else if (e.mode === 'lunge') {
    e.angle = e.lungeAngle;
    if (e.modeTimer <= 0) {
      e.mode = 'recover';
      e.modeTimer = 0.44;
      e.modeDuration = 0.44;
    }
  } else {
    e.vx *= Math.max(0, 1 - 5.5 * dt);
    e.vy *= Math.max(0, 1 - 5.5 * dt);
    e.angle = Math.atan2(e.vy, e.vx);
    if (e.modeTimer <= 0) {
      e.mode = 'approach';
      e.modeTimer = rand(0.18, 0.5);
    }
  }
}

function updateBulwark(e, player, dt) {
  const ang = angleTo(e.x, e.y, player.x, player.y);
  e.vx += (Math.cos(ang) * e.speed - e.vx) * Math.min(1, 2.6 * dt);
  e.vy += (Math.sin(ang) * e.speed - e.vy) * Math.min(1, 2.6 * dt);
  e.angle = ang;
}

function spawnEnemyOrb(state, x, y, angle, speed, dmg, life, r = 6) {
  state.enemyBullets.push({
    x,
    y,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    r,
    dmg,
    life,
    dead: false,
  });
}

function updateSpitter(state, e, player, dt, fx) {
  const dx = player.x - e.x;
  const dy = player.y - e.y;
  const d = Math.hypot(dx, dy) || 1;
  const dirX = dx / d;
  const dirY = dy / d;
  const tangentX = -dirY * e.strafeDir;
  const tangentY = dirX * e.strafeDir;
  let desire = 0;
  if (d > 250) desire = 1;
  else if (d < 205) desire = -1;
  const targetVx = dirX * e.speed * desire + tangentX * e.speed * 0.55;
  const targetVy = dirY * e.speed * desire + tangentY * e.speed * 0.55;
  e.vx += (targetVx - e.vx) * Math.min(1, 4.4 * dt);
  e.vy += (targetVy - e.vy) * Math.min(1, 4.4 * dt);
  e.angle = angleTo(e.x, e.y, player.x, player.y);
  e.fireCd -= dt;
  if (e.fireCd <= 0) {
    e.fireCd = 1.9;
    const a = e.angle + rand(-0.08, 0.08);
    const mouthX = e.x + Math.cos(a) * (e.r + 5);
    const mouthY = e.y + Math.sin(a) * (e.r + 5);
    spawnEnemyOrb(state, mouthX, mouthY, a, 250, 10, 3.2, 6);
    fx.burst(mouthX, mouthY, { count: 6, color: '#66f0ff', speed: 60, spread: 0.25 });
  }
}

function updateBoss(state, e, player, dt, env) {
  const { fx, audio } = env;
  if (!e.roarDone) {
    e.roarDone = true;
    audio.bossRoar();
  }

  e.burstCd -= dt;
  e.chargeCd -= dt;
  e.modeTimer -= dt;

  if (e.mode === 'telegraph') {
    e.vx *= Math.max(0, 1 - 6 * dt);
    e.vy *= Math.max(0, 1 - 6 * dt);
    e.angle = e.chargeAngle;
    if (e.modeTimer <= 0) {
      e.mode = 'charge';
      e.modeTimer = 0.45;
      e.modeDuration = 0.45;
      e.vx = Math.cos(e.chargeAngle) * 430;
      e.vy = Math.sin(e.chargeAngle) * 430;
    }
  } else if (e.mode === 'charge') {
    e.angle = e.chargeAngle;
    fx.trail(e.x, e.y, '#c8a3ff');
    if (e.modeTimer <= 0) {
      e.mode = 'chase';
      e.modeTimer = 0;
    }
  } else {
    const ang = angleTo(e.x, e.y, player.x, player.y) + Math.sin(e.t * 1.8) * 0.08;
    e.vx += (Math.cos(ang) * e.speed - e.vx) * Math.min(1, 2.8 * dt);
    e.vy += (Math.sin(ang) * e.speed - e.vy) * Math.min(1, 2.8 * dt);
    e.angle = ang;
    if (e.chargeCd <= 0) {
      e.chargeCd = 4.5;
      e.mode = 'telegraph';
      e.modeTimer = 0.5;
      e.modeDuration = 0.5;
      e.chargeAngle = angleTo(e.x, e.y, player.x, player.y);
      fx.burst(e.x, e.y, { count: 14, color: '#ffe57b', speed: 90, spread: 0.5 });
    }
  }

  if (e.burstCd <= 0) {
    e.burstCd = 2.4;
    for (let i = 0; i < 14; i += 1) {
      const a = (i / 14) * TAU + e.t * 0.2;
      spawnEnemyOrb(state, e.x + Math.cos(a) * (e.r + 2), e.y + Math.sin(a) * (e.r + 2), a, 215, 12, 3.6, 7);
    }
    fx.ring(e.x, e.y, { color: '#cb95ff', radius: e.r + 10, width: 8 });
  }
}

export function updateEnemies(state, dt, env) {
  const { world, fx, audio } = env;
  const player = state.player;
  if (!player) return;

  for (const e of state.enemies) {
    if (!e || e.dead) continue;
    e.t += dt;
    e.flash = Math.max(0, (e.flash || 0) - dt);

    if (e.kind === 'chaser') {
      updateChaser(e, player, dt);
    } else if (e.kind === 'dart') {
      updateDart(e, player, dt, fx);
    } else if (e.kind === 'bulwark') {
      updateBulwark(e, player, dt);
    } else if (e.kind === 'spitter') {
      updateSpitter(state, e, player, dt, fx);
    } else if (e.kind === 'boss') {
      updateBoss(state, e, player, dt, { fx, audio });
    }

    e.x += e.vx * dt;
    e.y += e.vy * dt;

    const beforeX = e.x;
    const beforeY = e.y;
    clampInside(e, world);
    if (beforeX !== e.x) e.vx *= -0.15;
    if (beforeY !== e.y) e.vy *= -0.15;
  }
}

function spawnSeedDrops(state, e) {
  const count = Math.min(12, Math.max(1, e.xp | 0));
  let remaining = Math.max(1, e.xp | 0);
  const points = scatter(count, Math.max(10, e.r * 0.65));
  for (let i = 0; i < count; i += 1) {
    const slotsLeft = count - i;
    const value = Math.ceil(remaining / slotsLeft);
    remaining -= value;
    const p = makePickup('seed', e.x + points[i].x, e.y + points[i].y, value);
    state.pickups.push(p);
  }
}

export function damageEnemy(state, e, dmg, env) {
  if (!e || e.dead) return false;
  const { fx, audio } = env;
  e.hp -= dmg;
  e.flash = 0.08;

  const player = state.player;
  const kbAngle = player ? angleTo(player.x, player.y, e.x, e.y) : Math.random() * TAU;
  const kb = 120 / Math.max(0.5, e.mass || 1);
  e.vx += Math.cos(kbAngle) * kb;
  e.vy += Math.sin(kbAngle) * kb;

  fx.burst(e.x, e.y, { count: 5, color: '#ffd5ff', speed: 70, spread: 0.5 });
  audio.hit();

  if (e.hp > 0) return false;

  e.hp = 0;
  e.dead = true;
  spawnSeedDrops(state, e);

  if (e.kind === 'boss') {
    state.pickups.push(makePickup('heart', e.x, e.y, 25));
    fx.burst(e.x, e.y, { count: 28, color: '#ffdd79', speed: 180, spread: 1.2 });
    fx.ring(e.x, e.y, { color: '#ffe589', radius: e.r + 20, width: 10 });
  } else {
    fx.burst(e.x, e.y, { count: 12, color: '#b490ff', speed: 120, spread: 0.9 });
  }

  audio.enemyDown();
  return true;
}

export function damagePlayer(state, dmg, env) {
  const player = state.player;
  if (!player || player.invulnTime > 0 || player.dashTime > 0 || !player.alive) return false;

  player.hp -= dmg;
  player.invulnTime = 0.6;
  env.world.addShake(Math.max(3, dmg * 0.16));
  env.fx.burst(player.x, player.y, { count: 10, color: '#ff6ad5', speed: 110, spread: 0.9 });
  env.audio.hurt();

  if (player.hp > 0) return false;

  player.hp = 0;
  player.alive = false;
  env.fx.burst(player.x, player.y, { count: 28, color: '#ff7cc6', speed: 170, spread: 1.4 });
  env.fx.ring(player.x, player.y, { color: '#ff94dd', radius: player.r + 24, width: 8 });
  env.audio.gameOver();
  return true;
}

export function makePickup(kind, x, y, value = 1) {
  return {
    kind,
    x,
    y,
    vx: rand(-22, 22),
    vy: rand(-22, 22),
    value,
    r: kind === 'heart' ? 10 : 6,
    t: Math.random() * 10,
    life: PICKUP_LIFE,
    dead: false,
  };
}

export function updatePickups(state, dt, env) {
  const { fx, audio, world } = env;
  const player = state.player;
  let xp = 0;
  let healed = 0;
  pickupSoundCooldown = Math.max(0, pickupSoundCooldown - dt);

  for (const p of state.pickups) {
    if (!p || p.dead) continue;
    p.t += dt;
    p.life -= dt;
    if (p.life <= 0) {
      p.dead = true;
      continue;
    }

    const dx = player.x - p.x;
    const dy = player.y - p.y;
    const d = Math.hypot(dx, dy) || 1;
    const dirX = dx / d;
    const dirY = dy / d;
    const magnet = p.kind === 'heart' ? player.magnet * 0.5 : player.magnet;

    if (d < magnet) {
      const strength = p.kind === 'heart' ? 240 : 420;
      p.vx += dirX * strength * dt;
      p.vy += dirY * strength * dt;
    }

    p.vx *= Math.max(0, 1 - 1.9 * dt);
    p.vy *= Math.max(0, 1 - 1.9 * dt);
    p.x += p.vx * dt;
    p.y += p.vy * dt;

    p.x = clamp(p.x, p.r, world.width - p.r);
    p.y = clamp(p.y, p.r, world.height - p.r);

    if (d <= player.r + p.r + 2) {
      p.dead = true;
      if (p.kind === 'seed') {
        xp += p.value;
        fx.burst(p.x, p.y, { count: 4, color: '#d4ff7f', speed: 40, spread: 0.3 });
      } else {
        const amount = Math.min(25, player.maxHp - player.hp);
        if (amount > 0) {
          player.hp += amount;
          healed += amount;
          fx.text(p.x, p.y, `+${amount}`, { color: '#ff93dc' });
        }
        fx.burst(p.x, p.y, { count: 7, color: '#ff89d6', speed: 55, spread: 0.45 });
      }
      if (pickupSoundCooldown <= 0) {
        pickupSoundCooldown = 0.04;
        audio.pickup();
      }
    }
  }

  return { xp, healed };
}

export function updateBullets(state, dt, env) {
  const { fx, world } = env;
  trailTick += 1;

  for (const b of state.bullets) {
    if (!b || b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) {
      b.dead = true;
      continue;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (!clampBulletInside(b, world)) {
      b.dead = true;
      continue;
    }
    if (trailTick % 2 === 0) fx.trail(b.x, b.y, '#7ff4ff');
  }

  for (const b of state.enemyBullets) {
    if (!b || b.dead) continue;
    b.life -= dt;
    if (b.life <= 0) {
      b.dead = true;
      continue;
    }
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (!clampBulletInside(b, world)) b.dead = true;
  }
}

export function drawEntities(ctx, state) {
  for (const p of state.pickups) {
    if (!p || p.dead) continue;
    const blink = p.life < 4 && Math.sin(p.t * 20) > 0.35;
    if (blink) continue;
    if (p.kind === 'heart') drawHeart(ctx, p);
    else drawSeed(ctx, p);
  }

  for (const b of state.enemyBullets) {
    if (!b || b.dead) continue;
    drawEnemyBullet(ctx, b);
  }

  for (const b of state.bullets) {
    if (!b || b.dead) continue;
    drawBullet(ctx, b);
  }

  for (const e of state.enemies) {
    if (!e || e.dead) continue;
    const flash = flashAlpha(e);
    if (e.kind === 'dart') drawDart(ctx, e, flash);
    else if (e.kind === 'bulwark') drawBulwark(ctx, e, flash);
    else if (e.kind === 'spitter') drawSpitter(ctx, e, flash);
    else if (e.kind === 'boss') drawBoss(ctx, e, flash);
    else drawChaser(ctx, e, flash);

    if (e.hp < e.maxHp) {
      const ratio = hpRatio(e);
      if (e.kind === 'boss' || e.kind === 'bulwark') drawDamageBar(ctx, e.x, e.y - e.r - 11, e.r * 1.9, ratio, '#ffe17f');
      else drawHpArc(ctx, e, ratio, '#7ff8ff');
    }
  }

  if (state.player) drawPlayer(ctx, state.player);
}

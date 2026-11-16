import { input, initInput } from './input.js';
import { audio } from './audio.js';
import { world } from './world.js';
import { fx } from './particles.js';
import {
  makePlayer,
  updatePlayer,
  updateEnemies,
  damageEnemy,
  damagePlayer,
  updatePickups,
  updateBullets,
  drawEntities,
} from './entities.js';
import { createWaves, isBossWave, startNextWave, updateWaves } from './waves.js';
import { rollChoices, applyUpgrade } from './upgrades.js';
import { ui } from './ui.js';

const STORAGE_BEST_KEY = 'voidbloom-best';
const MAX_DT = 0.033;
const INTERMISSION_TIME = 1.6;
const MAX_DPR = 2;

const canvas = document.querySelector('#game');
if (!canvas) {
  throw new Error('VOIDBLOOM could not find #game canvas.');
}

const ctx = canvas.getContext('2d');
if (!ctx) {
  throw new Error('VOIDBLOOM could not create a 2D rendering context.');
}

let gameState = 'menu';
let run = null;
let levelChoices = [];
let lastFrameTime = performance.now();
let currentDpr = 1;

// Boot ---------------------------------------------------------------------

function resizeCanvas() {
  const cssWidth = Math.max(1, Math.round(canvas.clientWidth || canvas.width || 1));
  const cssHeight = Math.max(1, Math.round(canvas.clientHeight || canvas.height || 1));

  currentDpr = Math.min(MAX_DPR, Math.max(1, window.devicePixelRatio || 1));
  const pixelWidth = Math.max(1, Math.round(cssWidth * currentDpr));
  const pixelHeight = Math.max(1, Math.round(cssHeight * currentDpr));

  if (canvas.width !== pixelWidth || canvas.height !== pixelHeight) {
    canvas.width = pixelWidth;
    canvas.height = pixelHeight;
  }

  ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
  ctx.imageSmoothingEnabled = true;
  world.resize(canvas);
}

function initUi() {
  ui.init({
    onStart: () => {
      startRun();
    },
    onRestart: () => {
      startRun();
    },
    onPick: (index) => {
      pickLevelChoice(index);
    },
  });

  ui.setPaused(false);
  ui.setMuted(audio.isMuted());
  ui.hideGameOver();
  ui.hideLevelUp();
  ui.showMenu();
}

function boot() {
  resizeCanvas();
  initInput(canvas);
  initUi();

  window.addEventListener('resize', resizeCanvas);
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && gameState === 'playing') {
      setPaused(true);
    }
  });

  requestAnimationFrame(frame);
}

// Run lifecycle ------------------------------------------------------------

function makeRunState() {
  const player = makePlayer(world.width * 0.5, world.height * 0.5);

  return {
    player,
    bullets: [],
    enemies: [],
    pickups: [],
    enemyBullets: [],
  };
}

function startRun() {
  resizeCanvas();

  run = {
    state: makeRunState(),
    wm: createWaves(),
    score: 0,
    combo: 0,
    comboTimer: 0,
    runTime: 0,
    intermission: 0,
  };

  levelChoices = [];
  fx.clear();
  ui.hideMenu();
  ui.hideGameOver();
  ui.hideLevelUp();
  ui.setPaused(false);

  audio.init();
  void audio.resume();
  audio.startMusic();

  const started = startNextWave(run.wm, run.state, world);
  announceWave(started, 'The bloom stirs');

  gameState = 'playing';
  updateHud();
}

function endRun() {
  if (!run) {
    gameState = 'gameover';
    return;
  }

  gameState = 'gameover';
  levelChoices = [];
  ui.hideLevelUp();
  ui.setPaused(false);
  audio.stopMusic();

  const score = run.score;
  const player = run.state.player;
  const wave = run.wm.wave;

  let best = 0;
  try {
    best = Number(localStorage.getItem(STORAGE_BEST_KEY) || 0) || 0;
  } catch {
    best = 0;
  }

  const newBest = score > best;
  const nextBest = Math.max(best, score);

  if (newBest) {
    try {
      localStorage.setItem(STORAGE_BEST_KEY, String(score));
    } catch {
      // Ignore storage failures.
    }
  }

  ui.showGameOver({
    score,
    best: nextBest,
    wave,
    level: player.level,
    kills: player.kills,
    timeSeconds: Math.floor(run.runTime),
    newBest,
  });
}

// Input and UI flow --------------------------------------------------------

function setPaused(on) {
  if (on) {
    if (gameState !== 'playing') return;
    gameState = 'paused';
    ui.setPaused(true);
    return;
  }

  if (gameState !== 'paused') return;
  gameState = 'playing';
  ui.setPaused(false);
}

function togglePause() {
  if (gameState === 'playing') {
    setPaused(true);
  } else if (gameState === 'paused') {
    setPaused(false);
  }
}

function toggleMute() {
  const muted = audio.toggleMuted();
  ui.setMuted(muted);

  if (!muted && run && gameState !== 'menu' && gameState !== 'gameover') {
    void audio.resume();
    audio.startMusic();
  }
}

function maybeHandleGlobalInputs() {
  if (input.pressed('KeyM')) {
    toggleMute();
  }

  if ((gameState === 'playing' || gameState === 'paused') && (input.pressed('KeyP') || input.pressed('Escape'))) {
    togglePause();
  }

  if (gameState !== 'levelup') {
    return;
  }

  if (input.pressed('Digit1')) {
    pickLevelChoice(0);
  } else if (input.pressed('Digit2')) {
    pickLevelChoice(1);
  } else if (input.pressed('Digit3')) {
    pickLevelChoice(2);
  }
}

function consumeLevelAndShowChoice() {
  if (!run) return false;

  const player = run.state.player;
  if (player.xp < player.xpNext) {
    return false;
  }

  player.xp -= player.xpNext;
  player.level += 1;
  player.xpNext = Math.round(player.xpNext * 1.35) + 2;

  levelChoices = rollChoices(player, 3);
  gameState = 'levelup';
  ui.setPaused(false);
  ui.showLevelUp(levelChoices);
  audio.levelUp();
  fx.ring(player.x, player.y, {
    color: '#b59cff',
    maxRadius: player.r + 42,
    width: 7,
    life: 0.45,
  });
  return true;
}

function pickLevelChoice(index) {
  if (!run || gameState !== 'levelup') return;

  const choice = levelChoices[index];
  if (!choice) return;

  applyUpgrade(run.state.player, choice);
  levelChoices = [];
  ui.hideLevelUp();

  if (consumeLevelAndShowChoice()) {
    updateHud();
    return;
  }

  gameState = 'playing';
  updateHud();
}

function announceWave(info, normalSubtitle = 'Survive the bloom') {
  if (!info) return;

  const title = `Wave ${info.wave}`;
  if (info.isBoss || isBossWave(info.wave)) {
    ui.banner(title, 'WITHERHEART awakens');
    world.addShake(9);
    return;
  }

  ui.banner(title, normalSubtitle);
}

// Simulation ---------------------------------------------------------------

function comboMultiplier() {
  if (!run) return 1;
  return 1 + Math.min(run.combo, 40) * 0.05;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function circlesOverlap(a, b) {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  const rr = a.r + b.r;
  return dx * dx + dy * dy <= rr * rr;
}

function registerKill(enemy) {
  if (!run || !enemy) return;

  const player = run.state.player;
  player.kills += 1;
  run.combo += 1;
  run.comboTimer = 2.5;

  const mult = comboMultiplier();
  const killScore = Math.round((enemy.score || 0) * mult);
  run.score += killScore;

  if (killScore >= 150) {
    fx.text(enemy.x, enemy.y - enemy.r - 10, `+${killScore}`, {
      color: enemy.kind === 'boss' ? '#fff0a8' : '#ffe07a',
      size: enemy.kind === 'boss' ? 28 : enemy.kind === 'bulwark' ? 22 : 18,
      life: 0.85,
      vy: -34,
    });
  }

  if (enemy.kind === 'bulwark') {
    world.addShake(6);
  } else if (enemy.kind === 'boss') {
    world.addShake(12);
  }
}

function handlePlayerDeath() {
  endRun();
}

function resolveBulletEnemyCollisions() {
  if (!run) return;

  const env = { world, fx, audio };
  const { bullets, enemies } = run.state;

  for (const bullet of bullets) {
    if (!bullet || bullet.dead) continue;

    for (const enemy of enemies) {
      if (!enemy || enemy.dead || bullet.dead) continue;
      if (!circlesOverlap(bullet, enemy)) continue;

      bullet.hitSet ??= new Set();
      if (bullet.hitSet.has(enemy)) {
        continue;
      }

      bullet.hitSet.add(enemy);
      audio.hit();

      const died = damageEnemy(run.state, enemy, bullet.dmg, env);
      if (died) {
        registerKill(enemy);
      }

      if (bullet.hitSet.size > (bullet.pierce || 0)) {
        bullet.dead = true;
      }
    }
  }
}

function resolveEnemyBulletCollisions() {
  if (!run) return;

  for (const bullet of run.state.enemyBullets) {
    if (!bullet || bullet.dead) continue;
    if (!circlesOverlap(bullet, run.state.player)) continue;

    bullet.dead = true;
    if (damagePlayer(run.state, bullet.dmg, { world, fx, audio })) {
      handlePlayerDeath();
      return;
    }
  }
}

function resolveEnemyContact() {
  if (!run) return;

  const player = run.state.player;

  for (const enemy of run.state.enemies) {
    if (!enemy || enemy.dead || !circlesOverlap(enemy, player)) continue;

    const dx = enemy.x - player.x;
    const dy = enemy.y - player.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const push = Math.max(6, player.r + enemy.r - dist + 2);

    enemy.x = clamp(enemy.x + nx * push, enemy.r, world.width - enemy.r);
    enemy.y = clamp(enemy.y + ny * push, enemy.r, world.height - enemy.r);
    enemy.vx += nx * 42;
    enemy.vy += ny * 42;

    if (damagePlayer(run.state, enemy.dmg, { world, fx, audio })) {
      handlePlayerDeath();
      return;
    }
  }
}

function filterDeadEntities() {
  if (!run) return;

  run.state.bullets = run.state.bullets.filter((item) => item && !item.dead);
  run.state.enemies = run.state.enemies.filter((item) => item && !item.dead);
  run.state.pickups = run.state.pickups.filter((item) => item && !item.dead);
  run.state.enemyBullets = run.state.enemyBullets.filter((item) => item && !item.dead);
}

function updateCombo(dt) {
  if (!run) return;

  if (run.comboTimer > 0) {
    run.comboTimer = Math.max(0, run.comboTimer - dt);
    if (run.comboTimer === 0) {
      run.combo = 0;
    }
  }
}

function updateIntermission(dt) {
  if (!run || gameState !== 'playing' || run.wm.phase !== 'cleared') {
    return;
  }

  if (run.intermission <= 0) {
    run.intermission = INTERMISSION_TIME;
  }

  run.intermission -= dt;
  if (run.intermission > 0) {
    return;
  }

  run.intermission = 0;
  const started = startNextWave(run.wm, run.state, world);
  announceWave(started);
}

function updateHud() {
  if (!run) return;

  const player = run.state.player;
  const boss = run.state.enemies.find((enemy) => enemy && !enemy.dead && enemy.kind === 'boss');

  ui.updateHUD({
    hp: player.hp,
    maxHp: player.maxHp,
    xp: player.xp,
    xpNext: player.xpNext,
    level: player.level,
    wave: run.wm.wave,
    score: run.score,
    comboMult: comboMultiplier(),
    dashCd: player.dashCd,
    dashCdMax: player.dashCdMax,
    boss: boss ? { hp: boss.hp, maxHp: boss.maxHp } : null,
  });
}

function updatePlaying(dt) {
  if (!run) return;

  run.runTime += dt;

  updatePlayer(run.state, dt, { input, world, fx, audio });
  updateEnemies(run.state, dt, { world, fx, audio });
  updateWaves(run.wm, run.state, dt, world);
  updateBullets(run.state, dt, { world, fx });

  const pickupResult = updatePickups(run.state, dt, { world, fx, audio });
  if (pickupResult?.xp) {
    run.state.player.xp += pickupResult.xp;
  }

  resolveBulletEnemyCollisions();
  if (gameState !== 'playing') {
    filterDeadEntities();
    updateHud();
    return;
  }

  resolveEnemyBulletCollisions();
  if (gameState !== 'playing') {
    filterDeadEntities();
    updateHud();
    return;
  }

  resolveEnemyContact();
  if (gameState !== 'playing') {
    filterDeadEntities();
    updateHud();
    return;
  }

  filterDeadEntities();
  updateCombo(dt);

  if (!consumeLevelAndShowChoice()) {
    updateIntermission(dt);
  }

  updateHud();
  fx.update(dt);
}

// Rendering ----------------------------------------------------------------

function draw() {
  const width = Math.max(1, Math.round(canvas.clientWidth || world.width || 1));
  const height = Math.max(1, Math.round(canvas.clientHeight || world.height || 1));

  ctx.setTransform(currentDpr, 0, 0, currentDpr, 0, 0);
  ctx.clearRect(0, 0, width, height);

  ctx.save();
  ctx.translate(world.shakeX, world.shakeY);
  world.draw(ctx);

  if (run) {
    drawEntities(ctx, run.state);
  }

  fx.draw(ctx);
  ctx.restore();
}

function frame(now) {
  const dt = Math.min(MAX_DT, Math.max(0, (now - lastFrameTime) / 1000));
  lastFrameTime = now;

  maybeHandleGlobalInputs();
  world.update(dt);

  if (gameState === 'playing') {
    updatePlaying(dt);
  } else if (gameState === 'gameover') {
    fx.update(dt);
    updateHud();
  } else if (run) {
    updateHud();
  }

  draw();
  requestAnimationFrame(frame);
}

boot();

import { makeEnemy } from './entities.js';
import { world as defaultWorld } from './world.js';

const MIN_PLAYER_DISTANCE = 180;
const SPAWN_RETRY_COUNT = 8;
const NORMAL_INTERVAL_START = 0.9;
const NORMAL_INTERVAL_FLOOR = 0.35;
const BOSS_TRICKLE_INTERVAL = 1.6;

export function isBossWave(n) {
  return n % 5 === 0;
}

export function createWaves() {
  return {
    wave: 0,
    phase: 'idle',
    queue: [],
    spawnTimer: 0,
    spawned: 0,
    total: 0,
    betweenTimer: 0,
  };
}

export function startNextWave(wm, state, world) {
  wm.wave += 1;

  const bossWave = isBossWave(wm.wave);
  const queue = bossWave ? buildBossQueue(wm.wave) : buildNormalQueue(wm.wave);

  wm.phase = 'spawning';
  wm.queue = queue;
  wm.spawned = 0;
  wm.total = queue.length;
  wm.betweenTimer = 0;
  wm.spawnInterval = bossWave
    ? BOSS_TRICKLE_INTERVAL
    : Math.max(NORMAL_INTERVAL_FLOOR, NORMAL_INTERVAL_START - (wm.wave - 1) * 0.05);
  wm.spawnTimer = 0;

  return { wave: wm.wave, isBoss: bossWave };
}

export function updateWaves(wm, state, dt, world) {
  if (wm.phase === 'spawning') {
    wm.spawnTimer -= dt;

    while (wm.spawnTimer <= 0 && wm.queue.length > 0) {
      const kind = wm.queue.shift();
      const arena = world || defaultWorld;
      const { x, y } = pickSpawnPoint(state.player, arena);

      state.enemies.push(makeEnemy(kind, x, y, wm.wave));
      wm.spawned += 1;

      if (wm.queue.length === 0) {
        wm.phase = 'active';
        break;
      }

      wm.spawnTimer += getNextSpawnDelay(wm, kind);

      if (dt <= 0) {
        break;
      }
    }
  }

  if (wm.phase === 'active' && state.enemies.length === 0) {
    wm.phase = 'cleared';
  }
}

function buildBossQueue(wave) {
  const queue = ['boss'];
  const chasers = 4 + Math.floor(wave / 5);
  const darts = Math.max(1, Math.floor(chasers / 3));
  const tail = [];

  for (let i = 0; i < chasers; i += 1) {
    tail.push('chaser');
  }

  for (let i = 0; i < darts; i += 1) {
    tail.push('dart');
  }

  shuffle(tail);

  return queue.concat(tail);
}

function buildNormalQueue(wave) {
  const total = Math.min(60, 6 + 3 * wave);
  const queue = [];

  // Early waves lean on chasers, with new enemy types unlocking over time.
  const weights = [
    { kind: 'chaser', weight: 14 + wave * 2 },
  ];

  if (wave >= 2) {
    weights.push({ kind: 'dart', weight: 3 + wave * 2 });
  }

  if (wave >= 3) {
    weights.push({ kind: 'spitter', weight: 2 + wave });
  }

  if (wave >= 4) {
    weights.push({ kind: 'bulwark', weight: 1 + Math.floor(wave / 3) });
  }

  for (let i = 0; i < total; i += 1) {
    queue.push(weightedPick(weights));
  }

  shuffle(queue);
  limitEarlyBulwarks(queue);

  return queue;
}

function weightedPick(weights) {
  let totalWeight = 0;

  for (const entry of weights) {
    totalWeight += entry.weight;
  }

  let roll = Math.random() * totalWeight;

  for (const entry of weights) {
    roll -= entry.weight;

    if (roll <= 0) {
      return entry.kind;
    }
  }

  return weights[weights.length - 1].kind;
}

function limitEarlyBulwarks(queue) {
  const earlyWindow = Math.min(8, queue.length);
  let bulwarksSeen = 0;

  for (let i = 0; i < earlyWindow; i += 1) {
    if (queue[i] !== 'bulwark') {
      continue;
    }

    bulwarksSeen += 1;
    if (bulwarksSeen <= 2) {
      continue;
    }

    for (let j = earlyWindow; j < queue.length; j += 1) {
      if (queue[j] !== 'bulwark') {
        const swap = queue[i];
        queue[i] = queue[j];
        queue[j] = swap;
        break;
      }
    }
  }
}

function getNextSpawnDelay(wm, justSpawnedKind) {
  if (!isBossWave(wm.wave)) {
    return wm.spawnInterval;
  }

  // Boss wave opens instantly with the boss, then adds support units slowly.
  if (justSpawnedKind === 'boss') {
    return BOSS_TRICKLE_INTERVAL;
  }

  return wm.spawnInterval;
}

function pickSpawnPoint(player, arena) {
  let fallback = randomEdgePoint(arena);

  for (let i = 0; i < SPAWN_RETRY_COUNT; i += 1) {
    const point = randomEdgePoint(arena);
    fallback = point;

    if (distanceToPlayer(point, player) >= MIN_PLAYER_DISTANCE) {
      return point;
    }
  }

  return fallback;
}

function randomEdgePoint(arena) {
  const side = Math.floor(Math.random() * 4);
  const width = arena.width;
  const height = arena.height;

  switch (side) {
    case 0:
      return { x: Math.random() * width, y: 0 };
    case 1:
      return { x: width, y: Math.random() * height };
    case 2:
      return { x: Math.random() * width, y: height };
    default:
      return { x: 0, y: Math.random() * height };
  }
}

function distanceToPlayer(point, player) {
  const dx = point.x - player.x;
  const dy = point.y - player.y;
  return Math.hypot(dx, dy);
}

function shuffle(items) {
  for (let i = items.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = items[i];
    items[i] = items[j];
    items[j] = swap;
  }
}

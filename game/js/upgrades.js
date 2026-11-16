// Upgrade pool and level-up choice logic for VOIDBLOOM.

const clampHeal = (player, amount) => {
  player.hp = Math.min(player.maxHp, player.hp + amount);
};

const bloomFallback = {
  id: 'bloom',
  name: 'Bloom',
  glyph: '✿',
  desc: 'Restore 40% of max HP.',
  max: Infinity,
  available: (player) => player.hp < player.maxHp * 0.7,
  apply: (player) => {
    clampHeal(player, player.maxHp * 0.4);
  },
};

export const UPGRADES = [
  {
    id: 'power',
    name: 'Power',
    glyph: '✦',
    desc: '+20% damage.',
    max: 6,
    apply: (player) => {
      player.damage *= 1.2;
    },
  },
  {
    id: 'tempo',
    name: 'Tempo',
    glyph: '»',
    desc: '+18% fire rate.',
    max: 6,
    apply: (player) => {
      player.fireRate *= 1.18;
    },
  },
  {
    id: 'swift',
    name: 'Swift',
    glyph: '➜',
    desc: '+12% move speed.',
    max: 5,
    apply: (player) => {
      player.speed *= 1.12;
    },
  },
  {
    id: 'phase',
    name: 'Phase',
    glyph: '◇',
    desc: 'Dash recharges 15% faster.',
    max: 4,
    apply: (player) => {
      player.dashCdMax = Math.max(0.7, player.dashCdMax * 0.85);
    },
  },
  {
    id: 'lure',
    name: 'Lure',
    glyph: '◎',
    desc: '+40% magnet radius.',
    max: 4,
    apply: (player) => {
      player.magnet *= 1.4;
    },
  },
  {
    id: 'vigor',
    name: 'Vigor',
    glyph: '♥',
    desc: '+25 max HP and heal 25.',
    max: 6,
    apply: (player) => {
      player.maxHp += 25;
      clampHeal(player, 25);
    },
  },
  {
    id: 'split',
    name: 'Split',
    glyph: 'Y',
    desc: '+1 projectile per shot.',
    max: 3,
    apply: (player) => {
      player.projectiles += 1;
    },
  },
  {
    id: 'pierce',
    name: 'Pierce',
    glyph: '↦',
    desc: 'Shots pierce +1 enemy.',
    max: 3,
    apply: (player) => {
      player.pierce += 1;
    },
  },
  bloomFallback,
];

const isEligible = (player, def) => {
  const taken = player.taken?.[def.id] ?? 0;
  return taken < def.max && (def.available ? def.available(player) : true);
};

const shuffled = (items) => {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
};

export function rollChoices(player, count = 3) {
  const pool = UPGRADES.filter((def) => isEligible(player, def));
  if (pool.length === 0) {
    return [bloomFallback];
  }
  return shuffled(pool).slice(0, Math.max(0, count));
}

export function applyUpgrade(player, def) {
  player.taken ??= {};
  player.taken[def.id] = (player.taken[def.id] ?? 0) + 1;
  def.apply(player);
}

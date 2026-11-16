const clamp = (value, min, max) => Math.min(max, Math.max(min, value));

const formatTime = (timeSeconds) => {
  const totalSeconds = Math.max(0, Math.floor(Number(timeSeconds) || 0));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = String(totalSeconds % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
};

const createLine = (label, value) => {
  const line = document.createElement('div');
  line.textContent = `${label}: ${value}`;
  return line;
};

const ui = (() => {
  let elements = null;
  let onPick = null;
  let bannerTimer = 0;

  const setHidden = (element, hidden) => {
    if (!element) return;
    element.classList.toggle('hidden', hidden);
  };

  const clearChildren = (element) => {
    if (!element) return;
    element.replaceChildren();
  };

  const setBar = (fill, value, max) => {
    const ratio = max > 0 ? value / max : 0;
    fill.style.width = `${clamp(ratio * 100, 0, 100)}%`;
  };

  const cacheElements = () => {
    const hud = document.querySelector('#hud');
    const bossBar = document.createElement('div');
    const bossLabel = document.createElement('span');
    const bossTrack = document.createElement('div');
    const bossFill = document.createElement('div');

    bossBar.id = 'bossbar';
    bossBar.className = 'boss-bar hidden';

    bossLabel.textContent = 'WITHERHEART';

    bossTrack.className = 'meter-track';
    bossFill.className = 'meter-fill';
    bossTrack.appendChild(bossFill);

    bossBar.append(bossLabel, bossTrack);
    hud.appendChild(bossBar);

    elements = {
      hpBar: document.querySelector('[data-bar="hp"]'),
      xpBar: document.querySelector('[data-bar="xp"]'),
      hudLevel: document.querySelector('#hudLevel'),
      hudWave: document.querySelector('#hudWave'),
      hudScore: document.querySelector('#hudScore'),
      hudCombo: document.querySelector('#hudCombo'),
      hudDash: document.querySelector('#hudDash'),
      muteIndicator: document.querySelector('#muteIndicator'),
      pauseHint: document.querySelector('#pausehint'),
      banner: document.querySelector('#banner'),
      menu: document.querySelector('#menu'),
      startBtn: document.querySelector('#startBtn'),
      levelUp: document.querySelector('#levelup'),
      cardGrid: document.querySelector('#levelup .card-grid'),
      gameOver: document.querySelector('#gameover'),
      statsArea: document.querySelector('#gameover .stats-area'),
      restartBtn: document.querySelector('#restartBtn'),
      bossBar,
      bossFill,
    };
  };

  return {
    init(handlers = {}) {
      if (elements) return;

      cacheElements();
      onPick = typeof handlers.onPick === 'function' ? handlers.onPick : null;

      if (typeof handlers.onStart === 'function') {
        elements.startBtn.addEventListener('click', handlers.onStart);
      }

      if (typeof handlers.onRestart === 'function') {
        elements.restartBtn.addEventListener('click', handlers.onRestart);
      }
    },

    showMenu() {
      setHidden(elements.menu, false);
    },

    hideMenu() {
      setHidden(elements.menu, true);
    },

    showGameOver(stats = {}) {
      clearChildren(elements.statsArea);
      elements.statsArea.append(
        createLine('Score', Number(stats.score || 0).toLocaleString()),
        createLine('Best', Number(stats.best || 0).toLocaleString()),
        createLine('Wave', stats.wave ?? 0),
        createLine('Level', stats.level ?? 0),
        createLine('Kills', Number(stats.kills || 0).toLocaleString()),
        createLine('Time', formatTime(stats.timeSeconds))
      );

      if (stats.newBest) {
        const bestLine = document.createElement('div');
        bestLine.textContent = 'New best!';
        elements.statsArea.appendChild(bestLine);
      }

      setHidden(elements.gameOver, false);
    },

    hideGameOver() {
      setHidden(elements.gameOver, true);
      clearChildren(elements.statsArea);
    },

    showLevelUp(choices = []) {
      clearChildren(elements.cardGrid);

      choices.forEach((choice, index) => {
        const card = document.createElement('button');
        const glyph = document.createElement('span');
        const name = document.createElement('span');
        const desc = document.createElement('span');
        const hint = document.createElement('span');

        card.type = 'button';
        card.className = 'card';

        glyph.className = 'card-glyph';
        glyph.textContent = choice.glyph ?? '';

        name.className = 'card-name';
        name.textContent = choice.name ?? '';

        desc.className = 'card-desc';
        desc.textContent = choice.desc ?? '';

        hint.className = 'card-key';
        hint.textContent = `${index + 1}`;

        card.append(glyph, name, desc, hint);
        card.addEventListener('click', () => {
          if (onPick) onPick(index);
        });

        elements.cardGrid.appendChild(card);
      });

      setHidden(elements.levelUp, false);
    },

    hideLevelUp() {
      setHidden(elements.levelUp, true);
      clearChildren(elements.cardGrid);
    },

    banner(title, subtitle) {
      clearTimeout(bannerTimer);
      clearChildren(elements.banner);

      const titleElement = document.createElement('strong');
      titleElement.textContent = title ?? '';
      elements.banner.appendChild(titleElement);

      if (subtitle) {
        const subtitleElement = document.createElement('small');
        subtitleElement.textContent = subtitle;
        elements.banner.appendChild(document.createElement('br'));
        elements.banner.appendChild(subtitleElement);
      }

      setHidden(elements.banner, false);

      // Toggle the animation class with a forced reflow so repeated banners replay reliably.
      elements.banner.classList.remove('show');
      void elements.banner.offsetWidth;
      elements.banner.classList.add('show');

      bannerTimer = window.setTimeout(() => {
        elements.banner.classList.remove('show');
        setHidden(elements.banner, true);
      }, 1900);
    },

    setPaused(on) {
      setHidden(elements.pauseHint, !on);
      if (on) {
        elements.pauseHint.textContent = 'Paused';
      }
    },

    setMuted(on) {
      setHidden(elements.muteIndicator, !on);
    },

    updateHUD(view = {}) {
      const hpRatio = view.maxHp > 0 ? view.hp / view.maxHp : 0;

      setBar(elements.hpBar, view.hp || 0, view.maxHp || 0);
      elements.hpBar.classList.toggle('low', hpRatio > 0 && hpRatio < 0.3);

      setBar(elements.xpBar, view.xp || 0, view.xpNext || 0);

      elements.hudLevel.textContent = `${view.level ?? 0}`;
      elements.hudWave.textContent = `${view.wave ?? 0}`;
      elements.hudScore.textContent = Number(view.score || 0).toLocaleString();
      elements.hudCombo.textContent = view.comboMult > 1 ? `x${view.comboMult.toFixed(1)}` : 'x1';
      elements.hudDash.textContent = view.dashCd <= 0 ? 'Ready' : `${view.dashCd.toFixed(1)}s`;

      if (view.boss) {
        setHidden(elements.bossBar, false);
        setBar(elements.bossFill, view.boss.hp || 0, view.boss.maxHp || 0);
      } else {
        setHidden(elements.bossBar, true);
      }
    },
  };
})();

export { ui };

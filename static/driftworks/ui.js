// DOM-overlay UI for Driftworks: start screen, playing HUD (build palette,
// quota bar, stockpile, tech tree, pause button), pause overlay, and game
// over screen. Chosen as DOM rather than canvas-drawn HUD (unlike Overrun)
// because the palette/tech-tree/stockpile panels have many small
// buttons/labels that are much easier to lay out and hit-test as real
// elements. The world itself stays canvas-rendered (render.js).
//
// The overlay root uses `pointer-events: none` (see driftworks.css) so empty
// space passes clicks through to the canvas underneath for pan/zoom/build;
// individual panels/buttons opt back in with `pointer-events: auto`.
import { BUILDING_DEFS } from './buildings.js';
import { ITEMS, TECH_TREE } from './items.js';
import { BULLDOZE_TOOL } from './input.js';

function fmtTime(seconds) {
  const s = Math.max(0, Math.ceil(seconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function formatCost(cost) {
  return Object.entries(cost).map(([id, qty]) => `${qty} ${ITEMS[id]?.name ?? id}`).join(', ');
}

export class UI {
  constructor(callbacks = {}) {
    this.callbacks = callbacks;
    this.itemRows = new Map();
    this.techRowEls = new Map();
    this.paletteButtons = new Map();

    this.root = el('div');
    this.root.id = 'driftworks-ui';
    document.body.appendChild(this.root);

    this._buildStart();
    this._buildHud();
    this._buildPause();
    this._buildGameOver();

    this.setStatus('start');
  }

  // --- Screen visibility ---------------------------------------------------
  setStatus(status, data = {}) {
    this.startScreen.hidden = status !== 'start';
    this.hud.hidden = !(status === 'playing' || status === 'paused');
    this.pauseScreen.hidden = status !== 'paused';
    this.gameOverScreen.hidden = status !== 'gameover';
    if (status === 'start') this.bestScoreEl.textContent = String(data.bestScore ?? 0);
    if (status === 'gameover') this._showGameOver(data);
  }

  setSelectedBuilding(type) {
    for (const [t, btn] of this.paletteButtons) {
      btn.classList.toggle('dw-active', t === type);
    }
  }

  // --- Start screen ---------------------------------------------------------
  _buildStart() {
    const s = el('div', 'dw-screen dw-start');
    s.appendChild(el('h1', 'dw-title', 'DRIFTWORKS'));
    s.appendChild(el('p', 'dw-subtitle',
      'Build a conveyor factory on an island that erodes at the edges. '
      + 'Route goods to the Dock to fulfil quotas before three slip past.'));
    const bestRow = el('p', 'dw-best');
    bestRow.append('Best score: ');
    this.bestScoreEl = el('span', 'dw-best-value', '0');
    bestRow.appendChild(this.bestScoreEl);
    s.appendChild(bestRow);

    const playBtn = el('button', 'dw-btn dw-btn-primary', 'Play');
    playBtn.addEventListener('click', () => this.callbacks.onPlay?.());
    s.appendChild(playBtn);

    s.appendChild(el('p', 'dw-hint', 'Drag to pan, scroll/pinch to zoom, click/tap to build. R or right-click rotates.'));
    this.root.appendChild(s);
    this.startScreen = s;
  }

  // --- Playing HUD ------------------------------------------------------
  _buildHud() {
    const hud = el('div', 'dw-hud');

    const top = el('div', 'dw-topbar');

    const quotaBox = el('div', 'dw-quota');
    this.quotaLabel = el('div', 'dw-quota-label', 'Quota: —');
    const track = el('div', 'dw-bar-track');
    this.quotaBarFill = el('div', 'dw-bar-fill dw-bar-quota');
    track.appendChild(this.quotaBarFill);
    this.quotaTimeLabel = el('div', 'dw-quota-time', '');
    quotaBox.append(this.quotaLabel, track, this.quotaTimeLabel);
    top.appendChild(quotaBox);

    const stats = el('div', 'dw-stats');
    this.waveEl = el('div', 'dw-wave', 'Wave 1');
    this.strikesEl = el('div', 'dw-strikes', 'Strikes: 0 / 3');
    this.techPointsEl = el('div', 'dw-tech-points', 'Tech: 0');
    stats.append(this.waveEl, this.strikesEl, this.techPointsEl);
    top.appendChild(stats);

    const techToggleBtn = el('button', 'dw-btn dw-tech-toggle', 'Tech Tree');
    techToggleBtn.addEventListener('click', () => this._toggleTechPanel());
    top.appendChild(techToggleBtn);

    const pauseBtn = el('button', 'dw-btn dw-pause-btn', 'Pause');
    pauseBtn.addEventListener('click', () => this.callbacks.onPause?.());
    top.appendChild(pauseBtn);

    hud.appendChild(top);
    hud.appendChild(this._buildPalette());

    const stockpile = el('div', 'dw-stockpile');
    stockpile.appendChild(el('div', 'dw-panel-title', 'Stockpile'));
    this.stockpileList = el('div', 'dw-stockpile-list');
    stockpile.appendChild(this.stockpileList);
    hud.appendChild(stockpile);

    hud.appendChild(this._buildTechPanel());

    this.root.appendChild(hud);
    this.hud = hud;
  }

  _buildPalette() {
    const palette = el('div', 'dw-palette');
    const flatTypes = Object.keys(BUILDING_DEFS);
    const groups = new Map();
    for (const [type, def] of Object.entries(BUILDING_DEFS)) {
      if (!groups.has(def.category)) groups.set(def.category, []);
      groups.get(def.category).push([type, def]);
    }

    for (const [category, entries] of groups) {
      const section = el('div', 'dw-palette-section');
      section.appendChild(el('div', 'dw-palette-category', category));
      const row = el('div', 'dw-palette-row');
      for (const [type, def] of entries) {
        const badgeIndex = flatTypes.indexOf(type);
        row.appendChild(this._buildPaletteButton(type, def.name, formatCost(def.cost), badgeIndex));
      }
      section.appendChild(row);
      palette.appendChild(section);
    }

    // Bulldoze is a tool, not a BUILDING_DEFS entry, but shares the same
    // selection mechanism (state.selectedBuildingType) via input.js.
    const toolSection = el('div', 'dw-palette-section');
    toolSection.appendChild(el('div', 'dw-palette-category', 'tools'));
    const toolRow = el('div', 'dw-palette-row');
    toolRow.appendChild(this._buildPaletteButton(BULLDOZE_TOOL, 'Remove', 'no refund', -1, 'dw-bulldoze'));
    toolSection.appendChild(toolRow);
    palette.appendChild(toolSection);

    return palette;
  }

  _buildPaletteButton(type, name, subLabel, badgeIndex, extraClass = '') {
    const btn = el('button', `dw-palette-btn ${extraClass}`.trim());
    btn.dataset.type = type;
    if (badgeIndex >= 0 && badgeIndex < 9) {
      btn.appendChild(el('div', 'dw-palette-badge', String(badgeIndex + 1)));
    }
    btn.appendChild(el('div', 'dw-palette-name', name));
    btn.appendChild(el('div', 'dw-palette-cost', subLabel));
    btn.addEventListener('click', () => this.callbacks.onSelectBuilding?.(type));
    this.paletteButtons.set(type, btn);
    return btn;
  }

  _buildTechPanel() {
    const panel = el('div', 'dw-tech-panel');
    panel.hidden = true;
    panel.appendChild(el('div', 'dw-panel-title', 'Tech Tree'));
    this.techList = el('div', 'dw-tech-list');
    for (const tech of TECH_TREE) {
      const row = el('div', 'dw-tech-row');
      row.appendChild(el('div', 'dw-tech-name', tech.name));
      row.appendChild(el('div', 'dw-tech-desc', tech.description || ''));
      const footer = el('div', 'dw-tech-footer');
      footer.appendChild(el('span', 'dw-tech-cost', `${tech.cost} tech`));
      const btn = el('button', 'dw-btn dw-tech-unlock', 'Unlock');
      btn.addEventListener('click', () => this.callbacks.onUnlockTech?.(tech.id));
      footer.appendChild(btn);
      row.appendChild(footer);
      this.techList.appendChild(row);
      this.techRowEls.set(tech.id, { row, btn });
    }
    panel.appendChild(this.techList);
    const closeBtn = el('button', 'dw-btn dw-tech-close', 'Close');
    closeBtn.addEventListener('click', () => this._toggleTechPanel(false));
    panel.appendChild(closeBtn);
    this.techPanel = panel;
    return panel;
  }

  _toggleTechPanel(force) {
    this.techPanel.hidden = force === undefined ? !this.techPanel.hidden : !force;
  }

  // --- Pause / game over screens --------------------------------------------
  _buildPause() {
    const s = el('div', 'dw-screen dw-pause');
    s.appendChild(el('h2', 'dw-title-sm', 'Paused'));
    const resumeBtn = el('button', 'dw-btn dw-btn-primary', 'Resume');
    resumeBtn.addEventListener('click', () => this.callbacks.onResume?.());
    s.appendChild(resumeBtn);
    this.root.appendChild(s);
    this.pauseScreen = s;
  }

  _buildGameOver() {
    const s = el('div', 'dw-screen dw-gameover');
    s.appendChild(el('h1', 'dw-title', 'Island Lost'));
    this.finalScoreEl = el('p', 'dw-final-score', '');
    s.appendChild(this.finalScoreEl);
    this.finalBestEl = el('p', 'dw-final-best', '');
    s.appendChild(this.finalBestEl);
    const again = el('button', 'dw-btn dw-btn-primary', 'Play Again');
    again.addEventListener('click', () => this.callbacks.onPlayAgain?.());
    s.appendChild(again);
    this.root.appendChild(s);
    this.gameOverScreen = s;
  }

  _showGameOver({ score = 0, bestScore = 0, isNewBest = false } = {}) {
    this.finalScoreEl.textContent = `Quotas fulfilled: ${score}`;
    this.finalBestEl.textContent = isNewBest ? `New best! (${bestScore})` : `Best: ${bestScore}`;
    this.finalBestEl.classList.toggle('dw-new-best', !!isNewBest);
  }

  // --- Per-frame refresh -----------------------------------------------
  // Reads only the documented Economy fields (stockpile, techPoints,
  // unlockedTech, currentQuota, quotaTimer, strikes); a quota's per-item
  // delivered progress isn't named explicitly in the contract, so this
  // checks a few plausible field names and falls back to 0.
  update(snapshot) {
    const economy = snapshot.economy || {};
    const quota = economy.currentQuota;

    if (quota) {
      const delivered = quota.delivered ?? quota.progress ?? quota.deliveredQty ?? 0;
      const pct = quota.qty ? Math.min(1, delivered / quota.qty) : 0;
      const itemName = ITEMS[quota.item]?.name ?? quota.item;
      this.quotaLabel.textContent = `Quota: ${delivered}/${quota.qty} ${itemName}`;
      this.quotaBarFill.style.width = `${Math.round(pct * 100)}%`;
      const timeLeft = Math.max(0, (quota.deadline ?? 0) - (economy.quotaTimer ?? 0));
      this.quotaTimeLabel.textContent = `${fmtTime(timeLeft)} left`;
      this.quotaTimeLabel.classList.toggle('dw-urgent', timeLeft < 10);
    } else {
      this.quotaLabel.textContent = 'No active quota';
      this.quotaBarFill.style.width = '0%';
      this.quotaTimeLabel.textContent = '';
    }

    this.strikesEl.textContent = `Strikes: ${economy.strikes ?? 0} / 3`;
    this.waveEl.textContent = `Wave ${(snapshot.waveNumber ?? 0) + 1}`;
    this.techPointsEl.textContent = `Tech: ${economy.techPoints ?? 0}`;

    this._updateStockpile(economy.stockpile || {});
    if (!this.techPanel.hidden) this._updateTechRows(economy);
  }

  _updateStockpile(stockpile) {
    const seen = new Set();
    for (const [itemId, qty] of Object.entries(stockpile)) {
      seen.add(itemId);
      let row = this.itemRows.get(itemId);
      if (!row) {
        row = el('div', 'dw-stockpile-row');
        const swatch = el('span', 'dw-swatch');
        swatch.style.background = ITEMS[itemId]?.color ?? '#888';
        row.appendChild(swatch);
        row.appendChild(el('span', 'dw-stockpile-name', ITEMS[itemId]?.name ?? itemId));
        row.appendChild(el('span', 'dw-stockpile-qty', ''));
        this.stockpileList.appendChild(row);
        this.itemRows.set(itemId, row);
      }
      row.lastChild.textContent = String(qty);
      row.hidden = qty <= 0;
    }
    for (const [itemId, row] of this.itemRows) {
      if (!seen.has(itemId)) row.hidden = true;
    }
  }

  _updateTechRows(economy) {
    const unlocked = economy.unlockedTech;
    const techPoints = economy.techPoints ?? 0;
    for (const tech of TECH_TREE) {
      const refs = this.techRowEls.get(tech.id);
      if (!refs) continue;
      const isUnlocked = unlocked?.has ? unlocked.has(tech.id) : !!unlocked?.[tech.id];
      refs.row.classList.toggle('dw-tech-unlocked', isUnlocked);
      refs.btn.disabled = isUnlocked || techPoints < tech.cost;
      refs.btn.textContent = isUnlocked ? 'Unlocked' : 'Unlock';
    }
  }
}

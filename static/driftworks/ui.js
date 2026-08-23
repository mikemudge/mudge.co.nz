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
import {
  ITEMS, TECH_TREE, RESOURCE_NODE_YIELDS, getRecipeChain,
} from './items.js';
import { BULLDOZE_TOOL } from './input.js';
import { drawResourceKindIcon } from './render.js';

const HOW_TO_PLAY_STEPS = [
  'Place an Extractor on a glowing resource tile (glowing = needed for your current quota).',
  'Lay Conveyors to route it to a Dock — fulfilling quotas earns Tech Points.',
  'Metal runs out fast: route ore through a Processor into a Storage Silo to keep your stockpile topped up for bigger builds.',
  'Watch the edges — cracked tiles will crumble unless you build a Seawall nearby.',
];

// Order + labels for the "Getting Started" checklist (see _buildGettingStarted
// below). main.js keeps its own literal copy of these same three type ids
// for completion-detection/particle-centroid purposes, since that's a
// simulation-facing concern rather than a presentation one - the two lists
// must stay in sync if this ever changes.
const GETTING_STARTED_TYPES = ['extractor', 'processor', 'silo'];
const startsWithVowelSound = (s) => /^[aeiou]/i.test(s);

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
    // Tracks which quota item the chain readout/palette highlight were last
    // built for, so both are only rebuilt on a quota change rather than
    // every frame.
    this._chainItemId = undefined;

    this.root = el('div');
    this.root.id = 'driftworks-ui';
    document.body.appendChild(this.root);

    this._buildStart();
    this._buildHud();
    this._buildPause();
    this._buildGameOver();
    this._buildHowToPlay();

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
    const quotaLabelRow = el('div', 'dw-quota-label-row');
    this.quotaIcon = el('span', 'dw-quota-icon');
    this.quotaIcon.hidden = true;
    this.quotaLabel = el('div', 'dw-quota-label', 'Quota: —');
    quotaLabelRow.append(this.quotaIcon, this.quotaLabel);
    const track = el('div', 'dw-bar-track');
    this.quotaBarFill = el('div', 'dw-bar-fill dw-bar-quota');
    track.appendChild(this.quotaBarFill);
    this.quotaTimeLabel = el('div', 'dw-quota-time', '');
    this.hintLine = el('div', 'dw-hint-line', '');
    this.hintLine.hidden = true;
    this.chainPanel = el('div', 'dw-chain');
    this.chainPanel.hidden = true;
    quotaBox.append(quotaLabelRow, track, this.quotaTimeLabel, this.hintLine, this.chainPanel);
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

    const howToPlayBtn = el('button', 'dw-btn dw-howto-btn', '?');
    howToPlayBtn.title = 'How to Play';
    howToPlayBtn.addEventListener('click', () => this.showHowToPlay());
    top.appendChild(howToPlayBtn);

    const pauseBtn = el('button', 'dw-btn dw-pause-btn', 'Pause');
    pauseBtn.addEventListener('click', () => this.callbacks.onPause?.());
    top.appendChild(pauseBtn);

    hud.appendChild(top);

    // Legend + Getting Started share a left-side column below the topbar so
    // they stack without needing hand-tuned pixel offsets between them (see
    // .dw-left-panels in driftworks.css) - this keeps Getting Started "near"
    // the quota panel above it while staying a visually separate card.
    const leftPanels = el('div', 'dw-left-panels');
    leftPanels.appendChild(this._buildLegend());
    leftPanels.appendChild(this._buildGettingStarted());
    hud.appendChild(leftPanels);

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

  // Always-visible legend mapping each raw resource kind's map icon+color to
  // its name, drawn with the exact same canvas glyphs the map nodes use
  // (render.js's drawResourceKindIcon) so the two stay visually consistent.
  _buildLegend() {
    const legend = el('div', 'dw-legend');
    for (const kind of Object.keys(RESOURCE_NODE_YIELDS)) {
      const row = el('div', 'dw-legend-row');
      const canvas = document.createElement('canvas');
      canvas.className = 'dw-legend-icon';
      canvas.width = 36;
      canvas.height = 36;
      const iconCtx = canvas.getContext('2d');
      drawResourceKindIcon(iconCtx, kind, 18, 18, 14);
      row.appendChild(canvas);
      row.appendChild(el('span', 'dw-legend-name', kind[0].toUpperCase() + kind.slice(1)));
      legend.appendChild(row);
    }
    return legend;
  }

  // --- "Getting Started" checklist -----------------------------------
  // A compact, non-blocking per-run nudge toward the single most important
  // early discovery (route ore -> Processor -> Silo to keep Metal flowing)
  // - distinct from the once-ever "How to Play" modal: main.js resets this
  // every startGame() (see resetGettingStarted) so it reappears each run
  // regardless of whether a *previous* run ever completed it. Completion is
  // a light-touch existence check owned by main.js (it also needs the
  // buildings list to place the completion particle flourish), so this
  // class only renders whatever checked/done state it's given each frame.
  _buildGettingStarted() {
    const card = el('div', 'dw-getting-started');
    card.appendChild(el('div', 'dw-getting-started-title', 'Getting Started'));
    const list = el('ul', 'dw-getting-started-list');
    this.gettingStartedRows = new Map();
    for (const type of GETTING_STARTED_TYPES) {
      const row = el('li', 'dw-getting-started-row');
      row.appendChild(el('span', 'dw-getting-started-check'));
      const name = BUILDING_DEFS[type].name;
      const article = startsWithVowelSound(name) ? 'an' : 'a';
      row.appendChild(el('span', 'dw-getting-started-label', `Place ${article} ${name}`));
      list.appendChild(row);
      this.gettingStartedRows.set(type, row);
    }
    card.appendChild(list);
    this._gettingStartedFading = false;
    this.gettingStartedCard = card;
    return card;
  }

  // Called by main.js on every startGame() - this is per-run state, not the
  // once-ever driftworks_seen_intro flag, so a fresh run always shows the
  // checklist again even if a previous run completed it.
  resetGettingStarted() {
    this._gettingStartedFading = false;
    this.gettingStartedCard.hidden = false;
    this.gettingStartedCard.classList.remove('dw-getting-started-complete');
    for (const row of this.gettingStartedRows.values()) row.classList.remove('dw-getting-started-checked');
  }

  // `done` comes from main.js's own latch (true forever once all three
  // building types have existed at least once this run, even if one is
  // later bulldozed) - once done, this fades the card out and leaves it
  // hidden for the rest of the run rather than re-deriving checked state
  // from `buildings` any further.
  _updateGettingStarted(buildings, done) {
    if (done) {
      if (!this._gettingStartedFading) {
        this._gettingStartedFading = true;
        this.gettingStartedCard.classList.add('dw-getting-started-complete');
        setTimeout(() => { this.gettingStartedCard.hidden = true; }, 650);
      }
      return;
    }
    for (const type of GETTING_STARTED_TYPES) {
      const has = buildings.some((b) => b.type === type);
      this.gettingStartedRows.get(type).classList.toggle('dw-getting-started-checked', has);
    }
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

  // --- How to Play overlay ---------------------------------------------
  // A dismissible overlay reachable at any time via the "?" HUD button.
  // Whether it also auto-opens on a player's first-ever Play click is
  // decided by the caller (main.js, which owns the localStorage gate) -
  // this class just knows how to show/hide the panel itself.
  _buildHowToPlay() {
    const s = el('div', 'dw-howto');
    s.hidden = true;
    const card = el('div', 'dw-howto-card');
    card.appendChild(el('h2', null, 'How to Play'));
    const list = el('ol', 'dw-howto-list');
    for (const step of HOW_TO_PLAY_STEPS) list.appendChild(el('li', null, step));
    card.appendChild(list);
    const closeBtn = el('button', 'dw-btn dw-btn-primary dw-howto-close', 'Got it');
    closeBtn.addEventListener('click', () => this.hideHowToPlay());
    card.appendChild(closeBtn);
    s.appendChild(card);
    this.root.appendChild(s);
    this.howToPlayScreen = s;
  }

  showHowToPlay() {
    this.howToPlayScreen.hidden = false;
  }

  hideHowToPlay() {
    this.howToPlayScreen.hidden = true;
  }

  // --- Per-frame refresh -----------------------------------------------
  // Reads only the documented Economy fields (stockpile, techPoints,
  // unlockedTech, currentQuota, quotaTimer, strikes); a quota's per-item
  // delivered progress isn't named explicitly in the contract, so this
  // checks a few plausible field names and falls back to 0.
  update(snapshot, ghost, gettingStartedDone) {
    const economy = snapshot.economy || {};
    const quota = economy.currentQuota;

    if (quota) {
      const delivered = quota.delivered ?? quota.progress ?? quota.deliveredQty ?? 0;
      const pct = quota.qty ? Math.min(1, delivered / quota.qty) : 0;
      const itemName = ITEMS[quota.item]?.name ?? quota.item;
      this.quotaIcon.style.background = ITEMS[quota.item]?.color ?? '#888';
      this.quotaIcon.hidden = false;
      this.quotaLabel.textContent = `Quota: ${delivered}/${quota.qty} ${itemName}`;
      this.quotaBarFill.style.width = `${Math.round(pct * 100)}%`;
      const timeLeft = Math.max(0, (quota.deadline ?? 0) - (economy.quotaTimer ?? 0));
      this.quotaTimeLabel.textContent = `${fmtTime(timeLeft)} left`;
      this.quotaTimeLabel.classList.toggle('dw-urgent', timeLeft < 10);
      this._updateChain(quota.item);
    } else {
      this.quotaIcon.hidden = true;
      this.quotaLabel.textContent = 'No active quota';
      this.quotaBarFill.style.width = '0%';
      this.quotaTimeLabel.textContent = '';
      this._updateChain(null);
    }

    this.strikesEl.textContent = `Strikes: ${economy.strikes ?? 0} / 3`;
    this.waveEl.textContent = `Wave ${(snapshot.waveNumber ?? 0) + 1}`;
    this.techPointsEl.textContent = `Tech: ${economy.techPoints ?? 0}`;

    this._updateStockpile(economy.stockpile || {});
    this._updateHint(snapshot, ghost);
    this._updateGettingStarted(snapshot.buildings || [], !!gettingStartedDone);
    if (!this.techPanel.hidden) this._updateTechRows(economy);
  }

  // --- Contextual hint line -------------------------------------------
  // Low-noise onboarding nudge derived purely from snapshot state already
  // read elsewhere (buildings list, stockpile) - hidden once the player
  // clearly has things moving so an experienced-looking factory isn't
  // nagged. The one exception is immediate hover feedback: hovering a
  // protected building with a different type selected always explains why
  // the click will do nothing, regardless of progress.
  _updateHint(snapshot, ghost) {
    if (ghost && ghost.mode === 'replace' && ghost.blockedProtected) {
      this.hintLine.textContent = 'Use the Remove tool to clear this first.';
      this.hintLine.hidden = false;
      return;
    }

    const buildings = snapshot.buildings || [];
    const stockpile = (snapshot.economy || {}).stockpile || {};
    let text = '';
    if (buildings.length === 0) {
      text = 'Place an Extractor on a glowing tile to start production.';
    } else if (!buildings.some((b) => b.type === 'dock')) {
      text = 'Place a Dock, then connect it with Conveyors.';
    } else {
      const metal = stockpile.metal ?? 0;
      const hasProcessor = buildings.some((b) => b.type === 'processor');
      const hasSilo = buildings.some((b) => b.type === 'silo');
      if (metal < 10 && !hasProcessor && !hasSilo) {
        // Kept short (fits one line even on a narrow phone topbar) so it
        // doesn't grow the HUD's topbar and disturb the mobile layout fix
        // in the @media (max-width: 720px) block below.
        text = 'Metal runs low — route ore through a Processor into a Silo.';
      }
    }
    this.hintLine.textContent = text;
    this.hintLine.hidden = !text;
  }

  // --- Recipe chain readout ---------------------------------------------
  // For a processed/assembled quota item, shows the full crafting path
  // (item <- building <- inputs, recursively down to raw goods) right in
  // the quota panel, and mirrors which building type(s) it needs onto the
  // build-palette buttons - closing the loop from "what do I need" to "what
  // do I build" without sending the player to the Tech Tree. Raw-item
  // quotas are untouched: getRecipeChain returns raw: true immediately and
  // this hides the panel exactly as before this feature existed. Only
  // rebuilt when the quota's item actually changes, not every frame.
  _updateChain(itemId) {
    if (itemId === this._chainItemId) return;
    this._chainItemId = itemId;

    this.chainPanel.textContent = '';
    const chain = itemId ? getRecipeChain(itemId) : null;
    const neededBuildings = new Set();

    if (chain && !chain.raw) {
      this._appendChainRows(chain, 0, neededBuildings);
      this.chainPanel.hidden = false;
    } else {
      this.chainPanel.hidden = true;
    }

    for (const [type, btn] of this.paletteButtons) {
      btn.classList.toggle('dw-quota-needed', neededBuildings.has(type));
    }
  }

  // One row per crafted step: "<Item>  <-  <Building>  <-  <Input, Input>",
  // indented per recursion depth; branches (an assembler recipe's two
  // distinct inputs) each get their own sub-row directly below, so a
  // two-input chain like Bio-Gel reads as three short rows rather than one
  // long one.
  _appendChainRows(chain, depth, neededBuildings) {
    if (chain.raw) return;
    neededBuildings.add(chain.building);

    const row = el('div', 'dw-chain-row');
    row.style.paddingLeft = `${depth * 12}px`;
    const swatch = el('span', 'dw-chain-swatch');
    swatch.style.background = ITEMS[chain.item]?.color ?? '#888';
    row.appendChild(swatch);
    row.appendChild(el('span', 'dw-chain-name', ITEMS[chain.item]?.name ?? chain.item));
    row.appendChild(el('span', 'dw-chain-arrow', '←'));
    row.appendChild(el('span', 'dw-chain-building', BUILDING_DEFS[chain.building]?.name ?? chain.building));
    row.appendChild(el('span', 'dw-chain-arrow', '←'));
    const inputNames = chain.inputs.map((input) => ITEMS[input.item]?.name ?? input.item).join(' + ');
    row.appendChild(el('span', 'dw-chain-inputs', inputNames));
    this.chainPanel.appendChild(row);

    for (const input of chain.inputs) this._appendChainRows(input, depth + 1, neededBuildings);
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

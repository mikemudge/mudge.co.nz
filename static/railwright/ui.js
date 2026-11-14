// DOM overlay for Railwright: HUD, build bar, schedule editor, contract
// board, train roster, site/station inspector, upgrades, toasts, help and
// game-over screen. Never mutates simulation state directly - only reads
// game/world/network/economy/trains and calls the documented command
// methods (network.*, economy.acceptContract, economy.buyTech,
// trainManager.*). Shared interaction fields on `game` (tool, selection,
// camera, speed, paused, helpOpen, showMinimap, showBlocks,
// trackGhost, hoverTile, stationHover) are read here and occasionally
// written here (selection, tool, helpOpen) exactly as input.js does - see
// input.js's header comment for why that's the coordination model.
//
// Every panel refresh is wrapped in try/catch: a throwing panel must never
// take the game loop down with it.
import {
  ITEMS, LOCOS, WAGONS, SITE_KINDS, TECHS, SEASONS, MILESTONES,
  TRACK_COST, SIGNAL_COST, STATION_COST,
  LOAN_AMOUNT, LOAN_DAILY_INTEREST_RATE, LOAN_MAX_COUNT, CONTRACT_ABANDON_PENALTY_MULT,
} from './constants.js';
import { formatMoney, formatTime, toXY } from './utils.js';
import { setGameSpeed, TOOLS } from './input.js';
import { centerOn, clampCamera } from './render.js';
// trains.js's schedule-editing and pricing helpers are plain exported
// functions that mutate the `train` object handed to them (not methods on a
// trainManager), and costOf() only quotes a price - economy.spend() is the
// actual charge. reverse() is renamed to avoid shadowing Array#reverse.
import { setSchedule as setTrainSchedule, reverse as reverseTrain, costOf as trainCostOf } from './trains.js';

// DESIGN.md values not in this agent's confirmed constants.js export list -
// defined locally rather than risking an import that doesn't exist.
const SITE_STOCK_CAP = 240;
const DISPATCH_FEE = 250;
const BANKRUPTCY_FLOOR = -5000;
const ERA_REVENUE_THRESHOLDS = [0, 60000, 250000];
const LEDGER_LABELS = {
  delivery: 'Delivery', contracts: 'Contracts', milestones: 'Milestones', other: 'Other',
  loans: 'Loan drawn', assetSales: 'Asset sale',
  locoUpkeep: 'Loco upkeep', wagonUpkeep: 'Wagon upkeep', trackUpkeep: 'Track upkeep',
  construction: 'Construction', purchases: 'Purchases', penalties: 'Penalties', repairs: 'Repairs',
  loanInterest: 'Loan interest', loanRepayment: 'Loan repayment',
};

const TOOL_INFO = {
  inspect: { label: 'Inspect', key: '1' },
  track: { label: 'Track', key: '2' },
  signal: { label: 'Signal', key: '3' },
  station: { label: 'Station', key: '4' },
  bulldoze: { label: 'Bulldoze', key: '5' },
  wire: { label: 'Wire', key: '6' },
};

const STOP_ACTIONS = [
  { value: 'load', label: 'Load' },
  { value: 'load_full', label: 'Load full' },
  { value: 'unload', label: 'Unload' },
  { value: 'unload_all', label: 'Unload all' },
  { value: 'wait', label: 'Wait' },
];

const TOAST_TTL = 6000;
const UTIL_TIME_CONSTANT = 30; // game-seconds, exponential smoothing window

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text !== undefined) e.textContent = text;
  return e;
}

function opt(value, label) {
  const o = document.createElement('option');
  o.value = value;
  o.textContent = label;
  return o;
}

// --- Defensive accessors ----------------------------------------------------
// Sim modules are built in parallel and may not have every field wired up
// yet (or may store a collection as a Map, plain object, or array) - these
// normalise reads so one missing/odd-shaped field can't crash a panel.
function asArray(src) {
  if (!src) return [];
  if (src instanceof Map) return [...src.values()];
  if (Array.isArray(src)) return src;
  return Object.values(src);
}

function getSites(game) {
  return asArray(game.world?.sites);
}

function getStations(game) {
  // network.js is the module that actually owns the stations Map
  // (network.buildStation populates it); game.stations (DESIGN.md §10) is
  // expected to be the same reference, but fall back to it either way.
  return asArray(game.stations ?? game.network?.stations);
}

function getContracts(game) {
  const econ = game.economy;
  if (econ && typeof econ.getBoard === 'function' && typeof econ.getActive === 'function') {
    return [...econ.getBoard(), ...econ.getActive()];
  }
  return asArray(econ?.contracts);
}

function getTrains(game) {
  // trainManager.trains is the live authoritative array in trains.js;
  // game.trains (DESIGN.md §10) is expected to be the same reference, but
  // fall back to it if trainManager isn't wired up yet.
  const list = game.trainManager?.trains ?? game.trains;
  return Array.isArray(list) ? list : [];
}

function findStation(game, stationId) {
  return getStations(game).find((s) => s.id === stationId) || null;
}

function findSite(game, siteId) {
  if (siteId == null) return null;
  if (typeof game.world?.getSite === 'function') return game.world.getSite(siteId);
  return getSites(game).find((s) => s.id === siteId) || null;
}

function siteName(game, siteId) {
  return findSite(game, siteId)?.name || siteId || '—';
}

function itemLabel(id) {
  if (id == null) return '';
  return ITEMS[id]?.name || id;
}

// Cargo/stock quantities accumulate in fractional amounts every tick
// (LOAD_RATE * dt) - round only where they're shown to a player, never in
// the underlying sim state.
function roundQty(qty) {
  return Math.round(qty || 0);
}

function getEra(game) {
  return game.economy?.era ?? 0;
}

function getLifetimeRevenue(game) {
  // Prefer economy.getEraProgress() (see _refreshHudEra); this is only the
  // fallback if that accessor isn't present.
  return game.economy?.lifetimeRevenue ?? game.economy?.revenue ?? 0;
}

function getUnlockedTechs(game) {
  const u = game.economy?.unlockedTechs;
  if (!u) return new Set();
  if (u instanceof Set) return u;
  if (Array.isArray(u)) return new Set(u);
  return new Set(Object.keys(u).filter((k) => u[k]));
}

export class UI {
  constructor(game) {
    this.game = game;
    this._todayDelta = 0;
    this._toasts = [];
    this._utilisation = new Map(); // trainId -> 0..1 EMA
    this._pickingStopFor = null; // trainId while "pick on map" is armed
    this._open = {
      contracts: false, roster: false, upgrades: false, ledger: false,
    };
    this._buyWagons = ['hopper'];
    this._buyLoco = Object.keys(LOCOS)[0];

    this.root = el('div');
    this.root.id = 'railwright-ui';
    document.body.appendChild(this.root);

    this._buildHud();
    this._buildBuildBar();
    this._buildBannerStack();
    this._buildStalledBanner();
    this._buildDistressBanner();
    this._buildRushBanner();
    this._buildToasts();
    this._buildLedger();
    this._buildContracts();
    this._buildRoster();
    this._buildUpgrades();
    this._buildInspector();
    this._buildSchedule();
    this._buildHelp();
    this._buildIntro();
    this._buildGameOver();

    this._onEscape = () => this._handleEscape();
    window.addEventListener('railwright:escape', this._onEscape);

    this._unsubs = [];
    this._subscribeBus();

    this._refreshContracts();
    this._refreshRoster();
    this._refreshUpgrades();
    this._syncToolButtons();
    this._syncPanelVisibility();

    if (!this._hasSeenIntro()) this.showIntro();
  }

  destroy() {
    window.removeEventListener('railwright:escape', this._onEscape);
    for (const off of this._unsubs) { try { off(); } catch { /* ignore */ } }
    this.root.remove();
  }

  // --- Bus wiring ------------------------------------------------------------
  _on(name, fn) {
    const bus = this.game.bus;
    if (!bus?.on) return;
    const off = bus.on(name, (payload) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`railwright ui: listener for "${name}" failed`, err);
      }
    });
    this._unsubs.push(off || (() => bus.off?.(name, fn)));
  }

  _subscribeBus() {
    this._on('toast', (p) => this._pushToast(p.text, p.kind));
    this._on('money:changed', (p) => { this._todayDelta += p.delta || 0; this._refreshHudMoney(); });
    this._on('day:ended', () => { this._todayDelta = 0; this._refreshHudMoney(); });
    this._on('day:settled', (p) => { this._lastSettlement = p; });
    this._on('era:changed', () => { this._refreshHudEra(); this._refreshUpgrades(); this._refreshBuyForm(); });
    this._on('track:built', () => { this._refreshInspector(); });
    this._on('station:built', () => { this._refreshRoster(); this._refreshInspector(); this._refreshSchedule(); });
    this._on('train:bought', () => this._refreshRoster());
    this._on('train:no_route', (p) => {
      this._refreshRoster();
      const train = getTrains(this.game).find((t) => t.id === p.trainId);
      if (train) this._pushToast(this._describeStall(train), 'warn');
    });
    this._on('train:broken', (p) => this._pushToast(`A train has broken down (#${p.trainId}).`, 'bad'));
    this._on('train:deadlock', (p) => this._handleDeadlock(p.trainIds));
    this._on('contract:offered', () => this._refreshContracts());
    this._on('contract:accepted', () => this._refreshContracts());
    this._on('contract:completed', (p) => {
      this._refreshContracts();
      this._pushToast(`Contract complete! +${formatMoney ? formatMoney(p.reward) : p.reward}`, 'good');
    });
    this._on('contract:failed', (p) => {
      this._refreshContracts();
      this._pushToast(`Contract failed. -${formatMoney ? formatMoney(p.penalty) : p.penalty}`, 'bad');
    });
    this._on('contract:abandoned', (p) => {
      this._refreshContracts();
      this._pushToast(`Contract abandoned. -${formatMoney ? formatMoney(p.penalty) : p.penalty}`, 'warn');
    });
    this._on('train:sold', () => this._refreshRoster());
    this._on('city:grew', (p) => this._pushToast(`${siteName(this.game, p.siteId)} has grown to level ${p.level}.`, 'good'));
    this._on('site:backed_up', (p) => this._pushToast(`${siteName(this.game, p.siteId)} is backed up on ${itemLabel(p.item)}.`, 'warn'));
    this._on('milestone:reached', (p) => {
      const m = (MILESTONES || []).find((x) => x.id === p.milestoneId);
      this._pushToast(`Milestone: ${m?.name || p.milestoneId} (+${formatMoney ? formatMoney(p.reward) : p.reward})`, 'good');
    });
    this._on('tech:bought', () => { this._refreshUpgrades(); this._refreshBuyForm(); });
    this._on('selection:changed', (p) => this._onSelectionChanged(p));
    this._on('game:over', (p) => this._showGameOver(p));
  }

  // --- Cheap per-frame refresh -------------------------------------------
  update(dt, game) {
    this.game = game || this.game;
    try {
      this._refreshHudMoney();
      this._refreshHudClock();
      this._refreshHudSpeed();
      this._syncToolButtons();
      this._refreshBuildCostPreview();
      this._tickUtilisation(dt);
      this._refreshRosterLive();
      this._refreshScheduleLive();
      this._refreshStalledBanner();
      this._refreshDistressBanner();
      this._refreshRushBanner();
      this._refreshContractsLive();
      this._syncPanelPositions();
      if (this._open.ledger) this._refreshLedger();
      this.helpPanel.hidden = !this.game.helpOpen;
      this.mapToggleBtn?.classList.toggle('rw-active', !!this.game.showMinimap);
      this.blockToggleBtn?.classList.toggle('rw-active', !!this.game.showBlocks);
      this._pruneToasts();
    } catch (err) {
      console.error('railwright ui: update() failed', err);
    }
  }

  // ==========================================================================
  // Panel positioning: the HUD wraps to a second row below ~1000px, which
  // pushes it taller than the panels' fixed CSS anchor accounts for. Measure
  // it live and override the anchor from here rather than needing a CSS
  // change (railwright.css isn't owned by this pass).
  // ==========================================================================
  _syncPanelPositions() {
    const hudHeight = this.hud?.getBoundingClientRect().height;
    if (!hudHeight) return;
    const top = `${Math.ceil(hudHeight) + 8}px`;
    if (top === this._lastPanelTop) return;
    this._lastPanelTop = top;
    for (const p of [this.contractsPanel, this.rosterPanel, this.upgradesPanel, this.ledgerPanel]) {
      if (p) p.style.top = top;
    }
  }

  // ==========================================================================
  // Shared banner stack: stalled trains / financial distress / rush contracts
  // all need to be visible unconditionally (never gated behind a panel the
  // player has to think to open), so they share one fixed, centred column
  // instead of each hand-placing itself and risking overlap. All styling
  // below is inline - railwright.css isn't owned by this pass.
  // ==========================================================================
  _buildBannerStack() {
    const stack = el('div', 'rw-banner-stack');
    stack.style.cssText = 'position:fixed; top:8px; left:50%; transform:translateX(-50%); z-index:40;'
      + 'display:flex; flex-direction:column; gap:6px; align-items:center;';
    this.root.appendChild(stack);
    this.bannerStack = stack;
  }

  // ==========================================================================
  // Stalled trains banner (Addendum A2: "the HUD must show a persistent,
  // clickable warning listing every stalled train and why").
  // ==========================================================================
  _buildStalledBanner() {
    const banner = el('div', 'rw-stalled-banner');
    banner.style.cssText = 'background:#3a1f1f; color:#f5e6e6; border:1px solid #a33; border-radius:8px;'
      + 'padding:6px 10px; font:13px/1.4 sans-serif; max-width:560px; box-shadow:0 2px 8px rgba(0,0,0,0.35);';
    banner.hidden = true;
    const title = el('div', null, 'Stalled trains — click one to jump to it');
    title.style.cssText = 'font-weight:600; margin-bottom:4px;';
    banner.appendChild(title);
    this.stalledList = el('div');
    this.stalledList.style.cssText = 'display:flex; flex-direction:column; gap:2px;';
    banner.appendChild(this.stalledList);
    this.bannerStack.appendChild(banner);
    this.stalledBanner = banner;
    this._stalledSignature = '';
  }

  // ==========================================================================
  // Financial-distress banner (Addendum A2/C2: "the player always knows their
  // way out"). Escalates warning -> grace -> receivership -> bankrupt and
  // always names the concrete escape route(s) still available (loan / sell a
  // train), the grace countdown, or - once receivers are selling trains -
  // says so in plain language (individual forced-sale announcements arrive
  // as toasts, same as a player-initiated sale - see economy.js's sellTrain).
  // ==========================================================================
  _buildDistressBanner() {
    const banner = el('div', 'rw-distress-banner');
    banner.style.cssText = 'color:#fff; border-radius:8px; padding:6px 10px; font:13px/1.4 sans-serif;'
      + 'max-width:560px; box-shadow:0 2px 8px rgba(0,0,0,0.35); text-align:center;';
    banner.hidden = true;
    this.distressText = el('div');
    this.distressText.style.cssText = 'font-weight:600;';
    banner.appendChild(this.distressText);
    this.distressActions = el('div');
    this.distressActions.style.cssText = 'display:flex; gap:6px; justify-content:center; margin-top:4px;';
    banner.appendChild(this.distressActions);
    this.bannerStack.appendChild(banner);
    this.distressBanner = banner;
    this._distressSignature = '';
  }

  _refreshDistressBanner() {
    const econ = this.game.economy;
    const d = econ?.getFinancialDistress ? econ.getFinancialDistress() : null;
    if (!d || d.severity === 'none') { this.distressBanner.hidden = true; this._distressSignature = ''; return; }
    this.distressBanner.hidden = false;
    this.distressBanner.style.background = d.severity === 'critical' ? '#4a1414' : '#4a3414';
    this.distressBanner.style.border = `1px solid ${d.severity === 'critical' ? '#c33' : '#c93'}`;

    const signature = `${d.stage}|${d.canTakeLoan}|${d.sellableTrainCount}|${d.graceDaysRemaining}|${Math.round(d.money)}`;
    if (signature === this._distressSignature) return;
    this._distressSignature = signature;

    const moneyStr = formatMoney ? formatMoney(d.money) : Math.round(d.money);
    let msg;
    if (d.stage === 'receivership') {
      // No loan offered here - canTakeLoan() is false during receivership
      // (see economy.js): the grace period was the window for that.
      msg = `Receivership: the receivers are selling your trains one by one to cover the debt (money is ${moneyStr}) - sell one yourself to end it sooner, or a delivery may still clear the debt.`;
    } else if (d.stage === 'grace') {
      const days = d.graceDaysRemaining ?? 0;
      msg = `Money is ${moneyStr} - receivership begins in ${days} day${days === 1 ? '' : 's'} unless you take a loan or sell a train.`;
    } else if (!d.hasEscapeRoute) {
      msg = `Bankrupt soon at ${moneyStr}: no loan and nothing left to sell.`;
    } else if (d.canTakeLoan && d.sellableTrainCount > 0) {
      msg = `Money is ${moneyStr} - take out a loan or sell a train before it's too late.`;
    } else if (d.canTakeLoan) {
      msg = `Money is ${moneyStr} - take out a loan before it's too late.`;
    } else {
      msg = `Money is ${moneyStr} - sell a train before it's too late.`;
    }
    this.distressText.textContent = msg;

    this.distressActions.textContent = '';
    if (d.canTakeLoan) {
      const btn = el('button', 'rw-btn rw-btn-accent', 'Take Loan');
      btn.addEventListener('click', () => {
        try {
          if (!this.game.economy?.takeLoan?.()) this._pushToast('No loan available right now.', 'bad');
          else this._openPanel('ledger');
        } catch (err) { console.error('takeLoan failed', err); }
      });
      this.distressActions.appendChild(btn);
    }
    if (d.sellableTrainCount > 0) {
      const btn = el('button', 'rw-btn', 'Sell a Train');
      btn.addEventListener('click', () => this._openPanel('roster'));
      this.distressActions.appendChild(btn);
    }
  }

  // ==========================================================================
  // Rush-contract banner (Addendum A1.2: "a recurring drop-what-you're-doing
  // beat" - must be impossible to miss, so it doesn't wait for the Contract
  // Board panel to be open).
  // ==========================================================================
  _buildRushBanner() {
    const banner = el('div', 'rw-rush-banner');
    banner.style.cssText = 'background:#3a2a12; color:#ffe9c2; border:1px solid #d98a2b; border-radius:8px;'
      + 'padding:6px 10px; font:13px/1.4 sans-serif; max-width:560px; box-shadow:0 2px 10px rgba(0,0,0,0.4);';
    banner.hidden = true;
    const title = el('div', null, 'Rush contract — won\'t stay on the board long');
    title.style.cssText = 'font-weight:700; margin-bottom:4px;';
    banner.appendChild(title);
    this.rushList = el('div');
    this.rushList.style.cssText = 'display:flex; flex-direction:column; gap:4px;';
    banner.appendChild(this.rushList);
    this.bannerStack.appendChild(banner);
    this.rushBanner = banner;
    this._rushRows = new Map(); // contractId -> { rowEl, countdownEl }
  }

  _refreshRushBanner() {
    const econ = this.game.economy;
    const rush = getContracts(this.game).filter((c) => c.rush && c.state === 'offered');
    this.rushBanner.hidden = rush.length === 0;
    const seen = new Set();
    for (const c of rush) {
      let row = this._rushRows.get(c.id);
      if (!row) {
        const rowEl = el('div', 'rw-rush-row');
        rowEl.style.cssText = 'display:flex; align-items:center; gap:10px; justify-content:space-between;';
        const info = el('span', null, `${siteName(this.game, c.fromSiteId)} → ${siteName(this.game, c.toSiteId)} · `
          + `${c.qty} ${itemLabel(c.item)} · +${formatMoney ? formatMoney(c.reward) : c.reward}`);
        const countdownEl = el('span', null, '');
        countdownEl.style.cssText = 'font-weight:800; min-width:40px; text-align:right;';
        const btn = el('button', 'rw-btn rw-btn-accent rw-btn-small', 'Accept');
        btn.addEventListener('click', () => {
          try {
            if (!econ?.acceptContract?.(c.id)) this._pushToast('Could not accept that contract.', 'bad');
          } catch (err) { console.error('acceptContract failed', err); }
        });
        rowEl.append(info, countdownEl, btn);
        this.rushList.appendChild(rowEl);
        row = { rowEl, countdownEl };
        this._rushRows.set(c.id, row);
      }
      const remaining = econ?.getRushRemaining ? econ.getRushRemaining(c.id) : null;
      if (remaining == null) continue;
      seen.add(c.id);
      row.countdownEl.textContent = `${Math.max(0, Math.ceil(remaining))}s`;
      row.countdownEl.style.color = remaining <= 15 ? '#ff6b6b' : '#ffd27a';
    }
    for (const [id, row] of this._rushRows) {
      if (!seen.has(id)) { row.rowEl.remove(); this._rushRows.delete(id); }
    }
  }

  _refreshStalledBanner() {
    const trains = getTrains(this.game).filter((t) => t.state === 'no_route');
    const signature = trains.map((t) => `${t.id}:${t.stallReason || ''}`).join('|');
    this.stalledBanner.hidden = trains.length === 0;
    if (signature === this._stalledSignature) return;
    this._stalledSignature = signature;
    this.stalledList.textContent = '';
    for (const t of trains) {
      const row = el('button');
      row.type = 'button';
      row.style.cssText = 'display:block; width:100%; text-align:left; background:none; border:none;'
        + 'color:inherit; font:inherit; cursor:pointer; padding:2px 0;';
      row.textContent = this._describeStall(t);
      row.addEventListener('click', () => this._jumpToStalledTrain(t));
      this.stalledList.appendChild(row);
    }
  }

  // Builds the "teach the mechanic" message for a stalled train - names the
  // train, the station it can't get out of, and (when the cause is another
  // train occupying the same single-track block) that train too, per
  // Addendum A2's requirement that a stall is never silent.
  _describeStall(train) {
    const stop = train.schedule?.stops?.[train.schedule?.index ?? 0];
    const station = stop ? findStation(this.game, stop.stationId) : null;
    const stationName = station?.name || stop?.stationId || 'its next stop';
    const locoName = LOCOS[train.locoId]?.name || train.name || `Train #${train.id}`;

    if (train.stallReason === 'station track is missing') {
      return `${locoName} can't reach ${stationName} — its track has been removed.`;
    }
    if (train.stallReason === 'schedule points at an unknown station') {
      return `${locoName} has no valid station to head for — check its schedule.`;
    }

    const network = this.game.network;
    let blockerName = null;
    if (network && station && typeof network.blockAt === 'function') {
      const tileIdx = station.tiles?.[0] ?? station.originIdx;
      const blockId = tileIdx != null ? network.blockAt(tileIdx) : null;
      const block = blockId != null ? network.blocks?.get(blockId) : null;
      if (block) {
        const occupantId = [...block.occupants].find((id) => id !== train.id);
        if (occupantId != null) {
          const occupant = getTrains(this.game).find((t) => t.id === occupantId);
          if (occupant) blockerName = LOCOS[occupant.locoId]?.name || occupant.name || `Train #${occupant.id}`;
        }
      }
    }
    if (blockerName) {
      return `${locoName} can't leave ${stationName} — ${blockerName} is using this single-track line. Add a signal or a passing loop.`;
    }
    return `${locoName} is stalled at ${stationName}: ${train.stallReason || 'no route available'}.`;
  }

  _jumpToStalledTrain(train) {
    if (train.headIdx != null) { this._jumpToTrain(train); return; }
    const stop = train.schedule?.stops?.[train.schedule?.index ?? 0];
    const station = stop ? findStation(this.game, stop.stationId) : null;
    const idx = station?.tiles?.[0] ?? station?.originIdx;
    if (idx == null || !this.game.camera || !this.game.canvas) return;
    try {
      const { x, y } = toXY(idx);
      centerOn(this.game.camera, x, y);
      clampCamera(this.game.camera, this.game.canvas);
    } catch (err) {
      console.error('jump-to-stalled-train failed', err);
    }
  }

  // Addendum A2: with Centralised CTC, deadlocks "resolve automatically and
  // free" - no player click required. Falls back to the manual toast if the
  // tech isn't owned, or if the named train can't be found (e.g. sold).
  _handleDeadlock(trainIds = []) {
    if (this.game.economy?.hasTech?.('centralised_ctc')) {
      const train = getTrains(this.game).find((t) => t.id === trainIds[0]);
      if (train) {
        try {
          reverseTrain(train, this.game);
          this._pushToast(`Centralised CTC resolved a deadlock automatically (${train.name || `train #${train.id}`} rerouted).`, 'good');
          return;
        } catch (err) {
          console.error('auto dispatchReverse failed', err);
        }
      }
    }
    this._pushDeadlockToast(trainIds);
  }

  // ==========================================================================
  // HUD bar
  // ==========================================================================
  _buildHud() {
    const hud = el('div', 'rw-hud');

    const money = el('button', 'rw-btn rw-money');
    money.title = 'Show the daily ledger';
    this.moneyEl = el('span', 'rw-money-amount', '$0');
    this.moneyDeltaEl = el('span', 'rw-money-delta', '');
    money.append(this.moneyEl, this.moneyDeltaEl);
    money.addEventListener('click', () => this._togglePanel('ledger'));
    hud.appendChild(money);

    const clock = el('div', 'rw-clock');
    this.dayEl = el('span', 'rw-day', 'Day 1');
    this.seasonEl = el('span', 'rw-season', 'Spring');
    this.timeEl = el('span', 'rw-time', '');
    clock.append(this.dayEl, this.seasonEl, this.timeEl);
    hud.appendChild(clock);

    const era = el('div', 'rw-era');
    era.appendChild(el('span', 'rw-era-label', 'Era I'));
    this.eraLabelEl = era.firstChild;
    const eraTrack = el('div', 'rw-bar-track rw-era-track');
    this.eraFillEl = el('div', 'rw-bar-fill rw-era-fill');
    eraTrack.appendChild(this.eraFillEl);
    era.appendChild(eraTrack);
    hud.appendChild(era);

    const speed = el('div', 'rw-speed');
    this.pauseBtn = el('button', 'rw-btn rw-speed-btn', '⏸');
    this.pauseBtn.title = 'Pause (Space)';
    this.pauseBtn.addEventListener('click', () => setGameSpeed(this.game, this.game.paused ? 1 : 0));
    speed.appendChild(this.pauseBtn);
    this.speedBtns = [1, 2, 4].map((n) => {
      const b = el('button', 'rw-btn rw-speed-btn', `${n}×`);
      b.addEventListener('click', () => setGameSpeed(this.game, n));
      speed.appendChild(b);
      return { n, btn: b };
    });
    // Addendum A1.5: "skip to next event" - runs the sim synchronously past
    // the point speed alone can reach (tick() caps gameDt at 0.1s/frame
    // regardless of `speed`), so the player is never stuck watching a clock.
    const skipBtn = el('button', 'rw-btn rw-icon-btn', '⏭');
    skipBtn.title = 'Skip to next event (or up to 1 in-game day)';
    skipBtn.addEventListener('click', () => {
      try {
        this.game.skipToNextEvent?.();
      } catch (err) {
        console.error('skipToNextEvent failed', err);
      }
    });
    speed.appendChild(skipBtn);
    hud.appendChild(speed);

    const toggles = el('div', 'rw-hud-toggles');
    this.mapToggleBtn = el('button', 'rw-btn rw-icon-btn', '🗺');
    this.mapToggleBtn.title = 'Minimap (M)';
    this.mapToggleBtn.addEventListener('click', () => { this.game.showMinimap = !this.game.showMinimap; });
    this.blockToggleBtn = el('button', 'rw-btn rw-icon-btn', '⛌');
    this.blockToggleBtn.title = 'Block overlay (B)';
    this.blockToggleBtn.addEventListener('click', () => { this.game.showBlocks = !this.game.showBlocks; });
    // Addendum A3.1: the seed is always visible (not just on the intro/
    // game-over screens) and clicking it lets the player replay this map or
    // start a fresh one on a chosen seed.
    const seedBtn = el('button', 'rw-btn', `Seed ${this.game.seed}`);
    seedBtn.title = 'Replay this map, share its seed, or start a new game on a chosen seed';
    seedBtn.addEventListener('click', () => this._promptSeed());
    const contractsBtn = el('button', 'rw-btn', 'Contracts');
    contractsBtn.addEventListener('click', () => this._togglePanel('contracts'));
    const rosterBtn = el('button', 'rw-btn', 'Trains');
    rosterBtn.addEventListener('click', () => this._togglePanel('roster'));
    const upgradesBtn = el('button', 'rw-btn', 'Upgrades');
    upgradesBtn.addEventListener('click', () => this._togglePanel('upgrades'));
    const helpBtn = el('button', 'rw-btn rw-icon-btn', '?');
    helpBtn.title = 'Help';
    helpBtn.addEventListener('click', () => { this.game.helpOpen = !this.game.helpOpen; });
    toggles.append(this.mapToggleBtn, this.blockToggleBtn, seedBtn, contractsBtn, rosterBtn, upgradesBtn, helpBtn);
    hud.appendChild(toggles);

    this.root.appendChild(hud);
    this.hud = hud;
  }

  // Prompts for a seed and, if given a valid number, tears down and rebuilds
  // the game on it via main.js's restart(seed) - lets a map be replayed or
  // shared (Addendum A3.1) without a full page reload.
  _promptSeed() {
    const current = this.game.seed;
    const input = window.prompt(
      `Current seed: ${current}\n\nEnter a seed to start a new game on that map, or confirm unchanged to replay this one.`,
      String(current),
    );
    if (input == null) return;
    const trimmed = input.trim();
    if (trimmed === '') return;
    const n = Number(trimmed);
    if (!Number.isFinite(n)) { this._pushToast('Seed must be a number.', 'bad'); return; }
    try {
      window.__railwright?.restart(Math.floor(Math.abs(n)) >>> 0);
    } catch (err) {
      console.error('restart with seed failed', err);
    }
  }

  _refreshHudMoney() {
    const money = this.game.economy?.money ?? 0;
    this.moneyEl.textContent = formatMoney ? formatMoney(money) : `$${Math.round(money)}`;
    this.moneyEl.classList.toggle('rw-money-low', money < BANKRUPTCY_FLOOR / 2);
    const d = this._todayDelta;
    this.moneyDeltaEl.textContent = d === 0 ? '' : `${d > 0 ? '+' : ''}${formatMoney ? formatMoney(d) : Math.round(d)} today`;
    this.moneyDeltaEl.classList.toggle('rw-good', d > 0);
    this.moneyDeltaEl.classList.toggle('rw-bad', d < 0);
  }

  _refreshHudClock() {
    const clock = this.game.world?.clock || {};
    this.dayEl.textContent = `Day ${clock.day ?? 1}`;
    this.seasonEl.textContent = SEASONS?.[clock.season] ?? '';
    this.timeEl.textContent = formatTime ? formatTime(clock.timeOfDay ?? 0) : '';
  }

  _refreshHudSpeed() {
    const { speed, paused } = this.game;
    this.pauseBtn.classList.toggle('rw-active', !!paused);
    this.pauseBtn.textContent = paused ? '▶' : '⏸';
    for (const { n, btn } of this.speedBtns) btn.classList.toggle('rw-active', !paused && speed === n);
  }

  _refreshHudEra() {
    // economy.getEraProgress() is the real accessor when present; falls back
    // to the raw fields (and this module's own copy of the era thresholds)
    // for a sim build that hasn't wired it up yet.
    const progress = this.game.economy?.getEraProgress?.();
    const era = progress?.era ?? getEra(this.game);
    this.eraLabelEl.textContent = `Era ${['I', 'II', 'III'][era] || era + 1}`;
    const lo = ERA_REVENUE_THRESHOLDS[era] ?? 0;
    const hi = progress?.nextThreshold ?? ERA_REVENUE_THRESHOLDS[era + 1] ?? lo + 1;
    const rev = progress?.revenue ?? getLifetimeRevenue(this.game);
    const pct = hi > lo ? Math.min(1, Math.max(0, (rev - lo) / (hi - lo))) : 1;
    this.eraFillEl.style.width = `${Math.round(pct * 100)}%`;
  }

  // ==========================================================================
  // Build bar
  // ==========================================================================
  _buildBuildBar() {
    const bar = el('div', 'rw-buildbar');
    this.toolBtns = new Map();
    for (const tool of TOOLS) {
      const info = TOOL_INFO[tool] || { label: tool, key: '' };
      const btn = el('button', 'rw-btn rw-tool-btn');
      btn.appendChild(el('div', 'rw-tool-key', info.key));
      btn.appendChild(el('div', 'rw-tool-label', info.label));
      const cost = el('div', 'rw-tool-cost', '');
      btn.appendChild(cost);
      btn.addEventListener('click', () => { this.game.tool = tool; });
      bar.appendChild(btn);
      this.toolBtns.set(tool, { btn, cost });
    }
    this.root.appendChild(bar);
    this.buildBar = bar;
  }

  _syncToolButtons() {
    for (const [tool, { btn }] of this.toolBtns) btn.classList.toggle('rw-active', this.game.tool === tool);
  }

  _refreshBuildCostPreview() {
    const track = this.toolBtns.get('track');
    if (track) {
      const plan = this.game.trackGhost;
      track.cost.textContent = plan ? `${formatMoney ? formatMoney(plan.totalCost) : plan.totalCost}` : `from ${TRACK_COST?.plain ?? '?'}`;
      track.cost.classList.toggle('rw-bad', !!(plan && !plan.legal));
    }
    const signal = this.toolBtns.get('signal');
    if (signal) signal.cost.textContent = `${SIGNAL_COST ?? '?'}`;
    const station = this.toolBtns.get('station');
    if (station) {
      const hover = this.game.stationHover;
      station.cost.textContent = `${STATION_COST ?? '?'}`;
      station.cost.classList.toggle('rw-good', !!hover?.valid);
    }
  }

  // ==========================================================================
  // Toasts
  // ==========================================================================
  _buildToasts() {
    this.toastStack = el('div', 'rw-toasts');
    this.root.appendChild(this.toastStack);
  }

  _pushToast(text, kind = 'info') {
    const row = el('div', `rw-toast rw-toast-${kind}`);
    row.appendChild(el('span', null, text));
    const close = el('button', 'rw-toast-close', '×');
    close.addEventListener('click', () => row.remove());
    row.appendChild(close);
    this.toastStack.appendChild(row);
    this._toasts.push({ el: row, expires: Date.now() + TOAST_TTL });
  }

  _pushDeadlockToast(trainIds = []) {
    const fee = this.game.economy?.getDispatchFee?.() ?? DISPATCH_FEE;
    const row = el('div', 'rw-toast rw-toast-warn rw-toast-deadlock');
    row.appendChild(el('span', null, `Deadlock: ${trainIds.length} train(s) stuck.`));
    for (const id of trainIds) {
      const btn = el('button', 'rw-btn rw-toast-action', fee > 0 ? `Reverse #${id} ($${fee})` : `Reverse #${id}`);
      btn.addEventListener('click', () => {
        try {
          const ok = this._dispatchReverse(id);
          if (!ok) this._pushToast('Could not dispatch that train.', 'bad');
          row.remove();
        } catch (err) {
          console.error('dispatchReverse failed', err);
        }
      });
      row.appendChild(btn);
    }
    const close = el('button', 'rw-toast-close', '×');
    close.addEventListener('click', () => row.remove());
    row.appendChild(close);
    this.toastStack.appendChild(row);
    this._toasts.push({ el: row, expires: Date.now() + TOAST_TTL * 3 });
  }

  _pruneToasts() {
    const now = Date.now();
    this._toasts = this._toasts.filter((t) => {
      if (now < t.expires) return true;
      t.el.remove();
      return false;
    });
  }

  // ==========================================================================
  // Panel show/hide plumbing
  // ==========================================================================
  // Contracts/Roster/Upgrades/Ledger all anchor to the same top corners (see
  // railwright.css) - mutually exclusive keeps that simple and self-similar
  // at any viewport size instead of hand-placing four distinct positions.
  _togglePanel(name) {
    if (this._open[name]) {
      this._open[name] = false;
      this._syncPanelVisibility();
    } else {
      this._openPanel(name);
    }
  }

  // Force-opens a panel regardless of current state - used by the distress
  // banner's "Take Loan"/"Sell a Train" shortcuts so a click always lands
  // somewhere useful instead of toggling an already-open panel shut.
  _openPanel(name) {
    for (const key of Object.keys(this._open)) this._open[key] = false;
    this._open[name] = true;
    this._syncPanelVisibility();
  }

  _syncPanelVisibility() {
    this.contractsPanel.hidden = !this._open.contracts;
    this.rosterPanel.hidden = !this._open.roster;
    this.upgradesPanel.hidden = !this._open.upgrades;
    this.ledgerPanel.hidden = !this._open.ledger;
    if (this._open.ledger) this._refreshLedger();
  }

  _handleEscape() {
    if (this.game.helpOpen) { this.game.helpOpen = false; return; }
    if (this.game.selection?.kind) {
      this.game.selection = { kind: null, id: null };
      this.game.bus?.emit?.('selection:changed', { kind: null, id: null });
      return;
    }
    for (const name of ['contracts', 'roster', 'upgrades', 'ledger']) {
      if (this._open[name]) { this._open[name] = false; this._syncPanelVisibility(); return; }
    }
  }

  // ==========================================================================
  // Daily ledger - DESIGN.md §8: "the player must be able to see why they
  // are losing money." economy.getLedger() is today's running categories;
  // economy.getLedgerHistory() (newest first) backs the "yesterday" row.
  // ==========================================================================
  _buildLedger() {
    const p = el('div', 'rw-panel rw-panel-ledger');
    p.hidden = true;
    const head = el('div', 'rw-panel-head');
    head.appendChild(el('div', 'rw-panel-title', 'Finances'));
    const closeBtn = el('button', 'rw-panel-close', '×');
    closeBtn.addEventListener('click', () => this._togglePanel('ledger'));
    head.appendChild(closeBtn);
    p.appendChild(head);
    this.ledgerBody = el('div', 'rw-ledger-body');
    p.appendChild(this.ledgerBody);

    // ---- Loans (Addendum A2: "broke" must always have a visible exit) ----
    p.appendChild(el('div', 'rw-panel-subtitle', 'Loans'));
    this.loansBody = el('div');
    this.loansBody.style.cssText = 'display:flex; flex-direction:column; gap:6px; margin-bottom:8px;';
    p.appendChild(this.loansBody);
    this.takeLoanBtn = el('button', 'rw-btn rw-btn-accent', `Take Loan (${formatMoney ? formatMoney(LOAN_AMOUNT) : LOAN_AMOUNT} @ ${Math.round(LOAN_DAILY_INTEREST_RATE * 100)}%/day)`);
    this.takeLoanBtn.style.cssText = 'width:100%;';
    this.takeLoanBtn.addEventListener('click', () => {
      try {
        if (!this.game.economy?.takeLoan?.()) this._pushToast('No loan available right now.', 'bad');
        else this._refreshLoans();
      } catch (err) { console.error('takeLoan failed', err); }
    });
    p.appendChild(this.takeLoanBtn);

    this.root.appendChild(p);
    this.ledgerPanel = p;
  }

  _refreshLedger() {
    if (this.ledgerPanel.hidden) return;
    try {
      this.ledgerBody.textContent = '';
      const ledger = this.game.economy?.getLedger?.();
      if (!ledger) { this.ledgerBody.appendChild(el('div', 'rw-empty', 'No ledger yet.')); return; }
      this.ledgerBody.appendChild(el('div', 'rw-panel-subtitle', `Day ${ledger.day} (running)`));
      let revenue = 0;
      for (const [key, amount] of Object.entries(ledger.revenue || {})) {
        revenue += amount;
        if (amount > 0) this._appendLedgerRow(LEDGER_LABELS[key] || key, amount, 'good');
      }
      let costs = 0;
      for (const [key, amount] of Object.entries(ledger.costs || {})) {
        costs += amount;
        if (amount > 0) this._appendLedgerRow(LEDGER_LABELS[key] || key, -amount, 'bad');
      }
      this._appendLedgerRow('Net', revenue - costs, revenue >= costs ? 'good' : 'bad', true);
    } catch (err) {
      console.error('railwright ui: ledger refresh failed', err);
    }
    this._refreshLoans();
  }

  // Per-loan principal/interest breakdown + a partial-or-full repay control,
  // so the 6%/day compounding is legible enough to actually inform whether
  // to repay now or keep building. Rebuilt whenever the panel is visible -
  // loans are few, so a full rebuild each refresh is cheap.
  _refreshLoans() {
    const econ = this.game.economy;
    this.loansBody.textContent = '';
    const loans = econ?.getLoans ? econ.getLoans() : [];
    if (!loans.length) {
      this.loansBody.appendChild(el('div', 'rw-empty', 'No loans outstanding.'));
    }
    for (const loan of loans) {
      const row = el('div', 'rw-loan-row');
      row.style.cssText = 'display:flex; flex-direction:column; gap:3px; border:1px solid rgba(128,128,128,0.4); border-radius:6px; padding:6px;';
      row.appendChild(el('div', null, `Principal ${formatMoney ? formatMoney(loan.principal) : loan.principal} + interest ${formatMoney ? formatMoney(loan.interestOwed) : loan.interestOwed}`));
      row.appendChild(el('div', 'rw-bad', `Owed: ${formatMoney ? formatMoney(loan.owed) : loan.owed} (day ${loan.issuedDay})`));
      const actions = el('div');
      actions.style.cssText = 'display:flex; gap:4px; align-items:center; flex-wrap:wrap;';
      const amountInput = document.createElement('input');
      amountInput.type = 'number';
      amountInput.name = `repay-${loan.id}`;
      amountInput.min = '0';
      amountInput.step = '100';
      amountInput.value = String(Math.ceil(loan.owed));
      amountInput.style.cssText = 'width:70px;';
      const repayBtn = el('button', 'rw-btn rw-btn-small', 'Repay');
      repayBtn.addEventListener('click', () => {
        const paid = econ.repayLoan(loan.id, Number(amountInput.value) || 0);
        if (paid <= 0) this._pushToast('Nothing repaid - check the amount and your cash on hand.', 'bad');
        this._refreshLoans();
      });
      const repayFullBtn = el('button', 'rw-btn rw-btn-small rw-btn-accent', 'Repay Full');
      repayFullBtn.addEventListener('click', () => {
        const paid = econ.repayLoan(loan.id, loan.owed);
        if (paid <= 0) this._pushToast('Not enough money to repay in full.', 'bad');
        this._refreshLoans();
      });
      actions.append(amountInput, repayBtn, repayFullBtn);
      row.appendChild(actions);
      this.loansBody.appendChild(row);
    }
    const canTake = econ?.canTakeLoan ? econ.canTakeLoan() : false;
    this.takeLoanBtn.disabled = !canTake;
    this.takeLoanBtn.title = canTake ? '' : (loans.length >= LOAN_MAX_COUNT ? `Maximum ${LOAN_MAX_COUNT} loans outstanding.` : 'Only available once money is low.');
  }

  _appendLedgerRow(label, amount, kind, strong = false) {
    const row = el('div', `rw-ledger-row${strong ? ' rw-ledger-net' : ''}`);
    row.appendChild(el('span', 'rw-ledger-label', label));
    const value = el('span', `rw-ledger-value rw-${kind}`, `${amount >= 0 ? '+' : ''}${formatMoney ? formatMoney(amount) : Math.round(amount)}`);
    row.appendChild(value);
    this.ledgerBody.appendChild(row);
  }

  // ==========================================================================
  // Contract board
  // ==========================================================================
  _buildContracts() {
    const p = el('div', 'rw-panel rw-panel-contracts');
    p.hidden = true;
    const head = el('div', 'rw-panel-head');
    head.appendChild(el('div', 'rw-panel-title', 'Contract Board'));
    const closeBtn = el('button', 'rw-panel-close', '×');
    closeBtn.addEventListener('click', () => this._togglePanel('contracts'));
    head.appendChild(closeBtn);
    p.appendChild(head);
    this.contractsList = el('div', 'rw-contracts-list');
    p.appendChild(this.contractsList);
    this.root.appendChild(p);
    this.contractsPanel = p;
  }

  _refreshContracts() {
    try {
      this.contractsList.textContent = '';
      this._contractRushEls = new Map(); // contractId -> countdown span, for the per-frame live update below
      const contracts = getContracts(this.game);
      const day = this.game.world?.clock?.day ?? 1;
      if (!contracts.length) {
        this.contractsList.appendChild(el('div', 'rw-empty', 'No contracts yet.'));
        return;
      }
      for (const c of contracts) {
        const row = el('div', `rw-contract rw-tier-${c.tier || 'bronze'}`);
        if (c.rush && c.state === 'offered') {
          row.style.outline = '2px solid #d98a2b';
          row.style.outlineOffset = '2px';
        }
        const top = el('div', 'rw-contract-top');
        top.appendChild(el('span', 'rw-contract-tier', c.rush ? 'RUSH' : (c.tier || 'bronze').toUpperCase()));
        top.appendChild(el('span', 'rw-contract-route', `${siteName(this.game, c.fromSiteId)} → ${siteName(this.game, c.toSiteId)}`));
        row.appendChild(top);
        row.appendChild(el('div', 'rw-contract-item', `${c.qty} ${itemLabel(c.item)}`));
        const track = el('div', 'rw-bar-track');
        const fill = el('div', 'rw-bar-fill rw-bar-contract');
        fill.style.width = `${c.qty ? Math.min(100, Math.round((100 * (c.delivered || 0)) / c.qty)) : 0}%`;
        track.appendChild(fill);
        row.appendChild(track);
        const footer = el('div', 'rw-contract-footer');
        const daysLeft = (c.deadlineDay ?? day) - day;
        footer.appendChild(el('span', `rw-contract-deadline ${daysLeft <= 1 ? 'rw-urgent' : ''}`,
          c.standing ? 'Standing order' : (daysLeft >= 0 ? `${daysLeft}d left` : 'expired')));
        footer.appendChild(el('span', 'rw-contract-reward', `+${formatMoney ? formatMoney(c.reward) : c.reward}`));
        if (c.rush && c.state === 'offered') {
          const countdown = el('span', 'rw-contract-deadline rw-urgent', '');
          countdown.style.fontWeight = '800';
          footer.appendChild(countdown);
          this._contractRushEls.set(c.id, countdown);
        }
        if (c.state === 'offered') {
          const btn = el('button', 'rw-btn rw-btn-accent', 'Accept');
          btn.addEventListener('click', () => {
            try {
              const ok = this.game.economy?.acceptContract?.(c.id);
              if (!ok) this._pushToast('Could not accept that contract.', 'bad');
            } catch (err) {
              console.error('acceptContract failed', err);
            }
          });
          footer.appendChild(btn);
        } else if (c.state === 'active') {
          // Addendum A2: an impossible-to-complete accepted contract must
          // always have an out, at half the normal failure penalty.
          const abandonCost = Math.round((c.penalty || 0) * CONTRACT_ABANDON_PENALTY_MULT);
          const abandonBtn = el('button', 'rw-btn rw-btn-small rw-btn-danger', `Abandon (-${formatMoney ? formatMoney(abandonCost) : abandonCost})`);
          abandonBtn.addEventListener('click', () => {
            if (!window.confirm(`Abandon this contract for a ${formatMoney ? formatMoney(abandonCost) : abandonCost} penalty?`)) return;
            try {
              const ok = this.game.economy?.abandonContract?.(c.id);
              if (!ok) this._pushToast('Could not abandon that contract.', 'bad');
            } catch (err) {
              console.error('abandonContract failed', err);
            }
          });
          footer.appendChild(abandonBtn);
        }
        row.appendChild(footer);
        this.contractsList.appendChild(row);
      }
    } catch (err) {
      console.error('railwright ui: contract board refresh failed', err);
    }
  }

  // Cheap per-frame companion to _refreshContracts(): keeps the rush
  // countdown live without rebuilding the whole board every frame, and
  // triggers a full rebuild the moment one expires off the board (economy.js
  // expires rush offers silently - no event - so this is the only thing that
  // notices).
  _refreshContractsLive() {
    if (this.contractsPanel.hidden || !this._contractRushEls || !this._contractRushEls.size) return;
    const econ = this.game.economy;
    let anyExpired = false;
    for (const [id, countdownEl] of this._contractRushEls) {
      const remaining = econ?.getRushRemaining ? econ.getRushRemaining(id) : null;
      if (remaining == null) { anyExpired = true; continue; }
      countdownEl.textContent = `${Math.max(0, Math.ceil(remaining))}s`;
    }
    if (anyExpired) this._refreshContracts();
  }

  // ==========================================================================
  // Train roster
  // ==========================================================================
  _buildRoster() {
    const p = el('div', 'rw-panel rw-panel-roster');
    p.hidden = true;
    const head = el('div', 'rw-panel-head');
    head.appendChild(el('div', 'rw-panel-title', 'Train Roster'));
    const closeBtn = el('button', 'rw-panel-close', '×');
    closeBtn.addEventListener('click', () => this._togglePanel('roster'));
    head.appendChild(closeBtn);
    p.appendChild(head);
    this.rosterList = el('div', 'rw-roster-list');
    p.appendChild(this.rosterList);
    p.appendChild(this._buildBuyTrainForm());
    this.root.appendChild(p);
    this.rosterPanel = p;
    this._rosterRows = new Map();
  }

  _buildBuyTrainForm() {
    const form = el('div', 'rw-buy-train');
    form.appendChild(el('div', 'rw-panel-subtitle', 'Buy a train'));
    const locoSelect = document.createElement('select');
    locoSelect.addEventListener('change', () => { this._buyLoco = locoSelect.value; this._refreshBuyForm(); });
    this.locoSelect = locoSelect;
    form.appendChild(locoSelect);
    this._populateLocoOptions(locoSelect);

    this.wagonRow = el('div', 'rw-wagon-row');
    form.appendChild(this.wagonRow);

    this.buyCostEl = el('div', 'rw-buy-cost', '');
    form.appendChild(this.buyCostEl);
    form.appendChild(el('div', 'rw-buy-hint', 'It starts idle - assign a schedule below to place it.'));

    const buyBtn = el('button', 'rw-btn rw-btn-accent', 'Buy Train');
    buyBtn.addEventListener('click', () => {
      if (!this._isLocoUnlocked(this._buyLoco)) {
        this._pushToast('That locomotive is not unlocked yet.', 'bad');
        return;
      }
      const wagonTypes = [...this._buyWagons];
      const cost = trainCostOf ? trainCostOf(this._buyLoco, wagonTypes) : 0;
      try {
        if (this.game.economy?.spend && !this.game.economy.spend(cost, 'purchases')) {
          this._pushToast('Not enough money for that train.', 'bad');
          return;
        }
        const train = this.game.trainManager?.buyTrain?.(this._buyLoco, wagonTypes);
        if (!train) this._pushToast('Could not buy that train.', 'bad');
        else this._refreshRoster();
      } catch (err) {
        console.error('buyTrain failed', err);
      }
    });
    form.appendChild(buyBtn);
    this._refreshBuyForm();
    return form;
  }

  _isLocoUnlocked(locoId) {
    const loco = LOCOS[locoId];
    if (!loco) return false;
    if ((loco.era || 0) > getEra(this.game)) return false;
    if (loco.tech && !getUnlockedTechs(this.game).has(loco.tech)) return false;
    return true;
  }

  // Rebuilds the loco dropdown's options with era/tech gating reflected as a
  // disabled option + a "Requires ..." label (never hidden outright - a
  // dimmed, visible "what's next" is Addendum A1's "always know what's
  // coming" in miniature). Re-run whenever era/tech state can have changed.
  _populateLocoOptions(select) {
    const wanted = select.value || this._buyLoco;
    select.textContent = '';
    for (const [id, def] of Object.entries(LOCOS)) {
      const unlocked = this._isLocoUnlocked(id);
      let label;
      if (!unlocked && (def.era || 0) > getEra(this.game)) {
        label = `${def.name} (Requires Era ${['I', 'II', 'III'][def.era] || def.era + 1})`;
      } else if (!unlocked) {
        label = `${def.name} (Requires ${TECHS?.[def.tech]?.name || def.tech})`;
      } else {
        label = `${def.name} (${formatMoney ? formatMoney(def.cost) : def.cost})`;
      }
      const o = opt(id, label);
      o.disabled = !unlocked;
      select.appendChild(o);
    }
    const stillUnlocked = this._isLocoUnlocked(wanted);
    if (stillUnlocked) {
      select.value = wanted;
    } else {
      const fallback = Object.keys(LOCOS).find((id) => this._isLocoUnlocked(id)) || Object.keys(LOCOS)[0];
      select.value = fallback;
    }
    this._buyLoco = select.value;
  }

  _refreshBuyForm() {
    if (this.locoSelect) this._populateLocoOptions(this.locoSelect);
    const loco = LOCOS[this._buyLoco];
    const max = loco?.maxWagons ?? 0;
    if (this._buyWagons.length > max) this._buyWagons.length = max;
    while (this._buyWagons.length < max) this._buyWagons.push('hopper');
    this.wagonRow.textContent = '';
    for (let i = 0; i < max; i += 1) {
      const sel = document.createElement('select');
      for (const [id, def] of Object.entries(WAGONS)) sel.appendChild(opt(id, def.name));
      sel.value = this._buyWagons[i];
      sel.addEventListener('change', () => { this._buyWagons[i] = sel.value; this._refreshBuyCost(); });
      this.wagonRow.appendChild(sel);
    }
    this._refreshBuyCost();
  }

  _refreshBuyCost() {
    const total = trainCostOf ? trainCostOf(this._buyLoco, this._buyWagons) : 0;
    this.buyCostEl.textContent = `Total: ${formatMoney ? formatMoney(total) : total}`;
  }

  _refreshRoster() {
    try {
      this.rosterList.textContent = '';
      this._rosterRows.clear();
      const trains = getTrains(this.game);
      if (!trains.length) this.rosterList.appendChild(el('div', 'rw-empty', 'No trains yet.'));
      for (const t of trains) {
        const row = el('div', 'rw-roster-row');
        row.dataset.trainId = t.id;
        const nameCol = el('div', 'rw-roster-name');
        nameCol.appendChild(el('div', 'rw-roster-title', t.name || `Train #${t.id}`));
        nameCol.appendChild(el('div', 'rw-roster-loco', LOCOS[t.locoId]?.name || t.locoId || ''));
        row.appendChild(nameCol);
        const stateEl = el('span', 'rw-roster-state', t.state || 'idle');
        row.appendChild(stateEl);
        const cargoEl = el('div', 'rw-roster-cargo', '');
        row.appendChild(cargoEl);
        const incomeEl = el('div', 'rw-roster-income', '');
        row.appendChild(incomeEl);
        const jumpBtn = el('button', 'rw-btn rw-btn-small', 'Jump');
        jumpBtn.addEventListener('click', () => this._jumpToTrain(t));
        row.appendChild(jumpBtn);
        const scheduleBtn = el('button', 'rw-btn rw-btn-small', 'Schedule');
        scheduleBtn.addEventListener('click', () => {
          this.game.selection = { kind: 'train', id: t.id };
          this.game.bus?.emit?.('selection:changed', { kind: 'train', id: t.id });
        });
        row.appendChild(scheduleBtn);
        const sellBtn = el('button', 'rw-btn rw-btn-small rw-btn-danger', 'Sell');
        sellBtn.title = 'Sell this train (Addendum A2 escape route)';
        sellBtn.addEventListener('click', () => this._sellTrain(t));
        row.appendChild(sellBtn);
        this.rosterList.appendChild(row);
        this._rosterRows.set(t.id, { row, stateEl, cargoEl, incomeEl });
      }
      this._refreshBuyForm();
    } catch (err) {
      console.error('railwright ui: roster refresh failed', err);
    }
  }

  // Updates only text content of existing rows every frame - cheap, no DOM
  // rebuild - structural changes (a train bought/sold) go through
  // _refreshRoster() instead, triggered by bus events.
  _refreshRosterLive() {
    const trains = getTrains(this.game);
    if (trains.length !== this._rosterRows.size) { this._refreshRoster(); return; }
    const day = Math.max(1, (this.game.world?.clock?.day ?? 1) - 1);
    for (const t of trains) {
      const refs = this._rosterRows.get(t.id);
      if (!refs) continue;
      refs.stateEl.textContent = t.state || 'idle';
      refs.stateEl.className = `rw-roster-state rw-state-${t.state || 'idle'}`;
      const cargo = (t.wagons || []).filter((w) => w.item && w.qty > 0)
        .map((w) => `${roundQty(w.qty)} ${itemLabel(w.item)}`).join(', ');
      refs.cargoEl.textContent = cargo || 'empty';
      const perDay = (t.stats?.revenue || 0) / day;
      refs.incomeEl.textContent = `${formatMoney ? formatMoney(perDay) : Math.round(perDay)}/day`;
    }
  }

  // Charges the fee (economy.chargeDispatch, free once centralised_ctc is
  // owned) then flips the train's travel direction (trains.js's reverse) -
  // two documented command calls, never a direct schedule/path mutation here.
  _dispatchReverse(trainId) {
    const train = getTrains(this.game).find((t) => t.id === trainId);
    if (!train) return false;
    const charged = this.game.economy?.chargeDispatch ? this.game.economy.chargeDispatch() : true;
    if (!charged) return false;
    reverseTrain(train, this.game);
    return true;
  }

  // economy.sellTrain() credits the refund and emits train:sold; main.js
  // wraps it to also remove the train from TrainManager and release its
  // block reservations - this only confirms and calls it.
  _sellTrain(train) {
    const econ = this.game.economy;
    if (!econ?.valueOfTrain || !econ?.sellTrain) return;
    const value = econ.valueOfTrain(train);
    const name = LOCOS[train.locoId]?.name || train.name || `Train #${train.id}`;
    const priceStr = formatMoney ? formatMoney(value) : value;
    if (!window.confirm(`Sell ${name} for ${priceStr}? It will be removed along with its schedule.`)) return;
    try {
      econ.sellTrain(train);
    } catch (err) {
      console.error('sellTrain failed', err);
    }
  }

  _jumpToTrain(train) {
    // Camera centring is presentation, not simulation - safe to touch
    // game.camera directly via render.js's own helper, same as input.js does
    // for pan/zoom. Silently no-ops if main.js hasn't attached a canvas yet.
    if (train.headIdx == null || !this.game.camera || !this.game.canvas) return;
    try {
      const { x: tx, y: ty } = toXY(train.headIdx);
      centerOn(this.game.camera, tx, ty);
      clampCamera(this.game.camera, this.game.canvas);
    } catch (err) {
      console.error('jump-to-train failed', err);
    }
  }

  // ==========================================================================
  // Upgrades panel
  // ==========================================================================
  _buildUpgrades() {
    const p = el('div', 'rw-panel rw-panel-upgrades');
    p.hidden = true;
    const head = el('div', 'rw-panel-head');
    head.appendChild(el('div', 'rw-panel-title', 'Upgrades'));
    const closeBtn = el('button', 'rw-panel-close', '×');
    closeBtn.addEventListener('click', () => this._togglePanel('upgrades'));
    head.appendChild(closeBtn);
    p.appendChild(head);
    this.upgradesList = el('div', 'rw-upgrades-list');
    p.appendChild(this.upgradesList);
    this.root.appendChild(p);
    this.upgradesPanel = p;
  }

  _refreshUpgrades() {
    try {
      this.upgradesList.textContent = '';
      const unlocked = getUnlockedTechs(this.game);
      const era = getEra(this.game);
      const money = this.game.economy?.money ?? 0;
      for (const [id, def] of Object.entries(TECHS || {})) {
        const owned = unlocked.has(id);
        const lockedByEra = (def.era ?? 0) > era;
        // `requires` isn't in DESIGN.md's TECHS shape, but economy.buyTech
        // honours it if present - reflect the same gating here if it exists.
        const missingReqs = (def.requires || []).filter((r) => !unlocked.has(r));
        const row = el('div', 'rw-tech-row');
        row.classList.toggle('rw-owned', owned);
        row.appendChild(el('div', 'rw-tech-name', def.name || id));
        row.appendChild(el('div', 'rw-tech-cost', `${formatMoney ? formatMoney(def.cost) : def.cost} · era ${(def.era ?? 0) + 1}`));
        if (missingReqs.length) {
          const names = missingReqs.map((r) => TECHS[r]?.name || r).join(', ');
          row.appendChild(el('div', 'rw-tech-requires', `Requires: ${names}`));
        }
        const label = owned ? 'Owned' : lockedByEra ? `Needs era ${(def.era ?? 0) + 1}` : missingReqs.length ? 'Locked' : 'Buy';
        const btn = el('button', 'rw-btn', label);
        btn.disabled = owned || lockedByEra || missingReqs.length > 0 || money < (def.cost || 0);
        btn.addEventListener('click', () => {
          try {
            const ok = this.game.economy?.buyTech?.(id);
            if (!ok) this._pushToast('Could not buy that upgrade.', 'bad');
          } catch (err) {
            console.error('buyTech failed', err);
          }
        });
        row.appendChild(btn);
        this.upgradesList.appendChild(row);
      }
    } catch (err) {
      console.error('railwright ui: upgrades refresh failed', err);
    }
  }

  // ==========================================================================
  // Site / station inspector
  // ==========================================================================
  _buildInspector() {
    const p = el('div', 'rw-panel rw-panel-inspector');
    p.hidden = true;
    const head = el('div', 'rw-panel-head');
    head.appendChild(el('div', 'rw-panel-title', 'Inspector'));
    const closeBtn = el('button', 'rw-panel-close', '×');
    closeBtn.addEventListener('click', () => {
      this.game.selection = { kind: null, id: null };
      this.game.bus?.emit?.('selection:changed', { kind: null, id: null });
    });
    head.appendChild(closeBtn);
    p.appendChild(head);
    this.inspectorBody = el('div', 'rw-inspector-body');
    p.appendChild(this.inspectorBody);
    this.root.appendChild(p);
    this.inspectorPanel = p;
  }

  _refreshInspector() {
    const sel = this.game.selection;
    if (!sel || (sel.kind !== 'site' && sel.kind !== 'station')) { this.inspectorPanel.hidden = true; return; }
    try {
      let site = null;
      let station = null;
      if (sel.kind === 'site') {
        site = findSite(this.game, sel.id);
        station = site?.stationId ? findStation(this.game, site.stationId) : null;
      } else {
        station = findStation(this.game, sel.id);
        site = station?.siteId ? findSite(this.game, station.siteId) : null;
      }
      if (!site && !station) { this.inspectorPanel.hidden = true; return; }
      this.inspectorPanel.hidden = false;
      this.inspectorBody.textContent = '';
      const title = el('div', 'rw-inspector-title', site?.name || station?.name || 'Unknown');
      this.inspectorBody.appendChild(title);
      if (site) {
        this.inspectorBody.appendChild(el('div', 'rw-inspector-kind', SITE_KINDS?.[site.kind]?.name || site.kind || ''));
        this._appendItemRows('Produces', site.produces, site.stock, SITE_STOCK_CAP);
        this._appendItemRows('Wants', site.consumes, site.demand, SITE_STOCK_CAP);
      }
      if (station) {
        this.inspectorBody.appendChild(el('div', 'rw-inspector-subtitle', `Station · ${station.platforms || 1} platform(s)`));
        const waiting = station.waiting || {};
        const entries = Object.entries(waiting).filter(([, qty]) => qty > 0);
        if (entries.length) {
          const box = el('div', 'rw-inspector-waiting');
          for (const [item, qty] of entries) box.appendChild(el('div', 'rw-waiting-row', `${roundQty(qty)} ${itemLabel(item)} waiting`));
          this.inspectorBody.appendChild(box);
        }
      } else if (site) {
        this.inspectorBody.appendChild(el('div', 'rw-inspector-hint', 'No station built here yet.'));
      }
    } catch (err) {
      console.error('railwright ui: inspector refresh failed', err);
    }
  }

  _appendItemRows(label, list, qtyMap, cap) {
    if (!list || !list.length) return;
    this.inspectorBody.appendChild(el('div', 'rw-inspector-subtitle', label));
    for (const entry of list) {
      const qty = qtyMap?.[entry.item] ?? 0;
      const row = el('div', 'rw-stock-row');
      const swatch = el('span', 'rw-swatch');
      swatch.style.background = ITEMS[entry.item]?.colour || '#888';
      row.appendChild(swatch);
      row.appendChild(el('span', 'rw-stock-name', `${itemLabel(entry.item)} (${entry.perDay}/day)`));
      const track = el('div', 'rw-bar-track rw-stock-track');
      const fill = el('div', 'rw-bar-fill');
      fill.style.width = `${Math.min(100, Math.round((100 * qty) / (cap || 1)))}%`;
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el('span', 'rw-stock-qty', `${roundQty(qty)}`));
      this.inspectorBody.appendChild(row);
    }
  }

  // ==========================================================================
  // Schedule editor - the centrepiece
  // ==========================================================================
  _buildSchedule() {
    const p = el('div', 'rw-panel rw-panel-schedule');
    p.hidden = true;
    const head = el('div', 'rw-panel-head');
    head.appendChild(el('div', 'rw-panel-title', 'Schedule'));
    const closeBtn = el('button', 'rw-panel-close', '×');
    closeBtn.addEventListener('click', () => {
      this._pickingStopFor = null;
      this.game.selection = { kind: null, id: null };
      this.game.bus?.emit?.('selection:changed', { kind: null, id: null });
    });
    head.appendChild(closeBtn);
    p.appendChild(head);

    this.scheduleHeader = el('div', 'rw-schedule-header');
    p.appendChild(this.scheduleHeader);

    this.scheduleNextLine = el('div', 'rw-schedule-next', '');
    p.appendChild(this.scheduleNextLine);

    this.scheduleEtaLine = el('div', 'rw-schedule-eta', '');
    p.appendChild(this.scheduleEtaLine);

    this.stopList = el('div', 'rw-stop-list');
    p.appendChild(this.stopList);

    const addRow = el('div', 'rw-add-stop');
    this.addStationSelect = document.createElement('select');
    addRow.appendChild(this.addStationSelect);
    const addBtn = el('button', 'rw-btn', 'Add Stop');
    addBtn.addEventListener('click', () => {
      const stationId = this.addStationSelect.value;
      if (stationId) this._addStop(stationId);
    });
    addRow.appendChild(addBtn);
    this.pickOnMapBtn = el('button', 'rw-btn rw-btn-accent-outline', 'Pick on Map');
    this.pickOnMapBtn.addEventListener('click', () => this._armPickOnMap());
    addRow.appendChild(this.pickOnMapBtn);
    p.appendChild(addRow);

    this.root.appendChild(p);
    this.schedulePanel = p;
  }

  _armPickOnMap() {
    const trainId = this.game.selection?.id;
    if (trainId == null) return;
    this._pickingStopFor = trainId;
    this.game.tool = 'inspect';
    this.pickOnMapBtn.classList.add('rw-active');
    this.pickOnMapBtn.textContent = 'Click a station…';
  }

  _disarmPickOnMap() {
    this._pickingStopFor = null;
    this.pickOnMapBtn.classList.remove('rw-active');
    this.pickOnMapBtn.textContent = 'Pick on Map';
  }

  _currentTrain() {
    const sel = this.game.selection;
    if (!sel || sel.kind !== 'train') return null;
    return getTrains(this.game).find((t) => t.id === sel.id) || null;
  }

  // trains.js's setSchedule mutates train.schedule in place (it owns
  // clamping the current index into range) - this only ever hands it a
  // freshly-built stops array, never touches train.schedule itself.
  _setSchedule(train, stops) {
    try {
      setTrainSchedule(train, stops, { loop: true });
      this._refreshSchedule();
    } catch (err) {
      console.error('setSchedule failed', err);
    }
  }

  _addStop(stationId) {
    const train = this._currentTrain();
    if (!train) return;
    const stops = [...(train.schedule?.stops || []), { stationId, action: 'load', item: null, waitSeconds: 0 }];
    this._setSchedule(train, stops);
    this._disarmPickOnMap();
  }

  _refreshSchedule() {
    const train = this._currentTrain();
    if (!train) { this.schedulePanel.hidden = true; return; }
    try {
      this.schedulePanel.hidden = false;
      this.scheduleHeader.textContent = '';
      this.scheduleHeader.appendChild(el('div', 'rw-schedule-title', train.name || `Train #${train.id}`));
      this.scheduleHeader.appendChild(el('div', 'rw-schedule-loco', LOCOS[train.locoId]?.name || train.locoId || ''));

      const stops = train.schedule?.stops || [];
      this.stopList.textContent = '';
      if (!stops.length) {
        this.stopList.appendChild(el('div', 'rw-empty', 'No stops yet - add one below.'));
      }
      stops.forEach((stop, i) => this.stopList.appendChild(this._buildStopRow(train, stop, i, stops.length)));

      const stations = getStations(this.game);
      const prev = this.addStationSelect.value;
      this.addStationSelect.textContent = '';
      for (const s of stations) this.addStationSelect.appendChild(opt(s.id, s.name || s.id));
      if (stations.some((s) => s.id === prev)) this.addStationSelect.value = prev;

      this._refreshScheduleLive();
    } catch (err) {
      console.error('railwright ui: schedule refresh failed', err);
    }
  }

  // Cheap per-frame bits of the schedule panel: the "next:" line, the
  // ETA/utilisation readout. Rebuilding the whole stop list every frame
  // would fight the user's own edits, so that only happens in _refreshSchedule.
  _refreshScheduleLive() {
    if (this.schedulePanel.hidden) return;
    const train = this._currentTrain();
    if (!train) { this.schedulePanel.hidden = true; return; }
    const stops = train.schedule?.stops || [];
    const stop = stops[train.schedule?.index ?? 0];
    if (stop) {
      const station = findStation(this.game, stop.stationId);
      const actionLabel = STOP_ACTIONS.find((a) => a.value === stop.action)?.label || stop.action;
      // Only append an item when the action actually has one - 'wait' has
      // seconds instead, and 'unload_all'/an unset item have no single item
      // to name (itemLabel(null) must never leak the literal word "null").
      let detail = '';
      if (stop.action === 'wait') detail = ` ${stop.waitSeconds || 0}s`;
      else if (stop.action !== 'unload_all' && stop.item) detail = ` ${itemLabel(stop.item)}`;
      this.scheduleNextLine.textContent = `next: ${station?.name || stop.stationId} (${actionLabel}${detail})`;
    } else {
      this.scheduleNextLine.textContent = stops.length ? '' : 'This train has no schedule - it will sit idle.';
    }
    const util = this._utilisation.get(train.id) ?? 0;
    const eta = this._estimateEta(train);
    this.scheduleEtaLine.textContent = `ETA ${eta != null && formatTime ? formatTime(eta) : '—'} · utilisation ${Math.round(util * 100)}%`;
  }

  _estimateEta(train) {
    try {
      const stop = train.schedule?.stops?.[train.schedule?.index ?? 0];
      if (!stop || train.headIdx == null) return null;
      const station = findStation(this.game, stop.stationId);
      const destIdx = station?.tiles?.[0] ?? station?.originIdx;
      if (destIdx == null || typeof this.game.network?.findPath !== 'function') return null;
      const path = this.game.network.findPath(train.headIdx, destIdx, {});
      if (!path) return null;
      const speed = Math.max(0.1, LOCOS[train.locoId]?.speed ?? 1);
      return path.cost / speed;
    } catch (err) {
      console.error('ETA estimate failed', err);
      return null;
    }
  }

  _tickUtilisation(dt) {
    const active = new Set(['running', 'loading', 'unloading']);
    const alpha = 1 - Math.exp(-(dt || 0) / UTIL_TIME_CONSTANT);
    for (const t of getTrains(this.game)) {
      const prev = this._utilisation.get(t.id) ?? 0;
      const target = active.has(t.state) ? 1 : 0;
      this._utilisation.set(t.id, prev + (target - prev) * alpha);
    }
  }

  _buildStopRow(train, stop, index, total) {
    const row = el('div', 'rw-stop-row');
    row.draggable = true;
    row.dataset.index = String(index);
    row.addEventListener('dragstart', (e) => {
      e.dataTransfer.setData('text/plain', String(index));
      e.dataTransfer.effectAllowed = 'move';
    });
    row.addEventListener('dragover', (e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; });
    row.addEventListener('drop', (e) => {
      e.preventDefault();
      const from = Number(e.dataTransfer.getData('text/plain'));
      this._reorderStop(train, from, index);
    });

    row.appendChild(el('div', 'rw-stop-index', String(index + 1)));

    const station = findStation(this.game, stop.stationId);
    row.appendChild(el('div', 'rw-stop-station', station?.name || stop.stationId || '?'));

    const actionSelect = document.createElement('select');
    for (const a of STOP_ACTIONS) actionSelect.appendChild(opt(a.value, a.label));
    actionSelect.value = stop.action || 'load';
    actionSelect.addEventListener('change', () => this._updateStop(train, index, { action: actionSelect.value }));
    row.appendChild(actionSelect);

    if (stop.action === 'wait') {
      const secInput = document.createElement('input');
      secInput.type = 'number';
      secInput.min = '0';
      secInput.value = String(stop.waitSeconds || 0);
      secInput.className = 'rw-stop-wait';
      secInput.addEventListener('change', () => this._updateStop(train, index, { waitSeconds: Number(secInput.value) || 0 }));
      row.appendChild(secInput);
    } else {
      const itemSelect = document.createElement('select');
      itemSelect.appendChild(opt('', '—'));
      for (const [id, def] of Object.entries(ITEMS)) itemSelect.appendChild(opt(id, def.name));
      itemSelect.value = stop.item || '';
      itemSelect.addEventListener('change', () => this._updateStop(train, index, { item: itemSelect.value || null }));
      row.appendChild(itemSelect);
    }

    const upBtn = el('button', 'rw-btn rw-btn-small', '↑');
    upBtn.disabled = index === 0;
    upBtn.addEventListener('click', () => this._reorderStop(train, index, index - 1));
    const downBtn = el('button', 'rw-btn rw-btn-small', '↓');
    downBtn.disabled = index === total - 1;
    downBtn.addEventListener('click', () => this._reorderStop(train, index, index + 1));
    const delBtn = el('button', 'rw-btn rw-btn-small rw-btn-danger', '×');
    delBtn.addEventListener('click', () => this._deleteStop(train, index));
    row.append(upBtn, downBtn, delBtn);

    return row;
  }

  _updateStop(train, index, patch) {
    const stops = (train.schedule?.stops || []).map((s, i) => (i === index ? { ...s, ...patch } : s));
    this._setSchedule(train, stops);
  }

  _reorderStop(train, from, to) {
    const stops = [...(train.schedule?.stops || [])];
    if (from < 0 || from >= stops.length || to < 0 || to >= stops.length || from === to) return;
    const [moved] = stops.splice(from, 1);
    stops.splice(to, 0, moved);
    this._setSchedule(train, stops);
  }

  _deleteStop(train, index) {
    const stops = (train.schedule?.stops || []).filter((_, i) => i !== index);
    this._setSchedule(train, stops);
  }

  // ==========================================================================
  // Selection routing (inspector vs schedule vs "pick on map")
  // ==========================================================================
  _onSelectionChanged({ kind, id }) {
    if (this._pickingStopFor != null && kind === 'station') {
      const trainId = this._pickingStopFor; // _disarmPickOnMap clears the field below
      const train = getTrains(this.game).find((t) => t.id === trainId);
      // Restore the train selection *before* _setSchedule (it re-reads
      // game.selection via _currentTrain to refresh the panel) - otherwise
      // the refresh runs while selection still points at the picked station
      // and finds no current train, hiding the panel it just updated.
      this._disarmPickOnMap();
      this.game.selection = { kind: 'train', id: trainId };
      if (train) {
        const stops = [...(train.schedule?.stops || []), { stationId: id, action: 'load', item: null, waitSeconds: 0 }];
        this._setSchedule(train, stops);
      } else {
        this._refreshSchedule();
      }
      return;
    }
    if (kind === 'train') {
      this.inspectorPanel.hidden = true;
      this._refreshSchedule();
    } else if (kind === 'site' || kind === 'station') {
      this.schedulePanel.hidden = true;
      this._refreshInspector();
    } else {
      this.schedulePanel.hidden = true;
      this.inspectorPanel.hidden = true;
    }
  }

  // ==========================================================================
  // Help / intro overlays
  // ==========================================================================
  _buildHelp() {
    const s = el('div', 'rw-overlay rw-help');
    s.hidden = true;
    const card = el('div', 'rw-overlay-card');
    card.appendChild(el('h2', null, 'Controls'));
    const list = el('ul', 'rw-help-list');
    const lines = [
      'Drag with middle/right mouse, or hold Space and drag, to pan. WASD / arrows also pan.',
      'Scroll to zoom toward the cursor.',
      '1-6 pick a tool: Inspect, Track, Signal, Station, Bulldoze, Wire.',
      'Track: press, drag, release to lay a run. Esc cancels mid-drag.',
      'Signal: click near a link between two track tiles to place or remove a signal.',
      'Station: click a track tile near an unserved site.',
      'Space pauses. +/- change speed. M toggles the minimap, B the block overlay.',
    ];
    for (const line of lines) list.appendChild(el('li', null, line));
    card.appendChild(list);
    const closeBtn = el('button', 'rw-btn rw-btn-accent', 'Close');
    closeBtn.addEventListener('click', () => { this.game.helpOpen = false; });
    card.appendChild(closeBtn);
    s.appendChild(card);
    this.root.appendChild(s);
    this.helpPanel = s;
  }

  _hasSeenIntro() {
    try {
      return localStorage.getItem('railwright_seen_intro') === '1';
    } catch {
      return true;
    }
  }

  _buildIntro() {
    const s = el('div', 'rw-overlay rw-intro');
    s.hidden = true;
    const card = el('div', 'rw-overlay-card');
    card.appendChild(el('h1', 'rw-intro-title', 'Railwright'));
    card.appendChild(el('p', null, 'You are a rail contractor in a single hand-drawn valley. Lay track, '
      + 'build stations, buy locomotives, and program schedules that your trains run forever.'));
    card.appendChild(el('p', null, 'Track is a shared, single-line resource - signals and passing loops '
      + 'are how you stop trains colliding.'));

    // Addendum A3.2/A3.1: name the rolled scenario and the seed up front, so
    // two runs actually read as different runs and this one can be replayed
    // or shared later (also always visible via the HUD's seed button).
    const scenario = this.game.scenario;
    if (scenario) {
      const box = el('div', 'rw-intro-scenario');
      box.style.cssText = 'border:1px solid rgba(128,128,128,0.4); border-radius:8px; padding:8px 10px; margin:10px 0; text-align:left;';
      const nameEl = el('div', null, `This run: ${scenario.name}`);
      nameEl.style.fontWeight = '700';
      box.appendChild(nameEl);
      box.appendChild(el('div', null, scenario.description || ''));
      card.appendChild(box);
    }
    card.appendChild(el('p', null, `Seed: ${this.game.seed} — note it down to replay or share this exact map.`));

    const startBtn = el('button', 'rw-btn rw-btn-accent', "Let's go");
    startBtn.addEventListener('click', () => this.hideIntro());
    card.appendChild(startBtn);
    s.appendChild(card);
    this.root.appendChild(s);
    this.introOverlay = s;
  }

  // A slow reader shouldn't lose day-1 clock time to a modal they can't act
  // through yet - pause for as long as it's up, and resume at whatever speed
  // was actually running before (never force 1x over a game that was already
  // paused for some other reason).
  showIntro() {
    this.introOverlay.hidden = false;
    this._introResumeSpeed = this.game.paused ? 0 : (this.game.speed || 1);
    setGameSpeed(this.game, 0);
  }

  hideIntro() {
    this.introOverlay.hidden = true;
    try {
      localStorage.setItem('railwright_seen_intro', '1');
    } catch { /* storage unavailable - just don't persist the flag */ }
    const resumeSpeed = this._introResumeSpeed || 1;
    this._introResumeSpeed = null;
    setGameSpeed(this.game, resumeSpeed);
  }

  // ==========================================================================
  // Game over
  // ==========================================================================
  _buildGameOver() {
    const s = el('div', 'rw-overlay rw-gameover');
    s.hidden = true;
    const card = el('div', 'rw-overlay-card');
    card.appendChild(el('h1', null, 'Bankrupt'));
    this.gameOverStats = el('div', 'rw-gameover-stats');
    card.appendChild(this.gameOverStats);
    const restartBtn = el('button', 'rw-btn rw-btn-accent', 'Restart');
    restartBtn.addEventListener('click', () => window.location.reload());
    card.appendChild(restartBtn);
    s.appendChild(card);
    this.root.appendChild(s);
    this.gameOverScreen = s;
  }

  _showGameOver(data = {}) {
    try {
      this.gameOverStats.textContent = '';
      const trains = getTrains(this.game);
      const delivered = trains.reduce((sum, t) => sum + (t.stats?.delivered || 0), 0);
      const revenue = trains.reduce((sum, t) => sum + (t.stats?.revenue || 0), 0);
      const rows = [
        `Reason: ${data.reason || 'ran out of money'}`,
        `Day reached: ${this.game.world?.clock?.day ?? '?'}`,
        `Cargo delivered: ${delivered}`,
        `Lifetime train revenue: ${formatMoney ? formatMoney(revenue) : revenue}`,
        `Seed: ${this.game.seed} (enter it via the seed button to replay this map)`,
      ];
      for (const r of rows) this.gameOverStats.appendChild(el('div', null, r));
      this.gameOverScreen.hidden = false;
    } catch (err) {
      console.error('railwright ui: game over screen failed', err);
      this.gameOverScreen.hidden = false;
    }
  }
}

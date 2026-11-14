// Economy — money, industry production/consumption, contracts, town growth,
// techs/eras, milestones, daily upkeep settlement and Tier-3 disasters.
// This is the module that has to make every balance swing legible: every
// dollar in or out goes through spend()/earn()/_settle() so it lands in the
// categorised daily ledger the UI reads via getLedger()/getLedgerHistory().
//
// Construction: `new Economy(world, bus, opts)`
//   world - the live world.js object. Economy reads/mutates it directly:
//     world.sites   - every site (array OR Map<id,site>, either is handled)
//     world.tiles   - flat Array(GRID_W*GRID_H) of tile objects (section 3/5);
//                     economy sets tile.blocked=true/false for landslides.
//     world.clock   - { day, timeOfDay, season } (read-only here)
//   bus  - the shared EventBus (utils.js), frozen event names per DESIGN.md 9.
//   opts - { seed, startingMoney } both optional.
//
// ctx (passed to update(dt, ctx), remembered for use inside day:ended too) -
// this is Economy's read-only window into state owned by trains.js/network.js,
// which this file never imports:
//   getTrains()            -> Train[]   (trains.js Train objects: locoId, wagons[{type,...}], state, id)
//   getStation(stationId)  -> Station | undefined   (network/world Station: waiting, platforms, accepts)
//   getTrackStats()        -> { total, electrified, bridge, tunnel }  (tile counts, for upkeep + milestones)
//   pathDistance(siteAId, siteBId) -> number | null  (route tile-distance, or null if no route yet)
// Any of these may be omitted/absent early in boot; every call site guards
// for that so a not-yet-wired ctx never throws.
//
// Site production model (DESIGN.md section 5 leaves the exact storage of
// "input awaiting consumption" unstated - a site struct only lists `stock`
// and `demand`, no third field):
// CONTRACT-GAP: this file treats `site.stock` as ONE unified inventory map
// keyed by item - produced-output items and consumed-input items never share
// a key for any real recipe in the table, so the same map safely holds both.
// `site.demand` is treated purely as a growing "appetite" target (used for
// town satisfaction), never as inventory. Station<->site flow below only
// ever moves `site.produces` items, so delivered inputs sitting in stock are
// never accidentally shipped back out.
import {
  ITEMS, SITE_KINDS, SITE_STOCK_CAP, TECHS, MILESTONES, ERA_THRESHOLDS,
  STARTING_MONEY, BANKRUPTCY_FLOOR, TRACK_UPKEEP_PER_TILE_PER_DAY,
  LOCOS, WAGONS, DISPATCH_FEE,
  LOAN_AMOUNT, LOAN_MAX_COUNT, LOAN_DAILY_INTEREST_RATE, LOAN_AVAILABLE_BELOW_MONEY,
  TRAIN_SELL_REFUND_RATE, CONTRACT_ABANDON_PENALTY_MULT,
  RUSH_REWARD_MULT, RUSH_MIN_INTERVAL_DAYS, RUSH_MAX_INTERVAL_DAYS, RUSH_BOARD_LIFETIME_SECONDS,
  SCENARIO_MODIFIERS,
} from './constants.js';
import {
  clamp, dist, makeRng, toXY, formatMoney,
} from './utils.js';

// --- Addendum C2/C3: staged insolvency tuning ---
const INSOLVENCY_GRACE_DAYS = 3; // days below BANKRUPTCY_FLOOR before receivership begins
const LOAN_INTEREST_CAP_MULT = 2; // interest stops accruing once it reaches 2x principal (Addendum C3)
const MONEY_FLOOR = -1e12; // finite backstop so no compounding charge can ever push money to -Infinity

// --- internal balance knobs (not mandated by DESIGN.md, tuned by harness) ---
const DEMAND_GROWTH_CAP_MULT = 3; // appetite can grow to 3x the base recipe rate
const DEMAND_GROWTH_RATE = 0.03; // per-day growth toward that cap
const SATISFACTION_SMOOTHING = 0.15; // rolling-average weight applied to today's result
const TOWN_GROWTH_POP_MULT = 1.4; // DESIGN.md 8: population x1.4 on level-up
const DAY_SECONDS = 100; // CONTRACT-GAP: mirrors DESIGN.md section 3 (not in the assumed import list)
const AVG_ACHIEVABLE_SPEED = 1.0; // tiles/sec, deliberately below the slowest loco (1.4) to leave slack
const CONTRACT_DEADLINE_BUFFER_DAYS = 4; // covers dispatch delay, loading, signal waits
const CONTRACT_MIN_DEADLINE_DAYS = 8;
const STRAIGHT_LINE_DETOUR = 1.35; // fallback multiplier when no track route exists yet
const CONTRACT_TIER_MULT = { bronze: 1.6, silver: 2.1, gold: 2.9 };
const CONTRACT_TIER_WEIGHTS = { gold: 0.15, silver: 0.3 }; // bronze is the remainder
const CONTRACT_QTY_RANGE = { bronze: [20, 60], silver: [40, 100], gold: [70, 150] };
const FINISHED_STATES = new Set(['complete', 'failed', 'expired']);
const LANDSLIDE_REPAIR_FEE = 350;
const LANDSLIDE_CHANCE = 0.012; // per day
const BOILER_FAILURE_CHANCE = 0.01; // per day
const DEMAND_BOOM_CHANCE = 0.03; // per day
const HARSH_WINTER_CHANCE = 0.4; // per winter season
const HARSH_WINTER_SPEED_MULT = 0.82;
const DEMAND_BOOM_MULT = 1.6;
// Addendum B: short-hop shuttling between two adjacent sites must never be
// the dominant strategy, so the floor is cut hard (DESIGN.md's original 0.6
// floor made a 5-tile hop pay nearly half of a 60-tile haul - not "much
// less"). The divisor is also widened so the payoff keeps climbing out to a
// longer cap distance, rewarding long, dense, well-signalled hauls instead of
// flattening out at 60 tiles. This deviates from DESIGN.md section 4's
// literal 0.6 + min(d,60)/50 formula on purpose - Addendum B states balance
// targets win over the doc's first-guess constants.
const DISTANCE_MULT_FLOOR = 0.05;
const DISTANCE_MULT_CAP_TILES = 70;
const DISTANCE_MULT_DIVISOR = 15;
const DEFAULT_ERA_THRESHOLDS = [0, 60000, 250000]; // CONTRACT-GAP fallback, see _checkEra

// --- Addendum A2 loan tuning: warn at escalating debt-to-principal ratios
// rather than every single day of accrual (still a real cost, just not spam).
const LOAN_WARN_RATIOS = [0.25, 0.5, 1, 1.5, 2];

// --- Addendum A1.2 rush contract tuning. Deadlines are still derived from
// the same achievable-travel-time formula as normal contracts (_deadlineDays
// ForDistance) - only the slack shrinks, so "tight" never means "impossible".
const RUSH_DEADLINE_BUFFER_DAYS = 1;
const RUSH_MIN_DEADLINE_DAYS = 3;

// --- Addendum A1.3 event-cadence tuning ---
const EVENT_CADENCE_SECONDS = 45; // matches DESIGN.md Addendum A1.3
const CADENCE_NUDGE_RETRY_SECONDS = 1; // throttle: try at most once/game-second while overdue
const CADENCE_BOARD_TARGET = 6; // nudge offers a contract only while the board isn't already full

const sumValues = (obj) => Object.values(obj).reduce((a, b) => a + b, 0);

export class Economy {
  constructor(world, bus, opts = {}) {
    this.world = world;
    this.bus = bus;
    this.opts = opts;

    this.money = opts.startingMoney ?? STARTING_MONEY;
    this.lifetimeRevenue = 0;
    this.era = 0;
    this.unlockedTechs = new Set();

    this.rng = makeRng(opts.seed ?? 1);

    this._currentDay = (world && world.clock && world.clock.day) || 1;
    this.ledger = this._emptyLedger(this._currentDay);
    this.ledgerHistory = [];

    this.contracts = [];
    this._nextContractId = 1;

    this._milestonesPaid = new Set();
    this._deliveredTotals = {};
    this._contractsCompletedCount = 0;
    this._lastNet = 0;

    this._blockedRepairs = new Map(); // idx -> repair fee
    this._harshWinter = false;
    this._winterRolledThisSeason = false;

    this._gameOver = false;
    this._ctx = null;

    // ---- Addendum A2: loans ----
    this.loans = [];
    this._nextLoanId = 1;

    // ---- Addendum C2: staged insolvency (warning -> grace -> receivership
    // -> bankrupt). `_belowFloorSinceDay` is the day money first crossed
    // BANKRUPTCY_FLOOR on the current excursion; null whenever money is at or
    // above the floor. `_receivershipActive` latches once the grace period
    // expires, so forced sales continue even on a day where a sale from the
    // previous day already lifted money briefly (still below floor overall).
    this._belowFloorSinceDay = null;
    this._receivershipActive = false;
    this._lastForcedSaleDay = null;

    // ---- Addendum C3: sold-train ids are never credited twice, regardless
    // of whether a stale reference gets passed back in (double-click race,
    // a future refactor calling sellTrain from two places, etc).
    this._soldTrainIds = new Set();

    // ---- Addendum A3.2: scenario modifiers ----
    this.scenario = null;
    this._scenarioMods = {};
    if (opts.scenario) this.setScenario(opts.scenario);

    // ---- Addendum A1.2/A1.3: rush contracts + event cadence ----
    this._elapsedSeconds = 0;
    this._lastBeatAt = 0;
    this._lastNudgeAttempt = -Infinity;
    this._nextRushDay = this._currentDay + this._randInt(RUSH_MIN_INTERVAL_DAYS, RUSH_MAX_INTERVAL_DAYS);

    this.bus.on('day:ended', (payload) => this._onDayEnded(payload));
    // Deadlock is detected by network.js, not economy - but it's still a
    // "notable beat" for the Addendum A1.3 cadence tracker.
    this.bus.on('train:deadlock', () => this._noteBeat());

    this._ensureBoardFilled();
  }

  // ---- money ----------------------------------------------------------

  // Addendum C3: every mutation of `this.money` funnels through here so the
  // no-NaN/Infinity invariant holds no matter how many charges compound in a
  // single day. A finite floor keeps every later earn()/spend() meaningful -
  // -Infinity can never be climbed back out of.
  _applyMoneyDelta(delta) {
    const next = this.money + delta;
    this.money = Number.isFinite(next) ? Math.max(next, MONEY_FLOOR) : MONEY_FLOOR;
  }

  spend(amount, reason) {
    const amt = Math.max(0, amount || 0);
    if (amt === 0) return true;
    if (this.money < amt) return false;
    this._applyMoneyDelta(-amt);
    this._ledgerAdd('costs', reason, amt);
    this.bus.emit('money:changed', { money: this.money, delta: -amt, reason });
    return true;
  }

  earn(amount, reason) {
    const amt = Math.max(0, amount || 0);
    if (amt === 0) return;
    this._applyMoneyDelta(amt);
    this.lifetimeRevenue += amt;
    this._ledgerAdd('revenue', reason, amt);
    this.bus.emit('money:changed', { money: this.money, delta: amt, reason });
    this._checkEra();
  }

  // Involuntary charge (upkeep, contract penalty): always applied, can push
  // money below zero - unlike spend() it is never refused for unaffordability,
  // otherwise upkeep would silently stop being real once you're broke.
  _settle(amount, reason) {
    const amt = Math.max(0, amount || 0);
    if (amt === 0) return;
    this._applyMoneyDelta(-amt);
    this._ledgerAdd('costs', reason, amt);
    this.bus.emit('money:changed', { money: this.money, delta: -amt, reason });
  }

  _ledgerAdd(kind, reason, amount) {
    const bucket = this.ledger[kind];
    const key = Object.prototype.hasOwnProperty.call(bucket, reason) ? reason : 'other';
    bucket[key] += amount;
  }

  _emptyLedger(day) {
    return {
      day,
      revenue: {
        delivery: 0, contracts: 0, milestones: 0, loans: 0, assetSales: 0, other: 0,
      },
      costs: {
        locoUpkeep: 0, wagonUpkeep: 0, trackUpkeep: 0, construction: 0,
        purchases: 0, penalties: 0, repairs: 0, loanInterest: 0, loanRepayment: 0, other: 0,
      },
    };
  }

  getLedger() {
    return { day: this.ledger.day, revenue: { ...this.ledger.revenue }, costs: { ...this.ledger.costs } };
  }

  getLedgerHistory() {
    // newest first, capped at 20 days
    return this.ledgerHistory.map((l) => ({ day: l.day, revenue: { ...l.revenue }, costs: { ...l.costs } }));
  }

  _rolloverLedger(day) {
    this.ledgerHistory.unshift(this.ledger);
    if (this.ledgerHistory.length > 20) this.ledgerHistory.length = 20;
    this.ledger = this._emptyLedger(day + 1);
  }

  // ---- loans (Addendum A2: "broke" must always have an exit) ------------
  // Public API: canTakeLoan(), takeLoan(), getLoans(), repayLoan(id, amount).

  canTakeLoan() {
    // Addendum C2: once forced liquidation has begun, a lender doesn't
    // extend fresh credit to an estate mid-receivership - the grace period
    // was the window for that. Without this, a player who simply never
    // takes the loan they were always eligible for would keep an "escape
    // route" open forever (canTakeLoan() staying true) even after every
    // asset has been sold, defeating receivership's guarantee of an ending.
    if (this._receivershipActive) return false;
    return this.money < LOAN_AVAILABLE_BELOW_MONEY && this.loans.length < LOAN_MAX_COUNT;
  }

  takeLoan() {
    if (!this.canTakeLoan()) return null;
    const loan = {
      id: `loan${this._nextLoanId++}`, principal: LOAN_AMOUNT, interestOwed: 0, issuedDay: this._currentDay, _warnLevel: 0,
    };
    this.loans.push(loan);
    this._applyMoneyDelta(LOAN_AMOUNT);
    // Deliberately NOT earn(): a loan is not revenue - it must never count
    // toward lifetimeRevenue/era progress, or borrowing would let a player
    // buy their way into an era they haven't actually earned.
    this._ledgerAdd('revenue', 'loans', LOAN_AMOUNT);
    this.bus.emit('money:changed', { money: this.money, delta: LOAN_AMOUNT, reason: 'loans' });
    this.bus.emit('toast', {
      text: `Took out a loan of ${formatMoney(LOAN_AMOUNT)} at ${Math.round(LOAN_DAILY_INTEREST_RATE * 100)}%/day interest - repay it before it grows.`,
      kind: 'warn',
    });
    this._noteBeat();
    return loan;
  }

  getLoans() {
    return this.loans.map((l) => ({
      id: l.id,
      principal: l.principal,
      interestOwed: l.interestOwed,
      owed: l.principal + l.interestOwed,
      issuedDay: l.issuedDay,
    }));
  }

  // Partial repayment allowed; pays down interest first, then principal.
  // Returns the amount actually paid (0 if the loan doesn't exist, the
  // request is non-positive, or the player has no money to put toward it).
  repayLoan(id, amount) {
    const loan = this.loans.find((l) => l.id === id);
    if (!loan) return 0;
    const owed = loan.principal + loan.interestOwed;
    const pay = clamp(amount || 0, 0, Math.min(owed, this.money));
    if (pay <= 0) return 0;
    this._applyMoneyDelta(-pay);
    let remaining = pay;
    const interestPaid = Math.min(remaining, loan.interestOwed);
    loan.interestOwed -= interestPaid;
    remaining -= interestPaid;
    loan.principal -= Math.min(remaining, loan.principal);
    this._ledgerAdd('costs', 'loanRepayment', pay);
    this.bus.emit('money:changed', { money: this.money, delta: -pay, reason: 'loanRepayment' });
    if (loan.principal <= 0.01 && loan.interestOwed <= 0.01) {
      this.loans = this.loans.filter((l) => l.id !== id);
      this.bus.emit('toast', { text: 'Loan repaid in full.', kind: 'good' });
    }
    return pay;
  }

  _accrueLoanInterest() {
    for (const loan of this.loans) {
      // Addendum C3: cap accrued interest at 2x principal so an unpaid loan
      // can compound for any number of days without ever driving money
      // non-finite - past the cap it's just a large, static debt.
      const interestCap = loan.principal * LOAN_INTEREST_CAP_MULT;
      if (loan.interestOwed >= interestCap) continue;
      const owed = loan.principal + loan.interestOwed;
      const charge = Math.min(owed * LOAN_DAILY_INTEREST_RATE, interestCap - loan.interestOwed);
      loan.interestOwed += charge;
      this._settle(charge, 'loanInterest');
      const ratio = loan.interestOwed / loan.principal;
      const crossedLevel = LOAN_WARN_RATIOS.filter((r) => ratio >= r).length;
      if (crossedLevel > loan._warnLevel) {
        loan._warnLevel = crossedLevel;
        this.bus.emit('toast', {
          text: `${loan.id}: interest owed has grown to ${formatMoney(loan.interestOwed)} on a ${formatMoney(loan.principal)} loan - repay some before it compounds further.`,
          kind: 'bad',
        });
        this._noteBeat();
      }
    }
  }

  // ---- selling assets (Addendum A2/C2) ------------------------------------
  // economy.js doesn't own trains (trains.js/TrainManager does), so this only
  // computes value and credits money + emits `train:sold`. The CALLER (UI/
  // main.js) is responsible for actually removing the train from
  // TrainManager.trains and releasing its block reservations/schedule -
  // sellTrain() never mutates the train object or touches network.js.
  // Forced liquidation (Addendum C2) reuses this exact method so that path
  // is never duplicated.
  valueOfTrain(train) {
    if (!train) return 0;
    const loco = LOCOS[train.locoId];
    let cost = loco ? loco.cost : 0;
    for (const w of train.wagons || []) {
      const wagon = WAGONS[w.type];
      if (wagon) cost += wagon.cost;
    }
    return Math.round(cost * TRAIN_SELL_REFUND_RATE);
  }

  // `opts.forced` marks a receivership (Addendum C2) sale rather than a
  // player-initiated one, only to change the toast wording/event flag - the
  // credit/removal path is identical either way (main.js's
  // wrapTrainLifecycleMethods wraps this same method for both).
  sellTrain(train, opts = {}) {
    if (!train || train.id == null) return 0;
    // Idempotent + ownership-checked (Addendum C3): a train id, once
    // credited, can never be credited again, even from a stale reference;
    // and if the caller's ctx is wired, the train must still actually be
    // owned right now (trains.js ids are never reused, so both checks are
    // permanent once they fail).
    if (this._soldTrainIds.has(train.id)) return 0;
    const trains = this._ctx && typeof this._ctx.getTrains === 'function' ? this._ctx.getTrains() : null;
    if (Array.isArray(trains) && !trains.some((t) => t && t.id === train.id)) return 0;
    const value = this.valueOfTrain(train);
    if (value <= 0) return 0;
    this._soldTrainIds.add(train.id);
    this._applyMoneyDelta(value);
    this._ledgerAdd('revenue', 'assetSales', value);
    this.bus.emit('money:changed', { money: this.money, delta: value, reason: 'assetSales' });
    const loco = LOCOS[train.locoId];
    const name = (loco && loco.name) || 'a train';
    this.bus.emit('train:sold', { trainId: train.id, value, forced: !!opts.forced });
    this.bus.emit('toast', {
      text: opts.forced
        ? `The receivers have sold your ${name} for ${formatMoney(value)}.`
        : `Sold ${name} for ${formatMoney(value)}.`,
      kind: opts.forced ? 'bad' : 'info',
    });
    this._noteBeat();
    return value;
  }

  // ---- contract abandonment (Addendum A2) --------------------------------
  // Costs half the normal failure penalty. Emits `contract:abandoned`
  // (distinct from `contract:failed`) so UI/analytics can tell a deliberate
  // give-up from a genuine failure; internally the contract's `state` still
  // becomes 'failed' so it's excluded from DESIGN.md's frozen state enum and
  // from _expireAndSettleContracts' own failure/penalty pass (no double
  // charge).
  abandonContract(id) {
    const c = this.contracts.find((x) => x.id === id && x.state === 'active');
    if (!c) return false;
    const cost = Math.round(c.penalty * CONTRACT_ABANDON_PENALTY_MULT);
    this._settle(cost, 'penalties');
    c.state = 'failed';
    this.bus.emit('contract:abandoned', { contractId: id, penalty: cost });
    return true;
  }

  // ---- financial distress / staged insolvency (Addendum C2) --------------
  // Four stages, escalating:
  //   none         - money >= 0.
  //   warning      - money < 0, not (yet) in an active insolvency excursion.
  //   grace        - below BANKRUPTCY_FLOOR, an escape route remains, and
  //                  fewer than INSOLVENCY_GRACE_DAYS have passed since the
  //                  floor was first crossed. The player's window to act
  //                  before forced liquidation begins.
  //   receivership - grace expired: forced sales are underway (see
  //                  _settleDay). Sticky once entered - a single sale
  //                  nudging money back above the floor doesn't hand control
  //                  back, only full recovery (money >= 0) or running out of
  //                  assets does, otherwise a receiver would let go and
  //                  re-arm a fresh 3-day grace period over and over,
  //                  turning "guaranteed termination" into a very slow spiral.
  // Below the floor with NO escape route at all skips straight to bankruptcy
  // in _settleDay (there is nothing a grace period could buy the player) -
  // getFinancialDistress reports that instant as 'critical' with a null
  // stage-specific timer, since the game is over before another frame reads it.
  getFinancialDistress() {
    const trains = this._ctx && typeof this._ctx.getTrains === 'function' ? this._ctx.getTrains() : [];
    const sellableTrains = trains.filter((t) => this.valueOfTrain(t) > 0);
    const canLoan = this.canTakeLoan();
    const hasSellableAssets = sellableTrains.length > 0;
    const hasEscapeRoute = canLoan || hasSellableAssets;
    const belowFloor = this.money < BANKRUPTCY_FLOOR;
    const inDanger = this.money < 0;

    let stage = 'none';
    let severity = 'none';
    let graceDaysRemaining = null;
    if (this._receivershipActive) {
      stage = 'receivership';
      severity = 'critical';
    } else if (belowFloor && hasEscapeRoute) {
      stage = 'grace';
      severity = 'critical';
      const since = this._belowFloorSinceDay ?? this._currentDay;
      graceDaysRemaining = Math.max(0, INSOLVENCY_GRACE_DAYS - (this._currentDay - since));
    } else if (belowFloor) {
      stage = 'bankrupt'; // no escape route left; _settleDay ends the game this same day
      severity = 'critical';
    } else if (inDanger) {
      stage = 'warning';
      severity = 'warning';
    }

    return {
      inDanger,
      belowFloor,
      money: this.money,
      canTakeLoan: canLoan,
      loansOutstanding: this.loans.length,
      sellableTrainCount: sellableTrains.length,
      hasEscapeRoute,
      stage,
      graceDaysRemaining,
      severity,
    };
  }

  // ---- Addendum C2: forced liquidation ------------------------------------
  // Sells the single most valuable remaining train, once per day, through
  // the exact same sellTrain() path a player-initiated sale uses - so
  // main.js's wrapTrainLifecycleMethods (which does the actual TrainManager
  // removal + block-reservation release) fires identically either way.
  // Returns the sold value, or 0 if nothing sellable remains.
  _forceLiquidateOneTrain() {
    const trains = this._ctx && typeof this._ctx.getTrains === 'function' ? this._ctx.getTrains() : [];
    let best = null;
    let bestValue = 0;
    for (const t of trains) {
      const v = this.valueOfTrain(t);
      if (v > bestValue) { bestValue = v; best = t; }
    }
    if (!best) return 0;
    return this.sellTrain(best, { forced: true });
  }

  // ---- scenario modifiers (Addendum A3.2) --------------------------------
  // Economy-side effects only. Applied lazily wherever the relevant formula
  // runs (contract generation, demand growth, upkeep, disasters, port
  // pricing). `trackCostMult`/`bridgeCostMult` are exposed read-only for
  // network.js to apply itself (economy.js doesn't own track/bridge cost).
  setScenario(id) {
    this.scenario = id;
    this._scenarioMods = SCENARIO_MODIFIERS[id] || {};
  }

  getTrackCostMultiplier() {
    return this._scenarioMods.trackCostMult || 1;
  }

  getBridgeCostMultiplier() {
    return this._scenarioMods.bridgeCostMult || 1;
  }

  // ---- era / techs ------------------------------------------------------

  _checkEra() {
    const thresholds = Array.isArray(ERA_THRESHOLDS) ? ERA_THRESHOLDS : DEFAULT_ERA_THRESHOLDS;
    let era = 0;
    for (let i = thresholds.length - 1; i >= 0; i--) {
      if (this.lifetimeRevenue >= thresholds[i]) { era = i; break; }
    }
    if (era !== this.era) {
      this.era = era;
      this.bus.emit('era:changed', { era });
    }
  }

  getEraProgress() {
    const thresholds = Array.isArray(ERA_THRESHOLDS) ? ERA_THRESHOLDS : DEFAULT_ERA_THRESHOLDS;
    const next = thresholds[this.era + 1];
    return { era: this.era, revenue: this.lifetimeRevenue, nextThreshold: next === undefined ? null : next };
  }

  hasTech(id) {
    return this.unlockedTechs.has(id);
  }

  buyTech(id) {
    const tech = TECHS[id];
    if (!tech || this.unlockedTechs.has(id)) return false;
    if (this.era < tech.era) return false;
    // Not in the frozen TECHS shape today, but honoured if constants.js grows one.
    if (Array.isArray(tech.requires) && !tech.requires.every((r) => this.unlockedTechs.has(r))) return false;
    if (!this.spend(tech.cost, 'purchases')) return false;
    this.unlockedTechs.add(id);
    this.bus.emit('tech:bought', { techId: id });
    return true;
  }

  getDispatchFee() {
    return this.hasTech('centralised_ctc') ? 0 : DISPATCH_FEE;
  }

  chargeDispatch() {
    const fee = this.getDispatchFee();
    if (fee <= 0) return true;
    return this.spend(fee, 'repairs');
  }

  // ---- sites / industry --------------------------------------------------

  _sitesArray() {
    const sites = this.world && this.world.sites;
    if (!sites) return [];
    return typeof sites.values === 'function' ? Array.from(sites.values()) : sites;
  }

  _getSite(id) {
    const sites = this.world && this.world.sites;
    if (!sites) return undefined;
    if (typeof sites.get === 'function') return sites.get(id);
    return sites.find((s) => s.id === id);
  }

  _dailyIndustryTick() {
    // Coal Country (Addendum A3.2): weak processing - every processing site
    // (has both consumes and produces) needs more raw input per unit output.
    const isTownOrCity = (kind) => kind === 'town' || kind === 'city';
    const demandMult = this._scenarioMods.demandMult || 1;
    const processingInputMult = this._scenarioMods.processingInputMult || 1;

    for (const site of this._sitesArray()) {
      site.stock = site.stock || {};
      site.demand = site.demand || {};
      const consumes = Array.isArray(site.consumes) ? site.consumes : [];
      const produces = Array.isArray(site.produces) ? site.produces : [];
      const isProcessing = consumes.length > 0 && produces.length > 0;
      const inputMult = isProcessing ? processingInputMult : 1;
      const canProduce = consumes.every((c) => (site.stock[c.item] || 0) >= c.perDay * inputMult);
      let backedUpItem = null;
      if (canProduce) {
        for (const c of consumes) site.stock[c.item] -= c.perDay * inputMult;
        for (const p of produces) {
          const before = site.stock[p.item] || 0;
          if (before >= SITE_STOCK_CAP) { backedUpItem = backedUpItem || p.item; continue; }
          site.stock[p.item] = Math.min(SITE_STOCK_CAP, before + p.perDay);
        }
      }
      if (backedUpItem) this.bus.emit('site:backed_up', { siteId: site.id, item: backedUpItem });

      const siteDemandMult = isTownOrCity(site.kind) ? demandMult : 1;
      for (const c of consumes) {
        const cap = c.perDay * DEMAND_GROWTH_CAP_MULT * siteDemandMult;
        const current = site.demand[c.item] || c.perDay;
        site.demand[c.item] = clamp(current + c.perDay * DEMAND_GROWTH_RATE * siteDemandMult, 0, cap);
      }

      this._updateTownGrowth(site, canProduce);
    }
  }

  _updateTownGrowth(site, canProduce) {
    if (site.kind !== 'town' && site.kind !== 'city') return;
    const today = canProduce ? 1 : 0;
    site.satisfaction = clamp((site.satisfaction ?? 0) * (1 - SATISFACTION_SMOOTHING) + today * SATISFACTION_SMOOTHING, 0, 1);
    site._aboveStreak = site._aboveStreak || 0;
    site._belowStreak = site._belowStreak || 0;
    if (site.satisfaction > 0.7) { site._aboveStreak += 1; site._belowStreak = 0; } else if (site.satisfaction < 0.2) { site._belowStreak += 1; site._aboveStreak = 0; } else { site._aboveStreak = 0; site._belowStreak = 0; }

    if (site._aboveStreak >= 3 && (site.level || 1) < 5) {
      this._growTown(site);
      site._aboveStreak = 0;
    } else if (site._belowStreak >= 5 && (site.level || 1) > 1) {
      site.level = Math.max(1, (site.level || 1) - 1);
      site._belowStreak = 0;
      this.bus.emit('toast', { text: `${site.name || site.id} is struggling and has shrunk to level ${site.level}.`, kind: 'bad' });
    }
  }

  _growTown(site) {
    site.level = Math.min(5, (site.level || 1) + 1);
    site.population = Math.round((site.population || 1) * TOWN_GROWTH_POP_MULT);
    for (const p of site.produces || []) p.perDay = Math.round(p.perDay * TOWN_GROWTH_POP_MULT * 10) / 10;
    for (const c of site.consumes || []) c.perDay = Math.round(c.perDay * TOWN_GROWTH_POP_MULT * 10) / 10;
    this.bus.emit('city:grew', { siteId: site.id, level: site.level });
    this._noteBeat();
  }

  _flowSitesToStations(ctx) {
    if (!ctx || typeof ctx.getStation !== 'function') return;
    for (const site of this._sitesArray()) {
      if (!site.stationId) continue;
      const station = ctx.getStation(site.stationId);
      if (!station) continue;
      station.waiting = station.waiting || {};
      let throughput = 60 * (station.platforms || 1);
      for (const p of site.produces || []) {
        if (throughput <= 0) break;
        const avail = (site.stock && site.stock[p.item]) || 0;
        const move = Math.min(avail, throughput);
        if (move <= 0) continue;
        site.stock[p.item] = avail - move;
        station.waiting[p.item] = (station.waiting[p.item] || 0) + move;
        throughput -= move;
      }
    }
  }

  // ---- delivery pricing (DESIGN.md section 4) ----------------------------

  // SURGICAL FIX (main.js integration): trains.js actually calls this with a
  // single object — { trainId, stationId, siteId, item, qty, daysAboard } —
  // per its own header comment, not the positional (siteId, item, qty,
  // distTiles, daysAboard) shape this file originally exposed. Reconciled by
  // accepting the object form and deriving distTiles here (see
  // _estimateDeliveryDistance) instead of requiring the caller to know this
  // module's revenue formula.
  deliver({
    trainId, siteId, item, qty, daysAboard,
  } = {}) {
    const site = this._getSite(siteId);
    if (!site || !(qty > 0)) return 0;
    const isPort = site.kind === 'port';
    const demanded = isPort || (Array.isArray(site.consumes) && site.consumes.some((c) => c.item === item));
    if (!demanded) {
      const itemName = (ITEMS[item] && ITEMS[item].name) || item;
      this.bus.emit('toast', { text: `${site.name || site.id} has no use for ${itemName}.`, kind: 'warn' });
      return 0;
    }

    const distTiles = this._estimateDeliveryDistance(trainId);
    const base = (ITEMS[item] && ITEMS[item].basePrice) || 0;
    const distanceMultiplier = DISTANCE_MULT_FLOOR + Math.min(distTiles, DISTANCE_MULT_CAP_TILES) / DISTANCE_MULT_DIVISOR;
    const freshness = daysAboard > 3 ? 0.75 : 1;
    // Coal Country (Addendum A3.2): port export pays more - overrides rather
    // than stacks with the base port multiplier.
    const basePortMult = (SITE_KINDS.port && SITE_KINDS.port.priceMultiplier) || 1.25;
    const portMult = isPort ? (this._scenarioMods.portPriceMult || basePortMult) : 1;
    const revenue = Math.round(qty * base * distanceMultiplier * freshness * portMult);

    if (!isPort) {
      site.stock = site.stock || {};
      site.stock[item] = Math.min(SITE_STOCK_CAP, (site.stock[item] || 0) + qty);
    }
    this._deliveredTotals[item] = (this._deliveredTotals[item] || 0) + qty;

    this.earn(revenue, 'delivery');
    this.bus.emit('cargo:delivered', { siteId, item, qty, revenue });
    this._noteBeat();
    this._progressContracts(siteId, item, qty);
    return revenue;
  }

  // Tile distance of the leg the train just completed. At the moment
  // trains.js's doUnload() calls deliver() it hasn't yet requested its next
  // path (that happens once every item in the stop's unload has been
  // processed), so `train.path` still holds the route just travelled -
  // that's the one source of truth for "how far did this load come".
  _estimateDeliveryDistance(trainId) {
    const trains = this._ctx && typeof this._ctx.getTrains === 'function' ? this._ctx.getTrains() : [];
    const train = trains.find((t) => t && t.id === trainId);
    if (!train || !Array.isArray(train.path) || train.path.length < 2) return 0;
    let total = 0;
    for (let i = 1; i < train.path.length; i++) {
      const a = toXY(train.path[i - 1]);
      const b = toXY(train.path[i]);
      total += (Math.abs(a.x - b.x) === 1 && Math.abs(a.y - b.y) === 1) ? Math.SQRT2 : 1;
    }
    return total;
  }

  // ---- contracts (DESIGN.md section 8) -----------------------------------

  _pick(arr) { return arr[Math.floor(this.rng() * arr.length)]; }

  _chance(p) { return this.rng() < p; }

  _randInt(min, max) { return min + Math.floor(this.rng() * (max - min + 1)); }

  _rollTier() {
    const r = this.rng();
    if (r < CONTRACT_TIER_WEIGHTS.gold) return 'gold';
    if (r < CONTRACT_TIER_WEIGHTS.gold + CONTRACT_TIER_WEIGHTS.silver) return 'silver';
    return 'bronze';
  }

  _routeDistance(fromSite, toSite) {
    const viaNetwork = this._ctx && typeof this._ctx.pathDistance === 'function'
      ? this._ctx.pathDistance(fromSite.id, toSite.id) : null;
    if (typeof viaNetwork === 'number' && viaNetwork > 0) return viaNetwork;
    return dist(fromSite.x, fromSite.y, toSite.x, toSite.y) * STRAIGHT_LINE_DETOUR;
  }

  _deadlineDaysForDistance(distTiles, bufferDays = CONTRACT_DEADLINE_BUFFER_DAYS, minDeadlineDays = CONTRACT_MIN_DEADLINE_DAYS) {
    const travelDays = distTiles / AVG_ACHIEVABLE_SPEED / DAY_SECONDS;
    return Math.max(minDeadlineDays, Math.ceil(travelDays) + bufferDays);
  }

  // opts: { rewardMult, bufferDays, minDeadlineDays, rush } - shared by both
  // normal offers and rush offers (Addendum A1.2) so the achievable-deadline
  // guarantee (_deadlineDaysForDistance) never has two implementations to
  // drift apart. A tighter bufferDays/minDeadlineDays is still derived from
  // real travel time, so "tight" never means "impossible".
  _generateContractOffer(opts = {}) {
    const {
      rewardMult = 1, bufferDays = CONTRACT_DEADLINE_BUFFER_DAYS, minDeadlineDays = CONTRACT_MIN_DEADLINE_DAYS, rush = false,
    } = opts;
    const sites = this._sitesArray();
    const producers = sites.filter((s) => Array.isArray(s.produces) && s.produces.length > 0);
    if (producers.length === 0) return null;
    const scenarioRewardMult = this._scenarioMods.contractRewardMult || 1;
    for (let attempt = 0; attempt < 8; attempt++) {
      const fromSite = this._pick(producers);
      const itemDef = this._pick(fromSite.produces);
      const item = itemDef.item;
      const candidates = sites.filter((s) => s.id !== fromSite.id
        && (s.kind === 'port' || (Array.isArray(s.consumes) && s.consumes.some((c) => c.item === item))));
      if (candidates.length === 0) continue;
      const toSite = this._pick(candidates);
      const tier = this._rollTier();
      const [qMin, qMax] = CONTRACT_QTY_RANGE[tier];
      const qty = this._randInt(qMin, qMax);
      const base = (ITEMS[item] && ITEMS[item].basePrice) || 10;
      const reward = Math.round(qty * base * CONTRACT_TIER_MULT[tier] * rewardMult * scenarioRewardMult);
      const penalty = Math.round(reward * 0.35);
      const distTiles = this._routeDistance(fromSite, toSite);
      const dur = this._deadlineDaysForDistance(distTiles, bufferDays, minDeadlineDays);
      const day = this._currentDay;
      return {
        id: `c${this._nextContractId++}`,
        tier,
        fromSiteId: fromSite.id,
        toSiteId: toSite.id,
        item,
        qty,
        delivered: 0,
        reward,
        penalty,
        issuedDay: day,
        deadlineDay: day + dur,
        standing: false,
        state: 'offered',
        rush,
        rushExpiresAt: null, // set by _generateRushOffer once pushed to the board
        _dur: dur, // reused if this contract is ever renewed as a standing order
      };
    }
    return null;
  }

  offerContract() {
    const c = this._generateContractOffer();
    if (!c) return null;
    this.contracts.push(c);
    this.bus.emit('contract:offered', { contractId: c.id });
    this._noteBeat();
    return c;
  }

  // Addendum A1.2: a high-value, short-fuse contract every 2-4 in-game days.
  // Additive to the normal board (not counted against _ensureBoardFilled's
  // target) so it reads as a distinct interrupt, not just "one more offer".
  _generateRushOffer() {
    const c = this._generateContractOffer({
      rewardMult: RUSH_REWARD_MULT, bufferDays: RUSH_DEADLINE_BUFFER_DAYS, minDeadlineDays: RUSH_MIN_DEADLINE_DAYS, rush: true,
    });
    if (!c) return null;
    c.rushExpiresAt = this._elapsedSeconds + RUSH_BOARD_LIFETIME_SECONDS;
    this.contracts.push(c);
    this.bus.emit('contract:offered', { contractId: c.id });
    this.bus.emit('toast', {
      text: `Rush contract: ${formatMoney(c.reward)} if delivered by day ${c.deadlineDay} - won't stay on the board long.`,
      kind: 'good',
    });
    this._noteBeat();
    return c;
  }

  // Remaining game-seconds before a rush offer leaves the board unaccepted,
  // for the UI countdown. Returns null once accepted/expired or for a
  // non-rush contract.
  getRushRemaining(contractId) {
    const c = this.contracts.find((x) => x.id === contractId);
    if (!c || !c.rush || c.state !== 'offered' || c.rushExpiresAt == null) return null;
    return Math.max(0, c.rushExpiresAt - this._elapsedSeconds);
  }

  getElapsedGameSeconds() {
    return this._elapsedSeconds;
  }

  _expireRushOffers() {
    for (const c of this.contracts) {
      if (c.rush && c.state === 'offered' && c.rushExpiresAt != null && this._elapsedSeconds >= c.rushExpiresAt) {
        c.state = 'expired';
      }
    }
  }

  _ensureBoardFilled() {
    const rawTarget = 3 + Math.floor(this.era * 1.5) + (this.hasTech('telegraph') ? 1 : 0);
    const target = Math.max(2, Math.round(rawTarget * (this._scenarioMods.boardTargetMult || 1)));
    let guard = 0;
    while (this.getBoard().length < target && guard++ < 20) {
      if (!this.offerContract()) break;
    }
  }

  acceptContract(id) {
    const c = this.contracts.find((x) => x.id === id && x.state === 'offered');
    if (!c) return false;
    c.state = 'active';
    this.bus.emit('contract:accepted', { contractId: id });
    return true;
  }

  getBoard() { return this.contracts.filter((c) => c.state === 'offered'); }

  getActive() { return this.contracts.filter((c) => c.state === 'active'); }

  _progressContracts(siteId, item, qty) {
    for (const c of this.contracts) {
      if (c.state !== 'active' || c.toSiteId !== siteId || c.item !== item) continue;
      c.delivered += qty;
      if (c.delivered >= c.qty) {
        this.earn(c.reward, 'contracts');
        this.bus.emit('contract:completed', { contractId: c.id, reward: c.reward });
        this._noteBeat();
        this._contractsCompletedCount += 1;
        if (c.standing) {
          c.delivered = 0;
          c.issuedDay = this._currentDay;
          c.deadlineDay = this._currentDay + (c._dur || CONTRACT_MIN_DEADLINE_DAYS);
        } else {
          c.state = 'complete';
        }
      }
    }
  }

  _expireAndSettleContracts(day) {
    for (const c of this.contracts) {
      if (c.state === 'offered' && day - c.issuedDay >= 6) {
        c.state = 'expired';
      } else if (c.state === 'active' && !c.standing && day > c.deadlineDay && c.delivered < c.qty) {
        c.state = 'failed';
        this._settle(c.penalty, 'penalties');
        this.bus.emit('contract:failed', { contractId: c.id, penalty: c.penalty });
      }
    }
    // Trim long-finished contracts so the array doesn't grow forever.
    this.contracts = this.contracts.filter((c) => !FINISHED_STATES.has(c.state) || day - c.issuedDay < 30);
  }

  // Read-only views matching the shape constants.js's frozen MILESTONES
  // predicates expect (game.economy.stats.deliveredByItem / .lastSettlement.net).
  // Computed getters rather than plain fields so they can never go stale
  // relative to the underlying _deliveredTotals/_lastNet bookkeeping.
  get stats() {
    return { deliveredByItem: { ...this._deliveredTotals } };
  }

  get lastSettlement() {
    return { net: this._lastNet };
  }

  // ---- milestones (DESIGN.md section 8) ----------------------------------
  // CONTRACT-GAP: constants.js's MILESTONES shape isn't specified beyond
  // "an array". This assumes each entry is pure data:
  //   { id, name, reward, type, target, item? }
  // with `type` one of the switch cases below (matching the eight examples
  // in DESIGN.md). An unrecognised type is skipped, never thrown on, so a
  // shape mismatch degrades to "that milestone just never pays out" rather
  // than crashing the game.

  getMilestoneProgress() {
    return (MILESTONES || []).map((m) => ({
      id: m.id, name: m.name, reward: m.reward, paid: this._milestonesPaid.has(m.id),
    }));
  }

  _checkMilestones() {
    for (const m of MILESTONES || []) {
      if (this._milestonesPaid.has(m.id)) continue;
      if (this._milestoneMet(m)) {
        this._milestonesPaid.add(m.id);
        this.earn(m.reward, 'milestones');
        this.bus.emit('milestone:reached', { milestoneId: m.id, reward: m.reward });
        this._noteBeat();
      }
    }
  }

  _milestoneMet(m) {
    const stats = this._ctx && typeof this._ctx.getTrackStats === 'function' ? this._ctx.getTrackStats() : null;
    switch (m.type) {
      case 'connect_towns':
        return this._sitesArray().filter((s) => (s.kind === 'town' || s.kind === 'city') && s.stationId).length >= (m.target || 3);
      case 'trains_simultaneous': {
        const trains = this._ctx && typeof this._ctx.getTrains === 'function' ? this._ctx.getTrains() : [];
        return trains.length >= (m.target || 5);
      }
      case 'deliver_item':
        return (this._deliveredTotals[m.item] || 0) >= (m.target || 0);
      case 'daily_net_profit':
        return this._lastNet >= (m.target || 0);
      case 'town_level':
        return this._sitesArray().some((s) => (s.kind === 'town' || s.kind === 'city') && (s.level || 1) >= (m.target || 3));
      case 'contracts_completed':
        return this._contractsCompletedCount >= (m.target || 10);
      case 'bridge_built':
        return !!stats && stats.bridge >= (m.target || 1);
      case 'electrified_tiles':
        return !!stats && stats.electrified >= (m.target || 50);
      default:
        return false;
    }
  }

  // ---- daily settlement (DESIGN.md section 8) ----------------------------

  _settleDay(ctx) {
    // Lean Years (Addendum A3.2): 20% lower upkeep across the board.
    const upkeepMult = this._scenarioMods.upkeepMult || 1;
    const trains = ctx && typeof ctx.getTrains === 'function' ? ctx.getTrains() : [];
    for (const train of trains) {
      const loco = LOCOS[train.locoId];
      if (loco) this._settle(loco.upkeep * upkeepMult, 'locoUpkeep');
      for (const w of train.wagons || []) {
        const wagon = WAGONS[w.type];
        if (wagon) this._settle(wagon.upkeep * upkeepMult, 'wagonUpkeep');
      }
    }
    const trackStats = ctx && typeof ctx.getTrackStats === 'function' ? ctx.getTrackStats() : null;
    const trackTiles = trackStats ? trackStats.total : 0;
    this._settle(trackTiles * TRACK_UPKEEP_PER_TILE_PER_DAY * upkeepMult, 'trackUpkeep');

    this._accrueLoanInterest();

    const revenue = sumValues(this.ledger.revenue);
    const costs = sumValues(this.ledger.costs);
    const net = revenue - costs;
    this._lastNet = net;
    this.bus.emit('day:settled', { revenue, costs, net });

    this._processInsolvency();
  }

  // Addendum C2: staged insolvency, run once per settled day. Doing nothing
  // is a valid choice, but it must have an ending - see the stage
  // documentation on getFinancialDistress().
  _processInsolvency() {
    if (this._gameOver) return;

    // Receivership is sticky once entered (see getFinancialDistress) - keep
    // liquidating every day until money is fully non-negative or there is
    // nothing left, rather than re-checking the floor and re-arming a fresh
    // grace period every time a single sale nudges money back above it.
    if (this._receivershipActive) {
      if (this.money >= 0) {
        this._receivershipActive = false;
        this._belowFloorSinceDay = null;
        return; // genuinely clear
      }
      const distress = this.getFinancialDistress();
      if (!distress.hasEscapeRoute) {
        this._gameOver = true;
        this.bus.emit('game:over', { reason: 'bankrupt' });
        return;
      }
      if (this._lastForcedSaleDay !== this._currentDay) {
        this._lastForcedSaleDay = this._currentDay;
        this._forceLiquidateOneTrain();
      }
      return;
    }

    const distress = this.getFinancialDistress();

    if (!distress.belowFloor) {
      // Recovered before receivership ever began (or never fell) - a later
      // dip below the floor starts its own fresh grace period.
      this._belowFloorSinceDay = null;
      if (distress.severity === 'warning') {
        this.bus.emit('toast', {
          text: `Money is ${formatMoney(this.money)} - take out a loan or sell a train before it's too late.`,
          kind: 'bad',
        });
        this._noteBeat();
      }
      return;
    }

    if (!distress.hasEscapeRoute) {
      // Bankruptcy (C2 stage 4): loans exhausted, nothing of non-zero value
      // left to sell. No grace period can help here.
      this._gameOver = true;
      this.bus.emit('game:over', { reason: 'bankrupt' });
      return;
    }

    if (this._belowFloorSinceDay == null) this._belowFloorSinceDay = this._currentDay;
    const daysBelow = this._currentDay - this._belowFloorSinceDay;

    if (daysBelow < INSOLVENCY_GRACE_DAYS) {
      // Grace (C2 stage 2): escalating critical warning, no forced sale yet.
      const remaining = INSOLVENCY_GRACE_DAYS - daysBelow;
      this.bus.emit('toast', {
        text: `Money is ${formatMoney(this.money)} - receivership begins in ${remaining} day${remaining === 1 ? '' : 's'} unless you take a loan or sell a train.`,
        kind: 'bad',
      });
      this._noteBeat();
      return;
    }

    // Grace expired: receivership (C2 stage 3) begins.
    this._receivershipActive = true;
    this._lastForcedSaleDay = this._currentDay;
    this._forceLiquidateOneTrain();
  }

  // ---- disasters (Tier 3) -------------------------------------------------

  getSpeedMultiplier() {
    return this._harshWinter ? HARSH_WINTER_SPEED_MULT : 1;
  }

  repairTile(idx) {
    const fee = this._blockedRepairs.get(idx);
    if (fee === undefined) return false;
    if (!this.spend(fee, 'repairs')) return false;
    const tile = this.world.tiles && this.world.tiles[idx];
    if (tile) tile.blocked = false;
    this._blockedRepairs.delete(idx);
    this.bus.emit('toast', { text: 'Track repaired.', kind: 'good' });
    return true;
  }

  _rollDisasters(ctx) {
    // Fair Weather (Addendum A3.2): no disasters at all, including the
    // harsh-winter speed penalty rolled just below.
    if (this._scenarioMods.disastersEnabled === false) return;
    const season = this.world.clock ? this.world.clock.season : -1;
    if (season === 3) {
      if (!this._winterRolledThisSeason) {
        this._winterRolledThisSeason = true;
        this._harshWinter = this._chance(HARSH_WINTER_CHANCE);
        if (this._harshWinter) {
          this.bus.emit('disaster', { kind: 'harsh_winter', tiles: [] });
          this.bus.emit('toast', { text: 'A harsh winter is slowing trains across the valley.', kind: 'warn' });
        }
      }
    } else {
      this._winterRolledThisSeason = false;
      this._harshWinter = false;
    }

    if (this._chance(LANDSLIDE_CHANCE)) this._triggerLandslide();
    if (this._chance(BOILER_FAILURE_CHANCE)) this._triggerBoilerFailure(ctx);
    if (this._chance(DEMAND_BOOM_CHANCE)) this._triggerDemandBoom();
  }

  _triggerLandslide() {
    const tiles = this.world.tiles;
    if (!Array.isArray(tiles)) return;
    const candidates = [];
    for (let idx = 0; idx < tiles.length; idx++) {
      const t = tiles[idx];
      if (t && !t.blocked && t.siteId == null && (t.type === 'hill' || t.type === 'mountain')) candidates.push(idx);
    }
    if (candidates.length === 0) return;
    const idx = this._pick(candidates);
    tiles[idx].blocked = true;
    this._blockedRepairs.set(idx, LANDSLIDE_REPAIR_FEE);
    this.bus.emit('disaster', { kind: 'landslide', tiles: [idx] });
    this.bus.emit('toast', { text: 'A landslide has blocked a section of track.', kind: 'bad' });
    this._noteBeat();
  }

  _triggerBoilerFailure(ctx) {
    const trains = ctx && typeof ctx.getTrains === 'function' ? ctx.getTrains() : [];
    const running = trains.filter((t) => t.state === 'running');
    if (running.length === 0) return;
    const train = this._pick(running);
    this.bus.emit('disaster', { kind: 'boiler_failure', tiles: [] });
    this.bus.emit('train:broken', { trainId: train.id });
    this._noteBeat();
  }

  // Also used as a cheap, harmless Addendum A1.3 cadence nudge (see
  // _nudgeBeat) when nothing else notable has happened in a while.
  _triggerDemandBoom() {
    const sites = this._sitesArray().filter((s) => Array.isArray(s.consumes) && s.consumes.length > 0);
    if (sites.length === 0) return false;
    const site = this._pick(sites);
    site.demand = site.demand || {};
    for (const c of site.consumes) {
      const cap = c.perDay * DEMAND_GROWTH_CAP_MULT * DEMAND_BOOM_MULT;
      site.demand[c.item] = clamp((site.demand[c.item] || c.perDay) * DEMAND_BOOM_MULT, 0, cap);
    }
    this.bus.emit('disaster', { kind: 'demand_boom', tiles: [] });
    this.bus.emit('toast', { text: `${site.name || site.id} is booming - demand has surged.`, kind: 'good' });
    this._noteBeat();
    return true;
  }

  // ---- Addendum A1.3 event cadence: "something notable" every ~45 game
  // seconds. A real scheduler - every notable emit site above calls
  // _noteBeat(); if none has fired recently, update() nudges one itself. ----

  _noteBeat() {
    this._lastBeatAt = this._elapsedSeconds;
  }

  getLastBeatAge() {
    return this._elapsedSeconds - this._lastBeatAt;
  }

  // Cheap, non-annoying nudge: prefer a fresh contract offer (useful, not
  // just noise); fall back to a small demand boom. Throttled in update() to
  // at most once per game-second so an empty board/no-sites edge case can't
  // spin every frame.
  _nudgeBeat() {
    if (this.getBoard().length < CADENCE_BOARD_TARGET && this.offerContract()) return;
    this._triggerDemandBoom();
  }

  // ---- frame/day wiring ---------------------------------------------------

  update(dt, ctx) {
    this._ctx = ctx || this._ctx;
    this._elapsedSeconds += dt || 0;
    this._expireRushOffers();
    if (this.getLastBeatAge() > EVENT_CADENCE_SECONDS
      && this._elapsedSeconds - this._lastNudgeAttempt >= CADENCE_NUDGE_RETRY_SECONDS) {
      this._lastNudgeAttempt = this._elapsedSeconds;
      this._nudgeBeat();
    }
  }

  _onDayEnded({ day }) {
    this._currentDay = day;
    this._dailyIndustryTick();
    this._flowSitesToStations(this._ctx);
    this._expireAndSettleContracts(day);
    this._ensureBoardFilled();
    if (day >= this._nextRushDay) {
      this._generateRushOffer();
      this._nextRushDay = day + this._randInt(RUSH_MIN_INTERVAL_DAYS, RUSH_MAX_INTERVAL_DAYS);
    }
    this._settleDay(this._ctx);
    this._checkMilestones();
    this._rollDisasters(this._ctx);
    this._rolloverLedger(day);
  }

  // ---- persistence ----------------------------------------------------------

  serialize() {
    return {
      money: this.money,
      lifetimeRevenue: this.lifetimeRevenue,
      era: this.era,
      unlockedTechs: Array.from(this.unlockedTechs),
      ledger: this.getLedger(),
      ledgerHistory: this.getLedgerHistory(),
      contracts: this.contracts.map((c) => ({ ...c })),
      nextContractId: this._nextContractId,
      milestonesPaid: Array.from(this._milestonesPaid),
      deliveredTotals: { ...this._deliveredTotals },
      contractsCompletedCount: this._contractsCompletedCount,
      lastNet: this._lastNet,
      blockedRepairs: Array.from(this._blockedRepairs.entries()),
      harshWinter: this._harshWinter,
      winterRolledThisSeason: this._winterRolledThisSeason,
      gameOver: this._gameOver,
      currentDay: this._currentDay,
      loans: this.loans.map((l) => ({ ...l })),
      nextLoanId: this._nextLoanId,
      belowFloorSinceDay: this._belowFloorSinceDay,
      receivershipActive: this._receivershipActive,
      lastForcedSaleDay: this._lastForcedSaleDay,
      soldTrainIds: Array.from(this._soldTrainIds),
      scenario: this.scenario,
      elapsedSeconds: this._elapsedSeconds,
      lastBeatAt: this._lastBeatAt,
      nextRushDay: this._nextRushDay,
    };
  }

  // Restores onto an already-constructed instance (the constructor needs
  // world/bus which a plain static factory wouldn't have on load).
  deserialize(data) {
    if (!data) return;
    this.money = data.money ?? this.money;
    this.lifetimeRevenue = data.lifetimeRevenue ?? this.lifetimeRevenue;
    this.era = data.era ?? this.era;
    this.unlockedTechs = new Set(data.unlockedTechs || []);
    this._currentDay = data.currentDay ?? this._currentDay;
    this.ledger = data.ledger
      ? { day: data.ledger.day, revenue: { ...this._emptyLedger(0).revenue, ...data.ledger.revenue }, costs: { ...this._emptyLedger(0).costs, ...data.ledger.costs } }
      : this._emptyLedger(this._currentDay);
    this.ledgerHistory = Array.isArray(data.ledgerHistory) ? data.ledgerHistory.map((l) => ({ ...l })) : [];
    this.contracts = Array.isArray(data.contracts) ? data.contracts.map((c) => ({ ...c })) : [];
    this._nextContractId = data.nextContractId || 1;
    this._milestonesPaid = new Set(data.milestonesPaid || []);
    this._deliveredTotals = { ...(data.deliveredTotals || {}) };
    this._contractsCompletedCount = data.contractsCompletedCount || 0;
    this._lastNet = data.lastNet || 0;
    this._blockedRepairs = new Map(data.blockedRepairs || []);
    this._harshWinter = !!data.harshWinter;
    this._winterRolledThisSeason = !!data.winterRolledThisSeason;
    this._gameOver = !!data.gameOver;
    this.loans = Array.isArray(data.loans) ? data.loans.map((l) => ({ ...l })) : [];
    this._nextLoanId = data.nextLoanId || 1;
    this._belowFloorSinceDay = data.belowFloorSinceDay ?? null;
    this._receivershipActive = !!data.receivershipActive;
    this._lastForcedSaleDay = data.lastForcedSaleDay ?? null;
    this._soldTrainIds = new Set(data.soldTrainIds || []);
    if (data.scenario) this.setScenario(data.scenario);
    this._elapsedSeconds = data.elapsedSeconds || 0;
    this._lastBeatAt = data.lastBeatAt || 0;
    this._nextRushDay = data.nextRushDay || (this._currentDay + this._randInt(RUSH_MIN_INTERVAL_DAYS, RUSH_MAX_INTERVAL_DAYS));
  }
}

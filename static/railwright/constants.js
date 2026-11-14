// Railwright shared constants. Pure data + the milestone predicates (which
// are logic in spirit but are specified by the design contract to live here
// as data-shaped `check(game)` functions). Nothing here touches game state,
// the DOM, or randomness.

// --- Grid / camera (design contract section 3) -----------------------------
export const GRID_W = 72;
export const GRID_H = 56;
export const TILE = 32;
export const MIN_ZOOM = 0.35;
export const MAX_ZOOM = 2.2;

// 8-way directions, clockwise from East. Even indices are orthogonal, odd
// indices are diagonal - utils.stepDistance relies on that parity.
// 0:E 1:SE 2:S 3:SW 4:W 5:NW 6:N 7:NE
export const DIR_DX = [1, 1, 0, -1, -1, -1, 0, 1];
export const DIR_DY = [0, 1, 1, 1, 0, -1, -1, -1];
export const OPPOSITE = [4, 5, 6, 7, 0, 1, 2, 3];
export const DIR_COUNT = 8;

// --- Clock -------------------------------------------------------------
export const DAY_SECONDS = 100;
export const SPEEDS = [0, 1, 2, 4];
export const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];

// --- Items ---------------------------------------------------------------
export const ITEMS = {
  coal: { name: 'Coal', colour: '#48454a', wagon: 'hopper', basePrice: 9 },
  ore: { name: 'Iron Ore', colour: '#8a5a3b', wagon: 'hopper', basePrice: 11 },
  stone: { name: 'Stone', colour: '#8d8c88', wagon: 'hopper', basePrice: 7 },
  grain: { name: 'Grain', colour: '#d7b25e', wagon: 'hopper', basePrice: 10 },
  logs: { name: 'Logs', colour: '#6b4a2c', wagon: 'flatbed', basePrice: 8 },
  oil: { name: 'Oil', colour: '#433f4d', wagon: 'tanker', basePrice: 16 },
  steel: { name: 'Steel', colour: '#7f8c99', wagon: 'flatbed', basePrice: 26 },
  lumber: { name: 'Lumber', colour: '#b98a52', wagon: 'flatbed', basePrice: 19 },
  flour: { name: 'Flour', colour: '#e6ddc4', wagon: 'boxcar', basePrice: 22 },
  fuel: { name: 'Fuel', colour: '#c46a2a', wagon: 'tanker', basePrice: 31 },
  goods: { name: 'Goods', colour: '#c9553f', wagon: 'boxcar', basePrice: 44 },
  tools: { name: 'Tools', colour: '#5f8ca8', wagon: 'boxcar', basePrice: 48 },
  machinery: { name: 'Machinery', colour: '#4c6b7a', wagon: 'flatbed', basePrice: 66 },
  passengers: { name: 'Passengers', colour: '#e0c060', wagon: 'coach', basePrice: 14 },
  mail: { name: 'Mail', colour: '#d0d4dc', wagon: 'boxcar', basePrice: 20 },
};

export const ITEM_KEYS = Object.keys(ITEMS);

// Derived lookup: item key -> its preferred wagon type. A wagon may only
// carry items whose preferred wagon matches its own type.
export const WAGON_FOR_ITEM = Object.fromEntries(
  ITEM_KEYS.map((key) => [key, ITEMS[key].wagon]),
);

// --- Sites (design contract section 5) --------------------------------
// Recipe table: raw sites always produce; processing sites need every
// `consumes` entry available in stock before they produce (economy.js's
// job to enforce - this table is just the data).
//
// CONTRACT-GAP: the doc gives town/city recipes only as "scale with pop"
// without base numbers. The perDay figures below are the level-1 baseline;
// economy.js is expected to scale them by population/level at runtime.
// The port's "any item at 1.25x" rule doesn't fit the {item,perDay} shape,
// so it's flagged with `consumesAny`/`priceMultiplier` instead of a list.
export const SITE_KINDS = {
  coal_mine: { name: 'Colliery', produces: [{ item: 'coal', perDay: 14 }], consumes: [] },
  iron_mine: { name: 'Iron Mine', produces: [{ item: 'ore', perDay: 12 }], consumes: [] },
  quarry: { name: 'Quarry', produces: [{ item: 'stone', perDay: 12 }], consumes: [] },
  farm: { name: 'Farm', produces: [{ item: 'grain', perDay: 14 }], consumes: [] },
  logging_camp: { name: 'Logging Camp', produces: [{ item: 'logs', perDay: 12 }], consumes: [] },
  oil_well: { name: 'Oil Well', produces: [{ item: 'oil', perDay: 8 }], consumes: [] },
  smelter: {
    name: 'Smelter',
    produces: [{ item: 'steel', perDay: 10 }],
    consumes: [{ item: 'ore', perDay: 10 }, { item: 'coal', perDay: 6 }],
  },
  sawmill: {
    name: 'Sawmill',
    produces: [{ item: 'lumber', perDay: 12 }],
    consumes: [{ item: 'logs', perDay: 12 }],
  },
  mill: {
    name: 'Flour Mill',
    produces: [{ item: 'flour', perDay: 11 }],
    consumes: [{ item: 'grain', perDay: 12 }],
  },
  refinery: {
    name: 'Refinery',
    produces: [{ item: 'fuel', perDay: 8 }],
    consumes: [{ item: 'oil', perDay: 8 }],
  },
  factory: {
    name: 'Factory',
    produces: [{ item: 'goods', perDay: 8 }],
    consumes: [{ item: 'steel', perDay: 6 }, { item: 'lumber', perDay: 6 }],
  },
  workshop: {
    name: 'Workshop',
    produces: [{ item: 'tools', perDay: 7 }],
    consumes: [{ item: 'steel', perDay: 5 }, { item: 'lumber', perDay: 4 }],
  },
  machine_works: {
    name: 'Machine Works',
    produces: [{ item: 'machinery', perDay: 5 }],
    consumes: [{ item: 'steel', perDay: 6 }, { item: 'fuel', perDay: 4 }],
  },
  town: {
    name: 'Town',
    produces: [{ item: 'passengers', perDay: 6 }, { item: 'mail', perDay: 3 }],
    consumes: [{ item: 'goods', perDay: 4 }, { item: 'flour', perDay: 4 }, { item: 'tools', perDay: 2 }],
  },
  city: {
    name: 'City',
    produces: [{ item: 'passengers', perDay: 16 }, { item: 'mail', perDay: 8 }],
    consumes: [
      { item: 'goods', perDay: 10 },
      { item: 'flour', perDay: 10 },
      { item: 'tools', perDay: 6 },
      { item: 'machinery', perDay: 3 },
    ],
  },
  port: {
    name: 'Harbour',
    produces: [],
    consumes: [],
    consumesAny: true,
    priceMultiplier: 1.25,
  },
};

export const SITE_STOCK_CAP = 240;

// --- Track network (design contract section 6) -------------------------
export const TRACK_COST = { plain: 60, forest: 90, hill: 150, mountain: 0, water: 0 };
export const BRIDGE_COST = 480;
export const TUNNEL_COST = 900;
export const SIGNAL_COST = 120;
export const STATION_COST = 900;
export const STATION_EXTRA_PLATFORM_COST = 700; // each platform beyond the first
export const STATION_RADIUS = 3;
export const DEMOLISH_REFUND = 0.4;
// Addendum B: raised 6x from 0.35 (a fully idle player with 3 trains and a
// little track took 198 days to go bankrupt at the old rate - upkeep alone
// was never a real cost). Combined with the higher LOCOS/WAGONS upkeep
// below, this is deliberately punishing for track that isn't earning.
export const TRACK_UPKEEP_PER_TILE_PER_DAY = 2.1;
export const DEADLOCK_SECONDS = 25;
export const DISPATCH_FEE = 250;

// --- Trains (design contract section 7) --------------------------------
// Addendum B: every `upkeep` below is raised roughly 9x over DESIGN.md's
// original figures (a locomotive that costs $1200-32000 but only billed
// $6-45/day in upkeep was nearly free to own). This is the other half of
// the idle-bankruptcy fix - see TRACK_UPKEEP_PER_TILE_PER_DAY - and is sized
// so a good route's now-larger distance-scaled revenue (see economy.js's
// DISTANCE_MULT_* knobs) still comfortably outruns it. WAGONS upkeep below
// is raised a more modest ~5x - wagons are already the cheap, disposable
// half of a consist and shouldn't dominate the upkeep math on their own.
export const LOCOS = {
  shunter: { name: 'Pug 0-4-0', cost: 1200, speed: 1.4, power: 2, upkeep: 55, maxWagons: 2, era: 0, colour: '#6b7d55' },
  workhorse: { name: 'Bramble 2-6-0', cost: 3200, speed: 2.0, power: 4, upkeep: 125, maxWagons: 4, era: 0, colour: '#7a4230' },
  hauler: { name: 'Ironback 2-8-2', cost: 7500, speed: 1.8, power: 8, upkeep: 235, maxWagons: 7, era: 0, colour: '#3f4a52' },
  express: { name: 'Kestrel 4-6-2', cost: 9800, speed: 3.6, power: 3, upkeep: 265, maxWagons: 4, era: 1, colour: '#2f5d7c' },
  diesel: { name: 'DL-12 Vanguard', cost: 18000, speed: 3.0, power: 9, upkeep: 405, maxWagons: 8, era: 1, colour: '#9a6a20', tech: 'diesel_traction' },
  electric: { name: 'EM-4 Meridian', cost: 32000, speed: 4.2, power: 12, upkeep: 360, maxWagons: 10, era: 2, colour: '#365f4a', tech: 'electrification', needsWire: true },
};

export const WAGONS = {
  hopper: { name: 'Hopper', cost: 400, capacity: 20, upkeep: 11 },
  boxcar: { name: 'Boxcar', cost: 450, capacity: 16, upkeep: 11 },
  tanker: { name: 'Tanker', cost: 600, capacity: 18, upkeep: 13 },
  flatbed: { name: 'Flatbed', cost: 500, capacity: 14, upkeep: 11 },
  coach: { name: 'Coach', cost: 700, capacity: 24, upkeep: 14 },
};

export const LOAD_RATE = 8;
export const LOAD_FULL_TIMEOUT = 120;
export const ACCEL = 0.8;
export const BRAKE = 1.6;

// --- Economy (design contract section 8) --------------------------------
export const STARTING_MONEY = 12000;
export const BANKRUPTCY_FLOOR = -5000;

// --- Addendum A2: anti-soft-lock escape routes --------------------------
// A loan is a real cost (6%/day compounds fast), not free money - it exists
// so a broke player has time to reroute/sell rather than dying instantly.
export const LOAN_AMOUNT = 8000;
export const LOAN_MAX_COUNT = 3;
export const LOAN_DAILY_INTEREST_RATE = 0.06;
export const LOAN_AVAILABLE_BELOW_MONEY = 2000;
export const TRAIN_SELL_REFUND_RATE = 0.5; // trains refund 50% of loco+wagon cost
export const CONTRACT_ABANDON_PENALTY_MULT = 0.5; // half the normal failure penalty

// --- Addendum A1.2: rush contracts (the anti-lull "drop what you're doing
// and decide" beat) -------------------------------------------------------
export const RUSH_REWARD_MULT = 1.8;
export const RUSH_MIN_INTERVAL_DAYS = 2;
export const RUSH_MAX_INTERVAL_DAYS = 4;
export const RUSH_BOARD_LIFETIME_SECONDS = 90; // game seconds before it leaves the board unaccepted

// --- Addendum A3.2: scenario modifiers ------------------------------------
// Economy-side effects only. `trackCostMult`/`bridgeCostMult` are read (not
// applied) here - network.js owns actual track/bridge cost computation, so
// it must multiply its own TRACK_COST/BRIDGE_COST figures by these when a
// scenario sets them. Everything else (demand, contract rewards, board size,
// processing input needs, port price, upkeep, disasters) is applied directly
// inside economy.js via Economy#setScenario.
export const SCENARIO_MODIFIERS = {
  highlands: { trackCostMult: 1.25 },
  braided_river: { bridgeCostMult: 0.6 },
  boomtown: { demandMult: 2, contractRewardMult: 1.3, boardTargetMult: 0.7 },
  coal_country: { processingInputMult: 1.35, portPriceMult: 1.5 },
  lean_years: { upkeepMult: 0.8 },
  fair_weather: { disastersEnabled: false, contractRewardMult: 0.85 },
};

export const TECHS = {
  tunnelling: { name: 'Tunnelling', cost: 4000, era: 0 },
  long_span: { name: 'Long-Span Bridges', cost: 6500, era: 1 },
  auto_signals: { name: 'Automatic Signals', cost: 5000, era: 1 },
  telegraph: { name: 'Telegraph Office', cost: 3500, era: 0 },
  heavy_freight: { name: 'Heavy Freight', cost: 8000, era: 1 },
  diesel_traction: { name: 'Diesel Traction', cost: 14000, era: 1 },
  electrification: { name: 'Electrification', cost: 26000, era: 2 },
  centralised_ctc: { name: 'Centralised CTC', cost: 12000, era: 2 },
};

// Index = era, value = lifetime revenue required to reach it. Era gates what
// may be bought, not what already exists.
export const ERA_THRESHOLDS = [0, 60000, 250000];

// Milestones are lump-sum payouts. `check` is a pure predicate over the
// `game` object shape (section 10) - defensive against missing sub-objects
// since network.js/economy.js/trains.js are built in parallel and their
// internal shapes beyond what's frozen in the contract aren't guaranteed yet.
export const MILESTONES = [
  {
    id: 'connect_three_towns',
    name: 'Three Towns Linked',
    description: 'Connect three towns or cities to the rail network.',
    reward: 3000,
    check(game) {
      const sites = game?.world?.sites ?? [];
      const linked = sites.filter((s) => (s?.kind === 'town' || s?.kind === 'city') && s.stationId);
      return linked.length >= 3;
    },
  },
  {
    id: 'five_trains_running',
    name: 'Five Trains Running',
    description: 'Have five trains running simultaneously.',
    reward: 5000,
    check(game) {
      const trains = game?.trains ?? [];
      return trains.filter((t) => t?.state === 'running').length >= 5;
    },
  },
  {
    id: 'deliver_500_steel',
    name: 'Iron and Steel',
    description: 'Deliver 500 units of steel in total.',
    reward: 8000,
    check(game) {
      return (game?.economy?.stats?.deliveredByItem?.steel ?? 0) >= 500;
    },
  },
  {
    id: 'profit_2000_per_day',
    name: 'In the Black',
    description: 'Reach a net profit of $2,000 in a single day.',
    reward: 10000,
    check(game) {
      const net = game?.economy?.lastSettlement?.net;
      return typeof net === 'number' && net >= 2000;
    },
  },
  {
    id: 'town_level_3',
    name: 'Boomtown',
    description: 'Grow a town to level 3.',
    reward: 6000,
    check(game) {
      const sites = game?.world?.sites ?? [];
      return sites.some((s) => (s?.kind === 'town' || s?.kind === 'city') && (s.level ?? 0) >= 3);
    },
  },
  {
    id: 'ten_contracts',
    name: 'Man of Contract',
    description: 'Complete ten contracts.',
    reward: 7500,
    check(game) {
      const contracts = game?.economy?.contracts ?? [];
      return contracts.filter((c) => c?.state === 'complete').length >= 10;
    },
  },
  {
    id: 'bridge_the_river',
    name: 'Bridge the River',
    description: "Build a bridge across the valley's river.",
    reward: 2500,
    check(game) {
      const tracks = game?.network?.track;
      if (!tracks || typeof tracks.values !== 'function') return false;
      for (const t of tracks.values()) {
        if (t?.kind === 'bridge') return true;
      }
      return false;
    },
  },
  {
    id: 'electrify_50_tiles',
    name: 'Electric Age',
    description: 'Electrify 50 tiles of track.',
    reward: 15000,
    check(game) {
      const tracks = game?.network?.track;
      if (!tracks || typeof tracks.values !== 'function') return false;
      let count = 0;
      for (const t of tracks.values()) {
        if (t?.electrified) count++;
      }
      return count >= 50;
    },
  },
];

// Invented English-valley place names, used to name towns/city/port and to
// flavour industrial site names (e.g. "Ashcombe Colliery").
export const PLACE_NAMES = [
  'Ashcombe', 'Wrenford', 'Kilnbridge', 'Marrowdale', 'Stagwater',
  'Thistlemoor', 'Coldharbour', 'Greyfen', 'Ember Hollow', 'Hartwell',
  'Millbrook', 'Foxglove', 'Ravensmoor', 'Stonebridge', 'Larkspur',
  'Oakenfold', 'Brindlewood', 'Fenwick', 'Wychwood', 'Cranmoor',
  'Sedgeley', 'Thornbury', 'Applecross', 'Wyndale',
];

// --- Art direction palette (day/night variants) ------------------------
export const PALETTE = {
  day: {
    parchment: '#e8dfc4',
    forest: '#5c7a4d',
    hill: '#a3814c',
    mountain: '#6e6558',
    water: '#4f93ab',
    rail: '#3a3f44',
    railHighlight: '#c46a2a',
    station: '#5f3d2e',
    signalRed: '#b0372c',
    signalGreen: '#4c8c4a',
    ink: '#2b2620',
    accent: '#2f5d7c',
  },
  night: {
    parchment: '#232833',
    forest: '#1c2a19',
    hill: '#332c22',
    mountain: '#201d22',
    water: '#0d1f28',
    rail: '#787f88',
    railHighlight: '#e8873a',
    station: '#e0c060',
    signalRed: '#ff5a45',
    signalGreen: '#63e06a',
    ink: '#e8e2d0',
    accent: '#7fb0d8',
  },
};

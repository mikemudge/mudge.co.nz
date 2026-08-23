// Overrun - entry point. Bootstraps the canvas + stylesheet, owns the game
// loop and state machine (start -> playing -> levelup -> gameover), input
// handling, camera, and HUD/overlay rendering. No p5/bundler - plain canvas
// 2D and native ES modules, per the shared appinit.js loader contract.
import { clamp, formatTime, ARENA_SIZE } from './utils.js';
import { Player } from './player.js';
import { recomputeStats, applyUpgrade, rollUpgrades } from './upgrades.js';
import {
  updateSpawning, updateEnemies, drawEnemies, drawBossWarning,
} from './enemies.js';
import {
  tryAutoAttack, updatePlayerProjectiles, updateEnemyProjectiles, updateBlades,
  updateXpGems, drawProjectiles, drawBlades, drawXpGems,
} from './weapons.js';
import { ParticleSystem } from './particles.js';

const BEST_TIME_KEY = 'overrun_best_time';
const GRID_SPACING = 60;

// --- DOM bootstrap ----------------------------------------------------------
const styleLink = document.createElement('link');
styleLink.rel = 'stylesheet';
styleLink.href = '/static/overrun/overrun.css';
document.head.appendChild(styleLink);

const canvas = document.createElement('canvas');
canvas.id = 'overrun-canvas';
document.body.appendChild(canvas);
const ctx = canvas.getContext('2d');

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
resizeCanvas();
window.addEventListener('resize', resizeCanvas);

// --- Persistent best time ----------------------------------------------------
function loadBestTime() {
  try {
    const raw = localStorage.getItem(BEST_TIME_KEY);
    return raw ? parseFloat(raw) || 0 : 0;
  } catch {
    return 0;
  }
}
function saveBestTime(seconds) {
  try {
    localStorage.setItem(BEST_TIME_KEY, String(seconds));
  } catch {
    // localStorage unavailable (private mode etc) - best time just won't persist.
  }
}

// --- Game state --------------------------------------------------------------
const state = {
  status: 'start', // 'start' | 'playing' | 'levelup' | 'gameover'
  player: null,
  enemies: [],
  playerProjectiles: [],
  enemyProjectiles: [],
  xpGems: [],
  particles: null,
  kills: 0,
  survivalTime: 0,
  spawnTimer: 0.8,
  nextBossTime: 60,
  bossIndex: 0,
  bossWarningActive: false,
  bossWarnTimer: 0,
  pendingLevelUp: false,
  newBest: false,
  camera: { x: 0, y: 0 },
  canvas, // the <canvas> element itself; .width/.height give viewport size
  levelUpCards: [],
  levelUpCardRects: [],
  bestTime: loadBestTime(),
};

function resetGame() {
  state.player = new Player();
  recomputeStats(state.player);
  state.enemies = [];
  state.playerProjectiles = [];
  state.enemyProjectiles = [];
  state.xpGems = [];
  state.particles = new ParticleSystem();
  state.kills = 0;
  state.survivalTime = 0;
  state.spawnTimer = 0.8;
  state.nextBossTime = 60;
  state.bossIndex = 0;
  state.bossWarningActive = false;
  state.bossWarnTimer = 0;
  state.pendingLevelUp = false;
  state.newBest = false;
  state.levelUpCards = [];
  state.levelUpCardRects = [];
  updateCamera();
  state.status = 'playing';
}

function updateCamera() {
  const p = state.player;
  const w = canvas.width;
  const h = canvas.height;
  let cx = p.x - w / 2;
  let cy = p.y - h / 2;
  cx = clamp(cx, 0, Math.max(0, ARENA_SIZE - w));
  cy = clamp(cy, 0, Math.max(0, ARENA_SIZE - h));
  state.camera.x = cx;
  state.camera.y = cy;
}

function triggerGameOver() {
  state.status = 'gameover';
  if (state.survivalTime > state.bestTime) {
    state.bestTime = state.survivalTime;
    state.newBest = true;
    saveBestTime(state.bestTime);
  } else {
    state.newBest = false;
  }
}

function enterLevelUp() {
  state.status = 'levelup';
  state.levelUpCards = rollUpgrades(state.player);
}

function chooseUpgrade(index) {
  const card = state.levelUpCards[index];
  if (!card) return;
  applyUpgrade(state.player, card.id);
  state.status = 'playing';
}

// --- Input ---------------------------------------------------------------
const MOVE_KEYS = new Set(['w', 'a', 's', 'd', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright']);
const keysHeld = new Set();

window.addEventListener('keydown', (e) => {
  const key = e.key.toLowerCase();
  if (MOVE_KEYS.has(key)) {
    keysHeld.add(key);
    e.preventDefault();
  }

  if (key === 'enter') {
    if (state.status === 'start' || state.status === 'gameover') resetGame();
  } else if (['1', '2', '3'].includes(key) && state.status === 'levelup') {
    chooseUpgrade(parseInt(key, 10) - 1);
  }
});

window.addEventListener('keyup', (e) => {
  keysHeld.delete(e.key.toLowerCase());
});

canvas.addEventListener('click', (e) => {
  if (state.status === 'start' || state.status === 'gameover') {
    resetGame();
    return;
  }
  if (state.status === 'levelup') {
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    for (let i = 0; i < state.levelUpCardRects.length; i++) {
      const r = state.levelUpCardRects[i];
      if (mx >= r.x && mx <= r.x + r.w && my >= r.y && my <= r.y + r.h) {
        chooseUpgrade(i);
        break;
      }
    }
  }
});

// --- Update ----------------------------------------------------------------
function update(dt) {
  if (state.status !== 'playing') return;

  state.survivalTime += dt;
  state.player.update(dt, keysHeld);
  tryAutoAttack(state);
  updatePlayerProjectiles(state, dt);
  updateBlades(state, dt);
  updateEnemies(state, dt);
  updateEnemyProjectiles(state, dt);
  updateXpGems(state, dt);
  updateSpawning(state, dt);
  state.particles.update(dt);
  updateCamera();

  if (state.player.hp <= 0) {
    triggerGameOver();
    return;
  }
  if (state.pendingLevelUp) {
    state.pendingLevelUp = false;
    enterLevelUp();
  }
}

// --- Drawing -----------------------------------------------------------------
function drawBackgroundGrid() {
  const { camera } = state;
  const w = canvas.width;
  const h = canvas.height;
  const offsetX = -(((camera.x % GRID_SPACING) + GRID_SPACING) % GRID_SPACING);
  const offsetY = -(((camera.y % GRID_SPACING) + GRID_SPACING) % GRID_SPACING);
  ctx.fillStyle = 'rgba(140, 200, 255, 0.12)';
  for (let x = offsetX; x < w + GRID_SPACING; x += GRID_SPACING) {
    for (let y = offsetY; y < h + GRID_SPACING; y += GRID_SPACING) {
      ctx.beginPath();
      ctx.arc(x, y, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawArenaBounds() {
  const { camera } = state;
  ctx.strokeStyle = 'rgba(80, 160, 220, 0.35)';
  ctx.lineWidth = 4;
  ctx.strokeRect(-camera.x, -camera.y, ARENA_SIZE, ARENA_SIZE);
}

function wrapText(text, cx, y, maxWidth, lineHeight) {
  const words = text.split(' ');
  let line = '';
  let ly = y;
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      ctx.fillText(line, cx, ly);
      line = word;
      ly += lineHeight;
    } else {
      line = test;
    }
  }
  if (line) ctx.fillText(line, cx, ly);
  return ly + lineHeight;
}

function drawHUD() {
  const p = state.player;
  const barW = 220;
  const barH = 18;
  const x = 20;
  let y = 20;

  ctx.textAlign = 'left';
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 4, y - 4, barW + 8, barH + 8);
  ctx.fillStyle = '#3a1414';
  ctx.fillRect(x, y, barW, barH);
  const hpPct = clamp(p.hp / p.maxHp, 0, 1);
  ctx.fillStyle = '#ff4d4d';
  ctx.fillRect(x, y, barW * hpPct, barH);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px monospace';
  ctx.fillText(`HP  ${Math.ceil(p.hp)} / ${p.maxHp}`, x + 6, y + barH - 4);

  y += barH + 10;
  ctx.fillStyle = 'rgba(0,0,0,0.5)';
  ctx.fillRect(x - 4, y - 4, barW + 8, barH - 2);
  ctx.fillStyle = '#132038';
  ctx.fillRect(x, y, barW, barH - 8);
  const xpPct = clamp(p.xp / p.xpToNext, 0, 1);
  ctx.fillStyle = '#39d1ff';
  ctx.fillRect(x, y, barW * xpPct, barH - 8);
  ctx.fillStyle = '#fff';
  ctx.font = '11px monospace';
  ctx.fillText(`Lv ${p.level}   XP ${Math.floor(p.xp)} / ${p.xpToNext}`, x + 6, y + barH - 12);

  ctx.textAlign = 'right';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 24px monospace';
  ctx.fillText(formatTime(state.survivalTime), canvas.width - 20, 34);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#ccc';
  ctx.fillText(`Kills: ${state.kills}`, canvas.width - 20, 56);
  ctx.fillStyle = '#888';
  ctx.fillText(`Best: ${formatTime(state.bestTime)}`, canvas.width - 20, 76);
}

function drawWorld() {
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const [shx, shy] = state.particles.shakeOffset();
  ctx.save();
  ctx.translate(shx, shy);

  drawBackgroundGrid();
  drawArenaBounds();
  drawXpGems(ctx, state.camera, state);
  drawEnemies(ctx, state.camera, state.enemies);
  drawBlades(ctx, state.camera, state.player);
  drawProjectiles(ctx, state.camera, state);
  state.player.draw(ctx, state.camera);
  state.particles.draw(ctx, state.camera);

  ctx.restore();

  drawBossWarning(ctx, state, canvas.width, canvas.height);
  drawHUD();
}

function drawStartScreen() {
  ctx.fillStyle = '#05070d';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#22e0ff';
  ctx.shadowColor = '#22e0ff';
  ctx.shadowBlur = 20;
  ctx.font = 'bold 56px monospace';
  ctx.fillText('OVERRUN', cx, cy - 90);
  ctx.shadowBlur = 0;

  ctx.fillStyle = '#e8f6ff';
  ctx.font = '16px monospace';
  ctx.fillText('WASD or Arrow Keys to move. Auto-attack targets nearest enemy.', cx, cy - 30);
  ctx.fillText('Collect XP gems, level up, and pick an upgrade to survive longer.', cx, cy - 6);

  ctx.fillStyle = '#39ff6a';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('Press ENTER or click to start', cx, cy + 50);

  ctx.fillStyle = '#888';
  ctx.font = '14px monospace';
  ctx.fillText(`Best time: ${formatTime(state.bestTime)}`, cx, cy + 90);
}

function drawGameOverOverlay() {
  ctx.fillStyle = 'rgba(2, 4, 10, 0.72)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ff4d4d';
  ctx.font = 'bold 44px monospace';
  ctx.fillText('YOU DIED', cx, cy - 110);

  ctx.fillStyle = '#fff';
  ctx.font = '20px monospace';
  ctx.fillText(`Survived: ${formatTime(state.survivalTime)}`, cx, cy - 55);
  ctx.fillText(`Enemies Killed: ${state.kills}`, cx, cy - 25);
  ctx.fillText(`Level Reached: ${state.player.level}`, cx, cy + 5);

  ctx.fillStyle = state.newBest ? '#39ff6a' : '#aaa';
  ctx.font = 'bold 18px monospace';
  ctx.fillText(`Best: ${formatTime(state.bestTime)}${state.newBest ? '  (NEW BEST!)' : ''}`, cx, cy + 40);

  ctx.fillStyle = '#39ff6a';
  ctx.font = 'bold 20px monospace';
  ctx.fillText('Press ENTER or click to play again', cx, cy + 95);
}

function drawLevelUpOverlay() {
  ctx.fillStyle = 'rgba(2, 4, 10, 0.75)';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const cx = canvas.width / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 30px monospace';
  ctx.fillText('LEVEL UP!', cx, canvas.height / 2 - 170);
  ctx.font = '14px monospace';
  ctx.fillStyle = '#aaa';
  ctx.fillText('Choose an upgrade - click a card or press 1 / 2 / 3', cx, canvas.height / 2 - 144);

  const cardW = Math.min(230, (canvas.width - 80) / 3.3);
  const cardH = 250;
  const gap = 22;
  const totalW = cardW * 3 + gap * 2;
  const startX = cx - totalW / 2;
  const y = canvas.height / 2 - cardH / 2 + 20;

  state.levelUpCardRects = [];
  state.levelUpCards.forEach((card, i) => {
    const x = startX + i * (cardW + gap);
    state.levelUpCardRects.push({ x, y, w: cardW, h: cardH });

    ctx.fillStyle = '#0d1526';
    ctx.fillRect(x, y, cardW, cardH);
    ctx.strokeStyle = '#39d1ff';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, cardW, cardH);

    const midX = x + cardW / 2;
    ctx.fillStyle = '#39d1ff';
    ctx.font = 'bold 13px monospace';
    ctx.fillText(`[ ${i + 1} ]`, midX, y + 26);

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 16px monospace';
    const nameEndY = wrapText(card.name, midX, y + 56, cardW - 24, 20);

    ctx.fillStyle = '#bcd';
    ctx.font = '12px monospace';
    wrapText(card.description, midX, Math.max(nameEndY, y + 90), cardW - 24, 16);

    ctx.fillStyle = '#889';
    ctx.font = '12px monospace';
    ctx.fillText(`Lv ${card.level} -> ${card.nextLevel}`, midX, y + cardH - 48);

    ctx.fillStyle = '#39ff6a';
    ctx.font = 'bold 13px monospace';
    const valueLine = card.currentLabel === '-'
      ? `New: ${card.nextLabel}`
      : `${card.currentLabel}  ->  ${card.nextLabel}`;
    ctx.fillText(valueLine, midX, y + cardH - 24);
  });
}

function draw() {
  if (state.status === 'start') {
    drawStartScreen();
    return;
  }

  drawWorld();

  if (state.status === 'levelup') drawLevelUpOverlay();
  if (state.status === 'gameover') drawGameOverOverlay();
}

// --- Main loop ---------------------------------------------------------------
let lastTime = performance.now();
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05);
  lastTime = now;
  update(dt);
  draw();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

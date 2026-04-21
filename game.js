/**
 * Охота за жемчужинами — каркас игры.
 * Расширение: сюжет, враги, уровни — отдельными системами поверх текущего цикла.
 */

/**
 * Короткий псевдоним к переводам. Работает через window.i18n (из i18n.js).
 * Если i18n ещё не загружен или ключ не найден — вернёт ключ как есть,
 * так что приложение никогда не «падает» из-за отсутствующего перевода.
 * Поскольку canvas перерисовывается каждый кадр, смена языка подхватывается
 * автоматически без каких-либо дополнительных действий.
 */
function _t(key, params) {
  if (typeof window !== "undefined" && window.i18n && typeof window.i18n.t === "function") {
    return window.i18n.t(key, params);
  }
  return key;
}

/** Состояния конечного автомата игры */
const GameState = {
  START: "start",
  PLAYING: "playing",
  PAUSED: "paused",
  /** Предложение перейти глубже после 10 жемчужин */
  STAGE_OFFER: "stageOffer",
  /** Заглушка второго этапа (меню из старого оверлея) */
  NEXT_STAGE: "nextStage",
  /** Вступление: плавный fade и сюжет перед игрой на этапе 2 */
  STAGE_TWO_INTRO: "stageTwoIntro",
  /** Второй этап: те же правила сбора, цель победы 15 жемчужин */
  STAGE_TWO: "stageTwo",
  /** Выбор при появлении акул */
  SHARK_CHOICE: "sharkChoice",
  /** Погоня к пещере (после «Спрятаться») */
  CAVE_CHASE: "caveChase",
  /** Поражение в погоне — overlay, океан на фоне */
  CAVE_CHASE_LOSE: "caveChaseLose",
  /** Внутри пещеры после успешного укрытия */
  CAVE_INSIDE: "caveInside",
  /** Атмосферная пауза после выхода из пещеры */
  CAVE_EXIT_TRANSITION: "caveExitTransition",
  /** Выбор после выхода из пещеры */
  CAVE_AFTER_CHOICE: "caveAfterChoice",
  /** Поиск затонувшего корабля */
  SHIP_HUNT: "shipHunt",
  /** Заглушка после «Спрятаться» */
  SHELTER_STUB: "shelterStub",
  WIN: "win",
  LOSE: "lose",
};

/** Жемчужин для предложения «нырнуть глубже» */
const STAGE_PEARL_COUNT = 10;
/** После «Продолжить сбор» — отличный результат при стольких жемчужинах */
const BONUS_WIN_PEARL_COUNT = 15;
/** Сколько жемчужин одновременно на экране */
const PEARL_POOL = 6;
/** Слотов пузырей в пуле (не все активны сразу) */
const OXYGEN_POOL_CAPACITY = 5;
/** Минимум / максимум активных пузырей кислорода */
const OXYGEN_MIN_ACTIVE = 2;
const OXYGEN_MAX_ACTIVE = 5;
const AIR_MAX = 100;
/** Расход воздуха в секунду: стоим / сидя / движение */
const AIR_DRAIN_IDLE = 2.6;
const AIR_DRAIN_MOVING = 4.4;
/** Восстановление от кислородного пузыря (доля max) */
const OXYGEN_RESTORE = 32;
/** Интервал между спавнами при нормальном ритме (сек) */
const OXYGEN_SPAWN_INTERVAL_MIN = 3.5;
const OXYGEN_SPAWN_INTERVAL_MAX = 8.8;
/** Если давно не появлялся новый пузырь и мало активных — принудительный спавн */
const OXYGEN_MAX_GAP_BEFORE_FORCE = 11;
/** localStorage: макс. жемчужин за один заход */
const STORAGE_KEY_BEST_PEARLS = "pearlHuntBestPearls";

/** Погоня к пещере: скорость главной акулы чуть выше обычного плавания игрока */
const CAVE_PURSUE_SPEED_MAIN = 270;
const CAVE_PURSUE_SPEED_F1 = 234;
const CAVE_PURSUE_SPEED_F2 = 218;
/** Дистанция «поймали» (логические px) */
const CAVE_CATCH_DIST = 48;
/** Допуск до центра пещеры для побега (радиус + запас) */
const CAVE_WIN_REACH = 34;
/** Минимум / максимум горизонтального зазора игрок ↔ стая (доля ширины экрана) */
const CAVE_SAFE_DIST_MIN_FRAC = 0.26;
const CAVE_SAFE_DIST_MAX_FRAC = 0.34;
/** Фора после появления: акулы не могут завершить погоню (сек) */
const CAVE_GRACE_T_MIN = 0.85;
const CAVE_GRACE_T_MAX = 1.42;
/** Множитель скорости преследования в форе */
const CAVE_GRACE_PURSUIT_MUL = 0.38;

/** Фазы погони к пещере (только основной цикл, не победа/поражение) */
const CAVE_CHASE_PHASE_ORIENT = 0;
const CAVE_CHASE_PHASE_BUILDUP = 1;
const CAVE_CHASE_PHASE_CHASE = 2;
const CAVE_PHASE_ORIENT_MIN = 2;
const CAVE_PHASE_ORIENT_MAX = 3;
const CAVE_PHASE_BUILDUP_MIN = 2;
const CAVE_PHASE_BUILDUP_MAX = 3;
/** ORIENT: скорость преследования ~10–20 % */
const CAVE_SHARK_ORIENT_SPEED_MUL = 0.16;

/** Пещера внутри: замедление плавания (множитель к силе/потолку скорости) */
const CAVE_INSIDE_MOVE_SCALE = 0.48;
/** Длительность одной строки цели в пещере (сек), с плавным появлением/исчезновением */
const CAVE_INSIDE_GOAL_LINE_DUR = 3.2;
/** Сдвиг старта следующей строки (сек) — лёгкое перекрытие */
const CAVE_INSIDE_GOAL_STAGGER = 1.85;
/** Конец показа всех строк цели (сек) */
const CAVE_INSIDE_GOAL_TEXT_END =
  CAVE_INSIDE_GOAL_STAGGER * 2 + CAVE_INSIDE_GOAL_LINE_DUR + 0.9;
/** Enter — выход в океан после вступления (сек) */
const CAVE_INSIDE_ENTER_AFTER = CAVE_INSIDE_GOAL_TEXT_END - 0.5;
/** Минимальная блокировка выхода из пещеры */
const CAVE_INSIDE_EXIT_LOCK_T = 2.8;
/** Короткая мягкая «заминка» после укрытия: первые секунды плывём медленнее */
const CAVE_INSIDE_SOFT_LOCK_T = 3.25;

/** Лабиринт внутри пещеры (DFS по «комнатам») — меньше клеток = шире проход на экране */
const CAVE_MAZE_CELL_COLS = 5;
const CAVE_MAZE_CELL_ROWS = 3;
/** Удержание у выхода для мягкого автоперехода (сек) */
const CAVE_INSIDE_EXIT_DWELL = 0.52;
/** Радиус фонарика игрока (px) */
const CAVE_TORCH_RADIUS = 178;
/** Радиус фонарика друга (чуть меньше) */
const CAVE_TORCH_RADIUS_BUDDY = 138;
/** Мягкий ореол у маски (добавляется в рендере) */
const CAVE_TORCH_HALO = 62;
/** Затухание «памяти» пройденных клеток за кадр (ближе к 1 — дольше помнит) */
const CAVE_HEAT_DECAY = 0.99925;
/** Скорость накопления памяти у игрока / у друга */
const CAVE_HEAT_GAIN_PLAYER = 0.95;
const CAVE_HEAT_GAIN_BUDDY = 0.42;

/**
 * Альфа одной строки цели (0…1) по времени с начала пещеры.
 * @param {number} T
 * @param {number} lineIndex
 */
function _caveGoalLineAlpha(T, lineIndex) {
  const t0 = lineIndex * CAVE_INSIDE_GOAL_STAGGER;
  const u = (T - t0) / CAVE_INSIDE_GOAL_LINE_DUR;
  if (u <= 0) return 0;
  if (u < 0.16) return u / 0.16;
  if (u < 0.7) return 1;
  if (u < 1) return Math.max(0, 1 - (u - 0.7) / 0.3);
  return 0;
}

function _caveShuffleOrder4() {
  const a = [0, 1, 2, 3];
  for (let i = 3; i > 0; i--) {
    const j = (Math.random() * (i + 1)) | 0;
    const t = a[i];
    a[i] = a[j];
    a[j] = t;
  }
  return a;
}

function _caveFloorNeighbors4(grid, W, H, x, y) {
  const d4 = [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ];
  /** @type {number[][]} */
  const list = [];
  for (const [dx, dy] of d4) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
    if (grid[ny][nx]) list.push([nx, ny]);
  }
  return list;
}

function _caveCarveFallbackPath(
  grid,
  W,
  H,
  fromX,
  fromY,
  toX,
  toY
) {
  let x = fromX;
  let y = fromY;
  while (y > toY) {
    grid[y][x] = 1;
    if (y > 0) grid[y - 1][x] = 1;
    y -= 1;
  }
  while (y < toY) {
    grid[y][x] = 1;
    if (y + 1 < H) grid[y + 1][x] = 1;
    y += 1;
  }
  while (x !== toX) {
    grid[toY][x] = 1;
    x += x < toX ? 1 : -1;
  }
  grid[toY][toX] = 1;
}

/**
 * Расширяет проходимость: стена становится полом, если у неё ≥2 соседа-пола.
 * @param {number[][]} grid
 * @param {number} W
 * @param {number} H
 * @param {number} passes
 */
function dilateCaveWalkGrid(grid, W, H, passes) {
  let cur = grid.map((row) => row.slice());
  for (let p = 0; p < passes; p++) {
    const next = cur.map((row) => row.slice());
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        if (cur[y][x]) continue;
        const n = _caveFloorNeighbors4(cur, W, H, x, y).length;
        if (n >= 2) next[y][x] = 1;
      }
    }
    cur = next;
  }
  return cur;
}

/**
 * @param {number} cellCols
 * @param {number} cellRows
 */
function buildCaveInsideMaze(cellCols, cellRows) {
  const W = cellCols * 2 + 1;
  const H = cellRows * 2 + 1;
  /** @type {number[][]} */
  const grid = Array.from({ length: H }, () => Array(W).fill(0));
  const dirs = [
    [0, 2],
    [2, 0],
    [0, -2],
    [-2, 0],
  ];
  function carve(cx, cy) {
    grid[cy][cx] = 1;
    const ord = _caveShuffleOrder4();
    for (const k of ord) {
      const [dx, dy] = dirs[k];
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) continue;
      if (!grid[ny][nx]) {
        grid[cy + dy / 2][cx + dx / 2] = 1;
        carve(nx, ny);
      }
    }
  }
  const scx = 1 + (((Math.random() * cellCols) | 0) * 2);
  const scy = 1 + (((Math.random() * cellRows) | 0) * 2);
  carve(scx, scy);

  function pickFloorNearCenter(row) {
    const xs = [];
    for (let x = 1; x < W - 1; x++) {
      if (grid[row][x]) xs.push(x);
    }
    if (xs.length === 0) return 1;
    const want = (W - 1) * 0.5;
    xs.sort((a, b) => Math.abs(a - want) - Math.abs(b - want));
    return xs[0];
  }

  const entranceGx = pickFloorNearCenter(H - 2);
  const entranceGy = H - 2;
  grid[H - 1][entranceGx] = 1;

  // Стартовая камера укрытия: игрок и друг сначала оказываются в небольшой «пещере».
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      const x = entranceGx + dx;
      const y = entranceGy + dy;
      if (x < 1 || y < 0 || x >= W - 1 || y >= H) continue;
      grid[y][x] = 1;
    }
  }

  /** @type {{ gx: number; gy: number }[]} */
  const forcedDeadEnds = [];
  const shortBranches = [
    { sx: -1, sy: -1, dx: -1, dy: 0 },
    { sx: 1, sy: -1, dx: 1, dy: 0 },
    { sx: 0, sy: -1, dx: 0, dy: -1 },
  ];
  shortBranches.sort(() => Math.random() - 0.5);
  const useBranches = 1;
  for (let i = 0; i < shortBranches.length && forcedDeadEnds.length < useBranches; i++) {
    const b = shortBranches[i];
    let cx = entranceGx + b.sx;
    let cy = entranceGy + b.sy;
    if (cx < 1 || cy < 1 || cx >= W - 1 || cy >= H - 1) continue;
    if (!grid[cy][cx]) continue;
    const len = 1 + (Math.random() < 0.58 ? 1 : 0);
    for (let step = 0; step < len; step++) {
      const nx = cx + b.dx;
      const ny = cy + b.dy;
      if (nx < 1 || ny < 1 || nx >= W - 1 || ny >= H - 1) break;
      if (grid[ny][nx]) break;
      if (_caveFloorNeighbors4(grid, W, H, nx, ny).length > 1) break;
      grid[ny][nx] = 1;
      forcedDeadEnds.push({ gx: nx, gy: ny });
      cx = nx;
      cy = ny;
    }
  }

  const exitGx = Math.max(2, W - 2);
  const exitGy = 1;
  grid[0][exitGx] = 1;

  // Настоящий путь: вверх -> в сторону -> снова вверх (к правому верхнему углу).
  const bendY = Math.max(3, H - 4);
  const bendX = Math.max(2, W - 4);
  const carveLine = (x1, y1, x2, y2) => {
    let x = x1;
    let y = y1;
    grid[y][x] = 1;
    while (x !== x2 || y !== y2) {
      if (y > y2) y--;
      else if (y < y2) y++;
      else if (x < x2) x++;
      else if (x > x2) x--;
      grid[y][x] = 1;
    }
  };
  carveLine(entranceGx, entranceGy, entranceGx, bendY);
  carveLine(entranceGx, bendY, bendX, bendY);
  carveLine(bendX, bendY, bendX, exitGy);
  carveLine(bendX, exitGy, exitGx, exitGy);

  function bfs(sx, sy) {
    const dist = Array.from({ length: H }, () => Array(W).fill(1e7));
    const qx = [sx];
    const qy = [sy];
    if (!grid[sy][sx]) return dist;
    dist[sy][sx] = 0;
    let head = 0;
    const d4 = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (head < qx.length) {
      const x = qx[head];
      const y = qy[head];
      head++;
      const d0 = dist[y][x];
      for (const [dx, dy] of d4) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        if (!grid[ny][nx]) continue;
        if (dist[ny][nx] <= d0 + 1) continue;
        dist[ny][nx] = d0 + 1;
        qx.push(nx);
        qy.push(ny);
      }
    }
    return dist;
  }

  let distStart = bfs(entranceGx, entranceGy);
  let distExit = bfs(exitGx, exitGy);
  if (distStart[exitGy][exitGx] > 1e6) {
    _caveCarveFallbackPath(
      grid,
      W,
      H,
      entranceGx,
      entranceGy,
      exitGx,
      exitGy
    );
    distStart = bfs(entranceGx, entranceGy);
    distExit = bfs(exitGx, exitGy);
  }

  const pathD0 = distStart[exitGy][exitGx];
  /** @type {boolean[][]} */
  const onPath = Array.from({ length: H }, () => Array(W).fill(false));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (!grid[y][x]) continue;
      if (distStart[y][x] + distExit[y][x] === pathD0) onPath[y][x] = true;
    }
  }

  /** @type {{ gx: number; gy: number; ux: number; uy: number }[]} */
  const falseGlow = [];
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!grid[y][x]) continue;
      if (x === exitGx && y === exitGy) continue;
      const nb = _caveFloorNeighbors4(grid, W, H, x, y);
      if (nb.length !== 1 || onPath[y][x]) continue;
      const nx = nb[0][0];
      const ny = nb[0][1];
      falseGlow.push({ gx: x, gy: y, ux: x - nx, uy: y - ny });
    }
  }

  /** @type {{ gx: number; gy: number; ph: number }[]} */
  const shadowAnchors = [];
  for (let t = 0; shadowAnchors.length < 9 && t < 260; t++) {
    const gx = 1 + ((Math.random() * (W - 2)) | 0);
    const gy = 1 + ((Math.random() * (H - 2)) | 0);
    if (grid[gy][gx]) continue;
    if (_caveFloorNeighbors4(grid, W, H, gx, gy).length === 0) continue;
    shadowAnchors.push({ gx, gy, ph: Math.random() * Math.PI * 2 });
  }

  /** @type {boolean[][]} */
  const chamber = Array.from({ length: H }, () => Array(W).fill(false));
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W - 1; x++) {
      if (
        grid[y][x] &&
        grid[y][x + 1] &&
        grid[y + 1][x] &&
        grid[y + 1][x + 1]
      ) {
        chamber[y][x] = true;
        chamber[y][x + 1] = true;
        chamber[y + 1][x] = true;
        chamber[y + 1][x + 1] = true;
      }
    }
  }
  for (let y = 1; y < H - 1; y++) {
    for (let x = 1; x < W - 1; x++) {
      if (!grid[y][x] || chamber[y][x]) continue;
      if (_caveFloorNeighbors4(grid, W, H, x, y).length >= 4) {
        chamber[y][x] = true;
      }
    }
  }

  /** Ложный «выход» — один яркий тупик в верхней половине, не настоящий выход */
  /** @type {{ gx: number; gy: number }[]} */
  const decoyGlows = [];
  const cand = falseGlow.filter((g) => g.gy < Math.floor(H * 0.52));
  cand.sort(() => Math.random() - 0.5);
  const forcedSet = new Set(forcedDeadEnds.map((d) => `${d.gx}:${d.gy}`));
  for (const d of forcedDeadEnds) {
    if (decoyGlows.length >= 1) break;
    if (Math.abs(d.gx - exitGx) + Math.abs(d.gy - exitGy) < 3) continue;
    decoyGlows.push({ gx: d.gx, gy: d.gy });
  }
  for (let i = 0; i < cand.length && decoyGlows.length < 1; i++) {
    if (Math.abs(cand[i].gx - exitGx) + Math.abs(cand[i].gy - exitGy) < 3) continue;
    if (forcedSet.has(`${cand[i].gx}:${cand[i].gy}`)) continue;
    decoyGlows.push({ gx: cand[i].gx, gy: cand[i].gy });
  }
  let tries = 0;
  while (decoyGlows.length < 1 && tries < 80) {
    tries++;
    const gx = 1 + ((Math.random() * (W - 2)) | 0);
    const gyMax = Math.max(2, Math.floor(H * 0.45));
    const gy = 1 + ((Math.random() * gyMax) | 0);
    if (!grid[gy][gx] || onPath[gy][gx]) continue;
    if (Math.abs(gx - exitGx) + Math.abs(gy - exitGy) < 3) continue;
    decoyGlows.push({ gx, gy });
  }

  const walkGrid = dilateCaveWalkGrid(grid, W, H, 2);

  const tunnelSoftGlows = falseGlow
    .slice()
    .sort(() => Math.random() - 0.5)
    .slice(0, Math.min(6, falseGlow.length));

  return {
    grid,
    walkGrid,
    W,
    H,
    entranceGx,
    entranceGy,
    exitGx,
    exitGy,
    distStart,
    distExit,
    pathD0,
    onPath,
    falseGlow,
    tunnelSoftGlows,
    decoyGlows,
    chamber,
    shadowAnchors,
  };
}

/** Высота волнистого дна по X (логические координаты) */
function seabedYAt(x, w, h, t) {
  return (
    h -
    12 +
    Math.sin(x * 0.011 + t * 0.1) * 11 +
    Math.sin(x * 0.024 + 0.85 + t * 0.04) * 7 +
    Math.sin(x * 0.045 + 2.1) * 3
  );
}

/**
 * Перспектива по Y: дальше вверху — слабее (туман), у дна — чуть контрастнее.
 * ~0.5…1
 */
function depthAlphaY(y, h) {
  const far = (h * 0.48 - y) / (h * 0.55);
  return Math.max(0.5, Math.min(1, 0.94 - far * 0.32));
}

/** Меньше «тумана» на силуэтах людей / дельфина / акул */
function characterDepthAlpha(y, h) {
  return Math.max(0.9, Math.min(1, depthAlphaY(y, h) * 1.06 + 0.06));
}

/** Скруглённый прямоугольник заливкой (без ctx.roundRect). */
function fillRoundRect(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.lineTo(x + w - rr, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
  ctx.lineTo(x + w, y + h - rr);
  ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
  ctx.lineTo(x + rr, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
  ctx.lineTo(x, y + rr);
  ctx.quadraticCurveTo(x, y, x + rr, y);
  ctx.closePath();
  ctx.fill();
}

/**
 * Акула этапа 2: тёмный силуэт, плавно к игроку, без урона.
 */
class StageTwoShark {
  /**
   * @param {number} w
   * @param {number} h
   * @param {number} index
   * @param {number} count
   */
  constructor(w, h, index, count) {
    this.seed = index * 2.31 + Math.random() * 0.4;
    const fromLeft = index % 2 === 0;
    const band = 0.34 + Math.random() * 0.28;
    this.x = fromLeft ? -20 - index * 52 : w + 20 + index * 52;
    this.y = h * band + (Math.random() - 0.5) * 32;
    const toCenter = fromLeft ? 1 : -1;
    this.vx = toCenter * (32 + Math.random() * 18);
    this.vy = 8 + Math.random() * 14;
    this.alpha = 0;
    this.angle = Math.atan2(this.vy, this.vx);
    this.emerge = 0;
    this._flee = false;
  }

  /**
   * @param {number} dt
   * @param {number} px
   * @param {number} py
   * @param {number} time
   * @param {boolean} fleeing
   * @param {{ wait?: boolean, creep?: boolean }} [opts]
   */
  update(dt, px, py, time, fleeing, opts) {
    this.emerge = Math.min(1, this.emerge + dt * 0.55);
    this.alpha = Math.min(0.98, this.alpha + dt * 0.52 * (0.35 + this.emerge * 0.65));

    if (opts && opts.wait) {
      const bob = Math.sin(time * 0.48 + this.seed) * 2.4;
      this.angle += Math.cos(time * 0.32 + this.seed) * 0.011 * dt;
      this.x += bob * dt * 2.8;
      this.y += Math.sin(time * 0.38 + this.seed) * 2.2 * dt;
      return;
    }

    if (opts && opts.creep) {
      const dx = px - this.x;
      const dy = py - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const lure = 0.11;
      this.vx += (dx / d) * 16 * lure * dt;
      this.vy += (dy / d) * 12 * lure * dt;
      const sp = Math.hypot(this.vx, this.vy);
      const cap = 34;
      if (sp > cap) {
        const k = cap / sp;
        this.vx *= k;
        this.vy *= k;
      }
      this.x += this.vx * dt;
      this.y += this.vy * dt;
      this.angle = Math.atan2(this.vy, this.vx);
      return;
    }

    const sway = Math.sin(time * 0.55 + this.seed) * 3.2;

    if (fleeing) {
      const dx = this.x - px;
      const dy = this.y - py;
      const d = Math.hypot(dx, dy) || 1;
      this.vx += (dx / d) * 55 * dt;
      this.vy += (dy / d) * 35 * dt;
      this.vx *= Math.exp(-dt * 0.35);
      this.vy *= Math.exp(-dt * 0.35);
    } else {
      const dx = px - this.x;
      const dy = py - this.y;
      const d = Math.hypot(dx, dy) || 1;
      const lure = 0.11;
      const pxn = -dy / d;
      const pyn = dx / d;
      this.vx += ((dx / d) * 26 + pxn * sway) * lure * dt;
      this.vy += (dy / d) * 22 * lure * dt;
    }

    const sp = Math.hypot(this.vx, this.vy);
    const cap = fleeing ? 220 : 68;
    if (sp > cap) {
      const k = cap / sp;
      this.vx *= k;
      this.vy *= k;
    }
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = Math.atan2(this.vy, this.vx);
    if (fleeing) {
      this.alpha = Math.max(0, this.alpha - dt * 0.35);
    }
  }

  /**
   * Погоня к пещере: плавное преследование цели с заданной скоростью.
   * @param {number} dt
   * @param {number} tx
   * @param {number} ty
   * @param {number} speed
   */
  updateCavePursuer(dt, tx, ty, speed) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy) || 1;
    const tvx = (dx / d) * speed;
    const tvy = (dy / d) * speed;
    const k = Math.min(4.6 * dt, 1);
    this.vx += (tvx - this.vx) * k;
    this.vy += (tvy - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = Math.atan2(this.vy, this.vx);
  }

  /**
   * Уплыть от пещеры после успешного укрытия.
   * @param {number} dt
   * @param {number} cx
   * @param {number} cy
   * @param {number} speed
   */
  updateCaveFlee(dt, cx, cy, speed) {
    const dx = this.x - cx;
    const dy = this.y - cy;
    const d = Math.hypot(dx, dy) || 1;
    const tvx = (dx / d) * speed;
    const tvy = (dy / d) * speed;
    const k = Math.min(3.2 * dt, 1);
    this.vx += (tvx - this.vx) * k;
    this.vy += (tvy - this.vy) * k;
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    this.angle = Math.atan2(this.vy, this.vx);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} viewH
   */
  render(ctx, viewH) {
    const da = characterDepthAlpha(this.y, viewH);
    ctx.save();
    ctx.globalAlpha = this.alpha * da;
    ctx.translate(this.x, this.y);
    ctx.rotate(this.angle);
    ctx.scale(2.65, 2.65);

    const body = "#070c14";
    const finDark = "#050810";
    const gillLight = "rgba(52, 78, 102, 0.88)";
    const rim = "rgba(95, 130, 165, 0.35)";

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(64, 1);
    ctx.lineTo(58, -6);
    ctx.lineTo(44, -9);
    ctx.lineTo(22, -10);
    ctx.lineTo(-4, -9);
    ctx.lineTo(-28, -6);
    ctx.lineTo(-42, -2);
    ctx.lineTo(-52, -22);
    ctx.lineTo(-60, -26);
    ctx.lineTo(-58, -10);
    ctx.lineTo(-62, 2);
    ctx.lineTo(-56, 14);
    ctx.lineTo(-44, 12);
    ctx.lineTo(-24, 11);
    ctx.lineTo(8, 12);
    ctx.lineTo(40, 11);
    ctx.lineTo(58, 8);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = finDark;
    ctx.beginPath();
    ctx.moveTo(4, -10);
    ctx.lineTo(0, -46);
    ctx.lineTo(24, -12);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.moveTo(26, 10);
    ctx.lineTo(18, 28);
    ctx.lineTo(36, 14);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-18, -6);
    ctx.lineTo(-26, -8);
    ctx.lineTo(-30, -4);
    ctx.lineTo(-22, -3);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-32, 6);
    ctx.lineTo(-38, 5);
    ctx.lineTo(-36, 10);
    ctx.closePath();
    ctx.fill();

    for (let i = 0; i < 5; i++) {
      const gx = 38 - i * 2.85;
      ctx.fillStyle = gillLight;
      ctx.beginPath();
      ctx.moveTo(gx, 5);
      ctx.lineTo(gx - 0.75, 12);
      ctx.lineTo(gx + 0.75, 12);
      ctx.lineTo(gx + 0.85, 5);
      ctx.closePath();
      ctx.fill();
    }

    ctx.strokeStyle = rim;
    ctx.lineWidth = 1.6;
    ctx.lineJoin = "miter";
    ctx.beginPath();
    ctx.moveTo(64, 1);
    ctx.lineTo(22, -10);
    ctx.lineTo(-42, -2);
    ctx.lineTo(-60, -26);
    ctx.lineTo(-56, 14);
    ctx.lineTo(40, 11);
    ctx.closePath();
    ctx.stroke();

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/**
 * Ввод с клавиатуры: стрелки и WASD.
 * Расширение: мышь, тач, переназначение клавиш — расширить keyMap и poll.
 */
class Input {
  constructor() {
    /** @type {Record<string, boolean>} */
    this.keys = Object.create(null);
    this._boundDown = (e) => this._onKey(e, true);
    this._boundUp = (e) => this._onKey(e, false);
    window.addEventListener("keydown", this._boundDown, { passive: false });
    window.addEventListener("keyup", this._boundUp, { passive: true });
  }

  _onKey(event, down) {
    const k = event.code;
    if (
      k === "ArrowUp" ||
      k === "ArrowDown" ||
      k === "ArrowLeft" ||
      k === "ArrowRight" ||
      k === "KeyW" ||
      k === "KeyA" ||
      k === "KeyS" ||
      k === "KeyD" ||
      k === "Escape" ||
      k === "Space" ||
      k === "Enter" ||
      k === "NumpadEnter"
    ) {
      event.preventDefault();
    }
    this.keys[k] = down;
  }

  /** Направление движения: { x: -1|0|1, y: -1|0|1 } */
  getMovementAxes() {
    let x = 0;
    let y = 0;
    if (this.keys["ArrowLeft"] || this.keys["KeyA"]) x -= 1;
    if (this.keys["ArrowRight"] || this.keys["KeyD"]) x += 1;
    if (this.keys["ArrowUp"] || this.keys["KeyW"]) y -= 1;
    if (this.keys["ArrowDown"] || this.keys["KeyS"]) y += 1;
    return { x, y };
  }

  consumeEscapePress() {
    if (this.keys["Escape"]) {
      this.keys["Escape"] = false;
      return true;
    }
    return false;
  }

  consumeEnterPress() {
    if (this.keys["Enter"] || this.keys["NumpadEnter"]) {
      this.keys["Enter"] = false;
      this.keys["NumpadEnter"] = false;
      return true;
    }
    return false;
  }

  /** Сбросить WASD/стрелки/пробел после HTML-кнопок, чтобы не «залипали» */
  clearNavigationKeys() {
    const keys = [
      "ArrowUp",
      "ArrowDown",
      "ArrowLeft",
      "ArrowRight",
      "KeyW",
      "KeyA",
      "KeyS",
      "KeyD",
      "Space",
      "Enter",
      "NumpadEnter",
    ];
    for (const k of keys) {
      this.keys[k] = false;
    }
  }

  dispose() {
    window.removeEventListener("keydown", this._boundDown);
    window.removeEventListener("keyup", this._boundUp);
  }
}

/**
 * Пузырьки: всплытие и лёгкий дрейф; при уходе за верх — снизу снова.
 * Расширение: размер стаи, глубина слоёв, взаимодействие с игроком.
 */
class BubbleField {
  constructor(count = 48) {
    this.count = count;
    /** @type {{ x: number, y: number, r: number, vy: number, phase: number, wobble: number }[]} */
    this.bubbles = [];
  }

  /** @param {{ width: number, height: number }} bounds */
  init(bounds) {
    this.bubbles.length = 0;
    for (let i = 0; i < this.count; i++) {
      this.bubbles.push(this._create(bounds, true));
    }
  }

  _create(bounds, randomY) {
    const w = bounds.width;
    const h = bounds.height;
    return {
      x: Math.random() * w,
      y: randomY ? Math.random() * h : h + Math.random() * 40 + 8,
      r: 1.5 + Math.random() * 2.5,
      vy: 18 + Math.random() * 42,
      phase: Math.random() * Math.PI * 2,
      wobble: 0.9 + Math.random() * 1.4,
    };
  }

  /** @param {number} dt @param {{ width: number, height: number }} bounds @param {number} time */
  update(dt, bounds, time) {
    if (this.bubbles.length === 0) this.init(bounds);
    const w = bounds.width;
    const h = bounds.height;
    for (const b of this.bubbles) {
      b.y -= b.vy * dt;
      b.x += Math.sin(time * b.wobble + b.phase) * 14 * dt;
      if (b.y < -b.r - 4) {
        Object.assign(b, this._create(bounds, false));
        b.x = Math.random() * w;
      }
      if (b.x < -b.r) b.x = w + b.r;
      if (b.x > w + b.r) b.x = -b.r;
    }
  }

  /** @param {CanvasRenderingContext2D} ctx */
  render(ctx) {
    ctx.save();
    for (const b of this.bubbles) {
      ctx.fillStyle = "rgba(200, 235, 255, 0.35)";
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

/**
 * Ныряльщик: инерция, update/render, простая фигура (голова, корпус, ласты).
 * Расширение: анимация ласт, снаряжение, хитбокс под коллизии.
 */
class Player {
  constructor() {
    this.x = 0;
    this.y = 0;
    this.vx = 0;
    this.vy = 0;
    /** Ускорение (логические px/с²) */
    this.accel = 520;
    this.maxSpeed = 260;
    /** Демпфирование скорости (чем больше — быстрее гасится инерция) */
    this.drag = 3.1;
    /** Полуразмеры AABB для удержания в границах canvas */
    this.halfW = 30;
    this.halfH = 44;
    /** Направление «взгляда» для отрисовки: -1 | 1 */
    this._face = 1;
  }

  /** Радиус коллизии с подбираемыми объектами (логические координаты) */
  getPickupRadius() {
    return 22;
  }

  resetToCenter(bounds) {
    this.x = bounds.width * 0.5;
    this.y = bounds.height * 0.5;
    this.vx = 0;
    this.vy = 0;
  }

  /**
   * @param {number} dt
   * @param {{ x: number, y: number }} axes
   * @param {{ width: number, height: number }} bounds
   * @param {boolean} [swimBoost] удержание Пробел — выше ускорение и потолок скорости
   * @param {number} [speedScale] множитель силы и потолка (узкие пространства, пещера)
   */
  update(dt, axes, bounds, swimBoost, speedScale) {
    const sc =
      speedScale === undefined || speedScale === null || speedScale <= 0
        ? 1
        : speedScale;
    const boost = !!swimBoost;
    const accel = (boost ? 720 : this.accel) * sc;
    const maxSp = (boost ? 352 : this.maxSpeed) * sc;
    const drag = boost ? 2.75 : this.drag + (sc < 1 ? (1 - sc) * 0.45 : 0);

    const len = Math.hypot(axes.x, axes.y);
    let ix = 0;
    let iy = 0;
    if (len > 0) {
      ix = axes.x / len;
      iy = axes.y / len;
    }
    this.vx += ix * accel * dt;
    this.vy += iy * accel * dt;

    const damp = Math.exp(-drag * dt);
    this.vx *= damp;
    this.vy *= damp;

    const sp = Math.hypot(this.vx, this.vy);
    if (sp > maxSp) {
      const k = maxSp / sp;
      this.vx *= k;
      this.vy *= k;
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    const hw = this.halfW;
    const hh = this.halfH;
    if (this.x < hw) {
      this.x = hw;
      this.vx = 0;
    } else if (this.x > bounds.width - hw) {
      this.x = bounds.width - hw;
      this.vx = 0;
    }
    if (this.y < hh) {
      this.y = hh;
      this.vy = 0;
    } else if (this.y > bounds.height - hh) {
      this.y = bounds.height - hh;
      this.vy = 0;
    }

    if (this.vx < -12) this._face = -1;
    else if (this.vx > 12) this._face = 1;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} time
   * @param {number} viewH высота canvas для глубины
   * @param {boolean} [swimBoost] усилить анимацию ласт и рук
   */
  render(ctx, time, viewH, swimBoost) {
    const b = swimBoost ? 1 : 0;
    const tilt = Math.max(
      -0.32,
      Math.min(0.32, this.vx * 0.001 + this.vy * 0.00038)
    );
    const bob = Math.sin(time * (2.45 + b * 1.9)) * (0.042 + b * 0.032);
    const finKick = Math.sin(time * (4.25 + b * 3.5)) * (0.24 + b * 0.16);
    const armWave = Math.sin(time * (5.2 + b * 4.2)) * (0.08 + b * 0.1);
    const da = characterDepthAlpha(this.y, viewH);

    ctx.save();
    ctx.globalAlpha = da;
    ctx.translate(this.x, this.y);
    ctx.scale(this._face, 1);
    ctx.rotate(tilt + bob);

    // Вид «к игроку»: вертикальный силуэт, центр — точка коллизий с жемчужинами
    ctx.fillStyle = "#e8b8a0";
    ctx.beginPath();
    ctx.arc(0, -26, 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.28)";
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.fillStyle = "rgba(25, 45, 62, 0.88)";
    const mx = -11;
    const my = -31;
    const mw = 22;
    const mh = 9;
    const rr = 3;
    ctx.beginPath();
    ctx.moveTo(mx + rr, my);
    ctx.lineTo(mx + mw - rr, my);
    ctx.quadraticCurveTo(mx + mw, my, mx + mw, my + rr);
    ctx.lineTo(mx + mw, my + mh - rr);
    ctx.quadraticCurveTo(mx + mw, my + mh, mx + mw - rr, my + mh);
    ctx.lineTo(mx + rr, my + mh);
    ctx.quadraticCurveTo(mx, my + mh, mx, my + mh - rr);
    ctx.lineTo(mx, my + rr);
    ctx.quadraticCurveTo(mx, my, mx + rr, my);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(200, 230, 255, 0.42)";
    ctx.fillRect(-7, -28, 6, 4);
    ctx.fillRect(1, -28, 6, 4);

    ctx.fillStyle = "#3a4d5e";
    ctx.strokeStyle = "rgba(0,0,0,0.22)";
    ctx.lineWidth = 1.4;
    ctx.fillRect(-15, -13, 30, 36);
    ctx.strokeRect(-15, -13, 30, 36);

    ctx.fillStyle = "#2d4558";
    ctx.beginPath();
    ctx.ellipse(-20, 2, 9, 22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.stroke();
    ctx.fillStyle = "rgba(100, 190, 255, 0.24)";
    ctx.fillRect(-24, -4, 5, 18);

    ctx.strokeStyle = "#c9957a";
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-12 + armWave * 4, -2);
    ctx.quadraticCurveTo(-22 + armWave * 6, 8, -20 + armWave * 5, 20);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(12 - armWave * 4, -2);
    ctx.quadraticCurveTo(22 - armWave * 6, 8, 20 - armWave * 5, 20);
    ctx.stroke();

    ctx.fillStyle = "#2f3d4c";
    const legS = Math.sin(time * (5.4 + b * 4)) * (1.2 + b * 1.8);
    ctx.fillRect(-13, 20 + legS, 11, 14);
    ctx.fillRect(2, 20 - legS, 11, 14);
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.strokeRect(-13, 20 + legS, 11, 14);
    ctx.strokeRect(2, 20 - legS, 11, 14);

    ctx.fillStyle = "#2a5588";
    ctx.save();
    ctx.translate(8, 34);
    ctx.rotate(-0.15 + finKick * (0.045 + b * 0.035));
    ctx.beginPath();
    ctx.moveTo(6, -2);
    ctx.lineTo(28, 0);
    ctx.lineTo(24, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(-8, 34);
    ctx.rotate(0.15 - finKick * (0.045 + b * 0.035));
    ctx.beginPath();
    ctx.moveTo(-6, -2);
    ctx.lineTo(-28, 0);
    ctx.lineTo(-24, 14);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/**
 * Жемчужина: сбор, респавн, мерцание/покачивание в render/update.
 * Расширение: типы жемчужин, звук сбора, магнит к игроку.
 */
class Pearl {
  constructor() {
    this.radius = 11;
    this.phase = Math.random() * Math.PI * 2;
    this.active = true;
    this.x = 0;
    this.y = 0;
    /** Таймер до появления после сбора */
    this._respawnCountdown = 0;
    /** Медленное опускание к дну (px/с), у каждой своё */
    this.sinkSpeed = 3.2 + Math.random() * 7;
    /** Горизонтальное колебание: амплитуда (px) и частота (рад/с) */
    this.horizAmp = 11 + Math.random() * 16;
    this.horizFreq = 0.35 + Math.random() * 0.58;
    /** Медленный постоянный дрейф по X */
    this.driftVx = (Math.random() - 0.5) * 16;
    /** Растворение у дна (без очков) */
    this._dissolving = false;
    this._dissolveT = 0;
  }

  _resetMotion() {
    this.sinkSpeed = 3.2 + Math.random() * 7;
    this.horizAmp = 11 + Math.random() * 16;
    this.horizFreq = 0.35 + Math.random() * 0.58;
    this.driftVx = (Math.random() - 0.5) * 16;
  }

  /**
   * Нижняя часть экрана (у «дна»), без всплытия — только лёгкое покачивание в render.
   * @param {{ width: number, height: number }} bounds
   * @param {Player} player
   * @param {{ x: number, y: number, radius: number, active?: boolean }[]} others
   * @param {{ x: number, y: number } | null} clusterFrom опционально — рядом с другой жемчужиной (группа)
   * @param {number | null} bandHint колонка 0…5 для равномерного разнесения по X
   */
  place(bounds, player, others, clusterFrom = null, bandHint = null) {
    const marginX = 52;
    const marginBottom = 52;
    const minFromPlayer = 100;
    const minGap = clusterFrom ? 20 : 26;
    const w = bounds.width;
    const h = bounds.height;
    const yMin = h * 0.52;
    const yMax = h - marginBottom - this.radius - 18;
    if (yMax <= yMin + 4) {
      this.x = w * 0.5;
      this.y = h * 0.78;
      this._dissolving = false;
      this._dissolveT = 0;
      return;
    }

    for (let attempt = 0; attempt < 72; attempt++) {
      let x;
      let y;
      if (clusterFrom && attempt < 24) {
        x = clusterFrom.x + (Math.random() - 0.5) * 34;
        y = clusterFrom.y + (Math.random() - 0.5) * 22;
      } else if (bandHint != null) {
        const nb = 6;
        const innerW = w - marginX * 2 - this.radius * 2;
        const bw = Math.max(24, innerW / nb);
        const bi = ((bandHint % nb) + Math.floor(attempt / 20)) % nb;
        const bx0 = marginX + this.radius + bi * bw;
        x = bx0 + Math.random() * Math.max(6, bw - this.radius * 2);
        y = yMin + Math.random() * Math.max(1, yMax - yMin);
      } else {
        x = marginX + Math.random() * Math.max(1, w - marginX * 2);
        y = yMin + Math.random() * Math.max(1, yMax - yMin);
      }
      x = Math.min(w - marginX - this.radius, Math.max(marginX + this.radius, x));
      y = Math.min(yMax, Math.max(yMin, y));

      if (Math.hypot(x - player.x, y - player.y) < minFromPlayer) continue;
      let ok = true;
      for (const o of others) {
        if (o === this) continue;
        if (o.active === false) continue;
        const r = o.radius ?? 11;
        if (Math.hypot(x - o.x, y - o.y) < this.radius + r + minGap) {
          ok = false;
          break;
        }
      }
      if (ok) {
        this.x = x;
        this.y = y;
        this._dissolving = false;
        this._dissolveT = 0;
        return;
      }
    }
    this.x = w * 0.5;
    this.y = Math.min(yMax, yMin + (yMax - yMin) * 0.5);
    this._dissolving = false;
    this._dissolveT = 0;
  }

  /**
   * @param {number} dt
   * @param {{ width: number, height: number }} bounds
   * @param {Player} player
   * @param {Pearl[]} allPearls
   * @param {number} time время сцены
   */
  update(dt, bounds, player, allPearls, time) {
    if (!this.active) {
      this._dissolving = false;
      this._dissolveT = 0;
      this._respawnCountdown -= dt;
      if (this._respawnCountdown <= 0) {
        this._resetMotion();
        this.place(
          bounds,
          player,
          allPearls,
          null,
          Math.floor(Math.random() * 6)
        );
        this.active = true;
      }
      return;
    }

    this.y += this.sinkSpeed * dt;
    this.x += this.driftVx * dt;
    const hx =
      this.horizAmp *
      this.horizFreq *
      Math.cos(time * this.horizFreq + this.phase);
    this.x += hx * dt;
    const mx = this.radius + 48;
    if (this.x < mx) this.x = mx;
    else if (this.x > bounds.width - mx) this.x = bounds.width - mx;

    const bed = seabedYAt(this.x, bounds.width, bounds.height, time);
    if (this.y >= bed - this.radius - 3) {
      this._dissolving = true;
    }
    if (this._dissolving) {
      this._dissolveT += dt * 0.52;
      if (this._dissolveT >= 1) {
        this._dissolving = false;
        this._dissolveT = 0;
        this.active = false;
        this._respawnCountdown = 1.4 + Math.random() * 1.8;
      }
    }
  }

  collect() {
    this.active = false;
    this._respawnCountdown = 2.0 + Math.random() * 2.5;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} time глобальное время сцены
   * @param {number} viewH высота вида для глубины
   */
  render(ctx, time, viewH) {
    if (!this.active) return;
    const swayX = Math.sin(time * 1.05 + this.phase) * 1.05;
    const swayY = Math.sin(time * 0.95 + this.phase * 1.08) * 0.72;
    const x = this.x + swayX;
    const y = this.y + swayY;
    const shimmer = 1 + Math.sin(time * 2.8 + this.phase) * 0.035;
    const dissolveA = this._dissolving
      ? Math.max(0, 1 - Math.pow(this._dissolveT, 0.82))
      : 1;
    const depthA = depthAlphaY(this.y, viewH);
    const alpha = dissolveA * depthA;

    ctx.save();
    ctx.globalAlpha = alpha * 0.35;
    ctx.fillStyle = "rgba(8, 18, 32, 0.55)";
    ctx.beginPath();
    ctx.ellipse(x, y + this.radius * 0.55, this.radius * 1.05, this.radius * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(shimmer, shimmer);

    const g = ctx.createRadialGradient(-3, -4, 1.5, 0, 0, this.radius);
    g.addColorStop(0, "#fffefb");
    g.addColorStop(0.35, "#f4eaf2");
    g.addColorStop(0.65, "#d2c0d8");
    g.addColorStop(1, "#8f7c8a");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(255, 255, 255, 0.35)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.82)";
    ctx.beginPath();
    ctx.ellipse(
      -this.radius * 0.38,
      -this.radius * 0.42,
      this.radius * 0.24,
      this.radius * 0.13,
      -0.45,
      0,
      Math.PI * 2
    );
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/**
 * Кислородный пузырь (не путать с декоративным BubbleField).
 * Расширение: редкие большие капсулы, щит от давления.
 */
class OxygenPickup {
  constructor() {
    this.radius = 16;
    this.phase = Math.random() * Math.PI * 2;
    this.active = false;
    this.x = 0;
    this.y = 0;
    /** Скорость всплытия вверх (логические px/с) */
    this.riseSpeed = 24 + Math.random() * 14;
  }

  /**
   * @param {number} dt
   * @param {{ width: number, height: number }} bounds
   */
  update(dt, bounds) {
    if (!this.active) return;
    this.y -= this.riseSpeed * dt;
    const top = this.radius + 40;
    if (this.y < top) {
      this.collect();
    }
  }

  /**
   * @param {{ width: number, height: number }} bounds
   * @param {Player} player
   * @param {{ x: number, y: number, radius: number, active?: boolean }[]} blockers
   * @param {{ xMin: number, xMax: number, yMin: number, yMax: number } | null} spawnHint полоса экрана для равномерного распределения
   */
  trySpawn(bounds, player, blockers, spawnHint = null) {
    const margin = 56;
    const minFromPlayer = 138;
    const minGap = 54;
    const w = bounds.width;
    const h = bounds.height;
    let xMin = margin;
    let xMax = w - margin;
    let yMin = h * 0.12;
    let yMax = h - margin - this.radius;
    if (spawnHint) {
      xMin = Math.max(margin, spawnHint.xMin);
      xMax = Math.min(w - margin, spawnHint.xMax);
      yMin = Math.max(h * 0.1, spawnHint.yMin);
      yMax = Math.min(h - margin - this.radius, spawnHint.yMax);
    }
    if (xMax <= xMin + 4 || yMax <= yMin + 4) {
      xMin = margin;
      xMax = w - margin;
      yMin = h * 0.12;
      yMax = h - margin - this.radius;
    }
    for (let attempt = 0; attempt < 55; attempt++) {
      const x = xMin + Math.random() * Math.max(1, xMax - xMin);
      const y = yMin + Math.random() * Math.max(1, yMax - yMin);
      if (Math.hypot(x - player.x, y - player.y) < minFromPlayer) continue;
      let ok = true;
      for (const o of blockers) {
        if (o === this || o.active === false) continue;
        const r = o.radius ?? 11;
        if (Math.hypot(x - o.x, y - o.y) < this.radius + r + minGap) {
          ok = false;
          break;
        }
      }
      if (ok) {
        this.x = x;
        this.y = y;
        this.active = true;
        this.phase = Math.random() * Math.PI * 2;
        this.riseSpeed = 24 + Math.random() * 14;
        return true;
      }
    }
    return false;
  }

  collect() {
    this.active = false;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {number} time
   * @param {number} viewH
   */
  render(ctx, time, viewH) {
    if (!this.active) return;
    const drift = Math.sin(time * 1.9 + this.phase) * 2.2;
    const x = this.x + drift;
    const y = this.y;
    const da = depthAlphaY(y, viewH);

    ctx.save();
    ctx.globalAlpha = da * 0.32;
    ctx.fillStyle = "rgba(6, 20, 36, 0.5)";
    ctx.beginPath();
    ctx.ellipse(x, y + 5, this.radius * 0.95, this.radius * 0.34, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = da;
    ctx.translate(x, y);

    ctx.shadowBlur = 22;
    ctx.shadowColor = "rgba(120, 255, 255, 0.55)";
    const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, this.radius);
    g.addColorStop(0, "rgba(230, 255, 255, 0.95)");
    g.addColorStop(0.5, "rgba(100, 220, 255, 0.45)");
    g.addColorStop(1, "rgba(30, 120, 180, 0.15)");
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    ctx.strokeStyle = "rgba(210, 255, 255, 0.95)";
    ctx.lineWidth = 3;
    ctx.stroke();

    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.beginPath();
    ctx.arc(-this.radius * 0.35, -this.radius * 0.35, this.radius * 0.22, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/**
 * Лёгкий отклик при сборе: всплывающий текст и короткоживущие частицы.
 * Расширение: звук, экранные ачивки.
 */
class PickupVfx {
  constructor() {
    /** @type {{ x: number, y: number, text: string, life: number, maxLife: number, vy: number, color: string }[]} */
    this.floats = [];
    /** @type {{ x: number, y: number, vx: number, vy: number, life: number, r: number, a: number }[]} */
    this.sparks = [];
  }

  clear() {
    this.floats.length = 0;
    this.sparks.length = 0;
  }

  addPearlBurst(wx, wy) {
    this.floats.push({
      x: wx,
      y: wy,
      text: "+1",
      life: 0.62,
      maxLife: 0.62,
      vy: -52,
      color: "#fff7f2",
    });
    for (let i = 0; i < 9; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 55 + Math.random() * 95;
      this.sparks.push({
        x: wx,
        y: wy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 25,
        life: 0.38 + Math.random() * 0.12,
        r: 1.2 + Math.random() * 2.2,
        a: 0.85,
      });
    }
  }

  addOxygenBurst(wx, wy) {
    this.floats.push({
      x: wx,
      y: wy,
      text: "+O₂",
      life: 0.58,
      maxLife: 0.58,
      vy: -46,
      color: "#cffffa",
    });
    for (let i = 0; i < 7; i++) {
      const a = Math.random() * Math.PI * 2;
      const sp = 40 + Math.random() * 70;
      this.sparks.push({
        x: wx,
        y: wy,
        vx: Math.cos(a) * sp,
        vy: Math.sin(a) * sp - 15,
        life: 0.35 + Math.random() * 0.1,
        r: 1.5 + Math.random() * 2.4,
        a: 0.75,
      });
    }
  }

  /** @param {number} dt */
  update(dt) {
    for (const f of this.floats) {
      f.life -= dt;
      f.y += f.vy * dt;
      f.vy *= Math.exp(-dt * 1.8);
    }
    this.floats = this.floats.filter((f) => f.life > 0);

    for (const s of this.sparks) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vy += 40 * dt;
      s.a = Math.max(0, s.life * 2.2);
    }
    this.sparks = this.sparks.filter((s) => s.life > 0);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   */
  render(ctx) {
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    for (const f of this.floats) {
      const t = f.life / f.maxLife;
      ctx.globalAlpha = Math.min(1, t * 1.4);
      ctx.font = "bold 18px system-ui, sans-serif";
      ctx.fillStyle = f.color;
      ctx.strokeStyle = "rgba(0,20,40,0.55)";
      ctx.lineWidth = 3;
      ctx.strokeText(f.text, f.x, f.y);
      ctx.fillText(f.text, f.x, f.y);
    }
    ctx.globalAlpha = 1;
    for (const s of this.sparks) {
      ctx.globalAlpha = Math.min(1, s.a);
      ctx.fillStyle = "rgba(230, 250, 255, 0.95)";
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }
}

/**
 * Препятствие (заготовка).
 * Расширение: хитбокс, движущиеся объекты — отдельные подклассы или компоненты.
 */
class Obstacle {
  constructor(x, y, w, h) {
    this.x = x;
    this.y = y;
    this.w = w;
    this.h = h;
  }
}

/**
 * Подводная сцена: градиент, лучи сверху, декор, лёгкое покачивание (синус).
 * Расширение: слои глубины, частицы ила, каустика.
 */
class UnderwaterScene {
  constructor() {
    this.t = 0;
    /** 0…1 — финальный подъём: слегка светлеет вода */
    this.ascentBoost = 0;
  }

  update(dt) {
    this.t += dt;
  }

  getSway() {
    const ab = this.ascentBoost * 0.55;
    return {
      x: Math.sin(this.t * 0.38) * (3.5 + ab),
      y: Math.sin(this.t * 0.29) * (2.2 + ab * 0.65),
    };
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ width: number, height: number }} bounds
   */
  renderBackground(ctx, bounds) {
    const { width: w, height: h } = bounds;
    const pad = 24;
    const ab = this.ascentBoost || 0;
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, "#7ad8dc");
    g.addColorStop(0.12, "#68c4d4");
    g.addColorStop(0.16, "#58b0c8");
    g.addColorStop(0.3, "#3d78a8");
    g.addColorStop(0.38, "#2d6490");
    g.addColorStop(0.46, "#234e78");
    g.addColorStop(0.55, "#1a4060");
    g.addColorStop(0.64, "#163650");
    g.addColorStop(0.72, "#122c44");
    g.addColorStop(0.88, "#1a3548");
    g.addColorStop(1, "#1e3a4a");
    ctx.fillStyle = g;
    ctx.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);
    if (ab > 0.02) {
      ctx.save();
      ctx.globalAlpha = ab * 0.14;
      const up = ctx.createLinearGradient(0, 0, 0, h * 0.55);
      up.addColorStop(0, "rgba(240, 252, 255, 0.5)");
      up.addColorStop(0.55, "rgba(160, 220, 245, 0.12)");
      up.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = up;
      ctx.fillRect(-pad, -pad, w + pad * 2, h + pad * 2);
      ctx.restore();
    }
  }

  /** Холодный туман вдали (верх / середина), без жёсткого дна */
  renderVolumeFog(ctx, bounds) {
    const w = bounds.width;
    const h = bounds.height;
    ctx.save();
    const g = ctx.createLinearGradient(0, 0, 0, h * 0.78);
    g.addColorStop(0, "rgba(170, 210, 228, 0.16)");
    g.addColorStop(0.35, "rgba(70, 110, 140, 0.08)");
    g.addColorStop(0.65, "rgba(30, 55, 75, 0.04)");
    g.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  /** Затемнение глубины и «туман» снизу (до объектов) */
  renderDepthAndMist(ctx, bounds) {
    const w = bounds.width;
    const h = bounds.height;
    ctx.save();
    const d = ctx.createLinearGradient(0, h * 0.22, 0, h);
    d.addColorStop(0, "rgba(0, 0, 0, 0)");
    d.addColorStop(0.38, "rgba(15, 40, 58, 0.06)");
    d.addColorStop(0.62, "rgba(10, 28, 42, 0.14)");
    d.addColorStop(0.86, "rgba(18, 42, 58, 0.22)");
    d.addColorStop(1, "rgba(22, 48, 62, 0.28)");
    ctx.fillStyle = d;
    ctx.fillRect(0, 0, w, h);

    const m = ctx.createRadialGradient(w * 0.45, h * 0.94, h * 0.05, w * 0.52, h * 1.02, h * 0.68);
    m.addColorStop(0, "rgba(190, 210, 220, 0.1)");
    m.addColorStop(0.42, "rgba(60, 90, 110, 0.12)");
    m.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = m;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  /** Доп. глубина поверх жемчужин / O₂ / игрока — мягкое затухание к низу */
  renderDepthWashOverEntities(ctx, bounds) {
    const w = bounds.width;
    const h = bounds.height;
    ctx.save();
    const g = ctx.createLinearGradient(0, h * 0.32, 0, h);
    g.addColorStop(0, "rgba(0, 0, 0, 0)");
    g.addColorStop(0.52, "rgba(20, 45, 62, 0.028)");
    g.addColorStop(0.78, "rgba(12, 32, 48, 0.07)");
    g.addColorStop(1, "rgba(8, 24, 38, 0.12)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const fog = ctx.createRadialGradient(w * 0.48, h * 0.99, 0, w * 0.52, h * 0.9, h * 0.55);
    fog.addColorStop(0, "rgba(30, 55, 72, 0.09)");
    fog.addColorStop(0.55, "rgba(14, 32, 48, 0.055)");
    fog.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.globalCompositeOperation = "multiply";
    ctx.fillStyle = fog;
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  /** Плавный переход воды к дну вдоль волны (без «режущей» линии) */
  renderWaterSandBlend(ctx, bounds) {
    const w = bounds.width;
    const h = bounds.height;
    const t = this.t;
    ctx.save();
    ctx.beginPath();
    for (let x = -10; x <= w + 10; x += 4) {
      const sy = seabedYAt(x, w, h, t);
      const uy = sy - 110;
      if (x === -10) ctx.moveTo(x, uy);
      else ctx.lineTo(x, uy);
    }
    for (let x = w + 10; x >= -10; x -= 4) {
      ctx.lineTo(x, seabedYAt(x, w, h, t));
    }
    ctx.closePath();
    const g = ctx.createLinearGradient(0, h * 0.48, 0, h * 0.98);
    g.addColorStop(0, "rgba(40, 85, 108, 0)");
    g.addColorStop(0.4, "rgba(95, 118, 128, 0.06)");
    g.addColorStop(0.72, "rgba(140, 128, 108, 0.14)");
    g.addColorStop(1, "rgba(168, 148, 120, 0.26)");
    ctx.fillStyle = g;
    ctx.fill();
    ctx.filter = "blur(7px)";
    ctx.globalAlpha = 0.62;
    ctx.fill();
    ctx.filter = "none";
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Мягкие рассеянные лучи (без жёстких полос) */
  renderRays(ctx, bounds) {
    const w = bounds.width;
    const h = bounds.height;
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const centers = [0.22, 0.38, 0.5, 0.62, 0.78];
    for (let i = 0; i < centers.length; i++) {
      const cx = w * centers[i] + Math.sin(this.t * 0.15 + i) * w * 0.03;
      const rg = ctx.createRadialGradient(cx, -h * 0.05, h * 0.02, cx, h * 0.65, h * 0.95);
      rg.addColorStop(0, "rgba(240, 255, 255, 0.11)");
      rg.addColorStop(0.28, "rgba(190, 235, 255, 0.055)");
      rg.addColorStop(0.35, "rgba(160, 220, 255, 0.045)");
      rg.addColorStop(0.65, "rgba(80, 140, 200, 0.018)");
      rg.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h * 0.88);
    }
    ctx.globalAlpha = 0.55;
    const g2 = ctx.createLinearGradient(0, 0, w * 0.3, h * 0.5);
    g2.addColorStop(0, "rgba(255, 255, 255, 0.06)");
    g2.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = g2;
    ctx.fillRect(0, 0, w * 0.55, h * 0.55);
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Песчаное дно по волнистой линии: мягкий верх, зернистость, лёгкое размытие массы */
  renderSandBed(ctx, bounds) {
    const w = bounds.width;
    const h = bounds.height;
    const t = this.t;
    ctx.save();

    ctx.beginPath();
    ctx.moveTo(-12, h + 80);
    for (let x = -12; x <= w + 12; x += 4) {
      ctx.lineTo(x, seabedYAt(x, w, h, t));
    }
    ctx.lineTo(w + 12, h + 80);
    ctx.closePath();

    const topSand = h - 160;
    const sg = ctx.createLinearGradient(0, topSand, 0, h + 40);
    sg.addColorStop(0, "rgba(200, 182, 152, 0.06)");
    sg.addColorStop(0.1, "rgba(168, 148, 122, 0.38)");
    sg.addColorStop(0.28, "rgba(138, 118, 96, 0.72)");
    sg.addColorStop(0.48, "rgba(108, 92, 74, 0.9)");
    sg.addColorStop(0.72, "rgba(78, 66, 54, 0.95)");
    sg.addColorStop(1, "rgba(52, 44, 36, 0.98)");
    ctx.filter = "blur(3.5px)";
    ctx.fillStyle = sg;
    ctx.fill();
    ctx.filter = "none";

    ctx.fillStyle = sg;
    ctx.globalAlpha = 0.82;
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.beginPath();
    ctx.moveTo(-12, seabedYAt(-12, w, h, t));
    for (let x = -9; x <= w + 12; x += 3) {
      ctx.lineTo(x, seabedYAt(x, w, h, t));
    }
    ctx.strokeStyle = "rgba(120, 102, 86, 0.1)";
    ctx.lineWidth = 20;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(88, 74, 60, 0.22)";
    ctx.shadowBlur = 22;
    ctx.stroke();
    ctx.shadowBlur = 0;

    const n = Math.floor(w * 1.15);
    for (let i = 0; i < n; i++) {
      const hash = (i * 2654435761) % 997;
      const sx = ((i * 31 + Math.sin(t * 0.17 + i * 0.09) * 28 + hash * 0.03) % (w + 24)) - 6;
      const by = seabedYAt(sx, w, h, t);
      const bump = Math.sin(sx * 0.08 + t * 0.4) * 1.8 + ((hash % 7) - 3) * 0.35;
      const sy = by + 4 + (i % 11) * 2.1 + Math.sin(i * 0.7) * 1.2 + bump;
      if (sy > h - 4) continue;
      const depth = Math.min(1, (sy - by) / 95);
      const a = 0.07 + depth * 0.2;
      const pick = i % 6;
      const c =
        pick === 0
          ? `rgba(228, 210, 182, ${a})`
          : pick === 1
            ? `rgba(198, 176, 148, ${a})`
            : pick === 2
              ? `rgba(168, 148, 122, ${a})`
              : pick === 3
                ? `rgba(138, 118, 96, ${a})`
                : pick === 4
                  ? `rgba(108, 92, 76, ${a})`
                  : `rgba(88, 74, 60, ${a})`;
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.arc(sx, sy, 0.35 + (i % 6) * 0.28 + (hash % 5) * 0.04, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  /** Водоросли вдали: мельче, холоднее, прозрачнее */
  renderDecorDistant(ctx, bounds) {
    const w = bounds.width;
    const h = bounds.height;
    const t = this.t;
    const placements = [0.06, 0.18, 0.32, 0.44, 0.56, 0.68, 0.8, 0.92, 0.5, 0.24, 0.76];
    for (let i = 0; i < placements.length; i++) {
      const px = w * placements[i] + Math.sin(t * 0.18 + i * 1.7) * (w * 0.035);
      const by = h * (0.44 + (i % 4) * 0.045) + Math.sin(t * 0.26 + i * 0.9) * 12;
      const ht = 18 + (i % 5) * 9;
      this._drawSeaweed(ctx, px, by, ht, true);
    }
  }

  /** Кораллы и водоросли: группы, неровно, на дне */
  renderDecor(ctx, bounds) {
    const w = bounds.width;
    const h = bounds.height;
    const t = this.t;
    ctx.save();
    ctx.fillStyle = "rgba(12, 42, 58, 0.93)";
    ctx.strokeStyle = "rgba(10, 52, 72, 0.95)";
    ctx.lineWidth = 2;

    const coralPos = [0.06, 0.28, 0.52, 0.74, 0.9];
    for (let i = 0; i < coralPos.length; i++) {
      const px = w * coralPos[i] + Math.sin(t * 0.35 + i * 1.9) * 22;
      const by = seabedYAt(px, w, h, t);
      this._drawCoral(ctx, px, by);
    }

    const seaweedClusters = [
      { base: 0.03, n: 6, gap: 10 },
      { base: 0.14, n: 5, gap: 12 },
      { base: 0.34, n: 7, gap: 9 },
      { base: 0.48, n: 4, gap: 14 },
      { base: 0.63, n: 6, gap: 11 },
      { base: 0.82, n: 5, gap: 13 },
    ];
    for (let c = 0; c < seaweedClusters.length; c++) {
      const g = seaweedClusters[c];
      for (let i = 0; i < g.n; i++) {
        const jitter = Math.sin(t * 0.55 + c * 2.1 + i * 0.7) * 5;
        const px = w * g.base + i * g.gap + jitter + (c % 2) * 6;
        const by = seabedYAt(px, w, h, t);
        const ht = 36 + ((i + c * 3) % 5) * 14 + (i % 3) * 8;
        this._drawSeaweed(ctx, px, by, ht, false);
      }
    }
    ctx.restore();
  }

  _drawCoral(ctx, x, y) {
    ctx.beginPath();
    ctx.moveTo(x - 18, y);
    ctx.quadraticCurveTo(x - 10, y - 32, x, y - 48);
    ctx.quadraticCurveTo(x + 12, y - 28, x + 20, y);
    ctx.lineTo(x - 18, y);
    ctx.fill();
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(x - 6, y - 36, 7, 0, Math.PI * 2);
    ctx.arc(x + 10, y - 30, 6, 0, Math.PI * 2);
    ctx.fill();
  }

  /**
   * @param {boolean} far дальний план — мельче, тише по цвету
   */
  _drawSeaweed(ctx, x, y, height, far = false) {
    if (far) {
      ctx.save();
      ctx.globalAlpha = 0.2;
      ctx.fillStyle = "rgba(42, 68, 78, 0.5)";
      ctx.strokeStyle = "rgba(100, 130, 142, 0.32)";
      ctx.lineWidth = 1.05;
      const hh = height * 0.52;
      const sway = Math.sin(this.t * 0.5 + x * 0.02) * 4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x - 10 + sway * 0.3,
        y - hh * 0.45,
        x + 12 + sway * 0.2,
        y - hh * 0.72,
        x + 3 + sway * 0.15,
        y - hh
      );
      ctx.bezierCurveTo(
        x + 7,
        y - hh * 0.52,
        x - 7,
        y - hh * 0.32,
        x,
        y
      );
      ctx.fill();
      ctx.stroke();
      ctx.restore();
      return;
    }
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.bezierCurveTo(x - 16, y - height * 0.45, x + 18, y - height * 0.75, x + 4, y - height);
    ctx.bezierCurveTo(x + 10, y - height * 0.55, x - 10, y - height * 0.35, x, y);
    ctx.fill();
    ctx.stroke();
  }
}

/**
 * HUD: жемчужины, воздух, статус — читаемо на тёмной воде.
 * Расширение: иконки, предупреждения низкого O₂.
 */
class HUD {
  constructor() {
    this.margin = 14;
    this.panelPad = 12;
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {string} text
   * @param {number} px
   * @param {number} py
   * @param {string} font
   * @param {string} fill
   */
  _strokeText(ctx, text, px, py, font, fill) {
    ctx.font = font;
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 18, 36, 0.75)";
    ctx.strokeText(text, px, py);
    ctx.fillStyle = fill;
    ctx.fillText(text, px, py);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} info
   */
  draw(ctx, info) {
    const {
      state,
      bounds,
      pearlsCollected,
      air,
      airMax,
      showAir = true,
      winTarget,
      objectiveText = null,
      stageLine,
      surfaceBoostHint = false,
      caveChaseHint = false,
      caveInsideHint = false,
      caveInsideMazeMode = false,
    } = info;
    ctx.save();
    const x = this.margin;
    const y = this.margin;
    const w = 240;
    const h =
      (stageLine ? 142 : 118) -
      (showAir ? 0 : 46) +
      (caveChaseHint ? 52 : 0) +
      (caveInsideHint && caveInsideMazeMode ? 52 : 0) +
      (caveInsideHint && !caveInsideMazeMode ? 24 : 0);
    ctx.fillStyle = "rgba(2, 12, 28, 0.55)";
    ctx.strokeStyle = "rgba(160, 220, 255, 0.35)";
    ctx.lineWidth = 1.5;
    ctx.fillRect(x, y, w, h);
    ctx.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5);

    const px = x + this.panelPad;
    let py = y + this.panelPad + 2;
    if (stageLine) {
      this._strokeText(
        ctx,
        stageLine,
        px,
        py,
        "600 12px system-ui, sans-serif",
        "#ffe8c8"
      );
      py += 20;
    }
    const goalLine = objectiveText
      ? objectiveText
      : `Жемчужины: ${pearlsCollected} / ${winTarget}`;
    this._strokeText(
      ctx,
      goalLine,
      px,
      py,
      objectiveText ? "600 14px system-ui, sans-serif" : "600 15px system-ui, sans-serif",
      objectiveText ? "#d6fff1" : "#e8fbff"
    );
    py += 24;
    if (showAir) {
      this._strokeText(
        ctx,
        `Воздух: ${Math.ceil(air)} / ${airMax}`,
        px,
        py,
        "13px system-ui, sans-serif",
        "#dff6ff"
      );
      py += 22;

      const barX = px;
      const barY = py;
      const barW = w - this.panelPad * 2;
      const barH = 10;
      ctx.fillStyle = "rgba(0,0,0,0.35)";
      ctx.fillRect(barX, barY, barW, barH);
      const k = Math.max(0, Math.min(1, air / airMax));
      const grad = ctx.createLinearGradient(barX, 0, barX + barW, 0);
      grad.addColorStop(0, "#5bd0ff");
      grad.addColorStop(1, "#8af5d0");
      ctx.fillStyle = grad;
      if (k > 0) {
        ctx.fillRect(barX, barY, Math.max(4, barW * k), barH);
      }
      if (air < airMax * 0.22) {
        ctx.strokeStyle = "rgba(255, 120, 120, 0.75)";
        ctx.lineWidth = 2;
        ctx.strokeRect(barX - 1, barY - 1, barW + 2, barH + 2);
      }
      py += barH + 14;
    } else {
      py += 2;
    }
    const status =
      state === GameState.PLAYING || state === GameState.STAGE_TWO
        ? _t("hud.status.playing")
        : state === GameState.STAGE_TWO_INTRO
          ? _t("hud.status.intro")
          : state === GameState.SHARK_CHOICE
            ? _t("hud.status.choice")
            : state === GameState.SHELTER_STUB
              ? _t("hud.status.shelter")
              : state === GameState.CAVE_CHASE
                ? _t("hud.status.caveChase")
                : state === GameState.SHIP_HUNT
                  ? _t("hud.status.shipHunt")
                : state === GameState.CAVE_CHASE_LOSE
                  ? _t("hud.status.caveLose")
                  : state === GameState.CAVE_INSIDE
                    ? _t("hud.status.caveInside")
                    : state === GameState.PAUSED
                      ? _t("hud.status.paused")
                      : "";
    this._strokeText(ctx, status, px, py, "12px system-ui, sans-serif", "#d0ecff");

    if (caveChaseHint) {
      py += 16;
      this._strokeText(
        ctx,
        _t("hud.hint.caveChase"),
        px,
        py,
        "600 12px system-ui, sans-serif",
        "#b8fff4"
      );
      py += 18;
      this._strokeText(
        ctx,
        _t("hud.hint.boostSpace"),
        px,
        py,
        "600 12px system-ui, sans-serif",
        "#ffe8c8"
      );
    }

    if (caveInsideHint) {
      py += 16;
      if (caveInsideMazeMode) {
        this._strokeText(
          ctx,
          _t("hud.hint.caveMazeGoal"),
          px,
          py,
          "600 12px system-ui, sans-serif",
          "#b4f5ea"
        );
        py += 18;
        this._strokeText(
          ctx,
          _t("hud.hint.caveMazeExit"),
          px,
          py,
          "600 12px system-ui, sans-serif",
          "#b8fff0"
        );
      } else {
        this._strokeText(
          ctx,
          _t("hud.hint.caveExit"),
          px,
          py,
          "600 12px system-ui, sans-serif",
          "#b8fff0"
        );
      }
    }

    if (surfaceBoostHint) {
      this._strokeText(
        ctx,
        _t("hud.hint.surfaceBoost"),
        px,
        bounds.height - 48,
        "600 12px system-ui, sans-serif",
        "#ffe8c8"
      );
    }
    const footer =
      caveInsideHint && !surfaceBoostHint
        ? _t("hud.footer.caveInside")
        : caveChaseHint && !surfaceBoostHint
          ? _t("hud.footer.caveChase")
          : _t("hud.footer.default");
    this._strokeText(
      ctx,
      footer,
      px,
      bounds.height - 28,
      "11px system-ui, sans-serif",
      "#c8e8ff"
    );

    ctx.restore();
  }
}

/**
 * Отрисовка и привязка размеров canvas к окну (с учётом devicePixelRatio).
 * Расширение: слои, партиклы, камера — разнести по методам / подклассам.
 */
class Renderer {
  /**
   * @param {HTMLCanvasElement} canvas
   */
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    /** Логический размер (совпадает с размером буфера после resize) */
    this.bounds = { width: 0, height: 0 };
    this.canvas.tabIndex = 0;
    this.canvas.setAttribute("aria-keyshortcuts", "WASD ArrowKeys Space Escape");
    this.canvas.style.outline = "none";
    this.resize();
    window.addEventListener("resize", () => this.resize());
  }

  resize() {
    const dpr = window.devicePixelRatio || 1;
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(w * dpr));
    this.canvas.height = Math.max(1, Math.floor(h * dpr));
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.bounds.width = w;
    this.bounds.height = h;
  }

  clear() {
    const { width, height } = this.bounds;
    this.ctx.fillStyle = "#03050a";
    this.ctx.fillRect(0, 0, width, height);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {Pearl[]} pearls
   * @param {number} time
   */
  drawPearls(ctx, pearls, time) {
    const vh = this.bounds.height;
    for (const p of pearls) p.render(ctx, time, vh);
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {OxygenPickup[]} list
   * @param {number} time
   */
  drawOxygenPickups(ctx, list, time) {
    const vh = this.bounds.height;
    for (const o of list) o.render(ctx, time, vh);
  }

  /** Заготовка: отрисовка препятствий */
  drawObstacles(_obstacles) {
    // Расширение: fillRect / path по массиву Obstacle
  }

  drawPauseOverlay() {
    const ctx = this.ctx;
    const { width, height } = this.bounds;
    ctx.save();
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(0, 16, 32, 0.65)";
    ctx.font = "600 22px system-ui, sans-serif";
    const t1 = _t("pause.title");
    ctx.strokeText(t1, width / 2, height / 2 - 12);
    ctx.fillStyle = "#e8fbff";
    ctx.fillText(t1, width / 2, height / 2 - 12);
    ctx.font = "15px system-ui, sans-serif";
    const t2 = _t("pause.hint");
    ctx.strokeText(t2, width / 2, height / 2 + 18);
    ctx.fillStyle = "rgba(220, 244, 255, 0.95)";
    ctx.fillText(t2, width / 2, height / 2 + 18);
    ctx.restore();
  }

}

/**
 * Ядро: состояния, коллекции сущностей, update/render.
 * Расширение: правила победы/поражения, уровни, сохранения — в update и обработчиках ввода.
 */
class Game {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {HTMLElement} startOverlay
   * @param {{
   *   lose: { el: HTMLElement, pearlsSpan: HTMLElement, bestSpan: HTMLElement, btn: HTMLButtonElement } | null,
   *   stageOffer: { el: HTMLElement, btnContinue: HTMLButtonElement, btnNext: HTMLButtonElement } | null,
   *   win: { el: HTMLElement, pearlsSpan: HTMLElement, titleEl?: HTMLElement, lineEl?: HTMLElement, btnMenu: HTMLButtonElement, btnAgain: HTMLButtonElement } | null,
   *   nextStage: { el: HTMLElement, btnBack: HTMLButtonElement } | null,
   *   sharkChoice: { el: HTMLElement, btnBack: HTMLButtonElement, btnHide: HTMLButtonElement } | null,
   *   shelterStub: { el: HTMLElement, btnContinue: HTMLButtonElement } | null,
   *   caveChoice: { el: HTMLElement, btnPearls: HTMLButtonElement, btnShip: HTMLButtonElement } | null,
   *   caveChaseLose: { el: HTMLElement, btnTry: HTMLButtonElement, btnEnd: HTMLButtonElement } | null,
   * } | null} domUi
   * @param {object | null} [audio] GameAudio — см. audio.js
   */
  constructor(canvas, startOverlay, domUi = null, audio = null) {
    this.renderer = new Renderer(canvas);
    this.input = new Input();
    this.player = new Player();
    this.hud = new HUD();
    this.underwater = new UnderwaterScene();
    this.bubbleField = new BubbleField();
    this.pickupVfx = new PickupVfx();

    /** @type {Pearl[]} */
    this.pearls = [];
    /** @type {OxygenPickup[]} */
    this.oxygenPickups = [];
    /** @type {Obstacle[]} */
    this.obstacles = [];

    this.air = AIR_MAX;
    this.airMax = AIR_MAX;
    this.pearlsCollected = 0;
    /** Секунды до следующей попытки спавна кислорода */
    this._oxygenSpawnTimer = 6;
    /** Секунды с последнего успешного спавна кислорода */
    this._oxygenTimeSinceSpawn = 0;
    /** Полоса для равномерного спавна кислорода */
    this._oxygenBandIndex = 0;

    /** Плавное затемнение под HTML-оверлеи (поражение, этап, победа) */
    this._modalBackdrop = 0;

    this.loseUi = domUi?.lose ?? null;
    this.stageUi = domUi?.stageOffer ?? null;
    this.winUi = domUi?.win ?? null;
    this.nextStageUi = domUi?.nextStage ?? null;
    this.sharkChoiceUi = domUi?.sharkChoice ?? null;
    this.shelterStubUi = domUi?.shelterStub ?? null;
    this.caveChoiceUi = domUi?.caveChoice ?? null;
    this.caveChaseLoseUi = domUi?.caveChaseLose ?? null;
    /** @type {object | null} */
    this.audio = audio;

    /** Пещера в погоне: центр и радиус «входа» */
    this._caveCx = 0;
    this._caveCy = 0;
    this._caveR = 56;
    /** 0 — игра; 1 — момент напряжения; 2 — плавное затемнение перед экраном поражения */
    this._caveLosePhase = 0;
    this._caveLoseT = 0;
    /** 0…1 во время фазы затемнения */
    this._caveFadeA = 0;
    /** Победа: 1 — заплыв внутрь; 2 — акулы у «рта»; 3 — уплывают */
    this._caveWinPhase = 0;
    this._caveWinT = 0;
    /** Направление к пещере: +1 вправо, −1 влево (друг, лицо, innerX) */
    this._caveChaseDir = 1;
    /** Остаток форы: пока > 0 — нельзя «поймать», преследование слабее */
    this._caveGraceRemain = 0;
    /** Секунды с начала погони — для экранных подсказок */
    this._caveChaseHintElapsed = 0;
    /** Фаза погони: ORIENT → BUILDUP → CHASE */
    this._caveChasePhase = CAVE_CHASE_PHASE_CHASE;
    /** Секунды внутри текущей фазы */
    this._cavePhaseTimer = 0;
    this._caveOrientDuration = 2.5;
    this._caveBuildupDuration = 2.5;
    /** Множитель скорости акул в BUILDUP (один раз на старт) */
    this._caveBuildupSharkMul = 0.5;

    /** Внутри пещеры: таймер сцены, пузырьки, «тёплая» зона-намёк */
    this._caveInsideIntroT = 0;
    this._caveInsideWarmBand = 1;
    /** @type {{ x: number, y: number, r: number, vy: number, a: number }[]} */
    this._caveInsideBubbles = [];
    this._caveInsideNextBubble = 0;
    /** @type {{ x: number, y: number, vx: number, t: number, kind: string } | null} */
    this._caveInsideSil = null;
    /** @type {null | { maze: object; ox: number; oy: number; cell: number }} */
    this._caveMazeLayout = null;
    this._caveFlickerT = 0;
    this._caveExitDwell = 0;
    /** @type {Float32Array | null} память посещённых клеток (W*H) */
    this._caveVisitHeat = null;
    /** @type {{ x: number; y: number; vx: number; vy: number; hue: number; life: number }[]} */
    this._caveSparks = [];
    this._caveSparkAccumulator = 0;
    /** Тёмные «намёки» у входа (акулы снаружи) */
    /** @type {{ x: number; y: number; ph: number; sc: number }[]} */
    this._caveEntranceGhosts = [];
    /** Редкая вспышка света 0…1 */
    this._caveMicroFlash = 0;
    /** Редкое мягкое затемнение (без таймера) */
    this._caveThreatDim = 0;
    /** Фазы после выхода из пещеры */
    this._caveExitScenePhase = 0;
    this._caveExitSceneT = 0;

    /** Множитель расхода воздуха (ослабление после «назад») */
    this._pressureEase = 1;
    /** Секунды мягкого режима после отступления от акул */
    this._pressureEaseRemaining = 0;
    /** Подтянуть игрока к «безопасной» зоне */
    this._nudgePlayerTimer = 0;

    /** @type {StageTwoShark[]} */
    this._sharks = [];
    this._sharkArrivalTimer = 0;
    this._sharkEventActive = false;
    this._sharksFleeing = false;
    this._timeSinceSharksSpawned = 0;
    this._sharkUserResolved = false;
    this._sharkPromptOpen = false;
    /** После «назад» у акул — подъём к поверхности, акулы подползают, затем уплывают */
    this._surfacingAfterSharks = false;

    /** Уже показали предложение после 10 жемчужин (выбор сделан или показан экран) */
    this._stageOfferTriggered = false;
    /** Игрок нажал «Продолжить сбор» */
    this._continuedAfterStage = false;
    /** Игрок на этапе 2 (HUD и цель 15) */
    this._stageTwoUnlocked = false;
    /** После выхода из пещеры: цель на сбор (+15 к текущему) */
    this._postCaveCollectTarget = null;
    /** Активна ветка поиска корабля */
    this._shipHuntActive = false;
    /** Параметры финального поиска по дну */
    this._shipHunt = {
      active: false,
      ax: 0,
      ay: 0,
      dirX: 1,
      dirY: 0,
      pearlProj: 760,
      /** Исходная позиция тайника по следу (магнит не уводит жемчужину бесконечно) */
      pearlProjHome: 760,
      laneHalfW: 150,
      missed: false,
      found: false,
      phase: 0, // 0: НАШЕЛ + пауза, 1: дельфин, 2: подъём
      phaseT: 0,
      surfLight: 0,
      pickupPause: 0,
      dolphinX: 0,
      dolphinY: 0,
      dolphinT: 0,
      /** Секунды «разглядывания» пловца с жемчужиной (дельфин рядом) */
      dolphinObserveT: 0,
      decoSeed: Math.random() * 1000,
      worldProg: 0,
      shoutT: 0,
      wowT: 0,
      searchT: 0,
      pearlHintT: 0,
      pearlSeenT: 0,
      pearlLocked: false,
      pearlFlickerT: 0,
      pearlLostUsed: false,
      /** @type {{ wx: number, wy: number, t0: number, dur: number }[]} ложные вспышки до появления настоящей жемчужины */
      mirages: [],
      /** searchT, с которого настоящая жемчужина может появиться (после последнего миража + пауза) */
      revealPearlAfter: 0,
      /** Накопление времени в зоне тайника для авто-подбора (сек) */
      nearPearlTimer: 0,
      /** Монотонное время охоты (не сбрасывается fail-safe), для миражей и reveal */
      huntClock: 0,
      _sfxDolphinDone: false,
    };
    /** Таймер вступления этапа 2 */
    this._stageTwoIntroT = 0;
    /** Накопленный мягкий затемнённый слой вступления (0…~0.42) */
    this._stageTwoIntroFade = 0;
    /** @type {{ x: number, y: number, sx: number, sy: number, tx: number, ty: number, start: number, phase: number, role: string, panicStarted?: boolean, panicT?: number }[]} */
    this._stageTwoBuddies = [];
    /** @type {{ x: number, y: number, vx: number, phase: string } | null} */
    this._mayaActor = null;
    /** @type {{ x: number, y: number, visible: boolean } | null} */
    this._dolphinActor = null;
    /** Куда вернуться после паузы */
    this._pauseReturnState = GameState.PLAYING;

    this.state = GameState.START;
    this.startOverlay = startOverlay;
    /** Защита от повторного клика во время анимации скрытия меню */
    this._menuTransitioning = false;

    this._lastTs = 0;
    this._loop = this._loop.bind(this);
    this._onOverlayFadeEnd = this._onOverlayFadeEnd.bind(this);
    /** @type {number | undefined} */
    this._overlayFadeFallbackTimer = undefined;

    window.addEventListener("resize", () => {
      this.bubbleField.init(this.renderer.bounds);
    });

    /** Скрытый dev: Ctrl+D только в PLAYING */
    this._onDevKeyDown = (e) => {
      if (!e.ctrlKey || e.code !== "KeyD" || e.repeat) return;
      if (this.state !== GameState.PLAYING) return;
      e.preventDefault();
      this._devEnterStageTwoIntro();
    };
    window.addEventListener("keydown", this._onDevKeyDown);
  }

  /** Сброс сессии при старте погружения */
  _resetSession() {
    this.air = this.airMax;
    this.pearlsCollected = 0;
    this._postCaveCollectTarget = null;
    this._shipHuntActive = false;
    this._shipHunt.active = false;
    this.pickupVfx.clear();
    this._oxygenSpawnTimer =
      OXYGEN_SPAWN_INTERVAL_MIN +
      Math.random() * (OXYGEN_SPAWN_INTERVAL_MAX - OXYGEN_SPAWN_INTERVAL_MIN);
    this._oxygenTimeSinceSpawn = 0;

    const bounds = this.renderer.bounds;
    this.pearls = [];
    let clusterAnchor = null;
    for (let i = 0; i < PEARL_POOL; i++) {
      const p = new Pearl();
      const useCluster = clusterAnchor !== null && i > 0 && Math.random() < 0.24;
      p.place(
        bounds,
        this.player,
        this.pearls,
        useCluster ? clusterAnchor : null,
        i
      );
      this.pearls.push(p);
      if (!useCluster || Math.random() < 0.58) {
        clusterAnchor = { x: p.x, y: p.y };
      }
    }

    this.oxygenPickups = [];
    for (let j = 0; j < OXYGEN_POOL_CAPACITY; j++) {
      this.oxygenPickups.push(new OxygenPickup());
    }

    this._stageOfferTriggered = false;
    this._continuedAfterStage = false;
    this._stageTwoUnlocked = false;
    this._stageTwoIntroT = 0;
    this._stageTwoIntroFade = 0;
    this._surfacingAfterSharks = false;
    this._stageTwoBuddies = [];
    this._mayaActor = null;
    this._dolphinActor = null;
    this._oxygenBandIndex = 0;
    this._modalBackdrop = 0;

    this._pressureEase = 1;
    this._pressureEaseRemaining = 0;
    this._nudgePlayerTimer = 0;
    this._sharks = [];
    this._sharkArrivalTimer = 0;
    this._sharkEventActive = false;
    this._sharksFleeing = false;
    this._timeSinceSharksSpawned = 0;
    this._sharkUserResolved = false;
    this._sharkPromptOpen = false;
  }

  startFromMenu() {
    if (this._menuTransitioning || this.state !== GameState.START) return;
    if (this.audio && typeof this.audio.resume === "function") this.audio.resume();
    this._menuTransitioning = true;
    this.startOverlay.classList.add("overlay--fade-out");
    this.startOverlay.addEventListener("transitionend", this._onOverlayFadeEnd);
    if (this._overlayFadeFallbackTimer !== undefined) {
      window.clearTimeout(this._overlayFadeFallbackTimer);
    }
    this._overlayFadeFallbackTimer = window.setTimeout(() => {
      this._overlayFadeFallbackTimer = undefined;
      if (!this._menuTransitioning) return;
      if (this.state !== GameState.START) return;
      this._finishOverlayHide();
    }, 700);
  }

  _onOverlayFadeEnd(e) {
    if (e.propertyName !== "opacity") return;
    this.startOverlay.removeEventListener("transitionend", this._onOverlayFadeEnd);
    if (this._overlayFadeFallbackTimer !== undefined) {
      window.clearTimeout(this._overlayFadeFallbackTimer);
      this._overlayFadeFallbackTimer = undefined;
    }
    this._finishOverlayHide();
  }

  _finishOverlayHide() {
    if (!this._menuTransitioning) return;
    this._menuTransitioning = false;
    this.startOverlay.removeEventListener("transitionend", this._onOverlayFadeEnd);
    this.state = GameState.PLAYING;
    this.startOverlay.hidden = true;
    this.player.resetToCenter(this.renderer.bounds);
    this._resetSession();
    this.input.clearNavigationKeys();
    this._focusGameCanvas();
  }

  /** Обновить лучший результат жемчужин за заход */
  _commitBestPearlsScore() {
    const prev = Number(localStorage.getItem(STORAGE_KEY_BEST_PEARLS) || 0);
    const next = Math.max(prev, this.pearlsCollected);
    localStorage.setItem(STORAGE_KEY_BEST_PEARLS, String(next));
    return next;
  }

  _showOverlay(el) {
    if (!el) return;
    el.hidden = false;
    el.classList.remove("overlay--visible");
    void el.offsetWidth;
    requestAnimationFrame(() => el.classList.add("overlay--visible"));
  }

  _hideOverlay(el) {
    if (!el) return;
    el.classList.remove("overlay--visible");
    el.hidden = true;
  }

  _showLoseOverlay(bestPearls) {
    if (!this.loseUi) return;
    const { el, pearlsSpan, bestSpan } = this.loseUi;
    // Пишем полную локализованную строку в родительский параграф — тогда перевод
    // работает на любом языке, а старые span-элементы остаются для обратной
    // совместимости (мы всё равно обновляем их textContent).
    const pearlsLine = document.getElementById("lose-pearls-line");
    const bestLine = document.getElementById("lose-best-line");
    if (pearlsLine) {
      pearlsLine.textContent = _t("lose.line", { n: this.pearlsCollected });
    } else if (pearlsSpan) {
      pearlsSpan.textContent = String(this.pearlsCollected);
    }
    if (bestLine) {
      bestLine.textContent = _t("lose.best", { n: bestPearls });
    } else if (bestSpan) {
      bestSpan.textContent = String(bestPearls);
    }
    this._showOverlay(el);
  }

  _hideLoseOverlay() {
    if (!this.loseUi) return;
    this._hideOverlay(this.loseUi.el);
  }

  _showStageOfferOverlay() {
    if (!this.stageUi) return;
    this._showOverlay(this.stageUi.el);
  }

  _hideStageOfferOverlay() {
    if (!this.stageUi) return;
    this._hideOverlay(this.stageUi.el);
  }

  _showWinOverlay() {
    if (!this.winUi) return;
    if (this.winUi.pearlsSpan) this.winUi.pearlsSpan.textContent = String(this.pearlsCollected);
    const shipFinal = this._shipHuntActive && this._shipHunt.found;
    const epic = document.getElementById("win-epic");
    const classic = document.getElementById("win-classic");
    if (epic && classic) {
      epic.hidden = !shipFinal;
      classic.hidden = shipFinal;
    }
    if (this.winUi.el) {
      this.winUi.el.classList.toggle("overlay--win-epic", !!shipFinal);
    }
    if (!shipFinal) {
      if (this.winUi.titleEl) {
        this.winUi.titleEl.textContent = _t("win.classic.title");
      }
      if (this.winUi.lineEl) {
        this.winUi.lineEl.textContent = _t("win.classic.line", {
          n: this.pearlsCollected,
        });
      }
    }
    if (this.winUi.btnAgain) {
      this.winUi.btnAgain.textContent = shipFinal
        ? _t("win.again.final")
        : _t("win.again");
    }
    if (this.winUi.btnMenu) {
      this.winUi.btnMenu.textContent = shipFinal
        ? _t("win.menu.final")
        : _t("win.menu");
    }
    if (this.audio && typeof this.audio.playVictory === "function") {
      this.audio.playVictory(!!shipFinal);
    }
    this._showOverlay(this.winUi.el);
  }

  _hideWinOverlay() {
    if (!this.winUi) return;
    this._hideOverlay(this.winUi.el);
  }

  _showNextStageOverlay() {
    if (!this.nextStageUi) return;
    this._showOverlay(this.nextStageUi.el);
  }

  _hideNextStageOverlay() {
    if (!this.nextStageUi) return;
    this._hideOverlay(this.nextStageUi.el);
  }

  _hideAllGameOverlays() {
    this._hideLoseOverlay();
    this._hideStageOfferOverlay();
    this._hideWinOverlay();
    this._hideNextStageOverlay();
    this._hideSharkChoiceOverlay();
    this._hideShelterStubOverlay();
    this._hideCaveChoiceOverlay();
    this._hideCaveChaseLoseOverlay();
  }

  _showCaveChaseLoseOverlay() {
    if (!this.caveChaseLoseUi) return;
    this._showOverlay(this.caveChaseLoseUi.el);
  }

  _hideCaveChaseLoseOverlay() {
    if (!this.caveChaseLoseUi) return;
    this._hideOverlay(this.caveChaseLoseUi.el);
  }

  /** Кнопка «Попробовать ещё»: новый раунд без главного меню */
  retryFromLose() {
    if (this.state !== GameState.LOSE) return;
    this._hideLoseOverlay();
    this._modalBackdrop = 0;
    this.state = GameState.PLAYING;
    this.player.resetToCenter(this.renderer.bounds);
    this._resetSession();
  }

  /** «Продолжить сбор» после 10 жемчужин */
  continueAfterStageOffer() {
    if (this.state !== GameState.STAGE_OFFER) return;
    this._hideStageOfferOverlay();
    this._modalBackdrop = 0;
    this._continuedAfterStage = true;
    this.state = GameState.PLAYING;
  }

  /** «Перейти дальше» — вступление второго этапа */
  goToNextStageStub() {
    if (this.state !== GameState.STAGE_OFFER) return;
    this._hideStageOfferOverlay();
    this._modalBackdrop = 0;
    this._beginStageTwoIntro();
  }

  /** Скрытый dev: сразу вступление этапа 2 (без UI-подсказок) */
  _devEnterStageTwoIntro() {
    this._hideStageOfferOverlay();
    this._modalBackdrop = 0;
    this._stageOfferTriggered = true;
    this._beginStageTwoIntro();
  }

  _beginStageTwoIntro() {
    const b = this.renderer.bounds;
    const px = this.player.x;
    const py = this.player.y;
    this.air = this.airMax;
    this._continuedAfterStage = true;
    this._stageTwoUnlocked = true;
    this._stageTwoIntroT = 0;
    this._stageTwoIntroFade = 0;
    this._stageTwoBuddies = [
      {
        sx: px - 38,
        sy: py + 6,
        x: px - 38,
        y: py + 6,
        tx: px - 175,
        ty: py - 55,
        start: 2.1,
        phase: Math.random() * Math.PI * 2,
        role: "panic",
        panicStarted: false,
        panicT: 0,
        panicAnchorX: undefined,
      },
      {
        sx: px + 42,
        sy: py + 4,
        x: px + 42,
        y: py + 4,
        tx: px + 185,
        ty: py - 48,
        start: 2.35,
        phase: Math.random() * Math.PI * 2,
        role: "stay",
      },
    ];
    this._mayaActor = { x: px - 14, y: py - 18, vx: 0, phase: "idle" };
    this._dolphinActor = {
      x: px + 72,
      y: py - 86,
      visible: false,
      pathT: 0,
      bend: 0,
      angle: 0.25,
    };
    this.state = GameState.STAGE_TWO_INTRO;
  }

  /** Завершить вступление этапа 2 и запустить таймер акул */
  _finishStageTwoIntro() {
    if (this.state !== GameState.STAGE_TWO_INTRO) return;
    this._stageTwoBuddies = this._stageTwoBuddies.filter((b) => b.role === "stay");
    this._mayaActor = null;
    this._dolphinActor = null;
    this._stageTwoIntroFade = 0;
    this._sharkArrivalTimer = 1.2 + Math.random() * 1.6;
    this._sharkEventActive = false;
    this._sharksFleeing = false;
    this._sharks = [];
    this._timeSinceSharksSpawned = 0;
    this._sharkUserResolved = false;
    this._sharkPromptOpen = false;
    this.state = GameState.STAGE_TWO;
  }

  _updateStageTwoIntro(dt) {
    this._stageTwoIntroT += dt;
    const t = this._stageTwoIntroT;
    this._stageTwoIntroFade = Math.min(0.4, t * 0.085);
    const w = this.renderer.bounds.width;

    if (this._mayaActor) {
      if (t > 6.2) {
        this._mayaActor.phase = "drift";
        this._mayaActor.vx = 72;
        this._mayaActor.x += this._mayaActor.vx * dt;
      }
      if (this._mayaActor.x > w + 120) {
        this._mayaActor = null;
        this._dolphinActor = null;
      }
    }

    if (this._dolphinActor && this._mayaActor && t > 6.45) {
      this._dolphinActor.visible = true;
    }
    if (
      this._dolphinActor &&
      this._mayaActor &&
      this._dolphinActor.visible
    ) {
      this._dolphinActor.pathT += dt;
      const pt = this._dolphinActor.pathT;
      const dive = Math.sin(pt * 0.85);
      const plunge = Math.sin(pt * 0.38);
      const velX =
        76 + Math.sin(pt * 1.65) * 34 + Math.sin(pt * 0.72) * 10;
      const velY =
        12 +
        Math.sin(pt * 2.15) * 44 +
        plunge * 28 +
        dive * 14;
      this._dolphinActor.x += velX * dt;
      this._dolphinActor.y += velY * dt;
      this._dolphinActor.angle = Math.atan2(velY, velX);
      this._dolphinActor.bend =
        Math.sin(pt * 2.9) * 0.32 + Math.cos(pt * 1.55) * 0.1;
      // Пока дельфин в кадре рядом с Майей — редкие щелчки-сигналы.
      this._dolphinActor.clickT = (this._dolphinActor.clickT || 0) - dt;
      if (this._dolphinActor.clickT <= 0) {
        this._dolphinActor.clickT = 1.6 + Math.random() * 1.3;
        if (this.audio && typeof this.audio.playDolphinClick === "function") {
          this.audio.playDolphinClick();
        }
      }
    }

    const mayaGone = !this._mayaActor;
    if (mayaGone) {
      for (const bud of this._stageTwoBuddies) {
        if (bud.role === "panic" && !bud.panicStarted) {
          bud.panicStarted = true;
          bud.panicT = 0;
        }
      }
    }

    const keep = [];
    const vh = this.renderer.bounds.height;
    const surfaceY = 56;
    for (const bud of this._stageTwoBuddies) {
      if (bud.role === "panic" && bud.panicStarted) {
        bud.panicT = (bud.panicT ?? 0) + dt;
        const pt = bud.panicT;
        if (bud.panicAnchorX === undefined) bud.panicAnchorX = bud.x;
        bud.panicSurfPhase = bud.panicSurfPhase ?? 0;
        bud.panicExitAlpha = bud.panicExitAlpha ?? 1;

        const prg = Math.min(
          1,
          Math.max(0, 1 - bud.y / Math.max(180, vh * 0.72))
        );
        const zigAmp = 52 * (1 - prg * 0.72) + 16;
        let zigMul = 1;
        let climbMul = 1;
        let xLerp = 5.4;
        if (bud.panicSurfPhase === 1) {
          bud.panicSurfaceHoldT = (bud.panicSurfaceHoldT ?? 0) + dt;
          climbMul = 0.34;
          zigMul = 0.22;
          xLerp = 2.6;
          if (bud.panicSurfaceHoldT >= 0.52) {
            bud.panicSurfPhase = 2;
            bud.panicBreakT = 0;
          }
        } else if (bud.panicSurfPhase === 2) {
          bud.panicBreakT = (bud.panicBreakT ?? 0) + dt;
          // Финальный рывок к поверхности: почти не исчезает, пока реально не вышел вверх.
          climbMul = 1.35;
          zigMul = 0.1;
          xLerp = 2.6;
          const yFadeStart = 26;
          const yFadeEnd = -46;
          const yNorm = (bud.y - yFadeEnd) / Math.max(1, yFadeStart - yFadeEnd);
          bud.panicExitAlpha = Math.max(0, Math.min(1, yNorm));
        }

        const targetX =
          bud.panicAnchorX +
          Math.sin(pt * 2.18) * zigAmp * zigMul +
          Math.sin(pt * 0.58) * 12 * (1 - prg * 0.5) * zigMul;
        const climb = (52 + Math.sin(pt * 1.5) * 14 + prg * 22) * climbMul;
        bud.x += (targetX - bud.x) * Math.min(1, xLerp * dt);
        bud.y -= climb * dt;
        const margin = 42;
        bud.x = Math.min(w - margin, Math.max(margin, bud.x));

        if (bud.panicSurfPhase === 0 && bud.y <= 72) {
          bud.panicSurfPhase = 1;
          bud.panicSurfaceHoldT = 0;
        }

        const panicDone =
          bud.panicSurfPhase === 2 &&
          bud.panicExitAlpha <= 0.02 &&
          bud.y < -42;
        if (!panicDone) keep.push(bud);
        continue;
      }
      if (t < bud.start) {
        keep.push(bud);
        continue;
      }
      const u = Math.min(1, Math.max(0, (t - bud.start) * 0.38));
      const stayFollow = bud.role === "stay" && mayaGone && u >= 1;
      // Важно: не «перезаписывать» позицию из sx/tx каждый кадр, иначе получается дёрганье.
      if (!stayFollow) {
        bud.x = bud.sx + (bud.tx - bud.sx) * u;
        bud.y = bud.sy + (bud.ty - bud.sy) * u;
      }
      if (stayFollow) {
        // Убираем заметное «вперёд-назад» дёрганье: почти статичный оффсет и мягкий follow.
        const ox = Math.sin(this.underwater.t * 0.22 + bud.phase) * 1.2;
        bud.x += (this.player.x + 54 + ox - bud.x) * 0.38 * dt;
        bud.y += (this.player.y - 6 - bud.y) * 0.36 * dt;
      }
      keep.push(bud);
    }
    this._stageTwoBuddies = keep;

    const onlyStay =
      mayaGone &&
      this._stageTwoBuddies.length === 1 &&
      this._stageTwoBuddies[0].role === "stay";
    if (t > 6.2 && onlyStay) {
      this._finishStageTwoIntro();
    }
  }

  _renderStageTwoIntroLayer(ctx) {
    const { width: w, height: h } = this.renderer.bounds;
    const t = this._stageTwoIntroT;
    ctx.save();
    ctx.fillStyle = `rgba(12, 42, 68, ${this._stageTwoIntroFade * 0.55})`;
    ctx.fillRect(0, 0, w, h);

    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 17px system-ui, sans-serif";
    const line1 = _t("stageTwo.intro.1");
    if (t < 5.8) {
      ctx.lineWidth = 3;
      ctx.strokeStyle = "rgba(0, 20, 40, 0.55)";
      ctx.strokeText(line1, w * 0.5, h * 0.38);
      ctx.fillStyle = "rgba(240, 248, 255, 0.95)";
      ctx.fillText(line1, w * 0.5, h * 0.38);
    }
    if (t > 6.0) {
      ctx.font = "600 15px system-ui, sans-serif";
      const l2 = _t("stageTwo.intro.2");
      const l3 = _t("stageTwo.intro.3");
      const l4 = _t("stageTwo.intro.4");
      ctx.strokeStyle = "rgba(0, 20, 40, 0.55)";
      ctx.strokeText(l2, w * 0.5, h * 0.48);
      ctx.fillStyle = "rgba(255, 236, 220, 0.95)";
      ctx.fillText(l2, w * 0.5, h * 0.48);
      if (t > 6.55) {
        ctx.strokeText(l3, w * 0.5, h * 0.56);
        ctx.fillStyle = "rgba(220, 244, 255, 0.92)";
        ctx.fillText(l3, w * 0.5, h * 0.56);
      }
      if (t > 7.05 && t < 13.5) {
        ctx.font = "600 14px system-ui, sans-serif";
        ctx.strokeText(l4, w * 0.5, h * 0.64);
        ctx.fillStyle = "rgba(200, 255, 248, 0.88)";
        ctx.fillText(l4, w * 0.5, h * 0.64);
      }
    }
    ctx.restore();
  }

  /**
   * Друг-ныряльщик: вид сбоку, чуть мягче силуэт, чуть тусклее игрока.
   * @param {number} time
   * @param {number} phase
   * @param {number} viewH
   * @param {number} [extraAlpha] множитель прозрачности (всплытие к поверхности)
   */
  _renderBuddyDiverFigure(ctx, bx, by, flip, time, phase, viewH, swimBoost, extraAlpha = 1) {
    const ea =
      extraAlpha === undefined || extraAlpha === null ? 1 : Math.max(0, extraAlpha);
    const b = swimBoost ? 1 : 0;
    const bob = Math.sin(time * (2.25 + b * 1.85) + phase) * (0.052 + b * 0.034);
    const finKick = Math.sin(time * (4.05 + b * 3.4) + phase) * (0.28 + b * 0.18);
    const spine = Math.sin(time * (1.88 + b * 1.2) + phase) * (0.038 + b * 0.028);
    const armS = Math.sin(time * (5.1 + b * 4) + phase) * (0.06 + b * 0.09);
    const legS = Math.sin(time * (5.35 + b * 4.2) + phase) * (1.1 + b * 1.6);
    const lean = flip * 0.07;
    const da = characterDepthAlpha(by, viewH) * 0.82 * ea;

    ctx.save();
    ctx.globalAlpha = da;
    ctx.translate(bx, by);
    ctx.scale(flip, 1);
    ctx.rotate(lean + bob + spine);

    ctx.fillStyle = "#d4a892";
    ctx.beginPath();
    ctx.arc(-38, 0, 11.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.fillStyle = "rgba(32, 48, 62, 0.86)";
    const mx = -48;
    const my = -6;
    const mw = 19;
    const mh = 8.5;
    const rr = 2.5;
    ctx.beginPath();
    ctx.moveTo(mx + rr, my);
    ctx.lineTo(mx + mw - rr, my);
    ctx.quadraticCurveTo(mx + mw, my, mx + mw, my + rr);
    ctx.lineTo(mx + mw, my + mh - rr);
    ctx.quadraticCurveTo(mx + mw, my + mh, mx + mw - rr, my + mh);
    ctx.lineTo(mx + rr, my + mh);
    ctx.quadraticCurveTo(mx, my + mh, mx, my + mh - rr);
    ctx.lineTo(mx, my + rr);
    ctx.quadraticCurveTo(mx, my, mx + rr, my);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "rgba(200, 230, 255, 0.35)";
    ctx.fillRect(-44, -4, 5, 3.5);
    ctx.fillRect(-38, -4, 5, 3.5);

    ctx.fillStyle = "rgba(52, 68, 82, 0.92)";
    ctx.beginPath();
    ctx.ellipse(-2, 1.5, 33, 13.5, 0.05, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.14)";
    ctx.stroke();

    ctx.fillStyle = "rgba(40, 58, 72, 0.92)";
    ctx.beginPath();
    ctx.ellipse(-6, -9.5, 8.5, 14.5, -0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(100, 190, 255, 0.18)";
    ctx.fillRect(-11, -13, 3.5, 11);

    ctx.fillStyle = "rgba(200, 150, 125, 0.88)";
    ctx.beginPath();
    ctx.moveTo(-16 + armS * 3, 0);
    ctx.quadraticCurveTo(-30 + armS * 4, -3, -40 + armS * 3, -1);
    ctx.quadraticCurveTo(-32 + armS * 3, 4, -20 + armS * 2, 4);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(-8 - armS * 2, 2);
    ctx.quadraticCurveTo(-2 + armS * 2, 8, 6 + armS, 5);
    ctx.quadraticCurveTo(2 - armS, 0, -8 - armS * 2, 2);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(46, 62, 78, 0.9)";
    fillRoundRect(ctx, 12, 2.5 + legS * 0.08, 9.5, 13.5, 2.8);
    fillRoundRect(ctx, 23, 3.5 - legS * 0.08, 9.5, 12.5, 2.8);

    ctx.fillStyle = "rgba(36, 72, 112, 0.88)";
    ctx.save();
    ctx.translate(26, 15.5);
    ctx.rotate(-0.32 + finKick * (0.062 + b * 0.042));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(21, -2.5);
    ctx.lineTo(19, 11.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(13, 15.5);
    ctx.rotate(0.26 - finKick * (0.062 + b * 0.042));
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(19, -2);
    ctx.lineTo(17, 10.5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * @param {number} viewH
   */
  _renderMayaFigure(ctx, viewH) {
    if (!this._mayaActor) return;
    const m = this._mayaActor;
    const time = this.underwater.t;
    const finKick = Math.sin(time * 4.1 + 0.7) * 0.27;
    const bob = Math.sin(time * 2.25) * 0.045;
    const da = characterDepthAlpha(m.y, viewH) * 0.9;

    ctx.save();
    ctx.globalAlpha = da;
    ctx.translate(m.x, m.y);
    const faceFlip =
      m.phase === "drift" && m.vx < -8 ? 1 : m.phase === "drift" && m.vx > 8 ? -1 : 1;
    ctx.scale(faceFlip, 1);
    ctx.rotate(0.08 + bob);

    ctx.fillStyle = "#f0c8d8";
    ctx.beginPath();
    ctx.arc(-36, 0, 10.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.16)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "rgba(36, 52, 66, 0.88)";
    const mx = -46;
    const my = -5.5;
    const mw = 17;
    const mh = 8;
    const rr = 2.2;
    ctx.beginPath();
    ctx.moveTo(mx + rr, my);
    ctx.lineTo(mx + mw - rr, my);
    ctx.quadraticCurveTo(mx + mw, my, mx + mw, my + rr);
    ctx.lineTo(mx + mw, my + mh - rr);
    ctx.quadraticCurveTo(mx + mw, my + mh, mx + mw - rr, my + mh);
    ctx.lineTo(mx + rr, my + mh);
    ctx.quadraticCurveTo(mx, my + mh, mx, my + mh - rr);
    ctx.lineTo(mx, my + rr);
    ctx.quadraticCurveTo(mx, my, mx + rr, my);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(170, 72, 102, 0.92)";
    ctx.beginPath();
    ctx.ellipse(-3, 2, 30, 12.5, 0.06, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.12)";
    ctx.stroke();

    ctx.fillStyle = "rgba(130, 52, 78, 0.9)";
    ctx.beginPath();
    ctx.ellipse(-6, -8, 7.5, 13, -0.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "rgba(232, 170, 188, 0.9)";
    ctx.beginPath();
    ctx.moveTo(-14, 1);
    ctx.quadraticCurveTo(-26, -2, -34, 0);
    ctx.quadraticCurveTo(-26, 5, -14, 4);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = "rgba(120, 48, 72, 0.9)";
    fillRoundRect(ctx, 10, 3, 9, 13, 2.8);
    fillRoundRect(ctx, 21, 4, 9, 12, 2.8);

    ctx.fillStyle = "rgba(52, 92, 132, 0.9)";
    ctx.save();
    ctx.translate(25, 15);
    ctx.rotate(-0.3 + finKick * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(20, -2);
    ctx.lineTo(18, 11);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(12, 15);
    ctx.rotate(0.24 - finKick * 0.06);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(18, -1.5);
    ctx.lineTo(16, 10);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  /**
   * @param {number} viewH
   */
  _renderDolphinFigure(ctx, time, viewH) {
    if (!this._dolphinActor || !this._dolphinActor.visible) return;
    const d = this._dolphinActor;
    const bend = d.bend ?? 0;
    const wob = Math.sin(time * 2.15) * 0.065;
    const da = characterDepthAlpha(d.y, viewH);
    const baseAngle = d.angle ?? 0.2;

    ctx.save();
    ctx.globalAlpha = da;
    ctx.translate(d.x, d.y);
    // Спрайт нарисован «головой вправо, животом вниз». Чтобы живот ВСЕГДА
    // оставался снизу — при любом направлении движения — мы:
    //   • если дельфин смотрит в правую полуплоскость (cos(baseAngle) >= 0) —
    //     просто поворачиваем на effAngle;
    //   • если в левую — ЗЕРКАЛИМ спрайт по горизонтали (scale(-1, 1))
    //     и поворачиваем на (π − effAngle).
    // Такая техника даёт непрерывный переход через ±π/2: на стыке изображение
    // не «переворачивается» вверх ногами (как было при scale(1, −1)), а
    // плавно пересекает вертикаль, как и должен плыть дельфин.
    const wobble = bend * 0.72 + wob;
    const effAngle = baseAngle + wobble;
    if (Math.cos(baseAngle) < 0) {
      ctx.scale(-1, 1);
      ctx.rotate(Math.PI - effAngle);
    } else {
      ctx.rotate(effAngle);
    }
    ctx.scale(1.62, 1.62);

    const skin = "#9ec8dc";
    const belly = "#c5e4f0";
    const shade = "#7eb0c8";
    const dorsalSoft = "#6a94aa";

    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.moveTo(44, 4);
    ctx.bezierCurveTo(50, 0, 48, -8, 36, -10);
    ctx.bezierCurveTo(16, -12, -4, -8, -24, -3);
    ctx.bezierCurveTo(-38, 1, -46, 1, -50, -2);
    ctx.bezierCurveTo(-54, -6, -56, -10, -56, -14);
    ctx.bezierCurveTo(-58, -10, -60, -4, -58, 2);
    ctx.bezierCurveTo(-56, 8, -52, 14, -46, 15);
    ctx.bezierCurveTo(-36, 14, -20, 12, 0, 11);
    ctx.bezierCurveTo(24, 10, 40, 8, 44, 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = belly;
    ctx.beginPath();
    ctx.moveTo(38, 5);
    ctx.bezierCurveTo(16, 12, -12, 12, -36, 9);
    ctx.bezierCurveTo(-28, 12, -6, 14, 18, 12);
    ctx.bezierCurveTo(32, 10, 40, 7, 38, 5);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = shade;
    ctx.beginPath();
    ctx.moveTo(20, 8);
    ctx.quadraticCurveTo(12, 22, 4, 26);
    ctx.quadraticCurveTo(18, 20, 26, 10);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = dorsalSoft;
    ctx.beginPath();
    ctx.moveTo(2, -7);
    ctx.quadraticCurveTo(4, -18, 10, -20);
    ctx.quadraticCurveTo(16, -16, 14, -8);
    ctx.quadraticCurveTo(10, -5, 2, -7);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  _spawnStageTwoSharks() {
    const b = this.renderer.bounds;
    const n = 3;
    this._sharks = [];
    for (let i = 0; i < n; i++) {
      this._sharks.push(new StageTwoShark(b.width, b.height, i, n));
    }
    if (this.audio && typeof this.audio.playSharksArrive === "function") {
      this.audio.playSharksArrive();
    }
  }

  _showSharkChoiceOverlay() {
    if (!this.sharkChoiceUi) return;
    this._showOverlay(this.sharkChoiceUi.el);
  }

  _hideSharkChoiceOverlay() {
    if (!this.sharkChoiceUi) return;
    this._hideOverlay(this.sharkChoiceUi.el);
  }

  _showShelterStubOverlay() {
    if (!this.shelterStubUi) return;
    this._showOverlay(this.shelterStubUi.el);
  }

  _hideShelterStubOverlay() {
    if (!this.shelterStubUi) return;
    this._hideOverlay(this.shelterStubUi.el);
  }

  _showCaveChoiceOverlay() {
    if (!this.caveChoiceUi) return;
    this._showOverlay(this.caveChoiceUi.el);
  }

  _hideCaveChoiceOverlay() {
    if (!this.caveChoiceUi) return;
    this._hideOverlay(this.caveChoiceUi.el);
  }

  caveChoiceCollectPearls() {
    if (this.state !== GameState.CAVE_AFTER_CHOICE) return;
    this._hideCaveChoiceOverlay();
    this._modalBackdrop = 0;
    this._shipHuntActive = false;
    this._shipHunt.active = false;
    this._postCaveCollectTarget = this.pearlsCollected + 15;
    this.state = GameState.STAGE_TWO;
    this._focusGameCanvas();
  }

  caveChoiceFindShip() {
    if (this.state !== GameState.CAVE_AFTER_CHOICE) return;
    this._hideCaveChoiceOverlay();
    this._modalBackdrop = 0;
    this._shipHuntActive = true;
    this._postCaveCollectTarget = null;
    this._startShipHuntMode();
    this.state = GameState.SHIP_HUNT;
    this._focusGameCanvas();
  }

  _startShipHuntMode() {
    const b = this.renderer.bounds;
    const dirBase = this.player._face > 0 ? 1 : -1;
    // Почти горизонтальный курс к тайнику: вертикальный «увод» минимален,
    // чтобы пловец, плывя по направлению лица, точно попадал в галочку и брал жемчужину.
    const ang = dirBase > 0
      ? (Math.random() - 0.5) * 0.08
      : Math.PI + (Math.random() - 0.5) * 0.08;
    const dx = Math.cos(ang);
    const dy = Math.sin(ang);
    // Сцена охоты работает как классический скроллер:
    //   • пловец — визуальный «якорь» кадра, он стоит в центре экрана;
    //   • камера следит за worldProg (см. _renderShipHuntLayer), поэтому всё
    //     окружение — дно, обломки, водоросли, галочка, жемчужина —
    //     плавно уплывает мимо пловца в противоположную сторону.
    // Поэтому ставим пловца ровно в центр canvas — это же и точка ax/ay,
    // относительно которой задаются мировые координаты охоты.
    this.player.x = b.width * 0.5;
    this.player.y = Math.max(
      b.height * 0.42,
      Math.min(b.height * 0.62, this.player.y)
    );
    this._shipHunt.active = true;
    this._shipHunt.ax = this.player.x;
    this._shipHunt.ay = this.player.y;
    this._shipHunt.dirX = dx;
    this._shipHunt.dirY = dy;
    // Пловец ограничен canvas, поэтому в мировых координатах он может сдвинуться
    // максимум на (w/2 - padX) вдоль dx. Жемчужина должна попадать в эту зону,
    // но чуть короче — чтобы игрок реально «возвращался» к ней, а не упирался в стену.
    const padX = this.player.halfW + 36;
    const padY = this.player.halfH + 44;
    const roomX = Math.abs(dx) > 0.05
      ? (b.width * 0.5 - padX) / Math.abs(dx)
      : Infinity;
    const roomY = Math.abs(dy) > 0.05
      ? (b.height * 0.5 - padY) / Math.abs(dy)
      : Infinity;
    const safeProj = Math.max(220, Math.min(roomX, roomY));
    // Желаемая длина охоты подстраивается под доступное место: жемчужина
    // всегда появляется чуть ближе правого края, потом скроллится к центру.
    const desiredProj = Math.min(safeProj * 0.78, 520) * (0.82 + Math.random() * 0.18);
    this._shipHunt.pearlProj = Math.max(220, Math.min(desiredProj, safeProj));
    this._shipHunt.pearlProjHome = this._shipHunt.pearlProj;
    this._shipHunt.laneHalfW = 135 + Math.random() * 24;
    this._shipHunt.missed = false;
    this._shipHunt.found = false;
    this._shipHunt.phase = 0;
    this._shipHunt.phaseT = 0;
    this._shipHunt.surfLight = 0;
    this._shipHunt.pickupPause = 0;
    this._shipHunt.decoSeed = Math.random() * 1000;
    this._shipHunt.worldProg = 0;
    this._shipHunt.shoutT = 0;
    this._shipHunt.wowT = 0;
    this._shipHunt.searchT = 0;
    this._shipHunt.pearlHintT = 0;
    this._shipHunt.pearlSeenT = 0;
    this._shipHunt.pearlLocked = false;
    this._shipHunt.pearlFlickerT = 0;
    this._shipHunt.pearlLostUsed = false;
    this._shipHunt.dolphinX = this.player.x - dx * 180;
    this._shipHunt.dolphinY = this.player.y + 46;
    this._shipHunt.dolphinT = 0;
    this._shipHunt.dolphinObserveT = 0;
    this._shipHunt._sfxDolphinDone = false;
    this._dolphinActor = null;
    this._caveEntranceGhosts = [];
    this._stageTwoBuddies = [];
    for (const p of this.pearls) p.active = false;
    const pwx0 = this._shipHunt.ax + this._shipHunt.pearlProj * this._shipHunt.dirX;
    const pwy0 = this._shipHunt.ay + this._shipHunt.pearlProj * this._shipHunt.dirY;
    const mir = [];
    for (let i = 0; i < 3; i++) {
      let wx;
      let wy;
      let guard = 0;
      do {
        const ang = this._shipHunt.decoSeed * 0.37 + i * 2.07 + Math.random() * 0.9;
        const rad = 140 + i * 52 + Math.random() * 100;
        wx = pwx0 + Math.cos(ang) * rad;
        wy = pwy0 + Math.sin(ang) * rad * 0.58;
        guard += 1;
      } while (Math.hypot(wx - pwx0, wy - pwy0) < 118 && guard < 12);
      mir.push({
        wx,
        wy,
        t0: 1.2 + i * 5.5,
        dur: 3.4 + Math.random() * 0.6,
      });
    }
    this._shipHunt.mirages = mir;
    let lastMirEnd = 0;
    for (const m of mir) lastMirEnd = Math.max(lastMirEnd, m.t0 + m.dur);
    /** Пока идут миражи + пауза — настоящей жемчужины на дне нет (только ложный свет). */
    this._shipHunt.revealPearlAfter = lastMirEnd + 4.2;
    this._shipHunt.nearPearlTimer = 0;
    this._shipHunt.huntClock = 0;
    // Удерживаем поиск в границах экрана, чтобы цель можно было пропустить и вернуться.
    this.player.x = Math.min(b.width - this.player.halfW - 20, Math.max(this.player.halfW + 20, this.player.x));
    this.player.y = Math.min(b.height - this.player.halfH - 20, Math.max(this.player.halfH + 20, this.player.y));
  }

  /** Точка «рук» — только для лёгкого сдвига подсказки/свечения, не для зоны подбора. */
  _shipHuntPearlPickupPoint() {
    const f = this.player._face;
    return {
      x: this.player.x + f * 16,
      y: this.player.y - 10,
    };
  }

  /**
   * Геометрия пловца относительно жемчужины (мир).
   * `dist` — от центра тела (подсказки), `distReach` — минимум до точки рук и тела (подбор в упор).
   * @returns {{ proj: number, side: number, dist: number, distReach: number, pwx: number, pwy: number }}
   */
  _shipHuntPearlGeometry() {
    const sh = this._shipHunt;
    const cx = this.player.x;
    const cy = this.player.y;
    const relX = cx - sh.ax;
    const relY = cy - sh.ay;
    const proj = relX * sh.dirX + relY * sh.dirY;
    const side = relX * -sh.dirY + relY * sh.dirX;
    const pwx = sh.ax + sh.pearlProj * sh.dirX;
    const pwy = sh.ay + sh.pearlProj * sh.dirY;
    const dist = Math.hypot(cx - pwx, cy - pwy);
    const hp = this._shipHuntPearlPickupPoint();
    const distHand = Math.hypot(hp.x - pwx, hp.y - pwy);
    const distReach = Math.min(dist, distHand);
    return { proj, side, dist, distReach, pwx, pwy };
  }

  /**
   * Камера охоты за жемчужиной. Пловец «якорится» в центре экрана, а мир (дно,
   * обломки, водоросли, жемчужина) скроллится мимо по траектории dirX/dirY
   * пропорционально пройденному пути. Используется и для рендера декораций
   * слоя охоты, и для сдвига пловца/дельфина, чтобы они зрительно совпадали
   * с миром и жемчужиной.
   */
  _shipHuntCamera() {
    const sh = this._shipHunt;
    return {
      x: sh.worldProg * sh.dirX,
      y: sh.worldProg * sh.dirY,
    };
  }

  /** Сейчас играет короткая ложная вспышка (обманный огонь). */
  _activeShipHuntMirage() {
    const sh = this._shipHunt;
    if (!sh.active || sh.found || !sh.mirages || sh.mirages.length === 0) return null;
    const st = sh.huntClock;
    for (const mir of sh.mirages) {
      if (st >= mir.t0 && st <= mir.t0 + mir.dur) return mir;
    }
    return null;
  }

  /**
   * Подбор жемчужины: строго по близости к реальной позиции тайника (галочка-маркер).
   * Без широких прямоугольных зон и time-fallback — чтобы не было эффекта «телепорта в руки».
   * Подсказка (pearlHintT) усиливает свечение галочки, но сам подбор — только когда игрок
   * физически подплыл к метке.
   */
  _shipHuntPearlPickupInRange() {
    const sh = this._shipHunt;
    if (!sh.active || sh.found) return false;
    if (sh.huntClock < sh.revealPearlAfter) return false;
    const { distReach } = this._shipHuntPearlGeometry();
    return distReach < 84;
  }

  /** Автоподбор после осмотра: вспышки, фазы дельфина. */
  _triggerShipHuntPearlPickup() {
    if (!this._shipHunt.active || this._shipHunt.found) return;
    const sh = this._shipHunt;
    sh.found = true;
    sh.phase = 0;
    sh.phaseT = 0;
    sh.pickupPause = 1.42;
    sh.shoutT = 2.85;
    sh.wowT = 2.85;
    sh.pearlHintT = 0;
    sh.pearlLocked = true;
    sh.dolphinObserveT = 0;
    sh.nearPearlTimer = 0;
    this.pickupVfx.addPearlBurst(this.player.x + sh.dirX * 14, this.player.y - 10);
    for (let i = 0; i < 3; i++) {
      this.pickupVfx.addPearlBurst(
        this.player.x + Math.cos(i * 2.1) * 18,
        this.player.y - 10 + Math.sin(i * 2.1) * 10
      );
    }
    if (this.audio && typeof this.audio.playPearlChime === "function") {
      this.audio.playPearlChime();
    }
  }

  /** «Вернуться назад» — подъём к поверхности; акулы уплывут после выхода наверх */
  sharkChoiceReturnBack() {
    if (this.state !== GameState.SHARK_CHOICE) return;
    this._hideSharkChoiceOverlay();
    this._modalBackdrop = 0;
    this.state = GameState.STAGE_TWO;
    this._pressureEase = 0.88;
    this._pressureEaseRemaining = 28;
    this._nudgePlayerTimer = 0;
    this._sharkUserResolved = true;
    this._sharksFleeing = false;
    this._surfacingAfterSharks = true;
    this.player.vy = -280;
  }

  /** «Спрятаться» — погоня к пещере */
  sharkChoiceHideShelter() {
    if (this.state !== GameState.SHARK_CHOICE) return;
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    this._beginCaveChase();
  }

  _focusGameCanvas() {
    const c = this.renderer.canvas;
    try {
      c.focus({ preventScroll: true });
    } catch {
      c.focus();
    }
  }

  _beginCaveChase() {
    this._hideSharkChoiceOverlay();
    this._hideCaveChaseLoseOverlay();
    this._modalBackdrop = 0;
    this._surfacingAfterSharks = false;
    this._sharkEventActive = false;
    this._sharksFleeing = false;
    this._sharkUserResolved = true;
    this._sharkPromptOpen = false;

    const b = this.renderer.bounds;
    this._caveLosePhase = 0;
    this._caveLoseT = 0;
    this._caveFadeA = 0;
    this._caveWinPhase = 0;
    this._caveWinT = 0;
    this._caveChaseHintElapsed = 0;

    this._caveChasePhase = CAVE_CHASE_PHASE_ORIENT;
    this._cavePhaseTimer = 0;
    this._caveOrientDuration =
      CAVE_PHASE_ORIENT_MIN +
      Math.random() * (CAVE_PHASE_ORIENT_MAX - CAVE_PHASE_ORIENT_MIN);
    this._caveBuildupDuration =
      CAVE_PHASE_BUILDUP_MIN +
      Math.random() * (CAVE_PHASE_BUILDUP_MAX - CAVE_PHASE_BUILDUP_MIN);
    this._caveBuildupSharkMul = 0.35 + Math.random() * 0.25;

    this._caveGraceRemain =
      CAVE_GRACE_T_MIN +
      Math.random() * (CAVE_GRACE_T_MAX - CAVE_GRACE_T_MIN);

    const refX = this.player.x;
    const ratio = refX / Math.max(1, b.width);
    const minSep =
      b.width *
      (CAVE_SAFE_DIST_MIN_FRAC +
        Math.random() * (CAVE_SAFE_DIST_MAX_FRAC - CAVE_SAFE_DIST_MIN_FRAC));

    /** @type {'left' | 'right' | 'split'} */
    let packSide;
    if (ratio > 0.55) {
      packSide = "left";
    } else if (ratio < 0.45) {
      packSide = "right";
    } else {
      packSide = "split";
    }

    this._caveCy = b.height * 0.64;
    this._caveR = 56;

    if (packSide === "left") {
      this._caveCx = b.width * 0.86;
      this._caveChaseDir = 1;
    } else if (packSide === "right") {
      this._caveCx = b.width * 0.14;
      this._caveChaseDir = -1;
    } else {
      this._caveCx = b.width * 0.5;
      this._caveChaseDir = ratio >= 0.5 ? 1 : -1;
    }

    const hw = this.player.halfW;
    const reach = this._caveR + CAVE_WIN_REACH;
    const minCx = hw + reach;
    const maxCx = b.width - hw - reach;
    this._caveCx = Math.max(minCx, Math.min(maxCx, this._caveCx));

    const toward = this._caveChaseDir * b.width * 0.06;
    const px = b.width * 0.5 + toward;
    const py = b.height * 0.46;
    this.player.x = px;
    this.player.y = py;
    this.player.vx = 0;
    this.player.vy = 0;
    this.player._face = this._caveChaseDir >= 0 ? 1 : -1;

    for (const bud of this._stageTwoBuddies) {
      if (bud.role === "stay") {
        bud.x = px + this._caveChaseDir * 44;
        bud.y = py - 4;
        bud.sx = bud.x;
        bud.sy = bud.y;
        bud.tx = bud.x + this._caveChaseDir * 160;
        bud.ty = bud.y;
      }
    }

    this._sharks = [];
    const aimShark = (s, sx, sy) => {
      const dx = this.player.x - sx;
      const dy = this.player.y - sy;
      const d = Math.hypot(dx, dy) || 1;
      s.x = sx;
      s.y = sy;
      s.vx = (dx / d) * 55;
      s.vy = (dy / d) * 38;
      s.angle = Math.atan2(s.vy, s.vx);
      s.emerge = 1;
      s.alpha = 0.94;
    };

    if (packSide === "left") {
      for (let i = 0; i < 3; i++) {
        const s = new StageTwoShark(b.width, b.height, i, 3);
        const sx = this.player.x - minSep - 48 - i * 46;
        const sy = py + (i - 1) * 34;
        aimShark(s, sx, sy);
        this._sharks.push(s);
      }
    } else if (packSide === "right") {
      for (let i = 0; i < 3; i++) {
        const s = new StageTwoShark(b.width, b.height, i, 3);
        const sx = this.player.x + minSep + 48 + i * 46;
        const sy = py + (i - 1) * 34;
        aimShark(s, sx, sy);
        this._sharks.push(s);
      }
    } else {
      const s0 = new StageTwoShark(b.width, b.height, 0, 3);
      aimShark(s0, this.player.x - minSep - 40, py + 8);
      this._sharks.push(s0);
      const s1 = new StageTwoShark(b.width, b.height, 1, 3);
      aimShark(s1, this.player.x + minSep + 40, py - 6);
      this._sharks.push(s1);
      const s2 = new StageTwoShark(b.width, b.height, 2, 3);
      aimShark(s2, this.player.x + (Math.random() < 0.5 ? -0.35 : 0.35) * minSep, py + 52);
      this._sharks.push(s2);
    }

    this.input.clearNavigationKeys();
    this._focusGameCanvas();
    this.state = GameState.CAVE_CHASE;
    if (this.audio && typeof this.audio.playSharksArrive === "function") {
      this.audio.playSharksArrive();
    }
  }

  caveChaseTryAgain() {
    if (this.state !== GameState.CAVE_CHASE_LOSE) return;
    this._hideCaveChaseLoseOverlay();
    this._modalBackdrop = 0;
    this._beginCaveChase();
  }

  /** Вернуться ко второму этапу после поражения в погоне */
  caveChaseFinish() {
    if (this.state !== GameState.CAVE_CHASE_LOSE) return;
    this._hideCaveChaseLoseOverlay();
    this._modalBackdrop = 0;
    this._sharks = [];
    this._caveLosePhase = 0;
    this._caveWinPhase = 0;
    this.state = GameState.STAGE_TWO;
  }

  _finishCaveChaseWin() {
    this._sharks = [];
    this._caveWinPhase = 0;
    this._caveWinT = 0;
    this._caveLosePhase = 0;
    this._beginCaveInside();
  }

  _beginCaveInside() {
    const b = this.renderer.bounds;
    const maze = buildCaveInsideMaze(CAVE_MAZE_CELL_COLS, CAVE_MAZE_CELL_ROWS);
    const padX = 44;
    const padTop = 46;
    const padBot = 96;
    const availW = Math.max(80, b.width - padX * 2);
    const availH = Math.max(80, b.height - padTop - padBot);
    const cell = Math.min(availW / maze.W, availH / maze.H);
    const mw = cell * maze.W;
    const mh = cell * maze.H;
    const ox = (b.width - mw) * 0.5;
    const oy = padTop + Math.max(8, (availH - mh) * 0.42);
    this._caveMazeLayout = { maze, ox, oy, cell };
    this._caveVisitHeat = new Float32Array(maze.W * maze.H);
    this._caveSparks = [];
    this._caveSparkAccumulator = 0;
    this._caveFlickerT = Math.random() * 40;
    this._caveExitDwell = 0;
    for (const o of this.oxygenPickups) {
      if (o.active) o.collect();
    }
    this._oxygenTimeSinceSpawn = 0;
    this._oxygenSpawnTimer = 0.35;

    this._caveMicroFlash = 0;
    this._caveEntranceGhosts = [];
    const entGhostY = oy + (maze.entranceGy + 0.48) * cell;
    for (let i = 0; i < 3; i++) {
      this._caveEntranceGhosts.push({
        x: ox + mw * (0.2 + i * 0.29 + Math.random() * 0.05),
        y: entGhostY + (Math.random() - 0.5) * cell * 0.42,
        ph: Math.random() * Math.PI * 2,
        sc: 0.52 + Math.random() * 0.38,
      });
    }

    this.player.x = ox + (maze.entranceGx + 0.5) * cell;
    this.player.y = oy + (maze.entranceGy + 0.5) * cell;
    this.player.vx = 0;
    this.player.vy = 0;
    this._caveInsideIntroT = 0;
    this._caveInsideWarmBand = (Math.random() * 3) | 0;
    this._caveInsideBubbles = [];
    this._caveInsideNextBubble = 0;
    if (Math.random() < 0.55) {
      this._caveInsideSil = {
        x: ox + mw * (0.2 + Math.random() * 0.6),
        y: oy + mh * (0.25 + Math.random() * 0.5),
        vx: (Math.random() < 0.5 ? -1 : 1) * (18 + Math.random() * 14),
        vy: 0,
        t: 0,
        kind: Math.random() < 0.55 ? "fish" : "turtle",
      };
    } else {
      this._caveInsideSil = null;
    }

    for (const bud of this._stageTwoBuddies) {
      if (bud.role !== "stay") continue;
      const bx = this.player.x - this.player._face * 46;
      bud.x = bx;
      bud.y = this.player.y + 8;
      bud.sx = bud.x;
      bud.sy = bud.y;
      bud.tx = bud.x - this.player._face * 120;
      bud.ty = bud.y;
      bud._caveAiVx = 0;
      bud._caveAiVy = 0;
      bud._caveDoubtT = 0;
      bud._caveWPh = Math.random() * Math.PI * 2;
      bud._caveLagX = this.player.x;
      bud._caveLagY = this.player.y;
    }

    this._resolveCaveMazeEntity(
      this.player,
      this.player.x,
      this.player.y,
      this.player.halfW * 0.66,
      this.player.halfH * 0.66
    );
    this.air = this.airMax;
    this.input.clearNavigationKeys();
    this._focusGameCanvas();
    this.state = GameState.CAVE_INSIDE;
  }

  _exitCaveInsideToOcean() {
    if (this.state !== GameState.CAVE_INSIDE) return;
    for (const o of this.oxygenPickups) {
      if (o.active) o.collect();
    }
    this._caveEntranceGhosts = [];
    this._caveInsideBubbles = [];
    this._caveInsideSil = null;
    this._caveMazeLayout = null;
    this._caveVisitHeat = null;
    this._caveSparks = [];
    this._caveExitDwell = 0;
    this._postCaveCollectTarget = null;
    this._shipHuntActive = false;
    // После пещеры не должно оставаться «автовсплытия» от сцены с акулами.
    this._surfacingAfterSharks = false;
    this._sharksFleeing = false;
    this._sharkEventActive = false;
    this._sharkPromptOpen = false;
    this._sharks = [];
    this._caveExitScenePhase = 0;
    this._caveExitSceneT = 0;
    const b = this.renderer.bounds;
    this.player.x = b.width * 0.64;
    this.player.y = b.height * 0.74;
    this.player.vx = 0;
    this.player.vy = -16;
    this.player._face = 1;
    for (const bud of this._stageTwoBuddies) {
      if (bud.role !== "stay") continue;
      bud.x = this.player.x - 56;
      bud.y = this.player.y + 12;
    }
    this.state = GameState.CAVE_EXIT_TRANSITION;
    this._modalBackdrop = 0;
    if (this.audio && typeof this.audio.playCaveEmergence === "function") {
      this.audio.playCaveEmergence();
    }
  }

  _finishCaveExitTransition() {
    // Гарантируем полный выход из акулий ветки перед финальными состояниями.
    this._surfacingAfterSharks = false;
    this._sharksFleeing = false;
    this._sharkEventActive = false;
    this._sharkPromptOpen = false;
    this._sharks = [];
    if (this.caveChoiceUi) {
      this.state = GameState.CAVE_AFTER_CHOICE;
      this._showCaveChoiceOverlay();
    } else {
      this.state = GameState.SHIP_HUNT;
      this._shipHuntActive = true;
      this._startShipHuntMode();
    }
  }

  _updateCaveExitTransition(dt) {
    this._caveExitSceneT += dt;
    if (this._caveExitScenePhase === 0) {
      this.player.y -= 14 * dt;
      if (this._caveExitSceneT >= 2.55) {
        this._caveExitScenePhase = 1;
        this._caveExitSceneT = 0;
      }
      return;
    }
    if (this._caveExitScenePhase === 1) {
      for (const bud of this._stageTwoBuddies) {
        if (bud.role !== "stay") continue;
        bud.x += (this.player.x + 26 - bud.x) * Math.min(1, 2.8 * dt);
        bud.y -= 74 * dt;
      }
      this._stageTwoBuddies = this._stageTwoBuddies.filter((b) => b.role !== "stay" || b.y > -54);
      if (this._caveExitSceneT >= 3.2) {
        this._caveExitScenePhase = 2;
        this._caveExitSceneT = 0;
      }
      return;
    }
    this._finishCaveExitTransition();
  }

  /**
   * @param {{ x: number, y: number, halfW?: number, halfH?: number }} ent сущность с позицией (игрок / друг)
   * @param {number} px
   * @param {number} py
   * @param {number} hw
   * @param {number} hh
   */
  _caveMazeFitsAt(px, py, hw, hh) {
    const L = this._caveMazeLayout;
    if (!L) return true;
    const { maze, ox, oy, cell } = L;
    const floor = maze.walkGrid || maze.grid;
    const sx = hw * 0.62;
    const sy = hh * 0.62;
    const pts = [
      [px, py],
      [px - sx, py],
      [px + sx, py],
      [px, py - sy],
      [px, py + sy],
    ];
    for (const [cx, cy] of pts) {
      const gx = Math.floor((cx - ox) / cell);
      const gy = Math.floor((cy - oy) / cell);
      if (gx < 0 || gy < 0 || gx >= maze.W || gy >= maze.H) return false;
      if (!floor[gy][gx]) return false;
    }
    return true;
  }

  /**
   * @param {{ x: number, y: number, vx?: number, vy?: number }} ent
   * @param {number} px
   * @param {number} py
   * @param {number} hw
   * @param {number} hh
   */
  _resolveCaveMazeEntity(ent, px, py, hw, hh) {
    const L = this._caveMazeLayout;
    if (!L) return;
    const px0 = ent.x;
    const py0 = ent.y;
    if (this._caveMazeFitsAt(px, py, hw, hh)) {
      ent.x = px;
      ent.y = py;
      return;
    }
    if (this._caveMazeFitsAt(px, py0, hw, hh)) {
      ent.x = px;
      ent.y = py0;
      if (ent.vx !== undefined) ent.vx *= 0.58;
      return;
    }
    if (this._caveMazeFitsAt(px0, py, hw, hh)) {
      ent.x = px0;
      ent.y = py;
      if (ent.vy !== undefined) ent.vy *= 0.58;
      return;
    }
    ent.x = px0;
    ent.y = py0;
    if (ent.vx !== undefined) ent.vx *= 0.52;
    if (ent.vy !== undefined) ent.vy *= 0.52;
  }

  /** Игрок в зоне выхода (соседние клетки с выходом) */
  _cavePlayerNearExit() {
    const L = this._caveMazeLayout;
    if (!L) return false;
    const { maze, ox, oy, cell } = L;
    const gx = Math.floor((this.player.x - ox) / cell);
    const gy = Math.floor((this.player.y - oy) / cell);
    const ex = maze.exitGx;
    const ey = maze.exitGy;
    if (gx < 0 || gy < 0 || gx >= maze.W || gy >= maze.H) return false;
    if (!maze.grid[gy][gx]) return false;
    return Math.abs(gx - ex) <= 1 && Math.abs(gy - ey) <= 1;
  }

  _nudgeBuddyIntoCaveMaze() {
    const L = this._caveMazeLayout;
    if (!L) return;
    const hwB = 20;
    const hhB = 28;
    for (const bud of this._stageTwoBuddies) {
      if (bud.role !== "stay") continue;
      for (let k = 0; k < 10; k++) {
        if (this._caveMazeFitsAt(bud.x, bud.y, hwB, hhB)) break;
        bud.x += (this.player.x - bud.x) * 0.38;
        bud.y += (this.player.y - bud.y) * 0.38;
      }
    }
  }

  _cavePlayerTorchAngle() {
    const sp = Math.hypot(this.player.vx, this.player.vy);
    if (sp > 22) return Math.atan2(this.player.vy, this.player.vx);
    return this.player._face > 0 ? 0 : Math.PI;
  }

  /**
   * @param {number} wx
   * @param {number} wy
   * @param {number} px
   * @param {number} py
   * @param {number} radius
   * @param {number} ang
   */
  _caveTorchBright(wx, wy, px, py, radius, ang) {
    const dx = wx - px;
    const dy = wy - py;
    const d = Math.hypot(dx, dy);
    if (d < 0.6) return 0.98;
    const fall = Math.max(0, 1 - Math.pow(d / radius, 1.12));
    const ndx = dx / d;
    const ndy = dy / d;
    const fx = Math.cos(ang);
    const fy = Math.sin(ang);
    const dot = Math.max(-0.32, ndx * fx + ndy * fy);
    const cone = 0.1 + 0.9 * dot;
    const wrap = Math.max(0, 1 - d / (radius * 1.55));
    return Math.min(1, fall * cone + 0.12 + wrap * 0.14);
  }

  /**
   * @param {object} maze
   * @param {number} ox
   * @param {number} oy
   * @param {number} cell
   * @param {Float32Array} heatArr
   * @param {number} wx
   * @param {number} wy
   * @param {{ x: number; y: number } | null} bud
   */
  _caveBrightWorld(maze, ox, oy, cell, heatArr, wx, wy, bud) {
    const W = maze.W;
    const H = maze.H;
    const gx = Math.floor((wx - ox) / cell);
    const gy = Math.floor((wy - oy) / cell);
    let mem = 0;
    const floorMem = maze.walkGrid || maze.grid;
    if (gx >= 0 && gy >= 0 && gx < W && gy < H && floorMem[gy][gx]) {
      mem = heatArr[gy * W + gx] || 0;
    }
    const pang = this._cavePlayerTorchAngle();
    let lit = this._caveTorchBright(
      wx,
      wy,
      this.player.x,
      this.player.y,
      CAVE_TORCH_RADIUS,
      pang
    );
    if (bud) {
      const sp = (bud._caveAiVx || 0) ** 2 + (bud._caveAiVy || 0) ** 2;
      const bang =
        sp > 360
          ? Math.atan2(bud._caveAiVy, bud._caveAiVx)
          : Math.atan2(this.player.y - bud.y, this.player.x - bud.x);
      lit = Math.max(
        lit,
        this._caveTorchBright(
          wx,
          wy,
          bud.x,
          bud.y,
          CAVE_TORCH_RADIUS_BUDDY,
          bang
        ) * 0.96
      );
    }
    const ecx = ox + (maze.exitGx + 0.5) * cell;
    const ecy = oy + (maze.exitGy + 0.5) * cell;
    const edx = ecx - wx;
    const edy = ecy - wy;
    const ed = Math.hypot(edx, edy) + 28;
    const span = cell * Math.max(W, H) * 0.48;
    const exitVeil =
      0.036 * Math.pow(Math.max(0, 1 - Math.min(1, ed / span)), 1.35);
    const fx = Math.cos(pang);
    const fy = Math.sin(pang);
    const align =
      ed > 36
        ? 0.014 * ((edx * fx + edy * fy) / ed) * Math.min(1, ed / (cell * 7))
        : 0;
    lit = Math.min(1, lit + exitVeil + align);
    return Math.min(1, 0.08 + lit * 0.9 + mem * 0.38);
  }

  _caveUpdateVisitHeatAndSparks(dt, maze, ox, oy, cell) {
    const heat = this._caveVisitHeat;
    if (!heat) return;
    const W = maze.W;
    const H = maze.H;
    for (let i = 0; i < heat.length; i++) heat[i] *= CAVE_HEAT_DECAY;

    const stamp = (px, py, gain, rad) => {
      const rC = rad / cell + 1.1;
      const gxc = (px - ox) / cell;
      const gyc = (py - oy) / cell;
      const g0 = Math.max(0, Math.floor(gxc - rC));
      const g1 = Math.min(W - 1, Math.ceil(gxc + rC));
      const h0 = Math.max(0, Math.floor(gyc - rC));
      const h1 = Math.min(H - 1, Math.ceil(gyc + rC));
      const pathOk = maze.walkGrid || maze.grid;
      for (let gy = h0; gy <= h1; gy++) {
        for (let gx = g0; gx <= g1; gx++) {
          if (!pathOk[gy][gx]) continue;
          const cx = ox + (gx + 0.5) * cell;
          const cy = oy + (gy + 0.5) * cell;
          const d = Math.hypot(cx - px, cy - py);
          if (d >= rad) continue;
          const k = gain * (1 - d / rad) * dt;
          const idx = gy * W + gx;
          heat[idx] = Math.min(1, heat[idx] + k);
        }
      }
    };

    stamp(this.player.x, this.player.y, CAVE_HEAT_GAIN_PLAYER, 112);
    for (const bud of this._stageTwoBuddies) {
      if (bud.role !== "stay") continue;
      stamp(bud.x, bud.y, CAVE_HEAT_GAIN_BUDDY, 78);
    }

    let sparkMul = 1;
    const pgx = Math.floor((this.player.x - ox) / cell);
    const pgy = Math.floor((this.player.y - oy) / cell);
    if (pgx >= 0 && pgx < W && pgy >= 0 && pgy < H) {
      if (pgx / W > 0.56) sparkMul = 1.72;
    }
    this._caveSparkAccumulator += dt * 2.8 * sparkMul;
    while (this._caveSparkAccumulator >= 0.55) {
      this._caveSparkAccumulator -= 0.48 + Math.random() * 0.55;
      const a = Math.random() * Math.PI * 2;
      const rd = 36 + Math.random() * 88;
      this._caveSparks.push({
        x: this.player.x + Math.cos(a) * rd,
        y: this.player.y + Math.sin(a) * rd,
        vx: (Math.random() - 0.5) * 26,
        vy: -18 - Math.random() * 28,
        hue: Math.random(),
        life: 0.55 + Math.random() * 0.75,
      });
    }
    const bnd = this.renderer.bounds;
    for (const s of this._caveSparks) {
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= 1 - dt * 0.35;
      s.vy -= dt * 12;
    }
    this._caveSparks = this._caveSparks.filter(
      (s) => s.life > 0 && s.x > -20 && s.x < bnd.width + 20 && s.y > -30
    );
    if (this._caveSparks.length > 48) {
      this._caveSparks.splice(0, this._caveSparks.length - 48);
    }
  }

  _updateCaveInsideBuddyAi(dt) {
    const L = this._caveMazeLayout;
    for (const bud of this._stageTwoBuddies) {
      if (bud.role !== "stay") continue;
      if (L && !this._caveMazeFitsAt(bud.x, bud.y, 20, 28)) {
        bud._caveAiVx = 0;
        bud._caveAiVy = 0;
        this._nudgeBuddyIntoCaveMaze();
      }
      const lag = 2.15;
      bud._caveLagX =
        (bud._caveLagX ?? this.player.x) +
        (this.player.x - (bud._caveLagX ?? this.player.x)) * lag * dt;
      bud._caveLagY =
        (bud._caveLagY ?? this.player.y) +
        (this.player.y - (bud._caveLagY ?? this.player.y)) * lag * dt;
      const back = -this.player._face;
      const side = Math.sin((bud._caveWPh || 0) * 1.08 + bud.phase * 0.4) * 34;
      const tx =
        bud._caveLagX + back * 78 + Math.sin(this.underwater.t * 0.38 + bud.phase) * 8;
      const ty = bud._caveLagY + 12 + side;
      bud._caveDoubtT = (bud._caveDoubtT || 0) - dt;
      if ((bud._caveDoubtT || 0) <= 0 && Math.random() < 0.092 * dt) {
        bud._caveDoubtT = 0.45 + Math.random() * 0.95;
      }
      const doubt = (bud._caveDoubtT || 0) > 0 ? 0.22 : 1;
      bud._caveWPh = (bud._caveWPh || 0) + dt * (1.25 + Math.sin((bud._caveWPh || 0) * 0.7) * 0.12);
      const ox = Math.sin(bud._caveWPh) * 22 + Math.sin(this.underwater.t * 0.62 + bud.phase) * 14;
      const oy2 = Math.cos(bud._caveWPh * 0.86) * 20;
      let ax = (tx + ox - bud.x) * 1.62 * doubt;
      let ay = (ty + oy2 - bud.y) * 1.38 * doubt;
      let vx = (bud._caveAiVx || 0) + ax * dt;
      let vy = (bud._caveAiVy || 0) + ay * dt;
      const cap = 74;
      let sp = Math.hypot(vx, vy);
      if (sp > cap) {
        vx *= cap / sp;
        vy *= cap / sp;
      }
      vx *= Math.exp(-0.72 * dt);
      vy *= Math.exp(-0.72 * dt);
      const px0 = bud.x;
      const py0 = bud.y;
      const nx = bud.x + vx * dt;
      const ny = bud.y + vy * dt;
      this._resolveCaveMazeEntity(bud, nx, ny, 20, 28);
      const dtd = Math.max(0.0008, dt);
      bud._caveAiVx = (bud.x - px0) / dtd;
      bud._caveAiVy = (bud.y - py0) / dtd;
      bud.tx = bud.x - this.player._face * 130;
      bud.ty = bud.y;
    }
  }

  /** Не даём другу «зажимать» игрока: сдвиг только друга, без отталкивания игрока. */
  _caveSeparatePlayerBuddy() {
    const bud = this._stageTwoBuddies.find((b) => b.role === "stay");
    if (!bud || !this._caveMazeLayout) return;
    const dx = bud.x - this.player.x;
    const dy = bud.y - this.player.y;
    const d = Math.hypot(dx, dy);
    const minD = 48;
    if (d >= minD || d < 0.01) return;
    const push = (minD - d) * 0.72;
    const nx = bud.x + (dx / d) * push;
    const ny = bud.y + (dy / d) * push;
    this._resolveCaveMazeEntity(bud, nx, ny, 20, 28);
    if (Math.hypot(bud.x - this.player.x, bud.y - this.player.y) < minD - 2) {
      const perpX = -dy / d;
      const perpY = dx / d;
      const s = (Math.random() < 0.5 ? -1 : 1) * 26;
      this._resolveCaveMazeEntity(bud, bud.x + perpX * s, bud.y + perpY * s, 20, 28);
    }
  }

  _updateCaveInside(dt) {
    const b = this.renderer.bounds;
    const w = b.width;
    const h = b.height;
    this._caveInsideIntroT += dt;
    this._caveFlickerT += dt;

    this.pickupVfx.update(dt);

    const axes = this.input.getMovementAxes();
    const swim = !!this.input.keys["Space"];

    const introSlow =
      this._caveInsideIntroT < CAVE_INSIDE_SOFT_LOCK_T
        ? 0.68 + 0.32 * (this._caveInsideIntroT / CAVE_INSIDE_SOFT_LOCK_T)
        : 1;
    this.player.update(
      dt,
      axes,
      b,
      swim,
      CAVE_INSIDE_MOVE_SCALE * introSlow
    );
    this._resolveCaveMazeEntity(
      this.player,
      this.player.x,
      this.player.y,
      this.player.halfW * 0.66,
      this.player.halfH * 0.66
    );

    const L = this._caveMazeLayout;
    const maze = L?.maze;
    const ox = L?.ox ?? 0;
    const oy = L?.oy ?? 0;
    const cell = L?.cell ?? 32;

    if (maze) {
      const ecx = ox + (maze.exitGx + 0.5) * cell;
      const ecy = oy + (maze.exitGy + 0.5) * cell;
      const ddx = ecx - this.player.x;
      const ddy = ecy - this.player.y;
      const dd = Math.hypot(ddx, ddy) + 1;
      const drift = 12 * dt * CAVE_INSIDE_MOVE_SCALE;
      this.player.vx += (ddx / dd) * drift * 0.042;
      this.player.vy += (ddy / dd) * drift * 0.042;
    }

    if (maze && this._caveVisitHeat) {
      this._caveUpdateVisitHeatAndSparks(dt, maze, ox, oy, cell);
    }

    this._updateCaveInsideBuddyAi(dt);
    for (const bud of this._stageTwoBuddies) {
      if (bud.role !== "stay") continue;
      const hwB = 20;
      const hhB = 28;
      const bx0 = bud.x;
      const by0 = bud.y;
      this._resolveCaveMazeEntity(bud, bud.x, bud.y, hwB, hhB);
      if (bud.x === bx0 && bud.y === by0) {
        this._resolveCaveMazeEntity(bud, bx0, bud.y, hwB, hhB);
        this._resolveCaveMazeEntity(bud, bud.x, by0, hwB, hhB);
      }
    }
    this._caveSeparatePlayerBuddy();

    for (const o of this.oxygenPickups) {
      o.update(dt, b);
    }
    this._tickOxygenRhythm(dt);
    this._checkCaveInsideOxygenPickups();

    this._caveInsideNextBubble -= dt;
    if (maze && this._caveInsideNextBubble <= 0) {
      const walkB = maze.walkGrid || maze.grid;
      let gx = 1 + ((Math.random() * (maze.W - 2)) | 0);
      let gy = 1 + ((Math.random() * (maze.H - 2)) | 0);
      let tries = 0;
      while (!walkB[gy][gx] && tries < 40) {
        gx = 1 + ((Math.random() * (maze.W - 2)) | 0);
        gy = 1 + ((Math.random() * (maze.H - 2)) | 0);
        tries++;
      }
      if (walkB[gy][gx]) {
        const zone = gx / maze.W;
        const onP = maze.onPath[gy][gx];
        const sparse = zone < 0.34 || zone > 0.68;
        const bubbleRich = zone > 0.1 && zone < 0.4;
        const base = sparse ? 0.28 : 0.14;
        const pathBonus = onP ? -0.05 : 0.04;
        const nearExit =
          Math.abs(gx - maze.exitGx) + Math.abs(gy - maze.exitGy) < 4
            ? -0.06
            : 0;
        let nextInt =
          base * 0.62 + Math.random() * 0.2 + pathBonus + nearExit;
        if (bubbleRich) nextInt *= 0.52;
        this._caveInsideNextBubble = nextInt;
        const bx =
          ox +
          (gx + 0.12 + Math.random() * 0.76) * cell;
        const by =
          oy +
          (gy + 0.72 + Math.random() * 0.22) * cell;
        const calm =
          zone > 0.32 &&
          zone < 0.68 &&
          gy / maze.H > 0.26 &&
          gy / maze.H < 0.74;
        const pushBub = (xo, yo) => {
          this._caveInsideBubbles.push({
            x: bx + xo,
            y: by + yo,
            r: 1.4 + Math.random() * 2.6,
            vy: calm ? -(10 + Math.random() * 18) : -(22 + Math.random() * 34),
            vx: 0,
            a: 0.28 + Math.random() * 0.38,
            calm: !!calm,
          });
        };
        pushBub(0, 0);
        if (bubbleRich && Math.random() < 0.48) {
          pushBub((Math.random() - 0.5) * cell * 0.35, (Math.random() - 0.5) * cell * 0.2);
        }
        if (this._caveInsideBubbles.length > 96) {
          this._caveInsideBubbles.splice(0, this._caveInsideBubbles.length - 96);
        }
      } else {
        this._caveInsideNextBubble = 0.2;
      }
    } else if (!maze) {
      this._caveInsideNextBubble = 0.3;
    }

    const t = this.underwater.t;
    const walkB = maze ? maze.walkGrid || maze.grid : null;
    for (const bub of this._caveInsideBubbles) {
      let pullX = 0;
      let pullY = 0;
      if (maze && walkB) {
        const gx = Math.floor((bub.x - ox) / cell);
        const gy = Math.floor((bub.y - oy) / cell);
        if (gx >= 0 && gy >= 0 && gx < maze.W && gy < maze.H && walkB[gy][gx]) {
          if (maze.grid[gy][gx]) {
            const dHere = maze.distExit[gy][gx];
            let best = dHere;
            let bx = 0;
            let by = 0;
            for (const [nx, ny] of _caveFloorNeighbors4(
              maze.grid,
              maze.W,
              maze.H,
              gx,
              gy
            )) {
              const d = maze.distExit[ny][nx];
              if (d < best) {
                best = d;
                bx = nx - gx;
                by = ny - gy;
              }
            }
            const onP = maze.onPath[gy][gx];
            let str = onP ? 23 : 8.2;
            let chaosMul = onP ? 1 : 2.35;
            if (bub.calm) {
              str *= 0.62;
              chaosMul *= 0.48;
            }
            pullX = bx * str;
            pullY = by * str;
            pullX +=
              Math.sin(t * 1.35 + bub.y * 0.028 + gx * 0.4) * 11 * chaosMul;
            pullY +=
              Math.cos(t * 1.1 + bub.x * 0.022 + gy * 0.35) * 4 * chaosMul;
          } else {
            const exw = ox + (maze.exitGx + 0.5) * cell;
            const eyw = oy + (maze.exitGy + 0.5) * cell;
            const ang = Math.atan2(eyw - bub.y, exw - bub.x);
            pullX = Math.cos(ang) * 14;
            pullY = Math.sin(ang) * 14;
            pullX += Math.sin(t * 1.2 + bub.x * 0.03) * 16;
            pullY += Math.cos(t * 1.05 + bub.y * 0.028) * 6;
          }
        }
      }
      bub.y += bub.vy * dt;
      bub.x += (pullX + (bub.vx || 0)) * dt;
      bub.vx = (bub.vx || 0) * 0.92 + pullX * 0.04;
    }
    if (maze) {
      const topY = oy + cell * 0.35;
      const wlk = maze.walkGrid || maze.grid;
      this._caveInsideBubbles = this._caveInsideBubbles.filter((u) => {
        if (u.y < topY) return false;
        const gx = Math.floor((u.x - ox) / cell);
        const gy = Math.floor((u.y - oy) / cell);
        if (gx < 0 || gy < 0 || gx >= maze.W || gy >= maze.H) return false;
        return wlk[gy][gx];
      });
    }

    this._caveMicroFlash = Math.max(0, (this._caveMicroFlash || 0) - dt * 2.25);
    if ((this._caveMicroFlash || 0) <= 0 && Math.random() < 0.034 * dt) {
      this._caveMicroFlash = 0.075 + Math.random() * 0.13;
    }
    this._caveThreatDim =
      0.014 +
      Math.pow(Math.max(0, Math.sin(this._caveFlickerT * 0.035)), 16) * 0.072;
    const tGh = this.underwater.t;
    for (const g of this._caveEntranceGhosts) {
      g.x += Math.sin(tGh * 0.31 + g.ph) * 9 * dt;
      g.y += Math.cos(tGh * 0.27 + g.ph * 1.12) * 3.2 * dt;
    }

    if (this._caveInsideSil && L) {
      const s = this._caveInsideSil;
      s.t += dt;
      s.x += s.vx * dt;
      const mrg = 18;
      const x1 = ox + mrg;
      const x2 = ox + maze.W * cell - mrg;
      if (s.x < x1 || s.x > x2) s.vx *= -1;
      if (s.t > 14) {
        this._caveInsideSil =
          Math.random() < 0.34
            ? {
                x: ox + (0.15 + Math.random() * 0.7) * maze.W * cell,
                y: oy + (0.28 + Math.random() * 0.44) * maze.H * cell,
                vx: (Math.random() < 0.5 ? -1 : 1) * (16 + Math.random() * 14),
                vy: 0,
                t: 0,
                kind: Math.random() < 0.5 ? "fish" : "turtle",
              }
            : null;
      }
    }

    if (this._cavePlayerNearExit()) {
      this._caveExitDwell += dt;
    } else {
      this._caveExitDwell = Math.max(0, this._caveExitDwell - dt * 0.65);
    }

    const canLeave =
      this._caveInsideIntroT >= CAVE_INSIDE_EXIT_LOCK_T &&
      this._cavePlayerNearExit() &&
      (this.input.consumeEnterPress() ||
        this._caveExitDwell >= CAVE_INSIDE_EXIT_DWELL);
    if (canLeave) {
      this._exitCaveInsideToOcean();
    }
  }

  _updateCaveChaseBuddy(dt, swimBoost) {
    const f = swimBoost ? 7.2 : 4.6;
    const dir = this._caveChaseDir >= 0 ? 1 : -1;
    const tx = this.player.x + dir * 46;
    const ty = this.player.y - 5;
    for (const bud of this._stageTwoBuddies) {
      if (bud.role !== "stay") continue;
      bud.x += (tx - bud.x) * Math.min(1, f * dt);
      bud.y += (ty - bud.y) * Math.min(1, f * dt);
    }
  }

  /**
   * Тёмный «рот» пещеры на дне (в координатах мира, уже внутри translate(sway)).
   * @param {CanvasRenderingContext2D} ctx
   */
  _renderCaveEntrance(ctx) {
    const cx = this._caveCx;
    const cy = this._caveCy;
    const r = this._caveR;
    const t = this.underwater.t;
    const pulse = 0.55 + Math.sin(t * 3.1) * 0.22;
    ctx.save();
    const glow = ctx.createRadialGradient(cx - 4, cy, r * 0.4, cx - 4, cy, r * 1.45);
    glow.addColorStop(0, `rgba(64, 220, 210, ${0.12 * pulse})`);
    glow.addColorStop(0.55, `rgba(30, 160, 180, ${0.08 * pulse})`);
    glow.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy, r * 1.2, r * 1.02, -0.12, 0, Math.PI * 2);
    ctx.fill();

    const hole = ctx.createRadialGradient(cx, cy, r * 0.08, cx, cy, r * 1.35);
    hole.addColorStop(0, "rgba(4, 8, 18, 0.98)");
    hole.addColorStop(0.45, "rgba(10, 26, 44, 0.82)");
    hole.addColorStop(0.78, "rgba(16, 44, 62, 0.35)");
    hole.addColorStop(1, "rgba(20, 60, 82, 0)");
    ctx.fillStyle = hole;
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy, r * 1.05, r * 0.88, -0.12, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = `rgba(120, 255, 230, ${0.35 + pulse * 0.25})`;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy, r * 1.02, r * 0.85, -0.12, 0, Math.PI * 2);
    ctx.stroke();
    ctx.lineWidth = 1.4;
    ctx.strokeStyle = `rgba(180, 255, 248, ${0.2 + pulse * 0.15})`;
    ctx.beginPath();
    ctx.ellipse(cx - 4, cy, r * 0.92, r * 0.76, -0.12, 0, Math.PI * 2);
    ctx.stroke();

    const dir = this._caveChaseDir >= 0 ? 1 : -1;
    const ax = cx - 4 - dir * (r * 0.72);
    const ay = cy - r * 0.55;
    const tipX = cx - 4 - dir * (r * 0.38);
    const tipY = cy - r * 0.12;
    ctx.fillStyle = `rgba(100, 255, 235, ${0.45 + pulse * 0.2})`;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(tipX, tipY);
    ctx.lineTo(ax - dir * 14, ay + 18);
    ctx.closePath();
    ctx.fill();

    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    const labelY = cy - r * 1.22 - 6 + Math.sin(t * 2.4) * 2;
    ctx.font = "700 16px system-ui, sans-serif";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0, 24, 40, 0.75)";
    const caveLabel = _t("caveLabel");
    ctx.strokeText(caveLabel, cx - 4, labelY);
    ctx.fillStyle = `rgba(200, 255, 250, ${0.88 + Math.sin(t * 4) * 0.08})`;
    ctx.fillText(caveLabel, cx - 4, labelY);

    ctx.restore();
  }

  /**
   * Крупные подсказки внизу экрана (не пересекают игрока по центру).
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ width: number, height: number }} bounds
   */
  _renderCaveChaseInstructionBanner(ctx, bounds) {
    if (this._caveWinPhase > 0 || this._caveLosePhase > 0) return;
    const maxT = 8.8;
    if (this._caveChaseHintElapsed >= maxT) return;
    const dc = Math.hypot(
      this.player.x - this._caveCx,
      this.player.y - this._caveCy
    );
    if (dc < this._caveR + 55) return;

    const fadeIn = Math.min(1, this._caveChaseHintElapsed * 2.2);
    const fadeOut = Math.max(0, 1 - Math.max(0, this._caveChaseHintElapsed - 6.4) / 2.2);
    const blink = 0.92 + Math.sin(this.underwater.t * 4.8) * 0.08;
    const alpha = 0.92 * fadeIn * fadeOut * blink;

    const lines = [
      _t("caveChase.banner.1"),
      _t("caveChase.banner.2"),
      _t("caveChase.banner.3"),
    ];
    const x = bounds.width * 0.5;
    let y = bounds.height * 0.68;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "700 17px system-ui, sans-serif";
    for (let i = 0; i < lines.length; i++) {
      ctx.lineWidth = 4;
      ctx.strokeStyle = `rgba(0, 18, 32, ${alpha * 0.9})`;
      ctx.strokeText(lines[i], x, y + i * 24);
      ctx.fillStyle = `rgba(220, 255, 252, ${alpha})`;
      ctx.fillText(lines[i], x, y + i * 24);
    }
    ctx.font = "600 13px system-ui, sans-serif";
    ctx.lineWidth = 3;
    ctx.strokeStyle = `rgba(0, 20, 36, ${alpha * 0.85})`;
    const caveChaseHint = _t("caveChase.hint");
    ctx.strokeText(caveChaseHint, x, y + lines.length * 24 + 6);
    ctx.fillStyle = `rgba(160, 245, 235, ${alpha * 0.95})`;
    ctx.fillText(caveChaseHint, x, y + lines.length * 24 + 6);
    ctx.restore();
  }

  /**
   * @param {number} dt
   */
  _updateCaveChaseWin(dt) {
    const cx = this._caveCx;
    const cy = this._caveCy;
    const r = this._caveR;
    const dir = this._caveChaseDir >= 0 ? 1 : -1;
    const innerX = cx - 18 * dir;
    const innerY = cy + 2;
    const bud = this._stageTwoBuddies.find((x) => x.role === "stay");

    if (this._caveWinPhase === 1) {
      this._caveWinT += dt;
      const k = Math.min(1, 5.8 * dt);
      this.player.x += (innerX - this.player.x) * k;
      this.player.y += (innerY - this.player.y) * k;
      if (bud) {
        const bx = innerX + 38 * dir;
        const by = innerY - 4;
        bud.x += (bx - bud.x) * k * 0.92;
        bud.y += (by - bud.y) * k * 0.92;
      }
      const reached =
        Math.hypot(this.player.x - innerX, this.player.y - innerY) < 9 ||
        this._caveWinT > 1.55;
      if (reached) {
        this._caveWinPhase = 2;
        this._caveWinT = 0;
      }
      return;
    }

    if (this._caveWinPhase === 2) {
      this._caveWinT += dt;
      for (const s of this._sharks) {
        const ang = Math.atan2(s.y - cy, s.x - cx);
        const mox = cx + Math.cos(ang) * (r + 14);
        const moy = cy + Math.sin(ang) * (r + 14);
        s.updateCavePursuer(dt, mox, moy, 175);
        const ddc = Math.hypot(s.x - cx, s.y - cy);
        if (ddc < r + 5) {
          s.x = cx + Math.cos(ang) * (r + 7);
          s.y = cy + Math.sin(ang) * (r + 7);
        }
      }
      if (this._caveWinT > 1.7) {
        this._caveWinPhase = 3;
        this._caveWinT = 0;
      }
      return;
    }

    if (this._caveWinPhase === 3) {
      this._caveWinT += dt;
      for (const s of this._sharks) {
        s.updateCaveFlee(dt, cx, cy, 205);
      }
      if (this._caveWinT > 2.15) {
        this._finishCaveChaseWin();
      }
    }
  }

  _clampPlayerInBounds(bounds) {
    const hw = this.player.halfW;
    const hh = this.player.halfH;
    this.player.x = Math.min(bounds.width - hw, Math.max(hw, this.player.x));
    this.player.y = Math.min(bounds.height - hh, Math.max(hh, this.player.y));
  }

  _updateCaveChase(dt) {
    const b = this.renderer.bounds;
    const swimBoost = !!this.input.keys["Space"];

    if (this._caveWinPhase > 0) {
      this.pickupVfx.update(dt);
      this._updateCaveChaseWin(dt);
      this._clampPlayerInBounds(b);
      return;
    }

    if (this._caveLosePhase === 1) {
      this._caveLoseT += dt;
      this.pickupVfx.update(dt);
      const lead = this._sharks[0];
      if (lead) {
        lead.updateCavePursuer(dt, this.player.x, this.player.y, 318);
      }
      this.player.vx *= Math.exp(-5.2 * dt);
      this.player.vy *= Math.exp(-5.2 * dt);
      this.player.x += this.player.vx * dt * 0.32;
      this.player.y += this.player.vy * dt * 0.32;
      this._clampPlayerInBounds(b);
      this._updateCaveChaseBuddy(dt, swimBoost);
      if (this._caveLoseT > 1.08) {
        this._caveLosePhase = 2;
        this._caveLoseT = 0;
      }
      return;
    }

    if (this._caveLosePhase === 2) {
      this.pickupVfx.update(dt);
      this._caveFadeA = Math.min(1, this._caveFadeA + dt * 0.9);
      const lead = this._sharks[0];
      if (lead) {
        lead.updateCavePursuer(dt, this.player.x, this.player.y, 95);
      }
      this.player.vx *= Math.exp(-9 * dt);
      this.player.vy *= Math.exp(-9 * dt);
      this._updateCaveChaseBuddy(dt, swimBoost);
      if (this._caveFadeA >= 1) {
        this.state = GameState.CAVE_CHASE_LOSE;
        this._caveLosePhase = 0;
        this._caveFadeA = 0;
        this._modalBackdrop = 0;
        this._showCaveChaseLoseOverlay();
      }
      return;
    }

    this.pickupVfx.update(dt);
    const axes = this.input.getMovementAxes();
    this.player.update(dt, axes, b, swimBoost);
    this._updateCaveChaseBuddy(dt, swimBoost);

    const dx = this.player.x - this._caveCx;
    const dy = this.player.y - this._caveCy;
    if (Math.hypot(dx, dy) < this._caveR + CAVE_WIN_REACH) {
      this._caveWinPhase = 1;
      this._caveWinT = 0;
      this.player.vx *= 0.35;
      this.player.vy *= 0.35;
      return;
    }

    this._cavePhaseTimer += dt;
    if (this._caveChasePhase === CAVE_CHASE_PHASE_ORIENT) {
      if (this._cavePhaseTimer >= this._caveOrientDuration) {
        this._caveChasePhase = CAVE_CHASE_PHASE_BUILDUP;
        this._cavePhaseTimer = 0;
      }
    } else if (this._caveChasePhase === CAVE_CHASE_PHASE_BUILDUP) {
      if (this._cavePhaseTimer >= this._caveBuildupDuration) {
        this._caveChasePhase = CAVE_CHASE_PHASE_CHASE;
        this._cavePhaseTimer = 0;
      }
    }

    let phaseMul = 1;
    if (this._caveChasePhase === CAVE_CHASE_PHASE_ORIENT) {
      phaseMul = CAVE_SHARK_ORIENT_SPEED_MUL;
    } else if (this._caveChasePhase === CAVE_CHASE_PHASE_BUILDUP) {
      phaseMul = this._caveBuildupSharkMul;
    }

    const inFullChase = this._caveChasePhase === CAVE_CHASE_PHASE_CHASE;
    const graceMul =
      inFullChase && this._caveGraceRemain > 0 ? CAVE_GRACE_PURSUIT_MUL : 1;
    if (inFullChase && this._caveGraceRemain > 0) {
      this._caveGraceRemain = Math.max(0, this._caveGraceRemain - dt);
    }

    const sharkMul = phaseMul * graceMul;

    const lead = this._sharks[0];
    if (lead) {
      lead.updateCavePursuer(
        dt,
        this.player.x,
        this.player.y,
        CAVE_PURSUE_SPEED_MAIN * sharkMul
      );
    }
    if (this._sharks[1]) {
      this._sharks[1].updateCavePursuer(
        dt,
        this.player.x,
        this.player.y,
        CAVE_PURSUE_SPEED_F1 * sharkMul
      );
    }
    if (this._sharks[2]) {
      this._sharks[2].updateCavePursuer(
        dt,
        this.player.x,
        this.player.y,
        CAVE_PURSUE_SPEED_F2 * sharkMul
      );
    }

    if (inFullChase && this._caveGraceRemain <= 0 && lead) {
      const d = Math.hypot(lead.x - this.player.x, lead.y - this.player.y);
      if (d < CAVE_CATCH_DIST) {
        this._caveLosePhase = 1;
        this._caveLoseT = 0;
      }
    }

    this._caveChaseHintElapsed += dt;
  }

  shelterStubContinue() {
    if (!this.shelterStubUi) return;
    this._hideShelterStubOverlay();
    this._modalBackdrop = 0;
    if (this.state === GameState.SHELTER_STUB) {
      this.state = GameState.STAGE_TWO;
    } else if (this._stageTwoUnlocked) {
      this.state = GameState.STAGE_TWO;
    }
    this.input.clearNavigationKeys();
    this._focusGameCanvas();
  }

  _renderStageTwoSharks(ctx) {
    const vh = this.renderer.bounds.height;
    for (const s of this._sharks) {
      s.render(ctx, vh);
    }
  }

  /** Оставшийся друг на этапе 2 (не интро) */
  _renderStageTwoStayBuddy(ctx, swimBoost) {
    const time = this.underwater.t;
    const vh = this.renderer.bounds.height;
    const b = !!swimBoost;
    for (const bud of this._stageTwoBuddies) {
      if (bud.role !== "stay") continue;
      const flip = bud.tx < bud.sx ? -1 : 1;
      this._renderBuddyDiverFigure(ctx, bud.x, bud.y, flip, time, bud.phase, vh, b);
    }
  }

  /** Плавное сопровождение игрока оставшимся другом */
  _updateStageTwoStayBuddy(dt) {
    for (const bud of this._stageTwoBuddies) {
      if (bud.role !== "stay") continue;
      bud.x += (this.player.x + 52 - bud.x) * 0.5 * dt;
      bud.y += (this.player.y - 4 - bud.y) * 0.4 * dt;
    }
  }

  _updateShipHunt(dt) {
    const sh = this._shipHunt;
    if (!sh.active) return;
    const b = this.renderer.bounds;
    const relX = this.player.x - sh.ax;
    const relY = this.player.y - sh.ay;
    const proj = relX * sh.dirX + relY * sh.dirY;
    const passProj = sh.pearlProj + 220;
    sh.searchT += dt;
    sh.pearlHintT = Math.max(0, sh.pearlHintT - dt);

    if (!sh.found && proj > passProj) {
      sh.missed = true;
    }
    if (sh.missed && proj < sh.pearlProj - 90) {
      sh.missed = false;
    }

    // Fail-safe: подсказка и полоса — без сдвига pearlProj (иначе тайник «прыгает», как обманка, и ломается подбор).
    if (!sh.found && sh.searchT > 34) {
      sh.laneHalfW = Math.max(sh.laneHalfW, 178);
      sh.searchT = 0;
      sh.pearlHintT = 4.2;
      sh.missed = false;
    }

    // Плавная прокрутка дна: следуем за прогрессом игрока без резких скачков.
    const trackTarget = Math.max(-160, Math.min(sh.pearlProj + 560, proj));
    sh.worldProg += (trackTarget - sh.worldProg) * Math.min(1, dt * 2.15);
    sh.worldProg = Math.max(-200, Math.min(sh.pearlProj + 560, sh.worldProg));

    sh.huntClock += dt;
    if (!sh.found && sh.huntClock >= sh.revealPearlAfter) {
      // Тайник не «едет» за игроком: фиксируем proj, чтобы не было эффекта телепорта.
      const geo = this._shipHuntPearlGeometry();
      if (sh.missed && this._shipHuntPearlPickupInRange()) {
        sh.missed = false;
      }
      const inBeam = this._shipHuntPearlPickupInRange();
      if (inBeam) {
        sh.nearPearlTimer += dt;
        this.player.vx *= 0.985;
        this.player.vy *= 0.985;
        this._triggerShipHuntPearlPickup();
      } else {
        sh.nearPearlTimer = Math.max(0, sh.nearPearlTimer - dt * 0.1);
      }
    } else if (!sh.found) {
      sh.nearPearlTimer = 0;
    }

    if (sh.found) {
      sh.phaseT += dt;
      sh.shoutT = Math.max(0, sh.shoutT - dt);
      sh.wowT = Math.max(0, sh.wowT - dt);
      if (sh.pickupPause > 0) {
        sh.pickupPause = Math.max(0, sh.pickupPause - dt);
        const slow = sh.phaseT < 0.38 ? 0.58 : 0.72;
        this.player.vx *= slow;
        this.player.vy *= slow;
      }
      if (sh.phase === 0) {
        // После реплики «Нашёл!» появляется дельфин сбоку.
        if (sh.shoutT <= 0.06 && sh.phaseT > 0.48) {
          sh.phase = 1;
          sh.phaseT = 0;
          sh.dolphinObserveT = 0;
          sh.dolphinX = this.player.x - sh.dirX * 260;
          sh.dolphinY = this.player.y + 68;
        }
      } else if (sh.phase === 1) {
        if (!sh._sfxDolphinDone && sh.phaseT >= 0.14) {
          sh._sfxDolphinDone = true;
          if (this.audio && typeof this.audio.playDolphinClick === "function") {
            this.audio.playDolphinClick();
          }
        }
        sh.dolphinT += dt;
        const tx = this.player.x - sh.dirX * 64;
        const ty = this.player.y - 22;
        sh.dolphinX += (tx - sh.dolphinX) * Math.min(1, 1.65 * dt);
        sh.dolphinY += (ty - sh.dolphinY) * Math.min(1, 1.55 * dt);
        const dD = Math.hypot(this.player.x - sh.dolphinX, this.player.y - sh.dolphinY);
        if (dD < 94) sh.dolphinObserveT += dt * 1.15;
        else sh.dolphinObserveT = Math.max(0, sh.dolphinObserveT - dt * 0.55);
        if (sh.dolphinObserveT >= 0.72) {
          sh.phase = 2;
          sh.phaseT = 0;
          sh.dolphinObserveT = 0;
          sh._sfxDolphinAscendAcc = 0;
          // Первый «кли-клик» на момент подхвата — чтобы было слышно,
          // что дельфин забирает пловца.
          if (this.audio && typeof this.audio.playDolphinClick === "function") {
            this.audio.playDolphinClick();
          }
        }
      } else if (sh.phase === 2) {
        sh.dolphinT += dt;
        sh.surfLight = Math.min(1, sh.surfLight + dt * 0.28);
        // Периодические щелчки во время подъёма: дельфин в кадре рядом,
        // сигналит. 1.1–2.0 сек между сигналами, как у настоящих дельфинов.
        sh._sfxDolphinAscendAcc = (sh._sfxDolphinAscendAcc || 0) + dt;
        if (sh._sfxDolphinAscendAcc >= 1.1 + Math.random() * 0.9) {
          sh._sfxDolphinAscendAcc = 0;
          if (this.audio && typeof this.audio.playDolphinClick === "function") {
            this.audio.playDolphinClick();
          }
        }
        const up = 30 * dt;
        this.player.y = Math.max(this.player.halfH + 18, this.player.y - up);
        for (const bud of this._stageTwoBuddies) {
          if (bud.role !== "stay") continue;
          bud.y += (this.player.y - 10 - bud.y) * Math.min(1, 2.8 * dt);
          bud.x += (this.player.x + 48 - bud.x) * Math.min(1, 2.1 * dt);
        }
        sh.dolphinY += (this.player.y - 22 - sh.dolphinY) * Math.min(1, 2.1 * dt);
        sh.dolphinX += (this.player.x - sh.dirX * 52 - sh.dolphinX) * Math.min(1, 2.0 * dt);
        if (sh.surfLight > 0.98 && this.player.y <= this.player.halfH + 20) {
          this._commitBestPearlsScore();
          if (this.winUi) {
            this.state = GameState.WIN;
            this._modalBackdrop = 0;
            this._showWinOverlay();
          }
          return;
        }
      }
    }

    // Свобода управления + мягкое удержание в сцене.
    const hw = this.player.halfW;
    const hh = this.player.halfH;
    this.player.x = Math.min(b.width - hw, Math.max(hw, this.player.x));
    this.player.y = Math.min(b.height - hh, Math.max(hh, this.player.y));
  }

  _renderShipHuntLayer(ctx, bounds) {
    const sh = this._shipHunt;
    if (!sh.active) return;
    const { width: w, height: h } = bounds;
    const relX = this.player.x - sh.ax;
    const relY = this.player.y - sh.ay;
    const proj = relX * sh.dirX + relY * sh.dirY;
    const side = relX * -sh.dirY + relY * sh.dirX;
    const laneK = Math.max(0, 1 - Math.min(1, Math.abs(side) / (sh.laneHalfW * 1.5)));
    const prog = Math.max(0, Math.min(1, proj / sh.pearlProj));
    const missFade = sh.missed ? Math.max(0, 1 - Math.min(1, (proj - sh.pearlProj) / 220)) : 1;
    const detail = sh.found ? 1 : laneK * prog * missFade;
    const t = this.underwater.t;
    const worldP = sh.worldProg;
    // Классический скроллер: камера следит за worldProg (фактически — за
    // пройденным путём пловца вдоль dirX/dirY). Весь декор охоты остаётся
    // привязан к МИРОВЫМ координатам (sh.ax + offProj*dirX + ...), а на экране
    // плавно скроллится мимо стоящего в центре пловца. Пловец и дельфин
    // отрисовываются с тем же смещением (см. _renderUnderwaterWorld и блок
    // дельфина ниже), поэтому пловец визуально совпадает с тайником/галочкой
    // именно тогда, когда он к ним фактически приплыл.
    const cam = this._shipHuntCamera();
    const camX = cam.x;
    const camY = cam.y;
    /** Совпадает с translate(sway) в _renderUnderwaterWorld — иначе «руки»/дельфин уезжают от спрайта пловца. */
    const sway = this.underwater.getSway();
    const worldPX = sh.ax + sh.pearlProj * sh.dirX;
    const worldPY = sh.ay + sh.pearlProj * sh.dirY;
    const hand = this._shipHuntPearlPickupPoint();
    const dBody = Math.hypot(this.player.x - worldPX, this.player.y - worldPY);
    const dHand = Math.hypot(hand.x - worldPX, hand.y - worldPY);
    const dPearl = Math.min(dBody, dHand);
    const revealed = sh.huntClock >= sh.revealPearlAfter;
    /** Настоящая жемчужина скрыта до revealPearlAfter — сначала только миражи и поиск. */
    let distPearlVis = 0;
    if (!sh.found && !sh.missed && revealed) {
      if (dPearl < 420) {
        distPearlVis = Math.min(1, 0.34 + ((420 - dPearl) / 420) * 0.66);
      } else {
        distPearlVis = Math.max(0.12, 1 - dPearl / 920);
      }
    }
    const pearlAraw = !sh.found && !sh.missed && revealed ? distPearlVis * missFade : 0;
    let glowMul = 1;
    if (!sh.found && revealed && this._shipHuntPearlPickupInRange()) {
      const u = Math.max(sh.nearPearlTimer, 0.35);
      glowMul += 1.15 * Math.min(1, u / 0.92) + 0.55 * Math.min(1, Math.max(0, u - 0.92) / 1.55);
    }
    const pearlA = Math.min(1, pearlAraw * glowMul);

    // Явное смещение дна по движению: песчаные "полосы" и рябь скроллятся относительно пути.
    const drift = worldP * 0.38;
    for (let i = -1; i < 8; i++) {
      const yBase = ((i * 96 - drift) % (h + 160)) - 80;
      const wave = Math.sin(t * 0.45 + i * 1.2 + sh.decoSeed) * 18;
      const g = ctx.createLinearGradient(0, yBase, 0, yBase + 110);
      g.addColorStop(0, "rgba(70, 94, 84, 0.02)");
      g.addColorStop(0.45, "rgba(124, 106, 86, 0.07)");
      g.addColorStop(1, "rgba(58, 84, 78, 0.015)");
      ctx.fillStyle = g;
      ctx.fillRect(-10, yBase + wave, w + 20, 108);
    }

    const drawWreck = (offProj, offSide, kind, alphaMul) => {
      const worldX = sh.ax + offProj * sh.dirX + offSide * -sh.dirY;
      const worldY = sh.ay + offProj * sh.dirY + offSide * sh.dirX;
      const wx = worldX - camX;
      const wy = worldY - camY;
      if (wx < -120 || wy < -80 || wx > w + 120 || wy > h + 120) return;
      const a = detail * alphaMul;
      if (a < 0.02) return;
      ctx.save();
      ctx.globalAlpha = a * 0.34;
      ctx.fillStyle = "rgba(10, 16, 26, 0.62)";
      ctx.beginPath();
      ctx.ellipse(wx, wy + 11, 46, 13, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = a;
      ctx.translate(wx, wy);
      ctx.rotate(Math.sin(offProj * 0.01 + t * 0.3 + sh.decoSeed) * 0.22);
      if (kind === 0) {
        // Доска/обломок мачты: крупно и частично в песке.
        ctx.fillStyle = "rgba(88, 70, 56, 0.9)";
        const len = 96 + (Math.abs(offProj) % 84);
        ctx.fillRect(-len * 0.5, -10, len, 20);
        ctx.strokeStyle = "rgba(132, 104, 80, 0.8)";
        ctx.strokeRect(-len * 0.5, -10, len, 20);
        ctx.fillStyle = "rgba(122, 98, 76, 0.45)";
        ctx.fillRect(-len * 0.48, 3, len * 0.96, 12);
      } else if (kind === 1) {
        // Штурвал.
        ctx.strokeStyle = "rgba(138, 116, 84, 0.92)";
        ctx.lineWidth = 5.2;
        ctx.beginPath();
        ctx.arc(0, 0, 30, 0, Math.PI * 2);
        ctx.stroke();
        for (let i = 0; i < 6; i++) {
          const a0 = (i / 6) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(0, 0);
          ctx.lineTo(Math.cos(a0) * 40, Math.sin(a0) * 40);
          ctx.stroke();
        }
      } else if (kind === 2) {
        // Ящик/сундук.
        ctx.fillStyle = "rgba(90, 76, 60, 0.92)";
        ctx.fillRect(-34, -24, 68, 48);
        ctx.strokeStyle = "rgba(140, 120, 92, 0.7)";
        ctx.strokeRect(-34, -24, 68, 48);
        ctx.fillStyle = "rgba(168, 138, 95, 0.28)";
        ctx.fillRect(-31, -2, 62, 12);
      } else if (kind === 3) {
        // Обрывок ткани.
        ctx.fillStyle = "rgba(120, 78, 70, 0.56)";
        ctx.beginPath();
        ctx.moveTo(-34, -18);
        ctx.lineTo(28, -8);
        ctx.lineTo(18, 26);
        ctx.lineTo(-38, 15);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    };

    // Крупные обломки лежат в ФИКСИРОВАННЫХ мировых координатах —
    // они не «привязаны» к пройденному пути пловца, иначе при скроллинге
    // камера вычитает их сдвиг и декор кажется неподвижным. Берём i с
    // запасом и назад (−10), и вперёд (до 30), чтобы при любом положении
    // worldProg в кадре всегда что-то проезжало мимо пловца.
    for (let i = -10; i < 30; i++) {
      const offProj = i * 86 + Math.sin(i * 1.7 + sh.decoSeed) * 28;
      const offSide = Math.sin(i * 2.4 + sh.decoSeed) * (42 + ((i + 40) % 4) * 22);
      drawWreck(offProj, offSide, ((i + 40) % 4), 0.28 + ((i + 40) % 4) * 0.14);
    }

    // Передний план дна: крупные обломки рядом с камерой.
    const fgDrift = worldP * 0.2;
    const fgX1 = ((w * 0.28 - fgDrift) % (w + 240)) - 120;
    const fgY1 = h * 0.88;
    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.translate(fgX1, fgY1);
    ctx.rotate(-0.18 + Math.sin(t * 0.5) * 0.03);
    ctx.fillStyle = "rgba(78, 60, 44, 0.95)";
    ctx.fillRect(-94, -16, 188, 32);
    ctx.strokeStyle = "rgba(132, 106, 82, 0.76)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-94, -16, 188, 32);
    ctx.fillStyle = "rgba(120, 96, 70, 0.45)";
    ctx.fillRect(-90, 2, 180, 16);
    ctx.restore();
    const fgX3 = ((w * 0.5 - fgDrift * 1.1) % (w + 300)) - 150;
    const fgY3 = h * 0.92;
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.translate(fgX3, fgY3);
    ctx.rotate(-0.05);
    ctx.fillStyle = "rgba(76, 60, 46, 0.95)";
    ctx.fillRect(-82, -14, 164, 28);
    ctx.strokeStyle = "rgba(136, 114, 88, 0.72)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-82, -14, 164, 28);
    ctx.restore();
    const fgX4 = ((w * 0.14 - fgDrift * 0.75) % (w + 280)) - 140;
    const fgY4 = h * 0.9;
    ctx.save();
    ctx.globalAlpha = 0.7;
    ctx.translate(fgX4, fgY4);
    ctx.rotate(0.2);
    ctx.fillStyle = "rgba(88, 70, 56, 0.9)";
    ctx.fillRect(-48, -24, 96, 50);
    ctx.strokeStyle = "rgba(140, 120, 94, 0.7)";
    ctx.lineWidth = 2.8;
    ctx.strokeRect(-48, -24, 96, 50);
    ctx.clearRect(-8, -14, 22, 16);
    ctx.restore();
    const fgX2 = ((w * 0.72 - fgDrift * 0.85) % (w + 260)) - 130;
    const fgY2 = h * 0.9;
    ctx.save();
    ctx.globalAlpha = 0.74;
    ctx.translate(fgX2, fgY2);
    ctx.rotate(0.12);
    ctx.fillStyle = "rgba(84, 68, 54, 0.94)";
    ctx.fillRect(-58, -36, 116, 70);
    ctx.strokeStyle = "rgba(140, 118, 90, 0.72)";
    ctx.lineWidth = 3;
    ctx.strokeRect(-58, -36, 116, 70);
    ctx.clearRect(-14, -26, 34, 28);
    ctx.fillStyle = "rgba(110, 92, 70, 0.5)";
    ctx.fillRect(-56, 10, 112, 24);
    ctx.restore();

    // Густые водоросли на дне (правильная зона заметно плотнее).
    // Координаты водорослей — в мире, без привязки к worldProg, иначе при
    // скроллинге камеры они тоже остаются на месте относительно пловца.
    const weedDensity = 8 + Math.round(22 * detail);
    for (let i = 0; i < weedDensity; i++) {
      const iShift = i - 6;
      const offProj = iShift * 62 + Math.sin(iShift * 1.3 + sh.decoSeed * 0.4) * 18;
      const offSide = Math.sin(iShift * 2.1 + sh.decoSeed) * (24 + ((i + 25) % 5) * 16);
      const worldX = sh.ax + offProj * sh.dirX + offSide * -sh.dirY;
      const worldY = sh.ay + offProj * sh.dirY + offSide * sh.dirX + 22;
      const wx = worldX - camX;
      const wy = worldY - camY;
      if (wx < -80 || wx > w + 80 || wy < -40 || wy > h + 120) continue;
      const alpha = 0.16 + detail * 0.42;
      // Небольшой бугорок грунта под кустом водорослей.
      ctx.save();
      ctx.globalAlpha = 0.18 + detail * 0.24;
      ctx.fillStyle = "rgba(90, 84, 68, 0.62)";
      ctx.beginPath();
      ctx.ellipse(wx, wy + 18, 14 + (i % 3) * 5, 6 + (i % 2) * 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.strokeStyle = "rgba(78, 138, 108, 0.95)";
      ctx.lineWidth = 2.6 + (i % 3) * 0.7;
      for (let s = 0; s < 3; s++) {
        const bx = wx + (s - 1) * 6;
        const by = wy;
        const h0 = 24 + (i % 4) * 7 + s * 4;
        const sway = Math.sin(t * 1.4 + i * 0.9 + s) * 8;
        ctx.beginPath();
        ctx.moveTo(bx, by + 18);
        ctx.quadraticCurveTo(bx + sway * 0.35, by - h0 * 0.4, bx + sway, by - h0);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Редкие тревожные тени по дну.
    if (Math.sin(t * 0.33 + sh.decoSeed * 0.2) > 0.78) {
      const sx = w * (0.1 + ((Math.sin(t * 0.22) + 1) * 0.5) * 0.8);
      const sy = h * (0.72 + Math.sin(t * 0.17) * 0.08);
      ctx.save();
      ctx.globalAlpha = 0.16;
      ctx.fillStyle = "rgba(12, 24, 30, 0.9)";
      ctx.beginPath();
      ctx.ellipse(sx, sy, 138, 20, -0.16, 0, Math.PI * 2);
      ctx.fill();
      if (Math.sin(t * 0.71 + 1.2) > 0.88) {
        ctx.beginPath();
        ctx.moveTo(sx - 30, sy - 6);
        ctx.lineTo(sx - 76, sy - 34);
        ctx.lineTo(sx - 52, sy - 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    // Краткие обманные вспышки (3 раза), не в точке настоящей жемчужины — исчезают сами по таймеру.
    if (!sh.found && sh.mirages && sh.mirages.length) {
      const st = sh.huntClock;
      for (const mir of sh.mirages) {
        const u = (st - mir.t0) / mir.dur;
        if (u <= 0 || u >= 1) continue;
        const fade = Math.sin(Math.PI * u) * 0.92;
        const mx = mir.wx - camX;
        const my = mir.wy - camY;
        if (mx < -160 || my < -90 || mx > w + 160 || my > h + 130) continue;
        ctx.save();
        const g = ctx.createRadialGradient(mx, my, 0, mx, my, 44);
        g.addColorStop(0, `rgba(210, 250, 255, ${0.26 * fade})`);
        g.addColorStop(0.42, `rgba(130, 220, 255, ${0.14 * fade})`);
        g.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = 0.35 * fade;
        ctx.strokeStyle = "rgba(88, 160, 120, 0.75)";
        ctx.lineWidth = 2;
        for (let q = 0; q < 4; q++) {
          const sway = Math.sin(t * 2.2 + q + mir.t0) * 6;
          ctx.beginPath();
          ctx.moveTo(mx + (q - 1.5) * 5, my + 14);
          ctx.quadraticCurveTo(mx + sway * 0.3, my - 8, mx + sway, my - 26 - q * 5);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    /** Столб света — заметный, но не выжигающий экран. */
    if (!sh.found && revealed && sh.huntClock >= sh.revealPearlAfter) {
      const bx = worldPX - camX;
      const by = worldPY - camY;
      const pulse = 0.55 + 0.45 * Math.sin(t * 2.85);
      const dim = 0.38;
      const halfW = 50;
      ctx.save();
      ctx.globalAlpha = dim;
      const col = ctx.createLinearGradient(bx, 0, bx, by + 24);
      col.addColorStop(0, `rgba(200, 248, 255, ${0.06 * pulse})`);
      col.addColorStop(0.5, `rgba(130, 210, 255, ${0.11 * pulse})`);
      col.addColorStop(0.85, `rgba(170, 245, 255, ${0.16 * pulse})`);
      col.addColorStop(1, `rgba(240, 252, 255, ${0.2 * pulse})`);
      ctx.fillStyle = col;
      ctx.fillRect(bx - halfW, 0, halfW * 2, Math.max(0, by + 32));
      ctx.globalAlpha = dim * 0.85;
      ctx.globalCompositeOperation = "screen";
      const core = ctx.createLinearGradient(bx, 0, bx, by + 6);
      core.addColorStop(0, `rgba(255, 255, 255, ${0.04 * pulse})`);
      core.addColorStop(0.75, `rgba(160, 230, 255, ${0.1 * pulse})`);
      core.addColorStop(1, `rgba(255, 255, 255, ${0.14 * pulse})`);
      ctx.fillStyle = core;
      ctx.fillRect(bx - 22, 0, 44, Math.max(0, by + 12));
      ctx.restore();
    }

    // Свечение настоящей жемчужины (после фазы поиска) + усиление при подплывании.
    const showPearlHint =
      !sh.found && revealed && (pearlA > 0.28 || sh.pearlHintT > 0);
    if (pearlA > 0.02) {
      const px = worldPX - camX;
      const py = worldPY - camY;
      // Явный "тайник" жемчужины: каменный карман + крупные доски.
      ctx.save();
      ctx.globalAlpha = 0.3 + pearlA * 0.36;
      ctx.fillStyle = "rgba(78, 72, 66, 0.78)";
      ctx.beginPath();
      ctx.ellipse(px, py + 26, 86, 26, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(92, 76, 58, 0.82)";
      ctx.fillRect(px - 92, py + 10, 74, 14);
      ctx.fillRect(px + 20, py + 8, 66, 15);
      ctx.restore();
      // Заросли у зоны жемчужины (крупный "карман" водорослей).
      const weedPocket = 12 + Math.round(20 * pearlA);
      for (let i = 0; i < weedPocket; i++) {
        const ang = (i / weedPocket) * Math.PI * 2 + Math.sin(t * 0.6 + i) * 0.2;
        const rr = 22 + (i % 5) * 7;
        const wx = px + Math.cos(ang) * rr * 1.35;
        const wy = py + Math.sin(ang) * rr * 0.8 + 18;
        ctx.save();
        ctx.globalAlpha = 0.22 + pearlA * 0.34;
        ctx.fillStyle = "rgba(88, 84, 70, 0.58)";
        ctx.beginPath();
        ctx.ellipse(wx, wy + 16, 10 + (i % 4) * 3, 5 + (i % 3), 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
        ctx.save();
        ctx.globalAlpha = 0.18 + pearlA * 0.48;
        ctx.strokeStyle = "rgba(90, 150, 112, 0.96)";
        ctx.lineWidth = 2.6;
        const sway = Math.sin(t * 1.8 + i * 0.7) * 10;
        ctx.beginPath();
        ctx.moveTo(wx, wy + 14);
        ctx.quadraticCurveTo(wx + sway * 0.35, wy - 16, wx + sway, wy - 34 - (i % 4) * 6);
        ctx.stroke();
        ctx.restore();
      }
      const glow = ctx.createRadialGradient(px, py, 0, px, py, 58);
      glow.addColorStop(0, `rgba(220, 255, 235, ${0.24 * pearlA})`);
      glow.addColorStop(0.45, `rgba(130, 220, 255, ${0.16 * pearlA})`);
      glow.addColorStop(0.72, `rgba(150, 120, 230, ${0.1 * pearlA})`);
      glow.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = glow;
      ctx.fillRect(0, 0, w, h);
      ctx.save();
      ctx.globalAlpha = pearlA;
      ctx.fillStyle = "rgba(160, 220, 150, 0.28)";
      for (let k = 0; k < 9; k++) {
        const a = (k / 9) * Math.PI * 2 + t * 0.2;
        const rx = px + Math.cos(a) * (20 + (k % 3) * 4);
        const ry = py + Math.sin(a) * (10 + (k % 4) * 4);
        ctx.fillRect(rx - 1, ry - 6, 2, 12);
      }
      ctx.restore();
      // Сама Чёрная жемчужина (до подбора): большая, переливающаяся.
      const pCore = ctx.createRadialGradient(px, py, 2, px, py, 18);
      pCore.addColorStop(0, `rgba(252,252,255,${0.9 * pearlA})`);
      pCore.addColorStop(0.38, `rgba(138,212,255,${0.85 * pearlA})`);
      pCore.addColorStop(0.66, `rgba(188,130,245,${0.72 * pearlA})`);
      pCore.addColorStop(1, `rgba(42,32,52,${0.62 * pearlA})`);
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = pCore;
      ctx.beginPath();
      ctx.arc(px, py, 18, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (showPearlHint) {
      const hx = worldPX - camX;
      const hy = worldPY - camY;
      const hintA = Math.max(pearlA, Math.min(1, sh.pearlHintT / 2.2)) * 0.9;
      ctx.save();
      // Свет идёт из зарослей: мягкое свечение у дна + рассеянный столб вверх.
      ctx.globalAlpha = 0.24 * hintA;
      const beam = ctx.createLinearGradient(hx, hy - 14, hx, 0);
      beam.addColorStop(0, "rgba(170, 238, 255, 0.58)");
      beam.addColorStop(0.35, "rgba(156, 224, 255, 0.3)");
      beam.addColorStop(1, "rgba(130, 215, 255, 0)");
      ctx.fillStyle = beam;
      ctx.fillRect(hx - 42, 0, 84, hy + 16);
      const fromWeeds = ctx.createRadialGradient(hx, hy + 12, 0, hx, hy + 12, 72);
      fromWeeds.addColorStop(0, `rgba(190, 248, 255, ${0.32 * hintA})`);
      fromWeeds.addColorStop(0.5, `rgba(150, 224, 255, ${0.16 * hintA})`);
      fromWeeds.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = fromWeeds;
      ctx.fillRect(hx - 90, hy - 70, 180, 160);
      ctx.restore();

    }

    // Светящаяся галочка над жемчужиной — точный маркер места подбора.
    // Видна весь период поиска (как «столб света»): дистанционно игрок ведётся столбом,
    // вблизи — точкой галочки, которую нужно коснуться для подбора.
    if (!sh.found && revealed && sh.huntClock >= sh.revealPearlAfter) {
      const hx = worldPX - camX;
      const hy = worldPY - camY;
      const boostHint = Math.min(1, sh.pearlHintT / 3.2);
      const nearBoost = Math.min(1, Math.max(0, (pearlA - 0.15) / 0.6));
      const markPulse = 0.72 + 0.28 * Math.sin(t * 3.4);
      const markA = Math.min(1, (0.62 + 0.3 * boostHint + 0.18 * nearBoost)) * markPulse;
      const markY = hy - 46 - Math.sin(t * 1.6) * 3;
      const markScale = 1 + 0.08 * boostHint + 0.06 * nearBoost;

      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const haloR = 26 * markScale;
      const halo = ctx.createRadialGradient(hx, markY, 0, hx, markY, haloR);
      halo.addColorStop(0, `rgba(210, 252, 255, ${0.35 * markA})`);
      halo.addColorStop(0.5, `rgba(150, 224, 255, ${0.18 * markA})`);
      halo.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(hx, markY, haloR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalAlpha = Math.min(1, 0.85 * markA + 0.15 * boostHint);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      // Тёмная подложка для контраста на светлом фоне.
      ctx.strokeStyle = "rgba(8, 22, 36, 0.75)";
      ctx.lineWidth = 7 * markScale;
      ctx.beginPath();
      ctx.moveTo(hx - 12 * markScale, markY + 1 * markScale);
      ctx.lineTo(hx - 2 * markScale, markY + 9 * markScale);
      ctx.lineTo(hx + 13 * markScale, markY - 9 * markScale);
      ctx.stroke();
      // Светящаяся галочка сверху.
      ctx.shadowBlur = 14;
      ctx.shadowColor = "rgba(168, 234, 255, 0.9)";
      ctx.strokeStyle = "rgba(240, 255, 250, 0.98)";
      ctx.lineWidth = 4 * markScale;
      ctx.beginPath();
      ctx.moveTo(hx - 12 * markScale, markY + 1 * markScale);
      ctx.lineTo(hx - 2 * markScale, markY + 9 * markScale);
      ctx.lineTo(hx + 13 * markScale, markY - 9 * markScale);
      ctx.stroke();
      ctx.restore();
    }

    // Дальний "силуэт корпуса": крупные темные массы, чтобы читалось как след большого судна.
    if (detail > 0.18) {
      const hullWX = sh.ax + sh.pearlProj * 0.7 * sh.dirX + 120 * -sh.dirY;
      const hullWY = sh.ay + sh.pearlProj * 0.7 * sh.dirY + 58 * sh.dirX;
      const hullX = hullWX - camX;
      const hullY = hullWY - camY;
      ctx.save();
      ctx.globalAlpha = 0.09 + detail * 0.18;
      ctx.fillStyle = "rgba(36, 34, 30, 0.88)";
      ctx.beginPath();
      ctx.ellipse(hullX, hullY, 150, 42, -0.18, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.ellipse(hullX - 70, hullY - 24, 64, 22, -0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (sh.found) {
      const stashX = worldPX - camX;
      const stashY = worldPY - camY;
      /** Мгновенное «снятие» с дна: свет в зарослях гаснет, жемчужина схлопывается за ~0.18 с. */
      const vanDur = 0.18;
      const van = Math.min(1, sh.phaseT / vanDur);
      const stashAlive = (1 - van) ** 1.65;
      if (stashAlive > 0.03) {
        ctx.save();
        ctx.globalAlpha = stashAlive;
        const rad = 58 * (0.35 + 0.65 * (1 - van));
        const sg = ctx.createRadialGradient(stashX, stashY, 0, stashX, stashY, rad);
        sg.addColorStop(0, `rgba(200, 255, 240, ${0.22 * stashAlive})`);
        sg.addColorStop(0.45, `rgba(120, 220, 255, ${0.12 * stashAlive})`);
        sg.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = sg;
        ctx.fillRect(0, 0, w, h);
        ctx.globalCompositeOperation = "screen";
        const prSt = 18 * (1 - van * 0.92);
        const dim = ctx.createRadialGradient(stashX, stashY, 1, stashX, stashY, prSt);
        dim.addColorStop(0, `rgba(252,252,255,${0.85 * stashAlive})`);
        dim.addColorStop(0.4, `rgba(100, 180, 255,${0.5 * stashAlive})`);
        dim.addColorStop(1, `rgba(20, 16, 28,${0.75 * stashAlive})`);
        ctx.fillStyle = dim;
        ctx.beginPath();
        ctx.arc(stashX, stashY, Math.max(2, prSt), 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
    }

    if (sh.found && sh.phase >= 1) {
      ctx.save();
      ctx.globalAlpha = 0.88;
      const ang = Math.atan2(this.player.y - sh.dolphinY, this.player.x - sh.dolphinX);
      // Дельфин в охоте находится в тех же МИРОВЫХ координатах, что и жемчужина
      // с пловцом, поэтому при рендере применяем ту же камеру: иначе он будет
      // «жить отдельно» от сцены и уезжать за пловцом/жемчужиной.
      ctx.translate(-camX, -camY);
      this._dolphinActor = {
        x: sh.dolphinX + sway.x,
        y: sh.dolphinY + sway.y,
        visible: true,
        angle: ang,
        bend: Math.sin(sh.dolphinT * 3.1) * 0.2,
      };
      this._renderDolphinFigure(ctx, t, h);
      ctx.restore();
    }

    // После находки вокруг появляются множественные силуэты акул.
    if (sh.found && sh.phase >= 1) {
      ctx.save();
      const sharkA = 0.08 + Math.min(0.2, sh.phaseT * 0.06);
      ctx.globalAlpha = sharkA;
      ctx.fillStyle = "rgba(10, 20, 26, 0.95)";
      for (let i = 0; i < 6; i++) {
        const sx = (i % 2 === 0 ? -120 : w + 120) + Math.sin(t * 0.7 + i) * 26;
        const sy = h * (0.28 + (i % 4) * 0.13) + Math.cos(t * 0.5 + i * 0.8) * 18;
        ctx.beginPath();
        ctx.ellipse(sx, sy, 120, 18, i % 2 === 0 ? 0.12 : -0.12, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(sx - 18, sy - 4);
        ctx.lineTo(sx - 54, sy - 30);
        ctx.lineTo(sx - 34, sy - 2);
        ctx.closePath();
        ctx.fill();
      }
      ctx.restore();
    }

    if (sh.phase === 2) {
      const sky = ctx.createLinearGradient(0, h, 0, 0);
      sky.addColorStop(0, "rgba(0,0,0,0)");
      sky.addColorStop(0.5, `rgba(120, 210, 230, ${0.12 * sh.surfLight})`);
      sky.addColorStop(1, `rgba(250, 255, 235, ${0.22 * sh.surfLight})`);
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      // Финальный "ВАУ"-всплеск при подъёме.
      const wowA = Math.max(0, Math.min(1, (sh.surfLight - 0.35) / 0.45));
      if (wowA > 0.01) {
        const pxU = this.player.x - camX;
        const pyU = this.player.y - camY;
        const burst = ctx.createRadialGradient(pxU, pyU - 20, 0, pxU, pyU - 20, Math.min(w, h) * 0.42);
        burst.addColorStop(0, `rgba(255, 255, 245, ${0.14 * wowA})`);
        burst.addColorStop(0.38, `rgba(150, 240, 255, ${0.1 * wowA})`);
        burst.addColorStop(0.72, `rgba(190, 150, 255, ${0.07 * wowA})`);
        burst.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = burst;
        ctx.fillRect(0, 0, w, h);
      }
      // Победная надпись всплывает снизу вверх во время подъёма.
      const winRise = Math.max(0, Math.min(1, (sh.surfLight - 0.16) / 0.78));
      if (winRise > 0.01) {
        const tx = w * 0.5;
        const ty = h * (0.9 - winRise * 0.52);
        const wa = Math.min(1, winRise * 1.15);
        ctx.save();
        ctx.globalAlpha = wa;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.lineWidth = 7;
        ctx.strokeStyle = "rgba(8, 14, 28, 0.86)";
        ctx.font = "900 52px system-ui, sans-serif";
        ctx.shadowBlur = 24;
        ctx.shadowColor = "rgba(168, 234, 255, 0.65)";
        ctx.strokeText(_t("victory.winner"), tx, ty);
        const wg = ctx.createLinearGradient(tx - 210, ty - 24, tx + 210, ty + 24);
        wg.addColorStop(0, "rgba(255, 245, 168, 0.98)");
        wg.addColorStop(0.45, "rgba(180, 246, 255, 1)");
        wg.addColorStop(1, "rgba(220, 178, 255, 0.98)");
        ctx.fillStyle = wg;
        ctx.fillText(_t("victory.winner"), tx, ty);
        ctx.restore();
      }
    }

    // Кинематографичная реплика после подъёма жемчужины.
    if (sh.shoutT > 0) {
      const qa = Math.min(1, sh.shoutT / 0.3) * Math.min(1, (1.4 - sh.shoutT) / 0.34);
      ctx.save();
      ctx.globalAlpha = Math.max(0, qa);
      ctx.fillStyle = "rgba(0, 0, 0, 0.42)";
      ctx.fillRect(0, 0, w, 56);
      ctx.fillRect(0, h - 56, w, 56);
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.lineWidth = 6;
      ctx.strokeStyle = "rgba(8, 12, 22, 0.86)";
      ctx.font = "900 44px system-ui, sans-serif";
      const tx = w * 0.5;
      const ty = h * 0.24;
      ctx.strokeText(_t("victory.found"), tx, ty);
      const tg = ctx.createLinearGradient(tx - 120, ty - 18, tx + 120, ty + 18);
      tg.addColorStop(0, "rgba(255,245,180,0.96)");
      tg.addColorStop(0.5, "rgba(190,245,255,0.98)");
      tg.addColorStop(1, "rgba(216,180,255,0.96)");
      ctx.fillStyle = tg;
      ctx.fillText(_t("victory.found"), tx, ty);
      ctx.restore();
    }

    /** Жемчужина в руках — рисуется последней: всегда у пловца, поверх дельфина и «вау»-всплеска. */
    if (sh.found) {
      const hand = this._shipHuntPearlPickupPoint();
      // hand.x/y — в МИРОВЫХ координатах (привязаны к player.x/y), поэтому
      // отнимаем смещение камеры охоты (camX/camY). Иначе после подбора
      // жемчужина остаётся в «старой» мировой точке, а пловец уезжает вместе
      // со скроллом, и жемчужина визуально «убегает» в сторону.
      const hx = hand.x + sway.x - camX;
      const hy = hand.y + sway.y - camY;
      const hopDur = 0.22;
      const hopU = Math.min(1, sh.phaseT / hopDur);
      const bounce = Math.sin(hopU * Math.PI) * 6 * (1 - hopU);
      const px = hx;
      const py = hy - bounce;
      const grabFlash = Math.max(0, 1 - sh.phaseT / 0.1);
      const pr = 16 + grabFlash * 9;
      const wowK = Math.max(0, Math.min(1, sh.wowT / 2.85));
      if (wowK > 0.02) {
        const puX = this.player.x + sway.x - camX;
        const puY = this.player.y + sway.y - camY;
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = wowK * 0.16;
        const mag = ctx.createRadialGradient(puX, puY, 0, puX, puY, 200 + wowK * 140);
        mag.addColorStop(0, "rgba(255, 248, 230, 0.42)");
        mag.addColorStop(0.32, "rgba(110, 220, 240, 0.22)");
        mag.addColorStop(0.58, "rgba(200, 150, 255, 0.14)");
        mag.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = mag;
        ctx.fillRect(0, 0, w, h);
        ctx.globalAlpha = wowK * 0.32;
        for (let i = 0; i < 40; i++) {
          const seed = i * 2.427 + sh.decoSeed;
          const ang = seed + t * 0.42;
          const spread = (1 - wowK) * 155 + 18;
          const bx = px + Math.cos(ang) * (spread * (0.35 + (i % 5) * 0.13));
          const by =
            py +
            Math.sin(ang * 0.88) * spread * 0.42 -
            sh.phaseT * (5 + (i % 3));
          const sz = 1.1 + (i % 4) * 0.45;
          ctx.fillStyle = `rgba(230, 250, 255, ${0.12 + wowK * 0.42})`;
          ctx.beginPath();
          ctx.arc(bx, by, sz, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
      const inspectPulse =
        0.72 +
        0.28 * Math.sin(t * 5.2) +
        grabFlash * 0.55 +
        wowK * 0.22 +
        (1 - wowK) * 0.06 * Math.sin(t * 3.1);
      ctx.save();
      const g = ctx.createRadialGradient(px, py, 0, px, py, 52 + grabFlash * 40);
      g.addColorStop(0, `rgba(255, 255, 250, ${(0.55 + 0.45 * grabFlash) * inspectPulse})`);
      g.addColorStop(0.28, `rgba(140, 230, 255, ${0.72 * inspectPulse})`);
      g.addColorStop(0.55, `rgba(160, 120, 240, ${0.48 * inspectPulse})`);
      g.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(px, py, 52 + grabFlash * 36, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      if (grabFlash > 0.08) {
        ctx.save();
        ctx.globalCompositeOperation = "screen";
        ctx.globalAlpha = grabFlash * 0.85;
        ctx.strokeStyle = "rgba(255, 255, 255, 0.95)";
        ctx.lineWidth = 3 + grabFlash * 4;
        ctx.beginPath();
        ctx.arc(px, py, pr + 4 + grabFlash * 12, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      const pgr = ctx.createRadialGradient(px, py, 1, px, py, pr + 1);
      pgr.addColorStop(0, "rgba(245, 255, 255, 1)");
      pgr.addColorStop(0.3, "rgba(120, 220, 255, 0.9)");
      pgr.addColorStop(0.58, "rgba(168, 118, 236, 0.8)");
      pgr.addColorStop(0.82, "rgba(255, 214, 142, 0.46)");
      pgr.addColorStop(1, "rgba(36, 26, 44, 0.34)");
      ctx.fillStyle = pgr;
      ctx.beginPath();
      ctx.arc(px, py, pr, 0, Math.PI * 2);
      ctx.fill();
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2 + t * 1.2;
        const sx = px + Math.cos(a) * (18 + (i % 2) * 4);
        const sy = py + Math.sin(a) * (10 + (i % 3) * 3);
        ctx.fillStyle = `rgba(210, 248, 255, ${0.55 + 0.45 * grabFlash})`;
        ctx.fillRect(sx - 1.2, sy - 1.2, 2.4, 2.4);
      }
      ctx.restore();
      ctx.save();
      ctx.globalCompositeOperation = "source-over";
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = "rgba(18, 14, 32, 0.75)";
      ctx.lineWidth = 2.2;
      ctx.beginPath();
      ctx.arc(px, py, pr * 0.92, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  _renderStageTwoIntroActors(ctx) {
    const time = this.underwater.t;
    const vh = this.renderer.bounds.height;
    for (const bud of this._stageTwoBuddies) {
      const flip = bud.tx < bud.x ? -1 : 1;
      const ea =
        bud.role === "panic" ? (bud.panicExitAlpha ?? 1) : 1;
      if (ea < 0.008) continue;
      this._renderBuddyDiverFigure(
        ctx,
        bud.x,
        bud.y,
        flip,
        time,
        bud.phase,
        vh,
        false,
        ea
      );
    }
    this._renderMayaFigure(ctx, vh);
    this._renderDolphinFigure(ctx, time, vh);
  }

  /** Закрыть заглушку этапа — в главное меню */
  exitNextStageStub() {
    if (this.state !== GameState.NEXT_STAGE) return;
    this._hideNextStageOverlay();
    this._modalBackdrop = 0;
    this.returnToMenu();
  }

  /** Победа: в меню */
  winGoToMenu() {
    if (this.state !== GameState.WIN) return;
    this._hideWinOverlay();
    this._modalBackdrop = 0;
    this.returnToMenu();
  }

  /** Победа: новый раунд */
  winPlayAgain() {
    if (this.state !== GameState.WIN) return;
    this._hideWinOverlay();
    this._modalBackdrop = 0;
    this.state = GameState.PLAYING;
    this.player.resetToCenter(this.renderer.bounds);
    this._resetSession();
  }

  /** Переход в меню: снова показать HTML-оверлей */
  returnToMenu() {
    this.state = GameState.START;
    this._pauseReturnState = GameState.PLAYING;
    this._caveInsideBubbles = [];
    this._caveInsideSil = null;
    this._caveInsideIntroT = 0;
    this._caveEntranceGhosts = [];
    this._caveMazeLayout = null;
    this._caveVisitHeat = null;
    this._caveSparks = [];
    this._caveExitDwell = 0;
    this._caveExitScenePhase = 0;
    this._caveExitSceneT = 0;
    this._hideAllGameOverlays();
    this._modalBackdrop = 0;
    this.startOverlay.hidden = false;
    this.startOverlay.classList.remove("overlay--fade-out");
    this._menuTransitioning = false;
    this.input.keys["Escape"] = false;
    void this.startOverlay.offsetWidth;
  }

  _blockersForOxygen() {
    /** @type {{ x: number, y: number, radius: number, active?: boolean }[]} */
    const list = [...this.pearls];
    for (const o of this.oxygenPickups) {
      if (o.active) list.push(o);
    }
    return list;
  }

  /**
   * Кислород в лабиринте: только пол walkGrid, без жемчужин-блокеров.
   * @returns {boolean}
   */
  _trySpawnCaveOxygen() {
    if (this._countActiveOxygen() >= OXYGEN_MAX_ACTIVE) return false;
    const L = this._caveMazeLayout;
    if (!L) return false;
    const { maze, ox, oy, cell } = L;
    const walk = maze.walkGrid || maze.grid;
    /** @type {number[][]} */
    const floors = [];
    for (let y = 1; y < maze.H - 1; y++) {
      for (let x = 1; x < maze.W - 1; x++) {
        if (walk[y][x]) floors.push([x, y]);
      }
    }
    if (floors.length === 0) return false;
    /** @type {OxygenPickup | null} */
    let slot = null;
    for (const o of this.oxygenPickups) {
      if (!o.active) {
        slot = o;
        break;
      }
    }
    if (!slot) return false;
    const ex = ox + (maze.exitGx + 0.5) * cell;
    const ey = oy + (maze.exitGy + 0.5) * cell;
    for (let attempt = 0; attempt < 72; attempt++) {
      const [gx, gy] = floors[(Math.random() * floors.length) | 0];
      let x = ox + (gx + 0.12 + Math.random() * 0.76) * cell;
      let y = oy + (gy + 0.22 + Math.random() * 0.58) * cell;
      if (Math.hypot(x - this.player.x, y - this.player.y) < 64) continue;
      if (Math.random() < 0.48) {
        const angH = Math.atan2(ey - y, ex - x);
        const nud = 10 + Math.random() * 20;
        x += Math.cos(angH) * nud * 0.24;
        y += Math.sin(angH) * nud * 0.24;
      }
      let ok = true;
      for (const o of this.oxygenPickups) {
        if (!o.active || o === slot) continue;
        if (Math.hypot(x - o.x, y - o.y) < slot.radius + o.radius + 44) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      slot.x = x;
      slot.y = y;
      slot.active = true;
      slot.phase = Math.random() * Math.PI * 2;
      slot.riseSpeed = 16 + Math.random() * 12;
      return true;
    }
    return false;
  }

  _countActiveOxygen() {
    let n = 0;
    for (const o of this.oxygenPickups) {
      if (o.active) n += 1;
    }
    return n;
  }

  /**
   * Ровный ритм: без стартового всплеска, 2–5 активных, зоны и паузы.
   * @returns {boolean} появился ли новый пузырь
   */
  _trySpawnOxygen() {
    if (this.state === GameState.CAVE_INSIDE) {
      return this._trySpawnCaveOxygen();
    }
    let active = this._countActiveOxygen();
    if (active >= OXYGEN_MAX_ACTIVE) return false;
    const bounds = this.renderer.bounds;
    const blockers = this._blockersForOxygen();
    const bands = 7;
    const idx = this._oxygenBandIndex++;
    const bi = idx % bands;
    const pad = 58;
    const usable = Math.max(1, bounds.width - pad * 2);
    const cell = usable / bands;
    const h = bounds.height;
    const tiers = [
      [0.08, 0.3],
      [0.33, 0.57],
      [0.58, 0.9],
    ];
    const tier = tiers[idx % 3];
    const hint = {
      xMin: pad + bi * cell,
      xMax: pad + (bi + 1) * cell,
      yMin: h * tier[0] + 10,
      yMax: h * tier[1] - 22,
    };
    for (const o of this.oxygenPickups) {
      if (!o.active) {
        if (o.trySpawn(bounds, this.player, blockers, hint)) return true;
      }
    }
    for (const o of this.oxygenPickups) {
      if (!o.active) {
        if (o.trySpawn(bounds, this.player, blockers, null)) return true;
      }
    }
    return false;
  }

  _tickOxygenRhythm(dt) {
    let active = this._countActiveOxygen();
    this._oxygenTimeSinceSpawn += dt;
    this._oxygenSpawnTimer -= dt;

    let spawned = false;
    if (active < OXYGEN_MIN_ACTIVE) {
      spawned = this._trySpawnOxygen();
    } else if (active < OXYGEN_MAX_ACTIVE && this._oxygenSpawnTimer <= 0) {
      spawned = this._trySpawnOxygen();
      if (spawned) {
        this._oxygenSpawnTimer =
          OXYGEN_SPAWN_INTERVAL_MIN +
          Math.random() * (OXYGEN_SPAWN_INTERVAL_MAX - OXYGEN_SPAWN_INTERVAL_MIN);
      }
    }

    if (spawned) {
      this._oxygenTimeSinceSpawn = 0;
      active = this._countActiveOxygen();
      if (active >= OXYGEN_MIN_ACTIVE && this._oxygenSpawnTimer <= 0) {
        this._oxygenSpawnTimer =
          OXYGEN_SPAWN_INTERVAL_MIN +
          Math.random() * (OXYGEN_SPAWN_INTERVAL_MAX - OXYGEN_SPAWN_INTERVAL_MIN);
      }
    }

    if (
      this._countActiveOxygen() < OXYGEN_MIN_ACTIVE &&
      this._oxygenTimeSinceSpawn > OXYGEN_MAX_GAP_BEFORE_FORCE
    ) {
      if (this._trySpawnOxygen()) {
        this._oxygenTimeSinceSpawn = 0;
        this._oxygenSpawnTimer =
          OXYGEN_SPAWN_INTERVAL_MIN +
          Math.random() * (OXYGEN_SPAWN_INTERVAL_MAX - OXYGEN_SPAWN_INTERVAL_MIN);
      }
    }
  }

  _checkPickupCollision() {
    const pr = this.player.getPickupRadius();
    const px = this.player.x;
    const py = this.player.y;
    const isShipHunt = this.state === GameState.SHIP_HUNT;
    const targetPearls =
      this._postCaveCollectTarget !== null &&
      this._postCaveCollectTarget !== undefined
        ? this._postCaveCollectTarget
        : BONUS_WIN_PEARL_COUNT;

    for (const p of this.pearls) {
      if (!p.active) continue;
      if (p._dissolving && p._dissolveT > 0.48) continue;
      if (Math.hypot(px - p.x, py - p.y) < pr + p.radius) {
        if (isShipHunt) continue;
        p.collect();
        this.pearlsCollected += 1;
        if (this.audio && typeof this.audio.playPearlTick === "function") {
          this.audio.playPearlTick();
        }
        this.pickupVfx.addPearlBurst(p.x, p.y);
        if (!this._stageOfferTriggered && this.pearlsCollected >= STAGE_PEARL_COUNT) {
          this._stageOfferTriggered = true;
          this._commitBestPearlsScore();
          if (this.stageUi) {
            this.state = GameState.STAGE_OFFER;
            this._modalBackdrop = 0;
            this._showStageOfferOverlay();
          } else {
            this._continuedAfterStage = true;
          }
          return;
        }
        if (
          this._continuedAfterStage &&
          this.pearlsCollected >= targetPearls &&
          (this.state === GameState.PLAYING || this.state === GameState.STAGE_TWO)
        ) {
          this._commitBestPearlsScore();
          if (this.winUi) {
            this.state = GameState.WIN;
            this._modalBackdrop = 0;
            this._showWinOverlay();
          }
          return;
        }
      }
    }

    if (this.state === GameState.PLAYING) {
      for (const o of this.oxygenPickups) {
        if (!o.active) continue;
        if (Math.hypot(px - o.x, py - o.y) < pr + o.radius) {
          o.collect();
          this.air = Math.min(this.airMax, this.air + OXYGEN_RESTORE);
          if (this.audio && typeof this.audio.playAirRefill === "function") {
            this.audio.playAirRefill();
          }
          this.pickupVfx.addOxygenBurst(o.x, o.y);
        }
      }
    }
  }

  _checkCaveInsideOxygenPickups() {
    // Этап 2: пузырьки только атмосферные, без ресурса и подбора.
  }

  /**
   * @param {string} [state]
   */
  _isSecondStageState(state = this.state) {
    return (
      state === GameState.STAGE_TWO ||
      state === GameState.STAGE_TWO_INTRO ||
      state === GameState.SHARK_CHOICE ||
      state === GameState.SHELTER_STUB ||
      state === GameState.CAVE_CHASE ||
      state === GameState.CAVE_INSIDE ||
      state === GameState.CAVE_AFTER_CHOICE ||
      state === GameState.SHIP_HUNT ||
      state === GameState.CAVE_CHASE_LOSE
    );
  }

  /**
   * @param {string} [state]
   */
  _currentWinTarget(state = this.state) {
    if (
      state === GameState.STAGE_TWO &&
      this._postCaveCollectTarget !== null &&
      this._postCaveCollectTarget !== undefined
    ) {
      return this._postCaveCollectTarget;
    }
    return this._continuedAfterStage || this._stageTwoUnlocked
      ? BONUS_WIN_PEARL_COUNT
      : STAGE_PEARL_COUNT;
  }

  /**
   * @param {string} [state]
   */
  _currentObjectiveText(state = this.state) {
    if (state === GameState.SHIP_HUNT) {
      if (this._shipHunt.found) return _t("shipHunt.found");
      if (this._shipHunt.missed) {
        return _t("shipHunt.missed");
      }
      const sh = this._shipHunt;
      const relX = this.player.x - sh.ax;
      const relY = this.player.y - sh.ay;
      const proj = relX * sh.dirX + relY * sh.dirY;
      const side = relX * -sh.dirY + relY * sh.dirX;
      if (sh.huntClock < sh.revealPearlAfter) {
        if (this._activeShipHuntMirage()) {
          return _t("shipHunt.mirage");
        }
        return _t("shipHunt.search");
      }
      if (this._shipHuntPearlPickupInRange()) {
        return _t("shipHunt.pickup");
      }
      if (this._activeShipHuntMirage()) {
        return _t("shipHunt.fake");
      }
      const { dist: dPearlHint, pwx, pwy } = this._shipHuntPearlGeometry();
      const beamNear =
        Math.abs(this.player.x - pwx) < 130 && this.player.y <= pwy + 120;
      if (beamNear || dPearlHint < 200) {
        return _t("shipHunt.beam");
      }
      if (proj > sh.pearlProj * 0.82 && Math.abs(side) < sh.laneHalfW * 1.4) {
        return _t("shipHunt.trail");
      }
      if (Math.abs(side) > sh.laneHalfW * 1.35) {
        return side > 0 ? _t("shipHunt.toLeft") : _t("shipHunt.toRight");
      }
      return _t("shipHunt.more");
    }
    return null;
  }

  /**
   * @param {number} dt
   */
  update(dt) {
    this.underwater.update(dt);
    if (this.audio && typeof this.audio.tick === "function") this.audio.tick(dt, this);
    const b = this.renderer.bounds;
    this.bubbleField.update(dt, b, this.underwater.t);

    if (this.state === GameState.SHIP_HUNT && this._shipHunt.active && this._shipHunt.phase === 2) {
      this.underwater.ascentBoost = this._shipHunt.surfLight;
    } else {
      this.underwater.ascentBoost = 0;
    }

    if (this.state === GameState.START) {
      return;
    }

    if (this.state === GameState.SHARK_CHOICE) {
      this._modalBackdrop = Math.min(0.78, this._modalBackdrop + dt * 0.86);
      for (const s of this._sharks) {
        s.update(
          dt,
          this.player.x,
          this.player.y,
          this.underwater.t,
          false,
          { wait: true }
        );
      }
      return;
    }

    if (
      this.state === GameState.LOSE ||
      this.state === GameState.STAGE_OFFER ||
      this.state === GameState.WIN ||
      this.state === GameState.NEXT_STAGE ||
      this.state === GameState.CAVE_AFTER_CHOICE ||
      this.state === GameState.SHELTER_STUB ||
      this.state === GameState.CAVE_CHASE_LOSE
    ) {
      this._modalBackdrop = Math.min(0.78, this._modalBackdrop + dt * 0.86);
      return;
    }

    if (this.state === GameState.CAVE_CHASE) {
      if (this.input.consumeEscapePress()) {
        this._pauseReturnState = GameState.CAVE_CHASE;
        this.state = GameState.PAUSED;
      } else {
        this._updateCaveChase(dt);
      }
      return;
    }

    if (this.state === GameState.CAVE_INSIDE) {
      if (this.input.consumeEscapePress()) {
        this._pauseReturnState = GameState.CAVE_INSIDE;
        this.state = GameState.PAUSED;
      } else {
        this._updateCaveInside(dt);
      }
      return;
    }
    if (this.state === GameState.CAVE_EXIT_TRANSITION) {
      this._updateCaveExitTransition(dt);
      return;
    }

    if (this.input.consumeEscapePress()) {
      if (this.state === GameState.PLAYING) {
        this._pauseReturnState = GameState.PLAYING;
        this.state = GameState.PAUSED;
      } else if (this.state === GameState.STAGE_TWO) {
        this._pauseReturnState = GameState.STAGE_TWO;
        this.state = GameState.PAUSED;
      } else if (this.state === GameState.SHIP_HUNT) {
        this._pauseReturnState = GameState.SHIP_HUNT;
        this.state = GameState.PAUSED;
      } else if (this.state === GameState.PAUSED) {
        this.state = this._pauseReturnState ?? GameState.PLAYING;
      }
    }

    const playingCore =
      this.state === GameState.PLAYING ||
      this.state === GameState.STAGE_TWO ||
      this.state === GameState.STAGE_TWO_INTRO ||
      this.state === GameState.SHIP_HUNT;

    if (playingCore) {
      if (this.state === GameState.STAGE_TWO_INTRO) {
        this._updateStageTwoIntro(dt);
      }

      this.pickupVfx.update(dt);
      const axes = this.input.getMovementAxes();
      this.player.update(dt, axes, this.renderer.bounds);

      const stageTwoCore =
        this.state === GameState.STAGE_TWO ||
        this.state === GameState.STAGE_TWO_INTRO ||
        this.state === GameState.SHIP_HUNT;
      if (!stageTwoCore) {
        const moving =
          axes.x !== 0 ||
          axes.y !== 0 ||
          Math.hypot(this.player.vx, this.player.vy) > 18;
        const drain = (moving ? AIR_DRAIN_MOVING : AIR_DRAIN_IDLE) * this._pressureEase;
        this.air -= drain * dt;
        if (this.air <= 0) {
          this.air = 0;
          this.state = GameState.LOSE;
          this._modalBackdrop = 0;
          const best = this._commitBestPearlsScore();
          this._showLoseOverlay(best);
        }
      }

      if (
        this.state !== GameState.PLAYING &&
        this.state !== GameState.STAGE_TWO &&
        this.state !== GameState.STAGE_TWO_INTRO &&
        this.state !== GameState.SHIP_HUNT
      ) {
        return;
      }

      for (const p of this.pearls) {
        p.update(dt, this.renderer.bounds, this.player, this.pearls, this.underwater.t);
      }

      for (const o of this.oxygenPickups) {
        o.update(dt, this.renderer.bounds);
      }

      this._tickOxygenRhythm(dt);

      this._checkPickupCollision();
      if (
        this.state !== GameState.PLAYING &&
        this.state !== GameState.STAGE_TWO &&
        this.state !== GameState.STAGE_TWO_INTRO &&
        this.state !== GameState.SHIP_HUNT
      ) {
        return;
      }

      if (this._pressureEaseRemaining > 0) {
        this._pressureEaseRemaining -= dt;
        if (this._pressureEaseRemaining <= 0) {
          this._pressureEase = 1;
          this._pressureEaseRemaining = 0;
        }
      }

      if (this._nudgePlayerTimer > 0) {
        this._nudgePlayerTimer -= dt;
        const bb = this.renderer.bounds;
        const tx = bb.width * 0.5;
        const ty = bb.height * 0.32;
        this.player.x += (tx - this.player.x) * 0.026;
        this.player.y += (ty - this.player.y) * 0.021;
        const hw = this.player.halfW;
        const hh = this.player.halfH;
        this.player.x = Math.min(bb.width - hw, Math.max(hw, this.player.x));
        this.player.y = Math.min(bb.height - hh, Math.max(hh, this.player.y));
      }

      if (this.state === GameState.STAGE_TWO) {
        const surfY = this.player.halfH + 26;
        const boost = this.input.keys["Space"] ? 1.58 : 1;
        if (this._surfacingAfterSharks && this._sharks.length > 0) {
          const up = 520 * boost * dt;
          this.player.y -= up;
          this.player.y = Math.max(this.player.halfH + 14, this.player.y);
          this.player.vy = Math.min(this.player.vy * 0.88, -40);
          for (const bud of this._stageTwoBuddies) {
            if (bud.role !== "stay") continue;
            bud.y -= up * 0.96;
            bud.x += (this.player.x + 44 - bud.x) * 0.65 * dt;
            bud.y = Math.max(this.player.halfH + 16, bud.y);
          }
          for (const s of this._sharks) {
            s.update(
              dt,
              this.player.x,
              this.player.y,
              this.underwater.t,
              false,
              { creep: true }
            );
          }
          const bud = this._stageTwoBuddies.find((b) => b.role === "stay");
          const buddyOk = !bud || bud.y <= surfY + 6;
          if (this.player.y <= surfY && buddyOk) {
            this._sharksFleeing = true;
            this._surfacingAfterSharks = false;
          }
        } else if (this._sharksFleeing && this._sharks.length > 0) {
          let alive = false;
          for (const s of this._sharks) {
            s.update(dt, this.player.x, this.player.y, this.underwater.t, true);
            if (s.alpha > 0.04) alive = true;
          }
          if (!alive) {
            this._sharks = [];
            this._sharksFleeing = false;
          }
        } else if (!this._sharkUserResolved) {
          if (!this._sharkEventActive) {
            this._sharkArrivalTimer -= dt;
            if (this._sharkArrivalTimer <= 0) {
              this._spawnStageTwoSharks();
              this._sharkEventActive = true;
              this._timeSinceSharksSpawned = 0;
            }
          } else {
            this._timeSinceSharksSpawned += dt;
            for (const s of this._sharks) {
              s.update(dt, this.player.x, this.player.y, this.underwater.t, false);
            }
            if (this._timeSinceSharksSpawned >= 3.45 && !this._sharkPromptOpen) {
              this._sharkPromptOpen = true;
              if (this.sharkChoiceUi) {
                this.state = GameState.SHARK_CHOICE;
                this._modalBackdrop = 0;
                this._showSharkChoiceOverlay();
              } else {
                this._sharkUserResolved = true;
              }
            }
          }
        }
        if (!this._surfacingAfterSharks && this._stageTwoBuddies.length > 0) {
          this._updateStageTwoStayBuddy(dt);
        }
      } else if (this.state === GameState.SHIP_HUNT) {
        if (this._stageTwoBuddies.length > 0) {
          this._updateStageTwoStayBuddy(dt);
        }
        this._updateShipHunt(dt);
      }
    }

  }

  /** Пещера и погоня: рисуем вход до фигур игрока */
  _wantsCaveLayer() {
    return (
      this.state === GameState.CAVE_CHASE ||
      (this.state === GameState.PAUSED &&
        this._pauseReturnState === GameState.CAVE_CHASE)
    );
  }

  /** Общая отрисовка подводного слоя (с лёгким покачиванием) и опционально игрока */
  _renderUnderwaterWorld(ctx, drawPlayer, swimBoost) {
    const boost = !!swimBoost;
    const sway = this.underwater.getSway();
    // В сцене охоты за жемчужиной применяем «камеру» — пловца рисуем со
    // смещением, равным пройденному пути, так он остаётся зрительно в центре
    // кадра, а мир (дно, обломки, галочка, сама жемчужина) скроллится мимо.
    const shipHuntCam =
      this.state === GameState.SHIP_HUNT ||
      (this.state === GameState.PAUSED &&
        this._pauseReturnState === GameState.SHIP_HUNT)
        ? this._shipHuntCamera()
        : null;
    ctx.save();
    ctx.translate(sway.x, sway.y);
    this.underwater.renderBackground(ctx, this.renderer.bounds);
    this.underwater.renderVolumeFog(ctx, this.renderer.bounds);
    this.underwater.renderRays(ctx, this.renderer.bounds);
    this.underwater.renderDecorDistant(ctx, this.renderer.bounds);
    this.underwater.renderWaterSandBlend(ctx, this.renderer.bounds);
    this.underwater.renderSandBed(ctx, this.renderer.bounds);
    if (this._wantsCaveLayer()) {
      this._renderCaveEntrance(ctx);
    }
    this.underwater.renderDecor(ctx, this.renderer.bounds);
    this.underwater.renderDepthAndMist(ctx, this.renderer.bounds);
    this.bubbleField.render(ctx);
    this.renderer.drawPearls(ctx, this.pearls, this.underwater.t);
    this.renderer.drawOxygenPickups(ctx, this.oxygenPickups, this.underwater.t);
    this.underwater.renderDepthWashOverEntities(ctx, this.renderer.bounds);
    if (drawPlayer) {
      if (shipHuntCam) {
        ctx.save();
        ctx.translate(-shipHuntCam.x, -shipHuntCam.y);
        this.player.render(
          ctx,
          this.underwater.t,
          this.renderer.bounds.height,
          boost
        );
        ctx.restore();
      } else {
        this.player.render(
          ctx,
          this.underwater.t,
          this.renderer.bounds.height,
          boost
        );
      }
    }
    ctx.restore();

    if (
      drawPlayer &&
      (this.state === GameState.PLAYING ||
        this.state === GameState.PAUSED ||
        this.state === GameState.STAGE_OFFER ||
        this.state === GameState.STAGE_TWO ||
        this.state === GameState.STAGE_TWO_INTRO ||
        this.state === GameState.SHIP_HUNT ||
        this.state === GameState.SHARK_CHOICE ||
        this.state === GameState.SHELTER_STUB ||
        this.state === GameState.CAVE_CHASE)
    ) {
      ctx.save();
      ctx.translate(sway.x, sway.y);
      if (shipHuntCam) {
        ctx.translate(-shipHuntCam.x, -shipHuntCam.y);
      }
      this.pickupVfx.render(ctx);
      ctx.restore();
    }
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ width: number, height: number }} bounds
   */
  _renderCaveInsideSilhouette(ctx, s, viewH) {
    const da = characterDepthAlpha(s.y, viewH) * 0.55;
    ctx.save();
    ctx.globalAlpha = da;
    ctx.translate(s.x, s.y);
    if (s.kind === "turtle") {
      ctx.fillStyle = "rgba(28, 52, 48, 0.55)";
      ctx.beginPath();
      ctx.ellipse(0, 0, 22, 14, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "rgba(60, 110, 100, 0.35)";
      ctx.stroke();
    } else {
      ctx.fillStyle = "rgba(22, 48, 58, 0.5)";
      ctx.beginPath();
      ctx.ellipse(4, 0, 26, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(-18, 2);
      ctx.lineTo(-32, 0);
      ctx.lineTo(-18, -3);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ width: number, height: number }} bounds
   */
  _renderCaveInsideIntroText(ctx, bounds) {
    const T = this._caveInsideIntroT;
    if (T >= CAVE_INSIDE_GOAL_TEXT_END) return;
    const w = bounds.width;
    const h = bounds.height;
    const t = this.underwater.t;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.font = "600 18px system-ui, sans-serif";
    const lines = [
      _t("caveInside.goal.1"),
      _t("caveInside.goal.2"),
      _t("caveInside.goal.3"),
    ];
    for (let i = 0; i < lines.length; i++) {
      const lineA = _caveGoalLineAlpha(T, i);
      if (lineA <= 0.01) continue;
      const lineT = Math.max(0, T - i * CAVE_INSIDE_GOAL_STAGGER);
      const rise = Math.max(0, 1 - Math.min(1, lineT / (CAVE_INSIDE_GOAL_LINE_DUR * 0.9)));
      const py = h * 0.34 + i * 36 + rise * 42;
      const glint = 0.88 + 0.12 * Math.sin(t * 2.25 + i * 0.9);
      ctx.globalAlpha = lineA * 0.96 * glint;
      ctx.shadowBlur = 18 + lineA * 12;
      ctx.shadowColor = `rgba(130, 238, 224, ${0.25 * lineA})`;
      ctx.lineWidth = 4;
      ctx.strokeStyle = "rgba(0, 12, 18, 0.82)";
      ctx.strokeText(lines[i], w * 0.5, py);
      ctx.fillStyle = `rgba(218, 252, 245, ${lineA})`;
      ctx.fillText(lines[i], w * 0.5, py);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  _renderCaveExitTransitionText(ctx, bounds) {
    if (this.state !== GameState.CAVE_EXIT_TRANSITION) return;
    if (this._caveExitScenePhase > 1) return;
    const t = this._caveExitSceneT;
    const fadeIn = Math.min(1, t / 0.7);
    const fadeOut = t > 2.5 ? Math.max(0, 1 - (t - 2.5) / 0.7) : 1;
    const a = fadeIn * fadeOut;
    if (a <= 0.01) return;
    const x = bounds.width * 0.5;
    const y = bounds.height * 0.28;
    ctx.save();
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.lineWidth = 4;
    ctx.strokeStyle = "rgba(0, 16, 28, 0.82)";
    ctx.font = "600 20px system-ui, sans-serif";
    ctx.globalAlpha = a;
    const txt =
      this._caveExitScenePhase === 0
        ? _t("caveExit.phase0")
        : _t("caveExit.phase1");
    ctx.strokeText(txt, x, y);
    ctx.fillStyle = "rgba(214, 248, 240, 0.96)";
    ctx.fillText(txt, x, y);
    ctx.restore();
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {{ width: number, height: number }} bounds
   */
  _renderCaveInsideScene(ctx, bounds) {
    const w = bounds.width;
    const h = bounds.height;
    const t = this.underwater.t;
    const ft = this._caveFlickerT;
    const flickSlow =
      0.52 +
      0.48 * Math.sin(ft * 0.48) * Math.sin(ft * 0.31 + 1.1);
    const flickFast = 0.5 + 0.5 * Math.sin(ft * 0.88 + 0.4);
    const flickSharp = 0.5 + 0.5 * Math.sin(ft * 1.05 + 2.2 * Math.sin(ft * 0.09));

    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, "#061218");
    bg.addColorStop(0.38, "#0a1c24");
    bg.addColorStop(0.65, "#0b2228");
    bg.addColorStop(1, "#051014");
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const L = this._caveMazeLayout;
    if (!L) {
      ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
      ctx.fillRect(0, 0, w, h);
      return;
    }
    const { maze, ox, oy, cell } = L;
    const mw = maze.W * cell;
    const mh = maze.H * cell;
    const heat = this._caveVisitHeat;
    const budStay =
      this._stageTwoBuddies.find((q) => q.role === "stay") || null;
    const brWorld = (wx, wy) =>
      heat
        ? this._caveBrightWorld(maze, ox, oy, cell, heat, wx, wy, budStay)
        : 0.85;

    ctx.fillStyle = "rgba(0, 5, 12, 0.32)";
    ctx.fillRect(0, 0, w, h);

    const chamber = maze.chamber;
    for (let gy = 0; gy < maze.H; gy++) {
      for (let gx = 0; gx < maze.W; gx++) {
        if (maze.grid[gy][gx]) continue;
        const zx = gx / maze.W;
        const zoneDark = zx < 0.33 ? 1.06 : zx > 0.67 ? 1.04 : 0.94;
        const jx =
          Math.sin(gx * 2.17 + gy * 1.33) * cell * 0.08 +
          Math.sin(gy * 0.71) * 3;
        const jy =
          Math.cos(gx * 1.91 + gy * 2.05) * cell * 0.07 +
          Math.cos(gx * 0.62) * 2.5;
        const cx = ox + (gx + 0.5) * cell + jx;
        const cy = oy + (gy + 0.5) * cell + jy;
        const r = cell * (0.48 + Math.sin(gx * 3.1 + gy * 2.4) * 0.04);
        const br = brWorld(cx, cy);
        ctx.save();
        ctx.globalAlpha = Math.max(0.04, br * 0.98);
        const grd = ctx.createRadialGradient(cx, cy, 0, cx, cy, r * 1.08);
        grd.addColorStop(0, `rgba(10, 34, 42, ${0.72 * zoneDark})`);
        grd.addColorStop(0.55, `rgba(4, 18, 26, ${0.82 * zoneDark})`);
        grd.addColorStop(1, "rgba(0, 4, 10, 0.9)");
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(cx, cy, r, 0, Math.PI * 2);
        ctx.fill();
        if (br > 0.12) {
          ctx.strokeStyle = `rgba(140, 245, 228, ${0.06 + br * 0.16})`;
          ctx.lineWidth = 1.35;
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    for (let gy = 0; gy < maze.H; gy++) {
      for (let gx = 0; gx < maze.W; gx++) {
        if (!maze.grid[gy][gx]) continue;
        const zx = gx / maze.W;
        const dim = zx < 0.34 ? 0.03 : zx > 0.66 ? 0.02 : 0;
        const cx = ox + (gx + 0.5) * cell;
        const cy = oy + (gy + 0.5) * cell;
        const fl = maze.onPath[gy][gx] ? 1.05 : 0.92;
        const isCh = chamber && chamber[gy] && chamber[gy][gx];
        const rad = cell * (isCh ? 0.88 : 0.72);
        const br = brWorld(cx, cy);
        ctx.save();
        ctx.globalAlpha = Math.max(0.08, br);
        const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad);
        g.addColorStop(
          0,
          `rgba(42, 135, 128, ${(0.11 + dim * 1.2) * fl * flickSlow})`
        );
        g.addColorStop(0.55, `rgba(18, 68, 78, ${0.065 * fl * flickSlow})`);
        g.addColorStop(1, "rgba(0, 0, 0, 0)");
        ctx.fillStyle = g;
        ctx.fillRect(ox + gx * cell, oy + gy * cell, cell, cell);
        if (gx / maze.W < 0.46 && gy / maze.H < 0.8 && br > 0.09) {
          ctx.save();
          ctx.globalAlpha = br * 0.16 * flickSlow;
          const g2 = ctx.createRadialGradient(cx, cy, 0, cx, cy, rad * 1.22);
          g2.addColorStop(0, "rgba(175, 250, 232, 0.4)");
          g2.addColorStop(0.55, "rgba(60, 150, 155, 0.12)");
          g2.addColorStop(1, "rgba(0, 0, 0, 0)");
          ctx.fillStyle = g2;
          ctx.fillRect(ox + gx * cell, oy + gy * cell, cell, cell);
          ctx.restore();
        }
        ctx.restore();
      }
    }

    const mist = ctx.createRadialGradient(
      ox + mw * 0.5,
      oy + mh * 0.42,
      mh * 0.12,
      ox + mw * 0.52,
      oy + mh * 0.55,
      Math.max(mw, mh) * 0.65
    );
    mist.addColorStop(0, "rgba(32, 98, 102, 0.14)");
    mist.addColorStop(0.5, "rgba(12, 48, 58, 0.12)");
    mist.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35 * brWorld(this.player.x, this.player.y);
    ctx.fillStyle = mist;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    const entY = oy + (maze.entranceGy + 0.52) * cell;
    const gEnt = ctx.createLinearGradient(0, entY + cell * 1.35, 0, entY - mh * 0.55);
    gEnt.addColorStop(0, "rgba(2, 6, 16, 0.5)");
    gEnt.addColorStop(0.28, "rgba(4, 12, 26, 0.28)");
    gEnt.addColorStop(0.55, "rgba(6, 18, 32, 0.12)");
    gEnt.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = gEnt;
    ctx.fillRect(ox, oy, mw, mh);

    const tEnt = this.underwater.t;
    for (const g of this._caveEntranceGhosts) {
      const vis = brWorld(g.x, g.y);
      const pulse = 0.38 + 0.62 * Math.sin(tEnt * 0.42 + g.ph);
      ctx.save();
      ctx.globalAlpha = Math.min(0.22, (0.08 + vis * 0.14) * pulse);
      ctx.fillStyle = "rgba(6, 14, 22, 0.95)";
      ctx.beginPath();
      ctx.ellipse(g.x, g.y, 26 * g.sc, 9 * g.sc, Math.sin(tEnt * 0.2 + g.ph) * 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(12, 28, 40, 0.55)";
      ctx.beginPath();
      ctx.moveTo(g.x - 18 * g.sc, g.y + 2);
      ctx.lineTo(g.x - 34 * g.sc, g.y);
      ctx.lineTo(g.x - 18 * g.sc, g.y - 3);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    for (const fg of maze.falseGlow) {
      const px =
        ox +
        (fg.gx + 0.5 + fg.ux * 0.42) * cell +
        Math.sin(t * 0.37 + fg.gy) * 2;
      const py =
        oy + (fg.gy + 0.5 + fg.uy * 0.42) * cell + Math.cos(t * 0.29) * 2;
      const vis = brWorld(px, py);
      if (vis < 0.07) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, cell * 1.02);
      const pulse = 0.55 + 0.45 * flickFast;
      const spk = 0.55 + 0.45 * Math.sin(t * 3.2 + fg.gx * 2.1);
      g.addColorStop(0, `rgba(120, 245, 225, ${0.14 * pulse * vis})`);
      g.addColorStop(0.35, `rgba(55, 175, 168, ${0.1 * pulse * vis * spk})`);
      g.addColorStop(0.55, `rgba(200, 255, 130, ${0.055 * pulse * vis * spk})`);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy, mw, mh);
    }

    for (const tg of maze.tunnelSoftGlows || []) {
      const px =
        ox +
        (tg.gx + 0.5 + tg.ux * 0.28) * cell +
        Math.sin(t * 0.29 + tg.gy * 0.7) * 3;
      const py =
        oy +
        (tg.gy + 0.5 + tg.uy * 0.28) * cell +
        Math.cos(t * 0.24 + tg.gx * 0.6) * 2.5;
      const vis = brWorld(px, py);
      if (vis < 0.05) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, cell * 1.42);
      const pulse = 0.48 + 0.52 * flickSlow;
      g.addColorStop(0, `rgba(150, 255, 235, ${0.1 * pulse * vis})`);
      g.addColorStop(0.38, `rgba(255, 200, 150, ${0.055 * pulse * vis})`);
      g.addColorStop(0.72, `rgba(70, 190, 200, ${0.04 * vis})`);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy, mw, mh);
    }

    const decoys = maze.decoyGlows || [];
    for (const dg of decoys) {
      const px = ox + (dg.gx + 0.5) * cell + Math.sin(t * 0.31 + dg.gy) * 3;
      const py = oy + (dg.gy + 0.5) * cell + Math.cos(t * 0.27) * 2.5;
      const vis = brWorld(px, py);
      if (vis < 0.08) continue;
      const g = ctx.createRadialGradient(px, py, 0, px, py, cell * 1.05);
      const pulse = 0.5 + 0.5 * flickSlow;
      g.addColorStop(0, `rgba(255, 228, 188, ${0.145 * pulse * vis})`);
      g.addColorStop(0.4, `rgba(228, 168, 112, ${0.1 * pulse * vis})`);
      g.addColorStop(0.65, `rgba(150, 240, 255, ${0.06 * vis})`);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(ox, oy, mw, mh);
    }

    const ex =
      ox +
      (maze.exitGx + 0.5) * cell +
      Math.sin(t * 0.33 + maze.exitGy * 0.2) * (cell * 0.12);
    const ey =
      oy +
      (maze.exitGy + 0.5) * cell +
      Math.cos(t * 0.29 + maze.exitGx * 0.15) * (cell * 0.1);
    const exitPulse = 0.55 + 0.45 * flickSlow;
    let exitMem = 0;
    if (heat) {
      const ei = maze.exitGy * maze.W + maze.exitGx;
      exitMem = heat[ei] || 0;
    }
    const exitVis = Math.min(1, Math.max(brWorld(ex, ey), exitMem * 0.95));
    const exCol =
      ox + (maze.exitGx + 0.5) * cell;
    const shaft = ctx.createLinearGradient(exCol, oy + mh, exCol, oy);
    shaft.addColorStop(0, "rgba(0, 0, 0, 0)");
    shaft.addColorStop(0.35, `rgba(40, 120, 118, ${0.05 * exitVis})`);
    shaft.addColorStop(0.72, `rgba(88, 210, 175, ${0.1 * exitPulse * exitVis})`);
    shaft.addColorStop(1, `rgba(255, 235, 200, ${0.11 * exitPulse * exitVis})`);
    ctx.save();
    ctx.globalCompositeOperation = "screen";
    ctx.fillStyle = shaft;
    ctx.fillRect(ox, oy, mw, mh);

    const sunLift = ctx.createLinearGradient(exCol, oy + mh * 0.95, exCol, oy - mh * 0.18);
    sunLift.addColorStop(0, "rgba(0, 0, 0, 0)");
    sunLift.addColorStop(0.35, `rgba(95, 190, 205, ${0.055 * exitVis})`);
    sunLift.addColorStop(0.68, `rgba(175, 238, 220, ${0.08 * exitPulse * exitVis})`);
    sunLift.addColorStop(1, `rgba(255, 248, 214, ${0.09 * exitPulse * exitVis})`);
    ctx.fillStyle = sunLift;
    ctx.fillRect(ox, oy - mh * 0.14, mw, mh * 1.2);

    for (let b = 0; b < 3; b++) {
      const warm = b === this._caveInsideWarmBand;
      const cx = ox + mw * (0.18 + b * 0.32);
      const cy = oy + mh * (0.42 + Math.sin(t * 0.41 + b * 1.7) * 0.06);
      const g3 = ctx.createRadialGradient(cx, cy, 0, cx, cy, mh * 0.48);
      if (warm) {
        g3.addColorStop(0, `rgba(100, 230, 205, ${0.12 * flickSlow * exitVis})`);
        g3.addColorStop(0.5, `rgba(48, 140, 130, ${0.06 * exitVis})`);
      } else {
        g3.addColorStop(0, `rgba(36, 88, 98, ${0.07 * exitVis})`);
        g3.addColorStop(0.5, `rgba(16, 52, 62, ${0.08 * exitVis})`);
      }
      g3.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g3;
      ctx.fillRect(ox, oy, mw, mh);
    }

    const eg = ctx.createRadialGradient(ex, ey, 0, ex, ey, cell * 1.65);
    eg.addColorStop(0, `rgba(255, 248, 220, ${0.14 * exitPulse * exitVis})`);
    eg.addColorStop(0.22, `rgba(210, 255, 235, ${0.2 * exitPulse * exitVis})`);
    eg.addColorStop(0.45, `rgba(110, 225, 195, ${0.12 * exitPulse * exitVis})`);
    eg.addColorStop(0.68, `rgba(70, 170, 155, ${0.08 * exitPulse * exitVis})`);
    eg.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = eg;
    ctx.fillRect(ox, oy, mw, mh);
    const ex2 = ex + Math.sin(t * 1.9) * cell * 0.08;
    const ey2 = ey + Math.cos(t * 1.65) * cell * 0.07;
    const eg2 = ctx.createRadialGradient(ex2, ey2, 0, ex2, ey2, cell * 0.95);
    eg2.addColorStop(0, `rgba(255, 230, 190, ${0.07 * exitPulse * exitVis})`);
    eg2.addColorStop(0.5, `rgba(120, 210, 200, ${0.05 * exitVis})`);
    eg2.addColorStop(1, "rgba(0, 0, 0, 0)");
    ctx.fillStyle = eg2;
    ctx.fillRect(ox, oy, mw, mh);
    ctx.restore();

    for (const a of maze.shadowAnchors) {
      const wx = ox + (a.gx + 0.5) * cell;
      const wy = oy + (a.gy + 0.5) * cell;
      const br = brWorld(wx, wy);
      if (br < 0.06) continue;
      const pulse = 0.45 + 0.55 * Math.sin(t * 1.25 + a.ph);
      const g = ctx.createRadialGradient(wx, wy, 0, wx, wy, cell * 0.55);
      g.addColorStop(0, `rgba(50, 140, 130, ${0.08 * pulse * flickSlow * br})`);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(wx, wy, cell * 0.5, 0, Math.PI * 2);
      ctx.fill();
    }

    if (flickSharp > 0.78) {
      const shBase = Math.min(0.06, (flickSharp - 0.78) * 0.35) * flickSlow;
      for (const a of maze.shadowAnchors) {
        const sx = ox + (a.gx + 0.5) * cell + Math.sin(a.ph + t * 0.4) * 6;
        const sy = oy + (a.gy + 0.5) * cell + Math.cos(a.ph * 1.3) * 5;
        const br = brWorld(sx, sy);
        if (br < 0.08) continue;
        const al = shBase * br;
        ctx.fillStyle = `rgba(8, 28, 32, ${al})`;
        ctx.beginPath();
        ctx.ellipse(sx, sy, cell * 0.35, cell * 0.22, t * 0.08 + a.ph, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(
          sx - cell * 0.12,
          sy + cell * 0.08,
          cell * 0.18,
          cell * 0.28,
          0.5,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }
    }

    ctx.fillStyle = `rgba(0, 8, 14, ${0.02 + (1 - flickSlow) * 0.045})`;
    ctx.fillRect(0, 0, w, h);

    for (const bub of this._caveInsideBubbles) {
      const bv = brWorld(bub.x, bub.y);
      ctx.fillStyle = `rgba(210, 255, 250, ${bub.a * (0.92 + 0.14 * flickSlow) * Math.max(0.15, bv)})`;
      ctx.beginPath();
      ctx.arc(bub.x, bub.y, bub.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const sp of this._caveSparks) {
      const sv = brWorld(sp.x, sp.y);
      if (sv < 0.1) continue;
      const hue = ((sp.hue * 360) | 0) % 360;
      const a = Math.max(0, sp.life * 1.15 * sv);
      ctx.fillStyle = `hsla(${hue}, 82%, 62%, ${a})`;
      ctx.beginPath();
      ctx.arc(sp.x, sp.y, 2.1, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.save();
    ctx.globalCompositeOperation = "screen";
    const haloAt = (hx, hy, rad) => {
      const v0 = Math.max(0.12, brWorld(hx, hy));
      const g = ctx.createRadialGradient(hx, hy, 0, hx, hy, rad + CAVE_TORCH_HALO);
      g.addColorStop(0, `rgba(230, 255, 248, ${0.26 * v0})`);
      g.addColorStop(0.42, `rgba(90, 210, 220, ${0.1 * v0})`);
      g.addColorStop(0.78, `rgba(40, 120, 140, ${0.04 * v0})`);
      g.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    };
    haloAt(this.player.x, this.player.y - 22, CAVE_TORCH_RADIUS * 0.32);
    if (budStay) {
      haloAt(budStay.x, budStay.y - 18, CAVE_TORCH_RADIUS_BUDDY * 0.3);
    }
    ctx.restore();

    const mf = this._caveMicroFlash || 0;
    if (mf > 0.004) {
      ctx.save();
      ctx.globalCompositeOperation = "screen";
      ctx.fillStyle = `rgba(200, 255, 245, ${mf * 0.062})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
    ctx.fillStyle = `rgba(0, 4, 10, ${this._caveThreatDim || 0})`;
    ctx.fillRect(0, 0, w, h);

    const vig = ctx.createRadialGradient(
      w * 0.5,
      h * 0.5,
      h * 0.14,
      w * 0.5,
      h * 0.5,
      Math.max(w, h) * 0.74
    );
    vig.addColorStop(0, "rgba(0, 0, 0, 0)");
    vig.addColorStop(0.48, `rgba(0, 0, 0, ${0.045 + (1 - flickSlow) * 0.03})`);
    vig.addColorStop(1, "rgba(0, 0, 0, 0.22)");
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, w, h);
  }

  render() {
    const { ctx, bounds } = this.renderer;

    if (this.state === GameState.CAVE_EXIT_TRANSITION) {
      this._renderUnderwaterWorld(ctx, true, false);
      const sway2 = this.underwater.getSway();
      ctx.save();
      ctx.translate(sway2.x, sway2.y);
      const caveX = bounds.width * 0.82;
      const caveY = bounds.height * 0.82;
      ctx.globalAlpha = 0.42;
      ctx.fillStyle = "rgba(8, 18, 24, 0.95)";
      ctx.beginPath();
      ctx.ellipse(caveX, caveY, 90, 42, -0.28, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.28;
      const cg = ctx.createRadialGradient(caveX - 12, caveY - 8, 0, caveX - 12, caveY - 8, 84);
      cg.addColorStop(0, "rgba(120, 220, 210, 0.5)");
      cg.addColorStop(1, "rgba(0, 0, 0, 0)");
      ctx.fillStyle = cg;
      ctx.fillRect(0, 0, bounds.width, bounds.height);
      this._renderStageTwoStayBuddy(ctx, false);
      ctx.restore();
      this._renderCaveExitTransitionText(ctx, bounds);
      return;
    }

    if (
      this.state === GameState.LOSE ||
      this.state === GameState.STAGE_OFFER ||
      this.state === GameState.WIN ||
      this.state === GameState.NEXT_STAGE ||
      this.state === GameState.CAVE_AFTER_CHOICE ||
      this.state === GameState.SHARK_CHOICE ||
      this.state === GameState.SHELTER_STUB ||
      this.state === GameState.CAVE_CHASE_LOSE
    ) {
      this._renderUnderwaterWorld(ctx, true, false);
      if (
        this.state === GameState.SHARK_CHOICE ||
        this.state === GameState.SHELTER_STUB
      ) {
        const sway = this.underwater.getSway();
        ctx.save();
        ctx.translate(sway.x, sway.y);
        if (this._sharks.length > 0) this._renderStageTwoSharks(ctx);
        this._renderStageTwoStayBuddy(ctx, false);
        ctx.restore();
      }
      ctx.save();
      const b = this._modalBackdrop;
      if (this.state === GameState.SHARK_CHOICE) {
        const g = ctx.createLinearGradient(0, 0, 0, bounds.height);
        g.addColorStop(0, "rgba(2, 12, 24, 0)");
        g.addColorStop(0.42, "rgba(2, 12, 24, 0)");
        g.addColorStop(0.68, `rgba(2, 14, 28, ${0.03 + b * 0.08})`);
        g.addColorStop(1, `rgba(2, 10, 22, ${0.1 + b * 0.18})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, bounds.width, bounds.height);
      } else if (this.state === GameState.CAVE_CHASE_LOSE) {
        const g = ctx.createLinearGradient(0, 0, 0, bounds.height);
        g.addColorStop(0, `rgba(10, 40, 62, ${0.05 + b * 0.12})`);
        g.addColorStop(0.5, `rgba(4, 22, 40, ${0.08 + b * 0.18})`);
        g.addColorStop(1, `rgba(2, 12, 26, ${0.1 + b * 0.24})`);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, bounds.width, bounds.height);
      } else {
        const lightShelter = this.state === GameState.SHELTER_STUB;
        const a = lightShelter
          ? 0.1 + b * 0.32
          : 0.22 + b * 0.58;
        ctx.fillStyle = `rgba(1, 6, 18, ${a})`;
        ctx.fillRect(0, 0, bounds.width, bounds.height);
      }
      ctx.restore();
      const lightModal =
        this.state === GameState.SHARK_CHOICE ||
        this.state === GameState.SHELTER_STUB ||
        this.state === GameState.CAVE_AFTER_CHOICE ||
        this.state === GameState.CAVE_CHASE_LOSE;
      if (lightModal) {
        const winTarget = this._currentWinTarget(this.state);
        const stageLine = this._stageTwoUnlocked
          ? _t("hud.stage2")
          : null;
        this.hud.draw(ctx, {
          state: this.state,
          player: this.player,
          bounds,
          pearlsCollected: this.pearlsCollected,
          air: this.air,
          airMax: this.airMax,
          showAir: false,
          winTarget,
          objectiveText: this._currentObjectiveText(this.state),
          stageLine,
          surfaceBoostHint: false,
          caveChaseHint: false,
          caveInsideHint: false,
          caveInsideMazeMode: false,
        });
      }
      return;
    }

    if (this.state === GameState.START) {
      this._renderUnderwaterWorld(ctx, false, false);
      return;
    }

    const showCaveInside =
      this.state === GameState.CAVE_INSIDE ||
      (this.state === GameState.PAUSED &&
        this._pauseReturnState === GameState.CAVE_INSIDE);
    if (showCaveInside) {
      this._renderCaveInsideScene(ctx, bounds);
      if (this._caveInsideSil) {
        this._renderCaveInsideSilhouette(
          ctx,
          this._caveInsideSil,
          bounds.height
        );
      }
      this.renderer.drawOxygenPickups(ctx, this.oxygenPickups, this.underwater.t);
      this._renderStageTwoStayBuddy(ctx, false);
      this.player.render(ctx, this.underwater.t, bounds.height, false);
      this._renderCaveInsideIntroText(ctx, bounds);
      this.renderer.drawObstacles(this.obstacles);
      const winTarget = this._currentWinTarget(this.state);
      const stageLine = this._stageTwoUnlocked
        ? _t("hud.stage2")
        : null;
      this.hud.draw(ctx, {
        state: this.state,
        player: this.player,
        bounds,
        pearlsCollected: this.pearlsCollected,
        air: this.air,
        airMax: this.airMax,
        showAir: false,
        winTarget,
        objectiveText: this._currentObjectiveText(this.state),
        stageLine,
        surfaceBoostHint: false,
        caveChaseHint: false,
        caveInsideHint: true,
        caveInsideMazeMode: true,
      });
      if (this.state === GameState.PAUSED) {
        this.renderer.drawPauseOverlay();
      }
      return;
    }

    const caveBoostRender =
      (this.state === GameState.CAVE_CHASE ||
        (this.state === GameState.PAUSED &&
          this._pauseReturnState === GameState.CAVE_CHASE)) &&
      !!this.input.keys["Space"];
    const showChaseLayer =
      this.state === GameState.CAVE_CHASE ||
      (this.state === GameState.PAUSED &&
        this._pauseReturnState === GameState.CAVE_CHASE);
    const showShipHuntLayer =
      this.state === GameState.SHIP_HUNT ||
      (this.state === GameState.PAUSED &&
        this._pauseReturnState === GameState.SHIP_HUNT);

    this._renderUnderwaterWorld(ctx, true, caveBoostRender);
    if (showShipHuntLayer) {
      this._renderShipHuntLayer(ctx, bounds);
    }

    if (showChaseLayer && this._sharks.length > 0) {
      const sway2 = this.underwater.getSway();
      ctx.save();
      ctx.translate(sway2.x, sway2.y);
      this._renderStageTwoSharks(ctx);
      this._renderStageTwoStayBuddy(ctx, caveBoostRender);
      ctx.restore();
      if (this.state === GameState.CAVE_CHASE && this._caveLosePhase === 2) {
        const fa = this._caveFadeA;
        const g2 = ctx.createLinearGradient(0, 0, 0, bounds.height);
        g2.addColorStop(0, `rgba(4, 18, 34, ${0.05 + fa * 0.2})`);
        g2.addColorStop(0.55, `rgba(2, 10, 22, ${0.12 + fa * 0.42})`);
        g2.addColorStop(1, `rgba(1, 6, 16, ${0.18 + fa * 0.52})`);
        ctx.fillStyle = g2;
        ctx.fillRect(0, 0, bounds.width, bounds.height);
      }
    } else if (this.state === GameState.STAGE_TWO && this._sharks.length > 0) {
      const sway2 = this.underwater.getSway();
      ctx.save();
      ctx.translate(sway2.x, sway2.y);
      this._renderStageTwoSharks(ctx);
      this._renderStageTwoStayBuddy(ctx, false);
      ctx.restore();
    } else if (this.state === GameState.STAGE_TWO && this._stageTwoBuddies.length > 0) {
      const sway2 = this.underwater.getSway();
      ctx.save();
      ctx.translate(sway2.x, sway2.y);
      this._renderStageTwoStayBuddy(ctx, false);
      ctx.restore();
    }

    if (this.state === GameState.STAGE_TWO_INTRO) {
      const sway = this.underwater.getSway();
      ctx.save();
      ctx.translate(sway.x, sway.y);
      this._renderStageTwoIntroActors(ctx);
      ctx.restore();
      this._renderStageTwoIntroLayer(ctx);
    }

    if (this.state === GameState.CAVE_CHASE) {
      this._renderCaveChaseInstructionBanner(ctx, bounds);
    }

    this.renderer.drawObstacles(this.obstacles);

    const hudStates =
      this.state === GameState.PLAYING ||
      this.state === GameState.PAUSED ||
      this.state === GameState.STAGE_TWO ||
      this.state === GameState.STAGE_TWO_INTRO ||
      this.state === GameState.SHIP_HUNT ||
      this.state === GameState.CAVE_CHASE;
    if (hudStates) {
      const hudStateRef =
        this.state === GameState.PAUSED
          ? this._pauseReturnState ?? GameState.PLAYING
          : this.state;
      const showAir = !this._isSecondStageState(hudStateRef);
      const winTarget = this._currentWinTarget(hudStateRef);
      const stageLine = this._stageTwoUnlocked
        ? _t("hud.stage2")
        : null;
      this.hud.draw(ctx, {
        state: this.state,
        player: this.player,
        bounds,
        pearlsCollected: this.pearlsCollected,
        air: this.air,
        airMax: this.airMax,
        showAir,
        winTarget,
        objectiveText: this._currentObjectiveText(hudStateRef),
        stageLine,
        surfaceBoostHint: this._surfacingAfterSharks,
        caveChaseHint: this.state === GameState.CAVE_CHASE,
        caveInsideHint: false,
        caveInsideMazeMode: false,
      });
    }

    if (this.state === GameState.PAUSED) {
      this.renderer.drawPauseOverlay();
    }
  }

  _loop(ts) {
    const last = this._lastTs || ts;
    this._lastTs = ts;
    const dt = Math.min(0.05, (ts - last) / 1000);
    this.update(dt);
    this.render();
    requestAnimationFrame(this._loop);
  }

  run() {
    this.bubbleField.init(this.renderer.bounds);
    requestAnimationFrame(this._loop);
  }
}

function main() {
  const canvas = document.getElementById("game-canvas");
  const overlay = document.getElementById("start-overlay");
  const btn = document.getElementById("btn-start");

  const loseEl = document.getElementById("lose-overlay");
  const losePearls = document.getElementById("lose-pearls-count");
  const loseBest = document.getElementById("lose-best-count");
  const btnLoseRetry = document.getElementById("btn-lose-retry");

  const stageEl = document.getElementById("stage-overlay");
  const btnStageNext = document.getElementById("btn-stage-next");
  const btnStageContinue = document.getElementById("btn-stage-continue");

  const winEl = document.getElementById("win-overlay");
  const winTitle = document.getElementById("win-title");
  const winLine = document.getElementById("win-line");
  const winPearls = document.getElementById("win-pearls-count");
  const btnWinMenu = document.getElementById("btn-win-menu");
  const btnWinAgain = document.getElementById("btn-win-again");

  const nextEl = document.getElementById("next-stage-overlay");
  const btnNextBack = document.getElementById("btn-next-back");

  const sharkEl = document.getElementById("shark-overlay");
  const btnSharkBack = document.getElementById("btn-shark-back");
  const btnSharkHide = document.getElementById("btn-shark-hide");
  const shelterEl = document.getElementById("shelter-overlay");
  const btnShelterContinue = document.getElementById("btn-shelter-continue");
  const caveChoiceEl = document.getElementById("cave-choice-overlay");
  const btnCaveChoicePearls = document.getElementById("btn-cave-choice-pearls");
  const btnCaveChoiceShip = document.getElementById("btn-cave-choice-ship");

  const caveLoseEl = document.getElementById("cave-chase-lose-overlay");
  const btnCaveTry = document.getElementById("btn-cave-try");
  const btnCaveEnd = document.getElementById("btn-cave-end");

  if (!canvas || !overlay || !btn) return;

  const domUi = {
    lose:
      loseEl && losePearls && loseBest && btnLoseRetry
        ? { el: loseEl, pearlsSpan: losePearls, bestSpan: loseBest, btn: btnLoseRetry }
        : null,
    stageOffer:
      stageEl && btnStageNext && btnStageContinue
        ? { el: stageEl, btnNext: btnStageNext, btnContinue: btnStageContinue }
        : null,
    win:
      winEl && winPearls && btnWinMenu && btnWinAgain
        ? {
            el: winEl,
            titleEl: winTitle || undefined,
            lineEl: winLine || undefined,
            pearlsSpan: winPearls,
            btnMenu: btnWinMenu,
            btnAgain: btnWinAgain,
          }
        : null,
    nextStage: nextEl && btnNextBack ? { el: nextEl, btnBack: btnNextBack } : null,
    sharkChoice:
      sharkEl && btnSharkBack && btnSharkHide
        ? { el: sharkEl, btnBack: btnSharkBack, btnHide: btnSharkHide }
        : null,
    shelterStub:
      shelterEl && btnShelterContinue
        ? { el: shelterEl, btnContinue: btnShelterContinue }
        : null,
    caveChoice:
      caveChoiceEl && btnCaveChoicePearls && btnCaveChoiceShip
        ? { el: caveChoiceEl, btnPearls: btnCaveChoicePearls, btnShip: btnCaveChoiceShip }
        : null,
    caveChaseLose:
      caveLoseEl && btnCaveTry && btnCaveEnd
        ? { el: caveLoseEl, btnTry: btnCaveTry, btnEnd: btnCaveEnd }
        : null,
  };

  const gameAudio = new GameAudio();

  // ─── Громкость: единственный источник правды — AppSettings.masterVolume.
  // Ползунок живёт только в панели «Настрой игру под себя» (шестерёнка на
  // обложке). Значение сохраняется между сессиями.
  const volSettingsEl = document.getElementById("settings-master-volume");

  function _applyMasterVolume(v01) {
    const v = Math.max(0, Math.min(1, Number.isFinite(v01) ? v01 : 0.55));
    gameAudio.setMasterVolume(v);
    if (volSettingsEl) volSettingsEl.value = String(Math.round(v * 100));
    if (window.AppSettings && typeof window.AppSettings.set === "function") {
      window.AppSettings.set("masterVolume", v);
    }
  }

  const savedVol =
    (window.AppSettings && window.AppSettings.get("masterVolume")) ?? null;
  const initialVol = savedVol != null ? Number(savedVol) : 0.55;
  _applyMasterVolume(Number.isFinite(initialVol) ? initialVol : 0.55);

  if (volSettingsEl) {
    volSettingsEl.addEventListener("input", () => {
      _applyMasterVolume(Number(volSettingsEl.value) / 100);
    });
  }

  _initSettingsPanel();

  const game = new Game(canvas, overlay, domUi, gameAudio);
  btn.addEventListener("click", () => game.startFromMenu());

  if (domUi.lose) domUi.lose.btn.addEventListener("click", () => game.retryFromLose());
  if (domUi.stageOffer) {
    domUi.stageOffer.btnContinue.addEventListener("click", () => game.continueAfterStageOffer());
    domUi.stageOffer.btnNext.addEventListener("click", () => game.goToNextStageStub());
  }
  if (domUi.win) {
    domUi.win.btnMenu.addEventListener("click", () => game.winGoToMenu());
    domUi.win.btnAgain.addEventListener("click", () => game.winPlayAgain());
  }
  if (domUi.nextStage) {
    domUi.nextStage.btnBack.addEventListener("click", () => game.exitNextStageStub());
  }
  if (domUi.sharkChoice) {
    domUi.sharkChoice.btnBack.addEventListener("click", () => game.sharkChoiceReturnBack());
    domUi.sharkChoice.btnHide.addEventListener("click", () => game.sharkChoiceHideShelter());
  }
  if (domUi.shelterStub) {
    domUi.shelterStub.btnContinue.addEventListener("click", () => game.shelterStubContinue());
  }
  if (domUi.caveChoice) {
    domUi.caveChoice.btnPearls.addEventListener("click", () => game.caveChoiceCollectPearls());
    domUi.caveChoice.btnShip.addEventListener("click", () => game.caveChoiceFindShip());
  }
  if (domUi.caveChaseLose) {
    domUi.caveChaseLose.btnTry.addEventListener("click", () => game.caveChaseTryAgain());
    domUi.caveChaseLose.btnEnd.addEventListener("click", () => game.caveChaseFinish());
  }
  game.run();
}

/**
 * Панель настроек: открывается шестерёнкой на обложке (и позже — из паузы).
 * Умеет: показать/скрыть (с анимацией через класс `overlay--visible`),
 * переключить язык, закрыться по Esc, клику на фон и кнопке «Закрыть».
 *
 * Звук управляется на уровне _applyMasterVolume() в main() — здесь нам
 * достаточно только показать/скрыть панель и переключить язык.
 */
function _initSettingsPanel() {
  const overlay = document.getElementById("settings-overlay");
  const btnOpen = document.getElementById("btn-start-settings");
  const btnClose = document.getElementById("btn-settings-close");
  const panel = overlay ? overlay.querySelector(".settings-panel") : null;
  if (!overlay || !panel) return;

  const langButtons = overlay.querySelectorAll(".settings-lang__btn");

  function _refreshLangButtons() {
    const cur =
      window.i18n && typeof window.i18n.getLang === "function"
        ? window.i18n.getLang()
        : "ru";
    langButtons.forEach((b) => {
      const isActive = b.getAttribute("data-lang") === cur;
      b.setAttribute("aria-pressed", isActive ? "true" : "false");
    });
  }

  function open() {
    overlay.hidden = false;
    overlay.classList.remove("overlay--visible");
    // force reflow для корректного CSS-перехода
    void overlay.offsetWidth;
    requestAnimationFrame(() => overlay.classList.add("overlay--visible"));
    _refreshLangButtons();
  }

  function close() {
    overlay.classList.remove("overlay--visible");
    // подождать анимацию (0.25s из CSS) и убрать из потока
    setTimeout(() => {
      overlay.hidden = true;
    }, 260);
  }

  if (btnOpen) {
    btnOpen.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      open();
    });
  }
  if (btnClose) {
    btnClose.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      close();
    });
  }

  // Клик по «фону» закрывает, клик по самой панели — нет.
  overlay.addEventListener("click", (ev) => {
    if (ev.target === overlay) close();
  });

  // Esc — закрыть. Используем capture, чтобы перехватить ключ до InputManager
  // игры и не вызвать побочный эффект (вроде паузы).
  document.addEventListener(
    "keydown",
    (ev) => {
      if (ev.key === "Escape" && !overlay.hidden) {
        ev.stopPropagation();
        ev.preventDefault();
        close();
      }
    },
    true
  );

  // Переключение языка.
  langButtons.forEach((b) => {
    b.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      const code = b.getAttribute("data-lang");
      if (code && window.i18n && typeof window.i18n.setLang === "function") {
        window.i18n.setLang(code);
      }
      _refreshLangButtons();
    });
  });

  // Подхватить смену языка извне (например, через localStorage в другой вкладке).
  if (window.i18n && typeof window.i18n.onChange === "function") {
    window.i18n.onChange(() => _refreshLangButtons());
  }
  _refreshLangButtons();
}

function _initAudioDebugPanel(gameAudio) {
  const wrap = document.createElement("div");
  wrap.className = "audio-debug";
  wrap.innerHTML = `
    <button type="button" class="audio-debug__toggle">Аудио-тест</button>
    <div class="audio-debug__panel" hidden>
      <label>Ambient <input type="range" min="0" max="200" value="100" data-mix="ambient"></label>
      <label>SFX <input type="range" min="0" max="200" value="100" data-mix="sfx"></label>
      <label>Shark <input type="range" min="0" max="200" value="100" data-mix="shark"></label>
      <label>Бульк <input type="range" min="0" max="300" value="100" data-fx="bubble"></label>
      <label>Лоп <input type="range" min="0" max="300" value="100" data-fx="pop"></label>
      <label>Ууух <input type="range" min="0" max="300" value="100" data-fx="air"></label>
      <label>Плеск <input type="range" min="0" max="300" value="100" data-fx="splash"></label>
      <label>Дельфин <input type="range" min="0" max="300" value="100" data-fx="dolphin"></label>
      <label>Жемчуг <input type="range" min="0" max="300" value="100" data-fx="pearl"></label>
      <div class="audio-debug__btns">
        <button type="button" data-sfx="bubble">Бульк</button>
        <button type="button" data-sfx="pop">Лоп</button>
        <button type="button" data-sfx="air">Ууух</button>
        <button type="button" data-sfx="splash">Плеск</button>
        <button type="button" data-sfx="dolphin">Дельфин</button>
        <button type="button" data-sfx="pearl">Жемчуг</button>
      </div>
    </div>
  `;
  document.body.appendChild(wrap);
  const toggle = wrap.querySelector(".audio-debug__toggle");
  const panel = wrap.querySelector(".audio-debug__panel");
  if (toggle && panel) {
    toggle.addEventListener("click", () => {
      panel.hidden = !panel.hidden;
    });
  }
  wrap.querySelectorAll("input[data-mix]").forEach((el) => {
    el.addEventListener("input", () => {
      const ambient = Number(wrap.querySelector('input[data-mix="ambient"]').value) / 100;
      const sfx = Number(wrap.querySelector('input[data-mix="sfx"]').value) / 100;
      const shark = Number(wrap.querySelector('input[data-mix="shark"]').value) / 100;
      gameAudio.setMixLevels({ ambient, sfx, shark });
      gameAudio.resume();
    });
  });
  wrap.querySelectorAll("input[data-fx]").forEach((el) => {
    el.addEventListener("input", () => {
      gameAudio.setFxLevel(el.dataset.fx, Number(el.value) / 100);
      gameAudio.resume();
    });
  });
  wrap.querySelectorAll("button[data-sfx]").forEach((btnNode) => {
    btnNode.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      gameAudio.resume();
      gameAudio.playDebugSample(btnNode.dataset.sfx);
    });
  });
}

main();

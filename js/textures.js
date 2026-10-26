/* =========================================================
 *  textures.js — 程序化像素贴图
 *  所有方块 / 物品 / UI 图标均由代码绘制，无外部素材依赖
 * =======================================================*/
window.MC = window.MC || {};
(function () {
  'use strict';

  const GRID = 16, TS = 16, SIZE = GRID * TS;

  // ---------- 图集槽位 ----------
  const TILE_NAMES = [
    'stone', 'dirt', 'grass_top', 'grass_side', 'sand', 'log_side', 'log_top', 'leaves',
    'water', 'planks', 'glass', 'bedrock', 'gravel', 'coal_ore', 'iron_ore', 'diamond_ore',
    'farmland', 'farmland_wet', 'wheat0', 'wheat1', 'wheat2', 'wheat3', 'torch', 'sapling',
    'flower_red', 'flower_yellow', 'tall_grass', 'bed_top', 'bed_side', 'crafting_top', 'crafting_side', 'anvil',
    'bookshelf', 'fire', 'emerald', 'diamond', 'coal', 'iron_ingot', 'stick', 'apple',
    'bread', 'wheat_item', 'seeds', 'wood_pick', 'stone_pick', 'iron_pick', 'wood_axe', 'stone_axe',
    'iron_axe', 'sword', 'meat', 'wool', 'heart_full', 'heart_half', 'heart_empty', 'food_full',
    'food_half', 'food_empty', 'crack0', 'crack1', 'crack2', 'crack3', 'cobble',
    'chest_top', 'chest_side', 'chest_front', 'furnace_side', 'furnace_top', 'furnace_front',
    'furnace_front_lit', 'wood_hoe', 'stone_hoe', 'iron_hoe', 'cooked_meat'
  ];
  const TILES = {};
  TILE_NAMES.forEach((n, i) => { TILES[n] = i; });

  // ---------- 工具 ----------
  function mulberry32(a) {
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w || SIZE; c.height = h || SIZE;
    return c;
  }

  // ---------- 图集绘制 ----------
  const atlas = makeCanvas(SIZE, SIZE);
  const actx = atlas.getContext('2d');
  actx.imageSmoothingEnabled = false;

  function at(i, fn) {
    actx.save();
    actx.translate((i % GRID) * TS, Math.floor(i / GRID) * TS);
    actx.beginPath();
    actx.rect(0, 0, TS, TS);
    actx.clip();
    fn(actx, i);
    actx.restore();
  }
  function fill(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x, y, w, h); }
  function px(ctx, x, y, c) { fill(ctx, x, y, 1, 1, c); }
  function speck(ctx, r, colors, count, maxSize) {
    for (let k = 0; k < count; k++) {
      const x = (r() * TS) | 0, y = (r() * TS) | 0;
      const s = maxSize ? 1 + ((r() * maxSize) | 0) : 1;
      ctx.fillStyle = colors[(r() * colors.length) | 0];
      ctx.fillRect(x, y, s, s);
    }
  }
  function vline(ctx, x, y0, y1, c) { fill(ctx, x, y0, 1, y1 - y0, c); }
  function hline(ctx, x0, x1, y, c) { fill(ctx, x0, y, x1 - x0, 1, c); }

  const P = {
    stone: ['#8b8b8b', '#7c7c7c', '#9a9a9a', '#6f6f6f'],
    dirt: ['#8a5a34', '#7a4d2b', '#9a6a40', '#6b4226'],
    grass: ['#5fa63d', '#6cb545', '#549434', '#79c04f']
  };

  // ---------- 方块贴图 ----------
  function paintStone(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#898989');
    speck(ctx, r, P.stone.slice(1), 42, 2);
    // 裂纹
    ctx.fillStyle = '#6b6b6b';
    for (let k = 0; k < 3; k++) {
      let x = (r() * 16) | 0, y = (r() * 16) | 0;
      for (let s = 0; s < 4; s++) { px(ctx, x, y, '#6b6b6b'); x += (r() * 3 | 0) - 1; y += 1; }
    }
  }

  function paintDirt(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#8a5a34');
    speck(ctx, r, P.dirt.slice(1), 58, 2);
  }

  function paintGrassTop(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#5fa63d');
    speck(ctx, r, P.grass.slice(1), 55, 2);
    // 几撮高光草
    for (let k = 0; k < 7; k++) {
      const x = (r() * 15) | 0, y = (r() * 15) | 0;
      px(ctx, x, y, '#8ed05f'); px(ctx, x, y + 1, '#7bbe50');
    }
  }

  function paintGrassSide(ctx, seed) {
    const r = mulberry32(seed);
    paintDirt(ctx, seed + 5);
    const edge = [4, 3, 4, 5, 3, 4, 4, 3, 5, 4, 3, 4, 4, 5, 3, 4];
    for (let x = 0; x < 16; x++) {
      const h = edge[x];
      fill(ctx, x, 0, 1, h, '#5fa63d');
      px(ctx, x, h - 1, '#4d8c30');
      if (r() < 0.4) px(ctx, x, h, '#5fa63d');
    }
    speck(ctx, r, ['#6cb545', '#79c04f'], 12, 1);
  }

  function paintSand(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#e3d391');
    speck(ctx, r, ['#d7c47e', '#efe0a6', '#cfba72', '#e9da9b'], 46, 1);
  }

  function paintLogSide(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#6d4b2c');
    for (let x = 0; x < 16; x++) {
      if (x % 4 === 0) vline(ctx, x, 0, 16, '#553a20');
      else if (x % 4 === 2) vline(ctx, x, 0, 16, '#7e5935');
      else {
        for (let y = 0; y < 16; y++) {
          if (r() < 0.22) px(ctx, x, y, r() < 0.5 ? '#5e4124' : '#8a6238');
        }
      }
    }
    // 树节
    fill(ctx, 6, 6, 3, 3, '#5a3d22');
    px(ctx, 7, 7, '#8a6238');
  }

  function paintLogTop(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#b08a55');
    // 年轮
    for (let ring = 0; ring < 3; ring++) {
      const inset = 2 + ring * 2;
      ctx.strokeStyle = ring % 2 ? '#8a6a3f' : '#9d7a49';
      ctx.lineWidth = 1;
      ctx.strokeRect(inset + 0.5, inset + 0.5, 15 - inset * 2, 15 - inset * 2);
    }
    fill(ctx, 7, 7, 2, 2, '#6d4b2c');
    speck(ctx, r, ['#a37f4e', '#c39a63'], 10, 1);
  }

  function paintLeaves(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#4d8f33');
    const cols = ['#3f7a28', '#5da33d', '#356b20', '#68b048', '#47822c'];
    for (let k = 0; k < 90; k++) {
      const x = (r() * 16) | 0, y = (r() * 16) | 0;
      fill(ctx, x, y, 1 + ((r() * 2) | 0), 1, cols[(r() * cols.length) | 0]);
    }
    // 透光小孔
    for (let k = 0; k < 6; k++) px(ctx, (r() * 16) | 0, (r() * 16) | 0, '#2c5c1d');
  }

  function paintWater(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#3f74c9');
    for (let k = 0; k < 26; k++) {
      const x = (r() * 14) | 0, y = (r() * 16) | 0;
      fill(ctx, x, y, 2 + ((r() * 3) | 0), 1, r() < 0.5 ? '#4f86d9' : '#3566b4');
    }
    hline(ctx, 1, 6, 4, '#6fa3ea');
    hline(ctx, 9, 14, 11, '#6fa3ea');
  }

  function paintPlanks(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#a97a45');
    for (let y = 0; y < 16; y += 4) {
      hline(ctx, 0, 16, y, '#7d552e');
      hline(ctx, 0, 16, y + 1, '#b8894f');
      for (let x = 0; x < 16; x++) if (r() < 0.13) px(ctx, x, y + 2 + ((r() * 2) | 0), '#94683a');
    }
    // 钉子 / 拼缝
    px(ctx, 3, 6, '#6b4626'); px(ctx, 12, 10, '#6b4626');
  }

  function paintGlass(ctx, seed) {
    // 透明中心，浅色边框
    ctx.clearRect(0, 0, 16, 16);
    fill(ctx, 0, 0, 16, 1, 'rgba(214,240,255,0.85)');
    fill(ctx, 0, 15, 16, 1, 'rgba(214,240,255,0.85)');
    fill(ctx, 0, 0, 1, 16, 'rgba(214,240,255,0.85)');
    fill(ctx, 15, 0, 1, 16, 'rgba(214,240,255,0.85)');
    fill(ctx, 2, 2, 4, 1, 'rgba(255,255,255,0.55)');
    fill(ctx, 2, 3, 1, 3, 'rgba(255,255,255,0.55)');
    px(ctx, 13, 4, 'rgba(255,255,255,0.4)');
    px(ctx, 5, 13, 'rgba(255,255,255,0.3)');
  }

  function paintCobble(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#7d7d7d');
    for (let k = 0; k < 34; k++) {
      const x = (r() * 15) | 0, y = (r() * 15) | 0;
      const w = 2 + ((r() * 3) | 0), h = 2 + ((r() * 3) | 0);
      const c = ['#8f8f8f', '#6f6f6f', '#9c9c9c', '#767676'][(r() * 4) | 0];
      fill(ctx, x, y, w, h, c);
      fill(ctx, x, y, w, 1, 'rgba(255,255,255,0.18)');
      fill(ctx, x, y + h - 1, w, 1, 'rgba(0,0,0,0.18)');
    }
    speck(ctx, r, ['#696969', '#a0a0a0'], 20, 1);
  }

  function paintBedrock(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#3a3a3f');
    for (let k = 0; k < 30; k++) {
      const x = (r() * 14) | 0, y = (r() * 14) | 0;
      fill(ctx, x, y, 2 + ((r() * 3) | 0), 2, ['#202024', '#55555c', '#2c2c31', '#48484f'][(r() * 4) | 0]);
    }
  }

  function paintGravel(ctx, seed) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, '#8a8378');
    for (let k = 0; k < 46; k++) {
      const x = (r() * 16) | 0, y = (r() * 16) | 0;
      fill(ctx, x, y, 1 + ((r() * 2) | 0), 1 + ((r() * 2) | 0),
        ['#6f6a62', '#a39b8d', '#5c5852', '#9a9184', '#7b746a'][(r() * 5) | 0]);
    }
  }

  function paintOre(ctx, seed, colors) {
    paintStone(ctx, seed);
    const r = mulberry32(seed + 77);
    for (let k = 0; k < 6; k++) {
      const x = 2 + ((r() * 11) | 0), y = 2 + ((r() * 11) | 0);
      const w = 2 + ((r() * 2) | 0), h = 2 + ((r() * 2) | 0);
      fill(ctx, x, y, w, h, colors[0]);
      fill(ctx, x, y, 1, 1, colors[1]);
      px(ctx, x + w - 1, y + h - 1, colors[2]);
    }
  }

  function paintFarmland(ctx, seed, wet) {
    const r = mulberry32(seed);
    fill(ctx, 0, 0, 16, 16, wet ? '#4f3721' : '#6b4a2c');
    for (let x = 0; x < 16; x += 3) {
      vline(ctx, x, 0, 16, wet ? '#3b2817' : '#573a21');
      vline(ctx, x + 1, 0, 16, wet ? '#5d422a' : '#7a5533');
    }
    speck(ctx, r, wet ? ['#43301d', '#5f4529'] : ['#5a3c22', '#7d5836'], 22, 1);
    if (wet) speck(ctx, r, ['#2f4a63', '#3a5a76'], 6, 1);
  }

  function paintWheat(ctx, seed, stage) {
    const r = mulberry32(seed);
    const stems = 4 + stage;
    const colors = stage >= 3 ? ['#c9a53f', '#b58f32', '#dcb94f'] : ['#6aa83b', '#5c9a33', '#7cba4b'];
    for (let k = 0; k < stems; k++) {
      const x = 2 + ((r() * 12) | 0);
      const h = 5 + stage * 3 + ((r() * 2) | 0);
      vline(ctx, x, 16 - h, 16, colors[(r() * colors.length) | 0]);
      if (stage >= 2) {
        // 麦穗
        for (let s = 0; s < Math.min(4, stage); s++) {
          px(ctx, x + (s % 2 ? 1 : -1), 16 - h + s * 2, colors[0]);
        }
      }
      if (stage >= 1) px(ctx, x + 1, 12, colors[1]);
    }
  }

  function paintTorch(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    // 木棍
    fill(ctx, 7, 7, 2, 9, '#7a5a34');
    fill(ctx, 7, 7, 1, 9, '#8f6c42');
    // 火焰
    fill(ctx, 6, 3, 4, 4, '#ff9c2a');
    fill(ctx, 7, 2, 2, 5, '#ffd24a');
    fill(ctx, 7, 4, 2, 2, '#fff3b0');
    px(ctx, 5, 5, 'rgba(255,170,60,0.7)');
    px(ctx, 10, 4, 'rgba(255,170,60,0.6)');
    px(ctx, 6, 6, 'rgba(255,140,40,0.4)');
    px(ctx, 7, 15, '#5a3d22');
  }

  function paintSapling(ctx, seed) {
    ctx.clearRect(0, 0, 16, 16);
    const r = mulberry32(seed);
    fill(ctx, 7, 6, 2, 10, '#5a7a2f');
    for (let k = 0; k < 14; k++) {
      px(ctx, 5 + ((r() * 7) | 0), 3 + ((r() * 7) | 0), ['#4f9a3a', '#3f7a2a', '#6cb545'][(r() * 3) | 0]);
    }
    fill(ctx, 6, 2, 5, 3, '#4f9a3a');
    px(ctx, 7, 1, '#6cb545');
    px(ctx, 6, 8, '#5a7a2f');
  }

  function paintFlower(ctx, petal, center, seed) {
    ctx.clearRect(0, 0, 16, 16);
    const r = mulberry32(seed);
    vline(ctx, 8, 8, 16, '#4b7a2a');
    px(ctx, 7, 11, '#5c8f33'); px(ctx, 6, 10, '#5c8f33');
    px(ctx, 9, 13, '#5c8f33'); px(ctx, 10, 12, '#5c8f33');
    const spots = [[8, 4], [6, 5], [10, 5], [7, 6], [9, 6], [8, 7], [5, 6], [11, 6]];
    spots.forEach(([x, y]) => px(ctx, x, y, petal));
    px(ctx, 8, 5, center); px(ctx, 8, 6, center);
    px(ctx, 7, 4, 'rgba(255,255,255,0.35)');
  }

  function paintTallGrass(ctx, seed) {
    ctx.clearRect(0, 0, 16, 16);
    const r = mulberry32(seed);
    const cols = ['#5f9e3f', '#4c8532', '#72b34e', '#3f7328'];
    for (let k = 0; k < 9; k++) {
      let x = 1 + ((r() * 14) | 0);
      const h = 5 + ((r() * 11) | 0);
      for (let y = 0; y < h; y++) px(ctx, x, 15 - y, cols[(r() * cols.length) | 0]);
      if (r() < 0.5) px(ctx, x + 1, 15 - h + 2, cols[2]);
    }
    speck(ctx, r, ['#4c8532', '#6cae47'], 8, 1);
  }

  function paintBed(ctx, top) {
    if (top) {
      fill(ctx, 0, 0, 16, 16, '#b53a3a');
      fill(ctx, 0, 0, 16, 5, '#e8e2d6');       // 枕头
      fill(ctx, 0, 4, 16, 1, '#c9c1b2');
      hline(ctx, 0, 16, 9, '#8f2b2b');
      hline(ctx, 0, 16, 10, '#d05050');
      fill(ctx, 0, 0, 16, 1, '#8f2b2b');
      fill(ctx, 0, 15, 16, 1, '#8f2b2b');
      fill(ctx, 0, 0, 1, 16, '#8f2b2b');
      fill(ctx, 15, 0, 1, 16, '#8f2b2b');
      // 花纹
      for (let x = 2; x < 16; x += 4) fill(ctx, x, 11, 2, 2, '#d9a0a0');
    } else {
      fill(ctx, 0, 0, 16, 16, '#8a5a34');
      fill(ctx, 0, 0, 16, 6, '#b53a3a');
      fill(ctx, 0, 2, 16, 1, '#d05050');
      fill(ctx, 0, 7, 16, 1, '#6b4325');
      fill(ctx, 0, 14, 16, 2, '#6b4325');
    }
  }

  function paintCrafting(ctx) {
    paintPlanks(ctx, 7);
    if (ctx === undefined) return;
    ctx.strokeStyle = '#5e3f22'; ctx.lineWidth = 1;
    ctx.strokeRect(2.5, 2.5, 11, 11);
    hline(ctx, 3, 13, 6, '#5e3f22');
    hline(ctx, 3, 13, 9, '#5e3f22');
    vline(ctx, 6, 3, 13, '#5e3f22');
    vline(ctx, 9, 3, 13, '#5e3f22');
    fill(ctx, 2, 2, 2, 2, '#8a6238');
  }

  function paintCraftingSide(ctx) {
    paintPlanks(ctx, 19);
    fill(ctx, 0, 0, 16, 2, '#8a6238');
    fill(ctx, 0, 14, 16, 2, '#6b4626');
    // 锯子与锤子剪影
    ctx.fillStyle = '#5e3f22';
    ctx.fillRect(3, 7, 2, 5);
    ctx.fillRect(2, 5, 6, 2);
    ctx.fillRect(10, 6, 3, 3);
    ctx.fillRect(11, 9, 1, 4);
  }

  function paintAnvil(ctx) {
    fill(ctx, 0, 0, 16, 16, '#4a4a52');
    fill(ctx, 1, 1, 14, 5, '#6a6a72');
    fill(ctx, 1, 1, 14, 1, '#8a8a92');
    fill(ctx, 4, 6, 8, 4, '#585860');
    fill(ctx, 2, 10, 12, 4, '#3c3c44');
    fill(ctx, 2, 14, 12, 2, '#2e2e34');
    px(ctx, 3, 2, '#9a9aa2'); px(ctx, 12, 2, '#9a9aa2');
    fill(ctx, 6, 5, 4, 1, '#45454d');
  }

  function paintBookshelf(ctx) {
    paintPlanks(ctx, 31);
    fill(ctx, 0, 7, 16, 1, '#6b4626');
    fill(ctx, 0, 14, 16, 1, '#6b4626');
    const cols = ['#b53a3a', '#3a6bb5', '#3a9e5c', '#c9a53f', '#8a4ab5', '#c96a3f'];
    for (let shelf = 0; shelf < 2; shelf++) {
      const y0 = shelf === 0 ? 1 : 8;
      for (let x = 1; x < 15; x += 3) {
        const c = cols[(x * 7 + shelf * 3) % cols.length];
        fill(ctx, x, y0 + 1, 2, 5, c);
        fill(ctx, x, y0 + 1, 2, 1, 'rgba(255,255,255,0.25)');
      }
    }
  }

  function paintChest(ctx, part) {
    // 木质箱体
    fill(ctx, 0, 0, 16, 16, '#a8793f');
    fill(ctx, 0, 0, 16, 2, '#8a5f2c');
    fill(ctx, 0, 14, 16, 2, '#7d5326');
    fill(ctx, 0, 0, 2, 16, '#8a5f2c');
    fill(ctx, 14, 0, 2, 16, '#7d5326');
    // 木纹
    for (let y = 3; y < 14; y += 3) hline(ctx, 2, 14, y, '#96683a');
    if (part === 'top') {
      fill(ctx, 2, 2, 12, 12, '#b98a4c');
      fill(ctx, 3, 3, 10, 1, '#d0a466');
      hline(ctx, 3, 13, 8, '#8a5f2c');
    } else if (part === 'front') {
      // 盖子分界 + 锁扣
      hline(ctx, 1, 15, 7, '#6b4520');
      fill(ctx, 7, 6, 2, 5, '#e0c05a');
      fill(ctx, 7, 6, 2, 1, '#f2dc8e');
      px(ctx, 8, 9, '#8a6a20');
      px(ctx, 8, 10, '#8a6a20');
    } else {
      hline(ctx, 1, 15, 7, '#6b4520');
    }
  }

  function paintFurnace(ctx, part, lit) {
    fill(ctx, 0, 0, 16, 16, '#6f6f75');
    // 石块纹理
    const r = mulberry32(lit ? 401 : 400);
    speck(ctx, r, ['#7d7d84', '#616168', '#56565c'], 18, 1);
    fill(ctx, 0, 0, 16, 1, '#83838a');
    fill(ctx, 0, 15, 16, 1, '#4f4f55');
    if (part === 'top') {
      fill(ctx, 2, 2, 12, 12, '#5a5a60');
      fill(ctx, 3, 3, 10, 10, '#4a4a50');
      fill(ctx, 6, 6, 4, 4, '#3a3a40');
    } else if (part === 'front') {
      // 炉口
      fill(ctx, 3, 7, 10, 7, '#26262b');
      fill(ctx, 4, 8, 8, 5, lit ? '#ff8a2a' : '#17171b');
      if (lit) {
        fill(ctx, 4, 11, 8, 2, '#ffcc44');
        fill(ctx, 5, 9, 2, 3, '#ffdd77');
        fill(ctx, 9, 10, 2, 2, '#ffaa33');
        px(ctx, 8, 8, '#fff3b0');
      }
      // 炉口上方的铁栅
      hline(ctx, 3, 13, 6, '#3a3a40');
      fill(ctx, 3, 4, 10, 1, '#8a8a92');
    }
  }

  function paintHoe(ctx, head, shine) {
    ctx.clearRect(0, 0, 16, 16);
    // 木柄（左上到右下）
    ctx.strokeStyle = '#7a5a34';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(4, 14); ctx.lineTo(11, 4);
    ctx.stroke();
    ctx.strokeStyle = '#9a7448';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(5, 14); ctx.lineTo(12, 4);
    ctx.stroke();
    // 锄头
    fill(ctx, 9, 2, 6, 3, head);
    fill(ctx, 9, 2, 6, 1, shine);
    fill(ctx, 9, 4, 2, 2, head);
    px(ctx, 14, 2, shine);
  }

  function paintCookedMeat(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#8a4a22';
    ctx.beginPath(); ctx.ellipse(8, 6, 5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    fill(ctx, 6, 8, 4, 3, '#7a3f1c');
    fill(ctx, 9, 10, 2, 4, '#e8e2d0');
    fill(ctx, 8, 12, 2, 2, '#f2ece0');
    fill(ctx, 5, 4, 4, 2, '#b56a34');
    // 焦痕
    hline(ctx, 4, 8, 4, '#5e2f12');
    hline(ctx, 6, 10, 7, '#5e2f12');
    px(ctx, 6, 5, '#d8905a');
  }

  function paintFire(ctx, seed) {
    ctx.clearRect(0, 0, 16, 16);
    const r = mulberry32(seed || 3);
    for (let k = 0; k < 40; k++) {
      const x = 2 + ((r() * 12) | 0), y = 2 + ((r() * 14) | 0);
      const c = y > 11 ? '#d63a10' : y > 7 ? '#ff7a1a' : '#ffcc33';
      px(ctx, x, y, c);
    }
    for (let k = 0; k < 8; k++) px(ctx, 6 + ((r() * 5) | 0), 12 + ((r() * 4) | 0), '#fff3b0');
  }

  // ---------- 物品图标 ----------
  function paintEmerald(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    const pts = [[8, 1], [13, 5], [11, 14], [5, 14], [3, 5]];
    ctx.fillStyle = '#2fbf72';
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#1f9e58';
    ctx.beginPath(); ctx.moveTo(8, 1); ctx.lineTo(13, 5); ctx.lineTo(8, 8); ctx.lineTo(3, 5); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#7ff0ac';
    ctx.beginPath(); ctx.moveTo(8, 1); ctx.lineTo(10, 4); ctx.lineTo(6, 5); ctx.closePath(); ctx.fill();
    fill(ctx, 5, 9, 2, 4, '#1f9e58');
    px(ctx, 10, 9, '#7ff0ac');
  }

  function paintDiamond(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    const pts = [[8, 2], [14, 6], [11, 14], [5, 14], [2, 6]];
    ctx.fillStyle = '#4fd8d0';
    ctx.beginPath(); pts.forEach(([x, y], i) => i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#8ff5ef';
    ctx.beginPath(); ctx.moveTo(8, 2); ctx.lineTo(11, 6); ctx.lineTo(5, 6); ctx.closePath(); ctx.fill();
    ctx.fillStyle = '#2fa9a2';
    fill(ctx, 5, 9, 6, 1);
    fill(ctx, 6, 11, 4, 1);
    px(ctx, 8, 4, '#ffffff');
  }

  function paintCoal(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    const r = mulberry32(9);
    for (let k = 0; k < 26; k++) {
      const x = 3 + ((r() * 10) | 0), y = 3 + ((r() * 10) | 0);
      fill(ctx, x, y, 2 + ((r() * 2) | 0), 2, ['#2b2b2b', '#191919', '#3d3d3d'][(r() * 3) | 0]);
    }
    px(ctx, 6, 5, '#5a5a5a'); px(ctx, 9, 9, '#4a4a4a');
  }

  function paintIngot(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    fill(ctx, 3, 5, 10, 2, '#e8ecf2');
    fill(ctx, 2, 7, 12, 5, '#c9ced6');
    fill(ctx, 2, 11, 12, 1, '#8f96a0');
    fill(ctx, 3, 7, 10, 1, '#dfe4ea');
    fill(ctx, 4, 8, 2, 2, '#f4f7fa');
    px(ctx, 3, 12, '#70767e'); px(ctx, 12, 12, '#70767e');
  }

  function paintStick(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    for (let i = 0; i < 9; i++) {
      px(ctx, 4 + i, 12 - i, '#8a5f38');
      px(ctx, 5 + i, 12 - i, '#6b4626');
    }
    px(ctx, 3, 13, '#6b4626');
  }

  function paintApple(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#d63a3a';
    ctx.beginPath(); ctx.arc(8, 9, 5.2, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#b52c2c';
    ctx.beginPath(); ctx.arc(6, 9, 3.4, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#ff7b7b';
    ctx.beginPath(); ctx.arc(6, 7, 1.6, 0, Math.PI * 2); ctx.fill();
    fill(ctx, 7, 1, 1, 4, '#6b4626');
    fill(ctx, 8, 2, 3, 2, '#4f9a3a');
    px(ctx, 8, 2, '#6cb545');
  }

  function paintBread(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    fill(ctx, 2, 5, 12, 7, '#d9a85f');
    fill(ctx, 2, 5, 12, 2, '#e8bd78');
    fill(ctx, 2, 11, 12, 1, '#b5803a');
    for (let x = 4; x < 13; x += 3) fill(ctx, x, 6, 1, 4, '#c08f48');
    px(ctx, 4, 6, '#f0d49a');
  }

  function paintWheatItem(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    for (let k = 0; k < 3; k++) {
      const x = 5 + k * 3;
      vline(ctx, x, 3, 14, '#c9a53f');
      for (let y = 4; y < 12; y += 2) {
        px(ctx, x - 1, y, '#e0be58');
        px(ctx, x + 1, y + 1, '#b58f32');
      }
      px(ctx, x, 2, '#e0be58');
    }
    vline(ctx, 4, 12, 15, '#8a6a2a');
  }

  function paintSeeds(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    const seedPos = [[6, 7], [9, 6], [7, 10], [10, 10], [5, 11], [11, 8], [8, 12]];
    seedPos.forEach(([x, y]) => {
      fill(ctx, x, y, 2, 2, '#8fae52');
      px(ctx, x, y, '#b9d478');
      px(ctx, x + 1, y + 1, '#6b8a3a');
    });
  }

  function paintPick(ctx, head, edge) {
    ctx.clearRect(0, 0, 16, 16);
    // 手柄
    for (let i = 0; i < 10; i++) px(ctx, 4 + i, 13 - i, '#8a5f38');
    for (let i = 0; i < 9; i++) px(ctx, 5 + i, 13 - i, '#6b4626');
    // 镐头
    ctx.strokeStyle = head; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(10, 5, 4, Math.PI * 0.95, Math.PI * 1.85); ctx.stroke();
    ctx.strokeStyle = edge; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(10, 5, 4.5, Math.PI * 0.95, Math.PI * 1.8); ctx.stroke();
    fill(ctx, 5, 3, 2, 2, head);
  }

  function paintAxe(ctx, head, edge) {
    ctx.clearRect(0, 0, 16, 16);
    for (let i = 0; i < 11; i++) px(ctx, 3 + i, 14 - i, '#8a5f38');
    for (let i = 0; i < 10; i++) px(ctx, 4 + i, 14 - i, '#6b4626');
    fill(ctx, 8, 2, 5, 7, head);
    fill(ctx, 9, 3, 3, 5, edge);
    fill(ctx, 12, 3, 2, 5, '#00000022');
    fill(ctx, 7, 4, 2, 3, head);
  }

  function paintSword(ctx, blade) {
    ctx.clearRect(0, 0, 16, 16);
    for (let i = 0; i < 9; i++) {
      fill(ctx, 10 - i, 2 + i, 2, 2, blade);
      px(ctx, 10 - i, 2 + i, '#f0f4f8');
    }
    fill(ctx, 5, 10, 2, 2, '#8a5f38');
    fill(ctx, 3, 12, 7, 2, '#c9a53f');
    fill(ctx, 2, 13, 3, 3, '#6b4626');
    px(ctx, 3, 14, '#8a5f38');
  }

  function paintMeat(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    ctx.fillStyle = '#c9605f';
    ctx.beginPath(); ctx.ellipse(8, 9, 5, 4.2, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#a84443';
    ctx.beginPath(); ctx.ellipse(9, 10, 3, 2.4, -0.3, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#e8d8c8';
    fill(ctx, 3, 12, 4, 2, '#e8d8c8');
    fill(ctx, 2, 13, 2, 2, '#f2e7d8');
    px(ctx, 6, 6, '#e88a86');
  }

  function paintWool(ctx) {
    ctx.clearRect(0, 0, 16, 16);
    fill(ctx, 2, 3, 12, 11, '#efefef');
    fill(ctx, 2, 3, 12, 2, '#ffffff');
    for (let k = 0; k < 16; k++) {
      const x = 2 + ((Math.random() * 12) | 0), y = 4 + ((Math.random() * 9) | 0);
      px(ctx, x, y, k % 2 ? '#d8d8d8' : '#fafafa');
    }
    fill(ctx, 2, 13, 12, 1, '#c8c8c8');
  }

  function paintHeart(ctx, kind) {
    ctx.clearRect(0, 0, 16, 16);
    const shape = [
      '..XX..XX..',
      '.XXXXXXXX.',
      'XXXXXXXXXX',
      'XXXXXXXXXX',
      'XXXXXXXXXX',
      '.XXXXXXXX.',
      '..XXXXXX..',
      '...XXXX...',
      '....XX....'
    ];
    const colors = kind === 'empty' ? ['#3d3d42', '#26262a'] : ['#e23c3c', '#ff6262'];
    for (let y = 0; y < shape.length; y++) {
      for (let x = 0; x < shape[y].length; x++) {
        if (shape[y][x] !== 'X') continue;
        if (kind === 'half' && x > 4) continue;
        ctx.fillStyle = y === 0 ? colors[1] : colors[0];
        ctx.fillRect(2 + x, 3 + y, 1, 1);
      }
    }
    if (kind === 'full' || kind === 'half') {
      px(ctx, 4, 5, 'rgba(255,255,255,0.7)');
      px(ctx, 3, 6, 'rgba(255,255,255,0.4)');
    }
  }

  function paintFood(ctx, kind) {
    ctx.clearRect(0, 0, 16, 16);
    const meat = kind === 'empty' ? ['#3d3d42', '#26262a'] : ['#b5622e', '#d98a4f'];
    // 鸡腿
    ctx.fillStyle = meat[0];
    ctx.beginPath(); ctx.ellipse(8, 6, 5, 4.2, 0, 0, Math.PI * 2); ctx.fill();
    fill(ctx, 6, 8, 4, 3, meat[0]);
    fill(ctx, 9, 10, 2, 4, '#e8e2d0');
    fill(ctx, 8, 12, 2, 2, '#f2ece0');
    if (kind !== 'empty') {
      fill(ctx, 5, 4, 3, 2, meat[1]);
      px(ctx, 6, 4, '#f0b07a');
    }
    if (kind === 'half') {
      fill(ctx, 0, 0, 8, 16, 'rgba(20,24,30,0.65)');
    }
  }

  function paintCrack(ctx, stage, seed) {
    ctx.clearRect(0, 0, 16, 16);
    const r = mulberry32(seed);
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 1;
    const branches = 2 + stage * 3;
    for (let b = 0; b < branches; b++) {
      let x = (r() * 16) | 0, y = (r() * 16) | 0;
      ctx.beginPath(); ctx.moveTo(x, y);
      for (let s = 0; s < 3 + stage; s++) {
        x += (r() * 5 | 0) - 2; y += (r() * 5 | 0) - 2;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  }

  // ---------- 逐格绘制 ----------
  at(TILES.stone, () => paintStone(actx, 11));
  at(TILES.dirt, () => paintDirt(actx, 22));
  at(TILES.grass_top, () => paintGrassTop(actx, 33));
  at(TILES.grass_side, () => paintGrassSide(actx, 44));
  at(TILES.sand, () => paintSand(actx, 55));
  at(TILES.log_side, () => paintLogSide(actx, 66));
  at(TILES.log_top, () => paintLogTop(actx, 67));
  at(TILES.leaves, () => paintLeaves(actx, 77));
  at(TILES.water, () => paintWater(actx, 88));
  at(TILES.planks, () => paintPlanks(actx, 99));
  at(TILES.glass, () => paintGlass(actx, 100));
  at(TILES.bedrock, () => paintBedrock(actx, 111));
  at(TILES.gravel, () => paintGravel(actx, 122));
  at(TILES.cobble, () => paintCobble(actx, 127));
  at(TILES.chest_top, () => paintChest(actx, 'top'));
  at(TILES.chest_side, () => paintChest(actx, 'side'));
  at(TILES.chest_front, () => paintChest(actx, 'front'));
  at(TILES.furnace_side, () => paintFurnace(actx, 'side', false));
  at(TILES.furnace_top, () => paintFurnace(actx, 'top', false));
  at(TILES.furnace_front, () => paintFurnace(actx, 'front', false));
  at(TILES.furnace_front_lit, () => paintFurnace(actx, 'front', true));
  at(TILES.wood_hoe, () => paintHoe(actx, '#b58b5a', '#cfa877'));
  at(TILES.stone_hoe, () => paintHoe(actx, '#9a9a9a', '#bdbdbd'));
  at(TILES.iron_hoe, () => paintHoe(actx, '#d8dde4', '#f2f5f8'));
  at(TILES.cooked_meat, () => paintCookedMeat(actx));
  at(TILES.coal_ore, () => paintOre(actx, 133, ['#262626', '#4a4a4a', '#151515']));
  at(TILES.iron_ore, () => paintOre(actx, 144, ['#c8a27a', '#e0c0a0', '#a07f5a']));
  at(TILES.diamond_ore, () => paintOre(actx, 155, ['#4fd8d0', '#9ff5ef', '#2fa9a2']));
  at(TILES.farmland, () => paintFarmland(actx, 166, false));
  at(TILES.farmland_wet, () => paintFarmland(actx, 177, true));
  at(TILES.wheat0, () => paintWheat(actx, 188, 0));
  at(TILES.wheat1, () => paintWheat(actx, 199, 1));
  at(TILES.wheat2, () => paintWheat(actx, 210, 2));
  at(TILES.wheat3, () => paintWheat(actx, 221, 3));
  at(TILES.torch, () => paintTorch(actx));
  at(TILES.sapling, () => paintSapling(actx, 233));
  at(TILES.flower_red, () => paintFlower(actx, '#d24a4a', '#ffd76a', 244));
  at(TILES.flower_yellow, () => paintFlower(actx, '#e8c93f', '#ffef9a', 255));
  at(TILES.tall_grass, () => paintTallGrass(actx, 266));
  at(TILES.bed_top, () => paintBed(actx, true));
  at(TILES.bed_side, () => paintBed(actx, false));
  at(TILES.crafting_top, () => paintCrafting(actx));
  at(TILES.crafting_side, () => paintCraftingSide(actx));
  at(TILES.anvil, () => paintAnvil(actx));
  at(TILES.bookshelf, () => paintBookshelf(actx));
  at(TILES.fire, () => paintFire(actx, 7));
  at(TILES.emerald, () => paintEmerald(actx));
  at(TILES.diamond, () => paintDiamond(actx));
  at(TILES.coal, () => paintCoal(actx));
  at(TILES.iron_ingot, () => paintIngot(actx));
  at(TILES.stick, () => paintStick(actx));
  at(TILES.apple, () => paintApple(actx));
  at(TILES.bread, () => paintBread(actx));
  at(TILES.wheat_item, () => paintWheatItem(actx));
  at(TILES.seeds, () => paintSeeds(actx));
  at(TILES.wood_pick, () => paintPick(actx, '#b58b5a', '#cfa877'));
  at(TILES.stone_pick, () => paintPick(actx, '#9a9a9a', '#bdbdbd'));
  at(TILES.iron_pick, () => paintPick(actx, '#d8dde4', '#f2f5f8'));
  at(TILES.wood_axe, () => paintAxe(actx, '#b58b5a', '#cfa877'));
  at(TILES.stone_axe, () => paintAxe(actx, '#9a9a9a', '#bdbdbd'));
  at(TILES.iron_axe, () => paintAxe(actx, '#d8dde4', '#f2f5f8'));
  at(TILES.sword, () => paintSword(actx, '#d8dde4'));
  at(TILES.meat, () => paintMeat(actx));
  at(TILES.wool, () => paintWool(actx));
  at(TILES.heart_full, () => paintHeart(actx, 'full'));
  at(TILES.heart_half, () => paintHeart(actx, 'half'));
  at(TILES.heart_empty, () => paintHeart(actx, 'empty'));
  at(TILES.food_full, () => paintFood(actx, 'full'));
  at(TILES.food_half, () => paintFood(actx, 'half'));
  at(TILES.food_empty, () => paintFood(actx, 'empty'));
  for (let i = 0; i < 4; i++) at(TILES['crack' + i], () => paintCrack(actx, i, 900 + i));

  // ---------- 取出每格小画布（供图标合成） ----------
  const tileCanvases = TILE_NAMES.map((name, i) => {
    const c = makeCanvas(TS, TS);
    const cx = c.getContext('2d');
    cx.imageSmoothingEnabled = false;
    cx.drawImage(atlas, (i % GRID) * TS, Math.floor(i / GRID) * TS, TS, TS, 0, 0, TS, TS);
    return c;
  });

  const atlasTexture = new THREE.CanvasTexture(atlas);
  atlasTexture.magFilter = THREE.NearestFilter;
  atlasTexture.minFilter = THREE.NearestFilter;
  atlasTexture.generateMipmaps = false;
  atlasTexture.colorSpace = THREE.SRGBColorSpace;
  atlasTexture.needsUpdate = true;

  // ---------- 图标生成 ----------
  const iconCache = {};
  function tileOfBlock(id) {
    const def = MC.BLOCKS[id];
    if (!def) return 0;
    if (def.render === 'cube') return def.tiles.side !== undefined ? def.tiles.side : def.tiles.all;
    return def.tiles.all;
  }

  function drawFlatIcon(ctx, tileIdx, size, ox, oy) {
    ctx.imageSmoothingEnabled = false;
    const t = tileCanvases[tileIdx];
    if (!t) return;
    ctx.drawImage(t, 0, 0, TS, TS, ox, oy, size, size);
  }

  function makeIcon(id) {
    if (iconCache[id]) return iconCache[id];
    const c = makeCanvas(64, 64);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingEnabled = false;
    const block = MC.BLOCKS[id];
    const item = MC.ITEMS[id];
    if (block && block.render === 'cube') {
      const topIdx = block.tiles.top !== undefined ? block.tiles.top : (block.tiles.all !== undefined ? block.tiles.all : block.tiles.side);
      const sideIdx = block.tiles.side !== undefined ? block.tiles.side : block.tiles.all;
      const top = tileCanvases[topIdx], side = tileCanvases[sideIdx];
      const drawFace = (tile, m, shade) => {
        ctx.save();
        ctx.setTransform(m[0], m[1], m[2], m[3], m[4], m[5]);
        ctx.drawImage(tile, 0, 0);
        if (shade > 0) {
          ctx.fillStyle = `rgba(0,0,0,${shade})`;
          ctx.fillRect(0, 0, 16, 16);
        }
        ctx.restore();
      };
      // 等距立方体：顶面菱形 + 左面 + 右面（64x64 画布，贴图为 16x16 单位）
      drawFace(top, [1.75, 0.875, 1.75, -0.875, 4, 18], 0);
      drawFace(side, [1.75, 0.875, 0, 2, 4, 18], 0.2);
      drawFace(side, [1.75, -0.875, 0, 2, 32, 32], 0.34);
    } else if (block) {
      // 十字/液体类方块：平铺
      drawFlatIcon(ctx, block.tiles.all, 64, 0, 0);
    } else if (item) {
      drawFlatIcon(ctx, item.tile, 64, 0, 0);
    }
    const url = c.toDataURL();
    iconCache[id] = url;
    return url;
  }

  function makeRawIcon(tileName) {
    const key = 'raw:' + tileName;
    if (iconCache[key]) return iconCache[key];
    const c = makeCanvas(48, 48);
    drawFlatIcon(c.getContext('2d'), TILES[tileName], 48, 0, 0);
    const url = c.toDataURL();
    iconCache[key] = url;
    return url;
  }

  // ---------- 环境贴图 ----------
  const env = {};
  function buildEnvTextures() {
    // 太阳
    const sun = makeCanvas(64, 64), sc = sun.getContext('2d');
    const g = sc.createRadialGradient(32, 32, 4, 32, 32, 31);
    g.addColorStop(0, 'rgba(255,252,220,1)');
    g.addColorStop(0.45, 'rgba(255,226,130,0.95)');
    g.addColorStop(1, 'rgba(255,190,60,0)');
    sc.fillStyle = g; sc.fillRect(0, 0, 64, 64);
    env.sun = new THREE.CanvasTexture(sun); env.sun.colorSpace = THREE.SRGBColorSpace;

    // 月亮
    const moon = makeCanvas(64, 64), mc = moon.getContext('2d');
    mc.fillStyle = '#dfe6ee'; mc.beginPath(); mc.arc(32, 32, 22, 0, Math.PI * 2); mc.fill();
    mc.fillStyle = '#b9c3ce';
    [[24, 24, 6], [40, 38, 7], [38, 22, 4], [22, 40, 4]].forEach(([x, y, r]) => {
      mc.beginPath(); mc.arc(x, y, r, 0, Math.PI * 2); mc.fill();
    });
    env.moon = new THREE.CanvasTexture(moon); env.moon.colorSpace = THREE.SRGBColorSpace;

    // 云
    const cloud = makeCanvas(256, 256), cc = cloud.getContext('2d');
    const r = mulberry32(4242);
    cc.clearRect(0, 0, 256, 256);
    for (let k = 0; k < 90; k++) {
      const x = r() * 256, y = r() * 256;
      const px = Math.floor(x / 4) * 4, py = Math.floor(y / 4) * 4;
      const w = 16 + r() * 44, h = 10 + r() * 24;
      cc.fillStyle = `rgba(255,255,255,${0.5 + r() * 0.4})`;
      cc.fillRect(px, py, w, h);
    }
    // 让云有边缘柔化前的像素感
    env.cloud = new THREE.CanvasTexture(cloud);
    env.cloud.wrapS = env.cloud.wrapT = THREE.RepeatWrapping;
    env.cloud.magFilter = THREE.LinearFilter;
    env.cloud.minFilter = THREE.LinearMipmapLinearFilter;
    env.cloud.generateMipmaps = true;

    // 星星
    const star = makeCanvas(16, 16), stc = star.getContext('2d');
    stc.fillStyle = '#fff'; stc.fillRect(7, 7, 2, 2);
    stc.fillStyle = 'rgba(255,255,255,0.5)'; stc.fillRect(6, 6, 4, 4);
    env.star = new THREE.CanvasTexture(star);

    // 雨滴
    const rain = makeCanvas(4, 16), rc = rain.getContext('2d');
    rc.fillStyle = 'rgba(180,210,255,0.75)'; rc.fillRect(1, 0, 2, 16);
    env.rain = new THREE.CanvasTexture(rain);

    // 粒子（方块碎屑）用白色小方块
    const p = makeCanvas(4, 4), pc = p.getContext('2d');
    pc.fillStyle = '#fff'; pc.fillRect(0, 0, 4, 4);
    env.particle = new THREE.CanvasTexture(p);
    return env;
  }

  // 导出
  MC.TILES = TILES;
  MC.TILE_NAMES = TILE_NAMES;
  MC.atlas = atlas;
  MC.tileCanvases = tileCanvases;
  MC.atlasTexture = atlasTexture;
  MC.makeIcon = makeIcon;
  MC.makeRawIcon = makeRawIcon;
  MC.icon = makeIcon;
  MC.env = buildEnvTextures();
  MC.iconTile = (name) => TILES[name];

  // 预生成基础图标，避免首次打开背包卡顿
  MC.warmIcons = function () {
    const ids = new Set();
    Object.keys(MC.BLOCKS).forEach(k => ids.add(+k));
    Object.keys(MC.ITEMS).forEach(k => ids.add(+k));
    ids.forEach(id => { try { makeIcon(id); } catch (e) { /* 忽略 */ } });
  };
})();
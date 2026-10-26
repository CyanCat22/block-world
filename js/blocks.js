/* =========================================================
 *  blocks.js — 方块 / 物品 / 合成 定义
 * =======================================================*/
(function () {
  'use strict';
  const T = (n) => MC.TILES[n];

  const B = {
    AIR: 0, STONE: 1, GRASS: 2, DIRT: 3, COBBLE: 4, LOG: 5, LEAVES: 6, SAND: 7,
    WATER: 8, PLANKS: 9, GLASS: 10, BEDROCK: 11, GRAVEL: 12, COAL_ORE: 13,
    IRON_ORE: 14, DIAMOND_ORE: 15, FARMLAND: 16, FARMLAND_WET: 17, WHEAT0: 18,
    WHEAT1: 19, WHEAT2: 20, WHEAT3: 21, TORCH: 22, SAPLING: 23, FLOWER_RED: 24,
    FLOWER_YELLOW: 25, TALL_GRASS: 26, BED: 27, CRAFTING: 28, ANVIL: 29,
    BOOKSHELF: 30, FIRE: 31, CHEST: 32, FURNACE: 33, FURNACE_LIT: 34
  };

  const BLOCKS = {};

  function block(id, def) {
    def.id = id;
    def.render = def.render || 'cube';
    def.solid = def.solid !== undefined ? def.solid : def.render === 'cube';
    def.opaque = def.opaque !== undefined ? def.opaque : def.render === 'cube';
    def.hardness = def.hardness !== undefined ? def.hardness : 1;
    def.tool = def.tool || null;
    def.liquid = def.liquid || false;
    def.flammable = def.flammable || false;
    def.light = def.light || 0;
    def.replaceable = def.replaceable || false;
    BLOCKS[id] = def;
    return def;
  }

  block(B.AIR, { key: 'air', label: '空气', render: 'none', solid: false, opaque: false, replaceable: true, tiles: {} });

  block(B.STONE, { key: 'stone', label: '石头', tiles: { all: T('stone') }, hardness: 1.8, tool: 'pickaxe', drop: B.COBBLE });
  block(B.GRASS, {
    key: 'grass', label: '草方块', tiles: { top: T('grass_top'), bottom: T('dirt'), side: T('grass_side') },
    hardness: 0.75, tool: 'shovel', drop: B.DIRT
  });
  block(B.DIRT, { key: 'dirt', label: '泥土', tiles: { all: T('dirt') }, hardness: 0.6, tool: 'shovel', drop: B.DIRT });
  block(B.COBBLE, { key: 'cobble', label: '圆石', tiles: { all: T('cobble') }, hardness: 2.0, tool: 'pickaxe', drop: B.COBBLE });
  block(B.LOG, {
    key: 'log', label: '橡木原木', tiles: { top: T('log_top'), bottom: T('log_top'), side: T('log_side') },
    hardness: 2.0, tool: 'axe', drop: B.LOG, flammable: true
  });
  block(B.LEAVES, {
    key: 'leaves', label: '橡木树叶', tiles: { all: T('leaves') }, hardness: 0.3,
    tool: 'axe', drop: null, flammable: true
  });
  block(B.SAND, { key: 'sand', label: '沙子', tiles: { all: T('sand') }, hardness: 0.55, tool: 'shovel', drop: B.SAND });
  block(B.WATER, {
    key: 'water', label: '水', tiles: { all: T('water') }, render: 'liquid', solid: false,
    opaque: false, hardness: Infinity, liquid: true, replaceable: true
  });
  block(B.PLANKS, { key: 'planks', label: '橡木木板', tiles: { all: T('planks') }, hardness: 2.0, tool: 'axe', drop: B.PLANKS, flammable: true });
  block(B.GLASS, { key: 'glass', label: '玻璃', tiles: { all: T('glass') }, hardness: 0.35, opaque: false, drop: null });
  block(B.BEDROCK, { key: 'bedrock', label: '基岩', tiles: { all: T('bedrock') }, hardness: Infinity, tool: 'pickaxe' });
  block(B.GRAVEL, { key: 'gravel', label: '砂砾', tiles: { all: T('gravel') }, hardness: 0.65, tool: 'shovel', drop: B.GRAVEL });
  block(B.COAL_ORE, { key: 'coal_ore', label: '煤矿石', tiles: { all: T('coal_ore') }, hardness: 3.0, tool: 'pickaxe', drop: 100 + 6 });
  block(B.IRON_ORE, { key: 'iron_ore', label: '铁矿石', tiles: { all: T('iron_ore') }, hardness: 3.2, tool: 'pickaxe', drop: B.IRON_ORE });
  block(B.DIAMOND_ORE, { key: 'diamond_ore', label: '钻石矿石', tiles: { all: T('diamond_ore') }, hardness: 4.2, tool: 'pickaxe', drop: 100 + 8 });
  block(B.FARMLAND, { key: 'farmland', label: '耕地', tiles: { top: T('farmland'), bottom: T('dirt'), side: T('dirt') }, hardness: 0.6, tool: 'shovel', drop: B.DIRT });
  block(B.FARMLAND_WET, { key: 'farmland_wet', label: '湿润耕地', tiles: { top: T('farmland_wet'), bottom: T('dirt'), side: T('dirt') }, hardness: 0.6, tool: 'shovel', drop: B.DIRT });
  block(B.WHEAT0, { key: 'wheat0', label: '小麦', tiles: { all: T('wheat0') }, render: 'cross', hardness: 0.02, drop: null, replaceable: false });
  block(B.WHEAT1, { key: 'wheat1', label: '小麦', tiles: { all: T('wheat1') }, render: 'cross', hardness: 0.02, drop: null });
  block(B.WHEAT2, { key: 'wheat2', label: '小麦', tiles: { all: T('wheat2') }, render: 'cross', hardness: 0.02, drop: null });
  block(B.WHEAT3, { key: 'wheat3', label: '小麦', tiles: { all: T('wheat3') }, render: 'cross', hardness: 0.02, drop: null });
  block(B.TORCH, {
    key: 'torch', label: '火把', tiles: { all: T('torch') }, render: 'cross', light: 14,
    hardness: 0.01, glow: true
  });
  block(B.SAPLING, { key: 'sapling', label: '橡树树苗', tiles: { all: T('sapling') }, render: 'cross', hardness: 0.01, drop: B.SAPLING });
  block(B.FLOWER_RED, { key: 'flower_red', label: '虞美人', tiles: { all: T('flower_red') }, render: 'cross', hardness: 0.01, drop: B.FLOWER_RED, replaceable: true });
  block(B.FLOWER_YELLOW, { key: 'flower_yellow', label: '蒲公英', tiles: { all: T('flower_yellow') }, render: 'cross', hardness: 0.01, drop: B.FLOWER_YELLOW, replaceable: true });
  block(B.TALL_GRASS, { key: 'tall_grass', label: '草丛', tiles: { all: T('tall_grass') }, render: 'cross', hardness: 0.01, drop: null, replaceable: true, flammable: true });
  block(B.BED, {
    key: 'bed', label: '床', tiles: { top: T('bed_top'), bottom: T('planks'), side: T('bed_side') },
    hardness: 0.3, tool: 'axe', drop: B.BED, flammable: true
  });
  block(B.CRAFTING, {
    key: 'crafting', label: '工作台', tiles: { top: T('crafting_top'), bottom: T('planks'), side: T('crafting_side') },
    hardness: 2.4, tool: 'axe', drop: B.CRAFTING, flammable: true
  });
  block(B.ANVIL, { key: 'anvil', label: '铁砧', tiles: { all: T('anvil') }, hardness: 5.0, tool: 'pickaxe', drop: B.ANVIL });
  block(B.BOOKSHELF, { key: 'bookshelf', label: '书架', tiles: { top: T('planks'), bottom: T('planks'), side: T('bookshelf') }, hardness: 1.6, tool: 'axe', drop: B.BOOKSHELF, flammable: true });
  block(B.CHEST, {
    key: 'chest', label: '箱子', tiles: { top: T('chest_top'), bottom: T('chest_top'), side: T('chest_side'), front: T('chest_front') },
    hardness: 1.2, tool: 'axe', drop: B.CHEST, flammable: true
  });
  block(B.FURNACE, {
    key: 'furnace', label: '熔炉', tiles: { top: T('furnace_top'), bottom: T('furnace_top'), side: T('furnace_side'), front: T('furnace_front') },
    hardness: 2.4, tool: 'pickaxe', drop: B.FURNACE
  });
  block(B.FURNACE_LIT, {
    key: 'furnace_lit', label: '熔炉', tiles: { top: T('furnace_top'), bottom: T('furnace_top'), side: T('furnace_side'), front: T('furnace_front_lit') },
    hardness: 2.4, tool: 'pickaxe', drop: B.FURNACE, light: 0.8
  });

  block(B.FIRE, { key: 'fire', label: '火焰', tiles: { all: T('fire') }, render: 'cross', hardness: 0.01, drop: null, glow: true, replaceable: true });

  // ---------------- 物品 ----------------
  const I = {
    STICK: 100, APPLE: 101, BREAD: 102, WHEAT: 103, SEEDS: 104, EMERALD: 105,
    COAL: 106, IRON_INGOT: 107, DIAMOND: 108, WOOL: 109, MEAT: 110,
    WOOD_PICK: 111, STONE_PICK: 112, IRON_PICK: 113,
    WOOD_AXE: 114, STONE_AXE: 115, IRON_AXE: 116,
    WOOD_SWORD: 117, STONE_SWORD: 118, IRON_SWORD: 119,
    WOOD_HOE: 120, STONE_HOE: 121, IRON_HOE: 122, COOKED_MEAT: 123
  };

  const ITEMS = {};
  function item(id, def) {
    def.id = id;
    ITEMS[id] = def;
    return def;
  }
  item(I.STICK, { key: 'stick', label: '木棍', tile: T('stick') });
  item(I.APPLE, { key: 'apple', label: '苹果', tile: T('apple'), food: 4 });
  item(I.BREAD, { key: 'bread', label: '面包', tile: T('bread'), food: 6 });
  item(I.WHEAT, { key: 'wheat_item', label: '小麦', tile: T('wheat_item') });
  item(I.SEEDS, { key: 'seeds', label: '小麦种子', tile: T('seeds'), plant: B.WHEAT0 });
  item(I.EMERALD, { key: 'emerald', label: '绿宝石', tile: T('emerald') });
  item(I.COAL, { key: 'coal', label: '煤炭', tile: T('coal') });
  item(I.IRON_INGOT, { key: 'iron_ingot', label: '铁锭', tile: T('iron_ingot') });
  item(I.DIAMOND, { key: 'diamond', label: '钻石', tile: T('diamond') });
  item(I.WOOL, { key: 'wool', label: '羊毛', tile: T('wool') });
  item(I.MEAT, { key: 'meat', label: '生肉', tile: T('meat'), food: 3 });
  item(I.COOKED_MEAT, { key: 'cooked_meat', label: '熟肉', tile: T('cooked_meat'), food: 8 });
  item(I.WOOD_PICK, { key: 'wood_pick', label: '木镐', tile: T('wood_pick'), tool: 'pickaxe', speed: 2.6, damage: 2 });
  item(I.STONE_PICK, { key: 'stone_pick', label: '石镐', tile: T('stone_pick'), tool: 'pickaxe', speed: 4.2, damage: 3 });
  item(I.IRON_PICK, { key: 'iron_pick', label: '铁镐', tile: T('iron_pick'), tool: 'pickaxe', speed: 7.0, damage: 4 });
  item(I.WOOD_AXE, { key: 'wood_axe', label: '木斧', tile: T('wood_axe'), tool: 'axe', speed: 2.6, damage: 3 });
  item(I.STONE_AXE, { key: 'stone_axe', label: '石斧', tile: T('stone_axe'), tool: 'axe', speed: 4.2, damage: 4 });
  item(I.IRON_AXE, { key: 'iron_axe', label: '铁斧', tile: T('iron_axe'), tool: 'axe', speed: 7.0, damage: 5 });
  item(I.WOOD_SWORD, { key: 'wood_sword', label: '木剑', tile: T('sword'), damage: 4, sword: true });
  item(I.STONE_SWORD, { key: 'stone_sword', label: '石剑', tile: T('sword'), damage: 5, sword: true });
  item(I.IRON_SWORD, { key: 'iron_sword', label: '铁剑', tile: T('sword'), damage: 6, sword: true });
  item(I.WOOD_HOE, { key: 'wood_hoe', label: '木锄', tile: T('wood_hoe'), tool: 'hoe', speed: 2, damage: 1 });
  item(I.STONE_HOE, { key: 'stone_hoe', label: '石锄', tile: T('stone_hoe'), tool: 'hoe', speed: 3, damage: 1 });
  item(I.IRON_HOE, { key: 'iron_hoe', label: '铁锄', tile: T('iron_hoe'), tool: 'hoe', speed: 5, damage: 2 });

  // ---------------- 合成 ----------------
  const RECIPES = [
    { out: { id: B.PLANKS, count: 4 }, cost: [{ id: B.LOG, count: 1 }] },
    { out: { id: I.STICK, count: 4 }, cost: [{ id: B.PLANKS, count: 2 }] },
    { out: { id: B.CRAFTING, count: 1 }, cost: [{ id: B.PLANKS, count: 4 }] },
    { out: { id: B.TORCH, count: 4 }, cost: [{ id: I.COAL, count: 1 }, { id: I.STICK, count: 1 }] },
    { out: { id: I.WOOD_PICK, count: 1 }, cost: [{ id: B.PLANKS, count: 3 }, { id: I.STICK, count: 2 }] },
    { out: { id: I.WOOD_AXE, count: 1 }, cost: [{ id: B.PLANKS, count: 2 }, { id: I.STICK, count: 2 }] },
    { out: { id: I.WOOD_SWORD, count: 1 }, cost: [{ id: B.PLANKS, count: 2 }, { id: I.STICK, count: 1 }] },
    { out: { id: I.STONE_PICK, count: 1 }, cost: [{ id: B.COBBLE, count: 3 }, { id: I.STICK, count: 2 }] },
    { out: { id: I.STONE_AXE, count: 1 }, cost: [{ id: B.COBBLE, count: 2 }, { id: I.STICK, count: 2 }] },
    { out: { id: I.STONE_SWORD, count: 1 }, cost: [{ id: B.COBBLE, count: 2 }, { id: I.STICK, count: 1 }] },
    { out: { id: I.IRON_PICK, count: 1 }, cost: [{ id: I.IRON_INGOT, count: 3 }, { id: I.STICK, count: 2 }] },
    { out: { id: I.IRON_AXE, count: 1 }, cost: [{ id: I.IRON_INGOT, count: 2 }, { id: I.STICK, count: 2 }] },
    { out: { id: I.IRON_SWORD, count: 1 }, cost: [{ id: I.IRON_INGOT, count: 2 }, { id: I.STICK, count: 1 }] },
    { out: { id: I.WOOD_HOE, count: 1 }, cost: [{ id: B.PLANKS, count: 2 }, { id: I.STICK, count: 2 }] },
    { out: { id: I.STONE_HOE, count: 1 }, cost: [{ id: B.COBBLE, count: 2 }, { id: I.STICK, count: 2 }] },
    { out: { id: I.IRON_HOE, count: 1 }, cost: [{ id: I.IRON_INGOT, count: 2 }, { id: I.STICK, count: 2 }] },
    { out: { id: B.CHEST, count: 1 }, cost: [{ id: B.PLANKS, count: 8 }] },
    { out: { id: B.FURNACE, count: 1 }, cost: [{ id: B.COBBLE, count: 8 }] },
    { out: { id: I.BREAD, count: 1 }, cost: [{ id: I.WHEAT, count: 3 }] },
    { out: { id: B.BED, count: 1 }, cost: [{ id: I.WOOL, count: 3 }, { id: B.PLANKS, count: 3 }] },
    { out: { id: B.BOOKSHELF, count: 1 }, cost: [{ id: B.PLANKS, count: 6 }] }
  ];

  // ---------------- 查询工具 ----------------
  function defOf(id) { return BLOCKS[id] || ITEMS[id] || null; }
  function labelOf(id) {
    const d = defOf(id);
    return d ? d.label : '未知物品';
  }
  function isSolid(id) { const d = BLOCKS[id]; return !!(d && d.solid); }
  function isOpaque(id) { const d = BLOCKS[id]; return !!(d && d.opaque); }
  function isLiquid(id) { const d = BLOCKS[id]; return !!(d && d.liquid); }
  function isPlaceable(id) { const d = BLOCKS[id]; return !!(d && id !== B.WATER && d.render !== 'none'); }
  function isCross(id) { const d = BLOCKS[id]; return !!(d && d.render === 'cross'); }
  function isGlow(id) { const d = BLOCKS[id]; return !!(d && d.glow); }
  function isPlant(id) {
    return id === B.SAPLING || id === B.FLOWER_RED || id === B.FLOWER_YELLOW ||
      id === B.TALL_GRASS || (id >= B.WHEAT0 && id <= B.WHEAT3);
  }
  function isCrop(id) { return id >= B.WHEAT0 && id <= B.WHEAT3; }

  function breakTime(blockId, heldId) {
    const d = BLOCKS[blockId];
    if (!d) return 0.1;
    if (!isFinite(d.hardness)) return Infinity;
    let speed = 1;
    const tool = ITEMS[heldId];
    if (tool && d.tool && tool.tool === d.tool) speed = tool.speed || 2;
    else if (tool && tool.sword && d.flammable) speed = 1.5;
    return Math.max(0.05, d.hardness / speed);
  }

  // 掉落规则（返回 [{id,count}]，概率项已展开）
  function dropsFor(blockId, rand) {
    const d = BLOCKS[blockId];
    if (!d) return [];
    if (blockId === B.LEAVES) {
      return rand && rand() < 0.22 ? [{ id: B.SAPLING, count: 1 }] : [];
    }
    if (blockId === B.WHEAT3) return [{ id: I.WHEAT, count: 2 }, { id: I.SEEDS, count: 1 }];
    if (blockId >= B.WHEAT0 && blockId <= B.WHEAT2) return [{ id: I.SEEDS, count: 1 }];
    if (blockId === B.TALL_GRASS) return rand && rand() < 0.25 ? [{ id: I.SEEDS, count: 1 }] : [];
    if (blockId === B.FARMLAND || blockId === B.FARMLAND_WET) return [{ id: B.DIRT, count: 1 }];
    if (blockId === B.GRASS) return [{ id: B.DIRT, count: 1 }];
    if (blockId === B.STONE) return [{ id: B.COBBLE, count: 1 }];
    if (blockId === B.COAL_ORE) return [{ id: I.COAL, count: 1 }];
    if (blockId === B.IRON_ORE) return [{ id: B.IRON_ORE, count: 1 }];
    if (blockId === B.DIAMOND_ORE) return [{ id: I.DIAMOND, count: 1 }];
    if (blockId === B.FIRE) return [];
    if (blockId === B.CHEST) return [{ id: B.CHEST, count: 1 }];
    if (blockId === B.FURNACE || blockId === B.FURNACE_LIT) return [{ id: B.FURNACE, count: 1 }];
    if (d.drop === null) return [];
    if (d.drop !== undefined) return [{ id: d.drop, count: 1 }];
    return [{ id: blockId, count: 1 }];
  }

  const SMELT = {
    [B.IRON_ORE]: { out: I.IRON_INGOT, time: 8 },
    [B.SAND]: { out: B.GLASS, time: 6 },
    [I.MEAT]: { out: I.COOKED_MEAT, time: 6 }
  };
  const FUELS = {
    [I.COAL]: 20,
    [B.LOG]: 12,
    [B.PLANKS]: 8,
    [I.STICK]: 4
  };

  MC.B = B;
  MC.I = I;
  MC.SMELT = SMELT;
  MC.FUELS = FUELS;
  MC.smeltOf = (id) => SMELT[id] || null;
  MC.fuelOf = (id) => FUELS[id] || 0;
  MC.BLOCKS = BLOCKS;
  MC.ITEMS = ITEMS;
  MC.RECIPES = RECIPES;
  MC.defOf = defOf;
  MC.labelOf = labelOf;
  MC.isSolid = isSolid;
  MC.isOpaque = isOpaque;
  MC.isLiquid = isLiquid;
  MC.isPlaceable = isPlaceable;
  MC.isCross = isCross;
  MC.isGlow = isGlow;
  MC.isPlant = isPlant;
  MC.isCrop = isCrop;
  MC.breakTime = breakTime;
  MC.dropsFor = dropsFor;
})();
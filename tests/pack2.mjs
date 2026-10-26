// 生存闭环包验收：锄头种田/箱子/熔炉/动物繁殖
import { puppeteer, CHROME, PAGE_URL, DIST_URL, TEST_HTML_URL } from './helpers/browser.mjs';
const browser = await puppeteer.launch({
  executablePath: CHROME, headless: 'new',
  args: ['--headless=new', '--no-sandbox', '--disable-setuid-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--window-size=1100,720'],
  defaultViewport: { width: 1100, height: 720 }
});
const page = await browser.newPage();
const errs = [];
page.on('pageerror', e => errs.push(e.message));
page.on('console', m => { if (m.type() === 'error') errs.push('console:' + m.text()); });
await page.goto(PAGE_URL, { waitUntil: 'load' });
await page.waitForFunction('window.__MC_READY === true');
await page.evaluate(() => { localStorage.removeItem('mc_sandbox_save_v1'); localStorage.removeItem('mc_settings_v1'); document.getElementById('seed-input').value = '20261022'; document.getElementById('btn-start').click(); });
await page.waitForFunction('window.__game && window.__game.started === true', { timeout: 60000 });
await new Promise(r => setTimeout(r, 1800));
const R = {};

// ---- 锄头开荒 ----
R.hoe = await page.evaluate(() => {
  const g = window.__game, p = g.player, w = g.world, B = MC.B;
  const px = Math.floor(p.pos.x), pz = Math.floor(p.pos.z);
  const bx = px + 2, bz = pz;
  const by = Math.floor(p.pos.y + 1.62);   // 与眼睛同高的方块层
  // 清出目标位置和通道，放草方块
  for (let dx = 0; dx <= 2; dx++) for (let dy = 0; dy < 3; dy++) w.setBlock(px + dx, by + dy, bz, B.AIR);
  w.setBlock(bx, by, bz, B.GRASS);
  p.items.set(MC.I.IRON_HOE, 1);
  p.hotbar[0] = MC.I.IRON_HOE; p.selectSlot(0);
  p.pos.set(px + 0.5, by - 1.6, pz + 0.5);
  p.yaw = -Math.PI / 2; p.pitch = 0; p.updateCamera(g.camera);
  const dbg = { pos: p.pos.toArray().map(n => +n.toFixed(2)), pitch: p.pitch, yaw: +p.yaw.toFixed(2), camRot: [ +g.camera.rotation.x.toFixed(2), +g.camera.rotation.y.toFixed(2) ] };
  const target = p.getTargetBlock();
  const used = p.useHeld({ mouseRight: true });
  const after = w.getBlock(bx, by, bz);
  // 种上种子
  p.items.set(MC.I.SEEDS, 3); p.hotbar[1] = MC.I.SEEDS; p.selectSlot(1);
  p.pos.set(bx + 0.5, by + 1.02, bz + 0.5);
  p.pitch = -1.5; p.updateCamera(g.camera);
  const seedTarget = p.getTargetBlock();
  const planted = p.useHeld({ mouseRight: true });
  return {
    dbg,
    eye: p.getEyePos().toArray().map(n => +n.toFixed(2)),
    dir: p.getLookDir().toArray().map(n => +n.toFixed(2)),
    reach: p.reach,
    sandbox: [bx, by, bz], placedId: w.getBlock(bx, by, bz),
    ray2: (() => { const r = w.raycast(p.getEyePos(), p.getLookDir(), 4.5); return r ? [r.x, r.y, r.z, r.id] : null; })(),
    targetId: target ? target.id : null, used, after,
    isFarmland: after === B.FARMLAND,
    seedTargetId: seedTarget ? seedTarget.id : null, planted,
    crop: w.getBlock(bx, by + 1, bz),
    isCrop: w.getBlock(bx, by + 1, bz) >= B.WHEAT0 && w.getBlock(bx, by + 1, bz) <= B.WHEAT3
  };
});

// ---- 箱子 ----
R.chest = await page.evaluate(() => {
  const g = window.__game, p = g.player, w = g.world, B = MC.B;
  const px = Math.floor(p.pos.x) + 3, pz = Math.floor(p.pos.z) + 3;
  const py = w.surfaceY(px, pz) + 1;
  w.setBlock(px, py, pz, B.CHEST);
  g.onBlockPlaced(B.CHEST, px, py, pz);
  const key = px + ',' + py + ',' + pz;
  p.items.set(MC.I.IRON_INGOT, 5);
  p.items.set(B.PLANKS, 12);
  g.openChest({ x: px, y: py, z: pz });
  const visible = !document.getElementById('chest-screen').classList.contains('hidden');
  const cells = document.querySelectorAll('#chest-grid .item-cell').length;
  g.ui.chestPutAll();
  const stored = (g.chests.get(key) || []).filter(Boolean).map(s => MC.labelOf(s.id) + 'x' + s.count);
  const invEmpty = p.countOf(MC.I.IRON_INGOT) === 0;
  g.ui.chestTakeAll();
  const restored = p.countOf(MC.I.IRON_INGOT) + p.countOf(B.PLANKS);
  // 关闭
  g.closeModal();
  const closed = document.getElementById('chest-screen').classList.contains('hidden');
  // 再存一次，测试破坏箱子掉落
  p.items.set(B.PLANKS, 4);
  g.ui.openChest(key);
  g.ui.chestPutAll();
  const before = (g.chests.get(key) || []).filter(Boolean).length;
  g.player.breakBlock({ x: px, y: py, z: pz, id: B.CHEST });
  return { visible, cells, stored, invEmpty, restored, closed, before, spilled: p.countOf(B.PLANKS), chestGone: !g.chests.has(key), block: w.getBlock(px, py, pz) };
});

// ---- 熔炉 ----
R.furnace = await page.evaluate(async () => {
  const g = window.__game, p = g.player, w = g.world, B = MC.B;
  const px = Math.floor(p.pos.x) - 3, pz = Math.floor(p.pos.z) + 3;
  const py = w.surfaceY(px, pz) + 1;
  w.setBlock(px, py, pz, B.FURNACE);
  g.onBlockPlaced(B.FURNACE, px, py, pz);
  const key = px + ',' + py + ',' + pz;
  g.openFurnace({ x: px, y: py, z: pz });
  const st = g.furnaces.get(key);
  st.input = { id: B.IRON_ORE, count: 2 };
  st.fuel = { id: MC.I.COAL, count: 1 };
  const visible = !document.getElementById('furnace-screen').classList.contains('hidden');
  // 手动推进 9 秒
  for (let i = 0; i < 45; i++) g.updateFurnaces(0.2);
  g.ui.refreshFurnace();
  await new Promise(r => setTimeout(r, 60));
  const smelted = st.output ? { id: st.output.id, count: st.output.count } : null;
  const litWhileBurning = w.getBlock(px, py, pz);
  const uiSlots = document.querySelectorAll('#furnace-input .item-cell').length + document.querySelectorAll('#furnace-output .item-cell').length;
  g.updateFurnaces(25);
  const afterBurn = w.getBlock(px, py, pz);
  const saveData = JSON.parse(localStorage.getItem('mc_sandbox_save_v1') || 'null');
  g.saveGame();
  const saved = JSON.parse(localStorage.getItem('mc_sandbox_save_v1'));
  g.closeModal();
  return {
    visible, smelted, litWhileBurning, litBlock: litWhileBurning === B.FURNACE_LIT, afterBurn,
    uiSlots, savedFurnaces: (saved.furnaces || []).length, savedChests: (saved.chests || []).length,
    outputId: MC.I.IRON_INGOT
  };
});

// ---- 动物繁殖 ----
R.animals = await page.evaluate(async () => {
  const g = window.__game, p = g.player;
  const px = Math.floor(p.pos.x), pz = Math.floor(p.pos.z);
  const sheep1 = g.entities.spawnAnimal('sheep', px + 3, g.world.surfaceY(px + 3, pz) + 1.02, pz);
  const sheep2 = g.entities.spawnAnimal('sheep', px + 4.5, g.world.surfaceY(px + 4, pz) + 1.02, pz);
  p.items.set(MC.I.WHEAT, 4);
  p.hotbar[2] = MC.I.WHEAT; p.selectSlot(2);
  const fed1 = p.feedAnimal(sheep1);
  const fed2 = p.feedAnimal(sheep2);
  sheep2.pos.set(sheep1.pos.x + 1.2, sheep1.pos.y, sheep1.pos.z);
  // 目标位置接近后等几帧
  await new Promise(r => setTimeout(r, 1600));
  const babies = g.entities.list.filter(e => e.isAnimal && e.isBaby);
  const baby = babies[0] || null;
  const before = baby ? { scale: +baby.mesh.scale.x.toFixed(2), isBaby: baby.isBaby } : null;
  if (baby) {
    g.nature.day += 2;
    await new Promise(r => setTimeout(r, 500));
  }
  const after = baby ? { scale: +baby.mesh.scale.x.toFixed(2), isBaby: baby.isBaby } : null;
  return { fed1, fed2, love1: +sheep1.love.toFixed(1), love2: +sheep2.love.toFixed(1), babies: babies.length, before, after, adultCount: g.entities.list.filter(e => e.isAnimal && !e.isBaby).length };
});

// 箱子/熔炉/锄头 UI 是否在帮助和配方里
R.recipes = await page.evaluate(() => ({
  recipes: MC.RECIPES.length,
  hasHoe: MC.RECIPES.some(r => r.out.id === MC.I.WOOD_HOE),
  hasChest: MC.RECIPES.some(r => r.out.id === MC.B.CHEST),
  hasFurnace: MC.RECIPES.some(r => r.out.id === MC.B.FURNACE),
  smeltIron: !!MC.smeltOf(MC.B.IRON_ORE),
  smeltMeat: !!MC.smeltOf(MC.I.MEAT),
  fuelCoal: MC.fuelOf(MC.I.COAL)
}));

R.errs = errs.slice(0, 8);
console.log(JSON.stringify(R, null, 1));
await browser.close();